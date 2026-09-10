/* ═══════════════════════════════════════════════════════════ redaction
 *
 * What crosses from the field record into the public one, and what does not.
 *
 * publish.ts already enforces this: it builds the public record field by
 * field, so anything not named there simply never travels. That is the right
 * mechanism and it is invisible — a reviewer approving a dispatch has no way
 * to see that the raw notes, the field party and the sample identifiers stay
 * behind, and no way to check that judgement before clicking publish.
 *
 * This module makes the boundary legible. Every field of a Dispatch is
 * declared here with a disposition and a reason, and `redactionOf()` turns
 * that declaration plus a real dispatch into the three columns a reviewer
 * needs: what was collected, what is withheld and why, and what publishes.
 *
 * The declaration is exhaustive by construction — FIELD_RULES is typed
 * against `keyof Dispatch`, so adding a field to Dispatch without deciding
 * what happens to it is a type error rather than a silent leak. redaction
 * .test.ts asserts the same thing at runtime for good measure.
 */

import type { Dispatch, ResearchDocument } from '../types';

/** What happens to a field when the public record is built. */
export type Disposition =
  /** Published as-is. */
  | 'published'
  /** Published, but rewritten or reduced — a coordinate rounded, a name
   *  turned into a credit line, measurements reformatted with units. */
  | 'transformed'
  /** Never published. The reason says why. */
  | 'withheld'
  /** Not content: an internal key, a timestamp, a pipeline flag. Shown in
   *  the withheld column but greyed, so the list stays honest without
   *  drowning the real decisions. */
  | 'internal';

export interface FieldRule {
  label: string;
  disposition: Disposition;
  /** Why, in the words you would use to defend the decision. */
  reason: string;
}

/* ────────────────────────────────────────────────────────── the rules ── */

export const FIELD_RULES: Record<keyof Dispatch, FieldRule> = {
  id:             { label: 'Record id', disposition: 'internal', reason: 'Database key. Becomes the public record’s id, which is not sensitive.' },
  authorUid:      { label: 'Author account id', disposition: 'withheld', reason: 'An account identifier is not part of the science. The observer is credited by name instead.' },
  authorName:     { label: 'Observer', disposition: 'published', reason: 'Attribution is the point of a repository. The person who made the observation is credited on the public record.' },

  observedAt:     { label: 'Date and time observed', disposition: 'published', reason: 'When a measurement was taken is part of the measurement.' },
  station:        { label: 'Station', disposition: 'published', reason: 'Where the work was done, and how the record is indexed.' },
  lat:            { label: 'Latitude', disposition: 'published', reason: 'Published to four decimal places with the WGS84 datum stated, so the record can be placed on a map.' },
  lon:            { label: 'Longitude', disposition: 'published', reason: 'Published with the datum stated, same as latitude.' },
  elevationM:     { label: 'Elevation', disposition: 'published', reason: 'Part of the position.' },
  positionSource: { label: 'How the position was fixed', disposition: 'withheld', reason: 'Internal quality note. The published record states the datum and accuracy instead.' },

  activity:       { label: 'Activity', disposition: 'published', reason: 'What kind of work this was — it drives the record’s category and its method section.' },
  priority:       { label: 'Priority', disposition: 'withheld', reason: 'An internal triage flag for the newsroom queue. It says how urgently a publisher should look at the dispatch, not anything about the science.' },
  weather:        { label: 'Weather observation', disposition: 'published', reason: 'Conditions are part of the measurement — they tell a later user what uncertainty to attach to it.' },
  measurements:   { label: 'Measurements', disposition: 'transformed', reason: 'Published with their labels and units attached, and charted where the numbers support it. The raw keyed values are not published as-is.' },
  notes:          { label: 'Field notes', disposition: 'withheld', reason: 'Free narrative written by the observer for colleagues. It routinely contains working opinions, equipment complaints, half-formed conclusions and references to people. The publisher writes the public wording from it; the notes themselves never travel.' },

  teamMembers:    { label: 'Field party', disposition: 'withheld', reason: 'Naming everyone present publishes the movements of people who did not choose to be published. Only the observer filing the record is credited.' },
  sampleIds:      { label: 'Sample identifiers', disposition: 'withheld', reason: 'Internal specimen accession numbers. They point into a physical sample store and are meaningless — and potentially misleading — outside it.' },
  safetyFlag:     { label: 'Safety flag', disposition: 'withheld', reason: 'A flag for the station leader. A flagged dispatch cannot be published at all, which is enforced before this projection runs.' },

  voiceUrl:       { label: 'Voice note', disposition: 'withheld', reason: 'A recording of someone talking to their own team. Never published.' },
  imageUrls:      { label: 'Photographs', disposition: 'transformed', reason: 'Published, with the publisher’s chosen cover photo moved to the front.' },
  csvUrl:         { label: 'Raw instrument file', disposition: 'withheld', reason: 'Unprocessed instrument output, published only after it has been through quality control and deposited as a dataset in its own right.' },
  docUrls:        { label: 'Attached documents', disposition: 'withheld', reason: 'Working attachments — drafts, scans, correspondence. Not reviewed for publication, so not published.' },

  caption:        { label: 'Social caption', disposition: 'withheld', reason: 'Written for a social feed, not for the archive. The repository record carries the publisher’s report wording instead.' },
  status:         { label: 'Pipeline status', disposition: 'internal', reason: 'Where the dispatch sits in review. Only ‘approved’ can publish; the flag itself is not public.' },
  publisherName:  { label: 'Publisher', disposition: 'transformed', reason: 'Not printed on the record, but credited as the author of any wording the publisher wrote themselves.' },
  publisherUid:   { label: 'Publisher account id', disposition: 'withheld', reason: 'An account identifier. Never published.' },
  platformCaptions: { label: 'Per-platform captions', disposition: 'withheld', reason: 'Social copy variants. Same reasoning as the caption.' },
  coverImageIndex: { label: 'Chosen cover photo', disposition: 'transformed', reason: 'Not published as a number — it decides which photograph goes first.' },
  sopChecklist:   { label: 'SOP checklist', disposition: 'withheld', reason: 'The reviewer’s own audit trail. It records that process was followed, which is an internal assurance, not public content.' },
  publicSummary:  { label: 'Public summary', disposition: 'transformed', reason: 'This is the text written for publication. It becomes the record’s abstract.' },
  postDesign:     { label: 'Post design', disposition: 'withheld', reason: 'Layout choices for a social graphic. Nothing to do with the record.' },
  photoCheck:     { label: 'Automated photograph check', disposition: 'withheld', reason: 'The pre-publication check on the photograph — what a vision model saw in it and any concerns it raised. Internal review evidence for the approver, and a description of an image is not something the public record needs.' },
  agentTrace:     { label: 'Agent reasoning record', disposition: 'withheld', reason: 'How the studio agent made the post — the sources it consulted, its reasoning, the questions it asked the publisher and the instructions given to the writer. Review evidence for the approver; the public sees the post, not the working behind it.' },
  adminNotes:     { label: 'Admin notes', disposition: 'withheld', reason: 'Written by reviewers about the submission, sometimes about the person who filed it. Never published under any circumstances.' },
  createdAt:      { label: 'Filed at', disposition: 'internal', reason: 'When the dispatch was submitted, as distinct from when the observation was made.' },
  updatedAt:      { label: 'Last edited', disposition: 'internal', reason: 'When the dispatch was last edited in the portal. A pipeline timestamp, not a fact about the observation.' },
  conditions:     { label: 'Conditions (legacy)', disposition: 'withheld', reason: 'Superseded by the structured weather observation. Kept so older dispatches still render in the portal.' },
  publicRecordId: { label: 'Public record id', disposition: 'internal', reason: 'The publicArchive document this dispatch became once approved. A pipeline cross-reference, not a fact about the observation — the record itself is what publishes.' },
  publicIdentifier: { label: 'Public identifier', disposition: 'published', reason: 'The citable IIA-<year>-<seq> handle. It IS what is published — it is the address of the record itself, so a reviewer sees the same identifier here as the public does.' },
  reviewAnnotations: { label: 'Review markup', disposition: 'withheld', reason: 'Drawn marks and pinned comments an admin leaves for the publisher — communication about the post, never part of it. Never published.' },
};

/* ───────────────────────────────────────────────────────── derivation ── */

export interface RedactedField {
  key: string;
  label: string;
  disposition: Disposition;
  reason: string;
  /** The value as it stands on the field record, rendered for display. */
  raw: string;
}

export interface Redaction {
  /** Everything the field record holds, in declaration order. */
  all: RedactedField[];
  /** The ones a reviewer is being asked to take on trust — real content
   *  that exists and will not be published. */
  withheld: RedactedField[];
  published: RedactedField[];
  transformed: RedactedField[];
}

/** Renders a dispatch value for the raw column. Returns null for anything
 *  empty, so the preview shows what is actually there rather than a list of
 *  blanks. */
function display(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value.trim() === '' ? null : value;
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    return value
      .map((v) => (typeof v === 'object' && v !== null ? Object.values(v).join(' — ') : String(v)))
      .join('\n');
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== null && v !== undefined && v !== '');
    if (!entries.length) return null;
    return entries.map(([k, v]) => `${k}: ${v}`).join('\n');
  }
  return String(value);
}

/**
 * What this particular dispatch would publish, and what it would hold back.
 *
 * Only fields that actually carry something are listed: a dispatch with no
 * admin notes should not tell a reviewer that its admin notes were withheld,
 * because nothing was.
 */
export function redactionOf(d: Dispatch): Redaction {
  const all: RedactedField[] = [];

  for (const [key, rule] of Object.entries(FIELD_RULES) as [keyof Dispatch, FieldRule][]) {
    const raw = display(d[key]);
    if (raw === null) continue;
    all.push({ key, label: rule.label, disposition: rule.disposition, reason: rule.reason, raw });
  }

  return {
    all,
    withheld: all.filter((f) => f.disposition === 'withheld'),
    published: all.filter((f) => f.disposition === 'published'),
    transformed: all.filter((f) => f.disposition === 'transformed'),
  };
}

/* ─────────────────────────────────────────── repository deposits ─────── */

/** The same declaration for an uploaded document. Far shorter, because a
 *  deposit is written for publication from the start — the interesting case
 *  is the contributor's own contact details. */
export const DOCUMENT_RULES: Partial<Record<keyof ResearchDocument, FieldRule>> = {
  title:        { label: 'Title', disposition: 'published', reason: 'The record’s title.' },
  description:  { label: 'Summary', disposition: 'published', reason: 'Becomes the record’s abstract.' },
  fullText:     { label: 'Full report', disposition: 'published', reason: 'Published as the report body, split into paragraphs exactly as submitted.' },
  category:     { label: 'Category', disposition: 'published', reason: 'How the record is filed.' },
  instrument:   { label: 'Instrument / method', disposition: 'published', reason: 'How the data was collected.' },
  station:      { label: 'Station', disposition: 'published', reason: 'Where the work was done.' },
  observedAt:   { label: 'Date observed', disposition: 'published', reason: 'When the data was collected.' },
  lat:          { label: 'Latitude', disposition: 'published', reason: 'Published with the datum stated.' },
  lon:          { label: 'Longitude', disposition: 'published', reason: 'Published with the datum stated.' },
  license:      { label: 'Licence', disposition: 'published', reason: 'The terms the record is published under.' },
  embargo:      { label: 'Embargo', disposition: 'withheld', reason: 'An access decision about the record, not a fact about the science.' },
  fileName:     { label: 'File name', disposition: 'published', reason: 'Named on the record so a reader knows what the deposit is.' },
  fileUrl:      { label: 'File', disposition: 'transformed', reason: 'Linked as the record’s source. Uploads are world-readable by design; a video is played inline instead of linked.' },
  fileSizeBytes: { label: 'File size', disposition: 'transformed', reason: 'Published rounded to kilobytes alongside the file name.' },
  authorName:   { label: 'Contributor', disposition: 'published', reason: 'Credited on the record.' },
  authorEmail:  { label: 'Contributor email', disposition: 'withheld', reason: 'A personal contact address. Never published — correspondence goes through NCPOR.' },
  authorUid:    { label: 'Contributor account id', disposition: 'withheld', reason: 'An account identifier.' },
  status:       { label: 'Review status', disposition: 'internal', reason: 'Only a published deposit reaches the public site.' },
  reviewNotes:  { label: 'Review notes', disposition: 'withheld', reason: 'Written by reviewers about the submission. Never published.' },
  createdAt:    { label: 'Uploaded at', disposition: 'internal', reason: 'Upload timestamp, distinct from when the data was collected.' },
  mediaKind:    { label: 'Media kind', disposition: 'internal', reason: 'Decides whether the file plays inline or is offered as a download.' },
};

export function documentRedactionOf(doc: ResearchDocument): Redaction {
  const all: RedactedField[] = [];

  for (const [key, rule] of Object.entries(DOCUMENT_RULES) as [keyof ResearchDocument, FieldRule][]) {
    const raw = display(doc[key]);
    if (raw === null) continue;
    all.push({ key, label: rule.label, disposition: rule.disposition, reason: rule.reason, raw });
  }

  return {
    all,
    withheld: all.filter((f) => f.disposition === 'withheld'),
    published: all.filter((f) => f.disposition === 'published'),
    transformed: all.filter((f) => f.disposition === 'transformed'),
  };
}
