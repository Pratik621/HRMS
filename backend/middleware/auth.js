const jwt = require('jsonwebtoken');

// TEMPORARY diagnostic logging for the "many endpoints 401 at once" investigation — traces
// why a request was rejected without ever logging the token/credential itself. Safe to remove
// once the 401 flood is confirmed fixed in production.
const AUTH_DEBUG = process.env.NODE_ENV !== 'production' || process.env.AUTH_DEBUG === 'true';
const authLog = (...args) => { if (AUTH_DEBUG) console.log('[auth]', ...args); };

const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        authLog(req.method, req.originalUrl, '-> 401 NO_TOKEN (Authorization header missing or malformed)');
        return res.status(401).json({ success: false, message: 'Access token required', code: 'NO_TOKEN' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            if (err.name === 'TokenExpiredError') {
                authLog(req.method, req.originalUrl, `-> 401 TOKEN_EXPIRED (expired at ${err.expiredAt})`);
                return res.status(401).json({ success: false, message: 'Token expired', code: 'TOKEN_EXPIRED' });
            }
            authLog(req.method, req.originalUrl, `-> 401 INVALID_TOKEN (${err.name}: ${err.message})`);
            return res.status(401).json({ success: false, message: 'Invalid token', code: 'INVALID_TOKEN' });
        }

        authLog(req.method, req.originalUrl, `-> OK (employeeId=${decoded.employeeId}, role=${decoded.role})`);
        req.user = {
            id: decoded.id,
            employeeId: decoded.employeeId,
            role: decoded.role,
            email: decoded.email
        };
        next();
    });
};

const isAdmin = (req, res, next) => {
    if (!['admin', 'sub_admin', 'hr'].includes(req.user?.role)) {
        return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    next();
};

const isAdminOrManager = (req, res, next) => {
    if (!['admin', 'sub_admin', 'manager', 'hr', 'team_leader'].includes(req.user?.role)) {
        return res.status(403).json({ success: false, message: 'Manager or Admin access required' });
    }
    next();
};

const isAdminOrDesktopSupport = (req, res, next) => {
    if (!['admin', 'sub_admin', 'desktop_support', 'hr'].includes(req.user?.role)) {
        return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    next();
};

const isAdminOrFinance = (req, res, next) => {
    if (!['admin', 'sub_admin', 'finance', 'hr'].includes(req.user?.role)) {
        return res.status(403).json({ success: false, message: 'Admin or Finance access required' });
    }
    next();
};

const isAdminOrFinanceOrDesktopSupport = (req, res, next) => {
    if (!['admin', 'sub_admin', 'finance', 'desktop_support', 'hr'].includes(req.user?.role)) {
        return res.status(403).json({ success: false, message: 'Admin, Finance, or IT access required' });
    }
    next();
};

const isOwnDataOrAdmin = (req, res, next) => {
    const userRole = req.user?.role;
    const userEmployeeId = req.user?.employeeId;
    const requestedEmployeeId = req.params.employee_id || req.body.employee_id || req.query.employee_id;

    if (userRole === 'admin' || userRole === 'sub_admin' || userRole === 'hr') return next();
    if (userEmployeeId === requestedEmployeeId) return next();

    if (!requestedEmployeeId) {
        if (req.method === 'POST' && !req.body.employee_id) {
            req.body.employee_id = userEmployeeId;
        }
        return next();
    }

    return res.status(403).json({ success: false, message: 'Access denied: You can only access your own data' });
};

module.exports = { verifyToken, isAdmin, isAdminOrManager, isAdminOrDesktopSupport, isAdminOrFinance, isAdminOrFinanceOrDesktopSupport, isOwnDataOrAdmin };
