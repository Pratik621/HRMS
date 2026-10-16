// Match the bounded text columns in public.employees. Submissions use text
// columns, so validate before saving and again before copying legacy submissions.
const EMPLOYEE_TEXT_LIMITS = {
    first_name: 100, middle_name: 100, last_name: 100, email: 255,
    phone: 20, gender: 10, blood_group: 5, city: 100, state: 100,
    pincode: 10, designation: 100, department: 100, employment_type: 50,
    reporting_manager: 100, bank_account_name: 100, account_number: 50,
    ifsc_code: 20, branch_name: 100, pan_number: 20, aadhar_number: 20,
    uan: 22, emergency_contact: 20, emergency_contact_name: 255,
    emergency_contact_relation: 100,
};

function validateOnboardingEmployeeFields(values) {
    const fields = Object.entries(EMPLOYEE_TEXT_LIMITS).flatMap(([field, maxLength]) => {
        const value = values[field];
        if (value == null) return [];
        const actualLength = Array.from(String(value)).length;
        return actualLength > maxLength ? [{ field, maxLength, actualLength }] : [];
    });
    if (!fields.length) return null;
    return {
        success: false,
        message: `Please correct these fields before employee account creation: ${fields.map(({ field, maxLength, actualLength }) => `${field === 'uan' ? 'UAN (PF Number)' : field.replace(/_/g, ' ')} has ${actualLength} characters; maximum is ${maxLength}`).join('; ')}. Edit the submission in Offer Links and approve again.`,
        fields,
    };
}

module.exports = { validateOnboardingEmployeeFields };
