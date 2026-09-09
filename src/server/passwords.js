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

/**
 * Blocklist of the most commonly used passwords (all lowercase). An
 * 8-character minimum alone still lets through "password123" — this rejects
 * the low-hanging fruit that credential-stuffing lists try first.
 * Matched case-insensitively via isCommonPassword().
 */
const COMMON_PASSWORDS = new Set([
	'password',
	'password1',
	'password12',
	'password123',
	'password1234',
	'passw0rd',
	'p@ssw0rd',
	'changeme1',
	'welcome12',
	'welcome123',
	'qwerty12',
	'qwerty123',
	'qwertyuiop',
	'12345678',
	'123456789',
	'1234567890',
	'123456a1',
	'11111111',
	'00000000',
	'12341234',
	'1q2w3e4r',
	'1qaz2wsx',
	'zxcvbnm1',
	'abc12345',
	'abcdefg1',
	'letmein12',
	'letmein123',
	'iloveyou12',
	'iloveyou123',
	'trustno1',
	'sunshine1',
	'master123',
	'hello123',
	'freedom12',
	'whatever1',
	'monkey123',
	'dragon123',
	'superman1',
	'batman123',
	'starwars1',
	'harley123',
	'jesus123',
	'football1',
	'baseball1',
	'admin123',
	'secret123',
	'shadow12',
	'tigger12',
	'princess1',
	'computer1',
	'corvette1',
	'mustang1',
	'ginger12',
	'michelle1',
	'charlie12',
	'thomas12',
	'daniel12',
	'jordan12',
	'andrew12',
	'taylor12',
	'michael1',
	'jennifer1',
	'hunter123'
]);

/**
 * True if the password is on the common-password blocklist
 * (case-insensitive). Non-strings are never "common" — they fail elsewhere.
 */
export function isCommonPassword(password) {
	if (typeof password !== 'string') return false;
	return COMMON_PASSWORDS.has(password.toLowerCase());
}

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

/** Hash a plaintext password. Throws on anything shorter than the minimum
 *  or on the common-password blocklist — the server must never produce a
 *  hash for a credential that a stuffing list would try first. */
export async function hashPassword(password) {
	if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
		throw new Error(
			`[passwords] password must be at least ${MIN_PASSWORD_LENGTH} characters`
		);
	}
	if (isCommonPassword(password)) {
		throw new Error('[passwords] password is too common — pick a harder one');
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
