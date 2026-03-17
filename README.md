# LighterSync

> Lightweight, low-dependency lip-sync library for browser-based avatar animation.

Synchronises text-to-speech audio with viseme keyframes using script-informed waveform analysis. Designed for [Zdog](https://zzz.dog), Canvas 2D, Three.js, or any rendering engine.


## Demo

https://andersdn.github.io/LighterSync/examples/zdog-demo/

> The demo uses a pre-recorded audio file (Generated with Qwen3-TTS) and the matching script.

You can replace with your own audio file and script to test it out.

---

## Features

- **Zero runtime dependencies** — uses only the native Web Audio API
- **Three-stage pipeline**: Text → Phonemes → Audio-aligned Keyframes → Interpolated Playback
- **Built-in G2P fallback** — works without any dictionary data
- **Optional CMU dictionary** — tiered JSON files (small/medium/full) for higher accuracy
- **Facial expressions** — eyebrow raise, squint, and blink channels driven by audio amplitude
- **Renderer-agnostic** — implement the `VisemeRenderer` interface for your engine
- **TypeScript-first** — full type definitions, compiles to ESM + CJS

## Project Structure

```
lighter-sync/
├── src/                        # 📦 Published library source (TypeScript)
│   ├── core/
│   │   ├── types.ts            #   All type definitions
│   │   ├── constants.ts        #   Viseme tables, ARPAbet mapping
│   │   ├── phonetic-estimator.ts  # Module 1: Text → Visemes
│   │   ├── amplitude-aligner.ts   # Module 2: Audio → Keyframes
│   │   ├── playback-driver.ts     # Module 3: Keyframes → Interpolated frames
│   │   ├── lighter-sync.ts        # Orchestrator
│   │   └── index.ts            #   Core barrel export
│   └── index.ts                # Package entry point
│
├── examples/                   # 🎨 Example implementations (NOT published)
│   └── zdog-demo/
│       └── index.html          #   Self-contained demo page
│
├── scripts/                    # 🔧 Build tools
│   └── slice-cmudict.ts        #   CMU dict slicer
│
├── data/                       # 📚 Generated dictionaries (published)
│   ├── dict-small.json         #   ~500 words, ~14 KB
│   ├── dict-medium.json        #   ~5000 words, ~177 KB
│   └── dict-full.json          #   ~126K words, ~5 MB
│
└── dist/                       # Compiled output (ESM + CJS + .d.ts)
```

## Quick Start

### Install

Refer to [https://www.npmjs.com/package/lighter-sync](https://www.npmjs.com/package/lighter-sync) for more information.

```bash
npm install lighter-sync
```

### Basic Usage (zero-config)

```typescript
import { LighterSync } from 'lighter-sync';

// No dictionary needed — built-in character-level G2P works out of the box
const sync = new LighterSync();

// Decode audio (Web Audio API)
const audioCtx = new AudioContext();
const response = await fetch('speech.mp3');
const audioBuffer = await audioCtx.decodeAudioData(await response.arrayBuffer());

// Analyse: text + audio → keyframes
await sync.prepare(audioBuffer, "Hello world, how are you today?");

// Play with a rendering callback
const audioEl = document.querySelector('audio');
const stop = sync.play(audioEl, (frame) => {
  // frame.aperture  — mouth openness (0–1)
  // frame.width     — mouth width (0–1)
  // frame.visemeId  — 'OPEN' | 'CLOSED' | 'DENTAL' | 'ROUND' | 'FRICATIVE' | 'SILENT'
  // frame.expression.eyebrowRaise — (0–1)
  // frame.expression.squint       — (0–1)
  // frame.expression.blink        — (0 or 1)
  myAvatar.setMouth(frame.aperture, frame.width);
  myAvatar.setEyebrows(frame.expression.eyebrowRaise);
});
```

### With CMU Dictionary (higher accuracy)

Dictionaries aren't bundled with the package — generate only the tiers you need:

```bash
# All tiers (small, medium, full) → ./data/
npx lighter-sync-dict

# Just the small dict
npx lighter-sync-dict --sizes small

# Pick tiers and output directory
npx lighter-sync-dict --sizes small,medium --out ./src/dicts
```

Then import whichever tier you generated:

```typescript
import { LighterSync } from 'lighter-sync';
import dictSmall from './data/dict-small.json';

const sync = new LighterSync({ dictionary: dictSmall });
```

Available tiers:

| Tier | Words | Size | Coverage |
|------|-------|------|----------|
| `small` → `dict-small.json` | ~500 | ~14 KB | ~80% of everyday speech |
| `medium` → `dict-medium.json` | ~5,000 | ~177 KB | ~95% of written text |
| `full` → `dict-full.json` | ~126,000 | ~5 MB | Complete CMU dictionary |

### Viseme Mode

Toggle between 5-category (simple) and 22-viseme (full) output:

```typescript
// Simple: 5 categories — good for basic avatars
const sync = new LighterSync({ mode: 'simple' });

// Full: 22 viseme IDs (Azure/Oculus-compatible) — for detailed blend shapes
const sync = new LighterSync({ mode: 'full', dictionary: dictSmall });
```

Both modes always produce `visemeId` (category string) AND `fullVisemeId` (0–21 numeric) on every frame. The mode controls which aperture/width values drive the output.

### Run the Zdog Demo

No extra build step needed for the example — it imports the compiled library directly via an [import map](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/script/type/importmap).

```bash
# 1. Install deps + build the library + generate dictionaries
npm install
npm run build
npm run slice-dict

# 2. Serve from project root (opens demo in browser)
npx -y http-server . -c-1 -o /examples/zdog-demo/
```

Load an audio file, type the matching script, and hit Play. Toggle between Simple (5 visemes) and Full (22 visemes) mode in real time.

## Pipeline Architecture

```
┌─────────────────────┐
│  Plaintext Script    │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐     ┌──────────────┐
│  PhoneticEstimator   │◄────│  CMU Dict    │
│  (Module 1)          │     │  (optional)  │
│  Text → Visemes      │     └──────────────┘
└────────┬────────────┘
         │ PhoneticToken[]
         ▼
┌─────────────────────┐     ┌──────────────┐
│  AmplitudeAligner    │◄────│  AudioBuffer │
│  (Module 2)          │     │  (Web Audio) │
│  Audio → Keyframes   │     └──────────────┘
└────────┬────────────┘
         │ Keyframe[] (with expressions)
         ▼
┌─────────────────────┐     ┌──────────────┐
│  PlaybackDriver      │◄────│  <audio>     │
│  (Module 3)          │     │  .currentTime│
│  Keyframes → Lerp    │     └──────────────┘
└────────┬────────────┘
         │ VisemeFrame
         ▼
┌─────────────────────┐
│  Your Renderer       │
│  (Zdog, Canvas, etc) │
└─────────────────────┘
```

## Custom Renderers

Implement the `VisemeRenderer` interface:

```typescript
import type { VisemeRenderer, VisemeFrame } from 'lighter-sync';

class MyCanvasRenderer implements VisemeRenderer {
  update(frame: VisemeFrame): void {
    // Draw mouth based on frame.aperture and frame.width
    // Animate eyebrows with frame.expression.eyebrowRaise
    // Handle blinks with frame.expression.blink
  }

  destroy(): void {
    // Cleanup if needed
  }
}
```

See `examples/zdog-demo/index.html` for a complete Zdog implementation.

## Viseme Categories

| Category | Phonemes | Aperture | Width | Weight | Example |
|----------|----------|----------|-------|--------|---------|
| CLOSED | p, b, m | 0.0 | 0.5 | 0.6 | "map" |
| DENTAL | t, d, n, s, z | 0.2 | 0.6 | 0.8 | "sun" |
| OPEN | a, e, i, ah | 1.0 | 0.8 | 1.2 | "cat" |
| ROUND | o, u, w | 0.7 | 0.3 | 1.3 | "who" |
| FRICATIVE | f, v | 0.1 | 0.5 | 0.9 | "five" |
| SILENT | — | 0.0 | 0.5 | 0.0 | pauses |

## Expression Channels

Non-phoneme facial expression data, driven by audio amplitude heuristics:

| Channel | Range | Trigger |
|---------|-------|---------|
| `eyebrowRaise` | 0–1 | RMS exceeds 1.5× running average (emphasis) |
| `squint` | 0–1 | Sustained loud passage > 0.5s |
| `blink` | 0 or 1 | Silence gaps > 300ms (natural blink points) |

## Dictionary Slicer

Generate custom dictionary tiers at build time:

```bash
# Default tiers (500, 5000, full)
npm run slice-dict

# Custom sizes
npm run slice-dict -- --sizes 200,2000,10000

# Force re-download sources
npm run slice-dict -- --force
```

The slicer downloads the [CMU Pronouncing Dictionary](https://github.com/cmusphinx/cmudict) and the [wordfreq-en-25000](https://github.com/aparrish/wordfreq-en-25000) frequency list, intersects them, and outputs tiered JSON sorted by word frequency.

## API Reference

### `LighterSync`

The main orchestrator class.

```typescript
const sync = new LighterSync(options?: LighterSyncOptions);

// Analyse audio + script
await sync.prepare(audio: AudioBuffer, script: string): Promise<Keyframe[]>;

// Load pre-computed keyframes (for caching)
sync.loadKeyframes(keyframes: Keyframe[]): void;

// Get frame at timestamp (manual polling)
sync.getFrame(currentTime: number): VisemeFrame;

// Auto-play synced to <audio> element
const stop = sync.play(audioElement, onFrame: (frame: VisemeFrame) => void);
sync.stop();

// Utilities
sync.duration: number;
sync.keyframes: ReadonlyArray<Keyframe>;
sync.isPrepared: boolean;
sync.estimatePhonetics(script: string): PhoneticToken[];
```

### Individual Modules

For custom pipelines, import modules directly:

```typescript
import { PhoneticEstimator, AmplitudeAligner, PlaybackDriver } from 'lighter-sync';
```

## Development

```bash
# Install dependencies
npm install

# Type check
npm run typecheck

# Build (ESM + CJS + .d.ts)
npm run build

# Watch mode
npm run dev

# Generate dictionary files
npm run slice-dict

# Run the Zdog demo locally
npx -y http-server . -c-1 -o /examples/zdog-demo/
```

## License

MIT
