import { describe, it, expect } from 'vitest';
import {
  basicsDirection, cleanLinks, contentTypeForGoal, hashtagPlan, inferVoice, pickPhoto, photoCredit, recommendSlot,
  resolutionNote, resolutionOf, usableLicence,
} from './basics';
import { HASHTAG_BY_ACTIVITY, HASHTAG_BY_STATION } from '../types';

const NOW = Date.UTC(2026, 8, 10, 9, 0); // Thu 10 Sep 2026
const DAY = 86_400_000;

describe('contentTypeForGoal', () => {
  it('keeps the inferred type when the purpose allows it', () => {
    expect(contentTypeForGoal('inform', [{ type: 'dataset-drop', score: 4 }, { type: 'field-report', score: 2 }])).toBe('dataset-drop');
  });
  it('overrides a guess the purpose rules out', () => {
    expect(contentTypeForGoal('explain', [{ type: 'field-report', score: 5 }])).toBe('explainer');
  });
});

describe('inferVoice', () => {
  it('writes for students when the purpose is to explain and followers are young', () => {
    const v = inferVoice({ typeDefault: { audience: 'public', tone: 'plain' }, goal: 'explain', platforms: ['instagram'], followerAge: '18-24' });
    expect(v.audience).toBe('students');
    expect(v.tone).toBe('warm');
    expect(v.reasons.length).toBeGreaterThan(2);
  });
  it('goes formal for an announcement on LinkedIn only', () => {
    const v = inferVoice({ typeDefault: { audience: 'public', tone: 'plain' }, goal: 'announce', platforms: ['linkedin'] });
    expect(v.tone).toBe('formal');
  });
});

describe('hashtagPlan', () => {
  it('leads with the occasion and subject, and respects each platform budget', () => {
    const plan = hashtagPlan({
      platforms: ['instagram', 'x', 'linkedin'], station: 'Maitri', activity: 'Atmospheric / meteorology',
      terms: ['Ozone layer', 'Maitri station'], hook: 'International Day for the Preservation of the Ozone Layer',
      stationTags: HASHTAG_BY_STATION, activityTags: HASHTAG_BY_ACTIVITY,
    });
    expect(plan.x).toEqual(['#WorldOzoneDay', '#OzoneLayer']);
    expect(plan.linkedin).toHaveLength(3);
    expect(plan.instagram.length).toBeLessThanOrEqual(8);
    expect(new Set(plan.instagram.map((t) => t.toLowerCase())).size).toBe(plan.instagram.length);
  });
});

describe('recommendSlot', () => {
  it('posts on the observance day itself, 10:00 IST', () => {
    const hookDay = Date.UTC(2026, 8, 16);
    const s = recommendSlot({ now: NOW, hook: { name: 'World Ozone Day', date: hookDay, daysAway: 6, relevant: true } });
    expect(s.at).toBe(hookDay + (4 * 60 + 30) * 60_000);
  });
  it('otherwise uses the best weekday from reach history', () => {
    const s = recommendSlot({ now: NOW, bestDay: 'Sunday' });
    expect(new Date(s.at).getUTCDay()).toBe(0);
    expect(s.at - NOW).toBeLessThan(8 * DAY);
  });
});

describe('basicsDirection', () => {
  it('turns preliminary data into a hard instruction against overclaiming', () => {
    expect(basicsDirection({ dataStatus: 'preliminary' }, {})).toMatch(/PRELIMINARY[\s\S]*never use words like "confirms"/);
  });
  it('asks for a call to action without letting the model write a URL', () => {
    expect(basicsDirection({ cta: 'record' }, {})).toMatch(/Do not write a URL/);
  });
  it('says nothing about questions left to the agent', () => {
    expect(basicsDirection({}, {})).toBe('');
  });
});

describe('links', () => {
  it('keeps real addresses once and drops empty boxes', () => {
    expect(cleanLinks(['', ' https://a.org/x ', 'not a link', 'https://a.org/x', 'ftp://b.org'])).toEqual(['https://a.org/x']);
    expect(cleanLinks(['ncpor.res.in/ozone'])).toEqual(['https://ncpor.res.in/ozone']);
  });
  it('tells the writer to leave room and write no URL', () => {
    expect(basicsDirection({ links: ['https://a.org'] }, {})).toMatch(/Write no URL/);
  });
});

describe('images', () => {
  it('grades resolution by the short side', () => {
    expect(resolutionOf(1080, 1350)).toBe('ok');
    expect(resolutionOf(1280, 720)).toBe('low');
    expect(resolutionOf(640, 480)).toBe('poor');
    expect(resolutionNote(1280, 720)).toMatch(/1080 px/);
    expect(resolutionNote(2000, 2000)).toBeNull();
  });

  it('accepts only licences an official account can overlay text on', () => {
    expect(usableLicence('CC0 1.0')).toBe('free');
    expect(usableLicence('Public domain (NASA)')).toBe('free');
    expect(usableLicence('BY 2.0')).toBe('credit');
    expect(usableLicence('CC BY-SA 4.0')).toBe('credit');
    expect(usableLicence('BY-NC 2.0')).toBeNull();
    expect(usableLicence('BY-ND 4.0')).toBeNull();
    expect(usableLicence('Unknown — check the source before reuse')).toBeNull();
  });

  it('picks the largest usable photograph', () => {
    const r = (title: string, license: string, width: number | null, height: number | null) =>
      ({ title, license, width, height, attribution: 'A. Person', provider: 'wikimedia' });
    const picked = pickPhoto([
      r('nc', 'BY-NC 2.0', 4000, 3000),
      r('small', 'CC0 1.0', 800, 600),
      r('big', 'CC BY-SA 4.0', 3000, 2000),
      r('unsized', 'CC0 1.0', null, null),
    ]);
    expect(picked?.photo.title).toBe('big');
    expect(pickPhoto([r('tiny', 'CC0 1.0', 300, 200)])).toBeNull();
    // Relevance first: a sharp telescope picture is not a photo of Maitri.
    const onTopic = pickPhoto([r('JWST mirror', 'CC0 1.0', 4000, 4000), r('Maitri station in winter', 'BY 2.0', 1600, 1200)], ['ozone', 'maitri']);
    expect(onTopic?.photo.title).toBe('Maitri station in winter');
  });

  it('writes a credit line', () => {
    expect(photoCredit({ attribution: 'A. Person', license: 'CC BY-SA 4.0', provider: 'wikimedia' }))
      .toBe('Photo: A. Person (CC BY-SA 4.0, via Wikimedia Commons)');
  });
});
