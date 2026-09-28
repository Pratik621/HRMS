import React from 'react';

export default function DistributionChart({ items, total, unit, loading, emptyText }) {
  if (loading) return <div className="distribution-empty" role="status">Loading chart…</div>;
  if (!total) return <div className="distribution-empty">{emptyText}</div>;

  return (
    <div className="distribution-chart">
      <div className="distribution-summary">
        <strong>{total.toLocaleString()}</strong>
        <span>{unit}</span>
        <span className="distribution-summary-note">Share of total</span>
      </div>
      <ul className="distribution-rows">
        {items.map(({ label, value }) => {
          const percent = (value / total) * 100;
          return (
            <li key={label}>
              <div className="distribution-label">
                <span>{label}</span>
                <span><strong>{value.toLocaleString()}</strong><small>{percent.toFixed(1)}%</small></span>
              </div>
              <div className="distribution-track" aria-hidden="true">
                <div className="distribution-fill" style={{ width: `${percent}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
