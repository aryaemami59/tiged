import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  getOutputDirectoryPath,
  runTigedCLI,
  validModes,
} from './test-utils.js';

describe('GitHub', () => {
  describe.for(validModes)('with %s mode', mode => {
    it.for([
      'tiged/tiged-test-repo-compose',
      'tiged/tiged-test-repo',
      'github:tiged/tiged-test-repo',
      'git@github.com:tiged/tiged-test-repo',
      'https://github.com/tiged/tiged-test-repo.git',
    ] as const)('%s', async (src, { expect, task }) => {
      const outputDirectory = getOutputDirectoryPath(`${task.name}-${task.id}`);

      await expect(
        runTigedCLI(['--mode', mode, src, outputDirectory]),
      ).resolves.not.toThrowError();

      await expect(outputDirectory).toMatchFiles({
        'file.txt': 'hello from github!',
        subdir: null,
        'subdir/file.txt': 'hello from a subdirectory!',
      });
    });
  });
});

describe('GitLab', () => {
  describe.for(validModes)('with %s mode', mode => {
    it.for([
      'gitlab:nake89/tiged-test-repo',
      'git@gitlab.com:nake89/tiged-test-repo',
      'https://gitlab.com/nake89/tiged-test-repo.git',
    ] as const)('%s', async (src, { expect, task }) => {
      const outputDirectory = getOutputDirectoryPath(`${task.name}-${task.id}`);

      await expect(
        runTigedCLI(['--mode', mode, src, outputDirectory]),
      ).resolves.not.toThrowError();

      await expect(outputDirectory).toMatchFiles({
        'file.txt': 'hello from gitlab!',
      });
    });

    describe('subgroup', () => {
      const testCases = [
        'gitlab:group-test-repo/subgroup-test-repo/test-repo',
        'git@gitlab.com:group-test-repo/subgroup-test-repo/test-repo',
        'https://gitlab.com/group-test-repo/subgroup-test-repo/test-repo',
        'https://gitlab.com/group-test-repo.git/subgroup-test-repo/test-repo',
        'https://gitlab.com/group-test-repo/subgroup-test-repo/test-repo.git',
      ] as const;

      it.for(testCases)('%s', async (src, { expect, task }) => {
        const outputDirectory = getOutputDirectoryPath(
          `${task.name}-${task.id}`,
        );

        await expect(
          runTigedCLI(['--mode', mode, '--subgroup', src, outputDirectory]),
        ).resolves.not.toThrowError();

        await expect(outputDirectory).toMatchFiles({
          'main.tf': 'Subgroup test',
          subdir1: null,
          'subdir1/.gitkeep': '',
          'subdir1/subdir2': null,
          'subdir1/subdir2/.gitkeep': '',
          'subdir1/subdir2/file.txt': "I'm a file.",
        });
      });

      describe('with sub-directory', () => {
        it.for(testCases)('%s', async (src, { expect, task }) => {
          const outputDirectory = getOutputDirectoryPath(
            `${task.name}-${task.id}`,
          );

          await expect(
            runTigedCLI([
              '--mode',
              mode,
              '--subgroup',
              src,
              '--sub-directory',
              'subdir1',
              outputDirectory,
            ]),
          ).resolves.not.toThrowError();

          await expect(outputDirectory).toMatchFiles({
            '.gitkeep': '',
            subdir2: null,
            'subdir2/.gitkeep': '',
            'subdir2/file.txt': "I'm a file.",
          });
        });
      });

      describe('with nested sub-directory', () => {
        it.for(testCases)('%s', async (src, { expect, task }) => {
          const outputDirectory = getOutputDirectoryPath(
            `${task.name}-${task.id}`,
          );

          await expect(
            runTigedCLI([
              '--mode',
              mode,
              '--subgroup',
              src,
              '--sub-directory',
              'subdir1/subdir2',
              outputDirectory,
            ]),
          ).resolves.not.toThrowError();

          await expect(outputDirectory).toMatchFiles({
            '.gitkeep': '',
            'file.txt': "I'm a file.",
          });
        });
      });
    });
  });
});

describe('BitBucket', { timeout: 10_000 }, () => {
  describe.for(validModes)('with %s mode', mode => {
    it.for([
      'bitbucket:nake89/tiged-test-repo',
      'git@bitbucket.org:nake89/tiged-test-repo',
      'https://bitbucket.org/nake89/tiged-test-repo.git',
    ] as const)('%s', async (src, { expect, task }) => {
      const outputDirectory = getOutputDirectoryPath(`${task.name}-${task.id}`);

      await expect(
        runTigedCLI(['--mode', mode, src, outputDirectory]),
      ).resolves.not.toThrowError();

      await expect(outputDirectory).toMatchFiles({
        'file.txt': 'hello from bitbucket',
      });
    });
  });
});

describe('SourceHut', () => {
  describe.for(validModes)('with %s mode', mode => {
    it.for([
      'git.sr.ht/~satotake/degit-test-repo',
      'git@git.sr.ht:~satotake/degit-test-repo',
      'https://git.sr.ht/~satotake/degit-test-repo.git',
    ] as const)('%s', async (src, { expect, task }) => {
      const outputDirectory = getOutputDirectoryPath(`${task.name}-${task.id}`);

      await expect(
        runTigedCLI(['--mode', mode, src, outputDirectory]),
      ).resolves.not.toThrowError();

      await expect(outputDirectory).toMatchFiles({
        'file.txt': 'hello from sourcehut!',
      });
    });
  });
});

describe('Codeberg', () => {
  describe.for(validModes)('with %s mode', mode => {
    it.for([
      'codeberg:joaopalmeiro/tiged-test-repo',
      'git@codeberg.org:joaopalmeiro/tiged-test-repo',
      'https://codeberg.org/joaopalmeiro/tiged-test-repo.git',
    ] as const)('%s', async (src, { expect, task }) => {
      const outputDirectory = getOutputDirectoryPath(`${task.name}-${task.id}`);

      await expect(
        runTigedCLI(['--mode', mode, src, outputDirectory]),
      ).resolves.not.toThrowError();

      await expect(outputDirectory).toMatchFiles({
        'file.txt': 'hello from codeberg!',
      });
    });
  });
});

// TODO: This falls back to `git` mode if `tar` mode is explicitly set.
describe('Hugging Face', () => {
  describe.for(validModes)('with %s mode', mode => {
    it.for([
      'huggingface:severo/degit-test-repo',
      'git@huggingface.co:severo/degit-test-repo',
      'https://huggingface.co/severo/degit-test-repo.git',
    ] as const)('%s', async (src, { expect, task }) => {
      const outputDirectory = getOutputDirectoryPath(`${task.name}-${task.id}`);

      await expect(
        runTigedCLI([src, '--mode', mode, outputDirectory]),
      ).resolves.not.toThrowError();

      await expect(outputDirectory).toMatchFiles({
        'file.txt': 'hello from Hugging Face',
        subdir: null,
        'subdir/file.txt': 'hello from a subdirectory!',
      });
    });
  });
});

describe('sub-directories', () => {
  const testCases = [
    'tiged/tiged-test-repo',
    'github:tiged/tiged-test-repo',
    'git@github.com:tiged/tiged-test-repo',
    'https://github.com/tiged/tiged-test-repo',
    'https://github.com/tiged/tiged-test-repo.git',
  ] as const;

  describe.for(validModes)('with %s mode', mode => {
    describe('using inferred sub-directory (repo/subdir) syntax', () => {
      it.for(testCases)('%s', async (src, { expect, task }) => {
        const outputDirectory = getOutputDirectoryPath(
          `${task.name}-${task.id}`,
        );

        await expect(
          runTigedCLI(['--mode', mode, `${src}/subdir`, outputDirectory]),
        ).resolves.not.toThrowError();

        await expect(outputDirectory).toMatchFiles({
          'file.txt': 'hello from a subdirectory!',
        });
      });
    });

    describe('using --sub-directory', () => {
      it.for(testCases)('%s', async (src, { expect, task }) => {
        const outputDirectory = getOutputDirectoryPath(
          `${task.name}-${task.id}`,
        );

        await expect(
          runTigedCLI([
            '--mode',
            mode,
            '--sub-directory',
            'subdir',
            src,
            outputDirectory,
          ]),
        ).resolves.not.toThrowError();

        await expect(outputDirectory).toMatchFiles({
          'file.txt': 'hello from a subdirectory!',
        });
      });
    });

    describe('non-existent sub-directories throw an error', () => {
      describe('using inferred sub-directory (repo/subdir) syntax', () => {
        it.for(testCases)('%s', async (src, { expect, task }) => {
          const outputDirectory = getOutputDirectoryPath(
            `${task.name}-${task.id}`,
          );

          await expect(
            runTigedCLI([
              '--mode',
              mode,
              `${src}/non-existent-dir`,
              outputDirectory,
            ]),
          ).rejects.toThrowError(
            /No files to extract\. Make sure you typed in the sub-directory name correctly\./,
          );
        });
      });

      describe('using --sub-directory', () => {
        it.for(testCases)('%s', async (src, { expect, task }) => {
          const outputDirectory = getOutputDirectoryPath(
            `${task.name}-${task.id}`,
          );

          await expect(
            runTigedCLI([
              '--mode',
              mode,
              src,
              '--sub-directory',
              'non-existent-dir',
              outputDirectory,
            ]),
          ).rejects.toThrowError(
            /No files to extract\. Make sure you typed in the sub-directory name correctly\./,
          );
        });
      });
    });

    describe('using both --sub-directory and repo/subdir', () => {
      it.for(testCases)('%s', async (src, { expect, task }) => {
        const outputDirectory = getOutputDirectoryPath(
          `${task.name}-${task.id}`,
        );

        await expect(
          runTigedCLI([
            '--mode',
            mode,
            src,
            outputDirectory,
            '--sub-directory',
            'subdir',
          ]),
        ).resolves.not.toThrowError();

        await expect(outputDirectory).toMatchFiles({
          'file.txt': 'hello from a subdirectory!',
        });
      });
    });

    describe('--sub-directory overrides repo/subdir', () => {
      it.for(testCases)('%s', async (src, { expect, task }) => {
        const outputDirectory = getOutputDirectoryPath(
          `${task.name}-${task.id}`,
        );

        await expect(
          runTigedCLI([
            '--mode',
            mode,
            `${src}/non-existent-dir`,
            outputDirectory,
            '--sub-directory',
            'subdir',
          ]),
        ).resolves.not.toThrowError();

        await expect(outputDirectory).toMatchFiles({
          'file.txt': 'hello from a subdirectory!',
        });
      });
    });

    describe('does not throw if --sub-directory is an empty string', () => {
      it.for(testCases)('%s', async (src, { expect, task }) => {
        const outputDirectory = getOutputDirectoryPath(
          `${task.name}-${task.id}`,
        );

        await expect(
          runTigedCLI([
            '--mode',
            mode,
            src,
            outputDirectory,
            '--sub-directory',
            '',
          ]),
        ).resolves.not.toThrowError();

        await expect(outputDirectory).toMatchFiles({
          'file.txt': 'hello from github!',
          subdir: null,
          'subdir/file.txt': 'hello from a subdirectory!',
        });
      });
    });

    describe('if --sub-directory is an empty string repo/subdir gets used', () => {
      it.for(testCases)('%s', async (src, { expect, task }) => {
        const outputDirectory = getOutputDirectoryPath(
          `${task.name}-${task.id}`,
        );

        await expect(
          runTigedCLI([
            '--mode',
            mode,
            `${src}/subdir`,
            outputDirectory,
            '--sub-directory',
            '',
          ]),
        ).resolves.not.toThrowError();

        await expect(outputDirectory).toMatchFiles({
          'file.txt': 'hello from a subdirectory!',
        });
      });
    });
  });
});

describe('non-empty directories', () => {
  describe.for(validModes)('with %s mode', mode => {
    const src = 'tiged/tiged-test-repo';

    const outputDirectory = getOutputDirectoryPath(
      `non-empty directories with ${mode} mode cli test`,
    );

    beforeAll(async () => {
      await fs.mkdir(outputDirectory, { recursive: true });

      await fs.writeFile(path.join(outputDirectory, 'file.txt'), 'not empty', {
        encoding: 'utf-8',
      });
    });

    it('creates a new folder when <dest> is omitted', async ({
      expect,
      task,
    }) => {
      const outputDirectory = getOutputDirectoryPath(`${task.name}-${task.id}`);

      await expect(
        runTigedCLI(['--mode', mode, src, outputDirectory]),
      ).resolves.not.toThrowError();

      await expect(outputDirectory).toMatchFiles({
        'file.txt': 'hello from github!',
        subdir: null,
        'subdir/file.txt': 'hello from a subdirectory!',
      });
    });

    // TODO: Make sure this can work in git mode.
    it('can clone a root file', { todo: true }, async ({ expect, task }) => {
      const outputDirectory = getOutputDirectoryPath(`test-repo/${task.name}`);

      await expect(
        runTigedCLI(['--mode', mode, `${src}/file.txt`, outputDirectory]),
      ).resolves.not.toThrowError();

      await expect(outputDirectory).toMatchFiles({
        'file.txt': 'hello from github!',
      });
    });

    // TODO: Make sure this can work in git mode.
    it(
      'can clone a single file',
      { todo: mode === 'git' },
      async ({ expect, task }) => {
        const outputDirectory = getOutputDirectoryPath(
          `${task.name}-${task.id}`,
        );

        await expect(
          runTigedCLI([
            '--mode',
            mode,
            `${src}/subdir/file.txt`,
            outputDirectory,
          ]),
        ).resolves.not.toThrowError();

        await expect(outputDirectory).toMatchFiles({
          'file.txt': 'hello from a subdirectory!',
        });
      },
    );

    // TODO: Make sure this can work in git mode.
    describe('single file + --force', { todo: mode === 'git' }, () => {
      let outputDirectory: string;

      it('fails without --force', async ({ expect, task }) => {
        outputDirectory = getOutputDirectoryPath(`${task.name}-${task.id}`);

        await fs.mkdir(outputDirectory, {
          recursive: true,
        });

        await fs.writeFile(
          path.join(outputDirectory, 'file.txt'),
          'not empty',
          { encoding: 'utf-8' },
        );

        await expect(
          runTigedCLI([
            'tiged/tiged-test-repo/subdir/file.txt',
            outputDirectory,
            '--mode',
            mode,
            '-v',
          ]),
        ).rejects.toThrowError(/destination directory is not empty/);
      });

      it('succeeds with --force', async ({ expect }) => {
        await expect(
          runTigedCLI([
            'tiged/tiged-test-repo/subdir/file.txt',
            outputDirectory,
            '--mode',
            mode,
            '-v',
            '--force',
          ]),
        ).resolves.not.toThrowError();

        await expect(outputDirectory).toMatchFiles({
          'file.txt': 'hello from a subdirectory!',
        });
      });
    });

    it('fails without --force', async ({ expect }) => {
      await expect(
        runTigedCLI(['--mode', mode, src, outputDirectory]),
      ).rejects.toThrowError(
        /destination directory is not empty, aborting\. Use --force to override/,
      );
    });

    it('succeeds with --force', async () => {
      await expect(
        runTigedCLI(['--force', '--mode', mode, src, outputDirectory]),
      ).resolves.not.toThrowError();
    });
  });
});

// TODO: Make sure this can work in git mode.
describe('can clone one file', () => {
  describe.for(validModes.slice(0, 1))('with %s mode', mode => {
    it('can clone one file', async ({ expect, task }) => {
      const outputDirectory = getOutputDirectoryPath(`${task.name}-${task.id}`);

      await expect(
        runTigedCLI([
          '-v',
          '--mode',
          mode,
          'tiged/tiged-test-repo/subdir/file.txt',
          outputDirectory,
        ]),
      ).resolves.not.toThrowError();

      await expect(outputDirectory).toMatchFiles({
        'file.txt': 'hello from a subdirectory!',
      });
    });
  });
});

describe('actions', () => {
  describe.for(validModes)('with %s mode', mode => {
    it('removes specified file', async ({ task }) => {
      const outputDirectory = getOutputDirectoryPath(`${task.name}-${task.id}`);

      await expect(
        runTigedCLI([
          '--mode',
          mode,
          'tiged/tiged-test-repo-remove-only',
          outputDirectory,
        ]),
      ).resolves.not.toThrowError();

      await expect(outputDirectory).toMatchFiles({});
    });

    it('clones repo and removes specified file', async ({ task }) => {
      const outputDirectory = getOutputDirectoryPath(`${task.name}-${task.id}`);

      await expect(
        runTigedCLI([
          '--mode',
          mode,
          'tiged/tiged-test-repo-remove',
          outputDirectory,
        ]),
      ).resolves.not.toThrowError();

      await expect(outputDirectory).toMatchFiles({
        'other.txt': 'hello from github!',
        subdir: null,
        'subdir/file.txt': 'hello from a subdirectory!',
      });
    });

    it('removes and adds nested files', async ({ task }) => {
      const outputDirectory = getOutputDirectoryPath(`${task.name}-${task.id}`);

      await expect(
        runTigedCLI([
          '--mode',
          mode,
          'tiged/tiged-test-repo-nested-actions',
          outputDirectory,
        ]),
      ).resolves.not.toThrowError();

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

describe('old hash', () => {
  describe.for(validModes)('with %s mode', mode => {
    it.for([
      'tiged/tiged-test#525e8fef2c6b5e261511adc55f410d83ca5d8256',
      'github:tiged/tiged-test#525e8fef2c6b5e261511adc55f410d83ca5d8256',
      'git@github.com:tiged/tiged-test#525e8fef2c6b5e261511adc55f410d83ca5d8256',
      'https://github.com/tiged/tiged-test#525e8fef2c6b5e261511adc55f410d83ca5d8256',
      'https://github.com/tiged/tiged-test.git#525e8fef2c6b5e261511adc55f410d83ca5d8256',
    ] as const)('%s', async (src, { expect, task }) => {
      const outputDirectory = getOutputDirectoryPath(`${task.name}-${task.id}`);

      await expect(
        runTigedCLI(['--mode', mode, src, outputDirectory]),
      ).resolves.not.toThrowError();

      await expect(outputDirectory).toMatchFiles({
        'README.md': '# tiged-test\nFor testing',
        subdir: null,
        'subdir/file': 'Hello, champ!',
      });
    });

    describe('using HEAD and commit hash at the same time', () => {
      it.for([
        'tiged/tiged-test#HEAD#525e8fef2c6b5e261511adc55f410d83ca5d8256',
        'github:tiged/tiged-test#HEAD#525e8fef2c6b5e261511adc55f410d83ca5d8256',
        'git@github.com:tiged/tiged-test#HEAD#525e8fef2c6b5e261511adc55f410d83ca5d8256',
        'https://github.com/tiged/tiged-test#HEAD#525e8fef2c6b5e261511adc55f410d83ca5d8256',
        'https://github.com/tiged/tiged-test.git#HEAD#525e8fef2c6b5e261511adc55f410d83ca5d8256',
        'https://github.com/tiged/tiged-test#HEAD#525e8fef2c6b5e261511adc55f410d83ca5d8256.git',
      ] as const)('%s', async (src, { expect, task }) => {
        const outputDirectory = getOutputDirectoryPath(
          `${task.name}-${task.id}`,
        );

        await expect(
          runTigedCLI(['--mode', mode, src, outputDirectory]),
        ).resolves.not.toThrowError();

        await expect(outputDirectory).toMatchFiles({
          'README.md': '# tiged-test\nFor testing',
          subdir: null,
          'subdir/file': 'Hello, champ!',
        });
      });
    });

    describe('is able to clone sub-directory', () => {
      it.for([
        'tiged/tiged-test/subdir#b09755bc4cca3d3b398fbe5e411daeae79869581',
        'github:tiged/tiged-test/subdir#b09755bc4cca3d3b398fbe5e411daeae79869581',
        'git@github.com:tiged/tiged-test/subdir#b09755bc4cca3d3b398fbe5e411daeae79869581',
        'https://github.com/tiged/tiged-test/subdir#b09755bc4cca3d3b398fbe5e411daeae79869581',
        'https://github.com/tiged/tiged-test/subdir#HEAD#b09755bc4cca3d3b398fbe5e411daeae79869581',
        'https://github.com/tiged/tiged-test.git/subdir#b09755bc4cca3d3b398fbe5e411daeae79869581',
        'https://github.com/tiged/tiged-test.git/subdir#HEAD#b09755bc4cca3d3b398fbe5e411daeae79869581',
        'https://github.com/tiged/tiged-test/subdir#HEAD#b09755bc4cca3d3b398fbe5e411daeae79869581.git',
      ] as const)('%s', async (src, { expect, task }) => {
        const outputDirectory = getOutputDirectoryPath(
          `${task.name}-${task.id}`,
        );

        await expect(
          runTigedCLI(['--mode', mode, src, outputDirectory]),
        ).resolves.not.toThrowError();

        await expect(outputDirectory).toMatchFiles({
          file: 'Hello, champ!',
        });
      });
    });
  });
});

describe('is able to clone correctly', () => {
  describe.for(validModes)('using %s mode', mode => {
    it.for([
      'tiged/tiged-test',
      'github:tiged/tiged-test.git',
      'git@github.com:tiged/tiged-test.git',
      'https://github.com/tiged/tiged-test.git',
    ] as const)('%s', async (src, { expect, task }) => {
      const outputDirectory = getOutputDirectoryPath(`${task.name}-${task.id}`);

      await expect(
        runTigedCLI(['--mode', mode, src, outputDirectory]),
      ).resolves.not.toThrowError();

      await expect(outputDirectory).toMatchFiles({
        'README.md': 'tiged is awesome',
        subdir: null,
        'subdir/file': 'Hello, buddy!',
      });
    });
  });
});

describe('can clone a single file', () => {
  const testCases = [
    'tiged/tiged-test-repo',
    'github:tiged/tiged-test-repo.git',
    'git@github.com:tiged/tiged-test-repo.git',
    'https://github.com/tiged/tiged-test-repo.git',
  ] as const;

  describe.for(validModes)('using %s mode', mode => {
    describe('with inferred sub-directory (repo/file.txt) syntax', () => {
      it.for(testCases)('%s', async (src, { expect, task }) => {
        const outputDirectory = getOutputDirectoryPath(
          `${task.name}-${task.id}`,
        );

        await expect(
          runTigedCLI([
            '--mode',
            mode,
            `${src}/subdir/file.txt`,
            outputDirectory,
          ]),
        ).resolves.not.toThrowError();

        await expect(outputDirectory).toMatchFiles({
          'file.txt': 'hello from a subdirectory!',
        });
      });
    });

    describe('using --sub-directory', () => {
      it.for(testCases)('%s', async (src, { expect, task }) => {
        const outputDirectory = getOutputDirectoryPath(
          `${task.name}-${task.id}`,
        );

        await expect(
          runTigedCLI([
            '--mode',
            mode,
            src,
            outputDirectory,
            '--sub-directory',
            'subdir/file.txt',
          ]),
        ).resolves.not.toThrowError();

        await expect(outputDirectory).toMatchFiles({
          'file.txt': 'hello from a subdirectory!',
        });
      });
    });
  });
});

describe('commit hash', () => {
  it('is able to clone non ref hash', async ({ expect, task }) => {
    const outputDirectory = getOutputDirectoryPath(`${task.name}-${task.id}`);

    await expect(
      runTigedCLI([
        'https://github.com/tiged/find-commit-hash-fix#83d5cae7fc5176f73486ffe82144044711930073',
        outputDirectory,
      ]),
    ).resolves.not.toThrowError();
  });
});
