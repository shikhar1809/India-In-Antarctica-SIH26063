/**
 * The landing point for everything about content and its reach.
 *
 * Previously this nav item went straight to the review desk, and analytics
 * lived behind a separate "Dashboard" link — two things to remember, neither
 * named for what it actually was. Media is a hub instead: three questions a
 * publisher or admin actually asks, each pointing at the page that answers
 * it. "Generate media" opens the review/approve desk on the tab that role
 * uses; "View schedule" opens the dissemination queue directly; "Track
 * analytics" opens the archive dashboard — the same page the old "Dashboard"
 * link pointed to, just reached from here instead of standing on its own.
 */

import { Link } from 'react-router-dom';
import { BarChart3, CalendarClock, Sparkles } from 'lucide-react';
import { Header } from '../components/Header';
import { useRole } from '../hooks/useRole';
import './MediaHub.css';

export function MediaHub() {
  const { role } = useRole();

  // A publisher's job on the review desk is drafting; an admin's is
  // approving. "Generate media" should land on the tab that role actually
  // works in, not force a click to get there.
  const generateTab = role === 'admin' ? 'approve' : 'review';

  const cards = [
    {
      to: '/analytics',
      icon: <BarChart3 className="w-6 h-6" />,
      title: 'Track analytics',
      body: 'What the archive holds, how fast it moves, and what has gone out — the numbers a government outreach programme reports on.',
    },
    {
      to: '/social?tab=queue',
      icon: <CalendarClock className="w-6 h-6" />,
      title: 'View schedule',
      body: 'The dissemination queue: what is waiting to post, what needs a human, and what already went out.',
    },
    {
      to: `/social?tab=${generateTab}`,
      icon: <Sparkles className="w-6 h-6" />,
      title: 'Generate media',
      body: role === 'admin'
        ? 'Approve drafted dispatches, or send one back with a note.'
        : 'Review incoming field reports and compose the public-facing post for each.',
    },
  ];

  return (
    <>
      <Header />
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
    </>
  );
}
