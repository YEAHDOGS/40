// Free-tier guard: keeps this Worker inside Cloudflare's free allowances so a traffic spike can never
// become a bill (or starve the other Workers on the same account, which share the same daily quotas).
// When a daily budget is used up the API answers 503 "resting" until midnight UTC; the static app
// still loads because assets never invoke the Worker.
//
// REMOVING THIS (once there are paying users): set the FREE_TIER_GUARD var to "off" in wrangler.jsonc,
// or raise FREE_TIER_SHARE. To delete it for good: remove this file, the "usage" table, and the three
// calls in worker/index.js (check, meter, settle). Nothing else depends on it. Created by DOGS.

// Cloudflare free plan, per account per UTC day (Workers requests, D1 rows) and per database (size).
const FREE_TIER_DAILY = { requests: 100_000, rowsRead: 5_000_000, rowsWritten: 100_000 };
const FREE_TIER_DB_BYTES = 500 * 1024 * 1024;
// The fraction of those allowances this Worker may use. Override with the FREE_TIER_SHARE var.
const DEFAULT_SHARE = 0.33;

// Usage is counted in memory and saved every few requests, so the guard itself costs almost nothing.
const FLUSH_EVERY_REQUESTS = 10;
const FLUSH_EVERY_MS = 30_000;
// One address cannot burn the whole day's budget.
const PER_IP_PER_MINUTE = 120;
const MINUTE_MS = 60_000;
const MAX_TRACKED_IPS = 5_000;
const DAY_MS = 86_400_000;

const zero = () => ({ requests: 0, rowsRead: 0, rowsWritten: 0, dbBytes: 0 });

// Per-isolate state. Several isolates may run at once; each is at most one flush behind the others.
let day = '';
let totals = null;
let pending = zero();
let lastFlush = 0;
const hits = new Map();

const enabled = (env) => env.FREE_TIER_GUARD !== 'off';
const share = (env) => Number(env.FREE_TIER_SHARE) || DEFAULT_SHARE;
const used = (key) => (totals?.[key] || 0) + pending[key];

function resting(message, now) {
	const retryAfter = Math.ceil((DAY_MS - (now % DAY_MS)) / 1000);
	return Response.json(
		{ error: message, code: 'resting' },
		{ status: 503, headers: { 'Retry-After': String(retryAfter) } }
	);
}

function tooFast(req, now) {
	const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
	const minute = Math.floor(now / MINUTE_MS);
	const hit = hits.get(ip);
	if (!hit || hit.minute !== minute) {
		if (hits.size >= MAX_TRACKED_IPS) hits.clear();
		hits.set(ip, { minute, count: 1 });
		return false;
	}
	return ++hit.count > PER_IP_PER_MINUTE;
}

// Call before handling a request. Returns a Response when the request must be refused, else null.
export async function check(req, env, now = Date.now()) {
	if (!enabled(env)) return null;
	if (tooFast(req, now)) return Response.json({ error: 'slow down a little' }, { status: 429 });

	const today = new Date(now).toISOString().slice(0, 10);
	if (today !== day) [day, totals, pending] = [today, null, zero()];
	totals ??=
		(await env.DB.prepare('select * from "usage" where "day" = ?').bind(day).first()) || zero();

	const fraction = share(env);
	const over = (key) => used(key) >= FREE_TIER_DAILY[key] * fraction;
	const message = '40 has reached its limit for today and is resting until midnight UTC.';
	if (over('requests') || over('rowsRead')) return resting(message, now);
	if (req.method === 'GET') return null;
	if (over('rowsWritten')) return resting(message, now);
	// A full database still accepts deletes, so people can always remove their own data.
	const full = Math.max(totals.dbBytes, pending.dbBytes) >= FREE_TIER_DB_BYTES * fraction;
	if (full && req.method !== 'DELETE')
		return resting('40 is full right now. Nothing new can be saved.', now);
	return null;
}

// Wraps a D1 database so every query adds its real cost (rows read and written) to the day's usage.
// One wrapper per database for the life of the isolate, so anything holding on to it keeps being counted.
const metered = new WeakMap();

export function meter(db, env) {
	if (!enabled(env)) return db;
	if (!metered.has(db)) metered.set(db, wrapDatabase(db));
	return metered.get(db);
}

function wrapDatabase(db) {
	const raw = new WeakMap();
	const count = (result) => {
		pending.rowsRead += result?.meta?.rows_read || 0;
		pending.rowsWritten += result?.meta?.rows_written || 0;
		if (result?.meta?.size_after) pending.dbBytes = result.meta.size_after;
		return result;
	};
	const wrap = (statement) => {
		const proxy = new Proxy(statement, {
			get(target, prop) {
				if (prop === 'bind') return (...args) => wrap(target.bind(...args));
				if (prop === 'all' || prop === 'run') return async () => count(await target[prop]());
				// first() reports no cost of its own, so it is rebuilt on all().
				if (prop === 'first') {
					return async (column) => {
						const row = count(await target.all()).results[0] ?? null;
						return column && row ? row[column] : row;
					};
				}
				const value = target[prop];
				return typeof value === 'function' ? value.bind(target) : value;
			}
		});
		raw.set(proxy, statement);
		return proxy;
	};
	return new Proxy(db, {
		get(target, prop) {
			if (prop === 'prepare') return (sql) => wrap(target.prepare(sql));
			if (prop === 'batch') {
				return async (statements) =>
					(await target.batch(statements.map((s) => raw.get(s) || s))).map(count);
			}
			const value = target[prop];
			return typeof value === 'function' ? value.bind(target) : value;
		}
	});
}

async function flush(env) {
	const delta = pending;
	pending = zero();
	try {
		// "+ 1" on rowsWritten is this statement's own write.
		totals = await env.DB.prepare(
			`insert into "usage" ("day", "requests", "rowsRead", "rowsWritten", "dbBytes")
			values (?1, ?2, ?3, ?4 + 1, ?5)
			on conflict ("day") do update set
				"requests" = "requests" + ?2,
				"rowsRead" = "rowsRead" + ?3,
				"rowsWritten" = "rowsWritten" + ?4 + 1,
				"dbBytes" = case when ?5 > 0 then ?5 else "dbBytes" end
			returning *`
		)
			.bind(day, delta.requests, delta.rowsRead, delta.rowsWritten, delta.dbBytes)
			.first();
	} catch (err) {
		// Keep the counts for the next attempt rather than losing them.
		for (const key of ['requests', 'rowsRead', 'rowsWritten']) pending[key] += delta[key];
		pending.dbBytes ||= delta.dbBytes;
		console.error('usage flush failed', err);
	}
}

// Call after every request: counts it, and saves the running totals every so often.
export function settle(env, ctx, now = Date.now()) {
	if (!enabled(env) || !day) return;
	pending.requests++;
	if (pending.requests < FLUSH_EVERY_REQUESTS && now - lastFlush < FLUSH_EVERY_MS) return;
	lastFlush = now;
	ctx.waitUntil(flush(env));
}
