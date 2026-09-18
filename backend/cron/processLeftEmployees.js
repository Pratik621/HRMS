// backend/cron/processLeftEmployees.js
// Daily job: deactivates any employee whose scheduled_deactivation_date (set by the "Mark as
// Left" action in employeeRoutes.js) has arrived. Employees marked as left stay fully active
// — can log in, get paid — right up until this date, which is always the 25th of some month
// (the end of the 26th-25th salary cycle they left in), so their final month processes
// normally before the account is cut off.
const supabase = require('../config/supabase');

const getISTDateString = () => {
    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(Date.now() + IST_OFFSET_MS);
    return istTime.toISOString().split('T')[0];
};

const processLeftEmployees = async () => {
    const today = getISTDateString();

    const { data: due, error } = await supabase
        .from('employees')
        .select('employee_id, first_name, last_name, scheduled_deactivation_date')
        .not('marked_left_at', 'is', null)
        .eq('is_active', true)
        .lte('scheduled_deactivation_date', today);

    if (error) {
        console.error('❌ [processLeftEmployees] fetch error:', error.message);
        return { deactivatedCount: 0 };
    }
    if (!due || due.length === 0) {
        return { deactivatedCount: 0 };
    }

    const employeeIds = due.map(e => e.employee_id);
    const { error: updErr } = await supabase
        .from('employees')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .in('employee_id', employeeIds);

    if (updErr) {
        console.error('❌ [processLeftEmployees] update error:', updErr.message);
        return { deactivatedCount: 0 };
    }

    console.log(`⚠️  [processLeftEmployees] Deactivated ${employeeIds.length} employee(s) whose scheduled_deactivation_date arrived (${today}): ${employeeIds.join(', ')}`);
    return { deactivatedCount: employeeIds.length, employeeIds };
};

module.exports = { processLeftEmployees };
