// tests/rate-limit.test.js — unit tests for src/server/rate-limit.js.
// Pure logic: no database, no network, injectable clock.

import test from 'node:test';
import assert from 'node:assert';
import { GraphQLError } from 'graphql';
import {
	RateLimiter,
	LoginAttemptTracker,
	rateLimitConfig,
	lockoutConfig,
	retryAfterSeconds,
	rateLimitedGraphQLError,
	accountLockedGraphQLError,
	resetAuthGuards,
	loginIpLimiter,
	loginAccountLimiter,
	signupIpLimiter,
	loginTracker
} from '../src/server/rate-limit.js';

// Controllable clock: every limiter/tracker below reads time from here.
let now = 1_000_000;
const clock = () => now;
const advance = (ms) => { now += ms; };

test('RateLimiter: allows exactly `limit` hits, then rejects', async (t) => {
	await t.test('rejects the (limit+1)-th hit with a positive retryAfterMs', async () => {
		now = 1_000_000;
		const rl = new RateLimiter({ limit: 3, windowMs: 60_000, now: clock });
		assert.deepStrictEqual(rl.check('k').allowed, true);
		assert.deepStrictEqual(rl.check('k').allowed, true);
		const third = rl.check('k');
		assert.strictEqual(third.allowed, true);
		assert.strictEqual(third.remaining, 0);
		const over = rl.check('k');
		assert.strictEqual(over.allowed, false);
		assert.strictEqual(over.remaining, 0);
		assert.ok(over.retryAfterMs > 0 && over.retryAfterMs <= 60_000);
	});

	await t.test('remaining counts down on each allowed hit', async () => {
		now = 2_000_000;
		const rl = new RateLimiter({ limit: 3, windowMs: 60_000, now: clock });
		assert.strictEqual(rl.check('k').remaining, 2);
		assert.strictEqual(rl.check('k').remaining, 1);
		assert.strictEqual(rl.check('k').remaining, 0);
	});

	await t.test('a rejected check does not consume a token', async () => {
		now = 3_000_000;
		const rl = new RateLimiter({ limit: 1, windowMs: 60_000, now: clock });
		assert.strictEqual(rl.check('k').allowed, true);
		const r1 = rl.check('k');
		const r2 = rl.check('k');
		assert.strictEqual(r1.allowed, false);
		assert.strictEqual(r2.allowed, false);
		// Same head-of-window timestamp → same retry hint, nothing consumed.
		assert.strictEqual(r1.retryAfterMs, r2.retryAfterMs);
	});

	await t.test('bucket resets after the window slides past', async () => {
		now = 4_000_000;
		const rl = new RateLimiter({ limit: 2, windowMs: 10_000, now: clock });
		assert.strictEqual(rl.check('k').allowed, true);
		assert.strictEqual(rl.check('k').allowed, true);
		assert.strictEqual(rl.check('k').allowed, false);
		advance(10_001); // window fully slides past both hits
		const fresh = rl.check('k');
		assert.strictEqual(fresh.allowed, true);
		assert.strictEqual(fresh.remaining, 1);
	});

	await t.test('partial window slide frees only the expired hits', async () => {
		now = 5_000_000;
		const rl = new RateLimiter({ limit: 2, windowMs: 10_000, now: clock });
		rl.check('k'); // t=0
		advance(9_000);
		rl.check('k'); // t=9000
		assert.strictEqual(rl.check('k').allowed, false); // both still in window
		advance(1_001); // t=10001: first hit expired, second still live
		const r = rl.check('k');
		assert.strictEqual(r.allowed, true);
		assert.strictEqual(r.remaining, 0);
	});

	await t.test('keys are independent', async () => {
		now = 6_000_000;
		const rl = new RateLimiter({ limit: 1, windowMs: 60_000, now: clock });
		assert.strictEqual(rl.check('a').allowed, true);
		assert.strictEqual(rl.check('a').allowed, false);
		assert.strictEqual(rl.check('b').allowed, true);
	});

	await t.test('reset clears one key or everything', async () => {
		now = 7_000_000;
		const rl = new RateLimiter({ limit: 1, windowMs: 60_000, now: clock });
		rl.check('a');
		rl.check('b');
		rl.reset('a');
		assert.strictEqual(rl.check('a').allowed, true);
		assert.strictEqual(rl.check('b').allowed, false);
		rl.reset();
		assert.strictEqual(rl.check('b').allowed, true);
	});

	await t.test('sweep bounds memory by evicting fully-expired keys', async () => {
		now = 8_000_000;
		const rl = new RateLimiter({ limit: 5, windowMs: 1_000, maxKeys: 3, now: clock });
		rl.check('a');
		rl.check('b');
		rl.check('c');
		assert.strictEqual(rl.size, 3);
		advance(1_001); // all three windows expired
		rl.check('d'); // size >= maxKeys triggers a sweep first
		assert.ok(rl.size <= 3, `size ${rl.size} should stay bounded`);
		assert.strictEqual(rl.check('a').allowed, true, 'evicted key starts fresh');
	});

	await t.test('rejects empty/non-string keys', async () => {
		now = 9_000_000;
		const rl = new RateLimiter({ limit: 1, windowMs: 60_000, now: clock });
		assert.throws(() => rl.check(''), /non-empty string key/);
		assert.throws(() => rl.check(42), /non-empty string key/);
	});
});

test('LoginAttemptTracker: lockout after N consecutive failures', async (t) => {
	await t.test('not locked before maxFails failures', async () => {
		now = 11_000_000;
		const tr = new LoginAttemptTracker({ maxFails: 3, lockoutMs: 60_000, failWindowMs: 60_000, now: clock });
		assert.strictEqual(tr.lockedRemainingMs('u'), 0);
		tr.recordFailure('u');
		tr.recordFailure('u');
		assert.strictEqual(tr.lockedRemainingMs('u'), 0);
	});

	await t.test('locks on the maxFails-th consecutive failure', async () => {
		now = 12_000_000;
		const tr = new LoginAttemptTracker({ maxFails: 3, lockoutMs: 60_000, failWindowMs: 60_000, now: clock });
		tr.recordFailure('u');
		tr.recordFailure('u');
		const remaining = tr.recordFailure('u');
		assert.ok(remaining > 0 && remaining <= 60_000);
		assert.ok(tr.lockedRemainingMs('u') > 0);
	});

	await t.test('hammering a locked account neither extends the lock nor double-counts', async () => {
		now = 13_000_000;
		const tr = new LoginAttemptTracker({ maxFails: 2, lockoutMs: 60_000, failWindowMs: 60_000, now: clock });
		tr.recordFailure('u');
		tr.recordFailure('u');
		const first = tr.lockedRemainingMs('u');
		advance(10_000);
		const reported = tr.recordFailure('u');
		const second = tr.lockedRemainingMs('u');
		assert.ok(Math.abs(reported - second) < 1, 'reports the live remaining time');
		assert.ok(second < first, 'lock was not extended by the extra failure');
	});

	await t.test('a success resets the failure count', async () => {
		now = 14_000_000;
		const tr = new LoginAttemptTracker({ maxFails: 3, lockoutMs: 60_000, failWindowMs: 60_000, now: clock });
		tr.recordFailure('u');
		tr.recordFailure('u');
		tr.recordSuccess('u');
		tr.recordFailure('u');
		tr.recordFailure('u');
		assert.strictEqual(tr.lockedRemainingMs('u'), 0, 'two failures after a success must not lock');
	});

	await t.test('the lock releases after lockoutMs', async () => {
		now = 15_000_000;
		const tr = new LoginAttemptTracker({ maxFails: 2, lockoutMs: 5_000, failWindowMs: 60_000, now: clock });
		tr.recordFailure('u');
		tr.recordFailure('u');
		assert.ok(tr.lockedRemainingMs('u') > 0);
		advance(5_001);
		assert.strictEqual(tr.lockedRemainingMs('u'), 0, 'lock must release');
		// Post-lockout the counter starts fresh — one failure must not re-lock.
		tr.recordFailure('u');
		assert.strictEqual(tr.lockedRemainingMs('u'), 0);
	});

	await t.test('stale failures outside failWindowMs do not accumulate', async () => {
		now = 16_000_000;
		const tr = new LoginAttemptTracker({ maxFails: 3, lockoutMs: 60_000, failWindowMs: 1_000, now: clock });
		tr.recordFailure('u');
		advance(1_001);
		tr.recordFailure('u');
		advance(1_001);
		tr.recordFailure('u');
		assert.strictEqual(
			tr.lockedRemainingMs('u'), 0,
			'a legit user who mistypes once in a while must never be locked'
		);
	});

	await t.test('interleaved lock-checks do not reset the failure count', async () => {
		// The login path calls lockedRemainingMs() BEFORE every attempt.
		// Those reads must never wipe the accumulated failures, or the
		// lockout would never trigger.
		now = 18_000_000;
		const tr = new LoginAttemptTracker({ maxFails: 3, lockoutMs: 60_000, failWindowMs: 60_000, now: clock });
		for (let i = 0; i < 3; i++) {
			assert.strictEqual(tr.lockedRemainingMs('u'), 0, `check ${i + 1}: not locked yet`);
			tr.recordFailure('u');
		}
		assert.ok(tr.lockedRemainingMs('u') > 0, 'locked after 3 failures despite interleaved checks');
	});

	await t.test('sweep drops unlocked, stale entries', async () => {
		now = 17_000_000;
		const tr = new LoginAttemptTracker({ maxFails: 5, lockoutMs: 60_000, failWindowMs: 1_000, now: clock });
		tr.recordFailure('u');
		advance(2_000);
		tr.sweep();
		assert.strictEqual(tr.size, 0);
	});
});

test('rate-limit config: env overrides with safe fallbacks', async (t) => {
	const saved = { ...process.env };
	const restore = () => {
		for (const k of Object.keys(process.env)) {
			if (!(k in saved)) delete process.env[k];
		}
		Object.assign(process.env, saved);
	};

	await t.test('defaults are the documented safe values', async () => {
		delete process.env.FORTY_LOGIN_IP_LIMIT;
		delete process.env.FORTY_LOGIN_ACCOUNT_LIMIT;
		delete process.env.FORTY_SIGNUP_IP_LIMIT;
		delete process.env.FORTY_LOCKOUT_MAX_FAILS;
		delete process.env.FORTY_LOCKOUT_MS;
		const rl = rateLimitConfig();
		assert.deepStrictEqual(rl.loginIp, { limit: 20, windowMs: 60_000 });
		assert.deepStrictEqual(rl.loginAccount, { limit: 5, windowMs: 60_000 });
		assert.deepStrictEqual(rl.signupIp, { limit: 15, windowMs: 60_000 });
		const lo = lockoutConfig();
		assert.deepStrictEqual(lo, { maxFails: 5, lockoutMs: 900_000, failWindowMs: 900_000 });
		restore();
	});

	await t.test('env vars override the defaults', async () => {
		process.env.FORTY_LOGIN_IP_LIMIT = '100';
		process.env.FORTY_LOCKOUT_MAX_FAILS = '3';
		process.env.FORTY_LOCKOUT_MS = '60000';
		const rl = rateLimitConfig();
		assert.strictEqual(rl.loginIp.limit, 100);
		const lo = lockoutConfig();
		assert.strictEqual(lo.maxFails, 3);
		assert.strictEqual(lo.lockoutMs, 60_000);
		restore();
	});

	await t.test('garbage env values fall back to defaults instead of disabling the guard', async () => {
		for (const [k, v] of [
			['FORTY_LOGIN_IP_LIMIT', 'banana'],
			['FORTY_LOGIN_IP_LIMIT', '0'],
			['FORTY_LOGIN_IP_LIMIT', '-5'],
			['FORTY_LOCKOUT_MAX_FAILS', 'NaN']
		]) {
			process.env[k] = v;
		}
		const rl = rateLimitConfig();
		assert.strictEqual(rl.loginIp.limit, 20, 'limit must stay protective on garbage input');
		const lo = lockoutConfig();
		assert.strictEqual(lo.maxFails, 5);
		restore();
	});
});

test('rate-limit error shapes', async (t) => {
	await t.test('retryAfterSeconds rounds up to whole seconds, minimum 1', async () => {
		assert.strictEqual(retryAfterSeconds(0), 1);
		assert.strictEqual(retryAfterSeconds(1), 1);
		assert.strictEqual(retryAfterSeconds(1000), 1);
		assert.strictEqual(retryAfterSeconds(1001), 2);
		assert.strictEqual(retryAfterSeconds(59_000), 59);
	});

	await t.test('GraphQL errors carry code + retryAfterSeconds extensions', async () => {
		const rl = rateLimitedGraphQLError('login', 61_000);
		assert.ok(rl instanceof GraphQLError);
		assert.strictEqual(rl.extensions.code, 'RATE_LIMITED');
		assert.strictEqual(rl.extensions.retryAfterSeconds, 61);
		assert.match(rl.message, /Too many login attempts/);

		const locked = accountLockedGraphQLError(30_000);
		assert.strictEqual(locked.extensions.code, 'ACCOUNT_LOCKED');
		assert.strictEqual(locked.extensions.retryAfterSeconds, 30);
		assert.match(locked.message, /temporarily locked/);
	});

	await t.test('module singletons exist and resetAuthGuards clears them', async () => {
		for (const lim of [loginIpLimiter, loginAccountLimiter, signupIpLimiter]) {
			assert.ok(lim instanceof RateLimiter);
		}
		assert.ok(loginTracker instanceof LoginAttemptTracker);
		loginIpLimiter.check('__probe__');
		loginTracker.recordFailure('__probe__');
		resetAuthGuards();
		assert.strictEqual(loginIpLimiter.size, 0);
		assert.strictEqual(loginTracker.size, 0);
	});
});
