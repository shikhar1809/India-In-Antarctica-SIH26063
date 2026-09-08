/**
 * LinkPreview — a link that shows a screenshot of its destination on hover.
 *
 * The Aceternity UI link-preview, ported to this codebase. Two deliberate
 * deviations from the published component, both because that one is written
 * for Next.js and this app is Vite + React Router:
 *
 *  - `next/image` → a plain `<img>`. The `quality` and `layout` props existed
 *    only to configure the Next image optimiser, so they are gone; the
 *    screenshot is requested from microlink at the size it will be drawn at.
 *  - `next/link` → React Router's `<Link>` for in-app paths, and a plain
 *    `<a target="_blank">` for anything off-site.
 *
 * Screenshots come from api.microlink.io, which means the destination URL is
 * sent to a third party. That is fine for public web pages and is not fine
 * for a link to a file in our own storage bucket — see `isPreviewable` and
 * the citation cards in ./citation.tsx, which use it.
 */
import * as HoverCardPrimitive from '@radix-ui/react-hover-card'
import { AnimatePresence, motion, useMotionValue, useSpring } from 'framer-motion'
import { encode } from 'qss'
import React from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../../lib/utils'

/** The microlink screenshot endpoint for a page, at the size it is drawn.
 *  Requested at 3× so the card stays sharp on a retina display. */
export function microlinkScreenshot(url: string, width: number, height: number): string {
  const params = encode({
    url,
    screenshot: true,
    meta: false,
    embed: 'screenshot.url',
    colorScheme: 'dark',
    'viewport.isMobile': true,
    'viewport.deviceScaleFactor': 1,
    'viewport.width': width * 3,
    'viewport.height': height * 3,
  })
  return `https://api.microlink.io/?${params}`
}

/**
 * Whether a URL is a web page worth screenshotting — i.e. something a
 * screenshot service can actually render, and something we are willing to
 * hand to one.
 *
 * Deliberately conservative. Storage URLs are excluded on privacy grounds
 * (a reader hovering a citation should not cause our bucket URLs to be
 * fetched by a third party), and direct file links are excluded because a
 * screenshot of a CSV download is a picture of nothing.
 */
export function isPreviewable(url: string | null | undefined): url is string {
  if (!url) return false
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false                                   // relative or malformed
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
  const host = parsed.hostname
  if (/(^|\.)(firebasestorage\.app|googleapis\.com|firebaseapp\.com)$/i.test(host)) return false
  if (/\.(csv|tsv|zip|nc|pdf|xlsx?|docx?|mp4|mov|png|jpe?g|tiff?)$/i.test(parsed.pathname)) return false
  return true
}

type LinkPreviewProps = {
  children: React.ReactNode
  url: string
  className?: string
  width?: number
  height?: number
} & ({ isStatic: true; imageSrc: string } | { isStatic?: false; imageSrc?: never })

export const LinkPreview = ({
  children,
  url,
  className,
  width = 200,
  height = 125,
  isStatic = false,
  imageSrc = '',
}: LinkPreviewProps) => {
  const src = isStatic ? imageSrc : microlinkScreenshot(url, width, height)

  const [isOpen, setOpen] = React.useState(false)
  const [isMounted, setIsMounted] = React.useState(false)

  React.useEffect(() => {
    setIsMounted(true)
  }, [])

  const springConfig = { stiffness: 100, damping: 15 }
  const x = useMotionValue(0)
  const translateX = useSpring(x, springConfig)

  // Nudges the card towards the side of the link the cursor is on, so it
  // feels attached to the pointer rather than to the element.
  const handleMouseMove = (event: React.MouseEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const offsetFromCenter = (event.clientX - rect.left - rect.width / 2) / 2
    x.set(offsetFromCenter)
  }

  const internal = url.startsWith('/')

  return (
    <>
      {/* Warm the screenshot before the card opens, so hovering doesn't
          show an empty frame while microlink renders the page. */}
      {isMounted ? (
        <div className="hidden">
          <img src={src} width={width} height={height} alt="" />
        </div>
      ) : null}

      <HoverCardPrimitive.Root openDelay={50} closeDelay={100} onOpenChange={setOpen}>
        <HoverCardPrimitive.Trigger asChild onMouseMove={handleMouseMove}>
          {internal ? (
            <Link to={url} className={cn('text-[var(--ice)]', className)}>
              {children}
            </Link>
          ) : (
            <a href={url} target="_blank" rel="noreferrer" className={cn('text-[var(--ice)]', className)}>
              {children}
            </a>
          )}
        </HoverCardPrimitive.Trigger>

        <HoverCardPrimitive.Portal>
          <HoverCardPrimitive.Content
            className="z-[100] [transform-origin:var(--radix-hover-card-content-transform-origin)]"
            side="top"
            align="center"
            sideOffset={10}
            avoidCollisions
          >
            <AnimatePresence>
              {isOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 20, scale: 0.6 }}
                  animate={{
                    opacity: 1,
                    y: 0,
                    scale: 1,
                    transition: { type: 'spring', stiffness: 260, damping: 20 },
                  }}
                  exit={{ opacity: 0, y: 20, scale: 0.6 }}
                  className="rounded-xl shadow-xl"
                  style={{ x: translateX }}
                >
                  <a
                    href={url}
                    target={internal ? undefined : '_blank'}
                    rel="noreferrer"
                    className="block rounded-xl border-2 border-transparent bg-white p-1 shadow hover:border-neutral-200"
                    style={{ fontSize: 0 }}
                  >
                    <img
                      src={src}
                      width={width}
                      height={height}
                      alt="Preview of the linked page"
                      className="rounded-lg object-cover"
                      style={{ width, height }}
                    />
                  </a>
                </motion.div>
              )}
            </AnimatePresence>
          </HoverCardPrimitive.Content>
        </HoverCardPrimitive.Portal>
      </HoverCardPrimitive.Root>
    </>
  )
}
