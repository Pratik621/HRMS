// Turns POST /api/employees (Add Employee) responses into what HR should see. Pure functions,
// no React, so every outcome is unit-tested (addEmployeeOutcome.test.js).
// Backend contract: backend/routes/employeeRoutes.js POST / and POST /:id/onboarding-tickets.

export const DEFAULT_SUCCESS_MESSAGE = 'Employee added successfully!';

const formatDateTime = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const failedDepartmentsOf = (tickets) =>
  (Array.isArray(tickets?.failed) ? tickets.failed : []).map((f) => f?.department).filter(Boolean);

// After a 201. An ordinary success keeps the existing message. If onboarding tickets failed,
// return a warning that names them; the employee exists and must not be added again.
export function describeCreateSuccess(data) {
  const employee = data?.employee || {};
  const failedDepartments = failedDepartmentsOf(data?.onboarding_tickets);
  if (failedDepartments.length === 0) {
    return { variant: 'success', message: DEFAULT_SUCCESS_MESSAGE, failedDepartments: [], employee };
  }
  return {
    variant: 'warning',
    message: `Employee ${employee.employee_id || ''} was created, but these onboarding tickets could not be raised: ${failedDepartments.join(', ')}. Use "Retry onboarding tickets" below. Do not add the employee again.`.replace(/\s+/g, ' '),
    failedDepartments,
    employee,
  };
}

// After a failed request. Keeps every existing message, and adds clear guidance for an email
// that already exists and for an outcome that is unknown.
export function describeCreateError(error, { email } = {}) {
  const response = error?.response;
  if (!response) {
    if (error?.request) return 'No response from server. Please check if backend is running.';
    return error?.message || 'Failed to add employee';
  }

  const data = response.data || {};

  if (data.code === 'EMAIL_EXISTS') {
    const who = data.value || email || 'this email';
    if (data.existing_employee_id) {
      const when = formatDateTime(data.existing_created_at);
      return `An employee with ${who} already exists: Employee ID ${data.existing_employee_id}${when ? `, created ${when}` : ''}. If this is the employee you just added, they were created successfully, so don't add them again. Check the Employee List.`;
    }
    return `An employee with ${who} already exists. Check the Employee List before adding them again.`;
  }

  if (data.code === 'CREATE_OUTCOME_UNKNOWN') {
    const attempted = data.attempted_employee_id ? ` (attempted Employee ID ${data.attempted_employee_id})` : '';
    return `We couldn't confirm whether the employee was created${attempted}. Check the Employee List for ${email || 'this email'} before trying again. If they are listed, don't add them again. If you do retry, you won't get a duplicate: you'll be told the email already exists.`;
  }

  // Existing behaviour, unchanged.
  if (response.status === 400) {
    if (data.field) return `${data.field.replace(/_/g, ' ')} '${data.value}' already exists. Please use a different value.`;
    if (data.message) return data.message;
    return 'Please check all fields and try again.';
  }
  if (response.status === 401 || response.status === 403) return 'You are not authorized to add employees. Please login again.';
  if (response.status === 500) return 'Server error. Please try again later.';
  return data.message || `Server error: ${response.status}`;
}

// Retries only the failed onboarding tickets for an employee that already exists. Never creates
// the employee again. `post` is axios.post (injected for tests). Returns { ok, failedDepartments, message }.
export async function retryOnboardingTickets(post, url, failedDepartments) {
  try {
    const res = await post(url, { departments: failedDepartments });
    const remaining = failedDepartmentsOf(res?.data?.onboarding_tickets);
    if (remaining.length === 0) {
      return { ok: true, failedDepartments: [], message: 'Onboarding tickets raised successfully.' };
    }
    return { ok: false, failedDepartments: remaining, message: `These onboarding tickets still could not be raised: ${remaining.join(', ')}. Try again later or raise them from Tickets.` };
  } catch (err) {
    const remaining = failedDepartmentsOf(err?.response?.data?.onboarding_tickets);
    const stillFailing = remaining.length ? remaining : failedDepartments;
    const reason = err?.response?.data?.message || (err?.request ? 'No response from server.' : err?.message) || 'Request failed.';
    return { ok: false, failedDepartments: stillFailing, message: `Could not raise onboarding tickets (${stillFailing.join(', ')}): ${reason} The employee is already created. Only the tickets need retrying.` };
  }
}

// What the debug panel and console may show of the submitted data: never the password.
export const redactForDisplay = (payload) => (payload && typeof payload === 'object' && 'password' in payload
  ? { ...payload, password: payload.password ? '[hidden]' : payload.password }
  : payload);
