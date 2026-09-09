/**
 * Mark up the graphic, then have the notes applied.
 *
 * The approvals desk already lets an admin draw on a post and pin comments
 * to specific places on it (review/ImageAnnotator). Publishers could read
 * those notes but had no way to make marks of their own, which meant the
 * one person actually editing the post was the one person who had to
 * describe layout problems in prose: "the headline is too long" rather than
 * a circle round the headline.
 *
 * This gives them the same tool, on the graphic as it currently renders,
 * and then does the thing the admin flow does not need to: it turns the
 * pinned comments into a revision. The notes and the marked-up image both
 * go to the model, because half of these notes are about position — "this
 * overlaps the roofline" cannot be acted on from text alone.
 *
 * Nothing is applied silently. What comes back is shown against what is
 * there now, note by note with what was done about each, and the publisher
 * accepts or discards the lot.
 */

import { useEffect, useRef, useState } from 'react';
import { Check, PenLine, RotateCcw, X } from 'lucide-react';

import { ImageAnnotator } from '../review/ImageAnnotator';
import { isPinAnnotation, type Annotation } from '../review/annotations';
import { exportPng } from './export';
import type { PlatformId } from './brand';
import type { PostCopy } from './copy';
import './MarkupPanel.css';

const REVISE_URL = 'https://asia-south1-indiainantartica.cloudfunctions.net/studio/revise';

export interface Revision {
  headline: string;
  standfirst: string;
  captions: PostCopy['captions'];
  /** Each note paired with what was actually done about it. The honest part
   *  of the exchange: a note that could not be honoured says so here rather
   *  than quietly not happening. */
  changed: { note: string; didWhat: string }[];
}

export interface MarkupPanelProps {
  /** The live canvas node — the same ref PostCanvas was given. */
  canvasRef: React.RefObject<HTMLDivElement | null>;
  platform: PlatformId;
  copy: PostCopy;
  subject: string;
  authorName: string;
  onApply: (revision: Revision) => void;
  onClose: () => void;
}

export function MarkupPanel({
  canvasRef, platform, copy, subject, authorName, onApply, onClose,
}: MarkupPanelProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState<Revision | null>(null);

  /* The rasterised frame, kept so it can be sent alongside the notes. The
   * object URL is revoked on unmount; the data URL is what travels. */
  const dataUrl = useRef<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    (async () => {
      if (!canvasRef.current) {
        setError('The graphic is not rendered yet.');
        return;
      }
      try {
        const blob = await exportPng(canvasRef.current, platform, { pixelRatio: 1 });
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setImageUrl(objectUrl);

        const reader = new FileReader();
        reader.onload = () => { dataUrl.current = String(reader.result || ''); };
        reader.readAsDataURL(blob);
      } catch {
        if (!cancelled) {
          setError('Could not rasterise the graphic — a cross-origin photo can block this.');
        }
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [canvasRef, platform]);

  const notes = annotations.filter(isPinAnnotation).map((p) => p.comment).filter(Boolean);

  const applyNotes = async () => {
    if (!notes.length) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(REVISE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes,
          copy: { headline: copy.headline, standfirst: copy.standfirst, captions: copy.captions },
          subject,
          imageBase64: dataUrl.current,
          imageMime: 'image/png',
        }),
      });
      if (!res.ok) {
        setError(
          res.status === 503
            ? 'No generator is configured, so notes cannot be applied automatically. Your marks are still here to work from.'
            : 'The generator could not apply those notes.',
        );
        return;
      }
      setRevision((await res.json()) as Revision);
    } catch {
      setError('Could not reach the generator.');
    } finally {
      setBusy(false);
    }
  };

  /* ── the revision, offered rather than applied ── */
  if (revision) {
    return (
      <div className="mk">
        <div className="mk-head">
          <strong>What the notes changed</strong>
          <button type="button" className="mk-x" onClick={onClose} aria-label="Close"><X size={14} /></button>
        </div>

        <ul className="mk-changes">
          {revision.changed.map((c, i) => (
            <li key={i}>
              <span className="mk-note">“{c.note}”</span>
              <span className="mk-did">{c.didWhat}</span>
            </li>
          ))}
        </ul>

        <div className="mk-diff">
          <div>
            <span className="mk-diff-label">Headline now</span>
            <p className="mk-was">{copy.headline}</p>
            <p className="mk-now">{revision.headline}</p>
          </div>
          <div>
            <span className="mk-diff-label">Supporting line</span>
            <p className="mk-was">{copy.standfirst}</p>
            <p className="mk-now">{revision.standfirst}</p>
          </div>
        </div>

        <div className="mk-actions">
          <button type="button" className="stu-primary stu-primary--sm" onClick={() => onApply(revision)}>
            <Check size={14} strokeWidth={2.5} /> Accept these changes
          </button>
          <button type="button" className="stu-ghost" onClick={() => setRevision(null)}>
            <RotateCcw size={13} strokeWidth={2.5} /> Keep marking up
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mk">
      <div className="mk-head">
        <strong>Mark up the graphic</strong>
        <span className="mk-hint">
          Right-click on the image for the tools. Drop a pin where something is wrong and write
          what it is — the pins are what get applied.
        </span>
        <button type="button" className="mk-x" onClick={onClose} aria-label="Close"><X size={14} /></button>
      </div>

      {error && <p className="mk-error">{error}</p>}

      {imageUrl ? (
        <ImageAnnotator
          imageUrl={imageUrl}
          annotations={annotations}
          authorName={authorName}
          onChange={setAnnotations}
          onSave={applyNotes}
          onClose={onClose}
          saving={busy}
        />
      ) : (
        !error && <p className="mk-hint">Rendering the graphic…</p>
      )}

      <div className="mk-actions">
        <button
          type="button"
          className="stu-primary stu-primary--sm"
          onClick={applyNotes}
          disabled={busy || notes.length === 0}
        >
          <PenLine size={14} strokeWidth={2.5} />
          {busy ? 'Applying…' : `Apply ${notes.length || 'these'} note${notes.length === 1 ? '' : 's'}`}
        </button>
        {notes.length === 0 && (
          <span className="mk-hint">A pin with a comment is what can be applied — marks on their own say where, not what.</span>
        )}
      </div>
    </div>
  );
}
