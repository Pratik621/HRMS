import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Spinner } from 'react-bootstrap';
import { Coffee, Square, Clock, Users, ChevronDown, CheckCircle, History } from 'lucide-react';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';
import { useAuth } from '../../context/AuthContext';

// ── Break type definitions ────────────────────────────────────────────────────
const BREAK_TYPES = [
    { key: 'tea_break_1', label: 'Tea Break 1', minutes: 15, emoji: '☕' },
    { key: 'tea_break_2', label: 'Tea Break 2', minutes: 15, emoji: '☕' },
    { key: 'lunch_break', label: 'Lunch Break',  minutes: 30, emoji: '🍽️' },
];

const breakDef   = (key) => BREAK_TYPES.find(t => t.key === key) || { label: 'Break', emoji: '☕', minutes: 0 };
const breakLabel = (key) => breakDef(key).label;
const breakEmoji = (key) => breakDef(key).emoji;

// ── Helpers ───────────────────────────────────────────────────────────────────
const AVATAR_COLORS = ['#6366f1','#8b5cf6','#10b981','#f59e0b','#ef4444','#0ea5e9','#ec4899'];
const avatarColor = (str) => AVATAR_COLORS[((str || '').charCodeAt(0) || 0) % AVATAR_COLORS.length];
const initials    = (f, l) => ((f || '')[0] || '?').toUpperCase() + ((l || '')[0] || '').toUpperCase();

const fmtDuration = (start) => {
    const diff = Math.floor((Date.now() - new Date(start).getTime()) / 1000);
    const m = Math.floor(diff / 60);
    const s = diff % 60;
    if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
    return `${m}m ${String(s).padStart(2, '0')}s`;
};

const fmtTime = (iso) => {
    if (!iso) return '--:--';
    const d   = new Date(iso);
    const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
    const h   = ist.getUTCHours(), m = ist.getUTCMinutes();
    return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

const fmtMins = (mins) => {
    if (!mins && mins !== 0) return '—';
    if (mins >= 60) return `${Math.floor(mins / 60)}h ${mins % 60}m`;
    return `${mins} min`;
};

const fmtHMS = (totalSeconds) => {
    const s = Math.max(0, Math.floor(totalSeconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return [h, m, sec].map(v => String(v).padStart(2, '0')).join(':');
};

// ── Shared centered confirmation popup — same visual pattern as the Clock
// Out confirmation (blurred backdrop, centered card, icon/title/message,
// two buttons) so every break start/end action confirms the same way.
function BreakConfirmModal({ icon = '☕', title, message, confirmLabel = 'Yes', confirmColor = '#f97316', busy = false, onConfirm, onCancel }) {
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 18, padding: '32px 28px', boxShadow: '0 24px 64px rgba(0,0,0,0.22)', textAlign: 'center', maxWidth: 320, width: '90%' }}>
                <div style={{ fontSize: 44, marginBottom: 10 }}>{icon}</div>
                <div style={{ fontWeight: 700, fontSize: 18, color: '#111827', marginBottom: 8 }}>{title}</div>
                <div style={{ color: '#6b7280', fontSize: 14, marginBottom: 24 }}>{message}</div>
                <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={onConfirm} disabled={busy} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', background: confirmColor, color: '#fff', fontWeight: 700, fontSize: 14, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.7 : 1 }}>
                        {busy ? <Spinner size="sm" animation="border" /> : confirmLabel}
                    </button>
                    <button onClick={onCancel} disabled={busy} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', fontWeight: 600, fontSize: 14, cursor: busy ? 'not-allowed' : 'pointer' }}>
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Break dropdown (fixed-position, escapes overflow:hidden parents) ──────────
function BreakDropdown({ activeBreak, usedTypes, canInteract, acting, error, onStart, onEnd }) {
    const [open, setOpen]           = useState(false);
    const [pendingType, setPending] = useState(null);
    const [confirmEnd, setConfirmEnd] = useState(false);
    const allUsed    = BREAK_TYPES.every(t => usedTypes.includes(t.key));
    const pendingDef = BREAK_TYPES.find(t => t.key === pendingType);

    const openDropdown = () => {
        if (!canInteract || allUsed) return;
        setOpen(o => !o);
        setPending(null);
    };

    const btnBase = {
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '8px 16px', borderRadius: 10, border: 'none',
        fontSize: 13, fontWeight: 800,
        whiteSpace: 'nowrap',
    };

    if (activeBreak) return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <button onClick={() => setConfirmEnd(true)} disabled={acting} style={{
                ...btnBase, background: '#f97316', color: '#fff', gap: 8,
                cursor: acting ? 'not-allowed' : 'pointer', opacity: acting ? 0.7 : 1,
            }}>
                {acting ? <Spinner size="sm" animation="border" /> : <Square size={14} />}
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Clock size={13} />
                    {fmtDuration(activeBreak.break_start)}
                </span>
                <span style={{ width: 1, alignSelf: 'stretch', background: 'rgba(255,255,255,0.5)' }} />
                <span style={{ fontWeight: 700 }}>End</span>
            </button>
            {error && <div style={{ fontSize: 10, color: '#ef4444' }}>{error}</div>}
            {confirmEnd && (
                <BreakConfirmModal
                    icon="🕐"
                    title={`End ${breakLabel(activeBreak.break_type)}?`}
                    message={`You've been on break for ${fmtDuration(activeBreak.break_start)}. End it now?`}
                    confirmLabel="Yes, End"
                    busy={acting}
                    onConfirm={() => { setConfirmEnd(false); onEnd(); }}
                    onCancel={() => setConfirmEnd(false)}
                />
            )}
        </div>
    );

    return (
        <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <button onClick={openDropdown}
                disabled={acting || !canInteract || allUsed}
                style={{
                    ...btnBase,
                    background: allUsed ? '#e5e7eb' : '#f4a46b',
                    color: allUsed ? '#fcfdff' : '#fff',
                    cursor: (acting || !canInteract || allUsed) ? 'not-allowed' : 'pointer',
                    opacity: (acting || !canInteract) ? 0.55 : 1,
                }}
            >
                {acting ? <Spinner size="sm" animation="border" /> : <Coffee size={15} />}
                {allUsed ? 'All Breaks Used' : 'Start Break'}
                {!allUsed && <ChevronDown size={12} />}
            </button>

            {open && (
                <div
                    onClick={() => setOpen(false)}
                    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                    <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 18, minWidth: 260, maxWidth: 320, width: '90%', boxShadow: '0 24px 64px rgba(0,0,0,0.22)', overflow: 'hidden' }}>
                        <div style={{ padding: '16px 18px 10px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.6, textAlign: 'center' }}>
                            Select Break Type
                        </div>
                        {BREAK_TYPES.map((t) => {
                            const used = usedTypes.includes(t.key);
                            return (
                                <button key={t.key}
                                    onClick={() => { if (!used) { setPending(t.key); setOpen(false); } }}
                                    disabled={used}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 10,
                                        width: '100%', padding: '12px 18px',
                                        border: 'none', textAlign: 'left',
                                        background: used ? '#fafafa' : 'transparent',
                                        cursor: used ? 'not-allowed' : 'pointer',
                                        borderTop: '1px solid #f3f4f6',
                                        transition: 'background 0.15s',
                                    }}
                                    onMouseEnter={e => { if (!used) e.currentTarget.style.background = '#f5f3ff'; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = used ? '#fafafa' : 'transparent'; }}
                                >
                                    <span style={{ fontSize: 20 }}>{t.emoji}</span>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: 14, fontWeight: 600, color: used ? '#9ca3af' : '#111827' }}>{t.label}</div>
                                        <div style={{ fontSize: 11, color: '#9ca3af' }}>{t.minutes} mins</div>
                                    </div>
                                    {used
                                        ? <CheckCircle size={15} color="#10b981" />
                                        : <span style={{ fontSize: 10, color: '#6366f1', fontWeight: 700 }}>USE</span>}
                                </button>
                            );
                        })}
                        <button onClick={() => setOpen(false)} style={{
                            width: '100%', padding: '12px 0', border: 'none', borderTop: '1px solid #f3f4f6',
                            background: '#fafafa', color: '#374151', fontWeight: 600, fontSize: 13, cursor: 'pointer',
                        }}>
                            Cancel
                        </button>
                    </div>
                </div>
            )}
            {error && <div style={{ fontSize: 10, color: '#ef4444', textAlign: 'center', maxWidth: 160 }}>{error}</div>}
            {pendingType && (
                <BreakConfirmModal
                    icon={pendingDef?.emoji}
                    title={`Start ${pendingDef?.label}?`}
                    message={`Are you sure you want to go for a ${pendingDef?.minutes}-minute break?`}
                    confirmLabel="Yes, Start"
                    confirmColor="#6366f1"
                    busy={acting}
                    onConfirm={() => { setPending(null); onStart(pendingType); }}
                    onCancel={() => setPending(null)}
                />
            )}
        </div>
    );
}

// ── Simple unlimited Start/End break control (Sales department) ───────────────
// Starting a break here always goes through a note popover first — so every
// Sales break can be traced back to what it was for, not just a timestamp range.
function SimpleBreakControl({ activeBreak, canInteract, acting, error, totalSeconds, breaks, onStart, onEnd }) {
    const [open, setOpen] = useState(false);
    const [note, setNote] = useState('');
    const [showHistory, setShowHistory] = useState(false);
    const [confirmEnd, setConfirmEnd] = useState(false);
    const completedCount = (breaks || []).filter(b => b.break_end).length;

    const btnBase = {
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '8px 16px', borderRadius: 10, border: 'none',
        fontSize: 13, fontWeight: 800,
        whiteSpace: 'nowrap',
    };

    const openNoteModal = () => {
        if (acting || !canInteract) return;
        setNote('');
        setOpen(true);
    };

    const confirmStart = () => {
        setOpen(false);
        onStart(note.trim());
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            {activeBreak ? (
                <>
                    <button onClick={() => setConfirmEnd(true)} disabled={acting} style={{
                        ...btnBase, background: '#f97316', color: '#fff', gap: 8,
                        cursor: acting ? 'not-allowed' : 'pointer', opacity: acting ? 0.7 : 1,
                    }}>
                        {acting ? <Spinner size="sm" animation="border" /> : <Square size={14} />}
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Clock size={13} />
                            {fmtDuration(activeBreak.break_start)}
                        </span>
                        <span style={{ width: 1, alignSelf: 'stretch', background: 'rgba(255,255,255,0.5)' }} />
                        <span style={{ fontWeight: 700 }}>End Break</span>
                    </button>
                    {activeBreak.break_note && (
                        <div style={{
                            fontSize: 10, color: 'rgba(255,255,255,0.85)', fontStyle: 'italic',
                            maxWidth: 200, textAlign: 'center', marginTop: 2,
                        }}>
                            "{activeBreak.break_note}"
                        </div>
                    )}
                </>
            ) : (
                <button onClick={openNoteModal} disabled={acting || !canInteract} style={{
                    ...btnBase,
                    background: '#f4a46b', color: '#fff',
                    cursor: (acting || !canInteract) ? 'not-allowed' : 'pointer',
                    opacity: (acting || !canInteract) ? 0.55 : 1,
                }}>
                    {acting ? <Spinner size="sm" animation="border" /> : <Coffee size={15} />}
                    Start Break
                </button>
            )}

            {open && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#fff', borderRadius: 18, padding: '32px 28px', boxShadow: '0 24px 64px rgba(0,0,0,0.22)', textAlign: 'center', maxWidth: 340, width: '90%' }}>
                        <div style={{ fontSize: 44, marginBottom: 10 }}>☕</div>
                        <div style={{ fontWeight: 700, fontSize: 18, color: '#111827', marginBottom: 8 }}>Add a note for this break</div>
                        <div style={{ color: '#6b7280', fontSize: 14, marginBottom: 16 }}>Optional — helps your manager see what the break was for.</div>
                        <textarea
                            autoFocus
                            value={note}
                            onChange={e => setNote(e.target.value)}
                            placeholder="e.g. client call, quick errand..."
                            maxLength={500}
                            rows={3}
                            style={{
                                width: '100%', resize: 'vertical', fontSize: 13, textAlign: 'left',
                                border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 12px',
                                marginBottom: 20, fontFamily: 'inherit',
                            }}
                        />
                        <div style={{ display: 'flex', gap: 10 }}>
                            <button
                                onClick={confirmStart}
                                style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', background: '#f97316', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
                            >
                                Start Break
                            </button>
                            <button
                                onClick={() => setOpen(false)}
                                style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {confirmEnd && (
                <BreakConfirmModal
                    icon="🕐"
                    title="End Break?"
                    message={activeBreak ? `You've been on break for ${fmtDuration(activeBreak.break_start)}. End it now?` : 'End your current break now?'}
                    confirmLabel="Yes, End"
                    busy={acting}
                    onConfirm={() => { setConfirmEnd(false); onEnd(); }}
                    onCancel={() => setConfirmEnd(false)}
                />
            )}

            <div style={{
                marginTop: 4, background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.25)',
                borderRadius: 10, padding: '2px 4px 4px', textAlign: 'center', minWidth: 180,
            }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Today's Break
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', marginTop: 1 }}>
                    Total Break Time: {fmtHMS(totalSeconds)}
                </div>
                {completedCount > 0 && (
                    <button onClick={() => setShowHistory(true)} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4,
                        background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.3)',
                        borderRadius: 8, padding: '3px 10px', fontSize: 10, fontWeight: 700,
                        color: '#fff', cursor: 'pointer',
                    }}>
                        <History size={11} /> View History ({completedCount})
                    </button>
                )}
            </div>
            {error && <div style={{ fontSize: 10, color: '#ef4444' }}>{error}</div>}

            {showHistory && <BreakHistoryModal breaks={breaks} onClose={() => setShowHistory(false)} />}
        </div>
    );
}

// ── Today's break history — centered modal (same visual pattern as the
// clock-out confirmation and the start-break note prompt above) ──────────────
function BreakHistoryModal({ breaks, onClose }) {
    const done = (breaks || []).filter(b => b.break_end).sort((a, b) => new Date(a.break_start) - new Date(b.break_start));
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#fff', borderRadius: 18, padding: '28px 24px', boxShadow: '0 24px 64px rgba(0,0,0,0.22)', maxWidth: 380, width: '90%', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
                <div style={{ textAlign: 'center', marginBottom: 16 }}>
                    <div style={{ fontSize: 40, marginBottom: 8 }}>📋</div>
                    <div style={{ fontWeight: 700, fontSize: 18, color: '#111827' }}>Today's Break History</div>
                    <div style={{ color: '#6b7280', fontSize: 13, marginTop: 2 }}>{done.length} break{done.length === 1 ? '' : 's'} completed today</div>
                </div>

                <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                    {done.length === 0 ? (
                        <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13, padding: '16px 0' }}>No breaks completed yet today.</div>
                    ) : done.map(b => (
                        <div key={b.id} style={{ border: '1px solid #f3f4f6', borderRadius: 10, padding: '10px 12px', textAlign: 'left', background: '#fafafa' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>
                                    ☕ {fmtTime(b.break_start)} → {fmtTime(b.break_end)}
                                </span>
                                <span style={{ fontSize: 11, fontWeight: 700, color: '#f97316' }}>
                                    {fmtMins(b.break_duration_minutes)}
                                </span>
                            </div>
                            {b.break_note && (
                                <div style={{ fontSize: 12, color: '#6b7280', fontStyle: 'italic', marginTop: 4 }}>
                                    "{b.break_note}"
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                <button
                    onClick={onClose}
                    style={{ padding: '10px 0', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
                >
                    Close
                </button>
            </div>
        </div>
    );
}

// ── Individual break history (compact, shown under the button in inline-button mode) ──
function MyBreakHistory({ breaks }) {
    const done = (breaks || []).filter(b => b.break_end);
    if (done.length === 0) return null;
    return (
        <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'center' }}>
            {done.map(b => (
                <span key={b.id} style={{
                    fontSize: 10, background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.75)',
                    borderRadius: 10, padding: '2px 8px', whiteSpace: 'nowrap',
                    border: '1px solid rgba(255,255,255,0.15)',
                }}>
                    {breakEmoji(b.break_type)} {fmtTime(b.break_start)} → {fmtTime(b.break_end)}
                    {b.break_duration_minutes ? ` · ${b.break_duration_minutes}m` : ''}
                </span>
            ))}
        </div>
    );
}

// ── Team break panel (active + today's history) ───────────────────────────────
function TeamPanel({ todayBreaks, loading }) {
    const active    = (todayBreaks || []).filter(b => !b.break_end);
    const completed = (todayBreaks || []).filter(b => b.break_end);

    const EmpChip = ({ b, live }) => {
        const emp   = b.employee || {};
        const name  = `${emp.first_name || ''} ${emp.last_name || ''}`.trim() || b.employee_id;
        const color = avatarColor(emp.first_name);
        return (
            <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 12px', borderBottom: '1px solid #f9fafb',
            }}>
                <div style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    background: color, color: '#fff', fontSize: 10, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    {initials(emp.first_name, emp.last_name)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {name}
                    </div>
                    <div style={{ fontSize: 11, color: live ? '#d97706' : '#6b7280', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span>{breakEmoji(b.break_type)}</span>
                        <span>{breakLabel(b.break_type)}</span>
                        {live
                            ? <><span style={{ color: '#d1d5db' }}>·</span><span>{fmtDuration(b.break_start)}</span></>
                            : <><span style={{ color: '#d1d5db' }}>·</span><span>{fmtTime(b.break_start)} → {fmtTime(b.break_end)}</span></>
                        }
                    </div>
                    {b.break_note && (
                        <div style={{ fontSize: 10, color: '#9ca3af', fontStyle: 'italic', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            "{b.break_note}"
                        </div>
                    )}
                </div>
                {live
                    ? <span style={{ fontSize: 9, background: '#fef3c7', color: '#92400e', borderRadius: 99, padding: '2px 7px', fontWeight: 700, flexShrink: 0 }}>LIVE</span>
                    : <span style={{ fontSize: 10, color: '#9ca3af', flexShrink: 0 }}>{fmtMins(b.break_duration_minutes)}</span>
                }
            </div>
        );
    };

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
            <Spinner size="sm" animation="border" variant="secondary" />
        </div>
    );

    if (active.length === 0 && completed.length === 0) return (
        <div style={{ fontSize: 12, color: '#d1d5db', textAlign: 'center', padding: '14px 0' }}>
            No breaks today
        </div>
    );

    return (
        <div>
            {/* Active now */}
            {active.length > 0 && (
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px 4px', background: '#fffbeb' }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#f59e0b', display: 'inline-block', boxShadow: '0 0 0 2px #fde68a' }} />
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            On Break Now
                        </span>
                        <span style={{ fontSize: 10, background: '#f59e0b', color: '#fff', borderRadius: 99, padding: '0 6px', fontWeight: 700 }}>{active.length}</span>
                    </div>
                    {active.map(b => <EmpChip key={b.id} b={b} live={true} />)}
                </div>
            )}

            {/* Today's history */}
            {completed.length > 0 && (
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px 4px', background: '#f0fdf4', borderTop: active.length ? '1px solid #f3f4f6' : 'none' }}>
                        <History size={11} color="#16a34a" />
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#15803d', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            Completed Today
                        </span>
                        <span style={{ fontSize: 10, background: '#16a34a', color: '#fff', borderRadius: 99, padding: '0 6px', fontWeight: 700 }}>{completed.length}</span>
                    </div>
                    {completed.map(b => <EmpChip key={b.id} b={b} live={false} />)}
                </div>
            )}
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────
// mode="inline-button" — compact button, sits next to clock button
// mode="team-panel"    — full team break activity card (managers / admin)
// mode="full"          — legacy combined card
export default function BreakWidget({ isClockedIn = false, isClockedOut = false, mode = 'full', unlimitedBreaks = false }) {
    const { user } = useAuth();
    const [activeBreak,   setActiveBreak]   = useState(null);
    const [usedTypes,     setUsedTypes]     = useState([]);
    const [sessionBreaks, setSessionBreaks] = useState([]); // own breaks this session
    const [todayBreaks,   setTodayBreaks]   = useState([]); // team breaks today
    const [totalBreakSecondsToday, setTotalBreakSecondsToday] = useState(0);
    const [loading,       setLoading]       = useState(true);
    const [acting,        setActing]        = useState(false);
    const [error,         setError]         = useState('');
    const [, setTicker] = useState(0);
    const timerRef = useRef(null);

    const isManager = ['admin', 'sub_admin', 'manager', 'hr'].includes(user?.role);

    const fetchStatus = useCallback(async () => {
        try {
            if (mode === 'inline-button') {
                const res = await axios.get(API_ENDPOINTS.BREAK_MY_STATUS);
                setActiveBreak(res.data.active_break || null);
                setUsedTypes(res.data.used_break_types || []);
                setSessionBreaks(res.data.session_breaks || []);
                setTotalBreakSecondsToday(res.data.total_break_seconds_today || 0);
            } else if (mode === 'team-panel') {
                if (!isManager) return;
                const res = await axios.get(API_ENDPOINTS.BREAK_TEAM_TODAY);
                setTodayBreaks(res.data.breaks || []);
            } else {
                // full mode
                const [myRes, teamRes] = await Promise.allSettled([
                    axios.get(API_ENDPOINTS.BREAK_MY_STATUS),
                    isManager ? axios.get(API_ENDPOINTS.BREAK_TEAM_TODAY) : Promise.resolve({ data: { breaks: [] } }),
                ]);
                if (myRes.status === 'fulfilled') {
                    setActiveBreak(myRes.value.data.active_break || null);
                    setUsedTypes(myRes.value.data.used_break_types || []);
                    setSessionBreaks(myRes.value.data.session_breaks || []);
                    setTotalBreakSecondsToday(myRes.value.data.total_break_seconds_today || 0);
                }
                if (teamRes.status === 'fulfilled') setTodayBreaks(teamRes.value.data.breaks || []);
            }
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, [isManager, mode]);

    // Fetch once on mount only — no background 30s poll. Own break status already refreshes
    // right after every start/end action (see handleStart/handleEnd below); team-panel/full
    // mode data refreshes on next page load rather than continuously in the background.
    useEffect(() => { fetchStatus(); }, [fetchStatus]);

    // Live ticker for active breaks
    useEffect(() => {
        const active = mode === 'team-panel'
            ? todayBreaks.some(b => !b.break_end)
            : !!activeBreak;
        if (active) {
            timerRef.current = setInterval(() => setTicker(t => t + 1), 1000);
        } else {
            clearInterval(timerRef.current);
        }
        return () => clearInterval(timerRef.current);
    }, [activeBreak, todayBreaks, mode]);

    const handleStart = async (breakType, note) => {
        setActing(true); setError('');
        try {
            const res = await axios.post(API_ENDPOINTS.BREAK_START, { break_type: breakType, note });
            // The button/timer must flip to "on break" the instant this response lands — it
            // already carries everything needed for that. fetchStatus() below additionally
            // refreshes used_break_types/session_breaks (which this response doesn't include),
            // but that's secondary UI (which OTHER break buttons show as "already used") and
            // is fetched in the background rather than holding the button disabled for it —
            // the server independently re-validates "already used" on the next start attempt
            // regardless, so a moment of stale client-side state here can't cause a double-use.
            setActiveBreak(res.data.break);
            fetchStatus();
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to start break');
        } finally { setActing(false); }
    };

    const handleEnd = async () => {
        setActing(true); setError('');
        try {
            const res = await axios.post(API_ENDPOINTS.BREAK_END);
            setActiveBreak(null);
            // Apply the totals this response already carries immediately; fetchStatus() below
            // is only needed for used_break_types/session_breaks and runs in the background —
            // see handleStart above for why that's safe.
            if (res.data.total_break_seconds_today != null) setTotalBreakSecondsToday(res.data.total_break_seconds_today);
            fetchStatus();
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to end break');
        } finally { setActing(false); }
    };

    const canInteract = isClockedIn && !isClockedOut;

    // ── inline-button mode ────────────────────────────────────────────────────
    if (mode === 'inline-button') {
        const liveElapsedSeconds = activeBreak
            ? Math.floor((Date.now() - new Date(activeBreak.break_start).getTime()) / 1000)
            : 0;
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                {unlimitedBreaks ? (
                    <SimpleBreakControl
                        activeBreak={activeBreak}
                        canInteract={canInteract}
                        acting={acting}
                        error={error}
                        totalSeconds={totalBreakSecondsToday + liveElapsedSeconds}
                        breaks={sessionBreaks}
                        onStart={(note) => handleStart(undefined, note)}
                        onEnd={handleEnd}
                    />
                ) : (
                    <BreakDropdown
                        activeBreak={activeBreak}
                        usedTypes={usedTypes}
                        canInteract={canInteract}
                        acting={acting}
                        error={error}
                        onStart={handleStart}
                        onEnd={handleEnd}
                    />
                )}
                {!unlimitedBreaks && <MyBreakHistory breaks={sessionBreaks} />}
            </div>
        );
    }

    // ── team-panel mode ───────────────────────────────────────────────────────
    if (mode === 'team-panel') {
        if (!isManager) return null;
        const activeCount    = todayBreaks.filter(b => !b.break_end).length;
        const completedCount = todayBreaks.filter(b => b.break_end).length;
        return (
            <div style={{ marginBottom: 16 }}>
                <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 2px 10px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
                    {/* Panel header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #f3f4f6' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <Coffee size={14} color="#f59e0b" />
                            <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>Team Break Activity</span>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                            {activeCount > 0 && (
                                <span style={{ fontSize: 10, background: '#fef3c7', color: '#92400e', borderRadius: 99, padding: '2px 8px', fontWeight: 700 }}>
                                    {activeCount} live
                                </span>
                            )}
                            {completedCount > 0 && (
                                <span style={{ fontSize: 10, background: '#f0fdf4', color: '#15803d', borderRadius: 99, padding: '2px 8px', fontWeight: 700 }}>
                                    {completedCount} done
                                </span>
                            )}
                        </div>
                    </div>
                    <TeamPanel todayBreaks={todayBreaks} loading={loading} />
                </div>
            </div>
        );
    }

    // ── full mode ─────────────────────────────────────────────────────────────
    const activeType = BREAK_TYPES.find(t => t.key === activeBreak?.break_type);
    return (
        <div style={{ marginBottom: 16 }}>
            <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 2px 10px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #f3f4f6', flexWrap: 'wrap', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 30, height: 30, borderRadius: 8, background: activeBreak ? '#fef3c7' : '#e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Coffee size={15} color={activeBreak ? '#92400e' : '#4338ca'} />
                        </div>
                        <div>
                            <div style={{ fontWeight: 700, fontSize: 13, color: '#111827' }}>
                                {activeBreak ? (activeType?.label || 'On Break') : 'Break'}
                                {activeBreak && (
                                    <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 600, color: '#d97706', background: '#fef3c7', borderRadius: 12, padding: '1px 8px' }}>
                                        {fmtDuration(activeBreak.break_start)}
                                    </span>
                                )}
                            </div>
                            {!activeBreak && sessionBreaks.filter(b => b.break_end).length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 3 }}>
                                    {sessionBreaks.filter(b => b.break_end).map(b => (
                                        <span key={b.id} style={{ fontSize: 10, borderRadius: 10, padding: '1px 7px', background: '#f3f4f6', color: '#6b7280' }}>
                                            {breakEmoji(b.break_type)} {fmtMins(b.break_duration_minutes)}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                    <BreakDropdown
                        activeBreak={activeBreak}
                        usedTypes={usedTypes}
                        canInteract={canInteract}
                        acting={acting}
                        error={error}
                        onStart={handleStart}
                        onEnd={handleEnd}
                    />
                </div>
                {isManager && (
                    <>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px 4px', borderBottom: '1px solid #f9fafb' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Users size={12} color="#9ca3af" />
                                <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Team Break Activity</span>
                            </div>
                        </div>
                        <TeamPanel todayBreaks={todayBreaks} loading={loading} />
                    </>
                )}
            </div>
        </div>
    );
}
