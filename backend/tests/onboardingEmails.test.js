const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

function loadModule(relativePath, stubs, globals = {}) {
    const filename = path.join(__dirname, relativePath);
    const localRequire = createRequire(filename);
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
        module, exports: module.exports, Buffer,
        console: { log() {}, warn() {}, error() {} },
        require: (name) => stubs[name] || localRequire(name),
        ...globals,
    });
    return module.exports;
}

test('IT email and attachment include work details but exclude salary, documents and credentials', async () => {
    let payload;
    const service = loadModule('../services/emailService.js', {
        resend: { Resend: class { constructor() { this.emails = { send: async (mail) => { payload = mail; return { data: { id: 'test' } }; } }; } } },
    }, { process: { env: { RESEND_API_KEY: 'fake-test-key' } } });
    const employee = {
        first_name: '<New>', middle_name: 'Test', last_name: 'Employee', employee_id: 'TEST001',
        email: 'new@example.test', phone: '1234567890', joining_date: '2026-10-09',
        designation: 'Developer', department: 'Sales', reporting_manager: 'Test Manager',
        employment_type: 'Full Time', shift_timing: '9 AM - 6 PM',
        gross_salary: 'SECRET-SALARY', pan_number: 'SECRET-PAN', password: 'SECRET-PASSWORD',
        account_number: 'SECRET-BANK', offer_letter: 'SECRET-OFFER', aadhar_card_doc: 'SECRET-DOC',
        address: 'SECRET-ADDRESS', dob: 'SECRET-DOB',
    };
    const result = await service.sendITNewJoinerEmail(['it@example.test'], employee);
    assert.equal(result.success, true);
    assert.equal(payload.to[0], 'it@example.test');
    assert.match(payload.html, /&lt;New&gt;/);
    assert.equal(payload.attachments.length, 1);
    assert.equal(payload.attachments[0].filename, 'TEST001-IT-Onboarding-Details.txt');
    const attachment = Buffer.from(payload.attachments[0].content, 'base64').toString('utf8');
    for (const value of ['TEST001', 'new@example.test', 'Test Manager', 'Pune, Maharashtra', '2026-10-09']) {
        assert.ok(attachment.includes(value));
    }
    assert.doesNotMatch(payload.html + payload.text + attachment, /SECRET-/);
    assert.match(attachment, /assign a system\/laptop/);
});

function harness({ employeeResult = { success: true }, employeeThrows = false, data = [], error = null } = {}) {
    const calls = [];
    const emails = {
        sendEmployeeCredentialsEmail: async () => {
            calls.push('employee');
            if (employeeThrows) throw new Error('send failed');
            return employeeResult;
        },
        sendITNewJoinerEmail: async (recipients) => { calls.push(['IT', ...recipients]); return { success: true }; },
    };
    const filters = [];
    const query = {
        select(fields) { assert.equal(fields, 'email'); return this; },
        eq(field, value) { filters.push([field, value]); return this; },
        then(resolve, reject) { return Promise.resolve({ data, error }).then(resolve, reject); },
    };
    const supabase = { from(table) { assert.equal(table, 'employees'); calls.push('lookup'); return query; } };
    const { sendOnboardingEmails } = loadModule('../utils/onboardingEmails.js', { '../services/emailService': emails });
    return { calls, filters, run: () => sendOnboardingEmails(supabase, { employee: {}, credentials: {} }) };
}

test('employee email completes before active IT lookup and deduplicated IT notification', async () => {
    const h = harness({ data: [{ email: ' IT@example.test ' }, { email: 'it@example.test' }, { email: '' }] });
    await h.run();
    assert.equal(JSON.stringify(h.calls), JSON.stringify(['employee', 'lookup', ['IT', 'it@example.test']]));
    assert.deepEqual(h.filters, [['department', 'IT'], ['is_active', true]]);
});

test('employee email failures do not prevent IT notification or reject onboarding', async () => {
    for (const options of [{ employeeResult: { success: false } }, { employeeThrows: true }]) {
        const h = harness({ ...options, data: [{ email: 'it@example.test' }] });
        await assert.doesNotReject(h.run());
        assert.equal(h.calls[2][0], 'IT');
    }
});

test('missing IT recipients and lookup errors do not reject onboarding or send to another department', async () => {
    for (const options of [{ data: [] }, { error: new Error('lookup failed') }]) {
        const h = harness(options);
        await assert.doesNotReject(h.run());
        assert.deepEqual(h.calls, ['employee', 'lookup']);
    }
});
