import React, { useState, useEffect, useCallback } from 'react';
import { Form, Button, Spinner, Alert, ProgressBar, Badge } from 'react-bootstrap';
import {
  FaUser, FaPhone, FaBriefcase, FaUniversity, FaIdCard,
  FaHeartbeat, FaChevronRight, FaChevronLeft,
  FaCheckCircle, FaExclamationTriangle
} from 'react-icons/fa';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';
import { useAuth } from '../../context/AuthContext';

// ── Validation helpers ────────────────────────────────────────────────────────
const isEmail  = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const isPhone  = v => /^[6-9]\d{9}$/.test(v.replace(/\s/g,''));
const isPAN    = v => /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v.toUpperCase());
const isIFSC   = v => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v.toUpperCase());
const isAadhar = v => /^\d{12}$/.test(v.replace(/\s/g,''));

const STEPS = [
  { id: 1, label: 'Personal',    icon: <FaUser /> },
  { id: 2, label: 'Contact',     icon: <FaPhone /> },
  { id: 3, label: 'Employment',  icon: <FaBriefcase /> },
  { id: 4, label: 'Bank',        icon: <FaUniversity /> },
  { id: 5, label: 'Identity',    icon: <FaIdCard /> },
  { id: 6, label: 'Emergency',   icon: <FaHeartbeat /> },
];

const BLOOD_GROUPS = ['A+','A-','B+','B-','O+','O-','AB+','AB-'];
const GENDERS = ['Male','Female','Other'];

// ── Format seconds as MM:SS ────────────────────────────────────────────────────
const fmtCountdown = (secs) => {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

export default function ProfileCompletion({ employee, onSkip }) {
  const { user, updateUser } = useAuth();
  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [globalError, setGlobalError] = useState('');

  // ── Skip countdown (shows remaining seconds until re-appearance after skip) ──
  const [skipCountdown, setSkipCountdown] = useState(0);
  useEffect(() => {
    const skipKey = `profile_skip_until_${employee?.employee_id}`;
    const tick = () => {
      const until = parseInt(localStorage.getItem(skipKey) || '0', 10);
      const remaining = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      setSkipCountdown(remaining);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [employee?.employee_id]);

  // ── Form state ──────────────────────────────────────────────────────────────
  const [form, setForm] = useState({
    first_name:                  employee?.first_name   || '',
    middle_name:                 employee?.middle_name  || '',
    last_name:                   employee?.last_name    || '',
    dob:                         employee?.dob          || '',
    gender:                      employee?.gender       || '',
    blood_group:                 employee?.blood_group  || '',
    phone:                       employee?.phone        || '',
    personal_email:              employee?.personal_email || '',
    address:                     employee?.address      || '',
    city:                        employee?.city         || '',
    state:                       employee?.state        || '',
    pincode:                     employee?.pincode      || '',
    bank_account_name:           employee?.bank_account_name || '',
    account_number:              employee?.account_number    || '',
    ifsc_code:                   employee?.ifsc_code         || '',
    branch_name:                 employee?.branch_name       || '',
    pan_number:                  employee?.pan_number        || '',
    aadhar_number:               employee?.aadhar_number     || '',
    uan:                         employee?.uan               || '',
    emergency_contact_name:      employee?.emergency_contact_name      || '',
    emergency_contact_relation:  employee?.emergency_contact_relation  || '',
    emergency_contact:           employee?.emergency_contact           || '',
  });

  // Block keyboard Escape
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') e.preventDefault(); };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const set = (field) => (e) => {
    setForm(p => ({ ...p, [field]: e.target.value }));
    setErrors(p => ({ ...p, [field]: '' }));
  };

  // ── Per-step validation ──────────────────────────────────────────────────────
  const validate = useCallback((s) => {
    const errs = {};
    if (s === 1) {
      if (!form.first_name.trim()) errs.first_name = 'First name is required';
      if (!form.last_name.trim())  errs.last_name  = 'Last name is required';
      if (!form.dob)               errs.dob        = 'Date of birth is required';
      if (!form.gender)            errs.gender     = 'Gender is required';
    }
    if (s === 2) {
      if (!form.phone.trim())          errs.phone  = 'Phone number is required';
      else if (!isPhone(form.phone))   errs.phone  = 'Enter a valid 10-digit mobile number';
      if (!form.personal_email.trim()) errs.personal_email = 'Personal email is required';
      else if (!isEmail(form.personal_email)) errs.personal_email = 'Enter a valid email address';
      if (!form.address.trim()) errs.address = 'Address is required';
      if (!form.city.trim())    errs.city    = 'City is required';
      if (!form.state.trim())   errs.state   = 'State is required';
      if (!form.pincode.trim() || !/^\d{6}$/.test(form.pincode))
        errs.pincode = 'Enter a valid 6-digit pincode';
    }
    if (s === 4) {
      if (!form.bank_account_name.trim()) errs.bank_account_name = 'Account holder name is required';
      if (!form.account_number.trim())    errs.account_number    = 'Account number is required';
      if (!form.ifsc_code.trim())         errs.ifsc_code         = 'IFSC code is required';
      else if (!isIFSC(form.ifsc_code))   errs.ifsc_code         = 'Enter a valid IFSC code (e.g. SBIN0001234)';
    }
    if (s === 5) {
      if (!form.pan_number.trim())        errs.pan_number    = 'PAN number is required';
      else if (!isPAN(form.pan_number))   errs.pan_number    = 'Enter a valid PAN (e.g. ABCDE1234F)';
      if (!form.aadhar_number.trim())     errs.aadhar_number = 'Aadhaar number is required';
      else if (!isAadhar(form.aadhar_number)) errs.aadhar_number = 'Aadhaar must be 12 digits';
    }
    if (s === 6) {
      if (!form.emergency_contact_name.trim())
        errs.emergency_contact_name = 'Emergency contact name is required';
      if (!form.emergency_contact.trim())
        errs.emergency_contact = 'Emergency contact phone is required';
      else if (!isPhone(form.emergency_contact))
        errs.emergency_contact = 'Enter a valid 10-digit mobile number';
    }
    return errs;
  }, [form]);

  const next = () => {
    const errs = validate(step);
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    setStep(s => s + 1);
  };
  const back = () => { setErrors({}); setStep(s => s - 1); };

  // ── Submit ───────────────────────────────────────────────────────────────────
  const submit = async () => {
    const errs = validate(6);
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setSubmitting(true);
    setGlobalError('');

    try {
      await axios.post(API_ENDPOINTS.EMPLOYEE_COMPLETE_PROFILE, {
        ...form,
        pan_number:    form.pan_number.toUpperCase(),
        ifsc_code:     form.ifsc_code.toUpperCase(),
        aadhar_number: form.aadhar_number.replace(/\s/g,''),
      });
    } catch (err) {
      setGlobalError(err.response?.data?.message || 'Failed to save profile. Please try again.');
      setSubmitting(false);
      return;
    }

    updateUser({ profile_completed: true });
    setSubmitting(false);
    setDone(true);
  };

  // ── Success screen ────────────────────────────────────────────────────────────
  if (done) {
    return (
      <Overlay>
        <div style={{ textAlign: 'center', padding: '48px 32px' }}>
          <div style={{ fontSize: 72, marginBottom: 16 }}>🎉</div>
          <FaCheckCircle size={56} color="#22c55e" className="mb-3" />
          <h3 className="fw-bold mb-2" style={{ color: '#1e3a5f' }}>Profile Complete!</h3>
          <p className="text-muted mb-4">Welcome aboard, {form.first_name}! Your profile has been saved successfully.</p>
          <Button
            variant="success"
            size="lg"
            className="px-5"
            onClick={() => updateUser({ profile_completed: true })}
          >
            Go to Dashboard
          </Button>
        </div>
      </Overlay>
    );
  }

  const progress = Math.round(((step - 1) / STEPS.length) * 100);

  return (
    <Overlay>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#1e3a5f,#0ea5e9)', padding: '28px 32px 20px', color: '#fff', flexShrink: 0 }}>
        <div className="d-flex align-items-center justify-content-between mb-3">
          <div>
            <h4 className="mb-1 fw-bold">Complete Your Profile</h4>
            <div style={{ fontSize: 13, opacity: 0.8 }}>Step {step} of {STEPS.length} — {STEPS[step-1].label}</div>
          </div>
          <Badge style={{ background: 'rgba(255,255,255,0.2)', fontSize: 13, padding: '8px 14px' }}>
            {progress}% done
          </Badge>
        </div>
        <ProgressBar
          now={progress}
          style={{ height: 6, background: 'rgba(255,255,255,0.2)', borderRadius: 3 }}
          variant="info"
        />
        {/* Step indicators */}
        <div className="d-flex gap-1 mt-3 flex-wrap">
          {STEPS.map(s => (
            <div
              key={s.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600,
                padding: '3px 10px', borderRadius: 20,
                background: s.id === step ? '#fff' : s.id < step ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)',
                color: s.id === step ? '#1e3a5f' : '#fff',
                transition: 'all 0.2s',
              }}
            >
              {s.id < step ? <FaCheckCircle size={10} color="#22c55e" /> : s.icon}
              <span className="d-none d-sm-inline">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
        {globalError && (
          <Alert variant="danger" className="mb-3 py-2 small">
            <FaExclamationTriangle className="me-2" />{globalError}
          </Alert>
        )}

        {step === 1 && <StepPersonal form={form} set={set} errors={errors} />}
        {step === 2 && <StepContact  form={form} set={set} errors={errors} email={user?.email} />}
        {step === 3 && <StepEmployment employee={employee} />}
        {step === 4 && <StepBank      form={form} set={set} errors={errors} />}
        {step === 5 && <StepIdentity  form={form} set={set} errors={errors} />}
        {step === 6 && <StepEmergency form={form} set={set} errors={errors} />}
      </div>

      {/* Footer nav */}
      <div style={{ padding: '16px 32px', borderTop: '1px solid #e2e8f0', flexShrink: 0, background: '#fff' }}>
        {/* Skip row */}
        {onSkip && (
          <div style={{ textAlign: 'center', marginBottom: 10 }}>
            <button
              onClick={onSkip}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 12, color: '#94a3b8', textDecoration: 'underline',
                padding: 0,
              }}
            >
              Skip for Now
            </button>
            <span style={{ fontSize: 11, color: '#cbd5e1', marginLeft: 6 }}>
              (will reappear in 10 min)
            </span>
            {skipCountdown > 0 && (
              <span style={{ fontSize: 11, color: '#f97316', marginLeft: 6, fontWeight: 600 }}>
                — comes back in {fmtCountdown(skipCountdown)}
              </span>
            )}
          </div>
        )}
        {/* Nav row */}
        <div className="hrms-responsive-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Button
            variant="outline-secondary"
            onClick={back}
            disabled={step === 1}
            className="d-flex align-items-center gap-2"
          >
            <FaChevronLeft size={12} /> Back
          </Button>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>All fields marked * are mandatory</span>
          {step < STEPS.length ? (
            <Button
              variant="primary"
              onClick={next}
              className="d-flex align-items-center gap-2"
              style={{ background: '#1e3a5f', border: 'none' }}
            >
              Next <FaChevronRight size={12} />
            </Button>
          ) : (
            <Button
              variant="success"
              onClick={submit}
              disabled={submitting}
              className="d-flex align-items-center gap-2 px-4"
            >
              {submitting ? <><Spinner size="sm" className="me-2" /> Saving…</> : <><FaCheckCircle className="me-2" /> Complete Profile</>}
            </Button>
          )}
        </div>
      </div>
    </Overlay>
  );
}

// ── Full-screen non-dismissible overlay ──────────────────────────────────────
const Overlay = ({ children }) => (
  <div
    style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: 'rgba(15,23,42,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '16px',
    }}
    onMouseDown={e => e.stopPropagation()}
  >
    <div
      style={{
        background: '#fff', borderRadius: 16, width: '100%', maxWidth: 720,
        maxHeight: '92vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 80px rgba(0,0,0,0.4)',
        overflow: 'hidden',
      }}
      onMouseDown={e => e.stopPropagation()}
    >
      {children}
    </div>
  </div>
);

// ── Field helpers ─────────────────────────────────────────────────────────────
const Field = ({ label, required, error, children }) => (
  <Form.Group className="mb-3">
    <Form.Label className="small fw-semibold mb-1">
      {label}{required && <span className="text-danger ms-1">*</span>}
    </Form.Label>
    {children}
    {error && <div className="text-danger mt-1" style={{ fontSize: 11 }}>{error}</div>}
  </Form.Group>
);

const TRow = ({ children }) => <div className="row g-3">{children}</div>;
const TCol = ({ children, half }) => <div className={half ? 'col-md-6' : 'col-12'}>{children}</div>;

const SectionTitle = ({ icon, title }) => (
  <div className="d-flex align-items-center gap-2 mb-4 pb-2" style={{ borderBottom: '2px solid #f1f5f9' }}>
    <span style={{ color: '#0ea5e9', fontSize: 18 }}>{icon}</span>
    <h6 className="mb-0 fw-bold" style={{ color: '#1e3a5f' }}>{title}</h6>
  </div>
);

// ── Step 1: Personal Information ─────────────────────────────────────────────
const StepPersonal = ({ form, set, errors }) => (
  <>
    <SectionTitle icon={<FaUser />} title="Personal Information" />
    <TRow>
      <TCol half><Field label="First Name" required error={errors.first_name}>
        <Form.Control size="sm" value={form.first_name} onChange={set('first_name')} isInvalid={!!errors.first_name} />
      </Field></TCol>
      <TCol half><Field label="Middle Name" error={errors.middle_name}>
        <Form.Control size="sm" value={form.middle_name} onChange={set('middle_name')} />
      </Field></TCol>
    </TRow>
    <TRow>
      <TCol half><Field label="Last Name" required error={errors.last_name}>
        <Form.Control size="sm" value={form.last_name} onChange={set('last_name')} isInvalid={!!errors.last_name} />
      </Field></TCol>
      <TCol half><Field label="Date of Birth" required error={errors.dob}>
        <Form.Control size="sm" type="date" value={form.dob} onChange={set('dob')} isInvalid={!!errors.dob} />
      </Field></TCol>
    </TRow>
    <TRow>
      <TCol half><Field label="Gender" required error={errors.gender}>
        <Form.Select size="sm" value={form.gender} onChange={set('gender')} isInvalid={!!errors.gender}>
          <option value="">Select Gender</option>
          {GENDERS.map(g => <option key={g}>{g}</option>)}
        </Form.Select>
      </Field></TCol>
      <TCol half><Field label="Blood Group" error={errors.blood_group}>
        <Form.Select size="sm" value={form.blood_group} onChange={set('blood_group')}>
          <option value="">Select Blood Group</option>
          {BLOOD_GROUPS.map(b => <option key={b}>{b}</option>)}
        </Form.Select>
      </Field></TCol>
    </TRow>
  </>
);

// ── Step 2: Contact Information ──────────────────────────────────────────────
const StepContact = ({ form, set, errors, email }) => (
  <>
    <SectionTitle icon={<FaPhone />} title="Contact Information" />
    <TRow>
      <TCol half><Field label="Mobile Number" required error={errors.phone}>
        <Form.Control size="sm" value={form.phone} onChange={set('phone')} placeholder="10-digit mobile" isInvalid={!!errors.phone} />
      </Field></TCol>
      <TCol half><Field label="Personal Email" required error={errors.personal_email}>
        <Form.Control size="sm" type="email" value={form.personal_email} onChange={set('personal_email')} placeholder="your@gmail.com" isInvalid={!!errors.personal_email} />
      </Field></TCol>
    </TRow>
    <TRow>
      <TCol><Field label="Company Email">
        <Form.Control size="sm" value={email || ''} readOnly className="bg-light" />
      </Field></TCol>
    </TRow>
    <TRow>
      <TCol><Field label="Residential Address" required error={errors.address}>
        <Form.Control as="textarea" rows={2} size="sm" value={form.address} onChange={set('address')} isInvalid={!!errors.address} />
      </Field></TCol>
    </TRow>
    <TRow>
      <TCol half><Field label="City" required error={errors.city}>
        <Form.Control size="sm" value={form.city} onChange={set('city')} isInvalid={!!errors.city} />
      </Field></TCol>
      <TCol half><Field label="State" required error={errors.state}>
        <Form.Control size="sm" value={form.state} onChange={set('state')} isInvalid={!!errors.state} />
      </Field></TCol>
    </TRow>
    <TRow>
      <TCol half><Field label="Pincode" required error={errors.pincode}>
        <Form.Control size="sm" value={form.pincode} onChange={set('pincode')} maxLength={6} placeholder="6-digit pincode" isInvalid={!!errors.pincode} />
      </Field></TCol>
    </TRow>
  </>
);

// ── Step 3: Employment Details (read-only) ───────────────────────────────────
const StepEmployment = ({ employee }) => {
  const rows = [
    ['Employee ID',      employee?.employee_id],
    ['Designation',      employee?.designation],
    ['Department',       employee?.department],
    ['Employment Type',  employee?.employment_type],
    ['Joining Date',     employee?.joining_date ? new Date(employee.joining_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : null],
    ['Shift Timing',     employee?.shift_timing || '9:00 AM – 6:00 PM'],
    ['Reporting Manager', employee?.reporting_manager],
  ];
  return (
    <>
      <SectionTitle icon={<FaBriefcase />} title="Employment Details" />
      <Alert variant="info" className="py-2 small mb-4">
        These details are set by the admin. Contact HR if any information is incorrect.
      </Alert>
      <div className="hrms-responsive-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 24px' }}>
        {rows.map(([label, value]) => value ? (
          <div key={label}>
            <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{label}</div>
            <div style={{ fontWeight: 600, color: '#1e293b', fontSize: 13 }}>{value}</div>
          </div>
        ) : null)}
      </div>
    </>
  );
};

// ── Step 4: Bank Details ─────────────────────────────────────────────────────
const StepBank = ({ form, set, errors }) => (
  <>
    <SectionTitle icon={<FaUniversity />} title="Bank Details" />
    <TRow>
      <TCol><Field label="Account Holder Name" required error={errors.bank_account_name}>
        <Form.Control size="sm" value={form.bank_account_name} onChange={set('bank_account_name')} isInvalid={!!errors.bank_account_name} />
      </Field></TCol>
    </TRow>
    <TRow>
      <TCol half><Field label="Account Number" required error={errors.account_number}>
        <Form.Control size="sm" value={form.account_number} onChange={set('account_number')} isInvalid={!!errors.account_number} />
      </Field></TCol>
      <TCol half><Field label="IFSC Code" required error={errors.ifsc_code}>
        <Form.Control size="sm" value={form.ifsc_code} onChange={set('ifsc_code')} placeholder="SBIN0001234" isInvalid={!!errors.ifsc_code}
          style={{ textTransform: 'uppercase' }} />
      </Field></TCol>
    </TRow>
    <TRow>
      <TCol half><Field label="Branch Name" error={errors.branch_name}>
        <Form.Control size="sm" value={form.branch_name} onChange={set('branch_name')} />
      </Field></TCol>
    </TRow>
  </>
);

// ── Step 5: Tax & Identity ───────────────────────────────────────────────────
const StepIdentity = ({ form, set, errors }) => (
  <>
    <SectionTitle icon={<FaIdCard />} title="Tax & Identity" />
    <TRow>
      <TCol half><Field label="PAN Number" required error={errors.pan_number}>
        <Form.Control size="sm" value={form.pan_number} onChange={set('pan_number')} placeholder="ABCDE1234F"
          isInvalid={!!errors.pan_number} style={{ textTransform: 'uppercase' }} maxLength={10} />
      </Field></TCol>
      <TCol half><Field label="Aadhaar Number" required error={errors.aadhar_number}>
        <Form.Control size="sm" value={form.aadhar_number} onChange={set('aadhar_number')} placeholder="12-digit Aadhaar"
          isInvalid={!!errors.aadhar_number} maxLength={12} />
      </Field></TCol>
    </TRow>
    <TRow>
      <TCol half><Field label="UAN (Optional)" error={errors.uan}>
        <Form.Control size="sm" value={form.uan} onChange={set('uan')} placeholder="Universal Account Number" />
      </Field></TCol>
    </TRow>
  </>
);

// ── Step 6: Emergency Contact ────────────────────────────────────────────────
const StepEmergency = ({ form, set, errors }) => (
  <>
    <SectionTitle icon={<FaHeartbeat />} title="Emergency Contact" />
    <TRow>
      <TCol half><Field label="Contact Person Name" required error={errors.emergency_contact_name}>
        <Form.Control size="sm" value={form.emergency_contact_name} onChange={set('emergency_contact_name')} isInvalid={!!errors.emergency_contact_name} />
      </Field></TCol>
      <TCol half><Field label="Relationship" error={errors.emergency_contact_relation}>
        <Form.Control size="sm" value={form.emergency_contact_relation} onChange={set('emergency_contact_relation')} placeholder="e.g. Spouse, Parent, Sibling" />
      </Field></TCol>
    </TRow>
    <TRow>
      <TCol half><Field label="Contact Phone" required error={errors.emergency_contact}>
        <Form.Control size="sm" value={form.emergency_contact} onChange={set('emergency_contact')} placeholder="10-digit mobile" isInvalid={!!errors.emergency_contact} />
      </Field></TCol>
    </TRow>
  </>
);
