# Integrated Polar Science Outreach & Knowledge Repository

**Smart India Hackathon — Problem Statement 26063**
National Centre for Polar and Ocean Research (NCPOR), Ministry of Earth Sciences

A system for getting Antarctic science from the ice to the public: a scientist
records an observation in the field, a publisher turns it into something a
general audience can read, an admin approves it, and it appears on the public
site and in a citable repository — with the raw report never leaving the
authenticated side.

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
  (Flutter,                compose wizard            approve            live archive
   offline-first)          + SOP checklist           + review           + charts
      │                         │                       │                   ▲
      │  dispatches             │  publicSummary        │  publicArchive    │
      └────────────────────────►└──────────────────────►└───────────────────┘
                                                        (public projection)

  Anyone           →      Knowledge Repository  →  Admin review  →  Public site
  (deposit a file)        (documents)              (Moderation)     (published)
```

Two things reach the public, and both are traceable to a source: a **field
dispatch** or a **repository deposit**. Nothing appears from nowhere.

---

## Repository layout

```
.
├── apps/
│   ├── game/            PolarQuest — 3D Antarctic station walkthrough (Three.js)
│   ├── portal/          Internal portal: review, compose, approve, moderate (React)
│   ├── public-site/     Public outreach site and Knowledge Repository (React)
│   └── scientist-app/   Field data capture, offline-first (Flutter)
├── functions/           Public read API (Cloud Functions, Node 22)
├── scripts/             Verification and one-off seeding
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

## Verifying it works

```bash
npm test                   # everything below, in order
```

| Command | What it proves |
|---|---|
| `npm run test:unit` | 53 unit tests over normalisation, outreach drafting and the public projection |
| `npm run test:pipeline` | A legacy-format dispatch travels the real pipeline, publishes, and reads back |
| `npm run test:api` | Against the **deployed** project: the repository is public, raw dispatches are not |
| `npm run test:e2e` | A real browser: the site renders live data, charts draw, no console errors |

`test:api` and `test:e2e` hit the live deployment, so they need no emulator —
and they assert the rules that are actually in force. See
[docs/TESTING.md](docs/TESTING.md).

## Documentation

| Document | Covers |
|---|---|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | How the four apps fit together, and why publishing is a projection |
| [DATA-MODEL.md](docs/DATA-MODEL.md) | Collections, the shared vocabulary, and the metadata profile |
| [API.md](docs/API.md) | The public read API |
| [SCIENTIST-APP.md](docs/SCIENTIST-APP.md) | The Flutter field app: capture, offline sync, validation |
| [TESTING.md](docs/TESTING.md) | What is tested, what isn't, and why |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Deploying each target, and seeding |
| [WORKFLOW.md](docs/WORKFLOW.md) | Research behind the Scientist → Publisher → Admin roles |
| [REFERENCES.md](docs/REFERENCES.md) | Source trace for every modelled station asset |

## Licence and attribution

Published records carry their own licence (`metadata.license`), defaulting to
CC BY 4.0. Station photography is sourced from Wikimedia Commons and credited
per image. Station models are traced to published sources in
[REFERENCES.md](docs/REFERENCES.md).
