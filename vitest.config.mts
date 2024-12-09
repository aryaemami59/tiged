import * as path from 'node:path';
import packageJson from 'tiged/package.json' with { type: 'json' };
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

const vitestConfig = defineConfig({
  define: {
    'import.meta.vitest': 'undefined',
  },

  plugins: [
    tsconfigPaths({
      configNames: ['tsconfig.json'],
      projects: [path.join(import.meta.dirname, 'tsconfig.json')],
      root: import.meta.dirname,
    }),
  ],

  root: import.meta.dirname,

  test: {
    alias: process.env.TEST_DIST
      ? [
          {
            find: packageJson.name,
            replacement: path.join(
              import.meta.dirname,
              'node_modules',
              'tiged',
            ),
          },
        ]
      : undefined,

    chaiConfig: {
      truncateThreshold: 1000,
    },

    dir: path.join(import.meta.dirname, 'test'),
    globals: true,
    globalSetup: ['./test/vitest-global.setup.ts'],
    name: packageJson.name,

    reporters: process.env.GITHUB_ACTIONS
      ? [['verbose', { summary: false }], ['github-actions']]
      : [['verbose']],

    root: import.meta.dirname,
    setupFiles: ['./test/vitest.setup.ts'],

    sequence: {
      concurrent: process.env.CI ? false : true,
    },

    testTimeout: process.env.CI ? 30_000 : 10_000,

    typecheck: {
      enabled: true,
      tsconfig: path.join(import.meta.dirname, 'tsconfig.json'),
    },

    watch: false,
  },
});

export default vitestConfig;
