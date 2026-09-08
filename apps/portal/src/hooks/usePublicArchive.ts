import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';
import type { RepositoryRecord } from '../repository/contract';
import { PUBLIC_COLLECTION } from '../repository/publish';

/** Live list of every record already published to the public site, newest
 *  first. Mirrors useDocuments.ts's shape — same pattern, different
 *  collection — so a Repository.tsx that already reads one reads the other
 *  the same way. */
export function usePublicArchive() {
  const [records, setRecords] = useState<RepositoryRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, PUBLIC_COLLECTION), orderBy('publishedAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setRecords(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as RepositoryRecord));
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, []);

  return { records, loading };
}
