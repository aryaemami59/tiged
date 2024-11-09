import * as path from 'node:path';
import { tiged } from 'tiged';
import {
  convertSpecialCharsToHyphens,
  defaultTigedOptions,
  fixturesDirectoryName,
} from './test-utils.js';

describe('api', () => {
  it('is usable from node scripts', async ({ task }) => {
    const sanitizedPath = convertSpecialCharsToHyphens(
      `${task.name}${task.id}`,
    );

    const outputDirectory = path.join(fixturesDirectoryName, sanitizedPath);

    await expect(
      tiged('tiged/tiged-test-repo', {
        ...defaultTigedOptions,
        force: true,
        verbose: true,
      }).clone(outputDirectory),
    ).resolves.not.toThrow();

    await expect(outputDirectory).toMatchFiles({
      'file.txt': 'hello from github!',
      subdir: null,
      'subdir/file.txt': 'hello from a subdirectory!',
    });
  });

  describe('github', { todo: true }, () => {
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
        tiged(src, { ...defaultTigedOptions }).clone(outputDirectory),
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
        tiged(src, { ...defaultTigedOptions, mode: 'git' }).clone(
          outputDirectory,
        ),
      ).resolves.not.toThrow();

      await expect(outputDirectory).toMatchFiles({
        'file.txt': 'hello from github!',
        subdir: null,
        'subdir/file.txt': 'hello from a subdirectory!',
      });
    });
  });
});
