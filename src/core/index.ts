/**
 * @module core
 * Barrel export for all core LighterSync modules.
 */

// Main orchestrator
export { LighterSync } from './lighter-sync.js';

// Individual modules (for custom pipelines)
export { PhoneticEstimator } from './phonetic-estimator.js';
export { AmplitudeAligner } from './amplitude-aligner.js';
export { PlaybackDriver } from './playback-driver.js';

// Constants (for custom mappings / renderer authors)
export {
    VISEME_PARAMS,
    ARPABET_TO_VISEME,
    ARPABET_TO_FULL_VISEME,
    CHAR_TO_VISEME,
    CHAR_TO_FULL_VISEME,
    DIGRAPH_TO_VISEME,
    FULL_VISEME_TABLE,
} from './constants.js';

export type { FullVisemeEntry } from './constants.js';

// Types
export type {
    VisemeMode,
    VisemeCategory,
    VisemeParams,
    ExpressionParams,
    WeightedViseme,
    PhoneticToken,
    Keyframe,
    VisemeFrame,
    VADSegment,
    DictionaryData,
    AlignmentConfig,
    LighterSyncOptions,
    VisemeRenderer,
} from './types.js';
