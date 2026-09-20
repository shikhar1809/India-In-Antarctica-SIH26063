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

import { doc, setDoc, updateDoc, deleteDoc, runTransaction } from 'firebase/firestore';
import { db } from '../firebase';
import type { Dispatch, ResearchDocument } from '../types';
import type { Measurement, RepositoryRecord, RecordMetadata, ReportSection, ResourceType } from './contract';
import { STATION_COVER_KEY, CATEGORY_COVER, ACTIVITY_RESOURCE_TYPE } from './contract';
import type { PublicSummary } from './summarise';
import { draftSections } from './summarise';
import { citeDispatchBody, citeDocumentBody } from './citations';
import { STATION_REGION, themesOf } from './taxonomy';

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
  // Where each sentence of `summary.body` came from. Built from the same
  // material the summary was, and cited by name only — see citations.ts for
  // why a dispatch is never linked.
  const cited = citeDispatchBody(d, summary.body, measurements, d.publisherName ?? null);
  // The report body. Derived from the dispatch rather than from the
  // publisher's summary, so it always describes what was actually done —
  // see draftSections() for why that separation matters.
  const sections = draftSections(d, measurements);
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
    /* Which pole. Stored at publication rather than left for the public
     * site to infer — a published record should carry its own filing.
     * See repository/taxonomy.ts. */
    region: STATION_REGION[STATION_COVER_KEY[d.station] ?? 'ncpor'] ?? 'antarctic',
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

  const record: RepositoryRecord = {
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
    sections,
    sources: cited.sources,
    citations: cited.citations,
    metadata,
    publishedAt: now,
  };
  /* Science keywords, read off the finished record — see
   * repository/taxonomy.ts. Stored so the public repository filters on a
   * recorded fact rather than re-deriving one on every keystroke. */
  return { ...record, themes: themesOf(record) };
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

  // A written-out report reads as paragraphs, not one 500-char summary —
  // that's the whole point of the field. No report on file falls back to
  // exactly what every record before this showed.
  const fullReport = docRec.fullText?.trim()
    ? docRec.fullText.trim().split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
    : null;
  // `body` is the abstract, and stays the short summary the contributor
  // wrote. Before the record carried sections there was nowhere else for a
  // full report to go, so it was flattened into `body`; now it has its own
  // place and the abstract can be the abstract.
  const body = fullReport ?? [docRec.description];

  // Paragraph N of the public text is paragraph N of the submitted report,
  // so the citation can say so precisely and link the file itself.
  const cited = citeDocumentBody(docRec, body);

  // A submitted report is already a document: its own paragraphs are the
  // report body, and the abstract is the summary the contributor wrote for
  // it. Splitting them this way means the archive shows the same two things
  // a repository entry anywhere else shows — a summary to decide from and
  // the full text underneath — rather than one undifferentiated block.
  const sections: ReportSection[] | undefined = docRec.fullText?.trim()
    ? [{
        id: 'full-report',
        heading: 'The report as submitted',
        paragraphs: body,
        sourceId: 'document',
      }]
    : undefined;

  const isVideo = docRec.mediaKind === 'video';
  // A video plays inline instead of being one more download-link row.
  const fileRow = isVideo
    ? []
    : [{ label: 'File', value: `${docRec.fileName} (${Math.max(1, Math.round(docRec.fileSizeBytes / 1024))} KB)` }];

  return {
    id: docRec.id,
    cat: cover.cat,
    kind: cover.kind,
    title: docRec.title,
    station: STATION_COVER_KEY[docRec.station] ?? 'ncpor',
    year: yearOf(docRec.observedAt),
    pills: [docRec.category, docRec.station].filter(Boolean),
    body,
    table: [
      { label: 'Station', value: docRec.station },
      { label: 'Recorded', value: new Date(docRec.observedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) },
      { label: 'Instrument / method', value: docRec.instrument || '—' },
      { label: 'Licence', value: docRec.license },
      ...fileRow,
    ],
    credit: `Submitted by ${docRec.authorName}`,
    photoUrls: [],
    videoUrl: isVideo ? docRec.fileUrl : null,
    measurements: [],
    ...(sections ? { sections } : {}),
    sources: cited.sources,
    citations: cited.citations,
    metadata: {
      identifier,
      creators: [{ name: docRec.authorName, affiliation: 'NCPOR' }],
      publisher: 'NCPOR',
      publicationYear: new Date(now).getUTCFullYear(),
      resourceType,
      station: docRec.station,
      spatial: { lat: docRec.lat, lon: docRec.lon, elevationM: null, datum: 'WGS84', accuracyM: null },
      temporal: { observedAt: docRec.observedAt },
      region: STATION_REGION[docRec.station] ?? 'antarctic',
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

/** What an admin is allowed to change on a record that is already live —
 *  the visible public content, and nothing about its identity or
 *  provenance. Re-running `publishRecord` would work too, but it replaces
 *  the whole document; this only ever touches the fields a human actually
 *  edited, so a stray client-side bug can't silently drop metadata that
 *  was never part of the edit. */
export interface PublishedRecordPatch {
  title?: string;
  /** Editing published prose invalidates the citations attached to it. This
   *  patch deliberately cannot carry `citations`, and iia-public re-joins
   *  each paragraph's spans before trusting them — so an edited paragraph
   *  simply falls back to being shown uncited rather than keeping an
   *  attribution it has outgrown. */
  body?: string[];
  table?: RepositoryRecord['table'];
}

export async function updatePublishedRecord(id: string, patch: PublishedRecordPatch): Promise<void> {
  await updateDoc(doc(db, PUBLIC_COLLECTION, id), { ...patch });
}
