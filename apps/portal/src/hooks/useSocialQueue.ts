import { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { ScheduledPost } from '../social/queue';

export const SOCIAL_COLLECTION = 'socialPosts';

/** Live view of the dissemination queue, soonest first.
 *
 *  Ordered by `scheduledFor` rather than creation time because the queue is
 *  a schedule: what a publisher needs to see is what goes out next, not what
 *  was typed most recently. Cancelled and posted rows stay in the list — the
 *  point of a queue with an audit trail is that it records what did *not*
 *  happen as well as what did — and the view filters them. */
export function useSocialQueue() {
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, SOCIAL_COLLECTION), orderBy('scheduledFor', 'asc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setPosts(snap.docs.map((d) => ({ ...d.data(), id: d.id }) as ScheduledPost));
        setLoading(false);
        setError(null);
      },
      (err) => {
        // The queue is publisher-and-admin only, so a scientist landing here
        // gets a permission error. Say which it is rather than showing an
        // empty queue, which reads as "nothing scheduled".
        setError(
          err.code === 'permission-denied'
            ? 'The dissemination queue is visible to publishers and admins.'
            : err.message,
        );
        setLoading(false);
      },
    );
    return unsub;
  }, []);

  return { posts, loading, error };
}

/** Writes a new queue entry. The id is deterministic (record + platform +
 *  time), so scheduling the same post twice by double-clicking overwrites one
 *  row instead of creating two that both go out. */
export async function saveScheduledPost(post: ScheduledPost): Promise<void> {
  const { id, ...fields } = post;
  await setDoc(doc(db, SOCIAL_COLLECTION, id), fields);
}

/** Persists a state transition produced by the pure functions in
 *  social/queue.ts. Those return the row as it should now be stored, so this
 *  never recomputes anything — it only writes. */
export async function updateScheduledPost(post: ScheduledPost): Promise<void> {
  const { id, ...fields } = post;
  await updateDoc(doc(db, SOCIAL_COLLECTION, id), fields);
}

/** Removes a queue entry entirely.
 *
 *  Only for posts that never went out — firestore.rules refuses to delete one
 *  whose status is 'posted', because the public saw it and a record that can
 *  erase what it published is not an audit trail. Pulling something you want
 *  to keep a note of is `cancelPost()` instead. */
export async function removeScheduledPost(post: ScheduledPost): Promise<void> {
  await deleteDoc(doc(db, SOCIAL_COLLECTION, post.id));
}
