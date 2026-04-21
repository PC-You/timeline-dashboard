/*
 * tests/run.js — Hand-rolled test runner. Zero dependencies.
 *
 * Usage: node tests/run.js
 *
 * Discovers all *.test.js files in tests/, imports them as ES modules, and runs
 * their exported tests. Each test file exports a `tests` object mapping names
 * to async-or-sync functions. A failing assertion throws; uncaught errors fail
 * the run. Exits nonzero on any failure.
 *
 * When we outgrow this (DOM tests, parallel execution, watch mode), migrate to
 * Vitest. The test file format is compatible: rename `tests` export to use
 * `describe`/`it` and it drops in.
 */

import {readdirSync} from 'fs';
import {pathToFileURL} from 'url';
import {fileURLToPath} from 'url';
import {dirname, join} from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ANSI colors
const G = '\x1b[32m', R = '\x1b[31m', Y = '\x1b[33m', D = '\x1b[2m', X = '\x1b[0m';

let passed = 0, failed = 0;
const failures = [];

async function runFile(file) {
    const url = pathToFileURL(join(__dirname, file)).href;
    let mod;
    try {
        mod = await import(url);
    } catch (e) {
        console.log(`${R}✗ ${file} — failed to import${X}`);
        console.log(`  ${e.message}`);
        failed++;
        failures.push({file, name: '(import)', error: e});
        return;
    }
    if (!mod.tests || typeof mod.tests !== 'object') {
        console.log(`${Y}⚠ ${file} — no 'tests' export, skipping${X}`);
        return;
    }
    console.log(`\n${D}${file}${X}`);
    for (const [name, fn] of Object.entries(mod.tests)) {
        try {
            await fn();
            console.log(`  ${G}✓${X} ${name}`);
            passed++;
        } catch (e) {
            console.log(`  ${R}✗${X} ${name}`);
            console.log(`    ${R}${e.message}${X}`);
            if (e.stack) {
                const frames = e.stack.split('\n').slice(1, 3).map(s => `    ${D}${s.trim()}${X}`);
                console.log(frames.join('\n'));
            }
            failed++;
            failures.push({file, name, error: e});
        }
    }
}

const files = readdirSync(__dirname)
    .filter(f => f.endsWith('.test.js'))
    .sort();

if (files.length === 0) {
    console.log(`${Y}No *.test.js files found in ${__dirname}${X}`);
    process.exit(0);
}

console.log(`Running ${files.length} test file(s)...`);
for (const f of files) await runFile(f);

const total = passed + failed;
console.log(`\n${'─'.repeat(40)}`);
if (failed === 0) {
    console.log(`${G}✓ ${passed}/${total} passed${X}`);
    process.exit(0);
} else {
    console.log(`${R}✗ ${failed}/${total} failed${X}  ${G}(${passed} passed)${X}`);
    process.exit(1);
}
