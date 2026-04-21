/*
 * tests/data.test.js — Tests for data aggregation, numeric detection, column stats.
 */

import {assertEqual, assertApprox, assertTrue, assertFalse, assertDeepEqual} from './helpers.js';
import {aggregateEntries, detectNumericColumns, computeColumnStats, defaultColumnConfig} from '../js/data.js';

const records = [
    {amount: '10', category: 'Food', user: 'alice'},
    {amount: '20', category: 'Food', user: 'bob'},
    {amount: '-5', category: 'Refund', user: 'alice'},
    {amount: '30', category: 'Food', user: 'alice'},
    {amount: 'N/A', category: 'Food', user: 'carol'}, // non-numeric
];

export const tests = {

    'count returns entry length'() {
        assertEqual(aggregateEntries(records, {type: 'count'}), 5);
    },

    'count with null metric returns entry length'() {
        assertEqual(aggregateEntries(records, null), 5);
    },

    'count on empty array returns 0'() {
        assertEqual(aggregateEntries([], {type: 'count'}), 0);
    },

    'count_distinct counts unique values'() {
        assertEqual(aggregateEntries(records, {type: 'count_distinct', column: 'user'}), 3);
        assertEqual(aggregateEntries(records, {type: 'count_distinct', column: 'category'}), 2);
    },

    'count_distinct ignores null and empty values'() {
        const withEmpties = [
            {user: 'alice'},
            {user: ''},
            {user: null},
            {user: 'bob'},
            {user: 'alice'},
        ];
        assertEqual(aggregateEntries(withEmpties, {type: 'count_distinct', column: 'user'}), 2);
    },

    'sum adds signed values'() {
        // 10 + 20 + (-5) + 30 = 55; 'N/A' is dropped
        assertEqual(aggregateEntries(records, {type: 'sum', column: 'amount'}), 55);
    },

    'sum on empty returns 0'() {
        assertEqual(aggregateEntries([], {type: 'sum', column: 'amount'}), 0);
    },

    'sum on all non-numeric returns 0'() {
        const nonNum = [{x: 'a'}, {x: 'b'}];
        assertEqual(aggregateEntries(nonNum, {type: 'sum', column: 'x'}), 0);
    },

    'volume sums absolute values (net vs volume distinction)'() {
        // |10| + |20| + |-5| + |30| = 65
        assertEqual(aggregateEntries(records, {type: 'volume', column: 'amount'}), 65);
    },

    'volume and sum diverge when negatives present'() {
        const signed = [{x: 100}, {x: -100}, {x: 50}];
        assertEqual(aggregateEntries(signed, {type: 'sum', column: 'x'}), 50);
        assertEqual(aggregateEntries(signed, {type: 'volume', column: 'x'}), 250);
    },

    'avg computes arithmetic mean'() {
        // (10 + 20 + -5 + 30) / 4 = 13.75
        assertApprox(aggregateEntries(records, {type: 'avg', column: 'amount'}), 13.75, 1e-9);
    },

    'avg on empty returns 0'() {
        assertEqual(aggregateEntries([], {type: 'avg', column: 'x'}), 0);
    },

    'min returns smallest value'() {
        assertEqual(aggregateEntries(records, {type: 'min', column: 'amount'}), -5);
    },

    'max returns largest value'() {
        assertEqual(aggregateEntries(records, {type: 'max', column: 'amount'}), 30);
    },

    'min/max on all non-numeric returns 0'() {
        const nonNum = [{x: 'a'}, {x: 'b'}];
        assertEqual(aggregateEntries(nonNum, {type: 'min', column: 'x'}), 0);
        assertEqual(aggregateEntries(nonNum, {type: 'max', column: 'x'}), 0);
    },

    'unknown aggregation type falls back to count'() {
        assertEqual(aggregateEntries(records, {type: 'bogus', column: 'amount'}), records.length);
    },

    // ===== Numeric column detection (moved from schema.js in v0.5.0) =====

    'detectNumericColumns identifies numeric columns'() {
        const records = [
            {user: 'alice', amount: '100.50', quantity: '3'},
            {user: 'bob', amount: '50', quantity: '1'},
            {user: 'carol', amount: '200', quantity: '5'},
        ];
        const schema = {
            columns: [
                {key: 'user', header: 'User'},
                {key: 'amount', header: 'Amount'},
                {key: 'quantity', header: 'Quantity'},
            ],
            filterColumns: ['user', 'amount', 'quantity'],
        };
        detectNumericColumns(records, schema);
        const keys = schema.numericColumns.map(c => c.key).sort();
        assertDeepEqual(keys, ['amount', 'quantity']);
    },

    'detectNumericColumns flags columns with negatives as signed'() {
        const records = [{amount: '100'}, {amount: '-50'}, {amount: '25'}];
        const schema = {
            columns: [{key: 'amount', header: 'Amount'}],
            filterColumns: ['amount'],
        };
        detectNumericColumns(records, schema);
        assertEqual(schema.numericColumns.length, 1);
        assertTrue(schema.numericColumns[0].hasNegative);
    },

    'detectNumericColumns does not flag non-signed numerics'() {
        const records = [{count: '5'}, {count: '10'}];
        const schema = {
            columns: [{key: 'count', header: 'Count'}],
            filterColumns: ['count'],
        };
        detectNumericColumns(records, schema);
        assertFalse(schema.numericColumns[0].hasNegative);
    },

    'detectNumericColumns skips mostly-text columns'() {
        const records = [
            {user: 'alice', amount: '100'},
            {user: 'bob', amount: '50'},
            {user: 'carol', amount: '200'},
        ];
        const schema = {
            columns: [{key: 'user', header: 'User'}, {key: 'amount', header: 'Amount'}],
            filterColumns: ['user', 'amount'],
        };
        detectNumericColumns(records, schema);
        const keys = schema.numericColumns.map(c => c.key);
        assertFalse(keys.includes('user'));
        assertTrue(keys.includes('amount'));
    },

    'detectNumericColumns scans full record set (not just first 50)'() {
        // In v0.4.x this was a 50-row sample. v0.5.0 scans everything because
        // heterogeneous records may have a numeric column that only appears later.
        const records = [];
        // First 50 records have no 'late' column
        for (let i = 0; i < 50; i++) records.push({other: `x${i}`});
        // Then 20 numeric values of 'late'
        for (let i = 0; i < 20; i++) records.push({late: String(i * 10)});
        const schema = {
            columns: [{key: 'other', header: 'Other'}, {key: 'late', header: 'Late'}],
            filterColumns: ['other', 'late'],
        };
        detectNumericColumns(records, schema);
        const keys = schema.numericColumns.map(c => c.key);
        assertTrue(keys.includes('late'), 'late-appearing numeric column should be detected');
    },

    // ===== Column stats (new in v0.5.0) =====

    'computeColumnStats counts unique values per column'() {
        const records = [
            {user: 'alice', action: 'insert'},
            {user: 'bob', action: 'insert'},
            {user: 'alice', action: 'update'},
        ];
        const schema = {columns: [{key: 'user'}, {key: 'action'}]};
        computeColumnStats(records, schema);
        assertEqual(schema.columnStats.user.uniqueCount, 2);
        assertEqual(schema.columnStats.action.uniqueCount, 2);
    },

    'computeColumnStats tracks coverage for sparse columns'() {
        // Half the records have 'priority', half don't — coverage should be 0.5
        const records = [
            {id: 1, priority: 'high'},
            {id: 2, priority: 'low'},
            {id: 3},
            {id: 4},
        ];
        const schema = {columns: [{key: 'id'}, {key: 'priority'}]};
        computeColumnStats(records, schema);
        assertEqual(schema.columnStats.id.coverage, 1);
        assertApprox(schema.columnStats.priority.coverage, 0.5, 0.001);
        assertEqual(schema.columnStats.priority.covered, 2);
    },

    'computeColumnStats treats empty string and null as absent'() {
        const records = [
            {name: 'alice'},
            {name: ''},
            {name: null},
            {name: 'bob'},
        ];
        const schema = {columns: [{key: 'name'}]};
        computeColumnStats(records, schema);
        assertEqual(schema.columnStats.name.covered, 2);
        assertEqual(schema.columnStats.name.uniqueCount, 2);
    },

    'computeColumnStats handles zero-record input'() {
        const schema = {columns: [{key: 'anything'}]};
        computeColumnStats([], schema);
        assertEqual(schema.columnStats.anything.coverage, 0);
        assertEqual(schema.columnStats.anything.covered, 0);
        assertEqual(schema.columnStats.anything.uniqueCount, 0);
    },

    // ===== Default column config heuristic (v0.5.0) =====

    'defaultColumnConfig locks timestamp: visible+reportable only'() {
        const schema = {
            columns: [{key: 'ts'}, {key: 'user'}],
            timestampKey: 'ts',
            numericColumns: [],
            columnStats: {
                ts: {uniqueCount: 100, coverage: 1},
                user: {uniqueCount: 5, coverage: 1},
            },
        };
        const cfg = defaultColumnConfig(schema);
        assertDeepEqual(cfg.ts, {visible: true, filterable: false, reportable: true});
    },

    'defaultColumnConfig marks numeric columns visible+reportable (not filterable)'() {
        const schema = {
            columns: [{key: 'ts'}, {key: 'amount'}],
            timestampKey: 'ts',
            numericColumns: [{key: 'amount'}],
            columnStats: {
                ts: {uniqueCount: 100, coverage: 1},
                amount: {uniqueCount: 80, coverage: 1},
            },
        };
        const cfg = defaultColumnConfig(schema);
        assertDeepEqual(cfg.amount, {visible: true, filterable: false, reportable: true});
    },

    'defaultColumnConfig marks low-cardinality text all three flags'() {
        const schema = {
            columns: [{key: 'ts'}, {key: 'status'}],
            timestampKey: 'ts',
            numericColumns: [],
            columnStats: {
                ts: {uniqueCount: 100, coverage: 1},
                status: {uniqueCount: 5, coverage: 1},
            },
        };
        const cfg = defaultColumnConfig(schema);
        assertDeepEqual(cfg.status, {visible: true, filterable: true, reportable: true});
    },

    'defaultColumnConfig marks high-cardinality text visible only'() {
        const schema = {
            columns: [{key: 'ts'}, {key: 'description'}],
            timestampKey: 'ts',
            numericColumns: [],
            columnStats: {
                ts: {uniqueCount: 100, coverage: 1},
                description: {uniqueCount: 95, coverage: 1},
            },
        };
        const cfg = defaultColumnConfig(schema);
        assertDeepEqual(cfg.description, {visible: true, filterable: false, reportable: false});
    },

    'defaultColumnConfig hides sparse columns (coverage < 5%)'() {
        const schema = {
            columns: [{key: 'ts'}, {key: 'rare'}],
            timestampKey: 'ts',
            numericColumns: [],
            columnStats: {
                ts: {uniqueCount: 100, coverage: 1},
                rare: {uniqueCount: 3, coverage: 0.02},
            },
        };
        const cfg = defaultColumnConfig(schema);
        assertDeepEqual(cfg.rare, {visible: false, filterable: false, reportable: false});
    },

    'defaultColumnConfig covers all schema columns'() {
        const schema = {
            columns: [{key: 'ts'}, {key: 'a'}, {key: 'b'}, {key: 'c'}],
            timestampKey: 'ts',
            numericColumns: [],
            columnStats: {
                ts: {uniqueCount: 100, coverage: 1},
                a: {uniqueCount: 5, coverage: 1},
                b: {uniqueCount: 90, coverage: 1},
                c: {uniqueCount: 10, coverage: 0.02},
            },
        };
        const cfg = defaultColumnConfig(schema);
        assertEqual(Object.keys(cfg).length, 4);
    },
};
