// src/components/Admin/AdminDashboard.jsx
import React, { useState, useEffect, useRef } from 'react';
import {
  Row, Col, Card, Table, Badge, Spinner, Alert, Form, Button,
  Modal, ButtonGroup, InputGroup
} from 'react-bootstrap';
import {
  FaUsers,
  FaUserCheck,
  FaUserTimes,
  FaCalendarAlt,
  FaBirthdayCake,
  FaTrophy,
  FaChartLine,
  FaBalanceScale,
  FaSearch,
  FaDownload,
  FaClock,
  FaExclamationTriangle,
  FaCheckCircle,
  FaInfoCircle,
  FaUmbrellaBeach,
  FaSyncAlt,
  FaRegClock,
  FaEye,
  FaEyeSlash,
  FaTimesCircle,
  FaFilter,
  FaBuilding,
  FaUserGraduate,
  FaChartBar,
  FaFileAlt,
  FaTrash,
  FaSort,
  FaSortUp,
  FaSortDown,
  FaGift,
  FaStar,
  FaMedal,
  FaArrowLeft,
  FaArrowRight,
  FaHome,
  FaBriefcase,
  FaEnvelope,
  FaPhone,
  FaMapMarkerAlt,
  FaUser,
  FaFingerprint,
  FaSignInAlt,
  FaSignOutAlt
} from 'react-icons/fa';
import { Line, Doughnut, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  Filler
} from 'chart.js';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { loadDashboardCache, saveDashboardCache } from '../../utils/dashboardCache';
import AdminRatings from './AdminRatings';
import BreakWidget from '../Common/BreakWidget';
import TicketBadge from '../Common/TicketBadge';
import DashboardQuickAccess from '../Common/DashboardQuickAccess';
import TicketSummaryWidget from '../Common/TicketSummaryWidget';
import WelcomeBanner from '../Common/WelcomeBanner';
import TeamBreakDashboard from '../Common/TeamBreakDashboard';
import RegularizationPanel from '../Common/RegularizationPanel';
import * as XLSX from 'xlsx';
// import HistoricalLateMarksUpdater from './HistoricalLateMarksUpdater';

// Mirrors backend/config/leavePolicy.js PAID_LEAVE_ELIGIBILITY_MONTHS — display-only,
// the backend remains the authority on actual eligibility.
const PAID_LEAVE_ELIGIBILITY_MONTHS = 3;

// Mobile-only layout fixes — desktop/tablet (>576px) is untouched. The tab bar doesn't
// wrap on its own (ButtonGroup) and the chart legend grids force a fixed column count
// via inline style, so both need an explicit mobile override here.
const ADMIN_DASH_MOBILE_CSS = `
  @media (max-width: 576px) {
    .admin-dash-tabnav {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      padding-bottom: 4px;
      margin-left: -8px;
      margin-right: -8px;
      padding-left: 8px;
      padding-right: 8px;
    }
    .admin-dash-tabnav .btn-group { flex-wrap: nowrap; }
    .admin-dash-tabnav .btn {
      white-space: nowrap;
      font-size: 12.5px;
      padding: 9px 14px;
    }
    .dash-legend-grid { grid-template-columns: 1fr !important; }
  }
`;

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  Filler
);

// ============== MAIN ADMIN DASHBOARD COMPONENT ==============
const AdminDashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [stats, setStats] = useState({
    total: 0,
    present: 0,
    absent: 0,
    onLeave: 0,
    late: 0,
    early: 0,
    halfDay: 0,
    working: 0
  });

  const [recentEmployees, setRecentEmployees] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [employeeLeaveBalances, setEmployeeLeaveBalances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [filterDepartment, setFilterDepartment] = useState('all');
  const [todayAttendance, setTodayAttendance] = useState([]);
  const [filteredAttendance, setFilteredAttendance] = useState([]);
  const [allActiveEmployees, setAllActiveEmployees] = useState([]);
  const [attendanceViewMode, setAttendanceViewMode] = useState('present'); // 'present' | 'absent'
  const [filteredLeaveRequests, setFilteredLeaveRequests] = useState([]);
  const [attendanceSearchTerm, setAttendanceSearchTerm] = useState('');
  const [leaveSearchTerm, setLeaveSearchTerm] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [totalEmployees, setTotalEmployees] = useState(0);
  const [activeTab, setActiveTab] = useState('overview');
  const [regularizationCount, setRegularizationCount] = useState(0);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportType, setExportType] = useState('attendance');
  const [exportDateRange, setExportDateRange] = useState({ start: '', end: '' });
  const [exporting, setExporting] = useState(false);

  const [leaveBalancesLoaded, setLeaveBalancesLoaded] = useState(false);
  const [leaveBalancesLoading, setLeaveBalancesLoading] = useState(false);
  const [leaveBalancePage, setLeaveBalancePage] = useState(1);
  const [birthdayPage, setBirthdayPage] = useState(1);
  const [anniversaryPage, setAnniversaryPage] = useState(1);
  const ITEMS_PER_PAGE = 15;

  // Birthday and Anniversary states
  const [allBirthdays, setAllBirthdays] = useState([]);
  const [allAnniversaries, setAllAnniversaries] = useState([]);
  const [birthdayFilter, setBirthdayFilter] = useState('all');
  const [anniversaryFilter, setAnniversaryFilter] = useState('all');
  const [birthdaySort, setBirthdaySort] = useState('date');
  const [anniversarySort, setAnniversarySort] = useState('date');
  const [birthdaySortOrder, setBirthdaySortOrder] = useState('asc');
  const [anniversarySortOrder, setAnniversarySortOrder] = useState('asc');
  const [birthdaySearch, setBirthdaySearch] = useState('');
  const [anniversarySearch, setAnniversarySearch] = useState('');
  const [birthdayDepartmentFilter, setBirthdayDepartmentFilter] = useState('all');
  const [anniversaryDepartmentFilter, setAnniversaryDepartmentFilter] = useState('all');

  // Chart data states
  const [departmentChartData, setDepartmentChartData] = useState({
    labels: [],
    datasets: [{
      data: [],
      backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40'],
      borderWidth: 0
    }]
  });

  // Sub-admin own attendance states
  const [subAdminAttendance, setSubAdminAttendance] = useState(null);
  const [subAdminSession, setSubAdminSession] = useState(null);
  const [subAdminClockLoading, setSubAdminClockLoading] = useState(false);
  const [subAdminClockMessage, setSubAdminClockMessage] = useState({ type: '', text: '' });
  const [showClockOutConfirm, setShowClockOutConfirm] = useState(false);
  const [clockOutPreview, setClockOutPreview] = useState(null);
  const [perfAnalytics, setPerfAnalytics] = useState(null);

  // Fetches "what would my status be if I clocked out right now" before showing the confirm
  // popup, so the popup can warn about an incomplete shift instead of a bare "are you sure".
  const openClockOutConfirm = async () => {
    setShowClockOutConfirm(true);
    setClockOutPreview(null);
    try {
      const res = await axios.get(API_ENDPOINTS.ATTENDANCE_CLOCK_OUT_PREVIEW(user?.employeeId));
      setClockOutPreview(res.data);
    } catch (err) {
      setClockOutPreview(null);
    }
  };

  // Manager Dashboard "View Team" filter — 'ALL' = company-wide (default, reproduces
  // the pre-filter dashboard exactly). Any other value is a Team Leader/Manager's
  // employee_id, and every fetch below appends it as manager_id so the whole dashboard
  // (not just one card) scopes to that person's team via the existing reporting_manager
  // relationship — see backend/utils/employeeLookup.js getTeamEmployeeIdsByEmployeeId.
  const [selectedManagerId, setSelectedManagerId] = useState('ALL');
  const [managerOptions, setManagerOptions] = useState([]);
  const [managerOptionsLoading, setManagerOptionsLoading] = useState(false);
  const canFilterByTeam = ['admin', 'sub_admin', 'hr'].includes(user?.role);
  const managerIdParam = selectedManagerId !== 'ALL' ? `&manager_id=${selectedManagerId}` : '';

  // Note: today's birthdays/anniversaries are already fetched once per login by
  // NotificationContext itself (see its own `user && token` mount effect) — this dashboard
  // used to also trigger fetchTodayEvents() on its own mount, doubling that request on every
  // visit to this page (quadrupled again under React StrictMode in dev, since neither call
  // site cancelled the other's in-flight request).

  // Re-fetches everything whenever the "View Team" selection changes (including the
  // initial mount, where selectedManagerId is still 'ALL' — same as the old mount-only
  // effect this replaces).
  // Only hydrate from cache on the very first mount (default company-wide 'ALL' view) —
  // never on a later "View Team" filter change, which must always fetch fresh for that team.
  const hasHydratedRef = useRef(false);

  useEffect(() => {
    // AbortController so React 18 StrictMode's dev-only double-invoke of this effect
    // cancels the first (throwaway) round of requests instead of letting both complete —
    // fetchDashboardData/PERFORMANCE_ANALYTICS would otherwise fire twice on every mount.
    const controller = new AbortController();

    let cameFromCache = false;
    if (!hasHydratedRef.current && selectedManagerId === 'ALL' && user?.employeeId) {
      hasHydratedRef.current = true;
      const cached = loadDashboardCache(user.employeeId, 'admin');
      if (cached) {
        cameFromCache = true;
        if (cached.totalEmployees !== undefined) setTotalEmployees(cached.totalEmployees);
        if (cached.stats !== undefined) setStats(cached.stats);
        if (cached.recentEmployees !== undefined) setRecentEmployees(cached.recentEmployees);
        if (cached.allActiveEmployees !== undefined) setAllActiveEmployees(cached.allActiveEmployees);
        if (cached.departmentChartData !== undefined) setDepartmentChartData(cached.departmentChartData);
        if (cached.todayAttendance !== undefined) setTodayAttendance(cached.todayAttendance);
        if (cached.filteredAttendance !== undefined) setFilteredAttendance(cached.filteredAttendance);
        if (cached.leaveRequests !== undefined) setLeaveRequests(cached.leaveRequests);
        if (cached.filteredLeaveRequests !== undefined) setFilteredLeaveRequests(cached.filteredLeaveRequests);
        if (cached.allBirthdays !== undefined) setAllBirthdays(cached.allBirthdays);
        if (cached.allAnniversaries !== undefined) setAllAnniversaries(cached.allAnniversaries);
        setLoading(false);
      }
    }

    fetchDashboardData(controller.signal, cameFromCache);
    axios.get(`${API_ENDPOINTS.PERFORMANCE_ANALYTICS}${selectedManagerId !== 'ALL' ? `?manager_id=${selectedManagerId}` : ''}`, { signal: controller.signal })
      .then(r => { if (r.data.success) setPerfAnalytics(r.data.analytics); })
      .catch(() => {});
    // Leave Balances table is loaded on-demand (its own button) — clear it on filter
    // change so a stale company-wide (or other team's) load never displays under a
    // newly selected team.
    setLeaveBalancesLoaded(false);
    setEmployeeLeaveBalances([]);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedManagerId]);

  // Snapshot the default company-wide view for instant paint on the next login — only
  // while 'ALL' is selected, so a filtered team's data never gets cached as if it were
  // the default view.
  useEffect(() => {
    if (!user?.employeeId || selectedManagerId !== 'ALL' || allActiveEmployees.length === 0) return;
    saveDashboardCache(user.employeeId, 'admin', {
      totalEmployees, stats, recentEmployees, allActiveEmployees, departmentChartData,
      todayAttendance, filteredAttendance, leaveRequests, filteredLeaveRequests,
      allBirthdays, allAnniversaries,
    });
  }, [user?.employeeId, selectedManagerId, totalEmployees, stats, recentEmployees, allActiveEmployees, departmentChartData, todayAttendance, filteredAttendance, leaveRequests, filteredLeaveRequests, allBirthdays, allAnniversaries]);

  // Manager list for the dropdown — Team Leaders (role 'manager') + Managers (role
  // 'sub_admin'), same endpoints/employee_id convention as Add/Edit Employee's
  // Reporting Manager picker. Fetched once; only relevant to roles that can actually
  // see a company-wide dashboard to begin with.
  useEffect(() => {
    if (!canFilterByTeam) return;
    setManagerOptionsLoading(true);
    Promise.all([
      axios.get(API_ENDPOINTS.TEAMS_MANAGERS_LIST),
      axios.get(API_ENDPOINTS.TEAMS_SUB_ADMINS_LIST),
    ])
      .then(([tlRes, saRes]) => {
        const tls = tlRes.data.success ? tlRes.data.managers || [] : [];
        const sas = saRes.data.success ? saRes.data.managers || [] : [];
        setManagerOptions([...tls, ...sas].sort((a, b) => (a.first_name || '').localeCompare(b.first_name || '')));
      })
      .catch(() => {})
      .finally(() => setManagerOptionsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canFilterByTeam]);

  // Admin / Sub-admin (UI "Manager") / HR: fetch own today's attendance on mount —
  // TL (role 'manager') and Employee don't get the clock-in widget on this dashboard.
  useEffect(() => {
    if (['admin', 'sub_admin', 'hr'].includes(user?.role) && user?.employeeId) {
      fetchSubAdminAttendance();
    }
  }, [user]);

  const fetchSubAdminAttendance = async () => {
    try {
      const res = await axios.get(API_ENDPOINTS.ATTENDANCE_TODAY(user.employeeId));
      const att = res.data.attendance;
      const serverSession = res.data.active_session;
      if (att) {
        att.clock_in = att.clock_in_ist || att.clock_in;
        att.clock_out = att.clock_out_ist || att.clock_out;
        setSubAdminAttendance(att);
        if (serverSession) setSubAdminSession(serverSession);
        else if (att.clock_in && !att.clock_out) setSubAdminSession({ session_id: att.session_id || 'inferred' });
        else setSubAdminSession(null);
      } else {
        setSubAdminAttendance(null);
        if (!serverSession) setSubAdminSession(null);
      }
    } catch {
      setSubAdminAttendance(null);
      setSubAdminSession(null);
    }
  };

  const handleSubAdminClockIn = async () => {
    setSubAdminClockLoading(true);
    setSubAdminClockMessage({ type: '', text: '' });
    try {
      const res = await axios.post(API_ENDPOINTS.ATTENDANCE_CLOCK_IN, {
        employee_id: user.employeeId, latitude: null, longitude: null, accuracy: null,
      });
      const t = res.data.clock_in_ist || res.data.clock_in;
      const att = {
        clock_in: t, clock_in_ist: t,
        late_minutes: res.data.late_minutes || 0,
        late_display: res.data.late_display || null,
        status: 'working',
        attendance_date: res.data.attendance_date,
        session_id: res.data.session_id,
      };
      setSubAdminAttendance(att);
      setSubAdminSession({ session_id: res.data.session_id, clock_in_time: t });
      setSubAdminClockMessage({ type: 'success', text: res.data.message || 'Clocked in successfully!' });
    } catch (err) {
      setSubAdminClockMessage({ type: 'error', text: err.response?.data?.message || 'Failed to clock in' });
    } finally {
      setSubAdminClockLoading(false);
    }
  };

  const handleSubAdminClockOut = async () => {
    setSubAdminClockLoading(true);
    setSubAdminClockMessage({ type: '', text: '' });
    try {
      // No pre-check GET before this — attendanceController.clockOut already "Always
      // resolve[s] to the real active session from DB (ignore stale frontend session_id)",
      // so sending whatever session_id is in local state (or none) and letting the backend
      // resolve/validate it itself is just as safe and saves a full round-trip.
      const res = await axios.post(API_ENDPOINTS.ATTENDANCE_CLOCK_OUT, {
        employee_id: user.employeeId, session_id: subAdminSession?.session_id || null,
        latitude: null, longitude: null, accuracy: null,
      });
      const t = res.data.clock_out_ist || res.data.clock_out;
      setSubAdminAttendance(prev => ({
        ...prev, clock_out: t,
        total_hours_display: res.data.total_hours_display,
        status: res.data.status,
      }));
      setSubAdminSession(null);
      setSubAdminClockMessage({ type: 'success', text: res.data.message || 'Clocked out successfully!' });
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to clock out';
      if (message.includes('No active session') || err.response?.data?.already_clocked_out) {
        // Stale local session state (e.g. already clocked out from another tab/device) —
        // reset silently instead of showing an error, matching the old pre-check's behavior.
        setSubAdminSession(null);
        fetchSubAdminAttendance();
      } else {
        setSubAdminClockMessage({ type: 'error', text: message });
      }
    } finally {
      setSubAdminClockLoading(false);
    }
  };

  // Debug: Log leave requests state changes
  useEffect(() => {
    console.log('📊 Leave Requests State Updated:', {
      total: leaveRequests.length,
      filtered: filteredLeaveRequests.length,
      sample: leaveRequests.slice(0, 2)
    });
  }, [leaveRequests, filteredLeaveRequests]);

  useEffect(() => {
    if (!attendanceSearchTerm.trim()) {
      setFilteredAttendance(todayAttendance);
    } else {
      const searchLower = attendanceSearchTerm.toLowerCase();
      const filtered = todayAttendance.filter(att =>
        att.first_name?.toLowerCase().includes(searchLower) ||
        att.last_name?.toLowerCase().includes(searchLower) ||
        att.employee_id?.toLowerCase().includes(searchLower) ||
        `${att.first_name} ${att.last_name}`.toLowerCase().includes(searchLower)
      );
      setFilteredAttendance(filtered);
    }
  }, [attendanceSearchTerm, todayAttendance]);

  useEffect(() => {
    if (!leaveSearchTerm.trim()) {
      setFilteredLeaveRequests(leaveRequests);
    } else {
      const searchLower = leaveSearchTerm.toLowerCase();
      const filtered = leaveRequests.filter(leave =>
        leave.first_name?.toLowerCase().includes(searchLower) ||
        leave.last_name?.toLowerCase().includes(searchLower) ||
        leave.employee_id?.toLowerCase().includes(searchLower) ||
        `${leave.first_name} ${leave.last_name}`.toLowerCase().includes(searchLower)
      );
      setFilteredLeaveRequests(filtered);
    }
  }, [leaveSearchTerm, leaveRequests]);

  const fetchDashboardData = async (signal, silent = false) => {
    try {
      if (!silent) setLoading(true);
      const today = new Date().toISOString().split('T')[0];

      const [employeesRes, attendanceRes, leavesRes] = await Promise.all([
        axios.get(`${API_ENDPOINTS.EMPLOYEES}${selectedManagerId !== 'ALL' ? `?manager_id=${selectedManagerId}` : ''}`, { signal }),
        axios.get(`${API_ENDPOINTS.ATTENDANCE_REPORT}?start=${today}&end=${today}${managerIdParam}`, { signal }),
        axios.get(`${API_ENDPOINTS.LEAVES}?all=true${managerIdParam}`, { signal })
      ]);

      // Process employees
      let employees = [];
      if (employeesRes.data) {
        if (Array.isArray(employeesRes.data)) employees = employeesRes.data;
        else if (employeesRes.data.data) employees = employeesRes.data.data;
        else if (employeesRes.data.employees) employees = employeesRes.data.employees;
      }
      const activeEmployees = employees.filter(emp => emp.is_active !== false);
      setTotalEmployees(activeEmployees.length);
      setStats(prevStats => ({ ...prevStats, total: activeEmployees.length }));
      setRecentEmployees(employees.slice(-5));
      setAllActiveEmployees(activeEmployees);
      fetchCompleteEvents(employees);
      const deptMap = {};
      employees.forEach(emp => {
        if (emp.department) deptMap[emp.department] = (deptMap[emp.department] || 0) + 1;
      });
      setDepartmentChartData({
        labels: Object.keys(deptMap),
        datasets: [{ data: Object.values(deptMap), backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#FF6384', '#36A2EB'], borderWidth: 0 }]
      });

      // Process attendance
      const attendanceData = attendanceRes.data.attendance || [];
      const clockedInData = attendanceData.filter(a => a.clock_in);
      setTodayAttendance(clockedInData);
      setFilteredAttendance(clockedInData);
      updateStats(attendanceData);

      // Process leaves
      let allLeaves = [];
      if (Array.isArray(leavesRes.data)) allLeaves = leavesRes.data;
      else if (leavesRes.data?.data) allLeaves = leavesRes.data.data;
      else if (leavesRes.data?.leaves) allLeaves = leavesRes.data.leaves;
      const pendingLeaves = allLeaves.filter(leave => leave.status === 'pending');
      setLeaveRequests(pendingLeaves);
      setFilteredLeaveRequests(pendingLeaves);

      setLastUpdated(new Date());
    } catch (error) {
      if (axios.isCancel?.(error) || error.code === 'ERR_CANCELED') return;
      console.error('Error fetching dashboard data:', error);
      setMessage({ type: 'danger', text: error.response?.data?.message || 'Failed to load dashboard data' });
    } finally {
      setLoading(false);
    }
  };

  const handleRegularizationApproved = (employeeId) => {
    console.log(`Regularization approved for employee: ${employeeId}`);
    refreshAttendanceData();
    refreshLeaveRequests();
  };

  const fetchCompleteEvents = (employees = null) => {
    try {
      const empList = employees || employeeLeaveBalances;
      const today = new Date();
      const currentYear = today.getFullYear();

      const birthdays = empList.filter(emp => emp.dob).map(emp => {
        const dob = new Date(emp.dob);
        const dobMonth = dob.getMonth() + 1;
        const dobDay = dob.getDate();

        let birthdayThisYear = new Date(currentYear, dobMonth - 1, dobDay);
        let daysLeft = Math.ceil((birthdayThisYear - today) / (1000 * 60 * 60 * 24));
        let status = 'upcoming';

        if (daysLeft < 0) {
          status = 'passed';
          birthdayThisYear = new Date(currentYear + 1, dobMonth - 1, dobDay);
          daysLeft = Math.ceil((birthdayThisYear - today) / (1000 * 60 * 60 * 24));
        } else if (daysLeft === 0) {
          status = 'today';
        }

        const isThisMonth = dobMonth === today.getMonth() + 1;
        let age = currentYear - dob.getFullYear();

        return {
          ...emp,
          daysLeft: daysLeft,
          birthdayDate: `${dob.getDate().toString().padStart(2, '0')}/${dobMonth.toString().padStart(2, '0')}`,
          birthdayFull: dob,
          month: dobMonth,
          day: dobDay,
          status: status,
          isThisMonth: isThisMonth,
          age: age,
          birthYear: dob.getFullYear()
        };
      }).sort((a, b) => {
        if (a.month === b.month) return a.day - b.day;
        return a.month - b.month;
      });

      const anniversaries = empList.filter(emp => emp.joining_date).map(emp => {
        const joiningDate = new Date(emp.joining_date);
        const joiningMonth = joiningDate.getMonth() + 1;
        const joiningDay = joiningDate.getDate();
        let anniversaryThisYear = new Date(currentYear, joiningMonth - 1, joiningDay);
        let daysLeft = Math.ceil((anniversaryThisYear - today) / (1000 * 60 * 60 * 24));
        let status = 'upcoming';

        if (daysLeft < 0) {
          status = 'passed';
          anniversaryThisYear = new Date(currentYear + 1, joiningMonth - 1, joiningDay);
          daysLeft = Math.ceil((anniversaryThisYear - today) / (1000 * 60 * 60 * 24));
        } else if (daysLeft === 0) {
          status = 'today';
        }

        const yearsCompleted = currentYear - joiningDate.getFullYear();
        const isThisMonth = joiningMonth === today.getMonth() + 1;

        return {
          ...emp,
          daysLeft: daysLeft,
          yearsCompleted: yearsCompleted,
          anniversaryDate: `${joiningDate.getDate().toString().padStart(2, '0')}/${joiningMonth.toString().padStart(2, '0')}`,
          joiningFull: joiningDate,
          month: joiningMonth,
          day: joiningDay,
          status: status,
          isThisMonth: isThisMonth,
          joiningYear: joiningDate.getFullYear()
        };
      }).sort((a, b) => {
        if (a.month === b.month) return a.day - b.day;
        return a.month - b.month;
      });

      console.log('ALL Birthdays (sorted by month/day):', birthdays.length);
      console.log('ALL Anniversaries (sorted by month/day):', anniversaries.length);

      setAllBirthdays(birthdays);
      setAllAnniversaries(anniversaries);
    } catch (error) {
      console.error('Error fetching complete events:', error);
    }
  };

  const getFilteredBirthdays = () => {
    let filtered = [...allBirthdays];

    if (birthdaySearch) {
      const searchLower = birthdaySearch.toLowerCase();
      filtered = filtered.filter(emp =>
        emp.first_name?.toLowerCase().includes(searchLower) ||
        emp.last_name?.toLowerCase().includes(searchLower) ||
        emp.employee_id?.toLowerCase().includes(searchLower) ||
        `${emp.first_name} ${emp.last_name}`.toLowerCase().includes(searchLower)
      );
    }

    if (birthdayDepartmentFilter !== 'all') {
      filtered = filtered.filter(emp => emp.department === birthdayDepartmentFilter);
    }

    if (birthdayFilter === 'today') {
      filtered = filtered.filter(emp => emp.status === 'today');
    } else if (birthdayFilter === 'upcoming') {
      filtered = filtered.filter(emp => emp.status === 'upcoming');
    } else if (birthdayFilter === 'passed') {
      filtered = filtered.filter(emp => emp.status === 'passed');
    } else if (birthdayFilter === 'thisMonth') {
      filtered = filtered.filter(emp => emp.isThisMonth);
    }

    filtered.sort((a, b) => {
      let comparison = 0;
      if (birthdaySort === 'date') {
        if (a.month === b.month) comparison = a.day - b.day;
        else comparison = a.month - b.month;
      } else if (birthdaySort === 'name') {
        comparison = (a.first_name || '').localeCompare(b.first_name || '');
      } else if (birthdaySort === 'department') {
        comparison = (a.department || '').localeCompare(b.department || '');
      } else if (birthdaySort === 'month') {
        comparison = a.month - b.month;
      }
      return birthdaySortOrder === 'asc' ? comparison : -comparison;
    });

    return filtered;
  };

  const getFilteredAnniversaries = () => {
    let filtered = [...allAnniversaries];

    if (anniversarySearch) {
      const searchLower = anniversarySearch.toLowerCase();
      filtered = filtered.filter(emp =>
        emp.first_name?.toLowerCase().includes(searchLower) ||
        emp.last_name?.toLowerCase().includes(searchLower) ||
        emp.employee_id?.toLowerCase().includes(searchLower) ||
        `${emp.first_name} ${emp.last_name}`.toLowerCase().includes(searchLower)
      );
    }

    if (anniversaryDepartmentFilter !== 'all') {
      filtered = filtered.filter(emp => emp.department === anniversaryDepartmentFilter);
    }

    if (anniversaryFilter === 'today') {
      filtered = filtered.filter(emp => emp.status === 'today');
    } else if (anniversaryFilter === 'upcoming') {
      filtered = filtered.filter(emp => emp.status === 'upcoming');
    } else if (anniversaryFilter === 'passed') {
      filtered = filtered.filter(emp => emp.status === 'passed');
    } else if (anniversaryFilter === 'thisMonth') {
      filtered = filtered.filter(emp => emp.isThisMonth);
    }

    filtered.sort((a, b) => {
      let comparison = 0;
      if (anniversarySort === 'date') {
        if (a.month === b.month) comparison = a.day - b.day;
        else comparison = a.month - b.month;
      } else if (anniversarySort === 'name') {
        comparison = (a.first_name || '').localeCompare(b.first_name || '');
      } else if (anniversarySort === 'department') {
        comparison = (a.department || '').localeCompare(b.department || '');
      } else if (anniversarySort === 'years') {
        comparison = b.yearsCompleted - a.yearsCompleted;
      } else if (anniversarySort === 'month') {
        comparison = a.month - b.month;
      }
      return anniversarySortOrder === 'asc' ? comparison : -comparison;
    });

    return filtered;
  };

  const refreshAttendanceData = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const attendanceRes = await axios.get(`${API_ENDPOINTS.ATTENDANCE_REPORT}?start=${today}&end=${today}${managerIdParam}`);
      const attendanceData = attendanceRes.data.attendance || [];
      const clockedInData = attendanceData.filter(a => a.clock_in);
      setTodayAttendance(clockedInData);
      setFilteredAttendance(clockedInData);
      updateStats(attendanceData);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Error refreshing attendance:', error);
    }
  };

  const refreshLeaveRequests = async () => {
    try {
      console.log('🔄 Fetching pending leave requests for admin dashboard...');
      const leavesRes = await axios.get(`${API_ENDPOINTS.LEAVES}?all=true${managerIdParam}`);
      console.log('📊 Leave requests response:', leavesRes.data);

      let allLeaves = [];
      if (Array.isArray(leavesRes.data)) {
        allLeaves = leavesRes.data;
      } else if (leavesRes.data && Array.isArray(leavesRes.data.data)) {
        allLeaves = leavesRes.data.data;
      } else if (leavesRes.data && Array.isArray(leavesRes.data.leaves)) {
        allLeaves = leavesRes.data.leaves;
      }

      const pendingLeaves = allLeaves.filter(leave => leave.status === 'pending');

      console.log(`✅ Found ${allLeaves.length} total leaves, ${pendingLeaves.length} pending`);

      setLeaveRequests(pendingLeaves);
      setFilteredLeaveRequests(pendingLeaves);
    } catch (error) {
      console.error('❌ Error refreshing leave requests:', error);
      console.error('Error response:', error.response?.data);
      setLeaveRequests([]);
      setFilteredLeaveRequests([]);
    }
  };

  const loadLeaveBalances = async () => {
    try {
      setLeaveBalancesLoading(true);
      const employeesRes = await axios.get(`${API_ENDPOINTS.EMPLOYEES}${selectedManagerId !== 'ALL' ? `?manager_id=${selectedManagerId}` : ''}`);
      let employees = [];
      if (employeesRes.data) {
        if (Array.isArray(employeesRes.data)) employees = employeesRes.data;
        else if (employeesRes.data.data) employees = employeesRes.data.data;
        else if (employeesRes.data.employees) employees = employeesRes.data.employees;
      }

      const balancesPromises = employees.map(async (emp) => {
        try {
          const balanceRes = await axios.get(API_ENDPOINTS.LEAVE_BALANCE(emp.employee_id));
          return {
            ...emp,
            leaveBalance: {
              available: parseFloat(balanceRes.data.available) || 0,
              total_accrued: parseFloat(balanceRes.data.total_accrued) || 0,
              used: parseFloat(balanceRes.data.used) || 0,
              pending: parseFloat(balanceRes.data.pending) || 0,
              comp_off_balance: parseFloat(balanceRes.data.comp_off_balance) || 0,
              months_completed: balanceRes.data.total_months_from_joining || 0,
              total_months_from_joining: balanceRes.data.total_months_from_joining || 0,
              is_probation_complete: balanceRes.data.is_probation_complete || false,
              is_eligible: balanceRes.data.is_eligible || false
            }
          };
        } catch {
          return {
            ...emp,
            leaveBalance: { available: 0, total_accrued: 0, used: 0, pending: 0, comp_off_balance: 0, months_completed: 0, total_months_from_joining: 0, is_probation_complete: false, is_eligible: false }
          };
        }
      });

      const employeesWithBalance = await Promise.all(balancesPromises);
      setEmployeeLeaveBalances(employeesWithBalance);
      setLeaveBalancesLoaded(true);
      setLeaveBalancePage(1);
    } catch (error) {
      console.error('Error loading leave balances:', error);
      setMessage({ type: 'danger', text: 'Failed to load leave balances' });
    } finally {
      setLeaveBalancesLoading(false);
    }
  };

  const updateStats = (attendanceData) => {
    const total = totalEmployees;

    let present = 0;
    let halfDay = 0;
    let working = 0;
    let absent = 0;
    let late = 0;

    attendanceData.forEach(a => {
      if (a.clock_in && a.clock_out) {
        if (a.status === 'half_day') {
          halfDay++;
        } else {
          present++;
        }
        if (parseFloat(a.late_minutes) > 0) {
          late++;
        }
      }
      else if (a.clock_in && !a.clock_out) {
        working++;
        if (parseFloat(a.late_minutes) > 0) {
          late++;
        }
      }
      else if (!a.clock_in) {
        absent++;
      }
    });

    const onLeave = attendanceData.filter(a => a.is_on_leave || a.status === 'on_leave').length;
    // A company holiday (static calendar or HOL-button, see getAttendanceReport) has no
    // clock_in and isn't a leave — without excluding it here, every employee on a holiday
    // would silently count as Absent in this deficit-based total.
    const holidayCount = attendanceData.filter(a => a.status === 'holiday').length;
    const totalPresent = present + halfDay + working;

    absent = total - totalPresent - onLeave - holidayCount;
    absent = absent < 0 ? 0 : absent;

    setStats({
      total,
      present: totalPresent,
      absent,
      onLeave,
      late,
      early: 0,
      halfDay,
      working
    });
  };

  const getFilteredEmployees = () => {
    let filtered = [...employeeLeaveBalances];

    if (filterDepartment !== 'all') {
      filtered = filtered.filter(emp => emp.department === filterDepartment);
    }

    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(emp =>
        emp.first_name?.toLowerCase().includes(searchLower) ||
        emp.last_name?.toLowerCase().includes(searchLower) ||
        emp.employee_id?.toLowerCase().includes(searchLower) ||
        emp.department?.toLowerCase().includes(searchLower)
      );
    }

    filtered.sort((a, b) => {
      if (sortBy === 'name') {
        return (a.first_name || '').localeCompare(b.first_name || '');
      } else if (sortBy === 'balance') {
        const balanceA = parseFloat(a.leaveBalance?.available) || 0;
        const balanceB = parseFloat(b.leaveBalance?.available) || 0;
        return balanceB - balanceA;
      } else if (sortBy === 'department') {
        return (a.department || '').localeCompare(b.department || '');
      }
      return 0;
    });

    return filtered;
  };

  const handleExport = async () => {
    if (!exportDateRange.start || !exportDateRange.end) {
      setMessage({ type: 'warning', text: 'Please select date range for export' });
      return;
    }
    setExporting(true);
    try {
      if (exportType === 'attendance') {
        const res = await axios.get(`${API_ENDPOINTS.ATTENDANCE_REPORT}?start=${exportDateRange.start}&end=${exportDateRange.end}${managerIdParam}`);
        const records = res.data.attendance || [];
        const rows = records.map((r, i) => ({
          'Sr No': i + 1,
          'Employee ID': r.employee_id,
          'Name': `${r.first_name || ''} ${r.last_name || ''}`.trim(),
          'Department': r.department || '',
          'Date': r.attendance_date,
          'Clock In': r.clock_in_ist || r.clock_in || '',
          'Clock Out': r.clock_out_ist || r.clock_out || '',
          'Total Hours': r.total_hours || '',
          'Late (min)': r.late_minutes || 0,
          'Status': r.status || ''
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
        XLSX.writeFile(wb, `attendance_${exportDateRange.start}_to_${exportDateRange.end}.xlsx`);

      } else if (exportType === 'leave') {
        const res = await axios.get(`${API_ENDPOINTS.LEAVES}?all=true${managerIdParam}`);
        const leaves = (res.data || []).filter(l => {
          const d = l.start_date;
          return d >= exportDateRange.start && d <= exportDateRange.end;
        });
        const rows = leaves.map((l, i) => ({
          'Sr No': i + 1,
          'Employee ID': l.employee_id,
          'Name': `${l.first_name || ''} ${l.last_name || ''}`.trim(),
          'Department': l.department || '',
          'Leave Type': l.leave_type,
          'Duration': l.leave_duration,
          'Start Date': l.start_date,
          'End Date': l.end_date,
          'Days': l.days_count,
          'Status': l.status,
          'Reason': l.reason || ''
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Leaves');
        XLSX.writeFile(wb, `leave_${exportDateRange.start}_to_${exportDateRange.end}.xlsx`);

      } else if (exportType === 'employees') {
        const res = await axios.get(`${API_ENDPOINTS.EMPLOYEES}${selectedManagerId !== 'ALL' ? `?manager_id=${selectedManagerId}` : ''}`);
        const emps = Array.isArray(res.data) ? res.data : res.data?.data || [];
        const rows = emps.map((e, i) => ({
          'Sr No': i + 1,
          'Employee ID': e.employee_id,
          'First Name': e.first_name,
          'Last Name': e.last_name,
          'Email': e.email,
          'Department': e.department,
          'Designation': e.designation,
          'Joining Date': e.joining_date,
          'Employment Type': e.employment_type,
          'Gross Salary': e.gross_salary
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Employees');
        XLSX.writeFile(wb, `employees_list.xlsx`);
      }

      setMessage({ type: 'success', text: 'Export completed successfully!' });
      setShowExportModal(false);
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Export error:', error);
      setMessage({ type: 'danger', text: 'Failed to export data' });
    } finally {
      setExporting(false);
    }
  };

  const departments = ['all', ...new Set(employeeLeaveBalances.map(emp => emp.department).filter(Boolean))];
  const totalLeavesAvailable = employeeLeaveBalances.reduce((sum, emp) => {
    const available = parseFloat(emp.leaveBalance?.available) || 0;
    return sum + available;
  }, 0);

  const averageLeavesPerEmployee = employeeLeaveBalances.length > 0
    ? (totalLeavesAvailable / employeeLeaveBalances.length).toFixed(1)
    : 0;

  const employeesWithLowBalance = employeeLeaveBalances.filter(emp => {
    const available = parseFloat(emp.leaveBalance?.available) || 0;
    return available < 3;
  }).length;

  const formatTime = (datetime) => {
    if (!datetime) return '--:--';
    return new Date(datetime).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const getStatusBadge = (record) => {
    if (record.is_on_leave || record.status === 'on_leave') {
      return <Badge bg="purple" style={{ backgroundColor: '#6f42c1' }}><FaUmbrellaBeach className="me-1" size={10} /> On Leave</Badge>;
    }
    if (!record.clock_in) return <Badge bg="secondary">Not Clocked</Badge>;
    if (!record.clock_out) return <Badge bg="info">Working</Badge>;
    if (record.status === 'present') return <Badge bg="success">Present</Badge>;
    if (record.status === 'half_day') return <Badge bg="warning">Half Day</Badge>;
    return <Badge bg="danger">Absent</Badge>;
  };

  const attendanceChartData = {
    labels: ['Present', 'Absent', 'On Leave', 'Half Day', 'Late'],
    datasets: [{
      data: [stats.present, stats.absent, stats.onLeave, stats.halfDay, stats.late],
      backgroundColor: ['#22c55e', '#ef4444', '#8b5cf6', '#f97316', '#f59e0b'],
      borderWidth: 3,
      borderColor: '#ffffff',
      hoverOffset: 8
    }]
  };

  const uniqueDepartments = [...new Set(allBirthdays.map(emp => emp.department).filter(Boolean))];

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center min-vh-100">
        <div className="text-center">
          <Spinner animation="border" variant="primary" style={{ width: '3rem', height: '3rem' }} />
          <p className="mt-3 text-muted small">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  const filteredEmployees = getFilteredEmployees();
  const filteredBirthdays = getFilteredBirthdays();
  const filteredAnniversaries = getFilteredAnniversaries();

  const presentEmployeeIds = new Set(todayAttendance.map(a => a.employee_id));
  const absentEmployeesToday = allActiveEmployees.filter(emp => !presentEmployeeIds.has(emp.employee_id));
  const filteredAbsentEmployees = attendanceSearchTerm.trim()
    ? absentEmployeesToday.filter(emp => {
        const searchLower = attendanceSearchTerm.toLowerCase();
        return emp.first_name?.toLowerCase().includes(searchLower) ||
          emp.last_name?.toLowerCase().includes(searchLower) ||
          emp.employee_id?.toLowerCase().includes(searchLower) ||
          `${emp.first_name} ${emp.last_name}`.toLowerCase().includes(searchLower);
      })
    : absentEmployeesToday;

  return (
    <div className="p-2 p-md-3 p-lg-4">
      <style>{ADMIN_DASH_MOBILE_CSS}</style>
      {/* Header */}
      <WelcomeBanner
        name={user?.employeeId}
        roleLabel={['sub_admin', 'hr'].includes(user?.role) ? (user?.role === 'hr' ? 'HR Dashboard' : 'Manager Dashboard') : 'Admin Dashboard'}
        onRefresh={() => { fetchDashboardData(); setLeaveBalancesLoaded(false); setEmployeeLeaveBalances([]); }}
        refreshing={loading}
        onExport={() => setShowExportModal(true)}
        headerExtra={canFilterByTeam && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.15)', borderRadius: 16, padding: '4px 10px 4px 12px' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.85)', whiteSpace: 'nowrap' }}>View Team:</span>
            <select
              value={selectedManagerId}
              onChange={(e) => setSelectedManagerId(e.target.value)}
              disabled={managerOptionsLoading}
              title="Filter the whole dashboard by Team Leader/Manager"
              style={{
                background: 'transparent', color: '#fff', border: 'none', fontSize: 12, fontWeight: 700,
                cursor: managerOptionsLoading ? 'not-allowed' : 'pointer', outline: 'none', maxWidth: 160,
              }}
            >
              <option value="ALL" style={{ color: '#111827' }}>All</option>
              {managerOptions.map(m => (
                <option key={m.employee_id} value={m.employee_id} style={{ color: '#111827' }}>
                  {m.first_name} {m.last_name}
                </option>
              ))}
            </select>
          </div>
        )}
      />

      {['admin', 'sub_admin', 'hr'].includes(user?.role) && subAdminClockMessage.text && (
        <div style={{
          fontSize: 12, fontWeight: 500, marginBottom: 16, padding: '8px 14px', borderRadius: 8,
          color: subAdminClockMessage.type === 'success' ? '#065f46' : '#991b1b',
          background: subAdminClockMessage.type === 'success' ? '#ecfdf5' : '#fef2f2',
          border: `1px solid ${subAdminClockMessage.type === 'success' ? '#a7f3d0' : '#fecaca'}`,
        }}>
          {subAdminClockMessage.text}
        </div>
      )}

      {message.text && (
        <Alert variant={message.type} onClose={() => setMessage({ type: '', text: '' })} dismissible className="mb-4">
          {message.text}
        </Alert>
      )}

      <DashboardQuickAccess
        employeeId={user?.employeeId}
        onLeaveScope={selectedManagerId !== 'ALL' ? 'team' : 'company'}
        attendance={subAdminAttendance}
        activeSession={subAdminSession}
        onClockIn={handleSubAdminClockIn}
        onRequestClockOut={openClockOutConfirm}
        clockLoading={subAdminClockLoading}
        readOnly={!['admin', 'sub_admin', 'hr'].includes(user?.role)}
        unlimitedBreaks={(user?.department || '').trim().toLowerCase() === 'sales'}
        managerId={selectedManagerId}
      />

      <TicketSummaryWidget managerId={selectedManagerId} />

      {/* Tab Navigation */}
      <div className="mb-4 admin-dash-tabnav">
        <ButtonGroup>
          <Button
            variant={activeTab === 'overview' ? 'primary' : 'outline-secondary'}
            onClick={() => setActiveTab('overview')}
          >
            <FaChartBar className="me-2" />
            Overview
          </Button>
        
          <Button
            variant={activeTab === 'birthdays' ? 'info' : 'outline-secondary'}
            onClick={() => setActiveTab('birthdays')}
          >
            <FaBirthdayCake className="me-2" />
            Birthdays ({allBirthdays.length})
          </Button>
          <Button
            variant={activeTab === 'anniversaries' ? 'warning' : 'outline-secondary'}
            onClick={() => setActiveTab('anniversaries')}
          >
            <FaTrophy className="me-2" />
            Work Anniversaries ({allAnniversaries.length})
          </Button>
          <Button
            variant={activeTab === 'regularization' ? 'warning' : 'outline-secondary'}
            onClick={() => setActiveTab('regularization')}
          >
            <FaRegClock className="me-2" />
            Regularization Requests
            {regularizationCount > 0 && (
              <Badge bg="danger" pill className="ms-2">
                {regularizationCount}
              </Badge>
            )}
          </Button>
        </ButtonGroup>
      </div>

      {/* Tab Content */}
      {activeTab === 'ratings' && (
        <AdminRatings
          initialMonth={ratingFilterMonth}
          initialYear={ratingFilterYear}
        />
      )}

      {activeTab === 'regularization' && (
        <RegularizationPanel
          onRequestCountChange={setRegularizationCount}
          managerId={selectedManagerId}
        />
      )}

      {activeTab === 'anniversaries' && (
        <Card className="border-0 shadow-sm">
          <Card.Header className="bg-gradient py-3" style={{ background: 'linear-gradient(135deg, #ffd700 0%, #ffed4e 100%)' }}>
            <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-3">
              <div>
                <h5 className="mb-1 d-flex align-items-center">
                  <FaTrophy className="me-2" size={20} />
                  Work Anniversaries
                </h5>
                <p className="mb-0 text-muted small">Complete list of all {allAnniversaries.length} employee work anniversaries</p>
              </div>
              <Badge bg="dark" pill className="px-3 py-2">
                Total: {allAnniversaries.length} Employees
              </Badge>
            </div>
          </Card.Header>
          <Card.Body className="p-3">
            <Row className="mb-3 g-2">
              <Col xs={12} md={3}>
                <div className="d-flex align-items-center bg-light rounded-3 p-1">
                  <FaSearch className="ms-2 text-muted" size={14} />
                  <Form.Control
                    type="text"
                    placeholder="Search by name or ID..."
                    value={anniversarySearch}
                    onChange={(e) => { setAnniversarySearch(e.target.value); setAnniversaryPage(1); }}
                    className="border-0 bg-transparent"
                    size="sm"
                  />
                </div>
              </Col>
              <Col xs={6} md={2}>
                <Form.Select size="sm" value={anniversaryFilter} onChange={(e) => { setAnniversaryFilter(e.target.value); setAnniversaryPage(1); }}>
                  <option value="all">All Anniversaries</option>
                  <option value="today">Today's Anniversaries</option>
                  <option value="upcoming">Upcoming</option>
                  <option value="passed">Passed (This Year)</option>
                  <option value="thisMonth">This Month</option>
                </Form.Select>
              </Col>
              <Col xs={6} md={2}>
                <Form.Select size="sm" value={anniversaryDepartmentFilter} onChange={(e) => { setAnniversaryDepartmentFilter(e.target.value); setAnniversaryPage(1); }}>
                  <option value="all">All Departments</option>
                  {uniqueDepartments.map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </Form.Select>
              </Col>
              <Col xs={6} md={2}>
                <Form.Select size="sm" value={anniversarySort} onChange={(e) => { setAnniversarySort(e.target.value); setAnniversaryPage(1); }}>
                  <option value="date">Sort by Date</option>
                  <option value="name">Sort by Name</option>
                  <option value="department">Sort by Dept</option>
                  <option value="years">Sort by Years</option>
                  <option value="month">Sort by Month</option>
                </Form.Select>
              </Col>
              <Col xs={6} md={1}>
                <Button variant="outline-secondary" size="sm" onClick={() => setAnniversarySortOrder(anniversarySortOrder === 'asc' ? 'desc' : 'asc')} className="w-100">
                  {anniversarySortOrder === 'asc' ? <FaSortUp /> : <FaSortDown />}
                </Button>
              </Col>
              <Col xs={12} md={2}>
                <Button variant="outline-warning" size="sm" onClick={() => {
                  setAnniversarySearch('');
                  setAnniversaryFilter('all');
                  setAnniversaryDepartmentFilter('all');
                  setAnniversarySort('date');
                  setAnniversarySortOrder('asc');
                  setAnniversaryPage(1);
                }} className="w-100">
                  <FaFilter className="me-1" size={12} /> Clear
                </Button>
              </Col>
            </Row>

            {(() => {
              const annTotalPages = Math.ceil(filteredAnniversaries.length / ITEMS_PER_PAGE);
              const annPageData = filteredAnniversaries.slice((anniversaryPage - 1) * ITEMS_PER_PAGE, anniversaryPage * ITEMS_PER_PAGE);
              return (
                <>
                  <div className="table-responsive">
                    <Table striped hover className="mb-0 align-middle">
                      <thead className="bg-light sticky-top">
                        <tr className="small">
                          <th className="fw-normal text-center" style={{ width: '5%' }}>#</th>
                          <th className="fw-normal" style={{ width: '20%' }}>Employee</th>
                          <th className="fw-normal d-none d-md-table-cell" style={{ width: '15%' }}>Department</th>
                          <th className="fw-normal" style={{ width: '12%' }}>Joining Date</th>
                          <th className="fw-normal" style={{ width: '15%' }}>Years</th>
                          <th className="fw-normal" style={{ width: '10%' }}>Status</th>
                          <th className="fw-normal" style={{ width: '8%' }}>Celebration</th>
                        </tr>
                      </thead>
                      <tbody>
                        {annPageData.length > 0 ? (
                          annPageData.map((emp, index) => {
                            const globalIndex = (anniversaryPage - 1) * ITEMS_PER_PAGE + index + 1;
                            return (
                              <tr key={emp.id} className={emp.status === 'today' ? 'table-warning' : ''}>
                                <td className="text-center">{globalIndex}</td>
                                <td className="small">
                                  <div className="fw-semibold text-truncate" style={{ maxWidth: '150px' }}>{emp.first_name} {emp.last_name}</div>
                                  <small className="text-muted">{emp.employee_id}</small>
                                </td>
                                <td className="small d-none d-md-table-cell text-truncate" style={{ maxWidth: '120px' }}>{emp.department}</td>
                                <td className="small"><Badge bg="light" text="dark" pill className="px-2 py-1"><FaCalendarAlt className="me-1" size={10} />{formatDate(emp.joining_date)}</Badge></td>
                                <td className="small"><Badge bg="warning" pill className="px-2 py-1"><FaStar className="me-1" size={10} />{emp.yearsCompleted} Year{emp.yearsCompleted !== 1 ? 's' : ''}</Badge></td>
                                <td className="small">
                                  {emp.status === 'today' ? <Badge bg="success" pill className="px-2 py-1"><FaTrophy className="me-1" size={10} /> Today</Badge>
                                    : emp.status === 'upcoming' ? <Badge bg="info" pill>Upcoming</Badge>
                                    : <Badge bg="secondary" pill>Past</Badge>}
                                </td>
                                <td className="small">
                                  {emp.yearsCompleted === 1 && <Badge bg="info" pill>1st Year 🎉</Badge>}
                                  {emp.yearsCompleted === 5 && <Badge bg="primary" pill>5 Years 🏆</Badge>}
                                  {emp.yearsCompleted === 10 && <Badge bg="success" pill>10 Years 🎊</Badge>}
                                  {emp.yearsCompleted === 20 && <Badge bg="danger" pill>20 Years 👑</Badge>}
                                  {![1, 5, 10, 20].includes(emp.yearsCompleted) && emp.yearsCompleted > 0 && <Badge bg="secondary" pill>{emp.yearsCompleted} Years</Badge>}
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan="7" className="text-center py-4">
                              <FaTrophy size={40} className="text-muted mb-2 opacity-50" />
                              <p className="text-muted mb-0">No anniversaries found matching the filters</p>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </Table>
                  </div>
                  {annTotalPages > 1 && (
                    <div className="d-flex justify-content-between align-items-center mt-3">
                      <small className="text-muted">Showing {((anniversaryPage - 1) * ITEMS_PER_PAGE) + 1}–{Math.min(anniversaryPage * ITEMS_PER_PAGE, filteredAnniversaries.length)} of {filteredAnniversaries.length} anniversaries</small>
                      <ButtonGroup size="sm">
                        <Button variant="outline-secondary" onClick={() => setAnniversaryPage(p => Math.max(1, p - 1))} disabled={anniversaryPage === 1}><FaArrowLeft size={11} /></Button>
                        <Button variant="outline-secondary" disabled>Page {anniversaryPage} of {annTotalPages}</Button>
                        <Button variant="outline-secondary" onClick={() => setAnniversaryPage(p => Math.min(annTotalPages, p + 1))} disabled={anniversaryPage === annTotalPages}><FaArrowRight size={11} /></Button>
                      </ButtonGroup>
                    </div>
                  )}
                  {filteredAnniversaries.length > 0 && (
                    <div className="mt-2 text-center text-muted small">
                      Showing {filteredAnniversaries.length} of {allAnniversaries.length} anniversaries
                    </div>
                  )}
                </>
              );
            })()}
          </Card.Body>
        </Card>
      )}

      {activeTab === 'birthdays' && (
        <Card className="border-0 shadow-sm">
        
          <Card.Body className="p-3">
            <Row className="mb-3 g-2">
              <Col xs={12} md={3}>
                <div className="d-flex align-items-center bg-light rounded-3 p-1">
                  <FaSearch className="ms-2 text-muted" size={14} />
                  <Form.Control
                    type="text"
                    placeholder="Search by name or ID..."
                    value={birthdaySearch}
                    onChange={(e) => { setBirthdaySearch(e.target.value); setBirthdayPage(1); }}
                    className="border-0 bg-transparent"
                    size="sm"
                  />
                </div>
              </Col>
              <Col xs={6} md={2}>
                <Form.Select size="sm" value={birthdayFilter} onChange={(e) => { setBirthdayFilter(e.target.value); setBirthdayPage(1); }}>
                  <option value="all">All Birthdays</option>
                  <option value="today">Today's Birthdays</option>
                  <option value="upcoming">Upcoming</option>
                  <option value="passed">Passed (This Year)</option>
                  <option value="thisMonth">This Month</option>
                </Form.Select>
              </Col>
              <Col xs={6} md={2}>
                <Form.Select size="sm" value={birthdayDepartmentFilter} onChange={(e) => { setBirthdayDepartmentFilter(e.target.value); setBirthdayPage(1); }}>
                  <option value="all">All Departments</option>
                  {uniqueDepartments.map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </Form.Select>
              </Col>
              <Col xs={6} md={2}>
                <Form.Select size="sm" value={birthdaySort} onChange={(e) => { setBirthdaySort(e.target.value); setBirthdayPage(1); }}>
                  <option value="date">Sort by Date</option>
                  <option value="name">Sort by Name</option>
                  <option value="department">Sort by Dept</option>
                  <option value="month">Sort by Month</option>
                </Form.Select>
              </Col>
              <Col xs={6} md={1}>
                <Button variant="outline-secondary" size="sm" onClick={() => setBirthdaySortOrder(birthdaySortOrder === 'asc' ? 'desc' : 'asc')} className="w-100">
                  {birthdaySortOrder === 'asc' ? <FaSortUp /> : <FaSortDown />}
                </Button>
              </Col>
              <Col xs={12} md={2}>
                <Button variant="outline-danger" size="sm" onClick={() => {
                  setBirthdaySearch('');
                  setBirthdayFilter('all');
                  setBirthdayDepartmentFilter('all');
                  setBirthdaySort('date');
                  setBirthdaySortOrder('asc');
                  setBirthdayPage(1);
                }} className="w-100">
                  <FaFilter className="me-1" size={12} /> Clear
                </Button>
              </Col>
            </Row>

            {(() => {
              const bdTotalPages = Math.ceil(filteredBirthdays.length / ITEMS_PER_PAGE);
              const bdPageData = filteredBirthdays.slice((birthdayPage - 1) * ITEMS_PER_PAGE, birthdayPage * ITEMS_PER_PAGE);
              return (
                <>
                  <div className="table-responsive">
                    <Table striped hover className="mb-0 align-middle">
                      <thead className="bg-light sticky-top">
                        <tr className="small">
                          <th className="fw-normal text-center" style={{ width: '5%' }}>#</th>
                          <th className="fw-normal" style={{ width: '25%' }}>Employee</th>
                          <th className="fw-normal d-none d-md-table-cell" style={{ width: '20%' }}>Department</th>
                          <th className="fw-normal" style={{ width: '15%' }}>Birthday</th>
                          <th className="fw-normal" style={{ width: '10%' }}>Age</th>
                          <th className="fw-normal" style={{ width: '15%' }}>Status</th>
                          <th className="fw-normal" style={{ width: '10%' }}>Days Left</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bdPageData.length > 0 ? (
                          bdPageData.map((emp, index) => {
                            const globalIndex = (birthdayPage - 1) * ITEMS_PER_PAGE + index + 1;
                            return (
                              <tr key={emp.id} className={emp.status === 'today' ? 'table-danger' : ''}>
                                <td className="text-center">{globalIndex}</td>
                                <td className="small">
                                  <div className="fw-semibold text-truncate" style={{ maxWidth: '150px' }}>{emp.first_name} {emp.last_name}</div>
                                  <small className="text-muted">{emp.employee_id}</small>
                                </td>
                                <td className="small d-none d-md-table-cell text-truncate" style={{ maxWidth: '120px' }}>{emp.department}</td>
                                <td className="small"><Badge bg="light" text="dark" pill className="px-2 py-1"><FaBirthdayCake className="me-1" size={10} />{emp.birthdayDate}</Badge></td>
                                <td className="small"><Badge bg="secondary" pill className="px-2 py-1">{emp.age} yrs</Badge></td>
                                <td className="small">
                                  {emp.status === 'today' ? <Badge bg="danger" pill className="px-2 py-1"><FaBirthdayCake className="me-1" size={10} /> Today 🎂</Badge>
                                    : emp.status === 'upcoming' ? <Badge bg="info" pill>Upcoming</Badge>
                                    : <Badge bg="secondary" pill>Past</Badge>}
                                </td>
                                <td className="small">
                                  {emp.status === 'today' ? <Badge bg="danger" pill>🎉 Today!</Badge>
                                    : <Badge bg="light" text="dark" pill>{emp.daysLeft} days</Badge>}
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan="7" className="text-center py-4">
                              <FaBirthdayCake size={40} className="text-muted mb-2 opacity-50" />
                              <p className="text-muted mb-0">No birthdays found matching the filters</p>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </Table>
                  </div>
                  {bdTotalPages > 1 && (
                    <div className="d-flex justify-content-between align-items-center mt-3">
                      <small className="text-muted">Showing {((birthdayPage - 1) * ITEMS_PER_PAGE) + 1}–{Math.min(birthdayPage * ITEMS_PER_PAGE, filteredBirthdays.length)} of {filteredBirthdays.length} birthdays</small>
                      <ButtonGroup size="sm">
                        <Button variant="outline-secondary" onClick={() => setBirthdayPage(p => Math.max(1, p - 1))} disabled={birthdayPage === 1}><FaArrowLeft size={11} /></Button>
                        <Button variant="outline-secondary" disabled>Page {birthdayPage} of {bdTotalPages}</Button>
                        <Button variant="outline-secondary" onClick={() => setBirthdayPage(p => Math.min(bdTotalPages, p + 1))} disabled={birthdayPage === bdTotalPages}><FaArrowRight size={11} /></Button>
                      </ButtonGroup>
                    </div>
                  )}
                  {filteredBirthdays.length > 0 && (
                    <div className="mt-2 text-center text-muted small">
                      Showing {filteredBirthdays.length} of {allBirthdays.length} birthdays
                    </div>
                  )}
                </>
              );
            })()}
          </Card.Body>
        </Card>
      )}

      {activeTab === 'overview' && (
        <>
          {/* Quick Stats Cards */}
          <Row className="mb-4 g-2 g-md-3">
            <Col xs={12} sm={6} lg={3}>
              <Card className="border-0 shadow-sm bg-white h-100">
                <Card.Body>
                  <div className="d-flex justify-content-between align-items-center">
                    <div>
                      <h6 className="text-secondary mb-2 small">Total Employees</h6>
                      <h4 className="mb-0 fw-bold">{totalEmployees}</h4>
                      <small className="text-muted">Active employees</small>
                    </div>
                    <FaUsers size={30} className="text-secondary opacity-50" />
                  </div>
                </Card.Body>
              </Card>
            </Col>
            <Col xs={12} sm={6} lg={3}>
              <Card className="border-0 shadow-sm bg-white h-100">
                <Card.Body>
                  <div className="d-flex justify-content-between align-items-center">
                    <div>
                      <h6 className="text-secondary mb-2 small">Present Today</h6>
                      <h4 className="mb-0 fw-bold">{stats.present}</h4>
                      <small className="text-muted">{stats.working} working now</small>
                    </div>
                    <FaUserCheck size={30} className="text-secondary opacity-50" />
                  </div>
                </Card.Body>
              </Card>
            </Col>
            <Col xs={12} sm={6} lg={3}>
              <Card className="border-0 shadow-sm bg-white h-100">
                <Card.Body>
                  <div className="d-flex justify-content-between align-items-center">
                    <div>
                      <h6 className="text-secondary mb-2 small">On Leave / Half Day</h6>
                      <h4 className="mb-0 fw-bold">{stats.onLeave + stats.halfDay}</h4>
                      <small className="text-muted">{stats.halfDay} half day</small>
                    </div>
                    <FaUmbrellaBeach size={30} className="text-secondary opacity-50" />
                  </div>
                </Card.Body>
              </Card>
            </Col>
            <Col xs={12} sm={6} lg={3}>
              <Card className="border-0 shadow-sm bg-white h-100">
                <Card.Body>
                  <div className="d-flex justify-content-between align-items-center">
                    <div>
                      <h6 className="text-secondary mb-2 small">Absent</h6>
                      <h4 className="mb-0 fw-bold">{stats.absent}</h4>
                      <small className="text-muted">{stats.late} late arrivals</small>
                    </div>
                    <FaUserTimes size={30} className="text-secondary opacity-50" />
                  </div>
                </Card.Body>
              </Card>
            </Col>
            <Col xs={12} sm={6} lg={3}>
              <Card className="border-0 shadow-sm bg-white h-100">
                <Card.Body>
                  <div className="d-flex justify-content-between align-items-center">
                    <div>
                      <h6 className="text-secondary mb-2 small">Total Reviews (This Month)</h6>
                      <h4 className="mb-0 fw-bold">{perfAnalytics?.total_reviews ?? '—'}</h4>
                      <small className="text-muted">Pending: {perfAnalytics?.pending_reviews ?? '—'}</small>
                    </div>
                    <FaStar size={30} className="text-secondary opacity-50" />
                  </div>
                </Card.Body>
              </Card>
            </Col>
            <Col xs={12} sm={6} lg={3}>
              <Card className="border-0 shadow-sm bg-white h-100">
                <Card.Body>
                  <div className="d-flex justify-content-between align-items-center">
                    <div>
                      <h6 className="text-secondary mb-2 small">Avg Performance Rating</h6>
                      <h4 className="mb-0 fw-bold">{perfAnalytics?.avg_rating ? `${Number(perfAnalytics.avg_rating).toFixed(1)}/5` : '—'}</h4>
                      <small className="text-muted">Company-wide this month</small>
                    </div>
                    <FaMedal size={30} className="text-secondary opacity-50" />
                  </div>
                </Card.Body>
              </Card>
            </Col>
          </Row>

          {/* Charts Row */}
          <Row className="mb-4 g-3">
            {/* Attendance Distribution */}
            <Col xs={12} md={6}>
              <Card className="border-0 h-100" style={{
                borderRadius: '16px',
                boxShadow: '0 4px 24px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04)',
                background: '#ffffff',
                overflow: 'hidden',
              }}>
                <Card.Header className="bg-white border-0 px-4 pt-4 pb-0" style={{ borderRadius: '16px 16px 0 0' }}>
                  <div className="d-flex align-items-center justify-content-between">
                    <div className="d-flex align-items-center gap-2">
                      <div style={{
                        width: 38, height: 38, borderRadius: 10,
                        background: 'linear-gradient(135deg, rgba(34,197,94,0.15), rgba(22,163,74,0.08))',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 2px 8px rgba(34,197,94,0.2)',
                      }}>
                        <FaUserCheck size={16} color="#22c55e" />
                      </div>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', lineHeight: 1.2 }}>
                          Attendance Distribution
                        </div>
                        <div style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 2 }}>Today's breakdown</div>
                      </div>
                    </div>
                    <div style={{
                      background: '#f0fdf4', border: '1px solid #bbf7d0',
                      borderRadius: 8, padding: '3px 10px',
                    }}>
                      <span style={{ fontSize: 10.5, color: '#16a34a', fontWeight: 600 }}>
                        {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  </div>
                </Card.Header>

                <Card.Body className="px-4 pb-4 pt-3">
                  {(() => {
                    const total = stats.present + stats.absent + stats.onLeave + stats.halfDay + stats.late;
                    const segments = [
                      { label: 'Present',  value: stats.present,  color: '#22C55E', bg: '#f0fdf4', border: '#bbf7d0' },
                      { label: 'Late',     value: stats.late,      color: '#F97316', bg: '#fff7ed', border: '#fed7aa' },
                      { label: 'Absent',   value: stats.absent,    color: '#EF4444', bg: '#fef2f2', border: '#fecaca' },
                      { label: 'On Leave', value: stats.onLeave,   color: '#8B5CF6', bg: '#faf5ff', border: '#e9d5ff' },
                      { label: 'Half Day', value: stats.halfDay,   color: '#EAB308', bg: '#fefce8', border: '#fef08a' },
                    ];
                    const pct = (v) => total > 0 ? ((v / total) * 100).toFixed(1) : '0.0';

                    const centerPlugin = {
                      id: 'attCenterText',
                      beforeDraw(chart) {
                        const { ctx, chartArea } = chart;
                        if (!chartArea) return;
                        const cx = (chartArea.left + chartArea.right) / 2;
                        const cy = (chartArea.top + chartArea.bottom) / 2;
                        ctx.save();
                        ctx.font = 'bold 26px Inter, system-ui, sans-serif';
                        ctx.fillStyle = '#111827';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(String(total), cx, cy - 10);
                        ctx.font = '500 9.5px Inter, system-ui, sans-serif';
                        ctx.fillStyle = '#9ca3af';
                        ctx.fillText("Today's", cx, cy + 8);
                        ctx.fillText('Attendance', cx, cy + 20);
                        ctx.restore();
                      },
                    };

                    const chartData = {
                      labels: segments.map(s => s.label),
                      datasets: [{
                        data: segments.map(s => s.value),
                        backgroundColor: segments.map(s => s.color),
                        borderWidth: 3,
                        borderColor: '#ffffff',
                        hoverBorderColor: '#ffffff',
                        hoverBorderWidth: 4,
                        hoverOffset: 14,
                      }],
                    };

                    const emptyData = {
                      labels: ['No data'],
                      datasets: [{
                        data: [1],
                        backgroundColor: ['#f3f4f6'],
                        borderWidth: 0,
                        hoverOffset: 0,
                      }],
                    };

                    return (
                      <>
                        {/* Donut chart centred */}
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
                          <div style={{ width: 220, height: 220 }}>
                            <Doughnut
                              data={total > 0 ? chartData : emptyData}
                              options={{
                                responsive: true,
                                maintainAspectRatio: false,
                                animation: {
                                  duration: 1000,
                                  easing: 'easeInOutQuart',
                                  animateRotate: true,
                                  animateScale: false,
                                },
                                cutout: '55%',
                                plugins: {
                                  legend: { display: false },
                                  tooltip: total > 0 ? {
                                    backgroundColor: 'rgba(15,23,42,0.93)',
                                    titleColor: '#f8fafc',
                                    bodyColor: '#cbd5e1',
                                    borderColor: 'rgba(255,255,255,0.08)',
                                    borderWidth: 1,
                                    padding: { top: 10, bottom: 10, left: 14, right: 14 },
                                    cornerRadius: 10,
                                    displayColors: true,
                                    boxWidth: 8,
                                    boxHeight: 8,
                                    boxPadding: 5,
                                    callbacks: {
                                      title: (items) => items[0]?.label,
                                      label: (ctx) =>
                                        ` ${ctx.raw} employees · ${(ctx.raw / total * 100).toFixed(1)}%`,
                                    },
                                  } : { enabled: false },
                                },
                                elements: {
                                  arc: { borderRadius: 4 },
                                },
                              }}
                              plugins={total > 0 ? [centerPlugin] : []}
                            />
                          </div>
                        </div>

                        {/* Badge-style legend grid */}
                        <div className="dash-legend-grid" style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          gap: 8,
                          marginBottom: 14,
                        }}>
                          {segments.map(seg => (
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
                                e.currentTarget.style.boxShadow = '0 6px 16px ' + seg.color + '20';
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
                                <div style={{ fontSize: 10.5, color: '#6b7280', fontWeight: 500 }}>
                                  {seg.label}
                                </div>
                                <div style={{
                                  display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 1,
                                }}>
                                  <span style={{
                                    fontSize: 18, fontWeight: 700, color: '#111827', lineHeight: 1,
                                  }}>
                                    {seg.value}
                                  </span>
                                  <span style={{ fontSize: 11, fontWeight: 600, color: seg.color }}>
                                    {pct(seg.value)}%
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Footer: total employees */}
                        <div style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '10px 16px',
                          background: 'linear-gradient(135deg, #f8fafc, #f1f5f9)',
                          borderRadius: 10,
                          border: '1px solid #e2e8f0',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <FaUsers size={12} color="#64748b" />
                            <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>
                              Total Employees Tracked
                            </span>
                          </div>
                          <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>
                            {totalEmployees}
                          </span>
                        </div>
                      </>
                    );
                  })()}
                </Card.Body>
              </Card>
            </Col>
            {/* Live Attendance Feed — compact card */}
            <Col xs={12} md={6}>
              <Card className="border-0 h-100" style={{ borderRadius: '14px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
                <Card.Header className="bg-white border-0 pt-3 pb-2 px-3" style={{ borderRadius: '14px 14px 0 0' }}>
                  <div className="d-flex align-items-center justify-content-between gap-2 flex-wrap">
                    <div className="d-flex align-items-center gap-2">
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(16,185,129,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <FaClock size={14} color="#10b981" />
                      </div>
                      <div>
                        <div className="fw-bold" style={{ fontSize: 14, color: '#111827' }}>Live Attendance</div>
                        <div style={{ fontSize: 11, color: '#9ca3af' }}>
                          {attendanceViewMode === 'present' ? "Today's clock-in feed" : "Employees not clocked in today"}
                        </div>
                      </div>
                    </div>
                    <Badge bg={attendanceViewMode === 'present' ? 'dark' : 'danger'} className="px-2 py-1" style={{ fontSize: 11 }}>
                      {attendanceViewMode === 'present' ? `${filteredAttendance.length} Present` : `${filteredAbsentEmployees.length} Absent`}
                    </Badge>
                  </div>
                  <div className="mt-2 d-flex align-items-center gap-2">
                    <div className="btn-group" role="group" style={{ flexShrink: 0 }}>
                      <Button
                        size="sm"
                        variant={attendanceViewMode === 'present' ? 'success' : 'outline-secondary'}
                        onClick={() => setAttendanceViewMode('present')}
                        style={{ fontSize: 12, fontWeight: 600, padding: '4px 10px' }}
                      >
                        Present
                      </Button>
                      <Button
                        size="sm"
                        variant={attendanceViewMode === 'absent' ? 'danger' : 'outline-secondary'}
                        onClick={() => setAttendanceViewMode('absent')}
                        style={{ fontSize: 12, fontWeight: 600, padding: '4px 10px' }}
                      >
                        Absent
                      </Button>
                    </div>
                    <InputGroup size="sm">
                      <InputGroup.Text style={{ background: '#f9fafb', border: '1px solid #e5e7eb' }}><FaSearch size={11} color="#9ca3af" /></InputGroup.Text>
                      <Form.Control
                        type="text" placeholder="Search employee..." value={attendanceSearchTerm}
                        onChange={e => setAttendanceSearchTerm(e.target.value)}
                        style={{ background: '#f9fafb', border: '1px solid #e5e7eb', fontSize: 12 }}
                      />
                      {attendanceSearchTerm && (
                        <Button variant="outline-secondary" size="sm" onClick={() => setAttendanceSearchTerm('')}>
                          <FaTimesCircle size={11} />
                        </Button>
                      )}
                    </InputGroup>
                  </div>
                </Card.Header>
                <Card.Body className="p-0">
                  <div style={{ maxHeight: 450, overflowY: 'auto' }}>
                    {attendanceViewMode === 'absent' ? (
                      filteredAbsentEmployees.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '32px 0', color: '#9ca3af' }}>
                          <FaUsers size={24} style={{ marginBottom: 8, opacity: 0.4 }} />
                          <div style={{ fontSize: 13 }}>No absent employees 🎉</div>
                        </div>
                      ) : filteredAbsentEmployees.map((emp, i) => {
                        const ACLRS = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#0ea5e9'];
                        const clr = ACLRS[((emp.first_name||'').charCodeAt(0)||0) % ACLRS.length];
                        return (
                          <div key={emp.employee_id || i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderBottom: '1px solid #f9fafb' }}>
                            <div style={{ width: 32, height: 32, borderRadius: '50%', background: clr, color: '#fff', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: 0.6 }}>
                              {((emp.first_name||'')[0]||'?').toUpperCase()}{((emp.last_name||'')[0]||'').toUpperCase()}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {emp.first_name} {emp.last_name}
                              </div>
                              <div style={{ fontSize: 12, color: '#9ca3af' }}>
                                {emp.department || emp.employee_id}
                              </div>
                            </div>
                            <Badge bg="danger" style={{ fontSize: 11, flexShrink: 0 }}>Absent</Badge>
                          </div>
                        );
                      })
                    ) : filteredAttendance.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '32px 0', color: '#9ca3af' }}>
                        <FaClock size={24} style={{ marginBottom: 8, opacity: 0.4 }} />
                        <div style={{ fontSize: 13 }}>No attendance records today</div>
                      </div>
                    ) : filteredAttendance.map((att, i) => {
                      const lateMinutes = parseFloat(att.late_minutes) || 0;
                      let lateDisplay = null;
                      if (lateMinutes > 0) {
                        const ts = Math.floor(lateMinutes * 60);
                        const h = Math.floor(ts / 3600), m = Math.floor((ts % 3600) / 60), s = ts % 60;
                        const parts = [];
                        if (h > 0) parts.push(`${h}h`);
                        if (m > 0) parts.push(`${m}m`);
                        if (s > 0 || (!h && !m)) parts.push(`${s}s`);
                        lateDisplay = parts.join(' ');
                      }
                      let statusBg = 'secondary', statusLabel = 'Not Clocked';
                      if (att.clock_in) {
                        if (att.clock_out) {
                          const mins = Math.round((new Date(att.clock_out) - new Date(att.clock_in)) / 60000);
                          const h = Math.floor(mins / 60), m = mins % 60;
                          const dur = `${h}h ${m}m`;
                          if (mins >= 540) { statusBg = 'success'; statusLabel = `Done · ${dur}`; }
                          else if (mins >= 300) { statusBg = 'warning'; statusLabel = `Half · ${dur}`; }
                          else { statusBg = 'danger'; statusLabel = `Short · ${dur}`; }
                        } else { statusBg = 'info'; statusLabel = 'Working'; }
                      }
                      const ACLRS = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#0ea5e9'];
                      const clr = ACLRS[((att.first_name||'').charCodeAt(0)||0) % ACLRS.length];
                      return (
                        <div key={att.id || i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderBottom: '1px solid #f9fafb' }}>
                          <div style={{ width: 32, height: 32, borderRadius: '50%', background: clr, color: '#fff', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            {((att.first_name||'')[0]||'?').toUpperCase()}{((att.last_name||'')[0]||'').toUpperCase()}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {att.first_name} {att.last_name}
                            </div>
                            <div style={{ fontSize: 12, color: '#9ca3af' }}>
                              {att.department || att.employee_id}
                              {lateDisplay && <span style={{ color: '#f97316', marginLeft: 6, fontWeight: 600 }}>· Late {lateDisplay}</span>}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>{formatTime(att.clock_in) || '--'}</div>
                            <Badge bg={statusBg} style={{ fontSize: 11 }}>{statusLabel}</Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card.Body>
              </Card>
            </Col>
            {/* Department Distribution — removed */}
            {/* <Col xs={12} md={6}>
              <Card className="border-0 h-100" style={{ borderRadius: '14px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
                <Card.Header className="bg-white border-0 pt-3 pb-2 px-3" style={{ borderRadius: '14px 14px 0 0' }}>
                  <div className="d-flex align-items-center gap-2">
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(99,102,241,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <FaBuilding size={15} color="#6366f1" />
                    </div>
                    <div>
                      <div className="fw-bold" style={{ fontSize: 14, color: '#111827' }}>Department Distribution</div>
                      <div style={{ fontSize: 11, color: '#9ca3af' }}>Employees per department</div>
                    </div>
                  </div>
                </Card.Header>
                <Card.Body className="p-3 pt-1">
                  {(() => {
                    const DEPT_COLORS = ['#6366f1','#22c55e','#f97316','#ef4444','#f59e0b','#8b5cf6','#06b6d4','#ec4899'];
                    const labels = departmentChartData.labels || [];
                    const values = departmentChartData.datasets[0]?.data || [];
                    const deptTotal = values.reduce((s, v) => s + v, 0);
                    const pct = (v) => deptTotal > 0 ? ((v / deptTotal) * 100).toFixed(0) : 0;

                    const coloredData = {
                      labels,
                      datasets: [{
                        data: values,
                        backgroundColor: labels.map((_, i) => DEPT_COLORS[i % DEPT_COLORS.length]),
                        borderWidth: 3,
                        borderColor: '#ffffff',
                        hoverOffset: 8
                      }]
                    };

                    return (
                      <div className="d-flex flex-column flex-sm-row align-items-center gap-3">
                        <div style={{ width: 180, height: 180, flexShrink: 0, margin: '0 auto' }}>
                          <Doughnut
                            data={coloredData}
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
                                    label: (ctx) => deptTotal > 0
                                      ? ` ${ctx.raw} employees (${((ctx.raw/deptTotal)*100).toFixed(0)}%)`
                                      : ' No data'
                                  }
                                }
                              }
                            }}
                          />
                        </div>
                        <div className="flex-grow-1 w-100" style={{ maxHeight: 220, overflowY: labels.length > 5 ? 'auto' : 'visible' }}>
                          {labels.length === 0 ? (
                            <p style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', marginTop: 40 }}>No department data</p>
                          ) : labels.map((dept, i) => (
                            <div key={dept} className="mb-2">
                              <div className="d-flex justify-content-between align-items-center mb-1">
                                <div className="d-flex align-items-center gap-1">
                                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: DEPT_COLORS[i % DEPT_COLORS.length], display: 'inline-block', flexShrink: 0 }} />
                                  <span style={{ fontSize: 12, color: '#374151', fontWeight: 500 }} className="text-truncate" title={dept}>{dept}</span>
                                </div>
                                <div className="d-flex align-items-center gap-2">
                                  <span style={{ fontSize: 13, fontWeight: 700, color: DEPT_COLORS[i % DEPT_COLORS.length] }}>{values[i]}</span>
                                  <span style={{ fontSize: 11, color: '#9ca3af', background: '#f3f4f6', borderRadius: 10, padding: '1px 6px' }}>{pct(values[i])}%</span>
                                </div>
                              </div>
                              <div style={{ height: 5, borderRadius: 99, background: '#f3f4f6', overflow: 'hidden' }}>
                                <div style={{
                                  height: '100%', borderRadius: 99,
                                  background: DEPT_COLORS[i % DEPT_COLORS.length],
                                  width: `${Math.max(parseFloat(pct(values[i])), values[i] > 0 ? 3 : 0)}%`,
                                  transition: 'width 0.7s ease'
                                }} />
                              </div>
                            </div>
                          ))}
                          {labels.length > 0 && (
                            <div className="mt-2 pt-2" style={{ borderTop: '1px solid #f3f4f6' }}>
                              <span style={{ fontSize: 11, color: '#6b7280' }}>Total employees: </span>
                              <span style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{deptTotal}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </Card.Body>
              </Card>
            </Col> */}
          </Row>

          {/* Team Break Dashboard */}
          <TeamBreakDashboard managerId={selectedManagerId} />

          {/* Pending Leave Requests */}
          <Card className="mb-4 border-0 shadow-sm">
            <Card.Header className="bg-light d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center py-3 gap-2">
              <h5 className="mb-0 text-dark d-flex align-items-center">
                <FaCalendarAlt className="me-2" />
                <span>Pending Leave Requests</span>
                {filteredLeaveRequests.length > 0 && (
                  <Badge bg="warning" pill className="ms-2">
                    {filteredLeaveRequests.length}
                  </Badge>
                )}
              </h5>
              <div className="d-flex gap-2">
                <InputGroup size="sm" style={{ width: '250px' }}>
                  <InputGroup.Text><FaSearch size={12} /></InputGroup.Text>
                  <Form.Control type="text" placeholder="Search by name or ID..." value={leaveSearchTerm} onChange={(e) => setLeaveSearchTerm(e.target.value)} />
                  {leaveSearchTerm && <Button variant="outline-secondary" onClick={() => setLeaveSearchTerm('')} size="sm"><FaTimesCircle size={12} /></Button>}
                </InputGroup>
                <Badge bg="light" text="dark" className="px-3 py-2">{filteredLeaveRequests.length} / {leaveRequests.length} Pending</Badge>
                <Button
                  variant="outline-primary"
                  size="sm"
                  onClick={() => navigate('/admin/leave-requests')}
                  className="d-flex align-items-center"
                >
                  <FaEye className="me-1" size={12} />
                  View All
                </Button>
                <Button
                  variant="outline-success"
                  size="sm"
                  onClick={refreshLeaveRequests}
                  className="d-flex align-items-center"
                >
                  <FaSyncAlt className="me-1" size={12} />
                  Refresh
                </Button>
              </div>
            </Card.Header>
            <Card.Body className="p-0">
              <div className="table-responsive" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                <Table striped size="sm" className="mb-0">
                  <thead className="bg-light sticky-top">
                    <tr className="small">
                      <th className="fw-normal text-center">#</th>
                      <th className="fw-normal">Employee</th>
                      <th className="fw-normal d-none d-md-table-cell">Leave Type</th>
                      <th className="fw-normal">Date Range</th>
                      <th className="fw-normal">Days</th>
                      <th className="fw-normal">Applied Date</th>
                      <th className="fw-normal">Status</th>
                      <th className="fw-normal text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLeaveRequests.length > 0 ? (
                      filteredLeaveRequests.slice(0, 10).map((leave, index) => (
                        <tr key={leave.id}>
                          <td className="text-center">{index + 1}</td>
                          <td className="small">
                            <div className="text-truncate" style={{ maxWidth: '100px' }}>
                              {leave.first_name} {leave.last_name}
                            </div>
                            <small className="text-muted">{leave.employee_id}</small>
                          </td>
                          <td className="d-none d-md-table-cell">
                            <Badge bg="secondary" className="small">{leave.leave_type}</Badge>
                          </td>
                          <td className="small">
                            <span className="text-nowrap">{new Date(leave.start_date).toLocaleDateString()}</span>
                            {leave.start_date !== leave.end_date && (
                              <span className="text-nowrap d-block">- {new Date(leave.end_date).toLocaleDateString()}</span>
                            )}
                          </td>
                          <td className="small fw-bold">{leave.days_count || 1}</td>
                          <td className="small">
                            {leave.applied_date ? new Date(leave.applied_date).toLocaleDateString() : 'N/A'}
                          </td>
                          <td>
                            <Badge bg="warning" className="small">Pending</Badge>
                          </td>
                          <td className="text-center">
                            <Button
                              variant="outline-primary"
                              size="sm"
                              onClick={() => navigate('/admin/leave-requests')}
                              title="View Details"
                            >
                              <FaEye size={12} />
                            </Button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="8" className="text-center py-4">
                          <FaCalendarAlt size={30} className="text-muted mb-2 opacity-50" />
                          <p className="text-muted mb-0">No pending leave requests found</p>
                          <Button
                            variant="link"
                            size="sm"
                            onClick={() => navigate('/admin/leave-requests')}
                            className="mt-2"
                          >
                            View All Leave Requests →
                          </Button>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </Table>
              </div>
              {filteredLeaveRequests.length > 10 && (
                <div className="p-3 text-center border-top">
                  <small className="text-muted">
                    Showing first 10 of {filteredLeaveRequests.length} pending requests
                  </small>
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => navigate('/admin/leave-requests')}
                    className="ms-2"
                  >
                    View All →
                  </Button>
                </div>
              )}
            </Card.Body>
          </Card>

          {/* Employee Leave Balances */}
          <Card className="mb-4 border-0 shadow-sm">
            <Card.Header className="bg-white d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center py-3 gap-2">
              <h5 className="mb-0 d-flex align-items-center">
                <FaBalanceScale className="me-2 text-dark" />
                <span>Employee Leave Balances</span>
              </h5>
              {leaveBalancesLoaded && (
                <div className="d-flex gap-2">
                  <InputGroup size="sm" style={{ width: '250px' }}>
                    <InputGroup.Text><FaSearch size={12} /></InputGroup.Text>
                    <Form.Control
                      type="text"
                      placeholder="Search by name or ID..."
                      value={searchTerm}
                      onChange={(e) => { setSearchTerm(e.target.value); setLeaveBalancePage(1); }}
                    />
                    {searchTerm && (
                      <Button variant="outline-secondary" onClick={() => { setSearchTerm(''); setLeaveBalancePage(1); }} size="sm">
                        <FaTimesCircle size={12} />
                      </Button>
                    )}
                  </InputGroup>
                  <Badge bg="light" text="dark" className="px-3 py-2">
                    {filteredEmployees.length} / {employeeLeaveBalances.length} Employees
                  </Badge>
                </div>
              )}
            </Card.Header>
            <Card.Body>
              {!leaveBalancesLoaded && !leaveBalancesLoading && (
                <div className="text-center py-5">
                  <FaBalanceScale size={40} className="text-muted mb-3 opacity-25" />
                  <p className="text-muted mb-3">Leave balance data is not loaded to keep the dashboard fast.</p>
                  <Button variant="outline-primary" onClick={loadLeaveBalances}>
                    <FaBalanceScale className="me-2" size={13} />
                    Load Leave Balances
                  </Button>
                </div>
              )}

              {leaveBalancesLoading && (
                <div className="text-center py-5">
                  <Spinner animation="border" variant="primary" />
                  <p className="text-muted small mt-3">Loading leave balances for all employees...</p>
                </div>
              )}

              {leaveBalancesLoaded && (() => {
                const leaveBalanceTotalPages = Math.ceil(filteredEmployees.length / ITEMS_PER_PAGE);
                const leaveBalancePageData = filteredEmployees.slice((leaveBalancePage - 1) * ITEMS_PER_PAGE, leaveBalancePage * ITEMS_PER_PAGE);
                return (
                  <>
                    <div className="mb-3">
                      <div className="d-flex flex-wrap gap-2 align-items-center">
                        <small className="text-muted me-2">Filter by Department:</small>
                        <ButtonGroup size="sm">
                          <Button variant={filterDepartment === 'all' ? 'primary' : 'outline-secondary'} onClick={() => { setFilterDepartment('all'); setLeaveBalancePage(1); }}>All</Button>
                          {departments.filter(d => d !== 'all').map(dept => (
                            <Button key={dept} variant={filterDepartment === dept ? 'primary' : 'outline-secondary'} onClick={() => { setFilterDepartment(dept); setLeaveBalancePage(1); }}>{dept}</Button>
                          ))}
                        </ButtonGroup>
                        {(searchTerm || filterDepartment !== 'all') && (
                          <Button variant="outline-danger" size="sm" onClick={() => { setSearchTerm(''); setFilterDepartment('all'); setSortBy('name'); setLeaveBalancePage(1); }}>Clear Filters</Button>
                        )}
                      </div>
                    </div>

                    <div className="table-responsive">
                      <Table striped hover size="sm" className="mb-0">
                        <thead className="bg-light sticky-top" style={{ top: 0, zIndex: 10 }}>
                          <tr className="small">
                            <th className="fw-normal text-center">#</th>
                            <th className="fw-normal" style={{ cursor: 'pointer' }} onClick={() => setSortBy('name')}>Employee{sortBy === 'name' && <FaSort className="ms-1" size={10} />}</th>
                            <th className="fw-normal d-none d-md-table-cell" style={{ cursor: 'pointer' }} onClick={() => setSortBy('department')}>Department{sortBy === 'department' && <FaSort className="ms-1" size={10} />}</th>
                            <th className="fw-normal">Total Accrued</th>
                            <th className="fw-normal">Used</th>
                            <th className="fw-normal" style={{ cursor: 'pointer' }} onClick={() => setSortBy('balance')}>Available{sortBy === 'balance' && <FaSort className="ms-1" size={10} />}</th>
                            <th className="fw-normal">Status</th>
                            <th className="fw-normal d-none d-lg-table-cell">Probation</th>
                          </tr>
                        </thead>
                        <tbody>
                          {leaveBalancePageData.length > 0 ? (
                            leaveBalancePageData.map((emp, index) => {
                              const globalIndex = (leaveBalancePage - 1) * ITEMS_PER_PAGE + index + 1;
                              const totalAccrued = parseFloat(emp.leaveBalance?.total_accrued) || 0;
                              const used = parseFloat(emp.leaveBalance?.used) || 0;
                              const available = parseFloat(emp.leaveBalance?.available) || 0;
                              const monthsCompleted = emp.leaveBalance?.months_completed || 0;
                              const isProbationComplete = emp.leaveBalance?.is_probation_complete || false;
                              const displayAvailable = isProbationComplete ? available : totalAccrued;
                              const isProbation = !isProbationComplete && monthsCompleted < PAID_LEAVE_ELIGIBILITY_MONTHS;

                              return (
                                <tr key={emp.id} className={isProbation ? 'table-light' : ''}>
                                  <td className="text-center small">{globalIndex}</td>
                                  <td className="small">
                                    <div className="fw-semibold text-truncate" style={{ maxWidth: '150px' }} title={`${emp.first_name} ${emp.last_name}`}>{emp.first_name} {emp.last_name}</div>
                                    <small className="text-muted">{emp.employee_id}</small>
                                    {isProbation && <Badge bg="info" pill className="ms-1" style={{ fontSize: '8px' }}>Probation</Badge>}
                                  </td>
                                  <td className="small d-none d-md-table-cell text-truncate" style={{ maxWidth: '120px' }} title={emp.department}>{emp.department || 'N/A'}</td>
                                  <td className="small fw-bold text-primary">{totalAccrued.toFixed(1)}</td>
                                  <td className="small text-danger">{used.toFixed(1)}</td>
                                  <td className="small"><Badge bg={displayAvailable <= 0 ? 'danger' : displayAvailable < 3 ? 'warning' : 'success'} pill className="px-2 py-1">{displayAvailable.toFixed(1)}</Badge></td>
                                  <td className="small">{displayAvailable <= 0 ? <Badge bg="danger" pill>No Leaves</Badge> : displayAvailable < 3 ? <Badge bg="warning" pill>Low</Badge> : <Badge bg="success" pill>Good</Badge>}</td>
                                  <td className="small d-none d-lg-table-cell">{isProbation ? <Badge bg="info" pill>{monthsCompleted}/{PAID_LEAVE_ELIGIBILITY_MONTHS} months</Badge> : <Badge bg="success" pill>Completed</Badge>}</td>
                                </tr>
                              );
                            })
                          ) : (
                            <tr><td colSpan="8" className="text-center py-4"><p className="text-muted mb-0 small">No employees found matching your search</p></td></tr>
                          )}
                        </tbody>
                      </Table>
                    </div>

                    {leaveBalanceTotalPages > 1 && (
                      <div className="d-flex justify-content-between align-items-center mt-3">
                        <small className="text-muted">
                          Showing {((leaveBalancePage - 1) * ITEMS_PER_PAGE) + 1}–{Math.min(leaveBalancePage * ITEMS_PER_PAGE, filteredEmployees.length)} of {filteredEmployees.length} employees
                        </small>
                        <ButtonGroup size="sm">
                          <Button variant="outline-secondary" onClick={() => setLeaveBalancePage(p => Math.max(1, p - 1))} disabled={leaveBalancePage === 1}><FaArrowLeft size={11} /></Button>
                          <Button variant="outline-secondary" disabled>Page {leaveBalancePage} of {leaveBalanceTotalPages}</Button>
                          <Button variant="outline-secondary" onClick={() => setLeaveBalancePage(p => Math.min(leaveBalanceTotalPages, p + 1))} disabled={leaveBalancePage === leaveBalanceTotalPages}><FaArrowRight size={11} /></Button>
                        </ButtonGroup>
                      </div>
                    )}

                    <div className="mt-3 pt-2 border-top">
                      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
                        <small className="text-muted">Showing {filteredEmployees.length} of {employeeLeaveBalances.length} employees</small>
                        <div className="d-flex gap-3">
                          <small className="text-muted"><Badge bg="success" pill className="me-1">&nbsp;</Badge>Good Balance (&ge;3 days)</small>
                          <small className="text-muted"><Badge bg="warning" pill className="me-1">&nbsp;</Badge>Low Balance (&lt;3 days)</small>
                          <small className="text-muted"><Badge bg="danger" pill className="me-1">&nbsp;</Badge>No Balance (0 days)</small>
                        </div>
                      </div>
                      <div className="mt-2 text-center">
                        <small className="text-muted"><FaInfoCircle className="me-1" size={10} />Employees on probation see their Total Accrued leaves (usable after probation completion)</small>
                      </div>
                    </div>
                  </>
                );
              })()}
            </Card.Body>
          </Card>
        </>
      )}

      {/* Export Modal */}
      <Modal show={showExportModal} onHide={() => setShowExportModal(false)} centered>
        <Modal.Header closeButton><Modal.Title className="h6"><FaFileAlt className="me-2" />Export Reports</Modal.Title></Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3"><Form.Label>Report Type</Form.Label><Form.Select value={exportType} onChange={(e) => setExportType(e.target.value)}><option value="attendance">Attendance Report</option><option value="leave">Leave Report</option><option value="employees">Employees List</option></Form.Select></Form.Group>
            {exportType !== 'employees' && (<><Form.Group className="mb-3"><Form.Label>Start Date</Form.Label><Form.Control type="date" value={exportDateRange.start} onChange={(e) => setExportDateRange({ ...exportDateRange, start: e.target.value })} /></Form.Group><Form.Group className="mb-3"><Form.Label>End Date</Form.Label><Form.Control type="date" value={exportDateRange.end} onChange={(e) => setExportDateRange({ ...exportDateRange, end: e.target.value })} /></Form.Group></>)}
          </Form>
        </Modal.Body>
        <Modal.Footer><Button variant="secondary" size="sm" onClick={() => setShowExportModal(false)}>Cancel</Button><Button variant="success" size="sm" onClick={handleExport} disabled={exporting}>{exporting ? <><Spinner size="sm" animation="border" className="me-2" />Exporting...</> : <><FaDownload className="me-2" />Export</>}</Button></Modal.Footer>
      </Modal>
      <style>{'@keyframes dashspin { to { transform: rotate(360deg); } }'}</style>

      {showClockOutConfirm && (() => {
        const willBeHalfDay = clockOutPreview?.is_clocked_in && clockOutPreview.status_if_clocked_out_now !== 'present';
        return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 18, padding: '32px 28px', boxShadow: '0 24px 64px rgba(0,0,0,0.22)', textAlign: 'center', maxWidth: 340, width: '90%' }}>
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
                onClick={() => { setShowClockOutConfirm(false); handleSubAdminClockOut(); }}
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

export default AdminDashboard;