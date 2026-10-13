import PaginatedTable from '../Common/PaginatedTable';
// src/components/Admin/LeaveReports.jsx
import React, { useState, useEffect } from 'react';
import {
  Card, Table, Badge, Form, Row, Col, Button,
  Spinner, Alert, ProgressBar, Modal, InputGroup
} from 'react-bootstrap';
import {
  FaCalendarAlt, FaDownload, FaPrint, FaEye,
  FaSearch, FaFilter, FaChartPie, FaFileExcel,
  FaTimes, FaCheck, FaExclamationTriangle,
  FaSortNumericDown, FaArrowLeft
} from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';
import * as XLSX from 'xlsx';

const LeaveReports = () => {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState([]);
  const [filteredEmployees, setFilteredEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [sortBy, setSortBy] = useState('name');
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    fetchData();
  }, []);

  // Apply filters whenever searchTerm, departmentFilter, sortBy, or employees change
  useEffect(() => {
    applyFilters();
  }, [searchTerm, departmentFilter, sortBy, employees]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setMessage({ type: '', text: '' });

      console.log('Fetching employees data...');

      // Fetch employees
      const employeesRes = await axios.get(API_ENDPOINTS.EMPLOYEES);
      const employees = employeesRes.data;

      console.log(`Fetched ${employees.length} employees`);

      // Fetch leave balances for all employees
      const balancesPromises = employees.map(async (emp) => {
        try {
          const balanceRes = await axios.get(API_ENDPOINTS.LEAVE_BALANCE(emp.employee_id));
          
          // Parse the response data
          const rawBalance = balanceRes.data;
          
          // Calculate derived values
          const totalAccrued = parseFloat(rawBalance.total_accrued) || 0;
          const used = parseFloat(rawBalance.used) || 0;
          const pendingApproval = parseFloat(rawBalance.pending) || 0;
          
          // PENDING = TOTAL ACCRUED - USED (leaves that are either available or pending approval)
          const calculatedPending = totalAccrued - used;
          
          // AVAILABLE = TOTAL ACCRUED - USED - PENDING_APPROVAL
          const available = totalAccrued - used - pendingApproval;
          
          console.log(`📊 Employee ${emp.employee_id}:`, {
            totalAccrued,
            used,
            pendingApproval,
            calculatedPending,
            available,
            formula: `${totalAccrued} - ${used} = ${calculatedPending}`
          });
          
          return {
            ...emp,
            leaveBalance: {
              total_accrued: totalAccrued.toFixed(1),
              used: used.toFixed(1),
              pending_approval: pendingApproval.toFixed(1), // Original pending approval
              pending: calculatedPending.toFixed(1), // Calculated pending (Total - Used)
              available: available.toFixed(1),
              // For backward compatibility
              original_pending: rawBalance.pending || '0'
            }
          };
        } catch (error) {
          console.error(`Error fetching balance for ${emp.employee_id}:`, error);
          return {
            ...emp,
            leaveBalance: {
              total_accrued: '0',
              used: '0',
              pending_approval: '0',
              pending: '0',
              available: '0'
            }
          };
        }
      });

      const employeesWithBalance = await Promise.all(balancesPromises);
      console.log('Employees with balance:', employeesWithBalance);

      setEmployees(employeesWithBalance);
      setFilteredEmployees(employeesWithBalance);

    } catch (error) {
      console.error('Error fetching data:', error);
      setMessage({
        type: 'danger',
        text: error.response?.data?.message || 'Failed to load employee data. Please try again.'
      });
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    console.log('Applying filters - Search Term:', searchTerm, 'Department:', departmentFilter, 'Sort:', sortBy);

    let filtered = [...employees];

    // Apply search filter
    if (searchTerm && searchTerm.trim() !== '') {
      const term = searchTerm.toLowerCase().trim();
      filtered = filtered.filter(emp => {
        const fullName = `${emp.first_name || ''} ${emp.last_name || ''}`.toLowerCase();
        const employeeId = (emp.employee_id || '').toLowerCase();
        const department = (emp.department || '').toLowerCase();
        const designation = (emp.designation || '').toLowerCase();

        return fullName.includes(term) ||
          employeeId.includes(term) ||
          department.includes(term) ||
          designation.includes(term);
      });
      console.log(`Search filter applied: ${filtered.length} results`);
    }

    // Apply department filter
    if (departmentFilter !== 'all') {
      filtered = filtered.filter(emp => emp.department === departmentFilter);
      console.log(`Department filter applied: ${filtered.length} results`);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      const aBalance = a.leaveBalance || { pending: 0, used: 0, total_accrued: 0 };
      const bBalance = b.leaveBalance || { pending: 0, used: 0, total_accrued: 0 };
      
      if (sortBy === 'name') {
        const nameA = `${a.first_name || ''} ${a.last_name || ''}`.toLowerCase();
        const nameB = `${b.first_name || ''} ${b.last_name || ''}`.toLowerCase();
        return nameA.localeCompare(nameB);
      } else if (sortBy === 'balance-asc') {
        return (parseFloat(aBalance.pending) || 0) - (parseFloat(bBalance.pending) || 0);
      } else if (sortBy === 'balance-desc') {
        return (parseFloat(bBalance.pending) || 0) - (parseFloat(aBalance.pending) || 0);
      } else if (sortBy === 'used') {
        return (parseFloat(bBalance.used) || 0) - (parseFloat(aBalance.used) || 0);
      }
      return 0;
    });

    setFilteredEmployees(filtered);
  };

  const clearSearch = () => {
    setSearchTerm('');
    setDepartmentFilter('all');
    setSortBy('name');
  };

  const departments = ['all', ...new Set(employees.map(emp => emp.department).filter(Boolean))];

  const handleExportExcel = () => {
    try {
      const data = filteredEmployees.map((emp, index) => {
        const balance = emp.leaveBalance || {};
        const totalAccrued = parseFloat(balance.total_accrued) || 0;
        const used = parseFloat(balance.used) || 0;
        const pending = parseFloat(balance.pending) || 0; // Calculated pending (Total - Used)
        const pendingApproval = parseFloat(balance.pending_approval) || 0;
        const available = parseFloat(balance.available) || 0;
        
        return {
          'Sr No': index + 1,
          'Employee ID': emp.employee_id,
          'Name': `${emp.first_name || ''} ${emp.last_name || ''}`.trim(),
          'Department': emp.department || 'N/A',
          'Designation': emp.designation || 'N/A',
          'Total Accrued': totalAccrued.toFixed(1),
          'Used (Approved)': used.toFixed(1),
          'Pending (Total - Used)': pending.toFixed(1),
          'Pending Approval': pendingApproval.toFixed(1),
          'Available': available.toFixed(1)
        };
      });

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Leave Balances');
      XLSX.writeFile(wb, `Leave_Balances_${new Date().toISOString().split('T')[0]}.xlsx`);

      setMessage({
        type: 'success',
        text: 'Excel file downloaded successfully!'
      });

      setTimeout(() => setMessage({ type: '', text: '' }), 3000);

    } catch (error) {
      console.error('Error exporting to Excel:', error);
      setMessage({
        type: 'danger',
        text: 'Failed to export data. Please try again.'
      });
    }
  };

  const getBalanceColor = (balance) => {
    const bal = parseFloat(balance);
    if (bal <= 0) return 'danger';
    if (bal < 3) return 'warning';
    if (bal < 6) return 'info';
    return 'success';
  };

  const getPendingColor = (pending) => {
    const pend = parseFloat(pending);
    if (pend > 5) return 'success';
    if (pend > 2) return 'warning';
    if (pend > 0) return 'info';
    return 'secondary';
  };

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center vh-100">
        <div className="text-center">
          <Spinner animation="border" variant="primary" style={{ width: '3rem', height: '3rem' }} />
          <p className="mt-3 text-muted small">Loading leave reports...</p>
        </div>
      </div>
    );
  }

  // Calculate statistics
  const totalLeaves = filteredEmployees.reduce((sum, emp) =>
    sum + (parseFloat(emp.leaveBalance?.available) || 0), 0
  );
  
  const totalPending = filteredEmployees.reduce((sum, emp) => 
    sum + (parseFloat(emp.leaveBalance?.pending) || 0), 0
  );
  
  const avgLeaves = filteredEmployees.length > 0 ? (totalLeaves / filteredEmployees.length).toFixed(1) : 0;
  
  const zeroBalance = filteredEmployees.filter(emp => parseFloat(emp.leaveBalance?.available) <= 0).length;
  const lowBalance = filteredEmployees.filter(emp => {
    const bal = parseFloat(emp.leaveBalance?.available);
    return bal > 0 && bal < 3;
  }).length;
  const healthyBalance = filteredEmployees.filter(emp => parseFloat(emp.leaveBalance?.available) >= 3).length;
  
  const employeesWithPending = filteredEmployees.filter(emp => parseFloat(emp.leaveBalance?.pending) > 0).length;

  return (
    <div className="p-4">
      <div className="d-flex align-items-center justify-content-between mb-4">
        <h5 className="mb-0 h4">
          <FaChartPie className="me-2 text-dark" />
          Leave Reports
        </h5>
        <button
          className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1"
          onClick={() => navigate(-1)}
        >
          <FaArrowLeft size={12} /> Back
        </button>
      </div>

      {/* Message Alert */}
      {message.text && (
        <Alert
          variant={message.type}
          onClose={() => setMessage({ type: '', text: '' })}
          dismissible
          className="mb-4 shadow-sm"
        >
          {message.type === 'success' && <FaCheck className="me-2" size={14} />}
          {message.type === 'danger' && <FaExclamationTriangle className="me-2" size={14} />}
          {message.text}
        </Alert>
      )}

      {/* Filters */}
      <Card className="mb-4 shadow-sm border-0">
        <Card.Body className="p-3">
          <Row className="g-3">
            <Col md={5}>
              <InputGroup size="sm">
                <InputGroup.Text className="bg-light border-0">
                  <FaSearch size={12} className="text-muted" />
                </InputGroup.Text>
                <Form.Control
                  type="text"
                  placeholder="Search by name, ID, department, designation..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="border-0 bg-light"
                />
                {searchTerm && (
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    onClick={() => setSearchTerm('')}
                    className="border-0"
                  >
                    <FaTimes size={12} />
                  </Button>
                )}
              </InputGroup>
            </Col>

            <Col md={3}>
              <Form.Select
                size="sm"
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className="bg-light border-0"
              >
                <option value="all">All Departments</option>
                {departments.filter(d => d !== 'all').map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </Form.Select>
            </Col>

            <Col md={2}>
              <Form.Select
                size="sm"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="bg-light border-0"
              >
                <option value="name">Name</option>
                <option value="balance-desc">Highest Pending</option>
                <option value="balance-asc">Lowest Pending</option>
                <option value="used">Most Used</option>
              </Form.Select>
            </Col>

            <Col md={2} className="d-flex align-items-end">
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={clearSearch}
                className="w-100"
                disabled={!searchTerm && departmentFilter === 'all' && sortBy === 'name'}
              >
                Clear Filters
              </Button>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      {/* Employees Table */}
      <Card className="shadow-sm border-0">
        <Card.Header className="bg-white py-3 d-flex justify-content-between align-items-center border-0">
          <h5 className="mb-0 medium fw-semibold">
            <FaChartPie className="me-2 text-dark" size={20} />
            Employee Leave Balances
          </h5>
          <div className="d-flex gap-2">
            <Badge bg="secondary" className="px-3 py-2">
              Total: {filteredEmployees.length} Employees
            </Badge>
            <Button
              variant="success"
              size="sm"
              onClick={handleExportExcel}
              disabled={filteredEmployees.length === 0}
            >
              <FaFileExcel className="me-1" size={12} />
              Export Excel
            </Button>
          </div>
        </Card.Header>
        <Card.Body className="p-0">
          {/* Table with Vertical Scroll - maxHeight 200px */}
          <div
            className="table-responsive"
            style={{ maxHeight: "400px", overflowY: "auto" }}
          >
            <PaginatedTable as={Table} hover className="mb-0" style={{ tableLayout: 'fixed' }}>

              {/* Header - with fixed column widths and nowrap text */}
              <thead className="bg-light sticky-top" style={{ top: 0, zIndex: 10 }}>
                <tr>
                  <th className="small text-dark fw-normal text-center" style={{ width: '60px' }}>
                    Sr No
                  </th>
                  <th className="small text-dark fw-normal text-nowrap" style={{ width: '180px' }}>
                    Employee
                  </th>
                  <th className="small text-dark fw-normal text-nowrap" style={{ width: '120px' }}>
                    Department
                  </th>
                  <th className="small text-dark fw-normal text-nowrap" style={{ width: '150px' }}>
                    Designation
                  </th>
                  <th className="small text-dark fw-normal text-nowrap" style={{ width: '100px' }}>
                    Total Accrued
                  </th>
                  <th className="small text-dark fw-normal text-nowrap" style={{ width: '70px' }}>
                    Used
                  </th>
                  <th className="small text-dark fw-normal text-nowrap" style={{ width: '80px' }}>
                    Pending
                  </th>
                  <th className="small text-dark fw-normal text-nowrap" style={{ width: '80px' }}>
                    Available
                  </th>
                  <th className="small text-dark fw-normal text-nowrap" style={{ width: '70px' }}>
                    Action
                  </th>
                </tr>
              </thead>

              {/* Body - ALL CONTENT LEFT ALIGNED */}
              <tbody>
                {filteredEmployees.length > 0 ? (
                  filteredEmployees.map((emp, index) => {
                    const balance = emp.leaveBalance || {};
                    const totalAccrued = parseFloat(balance.total_accrued) || 0;
                    const used = parseFloat(balance.used) || 0;
                    const pending = parseFloat(balance.pending) || 0; // This is Total - Used
                    const available = parseFloat(balance.available) || 0;
                    const pendingApproval = parseFloat(balance.pending_approval) || 0;

                    return (
                      <tr key={emp.id}>
                        {/* Sr No - Left aligned */}
                        <td className="text-center small">
                          {index + 1}
                        </td>

                        {/* Employee - Left aligned */}
                        <td className="text-start small">
                          <div>
                            <div className="fw-normal text-truncate" 
                                style={{ maxWidth: '160px' }}
                                title={`${emp.first_name} ${emp.last_name}`}>
                              {emp.first_name} {emp.last_name}
                            </div>
                            <small className="text-muted text-truncate d-block" 
                                  style={{ maxWidth: '160px' }}
                                  title={emp.employee_id}>
                              {emp.employee_id}
                            </small>
                          </div>
                        </td>

                        {/* Department - Left aligned */}
                        <td className="text-start small">
                          <span className="text-truncate d-inline-block"
                                style={{ maxWidth: '110px' }}
                                title={emp.department}>
                            {emp.department}
                          </span>
                        </td>

                        {/* Designation - Left aligned with extra width */}
                        <td className="text-start small">
                          <span className="text-truncate d-inline-block" 
                                style={{ maxWidth: '140px' }}
                                title={emp.designation}>
                            {emp.designation}
                          </span>
                        </td>

                        {/* Total Accrued - Left aligned */}
                        <td className="text-start small fw-bold">
                          {totalAccrued.toFixed(1)}
                        </td>

                        {/* Used - Left aligned */}
                        <td className="text-start text-danger small">
                          {used.toFixed(1)}
                          {used > 0 && <small className="text-muted ms-1">✔</small>}
                        </td>

                        {/* PENDING - Total - Used (Left aligned) */}
                        <td className="text-start small">
                          {pending > 0 ? (
                            <Badge bg="warning" pill>
                              {pending.toFixed(1)}
                              {pendingApproval > 0 && (
                                <small className="ms-1 text-white-50" title="Includes pending approval">
                                  *
                                </small>
                              )}
                            </Badge>
                          ) : (
                            <Badge bg="secondary" pill>
                              0
                            </Badge>
                          )}
                          {pendingApproval > 0 && pendingApproval != pending && (
                            <small className="text-muted ms-1" title={`${pendingApproval} pending approval`}>
                              ({pendingApproval.toFixed(1)} pending)
                            </small>
                          )}
                        </td>

                        {/* Available - Left aligned */}
                        <td className="text-start small">
                          <Badge bg={getBalanceColor(available)} pill>
                            {available.toFixed(1)}
                          </Badge>
                        </td>

                        {/* Action - Left aligned */}
                        <td className="text-start small">
                          <FaEye
                            size={16}
                            className="text-primary"
                            style={{ cursor: "pointer" }}
                            title="View Details"
                            onClick={() => {
                              setSelectedEmployee(emp);
                              setShowModal(true);
                            }}
                          />
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="9" className="text-center py-5">
                      <FaSearch
                        size={40}
                        className="text-muted mb-3 opacity-50"
                      />
                      <h6 className="text-muted">No employees found</h6>
                      <p className="text-muted mb-0">
                        Try adjusting your search or filters
                      </p>
                      <Button
                        variant="link"
                        size="sm"
                        onClick={clearSearch}
                        className="mt-2"
                      >
                        Clear all filters
                      </Button>
                    </td>
                  </tr>
                )}
              </tbody>
            </PaginatedTable>
          </div>

          {/* Summary Footer */}
          {filteredEmployees.length > 0 && (
            <div className="p-3 bg-light border-top">
              <Row className="text-center">
                <Col md={2}>
                  <span className="text-muted small">Total Employees:</span>
                  <strong className="ms-2 small">{filteredEmployees.length}</strong>
                </Col>

                <Col md={2}>
                  <span className="text-muted small">Total Accrued:</span>
                  <strong className="ms-2 small">
                    {filteredEmployees.reduce((sum, emp) => 
                      sum + (parseFloat(emp.leaveBalance?.total_accrued) || 0), 0
                    ).toFixed(1)}
                  </strong>
                </Col>

                <Col md={2}>
                  <span className="text-muted small">Total Used:</span>
                  <strong className="ms-2 small text-danger">
                    {filteredEmployees.reduce((sum, emp) => 
                      sum + (parseFloat(emp.leaveBalance?.used) || 0), 0
                    ).toFixed(1)}
                  </strong>
                </Col>

                <Col md={2}>
                  <span className="text-muted small">Total Pending:</span>
                  <strong className="ms-2 small text-warning">
                    {filteredEmployees.reduce((sum, emp) => 
                      sum + (parseFloat(emp.leaveBalance?.pending) || 0), 0
                    ).toFixed(1)}
                  </strong>
                </Col>

                <Col md={2}>
                  <span className="text-muted small">Avg. Pending:</span>
                  <strong className="ms-2 small">
                    {(totalPending / filteredEmployees.length).toFixed(1)}
                  </strong>
                </Col>

                <Col md={2}>
                  <span className="text-muted small">Zero Balance:</span>
                  <strong className="ms-2 small text-danger">
                    {zeroBalance}
                  </strong>
                </Col>
              </Row>
            </div>
          )}
        </Card.Body>
      </Card>

      {/* Employee Details Modal */}
      <Modal show={showModal} onHide={() => setShowModal(false)} size="lg" centered>
        <Modal.Header closeButton className="bg-primary text-white py-2">
          <Modal.Title as="h6" className="mb-0 fw-semibold">
            <FaEye className="me-2" size={14} />
            Employee Leave Details
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="p-3">
          {selectedEmployee && (
            <div className="small">
              <Row>
                <Col md={6}>
                  <Card className="border-0 bg-light mb-3">
                    <Card.Body className="p-3">
                      <h6 className="text-primary mb-3 small fw-semibold">Personal Information</h6>
                      <p className="mb-2"><strong>Name:</strong> {selectedEmployee.first_name} {selectedEmployee.last_name}</p>
                      <p className="mb-2"><strong>Employee ID:</strong> {selectedEmployee.employee_id}</p>
                      <p className="mb-2"><strong>Department:</strong> {selectedEmployee.department}</p>
                      <p className="mb-0"><strong>Designation:</strong> {selectedEmployee.designation}</p>
                    </Card.Body>
                  </Card>
                </Col>
                <Col md={6}>
                  <Card className="border-0 bg-light mb-3">
                    <Card.Body className="p-3">
                      <h6 className="text-primary mb-3 small fw-semibold">Leave Balance</h6>
                      <p className="mb-2"><strong>Total Accrued:</strong> {selectedEmployee.leaveBalance?.total_accrued}</p>
                      <p className="mb-2"><strong>Used (Approved):</strong> <span className="text-danger">{selectedEmployee.leaveBalance?.used}</span></p>
                      <p className="mb-2"><strong>Pending (Total - Used):</strong> <span className="text-warning">{selectedEmployee.leaveBalance?.pending}</span></p>
                      <p className="mb-2"><strong>Pending Approval:</strong> {selectedEmployee.leaveBalance?.pending_approval || '0'}</p>
                      <p className="mb-0">
                        <strong>Available:</strong>{' '}
                        <Badge bg={getBalanceColor(selectedEmployee.leaveBalance?.available)} pill>
                          {selectedEmployee.leaveBalance?.available}
                        </Badge>
                      </p>
                    </Card.Body>
                  </Card>
                </Col>
              </Row>

              <Card className="border-0 bg-light">
                <Card.Body className="p-3">
                  <h6 className="text-primary mb-3 small fw-semibold">Additional Information</h6>
                  <Row>
                    <Col md={6}>
                      <p className="mb-2"><strong>Joining Date:</strong> {selectedEmployee.joining_date ? new Date(selectedEmployee.joining_date).toLocaleDateString() : 'N/A'}</p>
                      <p className="mb-2"><strong>Employment Type:</strong> {selectedEmployee.employment_type || 'N/A'}</p>
                    </Col>
                    <Col md={6}>
                      <p className="mb-2"><strong>Shift Timing:</strong> {selectedEmployee.shift_timing || 'N/A'}</p>
                      <p className="mb-0"><strong>Reporting Manager:</strong> {selectedEmployee.reporting_manager || 'N/A'}</p>
                    </Col>
                  </Row>
                </Card.Body>
              </Card>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer className="py-2">
          <Button variant="secondary" size="sm" onClick={() => setShowModal(false)}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default LeaveReports;