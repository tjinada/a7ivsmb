import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { LoginPage } from '@/features/auth/LoginPage';
import { AppLayout } from '@/components/layout/AppLayout';
import { GalleryPage } from '@/features/gallery/GalleryPage';
import { TransfersPage } from '@/features/transfers/TransfersPage';
import { SharesPage } from '@/features/shares/SharesPage';
import { CullPage } from '@/features/cull/CullPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { PWAUpdatePrompt, InstallPrompt, OfflineIndicator } from '@/components/pwa';
import { Toaster } from '@/components/Toast';

export default function App() {
  const token = useAuthStore((s) => s.token);
  // The read-only media cookie for plain <img> loads is refreshed by the
  // /auth/me call inside useAppConfig (mounted by AppLayout on every launch).

  return (
    <>
      <OfflineIndicator />
      <Toaster />
      <PWAUpdatePrompt />
      <InstallPrompt />
      {token ? (
        <BrowserRouter>
          <Routes>
            {/* Cull mode is full-screen: no header or tab bar. */}
            <Route path="/cull" element={<CullPage />} />
            <Route
              path="*"
              element={
                <AppLayout>
                  <Routes>
                    <Route path="/" element={<Navigate to="/gallery" replace />} />
                    <Route path="/gallery" element={<GalleryPage />} />
                    <Route path="/shares" element={<SharesPage />} />
                    <Route path="/transfers" element={<TransfersPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route path="*" element={<Navigate to="/gallery" replace />} />
                  </Routes>
                </AppLayout>
              }
            />
          </Routes>
        </BrowserRouter>
      ) : (
        <LoginPage />
      )}
    </>
  );
}
