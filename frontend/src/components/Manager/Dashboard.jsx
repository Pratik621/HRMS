// src/components/Manager/Dashboard.jsx
import React, { useState, useEffect } from 'react';
import {
  FaUsers, FaCalendarAlt, FaClock, FaUserTie, FaArrowRight,
  FaSyncAlt, FaCheckCircle, FaTimesCircle, FaHourglassHalf,
  FaChartPie, FaChartBar, FaSignInAlt, FaSignOutAlt, FaExclamationTriangle, FaStar, FaRegStar, FaStarHalfAlt,
} from 'react-icons/fa';
import { Doughnut, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  Title, Tooltip, Legend, ArcElement,
} from 'chart.js';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';
import BreakWidget from '../Common/BreakWidget';
import TeamBreakDashboard from '../Common/TeamBreakDashboard';
import DashboardQuickAccess from '../Common/DashboardQuickAccess';
import WelcomeBanner from '../Common/WelcomeBanner';
import TicketSummaryWidget from '../Common/TicketSummaryWidget';
import { loadDashboardCache, saveDashboardCache } from '../../utils/dashboardCache';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement);

const fmt = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const AVATAR_BG = ['#3B82F6','#8B5CF6','#22C55E','#F97316','#EF4444','#0EA5E9','#EC4899','#14B8A6'];
const avatarColor = (str) => AVATAR_BG[((str || '').charCodeAt(0) || 0) % AVATAR_BG.length];
const initials = (f, l) => ((f || '')[0] || '') + ((l || '')[0] || '');

const STAT_PALETTES = {
  blue:  { grad: 'linear-gradient(135deg,#3B82F6,#2563EB)', border: '#1D4ED8', shadow: '#BFDBFE' },
  amber: { grad: 'linear-gradient(135deg,#F97316,#EA580C)', border: '#C2410C', shadow: '#FED7AA' },
  green: { grad: 'linear-gradient(135deg,#22C55E,#16A34A)', border: '#15803D', shadow: '#BBF7D0' },
  red:   { grad: 'linear-gradient(135deg,#EF4444,#DC2626)', border: '#B91C1C', shadow: '#FECACA' },
};

const DESIG_COLORS = ['#3B82F6','#8B5CF6','#22C55E','#F97316','#EF4444','#0EA5E9','#EC4899','#14B8A6'];

// Mobile-only layout fix — desktop/tablet (>576px) is untouched. The leave-type legend
// grid forces a fixed 3-column layout via inline style, which is too cramped on a phone.
const MANAGER_DASH_MOBILE_CSS = `
  @media (max-width: 576px) {
    .dash-legend-grid { grid-template-columns: 1fr !important; }
  }
`;

const StatCard = ({ label, value, icon, pal, loading, onClick }) => (
  <div
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
      background: pal.shadow,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <span style={{ color: pal.border, fontSize: 18 }}>{icon}</span>
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
  <div style={{
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
  <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 34, height: 34, borderRadius: 10, background: iconGrad, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
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
  <button onClick={onClick} style={{ background: bg, border: 'none', color, borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
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
  const [clockMessage, setClockMessage] = useState({ type: '', text: '' });
  const [showClockOutConfirm, setShowClockOutConfirm] = useState(false);

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
    { label: 'Pending',  value: pendingLeaves.length,  color: '#F97316', bg: '#FFF7ED', border: '#FED7AA' },
    { label: 'Approved', value: approvedLeaves.length, color: '#22C55E', bg: '#F0FDF4', border: '#BBF7D0' },
    { label: 'Rejected', value: rejectedLeaves.length, color: '#EF4444', bg: '#FEF2F2', border: '#FECACA' },
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

  const leavePct = (v) => totalLeaves > 0 ? ((v / totalLeaves) * 100).toFixed(1) : '0.0';
  const desigPct = (v) => desigTotal  > 0 ? ((v / desigTotal)  * 100).toFixed(0) : '0';

  const leaveChartData = {
    labels: leaveSegments.map(s => s.label),
    datasets: [{
      data: leaveSegments.map(s => s.value),
      backgroundColor: leaveSegments.map(s => s.color),
      borderWidth: 3,
      borderColor: '#ffffff',
      hoverBorderColor: '#ffffff',
      hoverBorderWidth: 4,
      hoverOffset: 14,
    }],
  };

  const desigChartData = {
    labels: desigLabels,
    datasets: [{
      data: desigValues,
      backgroundColor: desigLabels.map((_, i) => DESIG_COLORS[i % DESIG_COLORS.length]),
      borderWidth: 3,
      borderColor: '#ffffff',
      hoverOffset: 8,
    }],
  };

  const leaveCenterPlugin = {
    id: 'leaveCenterText',
    beforeDraw(chart) {
      if (chart.config.type !== 'doughnut') return;
      const { ctx, chartArea } = chart;
      if (!chartArea) return;
      const cx = (chartArea.left + chartArea.right) / 2;
      const cy = (chartArea.top + chartArea.bottom) / 2;
      ctx.save();
      ctx.font = 'bold 26px Inter,system-ui,sans-serif';
      ctx.fillStyle = '#0F172A';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(totalLeaves > 0 ? String(totalLeaves) : '—', cx, cy - 10);
      ctx.font = '500 9.5px Inter,system-ui,sans-serif';
      ctx.fillStyle = '#94A3B8';
      ctx.fillText('TOTAL', cx, cy + 8);
      ctx.fillText('REQUESTS', cx, cy + 20);
      ctx.restore();
    },
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
    <div style={{ background: '#F8FAFC', minHeight: '100vh', padding: '24px 20px' }}>
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
              onClick={() => setShowClockOutConfirm(true)}
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

      {clockMessage.text && (
        <div style={{
          fontSize: 12, fontWeight: 500, marginBottom: 16, padding: '8px 14px', borderRadius: 8,
          color: clockMessage.type === 'success' ? '#065f46' : '#991b1b',
          background: clockMessage.type === 'success' ? '#ecfdf5' : '#fef2f2',
          border: `1px solid ${clockMessage.type === 'success' ? '#a7f3d0' : '#fecaca'}`,
        }}>
          {clockMessage.text}
        </div>
      )}

      <DashboardQuickAccess
        employeeId={user?.employeeId}
        onLeaveScope="team"
        attendance={attendance}
        activeSession={activeSession}
        onClockIn={handleClockIn}
        onRequestClockOut={() => setShowClockOutConfirm(true)}
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 16, marginBottom: 28 }}>
        <StatCard label="Team Members"    value={team.length}           icon={<FaUsers />}         pal={STAT_PALETTES.blue}  loading={loading} onClick={() => navigate('/manager/panel')} />
        <StatCard label="Pending Leaves"  value={pendingLeaves.length}  icon={<FaHourglassHalf />} pal={STAT_PALETTES.amber} loading={loading} onClick={() => navigate('/manager/panel')} />
        <StatCard label="Approved Leaves" value={approvedLeaves.length} icon={<FaCheckCircle />}   pal={STAT_PALETTES.green} loading={loading} onClick={() => navigate('/manager/panel')} />
        <StatCard label="Rejected Leaves" value={rejectedLeaves.length} icon={<FaTimesCircle />}   pal={STAT_PALETTES.red}   loading={loading} onClick={() => navigate('/manager/panel')} />
        <StatCard label="Pending Reviews" value={perfStats?.pending ?? '—'}  icon={<FaStar />}        pal={STAT_PALETTES.amber} loading={loading} onClick={() => navigate('/performance/reviews')} />
        {/* <StatCard label="Reviews Done"    value={perfStats?.reviewed ?? '—'} icon={<FaCheckCircle />} pal={STAT_PALETTES.green} loading={loading} onClick={() => navigate('/performance/reviews')} /> */}
        <StatCard label="Avg Team Rating" value={perfStats?.avg_rating ? `${Number(perfStats.avg_rating).toFixed(1)}/5` : '—'} icon={<FaStar />} pal={STAT_PALETTES.blue} loading={loading} onClick={() => navigate('/performance/reviews')} />
      </div>

      {/* Charts Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 16, marginBottom: 28 }}>

        {/* Leave Request Status */}
        <SectionCard>
          <CardHead
            iconGrad="linear-gradient(135deg,#F97316,#EA580C)"
            icon={<FaChartPie size={15} color="#fff" />}
            title="Leave Request Status"
            subtitle="All-time breakdown"
          />
          <div style={{ padding: '20px 20px 0' }}>
            {loading ? (
              <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <SpinRing color="#F97316" />
              </div>
            ) : totalLeaves === 0 ? (
              <div style={{ height: 220, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#94A3B8' }}>
                <FaCalendarAlt size={28} style={{ opacity: 0.4 }} />
                <small>No leave requests yet</small>
              </div>
            ) : (
              /* Centered doughnut — same style as admin */
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
                <div style={{ width: 220, height: 220 }}>
                  <Doughnut
                    data={leaveChartData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      animation: { duration: 1000, easing: 'easeInOutQuart', animateRotate: true, animateScale: false },
                      cutout: '55%',
                      plugins: {
                        legend: { display: false },
                        tooltip: {
                          backgroundColor: 'rgba(15,23,42,0.93)',
                          titleColor: '#f8fafc',
                          bodyColor: '#cbd5e1',
                          borderColor: 'rgba(255,255,255,0.08)',
                          borderWidth: 1,
                          padding: { top: 10, bottom: 10, left: 14, right: 14 },
                          cornerRadius: 10,
                          displayColors: true,
                          boxWidth: 8, boxHeight: 8, boxPadding: 5,
                          callbacks: {
                            title: (items) => items[0]?.label,
                            label: (ctx) => ` ${ctx.raw} requests · ${leavePct(ctx.raw)}%`,
                          },
                        },
                      },
                      elements: { arc: { borderRadius: 4 } },
                    }}
                    plugins={[leaveCenterPlugin]}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Badge-style legend — same flex+baseline layout as admin */}
          {!loading && totalLeaves > 0 && (
            <div className="dash-legend-grid" style={{ padding: '0 20px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {leaveSegments.map(seg => (
                <div
                  key={seg.label}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 12px',
                    background: seg.bg,
                    borderRadius: 10,
                    border: `1px solid ${seg.border}`,
                    cursor: 'default',
                    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 6px 16px ' + seg.color + '30';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: seg.color, flexShrink: 0,
                    boxShadow: '0 0 0 3px ' + seg.color + '30',
                  }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 10.5, color: '#6b7280', fontWeight: 500 }}>{seg.label}</div>
                    {/* flex+baseline keeps count and % visually separate */}
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, marginTop: 1 }}>
                      <span style={{ fontSize: 18, fontWeight: 700, color: '#111827', lineHeight: 1 }}>
                        {seg.value}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: seg.color }}>
                        {leavePct(seg.value)}%
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Footer */}
          {!loading && (
            <div style={{
              margin: '0 20px 20px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 16px',
              background: 'linear-gradient(135deg,#f8fafc,#f1f5f9)',
              borderRadius: 10,
              border: '1px solid #e2e8f0',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <FaCalendarAlt size={12} color="#64748b" />
                <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>Total Leave Requests</span>
              </div>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>{totalLeaves}</span>
            </div>
          )}
        </SectionCard>

        {/* Team by Designation */}
        <SectionCard>
          <CardHead
            iconGrad="linear-gradient(135deg,#3B82F6,#2563EB)"
            icon={<FaChartBar size={15} color="#fff" />}
            title="Team by Designation"
            subtitle="Member distribution"
            right={
              <span style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1D4ED8', borderRadius: 20, padding: '3px 12px', fontSize: 12, fontWeight: 700 }}>
                {team.length} members
              </span>
            }
          />
          <div style={{ padding: '16px 20px 20px' }}>
            {loading ? (
              <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <SpinRing />
              </div>
            ) : team.length === 0 ? (
              <div style={{ height: 260, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#94A3B8' }}>
                <FaUsers size={28} style={{ opacity: 0.4 }} />
                <small>No team members found</small>
              </div>
            ) : (
              /* Doughnut + progress bars — matches admin dept distribution */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <div style={{ width: 180, height: 180 }}>
                    <Doughnut
                      data={desigChartData}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        animation: { duration: 700, easing: 'easeInOutQuart' },
                        cutout: '52%',
                        plugins: {
                          legend: { display: false },
                          tooltip: {
                            backgroundColor: 'rgba(15,23,42,0.92)',
                            titleColor: '#f9fafb',
                            bodyColor: '#d1d5db',
                            padding: 10,
                            cornerRadius: 8,
                            callbacks: {
                              label: (ctx) => ` ${ctx.raw} members (${desigPct(ctx.raw)}%)`,
                            },
                          },
                        },
                      }}
                    />
                  </div>
                </div>

                {/* Progress-bar legend */}
                <div style={{ maxHeight: 200, overflowY: desigLabels.length > 5 ? 'auto' : 'visible' }}>
                  {desigLabels.map((label, i) => {
                    const val = desigValues[i];
                    const pct = desigPct(val);
                    const color = DESIG_COLORS[i % DESIG_COLORS.length];
                    return (
                      <div key={label} style={{ marginBottom: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 9, height: 9, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
                            <span style={{ fontSize: 12, color: '#374151', fontWeight: 500 }}>{label}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color }}>{val}</span>
                            <span style={{ fontSize: 11, color: '#9ca3af', background: '#f3f4f6', borderRadius: 10, padding: '1px 6px' }}>{pct}%</span>
                          </div>
                        </div>
                        <div style={{ height: 5, borderRadius: 99, background: '#f3f4f6', overflow: 'hidden' }}>
                          <div style={{
                            height: '100%', borderRadius: 99,
                            background: color,
                            width: `${Math.max(parseFloat(pct), val > 0 ? 3 : 0)}%`,
                            transition: 'width 0.7s ease',
                          }} />
                        </div>
                      </div>
                    );
                  })}
                  {desigLabels.length > 0 && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: '#6b7280' }}>Total members:</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{desigTotal}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </SectionCard>
      </div>

      {/* Team Members + Pending Leaves */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 16, marginBottom: 28 }}>

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
                    <div key={m.employee_id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', borderBottom: i < Math.min(team.length, 6) - 1 ? '1px solid #F8FAFC' : 'none' }}>
                      <AvatarCircle first={m.first_name} last={m.last_name} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{m.first_name} {m.last_name}</div>
                        <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>{m.employee_id} · {m.designation || 'N/A'}</div>
                      </div>
                      <span style={{ background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0', borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
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
                  <span style={{ background: '#FFF7ED', color: '#C2410C', border: '1px solid #FED7AA', borderRadius: 20, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>
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
                    <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', borderBottom: i < Math.min(pendingLeaves.length, 6) - 1 ? '1px solid #F8FAFC' : 'none' }}>
                      <AvatarCircle first={l.first_name} last={l.last_name} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{l.first_name} {l.last_name}</div>
                        <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>{l.employee_id} · {fmt(l.start_date)}</div>
                      </div>
                      <span style={{ background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 600, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 16 }}>
          {quickActions.map(({ label, desc, icon, pal, path }) => (
            <div
              key={label}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: pal.border }}>
                Go to {label} <FaArrowRight size={10} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <style>{'@keyframes mgrspin { to { transform: rotate(360deg); } }'}</style>

      {showClockOutConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff0ec', border: '1px solid #fdb8a0', borderRadius: 18, padding: '32px 28px', boxShadow: '0 24px 64px rgba(0,0,0,0.22)', textAlign: 'center', maxWidth: 320, width: '90%' }}>
            <div style={{ fontSize: 44, marginBottom: 10 }}>🕐</div>
            <div style={{ fontWeight: 700, fontSize: 18, color: '#111827', marginBottom: 8 }}>Clock Out?</div>
            <div style={{ color: '#6b7280', fontSize: 14, marginBottom: 24 }}>Are you sure you want to clock out?</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => { setShowClockOutConfirm(false); handleClockOut(); }}
                style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', background: '#f97316', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
              >
                Sure
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
      )}
    </div>
  );
};

export default ManagerDashboard;
