import PaginatedTable from '../Common/PaginatedTable';
// src/components/Employee/ManagerLeaveRequests.jsx
import React, { useState, useEffect } from 'react';
import {
  Table, Card, Badge, Button, Modal, Form,
  Row, Col, Alert, Spinner, InputGroup
} from 'react-bootstrap';
import {
  FaCheck, FaTimes, FaEye, FaCalendarAlt, FaClock,
  FaCheckCircle, FaTimesCircle, FaSearch, FaUserCircle,
  FaInfoCircle, FaBriefcase, FaSyncAlt, FaArrowLeft
} from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';
import { useAuth } from '../../context/AuthContext';

const ManagerLeaveRequests = ({ embedded = false }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [filteredRequests, setFilteredRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [selectedLeave, setSelectedLeave] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showActionModal, setShowActionModal] = useState(false);
  const [actionType, setActionType] = useState('');
  const [remarks, setRemarks] = useState('');
  const [filter, setFilter] = useState('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });
  const [stats, setStats] = useState({ total: 0, pending: 0, approved: 0, rejected: 0 });
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => { fetchLeaveRequests(); }, []);

  useEffect(() => {
    const s = {
      total: leaveRequests.length,
      pending: leaveRequests.filter(l => l.status === 'pending').length,
      approved: leaveRequests.filter(l => l.status === 'approved').length,
      rejected: leaveRequests.filter(l => l.status === 'rejected').length
    };
    setStats(s);
    applyFilters(leaveRequests, filter, searchTerm);
  }, [leaveRequests]);

  useEffect(() => {
    applyFilters(leaveRequests, filter, searchTerm);
  }, [filter, searchTerm]);

  const fetchLeaveRequests = async () => {
    try {
      setLoading(true);
      // Fetch leaves where this employee is the reporting manager
      const response = await axios.get(`${API_ENDPOINTS.LEAVES}?reporting_manager=true`);
      setLeaveRequests(response.data || []);
    } catch (error) {
      console.error('Error fetching leave requests:', error);
      setMessage({ type: 'danger', text: 'Failed to load leave requests' });
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = (data, statusFilter, search) => {
    let filtered = [...data];
    if (statusFilter !== 'all') filtered = filtered.filter(l => l.status === statusFilter);
    if (search.trim()) {
      const term = search.toLowerCase();
      filtered = filtered.filter(l =>
        `${l.first_name} ${l.last_name}`.toLowerCase().includes(term) ||
        (l.employee_id || '').toLowerCase().includes(term) ||
        (l.leave_type || '').toLowerCase().includes(term) ||
        (l.reason || '').toLowerCase().includes(term)
      );
    }
    setFilteredRequests(filtered);
  };

  const handleAction = (leave, type) => {
    setSelectedLeave(leave);
    setActionType(type);
    setRemarks('');
    setShowActionModal(true);
  };

  const handleStatusUpdate = async () => {
    if (!selectedLeave) return;
    setProcessing(true);
    try {
      await axios.put(API_ENDPOINTS.LEAVE_STATUS(selectedLeave.id), {
        status: actionType === 'approve' ? 'approved' : 'rejected',
        remarks: remarks || null
      });
      setMessage({
        type: 'success',
        text: `Leave request ${actionType === 'approve' ? 'approved' : 'rejected'} successfully!`
      });
      setShowActionModal(false);
      await fetchLeaveRequests();
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (error) {
      setMessage({
        type: 'danger',
        text: error.response?.data?.message || 'Failed to update leave status'
      });
    } finally {
      setProcessing(false);
    }
  };

  const formatDate = (d) => {
    if (!d) return 'N/A';
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const formatDateTimeIST = (dateString) => {
    if (!dateString) return 'N/A';
    // IST string "YYYY-MM-DD HH:MM:SS"
    if (typeof dateString === 'string' && dateString.includes(' ') && !dateString.includes('T')) {
      const [datePart, timePart] = dateString.split(' ');
      const [y, mo, d] = datePart.split('-');
      const [h, mi] = timePart.split(':');
      const hourNum = parseInt(h);
      const ampm = hourNum >= 12 ? 'PM' : 'AM';
      const hour12 = hourNum % 12 === 0 ? 12 : hourNum % 12;
      return `${d}/${mo}/${y} ${hour12}:${mi} ${ampm}`;
    }
    // UTC ISO - convert to IST
    const dt = new Date(dateString);
    const ist = new Date(dt.getTime() + 5.5 * 60 * 60 * 1000);
    const h = ist.getUTCHours();
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${String(ist.getUTCDate()).padStart(2,'0')}/${String(ist.getUTCMonth()+1).padStart(2,'0')}/${ist.getUTCFullYear()} ${hour12}:${String(ist.getUTCMinutes()).padStart(2,'0')} ${ampm}`;
  };

  const getStatusBadge = (status) => {
    const map = { pending: 'warning', approved: 'success', rejected: 'danger' };
    const icons = { pending: <FaClock className="me-1" size={10} />, approved: <FaCheckCircle className="me-1" size={10} />, rejected: <FaTimesCircle className="me-1" size={10} /> };
    return <Badge bg={map[status] || 'secondary'} className="px-2 py-1">{icons[status]}{status?.toUpperCase()}</Badge>;
  };

  const getTypeBadge = (type) => {
    const colors = { Annual: 'primary', Sick: 'info', Personal: 'success', Unpaid: 'danger', 'Comp-Off': 'purple' };
    return <Badge bg={colors[type] || 'secondary'} className="px-2 py-1">{type}</Badge>;
  };

  const calculateDays = (leave) => {
    if (leave.leave_duration === 'Half Day') return 0.5;
    if (!leave.start_date || !leave.end_date) return 1;
    if (leave.start_date === leave.end_date) return 1;
    const diff = Math.abs(new Date(leave.end_date) - new Date(leave.start_date));
    return Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1;
  };

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '300px' }}>
        <Spinner animation="border" variant="primary" />
      </div>
    );
  }

  return (
    <div className={embedded ? '' : 'p-2 p-md-3 p-lg-4'}>
      {!embedded && (
        <div className="d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center mb-4 gap-3">
          <h5 className="mb-0 d-flex align-items-center">
            <FaCalendarAlt className="me-2 text-primary" />
            Team Leave Requests
          </h5>
          <div className="d-flex gap-2">
            <Button variant="outline-primary" size="sm" onClick={fetchLeaveRequests}>
              <FaSyncAlt className="me-1" size={12} /> Refresh
            </Button>
            <button
              className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1"
              onClick={() => navigate(-1)}
            >
              <FaArrowLeft size={12} /> Back
            </button>
          </div>
        </div>
      )}
      {embedded && (
        <div className="d-flex justify-content-end mb-3">
          <Button variant="outline-primary" size="sm" onClick={fetchLeaveRequests}>
            <FaSyncAlt className="me-1" size={12} /> Refresh
          </Button>
        </div>
      )}

      {message.text && (
        <Alert variant={message.type} dismissible onClose={() => setMessage({ type: '', text: '' })} className="mb-3 py-2 small">
          {message.text}
        </Alert>
      )}

      {/* Stats — only in history view */}
      {showHistory && (
        <Row className="mb-3 g-2">
          {[
            { label: 'Total', value: stats.total, color: 'dark' },
            { label: 'Pending', value: stats.pending, color: 'warning' },
            { label: 'Approved', value: stats.approved, color: 'success' },
            { label: 'Rejected', value: stats.rejected, color: 'danger' }
          ].map(s => (
            <Col xs={6} md={3} key={s.label}>
              <Card className="border-0 shadow-sm text-center">
                <Card.Body className="p-2">
                  <h5 className={`mb-0 fw-bold text-${s.color}`}>{s.value}</h5>
                  <small className="text-muted">{s.label}</small>
                </Card.Body>
              </Card>
            </Col>
          ))}
        </Row>
      )}

      {/* Pending / History Toggle */}
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div className="d-flex" style={{ gap: '4px' }}>
          <button
            onClick={() => { setShowHistory(false); setFilter('pending'); setSearchTerm(''); }}
            style={{
              padding: '7px 16px', border: 'none', fontSize: '13px', cursor: 'pointer',
              borderBottom: !showHistory ? '3px solid #0d6efd' : '3px solid transparent',
              background: 'transparent',
              color: !showHistory ? '#0d6efd' : '#6c757d',
              fontWeight: !showHistory ? '600' : '400'
            }}
          >
            Pending Requests
            {stats.pending > 0 && (
              <span className="ms-2 badge rounded-pill bg-warning text-dark" style={{ fontSize: '11px' }}>
                {stats.pending}
              </span>
            )}
          </button>
          <button
            onClick={() => { setShowHistory(true); setFilter('all'); setSearchTerm(''); }}
            style={{
              padding: '7px 16px', border: 'none', fontSize: '13px', cursor: 'pointer',
              borderBottom: showHistory ? '3px solid #0d6efd' : '3px solid transparent',
              background: 'transparent',
              color: showHistory ? '#0d6efd' : '#6c757d',
              fontWeight: showHistory ? '600' : '400'
            }}
          >
            Leave History
            <span className="ms-2 badge rounded-pill bg-secondary" style={{ fontSize: '11px' }}>
              {stats.total}
            </span>
          </button>
        </div>

        {/* Search — only in history */}
        {showHistory && (
          <InputGroup size="sm" style={{ maxWidth: '220px' }}>
            <InputGroup.Text className="bg-light border-0"><FaSearch size={11} className="text-muted" /></InputGroup.Text>
            <Form.Control type="text" placeholder="Search..." value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)} className="border-0 bg-light" />
            {searchTerm && <Button variant="outline-secondary" size="sm" onClick={() => setSearchTerm('')} className="border-0"><FaTimes size={11} /></Button>}
          </InputGroup>
        )}
      </div>

      {/* History status filter — only when history tab active */}
      {showHistory && (
        <div className="d-flex gap-1 flex-wrap mb-3">
          {['all', 'approved', 'rejected'].map(f => (
            <Button key={f} size="sm"
              variant={filter === f ? (f === 'approved' ? 'success' : f === 'rejected' ? 'danger' : 'primary') : `outline-${f === 'approved' ? 'success' : f === 'rejected' ? 'danger' : 'secondary'}`}
              onClick={() => setFilter(f)}
              className="px-3 text-capitalize"
            >
              {f === 'all' ? `All (${stats.total})` : `${f.charAt(0).toUpperCase() + f.slice(1)} (${stats[f]})`}
            </Button>
          ))}
        </div>
      )}

      {/* Table */}
      <Card className="border-0 shadow-sm">
        <Card.Body className="p-0">
          <div className="table-responsive" style={{ maxHeight: '450px', overflowY: 'auto' }}>
            <PaginatedTable as={Table} hover size="sm" className="mb-0">
              <thead className="bg-light sticky-top" style={{ top: 0, zIndex: 10 }}>
                <tr className="small">
                  <th className="fw-normal text-center">#</th>
                  <th className="fw-normal">Employee</th>
                  <th className="fw-normal d-none d-sm-table-cell">Leave Type</th>
                  <th className="fw-normal d-none d-md-table-cell">Dates</th>
                  <th className="fw-normal d-none d-md-table-cell">Days</th>
                  <th className="fw-normal">Reason</th>
                  <th className="fw-normal d-none d-lg-table-cell">Applied At (IST)</th>
                  <th className="fw-normal">Status</th>
                  <th className="fw-normal text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.length > 0 ? filteredRequests.map((leave, idx) => (
                  <tr key={leave.id}>
                    <td className="text-center small">{idx + 1}</td>
                    <td className="small">
                      <div className="fw-semibold text-truncate" style={{ maxWidth: '110px' }}>
                        {leave.first_name} {leave.last_name}
                      </div>
                      <small className="text-muted">{leave.employee_id}</small>
                    </td>
                    <td className="small d-none d-sm-table-cell">{getTypeBadge(leave.leave_type)}</td>
                    <td className="small d-none d-md-table-cell text-nowrap">
                      {formatDate(leave.start_date)}
                      {leave.start_date !== leave.end_date && <><br /><small className="text-muted">to {formatDate(leave.end_date)}</small></>}
                    </td>
                    <td className="small d-none d-md-table-cell">{calculateDays(leave)}</td>
                    <td className="small">
                      <div className="text-truncate" style={{ maxWidth: '120px' }} title={leave.reason}>
                        {leave.reason}
                      </div>
                    </td>
                    <td className="small d-none d-lg-table-cell text-nowrap">
                      {formatDateTimeIST(leave.created_at)}
                    </td>
                    <td className="small">{getStatusBadge(leave.status)}</td>
                    <td className="text-center">
                      <div className="d-flex gap-2 justify-content-center">
                        <FaEye size={15} className="text-primary" style={{ cursor: 'pointer' }}
                          onClick={() => { setSelectedLeave(leave); setShowModal(true); }} title="View" />
                        {leave.status === 'pending' && (
                          <>
                            <FaCheck size={15} className="text-success" style={{ cursor: 'pointer' }}
                              onClick={() => handleAction(leave, 'approve')} title="Approve" />
                            <FaTimes size={15} className="text-danger" style={{ cursor: 'pointer' }}
                              onClick={() => handleAction(leave, 'reject')} title="Reject" />
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="9" className="text-center py-5">
                      <FaCalendarAlt size={35} className="text-muted mb-2 opacity-50" />
                      <p className="text-muted mb-0 small">
                        {!showHistory ? 'No pending leave requests 🎉' : 'No leave requests found'}
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </PaginatedTable>
          </div>
        </Card.Body>
      </Card>

      {/* View Details Modal */}
      <Modal show={showModal} onHide={() => setShowModal(false)} centered size="lg">
        <Modal.Header closeButton className="bg-primary text-white py-2">
          <Modal.Title as="h6" className="mb-0 small">Leave Request Details</Modal.Title>
        </Modal.Header>
        <Modal.Body className="p-3">
          {selectedLeave && (
            <div className="small">
              <Row className="g-3">
                <Col xs={12} md={6}>
                  <Card className="border-0 bg-light h-100">
                    <Card.Body className="p-3">
                      <h6 className="text-primary mb-2 small fw-semibold"><FaUserCircle className="me-2" size={12} />Employee</h6>
                      <p className="mb-1"><strong>Name:</strong> {selectedLeave.first_name} {selectedLeave.last_name}</p>
                      <p className="mb-1"><strong>ID:</strong> {selectedLeave.employee_id}</p>
                      <p className="mb-0"><strong>Department:</strong> {selectedLeave.department || 'N/A'}</p>
                    </Card.Body>
                  </Card>
                </Col>
                <Col xs={12} md={6}>
                  <Card className="border-0 bg-light h-100">
                    <Card.Body className="p-3">
                      <h6 className="text-primary mb-2 small fw-semibold"><FaCalendarAlt className="me-2" size={12} />Leave Info</h6>
                      <p className="mb-1"><strong>Type:</strong> {selectedLeave.leave_type}</p>
                      <p className="mb-1"><strong>Duration:</strong> {selectedLeave.leave_duration}</p>
                      <p className="mb-1"><strong>Days:</strong> {calculateDays(selectedLeave)}</p>
                      <p className="mb-0"><strong>Status:</strong> {getStatusBadge(selectedLeave.status)}</p>
                    </Card.Body>
                  </Card>
                </Col>
                <Col xs={12} md={6}>
                  <Card className="border-0 bg-light">
                    <Card.Body className="p-3">
                      <h6 className="text-primary mb-2 small fw-semibold">Dates</h6>
                      <p className="mb-1"><strong>From:</strong> {formatDate(selectedLeave.start_date)}</p>
                      <p className="mb-1"><strong>To:</strong> {formatDate(selectedLeave.end_date)}</p>
                      <p className="mb-0"><strong>Applied At:</strong> {formatDateTimeIST(selectedLeave.created_at)} IST</p>
                    </Card.Body>
                  </Card>
                </Col>
                <Col xs={12} md={6}>
                  <Card className="border-0 bg-light">
                    <Card.Body className="p-3">
                      <h6 className="text-primary mb-2 small fw-semibold"><FaInfoCircle className="me-2" size={12} />Reason</h6>
                      <p className="mb-0">{selectedLeave.reason}</p>
                    </Card.Body>
                  </Card>
                </Col>
              </Row>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer className="py-2">
          {selectedLeave?.status === 'pending' && (
            <>
              <Button variant="success" size="sm" onClick={() => { setShowModal(false); handleAction(selectedLeave, 'approve'); }}>
                <FaCheck className="me-1" size={12} /> Approve
              </Button>
              <Button variant="danger" size="sm" onClick={() => { setShowModal(false); handleAction(selectedLeave, 'reject'); }}>
                <FaTimes className="me-1" size={12} /> Reject
              </Button>
            </>
          )}
          <Button variant="secondary" size="sm" onClick={() => setShowModal(false)}>Close</Button>
        </Modal.Footer>
      </Modal>

      {/* Approve/Reject Modal */}
      <Modal show={showActionModal} onHide={() => setShowActionModal(false)} centered>
        <Modal.Header closeButton className={actionType === 'approve' ? 'bg-success text-white py-2' : 'bg-danger text-white py-2'}>
          <Modal.Title as="h6" className="mb-0 small">
            {actionType === 'approve' ? <><FaCheckCircle className="me-2" />Approve Leave</> : <><FaTimesCircle className="me-2" />Reject Leave</>}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="p-3">
          {selectedLeave && (
            <div className="small">
              <p className="mb-1"><strong>Employee:</strong> {selectedLeave.first_name} {selectedLeave.last_name}</p>
              <p className="mb-1"><strong>Leave Type:</strong> {selectedLeave.leave_type}</p>
              <p className="mb-3"><strong>Dates:</strong> {formatDate(selectedLeave.start_date)} - {formatDate(selectedLeave.end_date)} ({calculateDays(selectedLeave)} day{calculateDays(selectedLeave) > 1 ? 's' : ''})</p>
              <Form.Group>
                <Form.Label className="fw-semibold small">Remarks (Optional)</Form.Label>
                <Form.Control as="textarea" rows={3} value={remarks}
                  onChange={e => setRemarks(e.target.value)}
                  placeholder="Add remarks..." size="sm" className="bg-light" />
              </Form.Group>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer className="py-2">
          <Button variant="secondary" size="sm" onClick={() => setShowActionModal(false)}>Cancel</Button>
          <Button variant={actionType === 'approve' ? 'success' : 'danger'} size="sm"
            onClick={handleStatusUpdate} disabled={processing}>
            {processing ? <Spinner size="sm" animation="border" className="me-1" /> : null}
            {actionType === 'approve' ? 'Approve' : 'Reject'}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default ManagerLeaveRequests;
