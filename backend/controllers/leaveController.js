const supabase = require('../config/supabase');
const { sendLeaveStatusEmail, sendLeaveAppliedEmail } = require('../services/emailService');
const { HR_ROLES } = require('../config/roleGroups');
const { getTeamEmployeeIdsByEmployeeId } = require('../utils/employeeLookup');
const {
    PAID_LEAVE_ELIGIBILITY_MONTHS,
    MONTHLY_ACCRUAL_RATE,
    getTotalMonthsFromJoining,
    isProbationComplete,
    getEligibleFromDate,
    getCompletedMonthsInCurrentYear,
    calculateCurrentYearAccruedLeaves,
} = require('../config/leavePolicy');
const { syncAttendanceForApprovedLeave, revertAttendanceForLeave } = require('../services/leaveAttendanceSync');

// Helper: check if designation is team leader/manager level
const isTeamLeaderDesignation = (designation) => {
    if (!designation) return false;
    const d = designation.toLowerCase();
    return d.includes('team leader') || d.includes('team manager') ||
           d.includes('tl') || d.includes('lead') || d.includes('manager') ||
           d.includes('head') || d.includes('supervisor');
};

// Sum of HR/admin manual balance adjustments (leave_balance_adjustments, category='paid')
// for one employee in a given year — this is the offset term getLeaveBalance/
// getLeaveBalanceBulk add into the accrual formula. Table is a new, optional addition
// (see scripts/create-leave-balance-adjustments.sql) — degrade to 0 if it hasn't been
// created on this DB yet, same defensive pattern used everywhere else this session.
const getManualPaidAdjustmentTotal = async (employee_id, leave_year) => {
    const { data, error } = await supabase
        .from('leave_balance_adjustments')
        .select('adjustment_days')
        .eq('employee_id', employee_id)
        .eq('leave_category', 'paid')
        .eq('leave_year', leave_year);
    if (error) {
        if (/does not exist|schema cache/i.test(error.message || '')) return 0;
        throw error;
    }
    return (data || []).reduce((sum, a) => sum + (parseFloat(a.adjustment_days) || 0), 0);
};

// Days marked as Paid Leave directly on the Attendance Calendar (adminMarkAttendance,
// attendance.attendance_type = 'paid_leave') never create a row in `leaves` — they're a
// straight attendance-table edit, not a leave request. getLeaveBalance's `used` figure must
// count them too, otherwise every balance fetch after a calendar PL-mark recomputes `used`
// from `leaves` alone (unchanged), overwrites leave_balance.current_balance with that stale
// number, and the deduction adminMarkAttendance just wrote is erased instantly.
const getAttendancePaidLeaveCount = async (employee_id, leave_year) => {
    const { data, error } = await supabase
        .from('attendance')
        .select('id')
        .eq('employee_id', employee_id)
        .eq('attendance_type', 'paid_leave')
        .gte('attendance_date', `${leave_year}-01-01`)
        .lte('attendance_date', `${leave_year}-12-31`);
    if (error) {
        if (/does not exist|schema cache/i.test(error.message || '')) return 0;
        throw error;
    }
    return (data || []).length;
};

// Bulk version of getAttendancePaidLeaveCount, for getLeaveBalanceBulk — one query for every
// employee instead of N. Returns { [employee_id]: countOfCalendarMarkedPaidLeaveDays }.
const getAttendancePaidLeaveCountsBulk = async (leave_year) => {
    const { data, error } = await supabase
        .from('attendance')
        .select('employee_id')
        .eq('attendance_type', 'paid_leave')
        .gte('attendance_date', `${leave_year}-01-01`)
        .lte('attendance_date', `${leave_year}-12-31`);
    if (error) {
        if (/does not exist|schema cache/i.test(error.message || '')) return {};
        throw error;
    }
    const counts = {};
    (data || []).forEach(r => { counts[r.employee_id] = (counts[r.employee_id] || 0) + 1; });
    return counts;
};

// Same as above, but for every employee at once — one query instead of N, for
// getLeaveBalanceBulk. Returns { [employee_id]: totalAdjustmentDays }.
const getManualPaidAdjustmentTotalsBulk = async (leave_year) => {
    const { data, error } = await supabase
        .from('leave_balance_adjustments')
        .select('employee_id, adjustment_days')
        .eq('leave_category', 'paid')
        .eq('leave_year', leave_year);
    if (error) {
        if (/does not exist|schema cache/i.test(error.message || '')) return {};
        throw error;
    }
    const totals = {};
    (data || []).forEach(a => {
        totals[a.employee_id] = (totals[a.employee_id] || 0) + (parseFloat(a.adjustment_days) || 0);
    });
    return totals;
};

// ==================== GET LEAVE BALANCE ====================
exports.getLeaveBalance = async (req, res) => {
    try {
        const { employee_id } = req.params;

        console.log('📊 Fetching leave balance for employee:', employee_id);

        const { data: employee, error: empError } = await supabase
            .from('employees')
            .select('joining_date, comp_off_balance')
            .eq('employee_id', employee_id)
            .single();

        if (empError) throw empError;

        // Get actual valid comp-off count from comp_off_earnings table (non-expired, non-used)
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        const CompOffService = require('../services/compOffService');
        const actualCompOffBalance = await CompOffService.getValidCompOffCount(employee_id);

        // Sync employees table if mismatch
        if (actualCompOffBalance !== (employee.comp_off_balance || 0)) {
            await supabase
                .from('employees')
                .update({ comp_off_balance: actualCompOffBalance })
                .eq('employee_id', employee_id);
        }

        const joiningDate = new Date(employee.joining_date);
        const currentYear = today.getFullYear();

        const currentYearAccrual = calculateCurrentYearAccruedLeaves(joiningDate, today);
        const totalMonthsFromJoining = getTotalMonthsFromJoining(joiningDate, today);
        const isProbComplete = isProbationComplete(joiningDate, today);
        const eligibleFromDateStr = getEligibleFromDate(joiningDate);
        const completedMonths = getCompletedMonthsInCurrentYear(joiningDate, today);

        console.log('📊 Leave Calculation:', {
            employee_id,
            joining_date: employee.joining_date,
            current_year: currentYear,
            completed_months_in_current_year: completedMonths,
            current_year_accrual: currentYearAccrual,
            total_months_from_joining: totalMonthsFromJoining,
            is_probation_complete: isProbComplete
        });

        // Approved leaves - split by type
        const { data: usedLeaves, error: usedError } = await supabase
            .from('leaves')
            .select('days_count, leave_type')
            .eq('employee_id', employee_id)
            .eq('status', 'approved')
            .gte('start_date', `${currentYear}-01-01`)
            .lte('start_date', `${currentYear}-12-31`);
        if (usedError) throw usedError;

        // Paid leaves used (excludes Unpaid, Comp-Off & Birthday)
        const leaveRequestsUsed = usedLeaves
            ?.filter(l => l.leave_type !== 'Unpaid' && l.leave_type !== 'Comp-Off' && l.leave_type !== 'Birthday')
            ?.reduce((sum, l) => sum + (parseFloat(l.days_count) || 0), 0) || 0;

        // Plus days marked "Paid Leave" straight on the Attendance Calendar — see
        // getAttendancePaidLeaveCount above for why these must be folded in here.
        const attendancePaidLeaveUsed = await getAttendancePaidLeaveCount(employee_id, currentYear);
        const used = leaveRequestsUsed + attendancePaidLeaveUsed;

        // Unpaid leaves used separately
        const unpaidUsed = usedLeaves
            ?.filter(l => l.leave_type === 'Unpaid')
            ?.reduce((sum, l) => sum + (parseFloat(l.days_count) || 0), 0) || 0;

        // Pending paid leaves
        const { data: pendingLeaves, error: pendingError } = await supabase
            .from('leaves')
            .select('days_count, leave_type')
            .eq('employee_id', employee_id)
            .eq('status', 'pending')
            .gte('start_date', `${currentYear}-01-01`)
            .lte('start_date', `${currentYear}-12-31`);
        if (pendingError) throw pendingError;

        const pending = pendingLeaves
            ?.filter(l => l.leave_type !== 'Unpaid' && l.leave_type !== 'Comp-Off' && l.leave_type !== 'Birthday')
            ?.reduce((sum, l) => sum + (parseFloat(l.days_count) || 0), 0) || 0;

        const unpaidPending = pendingLeaves
            ?.filter(l => l.leave_type === 'Unpaid')
            ?.reduce((sum, l) => sum + (parseFloat(l.days_count) || 0), 0) || 0;

        // HR/admin manual adjustment (see getManualPaidAdjustmentTotal) — a signed offset
        // added into the formula so an "extra 2 days" or "reduce 1 day" grant actually sticks,
        // instead of being silently recomputed away on the next balance fetch like anything
        // written straight into leave_balance would be.
        const manualAdjustment = await getManualPaidAdjustmentTotal(employee_id, currentYear);

        let available = 0;
        if (isProbComplete) {
            available = Math.max(0, currentYearAccrual + manualAdjustment - used - pending);
        }

        await supabase
            .from('leave_balance')
            .upsert({
                employee_id,
                leave_year: currentYear,
                total_accrued: currentYearAccrual,
                total_used: used,
                total_pending: pending,
                current_balance: available,
                last_updated: today.toISOString()
            }, {
                onConflict: 'employee_id,leave_year'
            });

        res.json({
            success: true,
            total_accrued: currentYearAccrual.toFixed(1),
            manual_adjustment: manualAdjustment.toFixed(1),
            used: used.toFixed(1),
            pending: pending.toFixed(1),
            available: available.toFixed(1),
            unpaid_used: unpaidUsed.toFixed(1),
            unpaid_pending: unpaidPending.toFixed(1),
            comp_off_balance: actualCompOffBalance.toFixed(1),
            months_completed_in_year: completedMonths,
            total_months_from_joining: totalMonthsFromJoining,
            is_probation_complete: isProbComplete,
            is_eligible: isProbComplete,
            eligible_from_date: eligibleFromDateStr,
            leave_year: currentYear,
            joining_date: employee.joining_date,
            next_accrual_date: new Date(currentYear, today.getMonth() + 1, 0).toISOString().split('T')[0],
            probation_info: {
                is_active: !isProbComplete,
                months_completed: totalMonthsFromJoining,
                months_remaining: Math.max(0, PAID_LEAVE_ELIGIBILITY_MONTHS - totalMonthsFromJoining),
                eligible_from_date: eligibleFromDateStr,
                accrued_but_unusable: !isProbComplete ? currentYearAccrual : 0
            }
        });

    } catch (error) {
        console.error('Error fetching leave balance:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch leave balance',
            error: error.message
        });
    }
};

// ==================== GET LEAVE BALANCE — BULK (ALL ACTIVE EMPLOYEES) ====================
// Same "available" figure as GET /balance/:employee_id (accrued − used − pending, same
// probation/accrual rules), but for every active employee in 2 queries total instead of
// N×3 — built for AttendanceReports.jsx's monthly export, which previously called the
// single-employee endpoint once per employee in a sequential loop (76+ employees = 76+
// round trips just to add one column). Read-only: unlike the single-employee endpoint,
// this does NOT upsert `leave_balance` or sync `comp_off_balance` — callers here only ever
// read `available`, so there's nothing to gain from writing a cache row for every employee
// on every export, and doing that as a side effect of a read is exactly what wasn't wanted.
exports.getLeaveBalanceBulk = async (req, res) => {
    try {
        const today = new Date();
        const currentYear = today.getFullYear();

        const { data: employees, error: empError } = await supabase
            .from('employees')
            .select('employee_id, joining_date, comp_off_balance')
            .eq('is_active', true);
        if (empError) throw empError;

        const { data: yearLeaves, error: leaveError } = await supabase
            .from('leaves')
            .select('employee_id, days_count, leave_type, status')
            .in('status', ['approved', 'pending'])
            .gte('start_date', `${currentYear}-01-01`)
            .lte('start_date', `${currentYear}-12-31`);
        if (leaveError) throw leaveError;

        // Comp-Off has its own ledger-backed balance (not part of the accrual formula
        // above) — bulk-fetched here too so one call gets everything the Payroll Excel
        // export needs (PL available/used, Comp-Off available/used).
        const CompOffService = require('../services/compOffService');
        let compOffUsedTotals = {};
        try {
            compOffUsedTotals = await CompOffService.getUsedCompOffCountsBulk(currentYear);
        } catch (e) {
            console.error('Error fetching bulk comp-off usage:', e);
        }

        const leavesByEmployee = {};
        (yearLeaves || []).forEach(l => {
            (leavesByEmployee[l.employee_id] = leavesByEmployee[l.employee_id] || []).push(l);
        });

        const sumDays = (leaves, status) => leaves
            .filter(l => l.status === status && l.leave_type !== 'Unpaid' && l.leave_type !== 'Comp-Off' && l.leave_type !== 'Birthday')
            .reduce((sum, l) => sum + (parseFloat(l.days_count) || 0), 0);

        // Same manual-adjustment offset getLeaveBalance applies — must be included here too,
        // otherwise this bulk endpoint (used by the AttendanceReports export) would disagree
        // with the single-employee balance for anyone HR has adjusted.
        const adjustmentTotals = await getManualPaidAdjustmentTotalsBulk(currentYear);

        // Same attendance-calendar-marked Paid Leave offset getLeaveBalance applies — see
        // getAttendancePaidLeaveCount for why; without it this bulk endpoint disagrees with
        // the single-employee balance for anyone whose PL was marked via the calendar.
        const attendancePLCounts = await getAttendancePaidLeaveCountsBulk(currentYear);

        // `balances` is the pre-existing shape (employee_id -> available days as a string) —
        // kept exactly as-is since AttendanceReports.jsx's export already depends on it.
        // Everything else here is new/additive.
        const balances = {};
        const used = {};
        const compOffBalance = {};
        const compOffUsed = {};
        (employees || []).forEach(emp => {
            compOffBalance[emp.employee_id] = Number(emp.comp_off_balance || 0).toFixed(1);
            compOffUsed[emp.employee_id] = (compOffUsedTotals[emp.employee_id] || 0).toFixed(1);

            if (!emp.joining_date) { balances[emp.employee_id] = '0.0'; used[emp.employee_id] = '0.0'; return; }
            const joiningDate = new Date(emp.joining_date);
            if (!isProbationComplete(joiningDate, today)) { balances[emp.employee_id] = '0.0'; used[emp.employee_id] = '0.0'; return; }

            const currentYearAccrual = calculateCurrentYearAccruedLeaves(joiningDate, today);
            const empLeaves = leavesByEmployee[emp.employee_id] || [];
            const usedDays = sumDays(empLeaves, 'approved') + (attendancePLCounts[emp.employee_id] || 0);
            const pending = sumDays(empLeaves, 'pending');
            const manualAdjustment = adjustmentTotals[emp.employee_id] || 0;
            balances[emp.employee_id] = Math.max(0, currentYearAccrual + manualAdjustment - usedDays - pending).toFixed(1);
            used[emp.employee_id] = usedDays.toFixed(1);
        });

        res.json({ success: true, balances, used, comp_off_balance: compOffBalance, comp_off_used: compOffUsed });
    } catch (error) {
        console.error('Error fetching bulk leave balances:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to fetch leave balances' });
    }
};

// ==================== LEAVE USAGE BY TYPE ====================
// Days used this year, grouped by leave_type — real data (used, not "remaining per type",
// since this app tracks one pooled balance across Annual/Sick/Personal/etc.).
exports.getLeaveUsageByType = async (req, res) => {
    try {
        const { employee_id } = req.params;
        const currentYear = new Date().getFullYear();

        const { data: leaves, error } = await supabase
            .from('leaves')
            .select('days_count, leave_type')
            .eq('employee_id', employee_id)
            .eq('status', 'approved')
            .gte('start_date', `${currentYear}-01-01`)
            .lte('start_date', `${currentYear}-12-31`);
        if (error) throw error;

        const usage = (leaves || []).reduce((acc, l) => {
            const type = l.leave_type || 'Other';
            acc[type] = (acc[type] || 0) + (parseFloat(l.days_count) || 0);
            return acc;
        }, {});

        res.json({ success: true, leave_year: currentYear, usage });
    } catch (error) {
        console.error('Error fetching leave usage by type:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch leave usage by type', error: error.message });
    }
};

// ==================== APPLY LEAVE ====================
exports.applyLeave = async (req, res) => {
    try {
        const {
            employee_id, leave_type, leave_duration, half_day_type,
            start_date, end_date, reason, days_count, reporting_manager
        } = req.body;

        if (!employee_id || !leave_type || !start_date || !reason) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        if (!reporting_manager || !reporting_manager.trim()) {
            return res.status(400).json({ success: false, message: 'Reporting manager is required' });
        }

        const { data: employee, error: empError } = await supabase
            .from('employees').select('joining_date, comp_off_balance, first_name, last_name, dob')
            .eq('employee_id', employee_id).single();
        if (empError) throw empError;

        // ── Birthday Leave — special handling ────────────────────────────────
        if (leave_type === 'Birthday') {
            if (!employee.dob) {
                return res.status(400).json({
                    success: false,
                    message: 'Your date of birth is not on record. Please contact admin to update your profile.'
                });
            }
            const dob     = new Date(employee.dob);
            const leaveStart = new Date(start_date);
            if (dob.getMonth() !== leaveStart.getMonth() || dob.getDate() !== leaveStart.getDate()) {
                const dobFormatted = dob.toLocaleString('en-IN', { month: 'long', day: 'numeric' });
                return res.status(400).json({
                    success: false,
                    message: `Birthday leave must be on your birthday (${dobFormatted}).`
                });
            }
            if (end_date && start_date !== end_date) {
                return res.status(400).json({ success: false, message: 'Birthday leave is only 1 day.' });
            }
            const leaveYear = leaveStart.getFullYear();
            const { data: existing } = await supabase
                .from('leaves')
                .select('id, status')
                .eq('employee_id', employee_id)
                .eq('leave_type', 'Birthday')
                .gte('start_date', `${leaveYear}-01-01`)
                .lte('start_date', `${leaveYear}-12-31`)
                .in('status', ['pending', 'approved'])
                .maybeSingle();
            if (existing) {
                return res.status(400).json({
                    success: false,
                    message: 'You have already applied for Birthday leave this year.'
                });
            }
            // Birthday leave skips all probation/balance checks — fall through to insert
        } else {
            const joiningDate = new Date(employee.joining_date);
            const today = new Date();
            const totalMonths = getTotalMonthsFromJoining(joiningDate, today);
            const isProbComplete = isProbationComplete(joiningDate, today);

            if (!isProbComplete && leave_type !== 'Unpaid' && leave_type !== 'Comp-Off') {
                return res.status(400).json({
                    success: false,
                    message: `During probation (${totalMonths}/${PAID_LEAVE_ELIGIBILITY_MONTHS} months), only Unpaid or Comp-Off leave allowed.`
                });
            }

            if (isProbComplete && leave_type !== 'Unpaid' && leave_type !== 'Comp-Off') {
                const { data: balanceData } = await supabase
                    .from('leave_balance').select('current_balance')
                    .eq('employee_id', employee_id).eq('leave_year', today.getFullYear()).maybeSingle();
                const available = balanceData?.current_balance || 0;
                if (available < days_count) {
                    return res.status(400).json({
                        success: false,
                        message: `Insufficient leave balance. Available: ${available.toFixed(1)} days.`
                    });
                }
            }

            if (leave_type === 'Comp-Off' && (employee.comp_off_balance || 0) < days_count) {
                return res.status(400).json({
                    success: false,
                    message: `Insufficient Comp-Off balance. Available: ${employee.comp_off_balance || 0} days`
                });
            }
        }

        // IST timestamp for created_at
        const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
        const nowUTC = new Date();
        const istMs = nowUTC.getTime() + IST_OFFSET_MS;
        const istDate = new Date(istMs);
        const createdAtIST = `${istDate.getUTCFullYear()}-${String(istDate.getUTCMonth()+1).padStart(2,'0')}-${String(istDate.getUTCDate()).padStart(2,'0')} ${String(istDate.getUTCHours()).padStart(2,'0')}:${String(istDate.getUTCMinutes()).padStart(2,'0')}:${String(istDate.getUTCSeconds()).padStart(2,'0')}`;

        // Birthday Leave is a company-provided benefit, not subject to manager judgement —
        // it's auto-approved the moment it's submitted instead of sitting as pending.
        const isBirthday = leave_type === 'Birthday';
        const statusFields = isBirthday
            ? { status: 'approved', approved_by: 'SYSTEM', approved_date: nowUTC.toISOString().split('T')[0] }
            : { status: 'pending' };

        const { data: leaveData, error: leaveError } = await supabase
            .from('leaves')
            .insert([{
                employee_id,
                employee_name: `${employee.first_name} ${employee.last_name}`,
                leave_type, leave_duration,
                half_day_type: half_day_type || null,
                start_date,
                end_date: end_date || start_date,
                reason,
                days_count: days_count || 1,
                reporting_manager: reporting_manager.trim(),
                ...statusFields,
                applied_date: nowUTC.toISOString().split('T')[0],
                created_at: createdAtIST,
                updated_at: createdAtIST
            }])
            .select();

        let insertedLeave;
        if (leaveError) {
            // If employee_name column doesn't exist, retry without it
            if (leaveError.message && leaveError.message.includes('employee_name')) {
                const { data: leaveData2, error: leaveError2 } = await supabase
                    .from('leaves')
                    .insert([{
                        employee_id, leave_type, leave_duration,
                        half_day_type: half_day_type || null,
                        start_date, end_date: end_date || start_date,
                        reason, days_count: days_count || 1,
                        reporting_manager: reporting_manager.trim(),
                        ...statusFields,
                        applied_date: nowUTC.toISOString().split('T')[0],
                        created_at: createdAtIST, updated_at: createdAtIST
                    }])
                    .select();
                if (leaveError2) throw leaveError2;
                insertedLeave = leaveData2[0];
            } else {
                throw leaveError;
            }
        } else {
            insertedLeave = leaveData[0];
        }

        if (isBirthday) {
            await syncAttendanceForApprovedLeave(insertedLeave);
        }

        res.json({
            success: true,
            message: isBirthday ? 'Birthday leave approved automatically!' : 'Leave request submitted successfully!',
            leave: insertedLeave
        });

        // Fire-and-forget: notify the reporting manager (matched by name — reporting_manager
        // is free text, not an employee_id FK, same limitation as elsewhere in this file) +
        // every HR, that a leave/comp-off request needs review. Birthday leave is excluded —
        // it's auto-approved the instant it's submitted (see statusFields above), so there is
        // no pending decision for anyone to review.
        if (!isBirthday) {
            (async () => {
                try {
                    const managerName = reporting_manager.trim().toLowerCase();
                    const [{ data: allActive, error: allErr }, { data: hrList, error: hrErr }] = await Promise.all([
                        supabase.from('employees').select('email, first_name, last_name, reporting_manager').eq('is_active', true),
                        supabase.from('employees').select('email, first_name, last_name').in('role', HR_ROLES).eq('is_active', true),
                    ]);
                    if (allErr) throw allErr;
                    if (hrErr) throw hrErr;

                    const matchedManager = (allActive || []).find(
                        e => `${e.first_name || ''} ${e.last_name || ''}`.trim().toLowerCase() === managerName
                    );

                    const recipientMap = new Map();
                    (hrList || []).forEach(e => { if (e.email) recipientMap.set(e.email, e); });
                    if (matchedManager?.email) recipientMap.set(matchedManager.email, matchedManager);

                    if (recipientMap.size > 0) {
                        await sendLeaveAppliedEmail(
                            {
                                employeeName: `${employee.first_name} ${employee.last_name}`,
                                leaveType: leave_type,
                                startDate: start_date,
                                endDate: end_date || start_date,
                                daysCount: days_count || 1,
                                reason,
                            },
                            Array.from(recipientMap.values())
                        );
                    }
                } catch (emailErr) {
                    console.error('❌ Failed to send leave-applied email:', emailErr.message);
                }
            })();
        }

    } catch (error) {
        console.error('❌ Error applying leave:', error);
        res.status(500).json({ success: false, message: 'Failed to apply leave', error: error.message });
    }
};

// ==================== GET ALL LEAVES ====================
exports.getLeaves = async (req, res) => {
    try {
        const authenticatedUserId = req.user?.employeeId;
        const userRole = req.user?.role;
        
        console.log('🔍 getLeaves called with:', {
            authenticatedUserId,
            userRole,
            query: req.query
        });

        let query = supabase
            .from('leaves')
            .select('*, employees!inner(first_name, last_name, department, designation, profile_image)');

        // sub_admin ("Manager" UI role) is treated as an unrestricted/company-wide viewer
        // everywhere else in this app (see /manager/team, ticket counts, break-team-stats) —
        // folded in here too so the Manager Dashboard's "All" option is actually company-wide,
        // consistent with every other card on that page. Only `manager` (TL) stays
        // self-team-scoped below, since TLs don't get the dashboard team-filter dropdown.
        const isAdmin = (userRole === 'admin' || userRole === 'desktop_support' || userRole === 'hr' || userRole === 'sub_admin') && req.query.all === 'true';
        const isReportingManager = req.query.reporting_manager === 'true'
            || (req.query.all === 'true' && !isAdmin && userRole === 'manager');

        console.log('🔍 Query flags:', { isAdmin, isReportingManager });

        if (isAdmin) {
            // Manager Dashboard "View Team" filter — an explicit target manager_id takes
            // priority over the plain employee_id filter (mutually exclusive use cases).
            if (req.query.manager_id && req.query.manager_id !== 'ALL') {
                const teamIds = await getTeamEmployeeIdsByEmployeeId(req.query.manager_id);
                if (!teamIds || teamIds.length === 0) return res.json([]);
                query = query.in('employee_id', teamIds);
            } else if (req.query.employee_id) {
                query = query.eq('employee_id', req.query.employee_id);
            }
            // else: no additional filtering — full company-wide
        } else if (isReportingManager) {
            // Reporting manager: leaves where reporting_manager matches OR
            // employee's reporting_manager in employees table matches (for old leaves with null reporting_manager)
            const { data: emp } = await supabase
                .from('employees').select('first_name, last_name')
                .eq('employee_id', authenticatedUserId).single();
            const managerName = emp ? `${emp.first_name} ${emp.last_name}` : '';

            // Get all employee_ids who report to this manager
            const { data: teamEmps } = await supabase
                .from('employees')
                .select('employee_id')
                .eq('reporting_manager', managerName);
            const teamIds = (teamEmps || []).map(e => e.employee_id);

            // Also pick up leaves explicitly tagged to this manager at the time of applying —
            // an employee can pick a different manager/TL in the Apply Leave form than the one
            // assigned on their profile, so team membership alone can miss those requests.
            const { data: taggedLeaves } = await supabase
                .from('leaves')
                .select('id')
                .eq('reporting_manager', managerName);
            const taggedIds = (taggedLeaves || []).map(l => l.id);

            if (teamIds.length === 0 && taggedIds.length === 0) {
                return res.json([]);
            }

            const orFilters = [];
            if (teamIds.length > 0) orFilters.push(`employee_id.in.(${teamIds.join(',')})`);
            if (taggedIds.length > 0) orFilters.push(`id.in.(${taggedIds.join(',')})`);

            // Fetch leaves where employee is in team OR the leave was directly tagged to this manager
            query = query.or(orFilters.join(','));
        } else {
            // Employee: own leaves only
            if (!authenticatedUserId) return res.json([]);
            query = query.eq('employee_id', authenticatedUserId);
        }

        // Optional date-range narrowing — additive, only applied when a caller passes it, so
        // every existing caller that wants full history keeps getting exactly that. Matches
        // on overlap (a leave spanning INTO or OUT OF the range still counts), same rule
        // AttendanceReports.jsx/PayrollCenter.jsx already used to filter this client-side
        // after fetching everything — now the server does the narrowing instead.
        if (req.query.start) query = query.gte('end_date', req.query.start);
        if (req.query.end) query = query.lte('start_date', req.query.end);

        query = query.order('created_at', { ascending: false });
        const { data: leaves, error } = await query;
        if (error) {
            console.error('❌ Database error in getLeaves:', error);
            throw error;
        }
        
        console.log('✅ Leaves fetched successfully:', leaves?.length || 0, 'records');

        const formatted = (leaves || []).map(l => ({
            ...l,
            first_name: l.employees?.first_name || l.employee_name?.split(' ')[0] || '',
            last_name: l.employees?.last_name || l.employee_name?.split(' ').slice(1).join(' ') || '',
            department: l.employees?.department || '',
            designation: l.employees?.designation || '',
            profile_image: l.employees?.profile_image || null,
            employees: undefined
        }));
        
        console.log('✅ Returning formatted leaves:', formatted.length, 'records');
        console.log('📊 Sample leave data:', formatted.slice(0, 2));

        res.json(formatted);
    } catch (error) {
        console.error('❌ Error in getLeaves:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching leaves', 
            error: error.message,
            leaves: [] // Return empty array on error
        });
    }
};

// ==================== UPDATE LEAVE STATUS ====================
exports.updateLeaveStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, remarks } = req.body;
        const approver_id = req.user?.employeeId;
        const userRole = req.user?.role;

        if (!status || !['approved', 'rejected', 'cancelled'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Valid status required' });
        }

        const { data: leave, error: fetchError } = await supabase
            .from('leaves').select('*').eq('id', id).single();
        if (fetchError || !leave) {
            return res.status(404).json({ success: false, message: 'Leave request not found' });
        }

        // Authorization logic:
        // - Admin can approve/reject any leave request
        // - Team Leader/Manager employee's leave: only admin can approve/reject
        // - Regular employee's leave: their reporting manager or admin can approve/reject
        // - Employee can cancel their own leave
        if (status === 'cancelled') {
            // Employee cancelling own leave - allow
        } else if (userRole === 'admin' || userRole === 'hr') {
            // Admin/HR can approve/reject any leave request
        } else {
            // Non-admin: must be the reporting manager of the employee
            const { data: approver } = await supabase
                .from('employees').select('first_name, last_name')
                .eq('employee_id', approver_id).single();
            const approverName = approver ? `${approver.first_name} ${approver.last_name}` : '';
            // Allow either the employee's officially assigned reporting manager, OR whoever the
            // employee explicitly tagged as reporting manager on this specific leave request —
            // the Apply Leave form lets an employee pick a different manager/TL than the one on
            // their profile, and that tagged manager must be able to act on it too.
            const { data: empData } = await supabase
                .from('employees').select('reporting_manager')
                .eq('employee_id', leave.employee_id).single();
            const empReportingManager = empData?.reporting_manager || '';
            const leaveTaggedManager = leave.reporting_manager || '';
            if (empReportingManager !== approverName && leaveTaggedManager !== approverName) {
                return res.status(403).json({
                    success: false,
                    message: 'Only the assigned reporting manager or admin can approve or reject this leave'
                });
            }
        }

        const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
        const nowIST = new Date(Date.now() + IST_OFFSET_MS);
        const updatedAtIST = `${nowIST.getUTCFullYear()}-${String(nowIST.getUTCMonth()+1).padStart(2,'0')}-${String(nowIST.getUTCDate()).padStart(2,'0')} ${String(nowIST.getUTCHours()).padStart(2,'0')}:${String(nowIST.getUTCMinutes()).padStart(2,'0')}:${String(nowIST.getUTCSeconds()).padStart(2,'0')}`;

        const updateData = {
            status,
            remarks: remarks || null,
            updated_at: updatedAtIST,
            approved_by: approver_id || null,
            approved_date: status === 'approved' ? new Date().toISOString().split('T')[0] : null
        };

        const { data: updatedLeave, error: updateError } = await supabase
            .from('leaves').update(updateData).eq('id', id).select();
        if (updateError) throw updateError;

        // On approval: immediately deduct from leave balance
        if (status === 'approved') {
            const today = new Date();
            const leaveYear = today.getFullYear();

            if (leave.leave_type === 'Comp-Off') {
                // Deduct from comp_off_balance
                const { data: emp } = await supabase
                    .from('employees').select('comp_off_balance').eq('employee_id', leave.employee_id).single();
                const newBalance = Math.max(0, (emp?.comp_off_balance || 0) - (leave.days_count || 1));
                await supabase.from('employees')
                    .update({ comp_off_balance: newBalance })
                    .eq('employee_id', leave.employee_id);
            } else if (leave.leave_type !== 'Unpaid' && leave.leave_type !== 'Birthday') {
                // Deduct from leave_balance (Birthday leave is a free benefit — no deduction)
                const { data: bal } = await supabase
                    .from('leave_balance').select('*')
                    .eq('employee_id', leave.employee_id).eq('leave_year', leaveYear).maybeSingle();
                if (bal) {
                    const newUsed = (bal.total_used || 0) + (leave.days_count || 1);
                    const newBalance = Math.max(0, (bal.total_accrued || 0) - newUsed - (bal.total_pending || 0));
                    await supabase.from('leave_balance').update({
                        total_used: newUsed,
                        current_balance: newBalance,
                        last_updated: new Date().toISOString()
                    }).eq('employee_id', leave.employee_id).eq('leave_year', leaveYear);
                }
            }

            // Approved Paid/Birthday/Comp-Off leave days must show Present, not Absent —
            // write the attendance placeholder now that approval is final.
            await syncAttendanceForApprovedLeave(updatedLeave[0]);
        } else if ((status === 'rejected' || status === 'cancelled') && leave.status === 'approved') {
            // A previously-approved leave is being reversed — undo the Present
            // placeholder so the day gets recalculated instead of staying stuck as leave.
            await revertAttendanceForLeave(leave);

            // Give back whatever balance the original approval deducted. Paid Leave itself
            // needs no manual patch here — getLeaveBalance recomputes `used`/`current_balance`
            // from scratch every time it's fetched, filtered to status='approved', so this
            // leave already drops out of that count on its own. Comp-Off is different:
            // employees.comp_off_balance is a flat running counter with no such recompute, so
            // without this it stays permanently short by the days this leave had deducted.
            if (leave.leave_type === 'Comp-Off') {
                const { data: emp } = await supabase
                    .from('employees').select('comp_off_balance').eq('employee_id', leave.employee_id).single();
                const restoredBalance = (emp?.comp_off_balance || 0) + (leave.days_count || 1);
                await supabase.from('employees')
                    .update({ comp_off_balance: restoredBalance })
                    .eq('employee_id', leave.employee_id);
            }
        }

        res.json({ success: true, message: `Leave ${status} successfully`, leave: updatedLeave[0] });

        // Non-blocking email notification
        supabase.from('employees').select('email, first_name, last_name')
            .eq('employee_id', leave.employee_id).single()
            .then(({ data: emp }) => {
                if (emp?.email) {
                    sendLeaveStatusEmail(emp, {
                        status,
                        leaveType: leave.leave_type,
                        startDate: leave.start_date,
                        endDate: leave.end_date,
                        daysCount: leave.days_count,
                        remarks: remarks || null,
                        approvedBy: approver_id || null,
                    }).catch(err => console.error('⚠️ Leave email error:', err.message));
                }
            })
            .catch(err => console.error('⚠️ Leave email fetch error:', err.message));

    } catch (error) {
        console.error('❌ Error updating leave status:', error);
        res.status(500).json({ success: false, message: 'Failed to update leave status', error: error.message });
    }
};

// ==================== GET LEAVE TYPES ====================
exports.getLeaveTypes = async (req, res) => {
    try {
        const { employee_id } = req.query;

        let availableTypes = [
            { value: 'Unpaid', label: 'Unpaid Leave', icon: '💰' }
        ];

        if (employee_id) {
            const { data: employee, error } = await supabase
                .from('employees')
                .select('comp_off_balance, joining_date, dob')
                .eq('employee_id', employee_id)
                .single();

            if (!error && employee) {
                if (employee.comp_off_balance > 0) {
                    availableTypes.unshift({
                        value: 'Comp-Off',
                        label: `Comp-Off (${employee.comp_off_balance} days available)`,
                        icon: '🎉'
                    });
                }

                // Birthday Leave — available to all employees (no probation restriction)
                if (employee.dob) {
                    const today = new Date();
                    const dob = new Date(employee.dob);
                    const mm = String(dob.getMonth() + 1).padStart(2, '0');
                    const dd = String(dob.getDate()).padStart(2, '0');
                    const birthdayThisYear = `${today.getFullYear()}-${mm}-${dd}`;
                    availableTypes.push({
                        value: 'Birthday',
                        label: '🎂 Birthday Leave',
                        icon: '🎂',
                        birthday_date: birthdayThisYear
                    });
                }

                if (employee.joining_date) {
                    const joiningDate = new Date(employee.joining_date);
                    const today = new Date();

                    if (isProbationComplete(joiningDate, today)) {
                        availableTypes.push(
                            { value: 'Annual', label: 'Annual Leave', icon: '🌴' },
                            { value: 'Sick', label: 'Sick Leave', icon: '🤒' },
                            { value: 'Personal', label: 'Personal Leave', icon: '👤' },
                            { value: 'Maternity', label: 'Maternity Leave', icon: '🤱' },
                            { value: 'Paternity', label: 'Paternity Leave', icon: '👨‍👧' },
                            { value: 'Bereavement', label: 'Bereavement Leave', icon: '💐' }
                        );
                    }
                }
            }
        }

        res.json({
            success: true,
            leaveTypes: availableTypes
        });

    } catch (error) {
        console.error('Error fetching leave types:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch leave types',
            error: error.message
        });
    }
};

// ==================== ON LEAVE TODAY ====================
exports.getOnLeaveToday = async (req, res) => {
    try {
        const { employeeId, role } = req.user;
        let { scope = 'department', department, manager_id } = req.query;

        const { data: caller, error: callerErr } = await supabase
            .from('employees')
            .select('first_name, last_name, department')
            .eq('employee_id', employeeId)
            .maybeSingle();
        if (callerErr) throw callerErr;

        if (scope === 'company' && !['admin', 'sub_admin', 'hr'].includes(role)) {
            scope = 'department';
        }

        const today = new Date().toISOString().split('T')[0];

        const { data: leaves, error: leavesErr } = await supabase
            .from('leaves')
            .select('employee_id, leave_type, start_date, end_date')
            .eq('status', 'approved')
            .lte('start_date', today)
            .gte('end_date', today);
        if (leavesErr) throw leavesErr;

        if (!leaves || leaves.length === 0) {
            return res.json({ success: true, scope, date: today, count: 0, employees: [] });
        }

        const empIds = [...new Set(leaves.map(l => l.employee_id))];
        const { data: emps, error: empsErr } = await supabase
            .from('employees')
            .select('employee_id, first_name, last_name, department, designation, profile_image, reporting_manager')
            .in('employee_id', empIds);
        if (empsErr) throw empsErr;

        // Manager Dashboard "View Team" filter — an explicit target manager overrides whose
        // team gets matched below, instead of always resolving to the caller's own name.
        let teamManagerName = `${caller?.first_name || ''} ${caller?.last_name || ''}`.trim().toLowerCase();
        if (manager_id && manager_id !== 'ALL' && ['admin', 'sub_admin', 'hr'].includes(role)) {
            const { data: targetManager } = await supabase
                .from('employees').select('first_name, last_name')
                .eq('employee_id', manager_id).maybeSingle();
            if (targetManager) {
                teamManagerName = `${targetManager.first_name} ${targetManager.last_name}`.trim().toLowerCase();
                scope = 'team';
            }
        }

        const targetDept = (department || caller?.department || '').toLowerCase();

        const scoped = (emps || []).filter(e => {
            if (scope === 'team') {
                return (e.reporting_manager || '').trim().toLowerCase() === teamManagerName;
            }
            if (scope === 'company') return true;
            return (e.department || '').toLowerCase() === targetDept;
        });

        const result = scoped.map(e => {
            const leave = leaves.find(l => l.employee_id === e.employee_id);
            return {
                employee_id: e.employee_id,
                first_name: e.first_name,
                last_name: e.last_name,
                department: e.department,
                designation: e.designation,
                profile_image: e.profile_image,
                leave_type: leave?.leave_type,
                start_date: leave?.start_date,
                end_date: leave?.end_date,
            };
        });

        res.json({ success: true, scope, date: today, count: result.length, employees: result });
    } catch (error) {
        console.error('Error fetching on-leave-today:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch on-leave-today', error: error.message });
    }
};

// ==================== MANUAL ACCRUAL ====================
exports.manualAccrual = async (req, res) => {
    try {
        const { employee_id } = req.params;
        
        const { data: employee, error: empError } = await supabase
            .from('employees')
            .select('joining_date')
            .eq('employee_id', employee_id)
            .single();
            
        if (empError) throw empError;
        
        const joiningDate = new Date(employee.joining_date);
        const today = new Date();
        const currentYearAccrual = calculateCurrentYearAccruedLeaves(joiningDate, today);
        const currentYear = today.getFullYear();
        
        const { data: existingBalance } = await supabase
            .from('leave_balance')
            .select('*')
            .eq('employee_id', employee_id)
            .eq('leave_year', currentYear)
            .single();
            
        if (existingBalance) {
            await supabase
                .from('leave_balance')
                .update({
                    total_accrued: currentYearAccrual,
                    current_balance: currentYearAccrual - (existingBalance.total_used || 0),
                    last_updated: today.toISOString()
                })
                .eq('employee_id', employee_id)
                .eq('leave_year', currentYear);
        } else {
            await supabase
                .from('leave_balance')
                .insert([{
                    employee_id,
                    leave_year: currentYear,
                    total_accrued: currentYearAccrual,
                    total_used: 0,
                    total_pending: 0,
                    current_balance: currentYearAccrual,
                    last_updated: today.toISOString()
                }]);
        }
        
        res.json({
            success: true,
            message: `Manual accrual updated: ${currentYearAccrual} days`,
            total_accrued: currentYearAccrual,
            completed_months: getCompletedMonthsInCurrentYear(joiningDate, today)
        });
        
    } catch (error) {
        console.error('Error in manual accrual:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to add manual accrual',
            error: error.message
        });
    }
};

// ==================== YEARLY RESET ====================
exports.yearlyReset = async (req, res) => {
    try {
        const nextYear = new Date().getFullYear() + 1;
        
        const { data: employees } = await supabase
            .from('employees')
            .select('employee_id, joining_date');
            
        if (employees) {
            for (const emp of employees) {
                const joiningDate = new Date(emp.joining_date);
                const today = new Date(nextYear, 0, 1);
                
                let accruedMonths = 0;
                const joinYear = joiningDate.getFullYear();
                
                if (joinYear <= nextYear) {
                    for (let month = 0; month < 12; month++) {
                        accruedMonths++;
                    }
                }
                
                const accrualAmount = accruedMonths * MONTHLY_ACCRUAL_RATE;
                
                const { data: existing } = await supabase
                    .from('leave_balance')
                    .select('id')
                    .eq('employee_id', emp.employee_id)
                    .eq('leave_year', nextYear)
                    .single();
                    
                if (!existing) {
                    await supabase
                        .from('leave_balance')
                        .insert([{
                            employee_id: emp.employee_id,
                            leave_year: nextYear,
                            total_accrued: accrualAmount,
                            total_used: 0,
                            total_pending: 0,
                            current_balance: accrualAmount,
                            last_updated: new Date().toISOString()
                        }]);
                }
            }
        }
        
        res.json({
            success: true,
            message: `Yearly reset completed for ${nextYear}`,
            year: nextYear
        });
        
    } catch (error) {
        console.error('Error in yearly reset:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reset yearly leaves',
            error: error.message
        });
    }
};

// ==================== ADJUST LEAVE BALANCE (HR/Admin — add, reduce, no approval flow) ====================
// Covers the two balances this system actually tracks: the pooled paid-leave bucket
// (Annual/Sick/Personal/Maternity/Paternity/Bereavement all draw from ONE shared balance
// here — see leavePolicy.js — so this adjusts that bucket as a whole, not per sub-type) and
// Comp-Off (its own ledger-backed balance in comp_off_earnings). Unpaid and Birthday have no
// balance concept in this system (Unpaid is unrestricted, Birthday is a fixed once-a-year
// auto-approved perk) so they're rejected here rather than silently accepted and ignored.
exports.adjustLeaveBalance = async (req, res) => {
    try {
        const { employee_id, leave_category, adjustment_days, reason } = req.body;

        if (!employee_id || !leave_category || adjustment_days === undefined || adjustment_days === null || adjustment_days === '') {
            return res.status(400).json({ success: false, message: 'employee_id, leave_category and adjustment_days are required' });
        }
        if (!['paid', 'comp_off'].includes(leave_category)) {
            return res.status(400).json({ success: false, message: "leave_category must be 'paid' or 'comp_off'" });
        }
        const days = parseFloat(adjustment_days);
        if (!days || Number.isNaN(days) || days === 0) {
            return res.status(400).json({ success: false, message: 'adjustment_days must be a non-zero number' });
        }

        const { data: employee, error: empError } = await supabase
            .from('employees')
            .select('employee_id, first_name, last_name')
            .eq('employee_id', employee_id)
            .single();
        if (empError || !employee) {
            return res.status(404).json({ success: false, message: 'Employee not found' });
        }

        const currentYear = new Date().getFullYear();
        const adjustedBy = req.user?.employeeId || null;
        const adjustedByName = req.user?.email || adjustedBy;

        if (leave_category === 'comp_off') {
            if (!Number.isInteger(days)) {
                return res.status(400).json({ success: false, message: 'Comp-Off is tracked in whole days — adjustment_days must be a whole number' });
            }
            const CompOffService = require('../services/compOffService');
            const todayStr = new Date().toISOString().split('T')[0];

            if (days > 0) {
                // Grant N comp-off days — insert N earned-style rows, exactly like a real
                // holiday-worked earn (see compOffService.earnCompOff), so the existing
                // row-count-based balance/expiry logic needs no changes at all.
                const rows = Array.from({ length: days }, () => ({
                    employee_id,
                    attendance_date: todayStr,
                    holiday_date: todayStr,
                    holiday_name: 'HR/Admin Adjustment',
                    comp_off_days: 1,
                    is_used: false,
                }));
                const { error: insErr } = await supabase.from('comp_off_earnings').insert(rows);
                if (insErr) throw insErr;
                const { data: empBal } = await supabase.from('employees').select('comp_off_balance').eq('employee_id', employee_id).single();
                await supabase.from('employees').update({ comp_off_balance: (empBal?.comp_off_balance || 0) + days }).eq('employee_id', employee_id);
            } else {
                // Reduce — consume the oldest available comp-off rows, same mechanism the
                // system already uses when comp-off is spent on a real leave. Naturally
                // refuses to go below 0 (throws if not enough balance to reduce by).
                try {
                    await CompOffService.useCompOff(employee_id, null, Math.abs(days));
                } catch (e) {
                    return res.status(400).json({ success: false, message: e.message || 'Insufficient comp-off balance to reduce by that amount' });
                }
            }
        }
        // 'paid' category needs no ledger mutation here — the audit row inserted below IS
        // the adjustment mechanism; getLeaveBalance/getLeaveBalanceBulk sum it into the
        // accrual formula on every read.

        const { error: logErr } = await supabase.from('leave_balance_adjustments').insert([{
            employee_id,
            leave_category,
            leave_year: currentYear,
            adjustment_days: days,
            reason: reason || null,
            adjusted_by: adjustedBy,
            adjusted_by_name: adjustedByName,
        }]);
        if (logErr) {
            const tableMissing = /does not exist|schema cache/i.test(logErr.message || '');
            if (leave_category === 'paid' && tableMissing) {
                // For 'paid' this insert IS the whole adjustment — nothing else changed, so
                // this must be a hard failure, not a silently-ignored no-op.
                return res.status(500).json({
                    success: false,
                    message: 'Leave balance adjustments table has not been created yet — run scripts/create-leave-balance-adjustments.sql first',
                });
            }
            if (!tableMissing) throw logErr;
            // Comp-Off already changed via the ledger above; a missing audit table only
            // means this specific adjustment won't show in history — not worth failing over.
            console.warn('leave_balance_adjustments insert skipped (table not migrated yet):', logErr.message);
        }

        res.json({
            success: true,
            message: `${days > 0 ? 'Added' : 'Reduced'} ${Math.abs(days)} ${leave_category === 'comp_off' ? 'Comp-Off' : 'paid leave'} day(s) for ${employee.first_name} ${employee.last_name}`,
        });
    } catch (error) {
        console.error('Error adjusting leave balance:', error);
        res.status(500).json({ success: false, message: 'Failed to adjust leave balance', error: error.message });
    }
};

// ==================== GET LEAVE BALANCE ADJUSTMENT HISTORY ====================
exports.getLeaveAdjustmentHistory = async (req, res) => {
    try {
        const { employee_id } = req.params;
        const { data, error } = await supabase
            .from('leave_balance_adjustments')
            .select('*')
            .eq('employee_id', employee_id)
            .order('created_at', { ascending: false });
        if (error) {
            if (/does not exist|schema cache/i.test(error.message || '')) {
                return res.json({ success: true, adjustments: [] });
            }
            throw error;
        }
        res.json({ success: true, adjustments: data || [] });
    } catch (error) {
        console.error('Error fetching leave adjustment history:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch adjustment history', error: error.message });
    }
};

module.exports = exports;