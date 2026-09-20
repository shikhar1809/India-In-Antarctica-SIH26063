# Integrated Polar Science Outreach & Knowledge Repository

**Smart India Hackathon — Problem Statement 26063**
National Centre for Polar and Ocean Research (NCPOR), Ministry of Earth Sciences
Category: Software · Theme: Smart Education

A system for getting Antarctic science from the ice to the public: a scientist
records an observation in the field, a publisher turns it into something a
general audience can read, an admin approves it, and it appears on the public
site, in a citable repository, and — on a schedule — on social media. The raw
field report never leaves the authenticated side.

| | Live |
|---|---|
| Public site | https://iia-public.web.app |
| Outreach portal | https://iia-portal.web.app |
| PolarQuest (3D) | https://iia-game.web.app |
| Public API | https://asia-south1-indiainantartica.cloudfunctions.net/api/records |

---

## The pipeline

```
  Scientist            Admin                Publisher            Admin            Public
  ─────────            ─────                ─────────            ─────            ──────
  Field app      →     AI screening   →     Post studio    →     Approve     →    Public site
  (Flutter,            + redaction          + SOP checklist      + review         live archive
   offline-first,      (admin only)         (agentic)            + marks up       + charts
   satellite sync)         │                     │                   │                ▲
      │  dispatches        │  cleared            │  publicSummary    │ publicArchive  │
      └───────────────────►└────────────────────►└──────────────────►└───────┬────────┘
         status: raw          status: cleared       status: drafted   (projection)
                                                                              │
                                                                              ▼
                                                                    Dissemination queue
                                                                    → X / LinkedIn / Instagram
                                                                      (sent automatically when
                                                                       due; engagement and
                                                                       deletions read back)

  Anyone           →      Knowledge Repository  →  Admin review  →  Public site
  (deposit a file)        (documents)              (Moderation)     (published)
```

Two things reach the public, and both are traceable to a source: a **field
dispatch** or a **repository deposit**. Nothing appears from nowhere.

Every way into the portal passes a sign-in security check, and everything
done inside it lands in an append-only activity log.

---

## What is actually in here

**Real data, not placeholders.** The archive serves genuine measurements from
India's Maitri station — 753 daily total-column ozone readings (1999–2006) and
143 balloon-borne ozonesonde flights carrying 7,555 measured levels
(1994–2011), taken by the India Meteorological Department and archived by the
WMO Global Atmosphere Watch through the WOUDC. `scripts/ingest-woudc-maitri.mjs`
pulls them from the WOUDC API and writes them with their attribution intact.

**Publishing is a projection, not a permission change.** An approved dispatch
is not "unlocked" for public reading. A separate public record is built field
by field from material a publisher wrote *for* the public, so admin notes, the
field party, sample identifiers and raw incident notes cannot leak by accident.
`publish.test.ts` proves it by seeding every internal field with a sentinel and
asserting none survive.

**A redaction preview.** The boundary above is invisible to the person clicking
Approve, so the review desk shows three columns — what was collected, what is
withheld and *why*, and what publishes. The rule table is typed against
`keyof Dispatch`, so adding a field without deciding its disposition is a
compile error, not a silent leak.

**The post studio is an agent that explains itself.** A publisher writes
one line about what happened. Across eleven visible steps the agent
classifies the content type, finds the archive record behind the brief,
reads each platform's demands, reads the accounts' real analytics (reach,
best day to post, who follows), learns from how the portal's own posts
performed, checks what the public is paying attention to (Wikipedia
interest, recent news, upcoming observances), gathers sources (Wikipedia
background, peer-reviewed papers with DOIs) and searches for visual
references. Every step shows **what it looked at** (linked), **how it
reasoned**, **what it decided** and **how confident it is**.

Where it cannot decide well — an ambiguous content type, an archive match it
is unsure of, Instagram with no photograph, a brief too thin to write from,
an observance the post could be tied to — **it stops and asks the
publisher**, and says why. The full record, including the exact
instructions the writer received, is saved with the submission and shown to
the admin in the approve desk as *How the agent made this post*. Research
reaches the writer with fences: headlines are context, never facts; papers
are cited by DOI or not at all, and only if they are on the post's subject.
See [docs/STUDIO.md](docs/STUDIO.md).

**Marks on the graphic become revisions.** The publisher has the same
annotator the approvals desk uses, on their own post. Pinned comments and
the marked-up render both go to the model, because *"this overlaps the
roofline"* cannot be acted on from text alone — and every note comes back
paired with what was actually done about it.

**Two SOP checks are no longer an honour system.** The photograph is looked
at by a vision model for a visible credit or watermark and for anything a
government account must not publish. A clean verdict ticks the box the
publisher can still untick; a blocker disables submission. The verdict is
stored on the dispatch so an approver sees the evidence, not just the tick.

**A normalisation layer.** A scientist can be on the ice for a season running
whatever build was installed before they left, so the portal never assumes
current-format data. Old station names, METAR codes and 16-point bearings are
repaired — and every repair raises a warning shown to the publisher rather than
being rewritten silently.

**Dissemination that actually posts.** Scheduled posts are tracked objects
with a state machine, validated against each platform's limits at schedule
time. With an Upload-Post key configured, *Post now* publishes to X,
LinkedIn and Instagram — one platform per call, so each gets its own
caption, and a publish that returns no permalink is recorded as a failure,
never as a success. With no key the queue works by hand, as it always did.
See [docs/SOCIAL.md](docs/SOCIAL.md).

**Analytics read from the platforms themselves.** The outreach dashboard
shows each connected account's followers, 30-day reach, week-on-week change
and (for Instagram) audience by age and place, and — separately — every post
the portal sent with its own likes, comments, shares and views. Account
totals and per-post numbers are never added together, metrics are never
summed across platforms (reach, impressions and page reach are different
units), and a metric a platform does not report is shown as *not reported*,
not as zero.

**Roles that mean something.** Scientist, Publisher, Admin and **Site
Manager** — the last opens the Site section and nothing else, enforced on the
routes and in the database rules, not just the menu. An admin can **revoke**
anyone: the rules then refuse that person's own role writes, so the
self-service role switcher cannot put them back. See
[docs/ACCESS.md](docs/ACCESS.md).

**A checked entrance.** Every sign-in verifies credentials, asks consent,
records the IP as the server saw it and the device's location, and checks
the person has actually been granted a role. An account nobody granted
access to — or one that was revoked — gets a formal Government of India
warning and is signed out after five seconds, and the attempt is logged by
the server.

**An activity log nobody can edit, of everything.** A Firestore trigger
records every create, edit and delete across the database — from the portal,
the field app or the public site — with who made it, a field-level diff
(a block-by-block diff for public-site edits), and a category: Security,
Access, Archive, Field reports, Post requests, Media studio, Review &
approval, Social, Website. Written by the server, so it cannot be skipped;
nobody, admins included, can edit or delete an entry.

**Admins can ask for a post.** *Create a new post* on the Media page is a
four-step request — what, who and where, when, review — that lands in the
publisher queue, opens the studio pre-set with the admin's choices, and on
approval promotes the linked archive record instead of copying it.

**Concept search.** "Penguins" finds a record filed as *Wildlife observation*,
and a typo still lands — a local, instant, domain-vocabulary ranker rather than
substring matching.

**Nothing from the ice reaches the public unscreened.** A field report
arrives as `raw`, visible to admins and its author and nobody else. On the
admin's desk a screening pass — rules plus a model, each finding quoted from
the text it came from — flags names, contact details, health information,
exact positions and anything else a government account should not publish.
The admin redacts what it found, in place, and only then does the report go
to the public site and to the publishers. Findings the model cannot quote
verbatim from the field notes are dropped rather than shown, so a
hallucinated finding cannot become a redaction. See
[docs/SCREENING.md](docs/SCREENING.md).

**The field app is built for a satellite link.** Indian stations reach the
world over a link that is slow, metered and drops. So reports are written and
stored offline; photographs are shrunk (2048 px, EXIF stripped) before
sending; every file goes up resumably in 512 KB pieces, so a dropped link
resumes instead of starting over; and the app retries on reconnection and
every two minutes while anything is queued. Each report shows QUEUED →
SENDING (with progress) → SYNCED, or the reason it did not go. Windows and
Android builds come from the same codebase.

**Approved posts go out by themselves.** Approving a post publishes the
record *and* posts it to every platform the publisher wrote a caption for,
each with its own caption and its own finished graphic. Anything scheduled
for later is sent by a function that runs every five minutes, so a post timed
for 06:00 does not wait for someone to open the queue. A send records the
platform's own permalink or its refusal; the endpoint that posts is
restricted to signed-in publishers and admins.

**The front page is the archive, live.** The home page opens as a section
front — a lead story, a photograph-led centre, two stories down the right and
a strip of more underneath — built from published records, ordered by latest
activity, so a record posted about yesterday leads today. Nothing on it is
hand-curated.

**An outreach game.** PolarQuest is a 3D walkthrough of Maitri, Bharati and
Dakshin Gangotri built from published sources, with coordinates and founding
dates traced in `docs/REFERENCES.md`.

---

## Repository layout

```
.
├── apps/
│   ├── game/            PolarQuest — 3D Antarctic station walkthrough (Three.js)
│   ├── portal/          Internal portal: review, compose, approve, moderate (React)
│   │   ├── repository/    contract, normalise, summarise, publish, redaction, search
│   │   ├── social/        dissemination queue, scheduling, Upload-Post adapter, analytics client
│   │   ├── studio/        agentic post studio: analyse → research → reference → write → mark up → check
│   │   │                    insight.ts (reach, performance, trends, sources), trace.ts (the agent's record)
│   │   ├── review/        annotation tools and the approvals desk's checks
│   │   ├── audit/         activity log writer and the site-editor diff
│   │   └── security/      sign-in check client and the rules regression guard
│   ├── public-site/     Public outreach site and Knowledge Repository (React)
│   └── scientist-app/   Field data capture, offline-first (Flutter + SQLite)
├── functions/           Cloud Functions (Node 22, asia-south1):
│                          api (public read API) · studio (copy, refs, research, review,
│                            screen, publish, send) · sendDuePosts (scheduled sender)
│                          engagement (analytics, liveness) · access (sign-in check)
├── scripts/             Ingestion, verification and seeding
│   └── lib/             Shared REST + credential helpers
├── docs/                Architecture, data model, API, testing, deployment
├── firestore.rules      The security boundary — read this before the code
└── storage.rules
```

## Getting started

```bash
npm run install:all        # installs portal, public-site, game and functions
npm run dev:portal         # or dev:site / dev:game
```

The Flutter app is separate:

```bash
cd apps/scientist-app
flutter pub get
flutter run                     # or:
flutter build windows --release # Windows desktop
flutter build apk --release     # Android
```

A ready-to-run Windows build and the Android APK are published at
[Scientist_App_Sih](https://github.com/shikhar1809/Scientist_App_Sih).

Roles are stored in `roles/{uid}`. To grant one from the command line:

```bash
node scripts/set-role.mjs <uid|email> admin
```

### Configuration

Everything works on a fresh clone with no credentials — each integration
degrades to a working manual path. To turn them on, set these in
`functions/.env` (gitignored) or with `firebase functions:secrets:set`:

| Variable | Turns on |
|---|---|
| `GEMINI_API_KEY` | Caption generation, A/B judgement, markup revisions, the photograph check |
| `UPLOAD_POST_API_KEY`, `UPLOAD_POST_PROFILE` | Posting to X, LinkedIn and Instagram, and reading their analytics |
| `GOOGLE_CSE_KEY`, `GOOGLE_CSE_CX` | Google as an extra visual-reference provider |

No key is ever shipped to the browser.

### Seeing screens without signing in

`npm run dev:portal` serves dev-only routes that render the real components
against fixtures — useful because nearly everything else sits behind Google
sign-in:

| Route | Shows |
|---|---|
| `/__studio` | The full compose flow and agent, against a mock dispatch (hits the live functions) |
| `/__analytics` | The outreach dashboard, synthetic data |
| `/__access` | The activity log and the revoke control |
| `/__securitycheck?status=granted\|unassigned\|revoked` | The sign-in check |
| `/__postrequest` | The admin's *Create a new post* wizard (never writes) |
| `/__archive` | The archive page, including the side-by-side / stacked layout switch |
| `/__canvas`, `/__recordeditor` | Every post template; the raw/redacted record editor |

All are excluded from production builds.

## Verifying it works

```bash
npm test                   # everything below, in order
```

| Command | What it proves |
|---|---|
| `npm run test:functions` | The audit trail: how each kind of write is described and categorised, and what is deliberately not logged |
| `npm run test:unit` | 274 unit tests over normalisation, outreach drafting, the public projection, redaction, the studio agent's classification, archive detection and research findings (reach, performance, trends, off-topic paper rejection, the fences on how research may be used), the site-editor diff, concept search, the dissemination queue, and the rules — including that the activity log is append-only and a revoked account cannot restore itself |
| `npm run test:pipeline` | A legacy-format dispatch travels the real pipeline, publishes, and reads back |
| `npm run test:api` | Against the **deployed** project: the repository is public, raw dispatches are not |
| `npm run test:e2e` | A real browser: the site renders live data, charts draw, no console errors |

`test:api` and `test:e2e` hit the live deployment, so they need no emulator —
and they assert the rules that are actually in force. See
[docs/TESTING.md](docs/TESTING.md).

## The public API

Open, CORS-enabled, read-only — so a school, a newsroom or another MoES system
can build on the archive with one fetch.

```bash
curl https://asia-south1-indiainantartica.cloudfunctions.net/api/records?station=maitri
curl https://asia-south1-indiainantartica.cloudfunctions.net/api/stats
```

Full reference in [docs/API.md](docs/API.md).

The portal's own endpoints are authenticated-side tooling rather than public
API:

| Function | Routes | Documented in |
|---|---|---|
| `studio` | `/copy`, `/refs`, `/abtest`, `/revise`, `/moderate`, `/review`, `/screen`, `/trends`, `/sources`, `/publish`, `/send`, `/publish-status` | [STUDIO.md](docs/STUDIO.md), [SCREENING.md](docs/SCREENING.md), [SOCIAL.md](docs/SOCIAL.md) |
| `sendDuePosts` | Scheduled (every 5 minutes) — sends queued posts whose time has come | [SOCIAL.md](docs/SOCIAL.md) |
| `engagement` | `GET` account analytics · `POST` per-post engagement refresh | [SOCIAL.md](docs/SOCIAL.md) |
| `access` | `GET` caller's IP · `POST` sign-in check and log entry | [ACCESS.md](docs/ACCESS.md) |
| `auditTrail` | Firestore trigger (us-central1) — every write, logged with a diff | [ACCESS.md](docs/ACCESS.md) |

With no `GEMINI_API_KEY` configured the model-backed studio routes return 503
and the studio falls back to an offline template draft, so the whole flow
still works on a fresh clone with no credentials.

## Documentation

| Document | Covers |
|---|---|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | How the apps fit together, why publishing is a projection, how dissemination works |
| [DATA-MODEL.md](docs/DATA-MODEL.md) | Collections, the shared vocabulary, and the metadata profile |
| [API.md](docs/API.md) | The public read API |
| [STUDIO.md](docs/STUDIO.md) | The agentic post studio: the eleven steps, research, explainability and when it asks, the image providers, markup, A/B, the photograph check |
| [SOCIAL.md](docs/SOCIAL.md) | Posting to X, LinkedIn and Instagram, reading analytics back, the outreach dashboard |
| [ACCESS.md](docs/ACCESS.md) | Roles, Site Manager, revoking, the sign-in security check, the activity log and what its rules guarantee |
| [SCREENING.md](docs/SCREENING.md) | Screening a field report for personal and sensitive content, and how redaction is recorded |
| [SCIENTIST-APP.md](docs/SCIENTIST-APP.md) | The Flutter field app: capture, offline and satellite sync, validation |
| [TESTING.md](docs/TESTING.md) | What is tested, what isn't, and why |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Deploying each target, and seeding |
| [WORKFLOW.md](docs/WORKFLOW.md) | Research into how real Antarctic programmes handle data |
| [REFERENCES.md](docs/REFERENCES.md) | Source trace for every modelled station asset |

## Known limits

Stated plainly, because a reviewer will find them anyway:

- **The role switcher is self-service.** Any signed-in user can set their own
  role — it is how all four roles are demonstrated from one browser. Revoked
  accounts are locked out of it by the rules, but a production deployment
  would remove it.
- **The connected social accounts in the demo are the team's own**, not
  NCPOR's; the numbers are real but describe those accounts. Connecting
  NCPOR's accounts in Upload-Post needs no code change.
- **LinkedIn gives no per-post metrics for personal-profile posts** — only
  for company pages. The dashboard shows LinkedIn's own reason.
- **News comes from Google News RSS**, which is fine for a demonstration; a
  production system should use a licensed news API.
- **Uptime history on the Site page is mocked** until a real monitor is
  connected, and says so.
- **Student questions are answered by hand, in the portal.** The loop works
  end to end — ask, moderate, answer from the field app, publish — but there
  is no notification anywhere in it: a moderator has to look.

## Licence and attribution

Published records carry their own licence (`metadata.license`), defaulting to
CC BY 4.0. Ozone measurements are reproduced from the WOUDC under its terms —
free for scientific, educational and policy use provided the contributing
agency (IMD) and the WOUDC are credited, which every exported file and record
does. Station photography is sourced from Wikimedia Commons and credited per
image. The studio's research links every source it used: Wikipedia (CC
BY-SA), OpenAlex (CC0 metadata) and news publishers, whose headlines are
shown as links, never republished. Visual references surfaced in the studio are shown with their licence
and a link to the source, and are reference material — nothing is baked into
a published graphic on the agent's own initiative. Station models are traced to published sources in
[REFERENCES.md](docs/REFERENCES.md).
