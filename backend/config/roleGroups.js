// Single source of truth for "which `employees.role` values count as X" —
// this app's role naming is NOT self-explanatory, confirmed directly from
// frontend/src/components/Layout/Sidebar.jsx (the one place that already displays
// these labels to users):
//   role === 'sub_admin'   -> displayed/labeled as "Manager"
//   role === 'manager'     -> displayed/labeled as "Team Leader (TL)"
//   role === 'hr'          -> HR
// Getting this backwards silently sends "new joiner" / manual-email group sends to
// the wrong population, so every "All Managers"/"All Team Leaders"/"All HR" lookup
// in the backend should import these arrays rather than re-guessing the mapping.

const MANAGER_ROLES     = ['sub_admin'];
const TEAM_LEADER_ROLES = ['manager'];
const HR_ROLES          = ['hr'];
const ADMIN_ROLES       = ['admin'];

// Every value employees.role may hold. Same list PUT /:id and PATCH /:id/role validate against.
const ASSIGNABLE_EMPLOYEE_ROLES = ['admin', 'sub_admin', 'manager', 'employee', 'desktop_support', 'finance', 'hr', 'housekeeper'];
// The role every new account gets unless an authorized caller assigns another.
const DEFAULT_EMPLOYEE_ROLE = 'employee';
// Roles allowed to give an account any role other than the default. This is the set already
// trusted to change roles: PATCH /:id/role (isAdmin) and the role guard in PUT /:id.
const ROLE_ASSIGNER_ROLES = ['admin', 'sub_admin', 'hr'];

module.exports = {
    MANAGER_ROLES,
    TEAM_LEADER_ROLES,
    HR_ROLES,
    ADMIN_ROLES,
    ASSIGNABLE_EMPLOYEE_ROLES,
    DEFAULT_EMPLOYEE_ROLE,
    ROLE_ASSIGNER_ROLES,
};
