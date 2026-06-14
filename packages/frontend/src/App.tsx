import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { LoginPage } from '@/features/auth/LoginPage';
import { AppLayout } from '@/components/layout/AppLayout';
import { GalleryPage } from '@/features/gallery/GalleryPage';
import { TransfersPage } from '@/features/transfers/TransfersPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { PWAUpdatePrompt, InstallPrompt, OfflineIndicator } from '@/components/pwa';

export default function App() {
  const token = useAuthStore((s) => s.token);

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
