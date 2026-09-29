const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Run real handlers with an isolated database double: never connect to production.
const DAY = '2026-09-29';
const employee = { employee_id: 'TEST001', first_name: 'Test', last_name: 'Employee', dob: '1990-09-29' };
const columns = new Set('id employee_id leave_type leave_duration half_day_type start_date end_date days_count reason status remarks admin_comments approved_by approved_date reporting_manager applied_date created_at updated_at'.split(' '));

function harness(file, responses, realAttendance = false) {
    const inserts = [];
    const updates = [];
    const queries = [];
    const synced = [];
    const reverted = [];
    const errors = [];
    const supabase = {
        from(table) {
            const expected = responses.shift();
            assert.ok(expected, `Unexpected query to ${table}`);
            assert.equal(table, expected.table);
            const query = { table, operations: [] };
            queries.push(query);
            const builder = {};
            for (const method of ['select', 'eq', 'gte', 'lte', 'in', 'single', 'maybeSingle', 'order', 'or', 'delete']) {
                builder[method] = (...args) => { query.operations.push({ method, args }); return builder; };
            }
            builder.update = (data) => { updates.push({ table, data }); return builder; };
            builder.insert = (rows) => {
                inserts.push({ table, rows });
                if (table === 'leaves') {
                    for (const row of rows) {
                        for (const key of Object.keys(row)) assert.ok(columns.has(key), `Unknown leaves column: ${key}`);
                        assert.equal(row.employee_id, employee.employee_id);
                    }
                }
                return builder;
            };
            builder.then = (resolve, reject) => Promise.resolve(expected.result).then(resolve, reject);
            return builder;
        },
    };
    const mocks = {
        '../config/supabase': supabase,
        '../services/emailService': {},
        '../config/roleGroups': { HR_ROLES: [] },
        '../utils/employeeLookup': {},
        '../config/leavePolicy': require('../config/leavePolicy'),
        '../services/leaveAttendanceSync': {
            syncAttendanceForApprovedLeave: async row => synced.push(row),
            revertAttendanceForLeave: async row => reverted.push(row),
        },
        '../data/holidays': { isDateHoliday: () => false },
        '../services/companyHolidayService': { getHoliday: async () => null },
        'node-cron': { schedule: () => assert.fail('Tests must not schedule jobs') },
    };
    const module = { exports: {} };
    class FixedDate extends Date {
        constructor(...args) { super(...(args.length ? args : [`${DAY}T06:00:00Z`])); }
        static now() { return new Date(`${DAY}T06:00:00Z`).getTime(); }
    }
    if (realAttendance) {
        const attendanceModule = { exports: {} };
        vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../services/leaveAttendanceSync.js'), 'utf8'), {
            module: attendanceModule, Date: FixedDate,
            console: { error: (...args) => errors.push(args) },
            require(name) { assert.ok(Object.hasOwn(mocks, name)); return mocks[name]; },
        });
        mocks['../services/leaveAttendanceSync'] = attendanceModule.exports;
    }
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
        module, exports: module.exports, Date: FixedDate,
        console: { log() {}, warn() {}, error: (...args) => errors.push(args) },
        require(name) {
            assert.ok(Object.hasOwn(mocks, name), `Unmocked dependency: ${name}`);
            return mocks[name];
        },
    }, { filename: file });
    return { api: module.exports, inserts, updates, queries, synced, reverted, errors, responses };
}

const response = (table, data = null, error = null) => ({ table, result: { data, error } });
const makeRes = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } });
const makeLeave = (type, status = 'pending') => ({ id: 7, employee_id: employee.employee_id,
    leave_type: type, status, days_count: 1, start_date: DAY, end_date: DAY, reporting_manager: 'Test Manager' });
const statusRequest = (status, role = 'admin', employeeId = 'ADMIN001') => ({
    params: { id: '7' }, body: { status }, user: { role, employeeId },
});

for (const role of ['employee', 'admin', 'manager']) {
    test(`leave list supplies employee name without employee_name for ${role}`, async () => {
        const joined = { ...makeLeave('Unpaid'), employees: { first_name: 'Test', last_name: 'Employee', department: 'QA' } };
        const replies = [response('leaves', [joined])];
        if (role === 'manager') replies.push(response('employees', { first_name: 'Test', last_name: 'Manager' }),
            response('employees', [{ employee_id: employee.employee_id }]), response('leaves', [{ id: 7 }]));
        const h = harness('controllers/leaveController.js', replies);
        const res = makeRes();
        await h.api.getLeaves({ user: { role, employeeId: employee.employee_id }, query: role === 'employee' ? {} : { all: 'true' } }, res);
        assert.equal(res.statusCode, 200);
        assert.equal(res.body[0].first_name, 'Test');
        assert.equal(res.body[0].last_name, 'Employee');
        assert.equal(res.body[0].department, 'QA');
        assert.equal(Object.hasOwn(res.body[0], 'employee_name'), false);
        assert.ok(h.queries[0].operations.some(op => op.method === 'select' && op.args[0].includes('employees!inner')));
        if (role === 'employee') assert.ok(h.queries[0].operations.some(op => op.method === 'eq' && op.args[0] === 'employee_id' && op.args[1] === employee.employee_id));
        assert.equal(h.responses.length, 0);
    });
}

for (const type of ['Unpaid', 'Annual', 'Birthday', 'Comp-Off']) {
    test(`${type} approval preserves balance rules and writes actual attendance placeholders`, async () => {
        const leave = makeLeave(type);
        const approved = { ...leave, status: 'approved' };
        const replies = [response('leaves', leave), response('leaves', [approved])];
        if (type === 'Annual') replies.push(response('leave_balance', { total_used: 2, total_accrued: 10, total_pending: 1 }), response('leave_balance'));
        if (type === 'Comp-Off') replies.push(response('employees', { comp_off_balance: 3 }), response('employees'));
        if (type !== 'Unpaid') replies.push(response('attendance'), response('attendance'));
        replies.push(response('employees'));
        const h = harness('controllers/leaveController.js', replies, true);
        const res = makeRes();
        await h.api.updateLeaveStatus(statusRequest('approved'), res);
        assert.equal(res.body.success, true);
        const attendance = h.inserts.filter(x => x.table === 'attendance');
        assert.equal(attendance.length, type === 'Unpaid' ? 0 : 1);
        if (attendance.length) {
            assert.equal(attendance[0].rows[0].employee_id, employee.employee_id);
            assert.equal(attendance[0].rows[0].status, 'present');
            assert.equal(attendance[0].rows[0].attendance_type, { Annual: 'paid_leave', Birthday: 'birthday_leave', 'Comp-Off': 'comp_off' }[type]);
        }
        const balance = h.updates.find(x => x.table === 'leave_balance');
        if (type === 'Annual') { assert.equal(balance.data.total_used, 3); assert.equal(balance.data.current_balance, 6); }
        else assert.equal(balance, undefined);
        if (type === 'Comp-Off') assert.equal(h.updates.find(x => x.table === 'employees').data.comp_off_balance, 2);
        assert.equal(h.errors.length, 0);
        assert.equal(h.responses.length, 0);
    });
}

test('approval preserves an existing real clock-in', async () => {
    const leave = makeLeave('Annual');
    const h = harness('controllers/leaveController.js', [response('leaves', leave), response('leaves', [{ ...leave, status: 'approved' }]),
        response('leave_balance'), response('attendance', { id: 1, clock_in: '09:00' }), response('employees')], true);
    const res = makeRes();
    await h.api.updateLeaveStatus(statusRequest('approved'), res);
    assert.equal(res.body.success, true);
    assert.equal(h.inserts.length, 0);
    assert.equal(h.updates.filter(x => x.table === 'attendance').length, 0);
    assert.equal(h.responses.length, 0);
});

test('pending rejection does not deduct balance or alter attendance', async () => {
    const leave = makeLeave('Annual');
    const h = harness('controllers/leaveController.js', [response('leaves', leave), response('leaves', [{ ...leave, status: 'rejected' }]), response('employees')], true);
    const res = makeRes();
    await h.api.updateLeaveStatus(statusRequest('rejected'), res);
    assert.equal(res.body.success, true);
    assert.equal(h.updates.length, 1);
    assert.equal(h.inserts.length, 0);
    assert.equal(h.responses.length, 0);
});

test('own approved Comp-Off cancellation removes placeholder and restores balance', async () => {
    const leave = makeLeave('Comp-Off', 'approved');
    const h = harness('controllers/leaveController.js', [response('leaves', leave), response('leaves', [{ ...leave, status: 'cancelled' }]),
        response('attendance', { id: 1, clock_in: null, attendance_type: 'comp_off' }), response('attendance'),
        response('employees', { comp_off_balance: 2 }), response('employees'), response('employees')], true);
    const res = makeRes();
    await h.api.updateLeaveStatus(statusRequest('cancelled', 'employee', employee.employee_id), res);
    assert.equal(res.body.success, true);
    assert.equal(h.updates.find(x => x.table === 'employees').data.comp_off_balance, 3);
    assert.ok(h.queries.some(q => q.table === 'attendance' && q.operations.some(op => op.method === 'delete')));
    assert.equal(h.responses.length, 0);
});

test('unrelated manager cannot approve a leave', async () => {
    const h = harness('controllers/leaveController.js', [response('leaves', makeLeave('Unpaid')),
        response('employees', { first_name: 'Other', last_name: 'Manager' }), response('employees', { reporting_manager: 'Test Manager' })]);
    const res = makeRes();
    await h.api.updateLeaveStatus(statusRequest('approved', 'manager', 'OTHER'), res);
    assert.equal(res.statusCode, 403);
    assert.equal(h.updates.length, 0);
});

// Expected behavior assertions documenting independently reproduced existing defects.
// TODO failures stay visible without treating them as regressions from employee_name removal.
test('employee cannot cancel another employee leave', { todo: 'Existing ownership check is missing in updateLeaveStatus' }, async () => {
    const h = harness('controllers/leaveController.js', [response('leaves', makeLeave('Unpaid')),
        response('leaves', [{ ...makeLeave('Unpaid'), status: 'cancelled' }]), response('employees')]);
    const res = makeRes();
    await h.api.updateLeaveStatus(statusRequest('cancelled', 'employee', 'OTHER'), res);
    assert.equal(res.statusCode, 403);
    assert.equal(h.updates.length, 0);
});

test('repeated approval must not deduct Comp-Off twice', { todo: 'Existing status transition has no already-approved guard' }, async () => {
    const leave = makeLeave('Comp-Off', 'approved');
    const h = harness('controllers/leaveController.js', [response('leaves', leave), response('leaves', [leave]),
        response('employees', { comp_off_balance: 2 }), response('employees'), response('employees')]);
    await h.api.updateLeaveStatus(statusRequest('approved'), makeRes());
    assert.equal(h.updates.filter(x => x.table === 'employees').length, 0);
});

test('attendance write failure must not report complete approval success', { todo: 'Existing attendance service catches errors without propagating failure' }, async () => {
    const leave = makeLeave('Birthday');
    const h = harness('controllers/leaveController.js', [response('leaves', leave), response('leaves', [{ ...leave, status: 'approved' }]),
        response('attendance'), response('attendance', null, { message: 'Database unavailable' }), response('employees')], true);
    const res = makeRes();
    await h.api.updateLeaveStatus(statusRequest('approved'), res);
    assert.equal(h.errors.length, 1);
    assert.equal(res.body.success, false);
});

for (const failure of [false, true]) {
    for (const birthday of [false, true]) {
        test(`leave application: ${birthday ? 'birthday' : 'unpaid'} ${failure ? 'failure surfaces without retry' : 'uses valid schema'}`, async () => {
            const saved = { id: 7, employee_id: employee.employee_id, status: birthday ? 'approved' : 'pending' };
            const replies = [response('employees', employee)];
            if (birthday) replies.push(response('leaves'));
            replies.push(response('leaves', failure ? null : [saved], failure ? { message: 'Database unavailable' } : null));
            if (!birthday && !failure) replies.push(response('employees', []), response('employees', []));
            const h = harness('controllers/leaveController.js', replies);
            const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
            await h.api.applyLeave({ body: {
                employee_id: employee.employee_id, leave_type: birthday ? 'Birthday' : 'Unpaid',
                leave_duration: 'Full Day', start_date: DAY, reason: 'Test', days_count: 1, reporting_manager: ' Manager ',
            } }, res);
            assert.equal(h.inserts.length, 1);
            const payload = h.inserts[0].rows[0];
            assert.equal(payload.status, birthday ? 'approved' : 'pending');
            assert.equal(payload.reporting_manager, 'Manager');
            assert.equal(res.statusCode, failure ? 500 : 200);
            assert.equal(res.body.success, !failure);
            assert.equal(h.synced.length, birthday && !failure ? 1 : 0);
            if (failure) assert.equal(res.body.error, 'Database unavailable');
            else assert.equal(res.body.leave, saved);
            assert.equal(h.responses.length, 0);
        });
    }

    test(`absence job: unpaid insert ${failure ? 'failure is logged, not counted as created' : 'uses valid schema'}`, async () => {
        const h = harness('cron/absentEmployeeCheck.js', [
            response('employees', [{ ...employee, dob: null }]), response('leaves', []),
            response('attendance'), response('attendance'), response('leaves'),
            response('leaves', null, failure ? { message: 'Database unavailable' } : null),
        ]);
        const result = await h.api.markAbsentEmployeesAsLeave();
        const leaves = h.inserts.filter(x => x.table === 'leaves');
        assert.equal(leaves.length, 1);
        assert.equal(leaves[0].rows[0].leave_type, 'Unpaid');
        assert.equal(leaves[0].rows[0].status, 'approved');
        assert.equal(result.leaveCreatedCount, failure ? 0 : 1);
        assert.equal(h.errors.some(args => String(args[0]).includes('Error creating leave record')), failure);
        assert.equal(h.responses.length, 0);
    });

    test(`birthday job: ${failure ? 'failed insert does not sync attendance or retry' : 'valid insert syncs attendance'}`, async () => {
        const saved = { id: 8, employee_id: employee.employee_id, leave_type: 'Birthday' };
        const replies = [response('employees', [employee]), response('leaves', []), response('leaves'),
            response('leaves', failure ? null : saved, failure ? { message: 'Database unavailable' } : null)];
        // Existing clock-in prevents the unrelated absence branch after a birthday failure.
        if (failure) replies.push(response('attendance', { id: 1, clock_in: '09:00' }));
        const h = harness('cron/absentEmployeeCheck.js', replies);
        const result = await h.api.markAbsentEmployeesAsLeave();
        assert.equal(h.inserts.length, 1);
        assert.equal(h.inserts[0].rows[0].leave_type, 'Birthday');
        assert.equal(h.inserts[0].rows[0].approved_by, 'SYSTEM');
        assert.equal(result.birthdayLeaveCount, failure ? 0 : 1);
        assert.equal(h.synced.length, failure ? 0 : 1);
        assert.equal(h.responses.length, 0);
    });
}
