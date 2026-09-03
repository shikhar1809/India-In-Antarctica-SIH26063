import { describe, it, expect } from 'vitest';
import { normaliseDispatch, normaliseWeather, normaliseMeasurements } from './normalise';
import type { NormaliseWarning } from './normalise';
import type { Dispatch } from '../types';

/** A dispatch exactly as the *older* Flutter build writes one: Australian
 *  station, its own activity vocabulary, METAR weather codes, a 16-point
 *  compass, `presentWeather` instead of `present`, and no measurements. */
function legacyDispatch(over: Partial<Dispatch> = {}): Dispatch {
  return {
    id: 'd1', authorUid: 'u1', authorName: 'S. Shahi',
    observedAt: Date.UTC(2026, 1, 14, 9, 30),
    station: 'Casey Station',
    lat: -70.05, lon: 12.0, elevationM: 45, positionSource: 'GPS',
    activity: 'Sea Ice Survey', priority: 'routine',
    weather: { airTempC: -19, windSpeedKt: 28, windDir: 'ENE', visibilityKm: 2, cloudOktas: 8, presentWeather: 'BLSN' } as never,
    measurements: {}, notes: 'Routine transect.', teamMembers: 'A, B', sampleIds: '',
    safetyFlag: false, voiceUrl: null, imageUrls: [], csvUrl: null, docUrls: [],
    caption: '', status: 'raw', publisherName: null, publisherUid: null,
    platformCaptions: null, coverImageIndex: null, sopChecklist: null, adminNotes: null,
    createdAt: 0, updatedAt: 0,
    ...over,
  };
}

const warningFor = (ws: NormaliseWarning[], field: string) => ws.find((w) => w.field === field);

describe('station normalisation', () => {
  it('maps an Australian station to Other and keeps the original name', () => {
    const { dispatch, sourceStation, warnings } = normaliseDispatch(legacyDispatch());
    expect(dispatch.station).toBe('Other');
    expect(sourceStation).toBe('Casey Station');
    expect(warningFor(warnings, 'station')?.message).toMatch(/not an Indian station/);
  });

  it('leaves a real Indian station untouched and warns about nothing', () => {
    const { dispatch, sourceStation, warnings } = normaliseDispatch(
      legacyDispatch({ station: 'Bharati', activity: 'Wildlife observation' }),
    );
    expect(dispatch.station).toBe('Bharati');
    expect(sourceStation).toBeNull();
    expect(warningFor(warnings, 'station')).toBeUndefined();
  });

  it('files an empty station under Other rather than throwing', () => {
    const { dispatch } = normaliseDispatch(legacyDispatch({ station: '' }));
    expect(dispatch.station).toBe('Other');
  });
});

describe('activity normalisation', () => {
  it('maps the old vocabulary onto the portal activity list', () => {
    expect(normaliseDispatch(legacyDispatch()).dispatch.activity).toBe('Ice / glaciology survey');
    expect(normaliseDispatch(legacyDispatch({ activity: 'Marine Biology' })).dispatch.activity).toBe('Wildlife observation');
    expect(normaliseDispatch(legacyDispatch({ activity: 'Station Support' })).dispatch.activity).toBe('Base operations');
  });

  it('files an activity it has never seen under Other, with a warning', () => {
    const { dispatch, warnings } = normaliseDispatch(legacyDispatch({ activity: 'Underwater Basket Weaving' }));
    expect(dispatch.activity).toBe('Other');
    expect(warningFor(warnings, 'activity')?.received).toBe('Underwater Basket Weaving');
  });
});

describe('weather normalisation', () => {
  it('reads Dart’s presentWeather field and translates the METAR code', () => {
    const warnings: NormaliseWarning[] = [];
    const w = normaliseWeather({ presentWeather: 'BLSN' }, warnings);
    expect(w.present).toBe('Blowing snow');
    expect(warningFor(warnings, 'weather.present')?.mappedTo).toBe('Blowing snow');
  });

  it('folds a 16-point wind direction onto the 8-point compass silently', () => {
    const warnings: NormaliseWarning[] = [];
    expect(normaliseWeather({ windDir: 'ENE' }, warnings).windDir).toBe('NE');
    expect(normaliseWeather({ windDir: 'WSW' }, warnings).windDir).toBe('SW');
    expect(normaliseWeather({ windDir: 'VRB' }, warnings).windDir).toBe('Variable');
    // an expected, lossless-enough conversion shouldn't nag the publisher
    expect(warnings).toHaveLength(0);
  });

  it('flags a weather code it cannot map instead of guessing', () => {
    const warnings: NormaliseWarning[] = [];
    const w = normaliseWeather({ presentWeather: 'TSGR' }, warnings);
    expect(w.present).toBe('Clear');
    expect(warningFor(warnings, 'weather.present')?.message).toMatch(/Verify against the field notes/);
  });

  it('parses numeric strings and rejects junk', () => {
    const warnings: NormaliseWarning[] = [];
    const w = normaliseWeather({ airTempC: '-12.4', windSpeedKt: 'n/a', visibilityKm: '' }, warnings);
    expect(w.airTempC).toBe(-12.4);
    expect(w.windSpeedKt).toBeNull();
    expect(w.visibilityKm).toBeNull();
  });

  it('keeps an implausible reading but flags it', () => {
    const warnings: NormaliseWarning[] = [];
    const w = normaliseWeather({ airTempC: -999 }, warnings);
    expect(w.airTempC).toBe(-999);                       // evidence isn't discarded
    expect(warningFor(warnings, 'airTempC')?.message).toMatch(/outside the plausible range/);
  });

  it('accepts a genuinely extreme but possible Antarctic temperature', () => {
    const warnings: NormaliseWarning[] = [];
    normaliseWeather({ airTempC: -89.2 }, warnings);     // Vostok's record low
    expect(warningFor(warnings, 'airTempC')).toBeUndefined();
  });
});

describe('position normalisation', () => {
  it('flags an impossible latitude', () => {
    const { warnings } = normaliseDispatch(legacyDispatch({ lat: 400 }));
    expect(warningFor(warnings, 'lat')).toBeDefined();
  });

  it('maps the old position-source vocabulary', () => {
    expect(normaliseDispatch(legacyDispatch()).dispatch.positionSource).toBe('GPS handheld');
    expect(normaliseDispatch(legacyDispatch({ positionSource: 'Map pick' })).dispatch.positionSource).toBe('Manual / map');
  });
});

describe('measurement normalisation', () => {
  it('reattaches the unit and label from the schema to a legacy flat map', () => {
    const warnings: NormaliseWarning[] = [];
    const ms = normaliseMeasurements(
      { iceThickCm: '112', snowDepthCm: '18', surface: 'Wind slab' },
      'Ice / glaciology survey', warnings,
    );
    const thick = ms.find((m) => m.fieldId === 'iceThickCm');
    expect(thick).toEqual({ fieldId: 'iceThickCm', label: 'Ice thickness', value: '112', unit: 'cm' });
    // a categorical field survives too, just without a unit
    expect(ms.find((m) => m.fieldId === 'surface')?.unit).toBeNull();
  });

  it('drops empty values so they never reach a chart or a facts table', () => {
    const ms = normaliseMeasurements({ iceThickCm: '', snowDepthCm: '  ', freeboardCm: '8' }, 'Ice / glaciology survey', []);
    expect(ms.map((m) => m.fieldId)).toEqual(['freeboardCm']);
  });

  it('passes through measurements that already carry their unit', () => {
    const ms = normaliseMeasurements(
      [{ fieldId: 'count', label: 'Individuals counted', value: '240', unit: 'ind.' }],
      'Wildlife observation', [],
    );
    expect(ms[0].unit).toBe('ind.');
  });

  it('warns when a measurement is not in the schema for its activity', () => {
    const warnings: NormaliseWarning[] = [];
    normaliseMeasurements({ mysteryField: '7' }, 'Wildlife observation', warnings);
    expect(warningFor(warnings, 'measurements.mysteryField')).toBeDefined();
  });

  it('returns an empty list for the empty map the old app always sent', () => {
    expect(normaliseMeasurements({}, 'Ice / glaciology survey', [])).toEqual([]);
  });
});

describe('normaliseDispatch is pure', () => {
  it('does not mutate its input', () => {
    const original = legacyDispatch();
    const snapshot = JSON.parse(JSON.stringify(original));
    normaliseDispatch(original);
    expect(JSON.parse(JSON.stringify(original))).toEqual(snapshot);
  });
});
