import PaginatedTable from '../Common/PaginatedTable';
// src/components/Admin/Announcements.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card, Form, Button, Alert, Spinner, Badge, Row, Col, Table, Modal
} from 'react-bootstrap';
import {
  FaBullhorn, FaPlus, FaTrash, FaEye, FaCheckCircle, FaTimesCircle,
  FaExclamationTriangle, FaCalendarAlt, FaBell, FaFileAlt,
  FaGift, FaShieldAlt, FaImage, FaTimes, FaArrowLeft
} from 'react-icons/fa';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';

const TYPE_CONFIG = {
  announcement: { label: 'Announcement',  icon: <FaBullhorn size={12} />,          bg: 'primary'  },
  notice:        { label: 'Notice',        icon: <FaBell size={12} />,              bg: 'info'     },
  warning:       { label: 'Warning',       icon: <FaExclamationTriangle size={12} />, bg: 'warning' },
  holiday:       { label: 'Holiday',       icon: <FaCalendarAlt size={12} />,       bg: 'success'  },
  policy:        { label: 'Policy Update', icon: <FaFileAlt size={12} />,           bg: 'secondary'},
  event:         { label: 'Event',         icon: <FaGift size={12} />,              bg: 'purple'   },
  urgent:        { label: 'Urgent',        icon: <FaShieldAlt size={12} />,         bg: 'danger'   },
};

const PRIORITY_CONFIG = {
  low:    { label: 'Low',    bg: 'secondary' },
  normal: { label: 'Normal', bg: 'info'      },
  high:   { label: 'High',   bg: 'warning'   },
  urgent: { label: 'Urgent', bg: 'danger'    },
};

const Announcements = ({ embedded = false }) => {
  const navigate = useNavigate();
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading]             = useState(true);
  const [submitting, setSubmitting]       = useState(false);
  const [message, setMessage]             = useState({ type: '', text: '' });
  const [viewItem, setViewItem]           = useState(null);
  const [deleteId, setDeleteId]           = useState(null);
  const [imageFile, setImageFile]         = useState(null);
  const [imagePreview, setImagePreview]   = useState(null);
  const fileInputRef = useRef(null);

  // Form state
  const [form, setForm] = useState({
    title: '', message: '', type: 'announcement', priority: 'normal', expires_at: ''
  });

  useEffect(() => { fetchAnnouncements(); }, []);

  const fetchAnnouncements = async () => {
    try {
      setLoading(true);
      const res = await axios.get(API_ENDPOINTS.ANNOUNCEMENTS);
      setAnnouncements(res.data?.announcements || []);
    } catch {
      showMsg('danger', 'Failed to load announcements');
    } finally {
      setLoading(false);
    }
  };

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showMsg('danger', 'Only image files allowed');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showMsg('danger', 'Image size must be less than 5MB');
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const clearImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.message.trim()) return showMsg('danger', 'Title and message are required');
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('title', form.title.trim());
      formData.append('message', form.message.trim());
      formData.append('type', form.type);
      formData.append('priority', form.priority);
      if (form.expires_at) formData.append('expires_at', form.expires_at);
      if (imageFile) formData.append('image', imageFile);

      await axios.post(API_ENDPOINTS.ANNOUNCEMENTS, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      showMsg('success', 'Announcement published successfully!');
      setForm({ title: '', message: '', type: 'announcement', priority: 'normal', expires_at: '' });
      clearImage();
      fetchAnnouncements();
    } catch (err) {
      showMsg('danger', err.response?.data?.message || 'Failed to publish');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(API_ENDPOINTS.ANNOUNCEMENT_DELETE(id));
      setAnnouncements(prev => prev.filter(a => a.id !== id));
      setDeleteId(null);
      showMsg('success', 'Announcement deleted');
    } catch {
      showMsg('danger', 'Failed to delete');
    }
  };

  const showMsg = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 4000);
  };

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

  return (
    <div className={embedded ? '' : 'p-2 p-md-3 p-lg-4'} style={embedded ? {} : { backgroundColor: '#f8f9fc', minHeight: '100vh' }}>
      {!embedded && (
        <div className="d-flex align-items-center justify-content-between mb-4">
          <h5 className="mb-0 d-flex align-items-center">
            <FaBullhorn className="me-2 text-primary" />
            Announcements & Broadcasts
          </h5>
          <button
            className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1"
            onClick={() => navigate(-1)}
          >
            <FaArrowLeft size={12} /> Back
          </button>
        </div>
      )}

      {message.text && (
        <Alert variant={message.type} dismissible onClose={() => setMessage({ type: '', text: '' })} className="mb-3 py-2 small">
          {message.type === 'success' ? <FaCheckCircle className="me-2" /> : <FaTimesCircle className="me-2" />}
          {message.text}
        </Alert>
      )}

      <Row className="g-3">
        {/* LEFT: Create form */}
        <Col lg={5}>
          <Card className="border-0 shadow-sm">
            <Card.Header className="bg-light py-2">
              <h6 className="mb-0 small fw-semibold"><FaPlus className="me-2" size={12} />New Announcement</h6>
            </Card.Header>
            <Card.Body className="p-3">
              <Form onSubmit={handleSubmit}>
                {/* Type */}
                <Form.Group className="mb-3">
                  <Form.Label className="small fw-semibold">Type <span className="text-danger">*</span></Form.Label>
                  <div className="d-flex flex-wrap gap-2">
                    {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, type: key }))}
                        className="d-flex align-items-center gap-1"
                        style={{
                          padding: '4px 10px',
                          borderRadius: '20px',
                          border: form.type === key ? '2px solid #0d6efd' : '1px solid #dee2e6',
                          background: form.type === key ? '#e7f1ff' : '#fff',
                          color: form.type === key ? '#0d6efd' : '#6c757d',
                          fontSize: '12px',
                          cursor: 'pointer',
                          fontWeight: form.type === key ? '600' : '400'
                        }}
                      >
                        {cfg.icon} {cfg.label}
                      </button>
                    ))}
                  </div>
                </Form.Group>

                {/* Priority */}
                <Form.Group className="mb-3">
                  <Form.Label className="small fw-semibold">Priority</Form.Label>
                  <div className="d-flex gap-2">
                    {Object.entries(PRIORITY_CONFIG).map(([key, cfg]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, priority: key }))}
                        style={{
                          padding: '3px 10px',
                          borderRadius: '20px',
                          border: form.priority === key ? '2px solid #0d6efd' : '1px solid #dee2e6',
                          background: form.priority === key ? '#e7f1ff' : '#fff',
                          color: form.priority === key ? '#0d6efd' : '#6c757d',
                          fontSize: '12px',
                          cursor: 'pointer',
                          fontWeight: form.priority === key ? '600' : '400'
                        }}
                      >
                        {cfg.label}
                      </button>
                    ))}
                  </div>
                </Form.Group>

                {/* Title */}
                <Form.Group className="mb-3">
                  <Form.Label className="small fw-semibold">Title <span className="text-danger">*</span></Form.Label>
                  <Form.Control
                    size="sm" type="text"
                    placeholder="e.g., Office Closed on Monday"
                    value={form.title}
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    required
                  />
                </Form.Group>

                {/* Message */}
                <Form.Group className="mb-3">
                  <Form.Label className="small fw-semibold">Message <span className="text-danger">*</span></Form.Label>
                  <Form.Control
                    as="textarea" rows={4} size="sm"
                    placeholder="Write the full announcement here..."
                    value={form.message}
                    onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                    required
                  />
                </Form.Group>

                {/* Image Upload */}
                <Form.Group className="mb-3">
                  <Form.Label className="small fw-semibold">
                    <FaImage className="me-1" size={12} /> Image <span className="text-muted fw-normal">(optional, max 5MB)</span>
                  </Form.Label>
                  {imagePreview ? (
                    <div className="position-relative d-inline-block">
                      <img
                        src={imagePreview}
                        alt="preview"
                        style={{ width: '100%', maxHeight: '160px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #dee2e6' }}
                      />
                      <button
                        type="button"
                        onClick={clearImage}
                        style={{
                          position: 'absolute', top: '6px', right: '6px',
                          background: 'rgba(0,0,0,0.6)', border: 'none',
                          borderRadius: '50%', width: '24px', height: '24px',
                          color: '#fff', cursor: 'pointer', display: 'flex',
                          alignItems: 'center', justifyContent: 'center'
                        }}
                      >
                        <FaTimes size={11} />
                      </button>
                    </div>
                  ) : (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      style={{
                        border: '2px dashed #dee2e6', borderRadius: '8px',
                        padding: '20px', textAlign: 'center', cursor: 'pointer',
                        background: '#fafafa', transition: 'border-color 0.2s'
                      }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = '#0d6efd'}
                      onMouseLeave={e => e.currentTarget.style.borderColor = '#dee2e6'}
                    >
                      <FaImage size={24} className="text-muted mb-2" />
                      <p className="mb-0 small text-muted">Click to upload image</p>
                      <p className="mb-0" style={{ fontSize: '11px', color: '#adb5bd' }}>JPG, PNG, GIF, WEBP · Max 5MB</p>
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handleImageSelect}
                  />
                </Form.Group>

                {/* Expiry */}
                <Form.Group className="mb-3">
                  <Form.Label className="small fw-semibold">
                    Expires On <span className="text-muted fw-normal">(optional — leave blank to show forever)</span>
                  </Form.Label>
                  <Form.Control
                    size="sm" type="datetime-local"
                    value={form.expires_at}
                    onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))}
                  />
                </Form.Group>

                <Button
                  type="submit" variant="primary" className="w-100 d-flex align-items-center justify-content-center gap-2"
                  disabled={submitting || !form.title.trim() || !form.message.trim()}
                >
                  {submitting
                    ? <><Spinner size="sm" animation="border" />Publishing...</>
                    : <><FaBullhorn size={13} />Publish to All Employees</>}
                </Button>
              </Form>
            </Card.Body>
          </Card>
        </Col>

        {/* RIGHT: List */}
        <Col lg={7}>
          <Card className="border-0 shadow-sm">
            <Card.Header className="bg-light py-2 d-flex justify-content-between align-items-center">
              <h6 className="mb-0 small fw-semibold"><FaBullhorn className="me-2" size={12} />Published Announcements</h6>
              <Badge bg="secondary" pill>{announcements.length}</Badge>
            </Card.Header>
            <Card.Body className="p-0">
              {loading ? (
                <div className="text-center py-4"><Spinner size="sm" animation="border" variant="primary" /></div>
              ) : announcements.length === 0 ? (
                <div className="text-center py-5 text-muted small">
                  <FaBullhorn size={30} className="mb-2 opacity-50" /><br />No announcements yet
                </div>
              ) : (
                <div className="table-responsive" style={{ maxHeight: '520px', overflowY: 'auto' }}>
                  <PaginatedTable as={Table} hover size="sm" className="mb-0">
                    <thead className="bg-light sticky-top" style={{ top: 0, zIndex: 10 }}>
                      <tr className="small">
                        <th className="fw-normal">#</th>
                        <th className="fw-normal">Title</th>
                        <th className="fw-normal d-none d-md-table-cell">Type</th>
                        <th className="fw-normal d-none d-md-table-cell">Priority</th>
                        <th className="fw-normal d-none d-lg-table-cell">Published</th>
                        <th className="fw-normal d-none d-lg-table-cell">Expires</th>
                        <th className="fw-normal text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {announcements.map((a, i) => {
                        const tc = TYPE_CONFIG[a.type] || TYPE_CONFIG.announcement;
                        const pc = PRIORITY_CONFIG[a.priority] || PRIORITY_CONFIG.normal;
                        const isExpired = a.expires_at && new Date(a.expires_at) < new Date();
                        return (
                          <tr key={a.id} className={isExpired ? 'opacity-50' : ''}>
                            <td className="small">{i + 1}</td>
                            <td className="small">
                              <div className="fw-semibold text-truncate" style={{ maxWidth: '160px' }} title={a.title}>
                                {a.title}
                              </div>
                              {a.image_url && <FaImage size={10} className="text-info me-1" title="Has image" />}
                              {isExpired && <small className="text-danger">Expired</small>}
                            </td>
                            <td className="small d-none d-md-table-cell">
                              <Badge bg={tc.bg} className="d-flex align-items-center gap-1" style={{ width: 'fit-content' }}>
                                {tc.icon} {tc.label}
                              </Badge>
                            </td>
                            <td className="small d-none d-md-table-cell">
                              <Badge bg={pc.bg}>{pc.label}</Badge>
                            </td>
                            <td className="small d-none d-lg-table-cell text-muted text-nowrap">
                              {formatDate(a.created_at)}
                            </td>
                            <td className="small d-none d-lg-table-cell text-muted text-nowrap">
                              {a.expires_at ? formatDate(a.expires_at) : <span className="text-success">Forever</span>}
                            </td>
                            <td className="text-center">
                              <div className="d-flex gap-2 justify-content-center">
                                <FaEye size={14} className="text-primary" style={{ cursor: 'pointer' }}
                                  onClick={() => setViewItem(a)} title="View" />
                                <FaTrash size={14} className="text-danger" style={{ cursor: 'pointer' }}
                                  onClick={() => setDeleteId(a.id)} title="Delete" />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </PaginatedTable>
                </div>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* View Modal */}
      <Modal show={!!viewItem} onHide={() => setViewItem(null)} centered>
        <Modal.Header closeButton className="py-2">
          <Modal.Title as="h6" className="mb-0 small fw-semibold d-flex align-items-center gap-2">
            {viewItem && TYPE_CONFIG[viewItem.type]?.icon}
            {viewItem?.title}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="small">
          {viewItem && (
            <>
              <div className="d-flex gap-2 mb-3 flex-wrap">
                <Badge bg={TYPE_CONFIG[viewItem.type]?.bg}>{TYPE_CONFIG[viewItem.type]?.label}</Badge>
                <Badge bg={PRIORITY_CONFIG[viewItem.priority]?.bg}>{PRIORITY_CONFIG[viewItem.priority]?.label} Priority</Badge>
                {viewItem.expires_at
                  ? <Badge bg="warning" text="dark">Expires: {formatDate(viewItem.expires_at)}</Badge>
                  : <Badge bg="success">No Expiry</Badge>}
              </div>
              <p className="text-muted mb-2 small">Published: {formatDate(viewItem.created_at)}</p>
              <hr className="my-2" />
              {viewItem.image_url && (
                <img
                  src={viewItem.image_url}
                  alt="announcement"
                  style={{ width: '100%', maxHeight: '280px', objectFit: 'cover', borderRadius: '8px', marginBottom: '12px' }}
                  onError={e => { e.target.style.display = 'none'; }}
                />
              )}
              <p className="mb-0" style={{ whiteSpace: 'pre-wrap', lineHeight: '1.7' }}>{viewItem.message}</p>
            </>
          )}
        </Modal.Body>
        <Modal.Footer className="py-2">
          <Button variant="danger" size="sm" onClick={() => { handleDelete(viewItem.id); setViewItem(null); }}>
            <FaTrash className="me-1" size={11} /> Delete
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setViewItem(null)}>Close</Button>
        </Modal.Footer>
      </Modal>

      {/* Delete Confirm Modal */}
      <Modal show={!!deleteId} onHide={() => setDeleteId(null)} centered size="sm">
        <Modal.Header closeButton className="py-2 bg-danger text-white">
          <Modal.Title as="h6" className="mb-0 small">Confirm Delete</Modal.Title>
        </Modal.Header>
        <Modal.Body className="small">Are you sure you want to delete this announcement? All employees will stop seeing it.</Modal.Body>
        <Modal.Footer className="py-2">
          <Button variant="secondary" size="sm" onClick={() => setDeleteId(null)}>Cancel</Button>
          <Button variant="danger" size="sm" onClick={() => handleDelete(deleteId)}>Delete</Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default Announcements;
