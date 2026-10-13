import PaginatedTable from '../Common/PaginatedTable';
// src/components/Admin/LeaveRequests.jsx
import React, { useState, useEffect } from 'react';
import {
  Table,
  Card,
  Button,
  Modal,
  Form,
  Row,
  Col,
  Alert,
  Spinner
} from 'react-bootstrap';
import {
  FaCheck,
  FaTimes,
  FaEye,
  FaCalendarAlt,
  FaClock,
  FaCheckCircle,
  FaTimesCircle,
  FaFilter,
  FaSearch,
  FaExclamationTriangle,
  FaUserCircle,
  FaBriefcase,
  FaInfoCircle,
  FaChartBar,
  FaArrowLeft,
  FaPlus,
  FaDownload,
  FaChevronLeft,
  FaChevronRight,
  FaLeaf
} from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';
import * as XLSX from 'xlsx';

// ── Design tokens (local to this page — indigo/enterprise palette per spec) ───
const LR = {
  primary: "#1f4e79",
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  border: '#E5E7EB',
  borderSoft: '#EEF2F7',
};

const LEAVE_TYPES = ['Annual', 'Sick', 'Personal', 'Maternity', 'Paternity', 'Bereavement', 'Unpaid', 'Comp-Off', 'Birthday'];

const TYPE_STYLES = {
  Birthday:     { background: LR.primary, color: '#fff', border: `1px solid ${LR.primary}`, icon: <FaCalendarAlt size={10} /> },
  Annual:       { background: '#fff', color: LR.primary, border: `1.5px solid ${LR.primary}` },
  Sick:         { background: 'rgba(16,185,129,.12)', color: '#059669', border: '1px solid rgba(16,185,129,.3)' },
  Personal:     { background: 'rgba(79,70,229,.10)', color: LR.primary, border: '1px solid rgba(79,70,229,.25)' },
  Maternity:    { background: 'rgba(245,158,11,.14)', color: '#b45309', border: '1px solid rgba(245,158,11,.3)' },
  Paternity:    { background: 'rgba(245,158,11,.14)', color: '#b45309', border: '1px solid rgba(245,158,11,.3)' },
  Bereavement:  { background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' },
  Unpaid:       { background: LR.danger, color: '#fff', border: `1px solid ${LR.danger}` },
  'Comp-Off':   { background: 'rgba(139,92,246,.14)', color: '#7c3aed', border: '1px solid rgba(139,92,246,.3)' },
};

const STATUS_STYLES = {
  pending:  { background: 'rgba(245,158,11,.14)', color: '#b45309', border: '1px solid rgba(245,158,11,.3)', icon: <FaClock size={10} /> },
  approved: { background: 'rgba(16,185,129,.14)', color: '#047857', border: '1px solid rgba(16,185,129,.3)', icon: <FaCheckCircle size={10} /> },
  rejected: { background: 'rgba(239,68,68,.14)', color: '#b91c1c', border: '1px solid rgba(239,68,68,.3)', icon: <FaTimesCircle size={10} /> },
};

const AVATAR_COLORS = ["#1f4e79", '#059669', '#d97706', '#dc2626', '#0891b2', '#7c3aed', '#db2777'];
const avatarColor = (str) => AVATAR_COLORS[((str || '').charCodeAt(0) || 0) % AVATAR_COLORS.length];

// Shows the employee's uploaded profile photo when available, falling back to the
// colored-initials circle (same indigo palette as the rest of this page) otherwise.
const LeaveAvatar = ({ photo, firstName, lastName }) => {
  const [error, setError] = useState(false);
  if (photo && !error) {
    return (
      <img
        src={photo}
        alt=""
        onError={() => setError(true)}
        className="lr-avatar"
        style={{ objectFit: 'cover' }}
      />
    );
  }
  return (
    <div className="lr-avatar" style={{ background: avatarColor(firstName) }}>
      {initials(firstName, lastName)}
    </div>
  );
};
const initials = (f, l) => ((f || '')[0] || '?').toUpperCase() + ((l || '')[0] || '').toUpperCase();

const LR_CSS = `
.lr-card { background:#fff; border-radius:20px; border:1px solid ${LR.borderSoft}; box-shadow:0 10px 35px rgba(16,24,40,.06); }
.lr-header-card { background:#fff; border-radius:20px; border:1px solid ${LR.borderSoft}; box-shadow:0 10px 35px rgba(16,24,40,.06); padding:24px 28px; }
.lr-stat-card { background:#fff; border-radius:18px; border:1px solid ${LR.borderSoft}; box-shadow:0 6px 20px rgba(16,24,40,.05); padding:18px; transition: transform .15s ease, box-shadow .15s ease; height:100%; }
.lr-stat-card:hover { transform: translateY(-3px); box-shadow:0 14px 30px rgba(16,24,40,.10); }
.lr-stat-icon { width:44px; height:44px; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:17px; flex-shrink:0; }
.lr-input-wrap { display:flex; align-items:center; gap:8px; background:#fff; border:1px solid ${LR.border}; border-radius:12px; padding:0 14px; height:48px; }
.lr-input { border:none; outline:none; background:transparent; font-size:13.5px; width:100%; height:100%; }
.lr-select { border:1px solid ${LR.border}; border-radius:12px; height:48px; padding:0 14px; font-size:13.5px; background:#fff; color:#344054; box-shadow:0 1px 2px rgba(16,24,40,.04); cursor:pointer; }
.lr-select-sm { border:1px solid ${LR.border}; border-radius:8px; padding:3px 8px; font-size:12.5px; background:#fff; }
.lr-btn-primary { display:inline-flex; align-items:center; justify-content:center; gap:8px; background:linear-gradient(135deg,#4F46E5,#6366F1); color:#fff; border:none; border-radius:12px; padding:11px 18px; font-weight:600; font-size:13.5px; box-shadow:0 6px 16px rgba(79,70,229,.28); cursor:pointer; transition:transform .12s ease, box-shadow .12s ease; white-space:nowrap; }
.lr-btn-primary:hover { transform:translateY(-1px); box-shadow:0 10px 22px rgba(79,70,229,.35); color:#fff; }
.lr-btn-primary:disabled { opacity:.6; cursor:not-allowed; transform:none; }
.lr-btn-outline { display:inline-flex; align-items:center; justify-content:center; gap:8px; background:#fff; color:#344054; border:1px solid ${LR.border}; border-radius:12px; padding:11px 18px; font-weight:600; font-size:13.5px; cursor:pointer; transition: background .12s ease; white-space:nowrap; }
.lr-btn-outline:hover { background:#F9FAFB; }
.lr-icon-btn { width:38px; height:38px; border-radius:50%; border:1px solid ${LR.border}; background:#fff; display:flex; align-items:center; justify-content:center; cursor:pointer; color:#475467; flex-shrink:0; }
.lr-icon-btn:hover { background:#F9FAFB; }
.lr-icon-btn-lg { width:48px; height:48px; border-radius:12px; border:1px solid ${LR.border}; background:#fff; display:flex; align-items:center; justify-content:center; cursor:pointer; color:${LR.primary}; box-shadow:0 1px 2px rgba(16,24,40,.04); flex-shrink:0; }
.lr-icon-btn-lg:hover { background:#EEF2FF; }
.lr-avatar { width:36px; height:36px; border-radius:50%; color:#fff; font-size:12px; font-weight:700; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.lr-action-btn { width:32px; height:32px; border-radius:50%; border:none; display:flex; align-items:center; justify-content:center; cursor:pointer; transition:transform .12s ease, background .12s ease; }
.lr-action-btn:hover { transform:scale(1.12); }
.lr-action-blue { background:rgba(79,70,229,.12); color:${LR.primary}; }
.lr-action-blue:hover { background:rgba(79,70,229,.2); }
.lr-action-green { background:rgba(16,185,129,.12); color:#059669; }
.lr-action-green:hover { background:rgba(16,185,129,.2); }
.lr-action-red { background:rgba(239,68,68,.12); color:#dc2626; }
.lr-action-red:hover { background:rgba(239,68,68,.2); }
.lr-page-btn { min-width:32px; height:32px; border-radius:8px; border:1px solid ${LR.border}; background:#fff; color:#344054; font-size:12.5px; cursor:pointer; }
.lr-page-btn.active { background:${LR.primary}; border-color:${LR.primary}; color:#fff; font-weight:700; }
.lr-page-btn:disabled { opacity:.45; cursor:not-allowed; }
.lr-date-panel { position:absolute; top:52px; left:0; z-index:40; background:#fff; border:1px solid ${LR.border}; border-radius:14px; box-shadow:0 10px 30px rgba(16,24,40,.14); padding:14px; width:230px; }
.lr-table thead th { background:#FAFBFC; color:#667085; font-size:11.5px; font-weight:700; text-transform:uppercase; letter-spacing:.4px; border-bottom:1px solid ${LR.borderSoft}; padding:14px 16px; white-space:nowrap; }
.lr-table tbody td { padding:14px 16px; vertical-align:middle; border-bottom:1px solid #F5F6F8; }
.lr-table tbody tr:last-child td { border-bottom:none; }
.lr-row:hover { background:#FAFBFF; }
.lr-pill { display:inline-flex; align-items:center; gap:5px; border-radius:999px; padding:5px 12px; font-size:12px; font-weight:600; white-space:nowrap; }
`;

const LeaveRequests = () => {
  const navigate = useNavigate();
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [filteredRequests, setFilteredRequests] = useState([]);
  const [selectedLeave, setSelectedLeave] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showActionModal, setShowActionModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [comments, setComments] = useState('');
  const [filter, setFilter] = useState('all');
  const [leaveTypeFilter, setLeaveTypeFilter] = useState('all');
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [showDateRangePanel, setShowDateRangePanel] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [stats, setStats] = useState({ total: 0, pending: 0, approved: 0, rejected: 0 });

  // New Request modal state
  const [showNewRequestModal, setShowNewRequestModal] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [managers, setManagers] = useState([]);
  const [modalDataLoaded, setModalDataLoaded] = useState(false);
  const [newRequestForm, setNewRequestForm] = useState({
    employee_id: '', leave_type: 'Annual', leave_duration: 'Full Day',
    half_day_type: '', start_date: '', end_date: '', reason: '', reporting_manager: ''
  });
  const [newRequestErrors, setNewRequestErrors] = useState({});
  const [submittingNewRequest, setSubmittingNewRequest] = useState(false);

  useEffect(() => {
    fetchLeaveRequests();
  }, []);

  // Update stats whenever leaveRequests changes
  useEffect(() => {
    const newStats = {
      total: leaveRequests.length,
      pending: leaveRequests.filter(l => l.status === 'pending').length,
      approved: leaveRequests.filter(l => l.status === 'approved').length,
      rejected: leaveRequests.filter(l => l.status === 'rejected').length
    };
    setStats(newStats);
  }, [leaveRequests]);

  // Apply filters whenever any filter input changes
  useEffect(() => {
    applyFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaveRequests, filter, leaveTypeFilter, dateRange, searchTerm]);

  const fetchLeaveRequests = async () => {
    try {
      setLoading(true);
      // Admin sees all leave requests (not just team leaders)
      const response = await axios.get(`${API_ENDPOINTS.LEAVES}?all=true`);
      setLeaveRequests(response.data || []);
      setFilteredRequests(response.data || []);
      setMessage({ type: '', text: '' });
    } catch (error) {
      console.error('Error fetching leave requests:', error);
      setMessage({ type: 'danger', text: error.response?.data?.message || 'Failed to load leave requests' });
    } finally {
      setLoading(false);
    }
  };

  const fetchModalData = async () => {
    if (modalDataLoaded) return;
    try {
      const [empRes, tlRes, mgrRes] = await Promise.allSettled([
        axios.get(API_ENDPOINTS.EMPLOYEES),
        axios.get(API_ENDPOINTS.TEAMS_MANAGERS_LIST),
        axios.get(API_ENDPOINTS.TEAMS_SUB_ADMINS_LIST),
      ]);
      const empList = (empRes.status === 'fulfilled' ? (empRes.value.data?.employees || empRes.value.data) : []) || [];
      setEmployees(empList.filter(e => e.is_active !== false));

      const tls  = (tlRes.status  === 'fulfilled' ? tlRes.value.data.managers  : []) || [];
      const mgrs = (mgrRes.status === 'fulfilled' ? mgrRes.value.data.managers : []) || [];
      setManagers([
        ...tls.map(m  => ({ ...m, _group: 'TL' })),
        ...mgrs.map(m => ({ ...m, _group: 'Manager' })),
      ]);
      setModalDataLoaded(true);
    } catch (error) {
      console.error('Error loading new-request form data:', error);
    }
  };

  const applyFilters = () => {
    let filtered = [...leaveRequests];

    if (filter !== 'all') {
      filtered = filtered.filter(l => l.status === filter);
    }

    if (leaveTypeFilter !== 'all') {
      filtered = filtered.filter(l => l.leave_type === leaveTypeFilter);
    }

    if (dateRange.from) {
      filtered = filtered.filter(l => l.start_date && l.start_date >= dateRange.from);
    }
    if (dateRange.to) {
      filtered = filtered.filter(l => l.start_date && l.start_date <= dateRange.to);
    }

    if (searchTerm && searchTerm.trim() !== '') {
      const term = searchTerm.toLowerCase().trim();
      filtered = filtered.filter(l => {
        const fullName = `${l.first_name || ''} ${l.last_name || ''}`.toLowerCase();
        const employeeId = (l.employee_id || '').toLowerCase();
        const reason = (l.reason || '').toLowerCase();
        const leaveType = (l.leave_type || '').toLowerCase();
        const department = (l.department || '').toLowerCase();

        return fullName.includes(term) ||
          employeeId.includes(term) ||
          reason.includes(term) ||
          leaveType.includes(term) ||
          department.includes(term);
      });
    }

    setFilteredRequests(filtered);
    setCurrentPage(1);
  };

  const handleStatusUpdate = async (id, status) => {
    if (!id) return;
    setProcessing(true);

    try {
      await axios.put(API_ENDPOINTS.LEAVE_STATUS(id), {
        status,
        remarks: comments || null
      });

      await fetchLeaveRequests();

      setShowActionModal(false);
      setComments('');

      setMessage({ type: 'success', text: `Leave ${status} successfully!` });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);

    } catch (error) {
      console.error('Error updating leave status:', error);
      setMessage({ type: 'danger', text: error.response?.data?.message || 'Failed to update leave status' });
    } finally {
      setProcessing(false);
    }
  };

  const getStatusBadge = (status) => {
    const s = STATUS_STYLES[status] || STATUS_STYLES.pending;
    return (
      <span className="lr-pill" style={{ background: s.background, color: s.color, border: s.border }}>
        {s.icon}{status?.charAt(0).toUpperCase() + status?.slice(1)}
      </span>
    );
  };

  const getTypeBadge = (type) => {
    const s = TYPE_STYLES[type] || { background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' };
    return (
      <span className="lr-pill" style={{ background: s.background, color: s.color, border: s.border }}>
        {s.icon}{type}
      </span>
    );
  };

  const calculateDays = (leave) => {
    if (leave.leave_duration === 'Half Day') return 0.5;
    if (!leave.start_date || !leave.end_date) return 1;
    if (leave.start_date === leave.end_date) return 1;

    const start = new Date(leave.start_date);
    const end = new Date(leave.end_date);
    const diffTime = Math.abs(end - start);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return 'N/A';
    if (typeof dateString === 'string' && dateString.includes(' ') && !dateString.includes('T')) {
      const [datePart, timePart] = dateString.split(' ');
      const [y, mo, d] = datePart.split('-');
      const [h, mi] = timePart.split(':');
      const hourNum = parseInt(h);
      const ampm = hourNum >= 12 ? 'PM' : 'AM';
      const hour12 = hourNum % 12 === 0 ? 12 : hourNum % 12;
      return `${d}/${mo}/${y} ${hour12}:${mi} ${ampm}`;
    }
    const d = new Date(dateString);
    const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
    const h = ist.getUTCHours();
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${String(ist.getUTCDate()).padStart(2,'0')}/${String(ist.getUTCMonth()+1).padStart(2,'0')}/${ist.getUTCFullYear()} ${hour12}:${String(ist.getUTCMinutes()).padStart(2,'0')} ${ampm}`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  };

  const formatDateRange = (start, end) => {
    if (!start) return 'N/A';
    if (!end || start === end) return formatDate(start);
    return `${formatDate(start)} - ${formatDate(end)}`;
  };

  const handleViewDetails = (leave) => {
    setSelectedLeave(leave);
    setShowModal(true);
  };

  const handleAction = (leave) => {
    setSelectedLeave(leave);
    setComments('');
    setShowActionModal(true);
  };

  const handleGoToReports = () => {
    navigate('/admin/leave-reports');
  };

  const clearFilters = () => {
    setFilter('all');
    setLeaveTypeFilter('all');
    setDateRange({ from: '', to: '' });
    setSearchTerm('');
  };

  const handleExport = () => {
    const exportData = filteredRequests.map(l => ({
      'Employee Name': `${l.first_name || ''} ${l.last_name || ''}`.trim(),
      'Employee ID': l.employee_id,
      'Leave Type': l.leave_type,
      'Duration': l.leave_duration,
      'Start Date': l.start_date,
      'End Date': l.end_date,
      'Days': calculateDays(l),
      'Reason': l.reason,
      'Reporting Manager': l.reporting_manager || '',
      'Applied At (IST)': formatDateTime(l.created_at),
      'Status': l.status
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Leave Requests');
    XLSX.writeFile(wb, `Leave_Requests_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const openNewRequestModal = () => {
    fetchModalData();
    setNewRequestForm({
      employee_id: '', leave_type: 'Annual', leave_duration: 'Full Day',
      half_day_type: '', start_date: '', end_date: '', reason: '', reporting_manager: ''
    });
    setNewRequestErrors({});
    setShowNewRequestModal(true);
  };

  const handleNewRequestEmployeeChange = (employeeId) => {
    const emp = employees.find(e => e.employee_id === employeeId);
    setNewRequestForm(prev => ({
      ...prev,
      employee_id: employeeId,
      reporting_manager: emp?.reporting_manager || prev.reporting_manager
    }));
  };

  const handleNewRequestSubmit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!newRequestForm.employee_id) errs.employee_id = 'Please select an employee';
    if (!newRequestForm.leave_type) errs.leave_type = 'Leave type is required';
    if (!newRequestForm.start_date) errs.start_date = 'Start date is required';
    if (!newRequestForm.reason.trim()) errs.reason = 'Reason is required';
    if (!newRequestForm.reporting_manager.trim()) errs.reporting_manager = 'Reporting manager is required';

    if (Object.keys(errs).length > 0) {
      setNewRequestErrors(errs);
      return;
    }

    setSubmittingNewRequest(true);
    try {
      const endDate = newRequestForm.end_date || newRequestForm.start_date;
      const daysCount = newRequestForm.leave_duration === 'Half Day'
        ? 0.5
        : (endDate === newRequestForm.start_date
            ? 1
            : Math.ceil(Math.abs(new Date(endDate) - new Date(newRequestForm.start_date)) / (1000 * 60 * 60 * 24)) + 1);

      await axios.post(API_ENDPOINTS.LEAVE_APPLY, {
        ...newRequestForm,
        end_date: endDate,
        days_count: daysCount
      });

      setMessage({ type: 'success', text: 'Leave request created successfully!' });
      setShowNewRequestModal(false);
      await fetchLeaveRequests();
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (error) {
      setMessage({ type: 'danger', text: error.response?.data?.message || 'Failed to create leave request' });
    } finally {
      setSubmittingNewRequest(false);
    }
  };

  // Pagination
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredRequests.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.max(1, Math.ceil(filteredRequests.length / itemsPerPage));

  const paginate = (pageNumber) => {
    if (pageNumber < 1 || pageNumber > totalPages) return;
    setCurrentPage(pageNumber);
  };

  const pageNumbers = [];
  const startPage = Math.max(1, currentPage - 2);
  const endPage = Math.min(totalPages, startPage + 4);
  for (let p = startPage; p <= endPage; p++) pageNumbers.push(p);

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center min-vh-100">
        <div className="text-center">
          <Spinner animation="border" variant="primary" style={{ width: '3rem', height: '3rem' }} />
          <p className="mt-3 text-muted small">Loading leave requests...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-2 p-md-3 p-lg-4" style={{ background: '#F8FAFC', minHeight: '100vh' }}>
      <style>{LR_CSS}</style>

      {/* Header */}
      <div className="lr-header-card position-relative overflow-hidden mb-4">
        <div style={{ position: 'absolute', top: -70, right: -50, width: 220, height: 220, borderRadius: '50%', background: 'radial-gradient(circle, rgba(79,70,229,.16), transparent 70%)' }} />
        <div style={{ position: 'absolute', bottom: -90, left: -30, width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(16,185,129,.10), transparent 70%)' }} />
        <FaCalendarAlt style={{ position: 'absolute', top: 18, right: 90, fontSize: 90, color: LR.primary, opacity: 0.06 }} />
        <FaLeaf style={{ position: 'absolute', bottom: 10, right: 30, fontSize: 60, color: LR.success, opacity: 0.08 }} />

        <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-3 position-relative">
          <div className="d-flex align-items-center gap-3">
            <button className="lr-icon-btn" onClick={() => navigate(-1)} title="Back">
              <FaArrowLeft size={13} />
            </button>
            <div>
              <h3 className="mb-0 fw-bold" style={{ fontSize: 24, color: '#101828' }}>Leave Requests</h3>
              <div style={{ color: '#667085', fontSize: 13.5 }}>Manage and review all employee leave requests</div>
            </div>
          </div>
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <button className="lr-btn-outline" onClick={handleGoToReports}>
              <FaChartBar size={13} /> Leave Reports
            </button>
            <button className="lr-btn-outline" onClick={handleExport}>
              <FaDownload size={13} /> Export
            </button>
            <button className="lr-btn-primary" onClick={openNewRequestModal}>
              <FaPlus size={13} /> New Request
            </button>
          </div>
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

      {/* Stat Cards */}
      <Row className="g-3 mb-4">
        {[
          { label: 'Total Requests', value: stats.total, sub: 'All time requests', color: LR.primary, bg: 'rgba(79,70,229,.10)', icon: <FaCalendarAlt /> },
          { label: 'Pending', value: stats.pending, sub: 'Awaiting approval', color: LR.warning, bg: 'rgba(245,158,11,.12)', icon: <FaClock /> },
          { label: 'Approved', value: stats.approved, sub: 'Approved requests', color: LR.success, bg: 'rgba(16,185,129,.12)', icon: <FaCheckCircle /> },
          { label: 'Rejected', value: stats.rejected, sub: 'Declined requests', color: LR.danger, bg: 'rgba(239,68,68,.12)', icon: <FaTimesCircle /> },
        ].map(s => (
          <Col xs={6} lg={3} key={s.label}>
            <div className="lr-stat-card">
              <div className="d-flex align-items-start justify-content-between">
                <div className="overflow-hidden">
                  <div className="text-truncate" style={{ fontSize: 13, color: '#667085', fontWeight: 600 }}>{s.label}</div>
                  <div style={{ fontSize: 26, fontWeight: 800, color: '#101828', marginTop: 4 }}>{s.value}</div>
                  <div style={{ fontSize: 11.5, color: '#98A2B3', marginTop: 2 }}>{s.sub}</div>
                </div>
                <div className="lr-stat-icon" style={{ background: s.bg, color: s.color }}>{s.icon}</div>
              </div>
            </div>
          </Col>
        ))}
      </Row>

      {/* Filter Bar */}
      <div className="lr-card mb-4 p-3">
        <Row className="g-2 align-items-center">
          <Col xs={12} md>
            <div className="lr-input-wrap">
              <FaSearch size={13} className="text-muted flex-shrink-0" />
              <input
                className="lr-input"
                placeholder="Search by employee name or ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </Col>
          <Col xs={6} md="auto">
            <select className="lr-select" value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </Col>
          <Col xs={6} md="auto">
            <select className="lr-select" value={leaveTypeFilter} onChange={(e) => setLeaveTypeFilter(e.target.value)}>
              <option value="all">All Leave Types</option>
              {LEAVE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Col>
          <Col xs={12} md="auto" className="position-relative">
            <button type="button" className="lr-select d-flex align-items-center gap-2" onClick={() => setShowDateRangePanel(v => !v)}>
              <FaCalendarAlt size={12} />
              {dateRange.from || dateRange.to
                ? `${dateRange.from || '…'} → ${dateRange.to || '…'}`
                : 'Select Date Range'}
            </button>
            {showDateRangePanel && (
              <div className="lr-date-panel">
                <Form.Label className="small mb-1 text-muted">From</Form.Label>
                <Form.Control
                  type="date" size="sm" className="mb-2"
                  value={dateRange.from}
                  onChange={(e) => setDateRange(r => ({ ...r, from: e.target.value }))}
                />
                <Form.Label className="small mb-1 text-muted">To</Form.Label>
                <Form.Control
                  type="date" size="sm" className="mb-3"
                  value={dateRange.to}
                  onChange={(e) => setDateRange(r => ({ ...r, to: e.target.value }))}
                />
                <div className="d-flex gap-2">
                  <button type="button" className="lr-btn-outline flex-fill py-1" onClick={() => setDateRange({ from: '', to: '' })}>
                    Clear
                  </button>
                  <button type="button" className="lr-btn-primary flex-fill py-1" onClick={() => setShowDateRangePanel(false)}>
                    Apply
                  </button>
                </div>
              </div>
            )}
          </Col>
          <Col xs="auto" className="ms-md-auto">
            <button className="lr-icon-btn-lg" title="Clear all filters" onClick={clearFilters}>
              <FaFilter size={14} />
            </button>
          </Col>
        </Row>
      </div>

      {/* Table */}
      <div className="lr-card">
        <div className="table-responsive">
          <PaginatedTable as={Table} paginate={false} className="lr-table mb-0">
            <thead>
              <tr>
                <th className="text-center">Sr No.</th>
                <th>Employee</th>
                <th className="d-none d-sm-table-cell">Leave Type</th>
                <th className="d-none d-md-table-cell">Duration</th>
                <th className="d-none d-lg-table-cell">Date Range</th>
                <th className="d-none d-xl-table-cell">Days</th>
                <th>Reason / Manager</th>
                <th className="d-none d-md-table-cell">Applied At (IST)</th>
                <th>Status</th>
                <th className="text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {currentItems.length > 0 ? (
                currentItems.map((leave, index) => (
                  <tr key={leave.id} className="lr-row">
                    <td className="text-center small text-muted">{indexOfFirstItem + index + 1}</td>

                    <td>
                      <div className="d-flex align-items-center gap-2">
                        <LeaveAvatar photo={leave.profile_image} firstName={leave.first_name} lastName={leave.last_name} />
                        <div className="overflow-hidden">
                          <div className="fw-semibold text-truncate" style={{ fontSize: 13.5, maxWidth: 130 }} title={`${leave.first_name} ${leave.last_name}`}>
                            {leave.first_name} {leave.last_name}
                          </div>
                          <div className="text-muted text-truncate" style={{ fontSize: 11.5, maxWidth: 130 }}>{leave.employee_id}</div>
                        </div>
                      </div>
                    </td>

                    <td className="d-none d-sm-table-cell">{getTypeBadge(leave.leave_type)}</td>

                    <td className="small d-none d-md-table-cell">{leave.leave_duration}</td>

                    <td className="small d-none d-lg-table-cell text-nowrap">
                      {formatDateRange(leave.start_date, leave.end_date)}
                    </td>

                    <td className="small d-none d-xl-table-cell">{calculateDays(leave)}</td>

                    <td>
                      <div style={{ maxWidth: 140 }}>
                        <div className="text-truncate small" title={leave.reason}>{leave.reason}</div>
                        {leave.reporting_manager && (
                          <div className="text-muted text-truncate d-flex align-items-center gap-1" style={{ fontSize: 11 }} title={leave.reporting_manager}>
                            <FaBriefcase size={9} />{leave.reporting_manager}
                          </div>
                        )}
                      </div>
                    </td>

                    <td className="small d-none d-md-table-cell text-nowrap text-muted">
                      {formatDateTime(leave.created_at)}
                    </td>

                    <td>{getStatusBadge(leave.status)}</td>

                    <td className="text-center">
                      <div className="d-flex align-items-center justify-content-center gap-2">
                        <button className="lr-action-btn lr-action-blue" onClick={() => handleViewDetails(leave)} title="View Details">
                          <FaEye size={13} />
                        </button>
                        {leave.status === 'pending' && (
                          <>
                            <button className="lr-action-btn lr-action-green" onClick={() => { setSelectedLeave(leave); setComments(''); handleAction(leave); }} title="Approve">
                              <FaCheck size={13} />
                            </button>
                            <button className="lr-action-btn lr-action-red" onClick={() => { setSelectedLeave(leave); setComments(''); handleAction(leave); }} title="Reject">
                              <FaTimes size={13} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="10" className="text-center py-5">
                    <FaSearch size={40} className="text-muted mb-3 opacity-50" />
                    <p className="text-muted mb-0">No leave requests found</p>
                    {(filter !== 'all' || leaveTypeFilter !== 'all' || dateRange.from || dateRange.to || searchTerm) && (
                      <Button variant="link" size="sm" onClick={clearFilters} className="mt-2">
                        Clear all filters
                      </Button>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </PaginatedTable>
        </div>

        {/* Pagination footer */}
        <div className="d-flex flex-column flex-sm-row justify-content-between align-items-center px-3 py-3 gap-2" style={{ borderTop: `1px solid ${LR.borderSoft}` }}>
          <small className="text-muted">
            Showing {filteredRequests.length === 0 ? 0 : indexOfFirstItem + 1} to{' '}
            {Math.min(indexOfLastItem, filteredRequests.length)} of{' '}
            {filteredRequests.length} entries
          </small>

          <div className="d-flex align-items-center gap-3 flex-wrap">
            <div className="d-flex align-items-center gap-2 small text-muted">
              Rows per page
              <select
                className="lr-select-sm"
                value={itemsPerPage}
                onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
              >
                {[10, 25, 50].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="d-flex align-items-center gap-1">
              <button className="lr-page-btn" disabled={currentPage === 1} onClick={() => paginate(currentPage - 1)}>
                <FaChevronLeft size={11} />
              </button>
              {pageNumbers.map(p => (
                <button key={p} className={`lr-page-btn ${p === currentPage ? 'active' : ''}`} onClick={() => paginate(p)}>
                  {p}
                </button>
              ))}
              <button className="lr-page-btn" disabled={currentPage === totalPages} onClick={() => paginate(currentPage + 1)}>
                <FaChevronRight size={11} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* View Details Modal */}
      <Modal show={showModal} onHide={() => setShowModal(false)} size="lg" centered dialogClassName="mx-2 mx-md-auto">
        <Modal.Header closeButton style={{ background: LR.primary, color: '#fff' }}>
          <Modal.Title as="h6" className="mb-0 small fw-semibold d-flex align-items-center">
            <FaEye className="me-2" size={14} />
            <span className="text-truncate">Leave Request Details</span>
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="p-2 p-md-3">
          {selectedLeave && (
            <div className="small">
              <Row className="g-2 g-md-3">
                <Col xs={12} md={6}>
                  <Card className="border-0 bg-light h-100">
                    <Card.Body className="p-2 p-md-3">
                      <h6 className="mb-2 small fw-semibold d-flex align-items-center" style={{ color: LR.primary }}>
                        <FaUserCircle className="me-2 flex-shrink-0" size={12} />
                        Employee Information
                      </h6>
                      <p className="mb-1"><strong>Name:</strong> {selectedLeave.first_name} {selectedLeave.last_name}</p>
                      <p className="mb-1"><strong>Employee ID:</strong> {selectedLeave.employee_id}</p>
                      <p className="mb-1"><strong>Department:</strong> {selectedLeave.department}</p>
                      <p className="mb-0"><strong>Position:</strong> {selectedLeave.designation || selectedLeave.position}</p>
                    </Card.Body>
                  </Card>
                </Col>
                <Col xs={12} md={6}>
                  <Card className="border-0 bg-light h-100">
                    <Card.Body className="p-2 p-md-3">
                      <h6 className="mb-2 small fw-semibold d-flex align-items-center" style={{ color: LR.primary }}>
                        <FaCalendarAlt className="me-2 flex-shrink-0" size={12} />
                        Leave Information
                      </h6>
                      <p className="mb-1"><strong>Type:</strong> {selectedLeave.leave_type}</p>
                      <p className="mb-1"><strong>Duration:</strong> {selectedLeave.leave_duration}</p>
                      {selectedLeave.half_day_type && (
                        <p className="mb-1"><strong>Half Day:</strong> {selectedLeave.half_day_type}</p>
                      )}
                      <p className="mb-0"><strong>Days:</strong> {calculateDays(selectedLeave)} day(s)</p>
                    </Card.Body>
                  </Card>
                </Col>
              </Row>

              <Row className="mt-2 mt-md-3 g-2 g-md-3">
                <Col xs={12} md={6}>
                  <Card className="border-0 bg-light">
                    <Card.Body className="p-2 p-md-3">
                      <h6 className="mb-2 small fw-semibold" style={{ color: LR.primary }}>Date Range</h6>
                      <p className="mb-1"><strong>Start Date:</strong> {formatDate(selectedLeave.start_date)}</p>
                      <p className="mb-1"><strong>End Date:</strong> {formatDate(selectedLeave.end_date)}</p>
                      <p className="mb-0"><strong>Applied On:</strong> {formatDate(selectedLeave.applied_date)}</p>
                    </Card.Body>
                  </Card>
                </Col>
                <Col xs={12} md={6}>
                  <Card className="border-0 bg-light">
                    <Card.Body className="p-2 p-md-3">
                      <h6 className="mb-2 small fw-semibold" style={{ color: LR.primary }}>Status</h6>
                      <p className="mb-2">{getStatusBadge(selectedLeave.status)}</p>
                      {selectedLeave.remarks && (
                        <div className="mt-2 p-2 bg-white rounded">
                          <small className="text-muted d-block">Admin Comments:</small>
                          <p className="mb-0 small">{selectedLeave.remarks}</p>
                        </div>
                      )}
                    </Card.Body>
                  </Card>
                </Col>
              </Row>

              <Card className="border-0 bg-light mt-2 mt-md-3">
                <Card.Body className="p-2 p-md-3">
                  <h6 className="mb-2 small fw-semibold d-flex align-items-center" style={{ color: LR.primary }}>
                    <FaInfoCircle className="me-2 flex-shrink-0" size={12} />
                    Reason for Leave
                  </h6>
                  <p className="mb-0">{selectedLeave.reason}</p>

                  {selectedLeave.reporting_manager && (
                    <div className="mt-2">
                      <small className="text-muted">Reporting Manager:</small>
                      <p className="mb-0 small fw-bold">{selectedLeave.reporting_manager}</p>
                    </div>
                  )}
                </Card.Body>
              </Card>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer className="py-2">
          {selectedLeave?.status === 'pending' && (
            <>
              <Button
                size="sm"
                style={{ background: LR.success, borderColor: LR.success }}
                onClick={() => { setShowModal(false); handleAction(selectedLeave); }}
                className="d-inline-flex align-items-center"
              >
                <FaCheck className="me-1" size={12} /> Approve
              </Button>
              <Button
                size="sm"
                style={{ background: LR.danger, borderColor: LR.danger }}
                onClick={() => { setShowModal(false); handleAction(selectedLeave); }}
                className="d-inline-flex align-items-center"
              >
                <FaTimes className="me-1" size={12} /> Reject
              </Button>
            </>
          )}
          <Button variant="secondary" size="sm" onClick={() => setShowModal(false)}>Close</Button>
        </Modal.Footer>
      </Modal>

      {/* Approve/Reject Modal */}
      <Modal show={showActionModal} onHide={() => setShowActionModal(false)} centered dialogClassName="mx-2 mx-md-auto">
        <Modal.Header closeButton style={{ background: LR.primary, color: '#fff' }}>
          <Modal.Title as="h6" className="mb-0 small fw-semibold d-flex align-items-center">
            <FaCheckCircle className="me-2 flex-shrink-0" size={14} />
            Update Leave Request
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="p-2 p-md-3">
          {selectedLeave && (
            <div className="small">
              <p className="mb-2"><strong>Employee:</strong> {selectedLeave.first_name} {selectedLeave.last_name}</p>
              <p className="mb-2"><strong>Leave Type:</strong> {selectedLeave.leave_type}</p>
              <p className="mb-2"><strong>Leave Dates:</strong> {formatDateRange(selectedLeave.start_date, selectedLeave.end_date)}</p>
              <p className="mb-3"><strong>Days:</strong> {calculateDays(selectedLeave)} day(s)</p>

              <Form.Group>
                <Form.Label className="small fw-semibold">Comments (Optional):</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={3}
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  placeholder="Add comments about this decision..."
                  size="sm"
                  className="bg-light"
                />
              </Form.Group>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer className="py-2">
          <Button variant="secondary" size="sm" onClick={() => setShowActionModal(false)}>Cancel</Button>
          <Button
            size="sm"
            style={{ background: LR.success, borderColor: LR.success }}
            onClick={() => handleStatusUpdate(selectedLeave?.id, 'approved')}
            disabled={processing}
            className="d-inline-flex align-items-center"
          >
            {processing ? <Spinner size="sm" animation="border" className="me-1" /> : <FaCheck className="me-1" size={12} />}
            Approve
          </Button>
          <Button
            size="sm"
            style={{ background: LR.danger, borderColor: LR.danger }}
            onClick={() => handleStatusUpdate(selectedLeave?.id, 'rejected')}
            disabled={processing}
            className="d-inline-flex align-items-center"
          >
            {processing ? <Spinner size="sm" animation="border" className="me-1" /> : <FaTimes className="me-1" size={12} />}
            Reject
          </Button>
        </Modal.Footer>
      </Modal>

      {/* New Request Modal */}
      <Modal show={showNewRequestModal} onHide={() => setShowNewRequestModal(false)} centered size="lg" dialogClassName="mx-2 mx-md-auto">
        <Modal.Header closeButton style={{ background: LR.primary, color: '#fff' }}>
          <Modal.Title as="h6" className="mb-0 small fw-semibold d-flex align-items-center">
            <FaPlus className="me-2" size={13} /> New Leave Request
          </Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleNewRequestSubmit}>
          <Modal.Body className="p-3">
            <Row className="g-3">
              <Col xs={12} md={6}>
                <Form.Group>
                  <Form.Label className="small fw-semibold text-muted">Employee <span className="text-danger">*</span></Form.Label>
                  <Form.Select
                    size="sm"
                    value={newRequestForm.employee_id}
                    onChange={(e) => handleNewRequestEmployeeChange(e.target.value)}
                    isInvalid={!!newRequestErrors.employee_id}
                  >
                    <option value="">-- Select Employee --</option>
                    {employees
                      .slice()
                      .sort((a, b) => `${a.first_name}`.localeCompare(b.first_name))
                      .map(emp => (
                        <option key={emp.employee_id} value={emp.employee_id}>
                          {emp.first_name} {emp.last_name} ({emp.employee_id})
                        </option>
                      ))}
                  </Form.Select>
                  <Form.Control.Feedback type="invalid">{newRequestErrors.employee_id}</Form.Control.Feedback>
                </Form.Group>
              </Col>

              <Col xs={12} md={6}>
                <Form.Group>
                  <Form.Label className="small fw-semibold text-muted">Leave Type <span className="text-danger">*</span></Form.Label>
                  <Form.Select
                    size="sm"
                    value={newRequestForm.leave_type}
                    onChange={(e) => setNewRequestForm(f => ({ ...f, leave_type: e.target.value }))}
                  >
                    {LEAVE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </Form.Select>
                </Form.Group>
              </Col>

              <Col xs={12} md={6}>
                <Form.Group>
                  <Form.Label className="small fw-semibold text-muted">Duration</Form.Label>
                  <Form.Select
                    size="sm"
                    value={newRequestForm.leave_duration}
                    onChange={(e) => setNewRequestForm(f => ({ ...f, leave_duration: e.target.value, half_day_type: e.target.value === 'Half Day' ? f.half_day_type : '' }))}
                  >
                    <option value="Full Day">Full Day</option>
                    <option value="Half Day">Half Day</option>
                  </Form.Select>
                </Form.Group>
              </Col>

              {newRequestForm.leave_duration === 'Half Day' && (
                <Col xs={12} md={6}>
                  <Form.Group>
                    <Form.Label className="small fw-semibold text-muted">Half Day Type</Form.Label>
                    <Form.Select
                      size="sm"
                      value={newRequestForm.half_day_type}
                      onChange={(e) => setNewRequestForm(f => ({ ...f, half_day_type: e.target.value }))}
                    >
                      <option value="">-- Select --</option>
                      <option value="First Half">First Half</option>
                      <option value="Second Half">Second Half</option>
                    </Form.Select>
                  </Form.Group>
                </Col>
              )}

              <Col xs={12} md={6}>
                <Form.Group>
                  <Form.Label className="small fw-semibold text-muted">Start Date <span className="text-danger">*</span></Form.Label>
                  <Form.Control
                    type="date" size="sm"
                    value={newRequestForm.start_date}
                    onChange={(e) => setNewRequestForm(f => ({ ...f, start_date: e.target.value }))}
                    isInvalid={!!newRequestErrors.start_date}
                  />
                  <Form.Control.Feedback type="invalid">{newRequestErrors.start_date}</Form.Control.Feedback>
                </Form.Group>
              </Col>

              {newRequestForm.leave_duration === 'Full Day' && (
                <Col xs={12} md={6}>
                  <Form.Group>
                    <Form.Label className="small fw-semibold text-muted">End Date</Form.Label>
                    <Form.Control
                      type="date" size="sm"
                      value={newRequestForm.end_date}
                      min={newRequestForm.start_date || undefined}
                      onChange={(e) => setNewRequestForm(f => ({ ...f, end_date: e.target.value }))}
                    />
                  </Form.Group>
                </Col>
              )}

              <Col xs={12}>
                <Form.Group>
                  <Form.Label className="small fw-semibold text-muted">Reason <span className="text-danger">*</span></Form.Label>
                  <Form.Control
                    as="textarea" rows={2} size="sm"
                    value={newRequestForm.reason}
                    onChange={(e) => setNewRequestForm(f => ({ ...f, reason: e.target.value }))}
                    isInvalid={!!newRequestErrors.reason}
                  />
                  <Form.Control.Feedback type="invalid">{newRequestErrors.reason}</Form.Control.Feedback>
                </Form.Group>
              </Col>

              <Col xs={12}>
                <Form.Group>
                  <Form.Label className="small fw-semibold text-muted">Reporting Manager <span className="text-danger">*</span></Form.Label>
                  <Form.Select
                    size="sm"
                    value={newRequestForm.reporting_manager}
                    onChange={(e) => setNewRequestForm(f => ({ ...f, reporting_manager: e.target.value }))}
                    isInvalid={!!newRequestErrors.reporting_manager}
                  >
                    <option value="">-- Select Reporting Manager --</option>
                    {['Manager', 'TL'].map(group => {
                      const groupMembers = managers.filter(m => m._group === group);
                      if (groupMembers.length === 0) return null;
                      return (
                        <optgroup key={group} label={group === 'Manager' ? '👔 Managers' : '👤 Team Leads (TL)'}>
                          {groupMembers.map(m => {
                            const fullName = `${m.first_name} ${m.last_name}`.trim();
                            return <option key={m.employee_id} value={fullName}>{fullName}</option>;
                          })}
                        </optgroup>
                      );
                    })}
                  </Form.Select>
                  <Form.Control.Feedback type="invalid">{newRequestErrors.reporting_manager}</Form.Control.Feedback>
                  {newRequestForm.reporting_manager && (
                    <Form.Text className="text-muted">Auto-selected from employee profile. Change it if needed.</Form.Text>
                  )}
                </Form.Group>
              </Col>
            </Row>
          </Modal.Body>
          <Modal.Footer className="py-2">
            <Button variant="secondary" size="sm" onClick={() => setShowNewRequestModal(false)}>Cancel</Button>
            <Button type="submit" size="sm" style={{ background: LR.primary, borderColor: LR.primary }} disabled={submittingNewRequest}>
              {submittingNewRequest ? <Spinner size="sm" animation="border" className="me-1" /> : <FaPlus className="me-1" size={12} />}
              Create Request
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </div>
  );
};

export default LeaveRequests;
