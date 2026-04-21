/*
 * tests/csv.test.js — Tests for CSV/TSV/pipe-delimited parser.
 */

import {assertEqual, assertDeepEqual, assertTrue} from './helpers.js';
import {parseCSV} from '../js/csv.js';

export const tests = {

    'parses basic comma-delimited CSV'() {
        const r = parseCSV('timestamp,user,action\n2026-01-01,alice,insert\n2026-01-02,bob,update');
        assertEqual(r.records.length, 2);
        assertDeepEqual(r.headers, ['timestamp', 'user', 'action']);
        assertEqual(r.records[0].user, 'alice');
        assertEqual(r.records[1].action, 'update');
    },

    'lowercases header keys for record access'() {
        const r = parseCSV('Timestamp,User\n2026-01-01,alice');
        // Keys are lowercased but headers array preserves original case
        assertEqual(r.records[0].user, 'alice');
        assertEqual(r.records[0].timestamp, '2026-01-01');
    },

    'auto-detects tab delimiter'() {
        const r = parseCSV('ts\tuser\n2026-01-01\talice');
        assertEqual(r.records.length, 1);
        assertEqual(r.records[0].user, 'alice');
    },

    'auto-detects pipe delimiter'() {
        const r = parseCSV('ts|user\n2026-01-01|alice');
        assertEqual(r.records.length, 1);
        assertEqual(r.records[0].user, 'alice');
    },

    'auto-detects semicolon delimiter'() {
        const r = parseCSV('ts;user\n2026-01-01;alice');
        assertEqual(r.records.length, 1);
        assertEqual(r.records[0].user, 'alice');
    },

    'honors Excel sep= directive (comma)'() {
        const r = parseCSV('sep=,\nts,user\n2026-01-01,alice');
        assertEqual(r.records.length, 1);
        assertEqual(r.records[0].user, 'alice');
    },

    'honors Excel sep= directive (semicolon)'() {
        const r = parseCSV('sep=;\nts;user\n2026-01-01;alice');
        assertEqual(r.records.length, 1);
        assertEqual(r.records[0].user, 'alice');
    },

    'handles quoted fields with embedded commas'() {
        const r = parseCSV('name,note\nalice,"hello, world"\nbob,plain');
        assertEqual(r.records[0].note, 'hello, world');
        assertEqual(r.records[1].note, 'plain');
    },

    'handles quoted fields with embedded newlines'() {
        const r = parseCSV('name,note\n"alice","line1\nline2"');
        assertEqual(r.records.length, 1);
        assertEqual(r.records[0].note, 'line1\nline2');
    },

    'handles escaped double quotes'() {
        const r = parseCSV('name,note\nalice,"She said ""hi"""');
        assertEqual(r.records[0].note, 'She said "hi"');
    },

    'handles CRLF line endings'() {
        const r = parseCSV('ts,user\r\n2026-01-01,alice\r\n2026-01-02,bob');
        assertEqual(r.records.length, 2);
        assertEqual(r.records[1].user, 'bob');
    },

    'skips blank trailing lines'() {
        const r = parseCSV('ts,user\n2026-01-01,alice\n\n\n');
        assertEqual(r.records.length, 1);
    },

    'trims whitespace around field values'() {
        const r = parseCSV('ts,user\n  2026-01-01  ,  alice  ');
        assertEqual(r.records[0].ts, '2026-01-01');
        assertEqual(r.records[0].user, 'alice');
    },

    'returns null for single-column input (likely wrong delimiter)'() {
        const r = parseCSV('notadelimiterhere\nvalue1\nvalue2');
        assertEqual(r, null);
    },

    'returns null for header-only input'() {
        const r = parseCSV('ts,user');
        assertEqual(r, null);
    },

    'returns null for empty input'() {
        const r = parseCSV('');
        assertEqual(r, null);
    },

    'missing trailing columns become empty strings'() {
        const r = parseCSV('a,b,c\n1,2,3\n4,5');
        assertEqual(r.records.length, 2);
        assertEqual(r.records[1].c, '');
    },
};
