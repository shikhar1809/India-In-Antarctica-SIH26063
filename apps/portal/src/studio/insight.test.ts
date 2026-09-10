import { describe, it, expect } from 'vitest';
import {
  researchTerms, upcomingObservances, summariseReach, summarisePerformance, researchDirection,
} from './insight';
import type { AccountStats } from '../social/engagementClient';
import type { ScheduledPost } from '../social/queue';

const NOW = Date.UTC(2026, 8, 10, 9, 0); // 10 Sep 2026
const DAY = 86_400_000;

describe('researchTerms', () => {
  it('finds the science first, then the station, and keeps Antarctica as a baseline', () => {
    expect(researchTerms('Surface ozone at Maitri dropped in August', 'Maitri')).toEqual(['Ozone layer', 'Maitri station', 'Antarctica']);
  });

  it('does not add Antarctica when a subject already carries it', () => {
    expect(researchTerms('Sea ice extent off Bharati')).toEqual(['Antarctic sea ice', 'Bharati station']);
  });
});

describe('upcomingObservances', () => {
  it('surfaces World Ozone Day six days out for an ozone post, marked relevant', () => {
    const o = upcomingObservances('surface ozone record', NOW);
    expect(o[0]).toMatchObject({ name: expect.stringContaining('Ozone Layer'), daysAway: 6, relevant: true });
  });

  it('never offers an unrelated observance as relevant', () => {
    expect(upcomingObservances('krill survey', NOW).filter((x) => x.relevant)).toEqual([]);
  });

  it('rolls a date that has passed this year over to next year', () => {
    const jan = upcomingObservances('first expedition station', Date.UTC(2026, 11, 20));
    expect(jan.find((x) => x.name.includes('first landing'))?.daysAway).toBe(20);
  });
});

describe('summariseReach', () => {
  // 30 days ending yesterday, Sundays at 300 and every other day at 100.
  const series = Array.from({ length: 30 }, (_, i) => {
    const date = new Date(NOW - (30 - i) * DAY).toISOString().slice(0, 10);
    return { date, value: new Date(`${date}T00:00:00Z`).getUTCDay() === 0 ? 300 : 100 };
  });
  const ig: AccountStats = {
    platform: 'instagram', handle: 'acct', available: true, followers: 500, primaryLabel: 'Unique Reach', series,
    demographics: { age: [{ label: '18-24', value: 60 }, { label: '25-34', value: 40 }], gender: null, country: [{ label: 'IN', value: 90 }, { label: 'NP', value: 10 }], city: [{ label: 'Pune, Maharashtra', value: 5 }] },
  };

  it('finds the best weekday from the account’s own series, with its sample size', () => {
    const r = summariseReach([ig], ['instagram'], NOW);
    expect(r.platforms[0].bestDay).toMatchObject({ day: 'Sunday', samples: 4 });
    expect(r.platforms[0].bestDay!.liftPct).toBeGreaterThan(100);
    expect(r.audience).toEqual({ topAge: { band: '18-24', share: 60 }, topCountry: { code: 'IN', share: 90 }, topCity: 'Pune' });
  });

  it('says so for a selected platform with no analytics, rather than borrowing another’s', () => {
    const r = summariseReach([ig], ['instagram', 'linkedin'], NOW);
    expect(r.platforms.map((p) => p.platform)).toEqual(['instagram']);
    expect(r.notes[0]).toContain('linkedin');
  });

  it('calls no best day for an account with no reach at all', () => {
    const flat = { ...ig, series: series.map((p) => ({ ...p, value: 0 })) };
    expect(summariseReach([flat], ['instagram'], NOW).platforms[0].bestDay).toBeNull();
  });
});

describe('summarisePerformance', () => {
  const post = (id: string, likes: number, views: number, caption: string): ScheduledPost => ({
    id, recordId: 'r', recordIdentifier: `IIA-${id}`, platform: 'instagram', caption, imageUrl: null,
    scheduledFor: 0, status: 'posted', createdBy: 'u', createdAt: 0, postedAt: 1, externalUrl: 'https://x.test',
    postedVia: 'instagram', error: null,
    engagement: { likes, comments: 0, shares: 0, views, fetchedAt: 1 },
  });

  it('ranks by real engagement and takes hashtags from the stronger posts only', () => {
    const r = summarisePerformance([post('1', 90, 1000, 'Ozone #ncpor #ozone'), post('2', 10, 1000, 'Ice #boring')]);
    expect(r.best?.record).toBe('IIA-1');
    expect(r.winningHashtags).toEqual(['#ncpor', '#ozone']);
    expect(r.byPlatform[0]).toMatchObject({ platform: 'instagram', posts: 2, avgEngagement: 50, avgRatePct: 5 });
  });

  it('reports nothing to learn from rather than inventing a pattern', () => {
    const r = summarisePerformance([]);
    expect(r.best).toBeNull();
    expect(r.notes[0]).toContain('Nothing has been sent');
  });
});

describe('researchDirection — the fences on how research may be used', () => {
  it('marks headlines as context, never facts, and pins papers to their DOI', () => {
    const d = researchDirection({
      trends: {
        interest: null, answered: [], failed: [], observances: [],
        news: { query: 'q', total: 1, lastWeek: 1, items: [{ title: 'Ozone is healing', source: 'Example', url: 'u', publishedAt: 1 }] },
      },
      sources: {
        answered: [], failed: [], background: null,
        papers: [{ title: 'A review', year: 1999, doi: 'https://doi.org/10.1/x', citedBy: 5, venue: 'J', firstAuthor: 'S. Solomon', authors: 1 }],
      },
    });
    expect(d).toMatch(/do NOT repeat claims from headlines as facts/);
    expect(d).toMatch(/use the DOI link exactly as given/);
    expect(d).toContain('https://doi.org/10.1/x');
  });

  it('only includes an observance hook when one is passed in — i.e. the publisher agreed', () => {
    const base = { interest: null, news: null, answered: [], failed: [] };
    expect(researchDirection({ trends: { ...base, observances: [] } })).not.toMatch(/TIMELY HOOK/);
    expect(researchDirection({ trends: { ...base, observances: [{ name: 'World Ozone Day', date: 0, daysAway: 6, relevant: true }] } })).toMatch(/TIMELY HOOK: World Ozone Day is in 6 days/);
  });
});

describe('describeInterest', () => {
  it('refuses to call a trend on a page almost nobody reads', async () => {
    const { describeInterest, isRising } = await import('./insight');
    const tiny = { term: 'Maitri station', title: 'Maitri Station', url: '', series: [], recentAvg: 4, priorAvg: 2, changePct: 100 };
    expect(isRising(tiny)).toBe(false);
    expect(describeInterest(tiny)).toMatch(/too few to call/);
  });
});

describe('onTopicPapers', () => {
  it('rejects a paper from the same station on a different subject', async () => {
    const { onTopicPapers, researchTerms } = await import('./insight');
    const terms = researchTerms('Twelve stakes measured across the Schirmacher shelf', 'Maitri', null, 'Ice / glaciology survey');
    expect(terms).toContain('Antarctic ice sheet');
    const r = onTopicPapers([
      { title: 'Probing the nature of extraterrestrial dust collected from the Maitri station' },
      { title: 'Ice sheet mass balance in Dronning Maud Land' },
    ], terms);
    expect(r.onTopic.map((p) => p.title)).toEqual(['Ice sheet mass balance in Dronning Maud Land']);
    expect(r.rejected).toHaveLength(1);
  });

  it('offers nothing when the post has no subject beyond a place', async () => {
    const { onTopicPapers } = await import('./insight');
    expect(onTopicPapers([{ title: 'Atmospheric electricity at Maitri' }], ['Maitri station', 'Antarctica']).onTopic).toEqual([]);
  });
});
