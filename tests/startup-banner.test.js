import test from 'node:test';
import assert from 'node:assert';
import { printStartupBanner, printFatalBanner } from '../src/server/startup-banner.js';
import { resolveJwtSecret } from '../src/server/auth.js';

function capture(stream, fn) {
	const out = [];
	const orig = console[stream];
	console[stream] = (msg) => out.push(String(msg));
	try {
		fn();
	} finally {
		console[stream] = orig;
	}
	return out.join('\n');
}

test('startup banner is loud and honest', async (t) => {
	await t.test('OK banner names every required var and its status', () => {
		const banner = capture('log', () =>
			printStartupBanner({ JWT_SECRET: 'shhh', NODE_ENV: 'production', DATABASE_URL: 'postgres://x' })
		);
		assert.ok(banner.includes('40Forty server boot'), 'banner header present');
		assert.ok(banner.includes('JWT_SECRET'), 'JWT_SECRET named in banner');
		assert.ok(banner.includes('set ('), 'JWT_SECRET reported as set');
		assert.ok(banner.includes('NODE_ENV = production'), 'NODE_ENV shown');
		assert.ok(!banner.includes('REQUIRED IN PRODUCTION'), 'no missing flags when everything is set');
	});

	await t.test('OK banner flags missing production-required vars loudly', () => {
		const banner = capture('log', () =>
			printStartupBanner({ NODE_ENV: 'development' })
		);
		assert.ok(banner.includes('JWT_SECRET'), 'JWT_SECRET named in banner');
		assert.ok(banner.includes('MISSING'), 'missing var reported as MISSING');
		assert.ok(banner.includes('<<< REQUIRED IN PRODUCTION'), 'missing var flagged as required in production');
	});

	await t.test('fatal banner names the exact missing var and how to fix it', () => {
		const banner = capture('error', () =>
			printFatalBanner({ NODE_ENV: 'production' }, 'JWT_SECRET')
		);
		assert.ok(banner.includes('FATAL'), 'banner says FATAL');
		assert.ok(banner.includes('JWT_SECRET'), 'banner names JWT_SECRET');
		assert.ok(banner.includes('openssl rand -base64 48'), 'banner tells how to generate a secret');
	});

	await t.test('production boot prints the FATAL banner before throwing', () => {
		const errOut = capture('error', () => {
			assert.throws(
				() => resolveJwtSecret({ NODE_ENV: 'production' }),
				/FATAL: JWT_SECRET is not set/
			);
		});
		assert.ok(errOut.includes('JWT_SECRET'), 'fatal banner went to stderr before the throw');
	});
});
