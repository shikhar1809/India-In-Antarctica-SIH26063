/* ═════════════════════════════════════════════ pre-publication checks ══
 *
 * What an approver would otherwise have to notice by eye, on every
 * dispatch, while scrolling. These run the instant a dispatch is opened:
 * no network, no key, no cost, and they never disagree with themselves.
 *
 * Split from the AI review on purpose. Whether a field is empty, whether a
 * caption exceeds X's 280 characters, whether a stake ID leaked into public
 * copy — these are decidable, and a rule answers them correctly every time
 * for free. The model is asked only about the things a rule cannot judge:
 * tone, overclaiming, whether the writing outruns the evidence. Sending
 * "is imageUrls empty" to a language model would be slower, cost money and
 * occasionally be wrong.
 */

import type { Dispatch } from '../types';

export type Severity = 'blocker' | 'missing' | 'caution';

export type Check = {
  id: string;
  severity: Severity;
  /** What is wrong, in the approver's language. */
  label: string;
  /** Why it matters / what to do. Kept to one line. */
  detail: string;
};

/** Public-facing text on a dispatch, i.e. everything a reader could see. */
function publicText(d: Dispatch): string {
  const summary = d.publicSummary;
  return [
    d.caption ?? '',
    summary?.title ?? '',
    ...(summary?.body ?? []),
    d.platformCaptions?.x ?? '',
    d.platformCaptions?.linkedin ?? '',
    d.platformCaptions?.instagram ?? '',
  ].join('\n');
}

/* Field vocabulary that means nothing outside the station and should never
 * reach a public caption: stake/site codes (MAI-S12), QC flags, sample and
 * instrument serials. Mirrors the server-side stripper in functions/studio.js. */
const STAKE_CODE = /\b[A-Z]{2,4}-[A-Z0-9]{1,4}\d{1,4}\b/;
const QC_FLAG = /\bQC\s*[:=]/i;
const SERIAL = /\b(?:s\/n|serial)\s*[:#]?\s*[A-Z0-9-]{4,}\b/i;

/* Claims that outrun what one field dispatch can support. Not banned —
 * flagged, because occasionally one is true and the approver decides. */
const SUPERLATIVES = /\b(first[- ]ever|first time|never before|unprecedented|breakthrough|revolutionary|historic|world'?s (?:first|largest|only)|record[- ]breaking|proves?|confirms? that)\b/i;

const SHOUTING = /\b[A-Z]{4,}\b/;

export function runChecks(d: Dispatch): Check[] {
  const out: Check[] = [];
  const add = (c: Check) => out.push(c);

  const text = publicText(d);
  const summary = d.publicSummary;

  /* ── blockers: publishing is refused by default. An admin can overrule
     either of these deliberately (repository/publish.ts's publishObjections
     and the approve desk's confirmation), and the override is recorded —
     so the wording says "normally", because that is what is true. ── */

  if (d.safetyFlag) {
    add({ id: 'safety-flag', severity: 'blocker',
      label: 'Flagged for the station leader',
      detail: 'Safety-flagged dispatches are normally kept internal. Clear it at the station, or publish it over this objection.' });
  }

  if (/emergency|incident/i.test(d.activity)) {
    add({ id: 'incident', severity: 'blocker',
      label: 'Incident report',
      detail: 'Incidents are normally internal records. Publishing one is an admin’s call, on the record.' });
  }

  /* ── missing: publishable, but something a reader would expect is absent ── */

  if (!d.imageUrls?.length) {
    add({ id: 'no-photo', severity: 'missing',
      label: 'No photograph',
      detail: 'The post and the public record will both run without an image.' });
  }

  if (!summary) {
    add({ id: 'no-summary', severity: 'missing',
      label: 'No public summary written',
      detail: 'Approving falls back to an auto-generated draft nobody has read.' });
  } else {
    if (!summary.title?.trim()) {
      add({ id: 'no-title', severity: 'missing', label: 'Public title is empty',
        detail: 'The record would publish untitled.' });
    }
    if (!summary.body?.some((p) => p.trim())) {
      add({ id: 'no-body', severity: 'missing', label: 'Public summary has no text',
        detail: 'The record would publish with a title and nothing else.' });
    }
  }

  if (!Object.values(d.measurements ?? {}).some((v) => String(v).trim())) {
    add({ id: 'no-measurements', severity: 'missing',
      label: 'No measurements recorded',
      detail: 'Nothing quantitative to cite — the record rests on the notes alone.' });
  }

  if ((d.notes ?? '').trim().length < 40) {
    add({ id: 'thin-notes', severity: 'missing',
      label: 'Field notes are very short',
      detail: 'Little for a summary to be built from, and little to verify it against.' });
  }

  if (d.lat == null || d.lon == null) {
    add({ id: 'no-position', severity: 'missing',
      label: 'No coordinates',
      detail: 'The published record cannot be placed on a map or cited spatially.' });
  }

  if (!(d.caption ?? '').trim()) {
    add({ id: 'no-caption', severity: 'missing',
      label: 'No caption drafted',
      detail: 'Nothing to post alongside the graphic.' });
  }

  const sop = d.sopChecklist ?? null;
  if (sop) {
    const unticked = Object.entries(sop).filter(([, v]) => !v).map(([k]) => k);
    if (unticked.length) {
      add({ id: 'sop', severity: 'missing',
        label: `Publication checklist incomplete (${unticked.length} unticked)`,
        detail: `Not confirmed: ${unticked.join(', ')}.` });
    }
  }

  /* ── caution: present, but likely to embarrass someone if it ships ── */

  if (STAKE_CODE.test(text) || QC_FLAG.test(text) || SERIAL.test(text)) {
    add({ id: 'jargon', severity: 'caution',
      label: 'Field codes in public text',
      detail: 'Stake IDs, QC flags or serials mean nothing to a reader — strip them.' });
  }

  if (SUPERLATIVES.test(text)) {
    add({ id: 'overclaim', severity: 'caution',
      label: 'Absolute or superlative claim',
      detail: 'One dispatch rarely supports "first", "proves" or "unprecedented".' });
  }

  const bangs = (text.match(/!/g) ?? []).length;
  if (bangs >= 3) {
    add({ id: 'exclamation', severity: 'caution',
      label: `${bangs} exclamation marks`,
      detail: 'Reads as promotion rather than a research record.' });
  }

  // Ignore the acronyms this programme legitimately shouts.
  const shouted = text.replace(/\b(NCPOR|MOES|ISRO|CSIR|UTC|GPS|CTD|WGS|AWS|SOP|IIA)\b/g, '');
  if (SHOUTING.test(shouted)) {
    add({ id: 'caps', severity: 'caution',
      label: 'Words in block capitals',
      detail: 'Reads as shouting in a caption; sentence case is the house style.' });
  }

  if (d.teamMembers?.trim()) {
    const named = d.teamMembers.split(/[,;/]| and /i).map((n) => n.trim()).filter((n) => n.length > 3);
    const leaked = named.filter((n) => text.toLowerCase().includes(n.toLowerCase()));
    if (leaked.length) {
      add({ id: 'team-named', severity: 'caution',
        label: 'Team member named publicly',
        detail: `${leaked.join(', ')} — the field party is internal unless they agreed to be credited.` });
    }
  }

  if (d.sampleIds?.trim()) {
    const ids = d.sampleIds.split(/[,;\s]+/).filter((s) => s.length >= 4);
    if (ids.some((s) => text.includes(s))) {
      add({ id: 'sample-ids', severity: 'caution',
        label: 'Sample IDs in public text',
        detail: 'Specimen identifiers are internal bookkeeping.' });
    }
  }

  /* Platform limits. X is the only one short enough to bite in practice. */
  const x = d.platformCaptions?.x ?? '';
  if (x.length > 280) {
    add({ id: 'x-too-long', severity: 'caution',
      label: `X caption is ${x.length} characters`,
      detail: 'Over the 280 limit — it will be truncated or refused.' });
  }

  return out;
}

/** Convenience for the UI: the worst severity present, or null if clean. */
export function worstSeverity(checks: Check[]): Severity | null {
  if (checks.some((c) => c.severity === 'blocker')) return 'blocker';
  if (checks.some((c) => c.severity === 'missing')) return 'missing';
  if (checks.some((c) => c.severity === 'caution')) return 'caution';
  return null;
}
