import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Header } from './components/Header';
import { SignInScreen } from './pages/SignInScreen';
import { Home } from './pages/Home';
import { Repository } from './pages/Repository';
import { Social } from './pages/Social';
import { SiteEditor } from './pages/SiteEditor';
import { Moderation } from './pages/Moderation';
import { Analytics } from './pages/Analytics';
import { MediaHub } from './pages/MediaHub';
import { SiteHub } from './pages/SiteHub';
import { CanvasGallery } from './studio/CanvasGallery';
import { StudioHarness } from './studio/StudioHarness';
import { RecordEditorHarness } from './components/RecordEditorHarness';
import './pages/shared.css';

function Gate() {
  const { user, loading } = useAuth();

  /* Dev harnesses, ahead of the auth gate on purpose: checking a template
   * change, walking the compose flow, or checking the raw/redacted editor
   * should not require a Google sign-in. All dropped from the production
   * bundle by the DEV guard.
   *   /__canvas        every post template and platform size at once
   *   /__studio         the real five-step compose flow against a mock dispatch
   *   /__recordeditor   the raw/redacted editor against a mock published record */
  if (import.meta.env.DEV) {
    const path = window.location.pathname;
    if (path === '/__canvas') return <CanvasGallery />;
    if (path === '/__studio') return <StudioHarness />;
    if (path === '/__recordeditor') return <RecordEditorHarness />;
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
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/media" element={<MediaHub />} />
        <Route path="/site" element={<SiteHub />} />
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
