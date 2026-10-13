// src/components/Admin/AdminBroadcast.jsx
import React, { useState, useEffect } from 'react';
import {
  FaExclamationTriangle, FaBullhorn, FaClipboardList,
  FaPlus, FaEdit, FaTrash, FaToggleOn, FaToggleOff, FaSave, FaTimes, FaArrowLeft
} from 'react-icons/fa';
import { Spinner, Modal, Form, Button, Alert } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import SendNotice from './SendNotice';
import Announcements from './Announcements';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';

// ── Notice Board Manager ──────────────────────────────────────────────────────
const NoticeBoardManager = () => {
  const [notices, setNotices]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]     = useState(null); // null = new
  const [alert, setAlert]         = useState({ type: '', msg: '' });

  const blank = {
    title: '', message: '', display_type: 'marquee',
    direction: 'right_to_left', text_color: '#2B2B2B',
    background_color: '#FFF8E7', font_style: 'normal', is_active: false,
  };
  const [form, setForm] = useState(blank);

  useEffect(() => { fetchNotices(); }, []);

  const fetchNotices = async () => {
    setLoading(true);
    try {
      const res = await axios.get(API_ENDPOINTS.NOTICE_BOARD_LIST);
      setNotices(res.data.notices || []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  const openNew = () => { setEditing(null); setForm(blank); setShowModal(true); };

  const openEdit = (n) => {
    setEditing(n.id);
    setForm({
      title: n.title, message: n.message, display_type: n.display_type,
      direction: n.direction, text_color: n.text_color,
      background_color: n.background_color, font_style: n.font_style,
      is_active: n.is_active,
    });
    setShowModal(true);
  };

  const showAlert = (type, msg) => {
    setAlert({ type, msg });
    setTimeout(() => setAlert({ type: '', msg: '' }), 3500);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await axios.put(API_ENDPOINTS.NOTICE_BOARD_UPDATE(editing), form);
        showAlert('success', 'Notice updated successfully.');
      } else {
        await axios.post(API_ENDPOINTS.NOTICE_BOARD_CREATE, form);
        showAlert('success', 'Notice created successfully.');
      }
      setShowModal(false);
      fetchNotices();
      // tell navbar to refresh
      window.dispatchEvent(new Event('noticeBoardChanged'));
    } catch (err) {
      showAlert('danger', err.response?.data?.message || 'Failed to save notice.');
    } finally { setSaving(false); }
  };

  const toggleActive = async (n) => {
    try {
      await axios.put(API_ENDPOINTS.NOTICE_BOARD_UPDATE(n.id), { is_active: !n.is_active });
      fetchNotices();
      window.dispatchEvent(new Event('noticeBoardChanged'));
    } catch { showAlert('danger', 'Failed to toggle notice.'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this notice?')) return;
    try {
      await axios.delete(API_ENDPOINTS.NOTICE_BOARD_DELETE(id));
      showAlert('success', 'Notice deleted.');
      fetchNotices();
      window.dispatchEvent(new Event('noticeBoardChanged'));
    } catch { showAlert('danger', 'Failed to delete notice.'); }
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div>
      {/* Header row */}
      <div className="hrms-responsive-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)' }}>Notice Board</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Manage global notices shown in the navbar. Only one notice can be active at a time.
          </div>
        </div>
        <button
          onClick={openNew}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            background: 'var(--primary)', color: 'white', border: 'none',
            borderRadius: 'var(--radius-sm)', padding: '8px 16px',
            fontSize: '13px', fontWeight: '600', cursor: 'pointer',
          }}
        >
          <FaPlus size={11} /> New Notice
        </button>
      </div>

      {alert.msg && (
        <Alert variant={alert.type} dismissible onClose={() => setAlert({ type: '', msg: '' })}
          style={{ fontSize: '13px', borderRadius: 'var(--radius-sm)', marginBottom: '16px' }}>
          {alert.msg}
        </Alert>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px' }}>
          <Spinner animation="border" size="sm" style={{ color: 'var(--primary)' }} />
        </div>
      ) : notices.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '56px 24px', background: 'var(--body-bg)',
          borderRadius: 'var(--radius)', border: '1px dashed var(--border)',
        }}>
          <FaClipboardList size={32} style={{ color: 'var(--text-muted)', marginBottom: '12px' }} />
          <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-secondary)' }}>No notices yet</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Create your first notice to display in the navbar.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {notices.map(n => (
            <div key={n.id} style={{
              background: 'white', border: `1px solid ${n.is_active ? 'var(--primary-muted)' : 'var(--border)'}`,
              borderRadius: 'var(--radius)', padding: '14px 18px',
              display: 'flex', alignItems: 'center', gap: '14px',
              boxShadow: n.is_active ? '0 0 0 3px rgba(37,99,235,0.08)' : 'var(--shadow-xs)',
              transition: 'all 0.2s',
            }}>
              {/* Color swatch */}
              <div style={{
                width: '36px', height: '36px', borderRadius: '8px', flexShrink: 0,
                background: n.background_color, border: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <FaBullhorn size={13} style={{ color: n.text_color }} />
              </div>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>
                    {n.title}
                  </span>
                  {n.is_active && (
                    <span style={{
                      fontSize: '10px', fontWeight: '700', background: 'var(--success-light)',
                      color: 'var(--success)', border: '1px solid #BBF7D0',
                      borderRadius: '4px', padding: '1px 7px', letterSpacing: '0.3px',
                    }}>
                      LIVE
                    </span>
                  )}
                  <span style={{
                    fontSize: '10px', color: 'var(--text-muted)', background: 'var(--body-bg)',
                    border: '1px solid var(--border)', borderRadius: '4px', padding: '1px 6px',
                  }}>
                    {n.display_type === 'marquee' ? `Marquee · ${n.direction === 'right_to_left' ? '← RTL' : 'LTR →'}` : 'Static'}
                  </span>
                </div>
                <div style={{
                  fontSize: '12px', color: 'var(--text-secondary)', marginTop: '3px',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {n.message}
                </div>
              </div>

              {/* Actions */}
              <div className="hrms-responsive-toolbar" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                <button
                  onClick={() => toggleActive(n)}
                  title={n.is_active ? 'Deactivate' : 'Activate'}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
                    color: n.is_active ? 'var(--success)' : 'var(--text-muted)', fontSize: '20px',
                    transition: 'color 0.15s',
                  }}
                >
                  {n.is_active ? <FaToggleOn /> : <FaToggleOff />}
                </button>
                <button
                  onClick={() => openEdit(n)}
                  style={{
                    width: '30px', height: '30px', borderRadius: 'var(--radius-sm)',
                    background: 'var(--primary-light)', border: '1px solid var(--primary-muted)',
                    color: 'var(--primary)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                  title="Edit"
                >
                  <FaEdit size={11} />
                </button>
                <button
                  onClick={() => handleDelete(n.id)}
                  style={{
                    width: '30px', height: '30px', borderRadius: 'var(--radius-sm)',
                    background: 'var(--danger-light)', border: '1px solid #FECACA',
                    color: 'var(--danger)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                  title="Delete"
                >
                  <FaTrash size={11} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Create / Edit Modal ── */}
      <Modal show={showModal} onHide={() => setShowModal(false)} centered size="lg">
        <Modal.Header closeButton style={{ borderBottom: '1px solid var(--border)', padding: '18px 24px' }}>
          <Modal.Title style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)' }}>
            {editing ? 'Edit Notice' : 'Create Notice'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ padding: '24px' }}>
          <Form onSubmit={handleSave}>
            <div className="hrms-responsive-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

              {/* Title */}
              <Form.Group style={{ gridColumn: '1 / -1' }}>
                <Form.Label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                  Notice Title *
                </Form.Label>
                <Form.Control
                  value={form.title} required
                  onChange={e => set('title', e.target.value)}
                  placeholder="e.g. Office Closure Notice"
                  style={{ fontSize: '13px', borderRadius: 'var(--radius-sm)' }}
                />
              </Form.Group>

              {/* Message */}
              <Form.Group style={{ gridColumn: '1 / -1' }}>
                <Form.Label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                  Notice Message *
                </Form.Label>
                <Form.Control
                  as="textarea" rows={3} value={form.message} required
                  onChange={e => set('message', e.target.value)}
                  placeholder="Type the notice message that will scroll/display in the navbar..."
                  style={{ fontSize: '13px', borderRadius: 'var(--radius-sm)', resize: 'vertical' }}
                />
              </Form.Group>

              {/* Display Type */}
              <Form.Group>
                <Form.Label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                  Display Type
                </Form.Label>
                <Form.Select value={form.display_type} onChange={e => set('display_type', e.target.value)}
                  style={{ fontSize: '13px', borderRadius: 'var(--radius-sm)' }}>
                  <option value="marquee">Marquee Scroll</option>
                  <option value="static">Static Text</option>
                </Form.Select>
              </Form.Group>

              {/* Direction */}
              {form.display_type === 'marquee' && (
                <Form.Group>
                  <Form.Label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                    Scroll Direction
                  </Form.Label>
                  <Form.Select value={form.direction} onChange={e => set('direction', e.target.value)}
                    style={{ fontSize: '13px', borderRadius: 'var(--radius-sm)' }}>
                    <option value="right_to_left">Right → Left</option>
                    <option value="left_to_right">Left → Right</option>
                  </Form.Select>
                </Form.Group>
              )}

              {/* Font Style */}
              <Form.Group>
                <Form.Label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                  Font Style
                </Form.Label>
                <Form.Select value={form.font_style} onChange={e => set('font_style', e.target.value)}
                  style={{ fontSize: '13px', borderRadius: 'var(--radius-sm)' }}>
                  <option value="normal">Normal</option>
                  <option value="bold">Bold</option>
                  <option value="italic">Italic</option>
                  <option value="bold italic">Bold Italic</option>
                </Form.Select>
              </Form.Group>

              {/* Text Color */}
              <Form.Group>
                <Form.Label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                  Text Color
                </Form.Label>
                <div className="hrms-responsive-toolbar" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input type="color" value={form.text_color}
                    onChange={e => set('text_color', e.target.value)}
                    style={{ width: '40px', height: '36px', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', padding: '2px' }}
                  />
                  <Form.Control value={form.text_color}
                    onChange={e => set('text_color', e.target.value)}
                    style={{ fontSize: '12px', fontFamily: 'monospace', borderRadius: 'var(--radius-sm)' }}
                  />
                </div>
              </Form.Group>

              {/* Background Color */}
              <Form.Group>
                <Form.Label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                  Background Color
                </Form.Label>
                <div className="hrms-responsive-toolbar" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input type="color" value={form.background_color}
                    onChange={e => set('background_color', e.target.value)}
                    style={{ width: '40px', height: '36px', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', padding: '2px' }}
                  />
                  <Form.Control value={form.background_color}
                    onChange={e => set('background_color', e.target.value)}
                    style={{ fontSize: '12px', fontFamily: 'monospace', borderRadius: 'var(--radius-sm)' }}
                  />
                </div>
              </Form.Group>

              {/* Active toggle */}
              <Form.Group style={{ gridColumn: '1 / -1' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  background: 'var(--body-bg)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)', padding: '12px 16px',
                }}>
                  <Form.Check
                    type="switch" id="is_active_switch"
                    checked={form.is_active}
                    onChange={e => set('is_active', e.target.checked)}
                    style={{ margin: 0 }}
                  />
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>
                      Activate immediately
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      Enabling this will deactivate any currently active notice.
                    </div>
                  </div>
                </div>
              </Form.Group>

              {/* Live Preview */}
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  Live Preview
                </div>
                <div style={{
                  background: form.background_color, borderRadius: '8px',
                  padding: '10px 16px', overflow: 'hidden',
                  border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px',
                }}>
                  <FaBullhorn size={12} style={{ color: form.text_color, flexShrink: 0, opacity: 0.7 }} />
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    {form.display_type === 'static' ? (
                      <span style={{
                        fontSize: '13px', color: form.text_color,
                        fontStyle: form.font_style.includes('italic') ? 'italic' : 'normal',
                        fontWeight: form.font_style.includes('bold') ? '700' : '400',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        display: 'block',
                      }}>
                        {form.message || 'Your notice message will appear here...'}
                      </span>
                    ) : (
                      <div style={{ overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        <div style={{
                          display: 'inline-flex',
                          animation: form.direction === 'left_to_right'
                            ? 'noticeScrollLTR 30s linear infinite'
                            : 'noticeScrollRTL 30s linear infinite',
                        }}>
                          {[0, 1].map(half => (
                            <span key={half} style={{
                              display: 'inline-block',
                              whiteSpace: 'nowrap',
                              paddingRight: '4em',
                              fontSize: '13px',
                              color: form.text_color,
                              fontStyle: form.font_style.includes('italic') ? 'italic' : 'normal',
                              fontWeight: form.font_style.includes('bold') ? '700' : '400',
                            }}>
                              {Array(5).fill(form.message || 'Your notice message will appear here...').join('    ·    ')}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="hrms-responsive-toolbar" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
              <Button variant="light" size="sm" onClick={() => setShowModal(false)}
                style={{ fontSize: '13px', borderRadius: 'var(--radius-sm)' }}>
                <FaTimes size={10} className="me-1" /> Cancel
              </Button>
              <Button type="submit" size="sm" disabled={saving}
                style={{
                  background: 'var(--primary)', border: 'none', fontSize: '13px',
                  borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: '6px',
                }}>
                {saving ? <Spinner size="sm" animation="border" /> : <FaSave size={11} />}
                {editing ? 'Update Notice' : 'Create Notice'}
              </Button>
            </div>
          </Form>
        </Modal.Body>
      </Modal>
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────
const TABS = [
  { key: 'noticeboard',  label: 'Notice Board',          icon: <FaClipboardList size={13} /> },
  { key: 'notice',       label: 'Send Notice / Warning', icon: <FaExclamationTriangle size={13} /> },
  { key: 'announcement', label: 'Announcements',         icon: <FaBullhorn size={13} /> },
];

const AdminBroadcast = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('noticeboard');

  return (
    <div className="p-2 p-md-3 p-lg-4" style={{ backgroundColor: 'var(--body-bg)', minHeight: '100vh' }}>
      <div className="d-flex align-items-center justify-content-between mb-3">
        <h5 className="mb-0 d-flex align-items-center" style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' }}>
          <FaBullhorn className="me-2" style={{ color: 'var(--primary)' }} />
          Broadcast Center
        </h5>
        <button
          className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1"
          onClick={() => navigate(-1)}
        >
          <FaArrowLeft size={12} /> Back
        </button>
      </div>

      {/* Tab Bar */}
      <div className="hrms-responsive-toolbar" style={{ display: 'flex', borderBottom: '2px solid var(--border)', marginBottom: '24px', gap: '2px' }}>
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: '7px',
              padding: '9px 18px',
              border: 'none',
              borderBottom: activeTab === tab.key ? '2px solid var(--primary)' : '2px solid transparent',
              marginBottom: '-2px',
              background: 'transparent',
              color: activeTab === tab.key ? 'var(--primary)' : 'var(--text-secondary)',
              fontWeight: activeTab === tab.key ? '600' : '400',
              fontSize: '13px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.18s ease',
              borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0',
            }}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'noticeboard'  && <NoticeBoardManager />}
      {activeTab === 'notice'       && <SendNotice embedded />}
      {activeTab === 'announcement' && <Announcements embedded />}
    </div>
  );
};

export default AdminBroadcast;
