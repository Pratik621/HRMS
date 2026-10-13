// src/components/Auth/Unauthorized.jsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from 'react-bootstrap';
import { FaLock, FaArrowLeft } from 'react-icons/fa';

const Unauthorized = () => {
  const navigate = useNavigate();
  return (
    <div className="hrms-responsive-toolbar" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f9fa' }}>
      <div className="text-center p-4">
        <FaLock size={48} className="text-danger mb-3" />
        <h4 className="fw-bold mb-2">Access Denied</h4>
        <p className="text-muted mb-4">You don't have permission to view this page.</p>
        <Button variant="primary" size="sm" onClick={() => navigate(-1)} className="d-inline-flex align-items-center gap-2">
          <FaArrowLeft size={12} /> Go Back
        </Button>
      </div>
    </div>
  );
};

export default Unauthorized;
