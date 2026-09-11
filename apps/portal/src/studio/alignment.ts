/**
 * The alignment check — the drafts, read back against what was asked for.
 *
 * The writer is told the requirements; that is not the same as meeting
 * them. This is the agent's last step: it reads the three finished drafts
 * and checks each requirement against them, where it came from — the
 * admin's post request, the publisher's Basic answers, or the platforms'
 * own rules — and says plainly which are met, which are only partly met,
 * which were missed, and which a person has to judge.
 *
 * Deterministic on purpose. A model asked "did you follow the brief?" says
 * yes; a string check on the actual captions cannot be talked round. Where
 * a requirement cannot be checked by rule (the admin's free-text notes), it
 * is marked 'review' — never quietly counted as met.
 *
 * Pure: plain inputs, so every verdict is testable.
 */

import type { PostRequest } from '../types';
import type { BasicAnswers } from './basics';
import { CTAS, DATA_STATUSES, GOALS, LANGUAGES, OBSERVANCE_TAGS, cleanLinks } from './basics';
import { recordUrl } from './copy';

export type AlignStatus = 'met' | 'partial' | 'missed' | 'review';
export type AlignFrom = 'admin' | 'basic' | 'platform';

export interface AlignCheck {
  /** Stable id — the requirements drawer marks its rows by it. */
  id: string;
  requirement: string;
  from: AlignFrom;
  status: AlignStatus;
  detail: string;
}

interface Draft {
  angle: string;
  copy: { headline: string; standfirst: string; captions: { x: string; linkedin: string; instagram: string } };
}

export interface AlignInput {
  drafts: Draft[];
  /** Where the post is actually going, after any the publisher dropped. */
  platforms: string[];
  /** Platforms the publisher dropped during the run, and why. */
  dropped?: { platform: string; why: string }[];
  request?: PostRequest | null;
  basics?: BasicAnswers;
  audience: string;
  tone: string;
  /** The observance the post was tied to, if any. */
  hook?: string | null;
  hashtags: Record<string, string[]>;
  slot: { at: number; label: string } | null;
  /** The archive record the captions link to, if any. */
  linked: string | null;
  observerName?: string;
  /** The credit line a borrowed photograph requires, if one is used. */
  photoCredit?: string | null;
}

const GOAL_OF_REQUEST: Record<string, string> = {
  Announce: 'announce', Explain: 'explain', Celebrate: 'celebrate', 'Share data': 'inform', Recruit: 'invite',
};

const CAPTION_KEY: Record<string, 'x' | 'linkedin' | 'instagram'> = { x: 'x', linkedin: 'linkedin', instagram: 'instagram', story: 'instagram' };
const LIMITS = { x: 280, linkedin: 3000, instagram: 2200 } as const;
const LABEL: Record<string, string> = { x: 'X', linkedin: 'LinkedIn', instagram: 'Instagram', story: 'Instagram story' };

/** The words that carry a sentence's meaning, cut to a 5-letter stem so
 *  "recovering" finds "recovery" and "hopeful" finds "hopefully". */
const STOP = new Set(['about', 'after', 'again', 'being', 'before', 'could', 'every', 'first', 'their', 'there', 'these', 'those', 'which', 'while', 'where', 'would', 'should', 'other', 'still', 'thing', 'things', 'make', 'sure', 'please', 'post', 'posts']);
export function keyStems(text: string): string[] {
  const out: string[] = [];
  for (const w of (text.toLowerCase().match(/[a-z]{5,}/g) ?? [])) {
    if (STOP.has(w)) continue;
    const stem = w.slice(0, 5);
    if (!out.includes(stem)) out.push(stem);
  }
  return out;
}

const count = (n: number, of: number, what = 'draft') => `${n} of ${of} ${what}${of === 1 ? '' : 's'}`;
const ratioStatus = (n: number, of: number): AlignStatus => (n === of ? 'met' : n === 0 ? 'missed' : 'partial');
const fmtDay = (t: number) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' });

export function checkAlignment(input: AlignInput): AlignCheck[] {
  const { drafts, request: req, basics: b = {} } = input;
  const n = drafts.length;
  const keys = [...new Set(input.platforms.map((p) => CAPTION_KEY[p]).filter(Boolean))];
  /** All the text a reader of one draft would see, on the platforms it is going to. */
  const textOf = (d: Draft) => [d.copy.headline, d.copy.standfirst, ...keys.map((k) => d.copy.captions[k] ?? '')].join('\n');
  const captionsOf = (d: Draft) => keys.map((k) => d.copy.captions[k] ?? '');
  const checks: AlignCheck[] = [];

  /* ── the admin's request ─────────────────────────────────────────── */
  if (req) {
    // The admin's Basic answer when the request has one; else its old one-word goal.
    const asked = req.basics ? req.basics.goal ?? null : GOAL_OF_REQUEST[req.goal];
    if (asked) {
      const label = GOALS.find((g) => g.id === asked)?.label ?? req.goal;
      const now = b.goal ?? null;
      checks.push({
        id: 'goal', requirement: `Purpose: ${req.goal}`, from: 'admin',
        status: !now || now === asked ? 'met' : 'partial',
        detail: !now || now === asked
          ? `Written as “${label}”, as requested.`
          : `The publisher changed the purpose to “${GOALS.find((g) => g.id === now)?.label}” on Basic.`,
      });
    }

    const missing = req.platforms.filter((p) => !input.platforms.includes(p));
    const empty = req.platforms.filter((p) => input.platforms.includes(p) && CAPTION_KEY[p] && drafts.some((d) => !d.copy.captions[CAPTION_KEY[p]]?.trim()));
    checks.push({
      id: 'platforms', requirement: `Platforms: ${req.platforms.map((p) => LABEL[p] ?? p).join(', ')}`, from: 'admin',
      status: missing.length === req.platforms.length ? 'missed' : missing.length || empty.length ? 'partial' : 'met',
      detail: [
        ...missing.map((p) => `${LABEL[p] ?? p} dropped — ${input.dropped?.find((x) => x.platform === p)?.why ?? 'not selected on Basic'}.`),
        ...empty.map((p) => `${LABEL[p] ?? p} has an empty caption in at least one draft.`),
      ].join(' ') || `Every draft has a caption for ${req.platforms.map((p) => LABEL[p] ?? p).join(', ')}.`,
    });

    // Audience and tone the admin left to the agent are not requirements.
    if (req.basics?.audienceChosen !== false) checks.push({
      id: 'audience', requirement: `Audience: ${req.audience}`, from: 'admin',
      status: input.audience === req.audience ? 'met' : 'missed',
      detail: input.audience === req.audience ? `Written for ${req.audience}.` : `Written for ${input.audience} instead — the publisher changed it.`,
    });
    if (req.basics?.toneChosen !== false) checks.push({
      id: 'tone', requirement: `Tone: ${req.tone}`, from: 'admin',
      status: input.tone === req.tone ? 'met' : 'missed',
      detail: input.tone === req.tone ? `Written in a ${req.tone} tone.` : `Written ${input.tone} instead — the publisher changed it.`,
    });

    if (req.recordIdentifier) {
      const url = recordUrl(req.recordIdentifier);
      const linking = drafts.filter((d) => captionsOf(d).some((c) => c.includes(url))).length;
      const onRecord = input.linked === req.recordIdentifier;
      checks.push({
        id: 'record', requirement: `Built on ${req.recordIdentifier}`, from: 'admin',
        status: onRecord ? ratioStatus(linking, n) : 'missed',
        detail: onRecord
          ? `Written from the record's facts; ${count(linking, n)} link to its archive page.`
          : input.linked
            ? `Linked to ${input.linked} instead of the requested record.`
            : 'The requested record was not brought into the brief, so the drafts do not link to it.',
      });
    }

    if (req.deadline) {
      const late = !!input.slot && input.slot.at > req.deadline;
      checks.push({
        id: 'deadline', requirement: `Needed by ${fmtDay(req.deadline)}`, from: 'admin',
        status: !input.slot ? 'review' : late ? 'missed' : 'met',
        detail: !input.slot
          ? 'No posting time suggested — schedule it before the deadline.'
          : late
            ? `The suggested time, ${input.slot.label}, is after the deadline.`
            : `Suggested for ${input.slot.label} — before the deadline.`,
      });
    }

    if (req.instructions?.trim()) {
      const stems = keyStems(req.instructions);
      const all = drafts.map(textOf).join('\n').toLowerCase();
      const found = stems.filter((s) => all.includes(s));
      checks.push({
        id: 'notes', requirement: 'The admin’s notes', from: 'admin', status: 'review',
        detail: `Given to the writer word for word. ${found.length} of ${stems.length} key words appear in the drafts` +
          (stems.length ? ` (${stems.map((s) => (found.includes(s) ? s : `${s}✗`)).join(', ')})` : '') +
          ' — a person should judge whether the intent was met.',
      });
    }
  }

  /* ── the publisher's Basic answers ───────────────────────────────── */
  if (b.cta && b.cta !== 'none') {
    const pattern = { record: /\b(read|record|archive|full)\b/i, dataset: /\b(explore|data|dataset)\b/i, site: /\b(visit|site|portal)\b/i, follow: /\bfollow\b/i }[b.cta];
    // The ask belongs at the end: the last two lines of each caption that
    // carry words — not the photo credit, the record link or a row of
    // hashtags, which all come after it.
    const wordsOf = (l: string) => l.replace(/https?:\/\/\S+/g, '').replace(/#[\p{L}\p{N}_]+/gu, '').trim();
    const ends = (c: string) => c.split('\n').map((l) => l.trim())
      .filter((l) => l && !/^photo:/i.test(l) && wordsOf(l).length > 0)
      .slice(-2).join(' ');
    const ok = drafts.filter((d) => captionsOf(d).filter(Boolean).every((c) => pattern.test(ends(c)))).length;
    checks.push({
      id: 'cta', requirement: `Call to action: ${CTAS.find((c) => c.id === b.cta)?.label}`, from: 'basic',
      status: ratioStatus(ok, n), detail: `${count(ok, n)} end every caption with it.`,
    });
  }

  if (b.dataStatus) {
    const overclaim = /\b(confirm(s|ed)?|prove[sn]?|proof|definitive(ly)?|conclusive(ly)?)\b/i;
    const flagged = /\b(preliminary|early|initial|provisional|first look|yet to be (verified|confirmed))\b/i;
    const ok = drafts.filter((d) => {
      const t = textOf(d);
      return b.dataStatus === 'preliminary' ? !overclaim.test(t) && captionsOf(d).filter(Boolean).every((c) => flagged.test(c)) : !overclaim.test(t);
    }).length;
    checks.push({
      id: 'data', requirement: `Data: ${DATA_STATUSES.find((s) => s.id === b.dataStatus)?.label}`, from: 'basic',
      status: ratioStatus(ok, n),
      detail: b.dataStatus === 'preliminary'
        ? `${count(ok, n)} label the readings as preliminary and claim nothing firm.`
        : `${count(ok, n)} state the facts without overclaiming (“confirms”, “proves”).`,
    });
  }

  if (b.credit) {
    const first = (input.observerName ?? '').trim().split(/\s+/)[0] ?? '';
    const usable = first.length >= 3 && !first.includes('@');
    const named = usable ? drafts.filter((d) => new RegExp(`\\b${first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(textOf(d))).length : 0;
    const credited = drafts.filter((d) => /\b(NCPOR|National Centre for Polar)/i.test(textOf(d))).length;
    if (b.credit === 'observer') {
      checks.push({
        id: 'credit', requirement: 'Credit: name the observer', from: 'basic',
        status: usable ? ratioStatus(named, n) : 'review',
        detail: usable ? `${count(named, n)} name ${first}.` : 'The observer’s name is not on record — check the credit by eye.',
      });
    } else {
      const leaks = usable ? named : 0;
      checks.push({
        id: 'credit', requirement: b.credit === 'anonymous' ? 'Credit: no individual names' : 'Credit: NCPOR and the station', from: 'basic',
        status: leaks ? 'missed' : b.credit === 'institution' ? ratioStatus(credited, n) : 'met',
        detail: leaks
          ? `${count(leaks, n)} name ${first}, though no individual was to be named.`
          : b.credit === 'institution' ? `${count(credited, n)} credit NCPOR; no individual is named.` : 'No individual is named.',
      });
    }
  }

  if (b.language) {
    const deva = /[ऀ-ॿ]/;
    const ok = drafts.filter((d) => {
      const cs = captionsOf(d).filter(Boolean);
      if (b.language === 'en') return cs.every((c) => !deva.test(c));
      if (b.language === 'hi') return cs.every((c) => deva.test(c));
      return cs.every((c) => deva.test(c) && /[a-z]{4,}/i.test(c.replace(/#\w+/g, '')));
    }).length;
    checks.push({
      id: 'language', requirement: `Language: ${LANGUAGES.find((l) => l.id === b.language)?.label}`, from: 'basic',
      status: ratioStatus(ok, n), detail: `${count(ok, n)} are written in it throughout.`,
    });
  }

  const links = cleanLinks(b.links);
  if (links.length) {
    // Instagram carries "Link in bio" instead of addresses.
    const linkKeys = keys.filter((k) => k !== 'instagram');
    const carries = (d: Draft) =>
      linkKeys.every((k) => !d.copy.captions[k] || links.every((l) => d.copy.captions[k].includes(l)))
      && (!keys.includes('instagram') || !d.copy.captions.instagram || /link in bio/i.test(d.copy.captions.instagram));
    const carry = drafts.filter(carries).length;
    const short = linkKeys.filter((k) => drafts.some((d) => d.copy.captions[k] && links.some((l) => !d.copy.captions[k].includes(l))));
    checks.push({
      id: 'links', requirement: `${links.length === 1 ? 'Your link' : `Your ${links.length} links`} in every caption`, from: 'basic',
      status: ratioStatus(carry, n),
      detail: carry === n
        ? `Every caption carries ${links.length === 1 ? 'it' : 'all of them'}.`
        : `${count(carry, n)} carry every link — no room left on ${short.map((k) => LABEL[k]).join(', ')}.`,
    });
  }

  if (input.hook) {
    const tag = OBSERVANCE_TAGS[input.hook];
    const short = input.hook.split(/[(,]/)[0].trim().toLowerCase();
    // Long official names are rarely written out: "World Ozone Day" counts.
    const alias = /ozone/i.test(input.hook) ? 'ozone day' : /antarctica day/i.test(input.hook) ? 'antarctica day' : null;
    const ok = drafts.filter((d) => {
      const t = textOf(d).toLowerCase();
      return t.includes(short) || (!!tag && t.includes(tag.toLowerCase())) || (!!alias && t.includes(alias));
    }).length;
    checks.push({
      id: 'occasion', requirement: `Tied to ${input.hook}`, from: 'basic',
      status: ratioStatus(ok, n), detail: `${count(ok, n)} mention the day${tag ? ` or ${tag}` : ''}.`,
    });
  }

  if (input.photoCredit) {
    const who = input.photoCredit.replace(/^Photo:\s*/, '').split(' (')[0].toLowerCase();
    const ok = drafts.filter((d) => captionsOf(d).filter(Boolean).every((c) => /photo:/i.test(c) && c.toLowerCase().includes(who))).length;
    checks.push({
      id: 'photo-credit', requirement: 'Credit for the borrowed photograph', from: 'basic',
      status: ratioStatus(ok, n), detail: `${count(ok, n)} carry “${input.photoCredit}” in every caption — the licence requires it.`,
    });
  }

  const refs = (b.references ?? []).filter((r) => r.text?.trim());
  if (refs.length) {
    checks.push({
      id: 'references', requirement: `Follow ${refs.length} reference post${refs.length === 1 ? '' : 's'}`, from: 'basic', status: 'review',
      detail: 'Their shape and voice were given to the writer. Whether a draft reads like them is a judgement for a person.',
    });
  }

  /* ── the platforms' own rules ────────────────────────────────────── */
  const over: string[] = [];
  for (const d of drafts) for (const k of keys) {
    const len = [...(d.copy.captions[k] ?? '')].length;
    if (len > LIMITS[k]) over.push(`“${d.angle}” on ${LABEL[k]} (${len}/${LIMITS[k]})`);
  }
  if (keys.length) {
    checks.push({
      id: 'limits', requirement: 'Within each platform’s length limit', from: 'platform',
      status: over.length ? 'missed' : 'met',
      detail: over.length ? `Too long: ${over.join('; ')}.` : `Every caption fits ${keys.map((k) => `${LABEL[k]} ${LIMITS[k]}`).join(', ')}.`,
    });
  }

  const planned = Object.entries(input.hashtags).filter(([p, t]) => t.length && input.platforms.includes(p));
  if (planned.length) {
    let used = 0; let total = 0;
    for (const d of drafts) for (const [p, tags] of planned) {
      const c = (d.copy.captions[CAPTION_KEY[p]] ?? '').toLowerCase();
      total += tags.length;
      used += tags.filter((t) => c.includes(t.toLowerCase())).length;
    }
    const share = total ? used / total : 1;
    checks.push({
      id: 'hashtags', requirement: 'The planned hashtags', from: 'platform',
      status: share >= 0.8 ? 'met' : share >= 0.4 ? 'partial' : 'missed',
      detail: `${Math.round(share * 100)}% of the planned tags are in the captions.`,
    });
  }

  return checks;
}

/** Requirements a rewrite can fix — about the words, not about choices. */
export const REWRITABLE = new Set(['cta', 'data', 'credit', 'language', 'links', 'occasion', 'limits', 'hashtags', 'photo-credit']);

/** The misses, as corrections for a second pass of the writer. */
export function corrections(checks: AlignCheck[]): string[] {
  return checks
    .filter((c) => REWRITABLE.has(c.id) && (c.status === 'missed' || c.status === 'partial'))
    .map((c) => `${c.requirement} — last time: ${c.detail}`);
}

/** 10:00 IST on the deadline's own day — or, if that has already passed,
 *  an hour from now. */
export function slotByDeadline(deadline: number, now: number): { at: number; label: string; reason: string } {
  const ist = new Date(deadline + 330 * 60_000);
  const dayStart = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate());
  let at = dayStart + 270 * 60_000;
  if (at < now) at = now + 3_600_000;
  const label = new Date(at).toLocaleString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
  });
  return { at, label, reason: 'By the admin’s deadline.' };
}

export function summarise(checks: AlignCheck[]): { met: number; partial: number; missed: number; review: number } {
  return {
    met: checks.filter((c) => c.status === 'met').length,
    partial: checks.filter((c) => c.status === 'partial').length,
    missed: checks.filter((c) => c.status === 'missed').length,
    review: checks.filter((c) => c.status === 'review').length,
  };
}
