# Social publishing and analytics

How an approved post actually reaches X, LinkedIn and Instagram, and how the
numbers come back.

---

## Publishing

The dissemination queue ([`social/queue.ts`](../apps/portal/src/social/queue.ts))
always had an adapter seam: a manual adapter as the honest default — it
prepares a post and a publisher confirms it went out with the permalink.
[`social/uploadPostAdapter.ts`](../apps/portal/src/social/uploadPostAdapter.ts)
registers an automatic adapter for each platform that genuinely has an
account connected, backed by [Upload-Post](https://upload-post.com)'s unified
publishing API.

- **One platform per call.** The studio writes a different caption for each
  platform; Upload-Post's multi-platform form takes one caption, so fanning
  out would post the same words everywhere.
- **No permalink, no success.** A publish that returns no link is recorded as
  a failure the publisher can retry — a *posted* row with no link is an
  unverifiable claim in the audit trail.
- **Retries don't double-post.** Each call carries an idempotency key built
  from the queue row and platform.
- **The platform's own post id is kept** (`platformPostId`). Instagram's
  metrics are addressed by media id and nothing else — its permalink carries
  a shortcode the Graph API cannot look up.
- **Only connected platforms get a *Post now* button.** The portal asks
  `/studio/publish-status` which accounts are linked and registers adapters
  for those alone.

The key is a bearer credential for real social accounts, so it lives only in
the Cloud Function's environment ([`functions/publishpost.js`](../functions/publishpost.js)).
With none set, `/studio/publish` returns 503 and the queue works exactly as
before — by hand.

---

## Analytics

[`functions/engagement.js`](../functions/engagement.js) reads the numbers
back, with Upload-Post as the single credential for all three platforms (a
platform-specific token, if set, still wins for that platform).

| Call | Returns | Who |
|---|---|---|
| `GET /engagement` | Per account: followers, 30-day reach or impressions and the daily series, likes/comments/shares/saves where reported, LinkedIn page traffic, Instagram follower demographics | Staff, or anyone granted analytics access |
| `POST /engagement` | Writes each sent post's own likes, comments, shares, views onto its queue row; a platform that won't report stores its reason (`engagementNote`) | Publishers and admins |

Account totals are cached per instance for five minutes; the dashboard's
*Sync now* skips the cache.

### Two kinds of number, kept apart

**Account totals** describe everything the account posted, including posts
that never went near the portal. **Per-post numbers** describe what the
portal sent. The dashboard shows them separately and never adds them
together — and never sums metrics across platforms, because Instagram's
headline is unique reach, X's is impressions and LinkedIn's is page reach.

### What each platform actually reports

Checked against the live API, not the docs:

| Platform | Account | Per post |
|---|---|---|
| Instagram | Followers, reach, views, likes, comments, shares, saves, accounts engaged, follower age / gender / country / city (above 100 followers) | Yes, by media id |
| LinkedIn | Followers, reach, impressions, page views (desktop / mobile) | **Only for company-page posts** — posts from a personal profile return LinkedIn's own explanation, which the dashboard shows |
| X | Followers, impressions | Likes, replies, reposts, quotes, bookmarks, impressions |

A metric a platform does not report is shown as *not reported*, never as
zero.

---

## The dashboard

[`pages/Analytics.tsx`](../apps/portal/src/pages/Analytics.tsx) — *Outreach
dashboard*:

- **Overview** — service delivery and governance tiles, admin-arrangeable
- **Social performance** — combined followers and the split by platform; a
  card per account with its 30-day trend (today's partial day excluded),
  change on the prior week and the metrics it reports; Instagram's audience;
  and every post sent from the portal with its own numbers
- **Dissemination** — sent / pending / failed per platform
- **Coverage & currency** — records by category and station, archive growth,
  station freshness

Platform colours were chosen with a colour-vision-deficiency validator
against the portal's panel colour, and every chart has a table view.

`/__analytics` (dev only) renders the dashboard against synthetic fixtures
without signing in.

---

## Configuration

`functions/.env` (gitignored), or `firebase functions:secrets:set` in
production:

```
UPLOAD_POST_API_KEY=...     # publishing and analytics
UPLOAD_POST_PROFILE=...     # the Upload-Post profile the accounts are linked to
```
