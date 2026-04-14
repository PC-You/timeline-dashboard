/*
 * csv.js — Pure CSV/TSV parser and sample data generator
 */

import {dateKey} from './state.js';
import {sampleDataSchema, financialDataSchema, ticketingDataSchema} from './schema.js';

export function parseCSV(text) {
    let lines = text.split(/\r?\n/);
    let sep;

    // Check for Excel-style "sep=X" directive on first line
    const sepMatch = lines[0].match(/^sep=(.)/i);
    if (sepMatch) {
        sep = sepMatch[1];
        lines = lines.slice(1); // remove the sep= line
        text = lines.join('\n');
    } else {
        // Auto-detect delimiter from first line
        const firstLine = lines[0];
        if (firstLine.includes('\t')) sep = '\t';
        else if (firstLine.includes('|')) sep = '|';
        else if (firstLine.includes(';')) sep = ';';
        else sep = ',';
    }

    const rows = [];
    const len = text.length;
    let i = 0, row = [], field = '', inQuotes = false;
    while (i < len) {
        const ch = text[i];
        if (inQuotes) {
            if (ch === '"') {
                if (i + 1 < len && text[i + 1] === '"') {
                    field += '"';
                    i += 2;
                } else {
                    inQuotes = false;
                    i++;
                }
            } else {
                field += ch;
                i++;
            }
        } else {
            if (ch === '"') {
                inQuotes = true;
                i++;
            } else if (ch === sep) {
                row.push(field.trim());
                field = '';
                i++;
            } else if (ch === '\r' || ch === '\n') {
                row.push(field.trim());
                field = '';
                if (ch === '\r' && i + 1 < len && text[i + 1] === '\n') i++;
                i++;
                if (row.length > 0 && row.some(c => c !== '')) rows.push(row);
                row = [];
            } else {
                field += ch;
                i++;
            }
        }
    }
    row.push(field.trim());
    if (row.length > 0 && row.some(c => c !== '')) rows.push(row);
    if (rows.length < 2) return null;

    // Validate: header row should have more than 1 column
    const headers = rows[0];
    if (headers.length < 2) {
        console.warn('CSV parse: only 1 column detected. Delimiter may not have been recognized.');
        return null;
    }

    const keys = headers.map(h => h.toLowerCase().trim());
    const records = [];
    for (let r = 1; r < rows.length; r++) {
        const cols = rows[r];
        if (cols.length < 2) continue; // skip malformed rows
        const record = {};
        for (let c = 0; c < keys.length; c++) record[keys[c]] = (cols[c] || '').trim();
        records.push(record);
    }
    if (records.length === 0) return null;
    return {headers, records};
}

export function generateSampleData() {
    const contributors = ['alice.chen', 'bob.martinez', 'carol.wu', 'david.kim', 'eve.johnson', 'frank.liu', 'grace.patel'];
    const schemaDef = {
        users: ['id', 'email', 'name', 'role', 'status', 'last_login', 'avatar_url', 'created_at'],
        orders: ['id', 'user_id', 'total', 'status', 'shipping_address', 'tracking_number', 'created_at', 'updated_at'],
        products: ['id', 'name', 'sku', 'price', 'stock_count', 'category', 'description', 'is_active'],
        payments: ['id', 'order_id', 'amount', 'method', 'status', 'transaction_id', 'processed_at'],
        inventory: ['id', 'product_id', 'warehouse_id', 'quantity', 'reserved', 'last_restocked'],
        audit_log: ['id', 'actor_id', 'action', 'target_table', 'target_id', 'metadata', 'created_at'],
        categories: ['id', 'name', 'slug', 'parent_id', 'sort_order', 'is_visible'],
        sessions: ['id', 'user_id', 'token', 'ip_address', 'user_agent', 'expires_at', 'created_at'],
    };
    const actions = ['insert', 'update', 'update', 'update', 'update', 'delete'];
    const tables = Object.keys(schemaDef);
    const records = [];
    for (let y = 2021; y <= 2026; y++) {
        const end = y === 2026 ? new Date(2026, 3, 2) : new Date(y, 11, 31);
        for (let d = new Date(y, 0, 1); d <= end; d.setDate(d.getDate() + 1)) {
            const dow = d.getDay();
            let baseCount = dow === 0 || dow === 6 ? 2 : 12;
            baseCount = Math.max(0, baseCount + Math.floor((Math.random() - 0.4) * 10));
            for (let i = 0; i < baseCount; i++) {
                const table = tables[Math.floor(Math.random() * tables.length)];
                const fields = schemaDef[table];
                const field = fields[Math.floor(Math.random() * fields.length)];
                const contributor = contributors[Math.floor(Math.random() * contributors.length)];
                const action = actions[Math.floor(Math.random() * actions.length)];
                const hour = 8 + Math.floor(Math.random() * 10);
                const min = Math.floor(Math.random() * 60);
                const sec = Math.floor(Math.random() * 60);
                const ts = `${dateKey(d)}T${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
                const pkey = String(1000 + Math.floor(Math.random() * 9000));
                records.push({timestamp: ts, contributor, table, field, action, pkey});
            }
        }
    }
    return {records, schema: sampleDataSchema()};
}

export function generateFinancialData() {
    const accounts = ['Checking', 'Savings', 'Credit Card'];
    const incomeCategories = ['Salary', 'Freelance', 'Refund', 'Interest', 'Transfer In'];
    const expenseCategories = ['Groceries', 'Dining', 'Rent', 'Utilities', 'Gas', 'Entertainment', 'Shopping', 'Insurance', 'Transfer Out', 'Subscriptions'];
    const merchants = {
        Groceries: ['Whole Foods', 'Trader Joes', 'Costco', 'Safeway', 'Aldi'],
        Dining: ['Chipotle', 'Starbucks', 'Local Bistro', 'Pizza Palace', 'Thai Garden'],
        Rent: ['Maple Grove Apartments'], Utilities: ['Electric Co', 'Water Dept', 'Internet Plus'],
        Gas: ['Shell', 'BP', 'Chevron'], Entertainment: ['Netflix', 'Spotify', 'AMC Theaters', 'Steam'],
        Shopping: ['Amazon', 'Target', 'Best Buy', 'IKEA'], Insurance: ['State Farm', 'Allstate'],
        Subscriptions: ['Adobe CC', 'GitHub Pro', 'Cloud Storage', 'Gym Membership'],
    };
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];
    const records = [];
    const balances = {Checking: 4200, Savings: 12000, 'Credit Card': -850};

    for (let y = 2021; y <= 2026; y++) {
        const end = y === 2026 ? new Date(2026, 3, 2) : new Date(y, 11, 31);
        for (let d = new Date(y, 0, 1); d <= end; d.setDate(d.getDate() + 1)) {
            const dow = d.getDay();
            // Salary on 1st and 15th
            if (d.getDate() === 1 || d.getDate() === 15) {
                const amt = 2800 + Math.floor(Math.random() * 400);
                balances.Checking += amt;
                const h = 9, m = Math.floor(Math.random() * 30);
                records.push({
                    timestamp: `${dateKey(d)}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`,
                    description: 'Direct Deposit - Employer',
                    category: 'Salary',
                    amount: amt.toFixed(2),
                    balance: balances.Checking.toFixed(2),
                    account: 'Checking'
                });
            }
            // Rent on 1st
            if (d.getDate() === 1) {
                const amt = -(1400 + Math.floor(Math.random() * 100));
                balances.Checking += amt;
                records.push({
                    timestamp: `${dateKey(d)}T10:00:00`,
                    description: 'Maple Grove Apartments',
                    category: 'Rent',
                    amount: amt.toFixed(2),
                    balance: balances.Checking.toFixed(2),
                    account: 'Checking'
                });
            }
            // Daily expenses
            let txCount = dow === 0 || dow === 6 ? Math.floor(Math.random() * 4) : Math.floor(Math.random() * 3) + 1;
            for (let i = 0; i < txCount; i++) {
                const cat = pick(expenseCategories.filter(c => c !== 'Rent'));
                const desc = merchants[cat] ? pick(merchants[cat]) : cat;
                const baseAmt = cat === 'Utilities' ? 80 : cat === 'Insurance' ? 120 : cat === 'Gas' ? 45 : cat === 'Subscriptions' ? 15 : cat === 'Shopping' ? 60 : 18;
                const amt = -(baseAmt + Math.floor(Math.random() * baseAmt * 0.8));
                const acct = Math.random() > 0.3 ? 'Checking' : 'Credit Card';
                balances[acct] += amt;
                const h = 8 + Math.floor(Math.random() * 12);
                const mn = Math.floor(Math.random() * 60);
                const s = Math.floor(Math.random() * 60);
                records.push({
                    timestamp: `${dateKey(d)}T${String(h).padStart(2, '0')}:${String(mn).padStart(2, '0')}:${String(s).padStart(2, '0')}`,
                    description: desc,
                    category: cat,
                    amount: amt.toFixed(2),
                    balance: balances[acct].toFixed(2),
                    account: acct
                });
            }
            // Occasional income
            if (Math.random() < 0.03) {
                const cat = pick(incomeCategories.filter(c => c !== 'Salary'));
                const amt = cat === 'Freelance' ? 200 + Math.floor(Math.random() * 800) : cat === 'Interest' ? 5 + Math.floor(Math.random() * 20) : 20 + Math.floor(Math.random() * 100);
                const acct = cat === 'Interest' ? 'Savings' : 'Checking';
                balances[acct] += amt;
                records.push({
                    timestamp: `${dateKey(d)}T12:00:00`,
                    description: cat === 'Freelance' ? 'Client Payment' : cat,
                    category: cat,
                    amount: amt.toFixed(2),
                    balance: balances[acct].toFixed(2),
                    account: acct
                });
            }
        }
    }
    return {records, schema: financialDataSchema()};
}

export function generateTicketingData() {
    const requestors = ['jsmith', 'agarcia', 'mwilson', 'klee', 'jpatel', 'tchen', 'rjones', 'lnguyen', 'dwhite', 'mbrown'];
    const technicians = ['tech.sarah', 'tech.mike', 'tech.anna', 'tech.james', 'tech.priya'];
    const priorities = ['Low', 'Medium', 'Medium', 'High', 'Critical'];
    const categories = ['Hardware', 'Software', 'Network', 'Access', 'Email', 'Printing', 'VPN', 'Database'];
    const subjects = {
        Hardware: ['Laptop not powering on', 'Monitor flickering', 'Keyboard not responding', 'Docking station issues', 'Battery draining fast'],
        Software: ['Outlook keeps crashing', 'Excel formula errors', 'Cannot install update', 'Application freezing', 'License expired'],
        Network: ['Cannot connect to WiFi', 'Slow internet speeds', 'VPN disconnecting', 'DNS resolution failing', 'Packet loss on floor 3'],
        Access: ['Need access to shared drive', 'Account locked out', 'Password reset needed', 'New hire setup', 'Permission denied error'],
        Email: ['Not receiving emails', 'Attachment size limit', 'Calendar sync broken', 'Distribution list update', 'Out of office not working'],
        Printing: ['Printer jam', 'Print jobs stuck in queue', 'Cannot find network printer', 'Color printing not working', 'Scanner not detected'],
        VPN: ['Cannot establish VPN connection', 'VPN extremely slow', 'Two-factor auth failing', 'Split tunnel not working', 'VPN drops after 10 min'],
        Database: ['Query timeout errors', 'Connection pool exhausted', 'Replication lag', 'Deadlock detected', 'Backup job failed'],
    };
    const statuses = ['Open', 'In Progress', 'Waiting', 'Resolved', 'Closed'];
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];
    const records = [];
    let ticketNum = 10000;

    for (let y = 2021; y <= 2026; y++) {
        const end = y === 2026 ? new Date(2026, 3, 2) : new Date(y, 11, 31);
        for (let d = new Date(y, 0, 1); d <= end; d.setDate(d.getDate() + 1)) {
            const dow = d.getDay();
            if (dow === 0) continue; // no tickets on Sunday
            const newTickets = dow === 6 ? Math.floor(Math.random() * 2) : 1 + Math.floor(Math.random() * 4);
            for (let i = 0; i < newTickets; i++) {
                ticketNum++;
                const cat = pick(categories);
                const subject = pick(subjects[cat]);
                const requestor = pick(requestors);
                const tech = pick(technicians);
                const priority = pick(priorities);
                const h = 7 + Math.floor(Math.random() * 10);
                const mn = Math.floor(Math.random() * 60);
                const baseTs = `${dateKey(d)}T${String(h).padStart(2, '0')}:${String(mn).padStart(2, '0')}:00`;

                // Create lifecycle events for this ticket
                const responseHrs = (0.5 + Math.random() * 23).toFixed(1);
                const resolveHrs = (parseFloat(responseHrs) + 1 + Math.random() * 72).toFixed(1);
                const willResolve = Math.random() > 0.15;
                const willEscalate = !willResolve && Math.random() > 0.5;

                // Event 1: Created (Open)
                records.push({
                    timestamp: baseTs,
                    requestor,
                    ticket_id: `TK-${ticketNum}`,
                    subject,
                    assigned_tech: tech,
                    first_response_hrs: '',
                    status: 'Open',
                    resolution_hrs: '',
                    category: cat,
                    priority
                });

                // Event 2: In Progress (same day or next day)
                const progressOffset = Math.floor(Math.random() * 3);
                const pd = new Date(d);
                pd.setDate(pd.getDate() + progressOffset);
                if (pd <= end) {
                    const ph = Math.min(h + 1 + Math.floor(Math.random() * 4), 18);
                    records.push({
                        timestamp: `${dateKey(pd)}T${String(ph).padStart(2, '0')}:${String(mn).padStart(2, '0')}:00`,
                        requestor,
                        ticket_id: `TK-${ticketNum}`,
                        subject,
                        assigned_tech: tech,
                        first_response_hrs: responseHrs,
                        status: 'In Progress',
                        resolution_hrs: '',
                        category: cat,
                        priority
                    });
                }

                if (willResolve) {
                    const resolveDays = Math.floor(parseFloat(resolveHrs) / 24);
                    const rd = new Date(d);
                    rd.setDate(rd.getDate() + resolveDays + 1);
                    if (rd <= end) {
                        const rh = 9 + Math.floor(Math.random() * 8);
                        records.push({
                            timestamp: `${dateKey(rd)}T${String(rh).padStart(2, '0')}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}:00`,
                            requestor,
                            ticket_id: `TK-${ticketNum}`,
                            subject,
                            assigned_tech: tech,
                            first_response_hrs: responseHrs,
                            status: 'Resolved',
                            resolution_hrs: resolveHrs,
                            category: cat,
                            priority
                        });
                        // Close a few days later
                        const cd = new Date(rd);
                        cd.setDate(cd.getDate() + 1 + Math.floor(Math.random() * 3));
                        if (cd <= end) {
                            records.push({
                                timestamp: `${dateKey(cd)}T09:00:00`,
                                requestor,
                                ticket_id: `TK-${ticketNum}`,
                                subject,
                                assigned_tech: tech,
                                first_response_hrs: responseHrs,
                                status: 'Closed',
                                resolution_hrs: resolveHrs,
                                category: cat,
                                priority
                            });
                        }
                    }
                } else if (willEscalate) {
                    const ed = new Date(d);
                    ed.setDate(ed.getDate() + 2 + Math.floor(Math.random() * 3));
                    if (ed <= end) {
                        records.push({
                            timestamp: `${dateKey(ed)}T14:00:00`,
                            requestor,
                            ticket_id: `TK-${ticketNum}`,
                            subject,
                            assigned_tech: pick(technicians),
                            first_response_hrs: responseHrs,
                            status: 'Waiting',
                            resolution_hrs: '',
                            category: cat,
                            priority
                        });
                    }
                }
            }
        }
    }
    records.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    return {records, schema: ticketingDataSchema()};
}
