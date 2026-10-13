// Columns of `employees` that must never leave the backend in an API response, whoever the
// caller is. None of them has a legitimate client-side use: password changes and resets go
// through the dedicated /api/auth/* and /:id/reset-password routes, and no screen reads the
// reset token or biometric PIN. Returning them let any authenticated user collect every
// colleague's bcrypt hash (offline cracking) and any pending reset token.
//
// This strips them from the response only — the database query and every other column are
// unchanged, so existing screens (Employee List, Edit Employee, profile pages) keep working.
const SECRET_EMPLOYEE_COLUMNS = ['password', 'reset_password_token', 'reset_password_expires', 'biometric_pin'];

const omitSecretEmployeeFields = (row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
    const clean = { ...row };
    for (const column of SECRET_EMPLOYEE_COLUMNS) delete clean[column];
    return clean;
};

const omitSecretEmployeeFieldsFromAll = (rows) => (Array.isArray(rows) ? rows.map(omitSecretEmployeeFields) : rows);

// Postgres not-null and check-constraint errors put the entire offending row into `details`
// ("Failing row contains (...)"). For `employees` that includes the password hash and personal
// data, so those details must never be returned or logged. Other details (e.g. "Key (email)=...
// already exists.") are kept. Anything that looks like a bcrypt hash is dropped as well.
const safeDbErrorDetails = (error) => {
    const text = error?.details || error?.hint;
    if (typeof text !== 'string' || text === '') return undefined;
    if (/failing row contains/i.test(text) || /\$2[aby]\$\d{2}\$/.test(text)) return undefined;
    return text;
};

module.exports = { SECRET_EMPLOYEE_COLUMNS, omitSecretEmployeeFields, omitSecretEmployeeFieldsFromAll, safeDbErrorDetails };
