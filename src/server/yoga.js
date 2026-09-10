import { createYoga } from 'graphql-yoga';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { loadFilesSync } from '@graphql-tools/load-files';
import { mergeTypeDefs } from '@graphql-tools/merge';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolvers } from './resolvers.js';
import { restApiHandler } from './rest.js';
import { verifyAuthToken } from './auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load schema
const typeDefs = mergeTypeDefs(loadFilesSync(path.join(__dirname, '../graphql'), { extensions: ['graphql'] }));
const schema = makeExecutableSchema({ typeDefs, resolvers });

// Setup GraphQL Yoga
const yoga = createYoga({
	schema,
	graphqlEndpoint: '/graphql',
	context: async ({ request }) => {
		let userId = null;
		let token = null;
		const authHeader = request.headers.get('authorization');
		if (authHeader && authHeader.startsWith('Bearer ')) {
			token = authHeader.split(' ')[1];
			const decoded = await verifyAuthToken(token);
			if (decoded) userId = decoded.userId;
		}
		// Request has no socket; fall back to the first X-Forwarded-For hop.
		// The limiter keys per-account too, so a spoofed header still can't
		// bypass the per-account bucket.
		const forwarded = request.headers.get('x-forwarded-for');
		const clientIp = forwarded ? forwarded.split(',')[0].trim() : 'unknown';
		return { userId, token, clientIp };
	}
});

// Named exports for the vite plugin (see ../../vite.config.js). The plugin
// lazily imports this module inside configureServer — which only runs under
// `vite dev` — so a static `vite build` (NODE_ENV=production) never executes
// these module-level statements and never requires a production JWT_SECRET
// just to bundle the frontend.
export { yoga, restApiHandler };
