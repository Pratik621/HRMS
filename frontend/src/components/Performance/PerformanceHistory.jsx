// src/components/Performance/PerformanceHistory.jsx
import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Badge, Spinner, Alert } from 'react-bootstrap';
import {
  FaStar, FaRegStar, FaChartLine, FaCalendarAlt,
  FaUserTie, FaHistory, FaInfoCircle, FaArrowLeft,
} from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';
import { useAuth } from '../../context/AuthContext';
import './Performance.css';

const RATING_LABELS = {
  5: 'Excellent Performer',
  4: 'Very Good Performer',
  3: 'Meets Expectations',
  2: 'Performance Improvement Plan (PIP)',
  1: 'Termination Recommended',
};

const RATING_COLORS = {
  5: '#168a70',
  4: '#52718c',
  3: '#8a702c',
  2: '#c05621',
  1: '#c53030',
};

const getRatingLabel = (r) => RATING_LABELS[r] || '—';
const getRatingColor = (r) => RATING_COLORS[r] || '#94a3b8';

const getRoleRatedText = (role) => {
  const r = (role || '').toLowerCase();
  if (r === 'admin') return 'Admin rated you';
  if (r === 'sub_admin') return 'Manager rated you';
  if (r === 'manager') return 'Team Leader rated you';
  return 'Supervisor rated you';
};

const Stars = ({ rating, size = 18 }) => (
  <span style={{ display: 'inline-flex', gap: 2 }}>
    {[1, 2, 3, 4, 5].map(n => (
      <span key={n} style={{ color: n <= rating ? getRatingColor(rating) : '#d1d5db', fontSize: size }}>
        {n <= rating ? <FaStar /> : <FaRegStar />}
      </span>
    ))}
  </span>
);

const PerformanceHistory = () => {
  const { user }                      = useAuth();
  const navigate                      = useNavigate();
  const [reviews,  setReviews]        = useState([]);
  const [loading,  setLoading]        = useState(true);
  const [error,    setError]          = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        // Fetch from both systems in parallel
        const [newRes, oldRes] = await Promise.allSettled([
          axios.get(API_ENDPOINTS.PERFORMANCE_MY_HISTORY),
          user?.employeeId
            ? axios.get(`${API_ENDPOINTS.RATINGS}/employee/${user.employeeId}/history`)
            : Promise.reject('no id'),
        ]);

        // New performance_reviews records
        const newReviews = newRes.status === 'fulfilled'
          ? (newRes.value.data.reviews || [])
          : [];

        // Old employee_ratings records — normalise to same shape
        let oldReviews = [];
        if (oldRes.status === 'fulfilled' && oldRes.value.data.success) {
          const d = oldRes.value.data;
          const allOld = [
            ...(d.manager_ratings || []).map(r => ({ ...r, _role: 'manager' })),
            ...(d.admin_ratings   || []).map(r => ({ ...r, _role: 'admin'   })),
          ];
          oldReviews = allOld.map((r, i) => ({
            id: `legacy_${i}`,
            rating: r.rating,
            month_name: r.month_name,
            review_year: r.year,
            reviewer_name: r.rater_name || 'Supervisor',
            reviewer_role: r._role,
            remarks: r.comments || '',
            created_at: r.created_at,
            source: 'legacy',
          }));
        }

        const combined = [...newReviews, ...oldReviews].sort((a, b) => {
          if (b.review_year !== a.review_year) return b.review_year - a.review_year;
          const mA = new Date(`${a.month_name} 1`).getMonth();
          const mB = new Date(`${b.month_name} 1`).getMonth();
          if (mB !== mA) return mB - mA;
          return new Date(b.created_at || 0) - new Date(a.created_at || 0);
        });

        setReviews(combined);
      } catch (e) {
        setError('Failed to load reviews');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user?.employeeId]);

  const latest    = reviews[0] || null;
  const avgRating = reviews.length > 0
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
    : null;

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
        <Spinner animation="border" variant="primary" />
      </div>
    );
  }

  return (
    <div className="performance-page p-3 p-md-4">
      <header className="performance-header">
        <div><span className="performance-eyebrow">EMPLOYEE WORKSPACE</span><h1>My Performance</h1><p>{user?.name || user?.employeeId} · {reviews.length} review{reviews.length !== 1 ? 's' : ''}</p></div>
        <div className="performance-header-actions">

          <button type="button" className="performance-back" onClick={() => navigate(-1)}><FaArrowLeft size={12} /> Back</button>
        </div>
      </header>

      {error && <Alert variant="danger">{error}</Alert>}

      {/* ── Summary cards ── */}
      {reviews.length > 0 && (
        <Row className="g-3 mb-4">
          <Col xs={12} sm={4}>
            <SummaryCard
              icon={<FaStar size={18} color="#eab308" />}
              label="Latest Rating"
              value={latest ? `${latest.rating} / 5` : '—'}
              sub={latest ? getRatingLabel(latest.rating) : ''}
              color={latest ? getRatingColor(latest.rating) : '#94a3b8'}
            />
          </Col>
          <Col xs={12} sm={4}>
            <SummaryCard
              icon={<FaChartLine size={18} color="#1f4e79" />}
              label="Overall Average"
              value={avgRating ? `${avgRating} / 5` : '—'}
              sub={avgRating ? getRatingLabel(Math.round(Number(avgRating))) : ''}
              color="#1f4e79"
            />
          </Col>
          <Col xs={12} sm={4}>
            <SummaryCard
              icon={<FaHistory size={18} color="#52718c" />}
              label="Total Reviews"
              value={reviews.length}
              sub="All time"
              color="#52718c"
            />
          </Col>
        </Row>
      )}

      {/* ── History ── */}
      {reviews.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '70px 20px',
          background: '#f8fafc', borderRadius: 14, border: '1px dashed #e2e8f0',
        }}>
          <FaInfoCircle size={44} style={{ color: '#cbd5e1', marginBottom: 14 }} />
          <h5 style={{ color: '#64748b', fontWeight: 600 }}>No Performance Review Available Yet</h5>
          <p style={{ color: '#94a3b8', fontSize: 13, margin: 0 }}>
            Your performance reviews will appear here once submitted by your supervisor.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {reviews.map((r, i) => (
            <ReviewCard key={r.id} review={r} isLatest={i === 0} />
          ))}
        </div>
      )}
    </div>
  );
};

const SummaryCard = ({ icon, label, value, sub, color }) => (
  <Card style={{ borderRadius: 12, border: `1px solid ${color}30`, background: `${color}08` }}>
    <Card.Body style={{ padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        {icon}
        <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>{label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color, fontWeight: 500, marginTop: 4 }}>{sub}</div>}
    </Card.Body>
  </Card>
);

const ReviewCard = ({ review, isLatest }) => {
  const color = getRatingColor(review.rating);

  return (
    <Card style={{
      borderRadius: 14,
      border: `1px solid ${isLatest ? color + '60' : '#e2e8f0'}`,
      background: isLatest ? `${color}06` : '#fff',
    }}>
      <Card.Body style={{ padding: '20px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              padding: '4px 10px', borderRadius: 20,
              background: `${color}18`, color,
              fontSize: 12, fontWeight: 700,
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <FaCalendarAlt size={10} />
              {review.month_name} {review.review_year}
            </div>
            {isLatest && (
              <Badge style={{ background: color, fontSize: 10 }}>Latest</Badge>
            )}
          </div>

          <div style={{ textAlign: 'right' }}>
            <Stars rating={review.rating} size={18} />
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
              {review.rating} / 5
            </div>
          </div>
        </div>

        {/* Rating label */}
        <div style={{
          fontSize: 16, fontWeight: 700, color,
          marginBottom: 12,
        }}>
          {getRatingLabel(review.rating)}
        </div>

        {/* Reviewer */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 12, color: '#64748b', marginBottom: review.remarks ? 12 : 0,
        }}>
          <FaUserTie size={11} />
          <span>
            <strong style={{ color: '#374151' }}>{getRoleRatedText(review.reviewer_role)}</strong>
            {review.reviewer_name && <span style={{ color: '#94a3b8' }}> — {review.reviewer_name}</span>}
          </span>
        </div>

        {/* Remarks */}
        {review.remarks && (
          <div style={{
            background: '#f1f5f9', borderRadius: 8, padding: '10px 14px',
            fontSize: 13, color: '#475569', fontStyle: 'italic',
            borderLeft: `3px solid ${color}`,
          }}>
            "{review.remarks}"
          </div>
        )}
      </Card.Body>
    </Card>
  );
};

export default PerformanceHistory;
