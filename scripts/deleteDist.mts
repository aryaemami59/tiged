#!/usr/bin/env node --import=tsx/esm

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

void fs.rm(path.join(__dirname, '..', 'dist'), {
  force: true,
  recursive: true,
});
