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
		return { userId, token };
	}
});

export default function graphqlYogaPlugin() {
	return {
		name: 'vite-plugin-graphql-yoga',
		configureServer(server) {
			server.middlewares.use(yoga.graphqlEndpoint, yoga);
			server.middlewares.use('/api', restApiHandler);
		}
	};
}
