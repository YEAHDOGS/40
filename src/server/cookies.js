/**
 * 40Forty — secure session cookie helpers.
 *
 * The API issues Bearer tokens, but some clients (the web app) do better
 * with an HttpOnly cookie: JS can never read it, so XSS can't steal the
 * session. Flags are set defensively:
 *
 *   HttpOnly  — no document.cookie access, period.
 *   Secure    — sent only over HTTPS in production (NODE_ENV=production).
 *               Skipped in dev so http://localhost still works.
 *   SameSite=Lax — the cookie rides top-level GET navigations but never
 *               cross-site POSTs, which kills CSRF login/session riding.
 *   Path=/    — scoped to the whole app, nothing narrower to fuss over.
 *   Max-Age   — matches the 40-day token expiry in auth.js.
 */

export const SESSION_COOKIE_NAME = 'forty_session';
// Must match TOKEN_EXPIRY ('40d') in src/server/auth.js.
export const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 40;

function isProduction(env = process.env) {
	return env.NODE_ENV === 'production';
}

/** Serialize a Set-Cookie value for a session token. */
export function buildSessionCookie(token, { env = process.env, maxAge = SESSION_COOKIE_MAX_AGE } = {}) {
	const parts = [
		`${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
		'Path=/',
		'HttpOnly',
		`Max-Age=${maxAge}`,
		'SameSite=Lax'
	];
	if (isProduction(env)) {
		parts.push('Secure');
	}
	return parts.join('; ');
}

/** Serialize a Set-Cookie value that deletes the session cookie. */
export function clearSessionCookie({ env = process.env } = {}) {
	return buildSessionCookie('', { env, maxAge: 0 });
}

/**
 * Read the session token from a Cookie request header.
 * Returns null when absent or malformed — never throws.
 */
export function readSessionCookie(cookieHeader) {
	if (typeof cookieHeader !== 'string' || !cookieHeader) return null;
	for (const part of cookieHeader.split(';')) {
		const idx = part.indexOf('=');
		if (idx === -1) continue;
		if (part.slice(0, idx).trim() === SESSION_COOKIE_NAME) {
			try {
				return decodeURIComponent(part.slice(idx + 1).trim()) || null;
			} catch {
				return null;
			}
		}
	}
	return null;
}
