// tests/auth-guard.test.js — integration tests for the brute-force guards
// on BOTH auth surfaces (GraphQL resolvers + REST handler).
//
// Lockout timing is shrunk for this process via env BEFORE the server
// modules load (static imports hoist, so env is set in module body and the
// server modules come in through dynamic import): 3 consecutive failures →
// 1.5s lock. Rate-limit budgets stay at their production defaults.

import './db-test-env.js'; // throwaway sqlite DB first
import test from 'node:test';
import assert from 'node:assert';
import { Readable } from 'node:stream';

process.env.FORTY_LOCKOUT_MAX_FAILS = '3';
process.env.FORTY_LOCKOUT_MS = '1500';
process.env.FORTY_LOCKOUT_FAIL_WINDOW_MS = '60000';
// Proxy headers are trusted only behind an explicit flag (see
// src/server/client-ip.js); these REST tests identify clients via
// X-Forwarded-For, so opt in.
process.env.TRUST_PROXY = '1';

const { resolvers } = await import('../src/server/resolvers.js');
const { restApiHandler } = await import('../src/server/rest.js');
const { resetAuthGuards } = await import('../src/server/rate-limit.js');

const { signUp, login } = resolvers.Mutation;
const tag = () => Math.random().toString(36).slice(2, 10);
const gqlUser = (suffix) => ({
	username: `guard_${suffix}`,
	email: `guard_${suffix}@example.com`,
	displayName: 'Guard User',
	password: 'correct-horse-9x!'
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Mock HTTP plumbing, mirroring tests/api.test.js.
function mockReq(method, url, headers = {}, body = null) {
	const req = new Readable({ read() {} });
	req.method = method;
	req.url = url;
	req.headers = headers;
	if (body !== null) req.push(JSON.stringify(body));
	req.push(null);
	return req;
}
function mockRes() {
	let resolveFn;
	const done = new Promise((resolve) => { resolveFn = resolve; });
	const res = {
		statusCode: 200,
		headers: {},
		body: '',
		writeHead(status, headers) {
			this.statusCode = status;
			Object.assign(this.headers, headers);
			return this;
		},
		end(chunk) {
			if (chunk) this.body += chunk;
			resolveFn();
		}
	};
	return { res, done };
}
const callRest = async (method, url, headers, body) => {
	const { res, done } = mockRes();
	await restApiHandler(mockReq(method, url, headers, body), res, () => {});
	await done;
	let json = null;
	try { json = JSON.parse(res.body); } catch { /* non-JSON body */ }
	return { status: res.statusCode, headers: res.headers, json };
};

test('auth-guard (GraphQL): per-IP login budget enforced with RATE_LIMITED shape', async (t) => {
	resetAuthGuards();
	const ctx = { clientIp: `gql-login-ip-${tag()}` };

	await t.test('first 20 attempts from one IP are processed (401s, not 429s)', async () => {
		for (let i = 0; i < 20; i++) {
			await assert.rejects(
				login(null, { username: `nouser_${tag()}_${i}`, password: 'whatever12' }, ctx),
				/Invalid credentials/,
				`attempt ${i + 1} should reach the credential check`
			);
		}
	});

	await t.test('21st attempt is rejected as RATE_LIMITED with retryAfterSeconds', async () => {
		try {
			await login(null, { username: `nouser_${tag()}_over`, password: 'whatever12' }, ctx);
			assert.fail('expected RATE_LIMITED');
		} catch (err) {
			assert.strictEqual(err.extensions?.code, 'RATE_LIMITED');
			assert.ok(Number.isInteger(err.extensions?.retryAfterSeconds));
			assert.ok(err.extensions.retryAfterSeconds >= 1);
			assert.match(err.message, /Too many login attempts/);
		}
	});

	await t.test('a different IP still has its own full budget', async () => {
		const other = { clientIp: `gql-login-ip-${tag()}` };
		await assert.rejects(
			login(null, { username: `nouser_${tag()}`, password: 'whatever12' }, other),
			/Invalid credentials/,
			'fresh IP must not inherit the exhausted budget'
		);
	});
});

test('auth-guard (GraphQL): account lockout after 3 consecutive failures', async (t) => {
	resetAuthGuards();
	const signupCtx = { clientIp: `gql-su-${tag()}` };
	const loginCtx = { clientIp: `gql-li-${tag()}` };
	const input = gqlUser(tag());
	await signUp(null, input, signupCtx);

	await t.test('three wrong passwords, then even the right one is ACCOUNT_LOCKED', async () => {
		for (let i = 0; i < 3; i++) {
			await assert.rejects(
				login(null, { username: input.username, password: 'wrong-password' }, loginCtx),
				/Invalid credentials/
			);
		}
		try {
			await login(null, { username: input.username, password: input.password }, loginCtx);
			assert.fail('expected ACCOUNT_LOCKED');
		} catch (err) {
			assert.strictEqual(err.extensions?.code, 'ACCOUNT_LOCKED');
			assert.ok(err.extensions?.retryAfterSeconds >= 1);
			assert.match(err.message, /temporarily locked/);
		}
	});

	await t.test('the lock releases and the correct password works again', async () => {
		await sleep(1700); // lockoutMs=1500 for this process
		const good = await login(null, { username: input.username, password: input.password }, loginCtx);
		assert.ok(good.token.accessToken, 'login succeeds after the lock expires');
	});
});

test('auth-guard (GraphQL): legit users are unaffected by normal use', async (t) => {
	resetAuthGuards();
	const ctx = { clientIp: `gql-legit-${tag()}` };
	const input = gqlUser(tag());
	await signUp(null, input, { clientIp: `gql-legit-su-${tag()}` });

	await t.test('a success resets the failure counter — never locked', async () => {
		// fail, fail, SUCCESS (resets), fail, SUCCESS — maxFails is 3, so a
		// naive consecutive counter without reset-on-success would lock here.
		await assert.rejects(login(null, { username: input.username, password: 'nope-nope1' }, ctx), /Invalid credentials/);
		await assert.rejects(login(null, { username: input.username, password: 'nope-nope2' }, ctx), /Invalid credentials/);
		const ok1 = await login(null, { username: input.username, password: input.password }, ctx);
		assert.ok(ok1.token.accessToken);
		await assert.rejects(login(null, { username: input.username, password: 'nope-nope3' }, ctx), /Invalid credentials/);
		const ok2 = await login(null, { username: input.username, password: input.password }, ctx);
		assert.ok(ok2.token.accessToken, 'still not locked after interleaved success');
	});

	await t.test('several logins in a row stay well under the budgets', async () => {
		// Fresh account: the previous subtest already spent this user's
		// 5/min per-account budget (fail, fail, success, fail, success).
		const fresh = gqlUser(tag());
		await signUp(null, fresh, { clientIp: `gql-legit-su2-${tag()}` });
		for (let i = 0; i < 3; i++) {
			const ok = await login(null, { username: fresh.username, password: fresh.password }, ctx);
			assert.ok(ok.token.accessToken, `login ${i + 1} succeeds`);
		}
	});
});

test('auth-guard (GraphQL): per-IP signup budget enforced', async (t) => {
	resetAuthGuards();
	const ctx = { clientIp: `gql-signup-${tag()}` };

	await t.test('15 signups from one IP succeed, the 16th is RATE_LIMITED', async () => {
		for (let i = 0; i < 15; i++) {
			const r = await signUp(null, gqlUser(`${tag()}_${i}`), ctx);
			assert.ok(r.token.accessToken, `signup ${i + 1} succeeds`);
		}
		try {
			await signUp(null, gqlUser(tag()), ctx);
			assert.fail('expected RATE_LIMITED');
		} catch (err) {
			assert.strictEqual(err.extensions?.code, 'RATE_LIMITED');
			assert.ok(err.extensions?.retryAfterSeconds >= 1);
		}
	});
});

test('auth-guard (REST): 429 shape on the login endpoint', async (t) => {
	resetAuthGuards();
	const ip = `rest-login-${tag()}`;
	const headers = { 'x-forwarded-for': ip };

	await t.test('first 20 attempts return 400 (validation), 21st returns 429', async () => {
		for (let i = 0; i < 20; i++) {
			const r = await callRest('POST', '/api/auth/login', headers, {});
			assert.strictEqual(r.status, 400, `attempt ${i + 1} should be a validation 400, not ${r.status}`);
		}
		const over = await callRest('POST', '/api/auth/login', headers, {});
		assert.strictEqual(over.status, 429);
		assert.match(String(over.headers['Retry-After'] ?? ''), /^[1-9]\d*$/, 'Retry-After is a positive integer header');
		assert.strictEqual(typeof over.json?.error, 'string');
		assert.ok(Number.isInteger(over.json?.retryAfterSeconds) && over.json.retryAfterSeconds >= 1);
		assert.strictEqual(String(over.headers['Retry-After']), String(over.json.retryAfterSeconds));
	});

	await t.test('CORS headers survive the 429 path', async () => {
		const over = await callRest('POST', '/api/auth/login', headers, {});
		assert.strictEqual(over.status, 429);
		assert.strictEqual(over.headers['Access-Control-Allow-Origin'], '*');
	});
});

test('auth-guard (REST): account lockout end-to-end', async (t) => {
	resetAuthGuards();
	const input = gqlUser(tag());
	await signUp(null, input, { clientIp: `rest-su-${tag()}` }); // create via GraphQL
	const ip = `rest-lock-${tag()}`;
	const headers = { 'x-forwarded-for': ip };
	const loginBody = (pw) => ({ username: input.username, password: pw });

	await t.test('three wrong passwords, then the account reports temporarily locked', async () => {
		for (let i = 0; i < 3; i++) {
			const r = await callRest('POST', '/api/auth/login', headers, loginBody('wrong-password'));
			assert.strictEqual(r.status, 401, `attempt ${i + 1} should be 401`);
			assert.strictEqual(r.json?.error, 'Invalid credentials');
		}
		const locked = await callRest('POST', '/api/auth/login', headers, loginBody(input.password));
		assert.strictEqual(locked.status, 429);
		assert.match(locked.json?.error ?? '', /temporarily locked/);
		assert.ok(locked.json?.retryAfterSeconds >= 1);
	});

	await t.test('lock releases and a correct login returns a token', async () => {
		await sleep(1700);
		const good = await callRest('POST', '/api/auth/login', headers, loginBody(input.password));
		assert.strictEqual(good.status, 200);
		assert.ok(good.json?.token?.accessToken, 'token issued after lock expiry');
	});
});

test('auth-guard (REST): legit signup/login round trip under the budgets', async (t) => {
	resetAuthGuards();
	const ip = `rest-legit-${tag()}`;
	const headers = { 'x-forwarded-for': ip };
	const input = gqlUser(tag());

	await t.test('signup then two logins all succeed', async () => {
		const su = await callRest('POST', '/api/auth/signup', headers, input);
		assert.strictEqual(su.status, 201);
		for (let i = 0; i < 2; i++) {
			const li = await callRest('POST', '/api/auth/login', headers, {
				username: input.username,
				password: input.password
			});
			assert.strictEqual(li.status, 200, `login ${i + 1} succeeds`);
			assert.ok(li.json?.token?.accessToken);
		}
	});
});
