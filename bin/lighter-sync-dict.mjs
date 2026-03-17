#!/usr/bin/env node
/**
 * lighter-sync-dict
 *
 * Downloads and slices the CMU Pronouncing Dictionary into tiered JSON files
 * for use with LighterSync.
 *
 * Usage:
 *   npx lighter-sync-dict                          # default: small,medium,full → ./data/
 *   npx lighter-sync-dict --sizes small,medium      # pick tiers
 *   npx lighter-sync-dict --out ./src/dicts          # custom output dir
 *   npx lighter-sync-dict --sizes small --out ./lib  # combine flags
 *   npx lighter-sync-dict --force                    # re-download sources
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CMUDICT_URL =
    'https://raw.githubusercontent.com/cmusphinx/cmudict/master/cmudict.dict';

const FREQUENCY_URL =
    'https://raw.githubusercontent.com/aparrish/wordfreq-en-25000/master/wordfreq-en-25000-log.json';

const CACHE_DIR = join(tmpdir(), 'lighter-sync-cache');

const TIER_MAP = {
    small: { name: 'dict-small', size: 500 },
    medium: { name: 'dict-medium', size: 5000 },
    full: { name: 'dict-full', size: 'full' },
};

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------

async function downloadText(url, cachePath, force) {
    if (!force && existsSync(cachePath)) {
        console.log(`  ↪ cached: ${cachePath}`);
        return readFileSync(cachePath, 'utf-8');
    }

    console.log(`  ↓ downloading: ${url}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);

    const text = await res.text();
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(cachePath, text, 'utf-8');
    return text;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

function parseCMUDict(text) {
    const dict = new Map();
    for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(';;;')) continue;

        const parts = trimmed.split(/\s+/);
        if (parts.length < 2) continue;

        let word = parts[0].toLowerCase();
        if (/\(\d+\)$/.test(word)) continue; // skip alternates

        const phonemes = parts.slice(1)
            .filter(p => !p.startsWith('#'))
            .map(p => p.replace(/[012]/g, ''));

        if (phonemes.length > 0) dict.set(word, phonemes);
    }
    return dict;
}

function parseFrequencyList(text) {
    const entries = JSON.parse(text);
    return entries
        .map(([word]) => word.toLowerCase())
        .filter(word => word.length > 0 && /^[a-z]/.test(word));
}

// ---------------------------------------------------------------------------
// Slicing
// ---------------------------------------------------------------------------

function sliceDict(cmuDict, freqWords, size) {
    if (size === 'full') {
        const result = {};
        for (const [w, p] of cmuDict) result[w] = p;
        return result;
    }

    const result = {};
    let count = 0;
    for (const word of freqWords) {
        if (count >= size) break;
        const phonemes = cmuDict.get(word);
        if (phonemes) { result[word] = phonemes; count++; }
    }
    return result;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs() {
    const args = process.argv.slice(2);

    if (args.includes('--help') || args.includes('-h')) {
        console.log(`
lighter-sync-dict — Generate pronunciation dictionary JSON files

Usage:
  npx lighter-sync-dict [options]

Options:
  --sizes <tiers>   Comma-separated: small, medium, full (default: all three)
  --out <dir>       Output directory (default: ./data)
  --force           Re-download source files even if cached
  --help            Show this help

Examples:
  npx lighter-sync-dict
  npx lighter-sync-dict --sizes small,medium
  npx lighter-sync-dict --sizes small --out ./src/dicts
`);
        process.exit(0);
    }

    const force = args.includes('--force');

    // Parse --out
    const outIdx = args.indexOf('--out');
    const outDir = outIdx !== -1 && args[outIdx + 1]
        ? resolve(args[outIdx + 1])
        : resolve('data');

    // Parse --sizes
    const sizesIdx = args.indexOf('--sizes');
    let tiers;
    if (sizesIdx !== -1 && args[sizesIdx + 1]) {
        const requested = args[sizesIdx + 1].split(',').map(s => s.trim());
        tiers = requested.map(key => {
            if (!TIER_MAP[key]) {
                console.error(`Unknown tier: "${key}". Available: small, medium, full`);
                process.exit(1);
            }
            return TIER_MAP[key];
        });
    } else {
        tiers = Object.values(TIER_MAP);
    }

    return { tiers, outDir, force };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
    console.log('🔤 lighter-sync-dict\n');

    const { tiers, outDir, force } = parseArgs();

    console.log('📥 Fetching source data...');
    const cmudictText = await downloadText(
        CMUDICT_URL, join(CACHE_DIR, 'cmudict.dict'), force,
    );
    const frequencyText = await downloadText(
        FREQUENCY_URL, join(CACHE_DIR, 'wordfreq-en-25000.json'), force,
    );

    console.log('\n📖 Parsing...');
    const cmuDict = parseCMUDict(cmudictText);
    console.log(`  ✓ ${cmuDict.size.toLocaleString()} entries`);

    const freqWords = parseFrequencyList(frequencyText);
    console.log(`  ✓ ${freqWords.length.toLocaleString()} frequency-ranked words`);

    mkdirSync(outDir, { recursive: true });
    console.log(`\n✂️  Slicing → ${outDir}`);

    for (const tier of tiers) {
        const sliced = sliceDict(cmuDict, freqWords, tier.size);
        const wordCount = Object.keys(sliced).length;
        const json = JSON.stringify(sliced);
        const kb = (Buffer.byteLength(json, 'utf-8') / 1024).toFixed(1);

        const outPath = join(outDir, `${tier.name}.json`);
        writeFileSync(outPath, json, 'utf-8');
        console.log(`  ✓ ${tier.name}.json — ${wordCount.toLocaleString()} words (${kb} KB)`);
    }

    console.log('\n✅ Done!\n');
}

main().catch(err => {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
});
