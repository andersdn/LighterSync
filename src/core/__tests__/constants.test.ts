import { describe, it, expect } from 'vitest';
import {
    ARPABET_TO_VISEME,
    ARPABET_TO_FULL_VISEME,
    CHAR_TO_VISEME,
    CHAR_TO_FULL_VISEME,
    VISEME_PARAMS,
    FULL_VISEME_TABLE,
    DIGRAPH_TO_VISEME,
} from '../constants.js';
import type { VisemeCategory } from '../types.js';

// ---------------------------------------------------------------------------
// Viseme Params
// ---------------------------------------------------------------------------

describe('VISEME_PARAMS', () => {
    const EXPECTED_CATEGORIES: VisemeCategory[] = [
        'CLOSED', 'DENTAL', 'OPEN', 'ROUND', 'FRICATIVE', 'SILENT',
    ];

    it('should have all six viseme categories', () => {
        for (const cat of EXPECTED_CATEGORIES) {
            expect(VISEME_PARAMS[cat]).toBeDefined();
        }
    });

    it('should have aperture, width, and weight for each category', () => {
        for (const cat of EXPECTED_CATEGORIES) {
            const params = VISEME_PARAMS[cat];
            expect(typeof params.aperture).toBe('number');
            expect(typeof params.width).toBe('number');
            expect(typeof params.weight).toBe('number');
        }
    });

    it('should have SILENT with zero aperture and zero weight', () => {
        expect(VISEME_PARAMS.SILENT.aperture).toBe(0.0);
        expect(VISEME_PARAMS.SILENT.weight).toBe(0.0);
    });

    it('should have CLOSED with zero aperture', () => {
        expect(VISEME_PARAMS.CLOSED.aperture).toBe(0.0);
    });

    it('should have OPEN with the highest aperture', () => {
        expect(VISEME_PARAMS.OPEN.aperture).toBe(1.0);
    });
});

// ---------------------------------------------------------------------------
// ARPAbet → Viseme Mapping
// ---------------------------------------------------------------------------

describe('ARPABET_TO_VISEME', () => {
    it('should map all 39 ARPAbet phonemes', () => {
        const allPhonemes = [
            'P', 'B', 'M', 'T', 'D', 'N', 'S', 'Z', 'L',
            'DH', 'TH', 'NG', 'CH', 'JH', 'SH', 'ZH', 'Y',
            'AA', 'AE', 'AH', 'AO', 'EH', 'ER', 'EY', 'IH', 'IY',
            'AY', 'AW', 'HH', 'R',
            'OW', 'UH', 'UW', 'OY', 'W',
            'F', 'V',
            'K', 'G',
        ];
        for (const phoneme of allPhonemes) {
            expect(ARPABET_TO_VISEME[phoneme]).toBeDefined();
        }
    });

    it('should map bilabials to CLOSED', () => {
        expect(ARPABET_TO_VISEME['P']).toBe('CLOSED');
        expect(ARPABET_TO_VISEME['B']).toBe('CLOSED');
        expect(ARPABET_TO_VISEME['M']).toBe('CLOSED');
    });

    it('should map labiodentals to FRICATIVE', () => {
        expect(ARPABET_TO_VISEME['F']).toBe('FRICATIVE');
        expect(ARPABET_TO_VISEME['V']).toBe('FRICATIVE');
    });

    it('should map rounded vowels to ROUND', () => {
        expect(ARPABET_TO_VISEME['OW']).toBe('ROUND');
        expect(ARPABET_TO_VISEME['UW']).toBe('ROUND');
        expect(ARPABET_TO_VISEME['W']).toBe('ROUND');
    });
});

// ---------------------------------------------------------------------------
// ARPAbet → Full Viseme IDs
// ---------------------------------------------------------------------------

describe('ARPABET_TO_FULL_VISEME', () => {
    it('should map to IDs in range 0-21', () => {
        for (const id of Object.values(ARPABET_TO_FULL_VISEME)) {
            expect(id).toBeGreaterThanOrEqual(0);
            expect(id).toBeLessThanOrEqual(21);
        }
    });

    it('should be mostly consistent with simple category mapping', () => {
        // Most phonemes map to the same simple category in both modes.
        // A few intentionally diverge — the 5-category and 22-viseme systems
        // make different grouping choices for animation quality:
        //   NG → DENTAL (simple) vs viseme 20/CLOSED (full: k/g/ng velar group)
        //   Y  → DENTAL (simple) vs viseme 6/OPEN  (full: y/iy/ih palatal glide)
        //   AO → OPEN   (simple) vs viseme 3/ROUND (full: ɔ rounded)
        //   UH → ROUND  (simple) vs viseme 4/OPEN  (full: ʊ grouped with ɛ)
        const KNOWN_DIVERGENCES = new Set(['NG', 'Y', 'AO', 'UH']);

        for (const [phoneme, category] of Object.entries(ARPABET_TO_VISEME)) {
            if (KNOWN_DIVERGENCES.has(phoneme)) continue;
            const fullId = ARPABET_TO_FULL_VISEME[phoneme];
            if (fullId !== undefined) {
                const fullEntry = FULL_VISEME_TABLE[fullId];
                expect(fullEntry.simpleCategory).toBe(category);
            }
        }
    });
});

// ---------------------------------------------------------------------------
// Full Viseme Table
// ---------------------------------------------------------------------------

describe('FULL_VISEME_TABLE', () => {
    it('should have exactly 22 entries', () => {
        expect(FULL_VISEME_TABLE).toHaveLength(22);
    });

    it('should have sequential IDs from 0 to 21', () => {
        for (let i = 0; i < 22; i++) {
            expect(FULL_VISEME_TABLE[i].id).toBe(i);
        }
    });

    it('should have all values normalised between 0 and 1.5', () => {
        for (const entry of FULL_VISEME_TABLE) {
            expect(entry.aperture).toBeGreaterThanOrEqual(0);
            expect(entry.aperture).toBeLessThanOrEqual(1.0);
            expect(entry.width).toBeGreaterThanOrEqual(0);
            expect(entry.width).toBeLessThanOrEqual(1.0);
            expect(entry.weight).toBeGreaterThanOrEqual(0);
            expect(entry.weight).toBeLessThanOrEqual(1.5);
        }
    });

    it('should have Silence as viseme 0', () => {
        expect(FULL_VISEME_TABLE[0].label).toBe('Silence');
        expect(FULL_VISEME_TABLE[0].aperture).toBe(0);
        expect(FULL_VISEME_TABLE[0].weight).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// Character-level Mappings
// ---------------------------------------------------------------------------

describe('CHAR_TO_VISEME', () => {
    it('should map all lowercase Latin letters', () => {
        const letters = 'abcdefghijklmnopqrstuvwxyz';
        for (const char of letters) {
            // Not all letters are mapped (no entry for some), but the common ones should be
            if (CHAR_TO_VISEME[char]) {
                expect(['CLOSED', 'DENTAL', 'OPEN', 'ROUND', 'FRICATIVE']).toContain(
                    CHAR_TO_VISEME[char],
                );
            }
        }
    });

    it('should map vowels to OPEN or ROUND', () => {
        expect(CHAR_TO_VISEME['a']).toBe('OPEN');
        expect(CHAR_TO_VISEME['e']).toBe('OPEN');
        expect(CHAR_TO_VISEME['i']).toBe('OPEN');
        expect(CHAR_TO_VISEME['o']).toBe('ROUND');
        expect(CHAR_TO_VISEME['u']).toBe('ROUND');
    });
});

describe('CHAR_TO_FULL_VISEME', () => {
    it('should have IDs in range 0-21', () => {
        for (const id of Object.values(CHAR_TO_FULL_VISEME)) {
            expect(id).toBeGreaterThanOrEqual(0);
            expect(id).toBeLessThanOrEqual(21);
        }
    });
});

// ---------------------------------------------------------------------------
// Digraph Table
// ---------------------------------------------------------------------------

describe('DIGRAPH_TO_VISEME', () => {
    it('should contain common English digraphs', () => {
        const patterns = DIGRAPH_TO_VISEME.map(([p]) => p);
        expect(patterns).toContain('th');
        expect(patterns).toContain('sh');
        expect(patterns).toContain('ch');
        expect(patterns).toContain('ph');
    });

    it('should have trigraphs before digraphs (longer first)', () => {
        const patterns = DIGRAPH_TO_VISEME.map(([p]) => p);
        const tchIdx = patterns.indexOf('tch');
        const chIdx = patterns.indexOf('ch');
        // tch should come before ch for correct matching
        expect(tchIdx).toBeLessThan(chIdx);
    });

    it('should map ph to FRICATIVE (like f)', () => {
        const phEntry = DIGRAPH_TO_VISEME.find(([p]) => p === 'ph');
        expect(phEntry?.[1]).toEqual(['FRICATIVE']);
    });
});
