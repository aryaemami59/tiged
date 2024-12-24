import { HttpsProxyAgent } from 'https-proxy-agent';
import * as child_process from 'node:child_process';
import { createWriteStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as https from 'node:https';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { extract } from 'tar';
import type { SupportedHostNames } from './constants.js';
import {
  accessLogsFileName,
  cacheDirectoryPath,
  supportedHostNames,
  supportedHosts,
} from './constants.js';
import type { Repo, TigedErrorOptions } from './types.js';

/**
 * Represents an error that occurs during the tiged process.
 *
 * @extends Error
 *
 * @internal
 * @since 3.0.0
 */
export class TigedError extends Error implements Error, TigedErrorOptions {
  /**
   * The error code associated with the error.
   */
  declare public code: TigedErrorOptions['code'];

  /**
   * The original error that caused this error.
   */
  declare public original?: TigedErrorOptions['original'];

  /**
   * The reference (e.g., branch, tag, commit) that was being targeted.
   */
  declare public ref?: TigedErrorOptions['ref'];

  /**
   * The URL associated with the error.
   */
  declare public url?: TigedErrorOptions['url'];

  public override readonly name = 'TigedError';

  /**
   * Creates a new instance of {@linkcode TigedError}.
   *
   * @param message - The error message.
   * @param tigedErrorOptions - Additional options for the error.
   */
  public constructor(message: string, tigedErrorOptions: TigedErrorOptions) {
    super(message);

    Object.assign(this, tigedErrorOptions);
  }
}

/**
 * Tries to require a module and returns the result.
 * If the module cannot be required, it returns `null`.
 *
 * @param filePath - The path to the module file.
 * @param options - Optional options for requiring the module.
 * @param opts.clearCache - If `true`, clears the module cache before requiring the module.
 * @returns The required module or `null` if it cannot be required.
 *
 * @internal
 */
export function tryRequire(
  filePath: string,
  options?: {
    /**
     * If `true`, clears the module cache before requiring the module.
     */
    clearCache?: true | undefined;
  },
): unknown {
  const require = createRequire(import.meta.url);

  try {
    if (options && options.clearCache === true) {
      delete require.cache[require.resolve(filePath)];
    }

    return require(filePath);
  } catch (error) {
    return;
  }
}

/**
 * Executes a command and returns the `stdout` and `stderr` as strings.
 *
 * @param command - The command to execute.
 * @returns A {@linkcode Promise | promise} that resolves to an object containing the `stdout` and `stderr` strings.
 *
 * @internal
 */
export const exec = promisify(child_process.exec);

/**
 * Extracts the contents of a tar file to a specified destination.
 *
 * #### Note: This function was previously known as **`untar`**.
 *
 * @param tarballFilePath - The path to the tar file.
 * @param destinationDirectoryPath - The destination directory where the contents will be extracted.
 * @param subDirectory - Optional subdirectory within the tar file to extract.
 * @returns A list of extracted files.
 *
 * @internal
 * @since 3.0.0
 */
export async function extractTarball(
  tarballFilePath: string,
  destinationDirectoryPath: string,
  subDirectory?: Repo['subDirectory'],
): Promise<string[]> {
  const extractedFiles: string[] = [];

  await extract(
    {
      file: tarballFilePath,
      strip: subDirectory ? subDirectory.split('/').length : 1,
      C: destinationDirectoryPath,
      onReadEntry: entry => {
        extractedFiles.push(entry.path);
      },
    },

    subDirectory ? [subDirectory] : [],
  );

  return extractedFiles;
}

/**
 * Fetches a resource from the specified URL
 * and saves it to the destination path.
 * Optionally, a proxy URL can be provided to make the
 * request through a proxy server.
 *
 * @param url - The URL of the resource to fetch.
 * @param tarballFilePath - The destination path to save the fetched resource.
 * @param proxy - Optional. The URL of the proxy server to use for the request.
 * @returns A {@linkcode Promise | promise} that resolves when the resource is successfully fetched and saved, or rejects with an error.
 *
 * @internal
 */
export async function downloadTarball(
  url: string,
  tarballFilePath: string,
  proxy?: string,
): Promise<void> {
  const parsedUrl = new URL(url);

  return new Promise<void>((fulfill, reject) => {
    const requestOptions: https.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname,
      headers: {
        Connection: 'close',
      },

      agent: proxy ? new HttpsProxyAgent(proxy) : undefined,
    };

    https
      .get(requestOptions, response => {
        if (response.statusCode == null) {
          reject(new Error('No status code'));

          return;
        }

        const { statusCode } = response;

        if (statusCode >= 400) {
          reject(new Error(response.statusMessage, { cause: statusCode }));
        } else if (statusCode >= 300) {
          if (response.headers.location == null) {
            reject(new Error('No location header'));

            return;
          }

          downloadTarball(
            response.headers.location,
            tarballFilePath,
            proxy,
          ).then(fulfill, reject);
        } else {
          response
            .pipe(createWriteStream(tarballFilePath))
            .on('finish', () => {
              fulfill();
            })
            .on('error', reject);
        }
      })
      .on('error', reject);
  });
}

/**
 * Stashes files from a directory to a temporary directory.
 *
 * @param stashDestinationDirectoryPath - The source directory containing the files to be stashed.
 * @param stashSourceDirectoryPath - The destination directory where the stashed files will be stored.
 * @returns A {@linkcode Promise | promise} that resolves when the stashing process is complete.
 *
 * @internal
 */
export async function stashFiles(
  stashDestinationDirectoryPath: string,
  stashSourceDirectoryPath: string,
): Promise<void> {
  await fs.cp(stashSourceDirectoryPath, stashDestinationDirectoryPath, {
    recursive: true,
  });

  await fs.rm(stashSourceDirectoryPath, { force: true, recursive: true });
}

/**
 * Un-stashes files from a temporary directory to a destination directory.
 *
 * @param unStashSourceDirectoryPath - The directory where the temporary directory is located.
 * @param unStashDestinationDirectoryPath - The destination directory where the files will be un-stashed.
 * @returns A {@linkcode Promise | promise} that resolves when the un-stashing process is complete.
 *
 * @internal
 */
export async function unStashFiles(
  unStashSourceDirectoryPath: string,
  unStashDestinationDirectoryPath: string,
): Promise<void> {
  await fs.cp(unStashSourceDirectoryPath, unStashDestinationDirectoryPath, {
    recursive: true,
  });

  await fs.rm(unStashSourceDirectoryPath, { force: true, recursive: true });
}

/**
 * Asynchronously checks if a given file path exists.
 *
 * @param filePath - The path to the file or directory to check.
 * @returns A {@linkcode Promise | promise} that resolves to `true` if the path exists, otherwise `false`.
 *
 * @example
 * <caption>#### Check if a file exists</caption>
 *
 * ```ts
 * const exists = await pathExists('/path/to/file');
 * console.log(exists); // true or false
 * ```
 *
 * @since 3.0.0
 * @internal
 */
export const pathExists = async (filePath: string): Promise<boolean> => {
  try {
    await fs.access(filePath);

    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Asynchronously checks if a given file path is a directory.
 *
 * @param filePath - The path to the file or directory to check.
 * @returns A {@linkcode Promise | promise} that resolves to `true` if the path is a directory, otherwise `false`.
 *
 * @example
 * <caption>#### Check if a path is a directory</caption>
 *
 * ```ts
 * const isDir = await isDirectory('/path/to/directory');
 * console.log(isDir); // true or false
 * ```
 *
 * @since 3.0.0
 * @internal
 */
export const isDirectory = async (filePath: string): Promise<boolean> => {
  try {
    const stats = await fs.lstat(filePath);

    return stats.isDirectory();
  } catch (error) {
    return false;
  }
};

/**
 * Ensures that the Git executable is available
 * on the system by checking its version.
 *
 * @throws A {@linkcode TigedError} If the Git executable is not found or cannot be executed.
 *
 * @example
 * <caption>#### Throws an error if Git is not installed</caption>
 *
 * ```ts
 * await ensureGitExists();
 * // Throws an error if Git is not installed or not in the PATH.
 * ```
 *
 * @since 3.0.0
 * @internal
 */
export const ensureGitExists = async (): Promise<void> => {
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
};

/**
 * Checks if the given host name is supported.
 *
 * @param hostName - The host name to check.
 * @returns A `boolean` indicating whether the host name is supported.
 *
 * @internal
 * @since 3.0.0
 */
const isHostNameSupported = (
  hostName: string,
): hostName is SupportedHostNames =>
  supportedHostNames.includes(hostName as never);

/**
 * Parses the source URL and returns a {@linkcode Repo} object
 * containing the parsed information.
 *
 * #### Note: This function was previously known as **`parse`**.
 *
 * @param src - The source URL to parse.
 * @returns A {@linkcode Repo} object containing the parsed information.
 * @throws A {@linkcode TigedError} If the source URL cannot be parsed.
 *
 * @internal
 * @since 3.0.0
 */
export function extractRepositoryInfo(
  src: string,
  subgroup: boolean,
  subDirectory: string,
): Repo {
  const match =
    /^(?:(?:https:\/\/)?(?<site>[^:/]+)(?:\.[^:/]+)\/|git@(?<siteName>[^:/]+)(?:\.[^:/]+)[:/]|(?<org>[^/:]+):)?(?<repo>[^/\s.]+)(?:\.git)?\/(?<repo2>(?:[^/\s#.]+|[^/\s#.]+)?)?(?:\.git)?(?:\/(?<repo3>(?:[^/\s#.]+)+))?(?:\.git)?(?:\/)?(?:#(?<commitHash>[^.]+)(?:\.git)?)?/.exec(
      src,
    );

  if (!match) {
    throw new TigedError(`could not parse ${src}`, {
      code: 'BAD_SRC',
      url: src,
    });
  }

  const site = match[1] ?? match[2] ?? match[3] ?? 'github';
  const topLevelDomainMatch = /\.([a-z]{3,})$/.exec(site);
  const topLevelDomain = topLevelDomainMatch ? topLevelDomainMatch[0] : null;
  const siteName = topLevelDomain
    ? site.replace(new RegExp(`${topLevelDomain}$`), '')
    : site;

  const user = match[4] ?? '';
  const name = match[5]?.replace(/\.git$/, '') ?? '';
  const repoSubDirectory = addLeadingSlashIfMissing(match[6]);
  const ref = match[7] ?? 'HEAD';

  if (!isHostNameSupported(siteName)) {
    throw new TigedError(
      `tiged supports the following: ${Object.values(supportedHosts)
        .map(({ name }) => name)
        .join(', ')}.
        But received ${siteName}.`,
      {
        code: 'UNSUPPORTED_HOST',
        ref,
        url: src,
      },
    );
  }

  const domain = `${siteName}${
    topLevelDomain ?? supportedHosts[siteName].topLevelDomain
  }`;

  const url = `https://${domain}/${user}/${name}`;
  const ssh = `git@${domain}:${user}/${name}`;

  return {
    site: siteName,
    user,
    name: subgroup
      ? repoSubDirectory
        ? repoSubDirectory.slice(1) || ''
        : ''
      : name,
    ref,
    url: subgroup ? `${url}${repoSubDirectory}` : url,
    ssh: subgroup ? `${ssh}${repoSubDirectory}.git` : ssh,
    subDirectory: subgroup
      ? repoSubDirectory
      : subDirectory || repoSubDirectory,
    subgroup,
  };
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
export async function fetchRefs(repo: Repo): Promise<
  {
    type: string;
    name: string;
    hash: string;
  }[]
> {
  try {
    const { stdout } = await exec(`git ls-remote ${repo.url} ${repo.ref}`);

    return stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(row => {
        const [hash = '', ref = ''] = row.split('\t');

        if (ref === 'HEAD') {
          return {
            name: hash,
            type: ref,
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
    throw new TigedError(`could not fetch remote ${repo.url}`, {
      code: 'COULD_NOT_FETCH',
      url: repo.url,
      original: error instanceof Error ? error : undefined,
      ref: repo.ref,
    });
  }
}

/**
 * Updates the cache with the given repository information.
 *
 * @param repositoryCacheDirectoryPath - The directory path where the cache is located.
 * @param repo - The repository object containing the reference and other details.
 * @param hash - The hash value of the repository.
 * @param cached - The cached records.
 * @returns A {@linkcode Promise | promise} that resolves when the cache is updated.
 *
 * @internal
 */
export async function updateCache(
  repositoryCacheDirectoryPath: string,
  repo: Repo,
  hash: string,
  cached: Record<string, string>,
): Promise<void> {
  const accessLogsFilePath = path.join(
    repositoryCacheDirectoryPath,
    accessLogsFileName,
  );

  // update access logs
  const accessLogs: Partial<Record<string, string>> =
    tryRequire(accessLogsFilePath) || {};

  accessLogs[repo.ref] = new Date().toISOString();

  await fs.writeFile(accessLogsFilePath, JSON.stringify(accessLogs, null, 2), {
    encoding: 'utf-8',
  });

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
        await fs.unlink(
          path.join(repositoryCacheDirectoryPath, `${oldHash}.tar.gz`),
        );
      } catch (error) {
        // ignore
      }
    }
  }

  cached[repo.ref] = hash;

  await fs.writeFile(
    path.join(repositoryCacheDirectoryPath, 'map.json'),
    JSON.stringify(cached, null, 2),
    { encoding: 'utf-8' },
  );
}

/**
 * Retrieves the old hash of a given repository reference.
 *
 * @param repo - The repository object containing the URL and reference.
 * @returns A {@linkcode Promise | promise} that resolves to the old hash string of the repository reference.
 *
 * @remarks
 * This function initializes a temporary Git repository,
 * fetches the specified reference, retrieves the commit hash,
 * and then cleans up the temporary directory.
 *
 * @example
 *
 * ```ts
 * const repo = { url: 'https://github.com/user/repo.git', ref: 'main' };
 * const oldHash = await getOldHash(repo);
 * console.log(oldHash); // Outputs the commit hash of the 'main' branch
 * ```
 *
 * @internal
 * @since 3.0.0
 */
export const getOldHash = async (repo: Repo): Promise<string> => {
  await fs.mkdir(cacheDirectoryPath, { recursive: true });

  const temporaryDirectory = await fs.mkdtemp(
    `${path.join(cacheDirectoryPath)}/`,
    { encoding: 'utf-8' },
  );

  const ref = repo.ref.includes('#')
    ? repo.ref.split('#').reverse().join(' ')
    : repo.ref;

  await exec('git init', { cwd: temporaryDirectory });

  await exec(`git fetch --depth 1 ${repo.url} ${ref}`, {
    cwd: temporaryDirectory,
  });

  const { stdout } = await exec('git rev-list FETCH_HEAD', {
    cwd: temporaryDirectory,
  });

  await fs.rm(temporaryDirectory, { force: true, recursive: true });

  return stdout.trim().split('\n')[0] ?? '';
};

/**
 * Ensures that the provided sub-directory path has a leading slash (`/`).
 * If the sub-directory already starts with a slash, it is returned unchanged.
 * Otherwise, a leading slash is added to the sub-directory.
 *
 * @param subDirectory - The sub-directory path to normalize with a leading slash.
 * @returns The sub-directory path guaranteed to have a leading slash.
 *
 * @example
 * <caption>#### Adds a leading slash if missing</caption>
 *
 * ```ts
 * addLeadingSlashIfMissing('subdir'); // Returns '/subdir'
 * ```
 *
 * @example
 * <caption>#### Returns unchanged if the leading slash is already present</caption>
 *
 * ```ts
 * addLeadingSlashIfMissing('/subdir'); // Returns '/subdir'
 * ```
 *
 * @internal
 * @since 3.0.0
 */
export const addLeadingSlashIfMissing = (
  subDirectory: string | undefined,
): string => {
  if (!subDirectory) {
    return '';
  }

  return subDirectory.startsWith('/') ? subDirectory : `/${subDirectory}`;
};
