// src/server/rate-limit.js — brute-force / abuse hardening for the auth
// endpoints. Stdlib only, zero new dependencies, in-memory.
//
// Two mechanisms, both bounded in memory:
//
//  1. Sliding-window rate limiting (RateLimiter) on login + signup, applied
//     per client IP and per account (username). Over-limit callers get a
//     429 with a Retry-After hint instead of reaching the credential check.
//  2. Account lockout (LoginAttemptTracker): maxFails CONSECUTIVE failed
//     logins for a real account lock it for lockoutMs. A success resets the
//     count, and failures outside failWindowMs stop counting — a legit user
//     who mistypes occasionally is never locked. Failures for UNKNOWN
//     usernames are deliberately NOT recorded: otherwise an attacker could
//     pre-lock an account before its owner even registers (lockout
//     poisoning). Username enumeration is still throttled by the per-IP and
//     per-account rate limiters.
//
// All limits are tunable via FORTY_* env vars; missing/invalid values fall
// back to the safe defaults below. This is single-process memory: if
// 40Forty ever runs behind multiple node processes, move this state to
// Redis (the session cache already lives there).

import { GraphQLError } from 'graphql';

const envNum = (name, def) => {
	const raw = process.env[name];
	if (raw === undefined || raw === '') return def;
	const n = Number(raw);
	return Number.isFinite(n) && n > 0 ? n : def;
};

export function rateLimitConfig() {
	return {
		loginIp: {
			limit: envNum('FORTY_LOGIN_IP_LIMIT', 20),
			windowMs: envNum('FORTY_LOGIN_IP_WINDOW_MS', 60_000)
		},
		loginAccount: {
			limit: envNum('FORTY_LOGIN_ACCOUNT_LIMIT', 5),
			windowMs: envNum('FORTY_LOGIN_ACCOUNT_WINDOW_MS', 60_000)
		},
		signupIp: {
			limit: envNum('FORTY_SIGNUP_IP_LIMIT', 15),
			windowMs: envNum('FORTY_SIGNUP_IP_WINDOW_MS', 60_000)
		}
	};
}

export function lockoutConfig() {
	return {
		maxFails: Math.max(1, Math.floor(envNum('FORTY_LOCKOUT_MAX_FAILS', 5))),
		lockoutMs: envNum('FORTY_LOCKOUT_MS', 15 * 60 * 1000),
		failWindowMs: envNum('FORTY_LOCKOUT_FAIL_WINDOW_MS', 15 * 60 * 1000)
	};
}

// Sliding-window limiter. Per key we keep the timestamps of the hits
// inside the current window (sorted — we only ever append "now" and evict
// from the front). check() returns { allowed, remaining, retryAfterMs }.
// A rejected check does NOT consume a token.
export class RateLimiter {
	constructor({ limit, windowMs, maxKeys = 10_000, now = () => Date.now() } = {}) {
		this.limit = Math.max(1, Math.floor(limit ?? 1));
		this.windowMs = Math.max(1, Math.floor(windowMs ?? 60_000));
		this.maxKeys = Math.max(1, Math.floor(maxKeys ?? 10_000));
		this.now = now;
		this.hits = new Map(); // key -> number[] (ascending timestamps)
	}

	check(key) {
		if (typeof key !== 'string' || key.length === 0) {
			throw new Error('RateLimiter.check requires a non-empty string key');
		}
		if (this.hits.size >= this.maxKeys) this.sweep();
		const now = this.now();
		const cutoff = now - this.windowMs;
		let stamps = this.hits.get(key);
		if (!stamps) {
			stamps = [];
			this.hits.set(key, stamps);
		}
		while (stamps.length > 0 && stamps[0] <= cutoff) stamps.shift();
		if (stamps.length >= this.limit) {
			return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, stamps[0] + this.windowMs - now) };
		}
		stamps.push(now);
		return { allowed: true, remaining: this.limit - stamps.length, retryAfterMs: 0 };
	}

	reset(key) {
		if (key === undefined) this.hits.clear();
		else this.hits.delete(key);
	}

	get size() {
		return this.hits.size;
	}

	// Drop keys whose whole window has expired, so a long-lived process
	// can't accumulate one entry per scanned IP/username forever.
	sweep() {
		const cutoff = this.now() - this.windowMs;
		for (const [key, stamps] of this.hits) {
			while (stamps.length > 0 && stamps[0] <= cutoff) stamps.shift();
			if (stamps.length === 0) this.hits.delete(key);
		}
	}
}

// Consecutive-failure account lockout. Call recordFailure() only for a
// REAL account with a wrong password (the resolvers know); call
// recordSuccess() on any successful login. lockedRemainingMs() is the
// pre-check: > 0 means "reject before touching the password hash".
export class LoginAttemptTracker {
	constructor({ maxFails = 5, lockoutMs = 15 * 60 * 1000, failWindowMs = 15 * 60 * 1000, maxKeys = 10_000, now = () => Date.now() } = {}) {
		this.maxFails = Math.max(1, Math.floor(maxFails));
		this.lockoutMs = Math.max(1, lockoutMs);
		this.failWindowMs = Math.max(1, failWindowMs);
		this.maxKeys = Math.max(1, Math.floor(maxKeys ?? 10_000));
		this.now = now;
		this.records = new Map(); // key -> { fails, windowStart, lockedUntil }
	}

	lockedRemainingMs(key) {
		const rec = this.records.get(key);
		// No lock was ever imposed: the failure history must survive this
		// read — the login path calls this check before EVERY attempt, so
		// deleting here would reset the consecutive-failure count and the
		// lockout would never trigger (regression-tested below).
		if (!rec || rec.lockedUntil === 0) return 0;
		const remaining = rec.lockedUntil - this.now();
		if (remaining <= 0) {
			this.records.delete(key);
			return 0;
		}
		return remaining;
	}

	recordSuccess(key) {
		this.records.delete(key);
	}

	recordFailure(key) {
		if (typeof key !== 'string' || key.length === 0) {
			throw new Error('LoginAttemptTracker.recordFailure requires a non-empty string key');
		}
		if (this.records.size >= this.maxKeys) this.sweep();
		const now = this.now();
		let rec = this.records.get(key);
		if (!rec) {
			rec = { fails: 0, windowStart: 0, lockedUntil: 0 };
			this.records.set(key, rec);
		}
		if (rec.lockedUntil > now) {
			// Already locked: report, don't extend the lock and don't
			// double-count (hammering a locked account changes nothing).
			return rec.lockedUntil - now;
		}
		if (rec.windowStart === 0 || now - rec.windowStart > this.failWindowMs) {
			// Stale failures don't accumulate: start a fresh window.
			rec.fails = 0;
			rec.windowStart = now;
		}
		rec.fails += 1;
		if (rec.fails >= this.maxFails) {
			rec.lockedUntil = now + this.lockoutMs;
			rec.fails = 0;
			rec.windowStart = 0;
		}
		return Math.max(0, rec.lockedUntil - now);
	}

	reset(key) {
		if (key === undefined) this.records.clear();
		else this.records.delete(key);
	}

	get size() {
		return this.records.size;
	}

	sweep() {
		const now = this.now();
		for (const [key, rec] of this.records) {
			if (rec.lockedUntil > now) continue;
			if (rec.windowStart !== 0 && now - rec.windowStart <= this.failWindowMs) continue;
			this.records.delete(key);
		}
	}
}

// Module singletons, configured once from the environment. Both surfaces
// (GraphQL resolvers, REST handler) share them so an attacker can't dodge
// the budget by switching surfaces.
const rlCfg = rateLimitConfig();
const loCfg = lockoutConfig();
export const loginIpLimiter = new RateLimiter(rlCfg.loginIp);
export const loginAccountLimiter = new RateLimiter(rlCfg.loginAccount);
export const signupIpLimiter = new RateLimiter(rlCfg.signupIp);
export const loginTracker = new LoginAttemptTracker(loCfg);

// Test seam: clear all guard state between scenarios.
export function resetAuthGuards() {
	loginIpLimiter.reset();
	loginAccountLimiter.reset();
	signupIpLimiter.reset();
	loginTracker.reset();
}

// HTTP Retry-After is whole seconds, minimum 1.
export const retryAfterSeconds = (retryAfterMs) => Math.max(1, Math.ceil(retryAfterMs / 1000));

export function rateLimitedGraphQLError(scope, retryAfterMs) {
	const secs = retryAfterSeconds(retryAfterMs);
	return new GraphQLError(
		`Too many ${scope} attempts. Try again in ${secs} second${secs === 1 ? '' : 's'}.`,
		{ extensions: { code: 'RATE_LIMITED', retryAfterSeconds: secs } }
	);
}

export function accountLockedGraphQLError(retryAfterMs) {
	const secs = retryAfterSeconds(retryAfterMs);
	return new GraphQLError(
		`Account temporarily locked after too many failed login attempts. Try again in ${secs} second${secs === 1 ? '' : 's'}.`,
		{ extensions: { code: 'ACCOUNT_LOCKED', retryAfterSeconds: secs } }
	);
}
