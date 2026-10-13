const PDFDocument = require('pdfkit');
const fs = require('fs');
const { getCompanyInfo } = require('../config/companyInfo');

const TITLES = { relieving: 'Relieving Letter', experience: 'Experience Letter' };
const clean = (value, max = 150) => String(value || '').trim().slice(0, max);
function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
    const date = new Date(value + 'T00:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
const formatDate = value => new Date(value + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
function resolveLetter(employee, input = {}) {
    const company = getCompanyInfo(employee);
    const type = input.type;
    const name = [employee.first_name, employee.middle_name, employee.last_name].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    const joiningDate = clean(employee.joining_date || input.joiningDate).slice(0, 10);
    const lastWorkingDate = clean(input.lastWorkingDate);
    const issueDate = clean(input.issueDate);
    const relievingDate = clean(input.relievingDate || lastWorkingDate);
    const designation = clean(input.designation || employee.designation || employee.position);
    const signatoryName = clean(input.signatoryName || company.signatoryName);
    const signatoryDesignation = clean(input.signatoryDesignation || company.signatoryDesignation);
    const fail = message => { const error = new Error(message); error.status = 400; throw error; };
    if (!TITLES[type]) fail('Choose Relieving Letter or Experience Letter.');
    if (!name) fail('Employee name is missing in the profile.');
    for (const [label, value] of [['Joining date', joiningDate], ['Last working date', lastWorkingDate], ['Issue date', issueDate], ...(type === 'relieving' ? [['Relieving effective date', relievingDate]] : [])]) {
        if (!validDate(value)) fail(label + ' must be a valid date.');
    }
    if (lastWorkingDate < joiningDate) fail('Last working date cannot precede joining date.');
    if (issueDate < lastWorkingDate) fail('Issue date cannot precede last working date.');
    if (type === 'relieving' && relievingDate < lastWorkingDate) fail('Relieving effective date cannot precede last working date.');
    if (!designation) fail('Designation is required.');
    if (!signatoryName || !signatoryDesignation) fail('Signatory name and designation are required.');
    const gender = clean(input.pronouns || employee.gender).toLowerCase();
    const pronoun = gender === 'male' || gender === 'he' ? { subject: 'he', object: 'him', possessive: 'his', title: 'Mr. ' }
        : gender === 'female' || gender === 'she' ? { subject: 'she', object: 'her', possessive: 'her', title: 'Ms. ' }
        : { subject: 'they', object: 'them', possessive: 'their', title: '' };
    return { type, title: TITLES[type], name, employeeId: employee.employee_id, joiningDate, lastWorkingDate, issueDate, relievingDate,
        designation, signatoryName, signatoryDesignation, pronoun, company, includeStamp: input.includeStamp === true };
}
function buildParagraphs(letter) {
    const l = letter, p = l.pronoun;
    const first = 'This is to certify that ' + (l.type === 'relieving' ? p.title : '') + l.name + ' was employed with ' + l.company.name + ' as ' + l.designation + ' from ' + formatDate(l.joiningDate) + ' to ' + formatDate(l.lastWorkingDate) + '.';
    if (l.type === 'experience') return [first,
        'During ' + p.possessive + ' tenure, we found ' + p.object + ' to be hardworking and honest, and ' + p.possessive + ' services were satisfactory.',
        'We wish ' + p.object + ' all the best in ' + p.possessive + ' future endeavors.'];
    return [first,
        p.subject[0].toUpperCase() + p.subject.slice(1) + (p.subject === 'they' ? ' have' : ' has') + ' been relieved from ' + p.possessive + ' duties with effect from ' + formatDate(l.relievingDate) + '. During ' + p.possessive + ' tenure with the organization, we found ' + p.object + ' to be hardworking, honest, and dedicated to ' + p.possessive + ' responsibilities. ' + p.possessive[0].toUpperCase() + p.possessive.slice(1) + ' overall performance and services were satisfactory.',
        'We thank ' + p.object + ' for ' + p.possessive + ' contributions to the organization and wish ' + p.object + ' all the very best in ' + p.possessive + ' future endeavors.'];
}
// Typography and emphasis follow the supplied Relieving -2026 Updated.docx.
const RELIEVING_STYLE = { titleSize: 24, subtitleSize: 12, bodySize: 12, left: 60, right: 60 };
function ordinalDate(value) {
    const day = Number(value.slice(-2));
    const suffix = day % 100 >= 11 && day % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[day % 10] || 'th');
    return formatDate(value).replace(/^\d+/, day + suffix);
}
function relievingRuns(letter) {
    const l = letter, p = l.pronoun;
    const run = (text, bold = false) => ({ text, bold });
    const article = /^[aeiou]/i.test(l.designation) ? 'an' : 'a';
    return [
        [run('This is to certify that '), run(p.title + l.name, true), run(' was employed with '), run(l.company.name, true),
            run(' as ' + article + ' '), run(l.designation, true), run(' from '),
            run(ordinalDate(l.joiningDate) + ' to ' + ordinalDate(l.lastWorkingDate), true), run('.')],
        [run(p.subject[0].toUpperCase() + p.subject.slice(1) + (p.subject === 'they' ? ' have' : ' has') + ' been relieved from ' + p.possessive + ' duties with effect from '),
            run(ordinalDate(l.relievingDate), true),
            run('. During ' + p.possessive + ' tenure with the organization, we found ' + p.object + ' to be hardworking, honest, and dedicated to ' + p.possessive + ' responsibilities. ' + p.possessive[0].toUpperCase() + p.possessive.slice(1) + ' overall performance and services were satisfactory.')],
        [run('We thank ' + p.object + ' for ' + p.possessive + ' contributions to the organization and wish ' + p.object + ' all the very best in ' + p.possessive + ' future endeavors.')],
    ];
}
function drawRelieving(doc, letter) {
    const pw = doc.page.width, width = pw - 120;
    // Peach letterhead motif and pale company watermark from the reference.
    doc.save().fillColor('#fff0e7').circle(-65, 95, 152).fill().restore();
    if (letter.company.logoPath && fs.existsSync(letter.company.logoPath)) {
        doc.image(letter.company.logoPath, (pw - 216) / 2, 16, { width: 216 });
        doc.save().opacity(0.08).image(letter.company.logoPath, (pw - 350) / 2, 223, { width: 350 }).restore();
    } else {
        doc.font('Helvetica-Bold').fontSize(24).fillColor(letter.company.accentColor).text(letter.company.name, 60, 20, { width, align: 'center' });
    }
    doc.fillColor('#000').font('Times-Bold').fontSize(12).text('Date: ' + ordinalDate(letter.issueDate), 60, 76, { width });
    doc.fontSize(RELIEVING_STYLE.titleSize).text('RELIEVING LETTER', 134, 149, { width: doc.page.width - 194, align: 'left', underline: true });
    doc.fontSize(RELIEVING_STYLE.subtitleSize).text('TO WHOMSOEVER IT MAY CONCERN', 138, 190, { width: doc.page.width - 198, align: 'left', underline: true });
    doc.fontSize(RELIEVING_STYLE.bodySize); doc.x = 60; doc.y = 219;
    const paragraphs = relievingRuns(letter);
    paragraphs.forEach((runs, index) => {
        for (let i = 0; i < runs.length; i++) {
            doc.font(runs[i].bold ? 'Times-Bold' : 'Times-Roman').text(runs[i].text, { width, lineGap: 2, continued: i < runs.length - 1 });
        }
        doc.moveDown(index === 0 ? 1 : 1.05);
    });
    doc.font('Times-Roman').text('For ', { continued: true }); doc.font('Times-Bold').text(letter.company.name);
    if (letter.includeStamp && letter.company.stampPath && fs.existsSync(letter.company.stampPath)) {
        doc.image(letter.company.stampPath, 72, doc.y + 15, { fit: [55, 60] }); doc.moveDown(6);
    } else doc.moveDown(3);
    doc.font('Times-Bold').fontSize(12).text(letter.signatoryName); doc.font('Times-Roman').text(letter.signatoryDesignation);
    doc.fontSize(9).fillColor('#64748b').text(letter.company.addressLines.join(' '), 60, doc.page.height - 76, { width, align: 'center' });
}

function generatePdf(letter) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'LETTER', margins: { top: 56, bottom: 56, left: 56, right: 56 }, info: { Title: letter.title, Author: letter.company.name } });
        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
        if (letter.type === 'relieving') { drawRelieving(doc, letter); doc.end(); return; }

        const width = doc.page.width - 144;
        doc.save().fillColor('#fff0e7').circle(-55,95,152).fill().restore();
        if (letter.company.logoPath && fs.existsSync(letter.company.logoPath)) {
            doc.image(letter.company.logoPath,(doc.page.width-216)/2,16,{width:216});
            doc.save().opacity(0.08).image(letter.company.logoPath,(doc.page.width-350)/2,218,{width:350}).restore();
        }
        doc.fillColor('#000').font('Helvetica-Bold').fontSize(11).text('Date '+ordinalDate(letter.issueDate),72,76,{width});
        doc.text('EXPERIENCE LETTER',72,90,{width,align:'center',underline:true});
        doc.text('TO WHOMSOEVER IT MAY CONCERN',72,132,{width,align:'center',underline:true});
        doc.x=72;doc.y=188;
        const runs=relievingRuns(letter)[0].map(run=>({...run}));runs[1].text=letter.name;
        runs.forEach((run,i)=>doc.font(run.bold?'Helvetica-Bold':'Helvetica').text(run.text,{width,lineGap:3,continued:i<runs.length-1}));
        doc.font('Helvetica').text(buildParagraphs(letter)[1],72,doc.y,{width,lineGap:3});doc.moveDown(3);
        doc.text(buildParagraphs(letter)[2],{width,lineGap:3});doc.moveDown(2.5);
        doc.font('Helvetica-Bold').text(letter.company.name);
        if(letter.includeStamp && letter.company.stampPath && fs.existsSync(letter.company.stampPath)) {doc.image(letter.company.stampPath,84,doc.y+12,{fit:[55,60]});doc.moveDown(6);} else doc.moveDown(3);
        doc.font('Helvetica-Bold').text(letter.signatoryName);doc.font('Helvetica').text(letter.signatoryDesignation);
        doc.fontSize(9).fillColor('#64748b').text(letter.company.addressLines.join(' '),72,doc.page.height-76,{width,align:'center'});
        doc.end();
    });
}
module.exports = { TITLES, validDate, formatDate, resolveLetter, buildParagraphs, generatePdf, ordinalDate, relievingRuns, RELIEVING_STYLE };
