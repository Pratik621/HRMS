// src/config/axios.js
import axios from 'axios';
import { syncServerTime } from '../utils/serverTime';
import { isTokenExpired } from '../utils/sessionExpiry';

const API_URL = import.meta.env.VITE_API_URL || '';

const axiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 120000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  withCredentials: true,
});

// ─── helpers ────────────────────────────────────────────────────────────────

const getToken = () => localStorage.getItem('token');
const getRefreshToken = () => localStorage.getItem('refreshToken');

const setTokens = (token, refreshToken) => {
  localStorage.setItem('token', token);
  if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
};

const clearTokens = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
};

const endExpiredSession = () => {
  clearTokens();
  window.dispatchEvent(new CustomEvent('auth:logout'));
  if (window.location.pathname !== '/login') window.location.replace('/login');
};

// ─── refresh token logic ─────────────────────────────────────────────────────

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token);
  });
  failedQueue = [];
};

const refreshAccessToken = async () => {
  const refreshToken = getRefreshToken();
  if (!refreshToken) throw new Error('No refresh token available');

  // Use raw axios — must NOT go through the intercepted instance (would loop)
  const response = await axios.post(`${API_URL}/api/auth/refresh`, { refreshToken });
  if (!response.data.success) throw new Error('Refresh failed');

  const { token: newToken, refreshToken: newRefreshToken, user: freshUser } = response.data;
  setTokens(newToken, newRefreshToken);

  // Keep stored user profile in sync
  if (freshUser) {
    localStorage.setItem('user', JSON.stringify(freshUser));
  }

  return newToken;
};

// ─── request interceptor ─────────────────────────────────────────────────────

axiosInstance.interceptors.request.use(
  (config) => {
    const token = getToken();
    const isLoginCall = ['/api/auth/login', '/api/auth/register'].some(path => (config.url || '').includes(path));
    if (token && isTokenExpired(token) && !isLoginCall) {
      endExpiredSession();
      return Promise.reject(new Error('Your session expired. Please sign in again.'));
    }
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

// ─── response interceptor ────────────────────────────────────────────────────

axiosInstance.interceptors.response.use(
  (response) => {
    // Attendance endpoints (clock-in, clock-out, today's status) return a trusted
    // `server_time` — resync the client's server-time-offset off it whenever present, so the
    // attendance timer stays anchored to the backend clock instead of the device clock.
    if (response?.data?.server_time) syncServerTime(response.data.server_time);
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    const status = error.response?.status;
    const code = error.response?.data?.code;
    const message = error.response?.data?.message || '';

    // Attendance-surface calls (clock in/out, the network-status probe) are handled
    // inline by the dashboard — it hides the clock in/out button and shows a message
    // instead of yanking the user off the page. Any other IP_BLOCKED response (e.g. one
    // slipping through elsewhere) still hard-redirects as a safety net.
    const isAttendanceCall = (originalRequest?.url || '').includes('/api/attendance');
    if (status === 403 && code === 'IP_BLOCKED' && !isAttendanceCall && window.location.pathname !== '/network-blocked') {
      window.location.href = '/network-blocked';
      return Promise.reject(error);
    }

    // Expired sessions must end; only other token failures may attempt recovery.
    const AUTH_ENDPOINTS_EXCLUDED_FROM_REFRESH = ['/api/auth/login', '/api/auth/register', '/api/auth/refresh'];
    const requestUrl = originalRequest?.url || '';
    const isAuthEndpoint = AUTH_ENDPOINTS_EXCLUDED_FROM_REFRESH.some((p) => requestUrl.includes(p));
    const isAuthFailure =
      !isAuthEndpoint &&
      status === 401 &&
      (code === 'TOKEN_EXPIRED' ||
        code === 'NO_TOKEN' ||
        code === 'INVALID_TOKEN' ||
        message === 'Token expired' ||
        message === 'Access token expired');

    const expired = code === 'TOKEN_EXPIRED' || message === 'Token expired' || message === 'Access token expired';
    if (!isAuthEndpoint && status === 401 && expired) {
      endExpiredSession();
      return Promise.reject(error);
    }

    if (isAuthFailure && !originalRequest._retry) {
      originalRequest._retry = true;

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return axiosInstance(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      isRefreshing = true;

      
      try {
        const newToken = await refreshAccessToken();
        processQueue(null, newToken);
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return axiosInstance(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        clearTokens();
        window.dispatchEvent(new CustomEvent('auth:logout'));
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default axiosInstance;
