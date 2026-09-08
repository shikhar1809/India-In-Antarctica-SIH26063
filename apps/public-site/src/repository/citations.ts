/* ══════════════════════════════════════════════════════════════ citations
 *
 * Reading side of the citation contract.
 *
 * What the archive shows is not the raw report — it is the version the
 * portal projected for publication: a publisher's plain-language rewrite of
 * a field dispatch, or the paragraphs of a submitted document, with the
 * internal material stripped out. That is the right thing to publish and the
 * wrong thing to publish *silently*, because a reader cannot tell a measured
 * observation from standing NCPOR background once both are set in the same
 * grey paragraph.
 *
 * This module turns whatever citation data a record carries into something
 * the page can render, under two rules:
 *
 *   1. Never show an attribution that might be wrong. A record's spans are
 *      trusted only when re-joining them reproduces the published paragraph
 *      character for character, and only when every span resolves to a
 *      listed source. An edited paragraph loses its citation rather than
 *      keeping a stale one.
 *
 *   2. Never leave a record looking uncited because it predates the
 *      feature. Records published before citations existed — and the curated
 *      historical catalogue — get one source derived from the provenance
 *      block every record has always carried.
 */

import type { CitedSpan, RecordSource, RepositoryRecord } from './contract'
import { STATION_LABELS } from '../api/repository'

export interface ResolvedCitations {
  /** Sources actually cited, in the order a reader first meets them —
   *  which is the order their numbers run in. */
  sources: RecordSource[]
  /** Source id → the [1], [2] a reader sees. */
  numberOf: Record<string, number>
  /** Index-aligned with `record.body`. */
  paragraphs: CitedSpan[][]
}

function displayDate(ts: number | undefined | null): string | null {
  if (!ts) return null
  return new Date(ts).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  })
}

/**
 * The one source a record can always be attributed to, built from the
 * provenance block. Used for records published before the portal started
 * emitting per-span citations, so the whole archive reads consistently
 * instead of splitting into cited and uncited halves.
 */
export function provenanceSource(record: RepositoryRecord): RecordSource | null {
  const p = record.metadata?.provenance
  if (!p) return null

  const author = record.metadata.creators?.[0]?.name ?? null
  const dated = displayDate(record.metadata.temporal?.observedAt)
  const station = STATION_LABELS[record.station] ?? 'NCPOR'
  const identifier = record.metadata.identifier

  if (p.sourceType === 'dispatch') {
    return {
      id: 'provenance',
      kind: 'dispatch',
      label: 'Field dispatch',
      title: `Dispatch from ${station}`,
      author,
      dated,
      detail: `Published from a dispatch filed in the field and rewritten for the public site. The dispatch itself is an internal record. Catalogued as ${identifier}.`,
      url: null,
    }
  }

  if (p.sourceType === 'document') {
    const file = record.table?.find((f) => f.label === 'File')?.value
    return {
      id: 'provenance',
      kind: 'document',
      label: 'Submitted document',
      title: record.title.replace(/\n/g, ' '),
      author,
      dated,
      detail: file
        ? `Published from a document submitted to the Knowledge Repository (${file}) and catalogued as ${identifier}.`
        : `Published from a document submitted to the Knowledge Repository and catalogued as ${identifier}.`,
      // A video record's file IS the submitted document, and it is already
      // published on this page. Older non-video records never carried the
      // file's URL into the public collection, only its name.
      url: record.videoUrl ?? null,
    }
  }

  return {
    id: 'provenance',
    kind: 'historical',
    label: 'NCPOR catalogue',
    title: `Historical record ${identifier}`,
    author: author ?? 'NCPOR',
    dated,
    detail:
      'From the curated catalogue of Indian Antarctic expeditions that predates the live repository. Compiled by NCPOR from published expedition material.',
    url: null,
  }
}

/** Whether a paragraph's stored spans can be trusted to describe it. */
function spansMatch(spans: CitedSpan[], paragraph: string, known: Set<string>): boolean {
  if (!spans.length) return false
  if (spans.some((s) => s.sourceId && !known.has(s.sourceId))) return false
  // The portal joins spans with a single space to build the paragraph; if
  // that no longer reproduces the text, the paragraph has been edited since
  // and the attribution no longer describes it.
  return spans.map((s) => s.text).join(' ') === paragraph
}

export function resolveCitations(record: RepositoryRecord): ResolvedCitations {
  const body = record.body ?? []
  const stored = record.sources ?? []
  const known = new Set(stored.map((s) => s.id))

  let paragraphs: CitedSpan[][]
  let pool: RecordSource[]

  if (record.citations?.length && stored.length) {
    pool = stored
    paragraphs = body.map((para, i) => {
      const spans = record.citations?.[i]?.spans ?? []
      return spansMatch(spans, para, known)
        ? spans.map((s) => ({ ...s }))
        : [{ text: para, sourceId: null }]      // edited since publication
    })
  } else {
    const fallback = provenanceSource(record)
    pool = fallback ? [fallback] : []
    paragraphs = body.map((para) => [{ text: para, sourceId: fallback ? fallback.id : null }])
  }

  // Number sources by where the reader first meets them, and drop any that
  // nothing in the text ended up citing.
  const numberOf: Record<string, number> = {}
  const sources: RecordSource[] = []
  for (const spans of paragraphs) {
    for (const span of spans) {
      if (!span.sourceId || numberOf[span.sourceId]) continue
      const source = pool.find((s) => s.id === span.sourceId)
      if (!source) continue
      sources.push(source)
      numberOf[span.sourceId] = sources.length
    }
  }

  return { sources, numberOf, paragraphs }
}
