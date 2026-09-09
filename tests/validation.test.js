import test from 'node:test';
import assert from 'node:assert';
import {
	ValidationError,
	LIMITS,
	MEDIA_TYPES,
	assertSafeKeys,
	assertString,
	assertEmail,
	assertEnum,
	assertInt,
	assertArray,
	validateSignUp,
	validatePostInput,
	validateProfileInput
} from '../src/server/validation.js';

const rejectsValidation = (fn, pattern) =>
	assert.rejects(Promise.resolve().then(fn), pattern ?? ValidationError);

test('validation: assertString', async (t) => {
	await t.test('rejects non-strings (nested objects, numbers, booleans)', async () => {
		for (const nasty of [{ nested: 1 }, 42, true, ['x']]) {
			await rejectsValidation(() => assertString(nasty, { field: 'f', max: 10 }), /must be a string/);
		}
	});

	await t.test('enforces min/max length', async () => {
		await rejectsValidation(() => assertString('ab', { field: 'f', min: 3 }), /at least 3/);
		await rejectsValidation(() => assertString('abcdef', { field: 'f', max: 5 }), /at most 5/);
		assert.strictEqual(assertString('  ok  ', { field: 'f', min: 1, max: 10 }), 'ok');
	});

	await t.test('rejects huge strings (100k chars)', async () => {
		await rejectsValidation(
			() => assertString('x'.repeat(100_000), { field: 'f', max: LIMITS.postContent.max }),
			/at most 2000/
		);
	});

	await t.test('rejects missing values when required', async () => {
		await rejectsValidation(() => assertString(undefined, { field: 'f' }), /is required/);
		await rejectsValidation(() => assertString(null, { field: 'f' }), /is required/);
		assert.strictEqual(assertString(undefined, { field: 'f', required: false }), undefined);
	});
});

test('validation: assertEmail', async (t) => {
	await t.test('accepts a normal email', async () => {
		assert.strictEqual(assertEmail('a@b.co'), 'a@b.co');
	});

	await t.test('rejects malformed emails', async () => {
		for (const bad of ['nope', 'a@', '@b.co', 'a b@c.co']) {
			await rejectsValidation(() => assertEmail(bad), /valid email/);
		}
	});

	await t.test('rejects overlong emails', async () => {
		await rejectsValidation(() => assertEmail('a'.repeat(300) + '@x.co'), /at most 254/);
	});
});

test('validation: assertEnum / assertInt / assertArray', async (t) => {
	await t.test('enum allowlist: IMAGE/VIDEO/GIF pass, anything else dies', async () => {
		assert.strictEqual(assertEnum('IMAGE', { field: 'type', allowed: MEDIA_TYPES }), 'IMAGE');
		await rejectsValidation(() => assertEnum('SCRIPT', { field: 'type', allowed: MEDIA_TYPES }), /must be one of/);
		await rejectsValidation(() => assertEnum('image', { field: 'type', allowed: MEDIA_TYPES }), /must be one of/);
	});

	await t.test('int bounds', async () => {
		await rejectsValidation(() => assertInt(1.5, { field: 'limit', min: 1, max: 100 }), /integer/);
		await rejectsValidation(() => assertInt(0, { field: 'limit', min: 1, max: 100 }), />= 1/);
		await rejectsValidation(() => assertInt(101, { field: 'limit', min: 1, max: 100 }), /<= 100/);
		assert.strictEqual(assertInt(50, { field: 'limit', min: 1, max: 100 }), 50);
	});

	await t.test('array: non-arrays and oversized arrays rejected', async () => {
		await rejectsValidation(() => assertArray('nope', { field: 'media', maxItems: 4 }), /must be an array/);
		await rejectsValidation(
			() => assertArray(new Array(5).fill({}), { field: 'media', maxItems: 4 }),
			/at most 4/
		);
	});
});

test('validation: assertSafeKeys blocks prototype pollution', async (t) => {
	await t.test('flat __proto__ key rejected', async () => {
		const payload = JSON.parse('{"username":"x","__proto__":{"polluted":true}}');
		await rejectsValidation(() => assertSafeKeys(payload), /Forbidden key "__proto__"/);
	});

	await t.test('nested __proto__ key rejected', async () => {
		const payload = JSON.parse('{"input":{"media":[{"url":"u","__proto__":{"polluted":true}}]}}');
		await rejectsValidation(() => assertSafeKeys(payload), /Forbidden key "__proto__"/);
	});

	await t.test('constructor/prototype keys rejected', async () => {
		const a = JSON.parse('{"constructor":{"x":1}}');
		const b = JSON.parse('{"prototype":{"x":1}}');
		await rejectsValidation(() => assertSafeKeys(a), /Forbidden key "constructor"/);
		await rejectsValidation(() => assertSafeKeys(b), /Forbidden key "prototype"/);
	});

	await t.test('clean payloads pass untouched', async () => {
		assert.doesNotThrow(() =>
			assertSafeKeys({ username: 'x', media: [{ url: 'u', type: 'IMAGE' }] })
		);
	});
});

test('validation: validateSignUp', async (t) => {
	await t.test('accepts a valid payload', async () => {
		const clean = validateSignUp({
			username: 'captain',
			email: 'cap@example.com',
			password: 'hunter2-hunter2',
			displayName: 'Captain'
		});
		assert.strictEqual(clean.username, 'captain');
	});

	await t.test('rejects short username, bad email, short password', async () => {
		await rejectsValidation(
			() => validateSignUp({ username: 'ab', email: 'a@b.co', password: 'hunter2-hunter2', displayName: 'X' }),
			/at least 3/
		);
		await rejectsValidation(
			() => validateSignUp({ username: 'abc', email: 'nope', password: 'hunter2-hunter2', displayName: 'X' }),
			/valid email/
		);
		await rejectsValidation(
			() => validateSignUp({ username: 'abc', email: 'a@b.co', password: 'short', displayName: 'X' }),
			/at least 8/
		);
	});

	await t.test('rejects a __proto__ smuggled into the signup payload', async () => {
		const payload = JSON.parse(
			'{"username":"abc","email":"a@b.co","password":"hunter2-hunter2","displayName":"X","__proto__":{"admin":true}}'
		);
		await rejectsValidation(() => validateSignUp(payload), /Forbidden key "__proto__"/);
	});
});

test('validation: validatePostInput', async (t) => {
	await t.test('accepts a valid payload', async () => {
		const clean = validatePostInput({
			content: 'hello',
			media: [{ url: 'https://x.co/i.png', type: 'IMAGE', alt: 'pic' }],
			hashtags: ['forty']
		});
		assert.strictEqual(clean.content, 'hello');
		assert.strictEqual(clean.media[0].type, 'IMAGE');
	});

	await t.test('rejects blank content and content bombs', async () => {
		await rejectsValidation(() => validatePostInput({ content: '   ' }), /at least 1/);
		await rejectsValidation(
			() => validatePostInput({ content: 'x'.repeat(100_000) }),
			/at most 2000/
		);
	});

	await t.test('rejects bad media: wrong type, too many items, huge URL', async () => {
		await rejectsValidation(
			() => validatePostInput({ content: 'x', media: [{ url: 'u', type: 'EXE' }] }),
			/must be one of/
		);
		await rejectsValidation(
			() => validatePostInput({ content: 'x', media: new Array(10).fill({ url: 'u', type: 'IMAGE' }) }),
			/at most 4/
		);
		await rejectsValidation(
			() => validatePostInput({ content: 'x', media: [{ url: 'u'.repeat(3000), type: 'IMAGE' }] }),
			/at most 2048/
		);
	});

	await t.test('rejects hashtag floods and nested pollution', async () => {
		await rejectsValidation(
			() => validatePostInput({ content: 'x', hashtags: new Array(50).fill('tag') }),
			/at most 10/
		);
		const payload = JSON.parse('{"content":"x","media":[{"url":"u","type":"IMAGE","__proto__":{"p":1}}]}');
		await rejectsValidation(() => validatePostInput(payload), /Forbidden key "__proto__"/);
	});
});

test('validation: validateProfileInput allowlists fields', async (t) => {
	await t.test('keeps only profile fields and caps their length', async () => {
		const clean = validateProfileInput({
			displayName: 'Cap',
			bio: 'short bio',
			verified: true, // must be dropped — not a caller-settable field
			passwordHash: 'nope' // must be dropped
		});
		assert.deepStrictEqual(Object.keys(clean).sort(), ['bio', 'displayName']);
	});

	await t.test('rejects overlong profile fields', async () => {
		await rejectsValidation(
			() => validateProfileInput({ bio: 'x'.repeat(10_000) }),
			/at most 500/
		);
	});
});
