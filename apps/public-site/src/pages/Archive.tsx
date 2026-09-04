import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { HeroCarousel } from '../components/ui/hero-carousel'
import { ArcticMapBackground } from '../components/ui/arctic-map-pattern'
import { RecordChart, TemperatureTrend } from '../components/RecordChart'
import { RecordPreview } from '../components/ui/record-preview'
import { useRepository, temperatureSeries, CATEGORY_LABELS, STATION_LABELS } from '../api/repository'
import type { RepositoryRecord, CoverCategory } from '../repository/contract'
import { coverArt, coverGrade } from '../lib/archiveCovers'
import './Archive.css'

/** Stable per-record seed for the generated cover art, so a record's artwork
 *  never changes between visits. Same approach the static archive used. */
const seedFor = (id: string) => [...id].reduce((n, ch) => n + ch.charCodeAt(0), 0)

/** A published record as the hero carousel wants it. The publisher's chosen
 *  photo when there is one; otherwise the generated station artwork the
 *  archive has always fallen back to. */
function toHeroItem(r: RepositoryRecord) {
  const station = STATION_LABELS[r.station] ?? 'NCPOR'
  return {
    id: r.id,
    title: r.title,
    image: r.photoUrls?.[0] ?? coverArt(r.cat, r.station, seedFor(r.id), `${station} · ${r.year}`),
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

  const items = useMemo(() => records.map(toHeroItem), [records])

  const trend = useMemo(() => temperatureSeries(records), [records])

  // Clamp, because records stream in live — a deletion mid-session must not
  // leave the detail pane pointing past the end of the list.
  const safeIndex = Math.min(index, Math.max(0, records.length - 1))
  const active = records[safeIndex]

  const jumpToCategory = (cat: CoverCategory | 'all') => {
    setFilter(cat)
    setMenuOpen(false)
    if (cat === 'all') return
    const hit = records.findIndex((r) => r.cat === cat)
    if (hit >= 0) setIndex(hit)
  }

  return (
    <div className="arch2-page">
      <ArcticMapBackground />

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
            <h1>{loading ? 'Opening the repository…' : error ? 'The repository is unreachable' : 'Nothing published yet'}</h1>
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

        {menuOpen ? (
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
        ) : null}
      </div>

      <main className="arch2-body">
        {/* ── Category rail ───────────────────────────────────────────── */}
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

        {/* ── The focused record, in full ─────────────────────────────── */}
        {active ? (
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
        ) : null}

        {/* ── What the whole repository shows, once records accumulate ──
            Explicitly its own section with its own heading. It used to sit
            bare underneath the record detail, which made the same chart look
            like it belonged to whichever record you happened to be reading. */}
        {trend.length >= 2 ? (
          <section className="arch2-trend">
            <h3 className="arch2-list-title">Across the whole repository</h3>
            <p className="arch2-trend-sub">
              Not from the record above — this draws on every published observation at once.
            </p>
            <TemperatureTrend data={trend} />
          </section>
        ) : null}

        {/* ── Every record, for direct access ─────────────────────────── */}
        {records.length > 0 ? (
          <section className="arch2-list">
            <h3 className="arch2-list-title">All Records</h3>
            <div className="arch2-list-grid">
              {records.map((r, i) => (
                <RecordPreview
                  key={r.id}
                  record={r}
                  triggerClass={`arch2-row ${i === safeIndex ? 'is-active' : ''}`}
                  onActivate={() => {
                    setIndex(i)
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                >
                  <span className="arch2-row-kind">{r.kind}</span>
                  <span className="arch2-row-title">{r.title.replace(/\n/g, ' ')}</span>
                  <span className="arch2-row-meta">{STATION_LABELS[r.station] ?? 'NCPOR'} · {r.year}</span>
                </RecordPreview>
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  )
}
