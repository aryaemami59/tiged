import type { ExecFileOptionsWithOtherEncoding } from 'node:child_process';
import * as child_process from 'node:child_process';
import * as path from 'node:path';
import { promisify } from 'node:util';
import type { TigedOptions, ValidModes } from 'tiged';
import { createTiged } from 'tiged';

/**
 * The name of the directory where test fixtures are stored.
 * This directory is typically used to store temporary files
 * needed for testing purposes.
 *
 * @since 3.0.0
 * @internal
 */
const fixturesDirectoryName = '.tmp';

/**
 * The absolute path to the
 * {@linkcode fixturesDirectoryName | fixtures directory}.
 *
 * @since 3.0.0
 * @internal
 */
export const fixturesDirectoryPath = path.join(
  import.meta.dirname,
  '..',
  fixturesDirectoryName,
);

/**
 * An array of {@linkcode ValidModes | valid modes} of operation
 * for the {@linkcode createTiged} function.
 *
 * Possible values are:
 * - **`'tar'`**: Downloads the repository as a tarball.
 * - **`'git'`**: Clones the repository using Git.
 *
 * @since 3.0.0
 * @internal
 */
export const validModes = [
  'tar',
  'git',
] as const satisfies readonly ValidModes[];

/**
 * The absolute file path to the `tiged` CLI executable.
 *
 * @since 3.0.0
 * @internal
 */
const tigedCLIFilePath = path.join(import.meta.dirname, '..', 'src', 'bin.ts');

/**
 * The default CLI command for the {@linkcode runTigedCLI} function.
 *
 * @since 3.0.0
 * @internal
 */
const defaultCLICommand = process.env.TEST_DIST ? 'tiged' : 'tsx';

/**
 * An array of default command-line arguments for the
 * {@linkcode runTigedCLI} function.
 *
 * @since 3.0.0
 * @internal
 */
const defaultCLIArguments = process.env.TEST_DIST
  ? ['-D']
  : [tigedCLIFilePath, '-D'];

/**
 * The default options for the {@linkcode runTigedCLI} function.
 *
 * @since 3.0.0
 * @internal
 */
const defaultExecFileOptions = {
  encoding: 'utf-8',

  shell: true,
} as const satisfies ExecFileOptionsWithOtherEncoding;

/**
 * The default options for the {@linkcode runTigedAPI} function.
 *
 * @since 3.0.0
 * @internal
 */
const defaultTigedOptions = {
  disableCache: true,
} as const satisfies TigedOptions;

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
 * @since 3.0.0
 * @internal
 */
const convertSpecialCharsToHyphens = (inputString: string): string =>
  inputString.replaceAll(/[^a-zA-Z0-9]+/g, '-');

/**
 * Generates an output directory path by sanitizing the input string.
 *
 * @param inputString - The input string to be sanitized and used for constructing the directory path.
 * @returns The path to the output directory.
 *
 * @example
 * <caption>#### Get the path to the output directory</caption>
 *
 * ```ts
 * const outputDirectory = getOutputDirectoryPath('tiged/tiged-test-repo');
 * // outputPath: '.tmp/tiged-tiged-test-repo'
 * ```
 *
 * @since 3.0.0
 * @internal
 */
export const getOutputDirectoryPath = (inputString: string): string => {
  const sanitizedPath = convertSpecialCharsToHyphens(inputString);

  return path.join(fixturesDirectoryName, sanitizedPath);
};

/**
 * The promisified version of
 * {@linkcode child_process.execFile | execFile}. It executes a file and
 * returns a promise that resolves with the result.
 *
 * @param file - The name or path of the file to execute.
 * @param args - List of string arguments.
 * @param options - Options for the execution.
 * @returns A {@linkcode Promise | promise} that resolves with the standard output and standard error of the executed file.
 *
 * @since 3.0.0
 * @internal
 */
const execFile = promisify(child_process.execFile);

/**
 * Executes the Tiged CLI with the provided arguments and options.
 *
 * @param CLIArguments - An array of arguments to pass to the CLI. Defaults to an empty array.
 * @param execFileOptions - Optional execution options to pass to the {@linkcode execFile} function.
 * @returns A {@linkcode Promise | promise} that resolves to an object containing `stderr` and `stdout` strings.
 *
 * @example
 *
 * ```ts
 * await expect(
 *   runTigedCLI(['--mode', mode, src, outputDirectory]),
 * ).resolves.not.toThrow();
 * ```
 *
 * @since 3.0.0
 * @internal
 */
export const runTigedCLI = async (
  CLIArguments: readonly string[] = [],
  execFileOptions?: Partial<ExecFileOptionsWithOtherEncoding>,
): Promise<{
  stderr: string;
  stdout: string;
}> => {
  const { stderr, stdout } = await execFile(
    defaultCLICommand,
    [...defaultCLIArguments, ...CLIArguments],
    {
      ...defaultExecFileOptions,
      ...execFileOptions,
    },
  );

  if (stderr) {
    console.log(stderr.trim());
  }

  if (stdout) {
    console.log(stdout.trim());
  }

  return { stderr, stdout };
};

/**
 * Runs the {@linkcode createTiged | tiged API}
 * to clone a repository from a source to a destination.
 *
 * @param src - The source URL or path of the repository to clone.
 * @param destinationDirectoryName - The destination path where the repository should be cloned.
 * @param tigedOptions - Optional Tiged options to customize the cloning process.
 * @returns A {@linkcode Promise | promise} that resolves when the cloning process is complete.
 *
 * @example
 *
 * ```ts
 * await expect(
 *   runTigedAPI(src, outputDirectory, { mode }),
 * ).resolves.not.toThrow();
 * ```
 *
 * @since 3.0.0
 * @internal
 */
export const runTigedAPI = (
  src: string,
  destinationDirectoryName: string,
  tigedOptions: TigedOptions = {},
) =>
  createTiged(src, { ...defaultTigedOptions, ...tigedOptions }).clone(
    destinationDirectoryName,
  );
