import jwt from 'jsonwebtoken';
import { getRedisClient } from './redis.js';

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
			throw new Error(
				'[auth] FATAL: JWT_SECRET is not set. Refusing to start with NODE_ENV=production ' +
				'— set JWT_SECRET to a real value (e.g. `openssl rand -base64 48`).'
			);
		}
		console.warn('[auth] JWT_SECRET not set - using dev-only fallback. Set JWT_SECRET in production!');
		return DEV_ONLY_SECRET;
	}
	return secret;
}

const JWT_SECRET = resolveJwtSecret();
const TOKEN_EXPIRY = '40d'; // 40 days

/**
 * Generate a JWT for a user and cache the session in Redis
 */
export const generateAuthToken = async (user) => {
    const payload = {
        userId: user.id,
        username: user.username,
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
    
    const redis = await getRedisClient();
    // Store token as valid in redis, expires in 40 days
    await redis.set(`session:${token}`, user.id, { EX: 60 * 60 * 24 * 40 });

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
