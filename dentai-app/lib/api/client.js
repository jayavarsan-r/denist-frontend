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

// Response interceptor: handle 401
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      clearToken();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('dentai:auth-expired'));
      }
    }
    return Promise.reject(error);
  }
);
