/**
 * 40Forty — the Wipe.
 *
 * Everything on 40Forty deletes itself every WIPE_INTERVAL_DAYS days.
 * This module is the single source of truth for that lifecycle:
 *
 *  - Pure cycle math (no I/O) so the countdown, the scheduler, and tests
 *    can never disagree about when the next wipe lands.
 *  - purgeEphemeralContent(prisma): the actual deletion cascade, in
 *    foreign-key-safe order. Anything this touches is gone forever.
 *  - getNextWipe(prisma): lazy wipe. Called by the `nextWipe` GraphQL
 *    query — if a cycle is overdue when anyone asks, the wipe runs first
 *    and the new cycle's date is returned. No cron daemon required for
 *    the dev server; production should still run scripts/wipe-check.js
 *    on a schedule as a backstop.
 *
 * WHAT GETS DELETED            WHAT SURVIVES
 * ------------------           ------------------
 * posts (incl. replies/reposts) users
 * likes                         follows (social graph)
 * media rows                    game scores (stat data)
 * hashtags + post links         wipe cycle history
 * notifications
 *
 * Media BLOBs (R2 / object storage) must be deleted alongside their rows —
 * see docs/wipe-architecture.md. Row deletion here is the trigger point;
 * blob cleanup hooks in at the marked TODO.
 */

export const WIPE_INTERVAL_DAYS = 40;
export const WIPE_INTERVAL_MS = WIPE_INTERVAL_DAYS * 24 * 60 * 60 * 1000;

/**
 * Deterministic countdown: given the cycle's start, when is the wipe?
 * Pure — safe to unit test, safe to run on the client.
 */
export function computeNextWipe(cycleStartedAt, now = new Date()) {
	const start = cycleStartedAt instanceof Date ? cycleStartedAt : new Date(cycleStartedAt);
	const elapsed = new Date(now).getTime() - start.getTime();
	if (elapsed < 0) return new Date(start.getTime() + WIPE_INTERVAL_MS);
	// Anchor the next wipe to the cycle grid so manual/overdue wipes
	// don't drift the 40-day cadence over time.
	const cyclesElapsed = Math.floor(elapsed / WIPE_INTERVAL_MS);
	return new Date(start.getTime() + (cyclesElapsed + 1) * WIPE_INTERVAL_MS);
}

/** Is a wipe due as of `now`? Pure. */
export function isWipeDue(cycleStartedAt, now = new Date()) {
	const start = cycleStartedAt instanceof Date ? cycleStartedAt : new Date(cycleStartedAt);
	return new Date(now).getTime() - start.getTime() >= WIPE_INTERVAL_MS;
}

/** Split a millisecond duration into d/h/m/s parts for the countdown UI. Pure. */
export function timeParts(ms) {
	const clamped = Math.max(0, ms);
	return {
		days: Math.floor(clamped / (1000 * 60 * 60 * 24)),
		hours: Math.floor((clamped / (1000 * 60 * 60)) % 24),
		minutes: Math.floor((clamped / 1000 / 60) % 60),
		seconds: Math.floor((clamped / 1000) % 60)
	};
}

/**
 * Genesis anchor for the very first cycle. Overridable with
 * FORTY_WIPE_ANCHOR (ISO date) so ops can pin the cadence.
 */
export function genesisAnchor() {
	const fromEnv = process.env.FORTY_WIPE_ANCHOR;
	if (fromEnv) {
		const parsed = new Date(fromEnv);
		if (!isNaN(parsed.getTime())) return parsed;
		console.warn(`[wipe] Ignoring invalid FORTY_WIPE_ANCHOR=${fromEnv}`);
	}
	return new Date();
}

/**
 * Delete every ephemeral row, in dependency-safe order.
 * Returns counts for the wipe-cycle audit record.
 *
 * NOTE: users, follows, game scores, and the wipe history itself survive.
 */
export async function purgeEphemeralContent(prisma) {
	const counts = {};
	counts.likes = (await prisma.like.deleteMany()).count;
	counts.postHashtags = (await prisma.postHashtag.deleteMany()).count;
	counts.hashtags = (await prisma.hashtag.deleteMany()).count;

	const mediaRows = await prisma.media.findMany({ select: { url: true } });
	counts.media = (await prisma.media.deleteMany()).count;
	// TODO: delete the underlying blobs for mediaRows[].url from object
	// storage (R2/S3). Rows are gone; blobs must not outlive them —
	// see docs/wipe-architecture.md.

	counts.notifications = (await prisma.notification.deleteMany()).count;
	// Replies/reposts are posts; one deleteMany clears them all (no FK
	// violation since every row in the table is removed together).
	counts.posts = (await prisma.post.deleteMany()).count;

	console.log(`[wipe] purged ${counts.posts} posts, ${counts.media} media, ${counts.likes} likes`);
	return counts;
}

/** Latest cycle, or null if the platform has never wiped. */
async function latestCycle(prisma) {
	return prisma.wipeCycle.findFirst({ orderBy: { cycleNumber: 'desc' } });
}

/**
 * Open a new cycle starting at `startedAt`, closing `previous` if given.
 */
export async function openCycle(prisma, startedAt, previous = null, purgeCounts = {}) {
	const cycleNumber = previous ? previous.cycleNumber + 1 : 1;
	if (previous && !previous.wipedAt) {
		await prisma.wipeCycle.update({
			where: { id: previous.id },
			data: { wipedAt: new Date(), ...purgeCounts }
		});
	}
	return prisma.wipeCycle.create({
		data: { cycleNumber, startedAt }
	});
}

/**
 * The lazy wipe behind the `nextWipe` query: ensures a cycle exists,
 * runs the purge if the current one is overdue, and returns the next
 * wipe date. The countdown can never lie and a wipe can never be
 * skipped just because no scheduler was running.
 */
export async function getNextWipe(prisma, now = new Date()) {
	let cycle = await latestCycle(prisma);
	if (!cycle) {
		cycle = await openCycle(prisma, genesisAnchor());
		return { nextWipe: computeNextWipe(cycle.startedAt, now), cycle, wiped: false };
	}
	if (isWipeDue(cycle.startedAt, now)) {
		const counts = await purgeEphemeralContent(prisma);
		// Keep the cadence grid: the new cycle starts exactly one interval
		// after the old one, even if the wipe ran late.
		const nextStart = new Date(new Date(cycle.startedAt).getTime() + WIPE_INTERVAL_MS);
		cycle = await openCycle(prisma, nextStart, cycle, {
			purgedPosts: counts.posts ?? 0,
			purgedMedia: counts.media ?? 0
		});
		return { nextWipe: computeNextWipe(cycle.startedAt, now), cycle, wiped: true };
	}
	return { nextWipe: computeNextWipe(cycle.startedAt, now), cycle, wiped: false };
}

/**
 * Manual trigger (the `triggerWipe` mutation — auth required, admin only
 * in production). Purges immediately and restarts the 40-day clock now.
 */
export async function triggerWipeNow(prisma) {
	const cycle = await latestCycle(prisma);
	const counts = await purgeEphemeralContent(prisma);
	const next = await openCycle(prisma, new Date(), cycle, {
		purgedPosts: counts.posts ?? 0,
		purgedMedia: counts.media ?? 0
	});
	return { cycle: next, purged: counts };
}
