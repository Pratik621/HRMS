import React from 'react';
import { Card, Table, Badge, Button } from 'react-bootstrap';
import { FaArrowRight, FaHistory, FaUmbrellaBeach } from 'react-icons/fa';
import './RecentLeaveRequestsCard.css';

const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const getStatusBadge = (status) => {
  switch (status) {
    case 'approved':
      return <Badge bg="success" className="px-2 py-1">Approved</Badge>;
    case 'pending':
      return <Badge bg="warning" className="px-2 py-1">Pending</Badge>;
    case 'rejected':
      return <Badge bg="danger" className="px-2 py-1">Rejected</Badge>;
    default:
      return <Badge bg="secondary" className="px-2 py-1">Unknown</Badge>;
  }
};

export default function RecentLeaveRequestsCard({ leaveRequests = [], onViewAll, onApplyLeave }) {
  return (
    <Card className="border-0 shadow-sm recent-leave-requests-card">
      <Card.Header className="bg-white py-2 py-md-3 d-flex justify-content-between align-items-center">
        <h6 className="mb-0 small">
          <FaHistory className="me-2" />
          Recent Leave Requests
        </h6>
        <Button variant="link" size="sm" onClick={onViewAll} className="recent-leave-action text-decoration-none">
          View All <FaArrowRight className="ms-1" size={10} />
        </Button>
      </Card.Header>
      <Card.Body className="p-0">
        <div className="table-responsive">
          <Table hover className="mb-0" size="sm">
            <thead className="bg-light">
              <tr>
                <th className="small text-dark">Leave Type</th>
                <th className="small text-dark d-none d-sm-table-cell">Duration</th>
                <th className="small text-dark">Date Range</th>
                <th className="small text-dark d-none d-md-table-cell">Days</th>
                <th className="small text-dark">Status</th>
              </tr>
            </thead>
            <tbody>
              {leaveRequests.length > 0 ? (
                leaveRequests.map((leave, index) => (
                  <tr key={leave.id || index}>
                    <td className="small">
                      <span className="recent-leave-type">{leave.leave_type || 'Leave'}</span>
                    </td>
                    <td className="small d-none d-sm-table-cell">{leave.leave_duration || 'Full Day'}</td>
                    <td className="small">
                      <span className="text-nowrap">{formatDate(leave.start_date)}</span>
                      {leave.end_date && leave.start_date !== leave.end_date && (
                        <span className="text-nowrap d-block d-sm-inline"> - {formatDate(leave.end_date)}</span>
                      )}
                    </td>
                    <td className="small fw-bold d-none d-md-table-cell">{leave.days_count ?? 1}</td>
                    <td className="small">{getStatusBadge(leave.status)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="text-center py-4">
                    <FaUmbrellaBeach size={24} className="text-muted mb-2 opacity-50" />
                    <p className="text-muted small mb-2">No leave requests found</p>
                    <Button variant="primary" size="sm" className="recent-leave-action recent-leave-apply" onClick={onApplyLeave}>
                      Apply for Leave
                    </Button>
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
        </div>
      </Card.Body>
    </Card>
  );
}
