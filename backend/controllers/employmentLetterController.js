const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const previewSecret = () => crypto.createHmac('sha256', process.env.JWT_SECRET).update('employment-letter-preview').digest('hex');
const supabase = require('../config/supabase');
const { sendEmail } = require('../services/emailService');
const { getCompanyInfo } = require('../config/companyInfo');
const { resolveLetter, generatePdf } = require('../services/employmentLetterService');
const authorized = req => ['admin', 'hr'].includes(req.user?.role);
const getEmployee = async id => { const { data, error } = await supabase.from('employees').select('*').eq('employee_id', id).maybeSingle(); if (error) throw error; return data; };
const filename = letter => letter.type + '_letter_' + String(letter.employeeId).replace(/[^a-zA-Z0-9_-]/g, '_') + '.pdf';
exports.defaults = async (req, res) => {
    if (!authorized(req)) return res.status(403).json({ success: false, message: 'Only HR and admin can issue employment letters.' });
    try {
        const employee = await getEmployee(req.params.employeeId);
        if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });
        const company = getCompanyInfo(employee);
        return res.json({ success: true, defaults: { name: [employee.first_name, employee.middle_name, employee.last_name].filter(Boolean).join(' '), joiningDate: employee.joining_date?.slice(0, 10) || '', designation: employee.designation || employee.position || '', email: employee.email || '', company: company.name, signatoryName: company.signatoryName, signatoryDesignation: company.signatoryDesignation, pronouns: String(employee.gender || '').toLowerCase() === 'male' ? 'he' : String(employee.gender || '').toLowerCase() === 'female' ? 'she' : 'they' } });
    } catch (error) { return res.status(500).json({ success: false, message: 'Unable to load letter details' }); }
};
exports.preview = async (req, res) => {
    if (!authorized(req)) return res.status(403).json({ success: false, message: 'Only HR and admin can issue employment letters.' });
    try {
        const employee = await getEmployee(req.params.employeeId);
        if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });
        const letter = resolveLetter(employee, req.body);
        const pdf = await generatePdf(letter);
        const token = jwt.sign({ purpose: 'employment-letter', employeeId: employee.employee_id, actor: req.user.employeeId,
            pdf: pdf.toString('base64'), filename: filename(letter), title: letter.title }, previewSecret(), { expiresIn: '15m', algorithm: 'HS256' });
        return res.json({ success: true, pdfBase64: pdf.toString('base64'), filename: filename(letter), previewToken: token });
    } catch (error) { return res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'Unable to generate letter' }); }
};
exports.send = async (req, res) => {
    if (!authorized(req)) return res.status(403).json({ success: false, message: 'Only HR and admin can issue employment letters.' });
    try {
        let preview;
        try { preview = jwt.verify(req.body.previewToken, previewSecret(), { algorithms: ['HS256'] }); }
        catch { return res.status(400).json({ success: false, message: 'Preview expired or invalid. Generate the PDF again.' }); }
        if (preview.purpose !== 'employment-letter' || preview.employeeId !== req.params.employeeId || preview.actor !== req.user.employeeId) return res.status(403).json({ success: false, message: 'This preview does not belong to this employee or issuer.' });
        const employee = await getEmployee(req.params.employeeId);
        if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(employee.email || '')) return res.status(400).json({ success: false, message: 'A valid employee email is required in the profile.' });
        const result = await sendEmail({ to: employee.email, subject: preview.title + ' - ' + getCompanyInfo(employee).name,
            text: 'Dear ' + employee.first_name + ',\n\nPlease find your ' + preview.title.toLowerCase() + ' attached.\n\nRegards,\nHR Department', attachments: [{ filename: preview.filename, content: preview.pdf }] });
        if (!result.success) return res.status(502).json({ success: false, message: 'Email was not sent. Please retry or contact your administrator.' });
        return res.json({ success: true, message: 'Letter emailed to ' + employee.email });
    } catch { return res.status(500).json({ success: false, message: 'Unable to send letter' }); }
};
