/**
 * The Basic step — the questions asked before anything is generated, and
 * what the agent does with the answers.
 *
 * Each question settles something the agent would otherwise have to guess.
 * Guessing is what produced mid-run questions and first drafts aimed at the
 * wrong reader; asking once, up front, in a few taps, is cheaper for the
 * publisher and gives the writer firm ground. Every answer is optional:
 * unset means "let the agent decide", and the agent says that it decided.
 *
 * Chosen for PS 26063 specifically — polar-science outreach by a government
 * body, feeding people back to a citable knowledge repository:
 *
 *   What it is about
 *     purpose        what the post is for — decides content type and angles
 *     knowledge base whether it is about, or cites, a published record —
 *                    the portal exists to lead people back to the archive
 *     data status    a government account must not present preliminary
 *                    readings as settled findings
 *   What the post should have
 *     images         uploaded (checked for resolution) or found by the agent
 *                    under an open licence, credited
 *     reference posts posts whose shape and voice to follow
 *     links          addresses to carry in every caption — added by the
 *                    portal after writing, never typed by the model
 *     credit         who is named — institutional, the observer, or nobody
 *   Who it is meant for
 *     audience, tone, language, platforms
 *
 * The call to action is no longer asked: a post linked to a record asks
 * readers to read it, which is the only one that mattered. The occasion is
 * left to the agent, which asks during the run when one fits.
 *
 * Pure: everything here takes plain inputs, so each decision is testable.
 */

import type { UpcomingObservance } from './insight';

export type Goal = 'inform' | 'announce' | 'explain' | 'celebrate' | 'invite';
export type Cta = 'record' | 'dataset' | 'site' | 'follow' | 'none';
export type DataStatus = 'verified' | 'preliminary';
export type Credit = 'institution' | 'observer' | 'anonymous';
export type Language = 'en' | 'hi' | 'bilingual';
export type KbRelation = 'none' | 'about' | 'cites';
export type ImageSource = 'upload' | 'agent';

/** A post whose shape and voice this one should follow. */
export interface ReferencePost {
  kind: 'past' | 'link';
  /** Short label for the list: "X · 12 Aug" or the link's host. */
  label: string;
  platform?: string;
  url?: string;
  /** The reference's own text, when known — a past post's caption, or text
   *  the publisher pasted. Without it the writer cannot follow a link. */
  text?: string;
}

export const KB_RELATIONS: { id: KbRelation; label: string; hint: string }[] = [
  { id: 'none', label: 'No — it’s new', hint: 'Nothing published yet; write from the field report alone' },
  { id: 'about', label: 'It’s about a record', hint: 'The post is about something already in the archive' },
  { id: 'cites', label: 'It cites a record', hint: 'The post has its own story and cites a record as the source' },
];

export const IMAGE_SOURCES: { id: ImageSource; label: string; hint: string }[] = [
  { id: 'upload', label: 'I’ll upload', hint: 'Use station photographs' },
  { id: 'agent', label: 'Let the agent find one', hint: 'An openly licensed photograph, credited in the caption' },
];

export const GOALS: { id: Goal; label: string; hint: string }[] = [
  { id: 'inform', label: 'Share a finding', hint: 'A result, a reading, something observed' },
  { id: 'announce', label: 'Announce', hint: 'New data, an expedition, a milestone' },
  { id: 'explain', label: 'Explain the science', hint: 'Teach why something happens' },
  { id: 'celebrate', label: 'Celebrate / mark a day', hint: 'People, anniversaries, observances' },
  { id: 'invite', label: 'Invite action', hint: 'Visit, apply, attend, explore' },
];

export const CTAS: { id: Cta; label: string }[] = [
  { id: 'record', label: 'Read the full record' },
  { id: 'dataset', label: 'Explore the data' },
  { id: 'site', label: 'Visit the outreach site' },
  { id: 'follow', label: 'Follow for updates' },
  { id: 'none', label: 'Nothing — just inform' },
];

export const DATA_STATUSES: { id: DataStatus; label: string; hint: string }[] = [
  { id: 'verified', label: 'Verified / published', hint: 'Checked data, safe to state plainly' },
  { id: 'preliminary', label: 'Preliminary', hint: 'Field readings — labelled as such, no firm conclusions' },
];

export const CREDITS: { id: Credit; label: string }[] = [
  { id: 'institution', label: 'NCPOR & the station' },
  { id: 'observer', label: 'Also name the observer' },
  { id: 'anonymous', label: 'No individual names' },
];

export const LANGUAGES: { id: Language; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'hi', label: 'हिन्दी Hindi' },
  { id: 'bilingual', label: 'English + हिन्दी' },
];

export interface BasicAnswers {
  goal?: Goal | null;
  cta?: Cta | null;
  /** An observance name, 'none', or null for "let the agent suggest". */
  hook?: string | null;
  dataStatus?: DataStatus | null;
  credit?: Credit | null;
  language?: Language | null;
  /** Addresses to add to every caption, one per box on the form. */
  links?: string[];
  kb?: KbRelation | null;
  imageSource?: ImageSource | null;
  references?: ReferencePost[];
}

/* ═════════════════════════════════════════════════════════ content type ══ */

/** Which content types a purpose allows, most typical first. */
const GOAL_TYPES: Record<Goal, string[]> = {
  inform: ['field-report', 'dataset-drop', 'follow-up', 'expedition-report'],
  announce: ['dataset-drop', 'institutional', 'expedition-report', 'observance'],
  explain: ['explainer'],
  celebrate: ['observance', 'expedition-report', 'institutional'],
  invite: ['institutional', 'observance'],
};

/** The content type for a stated purpose: the best-ranked inferred type the
 *  purpose allows, else the purpose's typical type. The publisher's purpose
 *  wins over keyword inference, which is only ever a guess. */
export function contentTypeForGoal(goal: Goal, ranked: { type: string; score: number }[]): string {
  const allowed = GOAL_TYPES[goal];
  return ranked.find((r) => allowed.includes(r.type))?.type ?? allowed[0];
}

/** The three editorial angles, per purpose — the writer gives one variant
 *  each. "Measured / place / why" suits a finding; it does not suit an
 *  invitation or an explainer. */
export const ANGLES: Record<Goal, [string, string, string]> = {
  inform: ['Lead with what was measured — the finding itself.', 'Lead with the place — Antarctica, the station, the conditions.', 'Lead with why it matters to people who are not scientists.'],
  announce: ['Lead with what is new — the thing being announced.', 'Lead with when and where — the people and the place behind it.', 'Lead with what it opens up — who can use it and how.'],
  explain: ['Lead with the question a curious reader would ask.', 'Lead with how it works — the mechanism, simply.', 'Lead with what this data shows about it.'],
  celebrate: ['Lead with the people who did the work.', 'Lead with the milestone or the day being marked.', 'Lead with what it built toward — the legacy.'],
  invite: ['Lead with the opportunity itself.', 'Lead with what the reader gets out of it.', 'Lead with how to take part — the first step.'],
};

/* ═══════════════════════════════════════════════════════ audience, tone ══ */

type Aud = 'public' | 'students' | 'researchers' | 'press';
type Tn = 'plain' | 'warm' | 'formal' | 'punchy';

/**
 * Audience and tone, weighed from every signal rather than from the content
 * type alone: the type's own default, the purpose, where it is going
 * (LinkedIn skews professional, X skews short), and who actually follows
 * the accounts. Each signal that moved the answer is reported.
 */
export function inferVoice(input: {
  typeDefault: { audience: Aud; tone: Tn };
  goal?: Goal | null;
  platforms: string[];
  followerAge?: string | null;
}): { audience: Aud; tone: Tn; reasons: string[] } {
  const aud: Record<Aud, number> = { public: 0, students: 0, researchers: 0, press: 0 };
  const tone: Record<Tn, number> = { plain: 0, warm: 0, formal: 0, punchy: 0 };
  const reasons: string[] = [];

  // A starting point, not a verdict: the type is itself only inferred, so a
  // purpose the publisher stated outweighs it.
  aud[input.typeDefault.audience] += 2;
  tone[input.typeDefault.tone] += 2;
  reasons.push(`The content type suggests ${input.typeDefault.audience}, ${input.typeDefault.tone}.`);

  const g = input.goal;
  if (g === 'explain') { aud.students += 2; tone.warm += 2; reasons.push('Explaining the science: students and the curious public.'); }
  if (g === 'announce') { aud.press += 1; aud.public += 1; tone.formal += 2; reasons.push('An announcement reads best in the institutional voice.'); }
  if (g === 'celebrate') { aud.public += 2; tone.warm += 2; reasons.push('Marking a day or people calls for warmth.'); }
  if (g === 'invite') { aud.public += 1; aud.students += 1; tone.punchy += 1; tone.warm += 1; reasons.push('An invitation needs energy without hype.'); }
  if (g === 'inform') tone.plain += 1;

  const only = (p: string) => input.platforms.length === 1 && input.platforms[0] === p;
  if (only('linkedin')) { aud.researchers += 1; aud.press += 1; tone.formal += 1; reasons.push('LinkedIn only: a professional readership.'); }
  if (only('x')) { tone.punchy += 1; reasons.push('X only: short lines carry further.'); }
  if (input.platforms.includes('instagram') || input.platforms.includes('story')) aud.public += 1;

  const age = input.followerAge ?? '';
  if (/^(13|18)-/.test(age)) { aud.students += 2; tone.warm += 1; reasons.push(`The accounts' followers are mostly ${age}: write for students.`); }

  const top = <K extends string>(m: Record<K, number>) => (Object.keys(m) as K[]).reduce((a, b) => (m[b] > m[a] ? b : a));
  return { audience: top(aud), tone: top(tone), reasons };
}

/* ═══════════════════════════════════════════════════════════ hashtags ══ */

const CONCEPT_TAGS: Record<string, string> = {
  'Ozone layer': '#OzoneLayer', 'Antarctic sea ice': '#SeaIce', Aurora: '#Aurora', 'Antarctic krill': '#Krill',
  Penguin: '#Penguins', 'Antarctic ice sheet': '#IceSheet', 'Katabatic wind': '#PolarWeather',
  'Climate of Antarctica': '#ClimateScience', Permafrost: '#Permafrost', 'Southern Ocean': '#SouthernOcean',
  Arctic: '#Arctic', Ultraviolet: '#UVIndex',
};

export const OBSERVANCE_TAGS: Record<string, string> = {
  'International Day for the Preservation of the Ozone Layer': '#WorldOzoneDay',
  'Antarctica Day (Antarctic Treaty, 1959)': '#AntarcticaDay',
  'World Oceans Day': '#WorldOceansDay', 'World Environment Day': '#WorldEnvironmentDay',
  'Earth Day': '#EarthDay', 'National Science Day': '#NationalScienceDay',
  'World Meteorological Day': '#WorldMetDay', 'World Penguin Day': '#WorldPenguinDay',
  'World Wildlife Day': '#WorldWildlifeDay', 'International Polar Bear Day': '#PolarBearDay',
};

/** How many tags each platform rewards — enough to be found, not so many it
 *  reads as spam. A government account errs low. */
const TAG_BUDGET: Record<string, number> = { instagram: 8, story: 3, x: 2, linkedin: 3 };

/**
 * A hashtag plan per platform, most specific first: the occasion, the
 * subject, the station, tags that performed on past posts, the activity,
 * then the programme's own. Chosen here, deterministically, so the writer
 * is handed a list rather than left to invent tags nobody searches.
 */
export function hashtagPlan(input: {
  platforms: string[];
  station?: string;
  activity?: string;
  terms: string[];
  hook?: string | null;
  winning?: string[];
  stationTags: Record<string, string[]>;
  activityTags: Record<string, string[]>;
}): Record<string, string[]> {
  const pool: string[] = [];
  const add = (t?: string) => { if (t && !pool.some((x) => x.toLowerCase() === t.toLowerCase())) pool.push(t); };
  if (input.hook) add(OBSERVANCE_TAGS[input.hook]);
  for (const t of input.terms) add(CONCEPT_TAGS[t]);
  for (const t of input.stationTags[input.station ?? ''] ?? input.stationTags.Other ?? []) add(t);
  for (const t of input.winning ?? []) add(t);
  for (const t of input.activityTags[input.activity ?? ''] ?? []) add(t);
  add('#NCPOR');
  add('#PolarScience');
  const plan: Record<string, string[]> = {};
  for (const p of input.platforms) plan[p] = pool.slice(0, TAG_BUDGET[p] ?? 3);
  return plan;
}

/* ═════════════════════════════════════════════════════════ posting slot ══ */

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY = 86_400_000;

/**
 * When to post: on the observance itself if the post is tied to one, else
 * the account's best weekday from its own reach history, at 10:00 IST —
 * mid-morning in India, where these accounts' audience is.
 */
export function recommendSlot(input: {
  now: number;
  hook?: UpcomingObservance | null;
  bestDay?: string | null;
}): { at: number; label: string; reason: string } {
  const at10IST = (dayStartUtc: number) => dayStartUtc + (4 * 60 + 30) * 60_000; // 10:00 IST = 04:30 UTC
  const today = new Date(input.now);
  const startToday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const fmt = (t: number) => new Date(t).toLocaleString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
  });

  if (input.hook && input.hook.daysAway >= 0) {
    const at = at10IST(input.hook.date);
    return { at, label: fmt(at), reason: `On ${input.hook.name} itself.` };
  }
  if (input.bestDay) {
    const target = WEEKDAYS.indexOf(input.bestDay);
    for (let i = 1; i <= 7; i++) {
      const d = startToday + i * DAY;
      if (new Date(d).getUTCDay() === target) {
        const at = at10IST(d);
        return { at, label: fmt(at), reason: `${input.bestDay} is when the account reaches the most people.` };
      }
    }
  }
  const at = at10IST(startToday + DAY);
  return { at, label: fmt(at), reason: 'No reach history to go on — the next morning.' };
}

/* ═════════════════════════════════════════════════════════════ links ══ */

export const MAX_LINKS = 5;

/** "ncpor.res.in/ozone" → "https://ncpor.res.in/ozone": nobody should be
 *  told off for leaving out the scheme. */
export function normaliseLink(s: string): string {
  const t = s.trim();
  return !t || /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`;
}

/** The links worth keeping: web addresses only, normalised, each once.
 *  Empty boxes and anything that is not an address are dropped. */
export function cleanLinks(links: string[] | undefined): string[] {
  const out: string[] = [];
  for (const raw of links ?? []) {
    const l = normaliseLink(raw);
    if (!isLink(l) || out.includes(l)) continue;
    out.push(l);
  }
  return out.slice(0, MAX_LINKS);
}

export function isLink(s: string): boolean {
  try {
    const u = new URL(normaliseLink(s));
    return (u.protocol === 'https:' || u.protocol === 'http:') && /\.[a-z]{2,}$/i.test(u.hostname) && !/\s/.test(s.trim());
  } catch {
    return false;
  }
}

/* ════════════════════════════════════════════════════════════ images ══ */

/** Instagram's feed width; anything whose short side is below it is
 *  upscaled by the platform and looks soft. */
export const MIN_SIDE = 1080;
/** Below this, the image looks poor on every platform. */
export const POOR_SIDE = 600;

export type Resolution = 'ok' | 'low' | 'poor';

export function resolutionOf(w: number, h: number): Resolution {
  const side = Math.min(w, h);
  return side >= MIN_SIDE ? 'ok' : side >= POOR_SIDE ? 'low' : 'poor';
}

export function resolutionNote(w: number, h: number): string | null {
  const r = resolutionOf(w, h);
  if (r === 'ok') return null;
  return r === 'low'
    ? `${w}×${h} — below the ${MIN_SIDE} px Instagram needs; it will look soft there. Fine for X and LinkedIn.`
    : `${w}×${h} — too small; it will look blurry on every platform. Use a larger photograph if there is one.`;
}

/** Licences an official account can use on a post with text laid over it:
 *  public domain and CC0 freely; CC BY and BY-SA with credit. Never NC
 *  (a government account is not "non-commercial" by any safe reading), ND
 *  (the overlay is a derivative), or anything unknown. */
export function usableLicence(license: string): 'free' | 'credit' | null {
  const l = license.toUpperCase();
  if (/\bNC\b|\bND\b|UNKNOWN|SEE COMMONS|ALL RIGHTS/.test(l)) return null;
  if (/CC0|PDM|PUBLIC DOMAIN/.test(l)) return 'free';
  if (/\bBY\b/.test(l)) return 'credit';
  return null;
}

interface Candidate { title: string; license: string; attribution: string; width: number | null; height: number | null; provider: string }

/**
 * The photograph the agent would use, from the image search: on the post's
 * subject first (its title names the subject or the polar setting — an
 * image search for "ozone Maitri" also returns telescope pictures), then an
 * open licence, then size — at least 1080 px on the short side if any
 * candidate has it, 600 px at worst, never one of unknown size.
 */
export function pickPhoto<T extends Candidate>(results: T[], relevant?: string[]): { photo: T; why: string } | null {
  const words = (relevant ?? []).map((w) => w.toLowerCase().replace(/s$/, '')).filter((w) => w.length >= 3);
  const onSubject = words.length ? results.filter((r) => words.some((w) => r.title.toLowerCase().includes(w))) : results;
  const usable = onSubject.filter((r) => usableLicence(r.license));
  const sized = usable.filter((r) => r.width && r.height) as (T & { width: number; height: number })[];
  const side = (r: { width: number; height: number }) => Math.min(r.width, r.height);
  const good = sized.filter((r) => side(r) >= MIN_SIDE).sort((a, b) => side(b) - side(a));
  const fair = sized.filter((r) => side(r) >= POOR_SIDE).sort((a, b) => side(b) - side(a));
  const photo = good[0] ?? fair[0];
  if (!photo) return null;
  const lic = usableLicence(photo.license) === 'free' ? 'public domain — no credit needed, credited anyway' : `${photo.license} — must be credited`;
  return {
    photo,
    why: `${onSubject.length} of ${results.length} results are on the subject, ${usable.length} of those under a licence an official account can use; this one is ${photo.width}×${photo.height} (${lic}).`,
  };
}

/** The credit line a borrowed photograph needs. */
export function photoCredit(p: { attribution: string; license: string; provider: string }): string {
  const via = { wikimedia: 'Wikimedia Commons', nasa: 'NASA', openverse: 'Openverse' }[p.provider] ?? p.provider;
  const who = p.attribution?.trim() || via;
  return `Photo: ${who} (${p.license}${who === via ? '' : `, via ${via}`})`;
}

/* ═══════════════════════════════════════════════════ writer instructions ══ */

/** The Basic answers, as instructions to the writer. */
export function basicsDirection(
  b: BasicAnswers,
  ctx: {
    observerName?: string; station?: string; hashtags?: Record<string, string[]>;
    source?: { title: string; identifier: string } | null;
    photoCredit?: string | null;
  },
): string {
  const lines: string[] = [];
  if (b.goal) lines.push(`PURPOSE: ${GOALS.find((g) => g.id === b.goal)?.label} — every variant must serve this.`);
  if (ctx.source && b.kb === 'cites') {
    lines.push(`CITED RECORD: the post has its own story and cites “${ctx.source.title}” (${ctx.source.identifier}) as its source. Use the record's facts only to support that story; name it once as the source. Do not make it the subject.`);
  } else if (ctx.source) {
    lines.push(`SOURCE RECORD: this post is about the published record “${ctx.source.title}” (${ctx.source.identifier}). Its facts are in the brief above; do not contradict them.`);
  }
  const refs = (b.references ?? []).filter((r) => r.text?.trim());
  if (refs.length) {
    lines.push(
      'STYLE REFERENCES chosen by the publisher — follow their structure, length and voice. Take NO facts, names, numbers or hashtags from them:',
      ...refs.map((r, i) => `${i + 1}. (${r.platform ?? 'post'}) “${r.text!.trim().slice(0, 600)}”`),
    );
  }
  if (ctx.photoCredit) {
    lines.push(`PHOTO CREDIT: the photograph is not NCPOR's. End every caption with this line, exactly: ${ctx.photoCredit}`);
  }
  const links = cleanLinks(b.links);
  if (links.length) {
    lines.push(`LINKS: the portal adds ${links.length === 1 ? 'a link' : `${links.length} links`} to the end of every caption after you write it. Write no URL yourself, and leave room — keep the X caption under ${280 - 24 * links.length} characters.`);
  }
  if (b.cta && b.cta !== 'none') {
    const cta = {
      record: 'read the full record',
      dataset: 'explore the open data behind this',
      site: 'visit the outreach site',
      follow: 'follow the account for more from the stations',
    }[b.cta];
    lines.push(`CALL TO ACTION: end each caption with one short line asking readers to ${cta}. Do not write a URL — the real link is added afterwards.`);
  }
  if (b.dataStatus === 'preliminary') {
    lines.push('DATA STATUS: these are PRELIMINARY field readings. Say so plainly in every caption; draw no firm conclusion; never use words like "confirms" or "proves".');
  }
  if (b.dataStatus === 'verified') lines.push('DATA STATUS: verified data — state the facts plainly, still without overclaiming.');
  if (b.credit === 'observer' && ctx.observerName) lines.push(`CREDIT: name the observer, ${ctx.observerName}, and the ${ctx.station ?? 'station'} team.`);
  if (b.credit === 'institution') lines.push(`CREDIT: credit NCPOR${ctx.station ? ` and ${ctx.station} station` : ''}; name no individual.`);
  if (b.credit === 'anonymous') lines.push('CREDIT: name no individual anywhere.');
  if (ctx.hashtags) {
    const tags = Object.entries(ctx.hashtags).filter(([, t]) => t.length).map(([p, t]) => `${p}: ${t.join(' ')}`);
    if (tags.length) {
      lines.push(`HASHTAGS — use exactly these, placed as each platform expects (Instagram after the text, X at most two, LinkedIn at the end): ${tags.join('; ')}.`);
    }
  }
  return lines.join('\n');
}
