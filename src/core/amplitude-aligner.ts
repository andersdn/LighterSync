/**
 * @module amplitude-aligner
 * Module 2: AudioBuffer → Time-Stamped Keyframes
 *
 * Takes the output of the Phonetic Estimator (PhoneticToken[]) and an
 * AudioBuffer, then produces an array of time-stamped Keyframes by:
 *
 *   1. Dividing the audio into small chunks (default 20ms)
 *   2. Calculating RMS amplitude per chunk
 *   3. Running Voice Activity Detection (VAD) to find speech segments
 *   4. Distributing the weighted viseme sequence across the speaking time
 *   5. Generating facial expression channels from amplitude heuristics
 *
 * The analysis runs in an OfflineAudioContext for near-instant processing.
 */

import type {
    AlignmentConfig,
    ExpressionParams,
    Keyframe,
    PhoneticToken,
    VADSegment,
    WeightedViseme,
} from './types.js';

import {
    DEFAULT_CHUNK_MS,
    DEFAULT_MIN_SILENCE_MS,
    DEFAULT_VAD_THRESHOLD,
    VISEME_PARAMS,
} from './constants.js';

// ---------------------------------------------------------------------------
// AmplitudeAligner
// ---------------------------------------------------------------------------

export class AmplitudeAligner {
    private readonly chunkMs: number;
    private readonly vadThreshold: number;
    private readonly minSilenceMs: number;

    constructor(config?: AlignmentConfig) {
        this.chunkMs = config?.chunkMs ?? DEFAULT_CHUNK_MS;
        this.vadThreshold = config?.vadThreshold ?? DEFAULT_VAD_THRESHOLD;
        this.minSilenceMs = config?.minSilenceMs ?? DEFAULT_MIN_SILENCE_MS;
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    /**
     * Align phonetic tokens to an audio buffer, producing timed keyframes
     * with both mouth-shape visemes and facial expression data.
     *
     * @param audioBuffer - The decoded audio to analyse.
     * @param tokens      - Phonetic tokens from the estimator.
     * @returns Time-stamped keyframe array, sorted chronologically.
     *
     * @example
     * ```ts
     * const aligner = new AmplitudeAligner();
     * const keyframes = await aligner.align(audioBuffer, tokens);
     * ```
     */
    async align(
        audioBuffer: AudioBuffer,
        tokens: PhoneticToken[],
    ): Promise<Keyframe[]> {
        // Step 1: Extract mono channel data
        const samples = this.extractMono(audioBuffer);

        // Step 2: Calculate RMS per chunk
        const chunkSamples = Math.floor(
            (this.chunkMs / 1000) * audioBuffer.sampleRate,
        );
        const rmsValues = this.calculateRMSValues(samples, chunkSamples);

        // Step 3: Voice Activity Detection
        const segments = this.detectVADSegments(
            rmsValues,
            chunkSamples,
            audioBuffer.sampleRate,
        );

        // Step 4: Distribute tokens across speaking segments
        const keyframes = this.distributeTokens(tokens, segments);

        // Step 5: Layer expression channels based on amplitude
        this.applyExpressions(keyframes, rmsValues, chunkSamples, audioBuffer.sampleRate);

        return keyframes;
    }

    // -------------------------------------------------------------------------
    // Audio Analysis
    // -------------------------------------------------------------------------

    /**
     * Extract a single mono channel from the audio buffer.
     * If stereo/multichannel, averages all channels.
     */
    private extractMono(buffer: AudioBuffer): Float32Array {
        if (buffer.numberOfChannels === 1) {
            return buffer.getChannelData(0);
        }

        const length = buffer.length;
        const mono = new Float32Array(length);
        const numChannels = buffer.numberOfChannels;

        for (let ch = 0; ch < numChannels; ch++) {
            const channelData = buffer.getChannelData(ch);
            for (let i = 0; i < length; i++) {
                mono[i] += channelData[i];
            }
        }

        // Average
        for (let i = 0; i < length; i++) {
            mono[i] /= numChannels;
        }

        return mono;
    }

    /**
     * Calculate RMS (Root Mean Square) amplitude for each chunk.
     * RMS gives a good approximation of perceived loudness.
     */
    private calculateRMSValues(
        samples: Float32Array,
        chunkSamples: number,
    ): number[] {
        const numChunks = Math.floor(samples.length / chunkSamples);
        const rms: number[] = new Array(numChunks);

        for (let i = 0; i < numChunks; i++) {
            const start = i * chunkSamples;
            let sumSquares = 0;

            for (let j = start; j < start + chunkSamples && j < samples.length; j++) {
                sumSquares += samples[j] * samples[j];
            }

            rms[i] = Math.sqrt(sumSquares / chunkSamples);
        }

        return rms;
    }

    /**
     * Voice Activity Detection: identify contiguous segments where the
     * audio exceeds the volume threshold.
     *
     * Adjacent segments separated by less than minSilenceMs are merged
     * to avoid choppy splitting on brief pauses.
     */
    private detectVADSegments(
        rmsValues: number[],
        chunkSamples: number,
        sampleRate: number,
    ): VADSegment[] {
        const peakRMS = Math.max(...rmsValues, 0.001); // avoid div-by-zero
        const threshold = peakRMS * this.vadThreshold;
        const chunkDuration = chunkSamples / sampleRate; // seconds per chunk
        const minSilenceChunks = Math.ceil(
            this.minSilenceMs / 1000 / chunkDuration,
        );

        const raw: VADSegment[] = [];
        let segStart = -1;

        for (let i = 0; i < rmsValues.length; i++) {
            const active = rmsValues[i] > threshold;

            if (active && segStart === -1) {
                segStart = i;
            } else if (!active && segStart !== -1) {
                // Check if the silence is long enough to split
                let silenceLength = 0;
                let j = i;
                while (j < rmsValues.length && rmsValues[j] <= threshold) {
                    silenceLength++;
                    j++;
                }

                if (silenceLength >= minSilenceChunks || j >= rmsValues.length) {
                    const start = segStart * chunkDuration;
                    const end = i * chunkDuration;
                    raw.push({ start, end, duration: end - start });
                    segStart = -1;
                }
                // Otherwise, continue the current segment through the brief pause
            }
        }

        // Close any trailing segment
        if (segStart !== -1) {
            const start = segStart * chunkDuration;
            const end = rmsValues.length * chunkDuration;
            raw.push({ start, end, duration: end - start });
        }

        return raw;
    }

    // -------------------------------------------------------------------------
    // Token Distribution
    // -------------------------------------------------------------------------

    /**
     * Distribute the weighted viseme sequence across the detected speaking
     * segments. The core formula from the spec:
     *
     *   Duration_phoneme = (Weight_phoneme / ΣWeight) × TotalSpeakingTime
     *
     * Words are spread across segments proportionally. Within each word,
     * individual visemes get time proportional to their weight.
     */
    private distributeTokens(
        tokens: PhoneticToken[],
        segments: VADSegment[],
    ): Keyframe[] {
        if (tokens.length === 0 || segments.length === 0) {
            return [];
        }

        const totalSpeakingTime = segments.reduce((sum, s) => sum + s.duration, 0);
        const totalWeight = tokens.reduce((sum, t) => sum + t.totalWeight, 0);

        if (totalWeight === 0 || totalSpeakingTime === 0) {
            return [];
        }

        // Flatten all visemes into a single ordered sequence
        const allVisemes: WeightedViseme[] = [];
        for (const token of tokens) {
            allVisemes.push(...token.visemes);
        }

        // Calculate duration for each viseme
        const visemeDurations = allVisemes.map(
            (v) => (v.weight / totalWeight) * totalSpeakingTime,
        );

        // Place visemes into segment timelines
        const keyframes: Keyframe[] = [];
        let visemeIndex = 0;
        let visemeTimeUsed = 0;

        for (const segment of segments) {
            let cursor = segment.start;

            while (cursor < segment.end && visemeIndex < allVisemes.length) {
                const viseme = allVisemes[visemeIndex];
                const totalDuration = visemeDurations[visemeIndex];
                const remaining = totalDuration - visemeTimeUsed;
                const available = segment.end - cursor;
                const duration = Math.min(remaining, available);

                if (duration > 0) {
                    keyframes.push({
                        timestamp: cursor,
                        duration,
                        visemeId: viseme.category,
                        fullVisemeId: viseme.fullVisemeId,
                        aperture: viseme.aperture,
                        width: viseme.width,
                        expression: { eyebrowRaise: 0, squint: 0, blink: 0 },
                    });
                }

                cursor += duration;
                visemeTimeUsed += duration;

                if (visemeTimeUsed >= totalDuration - 0.0001) {
                    visemeIndex++;
                    visemeTimeUsed = 0;
                }
            }

            // Insert SILENT keyframe in gaps between segments
            const nextSegment = segments[segments.indexOf(segment) + 1];
            if (nextSegment && nextSegment.start > segment.end) {
                const silenceParams = VISEME_PARAMS['SILENT'];
                keyframes.push({
                    timestamp: segment.end,
                    duration: nextSegment.start - segment.end,
                    visemeId: 'SILENT',
                    fullVisemeId: 0,
                    aperture: silenceParams.aperture,
                    width: silenceParams.width,
                    expression: { eyebrowRaise: 0, squint: 0, blink: 0 },
                });
            }
        }

        return keyframes;
    }

    // -------------------------------------------------------------------------
    // Expression Generation
    // -------------------------------------------------------------------------

    /**
     * Layer facial expression channels onto existing keyframes using
     * simple amplitude-based heuristics.
     *
     * Rules:
     *   - eyebrowRaise: proportional to how much RMS exceeds 1.5× running avg
     *   - squint:       ramps when loud passage sustained > 0.5s
     *   - blink:        triggered at silence gaps > 300ms
     *
     * These are intentionally simple — good enough to make an avatar feel
     * alive without needing any ML or blend-shape data.
     */
    private applyExpressions(
        keyframes: Keyframe[],
        rmsValues: number[],
        chunkSamples: number,
        sampleRate: number,
    ): void {
        if (keyframes.length === 0 || rmsValues.length === 0) return;

        const chunkDuration = chunkSamples / sampleRate;

        // Calculate running average RMS (simple moving window of ~500ms)
        const windowSize = Math.max(1, Math.round(0.5 / chunkDuration));
        const avgRMS = this.movingAverage(rmsValues, windowSize);
        const peakRMS = Math.max(...rmsValues, 0.001);

        // Track sustained loud passages for squint
        const sustainedLoudThreshold = peakRMS * 0.6;
        const sustainedChunks = Math.round(0.5 / chunkDuration); // 0.5s

        for (const keyframe of keyframes) {
            const chunkIndex = Math.min(
                Math.floor(keyframe.timestamp / chunkDuration),
                rmsValues.length - 1,
            );

            if (chunkIndex < 0) continue;

            // --- Eyebrow Raise ---
            // Peaks when current RMS is significantly above the local average
            const localAvg = avgRMS[chunkIndex] || 0;
            const emphasis = localAvg > 0
                ? Math.max(0, (rmsValues[chunkIndex] - localAvg * 1.5) / (peakRMS * 0.5))
                : 0;
            keyframe.expression.eyebrowRaise = Math.min(1, emphasis);

            // --- Squint ---
            // Check if we're in a sustained loud passage
            let loudCount = 0;
            for (
                let i = Math.max(0, chunkIndex - sustainedChunks);
                i <= chunkIndex;
                i++
            ) {
                if (rmsValues[i] > sustainedLoudThreshold) loudCount++;
            }
            const sustainedRatio = loudCount / sustainedChunks;
            keyframe.expression.squint = Math.min(1, sustainedRatio * 0.6);

            // --- Blink ---
            // Triggered at silence→speech transitions (start of segments)
            if (keyframe.visemeId === 'SILENT' && keyframe.duration > 0.3) {
                keyframe.expression.blink = 1.0;
            }
        }
    }

    /**
     * Simple moving average for RMS smoothing.
     */
    private movingAverage(values: number[], windowSize: number): number[] {
        const result = new Array<number>(values.length);
        let sum = 0;

        for (let i = 0; i < values.length; i++) {
            sum += values[i];
            if (i >= windowSize) {
                sum -= values[i - windowSize];
            }
            const count = Math.min(i + 1, windowSize);
            result[i] = sum / count;
        }

        return result;
    }
}
