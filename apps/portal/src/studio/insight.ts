/**
 * What the agent learns beyond the brief — reach, past performance, trends
 * and sources — reduced to findings it can show and a direction it can hand
 * to the writer.
 *
 * Pure: every function here takes data already fetched (research.ts does
 * the fetching) and returns a summary, so each conclusion the publisher
 * watches the agent reach can be tested against fixed inputs.
 *
 * One rule runs through all of it: a finding says what its evidence is and
 * how much of it there was. "Sunday is the best day to post" from four
 * Sundays of data is stated as exactly that, and a platform with no data
 * says so instead of borrowing another platform's numbers.
 */

import type { RepositoryRecord } from '../repository/contract';
import type { ScheduledPost } from '../social/queue';
import type { AccountStats } from '../social/engagementClient';

const DAY = 86_400_000;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/* ═══════════════════════════════════════════════════════ research terms ══ */

/** Polar subjects the portal writes about, and the name each is known by on
 *  Wikipedia and in the news. Matched against the brief, not guessed at. */
const CONCEPTS: [RegExp, string][] = [
  [/\bozone\b/i, 'Ozone layer'],
  [/sea[- ]?ice/i, 'Antarctic sea ice'],
  [/\baurora/i, 'Aurora'],
  [/\bkrill\b/i, 'Antarctic krill'],
  [/\bpenguin/i, 'Penguin'],
  [/ice[- ]?(sheet|shelf|core)|\bglacie|glaciolog|\bstakes?\b|mass balance/i, 'Antarctic ice sheet'],
  [/\bblizzard|katabatic|wind ?speed/i, 'Katabatic wind'],
  [/temperature|meteorolog|weather|climate/i, 'Climate of Antarctica'],
  [/\bpermafrost/i, 'Permafrost'],
  [/southern ocean|ocean(ograph)?ic|\bship\b|voyage/i, 'Southern Ocean'],
  [/\barctic\b|svalbard|himadri/i, 'Arctic'],
  [/uv\b|ultraviolet/i, 'Ultraviolet'],
];

const STATIONS: [RegExp, string][] = [
  [/\bmaitri\b/i, 'Maitri station'],
  [/\bbharati\b/i, 'Bharati station'],
  [/dakshin gangotri/i, 'Dakshin Gangotri'],
  [/\bhimadri\b/i, 'Himadri station'],
  [/schirmacher/i, 'Schirmacher Oasis'],
  [/larsemann/i, 'Larsemann Hills'],
];

/**
 * The subjects to research, most specific first: the science the brief is
 * about, then the station, then Antarctica as a baseline to compare against.
 */
export function researchTerms(topic: string, station?: string, record?: RepositoryRecord | null, activity?: string): string[] {
  const text = [topic, activity, record?.title, ...(record?.pills ?? [])].filter(Boolean).join(' ');
  const terms: string[] = [];
  for (const [re, term] of CONCEPTS) if (re.test(text) && !terms.includes(term)) terms.push(term);
  const stationText = `${text} ${station ?? ''}`;
  for (const [re, term] of STATIONS) if (re.test(stationText) && !terms.includes(term)) terms.push(term);
  if (!terms.some((t) => /antarctic/i.test(t))) terms.push('Antarctica');
  return terms.slice(0, 4);
}

/* ═════════════════════════════════════════════════════════ observances ══ */

export interface Observance {
  date: string; // MM-DD
  name: string;
  /** Words in a brief that make this day relevant to it. */
  matches: RegExp;
  /** Relevant to any polar post, whatever the subject. */
  polar?: boolean;
}

/** Dated observances an Indian polar programme can credibly post for. Fixed
 *  dates only — a movable day would need a rule, and a wrong date on a
 *  government account is worse than a missed one. */
export const OBSERVANCES: Observance[] = [
  { date: '01-09', name: 'Anniversary of India’s first landing in Antarctica (1982)', matches: /india|expedition|station|antarctic/i, polar: true },
  { date: '02-27', name: 'International Polar Bear Day', matches: /arctic|himadri|polar bear/i },
  { date: '02-28', name: 'National Science Day', matches: /science|research|data|scientist/i },
  { date: '03-03', name: 'World Wildlife Day', matches: /wildlife|penguin|seal|krill|species|bird/i },
  { date: '03-23', name: 'World Meteorological Day', matches: /weather|meteorolog|temperature|wind|blizzard|climate|pressure/i },
  { date: '04-22', name: 'Earth Day', matches: /climate|environment|earth|warming/i },
  { date: '04-25', name: 'World Penguin Day', matches: /penguin/i },
  { date: '06-05', name: 'World Environment Day', matches: /environment|climate|pollution|conservation/i },
  { date: '06-08', name: 'World Oceans Day', matches: /ocean|sea|krill|marine|ship|voyage/i },
  { date: '06-21', name: 'Midwinter Day in Antarctica', matches: /winter|station|crew|team|expedition/i, polar: true },
  { date: '09-16', name: 'International Day for the Preservation of the Ozone Layer', matches: /ozone|uv|ultraviolet|atmospher/i },
  { date: '12-01', name: 'Antarctica Day (Antarctic Treaty, 1959)', matches: /antarctic|treaty|station/i, polar: true },
];

export interface UpcomingObservance { name: string; date: number; daysAway: number; relevant: boolean }

/** Observances in the next `window` days, relevant ones first. */
export function upcomingObservances(text: string, now: number, window = 45): UpcomingObservance[] {
  const today = new Date(now);
  const startOfToday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return OBSERVANCES
    .map((o) => {
      const [m, d] = o.date.split('-').map(Number);
      let when = Date.UTC(today.getUTCFullYear(), m - 1, d);
      if (when < startOfToday) when = Date.UTC(today.getUTCFullYear() + 1, m - 1, d);
      return { name: o.name, date: when, daysAway: Math.round((when - startOfToday) / DAY), relevant: o.matches.test(text), polar: !!o.polar };
    })
    .filter((o) => o.daysAway <= window && (o.relevant || o.polar))
    .sort((a, b) => Number(b.relevant) - Number(a.relevant) || a.daysAway - b.daysAway)
    .map(({ name, date, daysAway, relevant }) => ({ name, date, daysAway, relevant }));
}

/* ═══════════════════════════════════════════════════════════════ reach ══ */

export interface PlatformReach {
  platform: string;
  handle: string | null;
  followers: number | null;
  metricLabel: string;
  dailyAvg: number | null;
  /** Best day of the week by average daily reach, with how far above the
   *  account's own average it runs. Null when there is too little data or
   *  no reach at all to compare. */
  bestDay: { day: string; liftPct: number; samples: number } | null;
}

export interface ReachSummary {
  platforms: PlatformReach[];
  totalFollowers: number;
  audience: { topAge: { band: string; share: number } | null; topCountry: { code: string; share: number } | null; topCity: string | null } | null;
  notes: string[];
}

export function summariseReach(accounts: AccountStats[], selected: string[], now: number): ReachSummary {
  const today = new Date(now).toISOString().slice(0, 10);
  const platforms: PlatformReach[] = [];
  const notes: string[] = [];

  for (const a of accounts) {
    if (!selected.includes(a.platform) || !a.available) continue;
    const series = (a.series ?? []).filter((p) => p.date < today);
    const total = series.reduce((s, p) => s + p.value, 0);
    const dailyAvg = series.length ? total / series.length : null;

    let bestDay: PlatformReach['bestDay'] = null;
    if (total > 0 && series.length >= 14) {
      const byDay: number[][] = Array.from({ length: 7 }, () => []);
      for (const p of series) byDay[new Date(`${p.date}T00:00:00Z`).getUTCDay()].push(p.value);
      const avgs = byDay.map((xs) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : -1));
      const best = avgs.indexOf(Math.max(...avgs));
      if (dailyAvg && avgs[best] > 0) {
        bestDay = { day: WEEKDAYS[best], liftPct: Math.round((avgs[best] / dailyAvg - 1) * 100), samples: byDay[best].length };
      }
    }

    platforms.push({
      platform: a.platform,
      handle: a.handle,
      followers: a.followers ?? null,
      metricLabel: a.primaryLabel ?? 'Reach',
      dailyAvg: dailyAvg === null ? null : Math.round(dailyAvg),
      bestDay,
    });
  }

  const ig = accounts.find((a) => a.platform === 'instagram' && a.available && a.demographics);
  let audience: ReachSummary['audience'] = null;
  if (ig?.demographics) {
    const ages = ig.demographics.age ?? [];
    const ageTotal = ages.reduce((s, r) => s + r.value, 0);
    const topAge = ages.length && ageTotal ? ages.reduce((b, r) => (r.value > b.value ? r : b)) : null;
    const countries = ig.demographics.country ?? [];
    const cTotal = countries.reduce((s, r) => s + r.value, 0);
    audience = {
      topAge: topAge ? { band: topAge.label, share: Math.round((topAge.value / ageTotal) * 100) } : null,
      topCountry: countries[0] && cTotal ? { code: countries[0].label, share: Math.round((countries[0].value / cTotal) * 100) } : null,
      topCity: ig.demographics.city?.[0]?.label.split(',')[0] ?? null,
    };
  }

  const missing = selected.filter((p) => !platforms.some((x) => x.platform === p));
  if (missing.length) notes.push(`No analytics for ${missing.join(', ')} — nothing is inferred for ${missing.length === 1 ? 'it' : 'them'}.`);
  notes.push('Account figures cover everything each account posts, not only this portal’s posts.');

  return {
    platforms,
    totalFollowers: platforms.reduce((s, p) => s + (p.followers ?? 0), 0),
    audience,
    notes,
  };
}

/* ═════════════════════════════════════════════════════════ performance ══ */

export interface PerformanceSummary {
  measured: number;
  byPlatform: { platform: string; posts: number; avgEngagement: number; avgRatePct: number | null }[];
  best: { platform: string; record: string; caption: string; engagement: number; ratePct: number | null } | null;
  /** Hashtags used on the better-performing half of measured posts. */
  winningHashtags: string[];
  notes: string[];
}

const HASHTAG = /#[\p{L}\p{N}_]+/gu;

export function summarisePerformance(posts: ScheduledPost[]): PerformanceSummary {
  const measured = posts
    .filter((p) => p.status === 'posted' && p.engagement)
    .map((p) => {
      const e = p.engagement!;
      const engagement = e.likes + e.comments + e.shares;
      const ratePct = e.views && e.views > 0 ? (engagement / e.views) * 100 : null;
      return { p, engagement, ratePct };
    });

  const notes: string[] = [];
  if (!measured.length) {
    const sent = posts.filter((p) => p.status === 'posted').length;
    notes.push(sent
      ? `${sent} post${sent === 1 ? '' : 's'} sent, but none measured yet — run “Sync now” on the Analytics page.`
      : 'Nothing has been sent from the portal yet, so there is no performance to learn from.');
    return { measured: 0, byPlatform: [], best: null, winningHashtags: [], notes };
  }

  const groups = new Map<string, typeof measured>();
  for (const m of measured) groups.set(m.p.platform, [...(groups.get(m.p.platform) ?? []), m]);
  const byPlatform = [...groups.entries()].map(([platform, ms]) => {
    const rates = ms.map((m) => m.ratePct).filter((r): r is number => r !== null);
    return {
      platform,
      posts: ms.length,
      avgEngagement: Math.round(ms.reduce((s, m) => s + m.engagement, 0) / ms.length),
      avgRatePct: rates.length ? Math.round((rates.reduce((s, r) => s + r, 0) / rates.length) * 10) / 10 : null,
    };
  }).sort((a, b) => b.avgEngagement - a.avgEngagement);

  const ranked = [...measured].sort((a, b) => b.engagement - a.engagement);
  const top = ranked[0];
  const topHalf = ranked.slice(0, Math.max(1, Math.ceil(ranked.length / 2)));
  const tags = new Map<string, number>();
  for (const m of topHalf) for (const t of m.p.caption.match(HASHTAG) ?? []) tags.set(t.toLowerCase(), (tags.get(t.toLowerCase()) ?? 0) + 1);

  notes.push(`Measured ${measured.length} sent post${measured.length === 1 ? '' : 's'} — ${measured.length < 5 ? 'a small sample; treat patterns as hints' : 'enough to see a pattern'}.`);

  return {
    measured: measured.length,
    byPlatform,
    best: top ? {
      platform: top.p.platform, record: top.p.recordIdentifier, caption: top.p.caption,
      engagement: top.engagement, ratePct: top.ratePct === null ? null : Math.round(top.ratePct * 10) / 10,
    } : null,
    winningHashtags: [...tags.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t).slice(0, 5),
    notes,
  };
}

/* ═════════════════════════════════════════════════ trends and sources ══ */

export interface InterestSignal {
  term: string;
  title: string;
  url: string;
  series: { date: string; views: number }[];
  recentAvg: number | null;
  priorAvg: number | null;
  changePct: number | null;
}

export interface NewsItem { title: string; source: string; url: string; publishedAt: number | null }

export interface TrendFindings {
  interest: InterestSignal[] | null;
  news: { query: string; total: number; lastWeek: number; items: NewsItem[] } | null;
  observances: UpcomingObservance[];
  answered: string[];
  failed: { provider: string; reason: string }[];
}

export interface SourceFindings {
  background: { title: string; extract: string; url: string }[] | null;
  papers: { title: string; year: number | null; doi: string; citedBy: number; venue: string | null; firstAuthor: string | null; authors: number }[] | null;
  answered: string[];
  failed: { provider: string; reason: string }[];
}

/** Everything the research steps gathered, handed to the writer. */
export interface Research {
  reach?: ReachSummary | null;
  performance?: PerformanceSummary | null;
  trends?: TrendFindings | null;
  sources?: SourceFindings | null;
}

/** Below this many views a day, a percentage change is noise — 2 → 4 views
 *  is "+100%" and means nothing. */
export const MIN_DAILY_VIEWS = 50;

/** Rising only past a real margin and on real volume. */
export function isRising(s: InterestSignal): boolean {
  return (s.changePct ?? 0) >= 15 && (s.recentAvg ?? 0) >= MIN_DAILY_VIEWS;
}

/** A 4% wobble is noise, not a trend; so is any change on a tiny page. */
export function describeInterest(s: InterestSignal): string {
  if (s.changePct === null || s.recentAvg === null) return `${s.title}: too little data to call`;
  if (s.recentAvg < MIN_DAILY_VIEWS) return `${s.title}: only ~${s.recentAvg} views/day — too few to call a trend either way`;
  const dir = s.changePct >= 15 ? 'rising' : s.changePct <= -15 ? 'falling' : 'steady';
  return `${s.title}: ${s.recentAvg.toLocaleString('en-IN')} views/day this week, ${s.changePct >= 0 ? '+' : ''}${s.changePct}% vs the previous month (${dir})`;
}

/**
 * The research, as instructions to the writer. Each block says what the
 * evidence is and fences how it may be used: news is a hook, never a fact
 * source; background may inform but not add claims; papers are cited by
 * their DOI exactly or not at all.
 */
export function researchDirection(r: Research): string {
  const lines: string[] = [];

  if (r.reach?.platforms.length) {
    lines.push('REACH (from the accounts’ own analytics):');
    for (const p of r.reach.platforms) {
      const bits = [`${p.followers ?? '?'} followers`];
      if (p.dailyAvg !== null) bits.push(`~${p.dailyAvg} ${p.metricLabel.toLowerCase()}/day`);
      lines.push(`- ${p.platform}: ${bits.join(', ')}.`);
    }
    const a = r.reach.audience;
    if (a?.topAge) {
      lines.push(`- Instagram audience is mostly aged ${a.topAge.band} (${a.topAge.share}%)${a.topCountry ? `, ${a.topCountry.share}% in ${a.topCountry.code}` : ''}. Write so that audience would stop scrolling, without talking down.`);
    }
  }

  if (r.performance?.measured) {
    const p = r.performance;
    lines.push(`PAST PERFORMANCE (${p.measured} measured post${p.measured === 1 ? '' : 's'}):`);
    if (p.best) lines.push(`- Best so far (${p.best.platform}, ${p.best.engagement} interactions): “${p.best.caption.slice(0, 160)}”. Learn from its shape, do not copy it.`);
    if (p.winningHashtags.length) lines.push(`- Hashtags on the better-performing posts: ${p.winningHashtags.join(' ')}.`);
  }

  const rising = r.trends?.interest?.filter(isRising) ?? [];
  if (rising.length) {
    lines.push(`PUBLIC INTEREST: ${rising.map(describeInterest).join('; ')}. The subject is timely — say why it matters now.`);
  }
  const hook = r.trends?.observances.find((o) => o.relevant && o.daysAway <= 30);
  if (hook) {
    lines.push(`TIMELY HOOK: ${hook.name} is ${hook.daysAway === 0 ? 'today' : `in ${hook.daysAway} day${hook.daysAway === 1 ? '' : 's'}`}. You may tie the post to it; do not invent any event around it.`);
  }
  if (r.trends?.news?.items.length) {
    lines.push('RECENT COVERAGE (context for relevance only — do NOT repeat claims from headlines as facts):');
    for (const n of r.trends.news.items.slice(0, 3)) lines.push(`- “${n.title}” (${n.source})`);
  }

  if (r.sources?.background?.length) {
    lines.push('BACKGROUND (may inform wording; add no fact beyond the brief unless it is stated here):');
    for (const b of r.sources.background) lines.push(`- ${b.title}: ${b.extract}`);
  }
  if (r.sources?.papers?.length) {
    lines.push('FURTHER READING (LinkedIn may point to ONE of these; use the DOI link exactly as given, never alter it):');
    for (const p of r.sources.papers.slice(0, 3)) lines.push(`- ${p.firstAuthor ?? 'Unknown'}${p.authors > 1 ? ' et al.' : ''} (${p.year ?? 'n.d.'}), “${p.title}”, ${p.venue ?? ''} — ${p.doi}`);
  }

  return lines.join('\n');
}

/** The words that make a paper about *this* post rather than about the
 *  same station: the science subjects, minus place names. */
const GENERIC = new Set(['antarctic', 'antarctica', 'station', 'layer', 'climate', 'oasis', 'hills', 'maitri', 'bharati', 'himadri', 'dakshin', 'gangotri', 'schirmacher', 'larsemann']);

export function subjectWords(terms: string[]): string[] {
  return [...new Set(terms.flatMap((t) => t.toLowerCase().split(/[^a-z]+/)).filter((w) => w.length >= 3 && !GENERIC.has(w)))];
}

/**
 * Splits papers into those on the post's subject and those merely from the
 * same place. A paper about meteorite dust at Maitri is not further reading
 * for a glacier survey at Maitri, however high it ranks in a search for
 * "Maitri". With no subject words at all, nothing is on topic — the agent
 * then says it found papers and did not offer them, rather than offering a
 * station-generic one.
 */
export function onTopicPapers<T extends { title: string }>(papers: T[], terms: string[]): { onTopic: T[]; rejected: T[] } {
  const words = subjectWords(terms).map((w) => w.replace(/s$/, ''));
  const onTopic: T[] = [];
  const rejected: T[] = [];
  for (const p of papers) {
    const title = p.title.toLowerCase();
    (words.length && words.some((w) => title.includes(w)) ? onTopic : rejected).push(p);
  }
  return { onTopic, rejected };
}
