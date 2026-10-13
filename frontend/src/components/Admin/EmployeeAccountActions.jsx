import React, { useState } from 'react';
import { Alert, Button, Form, Modal, Spinner } from 'react-bootstrap';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import SendOfferLetterModal from './SendOfferLetterModal';

export default function EmployeeAccountActions({ employee, onEmployeeChange }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [passwordMessage, setPasswordMessage] = useState(null);
  const canManage = ['admin', 'sub_admin', 'hr'].includes(user?.role);
  if (!canManage) return null;
  const fields = [employee.email, employee.phone, employee.department, employee.designation,
    employee.joining_date, employee.employment_type, employee.reporting_manager, employee.gender,
    employee.dob, employee.blood_group, employee.address, employee.bank_name || employee.bank_account_name,
    employee.account_number, employee.ifsc_code, employee.pan_number, employee.aadhar_number];
  const completion = Math.round(fields.filter(Boolean).length / fields.length * 100);
  const closePassword = () => { if (busy) return; setPasswordOpen(false); setPassword(''); setConfirmation(''); setPasswordMessage(null); };
  const updatePassword = async event => {
    event.preventDefault();
    if (password.length < 6) return setPasswordMessage({ variant: 'danger', text: 'Password must be at least 6 characters.' });
    if (password !== confirmation) return setPasswordMessage({ variant: 'danger', text: 'Passwords do not match.' });
    setBusy(true);
    try {
      await axios.post(API_ENDPOINTS.EMPLOYEE_RESET_PASSWORD(employee.id), { newPassword: password });
      setPassword(''); setConfirmation(''); setPasswordOpen(false);
      setMessage({ variant: 'success', text: 'Employee password updated.' });
    } catch (error) { setPasswordMessage({ variant: 'danger', text: error.response?.data?.message || 'Unable to update password.' }); }
    finally { setBusy(false); }
  };
  const toggleStatus = async () => {
    const active = employee.is_active !== false;
    if (!window.confirm((active ? 'Deactivate' : 'Activate') + ' the account for ' + employee.first_name + ' ' + employee.last_name + '?')) return;
    setBusy(true);
    try {
      const { data } = await axios.patch(API_ENDPOINTS.EMPLOYEE_TOGGLE_STATUS(employee.id));
      onEmployeeChange({ ...employee, is_active: data.is_active ?? data.employee?.is_active ?? !active });
      setMessage({ variant: 'success', text: active ? 'Account deactivated.' : 'Account activated.' });
    } catch (error) { setMessage({ variant: 'danger', text: error.response?.data?.message || 'Unable to update account status.' }); }
    finally { setBusy(false); }
  };
  return <section aria-label="Employee account and quick actions" style={{ margin: '20px 24px', padding: 20, border: '1px solid #e5eaf0', borderRadius: 12, background: '#fff' }}>
    <div className="d-flex justify-content-between align-items-start flex-wrap gap-3">
      <div><h6 className="mb-2">Account & quick actions</h6>
        <div style={{ color: '#64748b', fontSize: 12 }}>Profile completion: <strong>{completion}%</strong> · Profile form: <strong>{employee.require_profile_completion ? 'Required' : 'Not required'}</strong></div>
      </div>
      <div className="d-flex flex-wrap gap-2">
        <Button size="sm" variant="outline-primary" onClick={() => setOfferOpen(true)}>Send Offer Letter</Button>
        <Button size="sm" variant="outline-primary" onClick={() => navigate('/admin/payroll')}>Salary / Payroll</Button>
        <Button size="sm" variant="outline-secondary" disabled={busy} onClick={() => { setPasswordMessage(null); setPasswordOpen(true); }}>Update Password</Button>
        <Button size="sm" variant={employee.is_active !== false ? 'outline-danger' : 'outline-success'} disabled={busy} onClick={toggleStatus}>{employee.is_active !== false ? 'Deactivate Account' : 'Activate Account'}</Button>
      </div>
    </div>
    {message && <Alert className="mt-3 mb-0" variant={message.variant} dismissible onClose={() => setMessage(null)}>{message.text}</Alert>}
    <SendOfferLetterModal show={offerOpen} onHide={() => setOfferOpen(false)} employee={employee} />
    <Modal show={passwordOpen} onHide={closePassword} centered backdrop={busy ? 'static' : true} keyboard={!busy}>
      <Form onSubmit={updatePassword}>
        <Modal.Header closeButton={!busy}><Modal.Title>Update employee password</Modal.Title></Modal.Header>
        <Modal.Body>
          {passwordMessage && <Alert variant={passwordMessage.variant}>{passwordMessage.text}</Alert>}
          <Form.Group className="mb-3" controlId="employee-new-password"><Form.Label>New password</Form.Label><Form.Control type="password" autoComplete="new-password" required minLength={6} value={password} onChange={event => setPassword(event.target.value)} disabled={busy} /></Form.Group>
          <Form.Group controlId="employee-confirm-password"><Form.Label>Confirm password</Form.Label><Form.Control type="password" autoComplete="new-password" required value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={busy} /></Form.Group>
        </Modal.Body>
        <Modal.Footer><Button variant="outline-secondary" onClick={closePassword} disabled={busy}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? <Spinner size="sm" animation="border" /> : 'Update Password'}</Button></Modal.Footer>
      </Form>
    </Modal>
  </section>;
}
