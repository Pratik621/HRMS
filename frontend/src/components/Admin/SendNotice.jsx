import PaginatedTable from '../Common/PaginatedTable';
// src/components/Admin/SendNotice.jsx
import React, { useState, useEffect, useMemo } from 'react';
import {
  Card, Form, Button, Alert, Spinner, Badge, Row, Col,
  InputGroup, Table, Modal
} from 'react-bootstrap';
import {
  FaExclamationTriangle, FaBell, FaSearch, FaTimes, FaTrash,
  FaUser, FaUsers, FaCheckCircle, FaTimesCircle, FaEye,
  FaEnvelope, FaCheckDouble, FaArrowLeft
} from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';
import { useAuth } from '../../context/AuthContext';

const isTeamLeaderDesignation = (designation) => {
  if (!designation) return false;
  const d = designation.toLowerCase();
  return d.includes('team leader') || d.includes('team manager') ||
         d.includes('tl') || d.includes('lead') || d.includes('manager') ||
         d.includes('head') || d.includes('supervisor');
};

const SendNotice = ({ embedded = false }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'sub_admin' || user?.role === 'hr';

  const [employees, setEmployees] = useState([]);
  const [sentNotices, setSentNotices] = useState([]);
  const [fetching, setFetching] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');
  
  // ✅ Changed: Multiple selection using Set
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectAll, setSelectAll] = useState(false);
  
  const [title, setTitle] = useState('');
  const [noticeMessage, setNoticeMessage] = useState('');
  const [type, setType] = useState('notice');
  const [viewNotice, setViewNotice] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [sendingTo, setSendingTo] = useState(null);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setFetching(true);
    try {
      const empEndpoint = isAdmin
        ? API_ENDPOINTS.ADMIN_UPDATES_EMPLOYEES
        : API_ENDPOINTS.EMPLOYEES;

      const [empRes, noticeRes] = await Promise.all([
        axios.get(empEndpoint),
        axios.get(`${API_ENDPOINTS.NOTICES}?type=sent`)
      ]);

      let emps = Array.isArray(empRes.data) ? empRes.data
        : empRes.data?.data || empRes.data?.employees || [];

      if (!isAdmin) {
        const myName = `${user?.firstName || ''} ${user?.lastName || ''}`.trim();
        try {
          const profileRes = await axios.get(API_ENDPOINTS.EMPLOYEE_PROFILE(user?.employeeId));
          const profile = profileRes.data;
          const fullName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
          emps = emps.filter(e => e.reporting_manager === fullName && e.employee_id !== user?.employeeId);
        } catch {
          emps = [];
        }
      }

      setEmployees(emps);
      setSentNotices(noticeRes.data?.notices || []);
      // Reset selections when data loads
      setSelectedIds(new Set());
      setSelectAll(false);
    } catch (err) {
      setMessage({ type: 'danger', text: 'Failed to load data' });
    } finally {
      setFetching(false);
    }
  };

  const filtered = useMemo(() => {
    let list = employees;
    if (search.trim()) {
      const t = search.toLowerCase();
      list = list.filter(e =>
        `${e.first_name} ${e.last_name}`.toLowerCase().includes(t) ||
        (e.employee_id || '').toLowerCase().includes(t) ||
        (e.department || '').toLowerCase().includes(t)
      );
    }
    if (deptFilter !== 'all') list = list.filter(e => e.department === deptFilter);
    return list;
  }, [employees, search, deptFilter]);

  const departments = useMemo(() =>
    ['all', ...new Set(employees.map(e => e.department).filter(Boolean))],
    [employees]
  );

  // ✅ Handle single checkbox toggle
  const handleSelectEmployee = (employeeId) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(employeeId)) {
      newSelected.delete(employeeId);
    } else {
      newSelected.add(employeeId);
    }
    setSelectedIds(newSelected);
    setSelectAll(newSelected.size === filtered.length && filtered.length > 0);
  };

  // ✅ Handle select all
  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedIds(new Set());
      setSelectAll(false);
    } else {
      const allIds = filtered.map(emp => emp.employee_id);
      setSelectedIds(new Set(allIds));
      setSelectAll(true);
    }
  };

  // ✅ Handle bulk send
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (selectedIds.size === 0) {
      return showMsg('danger', 'Please select at least one employee.');
    }
    if (!title.trim()) {
      return showMsg('danger', 'Title is required.');
    }
    if (!noticeMessage.trim()) {
      return showMsg('danger', 'Message is required.');
    }

    setLoading(true);
    setSendingTo(selectedIds.size);
    
    let successCount = 0;
    let failCount = 0;
    const errors = [];

    // Send to each selected employee
    for (const employeeId of selectedIds) {
      try {
        await axios.post(API_ENDPOINTS.NOTICES, {
          employee_id: employeeId,
          title: title.trim(),
          message: noticeMessage.trim(),
          type
        });
        successCount++;
      } catch (err) {
        failCount++;
        errors.push(`${employeeId}: ${err.response?.data?.message || err.message}`);
      }
    }

    if (successCount > 0) {
      showMsg('success', 
        `${type === 'warning' ? 'Warning' : 'Notice'} sent successfully to ${successCount} employee(s)! ${failCount > 0 ? `Failed: ${failCount}` : ''}`
      );
      
      // Reset form
      setSelectedIds(new Set());
      setSelectAll(false);
      setTitle('');
      setNoticeMessage('');
      setType('notice');
      
      // Refresh notices list
      fetchData();
    } else {
      showMsg('danger', `Failed to send. ${errors[0] || 'Unknown error'}`);
    }
    
    setLoading(false);
    setSendingTo(null);
  };

  const handleDelete = async (id) => {
    setDeleting(id);
    try {
      await axios.delete(API_ENDPOINTS.NOTICE_DELETE(id));
      setSentNotices(prev => prev.filter(n => n.id !== id));
      showMsg('success', 'Notice deleted.');
    } catch (err) {
      showMsg('danger', err.response?.data?.message || 'Failed to delete notice');
    } finally {
      setDeleting(null);
    }
  };

  const showMsg = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 4000);
  };

  const selectedEmployees = employees.filter(e => selectedIds.has(e.employee_id));
  const selectedNames = selectedEmployees.map(e => `${e.first_name} ${e.last_name}`).join(', ');

  return (
    <div className={embedded ? '' : 'p-2 p-md-3 p-lg-4'} style={embedded ? {} : { backgroundColor: '#f8f9fc', minHeight: '100vh' }}>
      {!embedded && (
        <div className="d-flex justify-content-between align-items-center mb-4">
          <h5 className="mb-0 d-flex align-items-center">
            <FaExclamationTriangle className="me-2 text-warning" />
            Send Notice / Warning (Bulk)
          </h5>
          <div className="d-flex align-items-center gap-2">
            <Badge bg="primary" pill className="px-3 py-2">
              <FaUsers className="me-1" /> {selectedIds.size} Selected
            </Badge>
            <button
              className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1"
              onClick={() => navigate(-1)}
            >
              <FaArrowLeft size={12} /> Back
            </button>
          </div>
        </div>
      )}

      {message.text && (
        <Alert variant={message.type} dismissible onClose={() => setMessage({ type: '', text: '' })} className="mb-3 py-2 small">
          {message.type === 'success' ? <FaCheckCircle className="me-2" /> : <FaTimesCircle className="me-2" />}
          {message.text}
        </Alert>
      )}

      <Row className="g-3">
        {/* LEFT: Employee selection with checkboxes */}
        <Col lg={6}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Header className="bg-light py-2">
              <div className="d-flex justify-content-between align-items-center">
                <h6 className="mb-0 small fw-semibold">
                  <FaUsers className="me-2" size={13} />
                  Select Employees
                </h6>
                {selectedIds.size > 0 && (
                  <Button 
                    variant="link" 
                    size="sm" 
                    className="p-0 text-danger small"
                    onClick={() => {
                      setSelectedIds(new Set());
                      setSelectAll(false);
                    }}
                  >
                    Clear All
                  </Button>
                )}
              </div>
            </Card.Header>
            <Card.Body className="p-2 p-md-3">
              <Row className="g-2 mb-2">
                <Col xs={8} sm={7}>
                  <InputGroup size="sm">
                    <InputGroup.Text className="bg-light border-0">
                      <FaSearch size={11} className="text-muted" />
                    </InputGroup.Text>
                    <Form.Control
                      type="text"
                      placeholder="Search name, ID..."
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      className="border-0 bg-light"
                    />
                    {search && (
                      <Button variant="outline-secondary" size="sm" onClick={() => setSearch('')} className="border-0">
                        <FaTimes size={11} />
                      </Button>
                    )}
                  </InputGroup>
                </Col>
                <Col xs={4} sm={5}>
                  <Form.Select size="sm" value={deptFilter} onChange={e => setDeptFilter(e.target.value)} className="bg-light border-0">
                    <option value="all">All Depts</option>
                    {departments.filter(d => d !== 'all').map(d => <option key={d} value={d}>{d}</option>)}
                  </Form.Select>
                </Col>
              </Row>

              {fetching ? (
                <div className="text-center py-4">
                  <Spinner size="sm" animation="border" variant="primary" />
                </div>
              ) : (
                <div className="table-responsive" style={{ maxHeight: '320px', overflowY: 'auto' }}>
                  <PaginatedTable as={Table} hover size="sm" className="mb-0">
                    <thead className="bg-light sticky-top" style={{ top: 0, zIndex: 10 }}>
                      <tr className="small">
                        <th style={{ width: '40px' }} className="text-center">
                          <Form.Check
                            type="checkbox"
                            checked={selectAll && filtered.length > 0}
                            onChange={handleSelectAll}
                            title={selectAll ? "Deselect all" : "Select all"}
                          />
                        </th>
                        <th className="fw-normal">Employee</th>
                        <th className="fw-normal d-none d-sm-table-cell">Dept / Designation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 ? (
                        <tr><td colSpan="3" className="text-center py-4 text-muted small">No employees found</td></tr>
                      ) : filtered.map(emp => (
                        <tr
                          key={emp.employee_id}
                          className={selectedIds.has(emp.employee_id) ? 'table-primary' : ''}
                          style={{ cursor: 'pointer' }}
                          onClick={() => handleSelectEmployee(emp.employee_id)}
                        >
                          <td className="text-center" onClick={e => e.stopPropagation()}>
                            <Form.Check
                              type="checkbox"
                              checked={selectedIds.has(emp.employee_id)}
                              onChange={() => handleSelectEmployee(emp.employee_id)}
                            />
                          </td>
                          <td className="small">
                            <div className="fw-semibold">{emp.first_name} {emp.last_name}</div>
                            <small className="text-muted">{emp.employee_id}</small>
                          </td>
                          <td className="small d-none d-sm-table-cell">
                            <div>{emp.department || '—'}</div>
                            <small className="text-muted">{emp.designation || '—'}</small>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </PaginatedTable>
                </div>
              )}
              
              {/* Selected summary */}
              {selectedIds.size > 0 && (
                <div className="mt-2 p-2 bg-light rounded small">
                  <strong className="text-primary">✓ {selectedIds.size} employee(s) selected:</strong>
                  <div className="text-muted text-truncate" title={selectedNames}>
                    {selectedNames.substring(0, 60)}{selectedNames.length > 60 ? '...' : ''}
                  </div>
                </div>
              )}
              
              <div className="mt-1 small text-muted">
                Total: {filtered.length} employees
              </div>
            </Card.Body>
          </Card>
        </Col>

        {/* RIGHT: Notice form */}
        <Col lg={6}>
          <Card className="border-0 shadow-sm mb-3">
            <Card.Header className="bg-light py-2">
              <h6 className="mb-0 small fw-semibold">
                <FaBell className="me-2" size={13} />
                Notice / Warning Details
              </h6>
            </Card.Header>
            <Card.Body className="p-2 p-md-3">
              <Form onSubmit={handleSubmit}>
                <Form.Group className="mb-3">
                  <Form.Label className="small fw-semibold">Type</Form.Label>
                  <div className="d-flex gap-3">
                    <Form.Check
                      type="radio"
                      id="type-notice"
                      label={<span className="small"><FaBell className="me-1 text-info" />Notice</span>}
                      checked={type === 'notice'}
                      onChange={() => setType('notice')}
                    />
                    <Form.Check
                      type="radio"
                      id="type-warning"
                      label={<span className="small"><FaExclamationTriangle className="me-1 text-warning" />Warning</span>}
                      checked={type === 'warning'}
                      onChange={() => setType('warning')}
                    />
                  </div>
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label className="small fw-semibold">
                    Title <span className="text-danger">*</span>
                    {selectedIds.size > 0 && (
                      <Badge bg="info" pill className="ms-2 small">To: {selectedIds.size} recipient(s)</Badge>
                    )}
                  </Form.Label>
                  <Form.Control
                    size="sm"
                    type="text"
                    placeholder="e.g., Late Attendance Warning"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    required
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label className="small fw-semibold">Message <span className="text-danger">*</span></Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={4}
                    size="sm"
                    placeholder="Write the notice or warning message here..."
                    value={noticeMessage}
                    onChange={e => setNoticeMessage(e.target.value)}
                    required
                  />
                </Form.Group>

                <Button
                  type="submit"
                  variant={type === 'warning' ? 'warning' : 'primary'}
                  className="w-100 d-flex align-items-center justify-content-center gap-2"
                  disabled={loading || selectedIds.size === 0 || !title.trim() || !noticeMessage.trim()}
                >
                  {loading ? (
                    <><Spinner size="sm" animation="border" />Sending to {sendingTo} employee(s)...</>
                  ) : (
                    <><FaEnvelope size={13} />
                      Send {type === 'warning' ? 'Warning' : 'Notice'} 
                      {selectedIds.size > 0 && ` to ${selectedIds.size} employee(s)`}
                    </>
                  )}
                </Button>
                
                {selectedIds.size === 0 && (
                  <div className="text-center mt-2">
                    <small className="text-muted">Please select at least one employee from the list</small>
                  </div>
                )}
              </Form>
            </Card.Body>
          </Card>
        </Col>

        {/* Sent Notices History */}
        <Col xs={12}>
          <Card className="border-0 shadow-sm">
            <Card.Header className="bg-light py-2 d-flex justify-content-between align-items-center">
              <h6 className="mb-0 small fw-semibold">
                <FaUsers className="me-2" size={13} />
                Sent Notices / Warnings
              </h6>
              <Badge bg="secondary" pill>{sentNotices.length}</Badge>
            </Card.Header>
            <Card.Body className="p-0">
              <div className="table-responsive" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                <PaginatedTable as={Table} hover size="sm" className="mb-0">
                  <thead className="bg-light sticky-top" style={{ top: 0, zIndex: 10 }}>
                    <tr className="small">
                      <th className="fw-normal">#</th>
                      <th className="fw-normal">Employee</th>
                      <th className="fw-normal">Type</th>
                      <th className="fw-normal">Title</th>
                      <th className="fw-normal d-none d-md-table-cell">Sent At</th>
                      <th className="fw-normal text-center">Read</th>
                      <th className="fw-normal text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sentNotices.length === 0 ? (
                      <tr><td colSpan="7" className="text-center py-4 text-muted small">No notices sent yet</td></tr>
                    ) : sentNotices.map((n, i) => {
                      const emp = employees.find(e => e.employee_id === n.employee_id);
                      return (
                        <tr key={n.id}>
                          <td className="small">{i + 1}</td>
                          <td className="small">
                            <div className="fw-semibold">{emp ? `${emp.first_name} ${emp.last_name}` : n.employee_id}</div>
                            <small className="text-muted">{n.employee_id}</small>
                          </td>
                          <td>
                            <Badge bg={n.type === 'warning' ? 'warning' : 'info'} className="small">
                              {n.type === 'warning' ? '⚠️ Warning' : '🔔 Notice'}
                            </Badge>
                          </td>
                          <td className="small text-truncate" style={{ maxWidth: '150px' }}>{n.title}</td>
                          <td className="small d-none d-md-table-cell text-muted">
                            {new Date(n.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </td>
                          <td className="text-center">
                            {n.is_read
                              ? <FaCheckCircle className="text-success" size={14} title="Read" />
                              : <FaTimesCircle className="text-muted" size={14} title="Unread" />}
                          </td>
                          <td className="text-center">
                            <div className="d-flex gap-1 justify-content-center">
                              <FaEye
                                size={14}
                                className="text-primary"
                                style={{ cursor: 'pointer' }}
                                onClick={() => setViewNotice(n)}
                                title="View"
                              />
                              <FaTrash
                                size={14}
                                className="text-danger ms-1"
                                style={{ cursor: deleting === n.id ? 'not-allowed' : 'pointer', opacity: deleting === n.id ? 0.5 : 1 }}
                                onClick={() => deleting !== n.id && handleDelete(n.id)}
                                title="Delete"
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </PaginatedTable>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* View Notice Modal */}
      <Modal show={!!viewNotice} onHide={() => setViewNotice(null)} centered>
        <Modal.Header closeButton className={viewNotice?.type === 'warning' ? 'bg-warning' : 'bg-info text-white'}>
          <Modal.Title as="h6" className="mb-0 small fw-semibold">
            {viewNotice?.type === 'warning' ? '⚠️ Warning' : '🔔 Notice'} — {viewNotice?.title}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="small">
          {viewNotice && (
            <>
              <p className="mb-1"><strong>To:</strong> {viewNotice.employee_id}</p>
              <p className="mb-1"><strong>Sent:</strong> {new Date(viewNotice.created_at).toLocaleString('en-IN')}</p>
              <p className="mb-1"><strong>Status:</strong> {viewNotice.is_read ? '✅ Read' : '⏳ Unread'}</p>
              <hr />
              <p className="mb-0" style={{ whiteSpace: 'pre-wrap' }}>{viewNotice.message}</p>
            </>
          )}
        </Modal.Body>
        <Modal.Footer className="py-2">
          <Button variant="secondary" size="sm" onClick={() => setViewNotice(null)}>Close</Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => { handleDelete(viewNotice.id); setViewNotice(null); }}
          >
            <FaTrash className="me-1" size={11} /> Delete
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default SendNotice;