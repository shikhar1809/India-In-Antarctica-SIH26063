# Data model

## Collections

| Collection | Read | Write | Holds |
|---|---|---|---|
| `dispatches` | signed in | scientist creates; publisher drafts; admin approves/flags | Raw field reports |
| `documents` | **public** | signed in creates as `submitted`; admin publishes | Knowledge Repository deposits |
| `publicArchive` | **public** | admin only | The published projection the public site reads |
| `roles` | own doc | own doc, or admin | `scientist` / `publisher` / `admin` |
| `counters` | signed in | admin | Sequence behind `IIA-YYYY-NNNN` identifiers |
| `publicSiteData` | **public** | admin | Puck page content for the site homepage |
| `student_questions` | — | anonymous create; admin moderates | Ask-a-Scientist |
| `profiles` | **public** | own doc | Scientist intro line used by the game |
| `bugReports` | never | anonymous create | In-game bug reports (write-only) |

Anything world-readable above is public *by design*. Raw dispatches never are.

## Dispatch → published record

A dispatch is the scientist's record. It is never served to the public.
`publish.ts` builds a `RepositoryRecord` from it, carrying only:

| Public record | Comes from |
|---|---|
| `title`, `body`, `table` | The publisher's `publicSummary` — written for the public |
| `chart` | Derived from measurements sharing a unit |
| `photoUrls` | `imageUrls`, cover photo first |
| `measurements` | Normalised, units attached |
| `metadata` | Assembled explicitly (below) |
| `credit` | `authorName` — attribution is public by design |

Never carried: `notes`, `teamMembers`, `sampleIds`, `safetyFlag`,
`adminNotes`, `sopChecklist`, `platformCaptions`, `publisherUid`, `authorUid`,
`csvUrl`, `docUrls`, `status`.

## Measurements

Readings are objects, not a flat map:

```ts
interface Measurement {
  fieldId: string;   // 'iceThickCm'
  label: string;     // 'Ice thickness'
  value: string;     // '164'  — string, because some readings are categorical
  unit: string | null;  // 'cm' — null for species names, surface types
  qcFlag?: 'good' | 'suspect' | 'fault' | 'uncalibrated';
}
```

The unit travels **with** the value. The earlier design was
`Record<string,string>` with units living only in a client-side constant,
which meant renaming a schema field would silently orphan every historical
reading.

The per-activity fields are defined once in `MEASUREMENT_SCHEMA`
(`apps/portal/src/types.ts`) and mirrored in
`apps/scientist-app/lib/models/field_vocabulary.dart`. Wildlife terms follow
Darwin Core (`scientificName`, `individualCount`, `lifeStage`,
`samplingProtocol`) so records can be pushed to GBIF/OBIS later.

## Metadata profile

Field names are taken from **DataCite** (the schema DOIs are registered
against) and **ISO 19115** (what polar data centres catalogue against), so
registering real DOIs later is a form-fill rather than a schema migration.

| Field | Notes |
|---|---|
| `identifier` | `IIA-2026-0042`. Minted in a Firestore transaction so concurrent approvals can't collide |
| `creators[]` | The collecting body — an expedition, a department, a programme |
| `publishedIn` | Journal or series, for publications. A venue is not an author |
| `publisher` | Always `NCPOR` |
| `resourceType` | Dataset / Report / Publication / Image / Video / Institutional |
| `spatial` | `lat`, `lon`, `elevationM`, **`datum: 'WGS84'`**, `accuracyM` |
| `temporal.observedAt` | When it was observed, not when it was uploaded |
| `license` / `rights` | Reuse terms |
| `instrument` / `method` | How it was measured |
| `provenance` | `sourceType` (`dispatch` \| `document` \| `historical`), `sourceId`, `approvedBy`, `approvedAt` |

`datum` is recorded explicitly because coordinates without one are ambiguous,
and `accuracyM` comes from the GPS fix the field app previously discarded.

`provenance` is what makes every public record traceable to a source — the
API test asserts no published record is missing it.

## Plausibility ranges

Enforced in the Flutter app at entry and re-checked on arrival in the portal.
Deliberately generous: the job is catching a fat-fingered `-999`, not
second-guessing an observer.

| Field | Range | Why |
|---|---|---|
| `airTempC` | −95 … 20 °C | Vostok's −89.2 °C is Earth's record low |
| `windSpeedKt` | 0 … 200 kt | |
| `visibilityKm` | 0 … 100 km | |
| `cloudOktas` | 0 … 8 | Eighths of sky, WMO convention |
| `lat` / `lon` | ±90 / ±180 | |
| `elevationM` | −100 … 5000 m | |

An implausible reading is kept and flagged, not discarded — a real reading
that looks odd is still evidence. It is excluded from charts.

## Units

Following WMO / USAP field practice: air temperature in °C, wind in knots,
visibility in kilometres, cloud in oktas, ice and snow in centimetres, cast
depth in metres.
