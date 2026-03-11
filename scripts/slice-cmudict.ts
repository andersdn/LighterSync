#!/usr/bin/env tsx
/**
 * @script slice-cmudict
 * Build-time tool for generating pronunciation dictionary JSON files
 * from the CMU Pronouncing Dictionary.
 *
 * Downloads the CMU dict and a word-frequency list, intersects them,
 * and outputs tiered JSON files:
 *
 *   data/dict-small.json   — top  500 most common words  (~8 KB)
 *   data/dict-medium.json  — top 5000 most common words  (~80 KB)
 *   data/dict-full.json    — all 134K+ CMU dict entries  (~4 MB)
 *
 * Custom sizes:
 *   npm run slice-dict -- --sizes 200,2000,10000
 *
 * Usage:
 *   npm run slice-dict              # default tiers (500, 5000, full)
 *   npm run slice-dict -- --sizes 1000   # single custom tier
 *   npm run slice-dict -- --force        # re-download even if cached
 *
 * The output JSON format matches DictionaryData from src/core/types.ts:
 *   { "word": ["PH", "OW", "N", "EE", "M", "Z"], ... }
 *
 * Stress markers (0, 1, 2) are stripped since they don't affect visemes.
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const DATA_DIR = join(PROJECT_ROOT, 'data');
const CACHE_DIR = join(PROJECT_ROOT, '.cache');

const CMUDICT_URL =
    'https://raw.githubusercontent.com/cmusphinx/cmudict/master/cmudict.dict';

const FREQUENCY_URL =
    'https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english.txt';

interface DictEntry {
    word: string;
    phonemes: string[];
}

// ---------------------------------------------------------------------------
// Download helpers
// ---------------------------------------------------------------------------

async function downloadText(url: string, cachePath: string, force: boolean): Promise<string> {
    if (!force && existsSync(cachePath)) {
        console.log(`  ↪ Using cached: ${cachePath}`);
        return readFileSync(cachePath, 'utf-8');
    }

    console.log(`  ↓ Downloading: ${url}`);
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
    }

    const text = await response.text();

    mkdirSync(dirname(cachePath), { recursive: true });
    writeFileSync(cachePath, text, 'utf-8');

    return text;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Parse the CMU dict text format into entries.
 * Format: "word  PH1 OW0 N IY0 M Z"
 * Lines starting with ;;; are comments.
 * Words with (2), (3) etc are alternate pronunciations — we take the first.
 */
function parseCMUDict(text: string): Map<string, string[]> {
    const dict = new Map<string, string[]>();

    for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(';;;')) continue;

        // Split on whitespace: first token is word, rest are phonemes
        const parts = trimmed.split(/\s+/);
        if (parts.length < 2) continue;

        let word = parts[0].toLowerCase();

        // Skip alternate pronunciations like "hello(2)"
        if (/\(\d+\)$/.test(word)) continue;

        // Strip stress markers from phonemes: "AH0" → "AH"
        const phonemes = parts.slice(1)
            .filter(p => !p.startsWith('#'))  // skip inline comments
            .map(p => p.replace(/[012]/g, ''));

        if (phonemes.length > 0) {
            dict.set(word, phonemes);
        }
    }

    return dict;
}

/**
 * Parse the Google 10K word frequency list.
 * One word per line, ordered by frequency (most common first).
 */
function parseFrequencyList(text: string): string[] {
    return text
        .split('\n')
        .map(line => line.trim().toLowerCase())
        .filter(word => word.length > 0);
}

// ---------------------------------------------------------------------------
// Slicing
// ---------------------------------------------------------------------------

interface SliceConfig {
    name: string;
    size: number | 'full';
}

function sliceDict(
    cmuDict: Map<string, string[]>,
    frequencyWords: string[],
    config: SliceConfig,
): Record<string, string[]> {
    if (config.size === 'full') {
        // Export everything
        const result: Record<string, string[]> = {};
        for (const [word, phonemes] of cmuDict) {
            result[word] = phonemes;
        }
        return result;
    }

    // Take top N words from frequency list that exist in CMU dict
    const result: Record<string, string[]> = {};
    let count = 0;

    for (const word of frequencyWords) {
        if (count >= config.size) break;

        const phonemes = cmuDict.get(word);
        if (phonemes) {
            result[word] = phonemes;
            count++;
        }
    }

    return result;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(): { sizes: SliceConfig[]; force: boolean } {
    const args = process.argv.slice(2);
    const force = args.includes('--force');

    const sizesIndex = args.indexOf('--sizes');
    if (sizesIndex !== -1 && args[sizesIndex + 1]) {
        const customSizes = args[sizesIndex + 1]
            .split(',')
            .map(s => s.trim())
            .filter(s => s.length > 0)
            .map((s): SliceConfig => {
                if (s === 'full') return { name: 'dict-full', size: 'full' };
                const n = parseInt(s, 10);
                if (isNaN(n) || n <= 0) {
                    throw new Error(`Invalid size: ${s}`);
                }
                return { name: `dict-${n}`, size: n };
            });

        return { sizes: customSizes, force };
    }

    // Default tiers
    return {
        force,
        sizes: [
            { name: 'dict-small', size: 500 },
            { name: 'dict-medium', size: 5000 },
            { name: 'dict-full', size: 'full' },
        ],
    };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
    console.log('🔤 LighterSync Dictionary Slicer\n');

    const { sizes, force } = parseArgs();

    // Download source files
    console.log('📥 Fetching source data...');
    const cmudictText = await downloadText(
        CMUDICT_URL,
        join(CACHE_DIR, 'cmudict.dict'),
        force,
    );
    const frequencyText = await downloadText(
        FREQUENCY_URL,
        join(CACHE_DIR, 'google-10000-english.txt'),
        force,
    );

    // Parse
    console.log('\n📖 Parsing CMU Pronouncing Dictionary...');
    const cmuDict = parseCMUDict(cmudictText);
    console.log(`  ✓ ${cmuDict.size.toLocaleString()} entries parsed`);

    const frequencyWords = parseFrequencyList(frequencyText);
    console.log(`  ✓ ${frequencyWords.length.toLocaleString()} frequency-ranked words loaded`);

    // Slice and write
    mkdirSync(DATA_DIR, { recursive: true });
    console.log('\n✂️  Slicing dictionaries...');

    for (const config of sizes) {
        const sliced = sliceDict(cmuDict, frequencyWords, config);
        const wordCount = Object.keys(sliced).length;
        const json = JSON.stringify(sliced);
        const sizeKB = (Buffer.byteLength(json, 'utf-8') / 1024).toFixed(1);

        const outPath = join(DATA_DIR, `${config.name}.json`);
        writeFileSync(outPath, json, 'utf-8');

        const sizeLabel = config.size === 'full' ? 'full' : config.size.toString();
        console.log(
            `  ✓ ${config.name}.json — ${wordCount.toLocaleString()} words (${sizeKB} KB) [target: ${sizeLabel}]`,
        );
    }

    console.log('\n✅ Done! Dictionary files written to data/\n');
}

main().catch((err) => {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
});
