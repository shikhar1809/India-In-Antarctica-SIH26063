import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useRole, assignRole } from '../hooks/useRole';
import type { Role } from '../hooks/useRole';
import { useState } from 'react';
import './Header.css';

const ROLE_LABEL: Record<Role, string> = {
  scientist: 'Scientist',
  publisher: 'Publisher',
  admin: 'Admin',
};

function RoleSwitcher() {
  const { user } = useAuth();
  const { role } = useRole();
  const [switching, setSwitching] = useState(false);

  const switchRole = async (r: Role) => {
    if (!user || r === role) return;
    setSwitching(true);
    try { await assignRole(user.uid, r); } finally { setSwitching(false); }
  };

  return (
    <div className="ph-role-switcher" title="Switch your portal role">
      {(['publisher', 'admin'] as Role[]).map((r) => (
        <button
          key={r}
          className={'ph-role-opt' + (role === r ? ' active' : '')}
          onClick={() => switchRole(r)}
          disabled={switching}
        >
          {ROLE_LABEL[r]}
        </button>
      ))}
    </div>
  );
}


export function Header() {
  const { user, signIn, signOut, loading } = useAuth();
  const { role } = useRole();

  const isStaff = role === 'publisher' || role === 'admin';

  return (
    <header className="ph-header">
      <div className="ph-header-inner">
        <NavLink to="/" className="ph-brand">
          <img src="/logo.png" alt="IIA" className="ph-brand-mark" />
          <span className="ph-brand-text">Outreach Portal</span>
        </NavLink>

        <nav className="ph-nav">
          {/* Publishers and admins land on a working console rather than a
              landing page, so "Menu" describes it better than "Home". A
              scientist still sees a home page, and still calls it that. */}
          <NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''}>
            {isStaff ? 'Menu' : 'Home'}
          </NavLink>
          <NavLink to="/repository" className={({ isActive }) => isActive ? "active" : ""}>Archive</NavLink>
          {user && isStaff && (
            <>
              {/* Media is a hub, not a direct link to the review desk — it
                  opens on a choice of Track analytics / View schedule /
                  Generate media rather than always landing on Review. The
                  old standalone "Dashboard" link is gone; its page is one of
                  the hub's three options now, not a fourth thing to find. */}
              <NavLink to="/media" className={({ isActive }) => isActive ? 'active' : ''}>
                Media
              </NavLink>
              {/* Q&A moderation moved inside Site Management as a third
                  card, alongside the heatmap and the content editor — one
                  fewer top-level thing to remember, same reasoning as
                  folding Dashboard into Media above. */}
              {role === 'admin' && (
                <NavLink to="/site" className={({ isActive }) => isActive ? 'active' : ''}>
                  Site Management
                </NavLink>
              )}
            </>
          )}
        </nav>

        <div className="ph-auth">
          {loading ? null : user ? (
            <div className="ph-user">
              <RoleSwitcher />
              {user.photoURL && <img src={user.photoURL} alt="" className="ph-avatar" />}
              <span className="ph-user-name">{user.displayName ?? user.email}</span>
              <button className="ph-btn ghost" onClick={() => signOut()}>Sign out</button>
            </div>
          ) : (
            <button className="ph-btn primary" onClick={() => signIn()}>Sign in with Google</button>
          )}
        </div>
      </div>
    </header>
  );
}
