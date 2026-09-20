/**
 * The words layer.
 *
 * Two paths, one interface. `draftVariants` always works offline from the
 * dispatch itself; `generateVariants` asks the Gemini-backed Cloud Function
 * for better-written versions and falls back to the offline draft when the
 * function is not deployed, has no key, or errors. The studio never blocks
 * on the model — a publisher who is offline still gets three usable options
 * and can edit every word by hand.
 *
 * Note the deliberate split from `brand.ts`/`templates.ts`: the model is
 * asked for language only. It never chooses colours, sizes or arrangement.
 */

import type { Dispatch } from '../types';
import type { Measurement } from '../repository/contract';
import { HASHTAG_BY_STATION, HASHTAG_BY_ACTIVITY, PLATFORM_LIMITS } from '../types';
import type { BasicAnswers } from './basics';

/* ────────────────────────────────────────────────────────────── brief ── */

export type Audience = 'public' | 'students' | 'researchers' | 'press';
export type Tone = 'plain' | 'warm' | 'formal' | 'punchy';

export const AUDIENCES: { id: Audience; label: string; hint: string }[] = [
  { id: 'public',      label: 'General public', hint: 'No science background assumed' },
  { id: 'students',    label: 'Students',       hint: 'Curious, school or college age' },
  { id: 'researchers', label: 'Researchers',    hint: 'Comfortable with technical terms' },
  { id: 'press',       label: 'Press',          hint: 'Looking for the newsworthy angle' },
];

export const TONES: { id: Tone; label: string; hint: string }[] = [
  { id: 'plain',  label: 'Plain',  hint: 'Straight, factual, no flourish' },
  { id: 'warm',   label: 'Warm',   hint: 'Human, a bit of feeling' },
  { id: 'formal', label: 'Formal', hint: 'Institutional voice, full sentences' },
  { id: 'punchy', label: 'Punchy', hint: 'Short lines, strong verbs' },
];

export interface Brief {
  /** What the publisher typed. Pre-filled from the field notes. */
  topic: string;
  audience: Audience;
  tone: Tone;
  /** Set when the post was built on an existing archive record rather than
   *  only on this dispatch — see `describeRecordForBrief()`. Kept beside the
   *  prose instead of inside it so the link can be attached to the finished
   *  captions without the model ever being asked to reproduce a URL, which is
   *  the one thing a language model is reliably bad at. */
  source?: PostSource;
  /** The Basic step's answers — purpose, call to action, occasion, data
   *  status, credit, language, links. See studio/basics.ts. */
  basics?: BasicAnswers;
}

export interface PostSource {
  identifier: string;
  title: string;
  url: string;
}

/** The public address of a published record. The citable identifier is the
 *  handle, matching recordSlug() on the public site — /knowledge-repository/IIA-2026-0001
 *  is the address of the thing a citation names, not a database key. */
export function recordUrl(identifier: string, origin = 'https://iia-public.web.app'): string {
  return `${origin}/knowledge-repository/${identifier}`;
}

/**
 * Turn an archive record into brief material the generator can write from.
 *
 * The model is handed facts, never asked to recall them: the title, when and
 * where the work happened, and the record's own key figures. That is the
 * difference between "write a post about the 1998 Maitri ozone record" — which
 * invites invention — and giving it the record and asking it to write about
 * what is there.
 */
export function describeRecordForBrief(record: {
  title: string;
  body?: string[];
  year?: string;
  station?: string;
  kind?: string;
  measurements?: { label: string; value: string | number; unit?: string | null }[];
  table?: { label: string; value: string }[];
}): string {
  const lines: string[] = [];
  lines.push(record.title);

  const locator = [record.kind, record.station, record.year].filter(Boolean).join(' · ');
  if (locator) lines.push(locator);

  const lead = (record.body ?? []).slice(0, 2).join(' ');
  if (lead) lines.push(lead);

  const facts = [
    ...(record.table ?? []).map((f) => `${f.label}: ${f.value}`),
    ...(record.measurements ?? []).map(
      (m) => `${m.label}: ${m.value}${m.unit ? ' ' + m.unit : ''}`,
    ),
  ].slice(0, 8);
  if (facts.length) lines.push(facts.join('; '));

  return lines.join(NEWLINE);
}

const NEWLINE = String.fromCharCode(10);

/**
 * Attach the source link to every caption.
 *
 * Done after generation rather than in the prompt, because a model asked to
 * include a URL will cheerfully invent a plausible one. The link is appended
 * only where it fits — a caption already at the platform's ceiling is left
 * alone rather than silently truncated into nonsense.
 */
export function withSourceLink<T extends { copy: PostCopy }>(
  variants: T[],
  source: PostSource | undefined,
  limits: Record<keyof PostCopy['captions'], number> = { x: 280, linkedin: 3000, instagram: 2200 },
): T[] {
  if (!source) return variants;
  const suffix = ' ' + source.url;

  return variants.map((v) => {
    const captions = { ...v.copy.captions };
    for (const key of Object.keys(captions) as (keyof PostCopy['captions'])[]) {
      const current = captions[key];
      // Instagram does not make caption links clickable — it gets a pointer.
      if (key === 'instagram') { captions[key] = withLinkInBio(current, limits[key]); continue; }
      if (current.includes(source.url)) continue;
      if (key === 'linkedin') {
        const next = placeLinkedInLink(current, source.url);
        if (next.length <= limits[key]) captions[key] = next;
        continue;
      }
      if (current.length + suffix.length <= limits[key]) captions[key] = current + suffix;
    }
    return { ...v, copy: { ...v.copy, captions } };
  });
}

export const LINK_IN_BIO = 'Link in bio.';

/** Instagram's stand-in for a link: one "Link in bio." line, placed before
 *  the hashtag block if there is one, never twice. */
export function withLinkInBio(caption: string, limit = 2200): string {
  if (!caption || /link in bio/i.test(caption)) return caption;
  // "Read the full record." becomes "Read the full record — link in bio."
  const lines = caption.split(NEWLINE);
  const cta = lines.findIndex((l) => /read the (full )?record|explore the (open )?data|visit the/i.test(l));
  if (cta >= 0) {
    lines[cta] = `${lines[cta].replace(/[.:]?\s*$/, '')} — link in bio.`;
    const merged = lines.join(NEWLINE);
    return merged.length <= limit ? merged : caption;
  }
  const next = aboveTags(caption, LINK_IN_BIO);
  return next.length <= limit ? next : caption;
}

/** Inserts a line just above a trailing hashtag line, or at the end. */
function aboveTags(caption: string, line: string): string {
  const lines = caption.split(NEWLINE);
  const tagsAt = lines.findIndex((l) => /^\s*(#[\p{L}\p{N}_]+\s*)+$/u.test(l));
  if (tagsAt <= 0) return caption + NEWLINE + NEWLINE + line;
  // Keep the caption's own spacing: a blank line before the tags stays one.
  const spaced = lines[tagsAt - 1].trim() === '';
  return [...lines.slice(0, tagsAt), ...(spaced ? [line, ''] : [line]), ...lines.slice(tagsAt)].join(NEWLINE);
}

/** LinkedIn: a link belongs on the "Read the full record" line when there is
 *  one, else on its own line above the hashtags — never tacked onto them. */
function placeLinkedInLink(caption: string, url: string): string {
  const lines = caption.split(NEWLINE);
  const cta = lines.findIndex((l) => /read the (full )?record|explore the (open )?data|visit the/i.test(l) && !l.includes('http'));
  if (cta >= 0) { lines[cta] = `${lines[cta].replace(/[.:]?\s*$/, ':')} ${url}`; return lines.join(NEWLINE); }
  return aboveTags(caption, url);
}

/**
 * Attach the publisher's own links to every caption, each on its own line,
 * after generation — for the same reason as the source link. A link that
 * does not fit a platform's ceiling is left off that caption, not forced in;
 * the alignment check reports it.
 */
export function withLinks<T extends { copy: PostCopy }>(
  variants: T[],
  links: string[],
  limits: Record<keyof PostCopy['captions'], number> = { x: 280, linkedin: 3000, instagram: 2200 },
): T[] {
  if (!links.length) return variants;
  return variants.map((v) => {
    const captions = { ...v.copy.captions };
    for (const key of Object.keys(captions) as (keyof PostCopy['captions'])[]) {
      if (key === 'instagram') { captions[key] = withLinkInBio(captions[key], limits[key]); continue; }
      for (const link of links) {
        const current = captions[key];
        if (!current || current.includes(link)) continue;
        const next = key === 'linkedin' ? aboveTags(current, link) : current + NEWLINE + link;
        if (next.length <= limits[key]) captions[key] = next;
      }
    }
    return { ...v, copy: { ...v.copy, captions } };
  });
}

export const DEFAULT_BRIEF: Omit<Brief, 'topic'> = { audience: 'public', tone: 'plain' };

/* ─────────────────────────────────────────────────────────────── copy ── */

export interface PostCopy {
  /** Small label above the headline. Always the factual locator. */
  kicker: string;
  headline: string;
  standfirst: string;
  /** For the "One number" template: the figure and what it measures. */
  stat: string | null;
  statLabel: string | null;
  captions: { x: string; linkedin: string; instagram: string };
}

export interface Variant {
  id: string;
  /** The editorial angle, shown to the publisher so the three options read
   *  as genuinely different choices rather than three re-rolls. */
  angle: string;
  copy: PostCopy;
}

/* ──────────────────────────────────────────────────────────── helpers ── */

function sentences(text: string): string[] {
  return (text || '')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Gives a LinkedIn or Instagram caption the shape its feed reads in, when the
 * writer returned it as one block (it often does in JSON mode): the first
 * sentence alone as the hook — the only line shown before "…see more" /
 * "…more" — then paragraphs of two sentences, then the hashtags on their own
 * line. A caption that already has line breaks was shaped on purpose and is
 * left exactly as it is.
 */
export function shapeCaption(raw: string): string {
  // A sentence run straight into the next ("the world.NCPOR is…") is a line
  // break the writer lost, not a sentence it meant to write.
  const text = (raw || '').replace(/([a-z0-9][.!?])(?=[A-Z])/g, '$1\n\n');
  if (!text || text !== raw || text.includes('\n')) return text;
  const tagMatch = text.match(/(\s+#[\p{L}\p{N}_]+)+\s*$/u);
  const tags = tagMatch ? tagMatch[0].trim() : '';
  const bodyText = tagMatch ? text.slice(0, tagMatch.index).trim() : text.trim();
  const sentences = bodyText.match(/[^.!?]+[.!?]+["”’)]*(\s+|$)|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [bodyText];
  if (sentences.length < 3 && !tags) return text;
  const [hook, ...rest] = sentences;
  const paragraphs: string[] = [];
  for (let i = 0; i < rest.length; i += 2) paragraphs.push(rest.slice(i, i + 2).join(' '));
  return [hook, ...paragraphs, ...(tags ? [tags] : [])].join('\n\n');
}

function clamp(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return text.slice(0, limit - 1).replace(/\s+\S*$/, '') + '…';
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Strip the things a field report carries that a public post should not:
 *  stake IDs, QC flags, instrument serials, sample codes. */
function deJargon(text: string): string {
  return text
    .replace(/\b[A-Z]{2,4}-[A-Z0-9]{1,4}\d{1,4}\b/g, '')  // MAI-S12, BHA-A3
    .replace(/\bQC[:\s-]*\w+/gi, '')
    .replace(/\bs\/n[:\s]*\S+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function pickStat(measurements: Measurement[]): { stat: string; label: string } | null {
  const numeric = measurements.find((m) => m.value && !Number.isNaN(Number(m.value)));
  if (!numeric) return null;
  return {
    stat: numeric.unit ? `${numeric.value} ${numeric.unit}` : numeric.value,
    label: numeric.label,
  };
}

const TONE_OPENERS: Record<Tone, (subject: string) => string> = {
  plain:  (s) => s,
  warm:   (s) => `Out on the ice: ${s.charAt(0).toLowerCase()}${s.slice(1)}`,
  formal: (s) => `Field observation — ${s.charAt(0).toLowerCase()}${s.slice(1)}`,
  punchy: (s) => s.replace(/\.$/, ''),
};

const AUDIENCE_CLOSER: Record<Audience, string> = {
  public:      'Part of India’s year-round scientific presence in Antarctica.',
  students:    'Want to know how work like this gets done? Ask our scientists.',
  researchers: 'Full record and metadata are published in the Knowledge Repository.',
  press:       'Data and imagery available for use under CC BY 4.0.',
};

/* ───────────────────────────────────────────────── offline draft path ── */

/**
 * Three genuinely different angles on the same dispatch, written without a
 * network call. This is the floor the studio is guaranteed to give you.
 */
export function draftVariants(
  d: Dispatch,
  measurements: Measurement[],
  brief: Brief,
): Variant[] {
  const station = d.station || 'an Antarctic station';
  const activity = (d.activity || 'Field work').toLowerCase();
  const body = deJargon(brief.topic || d.notes || '');
  const parts = sentences(body);
  const lead = parts[0] ?? `${titleCase(activity)} at ${station}.`;
  const support = parts.slice(1, 3).join(' ');
  const stat = pickStat(measurements);

  const tags = [
    ...(HASHTAG_BY_STATION[d.station] ?? []),
    ...(HASHTAG_BY_ACTIVITY[d.activity] ?? []),
  ];
  const kicker = `${station.toUpperCase()} · ${(d.activity || 'FIELD REPORT').toUpperCase()}`;
  const closer = AUDIENCE_CLOSER[brief.audience];

  const build = (
    id: string,
    angle: string,
    headline: string,
    standfirst: string,
  ): Variant => {
    const long = `${headline}\n\n${standfirst}${support ? ` ${support}` : ''}\n\n${closer}`;
    return {
      id,
      angle,
      copy: {
        kicker,
        headline: TONE_OPENERS[brief.tone](headline),
        standfirst,
        stat: stat?.stat ?? null,
        statLabel: stat?.label ?? null,
        captions: {
          x: clamp(`${headline} ${tags.slice(0, 2).join(' ')}`.trim(), PLATFORM_LIMITS.x),
          linkedin: clamp(long, PLATFORM_LIMITS.linkedin),
          instagram: clamp(`${headline}\n\n${standfirst}\n\n${tags.join(' ')}`, PLATFORM_LIMITS.instagram),
        },
      },
    };
  };

  return [
    build(
      'observation',
      'Leads with what was measured',
      stat
        ? `${stat.stat} of ${stat.label.toLowerCase()} recorded at ${station}`
        : clamp(lead, 90),
      support || `Recorded during ${activity} at ${station}.`,
    ),
    build(
      'place',
      'Leads with the place',
      `${station}: ${clamp(lead.replace(/^.*?[:—-]\s*/, ''), 70).toLowerCase()}`,
      `Our team is running ${activity} through the current season.`,
    ),
    build(
      'why',
      'Leads with why it matters',
      brief.audience === 'researchers'
        ? `New ${activity} data from ${station} is now published`
        : `Why our team is out measuring ${activity.replace(/ survey$/, '')} at ${station}`,
      clamp(lead, 150),
    ),
  ];
}

/* ─────────────────────────────────────────────────── generated path ──── */

/** Where the key lives. The browser never sees it — this is a Cloud
 *  Function that holds the Gemini credential server-side and returns only
 *  text. Shipping a generative key in a React bundle would publish it to
 *  everyone who opens the portal. */
const GENERATE_URL =
  (import.meta.env.VITE_STUDIO_API as string | undefined) ??
  'https://asia-south1-indiainantartica.cloudfunctions.net/studio/copy';

export interface GenerateResult {
  variants: Variant[];
  /** True when the text came from the model; false when the offline draft
   *  was used. Surfaced in the UI so a publisher always knows which it is. */
  generated: boolean;
  reason?: string;
}

interface GeneratedVariant {
  angle?: string;
  headline?: string;
  standfirst?: string;
  captions?: Partial<PostCopy['captions']>;
}

export async function generateVariants(
  d: Dispatch,
  measurements: Measurement[],
  brief: Brief,
  signal?: AbortSignal,
  /* What the agent worked out before this call — content type, platform
   * constraints, house style, the archive record behind the post. Built by
   * studio/agent.ts's generatorDirection(). Passed as opaque text rather
   * than as structured fields because it is prose written for a model, and
   * the endpoint's job is to place it in the prompt, not to interpret it. */
  direction?: string,
): Promise<GenerateResult> {
  const fallback = draftVariants(d, measurements, brief);

  try {
    const res = await fetch(GENERATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        station: d.station,
        activity: d.activity,
        notes: deJargon(brief.topic || d.notes || ''),
        measurements: measurements.map((m) => ({ label: m.label, value: m.value, unit: m.unit })),
        audience: brief.audience,
        tone: brief.tone,
        goal: brief.basics?.goal ?? undefined,
        language: brief.basics?.language ?? 'en',
        direction: direction ?? '',
      }),
    });

    if (!res.ok) return { variants: fallback, generated: false, reason: `Generator returned ${res.status}` };

    const data = await res.json();
    if (!Array.isArray(data?.variants) || data.variants.length === 0) {
      return { variants: fallback, generated: false, reason: 'Generator returned nothing usable' };
    }

    /* Merge rather than trust: the model supplies language, we keep the
     * factual kicker, the stat and the hashtag set we already know are
     * correct. A hallucinated station name never reaches the canvas. */
    const merged: Variant[] = (data.variants as GeneratedVariant[]).slice(0, 3).map((v, i) => {
      const base = fallback[Math.min(i, fallback.length - 1)];
      return {
        id: base.id,
        angle: v.angle ?? base.angle,
        copy: {
          ...base.copy,
          headline: v.headline || base.copy.headline,
          standfirst: v.standfirst || base.copy.standfirst,
          captions: {
            x: clamp(v.captions?.x || base.copy.captions.x, PLATFORM_LIMITS.x),
            linkedin: clamp(shapeCaption(v.captions?.linkedin || base.copy.captions.linkedin), PLATFORM_LIMITS.linkedin),
            instagram: clamp(shapeCaption(v.captions?.instagram || base.copy.captions.instagram), PLATFORM_LIMITS.instagram),
          },
        },
      };
    });

    return { variants: merged, generated: true };
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err;
    return { variants: fallback, generated: false, reason: 'Generator unreachable — using the offline draft' };
  }
}

/* ────────────────────────────────────────────────────────── refinement ── */

export type CopyRefinement = 'shorter' | 'longer' | 'formal' | 'excited';

export const COPY_REFINEMENTS: { id: CopyRefinement; label: string }[] = [
  { id: 'shorter', label: 'Shorter' },
  { id: 'longer',  label: 'Add detail' },
  { id: 'formal',  label: 'More formal' },
  { id: 'excited', label: 'More exciting' },
];

/** Deterministic text tweaks. These run instantly with no network call,
 *  which is the point: a publisher clicking "shorter" should not wait, and
 *  should not get a wholly different post back. */
export function refineCopy(copy: PostCopy, op: CopyRefinement): PostCopy {
  switch (op) {
    case 'shorter':
      return {
        ...copy,
        headline: clamp(copy.headline, Math.max(28, Math.floor(copy.headline.length * 0.7))),
        standfirst: clamp(copy.standfirst, Math.max(40, Math.floor(copy.standfirst.length * 0.6))),
      };
    case 'longer':
      return {
        ...copy,
        standfirst: copy.standfirst.replace(/\.?$/, '.') + ' The full record is published in the Knowledge Repository.',
      };
    case 'formal':
      return {
        ...copy,
        headline: copy.headline.replace(/^Out on the ice: /, '').replace(/!$/, '.'),
        standfirst: copy.standfirst.replace(/\bwe\b/gi, 'the team').replace(/\bour\b/gi, 'the'),
      };
    case 'excited':
      return {
        ...copy,
        headline: copy.headline.replace(/\.$/, ''),
        standfirst: copy.standfirst.replace(/\.$/, '') + ' — and there is more to come.',
      };
  }
}
