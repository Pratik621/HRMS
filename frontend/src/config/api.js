// src/config/api.js

// NOTE: VITE_API_URL is applied ONCE, as `baseURL` on the shared axios instance
// (see src/config/axios.js). Every endpoint below must stay a bare relative path
// (e.g. "/api/auth/login") — do NOT prepend VITE_API_URL here too. Doing so
// previously caused every request to carry the prefix twice
// (e.g. "/_/backend/_/backend/api/...") whenever VITE_API_URL was non-empty.

// ─── Startup diagnostics (browser console) ────────────────────────────────────
if (import.meta.env.DEV) {
  console.group('[HRMS] Frontend configuration');
  console.log('MODE         :', import.meta.env.MODE);
  console.log('VITE_API_URL :', import.meta.env.VITE_API_URL || '(not set — /api/* forwarded via Vite proxy → localhost:5000)');
  console.groupEnd();
} else {
  // Production: single-line summary
  console.log('[HRMS] mode=production  api base=' + (import.meta.env.VITE_API_URL || '(relative — served via Vercel rewrite)'));
}

const ep = (path) => path;

export const API_ENDPOINTS = {
  // Manager
  MANAGER_TEAM:         ep('/api/employees/manager/team'),
  MANAGER_UPDATE_SHIFT: (employeeId) => ep(`/api/employees/manager/shift/${employeeId}`),

  // Auth
  LOGIN:   ep('/api/auth/login'),                // login api checks 
  VERIFY:  ep('/api/auth/verify'),
  REFRESH: ep('/api/auth/refresh'),
  REGISTER: ep('/api/auth/register'),
  LOGOUT:  ep('/api/auth/logout'),

  // Password
  PASSWORD_CHANGE:        ep('/api/auth/change-password'),
  PASSWORD_FORGOT:        ep('/api/auth/forgot-password'),   // step 1 + "Resend OTP" — sends a 4-digit OTP by email
  PASSWORD_VERIFY_OTP:    ep('/api/auth/verify-otp'),        // step 2 — verify OTP, returns a short-lived reset token
  PASSWORD_RESET:         ep('/api/auth/reset-password'),    // step 3 — set new password using that reset token

  // Health / test
  TEST:    ep('/api/test'),
  TEST_DB: ep('/api/test-db'),
  HEALTH_CHECK:    ep('/api/health'),
  HEALTH_CHECK_DB: ep('/api/health/db'),

  // Employees
  EMPLOYEES:         ep('/api/employees'),
  EMPLOYEE_BY_ID:    (id) => ep(`/api/employees/${id}`),
  EMPLOYEE_PROFILE:  (employeeId) => ep(`/api/employees/profile/${employeeId}`),
  EMPLOYEE_DOCUMENTS: (employeeId) => ep(`/api/employees/${employeeId}/documents`),
  EMPLOYEE_DOCUMENT_BY_TYPE: (employeeId, documentType) =>
    ep(`/api/employees/${employeeId}/documents/${documentType}`),
  EMPLOYEE_DOCUMENT_DELETE: (employeeId, documentType) =>
    ep(`/api/employees/${employeeId}/documents/${documentType}`),
  EMPLOYEE_DELETE: (id) => ep(`/api/employees/${id}`),
  EMPLOYEE_COMPLETE_PROFILE:       ep('/api/employees/complete-profile'),
  EMPLOYEE_RESET_PROFILE:          (id) => ep(`/api/employees/${id}/reset-profile`),
  EMPLOYEE_TOGGLE_PROFILE_FORM:    (id) => ep(`/api/employees/${id}/toggle-profile-form`),
  EMPLOYEE_UPDATE_ROLE: (id) => ep(`/api/employees/${id}/role`),
  EMPLOYEE_RESET_PASSWORD:   (id) => ep(`/api/employees/${id}/reset-password`),
  EMPLOYEE_TOGGLE_STATUS:    (id) => ep(`/api/employees/${id}/toggle-status`),
  TODAY_EVENTS:    ep('/api/employees/today-events'),
  TODAY_EVENTS_UPCOMING: ep('/api/employees/today-events/upcoming'),
  EMPLOYEE_STATS:  ep('/api/employees/stats/summary'),

  // Leaves
  LEAVES:        ep('/api/leaves'),
  LEAVE_APPLY:   ep('/api/leaves/apply'),
  LEAVE_BY_ID:   (id) => ep(`/api/leaves/${id}`),
  LEAVE_BALANCE: (employeeId) => ep(`/api/leaves/balance/${employeeId}`),
  LEAVE_BALANCE_BULK: ep('/api/leaves/balance-bulk'),
  LEAVE_BALANCE_BY_YEAR: (employeeId, year) => ep(`/api/leaves/balance/${employeeId}/${year}`),
  LEAVE_STATUS:  (id) => ep(`/api/leaves/${id}/status`),
  LEAVE_BY_EMPLOYEE: (employeeId) => ep(`/api/leaves?employee_id=${employeeId}`),
  LEAVE_TYPES:   ep('/api/leaves/types'),
  LEAVE_MANUAL_ACCRUAL: (employeeId) => ep(`/api/leaves/manual-accrual/${employeeId}`),
  LEAVE_YEARLY_RESET: ep('/api/leaves/yearly-reset'),
  LEAVE_ON_LEAVE_TODAY: (scope, department) => ep(`/api/leaves/on-leave-today?scope=${scope}${department ? `&department=${encodeURIComponent(department)}` : ''}`),
  LEAVE_USAGE_BY_TYPE: (employeeId) => ep(`/api/leaves/usage-by-type/${employeeId}`),
  LEAVE_ADJUST_BALANCE: ep('/api/leaves/adjust-balance'),
  LEAVE_ADJUSTMENT_HISTORY: (employeeId) => ep(`/api/leaves/adjustments/${employeeId}`),

  // Attendance
  ATTENDANCE:        ep('/api/attendance'),
  ATTENDANCE_REPORT: ep('/api/attendance/report'),
  ATTENDANCE_EMPLOYEE_REPORT: (employeeId, start, end) =>
    ep(`/api/attendance/employee-report/${employeeId}?start=${start}&end=${end}`),
  ATTENDANCE_TODAY:       (employeeId) => ep(`/api/attendance/today/${employeeId}`),
  ATTENDANCE_CLOCK_IN:    ep('/api/attendance/clock-in'),
  ATTENDANCE_CLOCK_OUT:   ep('/api/attendance/clock-out'),
  ATTENDANCE_HEARTBEAT:   ep('/api/attendance/heartbeat'),
  ATTENDANCE_CHECK_ACTIVE: ep('/api/attendance/check-active'),
  ATTENDANCE_MARK_ABSENT:  ep('/api/attendance/mark-absent'),

  // Attendance regularization
  ATTENDANCE_MISSED_CLOCKOUTS: (employeeId) =>
    ep(`/api/attendance/missed-clockouts/${employeeId}`),
  ATTENDANCE_REGULARIZATION_REQUEST: (employeeId) =>
    ep(`/api/attendance/regularization/${employeeId}/request`),
  ATTENDANCE_PENDING_REGULARIZATIONS: ep('/api/attendance/regularization/pending'),
  ATTENDANCE_MY_REGULARIZATIONS: (employeeId) =>
    ep(`/api/attendance/regularization/mine/${employeeId}`),
  ATTENDANCE_REGULARIZATION_DETAIL: (requestId) =>
    ep(`/api/attendance/regularization/${requestId}`),
  ATTENDANCE_APPROVE_REGULARIZATION: (requestId) =>
    ep(`/api/attendance/regularization/${requestId}/approve`),
  ATTENDANCE_REJECT_REGULARIZATION: (requestId) =>
    ep(`/api/attendance/regularization/${requestId}/reject`),
  ATTENDANCE_CANCEL_REGULARIZATION: (requestId) =>
    ep(`/api/attendance/regularization/${requestId}/cancel`),
  ATTENDANCE_REGULARIZATION_STATS: ep('/api/attendance/regularization/stats'),
  ATTENDANCE_AUTO_CLOSE_STALE: ep('/api/attendance/auto-close-stale'),
  ATTENDANCE_TRIGGER_MISSING_CHECK: ep('/api/attendance/admin/trigger-missing-check'),
  ATTENDANCE_UPDATE_HISTORICAL_LATE_MARKS: ep('/api/attendance/update-historical-late-marks'),

  // Admin mark attendance (Paid Leave / Comp Off)
  ATTENDANCE_ADMIN_MARK: ep('/api/attendance/admin/mark'),

  // Company Holidays (HOL) — HR/Admin only for POST; GET is read-only for any authenticated role
  ATTENDANCE_HOLIDAYS: ep('/api/attendance/holidays'),

  // Attendance Import / Export
  ATTENDANCE_IMPORT_VALIDATE: ep('/api/attendance/import/validate'),
  ATTENDANCE_IMPORT:          ep('/api/attendance/import'),
  ATTENDANCE_EXPORT:          (month, year) => ep(`/api/attendance/export?month=${month}&year=${year}`),
  ATTENDANCE_IMPORT_HISTORY:  ep('/api/attendance/import-history'),

  // Comp-Off
  COMP_OFF_BALANCE: (employeeId) => ep(`/api/attendance/comp-off/${employeeId}`),
  COMP_OFF_HISTORY: (employeeId) => ep(`/api/attendance/comp-off/${employeeId}/history`),

  // Overtime
  OVERTIME_SUMMARY: (employeeId, month, year) =>
    ep(`/api/attendance/overtime/${employeeId}/${month}/${year}`),

  // Salary
  SALARY:               ep('/api/salary'),
  SALARY_EMPLOYEE:      (employeeId) => ep(`/api/salary/employee/${employeeId}`),
  SALARY_BY_ID:         (id) => ep(`/api/salary/${id}`),
  SALARY_GENERATE:      ep('/api/salary/generate'),
  SALARY_GENERATE_BULK: ep('/api/salary/generate-bulk'),
  SALARY_BULK_PAYROLL:  (month, year) => ep(`/api/salary/bulk?month=${month}&year=${year}`),
  SALARY_ADJUSTMENT:    ep('/api/salary/adjustment'),
  SALARY_STATISTICS:    ep('/api/salary/stats/summary'),
  SALARY_MARK_PAID:     (id) => ep(`/api/salary/${id}/mark-paid`),
  SALARY_DELETE:        (id) => ep(`/api/salary/${id}`),
  SALARY_UPDATE:        (id) => ep(`/api/salary/${id}`),

  // Notifications
  NOTIFICATIONS:        ep('/api/notifications'),
  NOTIFICATION_READ:    (id) => ep(`/api/notifications/${id}/read`),
  NOTIFICATION_DELETE:  (id) => ep(`/api/notifications/${id}`),
  NOTIFICATIONS_BY_EMPLOYEE:   (employeeId) => ep(`/api/notifications?employee_id=${employeeId}`),
  NOTIFICATIONS_UNREAD_COUNT:  (employeeId) => ep(`/api/notifications/unread-count/${employeeId}`),
  NOTIFICATION_PREFERENCES:        ep('/api/notifications/preferences'),
  NOTIFICATION_PREFERENCES_UPDATE: ep('/api/notifications/preferences/update'),

  // Notices / Warnings
  NOTICES:              ep('/api/notices'),
  NOTICE_BY_ID:         (id) => ep(`/api/notices/${id}`),
  NOTICES_FOR_EMPLOYEE: (employeeId) => ep(`/api/notices/employee/${employeeId}`),
  NOTICE_READ:          (id) => ep(`/api/notices/${id}/read`),
  NOTICE_DELETE:        (id) => ep(`/api/notices/${id}`),

  // Announcements
  ANNOUNCEMENTS:       ep('/api/announcements'),
  ANNOUNCEMENT_DELETE: (id) => ep(`/api/announcements/${id}`),

  // Ratings
  RATINGS:           ep('/api/ratings'),
  RATINGS_ALL:       ep('/api/ratings/all'),
  RATINGS_ADMIN_RATE: ep('/api/ratings/admin-rate'),

  // Admin updates
  ADMIN_UPDATES:                ep('/api/admin-updates'),
  ADMIN_UPDATES_EMPLOYEES:      ep('/api/admin-updates/employees'),
  ADMIN_UPDATES_SEND_REQUEST:   ep('/api/admin-updates/send-request'),
  ADMIN_UPDATES_COMPLETED:      ep('/api/admin-updates/completed-requests'),
  ADMIN_UPDATES_HANDLE:         ep('/api/admin-updates/handle-request'),
  ADMIN_UPDATES_PENDING_COUNT:  ep('/api/admin-updates/pending-count'),
  ADMIN_UPDATES_MARK_READ:      ep('/api/admin-updates/mark-notifications-read'),
  ADMIN_UPDATES_EMPLOYEE_REQUESTS: (employeeId) =>
    ep(`/api/admin-updates/employee-requests/${employeeId}`),
  ADMIN_UPDATES_SUBMIT: ep('/api/admin-updates/submit-update'),

  // Employee updates
  EMPLOYEE_UPDATES:          ep('/api/employee-updates'),
  EMPLOYEE_UPDATES_PENDING:  ep('/api/employee-updates/pending-requests'),
  EMPLOYEE_UPDATES_ACCEPT:   (requestId) => ep(`/api/employee-updates/accept-request/${requestId}`),
  EMPLOYEE_UPDATES_CURRENT_DATA: ep('/api/employee-updates/current-data'),
  EMPLOYEE_UPDATES_SUBMIT:   ep('/api/employee-updates/submit-update'),
  EMPLOYEE_UPDATES_COMPLETED: ep('/api/employee-updates/completed-requests'),
  EMPLOYEE_UPDATES_REQUEST:  (requestId) => ep(`/api/employee-updates/request/${requestId}`),
  EMPLOYEE_UPDATES_REJECT:   (requestId) => ep(`/api/employee-updates/reject-request/${requestId}`),

  // Update responses
  UPDATE_RESPONSES:     ep('/api/update-responses'),
  UPDATE_RESPONSE_BY_ID: (id) => ep(`/api/update-responses/${id}`),

  // Notice board
  NOTICE_BOARD_ACTIVE:  ep('/api/notice-board/active'),
  NOTICE_BOARD_LIST:    ep('/api/notice-board'),
  NOTICE_BOARD_CREATE:  ep('/api/notice-board'),
  NOTICE_BOARD_UPDATE:  (id) => ep(`/api/notice-board/${id}`),
  NOTICE_BOARD_DELETE:  (id) => ep(`/api/notice-board/${id}`),

  // Public endpoints (no auth)
  LOGIN_FEED:          ep('/api/public/login-feed'),
  OFFICE_EVENTS:       ep('/api/public/office-events'),
  OFFICE_EVENTS_CREATE: ep('/api/public/office-events'),
  OFFICE_EVENT_DELETE: (id) => ep(`/api/public/office-events/${id}`),

  // Shifts
  SHIFTS:       ep('/api/shifts'),
  SHIFT_BY_ID:  (id) => ep(`/api/shifts/${id}`),

  // Housekeeper IP Access Control (admin-only)
  HOUSEKEEPER_NETWORK_POLICY:       ep('/api/admin/housekeeper-network/policy'),
  HOUSEKEEPER_NETWORK_ALLOWLIST:    ep('/api/admin/housekeeper-network/allowlist'),
  HOUSEKEEPER_NETWORK_ALLOWLIST_BY_ID: (id) => ep(`/api/admin/housekeeper-network/allowlist/${id}`),
  HOUSEKEEPER_NETWORK_WHOAMI:       ep('/api/admin/housekeeper-network/whoami'),
  ATTENDANCE_NETWORK_STATUS:        ep('/api/attendance/network-status'),

  // Teams
  TEAMS:                  ep('/api/teams'),
  TEAM_BY_ID:             (id) => ep(`/api/teams/${id}`),
  TEAMS_MANAGERS_LIST:    ep('/api/teams/managers/list'),
  TEAMS_EMPLOYEES_UNASSIGNED: ep('/api/teams/employees/unassigned'),
  TEAMS_HIERARCHY:        ep('/api/teams/hierarchy'),
  TEAMS_MANAGER_SETTINGS: (id) => ep(`/api/teams/manager-settings/${id}`),
  TEAMS_SUB_ADMINS_LIST:  ep('/api/teams/sub-admins/list'),
  TEAMS_HR_LIST:          ep('/api/teams/hr/list'),

  // Onboarding (self-service)
  ONBOARDING_GENERATE:          ep('/api/onboarding/generate'),
  ONBOARDING_LINKS:             ep('/api/onboarding/links'),
  ONBOARDING_LINK_EXPIRE:       (id) => ep(`/api/onboarding/links/${id}/expire`),
  ONBOARDING_LINK_DELETE:       (id) => ep(`/api/onboarding/links/${id}`),
  ONBOARDING_LINK_APPROVE:      (id) => ep(`/api/onboarding/links/${id}/approve`),
  ONBOARDING_LINK_CLEAR_TEMP_PASSWORD: (id) => ep(`/api/onboarding/links/${id}/clear-temp-password`),
  ONBOARDING_LINK_SUBMISSION:   (id) => ep(`/api/onboarding/links/${id}/submission`),
  ONBOARDING_LINK_SEND_EMAIL:   (id) => ep(`/api/onboarding/links/${id}/send-email`),
  ONBOARDING_BY_TOKEN:          (token) => ep(`/api/onboarding/${token}`),
  ONBOARDING_ACCEPT:            (token) => ep(`/api/onboarding/${token}/accept`),
  ONBOARDING_REJECT:            (token) => ep(`/api/onboarding/${token}/reject`),
  ONBOARDING_UPLOAD_FILE:       (token) => ep(`/api/onboarding/${token}/upload-file`),
  ONBOARDING_PRESIGN:           (token) => ep(`/api/onboarding/${token}/presign`),
  ONBOARDING_SUBMIT:            (token) => ep(`/api/onboarding/${token}/submit`),

  OFFER_LETTER_DATA:            (employeeId) => ep(`/api/offer-letters/employee/${employeeId}/data`),
  OFFER_LETTER_HISTORY:         (employeeId) => ep(`/api/offer-letters/employee/${employeeId}/history`),
  OFFER_LETTER_PREVIEW:         (employeeId) => ep(`/api/offer-letters/employee/${employeeId}/preview`),
  OFFER_LETTER_SEND:            (id) => ep(`/api/offer-letters/${id}/send`),
  OFFER_LETTER_RESEND:          (id) => ep(`/api/offer-letters/${id}/resend`),

  // Break management
  BREAK_START:        ep('/api/attendance/break/start'),
  BREAK_END:          ep('/api/attendance/break/end'),
  BREAK_MY_STATUS:    ep('/api/attendance/break/my-status'),
  BREAK_TEAM_ACTIVE:  ep('/api/attendance/break/team-active'),
  BREAK_TEAM_TODAY:   ep('/api/attendance/break/team-today'),
  BREAK_TEAM_STATS:   ep('/api/attendance/break/team-stats'),
  TEAM_LOGIN_BREAK_REPORT: ep('/api/attendance/team-login-break-report'),
  BREAK_NOTIFICATION_SETTINGS: ep('/api/break-notifications/settings'),

  // Geofence
  GEOFENCE_LIST:   ep('/api/geofence/list'),
  GEOFENCE_CREATE: ep('/api/geofence'),
  GEOFENCE_UPDATE: (id) => ep(`/api/geofence/${id}`),
  GEOFENCE_DELETE: (id) => ep(`/api/geofence/${id}`),
  GEOFENCE_GET:    (id) => ep(`/api/geofence/${id}`),
  GEOFENCE_CHECK:  ep('/api/geofence/check'),

  // Tickets
  TICKETS:                ep('/api/tickets'),
  TICKET_COUNT:           ep('/api/tickets/count'),
  TICKET_BY_ID:           (id) => ep(`/api/tickets/${id}`),
  TICKET_COMMENT:         (id) => ep(`/api/tickets/${id}/comment`),
  TICKET_IN_PROGRESS:     (id) => ep(`/api/tickets/${id}/in-progress`),
  TICKET_RESOLVE:         (id) => ep(`/api/tickets/${id}/resolve`),
  TICKET_ACCEPT:          (id) => ep(`/api/tickets/${id}/accept`),
  TICKET_DECLINE:         (id) => ep(`/api/tickets/${id}/decline`),
  TICKET_DEPT_EMPLOYEES:  (dept) => ep(`/api/tickets/dept-employees/${dept}`),

  // Birthday / Anniversary Wishes
  WISHES:          ep('/api/wishes'),
  WISH_LIKE:       (id) => ep(`/api/wishes/${id}/like`),
  WISH_COMMENTS:   (id) => ep(`/api/wishes/${id}/comments`),

  // Dashboard Post / Poll / Praise / Appreciation social feed
  POSTS:           ep('/api/posts'),
  POST_LIKE:       (id) => ep(`/api/posts/${id}/like`),
  POST_REACT:      (id) => ep(`/api/posts/${id}/react`),
  POST_DELETE:     (id) => ep(`/api/posts/${id}`),
  POST_COMMENTS:   (id) => ep(`/api/posts/${id}/comments`),
  POST_UPLOAD_IMAGE: ep('/api/posts/upload-image'),
  POST_FOLLOW:     (employeeId) => ep(`/api/posts/follow/${employeeId}`),
  POST_FOLLOWING:  ep('/api/posts/following'),
  POST_VOTE:        (id) => ep(`/api/posts/${id}/vote`),
  POST_POLL_VOTERS: (id) => ep(`/api/posts/${id}/poll-voters`),
  POST_POLL_STATUS: (id) => ep(`/api/posts/${id}/poll-status`),

  // Email (Admin/HR manual compose)
  EMAIL_SEND:                ep('/api/email/send'),

  // Deductions
  DEDUCTIONS:                ep('/api/deductions'),
  DEDUCTIONS_EMPLOYEE:       (employeeId) => ep(`/api/deductions/employee/${employeeId}`),
  DEDUCTION_DELETE:          (id) => ep(`/api/deductions/${id}`),

  // Performance Reviews
  PERFORMANCE_REVIEWABLE:       ep('/api/performance/reviewable'),
  PERFORMANCE_SUBMIT:           ep('/api/performance/submit'),
  PERFORMANCE_MY_LATEST:        ep('/api/performance/my-latest'),
  PERFORMANCE_MY_HISTORY:       ep('/api/performance/my-history'),
  PERFORMANCE_EMPLOYEE_REVIEWS: (employeeId) => ep(`/api/performance/employee/${employeeId}`),
  PERFORMANCE_TEAM_STATS:       ep('/api/performance/team-stats'),
  PERFORMANCE_ANALYTICS:        ep('/api/performance/analytics'),
  PERFORMANCE_ALL:              ep('/api/performance/all'),
};

export default API_ENDPOINTS;
