/**
 * Session security integration tests.
 *
 * End-to-end through the REST handler (throwaway sqlite DB, in-memory
 * session store — no network):
 *
 * 1. login/signup issues an HttpOnly + SameSite=Lax session cookie and the
 *    cookie alone authenticates subsequent requests (logout clears it).
 * 2. POST /auth/change-password verifies the current password, updates the
 *    hash, and revokes every OTHER session while keeping the current one.
 */
import test from 'node:test';
import assert from 'node:assert';
import { Readable } from 'stream';
import './setup-db.js';
const { restApiHandler } = await import('../src/server/rest.js');
const { readSessionCookie } = await import('../src/server/cookies.js');

function createMockReq(method, url, headers = {}, body = null) {
	const req = new Readable({ read() {} });
	req.method = method;
	req.url = url;
	req.headers = headers;
	req.socket = { remoteAddress: '127.0.0.1' };
	if (body) req.push(JSON.stringify(body));
	req.push(null);
	return req;
}

function createMockRes() {
	let resolveFn;
	const promise = new Promise((resolve) => {
		resolveFn = resolve;
	});
	const res = {
		statusCode: 200,
		headers: {},
		body: '',
		setHeader(name, value) {
			this.headers[name] = value;
			return this;
		},
		writeHead(status, headers) {
			this.statusCode = status;
			Object.assign(this.headers, headers);
			return this;
		},
		end(chunk) {
			if (chunk) this.body += chunk;
			resolveFn(this);
		},
		wait() {
			return promise;
		}
	};
	return res;
}

async function callApi(method, url, { headers = {}, body = null } = {}) {
	const req = createMockReq(method, url, headers, body);
	const res = createMockRes();
	await restApiHandler(req, res, () => {});
	const completed = await res.wait();
	return {
		status: completed.statusCode,
		headers: completed.headers,
		json: completed.body ? JSON.parse(completed.body) : null
	};
}

const uniq = (p) => `${p}_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

async function signupUser(tag) {
	const username = uniq(`sessuser_${tag}`);
	const password = 'correct-horse-42';
	const r = await callApi('POST', '/api/auth/signup', {
		body: { username, email: `${username}@example.com`, displayName: username, password }
	});
	assert.strictEqual(r.status, 201, `signup failed: ${JSON.stringify(r.json)}`);
	return { username, password };
}

test('session cookie issuance + cookie auth + cookie clear on logout', async (t) => {
	const { username, password } = await signupUser('cookie');

	// Signup sets the secure session cookie
	const login = await callApi('POST', '/api/auth/login', {
		body: { username, password }
	});
	assert.strictEqual(login.status, 200);
	const setCookie = login.headers['Set-Cookie'];
	assert.ok(setCookie, 'login must set a session cookie');
	assert.ok(setCookie.includes('HttpOnly'), 'cookie is HttpOnly');
	assert.ok(setCookie.includes('SameSite=Lax'), 'cookie is SameSite=Lax');
	const cookieValue = setCookie.split(';')[0];
	assert.ok(readSessionCookie(cookieValue), 'cookie value parses back to a token');

	// The cookie alone authenticates (no Authorization header)
	const authed = await callApi('PUT', '/api/users/profile', {
		headers: { cookie: cookieValue },
		body: { bio: 'cookie authed' }
	});
	assert.strictEqual(authed.status, 200, `cookie auth failed: ${JSON.stringify(authed.json)}`);
	assert.strictEqual(authed.json.bio, 'cookie authed');

	// Logout clears the cookie and kills the session
	const logout = await callApi('POST', '/api/auth/logout', {
		headers: { cookie: cookieValue }
	});
	assert.strictEqual(logout.status, 200);
	assert.ok(
		logout.headers['Set-Cookie'].includes('Max-Age=0'),
		'logout must expire the cookie'
	);

	// Cookie is dead after logout
	const dead = await callApi('PUT', '/api/users/profile', {
		headers: { cookie: cookieValue },
		body: { bio: 'should fail' }
	});
	assert.strictEqual(dead.status, 401);
});

test('change-password rotates sessions: others die, current survives', async (t) => {
	const { username, password } = await signupUser('rotate');

	// Two live sessions (two "devices")
	const loginA = await callApi('POST', '/api/auth/login', { body: { username, password } });
	const loginB = await callApi('POST', '/api/auth/login', { body: { username, password } });
	const tokenA = loginA.json.token.accessToken;
	const tokenB = loginB.json.token.accessToken;
	assert.ok(tokenA && tokenB && tokenA !== tokenB);

	const bearer = (tok) => ({ authorization: `Bearer ${tok}` });

	// Both sessions work before the change
	assert.strictEqual(
		(await callApi('PUT', '/api/users/profile', { headers: bearer(tokenB), body: { bio: 'x' } })).status,
		200
	);

	// Wrong current password: rejected, hash untouched
	const wrong = await callApi('POST', '/api/auth/change-password', {
		headers: bearer(tokenA),
		body: { currentPassword: 'wrong-password-00', newPassword: 'brand-new-pass-99' }
	});
	assert.strictEqual(wrong.status, 401);

	// Short new password: rejected
	const short = await callApi('POST', '/api/auth/change-password', {
		headers: bearer(tokenA),
		body: { currentPassword: password, newPassword: 'tiny' }
	});
	assert.strictEqual(short.status, 400);

	// Real change from session A
	const changed = await callApi('POST', '/api/auth/change-password', {
		headers: bearer(tokenA),
		body: { currentPassword: password, newPassword: 'brand-new-pass-99' }
	});
	assert.strictEqual(changed.status, 200, `change failed: ${JSON.stringify(changed.json)}`);
	assert.ok(changed.json.sessionsRevoked >= 1, 'other session(s) revoked');

	// Session A (the one that changed the password) still works
	const stillAlive = await callApi('PUT', '/api/users/profile', {
		headers: bearer(tokenA),
		body: { bio: 'still me' }
	});
	assert.strictEqual(stillAlive.status, 200, 'current session must survive the rotation');

	// Session B is dead
	const killed = await callApi('PUT', '/api/users/profile', {
		headers: bearer(tokenB),
		body: { bio: 'intruder' }
	});
	assert.strictEqual(killed.status, 401, 'other sessions must be revoked');

	// Old password no longer logs in; new password does
	const oldLogin = await callApi('POST', '/api/auth/login', { body: { username, password } });
	assert.strictEqual(oldLogin.status, 401);
	const newLogin = await callApi('POST', '/api/auth/login', {
		body: { username, password: 'brand-new-pass-99' }
	});
	assert.strictEqual(newLogin.status, 200);
});

test('change-password requires authentication', async (t) => {
	const r = await callApi('POST', '/api/auth/change-password', {
		body: { currentPassword: 'x', newPassword: 'y'.repeat(16) }
	});
	assert.strictEqual(r.status, 401);
});
