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
  getOldHash,
  isDirectory,
  pathExists,
  stashFiles,
  tryRequire,
  unStashFiles,
} from './utils.js';

const { bold, cyan, magenta, red } = picocolors;

/**
 * The {@linkcode Tiged} class is an {@linkcode EventEmitter}
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
   * affecting repository parsing (GitLab only).
   */
  declare public subgroup?: boolean;

  /**
   * Specifies a subdirectory within the repository to focus on (GitLab only).
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
  private hasStashed = false;

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
    };

    Object.assign(this, resolvedTigedOptions);

    if (this.subgroup) {
      this.repo.subgroup = true;

      this.repo.name = this.repo.subDirectory
        ? this.repo.subDirectory.slice(1) || ''
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

    this.directiveActions = {
      clone: async (
        repositoryCacheDirectoryPath,
        destinationDirectoryPath,
        action,
      ) => {
        if (!this.hasStashed) {
          await stashFiles(
            repositoryCacheDirectoryPath,
            destinationDirectoryPath,
          );

          this.hasStashed = true;
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

  /**
   * Retrieves the directives from the specified destination.
   *
   * @param destinationDirectoryPath - The destination path.
   * @returns An array of {@linkcode TigedAction} directives, or `false` if no directives are found.
   */
  private async getDirectives(
    destinationDirectoryPath: string,
  ): Promise<false | TigedAction[]> {
    const directivesPath = path.join(
      destinationDirectoryPath,
      tigedConfigFileName,
    );

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

    await this.checkDirIsEmpty(destinationDirectoryPath);

    const { repo } = this;

    const repositoryCacheDirectoryPath = path.join(
      cacheDirectoryPath,
      this.mode,
      repo.site,
      repo.user,
      repo.name,
    );

    await fs.mkdir(repositoryCacheDirectoryPath, { recursive: true });

    if (this.disableCache) {
      this.logVerbose({
        code: 'NO_CACHE',
        message: `Not using cache. disableCache is set to true.`,
        dest: destinationDirectoryPath,
        repo,
      });
    }

    switch (this.mode) {
      case 'tar':
        if (this.repo.site === 'huggingface') {
          this.logVerbose({
            code: 'HUGGING_FACE',
            message: `Cannot clone Hugging Face using ${this.mode} mode. falling back to git mode`,
          });

          await this.cloneWithGit(
            repositoryCacheDirectoryPath,
            destinationDirectoryPath,
          );
        } else {
          await this.cloneWithTar(
            repositoryCacheDirectoryPath,
            destinationDirectoryPath,
          );
        }

        break;

      case 'git':
        await this.cloneWithGit(
          repositoryCacheDirectoryPath,
          destinationDirectoryPath,
        );

        break;

      default:
        throw new Error(`Valid modes are ${Array.from(validModes).join(', ')}`);
    }

    this.info({
      code: 'SUCCESS',
      message: `cloned ${bold(`${repo.user}/${repo.name}`)}#${bold(repo.ref)} to ${destinationDirectoryPath}`,
      repo,
      dest: destinationDirectoryPath,
    });

    const directives = await this.getDirectives(destinationDirectoryPath);

    if (directives) {
      for (const directive of directives) {
        // TODO, can this be a loop with an index to pass for better error messages?
        await this.directiveActions[directive.action](
          repositoryCacheDirectoryPath,
          destinationDirectoryPath,
          directive,
        );
      }

      if (this.hasStashed) {
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

    await Promise.all(
      filesToBeRemoved.map(async fileToBeRemoved => {
        const fileToBeRemovedPath = path.join(
          destinationDirectoryPath,
          fileToBeRemoved,
        );

        if (await pathExists(fileToBeRemovedPath)) {
          await fs.rm(fileToBeRemovedPath, {
            force: true,
            recursive: true,
          });

          removedFiles.push(fileToBeRemoved);
        } else {
          this.warn(
            new TigedError(
              `action wants to remove ${bold(fileToBeRemoved)} but it does not exist`,
              { code: 'FILE_DOES_NOT_EXIST' },
            ),
          );
        }
      }),
    );

    if (removedFiles.length > 0) {
      this.info({
        code: 'REMOVED',
        message: `removed: ${bold(removedFiles.map(removedFile => bold(removedFile)).join(', '))}`,
      });
    }
  }

  /**
   * Checks if a directory is empty.
   *
   * @param directoryPath - The directory path to check.
   */
  private async checkDirIsEmpty(directoryPath: string): Promise<void> {
    try {
      const files = await fs.readdir(directoryPath, {
        encoding: 'utf-8',
      });

      if (files.length > 0) {
        if (this.force) {
          this.info({
            code: 'DEST_NOT_EMPTY',
            message: `destination directory is not empty. Using options.force, continuing`,
          });

          await fs.rm(directoryPath, {
            force: true,
            recursive: true,
          });
        } else {
          throw new TigedError(
            `destination directory is not empty, aborting. Use options.force to override`,
            {
              code: 'DEST_NOT_EMPTY',
              ref: this.repo.ref,
              url: this.repo.url,
            },
          );
        }
      } else {
        this.logVerbose({
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
   * Emits an {@linkcode Info | info} event with the provided information.
   *
   * @param info - The information to be emitted.
   */
  private info(info: Info): void {
    this.emit('info', info);
  }

  /**
   * Emits a `'warn'` event with the provided info.
   *
   * @param tigedError - The information to be emitted.
   */
  private warn(tigedError: TigedError): void {
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
  private logVerbose(info: Info): void {
    if (this.verbose) {
      this.info(info);
    }
  }

  /**
   * Retrieves the hash for a given repository.
   *
   * @param repo - The repository object.
   * @param cached - The cached records.
   * @returns The hash value.
   */
  private async getHash(
    repo: Repo,
    cached: Partial<Record<string, string>>,
  ): Promise<string | undefined> {
    try {
      const refs = await fetchRefs(repo);

      if (repo.ref === 'HEAD') {
        const hash = refs.find(ref => ref.type === 'HEAD')?.hash ?? '';

        return hash;
      }

      const hash = this.selectRef(refs, repo.ref);

      if (!hash) {
        return await getOldHash(repo);
      }

      return hash;
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
  private async getHashFromCache(
    repo: Repo,
    cached: Partial<Record<string, string>>,
  ): Promise<string | undefined> {
    if (!(repo.ref in cached)) {
      return await this.getHash(repo, cached);
    }

    const hash = cached[repo.ref];

    this.info({
      code: 'USING_CACHE',
      message: `using cached commit hash ${hash ?? 'unknown'}`,
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
  private selectRef(
    refs: { type: string; name?: string | undefined; hash: string }[],
    selector: string,
  ): string | undefined {
    for (const ref of refs) {
      if (ref.name === selector) {
        this.logVerbose({
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
  private async cloneWithTar(
    repositoryCacheDirectoryPath: string,
    destinationDirectoryPath: string,
  ): Promise<void> {
    const { repo } = this;

    await fs.mkdir(destinationDirectoryPath, { recursive: true });

    const cached: Partial<Record<string, string>> =
      tryRequire(path.join(repositoryCacheDirectoryPath, 'map.json')) || {};

    const hash = this.disableCache
      ? await this.getHash(repo, cached)
      : await this.getHashFromCache(repo, cached);

    if (!hash) {
      // TODO 'did you mean...?'
      throw new TigedError(`could not find commit hash for ${repo.ref}`, {
        code: 'MISSING_REF',
        ref: repo.ref,
        url: repo.url,
      });
    }

    const subDirectory = repo.subDirectory
      ? `${repo.name}-${hash}${repo.subDirectory}`
      : '';

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
      this.logVerbose({
        code: 'PROXY',
        message: `using proxy ${this.proxy}`,
      });
    }

    this.logVerbose({
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

    this.logVerbose({
      code: 'EXTRACTING',
      message: `extracting ${
        subDirectory ? `the ${repo.subDirectory} sub-directory from ` : ''
      }${tarballFilePath} to ${destinationDirectoryPath}.`,
    });

    const extractedFiles = await extractTarball(
      tarballFilePath,
      destinationDirectoryPath,
      subDirectory,
    );

    if (extractedFiles.length === 0) {
      const noFilesErrorMessage = `No files to extract. ${subDirectory ? 'Make sure you typed in the sub-directory name correctly' : 'The tar file seems to be empty'}.`;

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
  private async cloneWithGit(
    _repositoryCacheDirectoryPath: string,
    destinationDirectoryPath: string,
  ): Promise<void> {
    const { repo } = this;

    const { subDirectory, url } = repo;

    const ref = repo.ref.includes('#')
      ? repo.ref.split('#').reverse().join(' ')
      : repo.ref;

    const isWindows = process.platform === 'win32';

    this.logVerbose({
      code: 'EXTRACTING',
      message: `extracting ${
        subDirectory ? `the ${subDirectory} sub-directory from ` : ''
      }${url} to ${destinationDirectoryPath}.`,
    });

    const cloneRepoDestination = subDirectory
      ? path.join(destinationDirectoryPath, '.tiged')
      : destinationDirectoryPath;

    await fs.mkdir(cloneRepoDestination, { recursive: true });

    if (isWindows) {
      await exec(
        `cd ${cloneRepoDestination} && git init && git remote add origin ${url} && git fetch --depth 1 origin ${ref} && git checkout FETCH_HEAD`,
      );
    } else if (ref && ref !== 'HEAD') {
      await exec(
        `cd ${cloneRepoDestination}; git init; git remote add origin ${url}; git fetch --depth 1 origin ${ref}; git checkout FETCH_HEAD`,
      );
    } else {
      await exec(`git clone --depth 1 ${url} ${cloneRepoDestination}`);
    }

    await fs.rm(path.join(cloneRepoDestination, '.git'), {
      force: true,
      recursive: true,
    });

    if (subDirectory) {
      const tempSubDirectory = path.join(cloneRepoDestination, subDirectory);

      if (!(await isDirectory(tempSubDirectory))) {
        throw new TigedError(
          'No files to extract. Make sure you typed in the sub-directory name correctly.',
          {
            code: 'NO_FILES',
            ref: repo.ref,
            url,
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

      await fs.rm(cloneRepoDestination, { force: true, recursive: true });
    }

    const extractedFiles = await fs.readdir(destinationDirectoryPath, {
      encoding: 'utf-8',
    });

    if (extractedFiles.length === 0) {
      const noFilesErrorMessage = `No files to extract. ${repo.subDirectory ? 'Make sure you typed in the sub-directory name correctly' : 'The tar file seems to be empty'}.`;

      throw new TigedError(noFilesErrorMessage, {
        code: 'NO_FILES',
        ref: repo.ref,
        url,
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
