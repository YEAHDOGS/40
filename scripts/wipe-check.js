#!/usr/bin/env node
/**
 * 40Forty wipe scheduler backstop.
 *
 * The `nextWipe` GraphQL query already lazy-wipes whenever anyone asks for
 * the countdown, so a quiet server can't miss its wipe. This script is the
 * belt-and-suspenders cron entry for production:
 *
 *   node scripts/wipe-check.js            # report only, exit 2 if a wipe is due
 *   node scripts/wipe-check.js --execute  # run the wipe if one is due
 *
 * Suggested crontab (runs a few minutes past every hour):
 *   7 * * * * cd /srv/40forty && /usr/bin/node scripts/wipe-check.js --execute >> /var/log/40forty-wipe.log 2>&1
 *
 * Requires DATABASE_URL in the environment (see .env.example).
 */
import 'dotenv/config';
import pkg from '@prisma/client';
import { getNextWipe, isWipeDue, computeNextWipe } from '../src/server/wipe.js';

const { PrismaClient } = pkg;

const execute = process.argv.includes('--execute');

const prisma = new PrismaClient();
try {
	const { nextWipe, cycle, wiped } = await getNextWipe(prisma, new Date());

	if (wiped) {
		console.log(`[wipe-check] WIPE EXECUTED for cycle #${cycle.cycleNumber}. Next wipe: ${nextWipe.toISOString()}`);
	} else if (execute && isWipeDue(cycle.startedAt)) {
		// Defensive: getNextWipe already lazy-wipes, so reaching here means
		// the cycle advanced between the check and now — nothing to do.
		console.log('[wipe-check] wipe was already handled by the lazy check.');
	} else {
		const msLeft = nextWipe.getTime() - Date.now();
		const daysLeft = (msLeft / (1000 * 60 * 60 * 24)).toFixed(1);
		console.log(`[wipe-check] cycle #${cycle.cycleNumber} healthy — next wipe ${nextWipe.toISOString()} (~${daysLeft}d)`);
		if (!execute && isWipeDue(cycle.startedAt)) {
			console.log('[wipe-check] wipe is DUE. Re-run with --execute (or let the next nextWipe query handle it).');
			process.exitCode = 2;
		}
	}

	// Sanity: the countdown math must agree with itself.
	const recomputed = computeNextWipe(cycle.startedAt);
	if (Math.abs(recomputed.getTime() - nextWipe.getTime()) > 1000) {
		console.error('[wipe-check] WARNING: countdown math disagrees with stored cycle — investigate.');
		process.exitCode = 3;
	}
} catch (err) {
	console.error('[wipe-check] FAILED:', err.message);
	process.exitCode = 1;
} finally {
	await prisma.$disconnect();
}
