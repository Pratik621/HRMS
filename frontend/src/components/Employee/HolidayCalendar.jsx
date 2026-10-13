// src/components/Employee/HolidayCalendar.jsx

import React, { useMemo, useState } from 'react';
import { OverlayTrigger, Popover } from 'react-bootstrap';
import { FaCalendarAlt, FaChevronLeft, FaChevronRight } from 'react-icons/fa';
import { holidays } from '../../data/holidays';
import './HolidayCalendar.css';

// Muted navy and slate colors match the employee dashboard.
const HC = {
  primary: '#1f4e79',   // shared (USA & India)
  india: '#475569',
  usa: '#52718c',
  optional: '#6b7280',
  border: '#E5E7EB',
  borderSoft: '#EEF2F7',
  textMuted: '#667085',
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const colorForHoliday = (holiday) => {
  if (holiday.type === 'optional_holiday') return HC.optional;
  if (holiday.region === 'India') return HC.india;
  if (holiday.region === 'USA') return HC.usa;
  return HC.primary; // USA & India / shared
};

const formatDate = (dateString) => {
  const date = new Date(`${dateString}T00:00:00`);
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
};

const reasonFor = (holiday) => {
  if (holiday.note) return holiday.note;
  const kind = holiday.type === 'optional_holiday' ? 'an optional holiday' : 'a public holiday';
  return `${holiday.name} is observed as ${kind} for ${holiday.region}.`;
};

function CalendarMonth({ year, month, holidaysByDate, todayStr }) {
  const first = new Date(year, month - 1, 1).getDay();
  const totalDays = new Date(year, month, 0).getDate();

  const cells = [];
  for (let i = 0; i < first; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="hc-month">

      <div className="hc-weekdays">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => <span key={i}>{d}</span>)}
      </div>
      <div className="hc-days">
        {cells.map((day, idx) => {
          if (day === null) return <span key={idx} className="hc-day hc-day--empty">.</span>;

          const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const dateHolidays = holidaysByDate[dateStr] || [];
          const holiday = dateHolidays[0];
          const todayClass = dateStr === todayStr ? ' hc-day--today' : '';
          const dow = new Date(year, month - 1, day).getDay();
          const isWeekend = dow === 0 || dow === 6;

          if (!holiday) {
            return <span key={idx} aria-current={dateStr === todayStr ? 'date' : undefined} className={`hc-day ${isWeekend ? 'hc-day--weekend' : ''}${todayClass}`}>{day}</span>;
          }

          return (
            <OverlayTrigger
              key={idx}
              trigger="click"
              placement="top"
              rootClose
              overlay={
                <Popover id={`hc-pop-${dateStr}`} style={{ maxWidth: 240 }}>
                  <Popover.Header style={{ fontSize: 12.5, fontWeight: 700 }}>
                    {dateHolidays.map(h => h.name).join(', ')}
                  </Popover.Header>
                  <Popover.Body style={{ fontSize: 11.5 }}>
                    <div className="mb-1" style={{ color: '#475467' }}>{formatDate(holiday.date)}</div>
                    {dateHolidays.map(h => (
                      <div key={h.name + h.region} className="hc-popover-detail">
                        <strong>{h.name}</strong><div>{h.region} · {h.type === 'optional_holiday' ? 'Optional' : 'Public holiday'}</div>
                        <div>{reasonFor(h)}</div>
                      </div>
                    ))}
                  </Popover.Body>
                </Popover>
              }
            >
              <button
                type="button"
                className={`hc-day hc-day--holiday${todayClass}`}
                aria-current={dateStr === todayStr ? 'date' : undefined}
                style={{ '--hc-color': colorForHoliday(holiday) }}
                aria-label={`${dateHolidays.map(h => h.name).join(', ')} — ${formatDate(holiday.date)}`}
              >
                {day}
              </button>
            </OverlayTrigger>
          );
        })}
      </div>
    </div>
  );
}

const localDateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const availableYears = [...new Set(holidays.map(h => Number(h.date.slice(0, 4))))].sort((a, b) => a - b);

const HolidayCalendar = ({ employeeRegion = 'All' }) => {
  const today = new Date();
  const todayStr = localDateKey(today);
  const [viewDate, setViewDate] = useState(() => {
    const year = availableYears.includes(today.getFullYear()) ? today.getFullYear() : availableYears.at(-1);
    return { year, month: year === today.getFullYear() ? today.getMonth() + 1 : 1 };
  });
  const { year, month } = viewDate;
  const regionalHolidays = useMemo(() => holidays
    .filter(h => h.region === 'USA & India' || h.region === employeeRegion || employeeRegion === 'All')
    .sort((a, b) => a.date.localeCompare(b.date)), [employeeRegion]);
  const holidaysByDate = useMemo(() => {
    const map = {};
    regionalHolidays.forEach(h => { (map[h.date] ||= []).push(h); });
    return map;
  }, [regionalHolidays]);
  const upcoming = regionalHolidays.filter(h => h.date >= todayStr).slice(0, 4);
  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
  const monthHolidays = regionalHolidays.filter(h => h.date.startsWith(monthPrefix));
  const moveMonth = (offset) => {
    const next = new Date(year, month - 1 + offset, 1);
    setViewDate({ year: next.getFullYear(), month: next.getMonth() + 1 });
  };
  const minYear = availableYears[0];
  const maxYear = availableYears.at(-1);

  return (
    <section className="hc-card" aria-labelledby="hc-title">
      <div className="hc-header">
        <div className="hc-title-wrap">
          <div className="hc-icon-circle"><FaCalendarAlt aria-hidden="true" /></div>
          <div><h2 id="hc-title" className="hc-title">Company Holiday Calendar</h2>
            <p className="hc-subtitle">{employeeRegion === 'All' ? 'United States & India' : employeeRegion} · Plan your time off</p>
          </div>
        </div>
        <span className="hc-count">{monthHolidays.length} {monthHolidays.length === 1 ? 'holiday' : 'holidays'} this month</span>
      </div>
      <div className="hc-body hc-layout">
        <div>
          <div className="hc-month-navigation">
            <h3 aria-live="polite">{MONTH_NAMES[month - 1]} {year}</h3>
            <div className="hc-controls">
              <button type="button" onClick={() => setViewDate({ year: today.getFullYear(), month: today.getMonth() + 1 })} disabled={!availableYears.includes(today.getFullYear())} className="hc-today-btn">Today</button>
              <button type="button" aria-label="Previous month" disabled={year === minYear && month === 1} onClick={() => moveMonth(-1)}><FaChevronLeft aria-hidden="true" /></button>
              <button type="button" aria-label="Next month" disabled={year === maxYear && month === 12} onClick={() => moveMonth(1)}><FaChevronRight aria-hidden="true" /></button>
            </div>
          </div>
          <CalendarMonth key={monthPrefix} year={year} month={month} holidaysByDate={holidaysByDate} todayStr={todayStr} />
          <div className="hc-legend">
            {[['Shared', HC.primary], ['India', HC.india], ['USA', HC.usa], ['Optional', HC.optional]].map(([label, color]) => (
              <span key={label} className="hc-legend-item"><span className="hc-legend-dot" style={{ background: color }} />{label}</span>
            ))}
          </div>
          <p className="hc-month-note">{monthHolidays.length ? 'Select a highlighted date for holiday details.' : 'No company holidays for your region this month.'}</p>
        </div>
        <aside className="hc-upcoming-panel" aria-labelledby="hc-upcoming-title">
          <h3 id="hc-upcoming-title">Upcoming holidays</h3>
          <p className="hc-subtitle">The next holidays for your region</p>
          {upcoming.length ? <ul className="hc-holiday-list">
            {upcoming.map(h => <li key={h.date + h.name + h.region}>
              <div className="hc-date-tile"><span>{new Date(h.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' })}</span><strong>{Number(h.date.slice(8))}</strong></div>
              <div className="hc-holiday-info"><strong>{h.name}</strong><span>{h.region} · {h.type === 'optional_holiday' ? 'Optional' : 'Public holiday'}</span><span>{new Date(h.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric' })}</span></div>
            </li>)}
          </ul> : <p className="hc-empty">No upcoming holidays in the published calendar.</p>}
        </aside>
      </div>
      <div className="hc-footer">Holiday dates are subject to change. Contact HR for the latest updates.</div>
    </section>
  );
};

export default HolidayCalendar;
