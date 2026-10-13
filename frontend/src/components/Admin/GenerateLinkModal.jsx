import React, { useState, useEffect } from 'react';
import { Modal, Form, Button, Spinner, Alert } from 'react-bootstrap';
import { CheckCircle, Copy, Link, X, Mail } from 'lucide-react';
import API_ENDPOINTS from '../../config/api';
import EmailTagInput from '../Common/EmailTagInput';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const DEPARTMENTS = ['IT', 'HR', 'Finance', 'Marketing', 'Sales', 'Operations', 'Administration', 'Legal'];
const EMP_TYPES   = ['Full Time', 'Part Time', 'Freelancer', 'Contract Based', 'Intern', 'Probation'];

const today = () => new Date().toISOString().split('T')[0];
const minExpiry = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
};

// PF defaults to the same statutory default used across payroll (Payroll > PF/PT tab,
// salaryController.js) when left blank — pre-filled here so the in-hand preview is accurate
// from the start instead of silently assuming ₹0 until the admin thinks to change it.
const EMPTY_FORM = { employee_name: '', designation: '', department: '', employment_type: '', salary: '', pf_amount: '1800', professional_tax_amount: '0', reporting_manager: '', reporting_manager_id: '', expiry_date: '', notes: '', email: '' };

export default function GenerateLinkModal({ show, onHide, onGenerated }) {
    const [form, setForm]       = useState(EMPTY_FORM);
    const [managers, setManagers] = useState([]);
    const [saving, setSaving]   = useState(false);
    const [error, setError]     = useState('');
    const [generated, setGenerated] = useState(null); // { link, offer }
    const [copied, setCopied]   = useState(false);

    // "Send Email" flow — a small popup to add CC recipients before actually sending.
    const [showCcPopup, setShowCcPopup] = useState(false);
    const [cc, setCc]                 = useState([]);
    const [sendingEmail, setSendingEmail] = useState(false);
    const [sendEmailResult, setSendEmailResult] = useState(null); // { type, text }

    useEffect(() => {
        if (!show) return;

        setForm(EMPTY_FORM);
        setError('');
        setGenerated(null);
        setCopied(false);
        setShowCcPopup(false);
        setCc([]);
        setSendEmailResult(null);

        const authHeaders = { Authorization: `Bearer ${localStorage.getItem('token')}` };

        Promise.all([
            fetch(API_ENDPOINTS.TEAMS_MANAGERS_LIST, { headers: authHeaders }).then(r => r.json()),
            fetch(API_ENDPOINTS.TEAMS_SUB_ADMINS_LIST, { headers: authHeaders }).then(r => r.json()),
            fetch(API_ENDPOINTS.TEAMS_HR_LIST, { headers: authHeaders }).then(r => r.json()),
        ])
            .then(([managerData, subAdminData, hrData]) => {
                const managers  = managerData.success  ? managerData.managers  || [] : [];
                const subAdmins = subAdminData.success ? subAdminData.managers || [] : [];
                const hr        = hrData.success       ? hrData.managers      || [] : [];
                setManagers([...managers, ...subAdmins, ...hr]);
            })
            .catch(err => {
                console.error('Failed to load managers/sub-admins/HR:', err);
            });
    }, [show]);

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    // In-hand salary = Offered Salary - PF - Professional Tax. Blank PF/PT count as ₹0 here
    // (rather than re-applying the 1800 statutory default) since the field already starts
    // pre-filled with that default — an explicitly cleared box means "no deduction".
    const salaryNum = Number(form.salary) || 0;
    const pfNum = Number(form.pf_amount) || 0;
    const ptNum = Number(form.professional_tax_amount) || 0;
    const inHandSalary = Math.max(0, salaryNum - pfNum - ptNum);

    // API responses key each manager by `employee_id` (there is no numeric `id` field —
    // see backend/routes/teamRoutes.js). Using `m.id` here would always be undefined,
    // silently breaking this select (the option's value falls back to its visible text,
    // which never matches anything, so reporting_manager was always saved as '').
    const handleManagerChange = (e) => {
        const employeeId = e.target.value;
        const mgr = managers.find(m => m.employee_id === employeeId);
        setForm(f => ({ ...f, reporting_manager_id: employeeId, reporting_manager: mgr ? `${mgr.first_name} ${mgr.last_name}`.trim() : '' }));
    };

    // Shared by the "Generate Link" button and the "Send Email" flow (which must generate
    // first if the admin hasn't already clicked Generate Link) — one call site for the
    // actual POST /generate request so both paths can never drift apart.
    const generateLink = async () => {
        const res = await fetch(API_ENDPOINTS.ONBOARDING_GENERATE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
            body: JSON.stringify(form),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message);
        const result = { link: data.link, offer: data.offer };
        setGenerated(result);
        if (onGenerated) onGenerated(data.offer);
        return result;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSaving(true);
        try {
            await generateLink();
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const copyLink = () => {
        navigator.clipboard.writeText(generated.link).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    // Clicking "Send Email" (from either the form footer or the post-generation success
    // view) opens the CC popup first — the actual send only happens once that's confirmed.
    const handleOpenSendEmail = () => {
        setError('');
        if (!generated) {
            // Same required-field check the form itself enforces via `required` — re-checked
            // here because "Send Email" can be clicked without the browser's native form
            // validation running (it's a plain button, not the form's submit button).
            if (!form.employee_name.trim() || !form.designation.trim() || !form.department.trim() ||
                !form.employment_type || !form.salary || !form.expiry_date) {
                setError('Please fill in all required fields before sending.');
                return;
            }
        }
        if (!form.email.trim() || !EMAIL_REGEX.test(form.email.trim())) {
            setError('A valid candidate email address is required to send the offer link.');
            return;
        }
        setSendEmailResult(null);
        setCc([]);
        setShowCcPopup(true);
    };

    const handleConfirmSendEmail = async () => {
        setSendingEmail(true);
        setSendEmailResult(null);
        try {
            // Generate the link first if the admin went straight to "Send Email" without
            // clicking "Generate Link" beforehand.
            const current = generated || await generateLink();

            const res = await fetch(API_ENDPOINTS.ONBOARDING_LINK_SEND_EMAIL(current.offer.id), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
                body: JSON.stringify({ email: form.email.trim(), cc }),
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.message);
            setSendEmailResult({ type: 'success', text: data.message });
            setShowCcPopup(false);
        } catch (err) {
            setSendEmailResult({ type: 'danger', text: err.message });
        } finally {
            setSendingEmail(false);
        }
    };

    return (
        <>
        <Modal show={show} onHide={onHide} size="lg" centered>
            <Modal.Header style={{ background: "#1f4e79", color: '#fff', border: 'none' }}>
                <Modal.Title style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Link size={20} /> Generate Employee Offer Link
                </Modal.Title>
                <button onClick={onHide} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 4 }}>
                    <X size={20} />
                </button>
            </Modal.Header>

            <Modal.Body style={{ padding: '1.5rem' }}>
                {generated ? (
                    <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                        <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#d1fae5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                            <CheckCircle size={36} color="#10b981" />
                        </div>
                        <h5 style={{ fontWeight: 700, color: '#111827', marginBottom: 8 }}>Offer Link Generated!</h5>
                        <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 20 }}>
                            Share this secure link with the candidate. It will guide them through the onboarding process.
                        </p>
                        <div style={{ background: '#f8f9ff', border: '1px solid #e0e7ff', borderRadius: 10, padding: '12px 16px', marginBottom: 16, wordBreak: 'break-all', fontSize: 13, color: "#173a5c", textAlign: 'left' }}>
                            {generated.link}
                        </div>
                        {error && <Alert variant="danger" className="py-2 text-start" style={{ fontSize: 13 }}>{error}</Alert>}
                        {sendEmailResult && (
                            <Alert variant={sendEmailResult.type} className="py-2 text-start" style={{ fontSize: 13 }}>{sendEmailResult.text}</Alert>
                        )}
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                            <button onClick={copyLink} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 8, background: copied ? '#d1fae5' : "#1f4e79", color: copied ? '#065f46' : '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14, transition: 'background 0.2s' }}>
                                {copied ? <><CheckCircle size={16} /> Copied!</> : <><Copy size={16} /> Copy Link</>}
                            </button>
                            <button onClick={handleOpenSendEmail} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 8, background: '#10b981', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
                                <Mail size={16} /> Send Email
                            </button>
                            <button onClick={() => { setGenerated(null); setSendEmailResult(null); }} style={{ padding: '8px 18px', borderRadius: 8, background: '#f3f4f6', color: '#374151', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
                                Generate Another
                            </button>
                        </div>
                    </div>
                ) : (
                    <Form onSubmit={handleSubmit}>
                        {error && <Alert variant="danger" className="py-2" style={{ fontSize: 13 }}>{error}</Alert>}

                        <div className="hrms-responsive-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                            <Form.Group>
                                <Form.Label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Candidate Full Name <span style={{ color: '#ef4444' }}>*</span></Form.Label>
                                <Form.Control size="sm" value={form.employee_name} onChange={e => set('employee_name', e.target.value)} placeholder="e.g. Rahul Sharma" required style={{ borderRadius: 8 }} />
                            </Form.Group>
                            <Form.Group>
                                <Form.Label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Position / Designation <span style={{ color: '#ef4444' }}>*</span></Form.Label>
                                <Form.Control size="sm" value={form.designation} onChange={e => set('designation', e.target.value)} placeholder="e.g. Software Engineer" required style={{ borderRadius: 8 }} />
                            </Form.Group>
                            <Form.Group>
                                <Form.Label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Department <span style={{ color: '#ef4444' }}>*</span></Form.Label>
                                <Form.Control
                                    list="gen-link-dept-list"
                                    size="sm"
                                    value={form.department}
                                    onChange={e => set('department', e.target.value)}
                                    placeholder="Select or type a department…"
                                    required
                                    style={{ borderRadius: 8 }}
                                />
                                <datalist id="gen-link-dept-list">
                                    {DEPARTMENTS.map(d => <option key={d} value={d} />)}
                                </datalist>
                            </Form.Group>
                            <Form.Group>
                                <Form.Label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Employment Type <span style={{ color: '#ef4444' }}>*</span></Form.Label>
                                <Form.Select size="sm" value={form.employment_type} onChange={e => set('employment_type', e.target.value)} required style={{ borderRadius: 8 }}>
                                    <option value="">Select type</option>
                                    {EMP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                </Form.Select>
                            </Form.Group>
                            <Form.Group>
                                <Form.Label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Offered Salary (₹/month) <span style={{ color: '#ef4444' }}>*</span></Form.Label>
                                <Form.Control size="sm" type="number" min="1" value={form.salary} onChange={e => set('salary', e.target.value)} placeholder="e.g. 45000" required style={{ borderRadius: 8 }} />
                            </Form.Group>
                            <Form.Group>
                                <Form.Label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>PF (₹/month)</Form.Label>
                                <Form.Control size="sm" type="number" min="0" value={form.pf_amount} onChange={e => set('pf_amount', e.target.value)} placeholder="e.g. 1800" style={{ borderRadius: 8 }} />
                            </Form.Group>
                            <Form.Group>
                                <Form.Label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>PT / Professional Tax (₹/month)</Form.Label>
                                <Form.Control size="sm" type="number" min="0" value={form.professional_tax_amount} onChange={e => set('professional_tax_amount', e.target.value)} placeholder="e.g. 0" style={{ borderRadius: 8 }} />
                            </Form.Group>
                            <Form.Group style={{ gridColumn: '1 / -1' }}>
                                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: 13, fontWeight: 600, color: '#166534' }}>In-Hand Salary (₹/month)</span>
                                    <span style={{ fontSize: 16, fontWeight: 800, color: '#166534' }}>₹{inHandSalary.toLocaleString('en-IN')}</span>
                                </div>
                                {form.salary && (
                                    <div style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 4 }}>
                                        ₹{salaryNum.toLocaleString('en-IN')} − PF ₹{pfNum.toLocaleString('en-IN')} − PT ₹{ptNum.toLocaleString('en-IN')} = ₹{inHandSalary.toLocaleString('en-IN')}
                                    </div>
                                )}
                            </Form.Group>
                            <Form.Group>
                                <Form.Label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Offer Expiry Date <span style={{ color: '#ef4444' }}>*</span></Form.Label>
                                <Form.Control size="sm" type="date" min={minExpiry()} value={form.expiry_date} onChange={e => set('expiry_date', e.target.value)} required style={{ borderRadius: 8 }} />
                            </Form.Group>
                            <Form.Group>
                                <Form.Label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Reporting Manager</Form.Label>
                                <Form.Select size="sm" value={form.reporting_manager_id} onChange={handleManagerChange} style={{ borderRadius: 8 }}>
                                    <option value="">Select manager (optional)</option>
                                    {managers.map(m => (
                                        <option key={m.employee_id} value={m.employee_id}>{m.first_name} {m.last_name} — {m.designation || m.role}</option>
                                    ))}
                                </Form.Select>
                            </Form.Group>
                            <Form.Group>
                                <Form.Label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Candidate Email</Form.Label>
                                <Form.Control size="sm" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="e.g. rahul@example.com" style={{ borderRadius: 8 }} />
                                <Form.Text style={{ fontSize: 11.5, color: '#9ca3af' }}>Required only if you want to use "Send Email".</Form.Text>
                            </Form.Group>
                            <Form.Group style={{ gridColumn: '1 / -1' }}>
                                <Form.Label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Notes / Message to Candidate</Form.Label>
                                <Form.Control as="textarea" rows={2} size="sm" value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Optional — welcome message or any additional info" style={{ borderRadius: 8, resize: 'none' }} />
                            </Form.Group>
                        </div>

                        {sendEmailResult && (
                            <Alert variant={sendEmailResult.type} className="py-2 mt-3" style={{ fontSize: 13 }}>{sendEmailResult.text}</Alert>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
                            <Button variant="light" onClick={onHide} style={{ borderRadius: 8, fontWeight: 600 }}>Cancel</Button>
                            <Button type="button" onClick={handleOpenSendEmail} style={{ borderRadius: 8, background: '#10b981', border: 'none', fontWeight: 600, padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Mail size={15} /> Send Email
                            </Button>
                            <Button type="submit" disabled={saving} style={{ borderRadius: 8, background: "#1f4e79", border: 'none', fontWeight: 600, padding: '8px 24px' }}>
                                {saving ? <><Spinner size="sm" animation="border" className="me-2" />Generating…</> : 'Generate Link'}
                            </Button>
                        </div>
                    </Form>
                )}
            </Modal.Body>
        </Modal>

        {/* CC popup — shown when "Send Email" is clicked, before the email actually sends —
            rendered as a sibling modal, not nested inside the one above, so both manage
            their own portal/backdrop independently. */}
        <Modal show={showCcPopup} onHide={() => !sendingEmail && setShowCcPopup(false)} centered>
                <Modal.Header closeButton={!sendingEmail} style={{ background: '#10b981', color: '#fff', border: 'none' }}>
                    <Modal.Title style={{ fontWeight: 700, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Mail size={18} /> Send Offer Link via Email
                    </Modal.Title>
                </Modal.Header>
                <Modal.Body style={{ padding: '1.25rem' }}>
                    <div className="small text-muted mb-1">Sending to</div>
                    <div className="fw-semibold mb-3" style={{ fontSize: 14 }}>{form.email}</div>

                    <Form.Label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>CC (optional)</Form.Label>
                    <EmailTagInput value={cc} onChange={setCc} placeholder="Add someone to CC and press Enter" />
                    <div className="small text-muted mt-2">
                        The candidate will receive an email with the onboarding link. Anyone added to CC receives a copy.
                    </div>
                </Modal.Body>
                <Modal.Footer style={{ border: 'none', paddingTop: 0 }}>
                    <Button variant="light" onClick={() => setShowCcPopup(false)} disabled={sendingEmail} style={{ borderRadius: 8, fontWeight: 600 }}>Cancel</Button>
                    <Button onClick={handleConfirmSendEmail} disabled={sendingEmail} style={{ borderRadius: 8, background: '#10b981', border: 'none', fontWeight: 600, padding: '8px 20px' }}>
                        {sendingEmail ? <><Spinner size="sm" animation="border" className="me-2" />Sending…</> : 'Send Email'}
                    </Button>
                </Modal.Footer>
            </Modal>
        </>
    );
}
