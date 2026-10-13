import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Modal, Spinner, Offcanvas } from 'react-bootstrap';
import { useParams } from 'react-router-dom';
import {
  FaPlus, FaSearch, FaFileAlt, FaClock, FaHourglassHalf, FaSyncAlt, FaCheckCircle,
  FaCalendarAlt, FaEllipsisV, FaCopy, FaCheck, FaChevronLeft, FaChevronRight, FaTicketAlt, FaLock,
  FaComment, FaExchangeAlt, FaLockOpen, FaTimes, FaExclamationTriangle, FaPaperPlane,
  FaBuilding, FaEnvelope, FaUser, FaUserCheck, FaLink,
} from 'react-icons/fa';
import { useAuth } from '../../context/AuthContext';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';
import { getTicketAge } from '../../utils/ticketAge';
import './TicketList.css';

// ─── Page design tokens ───────────────────────────────────────────────────────
const TK = {
  primary: '#1f4e79', primaryLight: '#eef4fb',
  success: '#168a70', successLight: '#f8fafc',
  warning: '#8a702c', warningLight: '#f8fafc',
  purple:  '#64748b', purpleLight:  '#f8fafc',
  danger:  '#c53030', dangerLight:  '#FEF2F2',
  blue:    '#52718c', blueLight:    '#f8fafc',
  textDark: '#172033', textMuted: '#64748b', border: '#e5eaf0',
};

// ─── Constants ────────────────────────────────────────────────────────────────

const DEPARTMENTS = ['HR', 'IT', 'Marketing'];

const ISSUE_TYPES = {
  IT: [
    'Internet / Network Issue',
    'System / PC Not Working',
    'Hardware Issue (Mouse, Keyboard, Monitor, Headset)',
    'Software / Application Error',
    'Email & Account Access Problem',
    'Printer / Scanner Issue',
    'New Employee – Assign System Access',
    'Other',
  ],
  HR: [
    'Leave Related Query',
    'Salary / Payroll Issue',
    'Document Request (Offer Letter, Experience Letter, etc.)',
    'Policy Clarification',
    'Attendance Correction',
    'Onboarding / Offboarding',
    'Other',
  ],
  Marketing: [
    'New Employee – Issue ID Card',
    'ID Card Request',
    'Marketing Material Request',
    'Event / Campaign Support',
    'Other',
  ],
};

const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

const STATUS_META = {
  open:             { label: 'Open',             color: '#475569', bg: '#f1f5f9' },
  in_progress:      { label: 'In Progress',      color: '#475569', bg: '#f1f5f9' },
  resolved_pending: { label: 'Pending Confirm',  color: '#475569', bg: '#f1f5f9' },
  closed:           { label: 'Closed',           color: '#475569', bg: '#f1f5f9' },
  reopened:         { label: 'Reopened',         color: '#475569', bg: '#f1f5f9' },
};

const PRIORITY_META = {
  low:    { color: '#168a70', label: 'Low' },
  medium: { color: '#8a702c', label: 'Medium' },
  high:   { color: '#c53030', label: 'High' },
  urgent: { color: '#475569', label: 'Urgent' },
};

const DEPT_META = {
  HR: { color: '#52718c', icon: '👥' },
  IT: { color: '#52718c', icon: '💻' },
  Marketing: { color: '#8a702c', icon: '📢' },
};

const ROLES_SEE_ALL = ['admin', 'sub_admin', 'hr'];
const ROLES_CAN_RESOLVE = ['admin', 'sub_admin', 'manager', 'hr'];

const fmtDate = iso => {
  if (!iso) return '--';
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
};

const parseEmployeeDetails = (description) => {
  if (!description) return null;

  const detailMap = {};
  description.split(/\r?\n/).forEach(line => {
    const match = line.match(/^([A-Za-z ./'()/-]+):\s*(.+)$/);
    if (match) {
      const label = match[1].trim();
      const value = match[2].trim();
      if (label && value) detailMap[label] = value;
    }
  });

  const employeeNumber = detailMap['Employee Number'];
  if (!employeeNumber && Object.keys(detailMap).length === 0) return null;

  return {
    employeeName: detailMap['Employee Name'] || '',
    employeeNumber,
    joiningDate: detailMap['Date of Joining'] || '',
    dob: detailMap['Date of Birth'] || '',
    designation: detailMap['Designation'] || '',
    bloodGroup: detailMap['Blood Group'] || '',
    reportingManager: detailMap['Reporting Manager'] || '',
    contactNumber: detailMap['Contact Number'] || '',
    emergencyContact: detailMap['Emergency Contact Number'] || '',
    address: detailMap['Employee Address'] || '',
  };
};

const getEmployeePhotoUrl = (employee) => (
  employee?.profile_image || employee?.passport_photo || employee?.photo_url || employee?.profilePhoto || null
);

// ─── StatusBadge ─────────────────────────────────────────────────────────────

const StatusBadge = ({ status }) => {
  const m = STATUS_META[status] || { label: status, color: '#64748b', bg: '#f3f4f6' };
  return (
    <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 99, padding: '3px 10px', background: m.bg, color: m.color, whiteSpace: 'nowrap' }}>
      {m.label}
    </span>
  );
};

// ─── AgeBadge ────────────────────────────────────────────────────────────────
// Always shows the actual duration as text (not just a color), per design intent.
const AgeBadge = ({ ticket, compact = false }) => {
  const age = getTicketAge(ticket);
  return (
    <span
      title={age.label}
      style={{
        fontSize: 11, fontWeight: 700, borderRadius: 99,
        padding: compact ? '2px 8px' : '3px 10px',
        background: age.bg, color: age.color, whiteSpace: 'nowrap',
      }}
    >
      {compact ? age.shortLabel : age.label}
    </span>
  );
};

// ─── TicketForm (modal) ───────────────────────────────────────────────────────

function TicketForm({ show, onHide, onCreated, userEmail, userName, userEmployeeId }) {
  const [dept,        setDept]        = useState('');
  const [issueType,   setIssueType]   = useState('');
  const [subject,     setSubject]     = useState('');
  const [description, setDescription] = useState('');
  const [priority,    setPriority]    = useState('medium');
  const [tagInput,    setTagInput]    = useState('');
  // "Assign To" is a single specific person — NOT the department TL by default. Kept as a
  // 1-item array (instead of a lone object) purely so the existing tagged_employees payload
  // shape/backward-compat stays intact; addTag replaces rather than appends.
  const [taggedEmps,  setTaggedEmps]  = useState([]);
  const [deptEmps,    setDeptEmps]    = useState([]);
  const [showTagDD,   setShowTagDD]   = useState(false);
  const [allEmployees, setAllEmployees] = useState([]);
  const [raisedFor,   setRaisedFor]   = useState(null); // employee object; null = "myself"
  const [raisedForInput, setRaisedForInput] = useState('');
  const [showRaisedForDD, setShowRaisedForDD] = useState(false);
  const [attachment,  setAttachment]  = useState(null);
  const [attName,     setAttName]     = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState('');
  const tagRef = useRef(null);
  const raisedForRef = useRef(null);

  // Load the full employee directory once (for "Raised For" — can be anyone, any department).
  // active=true so a deactivated employee can no longer be picked as a ticket's subject.
  useEffect(() => {
    if (!show) return;
    axios.get(API_ENDPOINTS.EMPLOYEES, { params: { active: 'true' } })
      .then(r => setAllEmployees(Array.isArray(r.data) ? r.data : (r.data?.data || [])))
      .catch(() => setAllEmployees([]));
  }, [show]);

  // Load dept employees when dept changes (still used to scope the "Assign To" @-search)
  useEffect(() => {
    if (!dept) { setDeptEmps([]); setTaggedEmps([]); return; }
    axios.get(API_ENDPOINTS.TICKET_DEPT_EMPLOYEES(dept))
      .then(r => setDeptEmps(r.data.employees || []))
      .catch(() => setDeptEmps([]));
    setIssueType('');
    setTaggedEmps([]);
  }, [dept]);

  // Close dropdowns on outside click
  useEffect(() => {
    const h = e => {
      if (tagRef.current && !tagRef.current.contains(e.target)) setShowTagDD(false);
      if (raisedForRef.current && !raisedForRef.current.contains(e.target)) setShowRaisedForDD(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const handleTagInput = e => {
    const v = e.target.value;
    setTagInput(v);
    setShowTagDD(v.includes('@'));
  };

  // Single-select: choosing a new person replaces whoever was previously selected — this
  // is "Assign To", not a multi-person watch/CC list.
  const addTag = emp => {
    setTaggedEmps([emp]);
    setTagInput('');
    setShowTagDD(false);
  };

  const removeTag = id => setTaggedEmps(p => p.filter(t => t.employee_id !== id));

  const handleFile = e => {
    const file = e.target.files[0];
    if (!file) return;
    setAttName(file.name);
    const reader = new FileReader();
    reader.onload = ev => setAttachment(ev.target.result);
    reader.readAsDataURL(file);
  };

  const tagSearch = tagInput.replace('@', '').toLowerCase();
  const filteredDeptEmps = deptEmps.filter(e =>
    (`${e.first_name} ${e.last_name}`.toLowerCase().includes(tagSearch) || e.email?.toLowerCase().includes(tagSearch))
  );

  const raisedForSearch = raisedForInput.toLowerCase();
  const filteredRaisedForEmps = allEmployees.filter(e =>
    e.employee_id !== userEmployeeId &&
    (`${e.first_name} ${e.last_name}`.toLowerCase().includes(raisedForSearch) || e.email?.toLowerCase().includes(raisedForSearch))
  ).slice(0, 8);

  const reset = () => {
    setDept(''); setIssueType(''); setSubject(''); setDescription('');
    setPriority('medium'); setTagInput(''); setTaggedEmps([]); setDeptEmps([]);
    setRaisedFor(null); setRaisedForInput(''); setShowRaisedForDD(false);
    setAttachment(null); setAttName(''); setError('');
  };

  const handleSubmit = async e => {
    e.preventDefault();
    if (!dept || !issueType || !subject.trim() || !description.trim()) {
      setError('Please fill all required fields.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await axios.post(API_ENDPOINTS.TICKETS, {
        department:        dept,
        issue_type:        issueType,
        subject:           subject.trim(),
        description:       description.trim(),
        priority,
        raised_for:        raisedFor?.employee_id || null, // null = raising it for myself
        assigned_to:       taggedEmps[0]?.employee_id || null, // null = department team queue
        tagged_employees:  taggedEmps.map(e => ({ employee_id: e.employee_id, name: `${e.first_name} ${e.last_name}`, email: e.email })),
        attachment_url:    attachment || null,
        attachment_name:   attName || null,
      });
      if (res.data.success) {
        reset();
        onHide();
        onCreated(res.data.ticket);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit ticket');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal className="tickets-modal" show={show} onHide={() => { reset(); onHide(); }} size="lg" centered>
      <Modal.Header closeButton style={{ background: '#1f4e79', border: 'none' }}>
        <Modal.Title style={{ color: '#fff', fontSize: 16, fontWeight: 700 }}>
          🎫 Raise a Support Ticket
        </Modal.Title>
      </Modal.Header>
      <Modal.Body style={{ padding: '24px 28px' }}>
        <form onSubmit={handleSubmit}>
          {error && <div style={{ background: '#f1f5f9', color: '#dc2626', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 }}>{error}</div>}

          {/* Email — read only */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Your Email <span style={{ color: '#9ca3af', fontWeight: 400 }}>(auto-filled)</span></label>
            <input value={userEmail} disabled style={{ ...inputStyle, background: '#f9fafb', color: '#64748b', cursor: 'not-allowed' }} />
          </div>

          {/* Raised For — who the ticket is actually about (defaults to the raiser themselves) */}
          <div style={{ marginBottom: 16 }} ref={raisedForRef}>
            <label style={labelStyle}>Raise Ticket For <span style={{ color: '#9ca3af', fontWeight: 400 }}>(defaults to you)</span></label>
            {raisedFor ? (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#f8fafc', border: '1px solid #bfdbfe', borderRadius: 8, padding: '7px 12px' }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: avatarColor(`${raisedFor.first_name} ${raisedFor.last_name}`), color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {(raisedFor.first_name?.[0] || '?').toUpperCase()}
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#1d4ed8' }}>{raisedFor.first_name} {raisedFor.last_name}</span>
                <button type="button" onClick={() => setRaisedFor(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1d4ed8', padding: 0, lineHeight: 1, fontSize: 15 }}>×</button>
              </div>
            ) : (
              <div style={{ position: 'relative' }}>
                <input
                  value={raisedForInput}
                  onChange={e => { setRaisedForInput(e.target.value); setShowRaisedForDD(true); }}
                  onFocus={() => setShowRaisedForDD(true)}
                  placeholder="Search a colleague, or leave blank to raise it for yourself"
                  style={inputStyle}
                />
                {showRaisedForDD && raisedForInput && filteredRaisedForEmps.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e5eaf0', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 100, maxHeight: 200, overflowY: 'auto' }}>
                    {filteredRaisedForEmps.map(emp => (
                      <div key={emp.employee_id} onMouseDown={() => { setRaisedFor(emp); setRaisedForInput(''); setShowRaisedForDD(false); }} style={{ padding: '9px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                        onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                        <div style={{ width: 26, height: 26, borderRadius: '50%', background: avatarColor(`${emp.first_name} ${emp.last_name}`), color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {(emp.first_name?.[0] || '?').toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, color: '#172033' }}>{emp.first_name} {emp.last_name}</div>
                          <div style={{ fontSize: 11, color: '#9ca3af' }}>{emp.department || ''}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            {/* Department */}
            <div>
              <label style={labelStyle}>Department <span style={{ color: '#c53030' }}>*</span></label>
              <select value={dept} onChange={e => setDept(e.target.value)} style={inputStyle} required>
                <option value="">Select Department</option>
                {DEPARTMENTS.map(d => <option key={d} value={d}>{DEPT_META[d]?.icon} {d}</option>)}
              </select>
            </div>
            {/* Issue Type */}
            <div>
              <label style={labelStyle}>Issue Type <span style={{ color: '#c53030' }}>*</span></label>
              <select value={issueType} onChange={e => setIssueType(e.target.value)} style={inputStyle} required disabled={!dept}>
                <option value="">{dept ? 'Select Issue' : 'Select dept first'}</option>
                {(ISSUE_TYPES[dept] || []).map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {/* Priority */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Priority</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {PRIORITIES.map(p => (
                <button key={p} type="button" onClick={() => setPriority(p)} style={{
                  padding: '5px 14px', borderRadius: 99, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                  background: priority === p ? PRIORITY_META[p].color : '#f3f4f6',
                  color: priority === p ? '#fff' : '#374151',
                  transition: 'all 0.15s',
                }}>
                  {PRIORITY_META[p].label}
                </button>
              ))}
            </div>
          </div>

          {/* Subject */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Subject <span style={{ color: '#c53030' }}>*</span></label>
            <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Brief summary of your issue" style={inputStyle} maxLength={200} required />
          </div>

          {/* Description */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Description <span style={{ color: '#c53030' }}>*</span></label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe your issue in detail..." rows={4} style={{ ...inputStyle, resize: 'vertical', minHeight: 100 }} required />
          </div>

          {/* Assign To — the specific person who should handle this ticket (optional).
              Leaving this empty sends the ticket to the department's team queue instead of
              silently routing it to a manager/TL — that auto-routing was the bug being fixed. */}
          {dept && (
            <div style={{ marginBottom: 16 }} ref={tagRef}>
              <label style={labelStyle}>Assign To <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional — type @ to search the {dept} team, or leave blank for the {dept} team queue)</span></label>
              {taggedEmps.length > 0 ? (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#f1f5f9', color: '#6d28d9', borderRadius: 99, padding: '5px 12px 5px 8px', fontSize: 13, fontWeight: 600 }}>
                  @{taggedEmps[0].first_name} {taggedEmps[0].last_name}
                  <button type="button" onClick={() => removeTag(taggedEmps[0].employee_id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6d28d9', padding: 0, lineHeight: 1, fontSize: 15 }}>×</button>
                </div>
              ) : (
                <div style={{ position: 'relative' }}>
                  <input
                    value={tagInput}
                    onChange={handleTagInput}
                    onFocus={() => tagInput.includes('@') && setShowTagDD(true)}
                    placeholder={`Type @ to assign to a ${dept} team member`}
                    style={inputStyle}
                  />
                  {showTagDD && filteredDeptEmps.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e5eaf0', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 100, maxHeight: 180, overflowY: 'auto' }}>
                      {filteredDeptEmps.map(emp => (
                        <div key={emp.employee_id} onMouseDown={() => addTag(emp)} style={{ padding: '9px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}
                          onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                          onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                          <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#52718c', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            {(emp.first_name?.[0] || '?').toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, color: '#172033' }}>{emp.first_name} {emp.last_name}</div>
                            <div style={{ fontSize: 11, color: '#9ca3af' }}>{emp.email}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Attachment */}
          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>Attachment <span style={{ color: '#9ca3af', fontWeight: 400 }}>(screenshot, optional)</span></label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '10px 14px', border: '1.5px dashed #d1d5db', borderRadius: 8, background: '#fafafa' }}>
              <span style={{ fontSize: 20 }}>📎</span>
              <span style={{ fontSize: 13, color: attName ? '#172033' : '#9ca3af' }}>{attName || 'Click to attach a file (image, PDF)'}</span>
              <input type="file" accept="image/*,.pdf,.doc,.docx" onChange={handleFile} style={{ display: 'none' }} />
            </label>
            {attName && (
              <button type="button" onClick={() => { setAttachment(null); setAttName(''); }} style={{ marginTop: 4, background: 'none', border: 'none', color: '#c53030', cursor: 'pointer', fontSize: 12 }}>
                Remove attachment
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => { reset(); onHide(); }} style={cancelBtnStyle}>Cancel</button>
            <button type="submit" disabled={submitting} style={submitBtnStyle}>
              {submitting ? 'Submitting…' : '🎫 Submit Ticket'}
            </button>
          </div>
        </form>
      </Modal.Body>
    </Modal>
  );
}

// ─── Ticket drawer — mobile/tablet/desktop widths, backdrop dimming+blur, slide timing.
// Only this drawer is styled here (backdropClassName/className below are scoped to it),
// so these rules can't leak onto any other Offcanvas in the app (none exist yet).
const TICKET_DRAWER_CSS = `
  .ticket-drawer.offcanvas.offcanvas-end {
    width: 680px;
    transition: transform 280ms ease-in-out;
  }
  @media (max-width: 1024px) and (min-width: 577px) {
    .ticket-drawer.offcanvas.offcanvas-end { width: 85vw; }
  }
  @media (max-width: 576px) {
    .ticket-drawer.offcanvas.offcanvas-end { width: 100vw; }
  }
  .ticket-drawer-backdrop.offcanvas-backdrop {
    transition: opacity 280ms ease-in-out;
  }
  .ticket-drawer-backdrop.offcanvas-backdrop.show {
    opacity: 0.18 !important;
    backdrop-filter: blur(2px);
  }
  .ticket-drawer .offcanvas-body { padding: 0; overflow: hidden; }
  .td-fade-in { animation: tdFadeIn 180ms ease; }
  @keyframes tdFadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
  .td-hover-lift { transition: transform 120ms ease, box-shadow 120ms ease; }
  .td-hover-lift:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
`;

const ACTION_HISTORY_META = {
  created: { icon: FaTicketAlt, color: '#52718c' },
  comment: { icon: FaComment, color: '#52718c' },
  status_changed: { icon: FaExchangeAlt, color: '#8a702c' },
  resolved: { icon: FaCheckCircle, color: '#64748b' },
  closed: { icon: FaLock, color: '#168a70' },
  reopened: { icon: FaLockOpen, color: '#c53030' },
};

const drawerBtnBase = { border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: '10px 16px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'opacity 120ms ease, transform 120ms ease' };
const DRAWER_BTN = {
  primary: { ...drawerBtnBase, background: '#f8fafc', color: '#1d4ed8', border: '1px solid #bfdbfe' },
  success: { ...drawerBtnBase, background: '#168a70', color: '#fff' },
  danger:  { ...drawerBtnBase, background: '#fff', color: '#dc2626', border: '1.5px solid #fecaca' },
  ghost:   { ...drawerBtnBase, background: '#f3f4f6', color: '#374151' },
};

// Auto-growing textarea — no fixed row count, expands to fit content up to a max height.
function AutoGrowTextarea({ value, onChange, style, minRows = 2, maxHeight = 160, ...rest }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, [value, maxHeight]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={e => onChange(e.target.value)}
      rows={minRows}
      style={{ ...inputStyle, resize: 'none', overflow: 'auto', maxHeight, ...style }}
      {...rest}
    />
  );
}

// Compact "Copy Ticket Link" menu — the header's three-dot action menu.
function DrawerKebabMenu({ ticket }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    if (open) document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  const copyLink = () => {
    navigator.clipboard?.writeText(`${window.location.origin}/tickets/${ticket.id}`);
    setCopied(true);
    setTimeout(() => { setCopied(false); setOpen(false); }, 900);
  };
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="More actions"
        aria-haspopup="true"
        aria-expanded={open}
        style={{ background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', width: 32, height: 32, borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <FaEllipsisV size={13} />
      </button>
      {open && (
        <div role="menu" style={{ position: 'absolute', top: 38, right: 0, background: '#fff', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', minWidth: 190, zIndex: 10, overflow: 'hidden', border: '1px solid #e5eaf0' }}>
          <button role="menuitem" onClick={copyLink} style={{ width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, color: '#374151', display: 'flex', alignItems: 'center', gap: 9 }}>
            <FaLink size={11} color={copied ? TK.success : '#64748b'} /> {copied ? 'Link copied!' : 'Copy Ticket Link'}
          </button>
        </div>
      )}
    </div>
  );
}

const QuickInfoCard = ({ icon: Icon, label, value, mono }) => (
  <div style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 12, padding: '10px 12px' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
      {Icon && <Icon size={10} color="#9ca3af" />}
      <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</div>
    </div>
    <div style={{ fontSize: 12.5, color: '#172033', fontWeight: 600, fontFamily: mono ? 'monospace' : undefined, wordBreak: 'break-word' }}>{value || '—'}</div>
  </div>
);

function TicketDetail({ ticketId, show, onHide, onUpdated, userRole, userEmployeeId }) {
  const [ticket,      setTicket]      = useState(null);
  const [history,     setHistory]     = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [comment,     setComment]     = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [resolveNote, setResolveNote] = useState('');
  const [declineNote, setDeclineNote] = useState('');
  const [acting,      setActing]      = useState('');
  const [showResolve, setShowResolve] = useState(false);
  const [showDecline, setShowDecline] = useState(false);
  const [employeeDetails, setEmployeeDetails] = useState(null);
  const [employeePhoto, setEmployeePhoto] = useState('');

  const fetch = useCallback(async () => {
    if (!ticketId) return;
    setLoading(true);
    setEmployeeDetails(null);
    setEmployeePhoto('');
    try {
      const res = await axios.get(API_ENDPOINTS.TICKET_BY_ID(ticketId));
      if (res.data.success) {
        const nextTicket = res.data.ticket;
        setTicket(nextTicket);
        setHistory(res.data.history || []);

        const parsedDetails = parseEmployeeDetails(nextTicket?.description);
        setEmployeeDetails(parsedDetails);

        if (parsedDetails?.employeeNumber) {
          try {
            const empRes = await axios.get(API_ENDPOINTS.EMPLOYEE_PROFILE(parsedDetails.employeeNumber));
            setEmployeePhoto(getEmployeePhotoUrl(empRes.data) || '');
          } catch {
            setEmployeePhoto('');
          }
        }
      }
    } catch { /* silent */ } finally { setLoading(false); }
  }, [ticketId]);

  useEffect(() => { if (show && ticketId) fetch(); }, [show, ticketId, fetch]);

  // Reset transient compose/action state whenever a different ticket is opened, so stale
  // "unsaved comment" text from a previous ticket can't leak in or block closing this one.
  useEffect(() => {
    setComment(''); setIsInternalNote(false); setResolveNote(''); setDeclineNote('');
    setShowResolve(false); setShowDecline(false);
  }, [ticketId]);

  const act = async (type, payload = {}) => {
    setActing(type);
    try {
      const map = {
        comment:     () => axios.post(API_ENDPOINTS.TICKET_COMMENT(ticketId), { message: comment, is_internal: isInternalNote }),
        inprogress:  () => axios.patch(API_ENDPOINTS.TICKET_IN_PROGRESS(ticketId)),
        resolve:     () => axios.patch(API_ENDPOINTS.TICKET_RESOLVE(ticketId), { resolve_note: resolveNote }),
        accept:      () => axios.patch(API_ENDPOINTS.TICKET_ACCEPT(ticketId)),
        decline:     () => axios.patch(API_ENDPOINTS.TICKET_DECLINE(ticketId), { reason: declineNote }),
      };
      await map[type]();
      setComment(''); setIsInternalNote(false); setResolveNote(''); setDeclineNote('');
      setShowResolve(false); setShowDecline(false);
      await fetch();
      onUpdated();
    } catch (err) { alert(err.response?.data?.message || 'Action failed'); }
    finally { setActing(''); }
  };

  const requestClose = () => {
    if (comment.trim() && !window.confirm('You have an unsaved comment. Close without posting it?')) return;
    onHide();
  };

  const t = ticket;
  const isRaiser   = t?.raised_by === userEmployeeId;
  const canResolve = ROLES_CAN_RESOLVE.includes(userRole);
  const actionable = t?.status !== 'closed';
  const age        = t ? getTicketAge(t) : null;
  const slaMeta     = age && ({
    green:  { label: 'Within SLA',      color: '#168a70', bg: '#f8fafc', icon: FaCheckCircle },
    amber:  { label: 'Within SLA',      color: '#168a70', bg: '#f8fafc', icon: FaCheckCircle },
    orange: { label: 'Approaching SLA', color: '#f97316', bg: '#fff7ed', icon: FaExclamationTriangle },
    red:    { label: 'SLA Overdue',     color: '#c53030', bg: '#fef2f2', icon: FaExclamationTriangle },
  }[age.colorKey]);

  // Comments are chat-style and split out from the system-event timeline — same underlying
  // ticket_history rows, just presented in the two sections the redesign calls for.
  const timelineEvents = history.filter(h => h.action !== 'comment');
  const comments       = history.filter(h => h.action === 'comment');

  const showTeamActions   = canResolve && actionable && t?.status !== 'resolved_pending' && t?.status !== 'closed';
  const showRaiserConfirm = isRaiser && t?.status === 'resolved_pending';

  return (
    <>
      <style>{TICKET_DRAWER_CSS}</style>
      <Offcanvas
        show={show}
        onHide={requestClose}
        placement="end"
        className="ticket-drawer"
        backdropClassName="ticket-drawer-backdrop"
        aria-label={t ? `Ticket ${t.ticket_number} details` : 'Ticket details'}
      >
        {loading && !t ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ background: '#1f4e79', padding: '20px 24px', flexShrink: 0 }}>
              <div style={{ width: '60%', height: 16, background: 'rgba(255,255,255,0.15)', borderRadius: 6 }} />
            </div>
            <div style={{ flex: 1, padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[80, 100, 60, 90, 70].map((w, i) => (
                <div key={i} style={{ width: `${w}%`, height: 14, background: '#f1f5f9', borderRadius: 6 }} />
              ))}
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20 }}><Spinner animation="border" size="sm" /></div>
            </div>
          </div>
        ) : t ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

            {/* ── Sticky header ── */}
            <div style={{ flexShrink: 0, background: '#1f4e79', color: '#fff' }}>
              <div style={{ padding: '16px 22px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', minWidth: 0 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <FaFileAlt size={14} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13.5, fontWeight: 700 }}>Ticket #{t.ticket_number}</span>
                      <StatusBadge status={t.status} />
                    </div>
                    <div style={{ fontSize: 11.5, opacity: 0.7, marginTop: 3 }}>
                      Created {fmtDate(t.created_at)} • {age.shortLabel} ago
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <DrawerKebabMenu ticket={t} />
                  <button
                    onClick={requestClose}
                    aria-label="Close ticket details"
                    style={{ background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', width: 32, height: 32, borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <FaTimes size={14} />
                  </button>
                </div>
              </div>
              <div style={{ background: '#fff', padding: '14px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#172033', wordBreak: 'break-word' }}>{t.subject}</div>
                  <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Issue Category: {t.issue_type}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 99, padding: '4px 11px', background: PRIORITY_META[t.priority]?.color + '18', color: PRIORITY_META[t.priority]?.color, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: PRIORITY_META[t.priority]?.color }} />
                    {PRIORITY_META[t.priority]?.label} Priority
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 99, padding: '4px 11px', background: DEPT_META[t.department]?.color + '18', color: DEPT_META[t.department]?.color }}>
                    {DEPT_META[t.department]?.icon} {t.department} Team
                  </span>
                </div>
              </div>
            </div>

            {/* ── Scrollable body ── */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px', background: '#f8fafc' }}>

              {/* Ticket Summary Card */}
              <div className="td-fade-in" style={{ background: '#fff', borderRadius: 16, padding: '16px 18px', marginBottom: 16, border: '1px solid #eef0f3', boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#52718c', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Request Summary</div>
                {employeeDetails ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.7fr) 220px', gap: 18, alignItems: 'start' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px 14px' }}>
                      {[
                        ['Employee Name', employeeDetails.employeeName],
                        ['Employee Number', employeeDetails.employeeNumber],
                        ['Date of Joining', employeeDetails.joiningDate],
                        ['Date of Birth', employeeDetails.dob],
                        ['Designation', employeeDetails.designation],
                        ['Blood Group', employeeDetails.bloodGroup],
                        ['Reporting Manager', employeeDetails.reportingManager],
                        ['Contact Number', employeeDetails.contactNumber],
                        ['Emergency Contact', employeeDetails.emergencyContact],
                        ['Employee Address', employeeDetails.address],
                      ].map(([label, value]) => (
                        <div key={label} style={{ background: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: 10, padding: '10px 12px' }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
                          <div style={{ fontSize: 12, color: '#172033', fontWeight: 600, lineHeight: 1.4 }}>{value || '—'}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ padding: 12, border: '1px solid #f1f5f9', borderRadius: 12, background: '#f8fafc', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      {employeePhoto ? (
                        <img src={employeePhoto} alt={employeeDetails.employeeName || 'Employee profile'} style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 10, border: '1px solid #e5eaf0' }} />
                      ) : (
                        <div style={{ width: '100%', height: 160, borderRadius: 10, background: 'linear-gradient(135deg, #eef4fb 0%, #f9fafb 100%)', border: '1px dashed #d1d5db', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 11.5, textAlign: 'center', padding: 12 }}>
                          No profile photo uploaded yet
                        </div>
                      )}
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#172033', marginTop: 9, textAlign: 'center' }}>{employeeDetails.employeeName || 'Employee Profile'}</div>
                      {employeePhoto && (
                        <a href={employeePhoto} target="_blank" rel="noreferrer" style={{ marginTop: 8, fontSize: 11, fontWeight: 700, color: '#1f4e79', textDecoration: 'none' }}>
                          ⬇ Download photo
                        </a>
                      )}
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 13.5, color: '#374151', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{t.description}</div>
                )}
                {t.attachment_url && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
                    <a href={t.attachment_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#52718c', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      📎 {t.attachment_name || 'View Attachment'}
                    </a>
                  </div>
                )}
              </div>

              {/* Quick Info — compact two-column cards. Raised By / Raised For / Assigned To are
                  kept as three visually distinct fields per the routing fix — never merged, since
                  they can be three different people (creator, subject, and handler). Older tickets
                  created before the raised_for column existed fall back to showing the raiser. */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
                <QuickInfoCard icon={FaUser} label="Raised By" value={t.raised_by_name} />
                <QuickInfoCard icon={FaUserCheck} label="Raised For" value={t.raised_for_name || t.raised_by_name} />
                <QuickInfoCard icon={FaUserCheck} label="Assigned To" value={t.assigned_to_name || `${t.department} Team Queue`} />
                <QuickInfoCard icon={FaBuilding} label="Department" value={t.department} />
                <QuickInfoCard icon={FaEnvelope} label="Email" value={t.raised_by_email} />
                <QuickInfoCard icon={FaCalendarAlt} label="Created" value={fmtDate(t.created_at)} />
                <QuickInfoCard icon={FaClock} label="Last Updated" value={fmtDate(t.updated_at)} />
              </div>

              {t.tagged_employees?.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', marginBottom: 6 }}>Tagged</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {t.tagged_employees.map((e, i) => (
                      <span key={i} style={{ fontSize: 12, color: '#374151', background: '#fff', border: '1px solid #eef0f3', borderRadius: 99, padding: '3px 10px' }}>@{e.name}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Status & SLA Card */}
              <div style={{ background: '#fff', borderRadius: 16, padding: '14px 18px', marginBottom: 16, border: '1px solid #eef0f3', boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#52718c', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Time & SLA</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', marginBottom: 4 }}>
                      {t.status === 'closed' ? 'Resolution Time' : 'Time Pending'}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: slaMeta.color }}>{age.shortLabel}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', marginBottom: 4 }}>SLA Status</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: slaMeta.color, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <slaMeta.icon size={12} /> {slaMeta.label}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', marginBottom: 4 }}>SLA Response Due</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#9ca3af' }}>—</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', marginBottom: 4 }}>SLA Resolution Due</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#9ca3af' }}>—</div>
                  </div>
                </div>
                {(t.resolved_at || t.closed_at) && (
                  <div style={{ display: 'flex', gap: 18, marginTop: 12, paddingTop: 12, borderTop: '1px solid #f1f5f9', flexWrap: 'wrap' }}>
                    {t.resolved_at && <div style={{ fontSize: 11.5, color: '#64748b' }}>Resolved: <strong style={{ color: '#374151' }}>{fmtDate(t.resolved_at)}</strong></div>}
                    {t.closed_at && <div style={{ fontSize: 11.5, color: '#64748b' }}>Closed: <strong style={{ color: '#374151' }}>{fmtDate(t.closed_at)}</strong></div>}
                  </div>
                )}
              </div>

              {/* Resolved — awaiting raiser confirmation */}
              {showRaiserConfirm && !showDecline && (
                <div className="td-fade-in" style={{ background: '#f1f5f9', borderRadius: 14, padding: '14px 16px', marginBottom: 16, border: '1.5px solid #dce3eb' }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: '#5b21b6', marginBottom: 4 }}>✅ Your issue has been marked resolved</div>
                  {t.resolve_note && <div style={{ fontSize: 12.5, color: '#6d28d9' }}>{t.resolve_note}</div>}
                  <div style={{ fontSize: 12, color: '#475569', marginTop: 8 }}>Use the buttons at the bottom to confirm or reopen this ticket.</div>
                </div>
              )}

              {/* Activity Timeline */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#172033', marginBottom: 12 }}>Activity Timeline</div>
                {timelineEvents.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#9ca3af' }}>No activity yet</div>
                ) : (
                  <div style={{ position: 'relative' }}>
                    <div style={{ position: 'absolute', left: 13, top: 4, bottom: 4, width: 2, background: '#eef0f3' }} />
                    {timelineEvents.map((h, i) => {
                      const meta = ACTION_HISTORY_META[h.action] || { icon: FaClock, color: '#9ca3af' };
                      const Icon = h.is_internal ? FaLock : meta.icon;
                      const iconColor = h.is_internal ? '#b45309' : meta.color;
                      return (
                        <div key={h.id} className="td-fade-in" style={{ display: 'flex', gap: 12, marginBottom: i === timelineEvents.length - 1 ? 0 : 16, position: 'relative' }}>
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: iconColor + '18', border: `2px solid ${iconColor}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 1 }}>
                            <Icon size={11} color={iconColor} />
                          </div>
                          <div style={{ flex: 1, paddingTop: 2 }}>
                            <div style={{ fontSize: 12.5, color: '#374151', lineHeight: 1.5 }}>
                              <span style={{ fontWeight: 700, color: '#172033' }}>{h.performed_by_name || 'System'}</span>
                              {h.new_status && <span> → <StatusBadge status={h.new_status} /></span>}
                              {h.is_internal && (
                                <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: '#b45309', background: '#f8fafc', border: '1px solid #fde68a', borderRadius: 99, padding: '1px 8px' }}>
                                  🔒 Internal
                                </span>
                              )}
                            </div>
                            {h.message && (
                              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4, background: h.is_internal ? '#f8fafc' : '#fff', border: `1px solid ${h.is_internal ? '#fde68a' : '#f1f5f9'}`, borderRadius: 8, padding: '7px 10px' }}>
                                {h.message}
                              </div>
                            )}
                            <div style={{ fontSize: 10.5, color: '#9ca3af', marginTop: 4 }}>{fmtDate(h.created_at)}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Comments — chat-style conversation */}
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#172033', marginBottom: 12 }}>
                  Comments {comments.length > 0 && <span style={{ color: '#9ca3af', fontWeight: 600 }}>({comments.length})</span>}
                </div>
                {comments.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#9ca3af' }}>No comments yet — start the conversation below.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {comments.map(c => {
                      const fromRaiser = c.performed_by === t.raised_by;
                      return (
                        <div key={c.id} className="td-fade-in" style={{ display: 'flex', gap: 10, background: c.is_internal ? '#f8fafc' : '#fff', border: `1px solid ${c.is_internal ? '#fde68a' : '#eef0f3'}`, borderRadius: 14, padding: '12px 14px' }}>
                          <div style={{ width: 32, height: 32, borderRadius: '50%', background: avatarColor(c.performed_by_name), color: '#fff', fontSize: 11.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            {initialsOf(c.performed_by_name) || '?'}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 12.5, fontWeight: 700, color: '#172033' }}>{c.performed_by_name || 'Unknown'}</span>
                              <span style={{ fontSize: 10.5, fontWeight: 700, color: fromRaiser ? '#1f4e79' : '#0369a1', background: fromRaiser ? '#e0e7ff' : '#e0f2fe', borderRadius: 99, padding: '1px 8px' }}>
                                {fromRaiser ? 'Raised By' : 'Team'}
                              </span>
                              {c.is_internal && (
                                <span style={{ fontSize: 10, fontWeight: 700, color: '#b45309', background: '#f1f5f9', borderRadius: 99, padding: '1px 8px', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                  <FaLock size={8} /> Internal
                                </span>
                              )}
                              <span style={{ fontSize: 10.5, color: '#9ca3af', marginLeft: 'auto' }}>{fmtDate(c.created_at)}</span>
                            </div>
                            <div style={{ fontSize: 13, color: '#374151', marginTop: 5, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{c.message}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* ── Comment composer (pinned above the sticky action bar) ── */}
            {actionable && (
              <div style={{ flexShrink: 0, borderTop: '1px solid #eef0f3', background: '#fff', padding: '14px 22px' }}>
                <AutoGrowTextarea
                  value={comment}
                  onChange={setComment}
                  placeholder={isInternalNote ? 'Write an internal note (not visible to the employee)…' : 'Write a comment…'}
                  style={{ fontSize: 13, marginBottom: 8, background: isInternalNote ? '#f8fafc' : '#fff', borderColor: isInternalNote ? '#fde68a' : undefined }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  {canResolve ? (
                    <select
                      value={isInternalNote ? 'internal' : 'public'}
                      onChange={e => setIsInternalNote(e.target.value === 'internal')}
                      style={{ fontSize: 12, fontWeight: 600, color: isInternalNote ? '#92400e' : '#374151', background: isInternalNote ? '#f8fafc' : '#f9fafb', border: `1.5px solid ${isInternalNote ? '#fde68a' : '#e5eaf0'}`, borderRadius: 8, padding: '7px 10px', cursor: 'pointer' }}
                    >
                      <option value="public">💬 Public Reply</option>
                      <option value="internal">🔒 Internal Note</option>
                    </select>
                  ) : <span />}
                  <button
                    onClick={() => comment.trim() && act('comment')}
                    disabled={!comment.trim() || !!acting}
                    style={{ ...DRAWER_BTN.success, background: isInternalNote ? '#8a702c' : '#1f4e79', opacity: (!comment.trim() || acting) ? 0.55 : 1, cursor: (!comment.trim() || acting) ? 'not-allowed' : 'pointer' }}
                  >
                    {acting === 'comment' ? 'Posting…' : <>Send <FaPaperPlane size={11} /></>}
                  </button>
                </div>
                {isInternalNote && (
                  <div style={{ fontSize: 11, color: '#92400e', marginTop: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <FaLock size={9} /> Internal notes are only visible to HR/Admin/Manager/TL
                  </div>
                )}
              </div>
            )}

            {/* ── Sticky bottom action bar ── */}
            {(showTeamActions || showRaiserConfirm) && (
              <div style={{ flexShrink: 0, borderTop: '1px solid #eef0f3', background: '#fff', padding: '14px 22px' }}>
                {showResolve ? (
                  <div className="td-fade-in">
                    <AutoGrowTextarea value={resolveNote} onChange={setResolveNote} placeholder="Resolution note (optional)" style={{ fontSize: 12.5, marginBottom: 8 }} minRows={2} />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => act('resolve')} disabled={!!acting} className="td-hover-lift" style={{ ...DRAWER_BTN.success, flex: 1 }}>
                        {acting === 'resolve' ? 'Confirming…' : '✓ Confirm Resolved'}
                      </button>
                      <button onClick={() => setShowResolve(false)} className="td-hover-lift" style={DRAWER_BTN.ghost}>Cancel</button>
                    </div>
                  </div>
                ) : showDecline ? (
                  <div className="td-fade-in">
                    <AutoGrowTextarea value={declineNote} onChange={setDeclineNote} placeholder="Why is it not resolved? (optional)" style={{ fontSize: 12.5, marginBottom: 8 }} minRows={2} />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => act('decline')} disabled={!!acting} className="td-hover-lift" style={{ ...DRAWER_BTN.danger, flex: 1, background: '#c53030', color: '#fff', border: 'none' }}>
                        {acting === 'decline' ? 'Sending…' : '✕ Confirm Reopen'}
                      </button>
                      <button onClick={() => setShowDecline(false)} className="td-hover-lift" style={DRAWER_BTN.ghost}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {showRaiserConfirm && (
                      <>
                        <button onClick={() => act('accept')} disabled={!!acting} className="td-hover-lift" style={{ ...DRAWER_BTN.success, flex: 1 }}>
                          {acting === 'accept' ? 'Processing…' : '✓ Confirm & Close Ticket'}
                        </button>
                        <button onClick={() => setShowDecline(true)} disabled={!!acting} className="td-hover-lift" style={{ ...DRAWER_BTN.danger, flex: 1 }}>
                          Not Resolved
                        </button>
                      </>
                    )}
                    {showTeamActions && (
                      <>
                        {(t.status === 'open' || t.status === 'reopened') && (
                          <button onClick={() => act('inprogress')} disabled={!!acting} className="td-hover-lift" style={{ ...DRAWER_BTN.primary, flex: 1 }}>
                            {acting === 'inprogress' ? '…' : <><FaSyncAlt size={11} /> Mark In Progress</>}
                          </button>
                        )}
                        <button onClick={() => setShowResolve(true)} className="td-hover-lift" style={{ ...DRAWER_BTN.success, flex: 1 }}>
                          ✓ Mark as Resolved
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : null}
      </Offcanvas>
    </>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const inputStyle = {
  width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e5eaf0',
  fontSize: 13, color: '#172033', outline: 'none', boxSizing: 'border-box',
  fontFamily: 'inherit', background: '#fff',
};
const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 };
const submitBtnStyle = { padding: '9px 20px', background: '#1f4e79', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' };
const cancelBtnStyle = { padding: '9px 20px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' };

// ─── List-page helpers ────────────────────────────────────────────────────────

const AVATAR_COLORS = ['#52718c', '#64748b', '#168a70', '#8a702c', '#c53030', '#52718c', '#ec4899'];
const avatarColor = (str) => AVATAR_COLORS[((str || '').charCodeAt(0) || 0) % AVATAR_COLORS.length];
const initialsOf  = (name) => (name || '').trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('');

function Sparkline({ data, color, height = 26 }) {
  if (!data || data.length < 2) return <div style={{ height }} />;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const w = 100;
  const step = w / (data.length - 1);
  const points = data.map((v, i) => `${i * step},${height - ((v - min) / range) * (height - 4) - 2}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const StatusDot = ({ status }) => {
  const m = STATUS_META[status] || { label: status, color: '#64748b' };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: m.color }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: m.color, display: 'inline-block', flexShrink: 0 }} />
      {m.label}
    </span>
  );
};

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard?.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      title={copied ? 'Copied!' : 'Copy ticket ID'}
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? TK.success : '#9ca3af', padding: 2, display: 'inline-flex', alignItems: 'center' }}
    >
      {copied ? <FaCheck size={11} /> : <FaCopy size={11} />}
    </button>
  );
}

// Builds a page-number list with ellipses, e.g. [1, 2, '...', 9, 10]
function pageNumberList(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const keep = new Set([1, 2, total - 1, total, current - 1, current, current + 1]);
  const sorted = [...keep].filter(p => p >= 1 && p <= total).sort((a, b) => a - b);
  const result = [];
  let prev = 0;
  for (const p of sorted) {
    if (prev && p - prev > 1) result.push('…');
    result.push(p);
    prev = p;
  }
  return result;
}

const TABLE_COLS = '120px minmax(170px,1fr) 110px 120px 160px 160px 110px 120px 44px';

const pagerBtnStyle = {
  minWidth: 26, height: 26, borderRadius: 6, border: `1px solid ${TK.border}`,
  background: '#fff', color: TK.textDark, fontSize: 12, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
};

// ─── TicketList (main page) ───────────────────────────────────────────────────

export default function TicketList() {
  const { user } = useAuth();
  const { id: routeTicketId } = useParams();
  const [tickets,     setTickets]     = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [showForm,    setShowForm]    = useState(false);
  const [detailId,    setDetailId]    = useState(routeTicketId || null);
  const [filterStatus, setFilterStatus] = useState(() => new URLSearchParams(window.location.search).get('status') || 'all');
  const [filterDept,   setFilterDept]   = useState('all');
  const [search,       setSearch]       = useState('');
  const [sortOrder,    setSortOrder]    = useState(() => new URLSearchParams(window.location.search).get('sort') || 'latest');
  const [page,         setPage]         = useState(1);
  const [rowsPerPage,  setRowsPerPage]  = useState(5);

  // Bulk-select-and-resolve — same role gate as single-ticket resolve (ROLES_CAN_RESOLVE).
  const [selectedIds,      setSelectedIds]      = useState(() => new Set());
  const [showBulkResolve,  setShowBulkResolve]  = useState(false);
  const [bulkNote,         setBulkNote]         = useState('');
  const [bulkSubmitting,   setBulkSubmitting]   = useState(false);
  const [bulkResult,       setBulkResult]       = useState(null); // { ok, failed }

  // Deep link: a notification/dashboard-widget click can land on /tickets/:id or
  // /tickets?status=... and this opens the right modal/filter without extra plumbing.
  useEffect(() => { if (routeTicketId) setDetailId(routeTicketId); }, [routeTicketId]);

  const userEmail = user?.email || '';
  const userName  = user?.name  || user?.employeeId || '';

  const fetchTickets = useCallback(async () => {
    try {
      const res = await axios.get(API_ENDPOINTS.TICKETS);
      setTickets(res.data.tickets || []);
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);
  useEffect(() => { setPage(1); }, [filterStatus, filterDept, search, sortOrder, rowsPerPage]);
  useEffect(() => {
    if (!bulkResult) return;
    const t = setTimeout(() => setBulkResult(null), 5000);
    return () => clearTimeout(t);
  }, [bulkResult]);

  const canSeeAll    = ROLES_SEE_ALL.includes(user?.role);
  const canResolve   = ROLES_CAN_RESOLVE.includes(user?.role);

  const filtered = tickets
    .filter(t => {
      if (filterStatus !== 'all' && t.status !== filterStatus) return false;
      if (filterDept   !== 'all' && t.department !== filterDept) return false;
      if (search) {
        const q = search.toLowerCase();
        return t.ticket_number?.toLowerCase().includes(q)   ||
               t.subject?.toLowerCase().includes(q)         ||
               t.description?.toLowerCase().includes(q)     ||
               t.raised_by_name?.toLowerCase().includes(q)  ||
               t.raised_for_name?.toLowerCase().includes(q) ||
               t.assigned_to_name?.toLowerCase().includes(q)||
               t.department?.toLowerCase().includes(q);
      }
      return true;
    })
    .sort((a, b) => {
      const da = new Date(a.created_at).getTime();
      const db = new Date(b.created_at).getTime();
      return sortOrder === 'latest' ? db - da : da - db;
    });

  // Stats
  const stats = {
    total:     tickets.length,
    open:      tickets.filter(t => t.status === 'open').length,
    inProg:    tickets.filter(t => t.status === 'in_progress').length,
    pending:   tickets.filter(t => t.status === 'resolved_pending').length,
    closed:    tickets.filter(t => t.status === 'closed').length,
    reopened:  tickets.filter(t => t.status === 'reopened').length,
  };

  // 7-day trend (real data, bucketed by created_at) for each stat card's sparkline
  const trendFor = (predicate) => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (6 - i)); return d;
    });
    return days.map(day => {
      const next = new Date(day); next.setDate(day.getDate() + 1);
      return tickets.filter(t => {
        const c = new Date(t.created_at);
        return predicate(t) && c >= day && c < next;
      }).length;
    });
  };

  const statCards = [
    { key: 'all',              label: 'Total Tickets', value: stats.total,   icon: FaFileAlt,      color: TK.blue,    bg: '#fff',           data: trendFor(() => true) },
    { key: 'open',             label: 'Open',          value: stats.open,    icon: FaFileAlt,      color: TK.blue,    bg: TK.blueLight,     data: trendFor(t => t.status === 'open') },
    { key: 'in_progress',      label: 'In Progress',   value: stats.inProg,  icon: FaClock,        color: TK.warning, bg: TK.warningLight,  data: trendFor(t => t.status === 'in_progress') },
    { key: 'resolved_pending', label: 'Pending',       value: stats.pending, icon: FaHourglassHalf,color: TK.purple,  bg: TK.purpleLight,   data: trendFor(t => t.status === 'resolved_pending') },
    { key: 'reopened',         label: 'Reopened',      value: stats.reopened,icon: FaSyncAlt,      color: TK.danger,  bg: TK.dangerLight,   data: trendFor(t => t.status === 'reopened') },
    { key: 'closed',           label: 'Closed',        value: stats.closed,  icon: FaCheckCircle,  color: TK.success, bg: TK.successLight,  data: trendFor(t => t.status === 'closed') },
  ];

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const pageSafe   = Math.min(page, totalPages);
  const pageItems  = filtered.slice((pageSafe - 1) * rowsPerPage, pageSafe * rowsPerPage);

  // Only tickets that could actually be resolved one-by-one are eligible for bulk resolve —
  // mirrors the single-ticket `showTeamActions` gate in TicketDetail (not closed, not already
  // awaiting the raiser's confirmation).
  const isBulkResolvable = (t) => canResolve && t.status !== 'closed' && t.status !== 'resolved_pending';
  const pageEligibleIds  = pageItems.filter(isBulkResolvable).map(t => t.id);
  const allPageSelected  = pageEligibleIds.length > 0 && pageEligibleIds.every(id => selectedIds.has(id));

  const toggleSelect = (id) => setSelectedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const toggleSelectPage = () => setSelectedIds(prev => {
    const next = new Set(prev);
    if (allPageSelected) pageEligibleIds.forEach(id => next.delete(id));
    else pageEligibleIds.forEach(id => next.add(id));
    return next;
  });

  const clearSelection = () => setSelectedIds(new Set());

  // A leading checkbox column is only added to the grid for roles that can actually bulk-resolve.
  const listCols     = canResolve ? `30px ${TABLE_COLS}` : TABLE_COLS;
  const listMinWidth = canResolve ? 1130 : 1100;

  const runBulkResolve = async () => {
    setBulkSubmitting(true);
    const ids = Array.from(selectedIds);
    const results = await Promise.allSettled(
      ids.map(id => axios.patch(API_ENDPOINTS.TICKET_RESOLVE(id), { resolve_note: bulkNote.trim() }))
    );
    const ok     = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.length - ok;
    setBulkResult({ ok, failed });
    setBulkSubmitting(false);
    setBulkNote('');
    clearSelection();
    fetchTickets();
  };

  return (
    <div className="tickets-page p-3 p-md-4">
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: TK.primaryLight, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <FaTicketAlt size={19} color={TK.primary} />
          </div>
          <div>
            <span className="tickets-eyebrow">EMPLOYEE WORKSPACE</span>
            <h1 className="tickets-title">Support Tickets</h1>
            <p style={{ color: TK.textMuted, margin: '3px 0 0', fontSize: 13 }}>
              {canSeeAll ? 'Track, manage and resolve all team support requests' : canResolve ? 'Track and resolve tickets assigned to you' : 'Track, manage and resolve your support requests'}
            </p>
          </div>
        </div>
        <button onClick={() => setShowForm(true)} style={{ ...submitBtnStyle, background: TK.primary, display: 'flex', alignItems: 'center', gap: 7 }}>
          <FaPlus size={11} /> Raise a Ticket
        </button>
      </div>

      {/* ── Stat cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14, marginBottom: 20 }}>
        {statCards.map(s => (
          <div className="tickets-stat-card" key={s.key} role="button" tabIndex={0} aria-pressed={filterStatus === s.key} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setFilterStatus(s.key); } }} onClick={() => setFilterStatus(s.key)}
            style={{ background: '#fff', border: `1px solid ${TK.border}`, borderRadius: 14, padding: '16px 18px', cursor: 'pointer', transition: 'transform 0.12s' }}
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ width: 30, height: 30, borderRadius: 9, background: s.color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <s.icon size={13} color={s.color} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: TK.textMuted }}>{s.label}</span>
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: TK.textDark, marginBottom: 8 }}>{s.value}</div>
            <Sparkline data={s.data} color={s.color} />
          </div>
        ))}
      </div>

      {/* ── Filters ── */}
      <div className="tickets-filter-panel">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', flex: 1, minWidth: 260 }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 220, maxWidth: 340 }}>
            <FaSearch size={12} color="#9ca3af" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
            <input aria-label="Search tickets" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by ID, subject, raised by/for, assignee, department…" style={{ ...inputStyle, paddingLeft: 32 }} />
          </div>
          <select aria-label="Filter by department" value={filterDept} onChange={e => setFilterDept(e.target.value)} style={{ ...inputStyle, width: 'auto', maxWidth: 170 }}>
            <option value="all">All Departments</option>
            {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select aria-label="Filter by status" value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...inputStyle, width: 'auto', maxWidth: 170 }}>
            <option value="all">All Statuses</option>
            {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          {(filterStatus !== 'all' || filterDept !== 'all' || search) && (
            <button onClick={() => { setFilterStatus('all'); setFilterDept('all'); setSearch(''); }} style={cancelBtnStyle}>Clear</button>
          )}
        </div>
        <select aria-label="Sort tickets" value={sortOrder} onChange={e => setSortOrder(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
          <option value="latest">Sort by: Latest</option>
          <option value="oldest">Sort by: Oldest</option>
        </select>
      </div>

      {/* ── Bulk-select action bar ── */}
      {canResolve && selectedIds.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#eef4fb', border: '1px solid #dce3eb', borderRadius: 12, padding: '10px 16px', marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#1f4e79' }}>{selectedIds.size} ticket{selectedIds.size > 1 ? 's' : ''} selected</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={clearSelection} style={cancelBtnStyle}>Clear</button>
            <button onClick={() => setShowBulkResolve(true)} style={{ ...submitBtnStyle, background: TK.success, display: 'flex', alignItems: 'center', gap: 6 }}>
              <FaCheckCircle size={12} /> Resolve Selected ({selectedIds.size})
            </button>
          </div>
        </div>
      )}

      {/* ── Ticket list ── */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner animation="border" /></div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#9ca3af', background: '#fff', borderRadius: 14, border: `1px solid ${TK.border}` }}>
          <div style={{ marginBottom: 16 }}><FaTicketAlt size={36} color="#94a3b8" /></div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#374151', marginBottom: 6 }}>No tickets found</div>
          <div style={{ fontSize: 13 }}>
            {tickets.length === 0 ? 'No tickets have been raised yet.' : 'No tickets match your filters.'}
          </div>
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 14, border: `1px solid ${TK.border}`, boxShadow: '0 2px 10px rgba(0,0,0,0.04)', overflowX: 'auto' }}>
          {/* Header row */}
          <div style={{ display: 'grid', gridTemplateColumns: listCols, minWidth: listMinWidth, gap: 12, padding: '14px 18px', background: '#f9fafb', borderBottom: `1px solid ${TK.border}`, fontSize: 11, fontWeight: 700, color: TK.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 }}>
            {canResolve && (
              <span onClick={e => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  disabled={pageEligibleIds.length === 0}
                  onChange={toggleSelectPage}
                  title="Select all resolvable tickets on this page"
                  style={{ cursor: pageEligibleIds.length ? 'pointer' : 'not-allowed' }}
                />
              </span>
            )}
            <span>Ticket ID</span>
            <span>Subject</span>
            <span>Department</span>
            <span>Status</span>
            <span>Raised By</span>
            <span>Assigned To</span>
            <span>Date</span>
            <span>Age</span>
            <span>Action</span>
          </div>
          <div>
            {pageItems.map(t => {
              const deptM  = DEPT_META[t.department] || { color: '#64748b', icon: '•' };
              const statusColor = STATUS_META[t.status]?.color || TK.border;
              const isPending = t.status === 'resolved_pending' && t.raised_by === user?.employeeId;
              const created = new Date(t.created_at);
              const raisedForName = t.raised_for_name && t.raised_for_name !== t.raised_by_name ? t.raised_for_name : null;
              return (
                <div key={t.id}
                  onClick={() => setDetailId(t.id)}
                  style={{
                    display: 'grid', gridTemplateColumns: listCols, gap: 12, minWidth: listMinWidth,
                    padding: '14px 18px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6',
                    borderLeft: `4px solid ${statusColor}`,
                    background: selectedIds.has(t.id) ? '#eef4fb' : isPending ? '#faf5ff' : '#fff', transition: 'background 0.12s',
                    alignItems: 'center',
                  }}
                  onMouseEnter={e => !isPending && !selectedIds.has(t.id) && (e.currentTarget.style.background = '#f9fafb')}
                  onMouseLeave={e => !isPending && !selectedIds.has(t.id) && (e.currentTarget.style.background = '#fff')}
                >
                  {canResolve && (
                    <span onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(t.id)}
                        disabled={!isBulkResolvable(t)}
                        onChange={() => toggleSelect(t.id)}
                        title={isBulkResolvable(t) ? 'Select for bulk resolve' : 'Not resolvable in this status'}
                        style={{ cursor: isBulkResolvable(t) ? 'pointer' : 'not-allowed' }}
                      />
                    </span>
                  )}
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontFamily: 'monospace', fontWeight: 700, color: TK.primary }}>
                    {t.ticket_number}
                    <CopyButton text={t.ticket_number} />
                  </span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#172033', marginBottom: 2 }}>{t.subject}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>{t.issue_type}</div>
                    {isPending && <span style={{ fontSize: 10, fontWeight: 700, color: '#475569', background: '#f1f5f9', borderRadius: 99, padding: '1px 7px' }}>⚠ Your confirmation needed</span>}
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: deptM.color }}>{deptM.icon} {t.department}</span>
                  <StatusDot status={t.status} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <div style={{ width: 30, height: 30, borderRadius: '50%', background: avatarColor(t.raised_by_name), color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {initialsOf(t.raised_by_name) || '?'}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.raised_by_name}</div>
                      <div style={{ fontSize: 10, color: '#9ca3af', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{raisedForName ? `for: ${raisedForName}` : ' '}</div>
                    </div>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    {t.assigned_to_name ? (
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#374151', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>{t.assigned_to_name}</span>
                    ) : (
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', fontStyle: 'italic' }}>{t.department} Team Queue</span>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <FaCalendarAlt size={10} color="#9ca3af" />
                      {created.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </div>
                    <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>
                      {created.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                    </div>
                  </div>
                  <div><AgeBadge ticket={t} compact /></div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDetailId(t.id); }}
                    title="View ticket"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <FaEllipsisV size={13} />
                  </button>
                </div>
              );
            })}
          </div>

          {/* ── Pagination ── */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px', borderTop: `1px solid ${TK.border}`, flexWrap: 'wrap', gap: 12 }}>
            <span style={{ fontSize: 12, color: TK.textMuted }}>
              Showing {filtered.length === 0 ? 0 : (pageSafe - 1) * rowsPerPage + 1} to {Math.min(pageSafe * rowsPerPage, filtered.length)} of {filtered.length} tickets
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button disabled={pageSafe === 1} onClick={() => setPage(p => Math.max(1, p - 1))} style={{ ...pagerBtnStyle, opacity: pageSafe === 1 ? 0.4 : 1 }}>
                <FaChevronLeft size={10} />
              </button>
              {pageNumberList(pageSafe, totalPages).map((p, i) => p === '…' ? (
                <span key={`e${i}`} style={{ padding: '0 4px', color: TK.textMuted, fontSize: 12 }}>…</span>
              ) : (
                <button key={p} onClick={() => setPage(p)}
                  style={{ ...pagerBtnStyle, background: p === pageSafe ? TK.primary : '#fff', color: p === pageSafe ? '#fff' : TK.textDark, borderColor: p === pageSafe ? TK.primary : TK.border, fontWeight: p === pageSafe ? 700 : 400 }}>
                  {p}
                </button>
              ))}
              <button disabled={pageSafe === totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} style={{ ...pagerBtnStyle, opacity: pageSafe === totalPages ? 0.4 : 1 }}>
                <FaChevronRight size={10} />
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: TK.textMuted }}>
              Rows per page:
              <select value={rowsPerPage} onChange={e => setRowsPerPage(Number(e.target.value))} style={{ ...inputStyle, width: 'auto', padding: '4px 8px', fontSize: 12 }}>
                {[5, 10, 20, 50].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      <TicketForm
        show={showForm}
        onHide={() => setShowForm(false)}
        onCreated={ticket => { setTickets(p => [ticket, ...p]); }}
        userEmail={userEmail}
        userName={userName}
        userEmployeeId={user?.employeeId}
      />
      <TicketDetail
        show={!!detailId}
        ticketId={detailId}
        onHide={() => setDetailId(null)}
        onUpdated={fetchTickets}
        userRole={user?.role}
        userEmployeeId={user?.employeeId}
      />

      {/* Bulk resolve confirmation */}
      <Modal show={showBulkResolve} onHide={() => !bulkSubmitting && setShowBulkResolve(false)} centered>
        <Modal.Header closeButton={!bulkSubmitting}>
          <Modal.Title style={{ fontSize: 16 }}>Resolve {selectedIds.size} Ticket{selectedIds.size > 1 ? 's' : ''}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p style={{ fontSize: 13, color: '#4b5563' }}>
            This will mark all {selectedIds.size} selected ticket{selectedIds.size > 1 ? 's' : ''} as resolved. Each raiser will be notified and asked to confirm, same as resolving one ticket at a time.
          </p>
          <label style={labelStyle}>Resolution Note <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional — applied to all selected tickets)</span></label>
          <textarea
            value={bulkNote}
            onChange={e => setBulkNote(e.target.value)}
            placeholder="e.g. Resolved as part of bulk cleanup"
            rows={3}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </Modal.Body>
        <Modal.Footer>
          <button type="button" onClick={() => setShowBulkResolve(false)} disabled={bulkSubmitting} style={cancelBtnStyle}>Cancel</button>
          <button
            type="button"
            onClick={async () => { await runBulkResolve(); setShowBulkResolve(false); }}
            disabled={bulkSubmitting}
            style={{ ...submitBtnStyle, background: TK.success }}
          >
            {bulkSubmitting ? 'Resolving…' : `Resolve ${selectedIds.size} Ticket${selectedIds.size > 1 ? 's' : ''}`}
          </button>
        </Modal.Footer>
      </Modal>

      {/* Bulk resolve result toast-ish banner — simple inline confirmation, auto-clears */}
      {bulkResult && (
        <div
          style={{ position: 'fixed', bottom: 24, right: 24, background: bulkResult.failed ? '#fff7ed' : '#f8fafc', border: `1px solid ${bulkResult.failed ? '#fdba74' : '#6ee7b7'}`, color: bulkResult.failed ? '#9a3412' : '#065f46', borderRadius: 10, padding: '12px 16px', fontSize: 13, fontWeight: 600, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 2000 }}
        >
          {bulkResult.ok} ticket{bulkResult.ok !== 1 ? 's' : ''} resolved{bulkResult.failed ? `, ${bulkResult.failed} failed` : ''}.
          <button onClick={() => setBulkResult(null)} style={{ background: 'none', border: 'none', marginLeft: 10, cursor: 'pointer', fontWeight: 700, color: 'inherit' }}>×</button>
        </div>
      )}
    </div>
  );
}
