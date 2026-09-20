"use client"

import { useEffect, useRef, useCallback } from "react"
import createGlobe from "cobe"

interface PulseMarker {
  id: string
  location: [number, number]
  delay: number
}

interface GlobePulseProps {
  markers?: PulseMarker[]
  className?: string
  speed?: number
  /** Vertical tilt. Negative turns the globe towards the south pole, which
   *  is the only view that matters on this site. */
  theta?: number
  /** Globe surface and marker colours, as cobe's 0–1 RGB triples. */
  baseColor?: [number, number, number]
  markerColor?: [number, number, number]
  glowColor?: [number, number, number]
  /** 1 is cobe's dark globe, 0 the light one. */
  dark?: number
  diffuse?: number
  mapBrightness?: number
  opacity?: number
  /** Colour of the DOM pulse rings over each marker. */
  pulseColor?: string
  /** Drag to spin. Off makes the globe a picture: it keeps turning on its
   *  own and ignores the mouse entirely, which is what you want when it
   *  sits inside something else that is already clickable. */
  interactive?: boolean
}

const defaultMarkers: PulseMarker[] = [
  { id: "pulse-1", location: [51.51, -0.13], delay: 0 },
  { id: "pulse-2", location: [40.71, -74.01], delay: 0.5 },
  { id: "pulse-3", location: [35.68, 139.65], delay: 1 },
  { id: "pulse-4", location: [-33.87, 151.21], delay: 1.5 },
]

export function GlobePulse({
  markers = defaultMarkers,
  className = "",
  speed = 0.003,
  theta = 0.2,
  baseColor = [0.5, 0.5, 0.5],
  markerColor = [0.2, 0.8, 0.9],
  glowColor = [0.05, 0.05, 0.05],
  dark = 1,
  diffuse = 1.5,
  mapBrightness = 10,
  opacity = 0.7,
  pulseColor = "#33ccdd",
  interactive = true,
}: GlobePulseProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pointerInteracting = useRef<{ x: number; y: number } | null>(null)
  const dragOffset = useRef({ phi: 0, theta: 0 })
  const phiOffsetRef = useRef(0)
  const thetaOffsetRef = useRef(0)
  const isPausedRef = useRef(false)

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!interactive) return
    pointerInteracting.current = { x: e.clientX, y: e.clientY }
    if (canvasRef.current) canvasRef.current.style.cursor = "grabbing"
    isPausedRef.current = true
  }, [interactive])

  const handlePointerUp = useCallback(() => {
    if (pointerInteracting.current !== null) {
      phiOffsetRef.current += dragOffset.current.phi
      thetaOffsetRef.current += dragOffset.current.theta
      dragOffset.current = { phi: 0, theta: 0 }
    }
    pointerInteracting.current = null
    if (canvasRef.current) canvasRef.current.style.cursor = "grab"
    isPausedRef.current = false
  }, [])

  useEffect(() => {
    if (!interactive) return
    const handlePointerMove = (e: PointerEvent) => {
      if (pointerInteracting.current !== null) {
        dragOffset.current = {
          phi: (e.clientX - pointerInteracting.current.x) / 300,
          theta: (e.clientY - pointerInteracting.current.y) / 1000,
        }
      }
    }
    window.addEventListener("pointermove", handlePointerMove, { passive: true })
    window.addEventListener("pointerup", handlePointerUp, { passive: true })
    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
    }
  }, [handlePointerUp, interactive])

  useEffect(() => {
    if (!canvasRef.current) return
    const canvas = canvasRef.current
    let globe: ReturnType<typeof createGlobe> | null = null
    let animationId: number
    let phi = 0

    function init() {
      const width = canvas.offsetWidth
      if (width === 0 || globe) return

      globe = createGlobe(canvas, {
        devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2),
        width, height: width,
        phi: 0, theta, dark, diffuse,
        mapSamples: 16000, mapBrightness,
        baseColor,
        markerColor,
        glowColor,
        markerElevation: 0,
        markers: markers.map((m) => ({ location: m.location, size: 0.025, id: m.id })),
        arcs: [], arcColor: [0.3, 0.85, 0.95],
        arcWidth: 0.5, arcHeight: 0.25, opacity,
      })
      function animate() {
        if (!isPausedRef.current) phi += speed
        globe!.update({
          phi: phi + phiOffsetRef.current + dragOffset.current.phi,
          theta: theta + thetaOffsetRef.current + dragOffset.current.theta,
        })
        animationId = requestAnimationFrame(animate)
      }
      animate()
      setTimeout(() => canvas && (canvas.style.opacity = "1"))
    }

    if (canvas.offsetWidth > 0) {
      init()
    } else {
      const ro = new ResizeObserver((entries) => {
        if (entries[0]?.contentRect.width > 0) {
          ro.disconnect()
          init()
        }
      })
      ro.observe(canvas)
    }

    return () => {
      if (animationId) cancelAnimationFrame(animationId)
      if (globe) globe.destroy()
    }
  }, [markers, speed, theta, baseColor, markerColor, glowColor, dark, diffuse, mapBrightness, opacity])

  return (
    <div className={`relative aspect-square select-none ${className}`}>
      <style>{`
        @keyframes pulse-expand {
          0% { transform: scaleX(0.3) scaleY(0.3); opacity: 0.8; }
          100% { transform: scaleX(1.5) scaleY(1.5); opacity: 0; }
        }
      `}</style>
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        style={{
          width: "100%", height: "100%",
          cursor: interactive ? "grab" : "default",
          pointerEvents: interactive ? "auto" : "none",
          opacity: 0,
          transition: "opacity 1.2s ease", borderRadius: "50%", touchAction: "none",
        }}
      />
      {markers.map((m) => (
        <div
          key={m.id}
          style={{
            position: "absolute",
            /* CSS Anchor Positioning — React's CSSProperties has no name
               for it yet, so it goes in as a custom property. */
            ['positionAnchor' as string]: `--cobe-${m.id}`,
            bottom: "anchor(center)",
            left: "anchor(center)",
            translate: "-50% 50%",
            width: 40, height: 40,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none" as const,
            opacity: `var(--cobe-visible-${m.id}, 0)`,
            filter: `blur(calc((1 - var(--cobe-visible-${m.id}, 0)) * 8px))`,
            transition: "opacity 0.4s, filter 0.4s",
          }}
        >
          <span style={{
            position: "absolute", inset: 0,
            border: `2px solid ${pulseColor}`, borderRadius: "50%", opacity: 0,
            animation: `pulse-expand 2s ease-out infinite ${m.delay}s`,
          }} />
          <span style={{
            position: "absolute", inset: 0,
            border: `2px solid ${pulseColor}`, borderRadius: "50%", opacity: 0,
            animation: `pulse-expand 2s ease-out infinite ${m.delay + 0.5}s`,
          }} />
          <span style={{
            width: 10, height: 10, background: pulseColor, borderRadius: "50%",
            boxShadow: `0 0 0 3px rgba(6,16,25,0.85), 0 0 0 5px ${pulseColor}`,
          }} />
        </div>
      ))}
    </div>
  )
}

export default GlobePulse
