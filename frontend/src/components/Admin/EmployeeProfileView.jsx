// src/components/Admin/EmployeeProfileView.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { Row, Col, Badge, Spinner, Alert, Button, Modal } from 'react-bootstrap';
import {
  FaUser, FaEnvelope, FaPhone, FaCalendarAlt, FaMapMarkerAlt,
  FaBriefcase, FaUniversity, FaCreditCard, FaIdCard,
  FaEdit, FaArrowLeft, FaClock, FaUmbrellaBeach, FaCheckCircle,
  FaTimesCircle, FaHourglassHalf, FaChartBar, FaHistory,
  FaBuilding, FaUserTie, FaTint, FaVenusMars, FaStar,
  FaDownload, FaFileAlt, FaChartLine, FaCalendar, FaFileContract,
  FaTrophy, FaExclamationTriangle, FaEye, FaFilePdf,
  FaAward, FaBell, FaCheckDouble,
  FaCalendarCheck, FaClipboardList
} from 'react-icons/fa';
import { Bar, Doughnut, Line, Radar } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  PointElement, LineElement, ArcElement, Title, Tooltip, Legend, Filler, RadarController
} from 'chart.js';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';
import { useNavigate, useParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import AttendanceCalendar from './AttendanceCalendar';
import { useAuth } from '../../context/AuthContext';

ChartJS.register(
  CategoryScale, LinearScale, BarElement,
  PointElement, LineElement, ArcElement,
  Title, Tooltip, Legend, Filler, RadarController
);

// ─── tiny helpers ─────────────────────────────────────────────────────────────

const fmtDate = (d) => {
  if (!d) return 'N/A';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const fmtCurrency = (v) => {
  if (!v) return 'N/A';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(v);
};

const tenure = (joiningDate) => {
  if (!joiningDate) return 'N/A';
  const diff = Date.now() - new Date(joiningDate).getTime();
  const years  = Math.floor(diff / (1000 * 60 * 60 * 24 * 365));
  const months = Math.floor((diff % (1000 * 60 * 60 * 24 * 365)) / (1000 * 60 * 60 * 24 * 30));
  if (years > 0) return `${years}y ${months}m`;
  return `${months} months`;
};

const fmtTimeIST = (v) => {
  if (!v) return '--:--';
  try {
    const s = String(v).trim();
    let h, m;
    if (s.includes(' ') && !s.includes('T')) {
      [h, m] = s.split(' ')[1].split(':');
    } else if (s.includes('T')) {
      const d = new Date(s);
      const ist = new Date(d.getTime() + 5.5 * 3600 * 1000);
      h = ist.getUTCHours(); m = String(ist.getUTCMinutes()).padStart(2, '0');
    } else return '--:--';
    h = parseInt(h, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
  } catch { return '--:--'; }
};

// ─── stat card ─────────────────────────────────────────────────────────────────
const StatCard = ({ label, value, color = '#6366f1', icon, sub }) => (
  <div style={{
    background: '#fff', borderRadius: 12, padding: '16px 18px',
    boxShadow: '0 1px 8px rgba(0,0,0,0.07)', height: '100%',
    borderLeft: `4px solid ${color}`
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div>
        <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
        <div style={{ fontSize: 26, fontWeight: 800, color: '#111827', marginTop: 4, lineHeight: 1 }}>{value ?? '—'}</div>
        {sub && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>{sub}</div>}
      </div>
      <div style={{ width: 36, height: 36, borderRadius: 8, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {React.cloneElement(icon, { size: 16, color })}
      </div>
    </div>
  </div>
);

// ─── info row ──────────────────────────────────────────────────────────────────
const Info = ({ label, value, icon }) => (
  <div style={{ marginBottom: 14 }}>
    <div style={{ fontSize: 11, color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
      {icon && React.cloneElement(icon, { size: 10 })}
      {label}
    </div>
    <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', wordBreak: 'break-word' }}>{value || 'N/A'}</div>
  </div>
);

// ─── section card ──────────────────────────────────────────────────────────────
const Section = ({ title, icon, color = '#6366f1', children }) => (
  <div style={{ background: '#fff', borderRadius: 12, padding: '20px', boxShadow: '0 1px 8px rgba(0,0,0,0.06)', marginBottom: 20 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid #f3f4f6' }}>
      <div style={{ width: 28, height: 28, borderRadius: 7, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {React.cloneElement(icon, { size: 13, color })}
      </div>
      <span style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>{title}</span>
    </div>
    {children}
  </div>
);

// ─── tab button ────────────────────────────────────────────────────────────────
const Tab = ({ label, icon, active, onClick }) => (
  <button
    onClick={onClick}
    style={{
      border: 'none', background: 'none', cursor: 'pointer',
      padding: '10px 16px', fontSize: 13, fontWeight: 600,
      color: active ? '#6366f1' : '#6b7280',
      borderBottom: active ? '2px solid #6366f1' : '2px solid transparent',
      display: 'flex', alignItems: 'center', gap: 6,
      whiteSpace: 'nowrap', transition: 'all 0.15s'
    }}
  >
    {React.cloneElement(icon, { size: 12 })} {label}
  </button>
);

// ─── chart options preset ──────────────────────────────────────────────────────
const barOpts = (ylabel = 'Hours') => ({
  responsive: true, maintainAspectRatio: false,
  animation: { duration: 600 },
  plugins: {
    legend: { display: false },
    tooltip: { backgroundColor: 'rgba(17,24,39,0.92)', cornerRadius: 8, padding: 10 }
  },
  scales: {
    x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#9ca3af' } },
    y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { size: 10 }, color: '#9ca3af', callback: v => `${v}${ylabel === 'Days' ? '' : 'h'}` } }
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
const EmployeeProfileView = () => {
  const { employeeId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  // UAN is more sensitive than PAN/Aadhar (shown to everyone who can reach this page) —
  // explicitly scoped to admin/HR only, excluding sub_admin (Manager) even though the route
  // itself also allows sub_admin in.
  const canSeeUan = user?.role === 'admin' || user?.role === 'hr';

  const [activeTab, setActiveTab] = useState('overview');
  const [employee, setEmployee]   = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');

  // attendance
  const [attSummary, setAttSummary]   = useState(null);
  const [attHistory, setAttHistory]   = useState([]);
  const [attFilter, setAttFilter]     = useState({ year: new Date().getFullYear(), month: '' });
  const [attLoading, setAttLoading]   = useState(false);

  // leave
  const [leaveBalance, setLeaveBalance] = useState(null);
  const [leaveHistory, setLeaveHistory] = useState([]);

  // ratings
  const [ratings, setRatings] = useState({ manager_ratings: [], admin_ratings: [], manager_average: null, admin_average: null });

  // documents
  const [documents, setDocuments] = useState([]);

  // activities/timeline
  const [activities, setActivities] = useState([]);

  // analytics
  const [overtimeData, setOvertimeData] = useState({ total: 0, monthly: [] });
  const [performanceTrend, setPerformanceTrend] = useState([]);

  // ── load employee profile ───────────────────────────────────────────────────
  useEffect(() => {
    if (!employeeId) return;
    (async () => {
      try {
        setLoading(true);
        const res = await axios.get(`${API_ENDPOINTS.EMPLOYEES}/${employeeId}`);
        // Try by employee_id if not found by numeric id
        let emp = res.data;
        if (!emp || emp.error) {
          // fallback: search by employee_id field
          // Viewing one specific employee's own profile page must work regardless of their
          // active status (an admin needs this to review/reactivate a deactivated account) —
          // explicitly ask for everyone, since the backend now defaults to active-only.
          const list = await axios.get(API_ENDPOINTS.EMPLOYEES, { params: { active: 'all' } });
          const all = Array.isArray(list.data) ? list.data : list.data?.data || [];
          emp = all.find(e => e.employee_id === employeeId);
        }
        setEmployee(emp);
        if (emp) {
          loadAttendanceSummary(emp.employee_id);
          loadLeaveBalance(emp.employee_id);
          loadRatings(emp.employee_id);
          loadDocuments(emp.employee_id);
          loadActivities(emp.employee_id);
        }
      } catch (err) {
        // try fetching all and filtering
        try {
          // Viewing one specific employee's own profile page must work regardless of their
          // active status (an admin needs this to review/reactivate a deactivated account) —
          // explicitly ask for everyone, since the backend now defaults to active-only.
          const list = await axios.get(API_ENDPOINTS.EMPLOYEES, { params: { active: 'all' } });
          const all = Array.isArray(list.data) ? list.data : list.data?.data || [];
          const emp = all.find(e => e.employee_id === employeeId || String(e.id) === String(employeeId));
          if (emp) {
            setEmployee(emp);
            loadAttendanceSummary(emp.employee_id);
            loadLeaveBalance(emp.employee_id);
            loadRatings(emp.employee_id);
            loadDocuments(emp.employee_id);
            loadActivities(emp.employee_id);
          } else {
            setError('Employee not found');
          }
        } catch {
          setError('Failed to load employee');
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [employeeId]);

  // ── attendance summary (current cycle) ─────────────────────────────────────
  const loadAttendanceSummary = async (empId) => {
    try {
      const today = new Date();
      const year  = today.getFullYear();
      const month = today.getMonth();
      const cycleStart = today.getDate() >= 26
        ? new Date(year, month, 26)
        : new Date(year, month - 1, 26);
      const cycleEnd = today.getDate() >= 26
        ? new Date(year, month + 1, 25)
        : new Date(year, month, 25);
      const start = cycleStart.toISOString().split('T')[0];
      const end   = (today < cycleEnd ? today : cycleEnd).toISOString().split('T')[0];

      const res = await axios.get(API_ENDPOINTS.ATTENDANCE_EMPLOYEE_REPORT(empId, start, end));
      const recs = res.data.attendance || [];

      let present = 0, absent = 0, late = 0, totalHours = 0, wOff = 0;
      let d = new Date(cycleStart);
      while (d <= today) {
        const ds = d.toISOString().split('T')[0];
        const dow = d.getDay();
        if (dow === 0 || dow === 6) { wOff++; }
        else {
          const r = recs.find(x => x.attendance_date === ds);
          if (r && (r.clock_in || r.status === 'present')) { present++; totalHours += parseFloat(r.total_hours) || 0; }
          else absent++;
          if (r && parseFloat(r.late_minutes) > 0) late++;
        }
        d.setDate(d.getDate() + 1);
      }
      const workingDays = present + absent;
      setAttSummary({ present, absent, late, totalHours: Math.round(totalHours * 10) / 10, wOff, workingDays, pct: workingDays > 0 ? ((present / workingDays) * 100).toFixed(0) : 0 });
      setAttHistory(recs);
    } catch { /* non-fatal */ }
  };

  // ── filtered attendance for history table ───────────────────────────────────
  const loadAttendanceFiltered = useCallback(async (empId) => {
    if (!empId) return;
    setAttLoading(true);
    try {
      const y = attFilter.year;
      const m = attFilter.month;
      let start, end;
      if (m) {
        start = `${y}-${String(m).padStart(2, '0')}-01`;
        const lastDay = new Date(y, parseInt(m), 0).getDate();
        end = `${y}-${String(m).padStart(2, '0')}-${lastDay}`;
      } else {
        start = `${y}-01-01`;
        end = `${y}-12-31`;
      }
      const today = new Date().toISOString().split('T')[0];
      if (end > today) end = today;
      const res = await axios.get(API_ENDPOINTS.ATTENDANCE_EMPLOYEE_REPORT(empId, start, end));
      setAttHistory(res.data.attendance || []);
    } catch { setAttHistory([]); }
    finally { setAttLoading(false); }
  }, [attFilter]);

  useEffect(() => {
    if (employee?.employee_id) loadAttendanceFiltered(employee.employee_id);
  }, [attFilter, employee?.employee_id, loadAttendanceFiltered]);

  const loadLeaveBalance = async (empId) => {
    try {
      const [balRes, leavesRes] = await Promise.all([
        axios.get(API_ENDPOINTS.LEAVE_BALANCE(empId)),
        axios.get(API_ENDPOINTS.LEAVES)
      ]);
      setLeaveBalance(balRes.data);
      const all = Array.isArray(leavesRes.data) ? leavesRes.data : leavesRes.data?.data || [];
      setLeaveHistory(all.filter(l => l.employee_id === empId));
    } catch { /* non-fatal */ }
  };

  const loadRatings = async (empId) => {
    try {
      const res = await axios.get(`${API_ENDPOINTS.RATINGS}/employee/${empId}/history`);
      if (res.data.success) setRatings(res.data);
    } catch { /* non-fatal */ }
  };

  // ── load documents (mock or API) ─────────────────────────────────────────
  const loadDocuments = async (empId) => {
    try {
      // Mock documents - replace with actual API endpoint if available
      const mockDocs = [
        { id: 1, name: 'Employee Agreement', type: 'PDF', uploadDate: employee.joining_date, size: '2.4 MB' },
        { id: 2, name: 'NDA Signed', type: 'PDF', uploadDate: employee.joining_date, size: '1.8 MB' },
        { id: 3, name: 'Bank Details', type: 'PDF', uploadDate: employee.joining_date, size: '0.5 MB' },
        { id: 4, name: 'Passport Copy', type: 'PDF', uploadDate: employee.joining_date, size: '3.2 MB' },
        { id: 5, name: 'Aadhar Card', type: 'PDF', uploadDate: employee.joining_date, size: '2.1 MB' },
      ];
      setDocuments(mockDocs);
    } catch { /* non-fatal */ }
  };

  // ── load activity timeline ──────────────────────────────────────────────
  const loadActivities = async (empId) => {
    try {
      const name = `${employee.first_name || ''} ${employee.middle_name || ''} ${employee.last_name || ''}`.trim().replace(/  +/g, ' ');
      const mockActivities = [
        { id: 1, date: employee.joining_date, type: 'joined', title: 'Employee Joined', description: `${name} joined as ${employee.designation}`, icon: FaCheckCircle, color: '#22c55e' },
        { id: 2, date: new Date(new Date(employee.joining_date).getTime() + 90 * 24 * 60 * 60 * 1000), type: 'probation', title: 'Probation Completed', description: 'Probation period of 3 months completed successfully', icon: FaTrophy, color: '#0ea5e9' },
        { id: 3, date: new Date(Date.now()), type: 'active', title: 'Currently Active', description: 'Employee is currently active in the organization', icon: FaCheckDouble, color: '#22c55e' },
      ];
      setActivities(mockActivities.sort((a, b) => new Date(b.date) - new Date(a.date)));
    } catch { /* non-fatal */ }
  };

  // ── monthly hours chart data ────────────────────────────────────────────────
  const monthlyHoursData = (() => {
    const hours = Array(12).fill(0);
    attHistory.forEach(r => {
      const m = new Date(r.attendance_date).getMonth();
      hours[m] = Math.round((hours[m] + (parseFloat(r.total_hours) || 0)) * 10) / 10;
    });
    return {
      labels: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
      datasets: [{ label: 'Hours', data: hours, backgroundColor: 'rgba(99,102,241,0.75)', borderRadius: 6, borderWidth: 0, barPercentage: 0.6 }]
    };
  })();

  // ── late arrivals per month ─────────────────────────────────────────────────
  const lateData = (() => {
    const late = Array(12).fill(0);
    attHistory.forEach(r => { if (parseFloat(r.late_minutes) > 0) late[new Date(r.attendance_date).getMonth()]++; });
    return {
      labels: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
      datasets: [{ label: 'Late', data: late, backgroundColor: 'rgba(239,68,68,0.75)', borderRadius: 6, borderWidth: 0, barPercentage: 0.6 }]
    };
  })();

  // ── leave status doughnut ───────────────────────────────────────────────────
  const leaveStats = (() => {
    const approved = leaveHistory.filter(l => l.status === 'approved').length;
    const pending  = leaveHistory.filter(l => l.status === 'pending').length;
    const rejected = leaveHistory.filter(l => l.status === 'rejected').length;
    return { approved, pending, rejected,
      chart: {
        labels: ['Approved', 'Pending', 'Rejected'],
        datasets: [{ data: [approved, pending, rejected], backgroundColor: ['#22c55e','#f97316','#ef4444'], borderWidth: 3, borderColor: '#fff', hoverOffset: 6 }]
      }
    };
  })();

  // ── Resolve a single attendance record to its display label ─────────────────
  const resolveAttStatus = (r) => {
    if (r.attendance_type === 'paid_leave') return 'Paid Leave';
    if (r.attendance_type === 'comp_off')   return 'Comp Off';
    const hn = r.holiday_name || '';
    if (r.is_holiday && hn) return hn; // 'Week Off' | 'Holiday' | 'Leave'
    if (r.status === 'half_day') return 'Half Day';
    if (r.status) return r.status.charAt(0).toUpperCase() + r.status.slice(1);
    return 'N/A';
  };

  // ── reset profile completion ────────────────────────────────────────────────
  const [resettingProfile, setResettingProfile] = useState(false);
  const [togglingProfileForm, setTogglingProfileForm] = useState(false);

  const handleResetProfile = async () => {
    if (!window.confirm(`Reset profile completion for ${employee.first_name} ${employee.last_name}? They will be prompted to complete their profile again on next login.`)) return;
    setResettingProfile(true);
    try {
      await axios.post(API_ENDPOINTS.EMPLOYEE_RESET_PROFILE(employee.id));
      setEmployee(prev => ({ ...prev, profile_completed: false }));
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to reset profile status.');
    } finally {
      setResettingProfile(false);
    }
  };

  const handleToggleProfileForm = async () => {
    setTogglingProfileForm(true);
    try {
      const res = await axios.post(API_ENDPOINTS.EMPLOYEE_TOGGLE_PROFILE_FORM(employee.id));
      if (res.data.success) {
        setEmployee(prev => ({
          ...prev,
          require_profile_completion: res.data.require_profile_completion,
          // When turned ON, backend also resets profile_completed to false
          ...(res.data.require_profile_completion ? { profile_completed: false } : {}),
        }));
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to toggle profile form.');
    } finally {
      setTogglingProfileForm(false);
    }
  };

  // ── export ─────────────────────────────────────────────────────────────────
  const exportAttendance = () => {
    const rows = attHistory.map((r, i) => ({
      'Sr': i + 1, 'Date': r.attendance_date,
      'Clock In': fmtTimeIST(r.clock_in_ist || r.clock_in),
      'Clock Out': fmtTimeIST(r.clock_out_ist || r.clock_out),
      'Hours': r.total_hours || 0, 'Late (min)': r.late_minutes || 0,
      'Status': resolveAttStatus(r)
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
    XLSX.writeFile(wb, `attendance_${employee?.employee_id}.xlsx`);
  };

  const exportLeaves = () => {
    const rows = leaveHistory.map((l, i) => ({
      'Sr': i + 1,
      'Type': l.leave_type,
      'Duration': l.leave_duration || 'Full Day',
      'Start Date': fmtDate(l.start_date),
      'End Date': fmtDate(l.end_date),
      'Days': l.days_count || 1,
      'Status': l.status,
      'Reason': l.reason || ''
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Leaves');
    XLSX.writeFile(wb, `leaves_${employee?.employee_id}.xlsx`);
  };

  const exportEmployeeSummary = () => {
    const data = {
      'Employee Information': {
        'Employee ID': employee.employee_id,
        'Full Name': fullName,
        'Designation': employee.designation,
        'Department': employee.department,
        'Joining Date': fmtDate(employee.joining_date),
        'Tenure': tenure(employee.joining_date),
        'Email': employee.email,
        'Phone': employee.phone,
        'Reporting Manager': employee.reporting_manager,
        'Status': employee.is_active !== false ? 'Active' : 'Inactive'
      },
      'Current Cycle Statistics': {
        'Present Days': attSummary?.present || 0,
        'Absent Days': attSummary?.absent || 0,
        'Late Arrivals': attSummary?.late || 0,
        'Working Days': attSummary?.workingDays || 0,
        'Attendance %': `${attSummary?.pct || 0}%`,
        'Total Hours': attSummary?.totalHours || 0
      },
      'Leave Balance': {
        'Total Accrued': leaveBalance?.total_accrued || 0,
        'Used': leaveBalance?.used || 0,
        'Available': leaveBalance?.available || 0,
        'Pending': leaveBalance?.pending || 0,
        'Comp-Off Balance': leaveBalance?.comp_off_balance || 0
      },
      'Salary Information': {
        'Gross Salary': employee.gross_salary,
        'In-Hand Salary': employee.in_hand_salary
      }
    };
    const ws = XLSX.utils.json_to_sheet(Object.entries(data).flatMap(([section, values]) => 
      [{ Section: section }, ...Object.entries(values).map(([k, v]) => ({ [k]: v }))]
    ));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Summary');
    XLSX.writeFile(wb, `employee_summary_${employee?.employee_id}.xlsx`);
  };

  // After attendance is saved via calendar, regenerate the salary slip so counts stay in sync
  // ── loading / error states ─────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <div style={{ textAlign: 'center' }}>
        <Spinner animation="border" variant="primary" style={{ width: 40, height: 40 }} />
        <p style={{ marginTop: 12, color: '#6b7280', fontSize: 13 }}>Loading employee profile...</p>
      </div>
    </div>
  );

  if (error || !employee) return (
    <div style={{ padding: '32px' }}>
      <Alert variant="danger">{error || 'Employee not found'}</Alert>
      <Button variant="outline-secondary" size="sm" onClick={() => navigate('/admin/employees')}>
        <FaArrowLeft className="me-2" size={11} /> Back to List
      </Button>
    </div>
  );

  const fullName = `${employee.first_name || ''} ${employee.middle_name || ''} ${employee.last_name || ''}`.trim().replace(/  +/g, ' ');
  const initials = `${(employee.first_name || '')[0] || ''}${(employee.last_name || '')[0] || ''}`.toUpperCase();

  const TABS = [
    { id: 'overview',    label: 'Overview',    icon: <FaUser /> },
    { id: 'attendance',  label: 'Attendance',  icon: <FaClock /> },
    { id: 'leaves',      label: 'Leaves',      icon: <FaUmbrellaBeach /> },
    { id: 'performance', label: 'Performance', icon: <FaStar /> },
    { id: 'documents',   label: 'Documents',   icon: <FaFileContract /> },
    { id: 'timeline',    label: 'Timeline',    icon: <FaHistory /> },
  ];

  return (
    <div style={{  backgroundColor: '#ffffff', minHeight: '100vh', padding: '0 0 40px' }}>

      {/* ── Hero Header ─────────────────────────────────────────────────────── */}
      <div style={{ borderRadius: 12,background: 'linear-gradient(135deg,#1e1b4b 0%,#312e81 60%,#4338ca 100%)', padding: '28px 28px 80px', position: 'relative' }}>
        <button
          onClick={() => navigate(-1)}
          style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20 }}
        >
          <FaArrowLeft size={10} /> Back
        </button>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap' }}>
          {/* Avatar */}
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#818cf8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 800, color: '#fff', border: '3px solid rgba(255,255,255,0.4)', flexShrink: 0 }}>
            {employee.profile_image
              ? <img src={employee.profile_image} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
              : initials}
          </div>

          <div style={{ flex: 1 }}>
            <h2 style={{ color: '#fff', fontWeight: 800, margin: 0, fontSize: 22 }}>{fullName}</h2>
            {(() => {
              const isPropCulture = employee.pf_amount != null && parseInt(employee.pf_amount) === 0;
              const companyName = isPropCulture ? 'PropCulture' : 'B2B InDemand';
              const companyBg   = isPropCulture ? '#0d7b6f' : 'rgba(255,255,255,0.15)';
              return (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                  <span style={{ background: 'rgba(255,255,255,0.15)', color: '#e0e7ff', borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 600 }}>{employee.employee_id}</span>
                  <span style={{ background: 'rgba(255,255,255,0.15)', color: '#e0e7ff', borderRadius: 20, padding: '2px 10px', fontSize: 11 }}>{employee.designation || 'N/A'}</span>
                  <span style={{ background: 'rgba(255,255,255,0.15)', color: '#e0e7ff', borderRadius: 20, padding: '2px 10px', fontSize: 11 }}>{employee.department || 'N/A'}</span>
                  <span style={{ background: companyBg, color: '#fff', borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700, border: '1px solid rgba(255,255,255,0.3)' }}>
                    🏢 {companyName}
                  </span>
                  <span style={{
                    background: employee.is_active !== false ? '#22c55e' : '#ef4444',
                    color: '#fff', borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700
                  }}>{employee.is_active !== false ? '● Active' : '● Inactive'}</span>
                </div>
              );
            })()}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button
              size="sm"
              variant="light"
              onClick={() => navigate(`/admin/edit-employee/${employee.id}`)}
              style={{ fontSize: 12, fontWeight: 600, borderRadius: 8 }}
            >
              <FaEdit className="me-1" size={11} /> Edit Profile
            </Button>
            <Button
              size="sm"
              variant="warning"
              onClick={handleResetProfile}
              disabled={resettingProfile}
              style={{ fontSize: 12, fontWeight: 600, borderRadius: 8 }}
              title="Reset profile completion status"
            >
              {resettingProfile ? '...' : '↺ Reset Profile'}
            </Button>
            <Button
              size="sm"
              variant={employee.require_profile_completion ? 'success' : 'outline-secondary'}
              onClick={handleToggleProfileForm}
              disabled={togglingProfileForm}
              style={{ fontSize: 12, fontWeight: 600, borderRadius: 8 }}
              title={employee.require_profile_completion ? 'Click to stop requiring profile form' : 'Click to require employee to fill profile form'}
            >
              {togglingProfileForm ? '...' : employee.require_profile_completion ? '🔔 Form ON' : '🔕 Form OFF'}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Quick stat row ─────────────────────────────────────────────────── */}
      <div style={{ padding: '0 24px', marginTop: 44, marginBottom: 8 }}>
        <Row className="g-3">
          {[
            { label: 'Present Days',    value: attSummary?.present ?? '—',   color: '#22c55e', icon: <FaCheckCircle /> },
            { label: 'Absent Days',     value: attSummary?.absent  ?? '—',   color: '#ef4444', icon: <FaTimesCircle /> },
            { label: 'Late Arrivals',   value: attSummary?.late    ?? '—',   color: '#f97316', icon: <FaClock /> },
            { label: 'Attendance %',    value: attSummary ? `${attSummary.pct}%` : '—', color: '#6366f1', icon: <FaChartBar />, sub: `${attSummary?.workingDays || 0} working days` },
            { label: 'Total Hrs (Cycle)', value: attSummary ? `${attSummary.totalHours}h` : '—', color: '#0ea5e9', icon: <FaHistory /> },
            { label: 'Tenure',          value: tenure(employee.joining_date), color: '#8b5cf6', icon: <FaBriefcase /> },
          ].map(s => (
            <Col xs={6} md={4} lg={2} key={s.label}>
              <StatCard {...s} />
            </Col>
          ))}
        </Row>
      </div>

      {/* ── Tab bar ───────────────────────────────────────────────────────── */}
      <div style={{ background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', padding: '0 24px', display: 'flex', overflowX: 'auto', gap: 0, margin: '0 0 20px' }}>
        {TABS.map(t => <Tab key={t.id} label={t.label} icon={t.icon} active={activeTab === t.id} onClick={() => setActiveTab(t.id)} />)}
      </div>

      <div style={{ padding: '0 24px' }}>

        {/* ═══════════════════════ OVERVIEW TAB ═══════════════════════════════ */}
        {activeTab === 'overview' && (
          <Row className="g-3">
            <Col lg={4}>
              <Section title="Personal Information" icon={<FaUser />} color="#6366f1">
                <Info label="Full Name"    value={fullName}                    icon={<FaUser />} />
                <Info label="Date of Birth" value={fmtDate(employee.dob)}      icon={<FaCalendarAlt />} />
                <Info label="Gender"       value={employee.gender}             icon={<FaVenusMars />} />
                <Info label="Blood Group"  value={employee.blood_group}        icon={<FaTint />} />
                <Info label="Email"        value={employee.email}              icon={<FaEnvelope />} />
                <Info label="Phone"        value={employee.phone}              icon={<FaPhone />} />
                {(employee.address || employee.city) && (
                  <Info label="Address" icon={<FaMapMarkerAlt />}
                    value={[employee.address, employee.city, employee.state, employee.pincode].filter(Boolean).join(', ')} />
                )}
              </Section>
            </Col>

            <Col lg={4}>
              <Section title="Employment Details" icon={<FaBriefcase />} color="#0ea5e9">
                <Info label="Employee ID"      value={employee.employee_id}       icon={<FaIdCard />} />
                <Info label="Company"
                  value={employee.pf_amount != null && parseInt(employee.pf_amount) === 0 ? 'PropCulture' : 'B2B InDemand'}
                  icon={<FaBuilding />} />
                <Info label="Designation"      value={employee.designation}       icon={<FaUserTie />} />
                <Info label="Department"       value={employee.department}        icon={<FaBuilding />} />
                <Info label="Reporting Manager" value={employee.reporting_manager} icon={<FaUserTie />} />
                <Info label="Employment Type"  value={employee.employment_type}   icon={<FaBriefcase />} />
                <Info label="Shift Timing"     value={employee.shift_timing || '9:00 AM - 6:00 PM'} icon={<FaClock />} />
                <Info label="Joining Date"     value={fmtDate(employee.joining_date)} icon={<FaCalendarAlt />} />
                <Info label="Tenure"           value={tenure(employee.joining_date)} icon={<FaHistory />} />
              </Section>
            </Col>

            <Col lg={4}>
              <Section title="Salary & Bank" icon={<FaUniversity />} color="#22c55e">
                <Info label="Gross Salary"   value={fmtCurrency(employee.gross_salary)}   icon={<FaCreditCard />} />
                <Info label="In-Hand Salary" value={fmtCurrency(employee.in_hand_salary)} icon={<FaCreditCard />} />
                <Info label="Bank Name"      value={employee.bank_name || employee.bank_account_name} icon={<FaUniversity />} />
                <Info label="Account No."   value={employee.account_number} icon={<FaUniversity />} />
                <Info label="IFSC Code"      value={employee.ifsc_code}     icon={<FaUniversity />} />
                <Info label="PAN Number"     value={employee.pan_number}    icon={<FaIdCard />} />
                <Info label="Aadhar No."     value={employee.aadhar_number} icon={<FaIdCard />} />
                {canSeeUan && <Info label="UAN Number" value={employee.uan} icon={<FaIdCard />} />}
              </Section>
            </Col>

            {/* Monthly hours chart mini */}
            <Col lg={12}>
              <Section title="Monthly Working Hours (This Year)" icon={<FaChartBar />} color="#6366f1">
                <div style={{ height: 220 }}>
                  <Bar data={monthlyHoursData} options={barOpts('Hours')} />
                </div>
              </Section>
            </Col>
          </Row>
        )}

        {/* ═══════════════════════ ATTENDANCE TAB ══════════════════════════════ */}
        {activeTab === 'attendance' && (
          <>
            {/* Filters */}
            <div style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', marginBottom: 20, boxShadow: '0 1px 8px rgba(0,0,0,0.06)' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginRight: 4 }}>Quick Filters:</label>
                <button onClick={() => {
                  const today = new Date();
                  setAttFilter({ year: today.getFullYear(), month: (today.getMonth() + 1).toString() });
                }}
                  style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                  This Month
                </button>
                <button onClick={() => {
                  const today = new Date();
                  setAttFilter({ year: today.getFullYear(), month: '' });
                }}
                  style={{ background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                  This Year
                </button>
                <button onClick={() => {
                  const today = new Date();
                  const lastYear = today.getFullYear() - 1;
                  setAttFilter({ year: lastYear, month: '' });
                }}
                  style={{ background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                  Last Year
                </button>
              </div>


            </div>

            {/* Mark Attendance — lets Admin/HR set a day's status (Present, Absent, Comp
                Off, Paid Leave, etc.) directly on this employee's record. Reuses the same
                AttendanceCalendar component/endpoints already used in Payroll Center's
                attendance review, so behavior (balance checks, Excel export columns) stays
                identical everywhere it appears. */}
            <AttendanceCalendar
              employee={employee}
              onAttendanceSaved={() => loadAttendanceFiltered(employee.employee_id)}
            />

            {/* Charts row */}
            <Row className="g-3 mb-3">
              <Col md={8}>
                <Section title="Monthly Working Hours" icon={<FaChartBar />} color="#6366f1">
                  <div style={{ height: 240 }}>
                    <Bar data={monthlyHoursData} options={barOpts('Hours')} />
                  </div>
                </Section>
              </Col>
              <Col md={4}>
                <Section title="Late Arrivals" icon={<FaClock />} color="#ef4444">
                  <div style={{ height: 240 }}>
                    <Bar data={lateData} options={barOpts('Days')} />
                  </div>
                </Section>
              </Col>
            </Row>
 <div style={{ margin: '12px', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Year</label>
                  <select value={attFilter.year} onChange={e => setAttFilter(f => ({ ...f, year: +e.target.value }))}
                    style={{ fontSize: 12, padding: '6px 10px', borderRadius: 7, border: '1px solid #e5e7eb', background: '#f9fafb', cursor: 'pointer' }}>
                    {[2020, 2021, 2022, 2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Month</label>
                  <select value={attFilter.month} onChange={e => setAttFilter(f => ({ ...f, month: e.target.value }))}
                    style={{ fontSize: 12, padding: '6px 10px', borderRadius: 7, border: '1px solid #e5e7eb', background: '#f9fafb', cursor: 'pointer' }}>
                    <option value="">All Months</option>
                    {['January','February','March','April','May','June','July','August','September','October','November','December'].map((m, i) => (
                      <option key={i} value={i + 1}>{m}</option>
                    ))}
                  </select>
                </div>
                <button onClick={exportAttendance}
                  style={{ marginLeft: 'auto', background: '#22c55e', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <FaDownload size={11} /> Export Excel
                </button>
              </div>
            {/* Attendance table */}
            <Section title={`Attendance Records (${attHistory.length} records)`} icon={<FaHistory />} color="#0ea5e9">
              {attLoading ? (
                <div style={{ textAlign: 'center', padding: 30 }}><Spinner size="sm" animation="border" /></div>
              ) : (
                <div style={{ overflowX: 'auto', maxHeight: 420, overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#f9fafb', position: 'sticky', top: 0 }}>
                        {['Date','Day','Clock In','Clock Out','Hours','Late','Status'].map(h => (
                          <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#374151', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {attHistory.length === 0 ? (
                        <tr><td colSpan={7} style={{ textAlign: 'center', padding: 30, color: '#9ca3af' }}>No records found</td></tr>
                      ) : attHistory.map((r, i) => {
                        const isLate = parseFloat(r.late_minutes) > 0;
                        const dow = new Date(r.attendance_date).toLocaleDateString('en-US', { weekday: 'short' });
                        const STATUS_COLOR = {
                          present: '#22c55e', absent: '#ef4444', half_day: '#f97316', working: '#0ea5e9',
                          'Paid Leave': '#0891b2', 'Comp Off': '#c026d3',
                          'Week Off': '#6b7280', 'Holiday': '#2563eb', 'Leave': '#7c3aed',
                        };
                        const statusLabel = resolveAttStatus(r);
                        const statusColor = STATUS_COLOR[statusLabel] || STATUS_COLOR[r.status] || '#9ca3af';
                        return (
                          <tr key={i} style={{ borderBottom: '1px solid #f3f4f6', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                            <td style={{ padding: '8px 12px', fontWeight: 600 }}>{r.attendance_date}</td>
                            <td style={{ padding: '8px 12px', color: '#6b7280' }}>{dow}</td>
                            <td style={{ padding: '8px 12px', color: '#22c55e', fontWeight: 600 }}>{fmtTimeIST(r.clock_in_ist || r.clock_in)}</td>
                            <td style={{ padding: '8px 12px', color: '#f97316', fontWeight: 600 }}>{fmtTimeIST(r.clock_out_ist || r.clock_out)}</td>
                            <td style={{ padding: '8px 12px', fontWeight: 700 }}>{r.total_hours ? `${r.total_hours}h` : '—'}</td>
                            <td style={{ padding: '8px 12px' }}>
                              {isLate ? <span style={{ background: '#fef2f2', color: '#ef4444', borderRadius: 10, padding: '2px 8px', fontWeight: 600, fontSize: 11 }}>Late</span> : '—'}
                            </td>
                            <td style={{ padding: '8px 12px' }}>
                              <span style={{ background: `${statusColor}18`, color: statusColor, borderRadius: 10, padding: '2px 8px', fontWeight: 700, fontSize: 11 }}>
                                {statusLabel}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          </>
        )}

        {/* ═══════════════════════ LEAVES TAB ══════════════════════════════════ */}
        {activeTab === 'leaves' && (
          <>
            <Row className="g-3 mb-3">
              {[
                { label: 'Total Accrued', value: parseFloat(leaveBalance?.total_accrued || 0).toFixed(1), color: '#6366f1', icon: <FaCalendarAlt /> },
                { label: 'Used',          value: parseFloat(leaveBalance?.used || 0).toFixed(1),          color: '#ef4444', icon: <FaTimesCircle /> },
                { label: 'Available',     value: parseFloat(leaveBalance?.available || 0).toFixed(1),     color: '#22c55e', icon: <FaCheckCircle /> },
                { label: 'Pending',       value: parseFloat(leaveBalance?.pending || 0).toFixed(1),       color: '#f97316', icon: <FaHourglassHalf /> },
                { label: 'Comp-Off Bal.', value: parseFloat(leaveBalance?.comp_off_balance || 0).toFixed(1), color: '#8b5cf6', icon: <FaStar /> },
              ].map(s => <Col xs={6} md={4} lg key={s.label}><StatCard {...s} /></Col>)}
            </Row>

            <Row className="g-3">
              <Col md={4}>
                <Section title="Leave Status Breakdown" icon={<FaChartBar />} color="#6366f1">
                  <div style={{ height: 200 }}>
                    <Doughnut data={leaveStats.chart} options={{
                      responsive: true, maintainAspectRatio: false,
                      animation: { duration: 600 },
                      cutout: '55%',
                      plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } }, tooltip: { backgroundColor: 'rgba(17,24,39,0.92)', cornerRadius: 8 } }
                    }} />
                  </div>
                </Section>
              </Col>
              <Col md={8}>
                <Section title={`Leave History (${leaveHistory.length})`} icon={<FaHistory />} color="#0ea5e9">
                  <div style={{ overflowX: 'auto', maxHeight: 280, overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: '#f9fafb', position: 'sticky', top: 0 }}>
                          {['Type','Duration','Start','End','Days','Status'].map(h => (
                            <th key={h} style={{ padding: '8px 12px', fontWeight: 700, color: '#374151', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {leaveHistory.length === 0 ? (
                          <tr><td colSpan={6} style={{ textAlign: 'center', padding: 30, color: '#9ca3af' }}>No leave records</td></tr>
                        ) : leaveHistory.map((l, i) => {
                          const sc = { approved: '#22c55e', rejected: '#ef4444', pending: '#f97316' };
                          return (
                            <tr key={i} style={{ borderBottom: '1px solid #f3f4f6', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                              <td style={{ padding: '8px 12px', fontWeight: 600 }}>{l.leave_type}</td>
                              <td style={{ padding: '8px 12px', color: '#6b7280' }}>{l.leave_duration || 'Full Day'}</td>
                              <td style={{ padding: '8px 12px' }}>{fmtDate(l.start_date)}</td>
                              <td style={{ padding: '8px 12px' }}>{fmtDate(l.end_date)}</td>
                              <td style={{ padding: '8px 12px', fontWeight: 700 }}>{l.days_count || 1}</td>
                              <td style={{ padding: '8px 12px' }}>
                                <span style={{ background: `${sc[l.status] || '#9ca3af'}18`, color: sc[l.status] || '#9ca3af', borderRadius: 10, padding: '2px 8px', fontWeight: 700, fontSize: 11, textTransform: 'capitalize' }}>{l.status}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Section>
              </Col>
            </Row>
          </>
        )}

        {/* ═══════════════════════ PERFORMANCE TAB ════════════════════════════ */}
        {activeTab === 'performance' && (
          <>
            <Row className="g-3 mb-3">
              {[
                { label: 'Manager Avg Rating', value: ratings.manager_average ?? '—', color: '#6366f1', icon: <FaStar />, sub: `${ratings.manager_ratings?.length || 0} reviews` },
                { label: 'Admin Avg Rating',   value: ratings.admin_average   ?? '—', color: '#22c55e', icon: <FaStar />, sub: `${ratings.admin_ratings?.length || 0} reviews` },
              ].map(s => <Col xs={12} md={6} key={s.label}><StatCard {...s} /></Col>)}
            </Row>

            {[
              { title: 'TL Ratings', data: ratings.manager_ratings || [], color: '#6366f1' },
              { title: 'Admin Ratings',   data: ratings.admin_ratings   || [], color: '#22c55e' },
            ].map(({ title, data, color }) => (
              <Section key={title} title={title} icon={<FaStar />} color={color}>
                {data.length === 0 ? (
                  <p style={{ color: '#9ca3af', textAlign: 'center', padding: 20, fontSize: 13 }}>No {title.toLowerCase()} available</p>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: '#f9fafb' }}>
                          {['Period','Rating','Label','Rated By','Comments'].map(h => (
                            <th key={h} style={{ padding: '8px 12px', fontWeight: 700, color: '#374151', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.map((r, i) => {
                          const rc = r.rating >= 4 ? '#22c55e' : r.rating >= 3 ? '#0ea5e9' : r.rating >= 2 ? '#f97316' : '#ef4444';
                          return (
                            <tr key={i} style={{ borderBottom: '1px solid #f3f4f6', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                              <td style={{ padding: '8px 12px', fontWeight: 600 }}>{r.month_name} {r.year}</td>
                              <td style={{ padding: '8px 12px' }}>
                                <span style={{ fontSize: 16, fontWeight: 800, color: rc }}>{r.rating}</span>
                                <span style={{ color: '#9ca3af', fontSize: 11 }}>/5</span>
                              </td>
                              <td style={{ padding: '8px 12px' }}>
                                <span style={{ background: `${rc}18`, color: rc, borderRadius: 10, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>{r.rating_label}</span>
                              </td>
                              <td style={{ padding: '8px 12px', color: '#6b7280' }}>{r.rater_name}</td>
                              <td style={{ padding: '8px 12px', color: '#6b7280', maxWidth: 200 }}>{r.comments || '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Section>
            ))}
          </>
        )}

        {/* ═══════════════════════ DOCUMENTS TAB ═══════════════════════════════ */}
        {activeTab === 'documents' && (
          <>
            <Section title="Employee Documents" icon={<FaFileContract />} color="#6366f1">
              {documents.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>
                  <FaFileAlt style={{ fontSize: 40, marginBottom: 12, opacity: 0.3 }} />
                  <p>No documents uploaded yet</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
                  {documents.map(doc => (
                    <div key={doc.id} style={{
                      background: '#fafafa', borderRadius: 10, padding: 16, border: '1px solid #e5e7eb',
                      cursor: 'pointer', transition: 'all 0.2s',
                      ':hover': { background: '#f0f2f5', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }
                    }} className="hoverable">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 8, background: '#fef08a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {doc.type === 'PDF' ? <FaFilePdf color="#dc2626" size={18} /> : <FaFileAlt color="#666" size={18} />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.name}</div>
                          <div style={{ fontSize: 11, color: '#9ca3af' }}>{doc.size}</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                        <button style={{ flex: 1, background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                          <FaEye size={10} /> View
                        </button>
                        <button style={{ flex: 1, background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 6, padding: '6px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                          <FaDownload size={10} /> Download
                        </button>
                      </div>
                      <div style={{ fontSize: 10, color: '#9ca3af' }}>Uploaded: {fmtDate(doc.uploadDate)}</div>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Compliance Documents" icon={<FaClipboardList />} color="#0ea5e9">
              <Row className="g-3">
                {[
                  { doc: 'Employee Agreement', status: 'completed', icon: <FaCheckCircle /> },
                  { doc: 'NDA Agreement', status: 'completed', icon: <FaCheckCircle /> },
                  { doc: 'Confidentiality Form', status: 'completed', icon: <FaCheckCircle /> },
                  { doc: 'Code of Conduct', status: 'pending', icon: <FaHourglassHalf /> },
                ].map((item, i) => (
                  <Col md={6} key={i}>
                    <div style={{ background: '#f9fafb', borderRadius: 10, padding: 14, border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 8, background: item.status === 'completed' ? '#dcfce7' : '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: item.status === 'completed' ? '#22c55e' : '#f59e0b', fontSize: 16 }}>
                        {item.icon}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{item.doc}</div>
                        <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'capitalize' }}>{item.status}</div>
                      </div>
                    </div>
                  </Col>
                ))}
              </Row>
            </Section>
          </>
        )}

        {/* ═══════════════════════ TIMELINE TAB ════════════════════════════════ */}
        {activeTab === 'timeline' && (
          <>
            <Section title="Employee Activity Timeline" icon={<FaHistory />} color="#6366f1">
              <div style={{ position: 'relative', padding: '20px 0' }}>
                {activities.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>
                    <FaHistory style={{ fontSize: 40, marginBottom: 12, opacity: 0.3 }} />
                    <p>No timeline activities available</p>
                  </div>
                ) : (
                  <div style={{ position: 'relative' }}>
                    {/* Timeline line */}
                    <div style={{
                      position: 'absolute', left: '20px', top: '20px', bottom: '20px',
                      width: '2px', background: 'linear-gradient(to bottom, #6366f1, #0ea5e9, #22c55e)', opacity: 0.2
                    }} />
                    
                    {/* Timeline items */}
                    {activities.map((activity, i) => (
                      <div key={activity.id} style={{ display: 'flex', gap: 20, marginBottom: 24, position: 'relative', zIndex: 1 }}>
                        {/* Timeline dot */}
                        <div style={{
                          width: 40, height: 40, borderRadius: '50%',
                          background: activity.color + '18', border: `2px solid ${activity.color}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0, marginTop: 2
                        }}>
                          <activity.icon size={16} color={activity.color} />
                        </div>

                        {/* Timeline content */}
                        <div style={{ flex: 1, background: '#f9fafb', borderRadius: 10, padding: 16, border: '1px solid #e5e7eb' }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                            <div>
                              <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#111827' }}>{activity.title}</h4>
                              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#9ca3af' }}>{fmtDate(activity.date)}</p>
                            </div>
                            <span style={{
                              background: activity.color + '18', color: activity.color,
                              borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 600,
                              textTransform: 'capitalize'
                            }}>
                              {activity.type}
                            </span>
                          </div>
                          <p style={{ margin: 0, fontSize: 13, color: '#6b7280', lineHeight: 1.5 }}>{activity.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Section>

            {/* Expected milestones */}
            <Section title="Expected Milestones" icon={<FaAward />} color="#8b5cf6">
              <Row className="g-3">
                {[
                  { date: new Date(new Date(employee.joining_date).getTime() + 365 * 24 * 60 * 60 * 1000), title: '1 Year Completion', icon: <FaTrophy />, status: 'pending' },
                  { date: new Date(new Date(employee.joining_date).getTime() + 2 * 365 * 24 * 60 * 60 * 1000), title: '2 Year Completion', icon: <FaAward />, status: 'pending' },
                ].map((milestone, i) => (
                  <Col md={6} key={i}>
                    <div style={{ background: '#f9fafb', borderRadius: 10, padding: 14, border: '1px solid #e5e7eb' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                        <div style={{ fontSize: 18, color: '#8b5cf6' }}>{milestone.icon}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{milestone.title}</div>
                          <div style={{ fontSize: 11, color: '#9ca3af' }}>{fmtDate(milestone.date)}</div>
                        </div>
                      </div>
                      <div style={{
                        width: '100%', height: 4, background: '#e5e7eb', borderRadius: 2, overflow: 'hidden'
                      }}>
                        <div style={{
                          height: '100%', background: '#8b5cf6',
                          width: `${Math.max(0, Math.min(100, ((Date.now() - new Date(employee.joining_date).getTime()) / (milestone.date.getTime() - new Date(employee.joining_date).getTime())) * 100))}%`,
                          transition: 'width 0.3s'
                        }} />
                      </div>
                    </div>
                  </Col>
                ))}
              </Row>
            </Section>
          </>
        )}

        {/* Export Options Footer */}
        <div style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', marginTop: 24, boxShadow: '0 1px 8px rgba(0,0,0,0.06)', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginRight: 10 }}>Quick Export:</div>
          <button onClick={exportAttendance} style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s' }}>
            <FaDownload size={10} /> Attendance
          </button>
          <button onClick={exportLeaves} style={{ background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s' }}>
            <FaDownload size={10} /> Leaves
          </button>
          <button onClick={exportEmployeeSummary} style={{ background: '#f97316', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s' }}>
            <FaDownload size={10} /> Summary
          </button>
        </div>
      </div>
    </div>
  );
};

export default EmployeeProfileView;
