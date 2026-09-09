/**
 * What the studio agent actually works out before it writes anything.
 *
 * The visible part of this feature is a column of steps that light up one
 * after another — "reading the brief", "matching the tone", "searching for
 * visual references". The risk with that kind of UI is obvious: it is very
 * easy to build a progress animation that is pure theatre, where the labels
 * scroll past and the only real work is a single prompt fired at the start.
 *
 * So every step in this module corresponds to a decision that is genuinely
 * made here, from the brief, the archive and the record of what has been
 * published before. `classifyContentType` really does read the text.
 * `detectArchiveReference` really does search the published archive and
 * really does pull the record's facts in. `historicalBestPractice` really
 * does compute caption lengths and hashtag frequencies from posts that
 * actually went out. If the agent says it looked at eleven past posts, it
 * looked at eleven past posts.
 *
 * All of it is deterministic and offline. The language model is asked for
 * language, later, and is given this analysis as its brief — which is the
 * right way round: a model that has been told the content type, the
 * audience and the platform constraints writes better copy than one asked
 * to infer them, and the publisher can see and correct every inference
 * before a word is generated.
 */

import type { RepositoryRecord } from '../repository/contract';
import type { Audience, Brief, PostSource, Tone } from './copy';
import { describeRecordForBrief, recordUrl } from './copy';
import type { PlatformId } from './brand';

/* ═══════════════════════════════════════════════════════ content type ══ */

export type ContentType =
  | 'field-report'
  | 'dataset-drop'
  | 'expedition-report'
  | 'institutional'
  | 'observance'
  | 'follow-up'
  | 'explainer';

export interface ContentTypeInfo {
  id: ContentType;
  label: string;
  /** What this kind of post is for, in one line the publisher can check. */
  blurb: string;
  /** Audience and tone this type usually wants, used only when the
   *  publisher has not chosen for themselves. */
  suggests: { audience: Audience; tone: Tone };
  /** Extra instruction handed to the copy generator for this type. */
  direction: string;
}

export const CONTENT_TYPES: Record<ContentType, ContentTypeInfo> = {
  'field-report': {
    id: 'field-report',
    label: 'Field report',
    blurb: 'A measurement or observation made in the field, written up for the public.',
    suggests: { audience: 'public', tone: 'plain' },
    direction: 'Lead with what was measured and where. The reading itself is the news.',
  },
  'dataset-drop': {
    id: 'dataset-drop',
    label: 'Dataset release',
    blurb: 'Data being made available — say what it covers, and how to get it.',
    suggests: { audience: 'researchers', tone: 'plain' },
    direction:
      'State what the dataset contains, the period it covers and that it is openly available. Precision matters more than warmth here; the reader is deciding whether to download it.',
  },
  'expedition-report': {
    id: 'expedition-report',
    label: 'Expedition report',
    blurb: 'The story of a voyage, a season or a station build.',
    suggests: { audience: 'public', tone: 'warm' },
    direction:
      'This is narrative. Give it a beginning: who went, where, and what it took. Human detail is welcome as long as it is in the source material.',
  },
  institutional: {
    id: 'institutional',
    label: 'Institutional update',
    blurb: 'An announcement about NCPOR itself — an appointment, a facility, an anniversary.',
    suggests: { audience: 'press', tone: 'formal' },
    direction:
      'The institutional voice. State the fact plainly and attribute it. No first person, no enthusiasm.',
  },
  observance: {
    id: 'observance',
    label: 'Day or observance',
    blurb: 'A national day, an anniversary or an international observance.',
    suggests: { audience: 'public', tone: 'warm' },
    direction:
      'Tie the observance to something this institution actually does. A greeting with no substance behind it is the weakest post an institution can publish — anchor it in real work.',
  },
  'follow-up': {
    id: 'follow-up',
    label: 'Follow-up',
    blurb: 'A continuation of something already posted about.',
    suggests: { audience: 'public', tone: 'plain' },
    direction:
      'Assume the reader may not have seen the earlier post. Recap it in one clause, then give what is new.',
  },
  explainer: {
    id: 'explainer',
    label: 'Explainer',
    blurb: 'Explaining how something works or why it matters.',
    suggests: { audience: 'students', tone: 'warm' },
    direction:
      'Teach one idea, not five. Define the term the first time it appears. An explainer that assumes the reader already knows is a press release.',
  },
};

/** Keyword evidence per type. Weighted: a phrase that only ever appears in
 *  one kind of post counts for more than a word that drifts. */
const SIGNALS: { type: ContentType; weight: number; pattern: RegExp }[] = [
  { type: 'dataset-drop', weight: 3, pattern: /\b(dataset|data set|csv|netcdf|open data|data release|records?\s+released|now available to download|doi)\b/i },
  { type: 'dataset-drop', weight: 2, pattern: /\b(rows|columns|time series|archive of|measurements? spanning)\b/i },

  { type: 'expedition-report', weight: 3, pattern: /\b(expedition|voyage|traverse|resupply|icebreaker|sailed|shipboard|station build|commissioned)\b/i },
  { type: 'expedition-report', weight: 2, pattern: /\b(\d+(st|nd|rd|th)\s+indian\s+(scientific\s+)?expedition)\b/i },

  { type: 'institutional', weight: 3, pattern: /\b(ncpor|ministry of earth sciences|moes|memorandum|mou|inaugurat|appointed|foundation day|director|felicitat)\b/i },
  { type: 'institutional', weight: 2, pattern: /\b(anniversary|established|milestone|signed an agreement)\b/i },

  { type: 'observance', weight: 4, pattern: /\b(world .{3,24} day|national .{3,24} day|international .{3,24} day|republic day|independence day|diwali|holi|new year|antarctica day|earth day|ozone day)\b/i },
  { type: 'observance', weight: 2, pattern: /\b(celebrat|greetings|observ(ed|ance)|wishes to all)\b/i },

  { type: 'follow-up', weight: 4, pattern: /\b(follow[- ]?up|as we posted|earlier this (week|month|season)|part 2|part two|continuing|update on our)\b/i },

  { type: 'explainer', weight: 3, pattern: /\b(what is|how does|why does|explained|ever wondered|did you know|here.s how|thread on)\b/i },

  { type: 'field-report', weight: 3, pattern: /\b(measured|readings?|sampled|survey|logged|observed|drilled|cast|sonde|stake|thickness|count(ed)?)\b/i },
  { type: 'field-report', weight: 2, pattern: /\b(today|this morning|in the field|on site|at the station)\b/i },
];

export interface Classification {
  type: ContentTypeInfo;
  confidence: 'low' | 'medium' | 'high';
  /** The phrases that decided it, quoted back so a publisher can see the
   *  reasoning rather than being asked to trust a label. */
  evidence: string[];
  /** Every type that scored, best first — the UI offers these as overrides. */
  ranked: { type: ContentType; score: number }[];
}

/**
 * Works out what kind of post this is from the brief and, if one is
 * attached, the archive record behind it.
 *
 * A record's own `kind` is strong evidence and is weighted accordingly: a
 * brief built on a record filed as "Dataset" is a dataset release even if
 * the publisher's sentence does not use the word.
 */
export function classifyContentType(topic: string, record?: RepositoryRecord | null): Classification {
  const text = String(topic || '');
  const scores = new Map<ContentType, number>();
  const evidence: string[] = [];

  for (const signal of SIGNALS) {
    const hit = text.match(signal.pattern);
    if (!hit) continue;
    scores.set(signal.type, (scores.get(signal.type) ?? 0) + signal.weight);
    const phrase = hit[0].trim();
    if (phrase && !evidence.includes(phrase)) evidence.push(phrase);
  }

  if (record) {
    const kind = `${record.kind ?? ''} ${record.cat ?? ''}`.toLowerCase();
    const fromRecord: [RegExp, ContentType][] = [
      [/dataset/, 'dataset-drop'],
      [/expedition/, 'expedition-report'],
      [/institution/, 'institutional'],
      [/publication|paper/, 'explainer'],
    ];
    for (const [pattern, type] of fromRecord) {
      if (pattern.test(kind)) {
        scores.set(type, (scores.get(type) ?? 0) + 4);
        evidence.push(`archive record filed as “${record.kind}”`);
        break;
      }
    }
  }

  const ranked = [...scores.entries()]
    .map(([type, score]) => ({ type, score }))
    .sort((a, b) => b.score - a.score);

  const top = ranked[0];
  const runnerUp = ranked[1];

  // No signal at all is the common case for a terse field note, and
  // "field report" is the honest default for a dispatch-driven studio.
  if (!top) {
    return {
      type: CONTENT_TYPES['field-report'],
      confidence: 'low',
      evidence: [],
      ranked: [{ type: 'field-report', score: 0 }],
    };
  }

  const margin = top.score - (runnerUp?.score ?? 0);
  const confidence = top.score >= 5 && margin >= 3 ? 'high' : top.score >= 3 ? 'medium' : 'low';

  return { type: CONTENT_TYPES[top.type], confidence, evidence: evidence.slice(0, 4), ranked };
}

/* ═════════════════════════════════════════════════ archive references ══ */

export interface ArchiveMatch {
  record: RepositoryRecord;
  /** How it was found, shown to the publisher so an automatic pull never
   *  looks like magic. */
  how: 'identifier' | 'title' | 'keyword';
  matched: string;
  source: PostSource;
  material: string;
}

/** IIA-2026-0001 and friends — the citable identifier the public site uses
 *  as a record's address. */
const IDENTIFIER = /\bIIA-[A-Z0-9]{2,6}-\d{3,4}\b/gi;

/**
 * Finds the archive record a brief is talking about, without the publisher
 * having to go and pick it from the knowledge base.
 *
 * Three routes, strongest first: a citable identifier written out in the
 * text, a record title quoted closely enough to be unambiguous, or a
 * distinctive keyword overlap. Only the first two are treated as certain
 * enough to pull in automatically; a keyword match is offered as a
 * suggestion for the publisher to accept.
 */
export function detectArchiveReference(
  topic: string,
  records: RepositoryRecord[],
): ArchiveMatch | null {
  const text = String(topic || '');
  if (!text.trim() || !records.length) return null;

  const asSource = (r: RepositoryRecord): PostSource => {
    const identifier = r.metadata?.identifier ?? r.id;
    return { identifier, title: r.title, url: recordUrl(identifier) };
  };
  const asMaterial = (r: RepositoryRecord) =>
    describeRecordForBrief({
      title: r.title,
      body: r.body,
      year: r.year,
      station: r.metadata?.station,
      kind: r.kind,
      measurements: r.measurements,
      table: r.table,
    });

  // 1 — an identifier written out in the brief.
  const ids = text.match(IDENTIFIER);
  if (ids) {
    for (const raw of ids) {
      const wanted = raw.toUpperCase();
      const hit = records.find(
        (r) => (r.metadata?.identifier ?? '').toUpperCase() === wanted || r.id.toUpperCase() === wanted,
      );
      if (hit) {
        return { record: hit, how: 'identifier', matched: raw, source: asSource(hit), material: asMaterial(hit) };
      }
    }
  }

  // 2 — a record title quoted in the brief. Long titles only: matching on a
  // three-word title would fire on any sentence that happened to use those
  // words in order.
  const haystack = text.toLowerCase();
  for (const r of records) {
    const title = String(r.title || '').replace(/\s+/g, ' ').trim();
    if (title.length < 14) continue;
    if (haystack.includes(title.toLowerCase())) {
      return { record: r, how: 'title', matched: title, source: asSource(r), material: asMaterial(r) };
    }
  }

  // 3 — distinctive keyword overlap. Deliberately conservative: a rare word
  // shared with exactly one record is a signal, the word "ice" is not.
  const words = new Set(
    haystack
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 6 && !COMMON.has(w)),
  );
  if (words.size) {
    let best: { record: RepositoryRecord; hits: string[] } | null = null;
    for (const r of records) {
      const title = String(r.title || '').toLowerCase();
      const hits = [...words].filter((w) => title.includes(w));
      if (hits.length && (!best || hits.length > best.hits.length)) best = { record: r, hits };
    }
    if (best && best.hits.length >= 2) {
      return {
        record: best.record,
        how: 'keyword',
        matched: best.hits.join(', '),
        source: asSource(best.record),
        material: asMaterial(best.record),
      };
    }
  }

  return null;
}

/** Words long enough to pass the length filter but far too common in this
 *  domain to identify a single record. */
const COMMON = new Set([
  'antarctic', 'antarctica', 'station', 'research', 'science', 'polar',
  'measurement', 'measurements', 'sample', 'samples', 'report', 'record',
  'records', 'season', 'summer', 'winter', 'expedition', 'through', 'during',
  'between', 'because', 'programme', 'national', 'centre',
]);

/* ══════════════════════════════════════════════════════════ platforms ══ */

export interface PlatformRequirement {
  id: PlatformId;
  label: string;
  charLimit: number | null;
  /** Instagram is the one that genuinely cannot be posted without one. */
  needsImage: boolean;
  /** LinkedIn has no markdown; bold is done with Unicode maths characters
   *  or not at all. */
  supportsUnicodeStyling: boolean;
  hashtags: { min: number; max: number; note: string };
  /** The single sentence the publisher sees next to the platform chip. */
  demands: string;
}

export const PLATFORM_REQUIREMENTS: Record<string, PlatformRequirement> = {
  instagram: {
    id: 'instagram',
    label: 'Instagram',
    charLimit: 2200,
    needsImage: true,
    supportsUnicodeStyling: false,
    hashtags: { min: 5, max: 15, note: 'expected, and placed after the text rather than inside it' },
    demands: 'Needs a photograph — the image carries the post and the caption supports it.',
  },
  x: {
    id: 'x',
    label: 'X',
    charLimit: 280,
    needsImage: false,
    supportsUnicodeStyling: false,
    hashtags: { min: 1, max: 2, note: 'one or two at most — more reads as spam' },
    demands: 'Hard 280-character limit. The hook has to be the first line.',
  },
  linkedin: {
    id: 'linkedin',
    label: 'LinkedIn',
    charLimit: 3000,
    needsImage: false,
    supportsUnicodeStyling: true,
    hashtags: { min: 3, max: 5, note: 'three to five, at the end' },
    demands: 'First two lines show before “see more”. No markdown — bold is Unicode or nothing.',
  },
  story: {
    id: 'story',
    label: 'Instagram story',
    charLimit: null,
    needsImage: true,
    supportsUnicodeStyling: false,
    hashtags: { min: 0, max: 3, note: 'optional, and often placed as a sticker instead' },
    demands: '9:16. Keep text clear of the top and bottom bars.',
  },
};

/** What is not satisfiable yet, so the agent can say so before writing
 *  rather than after. */
export function platformGaps(platforms: PlatformId[], hasImage: boolean): string[] {
  const gaps: string[] = [];
  for (const p of platforms) {
    const req = PLATFORM_REQUIREMENTS[p];
    if (req?.needsImage && !hasImage) {
      gaps.push(`${req.label} needs a photograph and none is attached yet.`);
    }
  }
  return gaps;
}

/* ─────────────────────────────────────────────── LinkedIn unicode bold ── */

const BOLD_UPPER = 0x1d5d4; // MATHEMATICAL SANS-SERIF BOLD CAPITAL A
const BOLD_LOWER = 0x1d5ee; // MATHEMATICAL SANS-SERIF BOLD SMALL A
const BOLD_DIGIT = 0x1d7ec; // MATHEMATICAL SANS-SERIF BOLD DIGIT ZERO

/**
 * LinkedIn strips markdown, so every "bold" heading you have ever seen in a
 * LinkedIn post is really Unicode Mathematical Alphanumeric Symbols. This
 * does that substitution.
 *
 * It is offered rather than applied automatically, and it is worth knowing
 * why: screen readers announce these characters individually or skip them,
 * so a whole post written this way is close to unreadable assistive-tech
 * output. One short heading is a reasonable trade; a whole caption is not,
 * and `styleForLinkedIn` will not do more than the first line.
 */
export function toUnicodeBold(text: string): string {
  return String(text || '').replace(/[A-Za-z0-9]/g, (ch) => {
    const c = ch.codePointAt(0)!;
    if (c >= 65 && c <= 90) return String.fromCodePoint(BOLD_UPPER + (c - 65));
    if (c >= 97 && c <= 122) return String.fromCodePoint(BOLD_LOWER + (c - 97));
    if (c >= 48 && c <= 57) return String.fromCodePoint(BOLD_DIGIT + (c - 48));
    return ch;
  });
}

/** Bolds only the opening line of a LinkedIn caption — the part that shows
 *  above "see more" — and leaves the body as plain, readable text. */
export function styleForLinkedIn(caption: string): string {
  const text = String(caption || '');
  const breakAt = text.indexOf('\n');
  if (breakAt <= 0) return text;
  return toUnicodeBold(text.slice(0, breakAt)) + text.slice(breakAt);
}

/* ═══════════════════════════════════════════════════ best practice ══ */

export interface BestPractice {
  /** How many published posts this was computed from. Zero is reported
   *  honestly rather than hidden — advice from no evidence is not advice. */
  sampleSize: number;
  /** Median caption length per platform among posts that went out. */
  captionLength: Partial<Record<string, number>>;
  /** Hashtags that have actually been used, most used first. */
  hashtags: { tag: string; uses: number }[];
  /** Stations that appear most in shared posts. */
  topStations: { station: string; uses: number }[];
  notes: string[];
}

const HASHTAG = /#[\p{L}\p{N}_]+/gu;

/**
 * What the archive's own published posts suggest, computed from records
 * that carry a confirmed social post.
 *
 * This is the honest version of "best practice based on past published
 * ones": it reports the shape of what has gone out — how long captions
 * usually run, which hashtags recur — and nothing about how those posts
 * performed, because engagement figures are not in this data. Length and
 * hashtag conventions are worth matching for consistency of voice; claiming
 * they are worth matching for reach would be inventing a finding.
 */
export function historicalBestPractice(records: RepositoryRecord[]): BestPractice {
  const posts = records.flatMap((r) =>
    (r.socialPosts ?? []).map((p) => ({ post: p, record: r })),
  );

  const lengths: Record<string, number[]> = {};
  const tags = new Map<string, number>();
  const stations = new Map<string, number>();

  for (const { post, record } of posts) {
    const caption = String(post.caption || '');
    if (caption) {
      (lengths[post.platform] ??= []).push(caption.length);
      for (const tag of caption.match(HASHTAG) ?? []) {
        const key = tag.toLowerCase();
        tags.set(key, (tags.get(key) ?? 0) + 1);
      }
    }
    const station = record.metadata?.station;
    if (station) stations.set(station, (stations.get(station) ?? 0) + 1);
  }

  const median = (xs: number[]) => {
    if (!xs.length) return undefined;
    const sorted = [...xs].sort((a, b) => a - b);
    return Math.round(sorted[Math.floor(sorted.length / 2)]);
  };

  const captionLength: Partial<Record<string, number>> = {};
  for (const [platform, xs] of Object.entries(lengths)) {
    const m = median(xs);
    if (m !== undefined) captionLength[platform] = m;
  }

  const notes: string[] = [];
  if (posts.length === 0) {
    notes.push('No post has been confirmed sent yet, so there is no house style to match — this will be the first.');
  } else {
    notes.push(`Computed from ${posts.length} post${posts.length === 1 ? '' : 's'} already sent.`);
    for (const [platform, len] of Object.entries(captionLength)) {
      notes.push(`${platform} captions have run about ${len} characters.`);
    }
  }

  return {
    sampleSize: posts.length,
    captionLength,
    hashtags: [...tags.entries()]
      .map(([tag, uses]) => ({ tag, uses }))
      .sort((a, b) => b.uses - a.uses)
      .slice(0, 8),
    topStations: [...stations.entries()]
      .map(([station, uses]) => ({ station, uses }))
      .sort((a, b) => b.uses - a.uses)
      .slice(0, 3),
    notes,
  };
}

/* ══════════════════════════════════════════════ visual reference plan ══ */

/**
 * The queries the agent will actually run against the image providers.
 *
 * Built from the analysis rather than from the raw brief: "Antarctic
 * research station photography" finds usable references, while pasting a
 * publisher's field note into an image search finds nothing. Two or three
 * queries, because each one is a round trip the publisher waits through.
 */
export function referenceQueries(
  classification: Classification,
  station: string | undefined,
  topic: string,
): string[] {
  const place = station && station !== 'Other' ? station : 'Antarctica';
  const queries: string[] = [];

  switch (classification.type.id) {
    case 'dataset-drop':
      queries.push(`${place} Antarctica research data chart`, 'scientific data visualisation ice');
      break;
    case 'expedition-report':
      queries.push(`${place} Antarctic expedition ship`, 'Antarctic research station exterior');
      break;
    case 'institutional':
      queries.push('polar research institute building', `${place} Antarctic station India`);
      break;
    case 'observance':
      queries.push(`${place} Antarctica landscape`, 'Antarctic ice landscape wide');
      break;
    case 'explainer':
      queries.push('Antarctic ozone atmosphere diagram', `${place} atmospheric research`);
      break;
    default:
      queries.push(`${place} Antarctic research station`, 'Antarctic field science equipment');
  }

  /* One query from the publisher's own words, when they gave anything
   * concrete enough to search on — the agent's guesses are generic by
   * design and this is what makes the strip specific to this post. */
  const distinctive = String(topic || '')
    .split(/[^A-Za-z]+/)
    .filter((w) => w.length >= 5 && !COMMON.has(w.toLowerCase()))
    .slice(0, 3)
    .join(' ');
  if (distinctive) queries.push(`${distinctive} Antarctica`);

  return queries.slice(0, 3);
}

/* ═══════════════════════════════════════════════════════ the analysis ══ */

export interface BriefAnalysis {
  classification: Classification;
  archive: ArchiveMatch | null;
  audience: Audience;
  tone: Tone;
  /** True when the publisher chose rather than the agent inferring. */
  audienceChosen: boolean;
  toneChosen: boolean;
  platforms: PlatformId[];
  requirements: PlatformRequirement[];
  gaps: string[];
  bestPractice: BestPractice;
  queries: string[];
}

/**
 * Everything the agent works out from the brief, in one pass.
 *
 * Pure and synchronous: the steps the publisher watches are a presentation
 * of this result, not the thing computing it. That separation is what lets
 * the analysis be unit-tested and lets the UI replay it without recomputing.
 */
export function analyseBrief(input: {
  brief: Brief;
  platforms: PlatformId[];
  hasImage: boolean;
  station?: string;
  archiveRecords: RepositoryRecord[];
  /** Set when the publisher explicitly picked, so the agent does not
   *  overwrite a deliberate choice with an inference. */
  audienceChosen?: boolean;
  toneChosen?: boolean;
}): BriefAnalysis {
  const { brief, platforms, hasImage, station, archiveRecords } = input;

  const archive = brief.source
    ? null
    : detectArchiveReference(brief.topic, archiveRecords);

  const record = archive?.record
    ?? archiveRecords.find((r) => (r.metadata?.identifier ?? r.id) === brief.source?.identifier)
    ?? null;

  const classification = classifyContentType(brief.topic, record);

  const audienceChosen = !!input.audienceChosen;
  const toneChosen = !!input.toneChosen;

  return {
    classification,
    archive,
    audience: audienceChosen ? brief.audience : classification.type.suggests.audience,
    tone: toneChosen ? brief.tone : classification.type.suggests.tone,
    audienceChosen,
    toneChosen,
    platforms,
    requirements: platforms.map((p) => PLATFORM_REQUIREMENTS[p]).filter(Boolean),
    gaps: platformGaps(platforms, hasImage),
    bestPractice: historicalBestPractice(archiveRecords),
    queries: referenceQueries(classification, station, brief.topic),
  };
}

/**
 * The extra direction handed to the copy generator, assembled from the
 * analysis. This is the payload that makes the visible reasoning matter:
 * what the publisher watched the agent decide is literally what the model
 * is then told.
 */
export function generatorDirection(analysis: BriefAnalysis): string {
  const lines: string[] = [
    `CONTENT TYPE: ${analysis.classification.type.label}. ${analysis.classification.type.direction}`,
  ];

  const platformNotes = analysis.requirements.map((r) => `- ${r.label}: ${r.demands} Hashtags: ${r.hashtags.note}.`);
  if (platformNotes.length) lines.push('PLATFORM CONSTRAINTS:', ...platformNotes);

  if (analysis.bestPractice.sampleSize > 0) {
    const lengths = Object.entries(analysis.bestPractice.captionLength)
      .map(([p, l]) => `${p} ~${l} characters`)
      .join(', ');
    if (lengths) lines.push(`HOUSE STYLE: previous posts have run ${lengths}. Match that length.`);
    const tags = analysis.bestPractice.hashtags.slice(0, 4).map((h) => h.tag).join(' ');
    if (tags) lines.push(`HASHTAGS ALREADY IN USE: ${tags}. Prefer these for consistency.`);
  }

  if (analysis.archive) {
    lines.push(
      `SOURCE RECORD: this post is about the published record “${analysis.archive.record.title}”. Its facts are in the brief above; do not contradict them.`,
    );
  }

  return lines.join('\n');
}
