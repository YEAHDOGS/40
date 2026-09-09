import test from 'node:test';
import assert from 'node:assert';
import { resolveJwtSecret } from '../src/server/auth.js';

test('JWT secret resolution is fail-safe', async (t) => {
	await t.test('returns the configured secret when set', () => {
		assert.strictEqual(
			resolveJwtSecret({ JWT_SECRET: 'shhh', NODE_ENV: 'production' }),
			'shhh'
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
