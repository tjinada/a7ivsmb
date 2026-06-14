import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthUser } from '@sonycam/shared';

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  setAuth: (data: { token: string; refreshToken: string; user: AuthUser }) => void;
  setTokens: (token: string, refreshToken: string) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      refreshToken: null,
      user: null,
      setAuth: ({ token, refreshToken, user }) => set({ token, refreshToken, user }),
      setTokens: (token, refreshToken) => set({ token, refreshToken }),
      clear: () => set({ token: null, refreshToken: null, user: null }),
    }),
    { name: 'sonycam-auth' },
  ),
);
