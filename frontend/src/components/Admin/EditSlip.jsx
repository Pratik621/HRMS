import PaginatedTable from '../Common/PaginatedTable';
// src/components/Admin/EditSlip.jsx
// Manual salary-slip preparation tool — Admin only.
// Unlike the centralized Payroll module (SalarySlipManager.jsx / PayrollCenter), this page
// NEVER touches the database, attendance, or the salary_slips table. Every draft the admin
// prepares here lives only in localStorage, and "Generate Salary Slip" simply renders the
// SAME shared salary-slip template (SalarySlipView + downloadSalarySlipPDF) with the manually
// entered numbers — it does not call any /api/salary/* endpoint.
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Modal, Spinner, Button } from 'react-bootstrap';
import {
  FaSearch, FaSave, FaRedo, FaFileInvoiceDollar, FaTrash, FaEdit,
  FaEye, FaExclamationTriangle, FaLock, FaTimes, FaDownload,
} from 'react-icons/fa';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';
import { useNotification } from '../../context/NotificationContext';
import { MONTHS, fmtNum, isPFApplicablePeriod, downloadSalarySlipPDF } from '../../utils/salarySlipTemplate';
import SalarySlipView from '../Common/SalarySlipView';

const STORAGE_KEY = 'editslip_salary_data';

// ── localStorage helpers ─────────────────────────────────────────────────────────
const loadAllDrafts = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};
const saveAllDrafts = (drafts) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
};
const draftKey = (employeeId, salaryMonth) => `${employeeId}_${salaryMonth}`;

// ── date helpers ─────────────────────────────────────────────────────────────────
const pad2 = (n) => String(n).padStart(2, '0');
const currentMonthKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
};
// Pay cycle = 26th of the previous month through the 25th of the selected month, and
// working days = Monday–Friday only within that cycle — mirrors getCycleDates() +
// calculateWorkingDaysInCycle() in backend/controllers/salaryController.js exactly,
// so /editslip's day counts always agree with the main Payroll module's.
const getCycleRange = (year, month) => {
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear  = month === 1 ? year - 1 : year;
  const startDate = new Date(prevYear, prevMonth - 1, 26);
  const endDate   = new Date(year, month - 1, 25);
  let totalDays = 0;
  let workingDays = 0;
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    totalDays++;
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) workingDays++;
  }
  return { startDate, endDate, totalDays, workingDays };
};

const fmtCycleDate = (d) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

const fmtWhen = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const inputStyle = {
  width: '100%', padding: '9px 12px', fontSize: 13, borderRadius: 8,
  border: '1px solid #e2e8f0', outline: 'none', background: '#fff',
};
const labelStyle = { fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6, display: 'block' };
const cardStyle = { background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 1px 6px rgba(0,0,0,0.06)', marginBottom: 20 };

const EditSlip = () => {
  const { showNotification } = useNotification();

  // Employee search / selection
  const [employees, setEmployees] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [empSearch, setEmpSearch] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState(null);

  // Salary month
  const [salaryMonth, setSalaryMonth] = useState(currentMonthKey());

  // Manual fields
  const [monthlySalary, setMonthlySalary] = useState('');
  const [presentDays, setPresentDays] = useState('');
  const [halfDays, setHalfDays] = useState('0');
  const [pf, setPf] = useState('0');
  const [pt, setPt] = useState('0');
  const [otherDeductions, setOtherDeductions] = useState('0');

  // Which company template to render — explicit, since this tool's own PF field defaults to
  // 0 (even for real employees whose actual pf_amount is null), which would otherwise get
  // misread by the shared template's pf_amount===0 "is PropCulture" auto-detection. Defaulted
  // from the REAL selected employee record below (before PF/PT edits), then user-overridable.
  const [companyOverride, setCompanyOverride] = useState('b2b');

  const [draftExists, setDraftExists] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [isDirty, setIsDirty] = useState(false);

  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generatedSlip, setGeneratedSlip] = useState(null);
  const [downloading, setDownloading] = useState(false);

  const [draftSearch, setDraftSearch] = useState('');
  const [draftsVersion, setDraftsVersion] = useState(0); // bump to re-read localStorage

  // ── Load employees once (reuses the same admin employees list used across the app) ──
  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(API_ENDPOINTS.EMPLOYEES);
        const data = Array.isArray(res.data) ? res.data : Array.isArray(res.data?.data) ? res.data.data : [];
        setEmployees(data.filter(e => e.is_active !== false));
      } catch {
        showNotification('Failed to load employees', 'danger');
      } finally {
        setLoadingEmployees(false);
      }
    })();
  }, [showNotification]);

  const matchingEmployees = useMemo(() => {
    const q = empSearch.trim().toLowerCase();
    if (!q) return [];
    return employees.filter(e =>
      (e.employee_id || '').toLowerCase().includes(q) ||
      `${e.first_name || ''} ${e.last_name || ''}`.toLowerCase().includes(q) ||
      (e.email || '').toLowerCase().includes(q) ||
      (e.department || '').toLowerCase().includes(q) ||
      (e.designation || '').toLowerCase().includes(q)
    ).slice(0, 20);
  }, [empSearch, employees]);

  // ── Derived day counts for the selected month ──
  const { year, month } = useMemo(() => {
    const [y, m] = salaryMonth.split('-').map(Number);
    return { year: y, month: m };
  }, [salaryMonth]);
  const cycle = useMemo(() => getCycleRange(year, month), [year, month]);
  const { totalDays, workingDays } = cycle;
  const monthName = MONTHS[month - 1];
  const pfApplicable = isPFApplicablePeriod(month, year);

  // ── Flush current form into localStorage as a draft for (employee, month) ──
  const persistDraft = useCallback((emp, monthKey, fields) => {
    if (!emp) return;
    const drafts = loadAllDrafts();
    const key = draftKey(emp.employee_id, monthKey);
    const now = new Date().toISOString();
    drafts[key] = {
      employeeId: emp.employee_id,
      salaryMonth: monthKey,
      employeeName: `${emp.first_name || ''} ${emp.last_name || ''}`.trim(),
      department: emp.department || '',
      designation: emp.designation || emp.position || '',
      ...fields,
      lastUpdated: now,
    };
    saveAllDrafts(drafts);
    setLastUpdated(now);
    setDraftsVersion(v => v + 1);
    return drafts[key];
  }, []);

  const currentFields = useCallback(() => ({
    monthlySalary: Number(monthlySalary) || 0,
    workingDays,
    presentDays: Number(presentDays) || 0,
    halfDays: Number(halfDays) || 0,
    absentDays: Math.max(0, workingDays - (Number(presentDays) || 0) - (Number(halfDays) || 0)),
    pf: Number(pf) || 0,
    pt: Number(pt) || 0,
    otherDeductions: Number(otherDeductions) || 0,
  }), [monthlySalary, workingDays, presentDays, halfDays, pf, pt, otherDeductions]);

  // ── When employee or month changes: flush previous draft (if dirty), then load/init ──
  const applyDraftOrDefaults = useCallback((emp, monthKey) => {
    if (!emp) return;
    // Default from the real employee record's actual pf_amount (before it gets flattened into
    // the manual PF field's own 0-default below) — admin can still override with the toggle.
    setCompanyOverride(emp.pf_amount != null && parseInt(emp.pf_amount) === 0 ? 'pc' : 'b2b');
    const drafts = loadAllDrafts();
    const existing = drafts[draftKey(emp.employee_id, monthKey)];
    const [keyYear, keyMonth] = monthKey.split('-').map(Number);
    const { workingDays: wd } = getCycleRange(keyYear, keyMonth);
    if (existing) {
      setMonthlySalary(String(existing.monthlySalary ?? ''));
      setPresentDays(String(existing.presentDays ?? ''));
      setHalfDays(String(existing.halfDays ?? 0));
      setPf(String(existing.pf ?? 0));
      setPt(String(existing.pt ?? 0));
      setOtherDeductions(String(existing.otherDeductions ?? 0));
      setDraftExists(true);
      setLastUpdated(existing.lastUpdated || null);
      showNotification(`Draft found for ${existing.employeeName} — ${MONTHS[keyMonth - 1]} ${keyYear}`, 'info');
    } else {
      setMonthlySalary(String(emp.in_hand_salary || emp.gross_salary || ''));
      setPresentDays(String(wd));
      setHalfDays('0');
      setPf(String(emp.pf_amount ?? 0));
      setPt(String(emp.pt_amount ?? 0));
      setOtherDeductions('0');
      setDraftExists(false);
      setLastUpdated(null);
    }
    setIsDirty(false);
  }, [showNotification]);

  const selectEmployee = (emp) => {
    // Flush any unsaved edits for the currently-open employee/month before switching
    if (selectedEmployee && isDirty) {
      persistDraft(selectedEmployee, salaryMonth, currentFields());
    }
    setSelectedEmployee(emp);
    setEmpSearch('');
    applyDraftOrDefaults(emp, salaryMonth);
  };

  const changeMonth = (newMonthKey) => {
    if (selectedEmployee && isDirty) {
      persistDraft(selectedEmployee, salaryMonth, currentFields());
    }
    setSalaryMonth(newMonthKey);
    if (selectedEmployee) applyDraftOrDefaults(selectedEmployee, newMonthKey);
  };

  // ── Continuous autosave while the admin edits (only once something has been touched) ──
  useEffect(() => {
    if (!selectedEmployee || !isDirty) return;
    persistDraft(selectedEmployee, salaryMonth, currentFields());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthlySalary, presentDays, halfDays, pf, pt, otherDeductions]);

  const markDirty = (setter) => (e) => { setIsDirty(true); setter(e.target.value); };

  // ── Calculations (mirrors the existing payroll formula: paid days = present + 0.5×half,
  //    earned = min(paidDays × perDay, monthlySalary); absent days are already excluded
  //    from earned salary rather than double-deducted) ──
  const calc = useMemo(() => {
    const monthlySalaryNum = Number(monthlySalary) || 0;
    const presentNum = Number(presentDays) || 0;
    const halfNum = Number(halfDays) || 0;
    const pfNum = Number(pf) || 0;
    const ptNum = Number(pt) || 0;
    const otherNum = Number(otherDeductions) || 0;

    const absentDays = Math.max(0, workingDays - presentNum - halfNum);
    const perDaySalary = workingDays > 0 ? monthlySalaryNum / workingDays : 0;
    const paidDayEquivalent = presentNum + halfNum * 0.5;
    const earnedSalary = Math.min(paidDayEquivalent * perDaySalary, monthlySalaryNum);
    const effectivePf = pfApplicable ? pfNum : 0;
    const effectivePt = pfApplicable ? ptNum : 0;
    const legacyDt = pfApplicable ? 0 : (earnedSalary > 0 ? 200 : 0);
    const netSalary = Math.max(0, earnedSalary - effectivePf - effectivePt - otherNum - legacyDt);

    return { monthlySalaryNum, presentNum, halfNum, pfNum, ptNum, otherNum, absentDays, perDaySalary, earnedSalary, netSalary, legacyDt };
  }, [monthlySalary, presentDays, halfDays, pf, pt, otherDeductions, workingDays, pfApplicable]);

  // ── Validation ──
  const errors = useMemo(() => {
    const list = [];
    if (!selectedEmployee) list.push('Select an employee first.');
    if (calc.monthlySalaryNum < 0) list.push('Monthly salary cannot be negative.');
    if (calc.presentNum < 0) list.push('Present days cannot be negative.');
    if (calc.presentNum > workingDays) list.push(`Present days cannot exceed working days (${workingDays}).`);
    if (calc.halfNum < 0) list.push('Half days cannot be negative.');
    if (calc.presentNum + calc.halfNum > workingDays) list.push('Present + Half days cannot exceed working days.');
    if (calc.pfNum < 0) list.push('PF cannot be negative.');
    if (calc.ptNum < 0) list.push('PT cannot be negative.');
    if (calc.otherNum < 0) list.push('Other deductions cannot be negative.');
    return list;
  }, [selectedEmployee, calc, workingDays]);

  // ── Actions ──
  const handleSaveDraft = () => {
    if (!selectedEmployee) return;
    persistDraft(selectedEmployee, salaryMonth, currentFields());
    setDraftExists(true);
    setIsDirty(false);
    showNotification('Draft saved to this browser (not sent to the database).', 'success');
  };

  const handleReset = () => {
    if (!selectedEmployee) return;
    const drafts = loadAllDrafts();
    delete drafts[draftKey(selectedEmployee.employee_id, salaryMonth)];
    saveAllDrafts(drafts);
    setDraftsVersion(v => v + 1);
    applyDraftOrDefaults(selectedEmployee, salaryMonth);
    setShowResetConfirm(false);
    showNotification('Draft cleared for this employee and month.', 'success');
  };

  const buildSyntheticSlip = () => ({
    month, year,
    monthly_salary: calc.monthlySalaryNum,
    basic_salary: calc.earnedSalary,
    net_salary: calc.netSalary,
    present_days: calc.presentNum,
    half_days: calc.halfNum,
    absent_days: calc.absentDays,
    paid_leave_days: 0,
    unpaid_leave_days: 0,
    total_working_days: workingDays,
    per_day_salary: calc.perDaySalary,
    unpaid_deduction: 0,
    overtime_amount: 0,
    overtime_hours: 0,
    custom_deduction: calc.otherNum,
    dt: calc.legacyDt,
    cycle_start_date: cycle.startDate,
    cycle_end_date: cycle.endDate,
  });

  const buildSyntheticEmployee = () => ({
    ...selectedEmployee,
    pf_amount: calc.pfNum,
    pt_amount: calc.ptNum,
    professional_tax_amount: 0,
  });

  const handleGenerate = () => {
    if (errors.length > 0) {
      showNotification(errors[0], 'danger');
      return;
    }
    persistDraft(selectedEmployee, salaryMonth, currentFields());
    setIsDirty(false);
    setGeneratedSlip({ slip: buildSyntheticSlip(), employee: buildSyntheticEmployee() });
    setShowGenerateModal(true);
  };

  const handleDownloadPdf = async () => {
    if (!generatedSlip) return;
    setDownloading(true);
    try {
      await downloadSalarySlipPDF(generatedSlip.slip, generatedSlip.employee, `Salary_Slip_${generatedSlip.employee.employee_id}_MANUAL`, companyOverride);
      showNotification('PDF downloaded successfully', 'success');
    } catch {
      showNotification('Failed to download PDF', 'danger');
    } finally {
      setDownloading(false);
    }
  };

  // ── Draft list ──
  const allDrafts = useMemo(() => {
    const drafts = loadAllDrafts();
    return Object.values(drafts).sort((a, b) => (b.lastUpdated || '').localeCompare(a.lastUpdated || ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftsVersion]);

  const visibleDrafts = useMemo(() => {
    const q = draftSearch.trim().toLowerCase();
    if (!q) return allDrafts;
    return allDrafts.filter(d =>
      (d.employeeName || '').toLowerCase().includes(q) ||
      (d.employeeId || '').toLowerCase().includes(q) ||
      (d.salaryMonth || '').toLowerCase().includes(q)
    );
  }, [allDrafts, draftSearch]);

  const openDraftFromList = (d) => {
    const emp = employees.find(e => e.employee_id === d.employeeId);
    if (!emp) {
      showNotification('That employee could not be found in the current employee list.', 'danger');
      return;
    }
    if (selectedEmployee && isDirty) {
      persistDraft(selectedEmployee, salaryMonth, currentFields());
    }
    setSelectedEmployee(emp);
    setSalaryMonth(d.salaryMonth);
    applyDraftOrDefaults(emp, d.salaryMonth);
  };

  const deleteDraftFromList = (d) => {
    const drafts = loadAllDrafts();
    delete drafts[draftKey(d.employeeId, d.salaryMonth)];
    saveAllDrafts(drafts);
    setDraftsVersion(v => v + 1);
    if (selectedEmployee?.employee_id === d.employeeId && salaryMonth === d.salaryMonth) {
      applyDraftOrDefaults(selectedEmployee, salaryMonth);
    }
  };

  const generateFromList = (d) => {
    const emp = employees.find(e => e.employee_id === d.employeeId);
    if (!emp) {
      showNotification('That employee could not be found in the current employee list.', 'danger');
      return;
    }
    setCompanyOverride(emp.pf_amount != null && parseInt(emp.pf_amount) === 0 ? 'pc' : 'b2b');
    const [y, m] = d.salaryMonth.split('-').map(Number);
    const { workingDays: wd, startDate, endDate } = getCycleRange(y, m);
    const absentDays = Math.max(0, wd - (d.presentDays || 0) - (d.halfDays || 0));
    const perDaySalary = wd > 0 ? (d.monthlySalary || 0) / wd : 0;
    const paidDayEquivalent = (d.presentDays || 0) + (d.halfDays || 0) * 0.5;
    const earnedSalary = Math.min(paidDayEquivalent * perDaySalary, d.monthlySalary || 0);
    const applicable = isPFApplicablePeriod(m, y);
    const legacyDt = applicable ? 0 : (earnedSalary > 0 ? 200 : 0);
    const netSalary = Math.max(0, earnedSalary - (applicable ? d.pf || 0 : 0) - (applicable ? d.pt || 0 : 0) - (d.otherDeductions || 0) - legacyDt);

    setGeneratedSlip({
      slip: {
        month: m, year: y,
        monthly_salary: d.monthlySalary || 0, basic_salary: earnedSalary, net_salary: netSalary,
        present_days: d.presentDays || 0, half_days: d.halfDays || 0, absent_days: absentDays,
        paid_leave_days: 0, unpaid_leave_days: 0, total_working_days: wd, per_day_salary: perDaySalary,
        unpaid_deduction: 0, overtime_amount: 0, overtime_hours: 0, custom_deduction: d.otherDeductions || 0,
        dt: legacyDt, cycle_start_date: startDate, cycle_end_date: endDate,
      },
      employee: { ...emp, pf_amount: d.pf || 0, pt_amount: d.pt || 0, professional_tax_amount: 0 },
    });
    setShowGenerateModal(true);
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: "#eef4fb", display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FaFileInvoiceDollar size={15} color="#1f4e79" />
            </div>
            <h5 style={{ margin: 0, fontWeight: 800, color: '#111827' }}>Manual Salary Slip Generator</h5>
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            <FaLock size={10} /> Admin only · Stored in this browser only — never saved to the database or main Payroll system
          </div>
        </div>
      </div>

      {/* Employee search */}
      <div style={cardStyle}>
        <label style={labelStyle}>Search Employee (name / employee ID / email)</label>
        <div style={{ position: 'relative', maxWidth: 480 }}>
          <FaSearch size={11} style={{ position: 'absolute', left: 12, top: 13, color: '#94a3b8' }} />
          <input
            type="text"
            placeholder="e.g. B2B260803 or employee name"
            value={empSearch}
            onChange={(e) => setEmpSearch(e.target.value)}
            style={{ ...inputStyle, paddingLeft: 30 }}
          />
        </div>
        {loadingEmployees && <div style={{ marginTop: 10, fontSize: 12, color: '#94a3b8' }}><Spinner size="sm" animation="border" /> Loading employees…</div>}
        {empSearch.trim() && (
          <div style={{ marginTop: 10, border: '1px solid #f1f5f9', borderRadius: 10, overflow: 'hidden', maxHeight: 260, overflowY: 'auto' }}>
            {matchingEmployees.length === 0 ? (
              <div style={{ padding: 14, fontSize: 12, color: '#94a3b8' }}>No matching employees.</div>
            ) : matchingEmployees.map(e => (
              <div
                key={e.employee_id}
                onClick={() => selectEmployee(e)}
                style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                onMouseEnter={(ev) => ev.currentTarget.style.background = '#f8fafc'}
                onMouseLeave={(ev) => ev.currentTarget.style.background = '#fff'}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{e.first_name} {e.last_name}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>{e.department || '—'} · {e.designation || e.position || '—'}</div>
                </div>
                <div style={{ fontSize: 11, fontFamily: 'monospace', color: "#1f4e79", fontWeight: 700 }}>{e.employee_id}</div>
              </div>
            ))}
          </div>
        )}
        {selectedEmployee && (
          <div style={{ marginTop: 14, background: '#f8fafc', borderRadius: 10, padding: '12px 16px', display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase' }}>Employee Name</div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{selectedEmployee.first_name} {selectedEmployee.last_name}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase' }}>Employee ID</div>
              <div style={{ fontWeight: 700, fontSize: 13, fontFamily: 'monospace' }}>{selectedEmployee.employee_id}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase' }}>Department</div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{selectedEmployee.department || 'N/A'}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase' }}>Designation</div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{selectedEmployee.designation || selectedEmployee.position || 'N/A'}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase' }}>Joining Date</div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{selectedEmployee.joining_date ? new Date(selectedEmployee.joining_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}</div>
            </div>
            <button
              onClick={() => { setSelectedEmployee(null); setDraftExists(false); }}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <FaTimes size={10} /> Clear
            </button>
          </div>
        )}
      </div>

      {selectedEmployee && (
        <>
          {/* Editor */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
              <div className="hrms-responsive-toolbar" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <label style={{ ...labelStyle, marginBottom: 0 }}>Select Salary Month</label>
                <input
                  type="month"
                  value={salaryMonth}
                  onChange={(e) => changeMonth(e.target.value)}
                  style={{ ...inputStyle, width: 180 }}
                />
              </div>
              {draftExists && (
                <span style={{ background: '#dcfce7', color: '#16a34a', borderRadius: 10, padding: '4px 10px', fontSize: 11, fontWeight: 700 }}>
                  Draft found · last updated {fmtWhen(lastUpdated)}
                </span>
              )}
            </div>

            <div style={{ fontSize: 11.5, color: '#64748b', marginBottom: 12 }}>
              Pay cycle (26th–25th, same as the main Payroll module): <b>{fmtCycleDate(cycle.startDate)} – {fmtCycleDate(cycle.endDate)}</b>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
              <StatBox label="Total Cycle Days" value={totalDays} color="#1e3a5f" />
              <StatBox label="Working Days (Mon–Fri)" value={workingDays} color="#0369a1" />
              <StatBox label="Absent Days (auto)" value={calc.absentDays} color="#dc2626" />
            </div>

            {!pfApplicable && (
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px', fontSize: 11.5, color: '#92400e', marginBottom: 16, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                <FaExclamationTriangle size={11} style={{ marginTop: 1 }} />
                <span>Company PF/PT policy applies from May 2026 onward — for {monthName} {year} a flat ₹200 deduction (DT) is used instead of the PF/PT fields below, consistent with the main Payroll module.</span>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
              <div>
                <label style={labelStyle}>Monthly Salary (₹)</label>
                <input type="number" min="0" value={monthlySalary} onChange={markDirty(setMonthlySalary)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Present Days (manual)</label>
                <input type="number" min="0" max={workingDays} value={presentDays} onChange={markDirty(setPresentDays)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Half Days (manual)</label>
                <input type="number" min="0" max={workingDays} value={halfDays} onChange={markDirty(setHalfDays)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Absent Days (auto)</label>
                <input type="number" value={calc.absentDays} disabled style={{ ...inputStyle, background: '#f8fafc', color: '#dc2626', fontWeight: 700 }} />
              </div>
              <div>
                <label style={labelStyle}>PF (₹){!pfApplicable && ' — not applicable'}</label>
                <input type="number" min="0" value={pf} onChange={markDirty(setPf)} disabled={!pfApplicable} style={{ ...inputStyle, opacity: pfApplicable ? 1 : 0.5 }} />
              </div>
              <div>
                <label style={labelStyle}>PT (₹){!pfApplicable && ' — not applicable'}</label>
                <input type="number" min="0" value={pt} onChange={markDirty(setPt)} disabled={!pfApplicable} style={{ ...inputStyle, opacity: pfApplicable ? 1 : 0.5 }} />
              </div>
              <div>
                <label style={labelStyle}>Other Deductions (₹)</label>
                <input type="number" min="0" value={otherDeductions} onChange={markDirty(setOtherDeductions)} style={inputStyle} />
              </div>
            </div>

            {errors.length > 0 && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginTop: 16, fontSize: 12, color: '#dc2626' }}>
                {errors.map((e, i) => <div key={i}>• {e}</div>)}
              </div>
            )}

            {/* Live preview */}
            <div style={{ marginTop: 20, background: '#f8fafc', borderRadius: 10, padding: '16px 18px' }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 10 }}>Salary Slip Preview</div>
              <PreviewRow label="Employee" value={`${selectedEmployee.first_name} ${selectedEmployee.last_name}`} />
              <PreviewRow label="Salary Month" value={`${monthName} ${year}`} />
              <PreviewRow label="Working Days" value={workingDays} />
              <PreviewRow label="Present" value={calc.presentNum} />
              <PreviewRow label="Half Day" value={calc.halfNum} />
              <PreviewRow label="Absent" value={calc.absentDays} />
              <PreviewRow label="Monthly Salary" value={`₹${fmtNum(calc.monthlySalaryNum)}`} />
              <PreviewRow label="Earned Salary" value={`₹${fmtNum(calc.earnedSalary.toFixed(2))}`} />
              <PreviewRow label="PF" value={`₹${fmtNum(pfApplicable ? calc.pfNum : 0)}`} />
              <PreviewRow label="PT" value={`₹${fmtNum(pfApplicable ? calc.ptNum : 0)}`} />
              {!pfApplicable && <PreviewRow label="DT (Fixed)" value={`₹${fmtNum(calc.legacyDt)}`} />}
              <PreviewRow label="Other Deduction" value={`₹${fmtNum(calc.otherNum)}`} />
              <PreviewRow label="Net Salary" value={`₹${fmtNum(calc.netSalary.toFixed(2))}`} bold />
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
              <Button variant="outline-secondary" size="sm" onClick={handleSaveDraft} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <FaSave size={11} /> Save Draft
              </Button>
              <Button variant="outline-danger" size="sm" onClick={() => setShowResetConfirm(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <FaRedo size={11} /> Reset
              </Button>
              <Button
                size="sm"
                onClick={handleGenerate}
                disabled={errors.length > 0}
                style={{ marginLeft: 'auto', background: '#1e3a5f', border: 'none', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <FaFileInvoiceDollar size={12} /> Generate Salary Slip
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Saved drafts */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>Saved Salary Slip Drafts</span>
          <div style={{ position: 'relative', maxWidth: 280 }}>
            <FaSearch size={11} style={{ position: 'absolute', left: 12, top: 11, color: '#94a3b8' }} />
            <input
              type="text" placeholder="Search drafts…" value={draftSearch}
              onChange={(e) => setDraftSearch(e.target.value)}
              style={{ ...inputStyle, paddingLeft: 30, fontSize: 12, padding: '7px 12px 7px 30px' }}
            />
          </div>
        </div>

        {visibleDrafts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 32, color: '#94a3b8', fontSize: 13 }}>No drafts saved yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <PaginatedTable style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['Employee', 'Employee ID', 'Salary Month', 'Last Updated', 'Status', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', fontWeight: 600, color: '#64748b', textAlign: 'left', fontSize: 11, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleDrafts.map((d, i) => (
                  <tr key={draftKey(d.employeeId, d.salaryMonth)} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>{d.employeeName}</td>
                    <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: '#64748b' }}>{d.employeeId}</td>
                    <td style={{ padding: '10px 12px' }}>{MONTHS[Number(d.salaryMonth.split('-')[1]) - 1]} {d.salaryMonth.split('-')[0]}</td>
                    <td style={{ padding: '10px 12px', color: '#64748b', whiteSpace: 'nowrap' }}>{fmtWhen(d.lastUpdated)}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ background: "#eef4fb", color: "#1f4e79", borderRadius: 10, padding: '2px 9px', fontSize: 10, fontWeight: 700 }}>Draft</span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div className="hrms-responsive-toolbar" style={{ display: 'flex', gap: 4 }}>
                        <button onClick={() => openDraftFromList(d)} title="Edit" style={smallBtnStyle('#0ea5e9', '#f0f9ff')}><FaEdit size={9} /></button>
                        <button onClick={() => generateFromList(d)} title="Generate" style={smallBtnStyle('#1e3a5f', "#eef4fb")}><FaEye size={9} /></button>
                        <button onClick={() => deleteDraftFromList(d)} title="Delete" style={smallBtnStyle('#dc2626', '#fef2f2')}><FaTrash size={9} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </PaginatedTable>
          </div>
        )}
      </div>

      {/* Reset confirmation */}
      <Modal show={showResetConfirm} onHide={() => setShowResetConfirm(false)} centered>
        <Modal.Header closeButton><Modal.Title style={{ fontSize: 16 }}>Reset Draft</Modal.Title></Modal.Header>
        <Modal.Body>
          Are you sure you want to clear the manually entered salary data for this employee and month?
          This only removes the local draft — it does not affect attendance, payroll, or any other employee's data.
        </Modal.Body>
        <Modal.Footer>
          <button className="btn btn-outline-secondary btn-sm" onClick={() => setShowResetConfirm(false)}>Cancel</button>
          <button className="btn btn-danger btn-sm" onClick={handleReset}>Clear Draft</button>
        </Modal.Footer>
      </Modal>

      {/* Generated slip modal — reuses the existing salary-slip template exactly */}
      <Modal show={showGenerateModal} onHide={() => setShowGenerateModal(false)} size="lg" centered scrollable>
        <Modal.Header style={{ background: '#1e3a5f', color: '#fff', border: 'none', padding: '14px 22px' }} closeVariant="white" closeButton>
          <Modal.Title style={{ fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <FaFileInvoiceDollar size={13} />
            Manual Salary Slip — {generatedSlip ? `${MONTHS[generatedSlip.slip.month - 1]} ${generatedSlip.slip.year}` : ''}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ padding: 24 }}>
          {generatedSlip && (
            <>
              {/* Company template toggle — overrides the auto-detected branding (see
                  resolveCompanyCode in salarySlipTemplate.js) for this manual/local slip. */}
              <div className="hrms-responsive-toolbar" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Company Format:
                </span>
                <div style={{ display: 'inline-flex', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                  {[['b2b', 'B2BinDemand'], ['pc', 'PropCulture']].map(([code, label]) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => setCompanyOverride(code)}
                      style={{
                        padding: '6px 14px', fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer',
                        background: companyOverride === code ? (code === 'pc' ? '#0d7b6f' : '#1e3a5f') : '#fff',
                        color: companyOverride === code ? '#fff' : '#475569',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <SalarySlipView slip={generatedSlip.slip} employee={generatedSlip.employee} companyOverride={companyOverride} />
            </>
          )}
        </Modal.Body>
        <Modal.Footer style={{ border: 'none', background: '#f8fafc', gap: 8, padding: '12px 22px' }}>
          <Button variant="light" size="sm" onClick={() => setShowGenerateModal(false)} style={{ fontSize: 12, borderRadius: 8, fontWeight: 600 }}>Close</Button>
          <Button
            size="sm" onClick={handleDownloadPdf} disabled={downloading}
            style={{ fontSize: 12, borderRadius: 8, background: '#1e3a5f', border: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {downloading ? <><Spinner size="sm" style={{ width: 12, height: 12 }} animation="border" /> Downloading…</> : <><FaDownload size={11} /> Download PDF</>}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

const StatBox = ({ label, value, color }) => (
  <div style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 16px', minWidth: 140 }}>
    <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
    <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
  </div>
);

const PreviewRow = ({ label, value, bold }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12.5, fontWeight: bold ? 800 : 400, color: bold ? '#1e3a5f' : '#475569', borderTop: bold ? '1px solid #e2e8f0' : 'none', marginTop: bold ? 6 : 0, paddingTop: bold ? 8 : 4 }}>
    <span>{label}</span>
    <span>{value}</span>
  </div>
);

const smallBtnStyle = (color, bg) => ({
  fontSize: 10, padding: '4px 7px', borderRadius: 6, border: `1px solid ${color}`,
  background: bg, color, cursor: 'pointer', display: 'flex', alignItems: 'center',
});

export default EditSlip;
