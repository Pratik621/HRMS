// src/components/Admin/Payroll/GenerateSalaryTab.jsx
// Salary generation with confirmation. "All Employees / TL Team / Manager Team / Department"
// selection is the shared filter bar in PayrollCenter (applies consistently across every tab,
// not duplicated here) — this tab adds per-row checkboxes on top of that filtered view for
// "Custom Employee Selection", then calls the existing generate-bulk endpoint (extended
// server-side this session to accept employee_ids and to enforce is_active/exclusion).
import React, { useState } from 'react';
import { Modal, Spinner } from 'react-bootstrap';
import { FaFileInvoiceDollar, FaCheckCircle, FaTimesCircle, FaExclamationCircle, FaSearch } from 'react-icons/fa';
import axios from '../../../config/axios';
import API_ENDPOINTS from '../../../config/api';
import { useNotification } from '../../../context/NotificationContext';

const fmt = (v) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(Number(v) || 0));

const GenerateSalaryTab = ({ month, year, cycleLabel, records, refetch }) => {
  const { showNotification } = useNotification();
  const eligible = records.filter(r => !r.exclude_from_payroll);
  const [selectedIds, setSelectedIds] = useState(() => new Set(eligible.map(r => r.employee_id)));
  const [showConfirm, setShowConfirm] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState(null);
  const [search, setSearch] = useState('');

  // Re-sync selection whenever the underlying filtered record set changes (e.g. filters changed).
  React.useEffect(() => {
    setSelectedIds(new Set(records.filter(r => !r.exclude_from_payroll).map(r => r.employee_id)));
    setResults(null);
  }, [records]);

  const toggleSelect = (id) => setSelectedIds(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });
  const visibleEligible = eligible
    .filter(r => !search.trim() ||
      `${r.first_name} ${r.last_name}`.toLowerCase().includes(search.trim().toLowerCase()) ||
      r.employee_id.toLowerCase().includes(search.trim().toLowerCase())
    )
    .sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`));

  const toggleSelectAll = () => setSelectedIds(prev => {
    const visibleIds = visibleEligible.map(r => r.employee_id);
    const allVisibleSelected = visibleIds.every(id => prev.has(id));
    const n = new Set(prev);
    visibleIds.forEach(id => (allVisibleSelected ? n.delete(id) : n.add(id)));
    return n;
  });

  const runGenerate = async () => {
    setGenerating(true);
    setShowConfirm(false);
    try {
      const res = await axios.post(API_ENDPOINTS.SALARY_GENERATE_BULK, {
        month, year, employee_ids: [...selectedIds],
      });
      setResults(res.data.results || []);
      const generated = (res.data.results || []).filter(r => r.success).length;
      showNotification(`Generated ${generated} salary slip(s) for ${cycleLabel}.`, 'success');
      refetch();
    } catch (err) {
      showNotification(err.response?.data?.message || 'Salary generation failed', 'danger');
    } finally {
      setGenerating(false);
    }
  };

  const generatedCount = results ? results.filter(r => r.success).length : 0;
  const alreadyExistsCount = results ? results.filter(r => r.status === 'already_exists').length : 0;
  const failedCount = results ? results.filter(r => r.status === 'failed').length : 0;

  return (
    <div className="d-flex flex-column gap-3">

      <div style={{ background: '#fff', borderRadius: 12, padding: '14px 20px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ fontSize: 13, color: '#475569' }}>
          <b>{selectedIds.size}</b> of <b>{eligible.length}</b> eligible employee(s) selected for <b>{cycleLabel}</b>.
          {records.length !== eligible.length && (
            <span style={{ color: '#94a3b8' }}> ({records.length - eligible.length} excluded employee(s) hidden from selection.)</span>
          )}
        </div>
        <button
          onClick={() => setShowConfirm(true)}
          disabled={selectedIds.size === 0 || generating}
          style={{
            marginLeft: 'auto', padding: '9px 18px', fontSize: 13, borderRadius: 8, border: 'none', fontWeight: 700,
            background: selectedIds.size > 0 ? '#1e3a5f' : '#e2e8f0', color: selectedIds.size > 0 ? '#fff' : '#94a3b8',
            cursor: selectedIds.size === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          {generating ? <Spinner size="sm" animation="border" /> : <FaFileInvoiceDollar size={13} />}
          Generate Salary Slips
        </button>
      </div>

      {results && (
        <div style={{ background: '#fff', borderRadius: 12, padding: '14px 20px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
          <div className="d-flex flex-wrap gap-3 mb-2">
            <span style={{ color: '#16a34a', fontWeight: 700, fontSize: 13 }}><FaCheckCircle className="me-1" />{generatedCount} generated</span>
            <span style={{ color: '#64748b', fontWeight: 700, fontSize: 13 }}><FaExclamationCircle className="me-1" />{alreadyExistsCount} already existed</span>
            <span style={{ color: '#dc2626', fontWeight: 700, fontSize: 13 }}><FaTimesCircle className="me-1" />{failedCount} failed</span>
          </div>
          {failedCount > 0 && (
            <div style={{ fontSize: 11, color: '#dc2626' }}>
              {results.filter(r => r.status === 'failed').map(r => `${r.employee_id}: ${r.error}`).join(' · ')}
            </div>
          )}
        </div>
      )}

      <div style={{ position: 'relative', maxWidth: 320 }}>
        <FaSearch size={11} style={{ position: 'absolute', left: 12, top: 12, color: '#94a3b8' }} />
        <input
          type="text" placeholder="Search by name or employee ID…" value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', padding: '9px 12px 9px 30px', fontSize: 12, borderRadius: 10, border: '1px solid #e2e8f0', outline: 'none', background: '#fff' }}
        />
      </div>

      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 6px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        {visibleEligible.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 13 }}>No eligible employees match the current filters.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#1e3a5f', color: '#fff' }}>
                  <th style={{ padding: '11px 12px', textAlign: 'center', width: 36 }}>
                    <input type="checkbox" checked={visibleEligible.length > 0 && visibleEligible.every(r => selectedIds.has(r.employee_id))} onChange={toggleSelectAll} />
                  </th>
                  {['Employee', 'Code', 'Department', 'Monthly Salary', 'Present', 'Status'].map(h => (
                    <th key={h} style={{ padding: '11px 12px', fontWeight: 600, textAlign: 'left', fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleEligible.map((rec, idx) => (
                  <tr key={rec.employee_id} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <input type="checkbox" checked={selectedIds.has(rec.employee_id)} onChange={() => toggleSelect(rec.employee_id)} />
                    </td>
                    <td style={{ padding: '10px 12px', fontWeight: 600, color: '#1e293b' }}>{rec.first_name} {rec.last_name}</td>
                    <td style={{ padding: '10px 12px', color: '#64748b', fontFamily: 'monospace', fontSize: 11 }}>{rec.employee_id}</td>
                    <td style={{ padding: '10px 12px' }}>{rec.department}</td>
                    <td style={{ padding: '10px 12px', fontWeight: 700 }}>{fmt(rec.monthly_salary)}</td>
                    <td style={{ padding: '10px 12px', color: '#16a34a', fontWeight: 700 }}>{rec.present_days ?? '—'}</td>
                    <td style={{ padding: '10px 12px' }}>
                      {rec.has_slip
                        ? <span style={{ background: '#dcfce7', color: '#16a34a', borderRadius: 10, padding: '2px 8px', fontSize: 10, fontWeight: 700 }}>Already Generated</span>
                        : <span style={{ background: '#f1f5f9', color: '#94a3b8', borderRadius: 10, padding: '2px 8px', fontSize: 10 }}>No slip</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal show={showConfirm} onHide={() => setShowConfirm(false)} centered>
        <Modal.Header closeButton><Modal.Title style={{ fontSize: 16 }}>Confirm Salary Generation</Modal.Title></Modal.Header>
        <Modal.Body>
          You are about to generate salary slips for <b>{selectedIds.size}</b> employee(s) for <b>{cycleLabel}</b>.
          {[...selectedIds].some(id => eligible.find(r => r.employee_id === id)?.has_slip) && (
            <div className="mt-2" style={{ color: '#b45309', fontSize: 13 }}>
              Some selected employees already have a slip for this period — their slip will be regenerated (old data replaced, not duplicated).
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <button className="btn btn-outline-secondary btn-sm" onClick={() => setShowConfirm(false)}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={runGenerate}>Generate</button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default GenerateSalaryTab;
