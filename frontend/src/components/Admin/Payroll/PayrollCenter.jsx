// src/components/Admin/Payroll/PayrollCenter.jsx
// Centralized Admin Payroll module — PF / Professional Tax, attendance-driven salary
// preview, attendance correction, generation, history and exclusions in one place.
// Visual language copied from AttendanceReports.jsx (gradient hero header, pill tabs,
// stat pills) so this page reads as part of the same app, not a bolted-on tool.
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Spinner, Alert } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import {
  FaMoneyBillWave, FaSyncAlt, FaArrowLeft, FaMoneyCheckAlt, FaCalendarCheck,
  FaFileInvoiceDollar, FaUserSlash, FaHistory, FaClipboardCheck, FaFileExcel,
} from 'react-icons/fa';
import * as XLSX from 'xlsx';
import axios from '../../../config/axios';
import API_ENDPOINTS from '../../../config/api';
import { useNotification } from '../../../context/NotificationContext';
import { isPropCulture, COMPANY } from '../../../utils/salarySlipTemplate';

import PfPtTab from './PfPtTab';
import PayrollPreviewTab from './PayrollPreviewTab';
import AttendanceReviewTab from './AttendanceReviewTab';
import GenerateSalaryTab from './GenerateSalaryTab';
import GeneratedSlipsTab from './GeneratedSlipsTab';
import ExcludedEmployeesTab from './ExcludedEmployeesTab';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const currentYear = new Date().getFullYear();
const currentMonth = new Date().getMonth() + 1;
const YEARS = Array.from({ length: 5 }, (_, i) => currentYear - i);

// Cycle = 26th of previous month → 25th of selected month, mirroring salaryController.getCycleDates.
const getCycleLabel = (month, year) => {
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const fmt = (m, y, d) => `${d} ${MONTHS[m - 1].slice(0, 3)} ${y}`;
  return `${fmt(prevMonth, prevYear, 26)} – ${fmt(month, year, 25)}`;
};

// Same cycle as getCycleLabel, but returning actual Date objects + the day-by-day list —
// used by the Excel export to build one attendance column per calendar day in the cycle.
const getCycleDates = (month, year) => {
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const startDate = new Date(prevYear, prevMonth - 1, 26);
  const endDate = new Date(year, month - 1, 25);
  const days = [];
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) days.push(new Date(d));
  return { startDate, endDate, days };
};

const localDateStr = (d) => {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const TABS = [
  { key: 'pfpt', label: 'PF / Professional Tax', icon: FaMoneyCheckAlt },
  { key: 'preview', label: 'Payroll Preview', icon: FaClipboardCheck },
  { key: 'attendance', label: 'Attendance Review', icon: FaCalendarCheck },
  { key: 'generate', label: 'Generate Salary', icon: FaFileInvoiceDollar },
  { key: 'slips', label: 'Generated Slips', icon: FaHistory },
  { key: 'excluded', label: 'Excluded Employees', icon: FaUserSlash },
];

const selectStyle = {
  padding: '7px 10px', fontSize: 12, borderRadius: 8,
  border: '1px solid #e2e8f0', background: '#fff', color: '#1e293b',
  outline: 'none', cursor: 'pointer',
};

const PayrollCenter = () => {
  const navigate = useNavigate();
  const { showNotification } = useNotification();

  const [activeTab, setActiveTab] = useState('pfpt');
  const [month, setMonth] = useState(currentMonth);
  const [year, setYear] = useState(currentYear);

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Filters
  const [department, setDepartment] = useState('all');
  const [tlTeam, setTlTeam] = useState('all');
  const [managerTeam, setManagerTeam] = useState('all');
  const [search, setSearch] = useState('');

  const [tlHierarchy, setTlHierarchy] = useState([]);
  const [managerTeams, setManagerTeams] = useState([]);
  const [managerTeamMemberIds, setManagerTeamMemberIds] = useState(null); // Set or null
  const [employeeDirectory, setEmployeeDirectory] = useState({}); // employee_id -> full employee record (bank/PAN/joining fields not in the payroll record)
  const [exporting, setExporting] = useState(false);

  // ── Load payroll data for the selected period ──────────────────────────────
  const loadPayroll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get(API_ENDPOINTS.SALARY_BULK_PAYROLL(month, year));
      setRecords(res.data.records || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load payroll data');
      showNotification(err.response?.data?.message || 'Failed to load payroll data', 'danger');
    } finally {
      setLoading(false);
    }
  }, [month, year]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadPayroll(); }, [loadPayroll]);

  // ── Load team filter sources once ──────────────────────────────────────────
  useEffect(() => {
    axios.get(API_ENDPOINTS.TEAMS_HIERARCHY).then(res => {
      setTlHierarchy(res.data?.hierarchy || []);
    }).catch(() => { /* non-fatal — TL Team filter just won't populate */ });

    axios.get(API_ENDPOINTS.TEAMS).then(res => {
      setManagerTeams(res.data?.teams || []);
    }).catch(() => { /* non-fatal */ });

    axios.get(API_ENDPOINTS.EMPLOYEES).then(res => {
      const list = Array.isArray(res.data) ? res.data : Array.isArray(res.data?.data) ? res.data.data : [];
      const byId = {};
      list.forEach(e => { byId[e.employee_id] = e; });
      setEmployeeDirectory(byId);
    }).catch(() => { /* non-fatal — export will just show blank bank/PAN columns */ });
  }, []);

  // Manager Team membership is fetched on demand (team entities don't carry members inline)
  useEffect(() => {
    if (managerTeam === 'all') { setManagerTeamMemberIds(null); return; }
    axios.get(API_ENDPOINTS.TEAM_BY_ID(managerTeam)).then(res => {
      const ids = new Set((res.data?.team?.members || []).map(m => m.employee_id || m.id));
      setManagerTeamMemberIds(ids);
    }).catch(() => setManagerTeamMemberIds(new Set()));
  }, [managerTeam]);

  const departments = useMemo(
    () => ['all', ...new Set(records.map(r => r.department).filter(Boolean))],
    [records]
  );

  const tlTeamEmployeeIds = useMemo(() => {
    if (tlTeam === 'all') return null;
    const tl = tlHierarchy.find(h => h.employee_id === tlTeam);
    return tl ? new Set((tl.employees || []).map(e => e.employee_id)) : new Set();
  }, [tlTeam, tlHierarchy]);

  // Reverse lookup for export: employee_id -> "TL first last" (their team lead's name)
  const tlNameByEmployeeId = useMemo(() => {
    const map = {};
    tlHierarchy.forEach(h => {
      const tlName = `${h.first_name || ''} ${h.last_name || ''}`.trim();
      (h.employees || []).forEach(e => { map[e.employee_id] = tlName; });
    });
    return map;
  }, [tlHierarchy]);

  const filteredRecords = useMemo(() => {
    let list = records;
    if (department !== 'all') list = list.filter(r => r.department === department);
    if (tlTeamEmployeeIds) list = list.filter(r => tlTeamEmployeeIds.has(r.employee_id));
    if (managerTeamMemberIds) list = list.filter(r => managerTeamMemberIds.has(r.employee_id));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(r =>
        `${r.first_name} ${r.last_name}`.toLowerCase().includes(q) ||
        r.employee_id.toLowerCase().includes(q)
      );
    }
    return list;
  }, [records, department, tlTeamEmployeeIds, managerTeamMemberIds, search]);

  // ── Summary ─────────────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const total = records.length;
    const excluded = records.filter(r => r.exclude_from_payroll).length;
    const eligible = total - excluded;
    const pfPtDone = records.filter(r =>
      !r.exclude_from_payroll && r.pf_amount != null && r.professional_tax_amount != null
    ).length;
    const generated = records.filter(r => r.has_slip).length;
    return {
      total, eligible, excluded,
      pfPtDone, pfPtRemaining: Math.max(0, eligible - pfPtDone),
      generated,
    };
  }, [records]);

  const cycleLabel = getCycleLabel(month, year);

  // ── Export to Excel ──────────────────────────────────────────────────────────
  // Exports exactly the currently filtered/visible records (respecting Department /
  // TL Team / Manager Team / search filters above), merged with full employee fields
  // (bank/PAN/joining-date/dob) that the bulk payroll endpoint doesn't return, plus a
  // day-by-day attendance grid (P/PL/UL/A/HF/WO/HOL/BD) for the pay cycle and a per-cycle
  // late-attendance count (Total/Free/Chargeable — count only, no deduction amount).
  // Day classification mirrors calculateAttendanceSummary in
  // backend/controllers/salaryController.js so the codes agree with the payroll totals;
  // the late count reads the same attendance.late_minutes column and cycle window that
  // calculateAttendanceSummary does, and LATE_FREE_COUNT mirrors
  // backend/config/payrollCycle.js.
  // 'Other Deduction (₹)' + 'Deduction Details' come from getBulkPayroll's live sum of
  // salary_deductions (backend/controllers/salaryController.js getBulkPayroll) — every
  // line item an employee has for the cycle, not just whatever was baked into the slip
  // at generation time, so adding a deduction after generating a slip is reflected here
  // immediately. 'Slip Status' flags when that means Total Payable is now stale.
  // 'PL Left/Used (Year)' and 'Comp-Off Left/Used (Year)' come from GET /api/leaves/
  // balance-bulk — year-to-date balances against the yearly accrual quota, NOT scoped to
  // this one pay cycle (unlike 'Paid Leave Days'/'Absent Days' above, which only count this
  // cycle's days). PL is the pooled Annual/Sick/Personal/Maternity/Paternity/Bereavement
  // balance this system tracks as one bucket (see leavePolicy.js) — not per sub-type.
  const exportToExcel = async () => {
    // Employees marked "exclude from payroll" (see Excluded Employees tab) must never show up
    // in the exported sheet, even though they're kept visible (grayed out) in the on-screen
    // preview tables for admin awareness — the export is the one place this is a hard filter.
    const exportRecords = filteredRecords.filter(r => !r.exclude_from_payroll);
    if (exportRecords.length === 0) {
      showNotification('No records to export for the current filters.', 'warning');
      return;
    }
    setExporting(true);
    try {
      const monthName = MONTHS[month - 1];
      const { startDate, endDate, days: cycleDays } = getCycleDates(month, year);
      const startStr = localDateStr(startDate);
      const endStr = localDateStr(endDate);

      // `all: true` is required for an admin to see every employee's leaves (without it the
      // backend restricts the caller to their own leave records) — was missing here entirely.
      // start/end scopes the query to this cycle server-side instead of fetching every leave
      // ever recorded and filtering client-side.
      const [attRes, leaveRes, leaveBalanceRes] = await Promise.all([
        axios.get(API_ENDPOINTS.ATTENDANCE_REPORT, { params: { start: startStr, end: endStr } }),
        axios.get(API_ENDPOINTS.LEAVES, { params: { all: true, start: startStr, end: endStr } }).catch(() => ({ data: [] })),
        // Year-to-date PL/Comp-Off available + used — a different concept from the per-cycle
        // 'Paid Leave Days'/'Absent Days' columns above (which only cover this one pay cycle).
        // Non-fatal: export still works with blank balance columns if this fails.
        axios.get(API_ENDPOINTS.LEAVE_BALANCE_BULK).catch(() => ({ data: {} })),
      ]);
      const attendanceRows = attRes.data?.attendance || attRes.data || [];
      const allLeaves = Array.isArray(leaveRes.data) ? leaveRes.data : (leaveRes.data?.data || []);
      const plAvailableByEmp = leaveBalanceRes.data?.balances || {};
      const plUsedByEmp = leaveBalanceRes.data?.used || {};
      const compOffAvailableByEmp = leaveBalanceRes.data?.comp_off_balance || {};
      const compOffUsedByEmp = leaveBalanceRes.data?.comp_off_used || {};
      const approvedLeaves = allLeaves.filter(l =>
        l.status === 'approved' &&
        new Date(l.end_date || l.start_date) >= startDate &&
        new Date(l.start_date) <= endDate
      );

      // A day can have two attendance rows — a placeholder the nightly absent-check cron
      // wrote before the employee clocked in, and the real one from the regularization
      // approval. Prefer whichever one is regularized / actually has a clock_in over a
      // bare placeholder, instead of just letting array order silently decide (which one
      // ends up here was previously arbitrary — this is what caused the export to sometimes
      // read the stale placeholder instead of the approved, real record for the same day).
      const attendanceByKey = {};
      attendanceRows.forEach(rec => {
        if (!rec.attendance_date || !rec.employee_id) return;
        const key = `${rec.employee_id}_${rec.attendance_date.split('T')[0]}`;
        const existing = attendanceByKey[key];
        if (!existing || (!existing.clock_in && rec.clock_in) || (!existing.is_regularized && rec.is_regularized)) {
          attendanceByKey[key] = rec;
        }
      });

      const leaveByKey = {};
      approvedLeaves.forEach(l => {
        const ls = new Date(l.start_date);
        const le = new Date(l.end_date || l.start_date);
        for (let d = new Date(ls); d <= le; d.setDate(d.getDate() + 1)) {
          leaveByKey[`${l.employee_id}_${localDateStr(d)}`] = l;
        }
      });

      // P = Present, HF = Half Day, A = Absent, PL = Paid Leave, UL = Unpaid Leave,
      // WO = Week Off (Sat/Sun), HOL = Company holiday marked on the attendance record,
      // BD = Employee's birthday (always Present, day+month match against employees.dob —
      // takes priority over Absent even with no punch, and over a plain Paid Leave code
      // when the leave record itself is an approved Birthday leave).
      const isBirthday = (dob, date) => {
        if (!dob) return false;
        const d = new Date(dob);
        return d.getMonth() === date.getMonth() && d.getDate() === date.getDate();
      };
      const dayCodeFor = (employeeId, date, joiningDate, dob) => {
        if (joiningDate && date < joiningDate) return '';
        const dateStr = localDateStr(date);
        const leave = leaveByKey[`${employeeId}_${dateStr}`];
        const birthday = isBirthday(dob, date);
        if (leave?.leave_type === 'Birthday' || (birthday && !leave)) return 'BD';
        if (leave) return leave.leave_type === 'Unpaid' ? 'UL' : 'PL';
        if (birthday) return 'BD';
        const dow = date.getDay();
        if (dow === 0 || dow === 6) return 'WO';
        const att = attendanceByKey[`${employeeId}_${dateStr}`];
        if (!att) return 'A';
        // A regularized day always shows as Present on the employee's own Attendance page
        // (an admin approved it) — the Excel export must agree with what the employee/admin
        // actually sees there, not silently recompute a stricter Half Day/Absent from hours.
        if (att.is_regularized) return 'P';
        const status = (att.status || '').toLowerCase();
        if (status === 'present' || status === 'working') return 'P';
        if (status === 'half_day') return 'HF';
        // Two holiday conventions can appear here: an admin-calendar Week Off/Holiday mark
        // is a real DB row with status='absent' + is_holiday=true; a company holiday applied
        // via the Attendance Reports "HOL" button (getAttendanceReport override/synthesis,
        // see companyHolidayService.js) carries status='holiday' directly (and has no
        // clock_in/out at all, real or otherwise). Both must export as HOL, never Absent.
        if (status === 'holiday') return 'HOL';
        if (status === 'absent') return att.is_holiday ? 'HOL' : 'A';
        if (att.clock_in && !att.clock_out) return 'P';
        if (att.clock_in && att.clock_out) {
          const mins = Number(att.total_minutes) || 0;
          if (mins >= 540) return 'P';
          if (mins >= 300) return 'HF';
          return 'A';
        }
        return 'A';
      };

      // Late count per employee for the cycle — mirrors backend/config/payrollCycle.js
      // LATE_FREE_COUNT and reads the exact same attendanceRows/late_minutes signal
      // salaryController.calculateAttendanceSummary uses, so this can't disagree with
      // payroll. Informational only — no deduction amount, HR applies that manually.
      const LATE_FREE_COUNT = 3;
      const cycleDateStrs = new Set(cycleDays.map(d => localDateStr(d)));
      const lateCountByEmployee = {};
      attendanceRows.forEach(rec => {
        const dateStr = rec.attendance_date?.split('T')[0];
        if (!rec.employee_id || !dateStr || !cycleDateStrs.has(dateStr)) return;
        if (rec.is_late || Number(rec.late_minutes) > 0) {
          lateCountByEmployee[rec.employee_id] = (lateCountByEmployee[rec.employee_id] || 0) + 1;
        }
      });

      const dayColumnLabels = cycleDays.map(d => `${String(d.getDate()).padStart(2, '0')}-${MONTHS[d.getMonth()].slice(0, 3)}`);

      const rows = exportRecords.map((r, i) => {
        const emp = employeeDirectory[r.employee_id] || {};
        const co = isPropCulture(r) ? COMPANY.pc : COMPANY.b2b;
        const payable = r.final_payable_salary != null
          ? r.final_payable_salary
          : (r.net_salary != null ? r.net_salary : r.monthly_salary);
        const joiningDate = emp.joining_date ? new Date(emp.joining_date) : null;

        const row = {
          'Sr No':                  i + 1,
          'Employee ID':            r.employee_id || '',
          'Employee Name':          `${r.first_name || ''} ${r.last_name || ''}`.trim(),
          'Company':                co.name,
          'Department':             r.department || '',
          'Designation':            r.designation || '',
          'Team Manager Name':      tlNameByEmployeeId[r.employee_id] || emp.reporting_manager || '',
          'Date of Joining':        emp.joining_date ? new Date(emp.joining_date).toLocaleDateString('en-IN') : '',
          'Pay Cycle':              r.cycle_start_date && r.cycle_end_date
            ? `${new Date(r.cycle_start_date).toLocaleDateString('en-IN')} - ${new Date(r.cycle_end_date).toLocaleDateString('en-IN')}`
            : cycleLabel,
        };

        cycleDays.forEach((d, di) => {
          row[dayColumnLabels[di]] = dayCodeFor(r.employee_id, d, joiningDate, emp.dob);
        });

        const totalLate = lateCountByEmployee[r.employee_id] || 0;

        Object.assign(row, {
          'Working Days':           r.total_working_days ?? '',
          'Present Days':           r.present_days ?? '',
          'Half Days':              r.half_days ?? '',
          'Paid Leave Days':        r.paid_leave_days ?? '',
          'Unpaid Leave Days':      r.unpaid_leave_days ?? '',
          'Total Late':             totalLate,
          'Free Late':              Math.min(totalLate, LATE_FREE_COUNT),
          'Chargeable Late':        Math.max(0, totalLate - LATE_FREE_COUNT),
          'Absent Days':            r.absent_days ?? '',
          // Year-to-date balances (not cycle-scoped, unlike the columns above) — how many
          // PL/Comp-Off days this employee has left and used against their yearly quota.
          'PL Left (Year)':         plAvailableByEmp[r.employee_id] ?? '',
          'PL Used (Year)':         plUsedByEmp[r.employee_id] ?? '',
          'Comp-Off Left':          compOffAvailableByEmp[r.employee_id] ?? (emp.comp_off_balance ?? ''),
          'Comp-Off Used (Year)':   compOffUsedByEmp[r.employee_id] ?? '',
          'Monthly Salary (₹)':     Number(r.monthly_salary || 0).toFixed(2),
          'Earned Salary (₹)':      r.basic_salary != null ? Number(r.basic_salary).toFixed(2) : '',
          'Overtime (₹)':           Number(r.overtime_amount || 0).toFixed(2),
          'PF Amount (₹)':          r.pf_amount != null ? Number(r.pf_amount).toFixed(2) : '',
          'Professional Tax (₹)':   r.professional_tax_amount != null ? Number(r.professional_tax_amount).toFixed(2) : '',
          'Other Deduction (₹)':    Number(r.custom_deduction || 0).toFixed(2),
          'Deduction Details':      (r.deduction_items && r.deduction_items.length)
            ? r.deduction_items.map(d => `${d.reason || 'No reason'}: ₹${Number(d.amount || 0).toFixed(2)}`).join('; ')
            : '',
          'Total Payable Amount (₹)': Number(payable || 0).toFixed(2),
          'Slip Status':            (r.has_slip ? (r.is_paid ? 'Paid' : 'Generated - Pending Payment') : 'Not Generated')
            + (r.custom_deduction_stale ? ' — deductions changed since slip was generated, regenerate to update Total Payable' : ''),
          'Bank Account Number':    emp.account_number || '',
          'Bank Name':              emp.branch_name || '',
          'IFSC Code':              emp.ifsc_code || '',
          'PAN Number':             emp.pan_number || '',
        });

        return row;
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = Object.keys(rows[0] || {}).map(k => ({ wch: dayColumnLabels.includes(k) ? 6 : Math.max(k.length + 2, 14) }));

      const legendWs = XLSX.utils.aoa_to_sheet([
        ['Code', 'Meaning'],
        ['P', 'Present'],
        ['HF', 'Half Day'],
        ['A', 'Absent'],
        ['PL', 'Paid Leave'],
        ['UL', 'Unpaid Leave'],
        ['WO', 'Week Off (Saturday/Sunday)'],
        ['HOL', 'Company Holiday'],
        ['BD', "Employee's Birthday (counted as Present)"],
        [],
        ['Total Late', 'Number of late clock-ins in this pay cycle'],
        ['Free Late', `First ${LATE_FREE_COUNT} late occurrences per cycle — no deduction`],
        ['Chargeable Late', 'Late occurrences beyond the free allowance — HR decides the deduction manually'],
      ]);

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `Payroll_${monthName}_${year}`.slice(0, 31));
      XLSX.utils.book_append_sheet(wb, legendWs, 'Legend');
      XLSX.writeFile(wb, `Payroll_Export_${monthName}_${year}.xlsx`);
      showNotification(`Exported ${rows.length} employee record(s) to Excel.`, 'success');
    } catch {
      showNotification('Failed to export payroll data.', 'danger');
    } finally {
      setExporting(false);
    }
  };

  const tabProps = {
    month, year, cycleLabel,
    records: filteredRecords,
    allRecords: records,
    loading,
    refetch: loadPayroll,
  };

  return (
    <div className="p-2 p-md-3 p-lg-4" style={{ background: "#f5f7fa", minHeight: '100vh' }}>

      {/* ── Hero header ──────────────────────────────────────────────────────── */}
      <div style={{
        background: "#eef4fb",
        border: '1px solid #e2e8f0', borderRadius: 20, padding: '18px 20px',
        marginBottom: 16, boxShadow: '0 10px 30px rgba(15, 23, 42, 0.05)',
      }}>
        <div className="d-flex flex-column flex-lg-row justify-content-between align-items-start align-items-lg-center gap-3">
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: "#1f4e79", marginBottom: 4 }}>
              Payroll Workspace
            </div>
            <h4 className="mb-1 fw-bold" style={{ color: '#0f172a', margin: 0 }}>
              PF / Professional Tax, attendance-driven salary, and generated slips — one place
            </h4>
            <div style={{ color: '#64748b', fontSize: 13 }}>
              Cycle: <b>{cycleLabel}</b>
            </div>
          </div>
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <button
              className="btn btn-success btn-sm d-flex align-items-center gap-1"
              disabled={exporting || filteredRecords.length === 0}
              onClick={exportToExcel}
              title="Export the currently filtered employees to Excel"
            >
              {exporting
                ? <><Spinner animation="border" size="sm" style={{ width: 11, height: 11 }} className="me-1" /> Exporting…</>
                : <><FaFileExcel size={11} /> Export Excel</>}
            </button>
            <button className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1" disabled={loading} onClick={loadPayroll}>
              {loading
                ? <><Spinner animation="border" size="sm" style={{ width: 11, height: 11 }} className="me-1" /> Refreshing…</>
                : <><FaSyncAlt size={11} /> Refresh</>}
            </button>
            <button className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1" onClick={() => navigate(-1)}>
              <FaArrowLeft size={12} /> Back
            </button>
          </div>
        </div>

        {/* ── Filter bar ─────────────────────────────────────────────────────── */}
        <div className="d-flex flex-wrap align-items-center gap-2" style={{ marginTop: 14 }}>
          <select value={year} onChange={e => setYear(Number(e.target.value))} style={selectStyle}>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={month} onChange={e => setMonth(Number(e.target.value))} style={selectStyle}>
            {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
          <select value={department} onChange={e => setDepartment(e.target.value)} style={selectStyle}>
            <option value="all">All Departments</option>
            {departments.filter(d => d !== 'all').map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={tlTeam} onChange={e => setTlTeam(e.target.value)} style={selectStyle}>
            <option value="all">All TL Teams</option>
            {tlHierarchy.map(h => (
              <option key={h.employee_id} value={h.employee_id}>{h.first_name} {h.last_name}'s Team</option>
            ))}
          </select>
          <select value={managerTeam} onChange={e => setManagerTeam(e.target.value)} style={selectStyle}>
            <option value="all">All Manager Teams</option>
            {managerTeams.map(t => <option key={t.id} value={t.id}>{t.team_name}</option>)}
          </select>
          <input
            type="text" placeholder="Search employee…" value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ ...selectStyle, cursor: 'text', minWidth: 160 }}
          />
        </div>

        {/* ── Tab switcher ───────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14,
          padding: 8, borderRadius: 16, background: '#ffffff', border: '1px solid #e2e8f0',
        }}>
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  border: 'none', borderRadius: 12, padding: '10px 14px', fontSize: 13, fontWeight: 700,
                  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8,
                  color: isActive ? '#fff' : '#334155',
                  background: isActive ? "#1f4e79" : '#f8fafc',
                  boxShadow: isActive ? '0 8px 20px rgba(79, 70, 229, 0.18)' : 'none',
                  transition: 'all 0.2s ease',
                }}
              >
                <Icon size={12} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {error && <Alert variant="danger" onClose={() => setError('')} dismissible className="py-2"><small>{error}</small></Alert>}

      {/* ── Summary pills ────────────────────────────────────────────────────── */}
      <div className="d-flex flex-wrap gap-2 mb-3">
        {[
          { label: 'Total Employees', value: summary.total, bg: "#eef4fb", color: "#1f4e79" },
          { label: 'Eligible', value: summary.eligible, bg: 'rgba(22,163,74,.1)', color: '#16a34a' },
          { label: 'Excluded', value: summary.excluded, bg: 'rgba(239,68,68,.1)', color: '#ef4444' },
          { label: 'PF / Professional Tax Completed', value: summary.pfPtDone, bg: 'rgba(3,105,161,.1)', color: '#0369a1' },
          { label: 'PF / Professional Tax Remaining', value: summary.pfPtRemaining, bg: 'rgba(245,158,11,.12)', color: '#d97706' },
          { label: 'Slips Generated', value: summary.generated, bg: 'rgba(139,92,246,.1)', color: '#7c3aed' },
        ].map(p => (
          <div key={p.label} style={{ background: p.bg, color: p.color, borderRadius: 999, padding: '10px 18px', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>{p.label}</span>
            <span style={{ fontWeight: 800 }}>{p.value}</span>
          </div>
        ))}
      </div>

      {/* ── Active tab ───────────────────────────────────────────────────────── */}
      {loading && records.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, background: '#fff', borderRadius: 16 }}>
          <Spinner animation="border" style={{ color: "#1f4e79" }} />
          <div style={{ marginTop: 14, fontSize: 13, color: '#94a3b8' }}>Loading payroll data…</div>
        </div>
      ) : (
        <>
          {activeTab === 'pfpt' && <PfPtTab {...tabProps} />}
          {activeTab === 'preview' && <PayrollPreviewTab {...tabProps} />}
          {activeTab === 'attendance' && <AttendanceReviewTab {...tabProps} />}
          {activeTab === 'generate' && <GenerateSalaryTab {...tabProps} tlHierarchy={tlHierarchy} managerTeams={managerTeams} />}
          {activeTab === 'slips' && <GeneratedSlipsTab {...tabProps} />}
          {activeTab === 'excluded' && <ExcludedEmployeesTab {...tabProps} />}
        </>
      )}

      {records.length === 0 && !loading && (
        <div style={{ textAlign: 'center', padding: 60, background: '#fff', borderRadius: 16, color: '#94a3b8' }}>
          <FaMoneyBillWave size={32} style={{ marginBottom: 12, opacity: 0.3 }} />
          <div style={{ fontSize: 14 }}>No active employees found for this period</div>
        </div>
      )}
    </div>
  );
};

export default PayrollCenter;
