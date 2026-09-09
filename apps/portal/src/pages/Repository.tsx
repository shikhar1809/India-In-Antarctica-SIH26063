/* ═══════════════════════════════════════════════ knowledge repository ══
 *
 * The whole page is one component: the hero carousel IS the repository,
 * and everything that used to sit around it in stacked panels — search,
 * category filters, the record's own detail view, editing, and the admin
 * import — is overlaid on it instead.
 *
 * Both collections are reachable from the same browser:
 *   Deposits   — documents uploaded by scientists (useDocuments)
 *   Published  — what is live on the public site (usePublicArchive)
 * They are different shapes, so each is projected onto one `Entry` view
 * model and the rest of the page only ever deals in that.
 */

import { useMemo, useState } from 'react';
import { Download, Pencil, Sparkles, X, Eye, Search, ExternalLink } from 'lucide-react';
import { HeroCarousel, type HeroCarouselItem } from '../components/ui/hero-carousel';
import { useDocuments } from '../hooks/useDocuments';
import { usePublicArchive } from '../hooks/usePublicArchive';
import { useAuth } from '../context/AuthContext';
import { useRole, archiveAccessStationKeys } from '../hooks/useRole';
import { CATEGORIES } from '../types';
import type { DocumentStatus, ResearchDocument } from '../types';
import type { RepositoryRecord } from '../repository/contract';
import { HISTORICAL_RECORDS } from '../repository/historicalRecords';
import { publishRecord } from '../repository/publish';
import { RecordEditor } from '../components/RecordEditor';
import { DepositEditor } from '../components/DepositEditor';
import { prepare, semanticRank, type Prepared } from '../repository/semanticSearch';
import './Library.css';
import './RepositoryStudio.css';

/* Station palettes as stops rather than CSS gradient strings, so the same
   definition can paint both a card cover (SVG) and the backdrop accent. */
const STATION_STOPS: Record<string, [string, string, string]> = {
  Maitri:             ['#0d2b3e', '#1a4a6e', '#2f9fc9'],
  Bharati:            ['#2a1800', '#6b3600', '#c8762a'],
  'Dakshin Gangotri': ['#0d2b1a', '#1a5030', '#4a9b6f'],
  Other:              ['#1a1f2e', '#2a3448', '#4a6080'],
  /* published records key their station differently */
  maitri:             ['#0d2b3e', '#1a4a6e', '#2f9fc9'],
  bharati:            ['#2a1800', '#6b3600', '#c8762a'],
  dakshin:            ['#0d2b1a', '#1a5030', '#4a9b6f'],
  ship:               ['#101a2e', '#22375c', '#5a7fb0'],
  ncpor:              ['#1a1f2e', '#2a3448', '#4a6080'],
};

const STATUS_LABEL: Record<DocumentStatus, string> = {
  submitted: 'Awaiting review',
  published: 'Published',
  rejected: 'Not accepted',
};

/** Records uploaded before the review gate existed have no status field.
 *  They were already visible, so treating them as published keeps the
 *  catalogue honest rather than retroactively hiding them. */
function statusOf(s: DocumentStatus | undefined): DocumentStatus {
  return s ?? 'published';
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function coordStr(lat: number | null, lon: number | null): string | null {
  if (lat == null || lon == null) return null;
  return `${Math.abs(lat).toFixed(3)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(3)}°${lon >= 0 ? 'E' : 'W'}`;
}

function mapsUrl(lat: number, lon: number) {
  return `https://www.google.com/maps?q=${lat},${lon}`;
}

/* Real Antarctic photography rather than generated gradients — the same
   Wikimedia Commons set the public site's gallery uses (every file free-
   licensed, CC BY / CC BY-SA or US-government public domain; per-image
   attribution lives in apps/public-site/src/lib/galleryArt.ts CREDITS).
   Copied into this app's public/photos rather than hotlinked, so the
   portal does not depend on the public site being up. */
const PHOTOS = {
  maitriAerial: '/photos/maitri-aerial.jpg',
  maitriFlag: '/photos/maitri-flag.jpg',
  bharati: '/photos/bharati-station.jpg',
  dakshin: '/photos/dakshin-station.jpg',
  dakshinAerial: '/photos/dakshin-aerial.jpg',
  lake: '/photos/lake-priyadarshini.jpg',
  aurora: '/photos/aurora.jpg',
  auroraPanorama: '/photos/aurora-panorama.jpg',
  icebreaker: '/photos/icebreaker.jpg',
  fieldCamp: '/photos/field-camp.jpg',
} as const;

/* Pick the photograph that actually depicts the record: its station where
   one is shown, otherwise a scene matching the subject. `seed` spreads
   picks across the alternatives for a station so a run of Maitri records
   is not the same frame repeated down the filmstrip. */
function photoFor(stationKey: string, subject: string, seed: number): string {
  const s = subject.toLowerCase();
  if (/aurora|magnet|ionospher|solar|space|geomagnet/.test(s)) {
    return seed % 2 ? PHOTOS.auroraPanorama : PHOTOS.aurora;
  }
  if (/vessel|ship|voyage|logistic|cargo|resupply|icebreaker|sea route/.test(s)) {
    return PHOTOS.icebreaker;
  }
  if (/lake|freshwater|limnolog|hydrolog/.test(s)) return PHOTOS.lake;

  switch (stationKey) {
    case 'Maitri': case 'maitri': {
      const opts = [PHOTOS.maitriAerial, PHOTOS.lake, PHOTOS.maitriFlag];
      return opts[seed % opts.length]!;
    }
    case 'Bharati': case 'bharati':
      return PHOTOS.bharati;
    case 'Dakshin Gangotri': case 'dakshin':
      return seed % 2 ? PHOTOS.dakshinAerial : PHOTOS.dakshin;
    case 'ship':
      return PHOTOS.icebreaker;
    default: {
      const opts = [PHOTOS.fieldCamp, PHOTOS.icebreaker, PHOTOS.auroraPanorama];
      return opts[seed % opts.length]!;
    }
  }
}

/* Titles read better broken near the middle — the carousel reveals each
   line separately. Short ones are left alone. */
function balanceTitle(title: string): string {
  const flat = title.replace(/\s+/g, ' ').trim();
  if (flat.length <= 26) return flat;
  const words = flat.split(' ');
  if (words.length < 2) return flat;
  const mid = flat.length / 2;
  let best = 1;
  let bestDist = Infinity;
  for (let i = 1; i < words.length; i++) {
    const d = Math.abs(words.slice(0, i).join(' ').length - mid);
    if (d < bestDist) { bestDist = d; best = i; }
  }
  let head = words.slice(0, best);
  let tail = words.slice(best);
  if (tail.length > 1 && /^[—–-]$/.test(tail[0]!)) { head = [...head, tail[0]!]; tail = tail.slice(1); }
  return `${head.join(' ')}\n${tail.join(' ')}`;
}

/* ── one view model for both collections ───────────────────────────── */

type Fact = { label: string; value: string; href?: string };

type Entry = {
  id: string;
  title: string;
  stationKey: string;
  stationLabel: string;
  category: string;
  image: string;
  accent: string;
  badges: { text: string; tone?: 'warn' | 'cyan' }[];
  paragraphs: string[];
  facts: Fact[];
  file?: { name: string; url: string; size?: number } | null;
  lockedNote?: string | null;
  /* whichever collection this came from — each has its own editor */
  record?: RepositoryRecord;
  deposit?: ResearchDocument;
  /* pre-tokenised, concept-expanded index — see semanticSearch.ts */
  search: Prepared;
};

function depositToEntry(d: ResearchDocument, seed = 0): Entry {
  const status = statusOf(d.status);
  const embargoed = !!(d.embargo && d.embargo !== 'none');
  const coords = coordStr(d.lat ?? null, d.lon ?? null);
  const observed = d.observedAt
    ? new Date(d.observedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : new Date(d.createdAt).toLocaleDateString();
  const stops = STATION_STOPS[d.station] ?? STATION_STOPS.Other!;

  const facts: Fact[] = [
    { label: 'Station', value: d.station },
    ...(coords ? [{ label: 'Coordinates', value: coords, href: mapsUrl(d.lat!, d.lon!) }] : []),
    ...(d.instrument ? [{ label: 'Instrument', value: d.instrument }] : []),
    { label: 'Deposited by', value: d.authorName },
    { label: 'Observed', value: observed },
    ...(d.license ? [{ label: 'Licence', value: d.license }] : []),
  ];

  return {
    id: d.id,
    title: d.title,
    stationKey: d.station,
    stationLabel: d.station,
    category: d.category,
    image: photoFor(d.station, `${d.title} ${d.category} ${d.instrument ?? ''}`, seed),
    accent: stops[2],
    badges: [
      { text: d.category },
      ...(d.license ? [{ text: d.license }] : []),
      ...(embargoed ? [{ text: 'Embargoed', tone: 'warn' as const }] : []),
      ...(status !== 'published' ? [{ text: STATUS_LABEL[status], tone: 'cyan' as const }] : []),
    ],
    paragraphs: [d.description],
    facts,
    file: d.fileUrl && !embargoed ? { name: d.fileName, url: d.fileUrl, size: d.fileSizeBytes } : null,
    lockedNote: embargoed ? `Embargoed — available ${d.embargo}` : null,
    deposit: d,
    search: prepare([
      { text: d.title, weight: 3 },
      { text: d.description, weight: 1.5 },
      { text: `${d.category} ${d.station} ${d.instrument ?? ''} ${d.authorName}`, weight: 1 },
    ]),
  };
}

function publishedToEntry(r: RepositoryRecord, seed = 0): Entry {
  const stops = STATION_STOPS[r.station] ?? STATION_STOPS.ncpor!;
  /* A published record's own key-facts table usually already carries Station
     and Year, better presented than the raw cover-station key ('bharati' vs
     'Bharati'). Collapse by label so the panel never shows the same fact
     twice, letting the record's own wording win the slot it was seeded in. */
  const factMap = new Map<string, Fact>();
  const put = (f: Fact) => {
    const key = f.label.trim().toLowerCase();
    const existing = factMap.get(key);
    factMap.set(key, existing ? { ...existing, ...f } : f);
  };
  put({ label: 'Identifier', value: r.metadata.identifier });
  put({ label: 'Station', value: r.station });
  put({ label: 'Year', value: r.year });
  for (const f of r.table ?? []) put({ label: f.label, value: f.value });
  if (r.credit) put({ label: 'Credit', value: r.credit });
  if (r.metadata.license) put({ label: 'Licence', value: r.metadata.license });
  const facts: Fact[] = [...factMap.values()];
  return {
    id: r.id,
    title: r.title,
    stationKey: r.station,
    stationLabel: r.station,
    category: r.kind,
    image: r.photoUrls?.[0] || photoFor(r.station, `${r.title} ${r.kind} ${r.pills.join(' ')}`, seed),
    accent: stops[2],
    badges: [{ text: r.kind }, { text: 'Live', tone: 'cyan' as const }, ...r.pills.map((p) => ({ text: p }))],
    paragraphs: r.body,
    facts,
    file: null,
    lockedNote: null,
    record: r,
    search: prepare([
      { text: r.title, weight: 3 },
      { text: r.body.join(' '), weight: 1.5 },
      { text: `${r.kind} ${r.station} ${r.year} ${r.metadata.identifier} ${r.pills.join(' ')}`, weight: 1 },
    ]),
  };
}

/* ── page ──────────────────────────────────────────────────────────── */

const PUBLIC_SITE_URL = 'https://iia-public.web.app';

type Source = 'deposits' | 'published';

export function Repository() {
  const { user } = useAuth();
  const { docs, loading: docsLoading } = useDocuments();
  const { records, loading: recsLoading } = usePublicArchive();
  const { role, permissions, loading: roleLoading } = useRole();

  const [source, setSource] = useState<Source>('deposits');
  const [activeCategory, setActiveCategory] = useState('All');
  const [q, setQ] = useState('');
  const [index, setIndex] = useState(0);
  const [panelOpen, setPanelOpen] = useState(true);
  const [editing, setEditing] = useState<RepositoryRecord | null>(null);
  const [editingDeposit, setEditingDeposit] = useState<ResearchDocument | null>(null);

  const isAdmin = role === 'admin';
  const activeSource: Source = isAdmin ? source : 'deposits';
  const loading = activeSource === 'deposits' ? docsLoading : recsLoading;

  // null = every station; an admin can scope someone (typically a site
  // manager) down to specific stations on the Access page. Matched against
  // both station vocabularies an entry might carry — see
  // archiveAccessStationKeys.
  const allowedStations = useMemo(
    () => archiveAccessStationKeys(permissions.archiveAccess), [permissions.archiveAccess],
  );

  const entries = useMemo(() => {
    const base = activeSource === 'deposits'
      ? docs.map((d, i) => depositToEntry(d, i))
      : records.map((r, i) => publishedToEntry(r, i));
    const inStation = allowedStations
      ? base.filter((e) => allowedStations.has(e.stationKey.toLowerCase()))
      : base;
    const inCategory = activeCategory === 'All'
      ? inStation
      : inStation.filter((e) => e.category === activeCategory);
    // Ranked, not filtered: with a query the strip is ordered by relevance,
    // so the closest record is the one already in focus.
    return semanticRank(inCategory, q, (e) => e.search).map((r) => r.item);
  }, [activeSource, docs, records, q, activeCategory, allowedStations]);

  const safeIndex = Math.min(index, Math.max(0, entries.length - 1));
  const active = entries[safeIndex];

  /* The public site's address for whatever is open, or null when there
   * isn't one yet. A record viewed on the Published tab is by definition
   * live (it came from usePublicArchive — the same collection
   * iia-public.web.app reads), so its own identifier always resolves.
   *
   * A deposit is different: `documents/{id}` is a submission, not a
   * publication, and only becomes visible on the public site the moment an
   * admin publishes it into `publicArchive/{id}` — same id, per
   * documentToRepositoryRecord() in repository/publish.ts. So a deposit's
   * link is found by matching that id against `records`, not assumed —
   * showing a button that 404s would be worse than showing none. */
  const activePublicUrl = useMemo(() => {
    if (active?.record) {
      return `${PUBLIC_SITE_URL}/archive/${active.record.metadata?.identifier || active.record.id}`;
    }
    if (active?.deposit) {
      const published = records.find((r) => r.id === active.deposit!.id);
      return published ? `${PUBLIC_SITE_URL}/archive/${published.metadata?.identifier || published.id}` : null;
    }
    return null;
  }, [active, records]);

  const editActive = () => {
    if (active?.record) setEditing(active.record);
    else if (active?.deposit) setEditingDeposit(active.deposit);
  };

  const items: HeroCarouselItem[] = useMemo(
    () => entries.map((e) => ({
      id: e.id,
      title: balanceTitle(e.title),
      image: e.image,
      credit: e.category,
      meta: [e.stationLabel],
      accent: e.accent,
    })),
    [entries],
  );

  if (!user || (!roleLoading && permissions.archiveAccess === 'none')) {
    return (
      <main className="ph-page">
        <p className="fld-empty">Archive access has been turned off for this account. Ask an admin to restore it.</p>
      </main>
    );
  }

  return (
    <>
      <div className={'rs-page' + (active && panelOpen ? ' has-panel' : '')}>
        {/* No `brand` passed to the carousel: it centres its wordmark into
            the very strip the studio's own title bar occupies, so setting it
            printed "Knowledge Repository" twice, overlapping. */}
        {entries.length > 0 && (
          <HeroCarousel
            items={items}
            index={safeIndex}
            onIndexChange={setIndex}
            className="rs-stage"
          />
        )}

        {loading && (
          <div className="rs-state"><p>Loading the repository…</p></div>
        )}

        {!loading && entries.length === 0 && (
          <div className="rs-state">
            <p>
              {activeSource === 'deposits'
                ? (docs.length === 0
                    ? 'Nothing deposited yet — sign in and be the first to contribute a record.'
                    : 'No records match that search.')
                : (records.length === 0
                    ? 'Nothing published to the public site yet.'
                    : 'No published records match that search.')}
            </p>
          </div>
        )}

        <div className="rs-overlay">
          <div className="rs-top">
            <div className="rs-title">
              <strong>Archive</strong>
              <span>National Centre for Polar and Ocean Research</span>
            </div>

            {isAdmin && (
              <div className="rs-seg" role="radiogroup" aria-label="Collection">
                <button
                  type="button" role="radio" aria-checked={activeSource === 'deposits'}
                  className={activeSource === 'deposits' ? 'is-active' : ''}
                  onClick={() => { setSource('deposits'); setIndex(0); }}
                >
                  Deposits
                </button>
                <button
                  type="button" role="radio" aria-checked={activeSource === 'published'}
                  className={activeSource === 'published' ? 'is-active' : ''}
                  onClick={() => { setSource('published'); setIndex(0); }}
                >
                  Published
                </button>
              </div>
            )}

            <span className="rs-count">
              {entries.length} record{entries.length === 1 ? '' : 's'}
            </span>
          </div>

          <div className="rs-top rs-searchrow-outer">
            <div className="rs-searchrow">
              <div className="rs-searchwrap">
                <Search size={15} strokeWidth={2} />
                <input
                  className="rs-search"
                  placeholder="Search by meaning — try “penguins”, “weather”, “ice core”…"
                  value={q}
                  onChange={(e) => { setQ(e.target.value); setIndex(0); }}
                />
                {q && (
                  <button
                    type="button"
                    className="rs-search-clear"
                    aria-label="Clear search"
                    onClick={() => { setQ(''); setIndex(0); }}
                  >
                    <X size={13} strokeWidth={2.5} />
                  </button>
                )}
              </div>
              {q.trim() && entries.length > 0 && (
                <span className="rs-relevance">Ranked by relevance</span>
              )}
            </div>

            <div className="rs-cats">
              {['All', ...CATEGORIES].map((c) => (
                <button
                  key={c}
                  type="button"
                  className={'rs-cat' + (activeCategory === c ? ' is-active' : '')}
                  onClick={() => { setActiveCategory(c); setIndex(0); }}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="rs-actions">
            {isAdmin && <HistoricalImportAction />}
            {active && !panelOpen && (
              <button type="button" className="rs-btn" onClick={() => setPanelOpen(true)}>
                <Eye size={14} strokeWidth={2} /> View record
              </button>
            )}
            {(active?.record || active?.deposit) && (
              <button type="button" className="rs-btn primary" onClick={editActive}>
                <Pencil size={14} strokeWidth={2} /> Edit {active.record ? 'record' : 'deposit'}
              </button>
            )}
          </div>
        </div>

        {active && panelOpen && (
          <aside className="rs-panel" aria-label="Record details">
            <div className="rs-panel-head">
              <h2>{active.title}</h2>
              <button
                type="button"
                className="rs-panel-close"
                aria-label="Close record details"
                onClick={() => setPanelOpen(false)}
              >
                <X size={15} strokeWidth={2.5} />
              </button>
            </div>

            <div className="rs-panel-body">
              {active.badges.length > 0 && (
                <div className="rs-badges">
                  {active.badges.map((b, i) => (
                    <span key={`${b.text}-${i}`} className={'rs-badge' + (b.tone ? ` ${b.tone}` : '')}>
                      {b.text}
                    </span>
                  ))}
                </div>
              )}

              {active.paragraphs.filter(Boolean).map((p, i) => (
                <p key={i} className="rs-desc">{p}</p>
              ))}

              {active.facts.length > 0 && (
                <dl className="rs-facts">
                  {active.facts.map((f, i) => (
                    <div key={`${f.label}-${i}`} className="rs-fact">
                      <dt>{f.label}</dt>
                      <dd>
                        {f.href
                          ? <a href={f.href} target="_blank" rel="noreferrer">{f.value}</a>
                          : f.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}

              {active.file && (
                <a className="rs-file" href={active.file.url} target="_blank" rel="noreferrer">
                  <Download size={13} strokeWidth={2.5} />
                  {active.file.name}
                  {active.file.size ? ` · ${formatBytes(active.file.size)}` : ''}
                </a>
              )}

              {active.lockedNote && (
                <span className="rs-file locked">🔒 {active.lockedNote}</span>
              )}

              {(active.record || active.deposit) && (
                <button type="button" className="rs-panel-edit" onClick={editActive}>
                  <Pencil size={14} strokeWidth={2} />
                  Edit this {active.record ? 'record' : 'deposit'}
                </button>
              )}

              {/* Only for something actually live — see activePublicUrl's
                  own comment. A deposit still in review has nothing to
                  open, so the button is absent rather than disabled: a
                  greyed-out button invites "why can't I click this" more
                  than no button does. */}
              {activePublicUrl && (
                <a
                  className="rs-panel-edit rs-panel-viewsite"
                  href={activePublicUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink size={14} strokeWidth={2} />
                  View on the public site
                </a>
              )}
            </div>
          </aside>
        )}
      </div>

      {editingDeposit && (
        <DepositEditor
          deposit={editingDeposit}
          onClose={() => setEditingDeposit(null)}
          onSaved={() => setEditingDeposit(null)}
        />
      )}

      {editing && (
        <RecordEditor
          record={editing}
          onClose={() => setEditing(null)}
          onSaved={() => setEditing(null)}
        />
      )}
    </>
  );
}

/* ─────────────────────────────────────────────── historical import ──
 * India's Antarctic programme has a record going back to 1981, and until
 * now it lived as a hardcoded list inside the public website's source.
 * Importing it into the same collection everything else publishes to means
 * the public archive is one live repository rather than a live page with a
 * static list bolted underneath it. Admin-only, and safe to run twice —
 * each record has a fixed id, so a second run overwrites rather than
 * duplicates. Now a control in the studio's action bar. */
function HistoricalImportAction() {
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const run = async () => {
    setState('working');
    setMessage('');
    try {
      let n = 0;
      for (const rec of HISTORICAL_RECORDS) {
        await publishRecord(rec);
        n++;
      }
      setState('done');
      setMessage(`Refreshed ${n} historical records.`);
    } catch (err) {
      setState('error');
      setMessage(err instanceof Error ? err.message : 'Import failed.');
    }
  };

  return (
    <>
      {message && <span className={'rs-admin-msg' + (state === 'error' ? ' error' : '')}>{message}</span>}
      <button type="button" className="rs-btn" onClick={run} disabled={state === 'working'}>
        <Sparkles size={14} strokeWidth={2} />
        {state === 'working' ? 'Refreshing…' : state === 'done' ? 'Refreshed' : 'Refresh records'}
      </button>
    </>
  );
}
