/**
 * Team roles — who has access, and an email-first way to grant it.
 *
 * The old version of this screen was a single UID lookup box: type a
 * Firebase UID, see their role, change it. That only works for someone
 * already on the roster, and nobody has a UID memorised — an admin wanting
 * to make a colleague a publisher had to wait for that person to sign in
 * once, find their UID some other way (the Firebase console, or asking them
 * to paste it from their own "Access" screen), and only then grant
 * anything. "Give this Gmail address publisher access" was not a thing you
 * could actually do here.
 *
 * This adds that: an email is pre-approved via `roleGrants/{email}`
 * (firestore.rules, useRole.ts's applyPendingGrant) and, the moment that
 * address signs in for the first time, lands with the granted role instead
 * of the 'scientist' default. If the address has already signed in at
 * least once — it's already on the roster — the invite path is skipped
 * entirely and the role is just assigned directly, since there's a UID to
 * assign it to and a dangling invitation nobody would ever consume is
 * worse than no invitation.
 *
 * ── On the table itself ─────────────────────────────────────────────────
 * Built as plain markup styled to this portal's own dark surfaces, not the
 * shadcn Table/Avatar/Badge components as supplied — those ship a light
 * zinc theme and Tailwind CSS-variable tokens (bg-primary, text-foreground)
 * this project doesn't define, and pulling in @radix-ui/react-avatar and
 * class-variance-authority for a photo-or-initials circle and a coloured
 * pill is two dependencies for something eight lines of CSS already does
 * elsewhere in this file. The row/column structure and the "click a row's
 * status pill to see the alternative" shape are kept; the implementation
 * is native.
 */

import { Fragment, useMemo, useState } from 'react';
import { ChevronDown, Mail, Shield, SlidersHorizontal, Trash2, UserCog } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  assignRole, setPermissions, type ArchiveAccess, type Role,
} from '../hooks/useRole';
import {
  useRoleRoster, useRoleGrants, createRoleGrant, revokeRoleGrant, type RosterEntry,
} from '../hooks/useRoleRoster';
import { CANONICAL_STATIONS, type Station } from '../repository/contract';
import './RolesTable.css';

const ROLE_LABEL: Record<Role, string> = {
  scientist: 'Scientist', publisher: 'Publisher', admin: 'Admin', site_manager: 'Site Manager',
};
const ROLES: Role[] = ['scientist', 'publisher', 'admin', 'site_manager'];

function Initials({ name, email, photoURL }: { name?: string; email?: string; photoURL?: string }) {
  if (photoURL) return <img className="rt-avatar" src={photoURL} alt="" />;
  const label = name || email || '?';
  const initials = label
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('') || '?';
  return <span className="rt-avatar rt-avatar-fallback" aria-hidden="true">{initials}</span>;
}

function RoleBadge({ role }: { role: Role }) {
  return <span className={'rt-badge role-' + role}>{ROLE_LABEL[role]}</span>;
}

/** Per-person overrides, independent of role: which stations' archive they
 *  can see, and whether Site and Analytics are open to them. Everyone starts
 *  on their role's default (see useRole.ts's defaultPermissions) — this only
 *  writes a field once an admin actually changes it away from that. */
function PermissionsEditor({ entry }: { entry: RosterEntry }) {
  const access = entry.archiveAccess ?? 'all';
  const mode: 'all' | 'none' | 'custom' = access === 'all' || access === 'none' ? access : 'custom';
  const customStations = Array.isArray(access) ? access : [];

  const siteAccess = entry.siteAccess ?? (entry.role === 'admin' || entry.role === 'site_manager');
  const analyticsAccess = entry.analyticsAccess ?? (entry.role === 'admin' || entry.role === 'publisher');

  const setArchiveMode = (next: 'all' | 'none' | 'custom') => {
    const value: ArchiveAccess = next === 'custom' ? (customStations.length > 0 ? customStations : [CANONICAL_STATIONS[0]]) : next;
    void setPermissions(entry.uid, { archiveAccess: value });
  };

  const toggleStation = (station: Station) => {
    const next = customStations.includes(station)
      ? customStations.filter((s) => s !== station)
      : [...customStations, station];
    void setPermissions(entry.uid, { archiveAccess: next.length > 0 ? next : [station] });
  };

  return (
    <div className="rt-perms">
      <div className="rt-perms-row">
        <span className="rt-perms-label">Archive access</span>
        <select value={mode} onChange={(e) => setArchiveMode(e.target.value as 'all' | 'none' | 'custom')}>
          <option value="all">Everything</option>
          <option value="none">Nothing</option>
          <option value="custom">Only certain stations</option>
        </select>
        {mode === 'custom' && (
          <div className="rt-perms-stations">
            {CANONICAL_STATIONS.map((s) => (
              <label key={s} className="rt-perms-chip">
                <input
                  type="checkbox"
                  checked={customStations.includes(s)}
                  onChange={() => toggleStation(s)}
                />
                {s}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="rt-perms-row">
        <label className="rt-perms-toggle">
          <input
            type="checkbox"
            checked={siteAccess}
            onChange={(e) => void setPermissions(entry.uid, { siteAccess: e.target.checked })}
          />
          Site management
        </label>
        <label className="rt-perms-toggle">
          <input
            type="checkbox"
            checked={analyticsAccess}
            onChange={(e) => void setPermissions(entry.uid, { analyticsAccess: e.target.checked })}
          />
          Analytics dashboard
        </label>
      </div>
    </div>
  );
}

export function RolesTable() {
  const { user } = useAuth();
  const { entries, loading: rosterLoading, error: rosterError } = useRoleRoster();
  const { grants, loading: grantsLoading, error: grantsError } = useRoleGrants();

  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('publisher');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpanded = (uid: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid); else next.add(uid);
      return next;
    });
  };

  const rosterByEmail = useMemo(() => {
    const m = new Map<string, RosterEntry>();
    for (const e of entries) if (e.email) m.set(e.email.toLowerCase(), e);
    return m;
  }, [entries]);

  const invite = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !user) return;
    setSending(true); setErr(null); setNotice(null);
    try {
      const existing = rosterByEmail.get(trimmed);
      if (existing) {
        // Already on the roster — there's a UID, so assign directly rather
        // than filing an invitation nobody will ever sign in to consume.
        await assignRole(existing.uid, inviteRole, { email: existing.email, displayName: existing.displayName, photoURL: existing.photoURL });
        setNotice(`${trimmed} already had an account — set to ${ROLE_LABEL[inviteRole]} directly.`);
      } else {
        await createRoleGrant(trimmed, inviteRole, user.uid);
        setNotice(`${trimmed} will become ${ROLE_LABEL[inviteRole]} the moment they sign in.`);
      }
      setEmail('');
    } catch {
      setErr('Could not save. Check your connection and try again.');
    } finally {
      setSending(false);
    }
  };

  const changeRole = async (entry: RosterEntry, role: Role) => {
    if (role === entry.role) return;
    await assignRole(entry.uid, role, { email: entry.email, displayName: entry.displayName, photoURL: entry.photoURL });
  };

  return (
    <div className="rt-pane">
      <div className="rt-invite">
        <Mail size={15} strokeWidth={2.25} className="rt-invite-icon" />
        <input
          type="email"
          placeholder="colleague@gmail.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && invite()}
        />
        <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Role)}>
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
        <button className="ph-btn primary" onClick={invite} disabled={sending || !email.trim()}>
          {sending ? 'Saving…' : 'Grant access'}
        </button>
      </div>
      {notice && <p className="rt-notice">{notice}</p>}
      {err && <p className="fld-error">{err}</p>}

      <h3 className="rt-heading"><UserCog size={13} strokeWidth={2.5} />Team</h3>
      {rosterError && <p className="fld-error">{rosterError}</p>}
      {!rosterError && !rosterLoading && entries.length === 0 && (
        <p className="fld-empty">Nobody has signed in yet.</p>
      )}
      {entries.length > 0 && (
        <div className="rt-table-wrap">
          <table className="rt-table">
            <thead>
              <tr><th>Person</th><th>Role</th><th /><th /></tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <Fragment key={entry.uid}>
                  <tr>
                    <td>
                      <div className="rt-person">
                        <Initials name={entry.displayName} email={entry.email} photoURL={entry.photoURL} />
                        <div>
                          <div className="rt-name">{entry.displayName || entry.email || 'Unknown'}</div>
                          {entry.email && entry.displayName && <div className="rt-email">{entry.email}</div>}
                          {!entry.email && <code className="rt-uid" title={entry.uid}>{entry.uid}</code>}
                        </div>
                      </div>
                    </td>
                    <td><RoleBadge role={entry.role} /></td>
                    <td className="rt-actions">
                      <select
                        value={entry.role}
                        onChange={(e) => changeRole(entry, e.target.value as Role)}
                        aria-label={`Change role for ${entry.displayName || entry.email || entry.uid}`}
                      >
                        {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                      </select>
                    </td>
                    <td className="rt-actions">
                      <button
                        type="button"
                        className={'rt-perms-btn' + (expanded.has(entry.uid) ? ' is-open' : '')}
                        onClick={() => toggleExpanded(entry.uid)}
                        aria-expanded={expanded.has(entry.uid)}
                        aria-label={`Edit permissions for ${entry.displayName || entry.email || entry.uid}`}
                        title="Archive, Site and Analytics access"
                      >
                        <SlidersHorizontal size={13} strokeWidth={2.25} />
                        <ChevronDown size={13} strokeWidth={2.25} className="rt-perms-chevron" />
                      </button>
                    </td>
                  </tr>
                  {expanded.has(entry.uid) && (
                    <tr className="rt-perms-row-wrap">
                      <td colSpan={4}><PermissionsEditor entry={entry} /></td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(grants.length > 0 || grantsLoading) && (
        <>
          <h3 className="rt-heading"><Shield size={13} strokeWidth={2.5} />Pending invitations</h3>
          {grantsError && <p className="fld-error">{grantsError}</p>}
          {grants.length > 0 && (
            <div className="rt-table-wrap">
              <table className="rt-table">
                <thead><tr><th>Email</th><th>Role</th><th /></tr></thead>
                <tbody>
                  {grants.map((g) => (
                    <tr key={g.email}>
                      <td className="rt-email-cell">{g.email}</td>
                      <td><RoleBadge role={g.role} /></td>
                      <td className="rt-actions">
                        <button
                          className="rt-revoke"
                          onClick={() => revokeRoleGrant(g.email)}
                          aria-label={`Revoke invitation for ${g.email}`}
                          title="Revoke"
                        >
                          <Trash2 size={13} strokeWidth={2.25} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
