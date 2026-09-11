/**
 * The landing point for content and its reach.
 *
 * "View schedule" and "Generate media" used to be separate cards here, but
 * they were never separate destinations — both landed on `/social`, just on
 * a different one of its tabs, because the dissemination queue and the
 * review/approve desk are two views onto the same job, not two jobs. One
 * card, "Manage media", now points at that page directly; the tab bar
 * already there is how you move between drafting a post and watching what
 * is scheduled.
 *
 * Team management used to be a third tab on that same page too, and it has
 * moved out entirely — see RolesPage.tsx and the "Access" link in the
 * topbar — since who has access is a different kind of decision from what
 * today's dispatches need, and didn't belong sharing a screen with either.
 */

import { Link, useLocation } from 'react-router-dom';
import { BarChart3, CheckCircle2, Plus, Sparkles } from 'lucide-react';
import { useRole } from '../hooks/useRole';
import { useDispatches } from '../hooks/useDispatches';
import './MediaHub.css';

export function MediaHub() {
  const { role } = useRole();
  const { dispatches } = useDispatches();
  const location = useLocation();
  const justRequested = (location.state as { requested?: string } | null)?.requested;
  // Unscreened field reports wait in Manage media's queue; the card says so.
  const unscreened = dispatches.filter((d) => d.status === 'raw').length;
  const isAdmin = role === 'admin';

  /* Requests still with the publishers — sent by an admin, not yet
   * approved. So "did anyone pick up the Ozone Day post?" has an answer
   * here rather than in someone's inbox. */
  const openRequests = dispatches
    .filter((d) => d.request?.kind === 'post-request' && d.status !== 'approved')
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 6);

  const cards = [
    {
      to: '/analytics',
      icon: <BarChart3 className="w-6 h-6" />,
      title: 'Track analytics',
      body: 'What the archive holds, how fast it moves, and what has gone out — the numbers a government outreach programme reports on.',
    },
    {
      to: '/social',
      icon: <Sparkles className="w-6 h-6" />,
      title: 'Manage media',
      body: role === 'admin'
        ? `Screen incoming field reports, approve drafted posts, review what has published, and track the dissemination queue — all on one page.${unscreened ? ` ${unscreened} report${unscreened === 1 ? '' : 's'} waiting to be screened.` : ''}`
        : 'Draft the public-facing post for each field report, and track what is scheduled to go out.',
    },
  ];

  return (
    <main className="ph-page mh-page">
        <header className="mh-head">
          <div>
            <h1>Media</h1>
            <p>Content and its reach, in one place.</p>
          </div>
          {isAdmin && (
            <Link to="/media/new" className="mh-new">
              <Plus size={16} strokeWidth={2.5} /> Create a new post
            </Link>
          )}
        </header>

        {justRequested && (
          <p className="mh-notice"><CheckCircle2 size={15} /> Sent to the publisher queue: “{justRequested.slice(0, 90)}{justRequested.length > 90 ? '…' : ''}”</p>
        )}

        <div className="mh-grid">
          {cards.map((c) => (
            <Link key={c.title} to={c.to} className="mh-card">
              <span className="mh-icon">{c.icon}</span>
              <strong>{c.title}</strong>
              <p>{c.body}</p>
            </Link>
          ))}
        </div>

        {isAdmin && openRequests.length > 0 && (
          <section className="mh-requests">
            <h2>Your open requests</h2>
            <ul>
              {openRequests.map((d) => (
                <li key={d.id}>
                  <span className="mh-req-topic">{d.notes}</span>
                  <span className="mh-req-meta">
                    {d.status === 'drafted' ? 'Drafted — waiting for your approval' : d.status === 'flagged' ? 'Sent back to the publisher' : 'With the publishers'}
                    {d.request?.deadline ? ` · needed by ${new Date(d.request.deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
    </main>
  );
}
