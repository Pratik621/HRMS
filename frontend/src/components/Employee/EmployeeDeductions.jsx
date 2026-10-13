import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Card, Col, Container, Form, Row, Spinner, Table } from 'react-bootstrap';
import { FaCalendarAlt, FaMoneyBill, FaReceipt, FaSearch, FaUserShield } from 'react-icons/fa';
import { useAuth } from '../../context/AuthContext';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const fmtCurrency = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (value) => value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export default function EmployeeDeductions({ embedded = false }) {
  const { user } = useAuth();
  const [deductions, setDeductions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth() + 1);
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());

  const fetchMyDeductions = async () => {
    if (!user?.employeeId) return;
    try {
      setLoading(true);
      setError('');
      const res = await axios.get(`${API_ENDPOINTS.DEDUCTIONS_EMPLOYEE(user.employeeId)}?month=${filterMonth}&year=${filterYear}`);
      setDeductions(res.data?.data || []);
    } catch (err) {
      console.error('Failed to load employee deductions', err);
      setError(err.response?.data?.message || 'Unable to load your deductions right now.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMyDeductions();
  }, [filterMonth, filterYear, user?.employeeId]);

  const summary = useMemo(() => {
    const total = deductions.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    return {
      total,
      count: deductions.length,
      latest: deductions[0] || null,
    };
  }, [deductions]);

  return (
    <Container fluid className={embedded ? 'payroll-deductions p-0' : 'py-4'}>
      {!embedded && (
      <div className="d-flex flex-column flex-lg-row align-items-lg-center justify-content-between gap-3 mb-4">
        <div className="d-flex align-items-center gap-3">
          <div style={{ background: 'linear-gradient(135deg,#2563eb,#3b82f6)', borderRadius: 14, padding: '12px 14px', boxShadow: '0 10px 24px rgba(37,99,235,0.18)' }}>
            <FaReceipt color="#fff" size={22} />
          </div>
          <div>
            <h3 className="mb-1 fw-bold text-dark">My Deductions</h3>
            <div className="text-muted" style={{ fontSize: 13 }}>View the deductions applied to your salary and their reasons.</div>
          </div>
        </div>
        <Badge bg="primary" className="px-3 py-2">Private to your account</Badge>
      </div>

      )}

      <Card className="border-0 shadow-sm mb-4" style={{ borderRadius: 18 }}>
        <Card.Body style={{ padding: 20 }}>
          <div className="d-flex flex-wrap gap-2 align-items-center justify-content-between mb-3">
            <div className="d-flex align-items-center gap-2 text-primary fw-semibold">
              <FaSearch /> Filter your deductions
            </div>
          </div>
          <Row className="g-3">
            <Col md={4}>
              <Form.Label className="small fw-semibold mb-1">Month</Form.Label>
              <Form.Select size="sm" value={filterMonth} onChange={(e) => setFilterMonth(Number(e.target.value))}>
                {MONTHS.map((month, index) => (
                  <option key={month} value={index + 1}>{month}</option>
                ))}
              </Form.Select>
            </Col>
            <Col md={4}>
              <Form.Label className="small fw-semibold mb-1">Year</Form.Label>
              <Form.Select size="sm" value={filterYear} onChange={(e) => setFilterYear(Number(e.target.value))}>
                {Array.from({ length: 5 }, (_, index) => new Date().getFullYear() - index).map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </Form.Select>
            </Col>
            <Col md={4}>
              <Form.Label className="small fw-semibold mb-1">Current view</Form.Label>
              <div className="d-flex align-items-center gap-2 px-3 py-2 border rounded-3 text-muted" style={{ minHeight: 38 }}>
                <FaCalendarAlt /> {MONTHS[filterMonth - 1]} {filterYear}
              </div>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      <Row className="g-3 mb-4">
        <Col md={6}>
          <Card className="border-0 shadow-sm h-100" style={{ borderRadius: 18, background: 'linear-gradient(135deg,#eff6ff,#dbeafe)' }}>
            <Card.Body className="p-4">
              <div className="d-flex align-items-center justify-content-between mb-3">
                <div style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <FaMoneyBill />
                </div>
                <Badge bg="light" text="dark">{MONTHS[filterMonth - 1]} {filterYear}</Badge>
              </div>
              <div className="fw-bold" style={{ fontSize: 24 }}>{fmtCurrency(summary.total)}</div>
              <div className="text-muted mt-1" style={{ fontSize: 13 }}>Total deductions</div>
            </Card.Body>
          </Card>
        </Col>
        <Col md={6}>
          <Card className="border-0 shadow-sm h-100" style={{ borderRadius: 18, background: 'linear-gradient(135deg,#fef2f2,#fee2e2)' }}>
            <Card.Body className="p-4">
              <div className="d-flex align-items-center justify-content-between mb-3">
                <div style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <FaUserShield />
                </div>
                <Badge bg="light" text="dark">Entries</Badge>
              </div>
              <div className="fw-bold" style={{ fontSize: 24 }}>{summary.count}</div>
              <div className="text-muted mt-1" style={{ fontSize: 13 }}>Deduction entries found</div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Card className="border-0 shadow-sm" style={{ borderRadius: 20, overflow: 'hidden' }}>
        <Card.Header className="bg-white border-bottom py-3 px-4">
          <div className="fw-bold text-dark">Your deduction history</div>
          <div className="small text-muted">Only deductions linked to your employee account are shown here.</div>
        </Card.Header>
        <Card.Body className="p-0">
          {loading ? (
            <div className="text-center py-5"><Spinner animation="border" variant="primary" /></div>
          ) : error ? (
            <Alert variant="danger" className="m-3">{error}</Alert>
          ) : deductions.length === 0 ? (
            <div className="text-center py-5 px-4">
              <div style={{ width: 90, height: 90, borderRadius: 24, background: '#f8fafc', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                <FaReceipt size={36} color="#94a3b8" />
              </div>
              <h5 className="fw-bold mb-2">No deductions found for this month.</h5>
              <p className="text-muted mb-0">You do not currently have any deductions for the selected period.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <Table hover className="mb-0 align-middle" style={{ minWidth: 760 }}>
                <thead className="bg-light">
                  <tr>
                    <th className="ps-4">Month</th>
                    <th>Reason</th>
                    <th>Amount</th>
                    <th>Added Date</th>
                  </tr>
                </thead>
                <tbody>
                  {deductions.map((item) => (
                    <tr key={item.id || `${item.month}-${item.year}-${item.reason}`}>
                      <td className="ps-4 fw-semibold">{MONTHS[(Number(item.month || filterMonth) - 1)] || '—'} {item.year || filterYear}</td>
                      <td>{item.reason || 'No reason provided'}</td>
                      <td className="fw-bold text-danger">{fmtCurrency(item.amount || 0)}</td>
                      <td>{fmtDate(item.deduction_date || item.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </Card.Body>
      </Card>
    </Container>
  );
}
