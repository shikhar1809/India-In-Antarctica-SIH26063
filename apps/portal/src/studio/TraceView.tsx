/**
 * The agent's record of a post, read back — in the studio once the options
 * are written, and in the approve desk for the admin deciding whether it
 * goes out.
 *
 * Leads with the three things a reviewer asks first: where the facts came
 * from (every source, linked), where the agent was unsure and what the
 * publisher told it, and what each step decided. The step-by-step
 * reasoning and the exact instructions the writer received sit one click
 * below, for when a caption needs explaining.
 */

import { AlertTriangle, CheckCircle2, HelpCircle, ScrollText } from 'lucide-react';
import { SourceChip } from './AgentThinking';
import type { AgentTrace, TraceSource } from './trace';

const KIND_ORDER: TraceSource['kind'][] = ['archive', 'paper', 'wikipedia', 'news', 'analytics', 'queue', 'calendar', 'image', 'brief', 'model'];

export function TraceView({ trace, audience = 'publisher' }: { trace: AgentTrace; audience?: 'publisher' | 'admin' }) {
  const sources = new Map<string, TraceSource>();
  for (const s of trace.steps.flatMap((st) => st.sources)) {
    const key = s.url ?? `${s.kind}:${s.label}`;
    if (!sources.has(key)) sources.set(key, s);
  }
  const ordered = [...sources.values()].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  const asked = trace.steps.filter((s) => s.asked);
  const warnings = trace.steps.filter((s) => s.warning);
  const lows = trace.steps.filter((s) => s.confidence === 'low' && !s.asked);
  const secs = Math.max(1, Math.round((trace.finishedAt - trace.startedAt) / 1000));

  return (
    <div className="trace">
      <div className="trace-head">
        <ScrollText size={14} strokeWidth={2.5} />
        <strong>{audience === 'admin' ? 'How the agent made this post' : 'How the agent got here'}</strong>
        <span className="trace-meta">
          {trace.steps.length} steps · {secs}s · {trace.generated ? trace.model : 'offline draft — no model used'}
        </span>
      </div>

      <div className="trace-summary">
        <span className={asked.length ? 'is-asked' : ''}><HelpCircle size={12} /> {asked.length} question{asked.length === 1 ? '' : 's'} put to the publisher</span>
        <span className={lows.length ? 'is-low' : ''}><AlertTriangle size={12} /> {lows.length} low-confidence step{lows.length === 1 ? '' : 's'}</span>
        <span>{ordered.length} source{ordered.length === 1 ? '' : 's'} consulted</span>
        {warnings.length > 0 && <span className="is-low">{warnings.length} step{warnings.length === 1 ? '' : 's'} with something to check</span>}
      </div>

      {asked.length > 0 && (
        <div className="trace-block">
          <span className="trace-label">Where it asked instead of guessing</span>
          <ul className="trace-asked">
            {asked.map((s) => (
              <li key={s.id}>
                <span className="trace-q">{s.asked!.prompt}</span>
                <span className="trace-why">{s.asked!.why}</span>
                <span className="trace-a">Publisher answered: <b>{s.asked!.answer}</b>{s.asked!.text ? ` — “${s.asked!.text}”` : ''}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="trace-block">
        <span className="trace-label">Sources it went to</span>
        <div className="agent-srcs">{ordered.map((s, i) => <SourceChip key={i} s={s} />)}</div>
      </div>

      <div className="trace-block">
        <span className="trace-label">Decisions, step by step</span>
        <ol className="trace-steps">
          {trace.steps.map((s) => (
            <li key={s.id} className={`conf-${s.confidence}` + (s.warning ? ' is-warning' : '')}>
              <details>
                <summary>
                  {s.warning ? <AlertTriangle size={12} /> : <CheckCircle2 size={12} />}
                  <span className="trace-step-title">{s.title}</span>
                  <span className="trace-step-decision">{s.decision}</span>
                  <span className={`agent-conf conf-${s.confidence}`}>{s.confidence}</span>
                </summary>
                <div className="trace-step-body">
                  {s.looked.length > 0 && (<><span className="agent-why-label">Looked at</span><ul>{s.looked.map((x, i) => <li key={i}>{x}</li>)}</ul></>)}
                  {s.reasoning.length > 0 && (<><span className="agent-why-label">Reasoning</span><ul>{s.reasoning.map((x, i) => <li key={i}>{x}</li>)}</ul></>)}
                </div>
              </details>
            </li>
          ))}
        </ol>
      </div>

      {trace.instructions && (
        <details className="trace-block trace-instructions">
          <summary>Exact instructions the writer was given</summary>
          <pre>{trace.instructions}</pre>
        </details>
      )}
    </div>
  );
}
