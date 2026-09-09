import pkg from '@prisma/client';
import { DateTimeResolver, JSONResolver } from 'graphql-scalars';
import { GraphQLError } from 'graphql';
import { generateAuthToken, verifyAuthToken, revokeAuthToken } from './auth.js';
import { hashPassword, verifyPassword } from './password.js';
import {
	validateSignUp,
	validatePostInput,
	validateProfileInput,
	assertString,
	LIMITS
} from './validation.js';
import {
	WIPE_INTERVAL_DAYS,
	getNextWipe,
	triggerWipeNow
} from './wipe.js';
import {
	loginIpLimiter,
	loginAccountLimiter,
	signupIpLimiter,
	loginTracker,
	retryAfterSeconds,
	rateLimitedGraphQLError,
	accountLockedGraphQLError
} from './rate-limit.js';

const { PrismaClient } = pkg;
const prisma = new PrismaClient();

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

// The scrypt hash must never cross the API boundary. The GraphQL User type
// deliberately omits passwordHash, and scripts/fix-graphql.js strips it from
// the generated schema — this belt-and-braces strip keeps a future schema
// change from silently starting to leak it (mirrors rest.js sanitizeUser).
const sanitizeUser = (user) => {
	if (!user || typeof user !== 'object') return user;
	const { passwordHash, ...safe } = user;
	return safe;
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
		signUp: async (_, args, context) => {
			// Brute-force/abuse guard: per-IP signup budget, checked before
			// any validation or DB work so mass-registration scripts burn
			// their budget cheaply.
			const signUpIp = context?.clientIp || 'unknown';
			const signUpRl = signupIpLimiter.check(`signup:ip:${signUpIp}`);
			if (!signUpRl.allowed) throw rateLimitedGraphQLError('sign-up', signUpRl.retryAfterMs);
			// Boundary validation: length caps, email format, min password
			// length, prototype-pollution guard. Takes the RAW args (not a
			// destructured subset) so smuggled keys are rejected, not
			// silently dropped. Throws ValidationError.
			const clean = validateSignUp(args || {});
			const passwordHash = await hashPassword(clean.password);
			// Clean error instead of a Prisma P2002 500 on duplicates.
			const existingUser = await prisma.user.findFirst({
				where: { OR: [{ username: clean.username }, { email: clean.email }] }
			});
			if (existingUser) throw new Error('Username or email already exists');
			const user = await prisma.user.create({
				data: {
					username: clean.username,
					email: clean.email,
					passwordHash,
					displayName: clean.displayName,
					profileImage: `https://api.dicebear.com/7.x/avataaars/svg?seed=${clean.username}`
				}
			});
			const tokenString = await generateAuthToken(user);
			const token = {
				accessToken: tokenString,
				refreshToken: tokenString,
				expiresIn: 3456000,
				tokenType: "Bearer"
			};
			return { token, user: sanitizeUser(user) };
		},
		login: async (_, { username, password }, context) => {
			// Brute-force guard, cheapest checks first:
			//  1. per-IP login budget (stops distributed guessing from one box),
			//  2. account lockout (consecutive failures for THIS account),
			//  3. per-account login budget (stops many-IP guessing at one account).
			// Lockout is checked before the account budget so a locked account
			// reports ACCOUNT_LOCKED instead of a generic rate limit.
			const loginIp = context?.clientIp || 'unknown';
			const ipRl = loginIpLimiter.check(`login:ip:${loginIp}`);
			if (!ipRl.allowed) throw rateLimitedGraphQLError('login', ipRl.retryAfterMs);
			// Type/length caps only — no min length: a legacy user with a
			// short password must still be able to attempt login (it will
			// fail closed on verify). Unknown users fail closed below.
			const cleanUsername = assertString(username, { field: 'username', min: 1, max: LIMITS.email.max });
			const cleanPassword = assertString(password, { field: 'password', min: 1, max: 4096 });
			const lockedMs = loginTracker.lockedRemainingMs(cleanUsername);
			if (lockedMs > 0) throw accountLockedGraphQLError(lockedMs);
			const acctRl = loginAccountLimiter.check(`login:account:${cleanUsername}`);
			if (!acctRl.allowed) throw rateLimitedGraphQLError('login', acctRl.retryAfterMs);
			const user = await prisma.user.findUnique({ where: { username: cleanUsername } });
			// Single generic message: unknown users, hashless legacy rows,
			// and wrong passwords all look alike to an attacker.
			// verifyPassword fails closed and always costs a full scrypt pass.
			// Lockout failures are recorded ONLY for real accounts: recording
			// them for unknown usernames would let an attacker pre-lock an
			// account before its owner registers (lockout poisoning).
			if (!user || !user.passwordHash) throw new Error("Invalid credentials");
			const ok = await verifyPassword(cleanPassword, user.passwordHash);
			if (!ok) {
				loginTracker.recordFailure(cleanUsername);
				throw new Error("Invalid credentials");
			}
			loginTracker.recordSuccess(cleanUsername);
			const tokenString = await generateAuthToken(user);
			const token = {
				accessToken: tokenString,
				refreshToken: tokenString,
				expiresIn: 3456000,
				tokenType: "Bearer"
			};
			return { token, user: sanitizeUser(user) };
		},
		logout: async (_, args, context) => {
			if (context.token) {
				await revokeAuthToken(context.token);
			}
			return true;
		},
		updateProfile: async (_, { input }, context) => {
			// validateProfileInput allowlists caller-settable fields AND
			// caps their lengths — input is never spread raw into prisma.
			const clean = validateProfileInput(input);
			const updated = await prisma.user.update({
				where: { id: context.userId },
				data: clean
			});
			return sanitizeUser(updated);
		},
		createPost: async (_, { input }, context) => {
			const clean = validatePostInput(input);
			const post = await prisma.post.create({
				data: {
					content: clean.content,
					authorId: context.userId,
					postType: clean.media && clean.media.length > 0 ? "IMAGE" : "TEXT",
					replyToId: clean.replyToId || null,
				},
				include: { author: true }
			});

			if (clean.media && clean.media.length > 0) {
				for (const m of clean.media) {
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
			const cleanPostId = assertString(postId, { field: 'postId', min: 1, max: 100 });
			return prisma.like.create({
				data: { userId: context.userId, postId: cleanPostId }
			});
		},
		unlikePost: async (_, { postId }, context) => {
			const cleanPostId = assertString(postId, { field: 'postId', min: 1, max: 100 });
			await prisma.like.delete({
				where: { userId_postId: { userId: context.userId, postId: cleanPostId } }
			});
			return true;
		},
		retweetPost: async (_, { postId }, context) => {
			const cleanPostId = assertString(postId, { field: 'postId', min: 1, max: 100 });
			return prisma.post.create({
				data: {
					content: "",
					authorId: context.userId,
					postType: "REPOST",
					repostOfId: cleanPostId
				},
				include: { author: true }
			});
		},
		followUser: async (_, { userId }, context) => {
			const cleanUserId = assertString(userId, { field: 'userId', min: 1, max: 100 });
			return prisma.follow.create({
				data: { followerId: context.userId, followingId: cleanUserId }
			});
		},
		triggerWipe: async () => {
			// Manual wipe. Auth + ADMIN gating happens in the requireAdmin
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

// Content privacy invariant: 40Forty is login-gated by design ("all content
// is blocked and hidden from non-users" in the README). Every query that
// returns user-identifiable content requires a valid token — an
// unauthenticated caller gets UNAUTHORIZED before any row is touched.
// nextWipe is deliberately exempt: it returns only a timestamp, and the
// countdown is the product's public brand.

// Admin allowlist for platform-destructive operations. triggerWipe purges
// EVERY post/like/media row, so gating it on "any logged-in user" was a
// privilege-escalation hole: any signup could nuke the whole feed.
// Configure with FORTY_ADMIN_IDS and/or FORTY_ADMIN_USERNAMES (comma
// separated). Default is deny-by-default — with neither set, nobody can
// trigger a manual wipe.
const ADMIN_IDS = new Set(
	(process.env.FORTY_ADMIN_IDS || '').split(',').map((s) => s.trim()).filter(Boolean)
);
const ADMIN_USERNAMES = new Set(
	(process.env.FORTY_ADMIN_USERNAMES || '').split(',').map((s) => s.trim()).filter(Boolean)
);

const requireAdmin = (resolver) => {
	return async (parent, args, context, info) => {
		if (!context.userId) {
			throw new GraphQLError("Unauthorized. Please provide a valid token.", {
				extensions: { code: 'UNAUTHORIZED' }
			});
		}
		let isAdmin = ADMIN_IDS.has(context.userId);
		if (!isAdmin) {
			const user = await prisma.user.findUnique({
				where: { id: context.userId },
				select: { username: true }
			});
			isAdmin = !!user && ADMIN_USERNAMES.has(user.username);
		}
		if (!isAdmin) {
			throw new GraphQLError("Forbidden. Admin access required.", {
				extensions: { code: 'FORBIDDEN' }
			});
		}
		return resolver(parent, args, context, info);
	};
};

for (const [name, resolver] of Object.entries(resolvers.Mutation)) {
	// signUp/login are public by design. Everything else requires a token —
	// EXCEPT triggerWipe, which purges all platform content and needs an
	// admin allowlist entry on top of a token (requireAdmin).
	if (name === 'signUp' || name === 'login') continue;
	resolvers.Mutation[name] = name === 'triggerWipe' ? requireAdmin(resolver) : requireAuth(resolver);
}

// Read-side gating: content queries require a token. nextWipe stays public
// (timestamp only, no user data — see the invariant above).
for (const [name, resolver] of Object.entries(resolvers.Query)) {
	if (name === 'nextWipe') continue;
	resolvers.Query[name] = requireAuth(resolver);
}
