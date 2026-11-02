const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

async function generate({ joining = '2026-09-18', attendance = [], holidays = [], leaves = [], editBody = null, role = 'admin', expectedStatus = 200, employeeFields = {} } = {}) {
    let saved;
    const employee = { employee_id: 'TEST', joining_date: joining, gross_salary: 23000, in_hand_salary: 21000, pf_amount: 0, pt_amount: 0, ...employeeFields };
    const supabase = { from(table) {
        let inserted = false;
        const builder = {};
        for (const method of ['select', 'eq', 'gte', 'lte', 'order', 'limit', 'single', 'delete']) builder[method] = () => builder;
        builder.update = data => { if (table === 'salary_slips') { saved = data; inserted = true; } return builder; };
        builder.insert = rows => { inserted = true; saved = rows[0]; return builder; };
        builder.then = resolve => resolve({ data: table === 'employees' ? employee : table === 'attendance' ? attendance : table === 'leaves' ? leaves : inserted ? saved : [], error: null });
        return builder;
    } };
    const mocks = {
        '../config/supabase': supabase,
        '../data/holidays': { isDateHoliday: () => false, getHolidayName: () => '' },
        './deductionController': { getDeductionTotal: async () => 0 },
        './attendanceController': { _shared: { pickBetterAttendanceRow: (_, row) => row } },
        '../config/payrollCycle': require('../config/payrollCycle'),
        '../services/payrollMath': require('../services/payrollMath'),
        '../services/companyHolidayService': { getHolidaysInRange: async () => holidays },
    };
    const exports = {};
    const FrozenDate = class extends Date { constructor(...args) { super(...(args.length ? args : ['2026-10-13T12:00:00+05:30'])); } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../controllers/salaryController.js'), 'utf8'), {
        exports, require: name => { assert.ok(name in mocks, name); return mocks[name]; }, Date: FrozenDate,
        console: { log() {}, error() {} },
    });
    let response;
    let status = 200;
    const res = { status(code) { status = code; return this; }, json(body) { response = body; } };
    const req = { body: { employee_id: 'TEST', month: 9, year: 2026, ...(editBody || {}) }, user: { role } };
    await (editBody ? exports.saveSalaryAdjustment : exports.generateSalarySlip)(req, res);
    assert.equal(status, expectedStatus);
    assert.equal(response.success, expectedStatus === 200);
    return saved;
}

const present = ['18', '21', '22', '23', '24', '25'].map(day => ({ attendance_date: `2026-09-${day}`, status: 'present' }));

test('HR/admin generation stores joining-date proration and the company cycle', async () => {
    const slip = await generate({ attendance: present });
    assert.equal(slip.cycle_start_date, '2026-08-26');
    assert.equal(slip.cycle_end_date, '2026-09-25');
    assert.equal(slip.total_working_days, 23);
    assert.equal(slip.present_days, 6);
    assert.equal(slip.net_salary, 6000);
});

test('half day deducts half a daily rate once', async () => {
    const slip = await generate({ attendance: present.map((row, i) => i === 0 ? { ...row, status: 'half_day' } : row) });
    assert.equal(slip.basic_salary, 6000);
    assert.equal(slip.unpaid_deduction, 500);
    assert.equal(slip.net_salary, 5500);
});

test('holiday before joining does not pay; holiday after joining credits once', async () => {
    const slip = await generate({ attendance: present.slice(1), holidays: [
        { holiday_date: '2026-09-17', name: 'Before joining' },
        { holiday_date: '2026-09-18', name: 'Paid holiday' },
    ] });
    assert.equal(slip.paid_leave_days, 1);
    assert.equal(slip.absent_days, 0);
    assert.equal(slip.net_salary, 6000);
});

test('employee joining after the cutoff earns zero and has no fixed deduction', async () => {
    const slip = await generate({ joining: '2026-09-28' });
    assert.equal(slip.basic_salary, 0);
    assert.equal(slip.net_salary, 0);
    assert.equal(slip.dt, 0);
});

test('half-day unpaid leave plus attendance pays the remaining half', async () => {
    const slip = await generate({ attendance: present, leaves: [{
        leave_type: 'Unpaid', start_date: '2026-09-18', end_date: '2026-09-18', leave_duration: 'Half Day',
    }] });
    assert.equal(slip.unpaid_leave_days, 0.5);
    assert.equal(slip.present_days, 5.5);
    assert.equal(slip.net_salary, 5500);
});

const editBody = { payroll_edit: true, present_days: 5.5, absent_days: 0, half_days: 1,
    pf_amount: 100, professional_tax_amount: 200, salary_earned: 5500, deduction: 100, final_payable: 5100 };
test('HR saves payroll edits and payslip totals reconcile', async () => {
    const slip = await generate({ editBody, role: 'hr' });
    assert.equal(slip.present_days, 5.5);
    assert.equal(slip.half_days, 1);
    assert.equal(slip.dt, 300);
    assert.equal(slip.unpaid_deduction, 100);
    assert.equal(slip.basic_salary + slip.overtime_amount - slip.dt - slip.unpaid_deduction - slip.custom_deduction, slip.net_salary);
    assert.equal(slip.net_salary, 5100);
});
test('employee cannot save payroll edits', async () => {
    await generate({ editBody, role: 'employee', expectedStatus: 403 });
});
test('invalid and excessive day counts cannot be saved', async () => {
    await generate({ editBody: { ...editBody, present_days: 30 }, expectedStatus: 400 });
    await generate({ editBody: { ...editBody, deduction: -1 }, expectedStatus: 400 });
});

// Salary starts from gross; in-hand is already net of fixed deductions.
test('full paid cycle uses 23000 gross and deducts 2000 once, yielding 21000', async () => {
 const attendance = [];
 for (let day = new Date('2026-08-26T12:00:00Z'); day <= new Date('2026-09-25T12:00:00Z'); day.setUTCDate(day.getUTCDate()+1)) {
  if (![0,6].includes(day.getUTCDay())) attendance.push({attendance_date:day.toISOString().slice(0,10),status:'present'});
 }
 const slip = await generate({joining:'2026-08-01',attendance,employeeFields:{pf_amount:1800,professional_tax_amount:200}});
 assert.equal(slip.monthly_salary,23000);
 assert.equal(slip.basic_salary,23000);
 assert.equal(slip.dt,2000);
 assert.equal(slip.net_salary,21000);
});
test('payroll adjustment also uses gross rather than already-net in-hand salary', async () => {
 const slip = await generate({editBody,employeeFields:{gross_salary:23000,in_hand_salary:21000}});
 assert.equal(slip.monthly_salary,23000);
 assert.equal(slip.per_day_salary,1000);
});
