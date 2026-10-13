import React, { useState, useEffect, useCallback } from 'react';
import { Offcanvas, Spinner } from 'react-bootstrap';
import { FaTimes, FaSearch, FaLock } from 'react-icons/fa';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';
import Avatar from './Avatar';
import { QA } from './quickAccessTheme';

// Right-side drawer for "View Details" on a poll — results + (permission-gated) voter list.
// Follows the same Offcanvas pattern established by TicketList.jsx's ticket drawer (scoped CSS
// class, same width breakpoints) rather than PostsDrawer.jsx's older hand-rolled fixed-div
// drawer, since this is a fresh purpose-built analytics panel.
const POLL_DRAWER_CSS = `
  .poll-drawer.offcanvas.offcanvas-end {
    width: 680px;
    transition: transform 280ms ease-in-out;
  }
  @media (max-width: 1024px) and (min-width: 577px) {
    .poll-drawer.offcanvas.offcanvas-end { width: 85vw; }
  }
  @media (max-width: 576px) {
    .poll-drawer.offcanvas.offcanvas-end { width: 100vw; }
  }
  .poll-drawer-backdrop.offcanvas-backdrop.show {
    opacity: 0.18 !important;
    backdrop-filter: blur(2px);
  }
  .poll-drawer .offcanvas-body { padding: 0; overflow: hidden; }
`;

const fmtDateTime = (iso) => new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });

export default function PollDetailsDrawer({ show, onHide, postId }) {
  const [loading, setLoading]   = useState(false);
  const [data, setData]         = useState(null);
  const [error, setError]       = useState('');
  const [search, setSearch]     = useState('');
  const [optionFilter, setOptionFilter] = useState('all');
  const [deptFilter, setDeptFilter]     = useState('all');

  const load = useCallback(() => {
    if (!postId) return;
    setLoading(true);
    setError('');
    const params = {};
    if (optionFilter !== 'all') params.option = optionFilter;
    if (deptFilter !== 'all') params.department = deptFilter;
    if (search.trim()) params.search = search.trim();
    axios.get(API_ENDPOINTS.POST_POLL_VOTERS(postId), { params })
      .then(res => { if (res.data?.success) setData(res.data); })
      .catch(err => setError(err.response?.data?.message || 'Failed to load poll results'))
      .finally(() => setLoading(false));
  }, [postId, optionFilter, deptFilter, search]);

  useEffect(() => { if (show) load(); }, [show, load]);
  useEffect(() => { if (!show) { setData(null); setSearch(''); setOptionFilter('all'); setDeptFilter('all'); } }, [show]);

  const poll   = data?.poll;
  const voters = data?.voters || [];
  const departments = [...new Set((data?.voters || []).map(v => v.department).filter(Boolean))].sort();

  // Group filtered voters by option — matches the "VOTERS grouped under each option" layout.
  const groups = poll ? poll.options.map(opt => ({
    ...opt,
    voters: voters.filter(v => v.option_index === opt.index),
  })).filter(g => optionFilter === 'all' || g.index === Number(optionFilter)) : [];

  return (
    <>
      <style>{POLL_DRAWER_CSS}</style>
      <Offcanvas show={show} onHide={onHide} placement="end" className="poll-drawer" backdropClassName="poll-drawer-backdrop" aria-label="Poll results">
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Header */}
          <div style={{ flexShrink: 0, background: '#1e2a3e', color: '#fff', padding: '16px 22px' }}>
            <div className="hrms-responsive-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.7, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>Poll Results</div>
                <div style={{ fontSize: 15.5, fontWeight: 700, wordBreak: 'break-word' }}>{poll?.question || '…'}</div>
              </div>
              <button onClick={onHide} aria-label="Close" style={{ background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', width: 30, height: 30, borderRadius: 8, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FaTimes size={13} />
              </button>
            </div>
            {poll && (
              <div style={{ fontSize: 11.5, opacity: 0.75, marginTop: 8, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <span>{poll.status === 'closed' ? '🔴 Closed' : '🟢 Active'}</span>
                <span>By {poll.created_by}</span>
                <span>{fmtDateTime(poll.created_at)}</span>
              </div>
            )}
          </div>

          {/* Body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px', background: '#f8fafc' }}>
            {loading && !data ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner animation="border" size="sm" /></div>
            ) : error ? (
              <div style={{ textAlign: 'center', padding: 30, color: QA.danger, fontSize: 13 }}>{error}</div>
            ) : !poll ? null : (
              <>
                {/* Totals + participation */}
                <div style={{ display: 'grid', gridTemplateColumns: data.participation ? '1fr 1fr' : '1fr', gap: 10, marginBottom: 18 }}>
                  <div style={{ background: '#fff', borderRadius: 14, border: `1px solid ${QA.border}`, padding: '14px 16px' }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: QA.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>Total Votes</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: QA.textDark }}>{poll.total_votes}</div>
                  </div>
                  {data.participation && (
                    <div style={{ background: '#fff', borderRadius: 14, border: `1px solid ${QA.border}`, padding: '14px 16px' }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: QA.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>Participation</div>
                      <div style={{ fontSize: 24, fontWeight: 800, color: QA.textDark }}>{data.participation.percentage}%</div>
                      <div style={{ fontSize: 11, color: QA.textMuted, marginTop: 2 }}>{data.participation.votes} / {data.participation.eligible} employees</div>
                    </div>
                  )}
                </div>

                {/* Results bars */}
                {!poll.results_visible ? (
                  <div style={{ background: '#fff', borderRadius: 14, border: `1px solid ${QA.border}`, padding: '16px', fontSize: 12.5, color: QA.textMuted, marginBottom: 18, textAlign: 'center' }}>
                    Results are hidden until you vote.
                  </div>
                ) : (
                  <div style={{ background: '#fff', borderRadius: 14, border: `1px solid ${QA.border}`, padding: '14px 16px', marginBottom: 18 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: QA.textMuted, textTransform: 'uppercase', marginBottom: 10 }}>Results</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {poll.options.map(opt => (
                        <div key={opt.index}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, fontWeight: 600, color: QA.textDark, marginBottom: 4 }}>
                            <span>{opt.text}</span>
                            <span style={{ color: QA.primary }}>{opt.count} votes · {opt.percentage}%</span>
                          </div>
                          <div style={{ height: 8, borderRadius: 6, background: '#f1f5f9', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${opt.percentage}%`, background: QA.primary, borderRadius: 6, transition: 'width 0.4s ease' }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Voters */}
                <div style={{ fontSize: 11, fontWeight: 700, color: QA.textMuted, textTransform: 'uppercase', marginBottom: 10 }}>Voters</div>
                {data.voters_restricted ? (
                  <div style={{ background: '#fff', borderRadius: 14, border: `1px solid ${QA.border}`, padding: '20px 16px', textAlign: 'center', color: QA.textMuted, fontSize: 12.5 }}>
                    <FaLock size={16} style={{ marginBottom: 8, opacity: 0.5 }} />
                    <div>Voter details for this poll are private. Only the poll creator and HR/Admin can view who voted for what.</div>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                      <div style={{ position: 'relative', flex: 1, minWidth: 160 }}>
                        <FaSearch size={11} color="#9ca3af" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
                        <input
                          value={search}
                          onChange={e => setSearch(e.target.value)}
                          placeholder="Search voters…"
                          style={{ width: '100%', padding: '7px 10px 7px 28px', borderRadius: 10, border: `1px solid ${QA.border}`, fontSize: 12, outline: 'none', boxSizing: 'border-box' }}
                        />
                      </div>
                      <select value={optionFilter} onChange={e => setOptionFilter(e.target.value)}
                        style={{ padding: '7px 10px', borderRadius: 10, border: `1px solid ${QA.border}`, fontSize: 12, outline: 'none' }}>
                        <option value="all">All Options</option>
                        {poll.options.map(o => <option key={o.index} value={o.index}>{o.text}</option>)}
                      </select>
                      {departments.length > 0 && (
                        <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
                          style={{ padding: '7px 10px', borderRadius: 10, border: `1px solid ${QA.border}`, fontSize: 12, outline: 'none' }}>
                          <option value="all">All Departments</option>
                          {departments.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                      )}
                    </div>

                    {voters.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: 24, color: QA.textMuted, fontSize: 12.5 }}>No voters match your filters.</div>
                    ) : (
                      groups.map(g => g.voters.length > 0 && (
                        <div key={g.index} style={{ marginBottom: 16 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: QA.primary, marginBottom: 8 }}>
                            {g.text} <span style={{ color: QA.textMuted, fontWeight: 500 }}>({g.voters.length} voter{g.voters.length === 1 ? '' : 's'})</span>
                          </div>
                          <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${QA.border}`, overflow: 'hidden' }}>
                            {g.voters.map((v, i) => (
                              <div key={v.employee_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderBottom: i < g.voters.length - 1 ? `1px solid ${QA.border}` : 'none' }}>
                                <Avatar photo={v.profile_image} id={v.employee_id} firstName={v.name?.split(' ')[0]} lastName={v.name?.split(' ')[1]} size={30} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 12.5, fontWeight: 600, color: QA.textDark }}>{v.name}</div>
                                  <div style={{ fontSize: 10.5, color: QA.textMuted }}>
                                    {[v.department, v.designation].filter(Boolean).join(' · ') || '—'}
                                  </div>
                                </div>
                                <div style={{ fontSize: 10.5, color: QA.textMuted, textAlign: 'right', flexShrink: 0 }}>{fmtDateTime(v.voted_at)}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </Offcanvas>
    </>
  );
}
