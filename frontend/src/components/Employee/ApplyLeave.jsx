import { getNextBirthday } from '../../utils/nextBirthday';
import { getHalfDayOptions } from '../../utils/halfDayOptions';
import { calculateLeaveDays } from '../../utils/leaveDays';
// src/components/Employee/ApplyLeave.jsx
import React, { useState, useEffect } from 'react';
import {
  Form, Button, Row, Col, Alert,
  Spinner, ProgressBar, Modal
} from 'react-bootstrap';
import {
  FaCalendarAlt,
  FaPaperPlane,
  FaTimes,
  FaInfoCircle,
  FaClock,
  FaCheckCircle,
  FaExclamationTriangle,
  FaHourglassHalf,
  FaTrophy,
  FaArrowLeft,
  FaShieldAlt,
  FaUsers,
  FaUserCircle,
  FaFileAlt,
  FaBriefcase
} from 'react-icons/fa';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';
import { useNavigate } from 'react-router-dom';
import './ApplyLeave.css';

// Dashboard-aligned presentation palette.
const AL = {
  primary: '#1f4e79',
  success: '#168a70',
  warning: '#c05621',
  danger: '#c53030',
  border: '#E5E7EB',
  borderSoft: '#EEF2F7',
};

// Mirrors backend/config/leavePolicy.js PAID_LEAVE_ELIGIBILITY_MONTHS — display-only,
// the backend remains the authority on actual eligibility (is_eligible / eligible_from_date).
const PAID_LEAVE_ELIGIBILITY_MONTHS = 3;

const STATUS_META = Object.fromEntries(['pending', 'approved', 'rejected'].map(status => [status, { bg: '#f1f5f9', color: '#475569' }]));

const ApplyLeave = () => {
  const { user } = useAuth();
  const { showNotification } = useNotification();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [leaveBalance, setLeaveBalance] = useState({
    available: 0,
    total_accrued: 0,
    used: 0,
    pending: 0,
    comp_off_balance: 0,
    months_completed: 0,
    is_eligible: false,
    eligible_from_date: ''
  });
  const [recentLeaves, setRecentLeaves] = useState([]);
  const [allLeaves, setAllLeaves] = useState([]);
  const [showAllRecent, setShowAllRecent] = useState(false);
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [employeeDetails, setEmployeeDetails] = useState({
    joining_date: '',
    reporting_manager: '',
    dob: ''
  });
  const [formData, setFormData] = useState({
    leave_type: 'Unpaid',
    leave_duration: 'Full Day',
    half_day_type: '',
    start_date: '',
    end_date: '',
    reason: '',
    reporting_manager: ''
  });
  const [calculatedDays, setCalculatedDays] = useState(1);
  const [errors, setErrors] = useState({});

  const getUpcomingBirthday = () => getNextBirthday(employeeDetails.dob, employeeDetails.joining_date);

  const getAvailableLeaveTypes = () => {
    const types = [];

    // Always show Comp-Off if balance > 0
    if (leaveBalance.comp_off_balance > 0) {
      types.push({
        value: 'Comp-Off',
        label: `Comp-Off (${leaveBalance.comp_off_balance} days available)`,
        icon: '🎉',
        color: 'purple'
      });
    }

    // Always show Unpaid Leave
    types.push({ value: 'Unpaid', label: 'Unpaid Leave', icon: '💰' });

    // Birthday Leave — always available (no probation restriction)
    if (employeeDetails.dob) {
      const birthdayDate = getUpcomingBirthday();
      const formatted = birthdayDate
        ? new Date(birthdayDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })
        : '';
      types.push({
        value: 'Birthday',
        label: `Birthday Leave${formatted ? ` (${formatted})` : ''}`,
        icon: '🎂',
        birthday_date: birthdayDate
      });
    }

    // Only show paid leaves if probation is complete
    const isProbationComplete = leaveBalance.is_probation_complete || leaveBalance.is_eligible;

    if (isProbationComplete) {
      types.push(
        { value: 'Annual', label: 'Annual Leave', icon: '🌴' },
        { value: 'Sick', label: 'Sick Leave', icon: '🤒' },
        { value: 'Personal', label: 'Personal Leave', icon: '👤' },
        { value: 'Maternity', label: 'Maternity Leave', icon: '🤱' },
        { value: 'Paternity', label: 'Paternity Leave', icon: '👨‍👧' },
        { value: 'Bereavement', label: 'Bereavement Leave', icon: '💐' }
      );
    }

    return types;
  };

  const halfDayOptions = getHalfDayOptions(employeeDetails.shift_timing);

  useEffect(() => {
    if (user?.employeeId) {
      // Add timeout to prevent infinite loading
      const timeoutId = setTimeout(() => {
        if (loading) {
          console.log('Loading timeout - forcing stop');
          setLoading(false);
          showNotification('Loading took too long. Please refresh.', 'warning');
        }
      }, 10000);

      Promise.all([
        fetchEmployeeDetails(),
        fetchLeaveBalance(),
        fetchRecentLeaves()
      ]).finally(() => {
        clearTimeout(timeoutId);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    calculateDays();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.start_date, formData.end_date, formData.leave_duration]);

  useEffect(() => {
    // Reset leave type based on eligibility when balance updates
    if (!leaveBalance.is_eligible && !leaveBalance.is_probation_complete) {
      if (leaveBalance.comp_off_balance > 0) {
        setFormData(prev => ({
          ...prev,
          leave_type: 'Comp-Off'
        }));
      } else {
        setFormData(prev => ({
          ...prev,
          leave_type: 'Unpaid'
        }));
      }
    } else if (leaveBalance.is_eligible || leaveBalance.is_probation_complete) {
      // If eligible, default to Annual leave
      setFormData(prev => ({
        ...prev,
        leave_type: 'Annual'
      }));
    }
  }, [leaveBalance.is_eligible, leaveBalance.is_probation_complete, leaveBalance.comp_off_balance]);

  // Auto-fill & lock dates when Birthday leave is selected
  useEffect(() => {
    if (formData.leave_type === 'Birthday' && employeeDetails.dob) {
      const bd = getUpcomingBirthday();
      setFormData(prev => ({
        ...prev,
        leave_duration: 'Full Day',
        start_date: bd,
        end_date: bd,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.leave_type, employeeDetails.dob, employeeDetails.joining_date]);

  const fetchEmployeeDetails = async () => {
    try {
      const response = await axios.get(API_ENDPOINTS.EMPLOYEE_PROFILE(user.employeeId));

      // Eligibility month-math lives only on the backend (leaveController.getLeaveBalance) —
      // this component trusts leaveBalance.months_completed / is_eligible instead of
      // re-deriving it here.
      setEmployeeDetails({
        joining_date: response.data.joining_date,
        reporting_manager: response.data.reporting_manager || '',
        dob: response.data.dob || '',
        shift_timing: response.data.shift_timing || ''
      });

      // Auto-select the employee's assigned reporting manager
      if (response.data.reporting_manager) {
        setFormData(prev => ({
          ...prev,
          reporting_manager: response.data.reporting_manager
        }));
      }

    } catch (error) {
      console.error('Error fetching employee details:', error);
      setEmployeeDetails({
        joining_date: '',
        reporting_manager: ''
      });
    }
  };

  const fetchLeaveBalance = async () => {
    try {
      setLoading(true);
      const response = await axios.get(API_ENDPOINTS.LEAVE_BALANCE(user?.employeeId));

      const isProbationComplete = response.data.is_probation_complete === true || response.data.is_eligible === true;
      setLeaveBalance({
        available: parseFloat(response.data.available) || 0,
        total_accrued: parseFloat(response.data.total_accrued) || 0,
        used: parseFloat(response.data.used) || 0,
        pending: parseFloat(response.data.pending) || 0,
        unpaid_used: parseFloat(response.data.unpaid_used) || 0,
        unpaid_pending: parseFloat(response.data.unpaid_pending) || 0,
        comp_off_balance: parseFloat(response.data.comp_off_balance) || 0,
        total_comp_off_earned: parseFloat(response.data.total_comp_off_earned) || 0,
        total_comp_off_used: parseFloat(response.data.total_comp_off_used) || 0,
        completed_months_in_year: response.data.accrual_info?.months_this_year || 0,
        message: response.data.message || '',
        is_eligible: isProbationComplete,
        months_completed: response.data.total_months_from_joining || 0,
        is_probation_complete: isProbationComplete,
        eligible_from_date: response.data.eligible_from_date || ''
      });

      setLoading(false);

    } catch (error) {
      console.error('❌ Error fetching leave balance:', error);
      setLeaveBalance({
        available: 0,
        total_accrued: 0,
        used: 0,
        pending: 0,
        comp_off_balance: 0,
        total_comp_off_earned: 0,
        total_comp_off_used: 0,
        completed_months_in_year: 0,
        message: 'Failed to load leave balance',
        is_eligible: false,
        months_completed: 0,
        is_probation_complete: false,
        eligible_from_date: ''
      });
      setLoading(false);
      showNotification(error.response?.data?.message || 'Failed to load leave balance', 'danger');
    }
  };

  const fetchRecentLeaves = async () => {
    try {
      const response = await axios.get(API_ENDPOINTS.LEAVE_BY_EMPLOYEE(user.employeeId));
      const leaves = response.data || [];
      setAllLeaves(leaves);
      setRecentLeaves(leaves.slice(0, 3));
    } catch (error) {
      console.error('Error fetching recent leaves:', error);
    }
  };

  const calculateDays = () => {
    if (!formData.start_date) {
      setCalculatedDays(0);
      return;
    }

    const start = new Date(formData.start_date);
    const end = new Date(formData.end_date);

    if (start > end) {
      setErrors(prev => ({
        ...prev,
        end_date: 'End date cannot be before start date'
      }));
      setCalculatedDays(0);
      return;
    }

    setCalculatedDays(calculateLeaveDays(
      formData.start_date, formData.end_date || formData.start_date, formData.leave_duration
    ));
    setErrors(prev => ({ ...prev, end_date: '' }));
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }

    if (name === 'leave_duration' && value === 'Half Day') {
      setFormData(prev => ({
        ...prev,
        end_date: prev.start_date || ''
      }));
    }

    if (name === 'start_date' && formData.leave_duration === 'Full Day' && !formData.end_date) {
      setFormData(prev => ({
        ...prev,
        end_date: value
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.leave_type) {
      newErrors.leave_type = 'Please select leave type';
    }

    if (!formData.start_date) {
      newErrors.start_date = 'Start date is required';
    }

    if (formData.start_date && employeeDetails.joining_date && formData.start_date < employeeDetails.joining_date.slice(0, 10)) {
      newErrors.start_date = 'Leave cannot start before your joining date.';
    }

    if (formData.leave_duration === 'Half Day' && !formData.half_day_type) {
      newErrors.half_day_type = 'Please select which half';
    }

    if (formData.leave_duration === 'Full Day' && !formData.end_date) {
      newErrors.end_date = 'End date is required';
    }

    if (formData.start_date && formData.end_date && formData.start_date > formData.end_date) {
      newErrors.end_date = 'End date cannot be before start date';
    }

    if (formData.start_date && calculatedDays === 0) {
      newErrors.start_date = 'Select at least one working day. Saturdays and Sundays are excluded.';
    }

    const trimmedReason = formData.reason.trim();
    if (!trimmedReason) {
      newErrors.reason = 'Reason is required';
    } else if (trimmedReason.length < 10) {
      newErrors.reason = 'Reason must be at least 10 characters';
    } else if (trimmedReason.length > 500) {
      newErrors.reason = 'Reason must be 500 characters or fewer';
    }

    if (!formData.reporting_manager || !formData.reporting_manager.trim()) {
      newErrors.reporting_manager = 'No reporting manager is assigned. Please contact HR to update your profile.';
    }

    if (formData.leave_type === 'Birthday') {
      if (employeeDetails.dob) {
        const bd = getUpcomingBirthday();
        if (formData.start_date !== bd) {
          newErrors.start_date = `Birthday leave must be on your birthday (${new Date(bd + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })})`;
        }
      }
    } else if (formData.leave_type === 'Comp-Off') {
      if (calculatedDays > leaveBalance.comp_off_balance) {
        newErrors.balance = `Insufficient Comp-Off balance. Available: ${leaveBalance.comp_off_balance} days`;
      }
    } else if (leaveBalance.is_eligible && formData.leave_type !== 'Unpaid') {
      if (calculatedDays > leaveBalance.available) {
        newErrors.balance = `Insufficient leave balance. Available: ${leaveBalance.available} days`;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      showNotification('Please fix the errors in the form', 'warning');
      return;
    }

    setSubmitting(true);

    try {
      const leaveData = {
        ...formData,
        reason: formData.reason.trim(),
        employee_id: user.employeeId,
        days_count: calculatedDays,
        applied_date: new Date().toISOString().split('T')[0]
      };

      const response = await axios.post(API_ENDPOINTS.LEAVE_APPLY, leaveData);

      if (response.data.success) {
        showNotification(
          formData.leave_type === 'Comp-Off'
            ? 'Comp-Off request submitted successfully!'
            : 'Leave request submitted successfully!',
          'success'
        );

        setFormData({
          leave_type: leaveBalance.is_eligible ? 'Annual' : (leaveBalance.comp_off_balance > 0 ? 'Comp-Off' : 'Unpaid'),
          leave_duration: 'Full Day',
          half_day_type: '',
          start_date: '',
          end_date: '',
          reason: '',
          reporting_manager: employeeDetails.reporting_manager
        });

        await fetchLeaveBalance();
        await fetchRecentLeaves();

        setTimeout(() => {
          navigate('/employee/dashboard');
        }, 2000);
      }
    } catch (error) {
      console.error('Error submitting leave:', error);
      showNotification(
        error.response?.data?.message || 'Failed to submit leave request',
        'danger'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    navigate('/employee/dashboard');
  };

  const getLeaveBalanceColor = () => {
    if (!leaveBalance.is_eligible) return 'secondary';
    const percentage = (leaveBalance.used / leaveBalance.total_accrued) * 100;
    if (percentage >= 80) return 'danger';
    if (percentage >= 50) return 'warning';
    return 'success';
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatJoiningDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const calculateProgressToEligibility = () => {
    return Math.min(100, (leaveBalance.months_completed / PAID_LEAVE_ELIGIBILITY_MONTHS) * 100);
  };

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center min-vh-100">
        <div className="text-center">
          <Spinner animation="border" variant="primary" />
          <p className="mt-3 text-muted small">Loading leave application...</p>
        </div>
      </div>
    );
  }

  const availableLeaveTypes = getAvailableLeaveTypes();
  const displayedRecent = showAllRecent ? allLeaves : recentLeaves;

  return (
    <div className="al-page p-3 p-md-4">
      <div className="al-page-header">
        <div><span className="al-eyebrow">EMPLOYEE WORKSPACE</span><h1>Apply for leave</h1><p>Submit your request and review your available balance.</p></div>
        <button type="button" className="al-btn-outline" onClick={() => navigate(-1)}><FaArrowLeft size={12} /> Back</button>
      </div>

      {/* Row 2: Leave Request Form + Leave Balance */}
      <Row className="g-3">
        <Col lg={8}>
          <div className="al-card">
            <div className="d-flex flex-column flex-sm-row align-items-start align-items-sm-center justify-content-between p-3 al-card-header gap-2">
              <div className="d-flex align-items-center gap-2">
                <div className="al-icon-circle" style={{ background: 'rgba(79,70,229,.12)', color: AL.primary }}>
                  <FaFileAlt size={15} />
                </div>
                <div>
                  <h6 className="mb-0 fw-bold">Leave Request Form</h6>
                  <div className="text-muted" style={{ fontSize: 12.5 }}>Fill in the details to apply for leave</div>
                </div>
              </div>
              <div className="d-flex gap-2">
                <button type="button" className="al-btn-outline" onClick={handleCancel}>
                  <FaTimes size={11} /> Cancel
                </button>
                <button type="button" className="al-btn-outline" onClick={() => navigate(-1)}>
                  <FaArrowLeft size={11} /> Back
                </button>
              </div>
            </div>

            <div className="p-3">
              {/* Probation Status Alert */}
              {!leaveBalance.is_probation_complete && (
                <Alert variant="info" className="mb-4 py-2">
                  <div className="d-flex align-items-start">
                    <FaInfoCircle className="me-3 text-primary mt-1 flex-shrink-0" size={20} />
                    <div>
                      <h6 className="alert-heading mb-1 small">Probation Period</h6>
                      <p className="mb-0 small">
                        You are currently in your probation period.
                        {leaveBalance.comp_off_balance > 0 && (
                          <> You have <strong>{leaveBalance.comp_off_balance} Comp-Off days</strong> available from working on holidays.</>
                        )}
                        {' '}After completing {PAID_LEAVE_ELIGIBILITY_MONTHS} months (from {leaveBalance.eligible_from_date || 'N/A'}), all leave types will be available.
                      </p>
                    </div>
                  </div>
                </Alert>
              )}

              {/* Comp-Off Info Alert */}
              {leaveBalance.comp_off_balance > 0 && (
                <Alert variant="purple" className="mb-4 py-2" style={{ backgroundColor: '#f3e8ff', borderColor: '#d6b4ff' }}>
                  <div className="d-flex align-items-start">
                    <FaTrophy className="me-3 text-purple mt-1 flex-shrink-0" size={20} />
                    <div>
                      <h6 className="alert-heading mb-1 small">Comp-Off available</h6>
                      <p className="mb-0 small">
                        You have <strong>{leaveBalance.comp_off_balance} Comp-Off day(s)</strong> earned by working on holidays.
                        You can use these like regular leaves, even during probation.
                      </p>
                    </div>
                  </div>
                </Alert>
              )}

              {/* Eligibility Progress Bar - Only show during probation */}
              {!leaveBalance.is_eligible && (
                <div className="mb-4">
                  <div className="d-flex justify-content-between mb-1 small">
                    <span className="text-muted">Progress to eligibility:</span>
                    <span className="fw-semibold">{leaveBalance.months_completed} / {PAID_LEAVE_ELIGIBILITY_MONTHS} months</span>
                  </div>
                  <ProgressBar
                    now={calculateProgressToEligibility()}
                    variant="info"
                    style={{ height: '8px' }}
                  />
                  <small className="text-muted d-block mt-1">
                    Eligible from: {leaveBalance.eligible_from_date || 'N/A'}
                  </small>
                </div>
              )}

              <Form onSubmit={handleSubmit}>
                <Row className="g-3 mb-1">
                  {/* Leave Type */}
                  <Col xs={12} md={6}>
                    <Form.Group>
                      <Form.Label className="small fw-semibold text-muted">
                        Leave Type <span className="text-danger">*</span>
                      </Form.Label>
                      <div className="al-select-icon-wrap">
                        <Form.Select
                          name="leave_type"
                          value={formData.leave_type}
                          onChange={handleChange}
                          size="sm"
                          className="al-select"
                          isInvalid={!!errors.leave_type}
                        >
                          {availableLeaveTypes.map(type => (
                            <option key={type.value} value={type.value}>
                              {type.label}
                            </option>
                          ))}
                        </Form.Select>
                      </div>
                      {errors.leave_type && (
                        <Form.Control.Feedback type="invalid" className="d-block">
                          {errors.leave_type}
                        </Form.Control.Feedback>
                      )}
                    </Form.Group>
                  </Col>

                  {/* Leave Duration */}
                  <Col xs={12} md={6}>
                    <Form.Group>
                      <Form.Label className="small fw-semibold text-muted d-block">
                        Leave Duration <span className="text-danger">*</span>
                      </Form.Label>
                      <div className="d-flex align-items-center gap-4 al-radio" style={{ height: 31 }}>
                        <Form.Check
                          type="radio"
                          label="Full Day"
                          name="leave_duration"
                          value="Full Day"
                          checked={formData.leave_duration === 'Full Day'}
                          onChange={handleChange}
                          id="full-day-radio"
                        />
                        <Form.Check
                          type="radio"
                          label="Half Day"
                          name="leave_duration"
                          value="Half Day"
                          disabled={formData.leave_type === 'Birthday'}
                          checked={formData.leave_duration === 'Half Day'}
                          onChange={handleChange}
                          id="half-day-radio"
                        />
                      </div>
                    </Form.Group>
                  </Col>
                </Row>

                {/* Half Day Type */}
                {formData.leave_duration === 'Half Day' && (
                  <Form.Group className="mb-3">
                    <Form.Label className="small fw-semibold text-muted">
                      Select Half <span className="text-danger">*</span>
                    </Form.Label>
                    <Form.Select
                      name="half_day_type"
                      value={formData.half_day_type}
                      onChange={handleChange}
                      size="sm"
                      className="al-select"
                      isInvalid={!!errors.half_day_type}
                    >
                      <option value="">Choose which half...</option>
                      {halfDayOptions.map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Form.Select>
                    {errors.half_day_type && (
                      <Form.Control.Feedback type="invalid">
                        {errors.half_day_type}
                      </Form.Control.Feedback>
                    )}
                  </Form.Group>
                )}

                {formData.leave_type === 'Comp-Off' && (
                  <Form.Text className="text-purple small d-block mb-3">
                    <FaTrophy className="me-1" size={10} />
                    Using Comp-Off leave - this won't affect your regular leave balance
                  </Form.Text>
                )}
                {formData.leave_type === 'Birthday' && (
                  <div className="mb-3 px-3 py-2 rounded-3 d-flex align-items-start gap-2"
                    style={{ background: '#fef9c3', border: '1px solid #fde047' }}>
                    <span style={{ fontSize: 18 }}>🎂</span>
                    <div>
                      <div className="fw-semibold small" style={{ color: '#854d0e' }}>Birthday Leave</div>
                      <div className="small" style={{ color: '#713f12' }}>
                        This is a paid day off on your birthday — no balance will be deducted.
                        {getUpcomingBirthday() && (
                          <span> Your eligible birthday: <strong>{new Date(getUpcomingBirthday() + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>.</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Date Range */}
                <Row className="g-3 mb-3">
                  <Col sm={6}>
                    <Form.Group>
                      <Form.Label className="small fw-semibold text-muted">
                        Start Date <span className="text-danger">*</span>
                      </Form.Label>
                      <Form.Control
                        type="date"
                        name="start_date"
                        min={employeeDetails.joining_date?.slice(0, 10) || undefined}
                        value={formData.start_date}
                        onChange={handleChange}
                        size="sm"
                        className="al-form-control"
                        isInvalid={!!errors.start_date}
                        readOnly={formData.leave_type === 'Birthday'}
                        style={formData.leave_type === 'Birthday' ? { background: '#f0fdf4', cursor: 'not-allowed' } : {}}
                      />
                      {errors.start_date && (
                        <Form.Control.Feedback type="invalid" className="d-block">
                          {errors.start_date}
                        </Form.Control.Feedback>
                      )}
                    </Form.Group>
                  </Col>
                  <Col sm={6}>
                    <Form.Group>
                      <Form.Label className="small fw-semibold text-muted">
                        {formData.leave_duration === 'Half Day' ? 'Date' : 'End Date'}
                        {formData.leave_duration === 'Full Day' && <span className="text-danger">*</span>}
                      </Form.Label>
                      <Form.Control
                        type="date"
                        name="end_date"
                        value={formData.end_date}
                        onChange={handleChange}
                        size="sm"
                        className="al-form-control"
                        isInvalid={!!errors.end_date}
                        disabled={formData.leave_duration === 'Half Day' || formData.leave_type === 'Birthday'}
                        min={formData.start_date || undefined}
                        style={formData.leave_type === 'Birthday' ? { background: '#f0fdf4', cursor: 'not-allowed' } : {}}
                      />
                      {errors.end_date && (
                        <Form.Control.Feedback type="invalid" className="d-block">
                          {errors.end_date}
                        </Form.Control.Feedback>
                      )}
                    </Form.Group>
                  </Col>
                </Row>

                {/* Reason */}
                <Form.Group className="mb-3">
                  <Form.Label className="small fw-semibold text-muted">
                    Reason for Leave <span className="text-danger">*</span>
                  </Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={4}
                    name="reason"
                    maxLength={500}
                    value={formData.reason}
                    onChange={handleChange}
                    size="sm"
                    className="al-textarea"
                    placeholder="Please provide detailed reason for your leave request..."
                    isInvalid={!!errors.reason}
                  />
                  {errors.reason && (
                    <Form.Control.Feedback type="invalid" className="d-block">
                      {errors.reason}
                    </Form.Control.Feedback>
                  )}
                  <Form.Text className="text-muted small">
                    {formData.reason.length}/500 characters
                  </Form.Text>
                </Form.Group>

                {/* Reporting Manager */}
                <Form.Group className="mb-4">
                  <Form.Label className="small fw-semibold text-muted">
                    Reporting Manager <span className="text-danger">*</span>
                  </Form.Label>
                  <Form.Control
                    type="text"
                    name="reporting_manager"
                    value={formData.reporting_manager}
                    placeholder="No reporting manager assigned"
                    disabled
                    className="al-form-control"
                    isInvalid={!!errors.reporting_manager}
                    aria-describedby="reporting-manager-help"
                  />
                  {errors.reporting_manager && (
                    <Form.Control.Feedback type="invalid" className="d-block">
                      {errors.reporting_manager}
                    </Form.Control.Feedback>
                  )}
                  <Form.Text id="reporting-manager-help" className="text-muted small">
                    {formData.reporting_manager
                      ? 'Assigned from your profile. Your request will be sent to this manager for approval.'
                      : 'Please contact HR to assign your reporting manager before applying for leave.'}
                  </Form.Text>
                </Form.Group>

                {/* Balance Error */}
                {errors.balance && (
                  <Alert variant="danger" className="py-2 small">
                    <FaExclamationTriangle className="me-2 flex-shrink-0" />
                    {errors.balance}
                  </Alert>
                )}

                {/* Submit Buttons */}
                <div className="d-flex flex-wrap gap-2">
                  <button type="submit" className="al-btn-primary" disabled={submitting}>
                    {submitting ? (
                      <>
                        <Spinner size="sm" animation="border" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <FaPaperPlane size={12} />
                        Submit Request
                      </>
                    )}
                  </button>
                  <button type="button" className="al-btn-outline px-4" onClick={handleCancel}>
                    Cancel
                  </button>
                </div>
              </Form>
            </div>
          </div>
        </Col>

        {/* Right Column - Leave Balance */}
        <Col lg={4}>
          <div className="al-card">
            <div className="d-flex align-items-center gap-2 p-3 al-card-header">
              <div className="al-icon-circle" style={{ background: 'rgba(79,70,229,.12)', color: AL.primary }}>
                <FaBriefcase size={14} />
              </div>
              <h6 className="mb-0 fw-bold">Your Leave Balance</h6>
            </div>
            <div className="p-3">
              {/* Status Banner */}
              <div
                className="al-balance-banner mb-3"
                style={{ background: leaveBalance.is_probation_complete ? 'rgba(16,185,129,.08)' : 'rgba(79,70,229,.08)' }}
              >
                {leaveBalance.is_probation_complete ? (
                  <>
                    <div className="al-balance-icon-check" style={{ background: 'rgba(16,185,129,.15)' }}>
                      <FaCheckCircle color={AL.success} size={18} />
                    </div>
                    <p className="small fw-semibold mb-0" style={{ color: AL.success }}>Probation Completed</p>
                    <p className="small text-muted mt-1 mb-0">All leave types available</p>
                  </>
                ) : (
                  <>
                    <div className="al-balance-icon-check" style={{ background: 'rgba(79,70,229,.15)' }}>
                      <FaHourglassHalf color={AL.primary} size={18} />
                    </div>
                    <p className="small fw-semibold mb-0" style={{ color: AL.primary }}>Probation Period</p>
                    <p className="small text-muted mt-1 mb-0">
                      {leaveBalance.comp_off_balance > 0
                        ? 'Comp-Off & Unpaid Leave available'
                        : 'Only Unpaid Leave available'}
                    </p>
                  </>
                )}
              </div>

              {/* Comp-Off Balance Display */}
              {leaveBalance.comp_off_balance > 0 && (
                <div className="al-balance-banner mb-3" style={{ background: 'rgba(124,58,237,.08)' }}>
                  <FaTrophy color="#64748b" size={20} className="mb-2" />
                  <h5 className="fw-bold mb-0" style={{ color: '#475569' }}>{leaveBalance.comp_off_balance}</h5>
                  <p className="text-muted small mb-0">Comp-Off Days Available</p>
                  <span className="al-status-pill mt-1 d-inline-flex" style={{ background: 'rgba(124,58,237,.14)', color: '#475569' }}>
                    Earned by working on holidays
                  </span>
                </div>
              )}

              {/* Regular Leave Balance */}
              <div className="text-center mb-3">
                <h2 className="fw-bold mb-0" style={{ color: leaveBalance.is_probation_complete ? AL.primary : '#98A2B3', fontSize: 40 }}>
                  {leaveBalance.is_probation_complete ? leaveBalance.available : '0'}
                </h2>
                <p className="text-muted small mb-0">
                  {leaveBalance.is_probation_complete ? 'Available Leaves' : 'Leaves Available (During Probation)'}
                </p>
                {!leaveBalance.is_probation_complete && (
                  <>
                    <span className="al-status-pill mt-2 d-inline-flex" style={{ background: 'rgba(79,70,229,.12)', color: AL.primary }}>
                      Accrued: {leaveBalance.total_accrued} days (usable after probation)
                    </span>
                    <div className="mt-2 small text-muted">
                      <FaInfoCircle className="me-1" size={10} />
                      You have earned {leaveBalance.total_accrued} leaves, but can only use them after completing {PAID_LEAVE_ELIGIBILITY_MONTHS} months.
                    </div>
                  </>
                )}
              </div>

              {/* Leave Balance Details */}
              <div className="mb-3">
                <div className="d-flex justify-content-between mb-2 small">
                  <span className="text-muted">Total Accrued:</span>
                  <span className="fw-semibold">{leaveBalance.total_accrued} days</span>
                </div>
                <div className="d-flex justify-content-between mb-2 small">
                  <span className="text-muted">Used (Paid):</span>
                  <span className="fw-semibold">{leaveBalance.used} days</span>
                </div>
                <div className="d-flex justify-content-between mb-2 small">
                  <span className="text-muted">Pending (Paid):</span>
                  <span className="fw-semibold">{leaveBalance.pending} days</span>
                </div>
                {(leaveBalance.unpaid_used > 0 || leaveBalance.unpaid_pending > 0) && (
                  <>
                    <div className="d-flex justify-content-between mb-2 small">
                      <span style={{ color: AL.danger }}>Unpaid Used:</span>
                      <span className="fw-semibold" style={{ color: AL.danger }}>{leaveBalance.unpaid_used} days</span>
                    </div>
                    {leaveBalance.unpaid_pending > 0 && (
                      <div className="d-flex justify-content-between mb-2 small">
                        <span style={{ color: AL.warning }}>Unpaid Pending:</span>
                        <span className="fw-semibold" style={{ color: AL.warning }}>{leaveBalance.unpaid_pending} days</span>
                      </div>
                    )}
                  </>
                )}

                {leaveBalance.total_accrued > 0 && (
                  <>
                    <ProgressBar
                      now={(leaveBalance.used / leaveBalance.total_accrued) * 100}
                      variant={getLeaveBalanceColor()}
                      style={{ height: '8px', borderRadius: 999 }}
                    />
                    <small className="text-muted d-block text-center mt-1">
                      {((leaveBalance.used / leaveBalance.total_accrued) * 100 || 0).toFixed(1)}% used
                    </small>
                  </>
                )}
              </div>

              {/* Days Calculation Preview */}
              {calculatedDays > 0 && (
                <Alert variant="info" className="py-2 small mb-0">
                  <div className="d-flex align-items-start">
                    <FaClock className="me-2 mt-1 flex-shrink-0" />
                    <div>
                      <span>This request is for <strong>{calculatedDays} day{calculatedDays > 1 ? 's' : ''}</strong> (excluding Saturdays and Sundays)</span>
                      {formData.leave_type === 'Comp-Off' ? (
                        <>
                          <br />
                          <small className="d-block">Comp-Off balance after request: <strong>{(leaveBalance.comp_off_balance - calculatedDays).toFixed(1)}</strong> days</small>
                        </>
                      ) : leaveBalance.is_eligible && formData.leave_type !== 'Unpaid' ? (
                        <>
                          <br />
                          <small className="d-block">Balance after request: <strong>{(leaveBalance.available - calculatedDays).toFixed(1)}</strong> days</small>
                        </>
                      ) : (
                        <>
                          <br />
                          <small className="text-muted d-block">Unpaid Leave - No deduction from balance</small>
                        </>
                      )}
                    </div>
                  </div>
                </Alert>
              )}

              {/* Joining Info */}
              <div className="mt-3 pt-3 small text-muted" style={{ borderTop: `1px solid ${AL.borderSoft}` }}>
                <p className="mb-1">
                  <strong>Joining Date:</strong> {formatJoiningDate(employeeDetails.joining_date)}
                </p>
                <p className="mb-1">
                  <strong>Months Completed:</strong> {leaveBalance.months_completed} / {PAID_LEAVE_ELIGIBILITY_MONTHS}
                </p>
                {!leaveBalance.is_eligible ? (
                  <p className="mb-0" style={{ color: AL.primary }}>
                    <strong>Probation ends:</strong> {leaveBalance.eligible_from_date || 'N/A'}
                  </p>
                ) : (
                  <p className="mb-0" style={{ color: AL.success }}>
                    <strong>Probation completed on:</strong> {leaveBalance.eligible_from_date}
                  </p>
                )}
              </div>
            </div>
          </div>
        </Col>
      </Row>

      {/* Leave Policy Modal (full detail, includes items not shown in the compact card) */}
      {/* Row 1: Recent Requests + Leave Policy */}
      <Row className="g-3 mt-4">
        <Col lg={6}>
          <div className="al-card h-100">
            <div className="d-flex align-items-center justify-content-between p-3 al-card-header">
              <div className="d-flex align-items-center gap-2">
                <div className="al-icon-circle" style={{ background: 'rgba(79,70,229,.12)', color: AL.primary }}>
                  <FaCalendarAlt size={15} />
                </div>
                <h6 className="mb-0 fw-bold">Recent Requests</h6>
              </div>
              {allLeaves.length > 3 && (
                <button className="al-btn-outline" onClick={() => setShowAllRecent(v => !v)}>
                  {showAllRecent ? 'Show Less' : 'View All'}
                </button>
              )}
            </div>
            <div className="p-3">
              {displayedRecent.length === 0 ? (
                <div className="text-muted text-center small py-4">No leave requests yet</div>
              ) : (
                <div style={showAllRecent ? { maxHeight: 320, overflowY: 'auto' } : {}}>
                  {displayedRecent.map((leave, idx) => {
                    const status = STATUS_META[leave.status] || STATUS_META.pending;
                    return (
                      <div key={leave.id || idx} className="al-recent-row">
                        <div className="al-recent-icon">
                          <FaCalendarAlt aria-hidden="true" />
                        </div>
                        <div className="flex-grow-1 overflow-hidden">
                          <div className="fw-semibold small">{leave.leave_type}</div>
                          <div className="text-muted text-truncate" style={{ fontSize: 12 }}>
                            {formatDate(leave.start_date)}
                            {leave.start_date !== leave.end_date && ` - ${formatDate(leave.end_date)}`}
                          </div>
                        </div>
                        <span className="al-status-pill" style={{ background: status.bg, color: status.color }}>
                          {leave.status}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </Col>

        <Col lg={6}>
          <div className="al-card h-100">
            <div className="d-flex align-items-center justify-content-between p-3 al-card-header">
              <div className="d-flex align-items-center gap-2">
                <div className="al-icon-circle" style={{ background: 'rgba(79,70,229,.12)', color: AL.primary }}>
                  <FaShieldAlt size={14} />
                </div>
                <h6 className="mb-0 fw-bold">Leave Policy</h6>
              </div>
              <button className="al-btn-outline" onClick={() => setShowPolicyModal(true)}>
                View Policy
              </button>
            </div>
            <div className="p-3">
              <Row className="g-3">
                <Col xs={12} md={4}>
                  <div className="al-policy-icon" style={{ background: '#E0E7FF', color: AL.primary }}>
                    <FaCalendarAlt size={13} />
                  </div>
                  <div className="fw-semibold small mt-2">Comp-Off Leave</div>
                  <ul className="al-policy-list">
                    <li>Earned by working on holidays (8+ hours)</li>
                    <li>1 holiday work = 1 Comp-Off day</li>
                    <li>Can be used during probation period</li>
                    <li>Valid for 90 days from earning</li>
                  </ul>
                </Col>
                <Col xs={12} md={4}>
                  <div className="al-policy-icon" style={{ background: '#DCFCE7', color: '#15803D' }}>
                    <FaUsers size={13} />
                  </div>
                  <div className="fw-semibold small mt-2">
                    During Probation <span className="text-muted fw-normal">(First {PAID_LEAVE_ELIGIBILITY_MONTHS} months)</span>
                  </div>
                  <ul className="al-policy-list">
                    <li>Comp-Off and Unpaid Leave available</li>
                    <li>Regular leaves accrue but cannot be used</li>
                  </ul>
                </Col>
                <Col xs={12} md={4}>
                  <div className="al-policy-icon" style={{ background: '#DBEAFE', color: '#1D4ED8' }}>
                    <FaUserCircle size={13} />
                  </div>
                  <div className="fw-semibold small mt-2">
                    After Probation <span className="text-muted fw-normal">({PAID_LEAVE_ELIGIBILITY_MONTHS}+ months)</span>
                  </div>
                  <ul className="al-policy-list">
                    <li>All leave types become available</li>
                    <li>Annual leaves: 2 days/month (24 days/year)</li>
                  </ul>
                </Col>
              </Row>
            </div>
          </div>
        </Col>
      </Row>

      <Modal className="al-modal" show={showPolicyModal} onHide={() => setShowPolicyModal(false)} centered size="lg">
        <Modal.Header closeButton style={{ background: AL.primary, color: '#fff' }}>
          <Modal.Title as="h6" className="mb-0 small fw-semibold d-flex align-items-center">
            <FaShieldAlt className="me-2" size={13} /> Leave Policy
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="p-3">
          <ul className="small text-muted ps-3 mb-0">
            <li>
              <strong>Comp-Off Leave:</strong>
              <ul className="ps-3 mt-1">
                <li>Earned by working on holidays (8+ hours)</li>
                <li>1 holiday work = 1 Comp-Off day</li>
                <li>Can be used during probation period</li>
                <li>Valid for 90 days from earning</li>
              </ul>
            </li>
            <li className="mt-2">
              <strong>During Probation (First {PAID_LEAVE_ELIGIBILITY_MONTHS} months):</strong>
              <ul className="ps-3 mt-1">
                <li>Comp-Off and Unpaid Leave available</li>
                <li>Regular leaves accrue but cannot be used</li>
              </ul>
            </li>
            <li className="mt-2">
              <strong>After Probation ({PAID_LEAVE_ELIGIBILITY_MONTHS}+ months):</strong>
              <ul className="ps-3 mt-1">
                <li>All leave types become available</li>
                <li>Annual leaves: 2 days/month (24 days/year)</li>
              </ul>
            </li>
            <li className="mt-2">Submit at least 3 days in advance</li>
            <li>Medical leaves require doctor's note</li>
          </ul>
        </Modal.Body>
        <Modal.Footer className="py-2">
          <Button variant="secondary" size="sm" onClick={() => setShowPolicyModal(false)}>Close</Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default ApplyLeave;
