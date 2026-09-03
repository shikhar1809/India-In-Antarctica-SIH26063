# Scientist field app

`apps/scientist-app` — Flutter desktop application for recording observations
in Antarctica, where connectivity is intermittent and gloves are on.

```bash
cd apps/scientist-app
flutter pub get
flutter run
```

## Why it is offline-first

A field party can be away from the station for days. The app never assumes a
connection:

- Every dispatch is written to a local **SQLite** database first
  (`sqflite_common_ffi`), marked `synced = 0`.
- `sync_service.dart` watches connectivity with `connectivity_plus` and
  flushes the pending queue to Firestore and Storage when the link returns,
  retrying per record.
- The record's UUID is reused as the Firestore document id, so a retry
  overwrites rather than duplicating.

## The seven-step wizard

| Step | Captures |
|---|---|
| 1 · Activity | Station, date/time (UTC), activity type, priority |
| 2 · Position | GPS or manual lat/lon, elevation, **fix accuracy**, position source |
| 3 · Weather | Air temp (°C), wind (kt + direction), visibility (km), cloud (oktas), present weather |
| 4 · Readings | **Per-activity scientific fields** — see below |
| 5 · Observation | Field notes, field party, sample IDs, safety flag |
| 6 · Data | Photos, a CSV of instrument data, document attachments |
| 7 · Record | Review and commit |

### Step 4 is the one that was missing

The per-activity measurement fields existed in the data model and in the
portal's `MEASUREMENT_SCHEMA`, but **no screen ever asked for them**.
`WizardState.measurements` was declared and passed to every `Dispatch`
permanently empty, so an ice survey and a penguin count arrived at the portal
indistinguishable apart from their free-text notes — and no real science ever
left the ice.

`steps/measurement_step.dart` renders the right fields for the chosen
activity, driven by `kMeasurementSchema` in
`lib/models/field_vocabulary.dart`:

| Activity | Fields |
|---|---|
| Ice / glaciology survey | Site/stake ID, ice thickness (cm), snow depth (cm), freeboard (cm), surface type |
| Wildlife observation | Species, individuals counted, life stage, behaviour, survey method |
| Atmospheric / meteorology | Instrument, parameter, reading, units, QC flag |
| Oceanography / CTD | Station no., cast no., max depth (m), bottles fired, parameters |
| Equipment check | Asset ID, action taken, resulting state |
| Base operations | Task, personnel |
| Emergency / incident | Incident type, injuries, reported to |

Wildlife terms follow Darwin Core so records can be pushed to GBIF/OBIS later.

## Validation

The wizard previously had **no validation of any kind** — `−999 °C`, a
latitude of `400`, or an entirely empty dispatch all submitted happily.

Now: station and activity are required before leaving step 1, and the
numeric weather fields are checked against the plausibility envelopes in
`field_vocabulary.dart` (see [DATA-MODEL.md](DATA-MODEL.md)). Ranges are
deliberately generous — they catch typos, not unusual observations. Vostok's
−89.2 °C passes.

## The vocabulary fix

Before this work the app shipped **Australian station names** — Casey, Davis,
Mawson, Macquarie Island, Heard Island — in an application for India's
Antarctic programme. Its activity list, 16-point compass and METAR weather
codes (`BLSN`, `FG`, `TSGR`) also had no counterpart in the portal, and its
`WeatherObs.presentWeather` field went over the wire under a name the portal
did not read.

All of that now comes from `lib/models/field_vocabulary.dart`, which mirrors
`apps/portal/src/repository/contract.ts`. **Change one, change the other.**

Old data is not orphaned: the portal's `normalise.ts` translates dispatches
written by earlier builds and shows the publisher what it changed.

## Other capabilities

- GPS with permission handling (`geolocator`); the fix's horizontal accuracy
  is now recorded rather than discarded
- PIN-based local login
- A customisable 3D scientist avatar, including a cold-weather "glove mode" UI
- Schema migrations in `local_db.dart` (currently v5), so an update doesn't
  lose queued records

## Known gaps

- `voicePath` / `voiceUrl` exist through the model, database and sync
  pipeline, but no recorder screen calls into them. Finish it or remove it.
- No video capture. The problem statement names video as an archived media
  type; photos, CSV and documents are supported.
- The app is not covered by automated tests here — see
  [TESTING.md](TESTING.md).
