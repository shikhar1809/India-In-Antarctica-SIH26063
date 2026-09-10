/* ═══════════════════════════════════════════════ social dissemination ══
 *
 * The problem statement asks for content generated "for websites and social
 * media". The website half has always been real — publish.ts projects an
 * approved dispatch into publicArchive and the public site reads it. The
 * social half stopped at a caption and a PNG the publisher downloaded and
 * posted from their phone, which is a tool, not dissemination: nothing
 * recorded what went out, when, to which account, or whether it went out at
 * all.
 *
 * This is the missing half — a queue with a state machine, so a post is a
 * tracked object from the moment it is scheduled to the moment it lands.
 *
 * ── Two decisions worth defending ────────────────────────────────────────
 *
 * 1. A queue entry references a *published record*, never a dispatch. The
 *    same reasoning as publish.ts: if the queue could read a dispatch, then
 *    the raw field notes, the field party and an incident report's injuries
 *    are one careless template away from a public timeline. Scheduling is
 *    therefore only possible for material that already survived the
 *    projection and the admin gate.
 *
 * 2. Posting is an adapter, and the manual adapter is a first-class citizen
 *    rather than a fallback. Getting an X or LinkedIn app approved for a
 *    government account is a procurement exercise measured in weeks, and a
 *    system that cannot disseminate until that finishes is a system that
 *    cannot disseminate. So the queue is complete with no credential at all:
 *    it produces a ready-to-post package and records the outcome a publisher
 *    confirms. When a credential does arrive, an automatic adapter registers
 *    for that platform and the queue stops asking. Nothing else changes —
 *    not the data model, not the UI, not the audit trail.
 */

import type { RepositoryRecord } from '../repository/contract';

/** Platforms we disseminate to. Instagram stories are a rendering size in
 *  brand.ts, not a separate destination, so they are not listed here. */
export type SocialPlatform = 'x' | 'linkedin' | 'instagram';

export const SOCIAL_PLATFORMS: SocialPlatform[] = ['x', 'linkedin', 'instagram'];

export interface PlatformLimits {
  label: string;
  /** Hard character ceiling the platform itself enforces. */
  maxChars: number;
  /** Instagram has no post without an image; the others allow text-only. */
  imageRequired: boolean;
}

export const PLATFORM_LIMITS: Record<SocialPlatform, PlatformLimits> = {
  x:         { label: 'X',         maxChars: 280,  imageRequired: false },
  linkedin:  { label: 'LinkedIn',  maxChars: 3000, imageRequired: false },
  instagram: { label: 'Instagram', maxChars: 2200, imageRequired: true },
};

/* ─────────────────────────────────────────────────── the state machine ──
 *
 * queued ──► ready ──► posted
 *   │          │
 *   │          └────► failed ──► ready   (a retry re-enters the queue)
 *   └────────────────► cancelled
 *
 * 'ready' is separate from 'queued' because the thing that decides a post is
 * due is the clock, while the thing that decides it is *sendable* is
 * validation. Collapsing them hides the difference between "not yet" and
 * "never, because the caption is too long".                                */

export type PostStatus = 'queued' | 'ready' | 'posted' | 'failed' | 'cancelled';

export interface ScheduledPost {
  id: string;
  /** The published record this post disseminates. Never a dispatch id. */
  recordId: string;
  /** Denormalised so the queue renders without fetching every record, and so
   *  the audit trail survives the record being retitled later. */
  recordIdentifier: string;
  platform: SocialPlatform;
  caption: string;
  /** Rendered card, already exported by the studio. */
  imageUrl: string | null;
  /** Epoch ms. */
  scheduledFor: number;
  status: PostStatus;
  createdBy: string;
  createdAt: number;
  postedAt: number | null;
  /** Where it landed, once it has. A permalink is the only proof that
   *  dissemination happened, so it is stored rather than inferred. */
  externalUrl: string | null;
  /** How it went out — part of the record, not an implementation detail.
   *  "Posted by hand at 14:20" and "posted by the X adapter at 14:20" are
   *  different claims about the same row. */
  postedVia: 'manual' | SocialPlatform | null;
  error: string | null;
  /** The platform's own id for this post — a tweet id, a Graph API media
   *  id, a LinkedIn share URN. Stored automatically when the Upload-Post
   *  adapter sends it; recorded by hand on the "mark as posted" form for a
   *  post sent manually. X's and LinkedIn's are also recoverable from the
   *  permalink, but Instagram's is not — its permalink carries a shortcode
   *  the Graph API cannot look up — so without this an Instagram post's
   *  metrics can never be fetched. */
  platformPostId?: string | null;
  /** Real numbers pulled from the platform's own API by
   *  functions/engagement.js, never estimated or typed in — see that file
   *  for exactly how each platform is queried and why some entries never
   *  get one (no credential configured, or no platformPostId to query). */
  engagement?: EngagementSnapshot | null;
  /** Why the platform has no numbers for this post, in its own words —
   *  e.g. LinkedIn only reports per-post metrics for company-page posts.
   *  Written by functions/engagement.js; cleared once numbers arrive. */
  engagementNote?: string | null;
}

export interface EngagementSnapshot {
  likes: number;
  comments: number;
  /** Retweets/quotes on X, reposts on LinkedIn; Instagram's Graph API does
   *  not expose a share count at all, so this is 0 there rather than null —
   *  a real count of a thing the platform doesn't report, not a missing
   *  value. */
  shares: number;
  /** Impressions/views, where the platform reports them; null where it
   *  doesn't (Instagram, LinkedIn) rather than 0, since 0 views would be a
   *  claim about the post rather than an admission the API has no number. */
  views: number | null;
  /** Unique accounts reached, where the platform separates it from views. */
  reach?: number | null;
  /** Saves (Instagram) or bookmarks (X). */
  saves?: number | null;
  fetchedAt: number;
}

/* ──────────────────────────────────────────────────────────── validation ── */

export type IssueLevel = 'error' | 'warning';

export interface Issue {
  level: IssueLevel;
  message: string;
}

/** Hashtags and mentions still cost characters; no platform discounts them.
 *  Counted the simple way on purpose — X's weighted counting (every URL
 *  costing 23) is close enough to a plain count for captions this short that
 *  modelling it would be false precision. */
export function captionLength(caption: string): number {
  return caption.trim().length;
}

/**
 * Everything that would stop this post going out, checked at schedule time
 * rather than at send time.
 *
 * The distinction matters. A caption 40 characters over the limit is a
 * problem the publisher can fix now, while they still remember the post. The
 * same problem discovered by a background sender at 06:00 is a silent
 * failure nobody sees until someone asks why the announcement never went up.
 */
export function validatePost(
  post: Pick<ScheduledPost, 'platform' | 'caption' | 'imageUrl' | 'scheduledFor'>,
  now = Date.now(),
): Issue[] {
  const issues: Issue[] = [];
  const limits = PLATFORM_LIMITS[post.platform];
  const length = captionLength(post.caption);

  if (length === 0) {
    issues.push({ level: 'error', message: 'The caption is empty.' });
  } else if (length > limits.maxChars) {
    issues.push({
      level: 'error',
      message: `${length} characters — ${limits.label} allows ${limits.maxChars}. Trim ${length - limits.maxChars}.`,
    });
  } else if (length > limits.maxChars * 0.95) {
    issues.push({
      level: 'warning',
      message: `${length} of ${limits.maxChars} characters. Close to the limit.`,
    });
  }

  if (limits.imageRequired && !post.imageUrl) {
    issues.push({ level: 'error', message: `${limits.label} posts must have an image.` });
  }

  if (post.scheduledFor < now) {
    issues.push({ level: 'error', message: 'That time is in the past.' });
  }

  return issues;
}

export function canSend(post: ScheduledPost, now = Date.now()): boolean {
  if (post.status !== 'queued' && post.status !== 'ready' && post.status !== 'failed') return false;
  if (post.scheduledFor > now) return false;
  // Validated against its own scheduled time, so "the past" is not an error
  // for a post whose whole purpose is that its time has come.
  return validatePost(post, post.scheduledFor).every((i) => i.level !== 'error');
}

/** Derived status. Pure, so the queue view and any sender agree without one
 *  of them writing state the other has to trust. */
export function effectiveStatus(post: ScheduledPost, now = Date.now()): PostStatus {
  if (post.status === 'posted' || post.status === 'cancelled' || post.status === 'failed') {
    return post.status;
  }
  return post.scheduledFor <= now ? 'ready' : 'queued';
}

/* ───────────────────────────────────────────────────────────── scheduling ── */

/**
 * Build a queue entry from an already-published record.
 *
 * Takes a `RepositoryRecord` rather than a dispatch, which is the type-level
 * expression of decision (1) above: there is no overload accepting
 * unapproved material, so scheduling some is not a mistake available to make.
 */
export function schedulePost(
  record: RepositoryRecord & { id: string },
  platform: SocialPlatform,
  caption: string,
  scheduledFor: number,
  createdBy: string,
  imageUrl: string | null = null,
  now = Date.now(),
): { post: ScheduledPost; issues: Issue[] } {
  const post: ScheduledPost = {
    id: `${record.id}-${platform}-${scheduledFor}`,
    recordId: record.id,
    recordIdentifier: record.metadata.identifier,
    platform,
    caption: caption.trim(),
    imageUrl,
    scheduledFor,
    status: 'queued',
    createdBy,
    createdAt: now,
    postedAt: null,
    externalUrl: null,
    postedVia: null,
    error: null,
  };
  return { post, issues: validatePost(post, now) };
}

/* ────────────────────────────────────────────────────────────── adapters ── */

export interface PostResult {
  ok: boolean;
  externalUrl?: string;
  /** The platform's own id for the post, when the adapter learns it. It is
   *  what engagement is fetched by, so it is kept, not discarded. */
  platformPostId?: string;
  error?: string;
}

export interface PlatformAdapter {
  platform: SocialPlatform;
  /** False for the manual adapter: it prepares a post, a human sends it. */
  automatic: boolean;
  label: string;
  send(post: ScheduledPost): Promise<PostResult>;
}

/**
 * The always-available adapter. It cannot send anything and says so rather
 * than pretending — an honest `ok: false` beats a resolved promise that
 * quietly did nothing, which would put a 'posted' row in the audit trail for
 * a post that never existed.
 */
export const manualAdapter = (platform: SocialPlatform): PlatformAdapter => ({
  platform,
  automatic: false,
  label: `${PLATFORM_LIMITS[platform].label} — post by hand`,
  async send() {
    return { ok: false, error: 'No credential for this platform; a publisher posts it.' };
  },
});

const registry = new Map<SocialPlatform, PlatformAdapter>();

/** Registers an automatic adapter. Called at startup only when a credential
 *  for that platform is actually present, so `adapterFor()` reporting
 *  `automatic: false` always means "no credential", never "not wired yet". */
export function registerAdapter(adapter: PlatformAdapter): void {
  registry.set(adapter.platform, adapter);
}

export function adapterFor(platform: SocialPlatform): PlatformAdapter {
  return registry.get(platform) ?? manualAdapter(platform);
}

/** Test seam — the registry is module state, so it has to be resettable. */
export function clearAdapters(): void {
  registry.clear();
}

/* ───────────────────────────────────────────────────────────── sending ── */

/**
 * Attempt one post and return the row as it should now be stored.
 *
 * Returns a new object rather than mutating, so a caller that fails to
 * persist leaves the queue as it was instead of half-updated.
 */
export async function sendPost(post: ScheduledPost, now = Date.now()): Promise<ScheduledPost> {
  if (!canSend(post, now)) {
    return { ...post, status: effectiveStatus(post, now) };
  }

  const adapter = adapterFor(post.platform);
  if (!adapter.automatic) {
    // Nothing to do automatically; the row stays 'ready' so it keeps showing
    // in the publisher's queue until a human confirms it went out.
    return { ...post, status: 'ready' };
  }

  try {
    const result = await adapter.send(post);
    if (result.ok) {
      return {
        ...post,
        status: 'posted',
        postedAt: now,
        postedVia: post.platform,
        externalUrl: result.externalUrl ?? null,
        // Firestore rejects undefined, so an absent id is written as null.
        platformPostId: result.platformPostId ?? post.platformPostId ?? null,
        error: null,
      };
    }
    return { ...post, status: 'failed', error: result.error ?? 'The platform rejected the post.' };
  } catch (err) {
    return { ...post, status: 'failed', error: err instanceof Error ? err.message : String(err) };
  }
}

/** A publisher confirming they posted it themselves. The permalink is
 *  required: an unverifiable claim that something was posted is worth less
 *  than no claim at all, because it looks like evidence. */
export function confirmManualPost(
  post: ScheduledPost,
  externalUrl: string,
  now = Date.now(),
  platformPostId?: string,
): ScheduledPost {
  const url = externalUrl.trim();
  if (!url) return { ...post, error: 'A link to the post is required to mark it sent.' };
  const id = platformPostId?.trim();
  return {
    ...post,
    status: 'posted',
    postedAt: now,
    postedVia: 'manual',
    externalUrl: url,
    ...(id ? { platformPostId: id } : {}),
    error: null,
  };
}

export function cancelPost(post: ScheduledPost): ScheduledPost {
  if (post.status === 'posted') return post; // Sent is sent; cancelling it is a lie.
  return { ...post, status: 'cancelled' };
}
