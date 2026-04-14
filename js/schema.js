/*
 * schema.js — Schema detection, definition, and defaults
 */

const TIMESTAMP_ALIASES = ['timestamp', 'ts', 'datetime', 'date', 'time', 'created_at', 'created', 'occurred', 'event_time', 'event_date'];

const MONTH_NAMES = {
    jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
    may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, september: 8,
    oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

// ===== Timestamp format detection =====

export function detectTimestampFormat(values) {
    const samples = values.filter(v => v != null && v !== '').slice(0, 30);
    if (samples.length === 0) return 'iso';
    if (samples.every(v => /^\d{4}[-/]/.test(v))) return 'iso';
    if (samples.every(v => /^\d{9,13}$/.test(v))) {
        return parseInt(samples[0]) > 1e12 ? 'epoch-ms' : 'epoch-s';
    }
    const oraclePattern = /^\d{1,2}-[A-Za-z]{3}-\d{2,4}$/;
    if (samples.every(v => oraclePattern.test(v.trim()))) return 'oracle-dmy';
    const hasMonthName = samples.filter(v => {
        const lower = v.toLowerCase();
        return Object.keys(MONTH_NAMES).some(m => lower.includes(m));
    });
    if (hasMonthName.length > samples.length * 0.8) {
        return /^\d/.test(samples[0].trim()) ? 'human-dmy' : 'human-mdy';
    }
    const sepMatch = samples[0].match(/\d{1,4}\s*([/\-.])\s*\d/);
    if (sepMatch) return resolveAmbiguousDateOrder(samples);
    return 'iso';
}

function resolveAmbiguousDateOrder(samples) {
    let mustBeUS = false, mustBeEU = false;
    for (const v of samples) {
        const parts = v.split(/[/\-.\s]+/).map(Number);
        if (parts.length < 3) continue;
        if (parts[0] > 12) mustBeEU = true;
        if (parts[1] > 12) mustBeUS = true;
    }
    if (mustBeUS && !mustBeEU) return 'us';
    if (mustBeEU && !mustBeUS) return 'eu';
    return 'us';
}

// ===== Timestamp parsing =====

export function parseTimestamp(value, format) {
    if (!value) return null;
    const v = value.trim();
    switch (format) {
        case 'iso': {
            const d = new Date(v.includes('T') ? v : v.replace(' ', 'T'));
            return isNaN(d) ? null : d;
        }
        case 'epoch-s': {
            const d = new Date(parseInt(v) * 1000);
            return isNaN(d) ? null : d;
        }
        case 'epoch-ms': {
            const d = new Date(parseInt(v));
            return isNaN(d) ? null : d;
        }
        case 'us': {
            const [datePart, ...timeParts] = v.split(/\s+/);
            const parts = datePart.split(/[/\-.]/);
            if (parts.length < 3) return null;
            const [m, d, y] = parts.map(Number);
            const date = new Date(y < 100 ? y + 2000 : y, m - 1, d);
            if (timeParts.length > 0) applyTime(date, timeParts.join(' '));
            return isNaN(date) ? null : date;
        }
        case 'eu': {
            const [datePart, ...timeParts] = v.split(/\s+/);
            const parts = datePart.split(/[/\-.]/);
            if (parts.length < 3) return null;
            const [d, m, y] = parts.map(Number);
            const date = new Date(y < 100 ? y + 2000 : y, m - 1, d);
            if (timeParts.length > 0) applyTime(date, timeParts.join(' '));
            return isNaN(date) ? null : date;
        }
        case 'human-mdy': {
            const match = v.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})\s*(.*)?/);
            if (!match) return null;
            const month = MONTH_NAMES[match[1].toLowerCase().substring(0, 3)];
            if (month === undefined) return null;
            const date = new Date(parseInt(match[3]), month, parseInt(match[2]));
            if (match[4]) applyTime(date, match[4]);
            return isNaN(date) ? null : date;
        }
        case 'human-dmy': {
            const match = v.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s*(.*)?/);
            if (!match) return null;
            const month = MONTH_NAMES[match[2].toLowerCase().substring(0, 3)];
            if (month === undefined) return null;
            const date = new Date(parseInt(match[3]), month, parseInt(match[1]));
            if (match[4]) applyTime(date, match[4]);
            return isNaN(date) ? null : date;
        }
        case 'oracle-dmy': {
            const parts = v.split('-');
            if (parts.length < 3) return null;
            const day = parseInt(parts[0]);
            const month = MONTH_NAMES[parts[1].toLowerCase().substring(0, 3)];
            if (month === undefined) return null;
            let year = parseInt(parts[2]);
            if (year < 100) year += 2000;
            return new Date(year, month, day, 0, 0, 0);
        }
        default:
            return null;
    }
}

function applyTime(date, timeStr) {
    const t = timeStr.trim();
    if (!t) return;
    const match = t.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (match) date.setHours(parseInt(match[1]), parseInt(match[2]), match[3] ? parseInt(match[3]) : 0);
}

export function toNormalizedISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    return `${y}-${m}-${d}T${hh}:${mm}:${ss}`;
}

// ===== Schema detection =====

export function detectSchema(headers, records) {
    const lowerHeaders = headers.map(h => h.toLowerCase().trim());
    let tsIdx = lowerHeaders.findIndex(h => TIMESTAMP_ALIASES.includes(h));
    if (tsIdx === -1) tsIdx = 0;
    const tsKey = lowerHeaders[tsIdx];
    const tsSamples = (records || []).slice(0, 30).map(r => r[tsKey]).filter(Boolean);
    const timestampFormat = detectTimestampFormat(tsSamples);

    const columns = headers.map((h, i) => ({
        key: lowerHeaders[i],
        header: h,
        type: i === tsIdx ? 'datetime' : 'text',
    }));
    const nonTsCols = columns.filter(c => c.type !== 'datetime').map(c => c.key);

    // Detect numeric columns by sampling first 50 records
    const numericColumns = [];
    const sampleRows = (records || []).slice(0, 50);
    nonTsCols.forEach(col => {
        if (sampleRows.length === 0) return;
        const vals = sampleRows.map(r => r[col]).filter(v => v != null && v !== '');
        const numCount = vals.filter(v => !isNaN(parseFloat(v))).length;
        if (numCount > vals.length * 0.8 && vals.length > 0) {
            const hasNegative = vals.some(v => parseFloat(v) < 0);
            numericColumns.push({key: col, header: columns.find(c => c.key === col).header, hasNegative});
        }
    });

    const logColumns = [
        {key: tsKey, label: 'Time', display: 'time'},
        ...nonTsCols.map((key, i) => ({
            key,
            label: columns.find(c => c.key === key).header,
            display: i === 0 ? 'primary' : 'text',
        })),
    ];

    return {
        columns,
        timestampKey: tsKey,
        timestampFormat,
        filterColumns: nonTsCols,
        visibleFilterColumns: nonTsCols.slice(0, 4),
        logColumns,
        numericColumns,
        heatmapMetric: {type: 'count', column: null, label: 'record', labelPlural: 'records', thresholds: null},
        badgeColumn: null,
        badgeColors: {},
        primaryColumn: nonTsCols[0] || null,
        secondaryColumn: nonTsCols[1] || null,
        breakdownColumn: null,
    };
}

export function sampleDataSchema() {
    return {
        columns: [
            {key: 'timestamp', header: 'Timestamp', type: 'datetime'},
            {key: 'contributor', header: 'Contributor', type: 'text'},
            {key: 'table', header: 'Table', type: 'text'},
            {key: 'field', header: 'Field', type: 'text'},
            {key: 'action', header: 'Action', type: 'text'},
            {key: 'pkey', header: 'PKey', type: 'text'},
        ],
        timestampKey: 'timestamp',
        timestampFormat: 'iso',
        filterColumns: ['contributor', 'table', 'field', 'action', 'pkey'],
        visibleFilterColumns: ['contributor', 'table', 'field'],
        logColumns: [
            {key: 'timestamp', label: 'Time', display: 'time'},
            {key: 'contributor', label: 'Contributor', display: 'primary'},
            {keys: ['table', 'field'], label: 'Target', display: 'accent', separator: '.'},
            {key: 'pkey', label: 'PKey', display: 'mono'},
            {key: 'action', label: 'Action', display: 'badge'},
        ],
        numericColumns: [],
        heatmapMetric: {type: 'count', column: null, label: 'record', labelPlural: 'records', thresholds: [3, 8, 18]},
        badgeColumn: 'action',
        badgeColors: {
            insert: {bg: 'rgba(74,222,128,0.12)', fg: '#4ade80'},
            update: {bg: 'rgba(96,165,250,0.12)', fg: '#60a5fa'},
            delete: {bg: 'rgba(248,113,113,0.12)', fg: '#f87171'},
        },
        primaryColumn: 'contributor',
        secondaryColumn: 'table',
        breakdownColumn: 'action',
    };
}

export function financialDataSchema() {
    return {
        columns: [
            {key: 'timestamp', header: 'Timestamp', type: 'datetime'},
            {key: 'description', header: 'Description', type: 'text'},
            {key: 'category', header: 'Category', type: 'text'},
            {key: 'amount', header: 'Amount', type: 'text'},
            {key: 'balance', header: 'Balance', type: 'text'},
            {key: 'account', header: 'Account', type: 'text'},
        ],
        timestampKey: 'timestamp',
        timestampFormat: 'iso',
        filterColumns: ['description', 'category', 'amount', 'balance', 'account'],
        visibleFilterColumns: ['category', 'account', 'description'],
        logColumns: [
            {key: 'timestamp', label: 'Time', display: 'time'},
            {key: 'description', label: 'Description', display: 'primary'},
            {key: 'category', label: 'Category', display: 'badge'},
            {key: 'amount', label: 'Amount', display: 'mono'},
            {key: 'balance', label: 'Balance', display: 'mono'},
            {key: 'account', label: 'Account', display: 'text'},
        ],
        numericColumns: [
            {key: 'amount', header: 'Amount', hasNegative: true},
            {key: 'balance', header: 'Balance', hasNegative: true},
        ],
        heatmapMetric: {
            type: 'count',
            column: null,
            label: 'transaction',
            labelPlural: 'transactions',
            thresholds: null
        },
        badgeColumn: 'category',
        badgeColors: {
            Salary: {bg: 'rgba(74,222,128,0.12)', fg: '#4ade80'},
            Freelance: {bg: 'rgba(74,222,128,0.12)', fg: '#4ade80'},
            Groceries: {bg: 'rgba(96,165,250,0.12)', fg: '#60a5fa'},
            Dining: {bg: 'rgba(251,191,36,0.12)', fg: '#fbbf24'},
            Rent: {bg: 'rgba(248,113,113,0.12)', fg: '#f87171'},
            Utilities: {bg: 'rgba(168,85,247,0.12)', fg: '#a855f7'},
        },
        primaryColumn: 'category',
        secondaryColumn: 'account',
        breakdownColumn: 'category',
    };
}

export function ticketingDataSchema() {
    return {
        columns: [
            {key: 'timestamp', header: 'Timestamp', type: 'datetime'},
            {key: 'requestor', header: 'Requestor', type: 'text'},
            {key: 'ticket_id', header: 'Ticket #', type: 'text'},
            {key: 'subject', header: 'Subject', type: 'text'},
            {key: 'assigned_tech', header: 'Technician', type: 'text'},
            {key: 'first_response_hrs', header: 'Response (hrs)', type: 'text'},
            {key: 'status', header: 'Status', type: 'text'},
            {key: 'resolution_hrs', header: 'Resolution (hrs)', type: 'text'},
            {key: 'category', header: 'Category', type: 'text'},
            {key: 'priority', header: 'Priority', type: 'text'},
        ],
        timestampKey: 'timestamp',
        timestampFormat: 'iso',
        filterColumns: ['requestor', 'ticket_id', 'subject', 'assigned_tech', 'first_response_hrs', 'status', 'resolution_hrs', 'category', 'priority'],
        visibleFilterColumns: ['status', 'assigned_tech', 'category', 'priority'],
        logColumns: [
            {key: 'timestamp', label: 'Time', display: 'time'},
            {key: 'ticket_id', label: 'Ticket #', display: 'mono'},
            {key: 'subject', label: 'Subject', display: 'truncate'},
            {key: 'requestor', label: 'Requestor', display: 'primary'},
            {key: 'assigned_tech', label: 'Technician', display: 'text'},
            {key: 'status', label: 'Status', display: 'badge'},
            {key: 'priority', label: 'Priority', display: 'badge'},
            {key: 'first_response_hrs', label: 'Response', display: 'mono'},
            {key: 'resolution_hrs', label: 'Resolution', display: 'mono'},
        ],
        numericColumns: [
            {key: 'first_response_hrs', header: 'Response (hrs)', hasNegative: false},
            {key: 'resolution_hrs', header: 'Resolution (hrs)', hasNegative: false},
        ],
        heatmapMetric: {type: 'count', column: null, label: 'event', labelPlural: 'events', thresholds: null},
        badgeColumn: 'status',
        badgeColors: {
            Open: {bg: 'rgba(96,165,250,0.12)', fg: '#60a5fa'},
            'In Progress': {bg: 'rgba(251,191,36,0.12)', fg: '#fbbf24'},
            Waiting: {bg: 'rgba(168,85,247,0.12)', fg: '#a855f7'},
            Resolved: {bg: 'rgba(74,222,128,0.12)', fg: '#4ade80'},
            Closed: {bg: 'rgba(120,120,120,0.12)', fg: '#9ca3af'},
        },
        primaryColumn: 'assigned_tech',
        secondaryColumn: 'category',
        breakdownColumn: 'status',
    };
}
