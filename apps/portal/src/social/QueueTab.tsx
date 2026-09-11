/**
 * The dissemination queue, as a publisher sees it.
 *
 * The screen answers three questions in order, because that is the order they
 * get asked: what goes out next, what needs me, and what already went out.
 * Everything settled sinks to the bottom rather than disappearing — a queue
 * that hides its history cannot answer "did we ever announce that?", which is
 * the question the queue exists for.
 */

import { useEffect, useMemo, useState } from 'react';
import { useSocialQueue, updateScheduledPost, removeScheduledPost, recordSocialPost } from '../hooks/useSocialQueue';
import {
  PLATFORM_LIMITS,
  captionLength,
  effectiveStatus,
  adapterFor,
  confirmManualPost,
  sendPost,
  cancelPost,
  type ScheduledPost,
  type PostStatus,
} from './queue';
import { refreshAdapters, type PublishCapability } from './uploadPostAdapter';

import './QueueTab.css';

const STATUS_LABEL: Record<PostStatus, string> = {
  queued: 'Scheduled',
  ready: 'Due now',
  posted: 'Posted',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

function when(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function QueueRow({ post }: { post: ScheduledPost }) {
  const [url, setUrl] = useState('');
  const [platformPostId, setPlatformPostId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const status = effectiveStatus(post);
  const limits = PLATFORM_LIMITS[post.platform];
  const length = captionLength(post.caption);
  const adapter = adapterFor(post.platform);

  // A due post on a platform with no credential is the case that needs a
  // human. Everything else is either waiting for the clock or already settled.
  const needsHand = status === 'ready' && !adapter.automatic;

  /* A due post on a platform that IS connected can go out from here. The
   * manual form stays available underneath either way — an adapter being
   * registered does not remove a publisher's ability to post it themselves
   * and paste the link, which is what they will do the first time an
   * automatic send fails. */
  const canSendNow = status === 'ready' && adapter.automatic;

  /** Posts it for real, through the adapter. `sendScheduledPost` owns the
   *  state transition, so a failure lands as a 'failed' row carrying the
   *  platform's own reason rather than a silent no-op. */
  const postNow = async () => {
    setBusy(true); setErr(null);
    try {
      const next = await sendPost(post);
      await updateScheduledPost(next);
      if (next.status === 'posted' && post.status !== 'posted') {
        await recordSocialPost(next);
      }
      if (next.status === 'failed') setErr(next.error ?? 'The platform rejected the post.');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not send the post.');
    } finally { setBusy(false); }
  };

  const act = async (next: ScheduledPost) => {
    setBusy(true); setErr(null);
    try {
      await updateScheduledPost(next);
      // Only the transition INTO 'posted' should denormalise onto the
      // record — checking the previous row (`post`), not just the new
      // status, means this never re-fires for a row that was already
      // posted and is merely being re-rendered through some other update.
      if (next.status === 'posted' && post.status !== 'posted') {
        await recordSocialPost(next);
      }
      if (next.status !== post.status) {
      }
    }
    catch { setErr('Could not save. Check your connection and try again.'); }
    finally { setBusy(false); }
  };

  return (
    <li className={'sq-row status-' + status}>
      <div className="sq-head">
        <span className="sq-platform">{limits.label}</span>
        <code className="sq-ident">{post.recordIdentifier}</code>
        <span className={'sq-status badge-' + status}>{STATUS_LABEL[status]}</span>
        <span className="sq-when">{when(post.scheduledFor)}</span>
      </div>

      <p className="sq-caption">{post.caption}</p>

      <div className="sq-meta">
        <span className={length > limits.maxChars ? 'sq-over' : undefined}>
          {length} / {limits.maxChars} characters
        </span>
        {post.imageUrl && <span>· image attached</span>}
        <span>· {adapter.automatic ? 'posts automatically' : 'posted by hand'}</span>
      </div>

      {post.error && <p className="sq-error">{post.error}</p>}
      {err && <p className="sq-error">{err}</p>}

      {post.status === 'posted' && post.liveCheck?.state === 'removed' && (
        <p className="sq-error">
          Deleted on the platform{post.removedAt ? ` (found ${when(post.removedAt)})` : ''}{post.liveCheck.note ? ` — ${post.liveCheck.note}` : ''}
        </p>
      )}
      {post.status === 'posted' && post.externalUrl && post.liveCheck?.state !== 'removed' && (
        <p className="sq-posted">
          Posted {post.postedAt ? when(post.postedAt) : ''} ·{' '}
          <a href={post.externalUrl} target="_blank" rel="noreferrer">view the post</a>
        </p>
      )}

      {canSendNow && (
        <div className="sq-actions">
          <button className="ph-btn primary" disabled={busy} onClick={postNow}>
            {busy ? 'Posting…' : `Post now to ${limits.label}`}
          </button>
          <span className="sq-adapter-note">{adapter.label}</span>
        </div>
      )}

      {needsHand && (
        <div className="sq-actions">
          {/* The permalink is required rather than optional: marking
              something posted without a link records a claim nobody can
              check, which is worse than leaving the row open. */}
          <input
            className="sq-url"
            type="url"
            placeholder="Paste the link to the post"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          {/* X's engagement numbers can be looked up from the permalink
              alone (functions/engagement.js parses the tweet id out of it),
              but Instagram's and LinkedIn's APIs need their own id or URN —
              this is genuinely optional, and only worth filling in if
              engagement tracking matters for this specific post. */}
          {(post.platform === 'instagram' || post.platform === 'linkedin') && (
            <input
              className="sq-url"
              type="text"
              placeholder={post.platform === 'instagram' ? 'Media id (optional, for engagement tracking)' : 'Share URN (optional, for engagement tracking)'}
              value={platformPostId}
              onChange={(e) => setPlatformPostId(e.target.value)}
            />
          )}
          <button
            className="ph-btn primary"
            disabled={busy || !url.trim()}
            onClick={() => act(confirmManualPost(post, url, Date.now(), platformPostId))}
          >Mark as posted</button>
          <button
            className="ph-btn ghost"
            disabled={busy}
            onClick={() => act(cancelPost(post))}
          >Cancel</button>
        </div>
      )}

      {status === 'queued' && (
        <div className="sq-actions">
          <button className="ph-btn ghost" disabled={busy} onClick={() => act(cancelPost(post))}>
            Cancel
          </button>
        </div>
      )}

      {/* Removing is for entries that never went out. A posted row has no
          remove button at all, rather than one that fails when pressed —
          firestore.rules refuses the delete either way, and a button that
          cannot work is worse than no button. */}
      {post.status !== 'posted' && (
        <div className="sq-actions">
          <button
            className="ph-btn ghost sq-remove"
            disabled={busy}
            onClick={async () => {
              setBusy(true); setErr(null);
              try { await removeScheduledPost(post); }
              catch { setErr('Could not remove it. Posts that already went out are kept on purpose.'); setBusy(false); }
            }}
          >Remove from queue</button>
        </div>
      )}
    </li>
  );
}

export function QueueTab() {
  const { posts, loading, error } = useSocialQueue();

  /* Which platforms can actually be posted to. Asked once on mount: the
   * answer registers the automatic adapters, so every row rendered after
   * this knows whether it can offer a send button or must ask for a
   * permalink. Before it resolves, adapterFor() returns the manual adapter,
   * which is the correct thing to show while we do not yet know. */
  const [capability, setCapability] = useState<PublishCapability | null>(null);
  useEffect(() => { void refreshAdapters().then(setCapability); }, []);

  const { live, settled } = useMemo(() => {
    const isSettled = (p: ScheduledPost) =>
      p.status === 'posted' || p.status === 'cancelled';
    return {
      live: posts.filter((p) => !isSettled(p)),
      settled: posts.filter(isSettled).reverse(),
    };
  }, [posts]);

  if (loading) return <div className="fld-pane"><p className="fld-empty">Loading the queue…</p></div>;
  if (error) return <div className="fld-pane"><p className="fld-error">{error}</p></div>;

  return (
    <div className="fld-pane">
      {/* No "schedule something" button here on purpose. A post is scheduled
          from the record it is about — on the approve desk as you publish it,
          or from the live feed afterwards — so the queue is somewhere you
          watch what is going out, not somewhere you start a new task. */}
      <div className="sq-toolbar">
        <span className="sq-summary">
          {live.length} waiting · {posts.filter((p) => p.status === 'posted').length} sent
          {capability?.configured && capability.platforms.length > 0 && (
            <span className="sq-connected">
              {' '}· posting as{' '}
              {capability.platforms
                .map((p) => `${PLATFORM_LIMITS[p].label} @${capability.handles[p] ?? ''}`)
                .join(', ')}
            </span>
          )}
        </span>
      </div>

      {live.length === 0 ? (
        <p className="fld-empty">
          Nothing scheduled. On the Approve tab, choose “Approve &amp; schedule a post”
          when you publish a record.
        </p>
      ) : (
        <ul className="sq-list">
          {live.map((p) => <QueueRow key={p.id} post={p} />)}
        </ul>
      )}

      {settled.length > 0 && (
        <>
          <h3 className="sq-heading">Already handled</h3>
          <ul className="sq-list settled">
            {settled.map((p) => <QueueRow key={p.id} post={p} />)}
          </ul>
        </>
      )}
    </div>
  );
}
