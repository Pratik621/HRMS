import React, { useState, useEffect } from 'react';
import {
  Card, Button, Alert, Spinner, Badge,
  Row, Col, Modal, Table
} from 'react-bootstrap';
import {
  FaCheckCircle,
  FaExclamationTriangle,
  FaInfoCircle,
  FaClock,
  FaMapMarkerAlt,
  FaBuilding,
  FaHome,
  FaLocationArrow,
  FaSignOutAlt,
  FaCalendarAlt,
  FaMoon,
  FaHistory,
  FaRegClock,
  FaArrowLeft,
  FaBirthdayCake,
  FaUmbrellaBeach
} from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';
import { getTrustedNow, getTrustedNowIST } from '../../utils/serverTime';
import { useAuth } from '../../context/AuthContext';
import { useMobileDevice } from '../../hooks/useMobileDevice';
import {
  DA, STATUS_PILL, DA_TH_STYLE, DA_CARD_STYLE, DA_GRADIENT_BAR, ATTENDANCE_TABLE_CSS,
} from '../Common/attendanceTheme';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

// Tiny inline-SVG trend line for the stat cards. Renders a flat baseline when there
// isn't enough history yet, rather than a fake/decorative curve.
const Sparkline = ({ data, color, width = 72, height = 28 }) => {
  const points = Array.isArray(data) ? data : [];
  if (points.length < 2) {
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <line x1="0" y1={height - 2} x2={width} y2={height - 2} stroke={color} strokeWidth="2" strokeLinecap="round" opacity="0.35" />
      </svg>
    );
  }
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const step = width / (points.length - 1);
  const coords = points.map((v, i) => [i * step, height - 2 - ((v - min) / range) * (height - 4)]);
  const linePath = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <path d={areaPath} fill={color} opacity="0.12" />
      <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

const Attendance = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isMobileDevice = useMobileDevice();
  const [networkBlocked, setNetworkBlocked] = useState(false);
  const [attendance, setAttendance] = useState(null);
  const [activeSession, setActiveSession] = useState(null);
  const [loading, setLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [currentTime, setCurrentTime] = useState(new Date());
  const [location, setLocation] = useState(null);
  const [locationError, setLocationError] = useState(null);
  const [geofenceInfo, setGeofenceInfo] = useState(null);
  const [heartbeatInterval, setHeartbeatInterval] = useState(null);
  const [showExitWarning, setShowExitWarning] = useState(false);
  const [hasClockedOutToday, setHasClockedOutToday] = useState(false);
  const [employeeDob, setEmployeeDob] = useState(null);
  const [attendanceHistory, setAttendanceHistory] = useState([]);
  const [isSessionValid, setIsSessionValid] = useState(false);
  const [hasIncompleteRecord, setHasIncompleteRecord] = useState(false);
  // Previous/Next 30-day paging — was infinite-scroll (auto-fetching more on every scroll
  // near the bottom), which meant casually scrolling through a few months of history could
  // fire off a dozen+ API calls without the employee ever asking for it. Now exactly one
  // fetch per explicit Next/Previous click, always a fixed 30-day window, nothing appended.
  const [historyPage, setHistoryPage] = useState(0); // 0 = most recent 30 days
  const [loadingHistory, setLoadingHistory] = useState(false);
  const tableScrollRef = React.useRef(null);
  const HISTORY_PAGE_DAYS = 30;
  const [monthlyStats, setMonthlyStats] = useState({
    totalDays: 0,
    presentDays: 0,
    absentDays: 0,
    halfDays: 0,
    weeklyOffDays: 0,
    leaves: 0,
    totalHours: 0,
    averageHours: 0,
    lateDays: 0,
    totalLateMinutes: 0
  });
  const [activeTab, setActiveTab] = useState('daily');
  const [chartData, setChartData] = useState({
    labels: [],
    datasets: [
      {
        label: 'Hours Worked',
        data: [],
        borderColor: 'rgb(75, 192, 192)',
        backgroundColor: 'rgba(75, 192, 192, 0.1)',
        tension: 0.4,
        fill: true,
        pointBackgroundColor: 'rgb(75, 192, 192)',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6
      }
    ]
  });

  // Regularization states
  const [missedClockOuts, setMissedClockOuts] = useState([]);
  const [showRegularizationModal, setShowRegularizationModal] = useState(false);
  const [selectedMissedRecord, setSelectedMissedRecord] = useState(null);
  const [regularizationTime, setRegularizationTime] = useState('');
  const [regularizationMinTime, setRegularizationMinTime] = useState('');
  const [regularizationReason, setRegularizationReason] = useState('');
  const [submittingRequest, setSubmittingRequest] = useState(false);
  // Generalized regularization fields (all 11 request types)
  const [regularizationType, setRegularizationType] = useState('missing_clock_out');
  const [regularizationClockIn, setRegularizationClockIn] = useState('');
  const [regularizationBreakDuration, setRegularizationBreakDuration] = useState('');
  const [regularizationAttachment, setRegularizationAttachment] = useState(null);
  const [attachmentError, setAttachmentError] = useState('');
  const [myRegularizations, setMyRegularizations] = useState([]);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const STORAGE_KEY = `attendance_session_${user?.employeeId}`;

  const OFFICE_COORDS = {
    name: 'Viman Nagar Office',
    latitude: 18.56835629424307,
    longitude: 73.90856078144989,
    radius: 50
  };

  // ========== CROSS-MIDNIGHT TIME CALCULATION FUNCTIONS ==========

  // Parse date time string to Date object
  const parseDateTime = (dateTimeStr) => {
    if (!dateTimeStr) return null;
    let cleanStr = dateTimeStr.trim();
    cleanStr = cleanStr.replace('T', ' ');
    cleanStr = cleanStr.split('+')[0];

    const [datePart, timePart] = cleanStr.split(' ');
    if (!datePart || !timePart) return null;

    const [year, month, day] = datePart.split('-').map(Number);
    const timeSegments = timePart.split(':');
    const hour = Number(timeSegments[0]);
    const minute = Number(timeSegments[1]);
    const second = Number(timeSegments[2] || 0);

    if ([year, month, day, hour, minute].some(isNaN)) {
      return null;
    }

    return new Date(year, month - 1, day, hour, minute, second);
  };

  // In Attendance.jsx - Update calculateTotalMinutesFixed function

  // Calculate total minutes between two times with proper cross-midnight support
  const calculateTotalMinutesFixed = (clockInStr, clockOutOrCurrentStr) => {
    if (!clockInStr || !clockOutOrCurrentStr) return 0;

    const parseDateTime = (dateTimeStr) => {
      let cleanStr = dateTimeStr.trim();
      cleanStr = cleanStr.replace('T', ' ');
      cleanStr = cleanStr.split('+')[0];

      const [datePart, timePart] = cleanStr.split(' ');
      if (!datePart || !timePart) return null;

      const [year, month, day] = datePart.split('-').map(Number);
      const timeSegments = timePart.split(':');
      const hour = Number(timeSegments[0]);
      const minute = Number(timeSegments[1]);
      const second = Number(timeSegments[2] || 0);

      if ([year, month, day, hour, minute].some(isNaN)) {
        return null;
      }

      return new Date(year, month - 1, day, hour, minute, second);
    };

    const clockInDate = parseDateTime(clockInStr);
    let clockOutDate = parseDateTime(clockOutOrCurrentStr);

    if (!clockInDate || !clockOutDate) return 0;

    // Calculate difference in milliseconds
    let diffMs = clockOutDate.getTime() - clockInDate.getTime();

    // If negative (crossed midnight), add 24 hours
    if (diffMs < 0) {
      diffMs += 24 * 60 * 60 * 1000;
    }

    const diffMinutes = diffMs / (1000 * 60);

    console.log(`⏱️ Time Diff: ${clockInStr} → ${clockOutOrCurrentStr} = ${diffMinutes} mins (${Math.floor(diffMinutes / 60)}h ${Math.round(diffMinutes % 60)}m)`);

    return diffMinutes;
  };

  // Helper function to get UTC milliseconds from IST string
  const toUTCMs = (val) => {
    if (!val) return null;
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val.getTime();
    const s = String(val).trim();

    const clean = s.replace('T', ' ').substring(0, 19);
    const [datePart, timePart] = clean.split(' ');
    if (!datePart || !timePart) return null;

    const [y, mo, d] = datePart.split('-').map(Number);
    const [h, mi, sec = 0] = timePart.split(':').map(Number);
    if ([y, mo, d, h, mi].some(isNaN)) return null;

    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
    return Date.UTC(y, mo - 1, d, h, mi, sec) - IST_OFFSET_MS;
  };

  // Current time in IST format, anchored to the trusted server clock (see utils/serverTime.js)
  // rather than this device's own clock — the employee's laptop time must never influence the
  // "hours worked so far" timer computed from this.
  const nowIST = () => getTrustedNowIST();

  // Format time from IST string "YYYY-MM-DD HH:MM:SS" to display format
  const formatTimeIST = (datetime) => {
    if (!datetime) return '--:--';
    try {
      let hourNum, minute;
      if (typeof datetime === 'string') {
        // Handle "YYYY-MM-DD HH:MM:SS" format
        if (datetime.includes(' ') && !datetime.includes('T')) {
          const timePart = datetime.split(' ')[1];
          const parts = timePart.split(':');
          hourNum = parseInt(parts[0], 10);
          minute = parts[1] ? parts[1].padStart(2, '0') : '00';
        }
        // Handle UTC ISO format
        else if (datetime.includes('T')) {
          const date = new Date(datetime);
          if (!isNaN(date.getTime())) {
            // Convert to IST
            const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
            const istDate = new Date(date.getTime() + IST_OFFSET_MS);
            hourNum = istDate.getUTCHours();
            minute = String(istDate.getUTCMinutes()).padStart(2, '0');
          } else {
            return '--:--';
          }
        }
        // Handle just time string "HH:MM:SS"
        else if (datetime.match(/^\d{2}:\d{2}:\d{2}$/)) {
          const parts = datetime.split(':');
          hourNum = parseInt(parts[0], 10);
          minute = parts[1];
        } else {
          return '--:--';
        }
      } else {
        return '--:--';
      }
      if (isNaN(hourNum)) return '--:--';
      const ampm = hourNum >= 12 ? 'PM' : 'AM';
      const hour12 = hourNum % 12 === 0 ? 12 : hourNum % 12;
      return `${hour12}:${minute} ${ampm}`;
    } catch {
      return '--:--';
    }
  };

  const formatShortDate = (dateString) => {
    if (!dateString) return 'N/A';
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  };

  const formatDateStr = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatLateTime = (lateMinutes) => {
    if (!lateMinutes || lateMinutes <= 0) return null;

    let minutes = typeof lateMinutes === 'string' ? parseFloat(lateMinutes) : lateMinutes;
    if (isNaN(minutes) || minutes <= 0) return null;

    const totalSeconds = Math.floor(minutes * 60);
    const hours = Math.floor(totalSeconds / 3600);
    const remainingSeconds = totalSeconds % 3600;
    const mins = Math.floor(remainingSeconds / 60);
    const secs = remainingSeconds % 60;

    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (mins > 0) parts.push(`${mins}m`);
    if (secs > 0 || (hours === 0 && mins === 0)) parts.push(`${secs}s`);

    return parts.join(' ');
  };

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) *
      Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Calculate status from total_hours: <5h = absent, 5-8:59h = half_day, 9h+ = present
  const getStatusFromHours = (totalHours) => {
    if (!totalHours || totalHours <= 0) return null;
    if (totalHours < 5) return 'absent';
    if (totalHours < 9) return 'half_day';
    return 'present';
  };

  // Shared "premium" pill renderer — same STATUS_PILL colors used on the Admin and Manager
  // attendance tables, so this employee's own history looks consistent with everywhere else.
  const statusPill = (key, label, icon) => (
    <span
      className="da-badge d-inline-flex align-items-center gap-1 text-nowrap"
      style={{ ...(STATUS_PILL[key] || STATUS_PILL.absent), borderRadius: 999, padding: '5px 12px', fontSize: 12, fontWeight: 600 }}
    >
      {icon}{label}
    </span>
  );

  const getAttendanceStatusBadge = (record) => {
    const today = new Date().toISOString().split('T')[0];
    const isToday = record.attendance_date === today;

    const isWeekend = record.dayOfWeek === 0 || record.dayOfWeek === 6;
    if (record.isWeeklyOff || (isWeekend && !record.clock_in)) {
      return statusPill('weekend', 'W-Off', <FaMoon size={10} />);
    }

    // Company holiday (static calendar or HR/Admin's HOL button, see getEmployeeAttendanceReport)
    // — no clock_in by design, must not fall through to "Not Clocked" below.
    if (!record.clock_in && record.status === 'holiday') {
      return statusPill('holiday', record.is_company_holiday ? 'HOL' : 'Holiday', <FaUmbrellaBeach size={10} />);
    }

    // No clock_in but the backend already says Present — two cases write this shape:
    //   1. Approved Paid/Birthday/Comp-Off leave (leaveAttendanceSync sets attendance_type).
    //   2. An approved regularization for a request type that never had a time to select in
    //      the first place — Client Visit / Official Duty / WFH / Other (see NO_PUNCH_TYPES
    //      in regularizationController.js) — these only get is_regularized + status set,
    //      never attendance_type. Both must show Present, not "Not Clocked".
    if (!record.clock_in && record.status === 'present' && (record.attendance_type || record.is_regularized)) {
      const presentReason = record.attendance_type === 'paid_leave' ? 'Paid Leave'
        : record.attendance_type === 'birthday_leave' ? 'Birthday Leave'
        : record.attendance_type === 'comp_off' ? 'Comp-Off'
        : record.is_regularized ? 'Regularized'
        : null;
      return statusPill('present', presentReason ? `Present — ${presentReason}` : 'Present', <FaCheckCircle size={10} />);
    }

    if (!record.clock_in) {
      return statusPill('not_clocked', 'Not Clocked', <FaClock size={10} />);
    }

    // Today with active session (no clock out yet)
    if (isToday && record.clock_in && !record.clock_out) {
      return statusPill('working', 'Working', <span style={{ fontSize: 8 }}>●</span>);
    }

    // Clock in + clock out: the backend already computed and stored the authoritative status
    // — at clock-out time (attendanceController) and again on regularization approval
    // (recalculateAttendanceForApprovedRequest) — using this employee's real shift timing /
    // flexible-shift rule. Trust record.status instead of recomputing here with
    // getStatusFromHours' hardcoded 9h threshold, which disagrees for any shift that isn't
    // exactly 9 hours and was exactly why an approved regularization (or a non-9h-shift
    // employee's normal day) could show the wrong status. Only fall back to the local
    // hours-based guess for older rows that never got a status written.
    if (record.clock_in && record.clock_out) {
      if (record.status === 'present') return statusPill('present', 'Present', <FaCheckCircle size={10} />);
      if (record.status === 'half_day') return statusPill('half_day', 'Half Day');
      if (record.status === 'absent') return statusPill('absent', 'Absent');

      const totalHours = parseFloat(record.total_hours) || 0;
      const hoursStatus = getStatusFromHours(totalHours);

      if (hoursStatus === 'absent') {
        return statusPill('absent', 'Absent');
      }
      if (hoursStatus === 'half_day') {
        return statusPill('half_day', 'Half Day');
      }
      // present (9h+)
      return statusPill('present', 'Present', <FaCheckCircle size={10} />);
    }

    // Clock in but no clock out (not today = missed)
    if (record.clock_in && !record.clock_out) {
      return statusPill('absent', 'Missed CO', <FaExclamationTriangle size={10} />);
    }

    return statusPill('not_clocked', 'Not Clocked', <FaClock size={10} />);
  };

  const saveSessionToStorage = (session) => {
    if (!user?.employeeId) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  };

  const clearSessionFromStorage = () => {
    if (!user?.employeeId) return;
    localStorage.removeItem(STORAGE_KEY);
  };

  const loadSessionFromStorage = () => {
    if (!user?.employeeId) return null;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  };

  const sendHeartbeat = async () => {
    try {
      if (activeSession && location) {
        await axios.post(API_ENDPOINTS.ATTENDANCE_HEARTBEAT, {
          employee_id: user.employeeId,
          session_id: activeSession.session_id,
          latitude: location.latitude,
          longitude: location.longitude
        });
      }
    } catch (error) {
      console.error('Heartbeat failed:', error);
    }
  };

  const fetchTodayAttendance = async () => {
    try {
      const response = await axios.get(API_ENDPOINTS.ATTENDANCE_TODAY(user.employeeId));
      let attendanceData = response.data.attendance;
      const serverSession = response.data.active_session;

      console.log('📊 Today attendance from API (FULL):', JSON.stringify(attendanceData, null, 2));
      console.log('📊 Attendance data keys:', attendanceData ? Object.keys(attendanceData) : 'No attendance data');

      if (attendanceData) {
        // CRITICAL: Log the raw values
        console.log('🔍 Raw clock_in_ist:', attendanceData.clock_in_ist);
        console.log('🔍 Raw clock_in:', attendanceData.clock_in);
        console.log('🔍 Raw clock_out_ist:', attendanceData.clock_out_ist);
        console.log('🔍 Raw clock_out:', attendanceData.clock_out);

        // Ensure we have both IST and ISO formats
        attendanceData.clock_in = attendanceData.clock_in_ist || attendanceData.clock_in;
        attendanceData.clock_out = attendanceData.clock_out_ist || attendanceData.clock_out;

        // Pre-format for display so card always shows correct time
        if (attendanceData.clock_in) {
          attendanceData.clock_in_display = formatTimeIST(attendanceData.clock_in);
        }
        if (attendanceData.clock_out) {
          attendanceData.clock_out_display = formatTimeIST(attendanceData.clock_out);
        }

        // Parse late minutes
        attendanceData.late_minutes = Number(attendanceData.late_minutes) || 0;
        attendanceData.late_display = attendanceData.late_display || (attendanceData.late_minutes > 0 ? formatLateTime(attendanceData.late_minutes) : null);
        attendanceData.is_late = attendanceData.late_minutes > 0;

        // Calculate real-time working hours for active session (cross-midnight support)
        if (attendanceData.clock_in && !attendanceData.clock_out) {
          const clockInStr = attendanceData.clock_in_ist || attendanceData.clock_in;
          const currentTimeIST = nowIST();

          console.log('🕐 Real-time calculation:', {
            clock_in: clockInStr,
            current_time: currentTimeIST
          });

          // Calculate total minutes using cross-midnight fixed function
          const totalMinutes = calculateTotalMinutesFixed(clockInStr, currentTimeIST);
          const hours = Math.floor(totalMinutes / 60);
          const minutes = Math.round(totalMinutes % 60);

          // Store all calculated values
          attendanceData.total_hours_display = `${hours}h ${minutes}m`;
          attendanceData.total_hours = parseFloat((totalMinutes / 60).toFixed(2));
          attendanceData.total_minutes = Math.round(totalMinutes);
          attendanceData.current_hours_display = `${hours}h ${minutes}m`;

          console.log('📊 Calculated hours:', {
            total_minutes: totalMinutes,
            total_hours_display: attendanceData.total_hours_display,
            total_hours: attendanceData.total_hours
          });
        }
        // If both clock-in and clock-out exist, calculate final hours
        else if (attendanceData.clock_in && attendanceData.clock_out) {
          const clockInStr = attendanceData.clock_in_ist || attendanceData.clock_in;
          const clockOutStr = attendanceData.clock_out_ist || attendanceData.clock_out;

          const totalMinutes = calculateTotalMinutesFixed(clockInStr, clockOutStr);
          const hours = Math.floor(totalMinutes / 60);
          const minutes = Math.round(totalMinutes % 60);

          attendanceData.total_hours_display = `${hours}h ${minutes}m`;
          attendanceData.total_hours = parseFloat((totalMinutes / 60).toFixed(2));
          attendanceData.total_minutes = Math.round(totalMinutes);
        }

        // Set status if not already set
        if (!attendanceData.status) {
          if (attendanceData.clock_in && !attendanceData.clock_out) {
            attendanceData.status = 'working';
          } else if (attendanceData.clock_in && attendanceData.clock_out) {
            const totalHours = attendanceData.total_hours || 0;
            if (totalHours >= 9) {
              attendanceData.status = 'present';
            } else if (totalHours >= 5) {
              attendanceData.status = 'half_day';
            } else {
              attendanceData.status = 'present';
            }
          }
        }

        // CRITICAL FIX: Create display versions of times
        if (attendanceData.clock_in_ist) {
          attendanceData.clock_in_display = formatTimeIST(attendanceData.clock_in_ist);
          console.log('✅ Set clock_in_display from clock_in_ist:', attendanceData.clock_in_display);
        } else if (attendanceData.clock_in) {
          attendanceData.clock_in_display = formatTimeIST(attendanceData.clock_in);
          console.log('✅ Set clock_in_display from clock_in:', attendanceData.clock_in_display);
        }

        if (attendanceData.clock_out_ist) {
          attendanceData.clock_out_display = formatTimeIST(attendanceData.clock_out_ist);
          console.log('✅ Set clock_out_display from clock_out_ist:', attendanceData.clock_out_display);
        } else if (attendanceData.clock_out) {
          attendanceData.clock_out_display = formatTimeIST(attendanceData.clock_out);
          console.log('✅ Set clock_out_display from clock_out:', attendanceData.clock_out_display);
        }

        // If still no display times, check if the raw values exist
        if (!attendanceData.clock_in_display && attendanceData.clock_in_ist) {
          // Try to parse manually
          const timeStr = attendanceData.clock_in_ist.split(' ')[1];
          const parts = timeStr.split(':');
          const hourNum = parseInt(parts[0], 10);
          const minute = parts[1];
          const ampm = hourNum >= 12 ? 'PM' : 'AM';
          const hour12 = hourNum % 12 === 0 ? 12 : hourNum % 12;
          attendanceData.clock_in_display = `${hour12}:${minute} ${ampm}`;
          console.log('✅ Manual clock_in_display:', attendanceData.clock_in_display);
        }

        // Update state
        setAttendance(attendanceData);

        // Update hasClockedOutToday flag
        if (attendanceData.clock_out) {
          setHasClockedOutToday(true);
        } else {
          setHasClockedOutToday(false);
        }
      } else {
        console.log('⚠️ No attendance data for today');
        // Don't clear attendance if it already has a valid clock-in (handles brief API lag after clock-in)
        if (!serverSession) {
          setAttendance(prev => prev?.clock_in ? prev : null);
          setHasClockedOutToday(false);
        }
        // If serverSession exists but no todayAttendance = cross-midnight case
        // attendance state will be set by the serverSession block above via fetchTodayAttendance
      }

      // Handle server session
      if (serverSession) {
        // Active session exists (today or cross-midnight) → always show Clock Out
        setActiveSession(serverSession);
        saveSessionToStorage(serverSession);
        setHasClockedOutToday(false);
      }
      // If no server session but attendance has clock_in without clock_out
      else if (attendanceData?.clock_in && !attendanceData?.clock_out) {
        // cross-midnight: attendance_date may be yesterday but session still active
        const inferredSession = {
          session_id: attendanceData.session_id || 'temp-' + Date.now(),
          clock_in_time: attendanceData.clock_in,
          is_virtual: false
        };
        setActiveSession(inferredSession);
        saveSessionToStorage(inferredSession);
        setHasClockedOutToday(false);
      }
      else if (!serverSession && !attendanceData) {
        // Only clear session if server confirms no active session AND no attendance
        setActiveSession(null);
        clearSessionFromStorage();
        setHasClockedOutToday(false);
      }
      // ✅ If serverSession exists but attendanceData is null = cross-midnight
      // activeSession is already set above, attendance will show from previous day's state
      else if (serverSession && !attendanceData) {
        // Keep activeSession set (already done above)
        // attendance state remains as-is (previous day's data still in state)
        setHasClockedOutToday(false);
      }

      // Set up real-time interval for updating working hours every minute
      if (attendanceData?.clock_in && !attendanceData?.clock_out) {
        if (window.realTimeInterval) {
          clearInterval(window.realTimeInterval);
        }

        window.realTimeInterval = setInterval(() => {
          const clockInStr = attendanceData.clock_in_ist || attendanceData.clock_in;
          const currentTimeIST = nowIST();

          if (clockInStr && currentTimeIST) {
            const totalMinutes = calculateTotalMinutesFixed(clockInStr, currentTimeIST);
            const hours = Math.floor(totalMinutes / 60);
            const minutes = Math.round(totalMinutes % 60);
            const totalHoursDisplay = `${hours}h ${minutes}m`;

            setAttendance(prev => ({
              ...prev,
              total_hours_display: totalHoursDisplay,
              total_hours: parseFloat((totalMinutes / 60).toFixed(2)),
              total_minutes: Math.round(totalMinutes),
              current_hours_display: totalHoursDisplay
            }));
          }
        }, 60000);

        return () => {
          if (window.realTimeInterval) {
            clearInterval(window.realTimeInterval);
            window.realTimeInterval = null;
          }
        };
      } else {
        if (window.realTimeInterval) {
          clearInterval(window.realTimeInterval);
          window.realTimeInterval = null;
        }
      }

      return attendanceData;
    } catch (error) {
      console.error('❌ Error fetching today attendance:', error);
      console.error('Error details:', error.response?.data);

      if (window.realTimeInterval) {
        clearInterval(window.realTimeInterval);
        window.realTimeInterval = null;
      }

      return null;
    }
  };

  // Add this function after fetchTodayAttendance and before return

  // In Attendance.jsx - Update fetchMissedClockOuts

  const fetchMissedClockOuts = async () => {
    try {
      const response = await axios.get(API_ENDPOINTS.ATTENDANCE_MISSED_CLOCKOUTS(user.employeeId));
      const missedRecords = response.data.missed_clockouts || [];
      const hasActiveSession = response.data.has_active_session;

      console.log('📋 Missed clockouts:', missedRecords);
      console.log('📋 Has active session from API:', hasActiveSession);

      setMissedClockOuts(missedRecords);

      // ✅ If API says no active session, clear any stale virtual session
      if (!hasActiveSession && activeSession?.is_virtual) {
        // Check if the virtual session's attendance record is still incomplete
        const virtualAttendanceId = activeSession.attendance_id;
        const stillIncomplete = virtualAttendanceId && missedRecords.some(r =>
          r.id === virtualAttendanceId &&
          !r.has_clock_out &&
          !r.is_regularized &&
          r.is_today === true
        );
        if (!stillIncomplete) {
          setActiveSession(null);
          clearSessionFromStorage();
        }
      }

      // ✅ If there's an active session from API but local state is null, sync it
      if (hasActiveSession && !activeSession) {
        try {
          const todayRes = await axios.get(API_ENDPOINTS.ATTENDANCE_TODAY(user.employeeId));
          if (todayRes.data.active_session) {
            setActiveSession(todayRes.data.active_session);
            saveSessionToStorage(todayRes.data.active_session);
          }
        } catch (_) {}
      }

      // ✅ Show regularization messages only for PAST dates
      const nowISTDateStr = nowIST().split(' ')[0];
      const eligibleRecords = missedRecords.filter(r =>
        r.can_regularize === true &&
        !r.is_regularized &&
        r.attendance_date !== nowISTDateStr
      );
      const pendingRecords = missedRecords.filter(r =>
        r.regularization_requested &&
        r.regularization_status === 'pending'
      );

      if (eligibleRecords.length > 0 && !sessionStorage.getItem('eligible_regularization_shown')) {
        sessionStorage.setItem('eligible_regularization_shown', 'true');
        setMessage({
          type: 'warning',
          text: `You have ${eligibleRecords.length} day(s) that need clock-out. Please request regularization.`
        });
        setTimeout(() => setMessage({ type: '', text: '' }), 5000);
      }

      if (pendingRecords.length > 0) {
        setMessage({
          type: 'info',
          text: `You have ${pendingRecords.length} regularization request(s) pending approval.`
        });
      }

    } catch (error) {
      console.error('Error fetching missed clock-outs:', error);
    }
  };

  // Own regularization requests (any status) — used to hide/disable the per-row
  // "Regularize" button for dates that already have a pending request.
  const fetchMyRegularizations = async () => {
    try {
      const response = await axios.get(API_ENDPOINTS.ATTENDANCE_MY_REGULARIZATIONS(user.employeeId));
      setMyRegularizations(response.data.requests || []);
    } catch (error) {
      console.error('Error fetching my regularization requests:', error);
    }
  };

  // "YYYY-MM-DDTHH:MM" (datetime-local value) → "YYYY-MM-DD HH:MM:SS" (backend format)
  const toBackendDateTime = (dtLocal) => {
    if (!dtLocal) return null;
    const [datePart, timePart] = dtLocal.split('T');
    const [hour, minute] = timePart.split(':');
    return `${datePart} ${hour}:${minute}:00`;
  };

  const REQUEST_TYPES_NEEDING_CLOCK_OUT = ['missing_clock_out', 'attendance_correction', 'wrong_working_hours'];
  const REQUEST_TYPES_NEEDING_CLOCK_IN = ['missing_clock_in', 'attendance_correction', 'wrong_working_hours'];

  const handleRegularizationRequest = async () => {
    if (!selectedMissedRecord) {
      setMessage({ type: 'danger', text: 'No record selected' });
      return;
    }
    if (!regularizationReason || regularizationReason.trim().length < 20) {
      setMessage({ type: 'danger', text: 'Please enter a reason of at least 20 characters' });
      return;
    }
    if (regularizationType === 'missing_clock_in' && !regularizationClockIn) {
      setMessage({ type: 'danger', text: 'Please select the correct clock-in time' });
      return;
    }
    if (regularizationType === 'missing_clock_out' && !regularizationTime) {
      setMessage({ type: 'danger', text: 'Please select the correct clock-out time' });
      return;
    }
    if (['attendance_correction', 'wrong_working_hours'].includes(regularizationType) && !regularizationClockIn && !regularizationTime) {
      setMessage({ type: 'danger', text: 'Please provide at least a corrected clock-in or clock-out time' });
      return;
    }
    if (regularizationType === 'break_correction' && !(parseFloat(regularizationBreakDuration) > 0)) {
      setMessage({ type: 'danger', text: 'Please enter a valid break duration in minutes' });
      return;
    }
    if (regularizationClockIn && regularizationTime && regularizationTime <= regularizationClockIn) {
      setMessage({ type: 'danger', text: 'Clock-out time cannot be before or equal to clock-in time.' });
      return;
    }
    if (regularizationMinTime && regularizationType === 'missing_clock_out' && regularizationTime < regularizationMinTime) {
      setMessage({ type: 'danger', text: 'Clock-out time cannot be before clock-in time.' });
      return;
    }
    if (attachmentError) {
      setMessage({ type: 'danger', text: attachmentError });
      return;
    }

    setSubmittingRequest(true);

    try {
      const formData = new FormData();
      formData.append('request_type', regularizationType);
      formData.append('attendance_date', selectedMissedRecord.attendance_date);
      if (selectedMissedRecord.id) formData.append('attendance_id', String(selectedMissedRecord.id));
      if (REQUEST_TYPES_NEEDING_CLOCK_IN.includes(regularizationType) && regularizationClockIn) {
        formData.append('requested_clock_in', toBackendDateTime(regularizationClockIn));
      }
      if (REQUEST_TYPES_NEEDING_CLOCK_OUT.includes(regularizationType) && regularizationTime) {
        formData.append('requested_clock_out_time', toBackendDateTime(regularizationTime));
      }
      if (regularizationType === 'break_correction') {
        formData.append('requested_break_duration', regularizationBreakDuration);
      }
      formData.append('reason', regularizationReason.trim());
      if (regularizationAttachment) formData.append('attachment', regularizationAttachment);

      const url = API_ENDPOINTS.ATTENDANCE_REGULARIZATION_REQUEST(user.employeeId);
      await axios.post(url, formData, { headers: { 'Content-Type': 'multipart/form-data' } });

      setSuccessMessage(`Regularization request for ${selectedMissedRecord.attendance_date} submitted successfully! Your reporting manager will review it.`);
      setShowSuccessModal(true);
      setShowRegularizationModal(false);
      setSelectedMissedRecord(null);
      setRegularizationTime('');
      setRegularizationClockIn('');
      setRegularizationReason('');
      setRegularizationBreakDuration('');
      setRegularizationAttachment(null);
      setAttachmentError('');

      await fetchMissedClockOuts();
      setHistoryPage(0);
      await fetchAttendanceHistory(0);
      await fetchMyRegularizations();
      setMessage({ type: '', text: '' });

    } catch (error) {
      console.error('❌ Error submitting regularization:', error);
      setMessage({ type: 'danger', text: error.response?.data?.message || 'Failed to submit request' });
      setTimeout(() => setMessage({ type: '', text: '' }), 5000);
    } finally {
      setSubmittingRequest(false);
    }
  };

  const REGULARIZATION_TYPE_OPTIONS = [
    { value: 'missing_clock_in', label: 'Missing Clock In' },
    { value: 'missing_clock_out', label: 'Missing Clock Out' },
    { value: 'attendance_correction', label: 'Attendance Correction' },
    { value: 'half_day_to_present', label: 'Half Day to Present' },
    { value: 'present_to_half_day', label: 'Present to Half Day' },
    { value: 'wrong_working_hours', label: 'Wrong Working Hours' },
    { value: 'client_visit', label: 'Client Visit' },
    { value: 'official_duty', label: 'Official Duty' },
    { value: 'wfh', label: 'Work From Home' },
    { value: 'break_correction', label: 'Break Correction' },
    { value: 'other', label: 'Other' },
  ];

  const handleAttachmentChange = (e) => {
    const file = e.target.files?.[0] || null;
    setRegularizationAttachment(null);
    setAttachmentError('');
    if (!file) return;
    const allowedExt = /\.(jpe?g|png|pdf|docx?)$/i;
    if (!allowedExt.test(file.name)) {
      setAttachmentError('Only JPG, PNG, PDF, or DOC/DOCX files are allowed.');
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setAttachmentError('File exceeds the 4 MB limit.');
      return;
    }
    setRegularizationAttachment(file);
  };

  // Add the generateLast30DaysAttendance function if missing
  const generateLast30DaysAttendance = (history) => {
    const completeHistory = [];
    const today = new Date();
    const todayStr = formatDateStr(today);
    const historyMap = {};

    history.forEach(record => {
      if (!record.attendance_date) return;
      if (!historyMap[record.attendance_date] || (!historyMap[record.attendance_date].clock_in && record.clock_in)) {
        historyMap[record.attendance_date] = record;
      }
    });

    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = formatDateStr(date);
      const dayOfWeek = date.getDay();
      const isToday = dateStr === todayStr;
      const isWeeklyOff = dayOfWeek === 0 || dayOfWeek === 6;
      const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
      const existingRecord = historyMap[dateStr];

      if (existingRecord) {
        const lateMinutes = Number(existingRecord.late_minutes) || 0;
        let lateDisplay = existingRecord.late_display || (lateMinutes > 0 ? formatLateTime(lateMinutes) : null);
        let clockOut = existingRecord.clock_out_ist || existingRecord.clock_out;
        let displayStatus = existingRecord.status;
        let totalHoursDisplay = existingRecord.total_hours_display;
        let totalHours = existingRecord.total_hours;
        let currentHoursDisplay = null;
        let formattedClockIn = null;
        let formattedClockOut = null;

        const clockInValue = existingRecord.clock_in_ist || existingRecord.clock_in;
        const clockOutValue = existingRecord.clock_out_ist || existingRecord.clock_out;

        if (!displayStatus && clockInValue && !clockOutValue && isToday) {
          displayStatus = 'working';
        }

        if (clockInValue) {
          formattedClockIn = formatTimeIST(clockInValue);
        }

        if (clockOutValue) {
          formattedClockOut = formatTimeIST(clockOutValue);
        }

        // Calculate total hours with cross-midnight support
        if (clockInValue && clockOutValue) {
          const totalMinutes = calculateTotalMinutesFixed(clockInValue, clockOutValue);
          const hours = Math.floor(totalMinutes / 60);
          const minutes = Math.round(totalMinutes % 60);
          totalHoursDisplay = `${hours}h ${minutes}m`;
          totalHours = totalMinutes / 60;
        } else if (clockInValue && !clockOutValue && isToday) {
          // Real-time calculation for today's active session
          const totalMinutes = calculateTotalMinutesFixed(clockInValue, nowIST());
          const hours = Math.floor(totalMinutes / 60);
          const minutes = Math.round(totalMinutes % 60);
          currentHoursDisplay = `${hours}h ${minutes}m`;
          totalHoursDisplay = currentHoursDisplay;
          totalHours = totalMinutes / 60;
          displayStatus = 'working';
          clockOut = null;
          formattedClockOut = '--';
        } else if (clockInValue && !clockOutValue && !isToday) {
          // For previous days with missed clock-out, calculate up to current time
          // This ensures that if employee is still working (crossed midnight), 
          // the hours continue to update in real-time
          const totalMinutes = calculateTotalMinutesFixed(clockInValue, nowIST());
          const hours = Math.floor(totalMinutes / 60);
          const minutes = Math.round(totalMinutes % 60);

          // Check if the attendance date is from a previous day but still active
          // Show (Missed) only if the employee hasn't clocked out yet
          if (!clockOutValue) {
            totalHoursDisplay = `${hours}h ${minutes}m (Missed)`;
          } else {
            totalHoursDisplay = `${hours}h ${minutes}m`;
          }
          totalHours = totalMinutes / 60;
          // Keep the status as 'working' since they haven't clocked out
          if (!displayStatus && !clockOutValue) {
            displayStatus = 'working';
          }
        }
        let finalStatus = displayStatus;
        if (existingRecord.is_regularized) {
          finalStatus = 'present';
        }

        completeHistory.push({
          id: existingRecord.id,
          date: dateStr,
          attendance_date: dateStr,
          dayOfWeek,
          isWeeklyOff: false,
          dayName,
          isToday,
          clock_in: clockInValue,
          clock_out: clockOutValue,
          formatted_clock_in: formattedClockIn,
          formatted_clock_out: formattedClockOut,
          total_hours: totalHours,
          total_hours_display: totalHoursDisplay,
          current_hours_display: currentHoursDisplay,
          status: finalStatus,
          original_status: displayStatus,
          late_minutes: lateMinutes,
          late_display: lateDisplay,
          is_regularized: existingRecord.is_regularized || false,
          attendance_type: existingRecord.attendance_type || null
        });

      } else {
        let status = 'not_clocked';
        if (isWeeklyOff) status = 'weekly_off';

        completeHistory.push({
          id: null,
          date: dateStr,
          attendance_date: dateStr,
          dayOfWeek,
          isWeeklyOff,
          dayName,
          isToday,
          clock_in: null,
          clock_out: null,
          formatted_clock_in: null,
          formatted_clock_out: null,
          total_hours: null,
          total_hours_display: null,
          current_hours_display: null,
          status: status,
          original_status: status,
          late_minutes: 0,
          late_display: null,
          is_regularized: false
        });
      }
    }

    return completeHistory.sort((a, b) => b.date.localeCompare(a.date));
  };

  // Helper function to calculate current working hours (if needed)
  const calculateCurrentWorkingHours = (clockInStr) => {
    if (!clockInStr) return { display: '0h 0m', hours: 0, minutes: 0, totalMinutes: 0 };

    const totalMinutes = calculateTotalMinutesFixed(clockInStr, nowIST());
    const hours = Math.floor(totalMinutes / 60);
    const minutes = Math.round(totalMinutes % 60);

    return {
      display: `${hours}h ${minutes}m`,
      hours: hours,
      minutes: minutes,
      totalMinutes: totalMinutes
    };
  };

  // Parse shift timing for expected hours calculation
  const parseShiftTiming = (shiftString) => {
    if (!shiftString) {
      return { startHour: 9, startMinute: 0, endHour: 18, endMinute: 0, totalHours: 9 };
    }
    const parts = shiftString.split('-');
    if (parts.length !== 2) {
      return { startHour: 9, startMinute: 0, endHour: 18, endMinute: 0, totalHours: 9 };
    }
    const startPart = parts[0].trim();
    const endPart = parts[1].trim();

    const parseTime = (timeStr) => {
      const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (!match) return null;
      let hour = parseInt(match[1]);
      const minute = parseInt(match[2]);
      const ampm = match[3].toUpperCase();
      if (ampm === 'PM' && hour !== 12) hour += 12;
      if (ampm === 'AM' && hour === 12) hour = 0;
      return { hour, minute };
    };

    const startTime = parseTime(startPart);
    const endTime = parseTime(endPart);

    if (!startTime || !endTime) {
      return { startHour: 9, startMinute: 0, endHour: 18, endMinute: 0, totalHours: 9 };
    }

    const startTotalMinutes = (startTime.hour * 60) + startTime.minute;
    const endTotalMinutes = (endTime.hour * 60) + endTime.minute;
    let totalMinutes = endTotalMinutes - startTotalMinutes;
    if (totalMinutes < 0) totalMinutes += 24 * 60;

    return {
      startHour: startTime.hour,
      startMinute: startTime.minute,
      endHour: endTime.hour,
      endMinute: endTime.minute,
      totalHours: totalMinutes / 60
    };
  };

  const calculateMonthlyStats = (history) => {
    let present = 0;
    let absent = 0;
    let halfDays = 0;
    let weeklyOff = 0;
    let totalHours = 0;
    let workingDaysCount = 0;

    history.forEach(record => {
      if (record.isWeeklyOff || record.status === 'weekly_off') {
        weeklyOff++;
      } else if (record.clock_in && record.clock_out) {
        // Hours-based calculation
        const hrs = parseFloat(record.total_hours) || 0;
        if (hrs >= 9) {
          present++;
          workingDaysCount++;
          totalHours += hrs;
        } else if (hrs >= 5) {
          halfDays++;
          workingDaysCount++;
          totalHours += hrs;
        } else {
          absent++;
        }
      } else if (record.clock_in && !record.clock_out) {
        // Active session (today) — count as working
        const hrs = parseFloat(record.total_hours) || 0;
        totalHours += hrs;
        workingDaysCount++;
      } else if (!record.clock_in && !record.isWeeklyOff) {
        absent++;
      }
    });

    const averageHours = workingDaysCount > 0 ? Math.round((totalHours / workingDaysCount) * 10) / 10 : 0;

    setMonthlyStats({
      totalDays: history.length,
      presentDays: present,
      absentDays: absent,
      halfDays: halfDays,
      weeklyOffDays: weeklyOff,
      leaves: 0,
      totalHours: Math.round(totalHours * 10) / 10,
      averageHours: averageHours,
      lateDays: 0,
      totalLateMinutes: 0
    });
  };

  const updateChartData = (history) => {
    const sortedHistory = [...history].sort((a, b) => new Date(a.date) - new Date(b.date));
    const labels = [];
    const data = [];

    sortedHistory.forEach(record => {
      if (!record.isWeeklyOff && record.status !== 'weekly_off') {
        labels.push(formatShortDate(record.date));
        data.push(record.total_hours ? parseFloat(record.total_hours) : 0);
      }
    });

    setChartData({
      labels: labels.slice(-15),
      datasets: [{
        label: 'Hours Worked',
        data: data.slice(-15),
        borderColor: 'rgb(75, 192, 192)',
        backgroundColor: 'rgba(75, 192, 192, 0.1)',
        tension: 0.4,
        fill: true,
        pointBackgroundColor: data.slice(-15).map(v => v >= 8 ? 'rgb(40, 167, 69)' : v >= 5 ? 'rgb(255, 193, 7)' : 'rgb(220, 53, 69)'),
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7
      }]
    });
  };

  // page 0 = most recent 30 days (ending today), page 1 = the 30 days before that, etc. —
  // exactly one API call per page, always a fixed 30-day window, never appended to what's
  // already on screen.
  const fetchAttendanceHistory = async (page = 0) => {
    try {
      setLoadingHistory(true);
      const isFirstPage = page === 0;

      const today = new Date();
      const endDate = new Date(today);
      endDate.setDate(endDate.getDate() - (page * HISTORY_PAGE_DAYS));
      const startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - HISTORY_PAGE_DAYS + 1);

      const formatDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };

      const startDateStr = formatDate(startDate);
      const endDateStr = formatDate(endDate);

      const response = await axios.get(
        API_ENDPOINTS.ATTENDANCE_EMPLOYEE_REPORT(user.employeeId, startDateStr, endDateStr)
      );

      let history = response.data.attendance || [];

      // Generate complete days (including absent/weekly off)
      const generateDays = (apiHistory, fromDate, toDate) => {
        const result = [];
        const historyMap = {};
        apiHistory.forEach(r => {
          if (!r.attendance_date) return;
          if (!historyMap[r.attendance_date] || (!historyMap[r.attendance_date].clock_in && r.clock_in)) {
            historyMap[r.attendance_date] = r;
          }
        });

        const todayStr = formatDate(today);

        let d = new Date(toDate);
        const stopDate = new Date(fromDate);
        while (d >= stopDate) {
          const dateStr = formatDate(d);
          const dayOfWeek = d.getDay();
          const isToday = dateStr === todayStr;
          const isWeeklyOff = dayOfWeek === 0 || dayOfWeek === 6;
          const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
          const existingRecord = historyMap[dateStr];

          if (existingRecord) {
            const lateMinutes = Number(existingRecord.late_minutes) || 0;
            const lateDisplay = existingRecord.late_display || (lateMinutes > 0 ? formatLateTime(lateMinutes) : null);
            const clockInValue = existingRecord.clock_in_ist || existingRecord.clock_in;
            const clockOutValue = existingRecord.clock_out_ist || existingRecord.clock_out;
            let displayStatus = existingRecord.status;
            let totalHoursDisplay = existingRecord.total_hours_display;
            let totalHours = existingRecord.total_hours;
            let currentHoursDisplay = null;
            let formattedClockIn = clockInValue ? formatTimeIST(clockInValue) : null;
            let formattedClockOut = clockOutValue ? formatTimeIST(clockOutValue) : null;

            if (!displayStatus && clockInValue && !clockOutValue && isToday) displayStatus = 'working';

            if (clockInValue && clockOutValue) {
              const totalMinutes = calculateTotalMinutesFixed(clockInValue, clockOutValue);
              const h = Math.floor(totalMinutes / 60), m = Math.round(totalMinutes % 60);
              totalHoursDisplay = `${h}h ${m}m`;
              totalHours = totalMinutes / 60;
            } else if (clockInValue && !clockOutValue && isToday) {
              const totalMinutes = calculateTotalMinutesFixed(clockInValue, nowIST());
              const h = Math.floor(totalMinutes / 60), m = Math.round(totalMinutes % 60);
              currentHoursDisplay = `${h}h ${m}m`;
              totalHoursDisplay = currentHoursDisplay;
              totalHours = totalMinutes / 60;
              displayStatus = 'working';
              formattedClockOut = '--';
            } else if (clockInValue && !clockOutValue && !isToday) {
              const totalMinutes = calculateTotalMinutesFixed(clockInValue, nowIST());
              const h = Math.floor(totalMinutes / 60), m = Math.round(totalMinutes % 60);
              totalHoursDisplay = `${h}h ${m}m (Missed)`;
              totalHours = totalMinutes / 60;
              if (!displayStatus) displayStatus = 'working';
            }

            result.push({
              id: existingRecord.id, date: dateStr, attendance_date: dateStr,
              dayOfWeek, isWeeklyOff: isWeeklyOff && !existingRecord.clock_in && !existingRecord.clock_in_ist, dayName, isToday,
              clock_in: clockInValue, clock_out: clockOutValue,
              formatted_clock_in: formattedClockIn, formatted_clock_out: formattedClockOut,
              total_hours: totalHours, total_hours_display: totalHoursDisplay,
              current_hours_display: currentHoursDisplay,
              status: existingRecord.is_regularized ? 'present' : displayStatus,
              original_status: displayStatus, late_minutes: lateMinutes,
              late_display: lateDisplay, is_regularized: existingRecord.is_regularized || false,
              attendance_type: existingRecord.attendance_type || null
            });
          } else {
            result.push({
              id: null, date: dateStr, attendance_date: dateStr,
              dayOfWeek, isWeeklyOff, dayName, isToday,
              clock_in: null, clock_out: null, formatted_clock_in: null, formatted_clock_out: null,
              total_hours: null, total_hours_display: null, current_hours_display: null,
              status: isWeeklyOff ? 'weekly_off' : 'not_clocked',
              original_status: isWeeklyOff ? 'weekly_off' : 'not_clocked',
              late_minutes: 0, late_display: null, is_regularized: false
            });
          }
          d.setDate(d.getDate() - 1);
        }
        return result;
      };

      const newRecords = generateDays(history, startDate, endDate);
      setAttendanceHistory(newRecords);

      if (isFirstPage) {
        // Sync today's attendance from DB
        const todayStr = formatDate(today);
        const todayRecord = history.find(r => r.attendance_date === todayStr);
        if (todayRecord && todayRecord.clock_in) {
          const clockIn = todayRecord.clock_in_ist || todayRecord.clock_in;
          const clockOut = todayRecord.clock_out_ist || todayRecord.clock_out;
          setAttendance(prev => {
            if (!prev) {
              return {
                ...todayRecord, clock_in: clockIn, clock_out: clockOut,
                clock_in_display: clockIn ? formatTimeIST(clockIn) : null,
                clock_out_display: clockOut ? formatTimeIST(clockOut) : null,
                late_minutes: Number(todayRecord.late_minutes) || 0,
                late_display: todayRecord.late_display || null
              };
            }
            if (!prev.clock_in_display) {
              return { ...prev, clock_in_display: formatTimeIST(clockIn) };
            }
            // If DB has clock-out but local state doesn't yet, sync it
            if (clockOut && !prev.clock_out) {
              return {
                ...prev,
                clock_out: clockOut, clock_out_ist: clockOut,
                clock_out_display: formatTimeIST(clockOut),
                total_hours: todayRecord.total_hours,
                total_minutes: todayRecord.total_minutes,
                total_hours_display: todayRecord.total_hours_display,
                status: todayRecord.status
              };
            }
            return prev;
          });
        }

        // Stats calculation
        const todayDay = today.getDate();
        const cycleStart = todayDay >= 26
          ? new Date(today.getFullYear(), today.getMonth(), 26)
          : new Date(today.getFullYear(), today.getMonth() - 1, 26);
        const cycleEnd = todayDay >= 26
          ? new Date(today.getFullYear(), today.getMonth() + 1, 25)
          : new Date(today.getFullYear(), today.getMonth(), 25);
        const periodHistory = newRecords.filter(r => {
          const rd = new Date(r.date);
          return rd >= cycleStart && rd <= cycleEnd;
        });
        calculateMonthlyStats(periodHistory.length > 0 ? periodHistory : newRecords);
        updateChartData(periodHistory.length > 0 ? periodHistory : newRecords);
      }
    } catch (error) {
      console.error('❌ Error fetching attendance history:', error);
      if (page === 0) {
        setAttendanceHistory(generateLast30DaysAttendance([]));
        calculateMonthlyStats([]);
        updateChartData([]);
      }
    } finally {
      setLoadingHistory(false);
    }
  };

  const handlePreviousPage = () => {
    if (historyPage === 0) return;
    const newPage = historyPage - 1;
    setHistoryPage(newPage);
    fetchAttendanceHistory(newPage);
  };

  const handleNextPage = () => {
    const newPage = historyPage + 1;
    setHistoryPage(newPage);
    fetchAttendanceHistory(newPage);
  };

  const getCurrentLocation = () => {
    setLocationLoading(true);
    setLocationError(null);

    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported');
      setLocationLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const newLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp
        };
        setLocation(newLocation);

        const distance = calculateDistance(
          newLocation.latitude, newLocation.longitude,
          OFFICE_COORDS.latitude, OFFICE_COORDS.longitude
        );

        setGeofenceInfo({
          distance: Math.round(distance * 100) / 100,
          isInOffice: distance <= OFFICE_COORDS.radius,
          requiredRadius: OFFICE_COORDS.radius
        });
        setLocationLoading(false);
      },
      (error) => {
        let errorMessage = 'Failed to get location';
        if (error.code === error.PERMISSION_DENIED) errorMessage = 'Please enable location access';
        setLocationError(errorMessage);
        setLocationLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const [showPreviousDayClockOut, setShowPreviousDayClockOut] = useState({
    show: false,
    attendance_id: null,
    attendance_date: null,
    clock_in_time: null
  });

  const handleClockIn = async () => {
    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      // No separate "check for incomplete records first" round-trip — POST /clock-in already
      // performs this exact check itself server-side (previous-day incomplete attendance +
      // active-session checks in attendanceController.clockIn) and returns the same
      // `has_missed_clockout` + `attendance_date` shape the catch block below already handles.
      // The old pre-check here just duplicated that call, adding a full extra round-trip to
      // every single clock-in with no added safety — the backend was always the real guard.
      const response = await axios.post(API_ENDPOINTS.ATTENDANCE_CLOCK_IN, {
        employee_id: user.employeeId,
        latitude: null,
        longitude: null,
        accuracy: null
      });

      console.log('✅ Clock-in response:', response.data);
      setMessage({ type: 'success', text: response.data.message });

      // ✅ CRITICAL FIX: Set attendance and session correctly
      const clockInIST = response.data.clock_in_ist || response.data.clock_in;
      const newSessionId = response.data.session_id;
      const newAttendanceDate = response.data.attendance_date || nowIST().split(' ')[0];

      // ✅ Clear old session FIRST before setting new one
      clearSessionFromStorage();
      setActiveSession(null);

      const newAttendance = {
        id: response.data.attendance_id || null,
        clock_in: clockInIST,
        clock_in_ist: clockInIST,
        clock_in_display: formatTimeIST(clockInIST),
        late_minutes: response.data.late_minutes || 0,
        late_display: response.data.late_display || formatLateTime(response.data.late_minutes),
        status: 'working',
        attendance_date: newAttendanceDate,
        session_id: newSessionId
      };
      setAttendance(newAttendance);

      // ✅ Set new session
      const session = {
        session_id: newSessionId,
        clock_in_time: clockInIST,
        is_virtual: false
      };
      setActiveSession(session);
      saveSessionToStorage(session);
      setHasClockedOutToday(false);

      // Refresh history and missed clock-outs in the background — attendance/session state
      // is already fully set above from the clock-in response itself, so the button/timer
      // already reflect "clocked in" immediately. These two calls only refresh secondary UI
      // (the history table, the missed-clockout banner) and both have their own internal
      // error handling, so there's nothing to await or catch here.
      setHistoryPage(0);
      fetchAttendanceHistory(0);
      fetchMissedClockOuts();

    } catch (error) {
      console.error('❌ Clock-in error:', error);
      const errorData = error.response?.data;
      if (errorData?.code === 'IP_BLOCKED') setNetworkBlocked(true);

      if (errorData?.has_missed_clockout && errorData?.attendance_date) {
        setMessage({
          type: 'warning',
          text: errorData.message || `You have an incomplete attendance record from ${errorData.attendance_date}.`
        });

        // The backend's has_missed_clockout error only carries attendance_date, not
        // attendance_id/clock_in_time (clockOutMissed needs attendance_id) — resolve those
        // here instead, but only in this rare interrupt path rather than on every clock-in.
        let attendanceId = errorData.attendance_id;
        let clockInTime = errorData.clock_in_time;
        if (!attendanceId) {
          try {
            const missedResponse = await axios.get(API_ENDPOINTS.ATTENDANCE_MISSED_CLOCKOUTS(user.employeeId));
            const missedRecords = missedResponse.data.missed_clockouts || [];
            const match = missedRecords.find(r => r.attendance_date === errorData.attendance_date && !r.has_clock_out);
            if (match) {
              attendanceId = match.id;
              clockInTime = match.clock_in_ist || match.clock_in;
            }
          } catch { /* best-effort — the modal still shows the date/message either way */ }
        }

        setShowPreviousDayClockOut({
          show: true,
          attendance_id: attendanceId,
          attendance_date: errorData.attendance_date,
          clock_in_time: clockInTime
        });
      } else {
        setMessage({ type: 'danger', text: errorData?.message || error.message });
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePreviousDayClockOut = async () => {
    setLoading(true);
    try {
      const response = await axios.post(`${API_ENDPOINTS.ATTENDANCE}/clock-out-missed`, {
        employee_id: user.employeeId,
        attendance_id: showPreviousDayClockOut.attendance_id,
        attendance_date: showPreviousDayClockOut.attendance_date
      });

      setMessage({ type: 'success', text: `Successfully clocked out for ${showPreviousDayClockOut.attendance_date}!` });
      setShowPreviousDayClockOut({ show: false, attendance_id: null, attendance_date: null, clock_in_time: null });

      // Clear active session since previous day is now clocked out
      setActiveSession(null);
      clearSessionFromStorage();
      setHasClockedOutToday(false); // Allow Clock In for new shift

      await fetchTodayAttendance();
      setHistoryPage(0);
      await fetchAttendanceHistory(0);
      await fetchMissedClockOuts();

    } catch (error) {
      console.error('Error clocking out for previous day:', error);
      setMessage({ type: 'danger', text: error.response?.data?.message || 'Failed to clock out for previous day' });
    } finally {
      setLoading(false);
    }
  };

  const handleClockOut = async () => {
    setLoading(true);
    try {
      const response = await axios.post(API_ENDPOINTS.ATTENDANCE_CLOCK_OUT, {
        employee_id: user.employeeId,
        session_id: activeSession?.session_id || null,
        latitude: null,
        longitude: null,
        accuracy: null
      });

      setMessage({ type: 'success', text: response.data.message });

      // Apply clock-out directly from API response
      const clockOutIST = response.data.clock_out_ist;
      setAttendance(prev => ({
        ...prev,
        clock_out: clockOutIST,
        clock_out_ist: clockOutIST,
        clock_out_display: formatTimeIST(clockOutIST),
        total_hours: response.data.total_hours,
        total_minutes: response.data.total_minutes,
        total_hours_display: response.data.total_hours_display,
        status: response.data.status
      }));

      setActiveSession(null);
      clearSessionFromStorage();
      setHasClockedOutToday(true);
      setMissedClockOuts([]);

      // Non-blocking — same reasoning as handleClockIn above: the clock-out itself has
      // already succeeded and the button/state already reflect it.
      setHistoryPage(0);
      fetchAttendanceHistory(0);
      fetchMissedClockOuts();

    } catch (error) {
      console.error('❌ Clock-out error:', error);
      const errData = error.response?.data;
      if (errData?.code === 'IP_BLOCKED') setNetworkBlocked(true);
      if (errData?.too_early) {
        setMessage({ type: 'warning', text: errData.message });
      } else if (errData?.already_clocked_out || error.response?.status === 404) {
        setActiveSession(null);
        clearSessionFromStorage();
        setHasClockedOutToday(false);
        setAttendance(null);
        setMissedClockOuts([]);
        await fetchTodayAttendance();
        await fetchMissedClockOuts();
        setHistoryPage(0);
        await fetchAttendanceHistory(0);
      } else if (error.response?.status === 400 && errData?.message?.includes('No active session')) {
        setActiveSession(null);
        clearSessionFromStorage();
        setHasClockedOutToday(false);
        await fetchTodayAttendance();
        await fetchMissedClockOuts();
      } else {
        setMessage({ type: 'danger', text: errData?.message || 'Failed to clock out' });
      }
    } finally {
      setLoading(false);
    }
  };

  const isValidSession = async () => {
    try {
      const currentSession = activeSession || loadSessionFromStorage();
      if (!currentSession || !currentSession.session_id) return false;

      // Virtual sessions: validate against missed clockouts
      if (currentSession.is_virtual) {
        if (!currentSession.attendance_id) return false;
        const missedResponse = await axios.get(API_ENDPOINTS.ATTENDANCE_MISSED_CLOCKOUTS(user.employeeId));
        const missedRecords = missedResponse.data.missed_clockouts || [];
        return missedRecords.some(r =>
          r.id === currentSession.attendance_id &&
          !r.has_clock_out &&
          !r.is_regularized &&
          r.is_today === true
        );
      }

      // Real sessions: check server
      const response = await axios.get(API_ENDPOINTS.ATTENDANCE_TODAY(user.employeeId));
      const serverSession = response.data.active_session;

      // ✅ Any active server session = valid (handles cross-midnight where session_id may differ)
      if (serverSession) return true;

      // No server session = stale local session
      return false;
    } catch (error) {
      return false;
    }
  };

  // Session validity is checked only on mount and after clock-in/clock-out actions

  // Real-time update for today's working hours
  useEffect(() => {
    if (!attendance?.clock_in || attendance?.clock_out) return;

    const updateCurrentHours = () => {
      const clockInStr = attendance.clock_in_ist || attendance.clock_in;
      const currentTimeIST = nowIST();
      const totalMinutes = calculateTotalMinutesFixed(clockInStr, currentTimeIST);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = Math.round(totalMinutes % 60);

      setAttendance(prev => ({
        ...prev,
        total_hours_display: `${hours}h ${minutes}m`,
        total_hours: totalMinutes / 60,
        total_minutes: totalMinutes
      }));

      setAttendanceHistory(prevHistory => {
        const todayStr = formatDateStr(new Date());
        return prevHistory.map(record => {
          if (record.date === todayStr && record.isToday) {
            return {
              ...record,
              total_hours_display: `${hours}h ${minutes}m`,
              total_hours: totalMinutes / 60,
              current_hours_display: `${hours}h ${minutes}m`
            };
          }
          return record;
        });
      });
    };

    const interval = setInterval(updateCurrentHours, 60000);
    return () => clearInterval(interval);
  }, [attendance?.clock_in, attendance?.clock_out]);

  // Housekeeper-only: same network gate as the main dashboard — hide the clock in/out
  // button (instead of letting them click it and hit a 403) when off an allowlisted
  // network. See Employee/Dashboard.jsx for the twin implementation and
  // backend/utils/housekeeperNetworkGate.js for the server-side gate.
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

  useEffect(() => {
    // Only create virtual session for TODAY's incomplete record
    // AND only if server confirms there's an active session
    if (!missedClockOuts.length || activeSession) return;

    const todayIncomplete = missedClockOuts.find(r =>
      !r.has_clock_out &&
      !r.is_regularized &&
      !r.regularization_requested &&
      r.regularization_status !== 'rejected' &&
      r.is_today === true &&
      r.has_active_session === true  // ✅ Only if server confirms active session
    );

    if (todayIncomplete) {
      const virtualSession = {
        session_id: `virtual-${todayIncomplete.id}-${Date.now()}`,
        clock_in_time: todayIncomplete.clock_in_ist || todayIncomplete.clock_in,
        is_virtual: true,
        attendance_id: todayIncomplete.id,
        attendance_date: todayIncomplete.attendance_date
      };
      setActiveSession(virtualSession);
      saveSessionToStorage(virtualSession);
    }
  }, [missedClockOuts]);

  const handleManualClockOut = async () => {
    setShowExitWarning(false);
    await handleClockOut();
  };

  const handleOpenRegularizationModal = (record) => {
    if (record.clock_out || record.clock_out_ist) {
      setMessage({ type: 'info', text: `Attendance for ${record.attendance_date} already has a clock-out time.` });
      return;
    }
    if (record.is_regularized) {
      setMessage({ type: 'info', text: `Attendance for ${record.attendance_date} has already been regularized.` });
      return;
    }
    if (record.regularization_requested && record.regularization_status !== 'rejected') {
      setMessage({ type: 'warning', text: `Regularization already requested for ${record.attendance_date}. Please wait for approval.` });
      return;
    }

    setSelectedMissedRecord(record);
    const [year, month, day] = record.attendance_date.split('-');
    setRegularizationTime(`${year}-${month}-${day}T18:00`);
    const clockInRaw = record.clock_in_ist || record.clock_in || '';
    if (clockInRaw) {
      const minDT = clockInRaw.includes('T') ? clockInRaw.slice(0, 16) : clockInRaw.replace(' ', 'T').slice(0, 16);
      setRegularizationMinTime(minDT);
    } else {
      setRegularizationMinTime(`${year}-${month}-${day}T00:00`);
    }
    setRegularizationType('missing_clock_out');
    setRegularizationClockIn('');
    setRegularizationBreakDuration('');
    setRegularizationAttachment(null);
    setAttachmentError('');
    setShowRegularizationModal(true);
  };

  // General entry point — one "Regularize" button per attendance-history row, covering
  // all 11 request types (not just the missing-clock-out case above).
  const handleOpenGeneralRegularizationModal = (record) => {
    const pendingIds = new Set(
      myRegularizations.filter(r => r.status === 'pending').map(r => String(r.attendance_id))
    );
    if (record.id && pendingIds.has(String(record.id))) {
      setMessage({ type: 'warning', text: `A regularization request is already pending for ${record.attendance_date}.` });
      return;
    }
    if (record.is_regularized) {
      setMessage({ type: 'info', text: `Attendance for ${record.attendance_date} has already been regularized.` });
      return;
    }

    setSelectedMissedRecord(record);
    const [year, month, day] = record.attendance_date.split('-');

    const hasClockIn = !!(record.clock_in_ist || record.clock_in);
    const hasClockOut = !!(record.clock_out_ist || record.clock_out);
    if (!record.id) {
      setRegularizationType('wfh'); // no attendance row at all — only the no-punch types apply
    } else if (hasClockIn && !hasClockOut) {
      setRegularizationType('missing_clock_out');
    } else if (!hasClockIn) {
      setRegularizationType('missing_clock_in');
    } else {
      setRegularizationType('attendance_correction');
    }

    setRegularizationTime(hasClockOut ? '' : `${year}-${month}-${day}T18:00`);
    setRegularizationClockIn(hasClockIn ? '' : `${year}-${month}-${day}T09:00`);
    const clockInRaw = record.clock_in_ist || record.clock_in || '';
    if (clockInRaw) {
      const minDT = clockInRaw.includes('T') ? clockInRaw.slice(0, 16) : clockInRaw.replace(' ', 'T').slice(0, 16);
      setRegularizationMinTime(minDT);
    } else {
      setRegularizationMinTime(`${year}-${month}-${day}T00:00`);
    }
    setRegularizationReason('');
    setRegularizationBreakDuration('');
    setRegularizationAttachment(null);
    setAttachmentError('');
    setShowRegularizationModal(true);
  };

  const getLocationBadge = () => {
    // Reflects whether we actually have a live coordinate fix, rather than a hardcoded label.
    const enabled = !!location;
    return (
      <div
        className="d-inline-flex align-items-center gap-2 text-nowrap"
        style={{
          borderRadius: 999,
          border: `1px solid ${enabled ? 'rgba(22,163,74,.35)' : 'rgba(107,114,128,.3)'}`,
          background: enabled ? 'rgba(22,163,74,.08)' : 'rgba(107,114,128,.08)',
          color: enabled ? DA.primaryGreen : DA.secondary,
          fontWeight: 600, fontSize: 13, padding: '8px 16px',
        }}
      >
        <FaLocationArrow size={12} />
        Location Tracking {enabled ? 'Enabled' : 'Disabled'}
      </div>
    );
  };

  // Clock In/Clock Out (and the paired Break button) now live on the Dashboard page's
  // welcome banner instead of here — this page keeps only past-date missed-punch
  // regularization requests, which are a distinct action from today's live clock action.
  const renderClockButton = () => {
    const nowISTDateStr = nowIST().split(' ')[0];

    // Past-date pending regularization (not today, no active session) still belongs here.
    const eligibleRegularization = missedClockOuts.some(r =>
      r.can_regularize === true &&
      !r.is_regularized &&
      r.attendance_date !== nowISTDateStr &&
      (!r.regularization_requested || r.regularization_status === 'rejected')
    );

    if (eligibleRegularization) {
      const eligibleRecord = missedClockOuts.find(r =>
        r.can_regularize === true &&
        !r.is_regularized &&
        r.attendance_date !== nowISTDateStr &&
        (!r.regularization_requested || r.regularization_status === 'rejected')
      );
      return (
        <div className="text-center">
          <Button
            onClick={() => handleOpenRegularizationModal(eligibleRecord)}
            disabled={loading || submittingRequest}
            style={{ background: DA.warning, borderColor: DA.warning, borderRadius: 12, padding: '10px 22px', fontWeight: 700, color: '#fff' }}
          >
            {loading || submittingRequest ? (
              <><Spinner size="sm" animation="border" className="me-2" />Processing...</>
            ) : (
              <><FaRegClock className="me-2" />Request Regularization for {eligibleRecord?.attendance_date}</>
            )}
          </Button>
          <small className="text-muted d-block mt-2">
            {eligibleRecord?.total_hours_worked}h worked — Regularization required
          </small>
        </div>
      );
    }

    return (
      <div className="text-center">
        <div className="d-inline-flex align-items-center gap-2 justify-content-center" style={{ color: DA.secondary, fontWeight: 600, fontSize: 14 }}>
          <FaInfoCircle />
          Clock In / Clock Out has moved to the Dashboard
        </div>
        <small className="d-block mt-2 text-muted">
          Please use the Clock In / Clock Out buttons on your Dashboard page to mark attendance.
        </small>
      </div>
    );
  };
  // In Attendance.jsx - Update the initialization useEffect

  // Fetch date of birth (birthday highlight in the table below) once.
  useEffect(() => {
    if (!user?.employeeId) return;
    axios.get(API_ENDPOINTS.EMPLOYEE_PROFILE(user.employeeId))
      .then(res => { setEmployeeDob(res.data?.dob || null); })
      .catch(() => { setEmployeeDob(null); });
  }, [user?.employeeId]);

  const isBirthdayDate = (dateStr) => {
    if (!employeeDob || !dateStr) return false;
    const dob = new Date(employeeDob);
    const d = new Date(dateStr);
    return dob.getMonth() === d.getMonth() && dob.getDate() === d.getDate();
  };

  useEffect(() => {
    if (!user?.employeeId) return;

    const initializeSession = async () => {
      try {
        const response = await axios.get(API_ENDPOINTS.ATTENDANCE_TODAY(user.employeeId));
        const todayAttendance = response.data.attendance;
        const serverSession = response.data.active_session;

        console.log('🔄 Initializing - Today attendance:', todayAttendance);
        console.log('🔄 Server session:', serverSession);

        // ✅ CASE 1: No active server session
        if (!serverSession) {
          // Only clear session if no open attendance either
          const hasOpenAtt = todayAttendance?.clock_in && !todayAttendance?.clock_out;
          if (!hasOpenAtt) {
            setActiveSession(null);
            clearSessionFromStorage();
          }

          if (todayAttendance?.clock_out) {
            setHasClockedOutToday(true);
            setAttendance(todayAttendance);
          } else if (hasOpenAtt) {
            // Has clock_in but no active session = cross-midnight or data inconsistency
            // Keep showing Clock Out button
            setHasClockedOutToday(false);
            setAttendance(todayAttendance);
            const inferredSession = {
              session_id: todayAttendance.session_id || 'temp-' + Date.now(),
              clock_in_time: todayAttendance.clock_in_ist || todayAttendance.clock_in,
              is_virtual: false
            };
            setActiveSession(inferredSession);
            saveSessionToStorage(inferredSession);
          } else {
            setHasClockedOutToday(false);
            setAttendance(null);
          }
          await fetchMissedClockOuts();
          await fetchTodayAttendance();
          getCurrentLocation();
          return;
        }

        // ✅ CASE 2: Active server session exists (today or cross-midnight)
        setHasClockedOutToday(false);
        setActiveSession(serverSession);
        saveSessionToStorage(serverSession);

      } catch (error) {
        console.error('Error initializing:', error);
        setActiveSession(null);
        clearSessionFromStorage();
        setHasClockedOutToday(false);
      }

      await fetchTodayAttendance();
      await fetchMissedClockOuts();
      getCurrentLocation();
    };

    initializeSession();

    const timer = setInterval(() => setCurrentTime(getTrustedNow()), 1000);
    const handleBeforeUnload = (e) => {
      if (activeSession) {
        e.preventDefault();
        e.returnValue = 'You have an active session. Please clock out.';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearInterval(timer);
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [user]);

  useEffect(() => {
    if (user?.employeeId) fetchAttendanceHistory(0);
  }, [user?.employeeId]);

  useEffect(() => {
    if (user?.employeeId) fetchMyRegularizations();
  }, [user?.employeeId]);

  // Removed: auto-polling for attendance history (was causing excessive DB requests)

  // Removed: heartbeat polling (was sending requests every 30s)

  useEffect(() => {
    const handleRegularizationEvent = async () => {
      await fetchTodayAttendance();
      await fetchMissedClockOuts();
      setHistoryPage(0);
      await fetchAttendanceHistory(0);
      await fetchMyRegularizations();
      setActiveSession(null);
      clearSessionFromStorage();
      setHasClockedOutToday(false);
    };

    window.addEventListener('regularizationApproved', handleRegularizationEvent);
    return () => window.removeEventListener('regularizationApproved', handleRegularizationEvent);
  }, [user?.employeeId]);

  // Cumulative trend lines for the stat-card sparklines, derived from the already-fetched
  // history (oldest → newest) rather than fabricated data.
  const sortedHistoryForTrend = [...attendanceHistory].sort((a, b) => new Date(a.date) - new Date(b.date));
  const presentTrend = [];
  const absentTrend = [];
  const hoursTrend = [];
  const avgHoursTrend = [];
  {
    let cumPresent = 0, cumAbsent = 0, cumHours = 0;
    sortedHistoryForTrend.forEach((r, i) => {
      const hrs = parseFloat(r.total_hours) || 0;
      if (!r.isWeeklyOff) {
        if (hrs > 0) cumPresent++;
        else if (r.clock_in) cumAbsent++;
      }
      cumHours += hrs;
      presentTrend.push(cumPresent);
      absentTrend.push(cumAbsent);
      hoursTrend.push(Math.round(cumHours));
      avgHoursTrend.push(parseFloat((cumHours / (i + 1)).toFixed(1)));
    });
  }

  return (
    <div className="p-2 p-md-3 p-lg-4" style={{ backgroundColor: '#f8f9fc', minHeight: '100vh' }}>
      <div
        className="d-flex align-items-center justify-content-between mb-4 flex-wrap gap-3"
        style={{ background: '#fff', borderRadius: 16, padding: '18px 22px', boxShadow: '0 10px 35px rgba(16,24,40,.06)' }}
      >
        <div className="d-flex align-items-center gap-3">
          <div
            className="d-flex align-items-center justify-content-center"
            style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(22,163,74,.12)', color: DA.primaryGreen, flexShrink: 0 }}
          >
            <FaClock size={20} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, color: '#101828' }}>Attendance Management</div>
            <div style={{ fontSize: 13, color: DA.secondary }}>Track your time and attendance</div>
          </div>
        </div>
        <button
          className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1"
          style={{ borderRadius: 10, padding: '8px 16px', fontWeight: 600 }}
          onClick={() => navigate(-1)}
        >
          <FaArrowLeft size={12} /> Back
        </button>
      </div>

      {/* Regularization Requests Section */}
      {missedClockOuts.length > 0 && !activeSession && (
        <>
          {missedClockOuts.some(r => r.can_regularize === true && (!r.regularization_requested || r.regularization_status === 'rejected') && !r.is_regularized) && (
            <Card className="mb-4 border-warning bg-warning bg-opacity-10">
              <Card.Body className="p-3">
                <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-3">
                  <div>
                    <FaExclamationTriangle className="text-warning me-2" size={20} />
                    <strong>Regularization Available!</strong>
                    <div className="small text-muted mt-1">
                      You have completed your full shift on the following day(s). Please request regularization to update your attendance:
                    </div>
                    <div className="mt-2">
                      {missedClockOuts.filter(r => r.can_regularize === true && (!r.regularization_requested || r.regularization_status === 'rejected') && !r.is_regularized).map(record => (
                        <Badge
                          key={record.id}
                          bg="light"
                          text="dark"
                          className="me-2 mb-1 p-2"
                          style={{ cursor: 'pointer' }}
                          onClick={() => handleOpenRegularizationModal(record)}
                        >
                          <FaCalendarAlt className="me-1" size={10} />
                          {record.attendance_date}
                          <span className="ms-1 text-success">
                            ({record.total_hours_worked}h worked / {record.expected_hours}h required)
                          </span>
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <Button
                    variant="warning"
                    size="sm"
                    onClick={() => {
                      const firstEligible = missedClockOuts.find(r => r.can_regularize === true && (!r.regularization_requested || r.regularization_status === 'rejected') && !r.is_regularized);
                      if (firstEligible) handleOpenRegularizationModal(firstEligible);
                    }}
                  >
                    <FaRegClock className="me-2" />
                    Request Regularization
                  </Button>
                </div>
              </Card.Body>
            </Card>
          )}

          {missedClockOuts.some(r => r.regularization_requested && r.regularization_status === 'pending') && (
            <Card className="mb-4 border-info bg-info bg-opacity-10">
              <Card.Body className="p-3">
                <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-3">
                  <div>
                    <FaClock className="text-info me-2" size={20} />
                    <strong>Regularization Requests Pending</strong>
                    <div className="small text-muted mt-1">
                      Your regularization request(s) are pending admin approval:
                    </div>
                    <div className="mt-2">
                      {missedClockOuts.filter(r => r.regularization_requested && r.regularization_status === 'pending').map(record => (
                        <Badge
                          key={record.id}
                          bg="light"
                          text="dark"
                          className="me-2 mb-1 p-2"
                        >
                          <FaCalendarAlt className="me-1" size={10} />
                          {record.attendance_date}
                          <span className="ms-1 text-warning">(Pending Approval)</span>
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </Card.Body>
            </Card>
          )}

          {missedClockOuts.some(r => !r.can_regularize && !r.regularization_requested && !r.is_regularized && r.total_hours_worked > 0) && (
            <Card className="mb-4 border-secondary bg-light">
              <Card.Body className="p-3">
                <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-3">
                  <div>
                    <FaClock className="text-secondary me-2" size={20} />
                    <strong>Incomplete Work Days</strong>
                    <div className="small text-muted mt-1">
                      You need to complete {missedClockOuts[0]?.expected_hours || 9} hours before requesting regularization:
                    </div>
                    <div className="mt-2">
                      {missedClockOuts.filter(r => !r.can_regularize && !r.regularization_requested && !r.is_regularized && r.total_hours_worked > 0).map(record => (
                        <Badge
                          key={record.id}
                          bg="light"
                          text="dark"
                          className="me-2 mb-1 p-2"
                        >
                          <FaCalendarAlt className="me-1" size={10} />
                          {record.attendance_date}
                          <span className="ms-1 text-danger">
                            ({record.total_hours_worked}h / {record.expected_hours}h - Need {record.hours_needed}h more)
                          </span>
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </Card.Body>
            </Card>
          )}
        </>
      )}

      {/* Main Attendance Card */}
      <div style={{ ...DA_CARD_STYLE, marginBottom: 24 }} className="da-fade-in">
        <div className="p-3 p-md-4">
          <Row className="align-items-center g-3">
            <Col xs={12} md={3}>
              <div className="d-flex justify-content-center justify-content-md-start">
                {getLocationBadge()}
              </div>
              {geofenceInfo && (
                <small className="text-muted d-block text-center text-md-start mt-1">
                  <FaMapMarkerAlt className="me-1" size={10} />
                  Accuracy: ±{Math.round(location?.accuracy || 0)}m
                </small>
              )}
            </Col>
            <Col xs={6} md={2}>
              <div className="text-center">
                <small className="text-muted d-block">Current Time</small>
                <strong style={{ fontSize: 18 }}>{currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}</strong>
              </div>
            </Col>
            <Col xs={6} md={2}>
              <div className="text-center">
                <small className="text-muted d-block">Clock In</small>
                <strong style={{ fontSize: 18, color: attendance?.clock_in ? DA.primaryGreen : DA.secondary }}>
                  {attendance?.clock_in
                    ? (attendance.clock_in_display || formatTimeIST(attendance.clock_in_ist || attendance.clock_in))
                    : '--:--'}
                </strong>
                {attendance?.late_display && attendance.late_minutes > 0 && (
                  <small className="text-danger d-block" style={{ fontSize: '10px' }}>
                    <FaExclamationTriangle className="me-1" size={8} />
                    Late {attendance.late_display}
                  </small>
                )}
              </div>
            </Col>
            <Col xs={6} md={2}>
              <div className="text-center">
                <small className="text-muted d-block">Clock Out</small>
                <strong style={{ fontSize: 18, color: attendance?.clock_out ? DA.warning : DA.secondary }}>
                  {attendance?.clock_out
                    ? (attendance.clock_out_display || formatTimeIST(attendance.clock_out_ist || attendance.clock_out))
                    : '--:--'}
                </strong>
                {!attendance?.clock_out && attendance?.clock_in && (
                  <small className="text-danger d-block" style={{ fontSize: '10px' }}>Not Clocked Out</small>
                )}
              </div>
            </Col>
            <Col xs={6} md={1}>
              <div className="text-center">
                <small className="text-muted d-block">Working Hours</small>
                <strong style={{ fontSize: 18, color: '#2563eb' }}>
                  {attendance?.total_hours_display || '0h 0m'}
                </strong>
              </div>
            </Col>
            <Col xs={12} md={2}>
              <div className="d-flex justify-content-center justify-content-md-end">
                {renderClockButton()}
              </div>
            </Col>
          </Row>
          {geofenceInfo && !geofenceInfo.isInOffice && !activeSession && (
            <div className="mt-2 text-warning small text-center">
              <FaExclamationTriangle className="me-1" />
              You are {geofenceInfo.distance}m away from office. Need to be within {OFFICE_COORDS.radius}m to clock in.
            </div>
          )}
          {message.text && (
            <Alert variant={message.type} onClose={() => setMessage({ type: '', text: '' })} dismissible className="mt-2 mb-0 py-2 small">
              {message.text}
            </Alert>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <Row className="mb-4 g-3">
        {[
          { label: 'Present Days', value: monthlyStats.presentDays, icon: <FaCheckCircle size={16} />, color: DA.primaryGreen, bg: 'rgba(22,163,74,.12)', trend: presentTrend },
          { label: 'Absent Days', value: monthlyStats.absentDays, icon: <FaExclamationTriangle size={16} />, color: '#ef4444', bg: 'rgba(239,68,68,.12)', trend: absentTrend },
          { label: 'Total Hours', value: `${monthlyStats.totalHours}h`, icon: <FaClock size={16} />, color: '#7c3aed', bg: 'rgba(124,58,237,.12)', trend: hoursTrend },
          { label: 'Avg Hours/Day', value: `${monthlyStats.averageHours}h`, icon: <FaRegClock size={16} />, color: '#2563eb', bg: 'rgba(37,99,235,.12)', trend: avgHoursTrend },
        ].map((stat) => (
          <Col xs={6} md={3} key={stat.label}>
            <div style={{ ...DA_CARD_STYLE, height: '100%' }} className="da-fade-in">
              <div className="p-3">
                <div className="d-flex align-items-start justify-content-between">
                  <div
                    className="d-flex align-items-center justify-content-center"
                    style={{ width: 40, height: 40, borderRadius: '50%', background: stat.bg, color: stat.color }}
                  >
                    {stat.icon}
                  </div>
                  <Sparkline data={stat.trend} color={stat.color} />
                </div>
                <h4 className="mb-0 fw-bold mt-2" style={{ color: stat.color }}>{stat.value}</h4>
                <small className="text-muted d-block">{stat.label}</small>
                <small className="text-muted" style={{ fontSize: 11 }}>This Month</small>
              </div>
            </div>
          </Col>
        ))}
      </Row>

      <div className="text-muted text-center mb-4" style={{ fontSize: 12.5 }}>
        <FaInfoCircle className="me-1" />
        All times are in your local timezone (Asia/Kolkata)
      </div>

      {/* Attendance History */}
      <Row>
        <Col lg={12}>
          <div style={DA_CARD_STYLE} className="da-fade-in">
            <div style={DA_GRADIENT_BAR} />
            <div className="bg-white py-2 py-md-3 px-3">
              <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-2">
                <h6 className="mb-0 small d-flex align-items-center">
                  <FaHistory className="me-2 text-primary" />
                  Attendance Report - Last 30 Days
                </h6>
                <div className="d-flex flex-wrap gap-2">
                  {attendance?.clock_in ? (
                    attendance?.clock_out ? (
                      <Badge bg="success" className="px-3 py-2" style={{ fontSize: '0.85rem' }}>
                        <FaCheckCircle className="me-1" />
                        Today: {formatTimeIST(attendance.clock_in_ist || attendance.clock_in)} - {formatTimeIST(attendance.clock_out_ist || attendance.clock_out)}
                      </Badge>
                    ) : (
                      <Badge bg="warning" className="px-3 py-2 text-dark" style={{ fontSize: '0.85rem' }}>
                        <FaClock className="me-1" />
                        Today: Working since {formatTimeIST(attendance.clock_in_ist || attendance.clock_in)}
                        {attendance?.total_hours_display && (
                          <small className="ms-1 text-success">({attendance.total_hours_display})</small>
                        )}
                      </Badge>
                    )
                  ) : (
                    <Badge bg="secondary" className="px-3 py-2" style={{ fontSize: '0.85rem' }}>
                      <FaClock className="me-1" />
                      Today: Not Clocked In
                    </Badge>
                  )}
                  <Badge bg="info" className="px-3 py-2" style={{ fontSize: '0.85rem' }}>
                    <FaCalendarAlt className="me-1" size={12} />
                    {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </Badge>
                </div>
              </div>
            </div>
            <div className="p-2 p-md-3">
              <div className="mb-3 border-bottom">
                <Button variant={activeTab === 'daily' ? 'primary' : 'light'} size="sm" onClick={() => setActiveTab('daily')} className="me-2" style={{ borderBottom: activeTab === 'daily' ? '3px solid #0d6efd' : 'none', borderRadius: '4px 4px 0 0' }}>
                  Daily View
                </Button>
                <Button variant={activeTab === 'chart' ? 'primary' : 'light'} size="sm" onClick={() => setActiveTab('chart')} style={{ borderBottom: activeTab === 'chart' ? '3px solid #0d6efd' : 'none', borderRadius: '4px 4px 0 0' }}>
                  Chart View
                </Button>
              </div>

              {activeTab === 'daily' ? (
                <>
                  <div
                    className="table-responsive da-scroll"
                    style={{ maxHeight: 560, overflowY: 'auto' }}
                    ref={tableScrollRef}
                  >
                    <Table className="mb-0">
                      <thead className="sticky-top" style={{ top: 0, zIndex: 10 }}>
                        <tr>
                          <th style={{ ...DA_TH_STYLE, width: '13%' }}>Date</th>
                          <th style={{ ...DA_TH_STYLE, width: '8%' }} className="d-none d-sm-table-cell">Day</th>
                          <th style={{ ...DA_TH_STYLE, width: '16%' }}>Clock In</th>
                          <th style={{ ...DA_TH_STYLE, width: '15%' }}>Clock Out</th>
                          <th style={{ ...DA_TH_STYLE, width: '13%' }}>Hours</th>
                          <th style={{ ...DA_TH_STYLE, width: '25%' }}>Status</th>
                          {<th style={{ ...DA_TH_STYLE, width: '10%' }}>Action</th> }
                        </tr>
                      </thead>
                      <tbody>
                        {attendanceHistory.map((record, index) => {
                          const today = new Date().toISOString().split('T')[0];
                          const isToday = record.attendance_date === today;
                          const hasPendingRegularization = myRegularizations.some(
                            r => r.status === 'pending' && String(r.attendance_id) === String(record.id)
                          );
                          // A fully-present day (status "present" with 9+ worked hours) has
                          // nothing to regularize — hide the button rather than offer an action
                          // that wouldn't change anything.
                          const workedHours = parseFloat(record.total_hours) || 0;
                          const isFullyPresent = record.status === 'present' && workedHours >= 9;
                          const canRegularize = !record.isWeeklyOff && !isToday && !record.is_regularized && !isFullyPresent;
                          const isBirthday = isBirthdayDate(record.date);

                          return (
                            <tr
                              key={index}
                              className={`da-row da-row-enter ${record.isToday ? 'fw-bold' : ''}`}
                              style={{
                                borderBottom: `1px solid ${DA.border}`,
                                ...(isBirthday ? { background: 'linear-gradient(90deg, rgba(239,68,68,.35), rgba(250,204,21,.35))' } : {})
                              }}
                            >
                              <td className="small">
                                <div>
                                  <span className="fw-semibold">{formatShortDate(record.date)}</span>
                                  {isBirthday && (
                                    <Badge bg="warning" text="dark" className="ms-1" pill title="Your Birthday">
                                      <FaBirthdayCake size={9} className="me-1" />Birthday
                                    </Badge>
                                  )}
                                  {record.isToday && <Badge bg="primary" className="ms-1" pill>Today</Badge>}
                                  {record.is_regularized && <Badge bg="info" className="ms-1" pill>Reg</Badge>}
                                </div>
                              </td>
                              <td className="small d-none d-sm-table-cell">
                                <div>
                                  {record.dayName}
                                  {record.isWeeklyOff && <Badge bg="secondary" className="ms-1" pill>OFF</Badge>}
                                </div>
                              </td>
                              <td className="small">
                                {record.isWeeklyOff ? (
                                  <span style={{ color: DA.secondary }}>---</span>
                                ) : record.formatted_clock_in ? (
                                  <span className="text-nowrap" style={{ color: DA.primaryGreen, fontWeight: 600 }}>{record.formatted_clock_in}</span>
                                ) : record.clock_in ? (
                                  <span className="text-nowrap" style={{ color: DA.primaryGreen, fontWeight: 600 }}>{formatTimeIST(record.clock_in)}</span>
                                ) : (
                                  <span style={{ color: DA.secondary }}>---</span>
                                )}
                              </td>
                              <td className="small">
                                {record.isWeeklyOff ? (
                                  <span style={{ color: DA.secondary }}>---</span>
                                ) : record.formatted_clock_out ? (
                                  <span className="text-nowrap" style={{ color: DA.primaryGreen, fontWeight: 600 }}>{record.formatted_clock_out}</span>
                                ) : record.clock_out ? (
                                  <span className="text-nowrap" style={{ color: DA.primaryGreen, fontWeight: 600 }}>{formatTimeIST(record.clock_out)}</span>
                                ) : record.clock_in && isToday ? (
                                  <span style={{ color: DA.secondary }}>--</span>
                                ) : record.clock_in && !record.clock_out && !isToday ? (
                                  <span className="da-badge d-inline-flex align-items-center text-nowrap" style={{ ...STATUS_PILL.absent, borderRadius: 999, padding: '3px 10px', fontSize: 11, fontWeight: 600 }}>Missed</span>
                                ) : (
                                  <span style={{ color: DA.secondary }}>---</span>
                                )}
                              </td>
                              <td className="small fw-bold">
                                {record.isWeeklyOff ? (
                                  <span className="text-muted">-</span>
                                ) : record.total_hours_display ? (
                                  <span className="text-nowrap">
                                    {record.total_hours_display}
                                    {record.clock_in && !record.clock_out && !record.is_regularized && !record.isToday && (
                                      <span className="text-danger ms-1" style={{ fontSize: '10px' }}>(Missed)</span>
                                    )}
                                  </span>
                                ) : record.total_hours ? (
                                  <span className="text-nowrap">
                                    {record.total_hours.toFixed(1)}h
                                    {record.clock_in && !record.clock_out && !record.is_regularized && !record.isToday && (
                                      <span className="text-danger ms-1" style={{ fontSize: '10px' }}>(Missed)</span>
                                    )}
                                  </span>
                                ) : record.clock_in && !record.clock_out && isToday ? (
                                  // Real-time hours for today - FIXED
                                  <span className="text-nowrap text-info">
                                    {record.current_hours_display || calculateCurrentWorkingHours(record.clock_in)?.display || '0h 0m'}
                                  </span>
                                ) : (
                                  '-'
                                )}
                              </td>
                              <td className="small">
                                {getAttendanceStatusBadge(record)}
                              </td>
                              <td className="small">
                                {hasPendingRegularization ? (
                                  <Badge bg="warning" text="dark" pill>Pending</Badge>
                                ) : canRegularize ? (
                                  <Button
                                    variant="outline-primary"
                                    size="sm"
                                    style={{ fontSize: 11, padding: '2px 8px' }}
                                    onClick={() => handleOpenGeneralRegularizationModal(record)}
                                  >
                                    Regularize
                                  </Button>
                                ) : null}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </Table>
                  </div>
                  <div className="d-flex align-items-center justify-content-between mt-2">
                    <div className="text-muted small">
                      <FaInfoCircle className="me-1" size={10} />
                      Showing {attendanceHistory.length} days
                    </div>
                    <div className="d-flex align-items-center gap-2">
                      {loadingHistory && (
                        <Spinner animation="border" size="sm" variant="primary" />
                      )}
                      <Button
                        variant="outline-secondary"
                        size="sm"
                        disabled={historyPage === 0 || loadingHistory}
                        onClick={handlePreviousPage}
                      >
                        ← Previous 30 Days
                      </Button>
                      <Button
                        variant="outline-secondary"
                        size="sm"
                        disabled={loadingHistory}
                        onClick={handleNextPage}
                      >
                        Next 30 Days →
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ height: '300px' }}>
                    <Line data={chartData} options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (context) => `${context.raw} hours` } } },
                      scales: { y: { beginAtZero: true, max: 10, title: { display: true, text: 'Hours' }, ticks: { stepSize: 1, callback: (value) => value + 'h' } } }
                    }} />
                  </div>
                  <div className="mt-2 text-center text-muted small">
                    <span className="me-3"><span style={{ color: 'rgb(40, 167, 69)' }}>●</span> Full Day (8+ hrs)</span>
                    <span className="me-3"><span style={{ color: 'rgb(255, 193, 7)' }}>●</span> Half Day (5-8 hrs)</span>
                    <span><span style={{ color: 'rgb(220, 53, 69)' }}>●</span> Absent ({'<'}5 hrs)</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </Col>
      </Row>

      {/* Modals */}
      <Modal show={showRegularizationModal} onHide={() => { setShowRegularizationModal(false); setSelectedMissedRecord(null); setRegularizationTime(''); setRegularizationClockIn(''); setRegularizationReason(''); setRegularizationBreakDuration(''); setRegularizationAttachment(null); setAttachmentError(''); }} centered size="lg">
        <Modal.Header closeButton className="bg-warning">
          <Modal.Title className="h6"><FaRegClock className="me-2" /> Regularize Attendance - {selectedMissedRecord?.attendance_date}</Modal.Title>
        </Modal.Header>
        <Modal.Body className="p-4">
          {selectedMissedRecord && (
            <>
              <div className="row g-2 mb-3">
                <div className="col-6 col-md-3">
                  <div className="small text-muted">Attendance Date</div>
                  <div className="fw-semibold small"><FaCalendarAlt className="me-1 text-primary" size={11} /> {selectedMissedRecord.attendance_date}</div>
                </div>
                <div className="col-6 col-md-3">
                  <div className="small text-muted">Status</div>
                  <div className="fw-semibold small">{selectedMissedRecord.status || selectedMissedRecord.original_status || '—'}</div>
                </div>
                <div className="col-6 col-md-3">
                  <div className="small text-muted">Clock In</div>
                  <div className="fw-semibold small text-success">
                    {selectedMissedRecord.clock_in_display || formatTimeIST(selectedMissedRecord.clock_in_ist || selectedMissedRecord.clock_in) || '—'}
                  </div>
                </div>
                <div className="col-6 col-md-3">
                  <div className="small text-muted">Clock Out</div>
                  <div className="fw-semibold small text-success">
                    {selectedMissedRecord.clock_out_display || formatTimeIST(selectedMissedRecord.clock_out_ist || selectedMissedRecord.clock_out) || '—'}
                  </div>
                </div>
                <div className="col-6 col-md-3">
                  <div className="small text-muted">Working Hours</div>
                  <div className="fw-semibold small">{selectedMissedRecord.total_hours_display || '—'}</div>
                </div>
              </div>

              <div className="mb-3">
                <label className="form-label fw-semibold">Request Type *</label>
                <select className="form-select" value={regularizationType} onChange={(e) => setRegularizationType(e.target.value)}>
                  {REGULARIZATION_TYPE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </div>

              {REQUEST_TYPES_NEEDING_CLOCK_IN.includes(regularizationType) && (
                <div className="mb-3">
                  <label className="form-label fw-semibold">
                    Requested Clock In {regularizationType === 'missing_clock_in' ? '*' : '(optional)'}
                  </label>
                  <input type="datetime-local" className="form-control" value={regularizationClockIn} onChange={(e) => setRegularizationClockIn(e.target.value)} />
                </div>
              )}

              {REQUEST_TYPES_NEEDING_CLOCK_OUT.includes(regularizationType) && (
                <div className="mb-3">
                  <label className="form-label fw-semibold">
                    Requested Clock Out {regularizationType === 'missing_clock_out' ? '*' : '(optional)'}
                  </label>
                  <input type="datetime-local" className="form-control" value={regularizationTime} min={regularizationMinTime} onChange={(e) => setRegularizationTime(e.target.value)} />
                </div>
              )}

              {regularizationType === 'break_correction' && (
                <div className="mb-3">
                  <label className="form-label fw-semibold">Requested Break Duration (minutes) *</label>
                  <input type="number" min="1" className="form-control" value={regularizationBreakDuration} onChange={(e) => setRegularizationBreakDuration(e.target.value)} />
                </div>
              )}

              <div className="mb-3">
                <label className="form-label fw-semibold">Reason * <span className="text-muted fw-normal">(minimum 20 characters)</span></label>
                <textarea
                  className="form-control"
                  rows="3"
                  placeholder="Explain why this attendance needs to be regularized…"
                  value={regularizationReason}
                  onChange={(e) => setRegularizationReason(e.target.value)}
                />
                <small className={regularizationReason.trim().length < 20 ? 'text-danger' : 'text-success'}>
                  {regularizationReason.trim().length}/20 characters minimum
                </small>
              </div>

              <div className="mb-3">
                <label className="form-label fw-semibold">Attachment <span className="text-muted fw-normal">(optional, image or PDF, max 4 MB)</span></label>
                <input type="file" className="form-control" accept=".jpg,.jpeg,.png,.pdf,.doc,.docx" onChange={handleAttachmentChange} />
                {attachmentError && <small className="text-danger d-block mt-1">{attachmentError}</small>}
                {regularizationAttachment && !attachmentError && <small className="text-success d-block mt-1">{regularizationAttachment.name}</small>}
              </div>

              <Alert variant="info" className="small mb-0"><FaInfoCircle className="me-2" /><strong>Note:</strong> Your request will be reviewed by your reporting manager. Attendance stays unchanged until it's approved.</Alert>
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" size="sm" onClick={() => { setShowRegularizationModal(false); setSelectedMissedRecord(null); }}>Cancel</Button>
          <Button variant="warning" size="sm" onClick={handleRegularizationRequest} disabled={submittingRequest || regularizationReason.trim().length < 20}>{submittingRequest ? (<><Spinner size="sm" animation="border" className="me-2" /> Submitting...</>) : (<><FaRegClock className="me-2" /> Submit Request</>)}</Button>
        </Modal.Footer>
      </Modal>

      <Modal show={showSuccessModal} onHide={() => setShowSuccessModal(false)} centered>
        <Modal.Header closeButton className="bg-success text-white"><Modal.Title className="h6">Request Submitted</Modal.Title></Modal.Header>
        <Modal.Body className="p-4 text-center"><FaCheckCircle className="text-success mb-3" size={50} /><p>{successMessage}</p><Button variant="success" size="sm" onClick={() => setShowSuccessModal(false)}>Close</Button></Modal.Body>
      </Modal>

      <Modal show={showExitWarning} onHide={() => setShowExitWarning(false)} centered>
        <Modal.Header closeButton className="bg-warning"><Modal.Title className="h6">⚠️ Active Session Detected</Modal.Title></Modal.Header>
        <Modal.Body className="p-3"><p className="small">You have an active session. Would you like to clock out before leaving?</p><p className="text-muted small">If you don't clock out, your attendance will not be recorded properly.</p></Modal.Body>
        <Modal.Footer className="py-2"><Button variant="secondary" size="sm" onClick={() => setShowExitWarning(false)}>Cancel</Button><Button variant="warning" size="sm" onClick={handleManualClockOut}><FaSignOutAlt className="me-2" /> Clock Out Now</Button></Modal.Footer>
      </Modal>

      <Modal show={showPreviousDayClockOut.show} onHide={() => setShowPreviousDayClockOut({ show: false, attendance_id: null, attendance_date: null, clock_in_time: null })} centered>
        <Modal.Header closeButton className="bg-warning">
          <Modal.Title className="h6">⚠️ Incomplete Attendance Detected</Modal.Title>
        </Modal.Header>
        <Modal.Body className="p-4">
          <p>You have an incomplete attendance record from <strong>{showPreviousDayClockOut.attendance_date}</strong>.</p>
          <p className="text-muted small">Clock In Time: {showPreviousDayClockOut.clock_in_time ? formatTimeIST(showPreviousDayClockOut.clock_in_time) : 'Unknown'}</p>
          <p>Would you like to clock out for that day now?</p>
          <Alert variant="warning" className="small">
            <FaExclamationTriangle className="me-2" />
            If you don't clock out, your attendance for {showPreviousDayClockOut.attendance_date} will remain incomplete.
          </Alert>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" size="sm" onClick={() => setShowPreviousDayClockOut({ show: false, attendance_id: null, attendance_date: null, clock_in_time: null })}>
            Cancel
          </Button>
          <Button variant="warning" size="sm" onClick={handlePreviousDayClockOut}>
            <FaClock className="me-2" /> Clock Out for {showPreviousDayClockOut.attendance_date}
          </Button>
        </Modal.Footer>
      </Modal>

      <style>{ATTENDANCE_TABLE_CSS}</style>
    </div>
  );
};

export default Attendance;