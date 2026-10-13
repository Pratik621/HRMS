import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Form, Button, Alert, Spinner, Badge } from 'react-bootstrap';
import { FaEnvelope, FaPaperPlane } from 'react-icons/fa';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';
import RecipientSelector from '../Common/RecipientSelector';
import EmailTagInput from '../Common/EmailTagInput';

const MAX_SUBJECT_LENGTH = 200;
const MAX_MESSAGE_LENGTH = 10000;

export default function EmailCenter() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [cc, setCc] = useState([]);
  const [bcc, setBcc] = useState([]);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null); // { type: 'success'|'danger', text }

  useEffect(() => { fetchEmployees(); }, []);

  const fetchEmployees = async () => {
    try {
      const res = await axios.get(API_ENDPOINTS.EMPLOYEES);
      const list = Array.isArray(res.data) ? res.data : (res.data?.employees || res.data?.data || []);
      setEmployees(list.filter(e => e.is_active !== false));
    } catch {
      setResult({ type: 'danger', text: 'Failed to load employee directory.' });
    } finally {
      setLoading(false);
    }
  };

  const canSend = selectedIds.size > 0 && subject.trim().length > 0 && message.trim().length > 0 && !sending;

  const handleSend = async () => {
    setResult(null);
    if (selectedIds.size === 0) return setResult({ type: 'danger', text: 'Select at least one recipient.' });
    if (!subject.trim()) return setResult({ type: 'danger', text: 'Subject is required.' });
    if (!message.trim()) return setResult({ type: 'danger', text: 'Message is required.' });

    setSending(true);
    try {
      const res = await axios.post(API_ENDPOINTS.EMAIL_SEND, {
        recipient_ids: Array.from(selectedIds),
        subject: subject.trim(),
        message: message.trim(),
        cc,
        bcc,
      });
      setResult({
        type: res.data.failed > 0 ? 'warning' : 'success',
        text: res.data.message,
      });
      if (res.data.failed === 0) {
        // Only clear the form on a clean send — on partial failure, keep everything so
        // the sender can retry without re-picking recipients/re-typing the message.
        setSelectedIds(new Set());
        setSubject('');
        setMessage('');
        setCc([]);
        setBcc([]);
      }
    } catch (err) {
      setResult({ type: 'danger', text: err.response?.data?.message || 'Failed to send email. Please try again.' });
    } finally {
      setSending(false);
    }
  };

  return (
    <Container fluid className="py-4">
      <div className="d-flex align-items-center gap-3 mb-4">
        <div style={{ background: "#1f4e79", borderRadius: 14, padding: '12px 14px', boxShadow: '0 10px 24px rgba(30,58,95,0.18)' }}>
          <FaEnvelope color="#fff" size={22} />
        </div>
        <div>
          <h3 className="mb-1 fw-bold text-dark">Email</h3>
          <div className="text-muted" style={{ fontSize: 13 }}>
            Compose and send an email to Managers, Team Leaders, HR, or any individual employees.
          </div>
        </div>
      </div>

      {result && (
        <Alert variant={result.type} dismissible onClose={() => setResult(null)}>
          {result.text}
        </Alert>
      )}

      <Row className="g-3">
        <Col lg={7}>
          <Card className="border-0 shadow-sm" style={{ borderRadius: 18 }}>
            <Card.Header className="bg-white border-bottom py-3 px-4">
              <div className="fw-bold text-dark">Select Recipients</div>
              <div className="small text-muted">Search employees, use group quick-select, or pick individuals.</div>
            </Card.Header>
            <Card.Body className="p-3 p-md-4">
              {loading ? (
                <div className="text-center py-4"><Spinner animation="border" variant="primary" /></div>
              ) : (
                <RecipientSelector employees={employees} selectedIds={selectedIds} onChange={setSelectedIds} />
              )}
            </Card.Body>
          </Card>
        </Col>

        <Col lg={5}>
          <Card className="border-0 shadow-sm" style={{ borderRadius: 18 }}>
            <Card.Header className="bg-white border-bottom py-3 px-4">
              <div className="fw-bold text-dark">Compose</div>
              <div className="small text-muted">{selectedIds.size} recipient{selectedIds.size === 1 ? '' : 's'} selected</div>
            </Card.Header>
            <Card.Body className="p-3 p-md-4">
              <Form.Group className="mb-3">
                <Form.Label className="small fw-semibold d-flex justify-content-between">
                  <span>Subject</span>
                  <span className="text-muted fw-normal">{subject.length}/{MAX_SUBJECT_LENGTH}</span>
                </Form.Label>
                <Form.Control
                  size="sm"
                  placeholder="Enter email subject"
                  value={subject}
                  maxLength={MAX_SUBJECT_LENGTH}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label className="small fw-semibold">CC <span className="text-muted fw-normal">(optional)</span></Form.Label>
                <EmailTagInput value={cc} onChange={setCc} placeholder="Add a CC address and press Enter" />
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label className="small fw-semibold">BCC <span className="text-muted fw-normal">(optional)</span></Form.Label>
                <EmailTagInput value={bcc} onChange={setBcc} placeholder="Add a BCC address and press Enter" />
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label className="small fw-semibold d-flex justify-content-between">
                  <span>Message</span>
                  <span className="text-muted fw-normal">{message.length}/{MAX_MESSAGE_LENGTH}</span>
                </Form.Label>
                <Form.Control
                  as="textarea"
                  rows={9}
                  placeholder="Enter email message"
                  value={message}
                  maxLength={MAX_MESSAGE_LENGTH}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </Form.Group>

              <Button
                variant="primary"
                className="w-100 d-flex align-items-center justify-content-center gap-2"
                onClick={handleSend}
                disabled={!canSend}
              >
                {sending ? (
                  <><Spinner size="sm" animation="border" /> Sending...</>
                ) : (
                  <><FaPaperPlane size={13} /> Send Email {selectedIds.size > 0 && <Badge bg="light" text="dark">{selectedIds.size}</Badge>}</>
                )}
              </Button>
              {selectedIds.size === 0 && (
                <div className="small text-muted mt-2 text-center">Select at least one recipient to enable sending.</div>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
}
