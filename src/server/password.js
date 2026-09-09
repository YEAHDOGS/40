/**
 * 40Forty — password hashing.
 *
 * scrypt via node:crypto (stdlib, zero new dependencies). Stored format:
 *
 *   scrypt$N16384r8p1$<salt-hex>$<key-hex>
 *
 * Wired into the REST auth endpoints: POST /auth/signup and POST /auth/login
 * in src/server/rest.js now hash/verify passwords with this module (see the
 * `passwordHash` column on the User model). Anyone logging in as an arbitrary
 * username with no password was possible before that fix.
 * This module is intentionally standalone so it can be
 * regression-tested without a database or any npm packages.
 */

import { randomBytes, scrypt as _scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(_scrypt);

const KEY_LEN = 64;
const SALT_LEN = 16;
const PARAM_TAG = 'N16384r8p1';
// Interactive-login params; maxmem guard so exotic inputs can't OOM the box.
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/**
 * Hash a password for storage. Throws on empty/non-string input — callers
 * must reject blank passwords at the API boundary, not silently hash them.
 */
export async function hashPassword(password) {
	if (typeof password !== 'string' || password.length === 0) {
		throw new Error('password must be a non-empty string');
	}
	const salt = randomBytes(SALT_LEN);
	const key = await scrypt(password, salt, KEY_LEN, SCRYPT_OPTS);
	return `scrypt$${PARAM_TAG}$${salt.toString('hex')}$${key.toString('hex')}`;
}

/**
 * Verify a password against a stored hash. Returns false (never throws) for
 * any malformed stored value — a corrupt row must fail closed, not 500.
 */
export async function verifyPassword(password, stored) {
	if (typeof password !== 'string' || typeof stored !== 'string') return false;
	const parts = stored.split('$');
	if (parts.length !== 4 || parts[0] !== 'scrypt' || parts[1] !== PARAM_TAG) return false;
	let salt, expected;
	try {
		salt = Buffer.from(parts[2], 'hex');
		expected = Buffer.from(parts[3], 'hex');
	} catch {
		return false;
	}
	if (salt.length !== SALT_LEN || expected.length !== KEY_LEN) return false;
	const actual = await scrypt(password, salt, KEY_LEN, SCRYPT_OPTS);
	return actual.length === expected.length && timingSafeEqual(actual, expected);
}
