# Antarctic data-workflow research — reference notes

Status: **research only, nothing built from this yet.** Captured here so a
future session has the context without re-deriving it. See also the fuller
write-up published as an artifact (design-heavy version of the same research):
https://claude.ai/code/artifact/ef11b98a-8126-4494-81bb-0da5c34fb7eb

## Target product direction (from Portal-Workflow.png)

The user dropped a diagram (`Portal-Workflow.png`, repo root) sketching a
three-role submission pipeline for the portal — this is the shape future
instructions will likely build toward, not yet implemented:

1. **Scientist** — sends raw field data from the field: a voice note and a
   photo/screenshot. No writing required at this stage.
2. **Publisher** — receives the raw voice + image, an AI drafts a
   caption/post from it, the publisher reviews and edits that draft, then
   submits it to admin for review.
3. **Admin** — reviews the publisher's submission and either:
   - **Approves** → auto-posts to social/web, goes live.
   - **Flags** → sends it back to the publisher with notes; publisher revises
     and resubmits to admin (loop back to the review step, not back to the
     scientist).

Open questions for whenever this gets built: who assigns the Publisher/Admin
roles (vs. the current single "scientist" role in Firebase Auth), what the AI
drafting step actually calls (Claude API? on-device?), whether "auto-posts to
social" means the portal's own `/social` share flow or a real API integration
(Twitter/LinkedIn/etc. posting, which needs OAuth per platform), and how a
flagged-and-revised item re-enters the approve/flag loop without losing the
original raw data.

## What real Antarctic programs actually do (condensed)

Full detail with citations in the published artifact above. Five-stage
pipeline every program surveyed follows in some form:

**1. Collect** — raw instrument data is kept as-is, never as the only copy of
anything derived. Event metadata (observer, ISO 8601 UTC timestamp, precise
lat/lon) is captured *at the moment of collection*, not reconstructed later.
Images are geotagged automatically via EXIF where the camera supports it;
captions are always written separately, never assumed recoverable from the
image.

**2. Describe (metadata)** — PANGAEA's three-tier schema is the clearest
concrete example: `campaign` (expedition/vessel, dates, responsible
scientist) → `event` (station, lat/lon, elevation, ISO date/time, method) →
`parameter` (full name, SI unit, PI, instrument). AADC/UK PDC/SCAR all
require ISO 19115 (or DIF/DCAT) compliant metadata — the common thread is
metadata "sufficient to understand, access, and replicate the dataset."
Image metadata separately follows IPTC's three-group split: descriptive
(caption/keywords), administrative (creator, ID), rights (copyright,
credit) — distinct from EXIF's automatic GPS/timestamp capture.

**3. Structure (report length)** — **no agency has a word-count standard.**
The historical extreme (Mawson's 1911–14 expedition: 22 volumes, 4,000+
pages) is not how anyone works now. Modern pattern: a short, mandatory,
structured metadata record + a 1–3 sentence description + an *optional*
longer write-up. The Antarctic Treaty's own Resolution 3 (1997) implements
its Article VII.5 reporting obligation as a **standard structured form**, not
prose. Takeaway: don't require a long essay from contributors.

**4. Protect (integrity/QA)** — AADC's documented ingest workflow: every
upload is linked to a vetted project, uploader answers explicit
release-status/master-copy questions, non-standard formats get converted
*with the original always kept alongside*. Updates never overwrite in place —
old version is date-stamped and moved out of the public directory, new
version replaces it; metadata carries a revision-history field (AADC has
kept this since 2009). Distinction worth keeping: a **checksum** proves a
file hasn't changed since a known point; **provenance** explains the chain of
edits that produced it — a trustworthy record needs both, not just one.

**5. Publish (access/licensing)** — default is open, not closed, tracing back
to Antarctic Treaty Article III.1.c ("shall be exchanged and made freely
available"). AADC defaults every submission to **CC BY 4.0**; PANGAEA uses
CC0 for metadata (always) and CC0/CC-BY for data (author's choice). Embargo
is a *reviewed exception* with a bounded table (e.g. AADC: routine ship data
= no embargo; project data = until project end; student data = 1 year
post-thesis; monitoring data = life of project capped at 5 years) — never an
unrestricted "make private" toggle. PANGAEA activates a dataset's DOI four
weeks after the last edit, a deliberate cooling-off window for corrections.
Operational/safety reporting (COMNAP's incident system) is kept as a
**separate channel** from the science data archive — matches the portal's
existing game bug-report flow being separate from the research library.

## Nine concrete recommendations for the portal (not yet built)

1. Split the upload form into a structured metadata block (station,
   coordinates, ISO date/time UTC, category, instrument/method, contributor)
   shown *before* the file picker — not folded into one free-text box.
2. Cap the required description at 1–2 sentences; make any longer write-up
   optional.
3. Add a per-upload license field, defaulting to CC BY 4.0.
4. Never overwrite a record in place — version it (retire old copy, publish
   new one), same pattern as AADC.
5. Treat images as their own metadata object: caption + credit + rights as
   required fields, auto-pull GPS/timestamp from EXIF when available.
6. Give every record a stable, citable ID/URL slug that never changes.
7. Add a lightweight human review step before a record goes fully public.
8. Build embargo as a small set of bounded, justified categories — not a
   plain private/public toggle.
9. Keep the bug-report/incident channel separate from the science archive
   (already true today — worth preserving).

These overlap with, but don't replace, the Scientist → Publisher → Admin
workflow above — that diagram adds an explicit *human review/approval role*
(Publisher, Admin) on top of recommendation #7, plus an AI-drafting step this
research didn't cover (no Antarctic program researched uses AI-drafted
captions — that part is a genuinely new design choice, not modeled on
existing practice).
