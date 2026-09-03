/* ═══════════════════════════════════════════════════════════ publishing
 *
 * Turns an approved dispatch (or an approved repository document) into the
 * public record that iia-public reads.
 *
 * The important design decision here is that this is a *projection*, not a
 * relaxation. The alternative — leaving dispatches in place and loosening
 * firestore.rules to "public may read where status == approved" — would work
 * until the day someone adds a field. A dispatch carries admin notes, the SOP
 * checklist, the names of everyone in the field party, raw incident notes and
 * a safety flag; exactly one rule edit or one new field stands between those
 * and the open internet. Building the public record field by field, out of
 * material a publisher wrote *for* the public, means a leak requires someone
 * to deliberately add the field here. publish.test.ts asserts it stays that way.
 */

import { doc, setDoc, deleteDoc, runTransaction } from 'firebase/firestore';
import { db } from '../firebase';
import type { Dispatch, ResearchDocument } from '../types';
import type { Measurement, RepositoryRecord, RecordMetadata, ResourceType } from './contract';
import { STATION_COVER_KEY, CATEGORY_COVER, ACTIVITY_RESOURCE_TYPE } from './contract';
import type { PublicSummary } from './summarise';

export const PUBLIC_COLLECTION = 'publicArchive';

/* ─────────────────────────────────────────────────────────── identifiers ──
 * IIA-2026-0042. Human-readable, citable, and stable for the life of the
 * record. Deliberately shaped like the identifiers a data centre issues, so
 * that registering real DOIs later is a form-fill rather than a migration.  */

export function formatIdentifier(year: number, sequence: number): string {
  return `IIA-${year}-${String(sequence).padStart(4, '0')}`;
}

/** Allocates the next sequence number for the year inside a transaction, so
 *  two admins approving at the same moment can't mint the same identifier. */
export async function mintIdentifier(year = new Date().getUTCFullYear()): Promise<string> {
  const counterRef = doc(db, 'counters', 'repository');
  const sequence = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const data = snap.exists() ? snap.data() : {};
    const next = ((data[String(year)] as number | undefined) ?? 0) + 1;
    tx.set(counterRef, { ...data, [String(year)]: next }, { merge: true });
    return next;
  });
  return formatIdentifier(year, sequence);
}

/* ──────────────────────────────────────────────────── publishing guards ──
 * Some things must never reach the public site automatically, no matter what
 * a publisher wrote or an admin clicked. */

export interface PublishRefusal { ok: false; reason: string }
export type PublishCheck = { ok: true } | PublishRefusal;

export function canPublishDispatch(d: Dispatch): PublishCheck {
  if (d.safetyFlag) {
    return { ok: false, reason: 'This dispatch is flagged for the station leader. Safety and incident reports are not published to the public site.' };
  }
  if (d.activity === 'Emergency / incident') {
    return { ok: false, reason: 'Incident reports are internal records and are never published publicly.' };
  }
  if (d.status !== 'approved') {
    return { ok: false, reason: 'Only approved dispatches can be published.' };
  }
  return { ok: true };
}

/* ──────────────────────────────────────────────────────────── projection ── */

function yearOf(ts: number): string {
  return String(new Date(ts).getUTCFullYear());
}

/**
 * Build the public record from an approved dispatch and the summary a
 * publisher wrote for it.
 *
 * Every field is listed explicitly. There is no spread of the source
 * dispatch anywhere in this function, and that is on purpose — `...d` would
 * quietly carry adminNotes, sopChecklist, teamMembers, safetyFlag and the raw
 * field notes into a world-readable collection.
 */
export function toRepositoryRecord(
  d: Dispatch,
  summary: PublicSummary,
  measurements: Measurement[],
  approvedBy: string,
  identifier: string,
  now = Date.now(),
): RepositoryRecord {
  const resourceType: ResourceType = ACTIVITY_RESOURCE_TYPE[d.activity] ?? 'Report';
  const cover = resourceType === 'Dataset'
    ? CATEGORY_COVER['Dataset']
    : CATEGORY_COVER['Expedition Report'];

  const photoUrls = Array.isArray(d.imageUrls) ? [...d.imageUrls] : [];
  // Put the publisher's chosen cover photo first, so the archive card uses it.
  const coverIndex = d.coverImageIndex ?? 0;
  if (coverIndex > 0 && coverIndex < photoUrls.length) {
    const [chosen] = photoUrls.splice(coverIndex, 1);
    photoUrls.unshift(chosen);
  }

  const metadata: RecordMetadata = {
    identifier,
    creators: [{ name: d.authorName, affiliation: 'NCPOR' }],
    publisher: 'NCPOR',
    publicationYear: new Date(now).getUTCFullYear(),
    resourceType,
    station: (STATION_COVER_KEY[d.station] ? d.station : 'Other') as RecordMetadata['station'],
    spatial: {
      lat: d.lat,
      lon: d.lon,
      elevationM: d.elevationM,
      datum: 'WGS84',
      accuracyM: null,
    },
    temporal: { observedAt: d.observedAt },
    license: 'CC BY 4.0',
    rights: 'Creative Commons Attribution 4.0 International',
    instrument: measurements.find((m) => m.fieldId === 'instrument')?.value ?? null,
    method: measurements.find((m) => m.fieldId === 'method')?.value ?? null,
    provenance: {
      sourceType: 'dispatch',
      sourceId: d.id,
      approvedBy,
      approvedAt: now,
    },
  };

  return {
    id: d.id,
    cat: cover.cat,
    kind: cover.kind,
    title: summary.title,
    station: STATION_COVER_KEY[d.station] ?? 'ncpor',
    year: yearOf(d.observedAt),
    pills: [d.activity, d.station].filter(Boolean),
    body: summary.body,
    table: summary.table,
    credit: `Reported by ${d.authorName}`,
    photoUrls,
    videoUrl: null,
    measurements,
    ...(summary.chart ? { chart: summary.chart } : {}),
    metadata,
    publishedAt: now,
  };
}

/** The same projection for a Knowledge Repository document (a dataset,
 *  publication or report someone uploaded, rather than a field dispatch). */
export function documentToRepositoryRecord(
  docRec: ResearchDocument,
  approvedBy: string,
  identifier: string,
  now = Date.now(),
): RepositoryRecord {
  const cover = CATEGORY_COVER[docRec.category] ?? CATEGORY_COVER['Expedition Report'];
  const resourceType: ResourceType =
    docRec.category === 'Dataset' ? 'Dataset'
    : docRec.category === 'Publication' ? 'Publication'
    : docRec.category === 'Photographs & Video' ? 'Image'
    : docRec.category === 'Institutional' ? 'Institutional'
    : 'Report';

  return {
    id: docRec.id,
    cat: cover.cat,
    kind: cover.kind,
    title: docRec.title,
    station: STATION_COVER_KEY[docRec.station] ?? 'ncpor',
    year: yearOf(docRec.observedAt),
    pills: [docRec.category, docRec.station].filter(Boolean),
    body: [docRec.description],
    table: [
      { label: 'Station', value: docRec.station },
      { label: 'Recorded', value: new Date(docRec.observedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) },
      { label: 'Instrument / method', value: docRec.instrument || '—' },
      { label: 'Licence', value: docRec.license },
      { label: 'File', value: `${docRec.fileName} (${Math.max(1, Math.round(docRec.fileSizeBytes / 1024))} KB)` },
    ],
    credit: `Submitted by ${docRec.authorName}`,
    photoUrls: [],
    videoUrl: null,
    measurements: [],
    metadata: {
      identifier,
      creators: [{ name: docRec.authorName, affiliation: 'NCPOR' }],
      publisher: 'NCPOR',
      publicationYear: new Date(now).getUTCFullYear(),
      resourceType,
      station: docRec.station,
      spatial: { lat: docRec.lat, lon: docRec.lon, elevationM: null, datum: 'WGS84', accuracyM: null },
      temporal: { observedAt: docRec.observedAt },
      license: docRec.license,
      rights: docRec.license === 'CC0' ? 'Public domain dedication' : 'Creative Commons Attribution',
      instrument: docRec.instrument || null,
      method: null,
      provenance: { sourceType: 'document', sourceId: docRec.id, approvedBy, approvedAt: now },
    },
    publishedAt: now,
  };
}

/* ────────────────────────────────────────────────────────────────── I/O ── */

export async function publishRecord(record: RepositoryRecord): Promise<void> {
  await setDoc(doc(db, PUBLIC_COLLECTION, record.id), record);
}

/** Taking a record back off the public site — used when an admin flags an
 *  already-approved dispatch, so "unpublish" is a real action rather than
 *  something that needs a console visit. */
export async function unpublishRecord(id: string): Promise<void> {
  await deleteDoc(doc(db, PUBLIC_COLLECTION, id));
}
