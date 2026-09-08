import { describe, it, expect, vi } from 'vitest';

vi.mock('../firebase', () => ({ db: {} }));

import { FIELD_RULES, redactionOf, documentRedactionOf } from './redaction';
import { toRepositoryRecord } from './publish';
import { draftPublicSummary } from './summarise';
import type { Dispatch, ResearchDocument } from '../types';
import type { Measurement } from './contract';

function dispatch(over: Partial<Dispatch> = {}): Dispatch {
  return {
    id: 'disp-1', authorUid: 'uid-9', authorName: 'Dr A. Rao',
    observedAt: Date.UTC(2026, 1, 14),
    station: 'Maitri', lat: -70.7659, lon: 11.7314, elevationM: 130,
    positionSource: 'GPS handheld',
    activity: 'Ice / glaciology survey', priority: 'notable',
    weather: { airTempC: -24, windSpeedKt: 30, windDir: 'NE', visibilityKm: 3, cloudOktas: 6, present: 'Blowing snow' },
    measurements: { iceThickCm: '112' },
    notes: 'Drill jammed twice, Sanjay reckons the auger bearing is going.',
    teamMembers: 'S. Menon, P. Das',
    sampleIds: 'MAI-ICE-2026-014',
    safetyFlag: false,
    voiceUrl: null,
    imageUrls: ['https://example.invalid/a.jpg'],
    csvUrl: 'https://example.invalid/raw.csv',
    docUrls: [{ name: 'raw.pdf', url: 'https://example.invalid/raw.pdf' }],
    caption: 'Out on the ice today!',
    status: 'approved',
    publisherName: 'P. Publisher', publisherUid: 'uid-2',
    platformCaptions: null, coverImageIndex: 0,
    sopChecklist: { facts: true },
    adminNotes: 'Contributor was slow to respond last season.',
    createdAt: 0, updatedAt: 0,
    ...over,
  };
}

const MEASUREMENTS: Measurement[] = [
  { fieldId: 'iceThickCm', label: 'Ice thickness', value: '112', unit: 'cm' },
];

describe('the redaction declaration', () => {
  it('accounts for every field a dispatch can carry', () => {
    // The type already forces this; assert it at runtime too, because a
    // field added to Dispatch and forgotten here is exactly the mistake this
    // module exists to make impossible.
    const declared = new Set(Object.keys(FIELD_RULES));
    for (const key of Object.keys(dispatch())) {
      expect(declared.has(key), `field "${key}" has no redaction rule`).toBe(true);
    }
  });

  it('gives every rule a reason someone could defend', () => {
    for (const [key, rule] of Object.entries(FIELD_RULES)) {
      expect(rule.reason.length, `${key} has no reason`).toBeGreaterThan(20);
    }
  });
});

describe('what a real dispatch withholds', () => {
  const r = redactionOf(dispatch());

  it('holds back the things a reviewer most needs to see held back', () => {
    const keys = r.withheld.map((f) => f.key);
    expect(keys).toContain('notes');
    expect(keys).toContain('teamMembers');
    expect(keys).toContain('sampleIds');
    expect(keys).toContain('adminNotes');
    expect(keys).toContain('csvUrl');
    expect(keys).toContain('docUrls');
  });

  it('shows the reviewer the withheld content itself, not just its name', () => {
    const notes = r.withheld.find((f) => f.key === 'notes');
    expect(notes?.raw).toContain('auger bearing');
  });

  it('lists nothing that the dispatch does not actually carry', () => {
    const empty = redactionOf(dispatch({ adminNotes: null, notes: '', teamMembers: '' }));
    const keys = empty.all.map((f) => f.key);
    expect(keys).not.toContain('adminNotes');
    expect(keys).not.toContain('notes');
    expect(keys).not.toContain('teamMembers');
  });

  it('agrees with what the projection actually publishes', () => {
    // The declaration is documentation until it matches the code. Anything
    // marked withheld must genuinely be absent from the published record.
    const d = dispatch();
    const record = toRepositoryRecord(d, draftPublicSummary(d, MEASUREMENTS), MEASUREMENTS, 'admin', 'IIA-2026-0001', 0);
    const serialised = JSON.stringify(record);
    for (const field of redactionOf(d).withheld) {
      // Short generic values ("no", "0") match anywhere in a JSON blob by
      // coincidence; the substring test only means something for content
      // distinctive enough that finding it proves it travelled.
      if (field.raw.length < 12) continue;
      expect(serialised, `"${field.label}" is declared withheld but appears in the public record`)
        .not.toContain(field.raw);
    }
  });

  it('still publishes the observer, the position and the conditions', () => {
    const keys = r.published.map((f) => f.key);
    expect(keys).toEqual(expect.arrayContaining(['authorName', 'lat', 'lon', 'weather', 'observedAt']));
  });
});

describe('what a repository deposit withholds', () => {
  const doc: ResearchDocument = {
    id: 'doc-1', title: 'Lake temperature series', description: 'Daily logging.',
    category: 'Dataset', instrument: 'HOBO U22', station: 'Maitri',
    observedAt: Date.UTC(2025, 0, 10), lat: -70.76, lon: 11.73,
    license: 'CC BY 4.0', embargo: 'none',
    fileName: 'lakes.csv', fileUrl: 'https://example.invalid/lakes.csv', fileSizeBytes: 51200,
    authorUid: 'u9', authorName: 'Dr M. Iyer', authorEmail: 'm.iyer@example.invalid',
    reviewNotes: 'Chased twice for the methods section.',
    createdAt: 0,
  };

  it('keeps the contributor’s email and the review notes back', () => {
    const keys = documentRedactionOf(doc).withheld.map((f) => f.key);
    expect(keys).toContain('authorEmail');
    expect(keys).toContain('reviewNotes');
  });

  it('publishes the report itself', () => {
    const withReport = { ...doc, fullText: 'A paragraph of the report.' };
    const keys = documentRedactionOf(withReport).published.map((f) => f.key);
    expect(keys).toContain('fullText');
    expect(keys).toContain('title');
  });
});
