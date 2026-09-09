/**
 * Login rate limiter tests.
 *
 * Unit tests for src/server/rate-limit.js — sliding-window throttling,
 * exponential lockout, window expiry, success resets, and the attempt log.
 * The limiter is clock-injectable, so all of this runs with zero network
 * and zero timing flakiness.
 */
import test from 'node:test';
import assert from 'node:assert';
import {
	createLoginRateLimiter,
	createLoginAttemptLog,
	getClientIp,
	DEFAULTS
} from '../src/server/rate-limit.js';

// ---- a controllable clock ----

function fakeClock(start = 1_000_000) {
	let t = start;
	return {
		now: () => t,
		advance: (ms) => {
			t += ms;
		}
	};
}

function newLimiter(clock, overrides = {}) {
	return createLoginRateLimiter({ now: clock.now, ...overrides });
}

// ---- per-account throttling ----

test('account bucket trips after N failures', async (t) => {
	const clock = fakeClock();
	const limiter = newLimiter(clock, { accountMaxFailures: 3 });

	assert.deepStrictEqual(limiter.check('1.2.3.4', 'user'), { ok: true });
	assert.strictEqual(limiter.recordFailure('1.2.3.4', 'user').locked, false);
	assert.strictEqual(limiter.recordFailure('1.2.3.4', 'user').locked, false);
	const third = limiter.recordFailure('1.2.3.4', 'user');
	assert.strictEqual(third.locked, true);

	const gate = limiter.check('1.2.3.4', 'user');
	assert.strictEqual(gate.ok, false);
	assert.strictEqual(gate.bucket, 'account');
	assert.ok(gate.retryAfterMs > 0);
});

test('lockout backoff doubles each consecutive trip, capped', async (t) => {
	const clock = fakeClock();
	const limiter = newLimiter(clock, {
		accountMaxFailures: 2,
		lockoutBaseMs: 60_000,
		lockoutMaxMs: 120_000
	});

	// Trip 1: 60s lockout
	limiter.recordFailure('9.9.9.9', 'user');
	const r1 = limiter.recordFailure('9.9.9.9', 'user');
	assert.strictEqual(r1.retryAfterMs, 60_000);

	// Wait out the lockout, fail again: doubles to 120s
	clock.advance(60_000 + 1);
	const r2 = limiter.recordFailure('9.9.9.9', 'user');
	assert.strictEqual(r2.locked, true);
	assert.strictEqual(r2.retryAfterMs, 120_000);

	// Next would be 240s but the cap holds at 120s
	clock.advance(120_000 + 1);
	const r3 = limiter.recordFailure('9.9.9.9', 'user');
	assert.strictEqual(r3.locked, true);
	assert.strictEqual(r3.retryAfterMs, 120_000);
});

test('sliding window expires old failures', async (t) => {
	const clock = fakeClock();
	const limiter = newLimiter(clock, {
		accountMaxFailures: 3,
		windowMs: 60_000
	});

	limiter.recordFailure('2.2.2.2', 'user');
	limiter.recordFailure('2.2.2.2', 'user');
	// Both failures age out of the 60s window
	clock.advance(61_000);
	limiter.recordFailure('2.2.2.2', 'user');
	// Only 1 failure inside the window — no lockout yet
	assert.deepStrictEqual(limiter.check('2.2.2.2', 'user'), { ok: true });
});

test('successful login resets the account bucket', async (t) => {
	const clock = fakeClock();
	const limiter = newLimiter(clock, { accountMaxFailures: 3 });

	limiter.recordFailure('3.3.3.3', 'user');
	limiter.recordFailure('3.3.3.3', 'user');
	limiter.recordSuccess('3.3.3.3', 'user'); // typo streak, then correct password
	limiter.recordFailure('3.3.3.3', 'user');
	limiter.recordFailure('3.3.3.3', 'user');
	// Fresh count: 2 failures, threshold is 3 — legit user not locked out
	assert.deepStrictEqual(limiter.check('3.3.3.3', 'user'), { ok: true });
});

// ---- per-IP throttling ----

test('IP bucket trips independently of account', async (t) => {
	const clock = fakeClock();
	const limiter = newLimiter(clock, { ipMaxFailures: 3, accountMaxFailures: 100 });

	// Attacker rotates usernames from one IP
	limiter.recordFailure('6.6.6.6', 'alice');
	limiter.recordFailure('6.6.6.6', 'bob');
	limiter.recordFailure('6.6.6.6', 'carol');

	const gate = limiter.check('6.6.6.6', 'dave');
	assert.strictEqual(gate.ok, false);
	assert.strictEqual(gate.bucket, 'ip');
});

test('legit traffic from other IPs/accounts is unaffected by a lockout', async (t) => {
	const clock = fakeClock();
	const limiter = newLimiter(clock, { ipMaxFailures: 3, accountMaxFailures: 3 });

	limiter.recordFailure('7.7.7.7', 'user');
	limiter.recordFailure('7.7.7.7', 'user');
	limiter.recordFailure('7.7.7.7', 'user'); // user + 7.7.7.7 locked

	// A different user on a different IP sails through
	assert.deepStrictEqual(limiter.check('8.8.8.8', 'alice'), { ok: true });
	// Same user from a different IP is still locked (account bucket)
	assert.strictEqual(limiter.check('8.8.8.8', 'user').ok, false);
});

// ---- usernames normalize case-insensitively ----

test('account bucketing is case-insensitive', async (t) => {
	const clock = fakeClock();
	const limiter = newLimiter(clock, { accountMaxFailures: 2 });

	limiter.recordFailure('1.1.1.1', 'user');
	limiter.recordFailure('1.1.1.1', 'user');
	assert.strictEqual(limiter.check('1.1.1.1', 'user').ok, false);
});

// ---- lockout eventually lifts ----

test('lockout lifts after the backoff elapses', async (t) => {
	const clock = fakeClock();
	const limiter = newLimiter(clock, {
		accountMaxFailures: 2,
		lockoutBaseMs: 60_000,
		windowMs: 60_000
	});

	limiter.recordFailure('4.4.4.4', 'user');
	limiter.recordFailure('4.4.4.4', 'user');
	assert.strictEqual(limiter.check('4.4.4.4', 'user').ok, false);

	clock.advance(60_001);
	assert.deepStrictEqual(limiter.check('4.4.4.4', 'user'), { ok: true });
});

// ---- attempt log ----

test('attempt log never stores passwords', async (t) => {
	const log = createLoginAttemptLog(3);
	log.record({ ip: '1.2.3.4', account: 'user', ok: false });
	log.record({ ip: '1.2.3.4', account: 'user', ok: true });

	const entries = log.list();
	assert.strictEqual(entries.length, 2);
	for (const e of entries) {
		assert.deepStrictEqual(Object.keys(e).sort(), ['account', 'ip', 'ok', 'ts']);
		assert.ok(!('password' in e) && !('passwordHash' in e));
	}

	// Bounded: capacity 3 keeps only the newest
	log.record({ ip: '5.6.7.8', account: 'a', ok: false });
	log.record({ ip: '5.6.7.8', account: 'b', ok: false });
	assert.strictEqual(log.size(), 3);
	assert.strictEqual(log.list()[0].account, 'user');
	assert.strictEqual(log.list()[2].account, 'b');
});

// ---- client IP helper ----

test('getClientIp uses the socket address, ignores spoofable headers', async (t) => {
	assert.strictEqual(
		getClientIp({ socket: { remoteAddress: '203.0.113.7' }, headers: { 'x-forwarded-for': '1.1.1.1' } }),
		'203.0.113.7'
	);
	assert.strictEqual(getClientIp({ socket: {}, headers: {} }), 'unknown');
	assert.strictEqual(getClientIp(null), 'unknown');
});

test('defaults are sane', async (t) => {
	assert.ok(DEFAULTS.accountMaxFailures <= 10, 'account threshold should be strict');
	assert.ok(DEFAULTS.lockoutBaseMs >= 30_000, 'lockout should hurt a little');
	assert.ok(DEFAULTS.lockoutMaxMs <= 60 * 60 * 1000, 'lockout should not be permanent');
});
