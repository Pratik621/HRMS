import PaginatedTable from '../Common/PaginatedTable';
// src/components/Employee/ManagerShiftUpdate.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Card, Form, Button, Alert, Spinner, Badge, Table } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import {
  FaClock, FaUserTie, FaCheckCircle, FaExclamationTriangle,
  FaSyncAlt, FaUsers, FaCalendarAlt, FaArrowLeft,
} from 'react-icons/fa';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';

const SHIFT_OPTIONS = [
  '9:00 AM - 6:00 PM',
  '10:00 AM - 7:00 PM',
  '11:00 AM - 8:00 PM',
  '8:00 AM - 5:00 PM',
  '7:00 AM - 4:00 PM',
  '12:00 PM - 9:00 PM',
  '2:00 PM - 11:00 PM',
  '6:00 PM - 3:00 AM',
  '10:00 PM - 7:00 AM',
];

const today = () => new Date().toISOString().split('T')[0];

const fmt = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

const ManagerShiftUpdate = ({ embedded = false }) => {
  const navigate = useNavigate();
  const [team, setTeam]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ type: '', text: '' });

  // employee selection
  const [selectedIds, setSelectedIds] = useState(new Set());

  // shift
  const [shift, setShift]         = useState('');
  const [custom, setCustom]       = useState('');
  const [useCustom, setUseCustom] = useState(false);

  // date range
  const [fromDate, setFromDate] = useState(today());
  const [toDate, setToDate]     = useState(today());

  const [updating, setUpdating] = useState(false);
  const allCheckRef = useRef(null);

  useEffect(() => { fetchTeam(); }, []);

  // keep indeterminate state on "select all" checkbox
  useEffect(() => {
    if (!allCheckRef.current) return;
    const all  = team.length > 0 && selectedIds.size === team.length;
    const some = selectedIds.size > 0 && selectedIds.size < team.length;
    allCheckRef.current.checked       = all;
    allCheckRef.current.indeterminate = some;
  }, [selectedIds, team]);

  const fetchTeam = async () => {
    try {
      setLoading(true);
      const res = await axios.get(API_ENDPOINTS.MANAGER_TEAM);
      setTeam(res.data.team || []);
      setSelectedIds(new Set());
    } catch (err) {
      showMsg('danger', err.response?.data?.message || 'Failed to load team');
    } finally {
      setLoading(false);
    }
  };

  const showMsg = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 6000);
  };

  const toggleEmployee = (id) =>
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const toggleAll = () =>
    setSelectedIds(selectedIds.size === team.length ? new Set() : new Set(team.map(e => e.employee_id)));

  const shiftVal = useCustom ? custom.trim() : shift;

  const handleFlexibleToggle = async (employeeId, enabled) => {
    const employee = team.find(item => item.employee_id === employeeId);
    if (!employee) return;

    try {
      const res = await axios.put(API_ENDPOINTS.MANAGER_UPDATE_SHIFT(employeeId), {
        isFlexibleShift: enabled,
      });
      setTeam(prev => prev.map(item => item.employee_id === employeeId ? { ...item, isFlexibleShift: enabled } : item));
      showMsg('success', `${employee.first_name} ${employee.last_name} ${enabled ? 'enabled' : 'disabled'} flexible shift.`);
      if (res?.data?.employee) {
        setTeam(prev => prev.map(item => item.employee_id === employeeId ? { ...item, ...res.data.employee } : item));
      }
    } catch (err) {
      showMsg('danger', err.response?.data?.message || 'Failed to update flexible shift');
    }
  };

  const handleUpload = async () => {
    if (selectedIds.size === 0) return showMsg('warning', 'Select at least one employee.');
    if (!shiftVal)              return showMsg('warning', 'Select or enter a shift timing.');
    if (!fromDate || !toDate)   return showMsg('warning', 'Select a date range.');
    if (fromDate > toDate)      return showMsg('warning', '"From" date cannot be after "To" date.');

    setUpdating(true);
    const ids = [...selectedIds];
    let ok = 0;
    const failed = [];

    await Promise.all(ids.map(async id => {
      try {
        await axios.put(API_ENDPOINTS.MANAGER_UPDATE_SHIFT(id), {
          shift_timing:    shiftVal,
          effective_from:  fromDate,
          effective_until: toDate,
        });
        ok++;
      } catch {
        const e = team.find(x => x.employee_id === id);
        failed.push(e ? `${e.first_name} ${e.last_name}` : id);
      }
    }));

    setTeam(prev => prev.map(e =>
      selectedIds.has(e.employee_id) && !failed.some(f => f.includes(e.first_name))
        ? { ...e, shift_timing: shiftVal } : e
    ));

    if (failed.length === 0)
      showMsg('success', `Shift "${shiftVal}" applied to ${ok} employee${ok > 1 ? 's' : ''} · ${fmt(fromDate)} – ${fmt(toDate)}`);
    else
      showMsg('warning', `Updated ${ok}. Failed: ${failed.join(', ')}.`);

    setSelectedIds(new Set());
    setShift(''); setCustom(''); setUseCustom(false);
    setFromDate(today()); setToDate(today());
    setUpdating(false);
  };

  if (loading) return (
    <div className="d-flex justify-content-center align-items-center" style={{ minHeight: 260 }}>
      <Spinner animation="border" variant="primary" />
    </div>
  );

  return (
    <div className={embedded ? '' : 'p-2 p-md-3 p-lg-4'}>

      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-3">
        {!embedded && (
          <h5 className="mb-0 d-flex align-items-center">
            <FaClock className="me-2 text-primary" /> Upload Time
          </h5>
        )}
        <div className={`d-flex gap-2 ${embedded ? 'ms-auto' : ''}`}>
          <Button variant="outline-primary" size="sm" onClick={fetchTeam}>
            <FaSyncAlt className="me-1" size={12} /> Refresh
          </Button>
          {!embedded && (
            <button
              className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1"
              onClick={() => navigate(-1)}
            >
              <FaArrowLeft size={12} /> Back
            </button>
          )}
        </div>
      </div>

      {message.text && (
        <Alert variant={message.type} dismissible onClose={() => setMessage({ type: '', text: '' })} className="mb-3 py-2 small">
          {message.type === 'success'
            ? <FaCheckCircle className="me-2" />
            : <FaExclamationTriangle className="me-2" />}
          {message.text}
        </Alert>
      )}

      {team.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <Card.Body className="text-center py-5">
            <FaUserTie size={40} className="text-muted mb-3 opacity-50" />
            <p className="text-muted mb-0">No team members found under your reporting.</p>
          </Card.Body>
        </Card>
      ) : (
        <div className="d-flex flex-column gap-3">

          {/* ── Shift + Date range card ── */}
          <Card className="border-0 shadow-sm">
            <Card.Header className="bg-light py-2">
              <h6 className="mb-0 small fw-semibold">
                <FaClock className="me-2" size={13} />Upload Time Settings
              </h6>
            </Card.Header>
            <Card.Body className="p-3">
              <div className="row g-3">

                {/* Shift timing */}
                <div className="col-12 col-md-4">
                  <Form.Label className="small fw-semibold text-muted">
                    Shift Timing <span className="text-danger">*</span>
                  </Form.Label>
                  <Form.Check
                    type="checkbox"
                    label="Enter custom"
                    checked={useCustom}
                    onChange={e => { setUseCustom(e.target.checked); setShift(''); setCustom(''); }}
                    className="mb-1 small"
                  />
                  {useCustom ? (
                    <Form.Control
                      type="text" size="sm"
                      placeholder="e.g. 9:00 AM - 6:00 PM"
                      value={custom}
                      onChange={e => setCustom(e.target.value)}
                    />
                  ) : (
                    <Form.Select size="sm" value={shift} onChange={e => setShift(e.target.value)}>
                      <option value="">-- Select shift --</option>
                      {SHIFT_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </Form.Select>
                  )}
                  <Form.Text className="text-muted" style={{ fontSize: 11 }}>
                    Format: HH:MM AM/PM – HH:MM AM/PM
                  </Form.Text>
                </div>

                {/* Date range */}
                <div className="col-12 col-md-5">
                  <Form.Label className="small fw-semibold text-muted">
                    <FaCalendarAlt className="me-1" size={11} />
                    Applicable Date Range <span className="text-danger">*</span>
                  </Form.Label>
                  <div className="d-flex align-items-center gap-2">
                    <div className="flex-grow-1">
                      <Form.Text className="text-muted d-block mb-1" style={{ fontSize: 11 }}>From</Form.Text>
                      <Form.Control
                        type="date" size="sm"
                        value={fromDate}
                        onChange={e => {
                          setFromDate(e.target.value);
                          if (e.target.value > toDate) setToDate(e.target.value);
                        }}
                      />
                    </div>
                    <span className="text-muted small pt-3">→</span>
                    <div className="flex-grow-1">
                      <Form.Text className="text-muted d-block mb-1" style={{ fontSize: 11 }}>To</Form.Text>
                      <Form.Control
                        type="date" size="sm"
                        value={toDate}
                        min={fromDate}
                        onChange={e => setToDate(e.target.value)}
                      />
                    </div>
                  </div>
                  {fromDate && toDate && fromDate <= toDate && (
                    <div className="mt-1" style={{ fontSize: 11 }}>
                      <Badge bg="light" text="dark" className="border">
                        <FaCalendarAlt className="me-1" size={9} />
                        {fmt(fromDate)} – {fmt(toDate)}
                        {' '}·{' '}
                        {Math.round((new Date(toDate) - new Date(fromDate)) / 86400000) + 1} day
                        {Math.round((new Date(toDate) - new Date(fromDate)) / 86400000) + 1 !== 1 ? 's' : ''}
                      </Badge>
                    </div>
                  )}
                </div>

                {/* Summary + apply btn */}
                <div className="col-12 col-md-3 d-flex flex-column justify-content-end">
                  {shiftVal && selectedIds.size > 0 && fromDate && toDate && (
                    <div className="small text-muted mb-2 p-2 rounded" style={{ background: '#f0f9ff', border: '1px solid #bae6fd', fontSize: 11 }}>
                      <div><strong>{selectedIds.size}</strong> employee{selectedIds.size > 1 ? 's' : ''}</div>
                      <div className="text-primary fw-semibold">{shiftVal}</div>
                      <div>{fmt(fromDate)} – {fmt(toDate)}</div>
                    </div>
                  )}
                  <Button
                    variant="primary" size="sm"
                    onClick={handleUpload}
                    disabled={updating || selectedIds.size === 0 || !shiftVal || !fromDate || !toDate || fromDate > toDate}
                    className="w-100"
                  >
                    {updating
                      ? <><Spinner size="sm" animation="border" className="me-1" />Applying…</>
                      : <><FaClock className="me-1" size={11} />Apply Shift</>}
                  </Button>
                </div>

              </div>
            </Card.Body>
          </Card>

          {/* ── Employee table ── */}
          <Card className="border-0 shadow-sm">
            <Card.Header className="bg-light py-2">
              <h6 className="mb-0 small fw-semibold">
                <FaUsers className="me-2" size={13} />
                Select Employees
                {selectedIds.size > 0 && (
                  <Badge bg="primary" pill className="ms-2">{selectedIds.size} selected</Badge>
                )}
              </h6>
            </Card.Header>
            <Card.Body className="p-0">
              <div className="table-responsive">
                <PaginatedTable searchable as={Table} hover size="sm" className="mb-0 align-middle">
                  <thead className="bg-light">
                    <tr className="small">
                      <th className="text-center" style={{ width: 40 }}>
                        <Form.Check type="checkbox" ref={allCheckRef} onChange={toggleAll} />
                      </th>
                      <th>Employee</th>
                      <th className="d-none d-md-table-cell">Department</th>
                      <th className="d-none d-sm-table-cell">Designation</th>
                      <th>Current Shift</th>
                      <th className="text-center">Flexible Shift</th>
                    </tr>
                  </thead>
                  <tbody>
                    {team.map(emp => {
                      const checked = selectedIds.has(emp.employee_id);
                      return (
                        <tr
                          key={emp.employee_id}
                          className={checked ? 'table-primary' : ''}
                          style={{ cursor: 'pointer' }}
                          onClick={() => toggleEmployee(emp.employee_id)}
                        >
                          <td className="text-center" onClick={e => e.stopPropagation()}>
                            <Form.Check
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleEmployee(emp.employee_id)}
                            />
                          </td>
                          <td className="small">
                            <div className="fw-semibold">{emp.first_name} {emp.last_name}</div>
                            <div className="text-muted" style={{ fontSize: 11 }}>{emp.employee_id}</div>
                          </td>
                          <td className="small d-none d-md-table-cell">{emp.department}</td>
                          <td className="small d-none d-sm-table-cell">{emp.designation}</td>
                          <td className="small">
                            <Badge bg={checked && shiftVal ? 'success' : 'info'} className="px-2 py-1">
                              <FaClock className="me-1" size={9} />
                              {checked && shiftVal ? shiftVal : (emp.shift_timing || 'Not set')}
                            </Badge>
                          </td>
                          <td className="text-center" onClick={e => e.stopPropagation()}>
                            <Form.Check
                              type="switch"
                              checked={Boolean(emp.isFlexibleShift)}
                              onChange={(e) => handleFlexibleToggle(emp.employee_id, e.target.checked)}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </PaginatedTable>
              </div>

              {selectedIds.size > 0 && shiftVal && fromDate && toDate && (
                <div className="px-3 py-2 bg-light border-top small text-muted">
                  <FaCheckCircle className="me-1 text-success" size={12} />
                  <strong>{selectedIds.size}</strong> employee{selectedIds.size > 1 ? 's' : ''} will be updated to{' '}
                  <Badge bg="success" className="ms-1 me-1">{shiftVal}</Badge>
                  from <strong>{fmt(fromDate)}</strong> to <strong>{fmt(toDate)}</strong>
                </div>
              )}
            </Card.Body>
          </Card>

        </div>
      )}
    </div>
  );
};

export default ManagerShiftUpdate;
