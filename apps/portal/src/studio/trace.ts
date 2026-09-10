/**
 * The agent's account of itself — what it looked at, how it reasoned, what
 * it decided, where it was unsure and what it asked.
 *
 * A post the agent helped write is reviewed by an admin who did not watch
 * it being made. Without this, they see three finished captions and have to
 * take their basis on trust. With it, every choice has its evidence beside
 * it: the archive record the facts came from, the analytics that set the
 * audience, the headlines that made it timely, the paper it cites — each
 * linked — and every point where the agent stopped to ask the publisher
 * instead of guessing.
 *
 * Stored on the dispatch as `agentTrace` when the post is submitted, and
 * rendered in the approve desk by TraceView. The exact instructions the
 * model was given are kept too, so "why did it say that?" always has an
 * answer that is not "the AI decided".
 *
 * Firestore-shaped: arrays of objects, never arrays of arrays, and no
 * undefined values (see toStoredTrace).
 */

export type Confidence = 'high' | 'medium' | 'low';

export type SourceKind =
  | 'brief' | 'archive' | 'analytics' | 'queue' | 'wikipedia'
  | 'news' | 'paper' | 'calendar' | 'image' | 'model';

export interface TraceSource {
  kind: SourceKind;
  label: string;
  url?: string;
  /** One line on what this source contributed. */
  note?: string;
}

export interface TraceQuestion {
  prompt: string;
  /** Why the agent could not decide on its own. */
  why: string;
  options: string[];
  answer: string;
  /** Free text the publisher typed, when the question allowed it. */
  text?: string;
}

export interface TraceStep {
  id: string;
  title: string;
  /** What it examined. */
  looked: string[];
  /** How it got from what it looked at to the decision. */
  reasoning: string[];
  /** What it will do because of this step. */
  decision: string;
  confidence: Confidence;
  sources: TraceSource[];
  /** Set when this step stopped for the publisher. */
  asked?: TraceQuestion;
  /** Something the reviewer should look at, not just a finding. */
  warning?: boolean;
}

export interface AgentTrace {
  startedAt: number;
  finishedAt: number;
  steps: TraceStep[];
  /** The direction block the writer received, verbatim. */
  instructions: string;
  /** False when the writer was unavailable and the offline draft was used. */
  generated: boolean;
  model: string;
}

/** Strips undefined (Firestore rejects it) and caps sizes, so a trace can
 *  never be the reason a submission fails to save. */
export function toStoredTrace(t: AgentTrace): AgentTrace {
  const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  const trimmed: AgentTrace = {
    ...t,
    instructions: clip(t.instructions, 8000),
    steps: t.steps.slice(0, 30).map((s) => ({
      ...s,
      looked: s.looked.slice(0, 12).map((x) => clip(x, 300)),
      reasoning: s.reasoning.slice(0, 12).map((x) => clip(x, 400)),
      decision: clip(s.decision, 300),
      sources: s.sources.slice(0, 16).map((src) => ({ ...src, label: clip(src.label, 200) })),
    })),
  };
  return JSON.parse(JSON.stringify(trimmed));
}
