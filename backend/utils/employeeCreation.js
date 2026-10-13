// Classifies errors from an employee insert, so POST /api/employees never blindly retries a write
// whose outcome is unknown.
//
// "Definite" errors carry a database or PostgREST error code (e.g. 23505, 23514, PGRST204): the
// statement ran and failed, so nothing was saved and the error can be acted on safely (for
// example by generating a fresh employee ID). Errors without a code are ambiguous: a dropped
// connection, the client header timeout, or a gateway 502/503/504 with a non-JSON body. The
// insert may or may not have committed, so it must be verified, never simply re-run.
const isDefiniteDbError = (error) => typeof error?.code === 'string' && error.code !== '';

// For a unique violation (23505): which constraint fired, 'employee_id' or 'email' (null if
// neither can be identified). employee_id is tested first because its constraint name,
// employees_employee_id_key, also contains "employee".
const duplicateKeyTarget = (error) => {
    if (error?.code !== '23505') return null;
    const text = `${error.message || ''} ${error.details || ''}`;
    if (/employee_id/i.test(text)) return 'employee_id';
    if (/email/i.test(text)) return 'email';
    return null;
};

// Columns the onboarding tickets need about the new employee (see utils/onboardingTickets.js).
// Used when the row is read back rather than returned by the insert. Deliberately not `*`, so
// the password hash and other secrets are never loaded for this purpose.
const ONBOARDING_TICKET_EMPLOYEE_COLUMNS = 'id, employee_id, email, first_name, last_name, designation, department, joining_date, dob, blood_group, reporting_manager, phone, emergency_contact, address, created_at';

module.exports = { isDefiniteDbError, duplicateKeyTarget, ONBOARDING_TICKET_EMPLOYEE_COLUMNS };
