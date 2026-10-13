import PaginatedTable from '../Common/PaginatedTable';
// Test component to debug leave requests API
import React, { useState, useEffect } from 'react';
import { Card, Button, Alert, Spinner, Table, Badge } from 'react-bootstrap';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';

const LeaveRequestsTest = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const testAPI = async () => {
    setLoading(true);
    setError(null);
    try {
      console.log('🧪 Testing leave requests API...');
      const response = await axios.get(`${API_ENDPOINTS.LEAVES}?all=true`);
      console.log('📊 API Response:', response);
      setData(response.data);
    } catch (err) {
      console.error('❌ API Error:', err);
      setError(err.response?.data || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    testAPI();
  }, []);

  return (
    <Card className="mb-4">
      <Card.Header className="d-flex justify-content-between align-items-center">
        <h6 className="mb-0">🧪 Leave Requests API Test</h6>
        <Button size="sm" onClick={testAPI} disabled={loading}>
          {loading ? <Spinner size="sm" /> : 'Test API'}
        </Button>
      </Card.Header>
      <Card.Body>
        {error && (
          <Alert variant="danger">
            <strong>Error:</strong> {JSON.stringify(error, null, 2)}
          </Alert>
        )}
        
        {data && (
          <div>
            <Alert variant="info">
              <strong>Response Type:</strong> {Array.isArray(data) ? 'Array' : typeof data}<br/>
              <strong>Total Records:</strong> {Array.isArray(data) ? data.length : 'N/A'}<br/>
              <strong>Pending:</strong> {Array.isArray(data) ? data.filter(l => l.status === 'pending').length : 'N/A'}
            </Alert>
            
            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
              <PaginatedTable as={Table} size="sm" striped>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Employee</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.isArray(data) ? data.slice(0, 10).map((leave, index) => (
                    <tr key={leave.id || index}>
                      <td>{index + 1}</td>
                      <td>{leave.first_name} {leave.last_name} ({leave.employee_id})</td>
                      <td>{leave.leave_type}</td>
                      <td>
                        <Badge bg={leave.status === 'pending' ? 'warning' : 'secondary'}>
                          {leave.status}
                        </Badge>
                      </td>
                      <td>{leave.start_date}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan="5">No data or invalid format</td>
                    </tr>
                  )}
                </tbody>
              </PaginatedTable>
            </div>
            
            <details className="mt-3">
              <summary>Raw Response Data</summary>
              <pre style={{ fontSize: '12px', maxHeight: '200px', overflow: 'auto' }}>
                {JSON.stringify(data, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </Card.Body>
    </Card>
  );
};

export default LeaveRequestsTest;