import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		globals: true,
		environment: 'jsdom',
		include: ['src/**/*.{test,spec}.ts', 'src/**/*.{test,spec}.tsx'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html'],
			include: ['src/**/*.ts', 'src/**/*.tsx'],
			exclude: ['src/**/*.d.ts', 'src/index.ts', 'src/types.ts'],
			thresholds: {
				lines: 90,
				functions: 90,
				branches: 80,
				statements: 90,
			},
		},
	},
});
