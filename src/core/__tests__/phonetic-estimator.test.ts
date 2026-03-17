import { describe, it, expect } from 'vitest';
import { PhoneticEstimator } from '../phonetic-estimator.js';
import type { DictionaryData, VisemeCategory } from '../types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MINI_DICT: DictionaryData = {
    hello: ['HH', 'AH', 'L', 'OW'],
    world: ['W', 'ER', 'L', 'D'],
    the: ['DH', 'AH'],
    cat: ['K', 'AE', 'T'],
    fish: ['F', 'IH', 'SH'],
};

// ---------------------------------------------------------------------------
// PhoneticEstimator — simple mode
// ---------------------------------------------------------------------------

describe('PhoneticEstimator (simple mode)', () => {
    const estimator = new PhoneticEstimator(MINI_DICT, 'simple');

    it('should tokenise a simple string into words', () => {
        const tokens = estimator.estimate('Hello World');
        expect(tokens).toHaveLength(2);
        expect(tokens[0].word).toBe('hello');
        expect(tokens[1].word).toBe('world');
    });

    it('should look up words from the dictionary', () => {
        const tokens = estimator.estimate('hello');
        expect(tokens[0].phonemes).toEqual(['HH', 'AH', 'L', 'OW']);
    });

    it('should produce correct viseme categories from phonemes', () => {
        const tokens = estimator.estimate('hello');
        const categories = tokens[0].visemes.map((v) => v.category);
        // HH → OPEN, AH → OPEN, L → DENTAL, OW → ROUND
        expect(categories).toEqual(['OPEN', 'OPEN', 'DENTAL', 'ROUND']);
    });

    it('should strip punctuation from input', () => {
        const tokens = estimator.estimate('Hello, world!');
        expect(tokens).toHaveLength(2);
        expect(tokens[0].word).toBe('hello');
        expect(tokens[1].word).toBe('world');
    });

    it('should preserve apostrophes within words', () => {
        // "don't" is not in our mini dict, so it'll use fallback
        const tokens = estimator.estimate("don't");
        expect(tokens).toHaveLength(1);
        expect(tokens[0].word).toBe("don't");
    });

    it('should fall back to character-level G2P for unknown words', () => {
        const tokens = estimator.estimate('xyz');
        expect(tokens[0].phonemes).toEqual([]); // empty = fallback was used
        expect(tokens[0].visemes.length).toBeGreaterThan(0);
    });

    it('should calculate totalWeight as sum of viseme weights', () => {
        const tokens = estimator.estimate('hello');
        const expectedTotal = tokens[0].visemes.reduce(
            (sum, v) => sum + v.weight,
            0,
        );
        expect(tokens[0].totalWeight).toBeCloseTo(expectedTotal);
    });

    it('should handle empty input', () => {
        const tokens = estimator.estimate('');
        expect(tokens).toEqual([]);
    });

    it('should handle whitespace-only input', () => {
        const tokens = estimator.estimate('   ');
        expect(tokens).toEqual([]);
    });

    it('should handle multiple spaces between words', () => {
        const tokens = estimator.estimate('hello    world');
        expect(tokens).toHaveLength(2);
    });

    it('should produce visemes with correct fullVisemeId for dictionary words', () => {
        const tokens = estimator.estimate('fish');
        // F → 18, IH → 6, SH → 16
        const ids = tokens[0].visemes.map((v) => v.fullVisemeId);
        expect(ids).toEqual([18, 6, 16]);
    });

    it('should handle CLOSED visemes for bilabial consonants', () => {
        const tokens = estimator.estimate('cat');
        // K → CLOSED, AE → OPEN, T → DENTAL
        const categories = tokens[0].visemes.map((v) => v.category);
        expect(categories).toEqual(['CLOSED', 'OPEN', 'DENTAL']);
    });

    it('should produce FRICATIVE for f and v phonemes', () => {
        const tokens = estimator.estimate('fish');
        expect(tokens[0].visemes[0].category).toBe('FRICATIVE');
    });
});

// ---------------------------------------------------------------------------
// PhoneticEstimator — full mode
// ---------------------------------------------------------------------------

describe('PhoneticEstimator (full mode)', () => {
    const estimator = new PhoneticEstimator(MINI_DICT, 'full');

    it('should produce different aperture/width values in full mode', () => {
        const tokens = estimator.estimate('hello');
        const firstViseme = tokens[0].visemes[0]; // HH → full viseme 12
        expect(firstViseme.fullVisemeId).toBe(12);
        // Full mode: HH maps to viseme 12 (h) with aperture 0.60
        expect(firstViseme.aperture).toBe(0.6);
    });

    it('should still populate simple category in full mode', () => {
        const tokens = estimator.estimate('hello');
        const categories = tokens[0].visemes.map((v) => v.category);
        expect(categories).toEqual(['OPEN', 'OPEN', 'DENTAL', 'ROUND']);
    });
});

// ---------------------------------------------------------------------------
// PhoneticEstimator — no dictionary (pure fallback)
// ---------------------------------------------------------------------------

describe('PhoneticEstimator (no dictionary)', () => {
    const estimator = new PhoneticEstimator(undefined, 'simple');

    it('should still produce visemes without a dictionary', () => {
        const tokens = estimator.estimate('hello world');
        expect(tokens).toHaveLength(2);
        expect(tokens[0].visemes.length).toBeGreaterThan(0);
        expect(tokens[1].visemes.length).toBeGreaterThan(0);
    });

    it('should always return empty phonemes array for fallback', () => {
        const tokens = estimator.estimate('hello');
        expect(tokens[0].phonemes).toEqual([]);
    });

    it('should handle digraphs correctly', () => {
        const tokens = estimator.estimate('sh');
        // "sh" is a digraph → should produce DENTAL (one viseme, not two)
        expect(tokens[0].visemes).toHaveLength(1);
        expect(tokens[0].visemes[0].category).toBe('DENTAL');
    });

    it('should handle the "th" digraph', () => {
        const tokens = estimator.estimate('th');
        expect(tokens[0].visemes).toHaveLength(1);
        expect(tokens[0].visemes[0].category).toBe('DENTAL');
    });

    it('should handle "oo" vowel digraph', () => {
        const tokens = estimator.estimate('oo');
        expect(tokens[0].visemes).toHaveLength(1);
        expect(tokens[0].visemes[0].category).toBe('ROUND');
    });
});
