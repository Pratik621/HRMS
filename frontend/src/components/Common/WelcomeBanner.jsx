import React from 'react';
import { FaSyncAlt, FaDownload } from 'react-icons/fa';
import { QA_BANNER_GRADIENT } from './quickAccessTheme';
import { getTrustedNow, getTrustedNowIST } from '../../utils/serverTime';

const QUOTES = [
  'Small daily improvements lead to stunning results.',
  'Great things are done by a series of small things brought together.',
  'Teamwork makes the dream work.',
  'Progress, not perfection.',
  'Every day is a fresh start.',
  'Success is the sum of small efforts, repeated.',
  'Collaboration is the key to unlocking great work.',
];

const dayOfYear = (d) =>
  Math.floor(
    (d - new Date(d.getFullYear(), 0, 0)) /
      (1000 * 60 * 60 * 24)
  );

const greeting = (hour) =>
  hour < 12
    ? 'Good Morning'
    : hour < 17
      ? 'Good Afternoon'
      : 'Good Evening';

export default function WelcomeBanner({
  name,
  employeeMeta = null,
  onRefresh,
  onExport,
  refreshing = false,
  headerExtra = null,
  belowActions = null,
}) {
  // Keep the greeting/date synchronized with the trusted server clock.
  const now = getTrustedNow();
  const istHour = parseInt(
    getTrustedNowIST().split(' ')[1].split(':')[0],
    10
  );

  const quote = QUOTES[dayOfYear(now) % QUOTES.length];

  return (
    <div
      className="welcome-banner-modern"
      style={{
        background: QA_BANNER_GRADIENT,
      }}
    >
      {/* Decorative background shapes */}
      <div className="welcome-banner-orb welcome-banner-orb-one" />
      <div className="welcome-banner-orb welcome-banner-orb-two" />

      <div className="welcome-banner-content">
        {/* LEFT SIDE */}
        <div className="welcome-banner-info">
          <div className="welcome-banner-label">
            Employee Portal
          </div>

          <h3 className="welcome-banner-title">
            {greeting(istHour)}
            {name ? `, ${name}` : ''}!
          </h3>

          <div className="welcome-banner-meta">
            {employeeMeta && (
              <>
                <span className="welcome-banner-role">
                  {employeeMeta.designation}
                </span>

                <span className="welcome-banner-dot">•</span>

                <span>
                  {employeeMeta.department}
                </span>

                {employeeMeta.employeeId && (
                  <>
                    <span className="welcome-banner-dot">•</span>
                    <span>
                      ID: {employeeMeta.employeeId}
                    </span>
                  </>
                )}

                {employeeMeta.employmentType && (
                  <>
                    <span className="welcome-banner-dot">•</span>
                    <span>
                      {employeeMeta.employmentType}
                    </span>
                  </>
                )}
              </>
            )}
          </div>

          <div className="welcome-banner-quote">
            "{quote}"
          </div>
        </div>

        {/* RIGHT SIDE */}
        {(onRefresh ||
          onExport ||
          headerExtra ||
          belowActions) && (
          <div className="welcome-banner-controls">
            {headerExtra}

            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={refreshing}
                title="Refresh"
                className="welcome-refresh-btn"
              >
                <FaSyncAlt
                  size={13}
                  style={{
                    animation: refreshing
                      ? 'welcomeBannerSpin 0.8s linear infinite'
                      : 'none',
                  }}
                />
              </button>
            )}

            {onExport && (
              <button
                onClick={onExport}
                title="Export"
                className="welcome-refresh-btn"
              >
                <FaDownload size={13} />
              </button>
            )}

            {belowActions}
          </div>
        )}
      </div>

      <style>{`
        @keyframes welcomeBannerSpin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}