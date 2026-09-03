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
