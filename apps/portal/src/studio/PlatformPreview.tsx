/**
 * In-feed mockups — how the post reads once it is surrounded by platform
 * chrome rather than sitting alone on a light background.
 *
 * Moved here out of Social.tsx so both the studio and the admin approval
 * queue can show the same preview without one importing the other. The
 * styles still live in Social.css, which both screens already load.
 */

import { useState, type ReactNode } from 'react';
import {
  Bookmark, Camera, Check, Copy, Heart, MessageCircle, Repeat2, Send, Share,
} from 'lucide-react';

export interface PreviewProps {
  name: string;
  avatarUrl?: string | null;
  caption: string;
  imageUrl: string | null;
  /** The finished graphic at this platform's own size — shown instead of
   *  the bare photograph, because it is what the platform will receive. */
  media?: ReactNode;
  onCopy: () => void;
  copied: boolean;
}

/** Where each feed cuts a caption off behind "more". The part above the fold
 *  is the part most people read, so the preview shows the cut honestly. */
const FOLD = { linkedin: 210, instagram: 125 } as const;

function Folded({ text, at, more }: { text: string; at: number; more: string }) {
  const [open, setOpen] = useState(false);
  if (!text) return <em>Nothing written yet</em>;
  if (open || text.length <= at) return <>{text}</>;
  return <>{text.slice(0, at).trimEnd()}… <button type="button" className="fld-prev-more" onClick={() => setOpen(true)}>{more}</button></>;
}

/** X counts every link as 23 characters, whatever its length. */
export function xLength(text: string): number {
  return text.replace(/https?:\/\/\S+/g, 'x'.repeat(23)).length;
}

/** Google's own profile photo when there is one — genuinely more useful in
 *  a preview than a generic placeholder, since it's what the account that
 *  ships this post already looks like. Falls back to an initial. */
export function Avatar({ url, name, className }: { url?: string | null; name: string; className: string }) {
  if (url) return <img src={url} alt="" className={className} />;
  return <span className={className + ' fld-avatar-fallback'}>{name.trim().charAt(0).toUpperCase() || '?'}</span>;
}

export function CopyChip({ onCopy, copied, dark = true }: { onCopy: () => void; copied: boolean; dark?: boolean }) {
  return (
    <button type="button" className={'fld-copy-btn' + (dark ? '' : ' fld-copy-btn--light')} onClick={onCopy}>
      {copied ? <Check size={12} strokeWidth={2.5} /> : <Copy size={12} strokeWidth={2.5} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

export function PreviewX({ name, avatarUrl, caption, imageUrl, media, onCopy, copied }: PreviewProps) {
  return (
    <div className="fld-prev fld-prev--x">
      <div className="fld-prev-x-top">
        <Avatar url={avatarUrl} name={name} className="fld-prev-avatar" />
        <div className="fld-prev-x-names">
          <span className="fld-prev-x-name">{name}</span>
          <span className="fld-prev-x-handle">@iia_antarctica · now</span>
        </div>
        <CopyChip onCopy={onCopy} copied={copied} />
      </div>
      <p className="fld-prev-x-text">{caption || <em>Nothing written yet</em>}</p>
      {media ? <div className="fld-prev-media fld-prev-x-img">{media}</div> : imageUrl && <img src={imageUrl} alt="" className="fld-prev-x-img" />}
      <span className={'fld-prev-count' + (xLength(caption) > 280 ? ' is-over' : '')}>{xLength(caption)} / 280 · links count as 23</span>
      <div className="fld-prev-x-actions">
        <span><MessageCircle size={15} strokeWidth={1.8} /> 12</span>
        <span><Repeat2 size={16} strokeWidth={1.8} /> 4</span>
        <span><Heart size={15} strokeWidth={1.8} /> 48</span>
        <span><Share size={14} strokeWidth={1.8} /></span>
      </div>
    </div>
  );
}

export function PreviewInstagram({ name, avatarUrl, caption, imageUrl, media, onCopy, copied }: PreviewProps) {
  const [handle] = name.toLowerCase().split(' ');
  return (
    <div className="fld-prev fld-prev--ig">
      <div className="fld-prev-ig-top">
        <Avatar url={avatarUrl} name={name} className="fld-prev-avatar fld-prev-avatar--ig" />
        <span className="fld-prev-ig-user">iia.{handle || 'antarctica'}</span>
        <CopyChip onCopy={onCopy} copied={copied} dark={false} />
      </div>
      <div className="fld-prev-ig-image">
        {media ? <div className="fld-prev-media">{media}</div> : imageUrl ? <img src={imageUrl} alt="" /> : <div className="fld-prev-ig-placeholder"><Camera size={28} strokeWidth={1.5} /></div>}
      </div>
      <div className="fld-prev-ig-actions">
        <Heart size={20} strokeWidth={1.8} />
        <MessageCircle size={20} strokeWidth={1.8} />
        <Send size={19} strokeWidth={1.8} />
        <span className="fld-prev-ig-spacer" />
        <Bookmark size={19} strokeWidth={1.8} />
      </div>
      <p className="fld-prev-ig-caption">
        <strong>iia.{handle || 'antarctica'}</strong> <Folded text={caption} at={FOLD.instagram} more="more" />
      </p>
    </div>
  );
}

export function PreviewLinkedIn({ name, avatarUrl, caption, imageUrl, media, onCopy, copied }: PreviewProps) {
  return (
    <div className="fld-prev fld-prev--li">
      <div className="fld-prev-li-top">
        <Avatar url={avatarUrl} name={name} className="fld-prev-avatar" />
        <div className="fld-prev-li-names">
          <span className="fld-prev-li-name">{name}</span>
          <span className="fld-prev-li-title">Knowledge Repository</span>
          <span className="fld-prev-li-time">now</span>
        </div>
        <CopyChip onCopy={onCopy} copied={copied} dark={false} />
      </div>
      <p className="fld-prev-li-text"><Folded text={caption} at={FOLD.linkedin} more="…see more" /></p>
      {media ? <div className="fld-prev-media fld-prev-li-img">{media}</div> : imageUrl && <img src={imageUrl} alt="" className="fld-prev-li-img" />}
      <div className="fld-prev-li-actions">
        <span>👍 Like</span><span>💬 Comment</span><span>↻ Repost</span><span><Send size={13} strokeWidth={2} /> Send</span>
      </div>
    </div>
  );
}
