import DashboardNotice from './DashboardNotice';
import BreakTypeIcon from './BreakTypeIcon';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Modal, Spinner } from 'react-bootstrap';
import { FaSyncAlt } from 'react-icons/fa';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';

const BREAK_DEFS = [
  { key: 'tea_break_1',  label: 'Tea Break 1',  icon: <BreakTypeIcon />, color: '#10b981', light: '#d1fae5' },
  { key: 'tea_break_2',  label: 'Tea Break 2',  icon: <BreakTypeIcon />, color: '#6366f1', light: '#e0e7ff' },
  { key: 'lunch_break',  label: 'Lunch Break',  icon: <BreakTypeIcon type="lunch_break" />, color: '#8b5cf6', light: '#ede9fe' },
];

const AVATAR_COLORS = ['#6366f1','#8b5cf6','#10b981','#f59e0b','#ef4444','#0ea5e9','#ec4899','#14b8a6'];
const avatarColor = s => AVATAR_COLORS[((s || '').charCodeAt(0) || 0) % AVATAR_COLORS.length];
const initials    = (f, l) => ((f||'')[0]||'?').toUpperCase() + ((l||'')[0]||'').toUpperCase();

const pad = n => String(n).padStart(2, '0');
const fmtTime = iso => {
  if (!iso) return '--';
  const d = new Date(iso);
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  const h = ist.getUTCHours(), m = ist.getUTCMinutes();
  return `${h % 12 === 0 ? 12 : h % 12}:${pad(m)} ${h >= 12 ? 'PM' : 'AM'}`;
};
const fmtDuration = start => {
  const secs = Math.max(0, Math.floor((Date.now() - new Date(start).getTime()) / 1000));
  const m = Math.floor(secs / 60), s = secs % 60;
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m ${pad(s)}s`;
};

const Avatar = ({ first, last, size = 34 }) => (
  <div style={{
    width: size, height: size, borderRadius: '50%', flexShrink: 0,
    background: 'var(--team-break-avatar, ' + avatarColor(first) + ')', color: '#fff',
    fontSize: size * 0.33, fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }}>
    {initials(first, last)}
  </div>
);

export default function TeamBreakDashboard({ managerId } = {}) {
  const [loadError, setLoadError] = useState('');
  const [data,        setData]        = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [, setTick]                   = useState(0);
  const timerRef                      = useRef(null);
  const [showAll,     setShowAll]     = useState(false);
  const [detailKey,   setDetailKey]   = useState(null);
  const [detailTab,   setDetailTab]   = useState('used');

  const fetchStats = useCallback(async () => {
    setLoadError('');
    try {
      const url = managerId && managerId !== 'ALL'
        ? `${API_ENDPOINTS.BREAK_TEAM_STATS}?manager_id=${managerId}`
        : API_ENDPOINTS.BREAK_TEAM_STATS;
      const res = await axios.get(url);
      if (res.data?.success) setData(res.data);
    } catch { setLoadError('Unable to load team break activity. Refresh the dashboard to retry.'); } finally { setLoading(false); }
  }, [managerId]);

  // Manager Dashboard "View Team" filter changing re-fetches; otherwise this only
  // fetches once on mount — no background poll. Use the refresh button in the header
  // to pull fresh data on demand instead of hitting the DB every 30s from every open tab.
  useEffect(() => { setLoading(true); fetchStats(); }, [fetchStats]);

  useEffect(() => {
    const hasActive = data?.today_breaks?.some(b => !b.break_end);
    clearInterval(timerRef.current);
    if (hasActive) timerRef.current = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(timerRef.current);
  }, [data]);

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
      <Spinner animation="border" size="sm" />
    </div>
  );
  if (loadError) return <DashboardNotice type="error" text={loadError} />;
  if (!data || data.team_size === 0) return null;

  const { team_size, today_breaks = [], break_stats = {} } = data;

  const sortedBreaks = [...today_breaks].sort((a, b) => {
    if (!a.break_end && b.break_end) return -1;
    if (a.break_end && !b.break_end) return 1;
    return new Date(b.break_start) - new Date(a.break_start);
  });
  const visibleCards = sortedBreaks.slice(0, 6);

  const totalUsed     = BREAK_DEFS.reduce((s, d) => s + (break_stats[d.key]?.used_count || 0), 0);
  const totalPossible = team_size * 3;

  const openDetail = key => { setDetailKey(key); setDetailTab('used'); };

  /* ── Break type card in left grid ── */
  const BreakCard = ({ b }) => {
    const emp     = b.employee || {};
    const name    = `${emp.first_name || ''} ${emp.last_name || ''}`.trim() || b.employee_id;
    const def     = BREAK_DEFS.find(d => d.key === b.break_type) || BREAK_DEFS[0];
    const active  = !b.break_end;
    return (
      <div style={{
        background: '#f9fafb', borderRadius: 10, padding: '11px 12px',
        border: active ? '1.5px solid #bfdbfe' : '1px solid #f3f4f6',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
          <Avatar first={emp.first_name} last={emp.last_name} size={32} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
            <div style={{ fontSize: 10, color: '#6b7280' }}>{def.icon} {def.label}</div>
          </div>
        </div>
        <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 6 }}>
          {fmtTime(b.break_start)}
          {b.break_end ? ` → ${fmtTime(b.break_end)}` : active ? ` · ${fmtDuration(b.break_start)}` : ''}
          {!active && b.break_duration_minutes ? ` · ${b.break_duration_minutes}m` : ''}
        </div>
        <span style={{
          fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '2px 8px',
          background: 'var(--team-break-tint, ' + (active ? '#dbeafe' : def.light) + ')', color: 'var(--team-break-accent, ' + (active ? '#1d4ed8' : def.color) + ')',
        }}>
          {active ? 'On Break' : 'Completed'}
        </span>
      </div>
    );
  };

  /* ── Detail modal for one break type ── */
  const detailDef  = BREAK_DEFS.find(d => d.key === detailKey);
  const detailStat = detailKey ? (break_stats[detailKey] || {}) : {};
  const usedList   = [...(detailStat.used_employees || []), ...(detailStat.active_employees || [])];
  const unusedList = detailStat.unused_employees || [];

  return (
    <>
      {/* ── Two-panel grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 16, marginBottom: 24 }}>

        {/* LEFT – Team Break Activity */}
        <div className="role-break-card" style={{ background: '#fff', borderRadius: 14, boxShadow: '0 2px 10px rgba(0,0,0,0.07)', padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>Team Break Activity</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                onClick={fetchStats}
                disabled={loading}
                title="Refresh"
                style={{ background: 'none', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', color: '#9ca3af', padding: 2, display: 'flex', opacity: loading ? 0.5 : 1 }}
              >
                <FaSyncAlt size={12} style={loading ? { animation: 'tbdspin 0.8s linear infinite' } : undefined} />
              </button>
              {today_breaks.some(b => !b.break_end) && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: '#ef4444', background: '#fee2e2', borderRadius: 99, padding: '2px 8px' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444', display: 'inline-block', animation: 'pulse 1.2s infinite' }} />
                  LIVE
                </span>
              )}
              {today_breaks.length > 6 && (
                <button onClick={() => setShowAll(true)} style={{ background: 'none', border: 'none', color: '#6366f1', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                  View All ({today_breaks.length})
                </button>
              )}
            </div>
          </div>

          {today_breaks.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '28px 0', color: '#9ca3af', fontSize: 13 }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}><BreakTypeIcon /></div>
              No breaks taken today
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
              {visibleCards.map(b => <BreakCard key={b.id} b={b} />)}
            </div>
          )}
        </div>

        {/* RIGHT – Break Usage Today */}
        <div className="role-break-card" style={{ background: '#fff', borderRadius: 14, boxShadow: '0 2px 10px rgba(0,0,0,0.07)', padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <span style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>Break Usage (Today)</span>
            <span style={{ fontSize: 12, color: '#9ca3af', background: '#f3f4f6', borderRadius: 99, padding: '3px 10px' }}>{team_size} employees</span>
          </div>

          {BREAK_DEFS.map(def => {
            const stat       = break_stats[def.key] || { used_count: 0, active_count: 0, total: team_size };
            const consumed   = stat.used_count + stat.active_count;
            const pct        = team_size > 0 ? (consumed / team_size) * 100 : 0;
            const remaining  = team_size - consumed;
            const isLow      = remaining > 0 && remaining <= Math.max(1, Math.floor(team_size * 0.2));

            return (
              <div key={def.key}
                onClick={() => openDetail(def.key)}
                role="button"
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && openDetail(def.key)}
                style={{ marginBottom: 16, cursor: 'pointer', padding: '8px 10px', borderRadius: 10, transition: 'background 0.15s', outline: 'none' }}
                onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 18 }}>{def.icon}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{def.label}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--team-break-accent, ' + def.color + ')' }}>{consumed}/{team_size}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: isLow ? '#ef4444' : '#10b981' }}>
                      {remaining} left {isLow ? '⚠️' : ''}
                    </span>
                  </div>
                </div>
                <div style={{ height: 7, background: '#f3f4f6', borderRadius: 99, overflow: 'hidden', marginBottom: 4 }}>
                  <div style={{ height: '100%', borderRadius: 99, background: 'var(--team-break-accent, ' + def.color + ')', width: `${pct}%`, transition: 'width 0.5s ease' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 10, color: '#9ca3af' }}>
                    {stat.used_count} completed{stat.active_count > 0 ? ` · ${stat.active_count} active` : ''}
                  </span>
                  <span style={{ fontSize: 10, color: '#9ca3af' }}>Click to view →</span>
                </div>
              </div>
            );
          })}

          {/* Total row */}
          <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Total Breaks Taken</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>{totalUsed} / {totalPossible}</span>
            </div>
            <div style={{ height: 7, background: '#f3f4f6', borderRadius: 99, overflow: 'hidden', marginBottom: 4 }}>
              <div style={{ height: '100%', borderRadius: 99, background: '#9ca3af', width: `${totalPossible > 0 ? (totalUsed / totalPossible) * 100 : 0}%`, transition: 'width 0.5s ease' }} />
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600 }}>
                {totalPossible > 0 ? Math.round((totalUsed / totalPossible) * 100) : 0}% usage rate
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── View All Modal ── */}
      <Modal show={showAll} onHide={() => setShowAll(false)} size="lg" centered>
        <Modal.Header closeButton style={{ background: '#1e2a3e', border: 'none' }}>
          <Modal.Title style={{ color: '#fff', fontSize: 15, fontWeight: 700 }}>All Break Activity Today</Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ maxHeight: '70vh', overflowY: 'auto', padding: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
            {sortedBreaks.map(b => <BreakCard key={b.id} b={b} />)}
          </div>
        </Modal.Body>
      </Modal>

      {/* ── Break Detail Modal ── */}
      <Modal show={!!detailKey} onHide={() => setDetailKey(null)} centered size="md">
        <Modal.Header closeButton style={{ background: '#1e2a3e', border: 'none' }}>
          <Modal.Title style={{ color: '#fff', fontSize: 15, fontWeight: 700 }}>
            {detailDef?.icon} {detailDef?.label} — Today's Details
          </Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ padding: 0 }}>
          {/* Toggle tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid #f3f4f6' }}>
            {[
              { id: 'used',   label: `Used (${usedList.length})` },
              { id: 'unused', label: `Not Used Yet (${unusedList.length})` },
            ].map(tab => (
              <button key={tab.id} onClick={() => setDetailTab(tab.id)} style={{
                flex: 1, padding: '13px 8px', border: 'none', cursor: 'pointer',
                fontWeight: 700, fontSize: 13, background: 'transparent',
                color: detailTab === tab.id ? (detailDef?.color || '#374151') : '#9ca3af',
                borderBottom: detailTab === tab.id ? `2.5px solid ${detailDef?.color || '#374151'}` : '2.5px solid transparent',
                transition: 'all 0.15s',
              }}>
                {tab.label}
              </button>
            ))}
          </div>

          <div style={{ maxHeight: '55vh', overflowY: 'auto', padding: '10px 16px' }}>
            {detailTab === 'used' ? (
              usedList.length === 0
                ? <div style={{ textAlign: 'center', padding: '28px 0', color: '#9ca3af', fontSize: 13 }}>No one has used this break yet</div>
                : usedList.map(b => {
                    const emp    = b.employee || {};
                    const name   = `${emp.first_name || ''} ${emp.last_name || ''}`.trim() || b.employee_id;
                    const active = !b.break_end;
                    return (
                      <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid #f9fafb' }}>
                        <Avatar first={emp.first_name} last={emp.last_name} size={36} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{name}</div>
                          <div style={{ fontSize: 11, color: '#6b7280' }}>
                            {fmtTime(b.break_start)} {b.break_end ? `→ ${fmtTime(b.break_end)}` : '(ongoing)'}
                          </div>
                        </div>
                        <span style={{
                          fontSize: 11, fontWeight: 700, borderRadius: 6, padding: '3px 10px',
                          background: active ? '#dbeafe' : (detailDef?.light || '#d1fae5'),
                          color: active ? '#1d4ed8' : (detailDef?.color || '#065f46'),
                        }}>
                          {active ? 'On Break' : `${b.break_duration_minutes || '?'}m`}
                        </span>
                      </div>
                    );
                  })
            ) : (
              unusedList.length === 0
                ? <div style={{ textAlign: 'center', padding: '28px 0', color: '#9ca3af', fontSize: 13 }}>Everyone has used this break ✓</div>
                : unusedList.map(emp => {
                    const name = `${emp.first_name || ''} ${emp.last_name || ''}`.trim();
                    return (
                      <div key={emp.employee_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid #f9fafb' }}>
                        <Avatar first={emp.first_name} last={emp.last_name} size={36} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{name}</div>
                          {emp.designation && <div style={{ fontSize: 11, color: '#9ca3af' }}>{emp.designation}</div>}
                        </div>
                        <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 500 }}>Not used</span>
                      </div>
                    );
                  })
            )}
          </div>
        </Modal.Body>
      </Modal>

      <style>{`@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.3 } } @keyframes tbdspin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
