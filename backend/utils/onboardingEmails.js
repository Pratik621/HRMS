const emailService = require('../services/emailService');

// Await both sends before ending the request. Email failures must not undo the account.
async function sendOnboardingEmails(supabase, { employee, credentials, offerLetterAttachment }) {
    try {
        const result = await emailService.sendEmployeeCredentialsEmail(employee, credentials, offerLetterAttachment);
        if (!result?.success) console.error('[onboardingEmails] employee email failed:', result?.reason || result?.error);
    } catch (error) {
        console.error('[onboardingEmails] employee email failed:', error.message);
    }

    try {
        const { data, error } = await supabase.from('employees')
            .select('email')
            .eq('department', 'IT')
            .eq('is_active', true);
        if (error) throw error;
        const recipients = [...new Set((data || []).map(row => (row.email || '').trim().toLowerCase()).filter(Boolean))];
        if (!recipients.length) {
            console.warn('[onboardingEmails] IT notification skipped: no active IT email recipients');
            return;
        }
        const result = await emailService.sendITNewJoinerEmail(recipients, employee);
        if (!result?.success) console.error('[onboardingEmails] IT email failed:', result?.reason || result?.error);
    } catch (error) {
        console.error('[onboardingEmails] IT email failed:', error.message);
    }
}

module.exports = { sendOnboardingEmails };
