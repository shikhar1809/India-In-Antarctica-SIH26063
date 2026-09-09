import { describe, it, expect } from 'vitest';

import {
  classifyContentType, detectArchiveReference, historicalBestPractice,
  platformGaps, referenceQueries, toUnicodeBold, styleForLinkedIn,
  analyseBrief, generatorDirection,
} from './agent';
import type { RepositoryRecord } from '../repository/contract';

/* A published record, trimmed to the fields the agent actually reads. */
function record(over: Partial<RepositoryRecord> = {}): RepositoryRecord {
  return {
    id: 'rec-1',
    cat: 'dataset',
    kind: 'Dataset',
    title: 'Total Column Ozone at Maitri, 1999–2006',
    station: 'maitri',
    year: '1999–2006',
    pills: [],
    body: ['Seven years of daily total column ozone.'],
    photoUrls: [],
    measurements: [],
    metadata: {
      identifier: 'IIA-1999-9004',
      creators: [{ name: 'IMD', affiliation: 'NCPOR' }],
      publisher: 'NCPOR',
      publicationYear: 2006,
      resourceType: 'Dataset',
      station: 'Maitri',
      spatial: { lat: null, lon: null, elevationM: null, datum: 'WGS84', accuracyM: null },
      temporal: { observedAt: 0 },
      license: 'CC BY 4.0',
      rights: '',
      instrument: null,
      method: null,
      provenance: { sourceType: 'historical', sourceId: 'x', approvedBy: 'a', approvedAt: 0 },
    },
    publishedAt: 0,
    ...over,
  } as RepositoryRecord;
}

describe('working out what kind of post this is', () => {
  it('reads a dataset release out of the wording', () => {
    const c = classifyContentType('We are releasing the full dataset as CSV, 753 rows.');
    expect(c.type.id).toBe('dataset-drop');
    expect(c.evidence.join(' ')).toMatch(/dataset|csv/i);
  });

  it('reads an observance', () => {
    const c = classifyContentType('Wishing everyone a happy World Ozone Day from Maitri.');
    expect(c.type.id).toBe('observance');
  });

  it('reads a follow-up', () => {
    const c = classifyContentType('A follow-up to the post earlier this week about the traverse.');
    expect(c.type.id).toBe('follow-up');
  });

  it('lets the attached record override thin wording', () => {
    // Nothing in this sentence says "dataset"; the record it was built on does.
    const c = classifyContentType('Some numbers from the station.', record());
    expect(c.type.id).toBe('dataset-drop');
    expect(c.evidence.join(' ')).toContain('Dataset');
  });

  it('falls back to a field report, and admits it is guessing', () => {
    const c = classifyContentType('');
    expect(c.type.id).toBe('field-report');
    expect(c.confidence).toBe('low');
  });

  it('reports its confidence rather than always sounding certain', () => {
    const strong = classifyContentType('Dataset release: the full CSV time series is now open data to download.');
    expect(strong.confidence).toBe('high');
  });
});

describe('finding the archive record a brief is about', () => {
  const records = [record()];

  it('matches an identifier written in the brief', () => {
    const hit = detectArchiveReference('Posting about IIA-1999-9004 today.', records);
    expect(hit?.how).toBe('identifier');
    expect(hit?.source.url).toContain('IIA-1999-9004');
  });

  it('matches a title quoted in the brief', () => {
    const hit = detectArchiveReference(
      'Sharing our Total Column Ozone at Maitri, 1999–2006 record.',
      records,
    );
    expect(hit?.how).toBe('title');
  });

  it('does not invent a match from common polar words', () => {
    // "Antarctic", "station", "research" are in the stop list precisely so
    // that every brief does not attach itself to an arbitrary record.
    expect(detectArchiveReference('Antarctic research station update.', records)).toBeNull();
  });

  it('returns nothing when the archive is empty', () => {
    expect(detectArchiveReference('IIA-1999-9004', [])).toBeNull();
  });
});

describe('what the platforms demand', () => {
  it('flags Instagram with no photograph attached', () => {
    expect(platformGaps(['instagram'], false)).toHaveLength(1);
    expect(platformGaps(['instagram'], false)[0]).toMatch(/photograph/);
  });

  it('is satisfied once there is an image', () => {
    expect(platformGaps(['instagram', 'x'], true)).toEqual([]);
  });

  it('does not demand a photograph for X', () => {
    expect(platformGaps(['x'], false)).toEqual([]);
  });
});

describe('LinkedIn unicode styling', () => {
  it('converts to the sans-serif bold block', () => {
    expect(toUnicodeBold('Maitri 2026')).toBe('𝗠𝗮𝗶𝘁𝗿𝗶 𝟮𝟬𝟮𝟲');
  });

  it('leaves punctuation and accents alone', () => {
    expect(toUnicodeBold('Ice — 108 DU')).toContain('—');
  });

  it('bolds only the opening line of a caption', () => {
    const styled = styleForLinkedIn('Headline here\nBody stays readable.');
    expect(styled.startsWith('𝗛')).toBe(true);
    expect(styled).toContain('Body stays readable.');
  });

  it('leaves a single-line caption untouched, since there is no heading', () => {
    expect(styleForLinkedIn('One line only')).toBe('One line only');
  });
});

describe('learning from posts already sent', () => {
  it('is honest about having no evidence', () => {
    const bp = historicalBestPractice([record()]);
    expect(bp.sampleSize).toBe(0);
    expect(bp.notes[0]).toMatch(/no post has been confirmed sent/i);
  });

  it('measures caption length and hashtags from real posts', () => {
    const withPosts = record({
      socialPosts: [
        { platform: 'x', url: 'https://x.com/1', postedAt: 2, caption: 'Ice at Maitri #Antarctica #NCPOR' },
        { platform: 'x', url: 'https://x.com/2', postedAt: 1, caption: 'Ozone at Maitri #Antarctica' },
      ],
    } as Partial<RepositoryRecord>);

    const bp = historicalBestPractice([withPosts]);
    expect(bp.sampleSize).toBe(2);
    expect(bp.captionLength.x).toBeGreaterThan(0);
    expect(bp.hashtags[0].tag).toBe('#antarctica');
    expect(bp.hashtags[0].uses).toBe(2);
  });
});

describe('the reference queries it will run', () => {
  it('asks about the station rather than pasting the field note', () => {
    const c = classifyContentType('measured ice thickness');
    const qs = referenceQueries(c, 'Maitri', 'measured ice thickness at twelve stakes');
    expect(qs.length).toBeLessThanOrEqual(3);
    expect(qs[0]).toContain('Maitri');
  });

  it('changes the queries with the content type', () => {
    const dataset = referenceQueries(classifyContentType('open data csv release'), 'Maitri', 'x');
    const expedition = referenceQueries(classifyContentType('the voyage south by icebreaker'), 'Maitri', 'x');
    expect(dataset).not.toEqual(expedition);
  });
});

describe('the analysis handed to the generator', () => {
  const base = {
    brief: { topic: 'Releasing the full ozone dataset as CSV.', audience: 'public' as const, tone: 'plain' as const },
    platforms: ['instagram' as const, 'x' as const],
    hasImage: false,
    station: 'Maitri',
    archiveRecords: [record()],
  };

  it('infers audience and tone when the publisher chose neither', () => {
    const a = analyseBrief(base);
    expect(a.audienceChosen).toBe(false);
    // A dataset release is written for researchers, not the general public.
    expect(a.audience).toBe('researchers');
  });

  it('never overrides a deliberate choice', () => {
    const a = analyseBrief({ ...base, audienceChosen: true, toneChosen: true });
    expect(a.audience).toBe('public');
    expect(a.tone).toBe('plain');
  });

  it('carries the platform gap through to the direction', () => {
    const a = analyseBrief(base);
    expect(a.gaps.join(' ')).toMatch(/Instagram/);
    expect(generatorDirection(a)).toMatch(/CONTENT TYPE/);
    expect(generatorDirection(a)).toMatch(/PLATFORM CONSTRAINTS/);
  });

  it('tells the model about the record it found', () => {
    const a = analyseBrief({ ...base, brief: { ...base.brief, topic: 'About IIA-1999-9004 today.' } });
    expect(a.archive).not.toBeNull();
    expect(generatorDirection(a)).toMatch(/SOURCE RECORD/);
  });
});
