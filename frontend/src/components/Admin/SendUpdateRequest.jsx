import PaginatedTable from '../Common/PaginatedTable';
// src/components/Admin/SendUpdateRequest.jsx
import React, { useState, useEffect, useMemo } from 'react';
import {
  Card, Form, Button, Alert, Spinner, Badge,
  Row, Col, InputGroup, Table
} from 'react-bootstrap';
import {
  FaPaperPlane, FaUser, FaInfoCircle, FaCheckCircle,
  FaTimesCircle, FaSearch, FaBriefcase, FaEnvelope,
  FaMapMarkerAlt, FaUniversity, FaHeartbeat, FaFileAlt,
  FaCreditCard, FaFileImage, FaFilePdf, FaFileWord,
  FaUpload, FaTimes, FaUsers, FaArrowLeft
} from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';

// Check if designation is team leader/manager level
const isTeamLeader = (designation) => {
  if (!designation) return false;
  const d = designation.toLowerCase();
  return d.includes('team leader') || d.includes('team manager') ||
         d.includes('tl') || d.includes('lead') || d.includes('manager') ||
         d.includes('head') || d.includes('supervisor');
};

const BASE_FIELD_OPTIONS = [
  { value: 'personal',   label: 'Personal Info',      icon: <FaUser className="text-primary" />,     fields: ['first_name','last_name','dob','blood_group'] },
  { value: 'contact',    label: 'Contact Details',     icon: <FaEnvelope className="text-info" />,    fields: ['email','phone'] },
  { value: 'address',    label: 'Address',             icon: <FaMapMarkerAlt className="text-danger" />, fields: ['address','city','state','pincode'] },
  { value: 'bank',       label: 'Bank & ID Proofs',    icon: <FaUniversity className="text-warning" />, fields: ['bank_account_name','account_number','ifsc_code','branch_name','pan_number','aadhar_number'] },
  { value: 'employment', label: 'Employment Details',  icon: <FaBriefcase className="text-secondary" />, fields: ['designation','department','employment_type','reporting_manager'], fieldsWithShift: ['designation','department','employment_type','shift_timing','reporting_manager'] },
  { value: 'emergency',  label: 'Emergency Contact',   icon: <FaHeartbeat className="text-danger" />, fields: ['emergency_contact'] },
  { value: 'salary',     label: 'Salary Info',         icon: <FaCreditCard className="text-success" />, fields: ['gross_salary','in_hand_salary'] },
  { value: 'documents',  label: 'Documents Upload',    icon: <FaFileAlt className="text-success" />,  fields: ['documents'], isDocument: true },
];

const DOC_TYPES = [
  { value: 'profile_image',           label: 'Profile Image',           icon: <FaFileImage className="text-primary" /> },
  { value: 'appointment_letter',      label: 'Appointment Letter',      icon: <FaFileWord className="text-info" /> },
  { value: 'offer_letter',            label: 'Offer Letter',            icon: <FaFilePdf className="text-danger" /> },
  { value: 'contract_document',       label: 'Contract Document',       icon: <FaFileAlt className="text-secondary" /> },
  { value: 'aadhar_card',             label: 'Aadhar Card',             icon: <FaFileImage className="text-primary" /> },
  { value: 'pan_card',                label: 'PAN Card',                icon: <FaFileImage className="text-warning" /> },
  { value: 'bank_proof',              label: 'Bank Proof',              icon: <FaFileAlt className="text-info" /> },
  { value: 'education_certificates',  label: 'Education Certificates',  icon: <FaFileAlt className="text-success" /> },
  { value: 'experience_certificates', label: 'Experience Certificates', icon: <FaFileAlt className="text-secondary" /> },
];

const SendUpdateRequest = () => {
  const navigate = useNavigate();
  const [employees, setEmployees]       = useState([]);
  const [fetching, setFetching]         = useState(true);
  const [loading, setLoading]           = useState(false);
  const [message, setMessage]           = useState({ type: '', text: '' });

  // Employee selection
  const [search, setSearch]             = useState('');
  const [deptFilter, setDeptFilter]     = useState('all');
  const [selectedIds, setSelectedIds]   = useState(new Set());

  // Fields
  const [selectedFields, setSelectedFields]   = useState([]);
  const [selectedDocs, setSelectedDocs]       = useState([]);

  useEffect(() => { fetchEmployees(); }, []);

  const fetchEmployees = async () => {
    try {
      setFetching(true);
      const res = await axios.get(API_ENDPOINTS.ADMIN_UPDATES_EMPLOYEES);
      const data = Array.isArray(res.data) ? res.data
        : res.data?.data || res.data?.employees || [];
      setEmployees(data);
    } catch (err) {
      setMessage({ type: 'danger', text: err.response?.data?.message || 'Failed to load employees' });
    } finally {
      setFetching(false);
    }
  };

  // Filtered list
  const filtered = useMemo(() => {
    let list = employees;
    if (search.trim()) {
      const t = search.toLowerCase();
      list = list.filter(e =>
        `${e.first_name} ${e.last_name}`.toLowerCase().includes(t) ||
        (e.employee_id || '').toLowerCase().includes(t) ||
        (e.department || '').toLowerCase().includes(t) ||
        (e.designation || '').toLowerCase().includes(t)
      );
    }
    if (deptFilter !== 'all') list = list.filter(e => e.department === deptFilter);
    return list;
  }, [employees, search, deptFilter]);

  const departments = useMemo(() =>
    ['all', ...new Set(employees.map(e => e.department).filter(Boolean))],
    [employees]
  );

  // Checkbox helpers
  const allSelected  = filtered.length > 0 && filtered.every(e => selectedIds.has(e.employee_id));
  const someSelected = filtered.some(e => selectedIds.has(e.employee_id)) && !allSelected;

  const toggleOne = (id) => {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(prev => { const n = new Set(prev); filtered.forEach(e => n.delete(e.employee_id)); return n; });
    } else {
      setSelectedIds(prev => { const n = new Set(prev); filtered.forEach(e => n.add(e.employee_id)); return n; });
    }
  };

  const toggleField = (f) => {
    setSelectedFields(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]);
    if (f === 'documents' && selectedFields.includes('documents')) setSelectedDocs([]);
  };
  const toggleDoc = (d) => setSelectedDocs(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  // Dynamic field options - shift_timing only for team leaders
  const FIELD_OPTIONS = useMemo(() => {
    const selectedEmps = employees.filter(e => selectedIds.has(e.employee_id));
    const anyTeamLeader = selectedEmps.some(e => isTeamLeader(e.designation));
    const allTeamLeaders = selectedEmps.length > 0 && selectedEmps.every(e => isTeamLeader(e.designation));

    return BASE_FIELD_OPTIONS.map(f => {
      if (f.value === 'employment') {
        return {
          ...f,
          fields: allTeamLeaders ? f.fieldsWithShift : f.fields,
          label: f.label + (anyTeamLeader && !allTeamLeaders ? ' (shift excluded for non-TL)' : '')
        };
      }
      return f;
    });
  }, [selectedIds, employees]);

  const selectAllFields = () => {
    if (selectedFields.length === FIELD_OPTIONS.length) { setSelectedFields([]); setSelectedDocs([]); }
    else setSelectedFields(FIELD_OPTIONS.map(f => f.value));
  };

  const showMsg = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 4000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (selectedIds.size === 0) return showMsg('danger', 'Select at least one employee.');
    if (selectedFields.length === 0) return showMsg('danger', 'Select at least one field to update.');
    if (selectedFields.includes('documents') && selectedDocs.length === 0)
      return showMsg('danger', 'Select at least one document type.');

    setLoading(true);
    const ids = [...selectedIds];
    let ok = 0; const failed = [];

    const fieldsToUpdate = selectedFields.flatMap(cat => {
      const obj = FIELD_OPTIONS.find(f => f.value === cat);
      return obj && !obj.isDocument ? obj.fields : [];
    });

    await Promise.all(ids.map(async empId => {
      try {
        const body = {
          employee_id: empId,
          requested_fields: selectedFields,
          requested_field_names: fieldsToUpdate,
          notes: `Please update: ${selectedFields.map(f => FIELD_OPTIONS.find(o => o.value === f)?.label).join(', ')}.`,
          ...(selectedFields.includes('documents') && { document_types: selectedDocs })
        };
        await axios.post(API_ENDPOINTS.ADMIN_UPDATES_SEND_REQUEST, body);
        ok++;
      } catch {
        const emp = employees.find(e => e.employee_id === empId);
        failed.push(emp ? `${emp.first_name} ${emp.last_name}` : empId);
      }
    }));

    setLoading(false);
    if (failed.length === 0) {
      showMsg('success', `Request sent to ${ok} employee${ok > 1 ? 's' : ''} successfully!`);
    } else {
      showMsg('warning', `Sent to ${ok}. Failed: ${failed.join(', ')}.`);
    }
    setSelectedIds(new Set());
    setSelectedFields([]);
    setSelectedDocs([]);
    setSearch('');
    setDeptFilter('all');
  };

  return (
    <div className="p-2 p-md-3 p-lg-4" style={{ backgroundColor: '#f8f9fc', minHeight: '100vh' }}>
      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h5 className="mb-0 d-flex align-items-center">
          <FaPaperPlane className="me-2 text-primary" />
          Send Update Request
        </h5>
        <div className="d-flex align-items-center gap-2">
          {selectedIds.size > 0 && (
            <Badge bg="primary" pill className="px-3 py-2">
              <FaUsers className="me-1" size={12} />
              {selectedIds.size} selected
            </Badge>
          )}
          <button
            className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1"
            onClick={() => navigate(-1)}
          >
            <FaArrowLeft size={12} /> Back
          </button>
        </div>
      </div>

      {message.text && (
        <Alert variant={message.type} dismissible onClose={() => setMessage({ type: '', text: '' })} className="mb-3 py-2 small">
          {message.type === 'success' ? <FaCheckCircle className="me-2" /> : <FaTimesCircle className="me-2" />}
          {message.text}
        </Alert>
      )}

      <Form onSubmit={handleSubmit}>
        <Row className="g-3">
          {/* LEFT: Employee table */}
          <Col lg={7}>
            <Card className="border-0 shadow-sm h-100">
              <Card.Header className="bg-light py-2">
                <h6 className="mb-0 small fw-semibold">
                  <FaUser className="me-2" size={13} />
                  Select Employees
                </h6>
              </Card.Header>
              <Card.Body className="p-2 p-md-3">
                {/* Search + dept filter */}
                <Row className="g-2 mb-2">
                  <Col xs={8} sm={7}>
                    <InputGroup size="sm">
                      <InputGroup.Text className="bg-light border-0">
                        <FaSearch size={11} className="text-muted" />
                      </InputGroup.Text>
                      <Form.Control
                        type="text"
                        placeholder="Search name, ID, dept..."
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
                    <small className="ms-2 text-muted">Loading...</small>
                  </div>
                ) : (
                  <div className="table-responsive" style={{ maxHeight: '380px', overflowY: 'auto' }}>
                    <PaginatedTable as={Table} hover size="sm" className="mb-0">
                      <thead className="bg-light sticky-top" style={{ top: 0, zIndex: 10 }}>
                        <tr className="small">
                          <th style={{ width: '36px' }} className="text-center">
                            <Form.Check
                              type="checkbox"
                              checked={allSelected}
                              ref={el => { if (el) el.indeterminate = someSelected; }}
                              onChange={toggleAll}
                              title="Select all visible"
                            />
                          </th>
                          <th className="fw-normal">Employee</th>
                          <th className="fw-normal d-none d-sm-table-cell">Dept / Designation</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.length === 0 ? (
                          <tr><td colSpan="3" className="text-center py-4 text-muted small">No employees found</td></tr>
                        ) : filtered.map(emp => {
                          const checked = selectedIds.has(emp.employee_id);
                          return (
                            <tr
                              key={emp.employee_id}
                              className={checked ? 'table-primary' : ''}
                              style={{ cursor: 'pointer' }}
                              onClick={() => toggleOne(emp.employee_id)}
                            >
                              <td className="text-center" onClick={e => e.stopPropagation()}>
                                <Form.Check
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleOne(emp.employee_id)}
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
                          );
                        })}
                      </tbody>
                    </PaginatedTable>
                  </div>
                )}
                <div className="mt-1 small text-muted">
                  Showing {filtered.length} of {employees.length} employees
                  {selectedIds.size > 0 && <> · <strong className="text-primary">{selectedIds.size} selected</strong></>}
                </div>
              </Card.Body>
            </Card>
          </Col>

          {/* RIGHT: Fields + Submit */}
          <Col lg={5}>
            <Card className="border-0 shadow-sm mb-3">
              <Card.Header className="bg-light py-2 d-flex justify-content-between align-items-center">
                <h6 className="mb-0 small fw-semibold">
                  <FaInfoCircle className="me-2" size={13} />
                  Fields to Update
                </h6>
                <Button variant="link" size="sm" className="p-0 text-decoration-none small" onClick={selectAllFields}>
                  {selectedFields.length === FIELD_OPTIONS.length ? 'Deselect All' : 'Select All'}
                </Button>
              </Card.Header>
              <Card.Body className="p-2 p-md-3">
                <div className="d-flex flex-column gap-1">
                  {FIELD_OPTIONS.map(f => (
                    <div
                      key={f.value}
                      className={`p-2 rounded border small d-flex align-items-center gap-2 ${selectedFields.includes(f.value) ? 'bg-primary bg-opacity-10 border-primary' : ''}`}
                      style={{ cursor: 'pointer' }}
                      onClick={() => toggleField(f.value)}
                    >
                      <Form.Check
                        type="checkbox"
                        checked={selectedFields.includes(f.value)}
                        onChange={() => toggleField(f.value)}
                        onClick={e => e.stopPropagation()}
                      />
                      <span className="flex-shrink-0">{f.icon}</span>
                      <span>{f.label}</span>
                    </div>
                  ))}
                </div>

                {/* Document sub-selection */}
                {selectedFields.includes('documents') && (
                  <div className="mt-3 p-2 bg-light rounded">
                    <small className="fw-semibold d-flex align-items-center mb-2">
                      <FaUpload className="me-1 text-success" size={11} /> Select document types:
                    </small>
                    <div className="d-flex flex-column gap-1">
                      {DOC_TYPES.map(d => (
                        <Form.Check
                          key={d.value}
                          type="checkbox"
                          id={`doc-${d.value}`}
                          checked={selectedDocs.includes(d.value)}
                          onChange={() => toggleDoc(d.value)}
                          label={<span className="small d-flex align-items-center gap-1">{d.icon} {d.label}</span>}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </Card.Body>
            </Card>

            {/* Submit */}
            <Button
              type="submit"
              variant="primary"
              className="w-100 d-flex align-items-center justify-content-center gap-2"
              disabled={loading || fetching || selectedIds.size === 0 || selectedFields.length === 0}
            >
              {loading
                ? <><Spinner size="sm" animation="border" />Sending...</>
                : <><FaPaperPlane size={13} />
                    Send to {selectedIds.size > 0 ? `${selectedIds.size} Employee${selectedIds.size > 1 ? 's' : ''}` : 'Selected'}
                  </>}
            </Button>

            {selectedIds.size > 0 && selectedFields.length > 0 && (
              <div className="mt-2 p-2 bg-light rounded small text-muted">
                <FaCheckCircle className="me-1 text-success" size={11} />
                Will send <strong>{selectedFields.length}</strong> field request{selectedFields.length > 1 ? 's' : ''} to <strong>{selectedIds.size}</strong> employee{selectedIds.size > 1 ? 's' : ''}.
              </div>
            )}
          </Col>
        </Row>
      </Form>
    </div>
  );
};

export default SendUpdateRequest;
