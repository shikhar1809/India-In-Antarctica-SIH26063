import { describe, it, expect } from 'vitest';
import { draftPublicSummary, deriveChart } from './summarise';
import type { Dispatch } from '../types';
import type { Measurement } from './contract';

function dispatch(over: Partial<Dispatch> = {}): Dispatch {
  return {
    id: 'd1', authorUid: 'u1', authorName: 'Dr A. Rao',
    observedAt: Date.UTC(2026, 1, 14),
    station: 'Maitri', lat: -70.7659, lon: 11.7314, elevationM: 130,
    positionSource: 'GPS handheld',
    activity: 'Ice / glaciology survey', priority: 'routine',
    weather: { airTempC: -6, windSpeedKt: 5, windDir: 'NE', visibilityKm: 20, cloudOktas: 2, present: 'Clear' },
    measurements: {}, notes: 'Stake MAI-S12 freeboard 8cm, surface wind slab, transect 400m',
    teamMembers: '', sampleIds: '', safetyFlag: false,
    voiceUrl: null, imageUrls: [], csvUrl: null, docUrls: [],
    caption: '', status: 'approved', publisherName: null, publisherUid: null,
    platformCaptions: null, coverImageIndex: null, sopChecklist: null, adminNotes: null,
    createdAt: 0, updatedAt: 0,
    ...over,
  };
}

const ICE: Measurement[] = [
  { fieldId: 'iceThickCm', label: 'Ice thickness', value: '112', unit: 'cm' },
  { fieldId: 'snowDepthCm', label: 'Snow depth', value: '18', unit: 'cm' },
  { fieldId: 'freeboardCm', label: 'Freeboard', value: '8', unit: 'cm' },
  { fieldId: 'surface', label: 'Surface type', value: 'Wind slab', unit: null },
];

describe('outreach voice', () => {
  it('writes a headline a general reader can parse', () => {
    expect(draftPublicSummary(dispatch(), ICE).title).toBe('Measuring the ice at Maitri');
    expect(draftPublicSummary(dispatch({ station: 'Bharati', activity: 'Wildlife observation' }), []).title)
      .toBe('Counting wildlife near Bharati');
  });

  it('never repeats the scientist’s raw shorthand notes', () => {
    const summary = draftPublicSummary(dispatch(), ICE);
    const prose = summary.body.join(' ');
    expect(prose).not.toContain('MAI-S12');
    expect(prose).not.toContain('transect');
  });

  it('explains why the observation matters, not just what it was', () => {
    const summary = draftPublicSummary(dispatch(), ICE);
    expect(summary.body[1]).toMatch(/warming planet/);
    expect(summary.body.length).toBeGreaterThanOrEqual(2);
  });

  it('gives the station context a reader would not already have', () => {
    expect(draftPublicSummary(dispatch(), ICE).body[0]).toMatch(/Schirmacher Oasis/);
    expect(draftPublicSummary(dispatch({ station: 'Bharati' }), []).body[0]).toMatch(/shipping containers/);
  });

  it('leads with the actual measurement when there is one', () => {
    expect(draftPublicSummary(dispatch(), ICE).body[0]).toContain('112 centimetres thick');
  });

  it('describes a penguin count in words rather than field codes', () => {
    const ms: Measurement[] = [
      { fieldId: 'species', label: 'Species', value: 'Pygoscelis adeliae', unit: null },
      { fieldId: 'count', label: 'Individuals counted', value: '240', unit: 'ind.' },
    ];
    const body = draftPublicSummary(dispatch({ activity: 'Wildlife observation', station: 'Bharati' }), ms).body[0];
    expect(body).toContain('240 Pygoscelis adeliae');
  });
});

describe('conditions paragraph', () => {
  it('is omitted on a mild, ordinary day', () => {
    // -6 °C and clear is unremarkable by Antarctic standards
    expect(draftPublicSummary(dispatch(), ICE).body).toHaveLength(2);
  });

  it('appears when the weather was genuinely severe', () => {
    const severe = dispatch({
      weather: { airTempC: -31, windSpeedKt: 38, windDir: 'NE', visibilityKm: 1, cloudOktas: 8, present: 'Blowing snow' },
    });
    const body = draftPublicSummary(severe, ICE).body;
    expect(body).toHaveLength(3);
    expect(body[2]).toContain('-31 °C');
    expect(body[2]).toContain('38-knot winds');
  });
});

describe('key facts', () => {
  it('formats coordinates with hemispheres rather than raw signs', () => {
    const table = draftPublicSummary(dispatch(), ICE).table;
    expect(table.find((f) => f.label === 'Position')?.value).toBe('70.7659° S, 11.7314° E');
  });

  it('gives every measurement its unit', () => {
    const table = draftPublicSummary(dispatch(), ICE).table;
    expect(table.find((f) => f.label === 'Ice thickness')?.value).toBe('112 cm');
    expect(table.find((f) => f.label === 'Surface type')?.value).toBe('Wind slab'); // no unit, no stray space
  });
});

describe('chart derivation', () => {
  it('charts the three same-unit ice readings together', () => {
    const chart = deriveChart(ICE, 'Ice / glaciology survey');
    expect(chart?.unit).toBe('cm');
    expect(chart?.data).toEqual([
      { label: 'Ice thickness', value: 112 },
      { label: 'Snow depth', value: 18 },
      { label: 'Freeboard', value: 8 },
    ]);
    expect(chart?.caption).toContain('centimetres');
  });

  it('excludes categorical fields that have no numeric value', () => {
    const labels = deriveChart(ICE, 'Ice / glaciology survey')?.data.map((d) => d.label) ?? [];
    expect(labels).not.toContain('Surface type');
  });

  it('draws nothing rather than a misleading single bar', () => {
    const one: Measurement[] = [{ fieldId: 'count', label: 'Individuals counted', value: '240', unit: 'ind.' }];
    expect(deriveChart(one, 'Wildlife observation')).toBeUndefined();
  });

  it('refuses to put two different units on one axis', () => {
    const mixed: Measurement[] = [
      { fieldId: 'maxDepthM', label: 'Max cast depth', value: '750', unit: 'm' },
      { fieldId: 'count', label: 'Individuals counted', value: '240', unit: 'ind.' },
    ];
    // neither unit has two readings, so there is no honest chart to draw
    expect(deriveChart(mixed, 'Oceanography / CTD')).toBeUndefined();
  });

  it('picks the larger same-unit group when there is a choice', () => {
    const mixed: Measurement[] = [
      ...ICE,
      { fieldId: 'aM', label: 'A', value: '1', unit: 'm' },
      { fieldId: 'bM', label: 'B', value: '2', unit: 'm' },
    ];
    expect(deriveChart(mixed, 'Ice / glaciology survey')?.unit).toBe('cm'); // 3 beats 2
  });

  it('returns nothing when there are no measurements at all', () => {
    expect(deriveChart([], 'Base operations')).toBeUndefined();
  });
});

describe('Firestore storability', () => {
  it('has no nested arrays anywhere — Firestore rejects them outright', () => {
    // The key-facts table was originally [string, string][], which cannot be
    // written to Firestore at all. Caught by a real write, fixed to a list of
    // {label, value} maps, and pinned here so it cannot regress.
    const summary = draftPublicSummary(dispatch(), ICE);
    const nested: string[] = [];
    (function walk(v: unknown, path: string) {
      if (Array.isArray(v)) {
        v.forEach((child, i) => {
          if (Array.isArray(child)) nested.push(`${path}[${i}]`);
          walk(child, `${path}[${i}]`);
        });
        return;
      }
      if (v && typeof v === 'object') {
        for (const [k, child] of Object.entries(v)) walk(child, `${path}.${k}`);
      }
    })(summary, 'summary');
    expect(nested).toEqual([]);
  });
});

describe('determinism', () => {
  it('produces an identical draft for an identical dispatch', () => {
    expect(draftPublicSummary(dispatch(), ICE)).toEqual(draftPublicSummary(dispatch(), ICE));
  });
});
