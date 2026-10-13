// components/Admin/Teams.jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button, Badge, Modal, Form, Spinner, Alert } from 'react-bootstrap';
import {
    FaUserTie, FaUsers, FaSearch, FaChevronRight,
    FaEye, FaEdit, FaExchangeAlt, FaTimesCircle, FaUserMinus,
    FaFilter, FaSyncAlt, FaClock, FaCalendarAlt, FaCheck, FaArrowLeft,
    FaLayerGroup, FaTimes, FaUserSlash,
} from 'react-icons/fa';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';
import { useNotification } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';

// ── Avatar ────────────────────────────────────────────────────────────────────
const Avatar = ({ name, size = 36, bg = '#3b82f6' }) => {
    const initials = name ? name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase() : '?';
    return (
        <div className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0 text-white fw-bold"
            style={{ width: size, height: size, background: bg, fontSize: size * 0.36 }}>
            {initials}
        </div>
    );
};

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899'];
const mgrColor = (id) => COLORS[(id || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// ── Checkbox ──────────────────────────────────────────────────────────────────
const Checkbox = ({ checked, indeterminate = false, onChange, size = 16 }) => (
    <div
        onClick={e => { e.stopPropagation(); onChange(); }}
        style={{
            width: size, height: size, borderRadius: 4, cursor: 'pointer', flexShrink: 0,
            border: checked || indeterminate ? '2px solid #3b82f6' : '2px solid #cbd5e1',
            background: checked || indeterminate ? '#3b82f6' : '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s',
        }}
    >
        {checked && <FaCheck size={size * 0.55} color="#fff" />}
        {indeterminate && !checked && <div style={{ width: size * 0.5, height: 2, background: '#fff', borderRadius: 1 }} />}
    </div>
);

// ── LoginSettings ─────────────────────────────────────────────────────────────
const LoginSettings = ({ mgr, color }) => {
    const init = mgr.settings;
    const [loginTime, setLoginTime] = useState(init?.login_time?.slice(0, 5) || '09:00');
    const [workDays, setWorkDays]   = useState(init?.working_days || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);
    const [saving, setSaving]       = useState(false);
    const [saved, setSaved]         = useState(false);
    const [error, setError]         = useState('');

    const toggleDay = (day) =>
        setWorkDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);

    const handleSave = async () => {
        setError('');
        setSaving(true);
        try {
            await axios.put(API_ENDPOINTS.TEAMS_MANAGER_SETTINGS(mgr.employee_id), {
                login_time: loginTime + ':00',
                working_days: workDays,
            });
            setSaved(true);
            setTimeout(() => setSaved(false), 2500);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div>
            <div className="d-flex align-items-center gap-2 mb-3">
                <FaClock size={13} style={{ color }} />
                <span className="fw-semibold" style={{ color, fontSize: 13 }}>Login Time Settings</span>
                {init?.login_time && (
                    <Badge bg="light" text="dark" style={{ fontSize: 10, marginLeft: 'auto' }}>
                        Current: {init.login_time.slice(0, 5)}
                    </Badge>
                )}
            </div>
            {error && <Alert variant="danger" className="py-1 px-2 small mb-2">{error}</Alert>}
            <div className="mb-3">
                <div className="text-muted mb-2" style={{ fontSize: 11 }}>
                    <FaCalendarAlt size={10} className="me-1" />Working Days
                </div>
                <div className="d-flex flex-wrap gap-1">
                    {DAYS.map(day => {
                        const active = workDays.includes(day);
                        return (
                            <button key={day} onClick={() => toggleDay(day)}
                                style={{
                                    padding: '3px 10px', fontSize: 12, border: 'none', borderRadius: 20, cursor: 'pointer',
                                    background: active ? color : '#f1f5f9',
                                    color: active ? '#fff' : '#64748b',
                                    fontWeight: active ? 600 : 400, transition: 'all 0.15s',
                                }}>
                                {day.slice(0, 3)}
                            </button>
                        );
                    })}
                </div>
            </div>
            <div className="d-flex align-items-center gap-2">
                <FaClock size={12} className="text-muted" />
                <span className="text-muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>Login Time</span>
                <Form.Control type="time" size="sm" value={loginTime}
                    onChange={e => setLoginTime(e.target.value)} style={{ width: 110, fontSize: 12 }} />
                <Button size="sm" variant={saved ? 'success' : 'primary'}
                    onClick={handleSave} disabled={saving || workDays.length === 0}
                    className="d-flex align-items-center gap-1 ms-auto">
                    {saving ? <Spinner size="sm" animation="border" /> :
                     saved   ? <><FaCheck size={10} /> Saved</> : 'Save'}
                </Button>
            </div>
        </div>
    );
};

// ── ManagerListItem — compact left-panel card ─────────────────────────────────
const ManagerListItem = ({ mgr, isSelected, onClick, selCount, type = 'TL' }) => {
    const color = mgrColor(mgr.employee_id);
    const [hovered, setHovered] = useState(false);

    const typeStyle = type === 'TL'
        ? { background: '#dbeafe', color: '#1d4ed8' }
        : { background: '#f3e8ff', color: '#7c3aed' };

    return (
        <div
            onClick={onClick}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                padding: '9px 12px', borderRadius: 10, cursor: 'pointer', marginBottom: 4,
                border: isSelected ? `1.5px solid ${color}` : `1.5px solid ${hovered ? color + '55' : '#e2e8f0'}`,
                background: isSelected ? `${color}0f` : hovered ? '#f8fafc' : '#fff',
                transition: 'all 0.15s',
            }}
        >
            <div className="d-flex align-items-center gap-2">
                <Avatar name={`${mgr.first_name} ${mgr.last_name}`} size={34} bg={color} />
                <div className="flex-grow-1 min-w-0">
                    {/* Name row: name + TL/M badge + count */}
                    <div className="d-flex align-items-center gap-1 flex-wrap" style={{ marginBottom: 2 }}>
                        <span className="fw-semibold text-truncate" style={{ fontSize: 13, color: isSelected ? color : '#1e293b', maxWidth: 110 }}>
                            {mgr.first_name} {mgr.last_name}
                        </span>
                        <span style={{
                            fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4,
                            flexShrink: 0, ...typeStyle,
                        }}>
                            {type}
                        </span>
                        <span className="d-flex align-items-center gap-1 flex-shrink-0"
                            style={{ fontSize: 11, fontWeight: 600, color, marginLeft: 'auto' }}>
                            <FaUsers size={9} style={{ color }} />
                            {mgr.total_employees}
                        </span>
                        {isSelected && <FaChevronRight size={9} style={{ color, flexShrink: 0 }} />}
                    </div>
                    {/* Designation row */}
                    <div className="text-muted text-truncate" style={{ fontSize: 11 }}>
                        {mgr.designation || mgr.department || mgr.employee_id}
                    </div>
                    {selCount > 0 && (
                        <Badge style={{ background: '#3b82f6', fontSize: 9, marginTop: 2 }}>✓ {selCount} selected</Badge>
                    )}
                </div>
            </div>
        </div>
    );
};

// ── ManagerDetail — right-panel full view ─────────────────────────────────────
const ManagerDetail = ({ mgr, type = 'TL', onAssign, onAssignMembers, onRemove, onDeactivate, navigate, selectedEmps, onToggleSelect, onToggleSelectAll }) => {
    const color = mgrColor(mgr.employee_id);
    const totalEmps     = mgr.employees.length;
    const selectedCount = mgr.employees.filter(e => selectedEmps.has(e.employee_id)).length;
    const allChecked    = totalEmps > 0 && selectedCount === totalEmps;
    const someChecked   = selectedCount > 0 && selectedCount < totalEmps;

    return (
        <div className="d-flex flex-column gap-3">
            {/* Manager profile header */}
            <div style={{
                background: '#fff', borderRadius: 16, padding: '20px 24px',
                border: `1.5px solid ${color}30`, boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
            }}>
                <div className="d-flex align-items-start gap-3">
                    <div style={{ position: 'relative' }}>
                        <Avatar name={`${mgr.first_name} ${mgr.last_name}`} size={56} bg={color} />
                        {mgr.is_active && (
                            <div style={{
                                position: 'absolute', bottom: 1, right: 1,
                                width: 12, height: 12, borderRadius: '50%',
                                background: '#22c55e', border: '2px solid #fff',
                            }} />
                        )}
                    </div>
                    <div className="flex-grow-1 min-w-0">
                        <div className="d-flex align-items-center flex-wrap gap-2 mb-1">
                            <span className="fw-bold" style={{ fontSize: 18, color: '#1e293b' }}>
                                {mgr.first_name} {mgr.last_name}
                            </span>
                            {type === 'TL'
                                ? <Badge style={{ background: '#dbeafe', color: '#1d4ed8', fontSize: 11 }}>TL</Badge>
                                : <Badge style={{ background: '#f3e8ff', color: '#7c3aed', fontSize: 11 }}>Manager</Badge>
                            }
                            {!mgr.is_active && <Badge bg="secondary">Inactive</Badge>}
                        </div>
                        <div className="text-muted" style={{ fontSize: 13 }}>
                            {mgr.employee_id}
                            {mgr.designation && <span> · {mgr.designation}</span>}
                        </div>
                        {mgr.department && (
                            <div className="text-muted" style={{ fontSize: 13 }}>{mgr.department}</div>
                        )}
                    </div>
                    <div className="d-flex gap-2 flex-shrink-0">
                        {[
                            { title: 'Edit', icon: <FaEdit size={12} />, bg: '#3b82f6', onClick: () => navigate(`/admin/edit-employee/${mgr.id}`) },
                            { title: 'View', icon: <FaEye size={12} />, bg: '#06b6d4', onClick: () => navigate(`/admin/employees/${mgr.id}`) },
                        ].map(btn => (
                            <button key={btn.title} title={btn.title} onClick={btn.onClick}
                                style={{
                                    padding: '6px 14px', border: '1px solid #e2e8f0', borderRadius: 8,
                                    background: '#fff', cursor: 'pointer', display: 'flex',
                                    alignItems: 'center', gap: 5, fontSize: 12, color: '#64748b',
                                    fontWeight: 500, transition: 'all 0.15s',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.background = btn.bg; e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = btn.bg; }}
                                onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = '#64748b'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
                            >
                                {btn.icon} {btn.title}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Team members */}
            <div style={{
                background: '#fff', borderRadius: 16, border: `1.5px solid ${color}20`,
                boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
            }}>
                {/* Members header */}
                <div style={{ padding: '14px 20px', borderBottom: `1px solid ${color}18`, background: `${color}07` }}>
                    <div className="d-flex align-items-center justify-content-between">
                        <div className="d-flex align-items-center gap-2">
                            {totalEmps > 0 && (
                                <Checkbox
                                    checked={allChecked}
                                    indeterminate={someChecked}
                                    onChange={() => onToggleSelectAll(mgr.employees, !allChecked)}
                                    size={15}
                                />
                            )}
                            <FaUsers size={13} style={{ color }} />
                            <span className="fw-semibold" style={{ fontSize: 14, color: '#1e293b' }}>Team Members</span>
                            {selectedCount > 0 && (
                                <Badge style={{ background: '#3b82f6', fontSize: 10 }}>
                                    {selectedCount} selected
                                </Badge>
                            )}
                        </div>
                        <div className="d-flex align-items-center gap-2">
                            <Badge style={{ background: color, fontSize: 11, padding: '4px 10px' }}>
                                {totalEmps} {totalEmps === 1 ? 'member' : 'members'}
                            </Badge>
                            <button onClick={() => onAssignMembers(mgr, type)}
                                style={{
                                    padding: '5px 12px', border: `1px solid ${color}55`, borderRadius: 7,
                                    background: `${color}12`, cursor: 'pointer', display: 'flex',
                                    alignItems: 'center', gap: 5, fontSize: 12, color, fontWeight: 600,
                                    transition: 'all 0.15s', flexShrink: 0,
                                }}
                                onMouseEnter={e => { e.currentTarget.style.background = color; e.currentTarget.style.color = '#fff'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = `${color}12`; e.currentTarget.style.color = color; }}
                            >
                                <FaUserTie size={11} /> Assign Team Member
                            </button>
                        </div>
                    </div>
                </div>

                {/* Members list */}
                <div style={{ padding: '12px 20px' }}>
                    {totalEmps === 0 ? (
                        <div className="text-center text-muted py-4 rounded-3"
                            style={{ background: '#f8fafc', border: '1px dashed #e2e8f0' }}>
                            <FaUsers size={28} className="mb-2 opacity-25" />
                            <div style={{ fontSize: 13, marginBottom: 12 }}>No employees assigned to this manager</div>
                            <button onClick={() => onAssignMembers(mgr, type)}
                                style={{
                                    padding: '7px 16px', border: 'none', borderRadius: 8,
                                    background: color, cursor: 'pointer', display: 'inline-flex',
                                    alignItems: 'center', gap: 6, fontSize: 13, color: '#fff', fontWeight: 600,
                                }}
                            >
                                <FaUserTie size={12} /> Assign Team Member
                            </button>
                        </div>
                    ) : (
                        <div className="d-flex flex-column gap-2">
                            {mgr.employees.map(emp => {
                                const isSelected = selectedEmps.has(emp.employee_id);
                                return (
                                    <div key={emp.employee_id}
                                        className="d-flex align-items-center gap-3 rounded-3 px-3 py-2"
                                        style={{
                                            background: isSelected ? '#eff6ff' : '#f8fafc',
                                            border: isSelected ? '1.5px solid #93c5fd' : '1.5px solid transparent',
                                            transition: 'all 0.15s',
                                        }}
                                        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#f0f9ff'; }}
                                        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = '#f8fafc'; }}
                                    >
                                        <Checkbox checked={isSelected} onChange={() => onToggleSelect(emp)} size={14} />
                                        <Avatar name={`${emp.first_name} ${emp.last_name}`} size={34} bg={color} />
                                        <div className="flex-grow-1 min-w-0">
                                            <div className="fw-semibold text-truncate" style={{ fontSize: 14, color: '#1e293b' }}>
                                                {emp.first_name} {emp.last_name}
                                            </div>
                                            <div className="text-muted text-truncate" style={{ fontSize: 11 }}>
                                                {emp.employee_id}{emp.designation && ` · ${emp.designation}`}
                                            </div>
                                        </div>
                                        {emp.department && (
                                            <span className="text-muted d-none d-md-block" style={{ fontSize: 11, flexShrink: 0 }}>
                                                {emp.department}
                                            </span>
                                        )}
                                        <Badge bg={emp.is_active ? 'success' : 'secondary'} style={{ fontSize: 10, flexShrink: 0 }}>
                                            {emp.is_active ? 'Active' : 'Inactive'}
                                        </Badge>
                                        <div className="d-flex gap-1 flex-shrink-0">
                                            <button title="Change Manager" onClick={() => onAssign(emp, mgr)}
                                                style={{
                                                    width: 28, height: 28, border: '1px solid #bfdbfe', borderRadius: 7,
                                                    background: '#eff6ff', cursor: 'pointer', display: 'flex',
                                                    alignItems: 'center', justifyContent: 'center', color: '#3b82f6', transition: 'all 0.15s',
                                                }}
                                                onMouseEnter={e => { e.currentTarget.style.background = '#3b82f6'; e.currentTarget.style.color = '#fff'; }}
                                                onMouseLeave={e => { e.currentTarget.style.background = '#eff6ff'; e.currentTarget.style.color = '#3b82f6'; }}
                                            >
                                                <FaExchangeAlt size={10} />
                                            </button>
                                            <button title="Remove Assignment" onClick={() => onRemove(emp)}
                                                style={{
                                                    width: 28, height: 28, border: '1px solid #fecaca', borderRadius: 7,
                                                    background: '#fff1f2', cursor: 'pointer', display: 'flex',
                                                    alignItems: 'center', justifyContent: 'center', color: '#ef4444', transition: 'all 0.15s',
                                                }}
                                                onMouseEnter={e => { e.currentTarget.style.background = '#ef4444'; e.currentTarget.style.color = '#fff'; }}
                                                onMouseLeave={e => { e.currentTarget.style.background = '#fff1f2'; e.currentTarget.style.color = '#ef4444'; }}
                                            >
                                                <FaUserMinus size={10} />
                                            </button>
                                        <button title="Deactivate Account" onClick={() => onDeactivate(emp)}
                                                style={{
                                                    width: 28, height: 28, border: '1px solid #fde68a', borderRadius: 7,
                                                    background: '#fffbeb', cursor: 'pointer', display: 'flex',
                                                    alignItems: 'center', justifyContent: 'center', color: '#d97706', transition: 'all 0.15s',
                                                }}
                                                onMouseEnter={e => { e.currentTarget.style.background = '#f59e0b'; e.currentTarget.style.color = '#fff'; }}
                                                onMouseLeave={e => { e.currentTarget.style.background = '#fffbeb'; e.currentTarget.style.color = '#d97706'; }}
                                            >
                                                <FaUserSlash size={10} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Login settings */}
            <div style={{
                background: '#fff', borderRadius: 16, padding: '18px 22px',
                border: `1.5px solid ${color}20`, boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
            }}>
                <LoginSettings mgr={mgr} color={color} />
            </div>
        </div>
    );
};

// ── UnassignedDetail — right panel for unassigned employees ───────────────────
const UnassignedDetail = ({ employees, onAssign, isAdmin, selectedEmps, onToggleSelect, onToggleSelectAll }) => {
    const selectedCount = employees.filter(e => selectedEmps.has(e.employee_id)).length;
    const allChecked    = employees.length > 0 && selectedCount === employees.length;
    const someChecked   = selectedCount > 0 && selectedCount < employees.length;

    return (
        <div style={{
            background: '#fff', borderRadius: 16, overflow: 'hidden',
            border: '1.5px solid #f59e0b44', boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #fef08a', background: '#fefce8' }}>
                <div className="d-flex align-items-center gap-2">
                    {employees.length > 0 && (
                        <Checkbox
                            checked={allChecked} indeterminate={someChecked}
                            onChange={() => onToggleSelectAll(employees, !allChecked)} size={15}
                        />
                    )}
                    <FaTimesCircle size={14} className="text-warning" />
                    <span className="fw-semibold" style={{ fontSize: 14 }}>Employees Without TL</span>
                    <Badge bg="warning" text="dark" pill>{employees.length}</Badge>
                    {selectedCount > 0 && <Badge bg="primary" pill>{selectedCount} selected</Badge>}
                </div>
            </div>
            <div style={{ padding: '12px 20px' }}>
                {employees.length === 0 ? (
                    <div className="text-center text-muted py-4">
                        <FaCheck size={28} className="mb-2 text-success opacity-50" />
                        <div style={{ fontSize: 13 }}>All employees are assigned to a manager.</div>
                    </div>
                ) : (
                    <div className="d-flex flex-column gap-2">
                        {employees.map(emp => {
                            const isSelected = selectedEmps.has(emp.employee_id);
                            return (
                                <div key={emp.employee_id}
                                    className="d-flex align-items-center gap-3 rounded-3 px-3 py-2"
                                    style={{
                                        background: isSelected ? '#eff6ff' : '#f8fafc',
                                        border: isSelected ? '1.5px solid #93c5fd' : '1.5px solid transparent',
                                        transition: 'all 0.15s',
                                    }}
                                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#f0f9ff'; }}
                                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = '#f8fafc'; }}
                                >
                                    <Checkbox checked={isSelected} onChange={() => onToggleSelect(emp)} size={14} />
                                    <Avatar name={`${emp.first_name} ${emp.last_name}`} size={34} bg="#94a3b8" />
                                    <div className="flex-grow-1 min-w-0">
                                        <div className="fw-semibold text-truncate" style={{ fontSize: 14, color: '#1e293b' }}>
                                            {emp.first_name} {emp.last_name}
                                        </div>
                                        <div className="text-muted text-truncate" style={{ fontSize: 11 }}>
                                            {emp.employee_id}{emp.designation && ` · ${emp.designation}`}
                                        </div>
                                    </div>
                                    <Badge bg={emp.is_active ? 'success' : 'secondary'} style={{ fontSize: 10 }}>
                                        {emp.is_active ? 'Active' : 'Inactive'}
                                    </Badge>
                                    {isAdmin && (
                                        <button title="Assign Manager" onClick={() => onAssign(emp, null)}
                                            style={{
                                                padding: '4px 10px', border: '1px solid #bfdbfe', borderRadius: 7,
                                                background: '#eff6ff', cursor: 'pointer', display: 'flex',
                                                alignItems: 'center', gap: 5, fontSize: 11, color: '#3b82f6',
                                                fontWeight: 500, transition: 'all 0.15s',
                                            }}
                                            onMouseEnter={e => { e.currentTarget.style.background = '#3b82f6'; e.currentTarget.style.color = '#fff'; }}
                                            onMouseLeave={e => { e.currentTarget.style.background = '#eff6ff'; e.currentTarget.style.color = '#3b82f6'; }}
                                        >
                                            <FaUserTie size={10} /> Assign
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

// ── Main Component ────────────────────────────────────────────────────────────
const Teams = () => {
    const { showNotification } = useNotification();
    const { user } = useAuth();
    const navigate = useNavigate();
    const isAdmin = user?.role === 'admin' || user?.role === 'sub_admin' || user?.role === 'hr';

    const [hierarchy, setHierarchy]   = useState([]);
    const [unassigned, setUnassigned] = useState([]);
    const [managers, setManagers]     = useState([]);
    const [subAdmins, setSubAdmins]   = useState([]);
    const [loading, setLoading]       = useState(true);
    const [saving, setSaving]         = useState(false);

    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('all');

    // Which manager card is "open" in the right panel
    const [selectedMgrId, setSelectedMgrId]         = useState(null);
    const [showUnassignedPanel, setShowUnassignedPanel] = useState(false);

    // Multi-select
    const [selectedEmps, setSelectedEmps] = useState(new Map());
    const selectedCount = selectedEmps.size;
    const selectedList  = [...selectedEmps.values()];
    const clearSelection = () => setSelectedEmps(new Map());

    const toggleSelect = (emp) => setSelectedEmps(prev => {
        const next = new Map(prev);
        if (next.has(emp.employee_id)) next.delete(emp.employee_id);
        else next.set(emp.employee_id, emp);
        return next;
    });

    const toggleSelectAll = (employees, select) => setSelectedEmps(prev => {
        const next = new Map(prev);
        if (select) employees.forEach(e => next.set(e.employee_id, e));
        else employees.forEach(e => next.delete(e.employee_id));
        return next;
    });

    // Single assign modal
    const [assignModal, setAssignModal] = useState(false);
    const [assignEmp, setAssignEmp]     = useState(null);
    const [assignType, setAssignType]   = useState('tl');
    const [newMgrId, setNewMgrId]       = useState('');
    const [assignError, setAssignError] = useState('');

    // Bulk assign modal
    const [bulkModal, setBulkModal]   = useState(false);
    const [bulkType, setBulkType]     = useState('tl');
    const [bulkMgrId, setBulkMgrId]   = useState('');
    const [bulkError, setBulkError]   = useState('');
    const [bulkSaving, setBulkSaving] = useState(false);

    // "Assign Team Member" modal — add unassigned employees directly to a manager's own team page
    const [assignMembersModal, setAssignMembersModal]       = useState(false);
    const [assignMembersMgr, setAssignMembersMgr]           = useState(null);
    const [assignMembersSearch, setAssignMembersSearch]     = useState('');
    const [assignMembersSelected, setAssignMembersSelected] = useState(new Set());
    const [assignMembersSaving, setAssignMembersSaving]     = useState(false);
    const [assignMembersError, setAssignMembersError]       = useState('');

    const fetchHierarchy = useCallback(async () => {
        setLoading(true);
        try {
            const [hierRes, mgrRes] = await Promise.all([
                axios.get(API_ENDPOINTS.TEAMS_HIERARCHY),
                axios.get(API_ENDPOINTS.TEAMS_MANAGERS_LIST),
            ]);
            setHierarchy(hierRes.data.hierarchy || []);
            setUnassigned(hierRes.data.unassigned || []);
            setManagers(mgrRes.data.managers || []);
            try {
                const subRes = await axios.get(API_ENDPOINTS.TEAMS_SUB_ADMINS_LIST);
                setSubAdmins(subRes.data.managers || []);
            } catch { setSubAdmins([]); }
        } catch {
            showNotification('Failed to load manager hierarchy', 'danger');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchHierarchy(); }, [fetchHierarchy]);

    const openAssign = (emp, currentMgr = null) => {
        setAssignEmp(emp);
        setNewMgrId(currentMgr?.employee_id || '');
        setAssignType('tl');
        setAssignError('');
        setAssignModal(true);
    };

    const handleAssignSave = async () => {
        if (!newMgrId) return setAssignError('Please select a reporting manager');
        const pool = assignType === 'tl' ? managers : subAdmins;
        const mgr = pool.find(m => m.employee_id === newMgrId);
        if (!mgr) return;
        setSaving(true);
        try {
            await axios.put(API_ENDPOINTS.EMPLOYEE_BY_ID(assignEmp.id), {
                reporting_manager: `${mgr.first_name} ${mgr.last_name}`.trim(),
            });
            showNotification('Reporting manager updated', 'success');
            setAssignModal(false);
            fetchHierarchy();
        } catch (err) {
            setAssignError(err.response?.data?.message || 'Failed to update');
        } finally {
            setSaving(false);
        }
    };

    const handleRemove = async (emp) => {
        if (!window.confirm(`Remove manager assignment for ${emp.first_name} ${emp.last_name}?`)) return;
        try {
            await axios.put(API_ENDPOINTS.EMPLOYEE_BY_ID(emp.id), { reporting_manager: null });
            showNotification('Manager assignment removed', 'success');
            fetchHierarchy();
        } catch (err) {
            showNotification(err.response?.data?.message || 'Failed to remove', 'danger');
        }
    };

    const handleDeactivateEmployee = async (emp) => {
        if (!window.confirm(`Deactivate account for ${emp.first_name} ${emp.last_name}? They will be removed from all team views.`)) return;
        try {
            await axios.patch(API_ENDPOINTS.EMPLOYEE_TOGGLE_STATUS(emp.id));
            showNotification(`${emp.first_name} ${emp.last_name}'s account deactivated`, 'warning');
            fetchHierarchy();
        } catch (err) {
            showNotification(err.response?.data?.message || 'Failed to deactivate', 'danger');
        }
    };

    const openBulkModal = () => {
        setBulkType('tl'); setBulkMgrId(''); setBulkError(''); setBulkModal(true);
    };

    const handleBulkAssign = async () => {
        if (!bulkMgrId) return setBulkError('Please select a manager');
        const pool = bulkType === 'tl' ? managers : subAdmins;
        const mgr = pool.find(m => m.employee_id === bulkMgrId);
        if (!mgr) return;
        setBulkSaving(true);
        const mgrName = `${mgr.first_name} ${mgr.last_name}`.trim();
        try {
            await Promise.all(
                selectedList.map(emp =>
                    axios.put(API_ENDPOINTS.EMPLOYEE_BY_ID(emp.id), { reporting_manager: mgrName })
                )
            );
            showNotification(`${selectedCount} employees assigned to ${mgrName}`, 'success');
            setBulkModal(false);
            clearSelection();
            fetchHierarchy();
        } catch (err) {
            setBulkError(err.response?.data?.message || 'Failed to assign');
        } finally {
            setBulkSaving(false);
        }
    };

    const handleBulkRemove = async () => {
        if (!window.confirm(`Remove manager assignment for ${selectedCount} employee(s)?`)) return;
        try {
            await Promise.all(
                selectedList.map(emp =>
                    axios.put(API_ENDPOINTS.EMPLOYEE_BY_ID(emp.id), { reporting_manager: null })
                )
            );
            showNotification(`${selectedCount} assignments removed`, 'success');
            clearSelection();
            fetchHierarchy();
        } catch (err) {
            showNotification(err.response?.data?.message || 'Failed to remove', 'danger');
        }
    };

    const openAssignMembers = (mgr) => {
        setAssignMembersMgr(mgr);
        setAssignMembersSearch('');
        setAssignMembersSelected(new Set());
        setAssignMembersError('');
        setAssignMembersModal(true);
    };

    const toggleAssignMembersCandidate = (empId) => {
        setAssignMembersSelected(prev => {
            const next = new Set(prev);
            next.has(empId) ? next.delete(empId) : next.add(empId);
            return next;
        });
    };

    const handleAssignMembersSave = async () => {
        if (!assignMembersSelected.size) return setAssignMembersError('Select at least one employee');
        setAssignMembersSaving(true);
        setAssignMembersError('');
        const mgrName = `${assignMembersMgr.first_name} ${assignMembersMgr.last_name}`.trim();
        try {
            const chosen = allTrueUnassigned.filter(e => assignMembersSelected.has(e.employee_id));
            await Promise.all(
                chosen.map(emp => axios.put(API_ENDPOINTS.EMPLOYEE_BY_ID(emp.id), { reporting_manager: mgrName }))
            );
            showNotification(`${chosen.length} employee${chosen.length !== 1 ? 's' : ''} assigned to ${mgrName}`, 'success');
            setAssignMembersModal(false);
            fetchHierarchy();
        } catch (err) {
            setAssignMembersError(err.response?.data?.message || 'Failed to assign');
        } finally {
            setAssignMembersSaving(false);
        }
    };

    const q = search.trim().toLowerCase();

    const filteredHierarchy = useMemo(() => {
        let list = hierarchy;
        if (filter === 'active')       list = list.filter(m => m.is_active);
        if (filter === 'no_employees') list = list.filter(m => m.total_employees === 0);
        if (!q) return list;
        return list.filter(m =>
            `${m.first_name} ${m.last_name}`.toLowerCase().includes(q) ||
            m.employee_id.toLowerCase().includes(q) ||
            (m.designation || '').toLowerCase().includes(q) ||
            m.employees.some(e =>
                `${e.first_name} ${e.last_name}`.toLowerCase().includes(q) ||
                e.employee_id.toLowerCase().includes(q)
            )
        );
    }, [hierarchy, filter, q]);

    const filteredUnassigned = useMemo(() => {
        if (filter === 'active' || filter === 'no_employees') return [];
        if (!q) return unassigned;
        return unassigned.filter(e =>
            `${e.first_name} ${e.last_name}`.toLowerCase().includes(q) ||
            e.employee_id.toLowerCase().includes(q) ||
            (e.designation || '').toLowerCase().includes(q)
        );
    }, [unassigned, filter, q]);

    // Build sub_admin teams from unassigned employees whose reporting_manager matches a sub_admin
    const subAdminTeams = useMemo(() => {
        return subAdmins.map(sa => {
            const saName = `${sa.first_name} ${sa.last_name}`.trim().toLowerCase();
            const employees = unassigned.filter(e =>
                e.reporting_manager && e.reporting_manager.trim().toLowerCase() === saName
            );
            return { ...sa, employees, total_employees: employees.length, settings: null };
        });
    }, [subAdmins, unassigned]);

    const filteredSubAdminTeams = useMemo(() => {
        if (filter === 'active')       return subAdminTeams.filter(m => m.is_active);
        if (filter === 'no_employees') return subAdminTeams.filter(m => m.total_employees === 0);
        if (filter === 'no_manager')   return [];
        if (!q) return subAdminTeams;
        return subAdminTeams.filter(m =>
            `${m.first_name} ${m.last_name}`.toLowerCase().includes(q) ||
            m.employee_id.toLowerCase().includes(q) ||
            (m.designation || '').toLowerCase().includes(q) ||
            m.employees.some(e =>
                `${e.first_name} ${e.last_name}`.toLowerCase().includes(q) ||
                e.employee_id.toLowerCase().includes(q)
            )
        );
    }, [subAdminTeams, filter, q]);

    // Employees truly without any manager (not even a sub_admin)
    const trueUnassigned = useMemo(() => {
        const assignedToSubAdmin = new Set(
            subAdminTeams.flatMap(sa => sa.employees.map(e => e.employee_id))
        );
        return filteredUnassigned.filter(e => !assignedToSubAdmin.has(e.employee_id));
    }, [filteredUnassigned, subAdminTeams]);

    // Same as trueUnassigned but independent of the page-level search box — used as the
    // candidate pool for the "Assign Team Member" modal, which has its own search field.
    const allTrueUnassigned = useMemo(() => {
        const assignedToSubAdmin = new Set(
            subAdminTeams.flatMap(sa => sa.employees.map(e => e.employee_id))
        );
        return unassigned.filter(e => !assignedToSubAdmin.has(e.employee_id));
    }, [unassigned, subAdminTeams]);

    const assignMembersCandidates = useMemo(() => {
        const s = assignMembersSearch.trim().toLowerCase();
        if (!s) return allTrueUnassigned;
        return allTrueUnassigned.filter(e =>
            `${e.first_name} ${e.last_name}`.toLowerCase().includes(s) ||
            e.employee_id.toLowerCase().includes(s)
        );
    }, [allTrueUnassigned, assignMembersSearch]);

    // Resolve currently selected item — check TL hierarchy first, then sub_admin teams
    const [selectedType, setSelectedType] = useState('TL'); // 'TL' | 'M'
    const selectedMgr = useMemo(() => {
        if (!selectedMgrId) return null;
        return hierarchy.find(m => m.employee_id === selectedMgrId) ||
               subAdminTeams.find(m => m.employee_id === selectedMgrId) ||
               null;
    }, [hierarchy, subAdminTeams, selectedMgrId]);

    const selectManager = (mgrId, type = 'TL') => {
        setSelectedMgrId(mgrId);
        setSelectedType(type);
        setShowUnassignedPanel(false);
    };

    const selectUnassigned = () => {
        setSelectedMgrId(null);
        setShowUnassignedPanel(true);
    };

    const showUnassignedInList = filter === 'all' || filter === 'no_manager';

    return (
        <div style={{ padding: '20px 24px', minHeight: '100vh', background: '#f0f2f5', paddingBottom: selectedCount > 0 ? 100 : 24 }}>

            {/* Page header */}
            <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
                <div className="d-flex align-items-center gap-2">
                    <FaUserTie size={20} className="text-primary" />
                    <h5 className="mb-0 fw-bold">TL Teams</h5>
                    <Badge bg="light" text="dark" className="ms-1" style={{ fontSize: 12 }}>
                        {hierarchy.length} managers
                    </Badge>
                </div>
                <div className="d-flex gap-2">
                    <Button variant="outline-primary" size="sm" onClick={fetchHierarchy}
                        className="d-flex align-items-center gap-1">
                        <FaSyncAlt size={11} /> Refresh
                    </Button>
                    <Button variant="outline-secondary" size="sm"
                        className="d-flex align-items-center gap-1" onClick={() => navigate(-1)}>
                        <FaArrowLeft size={12} /> Back
                    </Button>
                </div>
            </div>

            {/* Stats row */}
            {!loading && (
                <div className="d-flex gap-3 flex-wrap mb-4">
                    {[
                        { label: 'Total TLs',      value: hierarchy.length,                                      color: '#3b82f6' },
                        { label: 'Total Managers',  value: subAdmins.length,                                     color: '#8b5cf6' },
                        { label: 'Total Employees', value: hierarchy.reduce((s, m) => s + m.total_employees, 0), color: '#10b981' },
                        { label: 'Without TL',      value: unassigned.length,                                    color: '#f59e0b' },
                    ].map(s => (
                        <div key={s.label} className="rounded-3 px-4 py-3"
                            style={{ background: '#fff', minWidth: 140, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', borderLeft: `4px solid ${s.color}` }}>
                            <div className="fw-bold fs-5" style={{ color: s.color }}>{s.value}</div>
                            <div className="text-muted" style={{ fontSize: 12 }}>{s.label}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* Search & Filter */}
            <div className="d-flex flex-wrap gap-2 mb-3 align-items-center">
                <div className="position-relative" style={{ flex: '1 1 200px', maxWidth: 320 }}>
                    <FaSearch style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 12 }} />
                    <Form.Control size="sm" placeholder="Search manager or employee…"
                        value={search} onChange={e => setSearch(e.target.value)}
                        style={{ paddingLeft: 30, borderRadius: 8 }} />
                </div>
                <div className="d-flex align-items-center gap-1">
                    <FaFilter size={11} className="text-muted" />
                    <Form.Select size="sm" value={filter} onChange={e => setFilter(e.target.value)}
                        style={{ width: 'auto', borderRadius: 8 }}>
                        <option value="all">All TLs</option>
                        <option value="active">Active TLs</option>
                        <option value="no_employees">No Employees</option>
                        <option value="no_manager">Without TL</option>
                    </Form.Select>
                </div>
                {selectedCount > 0 && (
                    <button onClick={clearSelection}
                        style={{
                            border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff',
                            padding: '4px 10px', fontSize: 12, cursor: 'pointer', color: '#64748b',
                            display: 'flex', alignItems: 'center', gap: 5,
                        }}>
                        <FaTimes size={10} /> Clear {selectedCount} selected
                    </button>
                )}
            </div>

            {/* ── Split-pane layout ── */}
            {loading ? (
                <div className="text-center py-5">
                    <Spinner animation="border" variant="primary" />
                </div>
            ) : (
                <div className="d-flex gap-3 align-items-start">

                    {/* ── LEFT PANEL — compact manager list ── */}
                    <div style={{
                        width: 300, flexShrink: 0,
                        position: 'sticky', top: 80,
                        maxHeight: 'calc(100vh - 200px)',
                        overflowY: 'auto',
                        background: '#fff', borderRadius: 14,
                        border: '1.5px solid #e2e8f0',
                        boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
                        padding: '10px 8px',
                    }}>
                        {/* ── TL section ── */}
                        <div className="d-flex align-items-center justify-content-between px-2 pb-2 mb-1"
                            style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <span className="fw-semibold text-muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                TL Teams
                            </span>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: '#dbeafe', color: '#1d4ed8' }}>
                                {filteredHierarchy.length}
                            </span>
                        </div>

                        {filteredHierarchy.length === 0 && (
                            <div className="text-center text-muted py-2" style={{ fontSize: 12 }}>No TLs found</div>
                        )}
                        {filteredHierarchy.map(mgr => {
                            const selCount = mgr.employees.filter(e => selectedEmps.has(e.employee_id)).length;
                            return (
                                <ManagerListItem key={mgr.employee_id} mgr={mgr} type="TL"
                                    isSelected={selectedMgrId === mgr.employee_id && selectedType === 'TL'}
                                    onClick={() => selectManager(mgr.employee_id, 'TL')}
                                    selCount={selCount} />
                            );
                        })}

                        {/* ── Manager (sub_admin) section ── */}
                        {filteredSubAdminTeams.length > 0 && (
                            <>
                                <div className="d-flex align-items-center justify-content-between px-2 py-2 mt-2"
                                    style={{ borderTop: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9', marginBottom: 4 }}>
                                    <span className="fw-semibold text-muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Managers
                                    </span>
                                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: '#f3e8ff', color: '#7c3aed' }}>
                                        {filteredSubAdminTeams.length}
                                    </span>
                                </div>
                                {filteredSubAdminTeams.map(mgr => {
                                    const selCount = mgr.employees.filter(e => selectedEmps.has(e.employee_id)).length;
                                    return (
                                        <ManagerListItem key={mgr.employee_id} mgr={mgr} type="M"
                                            isSelected={selectedMgrId === mgr.employee_id && selectedType === 'M'}
                                            onClick={() => selectManager(mgr.employee_id, 'M')}
                                            selCount={selCount} />
                                    );
                                })}
                            </>
                        )}

                        {/* ── Without TL / unassigned ── */}
                        {showUnassignedInList && trueUnassigned.length > 0 && (
                            <>
                                <div className="px-2 py-2 mt-2" style={{ borderTop: '1px solid #f1f5f9' }}>
                                    <span className="fw-semibold text-muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Unassigned
                                    </span>
                                </div>
                                <div onClick={selectUnassigned}
                                    style={{
                                        padding: '9px 12px', borderRadius: 10, cursor: 'pointer',
                                        border: showUnassignedPanel ? '1.5px solid #f59e0b' : '1.5px solid #fef08a',
                                        background: showUnassignedPanel ? '#fefce8' : '#fffbeb',
                                        transition: 'all 0.15s',
                                    }}
                                    onMouseEnter={e => { if (!showUnassignedPanel) e.currentTarget.style.background = '#fef9c3'; }}
                                    onMouseLeave={e => { if (!showUnassignedPanel) e.currentTarget.style.background = '#fffbeb'; }}>
                                    <div className="d-flex align-items-center gap-2">
                                        <div className="rounded-circle d-flex align-items-center justify-content-center"
                                            style={{ width: 34, height: 34, background: '#fef08a', flexShrink: 0 }}>
                                            <FaTimesCircle size={14} color="#d97706" />
                                        </div>
                                        <div className="flex-grow-1 min-w-0">
                                            <div className="d-flex align-items-center gap-2">
                                                <span className="fw-semibold" style={{ fontSize: 13, color: '#92400e' }}>Without TL/Manager</span>
                                                <Badge bg="warning" text="dark" style={{ fontSize: 10 }}>{trueUnassigned.length}</Badge>
                                            </div>
                                            <div className="text-muted" style={{ fontSize: 11 }}>No reporting manager</div>
                                        </div>
                                        {showUnassignedPanel && <FaChevronRight size={9} color="#d97706" />}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {/* ── RIGHT PANEL — detail view ── */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                        {!selectedMgr && !showUnassignedPanel ? (
                            <div className="text-center py-5 rounded-4"
                                style={{ background: '#fff', border: '1.5px dashed #e2e8f0', boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}>
                                <FaUsers size={48} className="mb-3" style={{ color: '#cbd5e1' }} />
                                <div className="fw-semibold" style={{ color: '#94a3b8', fontSize: 15 }}>Select a TL or Manager</div>
                                <div className="text-muted mt-1" style={{ fontSize: 13 }}>
                                    Click any entry on the left to view their team
                                </div>
                            </div>
                        ) : showUnassignedPanel ? (
                            <UnassignedDetail
                                employees={trueUnassigned}
                                onAssign={openAssign}
                                isAdmin={isAdmin}
                                selectedEmps={selectedEmps}
                                onToggleSelect={toggleSelect}
                                onToggleSelectAll={toggleSelectAll}
                            />
                        ) : (
                            <ManagerDetail
                                mgr={selectedMgr}
                                type={selectedType}
                                onAssign={openAssign}
                                onAssignMembers={openAssignMembers}
                                onRemove={handleRemove}
                                onDeactivate={handleDeactivateEmployee}
                                navigate={navigate}
                                selectedEmps={selectedEmps}
                                onToggleSelect={toggleSelect}
                                onToggleSelectAll={toggleSelectAll}
                            />
                        )}
                    </div>
                </div>
            )}

            {/* ── Floating bulk-action bar ── */}
            {selectedCount > 0 && (
                <div style={{
                    position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
                    background: '#1e293b', borderRadius: 14, padding: '10px 20px',
                    display: 'flex', alignItems: 'center', gap: 10,
                    boxShadow: '0 8px 32px rgba(0,0,0,0.28)', zIndex: 1050,
                    animation: 'teams-slidein 0.2s ease', whiteSpace: 'nowrap',
                }}>
                    <div className="d-flex align-items-center gap-2">
                        <FaLayerGroup size={13} color="#93c5fd" />
                        <span style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600 }}>
                            {selectedCount} employee{selectedCount !== 1 ? 's' : ''} selected
                        </span>
                    </div>
                    <div style={{ width: 1, height: 24, background: '#334155', margin: '0 4px' }} />
                    <button onClick={openBulkModal}
                        style={{
                            background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8,
                            padding: '5px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 5, transition: 'background 0.15s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = "#1f4e79"}
                        onMouseLeave={e => e.currentTarget.style.background = '#3b82f6'}
                    >
                        <FaExchangeAlt size={10} /> Assign / Move
                    </button>
                    <button onClick={handleBulkRemove}
                        style={{
                            background: '#ef4444', color: '#fff', border: 'none', borderRadius: 8,
                            padding: '5px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 5, transition: 'background 0.15s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#dc2626'}
                        onMouseLeave={e => e.currentTarget.style.background = '#ef4444'}
                    >
                        <FaUserMinus size={10} /> Remove
                    </button>
                    <button onClick={clearSelection}
                        style={{
                            background: 'transparent', color: '#94a3b8', border: '1px solid #334155',
                            borderRadius: 8, padding: '5px 10px', fontSize: 12, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 4, transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.color = '#e2e8f0'; e.currentTarget.style.borderColor = '#64748b'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.borderColor = '#334155'; }}
                    >
                        <FaTimes size={10} /> Clear
                    </button>
                </div>
            )}

            {/* ── Single-assign Modal ── */}
            <Modal show={assignModal} onHide={() => setAssignModal(false)} centered size="sm">
                <Modal.Header closeButton className="py-2">
                    <Modal.Title as="h6" className="fw-semibold">
                        {assignEmp ? `Assign — ${assignEmp.first_name} ${assignEmp.last_name}` : 'Assign Reporting Manager'}
                    </Modal.Title>
                </Modal.Header>
                <Modal.Body className="p-3">
                    {assignError && <Alert variant="danger" className="py-2 small mb-2">{assignError}</Alert>}
                    <div className="mb-3">
                        <div className="small fw-semibold mb-2">Assign under</div>
                        <div className="d-flex" style={{ background: '#f1f5f9', borderRadius: 10, padding: 3 }}>
                            {[{ key: 'tl', label: 'TL' }, { key: 'manager', label: 'Manager' }].map(opt => (
                                <button key={opt.key} onClick={() => { setAssignType(opt.key); setNewMgrId(''); }}
                                    style={{
                                        flex: 1, border: 'none', borderRadius: 8, padding: '6px 0',
                                        fontWeight: 600, fontSize: 13, cursor: 'pointer',
                                        background: assignType === opt.key ? '#3b82f6' : 'transparent',
                                        color: assignType === opt.key ? '#fff' : '#64748b', transition: 'all 0.2s',
                                    }}>{opt.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <Form.Group>
                        <Form.Label className="small fw-semibold">
                            {assignType === 'tl' ? 'Select TL' : 'Select Manager'}
                        </Form.Label>
                        <Form.Select size="sm" value={newMgrId} onChange={e => setNewMgrId(e.target.value)}>
                            <option value="">-- Select --</option>
                            {(assignType === 'tl' ? managers : subAdmins).map(m => (
                                <option key={m.employee_id} value={m.employee_id}>
                                    {m.first_name} {m.last_name}{m.designation ? ` (${m.designation})` : ''}
                                </option>
                            ))}
                        </Form.Select>
                    </Form.Group>
                </Modal.Body>
                <Modal.Footer className="py-2">
                    <Button variant="secondary" size="sm" onClick={() => setAssignModal(false)}>Cancel</Button>
                    <Button variant="primary" size="sm" onClick={handleAssignSave} disabled={saving}>
                        {saving ? <Spinner size="sm" animation="border" /> : 'Save'}
                    </Button>
                </Modal.Footer>
            </Modal>

            {/* ── Bulk-assign Modal ── */}
            <Modal show={bulkModal} onHide={() => setBulkModal(false)} centered>
                <Modal.Header closeButton className="py-2">
                    <Modal.Title as="h6" className="fw-semibold d-flex align-items-center gap-2">
                        <FaLayerGroup size={14} className="text-primary" />
                        Assign {selectedCount} Employee{selectedCount !== 1 ? 's' : ''}
                    </Modal.Title>
                </Modal.Header>
                <Modal.Body className="p-3">
                    {bulkError && <Alert variant="danger" className="py-2 small mb-2">{bulkError}</Alert>}
                    <div className="mb-3">
                        <div className="small fw-semibold mb-2 text-muted">Selected employees</div>
                        <div style={{ maxHeight: 150, overflowY: 'auto', borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc' }}>
                            {selectedList.map((emp, i) => (
                                <div key={emp.employee_id}
                                    className="d-flex align-items-center gap-2 px-3 py-2"
                                    style={{ borderBottom: i < selectedList.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                                    <Avatar name={`${emp.first_name} ${emp.last_name}`} size={26} bg="#3b82f6" />
                                    <div className="flex-grow-1 min-w-0">
                                        <div className="small fw-semibold text-truncate">{emp.first_name} {emp.last_name}</div>
                                        <div className="text-muted text-truncate" style={{ fontSize: 10 }}>{emp.employee_id}</div>
                                    </div>
                                    <button onClick={() => toggleSelect(emp)}
                                        style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2 }}>
                                        <FaTimes size={10} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="mb-3">
                        <div className="small fw-semibold mb-2">Assign under</div>
                        <div className="d-flex" style={{ background: '#f1f5f9', borderRadius: 10, padding: 3 }}>
                            {[{ key: 'tl', label: 'TL' }, { key: 'manager', label: 'Manager' }].map(opt => (
                                <button key={opt.key} onClick={() => { setBulkType(opt.key); setBulkMgrId(''); }}
                                    style={{
                                        flex: 1, border: 'none', borderRadius: 8, padding: '6px 0',
                                        fontWeight: 600, fontSize: 13, cursor: 'pointer',
                                        background: bulkType === opt.key ? '#3b82f6' : 'transparent',
                                        color: bulkType === opt.key ? '#fff' : '#64748b', transition: 'all 0.2s',
                                    }}>{opt.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <Form.Group>
                        <Form.Label className="small fw-semibold">
                            {bulkType === 'tl' ? 'Select TL' : 'Select Manager'}
                        </Form.Label>
                        <Form.Select value={bulkMgrId} onChange={e => setBulkMgrId(e.target.value)}>
                            <option value="">-- Select --</option>
                            {(bulkType === 'tl' ? managers : subAdmins).map(m => (
                                <option key={m.employee_id} value={m.employee_id}>
                                    {m.first_name} {m.last_name}{m.designation ? ` (${m.designation})` : ''}
                                </option>
                            ))}
                        </Form.Select>
                    </Form.Group>
                </Modal.Body>
                <Modal.Footer className="py-2">
                    <Button variant="secondary" size="sm" onClick={() => setBulkModal(false)}>Cancel</Button>
                    <Button variant="primary" size="sm" onClick={handleBulkAssign}
                        disabled={bulkSaving || !bulkMgrId}
                        className="d-flex align-items-center gap-2">
                        {bulkSaving
                            ? <><Spinner size="sm" animation="border" /> Saving…</>
                            : <><FaCheck size={10} /> Assign {selectedCount}</>}
                    </Button>
                </Modal.Footer>
            </Modal>

            {/* ── Assign Team Member Modal — add unassigned employees to a manager's team directly ── */}
            <Modal show={assignMembersModal} onHide={() => setAssignMembersModal(false)} centered>
                <Modal.Header closeButton className="py-2">
                    <Modal.Title as="h6" className="fw-semibold d-flex align-items-center gap-2">
                        <FaUserTie size={14} className="text-primary" />
                        Assign Team Member{assignMembersMgr ? ` — ${assignMembersMgr.first_name} ${assignMembersMgr.last_name}` : ''}
                    </Modal.Title>
                </Modal.Header>
                <Modal.Body className="p-3">
                    {assignMembersError && <Alert variant="danger" className="py-2 small mb-2">{assignMembersError}</Alert>}
                    <div className="position-relative mb-2">
                        <FaSearch style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 12 }} />
                        <Form.Control size="sm" placeholder="Search unassigned employees…"
                            value={assignMembersSearch} onChange={e => setAssignMembersSearch(e.target.value)}
                            style={{ paddingLeft: 30, borderRadius: 8 }} />
                    </div>
                    <div className="text-muted mb-2" style={{ fontSize: 11 }}>
                        {assignMembersSelected.size > 0
                            ? `${assignMembersSelected.size} employee${assignMembersSelected.size !== 1 ? 's' : ''} selected`
                            : 'Only employees without a TL/manager are shown here.'}
                    </div>
                    <div style={{ maxHeight: 320, overflowY: 'auto', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                        {assignMembersCandidates.length === 0 ? (
                            <div className="text-center text-muted py-4" style={{ fontSize: 13 }}>
                                {allTrueUnassigned.length === 0
                                    ? 'All employees already have a TL/manager.'
                                    : 'No matching employees.'}
                            </div>
                        ) : (
                            <div className="d-flex flex-column">
                                {assignMembersCandidates.map((emp, i) => {
                                    const isSelected = assignMembersSelected.has(emp.employee_id);
                                    return (
                                        <div key={emp.employee_id}
                                            onClick={() => toggleAssignMembersCandidate(emp.employee_id)}
                                            className="d-flex align-items-center gap-2 px-3 py-2"
                                            style={{
                                                cursor: 'pointer',
                                                borderBottom: i < assignMembersCandidates.length - 1 ? '1px solid #f1f5f9' : 'none',
                                                background: isSelected ? '#eff6ff' : '#fff',
                                            }}>
                                            <Checkbox checked={isSelected} onChange={() => toggleAssignMembersCandidate(emp.employee_id)} size={14} />
                                            <Avatar name={`${emp.first_name} ${emp.last_name}`} size={28} bg="#94a3b8" />
                                            <div className="flex-grow-1 min-w-0">
                                                <div className="small fw-semibold text-truncate">{emp.first_name} {emp.last_name}</div>
                                                <div className="text-muted text-truncate" style={{ fontSize: 10 }}>
                                                    {emp.employee_id}{emp.designation ? ` · ${emp.designation}` : ''}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </Modal.Body>
                <Modal.Footer className="py-2">
                    <Button variant="secondary" size="sm" onClick={() => setAssignMembersModal(false)}>Cancel</Button>
                    <Button variant="primary" size="sm" onClick={handleAssignMembersSave}
                        disabled={assignMembersSaving || !assignMembersSelected.size}
                        className="d-flex align-items-center gap-2">
                        {assignMembersSaving
                            ? <><Spinner size="sm" animation="border" /> Saving…</>
                            : <><FaCheck size={10} /> Assign {assignMembersSelected.size || ''}</>}
                    </Button>
                </Modal.Footer>
            </Modal>

            <style>{`
                @keyframes teams-slidein {
                    from { opacity: 0; transform: translate(-50%, 20px); }
                    to   { opacity: 1; transform: translate(-50%, 0); }
                }
                /* left panel scrollbar */
                div[style*="maxHeight: calc(100vh"]::-webkit-scrollbar { width: 4px; }
                div[style*="maxHeight: calc(100vh"]::-webkit-scrollbar-track { background: transparent; }
                div[style*="maxHeight: calc(100vh"]::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 4px; }
            `}</style>
        </div>
    );
};

export default Teams;
