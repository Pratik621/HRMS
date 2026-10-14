// backend/services/offerLetterContent.js
// Structured content blocks for the offer letter body (pages 1-8), transcribed verbatim
// from the supplied Appointment Letter-B2BinDemand.pdf reference, with only the
// employee/company-specific values made dynamic. Do not rewrite the clause wording —
// per the business requirement, this is the legal/policy template, not marketing copy.
//
// Block types consumed by offerLetterPdfService.js's renderer:
//   { type: 'h1',   text }              - top-level numbered section heading
//   { type: 'lead', num, text }         - "1.1 ..." style clause (bold number + text)
//   { type: 'para', text }              - plain paragraph
//   { type: 'bullet', text }            - indented bullet point
//   { type: 'space', size }             - vertical spacing
//   { type: 'hr' }                      - thin divider rule

const buildOpeningBlocks = (d) => ([
    { type: 'para', text: 'To,' },
    { type: 'para', text: `${d.title ? d.title + ' ' : ''}${d.employeeName.toUpperCase()}` },
    { type: 'para', text: d.employeeLocation },
    { type: 'space', size: 6 },
    { type: 'hr' },
    { type: 'space', size: 6 },
    { type: 'para', text: `Dear ${d.employeeFirstName},` },
    { type: 'space', size: 4 },
    { type: 'h1', text: `Welcome to the ${d.company.name} family!` },
    { type: 'para', text: `We are delighted to offer you the position of ${d.designation} at ${d.company.legalName}, effective from ${d.dateOfJoining}.` },
    { type: 'para', text: `At ${d.company.name}, we strive to create a dynamic and high-energy work environment that encourages growth, ownership, and innovation. We are confident that you will be a valuable addition to our team and will contribute positively to our shared vision.` },
    { type: 'para', text: 'Below are the terms and conditions of your appointment:' },
]);

const buildSectionBlocks = (d) => ([
    { type: 'h1', text: '1. Position & Compensation' },
    { type: 'lead', num: '1.1', text: `You are appointed as ${d.designation}.` },
    { type: 'lead', num: '1.2', text: `Your Date of Joining will be ${d.dateOfJoining}. If you are unable to join on the mentioned date, this offer will stand automatically revoked unless an extension is formally approved in writing.` },
    { type: 'lead', num: '1.3', text: `Your Annual Cost to Company (CTC) will be ${d.annualCTCFormatted}/- (Rupees ${d.annualCTCWords} Only).` },
    { type: 'lead', num: '1.4', text: "In addition, you will be eligible for performance-based variable incentives, which are determined by individual and company performance, in accordance with the company's incentive policy." },
    { type: 'lead', num: '1.5', text: `You will be based at our ${d.workLocation} office but may be required to serve at any location within or outside India where the company or its affiliates operate.` },
    { type: 'hr' },

    { type: 'h1', text: '2. Conditions of Employment' },
    { type: 'para', text: 'Your employment is subject to the following conditions:' },
    { type: 'lead', num: '2.1', text: 'The accuracy and authenticity of all documents, certificates, and information shared by you during the recruitment process.' },
    { type: 'lead', num: '2.2', text: 'You should not be bound by any contractual obligation or restriction that would prevent you from joining us on the agreed date.' },
    { type: 'lead', num: '2.3', text: 'You are required to submit a copy of your resignation acceptance from your current employer, via email or hard copy, within 10 calendar days of receiving this letter.' },
    { type: 'lead', num: '2.4', text: 'Your appointment is subject to satisfactory references from two professional contacts and background verification conducted by our team.' },
    { type: 'hr' },

    { type: 'h1', text: '3. Probation and Notice Period' },
    { type: 'lead', num: '3.1', text: `You will be placed under a probationary period of ${d.probationPeriod} from your date of joining.` },
    { type: 'lead', num: '3.2', text: 'Upon satisfactory completion of the probation period, your employment will be confirmed. During the probationary period, if your performance does not meet the expected standards, or if there are instances of excessive absenteeism, misconduct, or behavioral issues, the company reserves the right to terminate your employment in accordance with applicable company policy and law.' },
    { type: 'lead', num: '3.3', text: 'The company reserves the right to extend the probation period if your performance is not found to be satisfactory. You will be duly informed in writing in such instances.' },
    { type: 'lead', num: '3.4', text: `Should you choose to resign from your position, a ${d.noticePeriod} notice period is mandatory. The company may, at its discretion and subject to applicable policy, accept a notice-period buyout or waive part or all of the notice period.` },
    { type: 'hr' },

    { type: 'h1', text: '4. Exit Policy' },
    { type: 'lead', num: '4.1', text: 'If you decide to resign from your position, you must submit a formal resignation letter in writing to your Reporting Manager or HR representative.' },
    { type: 'lead', num: '4.2', text: `A notice period of ${d.noticePeriod} must be served after resignation, subject to the company's acceptance and applicable policy.` },
    { type: 'lead', num: '4.3', text: 'Upon successful completion of the notice period and proper handover of responsibilities, you will be provided with relieving documentation and applicable final settlement, subject to completion of all exit formalities.' },
    { type: 'lead', num: '4.4', text: 'The company reserves the right to terminate employment for reasons including misconduct, breach of confidentiality, fraud, serious policy violations, or other legitimate grounds, subject to applicable law and company policy.' },
    { type: 'lead', num: '4.5', text: 'In cases where an employee absconds without proper resignation or completion of the applicable notice period, the company may take appropriate action in accordance with company policy and applicable law.' },
    { type: 'hr' },

    { type: 'h1', text: '5. Notice Period' },
    { type: 'para', text: `Upon resignation, you are required to provide ${d.noticePeriod} notice. The company may, at its discretion and subject to applicable policy, accept a notice-period buyout or waive part or all of the notice period.` },
    { type: 'hr' },

    { type: 'h1', text: '6. Leave Policy' },
    { type: 'para', text: '6.1 Probation Period', bold: true },
    { type: 'bullet', text: 'During the first three (3) months of employment, which constitutes the probation period, employees are generally not eligible to avail regular leave.' },
    { type: 'bullet', text: 'Leave during the probation period may be considered only for genuine and unavoidable reasons, subject to prior approval from the Reporting Manager/Senior Management.' },
    { type: 'bullet', text: 'Where applicable, supporting documents may be required for approval.' },
    { type: 'bullet', text: 'Unauthorized absence during the probation period may be treated as leave without pay and may be subject to disciplinary action as per company policy.' },
    { type: 'para', text: '6.2 Leave Eligibility After Probation', bold: true },
    { type: 'bullet', text: 'Upon successful completion of the three-month probation period, employees will be eligible for two (2) leaves per month.' },
    { type: 'bullet', text: "The applicable leave entitlement will be credited/available after successful completion of probation, subject to the company's leave approval process." },
    { type: 'bullet', text: 'Leave must be applied for in advance wherever reasonably possible and must be approved by the Reporting Manager/HR.' },
    { type: 'bullet', text: 'Emergency or sick leave should be communicated to the Reporting Manager as soon as reasonably practicable.' },
    { type: 'para', text: '6.3 Leave Carry Forward', bold: true },
    { type: 'bullet', text: 'Employees may carry forward up to six (6) unused leaves to the next calendar year.' },
    { type: 'bullet', text: 'Any leave exceeding the permitted carry-forward limit will lapse unless otherwise approved by the management.' },
    { type: 'bullet', text: "Leave carry-forward is subject to the company's applicable leave policy." },
    { type: 'para', text: '6.4 Sick Leave', bold: true },
    { type: 'bullet', text: 'Sick leave may be availed after successful completion of the probation period.' },
    { type: 'bullet', text: 'The company may require appropriate medical documentation where necessary, particularly for extended or repeated absence.' },
    { type: 'para', text: '6.5 Compensatory Off', bold: true },
    { type: 'bullet', text: 'Employees may be eligible for a Compensatory Off (Comp Off) for working on approved holidays or beyond normal working hours, subject to prior authorization.' },
    { type: 'bullet', text: 'Comp Off must be availed within six (6) months from the date it is credited, unless otherwise approved by management.' },
    { type: 'para', text: '6.6 Leave Without Pay', bold: true },
    { type: 'para', text: 'Any absence beyond the applicable leave entitlement or without proper approval may be treated as Leave Without Pay (LWP).' },
    { type: 'para', text: '6.7 Leave Encashment', bold: true },
    { type: 'para', text: 'Leaves cannot be encashed unless specifically provided for under applicable company policy or law.' },
    { type: 'hr' },

    { type: 'h1', text: '7. Performance-Based Incentives (PBI)' },
    { type: 'para', text: 'Incentives are performance-based and may be determined by:' },
    { type: 'bullet', text: 'Individual performance' },
    { type: 'bullet', text: 'Client requirements' },
    { type: 'bullet', text: 'Market conditions' },
    { type: 'bullet', text: 'Company performance' },
    { type: 'bullet', text: 'Applicable incentive policy' },
    { type: 'hr' },

    { type: 'h1', text: '8. Additional Leave Notes' },
    { type: 'bullet', text: 'All leaves are subject to approval by the Reporting Manager/HR.' },
    { type: 'bullet', text: 'Employees are expected to plan and apply for leave in advance wherever possible.' },
    { type: 'bullet', text: 'Unauthorized absence may result in disciplinary action as per company policy.' },
    { type: 'bullet', text: 'The company reserves the right to modify its leave policy in accordance with business requirements and applicable law.' },
    { type: 'hr' },

    { type: 'h1', text: '9. Employee Referral Policy' },
    { type: 'para', text: 'You will be eligible for the employee referral benefit only if all of the following conditions are met:' },
    { type: 'lead', num: '9.1', text: 'You personally refer and schedule the candidate, and the candidate attends the interview on time.' },
    { type: 'lead', num: '9.2', text: 'The candidate successfully clears all interview rounds and receives an official offer from HR.' },
    { type: 'lead', num: '9.3', text: `The candidate joins ${d.company.name} on the given joining date.` },
    { type: 'lead', num: '9.4', text: 'The candidate completes a minimum of 180 calendar days of continuous service.' },
    { type: 'hr' },

    { type: 'h1', text: '10. Employment Terms & Conduct' },
    { type: 'bullet', text: `References to "Company" refer to ${d.company.name}.` },
    { type: 'bullet', text: "You are expected to support the company's goals and contribute positively to its growth." },
    { type: 'bullet', text: 'You must adhere to all company policies and uphold its reputation at all times.' },
    { type: 'hr' },

    { type: 'h1', text: '11. Additional Terms of Employment' },
    { type: 'para', text: '11.1 Transferability', bold: true },
    { type: 'para', text: 'Your employment is transferable, and the company reserves the right to transfer you to any of its locations, departments, or associated entities as per business requirements.' },
    { type: 'para', text: '11.2 Full-Time Commitment & Confidentiality', bold: true },
    { type: 'para', text: 'You are expected to devote your full working time and attention to the duties assigned and must maintain strict confidentiality of all company-related and sensitive information, in accordance with the employment agreement and applicable confidentiality obligations.' },
    { type: 'para', text: '11.3 Schedule & Address Updates', bold: true },
    { type: 'bullet', text: 'You are required to follow your assigned work schedule diligently.' },
    { type: 'bullet', text: 'Any change in your residential address or contact details must be communicated to HR in writing.' },
    { type: 'bullet', text: 'The company will not be responsible for missed communication due to outdated contact information.' },
    { type: 'para', text: '11.4 Confirmation of Employment', bold: true },
    { type: 'para', text: 'Your confirmation is subject to satisfactory performance and completion of the probation period in accordance with company policy.' },
    { type: 'para', text: '11.5 Termination of Employment', bold: true },
    { type: 'para', text: 'Your employment may be terminated in accordance with applicable company policy and law if your conduct or performance is not in line with company expectations. This may include:' },
    { type: 'bullet', text: 'Unauthorized or unreported absenteeism' },
    { type: 'bullet', text: 'Misconduct or unprofessional behavior' },
    { type: 'bullet', text: 'Fraud, data tampering, or ethical breaches' },
    { type: 'bullet', text: "Violence, intoxication, or actions damaging to the company's reputation or business interests" },
    { type: 'para', text: '11.6 Leave Policy Compliance', bold: true },
    { type: 'bullet', text: 'For emergency leave, inform your Reporting Manager as soon as reasonably practicable and, where possible, at least 60 minutes before your shift.' },
    { type: 'bullet', text: 'Failure to follow the applicable procedure may result in the absence being treated as unauthorized and may be subject to disciplinary action as per company policy.' },
    { type: 'para', text: '11.7 Full & Final Settlement', bold: true },
    { type: 'para', text: "Upon separation from the company, applicable dues such as salary, incentives, and arrears will be settled in accordance with the company's Full & Final Settlement process and applicable law." },
    { type: 'hr' },

    // Reference document has this as a heading-only section (no body text beneath it
    // before "13. Code of Conduct") — preserved exactly as supplied, not expanded.
    { type: 'h1', text: '12. Confidentiality & Breach of Trust' },
    { type: 'hr' },

    { type: 'h1', text: '13. Code of Conduct' },
    { type: 'para', text: `You are expected to work with dedication, responsibility, and professionalism at all times. Your conduct should reflect the values and goals of ${d.company.name}.` },
    { type: 'para', text: `Any action or behavior that compromises the reputation or objectives of ${d.company.name} may result in appropriate disciplinary action in accordance with company policy and applicable law.` },
    { type: 'hr' },

    { type: 'h1', text: '14. Salary Calculation / Structure' },
    { type: 'bullet', text: "Your monthly salary is calculated based on the number of actual working days in the month, subject to the company's payroll policy." },
    { type: 'bullet', text: 'Saturdays and Sundays are treated as weekly holidays unless otherwise scheduled by the company.' },
    { type: 'bullet', text: 'If you are required to work on a Saturday or Sunday with prior authorization, compensation or Comp Off will be provided in accordance with applicable company policy.' },
    { type: 'hr' },

    { type: 'h1', text: '15. Review of Remuneration' },
    { type: 'bullet', text: "Your salary may be reviewed annually based on your individual performance, business performance, and supervisor's feedback." },
    { type: 'bullet', text: 'Salary details are confidential and should be handled in accordance with company policy.' },
    { type: 'hr' },

    { type: 'h1', text: '16. Additional Notes' },
    { type: 'bullet', text: `For any complaints or suggestions, you may write to ${d.company.hrEmail}.` },
    { type: 'bullet', text: 'The company does not provide salary advances under its current policy.' },
    { type: 'bullet', text: 'Requests for early salary credit, including during festivals or special occasions, will be considered only if permitted by company policy.' },
    { type: 'hr' },

    { type: 'h1', text: '17. Terms & Conditions' },
    { type: 'bullet', text: `The terms outlined in this appointment letter shall remain valid throughout your tenure with ${d.company.name}, subject to applicable law and company policy.` },
    { type: 'bullet', text: 'The company may update its policies from time to time based on business requirements and applicable legal requirements.' },
    { type: 'bullet', text: 'Any material updates or changes will be communicated through an official company communication.' },
]);

const buildAcknowledgmentBlocks = (d) => ([
    { type: 'h1', text: '18. Acknowledgment' },
    { type: 'para', text: 'Please sign and return a duplicate copy of this letter as a token of your acceptance of the above terms and conditions.' },
    { type: 'space', size: 20 },
    { type: 'para', text: `For ${d.company.legalName}`, bold: true },
    { type: 'space', size: 24 },
    { type: 'para', text: 'Authorized Signatory:' },
    { type: 'space', size: 4 },
    { type: 'para', text: `Name: ${d.company.signatoryName}` },
    { type: 'para', text: `Designation: ${d.company.signatoryDesignation}` },
    { type: 'space', size: 16 },
    { type: 'para', text: 'Employee Acceptance', bold: true },
    { type: 'space', size: 4 },
    { type: 'para', text: `I, ${d.title || ''} ${d.employeeName}, have read and understood the above terms and conditions and hereby accept the appointment offered to me by ${d.company.legalName.replace(/\.$/, '')}.` },
    { type: 'space', size: 20 },
    { type: 'para', text: 'Employee Signature: _________________________' },
    { type: 'space', size: 10 },
    { type: 'para', text: `Employee Name: ${d.employeeName}` },
    { type: 'space', size: 10 },
    { type: 'para', text: 'Date: ______________________________________' },
]);

const buildBlocks = (d) => ([
    ...buildOpeningBlocks(d),
    ...buildSectionBlocks(d),
    { type: 'pagebreak' },
    ...buildAcknowledgmentBlocks(d),
]);

module.exports = { buildBlocks };
