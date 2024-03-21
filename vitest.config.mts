import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [tsconfigPaths({ projects: ['./tsconfig.json'] })],
	test: {
		watch: false,
		allowOnly: true,
		globals: true
	},
	define: { 'import.meta.vitest': 'undefined' }
});
