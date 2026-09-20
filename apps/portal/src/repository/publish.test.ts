import { describe, it, expect, vi } from 'vitest';

// publish.ts imports the live Firestore handle for its write helpers. The
// projection itself is pure, so the handle is stubbed rather than connected.
vi.mock('../firebase', () => ({ db: {} }));

import { toRepositoryRecord, documentToRepositoryRecord, canPublishDispatch, publishObjections, formatIdentifier } from './publish';
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
    expect(check.ok === false && check.reason).toMatch(/flagged for the station leader/i);
  });

  it('refuses to publish incident reports even when they are not flagged', () => {
    const check = canPublishDispatch(approvedDispatch({ activity: 'Emergency / incident', safetyFlag: false }));
    expect(check.ok).toBe(false);
  });

  /* Those two are editorial judgements, and an admin is who they belong
   * to: they can be overruled deliberately, and the desk records who did
   * it. What cannot be overruled is publishing something unapproved. */
  it('lets an admin overrule a flag or an incident, knowingly', () => {
    expect(canPublishDispatch(approvedDispatch({ safetyFlag: true }), { override: true }).ok).toBe(true);
    expect(canPublishDispatch(approvedDispatch({ activity: 'Emergency / incident' }), { override: true }).ok).toBe(true);
  });

  it('never lets an override publish something unapproved', () => {
    expect(canPublishDispatch(approvedDispatch({ status: 'drafted' }), { override: true }).ok).toBe(false);
  });

  it('names every objection, so an override is made knowing what it overrides', () => {
    const both = publishObjections(approvedDispatch({ safetyFlag: true, activity: 'Emergency / incident' }));
    expect(both).toHaveLength(2);
    expect(publishObjections(approvedDispatch({}))).toEqual([]);
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

describe('citations on a published dispatch record', () => {
  it('cites every published paragraph', () => {
    const rec = publish();
    expect(rec.citations).toHaveLength(rec.body.length);
    for (const p of rec.citations!) expect(p.spans.length).toBeGreaterThan(0);
  });

  it('reproduces each paragraph exactly when its spans are re-joined', () => {
    const rec = publish();
    rec.citations!.forEach((p, i) => {
      expect(p.spans.map((s) => s.text).join(' ')).toBe(rec.body[i]);
    });
  });

  it('separates the measured observation from NCPOR’s standing background', () => {
    const rec = publish();
    const first = rec.citations![0].spans;
    expect(first[0].sourceId).toBe('dispatch');
    expect(first[0].text).toContain('112 centimetres thick');
    expect(first[1].sourceId).toBe('station-context');
    expect(first[1].text).toContain('Schirmacher Oasis');
  });

  it('does not attribute the outreach paragraph to the field record', () => {
    const rec = publish();
    expect(rec.citations![1].spans[0].sourceId).toBe('outreach');
  });

  it('credits the publisher for a paragraph they rewrote themselves', () => {
    const d = approvedDispatch();
    const summary = draftPublicSummary(d, MEASUREMENTS);
    const edited = { ...summary, body: [...summary.body, 'A sentence the publisher wrote by hand.'] };
    const rec = toRepositoryRecord(d, edited, MEASUREMENTS, 'admin-uid', 'IIA-2026-0042', 0);
    const last = rec.citations![rec.citations!.length - 1].spans[0];
    expect(last.sourceId).toBe('publisher');
    expect(rec.sources!.find((s) => s.id === 'publisher')?.author).toBe('P. Publisher');
  });

  it('never links a source that points back at internal material', () => {
    for (const source of publish().sources!) expect(source.url).toBeNull();
  });

  it('lists only sources something in the text actually cites', () => {
    const rec = publish();
    const ids = new Set(rec.citations!.flatMap((p) => p.spans.map((s) => s.sourceId)));
    for (const source of rec.sources!) expect(ids.has(source.id)).toBe(true);
  });

  it('every cited span resolves to a listed source', () => {
    const rec = publish();
    const ids = new Set(rec.sources!.map((s) => s.id));
    for (const p of rec.citations!) {
      for (const span of p.spans) if (span.sourceId) expect(ids.has(span.sourceId)).toBe(true);
    }
  });
});

describe('the published report body', () => {
  it('publishes a report, not only an abstract', () => {
    const rec = publish();
    expect(rec.sections?.length).toBeGreaterThan(2);
    const words = rec.sections!.flatMap((x) => x.paragraphs).join(' ').split(/\s+/).length;
    expect(words).toBeGreaterThan(250);
  });

  it('describes how the measurements were made', () => {
    const method = publish().sections!.find((x) => x.id === 'method');
    expect(method?.paragraphs[0]).toMatch(/stake/);
  });

  it('puts the readings behind a figure rather than only in prose', () => {
    const readings = publish().sections!.find((x) => x.id === 'readings');
    expect(readings?.figure?.kind).toBe('chart');
    expect(readings?.figure?.chart?.data).toHaveLength(3);
  });

  it('falls back to a table of readings when the numbers cannot carry a chart', () => {
    const one: Measurement[] = [{ fieldId: 'surface', label: 'Surface type', value: 'Wind slab', unit: null }];
    const d = approvedDispatch();
    const rec = toRepositoryRecord(d, draftPublicSummary(d, one), one, 'admin-uid', 'IIA-2026-0042', 0);
    const readings = rec.sections!.find((x) => x.id === 'readings');
    expect(readings?.figure?.kind).toBe('table');
    expect(readings?.figure?.rows).toEqual([{ label: 'Surface type', value: 'Wind slab' }]);
  });

  it('records the conditions the work was done in', () => {
    const conditions = publish().sections!.find((x) => x.id === 'conditions');
    expect(conditions?.paragraphs[0]).toContain('-24 °C');
    expect(conditions?.paragraphs[0]).toContain('blowing snow');
  });

  it('attributes every section to a source the record lists', () => {
    const rec = publish();
    const ids = new Set(rec.sources!.map((x) => x.id));
    for (const section of rec.sections!) {
      expect(section.sourceId).toBeTruthy();
      expect(ids.has(section.sourceId!)).toBe(true);
    }
  });

  it('gives every section an anchor a contents list can link to', () => {
    const ids = publish().sections!.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  it('carries no internal material into the report body either', () => {
    const serialised = JSON.stringify(publish().sections);
    for (const secret of Object.values(SECRETS)) expect(serialised).not.toContain(secret);
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

  it('falls back to the short description alone when no full report was written', () => {
    const rec = documentToRepositoryRecord(researchDoc, 'admin-uid', 'IIA-2025-0007');
    expect(rec.body).toEqual(['Daily temperature logging from six freshwater lakes.']);
  });

  it('splits a written full report into paragraphs, blank-line separated', () => {
    const withReport: ResearchDocument = {
      ...researchDoc,
      fullText:
        'Six loggers were deployed across the freshwater lakes of the Schirmacher Oasis in January 2024.\n\n' +
        'Readings were taken at fifteen-minute intervals through the following season.\n\n' +
        'The full series is archived alongside site coordinates and calibration records.',
    };
    const rec = documentToRepositoryRecord(withReport, 'admin-uid', 'IIA-2025-0007');
    expect(rec.body).toHaveLength(3);
    expect(rec.body[0]).toMatch(/^Six loggers were deployed/);
    expect(rec.body[2]).toMatch(/calibration records\.$/);
  });

  it('treats a full report of only whitespace the same as none written', () => {
    const rec = documentToRepositoryRecord({ ...researchDoc, fullText: '   \n\n  ' }, 'admin-uid', 'IIA-2025-0007');
    expect(rec.body).toEqual([researchDoc.description]);
  });

  it('leaves videoUrl null and keeps the file row for an ordinary document', () => {
    const rec = documentToRepositoryRecord(researchDoc, 'admin-uid', 'IIA-2025-0007');
    expect(rec.videoUrl).toBeNull();
    expect(rec.table?.some((f) => f.label === 'File')).toBe(true);
  });

  it('cites each published paragraph to its paragraph in the submitted report', () => {
    const withReport: ResearchDocument = {
      ...researchDoc,
      fullText: 'First paragraph of the report.\n\nSecond paragraph of the report.',
    };
    const rec = documentToRepositoryRecord(withReport, 'admin-uid', 'IIA-2025-0007');
    expect(rec.citations).toHaveLength(2);
    expect(rec.citations![0].spans[0]).toMatchObject({
      text: 'First paragraph of the report.',
      sourceId: 'document',
      locator: 'Paragraph 1 of the submitted report',
    });
    expect(rec.citations![1].spans[0].locator).toBe('Paragraph 2 of the submitted report');
  });

  it('links the submitted file as the original, which storage.rules makes public', () => {
    const rec = documentToRepositoryRecord(researchDoc, 'admin-uid', 'IIA-2025-0007');
    expect(rec.sources).toHaveLength(1);
    expect(rec.sources![0]).toMatchObject({
      kind: 'document',
      author: 'Dr M. Iyer',
      url: 'https://example.invalid/lakes.csv',
    });
  });

  it('says so when the published text is only the upload summary', () => {
    const rec = documentToRepositoryRecord(researchDoc, 'admin-uid', 'IIA-2025-0007');
    expect(rec.sources![0].label).toBe('Submission summary');
    expect(rec.citations![0].spans[0].locator).toBe('Summary supplied with the upload');
  });

  it('puts a submitted report in its own section, leaving the abstract alone', () => {
    const withReport: ResearchDocument = {
      ...researchDoc,
      fullText: 'First paragraph of the report.\n\nSecond paragraph of the report.',
    };
    const rec = documentToRepositoryRecord(withReport, 'admin-uid', 'IIA-2025-0007');
    expect(rec.sections).toHaveLength(1);
    expect(rec.sections![0].paragraphs).toHaveLength(2);
    expect(rec.sections![0].sourceId).toBe('document');
  });

  it('publishes no report section when no report was submitted', () => {
    const rec = documentToRepositoryRecord(researchDoc, 'admin-uid', 'IIA-2025-0007');
    expect(rec.sections).toBeUndefined();
    expect(rec.body).toEqual([researchDoc.description]);
  });

  it('populates videoUrl and drops the file row when the upload was a video', () => {
    const videoDoc: ResearchDocument = { ...researchDoc, mediaKind: 'video', fileUrl: 'https://example.invalid/survey.mp4' };
    const rec = documentToRepositoryRecord(videoDoc, 'admin-uid', 'IIA-2025-0007');
    expect(rec.videoUrl).toBe('https://example.invalid/survey.mp4');
    expect(rec.table?.some((f) => f.label === 'File')).toBe(false);
  });
});
