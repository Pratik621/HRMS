// src/components/Common/ApplyEarlyLogoutModal.jsx
// Shared by TeamAttendanceReport.jsx (TL/Manager "My Team" — own team only) and Admin's
// AttendanceReports.jsx (Admin/HR — company-wide) so the picker + save flow only exists once.
// Team-vs-company-wide scoping is enforced server-side in POST /api/attendance/apply-early-logout —
// this component just shows whatever `candidates` its caller already scoped for the given date.
import React, { useState, useMemo } from 'react';
import { Modal, Button, Spinner, Form, InputGroup } from 'react-bootstrap';
import { FaSearch, FaSignOutAlt } from 'react-icons/fa';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';

const fmtDate = (d) => {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
};

// candidates: [{ employee_id, name, status, clock_in }] — only employees who clocked in
// that day and aren't already Present belong here (the backend re-validates this anyway).
const ApplyEarlyLogoutModal = ({ show, onClose, date, candidates, onSuccess }) => {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [rowResults, setRowResults] = useState({});

  const filtered = useMemo(() => {
    if (!search.trim()) return candidates;
    const q = search.trim().toLowerCase();
    return candidates.filter(c => c.name.toLowerCase().includes(q) || c.employee_id.toLowerCase().includes(q));
  }, [candidates, search]);

  const toggle = (employeeId) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(employeeId) ? next.delete(employeeId) : next.add(employeeId);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(filtered.map(c => c.employee_id)));
  const clearAll = () => setSelected(new Set());

  const handleClose = () => {
    setSearch(''); setSelected(new Set()); setError(''); setRowResults({});
    onClose();
  };

  const handleSave = async () => {
    if (selected.size === 0) {
      setError('Select at least one employee before saving.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      const res = await axios.post(API_ENDPOINTS.ATTENDANCE_APPLY_EARLY_LOGOUT, {
        employee_ids: [...selected],
        date,
      });
      const results = res.data.results || [];
      const resultMap = {};
      results.forEach(r => { resultMap[r.employee_id] = r; });
      setRowResults(resultMap);

      const failed = results.filter(r => !r.success);
      if (failed.length > 0) {
        setError(`${failed.length} of ${results.length} could not be applied — see details below.`);
      } else {
        onSuccess?.();
        setTimeout(handleClose, 900);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to apply early logout');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal show={show} onHide={handleClose} centered size="lg" scrollable>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: 17, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
          <FaSignOutAlt size={15} /> Apply Early Logout
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && <div className="alert alert-danger py-2" style={{ fontSize: 13 }}>{error}</div>}

        <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>
          Select employees who left early on <strong>{fmtDate(date)}</strong> — they'll be marked
          <strong> Present</strong> for this date instead of Half Day. Only employees who clocked in
          that day are shown; HR and all Managers will be notified by email.
        </p>

        <InputGroup size="sm" className="mb-2 mt-3">
          <InputGroup.Text><FaSearch size={11} /></InputGroup.Text>
          <Form.Control
            placeholder="Search employee by name or ID…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </InputGroup>

        <div className="d-flex justify-content-between align-items-center mb-2">
          <span style={{ fontSize: 12, color: '#6b7280' }}>{selected.size} selected</span>
          <div className="d-flex gap-2">
            <Button size="sm" variant="link" style={{ fontSize: 12, padding: 0 }} onClick={selectAll}>Select all</Button>
            <Button size="sm" variant="link" style={{ fontSize: 12, padding: 0 }} onClick={clearAll}>Clear</Button>
          </div>
        </div>

        <div style={{ maxHeight: 380, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 1 }}>
              <tr>
                <th style={{ padding: '8px 12px', width: 32 }}></th>
                <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: 11, textTransform: 'uppercase' }}>Name</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: 11, textTransform: 'uppercase' }}>Clock In</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: 11, textTransform: 'uppercase' }}>Current Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={4} style={{ padding: 20, textAlign: 'center', color: '#9ca3af' }}>
                  {candidates.length === 0 ? 'No eligible employees for this date' : 'No employees found'}
                </td></tr>
              ) : filtered.map(c => {
                const result = rowResults[c.employee_id];
                return (
                  <tr key={c.employee_id} style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer', background: result ? (result.success ? '#f0fdf4' : '#fef2f2') : undefined }} onClick={() => !saving && toggle(c.employee_id)}>
                    <td style={{ padding: '8px 12px' }}>
                      <Form.Check type="checkbox" checked={selected.has(c.employee_id)} onChange={() => toggle(c.employee_id)} onClick={e => e.stopPropagation()} disabled={saving} />
                    </td>
                    <td style={{ padding: '8px 12px', fontWeight: 600, color: '#111827' }}>
                      {c.name}
                      <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 400 }}>{c.employee_id}</div>
                      {result && <div style={{ fontSize: 11, color: result.success ? '#16a34a' : '#ef4444', fontWeight: 400 }}>{result.message}</div>}
                    </td>
                    <td style={{ padding: '8px 12px', color: '#6b7280' }}>{c.clock_in || '--:--'}</td>
                    <td style={{ padding: '8px 12px', color: '#6b7280', textTransform: 'capitalize' }}>{(c.status || '').replace('_', ' ')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={handleClose} disabled={saving}>Cancel</Button>
        <Button variant="primary" onClick={handleSave} disabled={saving}>
          {saving ? <><Spinner size="sm" animation="border" className="me-2" />Saving…</> : 'Save Changes'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default ApplyEarlyLogoutModal;
