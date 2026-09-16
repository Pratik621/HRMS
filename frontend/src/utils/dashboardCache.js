// src/utils/dashboardCache.js
// Lets a dashboard paint instantly from the last-known data on mount/login instead of
// waiting for the network round-trip — the cached snapshot renders immediately, then the
// real fetch runs in the background (silently, no spinner) and replaces it with fresh data
// as each piece resolves. Scoped per employee + per dashboard key so switching accounts
// never shows another user's stale data.
const PREFIX = 'hrms_dash_cache_v1_';

export const loadDashboardCache = (employeeId, key) => {
  if (!employeeId) return null;
  try {
    const raw = localStorage.getItem(`${PREFIX}${key}_${employeeId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const saveDashboardCache = (employeeId, key, data) => {
  if (!employeeId) return;
  try {
    localStorage.setItem(`${PREFIX}${key}_${employeeId}`, JSON.stringify(data));
  } catch {
    // Storage full/unavailable (private browsing, quota) — caching is a pure speed
    // optimization, never something the dashboard should break over.
  }
};

// Called on logout so the next person to use this browser/device never sees a flash of the
// previous employee's cached dashboard before their own login's fresh data arrives.
export const clearAllDashboardCaches = () => {
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith(PREFIX))
      .forEach(k => localStorage.removeItem(k));
  } catch {
    // ignore
  }
};
