// components/Auth/Login.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';
import loginBg from '../../assets/login.jpg'
import {
  FaUser, FaLock, FaEye, FaEyeSlash,
  FaExclamationTriangle, FaCheckCircle, FaArrowLeft, FaEnvelope, FaKey
} from 'react-icons/fa';
import { Spinner } from 'react-bootstrap';

const OTP_RESEND_COOLDOWN_SECONDS = 60;

const Login = () => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword]         = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError]               = useState('');
  const [loading, setLoading]           = useState(false);

  // Forgot-password flow — email + 4-digit OTP (DOB/phone verification removed).
  const [mode, setMode] = useState('login'); // 'login' | 'email' | 'otp' | 'newpass' | 'success'
  const [resetEmail, setResetEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetInfo, setResetInfo] = useState(''); // transient success note, e.g. "OTP resent"
  const [resetLoading, setResetLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const { login }  = useAuth();
  const navigate   = useNavigate();

  // Ticks the "Resend OTP" cooldown down to 0 once a second while on the OTP screen.
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await login(identifier, password);
      if (result.success) {
        const { role } = result.user;
        if (role === 'admin' || role === 'desktop_support' || role === 'hr') navigate('/admin/dashboard');
        else if (role === 'sub_admin') navigate('/');
        else if (role === 'manager') navigate('/manager/dashboard');
        else if (role === 'finance') navigate('/finance/export');
        else navigate('/employee/dashboard');
      } else {
        setError(result.message || 'Login failed. Please try again.');
      }
    } catch {
      setError('An error occurred during login. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const resetToLoginMode = () => {
    setMode('login');
    setResetEmail('');
    setOtp('');
    setResetToken('');
    setNewPassword('');
    setConfirmPassword('');
    setResetError('');
    setResetInfo('');
    setResendCooldown(0);
  };

  // Step 1 — send a 4-digit OTP to the entered email. Same generic message whether or not
  // the email is actually registered (backend never reveals account existence).
  const handleSendOtp = async (e) => {
    e.preventDefault();
    setResetError('');
    setResetLoading(true);
    try {
      const res = await axios.post(API_ENDPOINTS.PASSWORD_FORGOT, { email: resetEmail });
      if (res.data.success) {
        setMode('otp');
        setResendCooldown(OTP_RESEND_COOLDOWN_SECONDS);
      }
    } catch (err) {
      setResetError(err.response?.data?.message || 'Something went wrong. Please try again.');
    } finally {
      setResetLoading(false);
    }
  };

  // "Resend OTP" on the OTP screen — same endpoint as step 1, just without changing mode.
  const handleResendOtp = async () => {
    if (resendCooldown > 0 || resendLoading) return;
    setResetError('');
    setResetInfo('');
    setResendLoading(true);
    try {
      const res = await axios.post(API_ENDPOINTS.PASSWORD_FORGOT, { email: resetEmail });
      if (res.data.success) {
        setResetInfo('A new OTP has been sent to your email.');
        setResendCooldown(OTP_RESEND_COOLDOWN_SECONDS);
      }
    } catch (err) {
      setResetError(err.response?.data?.message || 'Failed to resend OTP. Please try again.');
    } finally {
      setResendLoading(false);
    }
  };

  // Step 2 — verify the 4-digit OTP, receive a short-lived reset token for step 3.
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setResetError('');
    setResetLoading(true);
    try {
      const res = await axios.post(API_ENDPOINTS.PASSWORD_VERIFY_OTP, { email: resetEmail, otp });
      if (res.data.success) {
        setResetToken(res.data.resetToken);
        setMode('newpass');
      }
    } catch (err) {
      setResetError(err.response?.data?.message || 'Incorrect or expired OTP. Please try again.');
    } finally {
      setResetLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setResetError('');

    if (newPassword.length < 6) {
      setResetError('Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setResetError('Passwords do not match');
      return;
    }

    setResetLoading(true);
    try {
      const res = await axios.post(API_ENDPOINTS.PASSWORD_RESET, {
        token: resetToken,
        newPassword,
      });
      if (res.data.success) {
        setMode('success');
      }
    } catch (err) {
      setResetError(err.response?.data?.message || 'Failed to reset password. Please try again.');
    } finally {
      setResetLoading(false);
    }
  };

  const inputStyle = {
    height: '48px',
    fontSize: '14px',
    borderRadius: '12px',
    border: '1.5px solid #CBD5E1',
    paddingLeft: '44px',
    paddingRight: '44px',
    color: '#334155',
    background: '#FFFFFF',
    outline: 'none',
    width: '100%',
    transition: 'border-color 0.15s',
    fontFamily: 'inherit',
  };

  const submitButtonStyle = (disabled) => ({
    width: '100%', height: '48px', borderRadius: '12px',
    background: 'linear-gradient(135deg, #2563EB, #1D4ED8)',
    border: 'none', color: 'white', fontSize: '15px', fontWeight: '600',
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
    boxShadow: '0 4px 14px rgba(37,99,235,0.35)',
    transition: 'opacity 0.15s',
  });

  return (
    <>
      {/* ── Full-page wrapper ── */}
      <div style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        fontFamily: "'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        position: 'relative',
      }}>

        {/* ── Background image ── */}
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `url(${loginBg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          zIndex: 0,
        }} />

        {/* ── Dark overlay for readability ── */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.52)',
          zIndex: 1,
        }} />

        {/* ── Logo top-left ── */}
        <div style={{
          position: 'absolute',
          top: '22px',
          left: '26px',
          zIndex: 3,
          display: 'flex',
          alignItems: 'center',
        }}>

        </div>

        {/* ── Auth card ── */}
        <div style={{
          position: 'relative',
          zIndex: 2,
          background: '#FFFFFF',
          borderRadius: '24px',
          padding: '44px 38px',
          width: '100%',
          maxWidth: '415px',
          boxShadow: '0 25px 50px rgba(0,0,0,0.35)',
          textAlign: 'center',
          margin: '16px',
          border: '1px solid rgba(255,255,255,0.85)',
        }}>

          {/* Avatar badge */}
          <div style={{
            width: '60px', height: '60px', borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px',
          }}>
            <img
            src="/images/b2b_logo.png"
            alt="Logo"
            style={{ height: '40px', width: 'auto', objectFit: 'contain', filter: 'brightness(1.15)' }}
          />
          </div>

          {mode === 'login' && (
            <>
              <p style={{ fontSize: '13px', color: '#292a2b', marginBottom: '28px', fontWeight: '700' }}>
                Employee Management System
              </p>

              {error && (
                <div style={{
                  background: '#FEF2F2', border: '1px solid #FEE2E2',
                  borderRadius: '10px', padding: '10px 14px', marginBottom: '16px',
                  display: 'flex', alignItems: 'center', gap: '8px',
                  fontSize: '13px', color: '#991B1B', textAlign: 'left',
                }}>
                  <FaExclamationTriangle size={12} />
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit}>
                {/* Employee ID or Email */}
                <div style={{ marginBottom: '16px', position: 'relative' }}>
                  <FaUser style={{
                    position: 'absolute', left: '16px', top: '50%',
                    transform: 'translateY(-50%)', color: '#94A3B8', fontSize: '14px', zIndex: 1,
                  }} />
                  <input
                    type="text" value={identifier} required disabled={loading}
                    onChange={e => setIdentifier(e.target.value)}
                    placeholder="Employee ID or Email address"
                    autoComplete="username"
                    style={inputStyle}
                    onFocus={e  => e.target.style.borderColor = '#2563EB'}
                    onBlur={e   => e.target.style.borderColor = '#CBD5E1'}
                  />
                </div>

                {/* Password */}
                <div style={{ marginBottom: '8px', position: 'relative' }}>
                  <FaLock style={{
                    position: 'absolute', left: '16px', top: '50%',
                    transform: 'translateY(-50%)', color: '#94A3B8', fontSize: '14px', zIndex: 1,
                  }} />
                  <input
                    type={showPassword ? 'text' : 'password'} value={password} required disabled={loading}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Password"
                    style={inputStyle}
                    onFocus={e  => e.target.style.borderColor = '#2563EB'}
                    onBlur={e   => e.target.style.borderColor = '#CBD5E1'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(s => !s)}
                    style={{
                      position: 'absolute', right: '16px', top: '50%',
                      transform: 'translateY(-50%)', background: 'none',
                      border: 'none', cursor: 'pointer', color: '#94A3B8', padding: 0,
                    }}
                  >
                    {showPassword ? <FaEyeSlash size={14} /> : <FaEye size={14} />}
                  </button>
                </div>

                <div style={{ textAlign: 'right', marginBottom: '16px' }}>
                  <button
                    type="button"
                    onClick={() => setMode('email')}
                    style={{
                      background: 'none', border: 'none', padding: 0,
                      fontSize: '12.5px', fontWeight: 600, color: '#2563EB', cursor: 'pointer',
                    }}
                  >
                    Forgot password?
                  </button>
                </div>

                {/* Submit */}
                <button
                  type="submit" disabled={loading}
                  style={submitButtonStyle(loading)}
                  onMouseEnter={e => { if (!loading) e.currentTarget.style.opacity = '0.9'; }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
                >
                  {loading
                    ? <><Spinner as="span" animation="border" size="sm" /> Signing in...</>
                    : 'Continue'
                  }
                </button>
              </form>

              {/* Divider */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', margin: '24px 0 16px' }}>
                <div style={{ flex: 1, height: '1px', background: '#E2E8F0' }} />
                <span style={{ fontSize: '11px', fontWeight: '600', color: '#94A3B8' }}>OR</span>
                <div style={{ flex: 1, height: '1px', background: '#E2E8F0' }} />
              </div>
              <p style={{ fontSize: '12px', fontWeight: '500', color: '#94A3B8', margin: 0 }}>
                Secure sign-in · Role-based access
              </p>
            </>
          )}

          {mode === 'email' && (
            <>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>
                Reset your password
              </h2>
              <p style={{ fontSize: '12.5px', color: '#64748B', marginBottom: '18px' }}>
                Enter your registered email address and we'll send you a 4-digit OTP
              </p>

              {resetError && (
                <div style={{
                  background: '#FEF2F2', border: '1px solid #FEE2E2',
                  borderRadius: '10px', padding: '10px 14px', marginBottom: '16px',
                  display: 'flex', alignItems: 'center', gap: '8px',
                  fontSize: '13px', color: '#991B1B', textAlign: 'left',
                }}>
                  <FaExclamationTriangle size={12} />
                  {resetError}
                </div>
              )}

              <form onSubmit={handleSendOtp}>
                <div style={{ marginBottom: '20px', position: 'relative' }}>
                  <FaEnvelope style={{
                    position: 'absolute', left: '16px', top: '50%',
                    transform: 'translateY(-50%)', color: '#94A3B8', fontSize: '14px', zIndex: 1,
                  }} />
                  <input
                    type="email" value={resetEmail} required disabled={resetLoading}
                    onChange={e => setResetEmail(e.target.value)}
                    placeholder="Email address"
                    autoComplete="email"
                    style={inputStyle}
                    onFocus={e  => e.target.style.borderColor = '#2563EB'}
                    onBlur={e   => e.target.style.borderColor = '#CBD5E1'}
                  />
                </div>

                <button type="submit" disabled={resetLoading} style={submitButtonStyle(resetLoading)}>
                  {resetLoading
                    ? <><Spinner as="span" animation="border" size="sm" /> Sending OTP...</>
                    : 'Send OTP'
                  }
                </button>
              </form>

              <button
                type="button"
                onClick={resetToLoginMode}
                style={{
                  background: 'none', border: 'none', marginTop: '18px', padding: 0,
                  fontSize: '12.5px', fontWeight: 600, color: '#64748B', cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                }}
              >
                <FaArrowLeft size={11} /> Back to login
              </button>
            </>
          )}

          {mode === 'otp' && (
            <>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>
                Enter verification code
              </h2>
              <p style={{ fontSize: '12.5px', color: '#64748B', marginBottom: '18px' }}>
                We sent a 4-digit OTP to <strong>{resetEmail}</strong>. It expires in 10 minutes.
              </p>

              {resetError && (
                <div style={{
                  background: '#FEF2F2', border: '1px solid #FEE2E2',
                  borderRadius: '10px', padding: '10px 14px', marginBottom: '16px',
                  display: 'flex', alignItems: 'center', gap: '8px',
                  fontSize: '13px', color: '#991B1B', textAlign: 'left',
                }}>
                  <FaExclamationTriangle size={12} />
                  {resetError}
                </div>
              )}
              {resetInfo && (
                <div style={{
                  background: '#ECFDF5', border: '1px solid #D1FAE5',
                  borderRadius: '10px', padding: '10px 14px', marginBottom: '16px',
                  display: 'flex', alignItems: 'center', gap: '8px',
                  fontSize: '13px', color: '#065F46', textAlign: 'left',
                }}>
                  <FaCheckCircle size={12} />
                  {resetInfo}
                </div>
              )}

              <form onSubmit={handleVerifyOtp}>
                <div style={{ marginBottom: '16px', position: 'relative' }}>
                  <FaKey style={{
                    position: 'absolute', left: '16px', top: '50%',
                    transform: 'translateY(-50%)', color: '#94A3B8', fontSize: '14px', zIndex: 1,
                  }} />
                  <input
                    type="text" inputMode="numeric" pattern="[0-9]{4}" maxLength={4}
                    value={otp} required disabled={resetLoading}
                    onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="4-digit OTP"
                    autoComplete="one-time-code"
                    style={{ ...inputStyle, textAlign: 'center', letterSpacing: '10px', fontWeight: 700, fontSize: '18px' }}
                    onFocus={e  => e.target.style.borderColor = '#2563EB'}
                    onBlur={e   => e.target.style.borderColor = '#CBD5E1'}
                  />
                </div>

                <button type="submit" disabled={resetLoading || otp.length !== 4} style={submitButtonStyle(resetLoading || otp.length !== 4)}>
                  {resetLoading
                    ? <><Spinner as="span" animation="border" size="sm" /> Verifying...</>
                    : 'Verify OTP'
                  }
                </button>
              </form>

              <div style={{ marginTop: '18px', fontSize: '12.5px', color: '#64748B' }}>
                Didn't receive the OTP?{' '}
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={resendCooldown > 0 || resendLoading}
                  style={{
                    background: 'none', border: 'none', padding: 0,
                    fontSize: '12.5px', fontWeight: 600,
                    color: (resendCooldown > 0 || resendLoading) ? '#94A3B8' : '#2563EB',
                    cursor: (resendCooldown > 0 || resendLoading) ? 'not-allowed' : 'pointer',
                  }}
                >
                  {resendLoading ? 'Resending...' : resendCooldown > 0 ? `Resend OTP (${resendCooldown}s)` : 'Resend OTP'}
                </button>
              </div>

              <button
                type="button"
                onClick={resetToLoginMode}
                style={{
                  background: 'none', border: 'none', marginTop: '14px', padding: 0,
                  fontSize: '12.5px', fontWeight: 600, color: '#64748B', cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                }}
              >
                <FaArrowLeft size={11} /> Back to login
              </button>
            </>
          )}

          {mode === 'newpass' && (
            <>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>
                Set a new password
              </h2>
              <p style={{ fontSize: '12.5px', color: '#64748B', marginBottom: '24px' }}>
                Identity verified. Choose a new password below.
              </p>

              {resetError && (
                <div style={{
                  background: '#FEF2F2', border: '1px solid #FEE2E2',
                  borderRadius: '10px', padding: '10px 14px', marginBottom: '16px',
                  display: 'flex', alignItems: 'center', gap: '8px',
                  fontSize: '13px', color: '#991B1B', textAlign: 'left',
                }}>
                  <FaExclamationTriangle size={12} />
                  {resetError}
                </div>
              )}

              <form onSubmit={handleResetPassword}>
                <div style={{ marginBottom: '16px', position: 'relative' }}>
                  <FaLock style={{
                    position: 'absolute', left: '16px', top: '50%',
                    transform: 'translateY(-50%)', color: '#94A3B8', fontSize: '14px', zIndex: 1,
                  }} />
                  <input
                    type={showNewPassword ? 'text' : 'password'} value={newPassword} required disabled={resetLoading}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="New password (min. 6 characters)"
                    autoComplete="new-password"
                    style={inputStyle}
                    onFocus={e  => e.target.style.borderColor = '#2563EB'}
                    onBlur={e   => e.target.style.borderColor = '#CBD5E1'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(s => !s)}
                    style={{
                      position: 'absolute', right: '16px', top: '50%',
                      transform: 'translateY(-50%)', background: 'none',
                      border: 'none', cursor: 'pointer', color: '#94A3B8', padding: 0,
                    }}
                  >
                    {showNewPassword ? <FaEyeSlash size={14} /> : <FaEye size={14} />}
                  </button>
                </div>

                <div style={{ marginBottom: '20px', position: 'relative' }}>
                  <FaLock style={{
                    position: 'absolute', left: '16px', top: '50%',
                    transform: 'translateY(-50%)', color: '#94A3B8', fontSize: '14px', zIndex: 1,
                  }} />
                  <input
                    type={showNewPassword ? 'text' : 'password'} value={confirmPassword} required disabled={resetLoading}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Retype new password"
                    autoComplete="new-password"
                    style={inputStyle}
                    onFocus={e  => e.target.style.borderColor = '#2563EB'}
                    onBlur={e   => e.target.style.borderColor = '#CBD5E1'}
                  />
                </div>

                <button type="submit" disabled={resetLoading} style={submitButtonStyle(resetLoading)}>
                  {resetLoading
                    ? <><Spinner as="span" animation="border" size="sm" /> Saving...</>
                    : 'Change Password'
                  }
                </button>
              </form>

              <button
                type="button"
                onClick={resetToLoginMode}
                style={{
                  background: 'none', border: 'none', marginTop: '18px', padding: 0,
                  fontSize: '12.5px', fontWeight: 600, color: '#64748B', cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                }}
              >
                <FaArrowLeft size={11} /> Back to login
              </button>
            </>
          )}

          {mode === 'success' && (
            <>
              <div style={{
                width: '52px', height: '52px', borderRadius: '50%',
                background: '#ECFDF5', display: 'flex', alignItems: 'center',
                justifyContent: 'center', margin: '0 auto 16px',
              }}>
                <FaCheckCircle size={24} color="#16A34A" />
              </div>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A', marginBottom: '6px' }}>
                Your password has been reset successfully
              </h2>
              <p style={{ fontSize: '12.5px', color: '#64748B', marginBottom: '24px' }}>
                You can now sign in with your new password.
              </p>
              <button
                type="button"
                onClick={resetToLoginMode}
                style={submitButtonStyle(false)}
              >
                Go to Login
              </button>
            </>
          )}
        </div>
      </div>

    </>
  );
};

export default Login;
