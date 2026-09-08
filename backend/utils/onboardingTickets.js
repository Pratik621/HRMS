// backend/utils/onboardingTickets.js
// Auto-raises IT + Marketing tickets whenever a candidate's onboarding form is
// submitted — normally once the employee account has actually been created (via
// onboarding-link approval or manual Add Employee), but also when account creation
// itself failed for some reason: `accountCreationError` flags that case so the
// ticket still goes out (clearly marked as pending) instead of being skipped
// entirely just because the account isn't there yet. Never throws — a failure
// here must not block or roll back employee creation.

const generateTicketNumber = async (supabase) => {
    const today = new Date();
    const ymd = today.toISOString().slice(0, 10).replace(/-/g, '');
    const { count } = await supabase.from('support_tickets')
        .select('*', { count: 'exact', head: true });
    const seq = String((count || 0) + 1).padStart(4, '0');
    return `TKT-${ymd}-${seq}`;
};

const findDeptManager = async (supabase, department) => {
    const { data } = await supabase.from('employees')
        .select('employee_id, first_name, last_name')
        .eq('department', department)
        .eq('role', 'manager')
        .eq('is_active', true);
    return (data && data[0]) || null;
};

const fmtDate = (d) => {
    if (!d) return 'N/A';
    try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
    catch { return 'N/A'; }
};

// Full onboarding detail block the Marketing team needs to prepare the ID card.
const employeeDetailsBlock = (employee, name) => [
    `Employee Name: ${name}`,
    `Employee Number: ${employee.employee_id || 'Pending — account not created yet, see note above'}`,
    `Date of Joining: ${fmtDate(employee.joining_date)}`,
    `Date of Birth: ${fmtDate(employee.dob)}`,
    `Designation: ${employee.designation || 'N/A'}`,
    `Blood Group: ${employee.blood_group || 'N/A'}`,
    `Reporting Manager: ${employee.reporting_manager || 'N/A'}`,
    `Contact Number: ${employee.phone || 'N/A'}`,
    `Emergency Contact Number: ${employee.emergency_contact || 'N/A'}`,
    `Employee Address: ${employee.address || 'N/A'}`,
].join('\n');

// When accountCreationError is set, no `employees` row exists yet — the subject/
// description say so up front so IT/Marketing don't chase a login that isn't there,
// and HR knows from the ticket alone that this one needs manual follow-up.
const pendingPrefix = (accountCreationError) => accountCreationError ? '[ACCOUNT PENDING] ' : '';
const pendingNote = (accountCreationError) => accountCreationError
    ? `\n\n⚠ Employee account could not be created automatically (${accountCreationError}). HR needs to resolve this and create the account manually from Admin > Employees > Offer Links before system access / ID card can be finalized.`
    : '';

const TICKET_SPECS = [
    {
        department: 'IT',
        issue_type: 'New Employee – Assign System Access',
        subject: (name, accountCreationError) => `${pendingPrefix(accountCreationError)}New Employee Onboarded – Please Assign System for ${name}`,
        description: (name, designation, employeeId, employee, accountCreationError) =>
            `${name} (${employeeId || 'employee ID pending'})${designation ? `, ${designation},` : ''} has been onboarded. Please assign a system/laptop and set up login access.${pendingNote(accountCreationError)}`,
    },
    {
        department: 'Marketing',
        issue_type: 'New Employee – Issue ID Card',
        subject: (name, accountCreationError) => `${pendingPrefix(accountCreationError)}New Employee Onboarded – Please Issue ID Card for ${name}`,
        description: (name, designation, employeeId, employee, accountCreationError) =>
            `Please prepare and issue a new employee ID card. Employee details:\n\n${employeeDetailsBlock(employee, name)}${pendingNote(accountCreationError)}`,
    },
];

async function createOnboardingTickets(supabase, { employee, actor, accountCreationError = null }) {
    try {
        if (!employee || !actor) return;

        const { data: actorEmp } = await supabase.from('employees')
            .select('first_name, last_name, email')
            .eq('employee_id', actor.employeeId)
            .maybeSingle();

        const actorName  = actorEmp ? `${actorEmp.first_name} ${actorEmp.last_name}`.trim() : actor.employeeId;
        const actorEmail = actorEmp?.email || actor.email || '';
        const empName    = `${employee.first_name} ${employee.last_name}`.trim();

        for (const spec of TICKET_SPECS) {
            const manager = await findDeptManager(supabase, spec.department);
            const ticketNumber = await generateTicketNumber(supabase);

            const { data: ticket, error } = await supabase.from('support_tickets').insert({
                ticket_number:    ticketNumber,
                subject:          spec.subject(empName, accountCreationError),
                description:      spec.description(empName, employee.designation, employee.employee_id, employee, accountCreationError),
                department:       spec.department,
                issue_type:       spec.issue_type,
                priority:         accountCreationError ? 'urgent' : 'high',
                status:           'open',
                raised_by:        actor.employeeId,
                raised_by_email:  actorEmail,
                raised_by_name:   actorName,
                assigned_to:      manager?.employee_id || null,
                assigned_to_name: manager ? `${manager.first_name} ${manager.last_name}`.trim() : null,
                tagged_employees: [],
            }).select().maybeSingle();

            if (error) {
                console.error(`[onboardingTickets] failed to create ${spec.department} ticket:`, error);
                continue;
            }

            await supabase.from('ticket_history').insert({
                ticket_id:         ticket.id,
                action:            'created',
                message:           `Auto-raised on employee onboarding by ${actorName}`,
                old_status:        null,
                new_status:        'open',
                performed_by:      actor.employeeId,
                performed_by_name: actorName,
            });
        }
    } catch (err) {
        console.error('[onboardingTickets] unexpected error:', err);
    }
}

module.exports = { createOnboardingTickets };
