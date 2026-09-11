/**
 * The audit trail — every write to the database, recorded by the server.
 *
 * One Firestore trigger watches every top-level collection. When anything is
 * created, edited or deleted — from the portal, the field app, the public
 * site, or a Cloud Function — it works out who did it (Firebase passes the
 * caller's identity with the event), what kind of change it was, and which
 * fields changed, and files one entry in `auditLog` under a category.
 *
 * Why here and not in the portal. The portal used to write these entries
 * itself, which had two holes: anything written by the Flutter field app or
 * the public site was never logged, and a modified browser could simply not
 * write the entry. A trigger sees every write regardless of where it came
 * from, and cannot be skipped by the client. The sign-in check is the one
 * entry still written elsewhere (access.js), because it records a visit
 * rather than a write.
 *
 * What is deliberately NOT logged: writes to auditLog itself (it would log
 * its own logging forever), the identifier counters, and a post's
 * engagement numbers being refreshed by the analytics sync — hundreds of
 * entries a day saying "likes went from 4 to 5" would bury everything that
 * matters.
 */

const { onDocumentWrittenWithAuthContext } = require('firebase-functions/v2/firestore');
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

if (!getApps().length) initializeApp();
const db = getFirestore();

const ROLE_LABEL = { scientist: 'Scientist', publisher: 'Publisher', admin: 'Admin', site_manager: 'Site Manager' };
const SKIP = new Set(['auditLog', 'counters']);

/** Fields that change on nearly every save and say nothing by themselves. */
const NOISE = new Set(['updatedAt', 'lastSeenAt']);

/* ═══════════════════════════════════════════════════════════════ actors ══ */

const actorCache = new Map();
const ACTOR_TTL = 5 * 60 * 1000;

/** Who made the write: a signed-in person (name, email, role now), a
 *  service (a Cloud Function), or an anonymous visitor to the public site. */
async function resolveActor(authType, authId) {
  if (authType === 'service_account') {
    return { uid: `service:${authId || 'system'}`, name: 'System (Cloud Function)', email: null, role: 'system' };
  }
  if (authType !== 'app_user' || !authId) {
    return { uid: 'anonymous', name: 'Public visitor', email: null, role: 'public' };
  }
  const hit = actorCache.get(authId);
  if (hit && Date.now() - hit.at < ACTOR_TTL) return hit.actor;
  let name = null;
  let email = null;
  let role = 'unknown';
  try {
    const u = await getAuth().getUser(authId);
    name = u.displayName || null;
    email = u.email || null;
  } catch { /* deleted or unknown account — still log the uid */ }
  try {
    const r = await db.collection('roles').doc(authId).get();
    if (r.exists && r.data().role) role = r.data().role;
  } catch { /* ignore */ }
  const actor = { uid: authId, name, email, role };
  actorCache.set(authId, { at: Date.now(), actor });
  return actor;
}

/* ═══════════════════════════════════════════════════════════════ diffs ══ */

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function show(v) {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'on' : 'off';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return v.length > 70 ? `“${v.slice(0, 69)}…”` : `“${v}”`;
  if (Array.isArray(v)) return `${v.length} item${v.length === 1 ? '' : 's'}`;
  if (typeof v.toMillis === 'function') return new Date(v.toMillis()).toISOString().slice(0, 16).replace('T', ' ');
  return 'details';
}

/** "field: old → new" for each changed field, one level into maps (so
 *  metadata.station reads as its own change). */
function fieldDiff(before = {}, after = {}, labels = {}, prefix = '') {
  const out = [];
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  for (const k of keys) {
    if (NOISE.has(k)) continue;
    const a = before[k];
    const b = after[k];
    if (same(a, b)) continue;
    const label = labels[prefix + k] || prefix + k;
    const isMap = (x) => x && typeof x === 'object' && !Array.isArray(x) && typeof x.toMillis !== 'function';
    if (!prefix && isMap(a) && isMap(b)) {
      out.push(...fieldDiff(a, b, labels, `${k}.`));
    } else if (a === undefined) {
      out.push(`${label}: added ${show(b)}`);
    } else if (b === undefined) {
      out.push(`${label}: removed`);
    } else if (Array.isArray(a) || Array.isArray(b) || isMap(a) || isMap(b)) {
      out.push(`${label}: changed (${show(a)} → ${show(b)})`);
    } else {
      out.push(`${label}: ${show(a)} → ${show(b)}`);
    }
  }
  return out;
}

/* The page builder's blocks, matched by id — so a drag reads as a reorder,
 * not as two edits. (Same logic the portal's test suite pins.) */
function siteDiff(before, after) {
  const prev = before?.content ?? [];
  const next = after?.content ?? [];
  const idOf = (b, i) => String(b?.props?.id ?? `#${i}`);
  const name = (b) => (b?.type ?? 'Block').replace(/Block$/, '').replace(/([a-z])([A-Z])/g, '$1 $2') || 'Block';
  const title = (b) => {
    for (const k of ['heading', 'title', 'label', 'name']) {
      const v = b?.props?.[k];
      if (typeof v === 'string' && v.trim()) return ` “${v.trim().slice(0, 40)}”`;
    }
    return '';
  };
  const prevById = new Map(prev.map((b, i) => [idOf(b, i), b]));
  const nextIds = new Set(next.map(idOf));
  const out = [];
  next.forEach((b, i) => {
    const old = prevById.get(idOf(b, i));
    if (!old) { out.push(`Added ${name(b)}${title(b)}`); return; }
    const keys = new Set([...Object.keys(old.props ?? {}), ...Object.keys(b.props ?? {})]);
    keys.delete('id');
    const edited = [...keys].filter((k) => !same(old.props?.[k], b.props?.[k]));
    if (edited.length) out.push(`Edited ${name(b)}${title(b)}: ${edited.join(', ')}`);
  });
  prev.forEach((b, i) => { if (!nextIds.has(idOf(b, i))) out.push(`Removed ${name(b)}${title(b)}`); });
  const kept = (list) => list.map(idOf).filter((id) => prevById.has(id) && nextIds.has(id));
  if (!same(kept(prev), kept(next))) out.push('Reordered blocks');
  if (!same(before?.root?.props ?? {}, after?.root?.props ?? {})) out.push('Changed page settings');
  return out;
}

/* ═════════════════════════════════════════════════════ what it means ══ */

const RECORD_LABELS = {
  title: 'Title', body: 'Body', pills: 'Tags', kind: 'Kind', cat: 'Category', station: 'Station', year: 'Year',
  credit: 'Credit', photoUrls: 'Photos', table: 'Fact table', 'metadata.station': 'Station', 'metadata.identifier': 'Identifier',
  'metadata.license': 'Licence', 'metadata.publicationYear': 'Publication year', socialPosts: 'Social post links',
};

/**
 * Turns one write into an entry: category, tool, action, target, changes.
 * Returns null for writes that should not be logged at all.
 */
function describe(collection, id, before, after) {
  const op = !before ? 'create' : !after ? 'delete' : 'update';
  const doc = after || before || {};
  const diff = () => fieldDiff(before || {}, after || {});

  switch (collection) {
    case 'publicArchive': {
      const ident = doc.metadata?.identifier || id;
      const target = `${ident}${doc.title ? ` — ${doc.title}` : ''}`;
      if (op === 'create') return { category: 'Archive', tool: 'Archive record', action: 'Published a record to the public archive', target };
      if (op === 'delete') return { category: 'Archive', tool: 'Archive record', action: 'Removed a record from the public archive', target, alert: true };
      const changes = fieldDiff(before, after, RECORD_LABELS);
      if (!changes.length) return null;
      if (changes.every((c) => c.startsWith('Social post links'))) {
        return { category: 'Social', tool: 'Archive record', action: 'Linked a sent social post to the record', target, changes };
      }
      return { category: 'Archive', tool: 'Archive record', action: 'Edited a published record', target, changes };
    }

    case 'documents': {
      const target = doc.title || id;
      if (op === 'create') return { category: 'Archive', tool: 'Repository deposit', action: 'Deposited a file for review', target };
      if (op === 'delete') return { category: 'Archive', tool: 'Repository deposit', action: 'Deleted a deposit', target };
      if (before.status !== after.status) {
        const verb = { published: `Published the deposit as ${after.publishedIdentifier || 'a record'}`, rejected: 'Rejected the deposit', submitted: 'Returned the deposit to review' }[after.status] || `Deposit status: ${before.status} → ${after.status}`;
        return { category: 'Archive', tool: 'Deposit review', action: verb, target };
      }
      const changes = diff();
      return changes.length ? { category: 'Archive', tool: 'Repository deposit', action: 'Edited a deposit', target, changes } : null;
    }

    case 'dispatches': {
      const isRequest = doc.request?.kind === 'post-request';
      const target = isRequest
        ? `Post request: ${String(doc.notes || '').slice(0, 60)}`
        : `${doc.activity || 'Field report'}${doc.station ? ` at ${doc.station}` : ''}`;
      if (op === 'create') {
        return isRequest
          ? { category: 'Post requests', tool: 'Post request', action: 'Requested a new post from the publishers', target, changes: [`Platforms: ${(doc.request.platforms || []).join(', ')}`, ...(doc.request.deadline ? [`Needed by ${new Date(doc.request.deadline).toISOString().slice(0, 10)}`] : [])] }
          : { category: 'Field reports', tool: 'Field app', action: 'Filed a field report', target, alert: doc.safetyFlag === true };
      }
      if (op === 'delete') return { category: isRequest ? 'Post requests' : 'Field reports', tool: 'Dispatch', action: 'Deleted a dispatch', target, alert: true };
      if (before.status !== after.status) {
        const map = {
          drafted: { category: 'Media studio', tool: 'Media studio', action: 'Submitted a post for approval' },
          approved: { category: 'Review & approval', tool: 'Approve desk', action: 'Approved and published' },
          flagged: { category: 'Review & approval', tool: 'Approve desk', action: 'Sent the post back to the publisher' },
          raw: { category: 'Review & approval', tool: 'Approve desk', action: 'Returned to the queue' },
        };
        const m = map[after.status] || { category: 'Review & approval', tool: 'Dispatch', action: `Status: ${before.status} → ${after.status}` };
        const changes = [
          ...(after.status === 'flagged' && after.adminNotes ? [`Note: ${show(after.adminNotes)}`] : []),
          ...(after.status === 'approved' && after.publicIdentifier ? [`Public record ${after.publicIdentifier}`] : []),
        ];
        return { ...m, target, changes };
      }
      if (!same(before.reviewAnnotations, after.reviewAnnotations)) {
        return { category: 'Review & approval', tool: 'Approve desk', action: 'Marked up the post graphic', target };
      }
      const changes = diff().filter((c) => !c.startsWith('agentTrace'));
      return changes.length ? { category: isRequest ? 'Post requests' : 'Field reports', tool: 'Dispatch', action: 'Edited a dispatch', target, changes } : null;
    }

    case 'socialPosts': {
      const target = `${doc.platform || 'post'} · ${doc.recordIdentifier || id}`;
      if (op === 'create') return { category: 'Social', tool: 'Social queue', action: `Scheduled a ${doc.platform} post`, target, changes: doc.scheduledFor ? [`For ${new Date(doc.scheduledFor).toISOString().slice(0, 16).replace('T', ' ')} UTC`] : [] };
      if (op === 'delete') return { category: 'Social', tool: 'Social queue', action: 'Removed a queued post', target };
      if (before.status !== after.status) {
        const action = { posted: `Posted to ${after.platform}`, failed: `Post to ${after.platform} failed`, cancelled: 'Cancelled a post', ready: 'Post is due', queued: 'Re-queued a post' }[after.status] || `Status: ${before.status} → ${after.status}`;
        const changes = after.status === 'posted' && after.externalUrl ? [after.externalUrl] : after.status === 'failed' && after.error ? [String(after.error)] : [];
        return { category: 'Social', tool: 'Social queue', action, target, changes, alert: after.status === 'failed' };
      }
      // The analytics sync rewriting engagement numbers is not an action anyone took.
      const changes = diff().filter((c) => !/^engagement/.test(c));
      return changes.length ? { category: 'Social', tool: 'Social queue', action: 'Edited a queued post', target, changes } : null;
    }

    case 'publicSiteData': {
      if (id === 'home_puck') {
        const changes = op === 'delete' ? ['Homepage content deleted'] : siteDiff(before, after);
        return { category: 'Website', tool: 'Site editor', action: 'Published changes to the public homepage', target: 'Public site homepage', changes: changes.length ? changes : ['Saved with no content changes'] };
      }
      const changes = diff();
      if (!changes.length) return null;
      if (!same(before?.maintenanceMode, after?.maintenanceMode)) {
        return { category: 'Website', tool: 'Maintenance mode', action: after?.maintenanceMode ? 'Took the public site offline for maintenance' : 'Brought the public site back online', target: 'Public site', changes, alert: !!after?.maintenanceMode };
      }
      return { category: 'Website', tool: 'Site settings', action: 'Changed site settings', target: `publicSiteData/${id}`, changes };
    }

    case 'student_questions': {
      const target = doc.question ? show(doc.question) : id;
      if (op === 'create') return { category: 'Website', tool: 'Ask a Scientist', action: 'A question was submitted on the public site', target };
      if (before.status !== after.status) {
        const action = {
          READY_FOR_SCIENTIST: 'Approved a question and sent it to scientists',
          REJECTED_Q: 'Rejected a question',
          PENDING_ANSWER: 'A scientist answered a question',
          PUBLISHED: 'Published an answer to the public site',
          REJECTED_A: 'Rejected an answer',
        }[after.status] || `Question status: ${before.status} → ${after.status}`;
        return { category: 'Website', tool: 'Q&A moderation', action, target };
      }
      const changes = diff();
      return changes.length ? { category: 'Website', tool: 'Q&A moderation', action: 'Edited a question', target, changes } : null;
    }

    case 'roles': {
      const who = doc.displayName || doc.email || id;
      if (op === 'create') return { category: 'Access', tool: 'Access', action: `Given the ${ROLE_LABEL[doc.role] || doc.role} role`, target: who };
      if (op === 'delete') return { category: 'Access', tool: 'Access', action: 'Removed from the team roster', target: who, alert: true };
      if (!before.revoked && after.revoked) {
        return { category: 'Security', tool: 'Access', action: 'Revoked access', target: who, alert: true, changes: fieldDiff(before, after) };
      }
      if (before.revoked && !after.revoked) {
        return { category: 'Access', tool: 'Access', action: `Restored access as ${ROLE_LABEL[after.role] || after.role}`, target: who };
      }
      const changes = fieldDiff(before, after, { role: 'Role', archiveAccess: 'Archive access', siteAccess: 'Site management', analyticsAccess: 'Analytics dashboard' })
        .filter((c) => !/^(email|displayName|photoURL)/.test(c));
      if (!changes.length) return null;
      return { category: 'Access', tool: 'Access', action: before.role !== after.role ? `Role changed to ${ROLE_LABEL[after.role] || after.role}` : 'Permissions changed', target: who, changes };
    }

    case 'roleGrants': {
      if (op === 'create') return { category: 'Access', tool: 'Access', action: `Invited as ${ROLE_LABEL[doc.role] || doc.role}`, target: id };
      if (op === 'delete') return { category: 'Access', tool: 'Access', action: 'Cancelled an invitation', target: id };
      return { category: 'Access', tool: 'Access', action: 'Changed an invitation', target: id, changes: diff() };
    }

    case 'profiles': {
      const changes = diff();
      return changes.length || op !== 'update' ? { category: 'Profile', tool: 'Profile', action: op === 'create' ? 'Created a profile' : 'Edited their profile', target: id, changes } : null;
    }

    case 'bugReports':
      return op === 'create' ? { category: 'Support', tool: 'PolarQuest', action: 'Bug report filed from the game', target: show(doc.description) } : null;

    default: {
      const changes = diff();
      return { category: 'Other', tool: collection, action: `${op === 'create' ? 'Created' : op === 'delete' ? 'Deleted' : 'Edited'} a ${collection} document`, target: id, changes };
    }
  }
}

/* ═════════════════════════════════════════════════════════════ trigger ══ */

exports.auditTrail = onDocumentWrittenWithAuthContext('{collection}/{docId}', async (event) => {
  const { collection, docId } = event.params;
  if (SKIP.has(collection)) return;

  const before = event.data?.before?.exists ? event.data.before.data() : null;
  const after = event.data?.after?.exists ? event.data.after.data() : null;
  if (!before && !after) return;

  const d = describe(collection, docId, before, after);
  if (!d) return;

  const actor = await resolveActor(event.authType, event.authId);
  const clip = (s, n) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s);

  const op = !before ? 'create' : !after ? 'delete' : 'update';
  console.info(`audit: ${collection}/${docId} ${op} by ${actor.uid} -> ${d.category}: ${d.action}`);

  await db.collection('auditLog').add({
    at: FieldValue.serverTimestamp(),
    actorUid: actor.uid,
    actorName: actor.name,
    actorEmail: actor.email,
    actorRole: actor.role,
    category: d.category,
    tool: d.tool,
    action: clip(d.action, 160),
    target: d.target ? clip(String(d.target), 160) : null,
    changes: (d.changes || []).slice(0, 30).map((c) => clip(String(c), 240)),
    op,
    collection,
    docId,
    alert: d.alert === true,
    recordedBy: 'server',
  });
});

exports._test = { describe, fieldDiff, siteDiff, resolveActor };
