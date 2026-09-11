import { useAuth } from '../context/AuthContext';
import { useRole } from '../hooks/useRole';
import FlowingMenu from '../components/FlowingMenu';
import './Home.css';

const SCIENTIST_ITEMS = [
  {
    link: '/repository',
    text: 'Access existing records',
    image: 'https://images.unsplash.com/photo-1517783999520-f068d7431a60?q=80&w=600&h=400&fit=crop&sat=-100&auto=format',
  },
];

const PUBLISHER_ITEMS = [
  {
    link: '/repository',
    text: 'Archive',
    image: 'https://images.unsplash.com/photo-1517783999520-f068d7431a60?q=80&w=600&h=400&fit=crop&sat=-100&auto=format',
  },
  {
    link: '/social',
    text: 'Review field dispatches',
    image: 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?q=80&w=600&h=400&fit=crop&sat=-100&auto=format',
  },
];

const ADMIN_ITEMS = [
  {
    link: '/repository',
    text: 'Archive',
    image: 'https://images.unsplash.com/photo-1517783999520-f068d7431a60?q=80&w=600&h=400&fit=crop&sat=-100&auto=format',
  },
  {
    link: '/social',
    text: 'Approve dispatches',
    image: 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?q=80&w=600&h=400&fit=crop&sat=-100&auto=format',
  },
  {
    link: '/roles',
    text: 'Manage team roles',
    image: 'https://images.unsplash.com/photo-1494783367193-149034c05e8f?q=80&w=600&h=400&fit=crop&sat=-100&auto=format',
  },
  {
    // The Site hub, not the page editor directly: it lists every site tool
    // (analytics, uptime, content editor, Q&A moderation).
    link: '/site',
    text: 'Site Builder',
    image: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=600&h=400&fit=crop&sat=-100&auto=format',
  },
];

const ROLE_SUB: Record<string, string> = {
  scientist: 'Field reports are submitted through the IIA desktop app.',
  publisher: 'Review incoming dispatches and draft captions for approval.',
  admin:     'Approve dispatches, manage the live feed, and assign team roles.',
};

// The topbar link to /repository already reads "Archive" — this kicker used
// to say "Knowledge Repository" for everyone, the one place that rename
// hadn't reached yet.
const ROLE_KICKER: Record<string, string> = {
  scientist: 'Knowledge Repository',
  publisher: 'Archive',
  admin:     'Archive',
};

export function Home() {
  const { user } = useAuth();
  const { role, loading } = useRole();
  const firstName = user?.displayName?.split(' ')[0];

  const items =
    role === 'admin'     ? ADMIN_ITEMS :
    role === 'publisher' ? PUBLISHER_ITEMS :
    SCIENTIST_ITEMS;

  return (
    <div className="home-page">
      <div className="home-hero">
        <span className="home-kicker">{ROLE_KICKER[role] ?? 'Knowledge Repository'}</span>
        <h1>{firstName ? `Welcome, ${firstName}` : 'Welcome'}</h1>
        {!loading && <p className="home-sub">{ROLE_SUB[role]}</p>}
      </div>

      <div className="home-flow">
        <FlowingMenu
          items={items}
          speed={15}
          textColor="#ffffff"
          bgColor="#0a141d"
          marqueeBgColor="#ffffff"
          marqueeTextColor="#0a141d"
          borderColor="#ffffff"
        />
      </div>
    </div>
  );
}
