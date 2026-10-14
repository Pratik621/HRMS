const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');

// Successful responses of the profile-completion routes must never include credential columns.
// Real router against an in-memory database double injected into the require cache — never a
// real Supabase project. All data is fabricated.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-secret';
const jwt = require('jsonwebtoken');

const SECRET_COLUMNS = ['password', 'reset_password_token', 'reset_password_expires', 'biometric_pin'];
const FAKE_HASH = '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWX1';
const db = { employees: [] };
function makeQuery(table) {
    const filters = [];
    let op = 'select';
    let payload = null;
    let single = false;
    const rows = () => db[table].filter((r) => filters.every(([c, v]) => String(r[c]) === String(v)));
    const q = {
        select() { return q; },
        eq(c, v) { filters.push([c, v]); return q; },
        single() { single = true; return q; },
        maybeSingle() { single = true; return q; },
        update(r) { op = 'update'; payload = r; return q; },
        then(resolve, reject) {
            const matched = rows();
            if (op === 'update') matched.forEach((r) => Object.assign(r, payload));
            const out = matched.map((r) => ({ ...r }));
            return Promise.resolve({ data: single ? (out[0] || null) : out, error: null }).then(resolve, reject);
        },
    };
    return q;
}
const cacheFake = (rel, exports) => { require.cache[path.resolve(__dirname, rel)] = { id: 'fake', filename: 'fake', loaded: true, exports }; };
cacheFake('../config/supabase.js', { from: (t) => makeQuery(t), storage: { from: () => ({}) } });
cacheFake('../services/emailService.js', { sendShiftChangeEmail: async () => ({ success: true }) });
cacheFake('../utils/employeeId.js', { generateNextEmployeeId: async () => 'TEST999' });
cacheFake('../utils/onboardingTickets.js', { createOnboardingTickets: async () => {} });

const seed = () => {
    db.employees = [{
        id: 7, employee_id: 'TEST007', first_name: 'Pro', last_name: 'File', email: 'profile@example.invalid', role: 'employee',
        is_active: true, department: 'QA', designation: 'Tester', phone: '0000000000',
        profile_completed: false, require_profile_completion: true,
        password: FAKE_HASH, reset_password_token: 'fake-reset-token', reset_password_expires: '2099-01-01T00:00:00', biometric_pin: '4321',
    }];
};

const tokenFor = (role, employeeId) => jwt.sign({ id: 1, employeeId, role }, process.env.JWT_SECRET);
let server;
let base;
const originalLog = console.log;
before(async () => {
    console.log = () => {};
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
    console.log = originalLog;
});
beforeEach(seed);

const post = async (p, body, token) => {
    const res = await fetch(base + p, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body || {}),
    });
    const text = await res.text();
    return { status: res.status, text, body: JSON.parse(text) };
};
const assertNoSecrets = (r) => {
    for (const col of SECRET_COLUMNS) assert.equal(Object.hasOwn(r.body.employee, col), false, `employee.${col} leaked`);
    assert.equal(r.text.includes(FAKE_HASH), false, 'hash appears somewhere in the response');
    assert.equal(r.text.includes('fake-reset-token'), false, 'reset token appears in the response');
};

describe('POST /api/employees/complete-profile (employee, own record)', () => {
    const own = tokenFor('employee', 'TEST007');

    test('VULN: response has no password hash, reset token or biometric PIN', async () => {
        const r = await post('/api/employees/complete-profile', { phone: '1111111111' }, own);
        assert.equal(r.status, 200);
        assertNoSecrets(r);
    });

    test('expected non-sensitive fields remain, including the just-saved values', async () => {
        const r = await post('/api/employees/complete-profile', { phone: '1111111111', blood_group: 'B+' }, own);
        assert.equal(r.body.success, true);
        assert.equal(r.body.employee.employee_id, 'TEST007');
        assert.equal(r.body.employee.first_name, 'Pro');
        assert.equal(r.body.employee.phone, '1111111111');
        assert.equal(r.body.employee.blood_group, 'B+');
        assert.equal(r.body.employee.profile_completed, true);
    });

    test('database behaviour unchanged: profile marked complete, stored hash untouched', async () => {
        await post('/api/employees/complete-profile', { phone: '1111111111' }, own);
        assert.equal(db.employees[0].profile_completed, true);
        assert.equal(db.employees[0].password, FAKE_HASH);
    });
});

describe('POST /api/employees/:id/reset-profile (admin)', () => {
    test('VULN: response has no secret columns', async () => {
        const r = await post('/api/employees/7/reset-profile', {}, tokenFor('admin', 'ADMIN01'));
        assert.equal(r.status, 200);
        assertNoSecrets(r);
    });

    test('expected fields and message remain; profile reset in the database', async () => {
        db.employees[0].profile_completed = true;
        const r = await post('/api/employees/7/reset-profile', {}, tokenFor('hr', 'HR01'));
        assert.equal(r.body.success, true);
        assert.match(r.body.message, /Profile completion reset/);
        assert.equal(r.body.employee.employee_id, 'TEST007');
        assert.equal(r.body.employee.profile_completed, false);
        assert.equal(db.employees[0].profile_completed, false);
    });

    test('permission unchanged: desktop_support and employees still get 403', async () => {
        assert.equal((await post('/api/employees/7/reset-profile', {}, tokenFor('desktop_support', 'IT01'))).status, 403);
        assert.equal((await post('/api/employees/7/reset-profile', {}, tokenFor('employee', 'TEST007'))).status, 403);
    });
});

describe('POST /api/employees/:id/toggle-profile-form (admin, desktop_support)', () => {
    test('VULN: response has no secret columns', async () => {
        const r = await post('/api/employees/7/toggle-profile-form', {}, tokenFor('desktop_support', 'IT01'));
        assert.equal(r.status, 200);
        assertNoSecrets(r);
    });

    test('top-level fields the UI reads are unchanged (require_profile_completion, profile_completed)', async () => {
        // Seeded ON → toggling turns it OFF.
        const off = await post('/api/employees/7/toggle-profile-form', {}, tokenFor('admin', 'ADMIN01'));
        assert.equal(off.body.success, true);
        assert.equal(off.body.require_profile_completion, false);
        assert.equal(off.body.employee.require_profile_completion, false);
        // OFF → ON also resets profile_completed.
        db.employees[0].profile_completed = true;
        const on = await post('/api/employees/7/toggle-profile-form', {}, tokenFor('admin', 'ADMIN01'));
        assert.equal(on.body.require_profile_completion, true);
        assert.equal(on.body.profile_completed, false);
        assert.equal(on.body.employee.employee_id, 'TEST007');
        assertNoSecrets(on);
    });

    test('permission unchanged: employees still get 403', async () => {
        assert.equal((await post('/api/employees/7/toggle-profile-form', {}, tokenFor('employee', 'TEST007'))).status, 403);
    });
});
