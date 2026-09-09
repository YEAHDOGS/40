import test from 'node:test';
import assert from 'node:assert';
import './db-test-env.js'; // provision a throwaway sqlite DB if DATABASE_URL unset
import pkg from '@prisma/client';
import { resolvers } from '../src/server/resolvers.js';

const { PrismaClient } = pkg;
const prisma = new PrismaClient();
const { signUp, login } = resolvers.Mutation;

const tag = () => Math.random().toString(36).substring(7);
const gqlUser = (suffix) => ({
	username: `gql_auth_${suffix}`,
	email: `gql_auth_${suffix}@example.com`,
	displayName: 'GQL Auth',
	password: 'hunter2-hunter2-hunter2'
});

test('GraphQL auth: signUp/login hash and verify passwords with scrypt', async (t) => {

	await t.test('signUp stores a scrypt hash, returns a token, never leaks passwordHash', async () => {
		const input = gqlUser(tag());
		const result = await signUp(null, input);

		assert.ok(result.token.accessToken, 'signup returns a token');
		assert.strictEqual(result.user.username, input.username);
		assert.ok(!('passwordHash' in result.user), 'passwordHash must not leak in signUp payload');

		const row = await prisma.user.findUnique({ where: { username: input.username } });
		assert.ok(row.passwordHash, 'a hash is stored in the database');
		assert.ok(row.passwordHash.startsWith('scrypt$'), 'stored value is a scrypt hash');
		assert.ok(!row.passwordHash.includes(input.password), 'stored value is not the plaintext password');
	});

	await t.test('signUp rejects a duplicate username or email with a clean error', async () => {
		const suffix = tag();
		const input = gqlUser(suffix);
		await signUp(null, input);

		await assert.rejects(
			signUp(null, input),
			/Username or email already exists/,
			'duplicate username gets a clean error, not a Prisma 500'
		);

		await assert.rejects(
			signUp(null, { ...gqlUser(tag()), email: input.email }),
			/Username or email already exists/,
			'duplicate email gets a clean error too'
		);
	});

	await t.test('signUp rejects a blank password', async () => {
		await assert.rejects(
			signUp(null, { ...gqlUser(tag()), password: '' }),
			/Password is required/
		);
	});

	await t.test('login: correct password gets a token, wrong password is rejected generically', async () => {
		const input = gqlUser(tag());
		await signUp(null, input);

		const good = await login(null, { username: input.username, password: input.password });
		assert.ok(good.token.accessToken, 'correct password returns a token');
		assert.ok(!('passwordHash' in good.user), 'passwordHash must not leak in login payload');

		await assert.rejects(
			login(null, { username: input.username, password: 'definitely-wrong' }),
			/Invalid credentials/,
			'wrong password gets the generic message'
		);
	});

	await t.test('login: unknown user is rejected generically', async () => {
		await assert.rejects(
			login(null, { username: `no_such_user_${tag()}`, password: 'whatever' }),
			/Invalid credentials/
		);
	});

	await t.test('login: hashless legacy row fails closed', async () => {
		const suffix = tag();
		await prisma.user.create({
			data: {
				username: `legacy_hashless_${suffix}`,
				email: `legacy_hashless_${suffix}@example.com`,
				displayName: 'Legacy Hashless'
				// No passwordHash — pre-scrypt row. Must fail closed, never throw.
			}
		});
		await assert.rejects(
			login(null, { username: `legacy_hashless_${suffix}`, password: 'anything' }),
			/Invalid credentials/,
			'hashless legacy rows fail closed with the generic message'
		);
	});
});
