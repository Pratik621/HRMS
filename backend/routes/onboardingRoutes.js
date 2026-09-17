// backend/routes/onboardingRoutes.js
const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const path    = require('path');
const multer  = require('multer');
const bcrypt  = require('bcryptjs');
const supabase = require('../config/supabase');
const { verifyToken, isAdmin, isAdminOrDesktopSupport } = require('../middleware/auth');
const { uploadFile } = require('../lib/supabaseStorage');
const { createOnboardingTickets } = require('../utils/onboardingTickets');
const emailService = require('../services/emailService');
const { generateAndStoreOfferLetter } = require('../services/offerLetterService');
const { DEFAULT_CONTRACT_POLICY } = require('../utils/contractPolicy');

const BUCKET = 'hrms-documents';

// PAN and Aadhar are permanent government IDs — one real person can never legitimately
// hold two accounts under the same one. Bank account number is included too (per explicit
// request) even though it's a weaker signal — a joint/family account could rarely collide
// for two real different people — so of the three, treat it as still worth blocking on.
// Checked against every employee (active or not), since a past employee re-applying under
// a new offer link should be flagged, not silently given a second account. This also closes
// the door on account creation ever running twice for the same person (e.g. auto-approve-
// on-submit succeeding, then an admin's later manual "Approve & Create Account" click on the
// same stale-looking offer creating a duplicate) — a matching identity field stops it
// regardless of which path fires. Returns { field, label, employee } for the first match
// found, or null.
const IDENTITY_FIELDS = [
    { field: 'pan_number', label: 'PAN number' },
    { field: 'aadhar_number', label: 'Aadhar number' },
    { field: 'account_number', label: 'bank account number' },
];

const findExistingEmployeeByIdentity = async (sub) => {
    for (const { field, label } of IDENTITY_FIELDS) {
        const value = (sub[field] || '').trim();
        if (!value) continue;
        const { data: existing } = await supabase.from('employees')
            .select('employee_id, first_name, last_name, email')
            .ilike(field, value)
            .maybeSingle();
        if (existing) return { field, label, employee: existing };
    }
    return null;
};

// ── Shared account-creation logic ─────────────────────────────────────────────
// Used by both the auto-approval path (POST /:token/submit) and the legacy manual
// /links/:id/approve endpoint, so the two can never calculate/insert an employee
// record differently. `sub` uses the same field names as an
// employee_onboarding_submissions row (first_name, middle_name, ... joining_date).
const createEmployeeAccountFromSubmission = async (offer, sub) => {
    const now = new Date();

    const identityMatch = await findExistingEmployeeByIdentity(sub);
    if (identityMatch) {
        const { label, employee: existing } = identityMatch;
        throw new Error(
            `An employee account already exists with this ${label}: ${existing.employee_id} ` +
            `(${existing.first_name} ${existing.last_name}, ${existing.email}). ` +
            `No new account was created — please verify before proceeding.`
        );
    }

    // Generate employee_id (B2BYYMMNN)
    const { data: existing } = await supabase.from('employees').select('employee_id');
    const yy  = String(now.getFullYear()).slice(-2);
    const mm  = String(now.getMonth() + 1).padStart(2, '0');
    const prefix = `B2B${yy}${mm}`;
    const count = (existing || []).filter(e => e.employee_id?.startsWith(prefix)).length;
    const newEmployeeId = `${prefix}${String(count + 1).padStart(2, '0')}`;

    const tempPassword = `HRMS@${Math.random().toString(36).slice(-6).toUpperCase()}`;
    const hashed = await bcrypt.hash(tempPassword, 10);

    const employeeInsertPayload = {
        employee_id:    newEmployeeId,
        first_name:     sub.first_name,
        middle_name:    sub.middle_name || null,
        last_name:      sub.last_name,
        email:          sub.email,
        password:       hashed,
        phone:          sub.phone || null,
        dob:            sub.dob || null,
        gender:         sub.gender || null,
        blood_group:    sub.blood_group || null,
        linkedin_url:   sub.linkedin_url || null,
        address:        sub.address || null,
        city:           sub.city || null,
        state:          sub.state || null,
        pincode:        sub.pincode || null,
        designation:    offer.designation,
        department:     offer.department,
        employment_type: offer.employment_type,
        gross_salary:   offer.salary,
        // In-hand = offered salary minus the PF/Professional Tax the admin set when
        // generating the offer link (both optional — a link generated before this feature
        // existed, or with them left blank, has neither, so in-hand falls back to the full
        // offered salary rather than an arbitrary flat deduction).
        pf_amount:               offer.pf_amount ?? null,
        professional_tax_amount: offer.professional_tax_amount ?? null,
        in_hand_salary: Math.max(0, offer.salary - (Number(offer.pf_amount) || 0) - (Number(offer.professional_tax_amount) || 0)),
        reporting_manager: offer.reporting_manager || null,
        joining_date:   sub.joining_date || now.toISOString().split('T')[0],
        bank_account_name: sub.bank_account_name || null,
        account_number: sub.account_number || null,
        ifsc_code:      sub.ifsc_code || null,
        branch_name:    sub.branch_name || null,
        pan_number:     sub.pan_number || null,
        aadhar_number:  sub.aadhar_number || null,
        uan:            sub.uan || null,
        emergency_contact: sub.emergency_contact || null,
        emergency_contact_name: sub.emergency_contact_name || null,
        emergency_contact_relation: sub.emergency_contact_relation || null,
        role:           'employee',
        is_active:      true,
        can_apply_leave: true,
        profile_completed: true,
        shift_timing:   '9:00 AM - 6:00 PM',
        // Previously left unset here — an offer-link-onboarded employee's Profile > Contract
        // tab would show "No contract policy found" forever, unlike someone added manually
        // via Admin > Add Employee (which always stamps this same default).
        contract_policy: DEFAULT_CONTRACT_POLICY,
    };

    let { data: emp, error: empErr } = await supabase.from('employees').insert([employeeInsertPayload]).select().single();

    // A malformed PAN (or another DB-side validation on this column) must never block
    // account creation, the onboarding tickets, or the offer letter — HR just needs to
    // know about it so they can fix it later via the Edit option on the submission.
    // Retry once with pan_number dropped so everything else still goes through.
    let panWarning = null;
    if (empErr && /pan/i.test(empErr.message || '') && employeeInsertPayload.pan_number) {
        console.warn('[onboarding] employee insert rejected for PAN, retrying without it:', empErr.message);
        panWarning = empErr.message;
        ({ data: emp, error: empErr } = await supabase.from('employees')
            .insert([{ ...employeeInsertPayload, pan_number: null }]).select().single());
    }
    if (empErr) throw empErr;

    // Best-effort offer-letter generation — the onboarding form + offer link already collect
    // everything the letter needs (name/email/address/joining date/designation/department/
    // salary), so this should normally succeed. If it doesn't (missing data, PDF/storage
    // error), log and continue: the credentials email below still sends without an
    // attachment, and HR can complete/send the letter afterward from /admin/employees.
    let offerLetterAttachment = null;
    try {
        const { pdfBuffer } = await generateAndStoreOfferLetter({
            employee: emp,
            formInput: {
                designation: offer.designation,
                department: offer.department,
                employmentType: offer.employment_type,
                dateOfJoining: emp.joining_date,
                reportingManager: offer.reporting_manager,
                annualCTC: offer.salary != null ? Math.round(Number(offer.salary) * 12) : null,
                monthlyGross: offer.salary != null ? Number(offer.salary) : null,
                pfAmount: offer.pf_amount ?? null,
                professionalTaxAmount: offer.professional_tax_amount ?? null,
            },
            generatedBy: null,
            generatedByName: 'System (Onboarding Auto-Approval)',
        });
        const safeName = `${emp.first_name || 'employee'}-${emp.last_name || ''}`.replace(/[^a-z0-9]+/gi, '-');
        offerLetterAttachment = { pdfBase64: pdfBuffer.toString('base64'), filename: `${safeName}-Offer-Letter.pdf` };
    } catch (offerErr) {
        console.warn('[onboarding] offer letter not attached to credentials email (will need to be sent separately from Admin > Employees):', offerErr.message);
    }

    return { employee: emp, employeeId: newEmployeeId, tempPassword, offerLetterAttachment, panWarning };
};

// A submitted offer must raise its IT/Marketing onboarding tickets no matter what —
// even if createEmployeeAccountFromSubmission above threw for some reason we haven't
// special-cased (bad PAN already self-heals there; this is the catch-all for anything
// else: a duplicate email, an unexpected DB error, etc). Builds a ticket off the
// submission data alone (no `employees` row exists yet) and records the failure on
// the offer's Notes so it's visible next time HR opens it in Offer Links.
async function raiseTicketDespiteAccountFailure(supabase, { offer, sub, actor, error }) {
    try {
        const fallbackEmployee = {
            employee_id: null,
            first_name: sub.first_name, last_name: sub.last_name,
            designation: offer.designation, department: offer.department,
            joining_date: sub.joining_date, dob: sub.dob, blood_group: sub.blood_group,
            reporting_manager: offer.reporting_manager, phone: sub.phone,
            emergency_contact: sub.emergency_contact, address: sub.address,
        };
        await createOnboardingTickets(supabase, { employee: fallbackEmployee, actor, accountCreationError: error.message });

        const noteAddition = `⚠ Employee account creation failed — ${error.message}. IT/Marketing tickets were still raised (marked pending); please resolve and approve manually.`;
        const newNotes = offer.notes ? `${offer.notes}\n${noteAddition}` : noteAddition;
        await supabase.from('employee_offer_links').update({ notes: newNotes }).eq('id', offer.id);
    } catch (fallbackErr) {
        console.error('[onboarding] raiseTicketDespiteAccountFailure itself failed:', fallbackErr);
    }
}

// 4 MB per file — keeps each multipart request well under Vercel's 4.5 MB payload cap.
const uploadSingle = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 4 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const allowed = /\.(jpe?g|png|pdf|docx?)$/i.test(path.extname(file.originalname));
        cb(null, allowed);
    },
});

// ── POST /api/onboarding/generate ─────────────────────────────────────────────
router.post('/generate', verifyToken, isAdminOrDesktopSupport, async (req, res) => {
    try {
        const {
            employee_name, designation, department, employment_type,
            salary, pf_amount, professional_tax_amount,
            reporting_manager, reporting_manager_id, expiry_date, notes, email,
        } = req.body;

        if (!employee_name?.trim())  return res.status(400).json({ success: false, message: 'Employee name is required' });
        if (!designation?.trim())    return res.status(400).json({ success: false, message: 'Position / Designation is required' });
        if (!department?.trim())     return res.status(400).json({ success: false, message: 'Department is required' });
        if (!employment_type)        return res.status(400).json({ success: false, message: 'Employment type is required' });
        if (!salary || isNaN(Number(salary)) || Number(salary) <= 0)
            return res.status(400).json({ success: false, message: 'Valid offered salary is required' });
        if (pf_amount !== undefined && pf_amount !== '' && (isNaN(Number(pf_amount)) || Number(pf_amount) < 0))
            return res.status(400).json({ success: false, message: 'PF amount must be 0 or a positive number' });
        if (professional_tax_amount !== undefined && professional_tax_amount !== '' && (isNaN(Number(professional_tax_amount)) || Number(professional_tax_amount) < 0))
            return res.status(400).json({ success: false, message: 'Professional Tax amount must be 0 or a positive number' });
        if (!expiry_date) return res.status(400).json({ success: false, message: 'Offer expiry date is required' });
        if (new Date(expiry_date) <= new Date())
            return res.status(400).json({ success: false, message: 'Expiry date must be in the future' });

        const token = crypto.randomBytes(32).toString('hex'); // 64-char hex

        const { data: admin } = await supabase
            .from('employees').select('first_name, last_name')
            .eq('employee_id', req.user.employeeId).maybeSingle();
        const generatedByName = admin
            ? `${admin.first_name} ${admin.last_name}`.trim()
            : req.user.employeeId;

        const insertPayload = {
            token,
            employee_name: employee_name.trim(),
            designation:   designation.trim(),
            department:    department.trim(),
            employment_type,
            salary:              Number(salary),
            pf_amount:               (pf_amount === undefined || pf_amount === '') ? null : Number(pf_amount),
            professional_tax_amount: (professional_tax_amount === undefined || professional_tax_amount === '') ? null : Number(professional_tax_amount),
            reporting_manager:   reporting_manager || null,
            reporting_manager_id: reporting_manager_id || null,
            expiry_date,
            notes:               notes?.trim() || null,
            email:               email?.trim() || null,
            status:              'pending',
            generated_by:        req.user.employeeId,
            generated_by_name:   generatedByName,
        };

        let { data, error } = await supabase.from('employee_offer_links').insert([insertPayload]).select().single();
        if (error && /email|does not exist/i.test(error.message || '')) {
            // email column not migrated on this DB yet (scripts/add-offer-link-email-columns.sql)
            // — retry without it so link generation keeps working either way.
            const { email: _email, ...payloadWithoutEmail } = insertPayload;
            ({ data, error } = await supabase.from('employee_offer_links').insert([payloadWithoutEmail]).select().single());
        }
        if (error && /pf_amount|professional_tax_amount|does not exist|schema cache/i.test(error.message || '')) {
            // pf_amount/professional_tax_amount not migrated yet on this DB
            // (scripts/add-offer-link-pf-pt-columns.sql) — retry without them so link
            // generation still works; the admin can set PF/PT later via Payroll > PF/PT.
            const { pf_amount: _pf, professional_tax_amount: _pt, ...payloadWithoutPfPt } = insertPayload;
            ({ data, error } = await supabase.from('employee_offer_links').insert([payloadWithoutPfPt]).select().single());
        }
        if (error) throw error;

        const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const link = `${baseUrl}/onboarding/${token}`;
        res.status(201).json({ success: true, link, offer: data });
    } catch (err) {
        console.error('[onboarding] generate:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── POST /api/onboarding/links/:id/send-email — email the offer link to the candidate ──
// (optionally CC'ing other people, e.g. the hiring manager). Same admin/desktop-support
// gate as /generate — this doesn't create anything new, just emails an existing link.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
router.post('/links/:id/send-email', verifyToken, isAdminOrDesktopSupport, async (req, res) => {
    try {
        const { id } = req.params;
        const { email, cc } = req.body;

        if (!email?.trim() || !EMAIL_REGEX.test(email.trim())) {
            return res.status(400).json({ success: false, message: 'A valid candidate email address is required' });
        }

        const ccList = Array.isArray(cc)
            ? [...new Set(cc.map(c => (c || '').trim()).filter(c => c && EMAIL_REGEX.test(c)))]
            : [];

        const { data: offer, error: offerErr } = await supabase
            .from('employee_offer_links').select('*').eq('id', id).maybeSingle();
        if (offerErr) throw offerErr;
        if (!offer) return res.status(404).json({ success: false, message: 'Offer link not found' });

        const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const link = `${baseUrl}/onboarding/${offer.token}`;

        const result = await emailService.sendOfferLinkEmail(email.trim(), {
            link,
            employeeName: offer.employee_name,
            designation:  offer.designation,
            department:   offer.department,
            salary:       offer.salary,
            pfAmount:     offer.pf_amount,
            professionalTaxAmount: offer.professional_tax_amount,
            expiryDate:   offer.expiry_date,
            notes:        offer.notes,
        }, ccList);

        if (!result.success) {
            return res.status(502).json({ success: false, message: result.error || 'Failed to send email via Resend' });
        }

        // Best-effort record-keeping — email/emailed_at/emailed_cc are additive columns
        // (scripts/add-offer-link-email-columns.sql); if they're not migrated yet on this
        // DB, the email has already been sent successfully above, so this must never turn
        // a real success into an error response — just log and move on.
        const { error: updateErr } = await supabase.from('employee_offer_links').update({
            email:       email.trim(),
            emailed_at:  new Date().toISOString(),
            emailed_cc:  ccList.join(', ') || null,
            updated_at:  new Date().toISOString(),
        }).eq('id', id);
        if (updateErr) console.warn('[onboarding] send-email: could not persist email/emailed_at (non-fatal):', updateErr.message);

        res.json({ success: true, message: `Offer link emailed to ${email.trim()}${ccList.length ? ` (cc: ${ccList.join(', ')})` : ''}` });
    } catch (err) {
        console.error('[onboarding] send-email:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── GET /api/onboarding/links — Protected: list all offer links ───────────────
router.get('/links', verifyToken, isAdminOrDesktopSupport, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('employee_offer_links')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;

        const now = new Date();
        const links = (data || []).map(l => ({
            ...l,
            effective_status: (l.status === 'pending' && new Date(l.expiry_date) < now) ? 'expired' : l.status,
        }));
        res.json({ success: true, links });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── GET /api/onboarding/links/:id/submission — Protected: view submission ─────
router.get('/links/:id/submission', verifyToken, isAdminOrDesktopSupport, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('employee_onboarding_submissions')
            .select('*')
            .eq('offer_id', req.params.id)
            .maybeSingle();
        if (error) throw error;
        if (!data) return res.status(404).json({ success: false, message: 'No submission found for this offer' });
        res.json({ success: true, submission: data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── PATCH /api/onboarding/links/:id/submission — Protected: edit submitted info ──
// Lets HR/Admin correct candidate-submitted data (e.g. a mistyped PAN) before or
// after approval. Field names are identical between employee_onboarding_submissions
// and employees (see createEmployeeAccountFromSubmission above), so when the account
// already exists the same edit is pushed into `employees` too, keeping both records
// in sync instead of silently drifting apart.
const EDITABLE_SUBMISSION_FIELDS = [
    'first_name', 'middle_name', 'last_name', 'email', 'phone', 'dob', 'gender', 'blood_group',
    'linkedin_url', 'address', 'city', 'state', 'pincode', 'joining_date',
    'bank_account_name', 'account_number', 'ifsc_code', 'branch_name',
    'pan_number', 'aadhar_number', 'uan',
    'emergency_contact', 'emergency_contact_name', 'emergency_contact_relation',
];

router.patch('/links/:id/submission', verifyToken, isAdmin, async (req, res) => {
    try {
        const { data: offer } = await supabase
            .from('employee_offer_links').select('id, created_employee_id').eq('id', req.params.id).maybeSingle();
        if (!offer) return res.status(404).json({ success: false, message: 'Offer not found' });

        const updates = {};
        EDITABLE_SUBMISSION_FIELDS.forEach(f => {
            if (Object.prototype.hasOwnProperty.call(req.body, f)) {
                const v = req.body[f];
                updates[f] = (typeof v === 'string' && v.trim() === '') ? null : v;
            }
        });
        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ success: false, message: 'No editable fields provided' });
        }

        const { data: updatedSub, error } = await supabase.from('employee_onboarding_submissions')
            .update(updates).eq('offer_id', req.params.id).select().maybeSingle();
        if (error) throw error;
        if (!updatedSub) return res.status(404).json({ success: false, message: 'No submission found for this offer' });

        let employeeSyncWarning = null;
        if (offer.created_employee_id) {
            const { error: empErr } = await supabase.from('employees')
                .update(updates).eq('employee_id', offer.created_employee_id);
            if (empErr) {
                console.error('[onboarding] submission edit: failed to sync employees row:', empErr.message);
                employeeSyncWarning = `Saved to the submission, but could not update the live employee record: ${empErr.message}`;
            }
        }

        res.json({ success: true, submission: updatedSub, warning: employeeSyncWarning });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── PATCH /api/onboarding/links/:id/expire — Protected: expire a link ─────────
router.patch('/links/:id/expire', verifyToken, isAdminOrDesktopSupport, async (req, res) => {
    try {
        const { error } = await supabase.from('employee_offer_links')
            .update({ status: 'expired', updated_at: new Date().toISOString() })
            .eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true, message: 'Link expired successfully' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── DELETE /api/onboarding/links/:id — Protected: delete offer link ───────────
router.delete('/links/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        const { error } = await supabase.from('employee_offer_links').delete().eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true, message: 'Offer link deleted' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── PATCH /api/onboarding/links/:id/clear-temp-password — Protected ───────────
// Lets HR/Admin deliberately hide the temp password from Offer Links once
// they've relayed it to the new hire (independent of the automatic clear that
// happens when the employee changes their own password — see /auth/change-password).
router.patch('/links/:id/clear-temp-password', verifyToken, isAdmin, async (req, res) => {
    try {
        const { error } = await supabase.from('employee_offer_links')
            .update({ temp_password: null, updated_at: new Date().toISOString() })
            .eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── PATCH /api/onboarding/links/:id/approve — Protected: create employee account
// Legacy manual-approval path — kept for any pre-existing 'submitted' links from
// before auto-approval-on-submit shipped. New submissions never reach this route
// since /:token/submit below now creates the account immediately.
router.patch('/links/:id/approve', verifyToken, isAdmin, async (req, res) => {
    try {
        const { data: offer } = await supabase
            .from('employee_offer_links').select('*').eq('id', req.params.id).maybeSingle();
        if (!offer) return res.status(404).json({ success: false, message: 'Offer not found' });
        if (offer.status !== 'submitted')
            return res.status(400).json({ success: false, message: 'Only submitted offers can be approved' });

        const { data: sub } = await supabase
            .from('employee_onboarding_submissions').select('*').eq('offer_id', req.params.id).maybeSingle();
        if (!sub) return res.status(404).json({ success: false, message: 'No submission found for this offer' });

        let accountResult;
        try {
            accountResult = await createEmployeeAccountFromSubmission(offer, sub);
        } catch (accountErr) {
            // The offer was submitted — a ticket goes out regardless of whether the account
            // itself could be created, so IT/Marketing/HR aren't left unaware of the new hire.
            console.error('[onboarding] approve: account creation failed, raising ticket anyway:', accountErr.message);
            await raiseTicketDespiteAccountFailure(supabase, { offer, sub, actor: req.user, error: accountErr });
            return res.status(500).json({
                success: false,
                message: `Employee account could not be created: ${accountErr.message}. A support ticket has still been raised for this candidate — see Notes on this offer.`,
                ticket_raised: true,
            });
        }
        const { employee: emp, employeeId: newEmployeeId, tempPassword, offerLetterAttachment, panWarning } = accountResult;

        emailService.sendEmployeeCredentialsEmail(emp, { employeeId: newEmployeeId, tempPassword }, offerLetterAttachment)
            .catch(e => console.error('❌ Failed to send employee-credentials email:', e.message));

        await createOnboardingTickets(supabase, { employee: emp, actor: req.user });

        const now = new Date();
        await supabase.from('employee_offer_links').update({
            status:               'approved',
            approved_at:          now.toISOString(),
            approved_by:          req.user.employeeId,
            temp_password:        tempPassword,
            created_employee_id:  newEmployeeId,
            updated_at:           now.toISOString(),
        }).eq('id', req.params.id);

        // Persist the warning to Notes too — the modal only shows it once, but HR should
        // still be able to see why the PAN is missing when they come back to this offer later.
        if (panWarning) {
            const noteAddition = `⚠ PAN not saved — ${panWarning}. Correct it via Edit; it will sync to the employee record.`;
            const newNotes = offer.notes ? `${offer.notes}\n${noteAddition}` : noteAddition;
            await supabase.from('employee_offer_links').update({ notes: newNotes }).eq('id', req.params.id);
        }

        res.json({
            success: true,
            message: panWarning
                ? `Employee account created successfully. Note: ${panWarning} — PAN was not saved and can be corrected via Edit.`
                : 'Employee account created successfully',
            employee_id:   newEmployeeId,
            temp_password: tempPassword,
            employee:      emp,
            warning:       panWarning || null,
        });
    } catch (err) {
        console.error('[onboarding] approve:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC ROUTES — no auth middleware (must come AFTER /links/* routes above)
// ─────────────────────────────────────────────────────────────────────────────

// ── GET /api/onboarding/:token — Public: get offer details ────────────────────
router.get('/:token', async (req, res) => {
    try {
        let { data, error } = await supabase
            .from('employee_offer_links')
            .select('id, token, employee_name, designation, department, employment_type, salary, pf_amount, professional_tax_amount, reporting_manager, expiry_date, notes, status, generated_by_name, accepted_at, rejected_at, submitted_at, created_at')
            .eq('token', req.params.token)
            .maybeSingle();

        if (error && /pf_amount|professional_tax_amount|does not exist|schema cache/i.test(error.message || '')) {
            // pf_amount/professional_tax_amount not migrated yet on this DB — this is a
            // public candidate-facing page, so it must degrade to the pre-PF/PT column list
            // rather than ever break the offer page entirely.
            ({ data, error } = await supabase
                .from('employee_offer_links')
                .select('id, token, employee_name, designation, department, employment_type, salary, reporting_manager, expiry_date, notes, status, generated_by_name, accepted_at, rejected_at, submitted_at, created_at')
                .eq('token', req.params.token)
                .maybeSingle());
        }

        if (error) throw error;
        if (!data) return res.status(404).json({ success: false, message: 'Offer link not found or invalid' });

        if (data.status === 'pending' && new Date(data.expiry_date) < new Date()) {
            await supabase.from('employee_offer_links')
                .update({ status: 'expired', updated_at: new Date().toISOString() })
                .eq('token', req.params.token);
            return res.status(410).json({
                success: false, message: 'This offer link has expired',
                offer: { ...data, status: 'expired' },
            });
        }

        res.json({ success: true, offer: data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── POST /api/onboarding/:token/accept ────────────────────────────────────────
router.post('/:token/accept', async (req, res) => {
    try {
        const { data } = await supabase.from('employee_offer_links')
            .select('status, expiry_date').eq('token', req.params.token).maybeSingle();
        if (!data) return res.status(404).json({ success: false, message: 'Offer not found' });
        if (data.status !== 'pending')
            return res.status(400).json({ success: false, message: `Offer is already ${data.status}` });
        if (new Date(data.expiry_date) < new Date())
            return res.status(410).json({ success: false, message: 'Offer has expired' });

        await supabase.from('employee_offer_links').update({
            status: 'accepted', accepted_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).eq('token', req.params.token);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── POST /api/onboarding/:token/reject ────────────────────────────────────────
router.post('/:token/reject', async (req, res) => {
    try {
        const { confirmed_name } = req.body;
        const { data } = await supabase.from('employee_offer_links')
            .select('*').eq('token', req.params.token).maybeSingle();
        if (!data) return res.status(404).json({ success: false, message: 'Offer not found' });
        if (data.status !== 'pending')
            return res.status(400).json({ success: false, message: `Offer is already ${data.status}` });
        if (new Date(data.expiry_date) < new Date())
            return res.status(410).json({ success: false, message: 'Offer has expired' });
        if (!confirmed_name || confirmed_name.trim().toLowerCase() !== data.employee_name.trim().toLowerCase())
            return res.status(400).json({ success: false, message: 'Name confirmation does not match' });

        const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').toString().split(',')[0].trim();
        const ua = (req.headers['user-agent'] || '').substring(0, 255);

        await supabase.from('employee_offer_links').update({
            status: 'rejected',
            rejected_at: new Date().toISOString(),
            rejected_by_ip: ip,
            rejected_by_device: ua,
            updated_at: new Date().toISOString(),
        }).eq('token', req.params.token);

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── POST /api/onboarding/:token/upload-file ───────────────────────────────────
// Public: accepts ONE document file (≤ 4 MB) via multipart, uploads it to
// Supabase Storage using the service role key (bypasses all RLS), and returns
// the public URL. Keeps each request well under Vercel's 4.5 MB payload cap.
router.post('/:token/upload-file', (req, res) => {
    uploadSingle.single('file')(req, res, async (err) => {
        if (err) {
            const msg = err.code === 'LIMIT_FILE_SIZE'
                ? 'File exceeds the 4 MB limit. Please compress it and try again.'
                : (err.message || 'File upload error');
            return res.status(400).json({ success: false, message: msg });
        }

        try {
            const { field } = req.body;
            if (!field) return res.status(400).json({ success: false, message: '"field" body param is required' });
            if (!req.file) return res.status(400).json({ success: false, message: 'No file received' });

            // Validate the offer token before storing anything
            const { data: offer } = await supabase.from('employee_offer_links')
                .select('id, status, expiry_date').eq('token', req.params.token).maybeSingle();
            if (!offer) return res.status(404).json({ success: false, message: 'Offer not found' });
            if (!['pending', 'accepted'].includes(offer.status))
                return res.status(400).json({ success: false, message: `Cannot upload: offer is ${offer.status}` });
            if (new Date(offer.expiry_date) < new Date())
                return res.status(410).json({ success: false, message: 'Offer has expired' });

            const { publicUrl } = await uploadFile(
                req.file.buffer,
                req.file.originalname,
                'onboarding',
                req.file.mimetype,
            );

            console.log(`[onboarding] uploaded ${field} → ${publicUrl}`);
            return res.json({ success: true, publicUrl, field });
        } catch (uploadErr) {
            console.error('[onboarding] upload-file error:', uploadErr);
            return res.status(500).json({ success: false, message: uploadErr.message });
        }
    });
});

// ── POST /api/onboarding/:token/presign ───────────────────────────────────────
// Validates the offer token and returns a unique storage path so the browser
// can upload the file directly to Supabase Storage using the anon key.
// No files pass through this server — only the tiny path JSON response does.
router.post('/:token/presign', async (req, res) => {
    try {
        const { field, filename } = req.body;
        if (!field || !filename) {
            return res.status(400).json({ success: false, message: 'field and filename are required' });
        }

        const { data: offer } = await supabase.from('employee_offer_links')
            .select('id, status, expiry_date').eq('token', req.params.token).maybeSingle();
        if (!offer) return res.status(404).json({ success: false, message: 'Offer not found' });
        if (!['pending', 'accepted'].includes(offer.status))
            return res.status(400).json({ success: false, message: `Cannot upload: offer is ${offer.status}` });
        if (new Date(offer.expiry_date) < new Date())
            return res.status(410).json({ success: false, message: 'Offer has expired' });

        const ext = (filename.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
        const unique = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
        const storagePath = `onboarding/${field}-${unique}.${ext}`;
        const publicUrl   = `${process.env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`;

        res.json({ success: true, storagePath, publicUrl });
    } catch (err) {
        console.error('[onboarding] presign:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── POST /api/onboarding/:token/submit ────────────────────────────────────────
// Accepts JSON only — document URLs are already stored in Supabase (uploaded
// directly by the browser via the /presign endpoint above).
router.post('/:token/submit', async (req, res) => {
    try {
        const { data: offer } = await supabase.from('employee_offer_links')
            .select('*').eq('token', req.params.token).maybeSingle();
        if (!offer) return res.status(404).json({ success: false, message: 'Offer not found' });
        if (!['pending', 'accepted'].includes(offer.status))
            return res.status(400).json({ success: false, message: `Cannot submit: offer is ${offer.status}` });
        if (new Date(offer.expiry_date) < new Date())
            return res.status(410).json({ success: false, message: 'Offer has expired' });

        const { data: dup } = await supabase.from('employee_onboarding_submissions')
            .select('id').eq('offer_id', offer.id).maybeSingle();
        if (dup) return res.status(409).json({ success: false, message: 'This offer has already been submitted' });

        const {
            first_name, middle_name, last_name, email, phone, dob, gender, blood_group,
            linkedin_url,
            address, city, state, pincode,
            bank_account_name, account_number, ifsc_code, branch_name,
            pan_number, aadhar_number, uan,
            emergency_contact, emergency_contact_name, emergency_contact_relation,
            joining_date,
            // Document URLs — uploaded via POST /:token/upload-file (service role key)
            passport_photo, aadhar_card_doc, pan_card_doc, offer_letter_doc,
        } = req.body;

        if (!first_name?.trim())        return res.status(400).json({ success: false, message: 'First name is required' });
        if (!last_name?.trim())         return res.status(400).json({ success: false, message: 'Last name is required' });
        if (!email?.trim())             return res.status(400).json({ success: false, message: 'Email is required' });
        if (!phone?.trim())             return res.status(400).json({ success: false, message: 'Phone number is required' });
        if (!dob)                       return res.status(400).json({ success: false, message: 'Date of birth is required' });
        if (!blood_group)               return res.status(400).json({ success: false, message: 'Blood group is required' });
        if (!joining_date)              return res.status(400).json({ success: false, message: 'Joining date is required' });
        if (!address?.trim())           return res.status(400).json({ success: false, message: 'Residential address is required' });
        if (!emergency_contact?.trim()) return res.status(400).json({ success: false, message: 'Emergency contact number is required' });
        if (!bank_account_name?.trim()) return res.status(400).json({ success: false, message: 'Account holder name is required' });
        if (!account_number?.trim())    return res.status(400).json({ success: false, message: 'Account number is required' });
        if (!ifsc_code?.trim())         return res.status(400).json({ success: false, message: 'IFSC code is required' });
        if (!passport_photo)            return res.status(400).json({ success: false, message: 'Passport size photo is required' });
        if (!aadhar_card_doc)           return res.status(400).json({ success: false, message: 'Aadhar card document is required' });
        if (!pan_card_doc)              return res.status(400).json({ success: false, message: 'PAN card document is required' });

        // An existing employee with this email is the #1 real-world reason auto-approval
        // silently falls back to manual review (employees.email is unique) — catch it here
        // with a clear message instead of letting it surface later as a confusing generic
        // "HR will review" fallback with no explanation.
        const { data: existingEmp } = await supabase.from('employees')
            .select('employee_id').ilike('email', email.trim()).maybeSingle();
        if (existingEmp) {
            return res.status(409).json({
                success: false,
                message: 'An employee account with this email already exists. Please use a different email address, or contact HR if you believe this is a mistake.',
            });
        }

        // Same idea for PAN/Aadhar/bank account number — rejected right here at submit time
        // instead of silently accepting the form and only surfacing the problem to HR later.
        // Message is deliberately generic (no employee name/ID) since this is a public,
        // unauthenticated endpoint — reachable by anyone holding the link — so it shouldn't
        // leak whose account it collided with.
        const identityMatch = await findExistingEmployeeByIdentity({ pan_number, aadhar_number, account_number });
        if (identityMatch) {
            return res.status(409).json({
                success: false,
                message: `An employee account already exists with this ${identityMatch.label}. Please contact HR if you believe this is a mistake.`,
            });
        }

        // Shared shape: inserted as-is into employee_onboarding_submissions, and reused
        // directly (no re-fetch) by createEmployeeAccountFromSubmission below.
        const submissionRow = {
            first_name:    first_name.trim(),
            middle_name:   middle_name?.trim() || null,
            last_name:     last_name.trim(),
            email:         email.trim().toLowerCase(),
            phone:         phone || null, dob: dob || null, gender: gender || null,
            blood_group:   blood_group || null,
            linkedin_url:  linkedin_url?.trim() || null,
            address:       address || null, city: city || null, state: state || null, pincode: pincode || null,
            designation:   offer.designation, department: offer.department,
            employment_type: offer.employment_type,
            gross_salary:  offer.salary,
            // Same PF/Professional-Tax-aware formula as createEmployeeAccountFromSubmission
            // below — this row is only a record of the submission, but must agree with the
            // actual employees.in_hand_salary that gets created from it moments later.
            in_hand_salary: Math.max(0, offer.salary - (Number(offer.pf_amount) || 0) - (Number(offer.professional_tax_amount) || 0)),
            reporting_manager: offer.reporting_manager || null,
            joining_date:  joining_date || null,
            bank_account_name: bank_account_name.trim(), account_number: account_number.trim(),
            ifsc_code:     ifsc_code.trim(), branch_name: branch_name || null,
            pan_number:    pan_number || null, aadhar_number: aadhar_number || null, uan: uan || null,
            emergency_contact: emergency_contact || null,
            emergency_contact_name: emergency_contact_name || null,
            emergency_contact_relation: emergency_contact_relation || null,
            passport_photo,
            aadhar_card_doc,
            pan_card_doc,
            offer_letter_doc: offer_letter_doc || null,
        };

        const { error } = await supabase.from('employee_onboarding_submissions')
            .insert([{ offer_id: offer.id, ...submissionRow }]);
        if (error) throw error;

        // Auto-approve immediately — no manual admin review gate. Creates the employee
        // account right away, raises the onboarding tickets, and records the temp
        // password on the offer link so HR/Admin can view it in Offer Links until the
        // employee changes it on first login (see /auth/change-password clearing it).
        // Credentials are also returned to the candidate directly below so they can log
        // in right away instead of waiting to be contacted by HR.
        const now = new Date();
        let credentials = null;
        try {
            // Step 1 — create the employee account. This is the part that actually matters
            // for "auto-approve" — everything after this is bookkeeping, so a failure here
            // (and only here) should fall back to the old manual-review state.
            const { employee: emp, employeeId: newEmployeeId, tempPassword, offerLetterAttachment, panWarning } =
                await createEmployeeAccountFromSubmission(offer, submissionRow);
            credentials = { employee_id: newEmployeeId, temp_password: tempPassword, email: emp.email };

            // The candidate-facing response below never mentions this — persist it to Notes
            // so HR/Admin sees it the next time they open this offer in Offer Links.
            if (panWarning) {
                const noteAddition = `⚠ PAN not saved — ${panWarning}. Correct it via Edit; it will sync to the employee record.`;
                const newNotes = offer.notes ? `${offer.notes}\n${noteAddition}` : noteAddition;
                await supabase.from('employee_offer_links').update({ notes: newNotes }).eq('token', req.params.token);
            }

            // Fire-and-forget: email the new employee their own credentials (+ their offer
            // letter, when generation succeeded above) — never blocks the response, and a
            // failure here must not undo the account/tickets created around it (the
            // candidate also sees these credentials on-screen regardless).
            emailService.sendEmployeeCredentialsEmail(emp, { employeeId: newEmployeeId, tempPassword }, offerLetterAttachment)
                .catch(e => console.error('❌ Failed to send employee-credentials email:', e.message));

            // Step 2 — raise onboarding tickets. Never throws (see onboardingTickets.js),
            // so a ticketing problem can't undo the account that was just created.
            await createOnboardingTickets(supabase, { employee: emp, actor: { employeeId: offer.generated_by } });

            // Step 3 — mark the link approved + record the temp password for HR/Admin to
            // view later. Try the full update first; if the migration in
            // backend/scripts/add-onboarding-auto-approval-columns.sql hasn't been run yet
            // (temp_password/created_employee_id/auto_approved don't exist as columns),
            // retry with only the columns that have always existed — the employee account
            // and tickets above are unaffected either way, and `credentials` was already
            // captured above so the candidate still sees their login details.
            const { error: linkUpdateErr } = await supabase.from('employee_offer_links').update({
                status:               'approved',
                submitted_at:         now.toISOString(),
                approved_at:          now.toISOString(),
                approved_by:          null, // auto-approved — no admin action
                auto_approved:        true,
                temp_password:        tempPassword,
                created_employee_id:  newEmployeeId,
                updated_at:           now.toISOString(),
            }).eq('token', req.params.token);

            if (linkUpdateErr) {
                console.error('[onboarding] offer_links update with new columns failed, retrying without them:', linkUpdateErr);
                const { error: fallbackErr } = await supabase.from('employee_offer_links').update({
                    status:      'approved',
                    submitted_at: now.toISOString(),
                    approved_at: now.toISOString(),
                    approved_by: null,
                    updated_at:  now.toISOString(),
                }).eq('token', req.params.token);
                if (fallbackErr) console.error('[onboarding] offer_links fallback update also failed:', fallbackErr);
            }
        } catch (autoApproveErr) {
            // Account creation itself failed (e.g. duplicate email already in `employees`)
            // — fall back to the old manual-review state rather than losing the
            // candidate's submitted data. The form was still submitted, though, so the
            // IT/Marketing tickets go out regardless — see raiseTicketDespiteAccountFailure.
            console.error('[onboarding] auto-approve on submit failed:', {
                message: autoApproveErr?.message, details: autoApproveErr?.details,
                hint: autoApproveErr?.hint, code: autoApproveErr?.code,
            });
            credentials = null;
            await supabase.from('employee_offer_links').update({
                status: 'submitted',
                submitted_at: now.toISOString(),
                updated_at: now.toISOString(),
            }).eq('token', req.params.token);
            await raiseTicketDespiteAccountFailure(supabase, {
                offer, sub: submissionRow, actor: { employeeId: offer.generated_by }, error: autoApproveErr,
            });
        }

        return res.status(201).json({
            success: true,
            message: credentials
                ? 'Onboarding form submitted and your account has been created'
                : 'Onboarding form submitted successfully',
            ...credentials,
        });
    } catch (err) {
        console.error('[onboarding] submit:', err);
        return res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
