# Architecture

Four applications, one Firebase project. They share a backend but deploy
independently, which shapes most of the decisions below.

## The four apps

| App | Stack | Audience | Deploys to |
|---|---|---|---|
| `apps/scientist-app` | Flutter / Dart, SQLite | Scientists in the field | Desktop build |
| `apps/portal` | React 19, Vite, TypeScript | Publishers and admins | `iia-portal.web.app` |
| `apps/public-site` | React 19, Vite, TypeScript | General public | `iia-public.web.app` |
| `apps/game` | Three.js, vanilla JS | Students, outreach | `iia-game.web.app` |
| `functions` | Cloud Functions, Node 22 | Third-party consumers | `asia-south1` |

## Data flow

```
┌──────────────────┐   dispatches    ┌──────────────────┐
│  scientist-app   │ ──────────────► │      portal      │
│  offline SQLite  │  (auth'd write) │  review, compose │
└──────────────────┘                 └────────┬─────────┘
                                              │ admin approves
                                              ▼
┌──────────────────┐   documents     ┌──────────────────┐
│  anyone signed   │ ──────────────► │   publicArchive  │  world-readable
│  in (a deposit)  │   admin review  │   (a projection) │
└──────────────────┘                 └────────┬─────────┘
                                              │
                        ┌─────────────────────┴────────────────────┐
                        ▼                                          ▼
                ┌───────────────┐                          ┌──────────────┐
                │  public-site  │                          │  /api/records│
                │  live archive │                          │  JSON, CORS  │
                └───────────────┘                          └──────────────┘
```

## Why publishing is a projection, not a permission change

The obvious way to put approved reports on the public site is to loosen
`firestore.rules` so anyone may read a dispatch where `status == 'approved'`.
That is not what this system does, and the reason is worth stating plainly.

A dispatch carries `adminNotes`, `sopChecklist`, `teamMembers`, `safetyFlag`,
`sampleIds` and the scientist's raw field notes — which on an incident report
include injuries. Under a rule-based approach, every one of those is one rule
edit or one new field away from being public, and the failure is silent.

Instead, `apps/portal/src/repository/publish.ts` builds a **separate document**
field by field, from material a publisher wrote *for* the public. There is no
spread of the source dispatch anywhere in that function. A leak would require
someone to deliberately add the field, and `publish.test.ts` asserts it hasn't
happened by seeding every internal field with a sentinel string and checking
none of them survive.

Two further guards live in `canPublishDispatch()`: anything with
`safetyFlag: true`, and anything whose activity is `Emergency / incident`, is
refused publication outright regardless of what an admin clicks.

## The shared vocabulary problem

The three codebases were written separately and had drifted:

| | Field app sent | Portal expected |
|---|---|---|
| Stations | `Casey`, `Davis`, `Mawson` (Australian) | `Maitri`, `Bharati`, `Dakshin Gangotri` |
| Activities | 12 names | 8 names |
| Wind | 16-point compass | 8-point + Variable/Calm |
| Weather | METAR codes (`BLSN`, `FG`) | Plain English |
| Field name | `presentWeather` | `present` |
| Measurements | always `{}` | `MEASUREMENT_SCHEMA` |

This is now one vocabulary, defined in three mirrored files that must be
changed together:

- `apps/portal/src/repository/contract.ts` — source of truth
- `apps/public-site/src/repository/contract.ts` — the published-record half
- `apps/scientist-app/lib/models/field_vocabulary.dart` — the Dart mirror

They are copies rather than a shared package because the apps deploy
separately and share no workspace. Each carries a header comment naming the
others.

### The normalisation layer

A scientist can be on the ice for a season running whatever build was
installed before they left, so the portal cannot assume current-format data.
`repository/normalise.ts` repairs what it can — old station names, METAR
codes, 16-point bearings, the `presentWeather` field name — and reattaches
units to legacy flat measurement maps.

Nothing is silently rewritten. Every change produces a `NormaliseWarning`,
and the compose view shows those warnings to the publisher beside the report.

## Module map — `apps/portal/src/repository/`

| File | Responsibility |
|---|---|
| `contract.ts` | The vocabulary, plausibility ranges, `Measurement`, `RecordMetadata`, `RepositoryRecord` |
| `normalise.ts` | Repair and validate anything inbound; produce warnings |
| `summarise.ts` | Draft the plain-language public version and derive a chart |
| `publish.ts` | The projection, the publishing guards, identifier minting, the writes |
| `historicalRecords.ts` | Generated — do not edit by hand |

`summarise.ts` and `normalise.ts` are pure functions with no I/O, which is why
they can be tested properly and why `scripts/verify-pipeline.mjs` can exercise
the real shipped code rather than a copy of it.

## Charts

`recharts` was already a dependency of both web apps. Charts are drawn only
when the numbers support one: `deriveChart()` groups measurements by unit and
requires at least two readings sharing a unit, because a bar chart mixing
centimetres and individual counts is worse than no chart, and a single value
drawn as one bar presents a fact as a comparison.

Colours were checked with a palette validator against the site's dark surface
rather than chosen by eye — lightness band, chroma, colour-blind separation
and contrast all pass. Chart text uses the theme's ink tokens, never the
series colour, so identity is never carried by colour alone. Every chart also
renders its values as a table for screen readers and for print.
