import PaginatedTable from '../Common/PaginatedTable';
import React, { useState, useEffect, useMemo } from 'react';
import {
  Container, Row, Col, Card, Table, Button, Form,
  Badge, Spinner, Alert
} from 'react-bootstrap';
import {
  FaSearch, FaUsers, FaSuitcase, FaBriefcase, FaHistory,
  FaInfoCircle, FaPlus, FaMinus, FaCoins
} from 'react-icons/fa';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';

const buildName = (emp) => `${emp?.first_name || ''} ${emp?.middle_name || ''} ${emp?.last_name || ''}`.trim();
const getInitials = (name) => (name || 'U').split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase();
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtDays = (n) => `${Number(n) > 0 ? '+' : ''}${Number(n)}`;

// Only these two balances actually exist in this system to adjust — Unpaid leave is
// unrestricted and Birthday leave is a fixed once-a-year auto-approved perk, so neither
// has a balance to add/reduce.
const CATEGORIES = [
  { value: 'paid', label: 'Paid Leave (Annual / Sick / Personal / etc.)' },
  { value: 'comp_off', label: 'Comp-Off' },
];

export default function LeaveBalanceAdjustment() {
  const [employees, setEmployees] = useState([]);
  const [balances, setBalances] = useState({}); // { [employee_id]: paidAvailable }
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 8;

  const [selectedEmp, setSelectedEmp] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [category, setCategory] = useState('paid');
  const [action, setAction] = useState('add'); // 'add' | 'reduce'
  const [days, setDays] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => { fetchEmployees(); fetchBalances(); }, []);
  useEffect(() => { setPage(1); }, [search, departmentFilter]);

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

  const fetchBalances = async () => {
    try {
      const res = await axios.get(API_ENDPOINTS.LEAVE_BALANCE_BULK);
      setBalances(res.data?.balances || {});
    } catch {
      // Non-fatal — rows just show "—" for paid-leave balance until this loads.
    }
  };

  const openDrawer = async (emp) => {
    setSelectedEmp(emp);
    setDrawerOpen(true);
    setCategory('paid');
    setAction('add');
    setDays('');
    setReason('');
    setError('');
    setSuccess('');
    fetchHistory(emp.employee_id);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setSelectedEmp(null);
    setHistory([]);
  };

  const fetchHistory = async (employeeId) => {
    setHistoryLoading(true);
    try {
      const res = await axios.get(API_ENDPOINTS.LEAVE_ADJUSTMENT_HISTORY(employeeId));
      setHistory(res.data?.adjustments || []);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    const n = parseFloat(days);
    if (!n || n <= 0) return setError('Enter a valid number of days.');
    if (category === 'comp_off' && !Number.isInteger(n)) {
      return setError('Comp-Off is tracked in whole days — enter a whole number.');
    }
    if (!reason.trim()) return setError('Enter a reason for this adjustment.');

    setSaving(true);
    try {
      const signedDays = action === 'add' ? n : -n;
      const res = await axios.post(API_ENDPOINTS.LEAVE_ADJUST_BALANCE, {
        employee_id: selectedEmp.employee_id,
        leave_category: category,
        adjustment_days: signedDays,
        reason: reason.trim(),
      });
      setSuccess(res.data?.message || 'Balance adjusted successfully.');
      setDays('');
      setReason('');
      fetchHistory(selectedEmp.employee_id);
      fetchBalances();
      fetchEmployees();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to adjust leave balance');
    } finally {
      setSaving(false);
    }
  };

  const departmentOptions = useMemo(
    () => ['All', ...new Set(employees.map(e => e.department).filter(Boolean))],
    [employees]
  );

  const rows = useMemo(() => {
    const q = search.toLowerCase();
    return employees
      .filter(e => {
        const fullName = buildName(e).toLowerCase();
        const matchesSearch = !q || fullName.includes(q) || e.employee_id?.toLowerCase().includes(q) || e.department?.toLowerCase().includes(q);
        const matchesDept = departmentFilter === 'All' || e.department === departmentFilter;
        return matchesSearch && matchesDept;
      })
      .map(e => ({
        ...e,
        name: buildName(e),
        paid_available: balances[e.employee_id] != null ? balances[e.employee_id] : null,
        comp_off_balance: e.comp_off_balance != null ? Number(e.comp_off_balance) : 0,
      }));
  }, [employees, balances, search, departmentFilter]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const paginatedRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <Container fluid className="py-4">
      <div className="d-flex flex-column flex-lg-row align-items-lg-center justify-content-between gap-3 mb-4">
        <div className="d-flex align-items-center gap-3">
          <div style={{ background: "#7c3aed", borderRadius: 14, padding: '12px 14px', boxShadow: '0 10px 24px rgba(124,58,237,0.18)' }}>
            <FaCoins color="#fff" size={22} />
          </div>
          <div>
            <h3 className="mb-1 fw-bold text-dark">Leave Balance Adjustment</h3>
            <div className="text-muted" style={{ fontSize: 13 }}>
              Add or reduce an employee's Paid Leave or Comp-Off balance — no approval needed.
            </div>
          </div>
        </div>
        <Badge bg="primary" className="px-3 py-2">{rows.length} employees</Badge>
      </div>

      <Card className="border-0 shadow-sm mb-4" style={{ borderRadius: 18 }}>
        <Card.Body style={{ padding: 20 }}>
          <Row className="g-3 align-items-end">
            <Col xs={12} sm={6} md={4}>
              <Form.Label className="small fw-semibold mb-1">Employee Search</Form.Label>
              <Form.Control
                size="sm"
                placeholder="Name or Employee ID"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && setSearch(searchInput)}
              />
            </Col>
            <Col xs={12} sm={6} md={3}>
              <Form.Label className="small fw-semibold mb-1">Department</Form.Label>
              <Form.Select size="sm" value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)}>
                {departmentOptions.map(dep => <option key={dep} value={dep}>{dep}</option>)}
              </Form.Select>
            </Col>
            <Col xs={12} sm={6} md="auto">
              <Button size="sm" variant="outline-primary" onClick={() => setSearch(searchInput)}>
                <FaSearch className="me-1" /> Search
              </Button>{' '}
              <Button size="sm" variant="outline-secondary" onClick={() => { setSearchInput(''); setSearch(''); setDepartmentFilter('All'); }}>
                Reset
              </Button>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      <Card className="border-0 shadow-sm" style={{ borderRadius: 20, overflow: 'hidden' }}>
        <Card.Header className="bg-white border-bottom py-3 px-4">
          <div className="fw-bold text-dark">Employee leave balances</div>
          <div className="small text-muted">Click an employee to add, reduce, and view their adjustment history.</div>
        </Card.Header>
        <Card.Body className="p-0">
          {loading ? (
            <div className="text-center py-5"><Spinner animation="border" variant="primary" /></div>
          ) : paginatedRows.length === 0 ? (
            <div className="text-center py-5 px-4">
              <FaUsers size={36} color="#94a3b8" className="mb-3" />
              <h5 className="fw-bold mb-2">No employees found.</h5>
              <p className="text-muted mb-0">Try adjusting your search or department filter.</p>
            </div>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <PaginatedTable as={Table} paginate={false} hover className="mb-0 align-middle" style={{ minWidth: 760 }}>
                  <thead className="bg-light">
                    <tr>
                      <th className="ps-4">Employee</th>
                      <th>Department</th>
                      <th>Paid Leave Available</th>
                      <th>Comp-Off Balance</th>
                      <th className="text-center pe-4">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedRows.map(row => (
                      <tr key={row.employee_id}>
                        <td className="ps-4">
                          <div className="d-flex align-items-center gap-3">
                            <div style={{ width: 40, height: 40, borderRadius: '50%', background: "#7c3aed", color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                              {getInitials(row.name)}
                            </div>
                            <div>
                              <div className="fw-semibold">{row.name}</div>
                              <div className="small text-muted">{row.employee_id}</div>
                            </div>
                          </div>
                        </td>
                        <td>{row.department || '—'}</td>
                        <td className="fw-bold text-primary">
                          {row.paid_available != null ? `${row.paid_available} days` : '—'}
                        </td>
                        <td className="fw-bold text-success">{row.comp_off_balance} days</td>
                        <td className="text-center pe-4">
                          <Button size="sm" variant="outline-primary" onClick={() => openDrawer(row)}>Adjust Balance</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </PaginatedTable>
              </div>
              <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 px-4 py-3 border-top bg-light">
                <div className="small text-muted">Showing {paginatedRows.length} of {rows.length} employees</div>
                <div className="d-flex align-items-center gap-2">
                  <Button size="sm" variant="outline-secondary" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Prev</Button>
                  <span className="small fw-semibold">Page {page} of {totalPages}</span>
                  <Button size="sm" variant="outline-secondary" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</Button>
                </div>
              </div>
            </>
          )}
        </Card.Body>
      </Card>

      {drawerOpen && selectedEmp && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(15,23,42,0.45)' }} onClick={closeDrawer}>
          <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '100%', maxWidth: 460, background: '#fff', boxShadow: '-12px 0 40px rgba(15,23,42,0.16)', padding: 24, overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="d-flex align-items-center justify-content-between mb-4">
              <div>
                <div className="fw-bold text-dark">Adjust Leave Balance</div>
                <div className="small text-muted">Takes effect immediately — no approval needed.</div>
              </div>
              <Button variant="light" size="sm" onClick={closeDrawer}>Close</Button>
            </div>

            <Card className="border-0 shadow-sm mb-3" style={{ borderRadius: 16 }}>
              <Card.Body>
                <div className="d-flex align-items-center gap-3 mb-3">
                  <div style={{ width: 52, height: 52, borderRadius: '50%', background: "#7c3aed", color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                    {getInitials(buildName(selectedEmp))}
                  </div>
                  <div>
                    <div className="fw-bold">{buildName(selectedEmp)}</div>
                    <div className="small text-muted">{selectedEmp.employee_id} • {selectedEmp.department || '—'}</div>
                  </div>
                </div>
                <Row className="g-2">
                  <Col xs={6}>
                    <div className="small text-muted d-flex align-items-center gap-1"><FaSuitcase size={11} /> Paid Leave</div>
                    <div className="fw-bold text-primary" style={{ fontSize: 20 }}>
                      {balances[selectedEmp.employee_id] != null ? balances[selectedEmp.employee_id] : '—'} days
                    </div>
                  </Col>
                  <Col xs={6}>
                    <div className="small text-muted d-flex align-items-center gap-1"><FaBriefcase size={11} /> Comp-Off</div>
                    <div className="fw-bold text-success" style={{ fontSize: 20 }}>
                      {selectedEmp.comp_off_balance != null ? Number(selectedEmp.comp_off_balance) : 0} days
                    </div>
                  </Col>
                </Row>
              </Card.Body>
            </Card>

            {error && <Alert variant="danger" className="py-2 small">{error}</Alert>}
            {success && <Alert variant="success" className="py-2 small">{success}</Alert>}

            <Card className="border-0 shadow-sm mb-3" style={{ borderRadius: 16 }}>
              <Card.Body>
                <div className="fw-semibold mb-3">New Adjustment</div>
                <Form onSubmit={handleSubmit}>
                  <Form.Group className="mb-3">
                    <Form.Label className="small fw-semibold">Leave Type</Form.Label>
                    <Form.Select size="sm" value={category} onChange={(e) => setCategory(e.target.value)}>
                      {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </Form.Select>
                  </Form.Group>

                  <Form.Group className="mb-3">
                    <Form.Label className="small fw-semibold d-block">Action</Form.Label>
                    <div className="d-flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={action === 'add' ? 'success' : 'outline-success'}
                        className="flex-fill"
                        onClick={() => setAction('add')}
                      >
                        <FaPlus className="me-1" /> Add
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={action === 'reduce' ? 'danger' : 'outline-danger'}
                        className="flex-fill"
                        onClick={() => setAction('reduce')}
                      >
                        <FaMinus className="me-1" /> Reduce
                      </Button>
                    </div>
                  </Form.Group>

                  <Form.Group className="mb-3">
                    <Form.Label className="small fw-semibold">Days</Form.Label>
                    <Form.Control
                      type="number"
                      min="0"
                      step={category === 'comp_off' ? '1' : '0.5'}
                      size="sm"
                      value={days}
                      onChange={(e) => setDays(e.target.value)}
                      placeholder="Enter number of days"
                      required
                    />
                  </Form.Group>

                  <Form.Group className="mb-3">
                    <Form.Label className="small fw-semibold">Reason</Form.Label>
                    <Form.Control
                      as="textarea"
                      rows={2}
                      size="sm"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Why is this balance being adjusted?"
                      required
                    />
                  </Form.Group>

                  <Button type="submit" variant="primary" className="w-100" disabled={saving}>
                    {saving ? <Spinner size="sm" animation="border" /> : `${action === 'add' ? 'Add' : 'Reduce'} ${days || ''} day(s)`}
                  </Button>
                </Form>
              </Card.Body>
            </Card>

            <Card className="border-0 shadow-sm" style={{ borderRadius: 16 }}>
              <Card.Body>
                <div className="d-flex align-items-center gap-2 mb-3 text-primary fw-semibold">
                  <FaHistory /> Adjustment History
                </div>
                {historyLoading ? (
                  <div className="text-center py-3"><Spinner size="sm" animation="border" /></div>
                ) : history.length === 0 ? (
                  <div className="text-muted small d-flex align-items-start gap-2">
                    <FaInfoCircle className="mt-1 flex-shrink-0" size={12} />
                    No manual adjustments have been made for this employee yet.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {history.map(h => (
                      <div key={h.id} style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: '10px 12px' }}>
                        <div className="d-flex justify-content-between align-items-start">
                          <div>
                            <Badge bg={h.leave_category === 'comp_off' ? 'success' : 'primary'} className="mb-1">
                              {h.leave_category === 'comp_off' ? 'Comp-Off' : 'Paid Leave'}
                            </Badge>
                            <div className="small text-muted">{h.reason || 'No reason provided'}</div>
                            <div className="small text-muted mt-1">
                              {fmtDate(h.created_at)}{h.adjusted_by_name ? ` • by ${h.adjusted_by_name}` : ''}
                            </div>
                          </div>
                          <div className={`fw-bold ${Number(h.adjustment_days) > 0 ? 'text-success' : 'text-danger'}`}>
                            {fmtDays(h.adjustment_days)} day(s)
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card.Body>
            </Card>
          </div>
        </div>
      )}
    </Container>
  );
}
