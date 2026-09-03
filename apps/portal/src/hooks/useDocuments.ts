import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';
import type { ResearchDocument } from '../types';

/** Live list of every uploaded research document, newest first. */
export function useDocuments() {
  const [docs, setDocs] = useState<ResearchDocument[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'documents'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setDocs(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ResearchDocument));
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, []);

  return { docs, loading };
}
