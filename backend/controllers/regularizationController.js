// backend/controllers/regularizationController.js
// Generalized attendance regularization workflow: create (11 request types),
// role-scoped list/detail, approve/reject/cancel, and dashboard stats.

const supabase = require('../config/supabase');
const { uploadFile } = require('../lib/supabaseStorage');
const { getEmployeeById, employeeHasDirectReports } = require('../utils/employeeLookup');
const { nowIST, toUTCMs } = require('./attendanceController')._shared;
const {
    ELEVATED_ROLES, resolveApprover, canViewRequest, canActOnRequest,
    buildScopedEmployeeIds, recalculateAttendanceForApprovedRequest, isPayrollLocked,
} = require('../services/regularizationService');
const notificationService = require('../services/notificationService');

const VALID_REQUEST_TYPES = [
    'missing_clock_in', 'missing_clock_out', 'attendance_correction',
    'half_day_to_present', 'present_to_half_day', 'wrong_working_hours',
    'client_visit', 'official_duty', 'wfh', 'break_correction', 'other',
];
const NO_PUNCH_TYPES = ['client_visit', 'official_duty', 'wfh']; // may have zero attendance activity for the day

const clientIp = (req) => (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').toString().split(',')[0].trim();
const clientUA = (req) => (req.headers['user-agent'] || '').substring(0, 255);
const fullName = (emp) => emp ? `${emp.first_name || ''} ${emp.last_name || ''}`.trim() : '';

// ── POST /regularization/:employee_id/request ──────────────────────────────────
exports.createRequest = async (req, res) => {
    try {
        const { employee_id } = req.params;
        const {
            request_type, attendance_date, attendance_id,
            requested_clock_in, requested_clock_out_time,
            requested_break_duration, reason,
        } = req.body;

        if (req.user?.employeeId !== employee_id && !ELEVATED_ROLES.includes(req.user?.role)) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }
        if (!VALID_REQUEST_TYPES.includes(request_type)) {
            return res.status(400).json({ success: false, message: 'Invalid request type' });
        }
        if (!attendance_date) {
            return res.status(400).json({ success: false, message: 'Attendance date is required' });
        }
        const todayIST = nowIST().substring(0, 10);
        if (attendance_date > todayIST) {
            return res.status(400).json({ success: false, message: 'Cannot regularize a future date' });
        }
        if (!reason || reason.trim().length < 20) {
            return res.status(400).json({ success: false, message: 'Reason is required and must be at least 20 characters' });
        }

        // Per-type required fields
        if (request_type === 'missing_clock_in' && !requested_clock_in) {
            return res.status(400).json({ success: false, message: 'Requested clock-in time is required for this request type' });
        }
        if (request_type === 'missing_clock_out' && !requested_clock_out_time) {
            return res.status(400).json({ success: false, message: 'Requested clock-out time is required for this request type' });
        }
        if (['attendance_correction', 'wrong_working_hours'].includes(request_type) && !requested_clock_in && !requested_clock_out_time) {
            return res.status(400).json({ success: false, message: 'At least one corrected clock-in or clock-out time is required' });
        }
        if (request_type === 'break_correction' && !(parseFloat(requested_break_duration) > 0)) {
            return res.status(400).json({ success: false, message: 'A valid break duration (minutes) is required' });
        }
        if (requested_clock_in && requested_clock_out_time) {
            const inMs = toUTCMs(requested_clock_in);
            const outMs = toUTCMs(requested_clock_out_time);
            if (inMs != null && outMs != null && outMs <= inMs) {
                return res.status(400).json({ success: false, message: 'Clock-out cannot be before or equal to clock-in' });
            }
        }
        // Server decides requested_status for these two — never trust the client for it.
        let requestedStatus = null;
        if (request_type === 'half_day_to_present') requestedStatus = 'present';
        else if (request_type === 'present_to_half_day') requestedStatus = 'half_day';
        else if (NO_PUNCH_TYPES.includes(request_type) || request_type === 'other') requestedStatus = 'present';

        // Validate employment dates before creating attendance stubs or uploading files.
        const { data: employment, error: employmentError } = await supabase.from('employees')
            .select('joining_date').eq('employee_id', employee_id).maybeSingle();
        if (employmentError) throw employmentError;
        if (!employment) {
            return res.status(404).json({ success: false, message: 'Employee not found' });
        }
        const joiningDate = employment.joining_date?.substring(0, 10);
        if (!joiningDate) {
            return res.status(400).json({ success: false, message: 'Joining date is unavailable. Please contact HR.' });
        }
        if (attendance_date < joiningDate) {
            return res.status(400).json({ success: false, message: 'Cannot regularize attendance before your joining date.' });
        }

        // Resolve the attendance row
        let attendanceRow = null;
        if (attendance_id) {
            const { data } = await supabase.from('attendance').select('*')
                .eq('id', attendance_id).eq('employee_id', employee_id).maybeSingle();
            attendanceRow = data;
        }
        if (!attendanceRow) {
            const { data } = await supabase.from('attendance').select('*')
                .eq('employee_id', employee_id).eq('attendance_date', attendance_date)
                .order('clock_in', { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
            attendanceRow = data;
        }
        if (!attendanceRow) {
            if (!NO_PUNCH_TYPES.includes(request_type)) {
                return res.status(404).json({ success: false, message: 'No attendance record found for this date' });
            }
            // WFH/Official Duty/Client Visit may have zero attendance activity — create a bare stub.
            const { data: stub, error: stubErr } = await supabase.from('attendance')
                .insert([{ employee_id, attendance_date, status: 'absent' }]).select().single();
            if (stubErr) throw stubErr;
            attendanceRow = stub;
        }

        // Duplicate guard: only one PENDING request per attendance record at a time
        // (re-request is allowed after 'rejected' or 'cancelled', not just 'rejected').
        const { data: existingPending } = await supabase.from('regularization_requests')
            .select('id').eq('attendance_id', String(attendanceRow.id)).eq('status', 'pending').maybeSingle();
        if (existingPending) {
            return res.status(409).json({ success: false, message: 'A pending regularization request already exists for this date' });
        }

        let attachment_url = null, attachment_name = null;
        if (req.file) {
            const { publicUrl } = await uploadFile(req.file.buffer, req.file.originalname, 'regularization', req.file.mimetype);
            attachment_url = publicUrl;
            attachment_name = req.file.originalname;
        }

        const employee = await getEmployeeById(employee_id);
        const { pendingWithEmployeeId, pendingWithRole } = await resolveApprover(employee || { employee_id });

        const insertPayload = {
            employee_id,
            attendance_id: String(attendanceRow.id),
            attendance_date,
            request_type,
            clock_in_time: attendanceRow.clock_in_ist || attendanceRow.clock_in || null,
            requested_clock_in: requested_clock_in || null,
            requested_clock_out_time: requested_clock_out_time || null,
            requested_status: requestedStatus,
            requested_break_duration: requested_break_duration ? parseFloat(requested_break_duration) : null,
            reason: reason.trim(),
            attachment_url, attachment_name,
            status: 'pending',
            pending_with_employee_id: pendingWithEmployeeId,
            pending_with_role: pendingWithRole,
            original_clock_in: attendanceRow.clock_in_ist || attendanceRow.clock_in || null,
            original_clock_out: attendanceRow.clock_out_ist || attendanceRow.clock_out || null,
            original_status: attendanceRow.status || null,
            original_total_minutes: attendanceRow.total_minutes || null,
            ip_address: clientIp(req),
            user_agent: clientUA(req),
        };

        const { data: created, error: insErr } = await supabase
            .from('regularization_requests').insert([insertPayload]).select().single();
        if (insErr) throw insErr;

        await supabase.from('attendance').update({
            regularization_requested: true,
            regularization_request_id: created.id,
            regularization_status: 'pending',
        }).eq('id', attendanceRow.id);

        await supabase.from('regularization_history').insert({
            regularization_id: created.id, action: 'created', message: reason.trim(),
            old_status: null, new_status: 'pending',
            performed_by: employee_id, performed_by_name: fullName(employee) || employee_id,
        });

        await notificationService.sendRegularizationNotifications(created, 'created', {
            actorName: fullName(employee) || employee_id,
        });

        res.status(201).json({ success: true, message: 'Regularization request submitted.', request: created });
    } catch (error) {
        console.error('❌ Error in createRequest:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to submit regularization request' });
    }
};

// ── GET /regularization/mine/:employee_id ──────────────────────────────────────
exports.listMyRequests = async (req, res) => {
    try {
        const { employee_id } = req.params;
        if (req.user?.employeeId !== employee_id && !ELEVATED_ROLES.includes(req.user?.role)) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }
        const { data, error } = await supabase.from('regularization_requests')
            .select('*').eq('employee_id', employee_id).order('created_at', { ascending: false });
        if (error) throw error;

        const counts = { pending: 0, approved: 0, rejected: 0, cancelled: 0 };
        (data || []).forEach(r => { if (counts[r.status] !== undefined) counts[r.status]++; });

        res.json({ success: true, requests: data || [], counts });
    } catch (error) {
        console.error('❌ Error in listMyRequests:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch your regularization requests', error: error.message });
    }
};

// ── GET /regularization/pending (generalized: role-scoped + filterable list) ──
exports.listRequests = async (req, res) => {
    try {
        const { status, department, employee_id, request_type, date_from, date_to, page = 1, limit = 50, manager_id } = req.query;

        const scopedIds = await buildScopedEmployeeIds(req.user, manager_id); // null = unrestricted (HR/Admin)
        let query = supabase.from('regularization_requests').select('*', { count: 'exact' });
        if (scopedIds) {
            query = query.or(`employee_id.in.(${scopedIds.join(',')}),pending_with_employee_id.eq.${req.user.employeeId}`);
        }
        if (status) query = query.eq('status', status);
        if (request_type) query = query.eq('request_type', request_type);
        if (employee_id) query = query.eq('employee_id', employee_id);
        if (date_from) query = query.gte('attendance_date', date_from);
        if (date_to) query = query.lte('attendance_date', date_to);

        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 50));
        query = query.order('created_at', { ascending: false }).range((pageNum - 1) * limitNum, pageNum * limitNum - 1);

        const { data, error, count } = await query;
        if (error) throw error;

        const employeeIds = [...new Set((data || []).map(r => r.employee_id))];
        const { data: emps } = employeeIds.length
            ? await supabase.from('employees').select('employee_id, first_name, last_name, department, designation, reporting_manager').in('employee_id', employeeIds)
            : { data: [] };
        const empMap = {};
        (emps || []).forEach(e => { empMap[e.employee_id] = e; });

        let enriched = (data || []).map(r => ({
            ...r,
            employee_name: fullName(empMap[r.employee_id]) || r.employee_id,
            department: empMap[r.employee_id]?.department || null,
            designation: empMap[r.employee_id]?.designation || null,
            reporting_manager: empMap[r.employee_id]?.reporting_manager || null,
            can_act: canActOnRequest(req.user, r),
        }));

        if (department) enriched = enriched.filter(r => r.department === department);

        res.json({ success: true, requests: enriched, total: count ?? enriched.length, page: pageNum, limit: limitNum });
    } catch (error) {
        console.error('❌ Error in listRequests:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch regularization requests', error: error.message });
    }
};

// ── GET /regularization/:request_id ─────────────────────────────────────────────
exports.getRequestDetail = async (req, res) => {
    try {
        const { request_id } = req.params;
        const { data: request, error } = await supabase.from('regularization_requests').select('*').eq('id', request_id).maybeSingle();
        if (error) throw error;
        if (!request) return res.status(404).json({ success: false, message: 'Request not found' });
        if (!canViewRequest(req.user, request)) return res.status(403).json({ success: false, message: 'Access denied' });

        const [{ data: history }, { data: previous }, employee] = await Promise.all([
            supabase.from('regularization_history').select('*').eq('regularization_id', request_id).order('created_at', { ascending: true }),
            supabase.from('regularization_requests').select('id, request_type, attendance_date, status, created_at')
                .eq('employee_id', request.employee_id).neq('id', request_id).order('created_at', { ascending: false }).limit(5),
            getEmployeeById(request.employee_id),
        ]);

        res.json({
            success: true,
            request: {
                ...request,
                employee_name: fullName(employee) || request.employee_id,
            },
            history: history || [],
            previous_requests: previous || [],
            can_act: canActOnRequest(req.user, request),
        });
    } catch (error) {
        console.error('❌ Error in getRequestDetail:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch request detail', error: error.message });
    }
};

// ── PUT /regularization/:request_id/approve ─────────────────────────────────────
exports.approveRequest = async (req, res) => {
    try {
        const { request_id } = req.params;
        const { admin_notes, approved_clock_in, approved_clock_out_time, approved_status, approved_break_duration } = req.body;

        const { data: request, error } = await supabase.from('regularization_requests').select('*').eq('id', request_id).maybeSingle();
        if (error) throw error;
        if (!request) return res.status(404).json({ success: false, message: 'Request not found' });
        if (request.status !== 'pending') {
            return res.status(400).json({ success: false, message: `This request has already been ${request.status}.` });
        }
        if (!canActOnRequest(req.user, request)) {
            return res.status(403).json({ success: false, message: 'You are not authorized to act on this request' });
        }

        const { locked, month, year } = await isPayrollLocked(request.employee_id, request.attendance_date);
        if (locked) {
            return res.status(409).json({
                success: false,
                message: `Cannot approve — payroll for ${month}/${year} has already been finalized (paid). Contact HR/Finance to reopen this cycle before regularizing this date.`,
            });
        }

        const finalClockIn = approved_clock_in || request.requested_clock_in;
        const finalClockOut = approved_clock_out_time || request.requested_clock_out_time;
        const finalStatus = approved_status || request.requested_status;
        const finalBreak = approved_break_duration != null && approved_break_duration !== ''
            ? parseFloat(approved_break_duration) : request.requested_break_duration;

        const updatedAttendance = await recalculateAttendanceForApprovedRequest(request.attendance_id, request.request_type, {
            clockIn: finalClockIn, clockOutTime: finalClockOut, status: finalStatus,
            breakDurationMinutes: finalBreak, adminNotes: admin_notes,
        });

        const approver = await getEmployeeById(req.user.employeeId);
        const actorName = fullName(approver) || req.user.employeeId;

        const { data: updatedRequest, error: updErr } = await supabase.from('regularization_requests').update({
            status: 'approved',
            approved_at: new Date().toISOString(),
            approved_by: req.user.employeeId,
            approved_clock_in: finalClockIn || null,
            approved_clock_out_time: finalClockOut || null,
            approved_status: finalStatus || null,
            approved_break_duration: finalBreak || null,
            admin_notes: admin_notes || null,
            updated_at: new Date().toISOString(),
        }).eq('id', request_id).select().single();
        if (updErr) throw updErr;

        await supabase.from('regularization_history').insert({
            regularization_id: request_id, action: 'approved', message: admin_notes || null,
            old_status: 'pending', new_status: 'approved', performed_by: req.user.employeeId, performed_by_name: actorName,
        });

        await notificationService.sendRegularizationNotifications(updatedRequest, 'approved', { actorName });

        res.json({ success: true, message: 'Regularization request approved.', request: updatedRequest, attendance: updatedAttendance });
    } catch (error) {
        console.error('❌ Error in approveRequest:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to approve request' });
    }
};

// ── PUT /regularization/:request_id/reject ──────────────────────────────────────
exports.rejectRequest = async (req, res) => {
    try {
        const { request_id } = req.params;
        const { rejection_reason } = req.body;
        if (!rejection_reason || rejection_reason.trim().length < 10) {
            return res.status(400).json({ success: false, message: 'A rejection reason (at least 10 characters) is required' });
        }

        const { data: request, error } = await supabase.from('regularization_requests').select('*').eq('id', request_id).maybeSingle();
        if (error) throw error;
        if (!request) return res.status(404).json({ success: false, message: 'Request not found' });
        if (request.status !== 'pending') {
            return res.status(400).json({ success: false, message: `This request has already been ${request.status}.` });
        }
        if (!canActOnRequest(req.user, request)) {
            return res.status(403).json({ success: false, message: 'You are not authorized to act on this request' });
        }

        const approver = await getEmployeeById(req.user.employeeId);
        const actorName = fullName(approver) || req.user.employeeId;

        const { data: updatedRequest, error: updErr } = await supabase.from('regularization_requests').update({
            status: 'rejected',
            approved_at: new Date().toISOString(),
            rejected_by: req.user.employeeId,
            rejection_reason: rejection_reason.trim(),
            updated_at: new Date().toISOString(),
        }).eq('id', request_id).select().single();
        if (updErr) throw updErr;

        if (request.attendance_id) {
            await supabase.from('attendance').update({
                regularization_requested: false, regularization_status: 'rejected', regularization_request_id: null,
            }).eq('id', request.attendance_id);
        }

        await supabase.from('regularization_history').insert({
            regularization_id: request_id, action: 'rejected', message: rejection_reason.trim(),
            old_status: 'pending', new_status: 'rejected', performed_by: req.user.employeeId, performed_by_name: actorName,
        });

        await notificationService.sendRegularizationNotifications(updatedRequest, 'rejected', {
            actorName, comments: rejection_reason.trim(),
        });

        res.json({ success: true, message: 'Regularization request rejected.', request: updatedRequest });
    } catch (error) {
        console.error('❌ Error in rejectRequest:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to reject request' });
    }
};

// ── PUT /regularization/:request_id/cancel ──────────────────────────────────────
exports.cancelRequest = async (req, res) => {
    try {
        const { request_id } = req.params;
        const { data: request, error } = await supabase.from('regularization_requests').select('*').eq('id', request_id).maybeSingle();
        if (error) throw error;
        if (!request) return res.status(404).json({ success: false, message: 'Request not found' });

        const isOwner = req.user?.employeeId === request.employee_id;
        if (!isOwner && !ELEVATED_ROLES.includes(req.user?.role)) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }
        if (request.status !== 'pending') {
            return res.status(400).json({ success: false, message: 'Only pending requests can be cancelled' });
        }

        const actor = await getEmployeeById(req.user.employeeId);
        const actorName = fullName(actor) || req.user.employeeId;

        const { data: updatedRequest, error: updErr } = await supabase.from('regularization_requests').update({
            status: 'cancelled', cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).eq('id', request_id).select().single();
        if (updErr) throw updErr;

        if (request.attendance_id) {
            await supabase.from('attendance').update({
                regularization_requested: false, regularization_status: 'cancelled', regularization_request_id: null,
            }).eq('id', request.attendance_id);
        }

        await supabase.from('regularization_history').insert({
            regularization_id: request_id, action: 'cancelled', message: null,
            old_status: 'pending', new_status: 'cancelled', performed_by: req.user.employeeId, performed_by_name: actorName,
        });

        await notificationService.sendRegularizationNotifications(updatedRequest, 'cancelled', { actorName });

        res.json({ success: true, message: 'Regularization request cancelled.', request: updatedRequest });
    } catch (error) {
        console.error('❌ Error in cancelRequest:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to cancel request' });
    }
};

// ── GET /regularization/stats (dashboard widgets) ───────────────────────────────
exports.getStats = async (req, res) => {
    try {
        const scopedIds = await buildScopedEmployeeIds(req.user, req.query.manager_id); // null = unrestricted
        const me = await getEmployeeById(req.user.employeeId);
        const hasReports = ELEVATED_ROLES.includes(req.user.role) || await employeeHasDirectReports(fullName(me));

        if (hasReports) {
            let query = supabase.from('regularization_requests').select('*');
            if (scopedIds) query = query.in('employee_id', scopedIds);
            const { data: all, error } = await query;
            if (error) throw error;

            const todayStr = new Date().toISOString().split('T')[0];
            const pending = (all || []).filter(r => r.status === 'pending').length;
            const approvedToday = (all || []).filter(r => r.status === 'approved' && (r.approved_at || '').startsWith(todayStr)).length;
            const rejectedToday = (all || []).filter(r => r.status === 'rejected' && (r.approved_at || '').startsWith(todayStr)).length;
            const decided = (all || []).filter(r => ['approved', 'rejected'].includes(r.status) && r.approved_at && r.created_at);
            const avgMs = decided.length
                ? decided.reduce((sum, r) => sum + (new Date(r.approved_at) - new Date(r.created_at)), 0) / decided.length
                : 0;

            return res.json({
                success: true, scope: 'manager',
                pending, approved_today: approvedToday, rejected_today: rejectedToday,
                avg_approval_time_hours: Math.round((avgMs / 3600000) * 10) / 10,
            });
        }

        const { data: mine, error } = await supabase.from('regularization_requests').select('status').eq('employee_id', req.user.employeeId);
        if (error) throw error;
        const counts = { pending: 0, approved: 0, rejected: 0, cancelled: 0 };
        (mine || []).forEach(r => { if (counts[r.status] !== undefined) counts[r.status]++; });
        res.json({ success: true, scope: 'employee', ...counts });
    } catch (error) {
        console.error('❌ Error in getStats:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch regularization stats', error: error.message });
    }
};
