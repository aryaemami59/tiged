import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Options } from 'tiged';
import { tiged } from 'tiged';
import {
  convertSpecialCharsToHyphens,
  defaultTigedOptions,
  fixturesDirectoryName,
} from './test-utils.js';

const validModes = ['tar', 'git'] as const;

const runTigedAPI = async (src: string, dest: string, options?: Options) => {
  return tiged(src, { ...defaultTigedOptions, ...options }).clone(dest);
};

describe('github', () => {
  describe.each(validModes)('with %s mode', mode => {
    it.for([
      'tiged/tiged-test-repo-compose',
      'tiged/tiged-test-repo',
      'github:tiged/tiged-test-repo',
      'git@github.com:tiged/tiged-test-repo',
      'https://github.com/tiged/tiged-test-repo.git',
    ] as const)('%s', async (src, { expect, task }) => {
      const sanitizedPath = convertSpecialCharsToHyphens(
        `${task.name}${task.id}`,
      );

      const outputDirectory = path.join(fixturesDirectoryName, sanitizedPath);

      await expect(
        runTigedAPI(src, outputDirectory, { mode }),
      ).resolves.not.toThrow();

      await expect(outputDirectory).toMatchFiles({
        'file.txt': 'hello from github!',
        subdir: null,
        'subdir/file.txt': 'hello from a subdirectory!',
      });
    });
  });
});

describe('gitlab', () => {
  describe.each(validModes)('with %s mode', mode => {
    it.for([
      'gitlab:nake89/tiged-test-repo',
      'git@gitlab.com:nake89/tiged-test-repo',
      'https://gitlab.com/nake89/tiged-test-repo.git',
    ] as const)('%s', async (src, { expect, task }) => {
      const sanitizedPath = convertSpecialCharsToHyphens(
        `${task.name}${task.id}`,
      );

      const outputDirectory = path.join(fixturesDirectoryName, sanitizedPath);

      await expect(
        runTigedAPI(src, outputDirectory, { mode }),
      ).resolves.not.toThrow();

      await expect(outputDirectory).toMatchFiles({
        'file.txt': 'hello from gitlab!',
      });
    });

    describe('subgroup', () => {
      it('https://gitlab.com/group-test-repo/subgroup-test-repo/test-repo', async ({
        task,
      }) => {
        const sanitizedPath = convertSpecialCharsToHyphens(
          `${task.name}${task.id}`,
        );

        const outputDirectory = path.join(fixturesDirectoryName, sanitizedPath);

        await expect(
          runTigedAPI(task.name, outputDirectory, { mode, subgroup: true }),
        ).resolves.not.toThrow();

        await expect(outputDirectory).toMatchFiles({
          'main.tf': 'Subgroup test',
          subdir1: null,
          'subdir1/.gitkeep': '',
          'subdir1/subdir2': null,
          'subdir1/subdir2/.gitkeep': '',
          'subdir1/subdir2/file.txt': "I'm a file.",
        });
      });

      describe('with subdir', () => {
        it('https://gitlab.com/group-test-repo/subgroup-test-repo/test-repo', async ({
          task,
        }) => {
          const sanitizedPath = convertSpecialCharsToHyphens(
            `${task.name}${task.id}`,
          );

          const outputDirectory = path.join(
            fixturesDirectoryName,
            sanitizedPath,
          );

          await expect(
            runTigedAPI(task.name, outputDirectory, {
              mode,
              'sub-directory': 'subdir1',
              subgroup: true,
            }),
          ).resolves.not.toThrow();

          await expect(outputDirectory).toMatchFiles({
            '.gitkeep': '',
            subdir2: null,
            'subdir2/.gitkeep': '',
            'subdir2/file.txt': "I'm a file.",
          });
        });
      });

      describe('with nested subdir', () => {
        it('https://gitlab.com/group-test-repo/subgroup-test-repo/test-repo', async ({
          task,
        }) => {
          const sanitizedPath = convertSpecialCharsToHyphens(
            `${task.name}${task.id}`,
          );

          const outputDirectory = path.join(
            fixturesDirectoryName,
            sanitizedPath,
          );

          await expect(
            runTigedAPI(task.name, outputDirectory, {
              mode,
              subgroup: true,
              'sub-directory': 'subdir1/subdir2',
            }),
          ).resolves.not.toThrow();

          await expect(outputDirectory).toMatchFiles({
            '.gitkeep': '',
            'file.txt': "I'm a file.",
          });
        });
      });
    });
  });
});

describe('bitbucket', { timeout: 10_000 }, () => {
  describe.each(validModes)('with %s mode', mode => {
    it.for([
      'bitbucket:nake89/tiged-test-repo',
      'git@bitbucket.org:nake89/tiged-test-repo',
      'https://bitbucket.org/nake89/tiged-test-repo.git',
    ] as const)('%s', async (src, { expect, task }) => {
      const sanitizedPath = convertSpecialCharsToHyphens(
        `${task.name}${task.id}`,
      );

      const outputDirectory = path.join(fixturesDirectoryName, sanitizedPath);

      await expect(
        runTigedAPI(src, outputDirectory, { mode }),
      ).resolves.not.toThrow();

      await expect(outputDirectory).toMatchFiles({
        'file.txt': 'hello from bitbucket',
      });
    });
  });
});

describe('Sourcehut', () => {
  describe.each(validModes)('with %s mode', mode => {
    it.for([
      'git.sr.ht/~satotake/degit-test-repo',
      'https://git.sr.ht/~satotake/degit-test-repo',
      'git@git.sr.ht:~satotake/degit-test-repo',
    ] as const)('%s', async (src, { expect, task }) => {
      const sanitizedPath = convertSpecialCharsToHyphens(
        `${task.name}${task.id}`,
      );

      const outputDirectory = path.join(fixturesDirectoryName, sanitizedPath);

      await expect(
        runTigedAPI(src, outputDirectory, { mode }),
      ).resolves.not.toThrow();

      await expect(outputDirectory).toMatchFiles({
        'file.txt': 'hello from sourcehut!',
      });
    });
  });
});

describe('Codeberg', () => {
  describe.each(validModes)('with %s mode', mode => {
    it.for([
      'codeberg:joaopalmeiro/tiged-test-repo',
      'https://codeberg.org/joaopalmeiro/tiged-test-repo',
      'git@codeberg.org:joaopalmeiro/tiged-test-repo',
    ])('%s', async (src, { expect, task }) => {
      const sanitizedPath = convertSpecialCharsToHyphens(
        `${task.name}${task.id}`,
      );

      const outputDirectory = path.join(fixturesDirectoryName, sanitizedPath);

      await expect(
        runTigedAPI(src, outputDirectory, { mode }),
      ).resolves.not.toThrow();

      await expect(outputDirectory).toMatchFiles({
        'file.txt': 'hello from codeberg!',
      });
    });
  });
});

// TODO: This does not work if `tar` mode is explicitly set.
describe('Hugging Face', () => {
  describe.each(validModes.slice(1))('with %s mode', mode => {
    it.for([
      'huggingface:severo/degit-test-repo',
      'git@huggingface.co:severo/degit-test-repo',
      'https://huggingface.co/severo/degit-test-repo.git',
    ])('%s', async (src, { expect, task }) => {
      const sanitizedPath = convertSpecialCharsToHyphens(
        `${task.name}${task.id}`,
      );

      const outputDirectory = path.join(fixturesDirectoryName, sanitizedPath);

      await expect(
        runTigedAPI(src, outputDirectory, { mode }),
      ).resolves.not.toThrow();

      await expect(outputDirectory).toMatchFiles({
        'file.txt': 'hello from Hugging Face',
        subdir: null,
        'subdir/file.txt': 'hello from a subdirectory!',
      });
    });
  });
});

describe('Subdirectories', () => {
  describe.each(validModes)('with %s mode', mode => {
    it.for([
      'tiged/tiged-test-repo/subdir',
      'github:tiged/tiged-test-repo/subdir',
      'git@github.com:tiged/tiged-test-repo/subdir',
      'https://github.com/tiged/tiged-test-repo.git/subdir',
    ])('%s', async (src, { expect, task }) => {
      const sanitizedPath = convertSpecialCharsToHyphens(
        `${task.name}${task.id}`,
      );

      const outputDirectory = path.join(fixturesDirectoryName, sanitizedPath);

      await expect(
        runTigedAPI(src, outputDirectory, { mode }),
      ).resolves.not.toThrow();

      await expect(outputDirectory).toMatchFiles({
        'file.txt': 'hello from a subdirectory!',
      });
    });
  });
});

// TODO: Come up with better error messages for git mode.
describe('Non-existent subdirectory', () => {
  describe.each(validModes)('with %s mode', mode => {
    it('throws error', async ({ task }) => {
      const sanitizedPath = convertSpecialCharsToHyphens(
        `${task.name}${task.id}`,
      );

      const outputDirectory = path.join(fixturesDirectoryName, sanitizedPath);

      await expect(
        runTigedAPI('tiged/tiged-test-repo/non-existent-dir', outputDirectory, {
          mode,
        }),
      ).rejects.toThrow(
        /No files to extract\. Make sure you typed in the subdirectory name correctly\./,
      );
    });
  });
});

describe('non-empty directories', () => {
  const src = 'tiged/tiged-test-repo';

  const sanitizedPath = convertSpecialCharsToHyphens('non-empty directories');

  const outputDirectory = path.join(fixturesDirectoryName, sanitizedPath);

  beforeAll(async () => {
    await fs.mkdir(path.join(fixturesDirectoryName, sanitizedPath), {
      recursive: true,
    });

    await fs.writeFile(path.join(outputDirectory, 'file.txt'), 'not empty', {
      encoding: 'utf-8',
    });
  });

  describe.each(validModes)('with %s mode', mode => {
    it('creates a new folder when <dest> is omitted', async ({
      expect,
      task,
    }) => {
      const sanitizedPath = convertSpecialCharsToHyphens(
        `${task.name}${task.id}`,
      );

      const outputDirectory = path.join(fixturesDirectoryName, sanitizedPath);

      const cwd = `.tmp/no-dest-${sanitizedPath}`;

      await fs.rm(cwd, { recursive: true, force: true });
      await fs.mkdir(cwd, { recursive: true });

      await expect(
        runTigedAPI(src, outputDirectory, { mode }),
      ).resolves.not.toThrow();

      await expect(outputDirectory).toMatchFiles({
        'file.txt': 'hello from github!',
        subdir: null,
        'subdir/file.txt': 'hello from a subdirectory!',
      });
    });

    // TODO: Make sure this can work in git mode.
    it(
      'can clone a root file',
      { todo: mode === 'git' },
      async ({ expect, task }) => {
        const sanitizedPath = convertSpecialCharsToHyphens(
          `${task.name}${task.id}`,
        );

        const outputDirectory = path.join(fixturesDirectoryName, sanitizedPath);

        await expect(
          runTigedAPI(`${src}/file.txt`, outputDirectory, { mode }),
        ).resolves.not.toThrow();

        await expect(outputDirectory).toMatchFiles({
          'file.txt': 'hello from github!',
        });
      },
    );

    // TODO: Make sure this can work in git mode.
    it(
      'can clone a single file',
      { todo: mode === 'git' },
      async ({ expect, task }) => {
        const sanitizedPath = convertSpecialCharsToHyphens(
          `${task.name}${task.id}`,
        );

        const outputDirectory = path.join(fixturesDirectoryName, sanitizedPath);

        await expect(
          runTigedAPI(`${src}/subdir/file.txt`, outputDirectory, { mode }),
        ).resolves.not.toThrow();

        await expect(outputDirectory).toMatchFiles({
          'file.txt': 'hello from a subdirectory!',
        });
      },
    );

    // TODO: Make sure this can work in git mode.
    describe('single file + --force', { todo: mode === 'git' }, () => {
      let sanitizedPath: string;

      it('fails without --force', async ({ expect, task }) => {
        sanitizedPath = convertSpecialCharsToHyphens(`${task.name}${task.id}`);

        await fs.mkdir(path.join(`.tmp/test-repo-${sanitizedPath}`), {
          recursive: true,
        });

        await fs.writeFile(
          path.join(`.tmp/test-repo-${sanitizedPath}/file.txt`),
          'not empty',
          { encoding: 'utf-8' },
        );

        await expect(
          runTigedAPI(
            'tiged/tiged-test-repo/subdir/file.txt',
            `.tmp/test-repo-${sanitizedPath}`,
            { mode, verbose: true },
          ),
        ).rejects.toThrowError(/destination directory is not empty/);
      });

      it('succeeds with --force', async ({ expect }) => {
        await expect(
          runTigedAPI(
            'tiged/tiged-test-repo/subdir/file.txt',
            `.tmp/test-repo-${sanitizedPath}`,
            {
              force: true,
              mode,
              verbose: true,
            },
          ),
        ).resolves.not.toThrow();

        await expect(`.tmp/test-repo-${sanitizedPath}`).toMatchFiles({
          'file.txt': 'hello from a subdirectory!',
        });
      });
    });

    it('fails without options.force', async () => {
      await expect(runTigedAPI(src, outputDirectory, { mode })).rejects.toThrow(
        /destination directory is not empty, aborting\. Use options.force to override/,
      );
    });

    it('succeeds with --force', async () => {
      await expect(
        runTigedAPI(src, outputDirectory, { force: true, mode }),
      ).resolves.not.toThrow();
    });
  });
});

// TODO: Make sure this can work in git mode.
describe('can clone one file', () => {
  describe.each(validModes.slice(0, 1))('with %s mode', mode => {
    it('can clone one file', async ({ expect, task }) => {
      const sanitizedPath = convertSpecialCharsToHyphens(
        `${task.name}${task.id}`,
      );

      const outputDirectory = path.join(fixturesDirectoryName, sanitizedPath);

      await expect(
        runTigedAPI('tiged/tiged-test-repo/subdir/file.txt', outputDirectory, {
          force: true,
          mode,
          verbose: true,
        }),
      ).resolves.not.toThrow();

      await expect(outputDirectory).toMatchFiles({
        'file.txt': 'hello from a subdirectory!',
      });
    });
  });
});

describe('actions', () => {
  describe.each(validModes)('with %s mode', mode => {
    it('removes specified file', async ({ task }) => {
      const sanitizedPath = convertSpecialCharsToHyphens(
        `${task.name}${task.id}`,
      );

      const outputDirectory = path.join(fixturesDirectoryName, sanitizedPath);

      await expect(
        runTigedAPI('tiged/tiged-test-repo-remove-only', outputDirectory, {
          mode,
        }),
      ).resolves.not.toThrow();

      await expect(outputDirectory).toMatchFiles({});
    });

    it('clones repo and removes specified file', async ({ task }) => {
      const sanitizedPath = convertSpecialCharsToHyphens(
        `${task.name}${task.id}`,
      );

      const outputDirectory = path.join(fixturesDirectoryName, sanitizedPath);

      await expect(
        runTigedAPI('tiged/tiged-test-repo-remove', outputDirectory, { mode }),
      ).resolves.not.toThrow();

      await expect(outputDirectory).toMatchFiles({
        'other.txt': 'hello from github!',
        subdir: null,
        'subdir/file.txt': 'hello from a subdirectory!',
      });
    });

    it('removes and adds nested files', async ({ task }) => {
      const sanitizedPath = convertSpecialCharsToHyphens(
        `${task.name}${task.id}`,
      );

      const outputDirectory = path.join(fixturesDirectoryName, sanitizedPath);

      await expect(
        runTigedAPI('tiged/tiged-test-repo-nested-actions', outputDirectory, {
          mode,
        }),
      ).resolves.not.toThrow();

      await expect(outputDirectory).toMatchFiles({
        dir: null,
        folder: null,
        'folder/file.txt': 'hello from clobber file!',
        'folder/other.txt': 'hello from other file!',
        subdir: null,
        'subdir/file.txt': 'hello from a subdirectory!',
      });
    });
  });
});

describe('git mode old hash', () => {
  // TODO: Make sure this can also work in tar mode.
  describe.each(validModes.slice(1))('with %s mode', mode => {
    it('is able to clone correctly with old hash', async ({ task }) => {
      const sanitizedPath = convertSpecialCharsToHyphens(
        `${task.name}${task.id}`,
      );

      const outputDirectory = path.join(fixturesDirectoryName, sanitizedPath);

      await expect(
        runTigedAPI(
          'https://github.com/tiged/tiged-test#525e8fef2c6b5e261511adc55f410d83ca5d8256',
          outputDirectory,
          { mode },
        ),
      ).resolves.not.toThrow();

      await expect(outputDirectory).toMatchFiles({
        'README.md': '# tiged-test\nFor testing',
        subdir: null,
        'subdir/file': 'Hello, champ!',
      });
    });

    it('is able to clone subdir correctly using git mode with old hash', async ({
      task,
    }) => {
      const sanitizedPath = convertSpecialCharsToHyphens(
        `${task.name}${task.id}`,
      );

      const outputDirectory = path.join(fixturesDirectoryName, sanitizedPath);

      await expect(
        runTigedAPI(
          'https://github.com/tiged/tiged-test.git/subdir#b09755bc4cca3d3b398fbe5e411daeae79869581',
          outputDirectory,
          { mode },
        ),
      ).resolves.not.toThrow();

      await expect(outputDirectory).toMatchFiles({
        file: 'Hello, champ!',
      });
    });
  });
});

describe('git mode', () => {
  it('is able to clone correctly using git mode', async ({ task }) => {
    const sanitizedPath = convertSpecialCharsToHyphens(
      `${task.name}${task.id}`,
    );

    const outputDirectory = path.join(fixturesDirectoryName, sanitizedPath);

    await expect(
      runTigedAPI('https://github.com/tiged/tiged-test.git', outputDirectory, {
        mode: 'git',
      }),
    ).resolves.not.toThrow();

    await expect(outputDirectory).toMatchFiles({
      subdir: null,
      'README.md': 'tiged is awesome',
      'subdir/file': 'Hello, buddy!',
    });
  });
});
