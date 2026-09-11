/**
 * The contract between the scientist app and the portal, checked from both
 * ends so the two cannot drift apart unnoticed again.
 *
 * 1. Vocabulary. The app's lib/models/field_vocabulary.dart is read as text
 *    and compared with types.ts: stations, activities, wind, present
 *    weather, position sources, and every measurement field — id, label,
 *    unit, options. A field the app collects under an id the portal does not
 *    know is science that silently never shows up.
 *
 * 2. The report itself. A document shaped exactly as the app's
 *    sync_service.dart writes it goes through what the portal does with a
 *    raw report: normalising it, screening it, and building the public
 *    record from it.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ACTIVITY_TYPES, MEASUREMENT_SCHEMA, POSITION_SOURCES, PRESENT_WEATHER, STATIONS, WIND_DIRS, type Dispatch,
} from '../types';
import { normaliseDispatch } from './normalise';
import { draftPublicSummary } from './summarise';
import { canPublishDispatch, toRepositoryRecord } from './publish';
import { detect } from '../screening/detect';

const DART = readFileSync(resolve(__dirname, '../../../scientist-app/lib/models/field_vocabulary.dart'), 'utf8');

/** The quoted strings of a `const kName = <String>[ … ];` list. */
function dartList(name: string): string[] {
  const m = DART.match(new RegExp(`const ${name} = <String>\\[([\\s\\S]*?)\\];`));
  expect(m, `no ${name} in field_vocabulary.dart`).toBeTruthy();
  return [...m![1].matchAll(/'([^']*)'/g)].map((x) => x[1]);
}

/** The measurement schema, as { activity: [{ id, label, unit, options }] }. */
function dartSchema() {
  const block = DART.slice(DART.indexOf('const kMeasurementSchema'));
  const out: Record<string, { id: string; label: string; unit?: string; options?: string[] }[]> = {};
  for (const act of block.matchAll(/'([^']+)':\s*(?:<MeasurementField>)?\[([\s\S]*?)\],\n/g)) {
    out[act[1]] = [...act[2].matchAll(/MeasurementField\(([^)]*(?:\[[^\]]*\][^)]*)?)\)/g)].map((f) => {
      const body = f[1];
      const str = (k: string) => body.match(new RegExp(`${k}: '([^']*)'`))?.[1];
      const opts = body.match(/options: \[([^\]]*)\]/)?.[1];
      return {
        id: str('id')!,
        label: str('label')!,
        ...(str('unit') ? { unit: str('unit') } : {}),
        ...(opts ? { options: [...opts.matchAll(/'([^']*)'/g)].map((o) => o[1]) } : {}),
      };
    });
  }
  return out;
}

describe('the field app speaks the portal’s vocabulary', () => {
  it('lists the same stations, activities, weather and position sources', () => {
    expect(dartList('kStations')).toEqual([...STATIONS]);
    expect(dartList('kActivities')).toEqual([...ACTIVITY_TYPES]);
    expect(dartList('kWindDirs')).toEqual([...WIND_DIRS]);
    expect(dartList('kPresentWeather')).toEqual([...PRESENT_WEATHER]);
    expect(dartList('kPositionSources')).toEqual([...POSITION_SOURCES]);
  });

  it('collects every measurement under the id, label, unit and options the portal reads', () => {
    const dart = dartSchema();
    expect(Object.keys(dart).sort()).toEqual(Object.keys(MEASUREMENT_SCHEMA).sort());
    for (const [activity, fields] of Object.entries(MEASUREMENT_SCHEMA)) {
      const portal = fields.map((f) => ({
        id: f.id, label: f.label,
        ...(f.unit ? { unit: f.unit } : {}),
        ...(f.options ? { options: [...f.options] } : {}),
      }));
      expect(dart[activity], activity).toEqual(portal);
    }
  });
});

/** A report exactly as sync_service.dart writes it (see its `set({…})`). */
const FROM_THE_APP = {
  id: '6fedc103-9676-4331-9903-d8e626472269',
  authorUid: 'anon-uid', authorName: 'Dr Asha Rao',
  observedAt: Date.UTC(2026, 8, 11, 6), station: 'Maitri', lat: -70.766, lon: 11.7333, elevationM: 117,
  positionSource: 'GPS handheld', activity: 'Ice / glaciology survey', priority: 'routine',
  weather: { airTempC: -14.5, windSpeedKt: 6, windDir: 'S', visibilityKm: 25, cloudOktas: 1, present: 'Clear' },
  measurements: { siteId: 'MAI-S12', iceThickCm: '182', snowDepthCm: '34', surface: 'Wind slab' },
  notes: 'Stake transect at MAI-S12 complete; thickness consistent with last quarter.',
  teamMembers: 'A. Sharma', sampleIds: 'ICE-2609-A', safetyFlag: false,
  voiceUrl: null, imageUrls: ['https://firebasestorage.googleapis.com/v0/b/x/o/photo_0.jpg'], csvUrl: null, docUrls: [],
  caption: '', status: 'raw', publisherName: null, adminNotes: null,
  createdAt: Date.UTC(2026, 8, 11, 7), updatedAt: Date.UTC(2026, 8, 11, 7),
  createdAtServer: { seconds: 1789110000, nanoseconds: 0 },
} as unknown as Dispatch;

describe('a report from the field app, through the portal', () => {
  it('reads cleanly: no warnings, every measurement with its label and unit', () => {
    const { warnings, measurements } = normaliseDispatch(FROM_THE_APP);
    expect(warnings).toEqual([]);
    expect(measurements.find((m) => m.fieldId === 'iceThickCm')).toMatchObject({ label: 'Ice thickness', value: '182', unit: 'cm' });
  });

  it('is screened: the field party named in the notes would be found', () => {
    const findings = detect({ notes: `${FROM_THE_APP.notes} Sharma logged it.`, teamMembers: FROM_THE_APP.teamMembers });
    expect(findings.some((f) => f.field === 'notes' && f.quote === 'Sharma')).toBe(true);
  });

  it('can become a public record, credited to the scientist, carrying no internal fields', () => {
    const { dispatch, measurements } = normaliseDispatch(FROM_THE_APP);
    expect(canPublishDispatch({ ...dispatch, status: 'approved' }).ok).toBe(true);
    const record = toRepositoryRecord({ ...dispatch, status: 'approved' }, draftPublicSummary(dispatch, measurements), measurements, 'admin', 'IIA-2026-0001');
    const json = JSON.stringify(record);
    expect(json).toContain('Dr Asha Rao');
    for (const internal of ['A. Sharma', 'ICE-2609-A', 'anon-uid', 'createdAtServer']) expect(json).not.toContain(internal);
  });

  it('refuses an incident report for the public site', () => {
    expect(canPublishDispatch({ ...FROM_THE_APP, activity: 'Emergency / incident', status: 'approved' }).ok).toBe(false);
  });
});
