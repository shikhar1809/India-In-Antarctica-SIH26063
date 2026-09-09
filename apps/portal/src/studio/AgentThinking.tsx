/**
 * The agent working, made visible.
 *
 * A publisher clicks "generate" and waits. What they wait through used to be
 * a spinner and the word "Writing…", which tells them nothing about whether
 * the thing understood the brief — so the first sign of a misunderstanding
 * was three wrong options at the end.
 *
 * This runs the same work as a sequence of named steps, each showing what it
 * actually concluded: the content type it decided on and the words that
 * decided it, the archive record it found, the platform constraints it is
 * about to write against, the past posts it measured. The publisher can see
 * a wrong inference at step two instead of at the end, and every step's
 * result is real — see agent.ts, which computes all of it.
 *
 * The reference search is the one step that reaches the open web, so it gets
 * its own panel: the queries as they are issued, which providers answered,
 * and the thumbnails as they arrive. Watching what the agent looked at is
 * the difference between "it found references" and a claim you can check.
 *
 * PACING. Steps hold for a beat after their work finishes. That is
 * deliberate and it is not padding for its own sake: the analysis steps
 * complete in single-digit milliseconds, and a column of eight results
 * appearing simultaneously reads as a page load rather than as reasoning
 * anyone could follow. The dwell gives a reader time to actually read each
 * conclusion, which is the entire point of showing them. STEP_DWELL_MS is
 * the one number to change if the pacing feels wrong.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle, Archive, Check, Globe, Image as ImageIcon, Layers,
  Loader2, PenLine, Search, Sparkles, Target, Users,
} from 'lucide-react';

import { DecryptedText } from './DecryptedText';
import type { BriefAnalysis } from './agent';
import type { StyleReference, ReferenceSearchRun } from './references';
import './AgentThinking.css';

/** How long a step stays on screen after its work is done. See the module
 *  note on pacing — this is the tuning knob. */
const STEP_DWELL_MS = 1150;

export type StepId =
  | 'brief' | 'archive' | 'audience' | 'tone'
  | 'platforms' | 'history' | 'references' | 'writing';

export interface AgentStep {
  id: StepId;
  /** Present tense — this is what shows while the step is running. */
  running: string;
  /** What it concluded, shown once the step is done. */
  result: string;
  /** Supporting detail: the evidence, the numbers, the gaps. */
  detail?: string[];
  /** Something the publisher should look at rather than a finding. */
  warning?: boolean;
}

const ICONS: Record<StepId, typeof Search> = {
  brief: PenLine,
  archive: Archive,
  audience: Users,
  tone: Target,
  platforms: Layers,
  history: Sparkles,
  references: Globe,
  writing: PenLine,
};

/**
 * Turns the analysis into the steps the publisher watches.
 *
 * Every `result` string here is built from a value that was computed, not
 * from a template with the word "done" in it. Where the agent has low
 * confidence it says so, because a confident-sounding wrong classification
 * is worse than an uncertain right one.
 */
export function stepsFor(analysis: BriefAnalysis): AgentStep[] {
  const { classification, archive, bestPractice, requirements, gaps } = analysis;

  const steps: AgentStep[] = [];

  steps.push({
    id: 'brief',
    running: 'Reading the brief',
    result: `${classification.type.label} — ${classification.confidence} confidence`,
    detail: [
      classification.type.blurb,
      ...(classification.evidence.length
        ? [`Decided on: ${classification.evidence.map((e) => `“${e}”`).join(', ')}`]
        : ['No strong signal in the wording — treating it as the default for a field dispatch.']),
    ],
  });

  steps.push(
    archive
      ? {
          id: 'archive',
          running: 'Searching the archive for a matching record',
          result: `Found ${archive.record.title}`,
          detail: [
            archive.how === 'identifier'
              ? `Matched the identifier ${archive.matched} written in the brief.`
              : archive.how === 'title'
                ? `The brief quotes this record's title.`
                : `Matched on: ${archive.matched}.`,
            'Its published facts have been added to the brief, and its permanent link will be appended to the captions.',
          ],
        }
      : {
          id: 'archive',
          running: 'Searching the archive for a matching record',
          result: 'No published record referenced',
          detail: ['Writing from the field report alone. Pull one in from the knowledge base if this post is about something already published.'],
        },
  );

  steps.push({
    id: 'audience',
    running: 'Working out who this is for',
    result: analysis.audienceChosen
      ? `${analysis.audience} — as you chose`
      : `${analysis.audience} — inferred from the content type`,
    detail: [
      analysis.audienceChosen
        ? 'Your choice, left alone.'
        : `A ${classification.type.label.toLowerCase()} is usually written for this audience. Change it on the brief if that is wrong.`,
    ],
  });

  steps.push({
    id: 'tone',
    running: 'Matching the tone to the audience',
    result: analysis.toneChosen ? `${analysis.tone} — as you chose` : `${analysis.tone} — inferred`,
    detail: [classification.type.direction],
  });

  steps.push({
    id: 'platforms',
    running: 'Reading what each platform demands',
    result: requirements.length
      ? requirements.map((r) => r.label).join(', ')
      : 'No platform selected',
    detail: [
      ...requirements.map((r) => `${r.label}: ${r.demands} Hashtags ${r.hashtags.note}.`),
      ...gaps,
    ],
    warning: gaps.length > 0,
  });

  steps.push({
    id: 'history',
    running: 'Learning from posts already sent',
    result: bestPractice.sampleSize
      ? `Measured ${bestPractice.sampleSize} previous post${bestPractice.sampleSize === 1 ? '' : 's'}`
      : 'No previous posts to learn from',
    detail: [
      ...bestPractice.notes,
      ...(bestPractice.hashtags.length
        ? [`Hashtags already in use: ${bestPractice.hashtags.slice(0, 5).map((h) => h.tag).join(' ')}`]
        : []),
    ],
  });

  steps.push({
    id: 'references',
    running: 'Searching the web for visual references',
    result: '',
    detail: [],
  });

  steps.push({
    id: 'writing',
    running: 'Writing three options',
    result: '',
    detail: [],
  });

  return steps;
}

/* ═══════════════════════════════════════════════════════════ component ══ */

export interface AgentThinkingProps {
  analysis: BriefAnalysis;
  /** Runs the reference search. Separated so the component stays a view and
   *  the network lives in references.ts. */
  runReferences: (queries: string[], onPartial: (run: ReferenceSearchRun) => void) => Promise<ReferenceSearchRun>;
  /** Runs the copy generation. Resolves when the three options exist. */
  runWriting: () => Promise<void>;
  onComplete: (refs: StyleReference[]) => void;
  onCancel?: () => void;
}

export function AgentThinking({
  analysis, runReferences, runWriting, onComplete, onCancel,
}: AgentThinkingProps) {
  const [steps] = useState(() => stepsFor(analysis));
  const [current, setCurrent] = useState(0);
  const [done, setDone] = useState<AgentStep[]>([]);
  const [search, setSearch] = useState<ReferenceSearchRun | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  /* The pipeline is started once and never restarted by a re-render — a
   * second run would issue a second set of network calls and double-charge
   * the generator.
   *
   * The callbacks are held in a ref rather than in the effect's dependency
   * list, and that is not a style preference. Studio passes them as inline
   * arrows, so they get a new identity on every render; with them as
   * dependencies the effect tore down and re-ran continuously, and its
   * cleanup — which sets `cancelled` — killed the run a few milliseconds
   * after it started. The symptom was a pipeline that displayed step one
   * and then sat there forever. */
  const started = useRef(false);
  const cancelled = useRef(false);
  const callbacks = useRef({ runReferences, runWriting, onComplete });
  callbacks.current = { runReferences, runWriting, onComplete };

  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const run = useCallback(async () => {
    const collected: AgentStep[] = [];
    let references: StyleReference[] = [];

    for (let i = 0; i < steps.length; i++) {
      if (cancelled.current) return;
      setCurrent(i);
      const step = { ...steps[i] };

      if (step.id === 'references') {
        try {
          const result = await callbacks.current.runReferences(analysis.queries, (partial) => {
            if (!cancelled.current) setSearch(partial);
          });
          setSearch(result);
          references = result.results;
          step.result = result.results.length
            ? `${result.results.length} references from ${result.answered.join(', ')}`
            : 'No references found';
          step.detail = [
            ...result.searched.map((s) => `“${s.query}” → ${s.count} result${s.count === 1 ? '' : 's'}`),
            ...(result.unavailable.length
              ? [`Not searched: ${result.unavailable.map((u) => u.provider).join(', ')} — ${result.unavailable[0].reason}`]
              : []),
          ];
        } catch (err) {
          step.result = 'Reference search unavailable';
          step.detail = [String(err instanceof Error ? err.message : err)];
          step.warning = true;
        }
      } else if (step.id === 'writing') {
        try {
          await callbacks.current.runWriting();
          step.result = 'Three options ready';
          step.detail = ['Written against everything above. Read them before you submit — a generator can still get details wrong.'];
        } catch (err) {
          setFailed(err instanceof Error ? err.message : 'The generator could not be reached.');
          step.result = 'Could not write the options';
          step.warning = true;
          collected.push(step);
          setDone([...collected]);
          return;
        }
      } else {
        // The analysis steps are already computed; the dwell is what makes
        // them readable rather than a flash.
        await wait(120);
      }

      if (cancelled.current) return;
      await wait(STEP_DWELL_MS);
      collected.push(step);
      setDone([...collected]);
    }

    if (!cancelled.current) callbacks.current.onComplete(references);
    // `steps` is state initialised once and `analysis.queries` is fixed for
    // the life of a run, so this genuinely has no reactive dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    /* Clearing the flag on entry is what makes this survive StrictMode.
     * React deliberately mounts, unmounts and remounts every effect in
     * development; the unmount ran the cleanup below, which cancelled a run
     * that the remount then declined to restart because `started` was
     * already set. The result was a pipeline frozen on step one — in dev
     * only, which is the worst place for a bug to hide. Re-arming here lets
     * the still-running loop carry on, and a genuine unmount still stops it
     * because nothing re-arms afterwards. */
    cancelled.current = false;

    if (!started.current) {
      started.current = true;
      void run();
    }

    return () => { cancelled.current = true; };
  }, [run]);

  const active = current < steps.length ? steps[current] : null;
  const isSearching = active?.id === 'references';

  return (
    <div className="agent">
      <div className="agent-head">
        <span className="agent-badge">
          <Loader2 size={13} strokeWidth={2.5} className="agent-spin" />
          Agent working
        </span>
        <span className="agent-progress">{done.length} of {steps.length}</span>
        {onCancel && (
          <button type="button" className="agent-cancel" onClick={() => { cancelled.current = true; onCancel(); }}>
            Stop
          </button>
        )}
      </div>

      <ol className="agent-steps">
        {done.map((step) => {
          const Icon = ICONS[step.id];
          return (
            <li key={step.id} className={'agent-step is-done' + (step.warning ? ' is-warning' : '')}>
              <span className="agent-step-mark">
                {step.warning ? <AlertTriangle size={12} strokeWidth={2.5} /> : <Check size={12} strokeWidth={3} />}
              </span>
              <div className="agent-step-body">
                <span className="agent-step-label">
                  <Icon size={12} strokeWidth={2.5} /> {step.running}
                </span>
                <strong className="agent-step-result">{step.result}</strong>
                {step.detail?.length ? (
                  <ul className="agent-step-detail">
                    {step.detail.map((d, i) => <li key={i}>{d}</li>)}
                  </ul>
                ) : null}
              </div>
            </li>
          );
        })}

        {active && (
          <li className="agent-step is-running" aria-live="polite">
            <span className="agent-step-mark">
              <Loader2 size={12} strokeWidth={2.5} className="agent-spin" />
            </span>
            <div className="agent-step-body">
              <span className="agent-step-label agent-step-label--live">
                <DecryptedText
                  text={active.running}
                  speed={30}
                  sequential
                  className="agent-char"
                  encryptedClassName="agent-char-enc"
                />
              </span>
            </div>
          </li>
        )}
      </ol>

      {/* ── what the agent is looking at, while it looks ── */}
      {isSearching && (
        <div className="agent-vision">
          <div className="agent-vision-head">
            <Search size={12} strokeWidth={2.5} />
            <span>What the agent is seeing</span>
            {search?.answered.length ? (
              <span className="agent-vision-src">{search.answered.join(' · ')}</span>
            ) : null}
          </div>

          <ul className="agent-queries">
            {analysis.queries.map((q) => {
              const run = search?.searched.find((s) => s.query === q);
              return (
                <li key={q} className={run ? 'is-done' : 'is-pending'}>
                  <span className="agent-query-q">{q}</span>
                  <span className="agent-query-n">
                    {run ? `${run.count} found` : 'searching…'}
                  </span>
                </li>
              );
            })}
          </ul>

          {search?.results.length ? (
            <div className="agent-thumbs">
              {search.results.slice(0, 14).map((r) => (
                <figure key={r.id} className="agent-thumb" title={`${r.title} — ${r.license}`}>
                  <img src={r.thumbUrl ?? ''} alt="" loading="lazy" />
                  <figcaption>
                    <span className="agent-thumb-src">{r.provider}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
          ) : (
            <div className="agent-thumbs is-empty">
              <ImageIcon size={16} strokeWidth={2} />
              <span>Waiting for the first results…</span>
            </div>
          )}
        </div>
      )}

      {failed && (
        <p className="agent-failed">
          <AlertTriangle size={13} strokeWidth={2.5} /> {failed}
        </p>
      )}
    </div>
  );
}
