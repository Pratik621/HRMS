// src/components/Employee/Dashboard.jsx
import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Table, Badge, Spinner, Alert, Button, Modal, ButtonGroup, Form } from 'react-bootstrap';
import {
  FaUserCircle,
  FaCalendarAlt,
  FaClock,
  FaUmbrellaBeach,
  FaCheckCircle,
  FaTimesCircle,
  FaHourglassHalf,
  FaEye,
  FaChartLine,
  FaHistory,
  FaArrowRight,
  FaBell,
  FaTrophy,
  FaBirthdayCake,
  FaSyncAlt,
  FaChartBar,
  FaInfoCircle,
  FaSun,
  FaMoon,
  FaCloudSun,
  FaStar,
  FaStarHalfAlt,
  FaRegStar,
  FaLocationArrow,
  FaMapMarkerAlt,
  FaExclamationTriangle,
  FaUserTie,
  FaSignInAlt,
  FaSignOutAlt
} from 'react-icons/fa';


import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';
import { useMobileDevice } from '../../hooks/useMobileDevice';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';
import { useNavigate } from 'react-router-dom';
import { Bar, Doughnut } from 'react-chartjs-2';
import { holidays } from '../../data/holidays';
import EmployeeNotices from './EmployeeNotices';
import AnnouncementBanner from './AnnouncementBanner';
import ProfileCompletion from './ProfileCompletion';
import BreakWidget from '../Common/BreakWidget';
import DashboardQuickAccess from '../Common/DashboardQuickAccess';
import WelcomeBanner from '../Common/WelcomeBanner';
import { loadDashboardCache, saveDashboardCache } from '../../utils/dashboardCache';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  BarElement
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  BarElement
);

const EmployeeDashboard = () => {
  const { user } = useAuth();
  const { showNotification, fetchTodayEvents } = useNotification();
  const isMobileDevice = useMobileDevice();
  const navigate = useNavigate();
  // Attendance card state
  const [attendance, setAttendance] = useState(null);
  const [activeSession, setActiveSession] = useState(null);
  const [clockLoading, setClockLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [showClockOutConfirm, setShowClockOutConfirm] = useState(false);
  const [clockOutPreview, setClockOutPreview] = useState(null);
  const [networkBlocked, setNetworkBlocked] = useState(false);

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

  // Tickets the employee raised that the team has marked resolved and is now waiting on
  // THEM to confirm (status 'resolved_pending') — surfaced as a popup on dashboard load
  // instead of only showing up if they happen to click into /tickets on their own.
  const [pendingConfirmTickets, setPendingConfirmTickets] = useState([]);
  const [showTicketConfirmModal, setShowTicketConfirmModal] = useState(false);
  const [ticketActionLoading, setTicketActionLoading] = useState(false);
  const [ticketDeclineNote, setTicketDeclineNote] = useState('');
  const [showTicketDeclineInput, setShowTicketDeclineInput] = useState(false);

  const OFFICE_COORDS = { radius: 100 };
  const STORAGE_KEY = `attendance_session_${user?.employeeId}`;

  const saveSession = (s) => localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  const clearSession = () => localStorage.removeItem(STORAGE_KEY);

  const nowIST = () => {
    const now = new Date();
    const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
    const p = (n) => String(n).padStart(2, '0');
    return `${ist.getUTCFullYear()}-${p(ist.getUTCMonth()+1)}-${p(ist.getUTCDate())} ${p(ist.getUTCHours())}:${p(ist.getUTCMinutes())}:${p(ist.getUTCSeconds())}`;
  };

  // Housekeeper-only: proactively hide the clock in/out button (instead of letting them
  // click it and hit a 403) when the device isn't on an allowlisted network. Polled so a
  // Housekeeper who switches off office Wi-Fi mid-session sees the button disappear without
  // needing to refresh — see backend/utils/housekeeperNetworkGate.js for the server-side gate.
  useEffect(() => {
    if (user?.role !== 'housekeeper') return;

    let cancelled = false;
    const checkNetwork = async () => {
      try {
        await axios.get(API_ENDPOINTS.ATTENDANCE_NETWORK_STATUS);
        if (!cancelled) setNetworkBlocked(false);
      } catch (err) {
        if (cancelled) return;
        setNetworkBlocked(err.response?.data?.code === 'IP_BLOCKED');
      }
    };

    checkNetwork();
    const interval = setInterval(checkNetwork, 45000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [user?.role]);

  const formatTimeIST = (datetime) => {
    if (!datetime) return '--:--';
    try {
      let hourNum, minute;
      if (typeof datetime === 'string') {
        if (datetime.includes(' ') && !datetime.includes('T')) {
          const timePart = datetime.split(' ')[1];
          const parts = timePart.split(':');
          hourNum = parseInt(parts[0], 10);
          minute = parts[1] ? parts[1].padStart(2, '0') : '00';
        } else if (datetime.includes('T')) {
          const date = new Date(datetime);
          if (!isNaN(date.getTime())) {
            const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
            const istDate = new Date(date.getTime() + IST_OFFSET_MS);
            hourNum = istDate.getUTCHours();
            minute = String(istDate.getUTCMinutes()).padStart(2, '0');
          } else return '--:--';
        } else if (datetime.match(/^\d{2}:\d{2}:\d{2}$/)) {
          const parts = datetime.split(':');
          hourNum = parseInt(parts[0], 10);
          minute = parts[1];
        } else return '--:--';
      } else return '--:--';
      if (isNaN(hourNum)) return '--:--';
      const ampm = hourNum >= 12 ? 'PM' : 'AM';
      const hour12 = hourNum % 12 === 0 ? 12 : hourNum % 12;
      return `${hour12}:${minute} ${ampm}`;
    } catch {
      return '--:--';
    }
  };

  const handleClockIn = async () => {
    setClockLoading(true);
    setMessage({ type: '', text: '' });
    try {
      const response = await axios.post(API_ENDPOINTS.ATTENDANCE_CLOCK_IN, {
        employee_id: user.employeeId,
        latitude: null, longitude: null, accuracy: null
      });
      const clockInIST = response.data.clock_in_ist || response.data.clock_in;
      const newAttendance = {
        clock_in: clockInIST,
        clock_in_ist: clockInIST,
        clock_in_display: formatTimeIST(clockInIST),
        late_minutes: response.data.late_minutes || 0,
        late_display: response.data.late_display || null,
        status: 'working',
        attendance_date: response.data.attendance_date || nowIST().split(' ')[0],
        session_id: response.data.session_id
      };
      setAttendance(newAttendance);
      setTodayAttendance(newAttendance);
      const session = { session_id: response.data.session_id, clock_in_time: clockInIST };
      setActiveSession(session);
      saveSession(session);
      setMessage({ type: 'success', text: response.data.message || 'Clocked in successfully!' });
    } catch (error) {
      if (error.response?.data?.code === 'IP_BLOCKED') setNetworkBlocked(true);
      setMessage({ type: 'danger', text: error.response?.data?.message || 'Failed to clock in' });
    } finally {
      setClockLoading(false);
    }
  };

  const handleClockOut = async () => {
    setClockLoading(true);
    setMessage({ type: '', text: '' });
    try {
      const preCheck = await axios.get(API_ENDPOINTS.ATTENDANCE_TODAY(user.employeeId));
      const serverSession = preCheck.data.active_session;
      if (!serverSession) {
        setActiveSession(null);
        clearSession();
        await fetchTodayAttendance();
        setClockLoading(false);
        return;
      }
      const response = await axios.post(API_ENDPOINTS.ATTENDANCE_CLOCK_OUT, {
        employee_id: user.employeeId,
        session_id: serverSession.session_id,
        latitude: null, longitude: null, accuracy: null
      });
      const clockOutIST = response.data.clock_out_ist || response.data.clock_out;
      setAttendance(prev => ({
        ...prev,
        clock_out: clockOutIST,
        clock_out_display: formatTimeIST(clockOutIST),
        total_hours_display: response.data.total_hours_display,
        status: response.data.status
      }));
      setActiveSession(null);
      clearSession();
      setMessage({ type: 'success', text: response.data.message || 'Clocked out successfully!' });
    } catch (error) {
      if (error.response?.data?.code === 'IP_BLOCKED') setNetworkBlocked(true);
      setMessage({ type: 'danger', text: error.response?.data?.message || 'Failed to clock out' });
    } finally {
      setClockLoading(false);
    }
  };


  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [employee, setEmployee] = useState(null);
  const [leaveBalance, setLeaveBalance] = useState({
    available: 0,
    total_accrued: 12,
    used: 0,
    pending: 0,
    comp_off_balance: 0,
    total_comp_off_earned: 0,
    total_comp_off_used: 0,
    is_eligible: false
  });
  const [compOffHistory, setCompOffHistory] = useState([]);

  const [leaveRequests, setLeaveRequests] = useState([]);
  const [todayAttendance, setTodayAttendance] = useState(null);
  const [attendanceHistory, setAttendanceHistory] = useState([]);
  const [upcomingHolidays, setUpcomingHolidays] = useState([]);
  const [error, setError] = useState('');
  const [stats, setStats] = useState({
    totalLeaves: 0,
    approvedLeaves: 0,
    pendingLeaves: 0,
    rejectedLeaves: 0,
    presentDays: 0,
    absentDays: 0,
    workingDays: 22,
    lateDays: 0,
    weeklyOffDays: 0,
    totalLateMinutes: 0,
    compOffEarned: 0
  });

  // Unified performance ratings (merged from employee_ratings + performance_reviews)
  const [allRatings, setAllRatings] = useState([]);
  const [showRatingHistory, setShowRatingHistory] = useState(false);

  // Current-month deductions
  const [myDeductions, setMyDeductions] = useState([]);

  // Chart view toggle: 'weekly' | 'monthly'
  const [chartView, setChartView] = useState('weekly');

  // Weekly chart data
  const [attendanceChartData, setAttendanceChartData] = useState({
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    datasets: [{
      label: 'Present Days',
      data: [0, 0, 0, 0, 0, 0, 0],
      backgroundColor: Array(5).fill('rgba(59,130,246,0.75)').concat(Array(2).fill('rgba(156,163,175,0.45)')),
      borderColor:      Array(5).fill('rgb(59,130,246)').concat(Array(2).fill('rgb(156,163,175)')),
      borderWidth: 0,
      borderRadius: 6,
      barPercentage: 0.6,
      categoryPercentage: 0.75
    }]
  });

  // Monthly chart data (Jan–Dec, hours per month)
  const [monthlyChartData, setMonthlyChartData] = useState({
    labels: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
    datasets: [{
      label: 'Total Working Hours',
      data: Array(12).fill(0),
      backgroundColor: 'rgba(99,102,241,0.75)',
      borderColor: 'rgb(99,102,241)',
      borderWidth: 0,
      borderRadius: 6,
      barPercentage: 0.6,
      categoryPercentage: 0.75
    }]
  });

  const [leaveChartData, setLeaveChartData] = useState({
    labels: ['Leave Used', 'Remaining Leaves', 'Pending Approval'],
    datasets: [{
      data: [0, 12, 0],
      backgroundColor: ['#ef4444', '#22c55e', '#f97316'],
      borderWidth: 3,
      borderColor: '#ffffff',
      hoverOffset: 8
    }]
  });

  // Weekly off days (0 = Sunday, 6 = Saturday)
  const WEEKLY_OFF_DAYS = [0, 6];

  // ── Rating helpers ──────────────────────────────────────────────────────────
  const PERF_LABELS = {
    5: 'Excellent Performer', 4: 'Very Good Performer', 3: 'Meets Expectations',
    2: 'Performance Improvement Plan (PIP)', 1: 'Termination Recommended',
  };
  const PERF_COLORS = { 5: '#22c55e', 4: '#4ade80', 3: '#eab308', 2: '#f97316', 1: '#ef4444' };

  const getRoleRatedText = (role) => {
    const r = (role || '').toLowerCase();
    if (r === 'admin') return 'Admin rated you';
    if (r === 'sub_admin') return 'Manager rated you';
    if (r === 'manager') return 'Team Leader rated you';
    return 'Supervisor rated you';
  };

  const getRatingAvatarColor = (role) => {
    const r = (role || '').toLowerCase();
    if (r === 'admin') return '#6366f1';
    if (r === 'sub_admin') return '#0ea5e9';
    return '#10b981';
  };

  const fmtRatingDate = (d) => {
    if (!d) return '';
    try { return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); }
    catch { return ''; }
  };

  const getNameInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  };

  const getRatingLabel = (r) => PERF_LABELS[r] || `${r}/5`;

  // Used in the attendance header mini-stars
  const renderStars = (rating) => {
    const stars = [];
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    for (let i = 1; i <= 5; i++) {
      if (i <= fullStars) stars.push(<FaStar key={i} size={14} className="me-1 text-warning" />);
      else if (i === fullStars + 1 && hasHalfStar) stars.push(<FaStarHalfAlt key={i} size={14} className="me-1 text-warning" />);
      else stars.push(<FaRegStar key={i} size={14} className="me-1 text-secondary" />);
    }
    return stars;
  };

  useEffect(() => {
    if (!user?.employeeId) return;

    // Instant paint from the last-known snapshot (if any) — the network fetch below still
    // runs regardless, but the dashboard shows something immediately instead of a spinner
    // while it does. Stale data is fine here; it gets silently replaced within a second or
    // two as each real fetch resolves.
    const cached = loadDashboardCache(user.employeeId, 'employee');
    if (cached) {
      if (cached.employee !== undefined) setEmployee(cached.employee);
      if (cached.leaveBalance !== undefined) setLeaveBalance(cached.leaveBalance);
      if (cached.compOffHistory !== undefined) setCompOffHistory(cached.compOffHistory);
      if (cached.leaveRequests !== undefined) setLeaveRequests(cached.leaveRequests);
      if (cached.todayAttendance !== undefined) setTodayAttendance(cached.todayAttendance);
      if (cached.attendance !== undefined) setAttendance(cached.attendance);
      if (cached.attendanceHistory !== undefined) setAttendanceHistory(cached.attendanceHistory);
      if (cached.upcomingHolidays !== undefined) setUpcomingHolidays(cached.upcomingHolidays);
      if (cached.stats !== undefined) setStats(cached.stats);
      if (cached.allRatings !== undefined) setAllRatings(cached.allRatings);
      if (cached.myDeductions !== undefined) setMyDeductions(cached.myDeductions);
      setLoading(false);
    }

    loadDashboardData({ silent: !!cached });
    fetchAllRatings();
    checkPendingTicketConfirmations();
  }, [user]);

  // Fetch once on login/dashboard load — no polling, same convention as the other
  // fetch-once-on-mount checks in NotificationContext/TicketBadge. GET /api/tickets has
  // no server-side status filter, but for a regular employee the visible set is already
  // scoped down to their own raised/assigned/department tickets (see visibleTicketsQuery
  // in ticketRoutes.js), so filtering client-side here is cheap and needs no new endpoint.
  const checkPendingTicketConfirmations = async () => {
    try {
      const res = await axios.get(API_ENDPOINTS.TICKETS);
      const tickets = res.data?.tickets || [];
      const mine = tickets.filter(t => t.raised_by === user.employeeId && t.status === 'resolved_pending');
      if (mine.length > 0) {
        setPendingConfirmTickets(mine);
        setShowTicketConfirmModal(true);
      }
    } catch (error) {
      console.error('Error checking pending ticket confirmations:', error);
    }
  };

  const activeConfirmTicket = pendingConfirmTickets[0] || null;

  useEffect(() => {
    if (showTicketConfirmModal && pendingConfirmTickets.length === 0) {
      setShowTicketConfirmModal(false);
    }
  }, [pendingConfirmTickets, showTicketConfirmModal]);

  const advanceTicketQueue = () => {
    setPendingConfirmTickets(prev => prev.slice(1));
    setShowTicketDeclineInput(false);
    setTicketDeclineNote('');
  };

  const handleConfirmTicketResolved = async () => {
    if (!activeConfirmTicket) return;
    setTicketActionLoading(true);
    try {
      await axios.patch(API_ENDPOINTS.TICKET_ACCEPT(activeConfirmTicket.id));
      showNotification('Ticket closed. Thanks for confirming!', 'success');
      advanceTicketQueue();
    } catch (error) {
      showNotification(error.response?.data?.message || 'Failed to close ticket', 'danger');
    } finally {
      setTicketActionLoading(false);
    }
  };

  const handleDeclineTicketResolution = async () => {
    if (!activeConfirmTicket) return;
    setTicketActionLoading(true);
    try {
      await axios.patch(API_ENDPOINTS.TICKET_DECLINE(activeConfirmTicket.id), { reason: ticketDeclineNote.trim() });
      showNotification('Ticket reopened — the team has been notified.', 'info');
      advanceTicketQueue();
    } catch (error) {
      showNotification(error.response?.data?.message || 'Failed to reopen ticket', 'danger');
    } finally {
      setTicketActionLoading(false);
    }
  };

  const fetchAllRatings = async () => {
    try {
      const [newRes, oldRes] = await Promise.allSettled([
        axios.get(API_ENDPOINTS.PERFORMANCE_MY_HISTORY),
        axios.get(`${API_ENDPOINTS.RATINGS}/employee/${user.employeeId}/history`),
      ]);

      const newReviews = (newRes.status === 'fulfilled' ? newRes.value.data.reviews || [] : [])
        .map(r => ({
          id: r.id,
          rating: r.rating,
          label: PERF_LABELS[r.rating] || `${r.rating}/5`,
          remark: r.remarks || '',
          reviewer_name: r.reviewer_name || 'Reviewer',
          reviewer_role: r.reviewer_role || 'admin',
          date: r.created_at,
          month_name: r.month_name,
          year: r.review_year,
          month: r.review_month,
          source: 'new',
        }));

      let oldReviews = [];
      if (oldRes.status === 'fulfilled' && oldRes.value.data.success) {
        const d = oldRes.value.data;
        const allOld = [
          ...(d.manager_ratings || []).map(r => ({ ...r, _role: 'manager' })),
          ...(d.admin_ratings   || []).map(r => ({ ...r, _role: 'admin'   })),
        ];
        oldReviews = allOld.map((r, i) => ({
          id: `legacy_${i}`,
          rating: r.rating,
          label: r.rating_label || '',
          remark: r.comments || '',
          reviewer_name: r.rater_name || 'Supervisor',
          reviewer_role: r._role,
          date: r.created_at,
          month_name: r.month_name,
          year: r.year,
          month: new Date(`${r.month_name} 1, ${r.year}`).getMonth() + 1,
          source: 'legacy',
        }));
      }

      const combined = [...newReviews, ...oldReviews].sort((a, b) => {
        if (b.year !== a.year) return b.year - a.year;
        if (b.month !== a.month) return b.month - a.month;
        return new Date(b.date || 0) - new Date(a.date || 0);
      });
      setAllRatings(combined);
    } catch (e) {
      console.error('Error fetching ratings:', e);
    }
  };

  const recalculateAttendanceStats = () => {
    if (!attendanceHistory || attendanceHistory.length === 0) return;

    let presentDays = 0;
    let absentDays = 0;
    let halfDays = 0;
    let weeklyOffDays = 0;
    let totalWorkingHours = 0;

    attendanceHistory.forEach(record => {
      const dateObj = new Date(record.attendance_date);
      const dayOfWeek = dateObj.getDay();
      const isWeeklyOff = dayOfWeek === 0 || dayOfWeek === 6;

      if (isWeeklyOff) {
        weeklyOffDays++;
      } else {
        if (record.status === 'present' || record.status === 'working' || record.clock_in) {
          presentDays++;
          if (record.total_hours) {
            totalWorkingHours += parseFloat(record.total_hours);
          }
        } else if (record.status === 'half_day') {
          halfDays++;
          presentDays++;
          if (record.total_hours) {
            totalWorkingHours += parseFloat(record.total_hours);
          }
        } else if (record.status === 'absent' || !record.clock_in) {
          absentDays++;
        }
      }
    });

    setStats(prev => ({
      ...prev,
      presentDays,
      absentDays,
      halfDays,
      weeklyOffDays,
      totalWorkingHours: Math.round(totalWorkingHours * 10) / 10
    }));
  };

  useEffect(() => {
    if (attendanceHistory.length > 0) {
      updateAttendanceChart();
      recalculateAttendanceStats();
    }
    if (leaveBalance) {
      updateLeaveChart();
    }
  }, [attendanceHistory, leaveBalance]);

  useEffect(() => {
    loadUpcomingHolidays();
  }, []);

  const loadUpcomingHolidays = () => {
    try {
      const today = new Date();
      const currentYear = today.getFullYear();

      const allHolidays = holidays.filter(h => {
        const holidayDate = new Date(h.date);
        return holidayDate >= today && holidayDate.getFullYear() <= currentYear + 1;
      });

      const sortedHolidays = allHolidays.sort((a, b) => new Date(a.date) - new Date(b.date));
      const nextHolidays = sortedHolidays.slice(0, 3).map(holiday => {
        const holidayDate = new Date(holiday.date);
        const diffTime = holidayDate - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        return {
          date: holiday.date,
          name: holiday.name,
          region: holiday.region,
          daysLeft: diffDays,
          formattedDate: formatDate(holiday.date)
        };
      });

      setUpcomingHolidays(nextHolidays);
    } catch (error) {
      console.error('Error loading upcoming holidays:', error);
    }
  };

  const loadDashboardData = async ({ silent = false } = {}) => {
    // silent=true means a cached snapshot is already on screen — skip the blocking
    // spinner so the refresh happens invisibly behind the data the user already sees.
    if (!silent) setLoading(true);
    setError('');

    try {
      await Promise.all([
        fetchEmployeeData(),
        fetchLeaveBalance(),
        fetchCompOffHistory(),
        fetchLeaveRequests(),
        fetchTodayAttendance(),
        fetchAttendanceHistory(),
        fetchTodayEvents(),
        fetchMyDeductions(),
      ]);
      loadUpcomingHolidays();
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      setError('Failed to load some dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const refreshData = async () => {
    setRefreshing(true);
    await loadDashboardData();
    await fetchEmployeeRatings();
    setRefreshing(false);
    showNotification('Dashboard refreshed!', 'success');
  };

  // Snapshot the dashboard-defining state on every change so the next mount/login can
  // paint from it instantly instead of waiting on the network (see the mount effect above).
  useEffect(() => {
    // Guard against the very first render (before either cache-hydration or the real fetch
    // has landed): employee is still its null default then, and saving at that instant
    // would clobber a perfectly good cache with nothing, right after we just read it.
    if (!user?.employeeId || !employee) return;
    saveDashboardCache(user.employeeId, 'employee', {
      employee, leaveBalance, compOffHistory, leaveRequests, todayAttendance,
      attendance, attendanceHistory, upcomingHolidays, stats, allRatings, myDeductions,
    });
  }, [user?.employeeId, employee, leaveBalance, compOffHistory, leaveRequests, todayAttendance, attendance, attendanceHistory, upcomingHolidays, stats, allRatings, myDeductions]);

  const fetchEmployeeData = async () => {
    try {
      const response = await axios.get(API_ENDPOINTS.EMPLOYEE_PROFILE(user.employeeId));
      setEmployee(response.data);
    } catch (error) {
      console.error('Error fetching employee:', error);
      showNotification(error.response?.data?.message || 'Failed to load profile data', 'danger');
    }
  };

  const fetchMyDeductions = async () => {
    try {
      const now = new Date();
      const month = now.getMonth() + 1;
      const year  = now.getFullYear();
      const res = await axios.get(
        `${API_ENDPOINTS.DEDUCTIONS_EMPLOYEE(user.employeeId)}?month=${month}&year=${year}`
      );
      setMyDeductions(res.data?.data || []);
    } catch {
      // non-critical; silently ignore
    }
  };

  const fetchLeaveBalance = async () => {
    try {
      const response = await axios.get(API_ENDPOINTS.LEAVE_BALANCE(user.employeeId));
      setLeaveBalance({
        available: parseFloat(response.data.available) || 0,
        total_accrued: parseFloat(response.data.total_accrued) || 0,
        used: parseFloat(response.data.used) || 0,
        pending: parseFloat(response.data.pending) || 0,
        comp_off_balance: parseFloat(response.data.comp_off_balance) || 0,
        total_comp_off_earned: parseFloat(response.data.total_comp_off_earned) || 0,
        total_comp_off_used: parseFloat(response.data.total_comp_off_used) || 0,
        is_eligible: response.data.is_probation_complete || response.data.is_eligible || false,
        months_completed: response.data.months_completed || 0,
        is_probation_complete: response.data.is_probation_complete || false
      });
    } catch (error) {
      console.error('Error fetching leave balance:', error);
      setLeaveBalance({
        available: 0,
        total_accrued: 0,
        used: 0,
        pending: 0,
        comp_off_balance: 0,
        total_comp_off_earned: 0,
        total_comp_off_used: 0,
        is_eligible: false,
        months_completed: 0,
        is_probation_complete: false
      });
      showNotification('Failed to load leave balance', 'info');
    }
  };

  const fetchCompOffHistory = async () => {
    try {
      const response = await axios.get(`${API_ENDPOINTS.ATTENDANCE}/comp-off/${user.employeeId}/history`);
      setCompOffHistory(response.data.earnings || []);
      const earned = response.data.earnings?.filter(e => !e.is_used).length || 0;
      setStats(prev => ({
        ...prev,
        compOffEarned: earned
      }));
    } catch (error) {
      console.log('Comp-off history not available for employees');
      setCompOffHistory([]);
    }
  };

  const fetchLeaveRequests = async () => {
    try {
      const response = await axios.get(API_ENDPOINTS.LEAVES);
      const leaves = response.data || [];
      setLeaveRequests(leaves.slice(0, 5));
      setStats(prev => ({
        ...prev,
        totalLeaves: leaves.length,
        approvedLeaves: leaves.filter(l => l.status === 'approved').length,
        pendingLeaves: leaves.filter(l => l.status === 'pending').length,
        rejectedLeaves: leaves.filter(l => l.status === 'rejected').length
      }));
    } catch (error) {
      console.error('Error fetching leave requests:', error);
    }
  };

  const fetchTodayAttendance = async () => {
    try {
      const response = await axios.get(API_ENDPOINTS.ATTENDANCE_TODAY(user.employeeId));
      let attendanceData = response.data.attendance;
      const serverSession = response.data.active_session;

      if (attendanceData) {
        attendanceData.clock_in = attendanceData.clock_in_ist || attendanceData.clock_in;
        attendanceData.clock_out = attendanceData.clock_out_ist || attendanceData.clock_out;
        if (attendanceData.clock_in) attendanceData.clock_in_display = formatTimeIST(attendanceData.clock_in);
        if (attendanceData.clock_out) attendanceData.clock_out_display = formatTimeIST(attendanceData.clock_out);
        attendanceData.late_minutes = Number(attendanceData.late_minutes) || 0;

        setAttendance(attendanceData);
        setTodayAttendance(attendanceData);

        if (serverSession) {
          setActiveSession(serverSession);
          saveSession(serverSession);
        } else if (attendanceData.clock_in && !attendanceData.clock_out) {
          setActiveSession({ session_id: attendanceData.session_id || 'inferred' });
        } else {
          setActiveSession(null);
          clearSession();
        }
      } else {
        setAttendance(null);
        setTodayAttendance(null);
        if (!serverSession) { setActiveSession(null); clearSession(); }
      }
    } catch (error) {
      console.error('Error fetching today attendance:', error);
    }
  };

  const fetchAttendanceHistory = async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let cycleStartDate, cycleEndDate;
      if (today.getDate() >= 26) {
        cycleStartDate = new Date(today.getFullYear(), today.getMonth(), 26);
        cycleEndDate = new Date(today.getFullYear(), today.getMonth() + 1, 25);
      } else {
        cycleStartDate = new Date(today.getFullYear(), today.getMonth() - 1, 26);
        cycleEndDate = new Date(today.getFullYear(), today.getMonth(), 25);
      }

      const startDateStr = cycleStartDate.toISOString().split('T')[0];
      const fetchEndDate = today < cycleEndDate ? today : cycleEndDate;
      const endDateStr = fetchEndDate.toISOString().split('T')[0];

      const response = await axios.get(
        API_ENDPOINTS.ATTENDANCE_EMPLOYEE_REPORT(user.employeeId, startDateStr, endDateStr)
      );

      const attendance = response.data.attendance || [];
      setAttendanceHistory(attendance);

      let presentDays = 0, halfDays = 0, weeklyOff = 0, absent = 0;
      let totalWorkingDaysCount = 0;

      let d = new Date(cycleStartDate);
      while (d <= today) {
        const dateStr = d.toISOString().split('T')[0];
        const dow = d.getDay();
        const isWeeklyOff = dow === 0 || dow === 6;

        if (isWeeklyOff) {
          weeklyOff++;
        } else {
          totalWorkingDaysCount++;
          const record = attendance.find(r => r.attendance_date === dateStr);
          if (record && (record.clock_in || record.status === 'present')) {
            if (record.status === 'half_day') { halfDays++; presentDays++; }
            else { presentDays++; }
          } else {
            absent++;
          }
        }
        d.setDate(d.getDate() + 1);
      }

      const cycleLabel = `${cycleStartDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} - ${cycleEndDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;

      setStats(prev => ({
        ...prev,
        presentDays,
        absentDays: absent,
        halfDays,
        weeklyOffDays: weeklyOff,
        totalWorkingDays: totalWorkingDaysCount,
        cycleLabel
      }));
    } catch (error) {
      console.error('Error fetching attendance history:', error);
      setAttendanceHistory([]);
    }
  };

  const updateAttendanceChart = () => {
    // ── Weekly view ──────────────────────────────────────────────
    const hoursByDay = [0, 0, 0, 0, 0, 0, 0];
    const today = new Date();
    const dow = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
    monday.setHours(0, 0, 0, 0);

    attendanceHistory.forEach(record => {
      if (!record.clock_in) return;
      const recDate = new Date(record.attendance_date);
      recDate.setHours(0, 0, 0, 0);
      const diff = Math.round((recDate - monday) / 86400000);
      if (diff >= 0 && diff <= 6) {
        hoursByDay[diff] = Math.round((parseFloat(record.total_hours) || 0) * 10) / 10;
      }
    });

    setAttendanceChartData({
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      datasets: [{
        label: 'Present Days',
        data: hoursByDay,
        backgroundColor: Array(5).fill('rgba(59,130,246,0.75)').concat(Array(2).fill('rgba(156,163,175,0.45)')),
        borderColor:      Array(5).fill('rgb(59,130,246)').concat(Array(2).fill('rgb(156,163,175)')),
        borderWidth: 0,
        borderRadius: 6,
        barPercentage: 0.6,
        categoryPercentage: 0.75
      }]
    });

    // ── Monthly view (Jan–Dec, total hours per calendar month) ────
    const hoursByMonth = Array(12).fill(0);
    attendanceHistory.forEach(record => {
      if (!record.clock_in || !record.total_hours) return;
      const m = new Date(record.attendance_date).getMonth(); // 0–11
      hoursByMonth[m] = Math.round((hoursByMonth[m] + (parseFloat(record.total_hours) || 0)) * 10) / 10;
    });

    setMonthlyChartData({
      labels: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
      datasets: [{
        label: 'Total Working Hours',
        data: hoursByMonth,
        backgroundColor: 'rgba(99,102,241,0.75)',
        borderColor: 'rgb(99,102,241)',
        borderWidth: 0,
        borderRadius: 6,
        barPercentage: 0.6,
        categoryPercentage: 0.75
      }]
    });
  };

  const updateLeaveChart = () => {
    const used      = parseFloat(leaveBalance.used) || 0;
    const pending   = parseFloat(leaveBalance.pending) || 0;
    const total     = parseFloat(leaveBalance.total_accrued) || 0;
    const available = Math.max(0, total - used - pending);
    const hasData   = (used + pending + available) > 0;

    setLeaveChartData({
      labels: ['Leave Used', 'Remaining Leaves', 'Pending Approval'],
      datasets: [{
        data: hasData ? [used, available, pending] : [1, 1, 1],
        backgroundColor: hasData ? ['#ef4444', '#22c55e', '#f97316'] : ['#e5e7eb', '#e5e7eb', '#e5e7eb'],
        borderWidth: 3,
        borderColor: '#ffffff',
        hoverOffset: 8
      }]
    });
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'approved':
        return <Badge bg="success" className="px-2 py-1"><FaCheckCircle className="me-1" size={10} /> Approved</Badge>;
      case 'pending':
        return <Badge bg="warning" className="px-2 py-1"><FaHourglassHalf className="me-1" size={10} /> Pending</Badge>;
      case 'rejected':
        return <Badge bg="danger" className="px-2 py-1"><FaTimesCircle className="me-1" size={10} /> Rejected</Badge>;
      default:
        return <Badge bg="secondary" className="px-2 py-1">Unknown</Badge>;
    }
  };

  const formatLateTime = (lateMinutes) => {
    if (!lateMinutes || lateMinutes <= 0) return null;
    const totalSeconds = Math.round(lateMinutes * 60);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 || (hours === 0 && minutes === 0)) parts.push(`${seconds}s`);
    return parts.join(' ');
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatTime = (datetime) => {
    if (!datetime) return '-';
    return new Date(datetime).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getRegionBadge = (region) => {
    const colors = {
      'India': 'primary',
      'USA': 'danger',
      'Global': 'success'
    };
    return <Badge bg={colors[region] || 'secondary'}>{region}</Badge>;
  };

  const isTodayWeeklyOff = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    return WEEKLY_OFF_DAYS.includes(dayOfWeek);
  };

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center min-vh-100">
        <div className="text-center">
          <Spinner animation="border" variant="primary" />
          <p className="mt-3 text-muted">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  // Show profile completion overlay when admin has enabled the toggle AND employee hasn't completed it
  if (
    !loading && employee &&
    employee.require_profile_completion === true &&
    employee.profile_completed !== true &&
    ['employee', 'manager'].includes(user?.role)
  ) {
    const skipKey = `profile_skip_until_${employee.employee_id}`;
    const skipUntil = parseInt(localStorage.getItem(skipKey) || '0', 10);
    if (Date.now() >= skipUntil) {
      const handleSkip = () => {
        localStorage.setItem(skipKey, String(Date.now() + 10 * 60 * 1000));
        window.location.reload();
      };
      return <ProfileCompletion employee={employee} onSkip={handleSkip} />;
    }
  }

  // Same "currently clocked in" rule AttendanceCard.jsx uses (hasOpen) — kept in sync so the
  // banner's separate Clock In/Clock Out buttons never disagree with the Time Today card below.
  const isClockedInToday = !!activeSession || (!!attendance?.clock_in && !attendance?.clock_out);

  return (
    <div className="p-2 p-md-3 p-lg-4" style={{ backgroundColor: '#f0f2f5', minHeight: '100vh' }}>

      <WelcomeBanner
        name={employee?.first_name}
        roleLabel={user?.role === 'housekeeper' ? 'Housekeeper Dashboard' : 'Employee Dashboard'}
        onRefresh={refreshData}
        refreshing={refreshing}
        belowActions={
          !networkBlocked && !(user?.role === 'housekeeper' ? false : isMobileDevice) && (
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
          )
        }
      />

      <div className="d-flex flex-wrap gap-2 align-items-center mb-3">
        <span className="text-muted small">{employee?.designation || 'Employee'} • {employee?.department || 'Department'}</span>
        <Badge bg="dark" className="p-2">ID: {user?.employeeId}</Badge>
        <Badge bg="info" className="p-2">{employee?.employment_type || 'Full Time'}</Badge>
      </div>

      {message.text && (
        <Alert variant={message.type} onClose={() => setMessage({ type: '', text: '' })} dismissible className="py-2 small">
          {message.text}
        </Alert>
      )}

      {/* Team-on-break panel — only visible to managers/admins */}
      <BreakWidget mode="team-panel" />

      <AnnouncementBanner />
      <EmployeeNotices />

      <DashboardQuickAccess
        employeeId={employee?.employee_id}
        onLeaveScope="department"
        department={employee?.department}
        attendance={attendance}
        activeSession={activeSession}
        onClockIn={handleClockIn}
        onRequestClockOut={openClockOutConfirm}
        clockLoading={clockLoading}
        readOnly={networkBlocked}
        readOnlyMessage="Please connect to company Wi-Fi for clock in."
        disabledMobile={user?.role === 'housekeeper' ? false : isMobileDevice}
        shiftTiming={employee?.shift_timing}
        unlimitedBreaks={(employee?.department || '').trim().toLowerCase() === 'sales'}
        hideClockToggle
        footerExtra={
          <div style={{ display: 'flex', gap: 2 }}>
            {renderStars(allRatings.length > 0 ? allRatings.reduce((s, r) => s + r.rating, 0) / allRatings.length : 0)}
          </div>
        }
      />

      {/* Salary deduction notice */}
      {myDeductions.length > 0 && (() => {
        const total = myDeductions.reduce((s, d) => s + parseFloat(d.amount || 0), 0);
        return (
          <Alert
            variant="warning"
            className="mb-3 py-2 small"
            style={{ borderLeft: '4px solid #dc3545', background: '#fff5f5' }}
          >
            <div className="d-flex align-items-start gap-2">
              <FaExclamationTriangle className="text-danger mt-1 flex-shrink-0" size={14} />
              <div>
                <div className="fw-semibold text-danger mb-1">
                  Salary Deduction Notice — {new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}
                </div>
                <div className="mb-1">
                  A total deduction of{' '}
                  <strong>₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>{' '}
                  has been applied to your salary this month.
                </div>
                <ul className="mb-0 ps-3">
                  {myDeductions.map(d => (
                    <li key={d.id}>
                      ₹{parseFloat(d.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })} — {d.reason}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Alert>
        );
      })()}

      {error && (
        <Alert variant="danger" onClose={() => setError('')} dismissible className="mb-3 py-2">
          <small>{error}</small>
        </Alert>
      )}

      {/* Today's Status Card
      {isTodayWeeklyOff() ? (
        <Card className="mb-4 border-0 shadow-sm bg-secondary bg-opacity-10">
          <Card.Body className="p-2 p-md-3">
            <div className="d-flex align-items-center">
              <FaSun size={24} className="me-3 text-secondary flex-shrink-0" />
              <div>
                <h6 className="mb-1 small">Today is Weekly Off</h6>
                <p className="mb-0 text-muted small">Enjoy your day off! No attendance required.</p>
              </div>
            </div>
          </Card.Body>
        </Card>
      ) : todayAttendance && (
        <Card className="mb-4 border-0 shadow-sm bg-white text-dark">
          <Card.Body className="p-2 p-md-3">
            <div className="d-flex flex-column flex-sm-row align-items-start align-items-sm-center justify-content-between gap-2">
              <div className="d-flex align-items-center">
                <FaClock size={24} className="me-3 opacity-75 flex-shrink-0" />
                <div>
                  <h6 className="mb-1 small">Today's Attendance</h6>
                  <p className="mb-0 small">
                    {todayAttendance.clock_in ? (
                      <>
                        In: <strong>{formatTime(todayAttendance.clock_in)}</strong>
                        {todayAttendance.late_display && (
                          <small className="text-danger ms-2">(Late {todayAttendance.late_display})</small>
                        )}
                        {todayAttendance.comp_off_awarded && (
                          <Badge bg="purple" className="ms-2">🎉 Comp-Off Earned</Badge>
                        )}
                        {todayAttendance.clock_out ? (
                          <> • Out: <strong>{formatTime(todayAttendance.clock_out)}</strong></>
                        ) : (
                          <Badge bg="light" text="dark" className="ms-2">Working</Badge>
                        )}
                      </>
                    ) : (
                      "Not clocked in yet"
                    )}
                  </p>
                </div>
              </div>
              <Button variant="dark" size="sm" onClick={() => navigate('/attendance')} className="ms-0 ms-sm-auto w-20 w-sm-auto">
                View Details <FaArrowRight className="ms-2" size={10} />
              </Button>
            </div>
          </Card.Body>
        </Card>
      )} */}

      {/* Statistics Cards - First Row with 3 Cards */}
      <Row className="mb-4 g-2 g-md-3">
        {/* Leave Balance Card */}
        <Col xs={12} sm={6} md={4}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Body className="p-3">
              <div className="d-flex justify-content-between align-items-start">
                <div className="overflow-hidden">
                  <p className="text-muted small mb-1 text-truncate">Leave Balance</p>
                  <h4 className="mb-0 fw-bold text-primary">
                    {leaveBalance.is_probation_complete ? parseFloat(leaveBalance.available).toFixed(1) : parseFloat(leaveBalance.total_accrued).toFixed(1)}
                  </h4>
                  <small className="text-muted text-truncate d-block">
                    {leaveBalance.is_probation_complete ? `Used: ${parseFloat(leaveBalance.used).toFixed(1)} | Pending: ${parseFloat(leaveBalance.pending).toFixed(1)}` : 'Earned (usable after probation)'}
                  </small>
                </div>
                <div className="bg-primary bg-opacity-10 p-3 rounded-circle flex-shrink-0">
                  <FaUmbrellaBeach className="text-primary" size={24} />
                </div>
              </div>
            </Card.Body>
          </Card>
        </Col>

        {/* Present Days Card */}
        <Col xs={12} sm={6} md={4}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Body className="p-3">
              <div className="d-flex justify-content-between align-items-start">
                <div className="overflow-hidden">
                  <p className="text-muted small mb-1 text-truncate">Present Days</p>
                  <h4 className="mb-0 fw-bold text-success">{stats.presentDays || 0}</h4>
                  <small className="text-muted text-truncate d-block">
                    Absent: <span className="text-danger fw-semibold">{stats.absentDays || 0}</span>
                  </small>
                </div>
                <div className="bg-success bg-opacity-10 p-3 rounded-circle flex-shrink-0">
                  <FaCheckCircle className="text-success" size={24} />
                </div>
              </div>
            </Card.Body>
          </Card>
        </Col>

        {/* Comp-Off Balance Card */}
        <Col xs={12} sm={6} md={4}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Body className="p-3">
              <div className="d-flex justify-content-between align-items-start">
                <div className="overflow-hidden">
                  <p className="text-muted small mb-1 text-truncate">Comp-Off Balance</p>
                  <h4 className="mb-0 fw-bold text-purple">{leaveBalance.comp_off_balance || 0}</h4>
                  <small className="text-muted text-truncate d-block">Earned on holidays</small>
                </div>
                <div className="bg-purple bg-opacity-10 p-3 rounded-circle flex-shrink-0">
                  <FaTrophy className="text-purple" size={24} />
                </div>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* ── Unified Performance Ratings Card ── */}
      <Row className="mb-4">
        <Col xs={12}>
          <Card className="border-0 shadow-sm" style={{ borderRadius: 14, overflow: 'hidden' }}>
            {/* Card header */}
            <div style={{ padding: '14px 20px 12px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FaStar size={15} style={{ color: '#eab308' }} />
                <span style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>Performance Ratings</span>
                {allRatings.length > 0 && (
                  <Badge bg="secondary" pill style={{ fontSize: 10 }}>{allRatings.length}</Badge>
                )}
              </div>
              {allRatings.length > 5 && (
                <Button variant="link" size="sm" className="p-0 text-decoration-none small" onClick={() => setShowRatingHistory(true)}>
                  View Full History <FaArrowRight size={10} />
                </Button>
              )}
            </div>

            {/* Summary row */}
            {allRatings.length > 0 && (() => {
              const avg = allRatings.reduce((s, r) => s + r.rating, 0) / allRatings.length;
              const latest = allRatings[0];
              const latestColor = PERF_COLORS[latest.rating] || '#94a3b8';
              return (
                <div style={{ display: 'flex', gap: 0, background: '#f8fafc', borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap' }}>
                  <div style={{ padding: '12px 20px', flex: '1 1 auto', borderRight: '1px solid #f1f5f9' }}>
                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Overall Rating</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {[1,2,3,4,5].map(n => (
                        <FaStar key={n} size={13} style={{ color: n <= Math.round(avg) ? '#eab308' : '#e2e8f0' }} />
                      ))}
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{avg.toFixed(1)} / 5</span>
                    </div>
                  </div>
                  <div style={{ padding: '12px 20px', flex: '0 0 auto', borderRight: '1px solid #f1f5f9', textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Total Ratings</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#6366f1' }}>{allRatings.length}</div>
                  </div>
                  <div style={{ padding: '12px 20px', flex: '1 1 auto' }}>
                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Latest Status</div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: latestColor }}>
                      {latest.label || getRatingLabel(latest.rating)}
                    </span>
                  </div>
                </div>
              );
            })()}

            <Card.Body className="p-0">
              {allRatings.length === 0 ? (
                <div style={{ padding: '36px 20px', textAlign: 'center' }}>
                  <FaStar size={40} style={{ color: '#e2e8f0', marginBottom: 12 }} />
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#64748b' }}>No Performance Ratings Yet</div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                    Your manager or admin will rate your performance here.
                  </div>
                </div>
              ) : (
                <div>
                  {allRatings.slice(0, 5).map((r, idx) => {
                    const color = PERF_COLORS[r.rating] || '#94a3b8';
                    const initials = getNameInitials(r.reviewer_name);
                    const avatarBg = getRatingAvatarColor(r.reviewer_role);
                    return (
                      <div key={r.id || idx} style={{
                        display: 'flex', gap: 14, padding: '14px 20px',
                        borderBottom: idx < Math.min(allRatings.length, 5) - 1 ? '1px solid #f1f5f9' : 'none',
                        alignItems: 'flex-start',
                      }}>
                        {/* Reviewer avatar */}
                        <div style={{
                          width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                          background: avatarBg, color: '#fff',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 700, fontSize: 13,
                        }}>
                          {initials}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {/* Reviewer role label + date */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
                            <span style={{ fontWeight: 600, fontSize: 13, color: '#0f172a' }}>
                              {getRoleRatedText(r.reviewer_role)}
                            </span>
                            <span style={{ fontSize: 11, color: '#94a3b8' }}>
                              {r.month_name} {r.year}
                              {r.date ? ` · ${fmtRatingDate(r.date)}` : ''}
                            </span>
                          </div>
                          {/* Reviewer name */}
                          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 5 }}>{r.reviewer_name}</div>
                          {/* Stars + label */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: r.remark ? 6 : 0, flexWrap: 'wrap' }}>
                            {[1,2,3,4,5].map(n => (
                              <FaStar key={n} size={14} style={{ color: n <= r.rating ? color : '#e2e8f0' }} />
                            ))}
                            <span style={{ fontSize: 12, fontWeight: 600, color, marginLeft: 4 }}>
                              {r.label || getRatingLabel(r.rating)}
                            </span>
                          </div>
                          {/* Comment */}
                          {r.remark && (
                            <div style={{
                              fontSize: 12, color: '#475569', fontStyle: 'italic',
                              background: '#f8fafc', borderRadius: 6, padding: '6px 10px',
                              borderLeft: `3px solid ${color}`, marginTop: 4,
                            }}>
                              "{r.remark}"
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {allRatings.length > 5 && (
                    <div style={{ padding: '12px 20px', textAlign: 'center', borderTop: '1px solid #f1f5f9' }}>
                      <Button variant="link" size="sm" className="text-decoration-none p-0 small" onClick={() => setShowRatingHistory(true)}>
                        View Full History ({allRatings.length} ratings) <FaArrowRight size={10} />
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row className="g-3 g-md-4">
        {/* ── Attendance Chart ─────────────────────────────────── */}
        <Col lg={6}>
          <Card className="border-0 h-100" style={{ borderRadius: '14px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
            <Card.Header className="bg-white border-0 pt-3 pb-2 px-3" style={{ borderRadius: '14px 14px 0 0' }}>
              <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
                <div className="d-flex align-items-center gap-2">
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(59,130,246,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <FaChartBar size={15} color="#3b82f6" />
                  </div>
                  <div>
                    <div className="fw-bold" style={{ fontSize: 14, color: '#111827' }}>
                      {chartView === 'weekly' ? 'Weekly Attendance' : 'Monthly Attendance Overview'}
                    </div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>
                      {chartView === 'weekly' ? 'Hours worked this week' : 'Total hours per month'}
                    </div>
                  </div>
                </div>
                {/* Toggle */}
                <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: 8, padding: 3 }}>
                  {['weekly', 'monthly'].map(v => (
                    <button
                      key={v}
                      onClick={() => setChartView(v)}
                      style={{
                        border: 'none', cursor: 'pointer', borderRadius: 6, padding: '4px 12px',
                        fontSize: 11, fontWeight: 600, transition: 'all 0.2s',
                        background: chartView === v ? '#3b82f6' : 'transparent',
                        color: chartView === v ? '#fff' : '#6b7280'
                      }}
                    >
                      {v === 'weekly' ? 'Weekly' : 'Monthly'}
                    </button>
                  ))}
                </div>
              </div>
            </Card.Header>

            <Card.Body className="p-3 pt-2">
              <div style={{ height: 270, position: 'relative' }}>
                <Bar
                  data={chartView === 'weekly' ? attendanceChartData : monthlyChartData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: { duration: 600, easing: 'easeInOutQuart' },
                    plugins: {
                      legend: { display: false },
                      tooltip: {
                        backgroundColor: 'rgba(17,24,39,0.92)',
                        titleColor: '#f9fafb',
                        bodyColor: '#d1d5db',
                        padding: 10,
                        cornerRadius: 8,
                        callbacks: {
                          label: (ctx) => {
                            const v = ctx.raw;
                            if (chartView === 'weekly') {
                              const i = ctx.dataIndex;
                              if (i >= 5) return v > 0 ? `  ${v}h (Week Off / Holiday)` : '  Week Off / Holiday';
                              return `  ${v}h worked`;
                            }
                            return `  ${v}h total`;
                          }
                        }
                      }
                    },
                    scales: {
                      x: {
                        grid: { display: false },
                        ticks: { font: { size: 11 }, color: '#6b7280' }
                      },
                      y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(0,0,0,0.05)', drawBorder: false },
                        ticks: { font: { size: 10 }, color: '#9ca3af', callback: v => `${v}h` },
                        title: { display: true, text: 'Hours', font: { size: 10 }, color: '#9ca3af' }
                      }
                    }
                  }}
                />
              </div>

              {/* Legend */}
              <div className="d-flex flex-wrap justify-content-center gap-3 mt-3" style={{ fontSize: 11 }}>
                <div className="d-flex align-items-center gap-1">
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: 'rgba(59,130,246,0.75)', display: 'inline-block' }} />
                  <span style={{ color: '#6b7280' }}>Present Days</span>
                </div>
                {chartView === 'weekly' && (
                  <div className="d-flex align-items-center gap-1">
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: 'rgba(156,163,175,0.45)', display: 'inline-block' }} />
                    <span style={{ color: '#6b7280' }}>Week Off / Holidays</span>
                  </div>
                )}
              </div>
            </Card.Body>
          </Card>
        </Col>

        {/* ── Leave Distribution ───────────────────────────────── */}
        <Col lg={6}>
          <Card className="border-0 h-100" style={{ borderRadius: '14px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
            <Card.Header className="bg-white border-0 pt-3 pb-2 px-3" style={{ borderRadius: '14px 14px 0 0' }}>
              <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
                <div className="d-flex align-items-center gap-2">
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(34,197,94,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <FaUmbrellaBeach size={15} color="#22c55e" />
                  </div>
                  <div>
                    <div className="fw-bold" style={{ fontSize: 14, color: '#111827' }}>Leave Distribution</div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>Annual leave breakdown</div>
                  </div>
                </div>
                <div style={{
                  background: 'linear-gradient(135deg,#22c55e,#16a34a)',
                  color: '#fff', borderRadius: 20, padding: '3px 12px',
                  fontSize: 12, fontWeight: 700
                }}>
                  {parseFloat(leaveBalance.total_accrued || 0).toFixed(1)} days total
                </div>
              </div>
            </Card.Header>

            <Card.Body className="p-3 pt-1">
              {(() => {
                const used      = parseFloat(leaveBalance.used) || 0;
                const pending   = parseFloat(leaveBalance.pending) || 0;
                const total     = parseFloat(leaveBalance.total_accrued) || 0;
                const available = Math.max(0, total - used - pending);
                const pct = (v) => total > 0 ? ((v / total) * 100).toFixed(0) : 0;

                const segments = [
                  { label: 'Leave Used',        value: used,      pct: pct(used),      color: '#ef4444', bg: '#fef2f2', icon: '🔴' },
                  { label: 'Remaining Leaves',  value: available, pct: pct(available), color: '#22c55e', bg: '#f0fdf4', icon: '🟢' },
                  { label: 'Pending Approval',  value: pending,   pct: pct(pending),   color: '#f97316', bg: '#fff7ed', icon: '🟠' },
                ];

                return (
                  <div className="d-flex flex-column flex-md-row align-items-center gap-3">
                    {/* Donut chart – bigger & thicker */}
                    <div style={{ width: 200, height: 200, flexShrink: 0, margin: '0 auto' }}>
                      <Doughnut
                        data={leaveChartData}
                        options={{
                          responsive: true,
                          maintainAspectRatio: false,
                          animation: { duration: 700, easing: 'easeInOutQuart' },
                          cutout: '52%',
                          plugins: {
                            legend: { display: false },
                            tooltip: {
                              backgroundColor: 'rgba(17,24,39,0.92)',
                              titleColor: '#f9fafb',
                              bodyColor: '#d1d5db',
                              padding: 10,
                              cornerRadius: 8,
                              callbacks: {
                                label: (ctx) => {
                                  const v = ctx.raw;
                                  return total > 0 ? ` ${v} days (${((v/total)*100).toFixed(0)}%)` : ' No data';
                                }
                              }
                            }
                          }
                        }}
                      />
                    </div>

                    {/* Legend with progress bars */}
                    <div className="flex-grow-1 w-100">
                      {segments.map(seg => (
                        <div key={seg.label} className="mb-3">
                          <div className="d-flex justify-content-between align-items-center mb-1">
                            <div className="d-flex align-items-center gap-1">
                              <span style={{ width: 10, height: 10, borderRadius: '50%', background: seg.color, flexShrink: 0, display: 'inline-block' }} />
                              <span style={{ fontSize: 12, color: '#374151', fontWeight: 500 }}>{seg.label}</span>
                            </div>
                            <div className="d-flex align-items-center gap-2">
                              <span style={{ fontSize: 13, fontWeight: 700, color: seg.color }}>{seg.value.toFixed(1)}d</span>
                              <span style={{ fontSize: 11, color: '#9ca3af', background: '#f3f4f6', borderRadius: 10, padding: '1px 6px' }}>{seg.pct}%</span>
                            </div>
                          </div>
                          <div style={{ height: 6, borderRadius: 99, background: '#f3f4f6', overflow: 'hidden' }}>
                            <div style={{
                              height: '100%', borderRadius: 99,
                              background: seg.color,
                              width: `${Math.max(parseFloat(seg.pct), seg.value > 0 ? 3 : 0)}%`,
                              transition: 'width 0.7s ease'
                            }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </Card.Body>
          </Card>
        </Col>

        {/* Recent Leave Requests */}
        <Col lg={7}>
          <Card className="border-0 shadow-sm">
            <Card.Header className="bg-white py-2 py-md-3 d-flex justify-content-between align-items-center">
              <h6 className="mb-0 small">
                <FaHistory className="me-2 text-primary" />
                Recent Leave Requests
              </h6>
              <Button variant="link" size="sm" onClick={() => navigate('/apply-leave')} className="text-decoration-none p-0">
                View All <FaArrowRight className="ms-1" size={10} />
              </Button>
            </Card.Header>
            <Card.Body className="p-0">
              <div className="table-responsive">
                <Table hover className="mb-0" size="sm">
                  <thead className="bg-light">
                    <tr>
                      <th className="small text-dark">Leave Type</th>
                      <th className="small text-dark d-none d-sm-table-cell">Duration</th>
                      <th className="small text-dark">Date Range</th>
                      <th className="small text-dark d-none d-md-table-cell">Days</th>
                      <th className="small text-dark">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaveRequests.length > 0 ? (
                      leaveRequests.map((leave, index) => (
                        <tr key={leave.id || index}>
                          <td className="small">
                            <Badge bg={leave.leave_type === 'Comp-Off' ? 'purple' : 'secondary'} className="px-2 py-1 text-nowrap">
                              {leave.leave_type === 'Comp-Off' && '🎉 '}{leave.leave_type}
                            </Badge>
                          </td>
                          <td className="small d-none d-sm-table-cell">{leave.leave_duration || 'Full Day'}</td>
                          <td className="small">
                            <span className="text-nowrap">{formatDate(leave.start_date)}</span>
                            {leave.start_date !== leave.end_date && (
                              <span className="text-nowrap d-block d-sm-inline"> - {formatDate(leave.end_date)}</span>
                            )}
                          </td>
                          <td className="small fw-bold d-none d-md-table-cell">{leave.days_count || 1}</td>
                          <td className="small">{getStatusBadge(leave.status)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="5" className="text-center py-4">
                          <FaUmbrellaBeach size={24} className="text-muted mb-2 opacity-50" />
                          <p className="text-muted small mb-2">No leave requests found</p>
                          <Button variant="primary" size="sm" onClick={() => navigate('/apply-leave')}>
                            Apply for Leave
                          </Button>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </Table>
              </div>
            </Card.Body>
          </Card>
        </Col>

        {/* Upcoming Holidays & Quick Actions */}
        {/* <Col lg={5}>
          <Card className="border-0 shadow-sm mb-3">
            <Card.Header className="bg-white py-2 py-md-3 d-flex justify-content-between align-items-center">
              <h6 className="mb-0 small">
                <FaCalendarAlt className="me-2 text-primary" />
                Upcoming Holidays
              </h6>
              <Badge bg="light" text="dark">Next {upcomingHolidays.length}</Badge>
            </Card.Header>
            <Card.Body className="p-0">
              {upcomingHolidays.length > 0 ? (
                <div className="list-group list-group-flush">
                  {upcomingHolidays.map((holiday, index) => (
                    <div key={index} className="list-group-item d-flex justify-content-between align-items-center py-2">
                      <div style={{ maxWidth: '60%' }}>
                        <span className="fw-semibold small text-truncate d-block">{holiday.name}</span>
                        <small className="text-muted d-block">{formatDate(holiday.date)}</small>
                        <div className="mt-1">{getRegionBadge(holiday.region)}</div>
                      </div>
                      <Badge bg="info" pill>{holiday.daysLeft}d</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-3">
                  <p className="text-muted small mb-0">No upcoming holidays</p>
                </div>
              )}
            </Card.Body>
          </Card>

          {compOffHistory.length > 0 && (
            <Card className="border-0 shadow-sm mb-3">
              <Card.Header className="bg-purple text-white py-2">
                <h6 className="mb-0 small fw-semibold">
                  <FaTrophy className="me-2" size={12} />
                  Recent Comp-Off Earnings
                </h6>
              </Card.Header>
              <Card.Body className="p-0">
                <div className="list-group list-group-flush">
                  {compOffHistory.slice(0, 3).map((item, index) => (
                    <div key={index} className="list-group-item py-2">
                      <div className="d-flex justify-content-between align-items-center">
                        <div style={{ maxWidth: '70%' }}>
                          <small className="fw-semibold text-truncate d-block">{item.holiday_name}</small>
                          <small className="text-muted">{formatDate(item.attendance_date)}</small>
                        </div>
                        <Badge bg={item.is_used ? 'secondary' : 'success'} pill>{item.is_used ? 'Used' : `${item.comp_off_days}d`}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </Card.Body>
            </Card>
          )} */}

          {/* <Card className="border-0 shadow-sm">
            <Card.Header className="bg-white py-2 py-md-3">
              <h6 className="mb-0 small">
                <FaBell className="me-2 text-primary" />
                Quick Actions
              </h6>
            </Card.Header>
            <Card.Body className="p-2 p-md-3">
              <div className="d-grid gap-2">
                <Button variant="primary" onClick={() => navigate('/apply-leave')} className="d-flex align-items-center justify-content-between" size="sm">
                  <span><FaUmbrellaBeach className="me-2" size={12} /> Apply for Leave</span>
                  <FaArrowRight size={10} />
                </Button>
                <Button variant="outline-primary" onClick={() => navigate('/attendance')} className="d-flex align-items-center justify-content-between" size="sm">
                  <span><FaClock className="me-2" size={12} /> Mark Attendance</span>
                  <FaArrowRight size={10} />
                </Button>
                <Button variant="outline-success" onClick={() => navigate('/salary-slip')} className="d-flex align-items-center justify-content-between" size="sm">
                  <span><FaChartLine className="me-2" size={12} /> View Salary Slip</span>
                  <FaArrowRight size={10} />
                </Button>
              </div>
            </Card.Body>
          </Card> */}
        {/* </Col> */}
      </Row>

      {/* Clock-out confirmation overlay — waits for the hours check before showing anything,
          so it never flashes the wrong popup (plain vs Half Day warning) while loading. */}
      {showClockOutConfirm && (() => {
        if (clockOutPreview === null) {
          return (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ background: '#fff', borderRadius: 18, padding: '32px 28px', boxShadow: '0 24px 64px rgba(0,0,0,0.22)', textAlign: 'center', maxWidth: 340, width: '90%' }}>
                <Spinner animation="border" variant="warning" style={{ marginBottom: 14 }} />
                <div style={{ color: '#6b7280', fontSize: 14 }}>Checking your hours worked…</div>
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

      {/* Full Performance Rating History Modal */}
      <Modal show={showRatingHistory} onHide={() => setShowRatingHistory(false)} centered size="lg">
        <Modal.Header closeButton style={{ background: '#1e2a3e', border: 'none', padding: '16px 24px' }}>
          <Modal.Title style={{ color: '#fff', fontSize: 15, fontWeight: 700 }}>
            <FaStar className="me-2" style={{ color: '#eab308' }} />
            Full Performance Rating History
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="p-0" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
          {allRatings.length === 0 ? (
            <div className="text-center py-5">
              <FaStar size={40} className="text-muted mb-2 opacity-25" />
              <p className="text-muted mb-0 small">No ratings found</p>
            </div>
          ) : (
            <div>
              {allRatings.map((r, idx) => {
                const color = PERF_COLORS[r.rating] || '#94a3b8';
                const initials = getNameInitials(r.reviewer_name);
                const avatarBg = getRatingAvatarColor(r.reviewer_role);
                return (
                  <div key={r.id || idx} style={{
                    display: 'flex', gap: 14, padding: '16px 20px',
                    borderBottom: idx < allRatings.length - 1 ? '1px solid #f1f5f9' : 'none',
                    alignItems: 'flex-start',
                  }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                      background: avatarBg, color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 700, fontSize: 14,
                    }}>
                      {initials}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 4, marginBottom: 2 }}>
                        <span style={{ fontWeight: 600, fontSize: 13, color: '#0f172a' }}>{getRoleRatedText(r.reviewer_role)}</span>
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>
                          {r.month_name} {r.year}{r.date ? ` · ${fmtRatingDate(r.date)}` : ''}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>{r.reviewer_name}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: r.remark ? 6 : 0, flexWrap: 'wrap' }}>
                        {[1,2,3,4,5].map(n => (
                          <FaStar key={n} size={14} style={{ color: n <= r.rating ? color : '#e2e8f0' }} />
                        ))}
                        <span style={{ fontSize: 12, fontWeight: 600, color, marginLeft: 4 }}>
                          {r.label || getRatingLabel(r.rating)}
                        </span>
                      </div>
                      {r.remark && (
                        <div style={{
                          fontSize: 12, color: '#475569', fontStyle: 'italic',
                          background: '#f8fafc', borderRadius: 6, padding: '6px 10px',
                          borderLeft: `3px solid ${color}`,
                        }}>
                          "{r.remark}"
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Modal.Body>
        <Modal.Footer style={{ padding: '12px 20px' }}>
          <Button variant="secondary" size="sm" onClick={() => setShowRatingHistory(false)}>Close</Button>
        </Modal.Footer>
      </Modal>

      {/* Pending ticket confirmation popup — shown on dashboard load whenever this
          employee has a ticket the team marked resolved (status 'resolved_pending')
          that they haven't yet confirmed or reopened. */}
      <Modal
        show={showTicketConfirmModal && !!activeConfirmTicket}
        onHide={() => setShowTicketConfirmModal(false)}
        centered
      >
        <Modal.Header closeButton style={{ background: '#0f766e', border: 'none' }}>
          <Modal.Title style={{ color: '#fff', fontSize: 16, fontWeight: 700 }}>
            <FaCheckCircle className="me-2" />
            Your Ticket Was Resolved
          </Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ padding: 20 }}>
          {activeConfirmTicket && (
            <>
              <div className="mb-3">
                <div className="small text-muted mb-1">{activeConfirmTicket.ticket_number}</div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{activeConfirmTicket.subject}</div>
              </div>

              {activeConfirmTicket.resolve_note && (
                <div style={{ background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
                  <div className="small fw-semibold text-muted mb-1">What the team said:</div>
                  <div style={{ fontSize: 13.5 }}>{activeConfirmTicket.resolve_note}</div>
                </div>
              )}

              <div className="mb-3" style={{ fontSize: 14 }}>
                Do you need more help with this, or is it resolved and okay to close?
              </div>

              {showTicketDeclineInput ? (
                <div className="mb-3">
                  <Form.Label className="small fw-semibold">What's still wrong? (optional)</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={2}
                    size="sm"
                    value={ticketDeclineNote}
                    onChange={(e) => setTicketDeclineNote(e.target.value)}
                    placeholder="Let the team know what still needs attention"
                  />
                </div>
              ) : null}

              {pendingConfirmTickets.length > 1 && (
                <div className="small text-muted mb-2">
                  <FaInfoCircle className="me-1" />
                  You have {pendingConfirmTickets.length} tickets waiting on your confirmation — this is 1 of {pendingConfirmTickets.length}.
                </div>
              )}
            </>
          )}
        </Modal.Body>
        <Modal.Footer style={{ padding: '12px 20px', flexWrap: 'wrap', gap: 8 }}>
          <Button
            variant="link"
            size="sm"
            className="text-muted me-auto"
            onClick={() => { setShowTicketConfirmModal(false); }}
            disabled={ticketActionLoading}
          >
            Remind me later
          </Button>
          <Button
            variant="outline-secondary"
            size="sm"
            onClick={() => {
              if (activeConfirmTicket) navigate(`/tickets/${activeConfirmTicket.id}`);
              setShowTicketConfirmModal(false);
            }}
          >
            View Full Ticket
          </Button>
          {showTicketDeclineInput ? (
            <Button variant="danger" size="sm" onClick={handleDeclineTicketResolution} disabled={ticketActionLoading}>
              {ticketActionLoading ? <Spinner size="sm" animation="border" /> : "Confirm Reopen"}
            </Button>
          ) : (
            <Button variant="outline-danger" size="sm" onClick={() => setShowTicketDeclineInput(true)} disabled={ticketActionLoading}>
              Still Need Help
            </Button>
          )}
          <Button variant="success" size="sm" onClick={handleConfirmTicketResolved} disabled={ticketActionLoading}>
            {ticketActionLoading ? <Spinner size="sm" animation="border" /> : "Yes, Close Ticket"}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default EmployeeDashboard;