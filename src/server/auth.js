import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { getRedisClient } from './redis.js';
import { printStartupBanner, printFatalBanner } from './startup-banner.js';

const DEV_ONLY_SECRET = 'forty-dev-only-secret';

/**
 * Resolve the JWT signing secret from the environment.
 *
 * Fail-safe contract: in production (NODE_ENV=production) a missing
 * JWT_SECRET is a fatal startup error — the server refuses to boot rather
 * than silently signing tokens with a hardcoded fallback. Outside
 * production, the dev-only fallback is kept so local development stays
 * zero-config, but it is loudly announced so it can never hide.
 */
export function resolveJwtSecret(env = process.env) {
	const secret = env.JWT_SECRET;
	if (!secret) {
		if (env.NODE_ENV === 'production') {
			// Be loud on the way out: the FATAL banner names the exact
			// missing env var so staging/prod crash-loops point at the fix.
			printFatalBanner(env, 'JWT_SECRET');
			throw new Error(
				'[auth] FATAL: JWT_SECRET is not set. Refusing to start with NODE_ENV=production ' +
				'— set JWT_SECRET to a real value (e.g. `openssl rand -base64 48`).'
			);
		}
		console.warn('[auth] JWT_SECRET not set - using dev-only fallback. Set JWT_SECRET in production!');
		return DEV_ONLY_SECRET;
	}
	assertSecretStrength(env, secret);
	// Boot checklist: loud confirmation of what the server resolved.
	printStartupBanner(env);
	return secret;
}

/**
 * Startup auth self-check: a JWT_SECRET that is short or identical to the
 * dev-only fallback is fail-closed in production — a 6-char secret would
 * otherwise be brute-forceable and the fallback string is public knowledge.
 * Outside production we stay zero-config but warn loudly so a weak local
 * secret never hides.
 */
const MIN_SECRET_LENGTH = 32;

function assertSecretStrength(env, secret) {
	const weak = secret === DEV_ONLY_SECRET || secret.length < MIN_SECRET_LENGTH;
	if (!weak) return;
	if (env.NODE_ENV === 'production') {
		printFatalBanner(env, 'JWT_SECRET');
		throw new Error(
			'[auth] FATAL: JWT_SECRET is too weak for NODE_ENV=production ' +
			`(got ${secret.length} chars, need >= ${MIN_SECRET_LENGTH}). Refusing to start ` +
			'— generate a real value with `openssl rand -base64 48`.'
		);
	}
	console.warn(
		`[auth] WARNING: JWT_SECRET is weak (${secret.length} chars) — fine for local dev, ` +
		`never use it with NODE_ENV=production (needs >= ${MIN_SECRET_LENGTH} chars).`
	);
}

const JWT_SECRET = resolveJwtSecret();
const TOKEN_EXPIRY = '40d'; // 40 days

// Per-user session index: lets us revoke every session a user holds
// (e.g. on password change) without scanning all session keys.
const sessionIndexKey = (userId) => `sessions:${userId}`;

/**
 * Generate a JWT for a user and cache the session in Redis
 */
export const generateAuthToken = async (user) => {
    const payload = {
        userId: user.id,
        username: user.username,
        // Unique per issuance: two logins in the same second must not mint
        // the same token, or revoking "one" session would nuke both.
        jti: randomUUID(),
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
    
    const redis = await getRedisClient();
    // Store token as valid in redis, expires in 40 days
    await redis.set(`session:${token}`, user.id, { EX: 60 * 60 * 24 * 40 });
    // Track it in the user's session index for bulk revocation
    await redis.sadd(sessionIndexKey(user.id), token);

    return token;
};

/**
 * Verify a JWT and ensure it exists in the Redis session cache
 */
export const verifyAuthToken = async (token) => {
    if (!token) return null;

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        
        const redis = await getRedisClient();
        const sessionUserId = await redis.get(`session:${token}`);
        
        if (!sessionUserId || sessionUserId !== decoded.userId) {
            // Lazy cleanup: the session is gone but the index entry may
            // linger — drop it so the index doesn't fill with dead tokens.
            if (decoded?.userId) {
                await redis.srem(sessionIndexKey(decoded.userId), token);
            }
            return null; // Session revoked or expired
        }

        return decoded;
    } catch (err) {
        return null; // Invalid token
    }
};

/**
 * Revoke a JWT (Logout)
 */
export const revokeAuthToken = async (token) => {
    if (!token) return;
    const redis = await getRedisClient();
    await redis.del(`session:${token}`);
};

/**
 * Revoke a single session and drop it from the user's session index.
 * revokeAuthToken() above deliberately keeps its original signature for
 * call sites that only have the token.
 */
export const revokeSession = async (userId, token) => {
    if (!token) return;
    const redis = await getRedisClient();
    await redis.del(`session:${token}`);
    if (userId) await redis.srem(sessionIndexKey(userId), token);
};

/**
 * Revoke ALL sessions for a user — used on password change so a stolen
 * session dies with the old password. Returns the number of sessions
 * revoked. `exceptToken` keeps one session alive (the one the user is
 * actively changing their password from, so they aren't logged out of
 * the device they're holding).
 */
export const revokeAllUserSessions = async (userId, { exceptToken } = {}) => {
    if (!userId) return 0;
    const redis = await getRedisClient();
    const tokens = (await redis.smembers(sessionIndexKey(userId))) || [];
    let revoked = 0;
    for (const t of tokens) {
        if (t && t !== exceptToken) {
            await redis.del(`session:${t}`);
            await redis.srem(sessionIndexKey(userId), t);
            revoked += 1;
        }
    }
    return revoked;
};

/**
 * Count live sessions for a user (index membership, not TTL-checked).
 */
export const countUserSessions = async (userId) => {
    if (!userId) return 0;
    const redis = await getRedisClient();
    const tokens = (await redis.smembers(sessionIndexKey(userId))) || [];
    return tokens.length;
};
