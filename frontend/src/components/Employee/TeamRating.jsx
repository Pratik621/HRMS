import PaginatedTable from '../Common/PaginatedTable';
// src/components/Employee/TeamRating.jsx
import React, { useState, useEffect } from 'react';
import {
  Card, Table, Badge, Button, Modal, Form,
  Alert, Spinner, Row, Col
} from 'react-bootstrap';
import {
  FaStar,
  FaUserTie,
  FaSave,
  FaEdit,
  FaHistory,
  FaInfoCircle,
  FaSyncAlt,
  FaArrowLeft
} from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';
import { useAuth } from '../../context/AuthContext';

const TeamRating = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [selectedRating, setSelectedRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comments, setComments] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [currentMonth, setCurrentMonth] = useState(null);
  const [currentYear, setCurrentYear] = useState(null);
  const [monthName, setMonthName] = useState('');

  const fetchTeamForRating = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_ENDPOINTS.RATINGS}/team`);
      
      if (response.data.success) {
        setTeamMembers(response.data.team_members);
        setCurrentMonth(response.data.current_month);
        setCurrentYear(response.data.current_year);
        setMonthName(response.data.month_name);
      }
    } catch (error) {
      console.error('Error fetching team:', error);
      setMessage({ type: 'danger', text: 'Failed to load team members' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeamForRating();
  }, []);

  const refreshData = async () => {
    setRefreshing(true);
    await fetchTeamForRating();
    setRefreshing(false);
    setMessage({ type: 'success', text: 'Data refreshed successfully!' });
    setTimeout(() => setMessage({ type: '', text: '' }), 3000);
  };

  const getRatingColor = (rating) => {
    if (rating >= 4) return 'success';
    if (rating >= 3) return 'info';
    if (rating >= 2) return 'warning';
    return 'danger';
  };

  const getRatingLabel = (rating) => {
    if (rating === 5) return 'Excellent';
    if (rating === 4) return 'Good';
    if (rating === 3) return 'Average';
    if (rating === 2) return 'Below Average';
    if (rating === 1) return 'Poor';
    return 'Not Rated';
  };

  const renderStars = (rating, interactive = false, onStarClick, onStarHover, onHoverLeave) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      if (interactive) {
        stars.push(
          <FaStar
            key={i}
            size={24}
            className="me-1"
            style={{
              cursor: 'pointer',
              color: (hoverRating >= i || selectedRating >= i) ? '#ffc107' : '#e4e5e9',
              transition: 'all 0.2s ease'
            }}
            onClick={() => onStarClick(i)}
            onMouseEnter={() => onStarHover(i)}
            onMouseLeave={onHoverLeave}
          />
        );
      } else {
        stars.push(
          <FaStar
            key={i}
            size={16}
            className="me-1"
            style={{ color: i <= rating ? '#ffc107' : '#e4e5e9' }}
          />
        );
      }
    }
    return stars;
  };

  const renderStaticStars = (rating) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <FaStar
          key={i}
          size={14}
          className="me-1"
          style={{ color: i <= rating ? '#ffc107' : '#e4e5e9' }}
        />
      );
    }
    return stars;
  };

  const handleOpenRatingModal = (employee) => {
    setSelectedEmployee(employee);
    setSelectedRating(employee.rating || 0);
    setComments(employee.comments || '');
    setShowRatingModal(true);
  };

  const handleSubmitRating = async () => {
    if (selectedRating === 0) {
      setMessage({ type: 'warning', text: 'Please select a rating' });
      return;
    }

    setSubmitting(true);
    try {
      const response = await axios.post(`${API_ENDPOINTS.RATINGS}/submit`, {
        employee_id: selectedEmployee.employee_id,
        rating: selectedRating,
        comments: comments,
        rating_month: currentMonth,
        rating_year: currentYear
      });

      if (response.data.success) {
        setMessage({ type: 'success', text: response.data.message });
        setShowRatingModal(false);
        await fetchTeamForRating();
        setTimeout(() => setMessage({ type: '', text: '' }), 3000);
      }
    } catch (error) {
      console.error('Error submitting rating:', error);
      setMessage({ type: 'danger', text: error.response?.data?.message || 'Failed to submit rating' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '400px' }}>
        <Spinner animation="border" variant="primary" />
      </div>
    );
  }

  const ratedCount = teamMembers.filter(m => m.rating).length;
  const averageRating = teamMembers.length > 0 
    ? (teamMembers.reduce((sum, m) => sum + (m.rating || 0), 0) / teamMembers.length).toFixed(1)
    : 0;

  return (
    <div className="p-2 p-md-3 p-lg-4">
      {/* Header */}
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center mb-4 gap-3">
        <div>
          <h5 className="mb-1 d-flex align-items-center">
            <FaUserTie className="me-2 text-primary" />
            Team Performance Rating
          </h5>
          <p className="text-muted mb-0 small">
            Rate your team members for {monthName} {currentYear}
          </p>
        </div>
        <div className="d-flex gap-2">
          <Button variant="outline-primary" size="sm" onClick={refreshData} disabled={refreshing}>
            <FaSyncAlt className={`me-1 ${refreshing ? 'fa-spin' : ''}`} size={12} />
            Refresh
          </Button>
          <Badge bg="info" pill className="px-3 py-2">
            Rated: {ratedCount}/{teamMembers.length}
          </Badge>
          <Badge bg="warning" pill className="px-3 py-2">
            Avg Rating: {averageRating} ★
          </Badge>
          <button
            className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1"
            onClick={() => navigate(-1)}
          >
            <FaArrowLeft size={12} /> Back
          </button>
        </div>
      </div>

      {message.text && (
        <Alert variant={message.type} dismissible onClose={() => setMessage({ type: '', text: '' })} className="mb-3">
          {message.text}
        </Alert>
      )}

      {/* Rating Legend */}
      <Card className="border-0 shadow-sm mb-3 bg-light">
        <Card.Body className="p-3">
          <div className="d-flex flex-wrap justify-content-center gap-4">
            <div className="d-flex align-items-center">
              <div className="me-2" style={{ color: '#dc3545' }}>★</div>
              <small className="text-muted">1 Star - Poor</small>
            </div>
            <div className="d-flex align-items-center">
              <div className="me-2" style={{ color: '#fd7e14' }}>★★</div>
              <small className="text-muted">2 Stars - Below Average</small>
            </div>
            <div className="d-flex align-items-center">
              <div className="me-2" style={{ color: '#ffc107' }}>★★★</div>
              <small className="text-muted">3 Stars - Average</small>
            </div>
            <div className="d-flex align-items-center">
              <div className="me-2" style={{ color: '#20c997' }}>★★★★</div>
              <small className="text-muted">4 Stars - Good</small>
            </div>
            <div className="d-flex align-items-center">
              <div className="me-2" style={{ color: '#28a745' }}>★★★★★</div>
              <small className="text-muted">5 Stars - Excellent</small>
            </div>
          </div>
        </Card.Body>
      </Card>

      {/* Team Members Table */}
      <Card className="border-0 shadow-sm">
        <Card.Header className="bg-light py-3">
          <h6 className="mb-0 fw-semibold">Your Team Members</h6>
        </Card.Header>
        <Card.Body className="p-0">
          <div className="table-responsive">
            <PaginatedTable searchable as={Table} hover className="mb-0">
              <thead className="bg-light">
                <tr className="small">
                  <th className="fw-normal">#</th>
                  <th className="fw-normal">Employee</th>
                  <th className="fw-normal d-none d-md-table-cell">Department</th>
                  <th className="fw-normal d-none d-lg-table-cell">Designation</th>
                  <th className="fw-normal text-center">Current Rating</th>
                  <th className="fw-normal text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {teamMembers.length > 0 ? (
                  teamMembers.map((member, index) => (
                    <tr key={member.employee_id}>
                      <td className="small text-center">{index + 1}</td>
                      <td className="small">
                        <div className="fw-semibold">{member.first_name} {member.last_name}</div>
                        <small className="text-muted">{member.employee_id}</small>
                      </td>
                      <td className="small d-none d-md-table-cell">{member.department || '-'}</td>
                      <td className="small d-none d-lg-table-cell">{member.designation || '-'}</td>
                      <td className="text-center">
                        {member.rating ? (
                          <div>
                            <div className="mb-1">
                              {renderStaticStars(member.rating)}
                            </div>
                            <Badge bg={getRatingColor(member.rating)} pill className="mt-1">
                              {getRatingLabel(member.rating)}
                            </Badge>
                          </div>
                        ) : (
                          <Badge bg="secondary" pill>Not Rated</Badge>
                        )}
                      </td>
                      <td className="text-center">
                        <Button
                          variant={member.rating ? 'outline-warning' : 'outline-primary'}
                          size="sm"
                          onClick={() => handleOpenRatingModal(member)}
                        >
                          {member.rating ? <><FaEdit className="me-1" /> Update</> : <><FaSave className="me-1" /> Rate Now</>}
                        </Button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="6" className="text-center py-4">
                      <FaUserTie size={40} className="text-muted mb-2 opacity-50" />
                      <p className="text-muted mb-0">No team members found</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </PaginatedTable>
          </div>
        </Card.Body>
      </Card>

      {/* Rating Modal */}
      <Modal show={showRatingModal} onHide={() => setShowRatingModal(false)} centered size="lg">
        <Modal.Header closeButton className="bg-primary text-white">
          <Modal.Title className="h6">
            <FaStar className="me-2" />
            Rate {selectedEmployee?.first_name} {selectedEmployee?.last_name}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="p-4">
          {selectedEmployee && (
            <>
              <div className="mb-4 p-3 bg-light rounded">
                <Row className="g-3">
                  <Col xs={12} md={6}>
                    <div className="small text-muted">Employee ID</div>
                    <div className="fw-semibold">{selectedEmployee.employee_id}</div>
                  </Col>
                  <Col xs={12} md={6}>
                    <div className="small text-muted">Department</div>
                    <div className="fw-semibold">{selectedEmployee.department || 'N/A'}</div>
                  </Col>
                  <Col xs={12}>
                    <div className="small text-muted">Rating Period</div>
                    <div className="fw-semibold">{monthName} {currentYear}</div>
                  </Col>
                </Row>
              </div>

              {/* Previous rating context */}
              {selectedEmployee.has_rated && (
                <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: '12px 14px', marginBottom: 20 }}>
                  <div style={{ fontSize: 11, color: '#92400e', fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Last Rating This Period
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: selectedEmployee.comments ? 6 : 0 }}>
                    {[1,2,3,4,5].map(n => (
                      <span key={n} style={{ color: n <= selectedEmployee.rating ? '#f59e0b' : '#fde68a', fontSize: 16 }}>★</span>
                    ))}
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#92400e', marginLeft: 4 }}>{getRatingLabel(selectedEmployee.rating)}</span>
                  </div>
                  {selectedEmployee.comments && (
                    <div style={{ fontSize: 12, color: '#92400e', fontStyle: 'italic', marginTop: 4 }}>
                      "{selectedEmployee.comments}"
                    </div>
                  )}
                </div>
              )}

              <Form.Group className="mb-4">
                <Form.Label className="fw-semibold">Select Rating</Form.Label>
                <div className="d-flex align-items-center">
                  {renderStars(
                    selectedRating, 
                    true, 
                    setSelectedRating, 
                    setHoverRating, 
                    () => setHoverRating(0)
                  )}
                  <span className="ms-3 text-muted">
                    {selectedRating > 0 && `(${getRatingLabel(selectedRating)})`}
                  </span>
                </div>
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label className="fw-semibold">Comments (Optional)</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={4}
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  placeholder="Provide feedback or comments about the employee's performance..."
                />
                <Form.Text className="text-muted">
                  These comments will be visible to the employee
                </Form.Text>
              </Form.Group>

              <Alert variant="info" className="small">
                <FaInfoCircle className="me-2" />
                <strong>Rating Guidelines:</strong>
                <ul className="mt-2 mb-0 small">
                  <li>1 Star: Poor - Needs significant improvement</li>
                  <li>2 Stars: Below Average - Areas need development</li>
                  <li>3 Stars: Average - Meets expectations</li>
                  <li>4 Stars: Good - Exceeds expectations</li>
                  <li>5 Stars: Excellent - Outstanding performance</li>
                </ul>
              </Alert>
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" size="sm" onClick={() => setShowRatingModal(false)}>
            Cancel
          </Button>
          <Button 
            variant="primary" 
            size="sm" 
            onClick={handleSubmitRating} 
            disabled={submitting || selectedRating === 0}
          >
            {submitting ? <Spinner size="sm" animation="border" className="me-2" /> : <FaSave className="me-2" />}
            {selectedEmployee?.rating ? 'Update Rating' : 'Submit Rating'}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default TeamRating;