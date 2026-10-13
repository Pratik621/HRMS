import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaFileInvoiceDollar, FaReceipt } from 'react-icons/fa';
import SalarySlip from './SalarySlip';
import EmployeeDeductions from './EmployeeDeductions';
import './Payroll.css';

export default function Payroll() {
  const location = useLocation();
  const navigate = useNavigate();
  const deductionsActive = location.pathname === '/employee/deductions';
  return (
    <div className="payroll-page p-3 p-md-4">
      <header className="payroll-header">
        <div><span className="payroll-eyebrow">EMPLOYEE WORKSPACE</span><h1>Payroll</h1><p>Your salary slips and deduction details in one place.</p></div>
        <button className="payroll-back" type="button" onClick={() => navigate(-1)}><FaArrowLeft size={12} /> Back</button>
      </header>
      <nav className="payroll-tabs" aria-label="Payroll sections">
        <button type="button" aria-current={!deductionsActive ? 'page' : undefined} aria-controls="payroll-content" onClick={() => navigate('/salary-slip')}><FaFileInvoiceDollar aria-hidden="true" />Salary Slip</button>
        <button type="button" aria-current={deductionsActive ? 'page' : undefined} aria-controls="payroll-content" onClick={() => navigate('/employee/deductions')}><FaReceipt aria-hidden="true" />Deductions</button>
      </nav>
      <div className="payroll-section-heading"><h2>{deductionsActive ? 'Deductions' : 'Salary Slip'}</h2><p>{deductionsActive ? 'Review amounts deducted from your salary and the reasons for each entry.' : 'Generate, preview, and download your salary slips for completed pay cycles.'}</p></div>
      <div id="payroll-content">{deductionsActive ? <EmployeeDeductions embedded /> : <SalarySlip embedded />}</div>
    </div>
  );
}
