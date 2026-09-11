/**
 * Is a post the portal sent still up?
 *
 * A post deleted on the platform stays "posted" in the queue forever unless
 * something asks the platform. Upload-Post cannot be relied on for this: it
 * keeps returning a deleted tweet's metrics as zeros, and for Instagram it
 * says only "the post may have been deleted or the token expired". So each
 * platform is asked the most direct question it answers without a login:
 *
 *   X          the public syndication endpoint (what embedded tweets use):
 *              a live tweet is a `Tweet`, a deleted one a `TweetTombstone`,
 *              one that never existed a 404.
 *   LinkedIn   the public embed page: 200 while the post exists, 404 once
 *              it is deleted.
 *   Instagram  there is no public check (the embed renders client-side and
 *              looks the same live or gone), so Upload-Post's per-post error
 *              is used — but only counted as "removed" when the account's
 *              own token demonstrably still works. Otherwise: unknown.
 *
 * Every verdict says how it was reached. "unknown" is a real answer, and the
 * page shows it as such — a check that failed is never reported as "live".
 */

const UA = 'Mozilla/5.0 (compatible; IIA-Portal-LivenessCheck/1.0; +https://iia-portal.web.app)';

/** The token X's syndication endpoint expects, derived from the id. */
function syndicationToken(id) {
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '');
}

function tweetId(post) {
  return String(post.platformPostId || '').match(/^\d+$/)?.[0]
    || post.externalUrl?.match(/status\/(\d+)/)?.[1]
    || null;
}

function linkedinUrn(post) {
  const fromId = String(post.platformPostId || '').match(/urn:li:(?:share|ugcPost|activity):\d+/)?.[0];
  return fromId || post.externalUrl?.match(/urn:li:(?:share|ugcPost|activity):\d+/)?.[0] || null;
}

const verdict = (state, how, note) => ({ state, how, ...(note ? { note } : {}), checkedAt: Date.now() });

async function checkX(post, fetchImpl) {
  const id = tweetId(post);
  if (!id) return verdict('unknown', 'x-syndication', 'No tweet id on this post.');
  const res = await fetchImpl(`https://cdn.syndication.twimg.com/tweet-result?id=${id}&token=${syndicationToken(id)}`, {
    headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000),
  });
  if (res.status === 404) return verdict('removed', 'x-syndication', 'X has no post with this id.');
  if (!res.ok) return verdict('unknown', 'x-syndication', `X returned ${res.status}.`);
  const body = await res.json().catch(() => null);
  if (body?.__typename === 'TweetTombstone') {
    const text = body?.tombstone?.text?.text || 'This post is no longer available.';
    return verdict('removed', 'x-syndication', text.replace(/\s*Learn more\s*$/i, ''));
  }
  if (body?.__typename === 'Tweet' || body?.id_str) return verdict('live', 'x-syndication');
  return verdict('unknown', 'x-syndication', 'X gave an answer this check does not recognise.');
}

async function checkLinkedin(post, fetchImpl) {
  const urn = linkedinUrn(post);
  if (!urn) return verdict('unknown', 'linkedin-embed', 'No LinkedIn post URN on this post.');
  const res = await fetchImpl(`https://www.linkedin.com/embed/feed/update/${urn}`, {
    headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(15000),
  });
  if (res.status === 404 || res.status === 410) return verdict('removed', 'linkedin-embed', 'LinkedIn reports the post no longer exists.');
  if (res.ok) return verdict('live', 'linkedin-embed');
  return verdict('unknown', 'linkedin-embed', `LinkedIn returned ${res.status}.`);
}

/**
 * Instagram, via Upload-Post's per-post lookup. `accountOk` is whether the
 * Instagram account's own analytics read cleanly just now — the only way to
 * tell "this post is gone" from "the token is dead".
 */
async function checkInstagram(post, { fetchImpl, key, profile, accountOk }) {
  const id = post.platformPostId;
  if (!id) return verdict('unknown', 'instagram-api', 'No Instagram media id on this post.');
  if (!key) return verdict('unknown', 'instagram-api', 'No Upload-Post key configured.');
  const qs = new URLSearchParams({ platform_post_id: String(id), platform: 'instagram', user: profile });
  const res = await fetchImpl(`https://api.upload-post.com/api/uploadposts/post-analytics?${qs}`, {
    headers: { Authorization: `Apikey ${key}` }, signal: AbortSignal.timeout(30000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return verdict('unknown', 'instagram-api', body.message || `Upload-Post returned ${res.status}.`);
  const node = body.platforms?.instagram;
  if (node?.post_metrics && !node.post_metrics_error) return verdict('live', 'instagram-api');
  const err = String(node?.post_metrics_error || '');
  if (/deleted|does not exist|not found|HTTP 400/i.test(err)) {
    return accountOk
      ? verdict('removed', 'instagram-api', 'Instagram no longer returns this post, while the account itself reads normally.')
      : verdict('unknown', 'instagram-api', 'Instagram did not return the post, and the account could not be read either — the connection may have expired.');
  }
  return verdict('unknown', 'instagram-api', err || 'No answer for this post.');
}

/** One post's verdict. Never throws: a failed check is `unknown`. */
async function checkLive(post, ctx) {
  const fetchImpl = ctx.fetchImpl || fetch;
  try {
    if (post.platform === 'x') return await checkX(post, fetchImpl);
    if (post.platform === 'linkedin') return await checkLinkedin(post, fetchImpl);
    if (post.platform === 'instagram') return await checkInstagram(post, { ...ctx, fetchImpl });
    return verdict('unknown', 'none', `No liveness check for ${post.platform}.`);
  } catch (err) {
    return verdict('unknown', post.platform, `The check failed: ${String(err?.message || err)}`);
  }
}

module.exports = { checkLive, syndicationToken, tweetId, linkedinUrn };
