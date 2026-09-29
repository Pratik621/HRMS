const cron = require('node-cron');
const supabase = require('../config/supabase');
const { syncAttendanceForApprovedLeave } = require('../services/leaveAttendanceSync');
const { isDateHoliday } = require('../data/holidays');
const CompanyHolidayService = require('../services/companyHolidayService');

// Helper function to get IST date string
const getISTDateString = () => {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
    const istTime = new Date(now.getTime() + istOffset);
    return istTime.toISOString().split('T')[0]; // YYYY-MM-DD format
};

// Helper function to check if date is weekend or holiday.
// NOTE: despite the name, this previously only ever checked weekend — isDateHoliday was
// imported but never actually consulted here, so a company holiday falling on a weekday
// (static calendar or, now, one applied via the Attendance Reports "HOL" button) still got
// every employee marked Absent + an auto-generated Unpaid leave by this nightly job. Now
// checks both the static calendar and the company_holidays table.
const isWeekendOrHoliday = async (dateStr) => {
    const dayOfWeek = new Date(dateStr).getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) return true; // Sunday / Saturday
    if (isDateHoliday(dateStr)) return true;
    return !!(await CompanyHolidayService.getHoliday(dateStr));
};

const isBirthdayToday = (dob, todayStr) => {
    if (!dob) return false;
    const d = new Date(dob);
    const today = new Date(todayStr);
    return d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
};

const isWeekendDate = (dateStr) => {
    const dayOfWeek = new Date(dateStr).getDay();
    return dayOfWeek === 0 || dayOfWeek === 6; // Sunday / Saturday
};

// Priority for the birthday-auto-Present rule: Company Holiday → Weekend → Birthday on a
// working day. A birthday that falls on a holiday or a weekend must NOT auto-mark Present —
// only an actual working-day birthday qualifies. Pure/testable: takes the holiday check as
// a parameter so it doesn't need the real `holidays` data or a live date to be unit tested.
const shouldAutoMarkBirthdayPresent = (dob, todayStr, isHolidayFn = isDateHoliday) => {
    if (!isBirthdayToday(dob, todayStr)) return false;
    if (isHolidayFn(todayStr)) return false;
    if (isWeekendDate(todayStr)) return false;
    return true;
};

// Auto-creates + auto-approves a Birthday Leave record for an employee whose birthday is
// today, if they haven't already applied for/received one this year — mirrors the
// auto-approve behavior in leaveController.applyLeave's Birthday branch so an employee
// never has to remember to apply to get credit for it.
const ensureBirthdayLeave = async (employee, todayStr) => {
    const leaveYear = new Date(todayStr).getFullYear();
    const { data: existing } = await supabase
        .from('leaves')
        .select('id')
        .eq('employee_id', employee.employee_id)
        .eq('leave_type', 'Birthday')
        .gte('start_date', `${leaveYear}-01-01`)
        .lte('start_date', `${leaveYear}-12-31`)
        .in('status', ['pending', 'approved'])
        .maybeSingle();

    if (existing) return null;

    const nowIso = new Date().toISOString();
    const leavePayload = {
        employee_id: employee.employee_id,
        leave_type: 'Birthday',
        leave_duration: 'Full Day',
        start_date: todayStr,
        end_date: todayStr,
        reason: 'Company Birthday Leave',
        days_count: 1,
        status: 'approved',
        applied_date: todayStr,
        approved_date: todayStr,
        approved_by: 'SYSTEM',
        remarks: 'System generated — automatic Birthday Leave',
        created_at: nowIso,
        updated_at: nowIso
    };

    const { data: created, error } = await supabase.from('leaves').insert([leavePayload]).select().maybeSingle();

    if (error) {
        console.error(`❌ Error auto-creating Birthday leave for ${employee.employee_id}:`, error.message);
        return null;
    }
    return created;
};

// Function to mark absent employees and create leave records
const markAbsentEmployeesAsLeave = async () => {
    try {
        console.log('🔄 Starting daily absent employee check...');

        const today = getISTDateString();
        console.log(`📅 Processing date: ${today}`);

        // Skip weekends and holidays (static calendar or HR/Admin-declared via the HOL button)
        if (await isWeekendOrHoliday(today)) {
            console.log('📅 Skipping weekend/holiday');
            return { success: true, message: 'Skipped weekend/holiday' };
        }

        // Get all active employees
        const { data: employees, error: empError } = await supabase
            .from('employees')
            .select('employee_id, first_name, last_name, joining_date, dob')
            .eq('is_active', true);

        if (empError) {
            console.error('❌ Error fetching employees:', empError);
            return { success: false, error: empError.message };
        }

        console.log(`👥 Found ${employees.length} active employees`);

        // Batch-fetch every leave (pending or approved) that covers today, across all
        // employees, so an approved/pending Paid or Birthday leave is never clobbered by
        // this cron marking the day Absent + auto-inserting an Unpaid leave underneath it.
        const { data: todaysLeaves } = await supabase
            .from('leaves')
            .select('employee_id, status, leave_type')
            .lte('start_date', today)
            .gte('end_date', today)
            .in('status', ['pending', 'approved']);
        const leaveByEmployee = {};
        (todaysLeaves || []).forEach(l => { leaveByEmployee[l.employee_id] = l; });

        let absentCount = 0;
        let leaveCreatedCount = 0;
        let skippedCount = 0;
        let birthdayLeaveCount = 0;

        for (const employee of employees) {
            try {
                // Birthday leave is recognized regardless of whether the employee already
                // has an attendance/leave record today — it just shouldn't double-apply.
                // Company Holiday → Weekend → Birthday-on-working-day priority is enforced
                // inside shouldAutoMarkBirthdayPresent (a holiday/weekend birthday must not
                // auto-mark Present). Note: the outer isWeekendOrHoliday check above already
                // skips this whole function on a weekend, so that case is also covered there;
                // the holiday check here is the one that was previously missing entirely.
                if (shouldAutoMarkBirthdayPresent(employee.dob, today)) {
                    const createdBirthdayLeave = await ensureBirthdayLeave(employee, today);
                    if (createdBirthdayLeave) {
                        await syncAttendanceForApprovedLeave(createdBirthdayLeave);
                        birthdayLeaveCount++;
                        console.log(`🎂 ${employee.employee_id} — auto-created Birthday leave for ${today}`);
                        continue;
                    }
                }

                // An approved or pending leave already covers today — approved leaves already
                // got their attendance row written at approval time (leaveAttendanceSync), and
                // a pending one must not be silently overridden by an auto-generated Unpaid leave.
                if (leaveByEmployee[employee.employee_id]) {
                    skippedCount++;
                    continue;
                }

                // Check if employee has attendance record for today
                const { data: attendance, error: attError } = await supabase
                    .from('attendance')
                    .select('id, status, clock_in, attendance_type')
                    .eq('employee_id', employee.employee_id)
                    .eq('attendance_date', today)
                    .maybeSingle();

                if (attError) {
                    console.error(`❌ Error checking attendance for ${employee.employee_id}:`, attError);
                    continue;
                }

                // If no attendance record exists, employee is absent
                if (!attendance) {
                    console.log(`❌ ${employee.employee_id} (${employee.first_name} ${employee.last_name}) - No attendance record`);

                    // Create attendance record with absent status
                    const { error: insertAttError } = await supabase
                        .from('attendance')
                        .insert([{
                            employee_id: employee.employee_id,
                            attendance_date: today,
                            status: 'absent',
                            total_hours: 0,
                            total_minutes: 0,
                            late_minutes: 0,
                            created_at: new Date().toISOString()
                        }]);

                    if (insertAttError) {
                        console.error(`❌ Error creating attendance record for ${employee.employee_id}:`, insertAttError);
                        continue;
                    }

                    absentCount++;

                    // Check if employee already has a leave record for today
                    const { data: existingLeave, error: leaveCheckError } = await supabase
                        .from('leaves')
                        .select('id')
                        .eq('employee_id', employee.employee_id)
                        .eq('start_date', today)
                        .eq('end_date', today)
                        .maybeSingle();

                    if (leaveCheckError) {
                        console.error(`❌ Error checking existing leave for ${employee.employee_id}:`, leaveCheckError);
                        continue;
                    }

                    // If no leave record exists, create one
                    if (!existingLeave) {
                        // IST timestamp for created_at
                        const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
                        const nowUTC = new Date();
                        const istMs = nowUTC.getTime() + IST_OFFSET_MS;
                        const istDate = new Date(istMs);
                        const createdAtIST = `${istDate.getUTCFullYear()}-${String(istDate.getUTCMonth()+1).padStart(2,'0')}-${String(istDate.getUTCDate()).padStart(2,'0')} ${String(istDate.getUTCHours()).padStart(2,'0')}:${String(istDate.getUTCMinutes()).padStart(2,'0')}:${String(istDate.getUTCSeconds()).padStart(2,'0')}`;

                        const { error: leaveInsertError } = await supabase
                            .from('leaves')
                            .insert([{
                                employee_id: employee.employee_id,
                                leave_type: 'Unpaid',
                                leave_duration: 'Full Day',
                                start_date: today,
                                end_date: today,
                                reason: 'Auto-generated: No attendance recorded',
                                days_count: 1,
                                status: 'approved', // Auto-approve system generated leaves
                                applied_date: today,
                                approved_date: today,
                                approved_by: 'SYSTEM',
                                remarks: 'System generated leave for absent employee',
                                created_at: createdAtIST,
                                updated_at: createdAtIST
                            }]);

                        if (leaveInsertError) {
                            console.error(`❌ Error creating leave record for ${employee.employee_id}:`, leaveInsertError);
                        } else {
                            console.log(`✅ Created leave record for ${employee.employee_id}`);
                            leaveCreatedCount++;
                        }
                    } else {
                        console.log(`ℹ️ Leave record already exists for ${employee.employee_id}`);
                        skippedCount++;
                    }

                } else if (!attendance.clock_in && !attendance.attendance_type) {
                    // Attendance record exists but no clock_in and it isn't a leave-driven
                    // placeholder (paid_leave/comp_off/birthday_leave rows also have no
                    // clock_in by design — those must never be flipped to absent here).
                    console.log(`⚠️ ${employee.employee_id} - Attendance record exists but no clock_in`);

                    // Update status to absent
                    const { error: updateError } = await supabase
                        .from('attendance')
                        .update({ status: 'absent' })
                        .eq('id', attendance.id);

                    if (updateError) {
                        console.error(`❌ Error updating attendance status for ${employee.employee_id}:`, updateError);
                    } else {
                        absentCount++;
                    }
                }

            } catch (employeeError) {
                console.error(`❌ Error processing employee ${employee.employee_id}:`, employeeError);
            }
        }

        const result = {
            success: true,
            date: today,
            totalEmployees: employees.length,
            absentCount,
            leaveCreatedCount,
            skippedCount,
            birthdayLeaveCount,
            message: `Processed ${employees.length} employees. ${absentCount} marked absent, ${leaveCreatedCount} leave records created, ${birthdayLeaveCount} birthday leaves auto-created, ${skippedCount} skipped.`
        };

        console.log('✅ Daily absent check completed:', result);
        return result;

    } catch (error) {
        console.error('❌ Error in markAbsentEmployeesAsLeave:', error);
        return { success: false, error: error.message };
    }
};

// Schedule the job to run every day at 11:59 PM IST
const scheduleAbsentCheck = () => {
    // Run at 23:59 IST every day (18:29 UTC)
    cron.schedule('59 23 * * *', async () => {
        console.log('🕐 Running scheduled absent employee check...');
        await markAbsentEmployeesAsLeave();
    }, {
        scheduled: true,
        timezone: "Asia/Kolkata"
    });

    console.log('📅 Absent employee check scheduled for 11:59 PM IST daily');
};

// Manual trigger function (for testing or admin use)
const triggerAbsentCheck = async () => {
    console.log('🔄 Manual trigger: Running absent employee check...');
    return await markAbsentEmployeesAsLeave();
};

module.exports = {
    scheduleAbsentCheck,
    triggerAbsentCheck,
    markAbsentEmployeesAsLeave,
    // Exported for unit testing — pure, no DB/network calls.
    isBirthdayToday,
    isWeekendDate,
    shouldAutoMarkBirthdayPresent,
};
