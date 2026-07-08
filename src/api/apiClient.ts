// ============================================================
// API Client — Axios instance với JWT interceptors
// ============================================================

import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

/// <reference types="vite/client" />

const RAW_API_URL = (import.meta as unknown as { env: { VITE_API_URL?: string } }).env.VITE_API_URL || 'http://localhost:3001';

// Normalize: ensure baseURL ends with `/api` so call sites can use paths like `/auth/...`
const BASE_URL: string = /\/api\/?$/.test(RAW_API_URL)
  ? RAW_API_URL.replace(/\/$/, '')
  : `${RAW_API_URL.replace(/\/$/, '')}/api`;

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor: attach JWT
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('driver_token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (err) => Promise.reject(err),
);

// Response interceptor: auto-refresh or logout
api.interceptors.response.use(
  (res) => res,
  async (err: AxiosError) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('driver_token');
      localStorage.removeItem('driver_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  },
);

export default api;
