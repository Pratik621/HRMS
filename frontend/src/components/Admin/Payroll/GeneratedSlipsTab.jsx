// src/components/Admin/Payroll/GeneratedSlipsTab.jsx
// History of generated salary slips for the selected period. View/Download reuse the exact
// same amount calculation + PDF template as SalarySlipManager.jsx (src/utils/salarySlipTemplate.js)
// so a slip looks identical whether opened from here or from the old per-employee view.
import React, { useState } from 'react';
import { Modal, Spinner } from 'react-bootstrap';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { FaEye, FaDownload, FaCheckCircle, FaFileExcel, FaRedo, FaSearch } from 'react-icons/fa';
import axios from '../../../config/axios';
import API_ENDPOINTS from '../../../config/api';
import { useNotification } from '../../../context/NotificationContext';
import { MONTHS, getAmounts, buildPDFHTML } from '../../../utils/salarySlipTemplate';

const fmt = (v) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(Number(v) || 0));

const loadLogoBase64 = async () => {
  try {
    const r = await fetch('/images/b2bindemand_logo.jfif');
    const blob = await r.blob();
    return await new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onloadend = () => res(reader.result.split(',')[1]);
      reader.onerror = rej;
      reader.readAsDataURL(blob);
    });
  } catch {
    return ''; // logo optional
  }
};

const GeneratedSlipsTab = ({ month, year, cycleLabel, records, refetch }) => {
  const { showNotification } = useNotification();
  const [statusFilter, setStatusFilter] = useState('all'); // all | paid | unpaid
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [viewSlip, setViewSlip] = useState(null); // { slip, employee }

  const slipRows = records
    .filter(r => r.has_slip)
    .filter(r => {
      if (statusFilter === 'paid') return r.is_paid;
      if (statusFilter === 'unpaid') return !r.is_paid;
      return true;
    })
    .filter(r => !search.trim() ||
      `${r.first_name} ${r.last_name}`.toLowerCase().includes(search.trim().toLowerCase()) ||
      r.employee_id.toLowerCase().includes(search.trim().toLowerCase())
    )
    .sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`));

  const loadSlipAndEmployee = async (rec) => {
    const [slipRes, empRes] = await Promise.all([
      axios.get(API_ENDPOINTS.SALARY_BY_ID(rec.slip_id)),
      axios.get(API_ENDPOINTS.EMPLOYEE_PROFILE(rec.employee_id)),
    ]);
    return { slip: slipRes.data.salarySlip, employee: empRes.data };
  };

  // Builds the exact same HTML the PDF uses (buildPDFHTML — single source of truth for
  // slip layout), so View and Download are identical to each other and to the format
  // employees/admins already know from SalarySlipManager.jsx.
  const handleView = async (rec) => {
    setBusyId(rec.employee_id);
    try {
      const { slip, employee } = await loadSlipAndEmployee(rec);
      const a = getAmounts(slip, employee);
      const monthName = MONTHS[Number(slip.month) - 1];
      const logoBase64 = await loadLogoBase64();
      setViewSlip({ html: buildPDFHTML(slip, employee, a, monthName, logoBase64), employee, slip });
    } catch (err) {
      showNotification(err.response?.data?.message || 'Failed to load salary slip', 'danger');
    } finally {
      setBusyId(null);
    }
  };

  const handleDownload = async (rec) => {
    setBusyId(rec.employee_id);
    try {
      const { slip, employee } = await loadSlipAndEmployee(rec);
      const a = getAmounts(slip, employee);
      const monthName = MONTHS[Number(slip.month) - 1];
      const logoBase64 = await loadLogoBase64();

      const div = document.createElement('div');
      div.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;background:#fff;';
      div.innerHTML = buildPDFHTML(slip, employee, a, monthName, logoBase64);
      document.body.appendChild(div);

      const canvas = await html2canvas(div, { scale: 2, backgroundColor: '#ffffff', logging: false, useCORS: true, windowWidth: 860 });
      document.body.removeChild(div);

      const img = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [canvas.width * 0.75, canvas.height * 0.75] });
      pdf.addImage(img, 'PNG', 0, 0, canvas.width * 0.75, canvas.height * 0.75);
      pdf.save(`Salary_Slip_${employee.employee_id}_${monthName}_${slip.year}.pdf`);
    } catch (err) {
      showNotification(err.response?.data?.message || 'Failed to download PDF', 'danger');
    } finally {
      setBusyId(null);
    }
  };

  const handleMarkPaid = async (rec) => {
    setBusyId(rec.employee_id);
    try {
      await axios.put(API_ENDPOINTS.SALARY_MARK_PAID(rec.slip_id), { payment_mode: 'Bank Transfer' });
      showNotification(`Marked ${rec.first_name} ${rec.last_name}'s salary as paid`, 'success');
      refetch();
    } catch (err) {
      showNotification(err.response?.data?.message || 'Failed to mark as paid', 'danger');
    } finally {
      setBusyId(null);
    }
  };

  const handleRegenerate = async (rec) => {
    if (!window.confirm(`Regenerate the salary slip for ${rec.first_name} ${rec.last_name} for ${cycleLabel}? The existing slip's data will be replaced.`)) return;
    setBusyId(rec.employee_id);
    try {
      await axios.post(API_ENDPOINTS.SALARY_GENERATE, { employee_id: rec.employee_id, month, year });
      showNotification(`Regenerated salary slip for ${rec.first_name} ${rec.last_name}`, 'success');
      refetch();
    } catch (err) {
      showNotification(err.response?.data?.message || 'Failed to regenerate', 'danger');
    } finally {
      setBusyId(null);
    }
  };

  const exportExcel = () => {
    const rows = slipRows.map(r => ({
      Employee: `${r.first_name} ${r.last_name}`,
      'Employee ID': r.employee_id,
      Department: r.department,
      'Payroll Period': cycleLabel,
      'Gross Salary': (r.basic_salary || 0) + (r.overtime_amount || 0),
      'Net Salary': r.net_salary || 0,
      Status: r.is_paid ? 'Paid' : 'Unpaid',
      'Generated Date': r.generated_date ? new Date(r.generated_date).toLocaleDateString('en-IN') : '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Generated Slips');
    XLSX.writeFile(wb, `Generated_Slips_${MONTHS[month - 1]}_${year}.xlsx`);
  };

  return (
    <div className="d-flex flex-column gap-3">
      <div style={{ background: '#fff', borderRadius: 12, padding: '14px 20px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        {['all', 'paid', 'unpaid'].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            style={{
              border: `1.5px solid ${statusFilter === s ? '#6366f1' : '#e2e8f0'}`, borderRadius: 8, padding: '6px 14px',
              background: statusFilter === s ? '#eef2ff' : '#fff', color: statusFilter === s ? '#4f46e5' : '#64748b',
              fontSize: 12, fontWeight: 600, textTransform: 'capitalize', cursor: 'pointer',
            }}
          >
            {s}
          </button>
        ))}
        <div style={{ position: 'relative' }}>
          <FaSearch size={11} style={{ position: 'absolute', left: 10, top: 9, color: '#94a3b8' }} />
          <input
            type="text" placeholder="Search by name or employee ID…" value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: 220, padding: '7px 10px 7px 28px', fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0', outline: 'none' }}
          />
        </div>
        <button
          onClick={exportExcel}
          disabled={slipRows.length === 0}
          style={{ marginLeft: 'auto', border: 'none', borderRadius: 8, padding: '7px 14px', background: '#16a34a', color: '#fff', fontSize: 12, fontWeight: 600, cursor: slipRows.length === 0 ? 'not-allowed' : 'pointer', opacity: slipRows.length === 0 ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <FaFileExcel size={12} /> Export Excel
        </button>
      </div>

      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 6px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        {slipRows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 13 }}>No salary slips generated for this period yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#1e3a5f', color: '#fff' }}>
                  {['Employee', 'Employee ID', 'Payroll Period', 'Generated Date', 'Gross Salary', 'Net Salary', 'Status', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '11px 12px', fontWeight: 600, textAlign: 'left', fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slipRows.map((rec, idx) => {
                  const gross = (rec.basic_salary || 0) + (rec.overtime_amount || 0);
                  const busy = busyId === rec.employee_id;
                  return (
                    <tr key={rec.employee_id} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 600, color: '#1e293b' }}>{rec.first_name} {rec.last_name}</td>
                      <td style={{ padding: '10px 12px', color: '#64748b', fontFamily: 'monospace', fontSize: 11 }}>{rec.employee_id}</td>
                      <td style={{ padding: '10px 12px' }}>{cycleLabel}</td>
                      <td style={{ padding: '10px 12px', fontSize: 11, color: '#64748b' }}>{rec.generated_date ? new Date(rec.generated_date).toLocaleDateString('en-IN') : '—'}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 700 }}>{fmt(gross)}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 800, color: '#1e3a5f' }}>{fmt(rec.net_salary)}</td>
                      <td style={{ padding: '10px 12px' }}>
                        {rec.is_paid
                          ? <span style={{ background: '#dcfce7', color: '#16a34a', borderRadius: 10, padding: '2px 8px', fontSize: 10, fontWeight: 700 }}><FaCheckCircle className="me-1" />Paid</span>
                          : <span style={{ background: '#fef3c7', color: '#b45309', borderRadius: 10, padding: '2px 8px', fontSize: 10, fontWeight: 700 }}>Unpaid</span>}
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <div className="d-flex gap-1">
                          <button title="View" disabled={busy} onClick={() => handleView(rec)} style={btnStyle('#6366f1')}>
                            {busy ? <Spinner size="sm" animation="border" style={{ width: 10, height: 10 }} /> : <FaEye size={11} />}
                          </button>
                          <button title="Download PDF" disabled={busy} onClick={() => handleDownload(rec)} style={btnStyle('#0369a1')}><FaDownload size={11} /></button>
                          {!rec.is_paid && <button title="Mark Paid" disabled={busy} onClick={() => handleMarkPaid(rec)} style={btnStyle('#16a34a')}><FaCheckCircle size={11} /></button>}
                          <button title="Regenerate" disabled={busy} onClick={() => handleRegenerate(rec)} style={btnStyle('#d97706')}><FaRedo size={11} /></button>
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

      {/* View modal — renders the exact same template used for the PDF download */}
      <Modal show={!!viewSlip} onHide={() => setViewSlip(null)} size="lg" centered scrollable>
        <Modal.Header closeButton><Modal.Title style={{ fontSize: 16 }}>Salary Slip</Modal.Title></Modal.Header>
        <Modal.Body style={{ background: '#f1f5f9' }}>
          {viewSlip && <div dangerouslySetInnerHTML={{ __html: viewSlip.html }} />}
        </Modal.Body>
        <Modal.Footer>
          <button className="btn btn-outline-secondary btn-sm" onClick={() => setViewSlip(null)}>Close</button>
          {viewSlip && (
            <button
              className="btn btn-primary btn-sm d-flex align-items-center gap-1"
              onClick={() => handleDownload({ employee_id: viewSlip.employee.employee_id, slip_id: viewSlip.slip.id })}
            >
              <FaDownload size={11} /> Download PDF
            </button>
          )}
        </Modal.Footer>
      </Modal>
    </div>
  );
};

const btnStyle = (color) => ({
  border: `1px solid ${color}`, background: `${color}14`, color, borderRadius: 6,
  padding: '5px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
});

export default GeneratedSlipsTab;
