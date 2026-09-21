// backend/services/regularizationService.js
// Core logic for the redesigned attendance regularization workflow: single-approver
// resolution, view/act authorization, attendance recalculation on approval, and
// payroll-lock enforcement. Reuses existing shared helpers rather than reinventing them.

const supabase = require('../config/supabase');
const { normalizeName, getEmployeeById, getTeamEmployeeIdsByManagerName, getTeamEmployeeIdsByEmployeeId } = require('../utils/employeeLookup');
const {
    getEffectiveShiftTiming, istStringToUTCISO, computeAttendanceFromClockTimes,
} = require('../controllers/attendanceController')._shared;
const { isFlexibleShiftEnabled } = require('../utils/flexibleShift');
const { CYCLE_START_DAY } = require('../config/payrollCycle');

// Fixes a real bug in the old implementation: only literal role === 'admin' bypassed
// hierarchy checks there — sub_admin/hr did not, despite needing full access.
const ELEVATED_ROLES = ['admin', 'sub_admin', 'hr'];

const TIME_RECALC_TYPES = ['missing_clock_in', 'missing_clock_out', 'attendance_correction', 'wrong_working_hours'];
const BREAK_ADJUST_TYPE = 'break_correction';

// ── 1. Single-approver resolution ──────────────────────────────────────────────
async function resolveApprover(employee) {
    if (employee?.reporting_manager) {
        const { data: allEmps } = await supabase
            .from('employees')
            .select('employee_id, first_name, last_name')
            .eq('is_active', true);
        const mgrName = normalizeName(employee.reporting_manager);
        const mgr = (allEmps || []).find(e => normalizeName(`${e.first_name} ${e.last_name}`) === mgrName);
        if (mgr) return { pendingWithEmployeeId: mgr.employee_id, pendingWithRole: 'manager' };
    }
    // No reporting_manager set, or no employee record matches the name — fall back
    // to the HR/Admin role class rather than one arbitrary person.
    return { pendingWithEmployeeId: null, pendingWithRole: 'hr_admin' };
}

// ── 2. View / act authorization ─────────────────────────────────────────────────
function canViewRequest(user, request) {
    if (!user) return false;
    if (ELEVATED_ROLES.includes(user.role)) return true;
    if (user.employeeId === request.employee_id) return true;
    if (request.pending_with_employee_id && request.pending_with_employee_id === user.employeeId) return true;
    return false;
}

function canActOnRequest(user, request) {
    if (!user || request.status !== 'pending') return false;
    if (user.employeeId === request.employee_id) return false; // no self-approval
    if (ELEVATED_ROLES.includes(user.role)) return true;
    return !!(request.pending_with_employee_id && request.pending_with_employee_id === user.employeeId);
}

// ── 3. Scoped employee-id list for role-scoped LIST queries ────────────────────
// Returns null for elevated roles (no restriction — see everything).
// managerId: Manager Dashboard "View Team" override — only meaningful for elevated
// roles (who'd otherwise get `null`/unrestricted). Resolves to that manager's own
// employee_id + their direct reports, same shape as the self-scoped branch below.
async function buildScopedEmployeeIds(user, managerId) {
    if (ELEVATED_ROLES.includes(user.role)) {
        if (!managerId || managerId === 'ALL') return null;
        const teamIds = await getTeamEmployeeIdsByEmployeeId(managerId);
        if (!teamIds) return null;
        return [...new Set([managerId, ...teamIds])];
    }
    const me = await getEmployeeById(user.employeeId);
    const myName = me ? `${me.first_name} ${me.last_name}` : '';
    const teamIds = await getTeamEmployeeIdsByManagerName(myName);
    return [...new Set([user.employeeId, ...teamIds])];
}

// ── 4. Attendance recalculation on approval ────────────────────────────────────
async function recalculateAttendanceForApprovedRequest(attendanceId, requestType, approvedFields) {
    // approvedFields: { clockIn, clockOutTime, status, breakDurationMinutes, adminNotes }
    const { data: attendance, error: attErr } = await supabase
        .from('attendance').select('*').eq('id', attendanceId).single();
    if (attErr || !attendance) throw new Error('Attendance record not found for recalculation');

    let { data: employee, error: empErr } = await supabase
        .from('employees').select('shift_timing, "isFlexibleShift"').eq('employee_id', attendance.employee_id).maybeSingle();
    if (empErr && /isFlexibleShift|does not exist/i.test(empErr.message || '')) {
        ({ data: employee } = await supabase
            .from('employees').select('shift_timing').eq('employee_id', attendance.employee_id).maybeSingle());
    }
    const isFlexibleShift = isFlexibleShiftEnabled(employee || {});

    const shiftTimingStr = await getEffectiveShiftTiming(
        attendance.employee_id, attendance.attendance_date,
        attendance.shift_time_used || employee?.shift_timing,
    );

    const update = {
        is_regularized: true,
        regularization_approved: true,
        regularization_approved_at: new Date().toISOString(),
        regularization_status: 'approved',
        admin_notes: approvedFields.adminNotes || null,
    };

    if (TIME_RECALC_TYPES.includes(requestType)) {
        const clockInIST = approvedFields.clockIn || attendance.clock_in_ist || attendance.clock_in;
        const clockOutIST = approvedFields.clockOutTime || attendance.clock_out_ist || attendance.clock_out;
        if (!clockInIST || !clockOutIST) {
            throw new Error('Both clock-in and clock-out are required to recalculate this attendance record');
        }

        // Delegates to the same single source of truth clockOut/clockOutMissed use, so an
        // approved regularization can never disagree with a normal clock-out about how
        // total_minutes/total_hours/status relate to each other.
        const computed = computeAttendanceFromClockTimes(clockInIST, clockOutIST, shiftTimingStr, isFlexibleShift);
        const { totalMinutes, totalHours, status } = computed;
        const late = isFlexibleShift
            ? { is_late: false, late_minutes: 0, late_display: null }
            : computed.late;
        const overtime = isFlexibleShift
            ? { overtimeHours: 0, overtimeMinutes: 0, hasOvertime: false, overtimeAmount: 0 }
            : computed.overtime;

        Object.assign(update, {
            clock_in: istStringToUTCISO(clockInIST), clock_in_ist: clockInIST,
            clock_out: istStringToUTCISO(clockOutIST), clock_out_ist: clockOutIST,
            total_hours: parseFloat(totalHours.toFixed(2)), total_minutes: totalMinutes,
            total_hours_display: `${Math.floor(totalMinutes / 60)}h ${Math.round(totalMinutes % 60)}m`,
            status,
            late_minutes: late.late_minutes, late_display: late.late_display, is_late: late.is_late,
            overtime_hours: overtime.overtimeHours, overtime_minutes: overtime.overtimeMinutes,
            overtime_amount: overtime.overtimeAmount, has_overtime: overtime.hasOvertime,
        });

        const CompOffService = require('./compOffService');
        await CompOffService.checkHolidayWork(attendance.employee_id, attendance.attendance_date, totalHours).catch(() => {});
    } else if (requestType === BREAK_ADJUST_TYPE) {
        update.break_minutes_override = approvedFields.breakDurationMinutes;
    } else {
        // DIRECT_STATUS_OVERRIDE: half_day_to_present, present_to_half_day, client_visit,
        // official_duty, wfh, other — only status changes; clock times/late/OT untouched
        // (there's no on-prem punch to recalculate from).
        update.status = approvedFields.status || 'present';
    }

    const { data: updated, error: updErr } = await supabase
        .from('attendance').update(update).eq('id', attendanceId).select().single();
    if (updErr) throw updErr;
    return updated;
}

// ── 5. Payroll cycle / lock check ──────────────────────────────────────────────
// Cycle = CYCLE_START_DAY of (month-1) → CYCLE_START_DAY-1 of (month) — shared with
// salaryController.getCycleDates via backend/config/payrollCycle.js.
function getPayrollCycleForDate(dateStr) {
    const [y, m, d] = String(dateStr).substring(0, 10).split('-').map(Number);
    if (d <= CYCLE_START_DAY - 1) return { month: m, year: y };
    return m === 12 ? { month: 1, year: y + 1 } : { month: m + 1, year: y };
}

async function isPayrollLocked(employeeId, attendanceDate) {
    const { month, year } = getPayrollCycleForDate(attendanceDate);
    const { data } = await supabase
        .from('salary_slips')
        .select('id')
        .eq('employee_id', employeeId)
        .eq('month', month)
        .eq('year', year)
        .eq('is_paid', true)
        .limit(1);
    return { locked: !!(data && data.length), month, year };
}

module.exports = {
    ELEVATED_ROLES,
    resolveApprover,
    canViewRequest,
    canActOnRequest,
    buildScopedEmployeeIds,
    recalculateAttendanceForApprovedRequest,
    getPayrollCycleForDate,
    isPayrollLocked,
};
