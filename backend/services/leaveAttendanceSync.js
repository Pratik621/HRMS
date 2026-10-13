// services/leaveAttendanceSync.js
//
// Keeps the `attendance` table in sync with approved Paid Leave / Birthday Leave
// requests, reusing the exact "Present + attendance_type" shape the admin
// mark-attendance / import flow already writes for 'paid_leave' and 'comp_off'
// (see attendanceController.adminMarkAttendance) so every read path (team report,
// personal report, admin views) sees the same thing without reimplementing status
// derivation per-endpoint.
const supabase = require('../config/supabase');
const { PAID_LEAVE_TYPES } = require('../config/leavePolicy');

// Unpaid isn't Present, so it's intentionally not mapped here. Comp-Off already gets
// its attendance row from the holiday-work flow (compOffService) but is routed through
// here too on manual approval for consistency.
function resolveAttendanceType(leaveType) {
    if (leaveType === 'Birthday') return 'birthday_leave';
    if (leaveType === 'Comp-Off') return 'comp_off';
    if (PAID_LEAVE_TYPES.includes(leaveType)) return 'paid_leave';
    return null;
}

function dateRange(startDate, endDate) {
    const dates = [];
    const end = new Date(endDate || startDate);
    for (let d = new Date(startDate); d <= end; d.setDate(d.getDate() + 1)) {
        dates.push(d.toISOString().split('T')[0]);
    }
    return dates;
}

async function upsertAttendanceRow(employee_id, attendance_date, attendanceType) {
    const { data: existing, error: readError } = await supabase
        .from('attendance')
        .select('id, clock_in')
        .eq('employee_id', employee_id)
        .eq('attendance_date', attendance_date)
        .maybeSingle();

    if (readError) throw readError;
    // Never overwrite a day that already has a real clock-in.
    if (existing && existing.clock_in) return;

    const payload = {
        employee_id,
        attendance_date,
        status: 'present',
        attendance_type: attendanceType,
        is_holiday: false,
        holiday_name: null,
        total_hours: 9,
        total_minutes: 540,
        late_minutes: 0,
    };

    const write = existing
        ? supabase.from('attendance').update(payload).eq('id', existing.id)
        : supabase.from('attendance').insert([payload]);

    const { error } = await write;
    if (error && error.message && error.message.includes('attendance_type')) {
        // Column may not exist on older schemas — retry without it.
        const { attendance_type: _removed, ...payloadWithout } = payload;
        const retry = existing
            ? supabase.from('attendance').update(payloadWithout).eq('id', existing.id)
            : supabase.from('attendance').insert([payloadWithout]);
        const { error: retryError } = await retry;
        if (retryError) throw retryError;
    } else if (error) {
        throw error;
    }
}

/**
 * Write a "Present" attendance placeholder for every date covered by an approved
 * Paid Leave / Birthday Leave / Comp-Off request. Skipped for leave types that
 * aren't Present-producing (e.g. Unpaid).
 */
async function syncAttendanceForApprovedLeave(leave) {
    const attendanceType = resolveAttendanceType(leave.leave_type);
    if (!attendanceType) return;

    for (const date of dateRange(leave.start_date, leave.end_date)) {
        if ([0, 6].includes(new Date(date + 'T00:00:00Z').getUTCDay())) continue;
        try {
            await upsertAttendanceRow(leave.employee_id, date, attendanceType);
        } catch (err) {
            throw err;
        }
    }
}

/**
 * Undo the Present placeholder written by syncAttendanceForApprovedLeave when a
 * previously-approved leave is rejected/cancelled. Only removes rows that are
 * still exactly the placeholder shape this helper wrote — never touches a day an
 * admin or employee has since overwritten with real clock-in data or a different
 * attendance_type.
 */
async function revertAttendanceForLeave(leave) {
    const attendanceType = resolveAttendanceType(leave.leave_type);
    if (!attendanceType) return;

    for (const date of dateRange(leave.start_date, leave.end_date)) {
        try {
            const { data: existing } = await supabase
                .from('attendance')
                .select('id, clock_in, attendance_type')
                .eq('employee_id', leave.employee_id)
                .eq('attendance_date', date)
                .maybeSingle();

            if (existing && !existing.clock_in && existing.attendance_type === attendanceType) {
                await supabase.from('attendance').delete().eq('id', existing.id);
            }
        } catch (err) {
            console.error(`⚠️ revertAttendanceForLeave failed for ${leave.employee_id} on ${date}:`, err.message);
        }
    }
}

module.exports = {
    resolveAttendanceType,
    syncAttendanceForApprovedLeave,
    revertAttendanceForLeave,
};
