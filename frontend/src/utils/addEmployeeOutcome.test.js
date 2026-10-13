import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SUCCESS_MESSAGE,
  describeCreateSuccess,
  describeCreateError,
  retryOnboardingTickets,
  redactForDisplay,
} from './addEmployeeOutcome.js';

// Shapes below mirror backend/routes/employeeRoutes.js POST / and POST /:id/onboarding-tickets.
const httpError = (status, data) => Object.assign(new Error(`HTTP ${status}`), { response: { status, data } });

describe('ordinary successful creation', () => {
  test('keeps the existing success message', () => {
    const r = describeCreateSuccess({ success: true, message: 'Employee created successfully', employee: { id: 5, employee_id: 'B2B261001' }, onboarding_tickets: { created: ['IT', 'Marketing'], failed: [], skipped: [] } });
    assert.equal(r.variant, 'success');
    assert.equal(r.message, DEFAULT_SUCCESS_MESSAGE);
    assert.equal(r.message, 'Employee added successfully!');
    assert.deepEqual(r.failedDepartments, []);
  });

  test('an older backend response without onboarding_tickets is still a plain success', () => {
    const r = describeCreateSuccess({ success: true, employee: { id: 5, employee_id: 'B2B261001' } });
    assert.equal(r.variant, 'success');
    assert.equal(r.message, 'Employee added successfully!');
  });

  test('a recovered-after-lost-response creation is still a plain success', () => {
    const r = describeCreateSuccess({ success: true, recovered_after_lost_response: true, employee: { id: 5, employee_id: 'B2B261001' }, onboarding_tickets: { created: ['IT', 'Marketing'], failed: [], skipped: [] } });
    assert.equal(r.variant, 'success');
  });
});

describe('created, but onboarding tickets failed', () => {
  const data = { success: true, employee: { id: 42, employee_id: 'B2B261007' }, onboarding_tickets: { created: ['IT'], failed: [{ department: 'Marketing', reason: 'x' }], skipped: [] } };

  test('returns a warning naming the employee and every failed department', () => {
    const r = describeCreateSuccess(data);
    assert.equal(r.variant, 'warning');
    assert.deepEqual(r.failedDepartments, ['Marketing']);
    assert.match(r.message, /B2B261007/);
    assert.match(r.message, /Marketing/);
    assert.match(r.message, /Retry onboarding tickets/);
    assert.match(r.message, /Do not add the employee again/);
    assert.equal(r.employee.id, 42, 'database id needed for the retry endpoint');
  });

  test('lists several failed departments', () => {
    const r = describeCreateSuccess({ ...data, onboarding_tickets: { created: [], failed: [{ department: 'IT' }, { department: 'Marketing' }], skipped: [] } });
    assert.deepEqual(r.failedDepartments, ['IT', 'Marketing']);
    assert.match(r.message, /IT, Marketing/);
  });
});

describe('retrying missing onboarding tickets (never re-creates the employee)', () => {
  test('posts only the failed departments to the onboarding-tickets endpoint', async () => {
    const calls = [];
    const post = async (url, body) => { calls.push({ url, body }); return { data: { success: true, onboarding_tickets: { created: ['Marketing'], failed: [], skipped: ['IT'] } } }; };
    const r = await retryOnboardingTickets(post, '/api/employees/42/onboarding-tickets', ['Marketing']);
    assert.equal(r.ok, true);
    assert.deepEqual(r.failedDepartments, []);
    assert.deepEqual(calls, [{ url: '/api/employees/42/onboarding-tickets', body: { departments: ['Marketing'] } }]);
    assert.equal(calls.some((c) => c.url === '/api/employees' || c.url.endsWith('/api/employees')), false, 'never calls the create endpoint');
  });

  test('still failing (502 from the backend): reports what remains, does not throw', async () => {
    const post = async () => { throw httpError(502, { success: false, message: 'Some onboarding tickets could not be raised: Marketing', onboarding_tickets: { created: [], failed: [{ department: 'Marketing' }], skipped: [] } }); };
    const r = await retryOnboardingTickets(post, '/x', ['Marketing']);
    assert.equal(r.ok, false);
    assert.deepEqual(r.failedDepartments, ['Marketing']);
    assert.match(r.message, /employee is already created/);
  });

  test('no response from server: keeps the original failed list', async () => {
    const post = async () => { throw Object.assign(new Error('Network Error'), { request: {} }); };
    const r = await retryOnboardingTickets(post, '/x', ['IT', 'Marketing']);
    assert.equal(r.ok, false);
    assert.deepEqual(r.failedDepartments, ['IT', 'Marketing']);
    assert.match(r.message, /No response from server/);
  });

  test('a 200 that still lists a failure is not reported as success', async () => {
    const post = async () => ({ data: { onboarding_tickets: { created: [], failed: [{ department: 'IT' }], skipped: [] } } });
    const r = await retryOnboardingTickets(post, '/x', ['IT']);
    assert.equal(r.ok, false);
    assert.deepEqual(r.failedDepartments, ['IT']);
  });
});

describe('EMAIL_EXISTS', () => {
  test('shows the existing employee ID and creation time when supplied', () => {
    const msg = describeCreateError(httpError(400, { code: 'EMAIL_EXISTS', message: 'Email already exists', field: 'email', value: 'new@example.invalid', existing_employee_id: 'B2B261003', existing_created_at: '2026-10-14T05:30:00.000Z' }));
    assert.match(msg, /new@example\.invalid/);
    assert.match(msg, /B2B261003/);
    assert.match(msg, /created .*2026/);
    assert.match(msg, /don't add them again/);
    assert.doesNotMatch(msg, /Please use a different value/, 'no longer the misleading generic duplicate text');
  });

  test('without existing details it still gives clear guidance', () => {
    const msg = describeCreateError(httpError(400, { code: 'EMAIL_EXISTS', field: 'email', value: 'new@example.invalid' }));
    assert.match(msg, /already exists/);
    assert.match(msg, /Employee List/);
    assert.doesNotMatch(msg, /undefined|null/);
  });

  test('an unparseable creation time is simply omitted', () => {
    const msg = describeCreateError(httpError(400, { code: 'EMAIL_EXISTS', value: 'a@example.invalid', existing_employee_id: 'B2B261003', existing_created_at: 'not-a-date' }));
    assert.match(msg, /B2B261003/);
    assert.doesNotMatch(msg, /Invalid Date|, created /);
  });
});

describe('CREATE_OUTCOME_UNKNOWN', () => {
  test('tells HR to check the Employee List before retrying, with the attempted ID and email', () => {
    const msg = describeCreateError(httpError(503, { code: 'CREATE_OUTCOME_UNKNOWN', attempted_employee_id: 'B2B261009', message: 'server text' }), { email: 'new@example.invalid' });
    assert.match(msg, /couldn't confirm whether the employee was created/);
    assert.match(msg, /Check the Employee List/);
    assert.match(msg, /before trying again/);
    assert.match(msg, /B2B261009/);
    assert.match(msg, /new@example\.invalid/);
  });

  test('works without an attempted ID or email', () => {
    const msg = describeCreateError(httpError(503, { code: 'CREATE_OUTCOME_UNKNOWN' }));
    assert.match(msg, /Check the Employee List/);
    assert.doesNotMatch(msg, /undefined|null/);
  });
});

describe('existing error messages are unchanged', () => {
  test('400 with field (legacy duplicate shape)', () => {
    assert.equal(describeCreateError(httpError(400, { field: 'employee_id', value: 'X1' })), "employee id 'X1' already exists. Please use a different value.");
  });
  test('400 with message only', () => {
    assert.equal(describeCreateError(httpError(400, { message: 'Phone is required' })), 'Phone is required');
  });
  test('400 with nothing', () => {
    assert.equal(describeCreateError(httpError(400, {})), 'Please check all fields and try again.');
  });
  test('401 / 403', () => {
    assert.equal(describeCreateError(httpError(401, {})), 'You are not authorized to add employees. Please login again.');
    assert.equal(describeCreateError(httpError(403, { message: 'x' })), 'You are not authorized to add employees. Please login again.');
  });
  test('500', () => {
    assert.equal(describeCreateError(httpError(500, { message: 'db exploded' })), 'Server error. Please try again later.');
  });
  test('other status uses server message, else status', () => {
    assert.equal(describeCreateError(httpError(502, { message: 'Bad gateway' })), 'Bad gateway');
    assert.equal(describeCreateError(httpError(504, {})), 'Server error: 504');
  });
  test('no response / plain error', () => {
    assert.equal(describeCreateError(Object.assign(new Error('x'), { request: {} })), 'No response from server. Please check if backend is running.');
    assert.equal(describeCreateError(new Error('Cannot connect to server.')), 'Cannot connect to server.');
  });
});

describe('the initial password is never displayed or logged', () => {
  test('redactForDisplay hides the password and keeps other fields', () => {
    const input = { email: 'a@example.invalid', password: 'InitPass#123', first_name: 'A' };
    const out = redactForDisplay(input);
    assert.equal(out.password, '[hidden]');
    assert.equal(out.email, 'a@example.invalid');
    assert.equal(JSON.stringify(out).includes('InitPass#123'), false);
    assert.equal(input.password, 'InitPass#123', 'original payload (sent to the API) is not modified');
  });
  test('passes through values without a password', () => {
    assert.equal(redactForDisplay(null), null);
    assert.deepEqual(redactForDisplay({ a: 1 }), { a: 1 });
  });
});
