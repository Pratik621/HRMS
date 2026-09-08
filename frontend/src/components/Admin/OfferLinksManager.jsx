import React, { useState, useEffect, useCallback } from 'react';
import { Spinner, Alert, Modal, Button } from 'react-bootstrap';
import {
    Copy, RefreshCw, CheckCircle, XCircle, FileText, Trash2, UserPlus,
    Search, Download, ExternalLink, ChevronRight, Clock, User, CreditCard,
    ShieldCheck, Phone, ImageIcon, AlertTriangle, KeyRound, Zap, EyeOff,
    Pencil, Save, X,
} from 'lucide-react';
import API_ENDPOINTS from '../../config/api';

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_CFG = {
    pending:   { label: 'Pending',   bg: '#fef3c7', color: '#92400e', dot: '#f59e0b' },
    accepted:  { label: 'Accepted',  bg: '#d1fae5', color: '#065f46', dot: '#10b981' },
    rejected:  { label: 'Rejected',  bg: '#fee2e2', color: '#991b1b', dot: '#ef4444' },
    submitted: { label: 'Submitted', bg: '#dbeafe', color: '#1e40af', dot: '#3b82f6' },
    approved:  { label: 'Approved',  bg: '#ede9fe', color: '#4c1d95', dot: '#8b5cf6' },
    expired:   { label: 'Expired',   bg: '#f3f4f6', color: '#6b7280', dot: '#9ca3af' },
};

const StatusBadge = ({ status, size = 'sm' }) => {
    const cfg = STATUS_CFG[status] || STATUS_CFG.pending;
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            background: cfg.bg, color: cfg.color, borderRadius: 20,
            padding: size === 'lg' ? '5px 14px' : '3px 10px',
            fontSize: size === 'lg' ? 13 : 12, fontWeight: 600,
        }}>
            <span style={{ width: size === 'lg' ? 8 : 7, height: size === 'lg' ? 8 : 7, borderRadius: '50%', background: cfg.dot, flexShrink: 0 }} />
            {cfg.label}
        </span>
    );
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtDate = (s) => s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtMoney = (n) => n ? `₹${Number(n).toLocaleString('en-IN')}` : '—';

const authFetch = (url, opts = {}) =>
    fetch(url, { ...opts, headers: { Authorization: `Bearer ${localStorage.getItem('token')}`, ...(opts.headers || {}) } });

// ── Avatar ────────────────────────────────────────────────────────────────────
const Avatar = ({ name, size = 42 }) => {
    const colors = ['#6366f1', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899'];
    const initials = (name || '?')[0].toUpperCase();
    const color = colors[(name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length];
    return (
        <div style={{ width: size, height: size, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#fff', fontSize: size * 0.38, flexShrink: 0 }}>
            {initials}
        </div>
    );
};

// ── Document download row ─────────────────────────────────────────────────────
function DocRow({ label, url }) {
    if (!url) return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#f9fafb', borderRadius: 10, border: '1px solid #f3f4f6' }}>
            <span style={{ fontSize: 13, color: '#9ca3af' }}>{label}</span>
            <span style={{ fontSize: 12, color: '#d1d5db', fontStyle: 'italic' }}>Not uploaded</span>
        </div>
    );

    const isImage = /\.(jpe?g|png|webp)(\?|$)/i.test(url);

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#f0fdf4', borderRadius: 10, border: '1px solid #bbf7d0' }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {isImage ? <ImageIcon size={16} color="#16a34a" /> : <FileText size={16} color="#16a34a" />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#14532d' }}>{label}</div>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>{isImage ? 'Image file' : 'Document file'}</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
                <a href={url} target="_blank" rel="noreferrer"
                    style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: '#fff', border: '1px solid #bbf7d0', borderRadius: 7, fontSize: 12, fontWeight: 600, color: '#16a34a', textDecoration: 'none', cursor: 'pointer' }}>
                    <ExternalLink size={12} /> View
                </a>
                <a href={url} download target="_blank" rel="noreferrer"
                    style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: '#16a34a', border: '1px solid #16a34a', borderRadius: 7, fontSize: 12, fontWeight: 600, color: '#fff', textDecoration: 'none', cursor: 'pointer' }}>
                    <Download size={12} /> Download
                </a>
            </div>
        </div>
    );
}

// ── Info row ──────────────────────────────────────────────────────────────────
const InfoRow = ({ label, value }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 13, color: '#111827', fontWeight: 500 }}>{value || '—'}</span>
    </div>
);

// ── Editable field row — InfoRow in view mode, a plain input in edit mode ──────
// `raw` is the unformatted value (bound to the input + saved to the backend);
// `display` is only used to render the view-mode text (e.g. a formatted date).
const FieldRow = ({ label, field, type = 'text', raw, display, editMode, onChange }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>{label}</span>
        {editMode ? (
            <input
                type={type}
                value={raw ?? ''}
                onChange={e => onChange(field, e.target.value)}
                style={{ fontSize: 13, padding: '6px 8px', border: '1px solid #a5b4fc', borderRadius: 6, background: '#fff', color: '#111827' }}
            />
        ) : (
            <span style={{ fontSize: 13, color: '#111827', fontWeight: 500 }}>{(display ?? raw) || '—'}</span>
        )}
    </div>
);

const isoDate = (v) => (v ? String(v).split('T')[0] : '');

// ── Section header ────────────────────────────────────────────────────────────
const Section = ({ icon: Icon, title, children }) => (
    <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: '#e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={14} color="#4338ca" />
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.6 }}>{title}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px', background: '#f8fafc', borderRadius: 10, padding: '14px 16px', border: '1px solid #f1f5f9' }}>
            {children}
        </div>
    </div>
);

// ── Main component ────────────────────────────────────────────────────────────
export default function OfferLinksManager() {
    const [links, setLinks]         = useState([]);
    const [loading, setLoading]     = useState(true);
    const [error, setError]         = useState('');
    const [filter, setFilter]       = useState('all');
    const [search, setSearch]       = useState('');
    const [copied, setCopied]       = useState(null);
    const [actioning, setActioning] = useState(null);
    const [clearingPwd, setClearingPwd] = useState(null);

    // Selected link + its submission
    const [selected, setSelected]       = useState(null);
    const [subData, setSubData]         = useState(null);
    const [subLoading, setSubLoading]   = useState(false);

    // Edit submission (Personal/Bank/ID/Emergency fields)
    const [editMode, setEditMode]       = useState(false);
    const [editForm, setEditForm]       = useState(null);
    const [savingEdit, setSavingEdit]   = useState(false);
    const [editError, setEditError]     = useState('');

    // Approve modal
    const [approveModal, setApproveModal]   = useState(null);
    const [approveResult, setApproveResult] = useState(null);
    const [approving, setApproving]         = useState(false);

    const load = useCallback(async () => {
        setLoading(true); setError('');
        try {
            const res = await authFetch(API_ENDPOINTS.ONBOARDING_LINKS);
            const d = await res.json();
            if (!d.success) throw new Error(d.message);
            setLinks(d.links || []);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const selectLink = async (link) => {
        // Toggle off if clicking same card
        if (selected?.id === link.id) { setSelected(null); setSubData(null); return; }
        setSelected(link);
        setSubData(null);
        setEditMode(false); setEditForm(null); setEditError('');
        const st = link.effective_status || link.status;
        if (['submitted', 'approved'].includes(st)) {
            setSubLoading(true);
            try {
                const res = await authFetch(API_ENDPOINTS.ONBOARDING_LINK_SUBMISSION(link.id));
                const d = await res.json();
                if (!d.success) throw new Error(d.message);
                setSubData(d.submission);
            } catch (err) {
                setSubData({ _error: err.message });
            } finally {
                setSubLoading(false);
            }
        }
    };

    const getBaseUrl = () => {
        try {
            const url = new URL(API_ENDPOINTS.ONBOARDING_BY_TOKEN('__T__'));
            return `${url.protocol}//${url.host}`;
        } catch { return window.location.origin; }
    };

    const copyLink = (e, token) => {
        e.stopPropagation();
        navigator.clipboard.writeText(`${getBaseUrl()}/onboarding/${token}`).then(() => {
            setCopied(token);
            setTimeout(() => setCopied(null), 2000);
        });
    };

    const copyValue = (e, key, value) => {
        e.stopPropagation();
        if (!value) return;
        navigator.clipboard.writeText(value).then(() => {
            setCopied(key);
            setTimeout(() => setCopied(null), 2000);
        });
    };

    const doClearTempPassword = async (link) => {
        if (!window.confirm('Hide the temporary password for this employee? Only do this after you\'ve relayed it to them.')) return;
        setClearingPwd(link.id);
        try {
            const res = await authFetch(API_ENDPOINTS.ONBOARDING_LINK_CLEAR_TEMP_PASSWORD(link.id), { method: 'PATCH' });
            const d = await res.json();
            if (!d.success) throw new Error(d.message);
            setSelected(prev => prev && prev.id === link.id ? { ...prev, temp_password: null } : prev);
            await load();
        } catch (err) { alert(err.message); }
        finally { setClearingPwd(null); }
    };

    const doExpire = async (e, link) => {
        e.stopPropagation();
        if (!window.confirm(`Expire link for "${link.employee_name}"?`)) return;
        setActioning(link.id);
        try {
            const res = await authFetch(API_ENDPOINTS.ONBOARDING_LINK_EXPIRE(link.id), { method: 'PATCH' });
            const d = await res.json();
            if (!d.success) throw new Error(d.message);
            if (selected?.id === link.id) setSelected(null);
            await load();
        } catch (err) { alert(err.message); }
        finally { setActioning(null); }
    };

    const doDelete = async (e, link) => {
        e.stopPropagation();
        if (!window.confirm(`Permanently delete offer link for "${link.employee_name}"?`)) return;
        setActioning(link.id);
        try {
            const res = await authFetch(API_ENDPOINTS.ONBOARDING_LINK_DELETE(link.id), { method: 'DELETE' });
            const d = await res.json();
            if (!d.success) throw new Error(d.message);
            if (selected?.id === link.id) { setSelected(null); setSubData(null); }
            await load();
        } catch (err) { alert(err.message); }
        finally { setActioning(null); }
    };

    const doApprove = async () => {
        if (!approveModal) return;
        setApproving(true);
        try {
            const res = await authFetch(API_ENDPOINTS.ONBOARDING_LINK_APPROVE(approveModal.id), { method: 'PATCH' });
            const d = await res.json();
            if (!d.success) throw new Error(d.message);
            setApproveResult(d);
            await load();
        } catch (err) {
            setApproveResult({ success: false, message: err.message });
            // Even on failure a ticket may have been raised and a note added to this
            // offer (see raiseTicketDespiteAccountFailure on the backend) — refresh so
            // that's reflected next time this offer is reopened.
            await load();
        } finally { setApproving(false); }
    };

    const startEdit = () => { setEditForm({ ...subData }); setEditMode(true); setEditError(''); };
    const cancelEdit = () => { setEditMode(false); setEditForm(null); setEditError(''); };
    const handleFieldChange = (field, value) => setEditForm(prev => ({ ...prev, [field]: value }));

    const saveEdit = async () => {
        setSavingEdit(true); setEditError('');
        try {
            const res = await authFetch(API_ENDPOINTS.ONBOARDING_LINK_SUBMISSION(selected.id), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editForm),
            });
            const d = await res.json();
            if (!d.success) throw new Error(d.message);
            setSubData(d.submission);
            setEditMode(false);
            setEditForm(null);
            if (d.warning) setEditError(d.warning);
        } catch (err) {
            setEditError(err.message);
        } finally {
            setSavingEdit(false);
        }
    };

    // Filter logic
    const filtered = links.filter(l => {
        const st = l.effective_status || l.status;
        const matchStatus = filter === 'all' || st === filter;
        const q = search.trim().toLowerCase();
        const matchSearch = !q || `${l.employee_name} ${l.designation} ${l.department}`.toLowerCase().includes(q);
        return matchStatus && matchSearch;
    });

    const counts = {};
    links.forEach(l => { const s = l.effective_status || l.status; counts[s] = (counts[s] || 0) + 1; });

    const tabs = [
        { key: 'all',       label: 'All',       count: links.length },
        { key: 'pending',   label: 'Pending',   count: counts.pending   || 0 },
        { key: 'submitted', label: 'Submitted', count: counts.submitted || 0 },
        { key: 'accepted',  label: 'Accepted',  count: counts.accepted  || 0 },
        { key: 'approved',  label: 'Approved',  count: counts.approved  || 0 },
        { key: 'rejected',  label: 'Rejected',  count: counts.rejected  || 0 },
        { key: 'expired',   label: 'Expired',   count: counts.expired   || 0 },
    ];

    const selSt = selected ? (selected.effective_status || selected.status) : null;

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

            {/* ── LEFT PANEL ── */}
            <div style={{ width: 360, flexShrink: 0, borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fafafa' }}>

                {/* Search */}
                <div style={{ padding: '12px', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
                    <div style={{ position: 'relative' }}>
                        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                        <input value={search} onChange={e => setSearch(e.target.value)}
                            placeholder="Search name, role, dept…"
                            style={{ width: '100%', paddingLeft: 32, paddingRight: 10, height: 36, border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, outline: 'none', background: '#fff' }} />
                    </div>
                </div>

                {/* Status tabs */}
                <div style={{ padding: '0 8px', borderBottom: '1px solid #e5e7eb', display: 'flex', gap: 2, overflowX: 'auto', flexShrink: 0, background: '#fff' }}>
                    {tabs.map(t => (
                        <button key={t.key} onClick={() => setFilter(t.key)}
                            style={{ padding: '8px 10px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, fontWeight: filter === t.key ? 700 : 500, color: filter === t.key ? '#6366f1' : '#6b7280', borderBottom: filter === t.key ? '2px solid #6366f1' : '2px solid transparent', whiteSpace: 'nowrap' }}>
                            {t.label}
                            {t.count > 0 && <span style={{ background: filter === t.key ? '#e0e7ff' : '#f3f4f6', color: filter === t.key ? '#4338ca' : '#6b7280', borderRadius: 10, padding: '1px 5px', fontSize: 10, marginLeft: 4 }}>{t.count}</span>}
                        </button>
                    ))}
                </div>

                {/* Refresh row */}
                <div style={{ padding: '8px 12px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, background: '#fff' }}>
                    <span style={{ fontSize: 12, color: '#9ca3af' }}>{filtered.length} offer{filtered.length !== 1 ? 's' : ''}</span>
                    <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid #e5e7eb', borderRadius: 7, background: '#f9fafb', cursor: 'pointer', fontSize: 12, color: '#374151' }}>
                        <RefreshCw size={12} /> Refresh
                    </button>
                </div>

                {/* List */}
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {loading ? (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner animation="border" variant="primary" /></div>
                    ) : error ? (
                        <Alert variant="danger" style={{ margin: 12, fontSize: 13 }}>{error}</Alert>
                    ) : filtered.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9ca3af' }}>
                            <FileText size={32} strokeWidth={1} style={{ marginBottom: 10 }} />
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#6b7280' }}>No offers found</div>
                        </div>
                    ) : filtered.map(l => {
                        const st = l.effective_status || l.status;
                        const isSelected = selected?.id === l.id;
                        const busy = actioning === l.id;
                        return (
                            <div key={l.id} onClick={() => selectLink(l)}
                                style={{ padding: '12px 14px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer', background: isSelected ? '#eef2ff' : '#fff', borderLeft: isSelected ? '3px solid #6366f1' : '3px solid transparent', transition: 'background 0.1s' }}>

                                {/* Row 1 */}
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                                    <Avatar name={l.employee_name} size={38} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 700, color: isSelected ? '#3730a3' : '#111827', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.employee_name}</span>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                                                {st === 'approved' && l.temp_password && (
                                                    <span title="Temp password not yet relayed" style={{ display: 'inline-flex', alignItems: 'center', background: '#fef3c7', color: '#92400e', borderRadius: 20, padding: '2px 7px' }}>
                                                        <KeyRound size={10} />
                                                    </span>
                                                )}
                                                <StatusBadge status={st} />
                                            </div>
                                        </div>
                                        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {l.designation} · {l.department} · {l.employment_type}
                                        </div>
                                    </div>
                                </div>

                                {/* Row 2 */}
                                <div style={{ marginTop: 8, marginLeft: 48, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <span style={{ fontWeight: 700, fontSize: 13, color: '#111827' }}>{fmtMoney(l.salary)}</span>
                                        <span style={{ fontSize: 11, color: '#9ca3af' }}>/mo</span>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: 11, color: '#9ca3af' }}>Expiry</div>
                                        <div style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{fmtDate(l.expiry_date)}</div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: 11, color: '#9ca3af' }}>by {l.generated_by_name || l.generated_by}</div>
                                        <div style={{ fontSize: 11, color: '#9ca3af' }}>{fmtDate(l.created_at)}</div>
                                    </div>
                                </div>

                                {/* Quick actions */}
                                <div style={{ marginTop: 8, marginLeft: 48, display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                                    {['pending', 'accepted'].includes(st) && (
                                        <button onClick={e => copyLink(e, l.token)}
                                            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 9px', border: '1px solid #e5e7eb', borderRadius: 6, background: copied === l.token ? '#d1fae5' : '#f9fafb', cursor: 'pointer', fontSize: 11, color: copied === l.token ? '#065f46' : '#6b7280' }}>
                                            {copied === l.token ? <CheckCircle size={11} /> : <Copy size={11} />}
                                            {copied === l.token ? 'Copied!' : 'Copy Link'}
                                        </button>
                                    )}
                                    {['pending', 'accepted'].includes(st) && (
                                        <button onClick={e => doExpire(e, l)} disabled={busy}
                                            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 9px', border: '1px solid #fee2e2', borderRadius: 6, background: '#fef2f2', cursor: 'pointer', fontSize: 11, color: '#ef4444' }}>
                                            {busy ? <Spinner size="sm" animation="border" style={{ width: 10, height: 10 }} /> : <XCircle size={11} />} Expire
                                        </button>
                                    )}
                                    <button onClick={e => doDelete(e, l)} disabled={busy}
                                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 9px', border: '1px solid #fee2e2', borderRadius: 6, background: '#fef2f2', cursor: 'pointer', fontSize: 11, color: '#ef4444' }}>
                                        {busy ? <Spinner size="sm" animation="border" style={{ width: 10, height: 10 }} /> : <Trash2 size={11} />} Delete
                                    </button>
                                    {st === 'submitted' && (
                                        <button onClick={e => { e.stopPropagation(); setApproveModal(l); setApproveResult(null); }}
                                            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 9px', border: '1px solid #bbf7d0', borderRadius: 6, background: '#d1fae5', cursor: 'pointer', fontSize: 11, color: '#065f46', fontWeight: 600 }}>
                                            <UserPlus size={11} /> Approve
                                        </button>
                                    )}
                                    {isSelected && <ChevronRight size={14} color="#6366f1" style={{ marginLeft: 'auto' }} />}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ── RIGHT PANEL ── */}
            <div style={{ flex: 1, overflowY: 'auto', background: '#f8fafc' }}>
                {!selected ? (
                    /* Empty state */
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af', padding: 40 }}>
                        <FileText size={52} strokeWidth={1} style={{ marginBottom: 16, color: '#d1d5db' }} />
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#374151' }}>Select an offer</div>
                        <div style={{ fontSize: 13, marginTop: 6, textAlign: 'center', maxWidth: 280 }}>Click any offer link on the left to view full details and submitted documents</div>
                    </div>
                ) : (
                    <div style={{ padding: '24px 28px', maxWidth: 760 }}>

                        {/* ── Detail header ── */}
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 24, padding: '20px 24px', background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                            <Avatar name={selected.employee_name} size={56} />
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 20, fontWeight: 800, color: '#111827' }}>{selected.employee_name}</div>
                                <div style={{ fontSize: 13, color: '#6b7280', marginTop: 3 }}>
                                    {selected.designation} · {selected.department} · {selected.employment_type}
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12, alignItems: 'center' }}>
                                    <StatusBadge status={selSt} size="lg" />
                                    {selSt === 'approved' && selected.auto_approved && (
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#ecfeff', color: '#0e7490', borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: 600 }}>
                                            <Zap size={12} /> Auto-Approved
                                        </span>
                                    )}
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <span style={{ fontSize: 11, color: '#9ca3af' }}>Salary</span>
                                        <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>{fmtMoney(selected.salary)}<span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 400 }}>/month</span></span>
                                    </div>
                                    {(selected.pf_amount != null || selected.professional_tax_amount != null) && (
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <span style={{ fontSize: 11, color: '#9ca3af' }}>PF / PT</span>
                                            <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>
                                                {fmtMoney(selected.pf_amount || 0)} / {fmtMoney(selected.professional_tax_amount || 0)}
                                            </span>
                                        </div>
                                    )}
                                    {(selected.pf_amount != null || selected.professional_tax_amount != null) && (
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <span style={{ fontSize: 11, color: '#9ca3af' }}>In-Hand</span>
                                            <span style={{ fontSize: 15, fontWeight: 700, color: '#16a34a' }}>
                                                {fmtMoney(Math.max(0, Number(selected.salary) - (Number(selected.pf_amount) || 0) - (Number(selected.professional_tax_amount) || 0)))}
                                                <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 400 }}>/month</span>
                                            </span>
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <span style={{ fontSize: 11, color: '#9ca3af' }}>Expiry</span>
                                        <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{fmtDate(selected.expiry_date)}</span>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <span style={{ fontSize: 11, color: '#9ca3af' }}>Generated by</span>
                                        <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{selected.generated_by_name || selected.generated_by}</span>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <span style={{ fontSize: 11, color: '#9ca3af' }}>Created</span>
                                        <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{fmtDate(selected.created_at)}</span>
                                    </div>
                                </div>
                            </div>
                            {/* Right-panel action buttons */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
                                {['pending', 'accepted'].includes(selSt) && (
                                    <button onClick={e => copyLink(e, selected.token)}
                                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', border: '1px solid #e5e7eb', borderRadius: 8, background: copied === selected.token ? '#d1fae5' : '#f9fafb', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: copied === selected.token ? '#065f46' : '#374151' }}>
                                        {copied === selected.token ? <CheckCircle size={14} /> : <Copy size={14} />}
                                        {copied === selected.token ? 'Copied!' : 'Copy Link'}
                                    </button>
                                )}
                                {selSt === 'submitted' && (
                                    <button onClick={() => { setApproveModal(selected); setApproveResult(null); }}
                                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', border: 'none', borderRadius: 8, background: '#10b981', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#fff' }}>
                                        <UserPlus size={14} /> Approve & Create Account
                                    </button>
                                )}
                                <button onClick={e => doDelete(e, selected)} disabled={actioning === selected.id}
                                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', border: '1px solid #fee2e2', borderRadius: 8, background: '#fef2f2', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#ef4444' }}>
                                    {actioning === selected.id ? <Spinner size="sm" animation="border" style={{ width: 13, height: 13 }} /> : <Trash2 size={14} />} Delete
                                </button>
                            </div>
                        </div>

                        {/* ── Credentials (account was created — auto-approved on submit, or legacy manual approval) ── */}
                        {selSt === 'approved' && selected.created_employee_id && (
                            <div style={{ marginBottom: 20, padding: '18px 20px', background: '#fff', borderRadius: 14, border: '1px solid #bbf7d0' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                                    <div style={{ width: 28, height: 28, borderRadius: 7, background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <KeyRound size={14} color="#16a34a" />
                                    </div>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: '#14532d', textTransform: 'uppercase', letterSpacing: 0.6 }}>Employee Account Created</span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                                    <div>
                                        <span style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, display: 'block', marginBottom: 3 }}>Employee ID</span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <span style={{ fontSize: 14, fontWeight: 700, color: '#111827', fontFamily: 'monospace' }}>{selected.created_employee_id}</span>
                                            <button onClick={e => copyValue(e, `empid-${selected.id}`, selected.created_employee_id)} title="Copy" style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied === `empid-${selected.id}` ? '#16a34a' : '#9ca3af', padding: 2 }}>
                                                {copied === `empid-${selected.id}` ? <CheckCircle size={13} /> : <Copy size={13} />}
                                            </button>
                                        </div>
                                    </div>
                                    <div>
                                        <span style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, display: 'block', marginBottom: 3 }}>Login Email</span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{subData?.email || '—'}</span>
                                            {subData?.email && (
                                                <button onClick={e => copyValue(e, `email-${selected.id}`, subData.email)} title="Copy" style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied === `email-${selected.id}` ? '#16a34a' : '#9ca3af', padding: 2 }}>
                                                    {copied === `email-${selected.id}` ? <CheckCircle size={13} /> : <Copy size={13} />}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <div>
                                        <span style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, display: 'block', marginBottom: 3 }}>Temporary Password</span>
                                        {selected.temp_password ? (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <span style={{ fontSize: 14, fontWeight: 700, color: '#92400e', fontFamily: 'monospace' }}>{selected.temp_password}</span>
                                                <button onClick={e => copyValue(e, `pwd-${selected.id}`, selected.temp_password)} title="Copy" style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied === `pwd-${selected.id}` ? '#16a34a' : '#9ca3af', padding: 2 }}>
                                                    {copied === `pwd-${selected.id}` ? <CheckCircle size={13} /> : <Copy size={13} />}
                                                </button>
                                                <button onClick={() => doClearTempPassword(selected)} disabled={clearingPwd === selected.id} title="Hide password (after it's been relayed)" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 2 }}>
                                                    {clearingPwd === selected.id ? <Spinner size="sm" animation="border" style={{ width: 12, height: 12 }} /> : <EyeOff size={13} />}
                                                </button>
                                            </div>
                                        ) : (
                                            <span style={{ fontSize: 13, color: '#9ca3af', fontStyle: 'italic' }}>Already changed / hidden</span>
                                        )}
                                    </div>
                                </div>
                                {selected.temp_password && (
                                    <div style={{ fontSize: 11, color: '#92400e', marginTop: 12, background: '#fef3c7', borderRadius: 8, padding: '6px 10px' }}>
                                        Share this securely with the employee. It's cleared automatically once they change their password.
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── Notes ── */}
                        {selected.notes && (
                            <div style={{ marginBottom: 20, padding: '12px 16px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, fontSize: 13, color: '#92400e' }}>
                                <strong>Notes:</strong> {selected.notes}
                            </div>
                        )}

                        {/* ── Submission data ── */}
                        {['submitted', 'approved'].includes(selSt) && (
                            subLoading ? (
                                <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner animation="border" variant="primary" /></div>
                            ) : subData?._error ? (
                                <Alert variant="danger" style={{ fontSize: 13 }}>{subData._error}</Alert>
                            ) : subData ? (
                                <>
                                    {/* Edit toolbar */}
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 12 }}>
                                        {editMode ? (
                                            <>
                                                <button onClick={cancelEdit} disabled={savingEdit}
                                                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#f9fafb', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#374151' }}>
                                                    <X size={14} /> Cancel
                                                </button>
                                                <button onClick={saveEdit} disabled={savingEdit}
                                                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', border: 'none', borderRadius: 8, background: '#10b981', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#fff' }}>
                                                    {savingEdit ? <Spinner size="sm" animation="border" style={{ width: 13, height: 13 }} /> : <Save size={14} />}
                                                    Save
                                                </button>
                                            </>
                                        ) : (
                                            <button onClick={startEdit}
                                                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', border: '1px solid #c7d2fe', borderRadius: 8, background: '#eef2ff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#4338ca' }}>
                                                <Pencil size={13} /> Edit
                                            </button>
                                        )}
                                    </div>
                                    {editError && <Alert variant="danger" style={{ fontSize: 13 }} dismissible onClose={() => setEditError('')}>{editError}</Alert>}
                                    {selSt === 'approved' && selected.created_employee_id && editMode && (
                                        <div style={{ fontSize: 12, color: '#92400e', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '6px 10px', marginBottom: 12 }}>
                                            This employee's account already exists — saving will also update their live employee record.
                                        </div>
                                    )}

                                    {/* Personal */}
                                    <Section icon={User} title="Personal Information">
                                        <FieldRow label="First Name" field="first_name" editMode={editMode} onChange={handleFieldChange}
                                            raw={editMode ? editForm?.first_name : subData.first_name} />
                                        <FieldRow label="Middle Name" field="middle_name" editMode={editMode} onChange={handleFieldChange}
                                            raw={editMode ? editForm?.middle_name : subData.middle_name} />
                                        <FieldRow label="Last Name" field="last_name" editMode={editMode} onChange={handleFieldChange}
                                            raw={editMode ? editForm?.last_name : subData.last_name} />
                                        <FieldRow label="Email" field="email" type="email" editMode={editMode} onChange={handleFieldChange}
                                            raw={editMode ? editForm?.email : subData.email} />
                                        <FieldRow label="Phone" field="phone" editMode={editMode} onChange={handleFieldChange}
                                            raw={editMode ? editForm?.phone : subData.phone} />
                                        <FieldRow label="Date of Birth" field="dob" type="date" editMode={editMode} onChange={handleFieldChange}
                                            raw={editMode ? isoDate(editForm?.dob) : isoDate(subData.dob)} display={fmtDate(subData.dob)} />
                                        <FieldRow label="Gender" field="gender" editMode={editMode} onChange={handleFieldChange}
                                            raw={editMode ? editForm?.gender : subData.gender} />
                                        <FieldRow label="Blood Group" field="blood_group" editMode={editMode} onChange={handleFieldChange}
                                            raw={editMode ? editForm?.blood_group : subData.blood_group} />
                                        <FieldRow label="Joining Date" field="joining_date" type="date" editMode={editMode} onChange={handleFieldChange}
                                            raw={editMode ? isoDate(editForm?.joining_date) : isoDate(subData.joining_date)} display={fmtDate(subData.joining_date)} />
                                        {editMode ? (
                                            <FieldRow label="LinkedIn Profile" field="linkedin_url" editMode={editMode} onChange={handleFieldChange}
                                                raw={editForm?.linkedin_url} />
                                        ) : (
                                            <div>
                                                <span style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, display: 'block' }}>LinkedIn Profile</span>
                                                {subData.linkedin_url ? (
                                                    <a href={subData.linkedin_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: '#2563eb', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                        <ExternalLink size={13} /> View Profile
                                                    </a>
                                                ) : (
                                                    <span style={{ fontSize: 13, color: '#111827', fontWeight: 500 }}>—</span>
                                                )}
                                            </div>
                                        )}
                                        <FieldRow label="Address" field="address" editMode={editMode} onChange={handleFieldChange}
                                            raw={editMode ? editForm?.address : subData.address} />
                                        <FieldRow label="City" field="city" editMode={editMode} onChange={handleFieldChange}
                                            raw={editMode ? editForm?.city : subData.city} />
                                        <FieldRow label="State" field="state" editMode={editMode} onChange={handleFieldChange}
                                            raw={editMode ? editForm?.state : subData.state} />
                                        <FieldRow label="Pincode" field="pincode" editMode={editMode} onChange={handleFieldChange}
                                            raw={editMode ? editForm?.pincode : subData.pincode} />
                                    </Section>

                                    {/* Bank */}
                                    <Section icon={CreditCard} title="Bank Details">
                                        <FieldRow label="Account Holder" field="bank_account_name" editMode={editMode} onChange={handleFieldChange}
                                            raw={editMode ? editForm?.bank_account_name : subData.bank_account_name} />
                                        <FieldRow label="Account Number" field="account_number" editMode={editMode} onChange={handleFieldChange}
                                            raw={editMode ? editForm?.account_number : subData.account_number} />
                                        <FieldRow label="IFSC Code" field="ifsc_code" editMode={editMode} onChange={handleFieldChange}
                                            raw={editMode ? editForm?.ifsc_code : subData.ifsc_code} />
                                        <FieldRow label="Branch Name" field="branch_name" editMode={editMode} onChange={handleFieldChange}
                                            raw={editMode ? editForm?.branch_name : subData.branch_name} />
                                    </Section>

                                    {/* IDs */}
                                    <Section icon={ShieldCheck} title="ID Numbers">
                                        <FieldRow label="PAN Number" field="pan_number" editMode={editMode} onChange={handleFieldChange}
                                            raw={editMode ? editForm?.pan_number : subData.pan_number} />
                                        <FieldRow label="Aadhar Number" field="aadhar_number" editMode={editMode} onChange={handleFieldChange}
                                            raw={editMode ? editForm?.aadhar_number : subData.aadhar_number} />
                                        <FieldRow label="UAN (PF)" field="uan" editMode={editMode} onChange={handleFieldChange}
                                            raw={editMode ? editForm?.uan : subData.uan} />
                                    </Section>

                                    {/* Emergency */}
                                    <Section icon={Phone} title="Emergency Contact">
                                        <FieldRow label="Contact Name" field="emergency_contact_name" editMode={editMode} onChange={handleFieldChange}
                                            raw={editMode ? editForm?.emergency_contact_name : subData.emergency_contact_name} />
                                        <FieldRow label="Phone Number" field="emergency_contact" editMode={editMode} onChange={handleFieldChange}
                                            raw={editMode ? editForm?.emergency_contact : subData.emergency_contact} />
                                        <FieldRow label="Relationship" field="emergency_contact_relation" editMode={editMode} onChange={handleFieldChange}
                                            raw={editMode ? editForm?.emergency_contact_relation : subData.emergency_contact_relation} />
                                    </Section>

                                    {/* Documents */}
                                    <div style={{ marginBottom: 20 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                            <div style={{ width: 28, height: 28, borderRadius: 7, background: '#e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <FileText size={14} color="#4338ca" />
                                            </div>
                                            <span style={{ fontSize: 13, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.6 }}>Documents</span>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                            <DocRow label="Passport Size Photo"           url={subData.passport_photo} />
                                            <DocRow label="Aadhar Card"                   url={subData.aadhar_card_doc} />
                                            <DocRow label="PAN Card"                      url={subData.pan_card_doc} />
                                            <DocRow label="Offer / Experience Letter"     url={subData.offer_letter_doc} />
                                        </div>
                                    </div>
                                </>
                            ) : null
                        )}

                        {/* Pending/Accepted — no form submitted yet */}
                        {['pending', 'accepted'].includes(selSt) && (
                            <div style={{ padding: '32px 24px', background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', textAlign: 'center', color: '#9ca3af' }}>
                                <Clock size={36} strokeWidth={1} style={{ marginBottom: 12, color: '#d1d5db' }} />
                                <div style={{ fontWeight: 600, color: '#6b7280', fontSize: 14 }}>Waiting for employee to fill the form</div>
                                <div style={{ fontSize: 12, marginTop: 6 }}>The employee has not submitted their onboarding form yet.</div>
                            </div>
                        )}

                        {/* Rejected */}
                        {selSt === 'rejected' && (
                            <div style={{ padding: '32px 24px', background: '#fff5f5', borderRadius: 14, border: '1px solid #fecaca', textAlign: 'center' }}>
                                <XCircle size={36} strokeWidth={1} style={{ marginBottom: 12, color: '#f87171' }} />
                                <div style={{ fontWeight: 600, color: '#991b1b', fontSize: 14 }}>Offer was rejected by the candidate</div>
                                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6 }}>Rejected on {fmtDate(selected.rejected_at)}</div>
                            </div>
                        )}

                        {/* Expired */}
                        {selSt === 'expired' && (
                            <div style={{ padding: '32px 24px', background: '#f9fafb', borderRadius: 14, border: '1px solid #e5e7eb', textAlign: 'center' }}>
                                <AlertTriangle size={36} strokeWidth={1} style={{ marginBottom: 12, color: '#9ca3af' }} />
                                <div style={{ fontWeight: 600, color: '#6b7280', fontSize: 14 }}>This offer link has expired</div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── Approve Modal ── */}
            <Modal show={!!approveModal} onHide={() => { setApproveModal(null); setApproveResult(null); }} centered>
                <Modal.Header closeButton style={{ background: '#f0fdf4', borderColor: '#bbf7d0' }}>
                    <Modal.Title style={{ fontSize: 16, fontWeight: 700, color: '#14532d' }}>
                        <UserPlus size={18} style={{ marginRight: 8 }} />
                        Approve &amp; Create Account
                    </Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    {approveResult ? (
                        approveResult.success ? (
                            <div style={{ textAlign: 'center', padding: '12px 0' }}>
                                <CheckCircle size={44} color="#10b981" style={{ marginBottom: 12 }} />
                                <h6 style={{ fontWeight: 700, color: '#065f46' }}>Account Created!</h6>
                                <p style={{ fontSize: 13, color: '#374151' }}>
                                    Employee ID: <strong>{approveResult.employee_id}</strong>
                                </p>
                                <div style={{ background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: 8, padding: 12, fontSize: 13, textAlign: 'left' }}>
                                    <strong>Temporary Password:</strong>
                                    <div style={{ fontFamily: 'monospace', fontSize: 15, marginTop: 4, color: '#92400e' }}>{approveResult.temp_password}</div>
                                    <div style={{ fontSize: 11, color: '#92400e', marginTop: 6 }}>Share this securely. The employee can change it after first login.</div>
                                </div>
                                {approveResult.warning && (
                                    <div style={{ marginTop: 12, background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 8, padding: 12, fontSize: 12, textAlign: 'left', color: '#9a3412' }}>
                                        <strong>Note:</strong> {approveResult.warning} — the account, offer letter, and onboarding tickets were still created. Fix it via the Edit option on this offer.
                                    </div>
                                )}
                            </div>
                        ) : (
                            <Alert variant="danger">{approveResult.message}</Alert>
                        )
                    ) : (
                        <>
                            <p style={{ fontSize: 14, color: '#374151' }}>
                                This will create an employee account for <strong>{approveModal?.employee_name}</strong> using their submitted information.
                            </p>
                            <ul style={{ fontSize: 13, color: '#6b7280', paddingLeft: 20 }}>
                                <li>A unique Employee ID will be generated automatically</li>
                                <li>A temporary password will be created — share it securely</li>
                                <li>The employee can change their password after first sign-in</li>
                            </ul>
                        </>
                    )}
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => { setApproveModal(null); setApproveResult(null); }}>
                        {approveResult?.success ? 'Close' : 'Cancel'}
                    </Button>
                    {!approveResult && (
                        <Button onClick={doApprove} disabled={approving} style={{ background: '#10b981', border: 'none', fontWeight: 600 }}>
                            {approving ? <><Spinner size="sm" animation="border" className="me-2" />Creating…</> : 'Approve & Create Account'}
                        </Button>
                    )}
                </Modal.Footer>
            </Modal>
        </div>
    );
}
