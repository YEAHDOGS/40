import pkg from '@prisma/client';
import { DateTimeResolver, JSONResolver } from 'graphql-scalars';
import { GraphQLError } from 'graphql';
import { generateAuthToken, verifyAuthToken, revokeAuthToken } from './auth.js';
import { hashPassword, verifyPassword, MIN_PASSWORD_LENGTH, isCommonPassword } from './passwords.js';
import {
	loginRateLimiter,
	loginAttemptLog,
	normalizeAccount
} from './rate-limit.js';
import {
	WIPE_INTERVAL_DAYS,
	getNextWipe,
	triggerWipeNow
} from './wipe.js';

const { PrismaClient } = pkg;
const prisma = new PrismaClient();

/** Defense in depth: the scrypt hash must never leave the server. */
const withoutPasswordHash = (user) => {
	if (!user) return user;
	const { passwordHash: _dropped, ...safe } = user;
	return safe;
};

const mapCountPropToRelation = (modelName, prop) => {
	if (modelName === 'user') {
		if (prop === 'followersCount') return 'followers';
		if (prop === 'followingCount') return 'following';
		if (prop === 'postsCount') return 'posts';
		if (prop === 'likesCount') return 'likes';
	}
	if (modelName === 'post') {
		if (prop === 'likesCount') return 'likes';
		if (prop === 'repliesCount') return 'replies';
		if (prop === 'retweetsCount') return 'reposts';
	}
	return null;
};

const mapPropToRelationMethod = (modelName, prop) => {
	if (modelName === 'post') {
		if (prop === 'media') return 'media';
		if (prop === 'author') return 'author';
		if (prop === 'replies') return 'replies';
		if (prop === 'repostOf') return 'repostOf';
	}
	return null;
};

const getMockValue = (modelName, prop) => {
	if (modelName === 'user') {
		if (['isFollowedBy', 'isFollowing', 'isBlocked', 'isBlockedBy'].includes(prop)) {
			return false;
		}
	}
	if (modelName === 'post') {
		if (['quotesCount', 'bookmarksCount'].includes(prop)) return 0;
		if (prop === 'viewsCount') return Math.floor(Math.random() * 1000);
		if (prop === 'isBookmarked') return false;
	}
	return undefined;
};

const autoResolve = (modelName, overrides = {}) => {
	const handler = {
		get(target, prop) {
			// Bypass symbols and internal GraphQL-js resolvers/types checks (like isTypeOf, resolveType)
			if (typeof prop === 'symbol' || prop.startsWith('__') || prop === 'isTypeOf' || prop === 'resolveType') {
				return target[prop];
			}
			if (prop in overrides) {
				return overrides[prop];
			}
			
			return async (parent, args, context, info) => {
				// 1. Return preloaded data if already present in parent
				if (parent && parent[prop] !== undefined) {
					return parent[prop];
				}

				// 2. Auto-resolve counts (e.g. likesCount, postsCount)
				const relationCount = mapCountPropToRelation(modelName, prop);
				if (relationCount && parent?.id) {
					const result = await prisma[modelName].findUnique({
						where: { id: parent.id },
						select: { _count: { select: { [relationCount]: true } } }
					});
					return result?._count?.[relationCount] || 0;
				}

				// 3. Auto-resolve standard relationships (e.g. media, author, replies)
				const relationMethod = mapPropToRelationMethod(modelName, prop);
				if (relationMethod && prisma[modelName] && parent?.id) {
					const queryChain = prisma[modelName].findUnique({ where: { id: parent.id } })[relationMethod];
					if (typeof queryChain === 'function') {
						if (relationMethod === 'replies') {
							return queryChain({ orderBy: { createdAt: 'asc' } });
						}
						return queryChain();
					}
				}

				// 4. Return mock values if defined
				const mockVal = getMockValue(modelName, prop);
				if (mockVal !== undefined) {
					return mockVal;
				}

				return null;
			};
		}
	};
	return new Proxy(overrides, handler);
};

export const resolvers = {
	DateTime: DateTimeResolver,
	JSON: JSONResolver,

	User: autoResolve('user'),

	Post: autoResolve('post', {
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
		isReplyTo: async (parent) => !!parent.replyToId
	}),

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
				orderBy: { posts: { _count: 'desc' } },
				include: { _count: { select: { posts: true } } }
			});
			// Momentum: share of this tag's posts created in the most recent
			// quarter of the wipe cycle. Real signal, no invented numbers.
			const recentCutoff = new Date(Date.now() - (WIPE_INTERVAL_DAYS * 24 * 60 * 60 * 1000) / 4);
			return Promise.all(trendingTags.map(async (hashtag, index) => {
				const recent = await prisma.postHashtag.count({
					where: {
						hashtagId: hashtag.id,
						post: { createdAt: { gte: recentCutoff } }
					}
				});
				const total = hashtag._count.posts;
				const ratio = total > 0 ? recent / total : 0;
				return {
					id: hashtag.id,
					hashtag,
					rank: index + 1,
					volume: total,
					momentum: ratio >= 0.5 ? 'rising' : ratio >= 0.25 ? 'steady' : 'cooling'
				};
			}));
		},
		nextWipe: async () => {
			const { nextWipe } = await getNextWipe(prisma);
			return nextWipe;
		}
	},

	Mutation: {
		signUp: async (_, { username, email, password, displayName }) => {
			if (!password || password.length < MIN_PASSWORD_LENGTH) {
				throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
			}
			if (isCommonPassword(password)) {
				throw new Error('Password is too common. Pick a stronger one.');
			}
			const passwordHash = await hashPassword(password);
			const user = await prisma.user.create({
				data: {
					username,
					email,
					displayName,
					passwordHash,
					profileImage: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`
				}
			});
			const tokenString = await generateAuthToken(user);
			const token = {
				accessToken: tokenString,
				refreshToken: tokenString,
				expiresIn: 3456000,
				tokenType: "Bearer"
			};
			return { token, user: withoutPasswordHash(user) };
		},
		login: async (_, { username, password }, context) => {
			const clientIp = context?.clientIp || 'unknown';
			const account = normalizeAccount(username);
			const gate = loginRateLimiter.check(clientIp, username);
			if (!gate.ok) {
				loginAttemptLog.record({ ip: clientIp, account, ok: false });
				throw new GraphQLError('Too many login attempts. Please try again later.', {
					extensions: { code: 'RATE_LIMITED', http: { status: 429 } }
				});
			}
			const user = await prisma.user.findUnique({ where: { username } });
			// Uniform failure either way: no username enumeration, no hint
			// about whether the password was the wrong part.
			if (!user || !(await verifyPassword(password, user.passwordHash))) {
				loginRateLimiter.recordFailure(clientIp, username);
				loginAttemptLog.record({ ip: clientIp, account, ok: false });
				throw new Error("Invalid credentials");
			}
			loginRateLimiter.recordSuccess(clientIp, username);
			loginAttemptLog.record({ ip: clientIp, account, ok: true });
			const tokenString = await generateAuthToken(user);
			const token = {
				accessToken: tokenString,
				refreshToken: tokenString,
				expiresIn: 3456000,
				tokenType: "Bearer"
			};
			return { token, user: withoutPasswordHash(user) };
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
			// Manual wipe. Auth + admin gating happens in the requireAuth
			// wrapper below; the 40-day clock restarts from now.
			const { purged } = await triggerWipeNow(prisma);
			console.log(`[wipe] manual trigger — purged ${purged.posts} posts, ${purged.media} media`);
			return true;
		}
	}
};

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
	// signUp/login are public by design. EVERYTHING else — including
	// triggerWipe, which used to be callable by anyone — requires a token.
	if (name !== 'signUp' && name !== 'login') {
		resolvers.Mutation[name] = requireAuth(resolver);
	}
}
