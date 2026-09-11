/**
 * The agent working, made visible — and accountable.
 *
 * Every step shows three things, in this order: what it LOOKED AT (with the
 * source linked), how it REASONED from that, and what it DECIDED. Each
 * carries a confidence. Nothing is presented as a result without its basis.
 *
 * Where the agent cannot decide well on its own it does not guess: it
 * stops and ASKS the publisher — an ambiguous content type, an archive
 * record it is not sure about, Instagram chosen with no photograph, an
 * upcoming observance the post could be tied to, a brief too thin to write
 * from. The answer steers what follows and is kept in the record.
 *
 * All of it is collected into an AgentTrace (trace.ts) that travels with
 * the submission, so the admin approving the post sees the same account the
 * publisher watched — sources, reasoning, questions and answers, and the
 * exact instructions the writer was given.
 *
 * The steps, in order:
 *   brief → archive → platforms → reach → performance → voice
 *   → trends → sources → references → writing → alignment
 *
 * ALIGNMENT is the last step and the one that closes the loop: the drafts
 * are read back against every requirement — the admin's post request, the
 * publisher's Basic answers, the platforms' rules — by rule, not by asking
 * the model whether it complied (studio/alignment.ts). A requirement the
 * words missed can be fixed with one rewrite, if the publisher says so; a
 * posting time past the admin's deadline is put to them as a question.
 *
 * EFFICIENCY. The four network lookups — account analytics, trends, sources
 * and image references — start together the moment the run begins, not one
 * after another as their steps come up. By the time the publisher has read
 * the first few conclusions, most of the research is already back, so a run
 * costs roughly the slowest lookup plus the writer, not the sum of all four.
 * Each can still fail alone: its step says what failed and the run goes on.
 *
 * The Basic step's answers (studio/basics.ts) are treated as decided: a
 * chosen purpose sets the content type, a chosen occasion is not asked
 * about again, and audience and tone are only inferred where left unset.
 *
 * PACING. A step stays on screen for at least MIN_STEP_MS from when it
 * started — not a fixed pause after it finishes — so quick analysis steps
 * are still readable, and steps whose research took a while add nothing.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle, Archive, BarChart3, BookOpen, Check, ClipboardCheck, ExternalLink, Globe, HelpCircle,
  Image as ImageIcon, Layers, Loader2, PenLine, Search, TrendingUp, Users,
} from 'lucide-react';

import { DecryptedText } from './DecryptedText';
import { CONTENT_TYPES, type BriefAnalysis, type ContentType } from './agent';
import { recordUrl } from './copy';
import type { StyleReference, ReferenceSearchRun } from './references';
import {
  describeInterest, isRising, MIN_DAILY_VIEWS, onTopicPapers, researchTerms, subjectWords, summarisePerformance, summariseReach,
  type Research,
} from './insight';
import { fetchReachAccounts, fetchSources, fetchTrends } from './research';
import { GOALS, hashtagPlan, inferVoice, photoCredit, pickPhoto, recommendSlot, type BasicAnswers } from './basics';
import { HASHTAG_BY_ACTIVITY, HASHTAG_BY_STATION } from '../types';
import type { PostRequest } from '../types';
import type { Variant } from './copy';
import { checkAlignment, corrections, slotByDeadline, summarise, type AlignCheck } from './alignment';
import type { AgentTrace, Confidence, TraceQuestion, TraceSource, TraceStep, TraceCheck } from './trace';
import type { ScheduledPost } from '../social/queue';
import './AgentThinking.css';

const MIN_STEP_MS = 800;

export type StepId =
  | 'brief' | 'archive' | 'platforms' | 'reach' | 'performance'
  | 'voice' | 'trends' | 'sources' | 'references' | 'writing' | 'alignment';

const ORDER: StepId[] = [
  'brief', 'archive', 'platforms', 'reach', 'performance',
  'voice', 'trends', 'sources', 'references', 'writing', 'alignment',
];

const RUNNING: Record<StepId, string> = {
  brief: 'Reading the brief',
  archive: 'Searching the archive for a matching record',
  platforms: 'Reading what each platform demands',
  reach: 'Reading the accounts’ analytics',
  performance: 'Learning from posts already sent',
  voice: 'Choosing who it is for and how it sounds',
  trends: 'Checking what people are paying attention to',
  sources: 'Gathering sources to ground the post',
  references: 'Searching the web for visual references',
  writing: 'Writing three options',
  alignment: 'Checking the drafts against the requirements',
};

const ICONS: Record<StepId, typeof Search> = {
  brief: PenLine, archive: Archive, platforms: Layers, reach: BarChart3,
  performance: TrendingUp, voice: Users, trends: TrendingUp,
  sources: BookOpen, references: Globe, writing: PenLine, alignment: ClipboardCheck,
};

/** What the publisher's answers changed. Applied by Studio when it writes. */
export interface AgentDecisions {
  /** A keyword-matched archive record the publisher confirmed. */
  useArchive: boolean;
  dropInstagram: boolean;
  /** The observance the publisher agreed to tie the post to. */
  useHook: string | null;
  extraDetail: string | null;
  /** An openly licensed photograph the agent found, when asked to. */
  photo: StyleReference | null;
}

interface Question {
  prompt: string;
  why: string;
  options: string[];
  /** Offer a text box; the first option submits it. */
  text?: { placeholder: string };
}

interface Ctx {
  analysis: BriefAnalysis;
  research: Research;
  decisions: AgentDecisions;
  refs: StyleReference[];
}

export interface AgentThinkingProps {
  analysis: BriefAnalysis;
  topic: string;
  station?: string;
  /** The dispatch's activity ("Ice / glaciology survey") — part of what the
   *  post is about, and so part of what gets researched. */
  activity?: string;
  hasImage: boolean;
  posts: ScheduledPost[];
  archiveCount: number;
  runReferences: (queries: string[], onPartial: (run: ReferenceSearchRun) => void) => Promise<ReferenceSearchRun>;
  /** Writes the options. Returns the instructions the writer received. */
  /** The Basic step's answers — decided, not to be asked again. */
  basics?: BasicAnswers;
  /** The admin's post request, when there is one — what the drafts are checked against. */
  requirements?: PostRequest | null;
  /** Who filed the report — for checking the credit rule. */
  observerName?: string;
  runWriting: (input: {
    analysis: BriefAnalysis; research: Research; decisions: AgentDecisions;
    plan: { hashtags: Record<string, string[]>; slot: { at: number; label: string; reason: string } };
    /** Requirements the last drafts missed, for a second pass. */
    fixes?: string[];
  }) => Promise<{ instructions: string; generated: boolean; variants: Variant[]; linked: string | null }>;
  onComplete: (result: { refs: StyleReference[]; trace: AgentTrace; analysis: BriefAnalysis; decisions: AgentDecisions }) => void;
  onCancel?: () => void;
}

const AUDIENCE_LABEL: Record<string, string> = {
  public: 'the general public', students: 'students', researchers: 'researchers', press: 'the press',
};

const excerpt = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

function accountLink(platform: string, handle: string | null): string | undefined {
  if (!handle) return undefined;
  if (platform === 'x') return `https://x.com/${handle}`;
  if (platform === 'instagram') return `https://www.instagram.com/${handle}`;
  return undefined;
}

/* ════════════════════════════════════════════════════════ the component ══ */

export function AgentThinking(props: AgentThinkingProps) {
  const { analysis: initial, onCancel } = props;
  const [done, setDone] = useState<TraceStep[]>([]);
  const [current, setCurrent] = useState<StepId | null>(ORDER[0]);
  const [search, setSearch] = useState<ReferenceSearchRun | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const [draft, setDraft] = useState('');
  const [failed, setFailed] = useState<string | null>(null);

  /* Refs, not deps: Studio passes inline callbacks with a new identity each
   * render, and a pipeline that restarts on re-render double-charges the
   * generator. See the StrictMode note in the effect below. */
  const started = useRef(false);
  const cancelled = useRef(false);
  const latest = useRef(props);
  latest.current = props;
  const answerRef = useRef<((a: { option: string; text?: string }) => void) | null>(null);

  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  /** Pauses the run on a question and resolves with the publisher's answer. */
  const ask = (q: Question) => new Promise<{ option: string; text?: string }>((resolve) => {
    setDraft('');
    setQuestion(q);
    answerRef.current = (a) => { setQuestion(null); answerRef.current = null; resolve(a); };
  });

  const run = useCallback(async () => {
    const p = latest.current;
    const ctx: Ctx = {
      analysis: { ...initial },
      research: {},
      decisions: { useArchive: initial.archive ? initial.archive.how !== 'keyword' : false, dropInstagram: false, useHook: null, extraDetail: null, photo: null },
      refs: [],
    };
    const trace: TraceStep[] = [];
    const startedAt = Date.now();
    let instructions = '';
    let generated = false;
    let hashtags: Record<string, string[]> = {};
    let slot: { at: number; label: string; reason: string } | null = null;
    let drafts: Variant[] = [];
    let linked: string | null = null;
    let writerInput: Parameters<AgentThinkingProps['runWriting']>[0] | null = null;

    let stepStart = Date.now();
    const finish = async (step: TraceStep, q?: Question, apply?: (a: { option: string; text?: string }) => void) => {
      if (q && !cancelled.current) {
        const a = await ask(q);
        apply?.(a);
        const asked: TraceQuestion = { prompt: q.prompt, why: q.why, options: q.options, answer: a.option, ...(a.text ? { text: a.text } : {}) };
        step = { ...step, asked };
      }
      await wait(Math.max(0, MIN_STEP_MS - (Date.now() - stepStart)));
      trace.push(step);
      setDone([...trace]);
    };

    /* All four network lookups start now, together. Each step below awaits
     * the one it reports on — usually already settled by the time it is
     * reached. Settled, not raced: a failure is kept as a value, so it
     * surfaces at its own step instead of as an unhandled rejection. */
    type Settled<T> = { ok: true; v: T } | { ok: false; e: unknown };
    const settle = <T,>(pr: Promise<T>): Promise<Settled<T>> => pr.then((v) => ({ ok: true as const, v }), (e) => ({ ok: false as const, e }));
    const unwrap = async <T,>(pr: Promise<Settled<T>>): Promise<T> => { const r = await pr; if (r.ok) return r.v; throw r.e; };
    const terms0 = researchTerms(p.topic, p.station, initial.archive?.record ?? null, p.activity);
    const subjects0 = terms0.filter((t) => subjectWords([t]).length > 0);
    const paperQuery0 = subjects0.length ? `${subjects0.join(' ')} Antarctica` : undefined;
    const pre = {
      reach: settle(fetchReachAccounts()),
      trends: settle(fetchTrends(terms0, `${p.topic} ${initial.archive?.record?.title ?? ''}`)),
      sources: settle(fetchSources(terms0, paperQuery0)),
      refs: settle(p.runReferences(initial.queries, (partial) => { if (!cancelled.current) setSearch(partial); })),
    };

    for (const id of ORDER) {
      if (cancelled.current) return;
      setCurrent(id);
      stepStart = Date.now();
      const a = ctx.analysis;
      const c = a.classification;

      /* ── brief ─────────────────────────────────────────────────────── */
      if (id === 'brief') {
        const runner = c.ranked[1];
        const step: TraceStep = {
          id, title: RUNNING.brief,
          looked: [`The brief: “${excerpt(p.topic)}”`],
          reasoning: [
            p.basics?.goal
              ? `You set the purpose on Basic — ${GOALS.find((g) => g.id === p.basics?.goal)?.label}. The content type follows from it.`
              : c.evidence.length
                ? `Words pointing to ${c.type.label}: ${c.evidence.map((e) => `“${e}”`).join(', ')}.`
                : 'No strong signal in the wording — falling back to the default for a field dispatch.',
            ...(runner ? [`Next closest: ${CONTENT_TYPES[runner.type].label} (score ${runner.score} against ${c.ranked[0]?.score ?? 0}).`] : []),
          ],
          decision: `Write it as ${c.type.label}.`,
          confidence: c.confidence,
          sources: [{ kind: 'brief', label: 'Publisher’s brief' }],
        };
        const q: Question | undefined = c.confidence === 'low' && !p.basics?.goal ? {
          prompt: 'What kind of post is this?',
          why: `The wording fits more than one kind of post and I would only be guessing between ${c.ranked.slice(0, 3).map((r) => CONTENT_TYPES[r.type].label).join(', ')}.`,
          options: [...new Set([c.type.id, ...c.ranked.slice(0, 3).map((r) => r.type)])].map((t) => CONTENT_TYPES[t as ContentType].label),
        } : undefined;
        await finish(step, q, (ans) => {
          const picked = (Object.keys(CONTENT_TYPES) as ContentType[]).find((t) => CONTENT_TYPES[t].label === ans.option);
          if (picked && picked !== c.type.id) {
            const type = CONTENT_TYPES[picked];
            ctx.analysis = {
              ...ctx.analysis,
              classification: { ...c, type, confidence: 'high' },
              audience: ctx.analysis.audienceChosen ? ctx.analysis.audience : type.suggests.audience,
              tone: ctx.analysis.toneChosen ? ctx.analysis.tone : type.suggests.tone,
            };
          }
        });
        continue;
      }

      /* ── archive ───────────────────────────────────────────────────── */
      if (id === 'archive') {
        const m = a.archive;
        if (m) {
          const ident = m.record.metadata?.identifier ?? m.record.id;
          const step: TraceStep = {
            id, title: RUNNING.archive,
            looked: [`${p.archiveCount} published records in the archive`],
            reasoning: [
              m.how === 'identifier' ? `The brief names the record’s identifier (${m.matched}) — no doubt which one is meant.`
                : m.how === 'title' ? 'The brief quotes this record’s title closely.'
                  : `The brief only shares keywords with it (${m.matched}) — that could be a coincidence.`,
            ],
            decision: m.how === 'keyword' ? 'Ask before using it.' : `Use “${m.record.title}” as the source of facts, and link it.`,
            confidence: m.how === 'keyword' ? 'low' : 'high',
            sources: [{ kind: 'archive', label: `${ident} — ${m.record.title}`, url: recordUrl(ident), note: 'Facts and the permanent link come from here' }],
          };
          const q: Question | undefined = m.how === 'keyword' ? {
            prompt: `Is this post about “${m.record.title}” (${ident})?`,
            why: 'It only matched on keywords. Using the wrong record would put its facts — and its link — in the post.',
            options: ['Yes, use this record', 'No, write from the field report'],
          } : undefined;
          await finish(step, q, (ans) => {
            ctx.decisions.useArchive = ans.option.startsWith('Yes');
            if (!ctx.decisions.useArchive) ctx.analysis = { ...ctx.analysis, archive: null };
          });
        } else {
          const thin = words(p.topic) < 8;
          const step: TraceStep = {
            id, title: RUNNING.archive,
            looked: [`${p.archiveCount} published records in the archive`],
            reasoning: ['No identifier, title or distinctive keyword in the brief matched a published record.'],
            decision: 'Write from the field report alone.',
            confidence: 'medium',
            sources: [],
          };
          const q: Question | undefined = thin ? {
            prompt: 'What is the one fact this post has to get across?',
            why: `The brief is ${words(p.topic)} words and there is no archive record behind it — I would have to invent the substance, and I won’t.`,
            options: ['Add this detail', 'Continue with what I have'],
            text: { placeholder: 'e.g. Surface ozone at Maitri fell 12% below the seasonal average in August' },
          } : undefined;
          await finish(step, q, (ans) => {
            if (ans.option === 'Add this detail' && ans.text?.trim()) ctx.decisions.extraDetail = ans.text.trim();
          });
        }
        continue;
      }

      /* ── platforms ─────────────────────────────────────────────────── */
      if (id === 'platforms') {
        const step: TraceStep = {
          id, title: RUNNING.platforms,
          looked: a.requirements.map((r) => `${r.label}: ${r.demands}`),
          reasoning: [...a.requirements.map((r) => `${r.label} hashtags: ${r.hashtags.note}.`), ...a.gaps],
          decision: a.requirements.length ? `Write separate versions for ${a.requirements.map((r) => r.label).join(', ')}.` : 'No platform selected.',
          confidence: 'high',
          sources: [],
          warning: a.gaps.length > 0,
        };
        // With no photograph, the agent looks for one unless told not to.
        const agentFindsPhoto = p.basics?.imageSource !== 'upload' && !p.hasImage;
        if (agentFindsPhoto && a.platforms.includes('instagram')) {
          step.reasoning.push('No photograph yet, but you asked the agent to find one — Instagram stays in.');
          step.warning = false;
        }
        const igGap = a.platforms.includes('instagram') && !p.hasImage && !agentFindsPhoto;
        const q: Question | undefined = igGap ? {
          prompt: 'Instagram cannot publish without a photograph. What should I do?',
          why: 'There is no photo on this post yet, and Instagram rejects text-only posts outright.',
          options: ['Drop Instagram from this post', 'Keep it — I’ll add a photo before submitting'],
        } : undefined;
        await finish(step, q, (ans) => { ctx.decisions.dropInstagram = ans.option.startsWith('Drop'); });
        continue;
      }

      /* ── reach ─────────────────────────────────────────────────────── */
      if (id === 'reach') {
        const selected = a.platforms.filter((x) => !(x === 'instagram' && ctx.decisions.dropInstagram));
        try {
          const accounts = await unwrap(pre.reach);
          const r = summariseReach(accounts, selected, Date.now());
          ctx.research.reach = r;
          const best = r.platforms.filter((x) => x.bestDay).sort((x, y) => (y.dailyAvg ?? 0) - (x.dailyAvg ?? 0))[0];
          const step: TraceStep = {
            id, title: RUNNING.reach,
            looked: r.platforms.map((x) => `${x.platform} analytics${x.handle ? ` for ${x.platform === 'linkedin' ? x.handle : `@${x.handle}`}` : ''} — last 30 days`),
            reasoning: [
              ...r.platforms.map((x) => `${x.platform}: ${x.followers ?? '?'} followers, ~${x.dailyAvg ?? 0} ${x.metricLabel.toLowerCase()} a day.`),
              ...r.platforms.filter((x) => x.bestDay).map((x) => `${x.platform} does best on ${x.bestDay!.day}s — ${x.bestDay!.liftPct}% above its average, from ${x.bestDay!.samples} ${x.bestDay!.day}s of data.`),
              ...(r.audience?.topAge ? [`Instagram followers are mostly ${r.audience.topAge.band} (${r.audience.topAge.share}%)${r.audience.topCountry ? `, ${r.audience.topCountry.share}% in ${r.audience.topCountry.code}` : ''}${r.audience.topCity ? `; largest city ${r.audience.topCity}` : ''}.`] : []),
              ...r.notes,
            ],
            decision: best ? `Suggest posting on a ${best.bestDay!.day}${r.audience?.topAge ? `, written for an audience mostly aged ${r.audience.topAge.band}` : ''}.` : 'No timing advice — too little reach data to call a best day.',
            confidence: best && best.bestDay!.samples >= 4 ? 'medium' : 'low',
            sources: r.platforms.map((x) => ({ kind: 'analytics' as const, label: `${x.platform} account analytics`, url: accountLink(x.platform, x.handle), note: 'via Upload-Post' })),
          };
          await finish(step);
        } catch (err) {
          await finish({
            id, title: RUNNING.reach, looked: ['Account analytics'],
            reasoning: [`Could not read them: ${err instanceof Error ? err.message : String(err)}.`],
            decision: 'Continue without reach data — nothing about the audience is assumed.',
            confidence: 'low', sources: [], warning: true,
          });
        }
        continue;
      }

      /* ── performance ───────────────────────────────────────────────── */
      if (id === 'performance') {
        const perf = summarisePerformance(p.posts);
        ctx.research.performance = perf;
        const sent = p.posts.filter((x) => x.status === 'posted' && x.liveCheck?.state !== 'removed');
        const step: TraceStep = {
          id, title: RUNNING.performance,
          looked: [`${sent.length} post${sent.length === 1 ? '' : 's'} sent from the portal, ${perf.measured} with measured engagement`, ...(a.bestPractice.sampleSize ? [`${a.bestPractice.sampleSize} captions on published records (house style)`] : [])],
          reasoning: [
            ...perf.byPlatform.map((b) => `${b.platform}: ${b.posts} post${b.posts === 1 ? '' : 's'}, ${b.avgEngagement} interactions on average${b.avgRatePct !== null ? ` (${b.avgRatePct}% of views)` : ''}.`),
            ...(perf.best ? [`Best so far: ${perf.best.record} on ${perf.best.platform}, ${perf.best.engagement} interactions.`] : []),
            ...perf.notes,
            ...a.bestPractice.notes,
          ],
          decision: perf.best
            ? `Borrow the shape of the best-performing post${perf.winningHashtags.length ? ` and favour ${perf.winningHashtags.slice(0, 3).join(' ')}` : ''}.`
            : 'Nothing measured to learn from yet — match the house style only.',
          confidence: perf.measured >= 5 ? 'medium' : 'low',
          sources: sent.filter((x) => x.externalUrl).slice(0, 4).map((x) => ({ kind: 'queue' as const, label: `${x.recordIdentifier} on ${x.platform}`, url: x.externalUrl! })),
        };
        /* Reference posts the publisher chose on Basic: evidence of the style
         * wanted, handed to the writer as shape and voice, never as facts. */
        const given = (p.basics?.references ?? []);
        if (given.length) {
          step.looked.push(`${given.length} reference post${given.length === 1 ? '' : 's'} you chose`);
          step.reasoning.push(...given.map((r) => r.text?.trim()
            ? `Following “${excerpt(r.text, 90)}” (${r.label}) for shape and voice — no facts taken from it.`
            : `${r.label}: a link without its text — the writer cannot read it, so it is kept for the reviewer only.`));
          step.sources.push(...given.map((r) => ({ kind: (r.kind === 'past' ? 'queue' : 'brief') as 'queue' | 'brief', label: `Reference: ${r.label}`, url: r.url })));
        }
        await finish(step);
        continue;
      }

      /* ── voice: who it is for and how it sounds ────────────────────── */
      if (id === 'voice') {
        const aud = ctx.research.reach?.audience;
        const going = a.platforms.filter((x) => !(ctx.decisions.dropInstagram && (x === 'instagram' || x === 'story')));
        const inferred = inferVoice({
          typeDefault: c.type.suggests,
          goal: p.basics?.goal,
          platforms: going,
          followerAge: aud?.topAge?.band ?? null,
        });
        const audience = a.audienceChosen ? a.audience : inferred.audience;
        const tone = a.toneChosen ? a.tone : inferred.tone;
        ctx.analysis = { ...ctx.analysis, audience, tone };
        const bothChosen = a.audienceChosen && a.toneChosen;
        await finish({
          id, title: RUNNING.voice,
          looked: [
            bothChosen ? 'Your choices on Basic' : `The content type (${c.type.label})`,
            ...(p.basics?.goal && !bothChosen ? ['The purpose you set'] : []),
            ...(!bothChosen ? [`Where it is going: ${going.join(', ')}`] : []),
            ...(aud?.topAge && !bothChosen ? ['Instagram follower demographics'] : []),
          ],
          reasoning: [
            ...(a.audienceChosen ? [`Audience: you chose ${AUDIENCE_LABEL[a.audience] ?? a.audience} — kept.`] : []),
            ...(a.toneChosen ? [`Tone: you chose ${a.tone} — kept.`] : []),
            ...(bothChosen ? [] : inferred.reasons),
          ],
          decision: `Write for ${AUDIENCE_LABEL[audience] ?? audience}, in a ${tone} tone.`,
          confidence: bothChosen ? 'high' : 'medium',
          sources: [],
        });
        continue;
      }

      /* ── trends ────────────────────────────────────────────────────── */
      if (id === 'trends') {
        const record = a.archive?.record ?? null;
        void record;
        const terms = terms0;
        const settled = await pre.trends;
        const t = settled.ok ? settled.v : { interest: null, news: null, observances: [], answered: [], failed: [{ provider: 'trends', reason: String(settled.e) }] };
        ctx.research.trends = t;
        const rising = (t.interest ?? []).filter(isRising);
        const hook = t.observances.find((o) => o.relevant && o.daysAway <= 30);
        const step: TraceStep = {
          id, title: RUNNING.trends,
          looked: [
            `Wikipedia daily views for: ${(t.interest ?? []).map((s) => s.title).join(', ') || terms.join(', ')}`,
            ...(t.news ? [`Google News, last 30 days: “${t.news.query}”`] : []),
            'Calendar of observances, next 45 days',
          ],
          reasoning: [
            ...(t.interest ?? []).map(describeInterest),
            ...(t.news ? [`${t.news.total} stories in 30 days, ${t.news.lastWeek} of them this week${t.news.items[0] ? `; latest: “${t.news.items[0].title}” (${t.news.items[0].source})` : ''}.`] : []),
            ...t.observances.map((o) => `${o.name}: in ${o.daysAway} day${o.daysAway === 1 ? '' : 's'}${o.relevant ? ' — relevant to this post' : ''}.`),
            ...t.failed.map((f) => `Could not check ${f.provider}: ${f.reason}.`),
          ],
          decision: rising.length
            ? `Frame it as timely — public interest in ${rising.map((s) => s.title).join(' and ')} is rising.`
            : 'No rising interest to lean on — lead with the finding itself.',
          confidence: t.interest?.length ? 'medium' : 'low',
          sources: [
            ...(t.interest ?? []).map((s) => ({ kind: 'wikipedia' as const, label: `Wikipedia: ${s.title}`, url: s.url, note: s.recentAvg !== null && s.recentAvg < MIN_DAILY_VIEWS ? `~${s.recentAvg} views/day — too few to read` : s.changePct !== null ? `${s.changePct >= 0 ? '+' : ''}${s.changePct}% views this week` : undefined })),
            ...(t.news?.items ?? []).slice(0, 4).map((n) => ({ kind: 'news' as const, label: `${n.source}: ${n.title}`, url: n.url, note: n.publishedAt ? new Date(n.publishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : undefined })),
            ...(hook ? [{ kind: 'calendar' as const, label: hook.name, note: new Date(hook.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' }) }] : []),
          ],
          warning: t.failed.length > 0,
        };
        /* An occasion chosen on Basic is decided: 'none' means none, a name
         * means that one. Only when it was left to the agent does it ask. */
        const preset = p.basics?.hook ?? null;
        if (preset === 'none') ctx.decisions.useHook = null;
        else if (preset) ctx.decisions.useHook = preset;
        if (preset) step.reasoning.push(preset === 'none' ? 'You chose no occasion on Basic.' : `You chose to tie it to ${preset} on Basic.`);
        const q: Question | undefined = hook && !preset ? {
          prompt: `${hook.name} is in ${hook.daysAway} day${hook.daysAway === 1 ? '' : 's'}. Tie this post to it?`,
          why: 'It fits the subject, but whether an official account marks the day is an editorial call, not mine.',
          options: ['Yes, mention it', 'No, keep it general'],
        } : undefined;
        await finish(step, q, (ans) => { ctx.decisions.useHook = ans.option.startsWith('Yes') && hook ? hook.name : null; });
        continue;
      }

      /* ── sources ───────────────────────────────────────────────────── */
      if (id === 'sources') {
        const record = a.archive?.record ?? null;
        void record;
        const terms = terms0;
        // Papers were searched by subject ("Antarctic ice sheet"), not by
        // station — a station search returns whatever else happened there.
        const paperQuery = paperQuery0;
        try {
          const s = await unwrap(pre.sources);
          const { onTopic, rejected } = onTopicPapers(s.papers ?? [], terms);
          // Only on-topic papers ever reach the writer.
          ctx.research.sources = { ...s, papers: onTopic };
          const top = onTopic[0];
          await finish({
            id, title: RUNNING.sources,
            looked: [
              ...(s.background ?? []).map((b) => `Wikipedia summary: ${b.title}`),
              `OpenAlex scholarly search: “${paperQuery ?? terms.join(' ')}”`,
            ],
            reasoning: [
              'Background is given to the writer to check its claims against — not as licence to add facts the brief does not contain.',
              ...onTopic.slice(0, 3).map((pp) => `On the subject: ${pp.firstAuthor ?? 'Unknown'}${pp.authors > 1 ? ' et al.' : ''} (${pp.year ?? 'n.d.'}), ${pp.venue ?? 'journal'} — cited ${pp.citedBy} times.`),
              ...rejected.slice(0, 3).map((pp) => `Rejected as off-topic (same place, different subject): “${excerpt(pp.title, 90)}”.`),
              ...s.failed.map((f) => `Could not check ${f.provider}: ${f.reason}.`),
            ],
            decision: top
              ? `Offer “${excerpt(top.title, 80)}” as further reading on LinkedIn, by its DOI.`
              : rejected.length
                ? `Found ${rejected.length} paper${rejected.length === 1 ? '' : 's'}, none on this post’s subject — offering none rather than a loosely related one.`
                : 'No paper to point to — the archive record stays the only citation.',
            confidence: top ? 'medium' : 'low',
            sources: [
              ...(s.background ?? []).map((b) => ({ kind: 'wikipedia' as const, label: `Wikipedia: ${b.title}`, url: b.url, note: 'Background' })),
              ...onTopic.slice(0, 3).map((pp) => ({ kind: 'paper' as const, label: `${pp.title} (${pp.year ?? 'n.d.'})`, url: pp.doi, note: `${pp.citedBy} citations` })),
            ],
            warning: s.failed.length > 0,
          });
        } catch (err) {
          await finish({
            id, title: RUNNING.sources, looked: ['Wikipedia, OpenAlex'],
            reasoning: [`Could not reach them: ${err instanceof Error ? err.message : String(err)}.`],
            decision: 'Write from the brief and the archive only.',
            confidence: 'low', sources: [], warning: true,
          });
        }
        continue;
      }

      /* ── references ────────────────────────────────────────────────── */
      if (id === 'references') {
        try {
          const r = await unwrap(pre.refs);
          setSearch(r);
          ctx.refs = r.results;
          /* Asked to find the photograph: only an open licence an official
           * account can put text over, and only one large enough to post. */
          const wantPhoto = p.basics?.imageSource !== 'upload' && !p.hasImage;
          // On the subject, or at least in the polar setting — never a
          // good-looking photograph of something else.
          const setting = ['antarctic', 'maitri', 'bharati', 'himadri', 'polar', 'arctic', 'glacier', 'iceberg', ...(p.station ? [p.station] : [])];
          const picked = wantPhoto ? pickPhoto(r.results, [...subjectWords(terms0), ...setting]) : null;
          if (picked) ctx.decisions.photo = picked.photo;
          await finish({
            id, title: RUNNING.references,
            looked: r.searched.map((s) => `“${s.query}” → ${s.count} result${s.count === 1 ? '' : 's'}`),
            reasoning: [
              'Queries were built from the subject, the content type and station, not from the raw brief.',
              ...(r.unavailable.length ? [`Not searched: ${r.unavailable.map((u) => u.provider).join(', ')} — ${r.unavailable[0].reason}.`] : []),
              ...(wantPhoto ? [
                'There is no photograph, so the agent looked for one. Only public-domain, CC0, CC BY and CC BY-SA images qualify — never NC, ND or unknown licences, since text is laid over it and this is an official account.',
                picked ? picked.why : 'None of the results was on the subject, under a usable licence, and at a size worth posting (600 px on the short side at least).',
                ...(picked ? [`It will be credited in every caption: ${photoCredit(picked.photo)}.`] : []),
              ] : []),
            ],
            decision: picked
              ? `Use “${excerpt(picked.photo.title, 70)}” as the post's photograph, credited.`
              : wantPhoto
                ? 'No usable photograph found — add one before submitting, or Instagram cannot post.'
                : r.results.length ? `Show ${r.results.length} references from ${r.answered.join(', ')} — for layout only, never reused without checking the licence.` : 'No references found.',
            confidence: picked ? 'medium' : wantPhoto ? 'low' : r.results.length ? 'medium' : 'low',
            warning: wantPhoto && !picked,
            sources: [
              ...(picked ? [{ kind: 'image' as const, label: `Photograph: ${excerpt(picked.photo.title, 60)}`, url: picked.photo.pageUrl, note: `${picked.photo.license} · ${picked.photo.width}×${picked.photo.height}` }] : []),
              ...r.results.filter((x) => x !== picked?.photo).slice(0, 6).map((x) => ({ kind: 'image' as const, label: `${x.provider}: ${excerpt(x.title, 60)}`, url: x.pageUrl, note: x.license })),
            ],
          });
        } catch (err) {
          await finish({
            id, title: RUNNING.references, looked: ['Openverse, Wikimedia Commons, NASA'],
            reasoning: [String(err instanceof Error ? err.message : err)],
            decision: 'Continue without references.', confidence: 'low', sources: [], warning: true,
          });
        }
        continue;
      }

      /* ── writing ───────────────────────────────────────────────────── */
      if (id === 'writing') {
        const research: Research = { ...ctx.research };
        if (research.trends) {
          // Only the observance the publisher agreed to reaches the writer.
          research.trends = {
            ...research.trends,
            observances: research.trends.observances.filter((o) => o.name === ctx.decisions.useHook),
          };
        }
        const going = ctx.analysis.platforms.filter((x) => !(ctx.decisions.dropInstagram && (x === 'instagram' || x === 'story')));
        hashtags = hashtagPlan({
          platforms: going, station: p.station, activity: p.activity, terms: terms0,
          hook: ctx.decisions.useHook, winning: ctx.research.performance?.winningHashtags,
          stationTags: HASHTAG_BY_STATION, activityTags: HASHTAG_BY_ACTIVITY,
        });
        slot = recommendSlot({
          now: Date.now(),
          hook: ctx.research.trends?.observances.find((o) => o.name === ctx.decisions.useHook) ?? null,
          bestDay: ctx.research.reach?.platforms.find((x) => x.bestDay)?.bestDay?.day ?? null,
        });
        try {
          writerInput = { analysis: ctx.analysis, research, decisions: ctx.decisions, plan: { hashtags, slot } };
          const out = await p.runWriting(writerInput);
          instructions = out.instructions;
          generated = out.generated;
          drafts = out.variants;
          linked = out.linked;
          await finish({
            id, title: RUNNING.writing,
            looked: ['The brief', 'Every decision above, compiled into the instructions shown in the record'],
            reasoning: [
              'Told to add no fact beyond the brief, the archive record and the listed background.',
              'Headlines were given as context only, never as a source of facts.',
              ...Object.entries(hashtags).map(([pl, tags]) => `${pl} hashtags: ${tags.join(' ') || 'none'}.`),
              `Suggested posting time: ${slot.label} — ${slot.reason}`,
              ...(out.generated ? [] : ['The generator was unavailable, so the offline draft was used.']),
            ],
            decision: 'Three options written. Read them before submitting — a generator can still get details wrong.',
            confidence: out.generated ? 'medium' : 'low',
            sources: [{ kind: 'model', label: out.generated ? 'Gemini 2.5 Flash' : 'Offline draft (no model)' }],
            warning: !out.generated,
          });
        } catch (err) {
          setFailed(err instanceof Error ? err.message : 'The generator could not be reached.');
          return;
        }
        continue;
      }

      /* ── alignment: the drafts against the requirements ────────────── */
      if (id === 'alignment') {
        const req = p.requirements ?? null;
        const going = ctx.analysis.platforms.filter((x) => !(ctx.decisions.dropInstagram && (x === 'instagram' || x === 'story')));
        const check = (): AlignCheck[] => checkAlignment({
          drafts, platforms: going,
          dropped: ctx.decisions.dropInstagram
            ? [{ platform: 'instagram', why: 'you dropped it: no photograph' }, { platform: 'story', why: 'you dropped it: no photograph' }]
            : [],
          request: req, basics: p.basics,
          audience: ctx.analysis.audience, tone: ctx.analysis.tone,
          hook: ctx.decisions.useHook, hashtags, slot, linked, observerName: p.observerName,
          photoCredit: ctx.decisions.photo ? photoCredit(ctx.decisions.photo) : null,
        });
        let checks = check();
        const reasoning: string[] = [];
        let asked: TraceQuestion | undefined;
        const put = async (q: Question): Promise<string> => {
          const a = await ask(q);
          const record: TraceQuestion = { prompt: q.prompt, why: q.why, options: q.options, answer: a.option };
          if (!asked) asked = record;
          else reasoning.push(`Also asked: ${q.prompt} You answered: ${a.option}.`);
          return a.option;
        };

        /* A posting time after the admin's deadline is a conflict between
         * two good reasons (the observance, the deadline) — theirs to settle. */
        const late = checks.find((c) => c.id === 'deadline' && c.status === 'missed');
        if (late && req?.deadline && slot && !cancelled.current) {
          const byDeadline = slotByDeadline(req.deadline, Date.now());
          const keep = `Keep ${slot.label}`;
          const answer = await put({
            prompt: `The best time to post is ${slot.label}, but ${req.requestedByName} needs it by ${new Date(req.deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}. Which should win?`,
            why: `${slot.reason} The admin's deadline is a requirement too, and the two conflict.`,
            options: [`Post by the deadline — ${byDeadline.label}`, keep],
          });
          if (answer !== keep) slot = byDeadline;
          reasoning.push(answer === keep ? 'Kept the suggested time; the admin will see it is after their deadline.' : `Moved the suggested time to ${byDeadline.label}, inside the deadline.`);
          checks = check();
        }

        /* Misses in the words themselves can be fixed by one more pass of
         * the writer, told exactly what was missed. Only ever one: a second
         * miss is shown, not chased. */
        const fixes = corrections(checks);
        if (fixes.length && generated && writerInput && !cancelled.current) {
          const rewrite = 'Rewrite to fix them';
          const answer = await put({
            prompt: `${fixes.length} requirement${fixes.length === 1 ? ' was' : 's were'} not fully met in the drafts. Rewrite them?`,
            why: fixes.map((f) => f.split(' — ')[0]).join('; ') + '. A rewrite takes a few seconds and is checked again.',
            options: [rewrite, 'Keep them — I’ll fix it in Refine'],
          });
          if (answer === rewrite) {
            const before = checks;
            try {
              const out = await p.runWriting({ ...writerInput, plan: { hashtags, slot: slot ?? writerInput.plan.slot }, fixes });
              instructions = out.instructions; generated = out.generated; drafts = out.variants; linked = out.linked;
              checks = check();
              const fixed = before.filter((c) => (c.status === 'missed' || c.status === 'partial') && checks.find((x) => x.id === c.id)?.status === 'met');
              reasoning.push(`Rewrote the drafts with the misses spelled out. Fixed: ${fixed.map((c) => c.requirement).join('; ') || 'none'}.`);
            } catch {
              reasoning.push('The rewrite failed; the first drafts are kept.');
            }
          }
        }

        const sum = summarise(checks);
        const fromReq = checks.filter((c) => c.from === 'admin').length;
        await finish({
          id, title: RUNNING.alignment,
          looked: [
            `${drafts.length} drafts, on ${going.join(', ') || 'no platforms'}`,
            ...(req ? [`${req.requestedByName}'s post request — ${fromReq} requirements`] : ['No admin request for this post']),
            ...(p.basics && Object.values(p.basics).some((v) => v) ? ['Your Basic answers'] : []),
            'Each platform’s length limit and the hashtag plan',
          ],
          reasoning: [
            'Checked by rule against the actual captions — the writer was not asked whether it complied.',
            ...reasoning,
          ],
          decision: `${sum.met} of ${checks.length} requirements met` +
            (sum.partial ? ` · ${sum.partial} partly` : '') +
            (sum.missed ? ` · ${sum.missed} missed` : '') +
            (sum.review ? ` · ${sum.review} for a person to judge` : '') + '.',
          confidence: sum.missed ? 'low' : sum.partial ? 'medium' : 'high',
          sources: req ? [{ kind: 'brief', label: `Post request from ${req.requestedByName}` }] : [{ kind: 'brief', label: 'Publisher’s brief' }],
          warning: sum.missed > 0,
          checks,
          ...(asked ? { asked } : {}),
        });
        continue;
      }
    }

    if (cancelled.current) return;
    setCurrent(null);
    latest.current.onComplete({
      refs: ctx.refs,
      analysis: ctx.analysis,
      decisions: ctx.decisions,
      trace: {
        startedAt, finishedAt: Date.now(), steps: trace, instructions, generated,
        ...(slot ? { recommendation: slot } : {}),
        hashtags,
        model: generated ? 'gemini-2.5-flash' : 'offline draft',
      },
    });
    // Everything reactive is read through `latest`; the run starts once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    /* Re-armed on entry so StrictMode's mount → unmount → remount in dev
     * doesn't leave the run cancelled; a real unmount still stops it. */
    cancelled.current = false;
    if (!started.current) {
      started.current = true;
      void run();
    }
    return () => { cancelled.current = true; };
  }, [run]);

  const isSearching = current === 'references';

  return (
    <div className="agent">
      <div className="agent-head">
        <span className="agent-badge">
          {question ? <HelpCircle size={13} strokeWidth={2.5} /> : <Loader2 size={13} strokeWidth={2.5} className="agent-spin" />}
          {question ? 'Agent needs your input' : 'Agent working'}
        </span>
        <span className="agent-progress">{done.length} of {ORDER.length}</span>
        {onCancel && (
          <button type="button" className="agent-cancel" onClick={() => { cancelled.current = true; onCancel(); }}>
            Stop
          </button>
        )}
      </div>

      {/* Across, not down: finished steps are cards in a grid that fills the
          width, and the side column holds whatever needs attention now — the
          question, what the agent is looking at, or what it is doing. */}
      <div className="agent-body">
      <ol className="agent-steps">
        {done.map((step) => <DoneStep key={step.id} step={step} />)}

        {current && !question && (
          <li className="agent-step is-running" aria-live="polite">
            <span className="agent-step-mark"><Loader2 size={12} strokeWidth={2.5} className="agent-spin" /></span>
            <div className="agent-step-body">
              <span className="agent-step-label agent-step-label--live">
                <DecryptedText text={RUNNING[current]} speed={30} sequential className="agent-char" encryptedClassName="agent-char-enc" />
              </span>
            </div>
          </li>
        )}
      </ol>

      <div className="agent-side">
      {!question && !isSearching && current && (
        <div className="agent-now">
          <span className="agent-now-label">Now</span>
          <strong>{RUNNING[current]}</strong>
          <span className="agent-now-bar"><span style={{ width: `${Math.round((done.length / ORDER.length) * 100)}%` }} /></span>
          <span className="agent-now-sub">Step {done.length + 1} of {ORDER.length}. It stops and asks here if it is unsure.</span>
        </div>
      )}

      {question && (
        <div className="agent-ask" role="dialog" aria-labelledby="agent-ask-q">
          <div className="agent-ask-head"><HelpCircle size={15} strokeWidth={2.5} /> The agent is asking</div>
          <p id="agent-ask-q" className="agent-ask-q">{question.prompt}</p>
          <p className="agent-ask-why"><strong>Why I’m asking:</strong> {question.why}</p>
          {question.text && (
            <textarea
              className="agent-ask-text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={question.text.placeholder}
              rows={2}
            />
          )}
          <div className="agent-ask-options">
            {question.options.map((o, i) => (
              <button
                key={o}
                type="button"
                className={'agent-ask-opt' + (i === 0 ? ' is-primary' : '')}
                disabled={!!question.text && i === 0 && !draft.trim()}
                onClick={() => answerRef.current?.({ option: o, ...(question.text && i === 0 ? { text: draft } : {}) })}
              >
                {o}
              </button>
            ))}
          </div>
        </div>
      )}

      {isSearching && (
        <div className="agent-vision">
          <div className="agent-vision-head">
            <Search size={12} strokeWidth={2.5} />
            <span>What the agent is seeing</span>
            {search?.answered.length ? <span className="agent-vision-src">{search.answered.join(' · ')}</span> : null}
          </div>
          <ul className="agent-queries">
            {initial.queries.map((q) => {
              const r = search?.searched.find((s) => s.query === q);
              return (
                <li key={q} className={r ? 'is-done' : 'is-pending'}>
                  <span className="agent-query-q">{q}</span>
                  <span className="agent-query-n">{r ? `${r.count} found` : 'searching…'}</span>
                </li>
              );
            })}
          </ul>
          {search?.results.length ? (
            <div className="agent-thumbs">
              {search.results.slice(0, 14).map((r) => (
                <figure key={r.id} className="agent-thumb" title={`${r.title} — ${r.license}`}>
                  <img src={r.thumbUrl ?? ''} alt="" loading="lazy" />
                  <figcaption><span className="agent-thumb-src">{r.provider}</span></figcaption>
                </figure>
              ))}
            </div>
          ) : (
            <div className="agent-thumbs is-empty"><ImageIcon size={16} strokeWidth={2} /><span>Waiting for the first results…</span></div>
          )}
        </div>
      )}

      {failed && <p className="agent-failed"><AlertTriangle size={13} strokeWidth={2.5} /> {failed}</p>}
      </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════ a settled step ══ */

const CONF_LABEL: Record<Confidence, string> = { high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence' };

export function SourceChip({ s }: { s: TraceSource }) {
  const body = (
    <>
      <span className={`agent-src-kind kind-${s.kind}`}>{s.kind}</span>
      <span className="agent-src-label">{s.label}</span>
      {s.note && <span className="agent-src-note">{s.note}</span>}
      {s.url && <ExternalLink size={10} strokeWidth={2.5} />}
    </>
  );
  return s.url
    ? <a className="agent-src" href={s.url} target="_blank" rel="noreferrer">{body}</a>
    : <span className="agent-src">{body}</span>;
}

/** Requirement-by-requirement verdicts, grouped by where each came from. */
export function CheckList({ checks }: { checks: TraceCheck[] }) {
  const groups: [TraceCheck['from'], string][] = [['admin', 'From the admin'], ['basic', 'From Basic'], ['platform', 'Platform rules']];
  const mark = { met: '✓', partial: '◐', missed: '✗', review: '?' } as const;
  return (
    <div className="agent-checks">
      {groups.map(([from, label]) => {
        const rows = checks.filter((c) => c.from === from);
        if (!rows.length) return null;
        return (
          <div key={from} className="agent-checks-group">
            <span className="agent-why-label">{label}</span>
            <ul>
              {rows.map((c) => (
                <li key={c.id} className={`chk-${c.status}`} title={c.detail}>
                  <span className="agent-check-mark" aria-label={c.status}>{mark[c.status]}</span>
                  <span className="agent-check-req">{c.requirement}</span>
                  <span className="agent-check-detail">{c.detail}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function DoneStep({ step }: { step: TraceStep }) {
  const Icon = ICONS[step.id as StepId] ?? Search;
  return (
    <li className={'agent-step is-done' + (step.warning ? ' is-warning' : '') + (step.checks ? ' agent-step--wide' : '')}>
      <span className="agent-step-mark">
        {step.warning ? <AlertTriangle size={12} strokeWidth={2.5} /> : <Check size={12} strokeWidth={3} />}
      </span>
      <div className="agent-step-body">
        <span className="agent-step-label">
          <Icon size={12} strokeWidth={2.5} /> {step.title}
          <span className={`agent-conf conf-${step.confidence}`}>{CONF_LABEL[step.confidence]}</span>
        </span>
        <strong className="agent-step-result">{step.decision}</strong>

        {step.checks && <CheckList checks={step.checks} />}

        {step.asked && (
          <div className="agent-asked">
            <span><HelpCircle size={11} strokeWidth={2.5} /> Asked: {step.asked.prompt}</span>
            <span className="agent-asked-a">You answered: <b>{step.asked.answer}</b>{step.asked.text ? ` — “${step.asked.text}”` : ''}</span>
          </div>
        )}

        <details className="agent-why">
          <summary>Why — sources and reasoning</summary>
          {step.looked.length > 0 && (
            <div className="agent-why-block">
              <span className="agent-why-label">Looked at</span>
              <ul>{step.looked.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          )}
          {step.reasoning.length > 0 && (
            <div className="agent-why-block">
              <span className="agent-why-label">Reasoning</span>
              <ul>{step.reasoning.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          )}
        </details>

        {step.sources.length > 0 && (
          <div className="agent-srcs">{step.sources.map((s, i) => <SourceChip key={i} s={s} />)}</div>
        )}
      </div>
    </li>
  );
}
