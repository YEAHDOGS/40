import { createYoga } from 'graphql-yoga';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { loadFilesSync } from '@graphql-tools/load-files';
import { mergeTypeDefs } from '@graphql-tools/merge';
import path from 'path';
import { fileURLToPath } from 'url';
import pkg from '@prisma/client';
import { DateTimeResolver, JSONResolver } from 'graphql-scalars';
import { restApiHandler } from './rest.js';

const { PrismaClient } = pkg;
const prisma = new PrismaClient();
import { generateAuthToken, verifyAuthToken, revokeAuthToken } from './auth.js';
import { GraphQLError } from 'graphql';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let globalNextWipe = new Date();
globalNextWipe.setDate(globalNextWipe.getDate() + 15);

// Load all schema files
const typesArray = loadFilesSync(path.join(__dirname, '../graphql'), {
	extensions: ['graphql']
});

const typeDefs = mergeTypeDefs(typesArray);

// Helper to get current user from the authenticated context
const getCurrentUser = async (context) => {
	if (!context.userId) {
		throw new GraphQLError("Unauthorized. Please provide a valid token.", {
			extensions: { code: 'UNAUTHORIZED' }
		});
	}
	const user = await prisma.user.findUnique({ where: { id: context.userId } });
	if (!user) {
		throw new Error("User not found.");
	}
	return user;
};

const resolvers = {
	DateTime: DateTimeResolver,
	JSON: JSONResolver,

	User: {
		followersCount: async (parent) => {
			return prisma.follow.count({ where: { followingId: parent.id } });
		},
		followingCount: async (parent) => {
			return prisma.follow.count({ where: { followerId: parent.id } });
		},
		postsCount: async (parent) => {
			return prisma.post.count({ where: { authorId: parent.id } });
		},
		isFollowedBy: async (parent) => false,
		isFollowing: async (parent) => false,
		isBlocked: async () => false,
		isBlockedBy: async () => false,
		likesCount: async (parent) => {
			return prisma.like.count({ where: { userId: parent.id } });
		}
	},

	Post: {
		media: async (parent) => {
			return prisma.media.findMany({ where: { postId: parent.id } });
		},
		likesCount: async (parent) => {
			return prisma.like.count({ where: { postId: parent.id } });
		},
		repliesCount: async (parent) => {
			return prisma.post.count({ where: { replyToId: parent.id } });
		},
		retweetsCount: async (parent) => {
			return prisma.post.count({ where: { repostOfId: parent.id } });
		},
		quotesCount: async () => 0,
		bookmarksCount: async () => 0,
		viewsCount: async () => Math.floor(Math.random() * 1000),
		isLiked: async (parent, args, context) => {
			if (!context.userId) return false;
			const like = await prisma.like.findUnique({
				where: { userId_postId: { userId: context.userId, postId: parent.id } }
			});
			return !!like;
		},
		isRetweeted: async (parent, args, context) => {
			if (!context.userId) return false;
			const repost = await prisma.post.findFirst({
				where: { authorId: context.userId, repostOfId: parent.id }
			});
			return !!repost;
		},
		isBookmarked: async () => false,
		isReplyTo: async (parent) => !!parent.replyToId,
		author: async (parent) => {
			if (parent.author) return parent.author;
			return prisma.user.findUnique({ where: { id: parent.authorId } });
		},
		replies: async (parent) => {
			return prisma.post.findMany({
				where: { replyToId: parent.id },
				orderBy: { createdAt: 'asc' }
			});
		}
	},

	Query: {
		post: async (_, { id }) => {
			return prisma.post.findUnique({ where: { id } });
		},
		homeTimeline: async (_, { limit = 50, offset = 0 }) => {
			const posts = await prisma.post.findMany({
				take: limit,
				skip: offset,
				orderBy: { createdAt: 'desc' },
				include: { author: true, replyTo: { include: { author: true } }, repostOf: { include: { author: true } } }
			});
			const totalCount = await prisma.post.count();
			return {
				edges: posts.map(node => ({ cursor: node.id, node })),
				totalCount,
				pageInfo: {
					hasNextPage: offset + limit < totalCount,
					hasPreviousPage: offset > 0,
					startCursor: posts.length > 0 ? posts[0].id : null,
					endCursor: posts.length > 0 ? posts[posts.length - 1].id : null,
				}
			};
		},
		recommendedTimeline: async (_, { limit = 50, offset = 0 }) => {
			const posts = await prisma.post.findMany({
				take: limit,
				skip: offset,
				orderBy: { likes: { _count: 'desc' } },
				include: { author: true }
			});
			return {
				edges: posts.map(node => ({ cursor: node.id, node })),
				totalCount: await prisma.post.count(),
				pageInfo: { hasNextPage: false, hasPreviousPage: false, startCursor: null, endCursor: null }
			};
		},
		trends: async (_, { limit = 5 }) => {
			const trendingTags = await prisma.hashtag.findMany({
				take: limit,
				orderBy: { posts: { _count: 'desc' } }
			});
			return trendingTags.map((hashtag, index) => ({
				hashtag,
				usageCount: Math.floor(Math.random() * 10000) + 500, // mock count if no relations exist
				rank: index + 1
			}));
		},
		nextWipe: async () => globalNextWipe
	},

	Mutation: {
		signUp: async (_, { username, email, password, displayName }) => {
			// Create user
			const user = await prisma.user.create({
				data: {
					username,
					email,
					displayName,
					profileImage: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`,
					// ignoring password for now since it's a mock social provider system,
					// but normally we'd hash it here.
				}
			});
			const tokenString = await generateAuthToken(user);
			const token = {
				accessToken: tokenString,
				refreshToken: tokenString,
				expiresIn: 3456000,
				tokenType: "Bearer"
			};
			return { token, user };
		},
		login: async (_, { username, password }) => {
			const user = await prisma.user.findUnique({ where: { username } });
			if (!user) throw new Error("Invalid credentials");
			// skipping password check for mock flow
			const tokenString = await generateAuthToken(user);
			const token = {
				accessToken: tokenString,
				refreshToken: tokenString,
				expiresIn: 3456000,
				tokenType: "Bearer"
			};
			return { token, user };
		},
		logout: async (_, args, context) => {
			if (context.token) {
				await revokeAuthToken(context.token);
			}
			return true;
		},
		updateProfile: async (_, { input }, context) => {
			return prisma.user.update({
				where: { id: context.userId },
				data: input
			});
		},
		createPost: async (_, { input }, context) => {
			const post = await prisma.post.create({
				data: {
					content: input.content,
					authorId: context.userId,
					postType: input.media && input.media.length > 0 ? "IMAGE" : "TEXT",
					replyToId: input.replyToId || null,
				},
				include: { author: true }
			});

			if (input.media && input.media.length > 0) {
				for (const m of input.media) {
					await prisma.media.create({
						data: {
							url: m.url,
							mediaType: m.type,
							postId: post.id
						}
					});
				}
			}
			return post;
		},
		likePost: async (_, { postId }, context) => {
			return prisma.like.create({
				data: { userId: context.userId, postId }
			});
		},
		unlikePost: async (_, { postId }, context) => {
			await prisma.like.delete({
				where: { userId_postId: { userId: context.userId, postId } }
			});
			return true;
		},
		retweetPost: async (_, { postId }, context) => {
			return prisma.post.create({
				data: {
					content: "",
					authorId: context.userId,
					postType: "REPOST",
					repostOfId: postId
				},
				include: { author: true }
			});
		},
		followUser: async (_, { userId }, context) => {
			return prisma.follow.create({
				data: { followerId: context.userId, followingId: userId }
			});
		},
		triggerWipe: async () => {
			// Drop relations
			await prisma.like.deleteMany();
			await prisma.bookmark.deleteMany();
			await prisma.follow.deleteMany();
			await prisma.postHashtag.deleteMany();
			await prisma.hashtag.deleteMany();
			await prisma.media.deleteMany();
			await prisma.notification.deleteMany();
			await prisma.gameScore.deleteMany();
			await prisma.post.deleteMany();

			// Let's leave Users so we don't have to re-seed entirely, 
			// but normally this would drop Users too.
			console.log("Global Wipe Triggered");

			// Reset the mock nextWipe timer
			globalNextWipe = new Date();
			globalNextWipe.setDate(globalNextWipe.getDate() + 15);
			return true;
		}
	}
};

// Aspect-Oriented advice to intercept mutation authorization globally
const requireAuth = (resolver) => {
	return async (parent, args, context, info) => {
		if (!context.userId) {
			throw new GraphQLError("Unauthorized. Please provide a valid token.", {
				extensions: { code: 'UNAUTHORIZED' }
			});
		}
		return resolver(parent, args, context, info);
	};
};

for (const [name, resolver] of Object.entries(resolvers.Mutation)) {
	if (name !== 'signUp' && name !== 'login' && name !== 'triggerWipe') {
		resolvers.Mutation[name] = requireAuth(resolver);
	}
}

const schema = makeExecutableSchema({ typeDefs, resolvers });

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
			if (decoded) {
				userId = decoded.userId;
			}
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
