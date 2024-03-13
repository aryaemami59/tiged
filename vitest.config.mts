import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		watch: false,
    pool: "vmForks",
    allowOnly: true,
		globals: true
	},
	define: { 'import.meta.vitest': 'undefined' }
});
