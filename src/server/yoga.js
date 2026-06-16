import { createYoga } from 'graphql-yoga';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { loadFilesSync } from '@graphql-tools/load-files';
import { mergeTypeDefs } from '@graphql-tools/merge';
import path from 'path';
import { fileURLToPath } from 'url';
import pkg from '@prisma/client';

const { PrismaClient } = pkg;
const prisma = new PrismaClient();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load all schema files
const typesArray = loadFilesSync(path.join(__dirname, '../graphql'), {
	extensions: ['graphql']
});

const typeDefs = mergeTypeDefs(typesArray);

const resolvers = {
  Query: {
    homeTimeline: async (_, { limit = 50, offset = 0 }) => {
      const posts = await prisma.post.findMany({
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
        include: {
          author: true,
          likes: true,
          replies: true
        }
      });

      const totalCount = await prisma.post.count();

      const edges = posts.map(post => ({
        cursor: post.id,
        node: {
          ...post,
          createdAt: post.createdAt.toISOString(),
          updatedAt: post.updatedAt.toISOString(),
          likesCount: post.likes.length,
          repliesCount: post.replies.length,
          isLiked: false, // In a real app with auth, check if current user liked it
        }
      }));

      return {
        edges,
        totalCount,
        pageInfo: {
          hasNextPage: offset + limit < totalCount,
          hasPreviousPage: offset > 0,
          startCursor: edges.length > 0 ? edges[0].cursor : null,
          endCursor: edges.length > 0 ? edges[edges.length - 1].cursor : null,
        }
      };
    }
  },
  Mutation: {
    createPost: async (_, { input }) => {
      // In a real app, authorId would come from context (logged in user)
      // For now, let's grab the first user in the database
      const firstUser = await prisma.user.findFirst();
      if (!firstUser) throw new Error("No users found in database. Did you seed it?");

      const newPost = await prisma.post.create({
        data: {
          content: input.content,
          authorId: firstUser.id,
        },
        include: {
          author: true,
          likes: true,
          replies: true
        }
      });

      return {
        ...newPost,
        createdAt: newPost.createdAt.toISOString(),
        updatedAt: newPost.updatedAt.toISOString(),
        likesCount: 0,
        repliesCount: 0,
        isLiked: false
      };
    }
  }
};

// Create schema
const schema = makeExecutableSchema({ typeDefs, resolvers });

// Create Yoga instance
const yoga = createYoga({
	schema,
	graphqlEndpoint: '/graphql',
});

// Create Vite plugin
export default function graphqlYogaPlugin() {
	return {
		name: 'vite-plugin-graphql-yoga',
		configureServer(server) {
			server.middlewares.use(yoga.graphqlEndpoint, yoga);
		}
	};
}
