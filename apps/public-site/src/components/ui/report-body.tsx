/**
 * ReportBody — a published record rendered as a report rather than a blurb.
 *
 * The archive used to print `body` as a run of paragraphs and stop. That is
 * the right shape for an abstract and the wrong shape for an expedition
 * report or a dataset, which a reader navigates rather than reads top to
 * bottom: they want the methods, or the figure, or the column list, and they
 * want to get there without scrolling past everything else.
 *
 * So: the abstract stays where it was, and everything below it is
 * structured — a contents list that jumps, sections with their own headings
 * and figures, and for a dataset, its schema and a few real rows. Every
 * piece is optional. A record with no `sections` renders as it always did.
 *
 * Citations survive the move: a section can name the source it was written
 * from, and the marker sits beside its heading (see ./citation.tsx).
 */
import type { DatasetPreview, RecordSource, ReportSection, SectionFigure } from '../../repository/contract'
import { RecordChart } from '../RecordChart'
import { Citation } from './citation'

/* ────────────────────────────────────────────────────────────── figures ── */

function Figure({ figure, index }: { figure: SectionFigure; index: number }) {
  return (
    <figure className="rep-figure">
      {figure.kind === 'photo' && figure.photoUrl ? (
        <img className="rep-figure-img" src={figure.photoUrl} alt={figure.caption} loading="lazy" />
      ) : null}

      {figure.kind === 'chart' && figure.chart ? <RecordChart chart={figure.chart} /> : null}

      {figure.kind === 'table' && figure.rows?.length ? (
        <table className="rep-figure-table">
          <tbody>
            {figure.rows.map((r, i) => (
              <tr key={`${r.label}-${i}`}>
                <th scope="row">{r.label}</th>
                <td>{r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      <figcaption className="rep-figure-caption">
        <span className="rep-figure-num">Figure {index}</span>
        {figure.caption}
      </figcaption>
    </figure>
  )
}

/* ───────────────────────────────────────────────────────────── sections ── */

interface SectionsProps {
  sections: ReportSection[]
  sourceById: Record<string, RecordSource>
  numberOf: Record<string, number>
}

export function ReportSections({ sections, sourceById, numberOf }: SectionsProps) {
  if (!sections.length) return null

  // Figures are numbered across the whole report, the way a reader expects
  // to be able to say "figure 3" and be understood.
  let figureNo = 0

  return (
    <div className="rep-sections">
      {sections.map((s) => {
        const source = s.sourceId ? sourceById[s.sourceId] : undefined
        const number = s.sourceId ? numberOf[s.sourceId] : undefined
        if (s.figure) figureNo += 1
        const thisFigure = figureNo

        return (
          <section key={s.id} id={s.id} className="rep-section">
            <h3 className="rep-section-head">
              {s.heading}
              {source && number ? (
                <Citation source={source} number={number} quoted={s.paragraphs[0]} />
              ) : null}
            </h3>
            {s.paragraphs.map((p, i) => (
              <p key={i} className="rep-para">{p}</p>
            ))}
            {s.figure ? <Figure figure={s.figure} index={thisFigure} /> : null}
          </section>
        )
      })}
    </div>
  )
}

/** Jump list for a report long enough that scrolling is not navigation. */
export function ReportContents({ sections }: { sections: ReportSection[] }) {
  if (sections.length < 2) return null
  return (
    <nav className="rep-contents" aria-label="Contents">
      <span className="rep-contents-label">In this report</span>
      <ol>
        {sections.map((s, i) => (
          <li key={s.id}>
            <a href={`#${s.id}`}>
              <span className="rep-contents-num">{String(i + 1).padStart(2, '0')}</span>
              {s.heading}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}

/* ────────────────────────────────────────────────────────────── dataset ── */

/**
 * What a dataset actually is, before anyone downloads it: its shape, what
 * each column means and holds, and a few real rows.
 */
export function DatasetBlock({ dataset }: { dataset: DatasetPreview }) {
  return (
    <section className="rep-dataset" id="the-data">
      <h3 className="rep-section-head">The data</h3>

      {dataset.downloadUrl ? (
        <a className="rep-dataset-download" href={dataset.downloadUrl} download>
          <span className="rep-dataset-download-icon" aria-hidden>↓</span>
          <span>
            <strong>Download the data</strong>
            <span className="rep-dataset-download-meta">
              {dataset.format} · {dataset.sizeLabel} · {dataset.rowCount.toLocaleString('en-IN')} rows
            </span>
          </span>
        </a>
      ) : null}

      <dl className="rep-dataset-facts">
        <div><dt>Format</dt><dd>{dataset.format}</dd></div>
        <div><dt>Size</dt><dd>{dataset.sizeLabel}</dd></div>
        <div><dt>Rows</dt><dd>{dataset.rowCount.toLocaleString('en-IN')}</dd></div>
        <div><dt>Coverage</dt><dd>{dataset.coverage}</dd></div>
      </dl>

      <div className="rep-dataset-schema">
        <span className="rep-dataset-label">Columns</span>
        <table>
          <thead>
            <tr><th>Name</th><th>Type</th><th>Unit</th><th>Description</th></tr>
          </thead>
          <tbody>
            {dataset.columns.map((c) => (
              <tr key={c.name}>
                <th scope="row"><code>{c.name}</code></th>
                <td className="rep-dataset-type">{c.type}</td>
                <td className="rep-dataset-unit">{c.unit ?? '—'}</td>
                <td>{c.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {dataset.sampleRows.length ? (
        <div className="rep-dataset-sample">
          <span className="rep-dataset-label">
            First {dataset.sampleRows.length} rows
            <span className="rep-dataset-of"> of {dataset.rowCount.toLocaleString('en-IN')}</span>
          </span>
          {/* Wide tables scroll inside their own box rather than pushing the
              page sideways. */}
          <div className="rep-dataset-scroll">
            <table>
              <thead>
                <tr>{dataset.columns.map((c) => <th key={c.name}>{c.name}</th>)}</tr>
              </thead>
              <tbody>
                {dataset.sampleRows.map((row, i) => (
                  <tr key={i}>
                    {row.values.map((v, j) => <td key={j}>{v}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  )
}
