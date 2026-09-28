import DashboardNotice from '../Common/DashboardNotice';
// src/components/Manager/Dashboard.jsx
import React, { useState, useEffect } from 'react';
import {
  FaUsers, FaCalendarAlt, FaClock, FaUserTie, FaArrowRight,
  FaSyncAlt, FaCheckCircle, FaTimesCircle, FaHourglassHalf,
  FaChartPie, FaChartBar, FaSignInAlt, FaSignOutAlt, FaExclamationTriangle, FaStar, FaRegStar, FaStarHalfAlt,
} from 'react-icons/fa';
import DistributionChart from './DistributionChart';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';
import BreakWidget from '../Common/BreakWidget';
import TeamBreakDashboard from '../Common/TeamBreakDashboard';
import DashboardQuickAccess from '../Common/DashboardQuickAccess';
import WelcomeBanner from '../Common/WelcomeBanner';
import '../Employee/EmployeeDashboard.css';
import './Dashboard.css';
import '../Common/RoleDashboardCards.css';
import TicketSummaryWidget from '../Common/TicketSummaryWidget';
import { loadDashboardCache, saveDashboardCache } from '../../utils/dashboardCache';


const fmt = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const AVATAR_BG = ['#334155','#52718c','#7593ab','#9aafbf','#bac8d3','#466178','#657d90','#879bab'];
const avatarColor = (str) => AVATAR_BG[((str || '').charCodeAt(0) || 0) % AVATAR_BG.length];
const initials = (f, l) => ((f || '')[0] || '') + ((l || '')[0] || '');

const STAT_PALETTES = {
  blue:  { grad: 'linear-gradient(135deg,#3B82F6,#2563EB)', border: '#1D4ED8', shadow: '#BFDBFE' },
  amber: { grad: 'linear-gradient(135deg,#F97316,#EA580C)', border: '#C2410C', shadow: '#FED7AA' },
  green: { grad: 'linear-gradient(135deg,#22C55E,#16A34A)', border: '#15803D', shadow: '#BBF7D0' },
  red:   { grad: 'linear-gradient(135deg,#EF4444,#DC2626)', border: '#B91C1C', shadow: '#FECACA' },
};


// Mobile-only layout fix — desktop/tablet (>576px) is untouched. The leave-type legend
// grid forces a fixed 3-column layout via inline style, which is too cramped on a phone.
const MANAGER_DASH_MOBILE_CSS = `
  @media (max-width: 576px) {
    .dash-legend-grid { grid-template-columns: 1fr !important; }
  }
`;

const StatCard = ({ label, value, icon, pal, loading, onClick }) => (
  <div
    className="manager-stat-card"
    onClick={onClick}
    style={{
      background: '#fff',
      borderRadius: 12,
      boxShadow: '0 1px 3px rgba(0,0,0,.06),0 2px 8px rgba(0,0,0,.05)',
      padding: '20px 22px',
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      height: '100%',
      cursor: onClick ? 'pointer' : 'default',
      transition: 'box-shadow 0.15s, transform 0.15s',
    }}
    onMouseEnter={e => { if (onClick) { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,.12)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}}
    onMouseLeave={e => { if (onClick) { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,.06),0 2px 8px rgba(0,0,0,.05)'; e.currentTarget.style.transform = 'translateY(0)'; }}}
  >
    <div style={{
      width: 46, height: 46, borderRadius: 12,
      background: '#f1f5f9',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <span style={{ color: '#475569', fontSize: 18 }}>{icon}</span>
    </div>
    <div>
      <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 5 }}>{label}</div>
      {loading
        ? <div style={{ width: 48, height: 28, background: '#F1F5F9', borderRadius: 6 }} />
        : <div style={{ fontSize: 28, fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>{value}</div>
      }
    </div>
  </div>
);

const SectionCard = ({ children, style }) => (
  <div className="manager-section-card" style={{
    background: '#fff',
    borderRadius: 16,
    boxShadow: '0 1px 3px rgba(0,0,0,.06),0 4px 20px rgba(0,0,0,.07)',
    overflow: 'hidden',
    height: '100%',
    ...style,
  }}>
    {children}
  </div>
);

const CardHead = ({ iconGrad, icon, title, subtitle, right }) => (
  <div className="manager-card-header role-card-header" style={{ padding: '18px 20px 14px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div className="role-heading-icon" style={{ width: 34, height: 34, borderRadius: 10, background: iconGrad, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </div>
      <div>
        <div style={{ fontWeight: 700, fontSize: 14, color: '#0F172A' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: '#94A3B8' }}>{subtitle}</div>}
      </div>
    </div>
    {right}
  </div>
);

const NavBtn = ({ onClick, bg, color, children }) => (
  <button className="role-card-action" onClick={onClick} style={{ background: bg, border: 'none', color, borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
    {children}
  </button>
);

const AvatarCircle = ({ first, last }) => (
  <div style={{ width: 38, height: 38, borderRadius: '50%', background: avatarColor(first), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fff', fontSize: 13, fontWeight: 700, textTransform: 'uppercase' }}>
    {initials(first, last)}
  </div>
);

const SpinRing = ({ color }) => (
  <div style={{ width: 30, height: 30, border: '3px solid #E2E8F0', borderTopColor: color || '#3B82F6', borderRadius: '50%', animation: 'mgrspin 0.8s linear infinite' }} />
);

const ManagerDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [team, setTeam] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [perfStats, setPerfStats] = useState(null);
  const [myRatingAvg, setMyRatingAvg] = useState(null);
  const [hoveredAction, setHoveredAction] = useState(null);

  // Clock in/out state
  const [attendance, setAttendance] = useState(null);
  const [activeSession, setActiveSession] = useState(null);
  const [clockLoading, setClockLoading] = useState(false);
  const [dataMessage, setDataMessage] = useState({ type: '', text: '' });
  const [clockMessage, setClockMessage] = useState({ type: '', text: '' });
  const [showClockOutConfirm, setShowClockOutConfirm] = useState(false);
  const [clockOutPreview, setClockOutPreview] = useState(null);

  // Fetches "what would my status be if I clocked out right now" before showing the confirm
  // popup, so the popup can warn about an incomplete shift instead of a bare "are you sure".
  const openClockOutConfirm = async () => {
    setShowClockOutConfirm(true);
    setClockOutPreview(null);
    try {
      const res = await axios.get(API_ENDPOINTS.ATTENDANCE_CLOCK_OUT_PREVIEW(user?.employeeId));
      setClockOutPreview(res.data);
    } catch (err) {
      setClockOutPreview({ is_clocked_in: false }); // fall back to the plain confirm message on failure
    }
  };

  const STORAGE_KEY = `attendance_session_${user?.employeeId}`;
  const saveSession = (s) => localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  const clearSession = () => localStorage.removeItem(STORAGE_KEY);

  const nowIST = () => {
    const now = new Date();
    const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
    const p = (n) => String(n).padStart(2, '0');
    return `${ist.getUTCFullYear()}-${p(ist.getUTCMonth()+1)}-${p(ist.getUTCDate())} ${p(ist.getUTCHours())}:${p(ist.getUTCMinutes())}:${p(ist.getUTCSeconds())}`;
  };

  const formatTimeIST = (datetime) => {
    if (!datetime) return '--:--';
    try {
      let hourNum, minute;
      if (typeof datetime === 'string') {
        if (datetime.includes(' ') && !datetime.includes('T')) {
          const parts = datetime.split(' ')[1].split(':');
          hourNum = parseInt(parts[0], 10);
          minute = parts[1]?.padStart(2, '0') || '00';
        } else if (datetime.includes('T')) {
          const d = new Date(datetime);
          if (isNaN(d.getTime())) return '--:--';
          const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
          hourNum = ist.getUTCHours();
          minute = String(ist.getUTCMinutes()).padStart(2, '0');
        } else if (datetime.match(/^\d{2}:\d{2}:\d{2}$/)) {
          const parts = datetime.split(':');
          hourNum = parseInt(parts[0], 10);
          minute = parts[1];
        } else return '--:--';
      } else return '--:--';
      if (isNaN(hourNum)) return '--:--';
      const ampm = hourNum >= 12 ? 'PM' : 'AM';
      const h12 = hourNum % 12 === 0 ? 12 : hourNum % 12;
      return `${h12}:${minute} ${ampm}`;
    } catch { return '--:--'; }
  };

  const fetchTodayAttendance = async () => {
    if (!user?.employeeId) return;
    try {
      const res = await axios.get(API_ENDPOINTS.ATTENDANCE_TODAY(user.employeeId));
      const att = res.data.attendance;
      const serverSession = res.data.active_session;
      if (att) {
        att.clock_in = att.clock_in_ist || att.clock_in;
        att.clock_out = att.clock_out_ist || att.clock_out;
        if (att.clock_in) att.clock_in_display = formatTimeIST(att.clock_in);
        if (att.clock_out) att.clock_out_display = formatTimeIST(att.clock_out);
        setAttendance(att);
        if (serverSession) { setActiveSession(serverSession); saveSession(serverSession); }
        else if (att.clock_in && !att.clock_out) { setActiveSession({ session_id: att.session_id || 'inferred' }); }
        else { setActiveSession(null); clearSession(); }
      } else {
        setAttendance(null);
        if (!serverSession) { setActiveSession(null); clearSession(); }
      }
    } catch { /* silent */ }
  };

  const handleClockIn = async () => {
    setClockLoading(true);
    setClockMessage({ type: '', text: '' });
    try {
      const res = await axios.post(API_ENDPOINTS.ATTENDANCE_CLOCK_IN, {
        employee_id: user.employeeId, latitude: null, longitude: null, accuracy: null,
      });
      const t = res.data.clock_in_ist || res.data.clock_in;
      const att = {
        clock_in: t, clock_in_ist: t, clock_in_display: formatTimeIST(t),
        late_minutes: res.data.late_minutes || 0,
        late_display: res.data.late_display || null,
        status: 'working',
        attendance_date: res.data.attendance_date || nowIST().split(' ')[0],
        session_id: res.data.session_id,
      };
      setAttendance(att);
      const session = { session_id: res.data.session_id, clock_in_time: t };
      setActiveSession(session);
      saveSession(session);
      setClockMessage({ type: 'success', text: res.data.message || 'Clocked in successfully!' });
    } catch (err) {
      setClockMessage({ type: 'error', text: err.response?.data?.message || 'Failed to clock in' });
    } finally { setClockLoading(false); }
  };

  const handleClockOut = async () => {
    setClockLoading(true);
    setClockMessage({ type: '', text: '' });
    try {
      // No pre-check GET before this — attendanceController.clockOut already resolves the
      // real active session from the DB itself (ignoring a stale frontend session_id), so
      // sending whatever's in local state and letting the backend validate it is just as
      // safe and saves a full round-trip on every clock-out.
      const res = await axios.post(API_ENDPOINTS.ATTENDANCE_CLOCK_OUT, {
        employee_id: user.employeeId, session_id: activeSession?.session_id || null,
        latitude: null, longitude: null, accuracy: null,
      });
      const t = res.data.clock_out_ist || res.data.clock_out;
      setAttendance(prev => ({
        ...prev, clock_out: t,
        clock_out_display: formatTimeIST(t),
        total_hours_display: res.data.total_hours_display,
        status: res.data.status,
      }));
      setActiveSession(null);
      clearSession();
      setClockMessage({ type: 'success', text: res.data.message || 'Clocked out successfully!' });
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to clock out';
      if (message.includes('No active session') || err.response?.data?.already_clocked_out) {
        // Stale local session state (e.g. already clocked out from another tab/device) —
        // reset silently instead of showing an error, matching the old pre-check's behavior.
        setActiveSession(null);
        clearSession();
        fetchTodayAttendance();
      } else {
        setClockMessage({ type: 'error', text: message });
      }
    } finally { setClockLoading(false); }
  };

  const fetchData = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const [teamRes, leavesRes] = await Promise.allSettled([
        axios.get(API_ENDPOINTS.MANAGER_TEAM),
        axios.get(API_ENDPOINTS.LEAVES + '?reporting_manager=true'),
      ]);
      const failed = [teamRes.status === 'rejected' && 'team members', leavesRes.status === 'rejected' && 'leave requests'].filter(Boolean);
      setDataMessage({ type: 'warning', text: failed.length ? 'Unable to refresh ' + failed.join(' and ') + '. Displayed data may be incomplete or outdated. Please refresh to retry.' : '' });
      if (teamRes.status === 'fulfilled')  setTeam(teamRes.value.data?.team || []);
      if (leavesRes.status === 'fulfilled') setLeaveRequests(leavesRes.value.data || []);
    } catch { /* allSettled handles individual errors */ }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!user?.employeeId) { fetchData(); fetchTodayAttendance(); return; }

    // Instant paint from the last-known snapshot — fetchData below still runs regardless,
    // just without blocking the stat cards/charts on the network round-trip first.
    const cached = loadDashboardCache(user.employeeId, 'manager');
    if (cached) {
      if (cached.team !== undefined) setTeam(cached.team);
      if (cached.leaveRequests !== undefined) setLeaveRequests(cached.leaveRequests);
      if (cached.perfStats !== undefined) setPerfStats(cached.perfStats);
      if (cached.myRatingAvg !== undefined) setMyRatingAvg(cached.myRatingAvg);
      setLoading(false);
    }

    fetchData({ silent: !!cached });
    fetchTodayAttendance();
    axios.get(API_ENDPOINTS.PERFORMANCE_TEAM_STATS)
      .then(r => { if (r.data.success) setPerfStats(r.data.stats); })
      .catch(() => {});
    axios.get(`${API_ENDPOINTS.RATINGS}/employee/${user.employeeId}/history`)
      .then(r => {
        if (!r.data.success) return;
        const aC = r.data.total_admin_ratings   || 0;
        const mC = r.data.total_manager_ratings || 0;
        const aA = parseFloat(r.data.admin_average   || 0);
        const mA = parseFloat(r.data.manager_average || 0);
        if (aC + mC === 0) return;
        const overall = ((aA * aC) + (mA * mC)) / (aC + mC);
        setMyRatingAvg(overall.toFixed(1));
      })
      .catch(() => {});
  }, []);

  // Snapshot on every change so the next mount/login paints instantly from it.
  useEffect(() => {
    if (!user?.employeeId || team.length === 0) return;
    saveDashboardCache(user.employeeId, 'manager', { team, leaveRequests, perfStats, myRatingAvg });
  }, [user?.employeeId, team, leaveRequests, perfStats, myRatingAvg]);

  const pendingLeaves  = leaveRequests.filter(l => l.status === 'pending');
  const approvedLeaves = leaveRequests.filter(l => l.status === 'approved');
  const rejectedLeaves = leaveRequests.filter(l => l.status === 'rejected');
  const totalLeaves    = leaveRequests.length;

  const designationMap = {};
  team.forEach(m => { const k = m.designation || 'Unspecified'; designationMap[k] = (designationMap[k] || 0) + 1; });
  const desigLabels = Object.keys(designationMap);
  const desigValues = Object.values(designationMap);
  const desigTotal  = desigValues.reduce((s, v) => s + v, 0);

  const leaveSegments = [
    { label: 'Pending',  value: pendingLeaves.length,  color: '#8097aa', bg: '#f8fafc', border: '#e5eaf0' },
    { label: 'Approved', value: approvedLeaves.length, color: '#365872', bg: '#f8fafc', border: '#e5eaf0' },
    { label: 'Rejected', value: rejectedLeaves.length, color: '#bcc9d3', bg: '#f8fafc', border: '#e5eaf0' },
  ];

  const renderStars = (rating) => {
    const full = Math.floor(rating);
    const half = rating % 1 >= 0.5;
    return [1,2,3,4,5].map(i => {
      if (i <= full) return <FaStar key={i} size={14} className="me-1 text-warning" />;
      if (i === full + 1 && half) return <FaStarHalfAlt key={i} size={14} className="me-1 text-warning" />;
      return <FaRegStar key={i} size={14} className="me-1 text-secondary" />;
    });
  };

  const quickActions = [
    { label: 'My Team',         desc: 'View all team members',    icon: <FaUsers size={20} />,       pal: STAT_PALETTES.blue,  path: '/manager/panel' },
    { label: 'Leave Approvals', desc: 'Approve or reject leaves', icon: <FaCalendarAlt size={20} />, pal: STAT_PALETTES.green, path: '/manager/panel' },
    { label: 'Attendance',      desc: 'View attendance records',  icon: <FaClock size={20} />,       pal: STAT_PALETTES.amber, path: '/attendance' },
  ];

  // Same "currently clocked in" rule AttendanceCard.jsx uses (hasOpen) — kept in sync so the
  // banner's separate Clock In/Clock Out buttons never disagree with the Time Today card below.
  const isClockedInToday = !!activeSession || (!!attendance?.clock_in && !attendance?.clock_out);

  return (
    <div className="hrms-role-dashboard hrms-manager-dashboard p-2 p-md-3 p-lg-4">
      <style>{MANAGER_DASH_MOBILE_CSS}</style>

      <WelcomeBanner
        name={user?.name || user?.employeeId}
        roleLabel="TL Dashboard"
        onRefresh={fetchData}
        refreshing={loading}
        belowActions={
          <>
            <button
              onClick={handleClockIn}
              disabled={clockLoading || isClockedInToday}
              title="Clock In"
              style={{
                display: 'flex', alignItems: 'center', gap: 7, border: 'none', borderRadius: 22,
                padding: '10px 18px', fontSize: 13.5, fontWeight: 700,
                background: isClockedInToday ? 'rgba(255,255,255,0.15)' : '#fff',
                color: isClockedInToday ? 'rgba(255,255,255,0.6)' : '#065f46',
                cursor: (clockLoading || isClockedInToday) ? 'not-allowed' : 'pointer',
                opacity: clockLoading ? 0.7 : 1,
              }}
            >
              <FaSignInAlt size={14} /> Clock In
            </button>
            <button
              onClick={openClockOutConfirm}
              disabled={clockLoading || !isClockedInToday}
              title="Clock Out"
              style={{
                display: 'flex', alignItems: 'center', gap: 7, border: 'none', borderRadius: 22,
                padding: '10px 18px', fontSize: 13.5, fontWeight: 700,
                background: !isClockedInToday ? 'rgba(255,255,255,0.15)' : '#fff',
                color: !isClockedInToday ? 'rgba(255,255,255,0.6)' : '#b45309',
                cursor: (clockLoading || !isClockedInToday) ? 'not-allowed' : 'pointer',
                opacity: clockLoading ? 0.7 : 1,
              }}
            >
              <FaSignOutAlt size={14} /> Clock Out
            </button>
          </>
        }
      />

      <DashboardNotice type={dataMessage.type} text={dataMessage.text} onClose={() => setDataMessage({ type: '', text: '' })} />
      <DashboardNotice type={clockMessage.type} text={clockMessage.text} onClose={() => setClockMessage({ type: '', text: '' })} />

      <DashboardQuickAccess
        employeeId={user?.employeeId}
        onLeaveScope="team"
        attendance={attendance}
        activeSession={activeSession}
        onClockIn={handleClockIn}
        onRequestClockOut={openClockOutConfirm}
        clockLoading={clockLoading}
        hideClockToggle
        unlimitedBreaks={(user?.department || '').trim().toLowerCase() === 'sales'}
        footerExtra={
          <div style={{ display: 'flex', gap: 2 }}>
            {renderStars(myRatingAvg ? parseFloat(myRatingAvg) : 0)}
          </div>
        }
      />

      {/* Team break dashboard */}
      <TeamBreakDashboard />

      <TicketSummaryWidget />

      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%, 200px),1fr))', gap: 16, marginBottom: 28 }}>
        <StatCard label="Team Members"    value={team.length}           icon={<FaUsers />}         pal={STAT_PALETTES.blue}  loading={loading} onClick={() => navigate('/manager/panel')} />
        <StatCard label="Pending Leaves"  value={pendingLeaves.length}  icon={<FaHourglassHalf />} pal={STAT_PALETTES.amber} loading={loading} onClick={() => navigate('/manager/panel')} />
        <StatCard label="Approved Leaves" value={approvedLeaves.length} icon={<FaCheckCircle />}   pal={STAT_PALETTES.green} loading={loading} onClick={() => navigate('/manager/panel')} />
        <StatCard label="Rejected Leaves" value={rejectedLeaves.length} icon={<FaTimesCircle />}   pal={STAT_PALETTES.red}   loading={loading} onClick={() => navigate('/manager/panel')} />
        <StatCard label="Pending Reviews" value={perfStats?.pending ?? '—'}  icon={<FaStar />}        pal={STAT_PALETTES.amber} loading={loading} onClick={() => navigate('/performance/reviews')} />
        {/* <StatCard label="Reviews Done"    value={perfStats?.reviewed ?? '—'} icon={<FaCheckCircle />} pal={STAT_PALETTES.green} loading={loading} onClick={() => navigate('/performance/reviews')} /> */}
        <StatCard label="Avg Team Rating" value={perfStats?.avg_rating ? `${Number(perfStats.avg_rating).toFixed(1)}/5` : '—'} icon={<FaStar />} pal={STAT_PALETTES.blue} loading={loading} onClick={() => navigate('/performance/reviews')} />
      </div>

      {/* Matching horizontal charts keep labels and counts directly readable. */}
      <div className="manager-distribution-grid">
        <SectionCard>
          <CardHead icon={<FaChartBar size={15} />} title="Leave Request Status" subtitle="All-time breakdown" />
          <DistributionChart items={leaveSegments} total={totalLeaves} unit="leave requests" loading={loading} emptyText="No leave requests yet" />
        </SectionCard>
        <SectionCard>
          <CardHead icon={<FaUsers size={15} />} title="Team by Designation" subtitle="Members across your team" />
          <DistributionChart
            items={desigLabels.map((label, i) => ({ label, value: desigValues[i] })).sort((a, b) => b.value - a.value)}
            total={desigTotal} unit="team members" loading={loading} emptyText="No team members found"
          />
        </SectionCard>
      </div>
      {/* Team Members + Pending Leaves */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%, 320px),1fr))', gap: 16, marginBottom: 28 }}>

        {/* Team Members */}
        <SectionCard>
          <CardHead
            iconGrad="linear-gradient(135deg,#3B82F6,#2563EB)"
            icon={<FaUsers size={15} color="#fff" />}
            title="Team Members"
            subtitle={team.length + ' total'}
            right={<NavBtn onClick={() => navigate('/manager/panel')} bg="#EFF6FF" color="#1D4ED8">View All <FaArrowRight size={10} /></NavBtn>}
          />
          <div style={{ padding: '8px 0' }}>
            {loading
              ? <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><SpinRing /></div>
              : team.length === 0
                ? <div style={{ padding: '32px 20px', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>No team members assigned</div>
                : team.slice(0, 6).map((m, i) => (
                    <div className="role-person-row" key={m.employee_id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', borderBottom: i < Math.min(team.length, 6) - 1 ? '1px solid #F8FAFC' : 'none' }}>
                      <AvatarCircle first={m.first_name} last={m.last_name} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{m.first_name} {m.last_name}</div>
                        <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>{m.employee_id} · {m.designation || 'N/A'}</div>
                      </div>
                      <span style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #e5eaf0', borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {m.shift_timing || 'Default'}
                      </span>
                    </div>
                  ))
            }
            {team.length > 6 && <div style={{ padding: '10px 20px', fontSize: 12, color: '#64748B', textAlign: 'center' }}>+{team.length - 6} more members</div>}
          </div>
        </SectionCard>

        {/* Pending Leaves */}
        <SectionCard>
          <CardHead
            iconGrad="linear-gradient(135deg,#F97316,#EA580C)"
            icon={<FaHourglassHalf size={15} color="#fff" />}
            title={
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                Pending Approvals
                {!loading && pendingLeaves.length > 0 && (
                  <span style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #e5eaf0', borderRadius: 20, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>
                    {pendingLeaves.length}
                  </span>
                )}
              </span>
            }
            subtitle="Awaiting your action"
            right={<NavBtn onClick={() => navigate('/manager/panel')} bg="#F0FDF4" color="#15803D">Manage <FaArrowRight size={10} /></NavBtn>}
          />
          <div style={{ padding: '8px 0' }}>
            {loading
              ? <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><SpinRing color="#F97316" /></div>
              : pendingLeaves.length === 0
                ? <div style={{ padding: '32px 20px', textAlign: 'center' }}>
                    <FaCheckCircle size={32} color="#22C55E" style={{ opacity: 0.8, display: 'block', margin: '0 auto 10px' }} />
                    <div style={{ fontSize: 13, color: '#94A3B8' }}>All caught up! No pending approvals.</div>
                  </div>
                : pendingLeaves.slice(0, 6).map((l, i) => (
                    <div className="role-person-row" key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', borderBottom: i < Math.min(pendingLeaves.length, 6) - 1 ? '1px solid #F8FAFC' : 'none' }}>
                      <AvatarCircle first={l.first_name} last={l.last_name} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{l.first_name} {l.last_name}</div>
                        <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>{l.employee_id} · {fmt(l.start_date)}</div>
                      </div>
                      <span style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #e5eaf0', borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 600, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
                        {l.leave_type || 'Leave'}
                      </span>
                    </div>
                  ))
            }
            {pendingLeaves.length > 6 && <div style={{ padding: '10px 20px', fontSize: 12, color: '#64748B', textAlign: 'center' }}>+{pendingLeaves.length - 6} more pending</div>}
          </div>
        </SectionCard>
      </div>

      {/* Quick Actions */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 14 }}>Quick Actions</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%, 200px),1fr))', gap: 16 }}>
          {quickActions.map(({ label, desc, icon, pal, path }) => (
            <div
              className="role-quick-action"
              key={label}
              role="button"
              tabIndex={0}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(path); } }}
              onClick={() => navigate(path)}
              onMouseEnter={() => setHoveredAction(label)}
              onMouseLeave={() => setHoveredAction(null)}
              style={{
                background: '#fff',
                borderRadius: 16,
                boxShadow: hoveredAction === label ? '0 8px 32px rgba(0,0,0,.12)' : '0 1px 3px rgba(0,0,0,.06),0 4px 16px rgba(0,0,0,.06)',
                padding: '22px',
                cursor: 'pointer',
                transition: 'transform .2s,box-shadow .2s',
                transform: hoveredAction === label ? 'translateY(-3px)' : 'none',
              }}
            >
              <div style={{ width: 48, height: 48, borderRadius: 14, background: pal.grad, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                <span style={{ color: '#fff' }}>{icon}</span>
              </div>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#0F172A', marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 16 }}>{desc}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#475569' }}>
                Go to {label} <FaArrowRight size={10} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <style>{'@keyframes mgrspin { to { transform: rotate(360deg); } }'}</style>

      {showClockOutConfirm && (() => {
        if (clockOutPreview === null) {
          return (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ background: '#fff', borderRadius: 18, padding: '32px 28px', boxShadow: '0 24px 64px rgba(0,0,0,0.22)', textAlign: 'center', maxWidth: 340, width: '90%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <SpinRing />
                <div style={{ color: '#6b7280', fontSize: 14, marginTop: 14 }}>Checking your hours worked…</div>
              </div>
            </div>
          );
        }
        const willBeHalfDay = clockOutPreview.is_clocked_in && clockOutPreview.status_if_clocked_out_now !== 'present';
        return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: willBeHalfDay ? '#fff7ed' : '#fff0ec', border: willBeHalfDay ? '1px solid #fb923c' : '1px solid #fdb8a0', borderRadius: 18, padding: '32px 28px', boxShadow: '0 24px 64px rgba(0,0,0,0.22)', textAlign: 'center', maxWidth: 340, width: '90%' }}>
            <div style={{ fontSize: 44, marginBottom: 10 }}>{willBeHalfDay ? '⚠️' : '🕐'}</div>
            <div style={{ fontWeight: 700, fontSize: 18, color: '#111827', marginBottom: 8 }}>
              {willBeHalfDay ? 'Shift not complete yet' : 'Clock Out?'}
            </div>
            <div style={{ color: '#6b7280', fontSize: 14, marginBottom: 24 }}>
              {willBeHalfDay ? (
                <>
                  You've worked <strong>{clockOutPreview.total_hours_display}</strong> so far — a{' '}
                  <strong>Half Day</strong> will get marked. Please complete{' '}
                  <strong>{clockOutPreview.remaining_display}</strong> more, or ask your TL for an
                  early clock-out to be marked Present.
                  <div style={{ marginTop: 10, fontSize: 13 }}>If you still clock out now, you'll be marked <strong>Half Day</strong>.</div>
                </>
              ) : (
                'Are you sure you want to clock out?'
              )}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => { setShowClockOutConfirm(false); handleClockOut(); }}
                style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', background: willBeHalfDay ? '#ea580c' : '#f97316', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
              >
                {willBeHalfDay ? 'Clock Out Anyway' : 'Sure'}
              </button>
              <button
                onClick={() => setShowClockOutConfirm(false)}
                style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
};

export default ManagerDashboard;
