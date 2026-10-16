const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');
const bcrypt = require('bcryptjs');

// Real auth/employee route handlers against an in-memory database double (injected into the
// require cache), so nothing here touches a real Supabase project. All data is fabricated.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-only-refresh-secret';
const jwt = require('jsonwebtoken');

// ── Minimal in-memory Supabase double ────────────────────────────────────────────────────
const db = { employees: [], password_reset_otps: [] };
const writes = [];
// Errors to return from the next inserts into `employees`, in order (simulates DB failures).
const employeeInsertFailures = [];
function makeQuery(table) {
    const filters = [];
    let op = 'select';
    let payload = null;
    let single = false;
    let upsertKey = null;
    const rows = () => (db[table] || []).filter((r) => filters.every(([c, v]) => String(r[c]) === String(v)));
    const q = {
        select() { return q; },
        eq(c, v) { filters.push([c, v]); return q; },
        order() { return q; },
        limit() { return q; },
        in() { return q; },
        or() { return q; },
        single() { single = true; return q; },
        maybeSingle() { single = true; return q; },
        insert(r) { op = 'insert'; payload = r; return q; },
        update(r) { op = 'update'; payload = r; return q; },
        upsert(r, o) { op = 'upsert'; payload = r; upsertKey = o?.onConflict; return q; },
        delete() { op = 'delete'; return q; },
        then(resolve, reject) {
            let result;
            if (op === 'select') {
                const found = rows();
                result = { data: single ? (found[0] || null) : found, error: null };
            } else if (op === 'insert' && table === 'employees' && employeeInsertFailures.length) {
                writes.push({ table, op: 'failed-insert', rows: payload });
                result = { data: null, error: employeeInsertFailures.shift() };
            } else if (op === 'insert') {
                const inserted = (Array.isArray(payload) ? payload : [payload]).map((r, i) => ({ id: 1000 + db[table].length + i, ...r }));
                db[table].push(...inserted);
                writes.push({ table, op, rows: inserted });
                result = { data: inserted, error: null };
            } else if (op === 'update') {
                rows().forEach((r) => Object.assign(r, payload));
                writes.push({ table, op, payload, filters: [...filters] });
                result = { data: null, error: null };
            } else if (op === 'upsert') {
                const existing = db[table].find((r) => r[upsertKey] === payload[upsertKey]);
                if (existing) Object.assign(existing, payload); else db[table].push({ ...payload });
                writes.push({ table, op, payload });
                result = { data: null, error: null };
            } else if (op === 'delete') {
                db[table] = db[table].filter((r) => !filters.every(([c, v]) => r[c] === v));
                result = { data: null, error: null };
            }
            return Promise.resolve(result).then(resolve, reject);
        },
    };
    return q;
}
const fakeSupabase = { from: (t) => makeQuery(t), storage: { from: () => ({}) } };

const sentOtps = [];
const fakeModule = (exports) => ({ id: 'fake', filename: 'fake', loaded: true, exports });
const cacheFake = (rel, exports) => { require.cache[path.resolve(__dirname, rel)] = fakeModule(exports); };
cacheFake('../config/supabase.js', fakeSupabase);
cacheFake('../services/emailService.js', {
    sendPasswordResetOtpEmail: async (_user, otp) => { sentOtps.push(otp); return { success: true }; },
    sendShiftChangeEmail: async () => ({ success: true }),
});
cacheFake('../utils/employeeId.js', { generateNextEmployeeId: async () => 'TEST999' });
cacheFake('../utils/onboardingTickets.js', { createOnboardingTickets: async () => {} });

// Fresh router per suite so express-rate-limit counters never leak between suites.
// require.resolve gives the exact cache key (with the .js extension).
const freshRequire = (rel) => {
    delete require.cache[require.resolve(rel)];
    return require(rel);
};

const HASHED_PW = 'Correct#Pass1';
const seed = async () => {
    db.employees = [
        { id: 1, employee_id: 'TEST001', email: 'nohash@example.invalid', role: 'employee', is_active: true, password: null, first_name: 'No', last_name: 'Hash' },
        { id: 2, employee_id: 'TEST002', email: 'hashed@example.invalid', role: 'employee', is_active: true, password: await bcrypt.hash(HASHED_PW, 4), first_name: 'Has', last_name: 'Hash' },
        { id: 3, employee_id: 'TEST003', email: 'inactive@example.invalid', role: 'employee', is_active: false, password: await bcrypt.hash(HASHED_PW, 4), first_name: 'In', last_name: 'Active' },
        { id: 4, employee_id: 'TEST004', email: 'emptyhash@example.invalid', role: 'employee', is_active: true, password: '', first_name: 'Empty', last_name: 'Hash' },
    ];
    db.password_reset_otps = [];
    writes.length = 0;
    sentOtps.length = 0;
    employeeInsertFailures.length = 0;
};

async function startApp(mount) {
    const express = require('express');
    const app = express();
    app.use(express.json());
    mount(app);
    const server = http.createServer(app);
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    return { server, base: `http://127.0.0.1:${server.address().port}` };
}
const stop = async (server) => { server.closeAllConnections?.(); await new Promise((r) => server.close(r)); };
const post = async (base, p, body, token) => {
    const res = await fetch(base + p, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
};

// Route handlers log heavily; on Node 18 stdout output can corrupt node:test's own channel.
// Captured with util.format (as console.log itself renders), so logged objects are inspected
// in full rather than collapsing to "[object Object]" and hiding what they contain.
const util = require('node:util');
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;
const logged = [];
const capture = (...a) => logged.push(util.format(...a));
const quiet = () => { console.log = capture; console.error = capture; console.warn = capture; };
const loud = () => { console.log = originalLog; console.error = originalError; console.warn = originalWarn; };

describe('login: no default password', () => {
    let app;
    before(async () => { quiet(); app = await startApp((a) => a.use('/api/auth', freshRequire('../routes/authRoutes'))); });
    after(async () => { await stop(app.server); loud(); });
    beforeEach(seed);

    test('VULN: account without a hash can no longer log in with Welcome@123', async () => {
        const r = await post(app.base, '/api/auth/login', { identifier: 'TEST001', password: 'Welcome@123' });
        assert.equal(r.status, 401);
        assert.equal(r.body.success, false);
        assert.equal(r.body.token, undefined);
    });

    test('empty-string hash is treated the same as no hash', async () => {
        const r = await post(app.base, '/api/auth/login', { identifier: 'emptyhash@example.invalid', password: 'Welcome@123' });
        assert.equal(r.status, 401);
    });

    test('no-hash rejection is indistinguishable from a wrong password (same status and message)', async () => {
        const noHash = await post(app.base, '/api/auth/login', { identifier: 'TEST001', password: 'anything' });
        const wrong = await post(app.base, '/api/auth/login', { identifier: 'TEST002', password: 'wrong-password' });
        assert.equal(noHash.status, wrong.status);
        assert.equal(noHash.body.message, wrong.body.message);
    });

    test('legitimate user with a bcrypt hash still logs in and gets tokens', async () => {
        const r = await post(app.base, '/api/auth/login', { identifier: 'hashed@example.invalid', password: HASHED_PW });
        assert.equal(r.status, 200);
        assert.equal(r.body.success, true);
        assert.ok(r.body.token && r.body.refreshToken);
        const access = jwt.verify(r.body.token, process.env.JWT_SECRET);
        assert.equal(access.exp - access.iat, 9 * 60 * 60);
        assert.doesNotThrow(() => jwt.verify(r.body.token, process.env.JWT_SECRET, {
            clockTimestamp: access.iat + 9 * 60 * 60 - 1,
        }));
        assert.throws(() => jwt.verify(r.body.token, process.env.JWT_SECRET, {
            clockTimestamp: access.iat + 9 * 60 * 60,
        }), { name: 'TokenExpiredError' });
        const renewed = await post(app.base, '/api/auth/refresh', { refreshToken: r.body.refreshToken });
        assert.equal(renewed.status, 200);
        const renewedAccess = jwt.verify(renewed.body.token, process.env.JWT_SECRET);
        assert.equal(renewedAccess.exp - renewedAccess.iat, 9 * 60 * 60);
        assert.equal(r.body.user.employeeId, 'TEST002');
        assert.equal(r.body.user.password, undefined);
    });

    test('deactivated account is still refused (existing behaviour kept)', async () => {
        const r = await post(app.base, '/api/auth/login', { identifier: 'TEST003', password: HASHED_PW });
        assert.equal(r.status, 403);
    });
});

describe('change-password: no default password', () => {
    let app;
    before(async () => { quiet(); app = await startApp((a) => a.use('/api/auth', freshRequire('../routes/authRoutes'))); });
    after(async () => { await stop(app.server); loud(); });
    beforeEach(seed);
    const tokenFor = (id) => jwt.sign({ id, employeeId: `TEST00${id}`, role: 'employee' }, process.env.JWT_SECRET);

    test('VULN: no-hash account cannot use Welcome@123 as the "current password"', async () => {
        const r = await post(app.base, '/api/auth/change-password', { currentPassword: 'Welcome@123', newPassword: 'NewPass#1' }, tokenFor(1));
        assert.equal(r.status, 400);
        assert.match(r.body.message, /Forgot password/);
        assert.equal(writes.filter((w) => w.table === 'employees' && w.op === 'update').length, 0, 'no password was written');
        assert.equal(db.employees[0].password, null);
    });

    test('legitimate change with the correct current password stores a bcrypt hash', async () => {
        const r = await post(app.base, '/api/auth/change-password', { currentPassword: HASHED_PW, newPassword: 'NewPass#1' }, tokenFor(2));
        assert.equal(r.status, 200);
        const stored = db.employees[1].password;
        assert.notEqual(stored, 'NewPass#1');
        assert.ok(await bcrypt.compare('NewPass#1', stored));
    });

    test('wrong current password is still rejected', async () => {
        const r = await post(app.base, '/api/auth/change-password', { currentPassword: 'nope', newPassword: 'NewPass#1' }, tokenFor(2));
        assert.equal(r.status, 401);
    });
});

describe('recovery: a no-hash account sets its password through the existing email-OTP flow', () => {
    let app;
    before(async () => { quiet(); app = await startApp((a) => a.use('/api/auth', freshRequire('../routes/authRoutes'))); });
    after(async () => { await stop(app.server); loud(); });
    before(seed);

    test('forgot-password → verify-otp → reset-password → login with the new password', async () => {
        const f = await post(app.base, '/api/auth/forgot-password', { email: 'nohash@example.invalid' });
        assert.equal(f.status, 200);
        await new Promise((r) => setImmediate(r)); // OTP email is fire-and-forget
        assert.equal(sentOtps.length, 1);

        const v = await post(app.base, '/api/auth/verify-otp', { email: 'nohash@example.invalid', otp: sentOtps[0] });
        assert.equal(v.status, 200);
        assert.ok(v.body.resetToken);

        const rp = await post(app.base, '/api/auth/reset-password', { token: v.body.resetToken, newPassword: 'Recovered#1' });
        assert.equal(rp.status, 200);
        assert.ok(await bcrypt.compare('Recovered#1', db.employees[0].password));

        const login = await post(app.base, '/api/auth/login', { identifier: 'TEST001', password: 'Recovered#1' });
        assert.equal(login.status, 200);
        assert.ok(login.body.token);
    });
});

describe('admin Add Employee: Initial Password handling', () => {
    let app;
    const adminToken = jwt.sign({ id: 99, employeeId: 'ADMIN01', role: 'admin' }, process.env.JWT_SECRET);
    const desktopToken = jwt.sign({ id: 98, employeeId: 'IT01', role: 'desktop_support' }, process.env.JWT_SECRET);
    const employeeToken = jwt.sign({ id: 2, employeeId: 'TEST002', role: 'employee' }, process.env.JWT_SECRET);
    const PLAIN = 'InitPass#123';
    const base = {
        first_name: 'New', last_name: 'Hire', email: 'newhire@example.invalid', joining_date: '2026-10-01',
        designation: 'Tester', department: 'QA', reporting_manager: 'Some Manager', phone: '0000000000',
        dob: '1990-01-01', blood_group: 'O+', emergency_contact: '0000000000', address: 'Test address',
    };
    before(async () => {
        quiet();
        app = await startApp((a) => {
            a.use('/api/employees', freshRequire('../routes/employeeRoutes'));
            a.use('/api/auth', freshRequire('../routes/authRoutes'));
        });
    });
    after(async () => { await stop(app.server); loud(); });
    beforeEach(async () => { await seed(); logged.length = 0; });
    const insertedEmployee = () => writes.find((w) => w.table === 'employees' && w.op === 'insert')?.rows[0];
    const anyEmployeeInsertAttempt = () => writes.some((w) => w.table === 'employees' && (w.op === 'insert' || w.op === 'failed-insert'));

    describe('valid initial password', () => {
        test('stored as a bcrypt hash (never plaintext) and the employee can log in with it', async () => {
            const r = await post(app.base, '/api/employees', { ...base, password: PLAIN }, adminToken);
            assert.equal(r.status, 201);
            const row = insertedEmployee();
            assert.ok(row.password && row.password !== PLAIN);
            assert.ok(await bcrypt.compare(PLAIN, row.password));
            const login = await post(app.base, '/api/auth/login', { identifier: 'newhire@example.invalid', password: PLAIN });
            assert.equal(login.status, 200);
            assert.ok(login.body.token);
        });

        test('same algorithm and cost as the existing reset/OTP flows: bcrypt, cost factor 10', async () => {
            await post(app.base, '/api/employees', { ...base, password: PLAIN }, adminToken);
            const hash = insertedEmployee().password;
            assert.match(hash, /^\$2[aby]\$10\$[./A-Za-z0-9]{53}$/);
            assert.equal(bcrypt.getRounds(hash), 10);
        });

        test('the old Welcome@123 fallback does not work for the new account', async () => {
            await post(app.base, '/api/employees', { ...base, password: PLAIN }, adminToken);
            const login = await post(app.base, '/api/auth/login', { identifier: 'newhire@example.invalid', password: 'Welcome@123' });
            assert.equal(login.status, 401);
        });

        test('response does not contain the password or its hash', async () => {
            const r = await post(app.base, '/api/employees', { ...base, password: PLAIN }, adminToken);
            const text = JSON.stringify(r.body);
            assert.equal(text.includes(PLAIN), false);
            assert.equal(text.includes(insertedEmployee().password), false);
            assert.deepEqual(Object.keys(r.body.employee).sort(), ['employee_id', 'id']);
        });

        test('neither the plaintext password nor its hash appears in any server log line', async () => {
            await post(app.base, '/api/employees', { ...base, password: PLAIN }, adminToken);
            const hash = insertedEmployee().password;
            assert.ok(logged.length > 0, 'route logged something (sanity check that capture works)');
            assert.ok(logged.some((l) => l.includes('newhire@example.invalid')), 'logged objects are captured in full');
            const leaks = logged.filter((l) => l.includes(PLAIN) || l.includes(hash));
            assert.deepEqual(leaks, [], 'password or hash leaked into logs');
        });

        test('a 6-character password (the minimum) is accepted; desktop_support may create (existing permission)', async () => {
            const r = await post(app.base, '/api/employees', { ...base, password: 'abc123' }, desktopToken);
            assert.equal(r.status, 201);
            assert.ok(await bcrypt.compare('abc123', insertedEmployee().password));
        });

        test('the missing-column fallback insert keeps the password hash (no account without a hash)', async () => {
            // Real PostgREST/Postgres missing-column errors carry a code (42703 / PGRST204); an
            // error without a code is treated as "outcome unknown" (see utils/employeeCreation.js).
            employeeInsertFailures.push({ message: 'column "isFlexibleShift" of relation "employees" does not exist', code: '42703' });
            const r = await post(app.base, '/api/employees', { ...base, password: PLAIN }, adminToken);
            assert.equal(r.status, 201);
            const row = insertedEmployee();
            assert.equal(Object.hasOwn(row, 'isFlexibleShift'), false, 'fallback insert was used');
            assert.ok(await bcrypt.compare(PLAIN, row.password));
        });
    });

    describe('missing or invalid initial password is rejected before anything is written', () => {
        const cases = [
            ['missing', {}],
            ['empty string', { password: '' }],
            ['too short (5 chars)', { password: '12345' }],
            ['number instead of string', { password: 12345678 }],
            ['null', { password: null }],
            ['object', { password: { value: 'InitPass#123' } }],
        ];
        for (const [label, extra] of cases) {
            test(`${label} → 400, no employee inserted`, async () => {
                const r = await post(app.base, '/api/employees', { ...base, ...extra }, adminToken);
                assert.equal(r.status, 400);
                assert.equal(r.body.field, 'password');
                assert.equal(anyEmployeeInsertAttempt(), false);
            });
        }

        test('a database error during insert returns 500 without echoing the password', async () => {
            // The route retries the insert after any error (up to 5 attempts, existing behaviour),
            // so fail every attempt to reach the error response.
            for (let i = 0; i < 5; i++) employeeInsertFailures.push({ message: 'simulated failure', code: 'XX000', details: 'simulated details' });
            const r = await post(app.base, '/api/employees', { ...base, password: PLAIN }, adminToken);
            assert.equal(r.status, 500);
            assert.equal(JSON.stringify(r.body).includes(PLAIN), false);
            assert.equal(logged.some((l) => l.includes(PLAIN)), false);
        });
    });

    describe('authorization on POST /api/employees (reviewed, unchanged)', () => {
        test('regular employee gets 403 and nothing is written', async () => {
            const r = await post(app.base, '/api/employees', { ...base, password: PLAIN }, employeeToken);
            assert.equal(r.status, 403);
            assert.equal(anyEmployeeInsertAttempt(), false);
        });

        test('no token gets 401', async () => {
            const r = await post(app.base, '/api/employees', { ...base, password: PLAIN });
            assert.equal(r.status, 401);
        });
    });
});

describe('admin-assisted recovery for an account with no password hash', () => {
    let app;
    const adminToken = jwt.sign({ id: 99, employeeId: 'ADMIN01', role: 'admin', email: 'admin@example.invalid' }, process.env.JWT_SECRET);
    const hrToken = jwt.sign({ id: 97, employeeId: 'HR01', role: 'hr', email: 'hr@example.invalid' }, process.env.JWT_SECRET);
    before(async () => {
        quiet();
        app = await startApp((a) => {
            a.use('/api/employees', freshRequire('../routes/employeeRoutes'));
            a.use('/api/auth', freshRequire('../routes/authRoutes'));
        });
    });
    after(async () => { await stop(app.server); loud(); });
    beforeEach(seed);

    test('Employee List / Edit Employee "Reset password" (POST /api/employees/:id/reset-password) sets a bcrypt hash; login works', async () => {
        const r = await post(app.base, '/api/employees/1/reset-password', { newPassword: 'AdminTemp#1' }, adminToken);
        assert.equal(r.status, 200);
        assert.equal(bcrypt.getRounds(db.employees[0].password), 10);
        const login = await post(app.base, '/api/auth/login', { identifier: 'TEST001', password: 'AdminTemp#1' });
        assert.equal(login.status, 200);
    });

    test('HR direct reset (POST /api/auth/reset-password-direct) sets a bcrypt hash; login works', async () => {
        const r = await post(app.base, '/api/auth/reset-password-direct', { email: 'nohash@example.invalid', newPassword: 'HrTemp#123' }, hrToken);
        assert.equal(r.status, 200);
        assert.ok(await bcrypt.compare('HrTemp#123', db.employees[0].password));
        const login = await post(app.base, '/api/auth/login', { identifier: 'nohash@example.invalid', password: 'HrTemp#123' });
        assert.equal(login.status, 200);
    });

    test('OTP is not issued for a deactivated no-hash account (generic response, existing behaviour)', async () => {
        db.employees[0].is_active = false;
        const f = await post(app.base, '/api/auth/forgot-password', { email: 'nohash@example.invalid' });
        assert.equal(f.status, 200);
        await new Promise((r) => setImmediate(r));
        assert.equal(sentOtps.length, 0);
    });
});
