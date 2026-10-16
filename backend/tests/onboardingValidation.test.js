const test = require('node:test');
const assert = require('node:assert/strict');
const { validateOnboardingEmployeeFields: validate } = require('../utils/onboardingValidation');

test('identifies an oversized 23-character UAN without returning personal data', () => {
    const result = validate({ uan: 'X'.repeat(23) });
    assert.equal(result.success, false);
    assert.deepEqual(result.fields, [{ field: 'uan', maxLength: 22, actualLength: 23 }]);
    assert.match(result.message, /UAN \(PF Number\) has 23 characters; maximum is 22/);
    assert.ok(!JSON.stringify(result).includes('X'.repeat(23)));
});

test('accepts optional empty fields and values at the database boundary', () => {
    assert.equal(validate({ uan: null, phone: '', first_name: 'A'.repeat(100) }), null);
    assert.equal(validate({ uan: '1'.repeat(22) }), null);
});

test('reports all oversized employee fields, including whitespace and Unicode correctly', () => {
    assert.deepEqual(validate({ phone: ' '.repeat(21), city: 'a'.repeat(101) }).fields,
        [{ field: 'phone', maxLength: 20, actualLength: 21 }, { field: 'city', maxLength: 100, actualLength: 101 }]);
    assert.equal(validate({ first_name: '😀'.repeat(100) }), null);
    assert.equal(validate({ first_name: '😀'.repeat(101) }).fields[0].actualLength, 101);
});

test('allows partial admin edits and unbounded document fields', () => {
    assert.equal(validate({ uan: '123456789012', address: 'a'.repeat(1000), passport_photo: 'a'.repeat(1000) }), null);
});

test('manual approval rejects a legacy oversized UAN before any writes or tickets', async () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const vm = require('node:vm');
    const routes = new Map();
    const router = {};
    for (const method of ['get', 'post', 'patch', 'delete']) {
        router[method] = (url, ...handlers) => routes.set(`${method} ${url}`, handlers.at(-1));
    }
    const reads = [
        { table: 'employee_offer_links', data: { id: 'offer', status: 'submitted' } },
        { table: 'employee_onboarding_submissions', data: { uan: 'X'.repeat(23) } },
    ];
    const supabase = { from(table) {
        const expected = reads.shift();
        assert.ok(expected, 'Approval must stop before account creation or ticket queries');
        assert.equal(table, expected.table);
        const query = {
            select() { return query; }, eq() { return query; },
            async maybeSingle() { return { data: expected.data }; },
        };
        return query;
    } };
    const multer = () => ({});
    multer.memoryStorage = () => ({});
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../routes/onboardingRoutes.js'), 'utf8'), {
        module, console, require(name) {
            if (name === 'express') return { Router: () => router };
            if (name === 'multer') return multer;
            if (name === '../config/supabase') return supabase;
            if (name === '../utils/onboardingValidation') return { validateOnboardingEmployeeFields: validate };
            return {};
        },
    });
    let status, body;
    const res = { status(code) { status = code; return res; }, json(value) { body = value; return res; } };
    await routes.get('patch /links/:id/approve')({ params: { id: 'offer' } }, res);
    assert.equal(status, 422);
    assert.equal(body.fields[0].field, 'uan');
    assert.equal(reads.length, 0);
});
