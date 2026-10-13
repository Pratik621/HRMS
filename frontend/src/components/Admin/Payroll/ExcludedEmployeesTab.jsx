import PaginatedTable from '../../Common/PaginatedTable';
// src/components/Admin/Payroll/ExcludedEmployeesTab.jsx
// Permanent payroll-exclusion flag (test/demo accounts) — persisted on the employee record
// via the existing generic PUT /api/employees/:id, same pattern as pf_amount/pt_amount.
// Excluded employees are also filtered out server-side in generateBulkSalarySlips, so this
// isn't just frontend state — see backend/controllers/salaryController.js.
import React, { useState } from 'react';
import { FaSearch, FaUserSlash, FaUndo } from 'react-icons/fa';
import axios from '../../../config/axios';
import API_ENDPOINTS from '../../../config/api';
import { useNotification } from '../../../context/NotificationContext';

const ExcludedEmployeesTab = ({ records, refetch }) => {
  const { showNotification } = useNotification();
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState(null);

  const excluded = records.filter(r => r.exclude_from_payroll);
  const candidates = records.filter(r => !r.exclude_from_payroll && search.trim() &&
    (`${r.first_name} ${r.last_name}`.toLowerCase().includes(search.toLowerCase()) || r.employee_id.toLowerCase().includes(search.toLowerCase()))
  );

  const setExcluded = async (rec, value) => {
    setBusyId(rec.employee_id);
    try {
      await axios.put(API_ENDPOINTS.EMPLOYEE_BY_ID(rec.id), { exclude_from_payroll: value });
      showNotification(`${rec.first_name} ${rec.last_name} ${value ? 'excluded from' : 're-included in'} payroll`, 'success');
      refetch();
    } catch (err) {
      showNotification(err.response?.data?.message || 'Failed to update exclusion', 'danger');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="d-flex flex-column gap-3">
      <div style={{ background: '#fff', borderRadius: 12, padding: '14px 20px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>Add Employee to Exclusion List</div>
        <div style={{ position: 'relative', maxWidth: 360 }}>
          <FaSearch size={11} style={{ position: 'absolute', left: 10, top: 10, color: '#94a3b8' }} />
          <input
            type="text" placeholder="Search employee to exclude…" value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '7px 10px 7px 28px', fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0', outline: 'none' }}
          />
        </div>
        {search.trim() && (
          <div className="mt-2 d-flex flex-column gap-1">
            {candidates.length === 0 ? (
              <div style={{ fontSize: 12, color: '#94a3b8' }}>No matching active employees.</div>
            ) : candidates.slice(0, 8).map(rec => (
              <div className="hrms-responsive-toolbar" key={rec.employee_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: '#f8fafc', borderRadius: 8 }}>
                <span style={{ fontSize: 12 }}>{rec.first_name} {rec.last_name} <span style={{ color: '#94a3b8', fontFamily: 'monospace', fontSize: 11 }}>{rec.employee_id}</span></span>
                <button
                  disabled={busyId === rec.employee_id}
                  onClick={() => setExcluded(rec, true)}
                  style={{ border: 'none', background: '#fee2e2', color: '#dc2626', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  <FaUserSlash size={10} /> Exclude
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 6px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', fontWeight: 700, fontSize: 13, color: '#1e293b' }}>
          Excluded Employees ({excluded.length})
        </div>
        {excluded.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 30, color: '#94a3b8', fontSize: 13 }}>No employees are currently excluded from payroll.</div>
        ) : (
          <PaginatedTable style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <tbody>
              {excluded.map(rec => (
                <tr key={rec.employee_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 16px', fontWeight: 600, color: '#1e293b' }}>{rec.first_name} {rec.last_name}</td>
                  <td style={{ padding: '10px 16px', color: '#64748b', fontFamily: 'monospace', fontSize: 11 }}>{rec.employee_id}</td>
                  <td style={{ padding: '10px 16px' }}>{rec.department}</td>
                  <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                    <button
                      disabled={busyId === rec.employee_id}
                      onClick={() => setExcluded(rec, false)}
                      style={{ border: '1px solid #16a34a', background: '#dcfce7', color: '#16a34a', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                    >
                      <FaUndo size={10} /> Remove from Exclusion
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </PaginatedTable>
        )}
      </div>
    </div>
  );
};

export default ExcludedEmployeesTab;
