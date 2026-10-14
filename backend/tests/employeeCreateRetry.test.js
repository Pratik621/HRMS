const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');
const util = require('node:util');

// Employee-creation retry safety (Patch B). The real router and the real onboarding-ticket helper
// run against an in-memory database double injected into the require cache — never a real
// Supabase project. All data is fabricated.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-secret';
const jwt = require('jsonwebtoken');

// ── In-memory database double with failure injection ─────────────────────────────────────
const db = { employees: [], support_tickets: [], ticket_history: [] };
const hooks = {
    employeeInserts: [],          // queue of behaviours for inserts into employees (default: 'ok')
    failEmailLookupNumbers: new Set(), // ordinal numbers of email-filtered employee selects to fail
    failTicketDepartments: new Set(),  // support_tickets inserts for these departments fail
    afterEmailLookup: new Map(),       // ordinal → callback run right after that email lookup returns
};
const stats = { employeeInsertCalls: 0, emailLookups: 0, idLookups: 0, insertedEmployeeIds: [] };
const LOST = { message: 'TypeError: fetch failed', code: '', details: '' }; // what supabase-js returns on a dropped connection

function makeQuery(table) {
    const filters = [];
    let op = 'select';
    let payload = null;
    let single = false;
    let head = false;
    let limit = Infinity;
    const matches = (r) => filters.every(([kind, c, v]) => {
        const val = r[c] == null ? '' : String(r[c]);
        if (kind === 'eq') return val === String(v);
        if (kind === 'ilike') return val.toLowerCase().includes(String(v).replace(/%/g, '').toLowerCase());
        if (kind === 'like') return val.startsWith(String(v).replace(/%/g, ''));
        return true;
    });
    const q = {
        select(_cols, opts) { if (opts?.head) head = true; return q; },
        eq(c, v) { filters.push(['eq', c, v]); return q; },
        ilike(c, v) { filters.push(['ilike', c, v]); return q; },
        like(c, v) { filters.push(['like', c, v]); return q; },
        order() { return q; }, in() { return q; }, or() { return q; },
        limit(n) { limit = n; return q; },
        single() { single = true; return q; },
        maybeSingle() { single = true; return q; },
        insert(r) { op = 'insert'; payload = r; return q; },
        update(r) { op = 'update'; payload = r; return q; },
        then(resolve, reject) {
            return Promise.resolve(run()).then(resolve, reject);
        },
    };
    function run() {
        if (op === 'insert') {
            const rows = (Array.isArray(payload) ? payload : [payload]).map((r) => ({ ...r }));
            if (table === 'employees') {
                stats.employeeInsertCalls++;
                stats.insertedEmployeeIds.push(rows[0]?.employee_id);
                const behaviour = hooks.employeeInserts.length ? hooks.employeeInserts.shift() : 'ok';
                if (behaviour === 'lose-without-commit') return { data: null, error: { ...LOST } };
                if (typeof behaviour === 'object') return { data: null, error: behaviour };
                rows.forEach((r, i) => { r.id = 900 + db.employees.length + i; });
                db.employees.push(...rows);
                if (behaviour === 'commit-then-lose') return { data: null, error: { ...LOST } };
                return { data: rows, error: null };
            }
            if (table === 'support_tickets' && rows.some((r) => hooks.failTicketDepartments.has(r.department))) {
                return { data: null, error: { message: 'simulated ticket insert failure', code: 'XX000' } };
            }
            rows.forEach((r, i) => { r.id = r.id || 7000 + db[table].length + i; });
            db[table].push(...rows);
            return { data: single ? rows[0] : rows, error: null };
        }
        if (op === 'update') {
            db[table].filter(matches).forEach((r) => Object.assign(r, payload));
            return { data: null, error: null };
        }
        let afterLookup = null;
        if (table === 'employees' && filters.some(([kind, c]) => kind === 'eq' && c === 'id')) stats.idLookups++;
        if (table === 'employees' && filters.some(([kind, c]) => kind === 'eq' && c === 'email')) {
            stats.emailLookups++;
            if (hooks.failEmailLookupNumbers.has(stats.emailLookups)) return { data: null, error: { ...LOST } };
            afterLookup = hooks.afterEmailLookup.get(stats.emailLookups) || null;
        }
        const found = db[table].filter(matches).slice(0, limit).map((r) => ({ ...r }));
        if (afterLookup) afterLookup();
        if (head) return { data: null, count: found.length, error: null };
        return { data: single ? (found[0] || null) : found, error: null };
    }
    return q;
}

let idCalls = 0;
const cacheFake = (rel, exports) => { require.cache[path.resolve(__dirname, rel)] = { id: 'fake', filename: 'fake', loaded: true, exports }; };
cacheFake('../config/supabase.js', { from: (t) => makeQuery(t), storage: { from: () => ({}) } });
cacheFake('../services/emailService.js', { sendShiftChangeEmail: async () => ({ success: true }) });
// Counts every employee_id generated, so tests can prove one attempt never mints a second ID.
cacheFake('../utils/employeeId.js', { generateNextEmployeeId: async () => { idCalls++; return `B2B2610${String(idCalls).padStart(2, '0')}`; } });
delete require.cache[require.resolve('../utils/onboardingTickets')]; // the REAL helper, bound to the fake db

const { isDefiniteDbError, duplicateKeyTarget } = require('../utils/employeeCreation');
const { createOnboardingTickets } = require('../utils/onboardingTickets');

const PLAIN = 'InitPass#123';
const ADMIN = jwt.sign({ id: 1, employeeId: 'ADMIN01', role: 'admin', email: 'admin@example.invalid' }, process.env.JWT_SECRET);
const DESKTOP = jwt.sign({ id: 2, employeeId: 'IT01', role: 'desktop_support' }, process.env.JWT_SECRET);
const EMPLOYEE = jwt.sign({ id: 3, employeeId: 'EMP01', role: 'employee' }, process.env.JWT_SECRET);
const body = (extra = {}) => ({
    first_name: 'New', last_name: 'Hire', email: 'newhire@example.invalid', joining_date: '2026-10-01',
    designation: 'Tester', department: 'QA', reporting_manager: 'Some Manager', phone: '0000000000', dob: '1990-01-01',
    blood_group: 'O+', emergency_contact: '0000000000', address: 'Test address', password: PLAIN, ...extra,
});
const reset = () => {
    db.employees = [{ id: 1, employee_id: 'ADMIN01', email: 'admin@example.invalid', first_name: 'Ad', last_name: 'Min', role: 'admin', is_active: true }];
    db.support_tickets = [];
    db.ticket_history = [];
    hooks.employeeInserts = [];
    hooks.failEmailLookupNumbers = new Set();
    hooks.failTicketDepartments = new Set();
    hooks.afterEmailLookup = new Map();
    stats.employeeInsertCalls = 0;
    stats.emailLookups = 0;
    stats.idLookups = 0;
    stats.insertedEmployeeIds = [];
    idCalls = 0;
};
const newHires = () => db.employees.filter((e) => e.email === 'newhire@example.invalid');

// ── Unit tests ───────────────────────────────────────────────────────────────────────────
describe('error classification (unit)', () => {
    test('coded database/PostgREST errors are definite; uncoded ones are ambiguous', () => {
        for (const code of ['23505', '23514', '42703', 'PGRST204', 'XX000']) assert.equal(isDefiniteDbError({ code }), true, code);
        for (const e of [{ code: '' }, { message: 'TypeError: fetch failed' }, { name: 'TimeoutError', message: 'timed out' }, undefined, null, { code: 504 }]) {
            assert.equal(isDefiniteDbError(e), false, JSON.stringify(e));
        }
    });
    test('duplicateKeyTarget identifies the violated unique constraint', () => {
        assert.equal(duplicateKeyTarget({ code: '23505', message: 'duplicate key value violates unique constraint "employees_employee_id_key"' }), 'employee_id');
        assert.equal(duplicateKeyTarget({ code: '23505', message: 'duplicate key value violates unique constraint "employees_email_key"' }), 'email');
        assert.equal(duplicateKeyTarget({ code: '23505', message: 'dup', details: 'Key (email)=(a@example.invalid) already exists.' }), 'email');
        assert.equal(duplicateKeyTarget({ code: '23505', message: 'dup on something else' }), null);
        assert.equal(duplicateKeyTarget({ code: '23514', message: 'employees_email_key' }), null);
    });
});

describe('createOnboardingTickets reports its outcome (unit, real helper)', () => {
    beforeEach(reset);
    const employee = { id: 50, employee_id: 'B2B261050', first_name: 'Tick', last_name: 'Et', designation: 'Tester' };
    const actor = { employeeId: 'ADMIN01' };
    test('returns created departments on success', async () => {
        const r = await createOnboardingTickets(makeSupabase(), { employee, actor });
        assert.deepEqual(r, { created: ['IT', 'Marketing'], failed: [], skipped: [] });
        assert.equal(db.support_tickets.length, 2);
    });
    test('reports a failed department instead of failing silently, and never throws', async () => {
        hooks.failTicketDepartments.add('Marketing');
        const r = await createOnboardingTickets(makeSupabase(), { employee, actor });
        assert.deepEqual(r.created, ['IT']);
        assert.equal(r.failed.length, 1);
        assert.equal(r.failed[0].department, 'Marketing');
    });
    test('departments filter + skipExisting never duplicates a ticket', async () => {
        await createOnboardingTickets(makeSupabase(), { employee, actor, departments: ['IT'] });
        const r = await createOnboardingTickets(makeSupabase(), { employee, actor, skipExisting: true });
        assert.deepEqual(r, { created: ['Marketing'], failed: [], skipped: ['IT'] });
        assert.equal(db.support_tickets.filter((t) => t.department === 'IT').length, 1);
    });
});
function makeSupabase() { return { from: (t) => makeQuery(t) }; }

// ── Route tests ──────────────────────────────────────────────────────────────────────────
describe('POST /api/employees: retry safety', () => {
    let server;
    let base;
    const logged = [];
    const originals = { log: console.log, warn: console.warn, error: console.error };
    before(async () => {
        const capture = (...a) => logged.push(util.format(...a));
        console.log = capture; console.warn = capture; console.error = capture;
        const express = require('express');
        const app = express();
        app.use(express.json());
        delete require.cache[require.resolve('../routes/employeeRoutes')];
        app.use('/api/employees', require('../routes/employeeRoutes'));
        server = http.createServer(app);
        await new Promise((r) => server.listen(0, '127.0.0.1', r));
        base = `http://127.0.0.1:${server.address().port}`;
    });
    after(async () => {
        server.closeAllConnections?.();
        await new Promise((r) => server.close(r));
        Object.assign(console, originals);
    });
    beforeEach(() => { reset(); logged.length = 0; });

    const post = async (p, payload, token = ADMIN) => {
        const res = await fetch(base + p, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(payload),
        });
        const text = await res.text();
        return { status: res.status, text, body: JSON.parse(text) };
    };
    const assertNoSecretsIn = (r) => {
        assert.equal(r.text.includes(PLAIN), false, 'plaintext password in response');
        assert.equal(/\$2[aby]\$/.test(r.text), false, 'bcrypt hash in response');
        assert.equal(logged.some((l) => l.includes(PLAIN) || /\$2[aby]\$\d{2}\$[./A-Za-z0-9]{20}/.test(l)), false, 'password or hash in logs');
    };

    describe('save succeeds but its response is lost', () => {
        test('recovered by reading the row back: 201, exactly one account, one ID, insert sent once', async () => {
            hooks.employeeInserts.push('commit-then-lose');
            const r = await post('/api/employees', body());
            assert.equal(r.status, 201);
            assert.equal(r.body.success, true);
            assert.equal(r.body.recovered_after_lost_response, true);
            assert.equal(newHires().length, 1, 'exactly one account');
            assert.equal(r.body.employee.employee_id, newHires()[0].employee_id);
            assert.equal(stats.employeeInsertCalls, 1, 'insert never re-sent');
            assert.equal(idCalls, 1, 'no second employee ID generated');
            assert.notEqual(r.body.message, 'Email already exists');
            assertNoSecretsIn(r);
        });

        test('onboarding tickets are raised exactly once for the recovered employee', async () => {
            hooks.employeeInserts.push('commit-then-lose');
            const r = await post('/api/employees', body());
            assert.deepEqual(r.body.onboarding_tickets.created, ['IT', 'Marketing']);
            assert.equal(db.support_tickets.length, 2);
        });

        test('if the read-back also fails: 503 CREATE_OUTCOME_UNKNOWN, no retry, still one account', async () => {
            hooks.employeeInserts.push('commit-then-lose');
            hooks.failEmailLookupNumbers.add(2); // #1 = pre-check, #2 = read-back after the lost response
            const r = await post('/api/employees', body());
            assert.equal(r.status, 503);
            assert.equal(r.body.code, 'CREATE_OUTCOME_UNKNOWN');
            assert.equal(r.body.attempted_employee_id, newHires()[0].employee_id);
            assert.equal(newHires().length, 1);
            assert.equal(stats.employeeInsertCalls, 1, 'no blind retry of the insert');
            assert.equal(db.support_tickets.length, 0, 'no tickets while the outcome is unknown');
        });

        test('timeout where nothing was saved: 503, no retry, no account, no tickets', async () => {
            hooks.employeeInserts.push('lose-without-commit');
            const r = await post('/api/employees', body());
            assert.equal(r.status, 503);
            assert.equal(r.body.code, 'CREATE_OUTCOME_UNKNOWN');
            assert.equal(newHires().length, 0);
            assert.equal(stats.employeeInsertCalls, 1);
            assert.equal(idCalls, 1);
            assert.equal(db.support_tickets.length, 0);
        });

        test('a gateway error with no error code (e.g. 504) is treated as ambiguous, not retried', async () => {
            hooks.employeeInserts.push({ message: '<html>504 Gateway Time-out</html>' });
            const r = await post('/api/employees', body());
            assert.equal(r.status, 503);
            assert.equal(stats.employeeInsertCalls, 1);
        });
    });

    describe('review: employee-ID stability and no second insert after an unknown outcome', () => {
        test('the ID generated once is the ID inserted, looked up and reported (503 path)', async () => {
            hooks.employeeInserts.push('commit-then-lose');
            hooks.failEmailLookupNumbers.add(2);
            const r = await post('/api/employees', body());
            assert.equal(r.status, 503);
            assert.equal(idCalls, 1, 'generated exactly once');
            assert.deepEqual(stats.insertedEmployeeIds, ['B2B261001']);
            assert.equal(r.body.attempted_employee_id, 'B2B261001');
            assert.equal(newHires()[0].employee_id, 'B2B261001');
        });

        test('the ID generated once is the ID recovered and returned (201 path)', async () => {
            hooks.employeeInserts.push('commit-then-lose');
            const r = await post('/api/employees', body());
            assert.equal(r.status, 201);
            assert.equal(idCalls, 1);
            assert.deepEqual(stats.insertedEmployeeIds, ['B2B261001']);
            assert.equal(r.body.employee.employee_id, 'B2B261001');
        });

        test('an unknown outcome on a column-fallback insert is not followed by another insert', async () => {
            // 1st insert: definite missing-column error → fallback insert; fallback's response is lost.
            hooks.employeeInserts.push({ code: '42703', message: 'column "isFlexibleShift" of relation "employees" does not exist' }, 'lose-without-commit');
            const r = await post('/api/employees', body());
            assert.equal(r.status, 503);
            assert.equal(stats.employeeInsertCalls, 2, 'original + one fallback, never a third');
            assert.deepEqual(stats.insertedEmployeeIds, ['B2B261001', 'B2B261001'], 'same ID throughout');
            assert.equal(newHires().length, 0);
        });

        test('read-back failure followed by a later success elsewhere still never re-inserts in this request', async () => {
            hooks.employeeInserts.push('lose-without-commit');
            hooks.failEmailLookupNumbers.add(2);
            const r = await post('/api/employees', body());
            assert.equal(r.status, 503);
            assert.equal(stats.employeeInsertCalls, 1);
        });
    });

    describe('review: recovery endpoint input validation and authentication', () => {
        for (const bad of ['abc', '0', '-1', '1.5', '1e3', '00012', '99999999999', '2147483648', '%20']) {
            test(`invalid employee id "${bad}" → 400 before any database lookup`, async () => {
                const r = await post(`/api/employees/${bad}/onboarding-tickets`, {});
                assert.equal(r.status, 400);
                assert.equal(r.body.message, 'Invalid employee id');
                assert.equal(stats.idLookups, 0);
                assert.equal(db.support_tickets.length, 0);
            });
        }

        test('largest valid integer id is accepted (404 when absent)', async () => {
            const r = await post('/api/employees/2147483647/onboarding-tickets', {});
            assert.equal(r.status, 404);
        });

        test('no token → 401; forged token → 401', async () => {
            const res = await fetch(`${base}/api/employees/1/onboarding-tickets`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
            assert.equal(res.status, 401);
            const forged = jwt.sign({ id: 1, employeeId: 'X', role: 'admin' }, 'wrong-secret');
            assert.equal((await post('/api/employees/1/onboarding-tickets', {}, forged)).status, 401);
            assert.equal(db.support_tickets.length, 0);
        });

        test('responses never include employee personal data or secrets', async () => {
            db.employees.push({ id: 77, employee_id: 'B2B261077', email: 'x@example.invalid', first_name: 'X', last_name: 'Y', password: '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWX1', aadhar_number: '123456789012' });
            const r = await post('/api/employees/77/onboarding-tickets', {});
            assert.equal(r.status, 200);
            assert.equal(/\$2[aby]\$|123456789012|x@example\.invalid/.test(r.text), false);
            assert.deepEqual(Object.keys(r.body).sort(), ['message', 'onboarding_tickets', 'success']);
        });
    });

    describe('genuine duplicate email', () => {
        test('pre-existing email: 400 EMAIL_EXISTS naming the holder, nothing inserted, no ID minted twice', async () => {
            db.employees.push({ id: 5, employee_id: 'B2B250105', email: 'newhire@example.invalid', first_name: 'Old', last_name: 'Timer', created_at: '2025-01-05T00:00:00Z' });
            const r = await post('/api/employees', body());
            assert.equal(r.status, 400);
            assert.equal(r.body.code, 'EMAIL_EXISTS');
            assert.equal(r.body.message, 'Email already exists');
            assert.equal(r.body.field, 'email');
            assert.equal(r.body.existing_employee_id, 'B2B250105');
            assert.equal(r.body.existing_created_at, '2025-01-05T00:00:00Z');
            assert.equal(stats.employeeInsertCalls, 0);
            assert.equal(newHires().length, 1);
        });

        test('email taken by a concurrent request after the check (23505 on email): 400, no retry', async () => {
            hooks.employeeInserts.push({ code: '23505', message: 'duplicate key value violates unique constraint "employees_email_key"' });
            db.employees.push({ id: 6, employee_id: 'B2B261099', email: 'other@example.invalid' }); // unrelated
            const r = await post('/api/employees', body());
            assert.equal(r.status, 400);
            assert.equal(r.body.code, 'EMAIL_EXISTS');
            assert.equal(stats.employeeInsertCalls, 1);
            assert.equal(idCalls, 1);
        });

        test('lost response where the email turns out to belong to a different account: 400 naming that account', async () => {
            // Another request saves this email right after our pre-check; our own insert is lost without committing.
            hooks.afterEmailLookup.set(1, () => db.employees.push({ id: 7, employee_id: 'B2B261077', email: 'newhire@example.invalid', created_at: '2026-10-14T00:00:00Z' }));
            hooks.employeeInserts.push('lose-without-commit');
            const r = await post('/api/employees', body());
            assert.equal(r.status, 400);
            assert.equal(r.body.code, 'EMAIL_EXISTS');
            assert.equal(r.body.existing_employee_id, 'B2B261077');
            assert.equal(stats.employeeInsertCalls, 1);
            assert.equal(newHires().length, 1, 'only the other account exists');
        });
    });

    describe('employee-ID collision (definite) is the only case that retries the insert', () => {
        test('23505 on employee_id: a fresh ID is used and exactly one account results', async () => {
            hooks.employeeInserts.push({ code: '23505', message: 'duplicate key value violates unique constraint "employees_employee_id_key"' });
            const r = await post('/api/employees', body());
            assert.equal(r.status, 201);
            assert.equal(newHires().length, 1);
            assert.equal(idCalls, 2, 'second ID only after the definite collision');
            assert.equal(stats.employeeInsertCalls, 2);
            assert.equal(r.body.employee.employee_id, 'B2B261002');
        });

        test('collisions are bounded (5 attempts) and end in a sanitized 500 with no account', async () => {
            for (let i = 0; i < 5; i++) hooks.employeeInserts.push({ code: '23505', message: 'duplicate key value violates unique constraint "employees_employee_id_key"' });
            const r = await post('/api/employees', body());
            assert.equal(r.status, 500);
            assert.equal(newHires().length, 0);
            assert.equal(stats.employeeInsertCalls, 5);
            assertNoSecretsIn(r);
        });
    });

    describe('onboarding-ticket failure after the employee is saved', () => {
        test('201 with the partial outcome reported; the employee is not created again', async () => {
            hooks.failTicketDepartments.add('Marketing');
            const r = await post('/api/employees', body());
            assert.equal(r.status, 201);
            assert.equal(r.body.success, true);
            assert.deepEqual(r.body.onboarding_tickets.created, ['IT']);
            assert.deepEqual(r.body.onboarding_tickets.failed.map((f) => f.department), ['Marketing']);
            assert.match(r.body.message, /Marketing/);
            assert.match(r.body.message, /onboarding-tickets/);
            assert.match(r.body.message, /Do not create the employee again/);
            assert.equal(newHires().length, 1);
            assert.equal(stats.employeeInsertCalls, 1);
        });

        test('recovery: POST /:id/onboarding-tickets raises only the missing ticket; repeating it is a no-op', async () => {
            hooks.failTicketDepartments.add('Marketing');
            const created = await post('/api/employees', body());
            hooks.failTicketDepartments.clear();
            const id = created.body.employee.id;

            const first = await post(`/api/employees/${id}/onboarding-tickets`, {});
            assert.equal(first.status, 200);
            assert.deepEqual(first.body.onboarding_tickets, { created: ['Marketing'], failed: [], skipped: ['IT'] });

            const again = await post(`/api/employees/${id}/onboarding-tickets`, {});
            assert.equal(again.status, 200);
            assert.deepEqual(again.body.onboarding_tickets, { created: [], failed: [], skipped: ['IT', 'Marketing'] });

            assert.equal(db.support_tickets.filter((t) => t.department === 'IT').length, 1);
            assert.equal(db.support_tickets.filter((t) => t.department === 'Marketing').length, 1);
            assert.equal(newHires().length, 1, 'recovery never creates or duplicates the employee');
        });

        test('recovery endpoint: still failing → 502 with the failed department; unknown employee → 404; bad input → 400', async () => {
            hooks.failTicketDepartments.add('IT');
            const created = await post('/api/employees', body());
            const id = created.body.employee.id;
            const still = await post(`/api/employees/${id}/onboarding-tickets`, { departments: ['IT'] });
            assert.equal(still.status, 502);
            assert.deepEqual(still.body.onboarding_tickets.failed.map((f) => f.department), ['IT']);
            assert.equal((await post('/api/employees/99999/onboarding-tickets', {})).status, 404);
            assert.equal((await post(`/api/employees/${id}/onboarding-tickets`, { departments: ['Finance'] })).status, 400);
            assert.equal((await post(`/api/employees/${id}/onboarding-tickets`, { departments: 'IT' })).status, 400);
        });

        test('recovery endpoint keeps the creator roles: desktop_support allowed, employee 403', async () => {
            const created = await post('/api/employees', body());
            const id = created.body.employee.id;
            assert.equal((await post(`/api/employees/${id}/onboarding-tickets`, {}, DESKTOP)).status, 200);
            assert.equal((await post(`/api/employees/${id}/onboarding-tickets`, {}, EMPLOYEE)).status, 403);
        });
    });

    describe('retrying the same creation attempt', () => {
        test('after an unknown outcome (503), re-submitting creates no second account and names the one that exists', async () => {
            hooks.employeeInserts.push('commit-then-lose');
            hooks.failEmailLookupNumbers.add(2);
            const first = await post('/api/employees', body());
            assert.equal(first.status, 503);

            const retry = await post('/api/employees', body());
            assert.equal(retry.status, 400);
            assert.equal(retry.body.code, 'EMAIL_EXISTS');
            assert.equal(retry.body.existing_employee_id, first.body.attempted_employee_id, 'HR can see it is the employee they just added');
            assert.equal(newHires().length, 1, 'still exactly one account');
            assert.equal(stats.employeeInsertCalls, 1, 'the retry never reached an insert');
        });

        test('after a success whose 201 the browser never received, re-submitting does not duplicate', async () => {
            const first = await post('/api/employees', body());
            assert.equal(first.status, 201);
            const retry = await post('/api/employees', body());
            assert.equal(retry.status, 400);
            assert.equal(retry.body.existing_employee_id, first.body.employee.employee_id);
            assert.equal(newHires().length, 1);
            assert.equal(db.support_tickets.length, 2, 'tickets not raised twice');
        });
    });

    describe('genuine database failure before the employee is saved', () => {
        test('definite insert error (e.g. check violation): sanitized 500, no account, insert tried once, no tickets', async () => {
            hooks.employeeInserts.push({ code: '23514', message: 'new row for relation "employees" violates check constraint "x"', details: 'Failing row contains (1, $2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWX1).' });
            const r = await post('/api/employees', body());
            assert.equal(r.status, 500);
            assert.equal(r.body.success, false);
            assert.equal(r.body.details, undefined);
            assert.equal(newHires().length, 0);
            assert.equal(stats.employeeInsertCalls, 1);
            assert.equal(db.support_tickets.length, 0);
            assertNoSecretsIn(r);
        });

        test('the email pre-check itself failing with a database error: 500, nothing inserted', async () => {
            hooks.failEmailLookupNumbers.add(1);
            const r = await post('/api/employees', body());
            assert.ok([500, 503].includes(r.status));
            assert.equal(stats.employeeInsertCalls, 0);
            assert.equal(newHires().length, 0);
        });

        test('missing optional column (coded error) still falls back without losing the password hash', async () => {
            hooks.employeeInserts.push({ code: 'PGRST204', message: "Could not find the 'isFlexibleShift' column of 'employees' in the schema cache" });
            const r = await post('/api/employees', body());
            assert.equal(r.status, 201);
            assert.equal(newHires().length, 1);
            assert.ok(newHires()[0].password && newHires()[0].password.startsWith('$2'));
        });
    });

    describe('existing protections are preserved', () => {
        test('role rules still apply (desktop_support cannot create an admin)', async () => {
            const r = await post('/api/employees', body({ role: 'admin' }), DESKTOP);
            assert.equal(r.status, 403);
            assert.equal(stats.employeeInsertCalls, 0);
        });
        test('password is still required and stored only as a bcrypt hash', async () => {
            assert.equal((await post('/api/employees', body({ password: '' }))).status, 400);
            const r = await post('/api/employees', body());
            assert.equal(r.status, 201);
            assert.notEqual(newHires()[0].password, PLAIN);
            assertNoSecretsIn(r);
        });
    });
});
