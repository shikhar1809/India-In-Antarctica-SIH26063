/**
 * Site — Uptime & outages.
 *
 * Mocked, and says so on the page rather than only in a code comment: there
 * is no real monitor wired up yet (no UptimeRobot/Better Uptime account, no
 * Cloud Functions cron pinging the site on a schedule), so every number
 * here is generated, not measured. The generator (uptimeMock.ts) is seeded
 * per-day rather than random-per-render, so it doesn't visibly reshuffle on
 * a reload — the honesty is in the label at the top, not in the data
 * looking deliberately fake.
 *
 * Swapping in a real feed later means replacing mockUptimeHistory()'s call
 * site with a fetch from wherever monitoring actually lives — everything
 * downstream (the calendar, the summary tiles, the tier colours) already
 * expects exactly this shape (DayUptime[]) and doesn't change.
 */

import { useMemo } from 'react';
import { Activity, AlertTriangle, Clock, TrendingUp } from 'lucide-react';
import { UptimeCalendar } from './UptimeCalendar';
import { mockUptimeHistory, summarise } from './uptimeMock';
import './UptimePage.css';

function StatTile({
  icon, label, value, hint,
}: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="up-tile">
      <div className="up-tile-icon">{icon}</div>
      <div>
        <div className="up-tile-value">{value}</div>
        <div className="up-tile-label">{label}</div>
        {hint && <div className="up-tile-hint">{hint}</div>}
      </div>
    </div>
  );
}

export function UptimePage() {
  // Computed once per mount, not per render — the generator is pure and
  // deterministic, but there is no reason to re-walk 371 days of PRNG on
  // every state change elsewhere on the page.
  const history = useMemo(() => mockUptimeHistory(371), []);
  const summary = useMemo(() => summarise(history), [history]);

  return (
    <main className="ph-page up-page">
      <header className="up-head">
        <h1>Uptime &amp; outages</h1>
        <p>The public site's availability over the last year.</p>
      </header>

      <div className="up-mock-banner">
        <AlertTriangle size={14} strokeWidth={2.25} />
        Mock data — no uptime monitor is connected yet. This is what the
        page will show once one is.
      </div>

      <div className="up-tiles">
        <StatTile
          icon={<TrendingUp size={18} />}
          label="Average uptime"
          value={`${summary.averagePct.toFixed(2)}%`}
          hint={`over ${summary.daysTracked} days`}
        />
        <StatTile
          icon={<AlertTriangle size={18} />}
          label="Incidents"
          value={String(summary.totalIncidents)}
          hint="in the last year"
        />
        <StatTile
          icon={<Clock size={18} />}
          label="Total downtime"
          value={
            summary.totalDowntimeMinutes >= 60
              ? `${(summary.totalDowntimeMinutes / 60).toFixed(1)}h`
              : `${summary.totalDowntimeMinutes}m`
          }
          hint="across all incidents"
        />
        <StatTile
          icon={<Activity size={18} />}
          label="Status"
          value={summary.totalIncidents === 0 ? 'All clear' : 'Operational'}
          hint="as of today"
        />
      </div>

      <div className="up-calendar-card">
        <UptimeCalendar history={history} />
      </div>
    </main>
  );
}
