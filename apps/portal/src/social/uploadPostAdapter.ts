/**
 * The automatic posting adapter, backed by Upload-Post.
 *
 * social/queue.ts always had the seam for this: `PlatformAdapter`, a registry,
 * and a manual adapter as the honest default that says it cannot send rather
 * than pretending. This registers a real one for each platform that actually
 * has a connected account behind it.
 *
 * Two things it deliberately does not do.
 *
 * It holds no credential. The Upload-Post key is a bearer token for NCPOR's
 * real social accounts, so it stays in the Cloud Function's environment; this
 * module only calls an endpoint. A key in a React bundle is a published key.
 *
 * It registers nothing it cannot deliver. `refreshAdapters()` asks the
 * function which platforms are genuinely connected and registers only those.
 * That keeps `adapterFor(p).automatic === false` meaning exactly one thing —
 * "this cannot be posted automatically" — so the queue never offers a button
 * that is certain to fail.
 */

import { auth } from '../firebase';
import {
  registerAdapter,
  type PlatformAdapter,
  type PostResult,
  type ScheduledPost,
  type SocialPlatform,
  PLATFORM_LIMITS,
} from './queue';

const BASE = 'https://asia-south1-indiainantartica.cloudfunctions.net/studio';

export interface PublishCapability {
  configured: boolean;
  platforms: SocialPlatform[];
  handles: Partial<Record<SocialPlatform, string>>;
  error?: string;
}

const NONE: PublishCapability = { configured: false, platforms: [], handles: {} };

/** Which platforms the deployment can actually post to right now. */
export async function publishCapability(): Promise<PublishCapability> {
  try {
    const res = await fetch(`${BASE}/publish-status`);
    if (!res.ok) return NONE;
    const body = await res.json();
    return {
      configured: !!body.configured,
      platforms: (body.platforms ?? []) as SocialPlatform[],
      handles: body.handles ?? {},
      error: body.error,
    };
  } catch {
    return NONE;
  }
}

/**
 * Sends one queued post.
 *
 * The image is passed by URL and fetched server side — Upload-Post takes the
 * file itself, and the browser cannot hand over a Storage object without
 * either downloading it first or leaking a credential.
 *
 * A response with no permalink is treated as a failure even when the upstream
 * call succeeded. The queue's whole premise is that a 'posted' row carries
 * proof; recording one without a link would put an unverifiable claim in the
 * audit trail, which is worse than a failure a publisher can retry.
 */
async function send(post: ScheduledPost): Promise<PostResult> {
  return sendNow(post.id);
}

/**
 * Sends one queue row now. The server claims the row, posts it, and writes
 * the outcome — the permalink, or the platform's reason — onto the row itself
 * (functions/socialsender.js), so the queue updates through its listener and
 * nothing here writes the result a second time.
 */
export async function sendNow(postId: string): Promise<PostResult> {
  const user = auth.currentUser;
  if (!user) return { ok: false, error: 'Sign in to post.' };
  try {
    const res = await fetch(`${BASE}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
      body: JSON.stringify({ postId }),
    });

    const body = await res.json().catch(() => ({}));

    if (!res.ok || !body.ok) {
      return { ok: false, error: body.error || `The platform rejected the post (${res.status}).` };
    }
    if (!body.url) {
      return { ok: false, error: 'Published, but no link came back — confirm it by hand.' };
    }

    return {
      ok: true,
      externalUrl: body.url,
      // Instagram's metrics are addressed by this id and nothing else, so it
      // is kept with the row rather than dropped once the link is known.
      platformPostId: body.postId ? String(body.postId) : undefined,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not reach the publisher.' };
  }
}

function adapterFor(platform: SocialPlatform, handle?: string): PlatformAdapter {
  return {
    platform,
    automatic: true,
    label: handle
      ? `${PLATFORM_LIMITS[platform].label} — posting as @${handle}`
      : `${PLATFORM_LIMITS[platform].label} — automatic`,
    send,
  };
}

/**
 * Asks the deployment what it can post to and registers those adapters.
 *
 * Called once when the queue mounts. Returns the capability so the UI can say
 * which account a post will go out as — a publisher about to post on behalf of
 * an institution should be able to see the handle before they click.
 */
export async function refreshAdapters(): Promise<PublishCapability> {
  const cap = await publishCapability();
  for (const platform of cap.platforms) {
    registerAdapter(adapterFor(platform, cap.handles[platform]));
  }
  return cap;
}
