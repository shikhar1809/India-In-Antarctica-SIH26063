/**
 * The two checks that run before a post is submitted.
 *
 * A/B — the studio already generated three variants and the publisher chose
 * one. The other two did not disappear, and comparing the chosen caption
 * against a rejected one is a real comparison of two real options rather
 * than a synthetic pair invented for the exercise. The model is asked which
 * would do better on a named platform and why, factor by factor, and to
 * suggest hashtags with a reason attached to each — a hashtag with no
 * reasoning is noise, and the publisher is the one who has to defend it.
 *
 * What is deliberately not claimed: this predicts nothing about reach. There
 * are no engagement figures in this system to learn from, so the judgement
 * is about fit — hook placement, length against the platform's norms,
 * whether the first sentence survives a non-specialist reading. Presenting
 * that as a performance forecast would be inventing a finding.
 *
 * SOP — the pre-flight checklist used to be five boxes a publisher ticked
 * on their honour. Two of them are now actually checked: the photograph is
 * looked at by a vision model for a visible credit or watermark, and for
 * anything a government account must not publish. A blocker stops
 * submission outright; everything else informs the human, who still ticks
 * the boxes and still submits to an admin for approval.
 */

import { useState } from 'react';
import { AlertTriangle, Check, Hash, Loader2, ShieldCheck, Split, X } from 'lucide-react';

import type { PlatformId } from './brand';
import type { Variant } from './copy';
import './ReviewChecks.css';

const AB_URL = 'https://asia-south1-indiainantartica.cloudfunctions.net/studio/abtest';
const MODERATE_URL = 'https://asia-south1-indiainantartica.cloudfunctions.net/studio/moderate';

type CaptionKey = 'x' | 'linkedin' | 'instagram';

export interface AbResult {
  winner: 'a' | 'b';
  confidence: 'low' | 'medium' | 'high';
  reasoning: string;
  factors: { factor: string; favours: 'a' | 'b' | 'neither'; note: string }[];
  hashtags: { tag: string; why: string }[];
}

export interface ModerationResult {
  safe: boolean;
  watermarkPresent: boolean;
  watermarkNote: string;
  describes: string;
  concerns: { severity: 'caution' | 'blocker'; label: string; detail: string }[];
}

/* ══════════════════════════════════════════════════════════════ A/B ══ */

export function AbTest({
  platform, chosen, alternative, audience, subject, onUseCaption, onAddHashtag,
}: {
  platform: CaptionKey;
  chosen: string;
  /** The same platform's caption from a variant the publisher did not pick. */
  alternative: string | null;
  audience: string;
  subject: string;
  onUseCaption: (caption: string) => void;
  onAddHashtag: (tag: string) => void;
}) {
  const [result, setResult] = useState<AbResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!alternative) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(AB_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, a: chosen, b: alternative, audience, subject }),
      });
      if (!res.ok) {
        setError(res.status === 503
          ? 'No generator configured — the comparison needs one.'
          : 'The comparison could not be run.');
        return;
      }
      setResult((await res.json()) as AbResult);
    } catch {
      setError('Could not reach the generator.');
    } finally {
      setBusy(false);
    }
  };

  if (!alternative) {
    return (
      <p className="rc-none">
        Only one caption exists for {platform} — generate a second set of options to compare against.
      </p>
    );
  }

  return (
    <div className="rc-ab">
      {!result && (
        <button type="button" className="stu-ghost" onClick={run} disabled={busy}>
          {busy ? <Loader2 size={13} className="rc-spin" /> : <Split size={13} strokeWidth={2.5} />}
          {busy ? 'Comparing…' : 'A/B test this caption'}
        </button>
      )}
      {error && <p className="rc-error">{error}</p>}

      {result && (
        <>
          <div className="rc-verdict">
            <span className={'rc-badge rc-badge--' + result.confidence}>
              {result.winner === 'a' ? 'Your caption wins' : 'The alternative wins'}
              <span className="rc-conf">{result.confidence} confidence</span>
            </span>
            <p className="rc-reasoning">{result.reasoning}</p>
          </div>

          <ul className="rc-factors">
            {result.factors.map((f, i) => (
              <li key={i} className={'rc-factor rc-factor--' + f.favours}>
                <span className="rc-factor-name">{f.factor}</span>
                <span className="rc-factor-note">{f.note}</span>
                <span className="rc-factor-side">
                  {f.favours === 'neither' ? 'even' : f.favours === 'a' ? 'yours' : 'alternative'}
                </span>
              </li>
            ))}
          </ul>

          {result.winner === 'b' && (
            <div className="rc-swap">
              <p className="rc-swap-text">{alternative}</p>
              <button type="button" className="stu-ghost" onClick={() => onUseCaption(alternative)}>
                <Check size={13} strokeWidth={2.5} /> Use the alternative instead
              </button>
            </div>
          )}

          {result.hashtags.length > 0 && (
            <div className="rc-tags">
              <span className="rc-tags-label"><Hash size={12} strokeWidth={2.5} /> Suggested hashtags</span>
              <ul>
                {result.hashtags.map((h) => (
                  <li key={h.tag}>
                    <button type="button" className="rc-tag" onClick={() => onAddHashtag(h.tag)}>
                      {h.tag}
                    </button>
                    <span className="rc-tag-why">{h.why}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════ photo check ══ */

export function PhotoCheck({
  imageUrl, result, onResult,
}: {
  imageUrl: string | null;
  result: ModerationResult | null;
  onResult: (r: ModerationResult | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!imageUrl) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(MODERATE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl }),
      });
      if (!res.ok) {
        setError(res.status === 503
          ? 'No generator configured — check the photograph by eye.'
          : 'The photograph could not be checked automatically.');
        return;
      }
      onResult((await res.json()) as ModerationResult);
    } catch {
      setError('Could not reach the checker.');
    } finally {
      setBusy(false);
    }
  };

  if (!imageUrl) {
    return <p className="rc-none">No photograph on this post, so there is nothing to check.</p>;
  }

  const blockers = result?.concerns.filter((c) => c.severity === 'blocker') ?? [];

  return (
    <div className="rc-photo">
      {!result && (
        <button type="button" className="stu-ghost" onClick={run} disabled={busy}>
          {busy ? <Loader2 size={13} className="rc-spin" /> : <ShieldCheck size={13} strokeWidth={2.5} />}
          {busy ? 'Looking at the photograph…' : 'Check the photograph'}
        </button>
      )}
      {error && <p className="rc-error">{error}</p>}

      {result && (
        <div className={'rc-photo-result' + (result.safe ? '' : ' is-blocked')}>
          <span className="rc-photo-head">
            {result.safe
              ? <><Check size={13} strokeWidth={3} /> Nothing found that would stop publication</>
              : <><X size={13} strokeWidth={3} /> Do not publish this photograph</>}
          </span>

          <p className="rc-photo-desc">{result.describes}</p>

          <p className={'rc-photo-mark' + (result.watermarkPresent ? ' is-on' : '')}>
            {result.watermarkPresent
              ? <><Check size={12} strokeWidth={3} /> Credit or watermark visible</>
              : <><AlertTriangle size={12} strokeWidth={2.5} /> No visible credit or watermark</>}
            <span>{result.watermarkNote}</span>
          </p>

          {result.concerns.length > 0 && (
            <ul className="rc-concerns">
              {result.concerns.map((c, i) => (
                <li key={i} className={'rc-concern rc-concern--' + c.severity}>
                  <strong>{c.label}</strong>
                  <span>{c.detail}</span>
                </li>
              ))}
            </ul>
          )}

          {blockers.length > 0 && (
            <p className="rc-photo-block">
              Submission is blocked while this photograph is attached. Replace it, or remove it and
              publish the graphic on flat colour.
            </p>
          )}

          <button type="button" className="rc-recheck" onClick={() => { onResult(null); }}>
            Check again
          </button>
        </div>
      )}
    </div>
  );
}

/** The alternative caption for a platform: the same field from the first
 *  variant the publisher did not choose. Null when there is nothing to
 *  compare against. */
export function alternativeCaption(
  variants: Variant[],
  pickedId: string | null,
  platform: CaptionKey,
): string | null {
  const other = variants.find((v) => v.id !== pickedId);
  const caption = other?.copy.captions[platform]?.trim();
  return caption ? caption : null;
}

export type { PlatformId };
