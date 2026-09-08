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

## The authorization boundary

The projection above is only worth as much as the rule that decides who may
approve. Two rules carry that weight, and both are stated here because both
were once wrong in ways that read as correct.

**Privilege is granted, never claimed.** `roles/{uid}` lets a signed-in user
write exactly one value for themselves — `scientist`, which is what
`useRole()` already assumes when no document exists. `publisher` and `admin`
are writable only by someone who is already an admin. The earlier version
allowed any authenticated user to write their own role with `admin` in the
permitted set; sign-in is open Google auth, so every admin-gated rule in the
file — approving a dispatch, writing to `publicArchive`, editing the public
site — was self-issuable by anyone with a Google account.

A project with no admins therefore cannot mint its first one from inside the
app. That is deliberate: an in-band escape hatch is the vulnerability, not the
fix. `scripts/set-role.mjs` seeds the first admin with owner credentials that
operate above the rules.

**A raw dispatch is not readable by every account.** `dispatches` previously
granted read on `request.auth != null`, with a comment saying "publisher and
admin only" that described a client-side filter. A dispatch carries the
scientist's unedited notes, the field party, sample identifiers, admin notes
and — on an incident report — injuries. Reads are now scoped to the author or
a reviewer, and `useDispatches()` issues the matching query, because an
unscoped query from a scientist is refused outright rather than silently
trimmed.

Neither rule can be tested here without a JVM for the Firestore emulator, so
`src/security/rules.test.ts` reads the rules file directly and asserts both
boundaries in the ordinary unit run. It is a poor substitute for an emulator
and a good substitute for remembering; reintroducing either hole fails three
tests.

## Dissemination — the social half of the problem statement

The brief asks for content generated "for websites and social media". The
website half was always real: publish.ts projects an approved dispatch into
`publicArchive`, and the public site and the JSON API read it. The social half
stopped at a caption and a PNG the publisher downloaded and posted from their
own phone. That is a useful tool, but it is not dissemination — nothing
recorded what went out, when, to which account, or whether it went out at all.

`src/social/queue.ts` is the missing half: a queue with a state machine, where
a post is a tracked object from scheduling to landing.

```
queued ──► ready ──► posted
  │          │
  │          └────► failed ──► ready     (a retry re-enters the queue)
  └────────────────► cancelled
```

`ready` is deliberately separate from `queued`. What decides a post is *due*
is the clock; what decides it is *sendable* is validation. Collapsing them
hides the difference between "not yet" and "never, because the caption is 40
characters too long" — and the second one is only fixable while the publisher
still remembers writing it, which is why captions are validated at schedule
time rather than at send time.

**A queue entry references a published record, never a dispatch.** This is the
same boundary publish.ts draws, enforced a second time at the only other place
content can leave the building. `schedulePost()` accepts a `RepositoryRecord`
and there is no overload that takes anything else, and `firestore.rules`
independently requires the referenced document to already exist in
`publicArchive`. Without that, a publisher could schedule straight from a
dispatch id and put raw field notes on a government timeline.

**Posting is an adapter, and the manual adapter is a first-class citizen.**
Getting an X or LinkedIn application approved for a government account is a
procurement exercise measured in weeks, and a system that cannot disseminate
until that finishes cannot disseminate. So the queue is complete with no
credential at all: it prepares the post and records the permalink a publisher
confirms. When a credential arrives, `registerAdapter()` claims that platform
and the queue stops asking — the data model, the UI and the audit trail are
unchanged. `adapterFor()` reporting `automatic: false` therefore always means
"no credential", never "not wired up yet".

Two details that look small and are not. The manual adapter returns an honest
failure rather than a resolved promise, because a promise that quietly did
nothing would write `posted` into the audit trail for a post that never
existed. And confirming a manual post *requires* the permalink: an
unverifiable claim that something was posted is worth less than no claim,
because it looks like evidence.

Nothing is hard-deleted — `cancelled` is a state. "This was scheduled and then
pulled" is part of the record of what was disseminated; an absent row proves
nothing.

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
