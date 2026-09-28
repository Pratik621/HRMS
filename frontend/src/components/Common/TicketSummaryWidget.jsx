import DashboardNotice from './DashboardNotice';
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaTicketAlt } from 'react-icons/fa';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';

// Small ticket KPI card for Admin/Manager dashboards. Reuses GET /api/tickets/count
// (same endpoint TicketBadge.jsx already polls) — counts are already role-scoped
// server-side via visibleTicketsQuery, so this widget never needs its own permission logic.
const BUCKETS = [
  { key: 'new',              label: 'New',          color: '#3b82f6', bg: '#dbeafe' },
  { key: 'in_progress',      label: 'In Progress',  color: '#f59e0b', bg: '#fef3c7' },
  { key: 'resolved_pending', label: 'Pending',      color: '#8b5cf6', bg: '#ede9fe' },
  { key: 'overdue',          label: 'Overdue',      color: '#f97316', bg: '#fff7ed' },
  { key: 'critical',         label: 'Critical',     color: '#ef4444', bg: '#fef2f2' },
];

export default function TicketSummaryWidget({ managerId } = {}) {
  const [loadError, setLoadError] = useState('');
  const navigate = useNavigate();
  const [counts, setCounts] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoadError('');
      try {
        const url = managerId && managerId !== 'ALL'
          ? `${API_ENDPOINTS.TICKET_COUNT}?manager_id=${managerId}`
          : API_ENDPOINTS.TICKET_COUNT;
        const res = await axios.get(url);
        if (!cancelled && res.data?.success) setCounts(res.data);
      } catch { if (!cancelled) setLoadError('Unable to load ticket overview. Refresh the dashboard to retry.'); }
    };
    // Fetch once on mount — no 60s poll (re-fetches when the Manager Dashboard "View
    // Team" filter changes). Clicking any bucket navigates to the full ticket list,
    // which fetches its own fresh data.
    load();
    return () => { cancelled = true; };
  }, [managerId]);

  const goTo = (bucket) => {
    if (bucket.key === 'overdue' || bucket.key === 'critical') {
      navigate('/tickets?sort=oldest');
    } else {
      navigate(`/tickets?status=${bucket.key}`);
    }
  };

  if (loadError) return <DashboardNotice type="error" text={loadError} />;
  if (!counts) return null;

  return (
    <div className="role-ticket-card" style={{ background: '#fff', borderRadius: 16, border: '1px solid #E5E7EB', boxShadow: '0 1px 3px rgba(0,0,0,.06)', overflow: 'hidden', marginBottom: 20 }}>
      <div className="role-card-header" style={{ padding: '14px 18px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: 8 }}>
        <FaTicketAlt size={13} color="#4F46E5" />
        <span style={{ fontWeight: 700, fontSize: 13, color: '#111827' }}>Ticket Overview</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 1, background: '#F1F5F9' }}>
        {BUCKETS.map(b => (
          <button
            key={b.key}
            onClick={() => goTo(b)}
            style={{
              background: '#fff', border: 'none', padding: '14px 12px', textAlign: 'left', cursor: 'pointer',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = b.bg; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}
          >
            <div style={{ fontSize: 22, fontWeight: 800, color: b.color, lineHeight: 1 }}>{counts[b.key] ?? 0}</div>
            <div style={{ fontSize: 11, color: '#6B7280', fontWeight: 600, marginTop: 4 }}>{b.label}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
