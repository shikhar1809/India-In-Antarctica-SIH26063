import { describe, expect, it } from 'vitest';
import { checkAlignment, corrections, keyStems, slotByDeadline, summarise, type AlignInput } from './alignment';
import type { PostRequest } from '../types';

const URL = 'https://iia-public.web.app/archive/IIA-1999-9004';

const draft = (angle: string, caption: string) => ({
  angle,
  copy: { headline: 'Ozone over Maitri', standfirst: 'Seven years of readings.', captions: { x: caption, linkedin: caption, instagram: caption } },
});

const request: PostRequest = {
  kind: 'post-request', goal: 'Announce', platforms: ['instagram', 'x', 'linkedin'], audience: 'students', tone: 'warm',
  deadline: Date.UTC(2026, 8, 15, 18, 29), recordId: 'r1', recordIdentifier: 'IIA-1999-9004', recordTitle: 'Total Column Ozone',
  instructions: 'Keep it hopeful — the ozone layer is recovering.', requestedBy: 'a', requestedByName: 'Admin',
};

const base = (over: Partial<AlignInput> = {}): AlignInput => ({
  drafts: [
    draft('A', `NCPOR shares seven years of ozone data from Maitri. The layer is recovering. #WorldOzoneDay #NCPOR\nRead the full record ${URL}`),
    draft('B', `A hopeful sign on World Ozone Day, from NCPOR at Maitri. #WorldOzoneDay #NCPOR\nRead the full record ${URL}`),
  ],
  platforms: ['instagram', 'x', 'linkedin'],
  request,
  basics: { goal: 'announce', cta: 'record', credit: 'institution', language: 'en' },
  audience: 'students', tone: 'warm',
  hook: 'International Day for the Preservation of the Ozone Layer',
  hashtags: { instagram: ['#WorldOzoneDay', '#NCPOR'], x: ['#WorldOzoneDay', '#NCPOR'], linkedin: ['#NCPOR'] },
  slot: { at: Date.UTC(2026, 8, 15, 4, 30), label: 'Tue, 15 Sep, 10:00 am' },
  linked: 'IIA-1999-9004',
  observerName: 'Asha Rao',
  ...over,
});

const byId = (input: AlignInput) => Object.fromEntries(checkAlignment(input).map((c) => [c.id, c]));

describe('checkAlignment', () => {
  it('passes drafts that meet every requirement', () => {
    const c = byId(base());
    for (const id of ['goal', 'platforms', 'audience', 'tone', 'record', 'deadline', 'cta', 'credit', 'language', 'occasion', 'limits', 'hashtags']) {
      expect(c[id]?.status, id).toBe('met');
    }
    expect(c.notes.status).toBe('review');
  });

  it('never counts the admin notes as met — a person judges them', () => {
    expect(byId(base()).notes.detail).toMatch(/key words appear/);
  });

  it('catches a posting time after the deadline', () => {
    const c = byId(base({ slot: { at: Date.UTC(2026, 8, 16, 4, 30), label: 'Wed, 16 Sep' } }));
    expect(c.deadline.status).toBe('missed');
  });

  it('catches a dropped platform and says why', () => {
    const c = byId(base({ platforms: ['x', 'linkedin'], dropped: [{ platform: 'instagram', why: 'no photograph' }] }));
    expect(c.platforms.status).toBe('partial');
    expect(c.platforms.detail).toMatch(/no photograph/);
  });

  it('catches an audience the publisher changed', () => {
    expect(byId(base({ audience: 'press' })).audience.status).toBe('missed');
  });

  it('catches a missing record link', () => {
    expect(byId(base({ linked: null })).record.status).toBe('missed');
  });

  it('flags overclaiming on preliminary data', () => {
    const c = byId(base({
      basics: { dataStatus: 'preliminary' },
      drafts: [draft('A', 'Preliminary readings from Maitri.'), draft('B', 'This confirms the ozone layer is healing.')],
    }));
    expect(c.data.status).toBe('partial');
  });

  it('flags an observer named when names were withheld', () => {
    const c = byId(base({ basics: { credit: 'anonymous' }, drafts: [draft('A', 'Asha Rao measured it at Maitri.')] }));
    expect(c.credit.status).toBe('missed');
  });

  it('checks Hindi when Hindi was asked for', () => {
    expect(byId(base({ basics: { language: 'hi' } })).language.status).toBe('missed');
    expect(byId(base({ basics: { language: 'hi' }, drafts: [draft('A', 'मैत्री से ओज़ोन के आँकड़े')] })).language.status).toBe('met');
  });

  it('catches captions over the platform limit', () => {
    expect(byId(base({ drafts: [draft('A', 'x'.repeat(300))] })).limits.status).toBe('missed');
  });

  it('turns rewritable misses into corrections, and leaves choices alone', () => {
    const checks = checkAlignment(base({ audience: 'press', drafts: [draft('A', 'x'.repeat(300))] }));
    const fixes = corrections(checks);
    expect(fixes.some((f) => f.startsWith('Within each platform'))).toBe(true);
    expect(fixes.some((f) => f.startsWith('Audience'))).toBe(false);
  });

  it('finds the call to action above the photo credit and hashtags', () => {
    const c = byId(base({
      drafts: [draft('A', `Seven years of ozone data.
Read the full record ${URL}
#WorldOzoneDay #NCPOR
Photo: A. Person (CC BY 2.0)`)],
    }));
    expect(c.cta.status).toBe('met');
  });

  it('checks the credit for a borrowed photograph', () => {
    const credit = 'Photo: A. Person (CC BY 2.0, via Openverse)';
    expect(byId(base({ photoCredit: credit, drafts: [draft('A', `Ozone.
${credit}`)] }))['photo-credit'].status).toBe('met');
    expect(byId(base({ photoCredit: credit, drafts: [draft('A', 'Ozone.')] }))['photo-credit'].status).toBe('missed');
  });

  it('checks the publisher’s links reached every caption', () => {
    const link = 'https://ncpor.res.in/ozone';
    // X and LinkedIn carry the address; Instagram carries "Link in bio".
    const both = { angle: 'A', copy: { headline: 'h', standfirst: 's', captions: { x: `Ozone.\n${link}`, linkedin: `Ozone.\n${link}`, instagram: 'Ozone.\nLink in bio.' } } };
    expect(byId(base({ basics: { links: [link, ''] }, drafts: [both] })).links.status).toBe('met');
    expect(byId(base({ basics: { links: [link] }, drafts: [draft('A', 'Ozone.')] })).links.status).toBe('missed');
  });

  it('does not hold the drafts to an audience or tone the admin left to the agent', () => {
    const c = byId(base({ audience: 'press', request: { ...request, basics: { audienceChosen: false, toneChosen: true } } }));
    expect(c.audience).toBeUndefined();
    expect(c.tone.status).toBe('met');
  });

  it('works without an admin request', () => {
    const c = byId(base({ request: null }));
    expect(c.goal).toBeUndefined();
    expect(c.cta.status).toBe('met');
    expect(summarise(checkAlignment(base({ request: null }))).missed).toBe(0);
  });
});

describe('helpers', () => {
  it('stems key words', () => {
    expect(keyStems('Keep it hopeful — the ozone layer is recovering.')).toEqual(['hopef', 'ozone', 'layer', 'recov']);
  });

  it('puts the deadline slot at 10:00 IST on the deadline day', () => {
    const s = slotByDeadline(Date.UTC(2026, 8, 15, 18, 29), Date.UTC(2026, 8, 11));
    expect(new Date(s.at).toISOString()).toBe('2026-09-15T04:30:00.000Z');
  });
});
