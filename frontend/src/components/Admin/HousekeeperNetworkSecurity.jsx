// src/components/Admin/HousekeeperNetworkSecurity.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FaShieldAlt, FaArrowLeft, FaPlus, FaEdit, FaTrash, FaToggleOn, FaToggleOff,
  FaSave, FaTimes, FaNetworkWired, FaExclamationTriangle, FaSyncAlt,
} from 'react-icons/fa';
import { Spinner, Modal, Form, Button, Alert } from 'react-bootstrap';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';

const OVERRIDE_OPTIONS = [
  { value: '4h', label: '4 hours' },
  { value: '8h', label: '8 hours' },
  { value: '24h', label: '24 hours' },
];

const formatCountdown = (untilIso) => {
  const ms = new Date(untilIso).getTime() - Date.now();
  if (ms <= 0) return null;
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  return `${hours}h ${minutes}m remaining`;
};

const HousekeeperNetworkSecurity = () => {
  const navigate = useNavigate();

  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [policy, setPolicy]     = useState(null);
  const [networks, setNetworks] = useState([]);
  const [blocked24h, setBlocked24h] = useState(0);
  const [alert, setAlert]       = useState({ type: '', msg: '' });
  const [now, setNow]           = useState(Date.now());

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]     = useState(null); // null = new
  const [form, setForm]           = useState({ label: '', cidr: '' });

  const [whoami, setWhoami] = useState(null);
  const [whoamiIsLocal, setWhoamiIsLocal] = useState(false);
  const [whoamiLoading, setWhoamiLoading] = useState(false);

  useEffect(() => { fetchPolicy(); }, []);

  // Re-render every 30s so the override countdown stays live.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const showAlert = (type, msg) => {
    setAlert({ type, msg });
    setTimeout(() => setAlert({ type: '', msg: '' }), 3500);
  };

  const fetchPolicy = async () => {
    setLoading(true);
    try {
      const res = await axios.get(API_ENDPOINTS.HOUSEKEEPER_NETWORK_POLICY);
      setPolicy(res.data.policy);
      setNetworks(res.data.networks || []);
      setBlocked24h(res.data.blocked_24h || 0);
    } catch (err) {
      showAlert('danger', err.response?.data?.message || 'Failed to load network policy.');
    } finally { setLoading(false); }
  };

  const patchPolicy = async (body, successMsg) => {
    setSaving(true);
    try {
      const res = await axios.patch(API_ENDPOINTS.HOUSEKEEPER_NETWORK_POLICY, body);
      setPolicy(res.data.policy);
      showAlert('success', successMsg);
    } catch (err) {
      showAlert('danger', err.response?.data?.message || 'Failed to update policy.');
    } finally { setSaving(false); }
  };

  const fetchWhoami = async () => {
    setWhoamiLoading(true);
    try {
      const res = await axios.get(API_ENDPOINTS.HOUSEKEEPER_NETWORK_WHOAMI);
      setWhoami(res.data.ip);
      setWhoamiIsLocal(!!res.data.isLocalLoopback);
    } catch {
      showAlert('danger', 'Failed to detect current IP.');
    } finally { setWhoamiLoading(false); }
  };

  const openNew = () => { setEditing(null); setForm({ label: '', cidr: '' }); setShowModal(true); };
  const openEdit = (n) => { setEditing(n.id); setForm({ label: n.label, cidr: n.cidr }); setShowModal(true); };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await axios.patch(API_ENDPOINTS.HOUSEKEEPER_NETWORK_ALLOWLIST_BY_ID(editing), form);
        showAlert('success', 'Network updated.');
      } else {
        await axios.post(API_ENDPOINTS.HOUSEKEEPER_NETWORK_ALLOWLIST, form);
        showAlert('success', 'Network added.');
      }
      setShowModal(false);
      fetchPolicy();
    } catch (err) {
      showAlert('danger', err.response?.data?.message || 'Failed to save network.');
    } finally { setSaving(false); }
  };

  const toggleActive = async (n) => {
    try {
      await axios.patch(API_ENDPOINTS.HOUSEKEEPER_NETWORK_ALLOWLIST_BY_ID(n.id), { is_active: !n.is_active });
      fetchPolicy();
    } catch { showAlert('danger', 'Failed to toggle network.'); }
  };

  const handleDelete = async (n) => {
    if (!window.confirm(`Remove "${n.label}" (${n.cidr}) from the allowlist?`)) return;
    try {
      await axios.delete(API_ENDPOINTS.HOUSEKEEPER_NETWORK_ALLOWLIST_BY_ID(n.id));
      showAlert('success', 'Network removed.');
      fetchPolicy();
    } catch { showAlert('danger', 'Failed to remove network.'); }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '64px' }}>
        <Spinner animation="border" style={{ color: 'var(--primary)' }} />
      </div>
    );
  }

  const overrideActive = policy?.emergency_override_until && new Date(policy.emergency_override_until) > new Date(now);
  const countdown = overrideActive ? formatCountdown(policy.emergency_override_until) : null;

  return (
    <div className="p-2 p-md-3 p-lg-4" style={{ backgroundColor: 'var(--body-bg)', minHeight: '100vh' }}>
      <div className="d-flex align-items-center justify-content-between mb-3">
        <h5 className="mb-0 d-flex align-items-center" style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' }}>
          <FaShieldAlt className="me-2" style={{ color: 'var(--primary)' }} />
          Housekeeper IP Access Control
        </h5>
        <button className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1" onClick={() => navigate(-1)}>
          <FaArrowLeft size={12} /> Back
        </button>
      </div>

      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '20px', maxWidth: 680 }}>
        Restricts Housekeeper-only accounts (login and clock in/out) to the networks listed below.
        No other role is affected. Recommended rollout: enable + keep <strong>Monitor Only</strong> on
        for a few days, watch "Blocked (24h)" for false positives, then turn Monitor Only off to
        actually enforce.
      </div>

      {alert.msg && (
        <Alert variant={alert.type} dismissible onClose={() => setAlert({ type: '', msg: '' })}
          style={{ fontSize: '13px', borderRadius: 'var(--radius-sm)', marginBottom: '16px' }}>
          {alert.msg}
        </Alert>
      )}

      {/* ── Switches + stat row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '14px', marginBottom: '18px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          background: 'white', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', padding: '14px 18px',
        }}>
          <Form.Check
            type="switch" id="restriction_enabled_switch"
            checked={!!policy?.restriction_enabled}
            disabled={saving}
            onChange={(e) => patchPolicy({ restriction_enabled: e.target.checked }, e.target.checked ? 'IP restriction enabled.' : 'IP restriction disabled.')}
            style={{ margin: 0 }}
          />
          <div>
            <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>Enable IP restriction</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Turn the Housekeeper allowlist gate on/off entirely.</div>
          </div>
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          background: 'white', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', padding: '14px 18px',
        }}>
          <Form.Check
            type="switch" id="monitor_only_switch"
            checked={!!policy?.monitor_only}
            disabled={saving}
            onChange={(e) => patchPolicy({ monitor_only: e.target.checked }, e.target.checked ? 'Monitor-only mode on — nothing is blocked yet.' : 'Enforcement is now live — off-network Housekeepers will be blocked.')}
            style={{ margin: 0 }}
          />
          <div>
            <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>Monitor only</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Would-be blocks are logged, nobody is blocked yet — watch this for a few days before enforcing.</div>
          </div>
        </div>

        <div style={{
          background: 'white', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', padding: '14px 22px',
          display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minWidth: 130,
        }}>
          <div style={{
            fontSize: '22px', fontWeight: '800',
            color: blocked24h > 20 ? 'var(--danger)' : 'var(--text-primary)',
          }}>
            {blocked24h}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center' }}>Blocked (24h)</div>
        </div>
      </div>

      {/* ── Emergency override ── */}
      <div style={{
        background: overrideActive ? 'var(--warning-light, #FFF7E6)' : 'white',
        border: `1px solid ${overrideActive ? '#FDE68A' : 'var(--border)'}`,
        borderRadius: 'var(--radius-sm)', padding: '14px 18px', marginBottom: '18px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px',
      }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FaExclamationTriangle size={12} style={{ color: overrideActive ? '#B45309' : 'var(--text-muted)' }} />
            Emergency override
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {overrideActive
              ? `Enforcement is temporarily disabled for all Housekeepers — ${countdown}.`
              : 'Temporarily disable enforcement org-wide (e.g. office IP just changed).'}
          </div>
        </div>
        <div className="hrms-responsive-toolbar" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {overrideActive ? (
            <Button variant="outline-danger" size="sm" disabled={saving}
              onClick={() => patchPolicy({ stop_override: true }, 'Emergency override ended.')}
              style={{ fontSize: '12px', borderRadius: 'var(--radius-sm)' }}>
              End now
            </Button>
          ) : (
            OVERRIDE_OPTIONS.map(opt => (
              <Button key={opt.value} variant="outline-secondary" size="sm" disabled={saving}
                onClick={() => patchPolicy({ override_duration: opt.value }, `Emergency override started for ${opt.label}.`)}
                style={{ fontSize: '12px', borderRadius: 'var(--radius-sm)' }}>
                {opt.label}
              </Button>
            ))
          )}
        </div>
      </div>

      {/* ── Your current IP ── */}
      <div style={{
        background: 'white', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
        padding: '14px 18px', marginBottom: '18px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>Your current IP</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Stand in the office and check this before adding a network below.</div>
          </div>
          <div className="hrms-responsive-toolbar" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {whoami && (
              <code style={{ fontSize: '13px', background: 'var(--body-bg)', border: '1px solid var(--border)', borderRadius: '6px', padding: '4px 10px' }}>
                {whoami}
              </code>
            )}
            <Button variant="outline-primary" size="sm" onClick={fetchWhoami} disabled={whoamiLoading}
              style={{ fontSize: '12px', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              {whoamiLoading ? <Spinner size="sm" animation="border" /> : <FaSyncAlt size={11} />}
              {whoami ? 'Refresh' : 'Check my IP'}
            </Button>
          </div>
        </div>
        {whoami && whoamiIsLocal && (
          <div style={{
            marginTop: '12px', fontSize: '11px', color: '#B45309',
            background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 'var(--radius-sm)',
            padding: '8px 12px',
          }}>
            This is a local/loopback address ({whoami}), not a real office IP — you're testing
            against a local dev backend, where requests never leave your machine. This readout
            will show your real network's IP once the app is deployed (or accessed through a
            tunnel like ngrok). Adding {whoami} to the allowlist won't help with local testing.
          </div>
        )}
      </div>

      {/* ── Allowlist ── */}
      <div className="hrms-responsive-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>Allowlisted networks</div>
        <button onClick={openNew} style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          background: 'var(--primary)', color: 'white', border: 'none',
          borderRadius: 'var(--radius-sm)', padding: '8px 16px',
          fontSize: '13px', fontWeight: '600', cursor: 'pointer',
        }}>
          <FaPlus size={11} /> Add Network
        </button>
      </div>

      {networks.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '48px 24px', background: 'white',
          borderRadius: 'var(--radius)', border: '1px dashed var(--border)',
        }}>
          <FaNetworkWired size={28} style={{ color: 'var(--text-muted)', marginBottom: '10px' }} />
          <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-secondary)' }}>No networks allowlisted yet</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
            An empty allowlist is treated as unconfigured — Housekeepers won't be blocked until at least one network is added.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {networks.map(n => (
            <div key={n.id} style={{
              background: 'white', border: `1px solid ${n.is_active ? 'var(--primary-muted)' : 'var(--border)'}`,
              borderRadius: 'var(--radius)', padding: '14px 18px',
              display: 'flex', alignItems: 'center', gap: '14px',
              opacity: n.is_active ? 1 : 0.6,
            }}>
              <div style={{
                width: '36px', height: '36px', borderRadius: '8px', flexShrink: 0,
                background: 'var(--primary-light)', border: '1px solid var(--primary-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <FaNetworkWired size={13} style={{ color: 'var(--primary)' }} />
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>{n.label}</span>
                  {!n.is_active && (
                    <span style={{
                      fontSize: '10px', color: 'var(--text-muted)', background: 'var(--body-bg)',
                      border: '1px solid var(--border)', borderRadius: '4px', padding: '1px 6px',
                    }}>
                      Inactive
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '3px', fontFamily: 'monospace' }}>
                  {n.cidr}
                </div>
              </div>

              <div className="hrms-responsive-toolbar" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                <button onClick={() => toggleActive(n)} title={n.is_active ? 'Deactivate' : 'Activate'} style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
                  color: n.is_active ? 'var(--success)' : 'var(--text-muted)', fontSize: '20px',
                }}>
                  {n.is_active ? <FaToggleOn /> : <FaToggleOff />}
                </button>
                <button onClick={() => openEdit(n)} title="Edit" style={{
                  width: '30px', height: '30px', borderRadius: 'var(--radius-sm)',
                  background: 'var(--primary-light)', border: '1px solid var(--primary-muted)',
                  color: 'var(--primary)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <FaEdit size={11} />
                </button>
                <button onClick={() => handleDelete(n)} title="Delete" style={{
                  width: '30px', height: '30px', borderRadius: 'var(--radius-sm)',
                  background: 'var(--danger-light)', border: '1px solid #FECACA',
                  color: 'var(--danger)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <FaTrash size={11} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Create / Edit Modal ── */}
      <Modal show={showModal} onHide={() => setShowModal(false)} centered>
        <Modal.Header closeButton style={{ borderBottom: '1px solid var(--border)', padding: '18px 24px' }}>
          <Modal.Title style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)' }}>
            {editing ? 'Edit Network' : 'Add Network'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ padding: '24px' }}>
          <Form onSubmit={handleSave}>
            <Form.Group className="mb-3">
              <Form.Label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>Label *</Form.Label>
              <Form.Control
                value={form.label} required
                onChange={(e) => setForm(f => ({ ...f, label: e.target.value }))}
                placeholder="e.g. HQ Mumbai"
                style={{ fontSize: '13px', borderRadius: 'var(--radius-sm)' }}
              />
            </Form.Group>
            <Form.Group>
              <Form.Label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>CIDR / IP *</Form.Label>
              <Form.Control
                value={form.cidr} required
                onChange={(e) => setForm(f => ({ ...f, cidr: e.target.value }))}
                placeholder="e.g. 203.0.113.10 or 203.0.113.0/24"
                style={{ fontSize: '13px', borderRadius: 'var(--radius-sm)', fontFamily: 'monospace' }}
              />
              <Form.Text style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                A bare IP is treated as an exact match (/32). Use "a.b.c.d/nn" for a range.
              </Form.Text>
            </Form.Group>

            <div className="hrms-responsive-toolbar" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <Button variant="light" size="sm" onClick={() => setShowModal(false)} style={{ fontSize: '13px', borderRadius: 'var(--radius-sm)' }}>
                <FaTimes size={10} className="me-1" /> Cancel
              </Button>
              <Button type="submit" size="sm" disabled={saving} style={{
                background: 'var(--primary)', border: 'none', fontSize: '13px',
                borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: '6px',
              }}>
                {saving ? <Spinner size="sm" animation="border" /> : <FaSave size={11} />}
                {editing ? 'Save Changes' : 'Add Network'}
              </Button>
            </div>
          </Form>
        </Modal.Body>
      </Modal>
    </div>
  );
};

export default HousekeeperNetworkSecurity;
