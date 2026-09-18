import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Form, Spinner, Alert } from 'react-bootstrap';
import {
    CheckCircle, AlertTriangle, User, CreditCard, ShieldCheck, Phone, FileUp, Upload, X,
} from 'lucide-react';
import API_ENDPOINTS from '../config/api';
import PolicyAcknowledgement from './PolicyAcknowledgement';

const GENDERS      = ['Male', 'Female', 'Other', 'Prefer not to say'];
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
const RELATIONS    = ['Father', 'Mother', 'Spouse', 'Sibling', 'Friend', 'Other'];

const TABS = [
    { key: 'personal',  label: 'Personal',  icon: User },
    { key: 'bank',      label: 'Bank',       icon: CreditCard },
    { key: 'ids',       label: 'IDs',        icon: ShieldCheck },
    { key: 'emergency', label: 'Emergency',  icon: Phone },
    { key: 'documents', label: 'Documents',  icon: FileUp },
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
        <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                {label}
                {required && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
            </div>
            <div
                onDrop={handleDrop}
                onDragOver={e => e.preventDefault()}
                onClick={() => inputRef.current?.click()}
                style={{
                    border: `2px dashed ${hasError ? '#ef4444' : file ? '#10b981' : '#c7d2fe'}`,
                    borderRadius: 10,
                    padding: '14px 16px',
                    background: hasError ? '#fff5f5' : file ? '#f0fdf4' : '#f8f9ff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    transition: 'border-color 0.15s, background 0.15s',
                }}
            >
                <div style={{
                    width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                    background: hasError ? '#fee2e2' : file ? '#d1fae5' : '#e0e7ff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    {hasError
                        ? <AlertTriangle size={18} color="#ef4444" />
                        : file
                            ? <CheckCircle size={18} color="#10b981" />
                            : <Upload size={18} color="#6366f1" />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    {hasError ? (
                        <div style={{ fontSize: 12, color: '#dc2626', fontWeight: 500, lineHeight: 1.4 }}>{sizeError}</div>
                    ) : file ? (
                        <>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#065f46', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</div>
                            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>{fmtSize(file.size)}</div>
                        </>
                    ) : (
                        <>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#4338ca' }}>Click to upload or drag &amp; drop</div>
                            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{hint}</div>
                        </>
                    )}
                </div>
                {(file || hasError) && (
                    <button
                        type="button"
                        onClick={e => { e.stopPropagation(); onChange(null, null); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#9ca3af', flexShrink: 0 }}
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
        </div>
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
            <div className="ob-card" style={cardStyle}>
                <div style={{ textAlign: 'center' }}>
                    <AlertTriangle size={48} color="#f97316" style={{ marginBottom: 12 }} />
                    <h5 style={{ fontWeight: 700 }}>Cannot Load Form</h5>
                    <p style={{ color: '#6b7280', fontSize: 14 }}>{offerErr}</p>
                    <button onClick={() => navigate(`/onboarding/${token}`)} style={{ marginTop: 12, background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', cursor: 'pointer', fontWeight: 600 }}>
                        Back to Offer
                    </button>
                </div>
            </div>
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
                <div className="ob-card" style={{ ...cardStyle, textAlign: 'center', maxWidth: credentials ? 460 : 420 }}>
                    <CheckCircle size={60} color="#10b981" style={{ marginBottom: 16 }} />
                    <h4 style={{ fontWeight: 800, color: '#111827' }}>Onboarding Form Submitted!</h4>

                    {credentials ? (
                        <>
                            <p style={{ color: '#6b7280', fontSize: 14, marginTop: 8, maxWidth: 380, margin: '8px auto 0' }}>
                                Your employee account has been created. Here are your login credentials —
                                please save them now, as the password won't be shown again here.
                            </p>

                            <div style={{ background: '#fefce8', border: '1px solid #fde68a', borderRadius: 12, padding: '18px 20px', marginTop: 18, textAlign: 'left' }}>
                                <div style={{ marginBottom: 10 }}>
                                    <div style={{ fontSize: 11, color: '#92400e', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700 }}>Employee ID</div>
                                    <div style={{ fontSize: 16, fontWeight: 700, color: '#111827', fontFamily: 'monospace' }}>{credentials.employeeId}</div>
                                </div>
                                <div style={{ marginBottom: 10 }}>
                                    <div style={{ fontSize: 11, color: '#92400e', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700 }}>Email</div>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{credentials.email}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: 11, color: '#92400e', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700 }}>Temporary Password</div>
                                    <div style={{ fontSize: 16, fontWeight: 700, color: '#111827', fontFamily: 'monospace' }}>{credentials.tempPassword}</div>
                                </div>
                            </div>

                            <div style={{ fontSize: 12, color: '#b45309', marginTop: 10, fontWeight: 600 }}>
                                ⚠ Please save these credentials — you'll need them to log in.
                            </div>

                            <button onClick={copyCredentials} style={{ marginTop: 14, background: credsCopied ? '#dcfce7' : '#fff', color: credsCopied ? '#16a34a' : '#374151', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 18px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                                {credsCopied ? '✓ Copied!' : 'Copy Credentials'}
                            </button>

                            <a href={loginUrl} style={{ display: 'block', marginTop: 14, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 20px', cursor: 'pointer', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
                                Go to Login →
                            </a>
                            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 8, wordBreak: 'break-all' }}>{loginUrl}</div>
                            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 10 }}>
                                You can change this password after logging in.
                            </div>
                        </>
                    ) : (
                        <p style={{ color: '#6b7280', fontSize: 14, marginTop: 8, maxWidth: 380, margin: '8px auto 0' }}>
                            Thank you! HR will review your information and documents, then create your employee account. You'll be contacted with your login credentials shortly.
                        </p>
                    )}
                </div>
            </div>
        );
    }

    const docsDone = DOC_FIELDS.filter(d => d.required && !files[d.key]).length === 0
        && !Object.values(fileSizeErrors).some(Boolean)
        && policyChecks.privacy;

    return (
        <div className="ob-page" style={pageStyle}>
            <style>{RESPONSIVE_CSS}</style>
            <div className="ob-card" style={{ ...cardStyle, maxWidth: 660 }}>

                {/* Header */}
                <div style={{ marginBottom: 20, borderBottom: '1px solid #f3f4f6', paddingBottom: 14 }}>
                    <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>B2B InDemand — Employee Onboarding</div>
                    <h4 style={{ fontWeight: 800, color: '#111827', margin: 0 }}>Complete Your Onboarding</h4>
                    <p style={{ fontSize: 13, color: '#6b7280', margin: '5px 0 0' }}>
                        {offer.designation} · {offer.department} · ₹{Number(offer.salary).toLocaleString('en-IN')}/month
                    </p>
                </div>

                {/* Progress chips */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 20, overflowX: 'auto' }}>
                    {TABS.map((t) => {
                        const Icon = t.icon;
                        const isActive = tab === t.key;
                        const isDone = (() => {
                            if (t.key === 'documents') return docsDone;
                            if (t.key === 'bank') return !!(form.bank_account_name && form.account_number && form.ifsc_code);
                            if (t.key === 'personal') return !!(form.first_name && form.last_name && form.email);
                            return false;
                        })();
                        return (
                            <button
                                key={t.key} type="button" onClick={() => goToTab(t.key)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px',
                                    border: 'none', borderRadius: 20, cursor: 'pointer', fontSize: 12,
                                    fontWeight: isActive ? 700 : 500, whiteSpace: 'nowrap',
                                    background: isActive ? '#6366f1' : isDone ? '#d1fae5' : '#f3f4f6',
                                    color: isActive ? '#fff' : isDone ? '#065f46' : '#6b7280',
                                    transition: 'all 0.15s',
                                }}
                            >
                                {isDone && !isActive ? <CheckCircle size={12} /> : <Icon size={12} />}
                                {t.label}
                            </button>
                        );
                    })}
                </div>

                <Form onSubmit={handleSubmit}>
                    {draftRestored && (
                        <Alert variant="info" style={{ fontSize: 13, marginBottom: 16 }}>
                            Your saved progress was restored. You can continue from where you left off.
                        </Alert>
                    )}
                    {submitErr && (
                        <Alert variant="danger" style={{ fontSize: 13, marginBottom: 16 }} dismissible onClose={() => setSubmitErr('')}>
                            {submitErr}
                        </Alert>
                    )}

                    {/* ── Personal Info ── */}
                    {tab === 'personal' && (
                        <div style={gridStyle}>
                            <FieldGroup label="First Name" required><Form.Control size="sm" value={form.first_name} onChange={e => set('first_name', e.target.value)} required style={inputStyle} /></FieldGroup>
                            <FieldGroup label="Middle Name"><Form.Control size="sm" value={form.middle_name} onChange={e => set('middle_name', e.target.value)} style={inputStyle} /></FieldGroup>
                            <FieldGroup label="Last Name" required><Form.Control size="sm" value={form.last_name} onChange={e => set('last_name', e.target.value)} required style={inputStyle} /></FieldGroup>
                            <FieldGroup label="Email Address" required><Form.Control size="sm" type="email" value={form.email} onChange={e => set('email', e.target.value)} required style={inputStyle} /></FieldGroup>
                            <FieldGroup label="Phone Number" required><Form.Control size="sm" value={form.phone} onChange={e => set('phone', e.target.value)} required style={inputStyle} /></FieldGroup>
                            <FieldGroup label="Date of Birth" required><Form.Control size="sm" type="date" value={form.dob} onChange={e => set('dob', e.target.value)} required style={inputStyle} /></FieldGroup>
                            <FieldGroup label="Gender">
                                <Form.Select size="sm" value={form.gender} onChange={e => set('gender', e.target.value)} style={inputStyle}>
                                    <option value="">Select gender</option>
                                    {GENDERS.map(g => <option key={g}>{g}</option>)}
                                </Form.Select>
                            </FieldGroup>
                            <FieldGroup label="Blood Group" required>
                                <Form.Select size="sm" value={form.blood_group} onChange={e => set('blood_group', e.target.value)} required style={inputStyle}>
                                    <option value="">Select blood group</option>
                                    {BLOOD_GROUPS.map(b => <option key={b}>{b}</option>)}
                                </Form.Select>
                            </FieldGroup>
                            <FieldGroup label="Expected Joining Date" required><Form.Control size="sm" type="date" value={form.joining_date} onChange={e => set('joining_date', e.target.value)} required style={inputStyle} /></FieldGroup>
                            <FieldGroup label="LinkedIn Profile URL"><Form.Control size="sm" type="url" placeholder="https://linkedin.com/in/…" value={form.linkedin_url} onChange={e => set('linkedin_url', e.target.value)} style={inputStyle} /></FieldGroup>
                            <div style={{ gridColumn: '1 / -1' }}>
                                <FieldGroup label="Residential Address" required>
                                    <Form.Control as="textarea" rows={2} size="sm" value={form.address} onChange={e => set('address', e.target.value)} required style={{ ...inputStyle, resize: 'none' }} />
                                </FieldGroup>
                            </div>
                            <FieldGroup label="City"><Form.Control size="sm" value={form.city} onChange={e => set('city', e.target.value)} style={inputStyle} /></FieldGroup>
                            <FieldGroup label="State"><Form.Control size="sm" value={form.state} onChange={e => set('state', e.target.value)} style={inputStyle} /></FieldGroup>
                            <FieldGroup label="Pincode"><Form.Control size="sm" value={form.pincode} onChange={e => set('pincode', e.target.value)} style={inputStyle} /></FieldGroup>
                        </div>
                    )}

                    {/* ── Bank Details ── */}
                    {tab === 'bank' && (
                        <div style={gridStyle}>
                            <div style={{ gridColumn: '1 / -1', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#92400e', marginBottom: 4 }}>
                                Bank details are mandatory for salary disbursement and are kept securely.
                            </div>
                            <FieldGroup label="Account Holder Name" required><Form.Control size="sm" value={form.bank_account_name} onChange={e => set('bank_account_name', e.target.value)} required style={inputStyle} /></FieldGroup>
                            <FieldGroup label="Account Number" required><Form.Control size="sm" value={form.account_number} onChange={e => set('account_number', e.target.value)} required style={inputStyle} /></FieldGroup>
                            <FieldGroup label="IFSC Code" required><Form.Control size="sm" value={form.ifsc_code} onChange={e => set('ifsc_code', e.target.value.toUpperCase())} required maxLength={11} style={inputStyle} /></FieldGroup>
                            <FieldGroup label="Branch Name"><Form.Control size="sm" value={form.branch_name} onChange={e => set('branch_name', e.target.value)} style={inputStyle} /></FieldGroup>
                        </div>
                    )}

                    {/* ── IDs ── */}
                    {tab === 'ids' && (
                        <div style={gridStyle}>
                            <FieldGroup label="PAN Number"><Form.Control size="sm" value={form.pan_number} onChange={e => set('pan_number', e.target.value.toUpperCase())} maxLength={10} style={inputStyle} /></FieldGroup>
                            <FieldGroup label="Aadhar Number"><Form.Control size="sm" value={form.aadhar_number} onChange={e => set('aadhar_number', e.target.value)} maxLength={12} style={inputStyle} /></FieldGroup>
                            <FieldGroup label="UAN (PF Number)"><Form.Control size="sm" value={form.uan} onChange={e => set('uan', e.target.value)} style={inputStyle} /></FieldGroup>
                        </div>
                    )}

                    {/* ── Emergency Contact ── */}
                    {tab === 'emergency' && (
                        <div style={gridStyle}>
                            <FieldGroup label="Contact Person Name"><Form.Control size="sm" value={form.emergency_contact_name} onChange={e => set('emergency_contact_name', e.target.value)} style={inputStyle} /></FieldGroup>
                            <FieldGroup label="Relationship">
                                <Form.Select size="sm" value={form.emergency_contact_relation} onChange={e => set('emergency_contact_relation', e.target.value)} style={inputStyle}>
                                    <option value="">Select relation</option>
                                    {RELATIONS.map(r => <option key={r}>{r}</option>)}
                                </Form.Select>
                            </FieldGroup>
                            <FieldGroup label="Contact Number" required><Form.Control size="sm" value={form.emergency_contact} onChange={e => set('emergency_contact', e.target.value)} required style={inputStyle} /></FieldGroup>
                        </div>
                    )}

                    {/* ── Documents ── */}
                    {tab === 'documents' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>
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
                        </div>
                    )}

                    {/* ── Navigation ── */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28, alignItems: 'center' }}>
                        <button
                            type="button"
                            onClick={() => {
                                const idx = TABS.findIndex(t => t.key === tab);
                                if (idx > 0) goToTab(TABS[idx - 1].key);
                            }}
                            disabled={tab === TABS[0].key}
                            style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontWeight: 600, color: '#374151', opacity: tab === TABS[0].key ? 0.4 : 1 }}
                        >
                            ← Back
                        </button>

                        {tab !== TABS[TABS.length - 1].key ? (
                            <button
                                type="button"
                                onClick={() => {
                                    const idx = TABS.findIndex(t => t.key === tab);
                                    goToTab(TABS[idx + 1].key);
                                }}
                                style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', cursor: 'pointer', fontWeight: 700 }}
                            >
                                Next →
                            </button>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                                {uploadProgress && (
                                    <div style={{ fontSize: 12, color: '#6366f1', display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <Spinner size="sm" animation="border" style={{ width: 14, height: 14 }} />
                                        {uploadProgress}
                                    </div>
                                )}
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 24px', borderRadius: 8, border: 'none', background: submitting ? '#9ca3af' : 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', cursor: submitting ? 'not-allowed' : 'pointer', fontWeight: 700 }}
                                >
                                    {submitting ? <Spinner size="sm" animation="border" /> : <CheckCircle size={16} />}
                                    {submitting ? 'Submitting…' : 'Submit Onboarding Form'}
                                </button>
                            </div>
                        )}
                    </div>
                </Form>
            </div>
        </div>
    );
}

function FieldGroup({ label, required, children }) {
    return (
        <Form.Group>
            <Form.Label style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                {label} {required && <span style={{ color: '#ef4444' }}>*</span>}
            </Form.Label>
            {children}
        </Form.Group>
    );
}

const pageStyle = {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #f0f4ff 0%, #faf5ff 100%)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '32px 16px',
};

// On phones, the page's own gradient background was showing as wasted space around the
// card. Below 480px the card just goes edge-to-edge (no page padding, no rounded corners,
// no shadow) instead of floating in the middle of visible background — same colors, just no
// gutter. Desktop/tablet layout is untouched.
const RESPONSIVE_CSS = `
  @media (max-width: 480px) {
    .ob-page { padding: 0; align-items: stretch; }
    .ob-card { border-radius: 0 !important; box-shadow: none !important; max-width: 100% !important; min-height: 100vh; }
  }
`;

const cardStyle = {
    background: '#fff',
    borderRadius: 20,
    padding: '32px 28px',
    width: '100%',
    maxWidth: 520,
    boxShadow: '0 10px 40px rgba(99,102,241,0.12)',
};

const gridStyle = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '14px',
};

const inputStyle = { borderRadius: 8 };
