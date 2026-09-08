const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv'); // loaded before anything else
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');

dotenv.config();

// ─── Temporary: verify email env vars are loaded ──────────────────────────────
console.log("EMAIL_FROM =", JSON.stringify(process.env.EMAIL_FROM));
console.log("FRONTEND_URL =", JSON.stringify(process.env.FRONTEND_URL));

// ─── Startup env validation ───────────────────────────────────────────────────
const REQUIRED_ENV = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
const missingEnv = REQUIRED_ENV.filter(k => !process.env[k]);
if (missingEnv.length > 0) {
    const msg = `MISSING ENV VARS: ${missingEnv.join(', ')}`;
    console.error('❌', msg);
    throw new Error(msg);
}

const supabase = require('./config/supabase');

// ─── Routes ──────────────────────────────────────────────────────────────────
const authRoutes          = require('./routes/authRoutes');
const employeeRoutes      = require('./routes/employeeRoutes');
const leaveRoutes         = require('./routes/leaveRoutes');
const attendanceRoutes    = require('./routes/attendanceRoutes');
const salaryRoutes        = require('./routes/salaryRoutes');
const notificationRoutes  = require('./routes/notificationRoutes');
const adminUpdateRoutes   = require('./routes/adminUpdateRoutes');
const employeeUpdateRoutes = require('./routes/employeeUpdateRoutes');
const updateResponseRoutes = require('./routes/updateResponseRoutes');
const noticeRoutes        = require('./routes/noticeRoutes');
const announcementRoutes  = require('./routes/announcementRoutes');
const ratingRoutes        = require('./routes/ratingRoutes');
const performanceRoutes   = require('./routes/performanceRoutes');
const loginFeedRoutes     = require('./routes/loginFeedRoutes');
const noticeBoardRoutes   = require('./routes/noticeBoardRoutes');
const teamRoutes          = require('./routes/teamRoutes');
const deductionRoutes     = require('./routes/deductionRoutes');
const onboardingRoutes    = require('./routes/onboardingRoutes');
const offerLetterRoutes   = require('./routes/offerLetterRoutes');
const ticketRoutes        = require('./routes/ticketRoutes');
const wishesRoutes        = require('./routes/wishesRoutes');
const postsRoutes         = require('./routes/postsRoutes');
const emailRoutes         = require('./routes/emailRoutes');
const housekeeperNetworkRoutes = require('./routes/housekeeperNetworkRoutes');
const breakNotificationRoutes  = require('./routes/breakNotificationRoutes');

const attendanceController = require('./controllers/attendanceController');
const cronRoutes           = require('./routes/cronRoutes');
const housekeeperNetworkGate = require('./middleware/housekeeperNetworkGate');

const app = express();

// ─── Environment ─────────────────────────────────────────────────────────────
const isProduction = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
const PORT = process.env.PORT || 5000;

console.log('='.repeat(70));
console.log('🚀 SERVER INITIALIZING');
console.log(`   Environment : ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
console.log(`   Runtime     : ${process.env.VERCEL ? 'Vercel Function' : 'Node.js'}`);
console.log('='.repeat(70));

// ─── CORS ─────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = new Set([
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
    'https://hrms-p-test.vercel.app',
    'https://hrms-b2-bindemand-a31u.vercel.app',
    'https://hrms-p-test-1.onrender.com',
    'http://hrms.b2bindemand.agency',
    'https://hrms.b2bindemand.agency',
]);

if (process.env.ALLOWED_ORIGINS) {
    // Strip any accidental Markdown link formatting e.g. [url](url) → url
    const raw = process.env.ALLOWED_ORIGINS.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    raw.split(',').forEach(o => {
        const t = o.trim();
        if (t) ALLOWED_ORIGINS.add(t);
    });
}

console.log('🔧 CORS allowed origins:');
ALLOWED_ORIGINS.forEach(o => console.log(`   - ${o}`));

const corsOptions = {
    origin(origin, callback) {
        // Requests with no origin (server-to-server, curl, mobile) — always allow
        if (!origin) return callback(null, true);

        // localhost / 127.0.0.1 any port
        if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
            return callback(null, true);
        }
        // Private LAN ranges
        if (/^https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(origin)) {
            return callback(null, true);
        }
        // Any *.vercel.app preview deployment
        if (/^https:\/\/[a-zA-Z0-9-]+\.vercel\.app$/.test(origin)) {
            return callback(null, true);
        }
        if (ALLOWED_ORIGINS.has(origin)) return callback(null, true);

        console.warn(`⛔ CORS blocked: ${origin}`);
        // Pass an error string so browser sees a clear rejection (not silence)
        return callback(new Error(`CORS: origin '${origin}' not allowed`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
        'Content-Type', 'Authorization', 'X-Requested-With',
        'Accept', 'Origin', 'employee-id', 'X-Employee-Id',
    ],
    exposedHeaders: ['Content-Length', 'X-Request-Id'],
    maxAge: 86400,
    optionsSuccessStatus: 204,
};

// Handle OPTIONS preflight FIRST — before any other middleware or auth
app.use((req, res, next) => {
  if (req.method === "OPTIONS") {
    return cors(corsOptions)(req, res, next);
  }
  next();
});
app.use(cors(corsOptions));

// ─── Body parsers ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ─── Request logger ───────────────────────────────────────────────────────────
app.use((req, _res, next) => {
    console.log(`📍 ${req.method} ${req.path} — origin: ${req.headers.origin || 'none'}`);
    next();
});

// ─── Multer (memory storage — no local disk in serverless) ───────────────────
// Individual routes upload buffers to Supabase Storage via lib/supabaseStorage.js
const uploadDocuments = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter(_req, file, cb) {
        const ok = /jpeg|jpg|png|pdf|doc|docx/.test(
            require('path').extname(file.originalname).toLowerCase()
        );
        cb(ok ? null : new Error('Only images and documents are allowed'), ok);
    },
});

app.locals.uploadDocuments = uploadDocuments;

// ─── Auth middleware ──────────────────────────────────────────────────────────
// TEMPORARY diagnostic logging for the "many endpoints 401 at once" investigation — traces
// why a request was rejected without ever logging the token/credential itself. Safe to remove
// once the 401 flood is confirmed fixed in production.
const AUTH_DEBUG = process.env.NODE_ENV !== 'production' || process.env.AUTH_DEBUG === 'true';
const authLog = (...args) => { if (AUTH_DEBUG) console.log('[auth]', ...args); };

const authenticateToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) {
        authLog(req.method, req.originalUrl, '-> 401 NO_TOKEN (Authorization header missing or malformed)');
        return res.status(401).json({ success: false, message: 'Access token required', code: 'NO_TOKEN' });
    }
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            if (err.name === 'TokenExpiredError') {
                authLog(req.method, req.originalUrl, `-> 401 TOKEN_EXPIRED (expired at ${err.expiredAt})`);
                return res.status(401).json({ success: false, message: 'Token expired', code: 'TOKEN_EXPIRED' });
            }
            authLog(req.method, req.originalUrl, `-> 401 INVALID_TOKEN (${err.name}: ${err.message})`);
            return res.status(401).json({ success: false, message: 'Invalid token', code: 'INVALID_TOKEN' });
        }
        authLog(req.method, req.originalUrl, `-> OK (employeeId=${user.employeeId}, role=${user.role})`);
        req.user       = user;
        req.userId     = user.id;
        req.userRole   = user.role;
        req.employeeId = user.employeeId;
        next();
    });
};

const requireAdmin = (req, res, next) => {
    if (!['admin', 'sub_admin', 'hr'].includes(req.user?.role)) {
        return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    next();
};

// ─── Public routes ────────────────────────────────────────────────────────────
console.log('Auth routes mounted at /api/auth');
app.use('/api/auth',        authRoutes);
app.use('/api/public',      loginFeedRoutes);
// Cron endpoints — no JWT, auth via CRON_SECRET (called by Vercel scheduler)
app.use('/api/cron',        cronRoutes);
// Onboarding — mixed auth (public token routes + protected admin routes both in same file)
app.use('/api/onboarding',  onboardingRoutes);
app.use('/api/offer-letters', offerLetterRoutes);
// Self-contained auth (verifyToken + strict admin-only check) — see breakNotificationRoutes.js
app.use('/api/break-notifications', breakNotificationRoutes);

// ─── Protected routes ─────────────────────────────────────────────────────────
app.use('/api/employees',        authenticateToken, employeeRoutes);
app.use('/api/leaves',           authenticateToken, leaveRoutes);
app.use('/api/attendance',       authenticateToken, housekeeperNetworkGate, attendanceRoutes(supabase, authenticateToken, requireAdmin));
app.use('/api/salary',           authenticateToken, salaryRoutes);
app.use('/api/notifications',    authenticateToken, notificationRoutes);
app.use('/api/admin-updates',    authenticateToken, adminUpdateRoutes);
app.use('/api/employee-updates', authenticateToken, employeeUpdateRoutes);
app.use('/api/update-responses', authenticateToken, updateResponseRoutes);
app.use('/api/notices',          authenticateToken, noticeRoutes);
app.use('/api/notice-board',     authenticateToken, noticeBoardRoutes);
app.use('/api/announcements',    authenticateToken, announcementRoutes);
app.use('/api/ratings',          ratingRoutes(authenticateToken, requireAdmin));
app.use('/api/performance',      performanceRoutes(authenticateToken));
app.use('/api/teams',            authenticateToken, teamRoutes);
app.use('/api/deductions',       authenticateToken, deductionRoutes);
app.use('/api/tickets',          authenticateToken, ticketRoutes(supabase, authenticateToken));
app.use('/api/wishes',           authenticateToken, wishesRoutes(supabase, authenticateToken));
app.use('/api/posts',            authenticateToken, postsRoutes(supabase, authenticateToken));
app.use('/api/email',            authenticateToken, emailRoutes);
app.use('/api/admin/housekeeper-network', authenticateToken, housekeeperNetworkRoutes);

// ─── Utility endpoints ────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({
    ok: true,
    timestamp: new Date().toISOString(),
    runtime: process.env.VERCEL ? 'vercel-service' : 'node',
}));

app.get('/', (_req, res) => res.json({
    name: 'HRMS API',
    version: '2.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
}));

app.get('/api/health', (_req, res) => res.json({
    success: true,
    message: 'Server is healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    runtime: process.env.VERCEL ? 'vercel-service' : 'node',
}));

// ─── 404 handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
    res.status(404).json({ success: false, message: `${req.method} ${req.path} not found` });
});

// ─── Global error handler ─────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    console.error(`❌ [GLOBAL ERROR] ${req.method} ${req.path}`);
    console.error(`   name   : ${err.name}`);
    console.error(`   message: ${err.message}`);
    console.error(`   stack  :\n${err.stack}`);

    if (res.headersSent) return;

    if (err instanceof multer.MulterError) {
        return res.status(400).json({ success: false, message: 'File upload error', error: err.message });
    }
    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({ success: false, message: 'Invalid token', code: 'INVALID_TOKEN' });
    }
    if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ success: false, message: 'Token expired', code: 'TOKEN_EXPIRED' });
    }

    res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: isProduction ? undefined : err.message,
    });
});

// Start the HTTP server only when this file is run directly (`node server.js`), i.e. local
// dev or a traditional Node host. On Vercel, api/index.js requires this file as a module to
// get the Express `app` export — Vercel's Node runtime invokes that handler directly per
// request and never needs (or wants) a bound listening port, so `require.main === module`
// correctly evaluates to false in that case and this whole block is skipped.
if (require.main === module) {
    app.listen(PORT, '0.0.0.0', () => {
        console.log('='.repeat(70));
        console.log('Backend service started');
        console.log('='.repeat(70));
        console.log('🚀 SERVER STARTED');
        console.log(`   Port        : ${PORT}`);
        console.log(`   Environment : ${process.env.NODE_ENV || 'development'}`);
        console.log(`   Runtime     : local Node.js`);
        console.log('='.repeat(70));

        supabase.from('employees').select('count', { count: 'exact', head: true }).then(({ error }) => {
            if (error) console.error(`❌ Supabase connection FAILED: ${error.message}`);
            else console.log('✅ Supabase connected');
        });

        // ── Missing clock-out cron (every 15 min) ──────────────────────────
        if (!process.env.VERCEL) {
            const { scheduleMissingClockOutCheck, markMissingClockOuts } = require('./cron/missingClockOutCheck');
            scheduleMissingClockOutCheck();
            // Run immediately on startup to catch records missed while server was down
            markMissingClockOuts().then(r => {
                if (r.markedCount > 0) console.log(`✅ Startup missing-clockout fix: ${r.markedCount} record(s) marked`);
            }).catch(e => console.error('❌ Startup missing-clockout error:', e.message));
        }

        // ── Break overtime notification cron (every 1 min) ─────────────────
        // Only meaningful on a long-running Node process — node-cron can't stay
        // resident on Vercel's serverless functions, so this doesn't run there.
        // See routes/cronRoutes.js's /break-monitor for the serverless equivalent,
        // though Vercel Hobby's daily-only cron granularity (see vercel.json) can't
        // give it the same near-real-time behavior; a minute-level external
        // scheduler hitting that endpoint is the production-on-Vercel option.
        if (!process.env.VERCEL) {
            const { scheduleBreakOvertimeCheck } = require('./cron/breakOvertimeCheck');
            scheduleBreakOvertimeCheck();
        }

        // Orphaned-record repair only runs locally — avoid on every Vercel cold start
        if (!process.env.VERCEL) {
            setTimeout(async () => {
                try {
                    const fix = await attendanceController.fixOrphanedAttendance(null, null);
                    console.log(`✅ Orphan fix: ${fix.fixed} fixed, ${fix.skipped} skipped`);

                    const { data: staleSessions } = await supabase
                        .from('attendance_sessions')
                        .select('session_id, employee_id')
                        .eq('is_active', true);

                    let staleFixed = 0;
                    for (const s of (staleSessions || [])) {
                        const { data: clocked } = await supabase
                            .from('attendance')
                            .select('id, clock_out')
                            .eq('employee_id', s.employee_id)
                            .eq('session_id', s.session_id)
                            .not('clock_out', 'is', null)
                            .maybeSingle();

                        if (clocked) {
                            await supabase.from('attendance_sessions')
                                .update({ is_active: false, clock_out_time: clocked.clock_out })
                                .eq('session_id', s.session_id)
                                .eq('employee_id', s.employee_id);
                            staleFixed++;
                            continue;
                        }

                        const { data: any } = await supabase
                            .from('attendance')
                            .select('id')
                            .eq('employee_id', s.employee_id)
                            .eq('session_id', s.session_id)
                            .maybeSingle();

                        if (!any) {
                            await supabase.from('attendance_sessions')
                                .update({ is_active: false, clock_out_time: new Date().toISOString() })
                                .eq('session_id', s.session_id)
                                .eq('employee_id', s.employee_id);
                            staleFixed++;
                        }
                    }
                    console.log(`✅ Stale session fix: ${staleFixed} fixed`);
                } catch (err) {
                    console.error('❌ Startup fix error:', err.message);
                }
            }, 3000);
        }
    });

    process.on('SIGTERM', () => { console.log('\n🛑 Shutting down...'); process.exit(0); });
    process.on('SIGINT',  () => { console.log('\n🛑 Shutting down...'); process.exit(0); });
}

process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught exception:', err.stack);
    if (isProduction && !process.env.VERCEL) process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    console.error('❌ Unhandled rejection:', reason);
    if (isProduction && !process.env.VERCEL) process.exit(1);
});

// ─── Export for Vercel serverless (api/index.js imports this) ────────────────
module.exports = app;
