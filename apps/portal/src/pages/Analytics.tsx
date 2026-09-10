/**
 * What a government outreach programme actually needs to track.
 *
 * A government body funding a public outreach portal is not primarily asking
 * "how many records exist" — it is asking a handful of different questions,
 * and this page is organised around them rather than around what happened to
 * be easy to compute:
 *
 *   1. Service delivery — is content moving, or is it stuck? How long does
 *      the public wait between an observation and it being published?
 *   2. Social performance — are the accounts we post as actually reaching
 *      people, and how did the posts sent from this portal do?
 *   3. Dissemination — did what was scheduled actually go out?
 *   4. Coverage & currency — which stations and categories are represented,
 *      and is any part of the archive going stale?
 *
 * Governance & safety (the safety gate, rework) lives in the Overview tiles:
 * it is checked in passing, not charted over time.
 *
 * ── Two kinds of social number, kept apart on purpose ───────────────────
 * Account totals (followers, 30-day reach) come from each platform through
 * functions/engagement.js. They describe the whole account, including every
 * post that never went near this portal — so they are shown as the health of
 * the channel, never as the result of the portal's posts. Per-post numbers,
 * for posts the portal sent, are a separate table. Adding the two together
 * would be the easiest chart on this page to draw and the most misleading.
 *
 * Nor are metrics summed across platforms. Instagram's headline is unique
 * reach, X's is impressions, LinkedIn's is page reach; they are different
 * units that happen to share a word, so each account gets its own panel.
 *
 * ── On colour ────────────────────────────────────────────────────────────
 * The three platforms carry fixed hues (validated for CVD separation against
 * the portal's #0d2033 panel, all pairs), and each always appears beside its
 * icon and name — colour is never the only identity channel. Archive charts
 * are single-series, so they use one hue: category and station are named on
 * the axis, and colouring each bar would encode identity twice.
 *
 * Every chart also has a table view, so the page works for a screen reader
 * and in print — "what did we report to the Ministry" is a realistic use of
 * this exact page.
 *
 * The page is split into a data container (`Analytics`) and a view
 * (`AnalyticsView`) so /__analytics can render the view against fixtures in
 * dev without a Google sign-in.
 */

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  Archive, ArrowDownRight, ArrowUpRight, CalendarClock, CheckCircle2, ChevronDown,
  ChevronUp, ExternalLink, Eye, EyeOff, Info, LayoutGrid, Radio, RefreshCw,
  RotateCcw, Send, ShieldAlert, TimerReset, Users,
} from 'lucide-react';
import { FaXTwitter, FaLinkedin, FaInstagram } from 'react-icons/fa6';
import { useAuth } from '../context/AuthContext';
import { useRole } from '../hooks/useRole';
import { usePublicArchive } from '../hooks/usePublicArchive';
import { useDispatches } from '../hooks/useDispatches';
import { useSocialQueue } from '../hooks/useSocialQueue';
import {
  effectiveStatus, PLATFORM_LIMITS, SOCIAL_PLATFORMS,
  type ScheduledPost, type SocialPlatform,
} from '../social/queue';
import {
  fetchAccountAnalytics, refreshEngagement,
  type AccountAnalytics, type AccountStats, type Row,
} from '../social/engagementClient';
import type { RepositoryRecord } from '../repository/contract';
import type { Dispatch } from '../types';
import {
  DEFAULT_TILE_ORDER, TILE_ORIGIN, loadTileLayout, saveTileLayout,
  moveTileInLayout, toggleTileHiddenInLayout, type TileId, type TileLayout,
} from './analyticsTileLayout';
import './Analytics.css';

/* ═════════════════════════════════════════════════════════ constants ══ */

const PLATFORM_ICON: Record<SocialPlatform, ReactNode> = {
  x: <FaXTwitter />,
  linkedin: <FaLinkedin />,
  instagram: <FaInstagram />,
};

/** Identity hues, fixed per platform and never reassigned by rank. Passes
 *  every CVD and contrast check against #0d2033 with all three on screen. */
const PLATFORM_COLOR: Record<SocialPlatform, string> = {
  x: '#199e70',
  linkedin: '#3987e5',
  instagram: '#d95926',
};

const PLATFORM_ORDER: SocialPlatform[] = ['instagram', 'linkedin', 'x'];

const SERIES = '#2f9fc9';
const INK_DIM = '#9fbdd6';
const INK_FAINT = '#6c8399';
const GOOD = '#3fb97c';
const BAD = '#ff6a6a';

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

const GENDER_LABEL: Record<string, string> = { F: 'Women', M: 'Men', U: 'Not specified' };

/* ═══════════════════════════════════════════════════════════ helpers ══ */

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

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat('en');

/** 1,284 stays exact; 12,900 becomes 12.9K. Below five figures the exact
 *  number is both readable and more honest. */
function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return Math.abs(n) >= 10_000 ? compact.format(n) : whole.format(Math.round(n));
}

const regionNames = (() => {
  try { return new Intl.DisplayNames(['en'], { type: 'region' }); } catch { return null; }
})();

function countryName(code: string): string {
  try { return regionNames?.of(code) ?? code; } catch { return code; }
}

function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function accountUrl(a: AccountStats): string | null {
  if (!a.handle) return null;
  if (a.platform === 'x') return `https://x.com/${a.handle}`;
  if (a.platform === 'instagram') return `https://www.instagram.com/${a.handle}`;
  return null; // LinkedIn returns a display name, not a handle
}

function handleLabel(a: AccountStats): string {
  if (!a.handle) return 'Connected account';
  return a.platform === 'linkedin' ? a.handle : `@${a.handle}`;
}

/** Last seven complete days against the seven before. Null when either
 *  window is empty — a percentage change from zero is not a number worth
 *  printing. */
function weekOverWeek(series: { value: number }[]): number | null {
  if (series.length < 14) return null;
  const sum = (xs: { value: number }[]) => xs.reduce((a, b) => a + b.value, 0);
  const recent = sum(series.slice(-7));
  const prior = sum(series.slice(-14, -7));
  if (prior <= 0) return null;
  return ((recent - prior) / prior) * 100;
}

/* ════════════════════════════════════════════════════ small pieces ══ */

const axisTick = { fill: INK_DIM, fontSize: 12 };

/** One tooltip for every chart on the page, so hover reads the same
 *  everywhere. Text stays in text colours; the swatch carries identity. */
function ChartTip({
  active, payload, label, unit, color, labelFormat,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
  unit: string;
  color: string;
  labelFormat?: (l: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="an-tip">
      <div className="an-tip-label">{label ? (labelFormat ? labelFormat(label) : label) : ''}</div>
      <div className="an-tip-row">
        <span className="an-tip-swatch" style={{ background: color }} />
        <strong>{whole.format(payload[0].value)}</strong> {unit}
      </div>
    </div>
  );
}

function StatTile({
  label, value, hint, icon, tone,
}: {
  label: string; value: number | string; hint?: string; icon: ReactNode;
  /** 'warn' recolours the tile so a number that deserves attention (an aging
   *  backlog, a weak success rate) doesn't sit visually identical to routine
   *  ones — the thing needing attention should not require reading every
   *  number to find. */
  tone?: 'default' | 'warn';
}) {
  return (
    <div className={'an-tile' + (tone === 'warn' ? ' an-tile-warn' : '')}>
      <div className="an-tile-top">
        <span className="an-tile-icon">{icon}</span>
        <span className="an-tile-label">{label}</span>
      </div>
      <div className="an-tile-value">{value}</div>
      {hint && <div className="an-tile-hint">{hint}</div>}
    </div>
  );
}

/** A chart and its table. The table is not a fallback — it is the same data
 *  for anyone who cannot use the picture, including a printed page. */
function Figure({
  title, note, children, rows, headers, className,
}: {
  title: string;
  note?: string;
  children: ReactNode;
  headers: [string, string];
  rows: { label: string; value: number }[];
  className?: string;
}) {
  return (
    <figure className={'an-card an-figure' + (className ? ` ${className}` : '')}>
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
                  <tr key={r.label}><td>{r.label}</td><td>{whole.format(r.value)}</td></tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </figure>
  );
}

/** One of the questions the page is organised around. Every section states,
 *  in one sentence, what question its numbers answer — a dashboard read once
 *  a quarter needs that reminder every time. */
function Section({
  id, index, title, note, actions, children,
}: {
  id: string; index: string; title: string; note: string; actions?: ReactNode; children: ReactNode;
}) {
  return (
    <section className="an-section" id={id} aria-labelledby={`${id}-title`}>
      <div className="an-section-head">
        <div>
          <span className="an-section-index">{index}</span>
          <h2 id={`${id}-title`}>{title}</h2>
          <p>{note}</p>
        </div>
        {actions && <div className="an-section-actions">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/** Horizontal bars drawn in HTML: labels that never collide, a value at
 *  every tip, and a real list for assistive tech. Single hue — the rows are
 *  named, so colour carries nothing here but "this panel's account". */
function BarList({ rows, color, format }: { rows: Row[]; color: string; format?: (label: string) => string }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="an-barlist">
      {rows.map((r) => (
        <li key={r.label} title={`${format ? format(r.label) : r.label}: ${whole.format(r.value)}`}>
          <span className="an-barlist-label">{format ? format(r.label) : r.label}</span>
          <span className="an-barlist-track">
            <span className="an-barlist-fill" style={{ width: `${(r.value / max) * 100}%`, background: color }} />
          </span>
          <span className="an-barlist-value">{whole.format(r.value)}</span>
        </li>
      ))}
    </ul>
  );
}

/* ═══════════════════════════════════════════════ social: accounts ══ */

function FollowerSplit({ accounts }: { accounts: AccountStats[] }) {
  const withFollowers = accounts.filter((a) => a.available && typeof a.followers === 'number');
  const total = withFollowers.reduce((s, a) => s + (a.followers ?? 0), 0);
  if (withFollowers.length === 0) return null;

  return (
    <div className="an-card an-audience-hero">
      <div className="an-hero-figure">
        <Users className="an-hero-icon" aria-hidden />
        <div>
          <div className="an-hero-value">{whole.format(total)}</div>
          <div className="an-hero-label">
            followers across {withFollowers.length} connected account{withFollowers.length === 1 ? '' : 's'}
          </div>
          <div className="an-hero-hint">Not de-duplicated — someone following on two platforms counts twice.</div>
        </div>
      </div>

      <div className="an-split">
        <div className="an-split-bar" role="img" aria-label={withFollowers.map((a) => `${PLATFORM_LIMITS[a.platform].label} ${a.followers}`).join(', ')}>
          {withFollowers.map((a) => (
            <span
              key={a.platform}
              className="an-split-seg"
              title={`${PLATFORM_LIMITS[a.platform].label}: ${whole.format(a.followers ?? 0)}`}
              style={{ flexGrow: Math.max(a.followers ?? 0, total * 0.012), background: PLATFORM_COLOR[a.platform] }}
            />
          ))}
        </div>
        <ul className="an-legend">
          {withFollowers.map((a) => (
            <li key={a.platform}>
              <span className="an-legend-swatch" style={{ background: PLATFORM_COLOR[a.platform] }} />
              <span className="an-legend-icon">{PLATFORM_ICON[a.platform]}</span>
              <span>{PLATFORM_LIMITS[a.platform].label}</span>
              <strong>{whole.format(a.followers ?? 0)}</strong>
              <span className="an-legend-share">{total > 0 ? `${Math.round(((a.followers ?? 0) / total) * 100)}%` : ''}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | null | undefined }) {
  if (value === null || value === undefined) return null;
  return (
    <div className="an-metric">
      <span className="an-metric-value">{fmt(value)}</span>
      <span className="an-metric-label">{label}</span>
    </div>
  );
}

function AccountCard({ account, today }: { account: AccountStats; today: string }) {
  const color = PLATFORM_COLOR[account.platform];
  const name = PLATFORM_LIMITS[account.platform].label;
  const url = accountUrl(account);

  // Today's point is a partial day — plotted, it reads as a collapse at the
  // right edge. The chart runs through yesterday and says so.
  const series = useMemo(
    () => (account.series ?? []).filter((p) => p.date < today),
    [account.series, today],
  );
  const total = series.reduce((s, p) => s + p.value, 0);
  const peak = series.reduce<{ date: string; value: number } | null>(
    (best, p) => (!best || p.value > best.value ? p : best), null,
  );
  const delta = weekOverWeek(series);
  const unit = (account.primaryLabel ?? 'Reach').toLowerCase();
  const gradientId = `an-acct-${account.platform}`;

  if (!account.available) {
    return (
      <article className="an-card an-account is-unavailable">
        <header className="an-account-head">
          <span className="an-account-badge" style={{ background: color }}>{PLATFORM_ICON[account.platform]}</span>
          <div><strong>{name}</strong><span className="an-account-handle">{handleLabel(account)}</span></div>
        </header>
        <p className="an-empty">{account.note ?? 'The platform returned no analytics for this account.'}</p>
      </article>
    );
  }

  const reported = [
    account.impressions, account.likes, account.comments, account.shares, account.saves, account.profileViews,
  ].filter((v) => v !== null && v !== undefined).length;

  return (
    <article className="an-card an-account">
      <header className="an-account-head">
        <span className="an-account-badge" style={{ background: color }}>{PLATFORM_ICON[account.platform]}</span>
        <div>
          <strong>{name}</strong>
          {url ? (
            <a className="an-account-handle" href={url} target="_blank" rel="noreferrer">
              {handleLabel(account)} <ExternalLink className="w-3 h-3" />
            </a>
          ) : (
            <span className="an-account-handle">{handleLabel(account)}</span>
          )}
        </div>
        <div className="an-account-followers">
          <span>{fmt(account.followers)}</span>
          <small>followers</small>
        </div>
      </header>

      <div className="an-account-primary">
        <div>
          <span className="an-account-total">{fmt(total)}</span>
          <span className="an-account-unit">{account.primaryLabel ?? 'Reach'} · 30 days</span>
        </div>
        {delta !== null && (
          <span className={'an-delta ' + (delta >= 0 ? 'is-up' : 'is-down')} title="Last 7 days against the 7 before">
            {delta >= 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
            {Math.abs(delta).toFixed(0)}% <small>vs prior week</small>
          </span>
        )}
      </div>

      <div className="an-spark">
        {series.length > 1 && total === 0 ? (
          <div className="an-spark-none">
            <span>No {unit} recorded in these 30 days</span>
          </div>
        ) : series.length > 1 ? (
          <ResponsiveContainer width="100%" height={92}>
            <AreaChart data={series} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" hide />
              <YAxis hide domain={[0, 'dataMax']} />
              <Tooltip
                cursor={{ stroke: INK_FAINT, strokeOpacity: 0.5 }}
                content={<ChartTip unit={unit} color={color} labelFormat={shortDate} />}
              />
              <Area
                type="monotone" dataKey="value" stroke={color} strokeWidth={2}
                fill={`url(#${gradientId})`} dot={false}
                activeDot={{ r: 4, fill: color, stroke: '#0d2033', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="an-empty">No daily series returned.</p>
        )}
      </div>
      <div className="an-spark-caption">
        <span>{series.length ? `${shortDate(series[0].date)} – ${shortDate(series[series.length - 1].date)}` : ''}</span>
        {peak && peak.value > 0 && <span>Peak {whole.format(peak.value)} on {shortDate(peak.date)}</span>}
      </div>

      <div className="an-metrics">
        {/* The headline already is impressions on X — don't print it twice. */}
        {account.metricType !== 'impressions' && (
          <Metric label={account.platform === 'instagram' ? 'Views' : 'Impressions'} value={account.impressions} />
        )}
        <Metric label="Likes" value={account.likes} />
        <Metric label="Comments" value={account.comments} />
        <Metric label="Shares" value={account.shares} />
        <Metric label="Saves" value={account.saves} />
        <Metric label={account.profileViewsLabel ?? 'Profile views'} value={account.profileViews} />
        {account.page && <Metric label="Page views" value={account.page.views} />}
        {account.page && <Metric label="Unique visitors" value={account.page.uniqueViews} />}
      </div>

      {account.page && account.page.views ? (
        <div className="an-device">
          <div className="an-device-bar">
            <span style={{ flexGrow: account.page.desktop ?? 0, background: color }} />
            <span style={{ flexGrow: account.page.mobile ?? 0, background: color, opacity: 0.45 }} />
          </div>
          <div className="an-device-legend">
            <span>Desktop {fmt(account.page.desktop)}</span>
            <span>Mobile {fmt(account.page.mobile)}</span>
          </div>
        </div>
      ) : null}

      {reported <= 1 && !account.page && (
        <p className="an-account-note">
          <Info className="w-3.5 h-3.5" />
          {name}&rsquo;s API reports only followers and {unit} for this account — the rest isn&rsquo;t shown as zero because it isn&rsquo;t zero, it&rsquo;s unreported.
        </p>
      )}

      <details className="an-table">
        <summary>Show daily values</summary>
        <table>
          <thead><tr><th>Date</th><th>{account.primaryLabel ?? 'Reach'}</th></tr></thead>
          <tbody>
            {series.map((p) => (
              <tr key={p.date}><td>{shortDate(p.date)}</td><td>{whole.format(p.value)}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </article>
  );
}

function AudiencePanel({ account }: { account: AccountStats }) {
  const demo = account.demographics;
  if (!demo) return null;
  const color = PLATFORM_COLOR[account.platform];
  const genderRows = demo.gender
    ? ['F', 'M', 'U'].map((k) => ({ label: k, value: demo.gender!.find((g) => g.label === k)?.value ?? 0 })).filter((r) => r.value > 0)
    : null;
  const ageTotal = demo.age?.reduce((s, a) => s + a.value, 0) ?? 0;
  const topAge = demo.age?.reduce((best, a) => (a.value > best.value ? a : best), demo.age[0]);

  return (
    <div className="an-card an-audience">
      <header className="an-audience-head">
        <span className="an-account-badge" style={{ background: color }}>{PLATFORM_ICON[account.platform]}</span>
        <div>
          <h3>Who follows {handleLabel(account)}</h3>
          <p>
            Follower demographics from Meta. Instagram is the only one of the three platforms that
            exposes them, and only once an account passes 100 followers.
          </p>
        </div>
        {topAge && ageTotal > 0 && (
          <div className="an-audience-callout">
            <strong>{Math.round((topAge.value / ageTotal) * 100)}%</strong>
            <span>are {topAge.label}</span>
          </div>
        )}
      </header>

      <div className="an-audience-grid">
        {demo.age && (
          <div>
            <h4>Age</h4>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={demo.age} margin={{ top: 16, right: 4, bottom: 0, left: 4 }}>
                <CartesianGrid stroke={INK_FAINT} strokeOpacity={0.14} vertical={false} />
                <XAxis dataKey="label" tick={{ ...axisTick, fontSize: 11 }} tickLine={false} axisLine={{ stroke: INK_FAINT, strokeOpacity: 0.3 }} interval={0} />
                <YAxis hide />
                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} content={<ChartTip unit="followers" color={color} />} />
                <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} maxBarSize={24}>
                  <LabelList dataKey="value" position="top" fill={INK_DIM} fontSize={11} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        {genderRows && genderRows.length > 0 && (
          <div>
            <h4>Gender</h4>
            <BarList rows={genderRows} color={color} format={(k) => GENDER_LABEL[k] ?? k} />
          </div>
        )}
        {demo.country && (
          <div>
            <h4>Top countries</h4>
            <BarList rows={demo.country.slice(0, 6)} color={color} format={countryName} />
          </div>
        )}
        {demo.city && (
          <div>
            <h4>Top cities</h4>
            <BarList rows={demo.city.slice(0, 6)} color={color} format={(c) => c.split(',')[0]} />
          </div>
        )}
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════ social: portal posts ══ */

function PostTable({ posts }: { posts: ScheduledPost[] }) {
  const sent = [...posts]
    .filter((p) => p.status === 'posted')
    .sort((a, b) => (b.postedAt ?? 0) - (a.postedAt ?? 0));

  if (sent.length === 0) {
    return (
      <p className="an-empty">
        Nothing has been sent from the portal yet. Once a queued post goes out, its own likes,
        comments, shares and views appear here — separately from the account totals above.
      </p>
    );
  }

  return (
    <div className="an-posts-wrap">
      <table className="an-posts">
        <thead>
          <tr>
            <th>Post</th>
            <th>Sent</th>
            <th className="num">Views</th>
            <th className="num">Likes</th>
            <th className="num">Comments</th>
            <th className="num">Shares</th>
            <th aria-label="Link" />
          </tr>
        </thead>
        <tbody>
          {sent.map((p) => {
            const e = p.engagement;
            return (
              <tr key={p.id}>
                <td>
                  <div className="an-post-cell">
                    <span className="an-post-dot" style={{ background: PLATFORM_COLOR[p.platform] }} />
                    <span className="an-post-icon" title={PLATFORM_LIMITS[p.platform].label}>{PLATFORM_ICON[p.platform]}</span>
                    <div>
                      <span className="an-post-record">{p.recordIdentifier}</span>
                      <span className="an-post-caption" title={p.caption}>{p.caption}</span>
                      {!e && p.engagementNote && <span className="an-post-note"><Info className="w-3 h-3" /> {p.engagementNote}</span>}
                    </div>
                  </div>
                </td>
                <td className="an-post-date">{p.postedAt ? new Date(p.postedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}</td>
                {e ? (
                  <>
                    <td className="num">{fmt(e.views)}</td>
                    <td className="num">{fmt(e.likes)}</td>
                    <td className="num">{fmt(e.comments)}</td>
                    <td className="num">{fmt(e.shares)}</td>
                  </>
                ) : (
                  <td className="num an-post-pending" colSpan={4}>{p.engagementNote ? 'Not available' : 'Not fetched yet'}</td>
                )}
                <td>
                  {p.externalUrl && (
                    <a className="an-post-link" href={p.externalUrl} target="_blank" rel="noreferrer" aria-label="Open the post">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════ the view ══ */

export type AccountState =
  | { status: 'loading'; data?: AccountAnalytics }
  | { status: 'ready'; data: AccountAnalytics }
  | { status: 'error'; error: string; data?: AccountAnalytics };

export interface AnalyticsViewProps {
  role: string | null;
  records: RepositoryRecord[];
  recordsLoading: boolean;
  dispatches: Dispatch[];
  posts: ScheduledPost[];
  accounts: AccountState;
  /** Re-reads account totals and, for staff, per-post engagement. Resolves
   *  to a sentence describing what happened. */
  onSync: () => Promise<string | null>;
  now: number;
}

export function AnalyticsView({
  role, records, recordsLoading, dispatches, posts, accounts, onSync, now,
}: AnalyticsViewProps) {
  const isAdmin = role === 'admin';
  const [editingLayout, setEditingLayout] = useState(false);
  const [tileLayout, setTileLayout] = useState<TileLayout>(() => loadTileLayout());
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const today = useMemo(() => new Date(now).toISOString().slice(0, 10), [now]);

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

  const sync = async () => {
    setSyncing(true);
    setNotice(null);
    try {
      setNotice(await onSync());
    } finally {
      setSyncing(false);
    }
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

  /* ── Governance & safety ────────────────────────────────────────────── */

  /* Every dispatch this reviewer's role can see that was ever flagged
     unsafe. safetyFlag dispatches are refused publication outright by
     canPublishDispatch() regardless of what an admin clicks — this is the
     evidence that the gate has something to gate. */
  const safetyWithheld = useMemo(
    () => dispatches.filter((d) => d.safetyFlag).length,
    [dispatches],
  );

  /* ── 2/3. Social & dissemination ────────────────────────────────────── */

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

  /* One card per platform, always all three — seeing each one even when it
     has zero activity, not just the ones that happen to have posts. */
  const platformBreakdown = useMemo(() => {
    return SOCIAL_PLATFORMS.map((platform) => {
      const mine = posts.filter((p) => p.platform === platform);
      const posted = mine.filter((p) => p.status === 'posted').length;
      const failed = mine.filter((p) => p.status === 'failed').length;
      const pending = mine.filter((p) => {
        const s = effectiveStatus(p);
        return s === 'queued' || s === 'ready';
      }).length;
      const concluded = posted + failed;
      return {
        platform,
        label: PLATFORM_LIMITS[platform].label,
        posted, failed, pending,
        successRate: concluded > 0 ? Math.round((posted / concluded) * 100) : null,
      };
    });
  }, [posts]);

  /* Engagement is never computed here — functions/engagement.js writes it,
     being the only thing with credentials to ask the platforms. */
  const topRecords = useMemo(() => {
    const byRecord = new Map<string, { label: string; value: number }>();
    for (const p of posts) {
      if (p.status !== 'posted' || !p.engagement) continue;
      const e = p.engagement;
      const entry = byRecord.get(p.recordId) ?? { label: p.recordIdentifier, value: 0 };
      entry.value += e.likes + e.comments + e.shares;
      byRecord.set(p.recordId, entry);
    }
    return [...byRecord.values()].filter((r) => r.value > 0).sort((a, b) => b.value - a.value).slice(0, 5);
  }, [posts]);

  const accountList = useMemo(() => {
    const list = accounts.data?.accounts ?? [];
    return [...list].sort((a, b) => PLATFORM_ORDER.indexOf(a.platform) - PLATFORM_ORDER.indexOf(b.platform));
  }, [accounts.data]);

  const audienceAccount = accountList.find((a) => a.available && a.demographics);

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

  /* How long ago each station's most recent record went up — "has anyone
     forgotten Dakshin Gangotri" answered directly, stalest first. */
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
      .sort((a, b) => b.days - a.days);
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

  const thisYear = new Date(now).getUTCFullYear();
  const publishedThisYear = records.filter((r) => r.metadata?.publicationYear === thisYear).length;

  const tileNodes: Record<TileId, ReactNode> = {
    published: (
      <StatTile icon={<Archive className="w-4 h-4" />} label="Published records"
        value={recordsLoading ? '—' : records.length} hint={`${publishedThisYear} in ${thisYear}`} />
    ),
    turnaround: (
      <StatTile icon={<TimerReset className="w-4 h-4" />} label="Average turnaround"
        value={turnaroundDays ? `${turnaroundDays.avg.toFixed(1)}d` : '—'}
        hint={turnaroundDays ? `field to public, over ${turnaroundDays.n} records` : 'no completed records yet'} />
    ),
    backlog: (
      <StatTile icon={<Radio className="w-4 h-4" />} label="Awaiting review" value={backlog.length}
        hint={`${pipeline.raw} unread · ${pipeline.drafted} drafted · ${pipeline.flagged} sent back`} />
    ),
    oldest: (
      <StatTile tone={oldestBacklogDays > 7 ? 'warn' : 'default'} icon={<CalendarClock className="w-4 h-4" />}
        label="Oldest item waiting" value={backlog.length > 0 ? `${oldestBacklogDays}d` : '—'}
        hint={oldestBacklogDays > 7 ? 'over a week — worth a look' : 'within a week'} />
    ),
    safety: (
      <StatTile icon={<ShieldAlert className="w-4 h-4" />} label="Withheld under safety protocol" value={safetyWithheld}
        hint="Never eligible for publication, whatever an admin clicks" />
    ),
    flagged: (
      <StatTile icon={<CheckCircle2 className="w-4 h-4" />} label="Sent back for revision" value={pipeline.flagged}
        hint="With a publisher, following admin notes" />
    ),
    sent: (
      <StatTile icon={<Send className="w-4 h-4" />} label="Posts sent" value={disseminationTotals.posted}
        hint={`${disseminationTotals.pending} waiting in the queue`} />
    ),
    successRate: (
      <StatTile tone={disseminationTotals.successRate !== null && disseminationTotals.successRate < 90 ? 'warn' : 'default'}
        icon={<CheckCircle2 className="w-4 h-4" />} label="Dissemination success rate"
        value={disseminationTotals.successRate !== null ? `${disseminationTotals.successRate}%` : '—'}
        hint={disseminationTotals.failed > 0 ? `${disseminationTotals.failed} failed` : 'no failures'} />
    ),
  };

  const liveNames = accountList.filter((a) => a.available).map((a) => PLATFORM_LIMITS[a.platform].label);
  const syncedAt = accounts.data?.fetchedAt;

  return (
    <div className="ph-page an-page">
      <header className="an-hero">
        <div className="an-hero-text">
          <span className="an-eyebrow">Analytics · NCPOR outreach</span>
          <h1>Outreach dashboard</h1>
          <p>What went out, whether it reached anyone, and whether the archive behind it is healthy.</p>
        </div>
        <div className="an-hero-side">
          <div className={'an-sync-chip' + (accounts.status === 'error' ? ' is-error' : '')}>
            <span className={'an-live-dot' + (accounts.status === 'ready' ? ' is-live' : '')} />
            {accounts.status === 'error'
              ? 'Platform data unavailable'
              : liveNames.length
                ? `Live from ${liveNames.join(' · ')}`
                : accounts.status === 'loading' ? 'Connecting to platforms…' : 'No accounts connected'}
            {syncedAt && <small>synced {new Date(syncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>}
          </div>
          <button type="button" className="an-btn primary" disabled={syncing} onClick={sync}>
            <RefreshCw className={'w-3.5 h-3.5' + (syncing ? ' an-spin' : '')} />
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
        </div>
        <nav className="an-jump" aria-label="Sections">
          <a href="#an-overview">Overview</a>
          <a href="#an-social">Social performance</a>
          <a href="#an-dissemination">Dissemination</a>
          <a href="#an-coverage">Coverage</a>
        </nav>
      </header>

      {notice && <p className="an-notice" role="status">{notice}</p>}

      {/* ── Overview — the stat tiles, admin-arranged ────────────────────── */}
      <Section
        id="an-overview" index="01" title="Overview"
        note={isAdmin
          ? 'Service delivery and governance at a glance. Arrange which numbers lead — saved to this browser only.'
          : 'Service delivery and governance at a glance.'}
        actions={isAdmin && (
          <div className="an-customize-bar">
            {editingLayout && (
              <button type="button" className="an-btn ghost" onClick={resetTileLayout}>
                <RotateCcw className="w-3.5 h-3.5" /> Reset
              </button>
            )}
            <button type="button" className={'an-btn' + (editingLayout ? ' is-active' : '')} onClick={() => setEditingLayout((v) => !v)}>
              <LayoutGrid className="w-3.5 h-3.5" /> {editingLayout ? 'Done' : 'Customize layout'}
            </button>
          </div>
        )}
      >
        <div className="an-tiles">
          {tileLayout.order.map((id, i) => {
            const isHidden = tileLayout.hidden.includes(id);
            if (isHidden && !editingLayout) return null;
            return (
              <div key={id} className={'an-tile-slot' + (isHidden ? ' is-hidden' : '')}>
                {editingLayout && (
                  <div className="an-tile-controls">
                    <span className="an-tile-origin">{TILE_ORIGIN[id]}</span>
                    <div className="an-tile-controls-buttons">
                      <button type="button" onClick={() => toggleTileHidden(id)}
                        aria-label={isHidden ? 'Show this stat' : 'Hide this stat'} title={isHidden ? 'Show this stat' : 'Hide this stat'}>
                        {isHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                      <button type="button" onClick={() => moveTile(id, -1)} disabled={i === 0} aria-label="Move earlier" title="Move earlier">
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" onClick={() => moveTile(id, 1)} disabled={i === tileLayout.order.length - 1} aria-label="Move later" title="Move later">
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
      </Section>

      {/* ── Social performance — the accounts, then the portal's own posts ─ */}
      <Section
        id="an-social" index="02" title="Social performance"
        note="The accounts the portal posts as, read live from each platform — and, separately, how each post sent from here did."
      >
        {accounts.status === 'loading' && !accounts.data ? (
          <div className="an-account-grid">
            {[0, 1, 2].map((i) => <div key={i} className="an-card an-skeleton" />)}
          </div>
        ) : accounts.status === 'error' && !accounts.data ? (
          <p className="an-empty an-card">{accounts.error}</p>
        ) : accounts.data && !accounts.data.configured ? (
          <p className="an-empty an-card">{accounts.data.message ?? 'No publishing account is connected.'}</p>
        ) : (
          <div className={accounts.status === 'loading' ? 'an-refetching' : undefined}>
            <FollowerSplit accounts={accountList} />
            <div className="an-account-grid">
              {accountList.map((a) => <AccountCard key={a.platform} account={a} today={today} />)}
            </div>
            {audienceAccount && <AudiencePanel account={audienceAccount} />}
            <p className="an-caveat">
              <Info className="w-3.5 h-3.5" />
              Account totals cover everything each account posted, not just posts sent from this portal.
              The portal&rsquo;s own posts are measured one by one below.
            </p>
          </div>
        )}

        <div className="an-card an-posts-card">
          <div className="an-card-head">
            <div>
              <h3>Posts sent from the portal</h3>
              <p>Each post&rsquo;s own numbers, pulled from the platform it went to. Where a platform won&rsquo;t report, it says why.</p>
            </div>
          </div>
          <PostTable posts={posts} />
          {topRecords.length > 1 && (
            <div className="an-top-records">
              <h4>Records that drove the most engagement</h4>
              <BarList rows={topRecords} color={SERIES} />
            </div>
          )}
        </div>
      </Section>

      {/* ── Dissemination — did it go out? ───────────────────────────────── */}
      <Section
        id="an-dissemination" index="03" title="Dissemination"
        note="What was scheduled for each platform, and whether it actually went out."
      >
        <div className="an-platform-cards">
          {platformBreakdown.map((p) => {
            const total = p.posted + p.pending + p.failed;
            return (
              <div key={p.platform} className="an-card an-platform-card">
                <div className="an-platform-head">
                  <span className="an-account-badge sm" style={{ background: PLATFORM_COLOR[p.platform] }}>{PLATFORM_ICON[p.platform]}</span>
                  <strong>{p.label}</strong>
                  <span className={'an-rate' + (p.successRate !== null && p.successRate < 90 ? ' is-warn' : '')}>
                    {p.successRate !== null ? `${p.successRate}% delivered` : 'nothing concluded yet'}
                  </span>
                </div>
                <div className="an-status-bar" role="img"
                  aria-label={`${p.posted} sent, ${p.pending} pending, ${p.failed} failed`}>
                  {total === 0 ? <span className="an-status-empty" /> : (
                    <>
                      {p.posted > 0 && <span style={{ flexGrow: p.posted, background: GOOD }} />}
                      {p.pending > 0 && <span style={{ flexGrow: p.pending, background: INK_FAINT }} />}
                      {p.failed > 0 && <span style={{ flexGrow: p.failed, background: BAD }} />}
                    </>
                  )}
                </div>
                <dl className="an-status-legend">
                  <div><dt><span className="an-legend-swatch" style={{ background: GOOD }} />Sent</dt><dd>{p.posted}</dd></div>
                  <div><dt><span className="an-legend-swatch" style={{ background: INK_FAINT }} />Pending</dt><dd>{p.pending}</dd></div>
                  <div><dt><span className="an-legend-swatch" style={{ background: BAD }} />Failed</dt><dd>{p.failed}</dd></div>
                </dl>
              </div>
            );
          })}
        </div>
      </Section>

      {/* ── Coverage & currency ──────────────────────────────────────────── */}
      <Section
        id="an-coverage" index="04" title="Coverage & currency"
        note="What the archive holds, and whether any part of it has gone stale."
      >
        <div className="an-grid">
          <Figure title="What the archive holds" note="Published records by category." headers={['Category', 'Records']} rows={byCategory}>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={byCategory} margin={{ top: 18, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid stroke={INK_FAINT} strokeOpacity={0.16} vertical={false} />
                <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: INK_FAINT, strokeOpacity: 0.3 }} />
                <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} width={32} />
                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} content={<ChartTip unit="records" color={SERIES} />} />
                <Bar dataKey="value" fill={SERIES} radius={[4, 4, 0, 0]} maxBarSize={24}>
                  <LabelList dataKey="value" position="top" fill={INK_DIM} fontSize={11} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Figure>

          <Figure title="Where the work happened" note="Published records by station." headers={['Station', 'Records']} rows={byStation}>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={byStation} layout="vertical" margin={{ top: 8, right: 28, bottom: 4, left: 0 }}>
                <CartesianGrid stroke={INK_FAINT} strokeOpacity={0.16} horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={axisTick} tickLine={false} axisLine={{ stroke: INK_FAINT, strokeOpacity: 0.3 }} />
                <YAxis type="category" dataKey="label" width={120} tick={axisTick} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} content={<ChartTip unit="records" color={SERIES} />} />
                <Bar dataKey="value" fill={SERIES} radius={[0, 4, 4, 0]} maxBarSize={22}>
                  <LabelList dataKey="value" position="right" fill={INK_DIM} fontSize={11} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Figure>
        </div>

        <div className="an-grid an-grid-wide">
          <Figure title="Archive growth" note="Total published records over time, cumulative." headers={['Month', 'Total records']} rows={overTime}>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={overTime} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                <defs>
                  <linearGradient id="anGrowth" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={SERIES} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={SERIES} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={INK_FAINT} strokeOpacity={0.16} vertical={false} />
                <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: INK_FAINT, strokeOpacity: 0.3 }} />
                <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} width={32} />
                <Tooltip cursor={{ stroke: INK_FAINT, strokeOpacity: 0.5 }} content={<ChartTip unit="records in total" color={SERIES} />} />
                <Area type="monotone" dataKey="value" stroke={SERIES} strokeWidth={2} fill="url(#anGrowth)"
                  dot={{ r: 4, fill: SERIES, stroke: '#0d2033', strokeWidth: 2 }} activeDot={{ r: 5 }} />
              </AreaChart>
            </ResponsiveContainer>
          </Figure>

          <div className="an-card an-freshness">
            <h3>Station freshness</h3>
            <p>Days since each station&rsquo;s most recent published record — stalest first.</p>
            {stationFreshness.length === 0 ? <p className="an-empty">Nothing published yet.</p> : (
              <ul className="an-fresh-list">
                {stationFreshness.map((s) => {
                  const state = s.days > 90 ? 'stale' : s.days > 30 ? 'aging' : 'fresh';
                  return (
                    <li key={s.station}>
                      <span className="an-fresh-name">{STATION_LABEL[s.station.toLowerCase()] ?? s.station}</span>
                      <span className="an-fresh-date">{new Date(s.publishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                      <span className={`an-badge is-${state}`}>
                        {state === 'fresh' ? <CheckCircle2 className="w-3 h-3" /> : <CalendarClock className="w-3 h-3" />}
                        {s.days}d · {state === 'fresh' ? 'current' : state === 'aging' ? 'aging' : 'stale'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </Section>
    </div>
  );
}

/* ══════════════════════════════════════════════════════ the container ══ */

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
  // renders of the same props. A dashboard has no need for "now" to tick
  // live, so it is captured once, on mount.
  const [now] = useState(() => Date.now());
  const [accounts, setAccounts] = useState<AccountState>({ status: 'loading' });

  useEffect(() => {
    if (!user || !canView) return;
    let live = true;
    fetchAccountAnalytics(false).then((r) => {
      if (!live) return;
      setAccounts(r.ok ? { status: 'ready', data: r.data } : { status: 'error', error: r.reason });
    });
    return () => { live = false; };
  }, [user, canView]);

  const isStaff = role === 'admin' || role === 'publisher';

  const onSync = async (): Promise<string | null> => {
    setAccounts((prev) => ({ status: 'loading', data: prev.data }));
    const [acct, eng] = await Promise.all([
      fetchAccountAnalytics(true),
      // Per-post engagement writes to Firestore, so only staff may trigger it.
      isStaff ? refreshEngagement() : Promise.resolve(null),
    ]);
    setAccounts((prev) => (acct.ok
      ? { status: 'ready', data: acct.data }
      : { status: 'error', error: acct.reason, data: prev.data }));

    if (!eng) return acct.ok ? 'Account totals refreshed.' : acct.reason;
    if (!eng.ok) return eng.reason;
    const r = eng.result;
    if (r.connected.length === 0) return r.message ?? 'No platform credentials configured.';
    return `Account totals refreshed. Checked ${r.checked} sent post${r.checked === 1 ? '' : 's'}, updated ${r.updated}.`;
  };

  if (!user || (!roleLoading && !canView)) {
    return (
      <div className="ph-page">
        <p className="an-empty">
          The outreach dashboard is available to publishers and admins, and to
          anyone else an admin has granted analytics access.
        </p>
      </div>
    );
  }

  return (
    <AnalyticsView
      role={role}
      records={records}
      recordsLoading={recordsLoading}
      dispatches={dispatches}
      posts={posts}
      accounts={accounts}
      onSync={onSync}
      now={now}
    />
  );
}
