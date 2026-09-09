import test from 'node:test';
import assert from 'node:assert';
import { hashPassword, verifyPassword } from '../src/server/password.js';

// Regression coverage for the scrypt password module staged for the
// REST auth fix (signup/login currently issue tokens with no credential
// check). Pure crypto — no DB, no npm deps.

test('password hashing round-trips and fails closed', async (t) => {
	await t.test('hash has the expected wire format', async () => {
		const hash = await hashPassword('correct horse battery staple');
		const parts = hash.split('$');
		assert.strictEqual(parts[0], 'scrypt');
		assert.strictEqual(parts[1], 'N16384r8p1');
		assert.strictEqual(parts[2].length, 32); // 16-byte salt, hex
		assert.strictEqual(parts[3].length, 128); // 64-byte key, hex
	});

	await t.test('correct password verifies', async () => {
		const hash = await hashPassword('snoop-approved-flavor');
		assert.strictEqual(await verifyPassword('snoop-approved-flavor', hash), true);
	});

	await t.test('wrong password does not verify', async () => {
		const hash = await hashPassword('snoop-approved-flavor');
		assert.strictEqual(await verifyPassword('wrong-password', hash), false);
	});

	await t.test('salts are unique — same password hashes differently', async () => {
		const a = await hashPassword('repeat-me');
		const b = await hashPassword('repeat-me');
		assert.notStrictEqual(a, b);
		assert.strictEqual(await verifyPassword('repeat-me', a), true);
		assert.strictEqual(await verifyPassword('repeat-me', b), true);
	});

	await t.test('hashPassword rejects empty and non-string input', async () => {
		await assert.rejects(() => hashPassword(''), /non-empty string/);
		await assert.rejects(() => hashPassword(null), /non-empty string/);
		await assert.rejects(() => hashPassword(undefined), /non-empty string/);
	});

	await t.test('verifyPassword fails closed on malformed stored values', async () => {
		assert.strictEqual(await verifyPassword('x', ''), false);
		assert.strictEqual(await verifyPassword('x', 'not-a-hash'), false);
		assert.strictEqual(await verifyPassword('x', 'bcrypt$10$saltsalthash'), false);
		assert.strictEqual(await verifyPassword('x', 'scrypt$N16384r8p1$zz$zz'), false);
		assert.strictEqual(await verifyPassword('x', 'scrypt$N16384r8p1$abcd$abcd'), false); // short parts
		assert.strictEqual(await verifyPassword(null, 'scrypt$N16384r8p1$aa$bb'), false);
		assert.strictEqual(await verifyPassword('x', null), false);
	});

	await t.test('unicode passwords work', async () => {
		const hash = await hashPassword('🍨🍦 forty days');
		assert.strictEqual(await verifyPassword('🍨🍦 forty days', hash), true);
		assert.strictEqual(await verifyPassword('🍨🍦 forty day', hash), false);
	});
});
