/**
 * @module types
 * Core type definitions for LighterSync.
 *
 * These types define the data structures flowing through the three-stage
 * pipeline: Phonetic Estimation → Amplitude Alignment → Playback.
 *
 * In addition to mouth-shape visemes, the library produces a small set of
 * facial "expression" channels (eyebrow raise, squint, blink) derived from
 * audio amplitude and timing heuristics — a lightweight alternative to
 * full blend-shape rigs.
 */

// ---------------------------------------------------------------------------
// Viseme Mode & Categories
// ---------------------------------------------------------------------------

/**
 * Controls the resolution of viseme output.
 *
 * - `'simple'` — 5 mouth-shape categories (CLOSED, DENTAL, OPEN, ROUND, FRICATIVE).
 *   Good for basic avatars with minimal animation states.
 *
 * - `'full'` — 22 distinct viseme IDs (0–21) matching the standard set used by
 *   Azure Speech, Oculus, and animation tools. Each has its own aperture/width
 *   values for fine-grained mouth shapes.
 *
 * Both modes always populate `visemeId` (simple category) AND `fullVisemeId`
 * (numeric 0–21). The mode only controls which aperture/width values drive
 * the output.
 */
export type VisemeMode = 'simple' | 'full';

/**
 * The five mouth-shape categories used by LighterSync, plus SILENT for pauses.
 *
 * Each maps to a distinct (aperture, width) pair that drives animation:
 * - CLOSED:    lips together (p, b, m)
 * - DENTAL:    tongue-tip / sibilant (t, d, n, s, z)
 * - OPEN:      jaw open / vowels (a, e, i, ah)
 * - ROUND:     pursed lips (o, u, w)
 * - FRICATIVE: teeth-on-lip (f, v)
 * - SILENT:    rest position / pause
 */
export type VisemeCategory =
    | 'CLOSED'
    | 'DENTAL'
    | 'OPEN'
    | 'ROUND'
    | 'FRICATIVE'
    | 'SILENT';

/**
 * Shape parameters for a single viseme category.
 * All values are normalised 0.0–1.0 (except weight which can exceed 1.0).
 */
export interface VisemeParams {
    /** Vertical opening (0 = closed, 1 = fully open) */
    aperture: number;
    /** Horizontal stretch (0 = narrow/round, 1 = wide/smile) */
    width: number;
    /** Natural duration weight — longer sounds > 1.0, shorter < 1.0 */
    weight: number;
}

// ---------------------------------------------------------------------------
// Facial Expressions (non-phoneme channels)
// ---------------------------------------------------------------------------

/**
 * Lightweight expression channels driven by audio amplitude and timing rules.
 * Think of these as a reduced blend-shape set — enough to make a face feel
 * alive without a full facial rig.
 *
 * All values are normalised 0.0–1.0.
 *
 * Generation rules (applied in AmplitudeAligner):
 * - eyebrowRaise: proportional to RMS when it exceeds 1.5× running average
 * - squint:       ramps up during sustained loud passages (>0.5s)
 * - blink:        inserted at silence gaps >300ms (natural blink points)
 */
export interface ExpressionParams {
    /** Eyebrow raise — peaks on emphasis / louder syllables */
    eyebrowRaise: number;
    /** Eye squint — subtle tightening on sustained loud passages */
    squint: number;
    /** Blink — 1.0 at the instant of blink, 0.0 otherwise */
    blink: number;
}

// ---------------------------------------------------------------------------
// Pipeline Data Structures
// ---------------------------------------------------------------------------

/**
 * A single viseme with its animation weight, produced by the Phonetic
 * Estimator when decomposing a word into mouth shapes.
 */
export interface WeightedViseme {
    category: VisemeCategory;
    /** Numeric viseme ID (0–21) from the full viseme set */
    fullVisemeId: number;
    aperture: number;
    width: number;
    weight: number;
}

/**
 * Represents one word decomposed into its phonemes and mapped viseme sequence.
 * Output of the Phonetic Estimator.
 */
export interface PhoneticToken {
    /** Original word (lowercased, punctuation stripped) */
    word: string;
    /** ARPAbet phoneme codes — empty if fallback was used */
    phonemes: string[];
    /** The viseme sequence this word produces */
    visemes: WeightedViseme[];
    /** Sum of all viseme weights in this token */
    totalWeight: number;
}

/**
 * A time-stamped keyframe — the final output of the analysis pipeline.
 * An ordered array of these drives the Playback Driver.
 */
export interface Keyframe {
    /** Absolute timestamp in seconds */
    timestamp: number;
    /** Duration this keyframe is active, in seconds */
    duration: number;
    /** Simple viseme category (always present) */
    visemeId: VisemeCategory;
    /** Full viseme ID 0–21 (always present) */
    fullVisemeId: number;
    /** Target aperture value (resolution depends on mode) */
    aperture: number;
    /** Target width value (resolution depends on mode) */
    width: number;
    /** Facial expression channels at this keyframe */
    expression: ExpressionParams;
}

/**
 * The interpolated output for a given moment in time.
 * This is what renderers consume on every animation frame.
 */
export interface VisemeFrame {
    /** Interpolated vertical opening */
    aperture: number;
    /** Interpolated horizontal stretch */
    width: number;
    /** Simple viseme category at this moment */
    visemeId: VisemeCategory;
    /** Full viseme ID 0–21 at this moment */
    fullVisemeId: number;
    /** Current playback timestamp in seconds */
    timestamp: number;
    /** Interpolated facial expression channels */
    expression: ExpressionParams;
}

// ---------------------------------------------------------------------------
// Voice Activity Detection
// ---------------------------------------------------------------------------

/** A continuous segment where speech is detected above the VAD threshold. */
export interface VADSegment {
    /** Start time in seconds */
    start: number;
    /** End time in seconds */
    end: number;
    /** Convenience: end − start */
    duration: number;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Dictionary data format produced by the CMU dict slicer.
 * Keys are lowercase words; values are ARPAbet phoneme arrays
 * with stress markers stripped.
 *
 * @example
 * ```json
 * {
 *   "hello": ["HH", "AH", "L", "OW"],
 *   "world": ["W", "ER", "L", "D"]
 * }
 * ```
 */
export type DictionaryData = Record<string, string[]>;

/** Configuration for the Amplitude Aligner (Module 2). */
export interface AlignmentConfig {
    /** Analysis chunk size in ms (default: 20) */
    chunkMs?: number;
    /** VAD threshold as fraction of peak RMS (default: 0.1) */
    vadThreshold?: number;
    /** Minimum silence gap in ms before splitting segments (default: 150) */
    minSilenceMs?: number;
}

/** Top-level options for the LighterSync orchestrator. */
export interface LighterSyncOptions {
    /**
     * Viseme resolution mode. Default: `'simple'`.
     *
     * - `'simple'` — 5 categories, coarser aperture/width values
     * - `'full'`   — 22 viseme IDs, fine-grained aperture/width per viseme
     *
     * Both modes always produce both `visemeId` and `fullVisemeId` on every
     * frame — the mode only controls which drives the aperture/width values.
     */
    mode?: VisemeMode;

    /**
     * Pre-loaded pronunciation dictionary.
     * Import one of the sliced JSON files:
     *   import dict from 'lighter-sync/data/dict-small.json'
     *
     * If omitted, the library falls back to its built-in character-level
     * grapheme-to-phoneme heuristic (zero-dependency, decent quality).
     */
    dictionary?: DictionaryData;

    /** Amplitude alignment tuning. */
    alignment?: AlignmentConfig;
}

// ---------------------------------------------------------------------------
// Renderer Interface
// ---------------------------------------------------------------------------

/**
 * Interface that rendering adapters must implement.
 * The core library is renderer-agnostic — Zdog, Canvas 2D, Three.js, etc.
 * each get their own adapter that consumes VisemeFrame.
 */
export interface VisemeRenderer {
    /** Called on every animation frame with the interpolated mouth shape. */
    update(frame: VisemeFrame): void;
    /** Optional cleanup. */
    destroy?(): void;
}
