// Set the app version everywhere it lives:  pnpm version:set 0.0.2
// package.json is the source of truth (tauri.conf.json reads it); Cargo.toml is synced here.
import { readFileSync, writeFileSync } from 'node:fs';

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version || '')) {
	console.error('Usage: pnpm version:set <major.minor.patch>');
	process.exit(1);
}

const edit = (file, fn) => writeFileSync(file, fn(readFileSync(file, 'utf8')));

edit('package.json', (s) => s.replace(/"version": "[^"]+"/, `"version": "${version}"`));
edit('src/tauri/Cargo.toml', (s) => s.replace(/^version = "[^"]+"/m, `version = "${version}"`));

console.log(`Version set to ${version}. Add a docs/CHANGELOG.md entry, then tag v${version}.`);
