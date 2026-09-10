/**
 * Site — everything about the public site as a property, not
 * just its content.
 *
 * Previously "Site Editor" opened straight into the Puck canvas. That is
 * still exactly what "Edit site content" does here; what is new is putting
 * it beside "View site heatmap" rather than making heatmaps a thing an admin
 * has to know exists and go find on a different domain entirely.
 *
 * Heatmaps and session recordings live on clarity.microsoft.com — Clarity
 * does not offer a public API to embed them in another page, so this links
 * out to the real dashboard rather than faking an embedded view.
 *
 * The project id is read from `publicSiteData/settings.clarityProjectId` in
 * Firestore — the same doc apps/public-site's clarity.ts reads to decide
 * whether to load the tracking snippet at all, so this card and the actual
 * public site can never disagree about whether Clarity is connected. An
 * admin pastes their Clarity project id below once; no env var, no
 * redeploy. Get one free at clarity.microsoft.com — create a project there,
 * copy its id from Settings → Setup, paste it here.
 */

import { useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { Activity, Flame, MessageCircleQuestion, PenSquare } from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useRole } from '../hooks/useRole';
import { logActivity } from '../audit/log';
import './SiteHub.css';

function ClarityCard({ isAdmin }: { isAdmin: boolean }) {
  const [projectId, setProjectId] = useState<string | null | undefined>(undefined); // undefined = still loading
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'publicSiteData', 'settings'));
        if (cancelled) return;
        const id = (snap.data()?.clarityProjectId as string | undefined) || null;
        setProjectId(id);
        setDraft(id ?? '');
      } catch {
        if (!cancelled) setProjectId(null);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const save = async () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setSaving(true); setErr(null);
    try {
      await setDoc(doc(db, 'publicSiteData', 'settings'), { clarityProjectId: trimmed }, { merge: true });
      void logActivity({
        tool: 'Site analytics', action: 'Connected Microsoft Clarity', target: 'Public site',
        changes: [`Clarity project: ${projectId ?? 'none'} → ${trimmed}`],
      });
      setProjectId(trimmed);
    } catch {
      setErr('Could not save. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  if (projectId) {
    return (
      <a
        href={`https://clarity.microsoft.com/projects/view/${projectId}/dashboard`}
        target="_blank"
        rel="noreferrer"
        className="sh-card"
      >
        <span className="sh-icon"><Flame className="w-6 h-6" /></span>
        <strong>View site heatmap</strong>
        <p>Where visitors click, scroll and drop off — Microsoft Clarity's live dashboard, in a new tab.</p>
      </a>
    );
  }

  return (
    <div className="sh-card sh-card-disabled">
      <span className="sh-icon"><Flame className="w-6 h-6" /></span>
      <strong>View site heatmap</strong>
      {isAdmin ? (
        <>
          <p>
            Not connected. Create a free project at{' '}
            <a href="https://clarity.microsoft.com" target="_blank" rel="noreferrer">clarity.microsoft.com</a>,
            then paste its project id below.
          </p>
          <div className="sh-clarity-connect" onClick={(e) => e.preventDefault()}>
            <input
              type="text"
              placeholder="Clarity project id"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={projectId === undefined}
            />
            <button
              type="button"
              className="ph-btn primary"
              disabled={saving || !draft.trim()}
              onClick={save}
            >{saving ? 'Saving…' : 'Connect'}</button>
          </div>
          {err && <p className="fld-error">{err}</p>}
        </>
      ) : (
        <p>Not connected yet. An admin can connect this from the Site page.</p>
      )}
    </div>
  );
}

export function SiteHub() {
  const { user } = useAuth();
  const { role, permissions, loading } = useRole();
  const canSeeSite = role === 'admin' || permissions.siteAccess;

  // The topbar already hides the "Site" link from anyone without access —
  // this is the same check at the destination, for a direct URL visit.
  if (!user || (!loading && !canSeeSite)) {
    return (
      <main className="ph-page">
        <p className="fld-empty">The site is managed by admins and site managers.</p>
      </main>
    );
  }

  return (
    <main className="ph-page sh-page">
        <header className="sh-head">
          <h1>Site</h1>
          <p>The public site as a property: what visitors do on it, and what is on it.</p>
        </header>

        <div className="sh-grid">
          <ClarityCard isAdmin={role === 'admin'} />

          {/* Sits right below the heatmap card — both are "how is the site
              doing" questions, distinct from the two content-editing cards
              beneath them. Mocked for now (see UptimePage.tsx's own note)
              — no real monitor is wired up, so this shows what the page
              will look like once one is, not real history. */}
          <Link to="/site/uptime" className="sh-card">
            <span className="sh-icon"><Activity className="w-6 h-6" /></span>
            <strong>Uptime &amp; outages</strong>
            <p>A day-by-day view of availability over the last year, and any incidents.</p>
          </Link>

          <Link to="/editor" className="sh-card">
            <span className="sh-icon"><PenSquare className="w-6 h-6" /></span>
            <strong>Edit site content</strong>
            <p>The page builder — hero, gallery, announcements and every other block on the public site.</p>
          </Link>

          <Link to="/moderation" className="sh-card">
            <span className="sh-icon"><MessageCircleQuestion className="w-6 h-6" /></span>
            <strong>Q&amp;A moderation</strong>
            <p>Questions the public asked on "Ask a Scientist" — approve, edit or dismiss before they go live.</p>
          </Link>
        </div>
    </main>
  );
}
