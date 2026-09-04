/**
 * RecordPreview — hover card for a published repository record.
 *
 * Shows a floating preview card (cover art, outreach text, key fact) when
 * the user hovers over a record row in the archive list. Makes the plain
 * text index immersive without navigating away from the current record.
 *
 * Adapted from the Aceternity UI link-preview pattern for Vite React:
 * - @radix-ui/react-hover-card for trigger / floating content
 * - framer-motion for spring entrance / exit
 * - No next/image or next/link dependencies
 */
import * as HoverCardPrimitive from '@radix-ui/react-hover-card'
import { AnimatePresence, motion, useMotionValue, useSpring } from 'framer-motion'
import React from 'react'
import type { RepositoryRecord, CoverStation } from '../../repository/contract'
import { coverGrade } from '../../lib/archiveCovers'
import { STATION_LABELS } from '../../api/repository'

const U = 'https://images.unsplash.com'
const STATION_THUMB: Record<string, string> = {
  maitri:  `${U}/photo-1535752385016-16aa049b6a8d?w=520&q=80`,
  bharati: `${U}/photo-1493329025335-18542a61595f?w=520&q=80`,
  dakshin: `${U}/photo-1486566584569-b9319dc74315?w=520&q=80`,
  ship:    `${U}/photo-1642928614293-ba6ff94b4a75?w=520&q=80`,
  ncpor:   `${U}/photo-1531366936337-7c912a4589a7?w=520&q=80`,
}
const DEFAULT_THUMB = `${U}/photo-1609385510105-81ae06198c53?w=520&q=80`

/** Faint badge background from the station accent. */
function badgeBg(accent: string) {
  return `${accent}28`   // 16% opacity hex
}

const STATION_BG: Record<CoverStation, string> = {
  maitri:   '#0e0804',
  bharati:  '#020c18',
  dakshin:  '#100e06',
  ship:     '#010810',
  ncpor:    '#08061a',
}

interface RecordPreviewProps {
  record: RepositoryRecord
  children: React.ReactNode
  onActivate?: () => void
  /** extra className on the trigger button */
  triggerClass?: string
}

export function RecordPreview({ record, children, onActivate, triggerClass }: RecordPreviewProps) {
  const [isOpen, setOpen] = React.useState(false)

  const springConfig = { stiffness: 200, damping: 20 }
  const x = useMotionValue(0)
  const translateX = useSpring(x, springConfig)

  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const offsetFromCenter = (e.clientX - rect.left - rect.width / 2) / 3
    x.set(offsetFromCenter)
  }

  const station = STATION_LABELS[record.station] ?? 'NCPOR'
  const imgSrc = record.photoUrls?.[0] ?? STATION_THUMB[record.station] ?? DEFAULT_THUMB
  const accent = coverGrade(record.station)        // CSS hex e.g. '#2f7bb0'
  const bg = STATION_BG[record.station as CoverStation] ?? '#080c18'

  const blurb = record.body?.[0] ?? ''
  const firstFact = record.table?.[0]

  return (
    <HoverCardPrimitive.Root openDelay={100} closeDelay={80} onOpenChange={setOpen}>
      <HoverCardPrimitive.Trigger asChild>
        <button
          type="button"
          onMouseMove={handleMouseMove}
          onClick={onActivate}
          className={triggerClass}
        >
          {children}
        </button>
      </HoverCardPrimitive.Trigger>

      <HoverCardPrimitive.Portal>
        <HoverCardPrimitive.Content
          className="z-[100] [transform-origin:var(--radix-hover-card-content-transform-origin)]"
          side="top"
          align="center"
          sideOffset={14}
          avoidCollisions
        >
          <AnimatePresence>
            {isOpen && (
              <motion.div
                initial={{ opacity: 0, y: 18, scale: 0.85 }}
                animate={{
                  opacity: 1, y: 0, scale: 1,
                  transition: { type: 'spring', stiffness: 300, damping: 24 },
                }}
                exit={{ opacity: 0, y: 10, scale: 0.9, transition: { duration: 0.13 } }}
                style={{ x: translateX }}
                className="w-[260px] rounded-2xl overflow-hidden select-none pointer-events-none"
              >
                {/* Cover image */}
                <div className="relative h-[130px] overflow-hidden">
                  <img
                    src={imgSrc}
                    alt=""
                    draggable={false}
                    className="w-full h-full object-cover"
                    style={{ imageRendering: 'auto' }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />
                  {/* Kind pill + station · year */}
                  <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between gap-2">
                    <span
                      className="text-[9px] font-extrabold tracking-[0.14em] uppercase px-2 py-0.5 rounded-full"
                      style={{ background: badgeBg(accent), color: accent, border: `1px solid ${accent}40` }}
                    >
                      {record.kind}
                    </span>
                    <span className="text-[10.5px] text-white/65 font-mono shrink-0">
                      {station} · {record.year}
                    </span>
                  </div>
                </div>

                {/* Text body */}
                <div
                  className="px-4 pt-3 pb-3.5 space-y-2"
                  style={{ background: bg }}
                >
                  <p className="text-white text-[12.5px] font-semibold leading-snug line-clamp-2 m-0">
                    {record.title.replace(/\n/g, ' ')}
                  </p>

                  {blurb ? (
                    <p className="text-white/55 text-[11px] leading-[1.55] line-clamp-3 m-0">
                      {blurb}
                    </p>
                  ) : null}

                  {firstFact ? (
                    <div
                      className="flex items-center gap-2 pt-2 mt-2"
                      style={{ borderTop: `1px solid ${accent}22` }}
                    >
                      <span className="text-[9.5px] uppercase tracking-widest shrink-0" style={{ color: `${accent}80` }}>
                        {firstFact.label}
                      </span>
                      <span className="text-[11px] font-mono truncate" style={{ color: accent }}>
                        {firstFact.value}
                      </span>
                    </div>
                  ) : null}
                </div>

                {/* Glow outline — thin accent border */}
                <div
                  className="absolute inset-0 rounded-2xl pointer-events-none"
                  style={{ boxShadow: `0 0 0 1px ${accent}30, 0 24px 48px -8px ${accent}28, 0 8px 24px rgba(0,0,0,0.7)` }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </HoverCardPrimitive.Content>
      </HoverCardPrimitive.Portal>
    </HoverCardPrimitive.Root>
  )
}
