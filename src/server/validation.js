// src/server/validation.js — shared input validation for the GraphQL and
// REST surfaces. Stdlib only, zero new dependencies.
//
// Invariants enforced here (see README "Security posture"):
//  1. Every public mutation validates string length (min/max), type, and
//     shape BEFORE the value touches the database.
//  2. Enum fields use strict allowlists (e.g. media type) — anything else
//     is rejected, not coerced.
//  3. Prototype-pollution keys (__proto__/constructor/prototype) are
//     rejected at the boundary, even in nested input objects, so a crafted
//     JSON payload can never poison shared objects.
// Throw ValidationError on violation; both surfaces map it to 400 / a
// GraphQL validation error.

export class ValidationError extends Error {
	constructor(message) {
		super(message);
		this.name = 'ValidationError';
		this.extensions = { code: 'VALIDATION_ERROR' };
	}
}

// Product-coherent caps. A social post is 2000 chars, not a novel; a
// username is a handle, not a blob.
export const LIMITS = {
	username: { min: 3, max: 30 },
	email: { max: 254 },
	password: { min: 8, max: 128 },
	displayName: { max: 60 },
	postContent: { min: 1, max: 2000 },
	bio: { max: 500 },
	profileField: { max: 500 }, // movies/books/music
	imageUrl: { max: 2048 },
	mediaAlt: { max: 200 },
	mediaItems: { max: 4 },
	hashtags: { max: 10 },
	hashtag: { max: 60 },
	pageLimit: { min: 1, max: 100 }
};

export const MEDIA_TYPES = new Set(['IMAGE', 'VIDEO', 'GIF']);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Recursively reject prototype-pollution keys in any plain object/array.
// JSON.parse turns {"__proto__": {...}} into an OWN data property, so this
// is a real boundary guard, not a theoretical one.
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function assertSafeKeys(value, path = '$') {
	if (Array.isArray(value)) {
		for (let i = 0; i < value.length; i++) {
			assertSafeKeys(value[i], `${path}[${i}]`);
		}
		return;
	}
	if (value && typeof value === 'object') {
		for (const key of Object.keys(value)) {
			if (DANGEROUS_KEYS.has(key)) {
				throw new ValidationError(`Forbidden key "${key}" at ${path}`);
			}
			assertSafeKeys(value[key], `${path}.${key}`);
		}
	}
}

export function assertString(value, { field, min = 0, max, required = true, trim = true } = {}) {
	if (value === undefined || value === null) {
		if (!required) return value;
		throw new ValidationError(`${field} is required`);
	}
	if (typeof value !== 'string') {
		throw new ValidationError(`${field} must be a string`);
	}
	const s = trim ? value.trim() : value;
	if (s.length < min) {
		throw new ValidationError(`${field} must be at least ${min} characters`);
	}
	if (max !== undefined && s.length > max) {
		throw new ValidationError(`${field} must be at most ${max} characters`);
	}
	return s;
}

export function assertEmail(value, field = 'email') {
	const email = assertString(value, { field, max: LIMITS.email.max });
	if (!EMAIL_PATTERN.test(email)) {
		throw new ValidationError(`${field} must be a valid email address`);
	}
	return email;
}

export function assertEnum(value, { field, allowed }) {
	if (typeof value !== 'string' || !allowed.has(value)) {
		throw new ValidationError(`${field} must be one of: ${[...allowed].join(', ')}`);
	}
	return value;
}

export function assertInt(value, { field, min, max }) {
	if (typeof value !== 'number' || !Number.isInteger(value)) {
		throw new ValidationError(`${field} must be an integer`);
	}
	if (min !== undefined && value < min) {
		throw new ValidationError(`${field} must be >= ${min}`);
	}
	if (max !== undefined && value > max) {
		throw new ValidationError(`${field} must be <= ${max}`);
	}
	return value;
}

export function assertArray(value, { field, maxItems, required = true }) {
	if (value === undefined || value === null) {
		if (!required) return value;
		throw new ValidationError(`${field} is required`);
	}
	if (!Array.isArray(value)) {
		throw new ValidationError(`${field} must be an array`);
	}
	if (maxItems !== undefined && value.length > maxItems) {
		throw new ValidationError(`${field} must contain at most ${maxItems} items`);
	}
	return value;
}

// Convenience: validate a whole signup payload (shared by both surfaces).
// Takes the RAW payload and runs assertSafeKeys on it BEFORE destructuring,
// so smuggled keys (e.g. __proto__) are caught rather than silently dropped.
export function validateSignUp(input) {
	assertSafeKeys(input);
	const { username, email, password, displayName } = input ?? {};
	return {
		username: assertString(username, { field: 'username', ...LIMITS.username }),
		email: assertEmail(email),
		password: assertString(password, { field: 'password', ...LIMITS.password, trim: false }),
		displayName: assertString(displayName, { field: 'displayName', min: 1, max: LIMITS.displayName.max })
	};
}

// Convenience: validate a post-creation payload (shared by both surfaces).
export function validatePostInput(input) {
	assertSafeKeys(input);
	const { content, media, replyToId, hashtags } = input ?? {};
	const clean = {
		content: assertString(content, { field: 'content', ...LIMITS.postContent })
	};
	if (replyToId !== undefined && replyToId !== null) {
		clean.replyToId = assertString(replyToId, { field: 'replyToId', min: 1, max: 100 });
	}
	if (media !== undefined && media !== null) {
		const items = assertArray(media, { field: 'media', maxItems: LIMITS.mediaItems.max });
		clean.media = items.map((m, i) => {
			if (!m || typeof m !== 'object') {
				throw new ValidationError(`media[${i}] must be an object`);
			}
			assertSafeKeys(m, `$.media[${i}]`);
			return {
				url: assertString(m.url, { field: `media[${i}].url`, min: 1, max: LIMITS.imageUrl.max }),
				type: assertEnum(m.type, { field: `media[${i}].type`, allowed: MEDIA_TYPES }),
				alt: m.alt === undefined || m.alt === null
					? null
					: assertString(m.alt, { field: `media[${i}].alt`, max: LIMITS.mediaAlt.max })
			};
		});
	}
	if (hashtags !== undefined && hashtags !== null) {
		const tags = assertArray(hashtags, { field: 'hashtags', maxItems: LIMITS.hashtags.max });
		clean.hashtags = tags.map((h, i) =>
			assertString(h, { field: `hashtags[${i}]`, min: 1, max: LIMITS.hashtag.max })
		);
	}
	return clean;
}

// Convenience: validate a profile-update payload (shared by both surfaces).
// Returns ONLY the allowlisted profile fields — callers must not spread
// caller-controlled objects straight into prisma data.
export function validateProfileInput(input) {
	assertSafeKeys(input);
	const clean = {};
	const maybe = (key, max) => {
		const v = input?.[key];
		if (v === undefined || v === null) return;
		clean[key] = assertString(v, { field: key, max });
	};
	maybe('displayName', LIMITS.displayName.max);
	maybe('bio', LIMITS.bio.max);
	maybe('profileImage', LIMITS.imageUrl.max);
	maybe('bannerImage', LIMITS.imageUrl.max);
	maybe('movies', LIMITS.profileField.max);
	maybe('books', LIMITS.profileField.max);
	maybe('music', LIMITS.profileField.max);
	return clean;
}
