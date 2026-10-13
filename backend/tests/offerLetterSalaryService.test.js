const test = require('node:test');
const assert = require('node:assert/strict');

const { calculateSalaryBreakdown } = require('../services/offerLetterSalaryService');
const { amountToIndianWords } = require('../utils/numberToWords');

test('Basic/HRA/Variable sum back to monthly gross with no rounding drift', () => {
    for (const gross of [45000, 66667, 83333, 250000, 12345]) {
        const { monthly } = calculateSalaryBreakdown({ grossMonthly: gross });
        assert.equal(monthly.basic + monthly.hra + monthly.variable, monthly.gross);
    }
});

test('annual figures are always exactly 12x the monthly figures', () => {
    const { monthly, annual } = calculateSalaryBreakdown({ grossMonthly: 85000, pfAmount: 1800, professionalTaxAmount: 200 });
    for (const key of ['gross', 'basic', 'hra', 'variable', 'pf', 'pt', 'totalDeductions', 'net']) {
        assert.equal(annual[key], monthly[key] * 12);
    }
});

test('PF/PT default exactly like salaryController.js when unset (PF 1800, PT 0)', () => {
    const { monthly } = calculateSalaryBreakdown({ grossMonthly: 50000 });
    assert.equal(monthly.pf, 1800);
    assert.equal(monthly.pt, 0);
});

test('PF/PT/professional tax use the employee-specific values (including explicit 0) when provided', () => {
    const { monthly } = calculateSalaryBreakdown({ grossMonthly: 50000, pfAmount: 0, ptAmount: 200, professionalTaxAmount: 300 });
    assert.equal(monthly.pf, 0);
    assert.equal(monthly.pt, 300); // Only Professional Tax is charged; legacy PT is ignored.
});

test('net salary equals gross minus total deductions', () => {
    const { monthly } = calculateSalaryBreakdown({ grossMonthly: 85000, pfAmount: 1800, professionalTaxAmount: 200 });
    assert.equal(monthly.net, monthly.gross - monthly.totalDeductions);
});

test('reference example (₹85,000/month, ₹10,20,000/year) reproduces the supplied annexure', () => {
    const { monthly, annual } = calculateSalaryBreakdown({ grossMonthly: 85000, pfAmount: 1800, professionalTaxAmount: 200 });
    assert.equal(monthly.basic, 42500);
    assert.equal(monthly.hra, 25500);
    assert.equal(monthly.variable, 17000);
    assert.equal(monthly.totalDeductions, 2000);
    assert.equal(monthly.net, 83000);
    assert.equal(annual.gross, 1020000);
    assert.equal(annual.net, 996000);
});

test('amountToIndianWords matches the reference letter wording', () => {
    assert.equal(amountToIndianWords(1020000), 'Ten Lakh Twenty Thousand');
});

test('amountToIndianWords handles crore, zero, and small amounts', () => {
    assert.equal(amountToIndianWords(0), 'Zero');
    assert.equal(amountToIndianWords(500), 'Five Hundred');
    assert.equal(amountToIndianWords(12345678), 'One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight');
});
