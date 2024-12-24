import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  getOutputDirectoryPath,
  runTigedCLI,
  validModes,
} from './test-utils.js';

describe('GitHub', () => {
  describe.each(validModes)('with %s mode', mode => {
    it.for([
      'tiged/tiged-test-repo-compose',
      'tiged/tiged-test-repo',
      'github:tiged/tiged-test-repo',
      'git@github.com:tiged/tiged-test-repo',
      'https://github.com/tiged/tiged-test-repo.git',
    ] as const)('%s', async (src, { expect, task }) => {
      const outputDirectory = getOutputDirectoryPath(`${task.name}${task.id}`);

      await expect(
        runTigedCLI(['--mode', mode, src, outputDirectory]),
      ).resolves.not.toThrow();

      await expect(outputDirectory).toMatchFiles({
        'file.txt': 'hello from github!',
        subdir: null,
        'subdir/file.txt': 'hello from a subdirectory!',
      });
    });
  });
});

describe('GitLab', () => {
  describe.each(validModes)('with %s mode', mode => {
    it.for([
      'gitlab:nake89/tiged-test-repo',
      'git@gitlab.com:nake89/tiged-test-repo',
      'https://gitlab.com/nake89/tiged-test-repo.git',
    ] as const)('%s', async (src, { expect, task }) => {
      const outputDirectory = getOutputDirectoryPath(`${task.name}${task.id}`);

      await expect(
        runTigedCLI(['--mode', mode, src, outputDirectory]),
      ).resolves.not.toThrow();

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
          `${task.name}${task.id}`,
        );

        await expect(
          runTigedCLI(['--mode', mode, '--subgroup', src, outputDirectory]),
        ).resolves.not.toThrow();

        await expect(outputDirectory).toMatchFiles({
          'main.tf': 'Subgroup test',
          subdir1: null,
          'subdir1/subdir2': null,
          'subdir1/subdir2/file.txt': "I'm a file.",
          'subdir1/.gitkeep': '',
          'subdir1/subdir2/.gitkeep': '',
        });
      });

      describe('with sub-directory', () => {
        it.for(testCases)('%s', async (src, { expect, task }) => {
          const outputDirectory = getOutputDirectoryPath(
            `${task.name}${task.id}`,
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
          ).resolves.not.toThrow();

          await expect(outputDirectory).toMatchFiles({
            subdir2: null,
            'subdir2/file.txt': "I'm a file.",
            '.gitkeep': '',
            'subdir2/.gitkeep': '',
          });
        });
      });

      describe('with nested sub-directory', () => {
        it.for(testCases)('%s', async (src, { expect, task }) => {
          const outputDirectory = getOutputDirectoryPath(
            `${task.name}${task.id}`,
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
          ).resolves.not.toThrow();

          await expect(outputDirectory).toMatchFiles({
            'file.txt': "I'm a file.",
            '.gitkeep': '',
          });
        });
      });
    });
  });
});

describe('BitBucket', { timeout: 10_000 }, () => {
  describe.each(validModes)('with %s mode', mode => {
    it.for([
      'bitbucket:nake89/tiged-test-repo',
      'git@bitbucket.org:nake89/tiged-test-repo',
      'https://bitbucket.org/nake89/tiged-test-repo.git',
    ] as const)('%s', async (src, { expect, task }) => {
      const outputDirectory = getOutputDirectoryPath(`${task.name}${task.id}`);

      await expect(
        runTigedCLI(['--mode', mode, src, outputDirectory]),
      ).resolves.not.toThrow();

      await expect(outputDirectory).toMatchFiles({
        'file.txt': 'hello from bitbucket',
      });
    });
  });
});

describe('SourceHut', () => {
  describe.each(validModes)('with %s mode', mode => {
    it.for([
      'git.sr.ht/~satotake/degit-test-repo',
      'git@git.sr.ht:~satotake/degit-test-repo',
      'https://git.sr.ht/~satotake/degit-test-repo.git',
    ] as const)('%s', async (src, { expect, task }) => {
      const outputDirectory = getOutputDirectoryPath(`${task.name}${task.id}`);

      await expect(
        runTigedCLI(['--mode', mode, src, outputDirectory]),
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
      'git@codeberg.org:joaopalmeiro/tiged-test-repo',
      'https://codeberg.org/joaopalmeiro/tiged-test-repo.git',
    ] as const)('%s', async (src, { expect, task }) => {
      const outputDirectory = getOutputDirectoryPath(`${task.name}${task.id}`);

      await expect(
        runTigedCLI(['--mode', mode, src, outputDirectory]),
      ).resolves.not.toThrow();

      await expect(outputDirectory).toMatchFiles({
        'file.txt': 'hello from codeberg!',
      });
    });
  });
});

// TODO: This falls back to `git` mode if `tar` mode is explicitly set.
describe('Hugging Face', () => {
  describe.each(validModes)('with %s mode', mode => {
    it.for([
      'huggingface:severo/degit-test-repo',
      'git@huggingface.co:severo/degit-test-repo',
      'https://huggingface.co/severo/degit-test-repo.git',
    ] as const)('%s', async (src, { expect, task }) => {
      const outputDirectory = getOutputDirectoryPath(`${task.name}${task.id}`);

      await expect(
        runTigedCLI([src, '--mode', mode, outputDirectory]),
      ).resolves.not.toThrow();

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

  describe.each(validModes)('with %s mode', mode => {
    describe('using inferred sub-directory (repo/subdir) syntax', () => {
      it.for(testCases)('%s', async (src, { expect, task }) => {
        const outputDirectory = getOutputDirectoryPath(
          `${task.name}${task.id}`,
        );

        await expect(
          runTigedCLI(['--mode', mode, `${src}/subdir`, outputDirectory]),
        ).resolves.not.toThrow();

        await expect(outputDirectory).toMatchFiles({
          'file.txt': 'hello from a subdirectory!',
        });
      });
    });

    describe('using --sub-directory', () => {
      it.for(testCases)('%s', async (src, { expect, task }) => {
        const outputDirectory = getOutputDirectoryPath(
          `${task.name}${task.id}`,
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
        ).resolves.not.toThrow();

        await expect(outputDirectory).toMatchFiles({
          'file.txt': 'hello from a subdirectory!',
        });
      });
    });

    describe('non-existent sub-directories throw an error', () => {
      describe('using inferred sub-directory (repo/subdir) syntax', () => {
        it.for(testCases)('%s', async (src, { expect, task }) => {
          const outputDirectory = getOutputDirectoryPath(
            `${task.name}${task.id}`,
          );

          await expect(
            runTigedCLI([
              '--mode',
              mode,
              `${src}/non-existent-dir`,
              outputDirectory,
            ]),
          ).rejects.toThrow(
            /No files to extract\. Make sure you typed in the sub-directory name correctly\./,
          );
        });
      });

      describe('using --sub-directory', () => {
        it.for(testCases)('%s', async (src, { expect, task }) => {
          const outputDirectory = getOutputDirectoryPath(
            `${task.name}${task.id}`,
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
          ).rejects.toThrow(
            /No files to extract\. Make sure you typed in the sub-directory name correctly\./,
          );
        });
      });
    });

    describe('using both --sub-directory and repo/subdir', () => {
      it.for(testCases)('%s', async (src, { expect, task }) => {
        const outputDirectory = getOutputDirectoryPath(
          `${task.name}${task.id}`,
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
        ).resolves.not.toThrow();

        await expect(outputDirectory).toMatchFiles({
          'file.txt': 'hello from a subdirectory!',
        });
      });
    });

    describe('--sub-directory overrides repo/subdir', () => {
      it.for(testCases)('%s', async (src, { expect, task }) => {
        const outputDirectory = getOutputDirectoryPath(
          `${task.name}${task.id}`,
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
        ).resolves.not.toThrow();

        await expect(outputDirectory).toMatchFiles({
          'file.txt': 'hello from a subdirectory!',
        });
      });
    });
  });
});

describe('non-empty directories', () => {
  describe.each(validModes)('with %s mode', mode => {
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

    it('fails without --force', async () => {
      await expect(
        runTigedCLI(['--mode', mode, src, outputDirectory]),
      ).rejects.toThrow(
        /destination directory is not empty, aborting\. Use --force to override/,
      );
    });

    it('succeeds with --force', async () => {
      await expect(
        runTigedCLI(['--force', '--mode', mode, src, outputDirectory]),
      ).resolves.not.toThrow();
    });
  });
});

describe('actions', () => {
  describe.each(validModes)('with %s mode', mode => {
    it('removes specified file', async ({ task }) => {
      const outputDirectory = getOutputDirectoryPath(`${task.name}${task.id}`);

      await expect(
        runTigedCLI([
          '--mode',
          mode,
          'tiged/tiged-test-repo-remove-only',
          outputDirectory,
        ]),
      ).resolves.not.toThrow();

      await expect(outputDirectory).toMatchFiles({});
    });

    it('clones repo and removes specified file', async ({ task }) => {
      const outputDirectory = getOutputDirectoryPath(`${task.name}${task.id}`);

      await expect(
        runTigedCLI([
          '--mode',
          mode,
          'tiged/tiged-test-repo-remove',
          outputDirectory,
        ]),
      ).resolves.not.toThrow();

      await expect(outputDirectory).toMatchFiles({
        'other.txt': 'hello from github!',
        subdir: null,
        'subdir/file.txt': 'hello from a subdirectory!',
      });
    });

    it('removes and adds nested files', async ({ task }) => {
      const outputDirectory = getOutputDirectoryPath(`${task.name}${task.id}`);

      await expect(
        runTigedCLI([
          '--mode',
          mode,
          'tiged/tiged-test-repo-nested-actions',
          outputDirectory,
        ]),
      ).resolves.not.toThrow();

      await expect(outputDirectory).toMatchFiles({
        dir: null,
        folder: null,
        subdir: null,
        'folder/file.txt': 'hello from clobber file!',
        'folder/other.txt': 'hello from other file!',
        'subdir/file.txt': 'hello from a subdirectory!',
      });
    });
  });
});

describe('old hash', () => {
  describe.each(validModes)('with %s mode', mode => {
    it.for([
      'tiged/tiged-test#525e8fef2c6b5e261511adc55f410d83ca5d8256',
      'github:tiged/tiged-test#525e8fef2c6b5e261511adc55f410d83ca5d8256',
      'git@github.com:tiged/tiged-test#525e8fef2c6b5e261511adc55f410d83ca5d8256',
      'https://github.com/tiged/tiged-test#525e8fef2c6b5e261511adc55f410d83ca5d8256',
      'https://github.com/tiged/tiged-test.git#525e8fef2c6b5e261511adc55f410d83ca5d8256',
    ] as const)('%s', async (src, { expect, task }) => {
      const outputDirectory = getOutputDirectoryPath(`${task.name}${task.id}`);

      await expect(
        runTigedCLI(['--mode', mode, src, outputDirectory]),
      ).resolves.not.toThrow();

      await expect(outputDirectory).toMatchFiles({
        subdir: null,
        'README.md': '# tiged-test\nFor testing',
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
          `${task.name}${task.id}`,
        );

        await expect(
          runTigedCLI(['--mode', mode, src, outputDirectory]),
        ).resolves.not.toThrow();

        await expect(outputDirectory).toMatchFiles({
          subdir: null,
          'README.md': '# tiged-test\nFor testing',
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
          `${task.name}${task.id}`,
        );

        await expect(
          runTigedCLI(['--mode', mode, src, outputDirectory]),
        ).resolves.not.toThrow();

        await expect(outputDirectory).toMatchFiles({
          file: 'Hello, champ!',
        });
      });
    });
  });
});

describe('is able to clone correctly', () => {
  describe.each(validModes)('using %s mode', mode => {
    it.for([
      'tiged/tiged-test',
      'github:tiged/tiged-test.git',
      'git@github.com:tiged/tiged-test.git',
      'https://github.com/tiged/tiged-test.git',
    ] as const)('%s', async (src, { expect, task }) => {
      const outputDirectory = getOutputDirectoryPath(`${task.name}${task.id}`);

      await expect(
        runTigedCLI(['--mode', mode, src, outputDirectory]),
      ).resolves.not.toThrow();

      await expect(outputDirectory).toMatchFiles({
        subdir: null,
        'README.md': 'tiged is awesome',
        'subdir/file': 'Hello, buddy!',
      });
    });
  });
});

describe('commit hash', () => {
  it('is able to clone non ref hash', async ({ task, expect }) => {
    const outputDirectory = getOutputDirectoryPath(`${task.name}${task.id}`);

    await expect(
      runTigedCLI([
        'https://github.com/tiged/find-commit-hash-fix#83d5cae7fc5176f73486ffe82144044711930073',
        outputDirectory,
      ]),
    ).resolves.not.toThrow();
  });
});
