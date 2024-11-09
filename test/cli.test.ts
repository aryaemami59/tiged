import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  convertSpecialCharsToHyphens,
  fixturesDirectoryName,
  runTigedCLI,
} from './test-utils.js';

describe('github', () => {
  const testCases = [
    'tiged/tiged-test-repo-compose',
    'tiged/tiged-test-repo',
    'github:tiged/tiged-test-repo',
    'git@github.com:tiged/tiged-test-repo',
    'https://github.com/tiged/tiged-test-repo.git',
  ] as const;

  it.for(testCases)('%s', async (src, { expect, task }) => {
    const sanitizedPath = convertSpecialCharsToHyphens(
      `${task.name}${task.id}`,
    );

    const outputDirectory = path.join(fixturesDirectoryName, sanitizedPath);

    await expect(
      runTigedCLI(['-v', src, outputDirectory]),
    ).resolves.not.toThrow();

    await expect(outputDirectory).toMatchFiles({
      'file.txt': 'hello from github!',
      subdir: null,
      'subdir/file.txt': 'hello from a subdirectory!',
    });
  });

  it.for(testCases)('%s with git mode', async (src, { expect, task }) => {
    const sanitizedPath = convertSpecialCharsToHyphens(
      `${task.name}${task.id}`,
    );

    const outputDirectory = path.join(fixturesDirectoryName, sanitizedPath);

    await expect(
      runTigedCLI(['-v', '--mode=git', src, outputDirectory]),
    ).resolves.not.toThrow();

    await expect(outputDirectory).toMatchFiles({
      'file.txt': 'hello from github!',
      subdir: null,
      'subdir/file.txt': 'hello from a subdirectory!',
    });
  });
});

describe('gitlab', () => {
  it.for([
    'gitlab:nake89/tiged-test-repo',
    'git@gitlab.com:nake89/tiged-test-repo',
    'https://gitlab.com/nake89/tiged-test-repo.git',
  ])('%s', async (src, { expect, task }) => {
    const sanitizedPath = convertSpecialCharsToHyphens(
      `${task.name}${task.id}`,
    );

    const outputDirectory = path.join(fixturesDirectoryName, sanitizedPath);

    await expect(
      runTigedCLI(['-v', src, outputDirectory]),
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
        runTigedCLI(['-v', '--subgroup', task.name, outputDirectory]),
      ).resolves.not.toThrow();

      await expect(outputDirectory).toMatchFiles({
        'main.tf': 'Subgroup test',
        subdir1: null,
        'subdir1/subdir2': null,
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

        const outputDirectory = path.join(fixturesDirectoryName, sanitizedPath);

        await expect(
          runTigedCLI([
            '-v',
            '--subgroup',
            task.name,
            '--sub-directory',
            'subdir1',
            outputDirectory,
          ]),
        ).resolves.not.toThrow();

        await expect(outputDirectory).toMatchFiles({
          subdir2: null,
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

        const outputDirectory = path.join(fixturesDirectoryName, sanitizedPath);

        await expect(
          runTigedCLI([
            '-v',
            '--subgroup',
            task.name,
            '--sub-directory',
            'subdir1/subdir2',
            outputDirectory,
          ]),
        ).resolves.not.toThrow();

        await expect(outputDirectory).toMatchFiles({
          'file.txt': "I'm a file.",
        });
      });
    });
  });
});

describe('bitbucket', { timeout: 10_000 }, () => {
  it.for([
    'bitbucket:nake89/tiged-test-repo',
    'git@bitbucket.org:nake89/tiged-test-repo',
    'https://bitbucket.org/nake89/tiged-test-repo.git',
  ])('%s', async (src, { expect, task }) => {
    const sanitizedPath = convertSpecialCharsToHyphens(
      `${task.name}${task.id}`,
    );

    const outputDirectory = path.join(fixturesDirectoryName, sanitizedPath);

    await expect(
      runTigedCLI(['-v', src, outputDirectory]),
    ).resolves.not.toThrow();

    await expect(outputDirectory).toMatchFiles({
      'file.txt': 'hello from bitbucket',
    });
  });
});

describe('Sourcehut', () => {
  it.for([
    'git.sr.ht/~satotake/degit-test-repo',
    'https://git.sr.ht/~satotake/degit-test-repo',
    'git@git.sr.ht:~satotake/degit-test-repo',
  ])('%s', async (src, { expect, task }) => {
    const sanitizedPath = convertSpecialCharsToHyphens(
      `${task.name}${task.id}`,
    );

    const outputDirectory = path.join(fixturesDirectoryName, sanitizedPath);

    await expect(
      runTigedCLI(['-v', src, outputDirectory]),
    ).resolves.not.toThrow();

    await expect(outputDirectory).toMatchFiles({
      'file.txt': 'hello from sourcehut!',
    });
  });
});

describe('Codeberg', () => {
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
      runTigedCLI(['-v', src, outputDirectory]),
    ).resolves.not.toThrow();

    await expect(outputDirectory).toMatchFiles({
      'file.txt': 'hello from codeberg!',
    });
  });
});

describe('Hugging Face', () => {
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
      runTigedCLI(['-v', src, outputDirectory]),
    ).resolves.not.toThrow();

    await expect(outputDirectory).toMatchFiles({
      'file.txt': 'hello from Hugging Face',
      subdir: null,
      'subdir/file.txt': 'hello from a subdirectory!',
    });
  });
});

describe('Subdirectories', () => {
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
      runTigedCLI(['-v', src, outputDirectory]),
    ).resolves.not.toThrow();

    await expect(outputDirectory).toMatchFiles({
      'file.txt': `hello from a subdirectory!`,
    });
  });
});

describe('Non-existent subdirectory', () => {
  it('throws error', async ({ task }) => {
    const sanitizedPath = convertSpecialCharsToHyphens(
      `${task.name}${task.id}`,
    );

    const outputDirectory = path.join(fixturesDirectoryName, sanitizedPath);

    await expect(() =>
      runTigedCLI([
        '-v',
        'tiged/tiged-test-repo/non-existent-dir',
        outputDirectory,
      ]),
    ).rejects.toThrow(
      /No files to extract\. Make sure you typed in the subdirectory name correctly\./,
    );
  });
});

describe('non-empty directories', async () => {
  const src = 'tiged/tiged-test-repo';

  const sanitizedPath = convertSpecialCharsToHyphens('non-empty directories');

  const outputDirectory = await fs.mkdtemp(
    path.join(fixturesDirectoryName, sanitizedPath),
    { encoding: 'utf-8' },
  );

  await fs.writeFile(path.join(outputDirectory, 'file.txt'), 'not empty', {
    encoding: 'utf-8',
  });

  it('fails without --force', async () => {
    await expect(() =>
      runTigedCLI(['-v', src, outputDirectory]),
    ).rejects.toThrow(
      /destination directory is not empty, aborting\. Use --force to override/,
    );
  });

  it('succeeds with --force', async () => {
    await expect(
      runTigedCLI(['-fv', src, outputDirectory]),
    ).resolves.not.toThrow();
  });
});

describe('command line arguments', () => {
  it('allows flags wherever', async ({ task }) => {
    const sanitizedPath = convertSpecialCharsToHyphens(
      `${task.name}${task.id}`,
    );

    const outputDirectory = path.join(fixturesDirectoryName, sanitizedPath);

    await expect(
      runTigedCLI(['-v', 'tiged/tiged-test-repo', outputDirectory]),
    ).resolves.not.toThrow();

    await expect(outputDirectory).toMatchFiles({
      'file.txt': 'hello from github!',
      subdir: null,
      'subdir/file.txt': 'hello from a subdirectory!',
    });
  });
});

describe('actions', () => {
  it('removes specified file', async ({ task }) => {
    const sanitizedPath = convertSpecialCharsToHyphens(
      `${task.name}${task.id}`,
    );

    const outputDirectory = path.join(fixturesDirectoryName, sanitizedPath);

    await expect(
      runTigedCLI(['-v', 'tiged/tiged-test-repo-remove-only', outputDirectory]),
    ).resolves.not.toThrow();

    await expect(outputDirectory).toMatchFiles({});
  });

  it('clones repo and removes specified file', async ({ task }) => {
    const sanitizedPath = convertSpecialCharsToHyphens(
      `${task.name}${task.id}`,
    );

    const outputDirectory = path.join(fixturesDirectoryName, sanitizedPath);

    await expect(
      runTigedCLI(['-v', 'tiged/tiged-test-repo-remove', outputDirectory]),
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
      runTigedCLI([
        '-v',
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

describe('git mode old hash', () => {
  it('is able to clone correctly using git mode with old hash', async ({
    task,
  }) => {
    const sanitizedPath = convertSpecialCharsToHyphens(
      `${task.name}${task.id}`,
    );

    const outputDirectory = path.join(fixturesDirectoryName, sanitizedPath);

    await expect(
      runTigedCLI([
        '--mode=git',
        'https://github.com/tiged/tiged-test#525e8fef2c6b5e261511adc55f410d83ca5d8256',
        outputDirectory,
      ]),
    ).resolves.not.toThrow();

    await expect(outputDirectory).toMatchFiles({
      subdir: null,
      'README.md': `# tiged-test\nFor testing`,
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
      runTigedCLI([
        '--mode=git',
        'https://github.com/tiged/tiged-test.git/subdir#b09755bc4cca3d3b398fbe5e411daeae79869581',
        outputDirectory,
      ]),
    ).resolves.not.toThrow();

    await expect(outputDirectory).toMatchFiles({
      file: 'Hello, champ!',
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
      runTigedCLI([
        '--mode=git',
        'https://github.com/tiged/tiged-test.git',
        outputDirectory,
      ]),
    ).resolves.not.toThrow();

    await expect(outputDirectory).toMatchFiles({
      subdir: null,
      'README.md': `tiged is awesome`,
      'subdir/file': 'Hello, buddy!',
    });

    await expect(outputDirectory).not.toMatchFiles({
      subdir: null,
      'README.md': `# tiged-test\nFor testing`,
      'subdir/file': 'Hello, champ!',
    });
  });
});
