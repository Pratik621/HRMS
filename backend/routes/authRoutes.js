const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const supabase = require('../config/supabase');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { sendPasswordResetOtpEmail } = require('../services/emailService');
require('dotenv').config();

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many login attempts. Please try again in 15 minutes.' },
});

const passwordLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many password change attempts. Please try again in 1 hour.' },
});

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || (JWT_SECRET ? JWT_SECRET + '_refresh' : undefined);

if (!JWT_SECRET) {
    console.error('🚨 FATAL: JWT_SECRET environment variable is not set. Auth routes will not work.');
}
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';

function generateTokens(payload) {
    const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
    const refreshToken = jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });
    return { accessToken, refreshToken };
}

// Login
router.post('/login', loginLimiter, async (req, res) => {
    const startTime = Date.now();
    try {
        const { email, identifier, password } = req.body;
        const loginId = (identifier || email || '').trim();

        console.log(`🔐 [LOGIN] attempt — id="${loginId}" origin="${req.headers.origin || 'none'}" ip="${req.ip}"`);

        if (!loginId || !password) {
            console.log('❌ [LOGIN] rejected — missing credentials');
            return res.status(400).json({ success: false, message: 'Employee ID / Email and password are required' });
        }

        // Detect whether the input is an email address or an employee ID
        const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginId);
        console.log(`🔍 [LOGIN] lookup by ${isEmail ? 'email' : 'employee_id'}`);

        // Find employee by email or employee_id
        let user = null;

        if (isEmail) {
            const { data, error } = await supabase.from('employees').select('*').eq('email', loginId.toLowerCase()).maybeSingle();
            if (error) {
                console.error('❌ [LOGIN] Supabase error (email lookup):', error.message);
                throw error;
            }
            user = data;
        } else {
            const { data, error } = await supabase.from('employees').select('*').eq('employee_id', loginId).maybeSingle();
            if (error) {
                console.error('❌ [LOGIN] Supabase error (employee_id lookup):', error.message);
                throw error;
            }
            user = data;
        }

        // Legacy emp_XXX@ems.com format fallback
        if (!user && loginId.startsWith('emp_') && loginId.endsWith('@ems.com')) {
            const employeeId = loginId.replace('emp_', '').replace('@ems.com', '');
            const { data } = await supabase.from('employees').select('*').eq('employee_id', employeeId).maybeSingle();
            user = data;
        }

        if (!user) {
            console.log(`❌ [LOGIN] user not found — "${loginId}"`);
            return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }

        console.log(`✅ [LOGIN] user found — id=${user.id} employeeId=${user.employee_id} role=${user.role} active=${user.is_active} hasPassword=${!!user.password}`);

        // Verify password
        let isValidPassword = false;

        if (!user.password) {
            // No password in DB — allow Welcome@123 as default
            isValidPassword = (password === 'Welcome@123');
            console.log(`🔑 [LOGIN] password check (no hash in DB, default fallback): ${isValidPassword ? 'pass' : 'fail'}`);
        } else {
            isValidPassword = await bcrypt.compare(password, user.password);
            console.log(`🔑 [LOGIN] bcrypt compare: ${isValidPassword ? 'pass' : 'fail'}`);
        }

        if (!isValidPassword) {
            console.log(`❌ [LOGIN] wrong password — employeeId=${user.employee_id}`);
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Check if employee is active
        if (user.is_active === false) {
            console.log(`❌ [LOGIN] account deactivated — employeeId=${user.employee_id}`);
            return res.status(403).json({ success: false, message: 'Your account is deactivated. Please contact admin.' });
        }

        // Housekeeper IP allowlist is intentionally NOT enforced at login — a Housekeeper can
        // log in from anywhere; only the attendance surface (clock in/out) is network-gated,
        // via the housekeeperNetworkGate middleware mounted on /api/attendance in server.js.
        // This keeps login working everywhere while the dashboard hides the Clock In/Out
        // button and shows a message when the device isn't on an approved network.

        const payload = { id: user.id, email: user.email, role: user.role || 'employee', employeeId: user.employee_id };
        const { accessToken, refreshToken } = generateTokens(payload);

        // Best-effort — powers the Admin "Inactive Logins" report (employees.last_login_at).
        // Never block/fail the login itself over this (e.g. column not migrated yet).
        supabase.from('employees').update({ last_login_at: new Date().toISOString() }).eq('id', user.id)
            .then(({ error }) => { if (error) console.error('⚠️ [LOGIN] failed to record last_login_at:', error.message); });

        console.log(`✅ [LOGIN] success — employeeId=${user.employee_id} role=${user.role} ${Date.now() - startTime}ms`);

        return res.json({
            success: true,
            token: accessToken,
            refreshToken,
            user: {
                id: user.id,
                email: user.email,
                role: user.role || 'employee',
                employeeId: user.employee_id,
                firstName: user.first_name,
                lastName: user.last_name,
                department: user.department,
                designation: user.designation,
                profile_image: user.profile_image,
                profile_completed: user.profile_completed ?? true
            }
        });

    } catch (error) {
        console.error(`❌ [LOGIN] unhandled error after ${Date.now() - startTime}ms:`, error.message);
        res.status(500).json({ success: false, message: 'Server error during login', error: process.env.NODE_ENV === 'development' ? error.message : undefined });
    }
});

// Refresh token
router.post('/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) {
            return res.status(401).json({ success: false, message: 'Refresh token required' });
        }

        let decoded;
        try {
            decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
        } catch {
            return res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
        }

        // Get fresh user data
        let user = null;
        let data, error;
        try {
            const result = await supabase
                .from('employees')
                .select('id, email, role, employee_id, first_name, last_name, department, designation, profile_image, is_active, profile_completed')
                .eq('id', decoded.id)
                .maybeSingle();
            data = result.data;
            error = result.error;
        } catch (supabaseThrow) {
            console.error('❌ [REFRESH] Supabase threw unexpectedly:', supabaseThrow.message);
            return res.status(503).json({ success: false, message: 'Database unavailable' });
        }
        if (error || !data) return res.status(401).json({ success: false, message: 'User not found' });
        if (data.is_active === false) return res.status(403).json({ success: false, message: 'Account deactivated' });

        user = data;
        const payload = { id: user.id, email: user.email, role: user.role || 'employee', employeeId: user.employee_id };
        const { accessToken, refreshToken: newRefreshToken } = generateTokens(payload);

        // A silent token refresh means the employee still has the app open and active —
        // same activity signal as a fresh /login, so it should count the same way for the
        // Admin "Inactive Logins" report. Without this, anyone whose access token just keeps
        // renewing in the background would look stale forever after their one real login.
        supabase.from('employees').update({ last_login_at: new Date().toISOString() }).eq('id', user.id)
            .then(({ error }) => { if (error) console.error('⚠️ [REFRESH] failed to record last_login_at:', error.message); });

        return res.json({
            success: true,
            token: accessToken,
            refreshToken: newRefreshToken,
            user: {
                id: user.id,
                email: user.email,
                role: user.role || 'employee',
                employeeId: user.employee_id,
                firstName: user.first_name,
                lastName: user.last_name,
                department: user.department,
                designation: user.designation,
                profile_image: user.profile_image,
                profile_completed: user.profile_completed ?? true
            }
        });

    } catch (error) {
        console.error('❌ [REFRESH] Unhandled error — name:', error.name, '| message:', error.message);
        console.error('❌ [REFRESH] Stack:', error.stack);
        if (res.headersSent) return;
        return res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Verify token & return fresh user data
router.post('/verify', async (req, res) => {
    try {
        if (!JWT_SECRET) {
            console.error('❌ [VERIFY] JWT_SECRET is not set — cannot verify token');
            return res.status(500).json({ success: false, message: 'Server configuration error', code: 'MISSING_SECRET' });
        }

        const token = req.headers['authorization']?.split(' ')[1];
        if (!token) return res.status(401).json({ success: false, message: 'No token provided', code: 'NO_TOKEN' });

        let decoded;
        try {
            decoded = jwt.verify(token, JWT_SECRET);
        } catch (err) {
            if (err.name === 'TokenExpiredError') return res.status(401).json({ success: false, message: 'Token expired', code: 'TOKEN_EXPIRED' });
            return res.status(401).json({ success: false, message: 'Invalid token', code: 'INVALID_TOKEN' });
        }

        if (!decoded.id) {
            console.error('❌ [VERIFY] Token payload missing id field:', JSON.stringify(decoded));
            return res.status(401).json({ success: false, message: 'Invalid token payload', code: 'INVALID_TOKEN' });
        }

        let user, dbError;
        try {
            const result = await supabase
                .from('employees')
                .select('id, email, role, employee_id, first_name, last_name, department, designation, profile_image, is_active, profile_completed')
                .eq('id', decoded.id)
                .maybeSingle();
            user = result.data;
            dbError = result.error;
        } catch (supabaseThrow) {
            console.error('❌ [VERIFY] Supabase threw unexpectedly:', supabaseThrow.message, supabaseThrow.stack);
            return res.status(503).json({ success: false, message: 'Database unavailable', code: 'DB_ERROR' });
        }

        if (dbError) {
            console.error('❌ [VERIFY] Supabase query error:', dbError.message, 'code:', dbError.code);
            return res.status(401).json({ success: false, message: 'User not found', code: 'USER_NOT_FOUND' });
        }
        if (!user) return res.status(401).json({ success: false, message: 'User not found', code: 'USER_NOT_FOUND' });
        if (user.is_active === false) return res.status(403).json({ success: false, message: 'Account deactivated' });

        return res.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                role: user.role || decoded.role || 'employee',
                employeeId: user.employee_id,
                firstName: user.first_name,
                lastName: user.last_name,
                department: user.department,
                designation: user.designation,
                profile_image: user.profile_image,
                profile_completed: user.profile_completed ?? true
            }
        });

    } catch (error) {
        console.error('❌ [VERIFY] Unhandled error — name:', error.name, '| message:', error.message);
        console.error('❌ [VERIFY] Stack:', error.stack);
        if (res.headersSent) {
            console.error('❌ [VERIFY] Headers already sent — cannot send 500 response');
            return;
        }
        return res.status(500).json({ success: false, message: 'Server error', code: 'INTERNAL_ERROR' });
    }
});

// Register
router.post('/register', async (req, res) => {
    try {
        const { employee_id, email, password, first_name, last_name, department, designation } = req.body;

        if (!employee_id || !email || !first_name || !last_name) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        const { data: existing } = await supabase.from('employees').select('id').or(`email.eq.${email},employee_id.eq.${employee_id}`);
        if (existing && existing.length > 0) {
            return res.status(400).json({ success: false, message: 'User with this email or employee ID already exists' });
        }

        if (!password) return res.status(400).json({ success: false, message: 'Password is required' });
        if (password.length < 6) return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
        const hashedPassword = await bcrypt.hash(password, 10);

        const { data: newUser, error } = await supabase.from('employees').insert([{
            employee_id, email, first_name, last_name,
            department: department || null,
            designation: designation || null,
            password: hashedPassword,
            role: 'employee',
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        }]).select();

        if (error) throw error;

        res.status(201).json({ success: true, message: 'Employee registered successfully', user: { id: newUser[0].id, employeeId: newUser[0].employee_id, email: newUser[0].email } });

    } catch (error) {
        console.error('❌ Registration error:', error);
        res.status(500).json({ success: false, message: 'Server error during registration', error: error.message });
    }
});

// Logout
router.post('/logout', (req, res) => {
    res.json({ success: true, message: 'Logged out successfully' });
});

// Change password
router.post('/change-password', passwordLimiter, async (req, res) => {
    try {
        const token = req.headers['authorization']?.split(' ')[1];
        const { currentPassword, newPassword } = req.body;

        if (!token) return res.status(401).json({ success: false, message: 'No token provided' });
        if (!currentPassword || !newPassword) return res.status(400).json({ success: false, message: 'Both passwords are required' });
        if (newPassword.length < 6) return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });

        const decoded = jwt.verify(token, JWT_SECRET);
        const { data: user, error } = await supabase.from('employees').select('*').eq('id', decoded.id).maybeSingle();
        if (error || !user) return res.status(404).json({ success: false, message: 'User not found' });

        let isValid = false;
        if (user.password) {
            isValid = await bcrypt.compare(currentPassword, user.password);
        } else {
            // Employee has no hash yet — Welcome@123 is their temporary default credential
            isValid = (currentPassword === 'Welcome@123');
        }

        if (!isValid) return res.status(401).json({ success: false, message: 'Current password is incorrect' });

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        const { error: updateError } = await supabase.from('employees').update({ password: hashedPassword, updated_at: new Date().toISOString() }).eq('id', decoded.id);
        if (updateError) throw updateError;

        // If this account was auto-created from an onboarding offer link, clear the
        // plaintext temp password HR/Admin could see in Offer Links — it's no longer
        // valid once the employee sets their own password. Never fails the response.
        if (user.employee_id) {
            supabase.from('employee_offer_links')
                .update({ temp_password: null })
                .eq('created_employee_id', user.employee_id)
                .then(() => {})
                .catch(() => {});
        }

        res.json({ success: true, message: 'Password changed successfully' });

    } catch (error) {
        if (error.name === 'TokenExpiredError') return res.status(401).json({ success: false, message: 'Token expired' });
        if (error.name === 'JsonWebTokenError') return res.status(401).json({ success: false, message: 'Invalid token' });
        console.error('❌ Change password error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Self-service password reset — email + 4-digit OTP (replaces the old DOB/phone
// identity-verification flow entirely; that flow and its /verify-reset-identity route
// no longer exist). One row per employee in password_reset_otps — a new request
// overwrites (invalidates) any previous OTP, and a successful verify deletes the row.
const OTP_EXPIRY_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_SECONDS = 60;

const generateOtp = () => String(crypto.randomInt(1000, 10000)); // always exactly 4 digits

// Step 1 (and "Resend OTP") — request a fresh OTP by email.
router.post('/forgot-password', passwordLimiter, async (req, res) => {
    try {
        const { email } = req.body;
        if (!email || !email.trim()) return res.status(400).json({ success: false, message: 'Email is required' });

        const genericResponse = { success: true, message: 'If this email is registered, an OTP has been sent.' };

        const { data: user, error } = await supabase
            .from('employees')
            .select('id, employee_id, email, first_name, last_name, is_active')
            .eq('email', email.trim().toLowerCase())
            .maybeSingle();
        if (error) throw error;

        // Same response whether the account exists, is inactive, or the email is wrong —
        // never reveal account existence to an unauthenticated caller.
        if (!user || user.is_active === false) return res.json(genericResponse);

        // Server-side resend cooldown (defense in depth beyond the frontend's own timer —
        // a page refresh can't bypass this one).
        const { data: existingOtp } = await supabase
            .from('password_reset_otps')
            .select('created_at')
            .eq('employee_id', user.employee_id)
            .maybeSingle();
        if (existingOtp) {
            const secondsSinceLast = (Date.now() - new Date(existingOtp.created_at).getTime()) / 1000;
            if (secondsSinceLast < OTP_RESEND_COOLDOWN_SECONDS) {
                return res.status(429).json({
                    success: false,
                    message: `Please wait ${Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - secondsSinceLast)}s before requesting another OTP.`,
                });
            }
        }

        const otp = generateOtp();
        const otpHash = await bcrypt.hash(otp, 10);
        const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString();

        const { error: upsertError } = await supabase
            .from('password_reset_otps')
            .upsert(
                { employee_id: user.employee_id, otp_hash: otpHash, expires_at: expiresAt, attempts: 0, created_at: new Date().toISOString() },
                { onConflict: 'employee_id' }
            );
        if (upsertError) throw upsertError;

        // Never log the OTP itself, not even in development — only that one was generated.
        console.log(`📧 OTP generated for ${user.employee_id}, expires in ${OTP_EXPIRY_MINUTES}m`);

        // Never blocks the response — same fire-and-forget pattern used for every other
        // notification email in this app (see emailService.js callers elsewhere).
        sendPasswordResetOtpEmail(user, otp, OTP_EXPIRY_MINUTES).catch(err => console.error('❌ Password reset OTP email failed:', err));

        res.json(genericResponse);

    } catch (error) {
        console.error('❌ Forgot password error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Step 2 — verify the OTP, and on success issue the same short-lived reset JWT
// POST /reset-password already expects (unchanged from before).
router.post('/verify-otp', passwordLimiter, async (req, res) => {
    try {
        const { email, otp } = req.body;
        if (!email || !otp) return res.status(400).json({ success: false, message: 'Email and OTP are required' });

        const genericFail = () => res.status(401).json({ success: false, message: 'Incorrect or expired OTP. Please request a new one.' });

        const { data: user, error: userErr } = await supabase
            .from('employees')
            .select('id, employee_id, email, is_active')
            .eq('email', email.trim().toLowerCase())
            .maybeSingle();
        if (userErr) throw userErr;
        if (!user || user.is_active === false) return genericFail();

        const { data: otpRow, error: otpErr } = await supabase
            .from('password_reset_otps')
            .select('*')
            .eq('employee_id', user.employee_id)
            .maybeSingle();
        if (otpErr) throw otpErr;
        if (!otpRow) return genericFail();

        if (new Date(otpRow.expires_at) < new Date()) {
            // Expired — clean up so a fresh "Send OTP" isn't blocked by the resend cooldown.
            await supabase.from('password_reset_otps').delete().eq('employee_id', user.employee_id);
            return genericFail();
        }

        if (otpRow.attempts >= OTP_MAX_ATTEMPTS) {
            await supabase.from('password_reset_otps').delete().eq('employee_id', user.employee_id);
            return res.status(429).json({ success: false, message: 'Too many incorrect attempts. Please request a new OTP.' });
        }

        const isMatch = await bcrypt.compare(String(otp).trim(), otpRow.otp_hash);
        if (!isMatch) {
            const attemptsLeft = OTP_MAX_ATTEMPTS - (otpRow.attempts + 1);
            await supabase.from('password_reset_otps').update({ attempts: otpRow.attempts + 1 }).eq('employee_id', user.employee_id);
            return res.status(401).json({
                success: false,
                message: attemptsLeft > 0 ? `Incorrect OTP. ${attemptsLeft} attempt(s) remaining.` : 'Incorrect OTP. Please request a new one.',
            });
        }

        // Correct — invalidate the OTP immediately so it can never be reused.
        await supabase.from('password_reset_otps').delete().eq('employee_id', user.employee_id);

        const resetToken = jwt.sign({ id: user.id, email: user.email, purpose: 'password_reset' }, JWT_SECRET, { expiresIn: '10m' });
        res.json({ success: true, resetToken, message: 'OTP verified' });

    } catch (error) {
        console.error('❌ Verify OTP error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Reset password
router.post('/reset-password', async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        if (!token || !newPassword) return res.status(400).json({ success: false, message: 'Token and new password are required' });
        if (newPassword.length < 6) return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });

        let decoded;
        try { decoded = jwt.verify(token, JWT_SECRET); } catch {
            return res.status(401).json({ success: false, message: 'Invalid or expired token' });
        }

        if (decoded.purpose !== 'password_reset') return res.status(401).json({ success: false, message: 'Invalid token purpose' });

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        const { error } = await supabase.from('employees').update({ password: hashedPassword, updated_at: new Date().toISOString() }).eq('id', decoded.id);
        if (error) throw error;

        res.json({ success: true, message: 'Password reset successfully' });

    } catch (error) {
        console.error('❌ Reset password error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Admin-only: reset any employee's password directly
router.post('/reset-password-direct', async (req, res) => {
    try {
        // Require a valid admin JWT token
        const adminToken = req.headers['authorization']?.split(' ')[1];
        if (!adminToken) return res.status(401).json({ success: false, message: 'Authentication required' });
        let caller;
        try { caller = jwt.verify(adminToken, JWT_SECRET); } catch {
            return res.status(401).json({ success: false, message: 'Invalid or expired token' });
        }
        if (!['admin', 'sub_admin', 'hr'].includes(caller.role)) {
            return res.status(403).json({ success: false, message: 'Admin access required to reset passwords' });
        }

        const { email, newPassword } = req.body;

        if (!email || !newPassword) {
            return res.status(400).json({ success: false, message: 'Email and new password are required' });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
        }

        const { data: employee, error } = await supabase
            .from('employees')
            .select('employee_id, email')
            .eq('email', email.toLowerCase().trim())
            .maybeSingle();

        if (error) throw error;
        if (!employee) {
            return res.status(404).json({ success: false, message: 'No account found with this email address' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        const { error: updateError } = await supabase
            .from('employees')
            .update({ password: hashedPassword })
            .eq('email', email.toLowerCase().trim());

        if (updateError) throw updateError;

        console.log('✅ Password reset for:', employee.employee_id);
        res.json({ success: true, message: 'Password updated successfully. You can now login with your new password.' });

    } catch (error) {
        console.error('❌ Reset password error:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

module.exports = router;
