import PaginatedTable from '../Common/PaginatedTable';
import React, { useState, useEffect, useMemo } from 'react';
import {
  Container, Row, Col, Card, Table, Button, Form, Modal,
  Badge, Spinner, Alert, InputGroup
} from 'react-bootstrap';
import {
  FaSearch, FaTrash, FaCheckSquare, FaSquare, FaFilter,
  FaDownload, FaUsers, FaReceipt, FaWallet, FaChartBar,
  FaCalendarAlt, FaFileExcel, FaFilePdf, FaChevronLeft,
  FaChevronRight, FaUserCircle, FaInfoCircle, FaClock,
  FaCheckCircle, FaTimesCircle, FaPlus
} from 'react-icons/fa';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

const fmtCurrency = (v) =>
  `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtMonthLabel = (month) => MONTHS[(month || 1) - 1] || '';
const buildName = (emp) => `${emp?.first_name || ''} ${emp?.middle_name || ''} ${emp?.last_name || ''}`.trim();
const getInitials = (name) => (name || 'U').split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase();

const now = new Date();
const DEFAULT_MONTH = now.getMonth() + 1;
const DEFAULT_YEAR  = now.getFullYear();

export default function DeductionManager() {
  const [employees, setEmployees] = useState([]);
  const [deductions, setDeductions] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filterMonth, setFilterMonth] = useState(DEFAULT_MONTH);
  const [filterYear, setFilterYear] = useState(DEFAULT_YEAR);
  const [formMonth, setFormMonth] = useState(DEFAULT_MONTH);
  const [formYear, setFormYear] = useState(DEFAULT_YEAR);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [deductionDate, setDeductionDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [modalEmployeeSearch, setModalEmployeeSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');
  const [selectedRow, setSelectedRow] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const PAGE_SIZE = 8;

  useEffect(() => { fetchEmployees(); }, []);
  useEffect(() => { fetchDeductions(); }, [filterMonth, filterYear]);
  useEffect(() => { setPage(1); }, [search, departmentFilter, statusFilter, filterMonth, filterYear]);

  const fetchEmployees = async () => {
    try {
      const res = await axios.get(API_ENDPOINTS.EMPLOYEES);
      const list = (res.data?.employees || res.data || []).filter(e => e.is_active !== false);
      setEmployees(list);
    } catch {
      setError('Failed to load employees');
    } finally {
      setLoading(false);
    }
  };

  const fetchDeductions = async () => {
    try {
      const res = await axios.get(`${API_ENDPOINTS.DEDUCTIONS}?month=${filterMonth}&year=${filterYear}`);
      setDeductions(res.data?.data || []);
    } catch (err) {
      console.error('fetch deductions error', err);
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === filteredEmployees.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredEmployees.map(e => e.employee_id)));
    }
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!selectedIds.size) return setError('Select at least one employee.');
    if (!amount || parseFloat(amount) <= 0) return setError('Enter a valid deduction amount.');
    if (!reason.trim()) return setError('Enter a reason for deduction.');

    setSaving(true);
    try {
      await axios.post(API_ENDPOINTS.DEDUCTIONS, {
        employee_ids: Array.from(selectedIds),
        amount: parseFloat(amount),
        reason: reason.trim(),
        deduction_date: deductionDate,
        month: formMonth,
        year: formYear,
      });
      setSuccess(`Deduction of ${fmtCurrency(amount)} applied to ${selectedIds.size} employee(s) for ${MONTHS[formMonth - 1]} ${formYear}.`);
      setSelectedIds(new Set());
      setAmount('');
      setReason('');
      setDeductionDate(new Date().toISOString().split('T')[0]);
      setFilterMonth(formMonth);
      setFilterYear(formYear);
      setShowAddModal(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save deductions');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(API_ENDPOINTS.DEDUCTION_DELETE(id));
      setDeductions(prev => prev.filter(d => d.id !== id));
      setSelectedRow(null);
      setDrawerOpen(false);
    } catch {
      setError('Failed to delete deduction');
    }
  };

  const exportExcel = () => {
    const rows = filteredRows.map((row, i) => ({
      'Sr': i + 1,
      'Employee ID': row.employee_id,
      'Name': row.name,
      'Department': row.department,
      'Designation': row.designation,
      'Month': MONTHS[(filterMonth || 1) - 1],
      'Year': filterYear,
      'Deduction Date': fmtDate(row.deduction_date),
      'Amount (₹)': Number(row.amount || 0),
      'Reason': row.reason,
      'Added By': row.added_by || 'Admin',
      'Status': row.status,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Deductions');
    XLSX.writeFile(wb, `employee_deductions_${fmtMonthLabel(filterMonth)}_${filterYear}.xlsx`);
  };

  const exportPdf = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('Employee Deductions Report', 14, 18);
    doc.setFontSize(10);
    doc.text(`${fmtMonthLabel(filterMonth)} ${filterYear}`, 14, 28);
    let y = 40;
    filteredRows.slice(0, 18).forEach((row, idx) => {
      doc.text(`${idx + 1}. ${row.name} — ${fmtCurrency(row.amount || 0)}`, 14, y);
      y += 7;
      doc.text(`${row.department} • ${row.reason || 'No reason'}`, 20, y);
      y += 8;
    });
    doc.save(`employee_deductions_${fmtMonthLabel(filterMonth)}_${filterYear}.pdf`);
  };

  const filteredEmployees = useMemo(() => {
    const q = search.toLowerCase();
    return employees.filter(e => {
      const fullName = buildName(e).toLowerCase();
      const matchesSearch = !q || fullName.includes(q) || e.employee_id?.toLowerCase().includes(q) || e.department?.toLowerCase().includes(q) || e.designation?.toLowerCase().includes(q);
      const matchesDepartment = departmentFilter === 'All' || e.department === departmentFilter;
      return matchesSearch && matchesDepartment;
    });
  }, [employees, search, departmentFilter]);

  const modalEmployeeOptions = useMemo(() => {
    const q = modalEmployeeSearch.toLowerCase().trim();
    return filteredEmployees.filter(emp => {
      if (!q) return true;
      const fullName = buildName(emp).toLowerCase();
      return fullName.includes(q) || emp.employee_id?.toLowerCase().includes(q);
    });
  }, [filteredEmployees, modalEmployeeSearch]);

  // An employee can have several deduction line items in the same month (e.g. a late
  // fine + a damage charge) — group all of them per employee instead of keeping only one,
  // otherwise the amount/reason shown here (and the Total Deduction Amount stat below)
  // silently drops every deduction but the last one loaded for that employee.
  const deductionMap = useMemo(() => {
    const map = new Map();
    deductions.forEach(d => {
      const list = map.get(d.employee_id) || [];
      list.push(d);
      map.set(d.employee_id, list);
    });
    return map;
  }, [deductions]);

  const filteredRows = useMemo(() => {
    return filteredEmployees.map(emp => {
      const empDeductions = deductionMap.get(emp.employee_id) || [];
      const amount = empDeductions.reduce((sum, d) => sum + Number(d.amount || 0), 0);
      const status = empDeductions.length > 0 ? 'Deduction Exists' : 'No Deduction';
      const latest = empDeductions.reduce((a, b) => (
        new Date(b.created_at || b.deduction_date || 0) > new Date(a?.created_at || a?.deduction_date || 0) ? b : a
      ), empDeductions[0]);
      return {
        employee_id: emp.employee_id,
        name: buildName(emp),
        department: emp.department || '—',
        designation: emp.designation || '—',
        amount,
        status,
        deduction_date: latest?.deduction_date || null,
        reason: empDeductions.length > 1
          ? empDeductions.map(d => `${d.reason || 'No reason'}: ${fmtCurrency(d.amount)}`).join('; ')
          : (latest?.reason || 'No additional deduction applied this month.'),
        added_by: latest?.added_by || latest?.created_by || latest?.admin_name || 'Admin',
        created_at: latest?.created_at || latest?.deduction_date || null,
        deductions: empDeductions,
        employee: emp,
      };
    }).filter(row => {
      if (statusFilter === 'All') return true;
      if (statusFilter === 'with') return row.status === 'Deduction Exists';
      return row.status === 'No Deduction';
    });
  }, [filteredEmployees, deductionMap, statusFilter]);

  const sortedRows = useMemo(() => {
    const rows = [...filteredRows];
    rows.sort((a, b) => {
      const direction = sortDirection === 'asc' ? 1 : -1;
      const getValue = (row) => {
        switch (sortKey) {
          case 'amount': return Number(row.amount || 0);
          case 'date': return new Date(row.deduction_date || 0).getTime();
          case 'department': return row.department?.toLowerCase() || '';
          case 'name': default: return row.name?.toLowerCase() || '';
        }
      };
      const av = getValue(a);
      const bv = getValue(b);
      if (typeof av === 'number' && typeof bv === 'number') {
        return (av - bv) * direction;
      }
      return av > bv ? direction : av < bv ? -direction : 0;
    });
    return rows;
  }, [filteredRows, sortKey, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const paginatedRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return sortedRows.slice(start, start + PAGE_SIZE);
  }, [sortedRows, page]);

  const totalDeducted = filteredRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const employeesWithDeductions = filteredRows.filter(row => row.amount > 0).length;
  const averageDeduction = employeesWithDeductions > 0 ? totalDeducted / employeesWithDeductions : 0;

  const departmentOptions = useMemo(() => ['All', ...new Set(employees.map(e => e.department).filter(Boolean))], [employees]);
  const years = Array.from({ length: 5 }, (_, i) => DEFAULT_YEAR - 2 + i);
  const allSelected = filteredEmployees.length > 0 && selectedIds.size === filteredEmployees.length;

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const openDrawer = (row) => {
    setSelectedRow(row);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setSelectedRow(null);
  };

  const highlightText = (text, query) => {
    if (!query) return text;
    const safe = String(text || '');
    const parts = safe.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'));
    return parts.map((part, idx) => part.toLowerCase() === query.toLowerCase() ? <mark key={`${part}-${idx}`} style={{ background: '#dbeafe', padding: '0 2px', borderRadius: 4 }}>{part}</mark> : <span key={`${part}-${idx}`}>{part}</span>);
  };

  return (
    <Container fluid className="py-4">
      <div className="d-flex flex-column flex-lg-row align-items-lg-center justify-content-between gap-3 mb-4">
        <div className="d-flex align-items-center gap-3">
          <div style={{ background: "#1f4e79", borderRadius: 14, padding: '12px 14px', boxShadow: '0 10px 24px rgba(37,99,235,0.18)' }}>
            <FaReceipt color="#fff" size={22} />
          </div>
          <div>
            <h3 className="mb-1 fw-bold text-dark">Employee Deductions</h3>
            <div className="text-muted" style={{ fontSize: 13 }}>View and manage all employee deductions added by the administrator.</div>
          </div>
        </div>
        <div className="d-flex align-items-center gap-2">
          <Badge bg="light" text="dark" className="px-3 py-2">{MONTHS[filterMonth - 1]} {filterYear}</Badge>
          <Badge bg="primary" className="px-3 py-2">{filteredRows.length} employees</Badge>
        </div>
      </div>

      <Card className="border-0 shadow-sm mb-4" style={{ borderRadius: 18 }}>
        <Card.Body style={{ padding: 20 }}>
          <div className="d-flex flex-wrap gap-2 align-items-center justify-content-between mb-3">
            <div className="d-flex align-items-center gap-2 text-primary fw-semibold">
              <FaFilter /> Filter & Export
            </div>
            <div className="d-flex flex-wrap gap-2">
              <Button size="sm" variant="primary" onClick={() => { setError(''); setSuccess(''); setShowAddModal(true); }}><FaPlus className="me-1" /> Add Deduction</Button>
              <Button size="sm" variant="outline-primary" onClick={() => { setSearch(searchInput); }}><FaSearch className="me-1" /> Search</Button>
              <Button size="sm" variant="outline-secondary" onClick={() => { setSearchInput(''); setSearch(''); setDepartmentFilter('All'); setStatusFilter('All'); }}>Reset</Button>
              <Button size="sm" variant="outline-success" onClick={exportExcel}><FaFileExcel className="me-1" /> Excel</Button>
              <Button size="sm" variant="outline-danger" onClick={exportPdf}><FaFilePdf className="me-1" /> PDF</Button>
            </div>
          </div>
          <Row className="g-3">
            <Col xs={6} sm={6} md={3}>
              <Form.Label className="small fw-semibold mb-1">Month</Form.Label>
              <Form.Select size="sm" value={filterMonth} onChange={e => setFilterMonth(parseInt(e.target.value))}>
                {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </Form.Select>
            </Col>
            <Col xs={6} sm={6} md={2}>
              <Form.Label className="small fw-semibold mb-1">Year</Form.Label>
              <Form.Select size="sm" value={filterYear} onChange={e => setFilterYear(parseInt(e.target.value))}>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </Form.Select>
            </Col>
            <Col xs={12} sm={6} md={3}>
              <Form.Label className="small fw-semibold mb-1">Department</Form.Label>
              <Form.Select size="sm" value={departmentFilter} onChange={e => setDepartmentFilter(e.target.value)}>
                {departmentOptions.map(dep => <option key={dep} value={dep}>{dep}</option>)}
              </Form.Select>
            </Col>
            <Col xs={12} sm={6} md={2}>
              <Form.Label className="small fw-semibold mb-1">Status</Form.Label>
              <Form.Select size="sm" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="All">All</option>
                <option value="with">Deduction Exists</option>
                <option value="without">No Deduction</option>
              </Form.Select>
            </Col>
            <Col xs={12} sm={6} md={2}>
              <Form.Label className="small fw-semibold mb-1">Employee Search</Form.Label>
              <Form.Control size="sm" placeholder="Name / ID" value={searchInput} onChange={e => setSearchInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && setSearch(searchInput)} />
            </Col>
          </Row>
        </Card.Body>
      </Card>

      <Row className="g-3 mb-4">
        {[
          { label: 'Total Employees', value: filteredRows.length, sub: 'Active employees in view', icon: <FaUsers />, bg: "#eef4fb" },
          { label: 'Employees with Deductions', value: employeesWithDeductions, sub: 'Affected in selected month', icon: <FaReceipt />, bg: "#eef4fb" },
          { label: 'Total Deduction Amount', value: fmtCurrency(totalDeducted), sub: 'Collected from this month', icon: <FaWallet />, bg: "#eef4fb" },
          { label: 'Average Deduction', value: fmtCurrency(averageDeduction), sub: 'Per employee with deduction', icon: <FaChartBar />, bg: "#eef4fb" }
        ].map((card, index) => (
          <Col xs={12} sm={6} xl={3} key={card.label}>
            <Card className="border-0 shadow-sm h-100 hover-card" style={{ borderRadius: 18, background: card.bg, transition: 'transform .2s ease, box-shadow .2s ease' }}>
              <Card.Body className="p-4">
                <div className="d-flex align-items-center justify-content-between mb-3">
                  <div style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {card.icon}
                  </div>
                  <Badge bg="light" text="dark" style={{ fontSize: 11 }}>Live</Badge>
                </div>
                <div className="fw-bold" style={{ fontSize: 24 }}>{card.value}</div>
                <div className="text-muted mt-1" style={{ fontSize: 13 }}>{card.label}</div>
                <div className="small text-muted mt-2">{card.sub}</div>
              </Card.Body>
            </Card>
          </Col>
        ))}
      </Row>

      <Card className="border-0 shadow-sm" style={{ borderRadius: 20, overflow: 'hidden' }}>
        <Card.Header className="bg-white border-bottom py-3 px-4">
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
            <div>
              <div className="fw-bold text-dark">Employee deduction ledger</div>
              <div className="small text-muted">Review salaries, reasons, and admin notes for the selected month.</div>
            </div>
            <div className="d-flex flex-wrap gap-2 align-items-center">
              <div className="d-flex align-items-center gap-2 text-muted small">
                <FaCalendarAlt /> Monthly timeline
              </div>
            </div>
          </div>
          <div className="d-flex flex-wrap gap-2 mt-3">
            {MONTHS.map((m, idx) => {
              const monthNumber = idx + 1;
              const active = monthNumber === filterMonth;
              return (
                <button key={m} type="button" onClick={() => setFilterMonth(monthNumber)} style={{ border: active ? '1px solid #2563eb' : '1px solid #e5e7eb', background: active ? '#eff6ff' : '#fff', color: active ? "#1f4e79" : '#6b7280', borderRadius: 999, padding: '6px 10px', fontSize: 12, fontWeight: 600 }}>
                  {m.slice(0, 3)}
                </button>
              );
            })}
          </div>
        </Card.Header>

        <Card.Body className="p-0">
          {loading ? (
            <div className="text-center py-5"><Spinner animation="border" variant="primary" /></div>
          ) : paginatedRows.length === 0 ? (
            <div className="text-center py-5 px-4">
              <div style={{ width: 90, height: 90, borderRadius: 24, background: '#f8fafc', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                <FaReceipt size={36} color="#94a3b8" />
              </div>
              <h5 className="fw-bold mb-2">No deductions found for this month.</h5>
              <p className="text-muted mb-3">Try switching to a different month or change your filters.</p>
              <Button variant="outline-primary" onClick={() => setFilterMonth(DEFAULT_MONTH)}>Change Month</Button>
            </div>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <PaginatedTable as={Table} paginate={false} hover className="mb-0 align-middle" style={{ minWidth: 980 }}>
                  <thead className="bg-light" style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                    <tr>
                      <th className="ps-4">Employee</th>
                      <th onClick={() => handleSort('department')} style={{ cursor: 'pointer' }}>Department</th>
                      <th onClick={() => handleSort('name')} style={{ cursor: 'pointer' }}>Designation</th>
                      <th onClick={() => handleSort('date')} style={{ cursor: 'pointer' }}>Selected Month</th>
                      <th onClick={() => handleSort('amount')} style={{ cursor: 'pointer' }}>Deduction Amount</th>
                      <th>Reason</th>
                      <th>Added By</th>
                      <th>Status</th>
                      <th className="text-center pe-4">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedRows.map(row => (
                      <tr key={row.employee_id} style={{ transition: 'background .2s ease' }}>
                        <td className="ps-4">
                          <div className="d-flex align-items-center gap-3">
                            <div style={{ width: 40, height: 40, borderRadius: '50%', background: "#1f4e79", color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                              {getInitials(row.name)}
                            </div>
                            <div>
                              <div className="fw-semibold">{highlightText(row.name, search)}</div>
                              <div className="small text-muted">{row.employee_id}</div>
                            </div>
                          </div>
                        </td>
                        <td>{highlightText(row.department, search)}</td>
                        <td>{highlightText(row.designation, search)}</td>
                        <td>{fmtMonthLabel(filterMonth)} {filterYear}</td>
                        <td className="fw-bold text-danger">{row.amount > 0 ? fmtCurrency(row.amount) : '—'}</td>
                        <td><span style={{ maxWidth: 220, display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.reason}>{row.reason}</span></td>
                        <td>{row.added_by || 'Admin'}</td>
                        <td><Badge bg={row.amount > 0 ? 'danger' : 'secondary'}>{row.status}</Badge></td>
                        <td className="text-center pe-4">
                          <Button size="sm" variant="outline-primary" onClick={() => openDrawer(row)}>View Details</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </PaginatedTable>
              </div>
              <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 px-4 py-3 border-top bg-light">
                <div className="small text-muted">Showing {paginatedRows.length} of {sortedRows.length} employees</div>
                <div className="d-flex align-items-center gap-2">
                  <Button size="sm" variant="outline-secondary" onClick={() => setPage(prev => Math.max(1, prev - 1))} disabled={page === 1}><FaChevronLeft className="me-1" /> Prev</Button>
                  <span className="small fw-semibold">Page {page} of {totalPages}</span>
                  <Button size="sm" variant="outline-secondary" onClick={() => setPage(prev => Math.min(totalPages, prev + 1))} disabled={page === totalPages}>Next <FaChevronRight className="ms-1" /></Button>
                </div>
              </div>
            </>
          )}
        </Card.Body>
      </Card>

      {error && <Alert variant="danger" className="mt-3">{error}</Alert>}
      {success && <Alert variant="success" className="mt-3">{success}</Alert>}

      <Modal show={showAddModal} onHide={() => setShowAddModal(false)} size="lg" centered>
        <Modal.Header closeButton>
          <Modal.Title className="fw-semibold">Add deduction</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form onSubmit={handleSubmit}>
            <Row className="g-3">
              <Col xs={12} sm={6}>
                <Form.Group>
                  <Form.Label className="small fw-semibold">Amount</Form.Label>
                  <Form.Control type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Enter amount" required />
                </Form.Group>
              </Col>
              <Col xs={12} sm={6}>
                <Form.Group>
                  <Form.Label className="small fw-semibold">Deduction date</Form.Label>
                  <Form.Control type="date" value={deductionDate} onChange={(e) => setDeductionDate(e.target.value)} required />
                </Form.Group>
              </Col>
              <Col xs={6}>
                <Form.Group>
                  <Form.Label className="small fw-semibold">Month</Form.Label>
                  <Form.Select value={formMonth} onChange={(e) => setFormMonth(parseInt(e.target.value))}>
                    {MONTHS.map((m, idx) => <option key={m} value={idx + 1}>{m}</option>)}
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col xs={6}>
                <Form.Group>
                  <Form.Label className="small fw-semibold">Year</Form.Label>
                  <Form.Select value={formYear} onChange={(e) => setFormYear(parseInt(e.target.value))}>
                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col xs={12}>
                <Form.Group>
                  <Form.Label className="small fw-semibold">Reason</Form.Label>
                  <Form.Control as="textarea" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Add a reason for the deduction" required />
                </Form.Group>
              </Col>
            </Row>

            <div className="mt-4">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <div className="fw-semibold">Select employees</div>
                <div className="d-flex gap-2">
                  <Button type="button" size="sm" variant="outline-secondary" onClick={() => setSelectedIds(new Set(filteredEmployees.map(e => e.employee_id)))}>Select visible</Button>
                  <Button type="button" size="sm" variant="outline-secondary" onClick={clearSelection}>Clear</Button>
                </div>
              </div>
              <Form.Control
                size="sm"
                className="mb-2"
                placeholder="Search by name or employee ID"
                value={modalEmployeeSearch}
                onChange={(e) => setModalEmployeeSearch(e.target.value)}
              />
              <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 12, padding: 10, background: '#f8fafc' }}>
                {modalEmployeeOptions.length === 0 ? (
                  <div className="text-muted small">No employees match your search.</div>
                ) : modalEmployeeOptions.map(emp => (
                  <label key={emp.employee_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: 'pointer' }}>
                    <input type="checkbox" checked={selectedIds.has(emp.employee_id)} onChange={() => toggleSelect(emp.employee_id)} />
                    <span className="small fw-semibold">{buildName(emp)} <span className="text-muted">({emp.employee_id})</span></span>
                  </label>
                ))}
              </div>
            </div>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setShowAddModal(false)}>Cancel</Button>
          <Button variant="primary" onClick={(e) => handleSubmit(e)} disabled={saving}>
            {saving ? 'Saving...' : 'Save deduction'}
          </Button>
        </Modal.Footer>
      </Modal>

      {drawerOpen && selectedRow && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(15,23,42,0.45)' }} onClick={closeDrawer}>
          <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '100%', maxWidth: 430, background: '#fff', boxShadow: '-12px 0 40px rgba(15,23,42,0.16)', padding: 24, overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="d-flex align-items-center justify-content-between mb-4">
              <div>
                <div className="fw-bold text-dark">Deduction Details</div>
                <div className="small text-muted">Employee insights and admin notes</div>
              </div>
              <Button variant="light" size="sm" onClick={closeDrawer}>Close</Button>
            </div>

            <Card className="border-0 shadow-sm mb-3" style={{ borderRadius: 16 }}>
              <Card.Body>
                <div className="d-flex align-items-center gap-3 mb-3">
                  <div style={{ width: 52, height: 52, borderRadius: '50%', background: "#1f4e79", color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                    {getInitials(selectedRow.name)}
                  </div>
                  <div>
                    <div className="fw-bold">{selectedRow.name}</div>
                    <div className="small text-muted">{selectedRow.employee_id} • {selectedRow.department}</div>
                  </div>
                </div>
                <Row className="g-2">
                  <Col xs={6}><div className="small text-muted">Designation</div><div className="fw-semibold">{selectedRow.designation}</div></Col>
                  <Col xs={6}><div className="small text-muted">Month</div><div className="fw-semibold">{fmtMonthLabel(filterMonth)} {filterYear}</div></Col>
                </Row>
              </Card.Body>
            </Card>

            <Card className="border-0 shadow-sm mb-3" style={{ borderRadius: 16 }}>
              <Card.Body>
                <div className="d-flex align-items-center gap-2 mb-3 text-primary fw-semibold"><FaInfoCircle /> Deduction overview</div>
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <span className="text-muted">Deduction Amount</span>
                  <span className="fw-bold text-danger">{selectedRow.amount > 0 ? fmtCurrency(selectedRow.amount) : 'No deduction'}</span>
                </div>
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <span className="text-muted">Status</span>
                  <Badge bg={selectedRow.amount > 0 ? 'danger' : 'secondary'}>{selectedRow.status}</Badge>
                </div>
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <span className="text-muted">Added By</span>
                  <span className="fw-semibold">{selectedRow.added_by || 'Admin'}</span>
                </div>
                <div className="d-flex justify-content-between align-items-center">
                  <span className="text-muted">Added Date</span>
                  <span className="fw-semibold">{fmtDate(selectedRow.created_at)}</span>
                </div>
              </Card.Body>
            </Card>

            <Card className="border-0 shadow-sm mb-3" style={{ borderRadius: 16 }}>
              <Card.Body>
                <div className="d-flex align-items-center justify-content-between mb-3">
                  <div className="d-flex align-items-center gap-2 text-primary fw-semibold"><FaClock /> Deduction history</div>
                  {selectedRow.deductions?.length > 1 && (
                    <Badge bg="secondary">{selectedRow.deductions.length} line items</Badge>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {selectedRow.deductions?.length > 0 ? (
                    selectedRow.deductions.map(d => (
                      <div key={d.id} style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: '10px 12px' }}>
                        <div className="d-flex justify-content-between align-items-start">
                          <div>
                            <div className="fw-semibold">{fmtMonthLabel(filterMonth)} {filterYear}</div>
                            <div className="small text-muted mt-1">{d.reason || 'No reason provided'}</div>
                            <div className="small text-muted mt-2">Recorded on {fmtDate(d.created_at || d.deduction_date)}</div>
                          </div>
                          <div className="text-end">
                            <div className="fw-bold text-danger mb-2">{fmtCurrency(d.amount)}</div>
                            <Button variant="outline-danger" size="sm" onClick={() => handleDelete(d.id)}><FaTrash className="me-1" /> Remove</Button>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-muted small">No deduction history is available for this employee for the selected month.</div>
                  )}
                </div>
              </Card.Body>
            </Card>
          </div>
        </div>
      )}
    </Container>
  );
}
