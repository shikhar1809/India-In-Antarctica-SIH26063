import { describe, it, expect, vi } from 'vitest';

// publish.ts imports the live Firestore handle for its write helpers. The
// projection itself is pure, so the handle is stubbed rather than connected.
vi.mock('../firebase', () => ({ db: {} }));

import { toRepositoryRecord, documentToRepositoryRecord, canPublishDispatch, formatIdentifier } from './publish';
import type { Dispatch, ResearchDocument } from '../types';
import type { Measurement } from './contract';
import { draftPublicSummary } from './summarise';

/* Sentinels: every internal field carries a string that appears nowhere else,
 * so a leak of any kind shows up as a substring match on the serialised
 * public record. */
const SECRETS = {
  notes: 'INTERNAL_RAW_FIELD_NOTES_XYZZY',
  teamMembers: 'INTERNAL_TEAM_MEMBER_PLUGH',
  adminNotes: 'INTERNAL_ADMIN_NOTE_FROBOZZ',
  publisherUid: 'INTERNAL_PUBLISHER_UID_QUUX',
  authorUid: 'INTERNAL_AUTHOR_UID_THUD',
  sampleIds: 'INTERNAL_SAMPLE_ID_GRUE',
  caption: 'INTERNAL_SOCIAL_CAPTION_WUMPUS',
  csvUrl: 'https://example.invalid/INTERNAL_RAW_DATA_ZORK.csv',
};

function approvedDispatch(over: Partial<Dispatch> = {}): Dispatch {
  return {
    id: 'disp-1', authorUid: SECRETS.authorUid, authorName: 'Dr A. Rao',
    observedAt: Date.UTC(2026, 1, 14),
    station: 'Maitri', lat: -70.7659, lon: 11.7314, elevationM: 130,
    positionSource: 'GPS handheld',
    activity: 'Ice / glaciology survey', priority: 'notable',
    weather: { airTempC: -24, windSpeedKt: 30, windDir: 'NE', visibilityKm: 3, cloudOktas: 6, present: 'Blowing snow' },
    measurements: {},
    notes: SECRETS.notes,
    teamMembers: SECRETS.teamMembers,
    sampleIds: SECRETS.sampleIds,
    safetyFlag: false,
    voiceUrl: null,
    imageUrls: ['https://example.invalid/a.jpg', 'https://example.invalid/b.jpg'],
    csvUrl: SECRETS.csvUrl,
    docUrls: [{ name: 'raw.pdf', url: 'https://example.invalid/INTERNAL_DOC_XYZ.pdf' }],
    caption: SECRETS.caption,
    status: 'approved',
    publisherName: 'P. Publisher',
    publisherUid: SECRETS.publisherUid,
    platformCaptions: { x: SECRETS.caption, linkedin: SECRETS.caption, instagram: SECRETS.caption },
    coverImageIndex: 1,
    sopChecklist: { facts: true, safety: true, photo: true, credit: true, hashtags: true },
    adminNotes: SECRETS.adminNotes,
    createdAt: 0, updatedAt: 0,
    ...over,
  };
}

const MEASUREMENTS: Measurement[] = [
  { fieldId: 'iceThickCm', label: 'Ice thickness', value: '112', unit: 'cm' },
  { fieldId: 'snowDepthCm', label: 'Snow depth', value: '18', unit: 'cm' },
  { fieldId: 'freeboardCm', label: 'Freeboard', value: '8', unit: 'cm' },
  { fieldId: 'surface', label: 'Surface type', value: 'Wind slab', unit: null },
];

function publish(d: Dispatch = approvedDispatch()) {
  const summary = draftPublicSummary(d, MEASUREMENTS);
  return toRepositoryRecord(d, summary, MEASUREMENTS, 'admin-uid', 'IIA-2026-0042', Date.UTC(2026, 2, 1));
}

/* ══════════════════════════════════════════════════════════════════════════
 * The assertion this whole module exists for.
 * ═════════════════════════════════════════════════════════════════════════ */

describe('the public record cannot carry internal material', () => {
  it('contains none of the internal sentinel values anywhere in its JSON', () => {
    const serialised = JSON.stringify(publish());
    for (const [field, secret] of Object.entries(SECRETS)) {
      expect(serialised, `internal field "${field}" leaked into the public record`).not.toContain(secret);
    }
  });

  it('has no key named after an internal field, at any depth', () => {
    const forbidden = ['notes', 'teamMembers', 'adminNotes', 'sopChecklist', 'safetyFlag',
                       'publisherUid', 'authorUid', 'platformCaptions', 'sampleIds', 'csvUrl', 'docUrls', 'status'];
    const seen: string[] = [];
    (function walk(v: unknown) {
      if (!v || typeof v !== 'object') return;
      if (Array.isArray(v)) return v.forEach(walk);
      for (const [k, child] of Object.entries(v)) { seen.push(k); walk(child); }
    })(publish());
    expect(seen.filter((k) => forbidden.includes(k))).toEqual([]);
  });

  it('still credits the scientist by name, which is public by design', () => {
    expect(publish().credit).toContain('Dr A. Rao');
    expect(publish().metadata.creators[0].name).toBe('Dr A. Rao');
  });
});

describe('publishing guards', () => {
  it('refuses to publish anything flagged for the station leader', () => {
    const check = canPublishDispatch(approvedDispatch({ safetyFlag: true }));
    expect(check.ok).toBe(false);
    expect(check.ok === false && check.reason).toMatch(/not published to the public site/);
  });

  it('refuses to publish incident reports even when they are not flagged', () => {
    const check = canPublishDispatch(approvedDispatch({ activity: 'Emergency / incident', safetyFlag: false }));
    expect(check.ok).toBe(false);
  });

  it('refuses anything that has not been approved', () => {
    expect(canPublishDispatch(approvedDispatch({ status: 'drafted' })).ok).toBe(false);
  });

  it('allows an ordinary approved dispatch', () => {
    expect(canPublishDispatch(approvedDispatch()).ok).toBe(true);
  });
});

describe('the projection itself', () => {
  it('carries the publisher’s headline, not the raw activity name', () => {
    const rec = publish();
    expect(rec.title).toBe('Measuring the ice at Maitri');
  });

  it('puts the chosen cover photo first', () => {
    const rec = publish(approvedDispatch({ coverImageIndex: 1 }));
    expect(rec.photoUrls[0]).toBe('https://example.invalid/b.jpg');
    expect(rec.photoUrls).toHaveLength(2);
  });

  it('maps the station onto the public site’s cover-art key', () => {
    expect(publish().station).toBe('maitri');
    expect(publish(approvedDispatch({ station: 'Bharati' })).station).toBe('bharati');
  });

  it('records provenance pointing back at the source dispatch', () => {
    const rec = publish();
    expect(rec.metadata.provenance).toEqual({
      sourceType: 'dispatch', sourceId: 'disp-1',
      approvedBy: 'admin-uid', approvedAt: Date.UTC(2026, 2, 1),
    });
  });

  it('states the coordinate datum explicitly', () => {
    expect(publish().metadata.spatial.datum).toBe('WGS84');
  });

  it('classifies a glaciology survey as a Dataset', () => {
    expect(publish().metadata.resourceType).toBe('Dataset');
    expect(publish(approvedDispatch({ activity: 'Base operations' })).metadata.resourceType).toBe('Report');
  });
});

describe('identifiers', () => {
  it('formats to a citable, sortable, zero-padded id', () => {
    expect(formatIdentifier(2026, 42)).toBe('IIA-2026-0042');
    expect(formatIdentifier(2026, 1)).toBe('IIA-2026-0001');
    expect(formatIdentifier(2026, 9999)).toBe('IIA-2026-9999');
  });
});

describe('repository documents publish through the same projection', () => {
  const researchDoc: ResearchDocument = {
    id: 'doc-1', title: 'Schirmacher Oasis lake temperature series 2024–25',
    description: 'Daily temperature logging from six freshwater lakes.',
    category: 'Dataset', instrument: 'HOBO U22 logger',
    station: 'Maitri', observedAt: Date.UTC(2025, 0, 10), lat: -70.76, lon: 11.73,
    license: 'CC BY 4.0', embargo: 'none',
    fileName: 'lakes-2024-25.csv', fileUrl: 'https://example.invalid/lakes.csv', fileSizeBytes: 51200,
    authorUid: 'u9', authorName: 'Dr M. Iyer', authorEmail: 'm.iyer@example.invalid',
    createdAt: 0,
  };

  it('keeps the uploader’s email out of the public record', () => {
    const rec = documentToRepositoryRecord(researchDoc, 'admin-uid', 'IIA-2025-0007');
    expect(JSON.stringify(rec)).not.toContain('m.iyer@example.invalid');
  });

  it('carries the licence through to the published metadata', () => {
    const rec = documentToRepositoryRecord(researchDoc, 'admin-uid', 'IIA-2025-0007');
    expect(rec.metadata.license).toBe('CC BY 4.0');
    expect(rec.metadata.resourceType).toBe('Dataset');
  });
});
