// src/components/Admin/Payroll/AttendanceReviewTab.jsx
// Attendance review/correction before payroll generation. Reuses the existing
// AttendanceCalendar component and its endpoints (ATTENDANCE_ADMIN_MARK / ATTENDANCE_IMPORT)
// unmodified — this tab is just an employee picker in front of it, not a new correction UI,
// so corrections update the real `attendance` table exactly as they already do elsewhere.
import React, { useState } from 'react';
import { FaUserTie, FaSearch } from 'react-icons/fa';
import AttendanceCalendar from '../AttendanceCalendar';

const AttendanceReviewTab = ({ records, refetch, month, year, cycleLabel }) => {
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');

  const filtered = search.trim()
    ? records.filter(r => `${r.first_name} ${r.last_name}`.toLowerCase().includes(search.toLowerCase()) || r.employee_id.toLowerCase().includes(search.toLowerCase()))
    : records;

  const selected = records.find(r => r.employee_id === selectedId) || null;

  return (
    <div className="d-flex flex-column flex-lg-row gap-3">
      {/* Employee picker */}
      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 6px rgba(0,0,0,0.06)', width: '100%', maxWidth: 320, flexShrink: 0, overflow: 'hidden' }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ position: 'relative' }}>
            <FaSearch size={11} style={{ position: 'absolute', left: 10, top: 10, color: '#94a3b8' }} />
            <input
              type="text" placeholder="Search employee…" value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', padding: '7px 10px 7px 28px', fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0', outline: 'none' }}
            />
          </div>
        </div>
        <div style={{ maxHeight: 520, overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>No employees found.</div>
          ) : filtered.map(rec => (
            <button
              key={rec.employee_id}
              onClick={() => setSelectedId(rec.employee_id)}
              style={{
                width: '100%', textAlign: 'left', border: 'none', borderBottom: '1px solid #f8fafc',
                background: selectedId === rec.employee_id ? "#eef4fb" : '#fff',
                padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
              }}
            >
              <div style={{ width: 30, height: 30, borderRadius: '50%', background: "#dce3eb", color: "#1f4e79", display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                {(rec.first_name?.[0] || '') + (rec.last_name?.[0] || '')}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rec.first_name} {rec.last_name}</div>
                <div style={{ fontSize: 10, color: '#94a3b8' }}>{rec.employee_id} · P{rec.present_days ?? '—'}/A{rec.absent_days ?? '—'}/H{rec.half_days ?? '—'}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Calendar */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {!selected ? (
          <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 6px rgba(0,0,0,0.06)', padding: 60, textAlign: 'center', color: '#94a3b8' }}>
            <FaUserTie size={32} style={{ marginBottom: 12, opacity: 0.3 }} />
            <div style={{ fontSize: 14 }}>Select an employee to review or correct their attendance.</div>
          </div>
        ) : (
          <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 6px rgba(0,0,0,0.06)', padding: 16 }}>
            <div style={{ marginBottom: 4, fontWeight: 700, fontSize: 14, color: '#1e293b' }}>
              {selected.first_name} {selected.last_name} <span style={{ fontWeight: 400, color: '#94a3b8', fontSize: 12 }}>({selected.employee_id})</span>
            </div>
            <div style={{ marginBottom: 10, fontSize: 11, color: '#94a3b8' }}>
              Payroll period is <b>{cycleLabel}</b> — spans two calendar months, so check both if a date near the 25th/26th looks off.
              Corrections here update the real attendance record and are picked up automatically the next time this employee's salary slip is generated.
            </div>
            <AttendanceCalendar employee={selected} onAttendanceSaved={refetch} initialMonth={month} initialYear={year} />
          </div>
        )}
      </div>
    </div>
  );
};

export default AttendanceReviewTab;
