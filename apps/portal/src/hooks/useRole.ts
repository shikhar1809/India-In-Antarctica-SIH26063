import { useEffect, useState } from 'react';
import { deleteField, doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { STATION_COVER_KEY, type Station } from '../repository/contract';
import { setAuditActorRole } from '../audit/log';

export type Role = 'scientist' | 'publisher' | 'admin' | 'site_manager';

/** Which archive records a person can see: everything, nothing, or only the
 *  stations named. Scoping by station rather than by category or record id
 *  matches how the rest of the portal is already organised — a "site
 *  manager" is naturally a manager of one or more stations, not of a slice
 *  of the taxonomy. */
export type ArchiveAccess = 'all' | 'none' | Station[];

export interface RolePermissions {
  archiveAccess: ArchiveAccess;
  siteAccess: boolean;
  analyticsAccess: boolean;
}

/** Permissions nobody has explicitly set fall back to what the role implied
 *  before permissions existed — an admin has always been able to reach Site
 *  and Analytics, a publisher has always been able to reach Analytics, and
 *  everyone has always seen the whole archive. This keeps every roster entry
 *  written before this feature existed behaving exactly as it did. */
export function defaultPermissions(role: Role): RolePermissions {
  return {
    // A site manager is given the Site section and nothing else by default.
    // An admin can still open the archive to one — whole, or a few
    // stations — from the Access page; that is an explicit grant, not the
    // role's starting point.
    archiveAccess: role === 'site_manager' ? 'none' : 'all',
    siteAccess: role === 'admin' || role === 'site_manager',
    analyticsAccess: role === 'admin' || role === 'publisher',
  };
}

function resolvePermissions(role: Role, data: Record<string, unknown> | undefined): RolePermissions {
  const d = defaultPermissions(role);
  const archiveAccess = data?.archiveAccess;
  const siteAccess = data?.siteAccess;
  const analyticsAccess = data?.analyticsAccess;
  return {
    archiveAccess: (archiveAccess === 'all' || archiveAccess === 'none' || Array.isArray(archiveAccess))
      ? (archiveAccess as ArchiveAccess) : d.archiveAccess,
    siteAccess: typeof siteAccess === 'boolean' ? siteAccess : d.siteAccess,
    analyticsAccess: typeof analyticsAccess === 'boolean' ? analyticsAccess : d.analyticsAccess,
  };
}

/** Every station name an archive entry might be keyed under, for whichever
 *  vocabulary it happens to use — deposits key by the canonical `Station`
 *  ('Maitri'), published records key by the cover-art `CoverStation`
 *  ('maitri'). Both spellings of each allowed station go in, lower-cased, so
 *  a caller can match either without knowing which collection it came from. */
export function archiveAccessStationKeys(access: ArchiveAccess): Set<string> | null {
  if (access === 'all' || access === 'none') return null;
  const keys = new Set<string>();
  for (const s of access) {
    keys.add(s.toLowerCase());
    const cover = STATION_COVER_KEY[s];
    if (cover) keys.add(cover.toLowerCase());
  }
  return keys;
}

/** Reads the current user's role from `roles/{uid}`. Defaults to 'scientist'
 *  if no doc exists yet (new sign-ups auto-get the lowest-privilege role).
 *  The first admin must be seeded manually in the Firebase Console.
 *
 *  On a brand-new user (no `roles/{uid}` document at all) this also checks
 *  `roleGrants/{email}` — an admin's pre-approval for that address, added
 *  before the person ever signed in — and applies it as their starting
 *  role. This runs exactly once per account: the check is gated on the
 *  document not existing, not on the role being 'scientist', so a later
 *  manual change by an admin (including one back down to 'scientist')
 *  is never silently overwritten by an old invitation on the next
 *  snapshot. See RolesTable.tsx for where grants are created. */
export function useRole() {
  const { user } = useAuth();
  const [role, setRole] = useState<Role>('scientist');
  const [permissions, setPermissions] = useState<RolePermissions>(defaultPermissions('scientist'));
  const [revoked, setRevoked] = useState(false);
  // Whether a roles doc exists at all — i.e. someone actually granted this
  // account a role, as opposed to it defaulting to Scientist on first
  // sign-in. The security check refuses entry to an unassigned account.
  const [assigned, setAssigned] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }

    const unsub = onSnapshot(
      doc(db, 'roles', user.uid),
      async (snap) => {
        if (!snap.exists()) {
          const applied = await applyPendingGrant(user.uid, user.email, user.displayName, user.photoURL);
          if (applied) return; // the write above re-triggers this listener with real data
          setRole('scientist');
          setPermissions(defaultPermissions('scientist'));
          setAssigned(false);
          setLoading(false);
          return;
        }
        const data = snap.data();
        const r = (data?.role as Role) ?? 'scientist';
        setRole(r);
        setPermissions(resolvePermissions(r, data));
        setRevoked(data?.revoked === true);
        setAssigned(true);
        setAuditActorRole(r);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, [user?.uid]);

  return { role, permissions, revoked, assigned, loading };
}

/** Looks up `roleGrants/{email}` and, if one exists, writes it as the
 *  starting `roles/{uid}` document. Returns whether it applied one, so the
 *  caller can wait for the resulting snapshot instead of flashing
 *  'scientist' first. Safe to call for a user with no grant — `getDoc`
 *  returning nothing is the ordinary case, not an error. */
async function applyPendingGrant(
  uid: string, email: string | null, displayName: string | null, photoURL: string | null,
): Promise<boolean> {
  if (!email) return false;
  try {
    const grant = await getDoc(doc(db, 'roleGrants', email.toLowerCase()));
    const role = grant.data()?.role as Role | undefined;
    if (!role) return false;
    await setDoc(
      doc(db, 'roles', uid),
      { role, email, ...(displayName ? { displayName } : {}), ...(photoURL ? { photoURL } : {}) },
      { merge: true },
    );
    return true;
  } catch {
    // Rules refuse this read for anyone but the grant's own email or an
    // admin — a mismatch here just means there's nothing to apply, not a
    // real failure worth surfacing to a user mid-sign-in.
    return false;
  }
}

/** Admin-only: set another user's role. Writes to `roles/{targetUid}`.
 *  `profile` is optional and denormalised onto the doc purely so
 *  RolesTable.tsx can show a name and an avatar instead of a bare UID — it
 *  is display data, never read for access control.
 *
 *  `resetPermissions` clears any per-person overrides so the role's own
 *  defaults apply. The header's role switcher passes it: switching to Site
 *  Manager to see what a site manager sees is meaningless if an Analytics
 *  grant left over from an earlier role is still showing. The Access page
 *  does not, because an admin changing someone's role there has usually
 *  set their overrides on purpose. */
export async function assignRole(
  targetUid: string,
  role: Role,
  profile?: { email?: string | null; displayName?: string | null; photoURL?: string | null },
  { resetPermissions = false }: { resetPermissions?: boolean } = {},
) {
  await setDoc(
    doc(db, 'roles', targetUid),
    {
      role,
      ...(profile?.email ? { email: profile.email } : {}),
      ...(profile?.displayName ? { displayName: profile.displayName } : {}),
      ...(profile?.photoURL ? { photoURL: profile.photoURL } : {}),
      ...(resetPermissions
        ? { archiveAccess: deleteField(), siteAccess: deleteField(), analyticsAccess: deleteField() }
        : {}),
      // Giving someone a role is also the way back from a revoke.
      revoked: deleteField(),
    },
    { merge: true },
  );
}

/** Admin-only: take away everything. The person drops to Scientist with no
 *  archive, Site or Analytics access, and `revoked` is set — which
 *  firestore.rules reads to refuse their own writes to their roles doc, so
 *  the header's self-service role switcher can't simply switch them back to
 *  Admin. Only an admin assigning them a role again (assignRole above)
 *  clears it. */
export async function revokeAccess(
  targetUid: string,
  profile?: { email?: string | null; displayName?: string | null; photoURL?: string | null },
) {
  await setDoc(
    doc(db, 'roles', targetUid),
    {
      role: 'scientist' satisfies Role,
      archiveAccess: 'none',
      siteAccess: false,
      analyticsAccess: false,
      revoked: true,
      ...(profile?.email ? { email: profile.email } : {}),
      ...(profile?.displayName ? { displayName: profile.displayName } : {}),
      ...(profile?.photoURL ? { photoURL: profile.photoURL } : {}),
    },
    { merge: true },
  );
}

/** Admin-only: change one or more of a person's permissions independent of
 *  their role — e.g. a publisher who should also see Analytics, or a site
 *  manager scoped to one station's archive. Merges onto `roles/{targetUid}`
 *  so it never disturbs the role or profile fields already there. */
export async function setPermissions(targetUid: string, patch: Partial<RolePermissions>) {
  await setDoc(doc(db, 'roles', targetUid), patch, { merge: true });
}
