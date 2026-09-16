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

const dayOfYear = (d) => Math.floor((d - new Date(d.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));

const greeting = (hour) => (hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening');

export default function WelcomeBanner({ name, roleLabel, onRefresh, onExport, refreshing = false, headerExtra = null, belowActions = null }) {
  // Anchored to the trusted server clock, not this device's own clock/timezone — otherwise the
  // greeting and date shown here can drift from the actual India time the rest of the app uses.
  const now = getTrustedNow();
  const istHour = parseInt(getTrustedNowIST().split(' ')[1].split(':')[0], 10);
  const quote = QUOTES[dayOfYear(now) % QUOTES.length];

  return (
    <div style={{
      position: 'relative', overflow: 'hidden',
      background: QA_BANNER_GRADIENT,
      borderRadius: 20, padding: '24px 28px', marginBottom: 20,
      minHeight: 150, display: 'flex', flexDirection: 'column', justifyContent: 'center',
    }}>
      {/* Decorative floating shapes */}
      <div style={{ position: 'absolute', top: -40, right: 40, width: 140, height: 140, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: -50, right: 160, width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: 20, right: 220, width: 50, height: 50, borderRadius: '50%', background: 'rgba(255,255,255,0.10)', pointerEvents: 'none' }} />

      {(onRefresh || onExport || headerExtra) && (
        <div style={{ position: 'absolute', top: 18, right: 20, display: 'flex', alignItems: 'center', gap: 8, zIndex: 2 }}>
          {headerExtra}
          {onRefresh && (
            <button onClick={onRefresh} disabled={refreshing} title="Refresh" style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', cursor: refreshing ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FaSyncAlt size={12} style={{ animation: refreshing ? 'welcomeBannerSpin 0.8s linear infinite' : 'none' }} />
            </button>
          )}
          {onExport && (
            <button onClick={onExport} title="Export" style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FaDownload size={12} />
            </button>
          )}
        </div>
      )}

      {belowActions && (
        <div style={{ position: 'absolute', top: 58, right: 20, display: 'flex', alignItems: 'center', gap: 14, zIndex: 2 }}>
          {belowActions}
        </div>
      )}

      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase', letterSpacing: 0.6 }}>
            {greeting(istHour)}
          </span>
          {roleLabel && (
            <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: 'rgba(255,255,255,0.18)', borderRadius: 20, padding: '2px 10px' }}>
              {roleLabel}
            </span>
          )}
        </div>
        <h3 style={{ color: '#fff', fontWeight: 800, fontSize: 24, margin: 0 }}>Welcome back, {name || 'there'}!</h3>
        <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <span>{now.toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })}</span>
          <span style={{ opacity: 0.5 }}>·</span>
          <span style={{ fontStyle: 'italic' }}>"{quote}"</span>
        </div>
      </div>
      <style>{`@keyframes welcomeBannerSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
