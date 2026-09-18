// components/Admin/EmployeeList.jsx
import React, { useState, useEffect } from 'react';
import { Spinner, Modal, Table, Button, Form } from 'react-bootstrap';
import {
  FaEdit, FaEye, FaPlus, FaDownload, FaFilePdf, FaFileImage, FaFileAlt,
  FaSearch, FaTimes, FaSyncAlt, FaArrowLeft, FaCheckCircle, FaUserSlash,
  FaUser, FaEnvelope, FaPhone, FaBuilding, FaBriefcase, FaCalendarAlt, FaUserTie,
  FaClock, FaCreditCard, FaUsers, FaLink, FaKey, FaIdCard, FaUserClock, FaDoorOpen,
} from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';
import GenerateLinkModal from './GenerateLinkModal';
import OfferLinksManager from './OfferLinksManager';
import SendOfferLetterModal from './SendOfferLetterModal';
import ChangeEmployeeIdModal from './ChangeEmployeeIdModal';
import InactiveLoginsModal from './InactiveLoginsModal';
import LeftEmployeesModal from './LeftEmployeesModal';

// ── helpers ───────────────────────────────────────────────────────────────────
const getInitials = (emp) =>
  `${(emp?.first_name || '')[0] || ''}${(emp?.last_name || '')[0] || ''}`.toUpperCase() || '?';

const getFullName = (emp) =>
  `${emp?.first_name || ''} ${emp?.middle_name || ''} ${emp?.last_name || ''}`.trim().replace(/  +/g, ' ');

const fmtDate = (d) => {
  if (!d) return 'N/A';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const fmtCurrency = (v) => {
  if (!v) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(v);
};

const getProfilePct = (emp) => {
  if (!emp) return 0;
  const fields = [
    emp.email, emp.phone, emp.department, emp.designation,
    emp.joining_date, emp.employment_type, emp.reporting_manager,
    emp.gender, emp.dob, emp.blood_group,
    emp.address, emp.bank_name || emp.bank_account_name,
    emp.account_number, emp.ifsc_code, emp.pan_number, emp.aadhar_number,
  ];
  return Math.round((fields.filter(Boolean).length / fields.length) * 100);
};

const AVATAR_COLORS = ['#6366f1', '#0ea5e9', '#22c55e', '#f97316', '#8b5cf6', '#ec4899', '#14b8a6'];
const getAvatarColor = (emp) =>
  AVATAR_COLORS[(emp?.first_name || 'A').charCodeAt(0) % AVATAR_COLORS.length];

// ── CompletionRing ────────────────────────────────────────────────────────────
const CompletionRing = ({ pct = 0, size = 52 }) => {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const color = pct >= 80 ? '#22c55e' : pct >= 50 ? '#f97316' : '#ef4444';
  const label = pct >= 80 ? 'Good' : pct >= 50 ? 'Pending' : 'Low';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={7} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={7}
            strokeDasharray={`${(pct / 100) * circ} ${circ}`} strokeLinecap="round" />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 800, color }}>{pct}%</span>
        </div>
      </div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>Profile Completion</div>
        <span style={{ fontSize: 10, background: `${color}18`, color, borderRadius: 10, padding: '1px 7px', fontWeight: 700 }}>{label}</span>
      </div>
    </div>
  );
};

// ── InfoRow ───────────────────────────────────────────────────────────────────
const InfoRow = ({ icon: Icon, label, value, badge, badgeColor }) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '7px 0', borderBottom: '1px solid #f8fafc' }}>
    <div style={{ width: 28, height: 28, borderRadius: 7, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Icon size={11} color="#6366f1" />
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</div>
      {badge ? (
        <span style={{ fontSize: 11, background: `${badgeColor || '#22c55e'}18`, color: badgeColor || '#22c55e', borderRadius: 20, padding: '2px 9px', fontWeight: 700 }}>
          {value || 'N/A'}
        </span>
      ) : (
        <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', wordBreak: 'break-word' }}>{value || 'N/A'}</div>
      )}
    </div>
  </div>
);

// ── QuickActionBtn ────────────────────────────────────────────────────────────
const QuickActionBtn = ({ icon: Icon, label, color, onClick }) => (
  <button onClick={onClick} style={{
    background: '#fff', border: `1px solid ${color}25`, borderRadius: 10, padding: '8px 2px',
    cursor: 'pointer', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
    flex: 1, transition: 'background 0.15s',
  }}
    onMouseEnter={e => e.currentTarget.style.background = `${color}10`}
    onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
    <div style={{ width: 30, height: 30, borderRadius: 8, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Icon size={13} color={color} />
    </div>
    <span style={{ fontSize: 9, fontWeight: 700, color: '#374151', lineHeight: 1.2, whiteSpace: 'nowrap' }}>{label}</span>
  </button>
);

// ── StatMini ──────────────────────────────────────────────────────────────────
const StatMini = ({ label, value, color }) => (
  <div style={{ background: '#fff', borderRadius: 10, padding: '10px 12px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', borderLeft: `3px solid ${color}` }}>
    <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase' }}>{label}</div>
    <div style={{ fontSize: 20, fontWeight: 800, color: '#111827', marginTop: 2 }}>{value ?? '—'}</div>
  </div>
);

// ── EmpQuickView ──────────────────────────────────────────────────────────────
const EmpQuickView = ({ emp, onClose, navigate, user, onToggleStatus, togglingStatus, onViewDocs }) => {
  const [tab, setTab] = useState('overview');
  const [attSummary, setAttSummary] = useState(null);
  const [leaveBalance, setLeaveBalance] = useState(null);
  const [dataLoading, setDataLoading] = useState(false);

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showOfferLetterModal, setShowOfferLetterModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');
    if (!newPassword) return setPasswordError('New password is required');
    if (newPassword.length < 6) return setPasswordError('Password must be at least 6 characters');
    if (newPassword !== confirmPassword) return setPasswordError('Passwords do not match');

    setPasswordSaving(true);
    try {
      await axios.post(API_ENDPOINTS.EMPLOYEE_RESET_PASSWORD(emp.id), { newPassword });
      setPasswordSuccess('Password updated successfully!');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => { setShowPasswordModal(false); setPasswordSuccess(''); }, 1500);
    } catch (err) {
      setPasswordError(err.response?.data?.message || 'Failed to update password');
    } finally {
      setPasswordSaving(false);
    }
  };

  const name = getFullName(emp);
  const ini = getInitials(emp);
  const pct = getProfilePct(emp);
  const avatarColor = getAvatarColor(emp);
  const isActive = emp.is_active !== false;

  useEffect(() => {
    setTab('overview');
    setAttSummary(null);
    setLeaveBalance(null);
    setShowPasswordModal(false);
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
    setPasswordSuccess('');
    if (!emp.employee_id) return;
    // IT (desktop_support) gets a compact, action-only view with no attendance/leave
    // tabs — skip fetching data it'll never display.
    if (user?.role === 'desktop_support') return;
    setDataLoading(true);
    const today = new Date();
    const yr = today.getFullYear(), mo = today.getMonth();
    const cycleStart = today.getDate() >= 26 ? new Date(yr, mo, 26) : new Date(yr, mo - 1, 26);
    const start = cycleStart.toISOString().split('T')[0];
    const end = today.toISOString().split('T')[0];
    Promise.all([
      axios.get(API_ENDPOINTS.ATTENDANCE_EMPLOYEE_REPORT(emp.employee_id, start, end)).catch(() => null),
      axios.get(API_ENDPOINTS.LEAVE_BALANCE(emp.employee_id)).catch(() => null),
    ]).then(([attRes, balRes]) => {
      if (attRes) {
        const recs = attRes.data.attendance || [];
        let present = 0, absent = 0, late = 0, totalHours = 0;
        let d = new Date(cycleStart);
        while (d <= today) {
          const ds = d.toISOString().split('T')[0];
          const dow = d.getDay();
          if (dow !== 0 && dow !== 6) {
            const r = recs.find(x => x.attendance_date === ds);
            if (r && (r.clock_in || r.status === 'present')) { present++; totalHours += parseFloat(r.total_hours) || 0; }
            else absent++;
            if (r && parseFloat(r.late_minutes) > 0) late++;
          }
          d.setDate(d.getDate() + 1);
        }
        const wd = present + absent;
        setAttSummary({ present, absent, late, totalHours: Math.round(totalHours * 10) / 10, pct: wd > 0 ? Math.round((present / wd) * 100) : 0, wd });
      }
      if (balRes) setLeaveBalance(balRes.data);
    }).finally(() => setDataLoading(false));
  }, [emp.id]);

  const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'attendance', label: 'Attendance' },
    { id: 'leave', label: 'Leave' },
    { id: 'payroll', label: 'Payroll' },
    { id: 'documents', label: 'Documents' },
  ];

  const passwordModal = (
    <Modal show={showPasswordModal} onHide={() => setShowPasswordModal(false)} centered size="sm">
      <Modal.Header closeButton className="bg-warning py-2">
        <Modal.Title as="h6" className="mb-0 d-flex align-items-center">
          <FaKey className="me-2" size={14} />
          Update Password — {name}
        </Modal.Title>
      </Modal.Header>
      <Form onSubmit={handleUpdatePassword}>
        <Modal.Body className="p-3">
          {passwordError && <div style={{ fontSize: 12, color: '#991b1b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 10px', marginBottom: 12 }}>{passwordError}</div>}
          {passwordSuccess && <div style={{ fontSize: 12, color: '#065f46', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 8, padding: '8px 10px', marginBottom: 12 }}>{passwordSuccess}</div>}

          <Form.Group className="mb-3">
            <Form.Label className="fw-semibold small">New Password <span className="text-danger">*</span></Form.Label>
            <Form.Control
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Min 6 characters"
              size="sm"
              required
            />
          </Form.Group>

          <Form.Group className="mb-1">
            <Form.Label className="fw-semibold small">Confirm Password <span className="text-danger">*</span></Form.Label>
            <Form.Control
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter password"
              size="sm"
              required
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer className="py-2">
          <Button variant="secondary" size="sm" onClick={() => setShowPasswordModal(false)} disabled={passwordSaving}>
            Cancel
          </Button>
          <Button type="submit" variant="warning" size="sm" disabled={passwordSaving}>
            {passwordSaving ? (
              <><Spinner size="sm" animation="border" className="me-1" /> Saving...</>
            ) : (
              <><FaKey className="me-1" size={11} /> Update Password</>
            )}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );

  // ── IT (desktop_support): compact, action-only panel — no tabs, no attendance/
  // leave/payroll data, just enough identity info plus the two actions IT actually
  // needs (Update Password, Activate/Deactivate). Professional and space-efficient
  // instead of reusing the full admin/HR tabbed view.
  if (user?.role === 'desktop_support') {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#fff' }}>
        <div style={{ padding: '18px 16px', borderBottom: '1px solid #e5e7eb', position: 'relative', flexShrink: 0 }}>
          <button onClick={onClose} style={{
            position: 'absolute', top: 12, right: 12, background: '#f1f5f9',
            border: 'none', color: '#6b7280', borderRadius: 6, width: 26, height: 26,
            cursor: 'pointer', fontSize: 16, lineHeight: '24px', textAlign: 'center', padding: 0,
          }}>×</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 46, height: 46, borderRadius: '50%', background: avatarColor,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, fontWeight: 800, color: '#fff', flexShrink: 0,
            }}>
              {emp.profile_image
                ? <img src={emp.profile_image} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                : ini}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                <span style={{ background: '#f1f5f9', color: '#475569', borderRadius: 20, padding: '1px 8px', fontSize: 9, fontWeight: 700 }}>{emp.employee_id}</span>
                <span style={{ background: isActive ? '#dcfce7' : '#fee2e2', color: isActive ? '#16a34a' : '#dc2626', borderRadius: 20, padding: '1px 8px', fontSize: 9, fontWeight: 700 }}>
                  {isActive ? '● Active' : '● Inactive'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
          <div style={{ background: '#f8fafc', borderRadius: 10, padding: '4px 12px' }}>
            <InfoRow icon={FaEnvelope} label="Email" value={emp.email} />
            <InfoRow icon={FaPhone} label="Phone" value={emp.phone} />
            <InfoRow icon={FaBuilding} label="Department" value={emp.department} />
            <InfoRow icon={FaUserTie} label="Designation" value={emp.designation} />
            <InfoRow icon={FaUser} label="Reports To" value={emp.reporting_manager} />
            <InfoRow icon={FaCalendarAlt} label="Joining Date" value={fmtDate(emp.joining_date)} />
          </div>
        </div>

        <div style={{ padding: 14, borderTop: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
          <button
            onClick={() => {
              setNewPassword(''); setConfirmPassword(''); setPasswordError(''); setPasswordSuccess('');
              setShowPasswordModal(true);
            }}
            style={{ width: '100%', background: '#d97706', color: '#fff', border: 'none', borderRadius: 8, padding: '10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            <FaKey size={12} /> Update Password
          </button>
          <button
            onClick={() => onToggleStatus(emp)}
            disabled={togglingStatus === emp.id}
            style={{
              width: '100%', border: `1px solid ${isActive ? '#fde68a' : '#bbf7d0'}`, borderRadius: 8,
              background: isActive ? '#fffbeb' : '#f0fdf4', color: isActive ? '#d97706' : '#16a34a',
              padding: '10px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            {togglingStatus === emp.id
              ? <Spinner size="sm" animation="border" />
              : isActive
                ? <><FaUserSlash size={12} /> Deactivate Account</>
                : <><FaCheckCircle size={12} /> Activate Account</>}
          </button>
        </div>

        {passwordModal}
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>

      {/* ── Header ── */}
      <div style={{
        background: 'linear-gradient(135deg,#1e1b4b 0%,#312e81 60%,#4338ca 100%)',
        padding: '16px 16px 16px', position: 'relative', flexShrink: 0,
      }}>
        <button onClick={onClose} style={{
          position: 'absolute', top: 10, right: 10, background: 'rgba(255,255,255,0.15)',
          border: 'none', color: '#fff', borderRadius: 6, width: 26, height: 26,
          cursor: 'pointer', fontSize: 18, lineHeight: '24px', textAlign: 'center', padding: 0,
        }}>×</button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 52, height: 52, borderRadius: '50%', background: avatarColor,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, fontWeight: 800, color: '#fff', border: '2px solid rgba(255,255,255,0.35)', flexShrink: 0,
          }}>
            {emp.profile_image
              ? <img src={emp.profile_image} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
              : ini}
          </div>
          <div
            style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
            onClick={() => navigate(`/admin/employees/${emp.employee_id}`)}
            title="Click to view full profile"
          >
            <div style={{ color: '#fff', fontWeight: 800, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
              {name}
              <span style={{ fontSize: 10, opacity: 0.7, fontWeight: 400 }}>↗</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
              <span style={{ background: 'rgba(255,255,255,0.15)', color: '#e0e7ff', borderRadius: 20, padding: '1px 8px', fontSize: 9, fontWeight: 600 }}>{emp.employee_id}</span>
              <span style={{ background: isActive ? '#22c55e' : '#ef4444', color: '#fff', borderRadius: 20, padding: '1px 8px', fontSize: 9, fontWeight: 700 }}>
                {isActive ? '● Active' : '● Inactive'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', background: '#fff', flexShrink: 0, overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            border: 'none', background: 'none', cursor: 'pointer',
            padding: '9px 14px', fontSize: 11, fontWeight: 600,
            color: tab === t.id ? '#6366f1' : '#6b7280',
            borderBottom: tab === t.id ? '2px solid #6366f1' : '2px solid transparent',
            whiteSpace: 'nowrap', transition: 'all 0.15s',
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── Content area ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>

        {/* ═══ OVERVIEW ═══ */}
        {tab === 'overview' && (
          <>
            {/* Info card */}
            <div style={{ background: '#fff', borderRadius: 12, padding: '10px 14px', marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              <InfoRow icon={FaEnvelope} label="Email" value={emp.email} />
              <InfoRow icon={FaCalendarAlt} label="Joining Date" value={fmtDate(emp.joining_date)} />
              <InfoRow icon={FaPhone} label="Phone" value={emp.phone} />
              <InfoRow icon={FaBuilding} label="Department" value={emp.department} />
              <InfoRow icon={FaBriefcase} label="Employment Type" value={emp.employment_type}
                badge badgeColor={emp.employment_type === 'Full Time' ? '#22c55e' : '#0ea5e9'} />
              <InfoRow icon={FaUserTie} label="Designation" value={emp.designation} />
              <InfoRow icon={FaUser} label="Reports To" value={emp.reporting_manager} />
            </div>

            {/* Profile % + Attendance */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div style={{ background: '#fff', borderRadius: 12, padding: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <CompletionRing pct={pct} size={52} />
              </div>
              <div style={{ background: '#fff', borderRadius: 12, padding: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>Attendance</div>
                {dataLoading ? <Spinner size="sm" animation="border" /> : attSummary ? (
                  <>
                    <div style={{ fontSize: 16, fontWeight: 800, color: attSummary.pct >= 80 ? '#22c55e' : '#f97316' }}>{attSummary.pct}%</div>
                    <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 600 }}>{attSummary.present}P · {attSummary.absent}A · {attSummary.late}L</div>
                  </>
                ) : (
                  <div style={{ fontSize: 11, color: '#22c55e', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} /> Enabled
                  </div>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div style={{ background: '#fff', borderRadius: 12, padding: '12px 14px', marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 10 }}>Quick Actions</div>
              <div style={{ display: 'flex', gap: 5 }}>
                {user?.role !== 'desktop_support' && (
                  <QuickActionBtn icon={FaEye} label="View Full Profile" color="#6366f1" onClick={() => navigate(`/admin/employees/${emp.employee_id}`)} />
                )}
                {(user?.role === 'admin' || user?.role === 'sub_admin' || user?.role === 'hr') && (
                  <QuickActionBtn icon={FaEdit} label="Edit Details" color="#0ea5e9" onClick={() => navigate(`/admin/edit-employee/${emp.id}`)} />
                )}
                {(user?.role === 'admin' || user?.role === 'sub_admin' || user?.role === 'hr') && (
                  <QuickActionBtn icon={FaFilePdf} label="Send Offer Letter" color="#dc2626" onClick={() => setShowOfferLetterModal(true)} />
                )}
                {user?.role !== 'desktop_support' && (
                  <QuickActionBtn icon={FaClock} label="Attendance" color="#22c55e" onClick={() => navigate(`/admin/employees/${emp.employee_id}`)} />
                )}
                {user?.role !== 'desktop_support' && (
                  <QuickActionBtn icon={FaCreditCard} label="Salary / Payroll" color="#f97316" onClick={() => navigate('/admin/payroll')} />
                )}
                {user?.role !== 'desktop_support' && (
                  <QuickActionBtn icon={FaFileAlt} label="Documents" color="#8b5cf6" onClick={() => onViewDocs(emp)} />
                )}
                {(user?.role === 'admin' || user?.role === 'sub_admin' || user?.role === 'desktop_support' || user?.role === 'hr') && (
                  <QuickActionBtn icon={FaKey} label="Update Password" color="#d97706" onClick={() => {
                    setNewPassword(''); setConfirmPassword(''); setPasswordError(''); setPasswordSuccess('');
                    setShowPasswordModal(true);
                  }} />
                )}
              </div>
            </div>

            {/* Account info */}
            <div style={{ background: '#fff', borderRadius: 12, padding: '12px 14px', marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 8 }}>Account Info</div>
              {[
                { label: 'Company', value: emp.pf_amount != null && parseInt(emp.pf_amount) === 0 ? 'PropCulture' : 'B2B InDemand', color: '#6366f1' },
                { label: 'Profile Status', value: emp.profile_completed ? 'Completed' : 'Pending', color: emp.profile_completed ? '#22c55e' : '#f97316' },
                { label: 'Account Status', value: isActive ? 'Active' : 'Inactive', color: isActive ? '#22c55e' : '#ef4444' },
                { label: 'Profile Form', value: emp.require_profile_completion ? 'Required' : 'Not Required', color: emp.require_profile_completion ? '#0ea5e9' : '#9ca3af' },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: i < 3 ? '1px solid #f8fafc' : 'none' }}>
                  <span style={{ fontSize: 11, color: '#6b7280' }}>{item.label}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, background: `${item.color}15`, color: item.color, borderRadius: 10, padding: '2px 8px' }}>{item.value}</span>
                </div>
              ))}
            </div>

            {/* Activate / Deactivate */}
            {(user?.role === 'admin' || user?.role === 'sub_admin' || user?.role === 'manager' || user?.role === 'hr' || user?.role === 'desktop_support') && (
              <button
                onClick={() => onToggleStatus(emp)}
                disabled={togglingStatus === emp.id}
                style={{
                  width: '100%', border: `1px solid ${isActive ? '#fde68a' : '#bbf7d0'}`, borderRadius: 8,
                  background: isActive ? '#fffbeb' : '#f0fdf4', color: isActive ? '#d97706' : '#16a34a',
                  padding: '9px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                }}>
                {togglingStatus === emp.id
                  ? <Spinner size="sm" animation="border" />
                  : isActive
                    ? <><FaUserSlash size={11} /> Deactivate Account</>
                    : <><FaCheckCircle size={11} /> Activate Account</>}
              </button>
            )}
          </>
        )}

        {/* ═══ ATTENDANCE ═══ */}
        {tab === 'attendance' && (
          <>
            {dataLoading ? (
              <div style={{ textAlign: 'center', padding: 40 }}><Spinner animation="border" size="sm" /></div>
            ) : attSummary ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                  <StatMini label="Present" value={attSummary.present} color="#22c55e" />
                  <StatMini label="Absent" value={attSummary.absent} color="#ef4444" />
                  <StatMini label="Late Arrivals" value={attSummary.late} color="#f97316" />
                  <StatMini label="Total Hours" value={`${attSummary.totalHours}h`} color="#6366f1" />
                </div>
                <div style={{ background: '#fff', borderRadius: 12, padding: '14px', marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Attendance Rate (Current Cycle)</div>
                  <div style={{ fontSize: 32, fontWeight: 800, color: attSummary.pct >= 80 ? '#22c55e' : attSummary.pct >= 60 ? '#f97316' : '#ef4444' }}>
                    {attSummary.pct}%
                  </div>
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>{attSummary.wd} working days tracked</div>
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af', fontSize: 12 }}>No attendance data for current cycle</div>
            )}
            <button onClick={() => navigate(`/admin/employees/${emp.employee_id}`)} style={{ width: '100%', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, padding: '10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <FaEye size={12} /> View Full Attendance History
            </button>
          </>
        )}

        {/* ═══ LEAVE ═══ */}
        {tab === 'leave' && (
          <>
            {dataLoading ? (
              <div style={{ textAlign: 'center', padding: 40 }}><Spinner animation="border" size="sm" /></div>
            ) : leaveBalance ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                <StatMini label="Total Accrued" value={parseFloat(leaveBalance.total_accrued || 0).toFixed(1)} color="#6366f1" />
                <StatMini label="Used" value={parseFloat(leaveBalance.used || 0).toFixed(1)} color="#ef4444" />
                <StatMini label="Available" value={parseFloat(leaveBalance.available || 0).toFixed(1)} color="#22c55e" />
                <StatMini label="Comp-Off" value={parseFloat(leaveBalance.comp_off_balance || 0).toFixed(1)} color="#8b5cf6" />
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af', fontSize: 12 }}>No leave data available</div>
            )}
            <button onClick={() => navigate(`/admin/employees/${emp.employee_id}`)} style={{ width: '100%', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, padding: '10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <FaEye size={12} /> View Full Leave History
            </button>
          </>
        )}

        {/* ═══ PAYROLL ═══ */}
        {tab === 'payroll' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10, marginBottom: 12 }}>
              <div style={{ background: '#fff', borderRadius: 12, padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', borderLeft: '3px solid #22c55e' }}>
                <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase' }}>Gross Salary</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#111827', marginTop: 2 }}>{fmtCurrency(emp.gross_salary)}</div>
              </div>
              <div style={{ background: '#fff', borderRadius: 12, padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', borderLeft: '3px solid #6366f1' }}>
                <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase' }}>In-Hand Salary</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#111827', marginTop: 2 }}>{fmtCurrency(emp.in_hand_salary)}</div>
              </div>
            </div>
            <button onClick={() => navigate('/admin/payroll')} style={{ width: '100%', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, padding: '10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <FaEye size={12} /> View Full Payroll & Salary Slips
            </button>
          </>
        )}

        {/* ═══ DOCUMENTS ═══ */}
        {tab === 'documents' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button onClick={() => onViewDocs(emp)} style={{ width: '100%', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, padding: '10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <FaFileAlt size={12} /> View Documents
            </button>
            <button onClick={() => navigate(`/admin/employees/${emp.employee_id}`)} style={{ width: '100%', background: '#fff', color: '#6366f1', border: '1px solid #6366f1', borderRadius: 8, padding: '10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <FaEye size={12} /> Full Profile Documents
            </button>
          </div>
        )}

      </div>

      {passwordModal}
      <SendOfferLetterModal
        show={showOfferLetterModal}
        employee={emp}
        onHide={() => setShowOfferLetterModal(false)}
      />
    </div>
  );
};

// ── EmpListItem ───────────────────────────────────────────────────────────────
const EmpListItem = ({ emp, selected, onClick }) => {
  const name = getFullName(emp);
  const ini = getInitials(emp);
  const isActive = emp.is_active !== false;
  return (
    <div
      onClick={onClick}
      style={{
        padding: '9px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 9,
        background: selected ? '#eff0ff' : 'transparent',
        borderLeft: `3px solid ${selected ? '#6366f1' : 'transparent'}`,
        borderBottom: '1px solid #f1f5f9',
        opacity: isActive ? 1 : 0.65,
        transition: 'background 0.12s, border-color 0.12s',
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = '#f8fafc'; }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent'; }}
    >
      <div style={{
        width: 34, height: 34, borderRadius: '50%',
        background: isActive ? getAvatarColor(emp) : '#9ca3af',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 800, color: '#fff', flexShrink: 0,
      }}>{ini}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: selected ? '#4338ca' : '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {name}
        </div>
        <div style={{ fontSize: 10, color: '#9ca3af', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {emp.employee_id}{emp.designation ? ` · ${emp.designation}` : ''}
        </div>
      </div>
      {!isActive && (
        <span style={{ fontSize: 8, background: '#fee2e2', color: '#ef4444', borderRadius: 4, padding: '1px 4px', fontWeight: 700, flexShrink: 0 }}>OFF</span>
      )}
    </div>
  );
};

// ── Responsive rules ──────────────────────────────────────────────────────────
// Desktop: fixed 290px list + flexible detail pane, both visible side by side.
// Tablet/mobile: list takes full width; once an employee is selected the list
// hides and the detail pane (with its existing × close button) takes over —
// a classic master/detail mobile pattern with no extra JS needed.
const EMP_RESPONSIVE_CSS = `
  @media (max-width: 900px) {
    .emp-left-panel { width: 100% !important; border-right: none !important; }
    .emp-right-panel { display: none !important; }
    .emp-split-pane--detail-open .emp-left-panel { display: none !important; }
    .emp-split-pane--detail-open .emp-right-panel { display: flex !important; width: 100%; }
  }
  @media (max-width: 640px) {
    .emp-mgmt-header { padding: 12px 14px !important; }
    .emp-mgmt-header h5 { font-size: 15px !important; }
    .emp-mgmt-header p { display: none; }
    .emp-mgmt-header-actions select,
    .emp-mgmt-header-actions button { font-size: 11px !important; padding: 7px 11px !important; }
  }
`;

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
const EmployeeList = () => {
  const [employees, setEmployees] = useState([]);
  const [filteredEmployees, setFilteredEmployees] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [profileFilter, setProfileFilter] = useState('all');
  const [activeTab, setActiveTab] = useState('active');
  const [selectedEmpId, setSelectedEmpId] = useState(null);

  // onboarding
  const [showGenLink, setShowGenLink] = useState(false);
  const [showChangeId, setShowChangeId] = useState(false);
  const [showInactiveLogins, setShowInactiveLogins] = useState(false);
  const [showLeftEmployees, setShowLeftEmployees] = useState(false);
  const [view, setView] = useState('employees'); // 'employees' | 'offerLinks'

  // docs modal
  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const [selectedEmployeeForDocs, setSelectedEmployeeForDocs] = useState(null);
  const [employeeDocuments, setEmployeeDocuments] = useState([]);
  const [docLoading, setDocLoading] = useState(false);

  // global
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [togglingStatus, setTogglingStatus] = useState(null);
  const [showBulkFormModal, setShowBulkFormModal] = useState(false);
  const [bulkFormTarget, setBulkFormTarget] = useState('on');
  const [bulkFormSelection, setBulkFormSelection] = useState([]);
  const [bulkFormLoading, setBulkFormLoading] = useState(false);
  const [bulkFormSearch, setBulkFormSearch] = useState('');

  const navigate = useNavigate();
  const { user } = useAuth();
  const { employeeUpdate, showNotification } = useNotification();

  useEffect(() => { fetchEmployees(); }, []);
  useEffect(() => { filterEmployees(); }, [searchTerm, profileFilter, activeTab, employees]);
  useEffect(() => { if (employeeUpdate) fetchEmployees(); }, [employeeUpdate]);

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      // This page's whole job is managing both Active and Inactive employees (its own tabs
      // filter is_active client-side below) — explicitly ask for everyone, since the backend
      // now defaults to active-only for every other caller of this endpoint.
      const response = await axios.get(API_ENDPOINTS.EMPLOYEES, { params: { active: 'all' } });
      const data = Array.isArray(response.data) ? response.data
        : Array.isArray(response.data?.data) ? response.data.data : [];
      setEmployees(data);
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load employees');
      showNotification(err.response?.data?.message || 'Failed to load employees', 'danger');
    } finally {
      setLoading(false);
    }
  };

  const filterEmployees = () => {
    let filtered = activeTab === 'inactive'
      ? employees.filter(e => e.is_active === false)
      : employees.filter(e => e.is_active !== false);

    if (profileFilter === 'completed') filtered = filtered.filter(e => e.profile_completed === true);
    if (profileFilter === 'incomplete') filtered = filtered.filter(e => e.profile_completed !== true);

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      filtered = filtered.filter(emp =>
        (emp.employee_id || '').toLowerCase().includes(q) ||
        (emp.first_name || '').toLowerCase().includes(q) ||
        (emp.last_name || '').toLowerCase().includes(q) ||
        `${emp.first_name || ''} ${emp.last_name || ''}`.toLowerCase().includes(q) ||
        (emp.middle_name || '').toLowerCase().includes(q) ||
        (emp.department || '').toLowerCase().includes(q) ||
        (emp.designation || '').toLowerCase().includes(q)
      );
    }
    setFilteredEmployees(filtered);
  };

  const fetchEmployeeDocuments = async (employee) => {
    try {
      setDocLoading(true);
      setSelectedEmployeeForDocs(employee);
      const response = await axios.get(API_ENDPOINTS.EMPLOYEE_DOCUMENTS(employee.employee_id));
      const docs = Object.entries(response.data)
        .filter(([, value]) => value && value !== 'null' && value !== '')
        .map(([key, value]) => ({
          type: key, filename: value,
          displayName: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          icon: getDocumentIcon(key, value),
        }));
      setEmployeeDocuments(docs);
      setShowDocumentModal(true);
    } catch (err) {
      showNotification(err.response?.data?.message || 'Failed to load documents', 'danger');
    } finally {
      setDocLoading(false);
    }
  };

  const getDocumentIcon = (type, filename) => {
    if (!filename) return <FaFileAlt className="text-secondary" size={20} />;
    const ext = filename.split('.').pop().toLowerCase();
    if (type.includes('image') || ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext))
      return <FaFileImage className="text-primary" size={20} />;
    if (ext === 'pdf') return <FaFilePdf className="text-danger" size={20} />;
    return <FaFileAlt className="text-secondary" size={20} />;
  };

  const handleViewDocument = async (doc) => {
    try {
      setDocLoading(true);
      const response = await axios.get(
        API_ENDPOINTS.EMPLOYEE_DOCUMENT_BY_TYPE(selectedEmployeeForDocs.employee_id, doc.type),
        { responseType: 'blob', params: { inline: true } }
      );
      const url = window.URL.createObjectURL(new Blob([response.data], { type: response.headers['content-type'] }));
      window.open(url, '_blank');
      setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    } catch (err) {
      showNotification('Failed to view document', 'danger');
    } finally {
      setDocLoading(false);
    }
  };

  const handleDownloadDocument = async (doc) => {
    try {
      setDocLoading(true);
      const response = await axios.get(
        API_ENDPOINTS.EMPLOYEE_DOCUMENT_BY_TYPE(selectedEmployeeForDocs.employee_id, doc.type),
        { responseType: 'blob' }
      );
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = window.document.createElement('a');
      link.href = url;
      link.setAttribute('download', doc.filename);
      window.document.body.appendChild(link);
      link.click();
      setTimeout(() => { window.URL.revokeObjectURL(url); window.document.body.removeChild(link); }, 100);
      showNotification('Document downloaded!', 'success');
    } catch {
      showNotification('Failed to download document', 'danger');
    } finally {
      setDocLoading(false);
    }
  };

  const handleToggleStatus = async (emp) => {
    const action = emp.is_active !== false ? 'Deactivate' : 'Activate';
    if (!window.confirm(`${action} account for ${emp.first_name} ${emp.last_name}?`)) return;
    setTogglingStatus(emp.id);
    try {
      const res = await axios.patch(API_ENDPOINTS.EMPLOYEE_TOGGLE_STATUS(emp.id));
      if (res.data.success) {
        setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, is_active: res.data.is_active } : e));
        showNotification(`${emp.first_name} ${emp.last_name} ${res.data.is_active ? 'activated' : 'deactivated'}`, res.data.is_active ? 'success' : 'warning');
      }
    } catch (err) {
      showNotification(err.response?.data?.message || 'Failed to update status', 'danger');
    } finally {
      setTogglingStatus(null);
    }
  };

  const toggleBulkSelection = (id) => {
    setBulkFormSelection(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
  };

  const selectAllVisibleBulk = () => {
    setBulkFormSelection(filteredEmployees.map(emp => emp.id));
  };

  const clearBulkSelection = () => {
    setBulkFormSelection([]);
  };

  const handleBulkProfileForm = async () => {
    if (!bulkFormSelection.length) {
      showNotification('Select at least one employee first.', 'warning');
      return;
    }

    setBulkFormLoading(true);
    try {
      const shouldRequire = bulkFormTarget === 'on';
      const selectedIds = bulkFormSelection;

      await Promise.all(selectedIds.map(async (id) => {
        const employee = employees.find(emp => emp.id === id);
        if (!employee) return;
        const currentValue = Boolean(employee.require_profile_completion);
        if (currentValue === shouldRequire) return;
        await axios.post(API_ENDPOINTS.EMPLOYEE_TOGGLE_PROFILE_FORM(id));
      }));

      setEmployees(prev => prev.map(emp => {
        if (!selectedIds.includes(emp.id)) return emp;
        const currentValue = Boolean(emp.require_profile_completion);
        if (currentValue === shouldRequire) return emp;
        return {
          ...emp,
          require_profile_completion: shouldRequire,
          profile_completed: shouldRequire ? false : emp.profile_completed,
        };
      }));

      showNotification(`${selectedIds.length} employee(s) updated successfully.`, 'success');
      setShowBulkFormModal(false);
      setBulkFormSelection([]);
      setBulkFormTarget('on');
    } catch (err) {
      showNotification(err.response?.data?.message || 'Failed to update profile form for selected employees.', 'danger');
    } finally {
      setBulkFormLoading(false);
    }
  };

  const modalEmployeeOptions = filteredEmployees.filter(emp => {
    const q = bulkFormSearch.toLowerCase().trim();
    if (!q) return true;
    const fullName = getFullName(emp).toLowerCase();
    return fullName.includes(q) || (emp.employee_id || '').toLowerCase().includes(q);
  });

  const selectedEmp = employees.find(e => e.id === selectedEmpId) || null;
  const activeCount = employees.filter(e => e.is_active !== false).length;
  const inactiveCount = employees.filter(e => e.is_active === false).length;

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <div style={{ textAlign: 'center' }}>
          <Spinner animation="border" variant="primary" style={{ width: 40, height: 40 }} />
          <p style={{ marginTop: 12, color: '#6b7280', fontSize: 13 }}>Loading employees...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="emp-mgmt-page" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: '#f8fafc' }}>
      <style>{EMP_RESPONSIVE_CSS}</style>

      {/* ── Page Header ── */}
      <div className="emp-mgmt-header" style={{
        padding: '14px 20px', borderBottom: '1px solid #e5e7eb', background: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <FaUsers size={18} color="#fff" />
          </div>
          <div>
            <h5 style={{ margin: 0, fontWeight: 800, fontSize: 17, color: '#111827' }}>Employee Management</h5>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6b7280' }}>Manage your organization and team</p>
          </div>
        </div>
        <div className="emp-mgmt-header-actions" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {error && <span style={{ fontSize: 11, color: '#ef4444' }}>{error}</span>}
          <select value={profileFilter} onChange={e => setProfileFilter(e.target.value)}
            style={{ fontSize: 12, fontWeight: 500, padding: '8px 14px', border: '1px solid #e5e7eb', borderRadius: 20, background: '#fff', color: '#374151', cursor: 'pointer' }}>
            <option value="all">All Profiles</option>
            <option value="completed">✅ Completed</option>
            <option value="incomplete">⚠️ Incomplete</option>
          </select>
          {(user?.role === 'admin' || user?.role === 'sub_admin' || user?.role === 'desktop_support' || user?.role === 'hr') && (
            <>
              <button onClick={() => setShowGenLink(true)} style={{
                background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', border: 'none', borderRadius: 20,
                padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <FaLink size={11} /> Offer Link
              </button>
              <button onClick={() => { setBulkFormSelection([]); setBulkFormTarget('on'); setShowBulkFormModal(true); }} style={{
                background: '#0f766e', color: '#fff', border: 'none', borderRadius: 20,
                padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <FaUsers size={11} /> Form
              </button>
              <button onClick={() => navigate('/admin/add-employee')} style={{
                background: '#111827', color: '#fff', border: 'none', borderRadius: 20,
                padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <FaPlus size={11} /> Add Employee
              </button>
            </>
          )}
          {user?.role === 'admin' && (
            <button onClick={() => setShowChangeId(true)} style={{
              background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 20,
              padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <FaIdCard size={11} /> Employee ID
            </button>
          )}
          {(user?.role === 'admin' || user?.role === 'sub_admin' || user?.role === 'desktop_support' || user?.role === 'hr') && (
            <button onClick={() => setShowInactiveLogins(true)} style={{
              background: '#d97706', color: '#fff', border: 'none', borderRadius: 20,
              padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <FaUserClock size={11} /> Inactive Logins
            </button>
          )}
          {(user?.role === 'admin' || user?.role === 'hr') && (
            <button onClick={() => setShowLeftEmployees(true)} style={{
              background: '#dc2626', color: '#fff', border: 'none', borderRadius: 20,
              padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <FaDoorOpen size={11} /> Left the Team
            </button>
          )}
          <button onClick={fetchEmployees} title="Refresh" style={{ border: '1px solid #e5e7eb', background: '#fff', borderRadius: '50%', width: 34, height: 34, cursor: 'pointer', color: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <FaSyncAlt size={13} />
          </button>
          <button onClick={() => navigate(-1)} style={{ border: '1px solid #e5e7eb', background: '#fff', borderRadius: 20, padding: '8px 16px', cursor: 'pointer', color: '#374151', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600 }}>
            <FaArrowLeft size={11} /> Back
          </button>
        </div>
      </div>

      {/* ── View Toggle ── */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', background: '#fff', flexShrink: 0 }}>
        {[
          { key: 'employees', label: 'Employees' },
          { key: 'offerLinks', label: 'Offer Links' },
        ].map(v => (
          <button key={v.key} onClick={() => setView(v.key)} style={{ padding: '8px 18px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: view === v.key ? 700 : 500, color: view === v.key ? '#6366f1' : '#6b7280', borderBottom: view === v.key ? '2px solid #6366f1' : '2px solid transparent' }}>
            {v.label}
          </button>
        ))}
      </div>

      {/* ── Offer Links View ── */}
      <div style={{ flex: 1, display: view === 'offerLinks' ? 'flex' : 'none', overflow: 'hidden' }}>
        <OfferLinksManager />
      </div>

      {/* ── Split Pane ── */}
      <div className={`emp-split-pane${selectedEmpId ? ' emp-split-pane--detail-open' : ''}`} style={{ flex: 1, display: view === 'employees' ? 'flex' : 'none', overflow: 'hidden' }}>

        {/* ── Left Panel ── */}
        <div className="emp-left-panel" style={{ width: 290, flexShrink: 0, borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', background: '#fff', overflow: 'hidden' }}>

          {/* Search */}
          <div style={{ padding: '10px 10px 8px', borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
            <div style={{ position: 'relative' }}>
              <FaSearch size={11} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }} />
              <input
                type="text"
                placeholder="Search by name, ID, department..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{ width: '100%', padding: '7px 28px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 12, outline: 'none', background: '#f8fafc', boxSizing: 'border-box' }}
              />
              {searchTerm && (
                <button onClick={() => setSearchTerm('')} style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: 0, lineHeight: 1 }}>
                  <FaTimes size={10} />
                </button>
              )}
            </div>
          </div>

          {/* Active / Inactive tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
            {[
              { key: 'active', label: 'Active', count: activeCount, color: '#22c55e' },
              { key: 'inactive', label: 'Inactive', count: inactiveCount, color: '#ef4444' },
            ].map(t => (
              <button key={t.key} onClick={() => { setActiveTab(t.key); setSelectedEmpId(null); }} style={{
                flex: 1, border: 'none', background: 'transparent', padding: '7px 4px', fontSize: 12,
                fontWeight: activeTab === t.key ? 700 : 400,
                color: activeTab === t.key ? t.color : '#6b7280',
                borderBottom: activeTab === t.key ? `2.5px solid ${t.color}` : '2.5px solid transparent',
                cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              }}>
                {t.label}
                <span style={{ background: activeTab === t.key ? t.color : '#e2e8f0', color: activeTab === t.key ? '#fff' : '#6b7280', borderRadius: 10, padding: '0 6px', fontSize: 10, fontWeight: 700 }}>
                  {t.count}
                </span>
              </button>
            ))}
          </div>

          {/* Count hint */}
          <div style={{ padding: '4px 12px', fontSize: 10, color: '#9ca3af', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
            {filteredEmployees.length} employee{filteredEmployees.length !== 1 ? 's' : ''}{searchTerm ? ` matching "${searchTerm}"` : ''}
          </div>

          {/* Scrollable employee list */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filteredEmployees.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 16px', color: '#9ca3af' }}>
                <FaUsers size={30} style={{ marginBottom: 8, opacity: 0.4 }} />
                <div style={{ fontSize: 12 }}>{searchTerm ? 'No employees found' : `No ${activeTab} employees`}</div>
              </div>
            ) : filteredEmployees.map(emp => (
              <EmpListItem
                key={emp.id}
                emp={emp}
                selected={selectedEmpId === emp.id}
                onClick={() => setSelectedEmpId(emp.id)}
              />
            ))}
          </div>

          {/* Build your dream team promo */}
          {(user?.role === 'admin' || user?.role === 'sub_admin' || user?.role === 'desktop_support' || user?.role === 'hr') && (
            <div style={{ margin: 10, padding: 16, borderRadius: 14, background: 'linear-gradient(135deg,#eef2ff,#f5f3ff)', border: '1px solid #e0e7ff', flexShrink: 0, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'relative', fontSize: 13, fontWeight: 800, color: '#111827', marginBottom: 4 }}>Build your dream team</div>
              <div style={{ position: 'relative', fontSize: 11, color: '#6b7280', marginBottom: 16, maxWidth: 165 }}>Invite new members and grow your organization</div>
              <button onClick={() => navigate('/admin/add-employee')} style={{ position: 'relative', background: '#fff', color: '#4f46e5', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
                <FaPlus size={10} /> Add Employee
              </button>
              <div style={{ position: 'absolute', right: -6, bottom: -10, display: 'flex', pointerEvents: 'none' }}>
                <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#a5b4fc', opacity: 0.7 }} />
                <div style={{ width: 46, height: 46, borderRadius: '50%', background: '#818cf8', marginLeft: -14, opacity: 0.85 }} />
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#c4b5fd', marginLeft: -12, marginTop: 18, opacity: 0.7 }} />
              </div>
            </div>
          )}
        </div>

        {/* ── Right Panel ── */}
        <div className="emp-right-panel" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {selectedEmp ? (
            <EmpQuickView
              key={selectedEmp.id}
              emp={selectedEmp}
              onClose={() => setSelectedEmpId(null)}
              navigate={navigate}
              user={user}
              onToggleStatus={handleToggleStatus}
              togglingStatus={togglingStatus}
              onViewDocs={fetchEmployeeDocuments}
            />
          ) : (
            <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', color: '#9ca3af', padding: 24, overflow: 'hidden' }}>
              {/* decorative dot grid */}
              <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(#c7d2fe 1.5px, transparent 1.5px)', backgroundSize: '22px 22px', opacity: 0.35, pointerEvents: 'none' }} />
              {/* decorative blobs */}
              <div style={{ position: 'absolute', top: -60, right: -60, width: 260, height: 260, borderRadius: '50%', background: 'radial-gradient(circle,#c4b5fd,transparent 70%)', filter: 'blur(10px)', opacity: 0.5, pointerEvents: 'none' }} />
              <div style={{ position: 'absolute', bottom: -80, left: -40, width: 220, height: 220, borderRadius: '50%', background: 'radial-gradient(circle,#a7f3d0,transparent 70%)', filter: 'blur(10px)', opacity: 0.4, pointerEvents: 'none' }} />

              <div style={{ position: 'relative', width: 96, height: 96, borderRadius: '50%', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20, boxShadow: '0 8px 24px rgba(99,102,241,0.25)' }}>
                <FaUser size={36} color="#fff" />
              </div>
              <div style={{ position: 'relative', fontSize: 18, fontWeight: 800, color: '#111827', marginBottom: 8 }}>Select an Employee</div>
              <div style={{ position: 'relative', fontSize: 13, color: '#6b7280', textAlign: 'center', maxWidth: 280, marginBottom: 28 }}>
                Click on any employee from the list on the left to view their profile details here.
              </div>
              <div style={{ position: 'relative', display: 'flex', background: '#fff', borderRadius: 14, boxShadow: '0 4px 20px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
                {[
                  { label: 'Active', value: activeCount, color: '#16a34a' },
                  { label: 'Inactive', value: inactiveCount, color: '#dc2626' },
                  { label: 'Total', value: employees.length, color: '#4f46e5' },
                ].map((s, i) => (
                  <div key={s.label} style={{ textAlign: 'center', padding: '16px 28px', borderLeft: i > 0 ? '1px solid #f1f5f9' : 'none' }}>
                    <div style={{ fontSize: 26, fontWeight: 800, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Generate Link Modal ── */}
      <GenerateLinkModal
        show={showGenLink}
        onHide={() => setShowGenLink(false)}
        onGenerated={() => {}}
      />

      <ChangeEmployeeIdModal
        show={showChangeId}
        onClose={() => setShowChangeId(false)}
        employees={employees}
        onSuccess={fetchEmployees}
      />

      <InactiveLoginsModal
        show={showInactiveLogins}
        onClose={() => setShowInactiveLogins(false)}
        employees={employees}
        onSuccess={fetchEmployees}
      />

      <LeftEmployeesModal
        show={showLeftEmployees}
        onClose={() => setShowLeftEmployees(false)}
        employees={employees}
        onSuccess={fetchEmployees}
      />

      {/* ── Bulk Profile Form Modal ── */}
      <Modal show={showBulkFormModal} onHide={() => setShowBulkFormModal(false)} size="lg" centered>
        <Modal.Header closeButton>
          <Modal.Title className="fw-semibold">Bulk profile form</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group className="mb-3">
            <Form.Label className="small fw-semibold">Action</Form.Label>
            <Form.Select value={bulkFormTarget} onChange={(e) => setBulkFormTarget(e.target.value)}>
              <option value="on">Require profile form</option>
              <option value="off">Stop requiring profile form</option>
            </Form.Select>
          </Form.Group>

          <div className="d-flex justify-content-between align-items-center mb-2">
            <div className="fw-semibold">Select employees</div>
            <div className="d-flex gap-2">
              <Button type="button" size="sm" variant="outline-secondary" onClick={selectAllVisibleBulk}>Select visible</Button>
              <Button type="button" size="sm" variant="outline-secondary" onClick={clearBulkSelection}>Clear</Button>
            </div>
          </div>

          <Form.Control
            size="sm"
            className="mb-2"
            placeholder="Search by name or employee ID"
            value={bulkFormSearch}
            onChange={(e) => setBulkFormSearch(e.target.value)}
          />

          <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 12, padding: 10, background: '#f8fafc' }}>
            {modalEmployeeOptions.length === 0 ? (
              <div className="text-muted small">No employees match your search.</div>
            ) : modalEmployeeOptions.map(emp => (
              <label key={emp.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: 'pointer' }}>
                <input type="checkbox" checked={bulkFormSelection.includes(emp.id)} onChange={() => toggleBulkSelection(emp.id)} />
                <span className="small fw-semibold">{getFullName(emp)} <span className="text-muted">({emp.employee_id})</span></span>
              </label>
            ))}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setShowBulkFormModal(false)}>Cancel</Button>
          <Button variant="primary" onClick={handleBulkProfileForm} disabled={bulkFormLoading}>
            {bulkFormLoading ? 'Updating...' : 'Apply'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ── Documents Modal ── */}
      <Modal show={showDocumentModal} onHide={() => setShowDocumentModal(false)} size="lg" centered>
        <Modal.Header closeButton className="bg-info text-white py-2">
          <Modal.Title as="h6" className="mb-0 small fw-semibold">
            <FaFileAlt className="me-2" size={14} />
            Documents: {selectedEmployeeForDocs?.first_name} {selectedEmployeeForDocs?.last_name}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="p-2 p-md-3">
          {docLoading ? (
            <div className="text-center py-4"><Spinner animation="border" variant="info" size="sm" /></div>
          ) : employeeDocuments.length > 0 ? (
            <div className="table-responsive">
              <Table striped hover size="sm" className="mb-0">
                <thead className="bg-light">
                  <tr>
                    <th className="small">Document Type</th>
                    <th className="small d-none d-sm-table-cell">File Name</th>
                    <th className="small text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {employeeDocuments.map((doc, i) => (
                    <tr key={i}>
                      <td><div className="d-flex align-items-center">{doc.icon}<span className="ms-2 small fw-semibold">{doc.displayName}</span></div></td>
                      <td className="d-none d-sm-table-cell"><small className="text-muted text-truncate d-block" style={{ maxWidth: 150 }}>{doc.filename}</small></td>
                      <td className="text-center">
                        <div className="d-flex gap-2 justify-content-center">
                          <Button variant="outline-info" size="sm" onClick={() => handleViewDocument(doc)}><FaEye size={12} className="me-1" /><span className="d-none d-sm-inline">View</span></Button>
                          <Button variant="outline-success" size="sm" onClick={() => handleDownloadDocument(doc)}><FaDownload size={12} className="me-1" /><span className="d-none d-sm-inline">Download</span></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-4">
              <FaFileAlt size={40} className="text-muted mb-3 opacity-50" />
              <p className="text-muted small mb-0">No documents found</p>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer className="py-2">
          <Button variant="secondary" size="sm" onClick={() => setShowDocumentModal(false)}>Close</Button>
        </Modal.Footer>
      </Modal>

    </div>
  );
};

export default EmployeeList;
