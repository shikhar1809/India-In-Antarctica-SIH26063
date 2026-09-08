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

import { Link } from 'react-router-dom';
import { BarChart3, Sparkles } from 'lucide-react';
import { useRole } from '../hooks/useRole';
import './MediaHub.css';

export function MediaHub() {
  const { role } = useRole();

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
        ? 'Approve drafted dispatches, review what has published, and track the dissemination queue — all on one page.'
        : 'Draft the public-facing post for each field report, and track what is scheduled to go out.',
    },
  ];

  return (
    <main className="ph-page mh-page">
        <header className="mh-head">
          <h1>Media</h1>
          <p>Content and its reach, in one place.</p>
        </header>

        <div className="mh-grid">
          {cards.map((c) => (
            <Link key={c.title} to={c.to} className="mh-card">
              <span className="mh-icon">{c.icon}</span>
              <strong>{c.title}</strong>
              <p>{c.body}</p>
            </Link>
          ))}
        </div>
    </main>
  );
}
