import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Spinner, Alert, Modal, Form, Button } from 'react-bootstrap';
import { CheckCircle, XCircle, Clock, Briefcase, Building2, DollarSign, User, Calendar, AlertTriangle, PenLine, ShieldCheck, Wallet, Receipt } from 'lucide-react';
import API_ENDPOINTS from '../config/api';
import PolicyAcknowledgement from './PolicyAcknowledgement';

const fmtMoney = (n) => n ? `₹${Number(n).toLocaleString('en-IN')}` : '—';
const fmtDate  = (s) => s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';

const STATUS_VIEWS = {
    rejected: {
        icon: <XCircle size={56} color="#ef4444" />,
        title: 'Offer Rejected',
        desc: 'You have declined this job offer.',
        color: '#ef4444',
    },
    submitted: {
        icon: <CheckCircle size={56} color="#10b981" />,
        title: 'Onboarding Form Submitted',
        desc: 'Your information has been received. HR will review and create your account soon.',
        color: '#10b981',
    },
    approved: {
        icon: <CheckCircle size={56} color="#8b5cf6" />,
        title: 'Welcome Aboard!',
        desc: 'Your account has been created. Please check with HR for your login credentials.',
        color: '#8b5cf6',
    },
    expired: {
        icon: <Clock size={56} color="#9ca3af" />,
        title: 'Offer Expired',
        desc: 'This offer link has expired. Please contact HR if you would like to proceed.',
        color: '#9ca3af',
    },
};

export default function OnboardingPage() {
    const { token } = useParams();
    const navigate  = useNavigate();

    const [offer, setOffer]       = useState(null);
    const [loading, setLoading]   = useState(true);
    const [error, setError]       = useState('');
    const [accepting, setAccepting] = useState(false);
    const [acceptErr, setAcceptErr] = useState('');

    // Acknowledgement form state
    const [showAck, setShowAck]     = useState(false);
    const [ackChecks, setAckChecks] = useState({ terms: false, salary: false, docs: false, policy: false });
    const [ackName, setAckName]     = useState('');
    const [ackErr, setAckErr]       = useState('');

    // Reject modal state
    const [showReject, setShowReject]   = useState(false);
    const [rejectName, setRejectName]   = useState('');
    const [rejecting, setRejecting]     = useState(false);
    const [rejectErr, setRejectErr]     = useState('');

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch(API_ENDPOINTS.ONBOARDING_BY_TOKEN(token));
                const d   = await res.json();
                if (!d.success && d.offer) {
                    setOffer(d.offer); // expired or other terminal state
                } else if (!d.success) {
                    setError(d.message || 'Invalid or expired offer link');
                } else {
                    setOffer(d.offer);
                }
            } catch {
                setError('Failed to load offer. Please check your internet connection.');
            } finally {
                setLoading(false);
            }
        })();
    }, [token]);

    const allAckChecked = Object.values(ackChecks).every(Boolean);

    const handleAckSubmit = async () => {
        if (!allAckChecked) { setAckErr('Please tick all acknowledgement checkboxes.'); return; }
        if (!ackName.trim()) { setAckErr('Please enter your full name as a digital signature.'); return; }
        if (ackName.trim().toLowerCase() !== (offer?.employee_name || '').trim().toLowerCase()) {
            setAckErr(`Name does not match. Please enter exactly: ${offer.employee_name}`);
            return;
        }
        setAckErr('');
        setAccepting(true);
        try {
            const res = await fetch(API_ENDPOINTS.ONBOARDING_ACCEPT(token), { method: 'POST' });
            const d   = await res.json();
            if (!d.success) throw new Error(d.message);
            navigate(`/onboarding/${token}/form`);
        } catch (err) {
            // "Offer is already accepted/submitted/..." means someone already moved this
            // link forward (e.g. a double-click, or revisiting after already accepting).
            // Re-fetch the real current status instead of dead-ending on the raw error —
            // if it's still safe to fill the form, just continue there.
            if (/already (accepted|submitted|approved)/i.test(err.message || '')) {
                try {
                    const freshRes = await fetch(API_ENDPOINTS.ONBOARDING_BY_TOKEN(token));
                    const freshData = await freshRes.json();
                    const freshOffer = freshData.offer;
                    if (freshOffer?.status === 'accepted') {
                        navigate(`/onboarding/${token}/form`);
                        return;
                    }
                    if (freshOffer) { setOffer(freshOffer); setShowAck(false); return; }
                } catch { /* fall through to showing the original error */ }
            }
            setAcceptErr(err.message);
            setAccepting(false);
        }
    };

    const handleAccept = () => {
        setShowAck(true);
        setAckErr('');
        setAcceptErr('');
    };

    const handleReject = async () => {
        if (!rejectName.trim()) { setRejectErr('Please enter your name to confirm'); return; }
        setRejecting(true); setRejectErr('');
        try {
            const res = await fetch(API_ENDPOINTS.ONBOARDING_REJECT(token), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ confirmed_name: rejectName }),
            });
            const d = await res.json();
            if (!d.success) throw new Error(d.message);
            setOffer(o => ({ ...o, status: 'rejected' }));
            setShowReject(false);
        } catch (err) {
            setRejectErr(err.message);
        } finally {
            setRejecting(false);
        }
    };

    if (loading) return (
        <div style={pageStyle}>
            <div style={cardStyle}>
                <Spinner animation="border" variant="primary" />
                <p style={{ marginTop: 16, color: '#6b7280' }}>Loading your offer…</p>
            </div>
        </div>
    );

    if (error) return (
        <div style={pageStyle}>
            <div style={{ ...cardStyle, textAlign: 'center' }}>
                <AlertTriangle size={56} color="#f97316" style={{ marginBottom: 12 }} />
                <h4 style={{ fontWeight: 700, color: '#111827' }}>Offer Not Found</h4>
                <p style={{ color: '#6b7280', fontSize: 14, marginTop: 8 }}>{error}</p>
            </div>
        </div>
    );

    const terminalView = STATUS_VIEWS[offer?.status];
    if (terminalView && offer.status !== 'accepted' && offer.status !== 'pending') {
        return (
            <div style={pageStyle}>
                <div style={{ ...cardStyle, textAlign: 'center' }}>
                    {terminalView.icon}
                    <h4 style={{ fontWeight: 700, color: '#111827', marginTop: 16 }}>{terminalView.title}</h4>
                    <p style={{ color: '#6b7280', fontSize: 14, marginTop: 8, maxWidth: 360, margin: '8px auto 0' }}>{terminalView.desc}</p>
                </div>
            </div>
        );
    }

    // accepted state — can still fill the form
    if (offer.status === 'accepted') {
        return (
            <div style={pageStyle}>
                <div style={cardStyle}>
                    <div style={{ textAlign: 'center', marginBottom: 24 }}>
                        <CheckCircle size={48} color="#10b981" style={{ marginBottom: 10 }} />
                        <h4 style={{ fontWeight: 700, color: '#111827' }}>Great! You accepted the offer</h4>
                        <p style={{ color: '#6b7280', fontSize: 14, marginTop: 4 }}>Now complete your onboarding form to get started.</p>
                    </div>
                    <OfferCard offer={offer} />
                    <button onClick={() => navigate(`/onboarding/${token}/form`)} style={acceptBtnStyle}>
                        Fill Onboarding Form →
                    </button>
                </div>
            </div>
        );
    }

    // 'policy' is intentionally not in this list — it's rendered as a full-text
    // PolicyAcknowledgement block below instead of a one-line item, but still lives in the
    // same ackChecks state so allAckChecked/handleSubmitAck don't need to change.
    const ACK_ITEMS = [
        { key: 'terms',   text: `I have carefully read and understood all the terms and conditions of this job offer from B2B InDemand.` },
        { key: 'salary',  text: `I confirm that the offered designation, department, employment type, and salary of ${fmtMoney(offer.salary)} per month are as agreed with HR.` },
        { key: 'docs',    text: `I understand that this offer is subject to successful verification of all submitted documents and information. Any discrepancy may result in withdrawal of the offer.` },
    ];

    // Default: pending state
    return (
        <div style={pageStyle}>
            <div style={{ ...cardStyle, maxWidth: showAck ? 600 : 520 }}>
                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: 28 }}>
                    <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                        <Briefcase size={34} color="#fff" />
                    </div>
                    <div style={{ fontSize: 12, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Job Offer from B2B InDemand</div>
                    <h2 style={{ fontWeight: 800, color: '#111827', fontSize: 24, margin: 0 }}>Hello, {offer.employee_name.split(' ')[0]}!</h2>
                    <p style={{ color: '#6b7280', fontSize: 14, marginTop: 6 }}>
                        {showAck ? 'Please read and acknowledge the following before accepting.' : "We're excited to extend a job offer to you. Please review the details below."}
                    </p>
                </div>

                {/* Offer card */}
                <OfferCard offer={offer} />

                {offer.notes && (
                    <div style={{ background: '#fefce8', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#92400e' }}>
                        <strong>Message from HR:</strong> {offer.notes}
                    </div>
                )}

                {/* ── Acknowledgement form (shows after clicking Accept) ── */}
                {showAck && (
                    <div style={{ marginBottom: 20 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                            <div style={{ width: 30, height: 30, borderRadius: 8, background: '#e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <ShieldCheck size={16} color="#4338ca" />
                            </div>
                            <span style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>Offer Acknowledgement</span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
                            {ACK_ITEMS.map(item => (
                                <label key={item.key}
                                    onClick={() => setAckChecks(c => ({ ...c, [item.key]: !c[item.key] }))}
                                    style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', borderRadius: 10, border: `1px solid ${ackChecks[item.key] ? '#bbf7d0' : '#e5e7eb'}`, background: ackChecks[item.key] ? '#f0fdf4' : '#fafafa', cursor: 'pointer', transition: 'all 0.15s' }}>
                                    <div style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${ackChecks[item.key] ? '#16a34a' : '#cbd5e1'}`, background: ackChecks[item.key] ? '#16a34a' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1, transition: 'all 0.15s' }}>
                                        {ackChecks[item.key] && <CheckCircle size={13} color="#fff" strokeWidth={3} />}
                                    </div>
                                    <span style={{ fontSize: 13, color: '#374151', lineHeight: 1.5 }}>{item.text}</span>
                                </label>
                            ))}

                            <PolicyAcknowledgement
                                title="B2BinDemand Employee Policy Handbook"
                                checked={ackChecks.policy}
                                onChange={(v) => setAckChecks(c => ({ ...c, policy: v }))}
                                checkboxLabel="I have read and agree to comply with B2BinDemand's company policies, code of conduct, and all applicable employment terms upon joining."
                            />
                        </div>

                        {/* Digital signature */}
                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '16px 18px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                                <PenLine size={15} color="#6366f1" />
                                <span style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>Digital Signature</span>
                            </div>
                            <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
                                By entering your full name below, you are digitally signing this acknowledgement and confirming that you have read and agreed to all the above statements.
                            </p>
                            <Form.Control
                                value={ackName}
                                onChange={e => { setAckName(e.target.value); setAckErr(''); }}
                                placeholder={`Type your full name: ${offer.employee_name}`}
                                style={{ borderRadius: 8, fontStyle: 'italic', fontSize: 14 }}
                            />
                            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>
                                Must match exactly: <strong style={{ color: '#374151' }}>{offer.employee_name}</strong>
                            </div>
                        </div>

                        {(ackErr || acceptErr) && (
                            <Alert variant="danger" className="mt-3 py-2" style={{ fontSize: 13 }}>
                                {ackErr || acceptErr}
                            </Alert>
                        )}
                    </div>
                )}

                {/* Action buttons */}
                {!showAck ? (
                    <>
                        {acceptErr && <Alert variant="danger" style={{ fontSize: 13 }}>{acceptErr}</Alert>}
                        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                            <button onClick={handleAccept} style={{ ...acceptBtnStyle, flex: 1 }}>
                                ✓ Accept Offer & Continue
                            </button>
                            <button onClick={() => { setShowReject(true); setRejectName(''); setRejectErr(''); }} style={rejectBtnStyle}>
                                Decline
                            </button>
                        </div>
                    </>
                ) : (
                    <div style={{ display: 'flex', gap: 12 }}>
                        <button onClick={() => { setShowAck(false); setAckErr(''); }}
                            style={{ padding: '12px 20px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
                            ← Back
                        </button>
                        <button onClick={handleAckSubmit} disabled={accepting}
                            style={{ ...acceptBtnStyle, flex: 1, opacity: (!allAckChecked || !ackName.trim()) ? 0.6 : 1 }}>
                            {accepting ? <Spinner size="sm" animation="border" style={{ marginRight: 8 }} /> : <CheckCircle size={16} style={{ marginRight: 8 }} />}
                            {accepting ? 'Processing…' : 'Confirm & Accept Offer'}
                        </button>
                    </div>
                )}

                <p style={{ textAlign: 'center', fontSize: 12, color: '#9ca3af', marginTop: 14 }}>
                    Offer valid until <strong>{fmtDate(offer.expiry_date)}</strong> · Issued by {offer.generated_by_name || 'HR'}
                </p>
            </div>

            {/* Reject confirmation modal */}
            <Modal show={showReject} onHide={() => setShowReject(false)} centered>
                <Modal.Header closeButton style={{ borderColor: '#fee2e2' }}>
                    <Modal.Title style={{ fontSize: 16, fontWeight: 700, color: '#991b1b' }}>
                        <XCircle size={18} style={{ marginRight: 8, color: '#ef4444' }} />
                        Decline Offer
                    </Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <p style={{ fontSize: 14, color: '#374151', marginBottom: 16 }}>
                        Are you sure you want to decline this offer? This action cannot be undone.
                    </p>
                    <Form.Group>
                        <Form.Label style={{ fontSize: 13, fontWeight: 600 }}>
                            Type your full name to confirm: <strong>{offer.employee_name}</strong>
                        </Form.Label>
                        <Form.Control
                            value={rejectName}
                            onChange={e => setRejectName(e.target.value)}
                            placeholder="Enter your full name exactly"
                            style={{ borderRadius: 8 }}
                        />
                    </Form.Group>
                    {rejectErr && <Alert variant="danger" className="mt-2 py-2" style={{ fontSize: 13 }}>{rejectErr}</Alert>}
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="light" onClick={() => setShowReject(false)}>Go Back</Button>
                    <Button onClick={handleReject} disabled={rejecting} style={{ background: '#ef4444', border: 'none', fontWeight: 600 }}>
                        {rejecting ? <Spinner size="sm" animation="border" className="me-2" /> : null}
                        {rejecting ? 'Processing…' : 'Confirm Decline'}
                    </Button>
                </Modal.Footer>
            </Modal>
        </div>
    );
}

function OfferCard({ offer }) {
    // PF/Professional Tax are optional — a link generated before this feature existed (or
    // with them left blank) has neither, so only show the breakdown when at least one is set.
    const hasDeductions = offer.pf_amount != null || offer.professional_tax_amount != null;
    const pf = Number(offer.pf_amount) || 0;
    const pt = Number(offer.professional_tax_amount) || 0;
    const inHand = hasDeductions ? Math.max(0, Number(offer.salary) - pf - pt) : null;

    return (
        <div style={{ background: '#f8f9ff', border: '1px solid #e0e7ff', borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <InfoItem icon={<Briefcase size={16} color="#6366f1" />} label="Position" value={offer.designation} />
                <InfoItem icon={<Building2 size={16} color="#6366f1" />} label="Department" value={offer.department} />
                <InfoItem icon={<User size={16} color="#6366f1" />} label="Employment Type" value={offer.employment_type} />
                <InfoItem icon={<DollarSign size={16} color="#6366f1" />} label="Offered Salary" value={`₹${Number(offer.salary).toLocaleString('en-IN')} / month`} />
                {hasDeductions && offer.pf_amount != null && (
                    <InfoItem icon={<Wallet size={16} color="#6366f1" />} label="PF" value={`₹${pf.toLocaleString('en-IN')} / month`} />
                )}
                {hasDeductions && offer.professional_tax_amount != null && (
                    <InfoItem icon={<Receipt size={16} color="#6366f1" />} label="Professional Tax" value={`₹${pt.toLocaleString('en-IN')} / month`} />
                )}
                {inHand != null && (
                    <InfoItem icon={<DollarSign size={16} color="#16a34a" />} label="In-Hand Salary" value={<span style={{ color: '#16a34a' }}>{`₹${inHand.toLocaleString('en-IN')} / month`}</span>} />
                )}
                {offer.reporting_manager && <InfoItem icon={<User size={16} color="#6366f1" />} label="Reporting To" value={offer.reporting_manager} />}
                <InfoItem icon={<Calendar size={16} color="#6366f1" />} label="Offer Valid Until" value={new Date(offer.expiry_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })} />
            </div>
        </div>
    );
}

function InfoItem({ icon, label, value }) {
    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>
                {icon} {label}
            </div>
            <div style={{ fontWeight: 700, color: '#111827', fontSize: 14 }}>{value || '—'}</div>
        </div>
    );
}

const pageStyle = {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #f0f4ff 0%, #faf5ff 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px 16px',
};

const cardStyle = {
    background: '#fff',
    borderRadius: 20,
    padding: '32px 28px',
    width: '100%',
    maxWidth: 520,
    boxShadow: '0 10px 40px rgba(99,102,241,0.12)',
};

const acceptBtnStyle = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '13px 24px', borderRadius: 10, border: 'none',
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer',
    transition: 'opacity 0.2s',
};

const rejectBtnStyle = {
    padding: '13px 20px', borderRadius: 10, border: '1px solid #fecaca',
    background: '#fff5f5', color: '#ef4444', fontWeight: 600, fontSize: 14,
    cursor: 'pointer', whiteSpace: 'nowrap',
};
