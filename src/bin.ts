#!/usr/bin/env node

import enquirer from 'enquirer';
import fuzzysearch from 'fuzzysearch';
import mri from 'mri';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import picocolors from 'picocolors';
import type { TigedOptions } from 'tiged';
import { createTiged } from 'tiged';
import { glob } from 'tinyglobby';
import { accessLogsFileName, cacheDirectoryPath } from './constants.js';
import { pathExists, tryRequire } from './utils.js';

const { bold, cyanBright, magentaBright, red, underline } = picocolors;

const CLIArguments = mri<TigedOptions & { help?: string }>(
  process.argv.slice(2),
  {
    alias: {
      f: 'force',
      D: ['disable-cache', 'disableCache'],
      v: 'verbose',
      m: 'mode',
      s: 'subgroup',
      d: ['sub-directory', 'subDirectory'],
      p: ['proxy'],
      h: 'help',
    },

    boolean: [
      'force',
      'disableCache',
      'verbose',
      'subgroup',
    ] as const satisfies (keyof TigedOptions)[],

    string: [
      'mode',
      'subDirectory',
      'proxy',
    ] as const satisfies (keyof TigedOptions)[],
  },
);

const [src, dest] = CLIArguments._;

/**
 * Runs the cloning process from the specified source
 * to the destination directory.
 *
 * @param src - The source repository to clone from.
 * @param dest - The destination directory where the repository will be cloned to.
 * @param tigedOptions - Additional options for the cloning process.
 * @returns A {@linkcode Promise | promise} that resolves when the cloning process is complete.
 */
async function run(
  src: string,
  dest: string | undefined,
  tigedOptions: TigedOptions,
): Promise<void> {
  const tiged = createTiged(src, tigedOptions);

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
    await tiged.clone(dest);
  } catch (error) {
    if (error instanceof Error) {
      console.error(red(`! ${error.message.replace('options.', '--')}`));

      process.exit(1);
    }
  }
}

/**
 * The main function of the application.
 * It handles the logic for displaying help,
 * interactive mode, and running the application.
 *
 * @returns A {@linkcode Promise | promise} that resolves when the main function completes.
 */
async function main(): Promise<void> {
  if (CLIArguments.help) {
    const help = (
      await fs.readFile(
        path.join(
          path.dirname(fileURLToPath(import.meta.url)),
          '..',
          'help.md',
        ),
        { encoding: 'utf-8' },
      )
    )
      .replaceAll(
        /^(\s*)#+ (.+)/gm,
        (
          _headerWithLeadingWhiteSpaces,
          leadingWhiteSpaces: string,
          header: string,
        ) => leadingWhiteSpaces + bold(header),
      )
      .replaceAll(/_([^_]+)_/g, (_tigedTitleInItalics, tigedTitle: 'tiged') =>
        underline(tigedTitle),
      )
      .replaceAll(/`([^`]+)`/g, (_inlineCode, inlineCodeContent: string) =>
        cyanBright(inlineCodeContent),
      ); //` syntax highlighter fix

    process.stdout.write(`\n${help}\n`);
  } else if (!src) {
    // interactive mode

    const accessLookup = /* @__PURE__ */ new Map<string, number>();

    await fs.mkdir(cacheDirectoryPath, { recursive: true });

    const accessJsonFiles = await glob(`**/${accessLogsFileName}`, {
      cwd: cacheDirectoryPath,
    });

    await Promise.all(
      accessJsonFiles.map(file => {
        const [host = 'github', user = '', repo = ''] = file.split(path.sep);

        const logs: Partial<Record<string, string>> =
          tryRequire(path.join(cacheDirectoryPath, file)) || {};

        Object.entries(logs).forEach(([ref, timestamp]) => {
          const id = `${host}:${user}/${repo}#${ref}`;
          accessLookup.set(
            id,
            timestamp ? new Date(timestamp).getTime() : new Date().getTime(),
          );
        });
      }),
    );

    const getChoice = (file: string) => {
      const [host = 'github', user = '', repo = ''] = file.split(path.sep);

      const cacheLogs: Partial<Record<string, string>> =
        tryRequire(path.join(cacheDirectoryPath, file)) || {};

      return Object.entries(cacheLogs).map(([ref, hash]) => ({
        name: hash,
        message: `${host}:${user}/${repo}#${ref}`,
        value: `${host}:${user}/${repo}#${ref}`,
      }));
    };

    const choices = (
      await Promise.all(
        (await glob(`**/map.json`, { cwd: cacheDirectoryPath })).map(getChoice),
      )
    )
      .reduce(
        (accumulator, currentValue) => accumulator.concat(currentValue),
        [],
      )
      .sort((a, b) => {
        const aTime = accessLookup.get(a.value) ?? 0;
        const bTime = accessLookup.get(b.value) ?? 0;

        return bTime - aTime;
      });

    const options = await enquirer.prompt<
      { dest: string; src: string } & TigedOptions
    >([
      // FIXME: `suggest` is not in the type definition
      {
        type: 'autocomplete',
        name: 'src',
        message: 'Repo to clone?',
        suggest: (input: string, choices: { value: string }[]) =>
          choices.filter(({ value }) => fuzzysearch(input, value)),
        choices,
      } as never,
      {
        type: 'input',
        name: 'dest',
        message: 'Destination directory?',
        initial: '.',
      },
      {
        type: 'toggle',
        name: 'cache',
        message: 'Use cached version?',
      },
    ]);

    const empty =
      !(await pathExists(options.dest)) ||
      (await fs.readdir(options.dest, { encoding: 'utf-8' })).length === 0;

    if (!empty) {
      const { force } = await enquirer.prompt<TigedOptions>([
        {
          type: 'toggle',
          name: 'force',
          message: 'Overwrite existing files?',
        },
      ]);

      if (!force) {
        console.error(magentaBright(`! Directory not empty — aborting`));

        return;
      }
    }

    const { dest, src, ...tigedOptions } = options;

    await run(src, dest, {
      ...tigedOptions,
      force: true,
    });
  } else {
    await run(src, dest, CLIArguments);
  }
}

void main();
