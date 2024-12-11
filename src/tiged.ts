import { bold, cyan, magenta, red } from 'colorette';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { rimraf } from 'rimraf';
import {
  accessLogsFileName,
  cacheDirectoryName,
  supportedHosts,
  tigedConfigName,
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
  exec,
  isDirectory,
  pathExists,
  stashFiles,
  tryRequire,
  unStashFiles,
  untar,
} from './utils.js';

/**
 * Parses the source URL and returns a {@linkcode Repo} object
 * containing the parsed information.
 *
 * @param src - The source URL to parse.
 * @returns A {@linkcode Repo} object containing the parsed information.
 * @throws A {@linkcode TigedError} If the source URL cannot be parsed.
 *
 * @internal
 */
function extractRepositoryInfo(src: string): Repo {
  const match =
    /^(?:(?:https:\/\/)?([^:/]+\.[^:/]+)\/|git@([^:/]+)[:/]|([^/]+):)?([^/\s]+)\/([^/\s#]+)(?:((?:\/[^/\s#]+)+))?(?:\/)?(?:#(.+))?/.exec(
      src,
    );

  if (!match) {
    throw new TigedError(`could not parse ${src}`, {
      code: 'BAD_SRC',
    });
  }

  const site = match[1] ?? match[2] ?? match[3] ?? 'github.com';
  const topLevelDomainMatch = /\.([a-z]{2,})$/.exec(site);
  const topLevelDomain = topLevelDomainMatch ? topLevelDomainMatch[0] : null;
  const siteName = topLevelDomain
    ? site.replace(new RegExp(`${topLevelDomain}$`), '')
    : site;

  const user = match[4] ?? '';
  const name = match[5]?.replace(/\.git$/, '') ?? '';
  const subDirectory = match[6] ?? '';
  const ref = match[7] ?? 'HEAD';

  const domain = `${siteName}${
    topLevelDomain ?? supportedHosts[siteName] ?? supportedHosts[site] ?? ''
  }`;

  const url = `https://${domain}/${user}/${name}`;
  const ssh = `git@${domain}:${user}/${name}`;

  const mode =
    siteName === 'huggingface'
      ? 'git'
      : supportedHosts[siteName] || supportedHosts[site]
        ? 'tar'
        : 'git';

  return { site: siteName, user, name, ref, url, ssh, subDirectory, mode, src };
}

/**
 * Fetches the references (branches, tags, etc.) from a remote Git repository.
 *
 * @param repo - The repository object containing the URL of the remote repository.
 * @returns An array of objects representing the fetched references, each containing the type, name, and hash.
 * @throws A {@linkcode TigedError} If there is an error fetching the remote repository.
 *
 * @internal
 */
async function fetchRefs(repo: Repo): Promise<
  | (
      | {
          type: string;
          hash: string;
          name?: never;
        }
      | {
          type: string;
          name: string;
          hash: string;
        }
    )[]
  | undefined
> {
  try {
    const { stdout } = await exec(`git ls-remote ${repo.url}`);

    return stdout
      .split('\n')
      .filter(Boolean)
      .map(row => {
        const [hash = '', ref = ''] = row.split('\t');

        if (ref === 'HEAD') {
          return {
            type: 'HEAD',
            hash,
          };
        }

        const match = /refs\/(\w+)\/(.+)/.exec(ref);

        if (!match)
          throw new TigedError(`could not parse ${ref}`, {
            code: 'BAD_REF',
            ref,
            url: repo.url,
          });

        const type =
          match[1] === 'heads'
            ? 'branch'
            : match[1] === 'refs'
              ? 'ref'
              : (match[1] ?? '');

        const name = match[2] ?? '';

        return { type, name, hash };
      });
  } catch (error) {
    if (error instanceof Error) {
      throw new TigedError(`could not fetch remote ${repo.url}`, {
        code: 'COULD_NOT_FETCH',
        url: repo.url,
        original: error,
        ref: repo.ref,
      });
    }

    return;
  }
}

/**
 * Updates the cache with the given repository information.
 *
 * @param dir - The directory path where the cache is located.
 * @param repo - The repository object containing the reference and other details.
 * @param hash - The hash value of the repository.
 * @param cached - The cached records.
 * @returns A {@linkcode Promise | promise} that resolves when the cache is updated.
 *
 * @internal
 */
async function updateCache(
  dir: string,
  repo: Repo,
  hash: string,
  cached: Record<string, string>,
): Promise<void> {
  // update access logs
  const accessLogs: Record<string, string> =
    tryRequire(path.join(dir, accessLogsFileName)) || {};

  accessLogs[repo.ref] = new Date().toISOString();

  await fs.writeFile(
    path.join(dir, accessLogsFileName),
    JSON.stringify(accessLogs, null, 2),
    { encoding: 'utf-8' },
  );

  if (cached[repo.ref] === hash) {
    return;
  }

  const oldHash = cached[repo.ref];

  if (oldHash) {
    let used = false;

    for (const key in cached) {
      if (cached[key] === hash) {
        used = true;
        break;
      }
    }

    if (!used) {
      // we no longer need this tar file
      try {
        await fs.unlink(path.join(dir, `${oldHash}.tar.gz`));
      } catch (error) {
        // ignore
      }
    }
  }

  cached[repo.ref] = hash;

  await fs.writeFile(
    path.join(dir, 'map.json'),
    JSON.stringify(cached, null, 2),
    { encoding: 'utf-8' },
  );
}

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
    clone: (dir: string, dest: string, action: TigedAction) => Promise<void>;
    remove: (dir: string, dest: string, action: RemoveAction) => Promise<void>;
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
   * @param src - The source repository string.
   * @param tigedOptions - Optional parameters to customize the behavior.
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
      clone: async (dir, dest, action) => {
        const absoluteDestination = path.resolve(dest);

        if (this._hasStashed === false) {
          await stashFiles(dir, absoluteDestination);

          this._hasStashed = true;
        }

        const tigedOptions = {
          disableCache: action.cache === false ? true : this.disableCache,
          force: true,
          verbose: action.verbose ?? tigedDefaultOptions.verbose,
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
          await tiged.clone(absoluteDestination);
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
    const directivesPath = path.resolve(dest, tigedConfigName);

    const directives: TigedAction[] | false =
      tryRequire(directivesPath, { clearCache: true }) || false;

    if (directives) {
      await fs.unlink(directivesPath);
    }

    return directives;
  }

  /**
   * Clones the repository to the specified destination.
   *
   * @param dest - The destination directory where the repository will be cloned (default: `'.'`).
   */
  public async clone(dest: string): Promise<void> {
    try {
      await exec('git --version');
    } catch (error) {
      throw new TigedError(
        'could not find git. Make the directory of your git executable is found in your PATH environment variable.',
        {
          code: 'MISSING_GIT',
          original: error instanceof Error ? error : undefined,
        },
      );
    }

    const absoluteDestination = path.resolve(dest);

    await this._checkDirIsEmpty(absoluteDestination);

    const { repo } = this;

    const dir = path.join(cacheDirectoryName, repo.site, repo.user, repo.name);

    if (this.mode === 'tar') {
      await this._cloneWithTar(dir, absoluteDestination);
    } else {
      await this._cloneWithGit(dir, absoluteDestination);
    }

    this._info({
      code: 'SUCCESS',
      message: `cloned ${bold(`${repo.user}/${repo.name}`)}#${bold(repo.ref)}${
        dest !== '.' ? ` to ${dest}` : ''
      }`,
      repo,
      dest: absoluteDestination,
    });

    const directives = await this._getDirectives(absoluteDestination);

    if (directives) {
      for (const directive of directives) {
        // TODO, can this be a loop with an index to pass for better error messages?
        await this.directiveActions[directive.action](
          dir,
          absoluteDestination,
          directive,
        );
      }

      if (this._hasStashed === true) {
        await unStashFiles(dir, absoluteDestination);
      }
    }
  }

  /**
   * Removes files or directories from a specified destination
   * based on the provided action.
   *
   * @param _dir - The directory path.
   * @param dest - The destination path.
   * @param action - The action object containing the files to be removed.
   */
  public async remove(
    _dir: string,
    dest: string,
    action: RemoveAction,
  ): Promise<void> {
    const filesToBeRemoved = Array.isArray(action.files)
      ? action.files
      : [action.files];

    const absoluteDestination = path.resolve(dest);

    const removedFiles: string[] = [];

    for (const file of filesToBeRemoved) {
      const filePath = path.resolve(absoluteDestination, file);

      if (await pathExists(filePath)) {
        const isDir = await isDirectory(filePath);

        if (isDir) {
          await rimraf(filePath);

          removedFiles.push(`${file}/`);
        } else {
          await fs.unlink(filePath);

          removedFiles.push(file);
        }
      } else {
        this._warn(
          new TigedError(
            `action wants to remove ${bold(file)} but it does not exist`,
            { code: 'FILE_DOES_NOT_EXIST' },
          ),
        );
      }
    }

    if (removedFiles.length > 0) {
      this._info({
        code: 'REMOVED',
        message: `removed: ${bold(removedFiles.map(d => bold(d)).join(', '))}`,
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

          await rimraf(dir);
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
    cached: Record<string, string>,
  ): Promise<string | undefined> {
    try {
      const refs = await fetchRefs(repo);

      if (refs == null) {
        return;
      }

      if (repo.ref === 'HEAD') {
        return refs?.find(ref => ref.type === 'HEAD')?.hash ?? '';
      }

      return this._selectRef(refs, repo.ref);
    } catch (error) {
      if (
        error instanceof TigedError &&
        'code' in error &&
        'message' in error
      ) {
        this._warn(error);
      }

      return;
    }
  }

  /**
   * Retrieves the commit hash from the cache for the given repository.
   *
   * @param repo - The repository object.
   * @param cached - The cached commit hashes.
   * @returns The commit hash if found in the cache; otherwise, `undefined`.
   */
  private _getHashFromCache(
    repo: Repo,
    cached: Record<string, string>,
  ): string | undefined {
    if (!(repo.ref in cached)) {
      return;
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
    refs: { type: string; name?: string; hash: string }[],
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
   * into the {@linkcode dest} directory using a tarball.
   *
   * @param dir - The directory where the repository is cloned.
   * @param dest - The destination directory where the repository will be extracted.
   * @throws A {@linkcode TigedError} If the commit hash for the repository reference cannot be found.
   * @throws A {@linkcode TigedError} If the tarball cannot be downloaded.
   * @returns A {@linkcode Promise | promise} that resolves when the cloning and extraction process is complete.
   */
  private async _cloneWithTar(dir: string, dest: string): Promise<void> {
    const { repo } = this;

    const cached: Record<string, string> =
      tryRequire(path.join(dir, 'map.json')) || {};

    const hash = this.disableCache
      ? await this._getHash(repo, cached)
      : this._getHashFromCache(repo, cached);

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

    const tarballFilePath = path.join(dir, tarballFileName);

    const url =
      repo.site === 'gitlab'
        ? `${repo.url}/-/archive/${hash}/${repo.name}-${tarballFileName}`
        : repo.site === 'bitbucket'
          ? `${repo.url}/get/${tarballFileName}`
          : `${repo.url}/archive/${tarballFileName}`;

    try {
      if (this.disableCache) {
        try {
          if (this.disableCache) {
            this._verbose({
              code: 'NO_CACHE',
              message: `Not using cache. disableCache set to true.`,
            });

            throw "don't use cache";
          }

          await fs.stat(tarballFilePath);

          this._verbose({
            code: 'FILE_EXISTS',
            message: `${tarballFilePath} already exists locally`,
          });
        } catch (error) {
          // Not getting file from cache. Either because there is no cached tar or because option no cache is set to true.
          await fs.mkdir(dir, { recursive: true });

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

          await downloadTarball(url, tarballFilePath, this.proxy);
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new TigedError(`could not download ${url}`, {
          code: 'COULD_NOT_DOWNLOAD',
          url,
          original: error,
          ref: repo.ref,
        });
      }
    }

    if (!this.disableCache) {
      await updateCache(dir, repo, hash, cached);
    }

    this._verbose({
      code: 'EXTRACTING',
      message: `extracting ${
        subDirectory ? `${repo.subDirectory} from ` : ''
      }${tarballFilePath} to ${dest}`,
    });

    await fs.mkdir(dest, { recursive: true });

    const extractedFiles = await untar(tarballFilePath, dest, subDirectory);

    if (extractedFiles.length === 0) {
      const noFilesErrorMessage: string = subDirectory
        ? 'No files to extract. Make sure you typed in the subdirectory name correctly.'
        : 'No files to extract. The tar file seems to be empty';

      throw new TigedError(noFilesErrorMessage, {
        code: 'NO_FILES',
        ref: repo.ref,
        url: repo.url,
      });
    }

    if (this.disableCache) {
      await rimraf(tarballFilePath);
    }
  }

  /**
   * Clones the repository using Git.
   *
   * @param _dir - The source directory.
   * @param dest - The destination directory.
   */
  private async _cloneWithGit(_dir: string, dest: string): Promise<void> {
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
        message: `extracting the ${repo.subDirectory} subdirectory from ${gitPath} repo to ${dest} directory`,
      });

      const tempDir = path.join(dest, '.tiged');

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
        filesToExtract.map(async file =>
          fs.rename(path.join(tempSubDirectory, file), path.join(dest, file)),
        ),
      );

      await rimraf(tempDir);
    } else {
      if (isWin) {
        await fs.mkdir(dest, { recursive: true });

        await exec(
          `cd ${dest} && git init && git remote add origin ${gitPath} && git fetch --depth 1 origin ${repo.ref} && git checkout FETCH_HEAD`,
        );
      } else if (repo.ref && repo.ref !== 'HEAD' && !isWin) {
        await fs.mkdir(dest, { recursive: true });

        await exec(
          `cd ${dest}; git init; git remote add origin ${gitPath}; git fetch --depth 1 origin ${repo.ref}; git checkout FETCH_HEAD`,
        );
      } else {
        await exec(`git clone --depth 1 ${gitPath} ${dest}`);
      }

      const extractedFiles = await fs.readdir(dest, { encoding: 'utf-8' });

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

      await rimraf(path.resolve(dest, '.git'));
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
