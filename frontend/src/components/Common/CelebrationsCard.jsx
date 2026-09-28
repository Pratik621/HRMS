import React, { useState, useEffect, useCallback } from 'react';
import { Modal } from 'react-bootstrap';
import { FaGift, FaBirthdayCake, FaTrophy, FaUserFriends, FaHeart, FaRegHeart, FaCommentDots, FaTrashAlt, FaEllipsisV } from 'react-icons/fa';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';
import { useNotification } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';
import Avatar from './Avatar';
import { QA, QA_ANIMATIONS_CSS } from './quickAccessTheme';

const CAN_MANAGE_CELEBRATIONS = ['admin', 'sub_admin', 'hr'];

// Reference span for the mini progress bar's "how soon" fill — not a data filter
// (the compact row now shows the next people regardless of how far out they are).
const UPCOMING_WINDOW_DAYS = 90;
const UPCOMING_LIMIT = 9;

// NEVER use `new Date().toISOString().split('T')[0]` for "today" — for a viewer in a timezone
// ahead of UTC (e.g. IST, UTC+5:30), that converts to UTC first and can report YESTERDAY's date
// for hours after local midnight. Build the string from local Y/M/D components instead.
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
// Same UTC-midnight parsing pitfall as todayStr — parse "YYYY-MM-DD" by its Y/M/D components
// directly instead of letting `new Date(str)` treat it as UTC.
const parseDateOnly = (str) => {
  if (!str) return null;
  const [y, m, d] = str.split('T')[0].split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
};
const fmtToday = () => new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long' });
const fmtShort = (dateStr) => parseDateOnly(dateStr)?.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) || '';

// Per-tab theming — this app's own palette (purple/amber/emerald), not a copy of
// any external reference design's exact brand colors or illustration assets.
const TAB_THEME = {
  birthdays: {
    label: 'Birthdays',
    icon: FaBirthdayCake,
    accent: '#1F2937',
    light: '#F3F4F6',
    illustration: '🎂',
    floaters: [],
    heroTitle: (name) => <>Happy Birthday, <span style={{ color: '#1F2937' }}>{name}!</span></>,
    actionLabel: 'Send Wishes',
    actionIcon: FaHeart,
    footer: 'Celebrate together and make every birthday memorable.',
    emptyToday: 'No birthdays today',
    emptyIcon: '🎂',
  },

  anniversaries: {
    label: 'Work Anniversaries',
    icon: FaTrophy,
    accent: '#1F2937',
    light: '#F3F4F6',
    illustration: '🏆',
    floaters: [],
    heroTitle: (name) => <>Happy Work Anniversary, <span style={{ color: '#1F2937' }}>{name}!</span></>,
    actionLabel: 'Celebrate',
    actionIcon: FaGift,
    footer: 'Recognizing dedication and celebrating milestones together.',
    emptyToday: 'No work anniversaries today',
    emptyIcon: '🏆',
  },

  new_joiners: {
    label: 'New Joiners',
    icon: FaUserFriends,
    accent: '#1F2937',
    light: '#F3F4F6',
    illustration: '👋',
    floaters: [],
    heroTitle: (name) => <>Welcome Aboard, <span style={{ color: '#1F2937' }}>{name}!</span></>,
    actionLabel: 'Welcome',
    actionIcon: FaUserFriends,
    footer: 'Every new teammate brings fresh ideas and new energy.',
    emptyToday: 'No new joiners today',
    emptyIcon: '👋',
  },
};

const CONFETTI_EMOJI = ['🎉', '🎊', '✨', '🎈', '🎂'];
function ConfettiBurst() {
  return (
    <>
      {Array.from({ length: 10 }).map((_, i) => {
        const angle = (i / 10) * Math.PI * 2;
        const dist = 50 + (i % 3) * 18;
        const x = Math.round(Math.cos(angle) * dist);
        const y = Math.round(Math.sin(angle) * dist - 25);
        return (
          <span key={i} className="qa-confetti-piece" style={{ '--qa-x': `${x}px`, '--qa-y': `${y}px`, animationDelay: `${i * 0.03}s` }}>
            {CONFETTI_EMOJI[i % CONFETTI_EMOJI.length]}
          </span>
        );
      })}
    </>
  );
}

function WishThread({ recipientEmployeeId, recipientName, eventType, accent }) {
  const [wishes, setWishes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [openComments, setOpenComments] = useState({});
  const [comments, setComments] = useState({});
  const [commentInput, setCommentInput] = useState({});

  const fetchWishes = () => {
    setLoading(true);
    axios.get(API_ENDPOINTS.WISHES, { params: { recipient_employee_id: recipientEmployeeId, event_date: todayStr(), event_type: eventType } })
      .then(res => { if (res.data?.success) setWishes(res.data.wishes || []); })
      .catch(() => { })
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchWishes(); }, [recipientEmployeeId, eventType]); // eslint-disable-line react-hooks/exhaustive-deps

  const submitWish = async () => {
    if (!message.trim()) return;
    setSending(true);
    setError('');
    try {
      const res = await axios.post(API_ENDPOINTS.WISHES, {
        recipient_employee_id: recipientEmployeeId,
        recipient_name: recipientName,
        event_type: eventType,
        message: message.trim(),
      });
      if (res.data?.success) {
        setMessage('');
        fetchWishes();
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send wish');
    } finally {
      setSending(false);
    }
  };

  const toggleLike = async (wishId) => {
    setWishes(prev => prev.map(w => w.id === wishId
      ? { ...w, liked_by_me: !w.liked_by_me, like_count: w.like_count + (w.liked_by_me ? -1 : 1) }
      : w));
    try {
      await axios.patch(API_ENDPOINTS.WISH_LIKE(wishId));
    } catch {
      fetchWishes();
    }
  };

  const toggleComments = (wishId) => {
    setOpenComments(prev => ({ ...prev, [wishId]: !prev[wishId] }));
    if (!comments[wishId]) {
      axios.get(API_ENDPOINTS.WISH_COMMENTS(wishId))
        .then(res => setComments(prev => ({ ...prev, [wishId]: res.data?.comments || [] })))
        .catch(() => { });
    }
  };

  const submitComment = async (wishId) => {
    const text = (commentInput[wishId] || '').trim();
    if (!text) return;
    try {
      const res = await axios.post(API_ENDPOINTS.WISH_COMMENTS(wishId), { comment: text });
      if (res.data?.success) {
        setComments(prev => ({ ...prev, [wishId]: [...(prev[wishId] || []), res.data.comment] }));
        setCommentInput(prev => ({ ...prev, [wishId]: '' }));
        setWishes(prev => prev.map(w => w.id === wishId ? { ...w, comment_count: (w.comment_count || 0) + 1 } : w));
      }
    } catch { /* silent */ }
  };

  return (
    <div style={{ marginTop: 14, borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: 12 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder={`Write a message for ${recipientName || 'them'}…`}
          style={{ flex: 1, padding: '8px 12px', borderRadius: 10, border: `1px solid ${QA.border}`, fontSize: 12, outline: 'none', background: '#fff' }}
          onKeyDown={e => { if (e.key === 'Enter') submitWish(); }}
        />
        <button onClick={submitWish} disabled={sending || !message.trim()}
          style={{ padding: '8px 16px', borderRadius: 10, border: 'none', background: accent, color: '#fff', fontSize: 12, fontWeight: 700, cursor: sending || !message.trim() ? 'not-allowed' : 'pointer', opacity: sending || !message.trim() ? 0.6 : 1 }}>
          {sending ? '…' : 'Send'}
        </button>
      </div>
      {error && <div style={{ fontSize: 11, color: QA.danger, marginBottom: 8 }}>{error}</div>}
      {loading ? (
        <div style={{ fontSize: 11, color: QA.textMuted }}>Loading wishes…</div>
      ) : wishes.length === 0 ? (
        <div style={{ fontSize: 11, color: QA.textMuted }}>No wishes yet — be the first!</div>
      ) : wishes.map(w => (
        <div key={w.id} style={{ padding: '8px 0', borderTop: '1px solid rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: 12, color: QA.textDark }}><strong>{w.sender_name}</strong> {w.message}</div>
          <div style={{ display: 'flex', gap: 14, marginTop: 4 }}>
            <button onClick={() => toggleLike(w.id)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: w.liked_by_me ? QA.danger : QA.textMuted, fontSize: 11, padding: 0 }}>
              {w.liked_by_me ? <FaHeart size={11} /> : <FaRegHeart size={11} />} {w.like_count > 0 ? w.like_count : 'Like'}
            </button>
            <button onClick={() => toggleComments(w.id)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: QA.textMuted, fontSize: 11, padding: 0 }}>
              <FaCommentDots size={11} /> {w.comment_count > 0 ? w.comment_count : 'Comment'}
            </button>
          </div>
          {openComments[w.id] && (
            <div style={{ marginTop: 6, paddingLeft: 10, borderLeft: '2px solid rgba(0,0,0,0.08)' }}>
              {(comments[w.id] || []).map(c => (
                <div key={c.id} style={{ fontSize: 11, color: QA.textDark, marginBottom: 4 }}>
                  <strong>{c.commenter_name}</strong> {c.comment}
                </div>
              ))}
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <input
                  value={commentInput[w.id] || ''}
                  onChange={e => setCommentInput(prev => ({ ...prev, [w.id]: e.target.value }))}
                  placeholder="Write a comment…"
                  style={{ flex: 1, padding: '5px 8px', borderRadius: 6, border: `1px solid ${QA.border}`, fontSize: 11, outline: 'none' }}
                  onKeyDown={e => { if (e.key === 'Enter') submitComment(w.id); }}
                />
                <button onClick={() => submitComment(w.id)}
                  style={{ padding: '5px 10px', borderRadius: 6, border: 'none', background: '#f3f4f6', color: QA.textDark, fontSize: 11, cursor: 'pointer' }}>
                  Post
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function HeroCard({ theme, person, eventType, expanded, confetti, onAction, onHide, hiding }) {
  const name = person.first_name;
  const suffix = eventType === 'anniversary' ? `${person.years} Year${person.years === 1 ? '' : 's'}` : null;

  return (
    <div className="qa-fade-in celebrations-hero" style={{
      position: 'relative', overflow: 'hidden', borderRadius: 20, padding: 20,
      background: theme.light, display: 'grid', gridTemplateColumns: '1fr 140px', gap: 16, alignItems: 'center',
    }}>
      {onHide && (
        <button
          onClick={onHide}
          disabled={hiding}
          title={`Remove ${person.first_name} from celebrations`}
          style={{
            position: 'absolute', top: 12, right: 12, zIndex: 2, width: 26, height: 26, borderRadius: '50%',
            border: 'none', background: 'rgba(255,255,255,0.85)', color: QA.danger, cursor: hiding ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: hiding ? 0.5 : 1,
          }}
        >
          <FaTrashAlt size={11} />
        </button>
      )}
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <Avatar photo={person.profile_image} id={person.employee_id} firstName={person.first_name} lastName={person.last_name} size={58} />
            <div style={{ position: 'absolute', bottom: -4, right: -4, width: 22, height: 22, borderRadius: '50%', background: theme.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, border: '2px solid #fff' }}>
              {theme.illustration}
            </div>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: QA.textDark, lineHeight: 1.3 }}>{theme.heroTitle(name)}</div>
            <div style={{ fontSize: 12, color: QA.textMuted, marginTop: 2 }}>{person.position || person.designation}</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          {suffix && (
            <span style={{ fontSize: 11, fontWeight: 700, color: theme.accent, background: '#fff', borderRadius: 20, padding: '3px 10px' }}>⭐ {suffix}</span>
          )}
          <span style={{ fontSize: 11, fontWeight: 600, color: QA.textMuted, background: '#fff', borderRadius: 20, padding: '3px 10px' }}>📅 Today, {fmtToday()}</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: QA.textMuted, background: '#fff', borderRadius: 20, padding: '3px 10px' }}>👤 From {person.department || 'the'} Team</span>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', position: 'relative' }}>
          {confetti && <ConfettiBurst />}
          <button onClick={onAction}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 20, border: 'none', cursor: 'pointer',
              background: expanded ? theme.accent : theme.accent, color: '#fff', fontSize: 12, fontWeight: 700,
              opacity: expanded ? 0.85 : 1,
            }}>
            <theme.actionIcon size={11} /> {theme.actionLabel}
          </button>
          <button onClick={onAction} title="Comment" style={{ width: 32, height: 32, borderRadius: '50%', border: `1px solid ${QA.border}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.accent }}>
            <FaCommentDots size={12} />
          </button>
        </div>

        {expanded && (
          <WishThread recipientEmployeeId={person.employee_id} recipientName={`${person.first_name} ${person.last_name}`} eventType={eventType} accent={theme.accent} />
        )}
      </div>

      {/* Decorative illustration side */}
      <div style={{ position: 'relative', height: 110, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 68, filter: 'drop-shadow(0 6px 10px rgba(0,0,0,0.12))' }}>{theme.illustration}</div>
        {theme.floaters.map((f, i) => (
          <span key={i} style={{
            position: 'absolute', fontSize: 18, opacity: 0.8,
            top: `${10 + i * 30}%`, left: i % 2 === 0 ? '5%' : '78%',
          }}>{f}</span>
        ))}
      </div>
    </div>
  );
}

function EmptyToday({ theme }) {
  return (
    <div
      className="celebrations-empty"
      style={{
        textAlign: 'center',
        padding: '22px 0',
        color: QA.textMuted,
        background: theme.light,
        borderRadius: 20,
      }}
    >
      <div style={{ fontSize: 34, marginBottom: 6 }}>{theme.emptyIcon}</div>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{theme.emptyToday}</div>
    </div>
  );
}

function UpcomingRow({ theme, people, showViewAllTile, onViewAll, eventType, canManage, onHide, hidingId }) {
  // The View All tile takes the last slot itself.
  const peopleSlots = showViewAllTile ? UPCOMING_LIMIT - 1 : UPCOMING_LIMIT;
  const shown = people.slice(0, peopleSlots);
  const isNewJoiner = eventType === 'new_joiner';
  const [openMenuId, setOpenMenuId] = useState(null);

  return (
    <div className="qa-scroll-x celebrations-upcoming-scroll">
      {shown.map(p => {
        const daysAgo = isNewJoiner && p.joining_date
          ? Math.round(
              (new Date().setHours(0, 0, 0, 0) -
                parseDateOnly(p.joining_date).getTime()) / 86400000
            )
          : null;

        const pct = isNewJoiner
          ? 100
          : Math.max(
              8,
              Math.round(
                ((UPCOMING_WINDOW_DAYS - p.days_until) /
                  UPCOMING_WINDOW_DAYS) * 100
              )
            );

        const menuOpen = openMenuId === p.employee_id;

        return (
          <div
            key={p.employee_id}
            className="celebration-person-card"
            style={{
              position: 'relative',
              width: 142,
              flexShrink: 0,
              boxSizing: 'border-box',
              padding: '10px',
              borderRadius: 12,
              background: '#f9fafb',
            }}
          >
            {canManage && (
              <div style={{ position: 'absolute', top: 6, right: 6, zIndex: 3 }}>
                <button
                  onClick={() =>
                    setOpenMenuId(menuOpen ? null : p.employee_id)
                  }
                  title="More options"
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    border: 'none',
                    background: 'rgba(255,255,255,0.9)',
                    color: QA.textMuted,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <FaEllipsisV size={10} />
                </button>

                {menuOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 24,
                      right: 0,
                      background: '#fff',
                      border: `1px solid ${QA.border}`,
                      borderRadius: 8,
                      boxShadow: '0 4px 14px rgba(0,0,0,0.14)',
                      minWidth: 168,
                      overflow: 'hidden',
                    }}
                  >
                    <button
                      onClick={() => {
                        setOpenMenuId(null);
                        onHide(p);
                      }}
                      disabled={hidingId === p.employee_id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        width: '100%',
                        padding: '8px 10px',
                        background: 'none',
                        border: 'none',
                        textAlign: 'left',
                        fontSize: 11,
                        fontWeight: 600,
                        color: QA.danger,
                        cursor:
                          hidingId === p.employee_id
                            ? 'not-allowed'
                            : 'pointer',
                      }}
                    >
                      <FaTrashAlt size={10} />
                      Hide from celebrations
                    </button>
                  </div>
                )}
              </div>
            )}

            <Avatar
              photo={p.profile_image}
              id={p.employee_id}
              firstName={p.first_name}
              lastName={p.last_name}
              size={34}
            />

            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: QA.textDark,
                marginTop: 6,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={`${p.first_name} ${p.last_name}`}
            >
              {p.first_name} {p.last_name}
            </div>

            <div style={{ marginTop: 6 }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: theme.accent,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {isNewJoiner
                  ? p.joining_date
                    ? fmtShort(p.joining_date)
                    : ''
                  : p.date
                    ? fmtShort(p.date)
                    : ''}
              </div>

              <div
                style={{
                  fontSize: 9,
                  color: QA.textMuted,
                  marginTop: 1,
                }}
              >
                {isNewJoiner
                  ? daysAgo === 0
                    ? 'Today'
                    : daysAgo === 1
                      ? 'Yesterday'
                      : daysAgo != null
                        ? `${daysAgo} days ago`
                        : ''
                  : p.days_until === 1
                    ? 'Tomorrow'
                    : `in ${p.days_until} days`}
              </div>
            </div>

            <div
              style={{
                height: 4,
                borderRadius: 4,
                background: '#e5e7eb',
                marginTop: 6,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${pct}%`,
                  background: theme.accent,
                  borderRadius: 4,
                }}
              />
            </div>
          </div>
        );
      })}

      {showViewAllTile && (
        <button
          type="button"
          className="celebrations-view-all"
          onClick={onViewAll}
          aria-label="View all celebrations"
          style={{
            width: 132,
            minHeight: 150,
            flexShrink: 0,
            boxSizing: 'border-box',
            padding: '16px 10px',
            borderRadius: 12,

            /* Default: light grayscale */
            background: '#FFFFFF',
            border: '1px solid #D9DEE5',
            color: '#1F2937',

            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',

            boxShadow:
              '0 2px 8px rgba(15, 23, 42, 0.06)',

            transition:
              'background-color 0.2s ease, ' +
              'border-color 0.2s ease, ' +
              'color 0.2s ease, ' +
              'transform 0.2s ease, ' +
              'box-shadow 0.2s ease',
          }}
        >
          {/* Icon circle */}
          <div
            className="celebrations-view-all-icon"
            style={{
              width: 42,
              height: 42,
              borderRadius: '50%',
              background: '#F1F3F5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 10,
              transition:
                'background-color 0.2s ease, color 0.2s ease',
            }}
          >
            <FaUserFriends
              size={17}
              className="celebrations-view-all-icon-svg"
              color="#374151"
            />
          </div>

          {/* Main text */}
          <div
            className="celebrations-view-all-title"
            style={{
              fontSize: 13,
              fontWeight: 800,
              color: '#111827',
              lineHeight: 1.3,
              transition: 'color 0.2s ease',
            }}
          >
            View All
          </div>

          {/* Supporting text */}
          <div
            className="celebrations-view-all-subtitle"
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: '#6B7280',
              marginTop: 4,
              lineHeight: 1.3,
              transition: 'color 0.2s ease',
            }}
          >
            See everyone →
          </div>
        </button>
      )}
    </div>
  );
}

const fmtFull = (dateStr) => parseDateOnly(dateStr)?.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) || '';

function AllUpcomingModal({ show, onClose, theme, eventType }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!show) return;
    let cancelled = false;
    axios.get(API_ENDPOINTS.TODAY_EVENTS_UPCOMING, { params: { all: 'true' } })
      .then(res => {
        if (cancelled) return;
        if (res.data?.success) {
          setList(res.data[eventType === 'birthday' ? 'birthdays' : 'anniversaries'] || []);
        }
      })
      .catch(() => { })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [show, eventType]);

  return (
    <Modal show={show} onHide={onClose} centered scrollable size="lg">
      <Modal.Header closeButton style={{ border: 'none', paddingBottom: 0 }}>
        <Modal.Title style={{ fontSize: 16, fontWeight: 800, color: QA.textDark, display: 'flex', alignItems: 'center', gap: 8 }}>
          <theme.icon size={16} color={theme.accent} />
          All {eventType === 'birthday' ? 'Birthdays' : 'Work Anniversaries'}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body style={{ maxHeight: '65vh' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 20, fontSize: 13, color: QA.textMuted }}>Loading…</div>
        ) : list.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 20, fontSize: 13, color: QA.textMuted }}>
            No upcoming {eventType === 'birthday' ? 'birthdays' : 'work anniversaries'}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
            {list.map(p => (
              <div key={p.employee_id} style={{ padding: 12, borderRadius: 14, background: '#f9fafb', border: '1px solid #f3f4f6', textAlign: 'center' }}>
                <Avatar photo={p.profile_image} id={p.employee_id} firstName={p.first_name} lastName={p.last_name} size={44} />
                <div style={{ fontSize: 12, fontWeight: 700, color: QA.textDark, marginTop: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                  title={`${p.first_name} ${p.last_name}`}>
                  {p.first_name} {p.last_name}
                </div>
                <div style={{ fontSize: 10, color: QA.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                  title={p.position || p.department}>
                  {p.position || p.department}{eventType === 'anniversary' ? ` · ${p.years} yr${p.years === 1 ? '' : 's'}` : ''}
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: theme.accent, marginTop: 6 }}>{fmtFull(p.date)}</div>
                <div style={{ fontSize: 10, color: QA.textMuted }}>
                  {p.days_until === 1 ? 'Tomorrow' : `in ${p.days_until} days`}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal.Body>
    </Modal>
  );
}

export default function CelebrationsCard() {
  const { todayEvents, fetchTodayEvents } = useNotification();
  const { user } = useAuth();
  const canManage = CAN_MANAGE_CELEBRATIONS.includes(user?.role);
  const [expandedId, setExpandedId] = useState(null);
  const [confettiFor, setConfettiFor] = useState(null);
  // null = not manually chosen yet — falls back to whichever tab actually has
  // something today (birthdays > anniversaries > new joiners). Once the user
  // clicks a tab, it's pinned and no longer auto-switches.
  const [tab, setTab] = useState(null);
  const [upcoming, setUpcoming] = useState({ birthdays: [], anniversaries: [], new_joiners: [] });
  const [showAllModal, setShowAllModal] = useState(false);
  const [hidingId, setHidingId] = useState(null);

  // Pull the full-year list (not just the next 14 days) so the compact "Upcoming" row can
  // always show up to UPCOMING_LIMIT people even if none fall in the next couple of weeks —
  // "View All" already used this same all=true request. Extracted so it can be re-run after
  // an admin hides someone, not just once on mount.
  const loadUpcoming = useCallback(() => {
    return axios.get(API_ENDPOINTS.TODAY_EVENTS_UPCOMING, { params: { all: 'true' } })
      .then(res => { if (res.data?.success) setUpcoming(res.data); })
      .catch(() => { });
  }, []);

  useEffect(() => { loadUpcoming(); }, [loadUpcoming]);

  const handleAction = (employeeId) => {
    setExpandedId(prev => prev === employeeId ? null : employeeId);
    setConfettiFor(employeeId);
    setTimeout(() => setConfettiFor(null), 900);
  };

  // Admin/HR-only: suppress one person's celebration going forward (data isn't deleted —
  // sets employees.hide_from_celebrations, enforced server-side in employeeRoutes.js).
  const handleHide = async (person) => {
    if (!window.confirm(`Remove ${person.first_name} ${person.last_name} from celebrations? They won't appear here again until an admin re-enables it.`)) return;
    setHidingId(person.employee_id);
    try {
      await axios.put(API_ENDPOINTS.EMPLOYEE_BY_ID(person.id), { hide_from_celebrations: true });
      await Promise.all([fetchTodayEvents(), loadUpcoming()]);
    } catch {
      alert('Failed to remove from celebrations.');
    } finally {
      setHidingId(null);
    }
  };

  const todayBirthdays = todayEvents?.birthdays || [];
  const todayAnniversaries = todayEvents?.anniversaries || [];
  const todayNewJoiners = (upcoming.new_joiners || []).filter(p => p.joining_date === todayStr());
  const laterNewJoiners = (upcoming.new_joiners || []).filter(p => p.joining_date !== todayStr());

  const autoTab = todayBirthdays.length > 0 ? 'birthdays'
    : todayAnniversaries.length > 0 ? 'anniversaries'
      : todayNewJoiners.length > 0 ? 'new_joiners'
        : 'birthdays';
  const activeTab = tab || autoTab;

  const TABS = [
    { key: 'birthdays', count: todayBirthdays.length },
    { key: 'anniversaries', count: todayAnniversaries.length },
    { key: 'new_joiners', count: todayEvents ? todayNewJoiners.length + laterNewJoiners.length : upcoming.new_joiners.length },
  ];

  const theme = TAB_THEME[activeTab];
  const eventType = activeTab === 'birthdays' ? 'birthday' : activeTab === 'anniversaries' ? 'anniversary' : 'new_joiner';
  const todayPeople = activeTab === 'birthdays' ? todayBirthdays : activeTab === 'anniversaries' ? todayAnniversaries : todayNewJoiners;
  const upcomingPeople = activeTab === 'birthdays' ? upcoming.birthdays : activeTab === 'anniversaries' ? upcoming.anniversaries : laterNewJoiners;

  return (
    <div
      className="qa-hover-lift celebrations-card"
      style={{
        background: '#fff',
        borderRadius: 22,
        border: `1px solid ${QA.border}`,
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        padding: 20,
      }}
    >
      <style>{QA_ANIMATIONS_CSS}</style>

      <div className="celebrations-header">
        <div className="celebrations-title">
          <span className="celebrations-title-icon">🎉</span>
          <span>Celebrations</span>
        </div>
      </div>

      <div className="celebrations-tabs">
        {TABS.map(t => {
          const th = TAB_THEME[t.key];
          const active = activeTab === t.key;
          return (
            <button
              key={t.key}
              className={`celebration-tab ${active ? 'is-active' : ''}`}
              onClick={() => setTab(t.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 20,
                border: active ? 'none' : `1px solid ${QA.border}`, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                background: active ? th.accent : '#fff',
                color: active ? '#fff' : QA.textMuted,
                transition: 'all 0.15s',
                // Carried into CSS so the active pill's accent background survives the
                // `!important` rules in EmployeeDashboard.css (an inline background without
                // !important can't), and so it still matches whichever tab is active.
                '--tab-accent': th.accent,
              }}>
              <th.icon size={11} /> {th.label}
              <span style={{
                fontSize: 10, fontWeight: 800, borderRadius: 10, padding: '1px 7px',
                background: active ? 'rgba(255,255,255,0.25)' : th.light, color: active ? '#fff' : th.accent,
              }}>{t.count}</span>
            </button>
          );
        })}
      </div>

      {todayPeople.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: theme.accent, display: 'inline-block' }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: QA.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Today</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <HeroCard
              theme={theme} person={todayPeople[0]} eventType={eventType}
              expanded={expandedId === todayPeople[0].employee_id}
              confetti={confettiFor === todayPeople[0].employee_id}
              onAction={() => handleAction(todayPeople[0].employee_id)}
              onHide={canManage ? () => handleHide(todayPeople[0]) : null}
              hiding={hidingId === todayPeople[0].employee_id}
            />
            {todayPeople.slice(1).map(p => (
              <div key={p.employee_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px' }}>
                <Avatar photo={p.profile_image} id={p.employee_id} firstName={p.first_name} lastName={p.last_name} size={30} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: QA.textDark }}>{p.first_name} {p.last_name}</div>
                  <div style={{ fontSize: 10, color: QA.textMuted }}>{p.department}</div>
                </div>
                <button onClick={() => handleAction(p.employee_id)}
                  style={{ padding: '5px 12px', borderRadius: 20, border: 'none', background: theme.light, color: theme.accent, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                  {theme.actionLabel}
                </button>
                {canManage && (
                  <button
                    onClick={() => handleHide(p)}
                    disabled={hidingId === p.employee_id}
                    title={`Remove ${p.first_name} from celebrations`}
                    style={{ width: 26, height: 26, borderRadius: '50%', border: 'none', background: '#fef2f2', color: QA.danger, cursor: hidingId === p.employee_id ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: hidingId === p.employee_id ? 0.5 : 1 }}
                  >
                    <FaTrashAlt size={10} />
                  </button>
                )}
                {expandedId === p.employee_id && (
                  <WishThread recipientEmployeeId={p.employee_id} recipientName={`${p.first_name} ${p.last_name}`} eventType={eventType} accent={theme.accent} />
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {todayPeople.length === 0 && upcomingPeople.length === 0 && (
        <EmptyToday theme={theme} />
      )}

      {upcomingPeople.length > 0 && (
        <>
          <div style={{ margin: '16px 0 8px' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: QA.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {activeTab === 'new_joiners' ? 'Joined This Week' : 'Upcoming'}
            </span>
          </div>
          <UpcomingRow
            theme={theme} people={upcomingPeople} eventType={eventType}
            showViewAllTile={activeTab !== 'new_joiners'}
            onViewAll={() => setShowAllModal(true)}
            canManage={canManage} onHide={handleHide} hidingId={hidingId}
          />
        </>
      )}

      <div
        className="celebrations-footer"
        style={{
          marginTop: 16,
          padding: '10px 14px',
          borderRadius: 14,
          background: theme.light,
          color: theme.accent,
          fontSize: 12,
          fontWeight: 600,
          textAlign: 'center',
        }}
      >
        {theme.footer}
      </div>

      {activeTab !== 'new_joiners' && (
        <AllUpcomingModal show={showAllModal} onClose={() => setShowAllModal(false)} theme={theme} eventType={eventType} />
      )}
    </div>
  );
}
