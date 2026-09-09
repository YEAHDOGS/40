import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import graphqlYogaPlugin from './src/server/yoga.js'

// https://vite.dev/config/
// base '/40/' = GitHub Pages project site (yeahdogs.github.io/40/).
// Keeps built asset URLs relative to the project path instead of domain root.
export default defineConfig({
	base: '/40/',
	plugins: [
		tailwindcss(),
		svelte(),
		graphqlYogaPlugin()
	],
})
