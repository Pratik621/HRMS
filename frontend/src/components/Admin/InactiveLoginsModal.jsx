// src/components/Admin/InactiveLoginsModal.jsx
// Admin tool: lists active employees who haven't logged in for 3+ days (or never have),
// with a one-click Deactivate action per row. Relies on employees.last_login_at, which is
// only written on successful login (see backend/routes/authRoutes.js) — someone who has
// never logged in shows as "Never" here, not as recently-active.
import React, { useState, useMemo } from 'react';
import { Modal, Button, Spinner, Form, InputGroup } from 'react-bootstrap';
import { FaSearch, FaUserClock } from 'react-icons/fa';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';
import { useNotification } from '../../context/NotificationContext';

const THRESHOLD_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

// 3 "days" here means 3 business days — Saturday/Sunday don't count, so a weekend inside
// the window just pushes the threshold back further instead of shrinking it.
const getBusinessDaysAgo = (days) => {
  let d = new Date();
  let counted = 0;
  while (counted < days) {
    d = new Date(d.getTime() - DAY_MS);
    const dow = d.getDay(); // 0 = Sunday, 6 = Saturday
    if (dow !== 0 && dow !== 6) counted++;
  }
  return d;
};

const getFullName = (emp) =>
  `${emp?.first_name || ''} ${emp?.middle_name || ''} ${emp?.last_name || ''}`.trim().replace(/  +/g, ' ');

const fmtLastLogin = (d) => {
  if (!d) return 'Never';
  return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const InactiveLoginsModal = ({ show, onClose, employees, onSuccess }) => {
  const [search, setSearch] = useState('');
  const [togglingId, setTogglingId] = useState(null);
  const { showNotification } = useNotification();

  // Only currently-active employees matter here — deactivating someone already deactivated
  // is a no-op, and they'd just be noise in this list.
  const staleEmployees = useMemo(() => {
    const threshold = getBusinessDaysAgo(THRESHOLD_DAYS).getTime();
    return employees
      .filter(e => e.is_active !== false)
      .filter(e => !e.last_login_at || new Date(e.last_login_at).getTime() < threshold)
      .sort((a, b) => new Date(a.last_login_at || 0) - new Date(b.last_login_at || 0));
  }, [employees]);

  const filtered = useMemo(() => {
    if (!search.trim()) return staleEmployees;
    const q = search.trim().toLowerCase();
    return staleEmployees.filter(e =>
      getFullName(e).toLowerCase().includes(q) || (e.employee_id || '').toLowerCase().includes(q)
    );
  }, [staleEmployees, search]);

  const handleClose = () => { setSearch(''); onClose(); };

  const handleDeactivate = async (emp) => {
    if (!window.confirm(`Deactivate account for ${getFullName(emp) || emp.employee_id}?`)) return;
    setTogglingId(emp.id);
    try {
      const res = await axios.patch(API_ENDPOINTS.EMPLOYEE_TOGGLE_STATUS(emp.id));
      if (res.data.success) {
        showNotification(`${getFullName(emp) || emp.employee_id} deactivated`, 'warning');
        onSuccess?.();
      }
    } catch (err) {
      showNotification(err.response?.data?.message || 'Failed to deactivate', 'danger');
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <Modal show={show} onHide={handleClose} centered size="lg" scrollable>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: 17, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
          <FaUserClock size={15} /> Inactive Logins ({THRESHOLD_DAYS}+ days)
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>
          Active employees who haven't logged in for {THRESHOLD_DAYS}+ working days (Saturday/Sunday don't
          count), or have never logged in. Deactivate anyone who no longer needs access.
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
                <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: 11, textTransform: 'uppercase' }}>Last Login</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: 11, textTransform: 'uppercase' }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={4} style={{ padding: 20, textAlign: 'center', color: '#9ca3af' }}>
                  {staleEmployees.length === 0 ? 'Everyone has logged in recently' : 'No employees found'}
                </td></tr>
              ) : filtered.map(emp => (
                <tr key={emp.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 600, color: '#111827' }}>{getFullName(emp) || '—'}</td>
                  <td style={{ padding: '8px 12px', color: '#6b7280', fontFamily: 'monospace' }}>{emp.employee_id}</td>
                  <td style={{ padding: '8px 12px', color: !emp.last_login_at ? '#dc2626' : '#6b7280' }}>{fmtLastLogin(emp.last_login_at)}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <Button
                      size="sm"
                      variant="outline-danger"
                      disabled={togglingId === emp.id}
                      onClick={() => handleDeactivate(emp)}
                      style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px' }}
                    >
                      {togglingId === emp.id ? <Spinner size="sm" animation="border" /> : 'Deactivate'}
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

export default InactiveLoginsModal;
