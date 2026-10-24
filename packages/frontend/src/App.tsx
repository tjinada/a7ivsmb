import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { LoginPage } from '@/features/auth/LoginPage';
import { AppLayout } from '@/components/layout/AppLayout';
import { GalleryPage } from '@/features/gallery/GalleryPage';
import { TransfersPage } from '@/features/transfers/TransfersPage';
import { SharesPage } from '@/features/shares/SharesPage';
import { JobsPage } from '@/features/jobs/JobsPage';
import { CullPage } from '@/features/cull/CullPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { PWAUpdatePrompt, InstallPrompt, OfflineIndicator } from '@/components/pwa';
import { Toaster } from '@/components/Toast';

/** Redirect that keeps the query string (e.g. /shares?album=… → /clients?album=…). */
function Redirect({ to }: { to: string }) {
  const { search } = useLocation();
  return <Navigate to={`${to}${search}`} replace />;
}

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
                    <Route path="/shoots" element={<JobsPage />} />
                    <Route path="/clients" element={<SharesPage />} />
                    {/* Old names, kept so bookmarks and installed shortcuts still land. */}
                    <Route path="/jobs" element={<Redirect to="/shoots" />} />
                    <Route path="/shares" element={<Redirect to="/clients" />} />
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
