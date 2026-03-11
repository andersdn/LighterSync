/**
 * @module playback-driver
 * Module 3: Keyframe Array → Interpolated VisemeFrame
 *
 * Given an array of time-stamped Keyframes (from the Amplitude Aligner),
 * the PlaybackDriver provides a `getFrame(currentTime)` method that
 * returns a smoothly interpolated VisemeFrame on every animation tick.
 *
 * Features:
 *   - Binary search for O(log n) keyframe lookup
 *   - Linear interpolation (lerp) between adjacent keyframes
 *   - Expression channel interpolation
 *   - Optional `play()` helper that hooks into an <audio> element
 *     and drives a callback via requestAnimationFrame
 */

import type { ExpressionParams, Keyframe, VisemeFrame } from './types.js';
import { VISEME_PARAMS } from './constants.js';

// ---------------------------------------------------------------------------
// PlaybackDriver
// ---------------------------------------------------------------------------

export class PlaybackDriver {
    private readonly keyframes: Keyframe[];
    private animationFrameId: number | null = null;
    private isPlaying = false;

    /**
     * @param keyframes - Sorted keyframe array from AmplitudeAligner.align()
     */
    constructor(keyframes: Keyframe[]) {
        this.keyframes = keyframes;
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    /**
     * Get the interpolated viseme frame for a given timestamp.
     * This is the main method renderers call on every animation tick.
     *
     * @param currentTime - Playback position in seconds (e.g. from audio.currentTime)
     * @returns Smoothly interpolated VisemeFrame
     *
     * @example
     * ```ts
     * function animate() {
     *   const frame = driver.getFrame(audioElement.currentTime);
     *   renderer.update(frame);
     *   requestAnimationFrame(animate);
     * }
     * ```
     */
    getFrame(currentTime: number): VisemeFrame {
        if (this.keyframes.length === 0) {
            return this.silentFrame(currentTime);
        }

        const index = this.binarySearch(currentTime);

        // Before first keyframe
        if (index < 0) {
            return this.silentFrame(currentTime);
        }

        // At or past the last keyframe
        if (index >= this.keyframes.length - 1) {
            const last = this.keyframes[this.keyframes.length - 1];
            const endTime = last.timestamp + last.duration;

            if (currentTime >= endTime) {
                return this.silentFrame(currentTime);
            }

            return {
                aperture: last.aperture,
                width: last.width,
                visemeId: last.visemeId,
                fullVisemeId: last.fullVisemeId,
                timestamp: currentTime,
                expression: { ...last.expression },
            };
        }

        // Interpolate between current and next keyframe
        const current = this.keyframes[index];
        const next = this.keyframes[index + 1];

        // Calculate interpolation factor within the current keyframe's duration
        const elapsed = currentTime - current.timestamp;
        const t = current.duration > 0
            ? Math.min(1, elapsed / current.duration)
            : 0;

        // Ease-in-out for smoother transitions (smoothstep)
        const smoothT = t * t * (3 - 2 * t);

        return {
            aperture: this.lerp(current.aperture, next.aperture, smoothT),
            width: this.lerp(current.width, next.width, smoothT),
            visemeId: t < 0.5 ? current.visemeId : next.visemeId,
            fullVisemeId: t < 0.5 ? current.fullVisemeId : next.fullVisemeId,
            timestamp: currentTime,
            expression: this.lerpExpression(
                current.expression,
                next.expression,
                smoothT,
            ),
        };
    }

    /**
     * Convenience: hook into an <audio> element and drive a callback
     * with interpolated frames via requestAnimationFrame.
     *
     * @param audioElement - The HTML audio element to sync with.
     * @param onFrame      - Callback invoked on each animation frame.
     * @returns Cleanup function — call it to stop the animation loop.
     *
     * @example
     * ```ts
     * const stop = driver.play(audioEl, (frame) => {
     *   renderer.update(frame);
     * });
     * // Later...
     * stop();
     * ```
     */
    play(
        audioElement: HTMLAudioElement,
        onFrame: (frame: VisemeFrame) => void,
    ): () => void {
        this.stop();
        this.isPlaying = true;

        const tick = () => {
            if (!this.isPlaying) return;

            const frame = this.getFrame(audioElement.currentTime);
            onFrame(frame);

            if (!audioElement.paused && !audioElement.ended) {
                this.animationFrameId = requestAnimationFrame(tick);
            } else {
                // Send a final silent frame when audio stops
                onFrame(this.silentFrame(audioElement.currentTime));
                this.isPlaying = false;
            }
        };

        // Start on play event if not already playing
        if (!audioElement.paused) {
            tick();
        }

        const onPlay = () => {
            if (!this.isPlaying) {
                this.isPlaying = true;
                tick();
            }
        };

        const onPause = () => {
            // Don't fully stop — just let the rAF loop die naturally
        };

        audioElement.addEventListener('play', onPlay);
        audioElement.addEventListener('pause', onPause);

        return () => {
            this.stop();
            audioElement.removeEventListener('play', onPlay);
            audioElement.removeEventListener('pause', onPause);
        };
    }

    /**
     * Stop any active animation loop.
     */
    stop(): void {
        this.isPlaying = false;
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    /**
     * Get the total duration covered by the keyframe sequence.
     */
    get duration(): number {
        if (this.keyframes.length === 0) return 0;
        const last = this.keyframes[this.keyframes.length - 1];
        return last.timestamp + last.duration;
    }

    /**
     * Get a copy of the raw keyframes.
     */
    get frames(): ReadonlyArray<Keyframe> {
        return this.keyframes;
    }

    // -------------------------------------------------------------------------
    // Interpolation Helpers
    // -------------------------------------------------------------------------

    /**
     * Binary search for the keyframe active at `time`.
     * Returns the index of the keyframe whose timestamp ≤ time.
     * Returns -1 if time is before all keyframes.
     */
    private binarySearch(time: number): number {
        let lo = 0;
        let hi = this.keyframes.length - 1;
        let result = -1;

        while (lo <= hi) {
            const mid = (lo + hi) >>> 1;

            if (this.keyframes[mid].timestamp <= time) {
                result = mid;
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }

        return result;
    }

    /** Linear interpolation. */
    private lerp(a: number, b: number, t: number): number {
        return a + (b - a) * t;
    }

    /** Interpolate expression channels. */
    private lerpExpression(
        a: ExpressionParams,
        b: ExpressionParams,
        t: number,
    ): ExpressionParams {
        return {
            eyebrowRaise: this.lerp(a.eyebrowRaise, b.eyebrowRaise, t),
            squint: this.lerp(a.squint, b.squint, t),
            blink: this.lerp(a.blink, b.blink, t),
        };
    }

    /** Produce a silent/rest frame. */
    private silentFrame(timestamp: number): VisemeFrame {
        const silent = VISEME_PARAMS['SILENT'];
        return {
            aperture: silent.aperture,
            width: silent.width,
            visemeId: 'SILENT' as const,
            fullVisemeId: 0,
            timestamp,
            expression: { eyebrowRaise: 0, squint: 0, blink: 0 },
        };
    }
}
