# Testing

```bash
npm test      # unit → pipeline → api → e2e, stopping at the first failure
```

The project had no test tooling at all before this work. What exists now was
chosen around two hard constraints on the development machine: **no Java**, so
the Firestore emulator cannot run, and **no Flutter SDK**, so Dart cannot be
compiled or driven.

The response was to test against the real deployment instead of a simulated
one, which turns out to assert something stronger.

## 1. Unit — `npm run test:unit`

Vitest, 53 tests over the pure logic in `apps/portal/src/repository/`.

| Suite | Asserts |
|---|---|
| `normalise.test.ts` | Australian station → `Other` with the original kept; `BLSN` → `Blowing snow`; `ENE` → `NE`; `presentWeather` → `present`; junk numbers rejected; implausible values kept but flagged; legacy measurement maps regain their units |
| `summarise.test.ts` | Plain-language headlines; the scientist's shorthand never survives into public prose; hemispheres on coordinates; charts only when ≥2 readings share a unit; no nested arrays (Firestore rejects them) |
| `publish.test.ts` | **The security assertion.** Every internal field is seeded with a unique sentinel, and none appear anywhere in the published record. Safety-flagged and incident reports are refused publication |

## 2. Pipeline — `npm run test:pipeline`

Takes a dispatch in the *old* field-app format — Australian station, METAR
weather, 16-point wind, legacy measurement map — and pushes it through the
**real shipped modules**, not a copy: normalise → summarise → project →
publish → read back anonymously → clean up.

24 checks. It bundles the actual portal source so a change to production code
that breaks the pipeline fails here.

## 3. API and rules — `npm run test:api`

Plain anonymous HTTP against the deployed project. No SDK, no credentials —
exactly what a member of the public sees.

- `publicArchive` **is** readable with no auth
- `dispatches` and `roles` are **not** (401/403)
- No internal field name appears in any published record
- Every record carries a citable identifier, a `WGS84` datum and a licence
- Records are attributed to **different** creators, sit at more than one real
  place, and have unique identifiers
- Every record names its source (`dispatch` or `document`) and points at a
  real source id
- `/api/records` returns unwrapped JSON with CORS open

This verifies the rules that are actually in force. An emulator could only
approximate them.

## 4. Browser — `npm run test:e2e`

Playwright against the live site. Asserts the page's rows match the API
exactly (so the archive is genuinely live, not a hardcoded list), that a chart
draws one mark per reading in the validated series colour, that the
accessible table matches the chart, that axis ticks carry units and labels
aren't truncated, that metadata and filters work, that the console is clean,
and that a phone viewport has no horizontal overflow.

Run it against a dev server by passing a URL:

```bash
node scripts/e2e-repository.mjs http://localhost:5174
```

## What is not covered

Stated plainly, because knowing the gaps matters more than the count:

- **The Flutter app is not compiled or tested here.** No SDK on the
  development machine. Dart changes were audited by reading and
  bracket-checked, which is not a compiler. Run `flutter run` once after
  pulling.
- **No emulator-based rules tests.** The Firestore emulator needs Java.
  `test:api` covers the same ground against production, which is stronger for
  the rules but cannot test *unpublished* states.
- **The authenticated portal journey** (compose → approve) is not automated.
  It needs a Google sign-in that CI cannot perform.
- **The game has no automated tests.**
- **Seeding scripts run above the rules.** They authenticate as a project
  owner, so a successful seed is not evidence a normal admin could do the same
  through the app. `test:api` is what proves the rules.

## Bugs these tests caught

- `table` was `[string, string][]` — **Firestore rejects nested arrays**, so it
  could never have been written. Found by a real write; reshaped to
  `{label, value}` objects with a regression test.
- The chart silently word-wrapped "Ice thickness" into "Icethickness".
- An E2E wait on `networkidle` that passed by luck — the page holds a live
  Firestore listener open, so the network never goes idle.
