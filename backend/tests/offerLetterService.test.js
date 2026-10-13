const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

const servicePath = path.join(__dirname, '../services/offerLetterService.js');
const serviceRequire = createRequire(servicePath);
const pdfBuffer = Buffer.from('test-pdf');
const serviceModule = { exports: {} };
const dependencies = {
    '../config/supabase': {
        from: () => ({ insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'test-letter' }, error: null }) }) }) }),
    },
    '../lib/supabaseStorage': {
        uploadFile: async () => ({ path: 'test-letter.pdf', publicUrl: 'https://example.test/test-letter.pdf' }),
    },
    './offerLetterPdfService': { generateOfferLetterPdf: async () => pdfBuffer },
};
vm.runInNewContext(fs.readFileSync(servicePath, 'utf8'), {
    module: serviceModule,
    exports: serviceModule.exports,
    require: (name) => dependencies[name] || serviceRequire(name),
});
const { resolveInput, generateAndStoreOfferLetter } = serviceModule.exports;
const employee = {
    employee_id: 'TEST001', first_name: 'Test', last_name: 'Employee',
    email: 'employee@example.test', designation: 'Developer',
    joining_date: '2026-10-09', gross_salary: 50000, pf_amount: 1800,
};

test('onboarding without a work location generates an attachment using the company default', async () => {
    const result = await generateAndStoreOfferLetter({ employee, formInput: {} });
    assert.equal(result.resolved.workLocation, 'Pune, Maharashtra');
    assert.equal(result.letterData.workLocation, 'Pune, Maharashtra');
    assert.equal(result.pdfBuffer, pdfBuffer);
    assert.equal(result.offerLetter.id, 'test-letter');
});

test('explicit form and employee work locations take precedence over the company default', () => {
    assert.equal(resolveInput({ ...employee, work_location: 'Mumbai' }).workLocation, 'Mumbai');
    assert.equal(resolveInput({ ...employee, work_location: 'Mumbai' }, { workLocation: 'Delhi' }).workLocation, 'Delhi');
});

test('missing salary still prevents generation of an incomplete offer letter', async () => {
    await assert.rejects(
        generateAndStoreOfferLetter({ employee: { ...employee, gross_salary: null }, formInput: {} }),
        /Missing required information: Annual CTC/,
    );
});
