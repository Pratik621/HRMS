const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');

// Real route handlers with an in-memory Supabase double injected into the require cache, so
// these tests never touch a real project. All data below is fabricated.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-secret';
const jwt = require('jsonwebtoken');

const SECRETS = {
    password: '$2b$10$fakefakefakefakefakefakefakefakefakefakefakefakefake',
    reset_password_token: 'fake-reset-token',
    reset_password_expires: '2026-01-01T00:00:00',
    biometric_pin: '0000',
};
const fakeEmployee = (n) => ({
    id: n, employee_id: `TEST00${n}`, first_name: `Test${n}`, last_name: 'Person', email: `test${n}@example.invalid`,
    department: 'QA', designation: 'Tester', is_active: true, created_at: '2026-01-01T00:00:00Z', ...SECRETS,
});

const fakeSupabase = {
    from() {
        let single = false;
        const builder = {};
        for (const m of ['select', 'eq', 'neq', 'in', 'or', 'order', 'limit', 'range', 'gte', 'lte', 'ilike', 'is', 'not']) builder[m] = () => builder;
        builder.single = () => { single = true; return builder; };
        builder.maybeSingle = builder.single;
        builder.then = (resolve, reject) => Promise.resolve(single
            ? { data: fakeEmployee(1), error: null }
            : { data: [fakeEmployee(1), fakeEmployee(2)], error: null }).then(resolve, reject);
        return builder;
    },
    storage: { from: () => ({}) },
};
require.cache[path.resolve(__dirname, '../config/supabase.js')] = {
    id: 'fake-supabase', filename: 'fake-supabase', loaded: true, exports: fakeSupabase,
};

const { SECRET_EMPLOYEE_COLUMNS, omitSecretEmployeeFields, omitSecretEmployeeFieldsFromAll } = require('../utils/employeeFields');

const assertNoSecrets = (row) => {
    for (const col of SECRET_EMPLOYEE_COLUMNS) assert.equal(Object.hasOwn(row, col), false, `response leaked "${col}"`);
};

describe('omitSecretEmployeeFields', () => {
    test('removes every secret column and keeps everything else', () => {
        const row = fakeEmployee(1);
        const clean = omitSecretEmployeeFields(row);
        assertNoSecrets(clean);
        assert.equal(clean.first_name, 'Test1');
        assert.equal(clean.department, 'QA');
        assert.equal(Object.keys(clean).length, Object.keys(row).length - SECRET_EMPLOYEE_COLUMNS.length);
    });

    test('does not mutate the original row', () => {
        const row = fakeEmployee(1);
        omitSecretEmployeeFields(row);
        assert.equal(row.password, SECRETS.password);
    });

    test('passes through null, undefined, arrays and primitives unchanged', () => {
        assert.equal(omitSecretEmployeeFields(null), null);
        assert.equal(omitSecretEmployeeFields(undefined), undefined);
        const arr = [1];
        assert.equal(omitSecretEmployeeFields(arr), arr);
        assert.equal(omitSecretEmployeeFields('x'), 'x');
    });

    test('list helper strips each row and tolerates non-arrays', () => {
        const rows = omitSecretEmployeeFieldsFromAll([fakeEmployee(1), fakeEmployee(2)]);
        rows.forEach(assertNoSecrets);
        assert.equal(rows.length, 2);
        assert.equal(omitSecretEmployeeFieldsFromAll(null), null);
    });

    test('covers password, reset token/expiry and biometric PIN', () => {
        assert.deepEqual([...SECRET_EMPLOYEE_COLUMNS].sort(), ['biometric_pin', 'password', 'reset_password_expires', 'reset_password_token']);
    });
});

describe('employee routes never return secret columns', () => {
    let server;
    let base;
    // The routes log to stdout; on Node 18 that output can corrupt the test runner's own stdout
    // channel ("Unable to deserialize cloned data"), so silence it for the duration of the suite.
    const originalLog = console.log;
    const token = jwt.sign({ id: 1, employeeId: 'TEST001', role: 'employee', email: 'test1@example.invalid' }, process.env.JWT_SECRET);

    before(async () => {
        console.log = () => {};
        const express = require('express');
        const app = express();
        // Stands in for server.js's authenticateToken, which runs before these routers.
        app.use((req, _res, next) => {
            req.user = { id: 1, employeeId: 'TEST001', role: 'employee' };
            req.employeeId = 'TEST001';
            next();
        });
        app.use('/api/employees', require('../routes/employeeRoutes'));
        app.use('/api/employee-updates', require('../routes/employeeUpdateRoutes'));
        server = http.createServer(app);
        await new Promise((r) => server.listen(0, '127.0.0.1', r));
        base = `http://127.0.0.1:${server.address().port}`;
    });

    after(async () => {
        server.closeAllConnections?.();
        await new Promise((r) => server.close(r));
        console.log = originalLog;
    });

    const get = async (p) => {
        const res = await fetch(base + p, { headers: { Authorization: `Bearer ${token}` } });
        return { status: res.status, body: await res.json() };
    };

    test('GET /api/employees (list) — rows returned, secrets stripped', async () => {
        const { status, body } = await get('/api/employees');
        assert.equal(status, 200);
        assert.equal(body.length, 2);
        body.forEach(assertNoSecrets);
        assert.equal(body[0].employee_id, 'TEST001');
    });

    test('GET /api/employees?active=all — secrets stripped', async () => {
        const { status, body } = await get('/api/employees?active=all');
        assert.equal(status, 200);
        body.forEach(assertNoSecrets);
    });

    test('GET /api/employees/:id (numeric id) — secrets stripped, profile fields kept', async () => {
        const { status, body } = await get('/api/employees/1');
        assert.equal(status, 200);
        assertNoSecrets(body);
        assert.equal(body.first_name, 'Test1');
    });

    test('GET /api/employees/:id (employee_id) — secrets stripped', async () => {
        const { status, body } = await get('/api/employees/TEST001');
        assert.equal(status, 200);
        assertNoSecrets(body);
    });

    test('GET /api/employees/profile/:employeeId — secrets stripped', async () => {
        const { status, body } = await get('/api/employees/profile/TEST001');
        assert.equal(status, 200);
        assertNoSecrets(body);
        assert.equal(body.email, 'test1@example.invalid');
    });

    test('GET /api/employee-updates/current-data — secrets stripped', async () => {
        const { status, body } = await get('/api/employee-updates/current-data');
        assert.equal(status, 200);
        assertNoSecrets(body);
        assert.equal(body.employee_id, 'TEST001');
    });
});
