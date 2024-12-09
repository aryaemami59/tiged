import type { constants } from 'node:os';

/**
 * Represents the valid modes for a file.
 * Possible values are:
 *
 * - **`'tar'`**: Downloads the repository as a tarball.
 * - **`'git'`**: Clones the repository using Git.
 */
export type ValidModes = 'tar' | 'git';

/**
 * Represents the options for a specific operation.
 *
 * @public
 * @since 3.0.0
 */
export type Options = {
  /**
   * Specifies whether to use caching.
   *
   * **CLI-Equivalent**: `-c`, `--cache`
   *
   * @alias {@linkcode Options.offlineMode | offlineMode}
   * @alias {@linkcode Options.offlineMode | 'offline-mode'}
   *
   * @default true
   *
   * @deprecated Use {@linkcode Options.disableCache | disableCache} instead.
   */
  cache?: boolean;

  /**
   * Forces the operation to proceed, despite non-empty destination directory
   * potentially overwriting existing files.
   *
   * **CLI-Equivalent**: `-f`, `--force`
   *
   * @default false
   */
  force?: boolean;

  /**
   * Specifies the mode for the operation.
   * Possible values are:
   *
   * - **`'tar'`**: Downloads the repository as a tarball.
   * - **`'git'`**: Clones the repository using Git.
   *
   * **CLI-Equivalent**: `-m`, `--mode`, `--mode=git`
   *
   * @default 'tar'
   */
  mode?: ValidModes;

  /**
   * Whether to output extra information during the operation.
   *
   * **CLI-Equivalent**: `-v`, `--verbose`
   *
   * @default false
   */
  verbose?: boolean;

  /**
   * Specifies whether to enable offline mode, which uses the cache.
   *
   * **CLI-Equivalent**: `-o`, `--offline-mode`
   *
   * @alias {@linkcode Options.offlineMode | offlineMode}
   * @alias {@linkcode Options.cache | cache}
   *
   * @default true
   */
  'offline-mode'?: boolean;

  /**
   * Specifies whether to enable offline mode, which uses the cache.
   *
   * **CLI-Equivalent**: `-o`, `--offline-mode`
   *
   * @alias {@linkcode Options.offlineMode | 'offline-mode'}
   * @alias {@linkcode Options.cache | cache}
   *
   * @default true
   */
  offlineMode?: boolean;

  /**
   * Specifies whether to disable caching.
   *
   * **CLI-Equivalent**: `-D`, `--disable-cache`
   *
   * @alias {@linkcode Options.disableCache | disableCache}
   *
   * @default false
   */
  'disable-cache'?: boolean;

  /**
   * Specifies whether to disable caching.
   *
   * **CLI-Equivalent**: `-D`, `--disable-cache`
   *
   * @alias {@linkcode Options.disableCache | 'disable-cache'}
   *
   * @default false
   */
  disableCache?: boolean;

  /**
   * Specifies whether to use subgrouping.
   *
   * **CLI-Equivalent**: `-s`, `--subgroup`
   *
   * @default false
   */
  subgroup?: boolean;

  /**
   * Specifies the sub-directory for the operation.
   *
   * **CLI-Equivalent**: `-d`, `--sub-directory`
   *
   * @alias {@linkcode Options.subDirectory | subDirectory}
   *
   * @default undefined
   */
  'sub-directory'?: string;

  /**
   * Specifies the sub-directory for the operation.
   *
   * **CLI-Equivalent**: `-d`, `--sub-directory`
   *
   * @alias {@linkcode Options.subDirectory | 'sub-directory'}
   *
   * @default undefined
   */
  subDirectory?: string;
};

/**
 * Represents a repository.
 */
export type Repo = {
  /**
   * The hosting service or site for the repository.
   */
  site: string;

  /**
   * The username or organization under which the repository is located.
   */
  user: string;

  /**
   * The name of the repository.
   */
  name: string;

  /**
   * The reference to a specific branch, commit, or tag in the repository.
   */
  ref: string;

  /**
   * The URL to access the repository via HTTP or HTTPS.
   */
  url: string;

  /**
   * The SSH URL to access the repository for Git operations.
   */
  ssh: string;

  /**
   * Optional. A specific subdirectory within the repository to work with,
   * if applicable. Can be `null` if not used.
   */
  subdir?: string | null;

  /**
   * Specifies the mode for the operation.
   * Possible values are:
   *
   * - **`'tar'`**: Downloads the repository as a tarball.
   * - **`'git'`**: Clones the repository using Git.
   *
   * @default 'tar'
   */
  mode: ValidModes;

  /**
   * The source URL or path for cloning the repository.
   */
  src: string;

  /**
   * Optional. Indicates whether the repository belongs to a subgroup,
   * if supported by the hosting service.
   *
   * @default false
   */
  subgroup?: boolean;
};

/**
 * Represents information about a specific entity.
 */
export type Info = {
  /**
   * The code associated with the entity.
   */
  readonly code?: string;

  /**
   * The message associated with the entity.
   */
  readonly message?: string;

  /**
   * The repository associated with the entity.
   */
  readonly repo?: Repo;

  /**
   * The destination of the entity.
   */
  readonly dest?: string;
};

/**
 * Represents an action.
 */
type Action = {
  /**
   * The type of action.
   */
  action: string;

  /**
   * Specifies whether to use caching.
   *
   * @default true
   */
  cache?: boolean;

  /**
   * Whether to output extra information during the operation.
   *
   * @default false
   */
  verbose?: boolean;
};

/**
 * Represents a Tiged action for cloning.
 */
export type TigedAction = Action & {
  /**
   * The type of action, which is always `'clone'`.
   */
  action: 'clone';

  /**
   * The source path to clone from.
   */
  src: string;
};

/**
 * Represents a remove action.
 */
export type RemoveAction = Action & {
  /**
   * The type of action, which is always `'remove'`.
   */
  action: 'remove';

  /**
   * An array of file paths to be removed.
   */
  files: string[];
};

/**
 * Represents the possible error codes for the Tiged utility.
 */
export type TigedErrorCode =
  | 'DEST_NOT_EMPTY'
  | 'MISSING_REF'
  | 'MISSING_GIT'
  | 'COULD_NOT_DOWNLOAD'
  | 'BAD_SRC'
  | 'UNSUPPORTED_HOST'
  | 'BAD_REF'
  | 'COULD_NOT_FETCH'
  | 'NO_FILES'
  | keyof typeof constants.errno;

/**
 * Represents the options for a Tiged error.
 */
export type TigedErrorOptions = ErrorOptions & {
  /**
   * The error code associated with the error.
   */
  code?: TigedErrorCode;

  /**
   * The original error that caused this error.
   */
  original?: Error;

  /**
   * The reference (e.g., branch, tag, commit) that was being targeted.
   */
  ref?: string;

  /**
   * The URL associated with the error.
   */
  url?: string;
};

// TODO: We might not need this one.
/**
 * Represents the possible information codes.
 */
type InfoCode =
  | 'SUCCESS'
  | 'FILE_DOES_NOT_EXIST'
  | 'REMOVED'
  | 'DEST_NOT_EMPTY'
  | 'DEST_IS_EMPTY'
  | 'USING_CACHE'
  | 'FOUND_MATCH'
  | 'FILE_EXISTS'
  | 'PROXY'
  | 'DOWNLOADING'
  | 'EXTRACTING';
