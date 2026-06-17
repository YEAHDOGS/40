import jwt from 'jsonwebtoken';
import { getRedisClient } from './redis.js';

const JWT_SECRET = process.env.JWT_SECRET || 'forty-forty-ultra-secret-key-4040';
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
