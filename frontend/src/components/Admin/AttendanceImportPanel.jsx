import PaginatedTable from '../Common/PaginatedTable';
// Admin Attendance Import & Export Panel
// Placed above the employee table on /admin/employees
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Row, Col, Spinner, Modal, Button, Form } from 'react-bootstrap';
import {
  FaFileExcel, FaUpload, FaDownload, FaCheckCircle, FaTimesCircle,
  FaExclamationTriangle, FaHistory, FaEye, FaSync, FaChevronDown, FaChevronUp,
  FaTable, FaCloudUploadAlt, FaCheck
} from 'react-icons/fa';
import * as XLSX from 'xlsx';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';
import { useNotification } from '../../context/NotificationContext';

// ── Constants ──────────────────────────────────────────────────────────────────
const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const CODE_LABELS = {
  P:  { label: 'Present',    color: '#16a34a', bg: '#dcfce7' },
  A:  { label: 'Absent',     color: '#dc2626', bg: '#fee2e2' },
  HD: { label: 'Half Day',   color: '#7c3aed', bg: '#ede9fe' },
  L:  { label: 'Leave',      color: '#0369a1', bg: '#e0f2fe' },
  WO: { label: 'Week Off',   color: '#78716c', bg: '#f5f5f4' },
  H:  { label: 'Holiday',    color: '#b45309', bg: '#fef3c7' },
  CO: { label: 'Comp Off',   color: '#0891b2', bg: '#e0f2fe' },
  PL: { label: 'Paid Leave', color: '#0891b2', bg: '#cffafe' },
};

// Maps short codes to the full words written into the exported Excel file.
// Full words are also accepted on re-import via WORD_TO_CODE in the backend.
const EXPORT_LABEL = {
  PL: 'Paid Leave',
  CO: 'Comp Off',
};

const VALID_CODES = new Set(['P', 'A', 'HD', 'L', 'WO', 'H', 'CO', 'PL']);

const now = new Date();
const THIS_YEAR  = now.getFullYear();
const THIS_MONTH = now.getMonth() + 1;

// ── Section card matching EmployeeProfileView style ────────────────────────────
const Card = ({ children, style }) => (
  <div style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 1px 8px rgba(0,0,0,0.07)', ...style }}>
    {children}
  </div>
);

const SectionHeader = ({ icon, title, badge, actions }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid #f3f4f6' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 28, height: 28, borderRadius: 7, background: '#6366f118', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {React.cloneElement(icon, { size: 13, color: "#1f4e79" })}
      </div>
      <span style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>{title}</span>
      {badge && (
        <span style={{ background: '#6366f118', color: "#1f4e79", borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>{badge}</span>
      )}
    </div>
    {actions}
  </div>
);

// ── Template generator (pure frontend) ────────────────────────────────────────
const generateTemplate = (employees, month, year) => {
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthShort  = MONTH_SHORT[month - 1];

  const header = ['Employee ID', 'Employee Name'];
  for (let d = 1; d <= daysInMonth; d++) header.push(`${d}-${monthShort}`);

  const dataRows = employees.map(emp => {
    const row = [emp.employee_id, `${emp.first_name || ''} ${emp.last_name || ''}`.trim()];
    for (let d = 1; d <= daysInMonth; d++) {
      const day = new Date(year, month - 1, d).getDay();
      row.push(day === 0 || day === 6 ? 'WO' : '');
    }
    return row;
  });

  const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows]);

  // Column widths
  ws['!cols'] = [
    { wch: 14 }, { wch: 28 },
    ...Array(daysInMonth).fill({ wch: 5 }),
  ];

  // Legend sheet
  const legend = [
    ['Code', 'Meaning', 'Description'],
    ['P',  'Present',  'Employee was present full day'],
    ['A',  'Absent',   'Employee was absent'],
    ['HD', 'Half Day', 'Employee worked half day'],
    ['L',  'Leave',    'Employee on approved leave'],
    ['WO', 'Week Off', 'Saturday / Sunday / Weekly off'],
    ['H',  'Holiday',  'Public or company holiday'],
    ['CO', 'Comp Off',   'Compensatory off — worked on holiday, counts as Present'],
    ['PL', 'Paid Leave', 'Paid leave from balance — counts as Present, deducts 1 PL day'],
  ];
  const legendWs = XLSX.utils.aoa_to_sheet(legend);
  legendWs['!cols'] = [{ wch: 6 }, { wch: 12 }, { wch: 36 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `${monthShort} ${year}`);
  XLSX.utils.book_append_sheet(wb, legendWs, 'Legend');

  XLSX.writeFile(wb, `Attendance_Template_${monthShort}_${year}.xlsx`);
};

// ── Export existing attendance (build Excel from backend JSON) ─────────────────
const generateExportExcel = (records, month, year) => {
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthShort  = MONTH_SHORT[month - 1];

  const header = ['Employee ID', 'Employee Name'];
  for (let d = 1; d <= daysInMonth; d++) header.push(`${d}-${monthShort}`);

  const dataRows = records.map(rec => {
    const row = [rec.employee_id, rec.employee_name];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const code = rec.dates[dateStr] || '';
      row.push(EXPORT_LABEL[code] || code);
    }
    return row;
  });

  const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
  ws['!cols'] = [{ wch: 14 }, { wch: 28 }, ...Array(daysInMonth).fill({ wch: 5 })];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `${monthShort} ${year}`);
  XLSX.writeFile(wb, `Attendance_Export_${monthShort}_${year}.xlsx`);
};

// ── Parse uploaded Excel → records JSON ───────────────────────────────────────
// Supports two formats:
//   Template format : Employee ID | Employee Name | 1-Jan | 2-Jan | ...
//   Custom format   : Name | DOJ | Probation Completion Date | 5th | 6th | ...
const parseExcelFile = (file, month, year) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb   = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        if (!rows || rows.length < 2) {
          return reject(new Error('Excel file appears empty or has no data rows.'));
        }

        const header  = rows[0];
        const records = [];

        // Detect format by scanning the header for date column patterns
        const hasStandardDates = header.some(cell => /^\d{1,2}-[A-Za-z]{3}$/.test(String(cell || '').trim()));
        const hasOrdinalDates  = header.some(cell => /^\d{1,2}(st|nd|rd|th)$/i.test(String(cell || '').trim()));

        if (hasStandardDates) {
          // ── Standard template format ─────────────────────────────────────────
          // Cols: Employee ID | Employee Name | 1-Jan | 2-Jan | ...
          const dateCols = [];
          for (let c = 0; c < header.length; c++) {
            const cell  = String(header[c] || '').trim();
            const match = cell.match(/^(\d{1,2})-[A-Za-z]{3}$/);
            if (!match) continue;
            const day  = parseInt(match[1]);
            const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            dateCols.push({ col: c, date });
          }
          for (let r = 1; r < rows.length; r++) {
            const row          = rows[r];
            const employeeId   = String(row[0] || '').trim();
            const employeeName = String(row[1] || '').trim();
            if (!employeeId && !employeeName) continue;
            const dates = {};
            for (const { col, date } of dateCols) {
              const code = String(row[col] || '').trim().toUpperCase();
              if (code) dates[date] = code;
            }
            records.push({ employee_id: employeeId, employee_name: employeeName, dates });
          }

        } else if (hasOrdinalDates) {
          // ── Custom format ────────────────────────────────────────────────────
          // Cols: [blank/S.No] | Name | DOJ | Probation Completion Date | 5th | 6th | ...
          // Find the "Name" column dynamically — it may not be at index 0
          let nameCol = -1;
          for (let c = 0; c < header.length; c++) {
            if (String(header[c] || '').trim().toLowerCase() === 'name') {
              nameCol = c;
              break;
            }
          }
          // Fallback: first non-empty, non-date column
          if (nameCol === -1) {
            for (let c = 0; c < header.length; c++) {
              const cell = String(header[c] || '').trim();
              if (cell && !/^\d{1,2}(st|nd|rd|th)$/i.test(cell)) { nameCol = c; break; }
            }
          }
          if (nameCol === -1) {
            return reject(new Error('Could not find a "Name" column in the header row.'));
          }

          // Salary period: 26th of previous month → 25th of selected month.
          // Days 26–31 in the ordinal header belong to the PREVIOUS month.
          // Days 1–25 belong to the SELECTED month.
          const prevMonth      = month === 1 ? 12 : month - 1;
          const prevYear       = month === 1 ? year - 1 : year;
          const daysInPrevMonth = new Date(prevYear, prevMonth, 0).getDate();

          const dateCols = [];
          for (let c = 0; c < header.length; c++) {
            const cell  = String(header[c] || '').trim();
            const match = cell.match(/^(\d{1,2})(st|nd|rd|th)$/i);
            if (!match) continue;
            const day = parseInt(match[1], 10);
            if (day < 1) continue;

            let targetYear, targetMonth;
            if (day >= 26) {
              // Belongs to the previous month's period
              targetMonth = prevMonth;
              targetYear  = prevYear;
              if (day > daysInPrevMonth) continue; // e.g. skip Feb 30th
            } else {
              // Belongs to the selected month
              targetMonth = month;
              targetYear  = year;
            }

            const date = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            dateCols.push({ col: c, date });
          }
          for (let r = 1; r < rows.length; r++) {
            const row          = rows[r];
            const employeeName = String(row[nameCol] || '').trim();
            if (!employeeName) continue;
            const dates = {};
            for (const { col, date } of dateCols) {
              const code = String(row[col] || '').trim().toUpperCase();
              if (code) dates[date] = code;
            }
            records.push({ employee_id: '', employee_name: employeeName, dates });
          }

        } else {
          return reject(new Error(
            'Could not detect date columns. Use the downloaded template (columns like "1-Jan") or a custom sheet with ordinal date columns (like "5th", "6th"…).'
          ));
        }

        resolve(records);
      } catch (err) {
        reject(new Error(`Failed to parse Excel: ${err.message}`));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsArrayBuffer(file);
  });
};

// ── Import result banner ──────────────────────────────────────────────────────
const ImportResultBanner = ({ result }) => {
  const isFailure = result._networkError ||
    (result.failed > 0 && result.inserted === 0 && result.updated === 0);
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{
        background: isFailure ? '#fef2f2' : '#f0fdf4',
        border: `1px solid ${isFailure ? '#fecaca' : '#86efac'}`,
        borderRadius: 8, padding: '10px 14px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, marginBottom: 4, fontSize: 13,
          color: isFailure ? '#dc2626' : '#16a34a' }}>
          {isFailure ? <><FaTimesCircle size={12} /> Import Failed</> : <><FaCheck size={12} /> Import Complete</>}
        </div>
        {!result._networkError && (
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12 }}>
            <span><strong style={{ color: '#16a34a' }}>{result.inserted}</strong> records inserted</span>
            <span><strong style={{ color: '#0369a1' }}>{result.updated}</strong> records updated</span>
            {result.failed > 0 && <span><strong style={{ color: '#dc2626' }}>{result.failed}</strong> failed</span>}
          </div>
        )}
      </div>
      {(result.db_errors || []).length > 0 && (
        <div style={{ marginTop: 8, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
          <div style={{ fontWeight: 700, color: '#dc2626', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <FaTimesCircle size={11} /> Error detail:
          </div>
          {result.db_errors.map((err, i) => (
            <div key={i} style={{ color: '#7f1d1d', background: '#fff', border: '1px solid #fecaca', borderRadius: 6, padding: '6px 10px', marginBottom: 4, fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all' }}>
              {err}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
const AttendanceImportPanel = ({ employees = [], onMonthYearChange, onImportSuccess }) => {
  const { showNotification } = useNotification();
  const fileInputRef = useRef(null);

  const [year,  setYear]  = useState(THIS_YEAR);
  const [month, setMonth] = useState(THIS_MONTH);

  // Upload / validation state
  const [uploadedFile,      setUploadedFile]      = useState(null);
  const [parsedRecords,     setParsedRecords]      = useState(null);
  const [validationResult,  setValidationResult]   = useState(null);
  const [importResult,      setImportResult]       = useState(null);

  // Loading flags
  const [isValidating,    setIsValidating]    = useState(false);
  const [isImporting,     setIsImporting]     = useState(false);
  const [isExporting,     setIsExporting]     = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // UI
  const [dragOver,          setDragOver]          = useState(false);
  const [showPreviewModal,  setShowPreviewModal]   = useState(false);
  const [showHistory,       setShowHistory]        = useState(false);
  const [importHistory,     setImportHistory]      = useState([]);
  const [parseError,        setParseError]         = useState('');
  const [isCollapsed,       setIsCollapsed]        = useState(false);

  const availableYears = [];
  for (let y = THIS_YEAR; y >= THIS_YEAR - 3; y--) availableYears.push(y);

  // Reset file state when month/year changes
  useEffect(() => {
    setUploadedFile(null);
    setParsedRecords(null);
    setValidationResult(null);
    setImportResult(null);
    setParseError('');
  }, [month, year]);

  const fetchHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const res = await axios.get(API_ENDPOINTS.ATTENDANCE_IMPORT_HISTORY);
      setImportHistory(res.data.history || []);
    } catch { /* ignore */ } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  useEffect(() => { if (showHistory) fetchHistory(); }, [showHistory, fetchHistory]);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleTemplateDownload = () => {
    if (employees.length === 0) {
      showNotification('No employees loaded yet.', 'warning');
      return;
    }
    generateTemplate(employees, month, year);
    showNotification(`Template for ${MONTHS[month - 1]} ${year} downloaded.`, 'success');
  };

  const handleExportExisting = async () => {
    setIsExporting(true);
    try {
      const res = await axios.get(API_ENDPOINTS.ATTENDANCE_EXPORT(month, year));
      generateExportExcel(res.data.records || [], month, year);
      showNotification(`Attendance export for ${MONTHS[month - 1]} ${year} downloaded.`, 'success');
    } catch (err) {
      showNotification(err.response?.data?.message || 'Export failed', 'danger');
    } finally {
      setIsExporting(false);
    }
  };

  const processFile = async (file) => {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls'].includes(ext)) {
      setParseError('Please upload an Excel file (.xlsx or .xls).');
      return;
    }
    setUploadedFile(file);
    setParsedRecords(null);
    setValidationResult(null);
    setImportResult(null);
    setParseError('');

    try {
      const records = await parseExcelFile(file, month, year);
      setParsedRecords(records);
      showNotification(`File parsed: ${records.length} employee rows found.`, 'info');
    } catch (err) {
      setParseError(err.message);
      setUploadedFile(null);
    }
  };

  const handleFileChange = (e) => { processFile(e.target.files?.[0]); };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    processFile(e.dataTransfer.files?.[0]);
  };

  const handleValidate = async () => {
    if (!parsedRecords) return;
    setIsValidating(true);
    setValidationResult(null);
    try {
      const res = await axios.post(API_ENDPOINTS.ATTENDANCE_IMPORT_VALIDATE, {
        month, year, records: parsedRecords,
      });
      setValidationResult(res.data);
      const skipped = res.data.skipped_not_found || 0;
      if (res.data.error_count === 0) {
        const msg = `Validation passed — ${res.data.valid_count} employees ready to import.` +
          (skipped > 0 ? ` ${skipped} name(s) not found in database and were skipped.` : '');
        showNotification(msg, 'success');
      } else {
        const msg = `Validation: ${res.data.valid_count} valid, ${res.data.error_count} errors` +
          (skipped > 0 ? `, ${skipped} not found in DB (skipped)` : '');
        showNotification(msg, 'warning');
      }
    } catch (err) {
      showNotification(err.response?.data?.message || 'Validation request failed', 'danger');
    } finally {
      setIsValidating(false);
    }
  };

  const handleImport = async () => {
    if (!validationResult || validationResult.valid_count === 0) return;
    setIsImporting(true);
    setImportResult(null);
    try {
      const res = await axios.post(API_ENDPOINTS.ATTENDANCE_IMPORT, {
        month,
        year,
        file_name: uploadedFile?.name || null,
        records:   validationResult.valid_records,
      });
      setImportResult(res.data);
      setShowPreviewModal(false);
      showNotification(res.data.message, 'success');
      if (showHistory) fetchHistory();
      onImportSuccess?.(month, year);
    } catch (err) {
      const d = err.response?.data;
      const msg = d?.message || err.message || 'Import failed';
      const detail = d?.error || d?.details || d?.hint || null;
      const dbErrs = d?.db_errors || (detail ? [detail] : [msg]);
      setImportResult({ inserted: 0, updated: 0, failed: 0, db_errors: dbErrs, _networkError: true });
      showNotification(msg, 'danger');
    } finally {
      setIsImporting(false);
    }
  };

  const resetUpload = () => {
    setUploadedFile(null);
    setParsedRecords(null);
    setValidationResult(null);
    setImportResult(null);
    setParseError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Derived ─────────────────────────────────────────────────────────────────
  const canValidate  = !!parsedRecords && !isValidating && !isImporting;
  const canImport    = validationResult?.valid_count > 0 && !isImporting;
  const hasErrors    = validationResult && validationResult.error_count > 0;

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ marginBottom: 20 }}>
      <Card>
        {/* ── Panel header ──────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isCollapsed ? 0 : 16, paddingBottom: isCollapsed ? 0 : 12, borderBottom: isCollapsed ? 'none' : '1px solid #f3f4f6' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: '#6366f118', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FaFileExcel size={13} color="#16a34a" />
            </div>
            <span style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>Attendance Import & Export</span>
            <span style={{ background: '#f0fdf4', color: '#16a34a', borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>
              {employees.length} employees
            </span>
          </div>
          <button
            onClick={() => setIsCollapsed(c => !c)}
            style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '4px 10px', fontSize: 11, cursor: 'pointer', color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            {isCollapsed ? <><FaChevronDown size={9} /> Expand</> : <><FaChevronUp size={9} /> Collapse</>}
          </button>
        </div>

        {!isCollapsed && (
          <>
            {/* ── Row 1: Year / Month / Action buttons ────────────────────── */}
            <Row className="g-2 align-items-end mb-3">
              <Col xs={6} sm={3} md={2}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>Year</label>
                <Form.Select
                  size="sm"
                  value={year}
                  onChange={e => {
                    const y = Number(e.target.value);
                    setYear(y);
                    onMonthYearChange?.(month, y);
                  }}
                  style={{ fontSize: 12, borderRadius: 8 }}
                >
                  {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                </Form.Select>
              </Col>

              <Col xs={6} sm={3} md={2}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>Month</label>
                <Form.Select
                  size="sm"
                  value={month}
                  onChange={e => {
                    const m = Number(e.target.value);
                    setMonth(m);
                    onMonthYearChange?.(m, year);
                  }}
                  style={{ fontSize: 12, borderRadius: 8 }}
                >
                  {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </Form.Select>
              </Col>

              <Col xs={12} sm={6} md={8}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>
                  {MONTHS[month - 1]} {year}
                </label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {/* Download Template */}
                  <button
                    onClick={handleTemplateDownload}
                    disabled={employees.length === 0}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 8, border: '1px solid #16a34a', background: '#f0fdf4', color: '#16a34a', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: employees.length === 0 ? 0.5 : 1 }}
                  >
                    <FaDownload size={10} /> Download Template
                  </button>

                  {/* Export Existing */}
                  <button
                    onClick={handleExportExisting}
                    disabled={isExporting}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 8, border: '1px solid #6366f1', background: "#eef4fb", color: "#1f4e79", fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                  >
                    {isExporting
                      ? <><Spinner size="sm" style={{ width: 10, height: 10 }} animation="border" /> Exporting…</>
                      : <><FaTable size={10} /> Export Existing</>}
                  </button>

                  {/* Import History toggle */}
                  <button
                    onClick={() => setShowHistory(h => !h)}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 8, border: '1px solid #e5e7eb', background: showHistory ? '#f9fafb' : '#fff', color: '#6b7280', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                  >
                    <FaHistory size={10} /> History
                    {showHistory ? <FaChevronUp size={8} /> : <FaChevronDown size={8} />}
                  </button>
                </div>
              </Col>
            </Row>

            {/* ── Legend ──────────────────────────────────────────────────── */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
              {Object.entries(CODE_LABELS).map(([code, { label, color, bg }]) => (
                <span key={code} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: bg, color, fontWeight: 700 }}>
                  {code} = {label}
                </span>
              ))}
            </div>

            {/* ── Drop zone ───────────────────────────────────────────────── */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => !uploadedFile && fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${dragOver ? "#1f4e79" : '#d1d5db'}`,
                borderRadius: 10,
                padding: '20px 16px',
                textAlign: 'center',
                background: dragOver ? "#eef4fb" : '#fafafa',
                cursor: uploadedFile ? 'default' : 'pointer',
                transition: 'all 0.15s',
                marginBottom: 12,
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />

              {!uploadedFile ? (
                <>
                  <FaCloudUploadAlt size={28} color="#9ca3af" style={{ marginBottom: 8 }} />
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                    Drop Excel file here or click to browse
                  </div>
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>
                    Accepts .xlsx / .xls — Use "Download Template" to get the correct format
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                  <FaFileExcel size={22} color="#16a34a" />
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{uploadedFile.name}</div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>
                      {(uploadedFile.size / 1024).toFixed(1)} KB
                      {parsedRecords && ` · ${parsedRecords.length} employee rows parsed`}
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); resetUpload(); }}
                    style={{ marginLeft: 8, background: '#fee2e2', border: 'none', borderRadius: 6, padding: '3px 8px', fontSize: 11, color: '#dc2626', cursor: 'pointer' }}
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>

            {/* ── Parse error ─────────────────────────────────────────────── */}
            {parseError && (
              <div style={{ background: '#fee2e2', color: '#dc2626', borderRadius: 8, padding: '8px 12px', fontSize: 12, marginBottom: 12, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <FaTimesCircle size={13} style={{ marginTop: 1, flexShrink: 0 }} />
                {parseError}
              </div>
            )}

            {/* ── Action buttons row ───────────────────────────────────────── */}
            {parsedRecords && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                <button
                  onClick={handleValidate}
                  disabled={!canValidate}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 8, border: 'none', background: isValidating ? '#e5e7eb' : '#f59e0b', color: isValidating ? '#9ca3af' : '#fff', fontSize: 12, fontWeight: 700, cursor: canValidate ? 'pointer' : 'not-allowed' }}
                >
                  {isValidating
                    ? <><Spinner size="sm" style={{ width: 12, height: 12 }} animation="border" /> Validating…</>
                    : <><FaCheckCircle size={11} /> Validate File</>}
                </button>

                {validationResult && (
                  <button
                    onClick={() => setShowPreviewModal(true)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 8, border: '1px solid #6366f1', background: "#eef4fb", color: "#1f4e79", fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                  >
                    <FaEye size={11} /> Preview ({validationResult.valid_count})
                  </button>
                )}

                {canImport && (
                  <button
                    onClick={handleImport}
                    disabled={isImporting}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 8, border: 'none', background: isImporting ? '#e5e7eb' : "#1f4e79", color: isImporting ? '#9ca3af' : '#fff', fontSize: 12, fontWeight: 700, cursor: isImporting ? 'not-allowed' : 'pointer' }}
                  >
                    {isImporting
                      ? <><Spinner size="sm" style={{ width: 12, height: 12 }} animation="border" /> Importing…</>
                      : <><FaUpload size={11} /> Import Attendance</>}
                  </button>
                )}
              </div>
            )}

            {/* ── Validation result banner ─────────────────────────────────── */}
            {validationResult && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: hasErrors ? 12 : 0 }}>
                {validationResult.valid_count > 0 && (
                  <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '6px 12px', fontSize: 12, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <FaCheckCircle size={11} />
                    <strong>{validationResult.valid_count}</strong> employees ready to import
                  </div>
                )}
                {validationResult.error_count > 0 && (
                  <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '6px 12px', fontSize: 12, color: '#c2410c', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <FaExclamationTriangle size={11} />
                    <strong>{validationResult.error_count}</strong> rows have errors (will be skipped)
                  </div>
                )}
                {(validationResult.skipped_not_found || 0) > 0 && (
                  <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '6px 12px', fontSize: 12, color: '#0369a1', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <FaExclamationTriangle size={11} />
                    <strong>{validationResult.skipped_not_found}</strong> name(s) not found in database — existing data kept unchanged
                  </div>
                )}
              </div>
            )}

            {/* ── Not-found names list (diagnostic) ───────────────────────── */}
            {(validationResult?.skipped_not_found || 0) > 0 && (validationResult?.not_found_names || []).length > 0 && (
              <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '10px 14px', fontSize: 12, marginBottom: 12, marginTop: 8, maxHeight: 160, overflowY: 'auto' }}>
                <div style={{ fontWeight: 700, color: '#0369a1', marginBottom: 6 }}>Names from Excel not matched in database (skipped):</div>
                {validationResult.not_found_names.map((name, i) => (
                  <div key={i} style={{ color: '#0c4a6e', marginBottom: 2 }}>• {name}</div>
                ))}
              </div>
            )}

            {/* ── Validation errors list ───────────────────────────────────── */}
            {hasErrors && (
              <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '10px 14px', fontSize: 12, marginBottom: 12, maxHeight: 160, overflowY: 'auto' }}>
                <div style={{ fontWeight: 700, color: '#9a3412', marginBottom: 6 }}>Validation Errors (will be skipped on import):</div>
                {validationResult.errors.map((err, i) => (
                  <div key={i} style={{ marginBottom: 4, color: '#7c2d12' }}>
                    <strong>{err.employee_id}</strong>
                    {err.employee_name ? ` (${err.employee_name})` : ''} —{' '}
                    {Array.isArray(err.errors) ? err.errors.join('; ') : err.message}
                  </div>
                ))}
              </div>
            )}

            {/* ── Import result ────────────────────────────────────────────── */}
            {importResult && <ImportResultBanner result={importResult} />}

            {/* ── Import history section ───────────────────────────────────── */}
            {showHistory && (
              <div style={{ marginTop: 16, borderTop: '1px solid #f3f4f6', paddingTop: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: '#374151', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <FaHistory size={12} color="#1f4e79" /> Import History
                  </span>
                  <button
                    onClick={fetchHistory}
                    disabled={isLoadingHistory}
                    style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: 6, padding: '3px 8px', fontSize: 11, cursor: 'pointer', color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    {isLoadingHistory ? <Spinner size="sm" style={{ width: 9, height: 9 }} animation="border" /> : <FaSync size={9} />}
                    Refresh
                  </button>
                </div>
                {importHistory.length === 0 ? (
                  <p style={{ color: '#9ca3af', fontSize: 12, textAlign: 'center', padding: '12px 0' }}>No import history yet</p>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <PaginatedTable style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                      <thead>
                        <tr style={{ background: '#f9fafb' }}>
                          {['Month','Year','File','Inserted','Updated','Failed','Imported By','Date'].map(h => (
                            <th key={h} style={{ padding: '6px 10px', fontWeight: 700, color: '#374151', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap', textAlign: 'left' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {importHistory.map((log, i) => (
                          <tr key={log.id || i} style={{ borderBottom: '1px solid #f3f4f6', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                            <td style={{ padding: '6px 10px', fontWeight: 600 }}>{MONTHS[log.month - 1]}</td>
                            <td style={{ padding: '6px 10px', color: '#6b7280' }}>{log.year}</td>
                            <td style={{ padding: '6px 10px', color: '#6b7280', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.file_name}>{log.file_name || '—'}</td>
                            <td style={{ padding: '6px 10px', color: '#16a34a', fontWeight: 600 }}>{log.inserted_records}</td>
                            <td style={{ padding: '6px 10px', color: '#0369a1', fontWeight: 600 }}>{log.updated_records}</td>
                            <td style={{ padding: '6px 10px', color: log.failed_records > 0 ? '#dc2626' : '#9ca3af', fontWeight: 600 }}>{log.failed_records}</td>
                            <td style={{ padding: '6px 10px', color: '#6b7280' }}>{log.imported_by || '—'}</td>
                            <td style={{ padding: '6px 10px', color: '#6b7280', whiteSpace: 'nowrap' }}>
                              {log.imported_at ? new Date(log.imported_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </PaginatedTable>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </Card>

      {/* ── Preview & Import Modal ──────────────────────────────────────────── */}
      <Modal show={showPreviewModal} onHide={() => setShowPreviewModal(false)} size="xl" centered scrollable>
        <Modal.Header style={{ background: '#1e1b4b', color: '#fff', border: 'none', padding: '14px 20px' }} closeVariant="white" closeButton>
          <Modal.Title style={{ fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <FaFileExcel size={14} />
            Import Preview — {MONTHS[month - 1]} {year}
          </Modal.Title>
        </Modal.Header>

        <Modal.Body style={{ padding: 20 }}>
          {validationResult && (
            <>
              {/* Summary strip */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                {[
                  { label: 'Employees Ready', value: validationResult.valid_count, color: '#16a34a', bg: '#f0fdf4' },
                  { label: 'Errors Skipped',  value: validationResult.error_count, color: '#dc2626', bg: '#fee2e2' },
                ].map(({ label, value, color, bg }) => (
                  <div key={label} style={{ background: bg, borderRadius: 8, padding: '8px 16px', textAlign: 'center' }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
                    <div style={{ fontSize: 11, color: '#374151' }}>{label}</div>
                  </div>
                ))}
              </div>

              {/* Date grid — each column is one calendar day, rows are employees */}
              {(() => {
                const dateSet = new Set();
                (validationResult.valid_records || []).forEach(emp => {
                  Object.keys(emp.dates || {}).forEach(d => dateSet.add(d));
                });
                const allDates = [...dateSet].sort();

                const CODE_CELL = {
                  P:  { bg: '#dcfce7', color: '#15803d' },
                  A:  { bg: '#fee2e2', color: '#b91c1c' },
                  HD: { bg: '#fef9c3', color: '#a16207' },
                  L:  { bg: '#ede9fe', color: '#6d28d9' },
                  WO: { bg: '#f1f5f9', color: '#64748b' },
                  H:  { bg: '#fef3c7', color: '#92400e' },
                  CO: { bg: '#e0f2fe', color: '#0369a1' },
                  PL: { bg: '#cffafe', color: '#0891b2' },
                };

                const fmtDate = (dateStr) => {
                  const d = new Date(dateStr + 'T00:00:00');
                  return {
                    day: d.getDate(),
                    mon: d.toLocaleString('en-US', { month: 'short' }),
                    dow: ['Su','Mo','Tu','We','Th','Fr','Sa'][d.getDay()],
                  };
                };

                return (
                  <div style={{ overflowX: 'auto', maxHeight: 440, border: '1px solid #e5e7eb', borderRadius: 8 }}>
                    <PaginatedTable style={{ borderCollapse: 'collapse', fontSize: 11 }}>
                      <thead>
                        <tr>
                          <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700, color: '#374151', borderBottom: '2px solid #e5e7eb', borderRight: '2px solid #d1d5db', position: 'sticky', left: 0, top: 0, background: '#f9fafb', zIndex: 3, minWidth: 155, whiteSpace: 'nowrap' }}>
                            Employee
                          </th>
                          {allDates.map(d => {
                            const { day, mon, dow } = fmtDate(d);
                            const isWknd = dow === 'Sa' || dow === 'Su';
                            return (
                              <th key={d} title={d} style={{ padding: '3px 2px', textAlign: 'center', borderBottom: '2px solid #e5e7eb', borderRight: '1px solid #f3f4f6', minWidth: 30, position: 'sticky', top: 0, zIndex: 2, background: isWknd ? '#eff6ff' : '#f9fafb' }}>
                                <div style={{ color: isWknd ? '#1d4ed8' : '#374151', fontSize: 11, fontWeight: 800, lineHeight: 1.1 }}>{day}</div>
                                <div style={{ color: isWknd ? '#3b82f6' : '#9ca3af', fontSize: 9, lineHeight: 1.2 }}>{mon}</div>
                                <div style={{ color: isWknd ? '#93c5fd' : '#d1d5db', fontSize: 9, lineHeight: 1.2 }}>{dow}</div>
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {(validationResult.valid_records || []).map((emp, i) => (
                          <tr key={emp.employee_id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '4px 10px', position: 'sticky', left: 0, zIndex: 1, background: i % 2 === 0 ? '#fff' : '#fafafa', borderRight: '2px solid #d1d5db', whiteSpace: 'nowrap' }}>
                              <div style={{ fontWeight: 600, color: '#111827', fontSize: 11 }}>{emp.employee_name}</div>
                              <div style={{ fontSize: 9, color: '#9ca3af' }}>{emp.employee_id}</div>
                            </td>
                            {allDates.map(d => {
                              const code = (emp.dates || {})[d];
                              const cs = code ? (CODE_CELL[code] || { bg: '#f3f4f6', color: '#6b7280' }) : null;
                              return (
                                <td key={d} style={{ padding: '3px 2px', textAlign: 'center', background: i % 2 === 0 ? '#fff' : '#fafafa', borderRight: '1px solid #f3f4f6' }}>
                                  {code
                                    ? <span style={{ display: 'inline-block', background: cs.bg, color: cs.color, borderRadius: 3, padding: '1px 2px', fontSize: 10, fontWeight: 700, minWidth: 24, textAlign: 'center' }}>{code}</span>
                                    : <span style={{ color: '#e5e7eb', fontSize: 10 }}>·</span>}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </PaginatedTable>
                  </div>
                );
              })()}

              {/* Not found in DB — names that didn't match any employee */}
              {(validationResult.not_found_names || []).length > 0 && (
                <div style={{ marginTop: 12, background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8, padding: '10px 14px', fontSize: 12, maxHeight: 150, overflowY: 'auto' }}>
                  <strong style={{ color: '#92400e' }}>⚠ Names not found in DB (skipped — {validationResult.not_found_names.length}):</strong>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                    {validationResult.not_found_names.map((name, i) => (
                      <span key={i} style={{ background: '#fde68a', color: '#78350f', borderRadius: 6, padding: '2px 8px', fontWeight: 600 }}>{name}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Errors in modal */}
              {validationResult.error_count > 0 && (
                <div style={{ marginTop: 12, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '10px 14px', fontSize: 12, maxHeight: 150, overflowY: 'auto' }}>
                  <strong style={{ color: '#9a3412' }}>Rows with errors (will be skipped):</strong>
                  {validationResult.errors.map((e, i) => (
                    <div key={i} style={{ color: '#7c2d12', marginTop: 4 }}>
                      <strong>{e.employee_name || e.employee_id}</strong>: {Array.isArray(e.errors) ? e.errors.join('; ') : e.message}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </Modal.Body>

        <Modal.Footer style={{ border: 'none', background: '#f9fafb', padding: '12px 20px', gap: 8 }}>
          <Button variant="light" size="sm" onClick={() => setShowPreviewModal(false)} style={{ fontSize: 12, borderRadius: 8, fontWeight: 600 }}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleImport}
            disabled={!canImport || isImporting}
            style={{ fontSize: 12, borderRadius: 8, background: "#1f4e79", border: 'none', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {isImporting
              ? <><Spinner size="sm" style={{ width: 12, height: 12 }} animation="border" /> Importing…</>
              : <><FaUpload size={11} /> Confirm Import ({validationResult?.valid_count || 0} employees)</>}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default AttendanceImportPanel;
