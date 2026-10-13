import PaginatedTable from '../../Common/PaginatedTable';
// src/components/Admin/Payroll/PfPtTab.jsx
// PF / Professional Tax management — bulk-select + apply, or edit per row.
// Persists via the existing generic PUT /api/employees/:id (same pattern used for
// isFlexibleShift) — no new backend endpoint.
import React, { useState, useRef } from 'react';
import { Spinner } from 'react-bootstrap';
import { FaSave, FaCheckCircle, FaExclamationCircle, FaSearch, FaUserSlash } from 'react-icons/fa';
import axios from '../../../config/axios';
import API_ENDPOINTS from '../../../config/api';
import { useNotification } from '../../../context/NotificationContext';

const fmt = (v) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(Number(v) || 0);

const inputStyle = (invalid, dirty) => ({
  width: 80, padding: '5px 8px', fontSize: 12, fontWeight: 600,
  border: `1.5px solid ${invalid ? '#fca5a5' : dirty ? '#fbbf24' : '#e2e8f0'}`,
  borderRadius: 7, outline: 'none', textAlign: 'right',
  background: invalid ? '#fef2f2' : '#fff', color: '#1e293b',
});

const primaryBtn = {
  padding: '7px 14px', fontSize: 12, borderRadius: 8, border: 'none',
  cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
};

const isConfigured = (rec) => rec.pf_amount != null && rec.professional_tax_amount != null;

const PfPtTab = ({ records, refetch }) => {
  const { showNotification } = useNotification();

  const [edits, setEdits] = useState({});
  const [dirty, setDirty] = useState({});
  const [saved, setSaved] = useState({});
  const [saving, setSaving] = useState({});
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkPf, setBulkPf] = useState('');
  const [bulkTax, setBulkTax] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all | added | remaining
  const [search, setSearch] = useState('');
  const [bulkExcluding, setBulkExcluding] = useState(false);
  const debounceRef = useRef({});

  // Sorted alphabetically by first name (already the order getBulkPayroll returns, kept
  // explicit here since a search/filter pass shouldn't accidentally lose that ordering).
  const visibleRecords = records
    .filter(r => {
      if (statusFilter === 'added') return isConfigured(r);
      if (statusFilter === 'remaining') return !isConfigured(r);
      return true;
    })
    .filter(r => !search.trim() ||
      `${r.first_name} ${r.last_name}`.toLowerCase().includes(search.trim().toLowerCase()) ||
      r.employee_id.toLowerCase().includes(search.trim().toLowerCase())
    )
    .sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`));

  const addedCount = records.filter(isConfigured).length;
  const remainingCount = records.length - addedCount;

  const getRow = (rec) => {
    const e = edits[rec.employee_id] || {};
    return {
      pf:  e.pf_amount  !== undefined ? e.pf_amount  : (rec.pf_amount  != null ? String(rec.pf_amount)  : ''),
      tax: e.professional_tax_amount !== undefined ? e.professional_tax_amount : (rec.professional_tax_amount != null ? String(rec.professional_tax_amount) : ''),
    };
  };

  const validateRow = (row) => {
    const pfNum = row.pf === '' ? null : Number(row.pf);
    const taxNum = row.tax === '' ? null : Number(row.tax);
    const invalid = (pfNum !== null && (isNaN(pfNum) || pfNum < 0))
      || (taxNum !== null && (isNaN(taxNum) || taxNum < 0));
    return { pfNum, taxNum, invalid };
  };

  const handleChange = (employeeId, field, value) => {
    setEdits(prev => ({ ...prev, [employeeId]: { ...(prev[employeeId] || {}), [field]: value } }));
    setDirty(prev => ({ ...prev, [employeeId]: true }));
    setSaved(prev => { const n = { ...prev }; delete n[employeeId]; return n; });
    clearTimeout(debounceRef.current[employeeId]);
    debounceRef.current[employeeId] = setTimeout(() => {}, 300);
  };

  const toggleSelect = (id) => setSelectedIds(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });
  // Excluded employees are still shown (dimmed) for visibility but excluded from "select all" —
  // there's nothing to bulk-apply PF / Professional Tax to (or exclude again) for someone already excluded.
  const selectableRecords = visibleRecords.filter(r => !r.exclude_from_payroll);
  const allSelected = selectableRecords.length > 0 && selectableRecords.every(r => selectedIds.has(r.employee_id));
  const toggleSelectAll = () => setSelectedIds(prev => {
    const n = new Set(prev);
    if (allSelected) selectableRecords.forEach(r => n.delete(r.employee_id));
    else selectableRecords.forEach(r => n.add(r.employee_id));
    return n;
  });

  // Same exclude_from_payroll flag/endpoint as the Payroll Preview and Excluded Employees
  // tabs — this just gives a second entry point that reuses the selection this tab already has.
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
      setSelectedIds(new Set());
      refetch();
    } finally {
      setBulkExcluding(false);
    }
  };

  const applyBulk = () => {
    if (selectedIds.size === 0) { showNotification('Select at least one employee first', 'warning'); return; }
    if (bulkPf === '' && bulkTax === '') { showNotification('Enter at least one amount to apply', 'warning'); return; }
    const vals = { pf_amount: bulkPf, professional_tax_amount: bulkTax };
    for (const v of Object.values(vals)) {
      if (v !== '' && (isNaN(Number(v)) || Number(v) < 0)) {
        showNotification('PF and Professional Tax must be 0 or a positive amount', 'danger');
        return;
      }
    }
    setEdits(prev => {
      const next = { ...prev };
      selectedIds.forEach(id => {
        next[id] = { ...(next[id] || {}) };
        if (bulkPf !== '') next[id].pf_amount = bulkPf;
        if (bulkTax !== '') next[id].professional_tax_amount = bulkTax;
      });
      return next;
    });
    setDirty(prev => { const n = { ...prev }; selectedIds.forEach(id => { n[id] = true; }); return n; });
    setSaved(prev => { const n = { ...prev }; selectedIds.forEach(id => { delete n[id]; }); return n; });
    showNotification(`Staged PF / Professional Tax for ${selectedIds.size} employee(s) — click "Save All" to persist`, 'success');
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
    const { pfNum, taxNum, invalid } = validateRow(row);
    if (invalid) { showNotification('PF and Professional Tax cannot be negative', 'danger'); return; }

    setSaving(prev => ({ ...prev, [rec.employee_id]: true }));
    try {
      await axios.put(API_ENDPOINTS.EMPLOYEE_BY_ID(rec.id), {
        pf_amount: pfNum, professional_tax_amount: taxNum,
      });
      setSaved(prev => ({ ...prev, [rec.employee_id]: true }));
      setEdits(prev => { const next = { ...prev }; delete next[rec.employee_id]; return next; });
      refetch();
      setDirty(prev => { const n = { ...prev }; delete n[rec.employee_id]; return n; });
      showNotification(`PF / Professional Tax updated for ${rec.first_name} ${rec.last_name}`, 'success');
    } catch (err) {
      showNotification(err.response?.data?.message || `Failed to save ${rec.first_name}`, 'danger');
    } finally {
      setSaving(prev => { const n = { ...prev }; delete n[rec.employee_id]; return n; });
    }
  };

  const handleSaveAll = async () => {
    const dirtyIds = Object.keys(dirty).filter(id => dirty[id]);
    if (dirtyIds.length === 0) { showNotification('No unsaved changes', 'info'); return; }
    let ok = 0;
    for (const id of dirtyIds) {
      const rec = records.find(r => r.employee_id === id);
      if (rec) { await handleSave(rec); ok++; }
    }
    showNotification(`PF / Professional Tax updated successfully for ${ok} employee(s).`, 'success');
    refetch();
  };

  const dirtyCount = Object.values(dirty).filter(Boolean).length;

  return (
    <div className="d-flex flex-column gap-3">

      {/* Search */}
      <div style={{ position: 'relative', maxWidth: 320 }}>
        <FaSearch size={11} style={{ position: 'absolute', left: 12, top: 12, color: '#94a3b8' }} />
        <input
          type="text" placeholder="Search by name or employee ID…" value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', padding: '9px 12px 9px 30px', fontSize: 12, borderRadius: 10, border: '1px solid #e2e8f0', outline: 'none', background: '#fff' }}
        />
      </div>

      {/* Status cards */}
      <div className="d-flex flex-wrap gap-2">
        {[
          { label: 'PF / Professional Tax Added', value: addedCount, active: statusFilter === 'added', color: '#16a34a', key: 'added' },
          { label: 'Remaining to Add', value: remainingCount, active: statusFilter === 'remaining', color: '#d97706', key: 'remaining' },
          { label: 'All', value: records.length, active: statusFilter === 'all', color: "#1f4e79", key: 'all' },
        ].map(c => (
          <button
            key={c.key}
            onClick={() => setStatusFilter(c.key)}
            style={{
              border: `1.5px solid ${c.active ? c.color : '#e2e8f0'}`, borderRadius: 12, padding: '10px 18px',
              background: c.active ? `${c.color}14` : '#fff', cursor: 'pointer', textAlign: 'left', minWidth: 150,
            }}
          >
            <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>{c.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: c.color }}>{c.value}</div>
          </button>
        ))}
      </div>

      {/* Bulk apply toolbar */}
      <div style={{ background: '#fff', borderRadius: 12, padding: '14px 20px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>
          Bulk Update{selectedIds.size > 0 ? ` — ${selectedIds.size} selected` : ''}
        </span>
        {[
          ['PF (₹)', bulkPf, setBulkPf, '1800'],
          ['Professional Tax (₹)', bulkTax, setBulkTax, '0'],
        ].map(([label, val, setter, ph]) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>{label}</label>
            <input
              type="number" min="0" step="1" placeholder={ph} value={val}
              onChange={e => setter(e.target.value)}
              style={{ width: 90, padding: '6px 8px', fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0', outline: 'none' }}
            />
          </div>
        ))}
        <button
          onClick={applyBulk}
          disabled={selectedIds.size === 0}
          style={{ ...primaryBtn, background: selectedIds.size > 0 ? "#1f4e79" : '#e2e8f0', color: selectedIds.size > 0 ? '#fff' : '#94a3b8', cursor: selectedIds.size === 0 ? 'not-allowed' : 'pointer' }}
        >
          Apply to {selectedIds.size || 0} selected
        </button>
        <button
          onClick={handleBulkExclude}
          disabled={selectedIds.size === 0 || bulkExcluding}
          style={{ ...primaryBtn, marginLeft: 'auto', background: selectedIds.size > 0 ? '#dc2626' : '#e2e8f0', color: selectedIds.size > 0 ? '#fff' : '#94a3b8', cursor: (selectedIds.size === 0 || bulkExcluding) ? 'not-allowed' : 'pointer', opacity: bulkExcluding ? 0.7 : 1 }}
        >
          {bulkExcluding ? <Spinner animation="border" size="sm" style={{ width: 11, height: 11 }} /> : <FaUserSlash size={11} />}
          {bulkExcluding ? 'Excluding…' : `Exclude Selected${selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}`}
        </button>
        <button
          onClick={handleSaveAll}
          disabled={dirtyCount === 0}
          style={{ ...primaryBtn, background: dirtyCount > 0 ? '#16a34a' : '#e2e8f0', color: dirtyCount > 0 ? '#fff' : '#94a3b8', cursor: dirtyCount === 0 ? 'not-allowed' : 'pointer' }}
        >
          <FaSave size={11} /> Save All {dirtyCount > 0 ? `(${dirtyCount})` : ''}
        </button>
        <button type="button" onClick={handleClearAll} disabled={dirtyCount === 0 || Object.values(saving).some(Boolean)}
          title="Discard all unsaved payroll edits" style={{ padding: '7px 14px', fontSize: 12, borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#475569', opacity: dirtyCount === 0 ? 0.5 : 1 }}>
          Clear All
        </button>
        <span style={{ fontSize: 11, color: '#94a3b8', width: '100%' }}>
          Blank = use default (₹1800 PF / ₹0 Professional Tax). Explicit 0 is a valid, saved value.
        </span>
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
                  <th style={{ padding: '11px 12px', textAlign: 'center', width: 36 }}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      disabled={selectableRecords.length === 0}
                      onChange={toggleSelectAll}
                      title="Select all (excludable) employees on this page"
                      style={{ cursor: selectableRecords.length ? 'pointer' : 'not-allowed' }}
                    />
                  </th>
                  {['Employee', 'Code', 'Department', 'Monthly Salary', 'PF (₹)', 'Professional Tax (₹)', 'Status', 'Action'].map(h => (
                    <th key={h} style={{ padding: '11px 12px', fontWeight: 600, textAlign: 'left', fontSize: 11, letterSpacing: 0.3 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRecords.map((rec, idx) => {
                  const row = getRow(rec);
                  const { invalid } = validateRow(row);
                  const isDirty = dirty[rec.employee_id];
                  const isSaved = saved[rec.employee_id];
                  const isSaving = saving[rec.employee_id];
                  return (
                    <tr key={rec.employee_id} style={{ borderBottom: '1px solid #f1f5f9', background: selectedIds.has(rec.employee_id) ? '#fef2f2' : rec.exclude_from_payroll ? '#f8fafc' : isDirty ? '#fffbeb' : idx % 2 === 0 ? '#fff' : '#fafafa', opacity: rec.exclude_from_payroll ? 0.55 : 1 }}>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(rec.employee_id)}
                          disabled={rec.exclude_from_payroll}
                          onChange={() => toggleSelect(rec.employee_id)}
                          title={rec.exclude_from_payroll ? 'Already excluded from payroll' : undefined}
                          style={{ cursor: rec.exclude_from_payroll ? 'not-allowed' : 'pointer' }}
                        />
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 600, color: '#1e293b' }}>
                        {rec.first_name} {rec.last_name}
                        {rec.exclude_from_payroll && <div style={{ fontSize: 9, color: '#dc2626', fontWeight: 700 }}>EXCLUDED</div>}
                        {rec.designation && <div style={{ fontSize: 10, color: '#94a3b8' }}>{rec.designation}</div>}
                      </td>
                      <td style={{ padding: '10px 12px', color: '#64748b', fontFamily: 'monospace', fontSize: 11 }}>{rec.employee_id}</td>
                      <td style={{ padding: '10px 12px' }}>{rec.department}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: '#1e3a5f' }}>{fmt(rec.monthly_salary)}</td>
                      {['pf', 'tax'].map((f, fi) => (
                        <td key={f} style={{ padding: '8px 10px' }}>
                          <input
                            type="number" min="0" step="1" placeholder={fi === 0 ? '1800' : '0'}
                            value={row[f]}
                            onChange={e => handleChange(rec.employee_id, f === 'pf' ? 'pf_amount' : 'professional_tax_amount', e.target.value)}
                            style={inputStyle(invalid, isDirty)}
                            onFocus={e => e.target.select()}
                          />
                        </td>
                      ))}
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        {isSaved ? (
                          <span style={{ color: '#16a34a', fontSize: 11, fontWeight: 700 }}><FaCheckCircle className="me-1" />Saved</span>
                        ) : isDirty ? (
                          <span style={{ color: '#d97706', fontSize: 11, fontWeight: 700 }}><FaExclamationCircle className="me-1" />Unsaved</span>
                        ) : isConfigured(rec) ? (
                          <span style={{ background: '#dcfce7', color: '#16a34a', borderRadius: 10, padding: '2px 8px', fontSize: 10, fontWeight: 700 }}>✓ Added</span>
                        ) : (
                          <span style={{ background: '#fef3c7', color: '#b45309', borderRadius: 10, padding: '2px 8px', fontSize: 10, fontWeight: 700 }}>Remaining</span>
                        )}
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button
                          onClick={() => handleSave(rec)}
                          disabled={isSaving || invalid || (!isDirty && isSaved)}
                          style={{
                            padding: '5px 12px', fontSize: 11, borderRadius: 7, border: 'none',
                            background: isSaving ? '#e2e8f0' : isDirty ? '#1e3a5f' : '#f1f5f9',
                            color: isSaving ? '#94a3b8' : isDirty ? '#fff' : '#94a3b8',
                            cursor: (isSaving || invalid) ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600,
                          }}
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
    </div>
  );
};

export default PfPtTab;
