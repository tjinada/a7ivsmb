import axios, { type InternalAxiosRequestConfig } from 'axios';
import type { ApiResponse, AuthResponse } from '@sonycam/shared';
import { useAuthStore } from '@/stores/authStore';

export const api = axios.create({
  baseURL: '/api',
});

// Attach the access token to every request.
api.interceptors.request.use((cfg) => {
  const token = useAuthStore.getState().token;
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

// On 401, try a single token refresh, then retry the original request.
let refreshing: Promise<string | null> | null = null;

async function refreshTokens(): Promise<string | null> {
  const { refreshToken, setTokens, clear } = useAuthStore.getState();
  if (!refreshToken) {
    clear();
    return null;
  }
  try {
    const res = await axios.post<ApiResponse<AuthResponse>>('/api/auth/refresh', { refreshToken });
    const data = res.data.data;
    if (!data) throw new Error('no data');
    setTokens(data.token, data.refreshToken);
    return data.token;
  } catch {
    clear();
    return null;
  }
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config as InternalAxiosRequestConfig & { _retried?: boolean };
    const status = error.response?.status;

    if (status === 401 && original && !original._retried) {
      original._retried = true;
      refreshing ??= refreshTokens().finally(() => { refreshing = null; });
      const newToken = await refreshing;
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      }
    }
    return Promise.reject(error);
  },
);
