import PaginatedTable from '../Common/PaginatedTable';
// src/components/Admin/PendingApprovals.jsx
import React, { useState, useEffect } from 'react';
import {
  Card, Table, Button, Badge, Modal, Form,
  Alert, Spinner, Row, Col
} from 'react-bootstrap';
import {
  FaCheckCircle,
  FaTimesCircle,
  FaInfoCircle,
  FaUser,
  FaCalendarAlt,
  FaClock,
  FaEye,
  FaComments,
  FaSyncAlt,
  FaFileAlt
} from 'react-icons/fa';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';
import { useAuth } from '../../context/AuthContext';

const PendingApprovals = () => {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [modalAction, setModalAction] = useState(null);
  const [adminComments, setAdminComments] = useState('');
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [filter, setFilter] = useState('pending');

  useEffect(() => {
    fetchRequests();
  }, [filter]);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const response = await axios.get(API_ENDPOINTS.ADMIN_UPDATES_PENDING);
      
      console.log('📊 Pending update requests:', response.data);
      
      let requestsData = [];
      if (Array.isArray(response.data)) {
        requestsData = response.data;
      } else if (response.data && response.data.requests && Array.isArray(response.data.requests)) {
        requestsData = response.data.requests;
      } else if (response.data && response.data.data && Array.isArray(response.data.data)) {
        requestsData = response.data.data;
      }
      
      if (filter !== 'all') {
        requestsData = requestsData.filter(req => req.status === filter);
      }
      
      setRequests(requestsData);
    } catch (error) {
      console.error('Error fetching requests:', error);
      setMessage({
        type: 'danger',
        text: error.response?.data?.message || 'Failed to load requests'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = (request) => {
    setSelectedRequest(request);
    setModalAction('approve');
    setShowModal(true);
  };

  const handleReject = (request) => {
    setSelectedRequest(request);
    setModalAction('reject');
    setShowModal(true);
  };

  const confirmAction = async () => {
    if (!selectedRequest) return;
    
    setProcessing(true);
    try {
      await axios.post(API_ENDPOINTS.ADMIN_UPDATES_HANDLE, {
        request_id: selectedRequest.id,
        action: modalAction,
        comments: adminComments
      });
      setMessage({ type: 'success', text: `Request ${modalAction}d successfully` });
      await fetchRequests();
      setShowModal(false);
      setAdminComments('');
      setSelectedRequest(null);
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Error processing request:', error);
      setMessage({
        type: 'danger',
        text: error.response?.data?.message || `Failed to ${modalAction} request`
      });
    } finally {
      setProcessing(false);
    }
  };

  const formatDateTime = (dateTime) => {
    if (!dateTime) return 'N/A';
    const date = new Date(dateTime);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadge = (status) => {
    switch(status) {
      case 'pending':
        return <Badge bg="warning"><FaClock className="me-1" size={10} /> Pending</Badge>;
      case 'in_progress':
        return <Badge bg="info"><FaClock className="me-1" size={10} /> In Progress</Badge>;
      case 'completed':
        return <Badge bg="success"><FaCheckCircle className="me-1" size={10} /> Completed</Badge>;
      case 'approved':
        return <Badge bg="success"><FaCheckCircle className="me-1" size={10} /> Approved</Badge>;
      case 'rejected':
        return <Badge bg="danger"><FaTimesCircle className="me-1" size={10} /> Rejected</Badge>;
      default:
        return <Badge bg="secondary">{status}</Badge>;
    }
  };

  const getFieldIcon = (field) => {
    const icons = {
      personal: '👤',
      contact: '📞',
      address: '🏠',
      bank: '🏦',
      employment: '💼',
      emergency: '🚑',
      documents: '📄',
      salary: '💰'
    };
    return icons[field] || '📝';
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <Spinner animation="border" variant="primary" />
        <p className="mt-3 text-muted">Loading pending approvals...</p>
      </div>
    );
  }

  return (
    <div>
      {message.text && (
        <Alert variant={message.type} onClose={() => setMessage({ type: '', text: '' })} dismissible className="mb-3">
          {message.text}
        </Alert>
      )}

      <div className="d-flex flex-wrap gap-2 mb-3">
        <Button 
          size="sm" 
          variant={filter === 'pending' ? 'warning' : 'outline-warning'} 
          onClick={() => setFilter('pending')}
        >
          Pending ({requests.filter(r => r.status === 'pending').length})
        </Button>
        <Button 
          size="sm" 
          variant={filter === 'in_progress' ? 'info' : 'outline-info'} 
          onClick={() => setFilter('in_progress')}
        >
          In Progress ({requests.filter(r => r.status === 'in_progress').length})
        </Button>
        <Button 
          size="sm" 
          variant={filter === 'completed' ? 'success' : 'outline-success'} 
          onClick={() => setFilter('completed')}
        >
          Completed ({requests.filter(r => r.status === 'completed').length})
        </Button>
        <Button 
          size="sm" 
          variant={filter === 'approved' ? 'success' : 'outline-success'} 
          onClick={() => setFilter('approved')}
        >
          Approved ({requests.filter(r => r.status === 'approved').length})
        </Button>
        <Button 
          size="sm" 
          variant={filter === 'rejected' ? 'danger' : 'outline-danger'} 
          onClick={() => setFilter('rejected')}
        >
          Rejected ({requests.filter(r => r.status === 'rejected').length})
        </Button>
        <Button 
          size="sm" 
          variant={filter === 'all' ? 'secondary' : 'outline-secondary'} 
          onClick={() => setFilter('all')}
        >
          All ({requests.length})
        </Button>
        <Button 
          size="sm" 
          variant="outline-primary" 
          onClick={fetchRequests}
          className="ms-auto"
        >
          <FaSyncAlt className="me-1" /> Refresh
        </Button>
      </div>

      {requests.length === 0 ? (
        <Card className="text-center py-5">
          <Card.Body>
            <FaCheckCircle size={40} className="text-success mb-3 opacity-50" />
            <h6 className="text-muted">No pending approvals</h6>
            <p className="text-muted small">All update requests have been processed</p>
          </Card.Body>
        </Card>
      ) : (
        <div className="table-responsive">
          <PaginatedTable searchable as={Table} hover size="sm" className="mb-0">
            <thead className="bg-light">
              <tr className="small">
                <th>#</th>
                <th>Employee</th>
                <th className="d-none d-md-table-cell">Requested Fields</th>
                <th>Status</th>
                <th className="d-none d-lg-table-cell">Requested On</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request, index) => (
                <tr key={request.id}>
                  <td className="small text-center">{index + 1}</td>
                  <td className="small">
                    <div className="fw-semibold">
                      {request.employees?.first_name} {request.employees?.last_name}
                    </div>
                    <small className="text-muted">{request.employee_id}</small>
                  </td>
                  <td className="small d-none d-md-table-cell">
                    <div className="d-flex flex-wrap gap-1">
                      {request.requested_fields?.map((field, idx) => (
                        <Badge key={idx} bg="light" text="dark" className="me-1">
                          {getFieldIcon(field)} {field}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="small">{getStatusBadge(request.status)}</td>
                  <td className="small d-none d-lg-table-cell">
                    {formatDateTime(request.created_at)}
                  </td>
                  <td className="small">
                    {request.status === 'pending' && (
                      <div className="d-flex gap-1">
                        <Button 
                          size="sm" 
                          variant="success" 
                          onClick={() => handleApprove(request)}
                          title="Approve"
                        >
                          <FaCheckCircle />
                        </Button>
                        <Button 
                          size="sm" 
                          variant="danger" 
                          onClick={() => handleReject(request)}
                          title="Reject"
                        >
                          <FaTimesCircle />
                        </Button>
                      </div>
                    )}
                    {request.status === 'completed' && (
                      <div className="d-flex gap-1">
                        <Button 
                          size="sm" 
                          variant="success" 
                          onClick={() => handleApprove(request)}
                          title="Approve"
                        >
                          <FaCheckCircle />
                        </Button>
                        <Button 
                          size="sm" 
                          variant="danger" 
                          onClick={() => handleReject(request)}
                          title="Reject"
                        >
                          <FaTimesCircle />
                        </Button>
                      </div>
                    )}
                    {request.status === 'in_progress' && (
                      <Button 
                        size="sm" 
                        variant="info" 
                        onClick={() => {
                          setSelectedRequest(request);
                          setModalAction('view');
                          setShowModal(true);
                        }}
                        title="View Details"
                      >
                        <FaEye />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </PaginatedTable>
        </div>
      )}

      {/* Modal for Actions */}
      <Modal show={showModal} onHide={() => setShowModal(false)} centered size="lg">
        <Modal.Header closeButton className={
          modalAction === 'approve' ? 'bg-success text-white' : 
          modalAction === 'reject' ? 'bg-danger text-white' : 
          'bg-info text-white'
        }>
          <Modal.Title className="h6">
            {modalAction === 'approve' && <><FaCheckCircle className="me-2" /> Approve Update Request</>}
            {modalAction === 'reject' && <><FaTimesCircle className="me-2" /> Reject Update Request</>}
            {modalAction === 'view' && <><FaEye className="me-2" /> Request Details</>}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {selectedRequest && (
            <>
              <Row className="mb-3">
                <Col md={6}>
                  <small className="text-muted">Employee</small>
                  <div><strong>{selectedRequest.employees?.first_name} {selectedRequest.employees?.last_name}</strong></div>
                  <small className="text-muted">{selectedRequest.employee_id}</small>
                </Col>
                <Col md={6}>
                  <small className="text-muted">Department</small>
                  <div>{selectedRequest.employees?.department || 'N/A'}</div>
                </Col>
              </Row>
              
              <Row className="mb-3">
                <Col md={6}>
                  <small className="text-muted">Requested On</small>
                  <div>{formatDateTime(selectedRequest.created_at)}</div>
                </Col>
                <Col md={6}>
                  <small className="text-muted">Status</small>
                  <div>{getStatusBadge(selectedRequest.status)}</div>
                </Col>
              </Row>
              
              <div className="bg-light p-3 rounded mb-3">
                <small className="text-muted d-block mb-2">Requested Fields</small>
                <div className="d-flex flex-wrap gap-2">
                  {selectedRequest.requested_fields?.map((field, idx) => (
                    <Badge key={idx} bg="info" className="px-3 py-2">
                      {getFieldIcon(field)} {field.charAt(0).toUpperCase() + field.slice(1)}
                    </Badge>
                  ))}
                </div>
              </div>
              
              {selectedRequest.notes && (
                <div className="mb-3">
                  <small className="text-muted">Admin Notes</small>
                  <div className="bg-light p-2 rounded">{selectedRequest.notes}</div>
                </div>
              )}
              
              {selectedRequest.employee_data && Object.keys(selectedRequest.employee_data).length > 0 && (
                <div className="mb-3">
                  <small className="text-muted fw-semibold d-block mb-2">Employee Submitted Updates</small>
                  <div className="bg-success bg-opacity-10 p-2 rounded border border-success border-opacity-25">
                    <Row className="g-2">
                      {Object.entries(selectedRequest.employee_data)
                        .filter(([k]) => !['documents_uploaded_at', 'uploaded_documents'].includes(k))
                        .map(([key, value]) => (
                          <Col xs={12} sm={6} key={key}>
                            <div className="p-2 bg-white rounded">
                              <small className="text-muted d-block text-capitalize">
                                {key.replace(/_/g, ' ')}
                              </small>
                              <span className="small fw-semibold text-success">
                                {value !== null && value !== undefined && value !== '' 
                                  ? String(value) 
                                  : <em className="text-muted">empty</em>}
                              </span>
                            </div>
                          </Col>
                        ))}
                    </Row>
                  </div>
                </div>
              )}
              
              {(modalAction === 'approve' || modalAction === 'reject') && (
                <Form.Group>
                  <Form.Label className="small fw-semibold">
                    {modalAction === 'approve' ? 'Approval Notes (Optional)' : 'Rejection Reason (Required)'}
                  </Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={3}
                    placeholder={modalAction === 'approve' 
                      ? 'Add any notes about this approval...' 
                      : 'Please provide reason for rejection...'}
                    value={adminComments}
                    onChange={(e) => setAdminComments(e.target.value)}
                    required={modalAction === 'reject'}
                    className="small"
                  />
                  {modalAction === 'reject' && !adminComments && (
                    <small className="text-danger">Rejection reason is required</small>
                  )}
                </Form.Group>
              )}
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" size="sm" onClick={() => setShowModal(false)}>
            Close
          </Button>
          {(modalAction === 'approve' || modalAction === 'reject') && (
            <Button
              variant={modalAction === 'approve' ? 'success' : 'danger'}
              size="sm"
              onClick={confirmAction}
              disabled={processing || (modalAction === 'reject' && !adminComments)}
            >
              {processing ? (
                <>
                  <Spinner size="sm" animation="border" className="me-2" />
                  Processing...
                </>
              ) : (
                <>
                  {modalAction === 'approve' ? 'Approve Request' : 'Reject Request'}
                </>
              )}
            </Button>
          )}
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default PendingApprovals;