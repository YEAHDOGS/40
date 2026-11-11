// The 40-day cycle and the global wipe. Created by DOGS.
//
// WIPED when a cycle ends, for everyone, no matter what: everything public (WIPED_TABLES).
// KEPT: accounts, profiles and bios, follows, private messages.
// EACH PERSON CHOOSES (profile.wipeHabits) what happens to their own habits and tracked days:
//   'keep'    nothing is deleted (the default)
//   'records' the tracked days are deleted, the list of habits stays
//   'all'     the habits and their tracked days are deleted

export const CYCLE_DAYS = 40;
const CYCLE_MS = CYCLE_DAYS * 86_400_000;

// Every table of public content. A new public feature (likes, reposts) adds its table here,
// children before parents.
const WIPED_TABLES = ['comment', 'post'];

export const WIPE_HABITS = ['keep', 'records', 'all'];

// The cycle that contains `now`, worked out from the stored one. Reads use this, so content from an
// ended cycle stops being served the moment the cycle ends, even if the cron is late or fails.
export function currentCycle(stored, now = Date.now()) {
  if (now < stored.endsAt) return { startedAt: stored.startedAt, endsAt: stored.endsAt };
  const startedAt = stored.endsAt + Math.floor((now - stored.endsAt) / CYCLE_MS) * CYCLE_MS;
  return { startedAt, endsAt: startedAt + CYCLE_MS };
}

const storedCycle = (env) =>
  env.DB.prepare('select "startedAt", "endsAt" from "cycle" where "id" = 1').first();

export const getCycle = async (env, now = Date.now()) => currentCycle(await storedCycle(env), now);

// Run hourly by the cron trigger. Does nothing until the stored cycle has ended; then deletes in one
// transaction and moves the stored cycle forward. If it fails it simply runs again the next hour.
export async function wipeIfDue(env, now = Date.now()) {
  const stored = await storedCycle(env);
  if (!stored || now < stored.endsAt) return false;

  const next = currentCycle(stored, now);
  const choseTo = (...choices) =>
    `"userId" in (select "userId" from "profile" where "wipeHabits" in (${choices.map((c) => `'${c}'`).join(', ')}))`;
  await env.DB.batch([
    ...WIPED_TABLES.map((table) => env.DB.prepare(`delete from "${table}"`)),
    env.DB.prepare(`delete from "habit_log" where ${choseTo('records', 'all')}`),
    env.DB.prepare(`delete from "habit" where ${choseTo('all')}`),
    env.DB.prepare('update "cycle" set "startedAt" = ?, "endsAt" = ? where "id" = 1').bind(
      next.startedAt,
      next.endsAt
    )
  ]);
  return true;
}
