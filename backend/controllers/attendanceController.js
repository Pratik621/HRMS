const { v4: uuidv4 } = require('uuid');
const supabase = require('../config/supabase');
const { holidays } = require('../data/holidays');
const { normalizeName, getEmployeeById, getTeamEmployeeIdsByManagerName, getTeamEmployeeIdsByEmployeeId, employeeHasDirectReports } = require('../utils/employeeLookup');
const { isFlexibleShiftEnabled, getFlexibleShiftStatus } = require('../utils/flexibleShift');
const CompanyHolidayService = require('../services/companyHolidayService');
const { sendEarlyLogoutAppliedEmail } = require('../services/emailService');

// Generate unique session ID
const generateSessionId = () => {
    return uuidv4();
};

// Helper function to calculate time difference in minutes
const calculateTimeDifferenceInMinutes = (date1, date2) => {
    const diffMs = Math.abs(date2 - date1);
    const diffMinutes = diffMs / (1000 * 60);
    return diffMinutes;
};

// Helper function to parse time string
const parseTimeString = (timeStr) => {
    if (!timeStr) return null;
    const ampmMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (ampmMatch) {
        let hour = parseInt(ampmMatch[1]);
        const minute = parseInt(ampmMatch[2]);
        const ampm = ampmMatch[3].toUpperCase();
        if (ampm === 'PM' && hour !== 12) hour += 12;
        if (ampm === 'AM' && hour === 12) hour = 0;
        return { hour, minute };
    }
    const militaryMatch = timeStr.match(/(\d{1,2}):(\d{2})/);
    if (militaryMatch) {
        return { hour: parseInt(militaryMatch[1]), minute: parseInt(militaryMatch[2]) };
    }
    return { hour: 9, minute: 0 };
};

// Parse shift timing
const parseShiftTiming = (shiftString) => {
    if (!shiftString) {
        return { startHour: 9, startMinute: 0, endHour: 18, endMinute: 0, totalHours: 9 };
    }
    const parts = shiftString.split('-');
    if (parts.length !== 2) {
        return { startHour: 9, startMinute: 0, endHour: 18, endMinute: 0, totalHours: 9 };
    }
    const startPart = parts[0].trim();
    const endPart = parts[1].trim();
    const parseTime = (timeStr) => {
        const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
        if (!match) return null;
        let hour = parseInt(match[1]);
        const minute = parseInt(match[2]);
        const ampm = match[3].toUpperCase();
        if (ampm === 'PM' && hour !== 12) hour += 12;
        if (ampm === 'AM' && hour === 12) hour = 0;
        return { hour, minute };
    };
    const startTime = parseTime(startPart);
    const endTime = parseTime(endPart);
    if (!startTime || !endTime) {
        return { startHour: 9, startMinute: 0, endHour: 18, endMinute: 0, totalHours: 9 };
    }
    const startTotalMinutes = (startTime.hour * 60) + startTime.minute;
    const endTotalMinutes = (endTime.hour * 60) + endTime.minute;
    let totalMinutes = endTotalMinutes - startTotalMinutes;
    if (totalMinutes < 0) totalMinutes += 24 * 60;
    return {
        startHour: startTime.hour,
        startMinute: startTime.minute,
        endHour: endTime.hour,
        endMinute: endTime.minute,
        totalHours: totalMinutes / 60
    };
};

// Calculate overtime
// Rule:
//   1. Calculate minutes worked AFTER shift end.
//   2. If that value < 60 min  → no OT (buffer not crossed).
//   3. If that value >= 60 min → OT = floor(minutes_after_shift_end / 60).
// Examples (shift 3PM-12AM):
//   clock-out 12:30AM → 30 min after shift end  < 60 → OT = 0
//   clock-out  1:00AM → 60 min after shift end  ≥ 60 → OT = floor(60/60)  = 1 hr
//   clock-out  2:00AM → 120 min after shift end ≥ 60 → OT = floor(120/60) = 2 hrs
//   clock-out  3:30AM → 210 min after shift end ≥ 60 → OT = floor(210/60) = 3 hrs
// Examples (shift 9AM-6PM):
//   clock-out  7:30PM → 90 min after shift end  ≥ 60 → OT = floor(90/60)  = 1 hr
//   clock-out  8:00PM → 120 min after shift end ≥ 60 → OT = floor(120/60) = 2 hrs

const calculateOvertime = (clockInIST, clockOutIST, shiftTiming) => {
    const OT_BUFFER_MINUTES = 60;

    if (!clockInIST || !clockOutIST || !shiftTiming) {
        return { overtimeHours: 0, overtimeMinutes: 0, hasOvertime: false, overtimeAmount: 0 };
    }

    // Build shift end datetime using clock-in date as base
    const ciStr = String(clockInIST).replace('T', ' ').substring(0, 19);
    const [ciDatePart] = ciStr.split(' ');
    const [ciY, ciMo, ciD] = ciDatePart.split('-').map(Number);

    const shiftStartTotalMin = shiftTiming.startHour * 60 + shiftTiming.startMinute;
    const shiftEndTotalMin = shiftTiming.endHour * 60 + shiftTiming.endMinute;
    const isNightShift = shiftEndTotalMin < shiftStartTotalMin;

    let shiftEndDateStr;
    if (isNightShift) {
        // Shift end is on the next calendar day
        const nextDay = new Date(ciY, ciMo - 1, ciD + 1);
        shiftEndDateStr = `${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, '0')}-${String(nextDay.getDate()).padStart(2, '0')} ${String(shiftTiming.endHour).padStart(2, '0')}:${String(shiftTiming.endMinute).padStart(2, '0')}:00`;
    } else {
        shiftEndDateStr = `${ciY}-${String(ciMo).padStart(2, '0')}-${String(ciD).padStart(2, '0')} ${String(shiftTiming.endHour).padStart(2, '0')}:${String(shiftTiming.endMinute).padStart(2, '0')}:00`;
    }

    const shiftEndMs = toUTCMs(shiftEndDateStr);
    const clockOutMs = toUTCMs(clockOutIST);

    // Minutes worked after shift end
    const minutesAfterShiftEnd = (clockOutMs - shiftEndMs) / (1000 * 60);

    // Buffer not crossed → no OT
    if (minutesAfterShiftEnd < OT_BUFFER_MINUTES) {
        return { overtimeHours: 0, overtimeMinutes: 0, hasOvertime: false, overtimeAmount: 0 };
    }

    // OT = floor(total minutes after shift end / 60)
    const overtimeHours = Math.floor(minutesAfterShiftEnd / 60);

    return {
        overtimeHours,
        overtimeMinutes: overtimeHours * 60,
        hasOvertime: overtimeHours > 0,
        overtimeAmount: overtimeHours * 150
    };
};

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// Current time as IST string "YYYY-MM-DD HH:MM:SS"
const nowIST = () => {
    const now = new Date();
    const utcMs = now.getTime();
    const istMs = utcMs + IST_OFFSET_MS;
    const ist = new Date(istMs);
    const y = ist.getUTCFullYear();
    const mo = String(ist.getUTCMonth() + 1).padStart(2, '0');
    const d = String(ist.getUTCDate()).padStart(2, '0');
    const h = String(ist.getUTCHours()).padStart(2, '0');
    const mi = String(ist.getUTCMinutes()).padStart(2, '0');
    const s = String(ist.getUTCSeconds()).padStart(2, '0');
    return `${y}-${mo}-${d} ${h}:${mi}:${s}`;
};

// Clock-in IST: subtract 5 minutes from the actual clock-in time
const clockInIST = () => {
    const now = new Date();
    const istMs = now.getTime() + IST_OFFSET_MS - (5 * 60 * 1000);
    const ist = new Date(istMs);
    const y = ist.getUTCFullYear();
    const mo = String(ist.getUTCMonth() + 1).padStart(2, '0');
    const d = String(ist.getUTCDate()).padStart(2, '0');
    const h = String(ist.getUTCHours()).padStart(2, '0');
    const mi = String(ist.getUTCMinutes()).padStart(2, '0');
    return `${y}-${mo}-${d} ${h}:${mi}:00`;
};

// Parse any time value → UTC ms (safe for diff calculations)
const toUTCMs = (val) => {
    if (!val) return null;
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val.getTime();
    const s = String(val).trim();

    // UTC ISO string (has Z or +offset)
    if (/[Zz]$/.test(s) || /[+-]\d{2}:?\d{2}$/.test(s)) {
        const d = new Date(s);
        return isNaN(d.getTime()) ? null : d.getTime();
    }

    // IST local string "YYYY-MM-DD HH:MM:SS" or "YYYY-MM-DDTHH:MM:SS"
    const clean = s.replace('T', ' ').substring(0, 19);
    const [datePart, timePart] = clean.split(' ');
    if (!datePart || !timePart) return null;
    const [y, mo, d] = datePart.split('-').map(Number);
    const [h, mi, sec = 0] = timePart.split(':').map(Number);
    if ([y, mo, d, h, mi].some(isNaN)) return null;

    // Treat as IST → subtract IST offset to get UTC ms
    return Date.UTC(y, mo - 1, d, h, mi, sec) - IST_OFFSET_MS;
};

// Convert UTC ms → IST string "YYYY-MM-DD HH:MM:SS"
const utcMsToISTString = (ms) => {
    if (ms == null || isNaN(ms)) return null;
    const ist = new Date(ms + IST_OFFSET_MS);
    const y = ist.getUTCFullYear();
    const mo = String(ist.getUTCMonth() + 1).padStart(2, '0');
    const d = String(ist.getUTCDate()).padStart(2, '0');
    const h = String(ist.getUTCHours()).padStart(2, '0');
    const mi = String(ist.getUTCMinutes()).padStart(2, '0');
    const s = String(ist.getUTCSeconds()).padStart(2, '0');
    return `${y}-${mo}-${d} ${h}:${mi}:${s}`;
};

// IST string → UTC ISO string (for DB clock_in / clock_out columns)
const istStringToUTCISO = (istStr) => {
    const ms = toUTCMs(istStr);
    return ms != null ? new Date(ms).toISOString() : null;
};

// Check if a date is a holiday
const isHoliday = (date) => {
    const dateStr = date.toISOString().split('T')[0];
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
        return { isHoliday: true, type: 'weekly_off', name: dayOfWeek === 0 ? 'Sunday' : 'Saturday' };
    }
    const holiday = holidays.find(h => h.date === dateStr);
    if (holiday) {
        return { isHoliday: true, type: 'public_holiday', name: holiday.name, region: holiday.region };
    }
    return { isHoliday: false };
};

// Recalculate late marks - fully IST-aware
const recalculateLate = (clockInIst, clockIn, shiftTiming, attendanceDate) => {
    const clockInMs = toUTCMs(clockInIst || clockIn);
    if (clockInMs == null) return { late_minutes: 0, late_display: null, is_late: false };

    // Parse shift start from shiftTiming string
    let shiftHour = 9, shiftMinute = 0;
    if (shiftTiming) {
        let s = shiftTiming.trim();
        if (s.includes('-')) s = s.split('-')[0].trim();
        const m = s.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
        if (m) {
            let h = parseInt(m[1]);
            const ampm = m[3].toUpperCase();
            if (ampm === 'PM' && h !== 12) h += 12;
            if (ampm === 'AM' && h === 12) h = 0;
            shiftHour = h; shiftMinute = parseInt(m[2]);
        } else {
            const m2 = s.match(/(\d{1,2}):(\d{2})/);
            if (m2) { shiftHour = parseInt(m2[1]); shiftMinute = parseInt(m2[2]); }
        }
    }

    // Build shift start as IST string then convert to UTC ms
    const [ay, am, ad] = String(attendanceDate).substring(0, 10).split('-').map(Number);
    const shiftStartIST = `${ay}-${String(am).padStart(2, '0')}-${String(ad).padStart(2, '0')} ${String(shiftHour).padStart(2, '0')}:${String(shiftMinute).padStart(2, '0')}:00`;
    const shiftStartMs = toUTCMs(shiftStartIST);

    const diffMs = clockInMs - shiftStartMs;
    if (diffMs <= 0) return { late_minutes: 0, late_display: null, is_late: false };

    const lateMinutes = diffMs / (1000 * 60);
    const totalSeconds = Math.floor(diffMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const remainingSeconds = totalSeconds % 3600;
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 || (hours === 0 && minutes === 0)) parts.push(`${seconds}s`);

    return {
        late_minutes: parseFloat(lateMinutes.toFixed(4)),
        late_display: parts.join(' '),
        is_late: true
    };
};

// Get effective shift timing for an employee on a given date from history
const getEffectiveShiftTiming = async (employeeId, attendanceDate, fallbackShift) => {
    // If shift_time_used was saved at clock-in time, always use it.
    // This prevents a shift change made AFTER clock-in from altering that day's late calculation.
    if (fallbackShift) return fallbackShift;
    try {
        const { data } = await supabase
            .from('employee_shift_history')
            .select('shift_timing, effective_from')
            .eq('employee_id', employeeId)
            .lte('effective_from', attendanceDate)
            .order('effective_from', { ascending: false })
            .limit(1);
        if (data && data.length > 0) return data[0].shift_timing;
    } catch (_) { }
    // Last resort: current shift from employees table
    try {
        const { data } = await supabase.from('employees').select('shift_timing').eq('employee_id', employeeId).single();
        if (data) return data.shift_timing;
    } catch (_) { }
    return '9:00 AM - 6:00 PM';
};

// Format late time for display
const formatLateTime = (lateMinutes) => {
    if (!lateMinutes || lateMinutes <= 0) return null;
    const totalMinutes = lateMinutes;
    const hours = Math.floor(totalMinutes / 60);
    const remainingMinutes = Math.floor(totalMinutes % 60);
    const seconds = Math.round((totalMinutes - Math.floor(totalMinutes)) * 60);
    if (hours > 0) {
        if (remainingMinutes > 0 && seconds > 0) return `${hours}h ${remainingMinutes}m ${seconds}s`;
        if (remainingMinutes > 0) return `${hours}h ${remainingMinutes}m`;
        if (seconds > 0) return `${hours}h ${seconds}s`;
        return `${hours}h`;
    }
    if (remainingMinutes > 0) {
        if (seconds > 0) return `${remainingMinutes}m ${seconds}s`;
        return `${remainingMinutes}m`;
    }
    return `${seconds}s`;
};

// 15-hour hard cap: an attendance record open (clock_in set, clock_out NULL) for 15+ hours
// is force-closed with status 'missing'. This is the single source of truth for that rule —
// called both by the scheduled cron (cron/missingClockOutCheck.js, every 15 min) AND inline
// from getTodayAttendance so a stale session is closed the instant a dashboard/login checks
// it, even if the background job hasn't run yet (e.g. it never runs at all on a serverless
// deployment where node-cron can't stay resident — see server.js's `!process.env.VERCEL` guard).
const MISSING_CLOCKOUT_THRESHOLD_MS = 15 * 60 * 60 * 1000;

exports.closeStaleOpenAttendance = async (employeeId = null) => {
    const nowMs = Date.now();
    // NOTE: deliberately does NOT filter out status='missing' here. clock_out IS NULL is
    // already sufficient to exclude anything this function has already closed (it always sets
    // clock_out on close). Excluding by status too previously let a record that was mistagged
    // 'missing' by another path without ever getting a clock_out (a real corrupted record found
    // in production: id 18591) get silently skipped by every future run, forever.
    let query = supabase
        .from('attendance')
        .select('id, employee_id, clock_in, clock_in_ist, session_id, status')
        .not('clock_in', 'is', null)
        .is('clock_out', null);
    if (employeeId) query = query.eq('employee_id', employeeId);

    const { data: openRecords, error } = await query;
    if (error) {
        console.error('❌ [closeStaleOpenAttendance] fetch error:', error.message);
        return { closedCount: 0 };
    }

    let closedCount = 0;
    for (const record of openRecords || []) {
        const clockInMs = toUTCMs(record.clock_in_ist || record.clock_in);
        if (!clockInMs || nowMs - clockInMs < MISSING_CLOCKOUT_THRESHOLD_MS) continue;

        // Auto-close time is always exactly clock_in + 15h, never "now" — this guarantees
        // total_hours can never exceed the 15h cap no matter how late the close happens.
        const autoCloseMs = clockInMs + MISSING_CLOCKOUT_THRESHOLD_MS;
        const autoCloseISO = new Date(autoCloseMs).toISOString();
        const autoCloseIST = utcMsToISTString(autoCloseMs);

        const { error: updErr } = await supabase
            .from('attendance')
            .update({
                status: 'missing',
                total_hours: 15,
                total_minutes: MISSING_CLOCKOUT_THRESHOLD_MS / 60000,
                total_hours_display: '15h 0m',
                clock_out: autoCloseISO,
                clock_out_ist: autoCloseIST,
            })
            .eq('id', record.id);

        if (updErr) {
            console.error(`❌ [closeStaleOpenAttendance] update failed for ${record.employee_id}:`, updErr.message);
            continue;
        }

        if (record.session_id) {
            await supabase
                .from('attendance_sessions')
                .update({ is_active: false, clock_out_time: autoCloseISO })
                .eq('session_id', record.session_id)
                .eq('employee_id', record.employee_id);
        }

        closedCount++;
        console.log(`⚠️  [closeStaleOpenAttendance] ${record.employee_id} open 15h+ → auto-closed, status=missing`);
    }
    return { closedCount };
};

// Auto-close stale sessions
exports.autoCloseStaleSessions = async () => {
    try {
        console.log('🕐 Running auto-close stale sessions check...');
        const cutoffTime = new Date();
        cutoffTime.setHours(cutoffTime.getHours() - 24);
        let { data: staleSessions, error: sessionError } = await supabase
            .from('attendance_sessions')
            .select('*, employees(shift_timing, "isFlexibleShift")')
            .eq('is_active', true)
            .lt('clock_in_time', cutoffTime.toISOString());
        if (sessionError && /isFlexibleShift|does not exist/i.test(sessionError.message || '')) {
            ({ data: staleSessions, error: sessionError } = await supabase
                .from('attendance_sessions')
                .select('*, employees(shift_timing)')
                .eq('is_active', true)
                .lt('clock_in_time', cutoffTime.toISOString()));
        }
        if (sessionError) throw sessionError;
        let closedCount = 0;
        for (const session of staleSessions || []) {
            const { data: attendanceRecords } = await supabase
                .from('attendance')
                .select('*')
                .eq('employee_id', session.employee_id)
                .eq('session_id', session.session_id)
                .is('clock_out', null);
            if (attendanceRecords && attendanceRecords.length > 0) {
                const attendance = attendanceRecords[0];
                const clockInTime = new Date(attendance.clock_in);
                const isFlexibleShift = isFlexibleShiftEnabled(session.employees || {});
                const shiftTiming = parseShiftTiming(session.employees?.shift_timing);

                let autoClockOutTime;
                if (isFlexibleShift) {
                    // No shift end time applies — this cron only ever fires for sessions open
                    // 24h+, so just close at clock-in + 24h same as the no-shift-end fallback below.
                    autoClockOutTime = new Date(clockInTime);
                    autoClockOutTime.setHours(autoClockOutTime.getHours() + 24);
                } else {
                    const shiftEndTime = new Date(clockInTime);
                    shiftEndTime.setHours(shiftTiming.endHour, shiftTiming.endMinute, 0, 0);
                    autoClockOutTime = shiftEndTime;
                    if (autoClockOutTime > new Date()) {
                        autoClockOutTime = new Date(clockInTime);
                        autoClockOutTime.setHours(autoClockOutTime.getHours() + 24);
                    }
                }
                const totalMinutes = calculateTimeDifferenceInMinutes(clockInTime, autoClockOutTime);
                const totalHours = totalMinutes / 60;

                let status;
                if (isFlexibleShift) {
                    status = getFlexibleShiftStatus(totalMinutes).status;
                } else {
                    const expectedWorkMinutes = (shiftTiming.totalHours || 9) * 60;
                    status = 'half_day';
                    if (totalMinutes >= expectedWorkMinutes) status = 'present';
                    else if (totalMinutes < 300) status = 'absent';
                }

                const clockOutIST = autoClockOutTime.toLocaleString('en-US', { timeZone: 'Asia/Kolkata', hour12: false });

                await supabase
                    .from('attendance')
                    .update({
                        clock_out: autoClockOutTime.toISOString(),
                        clock_out_ist: clockOutIST,
                        total_hours: Math.round(totalHours * 100) / 100,
                        total_minutes: Math.round(totalMinutes),
                        status: status,
                        auto_closed: true
                    })
                    .eq('id', attendance.id);
                await supabase
                    .from('attendance_sessions')
                    .update({ is_active: false, clock_out_time: autoClockOutTime.toISOString() })
                    .eq('id', session.id);
                closedCount++;
            }
        }
        return { success: true, closedCount };
    } catch (error) {
        console.error('Error auto-closing stale sessions:', error);
        return { success: false, error: error.message };
    }
};

// Clock In function - Complete version
exports.clockIn = async (req, res) => {
    try {
        const { employee_id, latitude, longitude, accuracy } = req.body;
        if (!employee_id) {
            return res.status(400).json({ success: false, message: 'Employee ID is required' });
        }

        const { data: employees } = await supabase
            .from('employees')
            .select('*')
            .eq('employee_id', employee_id);
        if (!employees || employees.length === 0) {
            return res.status(404).json({ success: false, message: 'Employee not found' });
        }
        const emp = employees[0];
        const isFlexibleShift = isFlexibleShiftEnabled(emp);

        // ✅ NEW: Check for any incomplete attendance record from previous day(s)
        // But ONLY block if the record is NOT part of an active session (night shift support)
        const todayIST = nowIST().split(' ')[0];
        const { data: incompleteRecords } = await supabase
            .from('attendance')
            .select('*')
            .eq('employee_id', employee_id)
            .not('clock_in', 'is', null)
            .is('clock_out', null)
            .lt('attendance_date', todayIST)
            .order('attendance_date', { ascending: false });

        if (incompleteRecords && incompleteRecords.length > 0) {
            const incompleteRecord = incompleteRecords[0];
            const incompleteDate = incompleteRecord.attendance_date;

            // Check if this record has an active session (night shift support)
            const { data: activeSessionForRecord } = await supabase
                .from('attendance_sessions')
                .select('id, session_id, is_active')
                .eq('employee_id', employee_id)
                .eq('session_id', incompleteRecord.session_id)
                .maybeSingle();

            if (!activeSessionForRecord || !activeSessionForRecord.is_active) {
                // Session is closed (or never existed) but the attendance row was never closed.
                // Defer entirely to the single source of truth for the 15-hour rule instead of
                // hand-rolling date arithmetic here — a previous bespoke version of this fix
                // force-rewrote the computed close date back onto incompleteDate whenever it
                // rolled forward (meant for "closed just past midnight"), which silently produced
                // a clock_out time-of-day earlier than clock-in, triggered a +24h wraparound
                // "fix", and reported ~20-24h worked instead of capping at 15h with status
                // 'missing'. closeStaleOpenAttendance always caps at exactly clock_in + 15h.
                await module.exports.closeStaleOpenAttendance(employee_id);
                console.log(`✅ [ClockIn] Closed incomplete record for ${incompleteDate} via 15h rule. Allowing new clock-in.`);
            }
            // else: session.is_active === true → night shift still in progress, allow
        }

        // Check for existing active session
        const { data: activeSessions } = await supabase
            .from('attendance_sessions')
            .select('*')
            .eq('employee_id', employee_id)
            .eq('is_active', true);

        if (activeSessions && activeSessions.length > 0) {
            const activeSession = activeSessions[0];

            // ✅ STALE SESSION CHECK: If attendance for this session already has clock_out, auto-fix it
            const { data: staleAtt } = await supabase
                .from('attendance')
                .select('id, clock_out, clock_out_ist, attendance_date')
                .eq('employee_id', employee_id)
                .eq('session_id', activeSession.session_id)
                .not('clock_out', 'is', null)
                .maybeSingle();

            if (staleAtt) {
                console.log(`🔧 Stale active session found at clock-in. Force-closing session ${activeSession.session_id}`);
                await supabase
                    .from('attendance_sessions')
                    .update({ is_active: false, clock_out_time: staleAtt.clock_out })
                    .eq('session_id', activeSession.session_id)
                    .eq('employee_id', employee_id);
                // Allow clock-in to proceed
            } else {
                // Check if orphan session (no attendance record at all)
                const { data: anyAtt } = await supabase
                    .from('attendance')
                    .select('id')
                    .eq('employee_id', employee_id)
                    .eq('session_id', activeSession.session_id)
                    .maybeSingle();

                if (!anyAtt) {
                    console.log(`🔧 Orphan active session found at clock-in. Force-closing session ${activeSession.session_id}`);
                    await supabase
                        .from('attendance_sessions')
                        .update({ is_active: false, clock_out_time: new Date().toISOString() })
                        .eq('session_id', activeSession.session_id)
                        .eq('employee_id', employee_id);
                    // Allow clock-in to proceed
                } else {
                    // Compare using IST dates to avoid UTC midnight mismatch
                    const sessionISTDate = utcMsToISTString(new Date(activeSession.clock_in_time).getTime()).split(' ')[0];
                    const todayISTDate = nowIST().split(' ')[0];

                    if (sessionISTDate !== todayISTDate) {
                        return res.status(400).json({
                            success: false,
                            message: `You have an active session from ${sessionISTDate}. Please clock out for that day first before clocking in for today.`,
                            has_missed_clockout: true,
                            attendance_date: sessionISTDate
                        });
                    } else {
                        return res.status(400).json({
                            success: false,
                            message: 'You have already clocked in today. Please clock out first.'
                        });
                    }
                }
            }
        }

        const now = new Date();
        const sessionId = generateSessionId();
        const holidayCheck = isHoliday(now);

        // IST time string for clock-in — rounded DOWN to nearest 5 minutes
        const clockInISTValue = clockInIST();
        const istDateForAttendance = clockInISTValue.split(' ')[0];
        const today = istDateForAttendance;

        // ✅ ENHANCED: Better shift timing parsing with fallback
        let shiftHour = 9, shiftMinute = 0;
        let shiftDisplay = emp.shift_timing || '9:00 AM - 6:00 PM';

        console.log(`🔍 Processing shift timing for ${employee_id}: "${emp.shift_timing}"`);

        if (emp.shift_timing) {
            let startTimeStr = emp.shift_timing.trim();

            // Extract start time from shift range (e.g., "9:00 AM - 6:00 PM")
            if (startTimeStr.includes('-')) {
                startTimeStr = startTimeStr.split('-')[0].trim();
            }

            console.log(`🔍 Extracted start time: "${startTimeStr}"`);

            // Try multiple parsing patterns
            let parsed = false;

            // Pattern 1: "9:00 AM" or "3:00 PM"
            const ampmMatch = startTimeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
            if (ampmMatch) {
                let hour = parseInt(ampmMatch[1]);
                const minute = parseInt(ampmMatch[2]);
                const ampm = ampmMatch[3].toUpperCase();

                if (ampm === 'PM' && hour !== 12) hour += 12;
                if (ampm === 'AM' && hour === 12) hour = 0;

                shiftHour = hour;
                shiftMinute = minute;
                parsed = true;
                console.log(`✅ Parsed AM/PM format: ${hour}:${minute} (${ampm})`);
            }

            // Pattern 2: "15:00" (24-hour format)
            if (!parsed) {
                const militaryMatch = startTimeStr.match(/(\d{1,2}):(\d{2})/);
                if (militaryMatch) {
                    shiftHour = parseInt(militaryMatch[1]);
                    shiftMinute = parseInt(militaryMatch[2]);
                    parsed = true;
                    console.log(`✅ Parsed 24-hour format: ${shiftHour}:${shiftMinute}`);
                }
            }

            // Pattern 3: Just hour "9" or "15"
            if (!parsed) {
                const hourMatch = startTimeStr.match(/^(\d{1,2})$/);
                if (hourMatch) {
                    shiftHour = parseInt(hourMatch[1]);
                    shiftMinute = 0;
                    parsed = true;
                    console.log(`✅ Parsed hour only: ${shiftHour}:00`);
                }
            }

            if (!parsed) {
                console.log(`⚠️ Could not parse shift timing "${startTimeStr}", using default 9:00 AM`);
                shiftHour = 9;
                shiftMinute = 0;
            }
        }

        // Flexible-shift employees ignore shift timing, late marks, and early-arrival calculations.
        let lateMinutes = 0, earlyMinutes = 0, lateDisplay = null;
        let isLate = false;
        let isEarly = false;

        if (!isFlexibleShift) {
            const shiftStartIST = `${istDateForAttendance} ${String(shiftHour).padStart(2, '0')}:${String(shiftMinute).padStart(2, '0')}:00`;
            const clockInMs = toUTCMs(clockInISTValue);
            const shiftStartMs = toUTCMs(shiftStartIST);
            const diffMs = clockInMs - shiftStartMs;
            isLate = diffMs > 0;
            isEarly = diffMs < 0;

            if (isLate) {
                lateMinutes = diffMs / (1000 * 60);
                const totalSeconds = Math.floor(diffMs / 1000);
                const hours = Math.floor(totalSeconds / 3600);
                const remainingSeconds = totalSeconds % 3600;
                const minutes = Math.floor(remainingSeconds / 60);
                const seconds = remainingSeconds % 60;
                const parts = [];
                if (hours > 0) parts.push(`${hours}h`);
                if (minutes > 0) parts.push(`${minutes}m`);
                if (seconds > 0 || (hours === 0 && minutes === 0)) parts.push(`${seconds}s`);
                lateDisplay = parts.join(' ');
            } else if (isEarly) {
                earlyMinutes = Math.abs(diffMs) / (1000 * 60);
            }
        }

        const lateMinutesToSave = isLate ? parseFloat(lateMinutes.toFixed(4)) : 0;
        const earlyMinutesToSave = isEarly ? parseFloat(earlyMinutes.toFixed(4)) : 0;

        // Check for existing attendance TODAY (using IST date)
        const { data: existingAttendance } = await supabase
            .from('attendance')
            .select('*')
            .eq('employee_id', employee_id)
            .eq('attendance_date', istDateForAttendance)
            .limit(1);

        if (existingAttendance && existingAttendance.length > 0) {
            if (existingAttendance[0].clock_in && existingAttendance[0].clock_out) {
                return res.status(400).json({ success: false, message: 'You have already clocked in today' });
            }
            if (existingAttendance[0].clock_in && !existingAttendance[0].clock_out) {
                return res.status(400).json({
                    success: false,
                    message: 'You have an incomplete attendance record from today. Please clock out or request regularization.',
                    has_missed_clockout: true,
                    attendance_id: existingAttendance[0].id
                });
            }
        }

        const attendanceData = {
            employee_id,
            attendance_date: istDateForAttendance,
            clock_in: now.toISOString(),
            clock_in_ist: clockInISTValue,
            late_minutes: lateMinutesToSave,
            early_minutes: earlyMinutesToSave,
            latitude: latitude || null,
            longitude: longitude || null,
            location_accuracy: accuracy || null,
            session_id: sessionId,
            shift_time_used: shiftDisplay,
            is_holiday: holidayCheck.isHoliday,
            holiday_name: holidayCheck.name || null,
            status: 'present'
        };

        // Add late_display only if column exists (try-catch on insert handles this)
        if (lateDisplay) {
            attendanceData.late_display = lateDisplay;
        }

        // A placeholder row for today may already exist (e.g. inserted by the 23:59 IST
        // absent-marking cron — backend/cron/absentEmployeeCheck.js — before this employee
        // clocked in) with clock_in left NULL. `attendance` has no unique constraint on
        // (employee_id, attendance_date), so inserting a fresh row here — as this used to do
        // unconditionally — creates a SECOND row: the real clock-in data lands there while the
        // original NULL placeholder row is left behind looking like a broken/missing punch to
        // anyone querying the table directly. Update the placeholder in place instead.
        const placeholderRow = (existingAttendance && existingAttendance.length > 0 && !existingAttendance[0].clock_in)
            ? existingAttendance[0]
            : null;

        const writeAttendance = (data) => placeholderRow
            ? supabase.from('attendance').update(data).eq('id', placeholderRow.id).select()
            : supabase.from('attendance').insert([data]).select();

        // Insert (or update the placeholder) attendance record
        let insertedAttendance, insertError;
        ({ data: insertedAttendance, error: insertError } = await writeAttendance(attendanceData));

        // If late_display column doesn't exist, retry without it
        if (insertError && insertError.message && insertError.message.includes('late_display')) {
            console.log('⚠️ late_display column missing, retrying without it...');
            const { late_display: _removed, ...dataWithoutLateDisplay } = attendanceData;
            ({ data: insertedAttendance, error: insertError } = await writeAttendance(dataWithoutLateDisplay));
        }

        if (insertError) {
            console.error('❌ Insert error:', insertError);
            throw insertError;
        }

        // Create session
        await supabase.from('attendance_sessions').insert([{
            employee_id,
            session_id: sessionId,
            clock_in_time: now.toISOString(),
            last_heartbeat: now.toISOString(),
            is_active: true,
            latitude: latitude || null,
            longitude: longitude || null,
            location_accuracy: accuracy || null
        }]);

        // Clocking in is unambiguous proof the employee is actively using the app today —
        // count it the same as a fresh login for the Admin "Inactive Logins" report, so
        // someone who clocked in this morning never shows up as stale just because their
        // browser silently refreshed an old access token instead of hitting /login again.
        supabase.from('employees').update({ last_login_at: now.toISOString() }).eq('employee_id', employee_id)
            .then(({ error }) => { if (error) console.error('⚠️ [ClockIn] failed to record last_login_at:', error.message); });

        let message = '✅ Clocked in on time';
        if (isFlexibleShift) message = '✅ Clocked in with flexible-shift rules';
        else if (isLate) message = `⚠️ Clocked in (${lateDisplay} late)`;
        else if (isEarly) message = `⏰ Clocked in (${Math.floor(earlyMinutes)}m early)`;

        const response = {
            success: true,
            message,
            attendance_id: insertedAttendance?.[0]?.id || null,
            clock_in: now,
            clock_in_ist: clockInISTValue,
            shift_time: shiftDisplay,
            shift_start: `${shiftHour.toString().padStart(2, '0')}:${shiftMinute.toString().padStart(2, '0')}`,
            isFlexibleShift,
            is_late: isLate,
            is_early: isEarly,
            late_minutes: lateMinutesToSave,
            late_display: lateDisplay,
            session_id: sessionId,
            employee_name: `${emp.first_name} ${emp.last_name}`,
            attendance_date: today,
            is_holiday: holidayCheck.isHoliday,
            // Trusted server clock, for the frontend to anchor its live timer against instead
            // of the employee's own device clock (which the request never even sends here —
            // clock_in above is computed entirely from `now = new Date()` on this server).
            server_time: now.toISOString()
        };

        console.log(`✅ Clock-in successful for ${employee_id}:`, {
            is_late: isLate,
            late_display: lateDisplay,
            late_minutes: lateMinutesToSave
        });

        res.json(response);

    } catch (error) {
        console.error('❌ Clock-in error:', error);
        res.status(500).json({ success: false, message: 'Failed to clock in', error: error.message });
    }
};

// In attendanceController.js - Update clockOut function

exports.clockOut = async (req, res) => {
    try {
        console.log('📍 CLOCK-OUT REQUEST START');
        const { employee_id, session_id } = req.body;

        if (!employee_id) {
            return res.status(400).json({
                success: false,
                message: 'Employee ID is required'
            });
        }

        let finalSessionId = session_id;
        const now = new Date();
        const startTime = Date.now();

        // ✅ Always resolve to the real active session from DB (ignore stale frontend session_id)
        {
            const { data: activeSessions } = await supabase
                .from('attendance_sessions')
                .select('session_id, clock_in_time')
                .eq('employee_id', employee_id)
                .eq('is_active', true)
                .order('created_at', { ascending: false })
                .limit(1);

            if (activeSessions && activeSessions.length > 0) {
                finalSessionId = activeSessions[0].session_id;
                console.log(`✅ Using active session from DB: ${finalSessionId}, clock_in_time: ${activeSessions[0].clock_in_time}`);

                // ✅ SAFETY CHECK: Verify the attendance record for this session is not already clocked out
                const { data: sessionAttRec } = await supabase
                    .from('attendance')
                    .select('id, clock_out, clock_out_ist, attendance_date')
                    .eq('employee_id', employee_id)
                    .eq('session_id', finalSessionId)
                    .not('clock_out', 'is', null)
                    .maybeSingle();

                if (sessionAttRec) {
                    // Attendance already clocked out but session still marked active — fix the stale session
                    console.log(`🔧 Stale session detected: attendance already clocked out at ${sessionAttRec.clock_out_ist}. Force-closing session.`);
                    await supabase
                        .from('attendance_sessions')
                        .update({ is_active: false, clock_out_time: sessionAttRec.clock_out })
                        .eq('session_id', finalSessionId)
                        .eq('employee_id', employee_id);

                    return res.status(400).json({
                        success: false,
                        message: 'Already clocked out for this session.',
                        already_clocked_out: true,
                        clock_out_ist: sessionAttRec.clock_out_ist,
                        attendance_date: sessionAttRec.attendance_date,
                        stale_session_fixed: true
                    });
                }

                // Case 2: No attendance record at all for this session (orphan session)
                const { data: anyAttRec } = await supabase
                    .from('attendance')
                    .select('id')
                    .eq('employee_id', employee_id)
                    .eq('session_id', finalSessionId)
                    .maybeSingle();

                if (!anyAttRec) {
                    console.log(`🔧 Orphan session detected (no attendance record). Force-closing session.`);
                    await supabase
                        .from('attendance_sessions')
                        .update({ is_active: false, clock_out_time: new Date().toISOString() })
                        .eq('session_id', finalSessionId)
                        .eq('employee_id', employee_id);

                    return res.status(400).json({
                        success: false,
                        message: 'No active session found. Please clock in first.',
                        already_clocked_out: true,
                        stale_session_fixed: true
                    });
                }
            } else {
                return res.status(400).json({
                    success: false,
                    message: 'No active session found. Please clock in first.'
                });
            }
        }

        // Fetch attendance record with employee data
        console.log('⏱️ Fetching attendance record for session:', finalSessionId);

        const { data: attendanceRecords, error: attendanceError } = await supabase
            .from('attendance')
            .select('id, employee_id, session_id, clock_in, clock_in_ist, attendance_date, employees!inner(shift_timing)')
            .eq('employee_id', employee_id)
            .eq('session_id', finalSessionId)
            .is('clock_out', null)
            .order('clock_in', { ascending: false })
            .limit(1);

        if (attendanceError) {
            console.error('❌ Attendance query error:', attendanceError);
            throw attendanceError;
        }

        let attendanceRecord = attendanceRecords && attendanceRecords.length > 0 ? attendanceRecords[0] : null;

        if (!attendanceRecord) {
            const { data: crossMidnightRecords } = await supabase
                .from('attendance')
                .select('id, employee_id, session_id, clock_in, clock_in_ist, attendance_date, employees!inner(shift_timing)')
                .eq('employee_id', employee_id)
                .eq('session_id', finalSessionId)
                .is('clock_out', null)
                .order('clock_in', { ascending: false })
                .limit(1);

            if (!crossMidnightRecords || crossMidnightRecords.length === 0) {
                // Check if this session's attendance is already clocked out
                const { data: alreadyClockedOut } = await supabase
                    .from('attendance')
                    .select('id, clock_out, clock_out_ist, attendance_date')
                    .eq('employee_id', employee_id)
                    .eq('session_id', finalSessionId)
                    .not('clock_out', 'is', null)
                    .maybeSingle();

                if (alreadyClockedOut) {
                    return res.status(400).json({
                        success: false,
                        message: 'Already clocked out for this session.',
                        already_clocked_out: true,
                        clock_out_ist: alreadyClockedOut.clock_out_ist,
                        attendance_date: alreadyClockedOut.attendance_date
                    });
                }

                return res.status(404).json({
                    success: false,
                    message: 'No active attendance record found for this session'
                });
            }
            attendanceRecord = crossMidnightRecords[0];
        }
        const employee = attendanceRecord.employees;
        // Fetched separately (not via the employees!inner join above) so a not-yet-migrated
        // isFlexibleShift column can't break the join itself — defaults to false on error.
        const { data: flexRow, error: flexErr } = await supabase
            .from('employees')
            .select('"isFlexibleShift"')
            .eq('employee_id', employee_id)
            .maybeSingle();
        const isFlexibleShift = flexErr ? false : isFlexibleShiftEnabled(flexRow || {});
        const queryTime = Date.now() - startTime;
        console.log(`✅ Query time: ${queryTime}ms`);

        // 15-minute minimum between clock-in and clock-out
        if (attendanceRecord.clock_in) {
            // Force UTC parse: DB stores UTC without 'Z', so JS parses it as local time on IST machines
            const rawClockIn = attendanceRecord.clock_in;
            const clockInStr = rawClockIn.includes('Z') || rawClockIn.includes('+') ? rawClockIn : rawClockIn + 'Z';
            const clockInMs = new Date(clockInStr).getTime();
            const minutesSince = (Date.now() - clockInMs) / (1000 * 60);
            console.log(`⏱️ Minutes since clock-in: ${minutesSince.toFixed(2)}`);
            if (minutesSince < 15) {
                const remaining = Math.ceil(15 - minutesSince);
                return res.status(400).json({
                    success: false,
                    message: `Please wait ${remaining} more minute(s) before clocking out.`,
                    too_early: true,
                    remaining_minutes: remaining
                });
            }
        }

        // Use IST strings for accurate diff (avoids UTC offset issues)
        const clockInIST = attendanceRecord.clock_in_ist || nowIST();

        // ✅ CRITICAL FIX: Keep clock_out_ist with the SAME DATE as attendance_date
        // Get current time in IST but preserve the original attendance date
        const currentIST = nowIST();
        const currentDatePart = currentIST.split(' ')[0];
        const currentTimePart = currentIST.split(' ')[1];
        const originalAttendanceDate = attendanceRecord.attendance_date;

        // If clock-out time is after midnight (next day), keep the original attendance date
        // This ensures clock_out_ist stays on the same calendar day as clock_in
        let clockOutIST;
        if (currentDatePart > originalAttendanceDate) {
            // Clock out is on next day - use original date + current time
            clockOutIST = `${originalAttendanceDate} ${currentTimePart}`;
            console.log(`🕐 Night shift detected: Clock-out at ${currentTimePart} on ${currentDatePart}, storing as ${clockOutIST}`);
        } else {
            clockOutIST = currentIST;
        }

        const clockInMs = toUTCMs(clockInIST);
        const clockOutMs = toUTCMs(clockOutIST);
        let totalMinutes = Math.round((clockOutMs - clockInMs) / (1000 * 60));

        // midnight crossing guard
        if (totalMinutes < 0) totalMinutes += 24 * 60;
        const totalHours = totalMinutes / 60;

        // Flexible-shift employees are evaluated by total working hours only.
        let status = 'half_day';
        const shiftTiming = parseShiftTiming(employee?.shift_timing);
        const expectedWorkMinutes = isFlexibleShift ? 540 : (shiftTiming.totalHours || 9) * 60;
        if (isFlexibleShift) {
            const flexibleStatus = getFlexibleShiftStatus(totalMinutes);
            status = flexibleStatus.status;
        } else {
            if (totalMinutes >= expectedWorkMinutes) {
                status = 'present';
            } else if (totalMinutes < 300) {
                status = 'absent';
            }
        }

        const overtime = isFlexibleShift ? { overtimeHours: 0, overtimeMinutes: 0, hasOvertime: false, overtimeAmount: 0 } : calculateOvertime(clockInIST, clockOutIST, shiftTiming);

        // Calculate display hours and minutes
        const displayHours = Math.floor(totalMinutes / 60);
        const displayMinutes = totalMinutes % 60;
        const totalHoursDisplay = `${displayHours}h ${displayMinutes}m`;

        // Update attendance record
        const updateData = {
            clock_out: istStringToUTCISO(clockOutIST),
            clock_out_ist: clockOutIST,  // Now keeps same date as attendance_date
            total_hours: parseFloat(totalHours.toFixed(2)),
            total_minutes: totalMinutes,
            total_hours_display: totalHoursDisplay,
            status: status
        };

        // Add overtime fields
        updateData.overtime_hours = overtime.overtimeHours;
        updateData.overtime_minutes = overtime.overtimeMinutes;
        updateData.overtime_amount = overtime.overtimeAmount;
        updateData.has_overtime = overtime.hasOvertime;

        console.log(`⏱️ Total minutes: ${totalMinutes}, Expected: ${expectedWorkMinutes}, Status: ${status}`);
        console.log(`⏱️ Storing clock_out_ist as: ${clockOutIST}`);

        const { error: updateError } = await supabase
            .from('attendance')
            .update(updateData)
            .eq('id', attendanceRecord.id);

        if (updateError) {
            console.error('❌ Error updating attendance:', updateError);
            throw updateError;
        }

        // ✅ Check if today is a holiday and employee worked 9+ hours → award Comp-Off
        try {
            const CompOffService = require('../services/compOffService');
            const compOff = await CompOffService.checkHolidayWork(
                employee_id,
                attendanceRecord.attendance_date,
                parseFloat(totalHours.toFixed(2))
            );
            if (compOff) {
                console.log(`🎉 Comp-Off awarded to ${employee_id} for working on holiday ${attendanceRecord.attendance_date}`);
            }
        } catch (compOffError) {
            console.error('⚠️ Comp-off check failed (non-critical):', compOffError.message);
        }

        // Update session as inactive
        console.log('⏱️ Updating session...');
        const { error: sessionError } = await supabase
            .from('attendance_sessions')
            .update({
                is_active: false,
                clock_out_time: now.toISOString()
            })
            .eq('session_id', finalSessionId)
            .eq('employee_id', employee_id);

        if (sessionError) {
            console.error('❌ Error updating session:', sessionError);
            console.warn('Session update failed but attendance was updated');
        }

        const totalTime = Date.now() - startTime;
        console.log('✅ Clock-out successful!');
        console.log(`⏱️ Total time: ${totalTime}ms`);

        res.json({
            success: true,
            message: '✅ Clocked out successfully',
            clock_out_ist: clockOutIST,
            total_hours: parseFloat(totalHours.toFixed(2)),
            total_minutes: totalMinutes,
            total_hours_display: totalHoursDisplay,
            status: status,
            response_time_ms: totalTime,
            // Trusted server clock — see clockIn's server_time for why the frontend syncs to this.
            server_time: now.toISOString()
        });

    } catch (error) {
        console.error('❌ Clock-out error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to clock out',
            error: error.message,
            error_type: 'SERVER_ERROR'
        });
    }
};

// Clock Out for Missed/Previous Day Attendance - UPDATED to use current time
// In attendanceController.js - Update clockOutMissed function

exports.clockOutMissed = async (req, res) => {
    try {
        const { employee_id, attendance_id, attendance_date } = req.body;

        if (!employee_id || !attendance_id) {
            return res.status(400).json({ success: false, message: 'Employee ID and Attendance ID are required' });
        }

        // Get the attendance record
        const { data: attendance, error: fetchError } = await supabase
            .from('attendance')
            .select('*')
            .eq('id', attendance_id)
            .eq('employee_id', employee_id)
            .maybeSingle();

        if (fetchError || !attendance) {
            return res.status(404).json({ success: false, message: 'Attendance record not found' });
        }

        if (attendance.clock_out) {
            return res.status(400).json({ success: false, message: 'This attendance record already has a clock-out time' });
        }

        const { data: employeeProfile } = await supabase
            .from('employees')
            .select('*')
            .eq('employee_id', employee_id)
            .maybeSingle();

        const currentIST = nowIST();
        const currentDatePart = currentIST.split(' ')[0];
        const currentTimePart = currentIST.split(' ')[1];
        const originalAttendanceDate = attendance.attendance_date;

        // ✅ CRITICAL FIX: Keep clock_out_ist with the SAME DATE as attendance_date
        let clockOutIST;
        if (currentDatePart > originalAttendanceDate) {
            // Clock out is on next day - use original date + current time
            clockOutIST = `${originalAttendanceDate} ${currentTimePart}`;
            console.log(`🕐 Night shift detected for missed: Clock-out at ${currentTimePart} on ${currentDatePart}, storing as ${clockOutIST}`);
        } else {
            clockOutIST = currentIST;
        }

        // Parse clock in time and current time
        const clockInTime = new Date(attendance.clock_in_ist || attendance.clock_in);
        const currentTime = new Date(clockOutIST);  // Use the adjusted clock-out time

        let totalMinutes = Math.round((currentTime - clockInTime) / (1000 * 60));
        if (totalMinutes < 0) {
            totalMinutes += 24 * 60;
        }

        console.log(`⏰ Clock out for ${attendance.attendance_date}: ${clockOutIST}`);

        const totalHours = totalMinutes / 60;

        const displayHours = Math.floor(totalMinutes / 60);
        const displayMinutes = totalMinutes % 60;
        const totalHoursDisplay = `${displayHours}h ${displayMinutes}m`;

        // Determine status
        const isFlexibleShift = isFlexibleShiftEnabled(employeeProfile || {});
        let status = 'half_day';
        if (isFlexibleShift) {
            status = getFlexibleShiftStatus(totalMinutes).status;
        } else {
            const shiftTiming = parseShiftTiming(attendance.shift_time_used || employeeProfile?.shift_timing);
            const expectedWorkMinutes = (shiftTiming.totalHours || 9) * 60;
            if (totalMinutes >= expectedWorkMinutes) {
                status = 'present';
            } else if (totalMinutes < 300) {
                status = 'absent';
            }
        }

        // Update attendance
        const { error: updateError } = await supabase
            .from('attendance')
            .update({
                clock_out: istStringToUTCISO(clockOutIST),
                clock_out_ist: clockOutIST,
                total_hours: parseFloat(totalHours.toFixed(2)),
                total_minutes: totalMinutes,
                total_hours_display: totalHoursDisplay,
                status: status
            })
            .eq('id', attendance.id);

        if (updateError) {
            console.error('Error updating attendance:', updateError);
            throw updateError;
        }

        // Also close any active session for this employee
        if (attendance.session_id) {
            await supabase
                .from('attendance_sessions')
                .update({ is_active: false, clock_out_time: new Date().toISOString() })
                .eq('session_id', attendance.session_id)
                .eq('employee_id', employee_id);
        }

        // Check comp-off: holiday + 9+ hours worked
        try {
            const CompOffService = require('../services/compOffService');
            await CompOffService.checkHolidayWork(
                employee_id,
                attendance.attendance_date,
                parseFloat(totalHours.toFixed(2))
            );
        } catch (e) {
            console.error('⚠️ Comp-off check failed (non-critical):', e.message);
        }

        res.json({
            success: true,
            message: `Clocked out successfully for ${attendance.attendance_date} at ${clockOutIST.split(' ')[1]}`,
            data: {
                attendance_date: attendance.attendance_date,
                clock_out_ist: clockOutIST,
                total_hours: totalHours.toFixed(2),
                total_minutes: totalMinutes,
                total_hours_display: totalHoursDisplay,
                status: status
            }
        });

    } catch (error) {
        console.error('Error in clockOutMissed:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to clock out for missed day',
            error: error.message
        });
    }
};

// Get today's attendance
exports.getTodayAttendance = async (req, res) => {
    try {
        const { employee_id } = req.params;
        if (!employee_id) return res.status(400).json({ success: false, message: 'Employee ID is required' });

        // Dashboard/login-time enforcement of the 15-hour cap: close any open record for this
        // employee before reading state, so a stale (>=15h) session can never be reported back
        // as "still clocked in" — regardless of whether the background cron has run.
        await module.exports.closeStaleOpenAttendance(employee_id);

        // Use IST date for today - avoids UTC midnight mismatch
        const todayStr = nowIST().split(' ')[0];

        // Get employee details first
        const { data: employees } = await supabase.from('employees').select('*').eq('employee_id', employee_id);
        if (!employees || employees.length === 0) {
            return res.status(404).json({ success: false, message: 'Employee not found' });
        }
        const employee = employees[0];
        const isFlexibleShift = isFlexibleShiftEnabled(employee);

        const { data: todayAttendance } = await supabase
            .from('attendance')
            .select('*, employees!inner(first_name, last_name, shift_timing, comp_off_balance)')
            .eq('employee_id', employee_id)
            .eq('attendance_date', todayStr)
            .order('clock_in', { ascending: false, nullsFirst: false })
            .limit(1);
        const { data: activeSession } = await supabase
            .from('attendance_sessions')
            .select('*')
            .eq('employee_id', employee_id)
            .eq('is_active', true);

        let formattedAttendance = null;

        // If there's an active session, also check for the associated attendance record
        let activeSessionAttendance = null;
        if (activeSession && activeSession.length > 0) {
            const session = activeSession[0];
            const { data: sessionAttendance } = await supabase
                .from('attendance')
                .select('*, employees!inner(first_name, last_name, shift_timing, comp_off_balance)')
                .eq('employee_id', employee_id)
                .eq('session_id', session.session_id)
                .order('clock_in', { ascending: false })
                .limit(1);

            if (sessionAttendance && sessionAttendance.length > 0) {
                activeSessionAttendance = sessionAttendance[0];
                if (activeSessionAttendance.employees) {
                    activeSessionAttendance.first_name = activeSessionAttendance.employees.first_name;
                    activeSessionAttendance.last_name = activeSessionAttendance.employees.last_name;
                    activeSessionAttendance.shift_timing = activeSessionAttendance.employees.shift_timing;
                    delete activeSessionAttendance.employees;
                }
            }
        }

        // Determine which attendance record to use.
        // Priority: active session attendance (directly linked, guaranteed to have clock_in)
        //           > today's attendance (may include ghost/import records with null clock_in)
        //           > cross-midnight active session attendance

        const activeSessionIsCrossMidnight = activeSessionAttendance &&
            activeSessionAttendance.attendance_date &&
            activeSessionAttendance.attendance_date.split('T')[0] !== todayStr &&
            !activeSessionAttendance.clock_out;

        const attendanceToProcess =
            // 1. Active session attendance (has clock_in guaranteed)
            (activeSession && activeSession.length > 0 && activeSessionAttendance && activeSessionAttendance.clock_in)
                ? activeSessionAttendance
            // 2. Today's attendance record (nulls-last ordering means real records come first)
            : (todayAttendance && todayAttendance.length > 0)
                ? todayAttendance[0]
            // 3. Cross-midnight: session from previous day still active
            : (activeSessionIsCrossMidnight ? activeSessionAttendance : null);

        if (attendanceToProcess) {
            formattedAttendance = { ...attendanceToProcess };
            if (formattedAttendance.employees) {
                formattedAttendance.first_name = formattedAttendance.employees.first_name;
                formattedAttendance.last_name = formattedAttendance.employees.last_name;
                formattedAttendance.shift_timing = formattedAttendance.employees.shift_timing;
                // Use the already-fetched full employee row (isFlexibleShift), not the joined
                // partial select above which only carries name/shift_timing/comp_off_balance.
                formattedAttendance.isFlexibleShift = isFlexibleShift;
                delete formattedAttendance.employees;
            }

            // ✅ ENHANCED: Always recalculate late marks in real-time
            if (formattedAttendance.clock_in || formattedAttendance.clock_in_ist) {
                // Parse clock in time
                let clockInTime;
                const clockInValue = formattedAttendance.clock_in_ist || formattedAttendance.clock_in;

                if (clockInValue && typeof clockInValue === 'string' && clockInValue.includes(' ')) {
                    const [datePart, timePart] = clockInValue.split(' ');
                    const [year, month, day] = datePart.split('-');
                    const [hour, minute, second] = timePart.split(':');
                    clockInTime = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute), parseInt(second || 0));
                } else {
                    clockInTime = new Date(clockInValue);
                }

                if (clockInTime && !isNaN(clockInTime.getTime())) {
                    // Parse shift timing
                    let shiftHour = 9, shiftMinute = 0;
                const shiftString = employee.shift_timing || formattedAttendance.shift_time_used;

                if (!isFlexibleShift && shiftString) {
                        let startTimeStr = shiftString.trim();

                        if (startTimeStr.includes('-')) {
                            startTimeStr = startTimeStr.split('-')[0].trim();
                        }

                        let parsed = false;

                        // Pattern 1: "9:00 AM" or "3:00 PM"
                        const ampmMatch = startTimeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
                        if (ampmMatch) {
                            let hour = parseInt(ampmMatch[1]);
                            const minute = parseInt(ampmMatch[2]);
                            const ampm = ampmMatch[3].toUpperCase();

                            if (ampm === 'PM' && hour !== 12) hour += 12;
                            if (ampm === 'AM' && hour === 12) hour = 0;

                            shiftHour = hour;
                            shiftMinute = minute;
                            parsed = true;
                        }

                        // Pattern 2: "15:00" (24-hour format)
                        if (!parsed) {
                            const militaryMatch = startTimeStr.match(/(\d{1,2}):(\d{2})/);
                            if (militaryMatch) {
                                shiftHour = parseInt(militaryMatch[1]);
                                shiftMinute = parseInt(militaryMatch[2]);
                                parsed = true;
                            }
                        }

                        // Pattern 3: Just hour "9" or "15"
                        if (!parsed) {
                            const hourMatch = startTimeStr.match(/^(\d{1,2})$/);
                            if (hourMatch) {
                                shiftHour = parseInt(hourMatch[1]);
                                shiftMinute = 0;
                                parsed = true;
                            }
                        }
                    }

                    // Create shift start time for today
                    const attendanceDate = new Date(formattedAttendance.attendance_date);
                    const shiftStartTime = new Date(
                        attendanceDate.getFullYear(),
                        attendanceDate.getMonth(),
                        attendanceDate.getDate(),
                        shiftHour,
                        shiftMinute,
                        0,
                        0
                    );

                    // Calculate late time
                    const diffMs = clockInTime - shiftStartTime;
                    const isLate = diffMs > 0;

                    let lateMinutes = 0;
                    let lateDisplay = null;

                    if (isLate) {
                        lateMinutes = diffMs / (1000 * 60);

                        // Format late display
                        const totalSeconds = Math.floor(diffMs / 1000);
                        const hours = Math.floor(totalSeconds / 3600);
                        const remainingSeconds = totalSeconds % 3600;
                        const minutes = Math.floor(remainingSeconds / 60);
                        const seconds = remainingSeconds % 60;

                        const parts = [];
                        if (hours > 0) parts.push(`${hours}h`);
                        if (minutes > 0) parts.push(`${minutes}m`);
                        if (seconds > 0 || (hours === 0 && minutes === 0)) parts.push(`${seconds}s`);
                        lateDisplay = parts.join(' ');
                    }

                    // Update the formatted attendance with calculated values
                    formattedAttendance.late_minutes = isFlexibleShift ? 0 : (isLate ? parseFloat(lateMinutes.toFixed(4)) : 0);
                    formattedAttendance.late_display = isFlexibleShift ? null : lateDisplay;
                    formattedAttendance.is_late = isFlexibleShift ? false : isLate;

                    console.log(`📊 Real-time late calculation for ${employee_id}:`, {
                        shift_start: `${shiftHour}:${shiftMinute.toString().padStart(2, '0')}`,
                        clock_in: clockInTime.toLocaleString(),
                        late_minutes: formattedAttendance.late_minutes,
                        late_display: formattedAttendance.late_display,
                        is_late: formattedAttendance.is_late
                    });

                    // Update database if values have changed significantly
                    const storedRecord = todayAttendance && todayAttendance.length > 0 ? todayAttendance[0] : null;
                    if (storedRecord) {
                        const storedLateMinutes = parseFloat(storedRecord.late_minutes) || 0;
                        const needsUpdate = Math.abs(storedLateMinutes - formattedAttendance.late_minutes) > 0.01 ||
                            storedRecord.late_display !== formattedAttendance.late_display;

                        if (needsUpdate) {
                            console.log(`🔄 Updating attendance record ${storedRecord.id} with correct late marks`);
                            const updatePayload = { late_minutes: formattedAttendance.late_minutes };
                            if (storedRecord.hasOwnProperty('late_display')) {
                                updatePayload.late_display = formattedAttendance.late_display;
                            }
                            await supabase
                                .from('attendance')
                                .update(updatePayload)
                                .eq('id', storedRecord.id);
                        }
                    }
                }
            }

            if (formattedAttendance.clock_in_ist && !formattedAttendance.clock_out_ist) {
                const clockInMs = toUTCMs(formattedAttendance.clock_in_ist);
                const nowMs = toUTCMs(nowIST());
                let diffMinutes = (nowMs - clockInMs) / (1000 * 60);
                if (diffMinutes < 0) diffMinutes += 24 * 60;
                const hours = Math.floor(diffMinutes / 60);
                const minutes = Math.round(diffMinutes % 60);
                formattedAttendance.total_hours_display = `${hours}h ${minutes}m`;
            } else if (formattedAttendance.total_minutes) {
                const minutes = formattedAttendance.total_minutes;
                formattedAttendance.total_hours_display = `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60)}m`;
            }

            formattedAttendance.clock_in = formattedAttendance.clock_in_ist || formattedAttendance.clock_in;
            formattedAttendance.clock_out = formattedAttendance.clock_out_ist || formattedAttendance.clock_out;

            if (!formattedAttendance.status) {
                if (formattedAttendance.clock_in && !formattedAttendance.clock_out) {
                    formattedAttendance.status = 'working';
                } else if (formattedAttendance.clock_in && formattedAttendance.clock_out) {
                    formattedAttendance.status = isFlexibleShift ? getFlexibleShiftStatus(formattedAttendance.total_minutes || formattedAttendance.total_hours * 60 || 0).status : 'present';
                }
            }
        }
        res.json({
            success: true,
            attendance: formattedAttendance,
            active_session: activeSession && activeSession.length > 0 ? activeSession[0] : null,
            has_active_session: activeSession && activeSession.length > 0,
            today_date: todayStr,
            // Trusted server clock — the frontend syncs its live "hours worked" timer to this
            // instead of the employee's own device clock. This endpoint is polled on mount and
            // after every clock action, so it doubles as a frequent resync point.
            server_time: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Error in getTodayAttendance:', error);
        res.status(500).json({ success: false, message: 'Failed to get attendance', error: error.message });
    }
};

// Helper function to parse IST datetime string
const parseLocalDateTimeIST = (datetimeStr) => {
    if (!datetimeStr) return null;
    if (datetimeStr instanceof Date) return datetimeStr;

    if (typeof datetimeStr === 'string' && datetimeStr.includes(' ')) {
        const [datePart, timePart] = datetimeStr.split(' ');
        const [year, month, day] = datePart.split('-');
        const [hour, minute, second] = timePart.split(':');
        return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute), parseInt(second || 0));
    }

    const parsed = new Date(datetimeStr);
    return isNaN(parsed.getTime()) ? null : parsed;
};

// Get attendance report
// Supabase/PostgREST silently caps any query at its default max-rows setting (1000 on this
// project) — a query with no explicit .range() doesn't error when there's more data than
// that, it just quietly returns page 1 and drops the rest. For a date range wide enough to
// cross ~1000 attendance rows (this table already has 1400+ rows for a single ~31-day payroll
// cycle across the whole company), that silently dropped the START of the range — e.g. a
// payroll cycle's first few days going missing from every report/export built on this
// endpoint, with no error anywhere to signal it. Loop pages until a page comes back short.
const ATTENDANCE_PAGE_SIZE = 1000;
const fetchAllPages = async (buildQuery) => {
    let all = [];
    let offset = 0;
    for (;;) {
        const { data, error } = await buildQuery().range(offset, offset + ATTENDANCE_PAGE_SIZE - 1);
        if (error) return { data: null, error };
        all = all.concat(data || []);
        if (!data || data.length < ATTENDANCE_PAGE_SIZE) break;
        offset += ATTENDANCE_PAGE_SIZE;
    }
    return { data: all, error: null };
};

// One shared rule for picking the "real" row out of a set of duplicate attendance rows for
// the same employee+date — the attendance table has no unique constraint on
// (employee_id, attendance_date), so duplicates genuinely exist (a nightly-cron placeholder
// alongside a real punch, or two real punches when someone mis-clocked-in and immediately
// clocked back in). Used by BOTH getAttendanceReport (admin reports/exports) and
// getEmployeeAttendanceReport (the employee's own Attendance page) so the two can never
// disagree about which row is correct — they previously used two different ad-hoc rules
// ("prefer the later raw clock_out timestamp" vs "prefer higher total_minutes"), which is
// exactly how B2B260612's 2026-07-28 ended up "Present, 9h49m" on their own Attendance page
// but "Absent" in the payroll Excel: an accidental 82-minute clock-in/out happened to carry a
// later raw clock_out timestamp than the real ~9h49m session that followed it minutes later.
// Priority: an admin-approved regularization always wins > a real punch beats an empty
// placeholder > between two real punches, more logged minutes wins (the complete session,
// not a stray short double-punch) > most recently written wins as the final tiebreak.
const pickBetterAttendanceRow = (existing, record) => {
    if (!existing) return record;

    const existingRegularized = !!existing.is_regularized;
    const newRegularized = !!record.is_regularized;
    if (newRegularized !== existingRegularized) return newRegularized ? record : existing;

    const existingHasClock = !!(existing.clock_in || existing.clock_in_ist);
    const newHasClock = !!(record.clock_in || record.clock_in_ist);
    if (newHasClock !== existingHasClock) return newHasClock ? record : existing;

    if (existingHasClock && newHasClock) {
        const existingMinutes = existing.total_minutes || 0;
        const newMinutes = record.total_minutes || 0;
        if (newMinutes !== existingMinutes) return newMinutes > existingMinutes ? record : existing;
    }

    const existingTime = new Date(existing.updated_at || existing.created_at).getTime() || 0;
    const newTime = new Date(record.updated_at || record.created_at).getTime() || 0;
    return newTime > existingTime ? record : existing;
};

exports.getAttendanceReport = async (req, res) => {
    try {
        const { start, end, employee_id, manager_id } = req.query;
        if (!start || !end) {
            return res.status(400).json({ success: false, message: 'Start and end dates are required' });
        }

        // Manager Dashboard "View Team" filter — resolves manager_id (an employee_id) to
        // that manager's direct reports. null = no scope (company-wide); [] = manager has
        // no direct reports, so return an empty report rather than falling through to
        // company-wide data.
        let teamIds = null;
        if (manager_id) {
            teamIds = await getTeamEmployeeIdsByEmployeeId(manager_id);
            if (teamIds && teamIds.length === 0) {
                return res.json({
                    success: true, attendance: [],
                    stats: { total: 0, present: 0, half_day: 0, absent: 0, total_working_minutes: 0, total_working_hours: 0, total_working_hours_display: '0h 0m' },
                });
            }
        }

        const buildQuery = () => {
            let q = supabase
                .from('attendance')
                .select('*, employees(first_name, last_name, department, shift_timing, comp_off_balance, profile_image, "isFlexibleShift")')
                .gte('attendance_date', start)
                .lte('attendance_date', end);
            if (employee_id) q = q.eq('employee_id', employee_id);
            if (teamIds) q = q.in('employee_id', teamIds);
            return q.order('attendance_date', { ascending: false });
        };
        let { data: attendance, error: attendanceError } = await fetchAllPages(buildQuery);
        if (attendanceError && /isFlexibleShift|does not exist/i.test(attendanceError.message || '')) {
            const buildFallbackQuery = () => {
                let q = supabase
                    .from('attendance')
                    .select('*, employees(first_name, last_name, department, shift_timing, comp_off_balance, profile_image)')
                    .gte('attendance_date', start)
                    .lte('attendance_date', end);
                if (employee_id) q = q.eq('employee_id', employee_id);
                if (teamIds) q = q.in('employee_id', teamIds);
                return q.order('attendance_date', { ascending: false });
            };
            ({ data: attendance, error: attendanceError } = await fetchAllPages(buildFallbackQuery));
        }
        if (attendanceError) throw attendanceError;

        const dedupedAttendanceMap = {};
        (attendance || []).forEach(record => {
            const dateKey = record.attendance_date ? record.attendance_date.split('T')[0] : record.attendance_date;
            const key = `${record.employee_id}-${dateKey}`;
            dedupedAttendanceMap[key] = pickBetterAttendanceRow(dedupedAttendanceMap[key], record);
        });

        // Bulk-fetch break minutes for every employee/date in this report (one query,
        // avoids an N+1 lookup inside the per-record map below). Covers Sales'
        // unlimited/typeless breaks the same as the fixed 3-break system.
        const reportEmployeeIds = [...new Set(Object.values(dedupedAttendanceMap).map(r => r.employee_id))];
        const breakMinutesMap = {};
        if (reportEmployeeIds.length > 0) {
            const { data: breakRows } = await supabase.from('employee_breaks')
                .select('employee_id, attendance_date, break_duration_minutes')
                .in('employee_id', reportEmployeeIds)
                .gte('attendance_date', start)
                .lte('attendance_date', end)
                .not('break_duration_minutes', 'is', null);
            (breakRows || []).forEach(b => {
                const key = `${b.employee_id}-${b.attendance_date}`;
                breakMinutesMap[key] = (breakMinutesMap[key] || 0) + (b.break_duration_minutes || 0);
            });
        }

        const formattedAttendance = await Promise.all((Object.values(dedupedAttendanceMap) || []).map(async record => {
            const employee = record.employees || {};
            let totalHoursDisplay = '0h 0m';
            if (record.total_minutes) {
                totalHoursDisplay = `${Math.floor(record.total_minutes / 60)}h ${Math.round(record.total_minutes % 60)}m`;
            } else if (record.total_hours) {
                const totalMinutes = record.total_hours * 60;
                totalHoursDisplay = `${Math.floor(totalMinutes / 60)}h ${Math.round(totalMinutes % 60)}m`;
            }

            const recordDateKey = record.attendance_date ? record.attendance_date.split('T')[0] : record.attendance_date;
            const totalBreakMinutes = breakMinutesMap[`${record.employee_id}-${recordDateKey}`] || 0;

            // Use shift history - new shift wont affect old records
            const shiftTiming = await getEffectiveShiftTiming(record.employee_id, record.attendance_date, record.shift_time_used || employee.shift_timing);

            // Trust stored late_minutes if explicitly set (Excel import clears to 0 = on time).
            // Only recalculate from clock_in when late_minutes is null (old records with no stored value).
            let late;
            if (record.late_minutes !== null && record.late_minutes !== undefined) {
                late = {
                    is_late: record.late_minutes > 0,
                    late_minutes: record.late_minutes,
                    late_display: formatLateTime(record.late_minutes),
                };
            } else if (isFlexibleShiftEnabled(employee)) {
                late = { is_late: false, late_minutes: 0, late_display: null };
            } else {
                late = recalculateLate(record.clock_in_ist, record.clock_in, shiftTiming, record.attendance_date);
            }

            // DB status is source of truth; fall back to clock data only when null
            let status = record.status;
            if (!status) {
                if (record.clock_in && !record.clock_out) status = 'working';
                else if (record.clock_in && record.clock_out) status = 'present';
            }

            return {
                id: record.id,
                employee_id: record.employee_id,
                attendance_date: record.attendance_date,
                clock_in: record.clock_in_ist || record.clock_in,
                clock_out: record.clock_out_ist || record.clock_out,
                total_hours: record.total_hours,
                total_minutes: record.total_minutes,
                total_hours_display: totalHoursDisplay,
                status: status,
                is_late: late.is_late,
                late_minutes: late.late_minutes,
                late_display: late.late_display,
                early_minutes: record.early_minutes,
                shift_time_used: shiftTiming,
                is_holiday: record.is_holiday,
                holiday_name: record.holiday_name,
                attendance_type: record.attendance_type || null,
                comp_off_awarded: record.comp_off_awarded,
                comp_off_days: record.comp_off_days,
                is_regularized: record.is_regularized || false,
                total_break_minutes: totalBreakMinutes,
                first_name: employee.first_name || '',
                last_name: employee.last_name || '',
                department: employee.department || '',
                profile_image: employee.profile_image || null
            };
        }));

        // ── Company Holidays (HOL) ──────────────────────────────────────────────────────
        // Override any existing non-worked row on a holiday date to HOL, and synthesize a
        // (never-persisted) HOL entry for any active employee with no row at all that date —
        // e.g. the holiday was applied before the nightly cron ever created a placeholder row.
        // An employee who actually clocked in and worked through the holiday keeps their real
        // status (comp-off eligible), matching the same "real punch beats a placeholder" rule
        // used everywhere else in this report.
        const companyHolidays = await CompanyHolidayService.getHolidaysInRange(start, end);
        if (companyHolidays.length > 0) {
            const holidayNameByDate = {};
            companyHolidays.forEach(h => { holidayNameByDate[h.holiday_date] = h.name; });
            const holidayDates = Object.keys(holidayNameByDate);

            const employeeIdsWithRowByDate = {};
            holidayDates.forEach(d => { employeeIdsWithRowByDate[d] = new Set(); });

            formattedAttendance.forEach(rec => {
                const dateKey = rec.attendance_date ? rec.attendance_date.split('T')[0] : rec.attendance_date;
                if (holidayNameByDate[dateKey] === undefined) return;
                employeeIdsWithRowByDate[dateKey].add(rec.employee_id);
                if (!rec.clock_in) {
                    rec.status = 'holiday';
                    rec.is_holiday = true;
                    rec.holiday_name = holidayNameByDate[dateKey];
                    rec.is_company_holiday = true;
                }
            });

            let empQuery = supabase.from('employees')
                .select('employee_id, first_name, last_name, department, shift_timing, profile_image')
                .eq('is_active', true);
            if (employee_id) empQuery = empQuery.eq('employee_id', employee_id);
            if (teamIds) empQuery = empQuery.in('employee_id', teamIds);
            const { data: activeEmployeesForHoliday } = await empQuery;

            (activeEmployeesForHoliday || []).forEach(emp => {
                holidayDates.forEach(dateStr => {
                    if (employeeIdsWithRowByDate[dateStr].has(emp.employee_id)) return;
                    formattedAttendance.push({
                        id: null,
                        employee_id: emp.employee_id,
                        attendance_date: dateStr,
                        clock_in: null,
                        clock_out: null,
                        total_hours: 0,
                        total_minutes: 0,
                        total_hours_display: '0h 0m',
                        status: 'holiday',
                        is_late: false,
                        late_minutes: 0,
                        late_display: null,
                        early_minutes: null,
                        shift_time_used: emp.shift_timing || null,
                        is_holiday: true,
                        holiday_name: holidayNameByDate[dateStr],
                        attendance_type: null,
                        comp_off_awarded: false,
                        comp_off_days: 0,
                        is_regularized: false,
                        total_break_minutes: 0,
                        first_name: emp.first_name || '',
                        last_name: emp.last_name || '',
                        department: emp.department || '',
                        profile_image: emp.profile_image || null,
                        is_company_holiday: true,
                    });
                });
            });
        }

        let totalWorkingMinutes = 0;
        formattedAttendance.forEach(a => {
            if (a.total_minutes) totalWorkingMinutes += a.total_minutes;
            else if (a.total_hours) totalWorkingMinutes += a.total_hours * 60;
        });

        res.json({
            success: true,
            attendance: formattedAttendance,
            stats: {
                total: formattedAttendance.length,
                present: formattedAttendance.filter(a => a.status === 'present').length,
                half_day: formattedAttendance.filter(a => a.status === 'half_day').length,
                absent: formattedAttendance.filter(a => a.status === 'absent').length,
                total_working_minutes: totalWorkingMinutes,
                total_working_hours: Math.round((totalWorkingMinutes / 60) * 100) / 100,
                total_working_hours_display: `${Math.floor(totalWorkingMinutes / 60)}h ${Math.round(totalWorkingMinutes % 60)}m`
            }
        });
    } catch (error) {
        console.error('❌ Error in getAttendanceReport:', error);
        res.status(500).json({ success: false, message: 'Failed to get attendance report', error: error.message });
    }
};

// In attendanceController.js - Update getMissedClockOuts function

exports.getMissedClockOuts = async (req, res) => {
    try {
        const { employee_id } = req.params;

        // Get employee's shift timing
        const { data: employee, error: empError } = await supabase
            .from('employees')
            .select('shift_timing')
            .eq('employee_id', employee_id)
            .single();

        if (empError) throw empError;

        const shiftTiming = parseShiftTiming(employee?.shift_timing);
        const expectedShiftHours = shiftTiming.totalHours || 9;

        // Regularization threshold set to 15 hours
        const REGULARIZATION_THRESHOLD_HOURS = 15;
        const REGULARIZATION_THRESHOLD_MINUTES = REGULARIZATION_THRESHOLD_HOURS * 60;

        // Get records where clock_out IS NULL and not already auto-closed as missing
        const { data: missedRecords, error } = await supabase
            .from('attendance')
            .select('*, employees!inner(first_name, last_name, shift_timing)')
            .eq('employee_id', employee_id)
            .not('clock_in', 'is', null)
            .is('clock_out', null)
            .neq('status', 'missing')
            .order('attendance_date', { ascending: false });

        if (error) throw error;

        const formattedRecords = [];
        const nowISTStr = nowIST();
        const nowMs = toUTCMs(nowISTStr);
        const todayISTDate = nowISTStr.split(' ')[0];

        // Check for active session
        const { data: activeSession } = await supabase
            .from('attendance_sessions')
            .select('id, session_id')
            .eq('employee_id', employee_id)
            .eq('is_active', true)
            .maybeSingle();

        for (const record of (missedRecords || [])) {
            const clockInValue = record.clock_in_ist || record.clock_in;
            const clockInMs = toUTCMs(clockInValue);
            let totalMinutes = clockInMs != null ? (nowMs - clockInMs) / (1000 * 60) : 0;
            if (totalMinutes < 0) totalMinutes += 24 * 60;

            // ✅ CRITICAL: Don't cap at 24 hours - let it go beyond for regularization detection
            // if (totalMinutes > 24 * 60) totalMinutes = 24 * 60;

            const totalHours = totalMinutes / 60;

            const recordDate = record.attendance_date.split('T')[0];
            const isToday = recordDate === todayISTDate;
            const isRejected = record.regularization_status === 'rejected';

            // Check if this record belongs to the active session
            const isActiveSessionRecord = activeSession && activeSession.session_id === record.session_id;

            // ✅ FIX: canRegularize logic
            let canRegularize = false;

            // For current day active session: If hours >= 15, show Regularization button
            if (isToday && isActiveSessionRecord) {
                if (totalMinutes >= REGULARIZATION_THRESHOLD_MINUTES) {
                    canRegularize = true;
                    console.log(`✅ ${employee_id}: ${totalHours.toFixed(1)}h >= 15h, can regularize for ${recordDate}`);
                }
            }

            // For past dates (not today)
            if (!isToday && !record.is_regularized) {
                if (isRejected) {
                    canRegularize = true;
                } else if (totalMinutes >= REGULARIZATION_THRESHOLD_MINUTES) {
                    canRegularize = true;
                } else if (!record.regularization_requested) {
                    canRegularize = false;
                }
            }

            // Format clock-in for display
            let clockInDisplay = clockInValue;
            if (clockInDisplay && typeof clockInDisplay === 'string' && clockInDisplay.includes(' ')) {
                const timePart = clockInDisplay.split(' ')[1];
                const [hour, minute] = timePart.split(':');
                const hourNum = parseInt(hour);
                const ampm = hourNum >= 12 ? 'PM' : 'AM';
                const hour12 = hourNum % 12 === 0 ? 12 : hourNum % 12;
                clockInDisplay = `${hour12}:${minute} ${ampm}`;
            }

            formattedRecords.push({
                id: record.id,
                attendance_date: record.attendance_date,
                clock_in: record.clock_in_ist || record.clock_in,
                clock_in_display: clockInDisplay,
                shift_timing: record.employees?.shift_timing,
                employee_name: `${record.employees?.first_name} ${record.employees?.last_name}`,
                is_regularized: record.is_regularized || false,
                regularization_requested: record.regularization_requested || false,
                regularization_status: record.regularization_status || null,
                total_hours_worked: totalHours.toFixed(2),
                total_minutes_worked: totalMinutes,
                expected_hours: expectedShiftHours,
                regularization_threshold: REGULARIZATION_THRESHOLD_HOURS,
                can_regularize: canRegularize,
                hours_needed: canRegularize ? 0 : Math.max(0, REGULARIZATION_THRESHOLD_HOURS - totalHours).toFixed(2),
                has_clock_out: false,
                is_today: isToday,
                has_active_session: !!activeSession
            });
        }

        res.json({
            success: true,
            missed_clockouts: formattedRecords,
            regularization_threshold: REGULARIZATION_THRESHOLD_HOURS,
            has_active_session: !!activeSession
        });

    } catch (error) {
        console.error('Error fetching missed clock-outs:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch missed clock-outs',
            error: error.message
        });
    }
};

// Heartbeat
exports.heartbeat = async (req, res) => {
    try {
        const { employee_id, session_id, latitude, longitude } = req.body;
        await supabase
            .from('attendance_sessions')
            .update({ last_heartbeat: new Date().toISOString(), latitude, longitude })
            .eq('employee_id', employee_id)
            .eq('session_id', session_id)
            .eq('is_active', true);
        res.json({ success: true, timestamp: new Date() });
    } catch (error) {
        console.error('Heartbeat error:', error);
        res.status(500).json({ success: false, message: 'Heartbeat failed' });
    }
};

// Get employee attendance report
exports.getEmployeeAttendanceReport = async (req, res) => {
    try {
        const { start, end } = req.query;
        const { employee_id } = req.params;
        if (req.user?.employeeId !== employee_id && !['admin', 'sub_admin', 'hr'].includes(req.user?.role)) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }
        if (!start || !end) {
            return res.status(400).json({ success: false, message: 'Start and end dates are required' });
        }
        let { data: attendance, error: attendanceQError } = await supabase
            .from('attendance')
            .select('*, employees!inner(first_name, last_name, department, shift_timing, comp_off_balance, profile_image, "isFlexibleShift")')
            .eq('employee_id', employee_id)
            .gte('attendance_date', start)
            .lte('attendance_date', end)
            .order('attendance_date', { ascending: false })
            .order('clock_in', { ascending: false, nullsFirst: false });

        if (attendanceQError && /isFlexibleShift|does not exist/i.test(attendanceQError.message || '')) {
            ({ data: attendance } = await supabase
                .from('attendance')
                .select('*, employees!inner(first_name, last_name, department, shift_timing, comp_off_balance, profile_image)')
                .eq('employee_id', employee_id)
                .gte('attendance_date', start)
                .lte('attendance_date', end)
                .order('attendance_date', { ascending: false })
                .order('clock_in', { ascending: false, nullsFirst: false }));
        }

        // Same shared rule getAttendanceReport uses (see pickBetterAttendanceRow) — kept
        // identical on purpose so this employee's own Attendance page can never disagree
        // with what an admin report/export shows for the same day.
        const dedupedByDate = {};
        (attendance || []).forEach(record => {
            const date = record.attendance_date;
            dedupedByDate[date] = pickBetterAttendanceRow(dedupedByDate[date], record);
        });
        const dedupedAttendance = Object.values(dedupedByDate)
            .sort((a, b) => b.attendance_date.localeCompare(a.attendance_date));

        const { data: empBreakRows } = await supabase.from('employee_breaks')
            .select('attendance_date, break_duration_minutes')
            .eq('employee_id', employee_id)
            .gte('attendance_date', start)
            .lte('attendance_date', end)
            .not('break_duration_minutes', 'is', null);
        const empBreakMinutesMap = {};
        (empBreakRows || []).forEach(b => {
            empBreakMinutesMap[b.attendance_date] = (empBreakMinutesMap[b.attendance_date] || 0) + (b.break_duration_minutes || 0);
        });

        const formattedAttendance = await Promise.all(dedupedAttendance.map(async record => {
            const employee = record.employees || {};
            let totalHoursDisplay = '0h 0m';
            if (record.total_minutes) {
                totalHoursDisplay = `${Math.floor(record.total_minutes / 60)}h ${Math.round(record.total_minutes % 60)}m`;
            } else if (record.total_hours) {
                const totalMinutes = record.total_hours * 60;
                totalHoursDisplay = `${Math.floor(totalMinutes / 60)}h ${Math.round(totalMinutes % 60)}m`;
            }

            // Use shift history - new shift wont affect old records
            const shiftTiming = await getEffectiveShiftTiming(record.employee_id, record.attendance_date, record.shift_time_used || employee.shift_timing);

            // Trust stored late_minutes if explicitly set (Excel import clears to 0 = on time).
            // Only recalculate from clock_in when late_minutes is null (old records with no stored value).
            let late;
            if (record.late_minutes !== null && record.late_minutes !== undefined) {
                late = {
                    is_late: record.late_minutes > 0,
                    late_minutes: record.late_minutes,
                    late_display: formatLateTime(record.late_minutes),
                };
            } else if (isFlexibleShiftEnabled(employee)) {
                late = { is_late: false, late_minutes: 0, late_display: null };
            } else {
                late = recalculateLate(record.clock_in_ist, record.clock_in, shiftTiming, record.attendance_date);
            }

            // DB status is source of truth; fall back to clock data only when null
            let status = record.status;
            if (!status) {
                if (record.clock_in && !record.clock_out) status = 'working';
                else if (record.clock_in && record.clock_out) status = 'present';
            }

            return {
                id: record.id,
                employee_id: record.employee_id,
                attendance_date: record.attendance_date,
                clock_in: record.clock_in_ist || record.clock_in,
                clock_out: record.clock_out_ist || record.clock_out,
                total_hours: record.total_hours,
                total_minutes: record.total_minutes,
                total_hours_display: totalHoursDisplay,
                status: status,
                is_late: late.is_late,
                late_minutes: late.late_minutes,
                late_display: late.late_display,
                early_minutes: record.early_minutes,
                is_holiday: record.is_holiday,
                holiday_name: record.holiday_name || null,
                attendance_type: record.attendance_type || null,
                comp_off_awarded: record.comp_off_awarded,
                is_regularized: record.is_regularized || false,
                total_break_minutes: empBreakMinutesMap[record.attendance_date] || 0,
                first_name: employee.first_name || '',
                last_name: employee.last_name || '',
                department: employee.department || '',
                profile_image: employee.profile_image || null
            };
        }));

        // ── Company Holidays (HOL) ──────────────────────────────────────────────────────
        // Same rule as getAttendanceReport: override a non-worked row on a holiday date to
        // HOL, and synthesize one (never persisted) for a holiday date with no row at all —
        // so this employee's own attendance page can never disagree with the admin report.
        const companyHolidaysForEmp = await CompanyHolidayService.getHolidaysInRange(start, end);
        if (companyHolidaysForEmp.length > 0) {
            const holidayNameByDate = {};
            companyHolidaysForEmp.forEach(h => { holidayNameByDate[h.holiday_date] = h.name; });

            const datesWithRow = new Set();
            formattedAttendance.forEach(rec => {
                const dateKey = rec.attendance_date ? rec.attendance_date.split('T')[0] : rec.attendance_date;
                if (holidayNameByDate[dateKey] === undefined) return;
                datesWithRow.add(dateKey);
                if (!rec.clock_in) {
                    rec.status = 'holiday';
                    rec.is_holiday = true;
                    rec.holiday_name = holidayNameByDate[dateKey];
                    rec.is_company_holiday = true;
                }
            });

            const missingHolidayDates = Object.keys(holidayNameByDate).filter(d => !datesWithRow.has(d));
            if (missingHolidayDates.length > 0) {
                const { data: empProfile } = await supabase.from('employees')
                    .select('first_name, last_name, department, shift_timing, profile_image')
                    .eq('employee_id', employee_id)
                    .maybeSingle();
                missingHolidayDates.forEach(dateStr => {
                    formattedAttendance.push({
                        id: null,
                        employee_id,
                        attendance_date: dateStr,
                        clock_in: null,
                        clock_out: null,
                        total_hours: 0,
                        total_minutes: 0,
                        total_hours_display: '0h 0m',
                        status: 'holiday',
                        is_late: false,
                        late_minutes: 0,
                        late_display: null,
                        early_minutes: null,
                        is_holiday: true,
                        holiday_name: holidayNameByDate[dateStr],
                        attendance_type: null,
                        comp_off_awarded: false,
                        is_regularized: false,
                        total_break_minutes: 0,
                        first_name: empProfile?.first_name || '',
                        last_name: empProfile?.last_name || '',
                        department: empProfile?.department || '',
                        profile_image: empProfile?.profile_image || null,
                        is_company_holiday: true,
                    });
                });
            }
        }

        let totalWorkingMinutes = 0;
        formattedAttendance.forEach(a => {
            if (a.total_minutes) totalWorkingMinutes += a.total_minutes;
            else if (a.total_hours) totalWorkingMinutes += a.total_hours * 60;
        });

        res.json({
            success: true,
            attendance: formattedAttendance,
            stats: {
                total: formattedAttendance.length,
                present: formattedAttendance.filter(a => a.status === 'present').length,
                half_day: formattedAttendance.filter(a => a.status === 'half_day').length,
                absent: formattedAttendance.filter(a => a.status === 'absent').length,
                total_working_minutes: totalWorkingMinutes,
                total_working_hours: Math.round((totalWorkingMinutes / 60) * 100) / 100,
                total_working_hours_display: `${Math.floor(totalWorkingMinutes / 60)}h ${Math.round(totalWorkingMinutes % 60)}m`
            }
        });
    } catch (error) {
        console.error('❌ Error in getEmployeeAttendanceReport:', error);
        res.status(500).json({ success: false, message: 'Failed to get attendance report', error: error.message });
    }
};

// Get overtime summary
exports.getOvertimeSummary = async (req, res) => {
    try {
        const { employee_id, month, year } = req.params;

        if (req.user?.employeeId !== employee_id && !['admin', 'sub_admin', 'hr'].includes(req.user?.role)) {
            return res.status(403).json({ success: false, message: 'Access denied. You can only view your own overtime data.' });
        }

        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0);
        const startDateStr = startDate.toISOString().split('T')[0];
        const endDateStr = endDate.toISOString().split('T')[0];
        const { data: overtime, error } = await supabase
            .from('overtime_earnings')
            .select('*')
            .eq('employee_id', employee_id)
            .gte('attendance_date', startDateStr)
            .lte('attendance_date', endDateStr)
            .order('attendance_date', { ascending: true });
        if (error) throw error;
        const totalMinutes = overtime?.reduce((sum, record) => sum + (record.overtime_minutes || 0), 0) || 0;
        const totalHours = overtime?.reduce((sum, record) => sum + (record.overtime_hours || 0), 0) || 0;
        const totalAmount = overtime?.reduce((sum, record) => sum + (record.overtime_amount || 0), 0) || 0;
        res.json({
            success: true, employee_id, month, year,
            overtime: overtime || [],
            summary: {
                total_days: overtime?.length || 0,
                total_minutes: totalMinutes,
                total_hours: totalHours,
                total_hours_display: `${Math.floor(totalMinutes / 60)}h ${Math.round(totalMinutes % 60)}m`,
                total_amount: totalAmount,
                average_per_day: overtime?.length > 0 ? (totalHours / overtime.length).toFixed(2) : 0
            }
        });
    } catch (error) {
        console.error('Error fetching overtime summary:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch overtime summary', error: error.message });
    }
};

// Get comp-off balance
exports.getCompOffBalance = async (req, res) => {
    try {
        const { employee_id } = req.params;
        const { data, error } = await supabase
            .from('employees')
            .select('comp_off_balance, total_comp_off_earned, total_comp_off_used')
            .eq('employee_id', employee_id)
            .single();
        if (error) throw error;
        res.json({
            success: true,
            comp_off_balance: data.comp_off_balance || 0,
            total_earned: data.total_comp_off_earned || 0,
            total_used: data.total_comp_off_used || 0
        });
    } catch (error) {
        console.error('Error fetching comp-off balance:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch comp-off balance', error: error.message });
    }
};

// Get comp-off history
exports.getCompOffHistory = async (req, res) => {
    try {
        const { employee_id } = req.params;

        // Authorization: employee can only view own, admin can view all
        if (req.user?.employeeId !== employee_id && !['admin', 'sub_admin', 'hr'].includes(req.user?.role)) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const { data, error } = await supabase
            .from('comp_off_earnings')
            .select('*')
            .eq('employee_id', employee_id)
            .order('attendance_date', { ascending: false });

        if (error) throw error;

        // Add expiry_date (attendance_date + 45 days) and status to each record
        const today = new Date().toISOString().split('T')[0];
        const earnings = (data || []).map(item => {
            const d = new Date(item.attendance_date);
            d.setDate(d.getDate() + 45);
            const expiry_date = d.toISOString().split('T')[0];
            return {
                ...item,
                expiry_date,
                status: item.is_used ? 'used' : (expiry_date < today ? 'expired' : 'available')
            };
        });

        res.json({ success: true, earnings });
    } catch (error) {
        console.error('Error fetching comp-off history:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch comp-off history', error: error.message });
    }
};

// Mark absent at day end
exports.markAbsentAtDayEnd = async () => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const now = new Date();
        const { data: employees } = await supabase.from('employees').select('employee_id');
        let markedCount = 0, updatedCount = 0;
        for (const emp of employees || []) {
            const { data: attendance } = await supabase
                .from('attendance')
                .select('*')
                .eq('employee_id', emp.employee_id)
                .eq('attendance_date', today);
            if (!attendance || attendance.length === 0) {
                await supabase.from('attendance').insert([{ employee_id: emp.employee_id, attendance_date: today, status: 'absent' }]);
                markedCount++;
            } else if (attendance[0].clock_in && !attendance[0].clock_out) {
                let clockInDate;
                if (attendance[0].clock_in_ist) {
                    const [datePart, timePart] = attendance[0].clock_in_ist.split(' ');
                    const [year, month, day] = datePart.split('-');
                    const [hour, minute, second] = timePart.split(':');
                    clockInDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute), parseInt(second || 0));
                } else {
                    clockInDate = new Date(attendance[0].clock_in);
                }
                const totalMinutes = calculateTimeDifferenceInMinutes(clockInDate, now);
                const totalHours = totalMinutes / 60;
                await supabase
                    .from('attendance')
                    .update({ status: 'half_day', total_hours: totalHours, total_minutes: totalMinutes })
                    .eq('id', attendance[0].id);
                updatedCount++;
            }
        }
        return { success: true, message: `Marked ${markedCount} absent, ${updatedCount} half_day` };
    } catch (error) {
        console.error('Error marking absent:', error);
        return { success: false, error: error.message };
    }
};

// Update historical late marks for all attendance records
exports.updateHistoricalLateMarks = async (req, res) => {
    try {
        console.log('🚀 Starting historical late marks update via API...');

        // Get all attendance records with employee shift timing
        let { data: attendanceRecords, error: attendanceError } = await supabase
            .from('attendance')
            .select(`
                id,
                employee_id,
                attendance_date,
                clock_in,
                clock_in_ist,
                late_minutes,
                late_display,
                shift_time_used,
                employees!inner(shift_timing, "isFlexibleShift")
            `)
            .not('clock_in', 'is', null)
            .order('attendance_date', { ascending: false });

        if (attendanceError && /isFlexibleShift|does not exist/i.test(attendanceError.message || '')) {
            ({ data: attendanceRecords, error: attendanceError } = await supabase
                .from('attendance')
                .select(`
                    id,
                    employee_id,
                    attendance_date,
                    clock_in,
                    clock_in_ist,
                    late_minutes,
                    late_display,
                    shift_time_used,
                    employees!inner(shift_timing)
                `)
                .not('clock_in', 'is', null)
                .order('attendance_date', { ascending: false }));
        }

        if (attendanceError) {
            throw attendanceError;
        }

        console.log(`📊 Found ${attendanceRecords.length} attendance records to process`);

        let updatedCount = 0;
        let alreadyCorrectCount = 0;
        let errorCount = 0;

        for (const record of attendanceRecords) {
            try {
                // Parse clock in time
                let clockInTime;
                const clockInValue = record.clock_in_ist || record.clock_in;

                if (clockInValue && typeof clockInValue === 'string' && clockInValue.includes(' ')) {
                    const [datePart, timePart] = clockInValue.split(' ');
                    const [year, month, day] = datePart.split('-');
                    const [hour, minute, second] = timePart.split(':');
                    clockInTime = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute), parseInt(second || 0));
                } else {
                    clockInTime = new Date(clockInValue);
                }

                if (!clockInTime || isNaN(clockInTime.getTime())) {
                    console.log(`⚠️ Invalid clock in time for record ${record.id}: ${clockInValue}`);
                    errorCount++;
                    continue;
                }

                // Parse shift timing
                let shiftHour = 9, shiftMinute = 0;
                const shiftString = record.employees?.shift_timing || record.shift_time_used;

                if (shiftString) {
                    let startTimeStr = shiftString.trim();

                    if (startTimeStr.includes('-')) {
                        startTimeStr = startTimeStr.split('-')[0].trim();
                    }

                    let parsed = false;

                    // Pattern 1: "9:00 AM" or "3:00 PM"
                    const ampmMatch = startTimeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
                    if (ampmMatch) {
                        let hour = parseInt(ampmMatch[1]);
                        const minute = parseInt(ampmMatch[2]);
                        const ampm = ampmMatch[3].toUpperCase();

                        if (ampm === 'PM' && hour !== 12) hour += 12;
                        if (ampm === 'AM' && hour === 12) hour = 0;

                        shiftHour = hour;
                        shiftMinute = minute;
                        parsed = true;
                    }

                    // Pattern 2: "15:00" (24-hour format)
                    if (!parsed) {
                        const militaryMatch = startTimeStr.match(/(\d{1,2}):(\d{2})/);
                        if (militaryMatch) {
                            shiftHour = parseInt(militaryMatch[1]);
                            shiftMinute = parseInt(militaryMatch[2]);
                            parsed = true;
                        }
                    }

                    // Pattern 3: Just hour "9" or "15"
                    if (!parsed) {
                        const hourMatch = startTimeStr.match(/^(\d{1,2})$/);
                        if (hourMatch) {
                            shiftHour = parseInt(hourMatch[1]);
                            shiftMinute = 0;
                            parsed = true;
                        }
                    }
                }

                // Create shift start time for the attendance date
                const attendanceDate = new Date(record.attendance_date);
                const shiftStartTime = new Date(
                    attendanceDate.getFullYear(),
                    attendanceDate.getMonth(),
                    attendanceDate.getDate(),
                    shiftHour,
                    shiftMinute,
                    0,
                    0
                );

                // Flexible-shift employees never get a late mark — skip the shift-time diff entirely.
                const isFlexibleShift = isFlexibleShiftEnabled(record.employees || {});

                // Calculate late time
                const diffMs = isFlexibleShift ? 0 : clockInTime - shiftStartTime;
                const isLate = !isFlexibleShift && diffMs > 0; // Any delay is late

                let lateMinutes = 0;
                let lateDisplay = null;

                if (isLate) {
                    lateMinutes = diffMs / (1000 * 60);

                    // Format late display
                    const totalSeconds = Math.floor(diffMs / 1000);
                    const hours = Math.floor(totalSeconds / 3600);
                    const remainingSeconds = totalSeconds % 3600;
                    const minutes = Math.floor(remainingSeconds / 60);
                    const seconds = remainingSeconds % 60;

                    const parts = [];
                    if (hours > 0) parts.push(`${hours}h`);
                    if (minutes > 0) parts.push(`${minutes}m`);
                    if (seconds > 0 || (hours === 0 && minutes === 0)) parts.push(`${seconds}s`);
                    lateDisplay = parts.join(' ');
                }

                const lateMinutesToSave = isLate ? parseFloat(lateMinutes.toFixed(4)) : 0;

                // Check if update is needed
                const currentLateMinutes = parseFloat(record.late_minutes) || 0;
                const needsUpdate = Math.abs(currentLateMinutes - lateMinutesToSave) > 0.01 ||
                    record.late_display !== lateDisplay;

                if (needsUpdate) {
                    const updatePayload = { late_minutes: lateMinutesToSave };
                    if (record.hasOwnProperty('late_display')) {
                        updatePayload.late_display = lateDisplay;
                    }
                    const { error: updateError } = await supabase
                        .from('attendance')
                        .update(updatePayload)
                        .eq('id', record.id);

                    if (updateError) {
                        console.error(`❌ Error updating record ${record.id}:`, updateError);
                        errorCount++;
                    } else {
                        updatedCount++;
                        if (isLate) {
                            console.log(`✅ Updated ${record.employee_id} (${record.attendance_date}): Late ${lateDisplay}`);
                        }
                    }
                } else {
                    alreadyCorrectCount++;
                }

            } catch (recordError) {
                console.error(`❌ Error processing record ${record.id}:`, recordError);
                errorCount++;
            }
        }

        const result = {
            success: true,
            message: 'Historical late marks update completed successfully',
            totalRecords: attendanceRecords.length,
            updatedCount,
            alreadyCorrectCount,
            errorCount
        };

        console.log('📈 HISTORICAL LATE MARKS UPDATE COMPLETED');
        console.log(`✅ Updated records: ${updatedCount}`);
        console.log(`✓ Already correct: ${alreadyCorrectCount}`);
        console.log(`❌ Errors: ${errorCount}`);
        console.log(`📊 Total processed: ${attendanceRecords.length}`);

        res.json(result);

    } catch (error) {
        console.error('❌ Error in updateHistoricalLateMarks:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update historical late marks',
            error: error.message
        });
    }
};

// Mark absent employees as leave (manual trigger)
exports.markAbsentEmployeesAsLeave = async (req, res) => {
    try {
        console.log('🔄 Manual trigger: markAbsentEmployeesAsLeave called');

        const { markAbsentEmployeesAsLeave } = require('../cron/absentEmployeeCheck');
        const result = await markAbsentEmployeesAsLeave();

        console.log('📊 Result from cron function:', result);

        if (result.success) {
            res.json({
                success: true,
                message: result.message,
                data: {
                    date: result.date,
                    totalEmployees: result.totalEmployees,
                    absentCount: result.absentCount,
                    leaveCreatedCount: result.leaveCreatedCount,
                    skippedCount: result.skippedCount
                }
            });
        } else {
            console.error('❌ Cron function returned error:', result.error);
            res.status(500).json({
                success: false,
                message: 'Failed to process absent employees',
                error: result.error
            });
        }
    } catch (error) {
        console.error('❌ Error in markAbsentEmployeesAsLeave API:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to process absent employees',
            error: error.message
        });
    }
};

// Get team attendance report for reporting manager
exports.getTeamAttendanceReport = async (req, res) => {
    try {
        const { start, end, employee_id, view_type } = req.query;
        const managerEmployeeId = req.user?.employeeId;
        const userRole = req.user?.role;

        console.log('📊 Fetching team attendance report for manager:', managerEmployeeId);
        console.log('Query params:', { start, end, employee_id, view_type });

        // Get manager details
        const manager = await getEmployeeById(managerEmployeeId);
        if (!manager) {
            return res.status(404).json({ success: false, message: 'Manager not found' });
        }

        const managerName = `${manager.first_name || ''} ${manager.last_name || ''}`.trim().toLowerCase();

        // Get all team members (employees reporting to this manager)
        const teamEmployeeIds = await getTeamEmployeeIdsByManagerName(managerName);

        if (teamEmployeeIds.length === 0) {
            return res.json({
                success: true,
                team_members: [],
                attendance: [],
                daily_stats: {},
                employee_summary: [],
                summary: {
                    total_team_members: 0,
                    total_present_today: 0,
                    total_absent_today: 0,
                    total_on_leave_today: 0,
                    total_half_day_today: 0,
                    total_late_today: 0,
                    total_working_today: 0,
                    team_attendance_rate: 0
                },
                message: 'No team members found'
            });
        }

        // Get team member details — is_active filter is defense-in-depth here (teamEmployeeIds
        // above already only contains active employees), so a deactivated employee can never
        // resurface even if this query were ever reached with a stale/unfiltered id list.
        let { data: teamMembers, error: teamError } = await supabase
            .from('employees')
            .select('employee_id, first_name, last_name, department, designation, joining_date, shift_timing, profile_image, "isFlexibleShift"')
            .in('employee_id', teamEmployeeIds)
            .eq('is_active', true);

        if (teamError && /isFlexibleShift|does not exist/i.test(teamError.message || '')) {
            ({ data: teamMembers, error: teamError } = await supabase
                .from('employees')
                .select('employee_id, first_name, last_name, department, designation, joining_date, shift_timing, profile_image')
                .in('employee_id', teamEmployeeIds)
                .eq('is_active', true));
        }

        if (teamError) throw teamError;

        // If specific employee requested, filter
        let targetEmployees = teamMembers;
        if (employee_id && teamEmployeeIds.includes(employee_id)) {
            targetEmployees = teamMembers.filter(emp => emp.employee_id === employee_id);
        }

        // Set date range
        let startDate, endDate;
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];

        if (view_type === 'daily' && start) {
            startDate = start;
            endDate = start;
        } else if (view_type === 'monthly') {
            // Get salary cycle dates (26th to 25th)
            if (start && end) {
                startDate = start;
                endDate = end;
            } else {
                // Default to current salary cycle
                const currentDate = new Date();
                if (currentDate.getDate() >= 26) {
                    startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 26).toISOString().split('T')[0];
                    endDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 25).toISOString().split('T')[0];
                } else {
                    startDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 26).toISOString().split('T')[0];
                    endDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 25).toISOString().split('T')[0];
                }
            }
        } else {
            // Default to current month
            startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
            endDate = todayStr;
        }

        console.log(`📅 Date range: ${startDate} to ${endDate}`);

        // Fetch attendance for all team members
        const { data: attendanceData, error: attendanceError } = await supabase
            .from('attendance')
            .select('*, employees!inner(first_name, last_name, department, shift_timing)')
            .in('employee_id', targetEmployees.map(emp => emp.employee_id))
            .gte('attendance_date', startDate)
            .lte('attendance_date', endDate)
            .order('attendance_date', { ascending: true });

        if (attendanceError) throw attendanceError;

        // Fetch leave data for the same period
        const { data: leaveData, error: leaveError } = await supabase
            .from('leaves')
            .select('*')
            .in('employee_id', targetEmployees.map(emp => emp.employee_id))
            .eq('status', 'approved')
            .gte('start_date', startDate)
            .lte('end_date', endDate);

        if (leaveError) console.error('Error fetching leaves:', leaveError);

        // Create leave map for quick lookup
        const leaveMap = {};
        (leaveData || []).forEach(leave => {
            const leaveStart = new Date(leave.start_date);
            const leaveEnd = new Date(leave.end_date);

            for (let d = new Date(leaveStart); d <= leaveEnd; d.setDate(d.getDate() + 1)) {
                const dateStr = d.toISOString().split('T')[0];
                const key = `${leave.employee_id}-${dateStr}`;
                leaveMap[key] = {
                    type: leave.leave_type,
                    reason: leave.reason
                };
            }
        });

        // Process attendance data
        const formattedAttendance = [];
        const dailyStats = {};
        const employeeStats = {};

        // Initialize employee stats
        targetEmployees.forEach(emp => {
            employeeStats[emp.employee_id] = {
                employee_id: emp.employee_id,
                name: `${emp.first_name} ${emp.last_name}`,
                department: emp.department,
                total_present: 0,
                total_half_day: 0,
                total_absent: 0,
                total_on_leave: 0,
                total_late: 0,
                total_late_minutes: 0,
                total_overtime_hours: 0,
                total_working_hours: 0,
                total_break_minutes: 0,
                working_days_count: 0,
                attendance_rate: 0
            };
        });

        // Get all dates in range
        const dateRange = [];
        let currentDate = new Date(startDate);
        const endDateTime = new Date(endDate);

        while (currentDate <= endDateTime) {
            const dateStr = currentDate.toISOString().split('T')[0];
            const dayOfWeek = currentDate.getDay();
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
            dateRange.push({ date: dateStr, isWeekend });
            currentDate.setDate(currentDate.getDate() + 1);
        }

        // Build attendance map
        const attendanceMap = {};
        (attendanceData || []).forEach(record => {
            const key = `${record.employee_id}-${record.attendance_date}`;
            attendanceMap[key] = record;
        });

        // Bulk-fetch break minutes for every team member/date in this report
        const { data: teamBreakRows } = await supabase.from('employee_breaks')
            .select('employee_id, attendance_date, break_duration_minutes')
            .in('employee_id', targetEmployees.map(emp => emp.employee_id))
            .gte('attendance_date', startDate)
            .lte('attendance_date', endDate)
            .not('break_duration_minutes', 'is', null);
        const teamBreakMinutesMap = {};
        (teamBreakRows || []).forEach(b => {
            const key = `${b.employee_id}-${b.attendance_date}`;
            teamBreakMinutesMap[key] = (teamBreakMinutesMap[key] || 0) + (b.break_duration_minutes || 0);
        });

        // In getTeamAttendanceReport function - Update the status determination section
        for (const emp of targetEmployees) {
            const isFlexibleShift = isFlexibleShiftEnabled(emp);
            for (const { date, isWeekend } of dateRange) {
                const attendanceKey = `${emp.employee_id}-${date}`;
                const attendance = attendanceMap[attendanceKey];
                const leave = leaveMap[attendanceKey];

                let status = 'absent';
                let clockIn = null;
                let clockOut = null;
                let totalHours = 0;
                let lateMinutes = 0;
                let isLate = false;
                let overtimeHours = 0;
                let statusDisplay = 'A';
                let statusColor = 'danger';

                if (isWeekend) {
                    status = 'weekend';
                    statusDisplay = 'W';
                    statusColor = 'secondary';
                } else if (leave && leave.type === 'Unpaid') {
                    status = 'on_leave';
                    statusDisplay = 'L';
                    statusColor = 'purple';
                } else if (leave) {
                    // Approved Paid Leave (Annual/Sick/Personal/Maternity/Paternity/Bereavement),
                    // Birthday Leave, or Comp-Off — company-approved leave shows Present, never
                    // Absent/on_leave, regardless of whether the employee clocked in that day.
                    status = 'present';
                    statusDisplay = leave.type === 'Birthday' ? 'BL' : leave.type === 'Comp-Off' ? 'CO' : 'PL';
                    statusColor = 'success';
                    employeeStats[emp.employee_id].total_present++;
                    employeeStats[emp.employee_id].working_days_count++;
                } else if (attendance) {
                    clockIn = attendance.clock_in_ist || attendance.clock_in;
                    clockOut = attendance.clock_out_ist || attendance.clock_out;
                    totalHours = parseFloat(attendance.total_hours) || 0;
                    // Flexible-shift employees never carry a late mark, regardless of what's stored.
                    lateMinutes = isFlexibleShift ? 0 : (parseFloat(attendance.late_minutes) || 0);
                    isLate = lateMinutes > 0;
                    overtimeHours = attendance.overtime_hours || 0;

                    // Calculate total minutes worked
                    let totalMinutes = 0;
                    if (clockIn && clockOut) {
                        const clockInDate = new Date(clockIn);
                        const clockOutDate = new Date(clockOut);
                        totalMinutes = Math.round((clockOutDate - clockInDate) / (1000 * 60));
                        if (totalMinutes < 0) totalMinutes += 24 * 60;
                        totalHours = totalMinutes / 60;
                    }

                    // Get expected work hours from employee's shift timing — ignored entirely for
                    // flexible-shift employees, who are always judged against a flat 9h/day.
                    const shiftTiming = parseShiftTiming(emp.shift_timing);
                    const expectedWorkHours = isFlexibleShift ? 9 : (shiftTiming.totalHours || 9);
                    const expectedWorkMinutes = expectedWorkHours * 60;

                    // ✅ UPDATED: Determine status based on actual working minutes vs expected
                    if (clockIn && clockOut && totalMinutes >= expectedWorkMinutes) {
                        status = 'present';
                        statusDisplay = 'P';
                        statusColor = isLate ? 'warning' : 'success';
                        employeeStats[emp.employee_id].total_present++;
                        employeeStats[emp.employee_id].working_days_count++;
                        employeeStats[emp.employee_id].total_working_hours += totalHours;
                    }
                    else if (clockIn && clockOut && totalMinutes >= 300 && totalMinutes < expectedWorkMinutes) {
                        status = 'half_day';
                        statusDisplay = 'HD';
                        statusColor = 'warning';
                        employeeStats[emp.employee_id].total_half_day++;
                        employeeStats[emp.employee_id].working_days_count++;
                        employeeStats[emp.employee_id].total_working_hours += totalHours;
                    }
                    else if (clockIn && !clockOut) {
                        status = 'working';
                        statusDisplay = 'W';
                        statusColor = 'info';
                        employeeStats[emp.employee_id].working_days_count++;
                        employeeStats[emp.employee_id].total_working_hours += totalHours;
                    }
                    else {
                        employeeStats[emp.employee_id].total_absent++;
                    }

                    if (isLate) {
                        employeeStats[emp.employee_id].total_late++;
                        employeeStats[emp.employee_id].total_late_minutes += lateMinutes;
                    }

                    if (overtimeHours > 0) {
                        employeeStats[emp.employee_id].total_overtime_hours += overtimeHours;
                    }
                } else {
                    employeeStats[emp.employee_id].total_absent++;
                }

                employeeStats[emp.employee_id].total_break_minutes += teamBreakMinutesMap[attendanceKey] || 0;

                // Daily stats for selected date (daily view) or today (monthly view)
                const statsDate = view_type === 'daily' ? startDate : todayStr;
                if (date === statsDate) {
                    if (!dailyStats[date]) {
                        dailyStats[date] = {
                            total_employees: targetEmployees.length,
                            present: 0,
                            absent: 0,
                            on_leave: 0,
                            half_day: 0,
                            working: 0,
                            weekend: 0,
                            late_count: 0,
                            present_count: 0
                        };
                    }

                    if (status === 'present') dailyStats[date].present_count++;
                    if (status === 'present') dailyStats[date].present++;
                    if (status === 'absent') dailyStats[date].absent++;
                    if (status === 'on_leave') dailyStats[date].on_leave++;
                    if (status === 'half_day') dailyStats[date].half_day++;
                    if (status === 'working') dailyStats[date].working++;
                    if (status === 'weekend') dailyStats[date].weekend++;
                    if (isLate) dailyStats[date].late_count++;
                }

                formattedAttendance.push({
                    id: attendance?.id || `${emp.employee_id}-${date}`,
                    employee_id: emp.employee_id,
                    employee_name: `${emp.first_name} ${emp.last_name}`,
                    department: emp.department,
                    profile_image: emp.profile_image || null,
                    attendance_date: date,
                    clock_in: clockIn,
                    clock_out: clockOut,
                    total_hours: totalHours.toFixed(1),
                    status: status,
                    status_display: statusDisplay,
                    status_color: statusColor,
                    is_late: isLate,
                    late_minutes: lateMinutes,
                    late_display: lateMinutes > 0 ? formatLateTime(lateMinutes) : null,
                    overtime_hours: overtimeHours,
                    is_weekend: isWeekend,
                    leave_type: leave?.type || null,
                    // Populated only when `status: 'present'` is due to approved leave —
                    // frontend renders "Present — {present_reason}" for these days.
                    present_reason: (leave && leave.type !== 'Unpaid')
                        ? (leave.type === 'Birthday' ? 'Birthday Leave' : leave.type === 'Comp-Off' ? 'Comp-Off' : 'Paid Leave')
                        : null,
                    total_break_minutes: teamBreakMinutesMap[attendanceKey] || 0
                });
            }
        }

        // Calculate attendance rates and summary
        const totalWorkingDays = dateRange.filter(d => !d.isWeekend).length;
        const employeeSummary = Object.values(employeeStats).map(emp => {
            const attendanceRate = totalWorkingDays > 0
                ? ((emp.total_present + emp.total_half_day) / totalWorkingDays * 100).toFixed(1)
                : 0;

            return {
                ...emp,
                total_working_days: totalWorkingDays,
                attendance_rate: attendanceRate,
                avg_hours_per_day: emp.working_days_count > 0
                    ? (emp.total_working_hours / emp.working_days_count).toFixed(1)
                    : 0,
                avg_late_minutes: emp.total_late_count > 0
                    ? (emp.total_late_minutes / emp.total_late_count).toFixed(0)
                    : 0
            };
        });

        // Calculate team summary for selected date (daily) or today (monthly)
        const statsLookupDate = view_type === 'daily' ? startDate : todayStr;
        const todayStats = dailyStats[statsLookupDate] || {
            total_employees: targetEmployees.length,
            present: 0,
            absent: 0,
            on_leave: 0,
            half_day: 0,
            working: 0,
            weekend: 0,
            late_count: 0,
            present_count: 0
        };

        res.json({
            success: true,
            team_members: targetEmployees,
            attendance: formattedAttendance,
            date_range: { start: startDate, end: endDate },
            total_working_days: totalWorkingDays,
            daily_stats: todayStats,
            employee_summary: employeeSummary,
            summary: {
                total_team_members: targetEmployees.length,
                total_present_today: todayStats.present_count,
                total_absent_today: todayStats.absent,
                total_on_leave_today: todayStats.on_leave,
                total_half_day_today: todayStats.half_day,
                total_late_today: todayStats.late_count,
                total_working_today: todayStats.working,
                team_attendance_rate: totalWorkingDays > 0
                    ? (employeeSummary.reduce((sum, e) => sum + parseFloat(e.attendance_rate), 0) / employeeSummary.length).toFixed(1)
                    : 0
            }
        });

    } catch (error) {
        console.error('❌ Error in getTeamAttendanceReport:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch team attendance report',
            error: error.message
        });
    }
};

// Fix all attendance records where clock_out is NULL but session is already closed
// Runs for ALL employees at once - no need to run per employee
exports.fixOrphanedAttendance = async (req, res) => {
    try {
        console.log('🔧 Starting fixOrphanedAttendance for all employees...');

        // Get all attendance records with clock_out NULL
        let { data: orphaned, error } = await supabase
            .from('attendance')
            .select('id, employee_id, attendance_date, clock_in, clock_in_ist, session_id, employees!inner(shift_timing, "isFlexibleShift")')
            .not('clock_in', 'is', null)
            .is('clock_out', null);

        if (error && /isFlexibleShift|does not exist/i.test(error.message || '')) {
            ({ data: orphaned, error } = await supabase
                .from('attendance')
                .select('id, employee_id, attendance_date, clock_in, clock_in_ist, session_id, employees!inner(shift_timing)')
                .not('clock_in', 'is', null)
                .is('clock_out', null));
        }

        if (error) throw error;

        let fixed = 0, skipped = 0, blocked = 0;

        for (const record of (orphaned || [])) {
            if (!record.session_id) { skipped++; continue; }

            const { data: session } = await supabase
                .from('attendance_sessions')
                .select('is_active, clock_out_time')
                .eq('session_id', record.session_id)
                .eq('employee_id', record.employee_id)
                .maybeSingle();

            // Only fix if session is CLOSED (is_active = false)
            if (!session || session.is_active) { skipped++; continue; }

            const sessionClockOutTime = session.clock_out_time
                ? new Date(session.clock_out_time)
                : new Date();

            // Build clock_out_ist - keep on same date as attendance_date (night shift)
            const coMs = sessionClockOutTime.getTime() + IST_OFFSET_MS;
            const coIST = new Date(coMs);
            const coDatePart = `${coIST.getUTCFullYear()}-${String(coIST.getUTCMonth() + 1).padStart(2, '0')}-${String(coIST.getUTCDate()).padStart(2, '0')}`;
            const coTimePart = `${String(coIST.getUTCHours()).padStart(2, '0')}:${String(coIST.getUTCMinutes()).padStart(2, '0')}:${String(coIST.getUTCSeconds()).padStart(2, '0')}`;
            const recDate = record.attendance_date.split('T')[0];
            const clockOutIST = coDatePart > recDate
                ? `${recDate} ${coTimePart}`
                : `${coDatePart} ${coTimePart}`;

            const ciMs = toUTCMs(record.clock_in_ist || record.clock_in);
            let coMsVal = toUTCMs(clockOutIST);
            let totalMinutes = Math.round((coMsVal - ciMs) / (1000 * 60));
            if (totalMinutes < 0) totalMinutes += 24 * 60;

            // 15-hour hard cap: this repair path used to trust attendance_sessions.clock_out_time
            // blindly, with no ceiling and no 'missing' status — that produced the exact bug
            // reported for B2B241205 (total_hours 23.97, status 'present'). If the session's
            // recorded close time implies 15h+ elapsed, defer to the same rule as
            // closeStaleOpenAttendance: cap at clock_in + 15h and mark 'missing'.
            let finalClockOutMs = coMsVal;
            let fixStatus;
            if (totalMinutes >= MISSING_CLOCKOUT_THRESHOLD_MS / 60000) {
                finalClockOutMs = ciMs + MISSING_CLOCKOUT_THRESHOLD_MS;
                totalMinutes = MISSING_CLOCKOUT_THRESHOLD_MS / 60000;
                fixStatus = 'missing';
            } else if (isFlexibleShiftEnabled(record.employees || {})) {
                fixStatus = getFlexibleShiftStatus(totalMinutes).status;
            } else {
                const shiftT = parseShiftTiming(record.employees?.shift_timing);
                const expMin = (shiftT.totalHours || 9) * 60;
                fixStatus = totalMinutes >= expMin ? 'present' : totalMinutes >= 300 ? 'half_day' : 'absent';
            }
            const totalHours = totalMinutes / 60;
            const finalClockOutISO = new Date(finalClockOutMs).toISOString();
            const finalClockOutIST = utcMsToISTString(finalClockOutMs);

            const { error: updateErr } = await supabase.from('attendance').update({
                clock_out: finalClockOutISO,
                clock_out_ist: finalClockOutIST,
                total_hours: parseFloat(totalHours.toFixed(2)),
                total_minutes: totalMinutes,
                total_hours_display: `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`,
                status: fixStatus
            }).eq('id', record.id);

            if (updateErr) { console.error(`❌ Failed to fix ${record.employee_id} ${recDate}:`, updateErr); skipped++; }
            else {
                console.log(`✅ Fixed ${record.employee_id} (${recDate}): clock_out=${finalClockOutIST}, status=${fixStatus}`);
                fixed++;
            }
        }

        console.log(`🔧 fixOrphanedAttendance done: fixed=${fixed}, skipped=${skipped}`);

        if (res) {
            res.json({ success: true, message: `Fixed ${fixed} records, skipped ${skipped}`, fixed, skipped });
        }
        return { fixed, skipped };
    } catch (error) {
        console.error('❌ fixOrphanedAttendance error:', error);
        if (res) res.status(500).json({ success: false, message: error.message });
        return { fixed: 0, skipped: 0, error: error.message };
    }
};

// ── Attendance Import / Export ─────────────────────────────────────────────────

const VALID_CODES = new Set(['P', 'A', 'HD', 'L', 'WO', 'H', 'CO', 'PL']);

// Maps full-word values (as they appear in custom Excel sheets) to short codes.
// All lookups are done after .toUpperCase() so case variants are handled automatically.
const WORD_TO_CODE = {
    // Present
    'PRESENT':      'P',
    'WORKING':      'P',
    // Absent
    'ABSENT':       'A',
    'LEFT':         'A',
    // Half Day
    'HALF DAY':     'HD',
    'HALFDAY':      'HD',
    'HALF-DAY':     'HD',
    // Leave
    'LEAVE':        'L',
    // Week Off
    'WEEK OFF':     'WO',
    'WEEKLY OFF':   'WO',
    'WEEKOFF':      'WO',
    'WEEK-OFF':     'WO',
    // Holiday
    'HOLIDAY':      'H',
    // Comp Off
    'COMP OFF':     'CO',
    'COMPOFF':      'CO',
    'COMP-OFF':     'CO',
    // Paid Leave
    'PAID LEAVE':   'PL',
    'PAIDLEAVE':    'PL',
    'PAID-LEAVE':   'PL',
    // New Joinee = Present (employee joined and was present)
    'NEW JOINEE':   'P',
    'NEW JOINER':   'P',
    // NCNS (No Call No Show) = Absent
    'NCNS':         'A',
};

const CODE_TO_STATUS = {
    P:  'present',
    A:  'absent',
    HD: 'half_day',
    L:  'leave',
    WO: 'week_off',
    H:  'holiday',
    CO: 'present',   // stored with attendance_type='comp_off'
    PL: 'present',   // stored with attendance_type='paid_leave'
};

const STATUS_TO_CODE = {
    present:   'P',
    absent:    'A',
    half_day:  'HD',
    leave:     'L',
    week_off:  'WO',
    holiday:   'H',
    comp_off:  'CO',
};

exports.validateAttendanceImport = async (req, res) => {
    try {
        const { month, year, records } = req.body;
        if (!month || !year || !Array.isArray(records)) {
            return res.status(400).json({ success: false, message: 'month, year, and records[] are required' });
        }

        const { data: employees, error: empError } = await supabase
            .from('employees')
            .select('employee_id, first_name, middle_name, last_name')
            .eq('is_active', true);
        if (empError) throw empError;

        // Build lookups: by employee_id AND by normalized name
        // Each employee gets two keys:
        //   "first last"               — matches Excel names with no middle name
        //   "first middle last"        — matches Excel names that include middle name
        const empById = {};
        const empByName = {};
        (employees || []).forEach(e => {
            empById[e.employee_id] = e;

            const normalize = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();

            // Key without middle name
            const shortKey = normalize(`${e.first_name} ${e.last_name}`);
            if (shortKey) empByName[shortKey] = e;

            // Key with middle name (only when middle name exists)
            if (e.middle_name && e.middle_name.trim()) {
                const fullKey = normalize(`${e.first_name} ${e.middle_name} ${e.last_name}`);
                if (fullKey) empByName[fullKey] = e;
            }
        });

        // Salary period: 26th of previous month → end of selected month.
        // Days 26+ in a custom ordinal sheet belong to the previous month.
        const m = parseInt(month), y = parseInt(year);
        const prevM = m === 1 ? 12 : m - 1;
        const prevY = m === 1 ? y - 1 : y;
        const periodStart = `${prevY}-${String(prevM).padStart(2,'0')}-26`;
        const periodEnd   = `${y}-${String(m).padStart(2,'0')}-${String(new Date(y, m, 0).getDate()).padStart(2,'0')}`;

        const validMap = new Map(); // keyed by resolved employee_id to deduplicate
        const errors = [];
        const notFoundNames = [];
        let skippedNotFound = 0;

        for (const record of records) {
            const { employee_id, employee_name, dates } = record;

            // Resolve employee: name-based match has priority, employee_id is fallback
            let emp = null;
            if (employee_name) {
                const normalized = employee_name.toLowerCase().replace(/\s+/g, ' ').trim();
                emp = empByName[normalized] || null;
            }
            if (!emp && employee_id) {
                emp = empById[employee_id] || null;
            }

            // Not found in DB → skip silently, keep existing attendance untouched
            if (!emp) {
                skippedNotFound++;
                notFoundNames.push(employee_name || employee_id || '(blank)');
                continue;
            }

            const resolvedId = emp.employee_id;
            const empName    = `${emp.first_name} ${emp.last_name}`;
            const rowErrors  = [];
            const cleanDates = {};

            for (const [date, rawCode] of Object.entries(dates || {})) {
                const raw = String(rawCode || '').trim().toUpperCase();
                if (!raw) continue;

                // Normalize full-word values (e.g. "HOLIDAY" → "H", "ABSENT" → "A")
                const code = Object.prototype.hasOwnProperty.call(WORD_TO_CODE, raw)
                    ? WORD_TO_CODE[raw]
                    : raw;
                if (!code) continue; // null mapping (e.g. "NEW JOINEE") — skip silently

                const d = new Date(date);
                if (isNaN(d.getTime())) { rowErrors.push(`Invalid date: ${date}`); continue; }
                // Accept dates within the salary period: 26th of previous month → end of selected month
                if (date < periodStart || date > periodEnd) {
                    rowErrors.push(`Date ${date} is outside the salary period (${periodStart} to ${periodEnd})`); continue;
                }
                if (!VALID_CODES.has(code)) { rowErrors.push(`"${raw}" on ${date} — not a recognised code`); continue; }
                cleanDates[date] = code;
            }

            // Report errors for any unrecognised dates (but still import the clean ones)
            if (rowErrors.length > 0) {
                errors.push({ employee_id: resolvedId, employee_name: empName, errors: rowErrors });
            }
            // Always keep the valid dates — don't discard the whole record on partial errors
            if (Object.keys(cleanDates).length > 0) {
                if (validMap.has(resolvedId)) {
                    validMap.get(resolvedId).dates = { ...validMap.get(resolvedId).dates, ...cleanDates };
                } else {
                    validMap.set(resolvedId, { employee_id: resolvedId, employee_name: empName, dates: cleanDates });
                }
            }
        }

        const valid = Array.from(validMap.values());

        // Preview summary per valid employee
        const preview = valid.map(r => {
            const counts = { P: 0, A: 0, HD: 0, L: 0, WO: 0, H: 0, CO: 0 };
            Object.values(r.dates).forEach(c => { if (counts[c] !== undefined) counts[c]++; });
            return { employee_id: r.employee_id, employee_name: r.employee_name, ...counts };
        });

        console.log(`[AttendanceImport] DB employees (${employees.length}):`, Object.keys(empByName).slice(0, 10));
        console.log(`[AttendanceImport] Not matched names (${notFoundNames.length}):`, notFoundNames.slice(0, 10));

        res.json({
            success: true,
            valid_count: valid.length,
            error_count: errors.length,
            skipped_not_found: skippedNotFound,
            not_found_names: notFoundNames,
            valid_records: valid,
            preview,
            errors,
        });
    } catch (error) {
        console.error('❌ validateAttendanceImport:', error);
        res.status(500).json({ success: false, message: 'Validation failed', error: error.message });
    }
};

exports.importAttendance = async (req, res) => {
    try {
        const { month, year, file_name, records } = req.body;
        if (!month || !year || !Array.isArray(records)) {
            return res.status(400).json({ success: false, message: 'month, year, and records[] are required' });
        }

        const m = parseInt(month);
        const y = parseInt(year);

        // Pre-query existing records for the full salary cycle so we know their PKs.
        // IMPORTANT: filter by the specific employee IDs in this import to avoid
        // Supabase's default 1000-row query limit truncating results when there are many employees.
        const prevM = m === 1 ? 12 : m - 1;
        const prevY = m === 1 ? y - 1 : y;
        const startDate = `${prevY}-${String(prevM).padStart(2, '0')}-26`;
        const endDate   = `${y}-${String(m).padStart(2, '0')}-${new Date(y, m, 0).getDate()}`;

        const employeeIdsInRequest = [...new Set(records.map(r => r.employee_id).filter(Boolean))];

        const { data: existing } = await supabase
            .from('attendance')
            .select('id, employee_id, attendance_date')
            .in('employee_id', employeeIdsInRequest)
            .gte('attendance_date', startDate)
            .lte('attendance_date', endDate)
            .limit(10000);

        // Collect ALL record IDs per employee+date — duplicate records exist when imports
        // created ghost records alongside real clock-in records. Admin must override ALL of them.
        const existingMap = {};
        (existing || []).forEach(r => {
            const dateKey = r.attendance_date ? String(r.attendance_date).split('T')[0] : r.attendance_date;
            const key = `${r.employee_id}__${dateKey}`;
            if (!existingMap[key]) existingMap[key] = [];
            existingMap[key].push(r.id);
        });

        const toInsert = [];
        const toUpdate = [];

        for (const record of records) {
            const { employee_id, dates } = record;
            for (const [date, rawCode] of Object.entries(dates || {})) {
                const code = String(rawCode).toUpperCase();
                if (!VALID_CODES.has(code)) continue;

                const isHol   = code === 'H';
                const isWO    = code === 'WO';
                const isLeave = code === 'L';
                const isCO    = code === 'CO';
                const isPL    = code === 'PL';
                const isPaidFullDay = code === 'P' || isCO || isPL;
                const totalHours   = isPaidFullDay ? 9 : code === 'HD' ? 4.5 : 0;
                const totalMinutes = isPaidFullDay ? 540 : code === 'HD' ? 270 : 0;

                // WO/H/L use 'absent' status (DB constraint: present/absent/half_day).
                // CO/PL use 'present' with attendance_type set; salary calc respects this.
                const status  = (isWO || isHol) ? 'absent' : isLeave ? 'absent' : CODE_TO_STATUS[code];
                const attType = isCO ? 'comp_off' : isPL ? 'paid_leave' : null;

                const payload = {
                    employee_id,
                    attendance_date: date,
                    status,
                    attendance_type: attType,
                    is_holiday:    isHol || isWO,
                    holiday_name:  isHol ? 'Holiday' : isWO ? 'Week Off' : isLeave ? 'Leave' : null,
                    total_hours:   totalHours,
                    total_minutes: totalMinutes,
                    late_minutes:  0,  // Excel is source of truth — no late marks on import
                };

                const existingIds = existingMap[`${employee_id}__${date}`];
                if (existingIds && existingIds.length > 0) {
                    // Update ALL records for this date so admin status applies everywhere
                    existingIds.forEach(id => toUpdate.push({ id, ...payload }));
                } else {
                    toInsert.push(payload);
                }
            }
        }

        let insertedCount = 0, updatedCount = 0, failedCount = 0;
        const dbErrors = [];

        // Strip attendance_type from a batch when the column doesn't exist in the table
        const stripAttType = (rows) => rows.map(({ attendance_type: _at, ...rest }) => rest);

        const tryInsertBatch = async (batch) => {
            const { error } = await supabase.from('attendance').insert(batch);
            if (!error) { insertedCount += batch.length; return; }
            if (error.message?.includes('attendance_type')) {
                console.warn('⚠️ attendance_type column missing — retrying insert without it');
                const { error: e2 } = await supabase.from('attendance').insert(stripAttType(batch));
                if (e2) {
                    failedCount += batch.length;
                    const msg = e2.message || JSON.stringify(e2);
                    if (!dbErrors.includes(msg)) dbErrors.push(msg);
                } else {
                    insertedCount += batch.length;
                }
            } else {
                failedCount += batch.length;
                console.error('❌ insert batch:', error);
                const msg = error.message || error.details || JSON.stringify(error);
                if (!dbErrors.includes(msg)) dbErrors.push(msg);
            }
        };

        const tryUpdateRow = async ({ id, ...payload }) => {
            const { error } = await supabase.from('attendance').update(payload).eq('id', id);
            if (!error) { updatedCount++; return; }
            if (error.message?.includes('attendance_type')) {
                console.warn('⚠️ attendance_type column missing — retrying update without it');
                const { error: e2 } = await supabase.from('attendance').update(stripAttType([payload])[0]).eq('id', id);
                if (e2) { failedCount++; } else { updatedCount++; }
            } else {
                failedCount++;
                const msg = error?.message || error?.details || JSON.stringify(error);
                if (msg && !dbErrors.includes(msg)) dbErrors.push(msg);
            }
        };

        // Batch inserts (500 per call)
        for (let i = 0; i < toInsert.length; i += 500) {
            await tryInsertBatch(toInsert.slice(i, i + 500));
        }

        // Parallel updates — 100 concurrent calls at a time instead of one-by-one
        for (let i = 0; i < toUpdate.length; i += 100) {
            await Promise.all(toUpdate.slice(i, i + 100).map(tryUpdateRow));
        }

        // Log import
        try {
            await supabase.from('attendance_import_logs').insert([{
                month: m,
                year: y,
                file_name: file_name || null,
                total_records: records.length,
                inserted_records: insertedCount,
                updated_records: updatedCount,
                failed_records: failedCount,
                imported_by: req.user?.employeeId || req.user?.id || 'admin',
            }]);
        } catch (logErr) {
            console.error('⚠️ Import log failed (non-critical):', logErr.message);
        }

        res.json({
            success: true,
            message: `Import complete — ${insertedCount} inserted, ${updatedCount} updated, ${failedCount} failed`,
            inserted: insertedCount,
            updated: updatedCount,
            failed: failedCount,
            db_errors: dbErrors,
        });
    } catch (error) {
        console.error('❌ importAttendance:', error);
        res.status(500).json({ success: false, message: 'Import failed', error: error.message });
    }
};

exports.exportAttendanceData = async (req, res) => {
    try {
        const { month, year } = req.query;
        if (!month || !year) {
            return res.status(400).json({ success: false, message: 'month and year are required' });
        }
        const m = parseInt(month);
        const y = parseInt(year);
        const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
        const endDate   = `${y}-${String(m).padStart(2, '0')}-${new Date(y, m, 0).getDate()}`;

        const [{ data: attendance, error: attErr }, { data: employees, error: empErr }] = await Promise.all([
            supabase.from('attendance').select('employee_id, attendance_date, status, attendance_type, is_holiday, holiday_name')
                .gte('attendance_date', startDate).lte('attendance_date', endDate),
            supabase.from('employees').select('employee_id, first_name, last_name')
                .eq('is_active', true).order('employee_id'),
        ]);
        if (attErr) throw attErr;
        if (empErr) throw empErr;

        const attMap = {};
        for (const r of (attendance || [])) {
            if (!attMap[r.employee_id]) attMap[r.employee_id] = {};
            let code;
            if (r.attendance_type === 'paid_leave') code = 'PL';
            else if (r.attendance_type === 'comp_off') code = 'CO';
            else if (r.is_holiday && r.holiday_name === 'Week Off') code = 'WO';
            else if (r.is_holiday && r.holiday_name === 'Holiday') code = 'H';
            else if (r.is_holiday && r.holiday_name === 'Leave') code = 'L';
            else code = STATUS_TO_CODE[r.status] || r.status?.toUpperCase() || 'A';
            attMap[r.employee_id][r.attendance_date] = code;
        }

        const records = (employees || []).map(emp => ({
            employee_id:   emp.employee_id,
            employee_name: `${emp.first_name} ${emp.last_name}`,
            dates: attMap[emp.employee_id] || {},
        }));

        res.json({ success: true, month: m, year: y, start_date: startDate, end_date: endDate, records });
    } catch (error) {
        console.error('❌ exportAttendanceData:', error);
        res.status(500).json({ success: false, message: 'Export failed', error: error.message });
    }
};

exports.getImportHistory = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('attendance_import_logs')
            .select('*')
            .order('imported_at', { ascending: false })
            .limit(30);

        if (error) {
            if (error.code === '42P01') return res.json({ success: true, history: [] });
            throw error;
        }
        res.json({ success: true, history: data || [] });
    } catch (error) {
        console.error('❌ getImportHistory:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch history', error: error.message });
    }
};

// ── Admin Mark Attendance (with Paid Leave / Comp Off balance management) ─────
// POST /api/attendance/admin/mark
// Body: { employee_id, attendance_date, status_code }
//   status_code: 'present' | 'absent' | 'half_day' | 'week_off' | 'holiday' | 'leave' | 'paid_leave' | 'comp_off' | 'birthday_leave'
exports.adminMarkAttendance = async (req, res) => {
    try {
        const { employee_id, attendance_date, status_code } = req.body;

        if (!employee_id || !attendance_date || !status_code) {
            return res.status(400).json({ success: false, message: 'employee_id, attendance_date, and status_code are required' });
        }

        const ADMIN_MARK_VALID_CODES = ['present', 'absent', 'half_day', 'week_off', 'holiday', 'leave', 'paid_leave', 'comp_off', 'birthday_leave'];
        if (!ADMIN_MARK_VALID_CODES.includes(status_code)) {
            return res.status(400).json({ success: false, message: `Invalid status_code. Must be one of: ${ADMIN_MARK_VALID_CODES.join(', ')}` });
        }

        // ── Resolve DB fields from status_code ──────────────────────────────
        // attendance_type stored in DB: null | 'paid_leave' | 'comp_off'
        const typeMap = {
            present:   { dbStatus: 'present',  isHoliday: false, holidayName: null,       attType: null },
            absent:    { dbStatus: 'absent',   isHoliday: false, holidayName: null,       attType: null },
            half_day:  { dbStatus: 'half_day', isHoliday: false, holidayName: null,       attType: null },
            week_off:  { dbStatus: 'absent',   isHoliday: true,  holidayName: 'Week Off', attType: null },
            holiday:   { dbStatus: 'absent',   isHoliday: true,  holidayName: 'Holiday',  attType: null },
            leave:     { dbStatus: 'absent',   isHoliday: false, holidayName: 'Leave',    attType: null },
            paid_leave:{ dbStatus: 'present',  isHoliday: false, holidayName: null,       attType: 'paid_leave' },
            comp_off:  { dbStatus: 'present',  isHoliday: false, holidayName: null,       attType: 'comp_off' },
            birthday_leave: { dbStatus: 'present', isHoliday: false, holidayName: null,   attType: 'birthday_leave' },
        };
        const resolved = typeMap[status_code];

        // ── Fetch employee + current balances ────────────────────────────────
        const { data: employee, error: empErr } = await supabase
            .from('employees')
            .select('comp_off_balance, joining_date')
            .eq('employee_id', employee_id)
            .single();
        if (empErr || !employee) {
            return res.status(404).json({ success: false, message: 'Employee not found' });
        }

        const currentYear = new Date().getFullYear();

        // Paid leave balance from leave_balance table
        const { data: leaveBal } = await supabase
            .from('leave_balance')
            .select('current_balance')
            .eq('employee_id', employee_id)
            .eq('leave_year', currentYear)
            .maybeSingle();
        const paidLeaveBalance = parseFloat(leaveBal?.current_balance || 0);
        const compOffBalance   = parseFloat(employee.comp_off_balance || 0);

        // ── Backend validation for balance ───────────────────────────────────
        if (status_code === 'paid_leave' && paidLeaveBalance < 1) {
            return res.status(400).json({
                success: false,
                message: `Insufficient Paid Leave balance. Available: ${paidLeaveBalance.toFixed(1)} days.`
            });
        }
        if (status_code === 'comp_off' && compOffBalance < 1) {
            return res.status(400).json({
                success: false,
                message: `Insufficient Comp Off balance. Available: ${compOffBalance.toFixed(1)} days.`
            });
        }

        // ── Fetch existing record for this date (to restore old balance) ─────
        const { data: existing } = await supabase
            .from('attendance')
            .select('id, status, attendance_type, is_holiday, holiday_name')
            .eq('employee_id', employee_id)
            .eq('attendance_date', attendance_date)
            .maybeSingle();

        const oldType = existing?.attendance_type || null;

        // ── Restore previous balance if editing ──────────────────────────────
        if (existing && oldType !== resolved.attType) {
            if (oldType === 'paid_leave') {
                // Restore 1 paid leave
                if (leaveBal) {
                    await supabase.from('leave_balance').update({
                        current_balance: paidLeaveBalance + 1,
                        total_used: Math.max(0, (leaveBal.total_used || 0) - 1),
                        last_updated: new Date().toISOString()
                    }).eq('employee_id', employee_id).eq('leave_year', currentYear);
                }
            } else if (oldType === 'comp_off') {
                // Restore 1 comp off
                await supabase.from('employees').update({
                    comp_off_balance: compOffBalance + 1
                }).eq('employee_id', employee_id);
            }
        }

        // ── Deduct new balance ───────────────────────────────────────────────
        if (resolved.attType === 'paid_leave' && oldType !== 'paid_leave') {
            if (leaveBal) {
                await supabase.from('leave_balance').update({
                    current_balance: Math.max(0, paidLeaveBalance - 1),
                    total_used: (leaveBal.total_used || 0) + 1,
                    last_updated: new Date().toISOString()
                }).eq('employee_id', employee_id).eq('leave_year', currentYear);
            }
        } else if (resolved.attType === 'comp_off' && oldType !== 'comp_off') {
            await supabase.from('employees').update({
                comp_off_balance: Math.max(0, compOffBalance - 1)
            }).eq('employee_id', employee_id);
        }

        // ── Upsert attendance record ─────────────────────────────────────────
        const payload = {
            employee_id,
            attendance_date,
            status:           resolved.dbStatus,
            is_holiday:       resolved.isHoliday,
            holiday_name:     resolved.holidayName,
            attendance_type:  resolved.attType,
            total_hours:      resolved.dbStatus === 'present' ? 9 : resolved.dbStatus === 'half_day' ? 4.5 : 0,
            total_minutes:    resolved.dbStatus === 'present' ? 540 : resolved.dbStatus === 'half_day' ? 270 : 0,
            late_minutes:     0,
        };

        let upsertError;
        if (existing) {
            const { error } = await supabase.from('attendance').update(payload).eq('id', existing.id);
            upsertError = error;
        } else {
            const { error } = await supabase.from('attendance').insert([payload]);
            upsertError = error;
        }

        if (upsertError) {
            // attendance_type column may not exist yet — retry without it
            if (upsertError.message && upsertError.message.includes('attendance_type')) {
                const { attendance_type: _removed, ...payloadWithout } = payload;
                if (existing) {
                    const { error } = await supabase.from('attendance').update(payloadWithout).eq('id', existing.id);
                    if (error) throw error;
                } else {
                    const { error } = await supabase.from('attendance').insert([payloadWithout]);
                    if (error) throw error;
                }
                console.warn('⚠️ attendance_type column missing — saved without it. Run migration to add the column.');
            } else {
                throw upsertError;
            }
        }

        return res.json({
            success: true,
            message: `Attendance marked as ${status_code} for ${attendance_date}`,
            status_code,
            attendance_type: resolved.attType,
            db_status: resolved.dbStatus,
        });

    } catch (error) {
        console.error('❌ adminMarkAttendance error:', error);
        res.status(500).json({ success: false, message: 'Failed to mark attendance', error: error.message });
    }
};

// ── Company Holidays (HOL) ────────────────────────────────────────────────────
// HR/Admin marks a date as a company-wide holiday from the Attendance Reports page. Stored in
// company_holidays (see services/companyHolidayService.js) — no per-employee attendance rows
// are created; getAttendanceReport/getEmployeeAttendanceReport resolve HOL for every employee
// on that date at read time, the same way the static holiday calendar already works.
const isValidDateStr = (s) => {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const [y, m, d] = s.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

// POST /api/attendance/holidays — HR/Admin only (requireAdmin, applied at the route)
exports.createCompanyHoliday = async (req, res) => {
    try {
        const { date, name } = req.body;
        if (!date || !isValidDateStr(date)) {
            return res.status(400).json({ success: false, message: 'A valid date (YYYY-MM-DD) is required' });
        }

        const created = await CompanyHolidayService.create(date, name, req.user?.employeeId);
        return res.json({
            success: true,
            message: `Holiday applied successfully for ${date}.`,
            holiday: created,
        });
    } catch (error) {
        if (error.code === 'DUPLICATE_HOLIDAY') {
            return res.status(409).json({ success: false, code: 'DUPLICATE_HOLIDAY', message: error.message });
        }
        console.error('❌ createCompanyHoliday error:', error);
        res.status(500).json({ success: false, message: 'Failed to apply holiday', error: error.message });
    }
};

// GET /api/attendance/holidays — any authenticated role (read-only; the report/status
// endpoints below need every employee's own attendance page to agree with the admin report).
exports.listCompanyHolidays = async (req, res) => {
    try {
        const holidays = await CompanyHolidayService.getAll();
        res.json({ success: true, holidays });
    } catch (error) {
        console.error('❌ listCompanyHolidays error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch holidays', error: error.message });
    }
};

// POST /api/attendance/apply-early-logout
// body: { employee_ids: [...], date: 'YYYY-MM-DD' }
// Lets a TL/Manager mark employees who left early Present instead of Half Day for one date
// (scoped to their own team), or an Admin/HR do the same for any employee company-wide.
// Only employees who actually clocked in that day are eligible — someone who never clocked
// in is genuinely absent and this action does not touch them. HR + all Managers (sub_admin)
// get a notification email afterward regardless of who performed the action, since this
// overrides attendance in a way that affects payroll and deserves a paper trail.
exports.applyEarlyLogout = async (req, res) => {
    try {
        const { employee_ids, date } = req.body;
        const { role, employeeId: actingEmployeeId } = req.user || {};

        if (!Array.isArray(employee_ids) || employee_ids.length === 0) {
            return res.status(400).json({ success: false, message: 'employee_ids is required' });
        }
        if (!date) {
            return res.status(400).json({ success: false, message: 'date is required' });
        }

        const COMPANY_WIDE_ROLES = ['admin', 'hr'];
        const TEAM_SCOPED_ROLES = ['manager', 'sub_admin'];
        if (!COMPANY_WIDE_ROLES.includes(role) && !TEAM_SCOPED_ROLES.includes(role)) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        let allowedIds = null; // null = no restriction (admin/hr, company-wide)
        if (TEAM_SCOPED_ROLES.includes(role)) {
            const acting = await getEmployeeById(actingEmployeeId);
            if (!acting) return res.status(404).json({ success: false, message: 'Acting user not found' });
            const actingName = `${acting.first_name || ''} ${acting.last_name || ''}`.trim();
            allowedIds = new Set(await getTeamEmployeeIdsByManagerName(actingName));
        }

        const results = [];
        const appliedIds = [];

        for (const empId of employee_ids) {
            if (allowedIds && !allowedIds.has(empId)) {
                results.push({ employee_id: empId, success: false, message: 'Not in your team' });
                continue;
            }

            const { data: att, error: attErr } = await supabase
                .from('attendance')
                .select('id, clock_in, status')
                .eq('employee_id', empId)
                .eq('attendance_date', date)
                .maybeSingle();

            if (attErr || !att) {
                results.push({ employee_id: empId, success: false, message: 'No attendance record for this date' });
                continue;
            }
            if (!att.clock_in) {
                results.push({ employee_id: empId, success: false, message: 'Employee did not clock in this day' });
                continue;
            }
            if (att.status === 'present') {
                results.push({ employee_id: empId, success: true, message: 'Already Present' });
                continue;
            }

            const { error: updateErr } = await supabase
                .from('attendance')
                .update({ status: 'present', updated_at: new Date().toISOString() })
                .eq('id', att.id);

            if (updateErr) {
                results.push({ employee_id: empId, success: false, message: updateErr.message });
                continue;
            }

            results.push({ employee_id: empId, success: true, message: 'Marked Present (Early Logout)' });
            appliedIds.push(empId);
        }

        // Fire-and-forget — never block the response on the notification email.
        if (appliedIds.length > 0) {
            (async () => {
                try {
                    const [{ data: recipients }, { data: namedEmployees }, acting] = await Promise.all([
                        supabase.from('employees').select('email').in('role', ['hr', 'sub_admin']).eq('is_active', true),
                        supabase.from('employees').select('employee_id, first_name, last_name').in('employee_id', appliedIds),
                        getEmployeeById(actingEmployeeId),
                    ]);
                    const notifyEmails = (recipients || []).map(r => r.email).filter(Boolean);
                    if (notifyEmails.length === 0) return;
                    const actingName = acting ? `${acting.first_name || ''} ${acting.last_name || ''}`.trim() : actingEmployeeId;
                    await sendEarlyLogoutAppliedEmail(notifyEmails, {
                        actingName,
                        actingRole: role,
                        date,
                        employees: (namedEmployees || []).map(e => `${e.first_name || ''} ${e.last_name || ''}`.trim()),
                    });
                } catch (emailErr) {
                    console.error('⚠️ Failed to send early-logout notification email:', emailErr.message);
                }
            })();
        }

        res.json({ success: true, results });
    } catch (error) {
        console.error('❌ applyEarlyLogout error:', error);
        res.status(500).json({ success: false, message: 'Failed to apply early logout', error: error.message });
    }
};

// POST /api/attendance/quick-regularize
// body: { employee_id, date: 'YYYY-MM-DD' }
// Undoes an accidental Clock Out: clears clock_out (and clock_out_ist), resets the row back
// to the exact shape a still-open session has (confirmed live: status stays 'present' — the
// "Working" label is a frontend-only computed state from clock_in && !clock_out, never a
// literal stored status — plus total_hours/total_minutes/total_hours_display and overtime
// fields reset to their fresh-clock-in defaults, since all of those were computed from the
// clock_out being undone). clock_in is left untouched. Re-opens the attendance_sessions row
// so the employee's dashboard shows a live "Working since <clock_in>" banner and the Clock
// Out button again, exactly as if they'd never clocked out. Same admin/hr company-wide vs
// manager/sub_admin own-team-only scoping as applyEarlyLogout above.
exports.quickRegularizeClockOut = async (req, res) => {
    try {
        const { employee_id, date } = req.body;
        const { role, employeeId: actingEmployeeId } = req.user || {};

        if (!employee_id) return res.status(400).json({ success: false, message: 'employee_id is required' });
        if (!date) return res.status(400).json({ success: false, message: 'date is required' });

        const COMPANY_WIDE_ROLES = ['admin', 'hr'];
        const TEAM_SCOPED_ROLES = ['manager', 'sub_admin'];
        if (!COMPANY_WIDE_ROLES.includes(role) && !TEAM_SCOPED_ROLES.includes(role)) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        if (TEAM_SCOPED_ROLES.includes(role)) {
            const acting = await getEmployeeById(actingEmployeeId);
            if (!acting) return res.status(404).json({ success: false, message: 'Acting user not found' });
            const actingName = `${acting.first_name || ''} ${acting.last_name || ''}`.trim();
            const teamIds = await getTeamEmployeeIdsByManagerName(actingName);
            if (!teamIds.includes(employee_id)) {
                return res.status(403).json({ success: false, message: 'You can only regularize your own team members' });
            }
        }

        const { data: att, error: fetchErr } = await supabase
            .from('attendance')
            .select('id, clock_in, clock_out, session_id')
            .eq('employee_id', employee_id)
            .eq('attendance_date', date)
            .maybeSingle();

        if (fetchErr || !att) return res.status(404).json({ success: false, message: 'No attendance record for this date' });
        if (!att.clock_in) return res.status(400).json({ success: false, message: 'Employee never clocked in this day — nothing to regularize' });
        if (!att.clock_out) return res.status(400).json({ success: false, message: 'Employee is already clocked in — nothing to regularize' });

        const { error: updErr } = await supabase
            .from('attendance')
            .update({
                clock_out: null,
                clock_out_ist: null,
                status: 'present',
                total_hours: 0,
                total_minutes: 0,
                total_hours_display: null,
                overtime_hours: null,
                overtime_minutes: null,
                overtime_amount: 0,
                has_overtime: false,
                updated_at: new Date().toISOString(),
            })
            .eq('id', att.id);

        if (updErr) return res.status(500).json({ success: false, message: updErr.message });

        if (att.session_id) {
            await supabase
                .from('attendance_sessions')
                .update({ is_active: true, clock_out_time: null })
                .eq('session_id', att.session_id)
                .eq('employee_id', employee_id);
        }

        console.log(`⚠️  [quickRegularizeClockOut] ${employee_id} clock-out reversed for ${date} by ${actingEmployeeId} (${role})`);
        res.json({ success: true, message: 'Clock-out reversed — employee is marked as working again for this date.' });
    } catch (error) {
        console.error('❌ quickRegularizeClockOut error:', error);
        res.status(500).json({ success: false, message: 'Failed to quick-regularize', error: error.message });
    }
};

// Shared low-level helpers exposed for reuse by regularizationService.js — do not
// duplicate this logic elsewhere; import it from here instead.
exports._shared = {
    parseShiftTiming, calculateOvertime, recalculateLate, getEffectiveShiftTiming,
    toUTCMs, istStringToUTCISO, nowIST, pickBetterAttendanceRow,
};

module.exports = exports;