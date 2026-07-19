import axios, { type InternalAxiosRequestConfig } from 'axios';
import type { ApiResponse, AuthResponse } from '@sonycam/shared';
import { useAuthStore } from '@/stores/authStore';

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
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
    const res = await axios.post<ApiResponse<AuthResponse>>(
      '/api/auth/refresh',
      { refreshToken },
      { withCredentials: true },
    );
    const data = res.data.data;
    if (!data) throw new Error('no data');
    setTokens(data.token, data.refreshToken);
    return data.token;
  } catch {
    clear();
    return null;
  }
}

// Cloudflare Access session recovery.
//
// When the Access session expires, a same-origin XHR to /api is 302-redirected
// cross-origin to the Access login page. The browser follows it, the CORS-
// blocked read surfaces as an error with NO `error.response`, and our own 401
// refresh below never fires. We can't read that response, so we force a
// top-level navigation, which lets Cloudflare present the email login screen.
//
// We probe /api/health with redirect:'manual' to positively confirm it's an
// Access redirect (opaqueredirect) rather than a genuine backend-down blip
// (e.g. mid-deploy), so a 502 never triggers a spurious reload.
async function isAccessRedirect(): Promise<boolean> {
  try {
    const res = await fetch('/api/health', {
      method: 'GET',
      redirect: 'manual',
      credentials: 'include',
      cache: 'no-store',
    });
    return res.type === 'opaqueredirect';
  } catch {
    return false; // real network failure, not an Access redirect
  }
}

function reloadForAccess(): void {
  const KEY = 'cfAccessReloadAt';
  // Guard against reload loops (e.g. if the redirect somehow persists).
  if (Date.now() - Number(sessionStorage.getItem(KEY) ?? 0) < 15000) return;
  sessionStorage.setItem(KEY, String(Date.now()));
  window.location.assign(window.location.href);
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (axios.isCancel(error)) return Promise.reject(error);

    // No HTTP response reached us → possibly a Cloudflare Access redirect our
    // XHR couldn't follow. Confirm and recover via a top-level reload.
    if (!error.response && error.request && (await isAccessRedirect())) {
      reloadForAccess();
      return Promise.reject(error);
    }

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