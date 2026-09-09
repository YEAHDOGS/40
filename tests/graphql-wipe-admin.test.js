import test from 'node:test';
import assert from 'node:assert';
import pkg from '@prisma/client';
import { execFileSync } from 'node:child_process';

// The admin allowlist is read once when resolvers.js loads, so it must be
// set BEFORE the import below (node:test runs each file in its own process).
// Random suffix keeps the allowlisted identity unique across runs.
const ADMIN_USERNAME = `wipe_admin_${Math.random().toString(36).substring(7)}`;
process.env.FORTY_ADMIN_USERNAMES = ADMIN_USERNAME;

const { resolvers } = await import('../src/server/resolvers.js');
const { PrismaClient } = pkg;
const prisma = new PrismaClient();

const { triggerWipe } = resolvers.Mutation;

const tag = () => Math.random().toString(36).substring(7);

const makeUser = async (username) =>
	prisma.user.create({
		data: {
			username,
			email: `${username}@example.com`,
			displayName: 'Wipe Admin Test'
		}
	});

test('GraphQL triggerWipe: admin-only gating', async (t) => {
	await t.test('unauthenticated callers are rejected', async () => {
		await assert.rejects(triggerWipe(null, {}, {}), /Unauthorized/, 'no userId -> UNAUTHORIZED');
	});

	await t.test('ordinary authenticated users get FORBIDDEN and content survives', async () => {
		const suffix = tag();
		const user = await makeUser(`wipe_victim_${suffix}`);
		const post = await prisma.post.create({
			data: { content: 'please do not wipe me', authorId: user.id }
		});

		await assert.rejects(
			triggerWipe(null, {}, { userId: user.id }),
			/Forbidden/,
			'non-admin user -> FORBIDDEN'
		);

		const stillThere = await prisma.post.findUnique({ where: { id: post.id } });
		assert.ok(stillThere, 'the attempted wipe must not have deleted anything');
	});

	await t.test('allowlisted admin can trigger the wipe and posts are purged', async () => {
		const user = await makeUser(ADMIN_USERNAME);
		await prisma.post.create({
			data: { content: 'admin wipe target', authorId: user.id }
		});

		const result = await triggerWipe(null, {}, { userId: user.id });
		assert.strictEqual(result, true, 'admin wipe resolves true');

		const remaining = await prisma.post.count();
		assert.strictEqual(remaining, 0, 'admin wipe purges all posts');
	});

	await t.test('with no admin allowlist configured, nobody can wipe (deny-by-default)', async () => {
		// Fresh process without the env allowlist: resolvers must refuse.
		const suffix = tag();
		const user = await makeUser(`wipe_denied_${suffix}`);
		const script = `
			const { resolvers } = await import(${JSON.stringify(new URL('../src/server/resolvers.js', import.meta.url).href)});
			try {
				await resolvers.Mutation.triggerWipe(null, {}, { userId: ${JSON.stringify(user.id)} });
				console.log('ALLOWED');
			} catch (e) {
				console.log('REJECTED:' + (e.extensions?.code || e.message));
			}
		`;
		const env = { ...process.env };
		delete env.FORTY_ADMIN_USERNAMES;
		delete env.FORTY_ADMIN_IDS;
		const out = execFileSync('node', ['--input-type=module', '-e', script], { env, encoding: 'utf8' }).trim();
		assert.strictEqual(out, 'REJECTED:FORBIDDEN', `empty allowlist denies a wipe (got: ${out})`);
	});
});
