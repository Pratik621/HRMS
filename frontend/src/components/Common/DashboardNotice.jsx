import React from 'react';
import { CheckCircle2, CircleAlert, TriangleAlert, Info, X } from 'lucide-react';
import './DashboardNotice.css';

const variants = {
  success: { Icon: CheckCircle2, label: 'Success' },
  error: { Icon: CircleAlert, label: 'Error' },
  warning: { Icon: TriangleAlert, label: 'Warning' },
  info: { Icon: Info, label: 'Information' },
};

export default function DashboardNotice({ type = 'info', text, onClose }) {
  const kind = type === 'danger' ? 'error' : (variants[type] ? type : 'info');
  const { Icon, label } = variants[kind];
  if (!text) return null;
  return (
    <div className={`dashboard-notice dashboard-notice--${kind}`} role={kind === 'error' || kind === 'warning' ? 'alert' : 'status'}>
      <Icon size={19} aria-hidden="true" className="dashboard-notice-icon" />
      <div className="dashboard-notice-content"><strong>{label}</strong><div>{text}</div></div>
      {onClose && <button type="button" onClick={onClose} aria-label="Dismiss message"><X size={17} aria-hidden="true" /></button>}
    </div>
  );
}
