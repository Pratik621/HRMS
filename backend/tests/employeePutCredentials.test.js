const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');
const bcrypt = require('bcryptjs');

// Real employee/auth route handlers against an in-memory database double injected into the
// require cache — never a real Supabase project. All data is fabricated.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-only-refresh-secret';
const jwt = require('jsonwebtoken');

const db = { employees: [], employee_shift_history: [] };
function makeQuery(table) {
    const filters = [];
    let op = 'select';
    let payload = null;
    let single = false;
    let returning = false;
    const rows = () => (db[table] || []).filter((r) => filters.every(([c, v]) => String(r[c]) === String(v)));
    const q = {
        select() { if (op !== 'select') returning = true; return q; },
        eq(c, v) { filters.push([c, v]); return q; },
        order() { return q; }, limit() { return q; }, in() { return q; }, or() { return q; },
        single() { single = true; return q; },
        maybeSingle() { single = true; return q; },
        insert(r) { op = 'insert'; payload = r; return q; },
        update(r) { op = 'update'; payload = r; return q; },
        then(resolve, reject) {
            let result = { data: null, error: null };
            if (op === 'select') {
                const found = rows().map((r) => ({ ...r }));
                result = { data: single ? (found[0] || null) : found, error: null };
            } else if (op === 'insert') {
                const inserted = (Array.isArray(payload) ? payload : [payload]).map((r) => ({ ...r }));
                db[table].push(...inserted);
                result = { data: returning ? inserted : null, error: null };
            } else if (op === 'update') {
                const matched = rows();
                matched.forEach((r) => Object.assign(r, payload));
                result = { data: returning ? matched.map((r) => ({ ...r })) : null, error: null };
            }
            return Promise.resolve(result).then(resolve, reject);
        },
    };
    return q;
}
const fakeModule = (exports) => ({ id: 'fake', filename: 'fake', loaded: true, exports });
const cacheFake = (rel, exports) => { require.cache[path.resolve(__dirname, rel)] = fakeModule(exports); };
cacheFake('../config/supabase.js', { from: (t) => makeQuery(t), storage: { from: () => ({}) } });
cacheFake('../services/emailService.js', { sendPasswordResetOtpEmail: async () => ({ success: true }), sendShiftChangeEmail: async () => ({ success: true }) });
cacheFake('../utils/employeeId.js', { generateNextEmployeeId: async () => 'TEST999' });
cacheFake('../utils/onboardingTickets.js', { createOnboardingTickets: async () => {} });
const freshRequire = (rel) => { delete require.cache[require.resolve(rel)]; return require(rel); };

const ORIGINAL_PW = 'Original#Pass1';
let originalHash;
const seed = async () => {
    originalHash = originalHash || await bcrypt.hash(ORIGINAL_PW, 4);
    db.employees = [
        { id: 1, employee_id: 'TEST001', email: 'target@example.invalid', role: 'employee', is_active: true, designation: 'Tester',
          shift_timing: '9:00 AM - 6:00 PM', password: originalHash, reset_password_token: null, reset_password_expires: null, biometric_pin: '1111',
          first_name: 'Tar', last_name: 'Get' },
        { id: 2, employee_id: 'ADMIN01', email: 'admin@example.invalid', role: 'admin', is_active: true, password: originalHash, first_name: 'Ad', last_name: 'Min' },
    ];
    db.employee_shift_history = [];
};

const token = (role, employeeId = 'ACTOR01') => jwt.sign({ id: 50, employeeId, role }, process.env.JWT_SECRET);
const ADMIN = token('admin', 'ADMIN01');
const DESKTOP = token('desktop_support', 'IT01');
const EMPLOYEE = token('employee', 'TEST001');

let server;
let base;
const originalLog = console.log;
const originalWarn = console.warn;
const warnings = [];
before(async () => {
    console.log = () => {};
    console.warn = (...a) => warnings.push(a.map(String).join(' '));
    const express = require('express');
    const app = express();
    app.use(express.json());
    app.use('/api/employees', freshRequire('../routes/employeeRoutes'));
    app.use('/api/auth', freshRequire('../routes/authRoutes'));
    server = http.createServer(app);
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
    server.closeAllConnections?.();
    await new Promise((r) => server.close(r));
    console.log = originalLog;
    console.warn = originalWarn;
});
beforeEach(async () => { await seed(); warnings.length = 0; });

const send = async (method, p, body, tok) => {
    const res = await fetch(base + p, {
        method,
        headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
        body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
};
const target = () => db.employees.find((e) => e.id === 1);

describe('PUT /api/employees/:id cannot set or modify credentials', () => {
    test('VULN: admin sending a plaintext password does not change the stored hash', async () => {
        const r = await send('PUT', '/api/employees/1', { password: 'attacker-chosen', designation: 'Senior Tester' }, ADMIN);
        assert.equal(r.status, 200);
        assert.equal(target().password, originalHash, 'hash unchanged');
        assert.equal(target().designation, 'Senior Tester', 'the rest of the edit still applied');
    });

    test('VULN: desktop_support nulling the password does not clear the hash', async () => {
        const r = await send('PUT', '/api/employees/1', { password: null, designation: 'QA' }, DESKTOP);
        assert.equal(r.status, 200);
        assert.equal(target().password, originalHash);
    });

    test('VULN: reset token and biometric PIN are not writable either', async () => {
        await send('PUT', '/api/employees/1', { reset_password_token: 'x', reset_password_expires: '2099-01-01', biometric_pin: '9999' }, ADMIN);
        assert.equal(target().reset_password_token, null);
        assert.equal(target().reset_password_expires, null);
        assert.equal(target().biometric_pin, '1111');
    });

    test('ignored fields are logged by name only, never by value', async () => {
        await send('PUT', '/api/employees/1', { password: 'attacker-chosen' }, ADMIN);
        assert.ok(warnings.some((w) => w.includes('ignored credential field(s): password')));
        assert.equal(warnings.some((w) => w.includes('attacker-chosen')), false);
    });

    test('end-to-end: after a PUT that tries to null the password, the old password still works and Welcome@123 does not', async () => {
        await send('PUT', '/api/employees/1', { password: null }, DESKTOP);
        const bad = await send('POST', '/api/auth/login', { identifier: 'TEST001', password: 'Welcome@123' });
        assert.equal(bad.status, 401);
        const good = await send('POST', '/api/auth/login', { identifier: 'TEST001', password: ORIGINAL_PW });
        assert.equal(good.status, 200);
    });

    test('response no longer includes the password hash or other credential columns', async () => {
        const r = await send('PUT', '/api/employees/1', { designation: 'Lead' }, ADMIN);
        assert.equal(r.status, 200);
        for (const col of ['password', 'reset_password_token', 'reset_password_expires', 'biometric_pin']) {
            assert.equal(Object.hasOwn(r.body.employee, col), false, `leaked ${col}`);
        }
        assert.equal(r.body.employee.designation, 'Lead');
    });
});

describe('legitimate edits and permissions are unchanged', () => {
    test('a normal Edit Employee save (including a resent password hash from an old page) succeeds', async () => {
        const r = await send('PUT', '/api/employees/1', { ...target(), designation: 'Manager' }, ADMIN);
        assert.equal(r.status, 200);
        assert.equal(target().designation, 'Manager');
        assert.equal(target().password, originalHash);
    });

    test('shift change still records shift history', async () => {
        const r = await send('PUT', '/api/employees/1', { shift_timing: '10:00 AM - 7:00 PM' }, ADMIN);
        assert.equal(r.status, 200);
        assert.equal(db.employee_shift_history.length, 1);
    });

    test('regular employee still gets 403 on PUT', async () => {
        const r = await send('PUT', '/api/employees/1', { designation: 'CEO' }, EMPLOYEE);
        assert.equal(r.status, 403);
        assert.equal(target().designation, 'Tester');
    });

    test('desktop_support still cannot change role (existing rule)', async () => {
        await send('PUT', '/api/employees/1', { role: 'admin' }, DESKTOP);
        assert.equal(target().role, 'employee');
    });

    test('admin can still change role (existing rule)', async () => {
        const r = await send('PUT', '/api/employees/1', { role: 'manager' }, ADMIN);
        assert.equal(r.status, 200);
        assert.equal(target().role, 'manager');
    });

    test('admins can still set a password through the dedicated reset route, stored as a bcrypt hash', async () => {
        const r = await send('POST', '/api/employees/1/reset-password', { newPassword: 'AdminSet#Pass1' }, ADMIN);
        assert.equal(r.status, 200);
        assert.notEqual(target().password, 'AdminSet#Pass1');
        assert.ok(await bcrypt.compare('AdminSet#Pass1', target().password));
    });
});
