// components/Admin/AddEmployee.jsx
import React, { useState, useEffect } from 'react';
import { Form, Button, Card, Row, Col, Alert, Spinner, Tab, Nav, ProgressBar } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import {
  FaSave,
  FaTimes,
  FaUpload,
  FaUserPlus,
  FaFileAlt,
  FaFilePdf,
  FaFileWord,
  FaFileImage,
  FaCalculator,
  FaFileSignature,
  FaCheckSquare,
  FaArrowRight,
  FaArrowLeft,
  FaCheckCircle,
  FaInfoCircle  // ← ADD THIS MISSING IMPORT
} from 'react-icons/fa';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';
import { EMPLOYEE_POLICY_HANDBOOK as DEFAULT_CONTRACT_POLICY } from '../../data/employeePolicyHandbook';

const AddEmployee = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showNotification } = useNotification();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [activeTab, setActiveTab] = useState('personal');
  const [acceptPolicy, setAcceptPolicy] = useState(false);
  const [debugInfo, setDebugInfo] = useState(null);
  const [employeeId, setEmployeeId] = useState('');
  const [managers, setManagers] = useState([]);
  const [hrEmployees, setHrEmployees] = useState([]);

  // Track completed tabs
  const [completedTabs, setCompletedTabs] = useState({
    personal: false,
    bank: false,
    salary: false,
    policy: false,
    documents: false
  });

  // Temporary storage for each tab's data
  const [tempPersonalData, setTempPersonalData] = useState({
    first_name: '',
    middle_name: '',
    last_name: '',
    email: '',
    password: '',
    joining_date: '',
    designation: '',
    department: '',
    reporting_manager: '',
    phone: '',
    pan_number: '',
    aadhar_number: '',
    dob: '',
    address: '',
    blood_group: '',
    emergency_contact: '',
    linkedin_url: '',
    employment_type: 'Full Time',
    shift_timing: '9:00 AM - 6:00 PM'
  });

  const [tempBankData, setTempBankData] = useState({
    bank_account_name: '',
    account_number: '',
    ifsc_code: '',
    branch_name: ''
  });

  const [tempSalaryData, setTempSalaryData] = useState({
    gross_salary: '',
    // PF defaults to the same statutory default used across payroll (Payroll > PF/PT tab,
    // salaryController.js) when left blank — pre-filled so the in-hand preview is accurate
    // from the start.
    pf_amount: '1800',
    professional_tax_amount: '0',
    in_hand_salary: ''
  });

  const [tempPolicyData, setTempPolicyData] = useState({
    contract_policy: ''
  });

  // Document upload states
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [selectedDocTypes, setSelectedDocTypes] = useState([]);

  const documentTypes = [
    { value: 'appointment_letter', label: 'Appointment Letter', icon: <FaFileWord className="text-info" /> },
    { value: 'offer_letter', label: 'Offer Letter', icon: <FaFilePdf className="text-danger" /> },
    { value: 'contract_document', label: 'Contract Document', icon: <FaFileAlt className="text-secondary" /> },
    { value: 'aadhar_card', label: 'Aadhar Card', icon: <FaFileImage className="text-primary" /> },
    { value: 'pan_card', label: 'PAN Card', icon: <FaFileImage className="text-warning" /> },
    { value: 'bank_proof', label: 'Bank Proof', icon: <FaFileAlt className="text-info" /> },
    { value: 'education_certificates', label: 'Education Certificates', icon: <FaFileAlt className="text-success" /> },
    { value: 'experience_certificates', label: 'Experience Certificates', icon: <FaFileAlt className="text-secondary" /> }
  ];

  const departments = ['HR', 'IT', 'Admin', 'Finance', 'Marketing', 'Sales', 'Operations', 'Administration', 'Legal', 'Design', 'Support', 'Product'];
  const employmentTypes = ['Full Time', 'Part Time', 'Freelancer', 'Contract Based', 'Intern', 'Probation'];
  const bloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

  // Set default contract policy when checkbox is checked
  useEffect(() => {
    if (acceptPolicy) {
      setTempPolicyData({ contract_policy: DEFAULT_CONTRACT_POLICY });
    } else {
      setTempPolicyData({ contract_policy: '' });
    }
  }, [acceptPolicy]);

  useEffect(() => {
    const fetchManagers = async () => {
      try {
        const [tlRes, hrRes] = await Promise.all([
          axios.get(API_ENDPOINTS.TEAMS_MANAGERS_LIST),
          axios.get(API_ENDPOINTS.TEAMS_HR_LIST),
        ]);
        setManagers(tlRes.data.managers || []);
        setHrEmployees(hrRes.data.managers || []);
      } catch (err) {
        console.error('Error fetching managers:', err);
      }
    };
    fetchManagers();
  }, []);

  // Calculate in-hand salary whenever gross salary, PF, or Professional Tax changes
  useEffect(() => {
    if (tempSalaryData.gross_salary) {
      const gross = parseFloat(tempSalaryData.gross_salary);
      if (!isNaN(gross) && gross > 0) {
        const pf = parseFloat(tempSalaryData.pf_amount) || 0;
        const pt = parseFloat(tempSalaryData.professional_tax_amount) || 0;
        const inHand = Math.max(0, gross - pf - pt);
        setTempSalaryData(prev => ({
          ...prev,
          in_hand_salary: inHand.toString()
        }));
      }
    }
  }, [tempSalaryData.gross_salary, tempSalaryData.pf_amount, tempSalaryData.professional_tax_amount]);

  // Handle input changes for personal tab
  const handlePersonalChange = (e) => {
    const { name, value } = e.target;
    setTempPersonalData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Handle input changes for bank tab
  const handleBankChange = (e) => {
    const { name, value } = e.target;
    setTempBankData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Handle input changes for salary tab
  const handleSalaryChange = (e) => {
    const { name, value } = e.target;
    setTempSalaryData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Validate personal tab - UPDATED with only required fields
  const validatePersonalTab = () => {
    if (!tempPersonalData.first_name) return "First name is required";
    if (!tempPersonalData.last_name) return "Last name is required";
    if (!tempPersonalData.email) return "Email is required";
    if (!tempPersonalData.password) return "Initial password is required";
    if (tempPersonalData.password.length < 6) return "Password must be at least 6 characters";
    if (!tempPersonalData.joining_date) return "Joining date is required";
    if (!tempPersonalData.designation) return "Designation is required";
    if (!tempPersonalData.department) return "Department is required";
    if (!tempPersonalData.reporting_manager) return "Reporting manager is required";
    if (!tempPersonalData.phone) return "Contact number is required";
    if (!/^\d{10}$/.test(tempPersonalData.phone)) return "Contact number must be 10 digits";
    if (!tempPersonalData.dob) return "Date of birth is required";
    if (!tempPersonalData.blood_group) return "Blood group is required";
    if (!tempPersonalData.emergency_contact) return "Emergency contact number is required";
    if (!/^\d{10}$/.test(tempPersonalData.emergency_contact)) return "Emergency contact must be 10 digits";
    if (!tempPersonalData.address?.trim()) return "Address is required";

    // Optional validations - only check format if provided
    if (tempPersonalData.pan_number && tempPersonalData.pan_number.length !== 10) {
      return "PAN number must be 10 characters";
    }
    if (tempPersonalData.aadhar_number && !/^\d{12}$/.test(tempPersonalData.aadhar_number)) {
      return "Aadhar number must be 12 digits";
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(tempPersonalData.email)) {
      return "Please enter a valid email address";
    }

    return null;
  };

  // Validate bank tab - MADE OPTIONAL
  const validateBankTab = () => {
    // No validation required - bank details are optional
    return null;
  };

  // Validate salary tab
  const validateSalaryTab = () => {
    if (!tempSalaryData.gross_salary) return "Gross salary is required";
    const gross = parseFloat(tempSalaryData.gross_salary);
    if (gross <= 200) {
      return "Gross salary must be greater than ₹200";
    }
    return null;
  };

  // Save current tab data
  const saveCurrentTab = () => {
    let validationError = null;

    switch (activeTab) {
      case 'personal':
        validationError = validatePersonalTab();
        if (!validationError) {
          setCompletedTabs(prev => ({ ...prev, personal: true }));
          showNotification('Personal information saved!', 'success');
        }
        break;

      case 'bank':
        validationError = validateBankTab();
        if (!validationError) {
          setCompletedTabs(prev => ({ ...prev, bank: true }));
          showNotification('Bank details saved!', 'success');
        }
        break;

      case 'salary':
        validationError = validateSalaryTab();
        if (!validationError) {
          setCompletedTabs(prev => ({ ...prev, salary: true }));
          showNotification('Salary information saved!', 'success');
        }
        break;

      case 'policy':
        if (!acceptPolicy) {
          validationError = "You must accept the contract policy";
        } else {
          setCompletedTabs(prev => ({ ...prev, policy: true }));
          showNotification('Policy accepted!', 'success');
        }
        break;

      default:
        break;
    }

    if (validationError) {
      setError(validationError);
      showNotification(validationError, 'danger');
      return false;
    }
    return true;
  };

  // Handle tab change - ALLOW moving without completing optional tabs
  const handleTabChange = (tab) => {
    if (activeTab !== tab) {
      // For bank tab, we don't require validation to move forward
      if (activeTab === 'bank') {
        // Mark bank as completed even if empty
        setCompletedTabs(prev => ({ ...prev, bank: true }));
        setActiveTab(tab);
        setError('');
      } else {
        const saved = saveCurrentTab();
        if (saved) {
          setActiveTab(tab);
          setError('');
        }
      }
    }
  };

  // Handle next button - ALLOW skipping optional tabs
  const handleNext = () => {
    const tabs = ['personal', 'bank', 'salary', 'policy', 'documents'];
    const currentIndex = tabs.indexOf(activeTab);
    if (currentIndex < tabs.length - 1) {
      // For bank tab, allow moving without validation
      if (activeTab === 'bank') {
        setCompletedTabs(prev => ({ ...prev, bank: true }));
        setActiveTab(tabs[currentIndex + 1]);
        setError('');
      } else {
        const saved = saveCurrentTab();
        if (saved) {
          setActiveTab(tabs[currentIndex + 1]);
          setError('');
        }
      }
    }
  };

  // Handle previous button
  const handlePrevious = () => {
    const tabs = ['personal', 'bank', 'salary', 'policy', 'documents'];
    const currentIndex = tabs.indexOf(activeTab);
    if (currentIndex > 0) {
      setActiveTab(tabs[currentIndex - 1]);
    }
  };

  // Check if all required tabs are completed
  const isAllTabsCompleted = () => {
    // Bank is optional, so not required for completion
    return completedTabs.personal && completedTabs.salary && completedTabs.policy;
  };

  // Generate employee ID based on joining date - 2-digit sequence
  const generateEmployeeId = async () => {
    if (!tempPersonalData.joining_date) return null;

    const date = new Date(tempPersonalData.joining_date);
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');

    try {
      console.log('🔍 Generating employee ID for joining date:', tempPersonalData.joining_date);

      // Get all employees (active AND inactive) to check existing IDs — a deactivated
      // employee's employee_id is still taken and must never be reissued to someone new.
      const response = await axios.get(API_ENDPOINTS.EMPLOYEES, { params: { active: 'all' } });
      let employees = [];

      if (Array.isArray(response.data)) {
        employees = response.data;
      } else if (response.data && response.data.data && Array.isArray(response.data.data)) {
        employees = response.data.data;
      } else {
        employees = [];
      }

      console.log('📊 Total employees:', employees.length);

      // Filter employees with the same year and month prefix
      const prefix = `B2B${year}${month}`;
      const sameMonthEmployees = employees.filter(emp => {
        return emp.employee_id && emp.employee_id.startsWith(prefix);
      });

      console.log(`📊 Found ${sameMonthEmployees.length} employees with prefix ${prefix}`);

      // Find the highest sequence number (2 digits)
      let maxSeq = 0;
      sameMonthEmployees.forEach(emp => {
        const id = emp.employee_id;
        if (id && id.length >= 9) { // B2BYYMMSS = 9 chars
          const seqStr = id.slice(-2); // Last 2 characters
          const seq = parseInt(seqStr, 10);
          if (!isNaN(seq) && seq > maxSeq) {
            maxSeq = seq;
          }
        }
      });

      console.log('📊 Current max sequence:', maxSeq);

      // Generate new sequence (start from 1 if no employees)
      const newSeq = (maxSeq + 1).toString().padStart(2, '0');

      // Ensure sequence doesn't exceed 99
      if (maxSeq >= 99) {
        throw new Error('Maximum employees for this month reached (99)');
      }

      const newEmployeeId = `${prefix}${newSeq}`;

      console.log('✅ Generated new employee ID:', newEmployeeId);
      return newEmployeeId;

    } catch (error) {
      console.error('❌ Error generating employee ID:', error);

      // Fallback: Use timestamp to ensure uniqueness
      const timestamp = Date.now().toString().slice(-4);
      const fallbackSeq = timestamp.slice(-2);
      const fallbackId = `B2B${year}${month}${fallbackSeq}`;

      console.log('⚠️ Using fallback ID:', fallbackId);
      return fallbackId;
    }
  };

  // Upload documents function
  const uploadDocuments = async (empId) => {
    const validUploads = selectedFiles.reduce((acc, file, index) => {
      if (file && selectedDocTypes[index]) {
        acc.push({
          file,
          type: selectedDocTypes[index]
        });
      }
      return acc;
    }, []);

    if (validUploads.length === 0) return;

    setUploading(true);
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < validUploads.length; i++) {
      const upload = validUploads[i];
      const formData = new FormData();
      formData.append(upload.type, upload.file);

      try {
        setUploadProgress(Math.round(((i + 1) / validUploads.length) * 100));

        const url = API_ENDPOINTS.EMPLOYEE_DOCUMENTS(empId);
        console.log(`📤 Uploading to: ${url}`);
        console.log(`📄 Document type: ${upload.type}, File:`, upload.file.name);

        const response = await axios.post(url, formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        });

        console.log('✅ Upload response:', response.data);
        successCount++;
      } catch (error) {
        console.error(`❌ Error uploading ${upload.type}:`, error);
        failCount++;
      }
    }

    if (successCount > 0) {
      showNotification(`${successCount} document(s) uploaded successfully!`, 'success');
    }
    if (failCount > 0) {
      showNotification(`${failCount} document(s) failed to upload`, 'warning');
    }

    setUploading(false);
    setSelectedFiles([]);
    setSelectedDocTypes([]);
    setUploadProgress(0);
  };

  // Test API connection
  const testApiConnection = async () => {
    try {
      const response = await axios.get(API_ENDPOINTS.HEALTH_CHECK);
      console.log('API Test:', response.data);
      return true;
    } catch (error) {
      console.error('API Test Failed:', error);
      return false;
    }
  };

  // Final submit handler - UPDATED to handle optional fields
  const handleFinalSubmit = async (e) => {
    e.preventDefault();

    // Save current tab first
    const saved = saveCurrentTab();
    if (!saved) return;

    // Validate all required tabs completed
    if (!isAllTabsCompleted()) {
      const errorMsg = "Please complete all required tabs (Personal, Salary, Policy) before submitting";
      setError(errorMsg);
      showNotification(errorMsg, 'danger');
      return;
    }

    setSaving(true);
    setError('');

    try {
      // Test API connection first
      const apiWorks = await testApiConnection();
      if (!apiWorks) {
        throw new Error("Cannot connect to server. Please check if backend is running.");
      }

      // Generate employee ID
      let empId = null;
      let retryCount = 0;
      const maxRetries = 5;

      while (!empId && retryCount < maxRetries) {
        try {
          empId = await generateEmployeeId();
          if (!empId) {
            throw new Error('Failed to generate employee ID');
          }
          retryCount++;
        } catch (err) {
          retryCount++;
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      if (!empId) {
        throw new Error("Could not generate unique employee ID after multiple attempts");
      }

      setEmployeeId(empId);
      console.log('✅ Final Employee ID:', empId);


      const employeeData = {
        first_name: tempPersonalData.first_name?.trim(),
        middle_name: tempPersonalData.middle_name?.trim() || null,
        last_name: tempPersonalData.last_name?.trim(),
        employee_id: empId,
        email: tempPersonalData.email?.trim().toLowerCase(),
        password: tempPersonalData.password,
        joining_date: tempPersonalData.joining_date,
        designation: tempPersonalData.designation?.trim(),
        department: tempPersonalData.department,
        reporting_manager: tempPersonalData.reporting_manager?.trim() || null,
        phone: tempPersonalData.phone?.trim(),
        employment_type: tempPersonalData.employment_type || 'Full Time',
        shift_timing: tempPersonalData.shift_timing?.trim() || '9:00 AM - 6:00 PM',
        in_hand_salary: parseFloat(tempSalaryData.in_hand_salary) || 0,
        gross_salary: parseFloat(tempSalaryData.gross_salary) || 0,
        pf_amount: tempSalaryData.pf_amount !== '' ? parseFloat(tempSalaryData.pf_amount) || 0 : null,
        professional_tax_amount: tempSalaryData.professional_tax_amount !== '' ? parseFloat(tempSalaryData.professional_tax_amount) || 0 : null,
        is_active: true,  // Add this
        can_apply_leave: true,  // Add this to avoid error
        role: 'employee',  // Add this
        // Optional fields
        ...(tempBankData.bank_account_name?.trim() && { bank_account_name: tempBankData.bank_account_name.trim() }),
        ...(tempBankData.account_number?.trim() && { account_number: tempBankData.account_number.trim() }),
        ...(tempBankData.ifsc_code?.trim() && { ifsc_code: tempBankData.ifsc_code.trim().toUpperCase() }),
        ...(tempBankData.branch_name?.trim() && { branch_name: tempBankData.branch_name.trim() }),
        ...(tempPersonalData.pan_number?.trim() && { pan_number: tempPersonalData.pan_number.trim().toUpperCase() }),
        ...(tempPersonalData.aadhar_number?.trim() && { aadhar_number: tempPersonalData.aadhar_number.trim() }),
        ...(tempPersonalData.dob && { dob: tempPersonalData.dob }),
        ...(tempPersonalData.address?.trim() && { address: tempPersonalData.address.trim() }),
        ...(tempPersonalData.blood_group && { blood_group: tempPersonalData.blood_group }),
        ...(tempPersonalData.emergency_contact?.trim() && { emergency_contact: tempPersonalData.emergency_contact.trim() }),
        ...(tempPersonalData.linkedin_url?.trim() && { linkedin_url: tempPersonalData.linkedin_url.trim() }),
        contract_policy: tempPolicyData.contract_policy || null
      };

      console.log('📦 Submitting employee data:', JSON.stringify(employeeData, null, 2));
      setDebugInfo(employeeData);

      // Create employee
      const response = await axios.post(API_ENDPOINTS.EMPLOYEES, employeeData);

      console.log('✅ Employee created:', response.data);

      setSuccess('Employee added successfully!');
      showNotification('Employee added successfully!', 'success');

      // Upload documents if any
      if (selectedFiles.length > 0) {
        await uploadDocuments(empId);
      }

      // Navigate back after delay
      setTimeout(() => {
        navigate('/admin/employees');
      }, 2000);

    } catch (error) {
      console.error('❌ Error adding employee:', error);
      console.error('Error response:', error.response?.data);
      console.error('Error status:', error.response?.status);

      let errorMsg = 'Failed to add employee';

      if (error.response) {
        const errorData = error.response.data;

        if (error.response.status === 400) {
          if (errorData.field) {
            errorMsg = `${errorData.field.replace(/_/g, ' ')} '${errorData.value}' already exists. Please use a different value.`;
          } else if (errorData.message) {
            errorMsg = errorData.message;
          } else {
            errorMsg = 'Please check all fields and try again.';
          }
        } else if (error.response.status === 401 || error.response.status === 403) {
          errorMsg = 'You are not authorized to add employees. Please login again.';
        } else if (error.response.status === 500) {
          errorMsg = 'Server error. Please try again later.';
        } else {
          errorMsg = errorData?.message || `Server error: ${error.response.status}`;
        }
      } else if (error.request) {
        errorMsg = 'No response from server. Please check if backend is running.';
      } else {
        errorMsg = error.message;
      }

      setError(errorMsg);
      showNotification(errorMsg, 'danger');
      setEmployeeId('');
    } finally {
      setSaving(false);
    }
  };

  // Add upload row
  const addUploadRow = () => {
    setSelectedFiles([...selectedFiles, null]);
    setSelectedDocTypes([...selectedDocTypes, '']);
  };

  // Remove upload row
  const removeUploadRow = (index) => {
    const newFiles = [...selectedFiles];
    const newTypes = [...selectedDocTypes];
    newFiles.splice(index, 1);
    newTypes.splice(index, 1);
    setSelectedFiles(newFiles);
    setSelectedDocTypes(newTypes);
  };

  // Handle file selection
  const handleFileSelect = (index, file) => {
    const newFiles = [...selectedFiles];
    newFiles[index] = file;
    setSelectedFiles(newFiles);
  };

  // Handle document type change
  const handleDocumentTypeChange = (index, value) => {
    const newTypes = [...selectedDocTypes];
    newTypes[index] = value;
    setSelectedDocTypes(newTypes);
  };

  return (
    <div className="p-2 p-md-3 p-lg-4">
      {/* Header - Responsive */}
      <div className="d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center mb-4 gap-3">
        <h5 className="mb-0 d-flex align-items-center">
          <FaUserPlus className="me-2 text-primary" size={20} />
          Add New Employee
        </h5>
        <div className="d-flex gap-2 ms-0 ms-sm-auto">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate('/admin/employees')}
          >
            <FaTimes className="me-2" size={12} />
            Cancel
          </Button>
          <button
            className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1"
            onClick={() => navigate(-1)}
          >
            <FaArrowLeft size={12} /> Back
          </button>
        </div>
      </div>

      {/* Progress Indicators - Responsive */}
      <div className="mb-4">
        <Row className="g-1 g-md-2">
          <Col xs={6} sm={4} md={2} className="mb-2">
            <div className={`p-1 p-md-2 rounded text-center small ${completedTabs.personal ? 'bg-success text-white' : 'bg-light'}`}>
              {completedTabs.personal ? <FaCheckCircle className="me-1 d-none d-sm-inline" /> : null}
              <span className="d-inline d-sm-none">1.</span>
              <span className="d-none d-sm-inline">Personal</span>
            </div>
          </Col>
          <Col xs={6} sm={4} md={2} className="mb-2">
            <div className={`p-1 p-md-2 rounded text-center small ${completedTabs.bank ? 'bg-success text-white' : 'bg-light'}`}>
              {completedTabs.bank ? <FaCheckCircle className="me-1 d-none d-sm-inline" /> : null}
              <span className="d-inline d-sm-none">2.</span>
              <span className="d-none d-sm-inline">Bank (Optional)</span>
            </div>
          </Col>
          <Col xs={6} sm={4} md={2} className="mb-2">
            <div className={`p-1 p-md-2 rounded text-center small ${completedTabs.salary ? 'bg-success text-white' : 'bg-light'}`}>
              {completedTabs.salary ? <FaCheckCircle className="me-1 d-none d-sm-inline" /> : null}
              <span className="d-inline d-sm-none">3.</span>
              <span className="d-none d-sm-inline">Salary</span>
            </div>
          </Col>
          <Col xs={6} sm={4} md={2} className="mb-2">
            <div className={`p-1 p-md-2 rounded text-center small ${completedTabs.policy ? 'bg-success text-white' : 'bg-light'}`}>
              {completedTabs.policy ? <FaCheckCircle className="me-1 d-none d-sm-inline" /> : null}
              <span className="d-inline d-sm-none">4.</span>
              <span className="d-none d-sm-inline">Policy</span>
            </div>
          </Col>
          <Col xs={6} sm={4} md={2} className="mb-2">
            <div className="p-1 p-md-2 rounded text-center small bg-light">
              <span className="d-inline d-sm-none">5.</span>
              <span className="d-none d-sm-inline">Documents</span>
            </div>
          </Col>
          <Col xs={6} sm={4} md={2} className="mb-2">
            <div className={`p-1 p-md-2 rounded text-center small ${isAllTabsCompleted() ? 'bg-primary text-white' : 'bg-secondary text-white'}`}>
              <span className="d-inline d-sm-none">✓</span>
              <span className="d-none d-sm-inline">Final Submit</span>
            </div>
          </Col>
        </Row>
      </div>

      {/* Debug Info - Remove in production */}
      {debugInfo && (
        <Alert variant="info" className="mb-3">
          <details>
            <summary className="small">Debug: Data being sent (Click to expand)</summary>
            <pre className="mt-2 small" style={{ maxHeight: '200px', overflow: 'auto' }}>
              {JSON.stringify(debugInfo, null, 2)}
            </pre>
          </details>
        </Alert>
      )}

      {error && (
        <Alert variant="danger" onClose={() => setError('')} dismissible className="mb-3">
          <small>{error}</small>
        </Alert>
      )}

      {success && (
        <Alert variant="success" onClose={() => setSuccess('')} dismissible className="mb-3">
          <small>{success}</small>
        </Alert>
      )}

      <Card className="border-0 shadow-sm">
        <Card.Header className="bg-light py-2">
          <Nav variant="tabs" activeKey={activeTab} onSelect={(k) => handleTabChange(k)} className="flex-nowrap overflow-auto">
            <Nav.Item>
              <Nav.Link eventKey="personal" className="text-dark small px-2 px-md-3">
                Personal {completedTabs.personal && <FaCheckCircle className="ms-1 text-success d-none d-sm-inline" size={10} />}
              </Nav.Link>
            </Nav.Item>
            <Nav.Item>
              <Nav.Link eventKey="bank" className="text-dark small px-2 px-md-3">
                Bank (Optional) {completedTabs.bank && <FaCheckCircle className="ms-1 text-success d-none d-sm-inline" size={10} />}
              </Nav.Link>
            </Nav.Item>
            <Nav.Item>
              <Nav.Link eventKey="salary" className="text-dark small px-2 px-md-3">
                Salary {completedTabs.salary && <FaCheckCircle className="ms-1 text-success d-none d-sm-inline" size={10} />}
              </Nav.Link>
            </Nav.Item>
            <Nav.Item>
              <Nav.Link eventKey="policy" className="text-dark small px-2 px-md-3">
                Policy {completedTabs.policy && <FaCheckCircle className="ms-1 text-success d-none d-sm-inline" size={10} />}
              </Nav.Link>
            </Nav.Item>
            <Nav.Item>
              <Nav.Link eventKey="documents" className="text-dark small px-2 px-md-3">
                Docs
              </Nav.Link>
            </Nav.Item>
          </Nav>
        </Card.Header>
        <Card.Body className="p-2 p-md-3">
          <Form>
            {activeTab === 'personal' && (
              <>
                {/* Required Fields Section */}
                <div className="mb-3 p-2 bg-light rounded">
                  <small className="text-muted fw-semibold">Required Information</small>
                </div>

                <Row className="mb-3">
                  <Col xs={12}>
                    <Form.Group>
                      <Form.Label className="small fw-semibold text-muted">
                        Email Address <span className="text-danger">*</span>
                      </Form.Label>
                      <Form.Control
                        type="email"
                        name="email"
                        value={tempPersonalData.email}
                        onChange={handlePersonalChange}
                        size="sm"
                        placeholder="employee@company.com"
                      />
                    </Form.Group>
                  </Col>
                </Row>

                <Row className="mb-3">
                  <Col xs={12}>
                    <Form.Group>
                      <Form.Label className="small fw-semibold text-muted">
                        Initial Password <span className="text-danger">*</span>
                      </Form.Label>
                      <Form.Control
                        type="password"
                        name="password"
                        value={tempPersonalData.password}
                        onChange={handlePersonalChange}
                        size="sm"
                        placeholder="Set initial login password (min. 6 characters)"
                      />
                    </Form.Group>
                  </Col>
                </Row>

                <Row className="mb-3 g-2">
                  <Col xs={12} md={4}>
                    <Form.Group>
                      <Form.Label className="small fw-semibold text-muted">
                        First Name <span className="text-danger">*</span>
                      </Form.Label>
                      <Form.Control
                        type="text"
                        name="first_name"
                        value={tempPersonalData.first_name}
                        onChange={handlePersonalChange}
                        size="sm"
                      />
                    </Form.Group>
                  </Col>
                  <Col xs={12} md={4}>
                    <Form.Group>
                      <Form.Label className="small fw-semibold text-muted">
                        Middle Name
                      </Form.Label>
                      <Form.Control
                        type="text"
                        name="middle_name"
                        value={tempPersonalData.middle_name}
                        onChange={handlePersonalChange}
                        size="sm"
                      />
                    </Form.Group>
                  </Col>
                  <Col xs={12} md={4}>
                    <Form.Group>
                      <Form.Label className="small fw-semibold text-muted">
                        Last Name <span className="text-danger">*</span>
                      </Form.Label>
                      <Form.Control
                        type="text"
                        name="last_name"
                        value={tempPersonalData.last_name}
                        onChange={handlePersonalChange}
                        size="sm"
                      />
                    </Form.Group>
                  </Col>
                </Row>

                <Row className="mb-3 g-2">
                  <Col xs={12} md={4}>
                    <Form.Group>
                      <Form.Label className="small fw-semibold text-muted">
                        Date of Joining <span className="text-danger">*</span>
                      </Form.Label>
                      <Form.Control
                        type="date"
                        name="joining_date"
                        value={tempPersonalData.joining_date}
                        onChange={handlePersonalChange}
                        size="sm"
                      />
                    </Form.Group>
                  </Col>
                  <Col xs={12} md={4}>
                    <Form.Group>
                      <Form.Label className="small fw-semibold text-muted">
                        Designation <span className="text-danger">*</span>
                      </Form.Label>
                      <Form.Control
                        type="text"
                        name="designation"
                        value={tempPersonalData.designation}
                        onChange={handlePersonalChange}
                        size="sm"
                      />
                    </Form.Group>
                  </Col>
                  <Col xs={12} md={4}>
                    <Form.Group>
                      <Form.Label className="small fw-semibold text-muted">
                        Department <span className="text-danger">*</span>
                      </Form.Label>
                      <Form.Control
                        type="text"
                        name="department"
                        value={tempPersonalData.department}
                        onChange={handlePersonalChange}
                        size="sm"
                        list="department-options-add"
                        placeholder="Select or type department"
                        autoComplete="off"
                      />
                      <datalist id="department-options-add">
                        {departments.map(dept => (
                          <option key={dept} value={dept} />
                        ))}
                      </datalist>
                    </Form.Group>
                  </Col>
                </Row>

                <Row className="mb-3 g-2">
                  <Col xs={12} md={4}>
                    <Form.Group>
                      <Form.Label className="small fw-semibold text-muted">
                        Reporting Manager <span className="text-danger">*</span>
                      </Form.Label>
                      <Form.Select
                        name="reporting_manager"
                        value={tempPersonalData.reporting_manager}
                        onChange={handlePersonalChange}
                        size="sm"
                      >
                        <option value="">-- Select Reporting Manager --</option>
                        {managers.length > 0 && (
                          <optgroup label="Team Leaders">
                            {managers.map(m => {
                              const fullName = `${m.first_name} ${m.last_name}`.trim();
                              return (
                                <option key={m.employee_id} value={fullName}>
                                  {fullName} ({m.designation})
                                </option>
                              );
                            })}
                          </optgroup>
                        )}
                        {hrEmployees.length > 0 && (
                          <optgroup label="HR">
                            {hrEmployees.map(m => {
                              const fullName = `${m.first_name} ${m.last_name}`.trim();
                              return (
                                <option key={m.employee_id} value={fullName}>
                                  {fullName} ({m.designation})
                                </option>
                              );
                            })}
                          </optgroup>
                        )}
                      </Form.Select>
                    </Form.Group>
                  </Col>
                  <Col xs={12} md={4}>
                    <Form.Group>
                      <Form.Label className="small fw-semibold text-muted">
                        Employment Type
                      </Form.Label>
                      <Form.Select
                        name="employment_type"
                        value={tempPersonalData.employment_type}
                        onChange={handlePersonalChange}
                        size="sm"
                      >
                        {employmentTypes.map(type => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </Form.Select>
                    </Form.Group>
                  </Col>
                  <Col xs={12} md={4}>
                    <Form.Group>
                      <Form.Label className="small fw-semibold text-muted">
                        Shift Timing
                      </Form.Label>
                      <Form.Control
                        type="text"
                        name="shift_timing"
                        value={tempPersonalData.shift_timing}
                        onChange={handlePersonalChange}
                        placeholder="e.g., 9:00 AM - 6:00 PM"
                        size="sm"
                      />
                    </Form.Group>
                  </Col>
                </Row>

                <Row className="mb-3 g-2">
                  <Col xs={12} md={4}>
                    <Form.Group>
                      <Form.Label className="small fw-semibold text-muted">
                        Contact Number <span className="text-danger">*</span>
                      </Form.Label>
                      <Form.Control
                        type="tel"
                        name="phone"
                        value={tempPersonalData.phone}
                        onChange={handlePersonalChange}
                        size="sm"
                        maxLength="10"
                        placeholder="10 digit mobile number"
                      />
                    </Form.Group>
                  </Col>
                  <Col xs={12} md={4}>
                    <Form.Group>
                      <Form.Label className="small fw-semibold text-muted">
                        Date of Birth <span className="text-danger">*</span>
                      </Form.Label>
                      <Form.Control
                        type="date"
                        name="dob"
                        value={tempPersonalData.dob}
                        onChange={handlePersonalChange}
                        size="sm"
                      />
                    </Form.Group>
                  </Col>
                  <Col xs={12} md={4}>
                    <Form.Group>
                      <Form.Label className="small fw-semibold text-muted">
                        Blood Group <span className="text-danger">*</span>
                      </Form.Label>
                      <Form.Select
                        name="blood_group"
                        value={tempPersonalData.blood_group}
                        onChange={handlePersonalChange}
                        size="sm"
                      >
                        <option value="">Select Blood Group</option>
                        {bloodGroups.map(bg => (
                          <option key={bg} value={bg}>{bg}</option>
                        ))}
                      </Form.Select>
                    </Form.Group>
                  </Col>
                </Row>

                <Row className="mb-3 g-2">
                  <Col xs={12} md={4}>
                    <Form.Group>
                      <Form.Label className="small fw-semibold text-muted">
                        Emergency Contact Number <span className="text-danger">*</span>
                      </Form.Label>
                      <Form.Control
                        type="tel"
                        name="emergency_contact"
                        value={tempPersonalData.emergency_contact}
                        onChange={handlePersonalChange}
                        size="sm"
                        maxLength="10"
                        placeholder="10 digit mobile number"
                      />
                    </Form.Group>
                  </Col>
                  <Col xs={12} md={8}>
                    <Form.Group>
                      <Form.Label className="small fw-semibold text-muted">
                        Address <span className="text-danger">*</span>
                      </Form.Label>
                      <Form.Control
                        as="textarea"
                        rows={1}
                        name="address"
                        value={tempPersonalData.address}
                        onChange={handlePersonalChange}
                        size="sm"
                        placeholder="Full address"
                      />
                    </Form.Group>
                  </Col>
                </Row>

                {/* Optional Fields Section */}
                <div className="mt-3 mb-2 p-2 bg-light rounded">
                  <small className="text-muted fw-semibold">Optional Information</small>
                </div>

                <Row className="mb-3 g-2">
                  <Col xs={12} md={4}>
                    <Form.Group>
                      <Form.Label className="small fw-semibold text-muted">
                        PAN Number
                      </Form.Label>
                      <Form.Control
                        type="text"
                        name="pan_number"
                        value={tempPersonalData.pan_number}
                        onChange={handlePersonalChange}
                        size="sm"
                        maxLength="10"
                        placeholder="ABCDE1234F (Optional)"
                        style={{ textTransform: 'uppercase' }}
                      />
                    </Form.Group>
                  </Col>
                  <Col xs={12} md={4}>
                    <Form.Group>
                      <Form.Label className="small fw-semibold text-muted">
                        Aadhar Number
                      </Form.Label>
                      <Form.Control
                        type="text"
                        name="aadhar_number"
                        value={tempPersonalData.aadhar_number}
                        onChange={handlePersonalChange}
                        size="sm"
                        maxLength="12"
                        placeholder="123456789012 (Optional)"
                      />
                    </Form.Group>
                  </Col>
                  <Col xs={12} md={4}>
                    <Form.Group>
                      <Form.Label className="small fw-semibold text-muted">
                        LinkedIn Profile URL
                      </Form.Label>
                      <Form.Control
                        type="url"
                        name="linkedin_url"
                        value={tempPersonalData.linkedin_url}
                        onChange={handlePersonalChange}
                        size="sm"
                        placeholder="https://linkedin.com/in/… (Optional)"
                      />
                    </Form.Group>
                  </Col>
                </Row>
              </>
            )}

            {activeTab === 'bank' && (
              <>
                <div className="mb-3 p-2 bg-light rounded">
                  <small className="text-muted fw-semibold">Bank Details (Optional)</small>
                </div>
                <Row className="mb-3 g-2">
                  <Col xs={12} md={6}>
                    <Form.Group>
                      <Form.Label className="small fw-semibold text-muted">
                        Bank Account Name
                      </Form.Label>
                      <Form.Control
                        type="text"
                        name="bank_account_name"
                        value={tempBankData.bank_account_name}
                        onChange={handleBankChange}
                        size="sm"
                        placeholder="Name on bank account (Optional)"
                      />
                    </Form.Group>
                  </Col>
                  <Col xs={12} md={6}>
                    <Form.Group>
                      <Form.Label className="small fw-semibold text-muted">
                        Account Number
                      </Form.Label>
                      <Form.Control
                        type="text"
                        name="account_number"
                        value={tempBankData.account_number}
                        onChange={handleBankChange}
                        size="sm"
                        placeholder="Bank account number (Optional)"
                      />
                    </Form.Group>
                  </Col>
                </Row>

                <Row className="mb-3 g-2">
                  <Col xs={12} md={4}>
                    <Form.Group>
                      <Form.Label className="small fw-semibold text-muted">
                        IFSC Code
                      </Form.Label>
                      <Form.Control
                        type="text"
                        name="ifsc_code"
                        value={tempBankData.ifsc_code}
                        onChange={handleBankChange}
                        size="sm"
                        maxLength="11"
                        placeholder="SBIN0001234 (Optional)"
                        style={{ textTransform: 'uppercase' }}
                      />
                    </Form.Group>
                  </Col>
                  <Col xs={12} md={4}>
                    <Form.Group>
                      <Form.Label className="small fw-semibold text-muted">
                        Branch Name
                      </Form.Label>
                      <Form.Control
                        type="text"
                        name="branch_name"
                        value={tempBankData.branch_name}
                        onChange={handleBankChange}
                        size="sm"
                        placeholder="Bank branch name (Optional)"
                      />
                    </Form.Group>
                  </Col>
                </Row>
                <Alert variant="info" className="mt-2 py-2 small">
                  <FaInfoCircle className="me-2" />
                  Bank details can be added later if not available now.
                </Alert>
              </>
            )}

            {activeTab === 'salary' && (
              <>
                <Row className="mb-3 g-2">
                  <Col xs={12} md={6}>
                    <Form.Group>
                      <Form.Label className="small fw-semibold text-muted">
                        Gross Salary (₹) <span className="text-danger">*</span>
                      </Form.Label>
                      <Form.Control
                        type="number"
                        name="gross_salary"
                        value={tempSalaryData.gross_salary}
                        onChange={handleSalaryChange}
                        size="sm"
                        min="201"
                        step="1000"
                        placeholder="Monthly gross salary"
                      />
                    </Form.Group>
                  </Col>
                  <Col xs={12} md={6}>
                    <Form.Group>
                      <Form.Label className="small fw-semibold text-muted">
                        PF (₹)
                      </Form.Label>
                      <Form.Control
                        type="number"
                        name="pf_amount"
                        value={tempSalaryData.pf_amount}
                        onChange={handleSalaryChange}
                        size="sm"
                        min="0"
                        placeholder="e.g. 1800"
                      />
                    </Form.Group>
                  </Col>
                  <Col xs={12} md={6}>
                    <Form.Group>
                      <Form.Label className="small fw-semibold text-muted">
                        PT / Professional Tax (₹)
                      </Form.Label>
                      <Form.Control
                        type="number"
                        name="professional_tax_amount"
                        value={tempSalaryData.professional_tax_amount}
                        onChange={handleSalaryChange}
                        size="sm"
                        min="0"
                        placeholder="e.g. 0"
                      />
                    </Form.Group>
                  </Col>
                  <Col xs={12} md={6}>
                    <Form.Group>
                      <Form.Label className="small fw-semibold text-muted">
                        In-hand Salary (₹)
                      </Form.Label>
                      <Form.Control
                        type="number"
                        name="in_hand_salary"
                        value={tempSalaryData.in_hand_salary}
                        readOnly
                        disabled
                        size="sm"
                        className="bg-light fw-bold text-success"
                      />
                      <Form.Text className="text-muted small d-block">
                        Auto-calculated (Gross − PF − Professional Tax)
                      </Form.Text>
                    </Form.Group>
                  </Col>
                </Row>

                {tempSalaryData.gross_salary && (
                  <div className="mb-3 p-2 bg-light rounded small">
                    <FaCalculator className="me-2 text-primary" size={12} />
                    <strong>Calculation:</strong> ₹{parseFloat(tempSalaryData.gross_salary).toLocaleString()} − PF ₹{(parseFloat(tempSalaryData.pf_amount) || 0).toLocaleString()} − PT ₹{(parseFloat(tempSalaryData.professional_tax_amount) || 0).toLocaleString()} = ₹{parseFloat(tempSalaryData.in_hand_salary || 0).toLocaleString()}
                  </div>
                )}
              </>
            )}

            {activeTab === 'policy' && (
              <>
                <Card className="mb-4 border-0 bg-light">
                  <Card.Body className="p-2 p-md-3">
                    <div className="d-flex align-items-center mb-3">
                      <FaFileSignature className="text-primary me-2" size={20} />
                      <h6 className="small fw-semibold mb-0">Employment Contract Policy</h6>
                    </div>

                    <div
                      className="bg-white p-2 p-md-3 rounded border mb-3"
                      style={{
                        maxHeight: '250px',
                        overflowY: 'auto',
                        fontSize: '0.8rem',
                        whiteSpace: 'pre-line',
                        fontFamily: 'monospace'
                      }}
                    >
                      {DEFAULT_CONTRACT_POLICY}
                    </div>

                    <Form.Group className="mb-3">
                      <Form.Check
                        type="checkbox"
                        id="acceptPolicy"
                        label={
                          <span className="small d-flex align-items-center flex-wrap">
                            <span>I have read and agree to the terms and conditions</span>
                          </span>
                        }
                        checked={acceptPolicy}
                        onChange={(e) => setAcceptPolicy(e.target.checked)}
                      />
                    </Form.Group>
                  </Card.Body>
                </Card>
              </>
            )}

            {activeTab === 'documents' && (
              <div>
                <Card className="mb-4 border-0 bg-light">
                  <Card.Body className="p-2 p-md-3">
                    <div className="d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center mb-3 gap-2">
                      <h6 className="small fw-semibold mb-0">Upload Documents (Optional)</h6>
                      <Button
                        variant="outline-primary"
                        size="sm"
                        onClick={addUploadRow}
                        disabled={uploading}
                      >
                        + Add Another Document
                      </Button>
                    </div>

                    {selectedFiles.map((_, index) => (
                      <Row key={index} className="g-2 mb-2 align-items-center">
                        <Col xs={12} sm={4}>
                          <Form.Select
                            size="sm"
                            value={selectedDocTypes[index] || ''}
                            onChange={(e) => handleDocumentTypeChange(index, e.target.value)}
                            disabled={uploading}
                          >
                            <option value="">Select Type</option>
                            {documentTypes.map(doc => (
                              <option key={doc.value} value={doc.value}>
                                {doc.label}
                              </option>
                            ))}
                          </Form.Select>
                        </Col>
                        <Col xs={8} sm={6}>
                          <Form.Control
                            type="file"
                            onChange={(e) => handleFileSelect(index, e.target.files[0])}
                            size="sm"
                            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                            disabled={uploading}
                          />
                        </Col>
                        <Col xs={4} sm={2}>
                          <Button
                            variant="outline-danger"
                            size="sm"
                            onClick={() => removeUploadRow(index)}
                            disabled={uploading || selectedFiles.length === 1}
                            className="w-100"
                          >
                            Remove
                          </Button>
                        </Col>
                      </Row>
                    ))}

                    {selectedFiles.length === 0 && (
                      <div className="text-center py-3">
                        <p className="text-muted small mb-2">No documents selected for upload</p>
                        <Button
                          variant="outline-primary"
                          size="sm"
                          onClick={addUploadRow}
                        >
                          Add Document to Upload
                        </Button>
                      </div>
                    )}
                  </Card.Body>
                </Card>

                <div className="mt-3 small text-muted bg-light p-2 rounded">
                  <FaFileAlt className="me-2 text-primary flex-shrink-0" size={12} />
                  <small>
                    <strong>Note:</strong> Document upload is optional. You can upload later from employee profile.
                  </small>
                </div>
              </div>
            )}

            {/* Navigation Buttons - Responsive */}
            <div className="d-flex justify-content-between mt-4">
              <div>
                {activeTab !== 'personal' && (
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    onClick={handlePrevious}
                  >
                    <FaArrowLeft className="me-1" size={10} />
                    <span className="d-none d-sm-inline">Previous</span>
                  </Button>
                )}
              </div>

              <div className="d-flex gap-2">
                {activeTab !== 'documents' ? (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleNext}
                  >
                    <span className="d-none d-sm-inline">Save & Next</span>
                    <span className="d-inline d-sm-none">Next</span>
                    <FaArrowRight className="ms-1" size={10} />
                  </Button>
                ) : (
                  <Button
                    variant="success"
                    size="sm"
                    onClick={handleFinalSubmit}
                    disabled={saving || uploading || !isAllTabsCompleted()}
                  >
                    {saving ? (
                      <>
                        <Spinner size="sm" animation="border" className="me-1" />
                        <span className="d-none d-sm-inline">Submitting...</span>
                      </>
                    ) : (
                      <>
                        <FaSave className="me-1" size={12} />
                        <span className="d-none d-sm-inline">Final Submit</span>
                        <span className="d-inline d-sm-none">Submit</span>
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>

            {/* Upload Progress */}
            {uploading && (
              <div className="mt-3">
                <ProgressBar
                  now={uploadProgress}
                  label={`${uploadProgress}%`}
                  striped
                  animated
                />
                <small className="text-muted mt-1 d-block">Uploading documents...</small>
              </div>
            )}
          </Form>
        </Card.Body>
      </Card>
    </div>
  );
};

export default AddEmployee;
