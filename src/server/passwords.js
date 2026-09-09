/**
 * 40Forty — password hashing.
 *
 * Login previously accepted a username with no password check at all —
 * anyone who knew a username could sign in as that user. Passwords are now
 * hashed with scrypt (memory-hard, from Node's stdlib — zero new
 * dependencies) and verified with a constant-time comparison.
 *
 * Stored format:  scrypt$v1$<N>$<r>$<p>$<saltB64>$<keyB64>
 */

import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

// OWASP-flavored scrypt parameters: 128MB memory, ~interactive cost.
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;
const SALT_LEN = 16;

export const MIN_PASSWORD_LENGTH = 8;

function scryptAsync(password, salt) {
	return new Promise((resolve, reject) => {
		scrypt(
			password,
			salt,
			KEY_LEN,
			{ N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: 256 * 1024 * 1024 },
			(err, derived) => (err ? reject(err) : resolve(derived))
		);
	});
}

/** Hash a plaintext password. Throws on anything shorter than the minimum. */
export async function hashPassword(password) {
	if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
		throw new Error(
			`[passwords] password must be at least ${MIN_PASSWORD_LENGTH} characters`
		);
	}
	const salt = randomBytes(SALT_LEN);
	const key = await scryptAsync(password, salt);
	return [
		'scrypt',
		'v1',
		SCRYPT_N,
		SCRYPT_R,
		SCRYPT_P,
		salt.toString('base64'),
		key.toString('base64')
	].join('$');
}

/**
 * Verify a plaintext password against a stored hash. Returns false (never
 * throws) for missing/malformed hashes or wrong passwords — login code must
 * fail closed with a uniform "Invalid credentials" error either way.
 */
export async function verifyPassword(password, storedHash) {
	if (typeof password !== 'string' || typeof storedHash !== 'string') return false;
	const parts = storedHash.split('$');
	if (parts.length !== 7 || parts[0] !== 'scrypt' || parts[1] !== 'v1') return false;
	const [, , n, r, p, saltB64, keyB64] = parts;
	const N = Number(n);
	const rr = Number(r);
	const pp = Number(p);
	if (
		!Number.isInteger(N) ||
		!Number.isInteger(rr) ||
		!Number.isInteger(pp) ||
		N !== SCRYPT_N ||
		rr !== SCRYPT_R ||
		pp !== SCRYPT_P
	) {
		return false;
	}
	let salt;
	let expected;
	try {
		salt = Buffer.from(saltB64, 'base64');
		expected = Buffer.from(keyB64, 'base64');
	} catch {
		return false;
	}
	if (salt.length !== SALT_LEN || expected.length !== KEY_LEN) return false;
	const actual = await scryptAsync(password, salt);
	return timingSafeEqual(actual, expected);
}
