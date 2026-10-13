import React, { useState } from 'react';
import { FaCheckCircle, FaChevronRight, FaLock } from 'react-icons/fa';
import { QA } from './quickAccessTheme';

// Interactive poll rendering shared by PostsDrawer's FeedPost and PostComposerCard's PostCard —
// previously each rendered its own static, non-clickable list of poll options independently.
// All vote counts/percentages come from `post.poll` (server-computed, see postsRoutes.js
// decoratePoll) — this component never calculates or trusts a percentage itself.
export default function PollWidget({ post, onVote, onViewDetails }) {
  const [justVoted, setJustVoted] = useState(false);
  const [voting, setVoting] = useState(false);

  if (post.post_type !== 'poll') return null;
  const poll = post.poll;
  if (!poll || !Array.isArray(poll.options)) return null; // pre-migration post: nothing to vote on yet

  const isClosed   = poll.status === 'closed';
  const hasVoted   = poll.my_vote !== null && poll.my_vote !== undefined;
  const voteLocked = hasVoted && poll.settings?.allowVoteChange === false;
  const myOption   = hasVoted ? poll.options.find(o => o.index === poll.my_vote) : null;

  const handleClick = async (e, index) => {
    e.stopPropagation();
    if (voting || isClosed) return;
    if (hasVoted && poll.my_vote === index) return; // already your vote — no-op
    if (voteLocked) return;
    setVoting(true);
    try {
      await onVote(index);
      setJustVoted(true);
      setTimeout(() => setJustVoted(false), 2200);
    } finally {
      setVoting(false);
    }
  };

  return (
    <div style={{ marginTop: 8 }} onClick={e => e.stopPropagation()}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: isClosed ? QA.danger : QA.success }}>
          {isClosed ? '🔴 Poll Closed' : '🟢 Poll Active'}
        </span>
        {voteLocked && (
          <span style={{ fontSize: 10, color: QA.textMuted, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <FaLock size={8} /> Vote locked
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {poll.options.map(opt => {
          const selected  = poll.my_vote === opt.index;
          const clickable = !isClosed && !voting && (!voteLocked || selected);
          return (
            <div
              key={opt.index}
              onClick={e => clickable && handleClick(e, opt.index)}
              title={!clickable && !selected ? (isClosed ? 'This poll is closed' : 'Vote changes are not allowed for this poll') : undefined}
              style={{
                position: 'relative', padding: '9px 12px', borderRadius: 12, overflow: 'hidden',
                border: `1.5px solid ${selected ? QA.primary : QA.border}`,
                background: selected ? QA.primaryLight : '#fff',
                cursor: clickable ? 'pointer' : 'default',
                transition: 'border-color 0.15s, background 0.15s',
              }}
              onMouseEnter={e => { if (clickable && !selected) e.currentTarget.style.borderColor = QA.primary; }}
              onMouseLeave={e => { if (clickable && !selected) e.currentTarget.style.borderColor = QA.border; }}
            >
              {poll.results_visible && (
                <div style={{
                  position: 'absolute', top: 0, bottom: 0, left: 0, width: `${opt.percentage}%`,
                  background: selected ? 'rgba(124,58,237,0.14)' : 'rgba(107,114,128,0.08)',
                  transition: 'width 0.4s ease', zIndex: 0,
                }} />
              )}
              <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: selected ? QA.primary : QA.textDark, display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                  {selected
                    ? <FaCheckCircle size={13} color={QA.primary} style={{ flexShrink: 0 }} />
                    : <span style={{ width: 13, height: 13, borderRadius: '50%', border: `1.5px solid ${QA.border}`, display: 'inline-block', flexShrink: 0 }} />}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{opt.text}</span>
                </span>
                {poll.results_visible && (
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: selected ? QA.primary : QA.textMuted, flexShrink: 0 }}>{opt.percentage}%</span>
                )}
              </div>
              {poll.results_visible && (
                <div style={{ fontSize: 10, color: QA.textMuted, marginTop: 3, position: 'relative', zIndex: 1 }}>
                  {opt.count} vote{opt.count === 1 ? '' : 's'}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {hasVoted && myOption && (
        <div style={{ fontSize: 11, color: QA.textMuted, marginTop: 6 }}>
          Your vote: <strong style={{ color: QA.primary }}>{myOption.text}</strong>
        </div>
      )}

      <div className="hrms-responsive-toolbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, gap: 8 }}>
        <span style={{ fontSize: 11, color: QA.textMuted }}>
          {justVoted
            ? <span style={{ color: QA.success, fontWeight: 700 }}>✓ Vote recorded</span>
            : poll.results_visible
              ? `Total votes: ${poll.total_votes}`
              : (!isClosed && !hasVoted ? 'Vote to see results' : `${poll.total_votes} vote${poll.total_votes === 1 ? '' : 's'}`)}
        </span>
        <button
          onClick={e => { e.stopPropagation(); onViewDetails(); }}
          style={{ background: 'none', border: 'none', color: QA.primary, fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}
        >
          View Details <FaChevronRight size={8} />
        </button>
      </div>
    </div>
  );
}
