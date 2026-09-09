import test from 'node:test';
import assert from 'node:assert';
import { presets, communityThemes } from '../src/lib/clockPresets.js';

// Regression coverage for the clock theme presets. The Clock component
// indexes themes by id and interpolates the color keys into CSS — a typo,
// duplicate id, or malformed color silently degrades the countdown UI.
// Pure data assertions, no deps.

const COLOR_RE = /^(#[0-9a-fA-F]{6}|rgba?\(\s*\d[\d\s.,%]*\))$/;
const REQUIRED_KEYS = ['id', 'name', 'colorBg', 'colorTile', 'colorDigit', 'colorLabel', 'css'];

test('clock theme presets stay structurally sound', async (t) => {
	await t.test('every preset has a unique id', () => {
		const ids = presets.map((p) => p.id);
		assert.strictEqual(new Set(ids).size, ids.length, `duplicate preset ids: ${ids}`);
	});

	await t.test('every preset exposes all required color/theme keys', () => {
		for (const p of presets) {
			for (const key of REQUIRED_KEYS) {
				assert.ok(key in p, `preset '${p.id}' missing key '${key}'`);
			}
		}
	});

	await t.test('every color value is a valid hex or rgb(a) literal', () => {
		for (const p of presets) {
			for (const key of ['colorBg', 'colorTile', 'colorDigit', 'colorLabel']) {
				assert.match(
					p[key],
					COLOR_RE,
					`preset '${p.id}' has malformed ${key}: ${p[key]}`
				);
			}
		}
	});

	await t.test('vintage split-flap stays the default first preset', () => {
		assert.strictEqual(presets[0].id, 'vintage');
		assert.strictEqual(presets[0].colorBg, '#1c1c1c');
	});

	await t.test('communityThemes are additive and well-formed', () => {
		assert.ok(Array.isArray(communityThemes));
		for (const theme of communityThemes) {
			for (const key of REQUIRED_KEYS) {
				assert.ok(key in theme, `community theme missing key '${key}'`);
			}
			assert.ok(!presets.some((p) => p.id === theme.id), `community theme id '${theme.id}' collides with a preset`);
		}
	});
});
