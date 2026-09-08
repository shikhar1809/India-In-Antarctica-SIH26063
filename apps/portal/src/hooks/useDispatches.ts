import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useRole } from './useRole';
import type { Dispatch } from '../types';

/** Live list of field dispatches, newest first — shared by all four tabs of
 *  the field-report pipeline (Send / Review / Approve / Feed), each of which
 *  filters this one list by status.
 *
 *  The query is scoped to match firestore.rules rather than trusting a
 *  client-side filter to hide anything. Publishers and admins read the whole
 *  queue because reviewing it is their job; a scientist reads their own work
 *  and nobody else's, which is what the rule now allows — an unscoped query
 *  from a scientist is rejected outright by Firestore, so this is not a
 *  cosmetic filter but the only shape of request that succeeds.
 *
 *  Scientists sort client-side: pairing where('authorUid') with
 *  orderBy('createdAt') would demand a composite index, and the number of
 *  dispatches one person files in a season does not justify one. */
export function useDispatches() {
  const { user } = useAuth();
  const { role, loading: roleLoading } = useRole();
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [loading, setLoading] = useState(true);

  const reviewer = role === 'publisher' || role === 'admin';

  useEffect(() => {
    // Wait for the role to settle, or a publisher briefly subscribes as a
    // scientist and the queue flickers in from empty.
    if (roleLoading) return;
    if (!user) { setDispatches([]); setLoading(false); return; }

    const q = reviewer
      ? query(collection(db, 'dispatches'), orderBy('createdAt', 'desc'))
      : query(collection(db, 'dispatches'), where('authorUid', '==', user.uid));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Dispatch);
        if (!reviewer) rows.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
        setDispatches(rows);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, [user?.uid, reviewer, roleLoading]);

  return { dispatches, loading };
}
