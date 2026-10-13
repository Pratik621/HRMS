const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const { resolveLetter, buildParagraphs, generatePdf, validDate } = require('../services/employmentLetterService');
const employee = { employee_id: 'TEST001', first_name: 'Test', last_name: 'Employee', joining_date: '2023-09-14', designation: 'HR Manager', gender: 'Female', email: 'test@example.com' };
const input = { type: 'relieving', issueDate: '2026-10-30', lastWorkingDate: '2026-10-30', relievingDate: '2026-10-30' };
test('letters use employee name, joining date and designation instead of sample-person data', () => {
  const letter = resolveLetter(employee, { ...input, name: 'Wrong Name', joiningDate: '1999-01-01' });
  const body = buildParagraphs(letter).join(' ');
  assert.ok(body.includes('Ms. Test Employee'));
  assert.ok(body.includes('14 September 2023'));
  assert.ok(!body.includes('Swekcha Tiwari was employed'));
  assert.ok(body.includes('She has been relieved'));
  assert.ok(!body.includes('wish him'));
});
test('experience letters use consistent gender-neutral pronouns', () => {
  const body = buildParagraphs(resolveLetter(employee, { ...input, type: 'experience', pronouns: 'they' })).join(' ');
  assert.ok(body.includes('their tenure'));
  assert.ok(body.includes('wish them'));
  assert.ok(!body.includes('relieved'));
});
test('invalid dates and employment chronology are rejected', () => {
  assert.equal(validDate('2026-02-30'), false);
  assert.equal(validDate('2024-02-29'), true);
  assert.throws(() => resolveLetter(employee, { ...input, lastWorkingDate: '2020-01-01' }), /precede joining/);
  assert.throws(() => resolveLetter(employee, { ...input, issueDate: '2026-10-29' }), /precede last working/);
  assert.throws(() => resolveLetter(employee, { ...input, relievingDate: '2026-10-29' }), /Relieving effective/);
  assert.throws(() => resolveLetter(employee, { ...input, type: 'other' }), /Choose/);
});
test('PDF rendering returns a real PDF for both letter types', async () => {
  for (const type of ['relieving', 'experience']) {
    const pdf = await generatePdf(resolveLetter(employee, { ...input, type }));
    assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
    assert.ok(pdf.length > 1000);
  }
});
function harness(sendSuccess = true) {
  const sent = [];
  const exports = {};
  const authSecret = 'test-only-employment-letter-auth-secret';
  const mocks = {
    jsonwebtoken: jwt, crypto: require('node:crypto'),
    '../config/supabase': { from() { const q = {}; for (const method of ['select', 'eq', 'maybeSingle']) q[method] = () => q; q.then = resolve => resolve({ data: employee, error: null }); return q; } },
    '../services/emailService': { sendEmail: async payload => { sent.push(payload); return { success: sendSuccess }; } },
    '../config/companyInfo': require('../config/companyInfo'),
    '../services/employmentLetterService': { resolveLetter, generatePdf: async () => Buffer.from('%PDF-test-preview') },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../controllers/employmentLetterController.js'), 'utf8'), {
    exports, require: name => { assert.ok(name in mocks, name); return mocks[name]; }, process: { env: { JWT_SECRET: authSecret } },
  });
  const req = (body, role = 'hr', actor = 'HR001') => ({ body, params: { employeeId: 'TEST001' }, user: { role, employeeId: actor } });
  const res = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
  return { api: exports, sent, req, res, authSecret };
}
test('employees, managers and sub-admin cannot preview or send letters', async () => {
  const h = harness();
  for (const role of ['employee', 'manager', 'sub_admin', 'desktop_support']) {
    for (const action of ['defaults', 'preview', 'send']) {
      const res = h.res(); await h.api[action](h.req(input, role), res); assert.equal(res.statusCode, 403);
    }
  }
  assert.equal(h.sent.length, 0);
});
test('email sends the exact preview PDF to the selected employee, ignoring client recipient', async () => {
  const h = harness(); const preview = h.res(); await h.api.preview(h.req(input), preview);
  assert.equal(preview.body.success, true);
  const res = h.res(); await h.api.send(h.req({ previewToken: preview.body.previewToken, email: 'other@example.com' }), res);
  assert.equal(res.body.success, true); assert.equal(h.sent[0].to, employee.email);
  assert.equal(h.sent[0].attachments[0].content, preview.body.pdfBase64);
});
test('preview token cannot authenticate as a user and cannot be used by another issuer', async () => {
  const h = harness(); const preview = h.res(); await h.api.preview(h.req(input), preview);
  assert.throws(() => jwt.verify(preview.body.previewToken, h.authSecret), /signature/);
  const res = h.res(); await h.api.send(h.req({ previewToken: preview.body.previewToken }, 'admin', 'ADMIN002'), res);
  assert.equal(res.statusCode, 403); assert.equal(h.sent.length, 0);
});
test('tampered previews and failed email delivery never report success', async () => {
  const h = harness(false); const bad = h.res(); await h.api.send(h.req({ previewToken: 'invalid' }), bad);
  assert.equal(bad.statusCode, 400);
  const preview = h.res(); await h.api.preview(h.req(input), preview);
  const res = h.res(); await h.api.send(h.req({ previewToken: preview.body.previewToken }), res);
  assert.equal(res.statusCode, 502); assert.equal(res.body.success, false);
});

test('relieving letter matches reference font sizes, ordinal dates and bold emphasis', () => {
 const { ordinalDate, relievingRuns, RELIEVING_STYLE } = require('../services/employmentLetterService');
 assert.equal(RELIEVING_STYLE.titleSize, 24); assert.equal(RELIEVING_STYLE.subtitleSize, 12); assert.equal(RELIEVING_STYLE.bodySize, 12);
 assert.equal(ordinalDate('2026-10-30'), '30th October 2026'); assert.equal(ordinalDate('2026-01-11'), '11th January 2026'); assert.equal(ordinalDate('2026-01-21'), '21st January 2026');
 const runs = relievingRuns(resolveLetter(employee, input));
 const bold = runs[0].filter(run => run.bold).map(run => run.text);
 for (const value of ['Ms. Test Employee', 'B2BinDemand', 'HR Manager', '14th September 2023 to 30th October 2026']) assert.ok(bold.includes(value));
 assert.equal(runs[1].find(run => run.bold).text, '30th October 2026');
});
