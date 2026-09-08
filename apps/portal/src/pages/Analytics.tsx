/**
 * What the archive actually contains, and what is moving through it.
 *
 * The portal could report plenty of numbers; this page reports the ones that
 * would change a decision. Four tiles say how big the archive is and whether
 * anything is stuck; the pipeline diagram says *where* it is stuck; the charts
 * say what the collection is made of and whether it is still growing.
 *
 * ── On colour ────────────────────────────────────────────────────────────
 * The bar charts use one hue, not five. Category and station are named on the
 * axis, so colouring each bar separately would encode identity twice and buy
 * nothing — while forcing a five-hue categorical palette that cannot clear
 * deutan separation once it contains both a green and a red. Colour is used
 * only where state *is* the data (the dissemination row), and there it always
 * ships with a label. #2f9fc9 and #c8762a are the two marks already validated
 * against this project's dark panels in public-site/components/RecordChart.
 *
 * Every chart is also rendered as a table below it, so the page works for a
 * screen reader and in print.
 */

import { useMemo } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts';
import { Archive, CheckCircle2, Radio, Send } from 'lucide-react';
import { CircuitBoard } from '@/components/ui/circuit-board';
import { useAuth } from '../context/AuthContext';
import { useRole } from '../hooks/useRole';
import { usePublicArchive } from '../hooks/usePublicArchive';
import { useDispatches } from '../hooks/useDispatches';
import { useSocialQueue } from '../hooks/useSocialQueue';
import { effectiveStatus } from '../social/queue';
import './Analytics.css';

const SERIES = '#2f9fc9';
const SERIES_WARM = '#c8762a';
const INK_DIM = '#9fbdd6';
const INK_FAINT = '#6c8399';

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

function StatTile({
  label, value, hint, icon,
}: { label: string; value: number | string; hint?: string; icon: React.ReactNode }) {
  return (
    <div className="an-tile">
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

export function Analytics() {
  const { user } = useAuth();
  const { role, loading: roleLoading } = useRole();
  const { records, loading: recordsLoading } = usePublicArchive();
  const { dispatches } = useDispatches();
  const { posts } = useSocialQueue();

  const isStaff = role === 'publisher' || role === 'admin';

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

  /** Cumulative, because the question is "is the archive growing?" — a
   *  per-month count of a collection this size is mostly noise. */
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

  const pipeline = useMemo(() => ({
    raw: dispatches.filter((d) => d.status === 'raw').length,
    drafted: dispatches.filter((d) => d.status === 'drafted').length,
    approved: dispatches.filter((d) => d.status === 'approved').length,
  }), [dispatches]);

  const dissemination = useMemo(() => {
    const live = posts.map((p) => effectiveStatus(p));
    return {
      waiting: live.filter((s) => s === 'queued').length,
      due: live.filter((s) => s === 'ready').length,
      posted: live.filter((s) => s === 'posted').length,
      failed: live.filter((s) => s === 'failed').length,
    };
  }, [posts]);

  const thisYear = new Date().getUTCFullYear();
  const publishedThisYear = records.filter(
    (r) => r.metadata?.publicationYear === thisYear,
  ).length;

  if (!user || (!roleLoading && !isStaff)) {
    return (
      <div className="ph-page">
        <p className="an-empty">
          The archive dashboard is available to publishers and admins.
        </p>
      </div>
    );
  }

  return (
    <div className="ph-page an-page">
        <header className="an-head">
          <h1>Archive dashboard</h1>
          <p>
            What the public archive holds, what is still moving through review,
            and what has been disseminated.
          </p>
        </header>

        <div className="an-tiles">
          <StatTile
            icon={<Archive className="w-5 h-5" />}
            label="Published records"
            value={recordsLoading ? '—' : records.length}
            hint="Live on the public site and the API"
          />
          <StatTile
            icon={<CheckCircle2 className="w-5 h-5" />}
            label={`Published in ${thisYear}`}
            value={recordsLoading ? '—' : publishedThisYear}
          />
          <StatTile
            icon={<Radio className="w-5 h-5" />}
            label="Awaiting review"
            value={pipeline.raw + pipeline.drafted}
            hint={`${pipeline.raw} unread · ${pipeline.drafted} drafted`}
          />
          <StatTile
            icon={<Send className="w-5 h-5" />}
            label="Posts sent"
            value={dissemination.posted}
            hint={`${dissemination.waiting + dissemination.due} in the queue`}
          />
        </div>

        {/* The pipeline as it actually stands. Each stage carries its own
            count, and a stage with work waiting pulses rather than merely
            being a different shade — the thing a publisher needs to spot from
            across a room is where the backlog is. */}
        <section className="an-pipeline">
          <h2>Pipeline</h2>
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
                { id: 'social',   x: 500, y: 66, label: `Queue · ${dissemination.waiting + dissemination.due}`, icon: <Send className="w-4 h-4" />, status: dissemination.failed > 0 ? 'error' : dissemination.due > 0 ? 'processing' : 'active' },
              ]}
              connections={[
                { from: 'field',   to: 'review',  animated: pipeline.raw > 0 },
                { from: 'review',  to: 'archive', animated: pipeline.drafted > 0 },
                { from: 'archive', to: 'social',  animated: dissemination.waiting + dissemination.due > 0 },
              ]}
            />
          </div>
          <ul className="an-pipeline-legend">
            <li><span className="dot waiting" />{pipeline.raw} awaiting a publisher</li>
            <li><span className="dot waiting" />{pipeline.drafted} drafted, awaiting an admin</li>
            <li><span className="dot ok" />{records.length} published</li>
            {dissemination.failed > 0 && (
              <li><span className="dot bad" />{dissemination.failed} post{dissemination.failed === 1 ? '' : 's'} failed to send</li>
            )}
          </ul>
        </section>

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
    </div>
  );
}
