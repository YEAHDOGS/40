/**
 * Password authentication tests.
 *
 * Regression coverage for the fix where login accepted any username with NO
 * password check at all. Passwords are now scrypt-hashed at signup and
 * verified at login on both the REST and GraphQL paths, and the hash is
 * never exposed in API responses or the GraphQL schema.
 */
import test from 'node:test';
import assert from 'node:assert';
import { Readable } from 'stream';
import './setup-db.js';
import { hashPassword, verifyPassword, MIN_PASSWORD_LENGTH } from '../src/server/passwords.js';
const { restApiHandler } = await import('../src/server/rest.js');

// ---- unit: the hash itself ----

test('password hashing', async (t) => {
	await t.test('hashes and verifies a round trip', async () => {
		const hash = await hashPassword('correct-horse-42');
		assert.strictEqual(await verifyPassword('correct-horse-42', hash), true);
	});

	await t.test('wrong password does not verify', async () => {
		const hash = await hashPassword('correct-horse-42');
		assert.strictEqual(await verifyPassword('wrong-password-00', hash), false);
	});

	await t.test('each hash gets a unique salt', async () => {
		const a = await hashPassword('correct-horse-42');
		const b = await hashPassword('correct-horse-42');
		assert.notStrictEqual(a, b);
		assert.strictEqual(await verifyPassword('correct-horse-42', b), true);
	});

	await t.test('short passwords are rejected at hash time', async () => {
		await assert.rejects(() => hashPassword('short'), /at least/);
		await assert.rejects(() => hashPassword(''), /at least/);
	});

	await t.test('malformed hashes fail closed, never throw', async () => {
		assert.strictEqual(await verifyPassword('correct-horse-42', null), false);
		assert.strictEqual(await verifyPassword('correct-horse-42', undefined), false);
		assert.strictEqual(await verifyPassword('correct-horse-42', 'not-a-hash'), false);
		assert.strictEqual(await verifyPassword('correct-horse-42', 'scrypt$v1$1$2$3$AAAA$BBBB'), false);
		assert.strictEqual(await verifyPassword('correct-horse-42', 'bcrypt$2b$10$....................'), false);
	});

	await t.test('minimum length is 8', () => {
		assert.strictEqual(MIN_PASSWORD_LENGTH, 8);
	});
});

// ---- integration: REST signup/login ----

function createMockReq(method, url, headers = {}, body = null) {
	const req = new Readable({ read() {} });
	req.method = method;
	req.url = url;
	req.headers = headers;
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

async function rest(method, url, body = null, headers = {}) {
	const req = createMockReq(method, url, headers, body);
	const res = createMockRes();
	await restApiHandler(req, res, () => {});
	const done = await res.wait();
	return { status: done.statusCode, data: JSON.parse(done.body) };
}

test('REST password auth end to end', async (t) => {
	const suffix = Math.random().toString(36).substring(7);
	const creds = {
		username: `pw_user_${suffix}`,
		email: `pw_user_${suffix}@example.com`,
		displayName: 'Password Tester',
		password: 'correct-horse-42'
	};

	await t.test('signup without a password is rejected', async () => {
		const { password: _dropped, ...noPw } = creds;
		const { status, data } = await rest('POST', '/api/auth/signup', noPw);
		assert.strictEqual(status, 400);
		assert.ok(data.error.includes('Password is required'));
	});

	await t.test('signup with a short password is rejected', async () => {
		const { status, data } = await rest('POST', '/api/auth/signup', { ...creds, password: 'short' });
		assert.strictEqual(status, 400);
		assert.ok(data.error.includes('Password is required'));
	});

	await t.test('signup succeeds and never returns the hash', async () => {
		const { status, data } = await rest('POST', '/api/auth/signup', creds);
		assert.strictEqual(status, 201);
		assert.ok(data.token.accessToken);
		assert.strictEqual(data.user.username, creds.username);
		assert.strictEqual(data.user.passwordHash, undefined);
		assert.ok(!JSON.stringify(data).includes('passwordHash'));
	});

	await t.test('login with the correct password succeeds', async () => {
		const { status, data } = await rest('POST', '/api/auth/login', {
			username: creds.username,
			password: creds.password
		});
		assert.strictEqual(status, 200);
		assert.ok(data.token.accessToken);
		assert.strictEqual(data.user.passwordHash, undefined);
	});

	await t.test('login with a wrong password fails closed', async () => {
		const { status, data } = await rest('POST', '/api/auth/login', {
			username: creds.username,
			password: 'wrong-password-00'
		});
		assert.strictEqual(status, 401);
		assert.strictEqual(data.error, 'Invalid credentials');
	});

	await t.test('login with an unknown username fails the same way (no enumeration)', async () => {
		const { status, data } = await rest('POST', '/api/auth/login', {
			username: `nobody_${suffix}`,
			password: 'correct-horse-42'
		});
		assert.strictEqual(status, 401);
		assert.strictEqual(data.error, 'Invalid credentials');
	});

	await t.test('login without a password is rejected', async () => {
		const { status } = await rest('POST', '/api/auth/login', { username: creds.username });
		assert.strictEqual(status, 400);
	});
});
