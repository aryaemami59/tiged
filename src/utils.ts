import { HttpsProxyAgent } from 'https-proxy-agent';
import * as child_process from 'node:child_process';
import { createWriteStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as https from 'node:https';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { rimraf } from 'rimraf';
import { tigedConfigName, tmpDirName } from './constants.js';
import type { TigedErrorOptions } from './types.js';

/**
 * Represents an error that occurs during the tiged process.
 *
 * @extends Error
 *
 * @internal
 * @since 3.0.0
 */
export class TigedError extends Error {
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
  public constructor(message?: string, tigedErrorOptions?: TigedErrorOptions) {
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
): any {
  const require = createRequire(import.meta.url);
  try {
    if (options && options.clearCache === true) {
      delete require.cache[require.resolve(filePath)];
    }
    return require(filePath);
  } catch (error) {
    return null;
  }
}

/**
 * Executes a command and returns the `stdout` and `stderr` as strings.
 *
 * @param command - The command to execute.
 * @param size - The maximum buffer size in kilobytes (default: 500KB).
 * @returns A {@linkcode Promise | promise} that resolves to an object containing the `stdout` and `stderr` strings.
 *
 * @internal
 */
export async function exec(
  command: string,
  size = 500,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise<{ stdout: string; stderr: string }>((fulfill, reject) => {
    child_process.exec(
      command,
      { maxBuffer: 1024 * size },
      (error, stdout, stderr) => {
        if (error) {
          reject(error);
          return;
        }

        fulfill({ stdout, stderr });
      },
    );
  }).catch(error => {
    if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
      return exec(command, size * 2);
    }

    return Promise.reject(error);
  });
}

/**
 * Fetches a resource from the specified URL
 * and saves it to the destination path.
 * Optionally, a proxy URL can be provided to make the
 * request through a proxy server.
 *
 * @param url - The URL of the resource to fetch.
 * @param dest - The destination path to save the fetched resource.
 * @param proxy - Optional. The URL of the proxy server to use for the request.
 * @returns A {@linkcode Promise | promise} that resolves when the resource is successfully fetched and saved, or rejects with an error.
 *
 * @internal
 */
export async function downloadTarball(
  url: string,
  dest: string,
  proxy?: string,
): Promise<void> {
  return new Promise<void>((fulfill, reject) => {
    const parsedUrl = new URL(url);

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
          return reject(new Error('No status code'));
        }

        const { statusCode } = response;

        if (statusCode >= 400) {
          reject({ statusCode, message: response.statusMessage });
        } else if (statusCode >= 300) {
          if (response.headers.location == null) {
            return reject(new Error('No location header'));
          }

          downloadTarball(response.headers.location, dest, proxy).then(
            fulfill,
            reject,
          );
        } else {
          response
            .pipe(createWriteStream(dest))
            .on('finish', () => fulfill())
            .on('error', reject);
        }
      })
      .on('error', reject);
  });
}

/**
 * Stashes files from a directory to a temporary directory.
 *
 * @param dir - The source directory containing the files to be stashed.
 * @param dest - The destination directory where the stashed files will be stored.
 * @returns A {@linkcode Promise | promise} that resolves when the stashing process is complete.
 *
 * @internal
 */
export async function stashFiles(dir: string, dest: string): Promise<void> {
  const tmpDir = path.join(dir, tmpDirName);

  try {
    await rimraf(tmpDir);
  } catch (error) {
    if (
      !(
        error instanceof Error &&
        'errno' in error &&
        'syscall' in error &&
        'code' in error
      )
    ) {
      return;
    }

    if (
      error.errno !== -2 &&
      error.syscall !== 'rmdir' &&
      error.code !== 'ENOENT'
    ) {
      throw error;
    }
  }

  await fs.mkdir(tmpDir);

  const files = await fs.readdir(dest, { encoding: 'utf-8', recursive: true });

  for (const file of files) {
    const filePath = path.join(dest, file);

    const targetPath = path.join(tmpDir, file);

    const isDir = await isDirectory(filePath);
    if (isDir) {
      await fs.cp(filePath, targetPath, { recursive: true });
    } else {
      await fs.cp(filePath, targetPath);

      await fs.unlink(filePath);
    }
  }
}

/**
 * Unstashes files from a temporary directory to a destination directory.
 *
 * @param dir - The directory where the temporary directory is located.
 * @param dest - The destination directory where the files will be un-stashed.
 * @returns A {@linkcode Promise | promise} that resolves when the un-stashing process is complete.
 *
 * @internal
 */
export async function unStashFiles(dir: string, dest: string): Promise<void> {
  const tmpDir = path.join(dir, tmpDirName);

  const files = await fs.readdir(tmpDir, {
    encoding: 'utf-8',
    recursive: true,
  });

  for (const filename of files) {
    const tmpFile = path.join(tmpDir, filename);

    const targetPath = path.join(dest, filename);

    const isDir = await isDirectory(tmpFile);
    if (isDir) {
      await fs.cp(tmpFile, targetPath, { recursive: true });
    } else {
      if (filename !== tigedConfigName) {
        await fs.cp(tmpFile, targetPath);
      }

      await fs.unlink(tmpFile);
    }
  }

  await rimraf(tmpDir);
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
