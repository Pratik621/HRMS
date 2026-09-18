// src/components/Common/ConfirmModal.jsx
// Generic centered/blurred confirmation popup — same visual language as the Clock Out and
// Break confirm popups (BreakWidget.jsx's BreakConfirmModal): blurred backdrop, centered
// white card, icon, title, message, Confirm/Cancel buttons. Shared here so any page needing
// a "are you sure?" prompt doesn't reinvent the style.
import React from 'react';
import { Spinner } from 'react-bootstrap';

export default function ConfirmModal({
    icon = '❓',
    title,
    message,
    confirmLabel = 'Yes',
    confirmColor = '#6366f1',
    busy = false,
    onConfirm,
    onCancel,
}) {
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 18, padding: '32px 28px', boxShadow: '0 24px 64px rgba(0,0,0,0.22)', textAlign: 'center', maxWidth: 340, width: '90%' }}>
                <div style={{ fontSize: 44, marginBottom: 10 }}>{icon}</div>
                <div style={{ fontWeight: 700, fontSize: 18, color: '#111827', marginBottom: 8 }}>{title}</div>
                <div style={{ color: '#6b7280', fontSize: 14, marginBottom: 24 }}>{message}</div>
                <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={onCancel} disabled={busy} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', fontWeight: 600, fontSize: 14, cursor: busy ? 'not-allowed' : 'pointer' }}>
                        Cancel
                    </button>
                    <button onClick={onConfirm} disabled={busy} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', background: confirmColor, color: '#fff', fontWeight: 700, fontSize: 14, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {busy ? <Spinner size="sm" animation="border" /> : confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
