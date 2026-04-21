/*
 * tests/helpers.js — Minimal assertion helpers.
 */

export function assertEqual(actual, expected, msg) {
    if (actual !== expected) {
        throw new Error(
            (msg ? msg + ': ' : '') +
            `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
        );
    }
}

export function assertDeepEqual(actual, expected, msg) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) {
        throw new Error(
            (msg ? msg + ': ' : '') +
            `expected ${e}, got ${a}`
        );
    }
}

export function assertTrue(value, msg) {
    if (!value) throw new Error((msg ? msg + ': ' : '') + `expected truthy, got ${JSON.stringify(value)}`);
}

export function assertFalse(value, msg) {
    if (value) throw new Error((msg ? msg + ': ' : '') + `expected falsy, got ${JSON.stringify(value)}`);
}

export function assertThrows(fn, expectedMessageMatch, msg) {
    let threw = false;
    let error = null;
    try { fn(); } catch (e) { threw = true; error = e; }
    if (!threw) {
        throw new Error((msg ? msg + ': ' : '') + 'expected function to throw');
    }
    if (expectedMessageMatch && !error.message.match(expectedMessageMatch)) {
        throw new Error(
            (msg ? msg + ': ' : '') +
            `expected error message to match ${expectedMessageMatch}, got "${error.message}"`
        );
    }
}

export function assertApprox(actual, expected, epsilon, msg) {
    if (Math.abs(actual - expected) > (epsilon ?? 1e-9)) {
        throw new Error(
            (msg ? msg + ': ' : '') +
            `expected ${expected} ± ${epsilon ?? 1e-9}, got ${actual}`
        );
    }
}
