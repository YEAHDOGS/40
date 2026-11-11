// One build entry point for every platform, used locally AND by GitHub Actions.
//
//   pnpm build:web        static site in dist/web/ (deployed by the Worker)
//   pnpm build:desktop    this machine's OS: Windows (.msi/.exe), macOS (.dmg), Linux (.deb/.rpm/.AppImage)
//   pnpm build:android    .apk + .aab   (any OS with the Android SDK + NDK)
//   pnpm build:ios        .ipa          (macOS with Xcode only)
//
// Extra arguments are passed to the tauri command, e.g. pnpm build:desktop --target universal-apple-darwin
// Signing: values come from the environment, or from the root .env file (see .env.example).
// Anything missing => an unsigned build, never a failure. Created by DOGS.

import { spawnSync } from 'node:child_process';
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	rmSync,
	statSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [target, ...extra] = process.argv.slice(2);
const env = process.env;
const isWin = process.platform === 'win32';

if (existsSync('.env')) {
	process.loadEnvFile('.env'); // never overrides variables that are already set (e.g. CI secrets)
	console.log('Loaded settings from .env');
}

// Unset secrets arrive as empty strings (GitHub Actions, blank .env lines). Treat them as absent,
// otherwise Tauri would try to use an empty certificate.
for (const [key, value] of Object.entries(env)) if (value === '') delete env[key];

function run(cmd, args, opts = {}) {
	console.log(`\n> ${cmd} ${args.join(' ')}`);
	// Windows needs a shell to find pnpm.cmd / *.bat, so pass one quoted command line there.
	const quote = (s) => (/[\s"&|<>^]/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s);
	const res = isWin
		? spawnSync([cmd, ...args].map(quote).join(' '), {
				stdio: 'inherit',
				shell: true,
				env,
				...opts
			})
		: spawnSync(cmd, args, { stdio: 'inherit', env, ...opts });
	if (res.status !== 0) process.exit(res.status ?? 1);
}
const tauri = (...args) => run('pnpm', ['tauri', ...args, ...extra]);

// CI-friendly secrets: allow file *contents* in env vars and write them to temp files.
function secretToFile(contentVar, pathVar, fileName, base64 = false) {
	if (env[pathVar] || !env[contentVar]) return;
	const file = join(tmpdir(), fileName);
	writeFileSync(file, base64 ? Buffer.from(env[contentVar], 'base64') : env[contentVar]);
	env[pathVar] = file;
}

function findFiles(dir, test, out = []) {
	if (!existsSync(dir)) return out;
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) findFiles(p, test, out);
		else if (test(p)) out.push(p);
	}
	return out;
}

function collect(files, outDir) {
	rmSync(outDir, { recursive: true, force: true });
	mkdirSync(outDir, { recursive: true });
	for (const f of files) copyFileSync(f, join(outDir, f.split(/[/\\]/).pop()));
	console.log(
		`\nArtifacts in ${outDir}:\n  ${files.map((f) => f.split(/[/\\]/).pop()).join('\n  ') || '(none)'}`
	);
}

function web() {
	run('pnpm', ['build']);
}

function desktop() {
	// macOS signing + notarization env vars are read by Tauri directly:
	// APPLE_CERTIFICATE, APPLE_CERTIFICATE_PASSWORD, APPLE_SIGNING_IDENTITY,
	// APPLE_API_ISSUER, APPLE_API_KEY, APPLE_API_KEY_PATH  (or APPLE_ID, APPLE_PASSWORD, APPLE_TEAM_ID)
	secretToFile(
		'APPLE_API_KEY_P8',
		'APPLE_API_KEY_PATH',
		`AuthKey_${env.APPLE_API_KEY || 'key'}.p8`
	);
	if (process.platform === 'darwin' && !env.APPLE_SIGNING_IDENTITY) {
		console.log('No APPLE_SIGNING_IDENTITY: building an unsigned macOS app.');
	}
	tauri('build');
	const bundles = findFiles(
		'src/tauri/target',
		(p) => /[/\\]release[/\\]bundle[/\\]/.test(p) && /\.(msi|exe|dmg|deb|rpm|AppImage)$/.test(p)
	);
	collect(bundles, 'dist/desktop');
}

function latestBuildTools() {
	const root = join(env.ANDROID_HOME, 'build-tools');
	const versions = readdirSync(root).sort((a, b) =>
		a.localeCompare(b, undefined, { numeric: true })
	);
	return join(root, versions.at(-1));
}

function android() {
	if (!env.ANDROID_HOME || !env.NDK_HOME) {
		console.error('Set ANDROID_HOME and NDK_HOME first. See docs/BUILDING.md#android.');
		process.exit(1);
	}
	if (!existsSync('src/tauri/gen/android')) run('pnpm', ['tauri', 'android', 'init', '--ci']);
	tauri('android', 'build', '--apk', '--aab', '--ci');

	const outputs = findFiles(
		'src/tauri/gen/android/app/build/outputs',
		(p) => /release/i.test(p) && /\.(apk|aab)$/.test(p)
	);

	secretToFile('ANDROID_KEYSTORE_BASE64', 'ANDROID_KEYSTORE_PATH', 'dogs-upload.jks', true);
	if (!env.ANDROID_KEYSTORE_PATH) {
		console.log(
			'No ANDROID_KEYSTORE_PATH: release files are unsigned (fine for testing the build).'
		);
		return collect(outputs, 'dist/android');
	}

	const tools = latestBuildTools();
	const ext = isWin ? '.bat' : '';
	const alias = env.ANDROID_KEY_ALIAS || 'upload';
	env.ANDROID_KEY_PASSWORD ||= env.ANDROID_KEYSTORE_PASSWORD;
	mkdirSync('dist/tmp', { recursive: true });
	const signed = [];
	for (const file of outputs) {
		const name = file.split(/[/\\]/).pop().replace('-unsigned', '');
		const out = join('dist/tmp', name);
		if (file.endsWith('.apk')) {
			const aligned = `${out}.aligned`;
			run(join(tools, `zipalign${isWin ? '.exe' : ''}`), ['-f', '-p', '4', file, aligned]);
			run(join(tools, `apksigner${ext}`), [
				'sign',
				'--ks',
				env.ANDROID_KEYSTORE_PATH,
				'--ks-key-alias',
				alias,
				'--ks-pass',
				'env:ANDROID_KEYSTORE_PASSWORD',
				'--key-pass',
				'env:ANDROID_KEY_PASSWORD',
				'--out',
				out,
				aligned
			]);
		} else {
			copyFileSync(file, out);
			run(env.JAVA_HOME ? join(env.JAVA_HOME, 'bin', 'jarsigner') : 'jarsigner', [
				'-keystore',
				env.ANDROID_KEYSTORE_PATH,
				'-storepass:env',
				'ANDROID_KEYSTORE_PASSWORD',
				'-keypass:env',
				'ANDROID_KEY_PASSWORD',
				out,
				alias
			]);
		}
		signed.push(out);
	}
	collect(signed, 'dist/android');
	rmSync('dist/tmp', { recursive: true, force: true });
}

function ios() {
	if (process.platform !== 'darwin') {
		console.error('iOS builds need macOS with Xcode. Use the GitHub Actions macOS runner instead.');
		process.exit(1);
	}
	// Automatic signing: APPLE_DEVELOPMENT_TEAM + APPLE_API_ISSUER, APPLE_API_KEY, APPLE_API_KEY_PATH
	// Manual signing alternative: IOS_CERTIFICATE, IOS_CERTIFICATE_PASSWORD, IOS_MOBILE_PROVISION
	secretToFile(
		'APPLE_API_KEY_P8',
		'APPLE_API_KEY_PATH',
		`AuthKey_${env.APPLE_API_KEY || 'key'}.p8`
	);
	if (!existsSync('src/tauri/gen/apple')) run('pnpm', ['tauri', 'ios', 'init', '--ci']);

	if (!env.APPLE_DEVELOPMENT_TEAM) {
		console.log(
			'No APPLE_DEVELOPMENT_TEAM: doing an unsigned simulator build to check that iOS compiles.'
		);
		return tauri('ios', 'build', '--debug', '--target', 'aarch64-sim', '--ci');
	}
	tauri('ios', 'build', '--ci');
	collect(
		findFiles('src/tauri/gen/apple/build', (p) => p.endsWith('.ipa')),
		'dist/ios'
	);
}

const targets = { web, desktop, android, ios };
if (!targets[target]) {
	console.error(`Usage: node scripts/build.js <${Object.keys(targets).join('|')}> [tauri args...]`);
	process.exit(1);
}
targets[target]();
