// src/components/Admin/NotifyEmailsModal.jsx
// Admin-only popup: pick which employees are monitored for break overtime, and
// which email addresses get notified. The actual monitoring runs server-side
// (backend/cron/breakOvertimeCheck.js) — this modal only edits the config.
import React, { useState, useEffect } from 'react';
import { Modal, Button, Spinner, Alert, Form, InputGroup } from 'react-bootstrap';
import { FaSearch, FaTimes, FaPlus, FaBellSlash } from 'react-icons/fa';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const NotifyEmailsModal = ({ show, onClose }) => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const [employees, setEmployees] = useState([]);
    const [search, setSearch] = useState('');
    const [selectedIds, setSelectedIds] = useState(new Set());

    const [emails, setEmails] = useState([]);
    const [newEmail, setNewEmail] = useState('');
    const [emailError, setEmailError] = useState('');

    // Loads fresh every time the modal is opened — nothing fetched while it's closed.
    useEffect(() => {
        if (!show) return;
        setError(''); setSuccess(''); setEmailError('');
        setLoading(true);
        Promise.all([
            axios.get(API_ENDPOINTS.EMPLOYEES),
            axios.get(API_ENDPOINTS.BREAK_NOTIFICATION_SETTINGS),
        ]).then(([empRes, settingsRes]) => {
            setEmployees(Array.isArray(empRes.data) ? empRes.data : []);
            const settings = settingsRes.data?.settings || {};
            setSelectedIds(new Set(settings.monitored_employee_ids || []));
            setEmails(settings.notify_emails || []);
        }).catch(err => {
            setError(err.response?.data?.message || 'Failed to load notification settings');
        }).finally(() => setLoading(false));
    }, [show]);

    const filtered = employees.filter(e => {
        if (!search.trim()) return true;
        const q = search.trim().toLowerCase();
        return `${e.first_name} ${e.last_name} ${e.employee_id} ${e.department || ''}`.toLowerCase().includes(q);
    });

    const toggleEmployee = (id) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const selectAll = () => setSelectedIds(prev => new Set([...prev, ...filtered.map(e => e.employee_id)]));
    const deselectAll = () => setSelectedIds(prev => {
        const next = new Set(prev);
        filtered.forEach(e => next.delete(e.employee_id));
        return next;
    });

    const addEmail = () => {
        const val = newEmail.trim().toLowerCase();
        setEmailError('');
        if (!val) return;
        if (!EMAIL_REGEX.test(val)) { setEmailError('Enter a valid email address'); return; }
        if (emails.includes(val)) { setEmailError('That email is already added'); return; }
        setEmails(prev => [...prev, val]);
        setNewEmail('');
    };

    const removeEmail = (val) => setEmails(prev => prev.filter(e => e !== val));

    const handleSave = async () => {
        setSaving(true); setError(''); setSuccess('');
        try {
            const res = await axios.patch(API_ENDPOINTS.BREAK_NOTIFICATION_SETTINGS, {
                monitored_employee_ids: [...selectedIds],
                notify_emails: emails,
            });
            if (!res.data.success) throw new Error(res.data.message);
            setSuccess('Notification settings saved successfully.');
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal show={show} onHide={onClose} centered size="lg" scrollable>
            <Modal.Header closeButton>
                <Modal.Title style={{ fontSize: 17, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FaBellSlash size={15} /> Notify Emails
                </Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
                        <Spinner animation="border" variant="primary" />
                    </div>
                ) : (
                    <>
                        {error && <Alert variant="danger" dismissible onClose={() => setError('')} className="py-2" style={{ fontSize: 13 }}>{error}</Alert>}
                        {success && <Alert variant="success" dismissible onClose={() => setSuccess('')} className="py-2" style={{ fontSize: 13 }}>{success}</Alert>}

                        <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
                            When a selected employee exceeds their allowed Tea Break or Lunch Break duration, and again when they end it,
                            an email is sent to every address below. Only fires when at least one employee AND one email are configured.
                        </p>

                        {/* ── Select Employees ── */}
                        <div style={{ marginBottom: 8, fontSize: 13, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            Select Employees ({selectedIds.size} selected)
                        </div>
                        <InputGroup size="sm" className="mb-2">
                            <InputGroup.Text><FaSearch size={11} /></InputGroup.Text>
                            <Form.Control
                                placeholder="Search employee by name, ID, department…"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                        </InputGroup>
                        <div className="d-flex gap-2 mb-2">
                            <Button variant="outline-secondary" size="sm" onClick={selectAll}>Select All</Button>
                            <Button variant="outline-secondary" size="sm" onClick={deselectAll}>Deselect All</Button>
                        </div>
                        <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 8, marginBottom: 20 }}>
                            {filtered.length === 0 ? (
                                <div style={{ padding: 20, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>No employees found</div>
                            ) : filtered.map(emp => (
                                <label
                                    key={emp.employee_id}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                                        borderBottom: '1px solid #f3f4f6', cursor: 'pointer',
                                        background: selectedIds.has(emp.employee_id) ? '#eef2ff' : '#fff',
                                    }}
                                >
                                    <Form.Check
                                        type="checkbox"
                                        checked={selectedIds.has(emp.employee_id)}
                                        onChange={() => toggleEmployee(emp.employee_id)}
                                        className="mb-0"
                                    />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>
                                            {emp.first_name} {emp.last_name}
                                        </div>
                                        <div style={{ fontSize: 11, color: '#9ca3af' }}>
                                            {emp.employee_id} · {emp.department || '—'} · {emp.designation || '—'}
                                        </div>
                                    </div>
                                </label>
                            ))}
                        </div>

                        {/* ── Notification Emails ── */}
                        <div style={{ marginBottom: 8, fontSize: 13, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            Notification Email Addresses ({emails.length})
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                            {emails.length === 0 ? (
                                <div style={{ fontSize: 13, color: '#9ca3af', fontStyle: 'italic', padding: '6px 0' }}>No notification emails added yet</div>
                            ) : emails.map(email => (
                                <div key={email} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 10px' }}>
                                    <span style={{ flex: 1, fontSize: 13, color: '#111827' }}>{email}</span>
                                    <button
                                        onClick={() => removeEmail(email)}
                                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 4, display: 'flex' }}
                                        title="Remove"
                                    >
                                        <FaTimes size={12} />
                                    </button>
                                </div>
                            ))}
                        </div>
                        <InputGroup size="sm">
                            <Form.Control
                                type="email"
                                placeholder="name@company.com"
                                value={newEmail}
                                onChange={e => { setNewEmail(e.target.value); setEmailError(''); }}
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addEmail(); } }}
                            />
                            <Button variant="outline-primary" onClick={addEmail}>
                                <FaPlus size={10} className="me-1" /> Add Email
                            </Button>
                        </InputGroup>
                        {emailError && <div style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>{emailError}</div>}
                    </>
                )}
            </Modal.Body>
            <Modal.Footer>
                <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
                <Button variant="primary" onClick={handleSave} disabled={loading || saving}>
                    {saving ? <><Spinner size="sm" animation="border" className="me-2" />Saving…</> : 'Save Changes'}
                </Button>
            </Modal.Footer>
        </Modal>
    );
};

export default NotifyEmailsModal;
