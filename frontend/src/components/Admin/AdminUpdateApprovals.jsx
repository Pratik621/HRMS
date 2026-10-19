import PaginatedTable from '../Common/PaginatedTable';
// components/Admin/AdminUpdateApprovals.jsx
import React, { useState, useEffect } from 'react';
import axios from '../../config/axios'; // Import configured axios instance
import API_ENDPOINTS from '../../config/api'; // Import API endpoints
import { FaCheck, FaTimes, FaEye, FaArrowLeft } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import { Button } from 'react-bootstrap';

const AdminUpdateApprovals = () => {
  const navigate = useNavigate();
  const [completedRequests, setCompletedRequests] = useState([]);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');

  useEffect(() => {
    fetchCompletedRequests();
  }, []);

  const fetchCompletedRequests = async () => {
    setLoading(true);
    try {
      const response = await axios.get(API_ENDPOINTS.ADMIN_UPDATES_COMPLETED);
      setCompletedRequests(response.data);
      setMessage('');
    } catch (error) {
      console.error('Error fetching requests:', error);
      setMessage('Failed to fetch update requests');
      setMessageType('danger');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (requestId) => {
    setLoading(true);
    try {
      await axios.post(API_ENDPOINTS.ADMIN_UPDATES_HANDLE, {
        requestId,
        action: 'approve'
      });
      
      setMessage('Request approved successfully!');
      setMessageType('success');
      await fetchCompletedRequests(); // Refresh the list
      setSelectedRequest(null);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Error approving request');
      setMessageType('danger');
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async (requestId) => {
    setLoading(true);
    try {
      await axios.post(API_ENDPOINTS.ADMIN_UPDATES_HANDLE, {
        requestId,
        action: 'reject'
      });
      
      setMessage('Request rejected successfully!');
      setMessageType('success');
      await fetchCompletedRequests(); // Refresh the list
      setSelectedRequest(null);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Error rejecting request');
      setMessageType('danger');
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const viewChanges = (request) => {
    setSelectedRequest(request);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString(),
      time: date.toLocaleTimeString()
    };
  };

  const renderComparisonValue = (oldValue, newValue) => {
    if (oldValue === newValue) {
      return <span className="text-muted">No change</span>;
    }
    return (
      <div>
        <span className="text-danger text-decoration-line-through me-2">
          {oldValue || 'null'}
        </span>
        <span className="text-success">→ {newValue}</span>
      </div>
    );
  };

  if (loading && completedRequests.length === 0) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
        <p className="mt-2">Loading update requests...</p>
      </div>
    );
  }

  return (
    <div className="p-2 p-md-3 p-lg-4">
      {/* Header - Responsive */}
      <div className="d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center mb-4 gap-3">
        <h4 className="mb-0">Pending Update Approvals</h4>
        <div className="d-flex gap-2 ms-0 ms-sm-auto">
          <button
            className="btn btn-sm btn-outline-primary"
            onClick={fetchCompletedRequests}
            disabled={loading}
          >
            <i className="bi bi-arrow-repeat me-1"></i>
            Refresh
          </button>
          <button
            className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1"
            onClick={() => navigate(-1)}
          >
            <FaArrowLeft size={12} /> Back
          </button>
        </div>
      </div>

      {message && (
        <div className={`alert alert-${messageType} alert-dismissible fade show mb-4`} role="alert">
          {message}
          <button 
            type="button" 
            className="btn-close" 
            onClick={() => setMessage('')}
            aria-label="Close"
          ></button>
        </div>
      )}

      {selectedRequest ? (
        // Show comparison view
        <div className="card mb-4 shadow-sm">
          <div className="card-header bg-white d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center py-3 gap-2">
            <div>
              <h5 className="mb-0">Update Request Review</h5>
              <small className="text-muted">
                Request ID: {selectedRequest._id}
              </small>
            </div>
            <button
              className="btn btn-outline-secondary btn-sm ms-0 ms-sm-auto"
              onClick={() => setSelectedRequest(null)}
            >
              ← Back to List
            </button>
          </div>
          <div className="card-body p-2 p-md-3">
            {/* Employee Info - Responsive */}
            <div className="bg-light p-2 p-md-3 rounded mb-4">
              <div className="row g-2">
                <div className="col-md-6">
                  <h6 className="fw-bold mb-2">Employee Details</h6>
                  <p className="mb-1 small">
                    <strong>Name:</strong> {selectedRequest.employeeDetails?.firstName}{' '}
                    {selectedRequest.employeeDetails?.lastName}
                  </p>
                  <p className="mb-1 small">
                    <strong>Employee ID:</strong> {selectedRequest.employeeDetails?.employeeId}
                  </p>
                  <p className="mb-1 small">
                    <strong>Designation:</strong> {selectedRequest.employeeDetails?.designation}
                  </p>
                  <p className="mb-1 small">
                    <strong>Department:</strong> {selectedRequest.employeeDetails?.department}
                  </p>
                </div>
                <div className="col-md-6">
                  <h6 className="fw-bold mb-2">Request Info</h6>
                  <p className="mb-1 small">
                    <strong>Submitted:</strong> {formatDate(selectedRequest.updatedAt).date} at {formatDate(selectedRequest.updatedAt).time}
                  </p>
                  <p className="mb-1 small">
                    <strong>Requested Fields:</strong> {selectedRequest.requestedFields?.join(', ')}
                  </p>
                  <p className="mb-1 small">
                    <strong>Status:</strong>{' '}
                    <span className="badge bg-warning text-dark">Pending Review</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Changes Comparison - Responsive */}
            <h6 className="fw-bold mb-3">Changes Requested</h6>
            <div className="table-responsive">
              <PaginatedTable searchable className="table table-bordered small">
                <thead className="table-light">
                  <tr>
                    <th style={{ width: '25%' }} className="text-nowrap">Field</th>
                    <th style={{ width: '35%' }} className="text-nowrap">Current Value</th>
                    <th style={{ width: '35%' }} className="text-nowrap">Requested Value</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(selectedRequest.employeeData || {}).map(field => {
                    const oldValue = selectedRequest.employeeDetails?.[field];
                    const newValue = selectedRequest.employeeData?.[field];
                    
                    // Skip if values are the same
                    if (oldValue === newValue) return null;
                    
                    return (
                      <tr key={field}>
                        <td className="fw-semibold text-wrap">{field.replace(/_/g, ' ').toUpperCase()}</td>
                        <td className="text-danger bg-light text-wrap">
                          {oldValue || <em className="text-muted">Not set</em>}
                        </td>
                        <td className="text-success bg-light text-wrap">
                          {newValue || <em className="text-muted">Will be cleared</em>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </PaginatedTable>
            </div>

            {/* Action Buttons - Responsive */}
            <div className="d-flex flex-column flex-sm-row justify-content-end gap-2 mt-4">
              <button
                className="btn btn-outline-danger px-4 w-100 w-sm-auto"
                onClick={() => handleReject(selectedRequest._id)}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                    <span className="d-none d-sm-inline">Rejecting...</span>
                  </>
                ) : (
                  <>
                    <FaTimes className="me-2" />
                    <span className="d-none d-sm-inline">Reject</span>
                    <span className="d-inline d-sm-none">Reject</span>
                  </>
                )}
              </button>
              <button
                className="btn btn-success px-4 w-100 w-sm-auto"
                onClick={() => handleApprove(selectedRequest._id)}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                    <span className="d-none d-sm-inline">Approving...</span>
                  </>
                ) : (
                  <>
                    <FaCheck className="me-2" />
                    <span className="d-none d-sm-inline">Approve</span>
                    <span className="d-inline d-sm-none">Approve</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : (
        // Show list of completed requests
        <div className="card shadow-sm">
          <div className="card-body p-0">
            {completedRequests.length === 0 ? (
              <div className="text-center py-5">
                <div className="mb-3">
                  <FaEye size={40} className="text-muted" />
                </div>
                <h5 className="text-muted">No pending update requests</h5>
                <p className="text-muted small">
                  When employees request to update their information, they will appear here.
                </p>
              </div>
            ) : (
              <div className="table-responsive">
                <PaginatedTable searchable className="table table-hover mb-0">
                  <thead className="table-light">
                    <tr>
                      <th className="text-nowrap">Employee</th>
                      <th className="text-nowrap d-none d-sm-table-cell">Requested Fields</th>
                      <th className="text-nowrap d-none d-md-table-cell">Submitted On</th>
                      <th className="text-nowrap">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {completedRequests.map(request => {
                      const { date, time } = formatDate(request.updatedAt);
                      return (
                        <tr key={request._id}>
                          <td>
                            <div className="fw-semibold text-truncate" style={{ maxWidth: '120px' }} title={`${request.employeeDetails?.firstName} ${request.employeeDetails?.lastName}`}>
                              {request.employeeDetails?.firstName}{' '}
                              {request.employeeDetails?.lastName}
                            </div>
                            <small className="text-muted d-block text-truncate" style={{ maxWidth: '120px' }} title={request.employeeDetails?.designation}>
                              {request.employeeDetails?.designation}
                            </small>
                          </td>
                          <td className="d-none d-sm-table-cell">
                            <div className="d-flex flex-wrap gap-1" style={{ maxWidth: '200px' }}>
                              {request.requestedFields?.map((field, idx) => (
                                <span key={idx} className="badge bg-info text-dark text-truncate">
                                  {field.replace(/_/g, ' ')}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="d-none d-md-table-cell">
                            <div className="text-nowrap">{date}</div>
                            <small className="text-muted text-nowrap">{time}</small>
                          </td>
                          <td>
                            <button
                              className="btn btn-sm btn-outline-primary text-nowrap"
                              onClick={() => viewChanges(request)}
                            >
                              <FaEye className="me-1" />
                              <span className="d-none d-sm-inline">Review Changes</span>
                              <span className="d-inline d-sm-none">Review</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </PaginatedTable>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminUpdateApprovals;