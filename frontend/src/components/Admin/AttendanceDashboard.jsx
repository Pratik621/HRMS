import PaginatedTable from '../Common/PaginatedTable';
// src/components/Admin/AttendanceReports.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card, Table, Badge, Form, Row, Col,
  Button, Spinner, Alert
} from 'react-bootstrap';
import {
  FaCalendarAlt,
  FaFileExcel,
  FaArrowLeft,
  FaArrowRight,
  FaEye,
  FaClock,
  FaUmbrellaBeach,
  FaExclamationTriangle,
  FaMoneyBillWave,
  FaUserTie,
  FaVenusMars,
  FaUniversity,
  FaIdCard,
  FaMoon,
  FaTrophy
} from 'react-icons/fa';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';
import * as XLSX from 'xlsx';
import { holidays as holidayData } from '../../data/holidays';

const AttendanceReports = () => {
  const navigate = useNavigate();
  const [activeView, setActiveView] = useState('daily');
  const [dailyAttendance, setDailyAttendance] = useState([]);
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [monthlyAttendance, setMonthlyAttendance] = useState([]);
  const [allEmployees, setAllEmployees] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [department, setDepartment] = useState('all');
  const [departments, setDepartments] = useState([]);
  const [monthlyStats, setMonthlyStats] = useState({});
  const [daysInMonth, setDaysInMonth] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('danger');
  const [triggeringMissingCheck, setTriggeringMissingCheck] = useState(false);

  const currentDate = new Date();
  const currentDay = currentDate.getDate();
  const currentMonth = currentDate.getMonth() + 1;
  const currentYear = currentDate.getFullYear();

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
  for (let i = 2020; i <= currentYear + 1; i++) {
    years.push(i);
  }

  const PROFESSIONAL_TAX = 200;
  const OVERTIME_RATE = 150;

  // Format decimal hours to "Xh Ym" format
  const formatHours = (decimalHours) => {
    if (!decimalHours || decimalHours <= 0) return '-';

    const totalMinutes = Math.round(decimalHours * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (minutes === 0) {
      return `${hours}h`;
    }
    return `${hours}h ${minutes}m`;
  };


  // Format late minutes to "Xh Ym Zs" format
  const formatLateDisplay = (lateMinutes) => {
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

  const formatTime = (datetime) => {
    if (!datetime) return '—';
    return new Date(datetime).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatShortTime = (datetime) => {
    if (!datetime) return '-';
    return new Date(datetime).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  useEffect(() => {
    fetchAllEmployees();
  }, []);

  useEffect(() => {
    const days = new Date(selectedYear, selectedMonth, 0).getDate();
    setDaysInMonth(days);
  }, [selectedMonth, selectedYear]);

  useEffect(() => {
    if (activeView === 'daily') {
      fetchDailyAttendance();
    } else {
      if (allEmployees.length > 0) {
        fetchMonthlyAttendance();
      }
    }
  }, [activeView, selectedDate, selectedMonth, selectedYear, department, allEmployees]);

  const fetchAllEmployees = async () => {
    try {
      const response = await axios.get(API_ENDPOINTS.EMPLOYEES);
      setAllEmployees(response.data);
      const depts = ['all', ...new Set(response.data.map(emp => emp.department).filter(Boolean))];
      setDepartments(depts);
      setMessage('');
    } catch (error) {
      console.error('Error fetching employees:', error);
      setMessage('Failed to load employees');
      setMessageType('danger');
    }
  };

  const fetchDailyAttendance = async () => {
    try {
      setLoading(true);
      setMessage('');

      const url = `${API_ENDPOINTS.ATTENDANCE_REPORT}?start=${selectedDate}&end=${selectedDate}`;
      const response = await axios.get(url);

      const attendanceData = response.data.attendance || [];

      const processedAttendance = attendanceData.map(record => {
        if (record.clock_in && !record.clock_out) {
          const now = new Date();
          const clockInTime = new Date(record.clock_in);
          const currentHours = (now - clockInTime) / (1000 * 60 * 60);
          record.total_hours = currentHours.toFixed(2);
          record.status = 'working';
        }

        record.late_minutes = Number(record.late_minutes) || 0;
        record.is_late = record.late_minutes > 0;

        // FIXED: Always calculate late_display if late_minutes exists
        if (record.late_minutes > 0) {
          // Calculate late display with proper formatting
          const totalSeconds = Math.floor(record.late_minutes * 60);
          const hours = Math.floor(totalSeconds / 3600);
          const remainingSeconds = totalSeconds % 3600;
          const minutes = Math.floor(remainingSeconds / 60);
          const seconds = remainingSeconds % 60;

          const parts = [];
          if (hours > 0) parts.push(`${hours}h`);
          if (minutes > 0) parts.push(`${minutes}m`);
          if (seconds > 0 || (hours === 0 && minutes === 0)) parts.push(`${seconds}s`);
          record.late_display = parts.join(' ');
        } else {
          record.late_display = null;
        }

        return record;
      });

      setDailyAttendance(processedAttendance);

    } catch (error) {
      console.error('Error fetching daily attendance:', error);
      setMessage(error.response?.data?.message || 'Failed to load attendance');
      setMessageType('danger');
    } finally {
      setLoading(false);
    }
  };

  const fetchMonthlyAttendance = async () => {
    try {
      setLoading(true);
      setMessage('');

      const startDate = new Date(selectedYear, selectedMonth - 1, 1);
      const endDate = new Date(selectedYear, selectedMonth, 0);

      const formatLocalDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };

      const startDateStr = formatLocalDate(startDate);
      const endDateStr = formatLocalDate(endDate);

      let url = `${API_ENDPOINTS.ATTENDANCE_REPORT}?start=${startDateStr}&end=${endDateStr}`;
      if (department !== 'all') {
        url += `&department=${department}`;
      }

      const response = await axios.get(url);
      const attendanceData = response.data.attendance || [];

      let leaveData = [];
      try {
        const leaveResponse = await axios.get(API_ENDPOINTS.LEAVES);
        leaveData = leaveResponse.data.filter(leave =>
          leave.status === 'approved' &&
          new Date(leave.end_date) >= startDate &&
          new Date(leave.start_date) <= endDate
        );
      } catch (error) {
        console.log('Could not fetch leave data');
      }

      const monthHolidays = holidayData.filter(holiday => {
        const holidayDate = new Date(holiday.date);
        return holidayDate.getFullYear() === selectedYear &&
          holidayDate.getMonth() + 1 === selectedMonth;
      });

      const processedData = processMonthlyAttendance(
        attendanceData,
        allEmployees,
        leaveData,
        monthHolidays,
        startDate,
        endDate
      );

      setMonthlyAttendance(processedData);
      calculateMonthlyStatistics(processedData);

    } catch (error) {
      console.error('Error fetching monthly attendance:', error);
      setMessage(error.response?.data?.message || 'Failed to load monthly attendance');
      setMessageType('danger');
    } finally {
      setLoading(false);
    }
  };

  const processMonthlyAttendance = (attendanceData, employees, leaveData, holidays, startDate, endDate) => {
    const daysInMonth = endDate.getDate();
    const processedData = [];

    const attendanceMap = {};
    attendanceData.forEach(record => {
      if (record.attendance_date) {
        const dateStr = record.attendance_date.split('T')[0];
        if (dateStr && record.employee_id) {
          const key = `${record.employee_id}-${dateStr}`;
          attendanceMap[key] = record;
        }
      }
    });

    const leaveMap = {};
    leaveData.forEach(leave => {
      const leaveStart = new Date(leave.start_date);
      const leaveEnd = new Date(leave.end_date || leave.start_date);

      for (let d = new Date(leaveStart); d <= leaveEnd; d.setDate(d.getDate() + 1)) {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;
        const key = `${leave.employee_id}-${dateStr}`;
        leaveMap[key] = {
          type: leave.leave_type,
          reason: leave.reason
        };
      }
    });

    const holidayMap = {};
    holidays.forEach(holiday => {
      const dateStr = holiday.date;
      holidayMap[dateStr] = {
        name: holiday.name,
        region: holiday.region
      };
    });

    let filteredEmployees = employees;
    if (department !== 'all') {
      filteredEmployees = employees.filter(emp => emp.department === department);
    }

    const today = new Date();
    const todayYear = today.getFullYear();
    const todayMonth = today.getMonth() + 1;
    const todayDay = today.getDate();

    filteredEmployees.forEach(employee => {
      for (let day = 1; day <= daysInMonth; day++) {
        const currentDate = new Date(selectedYear, selectedMonth - 1, day);

        const year = currentDate.getFullYear();
        const month = String(currentDate.getMonth() + 1).padStart(2, '0');
        const dayStr = String(currentDate.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${dayStr}`;

        const dayOfWeek = currentDate.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const isToday = year === todayYear &&
          currentDate.getMonth() + 1 === todayMonth &&
          day === todayDay;

        const attendanceKey = `${employee.employee_id}-${dateStr}`;
        const dayAttendance = attendanceMap[attendanceKey];
        const dayLeave = leaveMap[attendanceKey];
        const dayHoliday = holidayMap[dateStr];

        let status = 'absent';
        let statusBadge = 'danger';
        let statusIcon = '✗';
        let clockIn = null;
        let clockOut = null;
        let totalHours = 0;
        let lateMinutes = 0;
        let tooltip = 'Absent';
        let leaveType = null;
        let compOffAwarded = false;
        let compOffDays = 0;
        let overtimeHours = 0;
        let overtimeMinutes = 0;
        let overtimeAmount = 0;

        if (isWeekend) {
          status = 'weekend';
          statusBadge = 'secondary';
          statusIcon = 'W';
          tooltip = 'Weekend (Saturday/Sunday)';
        }
        else if (dayHoliday) {
          status = 'holiday';
          statusBadge = 'warning';
          statusIcon = '🎉';
          tooltip = `Holiday: ${dayHoliday.name}`;
        }
        else if (dayLeave) {
          status = 'on_leave';
          statusBadge = 'purple';
          statusIcon = '🏖️';
          tooltip = `On Leave: ${dayLeave.type}`;
          leaveType = dayLeave.type;
        }
        else if (dayAttendance) {
          clockIn = dayAttendance.clock_in;
          clockOut = dayAttendance.clock_out;
          totalHours = parseFloat(dayAttendance.total_hours) || 0;
          lateMinutes = dayAttendance.late_minutes || 0;
          compOffAwarded = dayAttendance.comp_off_awarded || false;
          compOffDays = dayAttendance.comp_off_days || 0;
          overtimeHours = dayAttendance.overtime_hours || 0;
          overtimeMinutes = dayAttendance.overtime_minutes || 0;
          overtimeAmount = dayAttendance.overtime_amount || 0;

          if (isToday && clockIn && !clockOut) {
            status = 'working';
            statusBadge = 'info';
            statusIcon = '✓';
            tooltip = `Working since ${formatShortTime(clockIn)}`;
            if (lateMinutes > 0) {
              tooltip += ` | Late: ${formatLateDisplay(lateMinutes)}`;
            }
            if (compOffAwarded) {
              tooltip += ` | 🎉 Comp-Off Earned: ${compOffDays} day`;
            }
            if (overtimeHours > 0) {
              tooltip += ` | Overtime: ${overtimeHours}h (₹${overtimeAmount})`;
            }

            const now = new Date();
            const clockInTime = new Date(clockIn);
            totalHours = (now - clockInTime) / (1000 * 60 * 60);
          }
          else if (clockIn && clockOut) {
            if (totalHours >= 8) {
              status = 'present';
              statusBadge = 'success';
              statusIcon = '✓';
            } else if (totalHours >= 4) {
              status = 'half_day';
              statusBadge = 'warning';
              statusIcon = '½';
            } else {
              status = 'absent';
              statusBadge = 'danger';
              statusIcon = '✗';
            }

            tooltip = `In: ${formatShortTime(clockIn)} | Out: ${formatShortTime(clockOut)} | Hrs: ${formatHours(totalHours)}`;
            if (lateMinutes > 0) {
              tooltip += ` | Late: ${formatLateDisplay(lateMinutes)}`;
            }
            if (compOffAwarded) {
              tooltip += ` | 🎉 Comp-Off Earned: ${compOffDays} day`;
            }
            if (overtimeHours > 0) {
              tooltip += ` | Overtime: ${overtimeHours}h (₹${overtimeAmount})`;
            }
          }
          else if (clockIn) {
            status = 'present';
            statusBadge = 'success';
            statusIcon = '✓';
            tooltip = `In: ${formatShortTime(clockIn)} | No clock out`;
            if (lateMinutes > 0) {
              tooltip += ` | Late: ${formatLateDisplay(lateMinutes)}`;
            }
            if (compOffAwarded) {
              tooltip += ` | 🎉 Comp-Off Earned: ${compOffDays} day`;
            }
            if (overtimeHours > 0) {
              tooltip += ` | Overtime: ${overtimeHours}h (₹${overtimeAmount})`;
            }
          }
        }

        processedData.push({
          id: `${employee.employee_id}-${dateStr}`,
          employee_id: employee.employee_id,
          employee_name: `${employee.first_name} ${employee.last_name}`,
          department: employee.department,
          date: dateStr,
          day,
          dayOfWeek,
          isWeekend,
          isToday,
          clock_in: clockIn,
          clock_out: clockOut,
          total_hours: status === 'holiday' || status === 'weekend' ? '0' : totalHours.toFixed(1),
          status,
          statusBadge,
          statusIcon,
          late_minutes: lateMinutes,
          late_display: lateMinutes > 0 ? formatLateDisplay(lateMinutes) : null,
          is_late: lateMinutes > 0,
          tooltip,
          leave_type: leaveType,
          is_holiday: !!dayHoliday,
          holiday_name: dayHoliday?.name,
          comp_off_awarded: compOffAwarded,
          comp_off_days: compOffDays,
          overtime_hours: overtimeHours,
          overtime_minutes: overtimeMinutes,
          overtime_amount: overtimeAmount
        });
      }
    });

    return processedData;
  };

  const calculateMonthlyStatistics = (data) => {
    const perEmployee = {};

    data.forEach(record => {
      if (!perEmployee[record.employee_id]) {
        perEmployee[record.employee_id] = {
          name: record.employee_name,
          present: 0,
          half_day: 0,
          absent: 0,
          on_leave: 0,
          working: 0,
          holiday: 0,
          weekend: 0,
          total_hours: 0,
          working_days_count: 0,
          avg_hours: 0,
          late_count: 0,
          total_late_minutes: 0,
          comp_off_count: 0,
          total_comp_off_days: 0,
          overtime_hours: 0,
          overtime_minutes: 0,
          overtime_amount: 0,
          leave_types: []
        };
      }

      if (record.status === 'present') perEmployee[record.employee_id].present++;
      else if (record.status === 'half_day') perEmployee[record.employee_id].half_day++;
      else if (record.status === 'absent') perEmployee[record.employee_id].absent++;
      else if (record.status === 'on_leave') {
        perEmployee[record.employee_id].on_leave++;
        if (record.leave_type) {
          perEmployee[record.employee_id].leave_types.push(record.leave_type);
        }
      }
      else if (record.status === 'working') perEmployee[record.employee_id].working++;
      else if (record.status === 'holiday') perEmployee[record.employee_id].holiday++;
      else if (record.status === 'weekend') perEmployee[record.employee_id].weekend++;

      if (record.status === 'present' || record.status === 'working' || record.status === 'half_day') {
        perEmployee[record.employee_id].working_days_count++;
        const hours = parseFloat(record.total_hours || 0);
        perEmployee[record.employee_id].total_hours += hours;
      }

      if (record.is_late) {
        perEmployee[record.employee_id].late_count++;
        perEmployee[record.employee_id].total_late_minutes += record.late_minutes || 0;
      }

      if (record.comp_off_awarded) {
        perEmployee[record.employee_id].comp_off_count++;
        perEmployee[record.employee_id].total_comp_off_days += record.comp_off_days || 0;
      }

      if (record.overtime_hours > 0) {
        perEmployee[record.employee_id].overtime_hours += record.overtime_hours;
        perEmployee[record.employee_id].overtime_minutes += record.overtime_minutes || 0;
        perEmployee[record.employee_id].overtime_amount += record.overtime_amount || 0;
      }
    });

    Object.keys(perEmployee).forEach(empId => {
      const emp = perEmployee[empId];
      if (emp.working_days_count > 0) {
        emp.avg_hours = emp.total_hours / emp.working_days_count;
      } else {
        emp.avg_hours = 0;
      }

      if (emp.late_count > 0) {
        emp.avg_late_minutes = (emp.total_late_minutes / emp.late_count).toFixed(1);
        emp.late_display = formatLateDisplay(emp.total_late_minutes);
      } else {
        emp.avg_late_minutes = '0';
        emp.late_display = '0';
      }
      emp.unique_leave_types = [...new Set(emp.leave_types)];
    });

    setMonthlyStats(perEmployee);
  };

  const getLeaveBalance = async (employeeId) => {
    try {
      const response = await axios.get(API_ENDPOINTS.LEAVE_BALANCE(employeeId));
      return response.data.available || '0';
    } catch (error) {
      console.error('Error fetching leave balance:', error);
      return '0';
    }
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

  const getGender = (employee) => {
    return employee.gender || 'Not Specified';
  };

  const calculateSalary = (employee, overtimeAmount) => {
    const grossSalary = parseFloat(employee.gross_salary) || 0;
    const netSalaryAfterDeduction = grossSalary - PROFESSIONAL_TAX;
    const actualSalaryAfterOT = netSalaryAfterDeduction + (overtimeAmount || 0);

    return {
      grossSalary: grossSalary.toFixed(2),
      professionalTax: PROFESSIONAL_TAX,
      netSalaryAfterDeduction: netSalaryAfterDeduction.toFixed(2),
      overtimeAmount: overtimeAmount || 0,
      actualSalaryAfterOT: actualSalaryAfterOT.toFixed(2),
      netSalaryToPay: actualSalaryAfterOT.toFixed(2)
    };
  };

  const handleTriggerMissingCheck = async () => {
    if (!window.confirm('Force-close all clock-in sessions open for 15+ hours and mark them as "Missing Clock-Out"?\n\nThis will immediately affect all employees with open sessions older than 15 hours.')) return;
    setTriggeringMissingCheck(true);
    try {
      const res = await axios.post(API_ENDPOINTS.ATTENDANCE_TRIGGER_MISSING_CHECK);
      const count = res.data?.markedCount ?? 0;
      setMessage(count > 0 ? `✅ ${count} record(s) marked as missing.` : 'No records needed closing (none open ≥ 15h).');
      setMessageType(count > 0 ? 'success' : 'info');
    } catch (err) {
      setMessage(err.response?.data?.message || 'Failed to trigger missing check.');
      setMessageType('danger');
    } finally {
      setTriggeringMissingCheck(false);
    }
  };

  const handleExportExcel = async () => {
    try {
      if (activeView === 'daily') {
        const exportDate = new Date(selectedDate);
        const formattedDate = exportDate.toLocaleDateString();

        const exportData = dailyAttendance.map((record, index) => ({
          'Sr No': index + 1,
          'Date': formattedDate,
          'Employee ID': record.employee_id,
          'Employee Name': `${record.first_name} ${record.last_name}`,
          'Department': record.department,
          'Shift': record.shift_time_used || 'Not set',
          'Clock In': record.clock_in ? formatShortTime(record.clock_in) : '-',
          'Clock Out': record.clock_out ? formatShortTime(record.clock_out) : '-',
          'Total Hours': record.total_hours ? formatHours(parseFloat(record.total_hours)) : '-',
          'Late Duration': record.late_display || '0',
          'Overtime Hours': record.overtime_hours || '0',
          'Overtime Amount': record.overtime_amount || '0',
          'Is Holiday': record.is_holiday ? 'Yes' : 'No',
          'Holiday Name': record.holiday_name || '-',
          'Comp-Off Earned': record.comp_off_awarded ? 'Yes' : 'No',
          'Comp-Off Days': record.comp_off_days || 0,
          'Status': record.status === 'present' ? 'Present' :
            record.status === 'half_day' ? 'Half Day' :
              record.status === 'working' ? 'Working' :
                record.status === 'on_leave' ? 'On Leave' :
                  record.status === 'holiday' ? 'Holiday' :
                    record.status === 'weekend' ? 'Weekend Off' : 'Absent'
        }));

        const ws = XLSX.utils.json_to_sheet(exportData);
        const colWidths = [
          { wch: 8 }, { wch: 12 }, { wch: 15 }, { wch: 25 }, { wch: 15 },
          { wch: 15 }, { wch: 10 }, { wch: 10 }, { wch: 15 }, { wch: 12 },
          { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 20 }, { wch: 12 },
          { wch: 10 }, { wch: 12 }
        ];
        ws['!cols'] = colWidths;

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Daily Attendance');
        XLSX.writeFile(wb, `Daily_Attendance_${selectedDate}.xlsx`);

        setMessage('Daily report exported successfully!');
        setMessageType('success');
        setTimeout(() => setMessage(''), 3000);

      } else {
        const currentMonthData = months.find(m => m.value === selectedMonth);
        const monthShort = currentMonthData?.short || 'Month';
        const monthName = currentMonthData?.label || 'Month';

        const exportData = [];

        const sortedEmployees = [...allEmployees].sort((a, b) => {
          if (department !== 'all') {
            if (a.department === department && b.department !== department) return -1;
            if (a.department !== department && b.department === department) return 1;
          }
          return (a.first_name || '').localeCompare(b.first_name || '');
        });

        for (const employee of sortedEmployees) {
          if (department !== 'all' && employee.department !== department) continue;

          const empRecords = monthlyAttendance.filter(r => r.employee_id === employee.employee_id);
          const empStats = monthlyStats[employee.employee_id] || {
            present: 0,
            half_day: 0,
            absent: 0,
            on_leave: 0,
            weekend: 0,
            late_count: 0,
            total_late_minutes: 0,
            comp_off_count: 0,
            total_comp_off_days: 0,
            overtime_hours: 0,
            overtime_amount: 0,
            avg_hours: 0,
            total_hours: 0
          };

          const leaveBalance = await getLeaveBalance(employee.employee_id);
          const salary = calculateSalary(employee, empStats.overtime_amount);

          const row = {
            'Employee Name': `${employee.first_name || ''} ${employee.last_name || ''}`.trim(),
            'Date of Joining': employee.joining_date ? new Date(employee.joining_date).toLocaleDateString() : 'N/A',
            'Leave Balance': leaveBalance,
          };

          for (let day = 1; day <= daysInMonth; day++) {
            const dayRecord = empRecords.find(r => r.day === day);
            let status = '';

            if (dayRecord) {
              if (dayRecord.status === 'present' || dayRecord.status === 'working') {
                status = 'P';
              } else if (dayRecord.status === 'half_day') {
                status = 'HD';
              } else if (dayRecord.status === 'on_leave') {
                status = 'L';
              } else if (dayRecord.status === 'holiday') {
                status = 'H';
              } else if (dayRecord.status === 'weekend') {
                status = 'W-OFF';
              } else if (dayRecord.status === 'absent') {
                status = 'A';
              } else {
                status = 'A';
              }
            } else {
              const currentDate = new Date(selectedYear, selectedMonth - 1, day);
              const dayOfWeek = currentDate.getDay();
              if (dayOfWeek === 0 || dayOfWeek === 6) {
                status = 'W-OFF';
              } else {
                status = 'A';
              }
            }

            row[`${monthShort} ${day}`] = status;
          }

          row['Days of the Month'] = daysInMonth;
          row['Actual Present Days'] = (empStats.present + (empStats.half_day * 0.5)).toFixed(1);
          row['Present Days'] = empStats.present || 0;
          row['Half Days'] = empStats.half_day || 0;
          row['PL Leave'] = empStats.on_leave || 0;
          row['Weekend Off'] = empStats.weekend || 0;
          row['Absent'] = empStats.absent || 0;
          row['Late Coming'] = empStats.late_count || 0;
          row['Comp-Off Earned Count'] = empStats.comp_off_count || 0;
          row['Total Comp-Off Days'] = empStats.total_comp_off_days.toFixed(1) || '0';
          row['Overtime Hours'] = empStats.overtime_hours || 0;
          row['Overtime Amount'] = empStats.overtime_amount || 0;
          row['Avg Working Hours/Day'] = empStats.avg_hours ? formatHours(empStats.avg_hours) : '0h';
          row['Gross Salary (Monthly)'] = salary.grossSalary;
          row['Professional Tax (₹200)'] = salary.professionalTax;
          row['Net Salary (After Deduction)'] = salary.netSalaryAfterDeduction;
          row['Overtime Amount Added'] = salary.overtimeAmount > 0 ? salary.overtimeAmount : 0;
          row['Actual Salary (After OT)'] = salary.actualSalaryAfterOT;
          row['Net Salary To be Pay'] = salary.netSalaryToPay;
          row['Gender'] = getGender(employee);
          row['Account Number'] = employee.account_number || 'N/A';
          row['IFSC Code'] = employee.ifsc_code || 'N/A';
          row['Bank Name'] = employee.bank_account_name || 'N/A';

          exportData.push(row);
        }

        const ws = XLSX.utils.json_to_sheet(exportData);
        const colWidths = [
          { wch: 25 }, { wch: 15 }, { wch: 12 },
        ];

        for (let i = 1; i <= daysInMonth; i++) {
          colWidths.push({ wch: 8 });
        }

        colWidths.push(
          { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 10 }, { wch: 10 },
          { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 15 }, { wch: 15 },
          { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
          { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
          { wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 20 }
        );

        ws['!cols'] = colWidths;

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Monthly Attendance');
        XLSX.writeFile(wb, `Attendance_Report_${monthName}_${selectedYear}.xlsx`);

        setMessage('Monthly report exported successfully!');
        setMessageType('success');
        setTimeout(() => setMessage(''), 3000);
      }
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      setMessage('Failed to export data');
      setMessageType('danger');
    }
  };

  const getStatusBadge = (record) => {
    if (record.overtime_hours > 0) {
      return (
        <Badge bg="success" className="px-2 py-1 text-nowrap" style={{ backgroundColor: '#28a745' }}>
          <FaClock className="me-1" size={10} /> OT +{record.overtime_hours}h
        </Badge>
      );
    }

    if (record.comp_off_awarded) {
      return (
        <Badge bg="purple" className="px-2 py-1 text-nowrap" style={{ backgroundColor: '#9b59b6' }}>
          <FaTrophy className="me-1" size={10} /> Comp-Off +{record.comp_off_days}
        </Badge>
      );
    }

    if (record.status === 'working') {
      return record.is_late ?
        <Badge bg="warning" className="px-2 py-1 text-nowrap" style={{ backgroundColor: '#fd7e14' }}>
          Working ({formatLateDisplay(record.late_minutes)} late)
        </Badge> :
        <Badge bg="info" className="px-2 py-1 text-nowrap">Working</Badge>;
    }
    if (record.status === 'present') {
      return record.is_late ?
        <Badge bg="warning" className="px-2 py-1 text-nowrap" style={{ backgroundColor: '#fd7e14' }}>
          Present ({formatLateDisplay(record.late_minutes)} late)
        </Badge> :
        <Badge bg="success" className="px-2 py-1 text-nowrap">Present</Badge>;
    }
    if (record.status === 'half_day') return <Badge bg="warning" className="px-2 py-1 text-nowrap">Half Day</Badge>;
    if (record.status === 'on_leave') return <Badge bg="purple" className="px-2 py-1 text-nowrap" style={{ backgroundColor: '#6f42c1' }}>On Leave</Badge>;
    if (record.status === 'missing') return <Badge bg="dark" className="px-2 py-1 text-nowrap" style={{ backgroundColor: '#7c3aed' }}>Missing CO</Badge>;
    if (record.status === 'holiday') return <Badge bg="warning" className="px-2 py-1 text-nowrap" style={{ backgroundColor: '#ffc107' }}>Holiday</Badge>;
    if (record.status === 'weekend') return <Badge bg="secondary" className="px-2 py-1 text-nowrap"><FaMoon className="me-1" size={10} /> W-OFF</Badge>;
    return <Badge bg="secondary" className="px-2 py-1 text-nowrap">Absent</Badge>;
  };

  const isCurrentDate = (day) => {
    const today = new Date();
    const todayYear = today.getFullYear();
    const todayMonth = today.getMonth() + 1;
    const todayDay = today.getDate();

    return selectedMonth === todayMonth &&
      selectedYear === todayYear &&
      day === todayDay;
  };

  return (
    <div className="p-2 p-md-3 p-lg-4">
      <div className="d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center mb-3 gap-2">
        <h5 className="mb-0 d-flex align-items-center">
          <FaCalendarAlt className="me-2 text-primary" />
          Attendance Reports
        </h5>
        <div className="d-flex align-items-center gap-2">
          <small className="text-muted">{activeView === 'daily' ? 'Daily View' : 'Monthly View'}</small>
          <button
            className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1"
            onClick={() => navigate(-1)}
          >
            <FaArrowLeft size={12} /> Back
          </button>
        </div>
      </div>

      {message && (
        <Alert variant={messageType} onClose={() => setMessage('')} dismissible className="mb-3 py-2">
          <small>{message}</small>
        </Alert>
      )}

      <div className="mb-3 border-bottom pb-2 d-flex flex-wrap gap-2">
        <Button
          variant={activeView === 'daily' ? 'primary' : 'light'}
          size="sm"
          onClick={() => setActiveView('daily')}
          className="me-1"
        >
          <FaEye className="me-1" size={12} /> Daily View
        </Button>
        <Button
          variant={activeView === 'monthly' ? 'primary' : 'light'}
          size="sm"
          onClick={() => setActiveView('monthly')}
        >
          <FaCalendarAlt className="me-1" size={12} /> Monthly Calendar
        </Button>
      </div>

      {activeView === 'daily' ? (
        <div className="d-flex flex-column flex-sm-row mb-3 gap-2">
          <Form.Control
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            size="sm"
            className="flex-grow-1 flex-sm-grow-0"
            style={{ maxWidth: '200px' }}
          />
          <Button variant="success" size="sm" onClick={handleExportExcel} className="w-20 w-sm-auto">
            <FaFileExcel className="me-2" size={12} /> Export
          </Button>
          <Button
            variant="outline-danger"
            size="sm"
            onClick={handleTriggerMissingCheck}
            disabled={triggeringMissingCheck}
            title="Force-close sessions open for 15+ hours and mark as Missing Clock-Out"
          >
            {triggeringMissingCheck
              ? <><Spinner animation="border" size="sm" className="me-1" /> Checking...</>
              : <><FaExclamationTriangle className="me-1" size={12} /> Force Missing CO</>
            }
          </Button>
        </div>
      ) : (
        <div className="mb-3">
          <Row className="g-2">
            <Col xs={12} lg={8}>
              <div className="d-flex flex-wrap gap-2">
                <div className="d-flex">
                  <Button variant="outline-secondary" size="sm" onClick={handlePreviousMonth}>
                    <FaArrowLeft size={10} />
                  </Button>
                  <Form.Select
                    size="sm"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                    className="mx-1"
                    style={{ width: '90px' }}
                  >
                    {months.map(m => <option key={m.value} value={m.value}>{m.short}</option>)}
                  </Form.Select>
                  <Form.Select
                    size="sm"
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                    className="me-1"
                    style={{ width: '75px' }}
                  >
                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                  </Form.Select>
                  <Button variant="outline-secondary" size="sm" onClick={handleNextMonth}>
                    <FaArrowRight size={10} />
                  </Button>
                </div>

                <Button variant="outline-primary" size="sm" onClick={goToCurrentMonth} className="text-nowrap">
                  Current
                </Button>

                <Form.Select
                  size="sm"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  style={{ width: '130px' }}
                  className="text-truncate"
                >
                  {departments.map(dept => (
                    <option key={dept} value={dept}>
                      {dept === 'all' ? 'All Departments' : dept}
                    </option>
                  ))}
                </Form.Select>
              </div>
            </Col>

            <Col xs={12} lg={4}>
              <div className="d-flex gap-2 justify-content-start justify-content-lg-end">
                <Button variant="success" size="sm" onClick={handleExportExcel} className="w-50 w-lg-auto">
                  <FaFileExcel className="me-2" size={12} /> Export Report
                </Button>
              </div>
            </Col>
          </Row>
        </div>
      )}

      <div className="d-flex flex-wrap gap-2 gap-md-3 mb-3 small justify-content-center justify-content-md-start">
        <span className="d-flex align-items-center"><Badge bg="success" pill className="me-1">P</Badge> Present</span>
        <span className="d-flex align-items-center"><Badge bg="warning" pill className="me-1">HD</Badge> Half Day</span>
        <span className="d-flex align-items-center"><Badge bg="info" pill className="me-1">W</Badge> Working</span>
        <span className="d-flex align-items-center"><Badge bg="purple" pill style={{ backgroundColor: '#6f42c1' }} className="me-1">L</Badge> On Leave</span>
        <span className="d-flex align-items-center"><Badge bg="warning" pill style={{ backgroundColor: '#ffc107' }} className="me-1">H</Badge> Holiday</span>
        <span className="d-flex align-items-center"><Badge bg="secondary" pill className="me-1"><FaMoon className="me-1" size={10} /> W-OFF</Badge> Weekend</span>
        <span className="d-flex align-items-center"><Badge bg="secondary" pill className="me-1">A</Badge> Absent</span>
        <span className="d-flex align-items-center"><Badge bg="warning" pill style={{ backgroundColor: '#fd7e14' }} className="me-1">⚠️</Badge> Late</span>
        <span className="d-flex align-items-center"><Badge bg="success" pill style={{ backgroundColor: '#28a745' }} className="me-1"><FaClock className="me-1" size={10} /> OT</Badge> Overtime</span>
        <span className="d-flex align-items-center"><Badge bg="purple" pill style={{ backgroundColor: '#9b59b6' }} className="me-1"><FaTrophy className="me-1" size={10} /> Comp-Off</Badge> Comp-Off</span>
      </div>

      {loading ? (
        <div className="text-center py-5">
          <Spinner animation="border" variant="primary" size="sm" />
          <p className="mt-2 small text-muted">Loading attendance data...</p>
        </div>
      ) : (
        <Card className="border-0 shadow-sm">
          <Card.Header className="bg-light py-2 d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center gap-2">
            <h6 className="mb-0 fw-semibold small">
              {activeView === 'daily' ? 'Daily Attendance' : 'Monthly Calendar'}
            </h6>
            <Badge bg="secondary" pill className="ms-0 ms-sm-auto">
              {activeView === 'daily' ? dailyAttendance.length : daysInMonth} Records
            </Badge>
          </Card.Header>
          <Card.Body className="p-0">
            {activeView === 'daily' ? (
              <div className="table-responsive" style={{ maxHeight: '400px', overflow: 'auto' }}>
                <PaginatedTable searchable as={Table} size="sm" striped className="mb-0">
                  <thead className="bg-light sticky-top" style={{ top: 0, zIndex: 10 }}>
                    <tr>
                      <th className="text-dark fw-normal small text-center" style={{ width: '50px' }}>Sr No</th>
                      <th className="text-dark fw-normal small">Employee</th>
                      <th className="text-dark fw-normal small d-none d-sm-table-cell">Dept</th>
                      <th className="text-dark fw-normal small d-none d-md-table-cell">Shift</th>
                      <th className="text-dark fw-normal small">In</th>
                      <th className="text-dark fw-normal small d-none d-lg-table-cell">Late</th>
                      <th className="text-dark fw-normal small d-none d-lg-table-cell">Out</th>
                      <th className="text-dark fw-normal small d-none d-xl-table-cell">Hours</th>
                      <th className="text-dark fw-normal small d-none d-xl-table-cell">OT</th>
                      <th className="text-dark fw-normal small d-none d-xl-table-cell">OT Amt</th>
                      <th className="text-dark fw-normal small d-none d-xl-table-cell">Comp-Off</th>
                      <th className="text-dark fw-normal small">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyAttendance.length > 0 ? (
                      dailyAttendance.map((record, index) => (
                        <tr key={index} className={record.late_minutes > 0 ? 'table-warning' : ''}>
                          <td className="text-center small">{index + 1}</td>
                          <td className="small">
                            <div className="text-truncate" style={{ maxWidth: '100px' }} title={`${record.first_name} ${record.last_name}`}>
                              {record.first_name} {record.last_name}
                            </div>
                            <small className="text-muted text-truncate d-block" style={{ maxWidth: '100px' }} title={record.employee_id}>
                              {record.employee_id}
                            </small>
                          </td>
                          <td className="small d-none d-sm-table-cell">
                            <span className="text-truncate d-inline-block" style={{ maxWidth: '80px' }} title={record.department}>
                              {record.department}
                            </span>
                          </td>
                          <td className="small d-none d-md-table-cell">
                            <span className="text-nowrap">{record.shift_time_used || '-'}</span>
                          </td>
                          <td className={`small ${record.clock_in ? 'text-success' : 'text-muted'}`}>
                            <span className="text-nowrap" title={formatShortTime(record.clock_in)}>
                              {formatShortTime(record.clock_in)}
                            </span>
                            {record.late_minutes > 0 && (
                              <sup className="text-warning ms-1">⚠️</sup>
                            )}
                          </td>
                          <td className="small d-none d-lg-table-cell">
                            {record.late_minutes > 0 ? (
                              <Badge bg="warning" pill className="text-nowrap" style={{ backgroundColor: '#fd7e14' }}>
                                {formatLateDisplay(record.late_minutes)}
                              </Badge>
                            ) : '-'}
                          </td>
                          <td className={`small d-none d-lg-table-cell ${record.clock_out ? 'text-danger' : 'text-muted'}`}>
                            <span className="text-nowrap" title={formatShortTime(record.clock_out)}>
                              {formatShortTime(record.clock_out)}
                            </span>
                          </td>
                          <td className="small d-none d-xl-table-cell">
                            {record.total_hours ? (
                              <span className="text-nowrap">
                                {formatHours(parseFloat(record.total_hours))}
                              </span>
                            ) : '-'}
                          </td>
                          <td className="small d-none d-xl-table-cell">
                            {record.overtime_hours > 0 ? (
                              <Badge bg="success" pill className="text-nowrap">
                                +{record.overtime_hours}h
                              </Badge>
                            ) : '-'}
                          </td>
                          <td className="small d-none d-xl-table-cell">
                            {record.overtime_amount > 0 ? (
                              <Badge bg="info" pill className="text-nowrap">
                                ₹{record.overtime_amount}
                              </Badge>
                            ) : '-'}
                          </td>
                          <td className="small d-none d-xl-table-cell">
                            {record.comp_off_awarded ? (
                              <Badge bg="purple" pill className="text-nowrap" style={{ backgroundColor: '#9b59b6' }}>
                                <FaTrophy className="me-1" size={8} /> +{record.comp_off_days}
                              </Badge>
                            ) : '-'}
                          </td>
                          <td className="small">{getStatusBadge(record)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="12" className="text-center py-4">No attendance records</td>
                      </tr>
                    )}
                  </tbody>
                </PaginatedTable>
              </div>
            ) : (
              <div className="monthly-table-container" style={{ position: 'relative', height: '400px', overflow: 'auto' }}>
                <style>
                  {`
                    .monthly-table-container {
                      position: relative;
                      overflow: auto;
                      white-space: nowrap;
                    }
                    
                    .monthly-table {
                      border-collapse: separate;
                      border-spacing: 0;
                      min-width: 100%;
                    }
                    
                    .monthly-table thead {
                      position: sticky;
                      top: 0;
                      z-index: 20;
                      background-color: #f8f9fa;
                    }
                    
                    .monthly-table th, 
                    .monthly-table td {
                      border: 1px solid #dee2e6;
                      padding: 0.35rem;
                      white-space: nowrap;
                    }
                    
                    .fixed-col {
                      position: sticky;
                      background-color: white;
                      z-index: 15;
                    }
                    
                    .fixed-col-header {
                      position: sticky;
                      background-color: #f8f9fa !important;
                      z-index: 25;
                    }
                    
                    .col-1 {
                      left: 0;
                      min-width: 40px;
                      border-right: 2px solid #dee2e6;
                      box-shadow: 2px 0 5px -2px rgba(0,0,0,0.1);
                    }
                    
                    .col-2 {
                      left: 40px;
                      min-width: 120px;
                      border-right: 2px solid #dee2e6;
                      box-shadow: 2px 0 5px -2px rgba(0,0,0,0.1);
                    }
                    
                    .monthly-table tbody tr:hover .fixed-col {
                      background-color: rgba(0,0,0,.075);
                    }
                    
                    @media (max-width: 768px) {
                      .monthly-table th, 
                      .monthly-table td {
                        padding: 0.25rem;
                      }
                      .col-2 {
                        min-width: 100px;
                      }
                    }
                  `}
                </style>
                <PaginatedTable searchable className="monthly-table table-sm mb-0">
                  <thead>
                    <tr>
                      <th className="fixed-col-header col-1 text-center fw-normal small bg-light"
                        style={{ left: 0, top: 0 }}>
                        Sr No
                      </th>
                      <th className="fixed-col-header col-2 text-center fw-normal small bg-light"
                        style={{ left: '40px', top: 0 }}>
                        Employee
                      </th>
                      {[...Array(daysInMonth)].map((_, i) => {
                        const day = i + 1;
                        const isCurrent = isCurrentDate(day);
                        const monthData = months.find(m => m.value === selectedMonth);
                        const currentDate = new Date(selectedYear, selectedMonth - 1, day);
                        const dayOfWeek = currentDate.getDay();
                        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

                        return (
                          <th key={i} className={`fw-normal small text-center ${isCurrent ? 'bg-primary text-white' : isWeekend ? 'bg-secondary text-white' : 'bg-light'}`}
                            style={{ minWidth: '30px', top: 0, zIndex: 10 }}>
                            {day}
                            <div className="small fw-normal d-none d-sm-block">{monthData?.short}</div>
                          </th>
                        );
                      })}
                      <th className="text-center fw-normal small bg-light" style={{ minWidth: '28px', top: 0, zIndex: 10 }}>P</th>
                      <th className="text-center fw-normal small bg-light" style={{ minWidth: '28px', top: 0, zIndex: 10 }}>H</th>
                      <th className="text-center fw-normal small bg-light" style={{ minWidth: '28px', top: 0, zIndex: 10 }}>L</th>
                      <th className="text-center fw-normal small bg-light d-none d-md-table-cell" style={{ minWidth: '28px', top: 0, zIndex: 10 }}>Hol</th>
                      <th className="text-center fw-normal small bg-light d-none d-md-table-cell" style={{ minWidth: '28px', top: 0, zIndex: 10 }}>W</th>
                      <th className="text-center fw-normal small bg-light" style={{ minWidth: '28px', top: 0, zIndex: 10 }}>A</th>
                      <th className="text-center fw-normal small bg-light d-none d-lg-table-cell" style={{ minWidth: '60px', top: 0, zIndex: 10 }}>Late</th>
                      <th className="text-center fw-normal small bg-light d-none d-lg-table-cell" style={{ minWidth: '60px', top: 0, zIndex: 10 }}>OT</th>
                      <th className="text-center fw-normal small bg-light d-none d-xl-table-cell" style={{ minWidth: '60px', top: 0, zIndex: 10 }}>OT Amt</th>
                      <th className="text-center fw-normal small bg-light d-none d-xl-table-cell" style={{ minWidth: '60px', top: 0, zIndex: 10 }}>Comp-Off</th>
                      <th className="text-center fw-normal small bg-light" style={{ minWidth: '70px', top: 0, zIndex: 10 }}>Avg Hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.keys(monthlyStats).length > 0 ? (
                      Object.keys(monthlyStats).map((empId, idx) => {
                        const empStats = monthlyStats[empId];
                        const empRecords = monthlyAttendance.filter(r => r.employee_id === empId);

                        return (
                          <tr key={empId}>
                            <td className="fixed-col col-1 text-center small"
                              style={{ left: 0, backgroundColor: 'white' }}>
                              {idx + 1}
                            </td>
                            <td className="fixed-col col-2 small"
                              style={{ left: '40px', backgroundColor: 'white' }}>
                              <div className="text-truncate" style={{ maxWidth: '110px' }} title={empStats.name}>
                                <span className="fw-semibold">{empStats.name}</span>
                              </div>
                              <small className="text-muted text-truncate d-block" style={{ maxWidth: '110px' }} title={empId}>
                                {empId}
                              </small>
                            </td>
                            {[...Array(daysInMonth)].map((_, day) => {
                              const dayNum = day + 1;
                              const dayRecord = empRecords.find(r => r.day === dayNum);
                              const isCurrent = isCurrentDate(dayNum);

                              let statusIcon = '-';
                              let iconClass = 'text-muted';
                              let iconStyle = {};

                              if (dayRecord) {
                                if (dayRecord.overtime_hours > 0) {
                                  statusIcon = '⏰';
                                  iconClass = 'text-success fw-bold';
                                  iconStyle = { fontSize: '14px' };
                                } else if (dayRecord.comp_off_awarded) {
                                  statusIcon = '🎉';
                                  iconClass = 'text-purple';
                                  iconStyle = { fontSize: '14px', color: '#9b59b6' };
                                } else if (dayRecord.status === 'present' || dayRecord.status === 'working') {
                                  statusIcon = '✓';
                                  iconClass = 'text-success fw-bold';
                                  iconStyle = { fontSize: '14px' };
                                } else if (dayRecord.status === 'half_day') {
                                  statusIcon = '½';
                                  iconClass = 'text-warning fw-bold';
                                  iconStyle = { fontSize: '14px' };
                                } else if (dayRecord.status === 'on_leave') {
                                  statusIcon = '🏖️';
                                  iconClass = 'text-purple';
                                  iconStyle = { fontSize: '14px' };
                                } else if (dayRecord.status === 'holiday') {
                                  statusIcon = '🎉';
                                  iconClass = 'text-warning';
                                  iconStyle = { fontSize: '14px' };
                                } else if (dayRecord.status === 'weekend') {
                                  statusIcon = <FaMoon size={12} />;
                                  iconClass = 'text-secondary';
                                } else if (dayRecord.status === 'absent') {
                                  statusIcon = '✗';
                                  iconClass = 'text-danger fw-bold';
                                  iconStyle = { fontSize: '14px' };
                                }
                              }

                              return (
                                <td key={day} className={`small text-center align-middle ${isCurrent ? 'bg-primary bg-opacity-10' : ''}`}
                                  style={{ backgroundColor: dayRecord?.is_late ? '#fff3cd' : 'transparent' }}>
                                  {dayRecord ? (
                                    <span
                                      title={dayRecord.tooltip}
                                      className={iconClass}
                                      style={{ cursor: 'pointer', ...iconStyle }}
                                    >
                                      {statusIcon}
                                      {dayRecord.is_late && <sup className="text-warning fw-bold">*</sup>}
                                    </span>
                                  ) : '-'}
                                </td>
                              );
                            })}
                            <td className="text-center"><Badge bg="success" pill>{empStats.present}</Badge></td>
                            <td className="text-center"><Badge bg="warning" pill>{empStats.half_day}</Badge></td>
                            <td className="text-center"><Badge bg="purple" pill style={{ backgroundColor: '#6f42c1' }}>{empStats.on_leave || 0}</Badge></td>
                            <td className="text-center d-none d-md-table-cell"><Badge bg="warning" pill style={{ backgroundColor: '#ffc107' }}>{empStats.holiday || 0}</Badge></td>
                            <td className="text-center d-none d-md-table-cell"><Badge bg="secondary" pill><FaMoon className="me-1" size={10} /> {empStats.weekend || 0}</Badge></td>
                            <td className="text-center"><Badge bg="danger" pill>{empStats.absent}</Badge></td>
                            <td className="text-center d-none d-lg-table-cell">
                              {empStats.late_count > 0 ? (
                                <Badge bg="warning" pill className="text-nowrap" style={{ backgroundColor: '#fd7e14' }} title={`Total: ${formatLateDisplay(empStats.total_late_minutes)}`}>
                                  ⚠️ {empStats.late_count}
                                </Badge>
                              ) : (
                                <Badge bg="secondary" pill className="text-nowrap">0</Badge>
                              )}
                            </td>
                            <td className="text-center d-none d-lg-table-cell">
                              {empStats.overtime_hours > 0 ? (
                                <Badge bg="success" pill className="text-nowrap">
                                  ⏰ {empStats.overtime_hours}h
                                </Badge>
                              ) : (
                                <Badge bg="secondary" pill className="text-nowrap">0</Badge>
                              )}
                            </td>
                            <td className="text-center d-none d-xl-table-cell">
                              {empStats.overtime_amount > 0 ? (
                                <Badge bg="info" pill className="text-nowrap">
                                  ₹{empStats.overtime_amount}
                                </Badge>
                              ) : (
                                <Badge bg="secondary" pill className="text-nowrap">₹0</Badge>
                              )}
                            </td>
                            <td className="text-center d-none d-xl-table-cell">
                              {empStats.comp_off_count > 0 ? (
                                <Badge bg="purple" pill className="text-nowrap" style={{ backgroundColor: '#9b59b6' }} title={`Total Days: ${empStats.total_comp_off_days.toFixed(1)}`}>
                                  <FaTrophy className="me-1" size={8} /> {empStats.comp_off_count}
                                </Badge>
                              ) : (
                                <Badge bg="secondary" pill className="text-nowrap">0</Badge>
                              )}
                            </td>
                            <td className="text-center">
                              <strong className="text-nowrap">{empStats.avg_hours ? formatHours(empStats.avg_hours) : '0h'}</strong>
                              <br />
                              <small className="text-muted d-none d-sm-inline">({empStats.total_hours.toFixed(1)}h / {empStats.working_days_count}d)</small>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={daysInMonth + 15} className="text-center py-4">No attendance data</td>
                      </tr>
                    )}
                  </tbody>
                </PaginatedTable>
              </div>
            )}
          </Card.Body>
        </Card>
      )}

      <div className="text-center mt-3 text-muted small">
        <p className="mb-0 d-flex flex-wrap justify-content-center gap-2">
          <span><FaClock className="me-1" /> Hover for details</span>
          <span className="d-none d-sm-inline">|</span>
          <span><FaExclamationTriangle className="me-1 text-warning" size={10} /> * late login</span>
          <span className="d-none d-sm-inline">|</span>
          <span><FaClock className="me-1 text-success" size={10} /> ⏰ Overtime</span>
          <span className="d-none d-sm-inline">|</span>
          <span><FaTrophy className="me-1 text-purple" size={10} /> 🎉 Comp-Off</span>
        </p>
      </div>
    </div>
  );
};

export default AttendanceReports;