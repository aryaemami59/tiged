import * as fs from 'node:fs/promises';
import { rimraf } from 'rimraf';
import type { TestProject } from 'vitest/node';
import { fixturesDirectoryName } from './test-utils.js';

export async function setup({ provide }: TestProject): Promise<void> {
  await rimraf(fixturesDirectoryName);
  await fs.mkdir(fixturesDirectoryName, { recursive: true });
}
