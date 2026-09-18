// src/components/Employee/TeamAttendanceReport.jsx
import React, { useState, useEffect, useRef } from 'react';
import {
    Card, Table, Badge, Form, Row, Col,
    Button, Spinner, Alert, ButtonGroup, InputGroup
} from 'react-bootstrap';
import {
    FaCalendarAlt,
    FaFileExcel,
    FaArrowLeft,
    FaArrowRight,
    FaCheckCircle,
    FaClock,
    FaExclamationTriangle,
    FaSearch,
    FaEye,
    FaEyeSlash,
    FaEllipsisV,
    FaUserTie,
    FaSun,
    FaInfoCircle,
    FaSyncAlt,
    FaDownload,
    FaSignOutAlt
} from 'react-icons/fa';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import {
    DA, STATUS_PILL, LATE_PILL_ON_TIME, LATE_PILL_LATE, DA_TH_STYLE,
    DA_CARD_STYLE, DA_GRADIENT_BAR, ATTENDANCE_TABLE_CSS,
} from '../Common/attendanceTheme';
import Avatar from '../Common/Avatar';
import ApplyEarlyLogoutModal from '../Common/ApplyEarlyLogoutModal';

const TeamAttendanceReport = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [activeView, setActiveView] = useState('daily');
    const [teamMembers, setTeamMembers] = useState([]);
    const [attendanceData, setAttendanceData] = useState([]);
    const [employeeSummary, setEmployeeSummary] = useState([]);
    const [dailyStats, setDailyStats] = useState(null);
    const [teamSummary, setTeamSummary] = useState(null);
    const [dateRange, setDateRange] = useState({ start: '', end: '' });
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [selectedEmployee, setSelectedEmployee] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [showDetails, setShowDetails] = useState({});
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [liveNow, setLiveNow] = useState(Date.now());
    const [showEarlyLogout, setShowEarlyLogout] = useState(false);

    // Tick every 30s so "Hours" for currently-working team members updates without a manual refresh
    useEffect(() => {
        const timer = setInterval(() => setLiveNow(Date.now()), 30000);
        return () => clearInterval(timer);
    }, []);

    // Daily table: infinite-scroll pagination (accumulates — rows never get replaced/reset,
    // scrolling to the bottom just appends the next chunk in place, same pattern as the
    // Admin "Daily Attendance" table).
    const [dailyLoadCount, setDailyLoadCount] = useState(25);
    const [dailyLoadingMore, setDailyLoadingMore] = useState(false);
    const dailyTableScrollRef = useRef(null);
    const dailyAutoAdvanceLockRef = useRef(false);
    const DAILY_CHUNK_SIZE = 25;

    const months = [
        { value: 1, label: 'January', short: 'Jan' },
        { value: 2, label: 'February', short: 'Feb' },
        { value: 3, label: 'March', short: 'Mar' },
        { value: 4, label: 'April', short: 'Apr' },
        { value: 5, label: 'May', short: 'May' },
        { value: 6, label: 'June', short: 'Jun' },
        { value: 7, label: 'July', short: 'Jul' },
        { value: 8, label: 'August', short: 'Aug' },
        { value: 9, label: 'September', short: 'Sep' },
        { value: 10, label: 'October', short: 'Oct' },
        { value: 11, label: 'November', short: 'Nov' },
        { value: 12, label: 'December', short: 'Dec' }
    ];

    const years = [];
    for (let i = 2020; i <= new Date().getFullYear() + 1; i++) {
        years.push(i);
    }

    const getSalaryCycleDates = (month, year) => {
        const cycleStart = new Date(year, month - 1, 26);
        let cycleEnd;
        if (month === 12) {
            cycleEnd = new Date(year + 1, 0, 25);
        } else {
            cycleEnd = new Date(year, month, 25);
        }
        return {
            start: cycleStart.toISOString().split('T')[0],
            end: cycleEnd.toISOString().split('T')[0]
        };
    };

    const fetchTeamAttendance = async () => {
        try {
            setLoading(true);
            setError('');

            const cycleDates = getSalaryCycleDates(selectedMonth, selectedYear);
            let url = `${API_ENDPOINTS.ATTENDANCE}/team-report?view_type=${activeView}`;

            if (activeView === 'daily') {
                url += `&start=${selectedDate}&end=${selectedDate}`;
            } else {
                url += `&start=${cycleDates.start}&end=${cycleDates.end}`;
                setDateRange(cycleDates);
            }

            if (selectedEmployee !== 'all') {
                url += `&employee_id=${selectedEmployee}`;
            }

            const response = await axios.get(url);

            if (response.data.success) {
                setTeamMembers(response.data.team_members || []);
                setAttendanceData(response.data.attendance || []);
                setEmployeeSummary(response.data.employee_summary || []);

                if (response.data.daily_stats) {
                    setDailyStats(response.data.daily_stats);
                } else if (response.data.summary) {
                    const summary = response.data.summary;
                    setDailyStats({
                        total_employees: summary.total_team_members || teamMembers.length,
                        present: summary.total_present_today || 0,
                        absent: summary.total_absent_today || 0,
                        on_leave: summary.total_on_leave_today || 0,
                        half_day: summary.total_half_day_today || 0,
                        late_count: summary.total_late_today || 0,
                        working: summary.total_working_today || 0,
                        present_count: summary.total_present_today || 0
                    });
                }

                setTeamSummary(response.data.summary);

                if (activeView === 'monthly') {
                    setDateRange(response.data.date_range);
                }
            }
        } catch (error) {
            console.error('Error fetching team attendance:', error);
            setError(error.response?.data?.message || 'Failed to fetch attendance data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTeamAttendance();
    }, [activeView, selectedDate, selectedMonth, selectedYear, selectedEmployee]);

    const refreshData = async () => {
        setRefreshing(true);
        await fetchTeamAttendance();
        setRefreshing(false);
        setMessage('Data refreshed successfully!');
        setTimeout(() => setMessage(''), 3000);
    };

    const handlePreviousMonth = () => {
        if (selectedMonth === 1) {
            setSelectedMonth(12);
            setSelectedYear(selectedYear - 1);
        } else {
            setSelectedMonth(selectedMonth - 1);
        }
    };

    const handleNextMonth = () => {
        if (selectedMonth === 12) {
            setSelectedMonth(1);
            setSelectedYear(selectedYear + 1);
        } else {
            setSelectedMonth(selectedMonth + 1);
        }
    };

    const goToCurrentMonth = () => {
        const today = new Date();
        setSelectedMonth(today.getMonth() + 1);
        setSelectedYear(today.getFullYear());
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    };

    const formatTime = (datetime) => {
        if (!datetime) return '--:--';
        return new Date(datetime).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const formatLateDisplay = (lateMinutes) => {
        if (!lateMinutes || lateMinutes <= 0) return null;
        const totalSeconds = Math.round(lateMinutes * 60);
        const hours = Math.floor(totalSeconds / 3600);
        const remainingSeconds = totalSeconds % 3600;
        const minutes = Math.floor(remainingSeconds / 60);
        const seconds = remainingSeconds % 60;
        const parts = [];
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0) parts.push(`${minutes}m`);
        if (seconds > 0 || (hours === 0 && minutes === 0)) parts.push(`${seconds}s`);
        return parts.join(' ');
    };

    const exportToExcel = () => {
        try {
            const exportData = attendanceData.map(record => ({
                'Date': formatDate(record.attendance_date),
                'Employee Name': record.employee_name,
                'Employee ID': record.employee_id,
                'Department': record.department,
                'Clock In': formatTime(record.clock_in),
                'Clock Out': formatTime(record.clock_out),
                'Total Hours': record.total_hours,
                'Status': record.status === 'present' ? (record.present_reason ? `Present - ${record.present_reason}` : 'Present') :
                    record.status === 'half_day' ? 'Half Day' :
                        record.status === 'on_leave' ? 'On Leave' :
                            record.status === 'working' ? 'Working' :
                                record.status === 'weekend' ? 'Weekend Off' : 'Absent',
                'Late': record.is_late ? formatLateDisplay(record.late_minutes) || 'Yes' : 'No',
                'Overtime Hours': record.overtime_hours || 0
            }));

            const ws = XLSX.utils.json_to_sheet(exportData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Team Attendance');

            const fileName = activeView === 'daily'
                ? `Team_Attendance_${selectedDate}.xlsx`
                : `Team_Attendance_${months.find(m => m.value === selectedMonth)?.label}_${selectedYear}.xlsx`;

            XLSX.writeFile(wb, fileName);
            setMessage('Report exported successfully!');
            setTimeout(() => setMessage(''), 3000);
        } catch (error) {
            console.error('Export error:', error);
            setError('Failed to export data');
        }
    };

    const filteredAttendance = attendanceData.filter(record => {
        if (!searchTerm) return true;
        const term = searchTerm.toLowerCase();
        return record.employee_name.toLowerCase().includes(term) ||
            record.employee_id.toLowerCase().includes(term) ||
            record.department?.toLowerCase().includes(term);
    });

    // Reset the infinite-scroll window whenever the underlying filtered set changes
    useEffect(() => {
        setDailyLoadCount(DAILY_CHUNK_SIZE);
        const el = dailyTableScrollRef.current;
        if (el) el.scrollTop = 0;
    }, [searchTerm, selectedDate, selectedEmployee, activeView]);

    const visibleAttendance = filteredAttendance.slice(0, dailyLoadCount);
    const dailyHasMore = visibleAttendance.length < filteredAttendance.length;

    // Eligible for "Apply Early Logout": clocked in that day (a true absentee never shows up
    // here) and not already Present (nothing to override).
    const earlyLogoutCandidates = activeView === 'daily'
        ? attendanceData
            .filter(record => record.clock_in && record.status !== 'present')
            .map(record => ({
                employee_id: record.employee_id,
                name: record.employee_name,
                status: record.status,
                clock_in: formatTime(record.clock_in),
            }))
        : [];

    const handleDailyTableScroll = (e) => {
        const el = e.target;
        const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
        if (nearBottom && dailyHasMore && !dailyAutoAdvanceLockRef.current) {
            dailyAutoAdvanceLockRef.current = true;
            setDailyLoadingMore(true);
            setTimeout(() => {
                setDailyLoadCount(c => c + DAILY_CHUNK_SIZE);
                setDailyLoadingMore(false);
                setTimeout(() => { dailyAutoAdvanceLockRef.current = false; }, 400);
            }, 300);
        }
    };

    const uniqueDates = [...new Set(attendanceData.map(a => a.attendance_date))].sort();

    const getCalendarData = () => {
        const calendarMap = {};
        attendanceData.forEach(record => {
            if (!calendarMap[record.employee_id]) {
                calendarMap[record.employee_id] = {
                    employee_name: record.employee_name,
                    employee_id: record.employee_id,
                    department: record.department,
                    records: {}
                };
            }
            calendarMap[record.employee_id].records[record.attendance_date] = record;
        });
        return Object.values(calendarMap);
    };

    // Add this helper function at the top of your TeamAttendanceReport.jsx
    const formatDecimalHoursToHMS = (decimalHours) => {
        if (!decimalHours || decimalHours <= 0) return '-';

        const totalMinutes = Math.round(decimalHours * 60);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;

        if (hours === 0) return `${minutes}m`;
        if (minutes === 0) return `${hours}h`;
        return `${hours}h ${minutes}m`;
    };

    // clock_in/clock_in_ist from the backend is a naive "YYYY-MM-DD HH:MM:SS" IST wall-clock
    // string with no timezone marker — parse it as IST explicitly rather than letting the
    // browser's Date constructor guess based on local timezone.
    const istStringToUTCMs = (val) => {
        if (!val) return null;
        const s = String(val).trim().replace('T', ' ').substring(0, 19);
        const [datePart, timePart] = s.split(' ');
        if (!datePart || !timePart) return null;
        const [y, mo, d] = datePart.split('-').map(Number);
        const [h, mi, sec = 0] = timePart.split(':').map(Number);
        if ([y, mo, d, h, mi].some(isNaN)) return null;
        const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
        return Date.UTC(y, mo - 1, d, h, mi, sec) - IST_OFFSET_MS;
    };

    // For a team member who is still clocked in (status 'working', no clock_out yet), the
    // backend can't report total_hours because it only computes that once clock_out is set.
    // Compute it live client-side instead, ticked by liveNow so it keeps advancing on screen.
    const getLiveHoursDisplay = (record) => {
        if (record.status !== 'working' || !record.clock_in) return null;
        const clockInMs = istStringToUTCMs(record.clock_in);
        if (clockInMs == null) return null;
        const diffMs = Math.max(0, liveNow - clockInMs);
        const totalMinutes = Math.floor(diffMs / 60000);
        return formatDecimalHoursToHMS(totalMinutes / 60);
    };

    // Today's Stats Card Component - Matching main website design
    const TodayStatsCard = () => {
        const total = teamMembers.length;

        let present = 0, absent = 0, onLeave = 0, halfDay = 0, late = 0, working = 0;

        if (dailyStats) {
            present = dailyStats.present || 0;
            absent = dailyStats.absent || 0;
            onLeave = dailyStats.on_leave || 0;
            halfDay = dailyStats.half_day || 0;
            late = dailyStats.late_count || 0;
            working = dailyStats.working || 0;
        } else {
            const todayStr = selectedDate;
            const todayRecords = attendanceData.filter(r => r.attendance_date === todayStr);
            present = todayRecords.filter(r => r.status === 'present').length;
            absent = todayRecords.filter(r => r.status === 'absent').length;
            onLeave = todayRecords.filter(r => r.status === 'on_leave').length;
            halfDay = todayRecords.filter(r => r.status === 'half_day').length;
            late = todayRecords.filter(r => r.is_late).length;
            working = todayRecords.filter(r => r.status === 'working').length;
        }

        const attendanceRate = total > 0 ? ((present + halfDay) / total * 100).toFixed(1) : 0;

        if (activeView !== 'daily') return null;

        if (total === 0 && present === 0 && absent === 0 && onLeave === 0 && halfDay === 0 && late === 0) {
            return (
                <div className="text-center py-4 mb-4" style={{ background: '#fff', borderRadius: 18, border: `1px solid ${DA.border}` }}>
                    <FaInfoCircle className="mb-2" size={24} style={{ color: DA.secondary, opacity: 0.5 }} />
                    <p className="mb-0" style={{ color: DA.secondary }}>No attendance data available for {formatDate(selectedDate)}</p>
                </div>
            );
        }

        const pills = [
            { label: 'Present',  value: present + halfDay, bg: 'rgba(22,163,74,.1)',  color: '#16a34a', icon: '🟢' },
            { label: 'Absent',   value: absent,             bg: 'rgba(239,68,68,.1)',  color: '#ef4444', icon: '🔴' },
            { label: 'Half Day', value: halfDay,             bg: 'rgba(245,158,11,.12)', color: '#d97706', icon: '🟠' },
            { label: 'On Leave', value: onLeave,             bg: 'rgba(139,92,246,.1)', color: '#7c3aed', icon: '🟣' },
            { label: 'Late',     value: late,                bg: 'rgba(245,158,11,.12)', color: '#d97706', icon: '⚠️' },
            { label: 'Working',  value: working,             bg: 'rgba(22,163,74,.1)',  color: '#16a34a', icon: '●' },
        ];

        return (
            <div className="d-flex flex-column flex-lg-row justify-content-between align-items-start align-items-lg-center mb-4 gap-3">
                <div>
                    <h4 className="mb-1 fw-bold d-flex align-items-center" style={{ color: DA.text }}>
                        <span className="me-2">📅</span> Team Attendance — {formatDate(selectedDate)}
                    </h4>
                    <div style={{ color: DA.secondary, fontSize: 14 }}>
                        {total} team member{total !== 1 ? 's' : ''} · Attendance rate {attendanceRate}%
                    </div>
                </div>
                <div className="d-flex flex-wrap gap-2">
                    {pills.map(p => (
                        <div
                            key={p.label}
                            className="d-flex align-items-center gap-2"
                            style={{ background: p.bg, color: p.color, borderRadius: 999, padding: '10px 18px', fontWeight: 600, fontSize: 13 }}
                        >
                            <span>{p.icon}</span>
                            <span>{p.label}</span>
                            <span style={{ fontWeight: 700 }}>{p.value}</span>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    if (loading) {
        return (
            <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '400px' }}>
                <Spinner animation="border" variant="primary" />
            </div>
        );
    }

    return (
        <div className="p-2 p-md-3 p-lg-4" style={{ backgroundColor: '#f8f9fc', minHeight: '100vh' }}>
            {/* Header */}
            <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center mb-4 gap-3">
                <div>
                    <h5 className="mb-1 d-flex align-items-center">
                        <FaUserTie className="me-2 text-primary" />
                        Team Attendance Report
                    </h5>
                    <p className="text-muted mb-0 small">
                        Track attendance of your team members with daily and monthly views
                    </p>
                </div>
                <div className="d-flex gap-2">
                    <Button variant="outline-primary" size="sm" onClick={refreshData} disabled={refreshing}>
                        <FaSyncAlt className={`me-1 ${refreshing ? 'fa-spin' : ''}`} size={12} />
                        Refresh
                    </Button>
                    <Button variant="success" size="sm" onClick={exportToExcel}>
                        <FaDownload className="me-1" size={12} /> Export
                    </Button>
                    {activeView === 'daily' && (
                        <Button variant="warning" size="sm" onClick={() => setShowEarlyLogout(true)}>
                            <FaSignOutAlt className="me-1" size={12} /> Apply Early Logout
                        </Button>
                    )}
                    <button
                        className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1"
                        onClick={() => navigate(-1)}
                    >
                        <FaArrowLeft size={12} /> Back
                    </button>
                </div>
            </div>

            {message && <Alert variant="success" className="mb-3 py-2" dismissible onClose={() => setMessage('')}>{message}</Alert>}
            {error && <Alert variant="danger" className="mb-3 py-2" dismissible onClose={() => setError('')}>{error}</Alert>}

            {/* View Toggle */}
            <div className="mb-3 border-bottom pb-2">
                <ButtonGroup size="sm">
                    <Button
                        variant={activeView === 'daily' ? 'primary' : 'light'}
                        onClick={() => setActiveView('daily')}
                    >
                        <FaSun className="me-1" size={12} /> Daily View
                    </Button>
                    <Button
                        variant={activeView === 'monthly' ? 'primary' : 'light'}
                        onClick={() => setActiveView('monthly')}
                    >
                        <FaCalendarAlt className="me-1" size={12} /> Monthly Calendar
                    </Button>
                </ButtonGroup>
            </div>

            {/* Today's Stats Card */}
            <TodayStatsCard />

            {/* Filters */}
            <Card className="border-0 shadow-sm mb-3">
                <Card.Body className="p-3">
                    <Row className="g-2 align-items-end">
                        {activeView === 'daily' ? (
                            <Col xs={12} md={4}>
                                <Form.Label className="small text-muted mb-1">Select Date</Form.Label>
                                <Form.Control
                                    type="date"
                                    value={selectedDate}
                                    onChange={(e) => setSelectedDate(e.target.value)}
                                    size="sm"
                                />
                            </Col>
                        ) : (
                            <>
                                <Col xs={6} md={3}>
                                    <Form.Label className="small text-muted mb-1">Month</Form.Label>
                                    <div className="d-flex gap-1">
                                        <Button variant="outline-secondary" size="sm" onClick={handlePreviousMonth}>
                                            <FaArrowLeft size={10} />
                                        </Button>
                                        <Form.Select
                                            size="sm"
                                            value={selectedMonth}
                                            onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                                            className="flex-grow-1"
                                        >
                                            {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                                        </Form.Select>
                                        <Button variant="outline-secondary" size="sm" onClick={handleNextMonth}>
                                            <FaArrowRight size={10} />
                                        </Button>
                                    </div>
                                </Col>
                                <Col xs={6} md={2}>
                                    <Form.Label className="small text-muted mb-1">Year</Form.Label>
                                    <Form.Select size="sm" value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))}>
                                        {years.map(y => <option key={y} value={y}>{y}</option>)}
                                    </Form.Select>
                                </Col>
                                <Col xs={12} md={2}>
                                    <Button variant="outline-primary" size="sm" onClick={goToCurrentMonth} className="w-100">
                                        Current Month
                                    </Button>
                                </Col>
                            </>
                        )}
                        <Col xs={12} md={activeView === 'daily' ? 5 : 3}>
                            <Form.Label className="small text-muted mb-1">Employee</Form.Label>
                            <Form.Select size="sm" value={selectedEmployee} onChange={(e) => setSelectedEmployee(e.target.value)}>
                                <option value="all">All Team Members ({teamMembers.length})</option>
                                {teamMembers.map(emp => (
                                    <option key={emp.employee_id} value={emp.employee_id}>
                                        {emp.first_name} {emp.last_name} ({emp.employee_id})
                                    </option>
                                ))}
                            </Form.Select>
                        </Col>
                        <Col xs={12} md={activeView === 'daily' ? 3 : 2}>
                            <Form.Label className="small text-muted mb-1">Search</Form.Label>
                            <InputGroup size="sm">
                                <InputGroup.Text><FaSearch size={10} /></InputGroup.Text>
                                <Form.Control
                                    placeholder="Name, ID..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </InputGroup>
                        </Col>
                    </Row>
                    {dateRange.start && dateRange.end && activeView === 'monthly' && (
                        <div className="mt-2 text-muted small">
                            <FaInfoCircle className="me-1" size={10} />
                            Salary Cycle: {formatDate(dateRange.start)} - {formatDate(dateRange.end)}
                        </div>
                    )}
                </Card.Body>
            </Card>

            {/* Main Content */}
            {activeView === 'daily' ? (
                <div style={DA_CARD_STYLE} className="da-fade-in">
                    <div style={DA_GRADIENT_BAR} />
                    <div
                        ref={dailyTableScrollRef}
                        className="table-responsive da-scroll"
                        style={{ maxHeight: 560, overflow: 'auto' }}
                        onScroll={handleDailyTableScroll}
                    >
                        <Table className="mb-0">
                            <thead className="sticky-top" style={{ top: 0, zIndex: 10 }}>
                                <tr>
                                    <th style={{ ...DA_TH_STYLE, textAlign: 'center', width: 60 }}>Sr No</th>
                                    <th style={DA_TH_STYLE}>Employee</th>
                                    <th style={DA_TH_STYLE} className="d-none d-md-table-cell">Department</th>
                                    <th style={DA_TH_STYLE}>Clock In</th>
                                    <th style={DA_TH_STYLE}>Late</th>
                                    <th style={DA_TH_STYLE} className="d-none d-sm-table-cell">Clock Out</th>
                                    <th style={DA_TH_STYLE} className="d-none d-lg-table-cell">Hours</th>
                                    <th style={DA_TH_STYLE}>Status</th>
                                    <th style={{ ...DA_TH_STYLE, textAlign: 'center' }}>Details</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibleAttendance.length > 0 ? (
                                    visibleAttendance.map((record, index) => {
                                        const statusKey = record.status || 'absent';
                                        const pillStyle = STATUS_PILL[statusKey] || STATUS_PILL.absent;
                                        const statusLabel = statusKey === 'present'
                                            ? (record.present_reason ? `Present — ${record.present_reason}` : 'Present')
                                            : statusKey === 'working' ? 'Working'
                                            : statusKey === 'half_day' ? 'Half Day'
                                            : statusKey === 'on_leave' ? 'On Leave'
                                            : statusKey === 'weekend' ? 'Week Off'
                                            // Auto-closed by the 15-hour missing-clockout rule — only ever written at
                                            // exactly clock_in+15h, never less.
                                            : statusKey === 'missing' ? 'Missed CO'
                                            : 'Absent';
                                        return (
                                        <React.Fragment key={record.id || index}>
                                                <tr className="da-row da-row-enter" style={{ height: 82, borderBottom: '1px solid #f1f5f9' }}>
                                                    <td className="small text-center" style={{ color: DA.secondary }}>{index + 1}</td>
                                                    <td>
                                                        <div className="d-flex align-items-center gap-2">
                                                            <Avatar
                                                                photo={record.profile_image}
                                                                id={record.employee_id}
                                                                firstName={(record.employee_name || '').split(' ')[0]}
                                                                lastName={(record.employee_name || '').split(' ')[1]}
                                                                size={36}
                                                            />
                                                            <div className="min-w-0">
                                                                <div className="text-truncate" style={{ maxWidth: 140, fontSize: 15, fontWeight: 600, color: DA.text }} title={record.employee_name}>
                                                                    {record.employee_name}
                                                                </div>
                                                                <div className="text-truncate" style={{ maxWidth: 140, fontSize: 12, color: '#98A2B3' }}>
                                                                    {record.employee_id}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="small d-none d-md-table-cell" style={{ color: DA.text }}>{record.department || '-'}</td>
                                                    <td className="small text-nowrap" style={{ color: record.clock_in ? DA.primaryGreen : DA.secondary, fontWeight: 600 }}>
                                                        {formatTime(record.clock_in) || '--:--'}
                                                    </td>
                                                    <td className="small">
                                                        {record.is_late && record.late_display ? (
                                                            <span className="da-badge d-inline-flex align-items-center gap-1 text-nowrap" style={{ ...LATE_PILL_LATE, borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 600 }}>
                                                                ⚠ {record.late_display}
                                                            </span>
                                                        ) : record.clock_in ? (
                                                            <span className="da-badge d-inline-flex align-items-center gap-1 text-nowrap" style={{ ...LATE_PILL_ON_TIME, borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 600 }}>
                                                                ✓ On Time
                                                            </span>
                                                        ) : <span style={{ color: DA.secondary }}>-</span>}
                                                    </td>
                                                    <td className="small d-none d-sm-table-cell text-nowrap" style={{ color: record.clock_out ? DA.primaryGreen : DA.secondary, fontWeight: 600 }}>
                                                        {formatTime(record.clock_out) || '--:--'}
                                                    </td>
                                                    <td className="small d-none d-lg-table-cell text-nowrap" style={{ color: DA.text }}>
                                                        {record.status === 'working' ? (
                                                            <span style={{ color: DA.primaryGreen, fontWeight: 600 }}>
                                                                <FaClock className="me-1" size={9} />
                                                                {getLiveHoursDisplay(record)}
                                                            </span>
                                                        ) : record.total_hours > 0 ? formatDecimalHoursToHMS(parseFloat(record.total_hours)) : '-'}
                                                    </td>
                                                    <td className="small">
                                                        <span className="da-badge d-inline-flex align-items-center gap-1 text-nowrap" style={{ ...pillStyle, borderRadius: 999, padding: '5px 12px', fontSize: 12, fontWeight: 600 }}>
                                                            {statusKey === 'working' && <span style={{ fontSize: 8 }}>●</span>}
                                                            {statusKey === 'present' && <FaCheckCircle size={10} />}
                                                            {statusLabel}
                                                        </span>
                                                    </td>
                                                    <td className="text-center">
                                                        <button
                                                            className="btn btn-sm da-action-btn d-inline-flex align-items-center gap-1"
                                                            style={{ borderRadius: 999, border: `1px solid ${DA.border}`, background: '#fff', color: DA.secondary, fontSize: 12 }}
                                                            onClick={() => setShowDetails(prev => ({ ...prev, [index]: !prev[index] }))}
                                                        >
                                                            {showDetails[index] ? <FaEyeSlash size={11} /> : <FaEllipsisV size={11} />} Details
                                                        </button>
                                                    </td>
                                                </tr>
                                                {showDetails[index] && (
                                                    <tr className="bg-light">
                                                        <td colSpan="9" className="p-3">
                                                            <Row className="g-2 small">
                                                                <Col xs={12} md={4}><strong>Employee:</strong> {record.employee_name}</Col>
                                                                <Col xs={12} md={4}><strong>ID:</strong> {record.employee_id}</Col>
                                                                <Col xs={12} md={4}><strong>Department:</strong> {record.department || 'N/A'}</Col>
                                                                <Col xs={12} md={4}><strong>Date:</strong> {formatDate(record.attendance_date)}</Col>
                                                                <Col xs={12} md={4}><strong>Clock In:</strong> {formatTime(record.clock_in) || '--:--'}</Col>
                                                                <Col xs={12} md={4}><strong>Clock Out:</strong> {formatTime(record.clock_out) || '--:--'}</Col>
                                                                <Col xs={12} md={4}>
                                                                    <strong>Total Hours:</strong>{' '}
                                                                    {record.status === 'working'
                                                                        ? <span className="text-success">{getLiveHoursDisplay(record)} (live)</span>
                                                                        : `${record.total_hours || 0}h`}
                                                                </Col>
                                                                {record.is_late && <Col xs={12} md={4}><strong className="text-warning">Late Duration:</strong> {record.late_display}</Col>}
                                                                {record.overtime_hours > 0 && <Col xs={12} md={4}><strong className="text-success">Overtime:</strong> +{record.overtime_hours}h</Col>}
                                                                {record.leave_type && <Col xs={12}><strong>Leave Type:</strong> {record.leave_type}</Col>}
                                                            </Row>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })
                                ) : (
                                    <tr>
                                        <td colSpan="9" className="text-center py-5">
                                            <div style={{ color: DA.secondary }}>
                                                <FaCalendarAlt size={36} className="mb-2" style={{ opacity: 0.3 }} />
                                                <div style={{ fontSize: 14, fontWeight: 500 }}>No attendance records found</div>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                                {dailyLoadingMore && (
                                    <tr>
                                        <td colSpan="9" className="text-center py-3 da-row-enter">
                                            <div className="d-inline-flex align-items-center gap-2" style={{ color: DA.secondary, fontSize: 12 }}>
                                                <Spinner animation="border" size="sm" style={{ width: 14, height: 14, color: DA.primaryGreen }} />
                                                Loading more…
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </Table>
                    </div>
                    <div className="d-flex flex-column flex-sm-row justify-content-between align-items-center gap-2 px-3 py-3" style={{ borderTop: `1px solid ${DA.border}` }}>
                        <small style={{ color: DA.secondary }}>
                            {filteredAttendance.length === 0
                                ? 'Showing 0 entries'
                                : `Showing ${visibleAttendance.length} of ${filteredAttendance.length} entries`}
                        </small>
                        {dailyHasMore && (
                            <button
                                className="btn btn-sm"
                                style={{ borderRadius: 999, border: `1px solid ${DA.primaryGreen}`, background: '#fff', color: DA.primaryGreen, fontWeight: 600, padding: '5px 16px' }}
                                onClick={() => setDailyLoadCount(c => c + DAILY_CHUNK_SIZE)}
                            >
                                Load More
                            </button>
                        )}
                    </div>
                </div>
            ) : (
            <Card className="border-0 shadow-sm">
                <Card.Header className="bg-white py-2 d-flex justify-content-between align-items-center flex-wrap gap-2">
                    <h6 className="mb-0 small fw-semibold">
                        Monthly Attendance Calendar
                        {dateRange.start && dateRange.end && (
                            <span className="text-muted ms-2 fw-normal">({formatDate(dateRange.start)} - {formatDate(dateRange.end)})</span>
                        )}
                    </h6>
                    <Badge bg="secondary" pill>{filteredAttendance.length} Records</Badge>
                </Card.Header>
                <Card.Body className="p-0">
                        <div className="table-responsive" style={{ maxHeight: '500px', overflow: 'auto' }}>
                            <Table className="mb-0" size="sm" bordered>
                                <thead className="bg-light sticky-top">
                                    <tr className="small text-center">
                                        <th className="fw-normal" style={{ position: 'sticky', left: 0, backgroundColor: '#f8f9fa', zIndex: 20, minWidth: '120px' }}>Employee</th>
                                        {uniqueDates.map(date => (
                                            <th key={date} className="fw-normal" style={{ minWidth: '40px' }}>
                                                {new Date(date).getDate()}
                                                <br /><small className="text-muted">{new Date(date).toLocaleDateString('en-US', { weekday: 'short' })}</small>
                                            </th>
                                        ))}
                                        <th className="fw-normal">P</th>
                                        <th className="fw-normal">H</th>
                                        <th className="fw-normal">L</th>
                                        <th className="fw-normal">A</th>
                                        <th className="fw-normal">OT</th>
                                        <th className="fw-normal">Rate</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {getCalendarData().map((employee, idx) => {
                                        const empStats = employeeSummary.find(e => e.employee_id === employee.employee_id);
                                        return (
                                            <tr key={employee.employee_id}>
                                                <td className="small" style={{ position: 'sticky', left: 0, backgroundColor: 'white', zIndex: 10, minWidth: '120px' }}>
                                                    <div className="fw-semibold text-truncate" style={{ maxWidth: '110px' }} title={employee.employee_name}>
                                                        {employee.employee_name}
                                                    </div>
                                                    <small className="text-muted">{employee.employee_id}</small>
                                                </td>
                                                {uniqueDates.map(date => {
                                                    const record = employee.records[date];
                                                    let statusDisplay = '•';
                                                    let statusColor = 'text-secondary';
                                                    if (record) {
                                                        if (record.status === 'present' || record.status === 'working') {
                                                            statusDisplay = '✓';
                                                            statusColor = record.is_late ? 'text-warning' : 'text-success';
                                                        } else if (record.status === 'half_day') {
                                                            statusDisplay = '½';
                                                            statusColor = 'text-warning';
                                                        } else if (record.status === 'on_leave') {
                                                            statusDisplay = 'L';
                                                            statusColor = 'text-purple';
                                                        } else if (record.status === 'weekend') {
                                                            statusDisplay = 'W';
                                                            statusColor = 'text-secondary';
                                                        } else {
                                                            statusDisplay = '✗';
                                                            statusColor = 'text-danger';
                                                        }
                                                    }
                                                    return (
                                                        <td key={date} className={`small text-center align-middle ${statusColor}`} title={record ? `${record.status}${record.is_late ? ' (Late)' : ''}` : 'No data'}>
                                                            <span className="fw-bold">{statusDisplay}</span>
                                                            {record?.overtime_hours > 0 && <sup className="text-success">+</sup>}
                                                            {record?.is_late && <sup className="text-warning">*</sup>}
                                                        </td>
                                                    );
                                                })}
                                                <td className="text-center"><Badge bg="success" pill>{empStats?.total_present || 0}</Badge></td>
                                                <td className="text-center"><Badge bg="warning" pill>{empStats?.total_half_day || 0}</Badge></td>
                                                <td className="text-center"><Badge bg="purple" pill style={{ backgroundColor: '#6f42c1' }}>{empStats?.total_on_leave || 0}</Badge></td>
                                                <td className="text-center"><Badge bg="danger" pill>{empStats?.total_absent || 0}</Badge></td>
                                                <td className="text-center">{empStats?.total_overtime_hours > 0 && <Badge bg="success" pill>+{empStats.total_overtime_hours}h</Badge>}</td>
                                                <td className="text-center fw-bold">{empStats?.attendance_rate || 0}%</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </Table>
                        </div>
                </Card.Body>
            </Card>
            )}

            {/* Legend — only meaningful for the Monthly calendar's coded cells; the Daily
                table already shows full-word status pills, so it doesn't need one. */}
            {activeView === 'monthly' && (
                <div className="mt-3 d-flex flex-wrap justify-content-center gap-3 small text-muted">
                    <span><Badge bg="success" pill className="me-1">✓</Badge> Present</span>
                    <span><Badge bg="warning" pill className="me-1">½</Badge> Half Day</span>
                    <span><Badge bg="purple" pill className="me-1" style={{ backgroundColor: '#6f42c1' }}>L</Badge> On Leave</span>
                    <span><Badge bg="secondary" pill className="me-1">W</Badge> Weekend</span>
                    <span><Badge bg="danger" pill className="me-1">✗</Badge> Absent</span>
                    <span className="text-warning"><FaExclamationTriangle className="me-1" size={10} /> Late Login (*)</span>
                    <span className="text-success"><FaClock className="me-1" size={10} /> Overtime (+)</span>
                </div>
            )}

            <style>{ATTENDANCE_TABLE_CSS}</style>

            <ApplyEarlyLogoutModal
                show={showEarlyLogout}
                onClose={() => setShowEarlyLogout(false)}
                date={selectedDate}
                candidates={earlyLogoutCandidates}
                onSuccess={() => { setMessage('Early logout applied successfully!'); setTimeout(() => setMessage(''), 3000); refreshData(); }}
            />
        </div>
    );
};

export default TeamAttendanceReport;