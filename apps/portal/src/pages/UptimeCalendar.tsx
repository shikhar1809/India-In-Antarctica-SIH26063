/**
 * A GitHub-contributions-shaped calendar, repurposed for uptime: one column
 * per week, one row per weekday, coloured by that day's status. The shape
 * is deliberately familiar — anyone who has looked at a GitHub profile
 * already knows how to read "more/darker = more of the thing," and the one
 * new idea to learn is that here red means something happened, not just
 * "less."
 *
 * Weeks run Sunday-first to match the reference layout, and month labels
 * sit above the first full week that falls in that month — the same
 * placement rule GitHub's own calendar uses, so a label never floats over
 * the wrong column.
 */

import { Fragment, useMemo, useState } from 'react';
import { tierOf, type DayUptime } from './uptimeMock';
import './UptimeCalendar.css';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });
}

function tooltipFor(day: DayUptime): string {
  const date = formatDate(day.date);
  if (day.uptimePct === null) return `${date} — no data`;
  if (day.incidents > 0) {
    return `${date} — ${day.uptimePct.toFixed(2)}% uptime · ${day.incidents} incident${day.incidents === 1 ? '' : 's'} · ${day.downtimeMinutes} min downtime`;
  }
  return `${date} — ${day.uptimePct.toFixed(2)}% uptime`;
}

export function UptimeCalendar({ history }: { history: DayUptime[] }) {
  const [hovered, setHovered] = useState<DayUptime | null>(null);

  // Group into Sunday-first weeks. The first week is padded with leading
  // blanks so day-of-week alignment is correct even when history[0] isn't a
  // Sunday — a real feed rarely starts on one.
  const weeks = useMemo(() => {
    if (history.length === 0) return [];
    const first = new Date(history[0].date + 'T00:00:00Z');
    const leadingBlanks = first.getUTCDay(); // 0 = Sunday
    const cells: (DayUptime | null)[] = [...Array(leadingBlanks).fill(null), ...history];
    const out: (DayUptime | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7));
    return out;
  }, [history]);

  // A month label goes above the week whose Sunday is the first day of
  // that month falling within it — computed once, aligned 1:1 with `weeks`.
  const monthLabels = useMemo(() => {
    const labels: (string | null)[] = [];
    let lastMonth = -1;
    for (const week of weeks) {
      const firstReal = week.find((d): d is DayUptime => d !== null);
      if (!firstReal) { labels.push(null); continue; }
      const month = new Date(firstReal.date + 'T00:00:00Z').getUTCMonth();
      labels.push(month !== lastMonth ? MONTH_LABELS[month] : null);
      lastMonth = month;
    }
    return labels;
  }, [weeks]);

  return (
    <div className="uc-wrap">
      <div className="uc-grid" style={{ gridTemplateColumns: `28px repeat(${weeks.length}, 13px)` }}>
        <div className="uc-corner" />
        {monthLabels.map((label, i) => (
          <div key={i} className="uc-month">{label}</div>
        ))}

        {WEEKDAY_LABELS.map((label, dow) => (
          <Fragment key={dow}>
            <div className="uc-weekday">{label}</div>
            {weeks.map((week, wi) => {
              const day = week[dow];
              if (!day) return <div key={`${wi}-${dow}`} className="uc-cell uc-cell-empty" />;
              const tier = tierOf(day);
              return (
                <button
                  key={`${wi}-${dow}`}
                  type="button"
                  className={`uc-cell uc-tier-${tier}`}
                  onMouseEnter={() => setHovered(day)}
                  onMouseLeave={() => setHovered((h) => (h?.date === day.date ? null : h))}
                  onFocus={() => setHovered(day)}
                  aria-label={tooltipFor(day)}
                  title={tooltipFor(day)}
                />
              );
            })}
          </Fragment>
        ))}
      </div>

      <div className="uc-footer">
        <div className="uc-hover-readout">
          {hovered ? tooltipFor(hovered) : 'Hover a day for its detail'}
        </div>
        <div className="uc-legend">
          <span>Less</span>
          <span className="uc-cell uc-tier-none" />
          <span className="uc-cell uc-tier-good" />
          <span className="uc-cell uc-tier-great" />
          <span className="uc-cell uc-tier-perfect" />
          <span>More</span>
          <span className="uc-legend-gap" />
          <span className="uc-cell uc-tier-outage" />
          <span>Outage</span>
        </div>
      </div>
    </div>
  );
}

