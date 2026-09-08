/* ═══════════════════════════════════════════ knowledge repository contract
 *
 * The published-record half of the shared contract, as read by the public
 * site. Records in the `publicArchive` Firestore collection are written by
 * iia-portal and have this shape.
 *
 * MIRRORED FILE: iia-portal/src/repository/contract.ts is the source of
 * truth and holds the writer's side as well (normalisation aliases,
 * plausibility ranges). The two apps deploy separately and share no
 * workspace, so this copy is deliberate — when RepositoryRecord, Measurement
 * or RecordMetadata changes there, change it here too.
 */

export type QcFlag = 'good' | 'suspect' | 'fault' | 'uncalibrated'

export interface Measurement {
  fieldId: string
  label: string
  value: string
  /** Units travel with the value, so a reading is never displayed bare. */
  unit: string | null
  qcFlag?: QcFlag
}

export type ResourceType =
  | 'Dataset' | 'Report' | 'Publication' | 'Image' | 'Video' | 'Institutional'

export interface RecordMetadata {
  identifier: string
  creators: { name: string; affiliation: string }[]
  publisher: 'NCPOR'
  /** Journal or series a publication appeared in. A venue is not an author,
   *  so it is recorded separately from `creators`. */
  publishedIn?: string
  publicationYear: number
  resourceType: ResourceType
  station: string
  spatial: {
    lat: number | null
    lon: number | null
    elevationM: number | null
    datum: 'WGS84'
    accuracyM: number | null
  }
  temporal: { observedAt: number }
  license: string
  rights: string
  instrument: string | null
  method: string | null
  provenance: {
    sourceType: 'dispatch' | 'document' | 'historical'
    sourceId: string
    approvedBy: string
    approvedAt: number
  }
}

export type CoverCategory = 'expedition' | 'dataset' | 'publication' | 'media' | 'institution'
export type CoverStation = 'maitri' | 'bharati' | 'dakshin' | 'ship' | 'ncpor'

export interface RecordFact { label: string; value: string }

export interface RecordChart {
  kind: 'bar' | 'line'
  title: string
  unit: string
  caption: string
  data: { label: string; value: number }[]
}

/* ──────────────────────────────────────────────────────────── citations ──
 * The prose on the public site is a *projection* of internal material — a
 * publisher's plain-language rewrite of a field dispatch, or the paragraphs
 * of a report somebody uploaded. Read on its own it gives a reader no way to
 * tell which sentence is a measured observation, which is a publisher's
 * wording, and which is standing NCPOR background text.
 *
 * These two types close that gap. `RecordSource` names a thing the prose
 * came from; `CitedSpan` ties a run of published text to one of them. The
 * public site renders each span as a hoverable citation, so any line can be
 * traced back to what it was written from.
 *
 * The same rule as the rest of the projection applies: a source may only
 * carry material that is already public in this record. Internal URLs (raw
 * CSVs, attached working documents, voice notes) never become a source.
 */

export type SourceKind =
  /** The field dispatch a scientist filed. Cited, never linked — the
   *  dispatch itself stays internal. */
  | 'dispatch'
  /** A document submitted to the Knowledge Repository. Linkable: uploads
   *  live under a storage path that is world-readable by design. */
  | 'document'
  /** Wording NCPOR supplies rather than the field record: station
   *  background, outreach context, a publisher's own sentence. */
  | 'editorial'
  /** The curated pre-repository catalogue. */
  | 'historical'

export interface RecordSource {
  /** Stable within one record; referenced by CitedSpan.sourceId. */
  id: string
  kind: SourceKind
  /** Short category shown on the hover card, e.g. 'Field dispatch'. */
  label: string
  title: string
  author: string | null
  /** Display date of the original material, already formatted. */
  dated: string | null
  /** One line on how the published text relates to this source — the part a
   *  reader actually needs in order to judge the sentence. */
  detail: string | null
  /** Link to the original, or null when the source is not public. */
  url: string | null
}

export interface CitedSpan {
  /** Verbatim slice of the published paragraph. */
  text: string
  /** null = connective text with no single source. */
  sourceId: string | null
  /** Where inside the source this came from, e.g. 'Paragraph 3 of the
   *  submitted report'. */
  locator?: string | null
}

/** One published paragraph, split into cited spans. A wrapper object rather
 *  than a bare CitedSpan[][] on the record: Firestore rejects nested arrays
 *  outright, so an array of arrays cannot be persisted. */
export interface ParagraphCitation { spans: CitedSpan[] }

/* ─────────────────────────────────────────────────── the report itself ──
 * `body` is the abstract: the two or three paragraphs that answer "what is
 * this" for someone scanning the archive. It is what every record has had
 * since the beginning, and it stays exactly that.
 *
 * A real expedition report or dataset is not an abstract. It has sections a
 * reader navigates rather than reads start to finish, figures that carry the
 * evidence, a description of how the measurements were made, and — for a
 * dataset — enough of the data itself to judge whether it is worth
 * downloading. These types carry that, and everything about them is
 * optional: a record with no `sections` renders exactly as records did
 * before they existed.
 */

/** A figure inside a section. `kind` says which payload field is set. */
export interface SectionFigure {
  kind: 'photo' | 'chart' | 'table'
  /** Figures are captioned, always — an uncaptioned figure asks the reader
   *  to guess what they are looking at. */
  caption: string
  photoUrl?: string | null
  chart?: RecordChart
  rows?: RecordFact[]
}

export interface ReportSection {
  /** Slug, used as the anchor the contents list links to. */
  id: string
  heading: string
  paragraphs: string[]
  figure?: SectionFigure
  /** Attributes the whole section to one of the record's `sources`. */
  sourceId?: string | null
}

/** One column of a published dataset. */
export interface DatasetColumn {
  name: string
  unit: string | null
  type: 'number' | 'text' | 'datetime'
  description: string
}

/**
 * Enough of a dataset to judge it without downloading it: what shape it is,
 * what each column means, and a few real rows. A dataset record that shows
 * only a title and a file size asks the reader to take it on faith.
 */
export interface DatasetPreview {
  format: string
  sizeLabel: string
  rowCount: number
  /** One line on what period and area the data covers. */
  coverage: string
  /** Where the file itself can be fetched. A dataset record without one
   *  describes data rather than offering it, which is the difference
   *  between a catalogue entry and a repository. */
  downloadUrl?: string | null
  columns: DatasetColumn[]
  /** A handful of real rows, values aligned to `columns`. Each row is a map
   *  rather than a bare array because Firestore rejects an array nested
   *  directly inside another array. */
  sampleRows: { values: string[] }[]
}

/** Something this record cites, or that cites it. */
export interface Reference {
  citation: string
  url?: string | null
}

export interface RepositoryRecord {
  id: string
  cat: CoverCategory
  kind: string
  title: string
  station: CoverStation
  year: string
  pills: string[]
  body: string[]
  table?: RecordFact[]
  credit?: string

  photoUrls: string[]
  videoUrl?: string | null

  measurements: Measurement[]
  chart?: RecordChart

  /** Everything the prose in `body` was written from. Absent on records
   *  published before citations existed — resolveCitations() derives a
   *  single provenance-level source for those rather than showing them
   *  uncited. */
  /** The report proper, when the record has one. Sections are what turn a
   *  published abstract into something a reader can navigate. */
  sections?: ReportSection[]
  /** Present on dataset records that published a schema and sample rows. */
  dataset?: DatasetPreview
  references?: Reference[]

  sources?: RecordSource[]
  /** Index-aligned with `body`: how each paragraph splits into cited spans.
   *  Only trusted when the spans re-join to exactly the paragraph text, so
   *  an edit to a published record can never leave a sentence attributed to
   *  a source it no longer came from. */
  citations?: ParagraphCitation[]

  metadata: RecordMetadata
  publishedAt: number
}

/** Numeric value of a measurement, or null when it isn't a number. */
export function measurementValue(m: Measurement): number | null {
  if (m.value === null || m.value === undefined) return null
  const trimmed = String(m.value).trim()
  if (trimmed === '') return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}
