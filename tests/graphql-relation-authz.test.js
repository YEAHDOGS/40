import test from 'node:test';
import assert from 'node:assert';
import './db-test-env.js'; // provision a throwaway sqlite DB if DATABASE_URL unset
import pkg from '@prisma/client';
import { resolvers } from '../src/server/resolvers.js';

const { PrismaClient } = pkg;
const prisma = new PrismaClient();
const { Mutation } = resolvers;

const tag = () => Math.random().toString(36).substring(7);

const makeUser = async (username) =>
	prisma.user.create({
		data: {
			username,
			email: `${username}@example.com`,
			displayName: 'Relation Authz Test'
		}
	});

// Regression guard: relation mutations (like/retweet/follow) must validate
// their targets and self-actions. Before this fix, referencing a nonexistent
// post/user threw a raw Prisma P2003/P2025 500, duplicates threw a P2002
// 500, and self-follows created degenerate followerId === followingId rows.
test('GraphQL relation mutations: target validation + self-action guards', async (t) => {
	const alice = await makeUser(`rel_authz_alice_${tag()}`);
	const bob = await makeUser(`rel_authz_bob_${tag()}`);
	const post = await prisma.post.create({
		data: { content: 'likable post', authorId: bob.id }
	});
	const aliceCtx = { userId: alice.id };
	const ghostId = `ghost_${tag()}`;

	await t.test('likePost: nonexistent post -> NOT_FOUND, no 500', async () => {
		await assert.rejects(
			Mutation.likePost(null, { postId: ghostId }, aliceCtx),
			/Post not found/,
			'like on a ghost post must fail closed with NOT_FOUND'
		);
	});

	await t.test('likePost: repeat like is idempotent, not a P2002 500', async () => {
		const first = await Mutation.likePost(null, { postId: post.id }, aliceCtx);
		const second = await Mutation.likePost(null, { postId: post.id }, aliceCtx);
		assert.strictEqual(second.id, first.id, 'repeat like returns the existing like row');
	});

	await t.test('unlikePost: un-liking a non-liked post is a no-op true', async () => {
		const res = await Mutation.unlikePost(null, { postId: post.id }, { userId: bob.id });
		assert.strictEqual(res, true);
	});

	await t.test('retweetPost: nonexistent post -> NOT_FOUND, no 500', async () => {
		await assert.rejects(
			Mutation.retweetPost(null, { postId: ghostId }, aliceCtx),
			/Post not found/,
			'repost of a ghost post must fail closed with NOT_FOUND'
		);
	});

	await t.test('followUser: self-follow -> BAD_USER_INPUT', async () => {
		await assert.rejects(
			Mutation.followUser(null, { userId: alice.id }, aliceCtx),
			/cannot follow yourself/,
			'self-follow must be rejected'
		);
	});

	await t.test('followUser: nonexistent user -> NOT_FOUND, no 500', async () => {
		await assert.rejects(
			Mutation.followUser(null, { userId: ghostId }, aliceCtx),
			/User not found/,
			'follow of a ghost user must fail closed with NOT_FOUND'
		);
	});

	await t.test('followUser: repeat follow is idempotent, not a P2002 500', async () => {
		const first = await Mutation.followUser(null, { userId: bob.id }, aliceCtx);
		const second = await Mutation.followUser(null, { userId: bob.id }, aliceCtx);
		assert.strictEqual(second.id, first.id, 'repeat follow returns the existing follow row');
	});
});
