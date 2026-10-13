const express = require('express');
const { verifyToken } = require('../middleware/auth');
const controller = require('../controllers/employmentLetterController');
const router = express.Router();
router.use(verifyToken, (req, res, next) => ['admin', 'hr'].includes(req.user?.role) ? next() : res.status(403).json({ success: false, message: 'Only HR and admin can issue employment letters.' }));
router.get('/employee/:employeeId/data', controller.defaults);
router.post('/employee/:employeeId/preview', controller.preview);
router.post('/employee/:employeeId/send', controller.send);
module.exports = router;
