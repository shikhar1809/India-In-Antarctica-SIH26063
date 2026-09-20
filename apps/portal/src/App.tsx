import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useRole } from './hooks/useRole';
import { SecurityCheck } from './components/SecurityCheck';
import { SecurityCheckHarness } from './components/SecurityCheckHarness';
import { useState } from 'react';
import { Header } from './components/Header';
import { SignInScreen } from './pages/SignInScreen';
import { Home } from './pages/Home';
import { Repository } from './pages/Repository';
import { Social } from './pages/Social';
import { SiteEditor } from './pages/SiteEditor';
import { SiteGallery } from './pages/SiteGallery';
import { Moderation } from './pages/Moderation';
import { Analytics } from './pages/Analytics';
import { MediaHub } from './pages/MediaHub';
import { PostRequestWizard } from './pages/PostRequestWizard';
import { SiteHub } from './pages/SiteHub';
import { UptimePage } from './pages/UptimePage';
import { RolesPage } from './pages/RolesPage';
import { CanvasGallery } from './studio/CanvasGallery';
import { StudioHarness } from './studio/StudioHarness';
import { RecordEditorHarness } from './components/RecordEditorHarness';
import { AnalyticsHarness } from './pages/AnalyticsHarness';
import { AccessHarness } from './pages/AccessHarness';
import { PublishedHarness } from './pages/PublishedHarness';
import { ScreenReport } from './pages/ScreenReport';
import { ScreenHarness } from './pages/ScreenHarness';
import { ApproveHarness } from './pages/ApproveHarness';
import './pages/shared.css';

/** Everything a site manager can open: the Site section and its three
 *  pages, plus the archive or the analytics dashboard only when an admin has
 *  explicitly granted them on the Access page. Any other URL — typed,
 *  bookmarked, or left over from switching roles — lands back on Site.
 *
 *  The nav hiding these links is a convenience; this is the part that makes
 *  "site manager sees only Site" true for a direct URL too. */
function SiteManagerRoutes({ archive, analytics }: { archive: boolean; analytics: boolean }) {
  return (
    <Routes>
      <Route path="/site" element={<SiteHub />} />
      <Route path="/site/uptime" element={<UptimePage />} />
      <Route path="/site/gallery" element={<SiteGallery />} />
      <Route path="/editor" element={<SiteEditor />} />
      <Route path="/moderation" element={<Moderation />} />
      {archive && <Route path="/repository" element={<Repository />} />}
      {analytics && <Route path="/analytics" element={<Analytics />} />}
      <Route path="*" element={<Navigate to="/site" replace />} />
    </Routes>
  );
}

/* The security check runs once per sign-in: the key includes the time of
 * the last sign-in, so signing out and back in (or a new session days
 * later) runs it again, while a reload mid-session does not. sessionStorage
 * so closing the tab counts as leaving. */
const CHECK_KEY = 'iia-portal:access-check';

function checkId(user: { uid: string; metadata: { lastSignInTime?: string } }) {
  return `${user.uid}:${user.metadata.lastSignInTime ?? ''}`;
}

function readPassed(): string | null {
  try { return sessionStorage.getItem(CHECK_KEY); } catch { return null; }
}

function Gate() {
  const { user, loading, signOut } = useAuth();
  const { role, permissions, revoked, assigned, loading: roleLoading } = useRole();
  const [passed, setPassed] = useState<string | null>(() => readPassed());

  /* Dev harnesses, ahead of the auth gate on purpose: checking a template
   * change, walking the compose flow, or checking the raw/redacted editor
   * should not require a Google sign-in. All dropped from the production
   * bundle by the DEV guard.
   *   /__canvas        every post template and platform size at once
   *   /__studio         the real five-step compose flow against a mock dispatch
   *   /__recordeditor   the raw/redacted editor against a mock published record
   *   /__analytics      the outreach dashboard against synthetic fixtures
   *   /__access         the activity log and revoke panel against fixtures
   *   /__securitycheck  the sign-in check; ?status=granted|unassigned|revoked
   *   /__postrequest    the admin's create-a-post wizard (never writes)
   *   /__archive        the archive page, without sign-in
   *   /__published      the Published content tab, cross-check fixtures
   *   /__screen         screening a raw report — rules only, never writes
   *   /__approve        the admin's Review & approve queue, with incoming reports */
  if (import.meta.env.DEV) {
    const path = window.location.pathname;
    if (path === '/__canvas') return <CanvasGallery />;
    if (path === '/__studio') return <StudioHarness />;
    if (path === '/__recordeditor') return <RecordEditorHarness />;
    if (path === '/__analytics') return <AnalyticsHarness />;
    if (path === '/__access') return <AccessHarness />;
    if (path === '/__published') return <BrowserRouter><PublishedHarness /></BrowserRouter>;
    if (path === '/__screen') return <BrowserRouter><ScreenHarness /></BrowserRouter>;
    if (path === '/__approve') return <BrowserRouter><ApproveHarness /></BrowserRouter>;
    if (path === '/__securitycheck') return <SecurityCheckHarness />;
    if (path === '/__postrequest') return <BrowserRouter><PostRequestWizard preview /></BrowserRouter>;
    if (path === '/__archive') return <BrowserRouter><div id="archive-harness" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}><Repository preview /></div></BrowserRouter>;
  }

  // Waits for the role as well as the user, so a site manager never sees a
  // flash of the full portal before being routed to Site.
  if (loading || (user && roleLoading)) {
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

  // Revoked mid-session drops straight back into the check, which shows the
  // warning; so does any visit that hasn't passed the check this session.
  if (revoked || passed !== checkId(user)) {
    return (
      <SecurityCheck
        key={user.uid}
        role={role}
        assigned={assigned}
        revoked={revoked}
        onPass={() => {
          const id = checkId(user);
          try { sessionStorage.setItem(CHECK_KEY, id); } catch { /* private mode: runs again next load */ }
          setPassed(id);
        }}
        onSignOut={() => {
          try { sessionStorage.removeItem(CHECK_KEY); } catch { /* ignore */ }
          setPassed(null);
          void signOut();
        }}
      />
    );
  }

  if (role === 'site_manager') {
    return (
      <BrowserRouter>
        <Header />
        <SiteManagerRoutes
          archive={permissions.archiveAccess !== 'none'}
          analytics={permissions.analyticsAccess}
        />
      </BrowserRouter>
    );
  }

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
        <Route path="/media/new" element={<PostRequestWizard />} />
        <Route path="/media/screen/:id" element={<ScreenReport />} />
        <Route path="/site" element={<SiteHub />} />
        <Route path="/site/uptime" element={<UptimePage />} />
        <Route path="/site/gallery" element={<SiteGallery />} />
      <Route path="/site/gallery" element={<SiteGallery />} />
        <Route path="/roles" element={<RolesPage />} />
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
