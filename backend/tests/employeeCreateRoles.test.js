const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');
const util = require('node:util');

// Role assignment on POST /api/employees: unit tests for the decision function, plus the real
// router against an in-memory database double (injected into the require cache — never a real
// Supabase project). All data is fabricated.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-secret';
const jwt = require('jsonwebtoken');

const db = { employees: [] };
const writes = [];
const employeeInsertFailures = [];
// Simulates "the row was saved, but the response never arrived": the insert commits, then the
// client sees a transport error (connection dropped, or the 15 s header timeout).
let commitThenLoseResponse = 0;
let onboardingTicketFailures = 0;
function makeQuery(table) {
    const filters = [];
    let op = 'select';
    let payload = null;
    let single = false;
    const rows = () => (db[table] || []).filter((r) => filters.every(([c, v]) => String(r[c]) === String(v)));
    const q = {
        select() { return q; }, eq(c, v) { filters.push([c, v]); return q; },
        order() { return q; }, limit() { return q; }, in() { return q; }, or() { return q; },
        single() { single = true; return q; }, maybeSingle() { single = true; return q; },
        insert(r) { op = 'insert'; payload = r; return q; },
        then(resolve, reject) {
            let result;
            if (op === 'insert' && table === 'employees' && employeeInsertFailures.length) {
                writes.push({ table, op: 'failed-insert' });
                result = { data: null, error: employeeInsertFailures.shift() };
            } else if (op === 'insert') {
                const inserted = (Array.isArray(payload) ? payload : [payload]).map((r, i) => ({ id: 500 + db[table].length + i, ...r }));
                db[table].push(...inserted);
                writes.push({ table, op, rows: inserted });
                result = { data: inserted, error: null };
                if (table === 'employees' && commitThenLoseResponse > 0) {
                    commitThenLoseResponse--;
                    result = { data: null, error: { message: 'TypeError: fetch failed', code: '', details: '' } };
                }
            } else {
                const found = rows();
                result = { data: single ? (found[0] || null) : found, error: null };
            }
            return Promise.resolve(result).then(resolve, reject);
        },
    };
    return q;
}
const cacheFake = (rel, exports) => { require.cache[path.resolve(__dirname, rel)] = { id: 'fake', filename: 'fake', loaded: true, exports }; };
cacheFake('../config/supabase.js', { from: (t) => makeQuery(t), storage: { from: () => ({}) } });
cacheFake('../services/emailService.js', { sendShiftChangeEmail: async () => ({ success: true }) });
cacheFake('../utils/employeeId.js', { generateNextEmployeeId: async () => `TEST${String(db.employees.length + 1).padStart(3, '0')}` });
cacheFake('../utils/onboardingTickets.js', {
    createOnboardingTickets: async () => {
        if (onboardingTicketFailures > 0) { onboardingTicketFailures--; throw new Error('simulated ticket failure'); }
    },
});

const { resolveNewEmployeeRole } = require('../utils/employeeRoles');
const { safeDbErrorDetails } = require('../utils/employeeFields');
const { ASSIGNABLE_EMPLOYEE_ROLES, ROLE_ASSIGNER_ROLES } = require('../config/roleGroups');
const ELEVATED = ASSIGNABLE_EMPLOYEE_ROLES.filter((r) => r !== 'employee');

describe('resolveNewEmployeeRole (unit)', () => {
    test('no role requested → employee, for every allowed creator', () => {
        for (const caller of ['admin', 'sub_admin', 'hr', 'desktop_support']) {
            for (const requested of [undefined, null, '']) {
                assert.deepEqual(resolveNewEmployeeRole(requested, caller), { role: 'employee' }, `${caller}/${requested}`);
            }
        }
    });

    test('admin, sub_admin and hr may assign every valid role (existing role-change permission)', () => {
        for (const caller of ROLE_ASSIGNER_ROLES) {
            for (const role of ASSIGNABLE_EMPLOYEE_ROLES) {
                assert.deepEqual(resolveNewEmployeeRole(role, caller), { role }, `${caller} → ${role}`);
            }
        }
    });

    test('desktop_support may create "employee" explicitly', () => {
        assert.deepEqual(resolveNewEmployeeRole('employee', 'desktop_support'), { role: 'employee' });
    });

    test('desktop_support is refused (403) for every elevated role, including admin', () => {
        for (const role of ELEVATED) {
            const d = resolveNewEmployeeRole(role, 'desktop_support');
            assert.equal(d.role, undefined, role);
            assert.equal(d.status, 403, role);
        }
    });

    test('unknown, mis-cased or non-string roles are rejected (400), never guessed', () => {
        for (const role of ['superadmin', 'Admin', 'ADMIN', ' admin', 'admin ', 'root', 42, true, {}, ['admin']]) {
            const d = resolveNewEmployeeRole(role, 'admin');
            assert.equal(d.role, undefined, String(role));
            assert.equal(d.status, 400, String(role));
        }
    });

    test('a caller whose role cannot be determined is refused (403), even for the default role', () => {
        for (const caller of [undefined, null, '', 42]) {
            const d = resolveNewEmployeeRole(undefined, caller);
            assert.equal(d.role, undefined);
            assert.equal(d.status, 403);
        }
    });

    test('other roles that somehow reach the function cannot elevate', () => {
        for (const caller of ['employee', 'manager', 'finance', 'housekeeper']) {
            assert.equal(resolveNewEmployeeRole('admin', caller).status, 403, caller);
        }
    });
});

describe('safeDbErrorDetails (unit)', () => {
    test('drops Postgres "Failing row contains" details (they hold the whole row)', () => {
        assert.equal(safeDbErrorDetails({ details: 'Failing row contains (1, a, $2b$10$abcdefghijklmnopqrstuv, 1234 5678 9012).' }), undefined);
    });
    test('drops anything containing a bcrypt hash', () => {
        assert.equal(safeDbErrorDetails({ hint: 'value $2a$10$xxxxxxxxxxxxxxxxxxxxxx' }), undefined);
    });
    test('keeps harmless details and hints', () => {
        assert.equal(safeDbErrorDetails({ details: 'Key (email)=(a@example.invalid) already exists.' }), 'Key (email)=(a@example.invalid) already exists.');
        assert.equal(safeDbErrorDetails({ hint: 'Check the column name' }), 'Check the column name');
    });
    test('handles missing/odd input', () => {
        assert.equal(safeDbErrorDetails(undefined), undefined);
        assert.equal(safeDbErrorDetails({}), undefined);
        assert.equal(safeDbErrorDetails({ details: 42 }), undefined);
    });
});

describe('POST /api/employees role enforcement (real router)', () => {
    let server;
    let base;
    const logged = [];
    const originals = { log: console.log, warn: console.warn, error: console.error };
    const tokenFor = (role, employeeId = `${role.toUpperCase()}01`) => jwt.sign({ id: 1, employeeId, role }, process.env.JWT_SECRET);
    const body = (extra = {}) => ({
        first_name: 'New', last_name: 'Hire', email: `hire${Math.random().toString(36).slice(2, 8)}@example.invalid`, joining_date: '2026-10-01',
        designation: 'Tester', department: 'QA', reporting_manager: 'Some Manager', phone: '0000000000', dob: '1990-01-01',
        blood_group: 'O+', emergency_contact: '0000000000', address: 'Test address', password: 'InitPass#123', ...extra,
    });

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
    beforeEach(() => {
        db.employees = []; writes.length = 0; employeeInsertFailures.length = 0; logged.length = 0;
        commitThenLoseResponse = 0; onboardingTicketFailures = 0;
    });

    const create = async (payload, token) => {
        const res = await fetch(`${base}/api/employees`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify(payload),
        });
        return { status: res.status, body: await res.json() };
    };
    const inserted = () => writes.filter((w) => w.op === 'insert').flatMap((w) => w.rows);
    const insertAttempted = () => writes.some((w) => w.op === 'insert' || w.op === 'failed-insert');

    describe('every allowed creator role can create a standard employee', () => {
        for (const role of ['admin', 'sub_admin', 'hr', 'desktop_support']) {
            test(`${role}: no role sent → 201, stored as employee`, async () => {
                const r = await create(body(), tokenFor(role));
                assert.equal(r.status, 201);
                assert.equal(inserted()[0].role, 'employee');
            });
            test(`${role}: role "employee" sent (what Add Employee sends) → 201`, async () => {
                const r = await create(body({ role: 'employee' }), tokenFor(role));
                assert.equal(r.status, 201);
                assert.equal(inserted()[0].role, 'employee');
            });
        }
    });

    describe('VULN: desktop_support cannot create admin or other elevated accounts', () => {
        for (const role of ELEVATED) {
            test(`desktop_support → role "${role}" is refused with 403 and nothing is written`, async () => {
                const r = await create(body({ role }), tokenFor('desktop_support'));
                assert.equal(r.status, 403);
                assert.equal(r.body.field, 'role');
                assert.equal(insertAttempted(), false);
            });
        }

        test('the refusal is logged with caller and requested role (no password in the log)', async () => {
            await create(body({ role: 'admin' }), tokenFor('desktop_support', 'IT01'));
            assert.ok(logged.some((l) => l.includes("role 'admin' refused") && l.includes('IT01') && l.includes('desktop_support')));
            assert.equal(logged.some((l) => l.includes('InitPass#123')), false);
        });
    });

    describe('legitimate elevated-account creation by authorized roles', () => {
        test('admin can create an admin account', async () => {
            const r = await create(body({ role: 'admin' }), tokenFor('admin'));
            assert.equal(r.status, 201);
            assert.equal(inserted()[0].role, 'admin');
        });
        test('sub_admin can create an hr account; hr can create a sub_admin account', async () => {
            assert.equal((await create(body({ role: 'hr' }), tokenFor('sub_admin'))).status, 201);
            assert.equal((await create(body({ role: 'sub_admin' }), tokenFor('hr'))).status, 201);
            assert.deepEqual(inserted().map((e) => e.role), ['hr', 'sub_admin']);
        });
        test('an unknown role is rejected even for admin (400), nothing written', async () => {
            const r = await create(body({ role: 'superadmin' }), tokenFor('admin'));
            assert.equal(r.status, 400);
            assert.equal(insertAttempted(), false);
        });
    });

    describe('callers who may not create employees at all (unchanged middleware)', () => {
        for (const role of ['employee', 'manager', 'finance', 'housekeeper']) {
            test(`${role} → 403, nothing written`, async () => {
                const r = await create(body(), tokenFor(role));
                assert.equal(r.status, 403);
                assert.equal(insertAttempted(), false);
            });
        }
        test('missing token → 401', async () => {
            assert.equal((await create(body())).status, 401);
            assert.equal(insertAttempted(), false);
        });
        test('invalid/forged token → 401', async () => {
            const forged = jwt.sign({ id: 1, employeeId: 'X', role: 'admin' }, 'not-the-secret');
            assert.equal((await create(body({ role: 'admin' }), forged)).status, 401);
            assert.equal(insertAttempted(), false);
        });
        test('valid token without a role claim → 403', async () => {
            const noRole = jwt.sign({ id: 1, employeeId: 'X' }, process.env.JWT_SECRET);
            assert.equal((await create(body(), noRole)).status, 403);
            assert.equal(insertAttempted(), false);
        });
    });

    describe('error responses and logs never expose the hash, password or row details', () => {
        test('a not-null/check violation with "Failing row contains" details → 500 without details, hash or password', async () => {
            const failingRow = { message: 'new row for relation "employees" violates check constraint "x"', code: '23514', details: 'Failing row contains (777, TEST001, $2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUV12, 123456789012).' };
            for (let i = 0; i < 5; i++) employeeInsertFailures.push({ ...failingRow });
            const r = await create(body(), tokenFor('admin'));
            assert.equal(r.status, 500);
            assert.equal(r.body.details, undefined);
            const text = JSON.stringify(r.body);
            assert.equal(/\$2[aby]\$/.test(text), false);
            assert.equal(text.includes('Failing row'), false);
            assert.equal(text.includes('InitPass#123'), false);
            const leaks = logged.filter((l) => /\$2[aby]\$/.test(l) || l.includes('Failing row') || l.includes('InitPass#123'));
            assert.deepEqual(leaks, []);
        });

        test('harmless DB details are still returned for troubleshooting', async () => {
            for (let i = 0; i < 5; i++) employeeInsertFailures.push({ message: 'boom', code: 'XX000', details: 'Some harmless detail' });
            const r = await create(body(), tokenFor('admin'));
            assert.equal(r.status, 500);
            assert.equal(r.body.details, 'Some harmless detail');
        });

        test('successful creation returns only id and employee_id', async () => {
            const r = await create(body({ role: 'admin' }), tokenFor('admin'));
            assert.deepEqual(Object.keys(r.body.employee).sort(), ['employee_id', 'id']);
        });
    });

    // Formerly TODO characterization tests for the create retry loop. Fixed in Patch B, now
    // regular regression tests (full coverage in employeeCreateRetry.test.js).
    describe('create retry loop after a save whose outcome is unknown', () => {
        test('a committed insert whose response is lost must not be reported as "Email already exists"',
            async () => {
                commitThenLoseResponse = 1;
                const r = await create(body(), tokenFor('admin'));
                assert.equal(db.employees.length, 1, 'exactly one row exists');
                assert.notEqual(r.body.message, 'Email already exists', 'HR is told the email is taken although the employee was just created');
                assert.ok([201, 503].includes(r.status), `expected created (201) or an explicit "outcome unknown" (503), got ${r.status}`);
            });

        test('an onboarding-ticket failure after a successful insert must not be reported as "Email already exists"',
            async () => {
                onboardingTicketFailures = 1;
                const r = await create(body(), tokenFor('admin'));
                assert.equal(db.employees.length, 1);
                assert.notEqual(r.body.message, 'Email already exists');
            });
    });
});
