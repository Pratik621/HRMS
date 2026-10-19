const supabase = require('../config/supabase');
const { isDateHoliday, getHolidayName } = require('../data/holidays');
const { getDeductionTotal } = require('./deductionController');
const { pickBetterAttendanceRow } = require('./attendanceController')._shared;
const { getCycleDates, parseLocalDate, LATE_FREE_COUNT } = require('../config/payrollCycle');
const CompanyHolidayService = require('../services/companyHolidayService');

const { dateOnly, countWeekdays, calculateProratedPay } = require('../services/payrollMath');
// Helper function to get month name
function getMonthName(monthNumber) {
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    return months[monthNumber - 1] || 'Unknown';
}

// Calculate working days in cycle (Monday to Friday only)
const calculateWorkingDaysInCycle = countWeekdays;

// Count company holidays (weekdays only) in cycle. `extraHolidays` is a Map of
// dateStr -> name for HR/Admin-declared holidays (company_holidays table, see
// companyHolidayService.js) — additive to the static calendar in data/holidays.js, so a
// holiday applied via the Attendance Reports "HOL" button is treated exactly like a static
// one for payroll purposes (a paid day, not counted as absent/loss-of-pay).
const countHolidaysInCycle = (startDateStr, endDateStr, extraHolidays = new Map()) => {
    const startDate = parseLocalDate(startDateStr);
    const endDate   = parseLocalDate(endDateStr);
    let holidayDays = 0;
    const holidayNames = [];

    const toLocalDateStr = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };

    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
        const dayOfWeek = currentDate.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            const dateStr = toLocalDateStr(currentDate);
            if (isDateHoliday(dateStr)) {
                holidayDays++;
                holidayNames.push({ date: dateStr, name: getHolidayName(dateStr) });
            } else if (extraHolidays.has(dateStr)) {
                holidayDays++;
                holidayNames.push({ date: dateStr, name: extraHolidays.get(dateStr) });
            }
        }
        currentDate.setDate(currentDate.getDate() + 1);
    }
    return { holidayDays, holidayNames };
};

// Calculate days employed in the cycle (for prorated salary)
const calculateDaysEmployedInCycle = (startDate, endDate, joiningDate) => {
    if (!joiningDate) return null;

    const joinDate   = dateOnly(joiningDate);
    const cycleStart = dateOnly(startDate);
    const cycleEnd   = dateOnly(endDate);

    if (joinDate > cycleEnd) return 0;
    if (joinDate <= cycleStart) return null;

    let employedDays = 0;
    let currentDate = new Date(joinDate);

    while (currentDate <= cycleEnd) {
        const dayOfWeek = currentDate.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            employedDays++;
        }
        currentDate.setDate(currentDate.getDate() + 1);
    }

    return employedDays;
};

// Get employee details
const getEmployeeDetails = async (employeeId) => {
    const { data: employee, error } = await supabase
        .from('employees')
        .select('*')
        .eq('employee_id', employeeId)
        .single();

    if (error) throw error;
    return employee;
};

// Get attendance records for the cycle - best record per day
//
// Dedup uses the exact same pickBetterAttendanceRow rule as attendanceController's
// getAttendanceReport / getEmployeeAttendanceReport (imported from there, not
// reimplemented) — this used to have its own ad-hoc "prefer the later raw clock_out
// timestamp" rule, independent of and inconsistent with the one those two endpoints use.
// That's the same class of bug that caused B2B260612's Jul 28 day to show Present on the
// employee's own Attendance page but Absent in the payroll Excel: whichever duplicate row
// happens to carry the later clock_out timestamp isn't necessarily the real/complete one.
// Left un-synced, that mismatch would also silently corrupt salary slips and the Payroll
// Preview — this makes all three (Attendance page, Excel export, salary calculation) agree.
const getAttendanceRecords = async (employeeId, startDateStr, endDateStr) => {
    const { data: attendance, error } = await supabase
        .from('attendance')
        .select('attendance_date, clock_in, clock_out, clock_in_ist, clock_out_ist, status, attendance_type, total_minutes, late_minutes, overtime_hours, overtime_amount, is_holiday, holiday_name, is_regularized, created_at, updated_at')
        .eq('employee_id', employeeId)
        .gte('attendance_date', startDateStr)
        .lte('attendance_date', endDateStr)
        .order('attendance_date', { ascending: true });

    if (error) throw error;

    const bestPerDay = {};
    for (const rec of (attendance || [])) {
        const dateKey = rec.attendance_date.split('T')[0];
        bestPerDay[dateKey] = pickBetterAttendanceRow(bestPerDay[dateKey], rec);
    }

    return Object.values(bestPerDay);
};

// Get approved leaves for the cycle
const getApprovedLeaves = async (employeeId, startDateStr, endDateStr) => {
    const { data: leaves, error } = await supabase
        .from('leaves')
        .select('leave_type, start_date, end_date, days_count, leave_duration')
        .eq('employee_id', employeeId)
        .eq('status', 'approved')
        .lte('start_date', endDateStr)
        .gte('end_date', startDateStr);

    if (error) throw error;
    return leaves || [];
};

// Calculate attendance summary. `extraHolidays` — see countHolidaysInCycle above — is a
// Map of dateStr -> name for HR/Admin-declared holidays, checked alongside the static
// calendar so a day with no attendance/leave row on a declared holiday credits a paid day
// instead of falling through to absentDays.
const calculateAttendanceSummary = (attendanceRecords, leaves, startDateStr, endDateStr, joiningDate = null, extraHolidays = new Map()) => {
    const startDate = parseLocalDate(startDateStr);
    const endDate   = parseLocalDate(endDateStr);
    const joinDate  = joiningDate ? dateOnly(joiningDate) : null;

    // A cycle can be (and, per real usage here, regularly is) summarized before it has
    // finished — e.g. an admin generating/previewing a slip mid-month. Days after today
    // haven't happened yet and must not be walked at all, let alone fall through to
    // absentDays++ for lack of an attendance row — a fully-present new joiner would
    // otherwise show a wall of "Absent" for the rest of the cycle that simply hasn't
    // arrived yet.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const loopEndDate = endDate > today ? today : endDate;

    // Use local date string (YYYY-MM-DD) to avoid UTC offset issues
    const toLocalDateStr = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };

    const attendanceMap = {};
    attendanceRecords.forEach(record => {
        // attendance_date is already YYYY-MM-DD string from DB
        const key = record.attendance_date.split('T')[0];
        attendanceMap[key] = record;
    });

    const leaveMap = {};
    leaves.forEach(leave => {
        const leaveStart = new Date(`${leave.start_date.split('T')[0]}T00:00:00`);
        const leaveEnd   = new Date(`${leave.end_date.split('T')[0]}T00:00:00`);
        for (let d = new Date(leaveStart); d <= leaveEnd; d.setDate(d.getDate() + 1)) {
            const dateStr = toLocalDateStr(d);
            if (!leaveMap[dateStr]) {
                leaveMap[dateStr] = {
                    type: leave.leave_type,
                    duration: leave.leave_duration || 'Full Day'
                };
            }
        }
    });

    let presentDays = 0;
    let halfDays = 0;
    let absentDays = 0;
    let paidLeaveDays = 0;
    let unpaidLeaveDays = 0;
    let totalOvertimeHours = 0;
    let totalOvertimeAmount = 0;
    let totalLateMinutes = 0;
    let lateDays = 0;

    const currentDate = new Date(startDate);
    while (currentDate <= loopEndDate) {
        const dateStr    = toLocalDateStr(currentDate);
        const dayOfWeek  = currentDate.getDay();
        const isWeekday  = dayOfWeek !== 0 && dayOfWeek !== 6;

        if (!isWeekday) {
            currentDate.setDate(currentDate.getDate() + 1);
            continue;
        }

        if (joinDate && currentDate < joinDate) {
            currentDate.setDate(currentDate.getDate() + 1);
            continue;
        }

        const attendance = attendanceMap[dateStr];
        const leave      = leaveMap[dateStr];

        if (isDateHoliday(dateStr) || extraHolidays.has(dateStr) || attendance?.is_holiday) {
            paidLeaveDays++;
        } else if (leave) {
            if (leave.type === 'Unpaid') {
                unpaidLeaveDays += leave.duration === 'Half Day' ? 0.5 : 1;
            } else {
                paidLeaveDays += leave.duration === 'Half Day' ? 0.5 : 1;
            }
            if (leave.duration === 'Half Day') {
                // The other half still needs attendance; a leave covers only half the day.
                const status = (attendance?.status || '').toLowerCase();
                if (attendance?.is_regularized || status === 'present' || status === 'half_day') {
                    presentDays += 0.5;
                } else {
                    absentDays += 0.5;
                }
            }
        } else if (attendance) {
            // Use DB status field directly — it's already correctly set by clockOut
            // Also handle still-clocked-in (clock_out null but status='present')
            const dbStatus = (attendance.status || '').toLowerCase();
            const totalMinutes = attendance.total_minutes || 0;

            // An admin-approved regularization always counts as a full present day for pay,
            // regardless of the computed status/hours — same rule the employee's own
            // Attendance page and the payroll Excel export already use (a regularization can
            // legitimately land at dbStatus 'half_day' or even 'absent' if the approved
            // clock-in/out totals under 9h/5h, but the point of approving it is that the day
            // is paid in full). Without this, a regularized short day silently under-paid the
            // employee even though every screen they can see shows "Present".
            if (attendance.is_regularized) {
                presentDays++;
            } else if (dbStatus === 'present' && attendance.attendance_type === 'paid_leave') {
                // Marked "Paid Leave" directly on the Attendance Calendar (adminMarkAttendance)
                // rather than via an approved leave request — still a paid day (feeds
                // totalPaidDays the same as presentDays), but must be reported as Paid Leave,
                // not folded silently into Present, so the slip/preview reflects it.
                paidLeaveDays++;
            } else if (dbStatus === 'present') {
                presentDays++;
            } else if (dbStatus === 'half_day') {
                halfDays++;
                presentDays += 0.5;
            } else if (dbStatus === 'absent') {
                // Admin-marked week_off or holiday (is_holiday=true) → paid, no deduction.
                // Also treat as paid if this date was declared a company holiday via the HOL
                // button AFTER this attendance row already existed (e.g. a nightly-cron
                // "absent" placeholder from before the holiday was applied) — the row's own
                // is_holiday column was never touched, so extraHolidays is the only place
                // that knows.
                if (attendance.is_holiday || extraHolidays.has(dateStr)) {
                    presentDays++;
                } else {
                    absentDays++;
                }
            } else if (attendance.clock_in && !attendance.clock_out) {
                // Still working — count as present for salary
                presentDays++;
            } else if (attendance.clock_in && attendance.clock_out) {
                // Fallback: calculate from total_minutes
                if (totalMinutes >= 9 * 60) {
                    presentDays++;
                } else if (totalMinutes >= 300) {
                    halfDays++;
                    presentDays += 0.5;
                } else {
                    absentDays++;
                }
            } else {
                absentDays++;
            }

            if (attendance.overtime_hours > 0) {
                totalOvertimeHours  += Number(attendance.overtime_hours)  || 0;
                totalOvertimeAmount += Number(attendance.overtime_amount) || 0;
            }
            if (attendance.late_minutes > 0) {
                lateDays++;
                totalLateMinutes += Number(attendance.late_minutes) || 0;
            }
        } else if (isDateHoliday(dateStr) || extraHolidays.has(dateStr)) {
            // Company holiday, no attendance row and no leave record — expected, since
            // cron/absentEmployeeCheck.js explicitly skips marking absences on holidays, so
            // there is usually nothing in attendanceMap for this date at all. This day is
            // already credited via holidayDays in generateSalarySlip's totalPaidDays; it must
            // NOT also fall through to absentDays here. Before this fix, a fully-present
            // employee with one company holiday in the cycle got docked a full day's pay for
            // that holiday: totalPaidDays (which does add holidayDays) reached totalWorkingDays
            // so basicSalary was correctly capped at the full monthly salary, but absentDays
            // wrongly included the holiday too, so effectiveUnpaidDeduction still fired and
            // subtracted a day's pay that was supposedly already covered.
        } else {
            absentDays++;
        }

        currentDate.setDate(currentDate.getDate() + 1);
    }

    return {
        presentDays,
        halfDays,
        absentDays,
        paidLeaveDays,
        unpaidLeaveDays,
        totalOvertimeHours,
        totalOvertimeAmount,
        lateDays,
        totalLateMinutes,
        // Informational only (no deduction applied) — first LATE_FREE_COUNT lates per cycle are free.
        freeLateDays: Math.min(lateDays, LATE_FREE_COUNT),
        chargeableLateDays: Math.max(0, lateDays - LATE_FREE_COUNT)
    };
};

// Simplified generateSalarySlip function
exports.generateSalarySlip = async (req, res) => {
    try {
        console.log('📝 Generating salary slip with body:', req.body);

        const { employee_id, month, year } = req.body;

        if (!employee_id || !month || !year) {
            return res.status(400).json({ success: false, message: 'Employee ID, month, and year are required' });
        }

        // Get employee details
        const employee = await getEmployeeDetails(employee_id);
        if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

        // Self-service: an employee can generate their OWN slip any time, no admin approval
        // needed — but only for a cycle that has actually finished (their joining month
        // through last month), never the in-progress current cycle or a future one. Ownership
        // of employee_id is enforced by the isOwnDataOrAdmin route middleware; this is the
        // month-range check, which only applies to non-admin callers — admins keep their
        // existing unrestricted ability to generate/preview any month (including mid-cycle).
        const isAdminCaller = ['admin', 'sub_admin', 'hr'].includes(req.user?.role);
        if (!isAdminCaller) {
            const reqMonth = parseInt(month), reqYear = parseInt(year);
            const today = new Date();

            if (employee.joining_date) {
                const joinDate = new Date(employee.joining_date);
                const joiningMonthStart = new Date(joinDate.getFullYear(), joinDate.getMonth(), 1);
                const requestedMonthStart = new Date(reqYear, reqMonth - 1, 1);
                if (requestedMonthStart < joiningMonthStart) {
                    return res.status(400).json({
                        success: false,
                        message: `You cannot generate a salary slip for a month before your joining date (${joinDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })})`,
                    });
                }
            }

            // Cycle for the requested month ends on the 25th; only allow generating it from
            // the 27th onward (after cycle end), so the in-progress current cycle
            // is never self-serviceable — matches the frontend's isMonthEligible rule exactly.
            const allowFrom = new Date(reqYear, reqMonth - 1, 27);
            if (today < allowFrom) {
                return res.status(400).json({
                    success: false,
                    message: `Salary slip for this month is not available yet — it becomes available on the 27th, once the pay cycle has fully closed.`,
                });
            }
        }

        // Get cycle dates
        const cycle = getCycleDates(parseInt(month), parseInt(year));

        // Check if salary slip already exists
        // Preserve any manually-set OT (from Payroll Adjustment) before deleting
        // Use limit(1) instead of maybeSingle() to avoid errors when duplicate rows exist
        const { data: slipList } = await supabase
            .from('salary_slips').select('id, overtime_amount')
            .eq('employee_id', employee_id).eq('month', month).eq('year', year)
            .order('generated_date', { ascending: false })
            .limit(1);
        const existingSlip = slipList?.[0] || null;

        // null = no prior slip → use attendance OT for first-time generation.
        // number (even 0) = prior slip had this OT → use exactly, so admin setting 0 is respected.
        const preservedOtAmount = existingSlip !== null
            ? parseFloat(existingSlip.overtime_amount ?? 0)
            : null;

        // Delete ALL rows for this month to prevent duplicates accumulating
        await supabase.from('salary_slips').delete()
            .eq('employee_id', employee_id).eq('month', month).eq('year', year);

        const monthlySalary = parseFloat(employee.gross_salary ?? employee.salary ?? employee.in_hand_salary ?? 0);
        const joiningDate   = employee.joining_date ? new Date(employee.joining_date) : null;

        // Full-cycle weekdays determine the rate; joining only limits eligible days.
        const totalWorkingDays = calculateWorkingDaysInCycle(cycle.startDate, cycle.endDate);
        const eligibleWorkingDays = calculateWorkingDaysInCycle(cycle.startDate, cycle.endDate, joiningDate);
        const perDaySalary = totalWorkingDays > 0 ? monthlySalary / totalWorkingDays : 0;

        // ── 3. Attendance & leave data ──
        const attendanceRecords = await getAttendanceRecords(employee_id, cycle.startDateStr, cycle.endDateStr);
        const leaveRecords      = await getApprovedLeaves(employee_id, cycle.startDateStr, cycle.endDateStr);

        // If 0 records, treat as fully absent (all working days deducted).
        // This allows slips to generate for months where admin marked attendance
        // outside the normal import flow or where records were just entered.

        // ── 4. Count company holidays (weekdays only) in cycle ──
        // Holidays are treated as present days (not deducted). Capped at today so a slip
        // generated mid-cycle doesn't pre-credit a holiday that hasn't happened yet — kept
        // in sync with calculateAttendanceSummary's own today-cap below.
        const todayForCycle = new Date();
        todayForCycle.setHours(0, 0, 0, 0);
        const holidayCountEndDateStr = cycle.endDate > todayForCycle
            ? `${todayForCycle.getFullYear()}-${String(todayForCycle.getMonth() + 1).padStart(2, '0')}-${String(todayForCycle.getDate()).padStart(2, '0')}`
            : cycle.endDateStr;
        // HR/Admin-declared holidays (the Attendance Reports "HOL" button) for this cycle —
        // additive to the static calendar checked inside countHolidaysInCycle/
        // calculateAttendanceSummary themselves.
        const dbHolidaysForCycle = await CompanyHolidayService.getHolidaysInRange(cycle.startDateStr, cycle.endDateStr);
        const extraHolidaysMap = new Map(dbHolidaysForCycle.map(h => [h.holiday_date, h.name]));
        const { holidayDays, holidayNames } = countHolidaysInCycle(joiningDate && joiningDate > cycle.startDate ? employee.joining_date.slice(0, 10) : cycle.startDateStr, holidayCountEndDateStr, extraHolidaysMap);

        // ── 5. Calculate attendance summary ──
        const summary = calculateAttendanceSummary(
            attendanceRecords, leaveRecords,
            cycle.startDateStr, cycle.endDateStr,
            joiningDate, extraHolidaysMap
        );

        // Holidays are credited once in paidLeaveDays. Future days are not earned.
        const totalPaidDays = Math.min(eligibleWorkingDays, summary.presentDays + summary.paidLeaveDays);
        const deductibleDays = summary.absentDays + summary.unpaidLeaveDays + summary.halfDays * 0.5;
        const pay = calculateProratedPay(monthlySalary, totalWorkingDays,
            Math.min(eligibleWorkingDays, totalPaidDays + deductibleDays), deductibleDays);
        const basicSalary = pay.basicSalary;
        const effectiveUnpaidDeduction = pay.unpaidDeduction;

        // OT: if a prior slip exists, use its overtime_amount exactly (including 0 to respect admin override).
        // For first-time generation (no existing slip), derive OT from attendance records.
        const attendanceOtAmount = parseFloat((summary.totalOvertimeAmount || 0).toFixed(2));
        const attendanceOtHours  = parseFloat((summary.totalOvertimeHours  || 0).toFixed(2));
        const overtimeAmount     = parseFloat(
            (preservedOtAmount !== null ? preservedOtAmount : attendanceOtAmount).toFixed(2)
        );
        const overtimeHours      = overtimeAmount === attendanceOtAmount
            ? attendanceOtHours
            : parseFloat((overtimeAmount / 150).toFixed(2));

        // Fixed deduction: DT ₹200 before May 2026; PF (per employee) + PT + Professional Tax from May 2026 onwards
        const isPFApplicable = parseInt(year) > 2026 || (parseInt(year) === 2026 && parseInt(month) >= 5);
        const pfAmount = isPFApplicable ? (employee.pf_amount != null ? parseInt(employee.pf_amount) : 1800) : 0;
        // PT no longer auto-defaults to ₹200 — admin must explicitly set it (PF/PT tab); unset = 0.
        const ptAmount = 0;
        // Professional Tax is the single tax deduction; legacy pt_amount is not charged.
        const professionalTaxAmount = isPFApplicable ? (employee.professional_tax_amount != null ? parseInt(employee.professional_tax_amount) : 0) : 0;
        const dtDeduction = basicSalary > 0 ? (isPFApplicable ? pfAmount + ptAmount + professionalTaxAmount : 200) : 0;

        // Custom admin deductions for this employee/month/year
        const customDeduction = parseFloat((await getDeductionTotal(employee_id, month, year)).toFixed(2));

        // Net salary
        const netSalary = parseFloat(Math.max(0, basicSalary + overtimeAmount - effectiveUnpaidDeduction - dtDeduction - customDeduction).toFixed(2));

        const salaryData = {
            employee_id,
            month:              parseInt(month),
            year:               parseInt(year),
            cycle_start_date:   cycle.startDateStr,
            cycle_end_date:     cycle.endDateStr,
            monthly_salary:     monthlySalary,
            per_day_salary:     parseFloat(perDaySalary.toFixed(2)),
            total_working_days: totalWorkingDays,
            present_days:       summary.presentDays,
            half_days:          summary.halfDays,
            absent_days:        summary.absentDays,
            paid_leave_days:    summary.paidLeaveDays,
            unpaid_leave_days:  summary.unpaidLeaveDays,
            // Loss of pay is subtracted once from the eligible prorated salary.
            unpaid_deduction:   effectiveUnpaidDeduction,
            basic_salary:       basicSalary,
            overtime_hours:     overtimeHours,
            overtime_amount:    overtimeAmount,
            dt:                 dtDeduction,
            custom_deduction:   customDeduction,
            net_salary:         netSalary,
            generated_date:     new Date().toISOString(),
            is_paid:            false
        };

        console.log('📝 Salary calculation (Actual cycle working days):', {
            monthlySalary,
            cycleStart: cycle.startDateStr, cycleEnd: cycle.endDateStr,
            totalWorkingDays, perDaySalary: perDaySalary.toFixed(2),
            presentDays: summary.presentDays, halfDays: summary.halfDays,
            absentDays: summary.absentDays, paidLeaveDays: summary.paidLeaveDays,
            unpaidLeaveDays: summary.unpaidLeaveDays,
            holidayDays, holidayNames,
            totalPaidDays, basicSalary,
            overtimeHours, overtimeAmount, dtDeduction, netSalary
        });

        let { data: salarySlip, error: insertError } = await supabase
            .from('salary_slips').insert([salaryData]).select().single();

        // present_days/half_days/absent_days/total_working_days are INTEGER on some DBs
        // (not yet migrated to NUMERIC — see scripts/widen-salary-slips-day-columns.sql).
        // Half-day attendance produces genuinely fractional values (e.g. 9.5 present days),
        // which those columns reject outright. Retry with rounded values rather than hard-
        // failing generation — but flag it clearly, since rounding does lose precision until
        // the migration is run.
        let roundedFallbackUsed = false;
        if (insertError && /invalid input syntax for type integer/i.test(insertError.message || '')) {
            roundedFallbackUsed = true;
            const roundedData = {
                ...salaryData,
                present_days: Math.round(salaryData.present_days),
                half_days: Math.round(salaryData.half_days),
                absent_days: Math.round(salaryData.absent_days),
                total_working_days: Math.round(salaryData.total_working_days),
            };
            ({ data: salarySlip, error: insertError } = await supabase
                .from('salary_slips').insert([roundedData]).select().single());
        }

        if (insertError) {
            console.error('❌ Insert error:', insertError);
            return res.status(500).json({ success: false, message: 'Failed to insert salary slip', error: insertError.message });
        }

        res.json({
            success: true,
            message: roundedFallbackUsed
                ? 'Salary slip generated (day counts rounded to whole numbers — run scripts/widen-salary-slips-day-columns.sql for exact half-day precision)'
                : 'Salary slip generated successfully',
            salarySlip,
            ...(roundedFallbackUsed ? { warning: 'day_columns_not_migrated' } : {}),
        });

    } catch (error) {
        console.error('❌ Error generating salary slip:', error);
        res.status(500).json({ success: false, message: 'Failed to generate salary slip', error: error.message });
    }
};
// Get salary slips for employee
exports.getEmployeeSalarySlips = async (req, res) => {
    try {
        const { employee_id } = req.params;

        const { data: allSlips, error } = await supabase
            .from('salary_slips')
            .select('*')
            .eq('employee_id', employee_id)
            .order('year', { ascending: false })
            .order('month', { ascending: false })
            .order('generated_date', { ascending: false });

        if (error) throw error;

        // Deduplicate: keep only the most-recently-generated slip per month/year
        const seen = new Set();
        const salarySlips = (allSlips || []).filter(s => {
            const key = `${s.year}-${s.month}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        // Get employee joining info
        const { data: employee, error: empError } = await supabase
            .from('employees')
            .select('joining_date')
            .eq('employee_id', employee_id)
            .single();

        let joiningInfo = null;
        if (employee && !empError) {
            const joiningDate = new Date(employee.joining_date);
            joiningInfo = {
                year: joiningDate.getFullYear(),
                month: joiningDate.getMonth() + 1,
                formattedDate: joiningDate.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                })
            };
        }

        res.json({
            success: true,
            salarySlips,
            joiningInfo
        });

    } catch (error) {
        console.error('Error fetching salary slips:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch salary slips',
            error: error.message
        });
    }
};

// Get salary slip by ID
exports.getSalarySlipById = async (req, res) => {
    try {
        const { id } = req.params;

        const { data: slips, error } = await supabase
            .from('salary_slips')
            .select('*')
            .eq('id', id);

        if (error) throw error;

        if (!slips || slips.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Salary slip not found'
            });
        }

        res.json({
            success: true,
            salarySlip: slips[0]
        });

    } catch (error) {
        console.error('Error fetching salary slip:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch salary slip',
            error: error.message
        });
    }
};

// Get salary slip by month and year
exports.getSalarySlipByMonth = async (req, res) => {
    try {
        const { employee_id, month, year } = req.params;

        const { data: slips, error } = await supabase
            .from('salary_slips')
            .select('*')
            .eq('employee_id', employee_id)
            .eq('month', parseInt(month))
            .eq('year', parseInt(year));

        if (error) throw error;

        if (!slips || slips.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Salary slip not found for this month'
            });
        }

        res.json({
            success: true,
            salarySlip: slips[0]
        });

    } catch (error) {
        console.error('Error fetching salary slip:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch salary slip',
            error: error.message
        });
    }
};

// Generate bulk salary slips
exports.generateBulkSalarySlips = async (req, res) => {
    try {
        const { month, year, employee_ids } = req.body;

        // Only active, non-excluded employees are ever eligible for bulk generation —
        // enforced here server-side so exclusion can't be bypassed by frontend state,
        // and so inactive employees (a latent bug — this used to have no filter at all)
        // never get slips generated.
        let query = supabase
            .from('employees')
            .select('employee_id')
            .eq('is_active', true)
            .eq('exclude_from_payroll', false);
        if (Array.isArray(employee_ids) && employee_ids.length > 0) {
            query = query.in('employee_id', employee_ids);
        }

        let { data: employees, error: empError } = await query;

        if (empError && /exclude_from_payroll|does not exist/i.test(empError.message || '')) {
            // exclude_from_payroll not migrated yet on this DB — fall back without it.
            let fallbackQuery = supabase.from('employees').select('employee_id').eq('is_active', true);
            if (Array.isArray(employee_ids) && employee_ids.length > 0) {
                fallbackQuery = fallbackQuery.in('employee_id', employee_ids);
            }
            ({ data: employees, error: empError } = await fallbackQuery);
        }

        if (empError) throw empError;

        const results = [];

        for (const emp of employees || []) {
            try {
                const { data: existing } = await supabase
                    .from('salary_slips')
                    .select('*')
                    .eq('employee_id', emp.employee_id)
                    .eq('month', month)
                    .eq('year', year);

                if (!existing || existing.length === 0) {
                    // This whole endpoint is already isAdmin-gated at the route level, so the
                    // delegated call must carry that same admin identity through — otherwise
                    // generateSalarySlip's self-service month-eligibility check (joining month
                    // through last completed cycle only) would wrongly apply to admin bulk runs
                    // too, blocking generation for the current in-progress cycle.
                    const genReq = { body: { employee_id: emp.employee_id, month, year }, user: req.user };
                    const genRes = { json: (data) => results.push({ employee_id: emp.employee_id, ...data }), status: () => genRes };
                    await exports.generateSalarySlip(genReq, genRes);
                } else {
                    results.push({ employee_id: emp.employee_id, status: 'already_exists' });
                }
            } catch (empError) {
                results.push({ employee_id: emp.employee_id, status: 'failed', error: empError.message });
            }
        }

        res.json({
            success: true,
            message: 'Bulk salary slip generation completed',
            results
        });

    } catch (error) {
        console.error('Error generating bulk salary slips:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate bulk salary slips',
            error: error.message
        });
    }
};

// Mark salary as paid
exports.markAsPaid = async (req, res) => {
    try {
        const { id } = req.params;
        const { payment_mode, notes } = req.body;

        const { data, error } = await supabase
            .from('salary_slips')
            .update({
                is_paid: true,
                payment_date: new Date().toISOString().split('T')[0],
                payment_mode,
                notes,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select();

        if (error) throw error;

        if (!data || data.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Salary slip not found'
            });
        }

        res.json({
            success: true,
            message: 'Salary marked as paid',
            salarySlip: data[0]
        });

    } catch (error) {
        console.error('Error marking salary as paid:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to mark salary as paid',
            error: error.message
        });
    }
};

// Delete salary slip
exports.deleteSalarySlip = async (req, res) => {
    try {
        const { id } = req.params;

        const { data, error } = await supabase
            .from('salary_slips')
            .delete()
            .eq('id', id)
            .select();

        if (error) throw error;

        if (!data || data.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Salary slip not found'
            });
        }

        res.json({
            success: true,
            message: 'Salary slip deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting salary slip:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete salary slip',
            error: error.message
        });
    }
};

// Get salary statistics
exports.getSalaryStatistics = async (req, res) => {
    try {
        const { year, month } = req.query;

        let query = supabase
            .from('salary_slips')
            .select('*');

        if (year) {
            query = query.eq('year', year);
        }
        if (month) {
            query = query.eq('month', month);
        }

        const { data: slips, error } = await query;

        if (error) throw error;

        const totalEmployees = new Set(slips?.map(s => s.employee_id)).size;
        const totalSalary = slips?.reduce((sum, s) => sum + (parseFloat(s.net_salary) || 0), 0) || 0;
        const paidCount = slips?.filter(s => s.is_paid).length || 0;
        const unpaidCount = slips?.filter(s => !s.is_paid).length || 0;

        res.json({
            success: true,
            statistics: {
                total_employees: totalEmployees,
                total_slips: slips?.length || 0,
                total_salary: totalSalary.toFixed(2),
                paid_count: paidCount,
                unpaid_count: unpaidCount
            }
        });

    } catch (error) {
        console.error('Error fetching salary statistics:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch salary statistics',
            error: error.message
        });
    }
};

// Update salary slip
exports.updateSalarySlip = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        delete updates.id;
        delete updates.employee_id;
        delete updates.generated_date;
        updates.updated_at = new Date().toISOString();

        const { data, error } = await supabase
            .from('salary_slips')
            .update(updates)
            .eq('id', id)
            .select();

        if (error) throw error;

        if (!data || data.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Salary slip not found'
            });
        }

        res.json({
            success: true,
            message: 'Salary slip updated successfully',
            salarySlip: data[0]
        });

    } catch (error) {
        console.error('Error updating salary slip:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update salary slip',
            error: error.message
        });
    }
};

// ══════════════════════════════════════════════════════════════════════════════
// Salary Earned Adjustment — helpers + endpoints
// ══════════════════════════════════════════════════════════════════════════════

// Parse numeric shift hours from a string like "9:00 AM - 6:00 PM"
const parseShiftHours = (shiftTiming) => {
    try {
        if (!shiftTiming) return 8;
        const parts = shiftTiming.split('-').map(s => s.trim());
        if (parts.length < 2) return 8;
        const toMinutes = (str) => {
            const [time, period] = str.trim().split(' ');
            let [h, m] = (time || '').split(':').map(Number);
            h = h || 0; m = m || 0;
            if ((period || '').toUpperCase() === 'PM' && h !== 12) h += 12;
            if ((period || '').toUpperCase() === 'AM' && h === 12) h = 0;
            return h * 60 + m;
        };
        const diff = toMinutes(parts[1]) - toMinutes(parts[0]);
        return diff > 0 ? parseFloat((diff / 60).toFixed(2)) : 8;
    } catch { return 8; }
};

// Core adjustment calculation — mirrors frontend live calc exactly
const calcAdjustment = (monthlySalary, salaryEarned, totalWorkingDays, shiftHours) => {
    const monthly  = parseFloat(monthlySalary)    || 0;
    const earned   = parseFloat(salaryEarned) >= 0 ? parseFloat(parseFloat(salaryEarned).toFixed(2)) : monthly;
    const wDays    = parseFloat(totalWorkingDays)  || 22;
    const sHours   = parseFloat(shiftHours)        || 8;

    const difference = parseFloat((earned - monthly).toFixed(2));

    let adjOvertimeAmount  = 0;
    let adjDeductionAmount = 0;
    if (difference > 0)      adjOvertimeAmount  = parseFloat(difference.toFixed(2));
    else if (difference < 0) adjDeductionAmount = parseFloat(Math.abs(difference).toFixed(2));

    const perDaySalary    = wDays  > 0 ? monthly / wDays  : 0;
    const perHourSalary   = sHours > 0 ? perDaySalary / sHours : 0;
    const adjOvertimeHours = perHourSalary > 0
        ? parseFloat((adjOvertimeAmount / perHourSalary).toFixed(2))
        : 0;

    const finalPayableSalary = parseFloat(
        Math.max(0, monthly + adjOvertimeAmount - adjDeductionAmount).toFixed(2)
    );

    return {
        salary_earned:        parseFloat(earned.toFixed(2)),
        earned_difference:    difference,
        adj_overtime_amount:  adjOvertimeAmount,
        adj_overtime_hours:   adjOvertimeHours,
        adj_deduction_amount: adjDeductionAmount,
        final_payable_salary: finalPayableSalary,
    };
};

// POST /api/salary/adjustment — save salary earned OR overtime for one employee + month
// Payroll edits affect the selected salary slip, not source attendance records.
async function savePayrollOverrides(req, res) {
    try {
        if (!['admin', 'sub_admin', 'hr'].includes(req.user?.role)) return res.status(403).json({ success: false, message: 'HR/admin access required' });
        const b = req.body;
        const fields = ['present_days', 'absent_days', 'half_days', 'pf_amount', 'professional_tax_amount', 'salary_earned', 'deduction', 'final_payable'];
        if (!b.employee_id || !Number.isInteger(Number(b.month)) || Number(b.month) < 1 || Number(b.month) > 12 || !Number.isInteger(Number(b.year)) || Number(b.year) < 2000) return res.status(400).json({ success: false, message: 'Valid employee, month and year required' });
        for (const field of fields) {
            if (b[field] === '' || b[field] == null || !Number.isFinite(Number(b[field])) || Number(b[field]) < 0) return res.status(400).json({ success: false, message: field + ' must be a non-negative number' });
        }
        const employee = await getEmployeeDetails(b.employee_id);
        const cycle = getCycleDates(Number(b.month), Number(b.year));
        const wd = countWeekdays(cycle.startDate, cycle.endDate);
        const eligible = countWeekdays(cycle.startDate, cycle.endDate, employee.joining_date);
        const present = Number(b.present_days), absent = Number(b.absent_days), half = Number(b.half_days);
        if (!Number.isInteger(half) || present + absent + half * 0.5 > eligible || present < half * 0.5) return res.status(400).json({ success: false, message: 'Day counts exceed eligible weekdays. Present includes half-day credits; Half Day must be a whole count.' });
        const { data: slips, error: readError } = await supabase.from('salary_slips').select('*').eq('employee_id', b.employee_id).eq('month', Number(b.month)).eq('year', Number(b.year)).order('generated_date', { ascending: false }).limit(1);
        if (readError) throw readError;
        const old = slips?.[0];
        if (old?.is_paid) return res.status(409).json({ success: false, message: 'A paid salary slip cannot be edited' });
        const monthly = Number(employee.gross_salary ?? employee.salary ?? employee.in_hand_salary ?? 0);
        const pf = Number(b.pf_amount), tax = Number(b.professional_tax_amount);
        const fixed = Number(b.year) > 2026 || (Number(b.year) === 2026 && Number(b.month) >= 5) ? pf + tax : 200;
        const deduction = Number(b.deduction);
        const custom = Number(await getDeductionTotal(b.employee_id, b.month, b.year));
        const net = Number(b.final_payable);
        // Final Payable is authoritative; reconcile earnings so the printed totals agree.
        const earned = Number((net + fixed + deduction + custom).toFixed(2));
        const overtime = Math.max(0, earned - monthly);
        const shift = Number(b.shift_hours || 8);
        if (!Number.isFinite(shift) || shift <= 0 || shift > 24) return res.status(400).json({ success: false, message: 'Shift hours must be between 0 and 24' });
        const payload = {
            employee_id: b.employee_id, month: Number(b.month), year: Number(b.year),
            cycle_start_date: cycle.startDateStr, cycle_end_date: cycle.endDateStr,
            monthly_salary: monthly, total_working_days: wd, per_day_salary: wd ? Number((monthly / wd).toFixed(2)) : 0,
            present_days: present, absent_days: absent, half_days: half,
            paid_leave_days: old?.paid_leave_days ?? 0, unpaid_leave_days: old?.unpaid_leave_days ?? 0,
            basic_salary: Number((earned - overtime).toFixed(2)), overtime_amount: Number(overtime.toFixed(2)),
            overtime_hours: monthly && wd ? Number((overtime / (monthly / wd / shift)).toFixed(2)) : 0,
            unpaid_deduction: deduction, dt: fixed, custom_deduction: custom, net_salary: net,
            is_paid: false, generated_date: new Date().toISOString(),
        };
        const { error: employeeError } = await supabase.from('employees').update({ pf_amount: pf, professional_tax_amount: tax }).eq('employee_id', b.employee_id);
        if (employeeError) throw employeeError;
        const extended = { ...payload, salary_earned: earned, earned_difference: earned - monthly,
            adj_deduction_amount: deduction, adj_overtime_amount: overtime, adj_overtime_hours: payload.overtime_hours,
            final_payable_salary: net, shift_hours: shift };
        const save = values => (old ? supabase.from('salary_slips').update(values).eq('id', old.id) : supabase.from('salary_slips').insert([values])).select().single();
        let { data, error } = await save(extended);
        if (error && /does not exist|schema cache/i.test(error.message || '')) ({ data, error } = await save(payload));
        if (error) throw error;
        return res.json({ success: true, salarySlip: data, message: 'Payroll changes saved' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to save payroll changes', error: error.message });
    }
}

exports.saveSalaryAdjustment = async (req, res) => {
    if (req.body.payroll_edit === true) return savePayrollOverrides(req, res);
    try {
        const { employee_id, month, year, salary_earned, shift_hours, overtime_amount } = req.body;

        if (!employee_id || !month || !year) {
            return res.status(400).json({ success: false, message: 'employee_id, month and year are required' });
        }

        // ── OT-DIRECT MODE ───────────────────────────────────────────────────────
        // When overtime_amount is passed directly (₹150/hr rate),
        // we bypass the salary_earned→diff calculation and update OT fields only.
        if (overtime_amount !== undefined) {
            const otAmount = Math.max(0, parseFloat(overtime_amount) || 0);
            const otHours  = parseFloat((otAmount / 150).toFixed(2));

            const employee = await getEmployeeDetails(employee_id);
            if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });
            const monthlySalary = parseFloat(employee.gross_salary ?? employee.salary ?? employee.in_hand_salary ?? 0);
            const isPFApplicableOT = parseInt(year) > 2026 || (parseInt(year) === 2026 && parseInt(month) >= 5);
            const pfAmountOT = isPFApplicableOT ? (employee.pf_amount != null ? parseInt(employee.pf_amount) : 1800) : 0;
            const ptAmountOT = 0;
            const professionalTaxAmountOT = isPFApplicableOT ? (employee.professional_tax_amount != null ? parseInt(employee.professional_tax_amount) : 0) : 0;
            const dt = monthlySalary > 0 ? (isPFApplicableOT ? pfAmountOT + ptAmountOT + professionalTaxAmountOT : 200) : 0;

            // Use limit(1) to avoid maybeSingle() error when duplicate rows exist
            const { data: slipRows } = await supabase
                .from('salary_slips')
                .select('id, basic_salary, net_salary, unpaid_deduction, custom_deduction')
                .eq('employee_id', employee_id)
                .eq('month', parseInt(month))
                .eq('year',  parseInt(year))
                .order('generated_date', { ascending: false })
                .limit(1);
            const existingSlip = slipRows?.[0] || null;

            const basicSalary = parseFloat(existingSlip?.basic_salary || 0);
            // Must carry forward whatever unpaid/custom deductions the slip already had —
            // recomputing net_salary from basicSalary + otAmount − dt alone (as this used to)
            // silently dropped both, so saving OT could make a slip's payable amount go back
            // UP even though nothing about the employee's absences or admin deductions changed.
            const existingUnpaidDeduction = parseFloat(existingSlip?.unpaid_deduction || 0);
            const existingCustomDeduction = parseFloat(existingSlip?.custom_deduction || 0);
            const netSalary = parseFloat(Math.max(0, basicSalary + otAmount - existingUnpaidDeduction - dt - existingCustomDeduction).toFixed(2));

            const otPayload = {
                overtime_amount: otAmount,
                overtime_hours:  otHours,
                net_salary:      netSalary,
                updated_at:      new Date().toISOString(),
            };

            let resultSlip;
            if (existingSlip) {
                const { data, error } = await supabase
                    .from('salary_slips')
                    .update(otPayload)
                    .eq('id', existingSlip.id)
                    .select()
                    .single();
                if (error) throw error;
                resultSlip = data;
            } else {
                // No slip yet — create a minimal stub so OT is persisted
                const cycle = getCycleDates(parseInt(month), parseInt(year));
                const joiningDateOT = employee.joining_date ? new Date(employee.joining_date) : null;
                const totalWD = calculateWorkingDaysInCycle(cycle.startDate, cycle.endDate, joiningDateOT);
                const { data, error } = await supabase
                    .from('salary_slips')
                    .insert([{
                        employee_id,
                        month:              parseInt(month),
                        year:               parseInt(year),
                        cycle_start_date:   cycle.startDateStr,
                        cycle_end_date:     cycle.endDateStr,
                        monthly_salary:     monthlySalary,
                        total_working_days: totalWD,
                        per_day_salary:     totalWD > 0 ? parseFloat((monthlySalary / totalWD).toFixed(2)) : 0,
                        present_days:       0,
                        half_days:          0,
                        absent_days:        0,
                        paid_leave_days:    0,
                        unpaid_leave_days:  0,
                        unpaid_deduction:   0,
                        basic_salary:       0,
                        overtime_amount:    otAmount,
                        overtime_hours:     otHours,
                        dt,
                        net_salary:         netSalary,
                        is_paid:            false,
                        generated_date:     new Date().toISOString(),
                    }])
                    .select()
                    .single();
                if (error) throw error;
                resultSlip = data;
            }

            return res.json({
                success: true,
                message: `Overtime ₹${otAmount} (${otHours} hrs) saved`,
                salarySlip: resultSlip,
            });
        }
        // ── END OT-DIRECT MODE ───────────────────────────────────────────────────
        if (salary_earned !== undefined && parseFloat(salary_earned) < 0) {
            return res.status(400).json({ success: false, message: 'Salary earned cannot be negative' });
        }

        const employee = await getEmployeeDetails(employee_id);
        if (!employee) {
            return res.status(404).json({ success: false, message: 'Employee not found' });
        }

        const monthlySalary = parseFloat(employee.gross_salary ?? employee.salary ?? employee.in_hand_salary ?? 0);
        const resolvedShiftHours = parseFloat(shift_hours) > 0
            ? parseFloat(shift_hours)
            : parseShiftHours(employee.shift_timing);

        // Get existing slip for working days
        const { data: existingSlip } = await supabase
            .from('salary_slips')
            .select('id, total_working_days')
            .eq('employee_id', employee_id)
            .eq('month', parseInt(month))
            .eq('year',  parseInt(year))
            .maybeSingle();

        const cycle = getCycleDates(parseInt(month), parseInt(year));
                const totalWorkingDays = existingSlip?.total_working_days
            || calculateWorkingDaysInCycle(cycle.startDate, cycle.endDate);

        const earnedValue = salary_earned !== undefined && salary_earned !== ''
            ? parseFloat(salary_earned)
            : monthlySalary;

        const adj = calcAdjustment(monthlySalary, earnedValue, totalWorkingDays, resolvedShiftHours);

        // Calculate absent days implied by the deduction (deduction ÷ per-day rate)
        const perDaySalary = totalWorkingDays > 0 ? monthlySalary / totalWorkingDays : 0;
        const impliedAbsentDays = adj.adj_deduction_amount > 0 && perDaySalary > 0
            ? Math.round(adj.adj_deduction_amount / perDaySalary)
            : 0;

        const isPFApplicableAdj = parseInt(year) > 2026 || (parseInt(year) === 2026 && parseInt(month) >= 5);
        const pfAmountAdj = isPFApplicableAdj ? (employee.pf_amount != null ? parseInt(employee.pf_amount) : 1800) : 0;
        const ptAmountAdj = 0;
        const professionalTaxAmountAdj = isPFApplicableAdj ? (employee.professional_tax_amount != null ? parseInt(employee.professional_tax_amount) : 0) : 0;
        const fixedDeductions = monthlySalary > 0 ? (isPFApplicableAdj ? pfAmountAdj + ptAmountAdj + professionalTaxAmountAdj : 200) : 0;

        // Any admin/custom deductions (late fines, damages, etc.) for this employee/month —
        // must be subtracted here too, exactly like generateSalarySlip does. Without this, a
        // manual salary-earned adjustment silently wiped out a custom deduction from
        // net_salary even though the deduction row itself was untouched.
        const customDeductionAdj = parseFloat((await getDeductionTotal(employee_id, month, year)).toFixed(2));

        // basic_salary = what the employee earned (before fixed deductions)
        // For OT case:  earned(49900) - OT(1900) = monthly(48000) ← base pay
        // For short case: earned(41350) - 0 = 41350 ← reduced pay
        const adjBasicSalary = parseFloat((adj.salary_earned - adj.adj_overtime_amount).toFixed(2));
        const adjNetSalary   = parseFloat(Math.max(0, adj.salary_earned - fixedDeductions - customDeductionAdj).toFixed(2));

        // Core payload — only uses columns that always exist in salary_slips
        // NOTE: absent_days is NOT included here — it stays from generateSalarySlip (attendance-based)
        const corePayload = {
            basic_salary:     adjBasicSalary,
            net_salary:       adjNetSalary,
            overtime_amount:  adj.adj_overtime_amount,
            overtime_hours:   adj.adj_overtime_hours,
            unpaid_deduction: 0,
            dt:               fixedDeductions,
            custom_deduction: customDeductionAdj,
            updated_at:       new Date().toISOString(),
        };

        // Extended payload — uses migration columns; silently skipped if migration not run
        const extPayload = {
            salary_earned:        adj.salary_earned,
            earned_difference:    adj.earned_difference,
            adj_overtime_amount:  adj.adj_overtime_amount,
            adj_overtime_hours:   adj.adj_overtime_hours,
            adj_deduction_amount: adj.adj_deduction_amount,
            final_payable_salary: adj.final_payable_salary,
            shift_hours:          resolvedShiftHours,
        };

        let resultSlip;

        if (existingSlip) {
            // Single combined update (core + extended adj_ columns) so the returned
            // resultSlip always reflects everything that was actually saved, instead of
            // core-only stale data from a separate first call. Falls back to core-only if
            // the extended migration columns don't exist yet on this DB.
            let { data, error } = await supabase
                .from('salary_slips')
                .update({ ...corePayload, ...extPayload })
                .eq('id', existingSlip.id)
                .select()
                .single();
            if (error && /does not exist|schema cache/i.test(error.message || '')) {
                ({ data, error } = await supabase
                    .from('salary_slips')
                    .update(corePayload)
                    .eq('id', existingSlip.id)
                    .select()
                    .single());
            }
            if (error) throw error;
            resultSlip = data;
        } else {
            // No attendance-based slip yet — create a stub with adjustment only
            const totalWD = calculateWorkingDaysInCycle(cycle.startDate, cycle.endDate);
            const impliedPresentDays = Math.max(0, totalWD - impliedAbsentDays);
            const { data, error } = await supabase
                .from('salary_slips')
                .insert([{
                    employee_id,
                    month:              parseInt(month),
                    year:               parseInt(year),
                    cycle_start_date:   cycle.startDateStr,
                    cycle_end_date:     cycle.endDateStr,
                    monthly_salary:     monthlySalary,
                    total_working_days: totalWD,
                    per_day_salary:     totalWD > 0 ? parseFloat((monthlySalary / totalWD).toFixed(2)) : 0,
                    present_days:       impliedPresentDays,
                    half_days:          0,
                    absent_days:        impliedAbsentDays,
                    paid_leave_days:    0,
                    unpaid_leave_days:  0,
                    unpaid_deduction:   0,
                    basic_salary:       adjBasicSalary,
                    overtime_hours:     adj.adj_overtime_hours,
                    overtime_amount:    adj.adj_overtime_amount,
                    dt:                 fixedDeductions,
                    custom_deduction:   customDeductionAdj,
                    net_salary:         adjNetSalary,
                    is_paid:            false,
                    generated_date:     new Date().toISOString(),
                }])
                .select()
                .single();
            if (error) throw error;
            resultSlip = data;
        }

        res.json({ success: true, message: 'Salary adjustment saved', salarySlip: resultSlip, adjustment: adj });

    } catch (error) {
        console.error('Error saving salary adjustment:', error?.message, error?.code, error?.details, error?.hint);
        res.status(500).json({
            success: false,
            message: 'Failed to save salary adjustment',
            error: error?.message,
            code: error?.code,
            details: error?.details,
        });
    }
};

// GET /api/salary/bulk?month=M&year=YYYY — all employees + their adjustment data
exports.getBulkPayroll = async (req, res) => {
    try {
        const { month, year } = req.query;
        if (!month || !year) {
            return res.status(400).json({ success: false, message: 'month and year are required' });
        }

        const EMP_FIELDS_FULL = 'id, employee_id, first_name, last_name, designation, department, in_hand_salary, gross_salary, shift_timing, is_active, joining_date, reporting_manager, pf_amount, pt_amount, professional_tax_amount, exclude_from_payroll';
        const EMP_FIELDS_NO_PROF_EXCL = 'id, employee_id, first_name, last_name, designation, department, in_hand_salary, gross_salary, shift_timing, is_active, joining_date, reporting_manager, pf_amount, pt_amount';
        const EMP_FIELDS_BASE = 'id, employee_id, first_name, last_name, designation, department, in_hand_salary, gross_salary, shift_timing, is_active, joining_date, reporting_manager, pf_amount';

        // employees.professional_tax_amount / exclude_from_payroll / pt_amount may not be
        // migrated on this DB yet — cascading fallback so the page still loads either way.
        const fetchEmployees = async () => {
            let { data, error } = await supabase.from('employees').select(EMP_FIELDS_FULL)
                .eq('is_active', true).order('first_name', { ascending: true });
            if (error && /professional_tax_amount|exclude_from_payroll|does not exist/i.test(error.message || '')) {
                ({ data, error } = await supabase.from('employees').select(EMP_FIELDS_NO_PROF_EXCL)
                    .eq('is_active', true).order('first_name', { ascending: true }));
            }
            if (error && /pt_amount|does not exist/i.test(error.message || '')) {
                ({ data, error } = await supabase.from('employees').select(EMP_FIELDS_BASE)
                    .eq('is_active', true).order('first_name', { ascending: true }));
            }
            if (error) throw error;
            return data || [];
        };

        const [employees, { data: slips, error: slipErr }, { data: deductionRows, error: dedErr }] = await Promise.all([
            fetchEmployees(),
            supabase
                .from('salary_slips')
                .select('*')
                .eq('month', parseInt(month))
                .eq('year',  parseInt(year)),
            supabase
                .from('salary_deductions')
                .select('*')
                .eq('month', parseInt(month))
                .eq('year',  parseInt(year)),
        ]);

        if (slipErr) throw slipErr;
        if (dedErr) throw dedErr;

        const slipMap = {};
        (slips || []).forEach(s => { slipMap[s.employee_id] = s; });

        // Deductions are stored as one row per line item (an employee can have several —
        // e.g. a late fine + a damage charge in the same cycle). Group + sum them here so
        // both Payroll Preview and the Excel export always show the true current total —
        // a generated slip only snapshots custom_deduction at generation time, so trusting
        // that alone goes stale the moment a deduction is added/edited/deleted afterward.
        const deductionsByEmployee = {};
        (deductionRows || []).forEach(d => {
            if (!deductionsByEmployee[d.employee_id]) deductionsByEmployee[d.employee_id] = [];
            deductionsByEmployee[d.employee_id].push(d);
        });

        const cycle = getCycleDates(parseInt(month), parseInt(year));
        const defaultWD = calculateWorkingDaysInCycle(cycle.startDate, cycle.endDate);

        // HR/Admin-declared holidays (the Attendance Reports "HOL" button) for this cycle —
        // fetched once for every employee below, same as generateSalarySlip.
        const dbHolidaysForCycle = await CompanyHolidayService.getHolidaysInRange(cycle.startDateStr, cycle.endDateStr);
        const extraHolidaysMap = new Map(dbHolidaysForCycle.map(h => [h.holiday_date, h.name]));

        // Attendance summary per employee for this cycle — reuses the exact same helpers
        // generateSalarySlip uses, so Payroll Preview numbers are guaranteed to match the
        // slip that would actually be generated (single source of truth, not a second calc).
        const attendanceByEmployee = {};
        await Promise.all(employees.map(async emp => {
            try {
                const joiningDate = emp.joining_date ? new Date(emp.joining_date) : null;
                const [attendanceRecords, leaveRecords] = await Promise.all([
                    getAttendanceRecords(emp.employee_id, cycle.startDateStr, cycle.endDateStr),
                    getApprovedLeaves(emp.employee_id, cycle.startDateStr, cycle.endDateStr),
                ]);
                attendanceByEmployee[emp.employee_id] = calculateAttendanceSummary(
                    attendanceRecords, leaveRecords, cycle.startDateStr, cycle.endDateStr, joiningDate, extraHolidaysMap
                );
            } catch (attErr) {
                console.error(`Error computing attendance summary for ${emp.employee_id}:`, attErr);
                attendanceByEmployee[emp.employee_id] = null;
            }
        }));

        const records = employees.map(emp => {
            const monthlySalary   = parseFloat(emp.gross_salary ?? emp.salary ?? emp.in_hand_salary ?? 0);
            const slip            = slipMap[emp.employee_id] || null;
            // defaultWD (whole cycle, no joining-date adjustment) is only a fallback for
            // employees who joined before this cycle started — a mid-cycle joiner with no
            // slip yet must get their own joining-date-aware count here, otherwise Payroll
            // Preview shows an inflated "Total Working Days" for them (the full cycle instead
            // of just the days since they joined) before a slip has ever been generated.
            const totalWorkingDays = slip?.total_working_days ?? defaultWD;
            const shiftHours      = slip?.shift_hours || parseShiftHours(emp.shift_timing) || 8;
            const attendance      = attendanceByEmployee[emp.employee_id];
            const deductionItems  = deductionsByEmployee[emp.employee_id] || [];
            const liveCustomDeduction = parseFloat(
                deductionItems.reduce((sum, d) => sum + parseFloat(d.amount || 0), 0).toFixed(2)
            );
            const eligibleDays = calculateWorkingDaysInCycle(cycle.startDate, cycle.endDate,
                emp.joining_date ? dateOnly(emp.joining_date) : null);
            const liveLossDays = attendance ? attendance.absentDays + attendance.unpaidLeaveDays + attendance.halfDays * 0.5 : 0;
            const livePaidDays = attendance ? attendance.presentDays + attendance.paidLeaveDays : 0;
            const livePay = calculateProratedPay(monthlySalary, defaultWD,
                Math.min(eligibleDays, livePaidDays + liveLossDays), liveLossDays);
            const fixedApplicable = Number(year) > 2026 || (Number(year) === 2026 && Number(month) >= 5);
            const liveFixed = livePay.basicSalary > 0 ? (fixedApplicable
                ? Number(emp.pf_amount ?? 1800) + Number(emp.professional_tax_amount ?? 0)
                : 200) : 0;
            const liveNet = Number(Math.max(0, livePay.basicSalary - livePay.unpaidDeduction
                + Number(attendance?.totalOvertimeAmount ?? 0) - liveFixed - liveCustomDeduction).toFixed(2));

            let adj;
            if (slip?.salary_earned != null) {
                adj = calcAdjustment(monthlySalary, slip.salary_earned, totalWorkingDays, shiftHours);
                // calcAdjustment's own final_payable_salary is monthly + OT − shortfall only —
                // it has no idea about PF/PT/Professional Tax or admin deductions, so it always
                // comes out higher than what the employee actually gets paid. slip.net_salary
                // (set by saveSalaryAdjustment, which DOES subtract those) is the real figure —
                // prefer it whenever a slip exists, exactly like the no-adjustment branch below
                // already does, so Payroll Preview/Excel never shows a bigger "payable" number
                // than the salary slip PDF for the same employee/month.
                if (slip?.net_salary != null) {
                    adj.final_payable_salary = parseFloat(slip.net_salary);
                    adj.adj_deduction_amount = Number(slip.unpaid_deduction ?? 0);
                }
            } else {
                // No manual adjustment yet — show defaults
                adj = {
                    salary_earned:        slip ? Number(slip.basic_salary ?? monthlySalary) : livePay.basicSalary,
                    earned_difference:    slip ? Number(slip.basic_salary ?? 0) + Number(slip.overtime_amount ?? 0) - monthlySalary : livePay.basicSalary - monthlySalary,
                    adj_overtime_amount:  0,
                    adj_overtime_hours:   0,
                    adj_deduction_amount: Number(slip?.unpaid_deduction ?? livePay.unpaidDeduction),
                    final_payable_salary: slip ? parseFloat(slip.net_salary ?? monthlySalary) : (attendance ? liveNet : null),
                };
            }

            return {
                id:                 emp.id,
                employee_id:        emp.employee_id,
                first_name:         emp.first_name,
                last_name:          emp.last_name,
                designation:        emp.designation || '',
                department:         emp.department  || '',
                reporting_manager:  emp.reporting_manager || '',
                monthly_salary:     monthlySalary,
                shift_hours:        shiftHours,
                total_working_days: totalWorkingDays,
                eligible_working_days: eligibleDays,
                has_slip:           !!slip,
                slip_id:            slip?.id   || null,
                net_salary:         slip?.net_salary != null ? parseFloat(slip.net_salary) : null,
                is_paid:            slip?.is_paid || false,
                basic_salary:       slip?.basic_salary != null ? parseFloat(slip.basic_salary) : null,
                overtime_amount:    slip?.overtime_amount != null ? parseFloat(slip.overtime_amount) : 0,
                dt_deduction:       slip?.dt != null ? parseFloat(slip.dt) : null,
                // Live sum from salary_deductions, not the slip's generation-time snapshot —
                // stays accurate even if a deduction was added/edited after the slip was made.
                custom_deduction:   liveCustomDeduction,
                custom_deduction_stale: slip?.custom_deduction != null && parseFloat(slip.custom_deduction) !== liveCustomDeduction,
                deduction_items:    deductionItems.map(d => ({
                    id: d.id, amount: parseFloat(d.amount || 0), reason: d.reason || '', deduction_date: d.deduction_date || null
                })),
                cycle_start_date:   slip?.cycle_start_date || null,
                cycle_end_date:     slip?.cycle_end_date || null,
                generated_date:     slip?.generated_date || null,
                pf_amount:                emp.pf_amount != null ? parseFloat(emp.pf_amount) : null,
                pt_amount:                emp.pt_amount != null ? parseFloat(emp.pt_amount) : null,
                professional_tax_amount:  emp.professional_tax_amount != null ? parseFloat(emp.professional_tax_amount) : null,
                exclude_from_payroll:     Boolean(emp.exclude_from_payroll),
                present_days:       slip?.present_days ?? (attendance ? attendance.presentDays : null),
                half_days:          slip?.half_days ?? (attendance ? attendance.halfDays : null),
                absent_days:        slip?.absent_days ?? (attendance ? attendance.absentDays : null),
                paid_leave_days:    attendance ? attendance.paidLeaveDays : null,
                unpaid_leave_days:  attendance ? attendance.unpaidLeaveDays : null,
                ...adj,
            };
        });

        res.json({ success: true, month: parseInt(month), year: parseInt(year), records });

    } catch (error) {
        console.error('Error fetching bulk payroll:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch payroll data', error: error.message });
    }
};
