import type { Annotation } from './review/annotations';

export const CATEGORIES = [
  'Expedition Report',
  'Dataset',
  'Publication',
  'Photographs & Video',
  'Institutional'
] as const;

export const STATIONS = ['Maitri', 'Bharati', 'Dakshin Gangotri', 'Other'] as const;

export const LICENSES = ['CC BY 4.0', 'CC0', 'CC BY-NC 4.0'] as const;

export const EMBARGO_OPTIONS = [
  { value: 'none',        label: 'None — public immediately' },
  { value: 'project-end', label: 'Until project end' },
  { value: '1-year',      label: '1 year post-submission' },
  { value: '5-years',     label: '5 years (monitoring data)' },
] as const;

export type License  = (typeof LICENSES)[number];
export type Embargo  = (typeof EMBARGO_OPTIONS)[number]['value'];

/** Review state of a Knowledge Repository submission. Everything arrives as
 *  'submitted'; only an admin moves it on, and only 'published' records reach
 *  the public site. Enforced in firestore.rules, not just in the UI. */
export type DocumentStatus = 'submitted' | 'published' | 'rejected';

export interface ResearchDocument {
  id: string;

  // ── What ──────────────────────────────────────────────────────────────
  title: string;
  description: string;       // 1-2 sentences, max 500 chars
  /** The full report, optional — several paragraphs, blank-line separated.
   *  `description` stays the required short summary that drives cards and
   *  search; this is what makes the published archive record read like an
   *  actual report instead of only that summary. Absent on every record
   *  uploaded before this field existed, and on any upload where the
   *  contributor chose not to write one — both cases fall back to
   *  `description` alone, exactly as before this field was added. */
  fullText?: string | null;
  category: string;
  instrument: string;        // method or instrument used to collect the data

  // ── Review ────────────────────────────────────────────────────────────
  /** Absent on records uploaded before the review gate existed; those are
   *  treated as 'published' so the catalogue doesn't silently lose them. */
  status?: DocumentStatus;
  reviewNotes?: string | null;

  // ── When & Where ──────────────────────────────────────────────────────
  station: 'Maitri' | 'Bharati' | 'Dakshin Gangotri' | 'Other';
  observedAt: number;        // epoch ms — when data was collected (not uploaded)
  lat: number | null;        // decimal degrees, negative = south
  lon: number | null;        // decimal degrees, negative = west

  // ── Access ────────────────────────────────────────────────────────────
  license: License;          // defaults to 'CC BY 4.0' per AADC/PANGAEA practice
  embargo: Embargo;          // bounded category, not a plain private toggle

  // ── File ──────────────────────────────────────────────────────────────
  fileName: string;
  fileUrl: string;
  fileSizeBytes: number;
  /** Read off the browser's File at upload time (`file.type.startsWith
   *  ('video/')`) — never asked of the contributor. Absent means "a plain
   *  downloadable file", which is how every record before this field
   *  existed behaves and keeps behaving. */
  mediaKind?: 'file' | 'video';

  // ── Provenance ────────────────────────────────────────────────────────
  authorUid: string;
  authorName: string;
  authorEmail: string;
  createdAt: number;         // upload timestamp — separate from observedAt
}

export type DispatchStatus = 'raw' | 'drafted' | 'flagged' | 'approved';
export type DispatchPriority = 'routine' | 'notable' | 'urgent';

export const ACTIVITY_TYPES = [
  'Ice / glaciology survey',
  'Wildlife observation',
  'Atmospheric / meteorology',
  'Oceanography / CTD',
  'Equipment check / maintenance',
  'Base operations',
  'Emergency / incident',
  'Other',
] as const;

/** Blurb per activity, used by the activity picker. */
export const ACTIVITY_META: Record<string, { blurb: string }> = {
  'Ice / glaciology survey':       { blurb: 'Stakes, cores, thickness' },
  'Wildlife observation':          { blurb: 'Counts, behaviour, colonies' },
  'Atmospheric / meteorology':     { blurb: 'Sondes, ozone, radiation' },
  'Oceanography / CTD':            { blurb: 'Casts, bottles, profiles' },
  'Equipment check / maintenance': { blurb: 'Instruments, calibration' },
  'Base operations':               { blurb: 'Logistics, station tasks' },
  'Emergency / incident':          { blurb: 'Injury, near miss, failure' },
  'Other':                         { blurb: 'Anything else' },
};

/* ─────────────────────────────────────────────────── weather observation ──
 * Field parties call in a met observation on every check-in. Units follow
 * USAP / WMO field practice: air temperature in °C, wind in knots, visibility
 * in km, and cloud cover in oktas (eighths of sky covered, 0–8).            */

export const PRESENT_WEATHER = [
  'Clear', 'Partly cloudy', 'Overcast', 'Snow', 'Blowing snow',
  'Drifting snow', 'Fog', 'Whiteout', 'Ice crystals', 'Rain',
] as const;

/** Cardinal compass points, the way an observer actually reports wind. */
export const WIND_DIRS = ['N','NE','E','SE','S','SW','W','NW','Variable','Calm'] as const;

export interface WeatherObs {
  airTempC:     number | null;   // °C
  windSpeedKt:  number | null;   // knots
  windDir:      string;          // cardinal point, or Variable / Calm
  visibilityKm: number | null;   // km
  cloudOktas:   number | null;   // 0–8
  present:      string;          // present-weather category
}

export const EMPTY_WEATHER: WeatherObs = {
  airTempC: null, windSpeedKt: null, windDir: 'Calm',
  visibilityKm: null, cloudOktas: null, present: 'Clear',
};

/* ────────────────────────────────────────────── activity-specific fields ──
 * The real distinction between field reports is the measurement set. A
 * wildlife count and a CTD cast share almost no columns, so the form asks
 * a different block per activity rather than one generic "notes" box.
 * Wildlife terms follow Darwin Core (scientificName, individualCount,
 * lifeStage, samplingProtocol) so records can be pushed to GBIF/OBIS.      */

export interface MeasurementField {
  id: string;
  label: string;
  type: 'text' | 'number' | 'select';
  unit?: string;
  options?: readonly string[];
  hint?: string;
}

export const MEASUREMENT_SCHEMA: Record<string, readonly MeasurementField[]> = {
  'Wildlife observation': [
    { id: 'species',   label: 'Species', type: 'text', hint: 'Scientific name — e.g. Pygoscelis adeliae' },
    { id: 'count',     label: 'Individuals counted', type: 'number', unit: 'ind.' },
    { id: 'lifeStage', label: 'Life stage', type: 'select', options: ['Adult', 'Juvenile', 'Chick / pup', 'Mixed', 'Unknown'] },
    { id: 'behaviour', label: 'Behaviour', type: 'select', options: ['Breeding', 'Moulting', 'Foraging', 'Resting', 'Transiting', 'Carcass / dead', 'Other'] },
    { id: 'method',    label: 'Survey method', type: 'select', options: ['Direct count', 'Distance sampling', 'Camera trap', 'Aerial / UAV', 'Opportunistic'] },
  ],
  'Ice / glaciology survey': [
    { id: 'siteId',      label: 'Site / stake ID', type: 'text', hint: 'e.g. MAI-S12' },
    { id: 'iceThickCm',  label: 'Ice thickness', type: 'number', unit: 'cm' },
    { id: 'snowDepthCm', label: 'Snow depth', type: 'number', unit: 'cm' },
    { id: 'freeboardCm', label: 'Freeboard', type: 'number', unit: 'cm' },
    { id: 'surface',     label: 'Surface type', type: 'select', options: ['Blue ice', 'Firn', 'Fresh snow', 'Wind slab', 'Sastrugi', 'Melt pond', 'Crevassed'] },
  ],
  'Atmospheric / meteorology': [
    { id: 'instrument', label: 'Instrument', type: 'text', hint: 'AWS ID, sonde type, spectrometer' },
    { id: 'parameter',  label: 'Parameter measured', type: 'text', hint: 'Ozone column, aerosol OD, radiation' },
    { id: 'value',      label: 'Reading', type: 'text' },
    { id: 'units',      label: 'Units', type: 'text', hint: 'DU, W/m², ppb' },
    { id: 'qc',         label: 'QC flag', type: 'select', options: ['Good', 'Suspect', 'Instrument fault', 'Not calibrated'] },
  ],
  'Oceanography / CTD': [
    { id: 'stationNo', label: 'Station number', type: 'text' },
    { id: 'castNo',    label: 'Cast number', type: 'text' },
    { id: 'maxDepthM', label: 'Max cast depth', type: 'number', unit: 'm' },
    { id: 'bottles',   label: 'Bottles fired', type: 'number' },
    { id: 'params',    label: 'Parameters logged', type: 'text', hint: 'T, S, dissolved O₂, chl-a, nitrate' },
  ],
  'Equipment check / maintenance': [
    { id: 'assetId', label: 'Asset / instrument ID', type: 'text' },
    { id: 'action',  label: 'Action taken', type: 'select', options: ['Routine check', 'Calibration', 'Repair', 'Part replaced', 'Decommissioned'] },
    { id: 'state',   label: 'Resulting state', type: 'select', options: ['Operational', 'Degraded', 'Offline', 'Awaiting parts'] },
  ],
  'Base operations': [
    { id: 'task',    label: 'Task', type: 'text', hint: 'Fuel transfer, cargo, traverse prep' },
    { id: 'persons', label: 'Personnel involved', type: 'number' },
  ],
  'Emergency / incident': [
    { id: 'kind',     label: 'Incident type', type: 'select', options: ['Injury', 'Near miss', 'Equipment failure', 'Vehicle', 'Environmental', 'Weather / shelter'] },
    { id: 'injuries', label: 'Injuries', type: 'select', options: ['None', 'First aid only', 'Medical treatment', 'Evacuation required'] },
    { id: 'reported', label: 'Reported to', type: 'text', hint: 'Station leader, doctor, comms' },
  ],
  'Other': [],
};

export const POSITION_SOURCES = ['GPS handheld', 'Manual / map', 'Station fix', 'Vessel GPS'] as const;

export interface Dispatch {
  id: string;
  authorUid: string;
  authorName: string;

  // ── When & where ──────────────────────────────────────────────────────
  observedAt: number;            // UTC epoch ms — Antarctic ops log in UTC
  station: string;
  lat: number | null;            // decimal degrees, negative = south
  lon: number | null;            // decimal degrees, negative = west
  elevationM: number | null;
  positionSource: string;

  // ── What ──────────────────────────────────────────────────────────────
  activity: string;
  priority: DispatchPriority;
  weather: WeatherObs;
  measurements: Record<string, string>;   // keyed by MEASUREMENT_SCHEMA field id
  notes: string;                          // narrative field entry

  // ── Party & samples ───────────────────────────────────────────────────
  teamMembers: string;           // who else was present
  sampleIds: string;             // physical sample / specimen IDs collected
  safetyFlag: boolean;           // needs station-leader attention

  // ── Media ─────────────────────────────────────────────────────────────
  voiceUrl: string | null;
  imageUrls: string[];           // up to 5 photos
  csvUrl: string | null;         // raw instrument data upload
  docUrls: { name: string; url: string }[];  // attached documents (PDF, TXT, DOCX …)

  // ── Pipeline ──────────────────────────────────────────────────────────
  caption: string;
  status: DispatchStatus;
  publisherName: string | null;
  /** Set alongside publisherName on submit — lets "My Submissions" filter
   *  reliably by uid instead of a display-name string match, same pattern
   *  as ResearchDocument.authorUid. Dispatches drafted before this field
   *  existed have it null and simply won't show up in that tracking tab. */
  publisherUid: string | null;
  /** Platform-specific versions of the post, since X/LinkedIn/Instagram
   *  don't share length or tone conventions. `caption` above stays the
   *  single fallback string FeedTab already renders on the live feed. */
  platformCaptions: PlatformCaptions | null;
  /** Index into imageUrls[] — which photo is the post's primary/cover
   *  image. Null (or 0) when there's zero or one photo to choose from. */
  coverImageIndex: number | null;
  /** Keyed by SOP_CHECKLIST_ITEMS id. Submitted alongside the draft so
   *  it's part of the record's audit trail, not just transient UI state —
   *  an admin reviewing the item can see the checklist was actually
   *  followed. */
  sopChecklist: Record<string, boolean> | null;
  /** The plain-language version written for the public site — headline, a
   *  couple of simplified paragraphs, a key-facts table and an optional
   *  chart. Drafted from the dispatch by repository/summarise.ts, then edited
   *  by the publisher. This, not the raw dispatch, is what gets published. */
  publicSummary?: StoredPublicSummary | null;
  /** How the post graphic was laid out — which template, palette and photo
   *  the publisher settled on. Stored so that "Revise" reopens the studio
   *  on the design that was submitted rather than a fresh default, and so
   *  an admin can regenerate the exact same PNG later. The graphic itself
   *  is rendered from these three ids; it is never stored as a blob. */
  postDesign?: StoredPostDesign | null;
  adminNotes: string | null;
  createdAt: number;
  updatedAt: number;
  /** Set by the approve desk alongside `status: 'approved'` — the id and
   *  citable identifier of the public record this dispatch became. Absent
   *  until approved, and absent forever on anything that never was (most
   *  dispatches). This is what "Published content" links out to the public
   *  site with, and it is optional for exactly that reason rather than a
   *  string default — an empty string would look like a broken link instead
   *  of an honest "not published". */
  publicRecordId?: string | null;
  publicIdentifier?: string | null;
  /** Marks an admin leaves directly on the post graphic — a drawn circle,
   *  an arrow, a pin with a comment — to tell a publisher what needs to
   *  change without retyping "the headline in the top-left" into
   *  `adminNotes`. Never published: this is communication about the post,
   *  not part of it. See review/ImageAnnotator.tsx. */
  reviewAnnotations?: Annotation[] | null;

  /** @deprecated superseded by structured `weather`; kept so older docs render. */
  conditions?: string;
}

/** Firestore-safe record of a post graphic's design decisions.
 *
 *  Deliberately ids, not pixels: the studio renders the graphic from a
 *  template and a palette defined in `studio/`, so storing the choices lets
 *  the same post be re-rendered at any size later — and means a brand
 *  change propagates to every historical post instead of stranding them as
 *  stale images. `headline`/`standfirst` are the on-graphic words, which
 *  are shorter and differently written from the platform captions. */
export interface StoredPostDesign {
  templateId: string;
  paletteId: string;
  platform: string;
  photoIndex: number;
  kicker: string;
  headline: string;
  standfirst: string;
  /** Whether the wording came from the generator or the offline draft —
   *  part of the audit trail an admin sees before approving. */
  generated: boolean;
}

/** Firestore-safe shape of the outreach summary stored on a dispatch. Kept
 *  here rather than in repository/contract.ts because it is part of the
 *  Dispatch document; the richer types it mirrors live in that file. */
export interface StoredPublicSummary {
  title: string;
  body: string[];
  table: { label: string; value: string }[];
  chart: {
    kind: 'bar' | 'line';
    title: string;
    unit: string;
    caption: string;
    data: { label: string; value: number }[];
  } | null;
}

/* ──────────────────────────────────────────────── publisher post tools ── */

export interface PlatformCaptions {
  x: string;
  linkedin: string;
  instagram: string;
}

/** Not enforced platform limits in the legal sense (X in particular has
 *  premium tiers with different caps) — these are the practical defaults
 *  used for the live character counters and the "danger" warning state. */
export const PLATFORM_LIMITS = { x: 280, instagram: 2200, linkedin: 3000 } as const;

export const SOP_CHECKLIST_ITEMS = [
  { id: 'facts',    label: 'Facts checked against the field notes / data' },
  { id: 'safety',   label: 'No unresolved safety or incident details exposed publicly' },
  { id: 'photo',    label: 'Photo reviewed for quality and appropriateness' },
  { id: 'credit',   label: 'Scientist / station credited in the caption' },
  { id: 'hashtags', label: 'Hashtags added' },
] as const;

// Static, station/activity-keyed hashtag suggestions — no network call, no
// AI. A publisher clicks one to insert it into whichever platform field
// currently has focus.
export const HASHTAG_BY_STATION: Record<string, string[]> = {
  'Maitri':           ['#Maitri', '#SchirmacherOasis', '#IndiaInAntarctica'],
  'Bharati':          ['#Bharati', '#LarsemannHills', '#IndiaInAntarctica'],
  'Dakshin Gangotri':  ['#DakshinGangotri', '#IndiaInAntarctica'],
  'Other':            ['#IndiaInAntarctica', '#Antarctica'],
};

export const HASHTAG_BY_ACTIVITY: Record<string, string[]> = {
  'Ice / glaciology survey':       ['#Glaciology', '#IceCore', '#ClimateScience'],
  'Wildlife observation':          ['#AntarcticWildlife', '#FieldScience', '#Conservation'],
  'Atmospheric / meteorology':     ['#Meteorology', '#OzoneWatch', '#ClimateScience'],
  'Oceanography / CTD':            ['#Oceanography', '#PolarResearch'],
  'Equipment check / maintenance': ['#FieldOps', '#PolarLogistics'],
  'Base operations':               ['#StationLife', '#PolarLogistics'],
  'Emergency / incident':          [],
  'Other':                         ['#PolarResearch'],
};
