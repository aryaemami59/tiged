#!/usr/bin/env -vS node --import=tsx

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const tsConfigPath = path.join(__dirname, '..', 'tsconfig.json');

const tsConfig = JSON.parse(await fs.readFile(tsConfigPath, 'utf-8'));

delete tsConfig.compilerOptions.paths;

fs.writeFile(tsConfigPath, tsConfig);
