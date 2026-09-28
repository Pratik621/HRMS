
import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Table, Badge, Spinner, Alert, Button, Modal, ButtonGroup, Form } from 'react-bootstrap';
import {
  FaUserCircle,
  FaCalendarAlt,
  FaClock,
  FaUmbrellaBeach,
  FaCheckCircle,
  FaBusinessTime,
  FaCalendarCheck,
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
import './EmployeeDashboard.css';
import BreakWidget from '../Common/BreakWidget';
import DashboardQuickAccess from '../Common/DashboardQuickAccess';
import RecentLeaveRequestsCard from '../Common/RecentLeaveRequestsCard';
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
    return `${ist.getUTCFullYear()}-${p(ist.getUTCMonth() + 1)}-${p(ist.getUTCDate())} ${p(ist.getUTCHours())}:${p(ist.getUTCMinutes())}:${p(ist.getUTCSeconds())}`;
  };

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
      if (error.response?.data?.code === 'MINIMUM_CLOCK_OUT_TIME') {
        setMessage({ type: 'warning', text: error.response.data.message });
      } else {
        setMessage({ type: 'danger', text: error.response?.data?.message || 'Failed to clock out' });
      }
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

  const [allRatings, setAllRatings] = useState([]);
  const [showRatingHistory, setShowRatingHistory] = useState(false);

  const [myDeductions, setMyDeductions] = useState([]);

  const [chartView, setChartView] = useState('weekly');

  const [attendanceChartData, setAttendanceChartData] = useState({
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    datasets: [{
      label: 'Present Days',
      data: [0, 0, 0, 0, 0, 0, 0],
      backgroundColor: Array(5).fill('#6B7280').concat(Array(2).fill('#D1D5DB')),
      borderColor: Array(5).fill('#6B7280').concat(Array(2).fill('#D1D5DB')),
      borderWidth: 0,
      borderRadius: 6,
      barPercentage: 0.6,
      categoryPercentage: 0.75
    }]
  });

  const [monthlyChartData, setMonthlyChartData] = useState({
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    datasets: [{
      label: 'Total Working Hours',
      data: Array(12).fill(0),
      backgroundColor: '#6B7280',
      borderColor: '#6B7280',
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
      backgroundColor: ['#C53030', '#168A70', '#C05621'],
      borderWidth: 3,
      borderColor: '#ffffff',
      hoverOffset: 8
    }]
  });

  const WEEKLY_OFF_DAYS = [0, 6];

  const PERF_LABELS = {
    5: 'Excellent Performer', 4: 'Very Good Performer', 3: 'Meets Expectations',
    2: 'Performance Improvement Plan (PIP)', 1: 'Termination Recommended',
  };
  const PERF_COLORS = { 5: '#168A70', 4: '#3BA58D', 3: '#B7791F', 2: '#C05621', 1: '#C53030' };

  const getRoleRatedText = (role) => {
    const r = (role || '').toLowerCase();
    if (r === 'admin') return 'Admin rated you';
    if (r === 'sub_admin') return 'Manager rated you';
    if (r === 'manager') return 'Team Leader rated you';
    return 'Supervisor rated you';
  };

  const getRatingAvatarColor = (role) => {
    const r = (role || '').toLowerCase();
    if (r === 'admin') return '#2563EB';
    if (r === 'sub_admin') return '#0ea5e9';
    return '#0F766E';
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
  }, [user?.employeeId]);

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
          ...(d.admin_ratings || []).map(r => ({ ...r, _role: 'admin' })),
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

  const loadDashboardData = async ({ silent = false, refreshEvents = false } = {}) => {
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
        refreshEvents ? fetchTodayEvents() : Promise.resolve(),
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
    await loadDashboardData({ refreshEvents: true });
    await fetchAllRatings();
    setRefreshing(false);
    showNotification('Dashboard refreshed!', 'success');
  };

  useEffect(() => {
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
      const year = now.getFullYear();
      const res = await axios.get(
        `${API_ENDPOINTS.DEDUCTIONS_EMPLOYEE(user.employeeId)}?month=${month}&year=${year}`
      );
      setMyDeductions(res.data?.data || []);
    } catch {
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
        backgroundColor: Array(5).fill('#6B7280').concat(Array(2).fill('#D1D5DB')),
        borderColor: Array(5).fill('#6B7280').concat(Array(2).fill('#D1D5DB')),
        borderWidth: 0,
        borderRadius: 6,
        barPercentage: 0.6,
        categoryPercentage: 0.75
      }]
    });

    const hoursByMonth = Array(12).fill(0);
    attendanceHistory.forEach(record => {
      if (!record.clock_in || !record.total_hours) return;
      const m = new Date(record.attendance_date).getMonth(); // 0–11
      hoursByMonth[m] = Math.round((hoursByMonth[m] + (parseFloat(record.total_hours) || 0)) * 10) / 10;
    });

    setMonthlyChartData({
      labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      datasets: [{
        label: 'Total Working Hours',
        data: hoursByMonth,
        backgroundColor: '#6B7280',
        borderColor: '#6B7280',
        borderWidth: 0,
        borderRadius: 6,
        barPercentage: 0.6,
        categoryPercentage: 0.75
      }]
    });
  };

  const updateLeaveChart = () => {
    const used = parseFloat(leaveBalance.used) || 0;
    const pending = parseFloat(leaveBalance.pending) || 0;
    const total = parseFloat(leaveBalance.total_accrued) || 0;
    const available = Math.max(0, total - used - pending);
    const hasData = (used + pending + available) > 0;

    setLeaveChartData({
      labels: ['Leave Used', 'Remaining Leaves', 'Pending Approval'],
      datasets: [{
        data: hasData ? [used, available, pending] : [1, 1, 1],
        backgroundColor: hasData ? ['#C53030', '#168A70', '#C05621'] : ['#e5e7eb', '#e5e7eb', '#e5e7eb'],
        borderWidth: 3,
        borderColor: '#ffffff',
        hoverOffset: 8
      }]
    });
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

  const isClockedInToday = !!activeSession || (!!attendance?.clock_in && !attendance?.clock_out);

  return (
    <div className="hrms-employee-dashboard p-2 p-md-3 p-lg-4" style={{ minHeight: '100vh' }}>

      <WelcomeBanner
        name={employee?.first_name}
        employeeMeta={{
          designation: employee?.designation || 'Employee',
          department: employee?.department || 'Department',
          employeeId: user?.employeeId,
          employmentType: employee?.employment_type || 'Full Time',
        }}
        onRefresh={refreshData}
        refreshing={refreshing}
        belowActions={
          !networkBlocked &&
          !(user?.role === 'housekeeper' ? false : isMobileDevice) && (
            <div className="dashboard-attendance-actions">
              <div
                className={`attendance-status-pill ${isClockedInToday ? 'status-working' : 'status-not-clocked'
                  }`}
              >
                <span className="status-dot"></span>
                {isClockedInToday ? 'Working' : 'Not Clocked In'}
              </div>

              <button
                className={`attendance-action-btn clock-in-btn ${isClockedInToday ? 'action-disabled' : ''
                  }`}
                onClick={handleClockIn}
                disabled={clockLoading || isClockedInToday}
                title="Clock In"
              >
                <FaSignInAlt size={14} />
                <span>{clockLoading ? 'Processing...' : 'Clock In'}</span>
              </button>

              <button
               className={`attendance-action-btn clock-in-btn ${isClockedInToday ? 'action-enabled' : ''
                  }`}
                onClick={openClockOutConfirm}
                disabled={clockLoading || !isClockedInToday}
                title="Clock Out"
              >
                <FaSignOutAlt size={14} />
                <span>Clock Out</span>
              </button>
            </div>
          )
        }
      />

      {message.text && (
        <Alert variant={message.type} onClose={() => setMessage({ type: '', text: '' })} dismissible className="py-2 small">
          {message.text}
        </Alert>
      )}

      <BreakWidget mode="team-panel" />

      <AnnouncementBanner />
      <EmployeeNotices />

      <DashboardQuickAccess
        employeeId={employee?.employee_id}
        leaveBalance={leaveBalance}
        leaveBalanceLoading={loading}
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
        belowInsights={
          <RecentLeaveRequestsCard
            leaveRequests={leaveRequests}
            onViewAll={() => navigate('/apply-leave')}
            onApplyLeave={() => navigate('/apply-leave')}
          />
        }
        footerExtra={
          <div style={{ display: 'flex', gap: 2 }}>
            {renderStars(allRatings.length > 0 ? allRatings.reduce((s, r) => s + r.rating, 0) / allRatings.length : 0)}
          </div>
        }
      />

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

      {/*── Employee Overview + Performance Ratings ──
      <Row className="mb-4">
        <Col xs={12}>
          <Card
            className="border-0"
            style={{
              borderRadius: '16px',
              overflow: 'hidden',
              boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
              background: '#FFFFFF'
            }}
          >
            <div
              className="employee-overview-performance-layout"
              style={{
                display: 'grid',
                alignItems: 'stretch'
              }}
            >

              <div
                style={{
                  padding: '20px',
                  borderRight: '1px solid #E5E7EB'
                }}
              >
                <div
                  style={{
                    fontSize: '14px',
                    fontWeight: 700,
                    color: '#111827',
                    marginBottom: '18px'
                  }}
                >
                  Employee Overview
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    paddingBottom: '17px',
                    borderBottom: '1px solid #F1F5F9'
                  }}
                >
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      color: '#374151'
                    }}
                  >
                    <FaUmbrellaBeach size={14} />
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        color: '#6B7280',
                        fontSize: '11px',
                        fontWeight: 600,
                        marginBottom: '4px'
                      }}
                    >
                      Leave Balance
                    </div>

                    <div
                      style={{
                        color: '#111827',
                        fontSize: '24px',
                        fontWeight: 700,
                        lineHeight: 1.2
                      }}
                    >
                      {leaveBalance.is_probation_complete
                        ? parseFloat(leaveBalance.available).toFixed(1)
                        : parseFloat(leaveBalance.total_accrued).toFixed(1)}
                    </div>

                    <div
                      style={{
                        color: '#9CA3AF',
                        fontSize: '10px',
                        marginTop: '4px'
                      }}
                    >
                      {leaveBalance.is_probation_complete
                        ? `Used: ${parseFloat(leaveBalance.used).toFixed(1)} | Pending: ${parseFloat(leaveBalance.pending).toFixed(1)}`
                        : 'Earned (usable after probation)'}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    padding: '17px 0',
                    borderBottom: '1px solid #F1F5F9'
                  }}
                >
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      color: '#374151'
                    }}
                  >
                    <FaCalendarCheck size={14} />
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        color: '#6B7280',
                        fontSize: '11px',
                        fontWeight: 600,
                        marginBottom: '4px'
                      }}
                    >
                      Present Days
                    </div>

                    <div
                      style={{
                        color: '#111827',
                        fontSize: '24px',
                        fontWeight: 700,
                        lineHeight: 1.2
                      }}
                    >
                      {stats.presentDays || 0}
                    </div>

                    <div
                      style={{
                        color: '#9CA3AF',
                        fontSize: '10px',
                        marginTop: '4px'
                      }}
                    >
                      Absent:{' '}
                      <span
                        style={{
                          color: '#6B7280',
                          fontWeight: 600
                        }}
                      >
                        {stats.absentDays || 0}
                      </span>
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    paddingTop: '17px'
                  }}
                >
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      color: '#374151'
                    }}
                  >
                    <FaBusinessTime size={14} />
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        color: '#6B7280',
                        fontSize: '11px',
                        fontWeight: 600,
                        marginBottom: '4px'
                      }}
                    >
                      Comp-Off Balance
                    </div>

                    <div
                      style={{
                        color: '#111827',
                        fontSize: '24px',
                        fontWeight: 700,
                        lineHeight: 1.2
                      }}
                    >
                      {leaveBalance.comp_off_balance || 0}
                    </div>

                    <div
                      style={{
                        color: '#9CA3AF',
                        fontSize: '10px',
                        marginTop: '4px'
                      }}
                    >
                      Earned on holidays
                    </div>
                  </div>
                </div>
              </div>
              <div
                style={{
                  minWidth: 0,
                  background: '#FFFFFF'
                }}
              >
                <div
                  style={{
                    padding: '14px 20px 12px',
                    borderBottom: '1px solid #E5E7EB',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <div className="d-flex align-items-center gap-2">
                    <div
                      className="d-flex align-items-center justify-content-center"
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        background: '#F3F4F6'
                      }}
                    >
                      <FaStar
                        size={14}
                        style={{ color: '#374151' }}
                      />
                    </div>

                    <div>
                      <div
                        style={{
                          fontSize: '14px',
                          fontWeight: 700,
                          color: '#111827'
                        }}
                      >
                        Performance Ratings
                      </div>

                      <div
                        style={{
                          fontSize: '11px',
                          color: '#9CA3AF'
                        }}
                      >
                        Monthly employee evaluations
                      </div>
                    </div>
                  </div>

                  {allRatings.length > 5 && (
                    <Button
                      variant="link"
                      size="sm"
                      className="p-0 text-decoration-none small"
                      onClick={() => setShowRatingHistory(true)}
                    >
                      View Full History <FaArrowRight size={10} />
                    </Button>
                  )}
                </div>

                {allRatings.length > 0 && (() => {
                  const avg =
                    allRatings.reduce((s, r) => s + r.rating, 0) /
                    allRatings.length;

                  const latest = allRatings[0];

                  return (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1.4fr 0.8fr 1.2fr',
                        background: '#F8F9FA',
                        borderBottom: '1px solid #E5E7EB'
                      }}
                    >
                      <div
                        style={{
                          padding: '12px 16px',
                          borderRight: '1px solid #E5E7EB'
                        }}
                      >
                        <div
                          style={{
                            fontSize: '9px',
                            fontWeight: 700,
                            color: '#9CA3AF',
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                            marginBottom: '6px'
                          }}
                        >
                          Overall Rating
                        </div>

                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '2px'
                            }}
                          >
                            {[1, 2, 3, 4, 5].map(n => (
                              <FaStar
                                key={n}
                                size={12}
                                style={{
                                  color:
                                    n <= Math.round(avg)
                                      ? '#374151'
                                      : '#D1D5DB'
                                }}
                              />
                            ))}
                          </div>

                          <span
                            style={{
                              fontSize: '15px',
                              fontWeight: 700,
                              color: '#111827',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {avg.toFixed(1)} / 5
                          </span>
                        </div>
                      </div>

                      <div
                        style={{
                          padding: '12px 16px',
                          borderRight: '1px solid #E5E7EB'
                        }}
                      >
                        <div
                          style={{
                            fontSize: '9px',
                            fontWeight: 700,
                            color: '#9CA3AF',
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                            marginBottom: '6px'
                          }}
                        >
                          Total Ratings
                        </div>

                        <div
                          style={{
                            fontSize: '20px',
                            lineHeight: 1,
                            fontWeight: 700,
                            color: '#111827'
                          }}
                        >
                          {allRatings.length}
                        </div>
                      </div>

                      <div
                        style={{
                          padding: '12px 16px'
                        }}
                      >
                        <div
                          style={{
                            fontSize: '9px',
                            fontWeight: 700,
                            color: '#9CA3AF',
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                            marginBottom: '6px'
                          }}
                        >
                          Latest Status
                        </div>

                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            minHeight: '23px',
                            padding: '3px 9px',
                            borderRadius: '6px',
                            background: '#E5E7EB',
                            color: '#374151',
                            fontSize: '11px',
                            fontWeight: 600,
                            lineHeight: 1.2
                          }}
                        >
                          {latest.label || getRatingLabel(latest.rating)}
                        </span>
                      </div>
                    </div>
                  );
                })()}

                <Card.Body className="p-0">
                  {allRatings.length === 0 ? (
                    <div
                      style={{
                        padding: '36px 20px',
                        textAlign: 'center'
                      }}
                    >
                      <FaStar
                        size={40}
                        style={{
                          color: '#E2E8F0',
                          marginBottom: 12
                        }}
                      />

                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: 13,
                          color: '#64748B'
                        }}
                      >
                        No Performance Ratings Yet
                      </div>

                      <div
                        style={{
                          fontSize: 12,
                          color: '#94A3B8',
                          marginTop: 4
                        }}
                      >
                        Your manager or admin will rate your performance here.
                      </div>
                    </div>
                  ) : (
                    <div>
                      {allRatings.slice(0, 5).map((r, idx) => {
                        const color = '#374151';
                        const initials = getNameInitials(r.reviewer_name);
                        const avatarBg = '#374151';

                        return (
                          <div
                            key={r.id || idx}
                            style={{
                              display: 'flex',
                              gap: 12,
                              padding: '12px 16px',
                              borderBottom:
                                idx <
                                  Math.min(allRatings.length, 5) - 1
                                  ? '1px solid #F1F5F9'
                                  : 'none',
                              alignItems: 'flex-start'
                            }}
                          >
                            <div
                              style={{
                                width: 36,
                                height: 36,
                                borderRadius: '50%',
                                flexShrink: 0,
                                background: avatarBg,
                                color: '#FFFFFF',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 700,
                                fontSize: 12
                              }}
                            >
                              {initials}
                            </div>

                            <div
                              style={{
                                flex: 1,
                                minWidth: 0
                              }}
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  flexWrap: 'wrap',
                                  gap: 4,
                                  marginBottom: 3
                                }}
                              >
                                <span
                                  style={{
                                    fontWeight: 600,
                                    fontSize: 12,
                                    color: '#0F172A'
                                  }}
                                >
                                  {getRoleRatedText(r.reviewer_role)}
                                </span>

                                <span
                                  style={{
                                    fontSize: 10,
                                    color: '#94A3B8'
                                  }}
                                >
                                  {r.month_name} {r.year}
                                  {r.date
                                    ? ` · ${fmtRatingDate(r.date)}`
                                    : ''}
                                </span>
                              </div>

                              <div
                                style={{
                                  fontSize: 10,
                                  color: '#64748B',
                                  marginBottom: 4
                                }}
                              >
                                {r.reviewer_name}
                              </div>

                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 3,
                                  marginBottom: r.remark ? 5 : 0,
                                  flexWrap: 'wrap'
                                }}
                              >
                                {[1, 2, 3, 4, 5].map(n => (
                                  <FaStar
                                    key={n}
                                    size={12}
                                    style={{
                                      color:
                                        n <= r.rating
                                          ? color
                                          : '#E2E8F0'
                                    }}
                                  />
                                ))}

                                <span
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 600,
                                    color,
                                    marginLeft: 3
                                  }}
                                >
                                  {r.label || getRatingLabel(r.rating)}
                                </span>
                              </div>

                              {r.remark && (
                                <div
                                  style={{
                                    fontSize: 11,
                                    color: '#475569',
                                    fontStyle: 'italic',
                                    background: '#FAFAFA',
                                    borderRadius: 6,
                                    padding: '5px 8px',
                                    borderLeft: `3px solid ${color}`,
                                    marginTop: 3
                                  }}
                                >
                                  "{r.remark}"
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {allRatings.length > 5 && (
                        <div
                          style={{
                            padding: '10px 16px',
                            textAlign: 'center',
                            borderTop: '1px solid #F1F5F9'
                          }}
                        >
                          <Button
                            variant="link"
                            size="sm"
                            className="text-decoration-none p-0 small"
                            onClick={() =>
                              setShowRatingHistory(true)
                            }
                          >
                            View Full History ({allRatings.length} ratings){' '}
                            <FaArrowRight size={10} />
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </Card.Body>
              </div>

            </div>
          </Card>
        </Col>
      </Row>

      <Row className="g-3 g-md-4">

        <Col lg={6}>
          <Card
            className="border-0 h-100"
            style={{
              borderRadius: '16px',
              boxShadow: '0 4px 20px rgba(15, 23, 42, 0.08)',
              background: '#FFFFFF',
              overflow: 'hidden'
            }}
          >
            <Card.Header
              className="bg-white border-0 px-3 px-md-4 pt-3 pb-3"
              style={{
                borderBottom: '1px solid #E5E7EB'
              }}
            >
              <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">

                <div className="d-flex align-items-center gap-2">
                  <div
                    className="d-flex align-items-center justify-content-center flex-shrink-0"
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: '#F3F4F6',
                      color: '#374151'
                    }}
                  >
                    <FaChartBar size={14} />
                  </div>

                  <div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: '#111827'
                      }}
                    >
                      {chartView === 'weekly'
                        ? 'Weekly Attendance'
                        : 'Monthly Attendance Overview'}
                    </div>

                    <div
                      style={{
                        fontSize: 11,
                        color: '#9CA3AF',
                        marginTop: 1
                      }}
                    >
                      {chartView === 'weekly'
                        ? 'Hours worked this week'
                        : 'Total hours per month'}
                    </div>
                  </div>
                </div>

                <div className="attendance-view-toggle">
                  {['weekly', 'monthly'].map(v => (
                    <button
                      key={v}
                      onClick={() => setChartView(v)}
                      className={chartView === v ? 'is-active' : ''}
                    >
                      {v === 'weekly' ? 'Weekly' : 'Monthly'}
                    </button>
                  ))}
                </div>

              </div>
            </Card.Header>

            <Card.Body className="px-3 px-md-4 pt-3 pb-3">

              <div
                style={{
                  height: 260,
                  position: 'relative'
                }}
              >
                <Bar
                  data={
                    chartView === 'weekly'
                      ? attendanceChartData
                      : monthlyChartData
                  }
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,

                    animation: {
                      duration: 600,
                      easing: 'easeInOutQuart'
                    },

                    plugins: {
                      legend: {
                        display: false
                      },

                      tooltip: {
                        backgroundColor: 'rgba(17,24,39,0.94)',
                        titleColor: '#F9FAFB',
                        bodyColor: '#D1D5DB',
                        padding: 10,
                        cornerRadius: 8,

                        callbacks: {
                          label: (ctx) => {
                            const v = ctx.raw;

                            if (chartView === 'weekly') {
                              const i = ctx.dataIndex;

                              if (i >= 5) {
                                return v > 0
                                  ? `  ${v}h (Week Off / Holiday)`
                                  : '  Week Off / Holiday';
                              }

                              return `  ${v}h worked`;
                            }

                            return `  ${v}h total`;
                          }
                        }
                      }
                    },

                    scales: {
                      x: {
                        grid: {
                          display: false
                        },

                        ticks: {
                          font: {
                            size: 11
                          },
                          color: '#6B7280'
                        }
                      },

                      y: {
                        beginAtZero: true,

                        grid: {
                          color: 'rgba(15, 23, 42, 0.05)',
                          drawBorder: false
                        },

                        ticks: {
                          font: {
                            size: 10
                          },
                          color: '#9CA3AF',
                          callback: v => `${v}h`
                        },

                        title: {
                          display: true,
                          text: 'Hours',
                          font: {
                            size: 10
                          },
                          color: '#9CA3AF'
                        }
                      }
                    }
                  }}
                />
              </div>

              <div
                className="d-flex flex-wrap justify-content-center gap-3 mt-2"
                style={{
                  fontSize: 11
                }}
              >
                <div className="d-flex align-items-center gap-1">
                  <span
                    style={{
                      width: 9,
                      height: 9,
                      borderRadius: 3,
                      background: '#6B7280',
                      display: 'inline-block'
                    }}
                  />

                  <span
                    style={{
                      color: '#6B7280'
                    }}
                  >
                    Present Days
                  </span>
                </div>

                {chartView === 'weekly' && (
                  <div className="d-flex align-items-center gap-1">
                    <span
                      style={{
                        width: 9,
                        height: 9,
                        borderRadius: 3,
                        background: '#D1D5DB',
                        display: 'inline-block'
                      }}
                    />

                    <span
                      style={{
                        color: '#6B7280'
                      }}
                    >
                      Week Off / Holidays
                    </span>
                  </div>
                )}
              </div>

            </Card.Body>
          </Card>
        </Col>


        <Col lg={6}>
          <Card
            className="border-0 h-100"
            style={{
              borderRadius: '16px',
              boxShadow: '0 4px 20px rgba(15, 23, 42, 0.08)',
              background: '#FFFFFF',
              overflow: 'hidden'
            }}
          >
            <Card.Header
              className="bg-white border-0 px-3 px-md-4 pt-3 pb-3"
              style={{
                borderBottom: '1px solid #E5E7EB'
              }}
            >
              <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">

                <div className="d-flex align-items-center gap-2">
                  <div
                    className="d-flex align-items-center justify-content-center flex-shrink-0"
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: '#F3F4F6',
                      color: '#374151'
                    }}
                  >
                    <FaUmbrellaBeach size={14} />
                  </div>

                  <div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: '#111827'
                      }}
                    >
                      Leave Distribution
                    </div>

                    <div
                      style={{
                        fontSize: 11,
                        color: '#9CA3AF',
                        marginTop: 1
                      }}
                    >
                      Annual leave breakdown
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    background: '#F3F4F6',
                    color: '#374151',
                    border: '1px solid #E5E7EB',
                    borderRadius: 20,
                    padding: '4px 11px',
                    fontSize: 11,
                    fontWeight: 700
                  }}
                >
                  {parseFloat(
                    leaveBalance.total_accrued || 0
                  ).toFixed(1)}{' '}
                  days total
                </div>

              </div>
            </Card.Header>

            <Card.Body className="px-3 px-md-4 pt-3 pb-3">

              {(() => {
                const used = parseFloat(leaveBalance.used) || 0;
                const pending = parseFloat(leaveBalance.pending) || 0;
                const total = parseFloat(leaveBalance.total_accrued) || 0;
                const available = Math.max(
                  0,
                  total - used - pending
                );

                const pct = (v) =>
                  total > 0
                    ? ((v / total) * 100).toFixed(0)
                    : 0;

                const segments = [
                  {
                    label: 'Leave Used',
                    value: used,
                    pct: pct(used),
                    color: '#C53030',
                    bg: '#FEF2F2',
                    icon: 'Used'
                  },
                  {
                    label: 'Remaining Leaves',
                    value: available,
                    pct: pct(available),
                    color: '#168A70',
                    bg: '#ECFDF3',
                    icon: 'Available'
                  },
                  {
                    label: 'Pending Approval',
                    value: pending,
                    pct: pct(pending),
                    color: '#C05621',
                    bg: '#FFF7ED',
                    icon: 'Pending'
                  }
                ];

                return (
                  <div
                    className="d-flex flex-column flex-md-row align-items-center gap-3"
                    style={{
                      minHeight: 260
                    }}
                  >

                    <div
                      style={{
                        width: 190,
                        height: 190,
                        flexShrink: 0,
                        margin: '0 auto'
                      }}
                    >
                      <Doughnut
                        data={leaveChartData}
                        options={{
                          responsive: true,
                          maintainAspectRatio: false,

                          animation: {
                            duration: 700,
                            easing: 'easeInOutQuart'
                          },

                          cutout: '54%',

                          plugins: {
                            legend: {
                              display: false
                            },

                            tooltip: {
                              backgroundColor: 'rgba(17,24,39,0.94)',
                              titleColor: '#F9FAFB',
                              bodyColor: '#D1D5DB',
                              padding: 10,
                              cornerRadius: 8,

                              callbacks: {
                                label: (ctx) => {
                                  const v = ctx.raw;

                                  return total > 0
                                    ? ` ${v} days (${(
                                      (v / total) *
                                      100
                                    ).toFixed(0)}%)`
                                    : ' No data';
                                }
                              }
                            }
                          }
                        }}
                      />
                    </div>
                    <div className="flex-grow-1 w-100">

                      {segments.map(seg => (
                        <div
                          key={seg.label}
                          className="mb-3"
                        >

                          <div
                            className="d-flex justify-content-between align-items-center mb-1"
                          >

                            <div
                              className="d-flex align-items-center gap-2"
                            >
                              <span
                                style={{
                                  width: 9,
                                  height: 9,
                                  borderRadius: '50%',
                                  background: seg.color,
                                  flexShrink: 0,
                                  display: 'inline-block'
                                }}
                              />

                              <span
                                style={{
                                  fontSize: 12,
                                  color: '#374151',
                                  fontWeight: 500
                                }}
                              >
                                {seg.label}
                              </span>
                            </div>

                            <div
                              className="d-flex align-items-center gap-2"
                            >
                              <span
                                style={{
                                  fontSize: 12,
                                  fontWeight: 700,
                                  color: seg.color
                                }}
                              >
                                {seg.value.toFixed(1)}d
                              </span>

                              <span
                                style={{
                                  fontSize: 10,
                                  color: '#9CA3AF',
                                  background: '#F3F4F6',
                                  borderRadius: 10,
                                  padding: '2px 6px'
                                }}
                              >
                                {seg.pct}%
                              </span>
                            </div>

                          </div>

                          <div
                            className="hrms-progress-track"
                            style={{
                              height: 6,
                              borderRadius: 99,
                              background: '#F3F4F6',
                              overflow: 'hidden'
                            }}
                          >
                            <div
                              className="hrms-progress-fill"
                              style={{
                                height: '100%',
                                borderRadius: 99,
                                background: seg.color,
                                width: `${Math.max(
                                  parseFloat(seg.pct),
                                  seg.value > 0 ? 3 : 0
                                )}%`,
                                transition: 'width 0.7s ease'
                              }}
                            />
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


      </Row>
      */}
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
                      width: 40, height: 40, borderRadius: '10px', flexShrink: 0,
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
                        {[1, 2, 3, 4, 5].map(n => (
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