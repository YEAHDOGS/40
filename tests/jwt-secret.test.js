import test from 'node:test';
import assert from 'node:assert';
import { resolveJwtSecret } from '../src/server/auth.js';

test('JWT secret resolution is fail-safe', async (t) => {
	await t.test('returns the configured secret when set', () => {
		assert.strictEqual(
			resolveJwtSecret({ JWT_SECRET: 'a'.repeat(32), NODE_ENV: 'production' }),
			'a'.repeat(32)
		);
	});

	await t.test('rejects a short secret in production', () => {
		assert.throws(
			() => resolveJwtSecret({ JWT_SECRET: 'shhh', NODE_ENV: 'production' }),
			/FATAL: JWT_SECRET is too weak/
		);
		assert.throws(
			() => resolveJwtSecret({ JWT_SECRET: 'x'.repeat(31), NODE_ENV: 'production' }),
			/need >= 32/
		);
	});

	await t.test('rejects the dev-only fallback string in production', () => {
		assert.throws(
			() =>
				resolveJwtSecret({
					JWT_SECRET: 'forty-dev-only-secret',
					NODE_ENV: 'production',
				}),
			/FATAL: JWT_SECRET is too weak/
		);
	});

	await t.test('warns but still boots on a weak secret outside production', () => {
		const warnings = [];
		const origWarn = console.warn;
		console.warn = (msg) => warnings.push(String(msg));
		try {
			assert.strictEqual(
				resolveJwtSecret({ JWT_SECRET: 'shhh', NODE_ENV: 'development' }),
				'shhh'
			);
		} finally {
			console.warn = origWarn;
		}
		assert.ok(
			warnings.some((m) => m.includes('weak') && m.includes('32')),
			'expected a loud weakness warning for a weak dev secret'
		);
	});

	await t.test('uses a loud dev-only fallback outside production', () => {
		const warnings = [];
		const origWarn = console.warn;
		console.warn = (msg) => warnings.push(String(msg));
		try {
			assert.strictEqual(
				resolveJwtSecret({ NODE_ENV: 'development' }),
				'forty-dev-only-secret'
			);
		} finally {
			console.warn = origWarn;
		}
		assert.ok(
			warnings.some((m) => m.includes('JWT_SECRET not set')),
			'expected a loud warning when falling back to the dev secret'
		);
	});

	await t.test('throws instead of falling back in production', () => {
		assert.throws(
			() => resolveJwtSecret({ NODE_ENV: 'production' }),
			/FATAL: JWT_SECRET is not set/
		);
		assert.throws(
			() => resolveJwtSecret({ JWT_SECRET: '', NODE_ENV: 'production' }),
			/FATAL: JWT_SECRET is not set/
		);
	});
});
