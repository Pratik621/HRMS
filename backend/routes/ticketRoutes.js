/**
 * Ticket Routes  — /api/tickets
 *
 * Supabase tables required (run once in Supabase SQL editor):
 * ──────────────────────────────────────────────────────────
 * CREATE TABLE support_tickets (
 *   id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *   ticket_number   TEXT UNIQUE NOT NULL,
 *   subject         TEXT NOT NULL,
 *   description     TEXT NOT NULL,
 *   department      TEXT NOT NULL,
 *   issue_type      TEXT NOT NULL,
 *   status          TEXT NOT NULL DEFAULT 'open',
 *   priority        TEXT DEFAULT 'medium',
 *   raised_by       TEXT NOT NULL,
 *   raised_by_email TEXT NOT NULL,
 *   raised_by_name  TEXT NOT NULL,
 *   raised_for      TEXT,               -- employee_id the ticket is actually about (defaults to raised_by)
 *   raised_for_name TEXT,
 *   assigned_to     TEXT,               -- employee_id of the specifically selected assignee (null = team queue)
 *   assigned_to_name TEXT,
 *   tagged_employees JSONB DEFAULT '[]',
 *   attachment_url  TEXT,
 *   attachment_name TEXT,
 *   resolve_note    TEXT,
 *   created_at      TIMESTAMPTZ DEFAULT NOW(),
 *   resolved_at     TIMESTAMPTZ,
 *   closed_at       TIMESTAMPTZ,
 *   updated_at      TIMESTAMPTZ DEFAULT NOW()
 * );
 *
 * CREATE TABLE ticket_history (
 *   id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *   ticket_id         UUID REFERENCES support_tickets(id) ON DELETE CASCADE,
 *   action            TEXT NOT NULL,
 *   message           TEXT,
 *   old_status        TEXT,
 *   new_status        TEXT,
 *   performed_by      TEXT,
 *   performed_by_name TEXT,
 *   is_internal       BOOLEAN DEFAULT false,
 *   created_at        TIMESTAMPTZ DEFAULT NOW()
 * );
 *
 * -- Additive migration if ticket_history already exists without this column:
 * -- ALTER TABLE ticket_history ADD COLUMN IF NOT EXISTS is_internal BOOLEAN DEFAULT false;
 *
 * -- Additive migration if support_tickets already exists without these columns:
 * -- ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS raised_for TEXT;
 * -- ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS raised_for_name TEXT;
 * -- Existing rows: raised_for is left NULL (frontend/UI falls back to raised_by/raised_by_name
 * -- for display when raised_for is absent, so old tickets keep showing the right person).
 */

const express = require('express');
const router  = express.Router();
const notificationService = require('../services/notificationService');
const emailService = require('../services/emailService');
const { AGE_THRESHOLDS_HOURS } = require('../config/ticketPolicy');
const { getTeamEmployeeIdsByEmployeeId } = require('../utils/employeeLookup');
const ROLES_CAN_RESOLVE = ['admin', 'sub_admin', 'manager', 'hr'];

module.exports = (supabase, authenticateToken) => {

    const ROLES_SEE_ALL = ['admin', 'sub_admin', 'hr'];

    // ── helpers ──────────────────────────────────────────────────────────────

    const generateTicketNumber = async () => {
        const today = new Date();
        const ymd = today.toISOString().slice(0, 10).replace(/-/g, '');
        const { count } = await supabase.from('support_tickets')
            .select('*', { count: 'exact', head: true });
        const seq = String((count || 0) + 1).padStart(4, '0');
        return `TKT-${ymd}-${seq}`;
    };

    const addHistory = async (ticketId, action, message, oldStatus, newStatus, performedBy, performedByName, isInternal = false) => {
        const row = {
            ticket_id: ticketId,
            action,
            message,
            old_status: oldStatus || null,
            new_status: newStatus || null,
            performed_by: performedBy,
            performed_by_name: performedByName,
            is_internal: isInternal,
        };
        const { error } = await supabase.from('ticket_history').insert(row);
        if (error && /is_internal|does not exist/i.test(error.message || '')) {
            // is_internal column not migrated on this DB yet — retry without it so history/
            // comments keep working; internal notes just won't be flaggable until the
            // `ALTER TABLE ticket_history ADD COLUMN is_internal ...` above is run.
            const { is_internal, ...rowWithoutInternal } = row;
            await supabase.from('ticket_history').insert(rowWithoutInternal);
        }
    };

    const getEmployeeDetails = async (employeeId) => {
        const { data } = await supabase.from('employees')
            .select('employee_id, first_name, last_name, email, reporting_manager, department, role')
            .eq('employee_id', employeeId)
            .maybeSingle();
        return data;
    };

    // Fire-and-forget status-change email to the employee the ticket concerns (raised_for,
    // falling back to raised_by for tickets predating that column/older data) — called from
    // every status-transition route below (in-progress/resolved/closed/reopened) and never
    // awaited by the caller, so a slow/failed email never delays the API response.
    const notifyTicketStatusEmail = (ticket, status, updatedByName, resolveNote) => {
        (async () => {
            try {
                const targetId = ticket.raised_for || ticket.raised_by;
                const targetEmp = await getEmployeeDetails(targetId);
                if (!targetEmp?.email) return;
                await emailService.sendTicketStatusEmail(targetEmp, {
                    ticketNumber: ticket.ticket_number,
                    subject: ticket.subject,
                    status,
                    resolveNote: resolveNote || null,
                    updatedBy: updatedByName || null,
                });
            } catch (e) {
                console.error('❌ Failed to send ticket-status email:', e.message);
            }
        })();
    };

    // ── GET /api/tickets/dept-employees/:department ────────────────────────
    // Returns employees in a given department for @ tagging
    router.get('/dept-employees/:department', authenticateToken, async (req, res) => {
        try {
            const dept = req.params.department;
            const { data, error } = await supabase.from('employees')
                .select('employee_id, first_name, last_name, email, department')
                .eq('department', dept)
                .eq('is_active', true);
            if (error) throw error;
            return res.json({ success: true, employees: data || [] });
        } catch (err) {
            return res.status(500).json({ success: false, message: err.message });
        }
    });

    const visibleTicketsQuery = async (user, managerId) => {
        const { employeeId, role } = user;

        if (ROLES_SEE_ALL.includes(role)) {
            // admin / sub_admin / hr — see everything by default. Manager Dashboard
            // "View Team" filter: narrow to tickets raised by one specific TL/Manager's team.
            let query = supabase.from('support_tickets').select('*').order('created_at', { ascending: false });
            if (managerId && managerId !== 'ALL') {
                const teamIds = await getTeamEmployeeIdsByEmployeeId(managerId);
                if (!teamIds || teamIds.length === 0) return { data: [], error: null };
                query = query.in('raised_by', teamIds);
            }
            return query;
        }

        // Everyone else: own raised tickets + any ticket tagged to their own
        // department (so e.g. any IT employee can see IT tickets, not just
        // the IT manager) + tickets specifically assigned to them (by ID, any
        // role — assignment is no longer manager-only now that @mention can
        // target any active employee in a department) + tickets raised for them.
        const emp = await getEmployeeDetails(employeeId);
        const myDept = emp?.department || '';

        const orParts = [`raised_by.eq.${employeeId}`, `assigned_to.eq.${employeeId}`, `raised_for.eq.${employeeId}`];
        if (myDept) orParts.push(`department.eq.${myDept}`);

        const result = await supabase.from('support_tickets')
            .select('*')
            .or(orParts.join(','))
            .order('created_at', { ascending: false });

        // raised_for not migrated on this DB yet — retry without that clause so the list
        // still loads (falls back to raised_by/department/assigned_to matching only).
        if (result.error && /raised_for|does not exist/i.test(result.error.message || '')) {
            const fallbackParts = orParts.filter(p => !p.startsWith('raised_for.'));
            return supabase.from('support_tickets')
                .select('*')
                .or(fallbackParts.join(','))
                .order('created_at', { ascending: false });
        }
        return result;
    };

    // ── GET /api/tickets ──────────────────────────────────────────────────
    router.get('/', authenticateToken, async (req, res) => {
    const start = Date.now();

    console.log(
        '🎫 GET /api/tickets - START',
        'employeeId:', req.user?.employeeId,
        'role:', req.user?.role
    );

    try {
        const { data, error } = await visibleTicketsQuery(
            req.user,
            req.query.manager_id
        );

        console.log(
            '🎫 GET /api/tickets - DB finished:',
            Date.now() - start,
            'ms',
            'rows:',
            data?.length || 0
        );

        if (error) throw error;

        return res.json({
            success: true,
            tickets: data || []
        });
    } catch (err) {
        console.error(
            '❌ GET /api/tickets failed after',
            Date.now() - start,
            'ms:',
            err
        );

        return res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

    // Hours a still-open ticket has been pending (finished tickets don't count as pending)
    const pendingAgeHours = (t) => {
        if (t.status === 'closed') return 0;
        return (Date.now() - new Date(t.created_at).getTime()) / 3600000;
    };

    // ── GET /api/tickets/count — lightweight counts for dashboard badges/KPIs ──
    // `open`/`in_progress`/`total` are unchanged (existing TicketBadge.jsx contract);
    // the rest are additive for the new dashboard KPI widget.
    router.get('/count', authenticateToken, async (req, res) => {
        try {
            const { data, error } = await visibleTicketsQuery(req.user, req.query.manager_id);
            if (error) throw error;
            const tickets = data || [];
            const open = tickets.filter(t => t.status === 'open').length;
            const in_progress = tickets.filter(t => t.status === 'in_progress').length;
            const resolved_pending = tickets.filter(t => t.status === 'resolved_pending').length;
            const closed = tickets.filter(t => t.status === 'closed').length;
            const pending = tickets.filter(t => t.status !== 'closed');
            const overdue = pending.filter(t => pendingAgeHours(t) >= AGE_THRESHOLDS_HOURS.elevated).length;
            const critical = pending.filter(t => pendingAgeHours(t) >= AGE_THRESHOLDS_HOURS.critical).length;
            return res.json({
                success: true,
                open, in_progress, total: open + in_progress,
                new: open, resolved_pending, closed, overdue, critical,
            });
        } catch (err) {
            return res.status(500).json({ success: false, message: err.message });
        }
    });

    // ── POST /api/tickets — create ─────────────────────────────────────────
    // Assignment model (backend is the source of truth, never trust these IDs blindly):
    //   department  → assigned TEAM (who can see/pick up the ticket; unchanged, existing behavior)
    //   assigned_to → the SPECIFIC person selected via @mention — set ONLY from an explicit,
    //                 validated selection. No implicit fallback to the raiser's reporting
    //                 manager/TL — that was the root cause of tickets silently routing to the
    //                 TL regardless of who was actually @mentioned. Omitted → team queue (null).
    //   raised_for  → the person the ticket is about; defaults to the raiser when omitted.
    router.post('/', authenticateToken, async (req, res) => {
        try {
            const { employeeId } = req.user;
            const {
                subject, description, department, issue_type, priority,
                raised_for, assigned_to, tagged_employees,
                attachment_url, attachment_name,
            } = req.body;

            if (!subject || !description || !department || !issue_type)
                return res.status(400).json({ success: false, message: 'Subject, description, department and issue type are required' });

            const emp = await getEmployeeDetails(employeeId);
            if (!emp) return res.status(404).json({ success: false, message: 'Employee not found' });
            const raiserName = `${emp.first_name} ${emp.last_name}`.trim();

            // raised_for defaults to the raiser (the common "raising it for myself" case) —
            // otherwise must resolve to a real employee, never trusted as a free-text name.
            let raisedForEmp = emp;
            if (raised_for && raised_for !== employeeId) {
                raisedForEmp = await getEmployeeDetails(raised_for);
                if (!raisedForEmp) return res.status(400).json({ success: false, message: 'Selected "Raised For" employee was not found' });
            }

            // assigned_to is optional (omitted = team queue) but if given must resolve to a
            // real, active employee — the @mention's display name is never trusted alone.
            // Assigning outside the ticket's own department is allowed (e.g. an HR admin
            // helping out on an IT ticket) — this app has no existing rule forbidding it, and
            // the dept-employees picker already steers the common case to same-department
            // people anyway, so no extra restriction is added here.
            let assigneeEmp = null;
            if (assigned_to) {
                assigneeEmp = await getEmployeeDetails(assigned_to);
                if (!assigneeEmp) return res.status(400).json({ success: false, message: 'Selected assignee was not found' });
            } else if (Array.isArray(tagged_employees) && tagged_employees.length === 1 && tagged_employees[0]?.employee_id) {
                // Backward-compat fallback for a not-yet-refreshed frontend still sending the
                // old tagged_employees-only shape — same validation, just a different source.
                assigneeEmp = await getEmployeeDetails(tagged_employees[0].employee_id);
            }

            const ticketNumber = await generateTicketNumber();

            const insertPayload = {
                ticket_number:    ticketNumber,
                subject,
                description,
                department,
                issue_type,
                priority:         priority || 'medium',
                status:           'open',
                raised_by:        employeeId,
                raised_by_email:  emp.email || '',
                raised_by_name:   raiserName,
                raised_for:       raisedForEmp.employee_id,
                raised_for_name:  `${raisedForEmp.first_name} ${raisedForEmp.last_name}`.trim(),
                assigned_to:      assigneeEmp?.employee_id || null,
                assigned_to_name: assigneeEmp ? `${assigneeEmp.first_name} ${assigneeEmp.last_name}`.trim() : null,
                tagged_employees: tagged_employees || [],
                attachment_url:   attachment_url || null,
                attachment_name:  attachment_name || null,
            };

            let { data, error } = await supabase.from('support_tickets').insert(insertPayload).select().maybeSingle();
            if (error && /raised_for|does not exist/i.test(error.message || '')) {
                // raised_for/raised_for_name not migrated on this DB yet — retry without them
                // so ticket creation keeps working; "Raised For" just won't persist until the
                // ALTER TABLE above is run (UI already falls back to raised_by for display).
                const { raised_for: _rf, raised_for_name: _rfn, ...payloadWithoutRaisedFor } = insertPayload;
                ({ data, error } = await supabase.from('support_tickets').insert(payloadWithoutRaisedFor).select().maybeSingle());
            }
            if (error) throw error;

            const raisedForNote = raisedForEmp.employee_id !== employeeId ? ` for ${raisedForEmp.first_name} ${raisedForEmp.last_name}` : '';
            await addHistory(data.id, 'created', `Ticket raised by ${raiserName}${raisedForNote}`, null, 'open', employeeId, raiserName);
            await addHistory(
                data.id, 'status_changed',
                assigneeEmp ? `Assigned to ${assigneeEmp.first_name} ${assigneeEmp.last_name}` : `Sent to ${department} Team Queue — no specific assignee selected`,
                null, null, employeeId, raiserName
            );
            await notificationService.sendTicketNotifications(data, 'created', { actorEmployeeId: employeeId, actorName: raiserName });

            // Fire-and-forget: email the employee the ticket is actually about (raised_for,
            // defaults to the raiser themselves) — never blocks the response.
            if (raisedForEmp.email) {
                emailService.sendTicketCreatedEmail(raisedForEmp, {
                    ticketNumber: data.ticket_number,
                    subject: data.subject,
                    description: data.description,
                    priority: data.priority,
                    department: data.department,
                    raisedByName: raisedForEmp.employee_id !== employeeId ? raiserName : null,
                }).catch(e => console.error('❌ Failed to send ticket-created email:', e.message));
            }

            return res.json({ success: true, ticket: data });
        } catch (err) {
            console.error('[tickets] create error:', err);
            return res.status(500).json({ success: false, message: err.message });
        }
    });

    // ── GET /api/tickets/:id ───────────────────────────────────────────────
    router.get('/:id', authenticateToken, async (req, res) => {
        try {
            const { data: ticket, error } = await supabase.from('support_tickets')
                .select('*').eq('id', req.params.id).maybeSingle();
            if (error) throw error;
            if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });

            const { data: history } = await supabase.from('ticket_history')
                .select('*').eq('ticket_id', req.params.id).order('created_at', { ascending: true });

            // Internal notes are only ever visible to team-side roles — this is the real
            // security boundary (never rely on the frontend to hide them).
            const canSeeInternal = ROLES_CAN_RESOLVE.includes(req.user.role);
            const visibleHistory = canSeeInternal
                ? (history || [])
                : (history || []).filter(h => !h.is_internal);

            return res.json({ success: true, ticket, history: visibleHistory });
        } catch (err) {
            return res.status(500).json({ success: false, message: err.message });
        }
    });

    // ── POST /api/tickets/:id/comment ──────────────────────────────────────
    router.post('/:id/comment', authenticateToken, async (req, res) => {
        try {
            const { employeeId, role } = req.user;
            const { message, is_internal } = req.body;
            if (!message?.trim()) return res.status(400).json({ success: false, message: 'Comment is required' });

            const emp = await getEmployeeDetails(employeeId);
            const name = emp ? `${emp.first_name} ${emp.last_name}`.trim() : employeeId;

            const { data: ticket } = await supabase.from('support_tickets')
                .select('*').eq('id', req.params.id).maybeSingle();
            if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });

            // Only team-side roles may post an internal note — silently ignored otherwise,
            // never trust the client's flag alone.
            const wantsInternal = !!is_internal && ROLES_CAN_RESOLVE.includes(role);
            const isRaiser = ticket.raised_by === employeeId;

            await addHistory(ticket.id, 'comment', message.trim(), null, null, employeeId, name, wantsInternal);

            const now = new Date().toISOString();

            // If the raiser replies while the ticket is awaiting their confirmation, treat
            // that as "not resolved" — don't silently leave it sitting as resolved_pending.
            if (isRaiser && ticket.status === 'resolved_pending' && !wantsInternal) {
                await supabase.from('support_tickets').update({
                    status: 'reopened', resolved_at: null, updated_at: now,
                }).eq('id', ticket.id);
                await addHistory(ticket.id, 'status_changed', `Reopened automatically — ${name} replied after resolution`, 'resolved_pending', 'reopened', employeeId, name);
                await notificationService.sendTicketNotifications({ ...ticket, status: 'reopened' }, 'reopened', { actorEmployeeId: employeeId, actorName: name });
                notifyTicketStatusEmail({ ...ticket, status: 'reopened' }, 'reopened', name);
            } else {
                await supabase.from('support_tickets').update({ updated_at: now }).eq('id', ticket.id);
                if (!wantsInternal) {
                    await notificationService.sendTicketNotifications(
                        ticket,
                        isRaiser ? 'comment_from_employee' : 'comment_from_team',
                        { actorEmployeeId: employeeId, actorName: name }
                    );
                }
            }

            return res.json({ success: true });
        } catch (err) {
            return res.status(500).json({ success: false, message: err.message });
        }
    });

    // ── PATCH /api/tickets/:id/in-progress ────────────────────────────────
    router.patch('/:id/in-progress', authenticateToken, async (req, res) => {
        try {
            const { employeeId, role } = req.user;
            if (!ROLES_CAN_RESOLVE.includes(role))
                return res.status(403).json({ success: false, message: 'Not authorized' });

            const emp = await getEmployeeDetails(employeeId);
            const name = emp ? `${emp.first_name} ${emp.last_name}`.trim() : employeeId;

            const { data: ticket } = await supabase.from('support_tickets')
                .select('*').eq('id', req.params.id).maybeSingle();
            if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });

            const oldStatus = ticket.status;
            await supabase.from('support_tickets').update({ status: 'in_progress', updated_at: new Date().toISOString() }).eq('id', req.params.id);
            await addHistory(req.params.id, 'status_changed', `Marked as In Progress by ${name}`, oldStatus, 'in_progress', employeeId, name);
            await notificationService.sendTicketNotifications({ ...ticket, status: 'in_progress' }, 'in_progress', { actorEmployeeId: employeeId, actorName: name });
            notifyTicketStatusEmail({ ...ticket, status: 'in_progress' }, 'in_progress', name);

            return res.json({ success: true });
        } catch (err) {
            return res.status(500).json({ success: false, message: err.message });
        }
    });

    // ── PATCH /api/tickets/:id/resolve ────────────────────────────────────
    router.patch('/:id/resolve', authenticateToken, async (req, res) => {
        try {
            const { employeeId, role } = req.user;
            if (!ROLES_CAN_RESOLVE.includes(role))
                return res.status(403).json({ success: false, message: 'Not authorized' });

            const { resolve_note } = req.body;
            const emp  = await getEmployeeDetails(employeeId);
            const name = emp ? `${emp.first_name} ${emp.last_name}`.trim() : employeeId;

            const { data: ticket } = await supabase.from('support_tickets')
                .select('*').eq('id', req.params.id).maybeSingle();
            if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });

            const now = new Date().toISOString();
            await supabase.from('support_tickets').update({
                status:       'resolved_pending',
                resolve_note: resolve_note || null,
                resolved_at:  now,
                updated_at:   now,
            }).eq('id', req.params.id);

            await addHistory(req.params.id, 'resolved', resolve_note || `Resolved by ${name}. Awaiting employee confirmation.`, ticket.status, 'resolved_pending', employeeId, name);
            await notificationService.sendTicketNotifications({ ...ticket, status: 'resolved_pending' }, 'resolved', { actorEmployeeId: employeeId, actorName: name });
            notifyTicketStatusEmail({ ...ticket, status: 'resolved_pending' }, 'resolved_pending', name, resolve_note);

            return res.json({ success: true });
        } catch (err) {
            return res.status(500).json({ success: false, message: err.message });
        }
    });

    // ── PATCH /api/tickets/:id/accept ─────────────────────────────────────
    // Raiser accepts resolution → ticket closed
    router.patch('/:id/accept', authenticateToken, async (req, res) => {
        try {
            const { employeeId } = req.user;
            const { data: ticket } = await supabase.from('support_tickets')
                .select('*').eq('id', req.params.id).maybeSingle();
            if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });
            if (ticket.raised_by !== employeeId)
                return res.status(403).json({ success: false, message: 'Only the ticket raiser can accept' });
            if (ticket.status !== 'resolved_pending')
                return res.status(400).json({ success: false, message: 'Ticket is not awaiting confirmation' });

            const emp  = await getEmployeeDetails(employeeId);
            const name = emp ? `${emp.first_name} ${emp.last_name}`.trim() : employeeId;
            const now  = new Date().toISOString();

            await supabase.from('support_tickets').update({ status: 'closed', closed_at: now, updated_at: now }).eq('id', req.params.id);
            await addHistory(req.params.id, 'closed', `Issue confirmed resolved by ${name}. Ticket closed.`, 'resolved_pending', 'closed', employeeId, name);
            await notificationService.sendTicketNotifications({ ...ticket, status: 'closed' }, 'closed', { actorEmployeeId: employeeId, actorName: name });
            notifyTicketStatusEmail({ ...ticket, status: 'closed' }, 'closed', name);

            return res.json({ success: true });
        } catch (err) {
            return res.status(500).json({ success: false, message: err.message });
        }
    });

    // ── PATCH /api/tickets/:id/decline ────────────────────────────────────
    // Raiser declines resolution → ticket reopened
    router.patch('/:id/decline', authenticateToken, async (req, res) => {
        try {
            const { employeeId } = req.user;
            const { reason } = req.body;
            const { data: ticket } = await supabase.from('support_tickets')
                .select('*').eq('id', req.params.id).maybeSingle();
            if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });
            if (ticket.raised_by !== employeeId)
                return res.status(403).json({ success: false, message: 'Only the ticket raiser can decline' });
            if (ticket.status !== 'resolved_pending')
                return res.status(400).json({ success: false, message: 'Ticket is not awaiting confirmation' });

            const emp  = await getEmployeeDetails(employeeId);
            const name = emp ? `${emp.first_name} ${emp.last_name}`.trim() : employeeId;

            await supabase.from('support_tickets').update({
                status:      'reopened',
                resolved_at: null,
                updated_at:  new Date().toISOString(),
            }).eq('id', req.params.id);

            await addHistory(req.params.id, 'reopened', reason ? `Declined by ${name}: ${reason}` : `Declined by ${name} — issue not resolved. Ticket reopened.`, 'resolved_pending', 'reopened', employeeId, name);
            await notificationService.sendTicketNotifications({ ...ticket, status: 'reopened' }, 'reopened', { actorEmployeeId: employeeId, actorName: name });
            notifyTicketStatusEmail({ ...ticket, status: 'reopened' }, 'reopened', name, reason);

            return res.json({ success: true });
        } catch (err) {
            return res.status(500).json({ success: false, message: err.message });
        }
    });

    console.log('✅ Ticket routes loaded');
    return router;
};
