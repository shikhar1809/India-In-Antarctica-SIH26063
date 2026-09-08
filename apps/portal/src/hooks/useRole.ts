import { useEffect, useState } from 'react';
import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';

export type Role = 'scientist' | 'publisher' | 'admin';

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
          setLoading(false);
          return;
        }
        const data = snap.data();
        setRole((data?.role as Role) ?? 'scientist');
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, [user?.uid]);

  return { role, loading };
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
