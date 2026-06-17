import test from 'node:test';
import assert from 'node:assert';
import { presets, communityThemes } from '../src/lib/clockPresets.js';

test('Clock Design Themes Configurations Unit Tests', async (t) => {

    await t.test('Predefined presets structure validation', () => {
        assert.ok(Array.isArray(presets), 'presets should be an array');
        assert.ok(presets.length >= 4, 'should expose at least 4 presets');
        
        // Vintage default validation
        const vintage = presets.find(p => p.id === 'vintage');
        assert.ok(vintage, 'should include vintage default theme');
        assert.strictEqual(vintage.colorBg, '#1c1c1c');
        assert.strictEqual(vintage.colorLabel, '#ff6600'); // Orange/Amber labels font
        assert.strictEqual(vintage.colorTile, '#e4e4e4'); // light tiles
    });

    await t.test('Community custom themes validation', () => {
        assert.ok(Array.isArray(communityThemes), 'communityThemes should be an array');
        assert.ok(communityThemes.length >= 3, 'should expose at least 3 community themes');
        
        // Pipboy validation
        const pipboy = communityThemes.find(c => c.id === 'pipboy');
        assert.ok(pipboy, 'should include Fallout Pipboy theme');
        assert.strictEqual(pipboy.colorDigit, '#ffb000');
        assert.ok(pipboy.css.includes('border: 1.5px solid #ffb000;'));
    });

    await t.test('Color variables formatting checks', () => {
        // Assert all presets and community themes use valid hex color formats
        const allThemes = [...presets, ...communityThemes];
        const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
        const rgbaRegex = /^rgba\(\d+,\s*\d+,\s*\d+,\s*[0-9.]+\)$/;

        for (const theme of allThemes) {
            // Check background color format
            const bgValid = hexRegex.test(theme.colorBg) || rgbaRegex.test(theme.colorBg);
            assert.ok(bgValid, `Theme ${theme.id} background color should be valid hex or rgba, got: ${theme.colorBg}`);
            
            // Check label color format
            const labelValid = hexRegex.test(theme.colorLabel) || rgbaRegex.test(theme.colorLabel);
            assert.ok(labelValid, `Theme ${theme.id} label color should be valid hex or rgba, got: ${theme.colorLabel}`);
            
            // Check tile color format
            const tileValid = hexRegex.test(theme.colorTile) || rgbaRegex.test(theme.colorTile);
            assert.ok(tileValid, `Theme ${theme.id} tile color should be valid hex or rgba, got: ${theme.colorTile}`);
            
            // Check digit color format
            const digitValid = hexRegex.test(theme.colorDigit) || rgbaRegex.test(theme.colorDigit);
            assert.ok(digitValid, `Theme ${theme.id} digit color should be valid hex or rgba, got: ${theme.colorDigit}`);
        }
    });

});
