const test = require('node:test');
const assert = require('node:assert/strict');
const { getCycleDates } = require('../config/payrollCycle');
const { countWeekdays, calculateProratedPay, dateOnly } = require('../services/payrollMath');

test('company cycle is previous 26th through current 25th, including January rollover', () => {
    const september = getCycleDates(9, 2026);
    assert.equal(september.startDateStr, '2026-08-26');
    assert.equal(september.endDateStr, '2026-09-25');
    const january = getCycleDates(1, 2027);
    assert.equal(january.startDateStr, '2026-12-26');
    assert.equal(january.endDateStr, '2027-01-25');
});

test('September 18 joiner earns six weekdays through September 26, not full salary', () => {
    const cycle = getCycleDates(9, 2026);
    const full = countWeekdays(cycle.startDate, cycle.endDate);
    const eligible = countWeekdays(cycle.startDate, cycle.endDate, '2026-09-18');
    assert.equal(full, 23);
    assert.equal(eligible, 6);
    assert.deepEqual(calculateProratedPay(23000, full, eligible, 0), {
        perDaySalary: 1000, basicSalary: 6000, unpaidDeduction: 0,
    });
});

test('each joining date limits its own weekdays; joining after cycle earns zero', () => {
    assert.equal(countWeekdays('2026-08-26', '2026-09-25', '2026-09-21'), 5);
    assert.equal(countWeekdays('2026-08-26', '2026-09-25', '2026-09-27'), 0);
    assert.equal(countWeekdays('2026-09-19', '2026-09-20'), 0);
});

test('absence and half-day shortfalls are subtracted once from eligible salary', () => {
    const pay = calculateProratedPay(24000, 24, 6, 1.5);
    assert.equal(pay.basicSalary - pay.unpaidDeduction, 4500);
    assert.equal(calculateProratedPay(24000, 24, 24, 0).basicSalary, 24000);
    assert.equal(calculateProratedPay(24000, 24, 0, 0).basicSalary, 0);
});

test('local midnight retains calendar date in IST', () => {
    const date = dateOnly(new Date(2026, 8, 18));
    assert.equal(date.getDate(), 18);
    assert.equal(countWeekdays(date, new Date(2026, 8, 26)), 6);
});

for (const year of [2024, 2026, 2027]) {
    test('cycles are continuous without overlap for every month in ' + year, () => {
        for (let month = 1; month <= 12; month++) {
            const current = getCycleDates(month, year);
            const next = getCycleDates(month === 12 ? 1 : month + 1, month === 12 ? year + 1 : year);
            const afterEnd = new Date(current.endDate);
            afterEnd.setDate(afterEnd.getDate() + 1);
            assert.equal(afterEnd.getTime(), next.startDate.getTime());
            assert.equal(current.endDate.getDate(), 25);
            assert.equal(next.startDate.getDate(), 26);
            assert.ok(current.endDate < next.startDate);
        }
    });
}
