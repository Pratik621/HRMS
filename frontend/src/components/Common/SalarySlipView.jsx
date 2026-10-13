// src/components/Common/SalarySlipView.jsx
// Shared on-screen salary-slip preview — the single rendering of the slip layout,
// used by SalarySlipManager.jsx (Admin, database-backed) and EditSlip.jsx (Admin,
// manual/localStorage slip prep) so both show the exact same visual template.
// Extracted out of SalarySlipManager.jsx rather than duplicated.
import React from 'react';
import { Row, Col } from 'react-bootstrap';
import { FaCalendarAlt } from 'react-icons/fa';
import {
  MONTHS, fmtNum, fmtCurrency, numberToWords, getDeductionBreakdown, getAmounts,
  resolveCompanyCode, COMPANY,
} from '../../utils/salarySlipTemplate';

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A';

const StatPill = ({ label, value, color }) => (
  <div style={{ textAlign: 'center', padding: '6px 12px', background: '#f8fafc', borderRadius: 8, minWidth: 72 }}>
    <div style={{ fontWeight: 800, fontSize: 20, color, lineHeight: 1 }}>{value}</div>
    <div style={{ color: '#94a3b8', fontSize: 10, marginTop: 4 }}>{label}</div>
  </div>
);

const SalaryRow = ({ label, value, bold, accent, last }) => (
  <div style={{
    display: 'flex', justifyContent: 'space-between',
    padding: '7px 14px',
    borderBottom: last ? 'none' : '1px solid #f1f5f9',
    fontWeight: bold ? 700 : 400,
    background: bold ? '#f8fafc' : 'transparent',
  }}>
    <span style={{ color: accent || (bold ? '#1e293b' : '#475569'), fontSize: 12.5 }}>{label}</span>
    <span style={{ color: accent || (bold ? '#1e293b' : '#475569'), fontSize: 12.5 }}>₹{fmtNum(value)}</span>
  </div>
);

// slip: same shape as a `salary_slips` row (month, year, monthly_salary, basic_salary,
// net_salary, present_days, half_days, absent_days, paid_leave_days, unpaid_leave_days,
// total_working_days, per_day_salary, overtime_amount/hours, dt, custom_deduction, ...)
// employee: the employee record (first_name, last_name, employee_id, designation, department,
// joining_date, account_number, pan_number, pf_amount, pt_amount, professional_tax_amount)
// `companyOverride` ('b2b' | 'pc', optional): forces which company branding to render,
// bypassing the pf_amount-based auto-detection — see resolveCompanyCode() for why EditSlip.jsx
// needs this.
const SalarySlipView = ({ slip, employee, companyOverride }) => {
  const a = getAmounts(slip, employee);
  const bd = getDeductionBreakdown(slip, employee);
  const pfAmt = bd.pf;
  const professionalTaxAmt = (bd.professionalTax || 0) + bd.pt;
  const dtAmt = bd.dt !== null ? bd.dt : a.deduction;
  const monthName = MONTHS[Number(slip.month) - 1];
  const cycleLabel = slip.cycle_start_date && slip.cycle_end_date
    ? `${fmtDate(slip.cycle_start_date)} – ${fmtDate(slip.cycle_end_date)}`
    : `${monthName} ${slip.year}`;
  const coCode = resolveCompanyCode(employee, companyOverride);
  const isPC = coCode === 'pc';
  const co = COMPANY[coCode];

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, Arial, sans-serif' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `2px solid ${co.accent}`, paddingBottom: 18, marginBottom: 20 }}>
        <div>
          {isPC ? (
            <div style={{ fontSize: 22, fontWeight: 900, color: co.accent, letterSpacing: 1, marginBottom: 6 }}>{co.name}</div>
          ) : (
            <img
              src="/images/b2bindemand_logo.jfif" alt="logo"
              style={{ height: 44, objectFit: 'contain', display: 'block', marginBottom: 6 }}
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          )}
          <div style={{ fontSize: 11, color: '#64748b', maxWidth: 260 }}>{co.address}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: co.accent, textTransform: 'uppercase', letterSpacing: 1.5 }}>Salary Slip</div>
          <div style={{ fontSize: 13, color: '#475569', marginTop: 4 }}>{monthName} {slip.year}</div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Pay Cycle: {cycleLabel}</div>
        </div>
      </div>

      <div style={{ background: '#f0f9ff', padding: '12px 16px', borderRadius: 8, marginBottom: 16, fontSize: 12, color: '#0369a1' }}>
        Eligible from: {fmtDate(a.eligibleStart)} · Scheduled payment: {a.paymentScheduled}<br />
        Saturdays and Sundays excluded. Daily rate uses all weekdays in the cycle.
      </div>
      {/* Employee Info */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 24px', marginBottom: 20, background: '#f8fafc', borderRadius: 10, padding: '14px 16px' }}>
        {[
          ['Employee Name', `${employee?.first_name || ''} ${employee?.last_name || ''}`.trim()],
          ['Employee Code', employee?.employee_id],
          ['Designation',   employee?.designation || employee?.position],
          ['Department',    employee?.department],
          ['Date of Joining', employee?.joining_date ? fmtDate(employee.joining_date) : 'N/A'],
          ['Bank Account',  employee?.account_number ? `****${String(employee.account_number).slice(-4)}` : 'N/A'],
          ...(employee?.pan_number ? [['PAN Number', employee.pan_number]] : []),
        ].map(([l, v]) => (
          <div key={l}>
            <div style={{ color: '#94a3b8', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{l}</div>
            <div style={{ fontWeight: 600, color: '#1e293b', fontSize: 12.5 }}>{v || 'N/A'}</div>
          </div>
        ))}
      </div>

      {/* Attendance */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
          <FaCalendarAlt size={10} color="#6366f1" /> Attendance Summary
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <StatPill label="Working Days" value={a.totalWorkingDays} color="#1e3a5f" />
          <StatPill label="Present"      value={a.presentDays}      color="#16a34a" />
          <StatPill label="Paid Leave / Holidays"   value={a.paidLeaveDays}    color="#0369a1" />
          <StatPill label="Unpaid Leave" value={a.unpaidLeaveDays}  color="#d97706" />
          <StatPill label="Half Days"    value={a.halfDays}         color="#7c3aed" />
          <StatPill label="Absent"       value={a.absentDays}       color="#dc2626" />
        </div>
      </div>

      {/* Earnings & Deductions */}
      <Row className="g-2 mb-3">
        <Col xs={12} sm={6}>
          <div style={{ border: `1px solid ${co.accent}30`, borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ background: co.accent, color: '#fff', padding: '9px 14px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Earnings
            </div>
            <SalaryRow label="Monthly Salary Reference" value={a.monthlySalary} />
            <SalaryRow label="Prorated Salary Before Loss of Pay" value={a.basicSalary} />
            {a.overtimeAmount > 0 && (
              <SalaryRow label={`Overtime (${a.overtimeHours}h @ ₹150/h)`} value={a.overtimeAmount} accent="#16a34a" />
            )}
            <SalaryRow label="Gross Earnings" value={a.basicSalary + a.overtimeAmount} bold last />
          </div>
        </Col>
        <Col xs={12} sm={6}>
          <div style={{ border: `1px solid ${co.accent}30`, borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ background: co.accent, color: '#fff', padding: '9px 14px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Deductions
            </div>
            {pfAmt > 0 && <SalaryRow label="Provident Fund (PF)" value={pfAmt} />}
            <SalaryRow label="Professional Tax" value={professionalTaxAmt} />
            <SalaryRow label="TDS"                   value={0} />
            {a.unpaidDeduction > 0 && (
              <SalaryRow
                label={`Absent Deduction (${a.absentDays > 0 ? `${a.absentDays} absent` : ''}${a.unpaidLeaveDays > 0 ? `${a.absentDays > 0 ? ' + ' : ''}${a.unpaidLeaveDays} unpaid` : ''} × ₹${fmtNum(a.perDaySalary)}/day)`}
                value={a.unpaidDeduction}
                accent="#dc2626"
              />
            )}
            {dtAmt > 0 && <SalaryRow label="DT (Fixed Deduction)" value={dtAmt} accent="#b45309" />}
            {parseFloat(slip?.custom_deduction || 0) > 0 && (
              <SalaryRow label="Other Deduction" value={parseFloat(slip.custom_deduction)} accent="#dc2626" />
            )}
            <SalaryRow label="Total Deductions" value={pfAmt + professionalTaxAmt + dtAmt + a.unpaidDeduction + parseFloat(slip?.custom_deduction || 0)} bold accent="#dc2626" last />
          </div>
        </Col>
      </Row>

      {/* Net Salary */}
      <div style={{ background: co.accent, color: '#fff', borderRadius: 10, padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 10, opacity: 0.65, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Net Salary Payable</div>
          <div style={{ fontSize: 11, opacity: 0.55 }}>Rupees {numberToWords(Math.round(a.netSalary))} Only</div>
        </div>
        <div style={{ fontSize: 26, fontWeight: 900 }}>{fmtCurrency(a.netSalary)}</div>
      </div>

      {a.perDaySalary > 0 && (
        <div style={{ background: '#f0f9ff', borderRadius: 8, padding: '7px 14px', fontSize: 11, color: '#0369a1', marginBottom: 10 }}>
          Per-day rate: {fmtCurrency(a.perDaySalary)} &nbsp;·&nbsp; Working days in cycle: {a.totalWorkingDays}
        </div>
      )}

      <div style={{ fontSize: 10, color: '#94a3b8', textAlign: 'center', marginTop: 10, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
        Computer-generated salary slip — no physical signature required
      </div>
    </div>
  );
};

export default SalarySlipView;
