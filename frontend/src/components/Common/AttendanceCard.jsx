import React, { useState, useEffect } from 'react';
import { FaSignInAlt, FaSignOutAlt, FaSyncAlt, FaClock } from 'react-icons/fa';
import BreakWidget from './BreakWidget';
import TicketBadge from './TicketBadge';
import { QA } from './quickAccessTheme';
import { getTrustedNow } from '../../utils/serverTime';

// timeZone pinned to India — otherwise this renders in whatever timezone the OS happens to be
// set to, independent of (and in addition to) the device's clock itself.
const fmtClock = (d) => d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
const fmtDate = (d) => d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

// Fallback formatter for attendance.clock_in/clock_out when the backend hasn't already
// provided clock_in_display/clock_out_display. The value here is usually clock_in_ist/
// clock_out_ist — a naive "YYYY-MM-DD HH:MM:SS" string that IS ALREADY India wall-clock time,
// not a UTC instant — so it must be read directly rather than passed through `new Date()`,
// which would interpret those digits against this device's own timezone (wrong the moment the
// OS timezone isn't India, even though the digits were already correct). Only the rarer
// raw-UTC fallback (a proper ISO string with a Z/offset) needs an actual timezone conversion.
const formatIstTimeField = (val) => {
  if (!val) return null;
  const s = String(val);
  const isUtcTagged = /[Zz]$/.test(s) || /[+-]\d{2}:?\d{2}$/.test(s);
  if (isUtcTagged) {
    const d = new Date(s);
    return isNaN(d.getTime())
      ? null
      : d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
  }
  const timePart = s.replace('T', ' ').split(' ')[1];
  if (!timePart) return null;
  let [h, m] = timePart.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12; if (h === 0) h = 12;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
};

// Presentational-only card: all attendance state/handlers are owned by the parent
// dashboard (existing, already-working clock-in/out logic) — this component just
// renders them inside the new premium layout. No attendance logic lives here.
export default function AttendanceCard({
  attendance,
  activeSession,
  onClockIn,
  onRequestClockOut,
  clockLoading,
  readOnly = false,
  readOnlyMessage = "Admin accounts don't clock in",
  disabledMobile = false,
  canClockOut = true,
  shiftTiming,
  footerExtra,
  unlimitedBreaks = false,
  hideClockToggle = false,
}) {
  // Anchored to the trusted server clock (utils/serverTime.js), not this device's own clock —
  // the employee/admin's laptop time must never be able to move this display, since it's the
  // same clock the actual clock-in/out timestamps are computed from on the backend.
  const [now, setNow] = useState(getTrustedNow());
  useEffect(() => {
    const id = setInterval(() => setNow(getTrustedNow()), 1000);
    return () => clearInterval(id);
  }, []);

  const hasOpen = !!activeSession || (!!attendance?.clock_in && !attendance?.clock_out);
  const isClockedOutToday = !!(attendance?.clock_out && !activeSession);

  return (
    <div style={{
      background: 'linear-gradient(135deg, #F59E0B 0%, #F97316 100%)',
      borderRadius: 18, padding: 18, color: '#fff', position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, opacity: 0.85 }}>Time Today</div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>{fmtDate(now)}</div>
        </div>
        {!readOnly && <TicketBadge variant="dark" />}
      </div>

      <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: 0.5, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
        <FaClock size={22} style={{ opacity: 0.85 }} />
        {fmtClock(now)}
      </div>

      <div style={{ display: 'flex', gap: 18, fontSize: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <div>
          <div style={{ opacity: 0.8, fontSize: 10, textTransform: 'uppercase' }}>In</div>
          <div style={{ fontWeight: 700 }}>{attendance?.clock_in_display || formatIstTimeField(attendance?.clock_in) || '--:--'}</div>
        </div>
        <div>
          <div style={{ opacity: 0.8, fontSize: 10, textTransform: 'uppercase' }}>Out</div>
          <div style={{ fontWeight: 700 }}>{attendance?.clock_out_display || formatIstTimeField(attendance?.clock_out) || '--:--'}</div>
        </div>
        {attendance?.total_hours_display && (
          <div>
            <div style={{ opacity: 0.8, fontSize: 10, textTransform: 'uppercase' }}>Hours</div>
            <div style={{ fontWeight: 700 }}>{attendance.total_hours_display}</div>
          </div>
        )}
      </div>

      {readOnly ? (
        <div style={{ fontSize: 12, fontWeight: 600, background: 'rgba(255,255,255,0.18)', display: 'inline-block', padding: '6px 12px', borderRadius: 20 }}>
          {readOnlyMessage}
        </div>
      ) : disabledMobile ? (
        <div>
          <button disabled style={{ background: 'rgba(255,255,255,0.25)', color: 'rgba(255,255,255,0.7)', border: 'none', borderRadius: 10, padding: '9px 20px', fontWeight: 700, fontSize: 13, cursor: 'not-allowed', display: 'flex', alignItems: 'center', gap: 7 }}>
            <FaSignInAlt size={13} /> Clock In / Clock Out
          </button>
          <div style={{ fontSize: 11, marginTop: 6, opacity: 0.85 }}>Not available on mobile/tablet — use a desktop to mark attendance.</div>
        </div>
      ) : hasOpen && !canClockOut ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'nowrap' }}>
          <span style={{ fontSize: 12, fontWeight: 600, background: 'rgba(255,255,255,0.18)', padding: '8px 16px', borderRadius: 10, whiteSpace: 'nowrap' }}>Clocked in ✓</span>
          <BreakWidget mode="inline-button" isClockedIn={!!(attendance?.clock_in || activeSession)} isClockedOut={isClockedOutToday} unlimitedBreaks={unlimitedBreaks} />
        </div>
      ) : hideClockToggle ? (
        // Clock In/Clock Out now live as separate buttons elsewhere (e.g. the dashboard's
        // welcome banner) — this card just keeps the Break button here on its own.
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'nowrap' }}>
          <BreakWidget mode="inline-button" isClockedIn={!!(attendance?.clock_in || activeSession)} isClockedOut={isClockedOutToday} unlimitedBreaks={unlimitedBreaks} />
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'nowrap' }}>
          <button
            onClick={hasOpen ? onRequestClockOut : onClockIn}
            disabled={clockLoading}
            style={{
              background: '#fff', color: hasOpen ? '#b45309' : '#065f46', border: 'none', borderRadius: 10,
              padding: '8px 16px', fontWeight: 800, fontSize: 13, cursor: clockLoading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 6, opacity: clockLoading ? 0.7 : 1, whiteSpace: 'nowrap',
            }}
          >
            {clockLoading
              ? <><FaSyncAlt size={12} style={{ animation: 'attcardspin 0.8s linear infinite' }} /> Processing…</>
              : hasOpen ? <><FaSignOutAlt size={13} /> Clock Out</> : <><FaSignInAlt size={13} /> Clock In</>}
          </button>
          <BreakWidget mode="inline-button" isClockedIn={!!(attendance?.clock_in || activeSession)} isClockedOut={isClockedOutToday} unlimitedBreaks={unlimitedBreaks} />
        </div>
      )}

      {shiftTiming && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.25)', fontSize: 11 }}>
          <span style={{ opacity: 0.8 }}>Today's Shift: </span>
          <span style={{ fontWeight: 700 }}>{shiftTiming}</span>
        </div>
      )}

      {footerExtra && (
        <div style={{ marginTop: 10 }}>{footerExtra}</div>
      )}

      <style>{`@keyframes attcardspin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
