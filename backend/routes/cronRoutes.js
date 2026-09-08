/**
 * Cron routes — called by Vercel Cron scheduler via the normal Express
 * catch-all (api/index.js).  They are NOT protected by authenticateToken
 * because Vercel's scheduler has no user JWT; instead they require the
 * shared CRON_SECRET environment variable.
 *
 * Vercel Cron sends:  Authorization: Bearer {CRON_SECRET}
 * Set CRON_SECRET in Vercel → Settings → Environment Variables.
 */

const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const attendanceController = require('../controllers/attendanceController');
const { markAbsentEmployeesAsLeave } = require('../cron/absentEmployeeCheck');
const { runMonthlyAccrual } = require('../cron/leaveAccrualJob');
const { markMissingClockOuts } = require('../cron/missingClockOutCheck');
const { checkBreakOvertimeAndNotify } = require('../cron/breakOvertimeCheck');

const cronAuth = (req, res, next) => {
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers['authorization'] !== `Bearer ${secret}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};

// GET /api/cron/auto-close — every hour (Pro plan only)
router.get('/auto-close', cronAuth, async (req, res) => {
    const t = Date.now();
    try {
        const result = await attendanceController.autoCloseStaleSessions();
        res.json({ success: true, closedCount: result.closedCount ?? 0, ms: Date.now() - t });
    } catch (err) {
        console.error('❌ [CRON auto-close]', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/cron/missing-clockout — every 15 min (external trigger)
router.get('/missing-clockout', cronAuth, async (req, res) => {
    const t = Date.now();
    try {
        const result = await markMissingClockOuts();
        res.json({ success: true, markedCount: result.markedCount ?? 0, ms: Date.now() - t });
    } catch (err) {
        console.error('❌ [CRON missing-clockout]', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/cron/break-monitor — every minute, ideally (external trigger).
// Vercel Hobby's cron config only supports daily schedules (see vercel.json), so this
// isn't wired into the `crons` array there — on Vercel, near-real-time break-overtime
// alerts need an external scheduler (cron-job.org, GitHub Actions, etc.) hitting this
// endpoint every minute with the CRON_SECRET bearer token. Off Vercel, the local
// node-cron in cron/breakOvertimeCheck.js already does this every minute on its own.
router.get('/break-monitor', cronAuth, async (req, res) => {
    const t = Date.now();
    try {
        const result = await checkBreakOvertimeAndNotify();
        res.json({ success: true, ...result, ms: Date.now() - t });
    } catch (err) {
        console.error('❌ [CRON break-monitor]', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/cron/daily-absent — 23:59 IST (18:29 UTC)
router.get('/daily-absent', cronAuth, async (req, res) => {
    const t = Date.now();
    try {
        const result = await markAbsentEmployeesAsLeave();
        res.json({ success: true, result, ms: Date.now() - t });
    } catch (err) {
        console.error('❌ [CRON daily-absent]', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/cron/weekly-cleanup — Sunday 02:00 IST (20:30 UTC Sat)
router.get('/weekly-cleanup', cronAuth, async (req, res) => {
    const t = Date.now();
    try {
        const thirtyAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const ninetyAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
        const fortyFiveAgo = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();

        await Promise.all([
            supabase.from('attendance_sessions').delete().eq('is_active', false).lt('clock_out_time', thirtyAgo),
            supabase.from('regularization_requests').delete().in('status', ['approved', 'rejected']).lt('created_at', ninetyAgo),
            // Social feed posts + birthday/anniversary wishes older than 45 days — comments
            // cascade-delete automatically via their FK's ON DELETE CASCADE.
            supabase.from('dashboard_posts').delete().lt('created_at', fortyFiveAgo),
            supabase.from('birthday_wishes').delete().lt('created_at', fortyFiveAgo),
        ]);

        res.json({ success: true, ms: Date.now() - t });
    } catch (err) {
        console.error('❌ [CRON weekly-cleanup]', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/cron/monthly-accrual — 1st of month 01:00 IST (19:30 UTC)
router.get('/monthly-accrual', cronAuth, async (req, res) => {
    const t = Date.now();
    try {
        await runMonthlyAccrual();
        res.json({ success: true, ms: Date.now() - t });
    } catch (err) {
        console.error('❌ [CRON monthly-accrual]', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
