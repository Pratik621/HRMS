// backend/services/offerLetterService.js
// Orchestrates offer-letter generation for both Flow A (HR-triggered, from
// /admin/employees) and Flow B (automatic, from the onboarding auto-approval path) so the
// two can never diverge: resolve employee + form input -> validate -> compute salary
// breakdown -> render PDF -> upload -> persist an employee_offer_letters row.

const supabase = require('../config/supabase');
const { uploadFile } = require('../lib/supabaseStorage');
const { getCompanyInfo } = require('../config/companyInfo');
const { calculateSalaryBreakdown } = require('./offerLetterSalaryService');
const { generateOfferLetterPdf } = require('./offerLetterPdfService');
const { amountToIndianWords } = require('../utils/numberToWords');

// Minimum fields required to render a *correct* letter — not every DB column.
// { field: key on the resolved input, label: shown to HR in the missing-fields banner }
const REQUIRED_FIELDS = [
    { field: 'employeeName', label: 'Employee name' },
    { field: 'recipientEmail', label: 'Employee email' },
    { field: 'designation', label: 'Designation' },
    { field: 'dateOfJoining', label: 'Date of Joining' },
    { field: 'workLocation', label: 'Work Location' },
    { field: 'annualCTC', label: 'Annual CTC' },
];

const fmtDateDDMMYYYY = (value) => {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString('en-GB'); // DD/MM/YYYY
};

const employeeFullName = (employee) =>
    [employee?.first_name, employee?.middle_name, employee?.last_name].filter(Boolean).join(' ').trim();

const titleFromGender = (gender) => {
    if (gender === 'male') return 'Mr.';
    if (gender === 'female') return 'Ms.';
    return '';
};

// Merges the employee record with HR-provided overrides into one resolved "input" shape —
// used both to compute missing fields and to build the final PDF letter_data.
const resolveInput = (employee, formInput = {}) => {
    const annualCTC = formInput.annualCTC != null
        ? Number(formInput.annualCTC)
        : (employee?.gross_salary != null ? Math.round(Number(employee.gross_salary) * 12) : null);
    const monthlyGross = formInput.monthlyGross != null
        ? Number(formInput.monthlyGross)
        : (annualCTC != null ? Math.round(annualCTC / 12) : null);

    return {
        employeeId: employee?.employee_id,
        employeeName: formInput.employeeName || employeeFullName(employee) || null,
        title: formInput.title !== undefined ? formInput.title : titleFromGender(employee?.gender),
        recipientEmail: formInput.recipientEmail || employee?.email || null,
        additionalEmail: formInput.additionalEmail || null,
        employeeLocation: formInput.employeeLocation
            || [employee?.city, employee?.state].filter(Boolean).join(', ')
            || employee?.address || null,
        designation: formInput.designation || employee?.designation || employee?.position || null,
        department: formInput.department || employee?.department || null,
        employmentType: formInput.employmentType || employee?.employment_type || null,
        dateOfJoining: fmtDateDDMMYYYY(formInput.dateOfJoining || employee?.joining_date),
        workLocation: formInput.workLocation || employee?.work_location || getCompanyInfo(employee).defaultWorkLocation,
        reportingManager: formInput.reportingManager || employee?.reporting_manager || null,
        annualCTC,
        monthlyGross,
        probationPeriod: formInput.probationPeriod || null,
        noticePeriod: formInput.noticePeriod || null,
        pfAmount: formInput.pfAmount != null ? Number(formInput.pfAmount) : employee?.pf_amount,
        professionalTaxAmount: formInput.professionalTaxAmount != null
            ? Number(formInput.professionalTaxAmount) : employee?.professional_tax_amount,
        signatoryName: formInput.signatoryName || null,
        signatoryDesignation: formInput.signatoryDesignation || null,
        letterDate: fmtDateDDMMYYYY(formInput.letterDate) || fmtDateDDMMYYYY(new Date()),
    };
};

const getMissingFields = (resolved) =>
    REQUIRED_FIELDS.filter(({ field }) => {
        const v = resolved[field];
        return v === null || v === undefined || v === '' || (typeof v === 'number' && Number.isNaN(v)) || (field === 'annualCTC' && !(v > 0));
    });

const buildLetterData = (employee, resolved) => {
    const company = { ...getCompanyInfo(employee) };
    if (resolved.signatoryName) company.signatoryName = resolved.signatoryName;
    if (resolved.signatoryDesignation) company.signatoryDesignation = resolved.signatoryDesignation;

    const salary = calculateSalaryBreakdown({
        grossMonthly: resolved.monthlyGross,
        pfAmount: resolved.pfAmount,
        professionalTaxAmount: resolved.professionalTaxAmount,
    });

    return {
        company,
        letterDate: resolved.letterDate,
        employeeName: resolved.employeeName,
        employeeFirstName: (employee?.first_name || resolved.employeeName.split(' ')[0] || '').trim(),
        employeeLocation: resolved.employeeLocation || company.defaultWorkLocation,
        title: resolved.title,
        designation: resolved.designation,
        dateOfJoining: resolved.dateOfJoining,
        workLocation: resolved.workLocation || company.defaultWorkLocation,
        probationPeriod: resolved.probationPeriod || company.defaultProbationPeriod,
        noticePeriod: resolved.noticePeriod || company.defaultNoticePeriod,
        annualCTCFormatted: `Rs. ${Math.round(resolved.annualCTC).toLocaleString('en-IN')}`,
        annualCTCWords: amountToIndianWords(resolved.annualCTC),
        salary,
    };
};

// Generates + uploads the PDF and persists a `generated` employee_offer_letters row.
// Throws (with a `missingFields` property) if required data is incomplete — callers must
// never generate/send a partial letter.
const generateAndStoreOfferLetter = async ({ employee, formInput, generatedBy, generatedByName }) => {
    const resolved = resolveInput(employee, formInput);
    const missingFields = getMissingFields(resolved);
    if (missingFields.length > 0) {
        const err = new Error(`Missing required information: ${missingFields.map(f => f.label).join(', ')}`);
        err.missingFields = missingFields;
        throw err;
    }

    const letterData = buildLetterData(employee, resolved);
    const pdfBuffer = await generateOfferLetterPdf(letterData);

    const safeName = (resolved.employeeName || 'employee').replace(/[^a-z0-9]+/gi, '-');
    const { path: pdfPath, publicUrl } = await uploadFile(
        pdfBuffer, `${safeName}-Offer-Letter.pdf`, 'offer-letters', 'application/pdf',
    );

    const { data: row, error } = await supabase.from('employee_offer_letters').insert([{
        employee_id: employee.employee_id,
        letter_data: letterData,
        pdf_path: pdfPath,
        pdf_url: publicUrl,
        status: 'generated',
        primary_email: resolved.recipientEmail,
        additional_email: resolved.additionalEmail || null,
        generated_by: generatedBy || null,
        generated_by_name: generatedByName || null,
    }]).select().single();
    if (error) throw error;

    return { offerLetter: row, pdfBuffer, resolved, letterData };
};

module.exports = {
    REQUIRED_FIELDS,
    resolveInput,
    getMissingFields,
    buildLetterData,
    generateAndStoreOfferLetter,
};
