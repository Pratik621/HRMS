import DashboardNotice from './DashboardNotice';
import React, { useEffect, useState } from 'react';
import { FaChartBar } from 'react-icons/fa';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';
import { QA, QA_CARD_STYLE, QA_CARD_TITLE_STYLE } from './quickAccessTheme';

function Bar({ label, value, total, color }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div style={{ marginBottom: 10,marginRight:10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
        <span style={{ color: QA.textMuted, fontWeight: 600 }}>{label}</span>
        <span style={{ color: QA.textDark, fontWeight: 700 }}>{value}</span>
      </div>
      <div className="hrms-progress-track" style={{ marginRight:1, height: 6, borderRadius: 4, background: '#f3f4f6', overflow: 'hidden' }}>
        <div className="hrms-progress-fill" style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4, transition: 'width 0.4s ease' }} />
      </div>
    </div>
  );
}

// 26th-to-26th payroll cycle window, same as Admin/EmployeeList.jsx's EmpQuickView.
const currentCycle = () => {
  const today = new Date();
  const yr = today.getFullYear(), mo = today.getMonth();
  const start = today.getDate() >= 26 ? new Date(yr, mo, 26) : new Date(yr, mo - 1, 26);
  return { start, end: today };
};

export default function AttendanceInsightsCard({ employeeId }) {
  const [loadError, setLoadError] = useState('');
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(!!employeeId);

  useEffect(() => {
    if (!employeeId) return;
    setLoadError('');
    const { start, end } = currentCycle();
    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];
    let cancelled = false;

    axios.get(API_ENDPOINTS.ATTENDANCE_EMPLOYEE_REPORT(employeeId, startStr, endStr))
      .then(res => {
        if (cancelled) return;
        const records = res.data?.attendance || [];
        const stats = res.data?.stats || {};
        const late = records.filter(r => parseFloat(r.late_minutes) > 0).length;
        setInsights({
          present: stats.present || 0,
          absent: stats.absent || 0,
          half_day: stats.half_day || 0,
          late,
          total: stats.total || records.length,
        });
      })
      .catch(() => { if (!cancelled) setLoadError('Unable to load attendance insights. Refresh the dashboard to retry.'); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [employeeId]);

  const total = insights ? Math.max(1, insights.present + insights.absent + insights.half_day) : 1;

  return (
    <div className="attendance-insights-card" style={QA_CARD_STYLE}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <FaChartBar size={12} color={QA.textMuted} />
        <div style={{ ...QA_CARD_TITLE_STYLE, marginBottom: 0 }}>Attendance Insights</div>
      </div>
      <div style={{ fontSize: 10, color: QA.textMuted, marginBottom: 12 }}>Current payroll cycle</div>
      {loadError ? <DashboardNotice type="error" text={loadError} /> : loading ? (
        <div style={{ fontSize: 12, color: QA.textMuted }}>Loading…</div>
      ) : !insights ? (
        <div style={{ fontSize: 12, color: QA.textMuted }}>No attendance data available</div>
      ) : (
        <>
          <Bar label="Present" value={insights.present} total={total} color={QA.success} />
          <Bar label="Absent" value={insights.absent} total={total} color={QA.danger} />
          <Bar label="Half-Day" value={insights.half_day} total={total} color={QA.warning} />
          <Bar label="Late" value={insights.late} total={Math.max(1, insights.present)} color={QA.purple} />
        </>
      )}
    </div>
  );
}
