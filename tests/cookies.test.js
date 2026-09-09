/**
 * Secure session cookie tests.
 *
 * Regression coverage for session handling: the session cookie must be
 * HttpOnly, carry SameSite=Lax, set Secure in production only, and the
 * clear-cookie path must actually expire the cookie. All pure functions —
 * no network.
 */
import test from 'node:test';
import assert from 'node:assert';
import {
	buildSessionCookie,
	clearSessionCookie,
	readSessionCookie,
	SESSION_COOKIE_NAME,
	SESSION_COOKIE_MAX_AGE
} from '../src/server/cookies.js';

const PROD = { NODE_ENV: 'production' };
const DEV = { NODE_ENV: 'development' };

test('buildSessionCookie sets the defensive flags', async (t) => {
	const header = buildSessionCookie('tok-abc-123', { env: DEV });
	assert.ok(header.startsWith(`${SESSION_COOKIE_NAME}=tok-abc-123`), 'name=value first');
	assert.ok(header.includes('HttpOnly'), 'HttpOnly set');
	assert.ok(header.includes('SameSite=Lax'), 'SameSite=Lax set');
	assert.ok(header.includes('Path=/'), 'Path=/ set');
	assert.ok(header.includes(`Max-Age=${SESSION_COOKIE_MAX_AGE}`), 'Max-Age matches token expiry');
	assert.ok(!header.includes('Secure'), 'no Secure flag outside production (localhost dev)');
});

test('Secure flag is set in production', async (t) => {
	const header = buildSessionCookie('tok-abc-123', { env: PROD });
	assert.ok(header.includes('Secure'), 'Secure set in production');
});

test('clearSessionCookie expires the cookie immediately', async (t) => {
	const header = clearSessionCookie({ env: DEV });
	assert.ok(header.includes('Max-Age=0'), 'Max-Age=0 expires it');
	assert.ok(header.includes('HttpOnly'), 'flags preserved on clear');
});

test('readSessionCookie round-trips and ignores noise', async (t) => {
	const issued = buildSessionCookie('tok-xyz', { env: DEV });
	// buildSessionCookie returns only the value portion; simulate a header
	const header = `other=1; ${SESSION_COOKIE_NAME}=tok-xyz; theme=dark`;
	assert.strictEqual(readSessionCookie(header), 'tok-xyz');
	assert.strictEqual(readSessionCookie(issued.split(';')[0] + '; theme=dark'), 'tok-xyz');
	assert.strictEqual(readSessionCookie('theme=dark; other=1'), null);
	assert.strictEqual(readSessionCookie(''), null);
	assert.strictEqual(readSessionCookie(null), null);
	assert.strictEqual(readSessionCookie(`${SESSION_COOKIE_NAME}=`), null);
});

test('token values are URL-encoded so separators cannot break the header', async (t) => {
	const header = buildSessionCookie('a;b c', { env: DEV });
	assert.ok(!header.includes('a;b'), 'raw semicolon must not appear');
	const value = header.split(';')[0].split('=')[1];
	assert.strictEqual(decodeURIComponent(value), 'a;b c');
});
