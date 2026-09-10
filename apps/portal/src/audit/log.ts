/**
 * The activity log — who did what, with which tool, and what it changed.
 *
 * Every entry is one document in `auditLog`, written by the portal at the
 * moment an action succeeds. It carries the actor's name, email and role *as
 * they were at the time*: a person later promoted or revoked should not have
 * their history rewritten under their new role.
 *
 * What the rules guarantee (firestore.rules, match /auditLog):
 *   - an entry can only be written as yourself (actorUid == your uid), with
 *     the server's own clock — nobody can file an entry as someone else, or
 *     backdate one;
 *   - nothing can be edited or deleted from the client, by anyone, admins
 *     included. A log an admin can tidy is not a log.
 *   - only admins can read it.
 *
 * What it does not guarantee: that every action is logged. The portal writes
 * the entry, so a modified client could skip it. Making that impossible
 * means moving the logging into Cloud Function triggers on each collection;
 * this is the version that shows *which tool* was used and *why*, which a
 * trigger watching raw writes cannot see.
 *
 * Logging never blocks the action it describes. By the time logActivity()
 * runs the change is already saved; a failed log write is reported to the
 * console and swallowed rather than turned into an error for someone whose
 * edit actually worked.
 */

import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';
import type { Role } from '../hooks/useRole';

export const AUDIT_COLLECTION = 'auditLog';

/** Named tools, so the log can group by them. A string union rather than
 *  free text: "Site editor" and "site editor" must not become two tools. */
export type AuditTool =
  | 'Site editor'
  | 'Maintenance mode'
  | 'Site analytics'
  | 'Q&A moderation'
  | 'Deposit review'
  | 'Approve desk'
  | 'Social queue'
  | 'Historical import'
  | 'Access'
  | 'Role switcher'
  | 'Sign-in check';

export interface AuditInput {
  tool: AuditTool;
  /** Short verb phrase: "Published site changes", "Revoked access". */
  action: string;
  /** What it was done to, when there is one: a person, a record id. */
  target?: string;
  /** Itemised changes — "Edited Hero: heading, body". Capped at 30. */
  changes?: string[];
}

export interface AuditEntry extends AuditInput {
  id: string;
  at: number;
  actorUid: string;
  actorName: string | null;
  actorEmail: string | null;
  actorRole: Role | 'unknown';
  /** Set on sign-in checks that were refused — an unassigned or revoked
   *  account reaching the portal. Written by functions/access.js. */
  alert?: boolean;
  ip?: string;
}

/* The actor's current role, kept current by useRole()'s snapshot listener.
 * Held here rather than looked up per entry: every action would otherwise
 * cost an extra read, and useRole already has the answer. */
let currentRole: Role | 'unknown' = 'unknown';

export function setAuditActorRole(role: Role) {
  currentRole = role;
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

export async function logActivity(input: AuditInput): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  try {
    await addDoc(collection(db, AUDIT_COLLECTION), {
      at: serverTimestamp(),
      actorUid: user.uid,
      actorName: user.displayName ?? null,
      actorEmail: user.email ?? null,
      actorRole: currentRole,
      tool: input.tool,
      action: clip(input.action, 160),
      target: input.target ? clip(input.target, 160) : null,
      changes: (input.changes ?? []).slice(0, 30).map((c) => clip(c, 240)),
    });
  } catch (err) {
    console.warn('activity log: could not record', input.tool, input.action, err);
  }
}
