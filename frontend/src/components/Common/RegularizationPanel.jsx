import PaginatedTable from './PaginatedTable';
// src/components/Common/RegularizationPanel.jsx
// Single consolidated regularization review UI — replaces the three previously
// duplicated implementations (Admin/RegularizationRequests.jsx, the inline
// component in Admin/Dashboard.jsx, and Employee/ManagerRegularizationRequests.jsx).
// Renders identically for TL/Manager/HR/Admin — the backend already returns a
// role-scoped result set (regularizationService.buildScopedEmployeeIds), so this
// component does no client-side permission branching of its own.

import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Card, Badge, Button, Modal, Form,
  Alert, Spinner, Row, Col, InputGroup
} from 'react-bootstrap';
import {
  FaCheckCircle, FaTimesCircle, FaRegClock, FaSearch, FaEye,
  FaSyncAlt, FaInfoCircle, FaUserTie, FaPaperclip, FaBan, FaHistory,
  FaCheckDouble, FaLayerGroup,
} from 'react-icons/fa';

// Bulk approve/reject re-use the same single-item endpoints (each already validates
// status==='pending' and re-checks authorization per request, so it's safe to call in a
// loop) — run a few at a time rather than all at once, so a 30+ request batch doesn't fire
// 30 simultaneous writes (each of which recalculates attendance) against the DB at once.
const BULK_CONCURRENCY = 5;
const runInBatches = async (items, worker, concurrency = BULK_CONCURRENCY) => {
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    const chunkResults = await Promise.allSettled(chunk.map(worker));
    results.push(...chunkResults);
  }
  return results;
};
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';

const REQUEST_TYPE_LABELS = {
  missing_clock_in: 'Missing Clock In',
  missing_clock_out: 'Missing Clock Out',
  attendance_correction: 'Attendance Correction',
  half_day_to_present: 'Half Day to Present',
  present_to_half_day: 'Present to Half Day',
  wrong_working_hours: 'Wrong Working Hours',
  client_visit: 'Client Visit',
  official_duty: 'Official Duty',
  wfh: 'Work From Home',
  break_correction: 'Break Correction',
  other: 'Other',
};
const typeLabel = (t) => REQUEST_TYPE_LABELS[t] || t;

const TIME_RECALC_TYPES = ['missing_clock_in', 'missing_clock_out', 'attendance_correction', 'wrong_working_hours'];

const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  if (typeof dateString === 'string' && dateString.includes('-') && !dateString.includes(' ') && !dateString.includes('T')) {
    const [year, month, day] = dateString.split('-');
    return `${day}/${month}/${year}`;
  }
  const date = new Date(dateString);
  return isNaN(date) ? 'N/A' : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatDateTime = (dateString) => {
  if (!dateString) return 'N/A';
  if (typeof dateString === 'string' && dateString.includes(' ') && !dateString.includes('T')) {
    const [datePart, timePart] = dateString.split(' ');
    const [year, month, day] = datePart.split('-');
    const [hour, minute] = timePart.split(':');
    const hourNum = parseInt(hour, 10);
    const ampm = hourNum >= 12 ? 'PM' : 'AM';
    const hour12 = hourNum % 12 === 0 ? 12 : hourNum % 12;
    return `${day}/${month}/${year} ${hour12}:${minute} ${ampm}`;
  }
  const date = new Date(dateString);
  return isNaN(date) ? 'N/A' : date.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
};

const toDatetimeLocal = (datetime) => {
  if (!datetime) return '';
  const value = String(datetime).trim();
  if (value.includes(' ') && !value.includes('T')) {
    const [datePart, timePart] = value.split(' ');
    const [hour, minute] = timePart.split(':');
    return `${datePart}T${hour}:${minute}`;
  }
  if (value.includes('T')) {
    const [datePart, timePart] = value.split('T');
    const [hour, minute] = (timePart || '').split(':');
    if (hour && minute) return `${datePart}T${hour}:${minute}`;
  }
  return '';
};

const getStatusBadge = (status) => {
  if (status === 'pending') return <Badge bg="warning" text="dark">Pending</Badge>;
  if (status === 'approved') return <Badge bg="success">Approved</Badge>;
  if (status === 'rejected') return <Badge bg="danger">Rejected</Badge>;
  if (status === 'cancelled') return <Badge bg="secondary">Cancelled</Badge>;
  return <Badge bg="secondary">{status}</Badge>;
};

export default function RegularizationPanel({ embedded = false, onRequestCountChange, managerId }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ type: '', text: '' });

  const [filter, setFilter] = useState('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [selectedRequest, setSelectedRequest] = useState(null);
  const [detail, setDetail] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [approvedClockIn, setApprovedClockIn] = useState('');
  const [approvedClockOut, setApprovedClockOut] = useState('');
  const [approvedBreakDuration, setApprovedBreakDuration] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [processing, setProcessing] = useState(false);

  // Bulk select/approve/reject — only pending, actionable requests are ever selectable.
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showBulkApproveModal, setShowBulkApproveModal] = useState(false);
  const [showBulkRejectModal, setShowBulkRejectModal] = useState(false);
  const [bulkNotes, setBulkNotes] = useState('');
  const [bulkRejectionReason, setBulkRejectionReason] = useState('');
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 });

  const fetchRequests = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (filter !== 'all') params.status = filter;
      if (typeFilter) params.request_type = typeFilter;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (managerId && managerId !== 'ALL') params.manager_id = managerId;
      const response = await axios.get(API_ENDPOINTS.ATTENDANCE_PENDING_REGULARIZATIONS, { params });
      const requestsData = response.data.requests || [];
      setRequests(requestsData);
      if (onRequestCountChange) {
        onRequestCountChange(requestsData.filter(r => r.status === 'pending').length);
      }
    } catch (error) {
      console.error('Error fetching regularization requests:', error);
      setMessage({ type: 'danger', text: error.response?.data?.message || 'Failed to load regularization requests' });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, typeFilter, dateFrom, dateTo, managerId]);

  // A selection made under one filter view shouldn't silently carry over (and act on rows
  // the admin can no longer see) once the filters change.
  useEffect(() => { setSelectedIds(new Set()); }, [filter, typeFilter, dateFrom, dateTo, managerId]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const openDetail = async (request) => {
    setSelectedRequest(request);
    setShowDetailModal(true);
    setLoadingDetail(true);
    try {
      const res = await axios.get(API_ENDPOINTS.ATTENDANCE_REGULARIZATION_DETAIL(request.id));
      setDetail(res.data);
    } catch (error) {
      console.error('Error fetching request detail:', error);
      setDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  };

  const openApprove = (request) => {
    setSelectedRequest(request);
    setApprovedClockIn(toDatetimeLocal(request.requested_clock_in));
    setApprovedClockOut(toDatetimeLocal(request.requested_clock_out_time));
    setApprovedBreakDuration(request.requested_break_duration || '');
    setAdminNotes('');
    setShowApproveModal(true);
  };

  const openReject = (request) => {
    setSelectedRequest(request);
    setRejectionReason('');
    setShowRejectModal(true);
  };

  const handleApprove = async () => {
    if (!selectedRequest) return;
    setProcessing(true);
    try {
      const payload = { admin_notes: adminNotes };
      if (TIME_RECALC_TYPES.includes(selectedRequest.request_type)) {
        if (approvedClockIn) payload.approved_clock_in = approvedClockIn.replace('T', ' ') + ':00';
        if (approvedClockOut) payload.approved_clock_out_time = approvedClockOut.replace('T', ' ') + ':00';
      }
      if (selectedRequest.request_type === 'break_correction') {
        payload.approved_break_duration = approvedBreakDuration;
      }
      await axios.put(API_ENDPOINTS.ATTENDANCE_APPROVE_REGULARIZATION(selectedRequest.id), payload);
      setMessage({ type: 'success', text: 'Regularization request approved successfully!' });
      setShowApproveModal(false);
      setSelectedRequest(null);
      await fetchRequests();
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Error approving regularization:', error);
      setMessage({ type: 'danger', text: error.response?.data?.message || 'Failed to approve request' });
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedRequest) return;
    if (!rejectionReason || rejectionReason.trim().length < 10) {
      setMessage({ type: 'warning', text: 'Please provide a rejection reason (at least 10 characters)' });
      return;
    }
    setProcessing(true);
    try {
      await axios.put(API_ENDPOINTS.ATTENDANCE_REJECT_REGULARIZATION(selectedRequest.id), {
        rejection_reason: rejectionReason.trim(),
      });
      setMessage({ type: 'success', text: 'Regularization request rejected.' });
      setShowRejectModal(false);
      setSelectedRequest(null);
      await fetchRequests();
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Error rejecting regularization:', error);
      setMessage({ type: 'danger', text: error.response?.data?.message || 'Failed to reject request' });
    } finally {
      setProcessing(false);
    }
  };

  const handleCancel = async (request) => {
    if (!window.confirm(`Cancel the pending regularization request for ${request.employee_name} on ${formatDate(request.attendance_date)}?`)) return;
    try {
      await axios.put(API_ENDPOINTS.ATTENDANCE_CANCEL_REGULARIZATION(request.id));
      setMessage({ type: 'success', text: 'Request cancelled.' });
      await fetchRequests();
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (error) {
      setMessage({ type: 'danger', text: error.response?.data?.message || 'Failed to cancel request' });
    }
  };

  // ── Bulk select / approve / reject ────────────────────────────────────────────
  const toggleSelectOne = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (selectableIds) => {
    setSelectedIds(prev => {
      const allSelected = selectableIds.length > 0 && selectableIds.every(id => prev.has(id));
      return allSelected ? new Set() : new Set(selectableIds);
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const runBulkApprove = async () => {
    const ids = [...selectedIds];
    setBulkProcessing(true);
    setBulkProgress({ done: 0, total: ids.length });
    let succeeded = 0;
    const failures = [];
    // No approved_clock_in/out/status/break_duration sent — the backend already falls back
    // to each request's own requested values when they're omitted (see
    // regularizationController.approveRequest), which is exactly "approve as requested".
    await runInBatches(ids, async (id) => {
      try {
        await axios.put(API_ENDPOINTS.ATTENDANCE_APPROVE_REGULARIZATION(id), { admin_notes: bulkNotes.trim() || undefined });
        succeeded++;
      } catch (error) {
        const req = requests.find(r => r.id === id);
        failures.push(`${req?.employee_name || id}: ${error.response?.data?.message || 'Failed'}`);
      } finally {
        setBulkProgress(p => ({ ...p, done: p.done + 1 }));
      }
    });

    setBulkProcessing(false);
    setShowBulkApproveModal(false);
    setBulkNotes('');
    clearSelection();
    await fetchRequests();

    if (failures.length === 0) {
      setMessage({ type: 'success', text: `Approved ${succeeded} request${succeeded === 1 ? '' : 's'} successfully.` });
    } else {
      setMessage({
        type: 'warning',
        text: `Approved ${succeeded} of ${ids.length}. Failed: ${failures.slice(0, 5).join('; ')}${failures.length > 5 ? ` (+${failures.length - 5} more)` : ''}`,
      });
    }
  };

  const runBulkReject = async () => {
    if (!bulkRejectionReason || bulkRejectionReason.trim().length < 10) return;
    const ids = [...selectedIds];
    setBulkProcessing(true);
    setBulkProgress({ done: 0, total: ids.length });
    let succeeded = 0;
    const failures = [];
    await runInBatches(ids, async (id) => {
      try {
        await axios.put(API_ENDPOINTS.ATTENDANCE_REJECT_REGULARIZATION(id), { rejection_reason: bulkRejectionReason.trim() });
        succeeded++;
      } catch (error) {
        const req = requests.find(r => r.id === id);
        failures.push(`${req?.employee_name || id}: ${error.response?.data?.message || 'Failed'}`);
      } finally {
        setBulkProgress(p => ({ ...p, done: p.done + 1 }));
      }
    });

    setBulkProcessing(false);
    setShowBulkRejectModal(false);
    setBulkRejectionReason('');
    clearSelection();
    await fetchRequests();

    if (failures.length === 0) {
      setMessage({ type: 'success', text: `Rejected ${succeeded} request${succeeded === 1 ? '' : 's'}.` });
    } else {
      setMessage({
        type: 'warning',
        text: `Rejected ${succeeded} of ${ids.length}. Failed: ${failures.slice(0, 5).join('; ')}${failures.length > 5 ? ` (+${failures.length - 5} more)` : ''}`,
      });
    }
  };

  const filteredRequests = requests.filter((request) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return [request.employee_name, request.employee_id, request.attendance_date, request.reason, request.department]
      .some(value => String(value || '').toLowerCase().includes(term));
  });

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '300px' }}>
        <Spinner animation="border" variant="primary" />
      </div>
    );
  }

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  return (
    <div className={embedded ? '' : 'p-2 p-md-3 p-lg-4'}>
      {!embedded && (
        <div
          style={{
            background: 'linear-gradient(135deg, #f8fbff 0%, #f5f3ff 100%)',
            border: '1px solid #e2e8f0',
            borderRadius: 18,
            padding: '18px 20px',
            marginBottom: 16,
            boxShadow: '0 10px 30px rgba(15, 23, 42, 0.05)',
          }}
        >
          <div className="d-flex flex-column flex-lg-row justify-content-between align-items-start align-items-lg-center gap-3">
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#7c3aed', marginBottom: 4 }}>
                Attendance Review
              </div>
              <h5 className="mb-1 fw-bold" style={{ color: '#0f172a', margin: 0 }}>
                <FaUserTie className="me-2" /> Attendance Regularization Requests
              </h5>
              <small style={{ color: '#64748b' }}>
                {pendingCount > 0 ? `${pendingCount} request${pendingCount > 1 ? 's' : ''} awaiting action` : 'No pending requests'}
              </small>
            </div>
            <Button variant="outline-primary" size="sm" onClick={fetchRequests}>
              <FaSyncAlt className="me-1" size={12} /> Refresh
            </Button>
          </div>
        </div>
      )}

      {message.text && (
        <Alert variant={message.type} dismissible onClose={() => setMessage({ type: '', text: '' })} className="mb-3">
          {message.text}
        </Alert>
      )}

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '14px', boxShadow: '0 8px 24px rgba(15, 23, 42, 0.04)', marginBottom: 14 }}>
        <Row className="align-items-center gx-2 gy-2">
          <Col xs={12} lg={5}>
            <div className="d-flex gap-2 flex-wrap">
              {['pending', 'approved', 'rejected', 'cancelled', 'all'].map(f => {
                const isActive = filter === f;
                const activeStyle = f === 'pending' ? { background: '#fef3c7', color: '#92400e', borderColor: '#f59e0b' } : f === 'approved' ? { background: '#dcfce7', color: '#166534', borderColor: '#22c55e' } : f === 'rejected' ? { background: '#fee2e2', color: '#991b1b', borderColor: '#ef4444' } : { background: '#eef2ff', color: '#4338ca', borderColor: '#6366f1' };
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFilter(f)}
                    style={{
                      border: `1px solid ${isActive ? (f === 'pending' ? '#f59e0b' : f === 'approved' ? '#22c55e' : f === 'rejected' ? '#ef4444' : '#6366f1') : '#e2e8f0'}`,
                      borderRadius: 999,
                      padding: '7px 12px',
                      fontSize: 12,
                      fontWeight: 700,
                      textTransform: 'capitalize',
                      background: isActive ? activeStyle.background : '#fff',
                      color: isActive ? activeStyle.color : '#475569',
                      cursor: 'pointer',
                    }}
                  >
                    {f}
                  </button>
                );
              })}
            </div>
          </Col>
          <Col xs={12} md={4} lg={2}>
            <Form.Select size="sm" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ borderRadius: 10 }}>
              <option value="">All Types</option>
              {Object.entries(REQUEST_TYPE_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </Form.Select>
          </Col>
          <Col xs={6} md={4} lg={2}>
            <Form.Control size="sm" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} title="From date" style={{ borderRadius: 10 }} />
          </Col>
          <Col xs={6} md={4} lg={2}>
            <Form.Control size="sm" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} title="To date" style={{ borderRadius: 10 }} />
          </Col>
          <Col xs={12} lg={"auto"} className="ms-lg-auto" style={{ minWidth: 220 }}>
            <InputGroup size="sm">
              <InputGroup.Text><FaSearch size={12} /></InputGroup.Text>
              <Form.Control
                placeholder="Search employee, ID, dept…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ borderRadius: '0 10px 10px 0' }}
              />
            </InputGroup>
          </Col>
        </Row>
      </div>

      {selectedIds.size > 0 && (
        <div
          className="d-flex flex-wrap align-items-center gap-2 mb-3"
          style={{ background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 12, padding: '10px 14px' }}
        >
          <FaLayerGroup className="text-indigo" style={{ color: '#4338ca' }} />
          <span className="small fw-semibold" style={{ color: '#3730a3' }}>
            {selectedIds.size} request{selectedIds.size > 1 ? 's' : ''} selected
          </span>
          <div className="ms-auto d-flex gap-2 flex-wrap">
            <Button variant="success" size="sm" onClick={() => setShowBulkApproveModal(true)}>
              <FaCheckCircle className="me-1" size={12} /> Approve Selected
            </Button>
            <Button variant="danger" size="sm" onClick={() => setShowBulkRejectModal(true)}>
              <FaTimesCircle className="me-1" size={12} /> Reject Selected
            </Button>
            <Button variant="outline-secondary" size="sm" onClick={clearSelection}>Clear</Button>
          </div>
        </div>
      )}

      {filteredRequests.length === 0 ? (
        <Card className="border-0 shadow-sm" style={{ borderRadius: 16 }}>
          <Card.Body className="text-center py-5">
            <FaRegClock size={40} className="text-muted mb-3" />
            <p className="text-muted mb-0">No regularization requests h.</p>
          </Card.Body>
        </Card>
      ) : (
        <Card className="border-0 shadow-sm" style={{ borderRadius: 16, overflow: 'hidden' }}>
          <Card.Body className="p-0">
            <div className="table-responsive">
              <PaginatedTable as={Table} hover className="mb-0" style={{ minWidth: 980 }}>
                <thead className="bg-light">
                  <tr className="small">
                    <th className="fw-normal" style={{ width: 36 }}>
                      {(() => {
                        const selectableIds = filteredRequests.filter(r => r.status === 'pending' && r.can_act).map(r => r.id);
                        const allSelected = selectableIds.length > 0 && selectableIds.every(id => selectedIds.has(id));
                        return (
                          <Form.Check
                            type="checkbox"
                            checked={allSelected}
                            disabled={selectableIds.length === 0}
                            onChange={() => toggleSelectAll(selectableIds)}
                            title="Select all actionable requests"
                          />
                        );
                      })()}
                    </th>
                    <th className="fw-normal">Employee</th>
                    <th className="fw-normal d-none d-md-table-cell">Department</th>
                    <th className="fw-normal d-none d-lg-table-cell">Reporting Manager</th>
                    <th className="fw-normal">Attendance Date</th>
                    <th className="fw-normal d-none d-md-table-cell">Current Status</th>
                    <th className="fw-normal">Request Type</th>
                    <th className="fw-normal d-none d-lg-table-cell">Submitted</th>
                    <th className="fw-normal">Status</th>
                    <th className="fw-normal text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRequests.map((request) => {
                    const isSelectable = request.status === 'pending' && request.can_act;
                    return (
                    <tr key={request.id} className={selectedIds.has(request.id) ? 'table-active' : ''}>
                      <td className="small">
                        {isSelectable && (
                          <Form.Check
                            type="checkbox"
                            checked={selectedIds.has(request.id)}
                            onChange={() => toggleSelectOne(request.id)}
                          />
                        )}
                      </td>
                      <td className="small">
                        <div className="fw-semibold text-truncate" style={{ maxWidth: '140px' }}>{request.employee_name}</div>
                        <small className="text-muted">{request.employee_id}</small>
                      </td>
                      <td className="small d-none d-md-table-cell">{request.department || '—'}</td>
                      <td className="small d-none d-lg-table-cell">{request.reporting_manager || '—'}</td>
                      <td className="small"><Badge bg="light" text="dark" pill>{formatDate(request.attendance_date)}</Badge></td>
                      <td className="small d-none d-md-table-cell text-capitalize">{(request.original_status || '—').replace(/_/g, ' ')}</td>
                      <td className="small">{typeLabel(request.request_type)}</td>
                      <td className="small d-none d-lg-table-cell">{formatDateTime(request.created_at)}</td>
                      <td className="small">
                        {getStatusBadge(request.status)}
                        {request.status === 'pending' && (
                          <div className="text-muted" style={{ fontSize: 10 }}>
                            with {request.pending_with_employee_id ? request.reporting_manager || 'manager' : 'HR/Admin'}
                          </div>
                        )}
                      </td>
                      <td className="text-center">
                        <div className="d-flex gap-1 justify-content-center flex-wrap">
                          <Button variant="outline-secondary" size="sm" onClick={() => openDetail(request)} title="View details">
                            <FaEye size={12} />
                          </Button>
                          {request.status === 'pending' && request.can_act && (
                            <>
                              <Button variant="success" size="sm" onClick={() => openApprove(request)} title="Approve">
                                <FaCheckCircle size={12} />
                              </Button>
                              <Button variant="danger" size="sm" onClick={() => openReject(request)} title="Reject">
                                <FaTimesCircle size={12} />
                              </Button>
                            </>
                          )}
                          {request.status === 'pending' && (
                            <Button variant="outline-secondary" size="sm" onClick={() => handleCancel(request)} title="Cancel request">
                              <FaBan size={12} />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </PaginatedTable>
            </div>
          </Card.Body>
        </Card>
      )}

      {/* Detail modal — original vs requested vs approved, attachment, audit timeline */}
      <Modal show={showDetailModal} onHide={() => setShowDetailModal(false)} centered size="lg">
        <Modal.Header closeButton>
          <Modal.Title className="h6"><FaInfoCircle className="me-2" /> Regularization Detail</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {loadingDetail ? (
            <div className="text-center py-4"><Spinner animation="border" size="sm" /></div>
          ) : detail?.request ? (
            <>
              <Row className="g-3 mb-3">
                <Col xs={6}><div className="small text-muted">Employee</div><div className="fw-semibold">{detail.request.employee_name}</div></Col>
                <Col xs={6}><div className="small text-muted">Request Type</div><div className="fw-semibold">{typeLabel(detail.request.request_type)}</div></Col>
                <Col xs={6}><div className="small text-muted">Attendance Date</div><div className="fw-semibold">{formatDate(detail.request.attendance_date)}</div></Col>
                <Col xs={6}><div className="small text-muted">Status</div><div>{getStatusBadge(detail.request.status)}</div></Col>
              </Row>

              <Table size="sm" bordered className="mb-3">
                <thead className="bg-light">
                  <tr><th></th><th>Original</th><th>Requested</th><th>Approved</th></tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="fw-semibold">Clock In</td>
                    <td>{formatDateTime(detail.request.original_clock_in)}</td>
                    <td>{formatDateTime(detail.request.requested_clock_in)}</td>
                    <td>{formatDateTime(detail.request.approved_clock_in)}</td>
                  </tr>
                  <tr>
                    <td className="fw-semibold">Clock Out</td>
                    <td>{formatDateTime(detail.request.original_clock_out)}</td>
                    <td>{formatDateTime(detail.request.requested_clock_out_time)}</td>
                    <td>{formatDateTime(detail.request.approved_clock_out_time)}</td>
                  </tr>
                  <tr>
                    <td className="fw-semibold">Status</td>
                    <td className="text-capitalize">{(detail.request.original_status || '—').replace(/_/g, ' ')}</td>
                    <td className="text-capitalize">{(detail.request.requested_status || '—').replace(/_/g, ' ')}</td>
                    <td className="text-capitalize">{(detail.request.approved_status || '—').replace(/_/g, ' ')}</td>
                  </tr>
                  <tr>
                    <td className="fw-semibold">Break (min)</td>
                    <td>{detail.request.original_total_minutes ? '—' : '—'}</td>
                    <td>{detail.request.requested_break_duration || '—'}</td>
                    <td>{detail.request.approved_break_duration || '—'}</td>
                  </tr>
                </tbody>
              </Table>

              <div className="mb-3 small">
                <strong>Reason:</strong>
                <p className="text-muted mb-0">{detail.request.reason}</p>
              </div>

              {detail.request.attachment_url && (
                <div className="mb-3 small">
                  <a href={detail.request.attachment_url} target="_blank" rel="noopener noreferrer">
                    <FaPaperclip className="me-1" /> {detail.request.attachment_name || 'View attachment'}
                  </a>
                </div>
              )}

              {detail.request.status === 'rejected' && detail.request.rejection_reason && (
                <Alert variant="danger" className="small py-2"><strong>Rejection reason:</strong> {detail.request.rejection_reason}</Alert>
              )}

              {detail.history?.length > 0 && (
                <div className="mb-3">
                  <div className="small fw-semibold mb-1"><FaHistory className="me-1" /> Approval Timeline</div>
                  <ul className="list-unstyled small mb-0">
                    {detail.history.map(h => (
                      <li key={h.id} className="border-bottom py-1">
                        <span className="text-capitalize fw-semibold">{h.action}</span> by {h.performed_by_name || h.performed_by} — {formatDateTime(h.created_at)}
                        {h.message && <div className="text-muted">{h.message}</div>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {detail.previous_requests?.length > 0 && (
                <div>
                  <div className="small fw-semibold mb-1">Previous Regularizations</div>
                  <ul className="list-unstyled small mb-0">
                    {detail.previous_requests.map(p => (
                      <li key={p.id} className="text-muted">
                        {formatDate(p.attendance_date)} — {typeLabel(p.request_type)} ({p.status})
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <p className="text-muted mb-0">Unable to load details.</p>
          )}
        </Modal.Body>
      </Modal>

      {/* Approve modal */}
      <Modal show={showApproveModal} onHide={() => setShowApproveModal(false)} centered size="lg">
        <Modal.Header closeButton className="bg-success text-white">
          <Modal.Title className="h6"><FaCheckCircle className="me-2" /> Approve Regularization Request</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {selectedRequest && (
            <>
              <div className="mb-3 p-3 bg-light rounded small">
                <div><strong>Employee:</strong> {selectedRequest.employee_name}</div>
                <div><strong>Date:</strong> {formatDate(selectedRequest.attendance_date)}</div>
                <div><strong>Type:</strong> {typeLabel(selectedRequest.request_type)}</div>
                <div><strong>Reason:</strong> {selectedRequest.reason}</div>
              </div>

              {TIME_RECALC_TYPES.includes(selectedRequest.request_type) && (
                <>
                  <Form.Group className="mb-3">
                    <Form.Label className="fw-semibold">Clock In</Form.Label>
                    <Form.Control type="datetime-local" value={approvedClockIn} onChange={(e) => setApprovedClockIn(e.target.value)} />
                  </Form.Group>
                  <Form.Group className="mb-3">
                    <Form.Label className="fw-semibold">Clock Out</Form.Label>
                    <Form.Control type="datetime-local" value={approvedClockOut} onChange={(e) => setApprovedClockOut(e.target.value)} />
                  </Form.Group>
                </>
              )}

              {selectedRequest.request_type === 'break_correction' && (
                <Form.Group className="mb-3">
                  <Form.Label className="fw-semibold">Break Duration (minutes)</Form.Label>
                  <Form.Control type="number" min="1" value={approvedBreakDuration} onChange={(e) => setApprovedBreakDuration(e.target.value)} />
                </Form.Group>
              )}

              <Form.Group className="mb-3">
                <Form.Label className="fw-semibold">Notes (Optional)</Form.Label>
                <Form.Control as="textarea" rows={2} value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} />
              </Form.Group>

              <Alert variant="info" className="small py-2">
                Approving recalculates working hours, late marks, overtime, and attendance status automatically.
              </Alert>
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" size="sm" onClick={() => setShowApproveModal(false)}>Cancel</Button>
          <Button variant="success" size="sm" onClick={handleApprove} disabled={processing}>
            {processing ? <Spinner size="sm" animation="border" /> : 'Approve Request'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Reject modal */}
      <Modal show={showRejectModal} onHide={() => setShowRejectModal(false)} centered>
        <Modal.Header closeButton className="bg-danger text-white">
          <Modal.Title className="h6"><FaTimesCircle className="me-2" /> Reject Regularization Request</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {selectedRequest && (
            <>
              <div className="mb-3 small">
                <div><strong>Employee:</strong> {selectedRequest.employee_name}</div>
                <div><strong>Date:</strong> {formatDate(selectedRequest.attendance_date)}</div>
              </div>
              <Form.Group className="mb-2">
                <Form.Label className="fw-semibold">Rejection Reason * <span className="text-muted fw-normal">(min 10 characters)</span></Form.Label>
                <Form.Control as="textarea" rows={3} value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} placeholder="Explain why this request is being rejected…" />
                <Form.Text className="text-muted">This will be visible to the employee.</Form.Text>
              </Form.Group>
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" size="sm" onClick={() => setShowRejectModal(false)}>Cancel</Button>
          <Button variant="danger" size="sm" onClick={handleReject} disabled={processing || rejectionReason.trim().length < 10}>
            {processing ? <Spinner size="sm" animation="border" /> : 'Reject Request'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Bulk approve modal — approves every selected request using its own requested
          values (regularizationController.approveRequest already falls back to those when
          no override is sent), with one optional shared note applied to all of them. */}
      <Modal show={showBulkApproveModal} onHide={() => !bulkProcessing && setShowBulkApproveModal(false)} centered>
        <Modal.Header closeButton={!bulkProcessing} className="bg-success text-white">
          <Modal.Title className="h6"><FaCheckDouble className="me-2" /> Approve {selectedIds.size} Regularization Request{selectedIds.size > 1 ? 's' : ''}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {bulkProcessing ? (
            <div className="text-center py-3">
              <Spinner animation="border" size="sm" className="mb-2" />
              <div className="small text-muted">Approving {bulkProgress.done} of {bulkProgress.total}…</div>
            </div>
          ) : (
            <>
              <Alert variant="warning" className="small py-2">
                Each request will be approved using its own requested clock-in/out and status —
                the same as clicking Approve individually. Working hours, late marks, and
                overtime are recalculated for every one of them.
              </Alert>
              <Form.Group>
                <Form.Label className="fw-semibold small">Notes (Optional, applied to all)</Form.Label>
                <Form.Control as="textarea" rows={2} value={bulkNotes} onChange={(e) => setBulkNotes(e.target.value)} />
              </Form.Group>
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" size="sm" onClick={() => setShowBulkApproveModal(false)} disabled={bulkProcessing}>Cancel</Button>
          <Button variant="success" size="sm" onClick={runBulkApprove} disabled={bulkProcessing}>
            {bulkProcessing ? <Spinner size="sm" animation="border" /> : `Approve ${selectedIds.size} Request${selectedIds.size > 1 ? 's' : ''}`}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Bulk reject modal — one shared rejection reason applied to every selected request. */}
      <Modal show={showBulkRejectModal} onHide={() => !bulkProcessing && setShowBulkRejectModal(false)} centered>
        <Modal.Header closeButton={!bulkProcessing} className="bg-danger text-white">
          <Modal.Title className="h6"><FaCheckDouble className="me-2" /> Reject {selectedIds.size} Regularization Request{selectedIds.size > 1 ? 's' : ''}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {bulkProcessing ? (
            <div className="text-center py-3">
              <Spinner animation="border" size="sm" className="mb-2" />
              <div className="small text-muted">Rejecting {bulkProgress.done} of {bulkProgress.total}…</div>
            </div>
          ) : (
            <Form.Group>
              <Form.Label className="fw-semibold small">
                Rejection Reason * <span className="text-muted fw-normal">(min 10 characters, applied to all)</span>
              </Form.Label>
              <Form.Control as="textarea" rows={3} value={bulkRejectionReason} onChange={(e) => setBulkRejectionReason(e.target.value)} placeholder="Explain why these requests are being rejected…" />
              <Form.Text className="text-muted">This will be visible to each employee.</Form.Text>
            </Form.Group>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" size="sm" onClick={() => setShowBulkRejectModal(false)} disabled={bulkProcessing}>Cancel</Button>
          <Button variant="danger" size="sm" onClick={runBulkReject} disabled={bulkProcessing || bulkRejectionReason.trim().length < 10}>
            {bulkProcessing ? <Spinner size="sm" animation="border" /> : `Reject ${selectedIds.size} Request${selectedIds.size > 1 ? 's' : ''}`}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
