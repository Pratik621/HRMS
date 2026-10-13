const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');

// The real attendance router and controllers, with the same JWT auth and admin check that
// server.js applies, against an in-memory database double injected into the require cache.
// Nothing here touches a real Supabase project. All data is fabricated.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-secret';
const jwt = require('jsonwebtoken');

const writes = [];
function makeQuery(table) {
    let op = 'select';
    let payload = null;
    let single = false;
    const filters = [];
    const q = {};
    for (const m of ['select', 'neq', 'in', 'or', 'order', 'limit', 'range', 'gte', 'lte', 'lt', 'gt', 'is', 'not', 'ilike', 'like', 'filter', 'match', 'contains']) q[m] = () => q;
    q.eq = (c, v) => { filters.push([c, v]); return q; };
    q.single = () => { single = true; return q; };
    q.maybeSingle = q.single;
    q.insert = (r) => { op = 'insert'; payload = r; return q; };
    q.update = (r) => { op = 'update'; payload = r; return q; };
    q.upsert = (r) => { op = 'upsert'; payload = r; return q; };
    q.delete = () => { op = 'delete'; return q; };
    q.then = (resolve, reject) => {
        if (op !== 'select') writes.push({ table, op, payload, filters: [...filters] });
        return Promise.resolve({ data: single ? null : [], error: null, count: 0 }).then(resolve, reject);
    };
    return q;
}
const fakeSupabase = {
    from: (t) => makeQuery(t),
    rpc: async () => ({ data: null, error: null }),
    storage: { from: () => ({ upload: async () => ({ data: null, error: null }), getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
};
require.cache[path.resolve(__dirname, '../config/supabase.js')] = { id: 'fake', filename: 'fake', loaded: true, exports: fakeSupabase };

// Same semantics as server.js's authenticateToken / requireAdmin.
const authenticateToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, code: 'NO_TOKEN' });
    try {
        const user = jwt.verify(token, process.env.JWT_SECRET);
        req.user = user; req.userRole = user.role; req.employeeId = user.employeeId;
        next();
    } catch { res.status(401).json({ success: false, code: 'INVALID_TOKEN' }); }
};
const requireAdmin = (req, res, next) => (['admin', 'sub_admin', 'hr'].includes(req.user?.role)
    ? next() : res.status(403).json({ success: false, message: 'Admin access required' }));

const tokenFor = (employeeId, role) => jwt.sign({ id: 1, employeeId, role }, process.env.JWT_SECRET);
const EMPLOYEE = tokenFor('TEST001', 'employee');
const MANAGER = tokenFor('MGR001', 'manager');
const ADMIN = tokenFor('ADMIN01', 'admin');

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
    app.use('/api/attendance', authenticateToken, require('../routes/attendanceRoutes')(fakeSupabase, authenticateToken, requireAdmin));
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
beforeEach(() => { writes.length = 0; warnings.length = 0; });

const post = async (p, body, tok) => {
    const res = await fetch(base + p, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
        body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
};

const ENDPOINTS = [
    { name: 'clock-in', path: '/api/attendance/clock-in', body: (id) => ({ employee_id: id, latitude: null, longitude: null }) },
    { name: 'clock-out', path: '/api/attendance/clock-out', body: (id) => ({ employee_id: id, session_id: 'sess-1' }) },
    { name: 'clock-out-missed', path: '/api/attendance/clock-out-missed', body: (id) => ({ employee_id: id, attendance_id: 123, attendance_date: '2026-10-13' }) },
    { name: 'heartbeat', path: '/api/attendance/heartbeat', body: (id) => ({ employee_id: id, session_id: 'sess-1' }) },
];

describe('VULN: cannot punch attendance for another employee', () => {
    for (const ep of ENDPOINTS) {
        test(`${ep.name}: employee acting for a colleague gets 403 and nothing is written`, async () => {
            const r = await post(ep.path, ep.body('TEST002'), EMPLOYEE);
            assert.equal(r.status, 403);
            assert.equal(r.body.code, 'NOT_OWN_ATTENDANCE');
            assert.equal(writes.length, 0, `unexpected DB write: ${JSON.stringify(writes)}`);
        });

        test(`${ep.name}: managers and admins are also limited to themselves here (they correct others via /admin/mark or regularization)`, async () => {
            for (const tok of [MANAGER, ADMIN]) {
                const r = await post(ep.path, ep.body('TEST002'), tok);
                assert.equal(r.status, 403);
                assert.equal(r.body.code, 'NOT_OWN_ATTENDANCE');
            }
            assert.equal(writes.length, 0);
        });
    }

    test('rejections are logged with both IDs, for auditing', async () => {
        await post('/api/attendance/clock-in', { employee_id: 'TEST002' }, EMPLOYEE);
        assert.ok(warnings.some((w) => w.includes('caller TEST001') && w.includes('for TEST002')));
    });

    test('heartbeat without employee_id is refused (it previously updated nothing and reported success)', async () => {
        const r = await post('/api/attendance/heartbeat', { session_id: 'sess-1' }, EMPLOYEE);
        assert.equal(r.status, 403);
        assert.equal(writes.length, 0);
    });
});

describe('legitimate self-service punches still pass the ownership check', () => {
    for (const ep of ENDPOINTS) {
        test(`${ep.name}: own employee_id is not rejected`, async () => {
            const r = await post(ep.path, ep.body('TEST001'), EMPLOYEE);
            assert.notEqual(r.body.code, 'NOT_OWN_ATTENDANCE');
            assert.notEqual(r.status, 403, `got 403: ${JSON.stringify(r.body)}`);
        });
    }

    test('admins and managers can still punch their own attendance', async () => {
        const a = await post('/api/attendance/clock-in', { employee_id: 'ADMIN01' }, ADMIN);
        const m = await post('/api/attendance/clock-in', { employee_id: 'MGR001' }, MANAGER);
        assert.notEqual(a.body.code, 'NOT_OWN_ATTENDANCE');
        assert.notEqual(m.body.code, 'NOT_OWN_ATTENDANCE');
    });

    test('own heartbeat succeeds and updates only the caller\'s session', async () => {
        const r = await post('/api/attendance/heartbeat', { employee_id: 'TEST001', session_id: 'sess-1' }, EMPLOYEE);
        assert.equal(r.status, 200);
        assert.equal(writes.length, 1);
        assert.deepEqual(writes[0].filters.find(([c]) => c === 'employee_id'), ['employee_id', 'TEST001']);
    });

    test('missing employee_id on clock-in/clock-out/missed still returns the existing 400', async () => {
        for (const p of ['/api/attendance/clock-in', '/api/attendance/clock-out', '/api/attendance/clock-out-missed']) {
            const r = await post(p, {}, EMPLOYEE);
            assert.equal(r.status, 400, p);
        }
    });

    test('unauthenticated requests are still rejected with 401', async () => {
        const r = await post('/api/attendance/clock-in', { employee_id: 'TEST001' });
        assert.equal(r.status, 401);
    });
});

describe('/admin/mark workflow is preserved', () => {
    test('admin can still mark attendance for another employee (no ownership rejection)', async () => {
        const r = await post('/api/attendance/admin/mark', { employee_id: 'TEST002', attendance_date: '2026-10-13', status_code: 'present' }, ADMIN);
        assert.notEqual(r.body.code, 'NOT_OWN_ATTENDANCE');
        assert.notEqual(r.status, 403, `admin was refused: ${JSON.stringify(r.body)}`);
    });

    test('a regular employee still cannot use /admin/mark (403 from requireAdmin, unchanged)', async () => {
        const r = await post('/api/attendance/admin/mark', { employee_id: 'TEST001', attendance_date: '2026-10-13', status_code: 'present' }, EMPLOYEE);
        assert.equal(r.status, 403);
        assert.equal(r.body.message, 'Admin access required');
    });
});
