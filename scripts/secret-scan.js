#!/usr/bin/env node
/**
 * 40Forty — secrets scanner (CI gate).
 *
 * A small, dependency-free, gitleaks-style scan that fails the build when
 * something that looks like a real credential is committed. It is a
 * backstop, not a guarantee: it cannot prove a value is safe, only that no
 * known-shaped secret token is sitting in the tree.
 *
 * Usage:
 *   node scripts/secret-scan.js            # scan the current git tree
 *   node scripts/secret-scan.js <path...>  # scan specific files
 *
 * Exit code: 0 = clean, 1 = findings.
 *
 * How the noise is kept down:
 * - Dependencies (node_modules) and build output (dist/) are never scanned.
 * - Patterns that match *shapes* (e.g. "password": ".....") are skipped in
 *   tests, docs, and the manual API test script — those carry synthetic
 *   fixtures and documented request/response examples by design.
 * - Known-intentional dev placeholders (the dev-only JWT fallback, mock
 *   OAuth values, .env.example templates) carry the literal marker
 *   `secret-scan:allow` on the line, reviewed in the open.
 *
 * Test fixtures MUST be constructed by concatenation
 * (e.g. 'ghp_' + 'A'.repeat(36)) so this scanner stays clean on its own
 * test files.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ALLOW_MARKER = 'secret-scan:allow';

// Path fragments that are never scanned: dependencies, build output, VCS.
const EXCLUDED_PATH_FRAGMENTS = ['node_modules/', 'dist/', 'dist-ssr/', '.git/'];

// Test/docs-like locations that legitimately carry synthetic credentials.
const FIXTURE_PATH = /(^|\/)(tests?|__tests__|fixtures?|__fixtures__|mocks?|__mocks__|docs?)\//;
const MANUAL_API_TEST = /(^|\/)scripts\/test-rest-api\.js$/;

/**
 * Pattern list. Each entry: { name, regex, skipPaths? }.
 * NOTE: the regexes are written so the source of THIS file does not match
 * them — the scanner scans itself in CI.
 */
export const PATTERNS = [
	{ name: 'aws-access-key', regex: /\bAKIA[0-9A-Z]{16}\b/ },
	{ name: 'github-pat-classic', regex: /\bghp_[A-Za-z0-9]{36}\b/ },
	{ name: 'github-pat-fine-grained', regex: /\bgithub_pat_[A-Za-z0-9_]{22}_[A-Za-z0-9_]{59}\b/ },
	{ name: 'github-oauth-token', regex: /\bgho_[A-Za-z0-9]{36}\b/ },
	{
		name: 'private-key',
		// Written so this source line does not match itself:
		// the literal header would need "BEGIN " followed directly by a key type.
		regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/
	},
	{ name: 'slack-token', regex: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/ },
	{ name: 'stripe-live-key', regex: /\bsk_live_[0-9a-zA-Z]{16,}\b/ },
	{ name: 'google-api-key', regex: /\bAIza[0-9A-Za-z_-]{35}\b/ },
	{ name: 'openai-api-key', regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/ },
	{
		name: 'jwt-token',
		regex: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/
	},
	{
		name: 'db-url-with-credentials',
		regex: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^/\s:]+:[^/\s@]+@/i
	},
	{
		name: 'secret-assignment',
		regex: /(?:password|passwd|pwd|api[_-]?key|secret|access[_-]?token|auth[_-]?token|client[_-]?secret|private[_-]?key)\s*[:=]\s*["'][^"']{10,}["']/i,
		// Fixture/example locations only ever carry synthetic values.
		skipPaths: [FIXTURE_PATH, MANUAL_API_TEST]
	}
];

/**
 * Scan one text blob. Returns findings: [{ file, line, pattern }].
 * `file` is a display path (relative when possible); lines are 1-based.
 */
export function scanText(file, text) {
	const findings = [];
	const lines = String(text).split('\n');
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (line.includes(ALLOW_MARKER)) continue;
		for (const p of PATTERNS) {
			if (p.skipPaths && p.skipPaths.some((re) => re.test(file))) continue;
			if (p.regex.test(line)) {
				findings.push({ file, line: i + 1, pattern: p.name });
			}
		}
	}
	return findings;
}

/** True when a repo-relative path should never be scanned. */
export function isExcludedPath(relPath) {
	const withSlash = relPath.replace(/\\/g, '/');
	return EXCLUDED_PATH_FRAGMENTS.some((frag) => withSlash.includes(frag));
}

/** Scan a list of files (repo-relative), returning all findings. */
export function scanFiles(root, files) {
	const findings = [];
	for (const rel of files) {
		if (isExcludedPath(rel)) continue;
		const abs = path.join(root, rel);
		let text;
		try {
			text = readFileSync(abs, 'utf8');
		} catch {
			continue; // binary / unreadable / vanished — skip, don't crash
		}
		if (text.includes('\0')) continue; // binary
		findings.push(...scanText(rel, text));
	}
	return findings;
}

/** List tracked files via git, falling back to an empty list outside git. */
export function collectFiles(root) {
	try {
		const out = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' });
		return out.split('\0').filter(Boolean);
	} catch {
		return [];
	}
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
	const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
	const args = process.argv.slice(2);
	const files = args.length ? args : collectFiles(here);
	const findings = scanFiles(here, files);

	if (findings.length === 0) {
		console.log(`[secret-scan] clean — ${files.length} file(s) scanned, no secrets detected.`);
		process.exit(0);
	}

	console.error(`[secret-scan] ${findings.length} potential secret(s) found:`);
	for (const f of findings) {
		console.error(`  ${f.file}:${f.line}  [${f.pattern}]`);
	}
	console.error(
		'\nIf a finding is a false positive (synthetic fixture or reviewed dev placeholder),' +
			`\nmove it under tests/docs, or add the literal marker "${ALLOW_MARKER}" on that line.`
	);
	process.exit(1);
}
