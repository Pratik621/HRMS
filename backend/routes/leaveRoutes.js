// routes/leaveRoutes.js - FIXED VERSION
const express = require('express');
const router = express.Router();
const leaveController = require('../controllers/leaveController');
const { isAdmin, isOwnDataOrAdmin } = require('../middleware/auth');

// Debug: Check what functions are available
console.log('🔍 Available leaveController methods:', Object.keys(leaveController));

// Get leave types
router.get('/types', leaveController.getLeaveTypes);

// Get leave balance for employee
router.get('/balance/:employee_id', leaveController.getLeaveBalance);

// Bulk leave balance for every active employee, in one request — see leaveController.js
// for why this exists (was previously a per-employee loop in AttendanceReports.jsx's export).
router.get('/balance-bulk', leaveController.getLeaveBalanceBulk);

// Who's on leave today (dashboard widget)
router.get('/on-leave-today', leaveController.getOnLeaveToday);

// Leave usage by type this year (dashboard widget)
router.get('/usage-by-type/:employee_id', leaveController.getLeaveUsageByType);

// Get all leaves (admin gets all, employee gets their own)
router.get('/', leaveController.getLeaves);

// Apply for leave
router.post('/apply', (req, res, next) => {
    if (req.body.employee_id !== req.user.employeeId) {
        return res.status(403).json({ success: false, message: 'Employees must submit their own leave requests. HR/admin can approve them.' });
    }
    next();
}, leaveController.applyLeave);

// Update leave status (admin only)
router.put('/:id/status', leaveController.updateLeaveStatus);

// Manual accrual (for testing)
router.post('/manual-accrual/:employee_id', leaveController.manualAccrual);

// Yearly reset (admin only)
router.post('/yearly-reset', leaveController.yearlyReset);

// HR/Admin manual leave-balance adjustment — add or reduce Comp-Off / pooled paid-leave
// balance any time, no approval workflow. Admin-gated (isAdmin covers admin/sub_admin/hr).
router.post('/adjust-balance', isAdmin, leaveController.adjustLeaveBalance);

// Adjustment audit history — employee can see their own, admin/hr can see anyone's.
router.get('/adjustments/:employee_id', isOwnDataOrAdmin, leaveController.getLeaveAdjustmentHistory);

console.log('✅ Leave routes loaded');

module.exports = router;