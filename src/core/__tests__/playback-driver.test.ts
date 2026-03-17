import { describe, it, expect } from 'vitest';
import { PlaybackDriver } from '../playback-driver.js';
import type { Keyframe } from '../types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeKeyframe(overrides: Partial<Keyframe>): Keyframe {
    return {
        timestamp: 0,
        duration: 0.1,
        visemeId: 'OPEN',
        fullVisemeId: 2,
        aperture: 1.0,
        width: 0.8,
        expression: { eyebrowRaise: 0, squint: 0, blink: 0 },
        ...overrides,
    };
}

const KEYFRAMES: Keyframe[] = [
    makeKeyframe({ timestamp: 0.0, duration: 0.2, visemeId: 'CLOSED', fullVisemeId: 21, aperture: 0.0, width: 0.5 }),
    makeKeyframe({ timestamp: 0.2, duration: 0.2, visemeId: 'OPEN', fullVisemeId: 2, aperture: 1.0, width: 0.8 }),
    makeKeyframe({ timestamp: 0.4, duration: 0.2, visemeId: 'ROUND', fullVisemeId: 8, aperture: 0.7, width: 0.3 }),
    makeKeyframe({ timestamp: 0.6, duration: 0.2, visemeId: 'DENTAL', fullVisemeId: 19, aperture: 0.2, width: 0.6 }),
];

// ---------------------------------------------------------------------------
// PlaybackDriver
// ---------------------------------------------------------------------------

describe('PlaybackDriver', () => {
    describe('getFrame', () => {
        const driver = new PlaybackDriver(KEYFRAMES);

        it('should return a silent frame before the first keyframe', () => {
            const frame = driver.getFrame(-0.1);
            expect(frame.visemeId).toBe('SILENT');
            expect(frame.aperture).toBe(0.0);
        });

        it('should return a silent frame after the last keyframe ends', () => {
            const frame = driver.getFrame(1.0);
            expect(frame.visemeId).toBe('SILENT');
        });

        it('should return the first keyframe at t=0', () => {
            const frame = driver.getFrame(0.0);
            expect(frame.visemeId).toBe('CLOSED');
            expect(frame.aperture).toBeCloseTo(0.0);
        });

        it('should interpolate between keyframes at midpoint', () => {
            // At t=0.1 we're halfway through the first keyframe (0.0–0.2)
            // Interpolating from CLOSED (aperture 0.0) toward OPEN (aperture 1.0)
            const frame = driver.getFrame(0.1);
            // smoothstep(0.5) = 0.5 * 0.5 * (3 - 2*0.5) = 0.5
            expect(frame.aperture).toBeCloseTo(0.5);
        });

        it('should snap visemeId based on interpolation progress', () => {
            // At t=0.05 (25% of first keyframe), should still show CLOSED
            const earlyFrame = driver.getFrame(0.05);
            expect(earlyFrame.visemeId).toBe('CLOSED');

            // At t=0.15 (75% of first keyframe: t > 0.5), should show OPEN (next)
            const lateFrame = driver.getFrame(0.15);
            expect(lateFrame.visemeId).toBe('OPEN');
        });

        it('should interpolate expression channels', () => {
            const kfs: Keyframe[] = [
                makeKeyframe({
                    timestamp: 0, duration: 1.0,
                    expression: { eyebrowRaise: 0, squint: 0, blink: 0 },
                }),
                makeKeyframe({
                    timestamp: 1.0, duration: 1.0,
                    expression: { eyebrowRaise: 1.0, squint: 0.5, blink: 0 },
                }),
            ];
            const d = new PlaybackDriver(kfs);
            const frame = d.getFrame(0.5);
            // smoothstep(0.5) = 0.5
            expect(frame.expression.eyebrowRaise).toBeCloseTo(0.5);
            expect(frame.expression.squint).toBeCloseTo(0.25);
        });

        it('should include timestamp in output frame', () => {
            const frame = driver.getFrame(0.35);
            expect(frame.timestamp).toBe(0.35);
        });
    });

    describe('empty keyframes', () => {
        const driver = new PlaybackDriver([]);

        it('should return a silent frame for any timestamp', () => {
            expect(driver.getFrame(0).visemeId).toBe('SILENT');
            expect(driver.getFrame(5).visemeId).toBe('SILENT');
        });

        it('should report duration as 0', () => {
            expect(driver.duration).toBe(0);
        });
    });

    describe('duration', () => {
        it('should report total duration from keyframes', () => {
            const driver = new PlaybackDriver(KEYFRAMES);
            // Last keyframe: timestamp 0.6 + duration 0.2 = 0.8
            expect(driver.duration).toBeCloseTo(0.8);
        });
    });

    describe('frames', () => {
        it('should expose readonly keyframes', () => {
            const driver = new PlaybackDriver(KEYFRAMES);
            expect(driver.frames).toEqual(KEYFRAMES);
        });
    });

    describe('binary search edge cases', () => {
        it('should handle a single keyframe', () => {
            const driver = new PlaybackDriver([
                makeKeyframe({ timestamp: 1.0, duration: 0.5 }),
            ]);
            expect(driver.getFrame(0.5).visemeId).toBe('SILENT');
            expect(driver.getFrame(1.0).visemeId).toBe('OPEN');
            expect(driver.getFrame(1.5).visemeId).toBe('SILENT');
        });

        it('should handle exact keyframe boundaries', () => {
            const driver = new PlaybackDriver(KEYFRAMES);
            // Exactly at second keyframe start
            const frame = driver.getFrame(0.2);
            // t=0 in the second keyframe → smoothstep(0) = 0 → full OPEN values
            expect(frame.aperture).toBeCloseTo(1.0);
        });
    });
});
