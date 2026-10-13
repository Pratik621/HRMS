import React, { useState, useEffect } from 'react';
import {
  Row,
  Col,
  Card,
  Table,
  Button,
  Form,
  Alert,
  Spinner,
  Badge,
  Modal,
  Container
} from 'react-bootstrap';
import {
  FaDownload,
  FaFilePdf,
  FaPrint,
  FaEye,
  FaCalendarAlt,
  FaMoneyBillWave,
  FaHistory,
  FaTimes,
  FaCheckCircle,
  FaInfoCircle,
  FaClock,
  FaUserTie,
  FaExclamationTriangle,
  FaTrophy,
  FaArrowLeft
} from 'react-icons/fa';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';
import { useNavigate } from 'react-router-dom';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const companyLogo = '/images/b2bindemand_logo.jfif';

const COMPANY_INFO = {
  b2b: { name: 'B2BinDemand', address: '8th Floor SkyVista, 805, Mhada Colony, Viman Nagar, Pune, Maharashtra 411014', accent: '#1e3a5f' },
  pc:  { name: 'PropCulture', address: 'Pune, Maharashtra', accent: '#0d7b6f' },
};

const SalarySlip = ({ embedded = false }) => {
  const { user } = useAuth();
  const { showNotification } = useNotification();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [salarySlips, setSalarySlips] = useState([]);
  const [selectedSlip, setSelectedSlip] = useState(null);
  const [showSlipModal, setShowSlipModal] = useState(false);
  const [employee, setEmployee] = useState(null);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [joiningInfo, setJoiningInfo] = useState(null);
  const [eligibleMonths, setEligibleMonths] = useState([]);
  const [logoError, setLogoError] = useState(false);

  // Overtime states
  const [overtimeData, setOvertimeData] = useState([]);
  const [overtimeSummary, setOvertimeSummary] = useState({
    total_hours: 0,
    total_amount: 0,
    total_days: 0
  });

  // Set current month as default
  const today = new Date();
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();

  // Default starting point for the picker — the most recently completed cycle (previous
  // calendar month). The employee can pick any earlier eligible month too, from their
  // joining month up through this one — see generateEligibleMonths/isMonthEligible.
  const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
  const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;

  // Employee-selectable — no longer locked to "previous month only". Self-service
  // generation is allowed for any completed cycle: joining month through last month.
  const [selectedMonth, setSelectedMonth] = useState(prevMonth.toString());
  const [selectedYear, setSelectedYear] = useState(prevYear);
  const [hasAttendance, setHasAttendance] = useState(true);
  const [checkingAttendance, setCheckingAttendance] = useState(false);
  const [months] = useState([
    { value: 1, label: 'January' },
    { value: 2, label: 'February' },
    { value: 3, label: 'March' },
    { value: 4, label: 'April' },
    { value: 5, label: 'May' },
    { value: 6, label: 'June' },
    { value: 7, label: 'July' },
    { value: 8, label: 'August' },
    { value: 9, label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' }
  ]);

  // Overtime rate per hour
  const OVERTIME_RATE = 150;

  useEffect(() => {
    if (!user?.employeeId) {
      navigate('/login');
      return;
    }
    fetchEmployeeData();
    fetchSalarySlips();
  }, [user]);

  useEffect(() => {
    if (selectedMonth && selectedYear && user?.employeeId) {
      fetchOvertimeData();
      checkAttendanceExists();
    }
  }, [selectedMonth, selectedYear, user?.employeeId]);

  // Salary cycle runs 26th of previous month to 25th of the selected month
  const getCycleDateRange = (month, year) => {
    const startMonth = month === 1 ? 12 : month - 1;
    const startYear = month === 1 ? year - 1 : year;
    const pad = (n) => String(n).padStart(2, '0');
    return {
      startDateStr: `${startYear}-${pad(startMonth)}-26`,
      endDateStr: `${year}-${pad(month)}-25`
    };
  };

  const checkAttendanceExists = async () => {
    try {
      setCheckingAttendance(true);
      const { startDateStr, endDateStr } = getCycleDateRange(parseInt(selectedMonth), parseInt(selectedYear));
      const response = await axios.get(
        API_ENDPOINTS.ATTENDANCE_EMPLOYEE_REPORT(user.employeeId, startDateStr, endDateStr)
      );
      setHasAttendance((response.data.attendance || []).length > 0);
    } catch (error) {
      console.error('Error checking attendance for salary slip eligibility:', error);
      setHasAttendance(false);
    } finally {
      setCheckingAttendance(false);
    }
  };

  const fetchOvertimeData = async () => {
    try {
      const response = await axios.get(
        `${API_ENDPOINTS.ATTENDANCE}/overtime/${user.employeeId}/${selectedMonth}/${selectedYear}`
      );

      if (response.data.success) {
        setOvertimeData(response.data.overtime || []);
        setOvertimeSummary(response.data.summary || {
          total_hours: 0,
          total_amount: 0,
          total_days: 0
        });
        console.log('📊 Overtime data fetched:', response.data.summary);
      }
    } catch (error) {
      console.error('Error fetching overtime data:', error);
    }
  };

  const generateEligibleMonths = (joiningInfo) => {
    if (!joiningInfo) return;

    const today = new Date();
    const eligible = [];

    let year = joiningInfo.year;
    let month = joiningInfo.month;

    // A month's cycle (26th of the prior month → 25th of this one) only becomes
    // self-serviceable once we're 2 days clear of its own end — i.e. from the 27th of
    // that same month onward (same rule as isMonthEligible below). This naturally stops
    // at the last fully-completed cycle and excludes the current in-progress one, without
    // hardcoding "previous calendar month" — e.g. on the 27th+ of a month, that month's
    // own slip is already eligible even though we're still "in" it.
    while (today >= new Date(year, month - 1, 27)) {
      eligible.push({
        year: year,
        month: month,
        label: `${months.find(m => m.value === month)?.label} ${year}`
      });

      month++;
      if (month > 12) {
        month = 1;
        year++;
      }
    }

    setEligibleMonths(eligible);

    // Default the picker to the most recently completed eligible cycle.
    if (eligible.length > 0) {
      const latest = eligible[eligible.length - 1];
      setSelectedYear(latest.year);
      setSelectedMonth(latest.month.toString());
    }
  };

  const fetchEmployeeData = async () => {
    try {
      const response = await axios.get(API_ENDPOINTS.EMPLOYEE_PROFILE(user.employeeId));
      setEmployee(response.data);
    } catch (error) {
      console.error('Error fetching employee:', error);
      showNotification(error.response?.data?.message || 'Failed to load employee data', 'danger');
    }
  };

  const fetchSalarySlips = async () => {
    try {
      setLoading(true);
      const response = await axios.get(API_ENDPOINTS.SALARY_EMPLOYEE(user.employeeId));

      // Check if the response has the expected structure
      if (response.data.success) {
        const allSlips = response.data.salarySlips || [];
        setSalarySlips(allSlips);
        setAllSalarySlips(allSlips);
        const lastFive = getLastFiveSlips(allSlips);
        setDisplaySlips(lastFive);

        if (response.data.joiningInfo) {
          setJoiningInfo(response.data.joiningInfo);
          generateEligibleMonths(response.data.joiningInfo);
        }
      } else {
        // Show message if any
        if (response.data.message) {
          setMessage({
            type: 'info',
            text: response.data.message
          });
        }
      }
    } catch (error) {
      console.error('Error fetching salary slips:', error);

      // Check if it's a 404 or table not exists error
      if (error.response?.status === 500 &&
        error.response?.data?.error?.includes('does not exist')) {
        setMessage({
          type: 'info',
          text: 'Salary slips feature is being set up. Please check back later.'
        });
      } else {
        setMessage({
          type: 'danger',
          text: error.response?.data?.message || 'Failed to load salary slips'
        });
      }
    } finally {
      setLoading(false);
    }
  };


  const isMonthEligible = (month, year) => {
    if (!joiningInfo) return true;

    const requestedDate = new Date(year, month - 1, 1);
    const joiningDate   = new Date(joiningInfo.year, joiningInfo.month - 1, 1);
    if (requestedDate < joiningDate) return false;

    const today = new Date();
    const m = parseInt(month), y = parseInt(year);

    // Future year
    if (y > today.getFullYear()) return false;
    // Future month in current year
    if (y === today.getFullYear() && m > today.getMonth() + 1) return false;

    // Cycle for selected month ends on 25th of that month.
    // Allow generation only 2 days after cycle end date (i.e., from 27th of that month).
    const cycleEndDate = new Date(y, m - 1, 25); // 25th of selected month
    const allowFrom = new Date(y, m - 1, 27);    // 27th of selected month
    if (today < allowFrom) return false;

    return true;
  };

  const handleGenerateSlip = async () => {
    if (!selectedMonth || !selectedYear) {
      setMessage({
        type: 'warning',
        text: 'Please select month and year'
      });
      return;
    }

    if (!hasAttendance) {
      setMessage({
        type: 'danger',
        text: 'No attendance records found for this period. Salary slip cannot be generated without attendance data.'
      });
      return;
    }

    if (joiningInfo && !isMonthEligible(selectedMonth, selectedYear)) {
      let errorMessage = '';
      const requestedDate = new Date(selectedYear, selectedMonth - 1, 1);
      const joiningDate = new Date(joiningInfo.year, joiningInfo.month - 1, 1);
      const currentDate = new Date();

      if (requestedDate < joiningDate) {
        errorMessage = `You cannot generate salary slip for months before your joining date (${joiningInfo.formattedDate})`;
      } else if (requestedDate > currentDate) {
        errorMessage = 'You cannot generate salary slip for future months';
      }

      setMessage({
        type: 'danger',
        text: errorMessage
      });
      return;
    }

    setGenerating(true);
    setMessage({ type: '', text: '' });

    try {
      console.log('📤 Generating salary slip with overtime:', {
        employee_id: user.employeeId,
        month: parseInt(selectedMonth),
        year: parseInt(selectedYear),
        overtime_amount: overtimeSummary.total_amount,
        overtime_hours: overtimeSummary.total_hours
      });

      const response = await axios.post(API_ENDPOINTS.SALARY_GENERATE, {
        employee_id: user.employeeId,
        month: parseInt(selectedMonth),
        year: parseInt(selectedYear)
      });

      console.log('✅ Salary slip generated:', response.data);

      setMessage({
        type: 'success',
        text: 'Salary slip generated successfully!'
      });

      await fetchSalarySlips();

      if (response.data.salarySlip) {
        setSelectedSlip(response.data.salarySlip);
        setShowSlipModal(true);
      }

    } catch (error) {
      console.error('❌ Error generating salary slip:', error);
      console.error('Error response:', error.response?.data);
      console.error('Error status:', error.response?.status);

      let errorMsg = error.response?.data?.message || 'Failed to generate salary slip';

      if (error.response?.status === 403) {
        errorMsg = 'You do not have permission to generate salary slips. Please contact admin.';
      } else if (error.response?.status === 401) {
        errorMsg = 'Your session has expired. Please login again.';
      }

      setMessage({
        type: 'danger',
        text: errorMsg
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleViewSlip = (slip) => {
    setSelectedSlip(slip);
    setShowSlipModal(true);
  };

  const getBase64Image = async (imagePath) => {
    try {
      if (imagePath.startsWith('data:') || imagePath.startsWith('blob:')) {
        return imagePath.split(',')[1];
      }

      const response = await fetch(imagePath);
      const blob = await response.blob();

      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64String = reader.result.split(',')[1];
          resolve(base64String);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error('Error converting image to base64:', error);
      return '';
    }
  };

  const handleDownloadPDF = async (slip) => {
    if (!slip || !employee) return;

    setSelectedSlip(slip);

    try {
      setMessage({
        type: 'info',
        text: 'Generating PDF...'
      });

      const { basicSalary, deduction, netSalary, overtimeAmount, overtimeHours, absentDays, unpaidLeaveDays, unpaidDeduction, perDaySalary } = getSlipAmounts(slip);
      const totalAbsentDeduction = unpaidDeduction;
      const bd = getDeductionBreakdown(slip);
      const pfAmt = bd.pf;
      const ptAmt = bd.pt;
      const professionalTaxAmt = bd.professionalTax || 0;
      const dtAmt = bd.dt !== null ? bd.dt : deduction;
      const totalDeductionsForPrint = pfAmt + ptAmt + professionalTaxAmt + dtAmt + totalAbsentDeduction;

      let logoBase64 = '';
      try {
        logoBase64 = await getBase64Image(companyLogo);
      } catch (logoErr) {
        console.warn('Could not load logo for PDF:', logoErr);
      }

      // Get month name
      const monthName = months.find(m => m.value === parseInt(slip.month))?.label || 'Unknown';

      // Create a temporary div for PDF content
      const pdfContentDiv = document.createElement('div');
      pdfContentDiv.style.width = '800px';
      pdfContentDiv.style.padding = '20px';
      pdfContentDiv.style.fontFamily = 'Arial, sans-serif';
      pdfContentDiv.style.backgroundColor = 'white';

      const isPC = employee?.pf_amount != null && parseInt(employee.pf_amount) === 0;
      const co = isPC ? COMPANY_INFO.pc : COMPANY_INFO.b2b;

      pdfContentDiv.innerHTML = `
        <div style="text-align: center; margin-bottom: 20px;">
          ${isPC
            ? `<div style="font-size:26px;font-weight:900;color:${co.accent};letter-spacing:1px;margin-bottom:8px;">${co.name}</div>`
            : logoBase64 ? `<img src="data:image/png;base64,${logoBase64}" style="height: 60px; width: auto; margin-bottom: 10px; object-fit: contain;" />` : `<div style="font-size:22px;font-weight:900;color:${co.accent};margin-bottom:8px;">${co.name}</div>`
          }
          <p style="font-size: 12px; color: #333; margin: 0;">${co.address}</p>
        </div>

        <h3 style="text-align: center; font-size: 18px; font-weight: bold; margin: 20px 0; text-decoration: underline;">
          Salary Slip for the month of ${monthName}, ${slip.year}
        </h3>

        <table style="width: 100%; font-size: 14px; margin-bottom: 20px; border-collapse: collapse;">
          <tr>
            <td style="padding: 4px 0; width: 50%;"><strong>Name:</strong> ${employee?.first_name} ${employee?.last_name}</td>
            <td style="padding: 4px 0; width: 50%;"><strong>Employee Code No:</strong> ${employee?.employee_id}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0;"><strong>Date of Joining:</strong> ${new Date(employee?.joining_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</td>
          </tr>
        </table>

        <table style="width: 100%; font-size: 14px; margin-bottom: 20px; border-collapse: collapse;">
          <thead>
            <tr style="border-top: 1px solid #000; border-bottom: 1px solid #000;">
              <th style="text-align: left; padding: 8px 4px;">Earnings</th>
              <th style="text-align: right; padding: 8px 4px;">Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding: 4px 4px;">Basic Salary</td>
              <td style="text-align: right; padding: 4px 4px;">${formatCurrency(basicSalary)}</td>
            </tr>
            <!-- Overtime row - ALWAYS SHOW -->
            <tr style="${overtimeAmount > 0 ? 'background-color: #d4edda;' : ''}">
              <td style="padding: 4px 4px;">
                <span style="${overtimeAmount > 0 ? 'color: #28a745;' : ''}">Overtime (${overtimeHours || 0} hrs @ ₹150/hr)</span>
              </td>
              <td style="text-align: right; padding: 4px 4px; ${overtimeAmount > 0 ? 'color: #28a745; font-weight: bold;' : ''}">
                ${overtimeAmount > 0 ? '+ ' : ''}${formatCurrency(overtimeAmount)}
              </td>
            </tr>
            <tr style="background-color: #f2f2f2;">
              <td style="font-weight: bold; padding: 4px 4px;">Gross Earnings</td>
              <td style="text-align: right; font-weight: bold; padding: 4px 4px;">${formatCurrency(basicSalary + overtimeAmount)}</td>
            </tr>
          </tbody>
        </table>

        <table style="width: 100%; font-size: 14px; margin-bottom: 20px; border-collapse: collapse;">
          <thead>
            <tr style="border-top: 1px solid #000; border-bottom: 1px solid #000;">
              <th style="text-align: left; padding: 8px 4px;">Deductions</th>
              <th style="text-align: right; padding: 8px 4px;">Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${pfAmt > 0 ? `<tr><td style="padding: 4px 4px;">PF (Provident Fund)</td><td style="text-align: right; padding: 4px 4px;">${formatCurrency(pfAmt)}</td></tr>` : ''}
            <tr><td style="padding: 4px 4px;">PT</td><td style="text-align: right; padding: 4px 4px;">${ptAmt > 0 ? formatCurrency(ptAmt) : '0'}</td></tr>
            ${professionalTaxAmt > 0 ? `<tr><td style="padding: 4px 4px;">Professional Tax</td><td style="text-align: right; padding: 4px 4px;">${formatCurrency(professionalTaxAmt)}</td></tr>` : ''}
            <tr><td style="padding: 4px 4px;">TDS</td><td style="text-align: right; padding: 4px 4px;">0</td></tr>
            ${totalAbsentDeduction > 0 ? `
            <tr style="background-color: #ffe0e0;">
              <td style="padding: 4px 4px; color: #d9534f;">Absent Deduction (${absentDays > 0 ? absentDays + ' absent' : ''}${unpaidLeaveDays > 0 ? (absentDays > 0 ? ' + ' : '') + unpaidLeaveDays + ' unpaid leave' : ''} × ₹${formatCurrency(perDaySalary)}/day)</td>
              <td style="text-align: right; font-weight: bold; color: #d9534f; padding: 4px 4px;">₹${formatCurrency(totalAbsentDeduction)}</td>
            </tr>` : ''}
            ${dtAmt > 0 ? `<tr style="background-color: #fff3cd;">
              <td style="font-weight: bold; padding: 4px 4px;">DT (Fixed Deduction)</td>
              <td style="text-align: right; font-weight: bold; color: #d9534f; padding: 4px 4px;">${formatCurrency(dtAmt)}</td>
            </tr>` : ''}
            <tr style="background-color: #f2f2f2;">
              <td style="font-weight: bold; padding: 4px 4px;">Total Deductions</td>
              <td style="text-align: right; font-weight: bold; color: #d9534f; padding: 4px 4px;">${formatCurrency(totalDeductionsForPrint)}</td>
            </tr>
            <tr style="font-weight: bold; border-top: 2px solid #000;">
              <td style="padding: 8px 4px;">NET SALARY</td>
              <td style="text-align: right; color: #28a745; padding: 8px 4px;">${formatCurrency(netSalary)}</td>
            </tr>
          </tbody>
        </table>

        <div style="background-color: #f8f9fa; padding: 10px; margin-bottom: 20px; border-radius: 5px; font-size: 13px;">
          <strong>Calculation:</strong> Basic Salary (₹${formatCurrency(basicSalary)})
          + Overtime (₹${formatCurrency(overtimeAmount)})
          ${totalAbsentDeduction > 0 ? ` - Absent Deduction (₹${formatCurrency(totalAbsentDeduction)})` : ''}
          ${dtAmt > 0 ? `- DT Deduction (₹${formatCurrency(dtAmt)})` : pfAmt > 0 ? `- PF+PT+Prof.Tax (₹${formatCurrency(pfAmt + ptAmt + professionalTaxAmt)})` : ''} = Net Salary (₹${formatCurrency(netSalary)})
        </div>

        <div style="font-size: 14px; margin-bottom: 30px;">
          <strong>Amount in Words:</strong> Rupees ${numberToWords(Math.round(netSalary))} Only
        </div>

        <div style="font-size: 14px; margin-bottom: 20px;">
          <strong>Gross Salary (CTC):</strong> <span style="color: #0d6efd; font-weight: bold;">₹${formatCurrency(employee?.gross_salary || employee?.salary)}</span>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 20px; font-size: 14px;">
          <div>For B2BinDemand</div>
          <div>Authorized Signatory</div>
        </div>

        <div style="text-align: right; margin-top: 10px; font-size: 11px; color: #6c757d;">
          Generated on: ${new Date().toLocaleString()}
        </div>
      `;

      document.body.appendChild(pdfContentDiv);

      const canvas = await html2canvas(pdfContentDiv, {
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false,
        allowTaint: true,
        useCORS: true,
        windowWidth: 800
      });

      document.body.removeChild(pdfContentDiv);

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'px',
        format: [canvas.width * 0.75, canvas.height * 0.75]
      });

      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width * 0.75, canvas.height * 0.75);
      pdf.save(`Salary_Slip_${employee?.employee_id}_${monthName}_${slip.year}.pdf`);

      setMessage({
        type: 'success',
        text: 'PDF downloaded successfully!'
      });

      setTimeout(() => {
        setMessage({ type: '', text: '' });
      }, 3000);

    } catch (error) {
      console.error('Error generating PDF:', error);
      setMessage({
        type: 'danger',
        text: error.message || 'Failed to download PDF'
      });
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const formatCurrency = (amount) => {
    if (amount === undefined || amount === null) return '0';
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount || 0).replace('₹', '').trim();
  };

  const getDeductionBreakdown = (slip) => {
    const m = parseInt(slip?.month || 0);
    const y = parseInt(slip?.year  || 0);
    const isPFApplicable = y > 2026 || (y === 2026 && m >= 5);
    if (isPFApplicable) {
      // PT no longer auto-defaults to ₹200 — admin must explicitly set it; unset = 0.
      const pt = employee?.pt_amount != null ? parseInt(employee.pt_amount) : 0;
      const professionalTax = employee?.professional_tax_amount != null ? parseInt(employee.professional_tax_amount) : 0;
      if (employee?.pf_amount != null) {
        return { pf: parseInt(employee.pf_amount), pt, professionalTax, dt: 0 };
      }
      const totalFixed = Number(slip?.dt) || (1800 + pt + professionalTax);
      return { pf: totalFixed - pt - professionalTax, pt, professionalTax, dt: 0 };
    }
    return { pf: 0, pt: 0, professionalTax: 0, dt: null };
  };

  const getSlipAmounts = (slip) => {
    if (!slip) return { monthlySalary: 0, basicSalary: 0, deduction: 0, netSalary: 0, overtimeAmount: 0, overtimeHours: 0, unpaidLeaveDays: 0, paidLeaveDays: 0, absentDays: 0, presentDays: 0, unpaidDeduction: 0, perDaySalary: 0, totalWorkingDays: 0, holidayDays: 0 };

    const monthlySalary    = Number(slip.monthly_salary) || Number(employee?.gross_salary || employee?.salary) || 0;
    const basicSalary      = slip.basic_salary != null ? Number(slip.basic_salary) : monthlySalary;
    const deduction        = slip.basic_salary != null && Number(slip.basic_salary) === 0 ? 0 : (Number(slip.dt) || 200);
    const netSalary        = slip.net_salary   != null ? Number(slip.net_salary)   : Math.max(0, basicSalary - deduction);
    const overtimeAmount   = Number(slip.overtime_amount)   || 0;
    const overtimeHours    = Number(slip.overtime_hours)    || 0;
    const unpaidLeaveDays  = Number(slip.unpaid_leave_days) || 0;
    const paidLeaveDays    = Number(slip.paid_leave_days)   || 0;
    const absentDays       = Number(slip.absent_days)       || 0;
    const presentDays      = Number(slip.present_days)      || 0;
    const unpaidDeduction  = Number(slip.unpaid_deduction)  || 0;
    const perDaySalary     = Number(slip.per_day_salary)    || 0;
    const totalWorkingDays = Number(slip.total_working_days)|| 22;
    // holidayDays = totalWorkingDays - presentDays - paidLeaveDays - absentDays - unpaidLeaveDays
    const holidayDays      = Math.max(0, totalWorkingDays - presentDays - paidLeaveDays - absentDays - unpaidLeaveDays);

    return { monthlySalary, basicSalary, deduction, netSalary, overtimeAmount, overtimeHours, unpaidLeaveDays, paidLeaveDays, absentDays, presentDays, unpaidDeduction, perDaySalary, totalWorkingDays, holidayDays };
  };

  const getMonthName = (monthNumber) => {
    const month = months.find(m => m.value === parseInt(monthNumber));
    return month ? month.label : 'Unknown';
  };

  const formatCycleDates = (slip) => {
    if (slip.cycle_start_date && slip.cycle_end_date) {
      const fmt = (d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      return `${fmt(slip.cycle_start_date)} to ${fmt(slip.cycle_end_date)}`;
    }
    return `${getMonthName(slip.month)} ${slip.year}`;
  };

  const formatShortDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  };

  const selectedSlipAmounts = selectedSlip ? getSlipAmounts(selectedSlip) : { basicSalary: 0, deduction: 0, netSalary: 0, overtimeAmount: 0, overtimeHours: 0 };

  const getStatusBadge = (isPaid) => {
    return isPaid ?
      <Badge bg="success" className="px-3 py-2 small">
        <FaCheckCircle className="me-1" size={10} /> Paid
      </Badge> :
      <Badge bg="warning" className="px-3 py-2 small">
        <FaClock className="me-1" size={10} /> Pending
      </Badge>;
  };

  const numberToWords = (num) => {
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
      'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    if (num === 0) return 'Zero';

    const numToWords = (n) => {
      if (n < 20) return ones[n];
      if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
      if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + numToWords(n % 100) : '');
      if (n < 100000) return numToWords(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + numToWords(n % 1000) : '');
      if (n < 10000000) return numToWords(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + numToWords(n % 100000) : '');
      return numToWords(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + numToWords(n % 10000000) : '');
    };

    return numToWords(num);
  };

  const handleLogoError = () => {
    setLogoError(true);
  };

  const getLastFiveSlips = (slips) => {
    if (!slips || slips.length === 0) return [];

    const sortedSlips = [...slips].sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.month - a.month;
    });

    return sortedSlips.slice(0, 5);
  };

  const [allSalarySlips, setAllSalarySlips] = useState([]);
  const [displaySlips, setDisplaySlips] = useState([]);

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center min-vh-100">
        <div className="text-center">
          <Spinner animation="border" variant="primary" style={{ width: '3rem', height: '3rem' }} />
          <p className="mt-3 text-muted small">Loading salary slips...</p>
        </div>
      </div>
    );
  }

  return (
    <Container fluid className={embedded ? 'payroll-salary p-0' : 'p-2 p-md-3 p-lg-4'} style={embedded ? undefined : { backgroundColor: '#f8f9fc', minHeight: '100vh' }}>
      {/* Header - Responsive */}
      <div className="d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center mb-4 gap-3">
        <h5 className="mb-0 d-flex align-items-center" hidden={embedded}>
          <FaMoneyBillWave className="me-2 text-primary" />
          Salary Slips
        </h5>
        <div className="d-flex flex-wrap gap-2 ms-0 ms-sm-auto">
          {overtimeSummary.total_hours > 0 && (
            <Badge bg="success" className="px-3 py-2 small d-inline-flex align-items-center">
              <FaClock className="me-2" size={12} />
              OT: {overtimeSummary.total_hours}h (₹{overtimeSummary.total_amount})
            </Badge>
          )}
          <Badge bg="dark" className="px-3 py-2 small d-inline-flex align-items-center">
            <FaHistory className="me-2" size={12} />
            Total Slips: {allSalarySlips.length}
          </Badge>
          <button
            className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1"
            hidden={embedded}
            onClick={() => navigate(-1)}
          >
            <FaArrowLeft size={12} /> Back
          </button>
        </div>
      </div>

      {/* Alert Messages - Responsive */}
      {message.text && (
        <Alert
          variant={message.type}
          onClose={() => setMessage({ type: '', text: '' })}
          dismissible
          className="mb-4 shadow-sm small py-2"
        >
          <div className="d-flex align-items-center">
            {message.type === 'success' && <FaCheckCircle className="me-2 flex-shrink-0" size={14} />}
            {message.type === 'info' && <FaInfoCircle className="me-2 flex-shrink-0" size={14} />}
            {message.type === 'danger' && <FaExclamationTriangle className="me-2 flex-shrink-0" size={14} />}
            {message.type === 'warning' && <FaInfoCircle className="me-2 flex-shrink-0" size={14} />}
            <span>{message.text}</span>
          </div>
        </Alert>
      )}

      <div className="salary-overview">
        <div><span>Employee</span><strong>{employee ? [employee.first_name, employee.last_name].filter(Boolean).join(' ') : '—'}</strong><small>{employee?.employee_id || 'Employee account'}</small></div>
        <div><span>Selected pay period</span><strong>{getMonthName(Number(selectedMonth))} {selectedYear}</strong><small>Completed pay cycles only</small></div>
        <div><span>Available statements</span><strong>{allSalarySlips.length}</strong><small>Generated salary slips</small></div>
      </div>
      {joiningInfo && <p className="salary-eligibility-note"><FaInfoCircle size={12} /> Salary slips are available from {months.find(m => m.value === joiningInfo.month)?.label} {joiningInfo.year}, based on your joining date.</p>}

      <Row className="g-3">
        {/* Left Column - Generate Form */}
        <Col lg={4}>
          {/* Generate New Slip Card */}
          <Card className="salary-generate-card mb-4 shadow-sm border-0">
            <Card.Header className="bg-light text-dark py-2">
              <h6 className="mb-0 fw-semibold small">
                <FaCalendarAlt className="me-2" size={14} />
                Create salary statement
              </h6>
            </Card.Header>
            <Card.Body className="p-2 p-md-3">
              <Form>
                {/* Year Selection — any year that has at least one eligible month */}
                <Form.Group className="mb-2">
                  <Form.Label className="small fw-medium text-muted">Select Year</Form.Label>
                  <Form.Select
                    value={selectedYear}
                    size="sm"
                    className="py-2"
                    disabled={eligibleMonths.length === 0}
                    onChange={(e) => {
                      const year = parseInt(e.target.value);
                      setSelectedYear(year);
                      const firstForYear = eligibleMonths.find(em => em.year === year);
                      if (firstForYear) setSelectedMonth(firstForYear.month.toString());
                    }}
                  >
                    {[...new Set(eligibleMonths.map(em => em.year))].map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </Form.Select>
                </Form.Group>

                {/* Month Selection — any completed cycle from joining month through last month */}
                <Form.Group className="mb-3">
                  <Form.Label className="small fw-medium text-muted">Select Month</Form.Label>
                  <Form.Select
                    value={selectedMonth}
                    size="sm"
                    className="py-2"
                    disabled={eligibleMonths.length === 0}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                  >
                    {eligibleMonths.filter(em => em.year === parseInt(selectedYear)).map(em => (
                      <option key={em.month} value={em.month}>{em.label}</option>
                    ))}
                  </Form.Select>
                  <small className="text-muted d-block mt-1">
                    Generate a slip for any completed cycle from your joining month through last month — no approval needed.
                  </small>

                  {selectedMonth && selectedYear && joiningInfo && !isMonthEligible(selectedMonth, selectedYear) && (
                    <div className="mt-1 text-danger small d-flex align-items-start">
                      <FaInfoCircle className="me-1 flex-shrink-0 mt-1" size={10} />
                      <span className="text-wrap">
                        {(() => {
                          const m = parseInt(selectedMonth), y = parseInt(selectedYear);
                          const today = new Date();
                    const allowFrom = new Date(y, m - 1, 27);
                          if (today < allowFrom) {
                            return `Salary slip for ${new Date(y, m-1).toLocaleString('en-IN',{month:'long'})} ${y} will be available from 27 ${new Date(y, m-1).toLocaleString('en-IN',{month:'long'})} ${y} (2 days after cycle end).`;
                          }
                          return 'Cannot generate: Before joining date or future month.';
                        })()}
                      </span>
                    </div>
                  )}

                  {selectedMonth && selectedYear && !checkingAttendance && !hasAttendance && (
                    <div className="mt-1 text-danger small d-flex align-items-start">
                      <FaInfoCircle className="me-1 flex-shrink-0 mt-1" size={10} />
                      <span className="text-wrap">
                        No attendance records found for {months.find(m => m.value === parseInt(selectedMonth))?.label} {selectedYear}. You cannot generate a salary slip without attendance data.
                      </span>
                    </div>
                  )}
                </Form.Group>

                {/* Overtime Preview */}
                {overtimeSummary.total_hours > 0 && (
                  <div className="bg-success bg-opacity-10 p-2 rounded mb-3">
                    <div className="d-flex align-items-center justify-content-between small">
                      <span className="fw-semibold text-success">
                        <FaClock className="me-1" /> Overtime:
                      </span>
                      <Badge bg="success" pill className="text-nowrap">
                        {overtimeSummary.total_hours}h (₹{overtimeSummary.total_amount})
                      </Badge>
                    </div>
                    <div className="mt-1 small text-muted">
                      This will be added to your salary
                    </div>
                  </div>
                )}

                <Button
                  variant="primary"
                  size="sm"
                  className="w-100 py-2 d-inline-flex align-items-center justify-content-center"
                  onClick={handleGenerateSlip}
                  disabled={generating || checkingAttendance || !hasAttendance || !selectedMonth || !selectedYear || (joiningInfo && !isMonthEligible(selectedMonth, selectedYear))}
                >
                  {generating ? (
                    <>
                      <Spinner size="sm" animation="border" className="me-2" />
                      <span className="d-none d-sm-inline">Generating...</span>
                    </>
                  ) : checkingAttendance ? (
                    <>
                      <Spinner size="sm" animation="border" className="me-2" />
                      <span className="d-none d-sm-inline">Checking attendance...</span>
                    </>
                  ) : (
                    <>
                      <FaDownload className="me-2" size={12} />
                      <span className="d-none d-sm-inline">Generate Salary Slip</span>
                      <span className="d-inline d-sm-none">Generate</span>
                      {overtimeSummary.total_hours > 0 && ' (Inc. OT)'}
                    </>
                  )}
                </Button>
              </Form>
            </Card.Body>
          </Card>
        </Col>

        {/* Right Column - Salary Slips History and Employee Details */}
        <Col lg={8}>
          {/* Salary Slips History Card */}
          <Card className="mb-4 shadow-sm border-0">
            <Card.Header className="bg-light text-dark py-2 d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center gap-2">
              <h6 className="mb-0 fw-semibold small d-flex align-items-center">
                <FaHistory className="me-2" size={14} />
                Salary statements
              </h6>
              <div className="d-flex flex-wrap gap-2 ms-0 ms-sm-auto">
                <Badge bg="light" text="dark" className="px-2 py-1 small text-nowrap">
                  Total: {allSalarySlips.length} Slips
                </Badge>
                <Badge bg="primary" className="px-2 py-1 small text-nowrap">
                  Showing: {displaySlips.length} Latest
                </Badge>
              </div>
            </Card.Header>

            <Card.Body className="p-0">
              {/* Table with Vertical Scroll */}
              <div className="table-responsive" style={{ maxHeight: '480px', overflowY: 'auto' }}>
                <Table hover className="salary-statements-table mb-0">
                  <thead><tr><th>Pay period</th><th className="text-end">Basic salary</th><th className="text-end">Deductions</th><th className="text-end">Net pay</th><th className="text-end">Statement</th></tr></thead>
                  <tbody>
                    {displaySlips.length ? displaySlips.map(slip => {
                      const { basicSalary, deduction, netSalary, overtimeAmount, overtimeHours } = getSlipAmounts(slip);
                      return <tr key={slip.id}>
                        <td><strong>{getMonthName(slip.month)} {slip.year}</strong><small className="salary-row-note">Monthly salary statement</small></td>
                        <td className="text-end">₹{formatCurrency(basicSalary)}{overtimeHours > 0 && <small className="salary-row-note">OT: {overtimeHours}h · ₹{formatCurrency(overtimeAmount)}</small>}</td>
                        <td className="text-end">₹{formatCurrency(deduction)}</td>
                        <td className="text-end"><strong className="salary-net-pay">₹{formatCurrency(netSalary)}</strong></td>
                        <td><div className="salary-statement-actions">
                          <Button variant="outline-primary" size="sm" onClick={() => handleViewSlip(slip)} aria-label={`View salary slip for ${getMonthName(slip.month)} ${slip.year}`}><FaEye size={12} /> View</Button>
                          <Button variant="outline-secondary" size="sm" onClick={() => handleDownloadPDF(slip)} aria-label={`Download salary slip for ${getMonthName(slip.month)} ${slip.year}`}><FaDownload size={12} /> PDF</Button>
                        </div></td>
                      </tr>;
                    }) : <tr><td colSpan={5}><div className="salary-empty-state"><FaFilePdf size={30} /><h3>No salary statements yet</h3><p>Select an eligible pay period to generate your first statement.</p></div></td></tr>}
                  </tbody>
                </Table>

                {allSalarySlips.length > 5 && (
                  <div className="text-center mt-2 mb-2">
                    <Badge bg="info" className="px-3 py-2 small">
                      <FaInfoCircle className="me-1" size={10} />
                      Showing last 5 of {allSalarySlips.length} total slips
                    </Badge>
                  </div>
                )}
              </div>
            </Card.Body>
          </Card>

          {/* Employee Details Card */}
          {employee && (
            <Card className="salary-employee-details shadow-sm border-0">
              <Card.Header className="bg-white text-dark py-2">
                <h6 className="mb-0 fw-semibold small">
                  <FaUserTie className="me-2" size={14} />
                  Employee Details
                </h6>
              </Card.Header>
              <Card.Body className="p-2 p-md-3 bg-white">
                <div className="d-flex flex-column gap-2">
                  <div className="d-flex flex-column flex-sm-row">
                    <span className="text-muted small" style={{ minWidth: '120px' }}>Name:</span>
                    <span className="small fw-semibold text-wrap">{employee.first_name} {employee.last_name}</span>
                  </div>
                  <div className="d-flex flex-column flex-sm-row">
                    <span className="text-muted small" style={{ minWidth: '120px' }}>Employee ID:</span>
                    <span className="small">{employee.employee_id}</span>
                  </div>
                  <div className="d-flex flex-column flex-sm-row">
                    <span className="text-muted small" style={{ minWidth: '120px' }}>Department:</span>
                    <span className="small">{employee.department}</span>
                  </div>
                  <div className="d-flex flex-column flex-sm-row">
                    <span className="text-muted small" style={{ minWidth: '120px' }}>Designation:</span>
                    <span className="small">{employee.designation || employee.position}</span>
                  </div>
                  <div className="d-flex flex-column flex-sm-row">
                    <span className="text-muted small" style={{ minWidth: '120px' }}>Joining Date:</span>
                    <span className="small">{new Date(employee.joining_date).toLocaleDateString()}</span>
                  </div>
                  <div className="d-flex flex-column flex-sm-row">
                    <span className="text-muted small" style={{ minWidth: '120px' }}>Gross Salary:</span>
                    <span className="small fw-bold text-primary">₹{formatCurrency(employee.gross_salary || employee.salary)}</span>
                  </div>
                </div>
              </Card.Body>
            </Card>
          )}
        </Col>
      </Row>

      <Modal
        show={showSlipModal}
        onHide={() => setShowSlipModal(false)}
        size="lg"
        centered
        className="salary-slip-modal payroll-slip-modal"
        dialogClassName="mx-2 mx-md-auto"
      >
        <Modal.Header closeButton className="bg-primary text-white py-2">
          <Modal.Title as="h6" className="mb-0 small fw-semibold d-flex align-items-center flex-wrap">
            <FaFilePdf className="me-2 flex-shrink-0" size={14} />
            <span className="text-truncate">
              Salary Slip - {selectedSlip && `${getMonthName(selectedSlip.month)} ${selectedSlip.year}`}
            </span>
            {selectedSlip?.overtime_hours > 0 && (
              <Badge bg="success" className="ms-2 text-nowrap">OT: {selectedSlip.overtime_hours}h</Badge>
            )}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="p-2 p-md-3" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          {selectedSlip && employee && (
            <div className="salary-slip-content p-2 p-md-3" style={{
              fontFamily: 'Arial, sans-serif',
              maxWidth: '800px',
              margin: '0 auto',
              background: 'white'
            }}>
              {/* Company Header */}
              {(() => {
                const isPC = employee?.pf_amount != null && parseInt(employee.pf_amount) === 0;
                const co = isPC ? COMPANY_INFO.pc : COMPANY_INFO.b2b;
                return (
                  <div className="text-center mb-3">
                    {isPC ? (
                      <div style={{ fontSize: 24, fontWeight: 900, color: co.accent, letterSpacing: 1, marginBottom: 8 }}>{co.name}</div>
                    ) : !logoError ? (
                      <img src={companyLogo} alt="B2BinDemand Logo" onError={handleLogoError}
                        style={{ height: '50px', width: 'auto', marginBottom: '10px', objectFit: 'contain' }} />
                    ) : (
                      <div style={{ fontSize: 20, fontWeight: 900, color: co.accent, marginBottom: 8 }}>{co.name}</div>
                    )}
                    <p className="small text-muted mb-0 text-wrap">{co.address}</p>
                  </div>
                );
              })()}

              {/* Title */}
              <h3 className="text-center fw-bold text-decoration-underline mb-3" style={{ fontSize: '15px' }}>
                Salary Slip for the month of {getMonthName(selectedSlip.month)}, {selectedSlip.year}
              </h3>

              {/* Employee Details */}
              <table className="w-100 mb-3" style={{ fontSize: '12px' }}>
                <tbody>
                  <tr>
                    <td className="py-1" style={{ width: '50%' }}>
                      <strong>Name:</strong> {employee?.first_name} {employee?.last_name}
                    </td>
                    <td className="py-1" style={{ width: '50%' }}>
                      <strong>Employee Code No:</strong> {employee?.employee_id}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1">
                      <strong>Date of Joining:</strong> {new Date(employee?.joining_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Cycle Info */}
              <div className="mb-3 p-2 bg-light rounded small">
                <strong>Salary Cycle:</strong> {formatCycleDates(selectedSlip)}<br />
                <strong>Fixed Working Days:</strong> {selectedSlipAmounts.totalWorkingDays} days (Mon–Fri in cycle)<br />
                <strong>Per Day Salary:</strong> ₹{formatCurrency(selectedSlipAmounts.perDaySalary)}<br />
                <strong>Present Days:</strong> <span className="text-success">{selectedSlipAmounts.presentDays} days</span><br />
                {selectedSlipAmounts.paidLeaveDays > 0 && <><strong>Paid Leave:</strong> <span className="text-info">{selectedSlipAmounts.paidLeaveDays} day{selectedSlipAmounts.paidLeaveDays > 1 ? 's' : ''}</span><br /></>}
                {selectedSlipAmounts.holidayDays > 0 && <><strong>Company Holidays:</strong> <span className="text-primary">{selectedSlipAmounts.holidayDays} day{selectedSlipAmounts.holidayDays > 1 ? 's' : ''} (not deducted)</span><br /></>}
                {selectedSlipAmounts.unpaidLeaveDays > 0 && <><strong>Unpaid Leave:</strong> <span className="text-danger">{selectedSlipAmounts.unpaidLeaveDays} day{selectedSlipAmounts.unpaidLeaveDays > 1 ? 's' : ''}</span><br /></>}
                {selectedSlipAmounts.absentDays > 0 && <><strong>Absent:</strong> <span className="text-danger">{selectedSlipAmounts.absentDays} days</span><br /></>}
              </div>

              {/* Earnings Table */}
              <div className="table-responsive">
                <table className="w-100 mb-3" style={{ fontSize: '12px', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderTop: '1px solid #000', borderBottom: '1px solid #000' }}>
                      <th className="text-start py-2 ps-2">Earnings</th>
                      <th className="text-end py-2 pe-2">Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="py-1 ps-2">Monthly Gross Salary ({selectedSlipAmounts.totalWorkingDays} working days in cycle)</td>
                      <td className="text-end py-1 pe-2">{formatCurrency(selectedSlipAmounts.monthlySalary)}</td>
                    </tr>
                    <tr>
                      <td className="py-1 ps-2">
                        Earned Salary ({selectedSlipAmounts.presentDays} present
                        {selectedSlipAmounts.paidLeaveDays > 0 ? ` + ${selectedSlipAmounts.paidLeaveDays} paid leave` : ''}
                        {selectedSlipAmounts.holidayDays > 0 ? ` + ${selectedSlipAmounts.holidayDays} holiday` : ''}
                        {' '}× ₹{formatCurrency(selectedSlipAmounts.perDaySalary)}/day)
                      </td>
                      <td className="text-end py-1 pe-2 fw-semibold">{formatCurrency(selectedSlipAmounts.basicSalary)}</td>
                    </tr>
                    {selectedSlipAmounts.unpaidDeduction > 0 && (
                      <tr style={{ backgroundColor: '#fff3cd' }}>
                        <td className="py-1 ps-2">
                          <span className="text-danger">
                            Absent Deduction ({selectedSlipAmounts.absentDays > 0 ? `${selectedSlipAmounts.absentDays} absent` : ''}{selectedSlipAmounts.unpaidLeaveDays > 0 ? `${selectedSlipAmounts.absentDays > 0 ? ' + ' : ''}${selectedSlipAmounts.unpaidLeaveDays} unpaid leave` : ''} × ₹{formatCurrency(selectedSlipAmounts.perDaySalary)}/day)
                          </span>
                        </td>
                        <td className="text-end py-1 pe-2 text-danger fw-bold">- {formatCurrency(selectedSlipAmounts.unpaidDeduction)}</td>
                      </tr>
                    )}
                    <tr style={selectedSlipAmounts.overtimeAmount > 0 ? { backgroundColor: '#d4edda' } : {}}>
                      <td className="py-1 ps-2">
                        <span style={selectedSlipAmounts.overtimeAmount > 0 ? { color: '#28a745' } : {}}>
                          Overtime ({selectedSlipAmounts.overtimeHours || 0} hrs @ ₹150/hr)
                        </span>
                      </td>
                      <td className="text-end py-1 pe-2" style={selectedSlipAmounts.overtimeAmount > 0 ? { color: '#28a745', fontWeight: 'bold' } : {}}>
                        {selectedSlipAmounts.overtimeAmount > 0 ? '+ ' : ''}{formatCurrency(selectedSlipAmounts.overtimeAmount)}
                      </td>
                    </tr>
                    <tr style={{ backgroundColor: '#f2f2f2' }}>
                      <td className="fw-bold py-1 ps-2">Gross Earnings</td>
                      <td className="text-end fw-bold py-1 pe-2">{formatCurrency(selectedSlipAmounts.basicSalary + selectedSlipAmounts.overtimeAmount)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Deductions Table */}
              <div className="table-responsive">
                <table className="w-100 mb-3" style={{ fontSize: '12px', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderTop: '1px solid #000', borderBottom: '1px solid #000' }}>
                      <th className="text-start py-2 ps-2">Deductions</th>
                      <th className="text-end py-2 pe-2">Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const bdown = getDeductionBreakdown(selectedSlip);
                      const pfV = bdown.pf;
                      const ptV = bdown.pt;
                      const professionalTaxV = bdown.professionalTax || 0;
                      const dtV = bdown.dt !== null ? bdown.dt : selectedSlipAmounts.deduction;
                      const customDed = parseFloat(selectedSlip?.custom_deduction || 0);
                      const absentDeduct = selectedSlipAmounts.unpaidDeduction;
                      return (<>
                        {pfV > 0 && <tr><td className="py-1 ps-2">PF (Provident Fund)</td><td className="text-end py-1 pe-2">{formatCurrency(pfV)}</td></tr>}
                        <tr><td className="py-1 ps-2">PT</td><td className="text-end py-1 pe-2">{ptV > 0 ? formatCurrency(ptV) : '0'}</td></tr>
                        {professionalTaxV > 0 && <tr><td className="py-1 ps-2">Professional Tax</td><td className="text-end py-1 pe-2">{formatCurrency(professionalTaxV)}</td></tr>}
                        <tr><td className="py-1 ps-2">TDS</td><td className="text-end py-1 pe-2">0</td></tr>
                        {absentDeduct > 0 && (
                          <tr style={{ backgroundColor: '#ffe0e0' }}>
                            <td className="py-1 ps-2 text-danger">
                              Absent Deduction ({selectedSlipAmounts.absentDays > 0 ? `${selectedSlipAmounts.absentDays} absent` : ''}{selectedSlipAmounts.unpaidLeaveDays > 0 ? `${selectedSlipAmounts.absentDays > 0 ? ' + ' : ''}${selectedSlipAmounts.unpaidLeaveDays} unpaid leave` : ''} × ₹{formatCurrency(selectedSlipAmounts.perDaySalary)}/day)
                            </td>
                            <td className="text-end fw-bold text-danger py-1 pe-2">{formatCurrency(absentDeduct)}</td>
                          </tr>
                        )}
                        {dtV > 0 && (
                          <tr style={{ backgroundColor: '#fff3cd' }}>
                            <td className="fw-bold py-1 ps-2">DT (Fixed Deduction)</td>
                            <td className="text-end fw-bold text-danger py-1 pe-2">{formatCurrency(dtV)}</td>
                          </tr>
                        )}
                        {customDed > 0 && (
                          <tr style={{ backgroundColor: '#ffe0e0' }}>
                            <td className="py-1 ps-2 text-danger fw-semibold">Other Deduction</td>
                            <td className="text-end fw-bold text-danger py-1 pe-2">{formatCurrency(customDed)}</td>
                          </tr>
                        )}
                        <tr style={{ backgroundColor: '#f2f2f2' }}>
                          <td className="fw-bold py-1 ps-2">Total Deductions</td>
                          <td className="text-end fw-bold text-danger py-1 pe-2">{formatCurrency(pfV + ptV + professionalTaxV + dtV + absentDeduct + customDed)}</td>
                        </tr>
                      </>);
                    })()}
                    <tr className="fw-bold" style={{ borderTop: '2px solid #000' }}>
                      <td className="py-2 ps-2">NET SALARY</td>
                      <td className="text-end fw-bold text-success py-2 pe-2">
                        {formatCurrency(selectedSlipAmounts.netSalary)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Calculation */}
              <div className="bg-light p-2 mb-3 rounded small">
                <strong>Calculation:</strong> Basic Salary (₹{formatCurrency(selectedSlipAmounts.basicSalary)})
                {selectedSlipAmounts.unpaidDeduction > 0 && (
                  <span className="text-danger"> - Absent Deduction (₹{formatCurrency(selectedSlipAmounts.unpaidDeduction)})</span>
                )}
                {selectedSlipAmounts.overtimeAmount > 0 && (
                  <span className="text-success"> + Overtime (₹{formatCurrency(selectedSlipAmounts.overtimeAmount)})</span>
                )}
                <span> - DT (₹{formatCurrency(selectedSlipAmounts.deduction)}) = Net Salary (₹{formatCurrency(selectedSlipAmounts.netSalary)})</span>
              </div>

              {/* Amount in Words */}
              <div className="small mb-4">
                <strong>Amount in Words:</strong> Rupees {numberToWords(Math.round(selectedSlipAmounts.netSalary))} Only
              </div>

              {/* Gross Salary */}
              <div className="small mb-3 p-2 bg-light rounded">
                <strong>Gross Salary (CTC):</strong> <span className="text-primary fw-bold">₹{formatCurrency(employee?.gross_salary || employee?.salary)}</span>
              </div>

              {/* Footer */}
              <div className="d-flex justify-content-between align-items-center mt-3">
                <div className="small">For B2BinDemand</div>
                <div className="small">Authorized Signatory</div>
              </div>

              {/* Generated Date */}
              <div className="text-end mt-2 small text-muted">
                Generated on: {new Date().toLocaleString()}
              </div>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer className="py-2">
          <Button variant="secondary" size="sm" onClick={() => setShowSlipModal(false)}>
            <FaTimes className="me-1" size={10} /> Close
          </Button>
          <Button variant="primary" size="sm" onClick={handlePrint}>
            <FaPrint className="me-1" size={10} /> Print
          </Button>
          <Button variant="success" size="sm" onClick={() => handleDownloadPDF(selectedSlip)}>
            <FaDownload className="me-1" size={10} /> Download
          </Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
};

export default SalarySlip;