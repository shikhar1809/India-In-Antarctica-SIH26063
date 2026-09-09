import { useEffect, useState } from 'react';
import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { STATION_COVER_KEY, type Station } from '../repository/contract';

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
function defaultPermissions(role: Role): RolePermissions {
  return {
    archiveAccess: 'all',
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
          setLoading(false);
          return;
        }
        const data = snap.data();
        const r = (data?.role as Role) ?? 'scientist';
        setRole(r);
        setPermissions(resolvePermissions(r, data));
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, [user?.uid]);

  return { role, permissions, loading };
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
 *  is display data, never read for access control. */
export async function assignRole(
  targetUid: string,
  role: Role,
  profile?: { email?: string | null; displayName?: string | null; photoURL?: string | null },
) {
  await setDoc(
    doc(db, 'roles', targetUid),
    {
      role,
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
