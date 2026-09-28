import { dashboardGet } from '../../utils/dashboardGet';
// src/components/Employee/AnnouncementBanner.jsx
import React, { useState, useEffect } from 'react';
import { Card, Badge, Button, Modal, Collapse } from 'react-bootstrap';
import {
  FaBullhorn, FaBell, FaExclamationTriangle, FaCalendarAlt,
  FaFileAlt, FaGift, FaShieldAlt, FaChevronDown, FaChevronUp, FaEye
} from 'react-icons/fa';

import API_ENDPOINTS from '../../config/api';

const TYPE_CONFIG = {
  announcement: { label: 'Announcement',  icon: <FaBullhorn size={12} />,            color: '#0d6efd', bg: '#e7f1ff' },
  notice:        { label: 'Notice',        icon: <FaBell size={12} />,                color: '#0dcaf0', bg: '#e0f7fa' },
  warning:       { label: 'Warning',       icon: <FaExclamationTriangle size={12} />, color: '#ffc107', bg: '#fff8e1' },
  holiday:       { label: 'Holiday',       icon: <FaCalendarAlt size={12} />,         color: '#198754', bg: '#e8f5e9' },
  policy:        { label: 'Policy Update', icon: <FaFileAlt size={12} />,             color: '#6c757d', bg: '#f8f9fa' },
  event:         { label: 'Event',         icon: <FaGift size={12} />,                color: '#6f42c1', bg: '#f3e8ff' },
  urgent:        { label: 'Urgent',        icon: <FaShieldAlt size={12} />,           color: '#dc3545', bg: '#fdecea' },
};

const PRIORITY_ORDER = { urgent: 0, high: 1, normal: 2, low: 3 };

const AnnouncementBanner = () => {
  const [announcements, setAnnouncements] = useState([]);
  const [expanded, setExpanded]           = useState(false);
  const [viewItem, setViewItem]           = useState(null);

  useEffect(() => {
    dashboardGet(API_ENDPOINTS.ANNOUNCEMENTS)
      .then(res => {
        const sorted = (res.data?.announcements || [])
          .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2));
        setAnnouncements(sorted);
      })
      .catch(() => {});
  }, []);

  if (announcements.length === 0) return null;

  const formatDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <>
      {/* <Card className="border-0 shadow-sm mb-4" style={{ borderLeft: '4px solid #0d6efd !important' }}>
        <Card.Header
          className="py-2 d-flex justify-content-between align-items-center"
          style={{ background: '#e7f1ff', cursor: 'pointer', borderLeft: '4px solid #0d6efd' }}
          onClick={() => setExpanded(e => !e)}
        >
          <div className="d-flex align-items-center gap-2">
            <FaBullhorn className="text-primary" size={14} />
            <span className="small fw-semibold text-primary">Announcements</span>
            <Badge bg="primary" pill style={{ fontSize: '10px' }}>{announcements.length}</Badge>
          </div>
          <div className="d-flex align-items-center gap-2">
            {announcements.some(a => a.priority === 'urgent') && (
              <Badge bg="danger" className="small">Urgent</Badge>
            )}
            {expanded ? <FaChevronUp size={12} className="text-primary" /> : <FaChevronDown size={12} className="text-primary" />}
          </div>
        </Card.Header>

        <Collapse in={expanded}>
          <div>
            <Card.Body className="p-2 p-md-3" style={{ maxHeight: '320px', overflowY: 'auto' }}>
              <div className="d-flex flex-column gap-2">
                {announcements.map(a => {
                  const tc = TYPE_CONFIG[a.type] || TYPE_CONFIG.announcement;
                  return (
                    <div
                      key={a.id}
                      className="d-flex align-items-start gap-3 p-2 rounded"
                      style={{ background: tc.bg, borderLeft: `3px solid ${tc.color}` }}
                    >
                      <div className="flex-shrink-0 mt-1" style={{ color: tc.color }}>{tc.icon}</div>
                      <div className="flex-grow-1 overflow-hidden">
                        <div className="d-flex align-items-center gap-2 flex-wrap mb-1">
                          <span className="small fw-semibold">{a.title}</span>
                          <Badge style={{ backgroundColor: tc.color, fontSize: '10px' }}>{tc.label}</Badge>
                          {a.priority === 'urgent' && <Badge bg="danger" style={{ fontSize: '10px' }}>Urgent</Badge>}
                          {a.priority === 'high' && <Badge bg="warning" text="dark" style={{ fontSize: '10px' }}>High</Badge>}
                          <small className="text-muted ms-auto">{formatDate(a.created_at)}</small>
                        </div>
                        {a.image_url && (
                          <img
                            src={a.image_url}
                            alt={a.title}
                            onClick={() => setViewItem(a)}
                            onError={e => { e.target.style.display = 'none'; }}
                            style={{ width: '100%', maxHeight: '120px', objectFit: 'cover', borderRadius: '6px', marginBottom: '6px', cursor: 'pointer' }}
                          />
                        )}
                        <p className="mb-0 small text-muted text-truncate" style={{ maxWidth: '500px' }}>
                          {a.message}
                        </p>
                      </div>
                      <Button
                        variant="link" size="sm" className="p-0 flex-shrink-0"
                        style={{ color: tc.color }}
                        onClick={() => setViewItem(a)}
                        title="Read more"
                      >
                        <FaEye size={14} />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </Card.Body>
          </div>
        </Collapse>
      </Card> */}

      {/* Full View Modal */}
      <Modal show={!!viewItem} onHide={() => setViewItem(null)} centered>
        <Modal.Header
          closeButton
          style={{
            background: viewItem ? TYPE_CONFIG[viewItem.type]?.bg : '#fff',
            borderBottom: `2px solid ${viewItem ? TYPE_CONFIG[viewItem.type]?.color : '#dee2e6'}`
          }}
        >
          <Modal.Title as="h6" className="mb-0 small fw-semibold d-flex align-items-center gap-2">
            <span style={{ color: viewItem ? TYPE_CONFIG[viewItem.type]?.color : '#000' }}>
              {viewItem && TYPE_CONFIG[viewItem.type]?.icon}
            </span>
            {viewItem?.title}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="small">
          {viewItem && (
            <>
              <div className="d-flex gap-2 mb-3 flex-wrap">
                <Badge style={{ backgroundColor: TYPE_CONFIG[viewItem.type]?.color }}>
                  {TYPE_CONFIG[viewItem.type]?.label}
                </Badge>
                {viewItem.priority !== 'normal' && (
                  <Badge bg={viewItem.priority === 'urgent' ? 'danger' : viewItem.priority === 'high' ? 'warning' : 'secondary'}
                    text={viewItem.priority === 'high' ? 'dark' : undefined}>
                    {viewItem.priority.charAt(0).toUpperCase() + viewItem.priority.slice(1)} Priority
                  </Badge>
                )}
                <small className="text-muted ms-auto">Published: {formatDate(viewItem.created_at)}</small>
              </div>
              <hr className="my-2" />
              {viewItem.image_url && (
                <img
                  src={viewItem.image_url}
                  alt={viewItem.title}
                  onError={e => { e.target.style.display = 'none'; }}
                  style={{ width: '100%', maxHeight: '300px', objectFit: 'cover', borderRadius: '8px', marginBottom: '12px' }}
                />
              )}
              <p className="mb-0" style={{ whiteSpace: 'pre-wrap', lineHeight: '1.8' }}>{viewItem.message}</p>
              {viewItem.expires_at && (
                <p className="mt-3 mb-0 small text-muted">
                  <FaCalendarAlt className="me-1" size={11} />
                  Valid until: {formatDate(viewItem.expires_at)}
                </p>
              )}
            </>
          )}
        </Modal.Body>
        <Modal.Footer className="py-2">
          <Button variant="secondary" size="sm" onClick={() => setViewItem(null)}>Close</Button>
        </Modal.Footer>
      </Modal>
    </>
  );
};

export default AnnouncementBanner;
