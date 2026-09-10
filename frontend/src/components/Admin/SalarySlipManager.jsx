// Admin Salary Slip Manager — embedded in EmployeeProfileView payroll tab
import React, { useState, useEffect, useCallback } from 'react';
import { Row, Col, Spinner, Modal, Button } from 'react-bootstrap';
import {
  FaFilePdf, FaEye, FaDownload, FaSync, FaCheckCircle,
  FaMoneyBillWave, FaHistory, FaPlus, FaRedo
} from 'react-icons/fa';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';
import { useNotification } from '../../context/NotificationContext';
import {
  MONTHS, getAmounts, downloadSalarySlipPDF,
} from '../../utils/salarySlipTemplate';
import SalarySlipView from '../Common/SalarySlipView';

// ── Helpers ────────────────────────────────────────────────────────────────────
// MONTHS, getAmounts, downloadSalarySlipPDF now live in
// src/utils/salarySlipTemplate.js (imported above) — shared with GeneratedSlipsTab.jsx
// and EditSlip.jsx so none of them calculate or render a slip's numbers differently.
// The on-screen slip layout itself lives in ../Common/SalarySlipView.jsx.
const fmt = (v) =>
  v != null
    ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(Number(v) || 0))
    : '₹0';

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A';

// ══════════════════════════════════════════════════════════════════════════════
// Main Component
// ══════════════════════════════════════════════════════════════════════════════
const OT_RATE     = 150; // ₹ per hour
const OT_STEP     = 50;  // increment step in ₹

const fmtOTHours = (amount) => {
  const totalMins = Math.round((amount / OT_RATE) * 60);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h === 0 && m === 0) return '0 hrs';
  if (m === 0) return `${h} hr${h !== 1 ? 's' : ''}`;
  if (h === 0) return `${m} min`;
  return `${h} hr ${m} min`;
};

const SalarySlipManager = ({ employee, refreshKey }) => {
  const { showNotification } = useNotification();

  const [slips, setSlips]               = useState([]);
  const [loading, setLoading]           = useState(false);
  const [generating, setGenerating]     = useState(null);
  const [downloading, setDownloading]   = useState(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [viewSlip, setViewSlip]         = useState(null);
  const [showModal, setShowModal]       = useState(false);

  // OT amount per "year-month" key (in ₹, multiples of ₹50, rate = ₹150/hr)
  const [otInputs, setOtInputs]   = useState({});
  const [otSubmitting, setOtSubmitting] = useState(null);

  const years = (() => {
    const end   = new Date().getFullYear();
    const start = employee?.joining_date
      ? new Date(employee.joining_date).getFullYear()
      : end;
    const ys = [];
    for (let y = end; y >= start; y--) ys.push(y);
    return ys;
  })();

  const monthCards = (() => {
    if (!employee?.joining_date) return [];
    const joining = new Date(employee.joining_date);
    const now     = new Date();
    const result  = [];
    for (let m = 1; m <= 12; m++) {
      const d = new Date(selectedYear, m - 1, 1);
      if (d < new Date(joining.getFullYear(), joining.getMonth(), 1)) continue;
      if (d > new Date(now.getFullYear(), now.getMonth(), 1)) continue;
      const slip = slips.find(s => Number(s.month) === m && Number(s.year) === selectedYear) || null;
      result.push({ month: m, name: MONTHS[m - 1], slip });
    }
    return result;
  })();

  const history = [...slips].sort((a, b) =>
    b.year !== a.year ? b.year - a.year : b.month - a.month
  );

  const fetchSlips = useCallback(async () => {
    if (!employee?.employee_id) return;
    setLoading(true);
    try {
      const res = await axios.get(API_ENDPOINTS.SALARY_EMPLOYEE(employee.employee_id));
      const data = res.data.salarySlips || res.data.data || [];
      setSlips(data);
      // Sync OT inputs from DB on every fetch so card always reflects saved overtime_amount
      setOtInputs(prev => {
        const next = { ...prev };
        data.forEach(s => {
          const k = `${s.year}-${s.month}`;
          next[k] = Number(s.overtime_amount) || 0;
        });
        return next;
      });
    } catch { /* non-fatal */ } finally {
      setLoading(false);
    }
  }, [employee?.employee_id]);

  useEffect(() => { fetchSlips(); }, [fetchSlips, refreshKey]);

  // Submit OT — SALARY_ADJUSTMENT updates overtime_amount + net_salary directly (no regeneration needed)
  const handleSubmitOT = async (month, year) => {
    const key = `${year}-${month}`;
    const amount = Number(otInputs[key] ?? 0);
    setOtSubmitting(key);
    try {
      await axios.post(API_ENDPOINTS.SALARY_ADJUSTMENT, {
        employee_id:     employee.employee_id,
        month,
        year,
        overtime_amount: amount,
      });
      showNotification(
        amount > 0
          ? `OT ₹${amount} (${fmtOTHours(amount)}) saved for ${MONTHS[month - 1]} ${year}`
          : `OT cleared for ${MONTHS[month - 1]} ${year}`,
        'success'
      );
      await fetchSlips();
    } catch (err) {
      const d = err.response?.data;
      showNotification(d?.message || 'Failed to save overtime', 'danger');
    } finally {
      setOtSubmitting(null);
    }
  };

  const handleGenerate = async (month, year) => {
    const key = `${year}-${month}`;
    setGenerating(key);
    try {
      // 1. Generate from attendance — sets present/absent/half days + basic net salary
      const res = await axios.post(API_ENDPOINTS.SALARY_GENERATE, {
        employee_id: employee.employee_id, month, year
      });

      // 2. If OT was set before regenerate, re-apply it on top of fresh slip
      const otAmount = Number(otInputs[key]) || 0;
      if (otAmount > 0) {
        await axios.post(API_ENDPOINTS.SALARY_ADJUSTMENT, {
          employee_id:    employee.employee_id, month, year,
          overtime_amount: otAmount,
        }).catch(() => {});
      }

      showNotification(`Salary slip generated for ${MONTHS[month - 1]} ${year}`, 'success');
      await fetchSlips();
      if (res.data.salarySlip) {
        setViewSlip(res.data.salarySlip);
        setShowModal(true);
      }
    } catch (err) {
      showNotification(err.response?.data?.message || 'Failed to generate salary slip', 'danger');
    } finally {
      setGenerating(null);
    }
  };

  const handleDownload = async (slip) => {
    if (!slip || !employee) return;
    setDownloading(slip.id);
    try {
      await downloadSalarySlipPDF(slip, employee, `Salary_Slip_${employee.employee_id}`);
      showNotification('PDF downloaded successfully', 'success');
    } catch {
      showNotification('Failed to download PDF', 'danger');
    } finally {
      setDownloading(null);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading && slips.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spinner animation="border" size="sm" style={{ color: '#6366f1' }} />
        <div style={{ marginTop: 12, fontSize: 13, color: '#94a3b8' }}>Loading salary data…</div>
      </div>
    );
  }

  return (
    <div>

      {/* ── Section 1: Month Cards ───────────────────────────────────────────── */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 1px 6px rgba(0,0,0,0.06)', marginBottom: 20 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, paddingBottom: 14, borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FaMoneyBillWave size={13} color="#6366f1" />
            </div>
            <span style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>Salary Slips</span>
            <span style={{ background: '#eef2ff', color: '#6366f1', borderRadius: 10, padding: '1px 9px', fontSize: 11, fontWeight: 700 }}>
              {slips.length} Generated
            </span>
          </div>
          <button
            onClick={fetchSlips}
            disabled={loading}
            style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '5px 12px', fontSize: 11, cursor: 'pointer', color: '#6b7280', display: 'flex', alignItems: 'center', gap: 5 }}
          >
            {loading ? <Spinner size="sm" style={{ width: 10, height: 10 }} animation="border" /> : <FaSync size={9} />}
            Refresh
          </button>
        </div>

        {/* Year tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
          {years.map(y => (
            <button
              key={y}
              onClick={() => setSelectedYear(y)}
              style={{
                padding: '5px 18px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                cursor: 'pointer', border: 'none', transition: 'all 0.15s',
                background: selectedYear === y ? '#1e3a5f' : '#f1f5f9',
                color:      selectedYear === y ? '#fff'    : '#475569',
              }}
            >
              {y}
            </button>
          ))}
        </div>

        {/* Month cards */}
        {monthCards.length === 0 ? (
          <div style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', padding: 28 }}>
            No eligible months in {selectedYear}
          </div>
        ) : (
          <Row className="g-2">
            {monthCards.map(({ month, name, slip }) => {
              const genKey        = `${selectedYear}-${month}`;
              const isGenerating  = generating === genKey;
              const isDownloading = downloading === slip?.id;
              const hasSlip    = !!slip;
              const otAmount   = Number(otInputs[genKey]) || 0;
              const isOTSubmit = otSubmitting === genKey;

              return (
                <Col xs={6} sm={4} md={3} lg={2} key={month}>
                  <div style={{
                    border: `1px solid ${hasSlip ? '#bbf7d0' : '#e2e8f0'}`,
                    borderRadius: 12,
                    padding: '14px 10px 10px',
                    textAlign: 'center',
                    background: hasSlip ? '#f0fdf4' : '#fafafa',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 8,
                    minHeight: 200,
                    transition: 'box-shadow 0.15s',
                  }}>
                    {/* Month name */}
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>{name}</div>

                    {/* Status / net amount */}
                    {hasSlip ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#16a34a', fontSize: 10, fontWeight: 600 }}>
                          <FaCheckCircle size={9} /> Generated
                        </div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: '#1e3a5f' }}>{fmt(slip.net_salary)}</div>
                        <div style={{ fontSize: 9.5, color: '#94a3b8' }}>
                          {slip.generated_date ? fmtDate(slip.generated_date) : ''}
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 10.5, color: '#94a3b8' }}>Not generated</div>
                    )}

                    {/* ── OT Input (₹150/hr, ₹50 increments) ───────── */}
                    <div style={{ width: '100%' }}>
                      <div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4, textAlign: 'left' }}>
                        Overtime (₹150/hr)
                      </div>
                      {/* Stepper row */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%' }}>
                        <button
                          onClick={() => setOtInputs(prev => ({ ...prev, [genKey]: Math.max(0, (Number(prev[genKey]) || 0) - OT_STEP) }))}
                          disabled={otAmount <= 0}
                          style={{
                            width: 26, height: 26, borderRadius: 6, border: '1.5px solid #e2e8f0',
                            background: otAmount <= 0 ? '#f8fafc' : '#fff',
                            color: otAmount <= 0 ? '#cbd5e1' : '#1e3a5f',
                            fontWeight: 800, fontSize: 14, cursor: otAmount <= 0 ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          }}
                        >−</button>
                        <input
                          type="number"
                          min="0"
                          value={otInputs[genKey] ?? 0}
                          onChange={e => {
                            const val = Math.max(0, Number(e.target.value) || 0);
                            setOtInputs(prev => ({ ...prev, [genKey]: val }));
                          }}
                          style={{
                            flex: 1, textAlign: 'center', fontWeight: 800, fontSize: 13,
                            color: otAmount > 0 ? '#1e3a5f' : '#94a3b8',
                            background: '#fff', border: '1.5px solid #e2e8f0',
                            borderRadius: 7, padding: '3px 2px', width: 0,
                            outline: 'none', WebkitAppearance: 'none', MozAppearance: 'textfield',
                          }}
                        />
                        <button
                          onClick={() => setOtInputs(prev => ({ ...prev, [genKey]: (Number(prev[genKey]) || 0) + OT_STEP }))}
                          style={{
                            width: 26, height: 26, borderRadius: 6, border: '1.5px solid #e2e8f0',
                            background: '#fff', color: '#1e3a5f',
                            fontWeight: 800, fontSize: 14, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          }}
                        >+</button>
                      </div>
                      {/* Hours display */}
                      {otAmount > 0 && (
                        <div style={{ marginTop: 3, fontSize: 9.5, color: '#0891b2', fontWeight: 600, textAlign: 'center' }}>
                          {fmtOTHours(otAmount)} OT
                        </div>
                      )}
                      {/* Submit OT button */}
                      <button
                        onClick={() => handleSubmitOT(month, selectedYear)}
                        disabled={isOTSubmit}
                        style={{
                          marginTop: 6, width: '100%', padding: '5px 0', fontSize: 11, fontWeight: 700,
                          borderRadius: 7, border: 'none',
                          background: isOTSubmit ? '#e2e8f0' : '#1e3a5f',
                          color:      isOTSubmit ? '#94a3b8' : '#fff',
                          cursor:     isOTSubmit ? 'wait' : 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                        }}
                      >
                        {isOTSubmit
                          ? <><Spinner size="sm" style={{ width: 10, height: 10 }} animation="border" /> Saving…</>
                          : '✓ Submit OT'}
                      </button>
                    </div>

                    {/* Action buttons: View | PDF | Regenerate (or Generate) */}
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center', width: '100%' }}>
                      {hasSlip ? (
                        <>
                          <button
                            onClick={() => { setViewSlip(slip); setShowModal(true); }}
                            title="View slip"
                            style={btnStyle('#0ea5e9', '#f0f9ff')}
                          >
                            <FaEye size={9} /> View
                          </button>
                          <button
                            onClick={() => handleDownload(slip)}
                            disabled={isDownloading}
                            title="Download PDF"
                            style={{ ...btnStyle('#6366f1', '#eef2ff'), opacity: isDownloading ? 0.7 : 1, cursor: isDownloading ? 'wait' : 'pointer' }}
                          >
                            {isDownloading ? <Spinner size="sm" style={{ width: 9, height: 9 }} animation="border" /> : <FaDownload size={9} />}
                            PDF
                          </button>
                          <button
                            onClick={() => handleGenerate(month, selectedYear)}
                            disabled={!!generating}
                            title="Regenerate with latest attendance"
                            style={{ ...btnStyle('#d97706', '#fffbeb'), opacity: generating && !isGenerating ? 0.6 : 1, cursor: generating ? 'not-allowed' : 'pointer' }}
                          >
                            {isGenerating
                              ? <><Spinner size="sm" style={{ width: 9, height: 9 }} animation="border" /> …</>
                              : <><FaRedo size={9} /> Regenerate</>}
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => handleGenerate(month, selectedYear)}
                          disabled={!!generating}
                          style={{
                            ...btnStyle('#fff', '#1e3a5f'),
                            background: isGenerating ? '#e2e8f0' : '#1e3a5f',
                            color:      isGenerating ? '#94a3b8' : '#fff',
                            border:     'none',
                            opacity:    generating && !isGenerating ? 0.6 : 1,
                            cursor:     generating ? 'not-allowed' : 'pointer',
                            padding:    '4px 12px',
                          }}
                        >
                          {isGenerating
                            ? <><Spinner size="sm" style={{ width: 9, height: 9 }} animation="border" /> Generating…</>
                            : <><FaPlus size={8} /> Generate</>}
                        </button>
                      )}
                    </div>
                  </div>
                </Col>
              );
            })}
          </Row>
        )}
      </div>

      {/* ── Section 2: History Table ─────────────────────────────────────────── */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 1px 6px rgba(0,0,0,0.06)', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, paddingBottom: 14, borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FaHistory size={13} color="#22c55e" />
          </div>
          <span style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>Salary History</span>
          <span style={{ background: '#f0fdf4', color: '#16a34a', borderRadius: 10, padding: '1px 9px', fontSize: 11, fontWeight: 700 }}>
            {slips.length} records
          </span>
        </div>

        {slips.length === 0 ? (
          <div style={{ color: '#94a3b8', textAlign: 'center', padding: 32, fontSize: 13 }}>
            No salary slips generated yet.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['Month', 'Year', 'Pay Cycle', 'Monthly Salary', 'Earned', 'OT', 'Deductions', 'Net Salary', 'Status', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', fontWeight: 600, color: '#64748b', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap', textAlign: 'left', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((s, i) => {
                  const a = getAmounts(s, employee);
                  const isDown = downloading === s.id;
                  const genKey = `${s.year}-${s.month}`;
                  const isRegen = generating === genKey;
                  const cycleLabel = s.cycle_start_date
                    ? `${new Date(s.cycle_start_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} – ${new Date(s.cycle_end_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`
                    : '—';
                  return (
                    <tr key={s.id || i} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 600, color: '#1e293b' }}>{MONTHS[Number(s.month) - 1]}</td>
                      <td style={{ padding: '10px 12px', color: '#64748b' }}>{s.year}</td>
                      <td style={{ padding: '10px 12px', color: '#64748b', fontSize: 11, whiteSpace: 'nowrap' }}>{cycleLabel}</td>
                      <td style={{ padding: '10px 12px', color: '#475569' }}>{fmt(a.monthlySalary)}</td>
                      <td style={{ padding: '10px 12px', color: '#6366f1', fontWeight: 600 }}>{fmt(a.basicSalary)}</td>
                      <td style={{ padding: '10px 12px', color: '#16a34a' }}>{a.overtimeAmount > 0 ? fmt(a.overtimeAmount) : '—'}</td>
                      <td style={{ padding: '10px 12px', color: '#dc2626' }}>{fmt(a.deduction)}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 800, color: '#1e3a5f', fontSize: 13 }}>{fmt(a.netSalary)}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          background: s.is_paid ? '#dcfce7' : '#fef9c3',
                          color:      s.is_paid ? '#16a34a' : '#854d0e',
                          borderRadius: 10, padding: '2px 9px', fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap'
                        }}>
                          {s.is_paid ? '✓ Paid' : '⏳ Pending'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button
                            onClick={() => { setViewSlip(s); setShowModal(true); }}
                            style={btnStyle('#0ea5e9', '#f0f9ff')}
                          >
                            <FaEye size={9} /> View
                          </button>
                          <button
                            onClick={() => handleDownload(s)}
                            disabled={isDown}
                            style={{ ...btnStyle('#6366f1', '#eef2ff'), opacity: isDown ? 0.7 : 1, cursor: isDown ? 'wait' : 'pointer' }}
                          >
                            {isDown ? <Spinner size="sm" style={{ width: 9, height: 9 }} animation="border" /> : <FaFilePdf size={9} />}
                            PDF
                          </button>
                          <button
                            onClick={() => handleGenerate(Number(s.month), Number(s.year))}
                            disabled={!!generating}
                            title="Regenerate with latest attendance"
                            style={{ ...btnStyle('#d97706', '#fffbeb'), opacity: generating && !isRegen ? 0.6 : 1, cursor: generating ? 'not-allowed' : 'pointer' }}
                          >
                            {isRegen ? <Spinner size="sm" style={{ width: 9, height: 9 }} animation="border" /> : <FaRedo size={9} />}
                            {isRegen ? '' : 'Regen'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Slip View Modal ──────────────────────────────────────────────────── */}
      <Modal show={showModal} onHide={() => setShowModal(false)} size="lg" centered scrollable>
        <Modal.Header
          style={{ background: '#1e3a5f', color: '#fff', border: 'none', padding: '14px 22px' }}
          closeVariant="white"
          closeButton
        >
          <Modal.Title style={{ fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <FaFilePdf size={13} />
            Salary Slip — {viewSlip ? `${MONTHS[Number(viewSlip.month) - 1]} ${viewSlip.year}` : ''}
          </Modal.Title>
        </Modal.Header>

        <Modal.Body style={{ padding: 24 }}>
          {viewSlip && <SalarySlipView slip={viewSlip} employee={employee} />}
        </Modal.Body>

        <Modal.Footer style={{ border: 'none', background: '#f8fafc', gap: 8, padding: '12px 22px' }}>
          <Button
            variant="light" size="sm"
            onClick={() => setShowModal(false)}
            style={{ fontSize: 12, borderRadius: 8, fontWeight: 600 }}
          >
            Close
          </Button>
          {viewSlip && (
            <Button
              size="sm"
              onClick={() => handleDownload(viewSlip)}
              disabled={downloading === viewSlip?.id}
              style={{ fontSize: 12, borderRadius: 8, background: '#1e3a5f', border: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {downloading === viewSlip?.id
                ? <><Spinner size="sm" style={{ width: 12, height: 12 }} animation="border" /> Downloading…</>
                : <><FaDownload size={11} /> Download PDF</>}
            </Button>
          )}
        </Modal.Footer>
      </Modal>
    </div>
  );
};

// ── Shared button style helper ─────────────────────────────────────────────────
const btnStyle = (color, bg) => ({
  fontSize: 10,
  padding: '3px 8px',
  borderRadius: 6,
  border: `1px solid ${color}`,
  background: bg,
  color,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 3,
  fontWeight: 500,
  whiteSpace: 'nowrap',
});

export default SalarySlipManager;
