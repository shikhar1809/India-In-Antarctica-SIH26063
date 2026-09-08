/**
 * RedactionPreview — what was collected, what is being held back, and what
 * the public will actually see, side by side.
 *
 * A reviewer approving a record is being asked to certify a redaction they
 * cannot see. The projection in repository/publish.ts is careful and
 * invisible: it builds the public record field by field, so the raw field
 * notes, the field party, the sample identifiers and the admin notes simply
 * never travel — but nothing in the portal ever said so, and nothing let a
 * reviewer check it before clicking publish.
 *
 * This component says so. The middle column is the point of it: every piece
 * of real content that exists on the source record and will not be
 * published, with the reason it is being withheld, quoted so the reviewer
 * can see exactly what they are deciding about.
 *
 * The right column is rendered from the actual projected record — not a
 * mock-up of one — so what a reviewer approves is what a reader gets.
 */
import { useState } from 'react';
import type { Redaction } from '../repository/redaction';
import type { RepositoryRecord } from '../repository/contract';
import './RedactionPreview.css';

interface Props {
  redaction: Redaction;
  /** The projection as it would be published. Null while it cannot be built
   *  (a flagged dispatch, an incomplete deposit). */
  record: RepositoryRecord | null;
  /** Shown when there is no projection to display. */
  blockedReason?: string | null;
}

export function RedactionPreview({ redaction, record, blockedReason }: Props) {
  const [open, setOpen] = useState(false);

  const withheld = redaction.withheld;
  const internal = redaction.all.filter((f) => f.disposition === 'internal');

  return (
    <section className={`rdx ${open ? 'is-open' : ''}`}>
      <button type="button" className="rdx-toggle" onClick={() => setOpen((o) => !o)}>
        <span className="rdx-toggle-chevron" aria-hidden>{open ? '▾' : '▸'}</span>
        <strong>Raw, redacted and public</strong>
        <span className="rdx-toggle-count">
          {withheld.length} field{withheld.length === 1 ? '' : 's'} held back
        </span>
      </button>

      {open && (
        <div className="rdx-grid">
          {/* ── 1. everything the field record holds ─────────────────── */}
          <div className="rdx-col">
            <div className="rdx-col-head">
              <span className="rdx-col-title">As submitted</span>
              <span className="rdx-col-sub">{redaction.all.length} fields with content</span>
            </div>
            <dl className="rdx-fields">
              {redaction.all.map((f) => (
                <div key={f.key} className={`rdx-field rdx-${f.disposition}`}>
                  <dt>
                    {f.label}
                    <span className={`rdx-tag rdx-tag-${f.disposition}`}>{f.disposition}</span>
                  </dt>
                  <dd>{f.raw}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* ── 2. what does not travel, and why ─────────────────────── */}
          <div className="rdx-col rdx-col-withheld">
            <div className="rdx-col-head">
              <span className="rdx-col-title">Held back</span>
              <span className="rdx-col-sub">never reaches the public site</span>
            </div>

            {withheld.length === 0 ? (
              <p className="rdx-empty">
                This record carries nothing in any of the withheld fields — no field notes, no
                party list, no attachments, no reviewer notes.
              </p>
            ) : (
              <ul className="rdx-withheld">
                {withheld.map((f) => (
                  <li key={f.key}>
                    <span className="rdx-withheld-label">{f.label}</span>
                    <pre className="rdx-withheld-value">{f.raw}</pre>
                    <span className="rdx-withheld-reason">{f.reason}</span>
                  </li>
                ))}
              </ul>
            )}

            {internal.length > 0 && (
              <p className="rdx-internal-note">
                Plus {internal.length} internal field{internal.length === 1 ? '' : 's'} (
                {internal.map((f) => f.label).join(', ')}) — keys, timestamps and pipeline flags
                rather than content.
              </p>
            )}
          </div>

          {/* ── 3. the record as the public will read it ─────────────── */}
          <div className="rdx-col rdx-col-public">
            <div className="rdx-col-head">
              <span className="rdx-col-title">Published version</span>
              <span className="rdx-col-sub">what a reader gets</span>
            </div>

            {!record ? (
              <p className="rdx-empty">{blockedReason ?? 'Nothing would be published from this record.'}</p>
            ) : (
              <div className="rdx-public">
                <h4 className="rdx-public-title">{record.title}</h4>

                <span className="rdx-public-label">Abstract</span>
                {record.body.map((p, i) => (
                  <p key={i} className="rdx-public-para">{p}</p>
                ))}

                {record.sections?.length ? (
                  <>
                    <span className="rdx-public-label">
                      Report — {record.sections.length} sections
                    </span>
                    <ol className="rdx-public-sections">
                      {record.sections.map((s) => (
                        <li key={s.id}>
                          {s.heading}
                          <span className="rdx-public-words">
                            {s.paragraphs.join(' ').split(/\s+/).length} words
                            {s.figure ? ` · ${s.figure.kind}` : ''}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </>
                ) : null}

                {record.table?.length ? (
                  <>
                    <span className="rdx-public-label">Key facts</span>
                    <dl className="rdx-public-table">
                      {record.table.map((f, i) => (
                        <div key={`${f.label}-${i}`}>
                          <dt>{f.label}</dt>
                          <dd>{f.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </>
                ) : null}

                <span className="rdx-public-label">Also published</span>
                <ul className="rdx-public-extras">
                  <li>{record.photoUrls.length} photograph{record.photoUrls.length === 1 ? '' : 's'}</li>
                  <li>{record.measurements.length} measurement{record.measurements.length === 1 ? '' : 's'}, with units</li>
                  <li>{record.chart ? 'A chart of the readings' : 'No chart — the numbers do not support one'}</li>
                  <li>Citation metadata, licence and provenance</li>
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
