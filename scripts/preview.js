// Workers Builds "Preview command" for every non-production branch: `node scripts/preview.js`.
// Builds the web app, applies pending D1 migrations to staging, runs `wrangler preview` (a branch-isolated
// Worker Preview on staging data, see "previews" in worker/wrangler.jsonc), then writes the Preview URL onto
// the first line of the branch's open pull request.
// The PR step needs the build secret GITHUB_PR_TOKEN (fine-grained token, Pull requests: read and write, this
// repo only). Without it, or before the PR exists, the Preview still deploys and the step is skipped.
// Created by DOGS.
import { spawnSync } from 'node:child_process';

const REPO = 'YEAHDOGS/40';
const GITHUB_API = 'https://api.github.com';
// The first line of a PR body starting with this is ours and gets replaced on every push.
const MARKER = '**Preview:**';
const SHORT_SHA = 7;

const {
	WORKERS_CI_BRANCH: branch,
	WORKERS_CI_COMMIT_SHA: sha = '',
	GITHUB_PR_TOKEN: githubToken
} = process.env;

// Staging gets pending migrations first, so a Preview never runs against an older schema. All Previews
// share staging, so migrations must stay additive.
for (const command of [
	'pnpm build',
	'pnpm wrangler d1 migrations apply DB --remote --env preview'
]) {
	console.log(`> ${command}`);
	const step = spawnSync(command, {
		shell: true,
		stdio: 'inherit',
		env: { ...process.env, CI: 'true' }
	});
	if (step.status !== 0) process.exit(step.status ?? 1);
}

// Wrangler prints build logs on stderr and the result as JSON on stdout.
const run = spawnSync('pnpm -s wrangler preview --json', {
	shell: true,
	encoding: 'utf8',
	stdio: ['inherit', 'pipe', 'inherit']
});
if (run.status !== 0) {
	process.stdout.write(run.stdout || '');
	process.exit(run.status ?? 1);
}

let result = {};
try {
	result = JSON.parse(run.stdout.slice(run.stdout.indexOf('{')));
} catch {
	console.warn('Preview deployed, but its output was not JSON; skipping the pull request link.');
	process.exit(0);
}
const url = result.preview?.urls?.[0] ?? result.deployment?.urls?.[0] ?? '';
console.log(`Preview ${result.preview?.name ?? branch}: ${url || 'deployed, no URL yet'}`);

if (!githubToken || !branch) {
	console.log('No GITHUB_PR_TOKEN or branch: skipping the pull request link.');
	process.exit(0);
}

const github = (path, init = {}) =>
	fetch(`${GITHUB_API}${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${githubToken}`,
			Accept: 'application/vnd.github+json',
			'X-GitHub-Api-Version': '2022-11-28',
			...init.headers
		}
	});

try {
	const head = encodeURIComponent(`${REPO.split('/')[0]}:${branch}`);
	const pulls = await github(`/repos/${REPO}/pulls?state=open&head=${head}`).then((r) => r.json());
	const pull = Array.isArray(pulls) ? pulls[0] : null;
	if (!pull) {
		console.log(`No open pull request for ${branch} yet; the next push will link it.`);
		process.exit(0);
	}
	const line = [`${MARKER} ${url || 'deployed'}`, sha && `\`${sha.slice(0, SHORT_SHA)}\``]
		.filter(Boolean)
		.join(' · ');
	const body = String(pull.body || '');
	const firstBreak = body.indexOf('\n');
	const rest = body.startsWith(MARKER)
		? firstBreak === -1
			? ''
			: body.slice(firstBreak + 1)
		: body;
	const response = await github(`/repos/${REPO}/pulls/${pull.number}`, {
		method: 'PATCH',
		body: JSON.stringify({ body: `${line}\n${rest.startsWith('\n') ? '' : '\n'}${rest}` })
	});
	console.log(
		response.ok
			? `Linked the Preview on pull request #${pull.number}.`
			: `Could not update pull request #${pull.number} (${response.status}).`
	);
} catch (error) {
	// The Preview is already live; a failed link must not fail the build.
	console.warn(`Skipping the pull request link: ${error.message}`);
}
