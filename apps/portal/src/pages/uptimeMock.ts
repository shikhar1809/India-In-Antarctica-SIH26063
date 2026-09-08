/**
 * Mocked daily uptime, in the shape a real monitor (UptimeRobot, Better
 * Uptime, a Cloud Functions cron hitting /api/records every few minutes)
 * would actually produce — one row per day, an uptime percentage and, on a
 * bad day, an incident count and total downtime.
 *
 * Deliberately deterministic, not Math.random() on every render: seeded off
 * the date string itself, so today's cell reads the same on a reload five
 * minutes from now instead of visibly reshuffling — which would be the one
 * thing that gives away "this isn't real" faster than the on-page label
 * already does. There is no live monitor wired up yet; UptimePage.tsx says
 * so plainly rather than letting a convincingly real-looking chart imply
 * otherwise.
 */

export interface DayUptime {
  date: string; // YYYY-MM-DD
  /** null for a day with no data at all (before the mock's own start, or a
   *  future day) — distinct from 100, which is a day that was actually
   *  checked and found fully up. */
  uptimePct: number | null;
  incidents: number;
  downtimeMinutes: number;
}

/** Small, fast, seeded PRNG (mulberry32) — good enough for "looks like real
 *  variance," not for anything security-sensitive. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFor(dateStr: string): number {
  let h = 0;
  for (let i = 0; i < dateStr.length; i++) h = (Math.imul(h, 31) + dateStr.charCodeAt(i)) | 0;
  return h;
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** One year of daily rows, oldest first, ending today. A real status page's
 *  history is almost entirely "fully up" with the occasional real incident
 *  — outages are rare here for the same reason, not because the generator
 *  is shy about them. */
export function mockUptimeHistory(days = 371): DayUptime[] {
  const out: DayUptime[] = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const dateStr = toDateStr(d);
    const rand = mulberry32(seedFor(dateStr));
    const roll = rand();

    let uptimePct: number;
    let incidents = 0;
    let downtimeMinutes = 0;

    if (roll < 0.02) {
      // A real incident day — roughly 1 in 50.
      incidents = roll < 0.004 ? 2 : 1;
      downtimeMinutes = Math.round(5 + rand() * 90 * incidents);
      uptimePct = Math.max(80, 100 - (downtimeMinutes / 14.4));
    } else if (roll < 0.06) {
      // A brief blip nobody would call an "incident" — a deploy, a cold
      // start — but it shows as slightly-less-than-perfect on the chart.
      downtimeMinutes = Math.round(1 + rand() * 4);
      uptimePct = 100 - downtimeMinutes / 14.4;
    } else {
      uptimePct = 100;
    }

    out.push({ date: dateStr, uptimePct: Math.round(uptimePct * 100) / 100, incidents, downtimeMinutes });
  }
  return out;
}

export interface UptimeSummary {
  averagePct: number;
  totalIncidents: number;
  totalDowntimeMinutes: number;
  daysTracked: number;
}

export function summarise(history: DayUptime[]): UptimeSummary {
  const tracked = history.filter((d) => d.uptimePct !== null);
  const averagePct = tracked.length
    ? tracked.reduce((sum, d) => sum + (d.uptimePct ?? 0), 0) / tracked.length
    : 100;
  return {
    averagePct: Math.round(averagePct * 1000) / 1000,
    totalIncidents: tracked.reduce((sum, d) => sum + d.incidents, 0),
    totalDowntimeMinutes: tracked.reduce((sum, d) => sum + d.downtimeMinutes, 0),
    daysTracked: tracked.length,
  };
}

/** Which of the calendar's colour tiers a day belongs in. Outage is its own
 *  tier (red), not just "the lightest green" — an incident is a different
 *  *kind* of fact from "slightly quieter day," and the two should never be
 *  visually confusable at a glance, which a single green ramp would risk. */
export type UptimeTier = 'none' | 'outage' | 'degraded' | 'good' | 'great' | 'perfect';

export function tierOf(day: DayUptime): UptimeTier {
  if (day.uptimePct === null) return 'none';
  if (day.incidents > 0) return 'outage';
  if (day.uptimePct >= 100) return 'perfect';
  if (day.uptimePct >= 99.9) return 'great';
  if (day.uptimePct >= 99) return 'good';
  return 'degraded';
}
