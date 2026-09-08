/* ═══════════════════════════════════════════════ knowledge repository API
 *
 * The public site's read access to everything NCPOR has published.
 *
 * Records land in the `publicArchive` Firestore collection when an admin
 * approves them in the portal. That collection is world-readable by design
 * (firestore.rules), which means it is also reachable over plain HTTP with
 * no SDK and no credentials at all:
 *
 *   GET https://firestore.googleapis.com/v1/projects/indiainantartica
 *       /databases/(default)/documents/publicArchive
 *
 * and, in friendlier JSON, through the Cloud Function documented in
 * functions/index.js:
 *
 *   GET https://asia-south1-indiainantartica.cloudfunctions.net/api/records
 *   GET .../api/records/:id
 *
 * This module is what the site itself uses — the SDK path, so records stream
 * in live as they are approved rather than needing a refresh.
 */

import { useEffect, useState } from 'react'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from '../firebase'
import type { RepositoryRecord, CoverCategory } from '../repository/contract'

export const PUBLIC_COLLECTION = 'publicArchive'

/** Documented endpoints, exported so the About/API surface can show them
 *  without hardcoding the strings in a component. */
export const API_ENDPOINTS = {
  rest: 'https://firestore.googleapis.com/v1/projects/indiainantartica/databases/(default)/documents/publicArchive',
  json: 'https://asia-south1-indiainantartica.cloudfunctions.net/api/records',
} as const

export interface RepositoryState {
  records: RepositoryRecord[]
  loading: boolean
  /** Set when the read genuinely failed, so the page can say so rather than
   *  showing an empty archive and implying there's nothing there. */
  error: string | null
}

function toRecord(id: string, data: Record<string, unknown>): RepositoryRecord {
  // Firestore hands back plain objects; fill in anything an older published
  // record predates so the UI never has to null-check field by field.
  return {
    id,
    cat: (data.cat as CoverCategory) ?? 'expedition',
    kind: (data.kind as string) ?? 'Record',
    title: (data.title as string) ?? 'Untitled record',
    station: (data.station as RepositoryRecord['station']) ?? 'ncpor',
    year: String(data.year ?? ''),
    pills: (data.pills as string[]) ?? [],
    body: (data.body as string[]) ?? [],
    table: data.table as RepositoryRecord['table'],
    credit: data.credit as string | undefined,
    photoUrls: (data.photoUrls as string[]) ?? [],
    videoUrl: (data.videoUrl as string | null) ?? null,
    measurements: (data.measurements as RepositoryRecord['measurements']) ?? [],
    chart: data.chart as RepositoryRecord['chart'],
    // Left undefined rather than defaulted on records published before
    // citations existed — resolveCitations() tells those apart from a record
    // that genuinely cites nothing, and derives a source from provenance.
    sources: data.sources as RepositoryRecord['sources'],
    citations: data.citations as RepositoryRecord['citations'],
    metadata: data.metadata as RepositoryRecord['metadata'],
    publishedAt: (data.publishedAt as number) ?? 0,
  }
}

/**
 * Live subscription to the published repository, newest first.
 *
 * Realtime rather than a one-shot fetch: when an admin approves a dispatch
 * in the portal, it appears here without anyone reloading the page — which
 * is the whole point of wiring the two together, and makes the pipeline
 * demonstrable end to end.
 */
export function useRepository(): RepositoryState {
  const [state, setState] = useState<RepositoryState>({ records: [], loading: true, error: null })

  useEffect(() => {
    const q = query(collection(db, PUBLIC_COLLECTION), orderBy('publishedAt', 'desc'))
    const unsub = onSnapshot(
      q,
      (snap) => {
        setState({
          records: snap.docs.map((d) => toRecord(d.id, d.data() as Record<string, unknown>)),
          loading: false,
          error: null,
        })
      },
      (err) => {
        setState({ records: [], loading: false, error: err.message })
      },
    )
    return unsub
  }, [])

  return state
}

/* ────────────────────────────────────────────────────────── record links ──
 * A record is a page, so it needs an address. Two handles are accepted:
 * the citable identifier (IIA-2026-0001 — the one printed on the record and
 * used in a citation) and the raw document id, which is what older links and
 * the home-page shelf already use. */

/** The handle a record is linked by — the citable identifier when it has
 *  one, so /archive/IIA-2026-0001 is the address of the thing a citation
 *  names, not an internal database key. */
export function recordSlug(record: RepositoryRecord): string {
  return record.metadata?.identifier || record.id
}

/** Whether a URL segment names this record. Case is ignored: an identifier
 *  read off a printed page and typed back in should still land. */
export function matchesRecordId(record: RepositoryRecord, key: string): boolean {
  const k = key.trim().toLowerCase()
  return record.id.toLowerCase() === k || (record.metadata?.identifier ?? '').toLowerCase() === k
}

/* ─────────────────────────────────────────────────────── derived views ── */

export const CATEGORY_LABELS: { id: CoverCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'Everything' },
  { id: 'expedition', label: 'Expedition Reports' },
  { id: 'dataset', label: 'Datasets' },
  { id: 'publication', label: 'Publications' },
  { id: 'media', label: 'Photographs & Video' },
  { id: 'institution', label: 'Institutional' },
]

export const STATION_LABELS: Record<string, string> = {
  maitri: 'Maitri',
  bharati: 'Bharati',
  dakshin: 'Dakshin Gangotri',
  ship: 'At sea',
  ncpor: 'NCPOR',
}

export interface TrendPoint {
  /** The record this observation came from, so a record's own point can be
   *  picked out of the series it sits in. */
  id: string
  label: string
  value: number
  station: string
}

/**
 * Air temperature across every published record that has one, oldest first —
 * the chart that only becomes possible once records accumulate, and the one
 * that actually shows the value of a repository rather than a single report.
 */
export function temperatureSeries(records: RepositoryRecord[]): TrendPoint[] {
  return records
    .map((r) => {
      const conditions = r.table?.find((f) => f.label === 'Conditions')?.value
      const match = conditions?.match(/(-?\d+(?:\.\d+)?)\s*°C/)
      if (!match || !r.metadata?.temporal?.observedAt) return null
      return {
        at: r.metadata.temporal.observedAt,
        id: r.id,
        label: new Date(r.metadata.temporal.observedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
        value: Number(match[1]),
        station: STATION_LABELS[r.station] ?? 'NCPOR',
      }
    })
    .filter((p): p is TrendPoint & { at: number } => p !== null)
    .sort((a, b) => a.at - b.at)
    .map(({ id, label, value, station }) => ({ id, label, value, station }))
}

/** Below this the "trend" is a straight segment between the only two
 *  observations there are, which says nothing a reader couldn't get from the
 *  two records themselves. The section is hidden until the repository has
 *  enough temperature observations for the shape of the line to mean
 *  something. */
export const MIN_TREND_POINTS = 3
