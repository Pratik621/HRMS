import React, { useEffect, useState } from 'react';
import { Alert, Button, Col, Form, Modal, Row, Spinner } from 'react-bootstrap';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';

const todayIST = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
export default function EmploymentLetterModal({ show, onHide, employee, type }) {
  const [defaults, setDefaults] = useState(null);
  const [form, setForm] = useState({});
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const title = type === 'relieving' ? 'Relieving Letter' : 'Experience Letter';
  useEffect(() => {
    if (!show) return;
    let active = true;
    setDefaults(null); setPreview(null); setMessage(null); setLoading(true);
    axios.get(API_ENDPOINTS.EMPLOYMENT_LETTER_DATA(employee.employee_id)).then(({ data }) => {
      if (!active) return;
      setDefaults(data.defaults);
      setForm({ type, issueDate: todayIST(), lastWorkingDate: '', relievingDate: '', designation: data.defaults.designation,
        joiningDate: data.defaults.joiningDate, signatoryName: data.defaults.signatoryName,
        signatoryDesignation: data.defaults.signatoryDesignation, pronouns: data.defaults.pronouns, includeStamp: true });
    }).catch(error => { if (active) setMessage({ variant: 'danger', text: error.response?.data?.message || 'Unable to load employee details.' }); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [show, employee.employee_id, type]);
  useEffect(() => () => { if (preview?.url) URL.revokeObjectURL(preview.url); }, [preview]);
  const change = (key, value) => { setForm(old => ({ ...old, [key]: value })); setPreview(null); setMessage(null); };
  const generate = async event => {
    event.preventDefault(); setBusy(true); setMessage(null);
    try {
      const { data } = await axios.post(API_ENDPOINTS.EMPLOYMENT_LETTER_PREVIEW(employee.employee_id), form);
      const bytes = Uint8Array.from(atob(data.pdfBase64), character => character.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      setPreview({ url, filename: data.filename, token: data.previewToken });
    } catch (error) { setMessage({ variant: 'danger', text: error.response?.data?.message || 'Unable to generate letter.' }); }
    finally { setBusy(false); }
  };
  const email = async () => {
    if (!window.confirm('Email this ' + title.toLowerCase() + ' as a PDF to ' + defaults.email + '?')) return;
    setBusy(true); setMessage(null);
    try {
      const { data } = await axios.post(API_ENDPOINTS.EMPLOYMENT_LETTER_SEND(employee.employee_id), { previewToken: preview.token });
      setMessage({ variant: 'success', text: data.message });
    } catch (error) { setMessage({ variant: 'danger', text: error.response?.data?.message || 'Unable to send letter.' }); }
    finally { setBusy(false); }
  };
  const field = (key, label, inputType = 'text', extra = {}) => <Col xs={12} md={6} key={key}><Form.Group controlId={'letter-' + key} className="mb-3">
    <Form.Label>{label}</Form.Label><Form.Control type={inputType} value={form[key] || ''} onChange={event => change(key, event.target.value)} disabled={busy} required {...extra} />
  </Form.Group></Col>;
  return <Modal show={show} onHide={busy ? undefined : onHide} size="lg" centered backdrop={busy ? 'static' : true} keyboard={!busy}>
    <Modal.Header closeButton={!busy}><Modal.Title>{title} — {employee.employee_id}</Modal.Title></Modal.Header>
    <Modal.Body>
      {message && <Alert variant={message.variant} role="status">{message.text}</Alert>}
      {loading ? <div className="text-center p-4"><Spinner animation="border" /></div> : defaults && <>
        <div className="p-3 mb-3 rounded" style={{ background: '#f8fafc', border: '1px solid #e5eaf0' }}>
          <strong>{defaults.name}</strong><div>{defaults.company} · Joined: {defaults.joiningDate || 'Missing in profile'}</div>
          <small>Email delivery: {defaults.email || 'Add the employee email in their profile to enable sending'}</small>
        </div>
        <Form onSubmit={generate} id="employment-letter-form"><Row>
          {!defaults.joiningDate && field('joiningDate', 'Joining date', 'date')}
          {field('designation', 'Designation', 'text', { maxLength: 150 })}
          {field('issueDate', 'Letter issue date', 'date')}
          {field('lastWorkingDate', 'Last working date', 'date', { min: form.joiningDate })}
          {type === 'relieving' && field('relievingDate', 'Relieving effective date', 'date', { min: form.lastWorkingDate })}
          {field('signatoryName', 'Authorized signatory name', 'text', { maxLength: 150 })}
          {field('signatoryDesignation', 'Signatory designation', 'text', { maxLength: 150 })}
          <Col xs={12} md={6}><Form.Group className="mb-3" controlId="letter-pronouns"><Form.Label>Pronouns in the letter</Form.Label><Form.Select value={form.pronouns || 'they'} onChange={event => change('pronouns', event.target.value)} disabled={busy}><option value="he">He / him</option><option value="she">She / her</option><option value="they">They / them</option></Form.Select></Form.Group></Col>
        </Row><Form.Check id="letter-stamp" className="mb-3" label="Include company stamp" checked={Boolean(form.includeStamp)} onChange={event => change('includeStamp', event.target.checked)} disabled={busy} /></Form>
        {preview && <><Alert variant="info">Review the PDF before downloading or emailing. Changing details requires a new preview.</Alert><iframe title={title + ' PDF preview'} src={preview.url} style={{ width: '100%', height: 'min(55vh, 500px)', border: '1px solid #e5eaf0', borderRadius: 8 }} /></>}
      </>}
    </Modal.Body>
    <Modal.Footer>
      <Button variant="outline-secondary" onClick={onHide} disabled={busy}>Close</Button>
      <Button type="submit" form="employment-letter-form" disabled={busy || loading || !defaults}>{busy ? <Spinner size="sm" animation="border" /> : 'Generate PDF Preview'}</Button>
      {preview && <Button as="a" href={preview.url} download={preview.filename} variant="outline-primary" aria-disabled={busy}>Download PDF</Button>}
      <Button variant="success" onClick={email} disabled={!preview || busy || !defaults?.email}>Email to Employee</Button>
    </Modal.Footer>
  </Modal>;
}
