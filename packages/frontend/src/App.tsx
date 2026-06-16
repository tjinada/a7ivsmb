import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/api/client';
import { LoginPage } from '@/features/auth/LoginPage';
import { AppLayout } from '@/components/layout/AppLayout';
import { GalleryPage } from '@/features/gallery/GalleryPage';
import { TransfersPage } from '@/features/transfers/TransfersPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { PWAUpdatePrompt, InstallPrompt, OfflineIndicator } from '@/components/pwa';

export default function App() {
  const token = useAuthStore((s) => s.token);

  // Ensure the read-only media cookie exists for plain <img> loads. Covers
  // sessions that predate the cookie and refreshes its 30-day window on launch.
  useEffect(() => {
    if (token) api.get('/auth/me').catch(() => {});
  }, [token]);

  return (
    <>
      <OfflineIndicator />
      <PWAUpdatePrompt />
      <InstallPrompt />
      {token ? (
        <BrowserRouter>
          <AppLayout>
            <Routes>
              <Route path="/" element={<Navigate to="/gallery" replace />} />
              <Route path="/gallery" element={<GalleryPage />} />
              <Route path="/transfers" element={<TransfersPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/gallery" replace />} />
            </Routes>
          </AppLayout>
        </BrowserRouter>
      ) : (
        <LoginPage />
      )}
    </>
  );
}