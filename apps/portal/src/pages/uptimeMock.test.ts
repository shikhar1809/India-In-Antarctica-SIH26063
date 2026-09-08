import { describe, it, expect } from 'vitest';
import { mockUptimeHistory, summarise, tierOf, type DayUptime } from './uptimeMock';

describe('mockUptimeHistory', () => {
  it('returns the requested number of days, oldest first, ending today', () => {
    const h = mockUptimeHistory(30);
    expect(h).toHaveLength(30);
    expect(h[29].date).toBe(new Date().toISOString().slice(0, 10));
    // Strictly increasing dates — no gaps, no repeats, no reordering.
    for (let i = 1; i < h.length; i++) expect(h[i].date > h[i - 1].date).toBe(true);
  });

  it('is deterministic — the same day always produces the same row', () => {
    const a = mockUptimeHistory(60);
    const b = mockUptimeHistory(60);
    expect(a).toEqual(b);
  });

  it('every row has a valid, self-consistent shape', () => {
    for (const day of mockUptimeHistory(200)) {
      expect(day.uptimePct).not.toBeNull();
      expect(day.uptimePct!).toBeGreaterThanOrEqual(0);
      expect(day.uptimePct!).toBeLessThanOrEqual(100);
      expect(day.incidents).toBeGreaterThanOrEqual(0);
      expect(day.downtimeMinutes).toBeGreaterThanOrEqual(0);
      // An incident always costs some real downtime — the two never
      // disagree about whether anything happened that day.
      if (day.incidents > 0) expect(day.downtimeMinutes).toBeGreaterThan(0);
    }
  });

  it('is mostly good days, with outages the rare exception, not the rule', () => {
    const h = mockUptimeHistory(371);
    const outageDays = h.filter((d) => d.incidents > 0).length;
    // A real status page's history is almost entirely green — assert the
    // mock reads that way too, not as a coin flip between up and down.
    expect(outageDays).toBeLessThan(h.length * 0.15);
    expect(outageDays).toBeGreaterThan(0); // but not literally never
  });
});

describe('summarise', () => {
  it('averages only tracked days, ignoring nulls', () => {
    const history: DayUptime[] = [
      { date: '2026-01-01', uptimePct: 100, incidents: 0, downtimeMinutes: 0 },
      { date: '2026-01-02', uptimePct: 50, incidents: 1, downtimeMinutes: 720 },
      { date: '2026-01-03', uptimePct: null, incidents: 0, downtimeMinutes: 0 },
    ];
    const s = summarise(history);
    expect(s.averagePct).toBe(75);
    expect(s.daysTracked).toBe(2);
    expect(s.totalIncidents).toBe(1);
    expect(s.totalDowntimeMinutes).toBe(720);
  });

  it('reports perfect uptime for an empty or fully-untracked history rather than NaN', () => {
    expect(summarise([]).averagePct).toBe(100);
    expect(summarise([{ date: '2026-01-01', uptimePct: null, incidents: 0, downtimeMinutes: 0 }]).averagePct).toBe(100);
  });
});

describe('tierOf', () => {
  const base: DayUptime = { date: '2026-01-01', uptimePct: 100, incidents: 0, downtimeMinutes: 0 };

  it('is "none" for an untracked day', () => {
    expect(tierOf({ ...base, uptimePct: null })).toBe('none');
  });

  it('is "outage" whenever an incident happened, regardless of the resulting percentage', () => {
    // Even a technically-high percentage with a real incident logged is an
    // outage day, not a "great" one — the incident count is what actually
    // happened; the percentage is a derived summary of it.
    expect(tierOf({ ...base, uptimePct: 99.95, incidents: 1, downtimeMinutes: 10 })).toBe('outage');
  });

  it('grades incident-free days by percentage', () => {
    expect(tierOf({ ...base, uptimePct: 100 })).toBe('perfect');
    expect(tierOf({ ...base, uptimePct: 99.95 })).toBe('great');
    expect(tierOf({ ...base, uptimePct: 99.5 })).toBe('good');
    expect(tierOf({ ...base, uptimePct: 90 })).toBe('degraded');
  });
});
