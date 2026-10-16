// Persist the account link before sending credentials or raising tickets.
async function saveOnboardingApproval(supabase, offerId, values) {
    const { error } = await supabase.from('employee_offer_links')
        .update(values).eq('id', offerId);
    if (error) {
        const failure = new Error('Employee account was created, but the offer status could not be saved. Do not create another account; contact support to link the existing employee.');
        failure.cause = error;
        throw failure;
    }
}
module.exports = { saveOnboardingApproval };
