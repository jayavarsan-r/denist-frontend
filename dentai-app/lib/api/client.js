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

// Response interceptor: unwrap new { success, data } envelope + handle errors
apiClient.interceptors.response.use(
  (response) => {
    // Unwrap { success: true, data: X } so all services keep reading response.data.X unchanged
    if (response.data && response.data.success === true && response.data.data !== undefined) {
      response.data = response.data.data;
    }
    return response;
  },
  (error) => {
    const res = error.response;
    // Standardize error message from new { success: false, error: { code, message } } shape
    if (res?.data?.error?.message) {
      error.message = res.data.error.message;
      error.code = res.data.error.code;
    }
    if (res?.status === 401) {
      clearToken();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('dentai:auth-expired'));
      }
    }
    return Promise.reject(error);
  }
);
