import test from 'node:test';
import assert from 'node:assert';
import './db-test-env.js'; // provision a throwaway sqlite DB if DATABASE_URL unset
import pkg from '@prisma/client';
import { resolvers } from '../src/server/resolvers.js';

const { PrismaClient } = pkg;
const prisma = new PrismaClient();
const { createPost, updateProfile, likePost } = resolvers.Mutation;

const tag = () => Math.random().toString(36).substring(7);

const makeUser = async (username) =>
	prisma.user.create({
		data: {
			username,
			email: `${username}@example.com`,
			displayName: 'GQL Validation Test'
		}
	});

// Input-validation regression: the nastiest payloads must be rejected at the
// resolver boundary with a validation error, never reach Prisma, and never
// 500.
test('GraphQL mutations: input validation', async (t) => {
	const user = await makeUser(`gql_val_${tag()}`);
	const ctx = { userId: user.id };

	await t.test('createPost rejects blank content', async () => {
		await assert.rejects(createPost(null, { input: { content: '   ' } }, ctx), /at least 1/);
	});

	await t.test('createPost rejects a 100k-char content bomb', async () => {
		await assert.rejects(
			createPost(null, { input: { content: 'x'.repeat(100_000) } }, ctx),
			/at most 2000/
		);
	});

	await t.test('createPost rejects a hostile media payload', async () => {
		// bad enum value
		await assert.rejects(
			createPost(null, { input: { content: 'x', media: [{ url: 'u', type: 'EXE' }] } }, ctx),
			/must be one of/
		);
		// too many items
		await assert.rejects(
			createPost(
				null,
				{ input: { content: 'x', media: new Array(10).fill({ url: 'u', type: 'IMAGE' }) } },
				ctx
			),
			/at most 4/
		);
	});

	await t.test('createPost rejects a nested __proto__ key', async () => {
		const input = JSON.parse('{"content":"x","media":[{"url":"u","type":"IMAGE","__proto__":{"p":1}}]}');
		await assert.rejects(createPost(null, { input }, ctx), /Forbidden key "__proto__"/);
	});

	await t.test('createPost still accepts a valid payload', async () => {
		const post = await createPost(
			null,
			{
				input: {
					content: 'valid post',
					media: [{ url: 'https://x.co/i.png', type: 'IMAGE' }]
				}
			},
			ctx
		);
		assert.strictEqual(post.content, 'valid post');
		assert.strictEqual(post.authorId, user.id, 'authorship comes from the token, not the input');
	});

	await t.test('updateProfile caps field lengths', async () => {
		await assert.rejects(
			updateProfile(null, { input: { bio: 'x'.repeat(10_000) } }, ctx),
			/at most 500/
		);
	});

	await t.test('updateProfile never leaks passwordHash', async () => {
		const updated = await updateProfile(null, { input: { bio: 'new bio' } }, ctx);
		assert.ok(!('passwordHash' in updated), 'passwordHash stripped from updateProfile return');
	});

	await t.test('likePost rejects non-string IDs (no Prisma 500)', async () => {
		await assert.rejects(
			likePost(null, { postId: { nested: 'object' } }, ctx),
			/must be a string/
		);
		await assert.rejects(likePost(null, { postId: '' }, ctx), /at least 1/);
	});
});
