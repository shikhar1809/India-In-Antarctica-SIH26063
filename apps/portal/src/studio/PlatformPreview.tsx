/**
 * In-feed mockups — how the post reads once it is surrounded by platform
 * chrome rather than sitting alone on a light background.
 *
 * Moved here out of Social.tsx so both the studio and the admin approval
 * queue can show the same preview without one importing the other. The
 * styles still live in Social.css, which both screens already load.
 */

import {
  Bookmark, Camera, Check, Copy, Heart, MessageCircle, Repeat2, Send, Share,
} from 'lucide-react';

export interface PreviewProps {
  name: string;
  avatarUrl?: string | null;
  caption: string;
  imageUrl: string | null;
  onCopy: () => void;
  copied: boolean;
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

export function PreviewX({ name, avatarUrl, caption, imageUrl, onCopy, copied }: PreviewProps) {
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
      {imageUrl && <img src={imageUrl} alt="" className="fld-prev-x-img" />}
      <div className="fld-prev-x-actions">
        <span><MessageCircle size={15} strokeWidth={1.8} /> 12</span>
        <span><Repeat2 size={16} strokeWidth={1.8} /> 4</span>
        <span><Heart size={15} strokeWidth={1.8} /> 48</span>
        <span><Share size={14} strokeWidth={1.8} /></span>
      </div>
    </div>
  );
}

export function PreviewInstagram({ name, avatarUrl, caption, imageUrl, onCopy, copied }: PreviewProps) {
  const [handle] = name.toLowerCase().split(' ');
  return (
    <div className="fld-prev fld-prev--ig">
      <div className="fld-prev-ig-top">
        <Avatar url={avatarUrl} name={name} className="fld-prev-avatar fld-prev-avatar--ig" />
        <span className="fld-prev-ig-user">iia.{handle || 'antarctica'}</span>
        <CopyChip onCopy={onCopy} copied={copied} dark={false} />
      </div>
      <div className="fld-prev-ig-image">
        {imageUrl ? <img src={imageUrl} alt="" /> : <div className="fld-prev-ig-placeholder"><Camera size={28} strokeWidth={1.5} /></div>}
      </div>
      <div className="fld-prev-ig-actions">
        <Heart size={20} strokeWidth={1.8} />
        <MessageCircle size={20} strokeWidth={1.8} />
        <Send size={19} strokeWidth={1.8} />
        <span className="fld-prev-ig-spacer" />
        <Bookmark size={19} strokeWidth={1.8} />
      </div>
      <p className="fld-prev-ig-caption">
        <strong>iia.{handle || 'antarctica'}</strong> {caption || <em>Nothing written yet</em>}
      </p>
    </div>
  );
}

export function PreviewLinkedIn({ name, avatarUrl, caption, imageUrl, onCopy, copied }: PreviewProps) {
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
      <p className="fld-prev-li-text">{caption || <em>Nothing written yet</em>}</p>
      {imageUrl && <img src={imageUrl} alt="" className="fld-prev-li-img" />}
      <div className="fld-prev-li-actions">
        <span>👍 Like</span><span>💬 Comment</span><span>↻ Repost</span><span><Send size={13} strokeWidth={2} /> Send</span>
      </div>
    </div>
  );
}
