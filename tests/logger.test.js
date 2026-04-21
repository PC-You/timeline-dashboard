/*
 * tests/logger.test.js — Tests for the ring-buffer developer logger.
 */

import {assertEqual, assertTrue, assertFalse} from './helpers.js';
import {logger} from '../js/logger.js';

// Silence console mirroring during tests
const origLog = console.log, origWarn = console.warn, origError = console.error;
function silence() {
    console.log = () => {}; console.warn = () => {}; console.error = () => {};
}
function restore() {
    console.log = origLog; console.warn = origWarn; console.error = origError;
}

function reset() {
    logger.enabled = false;
    logger.clear();
}

export const tests = {

    'disabled logger records nothing'() {
        reset();
        logger.info('test', 'hello');
        logger.warn('test', 'world');
        assertEqual(logger.getEntries().length, 0);
    },

    'enabled logger records entries'() {
        reset();
        logger.enabled = true;
        silence();
        try {
            logger.info('test', 'hello', {x: 1});
            const entries = logger.getEntries();
            assertEqual(entries.length, 1);
            assertEqual(entries[0].level, 'info');
            assertEqual(entries[0].category, 'test');
            assertEqual(entries[0].message, 'hello');
            assertEqual(entries[0].meta.x, 1);
            assertTrue(typeof entries[0].ts === 'number');
        } finally {
            restore();
        }
    },

    'level-specific convenience methods work'() {
        reset();
        logger.enabled = true;
        silence();
        try {
            logger.info('c', 'i');
            logger.warn('c', 'w');
            logger.error('c', 'e');
            const e = logger.getEntries();
            assertEqual(e[0].level, 'info');
            assertEqual(e[1].level, 'warn');
            assertEqual(e[2].level, 'error');
        } finally {
            restore();
        }
    },

    'buffer caps at 500 entries (ring behavior)'() {
        reset();
        logger.enabled = true;
        silence();
        try {
            for (let i = 0; i < 600; i++) logger.info('cap', `msg ${i}`);
            const entries = logger.getEntries();
            assertEqual(entries.length, 500);
            // Oldest entries should have been shifted off
            assertEqual(entries[0].message, 'msg 100');
            assertEqual(entries[499].message, 'msg 599');
        } finally {
            restore();
        }
    },

    'clear() empties buffer'() {
        reset();
        logger.enabled = true;
        silence();
        try {
            logger.info('t', 'a');
            logger.info('t', 'b');
            assertEqual(logger.getEntries().length, 2);
            logger.clear();
            assertEqual(logger.getEntries().length, 0);
        } finally {
            restore();
        }
    },

    'subscribe() receives new entries'() {
        reset();
        logger.enabled = true;
        silence();
        try {
            const received = [];
            const unsub = logger.subscribe(e => { if (e) received.push(e); });
            logger.info('s', 'first');
            logger.warn('s', 'second');
            assertEqual(received.length, 2);
            assertEqual(received[0].message, 'first');
            assertEqual(received[1].message, 'second');
            unsub();
            logger.info('s', 'third');
            assertEqual(received.length, 2, 'unsubscribe should stop delivery');
        } finally {
            restore();
        }
    },

    'subscribe() receives null on clear()'() {
        reset();
        logger.enabled = true;
        silence();
        try {
            let gotNull = false;
            logger.subscribe(e => { if (e === null) gotNull = true; });
            logger.clear();
            assertTrue(gotNull, 'subscribers should be notified of clear with null');
        } finally {
            restore();
        }
    },

    'throwing subscriber does not break logging'() {
        reset();
        logger.enabled = true;
        silence();
        try {
            logger.subscribe(() => { throw new Error('boom'); });
            logger.info('t', 'should not throw');
            assertEqual(logger.getEntries().length, 1);
        } finally {
            restore();
        }
    },

    're-disabling stops recording'() {
        reset();
        logger.enabled = true;
        silence();
        try {
            logger.info('t', 'recorded');
            logger.enabled = false;
            logger.info('t', 'ignored');
            assertEqual(logger.getEntries().length, 1);
        } finally {
            restore();
        }
    },
};
