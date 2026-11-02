const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const multer = require('multer');
const path = require('path');
const { verifyToken, isAdmin, isAdminOrManager, isAdminOrDesktopSupport } = require('../middleware/auth');
const { uploadFile, deleteFile, folderForField } = require('../lib/supabaseStorage');
const { sendShiftChangeEmail } = require('../services/emailService');
const { createOnboardingTickets, ONBOARDING_DEPARTMENTS } = require('../utils/onboardingTickets');
const { createProfilePhotoPost } = require('../utils/profilePhotoPost');
const { getTeamEmployeeIdsByEmployeeId } = require('../utils/employeeLookup');
const { generateNextEmployeeId } = require('../utils/employeeId');
const { SECRET_EMPLOYEE_COLUMNS, omitSecretEmployeeFields, omitSecretEmployeeFieldsFromAll, safeDbErrorDetails } = require('../utils/employeeFields');
const { resolveNewEmployeeRole } = require('../utils/employeeRoles');
const { isDefiniteDbError, duplicateKeyTarget, ONBOARDING_TICKET_EMPLOYEE_COLUMNS } = require('../utils/employeeCreation');

// Memory storage — files are uploaded to Supabase Storage (no local disk in serverless)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = /jpeg|jpg|png|pdf|doc|docx/;
        const ok = allowed.test(path.extname(file.originalname).toLowerCase()) && allowed.test(file.mimetype);
        cb(ok ? null : new Error('Only images and documents are allowed'), ok);
    },
});

// Generate Employee ID with 2-digit sequence based on joining date — delegates to the shared
// MAX-based generator in utils/employeeId.js (also used by the offer-link onboarding flow,
// after a count-based duplicate there caused a real "duplicate key value violates unique
// constraint employees_employee_id_key" production error). Kept as a thin wrapper here (same
// name/signature) so the existing call sites below don't need to change. No fallback on
// failure — a generation error (e.g. a transient DB/network issue) must fail the request
// rather than fabricate a timestamp-based ID that violates the MAX+1 sequencing rule.
const generateEmployeeIdBasedOnJoiningDate = async (joiningDate) => {
    return generateNextEmployeeId(joiningDate);
};

// Get employee statistics (Admin only) — MUST be before /:id
router.get('/stats/summary', verifyToken, isAdmin, async (req, res) => {
    try {
        const { count: total, error: totalError } = await supabase
            .from('employees').select('*', { count: 'exact', head: true });
        if (totalError) throw totalError;

        const { count: active, error: activeError } = await supabase
            .from('employees').select('*', { count: 'exact', head: true }).eq('is_active', true);
        if (activeError) throw activeError;

        const { data: deptStats, error: deptError } = await supabase
            .from('employees').select('department').eq('is_active', true);
        if (deptError) throw deptError;

        const deptMap = {};
        deptStats?.forEach(item => { deptMap[item.department] = (deptMap[item.department] || 0) + 1; });
        const department_breakdown = Object.entries(deptMap).map(([department, count]) => ({ department, count }));

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const { count: recent, error: recentError } = await supabase
            .from('employees').select('*', { count: 'exact', head: true })
            .gte('joining_date', thirtyDaysAgo.toISOString().split('T')[0]);
        if (recentError) throw recentError;

        res.json({
            success: true,
            stats: { total: total || 0, active: active || 0, inactive: (total || 0) - (active || 0), recent_joinings: recent || 0, department_breakdown }
        });
    } catch (error) {
        console.error('Error fetching employee stats:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch statistics', error: error.message });
    }
});

// ============== REPORTING MANAGER: GET TEAM MEMBERS ==============
router.get('/manager/team', verifyToken, isAdminOrManager, async (req, res) => {
    try {
        const isAdminRole = ['admin', 'sub_admin', 'hr'].includes(req.user?.role);
        const managerEmployeeId = req.user?.employeeId;
        let managerName = null;

        if (!isAdminRole) {
            const { data: manager, error: mErr } = await supabase
                .from('employees').select('first_name, last_name')
                .eq('employee_id', managerEmployeeId).single();
            if (mErr || !manager) return res.status(404).json({ success: false, message: 'Manager not found' });
            managerName = `${manager.first_name} ${manager.last_name}`.trim();
        }

        // Fetch team members - trim stored values to handle any whitespace issues
        let { data: allEmps, error } = await supabase
            .from('employees')
            .select('id, employee_id, first_name, last_name, department, designation, shift_timing, reporting_manager, "isFlexibleShift"')
            .order('first_name', { ascending: true });

        if (error && /isFlexibleShift|does not exist/i.test(error.message || '')) {
            // isFlexibleShift column not migrated yet on this DB — fall back so the team list still loads.
            ({ data: allEmps, error } = await supabase
                .from('employees')
                .select('id, employee_id, first_name, last_name, department, designation, shift_timing, reporting_manager')
                .order('first_name', { ascending: true }));
        }

        if (error) throw error;

        const team = (allEmps || []).filter(e => {
            if (isAdminRole) return true;
            return e.reporting_manager?.trim().toLowerCase() === managerName.toLowerCase();
        }).map(e => ({
            ...e,
            isFlexibleShift: typeof e.isFlexibleShift === 'boolean' ? e.isFlexibleShift : false
        }));

        res.json({ success: true, team, manager_name: managerName || 'Admin / HR' });
    } catch (error) {
        console.error('Error fetching team:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch team', error: error.message });
    }
});

// ============== REPORTING MANAGER: UPDATE TEAM MEMBER SHIFT ==============
router.put('/manager/shift/:employee_id', verifyToken, isAdminOrManager, async (req, res) => {
    console.log(`🔄 [SHIFT UPDATE] API hit — employee_id: ${req.params.employee_id} | by: ${req.user?.employeeId}`);
    try {
        const { employee_id } = req.params;
        const { shift_timing, effective_from, effective_until, isFlexibleShift } = req.body;
        const managerEmployeeId = req.user?.employeeId;

        const updates = {};
        if (shift_timing !== undefined) {
            if (!String(shift_timing).trim()) {
                return res.status(400).json({ success: false, message: 'Shift timing is required' });
            }
            updates.shift_timing = String(shift_timing).trim();
        }
        if (isFlexibleShift !== undefined) {
            updates.isFlexibleShift = Boolean(isFlexibleShift);
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ success: false, message: 'No update data provided' });
        }

        const isAdminRole = ['admin', 'sub_admin', 'hr'].includes(req.user?.role);
        let managerName = null;

        if (!isAdminRole) {
            const { data: manager, error: mErr } = await supabase
                .from('employees').select('first_name, last_name')
                .eq('employee_id', managerEmployeeId).single();
            if (mErr || !manager) return res.status(403).json({ success: false, message: 'Manager not found' });
            managerName = `${manager.first_name} ${manager.last_name}`.trim();
        }

        const { data: emp, error: empErr } = await supabase
            .from('employees').select('employee_id, first_name, last_name, reporting_manager, email, shift_timing')
            .eq('employee_id', employee_id).single();
        if (empErr || !emp) return res.status(404).json({ success: false, message: 'Employee not found' });

        console.log(`📧 [SHIFT UPDATE] Employee email found: ${emp.email || 'NULL — no email on record'}`);

        if (!isAdminRole && emp.reporting_manager?.trim().toLowerCase() !== managerName.toLowerCase()) {
            return res.status(403).json({ success: false, message: 'You can only update shift for employees who report to you' });
        }

        const effectiveFrom = effective_from || new Date().toISOString().split('T')[0];

        let data;
        let error;
        try {
            ({ data, error } = await supabase
                .from('employees')
                .update({ ...updates, updated_at: new Date().toISOString() })
                .eq('employee_id', employee_id)
                .select('employee_id, first_name, last_name, shift_timing, "isFlexibleShift"'));
        } catch (updateErr) {
            error = updateErr;
        }

        if (error && /isFlexibleShift|does not exist/i.test(error.message || '')) {
            const { isFlexibleShift, ...safeUpdates } = updates;
            ({ data, error } = await supabase
                .from('employees')
                .update({ ...safeUpdates, updated_at: new Date().toISOString() })
                .eq('employee_id', employee_id)
                .select('employee_id, first_name, last_name, shift_timing'));
        }

        if (error) throw error;

        if (updates.shift_timing) {
            await supabase.from('employee_shift_history').insert([{
                employee_id,
                shift_timing: updates.shift_timing,
                effective_from: effectiveFrom,
                ...(effective_until ? { effective_until } : {})
            }]);
            console.log(`✅ [SHIFT UPDATE] DB updated — new shift: ${updates.shift_timing} | effective_from: ${effectiveFrom}`);
        } else {
            console.log(`✅ [SHIFT UPDATE] DB updated — flexible-shift flag changed for ${employee_id}`);
        }

        res.json({ success: true, message: `Shift updated for ${emp.first_name} ${emp.last_name}`, employee: data[0] });

        // Non-blocking email — runs after response is sent
        ;(async () => {
            try {
                console.log(`🔑 [SHIFT EMAIL] RESEND_API_KEY exists: ${!!process.env.RESEND_API_KEY}`);

                if (!emp.email) {
                    console.warn('⚠️ [SHIFT EMAIL] Skipped — no email address on employee record');
                    return;
                }

                console.log(`📤 [SHIFT EMAIL] Sending to: ${emp.email} | new shift: ${shift_timing.trim()}`);

                const result = await sendShiftChangeEmail(
                    { email: emp.email, first_name: emp.first_name, last_name: emp.last_name },
                    {
                        oldShift: emp.shift_timing || null,
                        newShift: shift_timing.trim(),
                        effectiveFrom,
                        effectiveUntil: effective_until || null,
                        changedBy: managerName,
                    }
                );

                if (result?.success) {
                    console.log(`✅ [SHIFT EMAIL] Sent successfully | Resend ID: ${result.id}`);
                } else {
                    console.error(`❌ [SHIFT EMAIL] Failed | reason: ${result?.reason || result?.error || 'unknown'}`);
                }
            } catch (emailErr) {
                console.error('❌ [SHIFT EMAIL] Exception:', emailErr.message);
            }
        })();

    } catch (error) {
        console.error('❌ [SHIFT UPDATE] Error:', error.message);
        res.status(500).json({ success: false, message: 'Failed to update shift', error: error.message });
    }
});

// Admin/HR-only "hide from celebrations" flag — lets an admin suppress one employee's
// birthday/anniversary/new-joiner card from CelebrationsCard.jsx without deleting any data.
// Additive column, safe to run once in the Supabase SQL editor:
// ALTER TABLE employees ADD COLUMN IF NOT EXISTS hide_from_celebrations BOOLEAN DEFAULT false;
// Every read below defaults falsy when the column isn't migrated yet (nobody hidden), and the
// PUT /:id fallback (see ~line 900) drops it from the update rather than failing the request.

// `new Date("2026-08-13")` parses a date-only string as UTC midnight, then reading back
// .getMonth()/.getDate() on a server running in a timezone behind UTC can silently read the
// PREVIOUS calendar day — a classic off-by-one for birthdays/anniversaries/joining dates.
// Parsing the Y-M-D components directly and building the Date with the local-time constructor
// sidesteps that ambiguity entirely, regardless of server TZ.
const parseDateOnly = (value) => {
    if (!value) return null;
    const [y, m, d] = String(value).split('T')[0].split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
};

// The inverse of parseDateOnly — formats a local Date back to "YYYY-MM-DD" using its local
// Y/M/D components. NEVER use `date.toISOString().split('T')[0]` for this: for any server
// timezone AHEAD of UTC (e.g. IST, UTC+5:30 — confirmed this app's deployment), converting a
// local midnight to UTC first rolls it back into the previous day, so every "upcoming"
// birthday/anniversary date silently displayed one day too early.
const localDateStr = (date) => {
    const y = date.getFullYear(), m = String(date.getMonth() + 1).padStart(2, '0'), d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

// ============== TODAY'S EVENTS ROUTE (BIRTHDAYS & ANNIVERSARIES) ==============
router.get('/today-events', async (req, res) => {
    try {
        const today = new Date();
        const todayMonth = today.getMonth() + 1;
        const todayDay = today.getDate();

        console.log('📅 Fetching events for date:', `${todayMonth}-${todayDay}`);

        // Get all employees
        const { data: employees, error } = await supabase
            .from('employees')
            .select('*');

        if (error) throw error;

        const birthdays = [];
        const anniversaries = [];

        (employees || []).forEach(emp => {
            if (emp.hide_from_celebrations) return;

            // Check birthday — parseDateOnly returns null for a malformed/unexpected dob value
            // (unlike the old `new Date(str)` which silently produced "Invalid Date" instead of
            // null); skip just this check for that employee rather than crash the whole endpoint,
            // and don't let it skip their anniversary check below too.
            const dob = emp.dob ? parseDateOnly(emp.dob) : null;
            if (dob) {
                const dobMonth = dob.getMonth() + 1;
                const dobDay = dob.getDate();

                if (dobMonth === todayMonth && dobDay === todayDay) {
                    birthdays.push({
                        id: emp.id,
                        employee_id: emp.employee_id,
                        first_name: emp.first_name,
                        last_name: emp.last_name,
                        department: emp.department,
                        position: emp.designation || emp.position,
                        profile_image: emp.profile_image
                    });
                }
            }

            // Check work anniversary
            const joiningDate = emp.joining_date ? parseDateOnly(emp.joining_date) : null;
            if (joiningDate) {
                const joiningMonth = joiningDate.getMonth() + 1;
                const joiningDay = joiningDate.getDate();

                if (joiningMonth === todayMonth && joiningDay === todayDay) {
                    const years = today.getFullYear() - joiningDate.getFullYear();
                    if (years > 0) { // Only count if at least 1 year completed
                        anniversaries.push({
                            id: emp.id,
                            employee_id: emp.employee_id,
                            first_name: emp.first_name,
                            last_name: emp.last_name,
                            department: emp.department,
                            position: emp.designation || emp.position,
                            profile_image: emp.profile_image,
                            joining_date: emp.joining_date,
                            years: years
                        });
                    }
                }
            }
        });

        console.log(`✅ Found ${birthdays.length} birthdays and ${anniversaries.length} anniversaries today`);

        res.json({
            success: true,
            date: localDateStr(today),
            birthdays,
            anniversaries,
            total: birthdays.length + anniversaries.length
        });

    } catch (error) {
        console.error('❌ Error fetching today events:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch events',
            error: error.message
        });
    }
});

// ============== UPCOMING EVENTS (next 14 days) + NEW JOINERS THIS WEEK ==============
router.get('/today-events/upcoming', async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        // ?all=true returns every active employee's next occurrence (full company
        // calendar, for the "View All" list) instead of just the next 14 days.
        const WINDOW_DAYS = req.query.all === 'true' ? 366 : 14;

        // Monday-Sunday of the current week, for "new joiners this week"
        const dow = today.getDay();
        const monday = new Date(today);
        monday.setDate(today.getDate() - ((dow + 6) % 7));
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        sunday.setHours(23, 59, 59, 999);

        let { data: employees, error } = await supabase
            .from('employees')
            .select('id, employee_id, first_name, last_name, dob, joining_date, department, designation, profile_image, is_active, hide_from_celebrations')
            .eq('is_active', true);
        if (error && /hide_from_celebrations|does not exist/i.test(error.message || '')) {
            // Not migrated yet on this DB — retry without it so upcoming events still load;
            // nobody is treated as hidden until the ALTER TABLE below is run.
            ({ data: employees, error } = await supabase
                .from('employees')
                .select('id, employee_id, first_name, last_name, dob, joining_date, department, designation, profile_image, is_active')
                .eq('is_active', true));
        }
        if (error) throw error;

        // Returns { daysUntil, occurrenceYear, occurrenceDate } for the next upcoming
        // month/day, rolling into next year if this year's occurrence has already passed.
        const nextOccurrence = (monthDayDate) => {
            const thisYear = new Date(today.getFullYear(), monthDayDate.getMonth(), monthDayDate.getDate());
            const occurrence = thisYear < today
                ? new Date(today.getFullYear() + 1, monthDayDate.getMonth(), monthDayDate.getDate())
                : thisYear;
            return {
                daysUntil: Math.round((occurrence - today) / (1000 * 60 * 60 * 24)),
                occurrenceYear: occurrence.getFullYear(),
                occurrenceDate: localDateStr(occurrence),
            };
        };

        const birthdays = [];
        const anniversaries = [];

        (employees || []).forEach(emp => {
            if (emp.hide_from_celebrations) return;
            const dob = emp.dob ? parseDateOnly(emp.dob) : null;
            if (dob) {
                const { daysUntil, occurrenceDate } = nextOccurrence(dob);
                if (daysUntil >= 1 && daysUntil <= WINDOW_DAYS) {
                    birthdays.push({
                        id: emp.id,
                        employee_id: emp.employee_id,
                        first_name: emp.first_name,
                        last_name: emp.last_name,
                        department: emp.department,
                        position: emp.designation,
                        profile_image: emp.profile_image,
                        date: occurrenceDate,
                        days_until: daysUntil,
                    });
                }
            }
            const joiningDate = emp.joining_date ? parseDateOnly(emp.joining_date) : null;
            if (joiningDate) {
                const { daysUntil, occurrenceYear, occurrenceDate } = nextOccurrence(joiningDate);
                const years = occurrenceYear - joiningDate.getFullYear();
                if (years > 0 && daysUntil >= 1 && daysUntil <= WINDOW_DAYS) {
                    anniversaries.push({
                        id: emp.id,
                        employee_id: emp.employee_id,
                        first_name: emp.first_name,
                        last_name: emp.last_name,
                        department: emp.department,
                        position: emp.designation,
                        profile_image: emp.profile_image,
                        joining_date: emp.joining_date,
                        date: occurrenceDate,
                        years,
                        days_until: daysUntil,
                    });
                }
            }
        });

        const newJoiners = (employees || [])
            .filter(emp => {
                if (!emp.joining_date || emp.hide_from_celebrations) return false;
                const j = parseDateOnly(emp.joining_date);
                if (!j) return false;
                return j >= monday && j <= sunday;
            })
            .map(emp => ({
                id: emp.id,
                employee_id: emp.employee_id,
                first_name: emp.first_name,
                last_name: emp.last_name,
                department: emp.department,
                position: emp.designation,
                profile_image: emp.profile_image,
                joining_date: emp.joining_date,
            }));

        birthdays.sort((a, b) => a.days_until - b.days_until);
        anniversaries.sort((a, b) => a.days_until - b.days_until);

        res.json({ success: true, birthdays, anniversaries, new_joiners: newJoiners });
    } catch (error) {
        console.error('❌ Error fetching upcoming events:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch upcoming events', error: error.message });
    }
});

// ============== EMPLOYEE CRUD OPERATIONS ==============

router.post('/', verifyToken, isAdminOrDesktopSupport, async (req, res) => {
    try {
        const employeeData = req.body;

        // Required so onboarding tickets (IT/Marketing) always carry full employee info.
        const REQUIRED_FIELDS = {
            first_name: 'First name', last_name: 'Last name', email: 'Email',
            joining_date: 'Joining date', designation: 'Designation', department: 'Department',
            reporting_manager: 'Reporting manager', phone: 'Contact number', dob: 'Date of birth',
            blood_group: 'Blood group', emergency_contact: 'Emergency contact number', address: 'Address',
        };
        for (const [field, label] of Object.entries(REQUIRED_FIELDS)) {
            if (!employeeData[field] || !String(employeeData[field]).trim()) {
                return res.status(400).json({ success: false, message: `${label} is required`, field });
            }
        }

        // The "Initial Password" HR sets in Add Employee (a required field there). It used to be
        // dropped here, leaving the account with no hash, which the removed Welcome@123 login
        // fallback then accepted. Required server-side too, with the same 6-character minimum as
        // the form and the reset routes, so an account can never be created without a working
        // password. Hashed with bcrypt cost 10, like every other password route. Removed from
        // employeeData so the request-body log below never contains it.
        const initialPassword = employeeData.password;
        delete employeeData.password;
        if (typeof initialPassword !== 'string' || initialPassword === '') {
            return res.status(400).json({ success: false, message: 'Initial password is required', field: 'password' });
        }
        if (initialPassword.length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters', field: 'password' });
        }
        // Role is decided server-side (see utils/employeeRoles.js): only admin/sub_admin/hr may
        // create anything other than a standard 'employee' account. Checked before hashing or
        // any database work, and rejected rather than silently downgraded.
        const roleDecision = resolveNewEmployeeRole(employeeData.role, req.user?.role);
        if (!roleDecision.role) {
            console.warn(`⛔ [CREATE EMPLOYEE] role '${String(employeeData.role)}' refused for caller ${req.user?.employeeId || '(unknown)'} (${req.user?.role || 'no role'})`);
            return res.status(roleDecision.status).json({ success: false, message: roleDecision.message, field: 'role' });
        }
        const assignedRole = roleDecision.role;

        const initialPasswordHash = await require('bcryptjs').hash(initialPassword, 10);

        // The server is the single authoritative source of employee_id — always generate it
        // here and ignore/overwrite anything the client sent. A generation failure (e.g. a
        // transient DB error) fails the request via the outer catch below, same as any other
        // error in this handler.
        employeeData.employee_id = await generateEmployeeIdBasedOnJoiningDate(employeeData.joining_date);

        console.log('='.repeat(50));
        console.log('📝 CREATE EMPLOYEE REQUEST');
        console.log('Request body:', JSON.stringify(employeeData, null, 2));
        console.log('='.repeat(50));

        // "Email already exists" always names the account that holds it, so HR can tell whether
        // it's the employee they just added, e.g. when re-submitting after a timeout. The unique
        // email constraint means a re-submission can never create a second account for the same
        // email, so re-submitting is always safe.
        const respondEmailExists = (existing) => res.status(400).json({
            success: false,
            message: 'Email already exists',
            code: 'EMAIL_EXISTS',
            field: 'email',
            value: employeeData.email,
            existing_employee_id: existing?.employee_id || null,
            existing_created_at: existing?.created_at || null,
        });

        // A genuinely pre-existing email is refused before anything is written.
        const { data: existingEmail, error: emailCheckError } = await supabase
            .from('employees')
            .select('employee_id, created_at')
            .eq('email', employeeData.email);
        if (emailCheckError) throw emailCheckError;
        if (existingEmail && existingEmail.length > 0) {
            console.log('❌ Email already exists:', employeeData.email);
            return respondEmailExists(existingEmail[0]);
        }

        const insertOnce = async (row) => {
            try {
                return await supabase.from('employees').insert([row]).select();
            } catch (insertErr) {
                return { data: null, error: insertErr };
            }
        };
        // Not-yet-migrated optional columns produce a definite (coded) error, so retrying without
        // them can never duplicate a row. Ambiguous errors are never handled here.
        const insertWithColumnFallbacks = async (row) => {
            let { data, error } = await insertOnce(row);
            if (error && isDefiniteDbError(error) && /isFlexibleShift|does not exist/i.test(error.message || '')) {
                const { isFlexibleShift, ...safeEmployee } = row;
                ({ data, error } = await insertOnce(safeEmployee));
            }
            if (error && isDefiniteDbError(error) && /pf_amount|professional_tax_amount|does not exist|schema cache/i.test(error.message || '')) {
                const { pf_amount, professional_tax_amount, ...safeEmployee } = row;
                ({ data, error } = await insertOnce(safeEmployee));
            }
            return { data, error };
        };

        // One creation attempt, one account. The insert is repeated only after a definite
        // duplicate-employee_id error (the row certainly wasn't saved), with a fresh ID. Any
        // outcome that is unknown (lost response, timeout, gateway error) is verified by reading
        // the row back, never by inserting again.
        const MAX_EMPLOYEE_ID_ATTEMPTS = 5;
        const createdAt = new Date().toISOString();
        let saved = null;
        let recoveredAfterLostResponse = false;

        for (let attempt = 1; ; attempt++) {
            const newEmployee = {
                first_name: employeeData.first_name,
                middle_name: employeeData.middle_name || null,
                last_name: employeeData.last_name,
                employee_id: employeeData.employee_id,
                email: employeeData.email,
                joining_date: employeeData.joining_date,
                designation: employeeData.designation,
                department: employeeData.department,
                reporting_manager: employeeData.reporting_manager || null,
                phone: employeeData.phone || null,
                employment_type: employeeData.employment_type || 'Full Time',
                shift_timing: employeeData.shift_timing || '9:00 AM - 6:00 PM',
                isFlexibleShift: employeeData.isFlexibleShift ?? employeeData.is_flexible_shift ?? false,
                in_hand_salary: employeeData.in_hand_salary || 0,
                gross_salary: employeeData.gross_salary || 0,
                pf_amount: employeeData.pf_amount != null && employeeData.pf_amount !== '' ? Number(employeeData.pf_amount) : null,
                professional_tax_amount: employeeData.professional_tax_amount != null && employeeData.professional_tax_amount !== '' ? Number(employeeData.professional_tax_amount) : null,
                bank_account_name: employeeData.bank_account_name || null,
                account_number: employeeData.account_number || null,
                ifsc_code: employeeData.ifsc_code || null,
                branch_name: employeeData.branch_name || null,
                pan_number: employeeData.pan_number || null,
                aadhar_number: employeeData.aadhar_number || null,
                dob: employeeData.dob || null,
                address: employeeData.address || null,
                blood_group: employeeData.blood_group || null,
                emergency_contact: employeeData.emergency_contact || null,
                linkedin_url: employeeData.linkedin_url || null,
                contract_policy: employeeData.contract_policy || null,
                is_active: true,
                role: assignedRole,
                password: initialPasswordHash,
                joining_month_count: 0,
                can_apply_leave: false,
                created_at: createdAt
            };

            console.log('📦 Inserting employee with data:', { ...newEmployee, password: '[hashed]' });

            const { data, error } = await insertWithColumnFallbacks(newEmployee);
            if (!error) {
                saved = data[0];
                break;
            }

            if (isDefiniteDbError(error)) {
                const duplicate = duplicateKeyTarget(error);
                if (duplicate === 'email') {
                    // Another request saved this email between the check above and this insert.
                    const { data: holder } = await supabase.from('employees')
                        .select('employee_id, created_at').eq('email', employeeData.email).maybeSingle();
                    return respondEmailExists(holder);
                }
                if (duplicate === 'employee_id' && attempt < MAX_EMPLOYEE_ID_ATTEMPTS) {
                    console.log(`⚠️ Employee ID ${employeeData.employee_id} was taken concurrently; retrying with a new ID`);
                    employeeData.employee_id = await generateEmployeeIdBasedOnJoiningDate(employeeData.joining_date);
                    continue;
                }
                throw error; // genuine database failure: nothing was saved
            }

            // Outcome unknown. Look for the row this attempt would have saved.
            console.warn(`⚠️ [CREATE EMPLOYEE] insert outcome unknown for ${employeeData.employee_id} (${error.message || 'no error message'}); verifying`);
            const { data: found, error: lookupError } = await supabase.from('employees')
                .select(ONBOARDING_TICKET_EMPLOYEE_COLUMNS)
                .eq('email', employeeData.email)
                .maybeSingle();
            if (!lookupError && found && found.employee_id === employeeData.employee_id) {
                saved = found;
                recoveredAfterLostResponse = true;
                break;
            }
            if (!lookupError && found) return respondEmailExists(found);

            // Not found, or the lookup failed. Absence isn't proof the insert won't still commit,
            // so don't retry. Tell HR exactly what to check.
            console.error(`❌ [CREATE EMPLOYEE] outcome still unknown for ${employeeData.employee_id}${lookupError ? ` (lookup failed: ${lookupError.message})` : ' (no row found)'}`);
            return res.status(503).json({
                success: false,
                code: 'CREATE_OUTCOME_UNKNOWN',
                message: 'The server lost contact with the database while saving this employee, so it is not known whether the employee was created. Check the Employee List for this email before trying again. Re-submitting is safe: if the employee was created, you will be told the email already exists, with their employee ID.',
                attempted_employee_id: employeeData.employee_id,
            });
        }

        console.log('✅ Employee created successfully:', omitSecretEmployeeFields(saved));

        // The employee is saved. Onboarding tickets are a separate step: their outcome is
        // reported, and a failure is recovered through POST /:id/onboarding-tickets, never by
        // creating the employee again.
        let onboardingTickets;
        try {
            onboardingTickets = await createOnboardingTickets(supabase, { employee: saved, actor: req.user });
        } catch (ticketErr) {
            // createOnboardingTickets is designed never to throw; this is a last line of defence.
            onboardingTickets = { created: [], failed: [{ department: 'all', reason: ticketErr.message }], skipped: [] };
        }
        onboardingTickets = onboardingTickets || { created: [], failed: [], skipped: [] };
        const ticketsFailed = onboardingTickets.failed.length > 0;
        if (ticketsFailed) {
            console.error(`⚠️ [CREATE EMPLOYEE] ${saved.employee_id} saved, but onboarding tickets failed:`, onboardingTickets.failed);
        }

        return res.status(201).json({
            success: true,
            message: ticketsFailed
                ? `Employee created, but these onboarding tickets could not be raised: ${onboardingTickets.failed.map((f) => f.department).join(', ')}. Retry them from the employee (POST /api/employees/${saved.id}/onboarding-tickets). Do not create the employee again.`
                : 'Employee created successfully',
            employee: {
                id: saved.id,
                employee_id: saved.employee_id
            },
            onboarding_tickets: onboardingTickets,
            ...(recoveredAfterLostResponse ? { recovered_after_lost_response: true } : {}),
        });

    } catch (error) {
        // Never log or return a Postgres "Failing row contains (...)" detail: for this table it
        // includes the new password hash and personal data (see safeDbErrorDetails).
        const details = safeDbErrorDetails(error);
        console.error('❌ Error creating employee:', { message: error.message, code: error.code, details });

        res.status(500).json({
            success: false,
            message: 'Failed to create employee',
            error: error.message,
            details
        });
    }
});

// Re-raise onboarding tickets for an employee who already exists, e.g. after Add Employee
// reported that some could not be created. Never creates or modifies the employee. A department
// that already has an onboarding ticket for this employee is skipped, so repeating the call can't
// duplicate tickets. Same roles as creating an employee.
router.post('/:id/onboarding-tickets', verifyToken, isAdminOrDesktopSupport, async (req, res) => {
    try {
        // employees.id is an integer: reject anything else before it reaches the database.
        const employeeDbId = Number(req.params.id);
        if (!/^[1-9][0-9]{0,9}$/.test(req.params.id) || employeeDbId > 2147483647) {
            return res.status(400).json({ success: false, message: 'Invalid employee id' });
        }

        const requested = req.body?.departments;
        if (requested !== undefined && (!Array.isArray(requested) || requested.some((d) => !ONBOARDING_DEPARTMENTS.includes(d)))) {
            return res.status(400).json({ success: false, message: `departments must be a list containing only: ${ONBOARDING_DEPARTMENTS.join(', ')}` });
        }

        const { data: employee, error } = await supabase.from('employees')
            .select(ONBOARDING_TICKET_EMPLOYEE_COLUMNS)
            .eq('id', employeeDbId)
            .maybeSingle();
        if (error) throw error;
        if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

        const result = await createOnboardingTickets(supabase, { employee, actor: req.user, departments: requested || null, skipExisting: true });
        const ok = result.failed.length === 0;
        res.status(ok ? 200 : 502).json({
            success: ok,
            message: ok ? 'Onboarding tickets are in place' : `Some onboarding tickets could not be raised: ${result.failed.map((f) => f.department).join(', ')}`,
            onboarding_tickets: result,
        });
    } catch (error) {
        console.error('❌ Error re-raising onboarding tickets:', { message: error.message, code: error.code });
        res.status(500).json({ success: false, message: 'Failed to raise onboarding tickets', error: error.message });
    }
});

// Update employee role (Admin only)
router.patch('/:id/role', verifyToken, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { role } = req.body;
        const validRoles = ['admin', 'sub_admin', 'manager', 'employee', 'desktop_support', 'finance', 'hr', 'housekeeper'];
        if (!validRoles.includes(role)) {
            return res.status(400).json({ success: false, message: `Invalid role. Must be one of: ${validRoles.join(', ')}` });
        }
        const { data, error } = await supabase
            .from('employees')
            .update({ role })
            .eq('id', id)
            .select('id, employee_id, role');
        if (error) throw error;
        if (!data || data.length === 0) return res.status(404).json({ success: false, message: 'Employee not found' });
        res.json({ success: true, message: 'Role updated successfully', employee: data[0] });
    } catch (error) {
        console.error('Error updating role:', error);
        res.status(500).json({ success: false, message: 'Failed to update role', error: error.message });
    }
});

// employee_id is the join key across ~25 tables (attendance, leaves, breaks, ratings,
// deductions, tickets, etc.) instead of a database foreign key — renaming it is
// deliberately restricted to the strict Admin role only (not the app's usual isAdmin,
// which also allows sub_admin/hr), since a bad rename here is hard to notice and touches
// every table that employee has ever appeared in. See change_employee_id() in
// backend/scripts/create-change-employee-id-function.sql for the actual atomic rename —
// this route is just validation + one RPC call per requested change.
//
// POST /api/employees/change-ids
// body: { changes: [{ old_employee_id, new_employee_id }, ...] }
router.post('/change-ids', verifyToken, async (req, res) => {
    if (req.user?.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    try {
        const changes = Array.isArray(req.body.changes) ? req.body.changes : [];
        if (changes.length === 0) {
            return res.status(400).json({ success: false, message: 'No changes provided' });
        }

        const results = [];
        // Sequential, not Promise.all — if the same new ID is (mistakenly) reused across
        // two rows in one submission, the first must actually land before the second's
        // "is this ID already taken?" check runs, so the duplicate gets caught correctly
        // instead of both racing through.
        for (const change of changes) {
            const oldId = (change.old_employee_id || '').trim();
            const newId = (change.new_employee_id || '').trim();
            if (!oldId || !newId) {
                results.push({ old_employee_id: oldId, new_employee_id: newId, success: false, message: 'Both IDs are required' });
                continue;
            }
            const { error } = await supabase.rpc('change_employee_id', { old_id: oldId, new_id: newId });
            if (error) {
                results.push({ old_employee_id: oldId, new_employee_id: newId, success: false, message: error.message });
            } else {
                results.push({ old_employee_id: oldId, new_employee_id: newId, success: true });
            }
        }

        const allSucceeded = results.every(r => r.success);
        res.json({ success: allSucceeded, results });
    } catch (error) {
        console.error('Error changing employee ID(s):', error);
        res.status(500).json({ success: false, message: 'Failed to change employee ID(s)', error: error.message });
    }
});

// Employee completes their own onboarding profile
router.post('/complete-profile', verifyToken, async (req, res) => {
    try {
        const employeeId = req.user?.employeeId;
        if (!employeeId) return res.status(400).json({ success: false, message: 'Employee ID missing from token' });

        const ALLOWED_FIELDS = [
            'first_name','middle_name','last_name','dob','gender','blood_group',
            'phone','personal_email','address','city','state','pincode',
            'bank_account_name','account_number','ifsc_code','branch_name',
            'pan_number','aadhar_number','uan',
            'emergency_contact','emergency_contact_name','emergency_contact_relation',
        ];

        const updates = {};
        for (const field of ALLOWED_FIELDS) {
            if (req.body[field] !== undefined) {
                updates[field] = req.body[field] || null;
            }
        }
        updates.profile_completed = true;
        updates.updated_at = new Date().toISOString();

        const { data, error } = await supabase
            .from('employees')
            .update(updates)
            .eq('employee_id', employeeId)
            .select()
            .single();

        if (error) return res.status(500).json({ success: false, message: error.message });
        res.json({ success: true, message: 'Profile completed successfully', employee: omitSecretEmployeeFields(data) });
    } catch (err) {
        console.error('complete-profile error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// Admin resets an employee's profile completion status
router.post('/:id/reset-profile', verifyToken, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { data, error } = await supabase
            .from('employees')
            .update({ profile_completed: false, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();

        if (error) return res.status(500).json({ success: false, message: error.message });
        res.json({ success: true, message: 'Profile completion reset. Employee will be prompted to re-complete on next login.', employee: omitSecretEmployeeFields(data) });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Admin toggles whether an employee must fill the profile completion form
// EmployeeList.jsx's bulk "Form" button (require/skip profile completion) is shown to
// desktop_support (IT) too — see the role check around the header action buttons — so
// this must accept that role, not just isAdmin.
router.post('/:id/toggle-profile-form', verifyToken, isAdminOrDesktopSupport, async (req, res) => {
    try {
        const { id } = req.params;
        // Read current value then flip it
        const { data: current, error: fetchErr } = await supabase
            .from('employees')
            .select('require_profile_completion')
            .eq('id', id)
            .single();
        if (fetchErr) return res.status(500).json({ success: false, message: fetchErr.message });

        const newValue = !current.require_profile_completion;
        const patch = { require_profile_completion: newValue, updated_at: new Date().toISOString() };
        // When turning ON, also reset profile_completed so the popup appears again
        if (newValue) patch.profile_completed = false;

        const { data, error } = await supabase
            .from('employees')
            .update(patch)
            .eq('id', id)
            .select()
            .single();

        if (error) return res.status(500).json({ success: false, message: error.message });
        res.json({ success: true, require_profile_completion: newValue, profile_completed: data.profile_completed, employee: omitSecretEmployeeFields(data) });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Toggle employee active/inactive status (Admin, sub_admin, TL/manager)
router.patch('/:id/toggle-status', verifyToken, async (req, res) => {
    try {
        const { role, employeeId: callerEmpId } = req.user;
        const allowed = ['admin', 'sub_admin', 'manager', 'hr', 'desktop_support'];
        if (!allowed.includes(role)) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const { id } = req.params;
        const { data: target, error: fetchErr } = await supabase
            .from('employees')
            .select('id, employee_id, first_name, last_name, is_active, reporting_manager, role')
            .eq('id', id)
            .single();
        if (fetchErr || !target) return res.status(404).json({ success: false, message: 'Employee not found' });

        // TLs (manager role) can only deactivate their own direct reports
        if (role === 'manager') {
            const { data: caller } = await supabase
                .from('employees')
                .select('first_name, last_name')
                .eq('employee_id', callerEmpId)
                .single();
            if (caller) {
                const callerName = `${caller.first_name} ${caller.last_name}`.trim().toLowerCase();
                if (!target.reporting_manager || target.reporting_manager.trim().toLowerCase() !== callerName) {
                    return res.status(403).json({ success: false, message: 'You can only deactivate your own team members' });
                }
            }
        }

        const newStatus = !target.is_active;
        const { data, error } = await supabase
            .from('employees')
            .update({ is_active: newStatus, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select('id, employee_id, first_name, last_name, is_active')
            .single();
        if (error) throw error;

        const action = newStatus ? 'activated' : 'deactivated';
        res.json({ success: true, message: `Employee ${action} successfully`, employee: data, is_active: newStatus });
    } catch (err) {
        console.error('Error toggling employee status:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// The next 25th from today (IST) — matches the 26th-25th salary cycle used across payroll.
// An employee marked "left" any time during a cycle keeps their account (and gets paid)
// through the end of that cycle, then is auto-deactivated the day after processing.
const computeNextSalaryCycleEnd = () => {
    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(Date.now() + IST_OFFSET_MS);
    const day = istNow.getUTCDate();
    let targetYear = istNow.getUTCFullYear();
    let targetMonth = istNow.getUTCMonth(); // 0-based
    if (day > 25) {
        targetMonth += 1;
        if (targetMonth > 11) { targetMonth = 0; targetYear += 1; }
    }
    const mm = String(targetMonth + 1).padStart(2, '0');
    return `${targetYear}-${mm}-25`;
};

// POST /api/employees/mark-left
// body: { employee_id }
// Marks an employee as having left the team/company. Does NOT deactivate them immediately —
// their account stays fully active (can log in, gets paid for the current cycle) until
// scheduled_deactivation_date, when the daily cron in backend/cron/processLeftEmployees.js
// deactivates them automatically. Same permission model as toggle-status above.
router.post('/mark-left', verifyToken, async (req, res) => {
    try {
        const { role, employeeId: callerEmpId } = req.user;
        const allowed = ['admin', 'sub_admin', 'manager', 'hr'];
        if (!allowed.includes(role)) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const { employee_id } = req.body;
        if (!employee_id) return res.status(400).json({ success: false, message: 'employee_id is required' });

        const { data: target, error: fetchErr } = await supabase
            .from('employees')
            .select('id, employee_id, first_name, last_name, reporting_manager, marked_left_at')
            .eq('employee_id', employee_id)
            .single();
        if (fetchErr || !target) return res.status(404).json({ success: false, message: 'Employee not found' });

        if (role === 'manager') {
            const { data: caller } = await supabase
                .from('employees')
                .select('first_name, last_name')
                .eq('employee_id', callerEmpId)
                .single();
            if (caller) {
                const callerName = `${caller.first_name} ${caller.last_name}`.trim().toLowerCase();
                if (!target.reporting_manager || target.reporting_manager.trim().toLowerCase() !== callerName) {
                    return res.status(403).json({ success: false, message: 'You can only mark your own team members as left' });
                }
            }
        }

        if (target.marked_left_at) {
            return res.status(400).json({ success: false, message: `${target.first_name} ${target.last_name} is already marked as left.` });
        }

        const scheduledDate = computeNextSalaryCycleEnd();
        const { error: updErr } = await supabase
            .from('employees')
            .update({
                marked_left_at: new Date().toISOString(),
                marked_left_by: callerEmpId,
                scheduled_deactivation_date: scheduledDate,
            })
            .eq('id', target.id);
        if (updErr) throw updErr;

        res.json({
            success: true,
            message: `${target.first_name} ${target.last_name} marked as left. Account stays active and will automatically deactivate on ${scheduledDate}.`,
            scheduled_deactivation_date: scheduledDate,
        });
    } catch (err) {
        console.error('Error marking employee as left:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/employees/unmark-left — undo an accidental "mark as left" before the scheduled date.
router.post('/unmark-left', verifyToken, async (req, res) => {
    try {
        const { role, employeeId: callerEmpId } = req.user;
        const allowed = ['admin', 'sub_admin', 'manager', 'hr'];
        if (!allowed.includes(role)) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const { employee_id } = req.body;
        if (!employee_id) return res.status(400).json({ success: false, message: 'employee_id is required' });

        const { data: target, error: fetchErr } = await supabase
            .from('employees')
            .select('id, first_name, last_name, reporting_manager')
            .eq('employee_id', employee_id)
            .single();
        if (fetchErr || !target) return res.status(404).json({ success: false, message: 'Employee not found' });

        if (role === 'manager') {
            const { data: caller } = await supabase
                .from('employees')
                .select('first_name, last_name')
                .eq('employee_id', callerEmpId)
                .single();
            if (caller) {
                const callerName = `${caller.first_name} ${caller.last_name}`.trim().toLowerCase();
                if (!target.reporting_manager || target.reporting_manager.trim().toLowerCase() !== callerName) {
                    return res.status(403).json({ success: false, message: 'You can only undo this for your own team members' });
                }
            }
        }

        const { error: updErr } = await supabase
            .from('employees')
            .update({ marked_left_at: null, marked_left_by: null, scheduled_deactivation_date: null })
            .eq('id', target.id);
        if (updErr) throw updErr;

        res.json({ success: true, message: `${target.first_name} ${target.last_name}'s "left" mark was removed.` });
    } catch (err) {
        console.error('Error unmarking employee as left:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// Update employee — EditEmployee.jsx's "Edit Details" action is shown to desktop_support
// (IT) too, so this must accept that role. Role-change itself stays admin/sub_admin/hr
// only via the inline check just below (`if ('role' in updates && !isAdmin...) delete
// updates.role`), which already anticipated a broader caller set than isAdmin alone.
router.put('/:id', verifyToken, isAdminOrDesktopSupport, async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        if (updates.isFlexibleShift !== undefined) {
            updates.isFlexibleShift = Boolean(updates.isFlexibleShift);
        }
        if (updates.is_flexible_shift !== undefined) {
            updates.isFlexibleShift = Boolean(updates.is_flexible_shift);
        }
        const newShiftTiming = updates.shift_timing;

        // Only admin/sub_admin can change role
        if ('role' in updates && !['admin', 'sub_admin', 'hr'].includes(req.user?.role)) {
            delete updates.role;
        }
        if ('role' in updates) {
            const validRoles = ['admin', 'sub_admin', 'manager', 'employee', 'desktop_support', 'finance', 'hr', 'housekeeper'];
            if (!validRoles.includes(updates.role)) {
                return res.status(400).json({ success: false, message: 'Invalid role value' });
            }
        }

        // Remove fields that shouldn't be updated
        delete updates.id;
        delete updates.employee_id;
        delete updates.created_at;

        // Password/credential columns are never writable through this generic edit. It used to
        // store `password` raw, so an admin or desktop_support user could set any account's
        // password, or null it, which the old Welcome@123 login fallback then accepted.
        // Passwords change only via the dedicated, hashing routes (/:id/reset-password,
        // /api/auth/*). Ignored rather than rejected: an Edit Employee page from an older build
        // still sends back the hash it loaded, and that must not break ordinary profile edits.
        const ignoredSecretFields = SECRET_EMPLOYEE_COLUMNS.filter((column) => column in updates);
        ignoredSecretFields.forEach((column) => delete updates[column]);
        if (ignoredSecretFields.length > 0) {
            console.warn(`⚠️ [PUT /employees/${id}] ignored credential field(s): ${ignoredSecretFields.join(', ')} — by ${req.user?.employeeId} (${req.user?.role})`);
        }

        // Add updated timestamp
        updates.updated_at = new Date().toISOString();

        let { data, error } = await supabase
            .from('employees')
            .update(updates)
            .eq('id', id)
            .select();

        // Supabase reports a missing column differently depending on the operation:
        // SELECT-style reads say "column X does not exist"; UPDATE payloads referencing an
        // unknown key say "Could not find the 'X' column ... in the schema cache" (PGRST204).
        // Match both, and strip every recently-added optional column at once so a single
        // not-yet-migrated field doesn't lose the rest of the update in the same request.
        if (error && /does not exist|schema cache/i.test(error.message || '')) {
            const { pt_amount, professional_tax_amount, exclude_from_payroll, isFlexibleShift, hide_from_celebrations, ...safeUpdates } = updates;
            ({ data, error } = await supabase
                .from('employees')
                .update(safeUpdates)
                .eq('id', id)
                .select());
        }

        if (error) throw error;

        if (!data || data.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Employee not found'
            });
        }

        // If shift_timing was updated, save to history
        if (newShiftTiming) {
            const effectiveFrom = new Date().toISOString().split('T')[0];
            await supabase.from('employee_shift_history').insert([{
                employee_id: data[0].employee_id,
                shift_timing: newShiftTiming.trim(),
                effective_from: effectiveFrom
            }]);
        }

        res.json({
            success: true,
            message: 'Employee updated successfully',
            employee: omitSecretEmployeeFields(data[0])
        });

    } catch (error) {
        console.error('Error updating employee:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update employee',
            error: error.message
        });
    }
});

// Get employee by ID (with all fields)
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        console.log(`📤 Fetching employee with ID: ${id}`);

        let query = supabase
            .from('employees')
            .select('*');

        // Check if id is number or string
        if (!isNaN(id)) {
            query = query.eq('id', parseInt(id));
        } else {
            query = query.eq('employee_id', id);
        }

        const { data, error } = await query.single();

        if (error) {
            if (error.code === 'PGRST116') { // No rows returned
                return res.status(404).json({
                    success: false,
                    message: 'Employee not found'
                });
            }
            throw error;
        }

        console.log('📤 Sending employee data:', Object.keys(data));
        res.json(omitSecretEmployeeFields(data));

    } catch (error) {
        console.error('❌ Error fetching employee:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get employee by employee_id (for profile)
router.get('/profile/:employeeId', async (req, res) => {
    try {
        const { employeeId } = req.params;

        const { data, error } = await supabase
            .from('employees')
            .select('*')
            .eq('employee_id', employeeId)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return res.status(404).json({
                    success: false,
                    message: 'Employee not found'
                });
            }
            throw error;
        }

        res.json(omitSecretEmployeeFields(data));

    } catch (error) {
        console.error('Error fetching employee profile:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch employee profile',
            error: error.message
        });
    }
});


// Get all employees (returns array directly)
router.get('/', async (req, res) => {
    try {
        const { department, search, active, manager_id } = req.query;

        // Manager Dashboard "View Team" filter — manager_id is an employee_id, resolved
        // to that manager's direct reports via reporting_manager name matching (same
        // primitive used by /manager/team and the team-report/regularization endpoints).
        let teamIds = null;
        if (manager_id) {
            teamIds = await getTeamEmployeeIdsByEmployeeId(manager_id);
            if (teamIds && teamIds.length === 0) {
                return res.json([]); // resolved manager has no direct reports — empty state, not company-wide
            }
        }

        let query = supabase
            .from('employees')
            .select('*');

        if (teamIds) {
            query = query.in('employee_id', teamIds);
        }

        if (department) {
            query = query.eq('department', department);
        }

        if (search) {
            query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,employee_id.ilike.%${search}%,email.ilike.%${search}%`);
        }

        // Default is now active-only — a deactivated employee must disappear from every
        // list/dropdown/export/report built on this endpoint the moment they're deactivated,
        // without every one of those dozens of call sites having to remember to opt in.
        // Previously the default was the opposite (everyone, unless a caller explicitly
        // passed ?active=true), which is exactly why deactivated employees kept resurfacing
        // in places that never thought to ask for the filter. Admin screens that genuinely
        // need to see deactivated accounts (the Employee List's Inactive tab, viewing a
        // specific employee's own profile) pass ?active=all explicitly instead.
        if (active === 'false') {
            query = query.eq('is_active', false);
        } else if (active !== 'all') {
            query = query.eq('is_active', true);
        }

        query = query.order('created_at', { ascending: false });

        const { data, error } = await query;

        if (error) throw error;

        console.log(`📊 Found ${data?.length || 0} employees`);
        res.json(omitSecretEmployeeFieldsFromAll(data || []));

    } catch (error) {
        console.error('Error fetching employees:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch employees',
            error: error.message
        });
    }
});

// Employee deletion is disabled — use PATCH /:id/toggle-status to deactivate instead
router.delete('/:id', verifyToken, isAdmin, (req, res) => {
    res.status(403).json({
        success: false,
        message: 'Permanent deletion is disabled. Use the deactivate feature to disable an employee account.',
    });
});

// Hard delete disabled — deactivate instead
router.delete('/:id/hard', verifyToken, isAdmin, (req, res) => {
    res.status(403).json({
        success: false,
        message: 'Permanent deletion is disabled. Use the deactivate feature to disable an employee account.',
    });
});

// Admin / Desktop Support can reset an employee's password
router.post('/:id/reset-password', verifyToken, isAdminOrDesktopSupport, async (req, res) => {
    try {
        const { id } = req.params;
        const { newPassword } = req.body;

        if (!newPassword) return res.status(400).json({ success: false, message: 'New password is required' });
        if (newPassword.length < 6) return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });

        const bcrypt = require('bcryptjs');
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        const { error } = await supabase
            .from('employees')
            .update({ password: hashedPassword, updated_at: new Date().toISOString() })
            .eq('id', id);

        if (error) throw error;

        return res.json({ success: true, message: 'Password reset successfully' });
    } catch (error) {
        console.error('Error resetting password:', error);
        return res.status(500).json({ success: false, message: 'Failed to reset password' });
    }
});

// ============== DOCUMENT MANAGEMENT ==============

const DOCUMENT_FIELDS = new Set([
    'profile_image', 'appointment_letter', 'offer_letter', 'contract_document',
    'aadhar_card', 'pan_card', 'bank_proof', 'education_certificates',
    'experience_certificates', 'relieving_letter', 'salary_slip',
]);

// Document routes use camelCase employeeId; enforce ownership before file parsing or storage.
const requireDocumentAccess = (req, res, next) => {
    const privileged = ['admin', 'sub_admin', 'hr'].includes(req.user?.role);
    if (!privileged && (!req.user?.employeeId || req.user.employeeId !== req.params.employeeId)) {
        return res.status(403).json({ success: false, message: 'You can only access your own documents.' });
    }
    next();
};

const requireDocumentType = (req, res, next) => {
    if (!DOCUMENT_FIELDS.has(req.params.documentType)) {
        return res.status(400).json({ success: false, message: 'Invalid document type.' });
    }
    next();
};

// Upload documents — buffers go directly to Supabase Storage (no disk write)
router.post('/:employeeId/documents', verifyToken, requireDocumentAccess, upload.any(), async (req, res) => {
    try {
        const { employeeId } = req.params;
        const files = req.files;

        console.log('📥 Document upload for employee:', employeeId, '| files:', files?.length || 0);

        if (!files || files.length === 0) {
            return res.status(400).json({ success: false, message: 'No files uploaded' });
        }

        if (files.some(file => !DOCUMENT_FIELDS.has(file.fieldname))) {
            return res.status(400).json({ success: false, message: 'Invalid document type.' });
        }

        const documentUpdates = {};

        for (const file of files) {
            const folder = folderForField(file.fieldname);
            const { publicUrl } = await uploadFile(file.buffer, file.originalname, folder, file.mimetype);
            documentUpdates[file.fieldname] = publicUrl;
            console.log(`📄 Uploaded ${file.fieldname} → ${publicUrl}`);
        }

        const { data, error } = await supabase
            .from('employees')
            .update(documentUpdates)
            .eq('employee_id', employeeId)
            .select();

        if (error) throw error;

        console.log('✅ DB updated with document URLs');

        if (documentUpdates.profile_image) {
            await createProfilePhotoPost(supabase, data[0]);
        }

        res.json({
            success: true,
            message: 'Documents uploaded successfully',
            documents: documentUpdates,
            updated_employee: omitSecretEmployeeFields(data[0]),
        });

    } catch (error) {
        console.error('❌ Error uploading documents:', error);
        res.status(500).json({ success: false, message: 'Failed to upload documents', error: error.message });
    }
});

// Get employee documents
router.get('/:employeeId/documents', verifyToken, requireDocumentAccess, async (req, res) => {
    try {
        const { employeeId } = req.params;

        console.log('📄 Fetching documents for employee:', employeeId);

        // First verify employee exists
        const { data: employee, error: empError } = await supabase
            .from('employees')
            .select('id')
            .eq('employee_id', employeeId)
            .maybeSingle();

        if (empError) {
            console.error('❌ Error checking employee:', empError);
            throw empError;
        }

        if (!employee) {
            console.log('⚠️ Employee not found:', employeeId);
            return res.status(404).json({
                success: false,
                message: 'Employee not found'
            });
        }

        // Now fetch documents
        const { data, error } = await supabase
            .from('employees')
            .select(`
                profile_image, appointment_letter, offer_letter, 
                contract_document, aadhar_card, pan_card, 
                bank_proof, education_certificates, experience_certificates,
                relieving_letter, salary_slip
            `)
            .eq('employee_id', employeeId)
            .maybeSingle();

        if (error) {
            console.error('❌ Error fetching documents:', error);
            throw error;
        }

        if (!data) {
            console.log('⚠️ No document record found for employee:', employeeId);
            return res.json({});
        }

        // Filter out null values
        const documents = {};
        Object.keys(data).forEach(key => {
            if (data[key]) {
                documents[key] = data[key];
            }
        });

        console.log('✅ Documents fetched successfully:', Object.keys(documents));
        res.json(documents);

    } catch (error) {
        console.error('❌ Error in documents endpoint:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch documents',
            error: error.message,
            details: error.details || error.hint
        });
    }
});


// Download / view a specific document — redirects to the Supabase Storage URL
router.get('/:employeeId/documents/:documentType', verifyToken, requireDocumentAccess, requireDocumentType, async (req, res) => {
    try {
        const { employeeId, documentType } = req.params;

        const { data, error } = await supabase
            .from('employees')
            .select(documentType)
            .eq('employee_id', employeeId)
            .single();

        if (error || !data || !data[documentType]) {
            return res.status(404).json({ success: false, message: 'Document not found' });
        }

        const url = data[documentType];

        // Documents stored as Supabase Storage public URLs — redirect the browser directly
        if (url.startsWith('http')) {
            return res.redirect(url);
        }

        // Legacy: file was stored as a bare filename before the Supabase migration
        return res.status(410).json({
            success: false,
            message: 'Document predates cloud storage — please re-upload.',
        });

    } catch (error) {
        console.error('❌ Error fetching document:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch document', error: error.message });
    }
});

// Delete a specific document — removes from Supabase Storage then clears DB field
router.delete('/:employeeId/documents/:documentType', verifyToken, requireDocumentAccess, requireDocumentType, async (req, res) => {
    try {
        const { employeeId, documentType } = req.params;

        const { data, error: fetchError } = await supabase
            .from('employees')
            .select(documentType)
            .eq('employee_id', employeeId)
            .single();

        if (fetchError) throw fetchError;

        // Delete from Supabase Storage (handles both URL and bare-path formats)
        if (data?.[documentType]) {
            await deleteFile(data[documentType]);
        }

        const { error: updateError } = await supabase
            .from('employees')
            .update({ [documentType]: null })
            .eq('employee_id', employeeId);

        if (updateError) throw updateError;

        res.json({ success: true, message: 'Document deleted successfully' });

    } catch (error) {
        console.error('Error deleting document:', error);
        res.status(500).json({ success: false, message: 'Failed to delete document', error: error.message });
    }
});

module.exports = router;