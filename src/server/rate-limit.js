/**
 * 40Forty — login rate limiting.
 *
 * Defense against credential-stuffing / password-guessing: per-IP and
 * per-account sliding-window failure counters. When a bucket trips, it gets
 * a lockout that doubles each consecutive trip (exponential backoff, capped),
 * so real users mistyping once or twice are unaffected while automated
 * guessing is throttled hard.
 *
 * Pure in-memory and clock-injectable: no network, no Redis, fully
 * unit-testable. For a multi-instance deployment this would move to Redis,
 * but the limiter API (check / recordFailure / recordSuccess) stays the same.
 *
 * The attempt log records { timestamp, ip, account, ok } ONLY — it never
 * touches passwords, and its `record` signature doesn't even accept one.
 */

// Conservative defaults: a real user rarely fails login 5x in 15 minutes,
// and a single IP legitimately failing 20x in 15 minutes is basically never
// innocent traffic (even behind NAT, legitimate users succeed).
export const DEFAULTS = {
	windowMs: 15 * 60 * 1000, // sliding window: 15 minutes
	ipMaxFailures: 20, // per-IP failures before lockout
	accountMaxFailures: 5, // per-account failures before lockout
	lockoutBaseMs: 60 * 1000, // first lockout: 1 minute
	lockoutMaxMs: 15 * 60 * 1000 // lockout cap: 15 minutes
};

function makeBucket() {
	return { failures: [], lockedUntil: 0, lockoutCount: 0 };
}

function prune(bucket, now, windowMs) {
	const cutoff = now - windowMs;
	while (bucket.failures.length && bucket.failures[0] <= cutoff) {
		bucket.failures.shift();
	}
}

/**
 * Create a login rate limiter.
 * @param {object} opts overrides for DEFAULTS plus `now` (ms clock, injectable for tests)
 */
export function createLoginRateLimiter(opts = {}) {
	const { now = () => Date.now(), ...rest } = opts;
	const cfg = { ...DEFAULTS, ...rest };
	const ipBuckets = new Map();
	const accountBuckets = new Map();

	const bucketFor = (map, key) => {
		let b = map.get(key);
		if (!b) {
			b = makeBucket();
			map.set(key, b);
		}
		return b;
	};

	/**
	 * Is a login attempt from this ip/account allowed right now?
	 * @returns {{ ok: true } | { ok: false, retryAfterMs: number, bucket: 'ip' | 'account' }}
	 */
	function check(ip, account) {
		const t = now();
		const ipBucket = bucketFor(ipBuckets, `ip:${ip}`);
		const acctBucket = bucketFor(accountBuckets, `acct:${String(account).toLowerCase()}`);
		if (ipBucket.lockedUntil > t) {
			return { ok: false, retryAfterMs: ipBucket.lockedUntil - t, bucket: 'ip' };
		}
		if (acctBucket.lockedUntil > t) {
			return { ok: false, retryAfterMs: acctBucket.lockedUntil - t, bucket: 'account' };
		}
		return { ok: true };
	}

	/**
	 * Record a failed login. Trips the bucket into exponential-backoff lockout
	 * once the sliding-window count reaches the threshold.
	 * @returns {{ locked: boolean, retryAfterMs: number }}
	 */
	function recordFailure(ip, account) {
		const t = now();
		const results = {};
		for (const [map, key, max] of [
			[ipBuckets, `ip:${ip}`, cfg.ipMaxFailures],
			[accountBuckets, `acct:${String(account).toLowerCase()}`, cfg.accountMaxFailures]
		]) {
			const b = bucketFor(map, key);
			prune(b, t, cfg.windowMs);
			b.failures.push(t);
			if (b.failures.length >= max && b.lockedUntil <= t) {
				const lockoutMs = Math.min(
					cfg.lockoutBaseMs * 2 ** b.lockoutCount,
					cfg.lockoutMaxMs
				);
				b.lockedUntil = t + lockoutMs;
				b.lockoutCount += 1;
				results.locked = true;
				results.retryAfterMs = lockoutMs;
			}
		}
		return results.locked ? results : { locked: false, retryAfterMs: 0 };
	}

	/**
	 * Record a successful login. A success proves the account holder is real,
	 * so the account bucket resets entirely (a typo streak followed by the
	 * correct password must not keep a legit user locked out). IP failures
	 * are left alone — failures from that address were still guesses.
	 */
	function recordSuccess(ip, account) {
		accountBuckets.delete(`acct:${String(account).toLowerCase()}`);
	}

	/** Introspection for tests / monitoring. Never contains passwords. */
	function stats() {
		return {
			ipBuckets: ipBuckets.size,
			accountBuckets: accountBuckets.size
		};
	}

	return { check, recordFailure, recordSuccess, stats, config: cfg };
}

/**
 * Bounded in-memory login attempt log.
 * Entries: { ts, ip, account, ok }. Passwords are never recorded — the
 * `record` signature has no password parameter, so it is structurally
 * impossible to log one through this API.
 */
export function createLoginAttemptLog(capacity = 500) {
	const entries = [];
	return {
		record({ ip, account, ok, ts = Date.now() }) {
			entries.push({ ts, ip, account, ok: !!ok });
			while (entries.length > capacity) entries.shift();
		},
		list() {
			return entries.slice();
		},
		size() {
			return entries.length;
		}
	};
}

// Shared production instances (single-process; tests create their own).
export const loginRateLimiter = createLoginRateLimiter();
export const loginAttemptLog = createLoginAttemptLog();

/**
 * Extract the client IP for a Node http request.
 * Deliberately ignores X-Forwarded-For: it is client-spoofable and would let
 * an attacker rotate fake IPs past the per-IP bucket. Socket address is the
 * only trustworthy source when no trusted proxy is configured.
 */
export function getClientIp(req) {
	return req?.socket?.remoteAddress || 'unknown';
}

/** Normalize usernames for bucketing so `Brando` and `brando` share a bucket. */
export function normalizeAccount(username) {
	return String(username || '').toLowerCase();
}
