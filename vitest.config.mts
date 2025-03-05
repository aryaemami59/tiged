import * as path from 'node:path';
import packageJson from 'tiged/package.json' with { type: 'json' };
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

const vitestConfig = defineConfig({
  plugins: [
    tsconfigPaths({
      configNames: ['tsconfig.json'],
      projects: [path.join(import.meta.dirname, 'tsconfig.json')],
      root: import.meta.dirname,
    }),
  ],

  test: {
    dir: path.join(import.meta.dirname, 'test'),
    name: packageJson.name,
    root: import.meta.dirname,

    chaiConfig: {
      truncateThreshold: 1000,
    },

    testTimeout: process.env.CI ? 30_000 : 10_000,

    sequence: {
      concurrent: process.env.CI ? false : true,
    },

    reporters: process.env.GITHUB_ACTIONS
      ? [['github-actions'], ['verbose']]
      : [['verbose']],

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

    typecheck: {
      enabled: true,
      tsconfig: path.join(import.meta.dirname, 'tsconfig.json'),
    },

    watch: false,
    setupFiles: ['./test/vitest.setup.ts'],
    globalSetup: ['./test/vitest-global.setup.ts'],
    globals: true,
  },

  define: {
    'import.meta.vitest': 'undefined',
  },
});

export default vitestConfig;
