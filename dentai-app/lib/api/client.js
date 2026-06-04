import axios from 'axios';

const TOKEN_KEY = 'dentai_token';
const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://denist-frontend.onrender.com';

export function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
}

export const apiClient = axios.create({
  baseURL: BASE_URL,
});

// Request interceptor: inject Authorization header
apiClient.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor:
//  - Backend now returns a standard envelope { success, data } / { success, error }.
//    On success we UNWRAP `data` so every service keeps doing `return data` and
//    receives the same inner object it did before the envelope existed.
//  - On failure we attach the structured error (`error.apiError = { code, message,
//    details }`) and keep the existing 401 -> logout behavior.
apiClient.interceptors.response.use(
  (response) => {
    const body = response.data;
    if (body && typeof body === 'object' && 'success' in body) {
      if (body.success) {
        response.data = 'data' in body ? body.data : body;
      } else {
        // success:false delivered on a 2xx (defensive) — reject with structured error
        const err = new Error(body.error?.message || 'Request failed');
        err.apiError = body.error || { code: 'UNKNOWN', message: 'Request failed' };
        return Promise.reject(err);
      }
    }
    return response;
  },
  (error) => {
    if (error.response && error.response.status === 401) {
      clearToken();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('dentai:auth-expired'));
      }
    }
    // Surface the structured backend error for UI consumption.
    const body = error.response?.data;
    if (body && body.success === false && body.error) {
      error.apiError = body.error; // { code, message, details }
      error.message = body.error.message || error.message;
    }
    return Promise.reject(error);
  }
);
