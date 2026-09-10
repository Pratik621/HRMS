// src/utils/salarySlipTemplate.js
// Shared salary-slip amount calculation + PDF HTML template — the single source of truth
// for what a slip's PF/PT/Professional Tax/net-salary numbers actually are, used by
// SalarySlipManager.jsx (Admin, per-employee), GeneratedSlipsTab.jsx (centralized Payroll
// module), and EditSlip.jsx (Admin, manual/localStorage slip prep) so none of them drift
// into different "views of the truth".
// Extracted out of SalarySlipManager.jsx rather than duplicated.
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Salary slips must show whole rupees only, on screen and in the downloaded PDF alike —
// round here (not just cap display digits) so both paths always agree on the same number.
export const fmtNum = (v) => new Intl.NumberFormat('en-IN').format(Math.round(Number(v) || 0));

export const fmtCurrency = (v) =>
  v != null
    ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(Number(v) || 0))
    : '₹0';

export const numberToWords = (num) => {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  if (!num || num === 0) return 'Zero';
  const n2w = (n) => {
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
    if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + n2w(n % 100) : '');
    if (n < 100000) return n2w(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + n2w(n % 1000) : '');
    if (n < 10000000) return n2w(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + n2w(n % 100000) : '');
    return n2w(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + n2w(n % 10000000) : '');
  };
  return n2w(Math.abs(Math.round(num)));
};

// Whether the PF/PT/Professional Tax deduction regime applies to a given slip period
// (May 2026 onwards) vs. the legacy flat ₹200 DT used before that.
export const isPFApplicablePeriod = (month, year) => {
  const m = parseInt(month || 0);
  const y = parseInt(year || 0);
  return y > 2026 || (y === 2026 && m >= 5);
};

// Returns PF/PT/Professional Tax/DT breakdown based on slip period and employee.pf_amount/pt_amount/professional_tax_amount:
// Before May 2026 → DT ₹200, PF/PT/Professional Tax ₹0
// May 2026 onwards → PF from emp.pf_amount (if set, including 0), PT from emp.pt_amount (if set, including 0),
// Professional Tax from emp.professional_tax_amount (if set, including 0, else 0 — no legacy default), else slip.dt - PT - Professional Tax
export const getDeductionBreakdown = (slip, emp) => {
  const isPFApplicable = isPFApplicablePeriod(slip?.month, slip?.year);
  if (isPFApplicable) {
    // PT no longer auto-defaults to ₹200 — admin must explicitly set it; unset = 0.
    const pt = emp?.pt_amount != null ? parseInt(emp.pt_amount) : 0;
    const professionalTax = emp?.professional_tax_amount != null ? parseInt(emp.professional_tax_amount) : 0;
    if (emp?.pf_amount != null) {
      return { pf: parseInt(emp.pf_amount), pt, professionalTax, dt: 0 };
    }
    const totalFixed = Number(slip?.dt) || (1800 + pt + professionalTax);
    return { pf: totalFixed - pt - professionalTax, pt, professionalTax, dt: 0 };
  }
  return { pf: 0, pt: 0, professionalTax: 0, dt: null }; // dt: null = use a.deduction from slip
};

export const getAmounts = (slip, emp) => {
  const monthlySalary = Number(slip?.monthly_salary) || Number(emp?.in_hand_salary) || Number(emp?.gross_salary) || 0;
  const basicSalaryRaw = Number(slip?.basic_salary) || 0;
  const netSalaryRaw = slip?.net_salary != null ? Number(slip.net_salary) : 0;
  // Old stub fix: basic_salary=0 but net>0 means manual adjustment slip — treat net as earned base
  const basicSalary = basicSalaryRaw > 0 ? basicSalaryRaw : (netSalaryRaw > 0 ? netSalaryRaw : monthlySalary);
  const hasEarnings = basicSalary > 0;
  const deduction = hasEarnings ? (Number(slip?.dt) || 200) : 0; // DT only
  const netSalary = netSalaryRaw > 0 ? netSalaryRaw : Math.max(0, basicSalary - deduction);
  const overtimeAmount = Number(slip?.overtime_amount) || 0;
  const overtimeHours = Number(slip?.overtime_hours) || 0;
  const presentDays = Number(slip?.present_days) || 0;
  const absentDays = Number(slip?.absent_days) || 0;
  const paidLeaveDays = Number(slip?.paid_leave_days) || 0;
  const unpaidLeaveDays = Number(slip?.unpaid_leave_days) || 0;
  const halfDays = Number(slip?.half_days) || 0;
  const totalWorkingDays = Number(slip?.total_working_days) || 22;
  const perDaySalary = Number(slip?.per_day_salary) || 0;
  const unpaidDeduction = Number(slip?.unpaid_deduction) || 0;
  return {
    monthlySalary, basicSalary, deduction, netSalary,
    overtimeAmount, overtimeHours,
    presentDays, absentDays, paidLeaveDays, unpaidLeaveDays, halfDays,
    totalWorkingDays, perDaySalary, unpaidDeduction,
  };
};

// PropCulture employees have pf_amount explicitly set to 0
export const isPropCulture = (emp) => emp?.pf_amount != null && parseInt(emp.pf_amount) === 0;

// Resolves which company branding a slip should use. `override` ('b2b' | 'pc'), when given,
// always wins over the pf_amount-based auto-detection below — needed by EditSlip.jsx, whose
// manual PF input field defaults to 0 (including for real employees whose actual pf_amount is
// null), which would otherwise get misread as "this is a PropCulture employee" by
// isPropCulture(). SalarySlipManager.jsx/GeneratedSlipsTab.jsx pass real DB-backed employee
// records and can safely omit `override` to keep using auto-detection.
export const resolveCompanyCode = (emp, override) =>
  (override === 'b2b' || override === 'pc') ? override : (isPropCulture(emp) ? 'pc' : 'b2b');

export const COMPANY = {
  b2b: {
    accent: '#1e3a5f',
    name: 'B2BinDemand',
    address: '8th Floor SkyVista, 805, Mhada Colony, Viman Nagar, Pune, Maharashtra 411014',
  },
  pc: {
    accent: '#0d7b6f',
    name: 'PropCulture',
    address: 'Pune, Maharashtra',
  },
};

// ── PDF HTML template ──────────────────────────────────────────────────────────
export const buildPDFHTML = (slip, emp, a, monthName, logoBase64, companyOverride) => {
  const bd = getDeductionBreakdown(slip, emp);
  const pfAmt = bd.pf;
  const ptAmt = bd.pt;
  const professionalTaxAmt = bd.professionalTax || 0;
  const dtAmt = bd.dt !== null ? bd.dt : a.deduction;
  const customDed = parseFloat(slip?.custom_deduction || 0);
  const coCode = resolveCompanyCode(emp, companyOverride);
  const isPC = coCode === 'pc';
  const co = COMPANY[coCode];
  const cycleLabel = slip.cycle_start_date && slip.cycle_end_date
    ? `${new Date(slip.cycle_start_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} – ${new Date(slip.cycle_end_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`
    : `${monthName} ${slip.year}`;

  return `
    <div style="border:1px solid #e2e8f0;padding:32px 36px;font-size:13px;color:#1e293b;font-family:Arial,sans-serif;">
      <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid ${co.accent};padding-bottom:20px;margin-bottom:20px;">
        <div>
          ${!isPC && logoBase64
            ? `<img src="data:image/jpeg;base64,${logoBase64}" style="height:52px;width:auto;object-fit:contain;" />`
            : `<div style="font-size:22px;font-weight:900;color:${co.accent};letter-spacing:1px;">${co.name}</div>`}
          <div style="font-size:11px;color:#64748b;margin-top:6px;max-width:280px;">${co.address}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:18px;font-weight:800;text-transform:uppercase;letter-spacing:2px;color:${co.accent};">Salary Slip</div>
          <div style="font-size:13px;color:#475569;margin-top:4px;">${monthName} ${slip.year}</div>
          <div style="font-size:11px;color:#94a3b8;margin-top:2px;">Pay Cycle: ${cycleLabel}</div>
        </div>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:12.5px;background:#f8fafc;border-radius:8px;">
        <tr>
          <td style="padding:8px 14px;width:50%;"><span style="color:#64748b;">Employee Name</span><br/><b style="color:#1e293b;">${(emp?.first_name || '')} ${(emp?.last_name || '')}</b></td>
          <td style="padding:8px 14px;width:50%;"><span style="color:#64748b;">Employee Code</span><br/><b style="color:#1e293b;">${emp?.employee_id || ''}</b></td>
        </tr>
        <tr>
          <td style="padding:8px 14px;"><span style="color:#64748b;">Designation</span><br/><b style="color:#1e293b;">${emp?.designation || emp?.position || 'N/A'}</b></td>
          <td style="padding:8px 14px;"><span style="color:#64748b;">Department</span><br/><b style="color:#1e293b;">${emp?.department || 'N/A'}</b></td>
        </tr>
        <tr>
          <td style="padding:8px 14px;"><span style="color:#64748b;">Date of Joining</span><br/><b style="color:#1e293b;">${emp?.joining_date ? new Date(emp.joining_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}</b></td>
          <td style="padding:8px 14px;"><span style="color:#64748b;">Bank Account</span><br/><b style="color:#1e293b;">${emp?.account_number ? `****${String(emp.account_number).slice(-4)}` : 'N/A'}</b></td>
        </tr>
        ${emp?.pan_number ? `<tr>
          <td style="padding:8px 14px;"><span style="color:#64748b;">PAN Number</span><br/><b style="color:#1e293b;">${emp.pan_number}</b></td>
          <td style="padding:8px 14px;"></td>
        </tr>` : ''}
      </table>

      <div style="background:#f1f5f9;border-radius:8px;padding:14px 18px;margin-bottom:20px;">
        <div style="font-weight:700;font-size:12px;color:#475569;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;">Attendance Summary</div>
        <table style="width:100%;border-collapse:collapse;text-align:center;font-size:12px;">
          <tr>
            <th style="padding:6px;color:#64748b;font-weight:600;">Working Days</th>
            <th style="padding:6px;color:#64748b;font-weight:600;">Present</th>
            <th style="padding:6px;color:#64748b;font-weight:600;">Paid Leave</th>
            <th style="padding:6px;color:#64748b;font-weight:600;">Unpaid Leave</th>
            <th style="padding:6px;color:#64748b;font-weight:600;">Half Days</th>
            <th style="padding:6px;color:#64748b;font-weight:600;">Absent</th>
          </tr>
          <tr>
            <td style="padding:6px;font-weight:800;font-size:15px;color:#1e3a5f;">${a.totalWorkingDays}</td>
            <td style="padding:6px;font-weight:800;font-size:15px;color:#16a34a;">${a.presentDays}</td>
            <td style="padding:6px;font-weight:800;font-size:15px;color:#0369a1;">${a.paidLeaveDays}</td>
            <td style="padding:6px;font-weight:800;font-size:15px;color:#d97706;">${a.unpaidLeaveDays}</td>
            <td style="padding:6px;font-weight:800;font-size:15px;color:#7c3aed;">${a.halfDays}</td>
            <td style="padding:6px;font-weight:800;font-size:15px;color:#dc2626;">${a.absentDays}</td>
          </tr>
        </table>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <tr style="vertical-align:top;">
          <td style="width:49%;">
            <div style="font-weight:700;font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Earnings</div>
            <table style="width:100%;border-collapse:collapse;font-size:12.5px;">
              <tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:7px 0;color:#475569;">Monthly Salary (CTC)</td><td style="padding:7px 0;text-align:right;">₹${fmtNum(a.monthlySalary)}</td></tr>
              <tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:7px 0;color:#475569;">Earned Salary (${a.presentDays + a.paidLeaveDays} paid days)</td><td style="padding:7px 0;text-align:right;">₹${fmtNum(a.basicSalary)}</td></tr>
              ${a.overtimeAmount > 0 ? `<tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:7px 0;color:#16a34a;">Overtime (${a.overtimeHours}h @ ₹150/h)</td><td style="padding:7px 0;text-align:right;color:#16a34a;font-weight:700;">+₹${fmtNum(a.overtimeAmount)}</td></tr>` : ''}
              <tr style="background:#f8fafc;"><td style="padding:8px 4px;font-weight:700;color:#1e293b;">Gross Earnings</td><td style="padding:8px 4px;text-align:right;font-weight:700;color:#1e293b;">₹${fmtNum(a.basicSalary + a.overtimeAmount)}</td></tr>
            </table>
          </td>
          <td style="width:2%;"></td>
          <td style="width:49%;">
            <div style="font-weight:700;font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Deductions</div>
            <table style="width:100%;border-collapse:collapse;font-size:12.5px;">
              ${pfAmt > 0 ? `<tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:7px 0;color:#475569;">Provident Fund (PF)</td><td style="padding:7px 0;text-align:right;">₹${fmtNum(pfAmt)}</td></tr>` : ''}
              <tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:7px 0;color:#475569;">PT</td><td style="padding:7px 0;text-align:right;">₹${fmtNum(ptAmt)}</td></tr>
              ${professionalTaxAmt > 0 ? `<tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:7px 0;color:#475569;">Professional Tax</td><td style="padding:7px 0;text-align:right;">₹${fmtNum(professionalTaxAmt)}</td></tr>` : ''}
              <tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:7px 0;color:#475569;">TDS</td><td style="padding:7px 0;text-align:right;">₹0</td></tr>
              ${a.unpaidDeduction > 0 ? `<tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:7px 0;color:#dc2626;font-weight:600;">Absent Deduction (${a.absentDays > 0 ? a.absentDays + ' absent' : ''}${a.unpaidLeaveDays > 0 ? (a.absentDays > 0 ? ' + ' : '') + a.unpaidLeaveDays + ' unpaid leave' : ''} × ₹${fmtNum(a.perDaySalary)}/day)</td><td style="padding:7px 0;text-align:right;color:#dc2626;font-weight:700;">₹${fmtNum(a.unpaidDeduction)}</td></tr>` : ''}
              ${dtAmt > 0 ? `<tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:7px 0;color:#b45309;font-weight:600;">DT (Fixed Deduction)</td><td style="padding:7px 0;text-align:right;color:#b45309;font-weight:700;">₹${fmtNum(dtAmt)}</td></tr>` : ''}
              ${customDed > 0 ? `<tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:7px 0;color:#dc2626;font-weight:600;">Other Deduction</td><td style="padding:7px 0;text-align:right;color:#dc2626;font-weight:700;">₹${fmtNum(customDed)}</td></tr>` : ''}
              <tr style="background:#f8fafc;"><td style="padding:8px 4px;font-weight:700;color:#dc2626;">Total Deductions</td><td style="padding:8px 4px;text-align:right;font-weight:700;color:#dc2626;">₹${fmtNum(pfAmt + ptAmt + professionalTaxAmt + dtAmt + a.unpaidDeduction + customDed)}</td></tr>
            </table>
          </td>
        </tr>
      </table>

      <div style="background:${co.accent};color:#fff;padding:18px 24px;border-radius:10px;display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;">
        <div>
          <div style="font-size:10px;opacity:0.7;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px;">Net Salary Payable</div>
          <div style="font-size:11px;opacity:0.6;">Rupees ${numberToWords(Math.round(a.netSalary))} Only</div>
        </div>
        <div style="font-size:28px;font-weight:900;">₹${fmtNum(a.netSalary)}</div>
      </div>

      <div style="display:flex;justify-content:space-between;margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:12px;">
        <div style="text-align:center;"><div style="border-top:1px solid #94a3b8;width:160px;margin-bottom:8px;"></div><div style="color:#64748b;">Employee Signature</div></div>
        <div style="text-align:center;"><div style="border-top:1px solid #94a3b8;width:160px;margin-bottom:8px;"></div><div style="color:#64748b;">Authorized Signatory</div></div>
      </div>
      <div style="text-align:center;margin-top:16px;font-size:10px;color:#94a3b8;">
        This is a computer-generated salary slip. No physical signature required. | Generated: ${new Date().toLocaleString('en-IN')}
      </div>
    </div>
  `;
};

// ── Shared PDF download ─────────────────────────────────────────────────────────
// Renders buildPDFHTML off-screen, rasterizes it, and saves as a PDF — the single
// download path shared by SalarySlipManager.jsx and EditSlip.jsx so a downloaded
// slip always looks identical regardless of where it was generated from.
export const downloadSalarySlipPDF = async (slip, employee, filenamePrefix = 'Salary_Slip', companyOverride) => {
  const a = getAmounts(slip, employee);
  const monthName = MONTHS[Number(slip.month) - 1];

  let logoBase64 = '';
  // Only the B2BinDemand template uses a logo image — skip the fetch entirely for PropCulture.
  if (resolveCompanyCode(employee, companyOverride) === 'b2b') {
    try {
      const r    = await fetch('/images/b2bindemand_logo.jfif');
      const blob = await r.blob();
      logoBase64 = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onloadend = () => res(reader.result.split(',')[1]);
        reader.onerror  = rej;
        reader.readAsDataURL(blob);
      });
    } catch { /* logo optional */ }
  }

  const div = document.createElement('div');
  div.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;background:#fff;';
  div.innerHTML = buildPDFHTML(slip, employee, a, monthName, logoBase64, companyOverride);
  document.body.appendChild(div);

  const canvas = await html2canvas(div, {
    scale: 2, backgroundColor: '#ffffff',
    logging: false, useCORS: true, windowWidth: 860,
  });
  document.body.removeChild(div);

  const img = canvas.toDataURL('image/png');
  const pdf = new jsPDF({
    orientation: 'portrait', unit: 'px',
    format: [canvas.width * 0.75, canvas.height * 0.75],
  });
  pdf.addImage(img, 'PNG', 0, 0, canvas.width * 0.75, canvas.height * 0.75);
  pdf.save(`${filenamePrefix}_${monthName}_${slip.year}.pdf`);
};
