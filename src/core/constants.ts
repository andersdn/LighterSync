/**
 * @module constants
 * Viseme definitions and phoneme-to-viseme mappings.
 *
 * These tables are the core "cheat sheet" from the LighterSync specification.
 * They translate speech sounds into normalised animation parameters.
 */

import type { VisemeCategory, VisemeParams } from './types.js';

// ---------------------------------------------------------------------------
// Full Viseme Entry (22-viseme set)
// ---------------------------------------------------------------------------

/** A single entry in the full 22-viseme table. */
export interface FullVisemeEntry {
    /** Numeric viseme ID (0–21) */
    id: number;
    /** Human-readable label */
    label: string;
    /** IPA phonemes this viseme represents */
    ipa: string;
    /** Vertical mouth opening */
    aperture: number;
    /** Horizontal mouth stretch */
    width: number;
    /** Natural duration weight */
    weight: number;
    /** Corresponding simple category */
    simpleCategory: VisemeCategory;
}

// ---------------------------------------------------------------------------
// Viseme Category Definitions
// ---------------------------------------------------------------------------

/**
 * Shape parameters for each viseme category.
 * Values are taken directly from the spec's viseme dictionary table.
 */
export const VISEME_PARAMS: Readonly<Record<VisemeCategory, VisemeParams>> = {
    CLOSED: { aperture: 0.0, width: 0.5, weight: 0.6 },
    DENTAL: { aperture: 0.2, width: 0.6, weight: 0.8 },
    OPEN: { aperture: 1.0, width: 0.8, weight: 1.2 },
    ROUND: { aperture: 0.7, width: 0.3, weight: 1.3 },
    FRICATIVE: { aperture: 0.1, width: 0.5, weight: 0.9 },
    SILENT: { aperture: 0.0, width: 0.5, weight: 0.0 },
};

// ---------------------------------------------------------------------------
// ARPAbet → Viseme Mapping
// ---------------------------------------------------------------------------

/**
 * Maps all 39 ARPAbet phoneme codes to one of the five viseme categories
 * (plus SILENT). This table is used when the Phonetic Estimator has access
 * to a CMU dictionary lookup.
 *
 * Stress markers (0, 1, 2) are stripped before lookup, so only the base
 * phoneme code is stored here.
 *
 * Reference: https://en.wikipedia.org/wiki/ARPABET
 */
export const ARPABET_TO_VISEME: Readonly<Record<string, VisemeCategory>> = {
    // --- Closed (bilabial stops & nasals) ---
    P: 'CLOSED',
    B: 'CLOSED',
    M: 'CLOSED',

    // --- Dental / alveolar ---
    T: 'DENTAL',
    D: 'DENTAL',
    N: 'DENTAL',
    S: 'DENTAL',
    Z: 'DENTAL',
    L: 'DENTAL',
    DH: 'DENTAL',  // "the"
    TH: 'DENTAL',  // "think"
    NG: 'DENTAL',  // "sing"
    CH: 'DENTAL',  // "church"
    JH: 'DENTAL',  // "judge"
    SH: 'DENTAL',  // "she"
    ZH: 'DENTAL',  // "measure"
    Y: 'DENTAL',  // "yes"

    // --- Open (vowels & wide-mouth sounds) ---
    AA: 'OPEN',    // "father"
    AE: 'OPEN',    // "cat"
    AH: 'OPEN',    // "but"
    AO: 'OPEN',    // "dog" (General American)
    EH: 'OPEN',    // "bed"
    ER: 'OPEN',    // "bird"
    EY: 'OPEN',    // "say"
    IH: 'OPEN',    // "sit"
    IY: 'OPEN',    // "see"
    AY: 'OPEN',    // "my"
    AW: 'OPEN',    // "how" (starts open)
    HH: 'OPEN',    // "he" (jaw opens for aspiration)
    R: 'OPEN',    // visual: jaw slightly open

    // --- Round (lip-rounding vowels & glides) ---
    OW: 'ROUND',   // "go"
    UH: 'ROUND',   // "book"
    UW: 'ROUND',   // "food"
    OY: 'ROUND',   // "boy"
    W: 'ROUND',   // "we"

    // --- Fricative (labiodental) ---
    F: 'FRICATIVE',
    V: 'FRICATIVE',

    // --- Velar stops → visually close to CLOSED ---
    K: 'CLOSED',
    G: 'CLOSED',
};

// ---------------------------------------------------------------------------
// Character-Level Fallback Mapping
// ---------------------------------------------------------------------------

/**
 * Simple character → viseme mapping used as the zero-dependency fallback
 * when no dictionary is loaded and a word isn't covered by digraph rules.
 *
 * This is intentionally coarse — it gets you "good enough" lip movement
 * for any English text without any external data.
 */
export const CHAR_TO_VISEME: Readonly<Record<string, VisemeCategory>> = {
    // Vowels → OPEN
    a: 'OPEN',
    e: 'OPEN',
    i: 'OPEN',
    // Rounded vowels → ROUND
    o: 'ROUND',
    u: 'ROUND',
    w: 'ROUND',
    // Labiodental → FRICATIVE
    f: 'FRICATIVE',
    v: 'FRICATIVE',
    // Bilabial → CLOSED
    p: 'CLOSED',
    b: 'CLOSED',
    m: 'CLOSED',
    k: 'CLOSED',
    g: 'CLOSED',
    // Everything else → DENTAL
    t: 'DENTAL',
    d: 'DENTAL',
    n: 'DENTAL',
    s: 'DENTAL',
    z: 'DENTAL',
    l: 'DENTAL',
    r: 'OPEN',
    h: 'OPEN',
    c: 'DENTAL',
    j: 'DENTAL',
    q: 'CLOSED',
    x: 'DENTAL',
    y: 'DENTAL',
};

/**
 * Common English digraphs/trigraphs mapped to viseme sequences.
 * Checked before falling back to single-character mapping.
 * Order matters: longer patterns are checked first.
 */
export const DIGRAPH_TO_VISEME: ReadonlyArray<[string, VisemeCategory[]]> = [
    // Trigraphs
    ['tch', ['DENTAL']],
    ['igh', ['OPEN']],

    // Digraphs — consonant clusters
    ['th', ['DENTAL']],
    ['sh', ['DENTAL']],
    ['ch', ['DENTAL']],
    ['ph', ['FRICATIVE']],
    ['wh', ['ROUND']],
    ['ng', ['DENTAL']],
    ['ck', ['CLOSED']],
    ['gh', ['OPEN']],     // usually silent or /f/

    // Digraphs — vowel combinations
    ['oo', ['ROUND']],
    ['ou', ['ROUND']],
    ['ow', ['ROUND']],
    ['oi', ['ROUND']],
    ['oy', ['ROUND']],
    ['ea', ['OPEN']],
    ['ee', ['OPEN']],
    ['ai', ['OPEN']],
    ['ay', ['OPEN']],
    ['ei', ['OPEN']],
    ['ey', ['OPEN']],
    ['ie', ['OPEN']],
];

// ---------------------------------------------------------------------------
// Default Configuration
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Full 22-Viseme Table
// ---------------------------------------------------------------------------

/**
 * The full 22-viseme set, compatible with Azure Speech / Oculus / standard
 * animation blend-shape conventions.
 *
 * Each entry has its own aperture/width pair for fine-grained control.
 * When mode is 'full', these values drive the animation instead of the
 * coarser 5-category values.
 */
export const FULL_VISEME_TABLE: ReadonlyArray<FullVisemeEntry> = [
    { id: 0, label: 'Silence', ipa: '—', aperture: 0.00, width: 0.50, weight: 0.0, simpleCategory: 'SILENT' },
    { id: 1, label: 'ae/schwa', ipa: 'æ, ə, ʌ', aperture: 0.80, width: 0.70, weight: 1.1, simpleCategory: 'OPEN' },
    { id: 2, label: 'aa', ipa: 'ɑ', aperture: 1.00, width: 0.80, weight: 1.2, simpleCategory: 'OPEN' },
    { id: 3, label: 'ao', ipa: 'ɔ', aperture: 0.80, width: 0.40, weight: 1.3, simpleCategory: 'ROUND' },
    { id: 4, label: 'eh/uh', ipa: 'ɛ, ʊ', aperture: 0.50, width: 0.60, weight: 1.0, simpleCategory: 'OPEN' },
    { id: 5, label: 'er', ipa: 'ɝ', aperture: 0.40, width: 0.50, weight: 1.1, simpleCategory: 'OPEN' },
    { id: 6, label: 'y/iy/ih', ipa: 'j, i, ɪ', aperture: 0.30, width: 0.90, weight: 1.0, simpleCategory: 'OPEN' },
    { id: 7, label: 'w/uw', ipa: 'w, u', aperture: 0.50, width: 0.20, weight: 1.3, simpleCategory: 'ROUND' },
    { id: 8, label: 'ow', ipa: 'o', aperture: 0.70, width: 0.30, weight: 1.3, simpleCategory: 'ROUND' },
    { id: 9, label: 'ay', ipa: 'aɪ', aperture: 0.90, width: 0.75, weight: 1.4, simpleCategory: 'OPEN' },
    { id: 10, label: 'oy', ipa: 'ɔɪ', aperture: 0.80, width: 0.40, weight: 1.4, simpleCategory: 'ROUND' },
    { id: 11, label: 'aw', ipa: 'aʊ', aperture: 0.90, width: 0.70, weight: 1.4, simpleCategory: 'OPEN' },
    { id: 12, label: 'h', ipa: 'h', aperture: 0.60, width: 0.70, weight: 0.7, simpleCategory: 'OPEN' },
    { id: 13, label: 'r', ipa: 'ɹ', aperture: 0.30, width: 0.40, weight: 0.9, simpleCategory: 'OPEN' },
    { id: 14, label: 'l', ipa: 'l', aperture: 0.20, width: 0.60, weight: 0.8, simpleCategory: 'DENTAL' },
    { id: 15, label: 's/z', ipa: 's, z', aperture: 0.10, width: 0.60, weight: 0.8, simpleCategory: 'DENTAL' },
    { id: 16, label: 'sh/ch/j/zh', ipa: 'ʃ, tʃ, dʒ, ʒ', aperture: 0.15, width: 0.40, weight: 0.9, simpleCategory: 'DENTAL' },
    { id: 17, label: 'dh', ipa: 'ð', aperture: 0.15, width: 0.50, weight: 0.8, simpleCategory: 'DENTAL' },
    { id: 18, label: 'f/v', ipa: 'f, v', aperture: 0.10, width: 0.50, weight: 0.9, simpleCategory: 'FRICATIVE' },
    { id: 19, label: 'd/t/n/th', ipa: 'd, t, n, θ', aperture: 0.20, width: 0.60, weight: 0.8, simpleCategory: 'DENTAL' },
    { id: 20, label: 'k/g/ng', ipa: 'k, g, ŋ', aperture: 0.05, width: 0.50, weight: 0.6, simpleCategory: 'CLOSED' },
    { id: 21, label: 'p/b/m', ipa: 'p, b, m', aperture: 0.00, width: 0.50, weight: 0.6, simpleCategory: 'CLOSED' },
];

// ---------------------------------------------------------------------------
// ARPAbet → Full Viseme ID Mapping
// ---------------------------------------------------------------------------

/**
 * Maps ARPAbet phonemes to the full 22-viseme numeric IDs.
 * Used alongside ARPABET_TO_VISEME (simple) for dual-mode output.
 */
export const ARPABET_TO_FULL_VISEME: Readonly<Record<string, number>> = {
    // Vowels
    AE: 1,   // æ
    AH: 1,   // ə, ʌ
    AA: 2,   // ɑ
    AO: 3,   // ɔ
    EH: 4,   // ɛ
    UH: 4,   // ʊ
    ER: 5,   // ɝ
    IY: 6,   // i
    IH: 6,   // ɪ
    UW: 7,   // u
    OW: 8,   // o
    AY: 9,   // aɪ diphthong
    EY: 6,   // eɪ → maps to y/iy/ih (wide mouth)
    OY: 10,  // ɔɪ diphthong
    AW: 11,  // aʊ diphthong

    // Consonants
    HH: 12,  // h
    R: 13,  // ɹ
    L: 14,  // l
    S: 15,  // s
    Z: 15,  // z
    SH: 16,  // ʃ
    CH: 16,  // tʃ
    JH: 16,  // dʒ
    ZH: 16,  // ʒ
    DH: 17,  // ð
    TH: 19,  // θ (grouped with d, t, n)
    F: 18,  // f
    V: 18,  // v
    D: 19,  // d
    T: 19,  // t
    N: 19,  // n
    K: 20,  // k
    G: 20,  // g
    NG: 20,  // ŋ
    P: 21,  // p
    B: 21,  // b
    M: 21,  // m

    // Glides → match their vowel partner
    W: 7,   // w → same as u
    Y: 6,   // j → same as i
};

/**
 * Character-level fallback → full viseme IDs.
 * Used when no dictionary is available and digraph rules don't match.
 */
export const CHAR_TO_FULL_VISEME: Readonly<Record<string, number>> = {
    a: 2, e: 4, i: 6, o: 8, u: 7,
    p: 21, b: 21, m: 21,
    t: 19, d: 19, n: 19,
    k: 20, g: 20,
    s: 15, z: 15, c: 15,
    f: 18, v: 18,
    l: 14, r: 13, h: 12,
    w: 7, y: 6, j: 16, q: 20, x: 15,
};

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/** Default chunk size for amplitude analysis (milliseconds). */
export const DEFAULT_CHUNK_MS = 20;

/** Default VAD threshold — fraction of peak RMS. */
export const DEFAULT_VAD_THRESHOLD = 0.1;

/** Default minimum silence gap for segment splitting (milliseconds). */
export const DEFAULT_MIN_SILENCE_MS = 150;
