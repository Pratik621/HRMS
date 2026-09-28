import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FaGift, FaCalendarAlt } from 'react-icons/fa';
import { getUpcomingHolidays } from '../../data/holidays';

const daysUntil = (dateStr) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const target = new Date(dateStr);

  return Math.round(
    (target - today) / (1000 * 60 * 60 * 24)
  );
};

const fmtShort = (dateStr) =>
  new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    weekday: 'short'
  });

export default function HolidayCountdownCard({ limit = 3 }) {
  const navigate = useNavigate();
  const upcoming = getUpcomingHolidays(new Date(), limit);
  const next = upcoming[0];

  return (
    <div
      style={{
        background: '#FFFFFF',
        border: '1px solid #E5E7EB',
        borderRadius: 18,
        padding: 18,
        color: '#1F2937',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: '0 2px 8px rgba(15, 23, 42, 0.06)'
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 10
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            color: '#6B7280'
          }}
        >
          Holidays
        </div>

        <button
          type="button"
          onClick={() => navigate('/profile')}
          aria-label="View all holidays"
          style={{
            background: '#F3F4F6',
            border: '1px solid #D1D5DB',
            color: '#374151',
            fontSize: 11,
            fontWeight: 700,
            borderRadius: 20,
            padding: '8px 14px',
            minHeight: 36,
            cursor: 'pointer',
            transition:
              'background-color 0.2s ease, border-color 0.2s ease'
          }}
          onFocus={(event) => {
            event.currentTarget.style.outline =
              '3px solid rgba(31, 41, 55, 0.25)';
            event.currentTarget.style.outlineOffset = '2px';
          }}
          onBlur={(event) => {
            event.currentTarget.style.outline = 'none';
          }}
        >
          View All
        </button>
      </div>

      {!next ? (
        <div
          style={{
            fontSize: 13,
            color: '#6B7280'
          }}
        >
          No upcoming holidays scheduled
        </div>
      ) : (
        <>
          {/* Next Holiday */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 10
            }}
          >
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 12,
                background: '#F3F4F6',
                color: '#374151',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                fontSize: 20
              }}
            >
              <FaGift size={18} />
            </div>

            <div
              style={{
                minWidth: 0
              }}
            >
              <div
                style={{
                  fontSize: 17,
                  fontWeight: 800,
                  color: '#111827',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {next.name}
              </div>

              <div
                style={{
                  fontSize: 12,
                  color: '#6B7280',
                  marginTop: 2
                }}
              >
                {fmtShort(next.date)} · in {daysUntil(next.date)} day
                {daysUntil(next.date) === 1 ? '' : 's'}
              </div>
            </div>
          </div>

          {/* Remaining Holidays */}
          {upcoming.slice(1).map((h) => (
            <div
              key={h.date}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '5px 0',
                borderTop: '1px solid #E5E7EB',
                fontSize: 12
              }}
            >
              <FaCalendarAlt
                size={10}
                style={{
                  color: '#6B7280',
                  flexShrink: 0
                }}
              />

              <span
                style={{
                  flex: 1,
                  fontWeight: 500,
                  color: '#374151'
                }}
              >
                {h.name}
              </span>

              <span
                style={{
                  color: '#6B7280',
                  whiteSpace: 'nowrap'
                }}
              >
                {fmtShort(h.date)}
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
