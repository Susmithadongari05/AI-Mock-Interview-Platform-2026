// ============================================
// api.js - Axios instance
// ============================================
// Base URL: VITE_API_URL if set (e.g. https://api.example.com/api for production),
// otherwise "/api" which the Vite dev-server proxy forwards to the backend.
// AI calls (question generation, feedback) can take a while, hence the long timeout.
// ============================================

import axios from 'axios';

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 120000,
});

API.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// A 401 from a protected endpoint means the session is invalid/expired: clear it and go to login.
// (Login/register 401s are shown as normal form errors, so they are excluded.)
API.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || '';
    const isAuthForm = url.includes('/auth/login') || url.includes('/auth/register');
    if (error.response?.status === 401 && !isAuthForm && localStorage.getItem('token')) {
      localStorage.removeItem('token');
      if (window.location.pathname !== '/login') window.location.assign('/login');
    }
    return Promise.reject(error);
  }
);

/**
 * Turn any axios error into a message that states the REAL cause:
 * the server's own message when there is one, otherwise a network/timeout explanation.
 */
export const getErrorMessage = (error, fallback = 'Something went wrong.') => {
  if (error?.response?.data?.message) return error.response.data.message;
  if (error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError') return 'Cancelled.';
  if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') return 'The request timed out. The server or an AI service took too long; please try again.';
  if (error?.request && !error.response) {
    return 'Cannot reach the server. Make sure the backend is running (npm run dev in the server folder) and try again.';
  }
  return error?.message || fallback;
};

export default API;
