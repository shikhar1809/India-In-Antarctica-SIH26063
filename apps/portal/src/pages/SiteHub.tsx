/**
 * Site Management — everything about the public site as a property, not
 * just its content.
 *
 * Previously "Site Editor" opened straight into the Puck canvas. That is
 * still exactly what "Edit site content" does here; what is new is putting
 * it beside "View site heatmap" rather than making heatmaps a thing an admin
 * has to know exists and go find on a different domain entirely.
 *
 * Heatmaps and session recordings live on clarity.microsoft.com — Clarity
 * does not offer a public API to embed them in another page, so this links
 * out to the real dashboard rather than faking an embedded view. Configure
 * `VITE_CLARITY_PROJECT_ID` in apps/public-site's environment (see
 * src/clarity.ts) to turn tracking on and light this card up with the real
 * dashboard link; until then it explains what to do instead of pretending
 * data exists.
 */

import { Link } from 'react-router-dom';
import { Flame, MessageCircleQuestion, PenSquare } from 'lucide-react';
import './SiteHub.css';

// Set at build time — same convention as apps/public-site's own env var,
// read here only to decide whether the heatmap card can link straight to
// the dashboard or needs to explain the one-time setup step first.
const CLARITY_PROJECT_ID = import.meta.env.VITE_CLARITY_PROJECT_ID as string | undefined;

export function SiteHub() {
  return (
    <main className="ph-page sh-page">
        <header className="sh-head">
          <h1>Site Management</h1>
          <p>The public site as a property: what visitors do on it, and what is on it.</p>
        </header>

        <div className="sh-grid">
          {CLARITY_PROJECT_ID ? (
            <a
              href={`https://clarity.microsoft.com/projects/view/${CLARITY_PROJECT_ID}/dashboard`}
              target="_blank"
              rel="noreferrer"
              className="sh-card"
            >
              <span className="sh-icon"><Flame className="w-6 h-6" /></span>
              <strong>View site heatmap</strong>
              <p>Where visitors click, scroll and drop off — Microsoft Clarity's live dashboard, in a new tab.</p>
            </a>
          ) : (
            <div className="sh-card sh-card-disabled">
              <span className="sh-icon"><Flame className="w-6 h-6" /></span>
              <strong>View site heatmap</strong>
              <p>
                Not connected yet. Set <code>VITE_CLARITY_PROJECT_ID</code> in
                apps/public-site's environment and redeploy the public site —
                see <code>src/clarity.ts</code>.
              </p>
            </div>
          )}

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
