// backend/routes/breakNotificationRoutes.js
// Backs the Admin-only "Notify Emails" sidebar feature: which employees are
// monitored for break overtime, and which email addresses get notified. The
// actual monitoring/sending happens in backend/cron/breakOvertimeCheck.js —
// this file only reads/writes the config.
const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { verifyToken } = require('../middleware/auth');

const SETTINGS_ID = 1;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Explicitly stricter than the app's usual isAdmin (which also allows sub_admin/hr) —
// this feature was specifically scoped to the Admin role only, both for who can see
// the sidebar button and who the backend accepts requests from.
const requireStrictAdmin = (req, res, next) => {
    if (req.user?.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    next();
};

router.use(verifyToken, requireStrictAdmin);

// ── GET /api/break-notifications/settings ──────────────────────────────────────
router.get('/settings', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('break_notification_settings')
            .select('*')
            .eq('id', SETTINGS_ID)
            .maybeSingle();
        if (error) throw error;

        res.json({
            success: true,
            settings: {
                monitored_employee_ids: data?.monitored_employee_ids || [],
                notify_emails: data?.notify_emails || [],
                updated_at: data?.updated_at || null,
            },
        });
    } catch (err) {
        console.error('[break-notifications] get settings:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── PATCH /api/break-notifications/settings ─────────────────────────────────────
router.patch('/settings', async (req, res) => {
    try {
        const monitoredIds = Array.isArray(req.body.monitored_employee_ids) ? req.body.monitored_employee_ids : [];
        const emailsRaw    = Array.isArray(req.body.notify_emails) ? req.body.notify_emails : [];

        const emails = [...new Set(emailsRaw.map(e => (e || '').trim().toLowerCase()).filter(Boolean))];
        const invalid = emails.filter(e => !EMAIL_REGEX.test(e));
        if (invalid.length > 0) {
            return res.status(400).json({ success: false, message: `Invalid email address: ${invalid[0]}` });
        }

        const monitored_employee_ids = [...new Set(monitoredIds.filter(Boolean))];

        const { data, error } = await supabase
            .from('break_notification_settings')
            .upsert({
                id: SETTINGS_ID,
                monitored_employee_ids,
                notify_emails: emails,
                updated_by: req.user.employeeId,
                updated_at: new Date().toISOString(),
            })
            .select()
            .single();
        if (error) throw error;

        res.json({
            success: true,
            message: 'Notification settings saved',
            settings: {
                monitored_employee_ids: data.monitored_employee_ids || [],
                notify_emails: data.notify_emails || [],
                updated_at: data.updated_at,
            },
        });
    } catch (err) {
        console.error('[break-notifications] save settings:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
