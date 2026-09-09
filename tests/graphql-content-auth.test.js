import test from 'node:test';
import assert from 'node:assert';
import './db-test-env.js'; // provision a throwaway sqlite DB if DATABASE_URL unset
import pkg from '@prisma/client';
import { resolvers } from '../src/server/resolvers.js';

const { PrismaClient } = pkg;
const prisma = new PrismaClient();
const { Query } = resolvers;

const tag = () => Math.random().toString(36).substring(7);

const makeUser = async (username) =>
	prisma.user.create({
		data: {
			username,
			email: `${username}@example.com`,
			displayName: 'Content Auth Test'
		}
	});

// Privacy invariant: every data-returning query except nextWipe requires a
// token. An unauthenticated caller must get UNAUTHORIZED and no row may be
// touched (regression guard for the "all content is blocked and hidden from
// non-users" product promise).
test('GraphQL content queries: unauthenticated callers are denied', async (t) => {
	const queries = [
		['post', { id: 'anything' }],
		['homeTimeline', {}],
		['recommendedTimeline', {}],
		['trends', {}]
	];

	for (const [name, args] of queries) {
		await t.test(`${name}: no token -> UNAUTHORIZED`, async () => {
			await assert.rejects(
				Query[name](null, args, {}),
				/Unauthorized/,
				`${name} must deny unauthenticated callers`
			);
		});

		await t.test(`${name}: garbage token context (no userId) -> UNAUTHORIZED`, async () => {
			await assert.rejects(
				Query[name](null, args, { userId: null, token: 'bogus' }),
				/Unauthorized/,
				`${name} must deny callers with no resolved userId`
			);
		});
	}
});

test('GraphQL content queries: authenticated callers pass through', async (t) => {
	const user = await makeUser(`content_auth_${tag()}`);
	const post = await prisma.post.create({
		data: { content: 'members-only content', authorId: user.id }
	});
	const ctx = { userId: user.id };

	await t.test('post: token resolves the post', async () => {
		const found = await Query.post(null, { id: post.id }, ctx);
		assert.strictEqual(found.id, post.id);
	});

	await t.test('homeTimeline: token resolves the connection', async () => {
		const timeline = await Query.homeTimeline(null, { limit: 10, offset: 0 }, ctx);
		assert.ok(timeline.edges.some((e) => e.node.id === post.id));
	});

	await t.test('recommendedTimeline: token resolves the connection', async () => {
		const timeline = await Query.recommendedTimeline(null, { limit: 10, offset: 0 }, ctx);
		assert.ok(Array.isArray(timeline.edges));
	});

	await t.test('trends: token resolves without error', async () => {
		const trends = await Query.trends(null, { limit: 5 }, ctx);
		assert.ok(Array.isArray(trends));
	});
});

test('nextWipe: stays public by design (timestamp only, no user data)', async () => {
	const wipe = await Query.nextWipe(null, {}, {});
	assert.ok(wipe instanceof Date, 'nextWipe resolves a Date without a token');
});
