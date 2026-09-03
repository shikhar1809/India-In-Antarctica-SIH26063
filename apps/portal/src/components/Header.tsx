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
          <NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''}>Home</NavLink>
          <NavLink to="/repository" className={({ isActive }) => isActive ? "active" : ""}>Repository</NavLink>
          {user && isStaff && (
            <>
              <NavLink to="/social" className={({ isActive }) => isActive ? 'active' : ''}>
                {role === 'publisher' ? 'Queue' : 'Review'}
              </NavLink>
              {role === 'admin' && (
                <>
                  <NavLink to="/editor" className={({ isActive }) => isActive ? 'active' : ''}>
                    Site Editor
                  </NavLink>
                  <NavLink to="/moderation" className={({ isActive }) => isActive ? 'active' : ''}>
                    Q&A Moderation
                  </NavLink>
                </>
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
