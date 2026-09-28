import React, { useEffect, useState } from 'react';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';
import { QA, QA_CARD_STYLE, QA_CARD_TITLE_STYLE } from './quickAccessTheme';

const COMP_OFF_VISUAL_MAX = 5;

function Ring({ value, max, color, label, size = 64 }) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={7} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={7}
            strokeDasharray={`${pct * circ} ${circ}`} strokeLinecap="round" />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: QA.textDark }}>{value}</span>
          <span style={{ fontSize: 9, color: QA.textMuted }}>Days</span>
        </div>
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color: QA.textMuted, textAlign: 'center' }}>{label}</span>
    </div>
  );
}

export default function LeaveBalanceRingsCard({ employeeId, suppliedBalance, suppliedLoading = false }) {
  const hasSuppliedBalance = suppliedBalance !== undefined;
  const [fetchedBalance, setBalance] = useState(null);
  const balance = hasSuppliedBalance ? suppliedBalance : fetchedBalance;
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(!!employeeId);

  useEffect(() => {
    if (!employeeId) return;
    setLoading(true);
    let cancelled = false;
    Promise.all([
      hasSuppliedBalance ? Promise.resolve(null) : axios.get(API_ENDPOINTS.LEAVE_BALANCE(employeeId)).catch(() => null),
      axios.get(API_ENDPOINTS.LEAVE_USAGE_BY_TYPE(employeeId)).catch(() => null),
    ]).then(([balRes, usageRes]) => {
      if (cancelled) return;
      if (balRes) setBalance(balRes.data);
      if (usageRes?.data?.success) setUsage(usageRes.data.usage);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [employeeId, hasSuppliedBalance]);

  const usageEntries = usage ? Object.entries(usage).filter(([, days]) => days > 0) : [];

  return (
    <div style={QA_CARD_STYLE}>
      <div style={QA_CARD_TITLE_STYLE}>Leave Balances</div>
      {loading || suppliedLoading ? (
        <div style={{ fontSize: 12, color: QA.textMuted }}>Loading…</div>
      ) : !balance ? (
        <div style={{ fontSize: 12, color: QA.textMuted }}>Leave balance unavailable</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 20, justifyContent: 'center', marginBottom: usageEntries.length > 0 ? 14 : 0 }}>
  <Ring
    value={Math.round(balance.available || 0)}
    max={Math.max(1, Math.round(balance.total_accrued || 0))}
    color="#374151"
    label="Available"
  />

  <Ring
    value={Math.round(balance.comp_off_balance || 0)}
    max={COMP_OFF_VISUAL_MAX}
    color="#374151"
    label="Comp-Off"
  />
</div>
          {usageEntries.length > 0 && (
            <div style={{ borderTop: `1px solid ${QA.border}`, paddingTop: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: QA.textMuted, textTransform: 'uppercase', marginBottom: 6 }}>Used this year</div>
              {usageEntries.map(([type, days]) => (
                <div key={type} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}>
                  <span style={{ color: QA.textDark }}>{type}</span>
                  <span style={{ color: QA.textMuted, fontWeight: 600 }}>{days} day{days === 1 ? '' : 's'}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
