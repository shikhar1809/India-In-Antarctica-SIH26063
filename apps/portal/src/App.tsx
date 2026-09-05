import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Header } from './components/Header';
import { SignInScreen } from './pages/SignInScreen';
import { Home } from './pages/Home';
import { Repository } from './pages/Repository';
import { Social } from './pages/Social';
import { SiteEditor } from './pages/SiteEditor';
import { Moderation } from './pages/Moderation';
import { CanvasGallery } from './studio/CanvasGallery';
import { StudioHarness } from './studio/StudioHarness';
import './pages/shared.css';

function Gate() {
  const { user, loading } = useAuth();

  /* Studio dev harnesses, ahead of the auth gate on purpose: checking a
   * template change or walking the compose flow should not require a Google
   * sign-in. Both are dropped from the production bundle by the DEV guard.
   *   /__canvas  every template and platform size at once
   *   /__studio  the real five-step flow against a mock dispatch */
  if (import.meta.env.DEV) {
    const path = window.location.pathname;
    if (path === '/__canvas') return <CanvasGallery />;
    if (path === '/__studio') return <StudioHarness />;
  }

  if (loading) {
    return (
      <div className="ph-page ph-center">
        <div className="ph-boot">
          <img src="/logo.png" alt="IIA" className="ph-boot-logo" />
          <span>Loading…</span>
        </div>
      </div>
    );
  }

  if (!user) return <SignInScreen />;

  return (
    <BrowserRouter>
      <Header />
      <Routes>
        <Route path="/"        element={<Home />} />
        <Route path="/repository" element={<Repository />} />
        {/* the Knowledge Repository used to live at /library — keep old links working */}
        <Route path="/library" element={<Navigate to="/repository" replace />} />
        <Route path="/social"  element={<Social />} />
        <Route path="/editor"  element={<SiteEditor />} />
        <Route path="/moderation" element={<Moderation />} />
        {/* Scientist-facing Upload/MyRecords removed — scientists use the desktop app */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
