import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  FaBell, FaClock, FaCalendarAlt, FaEdit,
  FaCheckCircle, FaTimesCircle, FaUser, FaSignOutAlt,
  FaTimes, FaChevronDown, FaBullhorn, FaTicketAlt, FaExclamationTriangle
} from 'react-icons/fa';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';
import axios from '../../config/axios';
import API_ENDPOINTS from '../../config/api';
import { getTrustedNow } from '../../utils/serverTime';
import { Badge, Dropdown, Spinner, Modal, Button } from 'react-bootstrap';
import EventNotification from '../Common/EventNotification';

const ROUTE_LABELS = {
  '/':                           'Dashboard',
  '/admin/dashboard':            'Dashboard',
  '/admin/employees':            'Employees',
  '/admin/add-employee':         'Add Employee',
  '/admin/leave-requests':       'Leave Requests',
  '/admin/attendance/reports':   'Attendance Reports',
  '/admin/attendance/dashboard': 'Attendance Dashboard',
  '/admin/ratings':              'Employee Ratings',
  '/admin/send-update-request':  'Send Update Request',
  '/admin/update-approvals':     'Update Approvals',
  '/admin/broadcast':            'Broadcast Center',
  '/profile':                    'My Profile',
  '/attendance':                 'Daily Attendance',
  '/apply-leave':                'Apply Leave',
  '/salary-slip':                'Payroll',
  '/employee/deductions': 'Payroll',
  '/employee/update-requests':   'Update Requests',
  '/manager/panel':              'My Team',
  '/admin/teams':                'Teams',
};

const Navbar = () => {
  const { user, logout }   = useAuth();
  const navigate           = useNavigate();
  const location           = useLocation();
  const { eventNotifications, markEventAsRead, markAllEventsAsRead, removeNotification, showNotification } = useNotification();
  const seenNotificationIdsRef = useRef(null); // null = not initialized yet (first fetch shouldn't toast)

  const [notifications, setNotifications]           = useState([]);
  const [showNotifications, setShowNotifications]   = useState(false);
  const [unreadCount, setUnreadCount]               = useState(0);
  const [employeeName, setEmployeeName]             = useState('');
  const [currentTime, setCurrentTime]               = useState(getTrustedNow());
  const [pendingRequests, setPendingRequests]       = useState([]);
  const [pendingCount, setPendingCount]             = useState(0);
  const [fetchingNotifications, setFetchingNotifications] = useState(false);
  const [activeNotice, setActiveNotice]             = useState(null);
  const [noticePaused, setNoticePaused]             = useState(false);
  // Tickets specifically assigned to me that are still active (not resolved/closed) — shown as
  // a blocking modal (no backdrop/ESC dismiss) the assignee must explicitly close. Re-populated
  // once per full page load/visit; a ticket drops out of this queue for good once its status
  // moves to resolved_pending/closed, not merely because it was closed once this session.
  const [blockingTickets, setBlockingTickets]       = useState([]);
  const ACTIVE_TICKET_STATUSES = ['open', 'in_progress', 'reopened'];

  const notificationRef  = useRef(null);
  const bellRef          = useRef(null);

  // clock — anchored to the trusted server clock (utils/serverTime.js), not this device's own
  // clock/timezone, since that's what the actual clock-in/out timestamps are computed from.
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(getTrustedNow()), 1000);
    return () => clearInterval(t);
  }, []);

  // fetch on mount
  useEffect(() => {
    if (user) {
      fetchEmployeeName();
      fetchNotifications();
      fetchPendingUpdateRequests();
      fetchActiveNotice();
      fetchAssignedActiveTickets();
    }
  }, [user]);

  // re-fetch notice when admin saves — event-driven, no polling needed for everyone else
  useEffect(() => {
    const h = () => fetchActiveNotice();
    window.addEventListener('noticeBoardChanged', h);
    return () => window.removeEventListener('noticeBoardChanged', h);
  }, []);

  // Notifications and the notice board are no longer auto-polled on a timer — that was a
  // steady background DB load from every open tab, every 45-60s, whether or not anyone was
  // looking. Both still fetch once on mount (above) and notifications refresh on-demand when
  // the bell is actually opened (see the bell onClick below) — i.e. only "until they call".

  // unread badge
  useEffect(() => {
    setUnreadCount(
      eventNotifications.filter(e => !e.read).length +
      notifications.filter(n => !n.is_read).length
    );
  }, [eventNotifications, notifications]);

  // click outside notifications panel
  useEffect(() => {
    const h = (e) => {
      if (
        notificationRef.current && !notificationRef.current.contains(e.target) &&
        bellRef.current && !bellRef.current.contains(e.target)
      ) setShowNotifications(false);
    };
    if (showNotifications) document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [showNotifications]);

  const fetchActiveNotice = async () => {
    try {
      const res = await axios.get(API_ENDPOINTS.NOTICE_BOARD_ACTIVE);
      setActiveNotice(res.data.notice || null);
    } catch { /* silent */ }
  };

  const fetchEmployeeName = async () => {
    try {
      if (user?.role === 'admin') { setEmployeeName('Administrator'); return; }
      const res = await axios.get(API_ENDPOINTS.EMPLOYEE_PROFILE(user?.employeeId));
      if (res.data)
        setEmployeeName(`${res.data.first_name || ''} ${res.data.last_name || ''}`.trim() || 'Employee');
    } catch {
      setEmployeeName(user?.role === 'admin' ? 'Administrator' : user?.role === 'sub_admin' ? 'Manager' : user?.role === 'hr' ? 'HR' : 'Employee');
    }
  };

  // Tickets specifically assigned to me (by ID, not by name/role) that are still open/in
  // progress/reopened — surfaced as a blocking pop-up once per visit until I resolve them.
  const fetchAssignedActiveTickets = async () => {
    if (!user?.employeeId) return;
    try {
      const res = await axios.get(API_ENDPOINTS.TICKETS);
      const mine = (res.data?.tickets || [])
        .filter(t => t.assigned_to === user.employeeId && ACTIVE_TICKET_STATUSES.includes(t.status))
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      setBlockingTickets(mine);
    } catch { /* silent */ }
  };

  const dismissBlockingTicket = () => setBlockingTickets(q => q.slice(1));

  const fetchNotifications = async () => {
    if (!user?.employeeId) return;
    setFetchingNotifications(true);
    try {
      const res = await axios.get(API_ENDPOINTS.NOTIFICATIONS_BY_EMPLOYEE(user.employeeId));
      if (res.data && Array.isArray(res.data)) {
        // Toast any ticket notification that showed up since the last poll — this is the
        // "popup appears without a page refresh" requirement. The very first fetch just
        // seeds the seen-set (no toast storm on login for notifications that already existed).
        const currentIds = new Set(res.data.map(n => n.id));
        if (seenNotificationIdsRef.current) {
          const freshTicketNotifs = res.data.filter(n =>
            n.type?.startsWith('ticket_') && !seenNotificationIdsRef.current.has(n.id)
          );
          freshTicketNotifs.forEach(n => {
            const ticketId = n.metadata?.ticket_id;
            // A brand-new "assigned to you" notification gets the blocking pop-up instead of
            // (not in addition to) a toast — the modal itself is the notification for the
            // assignee. Everything else (comments, status changes, team-wide "new ticket")
            // still just toasts, same as before.
            if (n.type === 'ticket_assigned' && ticketId) {
              axios.get(API_ENDPOINTS.TICKET_BY_ID(ticketId)).then(r => {
                const t = r.data?.ticket;
                if (t && ACTIVE_TICKET_STATUSES.includes(t.status)) {
                  setBlockingTickets(q => q.some(x => x.id === t.id) ? q : [...q, t]);
                }
              }).catch(() => {});
              return;
            }
            showNotification(
              <span
                style={{ cursor: ticketId ? 'pointer' : 'default' }}
                onClick={() => ticketId && navigate(`/tickets/${ticketId}`)}
              >
                <strong>{n.title}</strong>
                <br />
                <span style={{ fontSize: 12 }}>{n.message}</span>
                {ticketId && <><br /><span style={{ fontSize: 12, fontWeight: 700, textDecoration: 'underline' }}>View Ticket →</span></>}
              </span>,
              'info',
              6000
            );
          });
        }
        seenNotificationIdsRef.current = currentIds;
        setNotifications(res.data);
      }
    } catch { /* silent */ }
    finally { setFetchingNotifications(false); }
  };

  const fetchPendingUpdateRequests = async () => {
    try {
      const res  = await axios.get(API_ENDPOINTS.EMPLOYEE_UPDATES_PENDING);
      const data = Array.isArray(res.data) ? res.data : res.data?.requests || [];
      setPendingRequests(data);
      setPendingCount(data.length);
    } catch { /* silent */ }
  };

  const markAsRead = async (id) => {
    try {
      await axios.put(API_ENDPOINTS.NOTIFICATION_READ(id));
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch { /* silent */ }
  };

  const deleteNotification = async (id, e) => {
    e.stopPropagation();
    try {
      await axios.delete(API_ENDPOINTS.NOTIFICATION_DELETE(id));
      setNotifications(prev => prev.filter(n => n.id !== id));
      if (removeNotification) removeNotification(id);
    } catch {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }
  };

  const markAllAsRead = async () => {
    try {
      const ids = notifications.filter(n => !n.is_read).map(n => n.id);
      await Promise.all(ids.map(id => markAsRead(id)));
      markAllEventsAsRead();
    } catch { /* silent */ }
  };

  const getNotificationIcon = (type) => {
    const s = { marginTop: '1px', flexShrink: 0 };
    switch (type) {
      case 'update_approved': case 'leave_approved':
        return <FaCheckCircle style={{ color: 'var(--success)', ...s }} size={13} />;
      case 'update_rejected': case 'leave_rejected':
        return <FaTimesCircle style={{ color: 'var(--danger)', ...s }} size={13} />;
      case 'update_request':
        return <FaEdit style={{ color: 'var(--warning)', ...s }} size={13} />;
      case 'ticket_created': case 'ticket_comment': case 'ticket_status': case 'ticket_assigned':
        return <FaTicketAlt style={{ color: 'var(--primary)', ...s }} size={13} />;
      default:
        return <FaBell style={{ color: 'var(--primary)', ...s }} size={13} />;
    }
  };

  const formatTime = (ds) => {
    const d = new Date(ds), m = Math.floor((Date.now() - d) / 60000);
    if (m < 1)  return 'Just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  const getInitials = (name) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const pageLabel = (() => {
    const p = location.pathname;
    if (ROUTE_LABELS[p]) return ROUTE_LABELS[p];
    const f = Object.entries(ROUTE_LABELS).find(([k]) => p.startsWith(k) && k !== '/');
    return f ? f[1] : 'Dashboard';
  })();

  // timeZone pinned to India — otherwise this would render in whatever timezone the OS
  // happens to be set to (independent of, and in addition to, the device clock itself).
  const timeStr = currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
  const dateStr = currentTime.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata' });

  const noticeItalic = (activeNotice?.font_style || '').includes('italic');
  const noticeBold   = (activeNotice?.font_style || '').includes('bold');
  const noticeBg     = activeNotice?.background_color || 'var(--navbar-bg)';
  const noticeColor  = activeNotice?.text_color || '#2B2B2B';

  const blockingTicket = blockingTickets[0] || null;

  // ─────────────────────────────────────────────────────────────
  return (
    <>
    <nav
      style={{
        height: '60px',
        padding: '0 24px',
        position: 'sticky',
        top: 0,
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        gap: '0',
        boxShadow: 'var(--shadow-sm)',
        borderBottom: '1px solid var(--border)',
        background: activeNotice ? noticeBg : 'var(--navbar-bg)',
        transition: 'background 0.35s ease',
      }}
    >
      {/* ── LEFT: page title ── */}
      <div style={{ flexShrink: 0 }}>
        <div style={{
          fontSize: '11px', fontWeight: 400, lineHeight: 1,
          color: activeNotice ? noticeColor : 'var(--text-muted)', opacity: 0.75,
        }}>
          {user?.role === 'admin' ? 'Admin' : user?.role === 'hr' ? 'HR' : user?.role === 'sub_admin' ? 'Manager' : user?.role === 'manager' ? 'TL' : 'Employee'} Portal
        </div>
        <div style={{
          fontSize: '15px', fontWeight: 700, lineHeight: 1.3, marginTop: '2px',
          color: activeNotice ? noticeColor : 'var(--text-primary)',
        }}>
          {pageLabel}
        </div>
      </div>

      {/* ── CENTRE: notice message ── */}
      {activeNotice ? (
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          overflow: 'hidden',
          padding: '0 20px',
        }}>
          {/* label pill */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0,
            background: 'rgba(0,0,0,0.10)', borderRadius: '20px',
            padding: '3px 9px 3px 7px',
          }}>
            <FaBullhorn size={9} style={{ color: noticeColor }} />
            <span style={{
              fontSize: '15px', fontWeight: '700', letterSpacing: '0.5px',
              color: noticeColor, textTransform: 'uppercase',
            }}>Notice</span>
          </div>

          {/* divider */}
          <div style={{ width: '1px', height: '14px', background: 'rgba(0,0,0,0.18)', flexShrink: 0 }} />

          {/* message */}
          <div style={{ flex: 1, overflow: 'hidden' }}>
            {activeNotice.display_type === 'static' ? (
              <span style={{
                fontSize: '13px', color: noticeColor,
                fontStyle: noticeItalic ? 'italic' : 'normal',
                fontWeight: noticeBold ? '700' : '500',
              }}>
                {activeNotice.message}
              </span>
            ) : (
              <div
                style={{ overflow: 'hidden', whiteSpace: 'nowrap' }}
                onMouseEnter={() => setNoticePaused(true)}
                onMouseLeave={() => setNoticePaused(false)}
              >
                {/*
                  Seamless ticker: two identical halves side-by-side.
                  Animation shifts -50% (one half) so half-2 slides into half-1 with no gap.
                  20 reps per half = multiple copies always visible simultaneously.
                  90s / 20 reps = ~4.5s per sentence regardless of message length.
                */}
                <div style={{
                  display: 'inline-flex',
                  willChange: 'transform',
                  animation: noticePaused ? 'none'
                    : activeNotice.direction === 'left_to_right'
                      ? 'noticeScrollLTR 90s linear infinite'
                      : 'noticeScrollRTL 90s linear infinite',
                }}>
                  {[0, 1].map(half => (
                    <span key={half} style={{
                      display: 'inline-block',
                      whiteSpace: 'nowrap',
                      paddingRight: '3em',
                      fontSize: '19px',
                      color: noticeColor,
                      fontStyle: noticeItalic ? 'italic' : 'normal',
                      fontWeight: noticeBold ? '700' : '500',
                    }}>
                      {Array(20).fill(activeNotice.message).join('  ·  ')}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* spacer when no notice so right controls stay right */
        <div style={{ flex: 1 }} />
      )}

      {/* ── RIGHT: datetime + bell + profile ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>

        {/* DateTime pill */}
        {/* <div className="hrms-datetime d-none d-sm-flex">
          <FaClock size={11} style={{ color: 'var(--primary)', flexShrink: 0 }} />
          <span className="time">{timeStr}</span>
          <span className="sep">|</span>
          <FaCalendarAlt size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <span>{dateStr}</span>
        </div> */}

        {/* Bell */}
        <div
          ref={bellRef}
          className={`hrms-icon-btn${showNotifications ? ' active' : ''}`}
          onClick={() => {
            setShowNotifications(s => {
              const opening = !s;
              if (opening) { fetchNotifications(); markAllAsRead(); }
              return opening;
            });
          }}
          title="Notifications"
        >
          <FaBell size={15} />
          {unreadCount > 0 && (
            <span style={{
              position: 'absolute', top: '-4px', right: '-4px',
              background: 'var(--danger)', color: 'white',
              borderRadius: '10px', fontSize: '9px', fontWeight: '700',
              padding: '1px 5px', minWidth: '16px', textAlign: 'center',
              border: '2px solid white', lineHeight: '13px',
            }}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>

        {/* Divider */}
        <div style={{ width: '1px', height: '22px', background: 'var(--border)', flexShrink: 0 }} />

        {/* Profile dropdown */}
        <Dropdown align="end">
          <Dropdown.Toggle
            as="div"
            style={{
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
              padding: '4px 10px 4px 4px', background: 'var(--body-bg)',
              border: '1px solid var(--border)', borderRadius: '24px', userSelect: 'none',
            }}
          >
            <div className="hrms-profile-chip__avatar">{getInitials(employeeName)}</div>
            <div className="hrms-profile-chip__info d-none d-md-block">
              <div className="hrms-profile-chip__name">{employeeName}</div>
              <div className="hrms-profile-chip__role">
                {user?.role === 'admin' ? 'Admin' : user?.role === 'hr' ? 'HR' : user?.role === 'sub_admin' ? 'Manager' : user?.role === 'manager' ? 'TL' : user?.employeeId}
              </div>
            </div>
            <FaChevronDown size={9} style={{ color: 'var(--text-muted)', marginLeft: '2px' }} />
          </Dropdown.Toggle>

          <Dropdown.Menu style={{
            border: '1px solid var(--border)', borderRadius: 'var(--radius)',
            boxShadow: 'var(--shadow-lg)', minWidth: '190px', padding: '6px', marginTop: '6px',
          }}>
            <div style={{ padding: '10px 12px 12px', borderBottom: '1px solid var(--border)', marginBottom: '6px' }}>
              <div style={{
                width: '36px', height: '36px', borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))',
                color: 'white', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: '13px', fontWeight: '700', marginBottom: '8px',
              }}>
                {getInitials(employeeName)}
              </div>
              <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>{employeeName}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>
                {user?.role === 'admin' ? 'Admin' : user?.role === 'hr' ? 'HR' : user?.role === 'sub_admin' ? 'Manager' : user?.role === 'manager' ? 'TL' : user?.employeeId}
              </div>
            </div>

            {(user?.role === 'employee' || user?.role === 'manager') && (
              <Dropdown.Item as={Link} to="/profile" style={{
                borderRadius: 'var(--radius-sm)', fontSize: '13px', padding: '8px 12px',
                display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)',
              }}>
                <FaUser size={12} style={{ color: 'var(--text-muted)' }} /> My Profile
              </Dropdown.Item>
            )}

            <Dropdown.Item
              as={Link}
              to={user?.role === 'admin' || user?.role === 'sub_admin' || user?.role === 'hr' ? '/admin/update-requests' : '/employee/update-requests'}
              style={{
                borderRadius: 'var(--radius-sm)', fontSize: '13px', padding: '8px 12px',
                display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)',
              }}
            >
              <FaEdit size={12} style={{ color: 'var(--text-muted)' }} />
              Update Requests
              {pendingCount > 0 && (
                <Badge bg="danger" pill style={{ marginLeft: 'auto', fontSize: '10px' }}>{pendingCount}</Badge>
              )}
            </Dropdown.Item>

            <Dropdown.Divider style={{ margin: '6px 0', borderColor: 'var(--border)' }} />

            <Dropdown.Item
              onClick={() => { logout(); navigate('/login'); }}
              style={{
                borderRadius: 'var(--radius-sm)', fontSize: '13px', padding: '8px 12px',
                display: 'flex', alignItems: 'center', gap: '8px',
                color: 'var(--danger)', fontWeight: '500',
              }}
            >
              <FaSignOutAlt size={12} /> Sign Out
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown>

      </div>

      {/* ── NOTIFICATION PANEL (absolute) ── */}
      {showNotifications && (
        <div
          ref={notificationRef}
          style={{
            position: 'absolute', right: '16px', top: 'calc(100% + 8px)',
            width: window.innerWidth < 576 ? 'calc(100vw - 32px)' : '380px',
            background: 'white', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-lg)',
            zIndex: 1001, maxHeight: '500px', overflowY: 'auto',
          }}
        >
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '14px 16px', borderBottom: '1px solid var(--border)',
            position: 'sticky', top: 0, background: 'white', zIndex: 1,
          }}>
            <span style={{ fontWeight: '600', fontSize: '14px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              Notifications
              {unreadCount > 0 && <Badge bg="danger" pill style={{ fontSize: '10px' }}>{unreadCount}</Badge>}
            </span>
            {unreadCount > 0 && (
              <button onClick={markAllAsRead} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: '12px', color: 'var(--primary)', fontWeight: '500', padding: 0,
              }}>
                Mark all read
              </button>
            )}
          </div>

          <div style={{ padding: '8px' }}>
            {fetchingNotifications && (
              <div style={{ textAlign: 'center', padding: '16px' }}>
                <Spinner size="sm" animation="border" style={{ color: 'var(--primary)' }} />
              </div>
            )}

            {pendingCount > 0 && (
              <div style={{
                padding: '10px 12px', borderRadius: 'var(--radius-sm)', marginBottom: '6px',
                background: 'var(--warning-light)', border: '1px solid #FDE68A',
                display: 'flex', alignItems: 'center', gap: '10px',
              }}>
                <FaEdit style={{ color: 'var(--warning)', flexShrink: 0 }} size={14} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)' }}>Pending Update Requests</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{pendingCount} request(s) awaiting action</div>
                </div>
                <button
                  onClick={() => { navigate(user?.role === 'admin' || user?.role === 'sub_admin' || user?.role === 'hr' ? '/admin/update-requests' : '/employee/update-requests'); setShowNotifications(false); }}
                  style={{
                    background: 'var(--warning)', color: 'white', border: 'none',
                    borderRadius: 'var(--radius-sm)', padding: '3px 10px',
                    fontSize: '11px', cursor: 'pointer', fontWeight: '500', flexShrink: 0,
                  }}
                >View</button>
              </div>
            )}

            {eventNotifications.filter(e => !e.read).length > 0 && (
              <div style={{ marginBottom: '6px' }}>
                <div style={{ fontSize: '10.5px', fontWeight: '600', color: 'var(--text-muted)', padding: '4px 4px 6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  🎉 Today's Events
                </div>
                {eventNotifications.filter(e => !e.read).map(event => (
                  <div key={event.id} style={{ position: 'relative', marginBottom: '4px' }}>
                    <EventNotification event={event} onClose={() => markEventAsRead(event.id)} />
                    <button
                      onClick={(e) => { e.stopPropagation(); markEventAsRead(event.id); }}
                      style={{ position: 'absolute', top: '6px', right: '6px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px' }}
                    ><FaTimes size={10} /></button>
                  </div>
                ))}
              </div>
            )}

            {notifications.length > 0 ? (
              <div>
                <div style={{ fontSize: '10.5px', fontWeight: '600', color: 'var(--text-muted)', padding: '4px 4px 6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  🔔 Updates
                </div>
                {notifications.map(notif => {
                  const ticketId = notif.metadata?.ticket_id;
                  const handleClick = () => {
                    if (!notif.is_read) markAsRead(notif.id);
                    if (ticketId) { setShowNotifications(false); navigate(`/tickets/${ticketId}`); }
                  };
                  return (
                  <div
                    key={notif.id}
                    onClick={handleClick}
                    style={{
                      padding: '10px 12px', borderRadius: 'var(--radius-sm)', marginBottom: '4px',
                      background: !notif.is_read ? 'var(--primary-light)' : '#F8FAFC',
                      border: `1px solid ${!notif.is_read ? 'var(--primary-muted)' : 'var(--border)'}`,
                      cursor: (!notif.is_read || ticketId) ? 'pointer' : 'default',
                      position: 'relative', display: 'flex', gap: '10px', alignItems: 'flex-start',
                      transition: 'background 0.15s',
                    }}
                  >
                    {getNotificationIcon(notif.type)}
                    <div style={{ flex: 1, minWidth: 0, marginRight: '20px' }}>
                      <p style={{ fontSize: '12px', margin: '0 0 3px', color: 'var(--text-primary)', lineHeight: 1.4 }}>{notif.message}</p>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{formatTime(notif.created_at)}</span>
                      {!notif.is_read && (
                        <span style={{ marginLeft: '8px', background: 'var(--primary)', color: 'white', borderRadius: '4px', fontSize: '10px', padding: '1px 6px', fontWeight: '500' }}>New</span>
                      )}
                      {ticketId && (
                        <span style={{ marginLeft: '8px', fontSize: '11px', fontWeight: '700', color: 'var(--primary)', textDecoration: 'underline' }}>View Ticket →</span>
                      )}
                    </div>
                    <button
                      onClick={(e) => deleteNotification(notif.id, e)}
                      style={{ position: 'absolute', top: '8px', right: '8px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px' }}
                    ><FaTimes size={10} /></button>
                  </div>
                  );
                })}
              </div>
            ) : (
              eventNotifications.filter(e => !e.read).length === 0 && pendingCount === 0 && (
                <div style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--text-muted)' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--body-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
                    <FaBell size={20} style={{ opacity: 0.35 }} />
                  </div>
                  <p style={{ fontSize: '13px', margin: 0, fontWeight: '500' }}>All caught up!</p>
                  <p style={{ fontSize: '12px', margin: '3px 0 0', color: 'var(--text-muted)' }}>No new notifications</p>
                </div>
              )
            )}
          </div>
        </div>
      )}

    </nav>

    {/* Blocking "Ticket Assigned To You" pop-up — no backdrop/ESC dismiss, only the explicit
        Close/View buttons. Reappears on every visit while the ticket stays open/in_progress/
        reopened; stops for good once it reaches resolved_pending or closed. */}
    {blockingTicket && (
      <Modal show onHide={dismissBlockingTicket} backdrop="static" keyboard={false} centered>
        <Modal.Header style={{ background: '#1e2a3e', color: '#fff', border: 'none' }}>
          <Modal.Title style={{ fontSize: 16, display: 'flex', alignItems: 'center', gap: 9 }}>
            <FaExclamationTriangle size={15} color="#fbbf24" />
            Ticket Assigned To You
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary)', marginBottom: 6 }}>
            {blockingTicket.ticket_number}
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 8 }}>{blockingTicket.subject}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 12.5, color: '#4b5563', marginBottom: 10 }}>
            <span><strong>Department:</strong> {blockingTicket.department}</span>
            <span><strong>Priority:</strong> {blockingTicket.priority}</span>
            <span><strong>Raised By:</strong> {blockingTicket.raised_by_name}</span>
          </div>
          {blockingTicket.description && (
            <div style={{ fontSize: 13, color: '#374151', background: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: 8, padding: '10px 12px', maxHeight: 120, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
              {blockingTicket.description}
            </div>
          )}
          {blockingTickets.length > 1 && (
            <div style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 10 }}>+{blockingTickets.length - 1} more ticket{blockingTickets.length > 2 ? 's' : ''} assigned to you</div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" size="sm" onClick={dismissBlockingTicket}>Close</Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => { navigate(`/tickets/${blockingTicket.id}`); dismissBlockingTicket(); }}
          >
            View Ticket
          </Button>
        </Modal.Footer>
      </Modal>
    )}
    </>
  );
};

export default Navbar;
