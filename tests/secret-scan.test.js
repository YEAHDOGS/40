/**
 * Secrets scanner tests.
 *
 * Unit tests for scripts/secret-scan.js — pattern true positives,
 * true negatives (noise that must NOT trip the gate), the allowlist
 * marker, path exclusions, and the fixture-scope rules.
 *
 * IMPORTANT: every synthetic "secret" below is built by string
 * concatenation so this file itself stays clean under the scanner.
 * Never paste a literal secret-shaped token into a test.
 */
import test from 'node:test';
import assert from 'node:assert';
import {
	scanText,
	isExcludedPath,
	PATTERNS,
	ALLOW_MARKER
} from '../scripts/secret-scan.js';

// ---- synthetic fixtures (concatenated so the scanner can't see them) ----

const awsKey = 'AKIA' + 'A'.repeat(16);
const ghp = 'ghp_' + 'a'.repeat(36);
const fineGrained = 'github_pat_' + 'a'.repeat(22) + '_' + 'b'.repeat(59);
const privKey = '-----BEGIN ' + 'RSA PRIVATE KEY-----';
const stripeLive = 'sk_live_' + 'x'.repeat(24);
const googleKey = 'AIza' + 'y'.repeat(35);
const openaiKey = 'sk-' + 'z'.repeat(48);
const slackTok = 'xoxb-' + '1'.repeat(12);
const jwt = 'eyJ' + 'a'.repeat(10) + '.' + 'b'.repeat(10) + '.' + 'c'.repeat(10);
const dbUrl = 'postgres://' + 'user' + ':' + 'pw12345678' + '@db.internal:5432/app';
const assignment = 'password = "' + 'correct-horse-42' + '"';

// ---- pattern true positives ----

const positives = [
	['aws-access-key', `export AWS_KEY=${awsKey}`],
	['github-pat-classic', `token=${ghp}`],
	['github-pat-fine-grained', `// ${fineGrained}`],
	['private-key', privKey],
	['slack-token', `SLACK=${slackTok}`],
	['stripe-live-key', `STRIPE=${stripeLive}`],
	['google-api-key', `MAPS=${googleKey}`],
	['openai-api-key', `OPENAI=${openaiKey}`],
	['jwt-token', `Authorization: Bearer ${jwt}`],
	['db-url-with-credentials', `DATABASE_URL="${dbUrl}"`],
	['secret-assignment', `const x = { ${assignment} };`]
];

for (const [name, text] of positives) {
	test(`detects ${name}`, () => {
		const found = scanText('src/server/auth.js', text);
		assert.ok(
			found.some((f) => f.pattern === name),
			`expected pattern "${name}" to fire on: ${text.slice(0, 60)}…`
		);
		assert.strictEqual(found.length, 1, 'exactly one finding per fixture line');
		assert.strictEqual(found[0].line, 1);
	});
}

test('pattern registry covers the expected set', () => {
	const names = PATTERNS.map((p) => p.name);
	assert.deepStrictEqual(names, [
		'aws-access-key',
		'github-pat-classic',
		'github-pat-fine-grained',
		'github-oauth-token',
		'private-key',
		'slack-token',
		'stripe-live-key',
		'google-api-key',
		'openai-api-key',
		'jwt-token',
		'db-url-with-credentials',
		'secret-assignment'
	]);
});

// ---- true negatives: prose and near-misses must stay silent ----

const negatives = [
	// truncated JWT header from docs (single segment, no full token)
	'"accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."',
	// placeholder env names without values
	'JWT_SECRET=change-me-in-production',
	// stripe TEST keys are not production secrets
	'STRIPE=sk_test_' + 'x'.repeat(24),
	// short / empty values
	'password = ""',
	'password = "short"',
	// bare key names in prose
	'Never commit your AWS access key (AKIA...) to the repo.',
	// uuids, hashes, dicebear urls — high entropy but not credential-shaped
	'"id": "3b7bc077-8680-455c-bb4f-9b5f7749c2d5"',
	'https://api.dicebear.com/7.x/avataaars/svg?seed=coder_jane',
	// sqlite dev url has no credentials
	'DATABASE_URL="file:./dev.db"'
];

for (const text of negatives) {
	test(`ignores benign text: ${text.slice(0, 50)}…`, () => {
		assert.deepStrictEqual(scanText('src/server/auth.js', text), []);
	});
}

// ---- allowlist marker ----

test(`lines containing "${ALLOW_MARKER}" are skipped`, () => {
	const text = `const DEV_ONLY_SECRET = "${'dev-only-' + 'x'.repeat(20)}"; // ${ALLOW_MARKER}`;
	assert.deepStrictEqual(scanText('src/server/auth.js', text), []);
});

test('marker must be literal — similar words do not count', () => {
	const text = `password = "${'correct-horse-42'}" // allow this`;
	assert.ok(scanText('src/server/auth.js', text).length > 0);
});

// ---- path rules ----

test('secret-assignment is fixture-scoped: silent in tests/, loud in src/', () => {
	const line = `password: "${'correct-horse-42'}"`;
	assert.deepStrictEqual(scanText('tests/api.test.js', line), []);
	assert.ok(scanText('src/server/auth.js', line).length > 0);
});

test('secret-assignment is silent in docs/ (API examples) and the manual REST test script', () => {
	const line = `"password": "${'correct-horse-42'}"`;
	assert.deepStrictEqual(scanText('docs/api.md', line), []);
	assert.deepStrictEqual(scanText('scripts/test-rest-api.js', line), []);
});

test('token-shaped patterns still fire inside tests/ (a real leak there is still a leak)', () => {
	const found = scanText('tests/api.test.js', `token=${ghp}`);
	assert.ok(found.some((f) => f.pattern === 'github-pat-classic'));
});

test('isExcludedPath skips deps, build output, and VCS', () => {
	assert.ok(isExcludedPath('node_modules/lodash/index.js'));
	assert.ok(isExcludedPath('dist/assets/index-abc.js'));
	assert.ok(isExcludedPath('.git/hooks/pre-commit'));
	assert.ok(!isExcludedPath('src/server/auth.js'));
});

// ---- multiline scanning ----

test('reports correct 1-based line numbers', () => {
	const text = ['const a = 1;', `const k = "${awsKey}";`, 'const b = 2;'].join('\n');
	const found = scanText('src/x.js', text);
	assert.deepStrictEqual(found, [{ file: 'src/x.js', line: 2, pattern: 'aws-access-key' }]);
});
