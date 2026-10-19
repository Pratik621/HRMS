import PaginatedTable from '../Common/PaginatedTable';
// src/components/Admin/UpdateApprovals.jsx
import React, { useState, useEffect } from 'react';
import {
  Card, Table, Button, Badge, Alert, Spinner,
  Modal, Row, Col, Form
} from 'react-bootstrap';
import {
  FaCheck,
  FaTimes,
  FaEye,
  FaUser,
  FaInfoCircle,
  FaCheckCircle,
  FaTimesCircle,
  FaCalendarAlt,
  FaClock,
  FaExclamationTriangle,
  FaUpload,
  FaArrowLeft
} from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';

const UpdateApprovals = () => {
  const navigate = useNavigate();
  const [completedRequests, setCompletedRequests] = useState([]);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [comments, setComments] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });
  const [filter, setFilter] = useState('all'); // all, approved, rejected

  useEffect(() => {
    fetchCompletedRequests();
  }, []);

  const fetchCompletedRequests = async () => {
    try {
      setLoading(true);
      setMessage({ type: '', text: '' });
      
      console.log('📡 Fetching completed requests from:', API_ENDPOINTS.ADMIN_UPDATES_COMPLETED);
      
      const response = await axios.get(API_ENDPOINTS.ADMIN_UPDATES_COMPLETED);
      
      console.log('✅ API Response:', response);
      console.log('📦 Response data:', response.data);
      
      if (Array.isArray(response.data)) {
        setCompletedRequests(response.data);
        console.log(`✅ Loaded ${response.data.length} completed requests`);
      } else if (response.data && response.data.data && Array.isArray(response.data.data)) {
        setCompletedRequests(response.data.data);
      } else {
        console.warn('⚠️ Unexpected response format:', response.data);
        setCompletedRequests([]);
      }
    } catch (error) {
      console.error('❌ Error fetching completed requests:', error);
      console.error('Error response:', error.response?.data);
      console.error('Error status:', error.response?.status);
      
      setMessage({
        type: 'danger',
        text: error.response?.data?.message || 'Failed to load requests'
      });
    } finally {
      setLoading(false);
    }
  };

  // ✅ MOVE getStatusBadge function BEFORE it's used in the component
  const getStatusBadge = (status) => {
    if (!status) return <Badge bg="secondary">Unknown</Badge>;
    
    switch(status) {
      case 'approved':
        return <Badge bg="success" pill className="d-inline-flex align-items-center"><FaCheckCircle className="me-1" size={10} /> Approved</Badge>;
      case 'rejected':
        return <Badge bg="danger" pill className="d-inline-flex align-items-center"><FaTimesCircle className="me-1" size={10} /> Rejected</Badge>;
      case 'pending':
        return <Badge bg="warning" pill className="d-inline-flex align-items-center"><FaClock className="me-1" size={10} /> Pending</Badge>;
      case 'completed':
        return <Badge bg="info" pill className="d-inline-flex align-items-center"><FaCheckCircle className="me-1" size={10} /> Completed</Badge>;
      default:
        return <Badge bg="secondary">{status}</Badge>;
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getFilteredRequests = () => {
    if (filter === 'all') return completedRequests;
    return completedRequests.filter(req => req.status === filter);
  };

  const handleViewDetails = (request) => {
    console.log('Viewing request details:', request);
    setSelectedRequest(request);
    setShowModal(true);
    setComments('');
  };

  const handleApprove = async () => {
    if (!selectedRequest) return;
    
    setProcessing(true);
    setMessage({ type: '', text: '' });
    
    try {
      console.log('📤 Approving request:', selectedRequest.id);
      
      const response = await axios.post(API_ENDPOINTS.ADMIN_UPDATES_HANDLE, {
        request_id: selectedRequest.id,
        action: 'approve',
        comments: comments || null
      });
      
      console.log('✅ Approve response:', response.data);
      
      setMessage({ 
        type: 'success', 
        text: 'Request approved successfully! Employee data has been updated.' 
      });
      
      setShowModal(false);
      await fetchCompletedRequests();
      
      window.dispatchEvent(new Event('updateApprovalsChanged'));
      
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
      
    } catch (error) {
      console.error('❌ Error approving request:', error);
      setMessage({ 
        type: 'danger', 
        text: error.response?.data?.message || error.message || 'Error approving request' 
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedRequest) return;
    
    setProcessing(true);
    setMessage({ type: '', text: '' });
    
    try {
      console.log('📤 Rejecting request:', selectedRequest.id);
      
      const response = await axios.post(API_ENDPOINTS.ADMIN_UPDATES_HANDLE, {
        request_id: selectedRequest.id,
        action: 'reject',
        comments: comments || null
      });
      
      console.log('✅ Reject response:', response.data);
      
      setMessage({ 
        type: 'success', 
        text: 'Request rejected successfully!' 
      });
      
      setShowModal(false);
      await fetchCompletedRequests();
      
      window.dispatchEvent(new Event('updateApprovalsChanged'));
      
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
      
    } catch (error) {
      console.error('❌ Error rejecting request:', error);
      setMessage({ 
        type: 'danger', 
        text: error.response?.data?.message || error.message || 'Error rejecting request' 
      });
    } finally {
      setProcessing(false);
    }
  };

  const filteredRequests = getFilteredRequests();

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center min-vh-100">
        <div className="text-center">
          <Spinner animation="border" variant="primary" style={{ width: '3rem', height: '3rem' }} />
          <p className="mt-3 text-muted small">Loading approval requests...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-2 p-md-3 p-lg-4" style={{ backgroundColor: '#f8f9fc', minHeight: '100vh' }}>
      {/* Header - Responsive */}
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center mb-4 gap-3">
        <h5 className="mb-0 d-flex align-items-center">
          <FaEye className="me-2 text-primary" />
          Update Approvals
        </h5>
        <div className="d-flex flex-wrap gap-2 ms-0 ms-md-auto">
          <Badge bg="info" pill className="px-3 py-2">
            Total: {completedRequests.length} Requests
          </Badge>
          <Button
            variant="outline-primary"
            size="sm"
            onClick={fetchCompletedRequests}
            disabled={loading}
            className="d-inline-flex align-items-center"
          >
            <FaExclamationTriangle className="me-2" size={12} />
            Refresh
          </Button>
          <button
            className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1"
            onClick={() => navigate(-1)}
          >
            <FaArrowLeft size={12} /> Back
          </button>
        </div>
      </div>

      {/* Message Alert */}
      {message.text && (
        <Alert 
          variant={message.type} 
          onClose={() => setMessage({ type: '', text: '' })} 
          dismissible
          className="mb-4 shadow-sm py-2"
        >
          <div className="d-flex align-items-center">
            {message.type === 'success' && <FaCheckCircle className="me-2 flex-shrink-0" size={14} />}
            {message.type === 'danger' && <FaExclamationTriangle className="me-2 flex-shrink-0" size={14} />}
            <span className="small">{message.text}</span>
          </div>
        </Alert>
      )}

      {/* Filter Tabs - Responsive */}
      <Card className="mb-4 border-0 shadow-sm">
        <Card.Body className="p-2">
          <div className="d-flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={filter === 'all' ? 'primary' : 'outline-secondary'}
              onClick={() => setFilter('all')}
              className="px-2 px-sm-3"
            >
              All ({completedRequests.length})
            </Button>
            <Button
              size="sm"
              variant={filter === 'pending' ? 'warning' : 'outline-warning'}
              onClick={() => setFilter('pending')}
              className="px-2 px-sm-3"
            >
              Pending ({completedRequests.filter(r => r.status === 'pending').length})
            </Button>
            <Button
              size="sm"
              variant={filter === 'approved' ? 'success' : 'outline-success'}
              onClick={() => setFilter('approved')}
              className="px-2 px-sm-3"
            >
              Approved ({completedRequests.filter(r => r.status === 'approved').length})
            </Button>
            <Button
              size="sm"
              variant={filter === 'rejected' ? 'danger' : 'outline-danger'}
              onClick={() => setFilter('rejected')}
              className="px-2 px-sm-3"
            >
              Rejected ({completedRequests.filter(r => r.status === 'rejected').length})
            </Button>
          </div>
        </Card.Body>
      </Card>

      {/* Main Content */}
      <Card className="border-0 shadow-sm">
        <Card.Header className="bg-light py-2 py-md-3 d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center gap-2">
          <h6 className="mb-0">Pending Approval Requests</h6>
          <Badge bg="dark" pill className="ms-0 ms-sm-auto">
            {filteredRequests.length} Records
          </Badge>
        </Card.Header>
        <Card.Body className="p-0">
          {filteredRequests.length === 0 ? (
            <div className="text-center py-5">
              <FaInfoCircle size={50} className="text-muted mb-3 opacity-50" />
              <h5 className="text-muted">No Requests Found</h5>
              <p className="text-muted small">
                {filter === 'all' 
                  ? 'When employees submit their updates, they will appear here.'
                  : `No ${filter} requests found.`}
              </p>
              {filter !== 'all' && (
                <Button
                  variant="link"
                  size="sm"
                  onClick={() => setFilter('all')}
                  className="mt-2"
                >
                  View all requests
                </Button>
              )}
            </div>
          ) : (
            <div className="table-responsive" style={{ maxHeight: '400px', overflowY: 'auto' }}>
              <PaginatedTable searchable as={Table} hover className="mb-0">
                <thead className="bg-light sticky-top" style={{ top: 0, zIndex: 10 }}>
                  <tr>
                    <th className="small fw-normal text-dark">#</th>
                    <th className="small fw-normal text-dark">Employee</th>
                    <th className="small fw-normal text-dark d-none d-md-table-cell">Request Type</th>
                    <th className="small fw-normal text-dark d-none d-sm-table-cell">Submitted On</th>
                    <th className="small fw-normal text-dark">Status</th>
                    <th className="small fw-normal text-dark">Actions</th>
                   </tr>
                </thead>
                <tbody>
                  {filteredRequests.map((req, index) => (
                    <tr key={req.id}>
                      <td className="small">{index + 1} </td>
                      <td>
                        <div className="d-flex align-items-center">
                          <FaUser className="me-2 text-primary flex-shrink-0" size={12} />
                          <div className="text-truncate" style={{ maxWidth: '120px' }}>
                            <div className="small fw-semibold text-truncate" title={req.employee_name || 'Unknown'}>
                              {req.employee_name || 'Unknown'}
                            </div>
                            <small className="text-muted d-block text-truncate" title={req.employee_id}>{req.employee_id}</small>
                          </div>
                        </div>
                       </td>
                      <td className="d-none d-md-table-cell">
                        <div className="d-flex align-items-center">
                          {req.is_document_update ? (
                            <>
                              <FaUpload className="me-1 text-success" size={12} />
                              <Badge bg="info" pill className="px-2 py-1">
                                Document Upload
                              </Badge>
                            </>
                          ) : (
                            <Badge bg="secondary" pill className="px-2 py-1">
                              Info Update
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="d-none d-sm-table-cell">
                        <div className="d-flex align-items-center">
                          <FaCalendarAlt className="text-muted me-2 flex-shrink-0" size={10} />
                          <small className="text-nowrap">{formatDate(req.updated_at)}</small>
                        </div>
                      </td>
                      <td>{getStatusBadge(req.status)}</td>
                      <td>
                        <Button
                          variant="outline-primary"
                          size="sm"
                          onClick={() => handleViewDetails(req)}
                          className="px-2 px-sm-3 d-inline-flex align-items-center"
                        >
                          <FaEye className="me-1" size={12} />
                          <span className="d-none d-sm-inline">Review</span>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </PaginatedTable>
            </div>
          )}
        </Card.Body>
      </Card>

      {/* Review Modal - Responsive */}
      <Modal 
        show={showModal} 
        onHide={() => setShowModal(false)} 
        size="xl"
        centered
        className="review-modal"
        dialogClassName="mx-2 mx-md-auto"
      >
        <Modal.Header closeButton className="bg-primary text-white py-2">
          <Modal.Title as="h6" className="mb-0 small fw-semibold d-flex align-items-center">
            <FaEye className="me-2 flex-shrink-0" size={14} />
            <span className="text-truncate">Review Update Request</span>
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="p-2 p-md-3" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          {selectedRequest && (
            <>
              {/* Request Info */}
              <Card className="border-0 bg-light mb-3">
                <Card.Body className="p-2 p-md-3">
                  <Row className="g-2">
                    <Col xs={12} md={6}>
                      <h6 className="text-primary mb-2 small fw-semibold d-flex align-items-center">
                        <FaUser className="me-2 flex-shrink-0" size={12} />
                        Employee Information
                      </h6>
                      <p className="mb-1 small"><strong>Name:</strong> {selectedRequest.employee_name || 'N/A'}</p>
                      <p className="mb-1 small"><strong>Employee ID:</strong> {selectedRequest.employee_id}</p>
                      <p className="mb-0 small"><strong>Department:</strong> {selectedRequest.employee_department || 'N/A'}</p>
                    </Col>
                    <Col xs={12} md={6}>
                      <h6 className="text-primary mb-2 small fw-semibold d-flex align-items-center">
                        <FaInfoCircle className="me-2 flex-shrink-0" size={12} />
                        Request Details
                      </h6>
                      <p className="mb-1 small"><strong>Status:</strong> {getStatusBadge(selectedRequest.status)}</p>
                      <p className="mb-1 small"><strong>Submitted:</strong> {formatDate(selectedRequest.updated_at)}</p>
                      <p className="mb-0 small"><strong>Request Type:</strong> {selectedRequest.is_document_update ? 'Document Upload' : 'Information Update'}</p>
                      {selectedRequest.is_document_update && selectedRequest.document_types?.length > 0 && (
                        <div className="mt-2">
                          <small className="fw-semibold">Documents Uploaded:</small>
                          <div className="d-flex flex-wrap gap-1 mt-1">
                            {selectedRequest.document_types.map(doc => (
                              <Badge key={doc} bg="success" pill className="px-2 py-1 small">
                                {doc.replace(/_/g, ' ').toUpperCase()}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </Col>
                  </Row>
                </Card.Body>
              </Card>

              {/* Data Comparison - Only show for info updates */}
              {!selectedRequest.is_document_update && selectedRequest.employee_data && Object.keys(selectedRequest.employee_data).length > 0 && (
                <Card className="border-0 shadow-sm mt-3">
                  <Card.Header className="bg-success bg-opacity-10 py-2">
                    <h6 className="mb-0 text-success small fw-semibold">Employee Submitted Updates</h6>
                  </Card.Header>
                  <Card.Body className="p-2 p-md-3">
                    <Row className="g-2">
                      {Object.entries(selectedRequest.employee_data).map(([key, value]) => (
                        <Col xs={12} sm={6} key={key}>
                          <div className="p-2 bg-light rounded">
                            <small className="text-muted d-block text-capitalize">
                              {key.replace(/_/g, ' ')}
                            </small>
                            <span className="small fw-semibold text-success">
                              {value !== null && value !== undefined && value !== '' ? String(value) : <em className="text-muted">empty</em>}
                            </span>
                          </div>
                        </Col>
                      ))}
                    </Row>
                  </Card.Body>
                </Card>
              )}

              {/* Document Upload Info */}
              {selectedRequest.is_document_update && (
                <Card className="border-0 bg-light mt-3">
                  <Card.Header className="bg-light py-2">
                    <h6 className="mb-0 text-success small fw-semibold d-flex align-items-center">
                      <FaUpload className="me-2" size={12} />
                      Document Upload Details
                    </h6>
                  </Card.Header>
                  <Card.Body className="p-2 p-md-3">
                    <p className="mb-2 small">
                      <strong>Documents uploaded by employee:</strong>
                    </p>
                    <div className="d-flex flex-wrap gap-2 mb-3">
                      {selectedRequest.document_types?.map(doc => (
                        <Badge key={doc} bg="info" pill className="px-3 py-2">
                          {doc.replace(/_/g, ' ').toUpperCase()}
                        </Badge>
                      ))}
                    </div>
                    {selectedRequest.employee_data?.documents_uploaded_at && (
                      <p className="mb-0 small text-muted">
                        <strong>Uploaded on:</strong> {formatDate(selectedRequest.employee_data.documents_uploaded_at)}
                      </p>
                    )}
                    <div className="mt-2 p-2 bg-white rounded small">
                      <FaInfoCircle className="me-1 text-info" size={10} />
                      <span className="text-muted">Documents have been uploaded by the employee and are ready for review.</span>
                    </div>
                  </Card.Body>
                </Card>
              )}

              {/* Comments Section */}
              <Form.Group className="mt-3">
                <Form.Label className="small fw-semibold d-flex align-items-center">
                  <FaInfoCircle className="me-2 text-primary flex-shrink-0" size={12} />
                  Comments (Optional)
                </Form.Label>
                <Form.Control
                  as="textarea"
                  rows={2}
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  placeholder="Add comments about this decision..."
                  size="sm"
                  className="bg-light"
                  disabled={processing}
                />
              </Form.Group>

              {/* Admin Notes if any */}
              {selectedRequest.notes && (
                <div className="mt-3 p-2 bg-warning bg-opacity-10 rounded">
                  <small className="text-warning fw-semibold d-block mb-1 d-flex align-items-center">
                    <FaInfoCircle className="me-1" size={10} />
                    Admin Note:
                  </small>
                  <small className="text-dark d-block">{selectedRequest.notes}</small>
                </div>
              )}
            </>
          )}
        </Modal.Body>
        <Modal.Footer className="py-2">
          <Button 
            variant="secondary" 
            size="sm" 
            onClick={() => setShowModal(false)}
            disabled={processing}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={handleReject}
            disabled={processing}
            className="px-2 px-sm-3 d-inline-flex align-items-center"
          >
            {processing ? (
              <>
                <Spinner size="sm" animation="border" className="me-1" />
                <span className="d-none d-sm-inline">Processing...</span>
              </>
            ) : (
              <>
                <FaTimes className="me-1" size={12} />
                <span className="d-none d-sm-inline">Reject</span>
              </>
            )}
          </Button>
          <Button
            variant="success"
            size="sm"
            onClick={handleApprove}
            disabled={processing}
            className="px-2 px-sm-3 d-inline-flex align-items-center"
          >
            {processing ? (
              <>
                <Spinner size="sm" animation="border" className="me-1" />
                <span className="d-none d-sm-inline">Processing...</span>
              </>
            ) : (
              <>
                <FaCheck className="me-1" size={12} />
                <span className="d-none d-sm-inline">Approve</span>
              </>
            )}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default UpdateApprovals;