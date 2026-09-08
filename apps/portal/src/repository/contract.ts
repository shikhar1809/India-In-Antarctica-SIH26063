/* ═══════════════════════════════════════════ knowledge repository contract
 *
 * The single agreed vocabulary between the three codebases that make up this
 * system: the Flutter field app (which writes dispatches), this portal (which
 * reviews and publishes them), and iia-public (which displays what was
 * published). Before this file existed each one had its own spelling of the
 * same ideas — the field app was writing Australian station names and METAR
 * weather codes the portal had no mapping for.
 *
 * MIRRORED FILE: iia-public/src/repository/contract.ts holds a copy of the
 * published-record half of this file. The two apps deploy separately and share
 * no workspace, so the copy is deliberate; when you change RepositoryRecord,
 * Measurement or RecordMetadata here, change it there too.
 */

import type { License } from '../types';

/* ───────────────────────────────────────────────── canonical vocabulary ── */

/** The only stations that exist in India's Antarctic programme. Maitri and
 *  Bharati are operational; Dakshin Gangotri was abandoned to ice in 1990 and
 *  survives as a supply base, so it stays in the list for historical records. */
export const CANONICAL_STATIONS = ['Maitri', 'Bharati', 'Dakshin Gangotri', 'Other'] as const;
export type Station = (typeof CANONICAL_STATIONS)[number];

/** Station names the Flutter app shipped before the vocabularies were aligned.
 *  These are Australian AAD stations — none of them are Indian. They map to
 *  'Other' rather than being guessed at, and normalise.ts preserves whatever
 *  the app actually sent so nothing is silently rewritten. */
export const LEGACY_STATION_ALIASES: Record<string, Station> = {
  'Casey Station': 'Other',
  'Davis Station': 'Other',
  'Mawson Station': 'Other',
  'Macquarie Island Station': 'Other',
  'Heard Island': 'Other',
  'Field Camp': 'Other',
  // shorter spellings, same places
  'Casey': 'Other',
  'Davis': 'Other',
  'Mawson': 'Other',
};

/** Activity names the Flutter app shipped, mapped onto the portal's eight.
 *  Where the old name is genuinely more specific (Sea Ice Survey) it collapses
 *  into the closest canonical activity rather than inventing a new one. */
export const LEGACY_ACTIVITY_ALIASES: Record<string, string> = {
  'Glaciology Survey': 'Ice / glaciology survey',
  'Sea Ice Survey': 'Ice / glaciology survey',
  'Marine Biology': 'Wildlife observation',
  'Wildlife Census': 'Wildlife observation',
  'Atmospheric Science': 'Atmospheric / meteorology',
  'Meteorological Observation': 'Atmospheric / meteorology',
  'Water Sampling': 'Oceanography / CTD',
  'Geomorphology': 'Other',
  'Rock/Soil Sampling': 'Other',
  'Equipment Maintenance': 'Equipment check / maintenance',
  'Station Support': 'Base operations',
  'Other': 'Other',
};

/** The field app offers a 16-point compass; an observer's report and the
 *  portal's UI both use 8 points plus Variable/Calm. Intermediate bearings
 *  fold to the nearest cardinal/ordinal point — NNE and ENE both become NE,
 *  which is how a plain-language weather line would read it anyway. */
export const LEGACY_WIND_DIR_ALIASES: Record<string, string> = {
  NNE: 'NE', ENE: 'NE',
  ESE: 'SE', SSE: 'SE',
  SSW: 'SW', WSW: 'SW',
  WNW: 'NW', NNW: 'NW',
  VRB: 'Variable',
  CALM: 'Calm',
};

/** METAR present-weather abbreviations the field app used, in plain English.
 *  TSGR (thunderstorm with hail) has no Antarctic-plausible equivalent in the
 *  portal's list and is intentionally absent — normalise.ts will flag it
 *  rather than guess. */
export const METAR_PRESENT_ALIASES: Record<string, string> = {
  NONE: 'Clear',
  FG: 'Fog',
  DZ: 'Rain',
  RA: 'Rain',
  SN: 'Snow',
  SH: 'Snow',
  BLSN: 'Blowing snow',
  DRSN: 'Drifting snow',
};

/** Position-source values the field app used, mapped to POSITION_SOURCES. */
export const LEGACY_POSITION_SOURCE_ALIASES: Record<string, string> = {
  'GPS': 'GPS handheld',
  'Manual entry': 'Manual / map',
  'Station reference': 'Station fix',
  'Map pick': 'Manual / map',
};

/* ─────────────────────────────────────────────── plausibility envelopes ──
 * Ranges a real Antarctic field observation has to fall inside. These are
 * deliberately generous — the point is catching a fat-fingered -999 or a
 * latitude of 400, not second-guessing an observer. Vostok's -89.2 °C is the
 * lowest reliably recorded surface temperature on Earth, so -95 is a safe
 * floor; +20 is well above anything a coastal Indian station would see.     */

export const PLAUSIBLE = {
  airTempC:     { min: -95,  max: 20   },
  windSpeedKt:  { min: 0,    max: 200  },
  visibilityKm: { min: 0,    max: 100  },
  cloudOktas:   { min: 0,    max: 8    },
  lat:          { min: -90,  max: 90   },
  lon:          { min: -180, max: 180  },
  elevationM:   { min: -100, max: 5000 },
} as const;

export function isPlausible(key: keyof typeof PLAUSIBLE, value: number | null | undefined): boolean {
  if (value === null || value === undefined || Number.isNaN(value)) return true; // absent is fine; wrong is not
  const { min, max } = PLAUSIBLE[key];
  return value >= min && value <= max;
}

/* ─────────────────────────────────────────────────────────── measurement ──
 * The fix for the original design's real weakness: measurements used to be
 * Record<string,string>, so "12.4" was stored with its unit living only in a
 * client-side constant. Rename a field in MEASUREMENT_SCHEMA and every
 * historical record silently became unreadable. Here the unit and the QC flag
 * travel with the value, the way any data centre would expect.              */

export type QcFlag = 'good' | 'suspect' | 'fault' | 'uncalibrated';

export interface Measurement {
  fieldId: string;          // MEASUREMENT_SCHEMA field id, e.g. 'iceThickCm'
  label: string;            // human label captured at write time, e.g. 'Ice thickness'
  value: string;            // kept as string — some readings are genuinely non-numeric
  unit: string | null;      // 'cm', 'kt', 'ind.' … null for categorical fields
  qcFlag?: QcFlag;
}

/** Numeric value of a measurement, or null when it isn't a number. Charts use
 *  this to drop categorical fields (species name, surface type) automatically. */
export function measurementValue(m: Measurement): number | null {
  if (m.value === null || m.value === undefined) return null;
  const trimmed = String(m.value).trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/* ────────────────────────────────────────────────────────────── metadata ──
 * A documented metadata profile, with field names taken from DataCite (the
 * schema DOIs are minted against) and ISO 19115 (the geospatial standard
 * polar data centres catalogue against). Nothing here is aspirational — every
 * field is populated from data the system already collects. It exists so a
 * published record can be described the way NCPOR's Indian Polar Data Centre
 * would describe it, and so DOI registration later is a form-fill rather than
 * a schema migration.                                                        */

export type ResourceType =
  | 'Dataset' | 'Report' | 'Publication' | 'Image' | 'Video' | 'Institutional';

export interface RecordMetadata {
  /** Persistent, human-readable, citable. Format IIA-<year>-<4 digits>. */
  identifier: string;
  creators: { name: string; affiliation: string }[];
  publisher: 'NCPOR';
  /** Journal or series a publication appeared in. A venue is not an author,
   *  so it is recorded separately from `creators`. */
  publishedIn?: string;
  publicationYear: number;
  resourceType: ResourceType;

  station: Station;
  /** Datum is recorded explicitly: coordinates are meaningless without it,
   *  and the field app's GPS returns WGS84. accuracyM comes from the GPS fix
   *  where the device reported one. */
  spatial: {
    lat: number | null;
    lon: number | null;
    elevationM: number | null;
    datum: 'WGS84';
    accuracyM: number | null;
  };
  temporal: { observedAt: number };

  license: License;
  rights: string;

  instrument: string | null;
  method: string | null;

  provenance: {
    sourceType: 'dispatch' | 'document' | 'historical';
    sourceId: string;
    approvedBy: string;
    approvedAt: number;
  };
}

/* ─────────────────────────────────────────────── the published record ──
 * What the public actually sees. This is a projection, not the dispatch: it
 * is built field by field from things a publisher wrote *for* the public, so
 * internal material (admin notes, the SOP checklist, team member names, the
 * safety flag, raw field notes) cannot leak into it even by accident. That
 * property is asserted in publish.test.ts.
 *
 * The shape deliberately matches iia-public's existing ArchiveRecord so the
 * archive UI renders it without being rewritten.                            */

export type CoverCategory = 'expedition' | 'dataset' | 'publication' | 'media' | 'institution';
export type CoverStation = 'maitri' | 'bharati' | 'dakshin' | 'ship' | 'ncpor';

export interface RecordFact { label: string; value: string }

export interface RecordChart {
  kind: 'bar' | 'line';
  title: string;
  unit: string;
  /** Plain-language "what am I looking at" line, shown under the chart. */
  caption: string;
  data: { label: string; value: number }[];
}

/* ──────────────────────────────────────────────────────────── citations ──
 * The prose on the public site is a *projection* of internal material — a
 * publisher's plain-language rewrite of a field dispatch, or the paragraphs
 * of a report somebody uploaded. Read on its own it gives a reader no way to
 * tell which sentence is a measured observation, which is a publisher's
 * wording, and which is standing NCPOR background text.
 *
 * These two types close that gap. `RecordSource` names a thing the prose
 * came from; `CitedSpan` ties a run of published text to one of them. The
 * public site renders each span as a hoverable citation, so any line can be
 * traced back to what it was written from.
 *
 * The same rule as the rest of the projection applies: a source may only
 * carry material that is already public in this record. Internal URLs (raw
 * CSVs, attached working documents, voice notes) never become a source.
 */

export type SourceKind =
  /** The field dispatch a scientist filed. Cited, never linked — the
   *  dispatch itself stays internal. */
  | 'dispatch'
  /** A document submitted to the Knowledge Repository. Linkable: uploads
   *  live under a storage path that is world-readable by design. */
  | 'document'
  /** Wording NCPOR supplies rather than the field record: station
   *  background, outreach context, a publisher's own sentence. */
  | 'editorial'
  /** The curated pre-repository catalogue. */
  | 'historical';

export interface RecordSource {
  /** Stable within one record; referenced by CitedSpan.sourceId. */
  id: string;
  kind: SourceKind;
  /** Short category shown on the hover card, e.g. 'Field dispatch'. */
  label: string;
  title: string;
  author: string | null;
  /** Display date of the original material, already formatted. */
  dated: string | null;
  /** One line on how the published text relates to this source — the part a
   *  reader actually needs in order to judge the sentence. */
  detail: string | null;
  /** Link to the original, or null when the source is not public. */
  url: string | null;
}

export interface CitedSpan {
  /** Verbatim slice of the published paragraph. */
  text: string;
  /** null = connective text with no single source. */
  sourceId: string | null;
  /** Where inside the source this came from, e.g. 'Paragraph 3 of the
   *  submitted report'. */
  locator?: string | null;
}

/** One published paragraph, split into cited spans. A wrapper object rather
 *  than a bare CitedSpan[][] on the record: Firestore rejects nested arrays
 *  outright, so an array of arrays cannot be persisted. */
export interface ParagraphCitation { spans: CitedSpan[] }

export interface RepositoryRecord {
  id: string;
  cat: CoverCategory;
  kind: string;                 // display label, e.g. 'Expedition Report'
  title: string;                // plain-language headline written for the public
  station: CoverStation;
  year: string;
  pills: string[];
  body: string[];               // simplified outreach paragraphs
  /** Key facts. An array of maps, not [string,string][] — Firestore rejects
   *  nested arrays outright, so a tuple list cannot be persisted. */
  table?: RecordFact[];
  credit?: string;

  photoUrls: string[];
  videoUrl?: string | null;

  measurements: Measurement[];
  chart?: RecordChart;

  /** Everything the prose in `body` was written from. Absent on records
   *  published before citations existed — iia-public derives a single
   *  provenance-level source for those rather than showing them uncited. */
  sources?: RecordSource[];
  /** Index-aligned with `body`: how each paragraph splits into cited spans.
   *  iia-public re-joins the spans and only trusts them when they reproduce
   *  the paragraph exactly, so an admin editing published body text can
   *  never leave a sentence attributed to a source it no longer came from. */
  citations?: ParagraphCitation[];

  metadata: RecordMetadata;
  publishedAt: number;
}

/** Station name → the cover-art key iia-public uses for palettes. */
export const STATION_COVER_KEY: Record<string, CoverStation> = {
  'Maitri': 'maitri',
  'Bharati': 'bharati',
  'Dakshin Gangotri': 'dakshin',
  'Other': 'ncpor',
};

/** Repository category → cover-art category + display label. */
export const CATEGORY_COVER: Record<string, { cat: CoverCategory; kind: string }> = {
  'Expedition Report':   { cat: 'expedition',   kind: 'Expedition Report' },
  'Dataset':             { cat: 'dataset',      kind: 'Dataset' },
  'Publication':         { cat: 'publication',  kind: 'Publication' },
  'Photographs & Video': { cat: 'media',        kind: 'Photographs & Video' },
  'Institutional':       { cat: 'institution',  kind: 'Institutional' },
};

/** Which activities produce which kind of published record. A wildlife count
 *  and a CTD cast are both datasets; an incident report is not published at
 *  all (see publish.ts). */
export const ACTIVITY_RESOURCE_TYPE: Record<string, ResourceType> = {
  'Ice / glaciology survey':       'Dataset',
  'Wildlife observation':          'Dataset',
  'Atmospheric / meteorology':     'Dataset',
  'Oceanography / CTD':            'Dataset',
  'Equipment check / maintenance': 'Report',
  'Base operations':               'Report',
  'Emergency / incident':          'Report',
  'Other':                         'Report',
};
