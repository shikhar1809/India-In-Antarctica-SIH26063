/**
 * The activity log — types, and the one entry the portal still writes.
 *
 * Every create, edit and delete is recorded server side by a Firestore
 * trigger (functions/audit.js): it sees writes from the portal, the field
 * app and the public site alike, and a client cannot skip it. Sign-in checks
 * are recorded by functions/access.js.
 *
 * logActivity() below remains only as the sign-in check's fallback, for the
 * case where the access function cannot be reached — so a visit is still on
 * record, marked as written by the browser.
 *
 * Rules (firestore.rules, match /auditLog): client entries only as yourself,
 * on the server clock; nothing edited or deleted by anyone; admins read.
 */

import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';
import type { Role } from '../hooks/useRole';

export const AUDIT_COLLECTION = 'auditLog';

/** Named tools, so the log can group by them. A string union rather than
 *  free text: "Site editor" and "site editor" must not become two tools. */
export type AuditTool = string;

/** The areas the log is organised by. Written by the server; entries from
 *  before categories existed are mapped by categoryOf(). */
export const AUDIT_CATEGORIES = [
  'Security', 'Access', 'Archive', 'Field reports', 'Post requests', 'Media studio',
  'Review & approval', 'Social', 'Website', 'Profile', 'Support', 'Other',
] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

const LEGACY_TOOL_CATEGORY: Record<string, AuditCategory> = {
  'Sign-in check': 'Security', 'Access': 'Access', 'Role switcher': 'Access',
  'Site editor': 'Website', 'Maintenance mode': 'Website', 'Site analytics': 'Website', 'Q&A moderation': 'Website',
  'Deposit review': 'Archive', 'Historical import': 'Archive', 'Approve desk': 'Review & approval', 'Social queue': 'Social',
};

export function categoryOf(e: { category?: string; tool: string }): AuditCategory {
  if (e.category && (AUDIT_CATEGORIES as readonly string[]).includes(e.category)) return e.category as AuditCategory;
  return LEGACY_TOOL_CATEGORY[e.tool] ?? 'Other';
}

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
  actorRole: Role | 'unknown' | 'system' | 'public';
  category?: AuditCategory;
  /** create / update / delete — set on entries from the audit trigger. */
  op?: 'create' | 'update' | 'delete';
  collection?: string;
  docId?: string;
  /** Something a reviewer should look at: a refused sign-in, a revoke, a
   *  removed record, a failed post, a safety-flagged report. */
  alert?: boolean;
  ip?: string;
  recordedBy?: 'server';
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
