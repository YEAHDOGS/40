import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { formatCountdownAnnouncement, announcementKey } from '../src/lib/timerA11y.js';

test('Timer accessibility: announcement helpers', async (t) => {

	await t.test('formats a full countdown announcement', () => {
		assert.strictEqual(
			formatCountdownAnnouncement({ days: 12, hours: 3, minutes: 5, seconds: 42 }),
			'12 days, 3 hours, 5 minutes until global wipe'
		);
	});

	await t.test('uses singular forms for 1 unit', () => {
		assert.strictEqual(
			formatCountdownAnnouncement({ days: 1, hours: 1, minutes: 1, seconds: 0 }),
			'1 day, 1 hour, 1 minute until global wipe'
		);
	});

	await t.test('omits zero days and hours', () => {
		assert.strictEqual(
			formatCountdownAnnouncement({ days: 0, hours: 0, minutes: 7, seconds: 30 }),
			'7 minutes until global wipe'
		);
	});

	await t.test('keeps a lone minute unit when days and hours are zero', () => {
		assert.strictEqual(
			formatCountdownAnnouncement({ days: 0, hours: 2, minutes: 0, seconds: 10 }),
			'2 hours until global wipe'
		);
	});

	await t.test('announces wipe-due when the countdown hits zero', () => {
		assert.strictEqual(
			formatCountdownAnnouncement({ days: 0, hours: 0, minutes: 0, seconds: 0 }),
			'Global wipe is due now'
		);
	});

	await t.test('clamps negative and fractional values', () => {
		assert.strictEqual(
			formatCountdownAnnouncement({ days: -3, hours: 1.9, minutes: 30.7, seconds: 0 }),
			'1 hour, 30 minutes until global wipe'
		);
	});

	await t.test('announcement key ignores seconds so the live region is not spammed', () => {
		assert.strictEqual(
			announcementKey({ days: 5, hours: 2, minutes: 9, seconds: 1 }),
			announcementKey({ days: 5, hours: 2, minutes: 9, seconds: 59 })
		);
		assert.notStrictEqual(
			announcementKey({ days: 5, hours: 2, minutes: 9, seconds: 59 }),
			announcementKey({ days: 5, hours: 2, minutes: 8, seconds: 59 })
		);
	});
});

test('Timer accessibility: component markup', async (t) => {
	const here = path.dirname(fileURLToPath(import.meta.url));
	const source = readFileSync(path.join(here, '..', 'src', 'components', 'Timer.svelte'), 'utf8');

	await t.test('flip clock is exposed as role="timer"', () => {
		assert.ok(source.includes('role="timer"'), 'flip clock container needs role="timer"');
	});

	await t.test('per-second digits are hidden from screen readers (live region announces instead)', () => {
		// Each flip tile's opening tag carries aria-hidden="true". The tile's
		// tag can contain a `>` inside an expression (e.g. days > 99), so scan
		// the text following each flip-tile-col class instead of regexing tags.
		const segments = source.split('flip-tile-col"').slice(1, 5);
		assert.strictEqual(segments.length, 4, 'should render four flip tiles');
		const hidden = segments.filter((seg) => seg.slice(0, 80).includes('aria-hidden="true"'));
		assert.strictEqual(hidden.length, 4, 'all four flip tiles should be aria-hidden');
	});

	await t.test('a screen-reader live region announces the countdown', () => {
		assert.ok(source.includes('role="status"'), 'needs a role="status" live region');
		assert.ok(source.includes('announcementText'), 'live region should render the minute-resolution announcement');
	});

	await t.test('icon-only buttons carry accessible names', () => {
		assert.ok(source.includes('aria-label="Customize clock design"'), 'customizer toggle needs an aria-label');
		assert.ok(source.includes('aria-label="Close style editor"'), 'drawer close button needs an aria-label');
	});

	await t.test('drawer state is exposed and keyboard-dismissible', () => {
		assert.ok(source.includes('aria-expanded={showPanel}'), 'toggle needs aria-expanded');
		assert.ok(source.includes('aria-controls="timer-style-panel"'), 'toggle needs aria-controls');
		assert.ok(source.includes('role="dialog"'), 'drawer needs role="dialog"');
		assert.ok(source.includes('Escape') && source.includes('showPanel = false'), 'Escape should close the drawer');
	});

	await t.test('form controls are label-associated', () => {
		assert.ok(source.includes('for="timer-preset-select"') && source.includes('id="timer-preset-select"'), 'preset select needs a label association');
		assert.ok(source.includes('for="timer-custom-css"') && source.includes('id="timer-custom-css"'), 'custom CSS textarea needs a label association');
		assert.ok(source.includes('aria-label="Background color"'), 'color pickers need accessible names');
	});

	await t.test('respects prefers-reduced-motion', () => {
		assert.ok(source.includes('prefers-reduced-motion'), 'style must include a prefers-reduced-motion rule');
	});

	await t.test('keyboard focus is visible on timer controls', () => {
		assert.ok(source.includes(':focus-visible'), 'timer controls need focus-visible styling');
	});
});
