import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Form, Spinner, Alert, Card, Row, Col, Button, Nav } from 'react-bootstrap';
import {
    CheckCircle, AlertTriangle, Upload, X,
} from 'lucide-react';
import API_ENDPOINTS from '../config/api';
import PolicyAcknowledgement from './PolicyAcknowledgement';

const GENDERS      = ['Male', 'Female', 'Other', 'Prefer not to say'];
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
const RELATIONS    = ['Father', 'Mother', 'Spouse', 'Sibling', 'Friend', 'Other'];

const TABS = [
    { key: 'personal',  label: 'Personal' },
    { key: 'bank',      label: 'Bank' },
    { key: 'ids',       label: 'IDs' },
    { key: 'emergency', label: 'Emergency' },
    { key: 'documents', label: 'Documents' },
];

// maxMB enforced client-side before any upload attempt; server also enforces 4 MB.
const DOC_FIELDS = [
    {
        key: 'passport_photo',
        label: 'Passport Size Photo',
        required: true,
        maxMB: 4,
        accept: 'image/jpeg,image/jpg,image/png',
        hint: 'Clear front-facing photo · JPG or PNG · max 4 MB',
    },
    {
        key: 'aadhar_card_doc',
        label: 'Aadhar Card',
        required: true,
        maxMB: 4,
        accept: 'image/jpeg,image/jpg,image/png,application/pdf',
        hint: 'Both sides on one file · JPG, PNG or PDF · max 4 MB',
    },
    {
        key: 'pan_card_doc',
        label: 'PAN Card',
        required: true,
        maxMB: 4,
        accept: 'image/jpeg,image/jpg,image/png,application/pdf',
        hint: 'Clear scan or photo · JPG, PNG or PDF · max 4 MB',
    },
    {
        key: 'offer_letter_doc',
        label: 'Offer Letter / Experience Letter',
        required: false,
        maxMB: 4,
        accept: 'image/jpeg,image/jpg,image/png,application/pdf,.doc,.docx',
        hint: 'Previous experience letter if applicable · optional · max 4 MB',
    },
];

const fmtSize = (bytes) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const normalizeNameValue = (value = '') => value.replace(/\s+/g, ' ').trim();

const getDraftStorageKey = (token) => `onboarding_draft_${token || 'unknown'}`;

const loadDraftFromStorage = (token) => {
    if (!token || typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem(getDraftStorageKey(token));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        return null;
    }
};

const saveDraftToStorage = (token, draft) => {
    if (!token || typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(getDraftStorageKey(token), JSON.stringify(draft));
    } catch {
        // ignore storage quota / browser restriction issues
    }
};

const clearDraftFromStorage = (token) => {
    if (!token || typeof window === 'undefined') return;
    try {
        window.localStorage.removeItem(getDraftStorageKey(token));
    } catch {
        // ignore storage errors
    }
};

// ── File upload field ─────────────────────────────────────────────────────────
function FileField({ label, required, accept, hint, maxMB, file, onChange, sizeError }) {
    const inputRef = useRef(null);

    const handleChange = (f) => {
        if (!f) { onChange(null); return; }
        if (maxMB && f.size > maxMB * 1024 * 1024) {
            onChange(null, `"${f.name}" is ${fmtSize(f.size)} — max allowed is ${maxMB} MB. Please compress the file and try again.`);
            return;
        }
        onChange(f, null);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        const f = e.dataTransfer.files[0];
        if (f) handleChange(f);
    };

    const hasError = !!sizeError;

    return (
        <Form.Group className="mb-3">
            <Form.Label className="fw-semibold small">
                {label} {required && <span className="text-danger">*</span>}
            </Form.Label>
            <div
                onDrop={handleDrop}
                onDragOver={e => e.preventDefault()}
                onClick={() => inputRef.current?.click()}
                className={`d-flex align-items-center gap-2 p-2 border rounded ${hasError ? 'border-danger' : ''}`}
                style={{ cursor: 'pointer', background: hasError ? '#fff5f5' : file ? '#f8f9fa' : '#fff' }}
            >
                <div className="d-flex align-items-center justify-content-center rounded-circle flex-shrink-0"
                    style={{ width: 32, height: 32, background: '#f1f3f5' }}>
                    {hasError
                        ? <AlertTriangle size={16} className="text-danger" />
                        : file
                            ? <CheckCircle size={16} className="text-success" />
                            : <Upload size={16} className="text-secondary" />}
                </div>
                <div className="flex-grow-1 min-w-0">
                    {hasError ? (
                        <div className="small text-danger fw-semibold">{sizeError}</div>
                    ) : file ? (
                        <>
                            <div className="small fw-semibold text-truncate">{file.name}</div>
                            <div className="text-muted" style={{ fontSize: 11 }}>{fmtSize(file.size)}</div>
                        </>
                    ) : (
                        <>
                            <div className="small fw-semibold">Click to upload or drag &amp; drop</div>
                            <div className="text-muted" style={{ fontSize: 11 }}>{hint}</div>
                        </>
                    )}
                </div>
                {(file || hasError) && (
                    <button
                        type="button"
                        onClick={e => { e.stopPropagation(); onChange(null, null); }}
                        className="btn btn-sm btn-link text-secondary p-1 flex-shrink-0"
                    >
                        <X size={16} />
                    </button>
                )}
            </div>
            <input
                ref={inputRef}
                type="file"
                accept={accept}
                style={{ display: 'none' }}
                onChange={e => handleChange(e.target.files[0] || null)}
            />
        </Form.Group>
    );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function OnboardingFormPage() {
    const { token } = useParams();
    const navigate  = useNavigate();

    const [offer, setOffer]       = useState(null);
    const [loading, setLoading]   = useState(true);
    const [offerErr, setOfferErr] = useState('');
    const [tab, setTab]           = useState('personal');

    const [form, setForm] = useState({
        first_name: '', middle_name: '', last_name: '', email: '',
        phone: '', dob: '', gender: '', blood_group: '', linkedin_url: '',
        address: '', city: '', state: '', pincode: '',
        joining_date: '',
        bank_account_name: '', account_number: '', ifsc_code: '', branch_name: '',
        pan_number: '', aadhar_number: '', uan: '',
        emergency_contact_name: '', emergency_contact: '', emergency_contact_relation: '',
    });

    // files[key] = File | null,  fileSizeErrors[key] = string | null
    const [files, setFiles]           = useState({ passport_photo: null, aadhar_card_doc: null, pan_card_doc: null, offer_letter_doc: null });
    const [fileSizeErrors, setFileSizeErrors] = useState({ passport_photo: null, aadhar_card_doc: null, pan_card_doc: null, offer_letter_doc: null });
    const [policyChecks, setPolicyChecks] = useState({ privacy: false });

    const [submitting, setSubmitting]         = useState(false);
    const [submitErr, setSubmitErr]           = useState('');
    const [done, setDone]                     = useState(false);
    const [credentials, setCredentials]       = useState(null);
    const [credsCopied, setCredsCopied]       = useState(false);
    const [uploadProgress, setUploadProgress] = useState('');
    const [draftReady, setDraftReady]         = useState(false);
    const [draftRestored, setDraftRestored]   = useState(false);
    const [isDirty, setIsDirty]               = useState(false);
    const saveTimerRef = useRef(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(API_ENDPOINTS.ONBOARDING_BY_TOKEN(token));
                const d   = await res.json();
                if (!d.success && !d.offer) { setOfferErr(d.message || 'Invalid link'); return; }
                const o = d.offer;
                if (!['pending', 'accepted'].includes(o.status)) {
                    // Already submitted/approved/rejected/expired — the root offer page
                    // already renders the correct branded status for all of these, so
                    // send the candidate there instead of showing a raw error here (this
                    // is what a page refresh after submitting used to do).
                    if (!cancelled) navigate(`/onboarding/${token}`, { replace: true });
                    return;
                }
                const parts = (o.employee_name || '').trim().split(/\s+/);
                const fallbackForm = {
                    first_name:  normalizeNameValue(parts[0] || ''),
                    last_name:   normalizeNameValue(parts.length > 1 ? parts[parts.length - 1] : ''),
                    middle_name: normalizeNameValue(parts.length > 2 ? parts.slice(1, -1).join(' ') : ''),
                };

                const savedDraft = loadDraftFromStorage(token);
                const initialForm = {
                    ...form,
                    ...fallbackForm,
                    ...(savedDraft?.form || {}),
                };

                if (!cancelled) {
                    setOffer(o);
                    setForm({
                        ...initialForm,
                        first_name:  normalizeNameValue(initialForm.first_name || ''),
                        last_name:   normalizeNameValue(initialForm.last_name || ''),
                        middle_name: normalizeNameValue(initialForm.middle_name || ''),
                    });
                    if (savedDraft?.tab) setTab(savedDraft.tab);
                    if (savedDraft?.form) setDraftRestored(true);
                    setDraftReady(true);
                }
            } catch {
                if (!cancelled) setOfferErr('Failed to load offer details. Please try again.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, [token]);

    const persistCurrentDraft = () => {
        if (!draftReady || !token) return;
        const draft = {
            form: {
                ...form,
                first_name:  normalizeNameValue(form.first_name || ''),
                middle_name: normalizeNameValue(form.middle_name || ''),
                last_name:   normalizeNameValue(form.last_name || ''),
                emergency_contact_name: normalizeNameValue(form.emergency_contact_name || ''),
            },
            tab,
            updatedAt: Date.now(),
        };
        saveDraftToStorage(token, draft);
        setIsDirty(false);
    };

    useEffect(() => {
        if (!draftReady || !token) return;
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
            persistCurrentDraft();
        }, 400);

        return () => {
            if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current);
                saveTimerRef.current = null;
            }
        };
    }, [draftReady, token, form, tab]);

    useEffect(() => {
        if (!draftReady || !token) return;
        const handleBeforeUnload = (event) => {
            if (isDirty) {
                event.preventDefault();
                event.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [draftReady, token, isDirty]);

    useEffect(() => {
        return () => {
            if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current);
            }
            persistCurrentDraft();
        };
    }, [token, draftReady, form, tab]);

    const set = (k, v) => {
        const normalizedValue = ['first_name', 'middle_name', 'last_name', 'emergency_contact_name'].includes(k)
            ? normalizeNameValue(v)
            : v;
        setForm(f => ({ ...f, [k]: normalizedValue }));
        setIsDirty(true);
    };

    const handleFileChange = (key, file, sizeErr) => {
        setFiles(f => ({ ...f, [key]: file }));
        setFileSizeErrors(e => ({ ...e, [key]: sizeErr || null }));
    };

    // Upload one file to the backend (one at a time, each ≤ 4 MB).
    // The backend uses the service role key to upload to Supabase — no RLS policy needed.
    const uploadOneFile = async (fieldKey, file, label) => {
        const fd = new FormData();
        fd.append('file', file, file.name);
        fd.append('field', fieldKey);

        const res = await fetch(API_ENDPOINTS.ONBOARDING_UPLOAD_FILE(token), {
            method: 'POST',
            body: fd,
            // No Content-Type — browser sets multipart/form-data + boundary automatically
        });

        const raw = await res.text();
        let data;
        try {
            data = JSON.parse(raw);
        } catch {
            const preview = raw.replace(/<[^>]*>/g, '').trim().substring(0, 150);
            throw new Error(`Upload of ${label} failed (HTTP ${res.status}): ${preview || 'Unexpected server response'}`);
        }

        if (!data.success) {
            throw new Error(`Upload of ${label} failed: ${data.message}`);
        }

        console.log(`[onboarding] ${fieldKey} uploaded →`, data.publicUrl);
        return data.publicUrl;
    };

    // Single source of truth for "is this tab's required data filled in" — used both
    // to gate the Next button (below) and as the final check before actually submitting,
    // so the two can never drift into checking different things.
    const validateTab = (key) => {
        if (key === 'personal') {
            if (!form.first_name?.trim()) return { msg: 'First Name is required.', tab: 'personal' };
            if (!form.last_name?.trim())  return { msg: 'Last Name is required.', tab: 'personal' };
            if (!form.email?.trim())      return { msg: 'Email Address is required.', tab: 'personal' };
            if (!form.phone?.trim())      return { msg: 'Phone Number is required.', tab: 'personal' };
            if (!form.dob)                return { msg: 'Date of Birth is required.', tab: 'personal' };
            if (!form.blood_group)        return { msg: 'Blood Group is required.', tab: 'personal' };
            if (!form.joining_date)       return { msg: 'Expected Joining Date is required.', tab: 'personal' };
            if (!form.address?.trim())    return { msg: 'Residential Address is required.', tab: 'personal' };
            return null;
        }
        if (key === 'bank') {
            if (!form.bank_account_name?.trim()) return { msg: 'Account Holder Name is required.', tab: 'bank' };
            if (!form.account_number?.trim())    return { msg: 'Account Number is required.', tab: 'bank' };
            if (!form.ifsc_code?.trim())         return { msg: 'IFSC Code is required.', tab: 'bank' };
            return null;
        }
        if (key === 'emergency') {
            if (!form.emergency_contact?.trim()) return { msg: 'Emergency Contact Number is required.', tab: 'emergency' };
            return null;
        }
        if (key === 'documents') {
            const sizeErrField = Object.entries(fileSizeErrors).find(([, v]) => v);
            if (sizeErrField) return { msg: fileSizeErrors[sizeErrField[0]], tab: 'documents' };
            if (!files.passport_photo)  return { msg: 'Passport size photo is required — go to Documents tab.', tab: 'documents' };
            if (!files.aadhar_card_doc) return { msg: 'Aadhar card is required — go to Documents tab.', tab: 'documents' };
            if (!files.pan_card_doc)    return { msg: 'PAN card is required — go to Documents tab.', tab: 'documents' };
            if (!policyChecks.privacy)  return { msg: 'Please read and agree to the Employee Privacy Policy — go to Documents tab.', tab: 'documents' };
            return null;
        }
        return null; // 'ids' tab has no required fields
    };

    // Only validates when moving FORWARD — going back, or jumping to an already-visited
    // tab, never blocks (nothing new is being skipped).
    const goToTab = (targetKey) => {
        const curIdx = TABS.findIndex(t => t.key === tab);
        const targetIdx = TABS.findIndex(t => t.key === targetKey);
        if (targetIdx > curIdx) {
            const err = validateTab(tab);
            if (err) { setSubmitErr(err.msg); return; }
        }
        setSubmitErr('');
        setTab(targetKey);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitErr('');

        for (const t of TABS) {
            const err = validateTab(t.key);
            if (err) { setSubmitErr(err.msg); setTab(err.tab); return; }
        }

        setSubmitting(true);

        try {
            const docUrls  = {};
            const required = [
                { key: 'passport_photo',  label: 'Passport Photo' },
                { key: 'aadhar_card_doc', label: 'Aadhar Card' },
                { key: 'pan_card_doc',    label: 'PAN Card' },
            ];
            const optional = [{ key: 'offer_letter_doc', label: 'Offer / Experience Letter' }];
            const total = required.length + optional.filter(o => files[o.key]).length;
            let count = 0;

            // Step 1 — upload each file one at a time via backend endpoint
            for (const { key, label } of required) {
                count++;
                setUploadProgress(`Uploading ${label}… (${count}/${total})`);
                docUrls[key] = await uploadOneFile(key, files[key], label);
            }
            for (const { key, label } of optional) {
                if (files[key]) {
                    count++;
                    setUploadProgress(`Uploading ${label}… (${count}/${total})`);
                    docUrls[key] = await uploadOneFile(key, files[key], label);
                }
            }

            // Step 2 — submit form fields + public URLs as JSON (tiny payload)
            const normalizedForm = {
                ...form,
                first_name:  normalizeNameValue(form.first_name || ''),
                middle_name: normalizeNameValue(form.middle_name || ''),
                last_name:   normalizeNameValue(form.last_name || ''),
                emergency_contact_name: normalizeNameValue(form.emergency_contact_name || ''),
            };

            setUploadProgress('Saving your details…');
            const res = await fetch(API_ENDPOINTS.ONBOARDING_SUBMIT(token), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...normalizedForm, ...docUrls }),
            });

            const raw = await res.text();
            let d;
            try { d = JSON.parse(raw); } catch {
                const preview = raw.replace(/<[^>]*>/g, '').trim().substring(0, 180);
                throw new Error(`Server error (${res.status}): ${preview || 'Unexpected response'}`);
            }
            if (!d.success) throw new Error(d.message);
            clearDraftFromStorage(token);
            setIsDirty(false);
            if (d.employee_id && d.temp_password) {
                setCredentials({ employeeId: d.employee_id, tempPassword: d.temp_password, email: d.email });
            }
            setDone(true);
        } catch (err) {
            console.error('[onboarding] submit error:', err);
            setSubmitErr(err.message);
        } finally {
            setSubmitting(false);
            setUploadProgress('');
        }
    };

    // ── States ────────────────────────────────────────────────────────────────
    if (loading) return (
        <div className="ob-page" style={pageStyle}>
            <style>{RESPONSIVE_CSS}</style>
            <Spinner animation="border" variant="primary" />
        </div>
    );

    if (offerErr) return (
        <div className="ob-page" style={pageStyle}>
            <style>{RESPONSIVE_CSS}</style>
            <Card className="ob-card shadow-sm" style={cardStyle}>
                <Card.Body className="text-center p-4">
                    <AlertTriangle size={44} className="text-warning mb-2" />
                    <h5 className="fw-bold">Cannot Load Form</h5>
                    <p className="text-muted small">{offerErr}</p>
                    <Button variant="primary" onClick={() => navigate(`/onboarding/${token}`)}>
                        Back to Offer
                    </Button>
                </Card.Body>
            </Card>
        </div>
    );

    if (done) {
        const loginUrl = `${window.location.origin}/login`;
        const copyCredentials = () => {
            if (!credentials) return;
            navigator.clipboard.writeText(
                `Employee ID: ${credentials.employeeId}\nPassword: ${credentials.tempPassword}\nLogin: ${loginUrl}`
            ).then(() => {
                setCredsCopied(true);
                setTimeout(() => setCredsCopied(false), 2000);
            });
        };

        return (
            <div className="ob-page" style={pageStyle}>
                <style>{RESPONSIVE_CSS}</style>
                <Card className="ob-card shadow-sm text-center" style={{ ...cardStyle, maxWidth: credentials ? 460 : 420 }}>
                    <Card.Body className="p-4">
                        <CheckCircle size={54} className="text-success mb-2" />
                        <h5 className="fw-bold">Onboarding Form Submitted!</h5>

                        {credentials ? (
                            <>
                                <p className="text-muted small mt-2 mx-auto" style={{ maxWidth: 380 }}>
                                    Your employee account has been created. Here are your login credentials —
                                    please save them now, as the password won't be shown again here.
                                </p>

                                <Card className="text-start mt-3" style={{ background: '#fffbeb', borderColor: '#fde68a' }}>
                                    <Card.Body className="p-3">
                                        <div className="mb-2">
                                            <div className="text-uppercase text-muted fw-bold" style={{ fontSize: 11 }}>Employee ID</div>
                                            <div className="fw-bold font-monospace">{credentials.employeeId}</div>
                                        </div>
                                        <div className="mb-2">
                                            <div className="text-uppercase text-muted fw-bold" style={{ fontSize: 11 }}>Email</div>
                                            <div className="fw-semibold">{credentials.email}</div>
                                        </div>
                                        <div>
                                            <div className="text-uppercase text-muted fw-bold" style={{ fontSize: 11 }}>Temporary Password</div>
                                            <div className="fw-bold font-monospace">{credentials.tempPassword}</div>
                                        </div>
                                    </Card.Body>
                                </Card>

                                <div className="small fw-semibold mt-2" style={{ color: '#b45309' }}>
                                    ⚠ Please save these credentials — you'll need them to log in.
                                </div>

                                <Button variant={credsCopied ? 'success' : 'outline-secondary'} className="mt-3 me-2" onClick={copyCredentials}>
                                    {credsCopied ? '✓ Copied!' : 'Copy Credentials'}
                                </Button>
                                <Button variant="primary" className="mt-3" href={loginUrl}>
                                    Go to Login →
                                </Button>
                                <div className="text-muted mt-2" style={{ fontSize: 11, wordBreak: 'break-all' }}>{loginUrl}</div>
                                <div className="text-muted small mt-2">
                                    You can change this password after logging in.
                                </div>
                            </>
                        ) : (
                            <p className="text-muted small mt-2 mx-auto" style={{ maxWidth: 380 }}>
                                Thank you! HR will review your information and documents, then create your employee account. You'll be contacted with your login credentials shortly.
                            </p>
                        )}
                    </Card.Body>
                </Card>
            </div>
        );
    }

    const docsDone = DOC_FIELDS.filter(d => d.required && !files[d.key]).length === 0
        && !Object.values(fileSizeErrors).some(Boolean)
        && policyChecks.privacy;

    const isDone = (key) => {
        if (key === 'documents') return docsDone;
        if (key === 'bank') return !!(form.bank_account_name && form.account_number && form.ifsc_code);
        if (key === 'personal') return !!(form.first_name && form.last_name && form.email);
        return false;
    };

    return (
        <div className="ob-page" style={pageStyle}>
            <style>{RESPONSIVE_CSS}</style>
            <Card className="ob-card shadow-sm" style={{ ...cardStyle, maxWidth: 700 }}>
                <Card.Header className="bg-light py-2 py-md-3">
                    <div className="text-uppercase text-muted" style={{ fontSize: 11, letterSpacing: 0.5 }}>B2B InDemand — Employee Onboarding</div>
                    <h5 className="fw-bold mb-0">Complete Your Onboarding</h5>
                    <div className="text-muted small">
                        {offer.designation} · {offer.department} · ₹{Number(offer.salary).toLocaleString('en-IN')}/month
                    </div>
                </Card.Header>

                <Card.Body className="p-3 p-md-4">
                    <Nav variant="pills" className="mb-3 flex-nowrap overflow-auto pb-1">
                        {TABS.map((t) => (
                            <Nav.Item key={t.key} className="me-1">
                                <Nav.Link
                                    active={tab === t.key}
                                    onClick={() => goToTab(t.key)}
                                    className="small py-1 px-3 text-nowrap"
                                >
                                    {isDone(t.key) && tab !== t.key && <CheckCircle size={12} className="me-1" />}
                                    {t.label}
                                </Nav.Link>
                            </Nav.Item>
                        ))}
                    </Nav>

                    <Form onSubmit={handleSubmit}>
                        {draftRestored && (
                            <Alert variant="info" className="small py-2 mb-3">
                                Your saved progress was restored. You can continue from where you left off.
                            </Alert>
                        )}
                        {submitErr && (
                            <Alert variant="danger" className="small py-2 mb-3" dismissible onClose={() => setSubmitErr('')}>
                                {submitErr}
                            </Alert>
                        )}

                        {/* ── Personal Info ── */}
                        {tab === 'personal' && (
                            <>
                                <Row className="g-2 g-md-3 mb-3">
                                    <Col xs={12} md={4}>
                                        <Form.Group>
                                            <Form.Label className="fw-semibold small">First Name <span className="text-danger">*</span></Form.Label>
                                            <Form.Control size="sm" value={form.first_name} onChange={e => set('first_name', e.target.value)} required />
                                        </Form.Group>
                                    </Col>
                                    <Col xs={12} md={4}>
                                        <Form.Group>
                                            <Form.Label className="fw-semibold small">Middle Name</Form.Label>
                                            <Form.Control size="sm" value={form.middle_name} onChange={e => set('middle_name', e.target.value)} />
                                        </Form.Group>
                                    </Col>
                                    <Col xs={12} md={4}>
                                        <Form.Group>
                                            <Form.Label className="fw-semibold small">Last Name <span className="text-danger">*</span></Form.Label>
                                            <Form.Control size="sm" value={form.last_name} onChange={e => set('last_name', e.target.value)} required />
                                        </Form.Group>
                                    </Col>
                                </Row>
                                <Row className="g-2 g-md-3 mb-3">
                                    <Col xs={12} md={6}>
                                        <Form.Group>
                                            <Form.Label className="fw-semibold small">Email Address <span className="text-danger">*</span></Form.Label>
                                            <Form.Control size="sm" type="email" value={form.email} onChange={e => set('email', e.target.value)} required />
                                        </Form.Group>
                                    </Col>
                                    <Col xs={12} md={6}>
                                        <Form.Group>
                                            <Form.Label className="fw-semibold small">Phone Number <span className="text-danger">*</span></Form.Label>
                                            <Form.Control size="sm" value={form.phone} onChange={e => set('phone', e.target.value)} required />
                                        </Form.Group>
                                    </Col>
                                </Row>
                                <Row className="g-2 g-md-3 mb-3">
                                    <Col xs={12} md={6}>
                                        <Form.Group>
                                            <Form.Label className="fw-semibold small">Date of Birth <span className="text-danger">*</span></Form.Label>
                                            <Form.Control size="sm" type="date" value={form.dob} onChange={e => set('dob', e.target.value)} required />
                                        </Form.Group>
                                    </Col>
                                    <Col xs={12} md={6}>
                                        <Form.Group>
                                            <Form.Label className="fw-semibold small">Gender</Form.Label>
                                            <Form.Select size="sm" value={form.gender} onChange={e => set('gender', e.target.value)}>
                                                <option value="">Select gender</option>
                                                {GENDERS.map(g => <option key={g}>{g}</option>)}
                                            </Form.Select>
                                        </Form.Group>
                                    </Col>
                                </Row>
                                <Row className="g-2 g-md-3 mb-3">
                                    <Col xs={12} md={6}>
                                        <Form.Group>
                                            <Form.Label className="fw-semibold small">Blood Group <span className="text-danger">*</span></Form.Label>
                                            <Form.Select size="sm" value={form.blood_group} onChange={e => set('blood_group', e.target.value)} required>
                                                <option value="">Select blood group</option>
                                                {BLOOD_GROUPS.map(b => <option key={b}>{b}</option>)}
                                            </Form.Select>
                                        </Form.Group>
                                    </Col>
                                    <Col xs={12} md={6}>
                                        <Form.Group>
                                            <Form.Label className="fw-semibold small">Expected Joining Date <span className="text-danger">*</span></Form.Label>
                                            <Form.Control size="sm" type="date" value={form.joining_date} onChange={e => set('joining_date', e.target.value)} required />
                                        </Form.Group>
                                    </Col>
                                </Row>
                                <Row className="g-2 g-md-3 mb-3">
                                    <Col xs={12}>
                                        <Form.Group>
                                            <Form.Label className="fw-semibold small">LinkedIn Profile URL</Form.Label>
                                            <Form.Control size="sm" type="url" placeholder="https://linkedin.com/in/…" value={form.linkedin_url} onChange={e => set('linkedin_url', e.target.value)} />
                                        </Form.Group>
                                    </Col>
                                </Row>
                                <Row className="g-2 g-md-3 mb-3">
                                    <Col xs={12}>
                                        <Form.Group>
                                            <Form.Label className="fw-semibold small">Residential Address <span className="text-danger">*</span></Form.Label>
                                            <Form.Control as="textarea" rows={2} size="sm" value={form.address} onChange={e => set('address', e.target.value)} required style={{ resize: 'none' }} />
                                        </Form.Group>
                                    </Col>
                                </Row>
                                <Row className="g-2 g-md-3">
                                    <Col xs={12} md={4}>
                                        <Form.Group>
                                            <Form.Label className="fw-semibold small">City</Form.Label>
                                            <Form.Control size="sm" value={form.city} onChange={e => set('city', e.target.value)} />
                                        </Form.Group>
                                    </Col>
                                    <Col xs={12} md={4}>
                                        <Form.Group>
                                            <Form.Label className="fw-semibold small">State</Form.Label>
                                            <Form.Control size="sm" value={form.state} onChange={e => set('state', e.target.value)} />
                                        </Form.Group>
                                    </Col>
                                    <Col xs={12} md={4}>
                                        <Form.Group>
                                            <Form.Label className="fw-semibold small">Pincode</Form.Label>
                                            <Form.Control size="sm" value={form.pincode} onChange={e => set('pincode', e.target.value)} />
                                        </Form.Group>
                                    </Col>
                                </Row>
                            </>
                        )}

                        {/* ── Bank Details ── */}
                        {tab === 'bank' && (
                            <>
                                <Alert variant="warning" className="small py-2 mb-3">
                                    Bank details are mandatory for salary disbursement and are kept securely.
                                </Alert>
                                <Row className="g-2 g-md-3 mb-3">
                                    <Col xs={12} md={6}>
                                        <Form.Group>
                                            <Form.Label className="fw-semibold small">Account Holder Name <span className="text-danger">*</span></Form.Label>
                                            <Form.Control size="sm" value={form.bank_account_name} onChange={e => set('bank_account_name', e.target.value)} required />
                                        </Form.Group>
                                    </Col>
                                    <Col xs={12} md={6}>
                                        <Form.Group>
                                            <Form.Label className="fw-semibold small">Account Number <span className="text-danger">*</span></Form.Label>
                                            <Form.Control size="sm" value={form.account_number} onChange={e => set('account_number', e.target.value)} required />
                                        </Form.Group>
                                    </Col>
                                </Row>
                                <Row className="g-2 g-md-3">
                                    <Col xs={12} md={6}>
                                        <Form.Group>
                                            <Form.Label className="fw-semibold small">IFSC Code <span className="text-danger">*</span></Form.Label>
                                            <Form.Control size="sm" value={form.ifsc_code} onChange={e => set('ifsc_code', e.target.value.toUpperCase())} required maxLength={11} />
                                        </Form.Group>
                                    </Col>
                                    <Col xs={12} md={6}>
                                        <Form.Group>
                                            <Form.Label className="fw-semibold small">Branch Name</Form.Label>
                                            <Form.Control size="sm" value={form.branch_name} onChange={e => set('branch_name', e.target.value)} />
                                        </Form.Group>
                                    </Col>
                                </Row>
                            </>
                        )}

                        {/* ── IDs ── */}
                        {tab === 'ids' && (
                            <Row className="g-2 g-md-3">
                                <Col xs={12} md={4}>
                                    <Form.Group>
                                        <Form.Label className="fw-semibold small">PAN Number</Form.Label>
                                        <Form.Control size="sm" value={form.pan_number} onChange={e => set('pan_number', e.target.value.toUpperCase())} maxLength={10} />
                                    </Form.Group>
                                </Col>
                                <Col xs={12} md={4}>
                                    <Form.Group>
                                        <Form.Label className="fw-semibold small">Aadhar Number</Form.Label>
                                        <Form.Control size="sm" value={form.aadhar_number} onChange={e => set('aadhar_number', e.target.value)} maxLength={12} />
                                    </Form.Group>
                                </Col>
                                <Col xs={12} md={4}>
                                    <Form.Group>
                                        <Form.Label className="fw-semibold small">UAN (PF Number)</Form.Label>
                                        <Form.Control size="sm" value={form.uan} onChange={e => set('uan', e.target.value)} />
                                    </Form.Group>
                                </Col>
                            </Row>
                        )}

                        {/* ── Emergency Contact ── */}
                        {tab === 'emergency' && (
                            <Row className="g-2 g-md-3">
                                <Col xs={12} md={4}>
                                    <Form.Group>
                                        <Form.Label className="fw-semibold small">Contact Person Name</Form.Label>
                                        <Form.Control size="sm" value={form.emergency_contact_name} onChange={e => set('emergency_contact_name', e.target.value)} />
                                    </Form.Group>
                                </Col>
                                <Col xs={12} md={4}>
                                    <Form.Group>
                                        <Form.Label className="fw-semibold small">Relationship</Form.Label>
                                        <Form.Select size="sm" value={form.emergency_contact_relation} onChange={e => set('emergency_contact_relation', e.target.value)}>
                                            <option value="">Select relation</option>
                                            {RELATIONS.map(r => <option key={r}>{r}</option>)}
                                        </Form.Select>
                                    </Form.Group>
                                </Col>
                                <Col xs={12} md={4}>
                                    <Form.Group>
                                        <Form.Label className="fw-semibold small">Contact Number <span className="text-danger">*</span></Form.Label>
                                        <Form.Control size="sm" value={form.emergency_contact} onChange={e => set('emergency_contact', e.target.value)} required />
                                    </Form.Group>
                                </Col>
                            </Row>
                        )}

                        {/* ── Documents ── */}
                        {tab === 'documents' && (
                            <>
                                <p className="text-muted small">
                                    Upload clear scans or photos. Max 4 MB per file — if your file is larger, please compress it before uploading.
                                </p>
                                {DOC_FIELDS.map(d => (
                                    <FileField
                                        key={d.key}
                                        label={d.label}
                                        required={d.required}
                                        accept={d.accept}
                                        hint={d.hint}
                                        maxMB={d.maxMB}
                                        file={files[d.key]}
                                        sizeError={fileSizeErrors[d.key]}
                                        onChange={(f, err) => handleFileChange(d.key, f, err)}
                                    />
                                ))}

                                <PolicyAcknowledgement
                                    title="Employee Privacy Policy"
                                    checked={policyChecks.privacy}
                                    onChange={(v) => setPolicyChecks(p => ({ ...p, privacy: v }))}
                                    checkboxLabel="I have read and agree to the Employee Privacy Policy."
                                />
                            </>
                        )}

                        {/* ── Navigation ── */}
                        <div className="d-flex justify-content-between align-items-center mt-4 pt-3 border-top">
                            <Button
                                variant="outline-secondary"
                                onClick={() => {
                                    const idx = TABS.findIndex(t => t.key === tab);
                                    if (idx > 0) goToTab(TABS[idx - 1].key);
                                }}
                                disabled={tab === TABS[0].key}
                            >
                                ← Back
                            </Button>

                            {tab !== TABS[TABS.length - 1].key ? (
                                <Button
                                    variant="primary"
                                    onClick={() => {
                                        const idx = TABS.findIndex(t => t.key === tab);
                                        goToTab(TABS[idx + 1].key);
                                    }}
                                >
                                    Next →
                                </Button>
                            ) : (
                                <div className="d-flex flex-column align-items-end gap-1">
                                    {uploadProgress && (
                                        <div className="small text-primary d-flex align-items-center gap-2">
                                            <Spinner size="sm" animation="border" />
                                            {uploadProgress}
                                        </div>
                                    )}
                                    <Button variant="success" type="submit" disabled={submitting} className="d-flex align-items-center gap-2">
                                        {submitting ? <Spinner size="sm" animation="border" /> : <CheckCircle size={16} />}
                                        {submitting ? 'Submitting…' : 'Submit Onboarding Form'}
                                    </Button>
                                </div>
                            )}
                        </div>
                    </Form>
                </Card.Body>
            </Card>
        </div>
    );
}

const pageStyle = {
    minHeight: '100vh',
    background: '#f8f9fa',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '32px 16px',
};

// On phones, the page's own padding was showing as wasted space around the card. Below
// 480px the card just goes edge-to-edge (no page padding, no rounded corners, no shadow)
// instead of floating in the middle of visible background. Desktop/tablet layout untouched.
const RESPONSIVE_CSS = `
  @media (max-width: 480px) {
    .ob-page { padding: 0; align-items: stretch; }
    .ob-card { border-radius: 0 !important; box-shadow: none !important; max-width: 100% !important; min-height: 100vh; }
  }
`;

const cardStyle = {
    width: '100%',
    maxWidth: 520,
};
