import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import BookShelf from '../components/ui/book-shelf'
import type { BookShelfHandle } from '../components/ui/book-shelf'
import { ArcticMapBackground } from '../components/ui/arctic-map-pattern'
import { RecordChart, TemperatureTrend } from '../components/RecordChart'
import { CitedParagraph, SourceList } from '../components/ui/citation'
import { useRepository, temperatureSeries, CATEGORY_LABELS, STATION_LABELS } from '../api/repository'
import { resolveCitations } from '../repository/citations'
import type { RepositoryRecord, CoverCategory, ResourceType } from '../repository/contract'
import { RECORDS } from '../data/archiveData'
import './Archive.css'

/* ── Static fallback ─────────────────────────────────────────────────────
 * The live archive reads from Firestore. Until records are published there,
 * we surface the curated historical catalogue so the page is never empty.
 * Live Firestore records replace these the moment they arrive.             */

const STATIC_PHOTOS: Record<string, string> = {
  e0: '/photos/dakshin-aerial.jpg',
  e1: '/photos/maitri-aerial.jpg',
  e2: '/photos/bharati-station.jpg',
  m0: '/photos/maitri-flag.jpg',
  d1: '/photos/lake-priyadarshini.jpg',
  d2: '/photos/maitri-aerial.jpg',
  d3: '/photos/bharati-station.jpg',
  p1: '/photos/bharati-station.jpg',
  p2: '/photos/maitri-flag.jpg',
  s0: '/photos/icebreaker.jpg',
}

function catToResourceType(cat: string): ResourceType {
  switch (cat) {
    case 'dataset': return 'Dataset'
    case 'publication': return 'Publication'
    case 'media': return 'Image'
    case 'institution': return 'Institutional'
    default: return 'Report'
  }
}

const STATIC_REPOSITORY_RECORDS: RepositoryRecord[] = RECORDS.map((r) => ({
  id: r.id,
  cat: r.cat,
  kind: r.kind,
  title: r.title,
  station: r.station,
  year: r.year,
  pills: r.pills,
  body: r.body,
  table: r.table?.map(([label, value]) => ({ label, value })),
  credit: r.credit,
  photoUrls: STATIC_PHOTOS[r.id] ? [STATIC_PHOTOS[r.id]] : [],
  videoUrl: null,
  measurements: [],
  chart: undefined,
  metadata: {
    identifier: `IIA-HIST-${r.id.toUpperCase()}`,
    creators: [{ name: 'NCPOR', affiliation: 'National Centre for Polar and Ocean Research' }],
    publisher: 'NCPOR' as const,
    publicationYear: parseInt(r.year) || 0,
    resourceType: catToResourceType(r.cat),
    station: r.station,
    spatial: { lat: null, lon: null, elevationM: null, datum: 'WGS84' as const, accuracyM: null },
    temporal: { observedAt: 0 },
    license: 'CC BY 4.0',
    rights: 'Open Access',
    instrument: null,
    method: null,
    provenance: { sourceType: 'historical' as const, sourceId: r.id, approvedBy: 'system', approvedAt: 0 },
  },
  publishedAt: 0,
}))

export default function Archive() {
  const navigate = useNavigate()
  const { id: deepLinkId } = useParams<{ id: string }>()
  const { records: liveRecords, loading, error } = useRepository()
  // Show live Firestore records when available; fall back to the curated
  // historical catalogue so the page is never empty while Firestore loads.
  const records = liveRecords.length > 0 ? liveRecords : STATIC_REPOSITORY_RECORDS
  const [index, setIndex] = useState(0)
  const [filter, setFilter] = useState<CoverCategory | 'all'>('all')
  const [menuOpen, setMenuOpen] = useState(false)
  // PS5 flow: 'selector' = bookshelf screen, 'detail' = record detail screen
  const [view, setView] = useState<'selector' | 'detail'>('selector')
  const [transitioning, setTransitioning] = useState(false)
  const shelfApi = useRef<BookShelfHandle>(null)

  const trend = useMemo(() => temperatureSeries(records), [records])

  // /archive/:id lands straight on that record's detail view. `records`
  // starts as the static fallback and is later REPLACED (not merged) by
  // whatever Firestore returns, so a static-only id can stop existing in
  // `records` after that swap. Locking onto a numeric index at match time
  // and trusting it afterwards showed the wrong record once that swap
  // happened — the id it was found at got reused by an unrelated live
  // record. Looking the id up fresh on every render sidesteps that: while
  // the deep link is "in control" the detail view's content comes straight
  // from `records.find(id)`, never from a remembered position.
  const userNavigated = useRef(false)
  const deepLinkActive = !!deepLinkId && !userNavigated.current
  useEffect(() => {
    if (!deepLinkActive) return
    if (records.some((r) => r.id === deepLinkId)) setView('detail')
  }, [deepLinkActive, deepLinkId, records])

  const safeIndex = Math.min(index, Math.max(0, records.length - 1))
  const deepLinkRecord = deepLinkActive ? records.find((r) => r.id === deepLinkId) : undefined
  const active = deepLinkRecord ?? records[safeIndex]

  const jumpToCategory = (cat: CoverCategory | 'all') => {
    userNavigated.current = true
    setFilter(cat)
    setMenuOpen(false)
    if (cat === 'all') return
    const hit = records.findIndex((r) => r.cat === cat)
    if (hit >= 0) shelfApi.current?.goTo(hit)
  }

  const transition = (to: 'selector' | 'detail', i?: number) => {
    if (i !== undefined) setIndex(i)
    setTransitioning(true)
    window.scrollTo({ top: 0, behavior: 'instant' })
    setTimeout(() => {
      setView(to)
      setTransitioning(false)
    }, 700)
  }

  const openRecordById = (id: string) => {
    userNavigated.current = true
    const i = records.findIndex((r) => r.id === id)
    if (i >= 0) transition('detail', i)
  }
  const backToSelector = () => {
    userNavigated.current = true
    // Drop the deep-link id from the URL so a refresh or a re-visit of this
    // exact link doesn't immediately snap back into detail view.
    if (deepLinkId) navigate('/archive', { replace: true })
    transition('selector')
  }

  return (
    // data-* attributes are the E2E's stable grip on this page. The carousel
    // itself is styled with utility classes that move whenever the design
    // does, so asserting against those made the test fail on cosmetic edits
    // rather than on real regressions. These three say what the page is
    // actually showing, and nothing else depends on them.
    <div
      className="arch2-page"
      data-view={view}
      data-record-count={records.length}
      data-active-record={active?.id ?? ''}
    >
      <ArcticMapBackground />

      {/* ══════════════════ SELECTOR SCREEN ══════════════════ */}
      {view === 'selector' && (
        <div className="arch2-selector-screen">
          {/* The 3D bookshelf — same component and same data as the
              homepage's "Access Knowledge Base" section, so browsing here
              and browsing there are literally the same UI. */}
          <div className="arch2-hero">
            {/* Back / brand / menu bar. Previously rendered inside
                HeroCarousel via its brand/onBack/onMenu props; now that the
                shelf owns the stage, this is Archive's own overlay so the
                shelf component stays free of any one host page's chrome. */}
            <div className="arch2-topbar">
              <button type="button" className="arch2-topbar-btn" onClick={() => navigate('/')}>
                <span aria-hidden>↖</span> Back
              </button>
              <span className="arch2-brand arch2-topbar-brand">
                <img src="/logo.png" alt="" className="arch2-brand-mark" />
                Knowledge Repository
              </span>
              <button type="button" className="arch2-topbar-btn" onClick={() => setMenuOpen((o) => !o)}>
                Menu <span aria-hidden>☰</span>
              </button>
            </div>

            {records.length > 0 ? (
              <BookShelf
                records={records}
                variant="embedded"
                onOpenRecord={openRecordById}
                apiRef={shelfApi}
              />
            ) : (
              <div className="arch2-hero-fallback">
                <span className="arch2-brand">
                  <img src="/logo.png" alt="" className="arch2-brand-mark" />
                  Knowledge Repository
                </span>
                <h1>
                  {loading
                    ? 'Opening the repository…'
                    : error
                      ? 'The repository is unreachable'
                      : 'Nothing published yet'}
                </h1>
                <p>
                  {loading
                    ? 'Fetching everything NCPOR has published.'
                    : error
                      ? 'We could not reach the record store just now. Please try again in a moment.'
                      : 'Records appear here the moment a station report is approved for publication.'}
                </p>
                <Link to="/" className="arch2-menu-link">Back to home</Link>
              </div>
            )}

            {menuOpen && (
              <>
                <button
                  type="button"
                  className="arch2-menu-scrim"
                  aria-label="Close menu"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="arch2-menu" role="menu">
                  <Link to="/" className="arch2-menu-link" role="menuitem">Home</Link>
                  <Link to="/ask" className="arch2-menu-link" role="menuitem">Ask a Scientist</Link>
                  <div className="arch2-menu-divider" />
                  <span className="arch2-menu-label">Jump to</span>
                  {CATEGORY_LABELS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      role="menuitem"
                      className={`arch2-menu-item ${filter === c.id ? 'is-active' : ''}`}
                      onClick={() => jumpToCategory(c.id)}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

        </div>
      )}

      {/* ══════════════════ DETAIL SCREEN ══════════════════ */}
      {view === 'detail' && active && (
        <main className="arch2-body arch2-detail-screen">
          {/* Back button */}
          <button type="button" className="arch2-back-btn" onClick={backToSelector}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Knowledge Repository
          </button>

          <section className="arch2-detail" aria-live="polite">
            <div className="arch2-detail-head">
              <span className="arch2-kind">{active.kind}</span>
              <span className="arch2-station">{STATION_LABELS[active.station] ?? 'NCPOR'}</span>
              <span className="arch2-year">{active.year}</span>
            </div>
            <h2 className="arch2-detail-title">{active.title.replace(/\n/g, ' ')}</h2>
            <div className="arch2-pills">
              {active.pills.map((p) => (
                <span key={p} className="arch2-pill">{p}</span>
              ))}
            </div>

            <div className="arch2-detail-grid">
              <div className="arch2-detail-body">
                {cited.paragraphs.map((spans, i) => (
                  <CitedParagraph
                    key={i}
                    spans={spans}
                    sourceById={sourceById}
                    numberOf={cited.numberOf}
                  />
                ))}
                {active.credit ? <p className="arch2-credit">{active.credit}</p> : null}
              </div>
              {active.table ? (
                <table className="arch2-detail-table">
                  <tbody>
                    {active.table.map((f, i) => (
                      <tr key={`${f.label}-${i}`}>
                        <th>{f.label}</th>
                        <td>{f.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </div>

            {active.chart ? (
              <div className="arch2-chart">
                <RecordChart chart={active.chart} />
              </div>
            ) : null}

            {active.videoUrl ? (
              <video className="arch2-video" src={active.videoUrl} controls preload="metadata" />
            ) : null}

            {active.metadata ? (
              <details className="arch2-meta">
                <summary>Citation and metadata</summary>
                <dl>
                  <dt>Identifier</dt><dd>{active.metadata.identifier}</dd>
                  <dt>Collected by</dt><dd>{active.metadata.creators?.map((c) => c.name).join(', ')}</dd>
                  {active.metadata.publishedIn ? (<><dt>Published in</dt><dd>{active.metadata.publishedIn}</dd></>) : null}
                  <dt>Published by</dt><dd>{active.metadata.publisher}</dd>
                  <dt>Type</dt><dd>{active.metadata.resourceType}</dd>
                  {active.metadata.spatial?.lat !== null && active.metadata.spatial?.lat !== undefined ? (
                    <>
                      <dt>Position</dt>
                      <dd>
                        {Math.abs(active.metadata.spatial.lat).toFixed(4)}° {active.metadata.spatial.lat < 0 ? 'S' : 'N'},{' '}
                        {Math.abs(active.metadata.spatial.lon ?? 0).toFixed(4)}° {(active.metadata.spatial.lon ?? 0) < 0 ? 'W' : 'E'}{' '}
                        <span className="arch2-meta-datum">({active.metadata.spatial.datum})</span>
                      </dd>
                    </>
                  ) : null}
                  {active.metadata.instrument ? (<><dt>Instrument</dt><dd>{active.metadata.instrument}</dd></>) : null}
                  {active.metadata.method ? (<><dt>Method</dt><dd>{active.metadata.method}</dd></>) : null}
                  <dt>Licence</dt><dd>{active.metadata.license}</dd>
                </dl>
              </details>
            ) : null}

            <SourceList sources={cited.sources} numberOf={cited.numberOf} />
          </section>

          {trend.length >= 2 ? (
            <section className="arch2-trend">
              <h3 className="arch2-list-title">Across the whole repository</h3>
              <p className="arch2-trend-sub">
                Not from the record above — this draws on every published observation at once.
              </p>
              <TemperatureTrend data={trend} />
            </section>
          ) : null}
        </main>
      )}

      {/* ══ Transition overlay ══ */}
      {transitioning && (
        <div className="arch2-transition-overlay" aria-hidden>
          <div className="arch2-transition-bar" />
        </div>
      )}
    </div>
  )
}
