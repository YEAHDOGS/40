import test from 'node:test';
import assert from 'node:assert';
import {
	WIPE_INTERVAL_DAYS,
	WIPE_INTERVAL_MS,
	computeNextWipe,
	isWipeDue,
	timeParts
} from '../src/server/wipe.js';

const DAY = 24 * 60 * 60 * 1000;

test('Wipe lifecycle math (pure, no DB)', async (t) => {
	await t.test('the interval is 40 days — the brand promise', () => {
		assert.strictEqual(WIPE_INTERVAL_DAYS, 40);
		assert.strictEqual(WIPE_INTERVAL_MS, 40 * DAY);
	});

	await t.test('computeNextWipe lands exactly one interval after cycle start', () => {
		const start = new Date('2026-01-01T00:00:00.000Z');
		const next = computeNextWipe(start, new Date('2026-01-10T00:00:00.000Z'));
		assert.strictEqual(next.toISOString(), '2026-02-10T00:00:00.000Z');
	});

	await t.test('computeNextWipe skips ahead on the 40-day grid, no drift', () => {
		const start = new Date('2026-01-01T00:00:00.000Z');
		// 95 days later: two full cycles elapsed, next wipe is cycle 3 start
		const next = computeNextWipe(start, new Date('2026-04-06T12:00:00.000Z'));
		assert.strictEqual(next.toISOString(), '2026-05-01T00:00:00.000Z');
	});

	await t.test('computeNextWipe with a future start just adds one interval', () => {
		const start = new Date('2026-12-01T00:00:00.000Z');
		const next = computeNextWipe(start, new Date('2026-06-01T00:00:00.000Z'));
		assert.strictEqual(next.toISOString(), '2027-01-10T00:00:00.000Z');
	});

	await t.test('isWipeDue flips exactly at the 40-day mark', () => {
		const start = new Date('2026-01-01T00:00:00.000Z');
		assert.strictEqual(isWipeDue(start, new Date('2026-02-09T23:59:59.999Z')), false);
		assert.strictEqual(isWipeDue(start, new Date('2026-02-10T00:00:00.000Z')), true);
		assert.strictEqual(isWipeDue(start, new Date('2026-05-01T00:00:00.000Z')), true);
	});

	await t.test('timeParts splits durations for the countdown UI', () => {
		assert.deepStrictEqual(timeParts(90061000), { days: 1, hours: 1, minutes: 1, seconds: 1 });
		assert.deepStrictEqual(timeParts(0), { days: 0, hours: 0, minutes: 0, seconds: 0 });
		assert.deepStrictEqual(timeParts(-5000), { days: 0, hours: 0, minutes: 0, seconds: 0 });
		const almostForty = timeParts(40 * DAY - 1);
		assert.strictEqual(almostForty.days, 39);
	});
});
