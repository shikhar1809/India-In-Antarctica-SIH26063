/**
 * What a government outreach programme actually needs to track.
 *
 * This used to be four tiles, a pipeline diagram and two bar charts — a
 * reasonable "is the archive growing" view, but not what an accountability
 * review asks. A government body funding a public outreach portal is not
 * primarily asking "how many records exist" — it is asking four different
 * questions, and this page is organised around them rather than around what
 * happened to be easy to compute:
 *
 *   1. Service delivery — is content moving, or is it stuck? How long does
 *      the public wait between an observation and it being published?
 *   2. Governance & safety — is the safety gate actually gating anything, or
 *      is canPublishDispatch() a rule nobody has ever tripped? How much
 *      quality-control rework is happening?
 *   3. Reach — is what gets published actually reaching people, on which
 *      channels, and how often does dissemination fail?
 *   4. Coverage & currency — which stations and categories are represented,
 *      and is any part of the archive going stale?
 *
 * Every number here is computed from data the portal already holds — no new
 * collection, no new write path, nothing tracked that wasn't already being
 * recorded for an operational reason. A metric that needs its own
 * instrumentation is a metric nobody trusts six months later, once the
 * person who wired it up has moved on.
 *
 * ── On colour ────────────────────────────────────────────────────────────
 * The bar charts use one hue, not five. Category and station are named on the
 * axis, so colouring each bar separately would encode identity twice and buy
 * nothing — while forcing a five-hue categorical palette that cannot clear
 * deutan separation once it contains both a green and a red. Colour is used
 * only where state IS the data (status badges, the pipeline board), and there
 * it always ships with a label, never alone. #2f9fc9 and #c8762a are the two
 * marks already validated against this project's dark panels in
 * public-site/components/RecordChart.
 *
 * Every chart is also rendered as a table below it, so the page works for a
 * screen reader and in print — which matters more here than on most
 * dashboards, since "what did we report to the Ministry" is a realistic use
 * of this exact page.
 */

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  Archive, CalendarClock, CheckCircle2, ChevronDown, ChevronUp, Eye, EyeOff,
  LayoutGrid, Radio, RotateCcw, Send, ShieldAlert, TimerReset,
} from 'lucide-react';
import { CircuitBoard } from '@/components/ui/circuit-board';
import { useAuth } from '../context/AuthContext';
import { useRole } from '../hooks/useRole';
import { usePublicArchive } from '../hooks/usePublicArchive';
import { useDispatches } from '../hooks/useDispatches';
import { useSocialQueue } from '../hooks/useSocialQueue';
import { effectiveStatus, PLATFORM_LIMITS, type SocialPlatform } from '../social/queue';
import {
  DEFAULT_TILE_ORDER, TILE_ORIGIN, loadTileLayout, saveTileLayout,
  moveTileInLayout, toggleTileHiddenInLayout, type TileId, type TileLayout,
} from './analyticsTileLayout';
import './Analytics.css';

const SERIES = '#2f9fc9';
const SERIES_WARM = '#c8762a';
const INK_DIM = '#9fbdd6';
const INK_FAINT = '#6c8399';

const DAY = 86_400_000;

const CATEGORY_LABEL: Record<string, string> = {
  expedition: 'Expedition',
  dataset: 'Dataset',
  publication: 'Publication',
  media: 'Media',
  institution: 'Institution',
};

const STATION_LABEL: Record<string, string> = {
  maitri: 'Maitri',
  bharati: 'Bharati',
  dakshin: 'Dakshin Gangotri',
  ship: 'Ship',
  ncpor: 'NCPOR',
};

function countBy<T>(items: T[], key: (item: T) => string | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) {
    const k = key(item);
    if (!k) continue;
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

function daysAgo(ts: number, now: number): number {
  return Math.max(0, Math.floor((now - ts) / DAY));
}

function StatTile({
  label, value, hint, icon, tone,
}: {
  label: string; value: number | string; hint?: string; icon: React.ReactNode;
  /** 'warn' recolours the tile so a number that deserves attention (an aging
   *  backlog, a weak success rate) doesn't sit visually identical to routine
   *  ones — the whole point of a dashboard a government body checks
   *  periodically is that the thing needing attention should not require
   *  reading every number to find. */
  tone?: 'default' | 'warn';
}) {
  return (
    <div className={'an-tile' + (tone === 'warn' ? ' an-tile-warn' : '')}>
      <div className="an-tile-icon">{icon}</div>
      <div>
        <div className="an-tile-value">{value}</div>
        <div className="an-tile-label">{label}</div>
        {hint && <div className="an-tile-hint">{hint}</div>}
      </div>
    </div>
  );
}

/** A chart and its table. The table is not a fallback — it is the same data
 *  for anyone who cannot use the picture, including a printed page. */
function Figure({
  title, note, children, rows, headers,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
  headers: [string, string];
  rows: { label: string; value: number }[];
}) {
  return (
    <figure className="an-figure">
      <figcaption>
        <h3>{title}</h3>
        {note && <p>{note}</p>}
      </figcaption>
      {rows.length === 0 ? (
        <p className="an-empty">Nothing to chart yet.</p>
      ) : (
        <>
          <div className="an-chart">{children}</div>
          <details className="an-table">
            <summary>Show as a table</summary>
            <table>
              <thead><tr><th>{headers[0]}</th><th>{headers[1]}</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label}><td>{r.label}</td><td>{r.value}</td></tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </figure>
  );
}

/** One of the four accountability questions the page is organised around.
 *  Every section states, in one sentence, what question its numbers answer
 *  — a dashboard read once a quarter needs that reminder every time, not
 *  just on the day someone designed it. */
function Section({
  title, note, children,
}: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section className="an-section">
      <div className="an-section-head">
        <h2>{title}</h2>
        <p>{note}</p>
      </div>
      {children}
    </section>
  );
}

export function Analytics() {
  const { user } = useAuth();
  const { role, permissions, loading: roleLoading } = useRole();
  const { records, loading: recordsLoading } = usePublicArchive();
  const { dispatches } = useDispatches();
  const { posts } = useSocialQueue();

  // A publisher or admin sees this by default; anyone else needs an admin
  // to have granted analytics access explicitly on the Access page.
  const canView = permissions.analyticsAccess;
  // Date.now() is impure — reading it during render can differ between
  // renders of the same props, which React (correctly) flags. A dashboard
  // has no need for "now" to tick live, so it is captured once, on mount.
  const [now] = useState(() => Date.now());

  const isAdmin = role === 'admin';
  const [editingLayout, setEditingLayout] = useState(false);
  const [tileLayout, setTileLayout] = useState<TileLayout>(() => loadTileLayout());

  const moveTile = (id: TileId, dir: -1 | 1) => {
    setTileLayout((prev) => {
      const next = moveTileInLayout(prev, id, dir);
      if (next !== prev) saveTileLayout(next);
      return next;
    });
  };

  const toggleTileHidden = (id: TileId) => {
    setTileLayout((prev) => {
      const next = toggleTileHiddenInLayout(prev, id);
      saveTileLayout(next);
      return next;
    });
  };

  const resetTileLayout = () => {
    const next: TileLayout = { order: DEFAULT_TILE_ORDER, hidden: [] };
    setTileLayout(next);
    saveTileLayout(next);
  };

  /* ── 1. Service delivery ────────────────────────────────────────────── */

  const pipeline = useMemo(() => ({
    raw: dispatches.filter((d) => d.status === 'raw').length,
    drafted: dispatches.filter((d) => d.status === 'drafted').length,
    flagged: dispatches.filter((d) => d.status === 'flagged').length,
  }), [dispatches]);

  const backlog = useMemo(
    () => dispatches.filter((d) => d.status === 'raw' || d.status === 'drafted' || d.status === 'flagged'),
    [dispatches],
  );

  const oldestBacklogDays = useMemo(
    () => backlog.reduce((max, d) => Math.max(max, daysAgo(d.createdAt, now)), 0),
    [backlog, now],
  );

  /* Turnaround: submission (dispatch.createdAt) to publication
     (record.metadata.provenance.approvedAt), matched by sourceId. Only
     dispatches that actually became a public record contribute — a
     turnaround figure is a claim about how the pipeline performs when it
     works, not diluted by everything still in flight. */
  const turnaroundDays = useMemo(() => {
    const byId = new Map(dispatches.map((d) => [d.id, d]));
    const spans: number[] = [];
    for (const r of records) {
      const sourceId = r.metadata?.provenance?.sourceId;
      const approvedAt = r.metadata?.provenance?.approvedAt;
      if (!sourceId || !approvedAt) continue;
      const d = byId.get(sourceId);
      if (!d) continue; // dispatch not readable here — skip rather than guess
      const span = (approvedAt - d.createdAt) / DAY;
      if (span >= 0) spans.push(span);
    }
    if (spans.length === 0) return null;
    const avg = spans.reduce((a, b) => a + b, 0) / spans.length;
    return { avg, n: spans.length };
  }, [records, dispatches]);

  /* ── 2. Governance & safety ─────────────────────────────────────────── */

  /* Every dispatch this reviewer's role can see that was ever flagged
     unsafe. safetyFlag dispatches are refused publication outright by
     canPublishDispatch() regardless of what an admin clicks — this is the
     evidence that the gate has something to gate, not just a rule that has
     never fired. */
  const safetyWithheld = useMemo(
    () => dispatches.filter((d) => d.safetyFlag).length,
    [dispatches],
  );

  /* ── 3. Reach & dissemination ───────────────────────────────────────── */

  const disseminationByPlatform = useMemo(() => {
    const platforms = Object.keys(PLATFORM_LIMITS) as SocialPlatform[];
    return platforms
      .map((platform) => {
        const mine = posts.filter((p) => p.platform === platform);
        return { label: PLATFORM_LIMITS[platform].label, value: mine.filter((p) => p.status === 'posted').length, total: mine.length };
      })
      .filter((p) => p.total > 0);
  }, [posts]);

  const disseminationTotals = useMemo(() => {
    const posted = posts.filter((p) => p.status === 'posted').length;
    const failed = posts.filter((p) => p.status === 'failed').length;
    const pending = posts.filter((p) => {
      const s = effectiveStatus(p);
      return s === 'queued' || s === 'ready';
    }).length;
    const concluded = posted + failed;
    return {
      posted, failed, pending,
      successRate: concluded > 0 ? Math.round((posted / concluded) * 100) : null,
    };
  }, [posts]);

  /* ── 4. Coverage & currency ─────────────────────────────────────────── */

  const byCategory = useMemo(() => {
    const counts = countBy(records, (r) => r.cat);
    return Object.entries(counts)
      .map(([k, value]) => ({ label: CATEGORY_LABEL[k] ?? k, value }))
      .sort((a, b) => b.value - a.value);
  }, [records]);

  const byStation = useMemo(() => {
    const counts = countBy(records, (r) => r.metadata?.station?.toLowerCase());
    return Object.entries(counts)
      .map(([k, value]) => ({ label: STATION_LABEL[k] ?? k, value }))
      .sort((a, b) => b.value - a.value);
  }, [records]);

  /* One row per station that has ever published, showing how long ago its
     most recent record went up — the question "has anyone forgotten
     Dakshin Gangotri" answered directly rather than left to be noticed. */
  const stationFreshness = useMemo(() => {
    const latest = new Map<string, number>();
    for (const r of records) {
      const station = r.metadata?.station;
      if (!station || !r.publishedAt) continue;
      const prev = latest.get(station);
      if (!prev || r.publishedAt > prev) latest.set(station, r.publishedAt);
    }
    return [...latest.entries()]
      .map(([station, publishedAt]) => ({ station, publishedAt, days: daysAgo(publishedAt, now) }))
      .sort((a, b) => b.days - a.days); // stalest first
  }, [records, now]);

  /* Cumulative, because the question is "is the archive growing?" — a
     per-month count of a collection this size is mostly noise. */
  const overTime = useMemo(() => {
    const months = countBy(records, (r) =>
      r.publishedAt ? new Date(r.publishedAt).toISOString().slice(0, 7) : undefined);
    return Object.keys(months).sort().reduce<{ label: string; value: number }[]>(
      (acc, month) => {
        const previous = acc.length > 0 ? acc[acc.length - 1].value : 0;
        acc.push({ label: month, value: previous + months[month] });
        return acc;
      },
      [],
    );
  }, [records]);

  const thisYear = new Date().getUTCFullYear();
  const publishedThisYear = records.filter(
    (r) => r.metadata?.publicationYear === thisYear,
  ).length;

  const tileNodes: Record<TileId, ReactNode> = {
    published: (
      <StatTile
        icon={<Archive className="w-5 h-5" />}
        label="Published records"
        value={recordsLoading ? '—' : records.length}
        hint={`${publishedThisYear} in ${thisYear}`}
      />
    ),
    turnaround: (
      <StatTile
        icon={<TimerReset className="w-5 h-5" />}
        label="Average turnaround"
        value={turnaroundDays ? `${turnaroundDays.avg.toFixed(1)}d` : '—'}
        hint={turnaroundDays ? `field to public, over ${turnaroundDays.n} records` : 'no completed records yet'}
      />
    ),
    backlog: (
      <StatTile
        icon={<Radio className="w-5 h-5" />}
        label="Awaiting review"
        value={backlog.length}
        hint={`${pipeline.raw} unread · ${pipeline.drafted} drafted · ${pipeline.flagged} sent back`}
      />
    ),
    oldest: (
      <StatTile
        tone={oldestBacklogDays > 7 ? 'warn' : 'default'}
        icon={<CalendarClock className="w-5 h-5" />}
        label="Oldest item waiting"
        value={backlog.length > 0 ? `${oldestBacklogDays}d` : '—'}
        hint={oldestBacklogDays > 7 ? 'over a week — worth a look' : 'within a week'}
      />
    ),
    safety: (
      <StatTile
        icon={<ShieldAlert className="w-5 h-5" />}
        label="Withheld under safety protocol"
        value={safetyWithheld}
        hint="Flagged reports — never eligible for publication, regardless of admin action"
      />
    ),
    flagged: (
      <StatTile
        icon={<CheckCircle2 className="w-5 h-5" />}
        label="Sent back for revision"
        value={pipeline.flagged}
        hint="Currently with a publisher, following admin notes"
      />
    ),
    sent: (
      <StatTile
        icon={<Send className="w-5 h-5" />}
        label="Posts sent"
        value={disseminationTotals.posted}
        hint={`${disseminationTotals.pending} waiting in the queue`}
      />
    ),
    successRate: (
      <StatTile
        tone={disseminationTotals.successRate !== null && disseminationTotals.successRate < 90 ? 'warn' : 'default'}
        icon={<CheckCircle2 className="w-5 h-5" />}
        label="Dissemination success rate"
        value={disseminationTotals.successRate !== null ? `${disseminationTotals.successRate}%` : '—'}
        hint={disseminationTotals.failed > 0 ? `${disseminationTotals.failed} failed` : 'no failures'}
      />
    ),
  };

  if (!user || (!roleLoading && !canView)) {
    return (
      <div className="ph-page">
        <p className="an-empty">
          The archive dashboard is available to publishers and admins, and to
          anyone else an admin has granted analytics access.
        </p>
      </div>
    );
  }

  return (
    <div className="ph-page an-page">
      <header className="an-head">
        <h1>Archive dashboard</h1>
        <p>Service delivery, governance, reach and coverage — what a public outreach programme is accountable for.</p>
      </header>

      {/* ── Overview — the stat tiles, admin-arranged ────────────────────── */}
      <section className="an-section">
        <div className="an-section-head an-overview-head">
          <div>
            <h2>Overview</h2>
            <p>
              {isAdmin
                ? 'Pick which numbers lead the dashboard, and in what order. Saved to this browser only.'
                : 'The numbers this dashboard leads with.'}
            </p>
          </div>
          {isAdmin && (
            <div className="an-customize-bar">
              {editingLayout && (
                <button type="button" className="an-btn ghost" onClick={resetTileLayout}>
                  <RotateCcw className="w-3.5 h-3.5" /> Reset
                </button>
              )}
              <button
                type="button"
                className={'an-btn' + (editingLayout ? ' is-active' : '')}
                onClick={() => setEditingLayout((v) => !v)}
              >
                <LayoutGrid className="w-3.5 h-3.5" /> {editingLayout ? 'Done' : 'Customize layout'}
              </button>
            </div>
          )}
        </div>

        <div className="an-tiles an-tiles-overview">
          {tileLayout.order.map((id, i) => {
            const isHidden = tileLayout.hidden.includes(id);
            if (isHidden && !editingLayout) return null;
            return (
              <div key={id} className={'an-tile-slot' + (isHidden ? ' is-hidden' : '')}>
                {editingLayout && (
                  <div className="an-tile-controls">
                    <span className="an-tile-origin">{TILE_ORIGIN[id]}</span>
                    <div className="an-tile-controls-buttons">
                      <button
                        type="button"
                        onClick={() => toggleTileHidden(id)}
                        aria-label={isHidden ? 'Show this stat' : 'Hide this stat'}
                        title={isHidden ? 'Show this stat' : 'Hide this stat'}
                      >
                        {isHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => moveTile(id, -1)}
                        disabled={i === 0}
                        aria-label="Move earlier"
                        title="Move earlier"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveTile(id, 1)}
                        disabled={i === tileLayout.order.length - 1}
                        aria-label="Move later"
                        title="Move later"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
                {tileNodes[id]}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── 1. Service delivery ────────────────────────────────────────── */}
      <Section title="Service delivery" note="Is content moving, and how long does the public wait for it?">
        <div className="an-pipeline">
          <div className="an-pipeline-board">
            <CircuitBoard
              variant="dark"
              width={620}
              height={160}
              pulseSpeed={2.6}
              nodes={[
                { id: 'field',    x: 60,  y: 66, label: `Field · ${pipeline.raw}`,        icon: <Radio className="w-4 h-4" />,       status: pipeline.raw > 0 ? 'processing' : 'inactive' },
                { id: 'review',   x: 200, y: 66, label: `Review · ${pipeline.drafted}`,   icon: <CheckCircle2 className="w-4 h-4" />, status: pipeline.drafted > 0 ? 'processing' : 'inactive' },
                { id: 'archive',  x: 350, y: 66, label: `Archive · ${records.length}`,    icon: <Archive className="w-4 h-4" />,      status: records.length > 0 ? 'active' : 'inactive' },
                { id: 'social',   x: 500, y: 66, label: `Queue · ${disseminationTotals.pending}`, icon: <Send className="w-4 h-4" />, status: disseminationTotals.failed > 0 ? 'error' : disseminationTotals.pending > 0 ? 'processing' : 'active' },
              ]}
              connections={[
                { from: 'field',   to: 'review',  animated: pipeline.raw > 0 },
                { from: 'review',  to: 'archive', animated: pipeline.drafted > 0 },
                { from: 'archive', to: 'social',  animated: disseminationTotals.pending > 0 },
              ]}
            />
          </div>
          <ul className="an-pipeline-legend">
            <li><span className="dot waiting" />{pipeline.raw} awaiting a publisher</li>
            <li><span className="dot waiting" />{pipeline.drafted} drafted, awaiting an admin</li>
            <li><span className="dot ok" />{records.length} published</li>
            {disseminationTotals.failed > 0 && (
              <li><span className="dot bad" />{disseminationTotals.failed} post{disseminationTotals.failed === 1 ? '' : 's'} failed to send</li>
            )}
          </ul>
        </div>
      </Section>

      {/* ── 2. Governance & safety ───────────────────────────────────────── */}
      <Section title="Governance & safety" note="Evidence that the safety gate and the review step are actually doing something.">
        <p className="an-empty">Both numbers live in the Overview above — safety and rework are checked in passing, not charted over time.</p>
      </Section>

      {/* ── 3. Reach & dissemination ───────────────────────────────────── */}
      <Section title="Reach & dissemination" note="What was scheduled for social media, and whether it actually went out.">
        {disseminationByPlatform.length > 0 && (
          <Figure
            title="By platform"
            note="Posts actually sent, per channel."
            headers={['Platform', 'Posted']}
            rows={disseminationByPlatform}
          >
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={disseminationByPlatform} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                <CartesianGrid stroke={INK_FAINT} strokeOpacity={0.18} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: INK_DIM, fontSize: 12 }} tickLine={false} axisLine={{ stroke: INK_FAINT, strokeOpacity: 0.3 }} />
                <YAxis allowDecimals={false} tick={{ fill: INK_DIM, fontSize: 12 }} tickLine={false} axisLine={false} width={32} />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                  contentStyle={{ background: '#0d1420', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: INK_DIM }}
                />
                <Bar dataKey="value" name="Posted" fill={SERIES} radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </Figure>
        )}
      </Section>

      {/* ── 4. Coverage & currency ─────────────────────────────────────── */}
      <Section title="Coverage & currency" note="What the archive holds, and whether any part of it has gone stale.">
        <div className="an-grid">
          <Figure
            title="What the archive holds"
            note="Published records by category."
            headers={['Category', 'Records']}
            rows={byCategory}
          >
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={byCategory} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                <CartesianGrid stroke={INK_FAINT} strokeOpacity={0.18} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: INK_DIM, fontSize: 12 }} tickLine={false} axisLine={{ stroke: INK_FAINT, strokeOpacity: 0.3 }} />
                <YAxis allowDecimals={false} tick={{ fill: INK_DIM, fontSize: 12 }} tickLine={false} axisLine={false} width={32} />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                  contentStyle={{ background: '#0d1420', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: INK_DIM }}
                />
                <Bar dataKey="value" name="Records" fill={SERIES} radius={[4, 4, 0, 0]} maxBarSize={46} />
              </BarChart>
            </ResponsiveContainer>
          </Figure>

          <Figure
            title="Where the work happened"
            note="Published records by station."
            headers={['Station', 'Records']}
            rows={byStation}
          >
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={byStation} layout="vertical" margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
                <CartesianGrid stroke={INK_FAINT} strokeOpacity={0.18} horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fill: INK_DIM, fontSize: 12 }} tickLine={false} axisLine={{ stroke: INK_FAINT, strokeOpacity: 0.3 }} />
                <YAxis type="category" dataKey="label" width={120} tick={{ fill: INK_DIM, fontSize: 12 }} tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                  contentStyle={{ background: '#0d1420', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: INK_DIM }}
                />
                <Bar dataKey="value" name="Records" fill={SERIES} radius={[0, 4, 4, 0]} maxBarSize={26} />
              </BarChart>
            </ResponsiveContainer>
          </Figure>
        </div>

        {stationFreshness.length > 0 && (
          <div className="an-figure an-freshness">
            <figcaption>
              <h3>Station freshness</h3>
              <p>Days since each station's most recent published record — stalest first.</p>
            </figcaption>
            <table className="an-freshness-table">
              <thead><tr><th>Station</th><th>Last published</th><th>Days ago</th></tr></thead>
              <tbody>
                {stationFreshness.map((s) => (
                  <tr key={s.station} className={s.days > 90 ? 'an-stale' : undefined}>
                    <td>{STATION_LABEL[s.station.toLowerCase()] ?? s.station}</td>
                    <td>{new Date(s.publishedAt).toLocaleDateString()}</td>
                    <td>{s.days}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Figure
          title="Archive growth"
          note="Total published records over time, cumulative."
          headers={['Month', 'Total records']}
          rows={overTime}
        >
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={overTime} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
              <defs>
                <linearGradient id="anGrowth" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={SERIES_WARM} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={SERIES_WARM} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={INK_FAINT} strokeOpacity={0.18} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: INK_DIM, fontSize: 12 }} tickLine={false} axisLine={{ stroke: INK_FAINT, strokeOpacity: 0.3 }} />
              <YAxis allowDecimals={false} tick={{ fill: INK_DIM, fontSize: 12 }} tickLine={false} axisLine={false} width={32} />
              <Tooltip
                contentStyle={{ background: '#0d1420', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: INK_DIM }}
              />
              <Area
                type="monotone"
                dataKey="value"
                name="Total records"
                stroke={SERIES_WARM}
                strokeWidth={2}
                fill="url(#anGrowth)"
                dot={{ r: 3, fill: SERIES_WARM, stroke: '#0d1420', strokeWidth: 2 }}
                activeDot={{ r: 5 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </Figure>
      </Section>
    </div>
  );
}
