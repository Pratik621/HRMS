// services/emailService.js
// Resend transactional email service — API key NEVER in frontend / Vite env.

const { Resend } = require('resend');

// ─── Safe defaults (used when env var is missing or blank) ────────────────────
// The Resend-verified domain is the apex `b2bindemand.agency` — NOT the `hrms.` subdomain
// (confirmed live via resend.domains.list()). Sending "from" an address on a subdomain that
// wasn't itself separately verified gets a 403 from Resend even though the apex is verified,
// which is exactly the bug this default used to have (and EMAIL_FROM was set to match it).
const DEFAULT_FROM = 'HRMS <noreply@b2bindemand.agency>';
const DEFAULT_FRONT = 'https://hrms.b2bindemand.agency';


// Helper: returns the env value only when it is a non-empty string
const envStr = (key, fallback) => {
    const val = process.env[key];
    return (val && val.trim()) ? val.trim() : fallback;
};

// ─── Startup logs (runs once when module is first required) ───────────────────
console.log('--- [EMAIL SERVICE] startup ---');
console.log('EMAIL_FROM       :', JSON.stringify(process.env.EMAIL_FROM));
console.log('FRONTEND_URL     :', JSON.stringify(process.env.FRONTEND_URL));
console.log('RESEND_API_KEY exists:', !!process.env.RESEND_API_KEY);

const resolvedFrom  = envStr('EMAIL_FROM',  DEFAULT_FROM);
const resolvedFront = envStr('FRONTEND_URL', DEFAULT_FRONT).replace(/\/$/, '');

console.log('Resolved EMAIL_FROM  :', resolvedFrom);
console.log('Resolved FRONTEND_URL:', resolvedFront);
console.log('-------------------------------');

if (!process.env.RESEND_API_KEY) {
    console.warn('⚠️  [EMAIL] RESEND_API_KEY not set — all emails will be skipped');
}
if (resolvedFrom === DEFAULT_FROM && !process.env.EMAIL_FROM) {
    console.warn('⚠️  [EMAIL] EMAIL_FROM not set — using hardcoded fallback:', DEFAULT_FROM);
}
if (resolvedFront === DEFAULT_FRONT && !process.env.FRONTEND_URL) {
    console.warn('⚠️  [EMAIL] FRONTEND_URL not set — using hardcoded fallback:', DEFAULT_FRONT);
}

// ─── Getters: re-read env on every call so hot-reloads / late config works ────
const getFrom  = () => envStr('EMAIL_FROM',  DEFAULT_FROM);
const getFront = () => envStr('FRONTEND_URL', DEFAULT_FRONT).replace(/\/$/, '');

// ─── Core send wrapper ────────────────────────────────────────────────────────
// Never throws — always returns { success, ... } so callers are never blocked.
// cc/bcc are optional string[] — omitted entirely from the Resend payload when empty,
// rather than passed as `[]`, since Resend treats an empty array differently from a
// missing field in some SDK versions.
const sendEmail = async ({ to, subject, html, text, cc, bcc, attachments }) => {
    const from       = getFrom();
    const frontendUrl = getFront();
    const resend     = process.env.RESEND_API_KEY
        ? new Resend(process.env.RESEND_API_KEY)
        : null;

    // ── Send-time logs (exactly as requested) ─────────────────────────────────
    console.log('📧 Sending email');
    console.log('   Sending email from:', from);
    console.log('   Sending email to  :', to);
    if (cc?.length)  console.log('   CC                :', cc);
    if (bcc?.length) console.log('   BCC               :', bcc);
    console.log('   Email button URL  :', `${frontendUrl}/attendance`);
    console.log('   Subject           :', subject);

    if (!resend) {
        console.warn('⚠️  [EMAIL] RESEND_API_KEY not set — email skipped:', subject);
        return { success: false, reason: 'no_api_key' };
    }
    if (!to) {
        console.warn('⚠️  [EMAIL] No recipient — email skipped:', subject);
        return { success: false, reason: 'no_recipient' };
    }

    try {
        const payload = { from, to, subject, html, text };
        if (cc?.length)  payload.cc  = cc;
        if (bcc?.length) payload.bcc = bcc;
        if (attachments?.length) payload.attachments = attachments;
        const result = await resend.emails.send(payload);
        console.log('✅ Resend response:', JSON.stringify(result));
        if (result.error) {
            console.error('❌ Resend error details:', result.error);
            return { success: false, error: result.error?.message || JSON.stringify(result.error) };
        }
        return { success: true, id: result.data?.id };
    } catch (error) {
        console.error('❌ Resend email failed:', error);
        console.error('❌ Resend error details:', error?.response?.data || error?.message || error);
        return { success: false, error: error?.message || String(error) };
    }
};

// ─── Shared template shell ────────────────────────────────────────────────────
const shell = (title, bodyHtml) => {
    const frontendUrl = getFront();
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  
</head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#1e3a5f;padding:24px 32px;">
            <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">B2BinDemand HRMS</h1>

          </td>
        </tr>
        <tr><td style="padding:32px;">${bodyHtml}</td></tr>
        <tr>
          <td style="background:#f8fafc;padding:18px 32px;border-top:1px solid #e8ecf0;text-align:center;">
            <p style="margin:0;font-size:12px;color:#94a3b8;">
              This is an automated message from B2BinDemand HRMS. Please do not reply.<br/>
              <a href="${frontendUrl}" style="color:#1e3a5f;text-decoration:none;">Visit HRMS Portal</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
};

// ─── HTML helpers ─────────────────────────────────────────────────────────────
const row = (label, value, highlight = false) => `
<tr>
  <td style="padding:8px 12px;font-size:13px;color:#64748b;width:40%;border-bottom:1px solid #f1f5f9;">${label}</td>
  <td style="padding:8px 12px;font-size:13px;color:${highlight ? '#1e3a5f' : '#1e293b'};font-weight:${highlight ? '700' : '500'};border-bottom:1px solid #f1f5f9;">${value ?? '—'}</td>
</tr>`;

const tbl = (rows) => `
<table width="100%" cellpadding="0" cellspacing="0"
  style="background:#f8fafc;border-radius:8px;overflow:hidden;margin:16px 0;border:1px solid #e2e8f0;">
  <tbody>${rows}</tbody>
</table>`;

const badge = (text, color) =>
    `<span style="display:inline-block;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;background:${color};color:#fff;">${text}</span>`;

const h2 = (text) =>
    `<h2 style="margin:0 0 16px;font-size:16px;color:#1e293b;font-weight:700;">${text}</h2>`;

const para = (text) =>
    `<p style="margin:0 0 12px;font-size:14px;color:#475569;line-height:1.6;">${text}</p>`;

const btn = (text, url) => `
<div style="text-align:center;margin:24px 0;">
  <a href="${url}" style="display:inline-block;padding:12px 28px;background:#1e3a5f;color:#fff;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;">${text}</a>
</div>`;

// ─── PASSWORD RESET OTP ───────────────────────────────────────────────────────
// The OTP itself is generated + hashed for storage entirely in authRoutes.js — this
// function only ever receives the plain 4-digit code to put in the email body, never
// touches how it's stored/verified. Never logs the OTP itself (only the generic
// send-email logging sendEmail() already does — subject/recipient, no OTP value).
const sendPasswordResetOtpEmail = async (employee, otp, expiryMinutes) => {
    const { to, name } = resolveRecipient(employee);

    const html = shell('Your Password Reset OTP', `
        ${h2('Password Reset OTP')}
        ${para(`Hi ${name}, we received a request to reset your HRMS password. Use the code below to continue.`)}
        <div style="text-align:center;margin:24px 0;">
          <span style="display:inline-block;padding:16px 32px;background:#f0f4ff;border:2px dashed #1e3a5f;border-radius:10px;font-size:32px;font-weight:800;letter-spacing:8px;color:#1e3a5f;">${otp}</span>
        </div>
        ${para(`This OTP will expire in <strong>${expiryMinutes} minutes</strong>. Do not share this code with anyone — HRMS staff will never ask you for it.`)}
        ${para('If you did not request a password reset, please ignore this email — your password will not be changed.')}
    `);

    return sendEmail({
        to,
        subject: 'Your Password Reset OTP',
        html,
        text: `Hi ${name}, your OTP for resetting your password is ${otp}. This OTP will expire in ${expiryMinutes} minutes. If you did not request a password reset, please ignore this email.`,
    });
};

// ─── NEW EMPLOYEE CREDENTIALS ─────────────────────────────────────────────────
// Sent to the candidate's own email the moment their onboarding submission
// auto-creates their employee account (see onboardingRoutes.js POST /:token/submit).
// The temp password is plain text here ONLY because it's genuinely one-time/temporary —
// the employee is expected to change it on first login, same as it's already shown
// once on the submission-success screen; this is not the employee's real password.
// `offerLetter` is optional — { pdfBase64, filename } — passed only when the onboarding
// flow (backend/routes/onboardingRoutes.js) successfully generated a complete offer letter
// for this employee. Every existing call site omits it, so behavior there is unchanged.
const sendEmployeeCredentialsEmail = async (employee, credentials, offerLetter) => {
    const { to, name } = resolveRecipient(employee);
    const { employeeId, tempPassword } = credentials || {};
    const frontendUrl = getFront();
    const hasOfferLetter = !!offerLetter?.pdfBase64;
    const subject = hasOfferLetter ? 'Welcome to HRMS – Your Login Details & Offer Letter' : 'Your HRMS Login Details';

    const html = shell(subject, `
        ${h2(`🎉 Welcome to the team, ${name}!`)}
        ${para('Your employee account has been created. Use the credentials below to log in to HRMS.')}
        ${tbl(
            row('Employee ID', employeeId, true) +
            row('Email', to) +
            row('Temporary Password', `<span style="font-family:monospace;font-weight:700;">${tempPassword}</span>`)
        )}
        ${para('For security, please log in and change this temporary password as soon as possible.')}
        ${hasOfferLetter ? para('Your offer/appointment letter is attached to this email — please review it and reach out to HR with any questions.') : ''}
        ${btn('Log In to HRMS', `${frontendUrl}/login`)}
        ${para('If you did not expect this email, please contact HR immediately.')}
    `);

    return sendEmail({
        to,
        subject,
        html,
        text: `Hi ${name}, your HRMS account is ready.\n\nEmployee ID: ${employeeId}\nEmail: ${to}\nTemporary Password: ${tempPassword}\n\nPlease log in and change your password as soon as possible: ${frontendUrl}/login`,
        attachments: hasOfferLetter ? [{ filename: offerLetter.filename, content: offerLetter.pdfBase64 }] : undefined,
    });
};

// ─── 13. GENERATED OFFER LETTER (Flow A — HR-triggered from /admin/employees) ───────
const sendOfferLetterEmail = async (employee, { pdfBase64, filename, additionalEmail, designation, companyName, hrEmail }) => {
    const { to, name } = resolveRecipient(employee);
    if (!to) return { success: false, reason: 'no_recipient' };

    const recipients = [...new Set([to, additionalEmail].filter(Boolean).map(e => e.toLowerCase()))];

    const html = shell('Your Offer Letter', `
        ${h2(`🎉 Congratulations, ${name}!`)}
        ${para(`We're delighted to share your offer letter for the position of <strong>${escapeHtml(designation || '')}</strong> at ${escapeHtml(companyName || '')}. Please find the appointment letter attached as a PDF.`)}
        ${para('Kindly review the terms and conditions carefully. Reach out to HR if you have any questions.')}
        ${hrEmail ? para(`HR Contact: ${escapeHtml(hrEmail)}`) : ''}
    `);

    return sendEmail({
        to: recipients,
        subject: `Offer Letter – ${name} – ${companyName || ''}`,
        html,
        text: `Hi ${name}, congratulations! Please find your offer letter for ${designation} attached.`,
        attachments: [{ filename, content: pdfBase64 }],
    });
};

// ─── 1. SHIFT CHANGE ─────────────────────────────────────────────────────────
const sendShiftChangeEmail = async (employee, shiftDetails) => {
    const { to, name } = resolveRecipient(employee);
    const { oldShift, newShift, effectiveFrom, effectiveUntil, changedBy } = shiftDetails;
    const frontendUrl = getFront();

    const html = shell('Shift Schedule Updated', `
        ${h2('Your Shift Has Been Updated')}
        ${para(`Hi ${name}, your work shift has been changed by your manager.`)}
        ${tbl(
            row('Employee', name) +
            row('Previous Shift', oldShift || 'Not recorded') +
            row('New Shift', newShift, true) +
            row('Effective From', effectiveFrom || new Date().toLocaleDateString('en-IN')) +
            (effectiveUntil ? row('Effective Until', effectiveUntil) : '') +
            (changedBy ? row('Changed By', changedBy) : '') +
            row('Updated On', new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST')
        )}
        ${para('If you have any questions, please contact your manager or HR.')}
        ${btn('View My Attendance', `${frontendUrl}/attendance`)}
    `);

    return sendEmail({
        to,
        subject: `Shift Updated: ${newShift}`,
        html,
        text: `Hi ${name}, your shift has been updated to ${newShift} effective ${effectiveFrom || 'immediately'}.`,
    });
};

// ─── 2. LEAVE STATUS ─────────────────────────────────────────────────────────
const sendLeaveStatusEmail = async (employee, leaveDetails) => {
    const { to, name } = resolveRecipient(employee);
    const { status, leaveType, startDate, endDate, daysCount, remarks, approvedBy } = leaveDetails;
    const frontendUrl = getFront();

    const isApproved = status === 'approved';
    const color = isApproved ? '#16a34a' : status === 'cancelled' ? '#64748b' : '#dc2626';
    const label = isApproved ? 'APPROVED' : status === 'cancelled' ? 'CANCELLED' : 'REJECTED';

    const html = shell(`Leave Request ${label}`, `
        ${h2(`Leave Request ${label}`)}
        ${para(`Hi ${name}, your leave request has been <strong>${label.toLowerCase()}</strong>.`)}
        ${tbl(
            row('Status', badge(label, color)) +
            row('Leave Type', leaveType) +
            row('From', startDate) +
            row('To', endDate) +
            row('Total Days', daysCount) +
            (approvedBy ? row('Actioned By', approvedBy) : '') +
            (remarks ? row('Remarks', remarks) : '') +
            row('Updated On', new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST')
        )}
        ${isApproved
            ? para('Your leave balance has been updated accordingly.')
            : para('Your leave balance remains unchanged. You may apply again or contact HR for clarification.')}
        ${btn('View My Leaves', `${frontendUrl}/apply-leave`)}
    `);

    return sendEmail({
        to,
        subject: `Leave ${label}: ${leaveType} (${startDate} – ${endDate})`,
        html,
        text: `Hi ${name}, your ${leaveType} leave from ${startDate} to ${endDate} has been ${status}.${remarks ? ' Remarks: ' + remarks : ''}`,
    });
};

// ─── 3. EMPLOYEE PROFILE UPDATE APPROVAL ─────────────────────────────────────
const sendEmployeeUpdateEmail = async (employee, updateDetails) => {
    const { to, name } = resolveRecipient(employee);
    const { action, fields, isDocumentUpdate, documentTypes, remarks } = updateDetails;
    const frontendUrl = getFront();

    const isApproved = action === 'approve';
    const label = isApproved ? 'APPROVED' : 'REJECTED';
    const color = isApproved ? '#16a34a' : '#dc2626';
    const what  = isDocumentUpdate
        ? `Documents: ${(documentTypes || []).map(d => d.replace(/_/g, ' ').toUpperCase()).join(', ')}`
        : `Fields: ${(fields || []).join(', ')}`;

    const html = shell(`Profile Update ${label}`, `
        ${h2(`Your Profile Update Has Been ${label}`)}
        ${para(`Hi ${name}, your profile update request has been reviewed.`)}
        ${tbl(
            row('Status', badge(label, color)) +
            row('Update Type', isDocumentUpdate ? 'Document Upload' : 'Information Update') +
            row('Details', what, true) +
            (remarks ? row('Remarks', remarks) : '') +
            row('Reviewed On', new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST')
        )}
        ${isApproved
            ? para('Your profile has been updated successfully.')
            : para('Please contact HR if you need clarification on the rejection reason.')}
        ${btn('View My Profile', `${frontendUrl}/profile`)}
    `);

    return sendEmail({
        to,
        subject: `Profile Update ${label}`,
        html,
        text: `Hi ${name}, your profile update request (${what}) has been ${action}d.${remarks ? ' Remarks: ' + remarks : ''}`,
    });
};

// ─── 4. NOTICE BOARD ─────────────────────────────────────────────────────────
const sendNoticeBoardEmail = async (employeeList, noticeDetails) => {
    const { title, message, createdBy } = noticeDetails;
    const frontendUrl = getFront();

    const results = await Promise.allSettled(
        (employeeList || []).filter(e => e?.email).map(e => {
            const name = `${e.first_name || ''} ${e.last_name || ''}`.trim() || 'Employee';
            const html = shell('New Notice Published', `
                ${h2('📢 ' + title)}
                ${para(`Hi ${name}, a new notice has been published on the HRMS notice board.`)}
                <div style="background:#fffbeb;border-left:4px solid #f59e0b;padding:16px 20px;border-radius:0 8px 8px 0;margin:16px 0;">
                  <p style="margin:0;font-size:14px;color:#1e293b;line-height:1.6;">${message}</p>
                </div>
                ${tbl(
                    (createdBy ? row('Published By', createdBy) : '') +
                    row('Published On', new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST')
                )}
                ${btn('View Notice Board', `${frontendUrl}/attendance`)}
            `);
            return sendEmail({ to: e.email, subject: `Notice: ${title}`, html, text: `Hi ${name}, new notice: ${title}\n\n${message}` });
        })
    );

    const sent   = results.filter(r => r.status === 'fulfilled' && r.value?.success).length;
    const failed = results.length - sent;
    console.log(`📧 Notice emails: ${sent} sent, ${failed} failed`);
    return { sent, failed };
};

// ─── 5. ANNOUNCEMENT ─────────────────────────────────────────────────────────
const sendAnnouncementEmail = async (employeeList, announcementDetails) => {
    const { title, message, type, priority, createdBy } = announcementDetails;
    const frontendUrl = getFront();
    const priorityColor = priority === 'urgent' ? '#dc2626' : priority === 'high' ? '#ea580c' : '#1e3a5f';

    const results = await Promise.allSettled(
        (employeeList || []).filter(e => e?.email).map(e => {
            const name = `${e.first_name || ''} ${e.last_name || ''}`.trim() || 'Employee';
            const html = shell('New Announcement', `
                ${h2('📣 ' + title)}
                ${para(`Hi ${name}, there is a new announcement from management.`)}
                ${priority && priority !== 'normal'
                    ? `<div style="margin-bottom:12px;">${badge(priority.toUpperCase(), priorityColor)}</div>`
                    : ''}
                <div style="background:#f0f4ff;border-left:4px solid #1e3a5f;padding:16px 20px;border-radius:0 8px 8px 0;margin:16px 0;">
                  <p style="margin:0;font-size:14px;color:#1e293b;line-height:1.6;">${message}</p>
                </div>
                ${tbl(
                    row('Type', type || 'Announcement') +
                    (createdBy ? row('From', createdBy) : '') +
                    row('Date', new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST')
                )}
                ${btn('Open HRMS Portal', frontendUrl)}
            `);
            return sendEmail({
                to: e.email,
                subject: `[${(priority || 'announcement').toUpperCase()}] ${title}`,
                html,
                text: `Hi ${name}, new announcement: ${title}\n\n${message}`,
            });
        })
    );

    const sent   = results.filter(r => r.status === 'fulfilled' && r.value?.success).length;
    const failed = results.length - sent;
    console.log(`📧 Announcement emails: ${sent} sent, ${failed} failed`);
    return { sent, failed };
};

// ─── 6. HOLIDAY NOTIFICATION ─────────────────────────────────────────────────
const sendHolidayEmail = async (employeeList, holidayDetails) => {
    const { name: holidayName, date, action: act } = holidayDetails;
    const frontendUrl = getFront();
    const actionLabel = act === 'added' ? 'Added' : act === 'updated' ? 'Updated' : 'Removed';

    const results = await Promise.allSettled(
        (employeeList || []).filter(e => e?.email).map(e => {
            const empName = `${e.first_name || ''} ${e.last_name || ''}`.trim() || 'Employee';
            const html = shell(`Holiday ${actionLabel}: ${holidayName}`, `
                ${h2(`🗓️ Holiday ${actionLabel}`)}
                ${para(`Hi ${empName}, the holiday calendar has been updated.`)}
                ${tbl(
                    row('Holiday', holidayName, true) +
                    row('Date', date) +
                    row('Action', actionLabel) +
                    row('Updated On', new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST')
                )}
                ${para('Please plan your schedule accordingly.')}
                ${btn('View HRMS Portal', frontendUrl)}
            `);
            return sendEmail({
                to: e.email,
                subject: `Holiday ${actionLabel}: ${holidayName} on ${date}`,
                html,
                text: `Hi ${empName}, holiday "${holidayName}" on ${date} has been ${act}.`,
            });
        })
    );

    const sent   = results.filter(r => r.status === 'fulfilled' && r.value?.success).length;
    const failed = results.length - sent;
    console.log(`📧 Holiday emails: ${sent} sent, ${failed} failed`);
    return { sent, failed };
};

// ─── 7. NEW EMPLOYEE JOINED ──────────────────────────────────────────────────
// Bulk-sent to every Manager (role='sub_admin' — see roleGroups.js for the naming
// note) + every HR (role='hr') when a new employee is created.
const sendNewJoinerEmail = async (newEmployee, recipientList) => {
    const { first_name, last_name, employee_id, department, designation, joining_date } = newEmployee || {};
    const empName = `${first_name || ''} ${last_name || ''}`.trim() || 'New Employee';
    const frontendUrl = getFront();

    const results = await Promise.allSettled(
        (recipientList || []).filter(e => e?.email).map(e => {
            const name = `${e.first_name || ''} ${e.last_name || ''}`.trim() || 'Team';
            const html = shell('New Employee Joined', `
                ${h2('👋 A New Employee Has Joined')}
                ${para(`Hi ${name}, a new employee has been added to HRMS.`)}
                ${tbl(
                    row('Name', empName, true) +
                    row('Employee ID', employee_id) +
                    row('Department', department || '—') +
                    row('Designation', designation || '—') +
                    row('Joining Date', joining_date ? new Date(joining_date).toLocaleDateString('en-IN') : '—')
                )}
                ${btn('View Employee Directory', `${frontendUrl}/admin/employees`)}
            `);
            return sendEmail({
                to: e.email,
                subject: `New Employee Joined: ${empName} (${employee_id || ''})`,
                html,
                text: `${empName} (${employee_id || ''}) has joined as ${designation || 'N/A'} in ${department || 'N/A'}, effective ${joining_date || 'N/A'}.`,
            });
        })
    );

    const sent   = results.filter(r => r.status === 'fulfilled' && r.value?.success).length;
    const failed = results.length - sent;
    console.log(`📧 New-joiner emails: ${sent} sent, ${failed} failed`);
    return { sent, failed };
};

// ─── 8. LEAVE / COMP-OFF APPLIED ─────────────────────────────────────────────
// Bulk-sent to the applicant's reporting manager + HR when a leave/comp-off request
// is submitted (status change on approve/reject/cancel is handled separately by
// the existing sendLeaveStatusEmail, sent to the applicant themselves).
const sendLeaveAppliedEmail = async (leaveDetails, recipientList) => {
    const { employeeName, leaveType, startDate, endDate, daysCount, reason } = leaveDetails || {};
    const frontendUrl = getFront();
    const isCompOff = leaveType === 'Comp-Off';

    const results = await Promise.allSettled(
        (recipientList || []).filter(e => e?.email).map(e => {
            const name = `${e.first_name || ''} ${e.last_name || ''}`.trim() || 'Team';
            const html = shell(`New ${isCompOff ? 'Comp-Off' : 'Leave'} Application`, `
                ${h2(`📝 New ${isCompOff ? 'Comp-Off' : 'Leave'} Request`)}
                ${para(`Hi ${name}, ${employeeName} has applied for ${leaveType}.`)}
                ${tbl(
                    row('Employee', employeeName, true) +
                    row('Leave Type', leaveType) +
                    row('From', startDate) +
                    row('To', endDate) +
                    row('Total Days', daysCount) +
                    (reason ? row('Reason', escapeHtml(reason)) : '') +
                    row('Status', badge('PENDING', '#d97706'))
                )}
                ${para('Please review and take action in HRMS.')}
                ${btn('Review Request', `${frontendUrl}/admin/leave-requests`)}
            `);
            return sendEmail({
                to: e.email,
                subject: `${isCompOff ? 'Comp-Off' : 'Leave'} Application: ${employeeName} (${startDate} – ${endDate})`,
                html,
                text: `${employeeName} applied for ${leaveType} from ${startDate} to ${endDate}.${reason ? ' Reason: ' + reason : ''}`,
            });
        })
    );

    const sent   = results.filter(r => r.status === 'fulfilled' && r.value?.success).length;
    const failed = results.length - sent;
    console.log(`📧 Leave-applied emails: ${sent} sent, ${failed} failed`);
    return { sent, failed };
};

// ─── 9. TICKET CREATED (for a specific employee) ────────────────────────────
const sendTicketCreatedEmail = async (employee, ticketDetails) => {
    const { to, name } = resolveRecipient(employee);
    const { ticketNumber, subject: ticketSubject, description, priority, department, raisedByName } = ticketDetails || {};
    const frontendUrl = getFront();
    const priorityColor = priority === 'urgent' || priority === 'critical' ? '#dc2626'
        : priority === 'high' ? '#ea580c' : '#1e3a5f';

    const html = shell('Support Ticket Raised', `
        ${h2('🎫 A Ticket Has Been Raised For You')}
        ${para(`Hi ${name}, a support ticket has been raised${raisedByName ? ` by ${raisedByName}` : ''} on your behalf.`)}
        ${tbl(
            row('Ticket', ticketNumber, true) +
            row('Subject', escapeHtml(ticketSubject)) +
            row('Department', department) +
            row('Priority', badge((priority || 'medium').toUpperCase(), priorityColor)) +
            row('Status', badge('OPEN', '#1e3a5f')) +
            (description ? row('Description', escapeHtml(description)) : '')
        )}
        ${btn('View Ticket', `${frontendUrl}/tickets`)}
    `);

    return sendEmail({
        to,
        subject: `Ticket Raised: ${ticketNumber} — ${ticketSubject}`,
        html,
        text: `A ticket (${ticketNumber}) titled "${ticketSubject}" has been raised for you. Priority: ${priority || 'medium'}.`,
    });
};

// ─── 10. TICKET STATUS CHANGED ───────────────────────────────────────────────
const TICKET_STATUS_LABELS = {
    open: 'Open',
    in_progress: 'In Progress',
    resolved_pending: 'Resolved — Awaiting Your Confirmation',
    reopened: 'Reopened',
    closed: 'Closed',
};
const TICKET_STATUS_COLORS = {
    open: '#1e3a5f',
    in_progress: '#d97706',
    resolved_pending: '#16a34a',
    reopened: '#dc2626',
    closed: '#64748b',
};

const sendTicketStatusEmail = async (employee, ticketDetails) => {
    const { to, name } = resolveRecipient(employee);
    const { ticketNumber, subject: ticketSubject, status, resolveNote, updatedBy } = ticketDetails || {};
    const frontendUrl = getFront();
    const label = TICKET_STATUS_LABELS[status] || status;
    const color = TICKET_STATUS_COLORS[status] || '#1e3a5f';

    const html = shell('Ticket Status Updated', `
        ${h2('🎫 Your Ticket Status Has Changed')}
        ${para(`Hi ${name}, your ticket status has been updated.`)}
        ${tbl(
            row('Ticket', ticketNumber, true) +
            row('Subject', escapeHtml(ticketSubject)) +
            row('New Status', badge(label, color)) +
            (updatedBy ? row('Updated By', updatedBy) : '') +
            (resolveNote ? row('Note', escapeHtml(resolveNote)) : '') +
            row('Updated On', new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST')
        )}
        ${status === 'resolved_pending'
            ? para('Please confirm whether this resolves your issue, or let us know if you still need help.')
            : ''}
        ${btn('View Ticket', `${frontendUrl}/tickets`)}
    `);

    return sendEmail({
        to,
        subject: `Ticket ${label}: ${ticketNumber}`,
        html,
        text: `Your ticket ${ticketNumber} ("${ticketSubject}") status changed to ${label}.`,
    });
};

// ─── 11. MANUAL ADMIN/HR EMAIL (Email section, Admin & HR panel) ────────────
// subject/message are free-typed by an admin/HR user — escaped before going into
// HTML (never trust it, even from an authorized internal user).
// cc/bcc (optional string[]) are applied to EVERY individual send below — this function
// sends one personalized email per "to" recipient (not one email with everyone in the `to`
// field), so a cc'd/bcc'd person receives one copy per main recipient, not just one total.
// Worth knowing if a large recipient list is combined with cc/bcc.
const sendManualEmail = async (recipientList, { subject, message, sentByName, cc, bcc }) => {
    const frontendUrl = getFront();
    const safeSubject = escapeHtml(subject);

    const results = await Promise.allSettled(
        (recipientList || []).filter(e => e?.email).map(e => {
            const name = `${e.first_name || ''} ${e.last_name || ''}`.trim() || e.name || 'Employee';
            const html = shell(safeSubject, `
                ${h2(safeSubject)}
                ${para(`Hi ${name},`)}
                <div style="background:#f8fafc;border-left:4px solid #1e3a5f;padding:16px 20px;border-radius:0 8px 8px 0;margin:16px 0;">
                  <p style="margin:0;font-size:14px;color:#1e293b;line-height:1.6;white-space:pre-wrap;">${escapeHtml(message)}</p>
                </div>
                ${sentByName ? tbl(
                    row('Sent By', sentByName) +
                    row('Sent On', new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST')
                ) : ''}
                ${btn('Open HRMS Portal', frontendUrl)}
            `);
            return sendEmail({ to: e.email, subject, html, text: `Hi ${name},\n\n${message}`, cc, bcc });
        })
    );

    const sent   = results.filter(r => r.status === 'fulfilled' && r.value?.success).length;
    const failed = results.length - sent;
    console.log(`📧 Manual admin/HR emails: ${sent} sent, ${failed} failed`);
    return { sent, failed, total: results.length };
};

// ─── 12. OFFER/ONBOARDING LINK ───────────────────────────────────────────────
// Sends the generated candidate onboarding link directly to their email, with
// optional CC (e.g. the hiring manager, another HR member).
const sendOfferLinkEmail = async (candidateEmail, offerDetails, cc) => {
    const { link, employeeName, designation, department, salary, pfAmount, professionalTaxAmount, expiryDate, notes } = offerDetails || {};
    const frontendUrl = getFront();
    const name = employeeName || 'there';

    // PF/Professional Tax are optional (a link can be generated without them, same as
    // before this feature existed) — only show the breakdown rows, and the computed
    // in-hand line, when at least one deduction was actually set.
    const pf = pfAmount != null ? Number(pfAmount) : 0;
    const pt = professionalTaxAmount != null ? Number(professionalTaxAmount) : 0;
    const hasDeductions = pfAmount != null || professionalTaxAmount != null;
    const inHand = salary != null ? Math.max(0, Number(salary) - pf - pt) : null;

    const html = shell('You\'re Invited to Join Us', `
        ${h2(`🎉 Welcome, ${escapeHtml(name)}!`)}
        ${para(`Hi ${escapeHtml(name)}, we're excited to offer you the position of <strong>${escapeHtml(designation)}</strong> in our ${escapeHtml(department)} team. Click the button below to complete your onboarding.`)}
        ${tbl(
            row('Position', escapeHtml(designation), true) +
            row('Department', escapeHtml(department)) +
            (salary ? row('Offered Salary', `₹${Number(salary).toLocaleString('en-IN')}/month`) : '') +
            (hasDeductions && pfAmount != null ? row('PF', `₹${pf.toLocaleString('en-IN')}/month`) : '') +
            (hasDeductions && professionalTaxAmount != null ? row('Professional Tax', `₹${pt.toLocaleString('en-IN')}/month`) : '') +
            (hasDeductions && inHand != null ? row('In-Hand Salary', `₹${inHand.toLocaleString('en-IN')}/month`, true) : '') +
            row('Offer Valid Until', expiryDate ? new Date(expiryDate).toLocaleDateString('en-IN') : '—')
        )}
        ${notes ? para(`<em>${escapeHtml(notes)}</em>`) : ''}
        ${btn('Complete Your Onboarding', link)}
        ${para('This is a secure, one-time link generated specifically for you. Please do not share it with anyone else.')}
    `);

    return sendEmail({
        to: candidateEmail,
        cc,
        subject: `You're Invited to Join Us — ${designation || 'Offer'}`,
        html,
        text: `Hi ${name}, you've been offered the position of ${designation} in ${department}. Complete your onboarding here: ${link}`,
    });
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
// Minimal HTML-escape for free-typed user content going into an HTML email body —
// this is NOT a full sanitizer (no markup is ever allowed through), just prevents
// broken/injected markup from a subject/message/reason field.
const escapeHtml = (str) => {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

const resolveRecipient = (employee) => {
    if (!employee) return { to: null, name: 'Employee' };
    const name = `${employee.first_name || ''} ${employee.last_name || ''}`.trim() || 'Employee';
    return { to: employee.email || null, name };
};

const fmtIstTime = (d) => d
    ? new Date(d).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true })
    : '—';

// ─── BREAK OVERTIME NOTIFICATION ─────────────────────────────────────────────
// One email to every admin-configured recipient (not per-employee) — `notifyEmails`
// is passed straight through as the `to` array, same as any other multi-recipient
// send in this file.
const sendBreakOvertimeEmail = async (notifyEmails, details) => {
    const { employeeName, breakTypeLabel, allowedMinutes, breakStart } = details;
    if (!notifyEmails?.length) return { success: false, reason: 'no_recipients' };

    const html = shell('Employee Break Time Exceeded', `
        ${h2('⏰ Break Time Exceeded')}
        ${para(`${employeeName} has exceeded their allowed ${breakTypeLabel.toLowerCase()} duration and has not yet ended it.`)}
        ${tbl(
            row('Employee', employeeName, true) +
            row('Break Type', breakTypeLabel) +
            row('Allowed Duration', `${allowedMinutes} minutes`) +
            row('Break Started', fmtIstTime(breakStart)) +
            row('Current Status', 'Break time exceeded', true)
        )}
    `);

    return sendEmail({
        to: notifyEmails,
        subject: 'Employee Break Time Exceeded',
        html,
        text: `Employee: ${employeeName}\nBreak Type: ${breakTypeLabel}\nAllowed Duration: ${allowedMinutes} minutes\nBreak Started: ${fmtIstTime(breakStart)}\nCurrent Status: Break time exceeded`,
    });
};

// ─── BREAK ENDED NOTIFICATION ─────────────────────────────────────────────────
const sendBreakEndedEmail = async (notifyEmails, details) => {
    const { employeeName, breakTypeLabel, allowedMinutes, breakStart, breakEnd, actualMinutes, overtimeMinutes } = details;
    if (!notifyEmails?.length) return { success: false, reason: 'no_recipients' };

    const html = shell('Employee Break Ended', `
        ${h2('✅ Break Ended')}
        ${para(`${employeeName} has ended their ${breakTypeLabel.toLowerCase()}.`)}
        ${tbl(
            row('Employee', employeeName, true) +
            row('Break Type', breakTypeLabel) +
            row('Break Started', fmtIstTime(breakStart)) +
            row('Break Ended', fmtIstTime(breakEnd)) +
            row('Allowed Duration', `${allowedMinutes} minutes`) +
            row('Actual Duration', `${actualMinutes} minutes`) +
            (overtimeMinutes > 0 ? row('Overtime', `${overtimeMinutes} minutes`, true) : '')
        )}
    `);

    return sendEmail({
        to: notifyEmails,
        subject: 'Employee Break Ended',
        html,
        text: `Employee: ${employeeName}\nBreak Type: ${breakTypeLabel}\nBreak Started: ${fmtIstTime(breakStart)}\nBreak Ended: ${fmtIstTime(breakEnd)}\nAllowed Duration: ${allowedMinutes} minutes\nActual Duration: ${actualMinutes} minutes${overtimeMinutes > 0 ? `\nOvertime: ${overtimeMinutes} minutes` : ''}`,
    });
};

// ─── EARLY LOGOUT APPLIED (oversight notification) ───────────────────────────
// Sent to HR + all Managers (sub_admin) whenever a TL/Manager/Admin/HR marks one or more
// employees Present for an early-logout override — the whole point is oversight over
// attendance being overridden away from Half Day, so it always goes out regardless of who
// performed the action.
const sendEarlyLogoutAppliedEmail = async (notifyEmails, details) => {
    const { actingName, actingRole, date, employees } = details;
    if (!notifyEmails?.length || !employees?.length) return { success: false, reason: 'no_recipients_or_employees' };

    const dateDisplay = new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const roleLabel = actingRole === 'manager' ? 'TL' : actingRole === 'sub_admin' ? 'Manager' : actingRole === 'admin' ? 'Admin' : actingRole === 'hr' ? 'HR' : actingRole;

    const html = shell('Early Logout Applied', `
        ${h2('🕐 Early Logout Marked Present')}
        ${para(`${escapeHtml(actingName)} (${roleLabel}) has applied an early-logout override for ${dateDisplay} — the employees below are now marked Present instead of Half Day for that date.`)}
        ${tbl(
            row('Applied By', `${escapeHtml(actingName)} (${roleLabel})`, true) +
            row('Date', dateDisplay) +
            row('Employees', escapeHtml(employees.join(', '))) +
            row('Applied On', new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST')
        )}
    `);

    return sendEmail({
        to: notifyEmails,
        subject: `Early Logout Applied — ${dateDisplay} (${employees.length} employee${employees.length > 1 ? 's' : ''})`,
        html,
        text: `${actingName} (${roleLabel}) marked the following employees Present (early logout) for ${dateDisplay}: ${employees.join(', ')}`,
    });
};

module.exports = {
    sendEmail,
    sendShiftChangeEmail,
    sendLeaveStatusEmail,
    sendEmployeeUpdateEmail,
    sendNoticeBoardEmail,
    sendAnnouncementEmail,
    sendHolidayEmail,
    sendPasswordResetOtpEmail,
    sendEmployeeCredentialsEmail,
    sendNewJoinerEmail,
    sendLeaveAppliedEmail,
    sendTicketCreatedEmail,
    sendTicketStatusEmail,
    sendManualEmail,
    sendOfferLinkEmail,
    sendOfferLetterEmail,
    sendBreakOvertimeEmail,
    sendBreakEndedEmail,
    sendEarlyLogoutAppliedEmail,
};
