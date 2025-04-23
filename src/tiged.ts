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
  RemoveAction,
  Repo,
  TigedAction,
  TigedOptions,
  ValidModes,
} from './types.js';
import {
  TigedError,
  addLeadingSlashIfMissing,
  downloadTarball,
  ensureGitExists,
  executeCommand,
  extractRepositoryInfo,
  extractTarball,
  fetchRefs,
  getOldHash,
  pathExists,
  stashFiles,
  tryRequire,
  unStashFiles,
} from './utils.js';

const { bold, cyanBright, red, greenBright, blue, magentaBright } = picocolors;

/**
 * The {@linkcode Tiged} class is a tool for cloning repositories
 * with customizable options.
 *
 * It supports features like {@linkcode disableCache | caching control},
 * {@linkcode proxy | proxy configuration},
 * {@linkcode subgroup} and
 * {@linkcode subDirectory | sub-directory} handling,
 * and automated repository manipulation using
 * **`degit.json`** actions. As an extension of {@linkcode EventEmitter},
 * it emits **`info`** and **`warn`** events for logging and debugging.
 *
 * @example
 *
 * ```ts
 * import { Tiged } from 'tiged';
 *
 * const tiged = new Tiged('user/repo', { verbose: true });
 *
 * await tiged.clone('/destination');
 * ```
 *
 * @extends EventEmitter
 *
 * @public
 * @since 3.0.0
 */
export class Tiged extends EventEmitter {
  /**
   * Disables the use of cache for operations,
   * ensuring data is always fetched anew.
   *
   * **CLI-Equivalent**: **`-D`**, **`--disable-cache`**, **`--disableCache`**
   *
   * @default false
   */
  declare public disableCache?: boolean;

  /**
   * Forces the operation to proceed, even if the
   * destination directory is non-empty,
   * potentially overwriting existing files.
   *
   * This option enables the {@linkcode clone | cloning}
   * operation to bypass safety checks that would otherwise prevent
   * overwriting files in the destination directory, ensuring the operation
   * continues without manual intervention.
   *
   * **CLI-Equivalent**: **`-f`**, **`--force`**
   *
   * @default false
   */
  declare public force?: boolean;

  /**
   * Enables verbose output for more detailed logging information.
   *
   * **CLI-Equivalent**: **`-v`**, **`--verbose`**
   *
   * @default false
   */
  declare public verbose?: boolean;

  /**
   * Specifies the proxy server to be used for network requests.
   *
   * This option allows routing network traffic through a
   * specified proxy server, which can be useful in environments
   * with restricted internet access or for debugging purposes.
   *
   * **CLI-Equivalent**: **`-p`**, **`--proxy`**
   *
   * @default process.env.https_proxy || process.env.HTTPS_PROXY
   */
  declare public proxy?: string;

  /**
   * Specifies whether to retrieve a repository that includes
   * a subgroup (specific to **GitLab**).
   *
   * **CLI-Equivalent**: **`-s`**, **`--subgroup`**
   *
   * @default false
   */
  declare public subgroup?: boolean;

  /**
   * Specifies a sub-directory within the repository to clone and extract.
   *
   * If this property is set, the cloning process will focus only on the
   * specified sub-directory of the repository rather than the
   * entire repository. The contents of the specified sub-directory
   * will be extracted to the target destination directory.
   * This can be useful for working with monorepos or
   * repositories where only a portion of the content is needed.
   *
   * If not specified, the entire repository will be cloned.
   *
   * **CLI-Equivalent**: **`-d`**, **`--sub-directory`**, **`--subDirectory`**
   *
   * @default undefined
   */
  declare public subDirectory?: string;

  /**
   * Holds the parsed repository information.
   *
   * This property contains details about the repository,
   * such as its {@linkcode Repo.url | URL}, {@linkcode Repo.name | name},
   * branch or tag {@linkcode Repo.ref | reference},
   * and other metadata. It is derived from the {@linkcode src}
   * parameter provided during the instance initialization.
   */
  declare public repo: Repo;

  /**
   * Specifies the mode of operation,
   * which determines how the repository is cloned.
   *
   * Possible values are:
   *
   * - **`'tar'`**: Downloads the repository as a tarball.
   * - **`'git'`**: Clones the repository using Git.
   *
   * **CLI-Equivalent**: **`-m`**, **`--mode`**, **`--mode=git`**
   *
   * @default 'tar'
   */
  declare public mode: ValidModes;

  /**
   * The file path to the temporary directory.
   *
   * This directory is utilized for storing temporary files during operations
   * such as {@linkcode stashFiles | stashing} and
   * {@linkcode unStashFiles | un-stashing} while working with directives.
   * It serves as a workspace for intermediate data and ensures
   * that the main working directory remains unaffected.
   */
  declare public tempDirectoryPath: string;

  /**
   * Registers an event listener for specific events,
   * such as **`info`** or **`warn`**.
   *
   * @param event - The event type to listen for. Can be either **`info`** or **`warn`**.
   * @param callback - A function that will be executed when the specified event is triggered, receiving an **`info`** object as its argument.
   * @returns The current instance to allow method chaining.
   *
   * @example
   *
   * ```ts
   * tiged.on('info', (info) => {
   *   console.log('Info event triggered:', info);
   * });
   * ```
   */
  declare public on: (
    event: 'info' | 'warn',
    callback: (info: Info) => void,
  ) => this;

  /**
   * Flags whether {@linkcode stashFiles | stash} operations
   * have been performed to avoid duplication.
   *
   * @remarks
   * This property is used internally to track if a
   * {@linkcode stashFiles | stash} operation has already been executed,
   * preventing repeated or redundant stash actions
   * within the same workflow.
   */
  private hasStashed = false;

  /**
   * Defines actions for processing directives,
   * such as {@linkcode Tiged.clone | cloning}
   * and {@linkcode Tiged.remove | removing}
   * files or directories.
   *
   * Actions allow manipulation of repositories after they have
   * been cloned, as specified in the **`degit.json`** file
   * located at the top level of the working directory.
   * These actions enable automated repository customization,
   * such as extracting specific files or removing unwanted content.
   *
   * Currently, two actions are supported:
   *
   * - **{@linkcode Tiged.clone | clone}**: Copies repository files from a cache directory to a target destination.
   * - **{@linkcode Tiged.remove | remove}**: Removes specified files or directories from the target destination.
   */
  public readonly directiveActions = {
    /**
     * Executes the `clone` action to clone another
     * repository into the working directory.
     *
     * The `clone` action, as defined in the **`degit.json`** file,
     * allows you to clone an additional repository into the current
     * working directory without overwriting its existing contents.
     * This is particularly useful for injecting starter files,
     * additional configuration, or documentation (e.g., a new `README.md`)
     * into a repository that you do not control.
     *
     * The cloned repository may itself contain a **`degit.json`**
     * file with further actions, enabling nested customization workflows.
     *
     * @param _repositoryCacheDirectoryPath - The absolute path to the cache directory where the cloned repository is temporarily stored.
     * @param destinationDirectoryPath - The absolute path to the working directory where the cloned repository's contents will be added.
     * @param action - An object defining the parameters for the `clone` action, including the `src` field, which specifies the source repository to clone (e.g., `"user/another-repo"`).
     * @returns A {@linkcode Promise | promise} that resolves when the cloning process is complete or rejects with an error if the cloning operation fails.
     *
     * @example
     * <caption>#### Usage in **`degit.json`**</caption>
     *
     * ```json
     * [
     *   {
     *     "action": "clone",
     *     "src": "user/another-repo"
     *   }
     * ]
     * ```
     */
    clone: async (
      _repositoryCacheDirectoryPath: string,
      destinationDirectoryPath: string,
      action: TigedAction,
    ): Promise<void> => {
      if (!this.hasStashed) {
        await stashFiles(this.tempDirectoryPath, destinationDirectoryPath);

        this.hasStashed = true;
      }

      const tigedOptions = {
        disableCache:
          action.cache === false
            ? true
            : (this.disableCache ?? tigedDefaultOptions.disableCache),
        force: true,
        verbose: action.verbose ?? this.verbose ?? tigedDefaultOptions.verbose,
      };

      const tiged = createTiged(action.src, tigedOptions);

      tiged.on('info', event => {
        console.error(
          cyanBright(`> ${event.message?.replace('options.', '--') ?? ''}`),
        );
      });

      tiged.on('warn', event => {
        console.error(
          magentaBright(`! ${event.message?.replace('options.', '--') ?? ''}`),
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

    /**
     * Executes the `remove` action to delete specified files or
     * directories from the working directory.
     *
     * The `remove` action, as defined in the **`degit.json`** file,
     * allows you to remove specific files or directories from
     * the working directory after cloning a repository. This is useful
     * for cleaning up unnecessary files, such as licenses, example files,
     * or other content that should not be included in the final output.
     *
     * @param _repositoryCacheDirectoryPath - The absolute path to the cache directory where the repository is temporarily stored.
     * @param destinationDirectoryPath - The absolute path to the working directory where the files or directories will be removed.
     * @param action - An object defining the parameters for the `remove` action, including the `files` field specifying an array of file or directory paths to remove.
     * @returns A {@linkcode Promise | promise} that resolves when the specified files or directories have been successfully removed or rejects with an error if the removal operation fails.
     *
     * @example
     * <caption>#### Usage in **`degit.json`**</caption>
     *
     * ```json
     * [
     *   {
     *     "action": "remove",
     *     "files": ["LICENSE", "examples/"]
     *   }
     * ]
     * ```
     *
     * @remarks
     *
     * The {@linkcode RemoveAction.files | files} field specifies an
     * array of paths to files or directories
     * to be removed. These paths are relative to the
     * {@linkcode destinationDirectoryPath}.
     */
    remove: this.remove.bind(this),
  };

  /**
   * Constructs a new {@linkcode Tiged} instance with the
   * specified source and options.
   *
   * @param src - A string representing the repository source. This must be a URL, path, or other descriptor that can be parsed to extract repository information.
   * @param tigedOptions - Optional configuration for {@linkcode Tiged}, allowing customization of default behaviors such as {@linkcode disableCache | caching}, {@linkcode verbose | verbosity}, and repository extraction options.
   *
   * @example
   *
   * ```ts
   * import { Tiged } from 'tiged';
   *
   * const tiged = new Tiged('user/repo', { verbose: true });
   *
   * await tiged.clone('/destination');
   * ```
   */
  public constructor(
    public src: string,
    tigedOptions: TigedOptions = {},
  ) {
    super();

    const resolvedTigedOptions = {
      ...tigedDefaultOptions,
      ...tigedOptions,
    };

    const subDirectory = addLeadingSlashIfMissing(
      resolvedTigedOptions.subDirectory,
    );

    const repo = extractRepositoryInfo(
      src,
      resolvedTigedOptions.subgroup,
      subDirectory,
    );

    Object.assign(this, resolvedTigedOptions, {
      repo,
      subDirectory,
    });

    if (!this.subgroup) {
      this.subDirectory = this.repo.subDirectory;
    }

    this.repo.subDirectory = this.subDirectory || this.repo.subDirectory;
  }

  /**
   * Retrieves the directives from the specified destination.
   *
   * @param destinationDirectoryPath - The destination path.
   * @returns An array of {@linkcode TigedAction} directives, or `false` if no directives are found.
   */
  private async getDirectives(
    destinationDirectoryPath: string,
  ): Promise<false | (TigedAction | RemoveAction)[]> {
    const directivesPath = path.join(
      destinationDirectoryPath,
      tigedConfigFileName,
    );

    const directives =
      (tryRequire(directivesPath, { clearCache: true }) as
        | (TigedAction | RemoveAction)[]
        | undefined) ?? false;

    if (directives) {
      const tempDirectoryPath = await fs.mkdtemp(
        `${path.join(cacheDirectoryPath)}/`,
        { encoding: 'utf-8' },
      );

      this.tempDirectoryPath = tempDirectoryPath;

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
      repo.site,
      repo.user,
      repo.name,
    );

    await fs.mkdir(repositoryCacheDirectoryPath, { recursive: true });

    if (this.disableCache) {
      this.logVerbose({
        code: 'NO_CACHE',
        message: `Not using cache. ${bold('disableCache')} is set to ${greenBright('true')}.`,
        dest: destinationDirectoryPath,
        repo,
      });
    }

    switch (this.mode) {
      case 'tar':
        if (this.repo.site === 'huggingface') {
          this.logVerbose({
            code: 'HUGGING_FACE',
            message: `Cannot clone Hugging Face using ${bold(greenBright(this.mode))} mode. falling back to ${bold(greenBright('git'))} mode`,
            dest: destinationDirectoryPath,
            repo,
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
      message: `cloned ${bold(`${repo.user}/${repo.name}`)}#${bold(repo.ref)} to ${bold(blue(destinationDirectoryPath))}`,
      repo,
      dest: destinationDirectoryPath,
    });

    const directives = await this.getDirectives(destinationDirectoryPath);

    if (!directives) {
      return;
    }

    for (const directive of directives) {
      // TODO, can this be a loop with an index to pass for better error messages?
      await this.directiveActions[directive.action](
        repositoryCacheDirectoryPath,
        destinationDirectoryPath,
        directive as never,
      );
    }

    if (this.hasStashed) {
      await unStashFiles(this.tempDirectoryPath, destinationDirectoryPath);
    }

    await fs.rm(this.tempDirectoryPath, { force: true, recursive: true });
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
              `action wants to remove ${red(bold(fileToBeRemoved))} but it does not exist`,
              {
                code: 'FILE_DOES_NOT_EXIST',
                ref: this.repo.ref,
                url: this.repo.url,
              },
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
            message: `destination directory is not empty. Using ${bold('options.force')}, continuing`,
            dest: directoryPath,
            repo: this.repo,
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
          dest: directoryPath,
          repo: this.repo,
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

      if (hash) {
        return hash;
      }

      const isCommitHash = /^[0-9a-f]{40}$/.test(repo.ref);
      if (isCommitHash) {
        return repo.ref;
      }

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
    refs: { type: string; name: string; hash: string }[],
    selector: string,
  ): string | undefined {
    for (const ref of refs) {
      if (ref.name === selector) {
        this.logVerbose({
          code: 'FOUND_MATCH',
          message: `found matching commit hash: ${blue(ref.hash)}`,
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

    const subDirectory = this.subDirectory
      ? `${repo.name}-${hash}${this.subDirectory}`
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
        message: `using proxy ${bold(this.proxy)}`,
        dest: destinationDirectoryPath,
        repo,
      });
    }

    this.logVerbose({
      code: 'DOWNLOADING',
      message: `downloading ${bold(url)} to ${bold(tarballFilePath)}\n`,
      dest: destinationDirectoryPath,
      repo,
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
        subDirectory ? `the ${bold(subDirectory)} sub-directory from ` : ''
      }${bold(tarballFilePath)} to ${bold(destinationDirectoryPath)}.\n`,
      dest: destinationDirectoryPath,
      repo,
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
    const { repo, subDirectory } = this;

    const { url } = repo;

    const ref = repo.ref.includes('#')
      ? repo.ref.split('#').reverse().join(' ')
      : repo.ref;

    const isWindows = process.platform === 'win32';

    this.logVerbose({
      code: 'EXTRACTING',
      message: `extracting ${
        subDirectory ? `the ${bold(subDirectory)} sub-directory from ` : ''
      }${bold(url)} to ${bold(destinationDirectoryPath)}.\n`,
      dest: destinationDirectoryPath,
      repo,
    });

    const cloneRepoDestination = subDirectory
      ? path.join(destinationDirectoryPath, '.tiged')
      : destinationDirectoryPath;

    await fs.mkdir(cloneRepoDestination, { recursive: true });

    if (isWindows) {
      await executeCommand(
        `cd ${cloneRepoDestination} && git init && git remote add origin ${url} && git fetch --depth 1 origin ${ref} && git checkout FETCH_HEAD`,
      );
    } else if (ref && ref !== 'HEAD') {
      await executeCommand(
        `cd ${cloneRepoDestination}; git init; git remote add origin ${url}; git fetch --depth 1 origin ${ref}; git checkout FETCH_HEAD`,
      );
    } else {
      await executeCommand(
        `git clone --depth 1 ${url} ${cloneRepoDestination}`,
      );
    }

    await fs.rm(path.join(cloneRepoDestination, '.git'), {
      force: true,
      recursive: true,
    });

    if (subDirectory) {
      const tempSubDirectory = path.join(cloneRepoDestination, subDirectory);

      if (!(await pathExists(tempSubDirectory))) {
        throw new TigedError(
          'No files to extract. Make sure you typed in the sub-directory name correctly.',
          {
            code: 'NO_FILES',
            ref: repo.ref,
            url,
          },
        );
      }

      const tempSubDirectoryStats = await fs.lstat(tempSubDirectory);

      const resolvedTempSubDirectory = tempSubDirectoryStats.isFile()
        ? path.dirname(tempSubDirectory)
        : tempSubDirectory;

      const filesToExtract = await fs.readdir(resolvedTempSubDirectory, {
        encoding: 'utf-8',
      });

      await Promise.all(
        filesToExtract.map(async fileToExtract =>
          fs.rename(
            path.join(resolvedTempSubDirectory, fileToExtract),
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
export function createTiged(src: string, tigedOptions?: TigedOptions): Tiged {
  return new Tiged(src, tigedOptions);
}
