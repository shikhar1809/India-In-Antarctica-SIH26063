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
  Scientist                Publisher                 Admin              Public
  ─────────                ─────────                 ─────              ──────
  Field app         →      Portal            →       Portal        →    Public site
  (Flutter,                post studio               approve            live archive
   offline-first)          + SOP checklist           + review           + charts
      │                         │                       │                   ▲
      │  dispatches             │  publicSummary        │  publicArchive    │
      └────────────────────────►└──────────────────────►└─────────┬─────────┘
                                                        (projection)
                                                                  │
                                                                  ▼
                                                          Dissemination queue
                                                          → X / LinkedIn / Instagram

  Anyone           →      Knowledge Repository  →  Admin review  →  Public site
  (deposit a file)        (documents)              (Moderation)     (published)
```

Two things reach the public, and both are traceable to a source: a **field
dispatch** or a **repository deposit**. Nothing appears from nowhere.

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

**The post studio is an agent you can watch.** A publisher writes one line
about what happened; the studio then classifies the content type from the
wording and quotes the phrases that decided it, searches the archive for a
record the brief refers to and pulls its facts in, infers audience and tone
(never overriding a choice the publisher made), reads what each selected
platform demands, measures how previous posts were written, and searches the
web for visual references — showing each decision, and what it is looking
at, before a word is generated. What the publisher watched it decide is
literally what the model is then given as its brief. See
[docs/STUDIO.md](docs/STUDIO.md).

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

**Dissemination with an audit trail.** Scheduled posts are tracked objects with
a state machine, validated against each platform's limits at schedule time.
Posting is an adapter: the queue works with no API credential at all (a
publisher posts and confirms with the permalink), and registering an automatic
adapter later changes nothing else.

**Concept search.** "Penguins" finds a record filed as *Wildlife observation*,
and a typo still lands — a local, instant, domain-vocabulary ranker rather than
substring matching.

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
│   │   ├── social/        dissemination queue, scheduling, platform adapters
│   │   ├── studio/        agentic post studio: analyse → reference → write → mark up → check
│   │   ├── review/        annotation tools and the approvals desk's checks
│   │   └── security/      rules regression guard
│   ├── public-site/     Public outreach site and Knowledge Repository (React)
│   └── scientist-app/   Field data capture, offline-first (Flutter + SQLite)
├── functions/           Public read API, studio agent, image search (Cloud Functions, Node 22)
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
cd apps/scientist-app && flutter pub get && flutter run
```

Roles are stored in `roles/{uid}`. To grant one from the command line:

```bash
node scripts/set-role.mjs <uid|email> admin
```

## Verifying it works

```bash
npm test                   # everything below, in order
```

| Command | What it proves |
|---|---|
| `npm run test:unit` | 246 unit tests over normalisation, outreach drafting, the public projection, redaction, the studio agent's classification and archive detection, concept search, the dissemination queue and the rules |
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

The studio's own endpoints (`/studio/copy`, `/refs`, `/abtest`, `/revise`,
`/moderate`) are authenticated-side tooling rather than public API, and are
documented in [docs/STUDIO.md](docs/STUDIO.md). With no `GEMINI_API_KEY`
configured they return 503 and the studio falls back to an offline template
draft, so the whole flow still works on a fresh clone with no credentials.

## Documentation

| Document | Covers |
|---|---|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | How the apps fit together, why publishing is a projection, how dissemination works |
| [DATA-MODEL.md](docs/DATA-MODEL.md) | Collections, the shared vocabulary, and the metadata profile |
| [API.md](docs/API.md) | The public read API |
| [STUDIO.md](docs/STUDIO.md) | The agentic post studio: what the agent works out, the image providers, markup, A/B, the photograph check |
| [SCIENTIST-APP.md](docs/SCIENTIST-APP.md) | The Flutter field app: capture, offline sync, validation |
| [TESTING.md](docs/TESTING.md) | What is tested, what isn't, and why |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Deploying each target, and seeding |
| [WORKFLOW.md](docs/WORKFLOW.md) | Research into how real Antarctic programmes handle data |
| [REFERENCES.md](docs/REFERENCES.md) | Source trace for every modelled station asset |

## Licence and attribution

Published records carry their own licence (`metadata.license`), defaulting to
CC BY 4.0. Ozone measurements are reproduced from the WOUDC under its terms —
free for scientific, educational and policy use provided the contributing
agency (IMD) and the WOUDC are credited, which every exported file and record
does. Station photography is sourced from Wikimedia Commons and credited per
image. Visual references surfaced in the studio are shown with their licence
and a link to the source, and are reference material — nothing is baked into
a published graphic on the agent's own initiative. Station models are traced to published sources in
[REFERENCES.md](docs/REFERENCES.md).
