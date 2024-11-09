import type { ExecFileOptionsWithOtherEncoding } from 'node:child_process';
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

export const defaultCLICommand = process.env.TEST_DIST ? 'tiged' : 'node';

export const defaultCLIArguments = process.env.TEST_DIST
  ? ['-D']
  : [path.resolve('src/bin.ts'), '-D'];

export const defaultExecFileOptions = {
  encoding: 'utf-8',

  env: process.env.TEST_DIST
    ? process.env
    : { ...process.env, NODE_OPTIONS: '--import=tsx' },

  shell: true,
} as const satisfies ExecFileOptionsWithOtherEncoding;

export const defaultTigedOptions: Options = {
  cache: false,
  disableCache: true,
};

export const execFile = promisify(child_process.execFile);

export const runTigedCLI = (
  CLIArguments: readonly string[] = [],
  execFileOptions?: ExecFileOptionsWithOtherEncoding,
) =>
  execFile(defaultCLICommand, [...defaultCLIArguments, ...CLIArguments], {
    ...defaultExecFileOptions,
    ...execFileOptions,
  });

export const fixturesDirectoryName = '.tmp';
