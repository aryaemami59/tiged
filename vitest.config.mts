import * as path from 'node:path';
import { defineConfig } from 'vitest/config';
import packageJson from './package.json' with { type: 'json' };

const vitestConfig = defineConfig({
  define: {
    'import.meta.vitest': 'undefined',
  },

  resolve: {
    tsconfigPaths: true,
  },

  root: import.meta.dirname,

  test: {
    alias: process.env.TEST_DIST
      ? [
          {
            find: packageJson.name,
            replacement: path.join(
              import.meta.dirname,
              'node_modules',
              packageJson.name,
            ),
          },
        ]
      : [],

    chaiConfig: {
      truncateThreshold: 1000,
    },

    dir: path.join(import.meta.dirname, 'test'),
    globals: true,
    globalSetup: ['./test/vitest-global.setup.ts'],
    include: ['**/*.test.?(c|m)ts?(x)'],

    name: {
      label: packageJson.name,
    },

    root: import.meta.dirname,
    setupFiles: ['./test/vitest.setup.ts'],

    testTimeout: process.env.CI ? 30_000 : 10_000,

    typecheck: {
      enabled: true,
      tsconfig: path.join(import.meta.dirname, 'tsconfig.json'),
    },

    unstubEnvs: true,
    watch: false,
  },
});

export default vitestConfig;
