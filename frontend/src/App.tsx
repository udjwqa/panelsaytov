import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { Layout } from './components/layout/Layout';
import { Login } from './pages/Login';
import { Setup2FA } from './pages/Setup2FA';
import { Dashboard } from './pages/Dashboard';
import { Servers } from './pages/Servers';
import { Sites } from './pages/Sites';
import { Domains } from './pages/Domains';
import { Deploy } from './pages/Deploy';
import { Monitoring } from './pages/Monitoring';
import { Logs } from './pages/Logs';
import { Backups } from './pages/Backups';
import { SettingsPage } from './pages/SettingsPage';
import { Payments } from './pages/Payments';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, needsSetup2FA } = useAuthStore();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Redirect to 2FA setup if not configured
  if (needsSetup2FA) {
    return <Navigate to="/setup-2fa" replace />;
  }

  return <>{children}</>;
}

function App() {
  const { checkAuth, isAuthenticated, needsSetup2FA } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            isAuthenticated && !needsSetup2FA ? <Navigate to="/" replace /> : <Login />
          }
        />
        <Route
          path="/setup-2fa"
          element={
            !isAuthenticated ? <Navigate to="/login" replace /> : <Setup2FA />
          }
        />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="servers" element={<Servers />} />
          <Route path="sites" element={<Sites />} />
          <Route path="domains" element={<Domains />} />
          <Route path="payments" element={<Payments />} />
          <Route path="deploy" element={<Deploy />} />
          <Route path="backups" element={<Backups />} />
          <Route path="monitoring" element={<Monitoring />} />
          <Route path="logs" element={<Logs />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
