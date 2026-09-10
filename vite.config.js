import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'

// The GraphQL/REST dev middleware is imported LAZILY inside configureServer:
// src/server/yoga.js resolves the JWT signing secret at import time and
// refuses to start under NODE_ENV=production without one (fail-closed), so a
// static import here would make every production `vite build` demand a real
// secret just to bundle the frontend. configureServer only runs under
// `vite dev`, so the import stays dev-only too.
function graphqlYogaPlugin() {
	return {
		name: 'vite-plugin-graphql-yoga',
		async configureServer(server) {
			const { yoga, restApiHandler } = await import('./src/server/yoga.js');
			server.middlewares.use(yoga.graphqlEndpoint, yoga);
			server.middlewares.use('/api', restApiHandler);
		}
	};
}

// https://vite.dev/config/
export default defineConfig({
	plugins: [
		tailwindcss(),
		svelte(),
		graphqlYogaPlugin()
	],
})
