const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const attendanceController = require('../controllers/attendanceController');
const regularizationController = require('../controllers/regularizationController');
const { isAdminOrFinanceOrDesktopSupport } = require('../middleware/auth');
const { getEmployeeById, getTeamEmployeeIdsByManagerName } = require('../utils/employeeLookup');

// Same 4MB cap + extension whitelist as the onboarding attachment upload.
const regularizationUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 4 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const allowed = /\.(jpe?g|png|pdf|docx?)$/i.test(path.extname(file.originalname));
        cb(null, allowed);
    },
});

// Note: This module exports a function that takes supabase, authenticateToken, and requireAdmin
module.exports = (supabase, authenticateToken, requireAdmin) => {

    // Lightweight probe the dashboard polls to decide whether to show/hide the clock
    // in-out button. The Housekeeper network gate is mounted on this whole /api/attendance
    // router in server.js — if the caller is off-network it already 403s before this
    // handler ever runs, so reaching here at all means "on network, safe to clock in/out".
    router.get('/network-status', (req, res) => res.json({ success: true }));

    // Clock in/out endpoints
    router.post('/clock-in', attendanceController.clockIn);
    router.post('/clock-out', attendanceController.clockOut);
    router.post('/heartbeat', attendanceController.heartbeat);

    router.post('/clock-out-missed', authenticateToken, attendanceController.clockOutMissed);

    // Get today's attendance for an employee
    router.get('/today/:employee_id', attendanceController.getTodayAttendance);

    // Employee self-service attendance report
    router.get('/employee-report/:employee_id', authenticateToken, attendanceController.getEmployeeAttendanceReport);

    // Regularization endpoints (Employee)
    router.get('/missed-clockouts/:employee_id', attendanceController.getMissedClockOuts);
    router.post('/regularization/:employee_id/request', authenticateToken, regularizationUpload.single('attachment'), regularizationController.createRequest);
    router.get('/regularization/mine/:employee_id', authenticateToken, regularizationController.listMyRequests);

    // Admin-only attendance report (also allowed for desktop_support and finance) — the
    // comment always said desktop_support was meant to have access, but isAdminOrFinance
    // never actually included that role, so IT got 403'd loading the Admin Dashboard.
    router.get('/report', authenticateToken, isAdminOrFinanceOrDesktopSupport, attendanceController.getAttendanceReport);

    // ✅ NEW: Team attendance report for managers
    router.get('/team-report', authenticateToken, attendanceController.getTeamAttendanceReport);

    // Apply Early Logout — role/team-scoping is enforced inside the controller itself
    // (admin/hr: company-wide; manager/sub_admin: own team only), same pattern as
    // /team-report above, since a single blanket role-gate here can't express that split.
    router.post('/apply-early-logout', authenticateToken, attendanceController.applyEarlyLogout);

    // Quick Regularize — undo an accidental Clock Out (same role/team-scoping as above).
    router.post('/quick-regularize', authenticateToken, attendanceController.quickRegularizeClockOut);

    // Regularization endpoints
    // Managers, HR, and admins can view and act on regularization requests according to
    // role-scoped visibility rules (see regularizationService.buildScopedEmployeeIds).
    router.get('/regularization/stats', authenticateToken, regularizationController.getStats);
    router.get('/regularization/pending', authenticateToken, regularizationController.listRequests);
    router.get('/regularization/:request_id', authenticateToken, regularizationController.getRequestDetail);
    router.put('/regularization/:request_id/approve', authenticateToken, regularizationController.approveRequest);
    router.put('/regularization/:request_id/reject', authenticateToken, regularizationController.rejectRequest);
    router.put('/regularization/:request_id/cancel', authenticateToken, regularizationController.cancelRequest);

    // Overtime endpoints (Admin or own data)
    router.get('/overtime/:employee_id/:month/:year', authenticateToken, attendanceController.getOvertimeSummary);

    // Comp-off endpoints - employee can view own, admin can view all
    router.get('/comp-off/:employee_id', authenticateToken, attendanceController.getCompOffBalance);
    router.get('/comp-off/:employee_id/history', authenticateToken, attendanceController.getCompOffHistory);

    // ── Attendance Import / Export (Admin only) ──────────────────────────────
    router.post('/import/validate', authenticateToken, requireAdmin, attendanceController.validateAttendanceImport);
    router.post('/import',          authenticateToken, requireAdmin, attendanceController.importAttendance);
    router.get('/export',           authenticateToken, requireAdmin, attendanceController.exportAttendanceData);
    router.get('/import-history',   authenticateToken, requireAdmin, attendanceController.getImportHistory);

    // Auto-close stale sessions (Admin only)
    router.post('/auto-close-stale', authenticateToken, requireAdmin, async (req, res) => {
        const result = await attendanceController.autoCloseStaleSessions();
        res.json(result);
    });

    // Fix orphaned attendance records (clock_out NULL but session closed) - All employees
    router.post('/fix-orphaned', authenticateToken, requireAdmin, attendanceController.fixOrphanedAttendance);

    // Trigger missing clock-out check immediately (Admin only)
    // Also used to force-clock-out employees stuck with open clock-in (e.g., forgot to clock out)
    router.post('/admin/trigger-missing-check', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const { markMissingClockOuts } = require('../cron/missingClockOutCheck');
            const result = await markMissingClockOuts();
            res.json({ success: true, ...result });
        } catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    });

    // Admin mark attendance (with Paid Leave / Comp Off balance management)
    router.post('/admin/mark', authenticateToken, requireAdmin, attendanceController.adminMarkAttendance);

    // Company Holidays (HOL) — creating one is HR/Admin only; listing is any authenticated
    // role, since an employee's own attendance page must also be able to resolve HOL.
    router.post('/holidays', authenticateToken, requireAdmin, attendanceController.createCompanyHoliday);
    router.get('/holidays', authenticateToken, attendanceController.listCompanyHolidays);

    // Update historical late marks (Admin only)
    router.post('/update-historical-late-marks', authenticateToken, requireAdmin, attendanceController.updateHistoricalLateMarks);

    // Mark absent employees as leave (Admin only)
    router.post('/mark-absent-as-leave', authenticateToken, requireAdmin, attendanceController.markAbsentEmployeesAsLeave);

    // Dashboard stats (Admin only)
    router.get('/dashboard-stats', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const today = new Date().toISOString().split('T')[0];

            // Get total employees count
            const { count: totalEmployees, error: totalError } = await supabase
                .from('employees')
                .select('*', { count: 'exact', head: true });

            if (totalError) throw totalError;

            // Get today's attendance stats
            const { data: todayAttendance, error: attendanceError } = await supabase
                .from('attendance')
                .select('status, employee_id, late_minutes')
                .eq('attendance_date', today);

            if (attendanceError) throw attendanceError;

            const presentToday = todayAttendance?.filter(a => a.status === 'present').length || 0;
            const halfDayToday = todayAttendance?.filter(a => a.status === 'half_day').length || 0;
            const absentToday = todayAttendance?.filter(a => a.status === 'absent').length || 0;
            const lateToday = todayAttendance?.filter(a => a.late_minutes > 0).length || 0;

            // Get pending update requests
            const { count: pendingRequests, error: updateError } = await supabase
                .from('update_requests')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'pending');

            if (updateError) throw updateError;

            // Get pending regularization requests
            const { count: pendingRegularizations, error: regError } = await supabase
                .from('regularization_requests')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'pending');

            if (regError) throw regError;

            // Get pending leave requests
            const { count: pendingLeaveRequests, error: leaveError } = await supabase
                .from('leave_requests')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'pending');

            if (leaveError) throw leaveError;

            // Get employees on leave today
            const { count: onLeave, error: onLeaveError } = await supabase
                .from('leave_requests')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'approved')
                .lte('start_date', today)
                .gte('end_date', today);

            if (onLeaveError) throw onLeaveError;

            res.json({
                success: true,
                stats: {
                    totalEmployees: totalEmployees || 0,
                    presentToday: presentToday + halfDayToday,
                    absentToday: absentToday,
                    onLeave: onLeave || 0,
                    pendingRequests: pendingRequests || 0,
                    pendingRegularizations: pendingRegularizations || 0,
                    pendingLeaveRequests: pendingLeaveRequests || 0,
                    lateToday: lateToday
                }
            });

        } catch (error) {
            console.error('Error fetching dashboard stats:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch dashboard stats',
                error: error.message
            });
        }
    });

    // ── Break management ─────────────────────────────────────────────────────────
    // All break routes require auth. The employee must be clocked-in to start a break.

    const BREAK_TYPES = {
        tea_break_1: { label: 'Tea Break 1', minutes: 15 },
        tea_break_2: { label: 'Tea Break 2', minutes: 15 },
        lunch_break:  { label: 'Lunch Break',  minutes: 30 },
    };

    // POST /api/attendance/break/start
    // Sales department: unlimited, typeless breaks. Everyone else: existing fixed
    // 3-break system (each type usable once per clock-in session), unchanged.
    router.post('/break/start', authenticateToken, async (req, res) => {
        const employeeId = req.user.employeeId;
        try {
            // Must have an open clock-in session
            const { data: att } = await supabase.from('attendance')
                .select('id, clock_in, attendance_date')
                .eq('employee_id', employeeId)
                .not('clock_in', 'is', null)
                .is('clock_out', null)
                .order('attendance_date', { ascending: false })
                .limit(1)
                .maybeSingle();
            if (!att) return res.status(400).json({ success: false, message: 'You must be clocked in before starting a break.' });

            const { data: me } = await supabase.from('employees')
                .select('department').eq('employee_id', employeeId).maybeSingle();
            const isSales = (me?.department || '').trim().toLowerCase() === 'sales';

            let break_type = 'general';
            if (!isSales) {
                break_type = req.body.break_type || 'tea_break_1';
                if (!BREAK_TYPES[break_type]) {
                    return res.status(400).json({ success: false, message: 'Invalid break type.' });
                }
            }

            // No active break already running THIS session — scoped to the current clock-in
            // (a stale unclosed break from a past session must never block new ones).
            const { data: active } = await supabase.from('employee_breaks')
                .select('id').eq('employee_id', employeeId).is('break_end', null)
                .gte('break_start', att.clock_in)
                .maybeSingle();
            if (active) return res.status(400).json({ success: false, message: 'You already have an active break. End it first.' });

            if (!isSales) {
                // This break_type must not have been used this session
                const { data: alreadyUsed } = await supabase.from('employee_breaks')
                    .select('id')
                    .eq('employee_id', employeeId)
                    .eq('break_type', break_type)
                    .gte('break_start', att.clock_in)
                    .maybeSingle();
                if (alreadyUsed) {
                    return res.status(400).json({ success: false, message: `${BREAK_TYPES[break_type].label} has already been used today.` });
                }
            }

            // Sales-only: an optional note explaining what the break is for, so it can be
            // traced later. Trimmed/empty note is stored as null rather than ''.
            const break_note = isSales && req.body.note && String(req.body.note).trim()
                ? String(req.body.note).trim().slice(0, 500)
                : null;

            let { data, error } = await supabase.from('employee_breaks').insert([{
                employee_id: employeeId,
                attendance_date: att.attendance_date,
                break_start: new Date().toISOString(),
                break_type,
                break_note,
            }]).select().single();

            // break_note column not migrated yet on this DB — fall back so break-start still works.
            if (error && /break_note|does not exist|schema cache/i.test(error.message || '')) {
                ({ data, error } = await supabase.from('employee_breaks').insert([{
                    employee_id: employeeId,
                    attendance_date: att.attendance_date,
                    break_start: new Date().toISOString(),
                    break_type,
                }]).select().single());
            }
            if (error) throw error;

            const label = isSales ? 'Break' : BREAK_TYPES[break_type].label;
            return res.json({ success: true, break: data, message: `${label} started.` });
        } catch (err) {
            console.error('[break] start error:', err);
            return res.status(500).json({ success: false, message: err.message });
        }
    });

    // POST /api/attendance/break/end
    router.post('/break/end', authenticateToken, async (req, res) => {
        const employeeId = req.user.employeeId;
        try {
            // Scope to the current clock-in session so this can never touch a stale
            // unclosed break left over from a past session.
            const { data: att } = await supabase.from('attendance')
                .select('clock_in')
                .eq('employee_id', employeeId)
                .not('clock_in', 'is', null)
                .is('clock_out', null)
                .order('clock_in', { ascending: false })
                .limit(1)
                .maybeSingle();

            let activeQuery = supabase.from('employee_breaks')
                .select('id, break_start, break_type').eq('employee_id', employeeId).is('break_end', null);
            if (att?.clock_in) activeQuery = activeQuery.gte('break_start', att.clock_in);
            const { data: active, error: findErr } = await activeQuery.maybeSingle();
            if (findErr) throw findErr;
            if (!active) return res.status(400).json({ success: false, message: 'No active break found.' });

            const breakEnd = new Date();
            const durationMinutes = Math.round((breakEnd - new Date(active.break_start)) / 60000);

            const { data, error } = await supabase.from('employee_breaks').update({
                break_end: breakEnd.toISOString(),
                break_duration_minutes: durationMinutes,
                updated_at: breakEnd.toISOString(),
            }).eq('id', active.id).select().single();
            if (error) throw error;

            // Running total for the current session — lets the frontend refresh
            // "Today's Total Break" immediately (used by the Sales unlimited-break UI).
            // Summed from raw start/end timestamps (not the rounded-to-minutes column)
            // so short breaks (under 30s) aren't lost to rounding.
            let totalBreakSecondsToday = Math.round((breakEnd - new Date(active.break_start)) / 1000);
            let totalBreakMinutesToday = durationMinutes;
            if (att?.clock_in) {
                const { data: sessionBreaks } = await supabase.from('employee_breaks')
                    .select('break_start, break_end')
                    .eq('employee_id', employeeId)
                    .gte('break_start', att.clock_in)
                    .not('break_end', 'is', null);
                totalBreakSecondsToday = (sessionBreaks || []).reduce(
                    (sum, b) => sum + Math.round((new Date(b.break_end) - new Date(b.break_start)) / 1000), 0);
                totalBreakMinutesToday = Math.round(totalBreakSecondsToday / 60);
            }

            const label = BREAK_TYPES[active.break_type]?.label || 'Break';
            return res.json({
                success: true, break: data, duration_minutes: durationMinutes,
                total_break_minutes_today: totalBreakMinutesToday,
                total_break_seconds_today: totalBreakSecondsToday,
                message: `${label} ended. Duration: ${durationMinutes} min.`,
            });
        } catch (err) {
            console.error('[break] end error:', err);
            return res.status(500).json({ success: false, message: err.message });
        }
    });

    // GET /api/attendance/break/my-status
    // Returns active break + which break types have been used this clock-in session
    router.get('/break/my-status', authenticateToken, async (req, res) => {
        const employeeId = req.user.employeeId;
        try {
            // Find the current open attendance session
            const { data: att } = await supabase.from('attendance')
                .select('clock_in')
                .eq('employee_id', employeeId)
                .not('clock_in', 'is', null)
                .is('clock_out', null)
                .order('clock_in', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (!att?.clock_in) {
                return res.json({ success: true, active_break: null, used_break_types: [], total_break_minutes_today: 0, total_break_seconds_today: 0 });
            }

            // All breaks since this clock-in
            let { data: sessionBreaks, error } = await supabase.from('employee_breaks')
                .select('id, break_type, break_start, break_end, break_duration_minutes, attendance_date, break_note')
                .eq('employee_id', employeeId)
                .gte('break_start', att.clock_in)
                .order('break_start', { ascending: true });
            if (error && /break_note|does not exist|schema cache/i.test(error.message || '')) {
                ({ data: sessionBreaks, error } = await supabase.from('employee_breaks')
                    .select('id, break_type, break_start, break_end, break_duration_minutes, attendance_date')
                    .eq('employee_id', employeeId)
                    .gte('break_start', att.clock_in)
                    .order('break_start', { ascending: true }));
            }
            if (error) throw error;

            const used_break_types = (sessionBreaks || []).filter(b => b.break_end).map(b => b.break_type);
            const active_break = (sessionBreaks || []).find(b => !b.break_end) || null;
            // Summed from raw start/end timestamps (not the rounded-to-minutes column)
            // so short breaks (under 30s) aren't lost to rounding.
            const total_break_seconds_today = (sessionBreaks || [])
                .filter(b => b.break_end)
                .reduce((sum, b) => sum + Math.round((new Date(b.break_end) - new Date(b.break_start)) / 1000), 0);
            const total_break_minutes_today = Math.round(total_break_seconds_today / 60);

            return res.json({ success: true, active_break, used_break_types, session_breaks: sessionBreaks || [], total_break_minutes_today, total_break_seconds_today });
        } catch (err) {
            return res.status(500).json({ success: false, message: err.message });
        }
    });

    // GET /api/attendance/break/team-active
    // Uses the same reporting_manager lookup as the rest of the codebase.
    // Admin → all active breaks. TL/Manager → breaks of employees whose reporting_manager = their name.
    router.get('/break/team-active', authenticateToken, async (req, res) => {
        const { employeeId, role } = req.user;
        try {
            // A deactivated employee must never resurface here, for admin/hr's company-wide
            // view or a TL/manager's team-scoped one — always resolve to an explicit active-
            // employee-id list rather than letting admin/hr's "see all" mean "unscoped".
            let employeeIds;

            if (['admin', 'hr'].includes(role)) {
                const { data: activeEmps } = await supabase
                    .from('employees')
                    .select('employee_id')
                    .eq('is_active', true);
                employeeIds = (activeEmps || []).map(e => e.employee_id);
            } else {
                // Step 1: get this user's full name
                const { data: me } = await supabase
                    .from('employees')
                    .select('first_name, last_name')
                    .eq('employee_id', employeeId)
                    .maybeSingle();

                if (!me) return res.json({ success: true, breaks: [] });

                const myName = `${me.first_name} ${me.last_name}`.trim().toLowerCase();

                // Step 2: find all active employees whose reporting_manager matches (same logic as team report)
                const { data: allEmps } = await supabase
                    .from('employees')
                    .select('employee_id, reporting_manager')
                    .eq('is_active', true);

                employeeIds = (allEmps || [])
                    .filter(e => (e.reporting_manager || '').trim().toLowerCase() === myName)
                    .map(e => e.employee_id);
            }

            if (employeeIds.length === 0) return res.json({ success: true, breaks: [] });

            // Step 3: find active breaks — scoped to today so a stale unclosed break from a
            // past day (e.g. browser closed mid-break) never shows as "still on break" forever.
            const todayStr = new Date().toISOString().split('T')[0];
            const { data: breaks, error: breakErr } = await supabase
                .from('employee_breaks')
                .select('id, employee_id, break_start, break_type, attendance_date')
                .is('break_end', null)
                .eq('attendance_date', todayStr)
                .in('employee_id', employeeIds)
                .order('break_start', { ascending: true });
            if (breakErr) throw breakErr;

            // Step 4: enrich with employee details (already active per employeeIds above, but
            // re-checked here too as defense-in-depth)
            const ids = (breaks || []).map(b => b.employee_id);
            let empMap = {};
            if (ids.length > 0) {
                const { data: emps } = await supabase
                    .from('employees')
                    .select('employee_id, first_name, last_name, designation, department')
                    .in('employee_id', ids)
                    .eq('is_active', true);
                (emps || []).forEach(e => { empMap[e.employee_id] = e; });
            }

            return res.json({
                success: true,
                breaks: (breaks || []).map(b => ({
                    ...b,
                    employee: empMap[b.employee_id] || { first_name: b.employee_id, last_name: '' },
                })),
            });
        } catch (err) {
            console.error('[break] team-active error:', err);
            return res.status(500).json({ success: false, message: err.message });
        }
    });

    // GET /api/attendance/break/team-today
    // Returns all breaks for today (active + completed) for the team.
    // Uses IST date boundaries so the day matches what employees see.
    router.get('/break/team-today', authenticateToken, async (req, res) => {
        const { employeeId, role } = req.user;
        try {
            // See break/team-active above — always resolve to an explicit active-employee-id
            // list, even for admin/hr's company-wide view, so a deactivated employee's break
            // history for today can never resurface.
            let employeeIds;

            if (['admin', 'hr'].includes(role)) {
                const { data: activeEmps } = await supabase.from('employees').select('employee_id').eq('is_active', true);
                employeeIds = (activeEmps || []).map(e => e.employee_id);
            } else {
                const { data: me } = await supabase.from('employees')
                    .select('first_name, last_name')
                    .eq('employee_id', employeeId)
                    .maybeSingle();
                if (!me) return res.json({ success: true, breaks: [] });

                const myName = `${me.first_name} ${me.last_name}`.trim().toLowerCase();
                const { data: allEmps } = await supabase.from('employees')
                    .select('employee_id, reporting_manager')
                    .eq('is_active', true);

                employeeIds = (allEmps || [])
                    .filter(e => (e.reporting_manager || '').trim().toLowerCase() === myName)
                    .map(e => e.employee_id);
            }

            if (employeeIds.length === 0) return res.json({ success: true, breaks: [] });

            // IST day boundaries
            const now = new Date();
            const istNow = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
            const todayIST = istNow.toISOString().split('T')[0];
            const startOfDay = new Date(todayIST + 'T00:00:00+05:30').toISOString();
            const endOfDay   = new Date(todayIST + 'T23:59:59+05:30').toISOString();

            let query = supabase.from('employee_breaks')
                .select('id, employee_id, break_start, break_end, break_duration_minutes, break_type, attendance_date, break_note')
                .gte('break_start', startOfDay)
                .lte('break_start', endOfDay)
                .in('employee_id', employeeIds)
                .order('break_start', { ascending: true });

            let { data: breaks, error } = await query;
            if (error && /break_note|does not exist|schema cache/i.test(error.message || '')) {
                const fallbackQuery = supabase.from('employee_breaks')
                    .select('id, employee_id, break_start, break_end, break_duration_minutes, break_type, attendance_date')
                    .gte('break_start', startOfDay)
                    .lte('break_start', endOfDay)
                    .in('employee_id', employeeIds)
                    .order('break_start', { ascending: true });
                ({ data: breaks, error } = await fallbackQuery);
            }
            if (error) throw error;

            const ids = [...new Set((breaks || []).map(b => b.employee_id))];
            let empMap = {};
            if (ids.length > 0) {
                const { data: emps } = await supabase.from('employees')
                    .select('employee_id, first_name, last_name, designation, department')
                    .in('employee_id', ids)
                    .eq('is_active', true);
                (emps || []).forEach(e => { empMap[e.employee_id] = e; });
            }

            // Per-employee total break minutes today (covers Sales' unlimited/typeless
            // breaks the same as the fixed 3-break system — a plain sum either way).
            const totalsByEmployee = {};
            (breaks || []).filter(b => b.break_end).forEach(b => {
                totalsByEmployee[b.employee_id] = (totalsByEmployee[b.employee_id] || 0) + (b.break_duration_minutes || 0);
            });

            return res.json({
                success: true,
                breaks: (breaks || []).map(b => ({
                    ...b,
                    employee: empMap[b.employee_id] || { first_name: b.employee_id, last_name: '' },
                })),
                totals_by_employee: totalsByEmployee,
            });
        } catch (err) {
            console.error('[break] team-today error:', err);
            return res.status(500).json({ success: false, message: err.message });
        }
    });

    // GET /api/attendance/break/team-stats
    // Returns per-break-type usage stats + full employee lists for admin/manager dashboards.
    router.get('/break/team-stats', authenticateToken, async (req, res) => {
        const { employeeId, role } = req.user;
        const { manager_id } = req.query;
        try {
            let teamEmployees = [];

            // admin and sub_admin (Manager) see ALL employees by default; manager (TL) always
            // sees their team only. Manager Dashboard "View Team" filter: an elevated caller
            // can pass manager_id to narrow to one specific TL/Manager's team instead.
            if (role === 'admin' || role === 'sub_admin' || role === 'hr') {
                const { data: allEmps } = await supabase.from('employees')
                    .select('employee_id, first_name, last_name, designation, department, reporting_manager')
                    .eq('is_active', true);
                if (manager_id && manager_id !== 'ALL') {
                    const target = (allEmps || []).find(e => e.employee_id === manager_id);
                    const targetName = target ? `${target.first_name} ${target.last_name}`.trim().toLowerCase() : null;
                    teamEmployees = targetName
                        ? (allEmps || []).filter(e => (e.reporting_manager || '').trim().toLowerCase() === targetName)
                        : [];
                    if (teamEmployees.length === 0)
                        return res.json({ success: true, team_size: 0, today_breaks: [], break_stats: {} });
                } else {
                    teamEmployees = allEmps || [];
                }
            } else {
                const { data: me } = await supabase.from('employees')
                    .select('first_name, last_name')
                    .eq('employee_id', employeeId)
                    .maybeSingle();
                if (!me) return res.json({ success: true, team_size: 0, today_breaks: [], break_stats: {} });

                const myName = `${me.first_name} ${me.last_name}`.trim().toLowerCase();
                const { data: allEmps } = await supabase.from('employees')
                    .select('employee_id, first_name, last_name, designation, department, reporting_manager')
                    .eq('is_active', true);

                teamEmployees = (allEmps || []).filter(e =>
                    (e.reporting_manager || '').trim().toLowerCase() === myName
                );

                if (teamEmployees.length === 0)
                    return res.json({ success: true, team_size: 0, today_breaks: [], break_stats: {} });
            }

            const empMap = {};
            teamEmployees.forEach(e => { empMap[e.employee_id] = e; });
            const employeeIds = teamEmployees.map(e => e.employee_id);

            // IST day boundaries
            const now = new Date();
            const istNow = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
            const todayIST = istNow.toISOString().split('T')[0];
            const startOfDay = new Date(todayIST + 'T00:00:00+05:30').toISOString();
            const endOfDay   = new Date(todayIST + 'T23:59:59+05:30').toISOString();

            let query = supabase.from('employee_breaks')
                .select('id, employee_id, break_start, break_end, break_duration_minutes, break_type')
                .gte('break_start', startOfDay)
                .lte('break_start', endOfDay)
                .order('break_start', { ascending: true });

            if (employeeIds.length > 0) query = query.in('employee_id', employeeIds);

            const { data: breaks, error } = await query;
            if (error) throw error;

            const BREAK_KEYS = ['tea_break_1', 'tea_break_2', 'lunch_break'];
            const breakStats = {};

            BREAK_KEYS.forEach(key => {
                const typeBreaks = (breaks || []).filter(b => b.break_type === key);
                const completedEmpIds = new Set(typeBreaks.filter(b => b.break_end).map(b => b.employee_id));
                const activeEmpIds    = new Set(typeBreaks.filter(b => !b.break_end).map(b => b.employee_id));

                breakStats[key] = {
                    used_count:   completedEmpIds.size,
                    active_count: activeEmpIds.size,
                    unused_count: teamEmployees.filter(e => !completedEmpIds.has(e.employee_id) && !activeEmpIds.has(e.employee_id)).length,
                    total:        teamEmployees.length,
                    used_employees:   typeBreaks.filter(b => b.break_end).map(b => ({ ...b, employee: empMap[b.employee_id] || {} })),
                    active_employees: typeBreaks.filter(b => !b.break_end).map(b => ({ ...b, employee: empMap[b.employee_id] || {} })),
                    unused_employees: teamEmployees.filter(e => !completedEmpIds.has(e.employee_id) && !activeEmpIds.has(e.employee_id)),
                };
            });

            // Per-employee total break minutes today — includes Sales' unlimited/typeless
            // breaks (not covered by the type-keyed break_stats above) alongside everyone else's.
            const totalsByEmployee = {};
            (breaks || []).filter(b => b.break_end).forEach(b => {
                totalsByEmployee[b.employee_id] = (totalsByEmployee[b.employee_id] || 0) + (b.break_duration_minutes || 0);
            });

            return res.json({
                success: true,
                team_size: teamEmployees.length,
                today_breaks: (breaks || []).map(b => ({ ...b, employee: empMap[b.employee_id] || {} })),
                break_stats: breakStats,
                totals_by_employee: totalsByEmployee,
            });
        } catch (err) {
            console.error('[break] team-stats error:', err);
            return res.status(500).json({ success: false, message: err.message });
        }
    });

    // GET /api/attendance/team-login-break-report?start=&end=
    // Backs the "Login & Break Report" export on the Manager Panel. Purely a data-fetch
    // endpoint — the frontend only calls this when the user clicks Export (never on
    // page load / date-change) and merges the two arrays into one row per employee/day
    // itself. Role scoping is deliberately different from /break/team-stats above:
    // admin and hr get the whole company, but sub_admin ("Manager") is scoped to their
    // own team here, same as manager (TL) — this report is meant to answer "who reports
    // to me", not "show me everyone", for both of those roles.
    router.get('/team-login-break-report', authenticateToken, async (req, res) => {
        const { employeeId, role } = req.user;
        const { start, end } = req.query;
        try {
            if (!start || !end) {
                return res.status(400).json({ success: false, message: 'start and end dates are required' });
            }
            const startMs = new Date(start).getTime();
            const endMs = new Date(end).getTime();
            if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) {
                return res.status(400).json({ success: false, message: 'Invalid date range' });
            }
            const MAX_RANGE_DAYS = 92;
            if ((endMs - startMs) / 86400000 > MAX_RANGE_DAYS) {
                return res.status(400).json({ success: false, message: `Date range too large — please select ${MAX_RANGE_DAYS} days or fewer.` });
            }

            let employeeIds;
            let scope;
            if (role === 'admin' || role === 'hr') {
                const { data: allEmps, error } = await supabase.from('employees')
                    .select('employee_id').eq('is_active', true);
                if (error) throw error;
                employeeIds = (allEmps || []).map(e => e.employee_id);
                scope = 'all';
            } else {
                const caller = await getEmployeeById(employeeId);
                if (!caller) return res.json({ success: true, scope: 'team', team_members: [], attendance: [], breaks: [] });
                const callerName = `${caller.first_name} ${caller.last_name}`.trim();
                employeeIds = await getTeamEmployeeIdsByManagerName(callerName);
                scope = 'team';
            }

            if (!employeeIds || employeeIds.length === 0) {
                return res.json({ success: true, scope, team_members: [], attendance: [], breaks: [] });
            }

            const [teamRes, attendanceRes, breaksRes] = await Promise.all([
                supabase.from('employees')
                    .select('employee_id, first_name, last_name, department, designation')
                    .in('employee_id', employeeIds).eq('is_active', true),
                supabase.from('attendance')
                    .select('employee_id, attendance_date, clock_in, clock_in_ist, clock_out, clock_out_ist, total_hours, total_minutes, status, is_regularized, updated_at, created_at')
                    .in('employee_id', employeeIds).gte('attendance_date', start).lte('attendance_date', end),
                supabase.from('employee_breaks')
                    .select('employee_id, attendance_date, break_start, break_end, break_duration_minutes, break_type')
                    .in('employee_id', employeeIds).gte('attendance_date', start).lte('attendance_date', end),
            ]);
            if (teamRes.error) throw teamRes.error;
            if (attendanceRes.error) throw attendanceRes.error;
            if (breaksRes.error) throw breaksRes.error;

            // Same duplicate-row rule used by the admin attendance report/exports, so this
            // report never disagrees with those about which punch is the "real" one.
            const dedupedMap = {};
            (attendanceRes.data || []).forEach(record => {
                const dateKey = record.attendance_date ? record.attendance_date.split('T')[0] : record.attendance_date;
                const key = `${record.employee_id}-${dateKey}`;
                dedupedMap[key] = attendanceController._shared.pickBetterAttendanceRow(dedupedMap[key], record);
            });

            res.json({
                success: true,
                scope,
                team_members: teamRes.data || [],
                attendance: Object.values(dedupedMap),
                breaks: breaksRes.data || [],
            });
        } catch (err) {
            console.error('[attendance] team-login-break-report error:', err);
            return res.status(500).json({ success: false, message: err.message });
        }
    });

    console.log('✅ Attendance routes loaded with regularization support and team report');
    return router;
};