import { describe, expect, it } from 'vitest';
import { CYCLE_DAYS, currentCycle } from './cycle.js';
import { MIN_COHORT, addDays, habitKey, isDay, percentile, recordText, streak } from './records.js';

const TODAY = '2026-11-11';
// Builds one habit's rows, newest first: logs([0, 0, 1]) = today 0, yesterday 0, two days ago 1.
const logs = (values, from = TODAY) => values.map((done, i) => ({ day: addDays(from, -i), done }));

describe('isDay', () => {
  const now = Date.parse('2026-11-11T12:00:00Z');
  it('accepts real past days and today', () => {
    expect(isDay('2026-11-11', now)).toBe(true);
    expect(isDay('2024-02-29', now)).toBe(true);
  });
  it('rejects impossible, malformed and future days', () => {
    expect(isDay('2026-02-30', now)).toBe(false);
    expect(isDay('2026-13-01', now)).toBe(false);
    expect(isDay('11/11/2026', now)).toBe(false);
    expect(isDay('2026-11-20', now)).toBe(false);
    expect(isDay(null, now)).toBe(false);
  });
});

describe('streak', () => {
  it('counts clean days for a habit being quit', () => {
    expect(streak(logs([0, 0, 1, 0]), 'quit', TODAY)).toBe(2);
  });
  it('counts done days for a habit being built', () => {
    expect(streak(logs([1, 1, 1, 0]), 'build', TODAY)).toBe(3);
  });
  it('still counts when today is not tracked yet', () => {
    expect(streak(logs([1, 1], addDays(TODAY, -1)), 'build', TODAY)).toBe(2);
  });
  it('ends at an untracked day', () => {
    const gap = [
      { day: TODAY, done: 1 },
      { day: addDays(TODAY, -2), done: 1 }
    ];
    expect(streak(gap, 'build', TODAY)).toBe(1);
  });
  it('is zero after a slip today, and with no records', () => {
    expect(streak(logs([1, 0, 0]), 'quit', TODAY)).toBe(0);
    expect(streak([], 'quit', TODAY)).toBe(0);
  });
});

describe('percentile', () => {
  it('hides comparisons below the minimum number of people', () => {
    expect(percentile(0.5, Array(MIN_COHORT - 1).fill(0))).toBeNull();
  });
  it('reports the share of people with a lower rate', () => {
    expect(percentile(0.5, [0, 0, 0.25, 0.5, 1])).toEqual({ people: 5, moreThan: 60 });
  });
});

describe('recordText', () => {
  const quit = { name: 'Drinking', kind: 'quit' };
  const build = { name: 'Running', kind: 'build' };
  it('writes streaks', () => {
    expect(recordText(quit, 'streak', { streakDays: 12 })).toBe('12 days clean from Drinking.');
    expect(recordText(build, 'streak', { streakDays: 1 })).toBe('Running: 1 day in a row.');
  });
  it('writes weeks', () => {
    expect(recordText(quit, 'week', { weekDone: 2, weekTracked: 7 })).toBe(
      'Clean from Drinking 5 of the last 7 days.'
    );
  });
  it('has nothing to say without records', () => {
    expect(recordText(build, 'streak', { streakDays: 0 })).toBeNull();
    expect(recordText(build, 'week', { weekDone: 0, weekTracked: 0 })).toBeNull();
  });
});

describe('habitKey', () => {
  it('matches names that differ only by case and spacing', () => {
    expect(habitKey('  Cinnamon   Toast Crunch ')).toBe(habitKey('cinnamon toast crunch'));
  });
});

describe('currentCycle', () => {
  const DAY = 86_400_000;
  const stored = { startedAt: 0, endsAt: CYCLE_DAYS * DAY };
  it('is the stored cycle until it ends', () => {
    expect(currentCycle(stored, 10 * DAY)).toEqual(stored);
  });
  it('moves on the moment the stored cycle ends, even if the wipe has not run', () => {
    expect(currentCycle(stored, CYCLE_DAYS * DAY)).toEqual({
      startedAt: CYCLE_DAYS * DAY,
      endsAt: 2 * CYCLE_DAYS * DAY
    });
  });
  it('skips whole cycles that were missed', () => {
    expect(currentCycle(stored, 95 * DAY).startedAt).toBe(2 * CYCLE_DAYS * DAY);
  });
});
