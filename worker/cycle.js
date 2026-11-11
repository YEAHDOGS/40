// The 40-day cycle: when it ends, every post and comment is deleted. Accounts, follows and
// private habit records stay. Created by DOGS.

export const CYCLE_DAYS = 40;
const CYCLE_MS = CYCLE_DAYS * 86_400_000;

export const getCycle = (env) =>
	env.DB.prepare('select "startedAt", "endsAt" from "cycle" where "id" = 1').first();

// Run by the cron trigger. Safe to call at any time: it only wipes once the cycle has ended.
export async function wipeIfDue(env, now = Date.now()) {
	const cycle = await getCycle(env);
	if (!cycle || now < cycle.endsAt) return false;

	// If the cron was down for a while, skip straight to the cycle that contains "now".
	const missed = Math.floor((now - cycle.endsAt) / CYCLE_MS);
	const startedAt = cycle.endsAt + missed * CYCLE_MS;
	await env.DB.batch([
		env.DB.prepare('delete from "comment"'),
		env.DB.prepare('delete from "post"'),
		env.DB.prepare('update "cycle" set "startedAt" = ?, "endsAt" = ? where "id" = 1').bind(
			startedAt,
			startedAt + CYCLE_MS
		)
	]);
	return true;
}
