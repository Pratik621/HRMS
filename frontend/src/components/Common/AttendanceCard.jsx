import React, { useState, useEffect } from 'react';
import {
  FaSignInAlt,
  FaSignOutAlt,
  FaSyncAlt,
  FaClock,
  FaBriefcase,
} from 'react-icons/fa';
import BreakWidget from './BreakWidget';
import TicketBadge from './TicketBadge';
import { getTrustedNow } from '../../utils/serverTime';

// India timezone
const fmtClock = (d) =>
  d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });

const fmtDate = (d) =>
  d.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });

// Formats attendance timestamps safely as India time.
const formatIstTimeField = (val) => {
  if (!val) return null;

  const s = String(val);

  const isUtcTagged =
    /[Zz]$/.test(s) || /[+-]\d{2}:?\d{2}$/.test(s);

  if (isUtcTagged) {
    const d = new Date(s);

    return isNaN(d.getTime())
      ? null
      : d.toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
          timeZone: 'Asia/Kolkata',
        });
  }

  const timePart = s.replace('T', ' ').split(' ')[1];

  if (!timePart) return null;

  let [h, m] = timePart.split(':').map(Number);

  if (Number.isNaN(h) || Number.isNaN(m)) {
    return null;
  }

  const ampm = h >= 12 ? 'PM' : 'AM';

  h = h % 12;

  if (h === 0) h = 12;

  return `${String(h).padStart(2, '0')}:${String(m).padStart(
    2,
    '0'
  )} ${ampm}`;
};

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
  // Trusted server clock
  const [now, setNow] = useState(getTrustedNow());

  useEffect(() => {
    const id = setInterval(() => {
      setNow(getTrustedNow());
    }, 1000);

    return () => clearInterval(id);
  }, []);

  const hasOpen =
    !!activeSession ||
    (!!attendance?.clock_in && !attendance?.clock_out);

  const isClockedOutToday =
    !!(attendance?.clock_out && !activeSession);

  const clockInDisplay =
    attendance?.clock_in_display ||
    formatIstTimeField(attendance?.clock_in) ||
    '--:--';

  const clockOutDisplay =
    attendance?.clock_out_display ||
    formatIstTimeField(attendance?.clock_out) ||
    '--:--';

  return (
    <div className="attendance-card-modern">

      {/* Header */}
      <div className="attendance-card-header">
        <div>
          <div className="attendance-card-title">
            Time Today
          </div>

          <div className="attendance-card-date">
            {fmtDate(now)}
          </div>
        </div>

        {!readOnly && (
          <div className="attendance-ticket">
            <TicketBadge variant="dark" />
          </div>
        )}
      </div>

      {/* Current Time */}
      <div className="attendance-current-time">
        <div className="attendance-clock-icon">
          <FaClock size={18} />
        </div>

        <div>
          <div className="attendance-live-label">
            Current Time
          </div>

          <div className="attendance-time-value">
            {fmtClock(now)}
          </div>
        </div>
      </div>

      {/* Working Status */}
      <div
        className={`attendance-status ${
          hasOpen
            ? 'attendance-status-working'
            : 'attendance-status-idle'
        }`}
      >
        <span className="attendance-status-dot"></span>

        <span>
          {hasOpen ? 'Working' : 'Not Clocked In'}
        </span>
      </div>

      {/* Attendance Summary */}
      <div className="attendance-summary-grid">

        <div className="attendance-summary-item">
          <span className="attendance-summary-label">
            In
          </span>

          <span className="attendance-summary-value">
            {clockInDisplay}
          </span>
        </div>

        <div className="attendance-summary-item">
          <span className="attendance-summary-label">
            Out
          </span>

          <span className="attendance-summary-value">
            {clockOutDisplay}
          </span>
        </div>

        {attendance?.total_hours_display && (
          <div className="attendance-summary-item">
            <span className="attendance-summary-label">
              Hours
            </span>

            <span className="attendance-summary-value">
              {attendance.total_hours_display}
            </span>
          </div>
        )}
      </div>

      {/* Attendance Actions */}
      {readOnly ? (
        <div className="attendance-readonly-message">
          {readOnlyMessage}
        </div>
      ) : disabledMobile ? (
        <div className="attendance-mobile-warning">
          <button
            type="button"
            disabled
            className="attendance-disabled-button"
          >
            <FaSignInAlt size={13} />
            Clock In / Clock Out
          </button>

          <div className="attendance-mobile-text">
            Not available on mobile/tablet — use a desktop to mark
            attendance.
          </div>
        </div>
      ) : hasOpen && !canClockOut ? (
        <div className="attendance-break-row">
          <span className="attendance-clocked-badge">
            <span className="attendance-small-dot"></span>
            Clocked in
          </span>

          <BreakWidget
            mode="inline-button"
            isClockedIn={
              !!(attendance?.clock_in || activeSession)
            }
            isClockedOut={isClockedOutToday}
            unlimitedBreaks={unlimitedBreaks}
          />
        </div>
      ) : hideClockToggle ? (
        /*
         * Clock In / Clock Out are handled by the WelcomeBanner.
         * AttendanceCard therefore only displays the Break action.
         */
        <div className="attendance-break-row">
          <BreakWidget
            mode="inline-button"
            isClockedIn={
              !!(attendance?.clock_in || activeSession)
            }
            isClockedOut={isClockedOutToday}
            unlimitedBreaks={unlimitedBreaks}
          />
        </div>
      ) : (
        <div className="attendance-break-row">
          <button
            type="button"
            onClick={
              hasOpen ? onRequestClockOut : onClockIn
            }
            disabled={clockLoading}
            className={`attendance-primary-action ${
              hasOpen
                ? 'attendance-clockout-action'
                : 'attendance-clockin-action'
            }`}
          >
            {clockLoading ? (
              <>
                <FaSyncAlt
                  size={12}
                  className="attendance-spin"
                />
                Processing...
              </>
            ) : hasOpen ? (
              <>
                <FaSignOutAlt size={13} />
                Clock Out
              </>
            ) : (
              <>
                <FaSignInAlt size={13} />
                Clock In
              </>
            )}
          </button>

          <BreakWidget
            mode="inline-button"
            isClockedIn={
              !!(attendance?.clock_in || activeSession)
            }
            isClockedOut={isClockedOutToday}
            unlimitedBreaks={unlimitedBreaks}
          />
        </div>
      )}

      {/* Shift */}
      {shiftTiming && (
        <div className="attendance-shift">
          <div className="attendance-shift-icon">
            <FaBriefcase size={12} />
          </div>

          <div>
            <div className="attendance-shift-label">
              Today's Shift
            </div>

            <div className="attendance-shift-value">
              {shiftTiming}
            </div>
          </div>
        </div>
      )}

      {/* Extra footer content */}
      {footerExtra && (
        <div className="attendance-footer-extra">
          {footerExtra}
        </div>
      )}
    </div>
  );
}