/**
 * The Basic questions, as components — shared by the publisher's Basic step
 * (Studio.tsx) and the admin's "Create a new post" request
 * (PostRequestWizard.tsx), so the two ask exactly the same things in exactly
 * the same way. What an admin answers when requesting a post is what the
 * publisher's "Auto-fill from the admin's requirements" puts back.
 *
 * Presentational: every field takes its value and an onChange. Where a field
 * needs to do something (upload a photo, search the archive) the caller
 * passes that in.
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Image as ImageIcon, Link2, Maximize2, Paperclip, Plus, Sparkles, TriangleAlert, X as XIcon } from 'lucide-react';
import { KnowledgeBase } from './KnowledgeBase';
import type { PostSource } from './copy';
import {
  KB_RELATIONS, MAX_LINKS, isLink, resolutionNote, resolutionOf,
  type ImageSource, type KbRelation, type ReferencePost,
} from './basics';

/**
 * The story — "What happened?". Write-ups run long, and a text box squeezed
 * into a column is no place to read or edit one. The column shows the
 * opening lines as a card; clicking it opens the whole thing in a
 * full-screen editor. Esc or Done closes it; nothing is lost either way —
 * every keystroke is already the value.
 */
export function StoryField({ label, sub, value, onChange, placeholder, grow = false }: {
  label: string;
  sub?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** Let the card take the column's spare height (the studio's Basic). */
  grow?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const words = value.trim() ? value.trim().split(/\s+/).length : 0;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    // The page behind must not scroll while the editor covers it.
    const was = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = was; };
  }, [open]);

  return (
    <div className={'stu-field stu-story' + (grow ? ' stu-field--grow' : '')}>
      <span className="stu-label">{label}</span>
      {sub && <span className="stu-sub">{sub}</span>}
      <button type="button" className={'stu-story-card' + (value.trim() ? '' : ' is-empty')} onClick={() => setOpen(true)} aria-haspopup="dialog">
        <span className="stu-story-text">{value.trim() || placeholder || 'Write it here…'}</span>
        <span className="stu-story-open"><Maximize2 size={12} strokeWidth={2.5} /> {value.trim() ? `Open to read and edit · ${words} words` : 'Open to write'}</span>
      </button>

      {open && createPortal(
        <div className="stu-story-modal" role="dialog" aria-modal="true" aria-label={label} onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="stu-story-sheet">
            <header>
              <div>
                <h2>{label}</h2>
                {sub && <p>{sub}</p>}
              </div>
              <button type="button" className="stu-story-x" onClick={() => setOpen(false)} aria-label="Close"><XIcon size={18} strokeWidth={2.25} /></button>
            </header>
            <textarea
              autoFocus
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              onFocus={(e) => { const n = e.currentTarget.value.length; e.currentTarget.setSelectionRange(n, n); }}
            />
            <footer>
              <span>{words} words · {value.length} characters</span>
              <button type="button" className="stu-primary" onClick={() => setOpen(false)}><Check size={15} strokeWidth={2.5} /> Done</button>
            </footer>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

/**
 * One question as a row of options. "Agent decides" is the first option and
 * the one shown until something is picked — answering is never required,
 * only better ground for the agent to stand on.
 */
export function Choice<T extends string>({ label, sub, options, value, onChange, auto = true }: {
  label: string;
  sub?: string;
  options: { id: T; label: string; hint?: string }[];
  value: T | null | undefined;
  onChange: (v: T | null) => void;
  /** False for a question that must be answered (no "Agent decides"). */
  auto?: boolean;
}) {
  return (
    <div className="stu-chiprow stu-q">
      <span className="stu-label">{label}</span>
      {sub && <span className="stu-sub">{sub}</span>}
      <div className="stu-chips">
        {auto && (
          <button
            type="button"
            className={'stu-chip stu-chip--auto' + (value == null ? ' is-on' : '')}
            onClick={() => onChange(null)}
            title="Leave it to the agent — it will decide and say why"
          >
            <Sparkles size={11} strokeWidth={2.5} /> Agent decides
          </button>
        )}
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            className={'stu-chip' + (value === o.id ? ' is-on' : '')}
            onClick={() => onChange(o.id)}
            title={o.hint}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Platforms, as toggles — several can be on. */
export function PlatformsField<P extends string>({ label, options, value, onChange }: {
  label: string;
  options: { id: P; label: string; hint?: string }[];
  value: P[];
  onChange: (v: P[]) => void;
}) {
  return (
    <div className="stu-chiprow stu-q">
      <span className="stu-label">{label}</span>
      <div className="stu-chips">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            className={'stu-chip' + (value.includes(o.id) ? ' is-on' : '')}
            onClick={() => onChange(value.includes(o.id) ? value.filter((x) => x !== o.id) : [...value, o.id])}
            title={o.hint}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * "Is it about, or citing, something in the public knowledge base?" — with
 * the archive search when a record is wanted, and the linked record as a
 * card with Remove once one is picked.
 */
export function KbQuestion({ kb, onKb, linked, onPick, onRemove }: {
  kb: KbRelation | null | undefined;
  onKb: (v: KbRelation | null) => void;
  linked: { identifier: string; title: string } | null;
  onPick: (material: string, source: PostSource) => void;
  onRemove: () => void;
}) {
  return (
    <div className="stu-q">
      <Choice
        label="Is it about, or citing, something in the public knowledge base?"
        options={KB_RELATIONS}
        value={kb}
        onChange={(v) => { onKb(v); if (v === 'none') onRemove(); }}
      />
      {linked ? (
        <div className="stu-kb-linked">
          <Link2 size={13} strokeWidth={2.5} />
          <div>
            <span><code>{linked.identifier}</code> {kb === 'cites' ? 'cited as the source' : 'the post is about it'}</span>
            <strong>{linked.title}</strong>
          </div>
          <button type="button" className="stu-linkbtn" onClick={onRemove} title="Unlink this record">Remove</button>
        </div>
      ) : (kb === 'about' || kb === 'cites') ? (
        <KnowledgeBase compact onPick={onPick} />
      ) : kb == null ? (
        <span className="stu-sub">The agent searches the archive for a matching record, and asks if it is unsure.</span>
      ) : null}
    </div>
  );
}

/**
 * Images: uploaded photographs, each measured as it loads and flagged when
 * it is too small for Instagram — or "Let the agent find one".
 */
export function ImagesField({
  images, cover, onCover, onFile, uploading, uploadPct, uploadError, imageSource, onImageSource, max = 8,
}: {
  images: string[];
  cover?: number;
  onCover?: (i: number) => void;
  onFile: (file: File) => void;
  uploading: boolean;
  uploadPct: number;
  uploadError: string | null;
  imageSource: ImageSource | null | undefined;
  onImageSource: (v: ImageSource | null) => void;
  max?: number;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dims, setDims] = useState<Record<string, { w: number; h: number }>>({});
  const measure = (url: string, img: HTMLImageElement) => {
    if (!img.naturalWidth || dims[url]) return;
    setDims((m) => ({ ...m, [url]: { w: img.naturalWidth, h: img.naturalHeight } }));
  };
  const lowRes = images.map((url, i) => ({ i, url, d: dims[url] })).filter((x) => x.d && resolutionOf(x.d.w, x.d.h) !== 'ok');

  return (
    <div className="stu-field stu-q">
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }}
      />
      <span className="stu-label">Images</span>
      <span className="stu-sub">Station photographs first. Instagram needs one, 1080 px+.</span>
      {images.length > 0 && (
        <div className="stu-photos">
          {images.map((url, i) => {
            const dm = dims[url];
            const r = dm ? resolutionOf(dm.w, dm.h) : null;
            return (
              <button
                key={url}
                type="button"
                className={'stu-photo' + (cover === i ? ' is-on' : '') + (r && r !== 'ok' ? ` is-${r}` : '')}
                onClick={() => onCover?.(i)}
                title={`${onCover ? (cover === i ? 'Cover photo' : 'Use as the cover photo') : 'Photo'}${dm ? ` · ${dm.w}×${dm.h}` : ''}`}
              >
                <img src={url} alt="" onLoad={(e) => measure(url, e.currentTarget)} />
                {r && r !== 'ok' && <span className="stu-photo-flag">{r === 'poor' ? 'Too small' : 'Low-res'}</span>}
              </button>
            );
          })}
        </div>
      )}
      {lowRes.length > 0 && (
        <ul className="stu-lowres">
          {lowRes.map((x) => <li key={x.url}><TriangleAlert size={12} strokeWidth={2.5} /> Photo {x.i + 1}: {resolutionNote(x.d!.w, x.d!.h)}</li>)}
        </ul>
      )}
      <div className="stu-chips">
        {images.length < max && (
          <button
            type="button"
            className="stu-chip stu-chip--icon"
            onClick={() => input.current?.click()}
            disabled={uploading}
          >
            <Paperclip size={12} strokeWidth={2.5} />
            {uploading ? `Uploading ${uploadPct}%` : images.length ? 'Add another' : 'Upload a photo'}
          </button>
        )}
        {images.length === 0 && (
          <button
            type="button"
            className={'stu-chip stu-chip--icon' + (imageSource !== 'upload' ? ' is-on' : '')}
            onClick={() => onImageSource(imageSource !== 'upload' ? 'upload' : 'agent')}
            title="With no photograph, the agent finds an openly licensed one and credits it"
          >
            <ImageIcon size={12} strokeWidth={2.5} /> Let the agent find one
          </button>
        )}
      </div>
      {images.length === 0 && (
        <span className="stu-sub">
          {imageSource !== 'upload'
            ? 'No photo yet — the agent will find an openly licensed one (1080 px+) and credit it in every caption.'
            : 'No photo, and the agent will not look for one. The post will be text on colour.'}
        </span>
      )}
      {uploadError && <p className="stu-error">{uploadError}</p>}
    </div>
  );
}

/**
 * Reference posts: the shape and voice to follow. Past posts carry their own
 * text; a pasted link needs its text too, because the writer cannot open a
 * link.
 */
export function ReferencePostsField({ references, onChange, pastPosts }: {
  references: ReferencePost[];
  onChange: (v: ReferencePost[]) => void;
  pastPosts: { id: string; platformLabel: string; caption: string; url?: string; platform: string; postedAt: number | null }[];
}) {
  const [mode, setMode] = useState<'past' | 'link' | null>(null);
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const add = (r: ReferencePost) => {
    onChange([...references.filter((x) => !r.url || x.url !== r.url), r].slice(-3));
    setMode(null); setUrl(''); setText('');
  };

  return (
    <div className="stu-field stu-q">
      <span className="stu-label">Reference posts <em className="stu-opt">optional</em></span>
      <span className="stu-sub">Posts whose style to follow — ours or anyone’s. Never their facts.</span>
      {references.length > 0 && (
        <ul className="stu-refs">
          {references.map((r, i) => (
            <li key={i}>
              <span className="stu-refs-label">{r.label}</span>
              <span className="stu-refs-text">{r.text ? r.text : 'Link only — add its text for the writer to follow it'}</span>
              <button type="button" aria-label="Remove reference" onClick={() => onChange(references.filter((_, j) => j !== i))}><XIcon size={12} strokeWidth={2.5} /></button>
            </li>
          ))}
        </ul>
      )}
      {references.length < 3 && (
        <div className="stu-chips">
          <button type="button" className={'stu-chip stu-chip--icon' + (mode === 'past' ? ' is-on' : '')} onClick={() => setMode(mode === 'past' ? null : 'past')}>
            <Plus size={12} strokeWidth={2.5} /> One of our posts
          </button>
          <button type="button" className={'stu-chip stu-chip--icon' + (mode === 'link' ? ' is-on' : '')} onClick={() => setMode(mode === 'link' ? null : 'link')}>
            <Link2 size={12} strokeWidth={2.5} /> Paste a link
          </button>
        </div>
      )}
      {mode === 'past' && (
        pastPosts.length ? (
          <ul className="stu-refpick">
            {pastPosts.slice(0, 5).map((x) => (
              <li key={x.id}>
                <button type="button" onClick={() => add({
                  kind: 'past', platform: x.platform, url: x.url, text: x.caption,
                  label: `${x.platformLabel} · ${x.postedAt ? new Date(x.postedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'sent'}`,
                })}>
                  <b>{x.platformLabel}</b> {x.caption.slice(0, 110)}
                </button>
              </li>
            ))}
          </ul>
        ) : <span className="stu-sub">Nothing sent from the portal yet — paste a link instead.</span>
      )}
      {mode === 'link' && (
        <div className="stu-reflink">
          <input className="stu-input" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.instagram.com/p/…" />
          <textarea className="stu-textarea" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste its text too — the writer can’t open links" />
          <button
            type="button"
            className="stu-ghost"
            disabled={!isLink(url) && !text.trim()}
            onClick={() => {
              const u = url.trim() || undefined;
              let host = 'Pasted text';
              try { if (u) host = new URL(/^[a-z]+:/i.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, ''); } catch { /* not a URL */ }
              add({ kind: 'link', url: u, text: text.trim() || undefined, label: host });
            }}
          >Add reference</button>
        </div>
      )}
    </div>
  );
}

/** Links: one box per link, + for another. Added to every caption by the
 *  portal after writing — the model never types a URL. */
export function LinksField({ links, onChange }: { links: string[] | undefined; onChange: (v: string[]) => void }) {
  // Always at least one box to type into.
  const boxes = links?.length ? links : [''];
  return (
    <div className="stu-field stu-q">
      <span className="stu-label">Links <em className="stu-opt">optional</em></span>
      <span className="stu-sub">Added to the end of every caption by the portal — never retyped by the writer.</span>
      <div className="stu-links">
        {boxes.map((l, i) => (
          <div key={i} className={'stu-linkbox' + (l.trim() && !isLink(l) ? ' is-bad' : '')}>
            <Link2 size={13} strokeWidth={2.5} />
            <input
              type="url"
              value={l}
              onChange={(e) => onChange(boxes.map((x, j) => (j === i ? e.target.value : x)))}
              placeholder="https://…"
              aria-label={`Link ${i + 1}`}
            />
            {boxes.length > 1 && (
              <button type="button" aria-label={`Remove link ${i + 1}`} onClick={() => onChange(boxes.filter((_, j) => j !== i))}>
                <XIcon size={12} strokeWidth={2.5} />
              </button>
            )}
          </div>
        ))}
        {boxes.length < MAX_LINKS && (
          <button type="button" className="stu-linkadd" onClick={() => onChange([...boxes, ''])} aria-label="Add another link" title="Add another link">
            <Plus size={14} strokeWidth={2.5} />
          </button>
        )}
      </div>
      {boxes.some((l) => l.trim() && !isLink(l)) && <span className="stu-error">That isn’t a web address — the red box will be left out.</span>}
    </div>
  );
}
