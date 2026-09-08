/* ══════════════════════════════════════════════════════════════ citations
 *
 * Where every sentence on the public site came from.
 *
 * publish.ts exists to make sure the public record carries only material
 * written for the public. That guarantee costs the reader something: the
 * published prose is a *rewrite*, and read on its own there is no way to
 * tell an observation that was actually measured in the field from a
 * publisher's phrasing, or from the standing background paragraph NCPOR
 * attaches to every record about that station.
 *
 * This module rebuilds that link. It attributes each span of published text
 * to a `RecordSource`, which the public site renders as a hover citation.
 *
 * Two rules hold everything else together:
 *
 *   1. A source may only carry material this record already publishes.
 *      A dispatch is cited by name and date and never linked, because the
 *      dispatch document is internal — raw notes, team members, admin notes
 *      and the attached working files all live on it. An uploaded document
 *      IS linked, because uploads live under research/{uid}/ which
 *      storage.rules makes world-readable by design, and the record already
 *      names the file.
 *
 *   2. A span is only attributed when the published text still matches what
 *      was drafted. Publishers edit the draft, so `citeDispatchBody` re-runs
 *      the deterministic draft and compares. Anything the publisher changed
 *      or wrote themselves is attributed to the publisher, not silently left
 *      pointing at a field observation it no longer reflects.
 */

import type { Dispatch, ResearchDocument } from '../types';
import type { CitedSpan, Measurement, ParagraphCitation, RecordSource } from './contract';
import { draftParagraphs, joinSpans } from './summarise';
import type { DraftSourceId } from './summarise';

/** Dates on a citation card are read by people, not parsed. */
function displayDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}

export interface RecordCitations {
  sources: RecordSource[];
  citations: ParagraphCitation[];
}

/** Drops any source nothing ended up citing, so the reader's source list
 *  never carries an entry they cannot find in the text. */
function used(sources: RecordSource[], citations: ParagraphCitation[]): RecordCitations {
  const cited = new Set(
    citations.flatMap((p) => p.spans.map((s) => s.sourceId).filter((id): id is string => !!id)),
  );
  return { sources: sources.filter((s) => cited.has(s.id)), citations };
}

/* ─────────────────────────────────────────────────────────────  dispatch ── */

function dispatchSources(d: Dispatch, publisherName: string | null): RecordSource[] {
  const when = displayDate(d.observedAt);
  return [
    {
      id: 'dispatch',
      kind: 'dispatch',
      label: 'Field observation',
      title: `${d.activity} — ${d.station}`,
      author: d.authorName,
      dated: when,
      detail:
        'Taken from the dispatch filed from the field: the measurements logged on site, and where and when they were taken. The dispatch itself is an internal record and is not published.',
      url: null,
    },
    {
      id: 'conditions',
      kind: 'dispatch',
      label: 'Weather observation',
      title: `Conditions logged at ${d.station}`,
      author: d.authorName,
      dated: when,
      detail:
        'The met observation called in with this dispatch — air temperature, wind and present weather, reported to WMO field practice.',
      url: null,
    },
    {
      id: 'station-context',
      kind: 'editorial',
      label: 'Station background',
      title: `About ${d.station}`,
      author: 'NCPOR',
      dated: null,
      detail:
        'Standing background about the station, the same on every record from it. Not an observation from this particular visit.',
      url: null,
    },
    {
      id: 'outreach',
      kind: 'editorial',
      label: 'NCPOR context',
      title: 'Why this work matters',
      author: 'NCPOR',
      dated: null,
      detail:
        'Written by NCPOR to explain why this kind of measurement is worth taking. It is general context about the science, not a finding from this record.',
      url: null,
    },
    {
      id: 'publisher',
      kind: 'editorial',
      label: 'Written for publication',
      title: 'Publisher’s wording',
      author: publisherName,
      dated: null,
      detail:
        'Written or rewritten by the publisher preparing this record for the public site, working from the field dispatch.',
      url: null,
    },
  ];
}

const DRAFT_SOURCE: Record<DraftSourceId, string> = {
  dispatch: 'dispatch',
  conditions: 'conditions',
  'station-context': 'station-context',
  outreach: 'outreach',
};

/**
 * Attribute the published paragraphs of a dispatch record.
 *
 * `body` is what is actually being published — the publisher's copy, which
 * may differ from the draft in any way at all. The draft is recomputed here
 * only as a *reference*: a paragraph that still reads exactly as drafted
 * keeps the draft's per-sentence attribution, and anything else is credited
 * to the publisher. Never the other way round, because a citation that
 * overstates its source is worse than no citation.
 */
export function citeDispatchBody(
  d: Dispatch,
  body: string[],
  measurements: Measurement[],
  publisherName: string | null,
): RecordCitations {
  const drafted = new Map<string, CitedSpan[]>();
  for (const spans of draftParagraphs(d, measurements)) {
    drafted.set(
      joinSpans(spans),
      spans.map((s) => ({ text: s.text, sourceId: DRAFT_SOURCE[s.sourceId] })),
    );
  }

  const citations: ParagraphCitation[] = body.map((para) => {
    const asDrafted = drafted.get(para);
    if (asDrafted) return { spans: asDrafted.map((s) => ({ ...s })) };
    return { spans: [{ text: para, sourceId: 'publisher' }] };
  });

  return used(dispatchSources(d, publisherName), citations);
}

/* ─────────────────────────────────────────────────────────────  document ── */

/**
 * Attribute the published paragraphs of an uploaded document.
 *
 * These are the easy case and the one the archive most needs: the body of a
 * repository record is the contributor's own report, split on blank lines,
 * so paragraph N of the public text is paragraph N of the file they
 * submitted. The citation says exactly that, and links the file.
 */
export function citeDocumentBody(docRec: ResearchDocument, body: string[]): RecordCitations {
  const hasReport = !!docRec.fullText?.trim();
  const source: RecordSource = {
    id: 'document',
    kind: 'document',
    label: hasReport ? 'Submitted report' : 'Submission summary',
    title: docRec.title,
    author: docRec.authorName,
    dated: displayDate(docRec.observedAt),
    detail: hasReport
      ? `The full report as submitted to the Knowledge Repository, alongside ${docRec.fileName}. The published text is this report unchanged — only its formatting differs.`
      : `The summary the contributor supplied with ${docRec.fileName}. No longer report was submitted with this record.`,
    // Uploads live under research/{uid}/ — world-readable by design
    // (storage.rules), and this record already names the file.
    url: docRec.fileUrl || null,
  };

  const citations: ParagraphCitation[] = body.map((para, i) => ({
    spans: [
      {
        text: para,
        sourceId: 'document',
        locator: hasReport
          ? `Paragraph ${i + 1} of the submitted report`
          : 'Summary supplied with the upload',
      },
    ],
  }));

  return used([source], citations);
}
