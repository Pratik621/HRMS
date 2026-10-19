import PaginatedTable from '../Common/PaginatedTable';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Spinner, Button } from 'react-bootstrap';
import {
  FaMoneyBillWave, FaSave, FaSync, FaCheckCircle,
  FaExclamationCircle, FaInfoCircle, FaFileExport, FaArrowLeft
} from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';
import { useNotification } from '../../context/NotificationContext';

// ── Constants ──────────────────────────────────────────────────────────────────
const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

const currentYear  = new Date().getFullYear();
const currentMonth = new Date().getMonth() + 1;

const YEARS = Array.from({ length: 5 }, (_, i) => currentYear - i);

// ── Formatters ─────────────────────────────────────────────────────────────────
const fmt = (v) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', minimumFractionDigits: 0
  }).format(Number(v) || 0);

const fmtNum = (v, dec = 2) =>
  isNaN(Number(v)) ? '—' : Number(v).toFixed(dec);

// ── Core calculation (mirrors backend calcAdjustment exactly) ──────────────────
const calcAdjustment = (monthlySalary, salaryEarned, totalWorkingDays, shiftHours) => {
  const monthly = Number(monthlySalary) || 0;
  const earned  = Number(salaryEarned) >= 0 ? Number(salaryEarned) : monthly;
  const wDays   = Number(totalWorkingDays) || 22;
  const sHours  = Number(shiftHours)       || 8;

  const difference = parseFloat((earned - monthly).toFixed(2));

  let adjOvertimeAmount  = 0;
  let adjDeductionAmount = 0;
  if (difference > 0)      adjOvertimeAmount  = parseFloat(difference.toFixed(2));
  else if (difference < 0) adjDeductionAmount = parseFloat(Math.abs(difference).toFixed(2));

  const perDaySalary    = wDays  > 0 ? monthly / wDays  : 0;
  const perHourSalary   = sHours > 0 ? perDaySalary / sHours : 0;
  const adjOvertimeHours = perHourSalary > 0
    ? parseFloat((adjOvertimeAmount / perHourSalary).toFixed(2))
    : 0;

  const finalPayableSalary = parseFloat(
    Math.max(0, monthly + adjOvertimeAmount - adjDeductionAmount).toFixed(2)
  );

  return { difference, adjOvertimeAmount, adjOvertimeHours, adjDeductionAmount, finalPayableSalary };
};

// ── Difference badge ───────────────────────────────────────────────────────────
const DiffBadge = ({ value }) => {
  const n = Number(value);
  if (n === 0 || isNaN(n)) return <span style={{ color: '#94a3b8', fontSize: 11 }}>₹0</span>;
  const pos = n > 0;
  return (
    <span style={{
      fontWeight: 700, fontSize: 11,
      color: pos ? '#16a34a' : '#dc2626',
    }}>
      {pos ? '+' : ''}{fmt(n)}
    </span>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// Main Component
// ══════════════════════════════════════════════════════════════════════════════
const PayrollAdjustment = () => {
  const navigate = useNavigate();
  const { showNotification } = useNotification();

  const [month,    setMonth]    = useState(currentMonth);
  const [year,     setYear]     = useState(currentYear);
  const [records,  setRecords]  = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [saving,   setSaving]   = useState({});   // { employee_id: true }
  const [dirty,    setDirty]    = useState({});    // { employee_id: true }
  const [saved,    setSaved]    = useState({});    // { employee_id: true }

  // Local edits: { employee_id: { salary_earned: string, shift_hours: string, pf_amount: string, pt_amount: string } }
  const [edits, setEdits] = useState({});

  // Bulk PF/PT: select employees, stage one PF/PT value across all of them
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkPf, setBulkPf] = useState('');
  const [bulkPt, setBulkPt] = useState('');

  // Debounce timers
  const debounceRef = useRef({});

  // ── Load payroll data ────────────────────────────────────────────────────────
  const loadPayroll = useCallback(async () => {
    setLoading(true);
    setEdits({});
    setDirty({});
    setSaved({});
    setSelectedIds(new Set());
    try {
      const res = await axios.get(API_ENDPOINTS.SALARY_BULK_PAYROLL(month, year));
      setRecords(res.data.records || []);
    } catch (err) {
      showNotification(err.response?.data?.message || 'Failed to load payroll data', 'danger');
    } finally {
      setLoading(false);
    }
  }, [month, year]);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadPayroll(); }, [loadPayroll]);

  // ── Get current display row (applies local edits over server data) ───────────
  const getRow = (rec) => {
    const e = edits[rec.employee_id] || {};
    const salaryEarned  = e.salary_earned  !== undefined ? e.salary_earned  : String(rec.salary_earned  ?? rec.monthly_salary);
    const shiftHours    = e.shift_hours    !== undefined ? e.shift_hours    : String(rec.shift_hours    ?? 8);
    // '' means "not set" — falls back to the default (1800 for PF, 200 for PT) at calculation time.
    // Explicit 0 is a valid value (PF/PT-exempt) and is kept as '0', not treated as unset.
    const pfAmount      = e.pf_amount      !== undefined ? e.pf_amount      : (rec.pf_amount != null ? String(rec.pf_amount) : '');
    const ptAmount      = e.pt_amount      !== undefined ? e.pt_amount      : (rec.pt_amount != null ? String(rec.pt_amount) : '');

    const earnedNum = salaryEarned === '' ? rec.monthly_salary : Number(salaryEarned);
    const calc = calcAdjustment(rec.monthly_salary, earnedNum, rec.total_working_days, Number(shiftHours) || 8);

    return { salaryEarned, shiftHours, pfAmount, ptAmount, ...calc };
  };

  // ── Bulk PF/PT selection ─────────────────────────────────────────────────────
  const toggleSelect = (employeeId) => {
    setSelectedIds(prev => {
      const n = new Set(prev);
      if (n.has(employeeId)) n.delete(employeeId); else n.add(employeeId);
      return n;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds(prev => (prev.size === records.length ? new Set() : new Set(records.map(r => r.employee_id))));
  };

  const applyBulkPfPt = () => {
    if (selectedIds.size === 0) {
      showNotification('Select at least one employee first', 'warning');
      return;
    }
    if (bulkPf === '' && bulkPt === '') {
      showNotification('Enter a PF and/or PT amount to apply', 'warning');
      return;
    }
    const pfNum = bulkPf === '' ? undefined : Number(bulkPf);
    const ptNum = bulkPt === '' ? undefined : Number(bulkPt);
    if ((pfNum !== undefined && (isNaN(pfNum) || pfNum < 0)) || (ptNum !== undefined && (isNaN(ptNum) || ptNum < 0))) {
      showNotification('PF and PT must be 0 or a positive amount', 'danger');
      return;
    }

    setEdits(prev => {
      const next = { ...prev };
      selectedIds.forEach(id => {
        next[id] = { ...(next[id] || {}) };
        if (pfNum !== undefined) next[id].pf_amount = String(pfNum);
        if (ptNum !== undefined) next[id].pt_amount = String(ptNum);
      });
      return next;
    });
    setDirty(prev => {
      const next = { ...prev };
      selectedIds.forEach(id => { next[id] = true; });
      return next;
    });
    setSaved(prev => {
      const next = { ...prev };
      selectedIds.forEach(id => { delete next[id]; });
      return next;
    });
    showNotification(`PF/PT staged for ${selectedIds.size} employee(s) — click "Save All" to persist`, 'success');
  };

  // ── Handle field change (instant recalc, debounced dirty mark) ──────────────
  const handleChange = (employeeId, field, value) => {
    setEdits(prev => ({
      ...prev,
      [employeeId]: { ...(prev[employeeId] || {}), [field]: value }
    }));
    setDirty(prev => ({ ...prev, [employeeId]: true }));
    setSaved(prev => { const n = { ...prev }; delete n[employeeId]; return n; });

    // Debounce validation: clear error state after user stops typing
    clearTimeout(debounceRef.current[employeeId]);
    debounceRef.current[employeeId] = setTimeout(() => {
      setDirty(prev => ({ ...prev, [employeeId]: !!prev[employeeId] }));
    }, 300);
  };

  // ── Save single row ──────────────────────────────────────────────────────────
  const handleSave = async (rec) => {
    const row = getRow(rec);
    const salaryEarnedNum = row.salaryEarned === '' ? rec.monthly_salary : Number(row.salaryEarned);

    if (isNaN(salaryEarnedNum) || salaryEarnedNum < 0) {
      showNotification('Salary Earned cannot be negative or empty', 'danger');
      return;
    }

    const pfNum = row.pfAmount === '' ? null : Number(row.pfAmount);
    const ptNum = row.ptAmount === '' ? null : Number(row.ptAmount);
    if ((pfNum !== null && (isNaN(pfNum) || pfNum < 0)) || (ptNum !== null && (isNaN(ptNum) || ptNum < 0))) {
      showNotification('PF and PT cannot be negative', 'danger');
      return;
    }

    setSaving(prev => ({ ...prev, [rec.employee_id]: true }));
    try {
      await axios.post(API_ENDPOINTS.SALARY_ADJUSTMENT, {
        employee_id:   rec.employee_id,
        month,
        year,
        salary_earned: parseFloat(salaryEarnedNum.toFixed(2)),
        shift_hours:   parseFloat(row.shiftHours) || 8,
      });

      // Only touch the employee record when PF/PT was actually edited (avoids an
      // unnecessary write on every save when only Salary Earned/Shift Hours changed).
      const edited = edits[rec.employee_id] || {};
      if (edited.pf_amount !== undefined || edited.pt_amount !== undefined) {
        await axios.put(API_ENDPOINTS.EMPLOYEE_BY_ID(rec.id), {
          pf_amount: pfNum,
          pt_amount: ptNum,
        });
      }

      setSaved(prev  => ({ ...prev, [rec.employee_id]: true }));
      setDirty(prev  => { const n = { ...prev }; delete n[rec.employee_id]; return n; });
      // Refresh the record from server
      await loadPayroll();
    } catch (err) {
      showNotification(err.response?.data?.message || `Failed to save ${rec.first_name}`, 'danger');
    } finally {
      setSaving(prev => { const n = { ...prev }; delete n[rec.employee_id]; return n; });
    }
  };

  // ── Save all dirty rows ──────────────────────────────────────────────────────
  const handleSaveAll = async () => {
    const dirtyIds = Object.keys(dirty).filter(id => dirty[id]);
    if (dirtyIds.length === 0) {
      showNotification('No unsaved changes', 'info');
      return;
    }
    for (const id of dirtyIds) {
      const rec = records.find(r => r.employee_id === id);
      if (rec) await handleSave(rec);
    }
    showNotification(`Saved ${dirtyIds.length} record(s) successfully`, 'success');
  };

  // ── Summary stats ────────────────────────────────────────────────────────────
  const summary = records.reduce((acc, rec) => {
    const row = getRow(rec);
    acc.totalFinal    += row.finalPayableSalary;
    acc.totalOT       += row.adjOvertimeAmount;
    acc.totalDeduct   += row.adjDeductionAmount;
    acc.hasSlip       += rec.has_slip ? 1 : 0;
    return acc;
  }, { totalFinal: 0, totalOT: 0, totalDeduct: 0, hasSlip: 0 });

  const dirtyCount = Object.values(dirty).filter(Boolean).length;

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '24px 28px', minHeight: '100vh', background: '#f8fafc' }}>

      {/* ── Page Header ──────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <div className="hrms-responsive-toolbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "#eef4fb", display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FaMoneyBillWave size={16} color="#1f4e79" />
            </div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#1e293b' }}>Payroll Adjustment</h1>
          </div>
          <button
            className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1"
            onClick={() => navigate(-1)}
          >
            <FaArrowLeft size={12} /> Back
          </button>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
          Set actual salary earned per employee. Overtime and deductions are calculated automatically.
        </p>
      </div>

      {/* ── Controls bar ─────────────────────────────────────────────────────── */}
      <div style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)', marginBottom: 20, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div className="hrms-responsive-toolbar" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>Year</label>
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            style={selectStyle}
          >
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="hrms-responsive-toolbar" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>Month</label>
          <select
            value={month}
            onChange={e => setMonth(Number(e.target.value))}
            style={selectStyle}
          >
            {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <button
          onClick={loadPayroll}
          disabled={loading}
          style={{ ...primaryBtn, background: '#1e3a5f' }}
        >
          {loading ? <Spinner size="sm" animation="border" style={{ width: 12, height: 12 }} /> : <FaSync size={11} />}
          {loading ? 'Loading…' : 'Load Payroll'}
        </button>

        <div className="hrms-responsive-toolbar" style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button
            onClick={handleSaveAll}
            disabled={dirtyCount === 0}
            style={{
              ...primaryBtn,
              background: dirtyCount > 0 ? '#16a34a' : '#e2e8f0',
              color:      dirtyCount > 0 ? '#fff'    : '#94a3b8',
              cursor:     dirtyCount === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            <FaSave size={11} />
            Save All {dirtyCount > 0 ? `(${dirtyCount})` : ''}
          </button>
        </div>
      </div>

      {/* ── Bulk PF/PT toolbar ───────────────────────────────────────────────── */}
      {records.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 12, padding: '14px 20px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)', marginBottom: 20, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>
            Bulk PF / PT{selectedIds.size > 0 ? ` — ${selectedIds.size} selected` : ''}
          </span>
          <div className="hrms-responsive-toolbar" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>PF (₹)</label>
            <input
              type="number" min="0" step="1" placeholder="e.g. 1800"
              value={bulkPf}
              onChange={e => setBulkPf(e.target.value)}
              style={{ width: 90, padding: '6px 8px', fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0', outline: 'none' }}
            />
          </div>
          <div className="hrms-responsive-toolbar" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>PT (₹)</label>
            <input
              type="number" min="0" step="1" placeholder="e.g. 200"
              value={bulkPt}
              onChange={e => setBulkPt(e.target.value)}
              style={{ width: 90, padding: '6px 8px', fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0', outline: 'none' }}
            />
          </div>
          <button
            onClick={applyBulkPfPt}
            disabled={selectedIds.size === 0}
            style={{
              ...primaryBtn,
              background: selectedIds.size > 0 ? "#1f4e79" : '#e2e8f0',
              color:      selectedIds.size > 0 ? '#fff'    : '#94a3b8',
              cursor:     selectedIds.size === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            Apply to {selectedIds.size || 0} selected
          </button>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>
            Select employees below, enter a value, apply — then Save All to persist. 0 is valid (PF/PT-exempt).
          </span>
        </div>
      )}

      {/* ── Summary cards ────────────────────────────────────────────────────── */}
      {records.length > 0 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          {[
            { label: 'Employees',       value: records.length,          color: "#1f4e79", suffix: '' },
            { label: 'Slips Generated', value: summary.hasSlip,         color: '#0369a1', suffix: '' },
            { label: 'Total OT',        value: fmt(summary.totalOT),    color: '#16a34a', suffix: '' },
            { label: 'Total Deductions',value: fmt(summary.totalDeduct),color: '#dc2626', suffix: '' },
            { label: 'Total Payable',   value: fmt(summary.totalFinal), color: '#1e3a5f', suffix: '' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: '#fff', borderRadius: 10, padding: '12px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', minWidth: 140 }}>
              <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Formula hint ─────────────────────────────────────────────────────── */}
      <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '10px 16px', marginBottom: 20, fontSize: 12, color: '#1d4ed8', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <FaInfoCircle size={13} style={{ marginTop: 1, flexShrink: 0 }} />
        <span>
          <b>Calculation:</b>&nbsp;
          Difference = Earned − Monthly &nbsp;|&nbsp;
          If Diff &gt; 0 → Overtime = Diff &nbsp;|&nbsp;
          If Diff &lt; 0 → Deduction = |Diff| &nbsp;|&nbsp;
          <b>Final = Monthly + Overtime − Deduction</b>&nbsp;|&nbsp;
          OT Hours = OT Amount ÷ (Monthly ÷ WorkingDays ÷ ShiftHours)
        </span>
      </div>

      {/* ── Table ────────────────────────────────────────────────────────────── */}
      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 6px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <Spinner animation="border" style={{ color: "#1f4e79" }} />
            <div style={{ marginTop: 14, fontSize: 13, color: '#94a3b8' }}>Loading payroll data…</div>
          </div>
        ) : records.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
            <FaMoneyBillWave size={32} style={{ marginBottom: 12, opacity: 0.3 }} />
            <div style={{ fontSize: 14 }}>No active employees found</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <PaginatedTable searchable style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#1e3a5f', color: '#fff' }}>
                  <th style={{ padding: '11px 12px', textAlign: 'center', borderRight: '1px solid rgba(255,255,255,0.08)', width: 36 }}>
                    <input
                      type="checkbox"
                      checked={records.length > 0 && selectedIds.size === records.length}
                      onChange={toggleSelectAll}
                      title="Select all"
                    />
                  </th>
                  {[
                    'Employee', 'Code', 'Monthly Salary',
                    'Salary Earned\nThis Month', 'Shift Hrs', 'PF (₹)', 'PT (₹)',
                    'Difference', 'OT Amount', 'OT Hours',
                    'Deduction', 'Final Payable', 'Status', 'Action'
                  ].map(h => (
                    <th key={h} style={{ padding: '11px 12px', fontWeight: 600, textAlign: 'left', whiteSpace: 'pre-wrap', fontSize: 11, letterSpacing: 0.3, borderRight: '1px solid rgba(255,255,255,0.08)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map((rec, idx) => {
                  const row       = getRow(rec);
                  const isSaving  = saving[rec.employee_id];
                  const isDirty   = dirty[rec.employee_id];
                  const isSaved   = saved[rec.employee_id];
                  const isSelected = selectedIds.has(rec.employee_id);
                  const earnedNum = row.salaryEarned === '' ? rec.monthly_salary : Number(row.salaryEarned);
                  const pfNum = row.pfAmount === '' ? null : Number(row.pfAmount);
                  const ptNum = row.ptAmount === '' ? null : Number(row.ptAmount);
                  const isPfPtInvalid = (pfNum !== null && (isNaN(pfNum) || pfNum < 0)) || (ptNum !== null && (isNaN(ptNum) || ptNum < 0));
                  const isInvalid = isNaN(earnedNum) || earnedNum < 0 || isPfPtInvalid;

                  return (
                    <tr
                      key={rec.employee_id}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        background: isDirty ? '#fffbeb' : idx % 2 === 0 ? '#fff' : '#fafafa',
                        transition: 'background 0.15s',
                      }}
                    >
                      {/* Select */}
                      <td style={{ padding: '10px 12px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(rec.employee_id)} />
                      </td>

                      {/* Employee */}
                      <td style={{ padding: '10px 12px', fontWeight: 600, color: '#1e293b' }}>
                        <div>{rec.first_name} {rec.last_name}</div>
                        {rec.designation && (
                          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>{rec.designation}</div>
                        )}
                      </td>

                      {/* Code */}
                      <td style={{ padding: '10px 12px', color: '#64748b', fontFamily: 'monospace', fontSize: 11 }}>
                        {rec.employee_id}
                      </td>

                      {/* Monthly Salary */}
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: '#1e3a5f' }}>
                        {fmt(rec.monthly_salary)}
                      </td>

                      {/* Salary Earned — editable */}
                      <td style={{ padding: '8px 10px' }}>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={row.salaryEarned}
                          onChange={e => handleChange(rec.employee_id, 'salary_earned', e.target.value)}
                          style={{
                            width: 100, padding: '5px 8px', fontSize: 12, fontWeight: 600,
                            border: `1.5px solid ${isInvalid ? '#fca5a5' : isDirty ? '#fbbf24' : '#e2e8f0'}`,
                            borderRadius: 7, outline: 'none', textAlign: 'right',
                            background: isInvalid ? '#fef2f2' : '#fff',
                            color: '#1e293b',
                          }}
                          onFocus={e => e.target.select()}
                        />
                        {isInvalid && (
                          <div style={{ fontSize: 9, color: '#dc2626', marginTop: 2 }}>Invalid</div>
                        )}
                      </td>

                      {/* Shift Hours — editable */}
                      <td style={{ padding: '8px 10px' }}>
                        <input
                          type="number"
                          min="1"
                          max="24"
                          step="0.5"
                          value={row.shiftHours}
                          onChange={e => handleChange(rec.employee_id, 'shift_hours', e.target.value)}
                          style={{
                            width: 54, padding: '5px 6px', fontSize: 12, fontWeight: 600,
                            border: `1.5px solid ${isDirty ? '#fbbf24' : '#e2e8f0'}`,
                            borderRadius: 7, outline: 'none', textAlign: 'center',
                            background: '#fff', color: '#475569',
                          }}
                          onFocus={e => e.target.select()}
                        />
                      </td>

                      {/* PF — editable, blank = default (₹1800), 0 valid (exempt) */}
                      <td style={{ padding: '8px 10px' }}>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          placeholder="1800"
                          value={row.pfAmount}
                          onChange={e => handleChange(rec.employee_id, 'pf_amount', e.target.value)}
                          style={{
                            width: 80, padding: '5px 8px', fontSize: 12, fontWeight: 600,
                            border: `1.5px solid ${isPfPtInvalid ? '#fca5a5' : isDirty ? '#fbbf24' : '#e2e8f0'}`,
                            borderRadius: 7, outline: 'none', textAlign: 'right',
                            background: isPfPtInvalid ? '#fef2f2' : '#fff',
                            color: '#1e293b',
                          }}
                          onFocus={e => e.target.select()}
                        />
                      </td>

                      {/* PT — editable, blank = default (₹200), 0 valid (exempt) */}
                      <td style={{ padding: '8px 10px' }}>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          placeholder="200"
                          value={row.ptAmount}
                          onChange={e => handleChange(rec.employee_id, 'pt_amount', e.target.value)}
                          style={{
                            width: 70, padding: '5px 8px', fontSize: 12, fontWeight: 600,
                            border: `1.5px solid ${isPfPtInvalid ? '#fca5a5' : isDirty ? '#fbbf24' : '#e2e8f0'}`,
                            borderRadius: 7, outline: 'none', textAlign: 'right',
                            background: isPfPtInvalid ? '#fef2f2' : '#fff',
                            color: '#1e293b',
                          }}
                          onFocus={e => e.target.select()}
                        />
                      </td>

                      {/* Difference */}
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        <DiffBadge value={row.difference} />
                      </td>

                      {/* OT Amount */}
                      <td style={{ padding: '10px 12px', fontWeight: 600, color: row.adjOvertimeAmount > 0 ? '#16a34a' : '#94a3b8', textAlign: 'right' }}>
                        {row.adjOvertimeAmount > 0 ? fmt(row.adjOvertimeAmount) : '—'}
                      </td>

                      {/* OT Hours */}
                      <td style={{ padding: '10px 12px', color: row.adjOvertimeHours > 0 ? '#0369a1' : '#94a3b8', textAlign: 'center' }}>
                        {row.adjOvertimeHours > 0 ? `${fmtNum(row.adjOvertimeHours)}h` : '—'}
                      </td>

                      {/* Deduction */}
                      <td style={{ padding: '10px 12px', fontWeight: 600, color: row.adjDeductionAmount > 0 ? '#dc2626' : '#94a3b8', textAlign: 'right' }}>
                        {row.adjDeductionAmount > 0 ? fmt(row.adjDeductionAmount) : '—'}
                      </td>

                      {/* Final Payable */}
                      <td style={{ padding: '10px 12px', fontWeight: 800, color: '#1e3a5f', fontSize: 13, textAlign: 'right' }}>
                        {fmt(row.finalPayableSalary)}
                      </td>

                      {/* Status */}
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        {isSaved ? (
                          <span style={{ color: '#16a34a', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3 }}>
                            <FaCheckCircle size={10} /> Saved
                          </span>
                        ) : isDirty ? (
                          <span style={{ color: '#d97706', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3 }}>
                            <FaExclamationCircle size={10} /> Unsaved
                          </span>
                        ) : rec.has_slip ? (
                          <span style={{ background: '#dcfce7', color: '#16a34a', borderRadius: 10, padding: '2px 8px', fontSize: 10, fontWeight: 700 }}>
                            ✓ Slip exists
                          </span>
                        ) : (
                          <span style={{ background: '#f1f5f9', color: '#94a3b8', borderRadius: 10, padding: '2px 8px', fontSize: 10 }}>
                            No slip
                          </span>
                        )}
                      </td>

                      {/* Save button */}
                      <td style={{ padding: '8px 10px' }}>
                        <button
                          onClick={() => handleSave(rec)}
                          disabled={isSaving || isInvalid || (!isDirty && isSaved)}
                          title="Save adjustment for this employee"
                          style={{
                            padding: '5px 12px', fontSize: 11, borderRadius: 7, border: 'none',
                            background: isSaving ? '#e2e8f0' : isDirty ? '#1e3a5f' : '#f1f5f9',
                            color: isSaving ? '#94a3b8' : isDirty ? '#fff' : '#94a3b8',
                            cursor: (isSaving || isInvalid) ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600,
                            opacity: isInvalid ? 0.5 : 1,
                          }}
                        >
                          {isSaving
                            ? <Spinner size="sm" animation="border" style={{ width: 10, height: 10 }} />
                            : <FaSave size={10} />}
                          {isSaving ? '…' : 'Save'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </PaginatedTable>
          </div>
        )}
      </div>

      {/* ── Footer hint ──────────────────────────────────────────────────────── */}
      {records.length > 0 && (
        <div style={{ marginTop: 14, fontSize: 11, color: '#94a3b8', textAlign: 'center' }}>
          Rows highlighted in yellow have unsaved changes.
          After saving, go to the employee profile → Payroll tab to generate / regenerate the salary slip.
        </div>
      )}
    </div>
  );
};

// ── Shared micro styles ────────────────────────────────────────────────────────
const selectStyle = {
  padding: '6px 10px', fontSize: 12, borderRadius: 8,
  border: '1px solid #e2e8f0', background: '#fff', color: '#1e293b',
  outline: 'none', cursor: 'pointer',
};

const primaryBtn = {
  padding: '7px 14px', fontSize: 12, borderRadius: 8, border: 'none',
  background: "#1f4e79", color: '#fff', cursor: 'pointer', fontWeight: 600,
  display: 'flex', alignItems: 'center', gap: 6,
};

export default PayrollAdjustment;
