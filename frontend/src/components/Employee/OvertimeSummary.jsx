import PaginatedTable from '../Common/PaginatedTable';
// src/components/Employee/OvertimeSummary.jsx
import React, { useState, useEffect } from 'react';
import {
  Card, Table, Badge, Row, Col, Button,
  Spinner, Alert, Form
} from 'react-bootstrap';
import {
  FaClock,
  FaMoneyBillWave,
  FaCalendarAlt,
  FaArrowLeft,
  FaArrowRight,
  FaTrophy
} from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';

const OvertimeSummary = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [overtimeData, setOvertimeData] = useState([]);
  const [summary, setSummary] = useState({
    total_days: 0,
    total_hours: 0,
    total_minutes: 0,
    total_amount: 0
  });
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [error, setError] = useState('');

  const months = [
    { value: 1, label: 'January' },
    { value: 2, label: 'February' },
    { value: 3, label: 'March' },
    { value: 4, label: 'April' },
    { value: 5, label: 'May' },
    { value: 6, label: 'June' },
    { value: 7, label: 'July' },
    { value: 8, label: 'August' },
    { value: 9, label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' }
  ];

  const years = [2024, 2025, 2026];

  useEffect(() => {
    fetchOvertimeData();
  }, [selectedMonth, selectedYear]);

  const fetchOvertimeData = async () => {
    try {
      setLoading(true);
      const response = await axios.get(
        `${API_ENDPOINTS.ATTENDANCE}/overtime/${user.employeeId}/${selectedMonth}/${selectedYear}`
      );

      if (response.data.success) {
        setOvertimeData(response.data.overtime || []);
        setSummary(response.data.summary || {});
      }
    } catch (error) {
      console.error('Error fetching overtime data:', error);
      setError('Failed to load overtime data');
    } finally {
      setLoading(false);
    }
  };

  const handlePreviousMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear(selectedYear - 1);
    } else {
      setSelectedMonth(selectedMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear(selectedYear + 1);
    } else {
      setSelectedMonth(selectedMonth + 1);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center min-vh-100">
        <div className="text-center">
          <Spinner animation="border" variant="primary" style={{ width: '3rem', height: '3rem' }} />
          <p className="mt-3 text-muted small">Loading overtime data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-2 p-md-3 p-lg-4" style={{ backgroundColor: '#f8f9fc', minHeight: '100vh' }}>
      {/* Header */}
      <div className="d-flex align-items-center justify-content-between mb-4">
        <h5 className="mb-0 d-flex align-items-center">
          <FaClock className="me-2 text-primary" />
          Overtime Summary
        </h5>
        <button
          className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1"
          onClick={() => navigate(-1)}
        >
          <FaArrowLeft size={12} /> Back
        </button>
      </div>

      {error && (
        <Alert variant="danger" onClose={() => setError('')} dismissible className="mb-3 py-2">
          <small>{error}</small>
        </Alert>
      )}

      {/* Month Navigation */}
      <Card className="border-0 shadow-sm mb-4">
        <Card.Body className="p-2 p-md-3">
          <Row className="align-items-center g-3">
            <Col xs={12} md={4}>
              <div className="d-flex align-items-center">
                <Button variant="outline-secondary" size="sm" onClick={handlePreviousMonth}>
                  <FaArrowLeft size={12} />
                </Button>
                <Form.Select
                  size="sm"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                  className="mx-1"
                  style={{ width: '100px' }}
                >
                  {months.map(m => (
                    <option key={m.value} value={m.value}>{m.label.substring(0,3)}</option>
                  ))}
                </Form.Select>
                <Form.Select
                  size="sm"
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                  className="me-1"
                  style={{ width: '80px' }}
                >
                  {years.map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </Form.Select>
                <Button variant="outline-secondary" size="sm" onClick={handleNextMonth}>
                  <FaArrowRight size={12} />
                </Button>
              </div>
            </Col>
            <Col xs={12} md={8}>
              <div className="d-flex flex-wrap gap-2 justify-content-start justify-content-md-end">
                <Badge bg="success" className="p-2">
                  Total Hours: {summary.total_hours}h
                </Badge>
                <Badge bg="info" className="p-2">
                  Total Amount: ₹{summary.total_amount}
                </Badge>
                <Badge bg="primary" className="p-2">
                  Days with OT: {summary.total_days}
                </Badge>
              </div>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      {/* Overtime Table */}
      <Card className="border-0 shadow-sm">
        <Card.Header className="bg-white py-2 py-md-3">
          <h6 className="mb-0 small">Daily Overtime Details</h6>
        </Card.Header>
        <Card.Body className="p-0">
          <div className="table-responsive" style={{ maxHeight: '400px', overflowY: 'auto' }}>
            <PaginatedTable as={Table} hover className="mb-0" size="sm">
              <thead className="bg-light sticky-top" style={{ top: 0 }}>
                <tr>
                  <th className="small">Date</th>
                  <th className="small d-none d-sm-table-cell">Day</th>
                  <th className="small text-center">OT Hours</th>
                  <th className="small text-center d-none d-md-table-cell">OT Minutes</th>
                  <th className="small text-end">Amount</th>
                  <th className="small text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {overtimeData.length > 0 ? (
                  overtimeData.map((record, index) => {
                    const date = new Date(record.attendance_date);
                    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
                    
                    return (
                      <tr key={index}>
                        <td className="small">
                          <span className="text-nowrap">{formatDate(record.attendance_date)}</span>
                        </td>
                        <td className="small d-none d-sm-table-cell">{dayName}</td>
                        <td className="small text-center">
                          <Badge bg="success" pill className="text-nowrap">
                            {record.overtime_hours}h
                          </Badge>
                        </td>
                        <td className="small text-center d-none d-md-table-cell">{record.overtime_minutes} min</td>
                        <td className="small text-end fw-bold text-success text-nowrap">
                          ₹{record.overtime_amount}
                        </td>
                        <td className="small text-center">
                          {record.is_paid ? (
                            <Badge bg="success" pill className="text-nowrap">Paid</Badge>
                          ) : (
                            <Badge bg="warning" pill className="text-nowrap">Pending</Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="6" className="text-center py-5">
                      <FaClock size={40} className="text-muted mb-3 opacity-50" />
                      <h6 className="text-muted small">No overtime records found</h6>
                      <p className="text-muted small mb-0">
                        You haven't worked any overtime this month
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </PaginatedTable>
          </div>
        </Card.Body>
      </Card>

      {/* Summary Card */}
      {summary.total_hours > 0 && (
        <Card className="border-0 shadow-sm mt-4 bg-light">
          <Card.Body className="p-2 p-md-3">
            <Row className="g-3">
              <Col xs={6} md={3}>
                <small className="text-muted d-block">OT Hours</small>
                <h6 className="text-success mb-0">{summary.total_hours}h</h6>
              </Col>
              <Col xs={6} md={3}>
                <small className="text-muted d-block">OT Minutes</small>
                <h6 className="text-primary mb-0">{summary.total_minutes} min</h6>
              </Col>
              <Col xs={6} md={3}>
                <small className="text-muted d-block">OT Amount</small>
                <h6 className="text-info mb-0">₹{summary.total_amount}</h6>
              </Col>
              <Col xs={6} md={3}>
                <small className="text-muted d-block">Rate/Hour</small>
                <h6 className="text-warning mb-0">₹150</h6>
              </Col>
            </Row>
            <Row className="mt-3">
              <Col xs={12}>
                <small className="text-muted d-flex align-items-start">
                  <FaTrophy className="me-1 text-warning mt-1 flex-shrink-0" size={12} />
                  <span className="text-wrap">
                    Overtime is calculated only for complete hours worked beyond your 9-hour shift.
                    Partial hours do not count towards overtime.
                  </span>
                </small>
              </Col>
            </Row>
          </Card.Body>
        </Card>
      )}
    </div>
  );
};

export default OvertimeSummary;