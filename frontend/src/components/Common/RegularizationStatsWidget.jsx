import React, { useEffect, useState } from 'react';
import { FaRegClock } from 'react-icons/fa';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';
import { QA, QA_CARD_STYLE, QA_CARD_TITLE_STYLE } from './quickAccessTheme';

function Tile({ label, value, color }) {
  return (
    <div style={{ flex: '1 1 0', minWidth: 70, textAlign: 'center' }}>
      <div className="regularization-stat-value" style={{ fontSize: 18, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 10, color: QA.textMuted, fontWeight: 600 }}>{label}</div>
    </div>
  );
}

// Small dashboard widget for the /regularization/stats endpoint — the backend
// auto-detects scope (manager-style tiles for anyone with direct reports or an
// elevated role, employee-style tiles otherwise), so this component just renders
// whatever shape comes back.
export default function RegularizationStatsWidget({ managerId } = {}) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const url = managerId && managerId !== 'ALL'
      ? `${API_ENDPOINTS.ATTENDANCE_REGULARIZATION_STATS}?manager_id=${managerId}`
      : API_ENDPOINTS.ATTENDANCE_REGULARIZATION_STATS;
    axios.get(url)
      .then(res => { if (!cancelled) setStats(res.data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [managerId]);

  return (
    <div style={QA_CARD_STYLE}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <FaRegClock size={12} color={QA.textMuted} />
        <div style={{ ...QA_CARD_TITLE_STYLE, marginBottom: 0 }}>Regularizations</div>
      </div>
      {loading ? (
        <div style={{ fontSize: 12, color: QA.textMuted, marginTop: 8 }}>Loading…</div>
      ) : !stats ? (
        <div style={{ fontSize: 12, color: QA.textMuted, marginTop: 8 }}>No data available</div>
      ) : stats.scope === 'manager' ? (
        <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
          <Tile label="Pending" value={stats.pending} color={QA.warning} />
          <Tile label="Approved Today" value={stats.approved_today} color={QA.success} />
          <Tile label="Rejected Today" value={stats.rejected_today} color={QA.danger} />
          <Tile label="Avg. Approval (hrs)" value={stats.avg_approval_time_hours} color={QA.purple} />
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
  <Tile label="Pending" value={stats.pending} color="#374151" />
  <Tile label="Approved" value={stats.approved} color="#374151" />
  <Tile label="Rejected" value={stats.rejected} color="#374151" />
</div>
      )}
    </div>
  );
}
