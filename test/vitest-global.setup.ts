import * as fs from 'node:fs/promises';
import type { TestProject } from 'vitest/node';
import { fixturesDirectoryName } from './test-utils.js';

export async function setup({ provide }: TestProject) {
  await fs.rm(fixturesDirectoryName, { recursive: true, force: true });
  await fs.mkdir(fixturesDirectoryName, { recursive: true });
}
