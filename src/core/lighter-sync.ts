/**
 * @module lighter-sync
 * Main orchestrator — ties the three core modules together.
 *
 * Usage:
 * ```ts
 * import { LighterSync } from 'lighter-sync';
 * import dictSmall from 'lighter-sync/data/dict-small.json';
 *
 * const sync = new LighterSync({ dictionary: dictSmall });
 *
 * // Analyse audio + script → prepare keyframes
 * await sync.prepare(audioBuffer, "Hello world, how are you?");
 *
 * // Option A: manual polling
 * const frame = sync.getFrame(audioElement.currentTime);
 *
 * // Option B: automatic playback with callback
 * const stop = sync.play(audioElement, (frame) => {
 *   myRenderer.update(frame);
 * });
 * ```
 */

import type {
    DictionaryData,
    Keyframe,
    LighterSyncOptions,
    VisemeFrame,
    VisemeMode,
    PhoneticToken,
} from './types.js';

import { PhoneticEstimator } from './phonetic-estimator.js';
import { AmplitudeAligner } from './amplitude-aligner.js';
import { PlaybackDriver } from './playback-driver.js';

// ---------------------------------------------------------------------------
// LighterSync
// ---------------------------------------------------------------------------

export class LighterSync {
    private readonly estimator: PhoneticEstimator;
    private readonly aligner: AmplitudeAligner;
    private driver: PlaybackDriver | null = null;

    /**
     * Create a new LighterSync instance.
     *
     * @param options.dictionary - Optional CMU dict JSON for better phoneme accuracy.
     * @param options.alignment  - Tuning for amplitude analysis (chunk size, VAD, etc.)
     */
    constructor(options?: LighterSyncOptions) {
        const mode: VisemeMode = options?.mode ?? 'simple';
        this.estimator = new PhoneticEstimator(options?.dictionary, mode);
        this.aligner = new AmplitudeAligner(options?.alignment);
    }

    // -------------------------------------------------------------------------
    // Analysis
    // -------------------------------------------------------------------------

    /**
     * Analyse audio and script to prepare lip-sync keyframes.
     * Must be called before getFrame() or play().
     *
     * Processing runs in an OfflineAudioContext internally so it completes
     * in milliseconds, not real-time.
     *
     * @param audio  - Decoded AudioBuffer (from Web Audio API)
     * @param script - Plaintext of what is being spoken
     * @returns The generated keyframes (also stored internally)
     */
    async prepare(audio: AudioBuffer, script: string): Promise<Keyframe[]> {
        // Stage 1: Text → Phonetic tokens
        const tokens = this.estimator.estimate(script);

        // Stage 2: Audio + tokens → timed keyframes
        const keyframes = await this.aligner.align(audio, tokens);

        // Stage 3: Create playback driver
        this.driver = new PlaybackDriver(keyframes);

        return keyframes;
    }

    /**
     * Prepare from pre-computed keyframes (useful for caching /
     * serialising analysis results).
     */
    loadKeyframes(keyframes: Keyframe[]): void {
        this.driver = new PlaybackDriver(keyframes);
    }

    // -------------------------------------------------------------------------
    // Playback
    // -------------------------------------------------------------------------

    /**
     * Get the interpolated viseme frame for a given timestamp.
     * Call this on every requestAnimationFrame tick.
     *
     * @throws Error if prepare() hasn't been called yet.
     */
    getFrame(currentTime: number): VisemeFrame {
        if (!this.driver) {
            throw new Error(
                'LighterSync: call prepare() or loadKeyframes() before getFrame()',
            );
        }
        return this.driver.getFrame(currentTime);
    }

    /**
     * Hook into an <audio> element for automatic frame-synced playback.
     *
     * @param audioElement - The HTML audio element to sync with.
     * @param onFrame      - Called on each animation frame with interpolated data.
     * @returns Stop function — call to disconnect the animation loop.
     * @throws Error if prepare() hasn't been called yet.
     */
    play(
        audioElement: HTMLAudioElement,
        onFrame: (frame: VisemeFrame) => void,
    ): () => void {
        if (!this.driver) {
            throw new Error(
                'LighterSync: call prepare() or loadKeyframes() before play()',
            );
        }
        return this.driver.play(audioElement, onFrame);
    }

    /**
     * Stop any active playback animation loop.
     */
    stop(): void {
        this.driver?.stop();
    }

    // -------------------------------------------------------------------------
    // Utilities
    // -------------------------------------------------------------------------

    /**
     * Run only the phonetic estimation stage (useful for debugging or
     * building custom pipelines).
     */
    estimatePhonetics(script: string): PhoneticToken[] {
        return this.estimator.estimate(script);
    }

    /**
     * Get total duration of the prepared keyframe sequence.
     */
    get duration(): number {
        return this.driver?.duration ?? 0;
    }

    /**
     * Get the raw keyframes (for serialisation / caching).
     */
    get keyframes(): ReadonlyArray<Keyframe> {
        return this.driver?.frames ?? [];
    }

    /**
     * Whether the instance has been prepared with audio data.
     */
    get isPrepared(): boolean {
        return this.driver !== null;
    }
}
