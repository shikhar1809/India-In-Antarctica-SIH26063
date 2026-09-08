/**
 * Citation — hover a marker in the archive's prose, see what the sentence
 * was written from.
 *
 * The published text is a projection of internal material (see
 * repository/citations.ts). These components are the part a reader touches:
 * a numbered marker after each cited run, a hover card naming the source,
 * and a numbered source list under the record.
 *
 * Built on the same primitives as ./link-preview.tsx — Radix hover card,
 * framer-motion spring, cursor-following offset — and it borrows that
 * component outright for the one case where a screenshot genuinely helps:
 * a source that lives on the open web. A source pointing at our own storage
 * bucket is shown as a file chip instead, because handing bucket URLs to a
 * screenshot service to render a picture of a CSV serves nobody.
 *
 * Touch: hover cards do not open on tap, so the marker is a real button that
 * toggles the card open — `open` is controlled here rather than left to
 * Radix's hover handling alone.
 */
import * as HoverCardPrimitive from '@radix-ui/react-hover-card'
import { AnimatePresence, motion, useMotionValue, useSpring } from 'framer-motion'
import React from 'react'
import type { CitedSpan, RecordSource, SourceKind } from '../../repository/contract'
import { isPreviewable, microlinkScreenshot } from './link-preview'

/** One accent per kind of source, so "measured in the field" and "written by
 *  NCPOR" are distinguishable at a glance and not only on hover. */
const KIND_ACCENT: Record<SourceKind, string> = {
  dispatch: '#5fd9ff',      // --cyan
  document: '#ff9933',      // --saffron
  editorial: '#9fbdd6',     // --ice-dim
  historical: '#ffcf5c',    // --warn
}

const KIND_NOTE: Record<SourceKind, string> = {
  dispatch: 'Internal record — cited, not published',
  document: 'Submitted to the repository',
  editorial: 'Written by NCPOR, not a field observation',
  historical: 'Curated catalogue',
}

/* ─────────────────────────────────────────────────────────── the marker ── */

interface CitationProps {
  source: RecordSource
  /** The [n] shown to the reader. */
  number: number
  /** Where inside the source this run came from. */
  locator?: string | null
  /** The published run this marker covers — quoted on the card so it is
   *  obvious which words are being attributed. */
  quoted?: string
}

export function Citation({ source, number, locator, quoted }: CitationProps) {
  const [isOpen, setOpen] = React.useState(false)
  const accent = KIND_ACCENT[source.kind] ?? '#9fbdd6'

  const x = useMotionValue(0)
  const translateX = useSpring(x, { stiffness: 160, damping: 18 })

  const handleMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    x.set((e.clientX - rect.left - rect.width / 2) / 2)
  }

  const preview = isPreviewable(source.url) ? microlinkScreenshot(source.url, 240, 130) : null

  return (
    <HoverCardPrimitive.Root open={isOpen} onOpenChange={setOpen} openDelay={80} closeDelay={120}>
      <HoverCardPrimitive.Trigger asChild onMouseMove={handleMouseMove}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={`Source ${number}: ${source.label} — ${source.title}`}
          aria-expanded={isOpen}
          className="mx-[0.15em] inline-flex translate-y-[-0.35em] cursor-help items-center rounded-[3px] px-[0.25em] py-[0.05em] align-baseline font-mono text-[0.62em] leading-none transition-colors"
          style={{
            color: accent,
            background: `${accent}1f`,
            border: `1px solid ${accent}33`,
          }}
        >
          {number}
        </button>
      </HoverCardPrimitive.Trigger>

      <HoverCardPrimitive.Portal>
        <HoverCardPrimitive.Content
          className="z-[120] [transform-origin:var(--radix-hover-card-content-transform-origin)]"
          side="top"
          align="center"
          sideOffset={10}
          collisionPadding={16}
          avoidCollisions
        >
          <AnimatePresence>
            {isOpen && (
              <motion.div
                initial={{ opacity: 0, y: 14, scale: 0.9 }}
                animate={{
                  opacity: 1, y: 0, scale: 1,
                  transition: { type: 'spring', stiffness: 280, damping: 24 },
                }}
                exit={{ opacity: 0, y: 8, scale: 0.94, transition: { duration: 0.12 } }}
                style={{
                  x: translateX,
                  background: 'var(--panel-2)',
                  boxShadow: `0 0 0 1px ${accent}33, 0 24px 48px -12px rgba(0,0,0,0.75)`,
                }}
                className="w-[19rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl text-left"
              >
                {preview ? (
                  <img
                    src={preview}
                    alt=""
                    className="h-[110px] w-full object-cover"
                    style={{ borderBottom: '1px solid var(--line)' }}
                  />
                ) : null}

                <div className="space-y-2 px-4 py-3.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span
                      className="text-[9.5px] font-extrabold uppercase tracking-[0.14em]"
                      style={{ color: accent }}
                    >
                      {source.label}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-[var(--ice-faint)]">
                      Source {number}
                    </span>
                  </div>

                  <p className="m-0 text-[12.5px] font-semibold leading-snug text-[var(--ice)]">
                    {source.title}
                  </p>

                  {source.author || source.dated ? (
                    <p className="m-0 text-[11px] text-[var(--ice-dim)]">
                      {[source.author, source.dated].filter(Boolean).join(' · ')}
                    </p>
                  ) : null}

                  {quoted ? (
                    <p
                      className="m-0 line-clamp-3 pl-2.5 text-[11px] italic leading-[1.5] text-[var(--ice-dim)]"
                      style={{ borderLeft: `2px solid ${accent}55` }}
                    >
                      “{quoted}”
                    </p>
                  ) : null}

                  {locator ? (
                    <p className="m-0 font-mono text-[10.5px] text-[var(--ice-faint)]">{locator}</p>
                  ) : null}

                  {source.detail ? (
                    <p className="m-0 text-[11px] leading-[1.55] text-[var(--ice-dim)]">
                      {source.detail}
                    </p>
                  ) : null}

                  <div
                    className="flex items-center justify-between gap-2 pt-2"
                    style={{ borderTop: '1px solid var(--line)' }}
                  >
                    <span className="text-[10px] text-[var(--ice-faint)]">
                      {KIND_NOTE[source.kind]}
                    </span>
                    {source.url ? (
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 font-mono text-[10.5px] underline decoration-dotted underline-offset-2"
                        style={{ color: accent }}
                      >
                        Open original ↗
                      </a>
                    ) : null}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </HoverCardPrimitive.Content>
      </HoverCardPrimitive.Portal>
    </HoverCardPrimitive.Root>
  )
}

/* ───────────────────────────────────────────────────────────── the prose ── */

interface CitedParagraphProps {
  spans: CitedSpan[]
  sourceById: Record<string, RecordSource>
  numberOf: Record<string, number>
  className?: string
}

/**
 * One published paragraph with its citations inline.
 *
 * Spans are rendered in order and joined with the same single space the
 * portal used to build the paragraph, so the reader sees the published text
 * exactly — the markers sit between sentences rather than replacing anything.
 */
export function CitedParagraph({ spans, sourceById, numberOf, className }: CitedParagraphProps) {
  return (
    <p className={className}>
      {spans.map((span, i) => {
        const source = span.sourceId ? sourceById[span.sourceId] : undefined
        const number = span.sourceId ? numberOf[span.sourceId] : undefined
        return (
          <React.Fragment key={i}>
            {i > 0 ? ' ' : null}
            {/* Hovering the marker lights up exactly the run it covers, so
                a reader can see where one source stops and the next starts. */}
            <span className="rounded-[3px] transition-colors [&:has(button:hover)]:bg-white/[0.055]">
              {span.text}
              {source && number ? (
                <Citation
                  source={source}
                  number={number}
                  locator={span.locator}
                  quoted={span.text}
                />
              ) : null}
            </span>
          </React.Fragment>
        )
      })}
    </p>
  )
}

/* ────────────────────────────────────────────────────────── source list ── */

/** The numbered sources under a record — the citation apparatus a reader can
 *  read straight through, without hunting for markers. */
export function SourceList({
  sources,
  numberOf,
}: {
  sources: RecordSource[]
  numberOf: Record<string, number>
}) {
  if (!sources.length) return null

  return (
    <section className="arch2-sources">
      <h3 className="arch2-sources-title">Sources for this text</h3>
      <p className="arch2-sources-note">
        What you are reading was prepared for publication from the material below. Hover a marker
        in the text to see which source a line came from.
      </p>
      <ol className="arch2-sources-list">
        {sources.map((s) => {
          const accent = KIND_ACCENT[s.kind] ?? '#9fbdd6'
          return (
            <li key={s.id} className="arch2-source">
              <span className="arch2-source-num" style={{ color: accent, borderColor: `${accent}44`, background: `${accent}14` }}>
                {numberOf[s.id]}
              </span>
              <div className="arch2-source-text">
                <span className="arch2-source-label" style={{ color: accent }}>{s.label}</span>
                <span className="arch2-source-title">{s.title}</span>
                {s.author || s.dated ? (
                  <span className="arch2-source-meta">{[s.author, s.dated].filter(Boolean).join(' · ')}</span>
                ) : null}
                {s.detail ? <span className="arch2-source-detail">{s.detail}</span> : null}
                {s.url ? (
                  <a className="arch2-source-link" href={s.url} target="_blank" rel="noreferrer" style={{ color: accent }}>
                    Open the original document ↗
                  </a>
                ) : null}
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
