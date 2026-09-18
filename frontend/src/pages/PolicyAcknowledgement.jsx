// frontend/src/pages/PolicyAcknowledgement.jsx
// Shared by OnboardingPage.jsx (offer-link acceptance) and OnboardingFormPage.jsx (onboarding
// form's Documents tab) — full policy text shown inline (scrollable), required checkbox below.
// The candidate must actually be able to read the document before ticking, not just see a
// bare checkbox.
import React from 'react';
import { CheckCircle } from 'lucide-react';
import { EMPLOYEE_POLICY_HANDBOOK } from '../data/employeePolicyHandbook';

export default function PolicyAcknowledgement({ title, checked, onChange, checkboxLabel }) {
    return (
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', background: '#f8fafc', borderBottom: '1px solid #e5e7eb', fontSize: 13, fontWeight: 700, color: '#374151' }}>
                {title}
            </div>
            <div
                style={{
                    maxHeight: 220,
                    overflowY: 'auto',
                    padding: '12px 14px',
                    fontSize: 12,
                    lineHeight: 1.6,
                    whiteSpace: 'pre-line',
                    fontFamily: 'monospace',
                    color: '#374151',
                    background: '#fff',
                }}
            >
                {EMPLOYEE_POLICY_HANDBOOK}
            </div>
            <label
                onClick={() => onChange(!checked)}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', borderTop: '1px solid #e5e7eb', background: checked ? '#f0fdf4' : '#fafafa', cursor: 'pointer' }}
            >
                <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${checked ? '#16a34a' : '#cbd5e1'}`, background: checked ? '#16a34a' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                    {checked && <CheckCircle size={12} color="#fff" strokeWidth={3} />}
                </div>
                <span style={{ fontSize: 13, color: '#374151' }}>{checkboxLabel} <span style={{ color: '#ef4444' }}>*</span></span>
            </label>
        </div>
    );
}
