/**
 * startup-banner.js — loud, human-readable config banner for the 40Forty server.
 *
 * The server's config story is "fail fast and be loud about it": with
 * NODE_ENV=production the process REFUSES to boot without JWT_SECRET set.
 * This banner is what you see in the logs — the FATAL version is printed
 * immediately before the crash so a boot-loop always names the exact
 * missing variable, and the OK version is printed on every successful
 * boot as a checklist of what resolved.
 *
 * Call printStartupBanner() once at server boot; call printFatalBanner()
 * before raising a fatal config error.
 */

const REQUIRED_IN_PRODUCTION = [
	['JWT_SECRET', 'signs auth tokens — server refuses to boot without it in production'],
	['DATABASE_URL', 'Prisma database connection string'],
];

const OPTIONAL = [
	['REDIS_URL', 'session cache — defaults to redis://localhost:6379, in-memory fallback in dev'],
	['FORTY_WIPE_ANCHOR', 'pins the 40-day wipe cadence to a fixed ISO date (default: first server start)'],
];

function status(env, name) {
	const v = env[name];
	return v ? `set (${String(v).length} chars)` : 'MISSING';
}

/**
 * Print the boot checklist banner to stdout.
 * Missing production-required vars are flagged loudly; the fatal throw
 * itself still happens in the caller (auth.js) after printFatalBanner().
 */
export function printStartupBanner(env = process.env) {
	const lines = [
		'',
		'╔══════════════════════════════════════════════════════════════════╗',
		'║  40Forty server boot — environment checklist                    ║',
		'╚══════════════════════════════════════════════════════════════════╝',
		`  NODE_ENV = ${env.NODE_ENV || '(not set — treated as development)'}`,
		'',
		'  Required in production:',
	];
	for (const [name, why] of REQUIRED_IN_PRODUCTION) {
		const st = status(env, name);
		const flag = st === 'MISSING' ? '  <<< REQUIRED IN PRODUCTION' : '';
		lines.push(`    ${name.padEnd(24)} ${st}${flag}`);
		lines.push(`      → ${why}`);
	}
	lines.push('', '  Optional:');
	for (const [name, why] of OPTIONAL) {
		lines.push(`    ${name.padEnd(24)} ${status(env, name)}`);
		lines.push(`      → ${why}`);
	}
	lines.push('');
	console.log(lines.join('\n'));
	return lines.join('\n');
}

/**
 * Print the FATAL banner to stderr right before the process crashes on a
 * missing production-required variable. The exact env var name is in the
 * banner so a crash-loop in staging/prod logs always points at the fix.
 */
export function printFatalBanner(env = process.env, missingVar = 'JWT_SECRET') {
	const lines = [
		'',
		'╔══════════════════════════════════════════════════════════════════╗',
		'║  FATAL: 40Forty refuses to boot                                  ║',
		'╚══════════════════════════════════════════════════════════════════╝',
		`  Missing required env var: ${missingVar}`,
		`  NODE_ENV = ${env.NODE_ENV}`,
		'',
		'  Fix: set the variable and restart. Example:',
		'',
		`    export ${missingVar}="$(openssl rand -base64 48)"`,
		'',
		'  This is intentional fail-closed behavior — the server will not',
		'  sign auth tokens with a fallback secret. See docs/env.md.',
		'',
	];
	console.error(lines.join('\n'));
	return lines.join('\n');
}
