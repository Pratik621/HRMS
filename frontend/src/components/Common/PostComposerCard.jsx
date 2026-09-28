import { dashboardGet } from '../../utils/dashboardGet';
import React, { useState, useEffect } from 'react';
import { FaEdit, FaChartBar, FaAward, FaBullhorn, FaHeart, FaRegHeart, FaCommentDots, FaTimes } from 'react-icons/fa';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';
import Avatar from './Avatar';
import PostsDrawer from './PostsDrawer';
import PollWidget from './PollWidget';
import PollDetailsDrawer from './PollDetailsDrawer';
import { QA, QA_CARD_STYLE } from './quickAccessTheme';

const TABS = [
  { key: 'post', label: 'Post', icon: FaEdit },
  { key: 'poll', label: 'Poll', icon: FaChartBar },
  { key: 'praise', label: 'Praise', icon: FaAward },
  { key: 'announcements', label: 'Announcements', icon: FaBullhorn },
];

const ANNOUNCEMENT_ICON = { announcement: '📢', notice: '📌', warning: '⚠️', holiday: '🎉', policy: '📋', event: '🎊', urgent: '🚨' };

function AnnouncementsList() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    dashboardGet(API_ENDPOINTS.ANNOUNCEMENTS)
      .then(res => { if (!cancelled) setItems(res.data?.announcements || []); })
      .catch(() => { })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div style={{ fontSize: 12, color: QA.textMuted }}>Loading announcements…</div>;
  if (items.length === 0) return <div style={{ fontSize: 12, color: QA.textMuted }}>No announcements yet</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
      {items.map(a => (
        <div key={a.id} style={{ padding: '10px 12px', borderRadius: 10, background: '#f9fafb', border: `1px solid ${QA.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <span>{ANNOUNCEMENT_ICON[a.type] || '📢'}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: QA.textDark }}>{a.title}</span>
          </div>
          <div style={{ fontSize: 12, color: QA.textMuted, lineHeight: 1.4 }}>{a.message}</div>
          <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>
            {new Date(a.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
          </div>
        </div>
      ))}
    </div>
  );
}

function PostCard({ post, onLikeToggle, onVote, onViewPollDetails }) {
  const [openComments, setOpenComments] = useState(false);
  const [comments, setComments] = useState(null);
  const [commentInput, setCommentInput] = useState('');
  const [commentCount, setCommentCount] = useState(post.comment_count);

  const toggleComments = () => {
    setOpenComments(o => !o);
    if (comments === null) {
      axios.get(API_ENDPOINTS.POST_COMMENTS(post.id))
        .then(res => setComments(res.data?.comments || []))
        .catch(() => setComments([]));
    }
  };

  const submitComment = async () => {
    const text = commentInput.trim();
    if (!text) return;
    try {
      const res = await axios.post(API_ENDPOINTS.POST_COMMENTS(post.id), { comment: text });
      if (res.data?.success) {
        setComments(prev => [...(prev || []), res.data.comment]);
        setCommentInput('');
        setCommentCount(c => c + 1);
      }
    } catch { /* silent */ }
  };

  return (
    <div style={{ padding: '12px 0', borderTop: '1px solid #f3f4f6' }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <Avatar photo={post.author_photo} id={post.employee_id} firstName={post.author_name?.split(' ')[0]} lastName={post.author_name?.split(' ')[1]} size={32} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: QA.textDark }}>
            {post.author_name}
            {post.post_type === 'praise' && post.praised_employee_name && (
              <span style={{ fontWeight: 400, color: QA.textMuted }}> praised <strong style={{ color: QA.purple }}>{post.praised_employee_name}</strong></span>
            )}
          </div>
          <div style={{ fontSize: 10, color: QA.textMuted, marginBottom: 6 }}>
            {new Date(post.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </div>
          <div style={{ fontSize: 13, color: QA.textDark, lineHeight: 1.5 }}>{post.content}</div>
          <PollWidget post={post} onVote={(index) => onVote(post.id, index)} onViewDetails={() => onViewPollDetails(post.id)} />
          <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
            <button className={`post-social-action${post.liked_by_me ? ' is-active' : ''}`} onClick={() => onLikeToggle(post.id)}
              style={{ border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: post.liked_by_me ? QA.textDark : QA.textMuted, fontSize: 11, padding: '5px 8px' }}>
              {post.liked_by_me ? <FaHeart size={11} /> : <FaRegHeart size={11} />} {post.like_count > 0 ? post.like_count : 'Like'}
            </button>
            <button className={`post-social-action${openComments ? ' is-active' : ''}`} onClick={toggleComments}
              style={{ border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: QA.textMuted, fontSize: 11, padding: '5px 8px' }}>
              <FaCommentDots size={11} /> {commentCount > 0 ? commentCount : 'Comment'}
            </button>
          </div>
          {openComments && (
            <div style={{ marginTop: 8, paddingLeft: 10, borderLeft: '2px solid #f3f4f6' }}>
              {(comments || []).map(c => (
                <div key={c.id} style={{ fontSize: 11, color: QA.textDark, marginBottom: 4 }}>
                  <strong>{c.commenter_name}</strong> {c.comment}
                </div>
              ))}
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <input
                  value={commentInput}
                  onChange={e => setCommentInput(e.target.value)}
                  placeholder="Write a comment…"
                  style={{ flex: 1, padding: '5px 8px', borderRadius: 6, border: `1px solid ${QA.border}`, fontSize: 11, outline: 'none' }}
                  onKeyDown={e => { if (e.key === 'Enter') submitComment(); }}
                />
                <button onClick={submitComment} style={{ padding: '5px 10px', borderRadius: 6, border: 'none', background: '#f3f4f6', color: QA.textDark, fontSize: 11, cursor: 'pointer' }}>Post</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const POSTS_LAST_SEEN_KEY = 'hrms_posts_last_seen';
const getPostsLastSeen = () => localStorage.getItem(POSTS_LAST_SEEN_KEY) || '1970-01-01T00:00:00.000Z';

export default function PostComposerCard() {
  const [tab, setTab] = useState('post');
  const [content, setContent] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [praisedName, setPraisedName] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDrawer, setShowDrawer] = useState(false);
  const [postsLastSeen, setPostsLastSeen] = useState(getPostsLastSeen());
  const [pollDrawerPostId, setPollDrawerPostId] = useState(null);
  const [showComposer, setShowComposer] = useState(false);

  const newPostCount = posts.filter(p => new Date(p.created_at) > new Date(postsLastSeen)).length;

  const openDrawer = () => {
    setShowDrawer(true);
    const now = new Date().toISOString();
    try { localStorage.setItem(POSTS_LAST_SEEN_KEY, now); } catch { /* ignore */ }
    setPostsLastSeen(now);
  };

  const fetchPosts = () => {
    axios.get(API_ENDPOINTS.POSTS)
      .then(res => { if (res.data?.success) setPosts(res.data.posts || []); })
      .catch(() => { })
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchPosts(); }, []);

  const reset = () => { setContent(''); setPollOptions(['', '']); setPraisedName(''); setError(''); };

  const submit = async () => {
    if (!content.trim()) { setError('Write something first'); return; }
    if (tab === 'praise' && !praisedName.trim()) { setError('Please enter who you are praising'); return; }
    setPosting(true);
    setError('');
    try {
      const res = await axios.post(API_ENDPOINTS.POSTS, {
        post_type: tab,
        content: content.trim(),
        poll_options: tab === 'poll' ? pollOptions.filter(o => o.trim()) : undefined,
        praised_employee_name: tab === 'praise' ? praisedName.trim() : undefined,
      });
      if (res.data?.success) {
        reset();
        setPosts(prev => [res.data.post, ...prev]);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to post');
    } finally {
      setPosting(false);
    }
  };

  // Same optimistic-then-reconcile pattern as PostsDrawer.jsx's voteOnPoll — kept as a separate
  // copy since this component maintains its own independent `posts` list/state.
  const voteOnPoll = async (postId, optionIndex) => {
    const prevPosts = posts;
    setPosts(prev => prev.map(p => {
      if (p.id !== postId || !p.poll) return p;
      const wasVoted = p.poll.my_vote;
      const options = p.poll.options.map(o => {
        let count = o.count;
        if (p.poll.results_visible && count !== null) {
          if (o.index === optionIndex) count = count + 1;
          if (o.index === wasVoted && wasVoted !== optionIndex) count = Math.max(0, count - 1);
        }
        return { ...o, count };
      });
      const total = wasVoted === null || wasVoted === undefined ? p.poll.total_votes + 1 : p.poll.total_votes;
      const withPct = options.map(o => ({ ...o, percentage: p.poll.results_visible && total > 0 ? Math.round((o.count / total) * 100) : o.percentage }));
      return { ...p, poll: { ...p.poll, my_vote: optionIndex, total_votes: total, options: withPct } };
    }));
    try {
      const res = await axios.post(API_ENDPOINTS.POST_VOTE(postId), { option_index: optionIndex });
      if (res.data?.success) setPosts(prev => prev.map(p => p.id === postId ? { ...p, poll: res.data.poll } : p));
    } catch (err) {
      setPosts(prevPosts);
      alert(err.response?.data?.message || 'Failed to record your vote');
    }
  };

  const toggleLike = async (postId) => {
    setPosts(prev => prev.map(p => p.id === postId
      ? { ...p, liked_by_me: !p.liked_by_me, like_count: p.like_count + (p.liked_by_me ? -1 : 1) }
      : p));
    try {
      await axios.patch(API_ENDPOINTS.POST_LIKE(postId));
    } catch {
      fetchPosts();
    }
  };
  
  return (
    <div className="post-composer-card" style={QA_CARD_STYLE}>
      <div className="post-composer-toolbar">
        <button onClick={openDrawer}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: `1px solid ${QA.border}`, borderRadius: 20, padding: '6px 14px', fontSize: 12, fontWeight: 700, color: QA.primary, cursor: 'pointer' }}>
          View All Posts
          {newPostCount > 0 && (
            <span style={{ background: QA.danger, color: '#fff', borderRadius: 10, fontSize: 10, fontWeight: 800, padding: '1px 6px', minWidth: 16, textAlign: 'center' }}>
              {newPostCount > 99 ? '99+' : newPostCount}
            </span>
          )}
        </button>
        {TABS.map(t => (
          <button key={t.key} className={`post-composer-tab${tab === t.key && showComposer ? ' is-selected' : ''}`} onClick={() => { setTab(t.key); setShowComposer(true); setError(''); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 20, border: 'none',
              cursor: 'pointer', fontSize: 12, fontWeight: 700,
              background: tab === t.key && showComposer ? QA.primary : '#f3f4f6',
              color: tab === t.key && showComposer ? '#fff' : QA.textMuted,
            }}>
            <t.icon size={11} /> {t.label}
          </button>
        ))}
      </div>

      {showComposer && (tab === 'announcements' ? (
        <AnnouncementsList />
      ) : (
        <>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder={tab === 'poll' ? 'Ask a question…' : tab === 'praise' ? 'Say something nice…' : 'Write your post here and mention your peers'}
            rows={2}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${QA.border}`, fontSize: 13, outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
          />

          {tab === 'poll' && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {pollOptions.map((opt, i) => (
                <div key={i} style={{ display: 'flex', gap: 6 }}>
                  <input
                    value={opt}
                    onChange={e => setPollOptions(prev => prev.map((o, idx) => idx === i ? e.target.value : o))}
                    placeholder={`Option ${i + 1}`}
                    style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: `1px solid ${QA.border}`, fontSize: 12, outline: 'none' }}
                  />
                  {pollOptions.length > 2 && (
                    <button onClick={() => setPollOptions(prev => prev.filter((_, idx) => idx !== i))}
                      style={{ background: 'none', border: 'none', color: QA.danger, cursor: 'pointer' }}>
                      <FaTimes size={11} />
                    </button>
                  )}
                </div>
              ))}
              {pollOptions.length < 4 && (
                <button onClick={() => setPollOptions(prev => [...prev, ''])}
                  style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: QA.primary, fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                  + Add option
                </button>
              )}
            </div>
          )}

          {tab === 'praise' && (
            <input
              value={praisedName}
              onChange={e => setPraisedName(e.target.value)}
              placeholder="Who are you praising?"
              style={{ marginTop: 8, width: '100%', padding: '7px 10px', borderRadius: 8, border: `1px solid ${QA.border}`, fontSize: 12, outline: 'none', boxSizing: 'border-box' }}
            />
          )}

          {error && <div style={{ fontSize: 11, color: QA.danger, marginTop: 8 }}>{error}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <button onClick={submit} disabled={posting}
              style={{ padding: '7px 18px', borderRadius: 8, border: 'none', background: QA.primary, color: '#fff', fontSize: 12, fontWeight: 700, cursor: posting ? 'not-allowed' : 'pointer', opacity: posting ? 0.6 : 1 }}>
              {posting ? 'Posting…' : 'Post'}
            </button>
          </div>

          {loading ? (
            <div style={{ fontSize: 12, color: QA.textMuted, marginTop: 10 }}>Loading feed…</div>
          ) : posts.length === 0 ? (
            <div style={{ fontSize: 12, color: QA.textMuted, marginTop: 10 }}>No posts yet — say hello to your team!</div>
          ) : (
            <div>
              {/* Compact card shows only the latest update — the rest live behind "View All Posts" */}
              {posts.slice(0, 1).map(p => (
                <PostCard key={p.id} post={p} onLikeToggle={toggleLike} onVote={voteOnPoll} onViewPollDetails={setPollDrawerPostId} />
              ))}
            </div>
          )}
        </>
      ))}

      <PostsDrawer show={showDrawer} onClose={() => setShowDrawer(false)} />
      <PollDetailsDrawer show={!!pollDrawerPostId} onHide={() => setPollDrawerPostId(null)} postId={pollDrawerPostId} />
    </div>
  );
}
