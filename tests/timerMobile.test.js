import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(root, '..', 'src', 'components', 'Timer.svelte'), 'utf8');

// Mobile-viewport QA pins: the flip clock must fit its container at 390px
// (and the 272px-wide xl sidebar where it actually renders today). Fixed
// pixel tiles clipped the days column; fluid flex tiles + clamp() sizes
// keep every digit inside the tile at any width.

function ruleBody(src, selector) {
	const m = src.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`));
	assert.ok(m, `expected CSS rule ${selector} in Timer.svelte`);
	return m[1];
}

test('flip tiles are fluid, not fixed-width', () => {
	const body = ruleBody(src, '\\.flip-tile-col');
	assert.ok(/flex:\s*1\s+1\s+0/.test(body), 'tiles grow/shrink with the container');
	assert.ok(/min-width:\s*0/.test(body), 'tiles may shrink below content size');
	assert.ok(!/width:\s*60px/.test(body), 'no fixed 60px tile width (clipped at narrow widths)');
});

test('digit and card sizes use clamp()', () => {
	assert.ok(/\.flip-digit\s*\{[^}]*font-size:\s*clamp\(/.test(src), 'digit font scales with viewport');
	assert.ok(/\.flip-card\s*\{[^}]*height:\s*clamp\(/.test(src), 'card height scales with viewport');
});

test('days digit shrinks when it runs 3 digits', () => {
	assert.ok(src.includes('class:days-wide={timeLeft.days > 99}'), 'days column flags >99 days');
	assert.ok(/\.days-wide\s+\.flip-digit\s*\{[^}]*font-size:\s*clamp\(/.test(src), '3-digit days get smaller type');
});

test('two-digit display format preserved', () => {
	assert.ok(src.includes('padStart(2, "0")'), 'days still render zero-padded 2-digit minimum');
});
