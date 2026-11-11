import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';

// Set by `tauri android dev` / `tauri ios dev` so a phone can reach this dev server.
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// Static SPA in dist/web: Tauri bundles it, and the Worker serves the same files on the web.
			adapter: adapter({ pages: 'dist/web', assets: 'dist/web', fallback: 'index.html' })
		})
	],
	clearScreen: false,
	server: {
		port: 5173,
		strictPort: true,
		host: host || false,
		hmr: host ? { protocol: 'ws', host, port: 5174 } : undefined,
		// In dev, /api goes to `pnpm dev:api` (wrangler) so the app can always use relative URLs.
		proxy: { '/api': 'http://localhost:8787' },
		watch: { ignored: ['**/src/tauri/**'] }
	},
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.js',
				test: {
					name: 'unit',
					environment: 'node',
					include: ['src/**/*.{test,spec}.js', 'worker/**/*.{test,spec}.js'],
					exclude: ['src/tauri/**', 'node_modules/**']
				}
			}
		]
	}
});
