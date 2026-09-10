import { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { ArchiveAccess, Role } from './useRole';

export interface RosterEntry {
  uid: string;
  role: Role;
  email?: string;
  displayName?: string;
  photoURL?: string;
  archiveAccess?: ArchiveAccess;
  siteAccess?: boolean;
  analyticsAccess?: boolean;
  /** Set by revokeAccess(); cleared when an admin assigns a role again. */
  revoked?: boolean;
}

/** Everyone with an assignment in `roles/{uid}` — the admin-facing roster.
 *  Listing this collection is only readable by an admin (firestore.rules);
 *  a publisher or scientist calling this gets a permission error on the
 *  snapshot, surfaced as an empty list with `error` set rather than thrown,
 *  since this hook is meant to be safe to mount speculatively. */
export function useRoleRoster() {
  const [entries, setEntries] = useState<RosterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'roles'),
      (snap) => {
        setEntries(snap.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<RosterEntry, 'uid'>) })));
        setLoading(false);
        setError(null);
      },
      (err) => {
        setError(err.code === 'permission-denied' ? 'The team roster is visible to admins only.' : err.message);
        setLoading(false);
      },
    );
    return unsub;
  }, []);

  return { entries, loading, error };
}

export interface GrantEntry {
  email: string;
  role: Role;
  grantedBy?: string;
  grantedAt?: number;
}

/** Email addresses pre-approved for a role before that person has ever
 *  signed in — see roleGrants in firestore.rules and useRole.ts's
 *  applyPendingGrant(). This is the admin's view of outstanding
 *  invitations: everyone in here is "not on the roster yet, but will land
 *  with this role the moment they sign in." */
export function useRoleGrants() {
  const [grants, setGrants] = useState<GrantEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'roleGrants'), orderBy('grantedAt', 'desc')),
      (snap) => {
        setGrants(snap.docs.map((d) => ({ email: d.id, ...(d.data() as Omit<GrantEntry, 'email'>) })));
        setLoading(false);
        setError(null);
      },
      (err) => {
        setError(err.code === 'permission-denied' ? 'Invitations are visible to admins only.' : err.message);
        setLoading(false);
      },
    );
    return unsub;
  }, []);

  return { grants, loading, error };
}

/** Admin-only: pre-approve an email for a role. `email` is lowercased —
 *  Gmail addresses are case-insensitive, and the sign-in check in
 *  useRole.ts looks up the lowercased form, so a grant stored any other way
 *  would silently never match. */
export async function createRoleGrant(email: string, role: Role, grantedBy: string) {
  const id = email.trim().toLowerCase();
  await setDoc(doc(db, 'roleGrants', id), { role, grantedBy, grantedAt: Date.now() });
}

export async function revokeRoleGrant(email: string) {
  await deleteDoc(doc(db, 'roleGrants', email.toLowerCase()));
}
