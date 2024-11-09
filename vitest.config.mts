import packageJson from 'tiged/package.json' with { type: 'json' };
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

const vitestConfig = defineConfig({
  plugins: [
    tsconfigPaths({
      configNames: ['tsconfig.json'],
      projects: ['./tsconfig.json'],
      root: import.meta.dirname,
    }),
  ],

  test: {
    name: packageJson.name,
    root: import.meta.dirname,
    dir: 'test',

    reporters: process.env.GITHUB_ACTIONS
      ? [['github-actions'], ['verbose']]
      : [['verbose']],

    alias: process.env.TEST_DIST
      ? {
          tiged: new URL('node_modules/tiged', import.meta.url).pathname,
        }
      : undefined,

    watch: false,
    setupFiles: ['./test/vitest.setup.ts'],
    globalSetup: ['./test/vitest-global.setup.ts'],
    globals: true,
  },

  define: { 'import.meta.vitest': 'undefined' },
});

export default vitestConfig;
