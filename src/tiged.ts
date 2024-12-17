import { EventEmitter } from 'node:events';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import picocolors from 'picocolors';
import {
  cacheDirectoryPath,
  tigedConfigFileName,
  tigedDefaultOptions,
  validModes,
} from './constants.js';
import type {
  Info,
  Options,
  RemoveAction,
  Repo,
  TigedAction,
  ValidModes,
} from './types.js';
import {
  TigedError,
  downloadTarball,
  ensureGitExists,
  exec,
  extractRepositoryInfo,
  extractTarball,
  fetchRefs,
  isDirectory,
  pathExists,
  stashFiles,
  tryRequire,
  unStashFiles,
} from './utils.js';

const { cyan, magenta, red, bold } = picocolors;

/**
 * The {@linkcode Tiged} class is an event emitter
 * that represents the Tiged tool.
 * It is designed for cloning repositories with specific options,
 * handling caching, proxy settings, and more.
 *
 * @extends EventEmitter
 *
 * @public
 */
export class Tiged extends EventEmitter {
  /**
   * Disables the use of cache for operations,
   * ensuring data is always fetched anew.
   */
  declare public disableCache?: boolean;

  /**
   * Forces the operation to proceed, despite non-empty destination directory
   * potentially overwriting existing files.
   */
  declare public force?: boolean;

  /**
   * Enables verbose output for more detailed logging information.
   */
  declare public verbose?: boolean;

  /**
   * Specifies the proxy server to be used for network requests.
   */
  declare public proxy?: string;

  /**
   * Indicates if the repository is a subgroup,
   * affecting repository parsing (Gitlab only).
   */
  declare public subgroup?: boolean;

  /**
   * Specifies a subdirectory within the repository to focus on (Gitlab only).
   */
  declare public subDirectory?: string;

  /**
   * Holds the parsed repository information.
   */
  declare public repo: Repo;

  /**
   * Indicates the mode of operation,
   * which determines how the repository is cloned.
   * Valid modes are `'tar'` and `'git'`.
   */
  declare public mode: ValidModes;

  /**
   * Defines actions for directives such as
   * cloning and removing files or directories.
   */
  declare public directiveActions: {
    clone: (
      repositoryCacheDirectoryPath: string,
      destinationDirectoryPath: string,
      action: TigedAction,
    ) => Promise<void>;

    remove: (
      repositoryCacheDirectoryPath: string,
      destinationDirectoryPath: string,
      action: RemoveAction,
    ) => Promise<void>;
  };

  declare public on: (
    event: 'info' | 'warn',
    callback: (info: Info) => void,
  ) => this;

  /**
   * Flags whether stash operations have been performed to avoid duplication.
   */
  private _hasStashed = false;

  /**
   * Constructs a new {@linkcode Tiged} instance
   * with the specified source and options.
   *
   * @param src - A string representing the repository source. This must be a URL, path, or other descriptor that can be parsed to extract repository information.
   * @param tigedOptions - Optional configuration for Tiged, overriding default options.
   */
  public constructor(
    public src: string,
    tigedOptions: Options = {},
  ) {
    super();

    const resolvedTigedOptions = {
      ...tigedDefaultOptions,
      ...tigedOptions,
      repo: extractRepositoryInfo(src),
      proxy: this._getHttpsProxy(),
    };

    Object.assign(this, resolvedTigedOptions);

    if (this.subgroup) {
      this.repo.subgroup = true;

      this.repo.name = this.repo.subDirectory
        ? (this.repo.subDirectory?.slice(1) ?? '')
        : '';

      this.repo.url += this.repo.subDirectory;

      this.repo.ssh = `${this.repo.ssh + this.repo.subDirectory}.git`;

      if (this.subDirectory) {
        this.repo.subDirectory = this.subDirectory.startsWith('/')
          ? this.subDirectory
          : `/${this.subDirectory}`;
      } else {
        this.repo.subDirectory = '';
      }
    }

    if (!validModes.has(this.mode)) {
      throw new Error(`Valid modes are ${Array.from(validModes).join(', ')}`);
    }

    this.directiveActions = {
      clone: async (
        repositoryCacheDirectoryPath,
        destinationDirectoryPath,
        action,
      ) => {
        if (this._hasStashed === false) {
          await stashFiles(
            repositoryCacheDirectoryPath,
            destinationDirectoryPath,
          );

          this._hasStashed = true;
        }

        const tigedOptions = {
          disableCache:
            action.cache === false
              ? true
              : (this.disableCache ?? tigedDefaultOptions.disableCache),
          force: true,
          verbose:
            action.verbose ?? this.verbose ?? tigedDefaultOptions.verbose,
        };

        const tiged = createTiged(action.src, tigedOptions);

        tiged.on('info', event => {
          console.error(cyan(`> ${event.message?.replace('options.', '--')}`));
        });

        tiged.on('warn', event => {
          console.error(
            magenta(`! ${event.message?.replace('options.', '--')}`),
          );
        });

        try {
          await tiged.clone(destinationDirectoryPath);
        } catch (error) {
          if (error instanceof Error) {
            console.error(red(`! ${error.message}`));

            process.exit(1);
          }
        }
      },

      remove: this.remove.bind(this),
    };
  }

  // Return the HTTPS proxy address. Try to get the value by environment
  // variable `https_proxy` or `HTTPS_PROXY`.
  //
  // TODO allow setting via --proxy. We also need to test this.
  /**
   * Retrieves the HTTPS proxy from the environment variables.
   *
   * @returns The HTTPS proxy value, or `undefined` if not found.
   */
  private _getHttpsProxy(): string | undefined {
    const result = process.env.https_proxy;

    if (!result) {
      return process.env.HTTPS_PROXY;
    }

    return result;
  }

  /**
   * Retrieves the directives from the specified destination.
   *
   * @param dest - The destination path.
   * @returns An array of {@linkcode TigedAction} directives, or `false` if no directives are found.
   */
  private async _getDirectives(dest: string): Promise<false | TigedAction[]> {
    const directivesPath = path.join(dest, tigedConfigFileName);

    const directives =
      (tryRequire(directivesPath, { clearCache: true }) as
        | TigedAction[]
        | undefined) ?? false;

    if (directives) {
      await fs.unlink(directivesPath);
    }

    return directives;
  }

  /**
   * Clones the repository to the specified destination.
   *
   * @param destinationDirectoryName - The destination directory where the repository will be cloned (default: **{@linkcode process.cwd()}**).
   */
  public async clone(
    destinationDirectoryName: string = process.cwd(),
  ): Promise<void> {
    await ensureGitExists();

    const destinationDirectoryPath = path.resolve(destinationDirectoryName);

    await this._checkDirIsEmpty(destinationDirectoryPath);

    const { repo } = this;

    const repositoryCacheDirectoryPath = path.join(
      cacheDirectoryPath,
      repo.site,
      repo.user,
      repo.name,
    );

    if (this.disableCache) {
      this._verbose({
        code: 'NO_CACHE',
        message: `Not using cache. disableCache is set to true.`,
        dest: destinationDirectoryPath,
        repo,
      });
    }

    if (this.mode === 'tar') {
      await this._cloneWithTar(
        repositoryCacheDirectoryPath,
        destinationDirectoryPath,
      );
    } else {
      await this._cloneWithGit(
        repositoryCacheDirectoryPath,
        destinationDirectoryPath,
      );
    }

    this._info({
      code: 'SUCCESS',
      message: `cloned ${bold(`${repo.user}/${repo.name}`)}#${bold(repo.ref)} to ${destinationDirectoryPath}`,
      repo,
      dest: destinationDirectoryPath,
    });

    const directives = await this._getDirectives(destinationDirectoryPath);

    if (directives) {
      for (const directive of directives) {
        // TODO, can this be a loop with an index to pass for better error messages?
        await this.directiveActions[directive.action](
          repositoryCacheDirectoryPath,
          destinationDirectoryPath,
          directive,
        );
      }

      if (this._hasStashed === true) {
        await unStashFiles(
          repositoryCacheDirectoryPath,
          destinationDirectoryPath,
        );
      }
    }
  }

  /**
   * Removes files or directories from a specified destination
   * based on the provided action.
   *
   * @param _repositoryCacheDirectoryPath - The directory path.
   * @param destinationDirectoryPath - The destination path.
   * @param action - The action object containing the files to be removed.
   */
  public async remove(
    _repositoryCacheDirectoryPath: string,
    destinationDirectoryPath: string,
    action: RemoveAction,
  ): Promise<void> {
    const filesToBeRemoved = Array.isArray(action.files)
      ? action.files
      : [action.files];

    const removedFiles: string[] = [];

    for (const fileToBeRemoved of filesToBeRemoved) {
      const fileToBeRemovedPath = path.join(
        destinationDirectoryPath,
        fileToBeRemoved,
      );

      if (await pathExists(fileToBeRemovedPath)) {
        await fs.rm(fileToBeRemovedPath, { recursive: true, force: true });

        removedFiles.push(fileToBeRemoved);
      } else {
        this._warn(
          new TigedError(
            `action wants to remove ${bold(fileToBeRemoved)} but it does not exist`,
            { code: 'FILE_DOES_NOT_EXIST' },
          ),
        );
      }
    }

    if (removedFiles.length > 0) {
      this._info({
        code: 'REMOVED',
        message: `removed: ${bold(removedFiles.map(removedFile => bold(removedFile)).join(', '))}`,
      });
    }
  }

  /**
   * Checks if a directory is empty.
   *
   * @param dir - The directory path to check.
   */
  private async _checkDirIsEmpty(dir: string): Promise<void> {
    try {
      const files = await fs.readdir(dir, { encoding: 'utf-8' });

      if (files.length > 0) {
        if (this.force) {
          this._info({
            code: 'DEST_NOT_EMPTY',
            message: `destination directory is not empty. Using options.force, continuing`,
          });

          await fs.rm(dir, { force: true, recursive: true });
        } else {
          throw new TigedError(
            `destination directory is not empty, aborting. Use options.force to override`,
            {
              code: 'DEST_NOT_EMPTY',
            },
          );
        }
      } else {
        this._verbose({
          code: 'DEST_IS_EMPTY',
          message: `destination directory is empty`,
        });
      }
    } catch (error) {
      if (error instanceof TigedError && error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Emits an `'info'` event with the provided information.
   *
   * @param info - The information to be emitted.
   */
  private _info(info: Info): void {
    this.emit('info', info);
  }

  /**
   * Emits a `'warn'` event with the provided info.
   *
   * @param tigedError - The information to be emitted.
   */
  private _warn(tigedError: TigedError): void {
    this.emit('warn', tigedError);

    if (this.verbose && tigedError.original) {
      this.emit('info', tigedError.original);
    }
  }

  /**
   * Logs the provided {@linkcode info} object
   * if the {@linkcode verbose} flag is set to `true`.
   *
   * @param info - The information to be logged.
   */
  private _verbose(info: Info): void {
    if (this.verbose) {
      this._info(info);
    }
  }

  /**
   * Retrieves the hash for a given repository.
   *
   * @param repo - The repository object.
   * @param cached - The cached records.
   * @returns The hash value.
   */
  private async _getHash(
    repo: Repo,
    cached: Partial<Record<string, string>>,
  ): Promise<string | undefined> {
    try {
      const refs = await fetchRefs(repo);

      if (refs == null) {
        return;
      }

      if (repo.ref === 'HEAD') {
        return refs.find(ref => ref.type === 'HEAD')?.hash ?? '';
      }

      const selectedRef = this._selectRef(refs, repo.ref);
      if (selectedRef) {
        return selectedRef;
      }

      const isCommitHash = /^[0-9a-f]{40}$/.test(repo.ref);
      if (isCommitHash) {
        return repo.ref;
      }

      return;
    } catch (error) {
      if (error instanceof Error) {
        throw new TigedError(error.message, {
          code: 'COULD_NOT_FETCH',
          ref: repo.ref,
          url: repo.url,
          original: error,
        });
      }

      throw error;
    }
  }

  /**
   * Retrieves the commit hash from the cache for the given repository.
   *
   * @param repo - The repository object.
   * @param cached - The cached commit hashes.
   * @returns The commit hash if found in the cache; otherwise, `undefined`.
   */
  private async _getHashFromCache(
    repo: Repo,
    cached: Partial<Record<string, string>>,
  ): Promise<string | undefined> {
    if (!(repo.ref in cached)) {
      return await this._getHash(repo, cached);
    }

    const hash = cached[repo.ref];

    this._info({
      code: 'USING_CACHE',
      message: `using cached commit hash ${hash}`,
    });

    return hash;
  }

  /**
   * Selects a commit hash from an array of references
   * based on a given selector.
   *
   * @param refs - An array of references containing type, name, and hash.
   * @param selector - The selector used to match the desired reference.
   * @returns The commit hash that matches the selector, or `undefined` if no match is found.
   */
  private _selectRef(
    refs: { type: string; name?: string | undefined; hash: string }[],
    selector: string,
  ): string | undefined {
    for (const ref of refs) {
      if (ref.name === selector) {
        this._verbose({
          code: 'FOUND_MATCH',
          message: `found matching commit hash: ${ref.hash}`,
        });

        return ref.hash;
      }
    }

    if (selector.length < 8) {
      return;
    }

    for (const ref of refs) {
      if (ref.hash.startsWith(selector)) {
        return ref.hash;
      }
    }

    return;
  }

  /**
   * Clones the repository specified by {@linkcode repo}
   * into the {@linkcode destinationDirectoryPath} directory using a tarball.
   *
   * @param repositoryCacheDirectoryPath - The directory where the repository is cloned.
   * @param destinationDirectoryPath - The destination directory where the repository will be extracted.
   * @throws A {@linkcode TigedError} If the commit hash for the repository reference cannot be found.
   * @throws A {@linkcode TigedError} If the tarball cannot be downloaded.
   * @returns A {@linkcode Promise | promise} that resolves when the cloning and extraction process is complete.
   */
  private async _cloneWithTar(
    repositoryCacheDirectoryPath: string,
    destinationDirectoryPath: string,
  ): Promise<void> {
    const { repo } = this;

    await fs.mkdir(destinationDirectoryPath, { recursive: true });

    const cached: Partial<Record<string, string>> =
      tryRequire(path.join(repositoryCacheDirectoryPath, 'map.json')) || {};

    const hash = this.disableCache
      ? await this._getHash(repo, cached)
      : await this._getHashFromCache(repo, cached);

    const subDirectory = repo.subDirectory
      ? `${repo.name}-${hash}${repo.subDirectory}`
      : '';

    if (!hash) {
      // TODO 'did you mean...?'
      throw new TigedError(`could not find commit hash for ${repo.ref}`, {
        code: 'MISSING_REF',
        ref: repo.ref,
        url: repo.url,
      });
    }

    const tarballFileName = `${hash}.tar.gz`;

    const tarballFilePath = path.join(
      destinationDirectoryPath,
      tarballFileName,
    );

    const url =
      repo.site === 'gitlab'
        ? `${repo.url}/-/archive/${hash}/${repo.name}-${tarballFileName}`
        : repo.site === 'bitbucket'
          ? `${repo.url}/get/${tarballFileName}`
          : `${repo.url}/archive/${tarballFileName}`;

    if (this.proxy) {
      this._verbose({
        code: 'PROXY',
        message: `using proxy ${this.proxy}`,
      });
    }

    this._verbose({
      code: 'DOWNLOADING',
      message: `downloading ${url} to ${tarballFilePath}`,
    });

    try {
      await downloadTarball(url, tarballFilePath, this.proxy);
    } catch (error) {
      throw new TigedError(`could not download ${url}`, {
        code: 'COULD_NOT_DOWNLOAD',
        url,
        original: error instanceof Error ? error : undefined,
        ref: repo.ref,
      });
    }

    this._verbose({
      code: 'EXTRACTING',
      message: `extracting ${
        subDirectory ? `${repo.subDirectory} from ` : ''
      }${tarballFilePath} to ${destinationDirectoryPath}`,
    });

    const extractedFiles = await extractTarball(
      tarballFilePath,
      destinationDirectoryPath,
      subDirectory,
    );

    if (extractedFiles.length === 0) {
      const noFilesErrorMessage = `No files to extract. ${subDirectory ? 'Make sure you typed in the subdirectory name correctly' : 'The tar file seems to be empty'}.`;

      throw new TigedError(noFilesErrorMessage, {
        code: 'NO_FILES',
        ref: repo.ref,
        url: repo.url,
      });
    }

    await fs.rm(tarballFilePath, { force: true, recursive: true });
  }

  /**
   * Clones the repository using Git.
   *
   * @param _repositoryCacheDirectoryPath - The source directory.
   * @param destinationDirectoryPath - The destination directory.
   */
  private async _cloneWithGit(
    _repositoryCacheDirectoryPath: string,
    destinationDirectoryPath: string,
  ): Promise<void> {
    const { repo } = this;
    const gitPath = repo.url;
    // let gitPath = /https:\/\//.test(repo.src)
    // 	? repo.url
    // 	: repo.ssh;
    // gitPath = repo.site === 'huggingface' ? repo.url : gitPath;
    const isWin = process.platform === 'win32';

    if (repo.subDirectory) {
      this._verbose({
        code: 'EXTRACTING',
        message: `extracting the ${repo.subDirectory} subdirectory from ${gitPath} repo to ${destinationDirectoryPath} directory`,
      });

      const tempDir = path.join(destinationDirectoryPath, '.tiged');

      await fs.mkdir(tempDir, { recursive: true });

      if (isWin) {
        await exec(
          `cd ${tempDir} && git init && git remote add origin ${gitPath} && git fetch --depth 1 origin ${repo.ref} && git checkout FETCH_HEAD`,
        );
      } else if (repo.ref && repo.ref !== 'HEAD' && !isWin) {
        await exec(
          `cd ${tempDir}; git init; git remote add origin ${gitPath}; git fetch --depth 1 origin ${repo.ref}; git checkout FETCH_HEAD`,
        );
      } else {
        await exec(`git clone --depth 1 ${gitPath} ${tempDir}`);
      }

      const tempSubDirectory = path.join(tempDir, repo.subDirectory);

      if (!(await isDirectory(tempSubDirectory))) {
        throw new TigedError(
          'No files to extract. Make sure you typed in the subdirectory name correctly.',
          {
            code: 'NO_FILES',
            ref: repo.ref,
            url: repo.url,
          },
        );
      }

      const filesToExtract = await fs.readdir(tempSubDirectory, {
        encoding: 'utf-8',
      });

      await Promise.all(
        filesToExtract.map(async fileToExtract =>
          fs.rename(
            path.join(tempSubDirectory, fileToExtract),
            path.join(destinationDirectoryPath, fileToExtract),
          ),
        ),
      );

      await fs.rm(tempDir, { recursive: true, force: true });
    } else {
      if (isWin) {
        await fs.mkdir(destinationDirectoryPath, { recursive: true });

        await exec(
          `cd ${destinationDirectoryPath} && git init && git remote add origin ${gitPath} && git fetch --depth 1 origin ${repo.ref} && git checkout FETCH_HEAD`,
        );
      } else if (repo.ref && repo.ref !== 'HEAD' && !isWin) {
        await fs.mkdir(destinationDirectoryPath, { recursive: true });

        await exec(
          `cd ${destinationDirectoryPath}; git init; git remote add origin ${gitPath}; git fetch --depth 1 origin ${repo.ref}; git checkout FETCH_HEAD`,
        );
      } else {
        await exec(
          `git clone --depth 1 ${gitPath} ${destinationDirectoryPath}`,
        );
      }

      const extractedFiles = await fs.readdir(destinationDirectoryPath, {
        encoding: 'utf-8',
      });

      if (extractedFiles.length === 0) {
        throw new TigedError(
          'No files to extract. The git repo seems to be empty',
          {
            code: 'NO_FILES',
            ref: repo.ref,
            url: repo.url,
          },
        );
      }

      await fs.rm(path.join(destinationDirectoryPath, '.git'), {
        force: true,
        recursive: true,
      });
    }
  }
}

/**
 * Creates a new instance of the {@linkcode Tiged} class with
 * the specified source and options.
 *
 * @param src - The source path to clone from.
 * @param tigedOptions - The optional configuration options.
 * @returns A new instance of the {@linkcode Tiged} class.
 *
 * @public
 */
export function createTiged(src: string, tigedOptions?: Options): Tiged {
  return new Tiged(src, tigedOptions);
}
