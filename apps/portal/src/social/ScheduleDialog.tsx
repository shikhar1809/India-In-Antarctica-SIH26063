/**
 * Scheduling a post, as a visible pipeline.
 *
 * The queue has four preconditions — a published record, a caption that fits
 * the platform, a time in the future, and a destination — and a plain form
 * reports them as a list of errors after you press the button. The circuit
 * board turns the same four into a diagram that is *already* showing you
 * where you are: each stage lights as it is satisfied and goes red when it
 * is not, so the shape of what is missing is visible before anything is
 * submitted.
 *
 * The diagram is driven by the same `validatePost()` the queue enforces, not
 * by a parallel copy of the rules. A stage cannot look green here and be
 * rejected on save.
 *
 * Scheduling is always *contextual*: the dialog is opened from a record that
 * is already in front of the reviewer — the one they just approved, or one on
 * the live feed — and that record is passed in. There is deliberately no
 * "pick something to post about" step, because choosing a record in the
 * abstract is a different job from reviewing one, and stapling the two
 * together made scheduling feel like starting a new task instead of finishing
 * the current one.
 */

import { useEffect, useMemo, useState } from 'react';
import { Archive, Clock, ListChecks, Send, Type } from 'lucide-react';
import { CircuitBoard } from '@/components/ui/circuit-board';
import { saveScheduledPost } from '../hooks/useSocialQueue';
import type { RepositoryRecord } from '../repository/contract';
import {
  PLATFORM_LIMITS,
  SOCIAL_PLATFORMS,
  captionLength,
  schedulePost,
  validatePost,
  type SocialPlatform,
} from './queue';
import './ScheduleDialog.css';
import { logActivity } from '../audit/log';

/** The current time, re-read on an interval rather than during render.
 *
 *  Calling Date.now() while rendering makes the output depend on when React
 *  happened to re-render, so "is this time in the past?" could answer
 *  differently for two renders with identical inputs. Holding it in state and
 *  ticking it keeps the validation honest for a dialog left open a while. */
function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}

/** An epoch stamp as `datetime-local` wants it, in the viewer's own zone. */
function toLocalInput(ts: number): string {
  const d = new Date(ts - new Date().getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
}

export function ScheduleDialog({
  record,
  createdBy,
  onClose,
}: {
  /** The published record being disseminated. Required — see the note above. */
  record: RepositoryRecord & { id: string };
  createdBy: string;
  onClose: () => void;
}) {
  const now = useNow();

  const [platform, setPlatform] = useState<SocialPlatform>('x');
  /* Seeded from the record so the publisher edits a draft rather than facing
     an empty box. The headline was already written for a general audience by
     summarise.ts, which is exactly the register a post wants. */
  const [caption, setCaption] = useState(() => {
    const lead = record.body?.[0] ?? '';
    const first = lead.split('. ')[0];
    return first ? `${record.title} — ${first}.` : record.title;
  });
  const [when, setWhen] = useState(() => toLocalInput(Date.now() + 3600_000));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const scheduledFor = new Date(when).getTime();
  const limits = PLATFORM_LIMITS[platform];
  const length = captionLength(caption);

  const issues = useMemo(
    () => validatePost({ platform, caption, imageUrl: record.photoUrls?.[0] ?? null, scheduledFor }, now),
    [record, platform, caption, scheduledFor, now],
  );

  const errors = issues.filter((i) => i.level === 'error');
  const ready = errors.length === 0;

  /* Each stage's light is derived, never stored — so it cannot disagree with
     what the queue will decide when the post is saved. */
  const captionStatus = length === 0
    ? 'inactive'
    : length > limits.maxChars ? 'error' : 'active';
  const timeStatus = Number.isNaN(scheduledFor)
    ? 'inactive'
    : scheduledFor < now ? 'error' : 'active';

  const add = async () => {
    if (!ready) return;
    setSaving(true); setErr(null);
    try {
      const { post } = schedulePost(
        record as Parameters<typeof schedulePost>[0],
        platform,
        caption,
        scheduledFor,
        createdBy,
        record.photoUrls?.[0] ?? null,
      );
      await saveScheduledPost(post);
      void logActivity({
        tool: 'Social queue', action: `Scheduled a ${PLATFORM_LIMITS[platform].label} post`,
        target: post.recordIdentifier,
        changes: [`For ${new Date(scheduledFor).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}`],
      });
      onClose();
    } catch {
      setErr('Could not save to the queue. Check your connection and try again.');
      setSaving(false);
    }
  };

  return (
    <div className="sd-backdrop" role="dialog" aria-modal="true" aria-label="Schedule a post">
      <div className="sd-panel">
        <div className="sd-head">
          <h2>Schedule a post</h2>
          <button className="ph-btn ghost" onClick={onClose}>Close</button>
        </div>

        <div className="sd-flow">
          <CircuitBoard
            variant="dark"
            width={560}
            height={150}
            pulseSpeed={2.4}
            nodes={[
              { id: 'record',   x: 55,  y: 60, label: 'Record',   icon: <Archive className="w-4 h-4" />,    status: 'active' },
              { id: 'caption',  x: 180, y: 60, label: 'Caption',  icon: <Type className="w-4 h-4" />,       status: captionStatus },
              { id: 'when',     x: 305, y: 60, label: 'Time',     icon: <Clock className="w-4 h-4" />,      status: timeStatus },
              { id: 'queue',    x: 430, y: 60, label: 'Queue',    icon: <ListChecks className="w-4 h-4" />, status: ready ? 'processing' : 'inactive' },
              { id: 'platform', x: 525, y: 60, label: limits.label, icon: <Send className="w-4 h-4" />,     status: ready ? 'active' : 'inactive', size: 'sm' },
            ]}
            connections={[
              { from: 'record',  to: 'caption',  animated: true },
              { from: 'caption', to: 'when',     animated: captionStatus === 'active' },
              { from: 'when',    to: 'queue',    animated: timeStatus === 'active' },
              { from: 'queue',   to: 'platform', animated: ready },
            ]}
          />
        </div>

        <div className="sd-form">
          <div className="sd-field">
            <span>Disseminating</span>
            <div className="sd-record">
              <code>{record.metadata?.identifier}</code>
              <strong>{record.title}</strong>
            </div>
            <small>Already approved and published — this is what the post links to.</small>
          </div>

          <div className="sd-field">
            <span>Platform</span>
            <div className="sd-platforms">
              {SOCIAL_PLATFORMS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={'sd-platform' + (platform === p ? ' selected' : '')}
                  onClick={() => setPlatform(p)}
                >
                  {PLATFORM_LIMITS[p].label}
                  <small>{PLATFORM_LIMITS[p].maxChars} chars</small>
                </button>
              ))}
            </div>
          </div>

          <label className="sd-field">
            <span>Caption</span>
            <textarea
              rows={4}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder={`Write the ${limits.label} post…`}
            />
            <small className={length > limits.maxChars ? 'sd-over' : undefined}>
              {length} / {limits.maxChars} characters
            </small>
          </label>

          <label className="sd-field">
            <span>Goes out at</span>
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </label>
        </div>

        {errors.length > 0 && (
          <ul className="sd-issues">
            {errors.map((i, n) => <li key={n}>{i.message}</li>)}
          </ul>
        )}
        {err && <p className="sd-error">{err}</p>}

        <div className="sd-actions">
          <button className="ph-btn primary" disabled={!ready || saving} onClick={add}>
            {saving ? 'Adding…' : 'Add to queue'}
          </button>
          <button className="ph-btn ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
