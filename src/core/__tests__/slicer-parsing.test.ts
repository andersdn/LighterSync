/**
 * Tests for the parsing logic used in the slice-cmudict slicer script.
 *
 * These functions are extracted and tested in isolation to verify:
 *   - CMU dict text parsing
 *   - wordfreq-en-25000 JSON parsing
 *   - Dictionary slicing logic
 *
 * Since the slicer script isn't importable as a module, we re-implement
 * the pure functions here for unit testing.
 */

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Re-implement the pure parsing functions from slice-cmudict.ts
// (These mirror the slicer exactly so we can unit-test the logic)
// ---------------------------------------------------------------------------

function parseCMUDict(text: string): Map<string, string[]> {
    const dict = new Map<string, string[]>();

    for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(';;;')) continue;

        const parts = trimmed.split(/\s+/);
        if (parts.length < 2) continue;

        let word = parts[0].toLowerCase();

        // Skip alternate pronunciations like "hello(2)"
        if (/\(\d+\)$/.test(word)) continue;

        // Strip stress markers from phonemes: "AH0" → "AH"
        const phonemes = parts
            .slice(1)
            .filter((p) => !p.startsWith('#'))
            .map((p) => p.replace(/[012]/g, ''));

        if (phonemes.length > 0) {
            dict.set(word, phonemes);
        }
    }

    return dict;
}

function parseFrequencyList(text: string): string[] {
    const entries: [string, number][] = JSON.parse(text);
    return entries
        .map(([word]) => word.toLowerCase())
        .filter((word) => word.length > 0 && /^[a-z]/.test(word));
}

function sliceDict(
    cmuDict: Map<string, string[]>,
    frequencyWords: string[],
    size: number | 'full',
): Record<string, string[]> {
    if (size === 'full') {
        const result: Record<string, string[]> = {};
        for (const [word, phonemes] of cmuDict) {
            result[word] = phonemes;
        }
        return result;
    }

    const result: Record<string, string[]> = {};
    let count = 0;

    for (const word of frequencyWords) {
        if (count >= size) break;

        const phonemes = cmuDict.get(word);
        if (phonemes) {
            result[word] = phonemes;
            count++;
        }
    }

    return result;
}

// ---------------------------------------------------------------------------
// CMU Dict Parsing
// ---------------------------------------------------------------------------

describe('parseCMUDict', () => {
    it('should parse basic entries', () => {
        const text = 'HELLO  HH AH0 L OW1\nWORLD  W ER1 L D';
        const dict = parseCMUDict(text);
        expect(dict.get('hello')).toEqual(['HH', 'AH', 'L', 'OW']);
        expect(dict.get('world')).toEqual(['W', 'ER', 'L', 'D']);
    });

    it('should skip comment lines', () => {
        const text = ';;; This is a comment\nHELLO  HH AH0 L OW1';
        const dict = parseCMUDict(text);
        expect(dict.size).toBe(1);
        expect(dict.get('hello')).toBeDefined();
    });

    it('should skip alternate pronunciations', () => {
        const text = [
            'READ  R IY1 D',
            'READ(2)  R EH1 D',
        ].join('\n');
        const dict = parseCMUDict(text);
        expect(dict.get('read')).toEqual(['R', 'IY', 'D']);
        expect(dict.size).toBe(1); // only one entry for "read"
    });

    it('should strip stress markers (0, 1, 2)', () => {
        const text = 'ABOUT  AH0 B AW1 T';
        const dict = parseCMUDict(text);
        expect(dict.get('about')).toEqual(['AH', 'B', 'AW', 'T']);
    });

    it('should filter tokens starting with # from phoneme list', () => {
        // The filter strips tokens that start with '#' — in real cmudict
        // the '#' is a standalone token marking the start of a comment.
        // Subsequent words slip through but are harmless since real comments
        // don't contain valid ARPAbet codes.
        const text = 'TEST  T EH1 S T #comment';
        const dict = parseCMUDict(text);
        expect(dict.get('test')).toEqual(['T', 'EH', 'S', 'T']);
    });

    it('should lowercase the word', () => {
        const text = 'HELLO  HH AH0 L OW1';
        const dict = parseCMUDict(text);
        expect(dict.has('hello')).toBe(true);
        expect(dict.has('HELLO')).toBe(false);
    });

    it('should handle empty input', () => {
        const dict = parseCMUDict('');
        expect(dict.size).toBe(0);
    });

    it('should handle lines with only whitespace', () => {
        const text = '   \n\nHELLO  HH AH0 L OW1\n   ';
        const dict = parseCMUDict(text);
        expect(dict.size).toBe(1);
    });

    it('should skip lines with only a word and no phonemes', () => {
        const text = 'LONELY';
        const dict = parseCMUDict(text);
        expect(dict.size).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// wordfreq-en-25000 Parsing
// ---------------------------------------------------------------------------

describe('parseFrequencyList', () => {
    it('should parse the JSON array format', () => {
        const json = JSON.stringify([
            ['the', -2.83],
            ['of', -3.57],
            ['hello', -6.35],
        ]);
        const words = parseFrequencyList(json);
        expect(words).toEqual(['the', 'of', 'hello']);
    });

    it('should lowercase all words', () => {
        const json = JSON.stringify([['Hello', -5.0], ['WORLD', -6.0]]);
        const words = parseFrequencyList(json);
        expect(words).toEqual(['hello', 'world']);
    });

    it('should filter out entries starting with non-alpha characters', () => {
        const json = JSON.stringify([
            ['the', -2.83],
            ['00', -4.93],     // numeric
            ['1', -6.86],      // numeric
            ['hello', -6.35],
        ]);
        const words = parseFrequencyList(json);
        expect(words).toEqual(['the', 'hello']);
    });

    it('should preserve order (already sorted by frequency)', () => {
        const json = JSON.stringify([
            ['the', -2.83],
            ['and', -3.66],
            ['is', -4.47],
        ]);
        const words = parseFrequencyList(json);
        expect(words[0]).toBe('the');
        expect(words[1]).toBe('and');
        expect(words[2]).toBe('is');
    });

    it('should handle empty array', () => {
        const words = parseFrequencyList('[]');
        expect(words).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// Dictionary Slicing
// ---------------------------------------------------------------------------

describe('sliceDict', () => {
    const cmuDict = new Map<string, string[]>([
        ['the', ['DH', 'AH']],
        ['hello', ['HH', 'AH', 'L', 'OW']],
        ['world', ['W', 'ER', 'L', 'D']],
        ['cat', ['K', 'AE', 'T']],
        ['dog', ['D', 'AO', 'G']],
        ['fish', ['F', 'IH', 'SH']],
    ]);

    const frequencyWords = ['the', 'hello', 'world', 'cat', 'dog', 'fish'];

    it('should return full dict when size is "full"', () => {
        const sliced = sliceDict(cmuDict, frequencyWords, 'full');
        expect(Object.keys(sliced)).toHaveLength(6);
    });

    it('should slice to the requested size', () => {
        const sliced = sliceDict(cmuDict, frequencyWords, 3);
        expect(Object.keys(sliced)).toHaveLength(3);
        expect(sliced['the']).toBeDefined();
        expect(sliced['hello']).toBeDefined();
        expect(sliced['world']).toBeDefined();
        expect(sliced['cat']).toBeUndefined();
    });

    it('should respect frequency order', () => {
        const sliced = sliceDict(cmuDict, frequencyWords, 2);
        const words = Object.keys(sliced);
        expect(words).toContain('the');
        expect(words).toContain('hello');
        expect(words).not.toContain('world');
    });

    it('should skip frequency words not in the CMU dict', () => {
        const freqWithUnknown = ['unknown', 'the', 'xyz', 'hello'];
        const sliced = sliceDict(cmuDict, freqWithUnknown, 2);
        expect(Object.keys(sliced)).toHaveLength(2);
        expect(sliced['the']).toBeDefined();
        expect(sliced['hello']).toBeDefined();
    });

    it('should handle size larger than available words', () => {
        const sliced = sliceDict(cmuDict, frequencyWords, 100);
        expect(Object.keys(sliced)).toHaveLength(6); // all available
    });

    it('should handle empty CMU dict', () => {
        const sliced = sliceDict(new Map(), frequencyWords, 5);
        expect(Object.keys(sliced)).toHaveLength(0);
    });

    it('should handle empty frequency list', () => {
        const sliced = sliceDict(cmuDict, [], 5);
        expect(Object.keys(sliced)).toHaveLength(0);
    });

    it('should handle size of 0', () => {
        const sliced = sliceDict(cmuDict, frequencyWords, 0);
        expect(Object.keys(sliced)).toHaveLength(0);
    });
});
