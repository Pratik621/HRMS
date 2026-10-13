import PaginatedTable from '../Common/PaginatedTable';
import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Form, Button, Spinner, Alert, Table, Badge } from 'react-bootstrap';
import { FaFileExcel, FaSyncAlt, FaMoneyBillWave, FaUsers, FaCheckCircle } from 'react-icons/fa';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';
import * as XLSX from 'xlsx';

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const PROFESSIONAL_TAX = 200;
const now = new Date();

const fmt2 = (v) => (isNaN(Number(v)) ? 0 : Number(v).toFixed(2));

const calcSalary = (emp, stats) => {
  const gross     = parseFloat(emp.gross_salary) || 0;
  const overtime  = parseFloat(stats.overtime_amount) || 0;
  const net       = Math.max(0, gross - PROFESSIONAL_TAX + overtime);
  return { gross, overtime, proTax: PROFESSIONAL_TAX, net };
};

const getSalaryCycle = (month, year) => {
  const prev   = month === 1 ? 12 : month - 1;
  const prevYr = month === 1 ? year - 1 : year;
  return {
    start: new Date(prevYr, prev - 1, 26),
    end:   new Date(year, month - 1, 25),
  };
};

export default function FinanceExport() {
  const [month,     setMonth]     = useState(now.getMonth() + 1);
  const [year,      setYear]      = useState(now.getFullYear());
  const [employees, setEmployees] = useState([]);
  const [attendance,setAttendance]= useState([]);
  const [stats,     setStats]     = useState({});
  const [rows,      setRows]      = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [loaded,    setLoaded]    = useState(false);

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  const load = async () => {
    setLoading(true);
    setError('');
    setLoaded(false);
    try {
      const { start, end } = getSalaryCycle(month, year);
      const pad = (d) => {
        const dt = new Date(d);
        return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
      };

      const [empRes, attRes] = await Promise.all([
        axios.get(API_ENDPOINTS.EMPLOYEES),
        axios.get(API_ENDPOINTS.ATTENDANCE_REPORT, {
          params: { start: pad(start), end: pad(end) },
        }),
      ]);

      const emps = (empRes.data || []).filter(e => e.is_active !== false && e.role !== 'finance' && e.role !== 'admin' && e.role !== 'sub_admin' && e.role !== 'desktop_support' && e.role !== 'hr');
      const attRecords = attRes.data?.attendance || attRes.data || [];

      // Build per-employee stats.
      // Bucketing must mirror adminMarkAttendance's typeMap (attendanceController.js) —
      // the DB never stores 'on_leave'/'weekend' in `status` (only present/absent/half_day),
      // so those two checks used to be dead code and every Week Off/Holiday day fell into
      // the `else` branch and got miscounted as Absent. Week Off/Holiday/Paid-Leave/Comp-Off
      // are distinguished via is_holiday/holiday_name/attendance_type instead.
      const perEmp = {};
      for (const r of attRecords) {
        const eid = r.employee_id;
        if (!perEmp[eid]) perEmp[eid] = { present:0, half_day:0, paid_leave:0, comp_off:0, on_leave:0, absent:0, weekend:0, holiday:0, late_count:0, overtime_hours:0, overtime_amount:0 };
        const p = perEmp[eid];
        const s = r.status;
        if (r.attendance_type === 'paid_leave') { p.present++; p.paid_leave++; }
        else if (r.attendance_type === 'comp_off') { p.present++; p.comp_off++; }
        else if (r.is_holiday && r.holiday_name === 'Week Off') p.weekend++;
        else if (r.is_holiday && r.holiday_name === 'Holiday') p.holiday++;
        // Any other is_holiday day — a company holiday marked via the Attendance Reports HOL
        // button carries a custom holiday_name (or status === 'holiday' with no exact Week
        // Off/Holiday match), so it must still land in the holiday bucket, not fall through
        // to Absent below.
        else if (r.is_holiday || s === 'holiday') p.holiday++;
        else if (r.holiday_name === 'Leave') p.on_leave++;
        else if (s === 'present' || s === 'working') p.present++;
        else if (s === 'half_day') { p.present += 0.5; p.half_day++; }
        else p.absent++;
        if (r.is_late)            p.late_count++;
        if (r.overtime_hours)     p.overtime_hours  += parseFloat(r.overtime_hours) || 0;
        if (r.overtime_amount)    p.overtime_amount += parseFloat(r.overtime_amount) || 0;
      }

      setEmployees(emps);
      setAttendance(attRecords);
      setStats(perEmp);

      const built = emps.map(emp => {
        const s   = perEmp[emp.employee_id] || {};
        const sal = calcSalary(emp, s);
        return { emp, s, sal };
      });
      setRows(built);
      setLoaded(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load data. Check your connection.');
    } finally {
      setLoading(false);
    }
  };

  const exportExcel = () => {
    const monthName = MONTHS[month - 1];
    const ts = new Date().toLocaleString('en-IN');

    const data = rows.map(({ emp, s, sal }, i) => {
      const addr = [emp.address, emp.city, emp.state, emp.pincode].filter(Boolean).join(', ');
      return {
        'Sr No':                    i + 1,
        'Timestamp':                ts,
        'Employee ID':              emp.employee_id || '',
        'Employee Name':            `${emp.first_name || ''} ${emp.last_name || ''}`.trim(),
        'Date of Joining':          emp.joining_date ? new Date(emp.joining_date).toLocaleDateString('en-IN') : '',
        'Date of Birth':            emp.dob ? new Date(emp.dob).toLocaleDateString('en-IN') : '',
        'Father / Husband Name':    emp.father_husband_name || emp.father_name || '',
        'Designation':              emp.designation || '',
        'Department':               emp.department || '',
        'Reporting Manager':        emp.reporting_manager || '',
        'Employment Type':          emp.employment_type || '',
        'Official Email':           emp.email || '',
        'Personal Email':           emp.personal_email || '',
        'Mobile Number':            emp.phone || '',
        'Alternate Phone':          emp.alternate_phone || '',
        'Emergency Contact':        emp.emergency_contact || '',
        'Aadhaar Number':           emp.aadhar_number || '',
        'Name As (Bank)':           emp.bank_account_name || '',
        'UAN Number':               emp.uan || '',
        'PAN Number':               emp.pan_number || '',
        'CTC / Gross Salary':       sal.gross,
        'Status':                   emp.is_active !== false ? 'Active' : 'Inactive',
        'Account Number':           emp.account_number || '',
        'IFSC Code':                emp.ifsc_code || '',
        'Bank Name':                emp.branch_name || '',
        'Current Address':          addr,
        'Present Days':             s.present || 0,
        'Half Days':                s.half_day || 0,
        'Paid Leave Days':          s.paid_leave || 0,
        'Comp Off Days':            s.comp_off || 0,
        'Leave Days':               s.on_leave || 0,
        'Weekend Off':              s.weekend || 0,
        'Holiday':                  s.holiday || 0,
        'Absent Days':              s.absent || 0,
        'Late Count':               s.late_count || 0,
        'Overtime Hours':           fmt2(s.overtime_hours),
        'Overtime Amount (₹)':      fmt2(s.overtime_amount),
        'Professional Tax (₹)':     sal.proTax,
        'Net Salary To Pay (₹)':    fmt2(sal.net),
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);

    // Auto column widths
    const cols = Object.keys(data[0] || {}).map(k => ({ wch: Math.max(k.length + 2, 14) }));
    ws['!cols'] = cols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Finance_${monthName}_${year}`);
    XLSX.writeFile(wb, `Finance_Export_${monthName}_${year}.xlsx`);
  };

  const totalNet = rows.reduce((sum, { sal }) => sum + sal.net, 0);

  return (
    <div className="p-3 p-md-4" style={{ backgroundColor: '#f0f2f5', minHeight: '100vh' }}>

      {/* Header */}
      <div className="d-flex align-items-center justify-content-between mb-4 flex-wrap gap-3">
        <div>
          <h4 className="mb-0 fw-bold" style={{ color: '#1e3a5f' }}>Finance Export</h4>
          <div className="text-muted small mt-1">Export attendance + salary data for all employees</div>
        </div>
        {loaded && (
          <Button
            variant="success"
            onClick={exportExcel}
            style={{ fontWeight: 600, borderRadius: 10, padding: '10px 24px' }}
          >
            <FaFileExcel className="me-2" /> Export to Excel
          </Button>
        )}
      </div>

      {/* Controls */}
      <Card className="border-0 shadow-sm mb-4" style={{ borderRadius: 14 }}>
        <Card.Body className="p-3 p-md-4">
          <Row className="g-3 align-items-end">
            <Col xs={6} md={3}>
              <Form.Label className="small fw-semibold">Month</Form.Label>
              <Form.Select value={month} onChange={e => setMonth(+e.target.value)} size="sm">
                {MONTHS.map((m, i) => <option key={m} value={i+1}>{m}</option>)}
              </Form.Select>
            </Col>
            <Col xs={6} md={3}>
              <Form.Label className="small fw-semibold">Year</Form.Label>
              <Form.Select value={year} onChange={e => setYear(+e.target.value)} size="sm">
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </Form.Select>
            </Col>
            <Col xs={12} md={3}>
              <Button
                variant="primary"
                onClick={load}
                disabled={loading}
                style={{ background: '#1e3a5f', border: 'none', borderRadius: 8, width: '100%', fontWeight: 600 }}
              >
                {loading ? <><Spinner size="sm" className="me-2" />Loading…</> : <><FaSyncAlt className="me-2" />Load Data</>}
              </Button>
            </Col>
          </Row>

          {loaded && (
            <div className="mt-3 p-2 rounded" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: 13 }}>
              Salary cycle: <strong>{(() => { const { start, end } = getSalaryCycle(month, year); return `${start.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })} – ${end.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })}`; })()}</strong>
            </div>
          )}
        </Card.Body>
      </Card>

      {error && <Alert variant="danger" className="mb-4">{error}</Alert>}

      {/* Summary Cards */}
      {loaded && (
        <>
          <Row className="g-3 mb-4">
            {[
              { label: 'Total Employees', value: rows.length, icon: <FaUsers />, color: "#1f4e79" },
              { label: 'Total Payable', value: `₹${totalNet.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, icon: <FaMoneyBillWave />, color: '#22c55e' },
              { label: 'Active Employees', value: rows.filter(r => r.emp.is_active !== false).length, icon: <FaCheckCircle />, color: '#0ea5e9' },
            ].map(s => (
              <Col key={s.label} xs={12} md={4}>
                <Card className="border-0 shadow-sm" style={{ borderRadius: 12, borderLeft: `4px solid ${s.color}` }}>
                  <Card.Body className="d-flex align-items-center gap-3 py-3">
                    <span style={{ fontSize: 28, color: s.color }}>{s.icon}</span>
                    <div>
                      <div className="fw-bold fs-5">{s.value}</div>
                      <div className="text-muted small">{s.label}</div>
                    </div>
                  </Card.Body>
                </Card>
              </Col>
            ))}
          </Row>

          {/* Preview Table */}
          <Card className="border-0 shadow-sm" style={{ borderRadius: 14 }}>
            <Card.Header className="bg-white border-0 py-3 px-4" style={{ borderRadius: '14px 14px 0 0' }}>
              <div className="d-flex align-items-center justify-content-between">
                <h6 className="mb-0 fw-bold">Preview — {MONTHS[month-1]} {year}</h6>
                <Badge bg="secondary">{rows.length} employees</Badge>
              </div>
            </Card.Header>
            <div style={{ overflowX: 'auto' }}>
              <PaginatedTable as={Table} hover size="sm" className="mb-0" style={{ fontSize: 12 }}>
                <thead style={{ background: '#f8fafc' }}>
                  <tr>
                    <th>#</th>
                    <th>Employee ID</th>
                    <th>Name</th>
                    <th>Department</th>
                    <th>Designation</th>
                    <th className="text-center">Present</th>
                    <th className="text-center">Paid Leave</th>
                    <th className="text-center">Absent</th>
                    <th className="text-center">Leave</th>
                    <th className="text-center">Late</th>
                    <th className="text-end">Gross (₹)</th>
                    <th className="text-end">OT (₹)</th>
                    <th className="text-end">Net Pay (₹)</th>
                    <th>Account No.</th>
                    <th>IFSC</th>
                    <th>Bank</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ emp, s, sal }, i) => (
                    <tr key={emp.id}>
                      <td className="text-muted">{i+1}</td>
                      <td><code style={{ fontSize: 11 }}>{emp.employee_id}</code></td>
                      <td className="fw-semibold">{emp.first_name} {emp.last_name}</td>
                      <td>{emp.department || '—'}</td>
                      <td>{emp.designation || '—'}</td>
                      <td className="text-center"><Badge bg="success" style={{ fontSize: 10 }}>{s.present || 0}</Badge></td>
                      <td className="text-center"><Badge bg="primary" style={{ fontSize: 10 }}>{s.paid_leave || 0}</Badge></td>
                      <td className="text-center"><Badge bg="danger"  style={{ fontSize: 10 }}>{s.absent  || 0}</Badge></td>
                      <td className="text-center"><Badge bg="info"    style={{ fontSize: 10 }}>{s.on_leave|| 0}</Badge></td>
                      <td className="text-center"><Badge bg="warning" text="dark" style={{ fontSize: 10 }}>{s.late_count||0}</Badge></td>
                      <td className="text-end">{sal.gross.toLocaleString('en-IN')}</td>
                      <td className="text-end text-success">{sal.overtime > 0 ? `+${sal.overtime.toFixed(0)}` : '—'}</td>
                      <td className="text-end fw-bold" style={{ color: '#16a34a' }}>
                        {Number(sal.net).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{emp.account_number || '—'}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{emp.ifsc_code || '—'}</td>
                      <td>{emp.branch_name || '—'}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr><td colSpan={16} className="text-center text-muted py-4">No employees found</td></tr>
                  )}
                </tbody>
                <tfoot style={{ background: '#f0fdf4', fontWeight: 700 }}>
                  <tr>
                    <td colSpan={12} className="text-end pe-3">Total Net Payable:</td>
                    <td className="text-end" style={{ color: '#16a34a' }}>
                      ₹{totalNet.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </PaginatedTable>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
