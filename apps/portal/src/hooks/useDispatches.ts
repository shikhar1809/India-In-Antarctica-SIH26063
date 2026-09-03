import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';
import type { Dispatch } from '../types';

/** Live list of every field dispatch, newest first — shared by all four
 *  tabs of the field-report pipeline (Send / Review / Approve / Feed), each
 *  of which just filters this one list by status. */
export function useDispatches() {
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'dispatches'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setDispatches(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Dispatch));
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, []);

  return { dispatches, loading };
}
