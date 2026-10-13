import PaginatedTable from '../../Common/PaginatedTable';
// src/components/Admin/Payroll/PayrollPreviewTab.jsx
// Payroll preview before generation: attendance-driven Present/Absent/Half-Day (from the
// same calculateAttendanceSummary the real slip generation uses — not a second calculation),
// Salary Earned/Shift Hours adjustment (evolved from the old PayrollAdjustment.jsx), and a
// "Validate Payroll" pass that surfaces missing config as warnings before anyone generates.
import React, { useState, useRef, useMemo } from 'react';
import { Spinner } from 'react-bootstrap';
import { FaSave, FaCheckCircle, FaExclamationCircle, FaExclamationTriangle, FaSearch, FaUserSlash } from 'react-icons/fa';
import axios from '../../../config/axios';
import API_ENDPOINTS from '../../../config/api';
import { useNotification } from '../../../context/NotificationContext';

const fmt = (v) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(Number(v) || 0);

// Instant single-employee exclude/include — a quicker alternative to the checkbox+bulk-button
// flow when you only need to flip one person at a time.
const ToggleSwitch = ({ checked, onChange, busy }) => (
  <button
    onClick={onChange}
    disabled={busy}
    title={checked ? 'Excluded from payroll — click to re-include' : 'Click to exclude from payroll'}
    style={{
      width: 38, height: 20, borderRadius: 999, border: 'none', position: 'relative', flexShrink: 0,
      background: checked ? '#dc2626' : '#cbd5e1', cursor: busy ? 'not-allowed' : 'pointer',
      transition: 'background 0.18s ease', padding: 0, opacity: busy ? 0.6 : 1,
    }}
  >
    <span style={{
      position: 'absolute', top: 2, left: checked ? 20 : 2, width: 16, height: 16, borderRadius: '50%',
      background: '#fff', transition: 'left 0.18s ease', boxShadow: '0 1px 2px rgba(0,0,0,0.35)',
    }} />
  </button>
);

const PayrollPreviewTab = ({ month, year, cycleLabel, records, refetch }) => {
  const { showNotification } = useNotification();
  const [edits, setEdits] = useState({});
  const [dirty, setDirty] = useState({});
  const [saved, setSaved] = useState({});
  const [saving, setSaving] = useState({});
  const [warningsOpen, setWarningsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const debounceRef = useRef({});

  // Multi-select bulk exclude — reuses the same exclude_from_payroll flag/endpoint the
  // Excluded Employees tab already uses one-at-a-time (see ExcludedEmployeesTab.jsx).
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkExcluding, setBulkExcluding] = useState(false);
  const [togglingId, setTogglingId] = useState(null);

  const visibleRecords = records
    .filter(r => !search.trim() ||
      `${r.first_name} ${r.last_name}`.toLowerCase().includes(search.trim().toLowerCase()) ||
      r.employee_id.toLowerCase().includes(search.trim().toLowerCase())
    )
    .sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`));

  const getRow = (rec) => {
    const e = edits[rec.employee_id] || {};
    const value = (key, fallback) => e[key] !== undefined ? e[key] : String(fallback ?? 0);
    const salaryEarned = value('salary_earned', Number(rec.basic_salary ?? rec.salary_earned ?? rec.monthly_salary) + Number(rec.overtime_amount ?? 0));
    const pf = value('pf_amount', rec.pf_amount ?? 1800);
    const tax = value('professional_tax_amount', rec.professional_tax_amount ?? 0);
    const deduction = value('deduction', rec.adj_deduction_amount ?? 0);
    const fixed = Number(year) > 2026 || (Number(year) === 2026 && Number(month) >= 5) ? Number(pf) + Number(tax) : 200;
    const final = Math.max(0, Number(salaryEarned) - fixed - Number(deduction) - Number(rec.custom_deduction ?? 0));
    return { salaryEarned, shiftHours: value('shift_hours', rec.shift_hours ?? 8),
      present_days: value('present_days', rec.present_days), absent_days: value('absent_days', rec.absent_days), half_days: value('half_days', rec.half_days),
      pf_amount: pf, professional_tax_amount: tax, deduction,
      difference: value('difference', Number(salaryEarned) - Number(rec.monthly_salary)),
      final_payable: value('final_payable', Object.keys(e).length ? final : rec.final_payable_salary ?? final) };
  };
  const payrollInput = (rec, row, field, label, step = '0.01') => <input aria-label={label + ' for ' + rec.employee_id} type="number" min={field === 'difference' ? undefined : 0} step={step} value={row[field]} disabled={rec.is_paid || rec.exclude_from_payroll} onChange={event => {
    const value = event.target.value;
    handleChange(rec.employee_id, field, value);
    if (['present_days', 'absent_days', 'half_days'].includes(field)) {
      const eligible = Number(rec.eligible_working_days ?? rec.total_working_days);
      const rate = Number(rec.monthly_salary) / Number(rec.total_working_days || 1);
      const paid = field === 'present_days' ? Number(value) + Number(rec.paid_leave_days ?? 0)
        : eligible - Number(field === 'absent_days' ? value : row.absent_days) - Number(rec.unpaid_leave_days ?? 0) - Number(field === 'half_days' ? value : row.half_days) * 0.5;
      handleChange(rec.employee_id, 'salary_earned', String(Math.max(0, Math.min(eligible, paid)) * rate));
      handleChange(rec.employee_id, 'deduction', '0');
    }
    if (field === 'difference') handleChange(rec.employee_id, 'salary_earned', String(Number(rec.monthly_salary) + Number(value)));
    if (field === 'salaryEarned') handleChange(rec.employee_id, 'salary_earned', value);
    if (field !== 'final_payable') setEdits(prev => { const next = { ...prev, [rec.employee_id]: { ...prev[rec.employee_id] } }; delete next[rec.employee_id].final_payable; if (field !== 'difference') delete next[rec.employee_id].difference; return next; });
  }} style={{ width: 90, padding: '5px 6px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 12 }} />;

  const handleChange = (employeeId, field, value) => {
    setEdits(prev => {
      const row = { ...(prev[employeeId] || {}), [field]: value };
      if (field === 'salary_earned') { delete row.final_payable; delete row.difference; }
      return { ...prev, [employeeId]: row };
    });
    setDirty(prev => ({ ...prev, [employeeId]: true }));
    setSaved(prev => { const n = { ...prev }; delete n[employeeId]; return n; });
    clearTimeout(debounceRef.current[employeeId]);
  };

  const handleClear = (employeeId) => {
    if (saving[employeeId]) return;
    clearTimeout(debounceRef.current[employeeId]);
    setEdits(prev => { const next = { ...prev }; delete next[employeeId]; return next; });
    setDirty(prev => { const next = { ...prev }; delete next[employeeId]; return next; });
    setSaved(prev => { const next = { ...prev }; delete next[employeeId]; return next; });
  };
  const handleClearAll = () => {
    Object.keys(dirty).forEach(handleClear);
  };

  const handleSave = async (rec) => {
    const row = getRow(rec);
    for (const field of ['present_days', 'absent_days', 'half_days', 'pf_amount', 'professional_tax_amount', 'deduction', 'final_payable']) {
      if (row[field] === '' || !Number.isFinite(Number(row[field])) || Number(row[field]) < 0) {
        showNotification('Enter a valid non-negative value for ' + field.replaceAll('_', ' '), 'danger'); return false;
      }
    }
    const earnedNum = row.salaryEarned === '' ? rec.monthly_salary : Number(row.salaryEarned);
    if (isNaN(earnedNum) || earnedNum < 0) { showNotification('Salary Earned cannot be negative or empty', 'danger'); return; }
    setSaving(prev => ({ ...prev, [rec.employee_id]: true }));
    try {
      await axios.post(API_ENDPOINTS.SALARY_ADJUSTMENT, {
        employee_id: rec.employee_id, month, year, payroll_edit: true,
        present_days: Number(row.present_days), absent_days: Number(row.absent_days), half_days: Number(row.half_days),
        pf_amount: Number(row.pf_amount), professional_tax_amount: Number(row.professional_tax_amount),
        deduction: Number(row.deduction), final_payable: Number(row.final_payable),
        salary_earned: parseFloat(earnedNum.toFixed(2)),
        shift_hours: parseFloat(row.shiftHours) || 8,
      });
      setSaved(prev => ({ ...prev, [rec.employee_id]: true }));
      setDirty(prev => { const n = { ...prev }; delete n[rec.employee_id]; return n; });
      setEdits(prev => { const n = { ...prev }; delete n[rec.employee_id]; return n; });
      refetch();
      return true;
    } catch (err) {
      showNotification(err.response?.data?.message || `Failed to save ${rec.first_name}`, 'danger');
      return false;
    } finally {
      setSaving(prev => { const n = { ...prev }; delete n[rec.employee_id]; return n; });
    }
  };

  const handleSaveAll = async () => {
    const dirtyIds = Object.keys(dirty).filter(id => dirty[id]);
    if (dirtyIds.length === 0) { showNotification('No unsaved changes', 'info'); return; }
    let savedCount = 0;
    for (const id of dirtyIds) {
      const rec = records.find(r => r.employee_id === id);
      if (rec && await handleSave(rec)) savedCount++;
    }
    showNotification(`Saved ${savedCount} of ${dirtyIds.length} record(s)`, 'success');
    refetch();
  };

  // Only not-yet-excluded rows are selectable — bulk action here is one-directional
  // (exclude), matching what was asked; un-excluding stays a one-at-a-time action in the
  // Excluded Employees tab.
  const selectableRecords = visibleRecords.filter(r => !r.exclude_from_payroll);
  const allSelected = selectableRecords.length > 0 && selectableRecords.every(r => selectedIds.has(r.employee_id));

  const toggleSelect = (employeeId) => setSelectedIds(prev => {
    const next = new Set(prev);
    next.has(employeeId) ? next.delete(employeeId) : next.add(employeeId);
    return next;
  });

  const toggleSelectAll = () => setSelectedIds(prev => {
    const next = new Set(prev);
    if (allSelected) selectableRecords.forEach(r => next.delete(r.employee_id));
    else selectableRecords.forEach(r => next.add(r.employee_id));
    return next;
  });

  const clearSelection = () => setSelectedIds(new Set());

  const handleBulkExclude = async () => {
    const targets = records.filter(r => selectedIds.has(r.employee_id));
    if (targets.length === 0) return;
    if (!window.confirm(`Exclude ${targets.length} employee(s) from payroll? They will no longer appear in the payroll Excel export.`)) return;
    setBulkExcluding(true);
    try {
      const results = await Promise.allSettled(
        targets.map(rec => axios.put(API_ENDPOINTS.EMPLOYEE_BY_ID(rec.id), { exclude_from_payroll: true }))
      );
      const ok = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.length - ok;
      showNotification(`${ok} employee(s) excluded from payroll${failed ? `, ${failed} failed` : ''}.`, failed ? 'warning' : 'success');
      clearSelection();
      refetch();
    } finally {
      setBulkExcluding(false);
    }
  };

  const handleToggleExclude = async (rec) => {
    const nextValue = !rec.exclude_from_payroll;
    setTogglingId(rec.employee_id);
    try {
      await axios.put(API_ENDPOINTS.EMPLOYEE_BY_ID(rec.id), { exclude_from_payroll: nextValue });
      showNotification(`${rec.first_name} ${rec.last_name} ${nextValue ? 'excluded from' : 're-included in'} payroll`, 'success');
      setSelectedIds(prev => { const n = new Set(prev); n.delete(rec.employee_id); return n; });
      refetch();
    } catch (err) {
      showNotification(err.response?.data?.message || 'Failed to update exclusion', 'danger');
    } finally {
      setTogglingId(null);
    }
  };

  // ── Validate Payroll ─────────────────────────────────────────────────────────
  const warnings = useMemo(() => {
    const missingSalary = records.filter(r => !r.monthly_salary || r.monthly_salary <= 0);
    const missingPfPt = records.filter(r => !r.exclude_from_payroll && (r.pf_amount == null || r.professional_tax_amount == null));
    const missingAttendance = records.filter(r =>
      !r.exclude_from_payroll &&
      (r.present_days == null || (Number(r.present_days) + Number(r.half_days || 0) + Number(r.absent_days || 0) + Number(r.paid_leave_days || 0) + Number(r.unpaid_leave_days || 0)) === 0)
    );
    const excludedButPresent = records.filter(r => r.exclude_from_payroll);
    return { missingSalary, missingPfPt, missingAttendance, excludedButPresent };
  }, [records]);

  const totalWarnings = warnings.missingSalary.length + warnings.missingPfPt.length + warnings.missingAttendance.length;

  const dirtyCount = Object.values(dirty).filter(Boolean).length;

  return (
    <div className="d-flex flex-column gap-3">

      {/* Payroll Period */}
      <div style={{ background: "#eef4fb", border: '1px solid #c7d2fe', borderRadius: 10, padding: '10px 16px', fontSize: 13, color: '#3730a3', fontWeight: 600 }}>
        Payroll Period: {cycleLabel}
      </div>

      {/* Validate Payroll */}
      <div style={{ background: '#fff', borderRadius: 12, padding: '14px 20px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
        <button
          onClick={() => setWarningsOpen(o => !o)}
          style={{
            border: 'none', background: totalWarnings > 0 ? '#fef3c7' : '#dcfce7',
            color: totalWarnings > 0 ? '#b45309' : '#16a34a', borderRadius: 10, padding: '8px 16px',
            fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          <FaExclamationTriangle size={12} />
          {totalWarnings === 0 ? 'Validate Payroll — no issues found' : `Validate Payroll — ${totalWarnings} issue(s) found`}
        </button>
        {warningsOpen && (
          <div className="mt-3" style={{ fontSize: 12, color: '#475569' }}>
            {warnings.missingSalary.length > 0 && <div className="mb-1">⚠️ {warnings.missingSalary.length} employee(s) have no monthly salary configured.</div>}
            {warnings.missingPfPt.length > 0 && <div className="mb-1">⚠️ {warnings.missingPfPt.length} employee(s) have missing PF / Professional Tax configuration (will use defaults).</div>}
            {warnings.missingAttendance.length > 0 && <div className="mb-1">⚠️ {warnings.missingAttendance.length} employee(s) have no attendance recorded for this period.</div>}
            {warnings.excludedButPresent.length > 0 && <div className="mb-1">ℹ️ {warnings.excludedButPresent.length} employee(s) in this list are excluded from payroll and will not receive a slip.</div>}
            {totalWarnings === 0 && <div>All employees in this view have salary, PF / Professional Tax, and attendance configured.</div>}
          </div>
        )}
      </div>

      {/* Search + Save All bar */}
      <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
        <div style={{ position: 'relative', maxWidth: 320, flex: 1 }}>
          <FaSearch size={11} style={{ position: 'absolute', left: 12, top: 12, color: '#94a3b8' }} />
          <input
            type="text" placeholder="Search by name or employee ID…" value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '9px 12px 9px 30px', fontSize: 12, borderRadius: 10, border: '1px solid #e2e8f0', outline: 'none', background: '#fff' }}
          />
        </div>
        <div className="d-flex align-items-center gap-2">
          {selectedIds.size > 0 && (
            <button onClick={clearSelection} style={{ padding: '7px 12px', fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontWeight: 600, cursor: 'pointer' }}>
              Clear ({selectedIds.size})
            </button>
          )}
          <button
            onClick={handleBulkExclude}
            disabled={bulkExcluding || selectedIds.size === 0}
            title={selectedIds.size === 0 ? 'Check employees in the table below to exclude them from payroll' : undefined}
            style={{
              padding: '7px 14px', fontSize: 12, borderRadius: 8, border: 'none', fontWeight: 700,
              background: selectedIds.size > 0 ? '#dc2626' : '#e2e8f0', color: selectedIds.size > 0 ? '#fff' : '#94a3b8',
              cursor: (bulkExcluding || selectedIds.size === 0) ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 6, opacity: bulkExcluding ? 0.7 : 1,
            }}
          >
            {bulkExcluding ? <Spinner animation="border" size="sm" style={{ width: 11, height: 11 }} /> : <FaUserSlash size={11} />}
            {bulkExcluding ? 'Excluding…' : `Exclude Selected${selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}`}
          </button>
        </div>
        <button
          onClick={handleSaveAll}
          disabled={dirtyCount === 0}
          style={{
            padding: '7px 14px', fontSize: 12, borderRadius: 8, border: 'none', fontWeight: 600,
            background: dirtyCount > 0 ? '#16a34a' : '#e2e8f0', color: dirtyCount > 0 ? '#fff' : '#94a3b8',
            cursor: dirtyCount === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <FaSave size={11} /> Save All {dirtyCount > 0 ? `(${dirtyCount})` : ''}
        </button>
        <button type="button" onClick={handleClearAll} disabled={dirtyCount === 0 || Object.values(saving).some(Boolean)}
          title="Discard all unsaved payroll edits" style={{ padding: '7px 14px', fontSize: 12, borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#475569', opacity: dirtyCount === 0 ? 0.5 : 1 }}>
          Clear All
        </button>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 6px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        {visibleRecords.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 13 }}>No employees match this filter.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <PaginatedTable style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#1e3a5f', color: '#fff' }}>
                  <th style={{ padding: '11px 10px', width: 30 }}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      disabled={selectableRecords.length === 0}
                      onChange={toggleSelectAll}
                      title="Select all (excludable) employees on this page"
                      style={{ cursor: selectableRecords.length ? 'pointer' : 'not-allowed' }}
                    />
                  </th>
                  {['Exclude', 'Employee', 'Code', 'Salary', 'Present', 'Absent', 'Half Day', 'Salary Earned', 'Shift Hrs', 'PF', 'Professional Tax', 'Difference', 'Deduction', 'Final Payable', 'Status', 'Action'].map(h => (
                    <th key={h} style={{ padding: '11px 10px', fontWeight: 600, textAlign: 'left', fontSize: 11, letterSpacing: 0.3, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRecords.map((rec, idx) => {
                  const row = getRow(rec);
                  const isDirty = dirty[rec.employee_id];
                  const isSaved = saved[rec.employee_id];
                  const isSaving = saving[rec.employee_id];
                  const earnedNum = row.salaryEarned === '' ? rec.monthly_salary : Number(row.salaryEarned);
                  const isInvalid = isNaN(earnedNum) || earnedNum < 0;
                  return (
                    <tr key={rec.employee_id} style={{ borderBottom: '1px solid #f1f5f9', background: selectedIds.has(rec.employee_id) ? '#fef2f2' : rec.exclude_from_payroll ? '#f8fafc' : isDirty ? '#fffbeb' : idx % 2 === 0 ? '#fff' : '#fafafa', opacity: rec.exclude_from_payroll ? 0.55 : 1 }}>
                      <td style={{ padding: '10px 10px' }}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(rec.employee_id)}
                          disabled={rec.exclude_from_payroll}
                          onChange={() => toggleSelect(rec.employee_id)}
                          title={rec.exclude_from_payroll ? 'Already excluded from payroll' : 'Select for bulk exclude'}
                          style={{ cursor: rec.exclude_from_payroll ? 'not-allowed' : 'pointer' }}
                        />
                      </td>
                      <td style={{ padding: '10px 10px' }}>
                        <ToggleSwitch
                          checked={!!rec.exclude_from_payroll}
                          busy={togglingId === rec.employee_id}
                          onChange={() => handleToggleExclude(rec)}
                        />
                      </td>
                      <td style={{ padding: '10px 10px', fontWeight: 600, color: '#1e293b' }}>
                        {rec.first_name} {rec.last_name}
                        {rec.exclude_from_payroll && <div style={{ fontSize: 9, color: '#dc2626', fontWeight: 700 }}>EXCLUDED</div>}
                      </td>
                      <td style={{ padding: '10px 10px', color: '#64748b', fontFamily: 'monospace', fontSize: 11 }}>{rec.employee_id}</td>
                      <td style={{ padding: '10px 10px', fontWeight: 700, color: '#1e3a5f' }}>{fmt(rec.monthly_salary)}</td>
                      <td style={{ padding: '8px' }}>{payrollInput(rec, row, 'present_days', 'Present days', '0.5')}</td>
                      <td style={{ padding: '8px' }}>{payrollInput(rec, row, 'absent_days', 'Absent days', '0.5')}</td>
                      <td style={{ padding: '8px' }}>{payrollInput(rec, row, 'half_days', 'Half days', '1')}</td>
                      <td style={{ padding: '8px 8px' }}>
                        <input
                          type="number" min="0" step="0.01" value={row.salaryEarned}
                          onChange={e => handleChange(rec.employee_id, 'salary_earned', e.target.value)}
                          style={{ width: 90, padding: '5px 6px', fontSize: 11, fontWeight: 600, border: `1.5px solid ${isInvalid ? '#fca5a5' : isDirty ? '#fbbf24' : '#e2e8f0'}`, borderRadius: 6, outline: 'none', textAlign: 'right', background: isInvalid ? '#fef2f2' : '#fff' }}
                          onFocus={e => e.target.select()}
                        />
                      </td>
                      <td style={{ padding: '8px 8px' }}>
                        <input
                          type="number" min="1" max="24" step="0.5" value={row.shiftHours}
                          onChange={e => handleChange(rec.employee_id, 'shift_hours', e.target.value)}
                          style={{ width: 48, padding: '5px 6px', fontSize: 11, fontWeight: 600, border: `1.5px solid ${isDirty ? '#fbbf24' : '#e2e8f0'}`, borderRadius: 6, outline: 'none', textAlign: 'center' }}
                          onFocus={e => e.target.select()}
                        />
                      </td>
                      <td style={{ padding: '8px' }}>{payrollInput(rec, row, 'pf_amount', 'PF', '0.01')}</td>
                      <td style={{ padding: '8px' }}>{payrollInput(rec, row, 'professional_tax_amount', 'Professional Tax', '0.01')}</td>
                      <td style={{ padding: '10px 10px' }}>{payrollInput(rec, row, 'difference', 'Difference')}</td>
                      <td style={{ padding: '10px 10px', fontWeight: 600, color: row.adjDeductionAmount > 0 ? '#dc2626' : '#94a3b8' }}>{payrollInput(rec, row, 'deduction', 'Deduction')}</td>
                      <td style={{ padding: '10px 10px', fontWeight: 800, color: '#1e3a5f' }}>{payrollInput(rec, row, 'final_payable', 'Final payable')}</td>
                      <td style={{ padding: '10px 10px', textAlign: 'center' }}>
                        {isSaved ? <span style={{ color: '#16a34a', fontSize: 11, fontWeight: 700 }}><FaCheckCircle className="me-1" />Saved</span>
                          : isDirty ? <span style={{ color: '#d97706', fontSize: 11, fontWeight: 700 }}><FaExclamationCircle className="me-1" />Unsaved</span>
                          : rec.has_slip ? <span style={{ background: '#dcfce7', color: '#16a34a', borderRadius: 10, padding: '2px 8px', fontSize: 10, fontWeight: 700 }}>✓ Slip exists</span>
                          : <span style={{ background: '#f1f5f9', color: '#94a3b8', borderRadius: 10, padding: '2px 8px', fontSize: 10 }}>No slip</span>}
                      </td>
                      <td style={{ padding: '8px 8px' }}>
                      <div className="hrms-responsive-toolbar" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button
                          onClick={() => handleSave(rec)}
                          disabled={rec.is_paid || rec.exclude_from_payroll || isSaving || isInvalid || (!isDirty && isSaved)}
                          style={{ padding: '5px 10px', fontSize: 11, borderRadius: 7, border: 'none', background: isSaving ? '#e2e8f0' : isDirty ? '#1e3a5f' : '#f1f5f9', color: isSaving ? '#94a3b8' : isDirty ? '#fff' : '#94a3b8', cursor: (isSaving || isInvalid) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600 }}
                        >
                          {isSaving ? <Spinner size="sm" animation="border" style={{ width: 10, height: 10 }} /> : <FaSave size={10} />}
                          {isSaving ? '…' : 'Save'}
                        </button>
                        <button type="button" onClick={() => handleClear(rec.employee_id)} disabled={isSaving || !isDirty}
                          title="Discard unsaved changes and restore saved values" aria-label={'Clear edits for ' + rec.employee_id}
                          style={{ padding: '5px 10px', fontSize: 11, borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff', color: '#475569', cursor: isSaving || !isDirty ? 'not-allowed' : 'pointer', opacity: isSaving || !isDirty ? 0.5 : 1 }}>
                          Clear
                        </button>
                      </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </PaginatedTable>
          </div>
        )}
      </div>
      <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center' }}>
        Save updates the selected payroll slip. Present includes half-day credits. PF and Professional Tax update employee settings. Editing Final Payable reconciles earnings; regenerating a slip recalculates attendance.
      </div>
    </div>
  );
};

export default PayrollPreviewTab;
