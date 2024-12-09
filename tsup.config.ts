import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import packageJson from 'tiged/package.json' with { type: 'json' };
import type { Options } from 'tsup';
import { defineConfig } from 'tsup';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const tsupConfig = defineConfig((overrideOptions): Options[] => {
  const commonOptions = {
    clean: true,
    entry: {
      index: path.join(__dirname, 'src', 'index.ts'),
    },
    removeNodeProtocol: false,
    shims: true,
    sourcemap: true,
    splitting: false,
    target: ['esnext', 'node20'],
    tsconfig: path.join(__dirname, 'tsconfig.build.json'),
    ...overrideOptions,
  } satisfies Options;

  return [
    {
      ...commonOptions,
      name: `${packageJson.name} Modern ESM`,
      format: ['esm'],
    },
    {
      ...commonOptions,
      name: `${packageJson.name} CJS Development`,
      format: ['cjs'],
    },
    {
      ...commonOptions,
      name: `${packageJson.name} CLI Development`,
      entry: {
        bin: path.join(__dirname, 'src', 'bin.ts'),
      },
      external: ['tiged'],
      format: ['cjs', 'esm'],
      minify: true,
    },
    {
      ...commonOptions,
      name: `${packageJson.name} ESM Type Definitions`,
      dts: {
        only: true,
      },
      format: ['esm'],
    },
    {
      ...commonOptions,
      name: `${packageJson.name} CJS Type Definitions`,
      dts: {
        only: true,
      },
      format: ['cjs'],
    },
  ];
});

export default tsupConfig;
