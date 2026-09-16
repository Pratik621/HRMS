// src/context/AuthContext.jsx
import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import axiosInstance from '../config/axios';
import API_ENDPOINTS from '../config/api';
import { clearAllDashboardCaches } from '../utils/dashboardCache';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

// ─── token helpers ────

const loadFromStorage = () => {
  try {
    const user = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    const refreshToken = localStorage.getItem('refreshToken');
    return {
      user: user ? JSON.parse(user) : null,
      token: token || null,
      refreshToken: refreshToken || null,
    };
  } catch {
    return { user: null, token: null, refreshToken: null };
  }
};

const persistToStorage = (user, token, refreshToken) => {
  localStorage.setItem('user', JSON.stringify(user));
  localStorage.setItem('token', token);
  if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
};

const clearStorage = () => {
  localStorage.removeItem('user');
  localStorage.removeItem('token');
  localStorage.removeItem('refreshToken');
};

// ─── provider ────────────────────────────────────────────────────────────────

export const AuthProvider = ({ children }) => {
  const stored = loadFromStorage();
  const [user, setUser] = useState(stored.user);
  const [token, setToken] = useState(stored.token);
  const [loading, setLoading] = useState(true);

  // Wired logout so interceptor can call it via custom event
  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    clearStorage();
    clearAllDashboardCaches();
  }, []);

  // On mount: validate / silently refresh the stored access token
  useEffect(() => {
    // React 18 StrictMode double-invokes mount effects in dev — this AbortController stops
    // the first (throwaway) invocation's /verify call from completing as a wasted duplicate
    // request; only the second, real invocation's response is ever acted on.
    const controller = new AbortController();

    const init = async () => {
      const { user: savedUser, token: savedToken, refreshToken: savedRefresh } = loadFromStorage();

      if (!savedToken && !savedRefresh) {
        setLoading(false);
        return;
      }

      try {
        // Try to verify the access token    // Changes by pratik for /verify api
        const res = await axiosInstance.post(API_ENDPOINTS.VERIFY, {}, {
          headers: { Authorization: `Bearer ${savedToken}` },
          signal: controller.signal,
        });

        if (res.data.success) {
          const freshUser = res.data.user;
          setUser(freshUser);
          setToken(savedToken);
          persistToStorage(freshUser, savedToken, savedRefresh);
        } else {
          logout();
        }
      } catch (err) {
        if (axiosInstance.isCancel?.(err) || err.code === 'ERR_CANCELED') return;

        console.error("AUTH VERIFY FAILED:", err);
        console.error("STATUS:", err.response?.status);
        console.error("RESPONSE:", err.response?.data);

        // A 401/403 here means the backend explicitly rejected the session — and the
        // axios interceptor's own silent refresh-and-retry (see config/axios.js) already
        // had its chance to fix this transparently before this promise ever rejected.
        // Reaching this catch with a 401/403 means the session is genuinely dead: treating
        // the stale localStorage copy as still-good (the old behavior) let the Dashboard,
        // Navbar, and every other mount-time fetch proceed with a token the backend had
        // just rejected, so every one of them independently 401'd right after — the
        // "many different endpoints failing at once" pattern this was causing.
        const status = err.response?.status;
        if (status === 401 || status === 403) {
          logout();
        } else {
          // Couldn't confirm either way (network blip, backend momentarily unreachable) —
          // keep the existing session optimistically rather than force a logout for a
          // problem that has nothing to do with the token's validity.
          const refreshed = loadFromStorage();
          if (refreshed.token && refreshed.user) {
            setUser(refreshed.user);
            setToken(refreshed.token);
          } else {
            logout();
          }
        }
      } finally {
        // Only the invocation whose OWN controller was never aborted should flip `loading`.
        // Under StrictMode's double-invoke, the first invocation's controller gets aborted by
        // the synthetic cleanup — if its finally still cleared `loading`, PrivateRoute would
        // let the app render one tick before the second (real) invocation's /verify result
        // ever came back, reopening the exact "renders before auth is confirmed" race this
        // whole effect exists to prevent.
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    init();
    return () => controller.abort();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for the interceptor's forced-logout signal
  useEffect(() => {
    const handler = () => logout();
    window.addEventListener('auth:logout', handler);
    return () => window.removeEventListener('auth:logout', handler);
  }, [logout]);

  // ─── login ──────────────────────────────────────────────────────────────────

  const login = async (identifier, password) => {
    try {
      const response = await axiosInstance.post(API_ENDPOINTS.LOGIN, { identifier, password });

      if (!response.data.success) {
        return { success: false, message: response.data.message || 'Login failed' };
      }

      const userData = response.data.user;
      const accessToken = response.data.token;
      const refreshToken = response.data.refreshToken;

      setUser(userData);
      setToken(accessToken);
      persistToStorage(userData, accessToken, refreshToken);

      return { success: true, user: userData };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || 'Login failed. Please try again.',
      };
    }
  };

  const updateUser = (patch) => {
    setUser(prev => {
      const updated = { ...prev, ...patch };
      const { token: t, refreshToken: r } = loadFromStorage();
      persistToStorage(updated, t, r);
      return updated;
    });
  };

  // ─── value ──────────────────────────────────────────────────────────────────

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};