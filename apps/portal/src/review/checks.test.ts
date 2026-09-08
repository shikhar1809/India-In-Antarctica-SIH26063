import { describe, it, expect } from 'vitest';
import { runChecks, worstSeverity } from './checks';
import type { Dispatch } from '../types';

/** A dispatch with nothing wrong with it — every test starts from clean and
 *  breaks exactly one thing, so a failure names its own cause. */
function clean(over: Partial<Dispatch> = {}): Dispatch {
  return {
    id: 'd1', authorUid: 'u1', authorName: 'Dr A. Rao',
    observedAt: Date.UTC(2026, 1, 14),
    station: 'Maitri', lat: -70.76, lon: 11.73, elevationM: 130,
    positionSource: 'GPS handheld',
    activity: 'Ice / glaciology survey', priority: 'notable',
    weather: { airTempC: -24, windSpeedKt: 30, windDir: 'NE', visibilityKm: 3, cloudOktas: 6, present: 'Blowing snow' },
    measurements: { iceThickCm: '112' },
    notes: 'Drilled three holes across the transect and logged ice thickness at each, with snow depth alongside.',
    teamMembers: 'S. Menon', sampleIds: 'ICE-2026-0031', safetyFlag: false,
    voiceUrl: null, imageUrls: ['https://example.invalid/a.jpg'],
    csvUrl: null, docUrls: [],
    caption: 'Measuring how thick the sea ice is near Maitri this week.',
    status: 'drafted', publisherName: 'P. Publisher', publisherUid: 'p1',
    platformCaptions: { x: 'Ice thickness at Maitri.', linkedin: 'Ice thickness at Maitri.', instagram: 'Ice thickness at Maitri.' },
    coverImageIndex: 0,
    sopChecklist: { facts: true, safety: true, photo: true, credit: true, hashtags: true },
    adminNotes: null,
    publicSummary: { title: 'Measuring the ice at Maitri', body: ['Ice thickness was logged across a transect.'], table: [], chart: null },
    createdAt: 0, updatedAt: 0,
    ...over,
  } as Dispatch;
}

const ids = (d: Dispatch) => runChecks(d).map((c) => c.id);

describe('a complete dispatch', () => {
  it('raises nothing at all', () => {
    expect(runChecks(clean())).toEqual([]);
    expect(worstSeverity(runChecks(clean()))).toBeNull();
  });
});

describe('blockers', () => {
  it('refuses a safety-flagged dispatch', () => {
    const c = runChecks(clean({ safetyFlag: true }));
    expect(c.find((x) => x.id === 'safety-flag')?.severity).toBe('blocker');
    expect(worstSeverity(c)).toBe('blocker');
  });

  it('refuses an incident report', () => {
    expect(ids(clean({ activity: 'Emergency / incident' }))).toContain('incident');
  });
});

describe('missing things a reader would expect', () => {
  it('notices no photograph', () => {
    expect(ids(clean({ imageUrls: [] }))).toContain('no-photo');
  });

  it('notices the publisher never wrote a summary', () => {
    expect(ids(clean({ publicSummary: null }))).toContain('no-summary');
  });

  it('notices an empty public title even when a summary exists', () => {
    const got = ids(clean({ publicSummary: { title: '  ', body: ['text'], table: [], chart: null } } as Partial<Dispatch>));
    expect(got).toContain('no-title');
    expect(got).not.toContain('no-summary');
  });

  it('notices no measurements', () => {
    expect(ids(clean({ measurements: {} }))).toContain('no-measurements');
    expect(ids(clean({ measurements: { iceThickCm: '   ' } }))).toContain('no-measurements');
  });

  it('notices notes too thin to build a summary from', () => {
    expect(ids(clean({ notes: 'Went out.' }))).toContain('thin-notes');
  });

  it('notices missing coordinates', () => {
    expect(ids(clean({ lat: null }))).toContain('no-position');
  });

  it('lists which checklist items are unticked', () => {
    const c = runChecks(clean({ sopChecklist: { facts: true, safety: false, photo: false, credit: true, hashtags: true } }));
    const sop = c.find((x) => x.id === 'sop');
    expect(sop?.label).toContain('2');
    expect(sop?.detail).toContain('safety');
    expect(sop?.detail).toContain('photo');
  });
});

describe('things that would embarrass someone if they shipped', () => {
  it('catches a stake code that leaked into the caption', () => {
    expect(ids(clean({ caption: 'Readings at MAI-S12 this week.' }))).toContain('jargon');
  });

  it('catches a QC flag and a serial number', () => {
    expect(ids(clean({ caption: 'Logged QC: pass on the array.' }))).toContain('jargon');
    expect(ids(clean({ caption: 'Using logger serial: AX9931 out on the ice.' }))).toContain('jargon');
  });

  it('catches an overclaim one dispatch cannot support', () => {
    expect(ids(clean({ caption: 'The first-ever measurement of its kind.' }))).toContain('overclaim');
    expect(ids(clean({ caption: 'This proves the shelf is thinning.' }))).toContain('overclaim');
  });

  it('catches promotional punctuation', () => {
    expect(ids(clean({ caption: 'Amazing! Incredible! Look at this!' }))).toContain('exclamation');
  });

  it('catches shouting but tolerates the acronyms this programme uses', () => {
    expect(ids(clean({ caption: 'This is AMAZING work on the ice.' }))).toContain('caps');
    expect(ids(clean({ caption: 'Logged in UTC by NCPOR with GPS and CTD casts.' }))).not.toContain('caps');
  });

  it('catches a field-party member named in public copy', () => {
    const c = runChecks(clean({ teamMembers: 'S. Menon', caption: 'Great work by S. Menon on the transect.' }));
    expect(c.find((x) => x.id === 'team-named')?.detail).toContain('S. Menon');
  });

  it('catches specimen IDs in public copy', () => {
    expect(ids(clean({ caption: 'Collected ICE-2026-0031 from the transect today.' }))).toContain('sample-ids');
  });

  it('catches an X caption over the 280 limit', () => {
    const long = 'a'.repeat(300);
    const c = runChecks(clean({ platformCaptions: { x: long, linkedin: 'ok', instagram: 'ok' } }));
    expect(c.find((x) => x.id === 'x-too-long')?.label).toContain('300');
  });

  it('does not fire on ordinary, correctly written copy', () => {
    const got = ids(clean());
    for (const noisy of ['jargon', 'overclaim', 'exclamation', 'caps', 'team-named', 'sample-ids', 'x-too-long']) {
      expect(got).not.toContain(noisy);
    }
  });
});

describe('severity ordering', () => {
  it('reports the worst problem present', () => {
    expect(worstSeverity(runChecks(clean({ imageUrls: [] })))).toBe('missing');
    // 4+ letters: the shouting rule ignores shorter runs so the many
    // three-letter acronyms in this domain don't trip it.
    expect(worstSeverity(runChecks(clean({ caption: 'This is AMAZING work' })))).toBe('caution');
    expect(worstSeverity(runChecks(clean({ safetyFlag: true, imageUrls: [] })))).toBe('blocker');
  });
});
