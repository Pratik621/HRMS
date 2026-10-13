// src/components/Auth/NetworkBlocked.jsx
import React from 'react';
import { Button } from 'react-bootstrap';
import { FaWifi } from 'react-icons/fa';

const NetworkBlocked = () => {
  return (
    <div className="hrms-responsive-toolbar" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f9fa' }}>
      <div className="text-center p-4" style={{ maxWidth: 420 }}>
        <FaWifi size={48} className="text-danger mb-3" />
        <h4 className="fw-bold mb-2">Network not approved</h4>
        <p className="text-muted mb-4">
          This account can only be used from an approved office network. Please connect to
          the office Wi-Fi/network and try again, or contact your admin if you believe this
          is a mistake.
        </p>
        <Button variant="primary" size="sm" onClick={() => window.location.href = '/'}>
          Try again
        </Button>
      </div>
    </div>
  );
};

export default NetworkBlocked;
