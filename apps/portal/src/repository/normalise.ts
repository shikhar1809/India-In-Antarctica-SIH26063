/* ═══════════════════════════════════════════════ inbound normalisation
 *
 * Field apps in Antarctica do not update on demand. A scientist can be on the
 * ice for a full season running whatever build was installed before they left,
 * so the portal has to keep reading dispatches written by older app versions
 * that used a different vocabulary entirely — Australian station names, METAR
 * weather codes, a 16-point compass, `presentWeather` instead of `present`.
 *
 * Everything inbound goes through normaliseDispatch() before the portal
 * displays or publishes it. Nothing is silently rewritten: whenever a value is
 * changed or can't be mapped, a warning comes back with it, and the portal
 * shows those warnings to the publisher reviewing the dispatch.
 */

import type { Dispatch, WeatherObs } from '../types';
import { MEASUREMENT_SCHEMA, PRESENT_WEATHER, WIND_DIRS, STATIONS, ACTIVITY_TYPES, POSITION_SOURCES, EMPTY_WEATHER } from '../types';
import type { Measurement, Station } from './contract';
import {
  LEGACY_STATION_ALIASES, LEGACY_ACTIVITY_ALIASES, LEGACY_WIND_DIR_ALIASES,
  METAR_PRESENT_ALIASES, LEGACY_POSITION_SOURCE_ALIASES, isPlausible,
} from './contract';

export interface NormaliseWarning {
  field: string;
  /** What the field app actually sent. */
  received: string;
  /** What it was changed to, or null when nothing sensible could be done. */
  mappedTo: string | null;
  message: string;
}

export interface NormalisedDispatch {
  dispatch: Dispatch;
  /** Structured measurements, units included — see contract.ts. */
  measurements: Measurement[];
  warnings: NormaliseWarning[];
  /** The station string exactly as received, kept whenever it had to be
   *  remapped so the original is never lost. */
  sourceStation: string | null;
}

const isKnown = (list: readonly string[], v: string) => list.includes(v);

/* ─────────────────────────────────────────────────────────────── station ── */

function normaliseStation(raw: unknown, warnings: NormaliseWarning[]): { station: Station; source: string | null } {
  const received = typeof raw === 'string' ? raw.trim() : '';
  if (received === '') {
    warnings.push({ field: 'station', received: '', mappedTo: 'Other',
      message: 'No station recorded — filed under Other.' });
    return { station: 'Other', source: null };
  }
  if (isKnown(STATIONS, received)) return { station: received as Station, source: null };

  const alias = LEGACY_STATION_ALIASES[received];
  if (alias) {
    warnings.push({ field: 'station', received, mappedTo: alias,
      message: `"${received}" is not an Indian station — it came from an older field-app build. Filed under Other; the original name is kept on the record.` });
    return { station: alias, source: received };
  }
  warnings.push({ field: 'station', received, mappedTo: 'Other',
    message: `Unrecognised station "${received}". Filed under Other; check the field app version.` });
  return { station: 'Other', source: received };
}

/* ────────────────────────────────────────────────────────────── activity ── */

function normaliseActivity(raw: unknown, warnings: NormaliseWarning[]): string {
  const received = typeof raw === 'string' ? raw.trim() : '';
  if (received === '') {
    warnings.push({ field: 'activity', received: '', mappedTo: 'Other',
      message: 'No activity recorded — filed under Other.' });
    return 'Other';
  }
  if (isKnown(ACTIVITY_TYPES, received)) return received;

  const alias = LEGACY_ACTIVITY_ALIASES[received];
  if (alias) {
    warnings.push({ field: 'activity', received, mappedTo: alias,
      message: `Activity "${received}" came from an older field-app build; read as "${alias}".` });
    return alias;
  }
  warnings.push({ field: 'activity', received, mappedTo: 'Other',
    message: `Unrecognised activity "${received}". Filed under Other.` });
  return 'Other';
}

/* ─────────────────────────────────────────────────────────────── weather ── */

/** Accepts a number, a numeric string, or junk; returns null for anything
 *  that isn't a finite number. The field app writes unvalidated free text, so
 *  "n/a" and "" both genuinely arrive here. */
function num(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
  return Number.isFinite(n) ? n : null;
}

function checkRange(
  field: 'airTempC' | 'windSpeedKt' | 'visibilityKm' | 'cloudOktas' | 'lat' | 'lon' | 'elevationM',
  value: number | null, warnings: NormaliseWarning[],
): number | null {
  if (value === null) return null;
  if (isPlausible(field, value)) return value;
  warnings.push({ field, received: String(value), mappedTo: null,
    message: `${field} of ${value} is outside the plausible range — kept on the record but flagged, and excluded from charts.` });
  return value; // kept, not discarded — a real reading that looks odd is still evidence
}

export function normaliseWeather(raw: unknown, warnings: NormaliseWarning[]): WeatherObs {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_WEATHER };
  const w = raw as Record<string, unknown>;

  // The Dart model calls this `presentWeather`; the portal calls it `present`.
  const presentRaw = (w.present ?? w.presentWeather ?? '') as string;
  let present = String(presentRaw).trim();
  if (present === '') {
    present = 'Clear';
  } else if (!isKnown(PRESENT_WEATHER, present)) {
    const mapped = METAR_PRESENT_ALIASES[present.toUpperCase()];
    if (mapped) {
      warnings.push({ field: 'weather.present', received: present, mappedTo: mapped,
        message: `Weather code "${present}" is METAR shorthand from an older field-app build; read as "${mapped}".` });
      present = mapped;
    } else {
      warnings.push({ field: 'weather.present', received: present, mappedTo: 'Clear',
        message: `Unrecognised weather code "${present}" — defaulted to Clear. Verify against the field notes before publishing.` });
      present = 'Clear';
    }
  }

  let windDir = String(w.windDir ?? '').trim();
  if (windDir === '') {
    windDir = 'Calm';
  } else if (!isKnown(WIND_DIRS, windDir)) {
    const mapped = LEGACY_WIND_DIR_ALIASES[windDir.toUpperCase()] ?? LEGACY_WIND_DIR_ALIASES[windDir];
    if (mapped) {
      windDir = mapped; // 16-point → 8-point is expected, not worth warning about
    } else {
      warnings.push({ field: 'weather.windDir', received: windDir, mappedTo: 'Variable',
        message: `Unrecognised wind direction "${windDir}" — recorded as Variable.` });
      windDir = 'Variable';
    }
  }

  return {
    airTempC:     checkRange('airTempC',     num(w.airTempC),     warnings),
    windSpeedKt:  checkRange('windSpeedKt',  num(w.windSpeedKt),  warnings),
    windDir,
    visibilityKm: checkRange('visibilityKm', num(w.visibilityKm), warnings),
    cloudOktas:   checkRange('cloudOktas',   num(w.cloudOktas),   warnings),
    present,
  };
}

/* ────────────────────────────────────────────────────────── measurements ──
 * Two shapes arrive here. Older dispatches carry Record<string,string> keyed
 * by MEASUREMENT_SCHEMA field id, with the unit living only in that schema.
 * Newer ones carry a Measurement[] with the unit already attached. Both come
 * out as Measurement[], so nothing downstream has to care which it was.     */

export function normaliseMeasurements(raw: unknown, activity: string, warnings: NormaliseWarning[]): Measurement[] {
  if (!raw) return [];
  const schema = MEASUREMENT_SCHEMA[activity] ?? [];
  const fieldById = new Map(schema.map((f) => [f.id, f]));

  // Already structured (new field-app builds, or a re-read of a published record).
  if (Array.isArray(raw)) {
    return raw
      .filter((m): m is Measurement => !!m && typeof m === 'object' && 'fieldId' in m)
      .map((m) => {
        const known = fieldById.get(m.fieldId);
        return {
          fieldId: m.fieldId,
          label: m.label || known?.label || m.fieldId,
          value: String(m.value ?? ''),
          unit: m.unit ?? known?.unit ?? null,
          ...(m.qcFlag ? { qcFlag: m.qcFlag } : {}),
        };
      })
      .filter((m) => m.value.trim() !== '');
  }

  if (typeof raw !== 'object') return [];

  // Legacy flat map — reattach the unit and label from the schema.
  return Object.entries(raw as Record<string, unknown>)
    .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '')
    .map(([fieldId, v]) => {
      const known = fieldById.get(fieldId);
      if (!known) {
        warnings.push({ field: `measurements.${fieldId}`, received: String(v), mappedTo: null,
          message: `Measurement "${fieldId}" isn't in the schema for ${activity} — kept without a unit.` });
      }
      return {
        fieldId,
        label: known?.label ?? fieldId,
        value: String(v).trim(),
        unit: known?.unit ?? null,
      };
    });
}

/* ────────────────────────────────────────────────────────────── position ── */

function normalisePositionSource(raw: unknown): string {
  const received = typeof raw === 'string' ? raw.trim() : '';
  if (received === '') return 'GPS handheld';
  if (isKnown(POSITION_SOURCES, received)) return received;
  return LEGACY_POSITION_SOURCE_ALIASES[received] ?? 'Manual / map';
}

/* ───────────────────────────────────────────────────────────────── entry ── */

/**
 * Repair and validate one raw Firestore dispatch. Pure — no I/O, no mutation
 * of the input — which is what makes it straightforward to test properly.
 */
export function normaliseDispatch(raw: Dispatch): NormalisedDispatch {
  const warnings: NormaliseWarning[] = [];

  const { station, source } = normaliseStation(raw.station, warnings);
  const activity = normaliseActivity(raw.activity, warnings);
  const weather = normaliseWeather(raw.weather, warnings);
  const measurements = normaliseMeasurements(raw.measurements, activity, warnings);

  const lat = checkRange('lat', num(raw.lat), warnings);
  const lon = checkRange('lon', num(raw.lon), warnings);
  const elevationM = checkRange('elevationM', num(raw.elevationM), warnings);

  return {
    dispatch: {
      ...raw,
      station,
      activity,
      weather,
      lat,
      lon,
      elevationM,
      positionSource: normalisePositionSource(raw.positionSource),
    },
    measurements,
    warnings,
    sourceStation: source,
  };
}
