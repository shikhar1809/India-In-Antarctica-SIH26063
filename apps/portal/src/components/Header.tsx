import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useRole, assignRole } from '../hooks/useRole';
import type { Role } from '../hooks/useRole';
import { useState } from 'react';
import { logActivity } from '../audit/log';
import './Header.css';

const ROLE_LABEL: Record<Role, string> = {
  scientist: 'Scientist',
  publisher: 'Publisher',
  admin: 'Admin',
  site_manager: 'Site Manager',
};

function RoleSwitcher() {
  const { user } = useAuth();
  const { role, revoked } = useRole();
  const [switching, setSwitching] = useState(false);

  const switchRole = async (r: Role) => {
    if (!user || r === role) return;
    setSwitching(true);
    try {
      await assignRole(user.uid, r, {
        email: user.email, displayName: user.displayName, photoURL: user.photoURL,
      }, { resetPermissions: true });
      void logActivity({ tool: 'Role switcher', action: `Switched own role to ${ROLE_LABEL[r]}`, changes: [`${ROLE_LABEL[role]} → ${ROLE_LABEL[r]}`] });
    } finally { setSwitching(false); }
  };

  // An admin revoked this account: the rules refuse its own role writes, so
  // offering a switcher that can only fail would just be confusing.
  if (revoked) return <span className="ph-role-revoked" title="An admin has revoked your access">Access revoked</span>;

  return (
    <div className="ph-role-switcher" title="Switch your portal role">
      {(['publisher', 'admin', 'site_manager'] as Role[]).map((r) => (
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
  const { role, permissions } = useRole();

  // Media (the review/approve desk) stays scoped to the two roles that have
  // always had it — a site manager is scoped to the public site, not to
  // dispatch review, unless an admin also makes them a publisher/admin.
  // "Menu" (the staff console) is theirs alone too.
  const isStaff = role === 'publisher' || role === 'admin';
  const isConsole = isStaff;
  const canSeeSite = role === 'admin' || permissions.siteAccess;
  // A site manager's portal is the Site section. Home and Archive only
  // appear if an admin has explicitly opened the archive to them on the
  // Access page — App.tsx enforces the same thing on the routes.
  const siteOnly = role === 'site_manager';
  const canSeeArchive = !siteOnly || permissions.archiveAccess !== 'none';

  return (
    <header className="ph-header">
      <div className="ph-header-inner">
        <NavLink to={siteOnly ? '/site' : '/'} className="ph-brand">
          <img src="/logo.png" alt="IIA" className="ph-brand-mark" />
          <span className="ph-brand-text">Outreach Portal</span>
        </NavLink>

        <nav className="ph-nav">
          {/* Publishers and admins land on a working console rather than a
              landing page, so "Menu" describes it better than "Home". A
              scientist still sees a home page, and still calls it that. */}
          {!siteOnly && (
            <NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''}>
              {isConsole ? 'Menu' : 'Home'}
            </NavLink>
          )}
          {canSeeArchive && (
            <NavLink to="/repository" className={({ isActive }) => isActive ? "active" : ""}>Archive</NavLink>
          )}
          {user && isStaff && (
            /* Media is a hub, not a direct link to the review desk — it
               opens on a choice of Track analytics / Manage media rather
               than always landing on Review. The old standalone
               "Dashboard" link is gone; its page is one of the hub's
               options now, not a fourth thing to find. */
            <NavLink to="/media" className={({ isActive }) => isActive ? 'active' : ''}>
              Media
            </NavLink>
          )}
          {user && canSeeSite && (
            /* Q&A moderation moved inside Site as a third card, alongside
               the heatmap and the content editor — one fewer top-level
               thing to remember, same reasoning as folding Dashboard into
               Media above. Open to an admin by default, and to anyone else
               an admin has granted Site access — a site manager, most
               often, via the Access page. */
            <NavLink to="/site" className={({ isActive }) => isActive ? 'active' : ''}>
              Site
            </NavLink>
          )}
          {user && role === 'admin' && (
            /* Used to be a tab buried inside the review desk. Who has
               access is a different kind of decision from what today's
               dispatches need, and an admin reaches for it independently
               of reviewing anything — it earns its own spot in the topbar
               rather than a click through Media. Stays admin-only: a site
               manager can be granted Site or Analytics, never the ability
               to grant access itself. */
            <NavLink to="/roles" className={({ isActive }) => isActive ? 'active' : ''}>
              Access
            </NavLink>
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
