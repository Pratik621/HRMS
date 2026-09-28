// src/components/Employee/Profile.jsx
import React, { useState, useEffect, useRef } from 'react';
import {
    Row, Col, Badge, Spinner, Alert, Table,
    ProgressBar, ListGroup
} from 'react-bootstrap';
import {
    FaUserCircle,
    FaBriefcase,
    FaEnvelope,
    FaMapMarkerAlt,
    FaFileSignature,
    FaPhoneAlt,
    FaUmbrellaBeach,
    FaRupeeSign,
    FaCheckCircle,
    FaTimesCircle,
    FaHourglassHalf,
    FaHeartbeat,
    FaUniversity,
    FaFilePdf,
    FaEdit,
    FaInfoCircle,
    FaExclamationTriangle,
    FaTrophy,
    FaFileAlt,
    FaArrowLeft,
    FaCamera,
    FaTrash
} from 'react-icons/fa';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';
import HolidayCalendar from './HolidayCalendar';
import { useNavigate } from 'react-router-dom';

// ── Design tokens (indigo/enterprise palette — matches Leave Requests / Apply Leave) ──
const PF = {
    primary: '#4F46E5',
    success: '#10B981',
    warning: '#F59E0B',
    danger: '#EF4444',
    border: '#E5E7EB',
    borderSoft: '#EEF2F7',
};

const PF_CSS = `
.pf-card { background:#fff; border-radius:20px; border:1px solid ${PF.borderSoft}; box-shadow:0 10px 35px rgba(16,24,40,.06); }
.pf-card-header { padding:14px 18px; border-bottom:1px solid ${PF.borderSoft}; display:flex; align-items:center; gap:10px; }
.pf-icon-circle { width:34px; height:34px; border-radius:10px; display:flex; align-items:center; justify-content:center; flex-shrink:0; font-size:13px; }
.pf-tab-bar { display:flex; gap:6px; overflow-x:auto; padding:6px; background:#F8FAFC; border-radius:16px; border:1px solid ${PF.borderSoft}; }
.pf-tab { display:flex; align-items:center; gap:7px; padding:9px 16px; border-radius:11px; border:none; background:transparent; color:#667085; font-size:13px; font-weight:600; white-space:nowrap; cursor:pointer; transition:background .15s ease, color .15s ease; }
.pf-tab.active { background:${PF.primary}; color:#fff; box-shadow:0 4px 12px rgba(79,70,229,.28); }
.pf-tab:hover:not(.active) { background:#EEF2FF; color:${PF.primary}; }
.pf-avatar-wrap { position:relative; width:112px; height:112px; margin:0 auto; }
.pf-avatar-img { width:112px; height:112px; border-radius:50%; object-fit:cover; border:4px solid #EEF2FF; display:block; }
.pf-avatar-fallback { width:112px; height:112px; border-radius:50%; display:flex; align-items:center; justify-content:center; background:#F1F5F9; color:#94A3B8; border:4px solid #EEF2FF; }
.pf-avatar-edit-btn { position:absolute; bottom:2px; right:2px; width:34px; height:34px; border-radius:50%; background:${PF.primary}; color:#fff; border:3px solid #fff; display:flex; align-items:center; justify-content:center; cursor:pointer; box-shadow:0 4px 10px rgba(79,70,229,.35); }
.pf-avatar-edit-btn:hover { background:#4338CA; }
.pf-avatar-edit-btn:disabled { opacity:.6; cursor:not-allowed; }
.pf-pill { display:inline-flex; align-items:center; gap:5px; border-radius:999px; padding:5px 12px; font-size:11.5px; font-weight:700; white-space:nowrap; }
.pf-detail-row { display:flex; justify-content:space-between; align-items:center; gap:10px; padding:9px 0; border-bottom:1px solid #F5F6F8; font-size:13px; }
.pf-detail-row:last-child { border-bottom:none; }
.pf-btn-outline { display:inline-flex; align-items:center; gap:6px; background:#fff; border:1px solid ${PF.border}; color:#344054; border-radius:10px; padding:7px 14px; font-size:12.5px; font-weight:600; cursor:pointer; white-space:nowrap; }
.pf-btn-outline:hover { background:#F9FAFB; }
.pf-btn-outline:disabled { opacity:.6; cursor:not-allowed; }
.pf-btn-ghost-danger { display:inline-flex; align-items:center; gap:5px; background:transparent; border:none; color:${PF.danger}; font-size:11.5px; font-weight:600; cursor:pointer; padding:4px 6px; }
.pf-btn-ghost-danger:hover { text-decoration:underline; }
.pf-btn-primary { display:inline-flex; align-items:center; justify-content:center; gap:8px; background:linear-gradient(135deg,#4F46E5,#6366F1); color:#fff; border:none; border-radius:12px; padding:9px 18px; font-weight:600; font-size:13px; box-shadow:0 6px 16px rgba(79,70,229,.28); cursor:pointer; }
.pf-btn-primary:hover { color:#fff; }
.pf-stat-box { background:#F8FAFC; border-radius:14px; padding:14px; text-align:center; }
`;

const Profile = () => {
    const { user } = useAuth();
    const { employeeUpdate, clearEmployeeUpdate, showNotification } = useNotification();
    const navigate = useNavigate();
    const photoInputRef = useRef(null);

    const [employee, setEmployee] = useState(null);
    const [leaveBalance, setLeaveBalance] = useState({
        available: '0',
        total_accrued: '0',
        used: '0',
        pending: '0',
        comp_off_balance: '0',
        total_comp_off_earned: '0',
        total_comp_off_used: '0',
        completed_months_in_year: 0,
        message: '',
        is_eligible: false,
        months_completed: 0
    });
    const [compOffHistory, setCompOffHistory] = useState([]);
    const [leaveRequests, setLeaveRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [imageError, setImageError] = useState(false);
    const [activeTab, setActiveTab] = useState('personal');
    const [documentCount, setDocumentCount] = useState(0);
    const [uploadingPhoto, setUploadingPhoto] = useState(false);

    useEffect(() => {
        if (user?.employeeId) {
            fetchEmployeeProfile();
            fetchLeaveBalance();
            fetchCompOffHistory();
            fetchLeaveRequests();
            fetchDocumentCount();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.employeeId]);

    // Listen for employee updates
    useEffect(() => {
        if (employeeUpdate && employeeUpdate.employeeId === user?.employeeId) {
            fetchEmployeeProfile();
            fetchLeaveBalance();
            fetchCompOffHistory();
            clearEmployeeUpdate();
            showNotification('Your profile has been updated!', 'info');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [employeeUpdate, user?.employeeId]);

    const fetchEmployeeProfile = async () => {
        try {
            setLoading(true);

            const response = await axios.get(API_ENDPOINTS.EMPLOYEE_PROFILE(user?.employeeId));
            if (response.data) {
                setEmployee(response.data);
            }
        } catch (error) {
            console.error('Error fetching profile:', error);
            setError(error.response?.data?.message || 'Failed to load profile data');
            showNotification(error.response?.data?.message || 'Failed to load profile data', 'danger');
        } finally {
            setLoading(false);
        }
    };

    const fetchLeaveBalance = async () => {
        try {
            const response = await axios.get(API_ENDPOINTS.LEAVE_BALANCE(user?.employeeId));
            setLeaveBalance(response.data);
        } catch (error) {
            console.error('Error fetching leave balance:', error);
        }
    };

    const fetchCompOffHistory = async () => {
        try {
            const response = await axios.get(API_ENDPOINTS.COMP_OFF_HISTORY(user?.employeeId));
            setCompOffHistory(response.data.earnings || []);
        } catch (error) {
            console.error('Error fetching comp-off history:', error);
            setCompOffHistory([]);
        }
    };

    const fetchLeaveRequests = async () => {
        try {
            const response = await axios.get(API_ENDPOINTS.LEAVE_BY_EMPLOYEE(user?.employeeId));
            setLeaveRequests(response.data || []);
        } catch (error) {
            console.error('Error fetching leave requests:', error);
        }
    };

    const fetchDocumentCount = async () => {
        try {
            const response = await axios.get(API_ENDPOINTS.EMPLOYEE_DOCUMENTS(user?.employeeId));
            const docs = Object.values(response.data).filter(v => v && v !== 'null' && v !== '');
            setDocumentCount(docs.length);
        } catch (error) {
            console.error('Error fetching document count:', error);
        }
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    const formatShortDate = (dateString) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        });
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount || 0);
    };

    const getLeaveStatusBadge = (status) => {
        switch (status) {
            case 'approved':
                return <span className="pf-pill" style={{ background: 'rgba(16,185,129,.14)', color: '#047857' }}><FaCheckCircle size={10} /> Approved</span>;
            case 'pending':
                return <span className="pf-pill" style={{ background: 'rgba(245,158,11,.14)', color: '#b45309' }}><FaHourglassHalf size={10} /> Pending</span>;
            case 'rejected':
                return <span className="pf-pill" style={{ background: 'rgba(239,68,68,.14)', color: '#b91c1c' }}><FaTimesCircle size={10} /> Rejected</span>;
            default:
                return <span className="pf-pill" style={{ background: '#F1F5F9', color: '#475569' }}>Unknown</span>;
        }
    };

    const handleImageError = () => {
        setImageError(true);
    };

    const handleEditProfile = () => {
        navigate('/employee/update-requests');
    };

    const handlePhotoButtonClick = () => {
        photoInputRef.current?.click();
    };

    const handlePhotoSelected = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            showNotification('Please select an image file', 'warning');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            showNotification('Image must be smaller than 5MB', 'warning');
            return;
        }

        setUploadingPhoto(true);
        try {
            const formData = new FormData();
            formData.append('profile_image', file);

            const response = await axios.post(
                API_ENDPOINTS.EMPLOYEE_DOCUMENTS(user.employeeId),
                formData,
                { headers: { 'Content-Type': 'multipart/form-data' } }
            );

            setImageError(false);
            setEmployee(prev => ({ ...prev, profile_image: response.data?.documents?.profile_image || 'uploaded' }));
            showNotification('Profile photo updated!', 'success');
            fetchDocumentCount();
        } catch (error) {
            console.error('Error uploading profile photo:', error);
            showNotification(error.response?.data?.message || 'Failed to upload profile photo', 'danger');
        } finally {
            setUploadingPhoto(false);
        }
    };

    const handleRemovePhoto = async () => {
        setUploadingPhoto(true);
        try {
            await axios.delete(API_ENDPOINTS.EMPLOYEE_DOCUMENT_DELETE(user.employeeId, 'profile_image'));
            setEmployee(prev => ({ ...prev, profile_image: null }));
            setImageError(false);
            showNotification('Profile photo removed', 'success');
            fetchDocumentCount();
        } catch (error) {
            console.error('Error removing profile photo:', error);
            showNotification(error.response?.data?.message || 'Failed to remove profile photo', 'danger');
        } finally {
            setUploadingPhoto(false);
        }
    };

    const calculateLeavePercentage = () => {
        const used = parseFloat(leaveBalance.used) || 0;
        const total = parseFloat(leaveBalance.total_accrued) || 1;
        return (used / total * 100).toFixed(1);
    };

    if (loading) {
        return (
            <div className="d-flex justify-content-center align-items-center min-vh-100">
                <div className="text-center">
                    <Spinner animation="border" variant="primary" style={{ width: '3rem', height: '3rem' }} />
                    <p className="mt-3 text-muted small">Loading profile...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <Alert variant="danger" className="m-3 m-md-4" onClose={() => setError('')} dismissible>
                <div className="d-flex align-items-center">
                    <FaExclamationTriangle className="me-2 flex-shrink-0" />
                    <span className="small">{error}</span>
                </div>
            </Alert>
        );
    }

    if (!employee) {
        return (
            <Alert variant="warning" className="m-3 m-md-4">
                <div className="d-flex align-items-center">
                    <FaInfoCircle className="me-2 flex-shrink-0" />
                    <span className="small">No employee data found. Please contact admin.</span>
                </div>
            </Alert>
        );
    }

    const TABS = [
        { key: 'personal', label: 'Personal', icon: <FaUserCircle size={13} /> },
        { key: 'leave', label: 'Leave', icon: <FaUmbrellaBeach size={13} /> },
        { key: 'comp-off', label: 'Comp-Off', icon: <FaTrophy size={13} /> },
        { key: 'bank', label: 'Bank', icon: <FaUniversity size={13} /> },
        { key: 'salary', label: 'Salary', icon: <FaRupeeSign size={13} /> },
        { key: 'policy', label: 'Contract', icon: <FaFileSignature size={13} /> },
    ];

    return (
        <div className="p-2 p-md-3 p-lg-4" style={{ backgroundColor: '#F8FAFC', minHeight: '100vh' }}>
            <style>{PF_CSS}</style>

            {/* Header */}
            <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center mb-4 gap-3">
                <h5 className="mb-0 d-flex align-items-center fw-bold">
                    <FaUserCircle className="me-2" style={{ color: PF.primary }} />
                    My Profile
                </h5>
                <div className="d-flex flex-wrap gap-2 ms-0 ms-md-auto">
                    <span className="pf-pill" style={{ background: '#101828', color: '#fff' }}>
                        ID: {employee.employee_id}
                    </span>
                    <button className="pf-btn-outline" onClick={handleEditProfile}>
                        <FaEdit size={12} /> Update Profile
                    </button>
                    <button className="pf-btn-outline" onClick={() => navigate(-1)}>
                        <FaArrowLeft size={12} /> Back
                    </button>
                </div>
            </div>

            {/* Tab bar */}
            <div className="pf-tab-bar mb-3">
                {TABS.map(tab => (
                    <button
                        key={tab.key}
                        className={`pf-tab ${activeTab === tab.key ? 'active' : ''}`}
                        onClick={() => setActiveTab(tab.key)}
                    >
                        {tab.icon} {tab.label}
                    </button>
                ))}
            </div>

            {/* Personal Tab */}
            {activeTab === 'personal' && (
                <Row className="g-3">
                    {/* Profile Picture Card */}
                    <Col lg={4}>
                        <div className="pf-card text-center p-3 p-md-4 h-100">
                            <input
                                type="file"
                                accept="image/*"
                                ref={photoInputRef}
                                onChange={handlePhotoSelected}
                                style={{ display: 'none' }}
                            />

                            <div className="pf-avatar-wrap mb-3">
                                {employee.profile_image && !imageError ? (
                                    <img
                                        src={employee.profile_image}
                                        alt="Profile"
                                        className="pf-avatar-img"
                                        onError={handleImageError}
                                    />
                                ) : (
                                    <div className="pf-avatar-fallback">
                                        <FaUserCircle size={64} />
                                    </div>
                                )}
                                <button
                                    className="pf-avatar-edit-btn"
                                    onClick={handlePhotoButtonClick}
                                    disabled={uploadingPhoto}
                                    title="Update profile photo"
                                >
                                    {uploadingPhoto ? <Spinner animation="border" size="sm" style={{ width: 14, height: 14 }} /> : <FaCamera size={13} />}
                                </button>
                            </div>

                            <div className="d-flex justify-content-center gap-3 mb-3">
                                <button className="pf-btn-outline" onClick={handlePhotoButtonClick} disabled={uploadingPhoto}>
                                    <FaCamera size={11} /> Update Profile Photo
                                </button>
                            </div>
                            {employee.profile_image && !imageError && (
                                <button className="pf-btn-ghost-danger mb-3" onClick={handleRemovePhoto} disabled={uploadingPhoto} style={{ marginTop: -8 }}>
                                    <FaTrash size={10} /> Remove Photo
                                </button>
                            )}

                            <h6 className="mb-1 text-truncate fw-bold">
                                {employee.first_name} {employee.middle_name} {employee.last_name}
                            </h6>
                            <p className="text-muted small mb-2 text-truncate">{employee.designation}</p>
                            <span className="pf-pill mb-3 d-inline-flex" style={{ background: 'rgba(37,99,235,.12)', color: '#1D4ED8' }}>
                                {employee.employment_type}
                            </span>

                            <div className="text-start mt-3">
                                <ListGroup variant="flush" className="border-0">
                                    <ListGroup.Item className="px-0 py-1 border-0 bg-transparent d-flex align-items-center">
                                        <FaEnvelope style={{ color: PF.primary }} className="me-2 flex-shrink-0" size={12} />
                                        <small className="text-truncate">{employee.email}</small>
                                    </ListGroup.Item>
                                    {employee.phone && (
                                        <ListGroup.Item className="px-0 py-1 border-0 bg-transparent d-flex align-items-center">
                                            <FaPhoneAlt style={{ color: PF.primary }} className="me-2 flex-shrink-0" size={12} />
                                            <small className="text-truncate">{employee.phone}</small>
                                        </ListGroup.Item>
                                    )}
                                    {employee.emergency_contact && (
                                        <ListGroup.Item className="px-0 py-1 border-0 bg-transparent d-flex align-items-center">
                                            <FaHeartbeat className="text-danger me-2 flex-shrink-0" size={12} />
                                            <small className="text-truncate">Emergency: {employee.emergency_contact}</small>
                                        </ListGroup.Item>
                                    )}
                                </ListGroup>
                            </div>

                            <div className="mt-3">
                                <small className="text-muted d-block mb-1">Documents Uploaded:</small>
                                <span className="pf-pill" style={{ background: 'rgba(16,185,129,.14)', color: '#047857' }}>
                                    <FaFilePdf size={12} />
                                    {documentCount} Documents
                                </span>
                            </div>
                        </div>
                    </Col>

                    {/* Personal Details */}
                    <Col lg={8}>
                        <Row className="g-3">
                            <Col md={6}>
                                <div className="pf-card mb-3">
                                    <div className="pf-card-header">
                                        <div className="pf-icon-circle" style={{ background: 'rgba(79,70,229,.12)', color: PF.primary }}>
                                            <FaUserCircle size={14} />
                                        </div>
                                        <h6 className="mb-0 small fw-bold">Personal Details</h6>
                                    </div>
                                    <div className="p-3">
                                        <div className="pf-detail-row">
                                            <span className="text-muted">Full Name</span>
                                            <span className="fw-semibold text-end">{employee.first_name} {employee.middle_name} {employee.last_name}</span>
                                        </div>
                                        <div className="pf-detail-row">
                                            <span className="text-muted">Date of Birth</span>
                                            <span className="fw-semibold">{formatDate(employee.dob)}</span>
                                        </div>
                                        <div className="pf-detail-row">
                                            <span className="text-muted">Blood Group</span>
                                            <span className="pf-pill" style={{ background: 'rgba(239,68,68,.12)', color: '#B91C1C' }}>
                                                {employee.blood_group || 'N/A'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </Col>

                            <Col md={6}>
                                <div className="pf-card mb-3">
                                    <div className="pf-card-header">
                                        <div className="pf-icon-circle" style={{ background: 'rgba(79,70,229,.12)', color: PF.primary }}>
                                            <FaBriefcase size={13} />
                                        </div>
                                        <h6 className="mb-0 small fw-bold">Employment Details</h6>
                                    </div>
                                    <div className="p-3">
                                        <div className="pf-detail-row">
                                            <span className="text-muted">Department</span>
                                            <span className="fw-semibold text-end">{employee.department}</span>
                                        </div>
                                        <div className="pf-detail-row">
                                            <span className="text-muted">Designation</span>
                                            <span className="fw-semibold text-end">{employee.designation}</span>
                                        </div>
                                        <div className="pf-detail-row">
                                            <span className="text-muted">Joining Date</span>
                                            <span className="fw-semibold text-end">{formatDate(employee.joining_date)}</span>
                                        </div>
                                        <div className="pf-detail-row">
                                            <span className="text-muted">Reporting Manager</span>
                                            <span className="fw-semibold text-end">{employee.reporting_manager || 'N/A'}</span>
                                        </div>
                                        <div className="pf-detail-row">
                                            <span className="text-muted">Shift Timing</span>
                                            <span className="fw-semibold text-end">{employee.shift_timing || '9:00 AM - 6:00 PM'}</span>
                                        </div>
                                    </div>
                                </div>
                            </Col>
                        </Row>

                        {/* Address Card */}
                        {employee.address && (
                            <div className="pf-card">
                                <div className="pf-card-header">
                                    <div className="pf-icon-circle" style={{ background: 'rgba(79,70,229,.12)', color: PF.primary }}>
                                        <FaMapMarkerAlt size={13} />
                                    </div>
                                    <h6 className="mb-0 small fw-bold">Address</h6>
                                </div>
                                <div className="p-3">
                                    <p className="mb-0 small">{employee.address}</p>
                                    {(employee.city || employee.state || employee.pincode) && (
                                        <small className="text-muted d-block mt-1">
                                            {[employee.city, employee.state, employee.pincode].filter(Boolean).join(', ')}
                                        </small>
                                    )}
                                </div>
                            </div>
                        )}
                    </Col>
                </Row>
            )}

            {/* Leave Tab */}
            {activeTab === 'leave' && (
                <Row className="g-3">
                    <Col lg={4}>
                        <div className="pf-card">
                            <div className="pf-card-header">
                                <div className="pf-icon-circle" style={{ background: 'rgba(79,70,229,.12)', color: PF.primary }}>
                                    <FaUmbrellaBeach size={13} />
                                </div>
                                <h6 className="mb-0 small fw-bold">Leave Balance</h6>
                            </div>
                            <div className="p-3">
                                {parseFloat(leaveBalance.comp_off_balance) > 0 && (
                                    <div className="pf-stat-box mb-3">
                                        <FaTrophy color="#7C3AED" size={22} className="mb-2" />
                                        <h5 className="fw-bold mb-0" style={{ color: '#7C3AED' }}>{leaveBalance.comp_off_balance}</h5>
                                        <p className="text-muted small mb-1">Comp-Off Days</p>
                                        <span className="pf-pill" style={{ background: 'rgba(124,58,237,.14)', color: '#7C3AED' }}>
                                            Earned by working on holidays
                                        </span>
                                    </div>
                                )}

                                <div className="text-center mb-3">
                                    <h2 className="fw-bold mb-0" style={{ color: leaveBalance.is_probation_complete ? PF.primary : '#0EA5E9', fontSize: 40 }}>
                                        {leaveBalance.is_probation_complete ? leaveBalance.available : '0'}
                                    </h2>
                                    <p className="text-muted small mb-0">
                                        {leaveBalance.is_probation_complete ? 'Available Leaves' : 'Leaves Available'}
                                    </p>
                                    {!leaveBalance.is_probation_complete && (
                                        <div className="mt-2">
                                            <span className="pf-pill mb-1 d-inline-flex" style={{ background: 'rgba(14,165,233,.14)', color: '#0369A1' }}>
                                                Total Accrued: {leaveBalance.total_accrued} days
                                            </span>
                                            <div className="small text-muted mt-1">
                                                <FaInfoCircle className="me-1" size={10} />
                                                You have earned {leaveBalance.total_accrued} leaves during probation.
                                                These will be available for use after probation completion.
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="mb-3">
                                    <div className="pf-detail-row">
                                        <span className="text-muted">Total Accrued</span>
                                        <span className="fw-semibold">{leaveBalance.total_accrued} days</span>
                                    </div>
                                    <div className="pf-detail-row">
                                        <span className="text-muted">Used</span>
                                        <span className="fw-semibold" style={{ color: PF.danger }}>{leaveBalance.used} days</span>
                                    </div>
                                    <div className="pf-detail-row">
                                        <span className="text-muted">Pending</span>
                                        <span className="fw-semibold" style={{ color: PF.warning }}>{leaveBalance.pending} days</span>
                                    </div>

                                    {parseFloat(leaveBalance.total_comp_off_earned) > 0 && (
                                        <>
                                            <div className="pf-detail-row">
                                                <span className="text-muted"><FaTrophy className="me-1" style={{ color: '#7C3AED' }} size={10} />Comp-Off Earned</span>
                                                <span className="fw-semibold">{leaveBalance.total_comp_off_earned || 0}</span>
                                            </div>
                                            <div className="pf-detail-row">
                                                <span className="text-muted"><FaTrophy className="me-1" style={{ color: '#7C3AED' }} size={10} />Comp-Off Used</span>
                                                <span className="fw-semibold">{leaveBalance.total_comp_off_used || 0}</span>
                                            </div>
                                        </>
                                    )}

                                    <div className="pf-detail-row">
                                        <span className="text-muted">Months Completed (this year)</span>
                                        <span className="fw-semibold">{leaveBalance.completed_months_in_year || 0}</span>
                                    </div>

                                    {leaveBalance.message && (
                                        <Alert variant="info" className="p-2 small mb-2 mt-2">
                                            <FaInfoCircle className="me-2" size={10} />
                                            {leaveBalance.message}
                                        </Alert>
                                    )}

                                    <ProgressBar
                                        now={parseFloat(calculateLeavePercentage())}
                                        variant="success"
                                        style={{ height: '8px', borderRadius: 999 }}
                                        className="mb-1 mt-2"
                                    />
                                    <small className="text-muted d-block text-center">
                                        {calculateLeavePercentage()}% used
                                    </small>
                                </div>

                                <button className="pf-btn-primary w-100" onClick={() => navigate('/apply-leave')}>
                                    Apply for Leave
                                </button>
                            </div>
                        </div>
                    </Col>

                    <Col lg={8}>
                        <div className="pf-card">
                            <div className="pf-card-header d-flex justify-content-between align-items-center">
                                <div className="d-flex align-items-center gap-2">
                                    <div className="pf-icon-circle" style={{ background: 'rgba(79,70,229,.12)', color: PF.primary }}>
                                        <FaFileAlt size={13} />
                                    </div>
                                    <h6 className="mb-0 small fw-bold">Leave History</h6>
                                </div>
                                <span className="pf-pill" style={{ background: '#101828', color: '#fff' }}>
                                    {leaveRequests.length} Records
                                </span>
                            </div>
                            <div className="p-0">
                                {leaveRequests.length > 0 ? (
                                    <div className="table-responsive" style={{ maxHeight: '340px', overflowY: 'auto' }}>
                                        <Table hover size="sm" className="mb-0">
                                            <thead className="bg-light sticky-top" style={{ top: 0, zIndex: 10 }}>
                                                <tr>
                                                    <th className="small text-dark">Leave Type</th>
                                                    <th className="small text-dark d-none d-sm-table-cell">Duration</th>
                                                    <th className="small text-dark">Date Range</th>
                                                    <th className="small text-dark d-none d-md-table-cell">Days</th>
                                                    <th className="small text-dark">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {leaveRequests.map((leave, index) => (
                                                    <tr key={leave.id || index}>
                                                        <td className="small">
                                                            <span className="pf-pill" style={{ background: leave.leave_type === 'Comp-Off' ? 'rgba(124,58,237,.14)' : '#F1F5F9', color: leave.leave_type === 'Comp-Off' ? '#7C3AED' : '#475569' }}>
                                                                {leave.leave_type === 'Comp-Off' && '🎉 '}
                                                                {leave.leave_type}
                                                            </span>
                                                        </td>
                                                        <td className="small d-none d-sm-table-cell">{leave.leave_duration || 'Full Day'}</td>
                                                        <td className="small">
                                                            <span className="text-nowrap">{formatShortDate(leave.start_date)}</span>
                                                            {leave.start_date !== leave.end_date && (
                                                                <span className="text-nowrap d-block d-sm-inline"> - {formatShortDate(leave.end_date)}</span>
                                                            )}
                                                        </td>
                                                        <td className="small fw-bold d-none d-md-table-cell">{leave.days_count || 1}</td>
                                                        <td className="small">{getLeaveStatusBadge(leave.status)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </Table>
                                    </div>
                                ) : (
                                    <div className="text-center py-4">
                                        <FaUmbrellaBeach size={40} className="text-muted mb-3 opacity-50" />
                                        <p className="text-muted small mb-0">No leave requests found</p>
                                        <button className="pf-btn-outline mt-2" onClick={() => navigate('/apply-leave')}>
                                            Apply for your first leave
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </Col>
                </Row>
            )}

            {/* Comp-Off Tab */}
            {activeTab === 'comp-off' && (
                <Row>
                    <Col md={12}>
                        <div className="pf-card">
                            <div className="pf-card-header d-flex justify-content-between align-items-center">
                                <div className="d-flex align-items-center gap-2">
                                    <div className="pf-icon-circle" style={{ background: 'rgba(124,58,237,.12)', color: '#7C3AED' }}>
                                        <FaTrophy size={13} />
                                    </div>
                                    <h6 className="mb-0 small fw-bold">Comp-Off Earnings History</h6>
                                </div>
                                <span className="pf-pill" style={{ background: 'rgba(124,58,237,.14)', color: '#7C3AED' }}>
                                    Balance: {leaveBalance.comp_off_balance} days
                                </span>
                            </div>
                            <div className="p-0">
                                {compOffHistory.length > 0 ? (
                                    <div className="table-responsive" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                                        <Table hover size="sm" className="mb-0">
                                            <thead className="bg-light sticky-top" style={{ top: 0, zIndex: 10 }}>
                                                <tr>
                                                    <th className="small text-dark">Sr No</th>
                                                    <th className="small text-dark d-none d-sm-table-cell">Holiday Date</th>
                                                    <th className="small text-dark">Holiday</th>
                                                    <th className="small text-dark d-none d-md-table-cell">Hours Worked</th>
                                                    <th className="small text-dark d-none d-md-table-cell">Expires On</th>
                                                    <th className="small text-dark">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {compOffHistory.map((item, index) => (
                                                    <tr key={item.id || index}>
                                                        <td className="small">{index + 1}</td>
                                                        <td className="small d-none d-sm-table-cell">{formatDate(item.attendance_date)}</td>
                                                        <td className="small">
                                                            <span className="pf-pill" style={{ background: 'rgba(14,165,233,.14)', color: '#0369A1' }}>
                                                                {item.holiday_name}
                                                            </span>
                                                        </td>
                                                        <td className="small d-none d-md-table-cell">{item.hours_worked} hrs</td>
                                                        <td className="small d-none d-md-table-cell">
                                                            {item.expiry_date ? formatDate(item.expiry_date) : '-'}
                                                        </td>
                                                        <td className="small">
                                                            {item.status === 'used' ? (
                                                                <span className="pf-pill" style={{ background: '#F1F5F9', color: '#475569' }}>Used</span>
                                                            ) : item.status === 'expired' ? (
                                                                <span className="pf-pill" style={{ background: 'rgba(239,68,68,.14)', color: '#B91C1C' }}>Expired</span>
                                                            ) : (
                                                                <span className="pf-pill" style={{ background: 'rgba(16,185,129,.14)', color: '#047857' }}>Available</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </Table>
                                    </div>
                                ) : (
                                    <div className="text-center py-5">
                                        <FaTrophy size={50} className="text-muted mb-3 opacity-50" />
                                        <h6 className="text-muted">No Comp-Off earnings yet</h6>
                                        <p className="text-muted small mb-0">
                                            Work on holidays to earn Comp-Off days!
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </Col>
                </Row>
            )}

            {/* Bank Tab */}
            {activeTab === 'bank' && (
                <div className="pf-card">
                    <div className="pf-card-header">
                        <div className="pf-icon-circle" style={{ background: 'rgba(79,70,229,.12)', color: PF.primary }}>
                            <FaUniversity size={13} />
                        </div>
                        <h6 className="mb-0 small fw-bold">Bank Details & ID Proofs</h6>
                    </div>
                    <div className="p-3">
                        <Row className="g-3">
                            <Col md={6}>
                                <div className="pf-detail-row">
                                    <span className="text-muted">Account Name</span>
                                    <span className="fw-semibold text-end">{employee.bank_account_name || 'N/A'}</span>
                                </div>
                                <div className="pf-detail-row">
                                    <span className="text-muted">Account Number</span>
                                    <span className="fw-semibold text-end">
                                        {employee.account_number ? '••••' + employee.account_number.slice(-4) : 'N/A'}
                                    </span>
                                </div>
                                <div className="pf-detail-row">
                                    <span className="text-muted">IFSC Code</span>
                                    <span className="fw-semibold text-end">{employee.ifsc_code || 'N/A'}</span>
                                </div>
                            </Col>
                            <Col md={6}>
                                <div className="pf-detail-row">
                                    <span className="text-muted">Branch Name</span>
                                    <span className="fw-semibold text-end">{employee.branch_name || 'N/A'}</span>
                                </div>
                                <div className="pf-detail-row">
                                    <span className="text-muted">PAN Number</span>
                                    <span className="fw-semibold text-end">
                                        {employee.pan_number ? '•••••' + employee.pan_number.slice(-4) : 'N/A'}
                                    </span>
                                </div>
                                <div className="pf-detail-row">
                                    <span className="text-muted d-flex align-items-center">
                                        <FaFileAlt className="me-1" style={{ color: PF.primary }} size={12} />
                                        Aadhar Card
                                    </span>
                                    <span className="fw-semibold text-end">
                                        {employee.aadhar_number ? (
                                            <>
                                                {employee.aadhar_number.replace(/(\d{4})(\d{4})(\d{4})/, '$1-****-$3')}
                                                <span className="pf-pill ms-2" style={{ background: 'rgba(16,185,129,.14)', color: '#047857', fontSize: 9 }}>
                                                    Verified
                                                </span>
                                            </>
                                        ) : (
                                            'Not Provided'
                                        )}
                                    </span>
                                </div>
                            </Col>
                        </Row>
                    </div>
                </div>
            )}

            {/* Salary Tab */}
            {activeTab === 'salary' && (
                <div className="pf-card">
                    <div className="pf-card-header">
                        <div className="pf-icon-circle" style={{ background: 'rgba(16,185,129,.12)', color: PF.success }}>
                            <FaRupeeSign size={13} />
                        </div>
                        <h6 className="mb-0 small fw-bold">Salary Information</h6>
                    </div>
                    <div className="p-3">
                        <Row className="g-3">
                            <Col sm={6}>
                                <div className="pf-stat-box">
                                    <small className="text-muted d-block mb-1">Gross Salary</small>
                                    <h5 className="mb-0 fw-bold" style={{ color: PF.primary }}>{formatCurrency(employee.gross_salary)}</h5>
                                </div>
                            </Col>
                            <Col sm={6}>
                                <div className="pf-stat-box">
                                    <small className="text-muted d-block mb-1">In-hand Salary</small>
                                    <h5 className="mb-0 fw-bold" style={{ color: PF.success }}>{formatCurrency(employee.in_hand_salary)}</h5>
                                </div>
                            </Col>
                        </Row>
                        <Alert variant="info" className="py-2 small mb-0 mt-3">
                            <FaInfoCircle className="me-2 flex-shrink-0" size={10} />
                            Monthly Deduction: ₹200 (Fixed)
                        </Alert>
                    </div>
                </div>
            )}

            {/* Policy Tab */}
            {activeTab === 'policy' && (
                <div className="pf-card">
                    <div className="pf-card-header">
                        <div className="pf-icon-circle" style={{ background: 'rgba(79,70,229,.12)', color: PF.primary }}>
                            <FaFileSignature size={13} />
                        </div>
                        <h6 className="mb-0 small fw-bold">Employment Contract Policy</h6>
                    </div>
                    <div className="p-3">
                        {employee.contract_policy ? (
                            <div
                                className="p-2 p-md-3 rounded"
                                style={{
                                    background: '#F8FAFC',
                                    maxHeight: '400px',
                                    overflowY: 'auto',
                                    fontSize: '0.85rem',
                                    whiteSpace: 'pre-line',
                                    fontFamily: 'monospace'
                                }}
                            >
                                {employee.contract_policy}
                            </div>
                        ) : (
                            <div className="text-center py-4">
                                <FaFileSignature size={40} className="text-muted mb-3 opacity-50" />
                                <p className="text-muted small mb-0">No contract policy found</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Holiday Calendar */}
            <div className="mt-3">
                <HolidayCalendar employeeRegion={employee.region || 'All'} />
            </div>
        </div>
    );
};

export default Profile;
