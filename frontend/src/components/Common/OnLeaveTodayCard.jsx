import React, { useEffect, useState } from 'react';
import { FaUserClock } from 'react-icons/fa';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';
import Avatar from './Avatar';
import { QA, QA_CARD_STYLE, QA_CARD_TITLE_STYLE } from './quickAccessTheme';

export default function OnLeaveTodayCard({ scope = 'department', department, managerId }) {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // Manager Dashboard "View Team" filter: an explicit manager_id forces team scope
    // (resolved server-side against that manager, not the caller) instead of scope.
    const effectiveScope = managerId && managerId !== 'ALL' ? 'team' : scope;
    const url = managerId && managerId !== 'ALL'
      ? `${API_ENDPOINTS.LEAVE_ON_LEAVE_TODAY(effectiveScope, department)}&manager_id=${managerId}`
      : API_ENDPOINTS.LEAVE_ON_LEAVE_TODAY(effectiveScope, department);
    axios.get(url)
      .then(res => { if (!cancelled && res.data?.success) setEmployees(res.data.employees || []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [scope, department, managerId]);

  return (
    <div className="qa-hover-lift" style={QA_CARD_STYLE}>
      <div style={QA_CARD_TITLE_STYLE}>On Leave Today</div>
      {loading ? (
        <div style={{ fontSize: 12, color: QA.textMuted }}>Loading…</div>
      ) : employees.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '10px 0' }}>
  <div
    style={{
      width: 46,
      height: 46,
      borderRadius: '50%',
      background: '#F3F4F6',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      margin: '0 auto 8px'
    }}
  >
    <FaUserClock size={18} color="#374151" />
  </div>

  <div
    style={{
      fontSize: 12,
      color: '#374151',
      fontWeight: 700
    }}
  >
    Everyone is working today!
  </div>

  <div
    style={{
      fontSize: 11,
      color: '#6B7280',
      marginTop: 2
    }}
  >
    No one is on leave today.
  </div>
</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 160, overflowY: 'auto' }}>
          {employees.map(e => (
            <div key={e.employee_id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar photo={e.profile_image} id={e.employee_id} firstName={e.first_name} lastName={e.last_name} size={30} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: QA.textDark, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {e.first_name} {e.last_name}
                </div>
                <div style={{ fontSize: 10, color: QA.textMuted }}>{e.leave_type || 'On Leave'}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
