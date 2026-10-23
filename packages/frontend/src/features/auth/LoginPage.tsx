import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { BrandMark } from '@/components/layout/AppLayout';
import type { ApiResponse, AuthResponse } from '@sonycam/shared';
import { api } from '@/api/client';
import { useAuthStore } from '@/stores/authStore';

export function LoginPage() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<ApiResponse<AuthResponse>>('/auth/login', { username, password });
      if (!res.data.data) throw new Error('Unexpected response');
      setAuth(res.data.data);
    } catch (err) {
      const msg =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ??
        'Login failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-xl">
        <div className="mb-6 flex flex-col items-center gap-3">
          <BrandMark size={40} />
          <h1 className="text-lg font-semibold">Sign in</h1>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="text"
            inputMode="text"
            autoComplete="username"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="rounded-lg border border-border bg-base px-3 py-2.5 outline-none focus:border-primary-500"
          />
          <input
            type="password"
            autoComplete="current-password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg border border-border bg-base px-3 py-2.5 outline-none focus:border-primary-500"
          />

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="mt-1 flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-primary-600 font-medium text-on-accent transition-colors hover:bg-primary-700 disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
