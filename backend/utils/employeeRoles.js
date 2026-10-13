const { ASSIGNABLE_EMPLOYEE_ROLES, DEFAULT_EMPLOYEE_ROLE, ROLE_ASSIGNER_ROLES } = require('../config/roleGroups');

// Decides the role a newly created employee account gets. The server decides, not the request.
// POST /api/employees used to store `req.body.role` unchecked, so desktop_support (allowed to
// create employees, but not to change roles anywhere else) could create an admin account.
//
// - No role requested → the default ('employee'), for every allowed creator.
// - A requested role that isn't a known role (or isn't a string) → 400; never guessed.
// - Any role other than the default → only for ROLE_ASSIGNER_ROLES (admin, sub_admin, hr),
//   the same callers already allowed to change roles via PATCH /:id/role and PUT /:id.
// - A caller whose own role can't be read → 403, even for the default role.
//
// Returns { role } on success, or { status, message } to send as the error response.
const resolveNewEmployeeRole = (requestedRole, callerRole) => {
    if (typeof callerRole !== 'string' || callerRole === '') {
        return { status: 403, message: 'Unable to verify your permissions to create employees' };
    }

    const role = (requestedRole === undefined || requestedRole === null || requestedRole === '')
        ? DEFAULT_EMPLOYEE_ROLE
        : requestedRole;

    if (typeof role !== 'string' || !ASSIGNABLE_EMPLOYEE_ROLES.includes(role)) {
        return { status: 400, message: 'Invalid role' };
    }

    if (role !== DEFAULT_EMPLOYEE_ROLE && !ROLE_ASSIGNER_ROLES.includes(callerRole)) {
        return { status: 403, message: `Your role cannot create '${role}' accounts. Create the employee, then ask an Admin, Manager or HR to change the role.` };
    }

    return { role };
};

module.exports = { resolveNewEmployeeRole };
