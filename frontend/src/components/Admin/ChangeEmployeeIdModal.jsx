// src/components/Admin/ChangeEmployeeIdModal.jsx
// Admin-only tool: rename one or more employees' auto-generated Employee ID. The actual
// rename cascades across every table that stores employee_id (see
// backend/scripts/create-change-employee-id-function.sql) — this component only collects
// the intended old->new pairs and shows what happened.
import React, { useState, useMemo } from 'react';
import { Modal, Button, Spinner, Alert, Form, InputGroup } from 'react-bootstrap';
import { FaSearch, FaKey } from 'react-icons/fa';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';

const getFullName = (emp) =>
  `${emp?.first_name || ''} ${emp?.middle_name || ''} ${emp?.last_name || ''}`.trim().replace(/  +/g, ' ');

const ChangeEmployeeIdModal = ({ show, onClose, employees, onSuccess }) => {
  const [search, setSearch] = useState('');
  const [edits, setEdits] = useState({}); // { [current_employee_id]: newIdValue }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [rowResults, setRowResults] = useState({}); // { [current_employee_id]: { success, message } }

  // Deactivated employees shouldn't clutter this list — renaming their ID has no real
  // use case once they're no longer active.
  const activeEmployees = useMemo(() => employees.filter(e => e.is_active !== false), [employees]);

  const filtered = useMemo(() => {
    if (!search.trim()) return activeEmployees;
    const q = search.trim().toLowerCase();
    return activeEmployees.filter(e =>
      getFullName(e).toLowerCase().includes(q) || (e.employee_id || '').toLowerCase().includes(q)
    );
  }, [activeEmployees, search]);

  const handleChange = (employeeId, value) => {
    setEdits(prev => ({ ...prev, [employeeId]: value }));
    setRowResults(prev => {
      if (!prev[employeeId]) return prev;
      const next = { ...prev };
      delete next[employeeId];
      return next;
    });
  };

  const handleClose = () => {
    setSearch(''); setEdits({}); setError(''); setRowResults({});
    onClose();
  };

  const handleSave = async () => {
    setError('');
    // Only rows where the admin actually typed a different ID count as a change.
    const changes = Object.entries(edits)
      .map(([old_employee_id, newVal]) => ({ old_employee_id, new_employee_id: (newVal || '').trim() }))
      .filter(c => c.new_employee_id && c.new_employee_id !== c.old_employee_id);

    if (changes.length === 0) {
      setError('Enter at least one new Employee ID before saving.');
      return;
    }

    // Catch the obvious duplicate cases client-side before even calling the backend —
    // the backend re-checks authoritatively regardless (including inactive employees not
    // shown here), this is just faster feedback for the common typo.
    const newIds = changes.map(c => c.new_employee_id);
    const dupeWithinBatch = newIds.find((id, i) => newIds.indexOf(id) !== i);
    if (dupeWithinBatch) {
      setError(`"${dupeWithinBatch}" is used for more than one row below — each new Employee ID must be unique.`);
      return;
    }
    const existingIds = new Set(employees.map(e => e.employee_id));
    const renamedAway = new Set(changes.map(c => c.old_employee_id));
    const clashesWithExisting = changes.find(c => existingIds.has(c.new_employee_id) && !renamedAway.has(c.new_employee_id));
    if (clashesWithExisting) {
      setError(`"${clashesWithExisting.new_employee_id}" is already used by another employee.`);
      return;
    }

    setSaving(true);
    try {
      const res = await axios.post(API_ENDPOINTS.EMPLOYEE_CHANGE_IDS, { changes });
      const results = res.data.results || [];
      const resultMap = {};
      results.forEach(r => { resultMap[r.old_employee_id] = r; });
      setRowResults(resultMap);

      const failed = results.filter(r => !r.success);
      if (failed.length > 0) {
        setError(`${failed.length} of ${results.length} change(s) failed — see details below.`);
      } else {
        setError('');
        onSuccess?.();
        setTimeout(handleClose, 900);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to change Employee ID(s)');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal show={show} onHide={handleClose} centered size="lg" scrollable>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: 17, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
          <FaKey size={15} /> Change Employee ID
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && <Alert variant="danger" dismissible onClose={() => setError('')} className="py-2" style={{ fontSize: 13 }}>{error}</Alert>}

        <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>
          Type a new Employee ID for anyone you need to rename, then Save. The change updates every record
          tied to that employee (attendance, leaves, breaks, ratings, deductions, etc.) — not just their profile.
        </p>

        <InputGroup size="sm" className="mb-3">
          <InputGroup.Text><FaSearch size={11} /></InputGroup.Text>
          <Form.Control
            placeholder="Search employee by name or ID…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </InputGroup>

        <div style={{ maxHeight: 420, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 1 }}>
              <tr>
                <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: 11, textTransform: 'uppercase' }}>Name</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: 11, textTransform: 'uppercase' }}>Employee ID</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: 11, textTransform: 'uppercase' }}>New Employee ID</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={3} style={{ padding: 20, textAlign: 'center', color: '#9ca3af' }}>No employees found</td></tr>
              ) : filtered.map(emp => {
                const result = rowResults[emp.employee_id];
                const value = edits[emp.employee_id] ?? emp.employee_id;
                const changed = value.trim() !== emp.employee_id;
                return (
                  <tr key={emp.employee_id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 600, color: '#111827' }}>{getFullName(emp) || '—'}</td>
                    <td style={{ padding: '8px 12px', color: '#6b7280', fontFamily: 'monospace' }}>{emp.employee_id}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <Form.Control
                        size="sm"
                        value={value}
                        onChange={e => handleChange(emp.employee_id, e.target.value)}
                        style={{
                          fontFamily: 'monospace',
                          borderColor: result ? (result.success ? '#16a34a' : '#ef4444') : (changed ? '#6366f1' : undefined),
                          background: result ? (result.success ? '#f0fdf4' : '#fef2f2') : undefined,
                        }}
                      />
                      {result && !result.success && (
                        <div style={{ fontSize: 11, color: '#ef4444', marginTop: 2 }}>{result.message}</div>
                      )}
                      {result && result.success && (
                        <div style={{ fontSize: 11, color: '#16a34a', marginTop: 2 }}>Updated</div>
                      )}
                    </td>
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

export default ChangeEmployeeIdModal;
