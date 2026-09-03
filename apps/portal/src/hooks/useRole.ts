import { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';

export type Role = 'scientist' | 'publisher' | 'admin';

/** Reads the current user's role from `roles/{uid}`. Defaults to 'scientist'
 *  if no doc exists yet (new sign-ups auto-get the lowest-privilege role).
 *  The first admin must be seeded manually in the Firebase Console. */
export function useRole() {
  const { user } = useAuth();
  const [role, setRole] = useState<Role>('scientist');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    const unsub = onSnapshot(
      doc(db, 'roles', user.uid),
      (snap) => {
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

/** Admin-only: set another user's role. Writes to `roles/{targetUid}`. */
export async function assignRole(targetUid: string, role: Role) {
  await setDoc(doc(db, 'roles', targetUid), { role }, { merge: true });
}
