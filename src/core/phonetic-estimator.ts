/**
 * @module phonetic-estimator
 * Module 1: Text → Phoneme → Weighted Viseme Sequence
 *
 * Converts a plaintext script into an ordered array of PhoneticTokens.
 * Each token represents one word decomposed into its viseme sequence.
 *
 * Resolution order:
 *   1. Dictionary lookup (CMU dict JSON, if loaded)
 *   2. Digraph-aware character-level heuristic (always available, zero deps)
 *
 * Supports two viseme modes:
 *   - 'simple': 5-category aperture/width from VISEME_PARAMS
 *   - 'full':   22-viseme aperture/width from FULL_VISEME_TABLE
 *
 * Both modes always populate both `category` and `fullVisemeId` on every
 * viseme — the mode only affects which aperture/width values are used.
 */

import type {
    DictionaryData,
    PhoneticToken,
    VisemeCategory,
    VisemeMode,
    WeightedViseme,
} from './types.js';

import {
    ARPABET_TO_VISEME,
    ARPABET_TO_FULL_VISEME,
    CHAR_TO_VISEME,
    CHAR_TO_FULL_VISEME,
    DIGRAPH_TO_VISEME,
    FULL_VISEME_TABLE,
    VISEME_PARAMS,
} from './constants.js';

// ---------------------------------------------------------------------------
// PhoneticEstimator
// ---------------------------------------------------------------------------

export class PhoneticEstimator {
    private readonly dict: DictionaryData | null;
    private readonly mode: VisemeMode;

    /**
     * @param dictionary - Optional CMU dict slice (from dict-small/medium/full.json).
     * @param mode       - 'simple' (5-category) or 'full' (22-viseme). Default: 'simple'.
     */
    constructor(dictionary?: DictionaryData, mode: VisemeMode = 'simple') {
        this.dict = dictionary ?? null;
        this.mode = mode;
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    /**
     * Decompose a script string into an ordered array of PhoneticTokens.
     *
     * @param text - The plaintext script to analyse.
     * @returns Ordered token array — one per word, in script order.
     */
    estimate(text: string): PhoneticToken[] {
        const words = this.tokenise(text);
        return words.map((word) => this.processWord(word));
    }

    // -------------------------------------------------------------------------
    // Internals
    // -------------------------------------------------------------------------

    /**
     * Strip punctuation, lowercase, and split into words.
     * Preserves apostrophes within words (e.g. "don't").
     */
    private tokenise(text: string): string[] {
        return text
            .toLowerCase()
            .replace(/[^\w\s']/g, '') // strip punctuation except apostrophe
            .split(/\s+/)
            .filter((w) => w.length > 0);
    }

    /**
     * Process a single word: dictionary lookup first, then fallback.
     */
    private processWord(word: string): PhoneticToken {
        const phonemes = this.lookupWord(word);

        if (phonemes) {
            const visemes = this.phonemesToVisemes(phonemes);
            return {
                word,
                phonemes,
                visemes,
                totalWeight: visemes.reduce((sum, v) => sum + v.weight, 0),
            };
        }

        const visemes = this.fallbackG2P(word);
        return {
            word,
            phonemes: [],
            visemes,
            totalWeight: visemes.reduce((sum, v) => sum + v.weight, 0),
        };
    }

    private lookupWord(word: string): string[] | null {
        if (!this.dict) return null;
        return this.dict[word] ?? null;
    }

    /**
     * Convert ARPAbet phoneme codes to a weighted viseme sequence.
     * Produces both simple category and full viseme ID.
     * Aperture/width values depend on the active mode.
     */
    private phonemesToVisemes(phonemes: string[]): WeightedViseme[] {
        return phonemes.map((phoneme) => {
            const clean = phoneme.replace(/[012]/g, '');
            const category: VisemeCategory = ARPABET_TO_VISEME[clean] ?? 'CLOSED';
            const fullId = ARPABET_TO_FULL_VISEME[clean] ?? 21;

            if (this.mode === 'full') {
                const entry = FULL_VISEME_TABLE[fullId];
                return {
                    category,
                    fullVisemeId: fullId,
                    aperture: entry.aperture,
                    width: entry.width,
                    weight: entry.weight,
                };
            }

            const params = VISEME_PARAMS[category];
            return {
                category,
                fullVisemeId: fullId,
                aperture: params.aperture,
                width: params.width,
                weight: params.weight,
            };
        });
    }

    /**
     * Character-level G2P with digraph awareness.
     * Produces both simple category and full viseme ID.
     */
    private fallbackG2P(word: string): WeightedViseme[] {
        const visemes: WeightedViseme[] = [];
        let i = 0;

        while (i < word.length) {
            let matched = false;

            for (const [pattern, categories] of DIGRAPH_TO_VISEME) {
                if (word.substring(i, i + pattern.length) === pattern) {
                    for (const category of categories) {
                        const fullId = CHAR_TO_FULL_VISEME[pattern[0]] ?? 21;

                        if (this.mode === 'full') {
                            const entry = FULL_VISEME_TABLE[fullId];
                            visemes.push({
                                category,
                                fullVisemeId: fullId,
                                aperture: entry.aperture,
                                width: entry.width,
                                weight: entry.weight,
                            });
                        } else {
                            const params = VISEME_PARAMS[category];
                            visemes.push({
                                category,
                                fullVisemeId: fullId,
                                aperture: params.aperture,
                                width: params.width,
                                weight: params.weight,
                            });
                        }
                    }
                    i += pattern.length;
                    matched = true;
                    break;
                }
            }

            if (!matched) {
                const char = word[i];
                const category: VisemeCategory = CHAR_TO_VISEME[char] ?? 'DENTAL';
                const fullId = CHAR_TO_FULL_VISEME[char] ?? 19;

                if (this.mode === 'full') {
                    const entry = FULL_VISEME_TABLE[fullId];
                    visemes.push({
                        category,
                        fullVisemeId: fullId,
                        aperture: entry.aperture,
                        width: entry.width,
                        weight: entry.weight,
                    });
                } else {
                    const params = VISEME_PARAMS[category];
                    visemes.push({
                        category,
                        fullVisemeId: fullId,
                        aperture: params.aperture,
                        width: params.width,
                        weight: params.weight,
                    });
                }
                i++;
            }
        }

        return visemes;
    }
}
