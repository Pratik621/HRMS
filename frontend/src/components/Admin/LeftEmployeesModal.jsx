// src/components/Admin/LeftEmployeesModal.jsx
// Admin/HR tool: lists employees a TL/Manager/Admin/HR has marked as "Left" — their account
// is still active (paid through the current salary cycle) and will auto-deactivate on the
// scheduled date, but they're hidden from day-to-day attendance views in the meantime. This
// is the only place to see them and, if the mark was a mistake, revert it before that date.
import React, { useState, useMemo } from 'react';
import { Modal, Button, Spinner, Form, InputGroup } from 'react-bootstrap';
import { FaSearch, FaUndo, FaDoorOpen } from 'react-icons/fa';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';
import { useNotification } from '../../context/NotificationContext';

const getFullName = (emp) =>
  `${emp?.first_name || ''} ${emp?.middle_name || ''} ${emp?.last_name || ''}`.trim().replace(/  +/g, ' ');

const fmtDate = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const LeftEmployeesModal = ({ show, onClose, employees, onSuccess }) => {
  const [search, setSearch] = useState('');
  const [revertingId, setRevertingId] = useState(null);
  const { showNotification } = useNotification();

  const leftEmployees = useMemo(() =>
    employees.filter(e => e.marked_left_at).sort((a, b) => new Date(b.marked_left_at) - new Date(a.marked_left_at)),
    [employees]
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return leftEmployees;
    const q = search.trim().toLowerCase();
    return leftEmployees.filter(e =>
      getFullName(e).toLowerCase().includes(q) || (e.employee_id || '').toLowerCase().includes(q)
    );
  }, [leftEmployees, search]);

  const handleClose = () => { setSearch(''); onClose(); };

  const handleRevert = async (emp) => {
    if (!window.confirm(`Revert to team — cancel the scheduled deactivation for ${getFullName(emp) || emp.employee_id}?`)) return;
    setRevertingId(emp.id);
    try {
      const res = await axios.post(API_ENDPOINTS.EMPLOYEE_UNMARK_LEFT, { employee_id: emp.employee_id });
      if (res.data.success) {
        showNotification(res.data.message || `${getFullName(emp)} reverted to the team`, 'success');
        onSuccess?.();
      }
    } catch (err) {
      showNotification(err.response?.data?.message || 'Failed to revert', 'danger');
    } finally {
      setRevertingId(null);
    }
  };

  return (
    <Modal show={show} onHide={handleClose} centered size="lg" scrollable>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: 17, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
          <FaDoorOpen size={15} /> Left the Team
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>
          Employees a TL, Manager, Admin, or HR has marked as having left. Their account stays active —
          they can still log in and get paid — until the scheduled date, then it deactivates automatically.
          Revert here if a mark was a mistake, before that date arrives.
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
                <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: 11, textTransform: 'uppercase' }}>Marked By</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: 11, textTransform: 'uppercase' }}>Deactivates On</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: 11, textTransform: 'uppercase' }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: 20, textAlign: 'center', color: '#9ca3af' }}>
                  {leftEmployees.length === 0 ? 'No one is currently marked as left' : 'No employees found'}
                </td></tr>
              ) : filtered.map(emp => (
                <tr key={emp.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 600, color: '#111827' }}>{getFullName(emp) || '—'}</td>
                  <td style={{ padding: '8px 12px', color: '#6b7280', fontFamily: 'monospace' }}>{emp.employee_id}</td>
                  <td style={{ padding: '8px 12px', color: '#6b7280', fontFamily: 'monospace' }}>{emp.marked_left_by || '—'}</td>
                  <td style={{ padding: '8px 12px', color: '#dc2626', fontWeight: 600 }}>{fmtDate(emp.scheduled_deactivation_date)}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <Button
                      size="sm"
                      variant="outline-success"
                      disabled={revertingId === emp.id}
                      onClick={() => handleRevert(emp)}
                      style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 5 }}
                    >
                      {revertingId === emp.id ? <Spinner size="sm" animation="border" /> : <FaUndo size={10} />}
                      Revert to Team
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={handleClose}>Close</Button>
      </Modal.Footer>
    </Modal>
  );
};

export default LeftEmployeesModal;
