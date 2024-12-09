import type { ExecFileOptionsWithStringEncoding } from 'node:child_process';
import * as child_process from 'node:child_process';
import * as path from 'node:path';
import { promisify } from 'node:util';
import type { Options } from 'tiged';

/**
 * Converts all non-alphanumeric characters in a string to hyphens (`-`).
 *
 * @param inputString - The input string to process.
 * @returns A new string with all special characters replaced by hyphens.
 *
 * @example
 * <caption>#### Convert special characters to hyphens</caption>
 *
 * ```ts
 * const sanitizedPath = convertSpecialCharsToHyphens(
 *   'git@github.com:tiged/tiged-test-repo',
 * )
 *
 * console.log(sanitizedPath) //=> 'git-github-com-tiged-tiged-test-repo'
 * ```
 *
 * @internal
 */
export const convertSpecialCharsToHyphens = (inputString: string) =>
  inputString.replace(/[^a-zA-Z0-9]+/g, '-');

const tigedPath = path.join(import.meta.dirname, '..', 'src', 'bin.ts');

export const defaultCLICommand = process.env.TEST_DIST ? 'tiged' : 'tsx';

export const defaultCLIArguments = process.env.TEST_DIST
  ? ['-D']
  : [tigedPath, '-D'];

export const defaultExecFileOptions = {
  encoding: 'utf-8',

  shell: true,
} as const satisfies ExecFileOptionsWithStringEncoding;

export const defaultTigedOptions = {
  cache: false,
  disableCache: true,
} as const satisfies Options;

export const execFile = promisify(child_process.execFile);

export const runTigedCLI = (
  CLIArguments: readonly string[] = [],
  execFileOptions?: ExecFileOptionsWithStringEncoding,
) =>
  execFile(defaultCLICommand, [...defaultCLIArguments, ...CLIArguments], {
    ...defaultExecFileOptions,
    ...execFileOptions,
  });

export const fixturesDirectoryName = '.tmp';
