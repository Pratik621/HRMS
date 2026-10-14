// src/components/Admin/AttendanceCalendar.jsx
// Attendance Calendar — embedded inside the Payroll tab of EmployeeProfileView
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Spinner } from 'react-bootstrap';
import {
  FaCalendarAlt, FaCheckCircle, FaTimesCircle, FaUmbrellaBeach,
  FaSun, FaStopwatch, FaLeaf, FaSave, FaChevronLeft, FaChevronRight,
  FaExclamationCircle, FaGift, FaExchangeAlt
} from 'react-icons/fa';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';
import { useNotification } from '../../context/NotificationContext';

// ── Constants ─────────────────────────────────────────────────────────────────
const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

const STATUSES = [
  { code: 'present',    label: 'Present',              short: 'P',  color: '#16a34a', bg: '#dcfce7', dbStatus: 'present',  isHoliday: false, holidayName: null,   attType: null },
  { code: 'absent',     label: 'Absent',               short: 'A',  color: '#dc2626', bg: '#fee2e2', dbStatus: 'absent',   isHoliday: false, holidayName: null,   attType: null },
  { code: 'week_off',   label: 'Weekly Off',           short: 'WO', color: '#6b7280', bg: '#f3f4f6', dbStatus: 'absent',   isHoliday: true,  holidayName: 'Week Off', attType: null },
  { code: 'holiday',    label: 'Holiday',               short: 'H',  color: "#1f4e79", bg: '#dbeafe', dbStatus: 'absent',   isHoliday: true,  holidayName: 'Holiday',  attType: null },
  { code: 'half_day',   label: 'Half Day',              short: 'HD', color: '#d97706', bg: '#fef3c7', dbStatus: 'half_day', isHoliday: false, holidayName: null,   attType: null },
  { code: 'leave',      label: 'Leave',                 short: 'L',  color: '#7c3aed', bg: '#ede9fe', dbStatus: 'absent',   isHoliday: false, holidayName: 'Leave', attType: null },
  { code: 'paid_leave', label: 'Present (Paid Leave)',  short: 'PL', color: '#0891b2', bg: '#cffafe', dbStatus: 'present',  isHoliday: false, holidayName: null,   attType: 'paid_leave', requiresBalance: 'paidLeave' },
  { code: 'comp_off',   label: 'Present (Comp Off)',    short: 'CO', color: '#c026d3', bg: '#fae8ff', dbStatus: 'present',  isHoliday: false, holidayName: null,   attType: 'comp_off',   requiresBalance: 'compOff' },
  { code: 'birthday_leave', label: 'Present (Birthday Leave)', short: 'BL', color: '#ca8a04', bg: '#fef9c3', dbStatus: 'present', isHoliday: false, holidayName: null, attType: 'birthday_leave' },
];

// Resolve a DB record → internal code
const resolveCode = (rec) => {
  if (!rec) return null;
  const s = rec.status;
  const type = rec.attendance_type;
  const hn = (rec.holiday_name || '').toLowerCase();
  if (type === 'paid_leave') return 'paid_leave';
  if (type === 'comp_off') return 'comp_off';
  if (type === 'birthday_leave') return 'birthday_leave';
  if (s === 'present') return 'present';
  if (s === 'half_day') return 'half_day';
  if (hn.includes('week off') || hn.includes('weekly off')) return 'week_off';
  if (hn.includes('holiday')) return 'holiday';
  if (hn.includes('leave')) return 'leave';
  if (s === 'absent') return 'absent';
  return null;
};

const getStatus = (code) => STATUSES.find(s => s.code === code) || null;

// ── Tiny helpers ──────────────────────────────────────────────────────────────
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const buildCalendar = (year, month) => {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  return cells;
};

const toDateStr = (year, month, day) =>
  `${year}-${String(month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;

// ── Skeleton loader ───────────────────────────────────────────────────────────
const Skeleton = ({ w = '100%', h = 16, r = 6, mb = 0 }) => (
  <div style={{
    width: w, height: h, borderRadius: r, background: '#e5e7eb',
    marginBottom: mb, animation: 'pulse 1.4s ease-in-out infinite',
  }} />
);

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
// initialMonth is 1-based (matches the rest of the app's month convention) — converted to
// the internal 0-based selMonth here. Lets callers (e.g. the Payroll module) open the
// calendar on the payroll cycle's month instead of always defaulting to today.
const AttendanceCalendar = ({ employee, onAttendanceSaved, initialMonth, initialYear }) => {
  const { showNotification } = useNotification();
  const today = new Date();

  const [selYear,  setSelYear]  = useState(initialYear || today.getFullYear());
  const [selMonth, setSelMonth] = useState(initialMonth ? initialMonth - 1 : today.getMonth()); // 0-based

  // attendanceMap: { 'YYYY-MM-DD': code }
  const [attendanceMap, setAttendanceMap] = useState({});
  const [loading,  setLoading]  = useState(false);
  const [saving,   setSaving]   = useState({}); // { 'YYYY-MM-DD': true }
  const [unsaved,  setUnsaved]  = useState({}); // { 'YYYY-MM-DD': code }
  const [popover,  setPopover]  = useState(null); // { dateStr, x, y }
  const [saveAllLoading, setSaveAllLoading] = useState(false);
  const [paidLeaveBalance, setPaidLeaveBalance] = useState(0);
  const [compOffBalance, setCompOffBalance] = useState(0);

  const popoverRef = useRef(null);
  const empId = employee?.employee_id;

  // ── Fetch Paid Leave / Comp Off balances ─────────────────────────────────
  const fetchBalances = useCallback(async () => {
    if (!empId) return;
    try {
      const [leaveRes, compRes] = await Promise.all([
        axios.get(API_ENDPOINTS.LEAVE_BALANCE(empId)),
        axios.get(API_ENDPOINTS.COMP_OFF_BALANCE(empId)),
      ]);
      setPaidLeaveBalance(parseFloat(leaveRes.data?.available || 0));
      setCompOffBalance(parseFloat(compRes.data?.comp_off_balance || 0));
    } catch {
      // Non-blocking — dropdown just falls back to showing 0
    }
  }, [empId]);

  useEffect(() => { fetchBalances(); }, [fetchBalances]);

  const balanceFor = { paidLeave: paidLeaveBalance, compOff: compOffBalance };

  // ── Fetch attendance for selected month ──────────────────────────────────
  const fetchAttendance = useCallback(async () => {
    if (!empId) return;
    setLoading(true);
    setUnsaved({});
    try {
      const start = toDateStr(selYear, selMonth, 1);
      const daysInMonth = new Date(selYear, selMonth + 1, 0).getDate();
      const end = toDateStr(selYear, selMonth, daysInMonth);
      const url = API_ENDPOINTS.ATTENDANCE_EMPLOYEE_REPORT(empId, start, end);
      const res = await axios.get(url);
      const records = res.data?.attendance || [];
      const map = {};
      records.forEach(rec => {
        const ds = rec.attendance_date?.split('T')[0];
        if (ds) map[ds] = resolveCode(rec);
      });
      setAttendanceMap(map);
    } catch {
      showNotification('Failed to load attendance data', 'danger');
    } finally {
      setLoading(false);
    }
  }, [empId, selYear, selMonth]);

  useEffect(() => { fetchAttendance(); }, [fetchAttendance]);

  // ── Close popover on outside click ───────────────────────────────────────
  useEffect(() => {
    if (!popover) return;
    const handler = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setPopover(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [popover]);

  // ── Save single day ───────────────────────────────────────────────────────
  const saveDay = useCallback(async (dateStr, code) => {
    if (!empId) return;
    const st = getStatus(code);
    if (!st) return;
    setSaving(s => ({ ...s, [dateStr]: true }));
    try {
      if (code === 'paid_leave' || code === 'comp_off') {
        // Admin mark endpoint handles balance validation + deduction atomically
        await axios.post(API_ENDPOINTS.ATTENDANCE_ADMIN_MARK, {
          employee_id: empId,
          attendance_date: dateStr,
          status_code: code,
        });
        await fetchBalances(); // Refresh displayed balance after deduction
      } else {
        const codeMap = { present: 'P', absent: 'A', half_day: 'HD', week_off: 'WO', holiday: 'H', leave: 'L' };
        await axios.post(API_ENDPOINTS.ATTENDANCE_IMPORT, {
          month: selMonth + 1,
          year: selYear,
          records: [{ employee_id: empId, dates: { [dateStr]: codeMap[code] || 'A' } }]
        });
      }
      setAttendanceMap(m => ({ ...m, [dateStr]: code }));
      setUnsaved(u => { const n = { ...u }; delete n[dateStr]; return n; });
      showNotification(`✅ ${dateStr} saved as ${st.label}`, 'success');
      if (onAttendanceSaved) onAttendanceSaved(selMonth + 1, selYear);
    } catch (err) {
      const msg = err.response?.data?.message || `Failed to save ${dateStr}`;
      showNotification(msg, 'danger');
    } finally {
      setSaving(s => { const n = { ...s }; delete n[dateStr]; return n; });
    }
  }, [empId, selMonth, selYear, showNotification, fetchBalances]);

  // ── Save all unsaved changes at once ─────────────────────────────────────
  const saveAll = useCallback(async () => {
    if (!empId || Object.keys(unsaved).length === 0) return;
    setSaveAllLoading(true);
    const codeMap = { present: 'P', absent: 'A', half_day: 'HD', week_off: 'WO', holiday: 'H', leave: 'L' };
    const bulkDates = {};
    const balanceDays = []; // PL/CO — sequential, balance deducted per call
    Object.entries(unsaved).forEach(([ds, code]) => {
      if (code === 'paid_leave' || code === 'comp_off') balanceDays.push([ds, code]);
      else bulkDates[ds] = codeMap[code] || 'A';
    });
    try {
      if (Object.keys(bulkDates).length > 0) {
        await axios.post(API_ENDPOINTS.ATTENDANCE_IMPORT, {
          month: selMonth + 1, year: selYear,
          records: [{ employee_id: empId, dates: bulkDates }]
        });
      }
      for (const [ds, code] of balanceDays) {
        await axios.post(API_ENDPOINTS.ATTENDANCE_ADMIN_MARK, {
          employee_id: empId, attendance_date: ds, status_code: code,
        });
      }
      setAttendanceMap(m => ({ ...m, ...unsaved }));
      setUnsaved({});
      const total = Object.keys(bulkDates).length + balanceDays.length;
      showNotification(`✅ ${total} day(s) saved successfully`, 'success');
      if (balanceDays.length > 0) await fetchBalances();
      if (onAttendanceSaved) onAttendanceSaved(selMonth + 1, selYear);
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to save changes';
      showNotification(msg, 'danger');
    } finally {
      setSaveAllLoading(false);
    }
  }, [empId, unsaved, selMonth, selYear, showNotification, fetchBalances]);

  // ── Handle day click ──────────────────────────────────────────────────────
  const handleDayClick = (e, dateStr) => {
    const isFuture = new Date(dateStr) > today;
    if (isFuture) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    setPopover({ dateStr, x: rect.left, y: rect.bottom + scrollTop + 6 });
  };

  // ── Status select from popover ────────────────────────────────────────────
  const handleStatusSelect = async (code) => {
    const { dateStr } = popover;
    setPopover(null);
    // Mark as unsaved first for instant UI feedback
    setUnsaved(u => ({ ...u, [dateStr]: code }));
    // Then immediately save
    await saveDay(dateStr, code);
  };

  // ── Month nav ─────────────────────────────────────────────────────────────
  const prevMonth = () => {
    if (selMonth === 0) { setSelYear(y => y - 1); setSelMonth(11); }
    else setSelMonth(m => m - 1);
  };
  const nextMonth = () => {
    const now = new Date();
    if (selYear > now.getFullYear() || (selYear === now.getFullYear() && selMonth >= now.getMonth())) return;
    if (selMonth === 11) { setSelYear(y => y + 1); setSelMonth(0); }
    else setSelMonth(m => m + 1);
  };

  // ── Effective map = saved + unsaved ──────────────────────────────────────
  const effectiveMap = { ...attendanceMap, ...unsaved };

  // ── Summary counts ────────────────────────────────────────────────────────
  const summary = (() => {
    const counts = { present: 0, absent: 0, week_off: 0, holiday: 0, half_day: 0, leave: 0, paid_leave: 0, comp_off: 0 };
    Object.values(effectiveMap).forEach(code => { if (code && counts[code] !== undefined) counts[code]++; });
    const payable = counts.present + counts.holiday + counts.week_off + Math.floor(counts.half_day / 2) + counts.leave + counts.paid_leave + counts.comp_off;
    return { ...counts, payable };
  })();

  const cells = buildCalendar(selYear, selMonth);
  const todayStr = today.toISOString().split('T')[0];
  const isCurrentMonth = selYear === today.getFullYear() && selMonth === today.getMonth();
  const isNextDisabled = selYear > today.getFullYear() || (selYear === today.getFullYear() && selMonth >= today.getMonth());
  const unsavedCount = Object.keys(unsaved).length;

  // ── Summary card data ─────────────────────────────────────────────────────
  const summaryCards = [
    { label: 'Present',    value: summary.present,    color: '#16a34a', bg: '#dcfce7', icon: <FaCheckCircle size={14} /> },
    { label: 'Absent',     value: summary.absent,     color: '#dc2626', bg: '#fee2e2', icon: <FaTimesCircle size={14} /> },
    { label: 'Weekly Off', value: summary.week_off,   color: '#6b7280', bg: '#f3f4f6', icon: <FaSun size={14} /> },
    { label: 'Holiday',    value: summary.holiday,    color: "#1f4e79", bg: '#dbeafe', icon: <FaCalendarAlt size={14} /> },
    { label: 'Half Day',   value: summary.half_day,   color: '#d97706', bg: '#fef3c7', icon: <FaStopwatch size={14} /> },
    { label: 'Leave',      value: summary.leave,      color: '#7c3aed', bg: '#ede9fe', icon: <FaUmbrellaBeach size={14} /> },
    { label: 'Paid Leave', value: summary.paid_leave, color: '#0891b2', bg: '#cffafe', icon: <FaGift size={14} />, sub: `Bal: ${paidLeaveBalance.toFixed(1)}` },
    { label: 'Comp Off',   value: summary.comp_off,   color: '#c026d3', bg: '#fae8ff', icon: <FaExchangeAlt size={14} />, sub: `Bal: ${compOffBalance.toFixed(1)}` },
    { label: 'Payable Days', value: summary.payable,  color: '#0ea5e9', bg: '#e0f2fe', icon: <FaLeaf size={14} />, bold: true },
  ];

  return (
    <>
      {/* pulse animation */}
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        .att-day:hover { box-shadow: 0 0 0 2px #6366f1 !important; cursor: pointer; }
        .att-day-future { opacity: 0.4; cursor: default !important; }
      `}</style>

      <div style={{ marginTop: 24 }}>

        {/* ── Header bar ─────────────────────────────────────────────────── */}
        <div style={{
          background: '#fff', borderRadius: 12, padding: '16px 20px',
          boxShadow: '0 1px 8px rgba(0,0,0,0.06)', marginBottom: 16,
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12
        }}>
          {/* Icon + title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "#dce3eb", display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FaCalendarAlt size={14} color="#1f4e79" />
            </div>
            <span style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>Attendance Calendar</span>
          </div>

          {/* Month navigator */}
          <div className="hrms-responsive-toolbar" style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
            <button onClick={prevMonth} style={navBtn}>
              <FaChevronLeft size={10} />
            </button>

            {/* Month dropdown */}
            <select
              value={selMonth}
              onChange={e => setSelMonth(+e.target.value)}
              style={selectStyle}
            >
              {MONTHS.map((m, i) => (
                <option key={i} value={i} disabled={
                  selYear === today.getFullYear() && i > today.getMonth()
                }>{m}</option>
              ))}
            </select>

            {/* Year dropdown */}
            <select
              value={selYear}
              onChange={e => setSelYear(+e.target.value)}
              style={selectStyle}
            >
              {Array.from({ length: today.getFullYear() - 2024 + 1 }, (_, i) => 2024 + i).map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>

            <button onClick={nextMonth} disabled={isNextDisabled} style={{ ...navBtn, opacity: isNextDisabled ? 0.3 : 1 }}>
              <FaChevronRight size={10} />
            </button>
          </div>

          {/* Unsaved indicator + Save All */}
          {unsavedCount > 0 && (
            <div className="hrms-responsive-toolbar" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#d97706', fontWeight: 600 }}>
                <FaExclamationCircle size={11} /> {unsavedCount} unsaved
              </span>
              <button
                onClick={saveAll}
                disabled={saveAllLoading}
                style={{ background: "#1f4e79", color: '#fff', border: 'none', borderRadius: 7, padding: '6px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
              >
                {saveAllLoading ? <Spinner animation="border" size="sm" style={{ width: 10, height: 10 }} /> : <FaSave size={10} />}
                Save All
              </button>
            </div>
          )}
        </div>

        {/* ── Summary cards ──────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
          {summaryCards.map(c => (
            <div key={c.label} style={{
              flex: '1 1 100px', minWidth: 100, background: '#fff', borderRadius: 10,
              padding: '10px 14px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
              borderTop: `3px solid ${c.color}`
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <div style={{ width: 24, height: 24, borderRadius: 6, background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.color }}>
                  {c.icon}
                </div>
                <span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>{c.label}</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: c.bold ? 900 : 800, color: c.bold ? c.color : '#111827', lineHeight: 1 }}>
                {loading ? <Skeleton w={32} h={20} /> : c.value}
              </div>
              {c.sub && <div style={{ fontSize: 10, color: c.color, fontWeight: 600, marginTop: 2 }}>{c.sub}</div>}
            </div>
          ))}
        </div>

        {/* ── Calendar grid ──────────────────────────────────────────────── */}
        <div style={{ background: '#fff', borderRadius: 12, padding: '18px 16px', boxShadow: '0 1px 8px rgba(0,0,0,0.06)' }}>

          {/* Day headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 6 }}>
            {DAYS.map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: d === 'Sun' || d === 'Sat' ? '#9ca3af' : '#374151', padding: '4px 0', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                {d}
              </div>
            ))}
          </div>

          {/* Loading skeleton */}
          {loading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
              {Array.from({ length: 35 }).map((_, i) => (
                <div key={i} style={{ borderRadius: 8, height: 64, background: '#f3f4f6', animation: 'pulse 1.4s ease-in-out infinite' }} />
              ))}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
              {cells.map((day, i) => {
                if (!day) return <div key={i} />;
                const dateStr = toDateStr(selYear, selMonth, day);
                const code = effectiveMap[dateStr] || null;
                const st = code ? getStatus(code) : null;
                const isToday = dateStr === todayStr;
                const isFuture = new Date(dateStr) > today;
                const isSaving = saving[dateStr];
                const isUnsavedDay = unsaved[dateStr];
                const dow = new Date(dateStr).getDay();
                const isWeekend = dow === 0 || dow === 6;

                return (
                  <div
                    key={i}
                    className={`att-day${isFuture ? ' att-day-future' : ''}`}
                    onClick={isFuture ? undefined : e => handleDayClick(e, dateStr)}
                    style={{
                      borderRadius: 8,
                      padding: '6px 4px',
                      minHeight: 64,
                      background: st ? st.bg : isWeekend ? '#fafafa' : '#f9fafb',
                      border: isToday ? '2px solid #6366f1' : isUnsavedDay ? '2px dashed #d97706' : '1px solid #e5e7eb',
                      position: 'relative',
                      transition: 'box-shadow 0.15s',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
                    }}
                  >
                    {/* Date number */}
                    <div style={{
                      width: 22, height: 22, borderRadius: '50%',
                      background: isToday ? "#1f4e79" : 'transparent',
                      color: isToday ? '#fff' : isWeekend ? '#9ca3af' : '#374151',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: isToday ? 800 : 600,
                    }}>
                      {day}
                    </div>

                    {/* Status badge */}
                    {isSaving ? (
                      <Spinner animation="border" size="sm" style={{ width: 14, height: 14, color: "#1f4e79" }} />
                    ) : st ? (
                      <span style={{
                        fontSize: 10, fontWeight: 800, color: st.color,
                        background: 'rgba(255,255,255,0.7)', borderRadius: 4,
                        padding: '1px 4px', letterSpacing: 0.2
                      }}>
                        {st.short}
                      </span>
                    ) : (
                      <span style={{ fontSize: 9, color: '#d1d5db' }}>—</span>
                    )}

                    {/* Unsaved dot */}
                    {isUnsavedDay && !isSaving && (
                      <div style={{ position: 'absolute', top: 3, right: 3, width: 6, height: 6, borderRadius: '50%', background: '#d97706' }} />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Legend */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 14, paddingTop: 12, borderTop: '1px solid #f3f4f6' }}>
            {STATUSES.filter(s => !['leave', 'paid_leave', 'comp_off', 'birthday_leave'].includes(s.code)).map(s => (
              <div key={s.code} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 16, height: 16, borderRadius: 4, background: s.bg, border: `1px solid ${s.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 8, fontWeight: 800, color: s.color }}>{s.short}</span>
                </div>
                <span style={{ fontSize: 10, color: '#6b7280' }}>{s.label}</span>
              </div>
            ))}
            <div style={{ marginLeft: 'auto', fontSize: 10, color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 4 }}>
              <FaCalendarAlt size={9} /> Click any day to edit
            </div>
          </div>
        </div>
      </div>

      {/* ── Popover status picker (portal-style fixed) ────────────────────── */}
      {popover && (
        <div
          ref={popoverRef}
          style={{
            position: 'fixed',
            top: popover.y - window.scrollY,
            left: Math.min(popover.x, window.innerWidth - 220),
            zIndex: 9999,
            background: '#fff',
            borderRadius: 10,
            boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
            padding: '6px',
            minWidth: 200,
            border: '1px solid #e5e7eb',
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', padding: '6px 8px 8px', borderBottom: '1px solid #f3f4f6', marginBottom: 4 }}>
            {popover.dateStr} — Select Status
          </div>
          {STATUSES.filter(s => !['leave', 'paid_leave', 'comp_off', 'birthday_leave'].includes(s.code)).map(s => {
            const availBal = s.requiresBalance ? balanceFor[s.requiresBalance] : null;
            const noBalance = availBal !== null && availBal < 1;
            const isSelected = effectiveMap[popover.dateStr] === s.code;
            return (
              <button
                key={s.code}
                onClick={noBalance ? undefined : () => handleStatusSelect(s.code)}
                disabled={noBalance}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', background: isSelected ? s.bg : 'transparent',
                  border: 'none', borderRadius: 6, padding: '7px 10px',
                  cursor: noBalance ? 'not-allowed' : 'pointer',
                  fontSize: 12, fontWeight: 600,
                  color: noBalance ? '#9ca3af' : isSelected ? s.color : '#374151',
                  opacity: noBalance ? 0.55 : 1,
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (!noBalance) e.currentTarget.style.background = s.bg; }}
                onMouseLeave={e => { e.currentTarget.style.background = isSelected ? s.bg : 'transparent'; }}
              >
                <div style={{ width: 22, height: 22, borderRadius: 5, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 9, fontWeight: 900, color: s.color }}>{s.short}</span>
                </div>
                <span style={{ flex: 1 }}>{s.label}</span>
                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
                  {availBal !== null && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: noBalance ? '#ef4444' : s.color }}>
                      {noBalance ? 'No balance' : `${availBal.toFixed(1)} avail`}
                    </span>
                  )}
                  {isSelected && !noBalance && (
                    <FaCheckCircle size={10} color={s.color} />
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
};

// ── Inline style constants ────────────────────────────────────────────────────
const navBtn = {
  background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 7,
  width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', color: '#374151', transition: 'background 0.15s',
};

const selectStyle = {
  fontSize: 12, fontWeight: 600, padding: '5px 8px', borderRadius: 7,
  border: '1px solid #e5e7eb', background: '#f9fafb', cursor: 'pointer',
  color: '#111827',
};

export default AttendanceCalendar;
