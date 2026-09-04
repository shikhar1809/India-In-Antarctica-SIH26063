import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { HeroCarousel } from '../components/ui/hero-carousel'
import { ArcticMapBackground } from '../components/ui/arctic-map-pattern'
import { RecordChart, TemperatureTrend } from '../components/RecordChart'
import { useRepository, temperatureSeries, CATEGORY_LABELS, STATION_LABELS } from '../api/repository'
import type { RepositoryRecord, CoverCategory } from '../repository/contract'
import { coverGrade } from '../lib/archiveCovers'
import './Archive.css'

const U = 'https://images.unsplash.com'
const STATION_HERO: Record<string, string> = {
  maitri:  `${U}/photo-1535752385016-16aa049b6a8d?w=1600&q=85`,
  bharati: `${U}/photo-1493329025335-18542a61595f?w=1600&q=85`,
  dakshin: `${U}/photo-1486566584569-b9319dc74315?w=1600&q=85`,
  ship:    `${U}/photo-1642928614293-ba6ff94b4a75?w=1600&q=85`,
  ncpor:   `${U}/photo-1531366936337-7c912a4589a7?w=1600&q=85`,
}
const DEFAULT_HERO = `${U}/photo-1609385510105-81ae06198c53?w=1600&q=85`

function toHeroItem(r: RepositoryRecord) {
  const station = STATION_LABELS[r.station] ?? 'NCPOR'
  return {
    id: r.id,
    title: r.title,
    image: r.photoUrls?.[0] ?? STATION_HERO[r.station] ?? DEFAULT_HERO,
    credit: r.credit,
    meta: [station, r.year, r.kind.toUpperCase()],
    accent: coverGrade(r.station),
  }
}

export default function Archive() {
  const navigate = useNavigate()
  const { records, loading, error } = useRepository()
  const [index, setIndex] = useState(0)
  const [filter, setFilter] = useState<CoverCategory | 'all'>('all')
  const [menuOpen, setMenuOpen] = useState(false)
  // PS5 flow: 'selector' = carousel screen, 'detail' = record detail screen
  const [view, setView] = useState<'selector' | 'detail'>('selector')
  const [transitioning, setTransitioning] = useState(false)

  const items = useMemo(() => records.map(toHeroItem), [records])
  const trend = useMemo(() => temperatureSeries(records), [records])

  const safeIndex = Math.min(index, Math.max(0, records.length - 1))
  const active = records[safeIndex]

  const jumpToCategory = (cat: CoverCategory | 'all') => {
    setFilter(cat)
    setMenuOpen(false)
    if (cat === 'all') return
    const hit = records.findIndex((r) => r.cat === cat)
    if (hit >= 0) setIndex(hit)
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

  const openRecord = (i?: number) => transition('detail', i)
  const backToSelector = () => transition('selector')

  return (
    <div className="arch2-page">
      <ArcticMapBackground />

      {/* ══════════════════ SELECTOR SCREEN ══════════════════ */}
      {view === 'selector' && (
        <div className="arch2-selector-screen">
          {/* Hero carousel */}
          <div className="arch2-hero">
            {items.length > 0 ? (
              <HeroCarousel
                items={items}
                index={safeIndex}
                onIndexChange={setIndex}
                brand={
                  <span className="arch2-brand">
                    <img src="/logo.png" alt="" className="arch2-brand-mark" />
                    Knowledge Repository
                  </span>
                }
                onBack={() => navigate('/')}
                onMenu={() => setMenuOpen((o) => !o)}
                className="h-[74svh] min-h-[520px]"
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

          {/* Category chips + Open button */}
          <div className="arch2-selector-bar">
            <nav className="arch2-filters" aria-label="Filter by record type">
              {CATEGORY_LABELS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`arch2-chip ${filter === c.id ? 'is-active' : ''}`}
                  onClick={() => jumpToCategory(c.id)}
                >
                  {c.label}
                </button>
              ))}
              <span className="arch2-count">
                {loading ? 'loading…' : `${records.length} record${records.length === 1 ? '' : 's'}`}
              </span>
            </nav>

            {items.length > 0 && (
              <button
                type="button"
                className="arch2-open-btn"
                onClick={() => openRecord()}
              >
                Open Record
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
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
                {active.body.map((para, i) => (
                  <p key={i}>{para}</p>
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

      {/* ══ Logo transition overlay ══ */}
      {transitioning && (
        <div className="arch2-transition-overlay" aria-hidden>
          <div className="arch2-transition-logo">
            <img src="/logo.png" alt="" className="arch2-transition-mark" />
            <span className="arch2-transition-wordmark">India in Antarctica</span>
          </div>
          <div className="arch2-transition-bar" />
        </div>
      )}
    </div>
  )
}
