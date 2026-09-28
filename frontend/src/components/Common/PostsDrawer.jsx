import React, { useState, useEffect, useRef } from 'react';
import {
  FaTimes, FaCamera, FaChartBar, FaAward, FaReply, FaEllipsisH,
  FaSearch, FaHeart, FaThumbsUp, FaHandsHelping, FaTags, FaChevronDown, FaAt,
} from 'react-icons/fa';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';
import { useAuth } from '../../context/AuthContext';
import Avatar from './Avatar';
import PollWidget from './PollWidget';
import PollDetailsDrawer from './PollDetailsDrawer';
import { QA } from './quickAccessTheme';

const REACTIONS = [
  { key: 'like', icon: FaThumbsUp, color: '#2563eb', label: 'Like' },
  { key: 'love', icon: FaHeart, color: '#ef4444', label: 'Love' },
  { key: 'clap', icon: FaHandsHelping, color: '#f59e0b', label: 'Clap' },
];
const REACTION_BY_KEY = REACTIONS.reduce((acc, r) => { acc[r.key] = r; return acc; }, {});

const CATEGORIES = ['Achievement', 'Promotion', 'Office Event', 'Certification', 'Team Outing', 'Project Launch'];

const timeAgo = (iso) => {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

const reactionSummary = (reactions, viewerId) => {
  if (!reactions || reactions.length === 0) return null;
  const names = [];
  const mine = reactions.find(r => r.employee_id === viewerId);
  if (mine) names.push('You');
  for (const r of reactions) {
    if (names.length >= 3) break;
    if (r.employee_id === viewerId || !r.name) continue;
    names.push(r.name.split(' ')[0]);
  }
  const remaining = reactions.length - names.length;
  let text = names.join(', ');
  if (remaining > 0) text += `${text ? ' and ' : ''}${remaining} other${remaining === 1 ? '' : 's'}`;
  return text || `${reactions.length} reaction${reactions.length === 1 ? '' : 's'}`;
};

function Composer({ onPosted, active }) {
  const [content, setContent] = useState('');
  const [postType, setPostType] = useState('post'); // 'post' | 'poll' | 'praise'
  const [category, setCategory] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [pollSettings, setPollSettings] = useState({ allowVoteChange: true, showResultsBeforeVoting: false, showVoterNames: false });
  const [praisedName, setPraisedName] = useState('');
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  // @ mention tagging
  const [allEmployees, setAllEmployees] = useState([]);
  const [tagInput, setTagInput] = useState('');
  const [taggedEmps, setTaggedEmps] = useState([]);
  const [showTagDD, setShowTagDD] = useState(false);
  const tagRef = useRef(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    axios.get(API_ENDPOINTS.EMPLOYEES)
      .then(res => { if (!cancelled) setAllEmployees(Array.isArray(res.data) ? res.data : res.data?.data || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [active]);

  useEffect(() => {
    const close = (e) => { if (tagRef.current && !tagRef.current.contains(e.target)) setShowTagDD(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const tagSearch = tagInput.replace('@', '').toLowerCase();
  const filteredEmployees = allEmployees.filter(e =>
    e.is_active !== false &&
    !taggedEmps.find(t => t.employee_id === e.employee_id) &&
    tagSearch && `${e.first_name} ${e.last_name}`.toLowerCase().includes(tagSearch)
  ).slice(0, 6);

  const addTag = (emp) => {
    setTaggedEmps(prev => [...prev, emp]);
    setTagInput('');
    setShowTagDD(false);
  };
  const removeTag = (employeeId) => setTaggedEmps(prev => prev.filter(t => t.employee_id !== employeeId));

  const handleFiles = (fileList) => {
    const list = Array.from(fileList || []).slice(0, 6);
    setFiles(list);
    setPreviews(list.map(f => URL.createObjectURL(f)));
  };

  const reset = () => {
    setContent(''); setPostType('post'); setCategory(''); setPollOptions(['', '']);
    setPollSettings({ allowVoteChange: true, showResultsBeforeVoting: false, showVoterNames: false });
    setPraisedName(''); setFiles([]); setPreviews([]); setError('');
    setTaggedEmps([]); setTagInput(''); setShowTagDD(false);
  };

  const submit = async () => {
    if (!content.trim() && files.length === 0) { setError('Write a thought or add a photo'); return; }
    if (postType === 'praise' && !praisedName.trim()) { setError('Please say who you are appreciating'); return; }
    setPosting(true);
    setError('');
    try {
      const media_urls = [];
      for (const file of files) {
        const fd = new FormData();
        fd.append('file', file);
        const up = await axios.post(API_ENDPOINTS.POST_UPLOAD_IMAGE, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        if (up.data?.success) media_urls.push({ url: up.data.url, type: 'image' });
      }
      const res = await axios.post(API_ENDPOINTS.POSTS, {
        post_type: postType,
        content: content.trim(),
        category: category || undefined,
        mentioned_employees: taggedEmps.map(e => ({ employee_id: e.employee_id, name: `${e.first_name} ${e.last_name}`.trim() })),
        media_urls,
        poll_options: postType === 'poll' ? pollOptions.filter(o => o.trim()) : undefined,
        poll_settings: postType === 'poll' ? pollSettings : undefined,
        praised_employee_name: postType === 'praise' ? praisedName.trim() : undefined,
      });
      if (res.data?.success) {
        reset();
        onPosted(res.data.post);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to post');
    } finally {
      setPosting(false);
    }
  };

  return (
    <div style={{ padding: 16, borderBottom: `1px solid ${QA.border}` }}>
      <textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        placeholder={postType === 'poll' ? 'Ask a question…' : postType === 'praise' ? 'Say something nice…' : 'Share a thought with your team…'}
        rows={3}
        style={{ width: '100%', padding: '12px 14px', borderRadius: 14, border: `1px solid ${QA.border}`, fontSize: 13, outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
      />

      <div style={{ position: 'relative', marginTop: 8 }} ref={tagRef}>
        <div style={{ position: 'relative' }}>
          <FaAt size={11} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: QA.textMuted }} />
          <input
            value={tagInput}
            onChange={e => { setTagInput(e.target.value); setShowTagDD(true); }}
            onFocus={() => tagInput && setShowTagDD(true)}
            placeholder="Tag a teammate…"
            style={{ width: '100%', padding: '7px 10px 7px 28px', borderRadius: 10, border: `1px solid ${QA.border}`, fontSize: 12, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
        {showTagDD && filteredEmployees.length > 0 && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: `1px solid ${QA.border}`, borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 20, maxHeight: 160, overflowY: 'auto' }}>
            {filteredEmployees.map(emp => (
              <div key={emp.employee_id} onMouseDown={() => addTag(emp)}
                style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}
                onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                <Avatar photo={emp.profile_image} id={emp.employee_id} firstName={emp.first_name} lastName={emp.last_name} size={24} />
                <div>
                  <div style={{ fontWeight: 600, color: QA.textDark }}>{emp.first_name} {emp.last_name}</div>
                  <div style={{ fontSize: 10, color: QA.textMuted }}>{emp.department}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        {taggedEmps.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            {taggedEmps.map(emp => (
              <span key={emp.employee_id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: QA.primaryLight, color: QA.primary, borderRadius: 20, padding: '3px 10px 3px 8px', fontSize: 11, fontWeight: 600 }}>
                @{emp.first_name} {emp.last_name}
                <button onClick={() => removeTag(emp.employee_id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: QA.primary, padding: 0, lineHeight: 1, fontSize: 13 }}>×</button>
              </span>
            ))}
          </div>
        )}
      </div>

      {postType === 'poll' && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {pollOptions.map((opt, i) => (
            <div key={i} style={{ display: 'flex', gap: 6 }}>
              <input
                value={opt}
                onChange={e => setPollOptions(prev => prev.map((o, idx) => idx === i ? e.target.value : o))}
                placeholder={`Option ${i + 1}`}
                style={{ flex: 1, padding: '6px 10px', borderRadius: 8, border: `1px solid ${QA.border}`, fontSize: 12, outline: 'none' }}
              />
              {pollOptions.length > 2 && (
                <button onClick={() => setPollOptions(prev => prev.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', color: QA.danger, cursor: 'pointer' }}>
                  <FaTimes size={11} />
                </button>
              )}
            </div>
          ))}
          {pollOptions.length < 4 && (
            <button onClick={() => setPollOptions(prev => [...prev, ''])} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: QA.primary, fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
              + Add option
            </button>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4, padding: '8px 10px', background: '#f9fafb', borderRadius: 10 }}>
            {[
              ['allowVoteChange', 'Allow employees to change their vote'],
              ['showResultsBeforeVoting', 'Show results before voting'],
              ['showVoterNames', 'Let employees see who voted for what'],
            ].map(([key, label]) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, color: QA.textMuted, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={pollSettings[key]}
                  onChange={e => setPollSettings(prev => ({ ...prev, [key]: e.target.checked }))}
                />
                {label}
              </label>
            ))}
          </div>
        </div>
      )}

      {postType === 'praise' && (
        <input
          value={praisedName}
          onChange={e => setPraisedName(e.target.value)}
          placeholder="Who are you appreciating?"
          style={{ marginTop: 8, width: '100%', padding: '7px 10px', borderRadius: 8, border: `1px solid ${QA.border}`, fontSize: 12, outline: 'none', boxSizing: 'border-box' }}
        />
      )}

      {previews.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          {previews.map((src, i) => (
            <div key={i} style={{ position: 'relative' }}>
              <img src={src} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 10, display: 'block' }} />
              <button onClick={() => { setFiles(f => f.filter((_, idx) => idx !== i)); setPreviews(p => p.filter((_, idx) => idx !== i)); }}
                style={{ position: 'absolute', top: -4, right: -4, width: 18, height: 18, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.7)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FaTimes size={8} />
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <div style={{ fontSize: 11, color: QA.danger, marginTop: 6 }}>{error}</div>}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button onClick={() => fileRef.current?.click()}
            style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#f3f4f6', color: QA.textDark, border: 'none', borderRadius: 20, padding: '6px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
            <FaCamera size={11} /> Photo
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => handleFiles(e.target.files)} />
          <button onClick={() => setPostType(p => p === 'poll' ? 'post' : 'poll')}
            style={{ display: 'flex', alignItems: 'center', gap: 5, background: postType === 'poll' ? QA.primary : '#f3f4f6', color: postType === 'poll' ? '#fff' : QA.textDark, border: 'none', borderRadius: 20, padding: '6px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
            <FaChartBar size={11} /> Poll
          </button>
          <button onClick={() => setPostType(p => p === 'praise' ? 'post' : 'praise')}
            style={{ display: 'flex', alignItems: 'center', gap: 5, background: postType === 'praise' ? QA.primary : '#f3f4f6', color: postType === 'praise' ? '#fff' : QA.textDark, border: 'none', borderRadius: 20, padding: '6px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
            <FaAward size={11} /> Appreciation
          </button>
          <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
            <FaTags size={11} style={{ position: 'absolute', left: 11, color: category ? QA.primary : QA.textMuted, pointerEvents: 'none' }} />
            <select value={category} onChange={e => setCategory(e.target.value)}
              style={{
                appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
                border: `1.5px solid ${category ? QA.primary : QA.border}`, borderRadius: 20,
                padding: '6px 26px 6px 30px', fontSize: 11, fontWeight: category ? 700 : 500,
                color: category ? QA.primary : QA.textMuted,
                background: category ? QA.primaryLight : '#fff', cursor: 'pointer', outline: 'none',
              }}>
              <option value="">Tag (optional)</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <FaChevronDown size={9} style={{ position: 'absolute', right: 10, color: category ? QA.primary : QA.textMuted, pointerEvents: 'none' }} />
          </div>
        </div>
        <button onClick={submit} disabled={posting}
          style={{ padding: '8px 20px', borderRadius: 20, border: 'none', background: QA.primary, color: '#fff', fontSize: 12, fontWeight: 700, cursor: posting ? 'not-allowed' : 'pointer', opacity: posting ? 0.6 : 1 }}>
          {posting ? 'Posting…' : 'Post'}
        </button>
      </div>
    </div>
  );
}

function CommentThread({ postId, initialFirstComment, onCountChange }) {
  const [comments, setComments] = useState(initialFirstComment ? [initialFirstComment] : []);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [replyInput, setReplyInput] = useState('');

  const fetchAll = () => {
    setLoading(true);
    axios.get(API_ENDPOINTS.POST_COMMENTS(postId))
      .then(res => { setComments(res.data?.comments || []); setLoaded(true); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const post = async (text, parentId) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    try {
      const res = await axios.post(API_ENDPOINTS.POST_COMMENTS(postId), { comment: trimmed, parent_comment_id: parentId || undefined });
      if (res.data?.success) {
        setComments(prev => [...prev, res.data.comment]);
        onCountChange?.(1);
      }
    } catch { /* silent */ }
  };

  const topLevel = comments.filter(c => !c.parent_comment_id);
  const repliesOf = (id) => comments.filter(c => c.parent_comment_id === id);

  return (
    <div style={{ padding: '4px 16px 14px' }}>
      {!loaded && (
        <button onClick={fetchAll} disabled={loading} style={{ background: 'none', border: 'none', color: QA.textMuted, fontSize: 12, cursor: 'pointer', padding: 0, marginBottom: 6 }}>
          {loading ? 'Loading…' : 'View all comments'}
        </button>
      )}
      {topLevel.map(c => (
        <div key={c.id} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: QA.textDark }}><strong>{c.commenter_name}</strong> {c.comment}</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 2 }}>
            <span style={{ fontSize: 10, color: QA.textMuted }}>{timeAgo(c.created_at)}</span>
            <button onClick={() => setReplyTo({ id: c.id, name: c.commenter_name })}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: QA.textMuted, fontSize: 10, fontWeight: 700, padding: 0, display: 'flex', alignItems: 'center', gap: 3 }}>
              <FaReply size={9} /> Reply
            </button>
          </div>
          {repliesOf(c.id).map(r => (
            <div key={r.id} style={{ marginTop: 6, marginLeft: 18, paddingLeft: 10, borderLeft: `2px solid ${QA.border}` }}>
              <div style={{ fontSize: 12, color: QA.textDark }}><strong>{r.commenter_name}</strong> {r.comment}</div>
              <span style={{ fontSize: 10, color: QA.textMuted }}>{timeAgo(r.created_at)}</span>
            </div>
          ))}
          {replyTo?.id === c.id && (
            <div style={{ display: 'flex', gap: 6, marginTop: 6, marginLeft: 18 }}>
              <input
                autoFocus
                value={replyInput}
                onChange={e => setReplyInput(e.target.value)}
                placeholder={`Reply to ${replyTo.name}…`}
                style={{ flex: 1, padding: '5px 8px', borderRadius: 8, border: `1px solid ${QA.border}`, fontSize: 11, outline: 'none' }}
                onKeyDown={e => { if (e.key === 'Enter') { post(replyInput, c.id); setReplyInput(''); setReplyTo(null); } }}
              />
              <button onClick={() => { post(replyInput, c.id); setReplyInput(''); setReplyTo(null); }}
                style={{ padding: '5px 10px', borderRadius: 8, border: 'none', background: '#f3f4f6', fontSize: 11, cursor: 'pointer' }}>
                Reply
              </button>
            </div>
          )}
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Add a comment…"
          style={{ flex: 1, padding: '7px 10px', borderRadius: 10, border: `1px solid ${QA.border}`, fontSize: 12, outline: 'none' }}
          onKeyDown={e => { if (e.key === 'Enter') { post(input); setInput(''); } }}
        />
        <button onClick={() => { post(input); setInput(''); }}
          style={{ padding: '7px 14px', borderRadius: 10, border: 'none', background: QA.primary, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          Post
        </button>
      </div>
    </div>
  );
}

function FeedPost({ post, viewer, following, onToggleFollow, onReact, onDelete, onVote, onViewPollDetails }) {
  const [showComments, setShowComments] = useState(false);
  const [commentCount, setCommentCount] = useState(post.comment_count);
  const [menuOpen, setMenuOpen] = useState(false);
  const isMine = post.employee_id === viewer.employeeId;
  const isFollowing = following.includes(post.employee_id);
  const isProfileUpdate = post.post_type === 'profile_update';
  const media = post.media_urls?.length > 0 ? post.media_urls : (post.image_url ? [{ url: post.image_url }] : []);
  const summary = reactionSummary(post.reactions, viewer.employeeId);

  return (
    <div style={{ borderBottom: '8px solid #f8fafc', padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Avatar photo={post.author_photo} id={post.employee_id} firstName={post.author_name?.split(' ')[0]} lastName={post.author_name?.split(' ')[1]} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: QA.textDark }}>{post.author_name}</span>
            {!isMine && (
              <button onClick={() => onToggleFollow(post.employee_id)}
                style={{ fontSize: 10, fontWeight: 700, border: 'none', borderRadius: 20, padding: '2px 9px', cursor: 'pointer', background: isFollowing ? '#f3f4f6' : QA.primaryLight, color: isFollowing ? QA.textMuted : QA.primary }}>
                {isFollowing ? 'Following' : 'Follow'}
              </button>
            )}
          </div>
          <div style={{ fontSize: 10, color: QA.textMuted }}>{timeAgo(post.created_at)}</div>
        </div>
        <div style={{ position: 'relative' }}>
          <button onClick={() => setMenuOpen(o => !o)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: QA.textMuted, padding: 4 }}>
            <FaEllipsisH size={14} />
          </button>
          {menuOpen && (
            <div style={{ position: 'absolute', right: 0, top: 24, background: '#fff', border: `1px solid ${QA.border}`, borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 5, minWidth: 120 }}>
              {(isMine || ['admin', 'sub_admin', 'hr'].includes(viewer.role)) ? (
                <button onClick={() => { setMenuOpen(false); onDelete(post.id); }}
                  style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'none', border: 'none', textAlign: 'left', color: QA.danger, fontSize: 12, cursor: 'pointer' }}>
                  Delete Post
                </button>
              ) : (
                <div style={{ padding: '8px 12px', fontSize: 11, color: QA.textMuted }}>No actions available</div>
              )}
            </div>
          )}
        </div>
      </div>

      {post.category && (
        <span style={{ display: 'inline-block', marginTop: 8, fontSize: 10, fontWeight: 700, color: QA.primary, background: QA.primaryLight, borderRadius: 20, padding: '2px 10px' }}>
          🏷️ {post.category}
        </span>
      )}

      {post.post_type === 'praise' && post.praised_employee_name && (
        <div style={{ marginTop: 6, fontSize: 12, color: QA.textMuted }}>
          🎉 Appreciating <strong style={{ color: QA.primary }}>{post.praised_employee_name}</strong>
        </div>
      )}

      {post.post_type === 'wish' && (
        <span style={{ display: 'inline-block', marginTop: 8, fontSize: 10, fontWeight: 700, color: '#B45309', background: '#FFFBEB', borderRadius: 20, padding: '2px 10px' }}>
          🎉 Celebration Wish
        </span>
      )}

      {post.content && <div style={{ fontSize: 13, color: QA.textDark, marginTop: 8, lineHeight: 1.5 }}>{post.content}</div>}

      <PollWidget post={post} onVote={(index) => onVote(post.id, index)} onViewDetails={() => onViewPollDetails(post.id)} />

      {media.length > 0 && !isProfileUpdate && (
        media.length === 1 ? (
          <img src={media[0].url} alt="" style={{ width: '100%', maxHeight: 380, objectFit: 'cover', borderRadius: 16, marginTop: 10, display: 'block' }} />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: media.length === 2 ? '1fr 1fr' : '1fr 1fr 1fr', gap: 6, marginTop: 10 }}>
            {media.slice(0, 6).map((m, i) => (
              <img key={i} src={m.url} alt="" style={{ width: '100%', height: 100, objectFit: 'cover', borderRadius: 12 }} />
            ))}
          </div>
        )
      )}

      {isProfileUpdate && media.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 10 }}>
          <img src={media[0].url} alt="" style={{ width: 96, height: 96, borderRadius: '50%', objectFit: 'cover', border: `3px solid ${QA.primaryLight}` }} />
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {REACTIONS.map(r => (
            <button key={r.key} className={`post-social-action${post.my_reaction === r.key ? ' is-active' : ''}`} onClick={() => onReact(post.id, r.key)} title={r.label}
              style={{ border: 'none', borderRadius: 20, padding: '5px 9px', cursor: 'pointer', color: post.my_reaction === r.key ? QA.textDark : QA.textMuted, display: 'flex', alignItems: 'center' }}>
              <r.icon size={13} />
            </button>
          ))}
          {summary && <span style={{ fontSize: 11, color: QA.textMuted, marginLeft: 4 }}>{summary}</span>}
        </div>
        <button className={`post-social-action${showComments ? ' is-active' : ''}`} onClick={() => setShowComments(s => !s)} style={{ border: 'none', cursor: 'pointer', color: QA.textMuted, fontSize: 11, fontWeight: 600, padding: '5px 8px' }}>
          {commentCount > 0 ? `${commentCount} comment${commentCount === 1 ? '' : 's'}` : 'Comment'}
        </button>
      </div>

      {post.first_comment && !showComments && (
        <div style={{ marginTop: 8, fontSize: 12, color: QA.textDark }}>
          <strong>{post.first_comment.commenter_name}</strong> {post.first_comment.comment}
          {commentCount > 1 && (
            <button onClick={() => setShowComments(true)} style={{ display: 'block', background: 'none', border: 'none', color: QA.primary, fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: 0, marginTop: 2 }}>
              View all {commentCount} comments →
            </button>
          )}
        </div>
      )}

      {showComments && (
        <CommentThread postId={post.id} initialFirstComment={post.first_comment} onCountChange={(n) => setCommentCount(c => c + n)} />
      )}
    </div>
  );
}

export default function PostsDrawer({ show, onClose }) {
  const { user } = useAuth();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState([]);
  const [sortOrder, setSortOrder] = useState('latest');
  const [filterTab, setFilterTab] = useState('all');
  const [search, setSearch] = useState('');
  const [pollDrawerPostId, setPollDrawerPostId] = useState(null);

  const fetchPosts = () => {
    axios.get(API_ENDPOINTS.POSTS)
      .then(res => { if (res.data?.success) setPosts(res.data.posts || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const fetchFollowing = () => {
    axios.get(API_ENDPOINTS.POST_FOLLOWING)
      .then(res => { if (res.data?.success) setFollowing(res.data.following || []); })
      .catch(() => {});
  };

  useEffect(() => { if (show) { fetchPosts(); fetchFollowing(); } }, [show]);

  const toggleReact = async (postId, type) => {
    setPosts(prev => prev.map(p => {
      if (p.id !== postId) return p;
      const already = p.my_reaction === type;
      const reactions = (p.reactions || []).filter(r => r.employee_id !== user.employeeId);
      const newReactions = already ? reactions : [...reactions, { employee_id: user.employeeId, name: user.name, type }];
      return { ...p, reactions: newReactions, my_reaction: already ? null : type, like_count: newReactions.length };
    }));
    try {
      await axios.post(API_ENDPOINTS.POST_REACT(postId), { type });
    } catch {
      fetchPosts();
    }
  };

  // Optimistic update, then reconcile with the server's authoritative (never client-trusted)
  // counts/percentages — mirrors the reaction-toggle pattern just above.
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
      if (res.data?.success) {
        setPosts(prev => prev.map(p => p.id === postId ? { ...p, poll: res.data.poll } : p));
      }
    } catch (err) {
      setPosts(prevPosts); // revert optimistic update
      alert(err.response?.data?.message || 'Failed to record your vote');
    }
  };

  const toggleFollow = async (employeeId) => {
    setFollowing(prev => prev.includes(employeeId) ? prev.filter(id => id !== employeeId) : [...prev, employeeId]);
    try {
      await axios.post(API_ENDPOINTS.POST_FOLLOW(employeeId));
    } catch {
      fetchFollowing();
    }
  };

  const deletePost = async (postId) => {
    if (!window.confirm('Delete this post?')) return;
    setPosts(prev => prev.filter(p => p.id !== postId));
    try {
      await axios.delete(API_ENDPOINTS.POST_DELETE(postId));
    } catch {
      fetchPosts();
    }
  };

  let visible = posts;
  if (filterTab === 'my') visible = visible.filter(p => p.employee_id === user?.employeeId);
  if (filterTab === 'mentions') visible = visible.filter(p => (p.mentioned_employees || []).some(m => (m.employee_id || m) === user?.employeeId));
  if (filterTab === 'following') visible = visible.filter(p => following.includes(p.employee_id));
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    visible = visible.filter(p => p.content?.toLowerCase().includes(q) || p.author_name?.toLowerCase().includes(q));
  }
  visible = [...visible].sort((a, b) => {
    const diff = new Date(b.created_at) - new Date(a.created_at);
    return sortOrder === 'latest' ? diff : -diff;
  });

  const TABS = [
    { key: 'all', label: 'All Posts' },
    // { key: 'following', label: 'Following' },
    { key: 'my', label: 'My Posts' },
    { key: 'mentions', label: 'Mentions' },
  ];

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.45)', zIndex: 2000,
          opacity: show ? 1 : 0, pointerEvents: show ? 'auto' : 'none', transition: 'opacity 0.25s ease',
        }}
      />
      <div
        className="qa-posts-drawer"
        style={{
          position: 'fixed', top: 0, right: 0, height: '100vh', width: '30%',
          background: '#F8FAFC', zIndex: 2001, boxShadow: '-8px 0 32px rgba(0,0,0,0.15)',
          display: 'flex', flexDirection: 'column',
          transform: show ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.28s ease',
        }}
      >
        <style>{`
          @media (max-width: 1100px) { .qa-posts-drawer { width: 60% !important; } }
          @media (max-width: 640px) { .qa-posts-drawer { width: 100% !important; } }
        `}</style>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', background: '#fff', borderBottom: `1px solid ${QA.border}`, flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: QA.textDark }}>📣 All Posts</div>
            <div style={{ fontSize: 11, color: QA.textMuted }}>Connect • Share • Celebrate together</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <select value={sortOrder} onChange={e => setSortOrder(e.target.value)}
              style={{ border: `1px solid ${QA.border}`, borderRadius: 20, padding: '6px 12px', fontSize: 11, color: QA.textDark, background: '#fff' }}>
              <option value="latest">Latest</option>
              <option value="oldest">Oldest</option>
            </select>
            <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', background: '#f3f4f6', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: QA.textMuted }}>
              <FaTimes size={13} />
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ background: '#fff', margin: 14, borderRadius: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <Composer active={show} onPosted={(p) => setPosts(prev => [p, ...prev])} />
          </div>

          <div style={{ background: '#fff', margin: '0 14px 14px', borderRadius: 16, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', gap: 14 }}>
              {TABS.map(t => (
                <button key={t.key} onClick={() => setFilterTab(t.key)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0',
                    fontSize: 12, fontWeight: 700, color: filterTab === t.key ? QA.primary : QA.textMuted,
                    borderBottom: filterTab === t.key ? `2px solid ${QA.primary}` : '2px solid transparent',
                  }}>
                  {t.label}
                </button>
              ))}
            </div>
            <div style={{ position: 'relative' }}>
              <FaSearch size={10} color="#9ca3af" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search posts…"
                style={{ padding: '6px 10px 6px 26px', borderRadius: 20, border: `1px solid ${QA.border}`, fontSize: 11, outline: 'none', width: 130 }} />
            </div>
          </div>

          <div style={{ background: '#fff', margin: '0 14px 14px', borderRadius: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
            {loading ? (
              <div style={{ padding: 20, fontSize: 12, color: QA.textMuted, textAlign: 'center' }}>Loading posts…</div>
            ) : visible.length === 0 ? (
              <div style={{ padding: 30, fontSize: 13, color: QA.textMuted, textAlign: 'center' }}>No posts yet — share the first update!</div>
            ) : (
              visible.map(p => (
                <FeedPost key={p.id} post={p} viewer={user || {}} following={following}
                  onToggleFollow={toggleFollow} onReact={toggleReact} onDelete={deletePost}
                  onVote={voteOnPoll} onViewPollDetails={setPollDrawerPostId} />
              ))
            )}
          </div>
        </div>
      </div>

      <PollDetailsDrawer show={!!pollDrawerPostId} onHide={() => setPollDrawerPostId(null)} postId={pollDrawerPostId} />
    </>
  );
}
