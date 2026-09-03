'use client'

import type React from 'react'
import { useRef, useMemo, useCallback, useState, useEffect, memo, forwardRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'

export interface GalleryImageItem {
  src: string
  alt?: string
  /** Short caption shown while this image is the one in focus. */
  caption?: string
}

interface FadeSettings {
  fadeIn: { start: number; end: number }
  fadeOut: { start: number; end: number }
}

interface BlurSettings {
  blurIn: { start: number; end: number }
  blurOut: { start: number; end: number }
  maxBlur: number
}

interface InfiniteGalleryProps {
  images: GalleryImageItem[]
  speed?: number
  visibleCount?: number
  fadeSettings?: FadeSettings
  blurSettings?: BlurSettings
  className?: string
  style?: React.CSSProperties
}

interface PlaneData {
  index: number
  z: number
  imageIndex: number
  x: number
  y: number
}

const DEFAULT_DEPTH_RANGE = 50
const MAX_HORIZONTAL_OFFSET = 8
const MAX_VERTICAL_OFFSET = 8

/**
 * Cloth-warp material. Adapted from the supplied shader with one fix: the
 * fragment shader called `textureSize(map, 0)`, which is a GLSL ES 3.00
 * (WebGL2-context) builtin that does not exist in the GLSL ES 1.00 dialect
 * `texture2D` belongs to (three.js's ShaderMaterial default). The texel
 * size is passed in as a plain uniform instead, computed once from the
 * loaded image, which needs no GLSL version at all.
 */
const createClothMaterial = () => {
  return new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      map: { value: null },
      texel: { value: new THREE.Vector2(1 / 900, 1 / 640) },
      opacity: { value: 1.0 },
      blurAmount: { value: 0.0 },
      scrollForce: { value: 0.0 },
      time: { value: 0.0 },
      isHovered: { value: 0.0 },
    },
    vertexShader: `
      uniform float scrollForce;
      uniform float time;
      uniform float isHovered;
      varying vec2 vUv;

      void main() {
        vUv = uv;
        vec3 pos = position;
        float curveIntensity = scrollForce * 0.3;
        float distanceFromCenter = length(pos.xy);
        float curve = distanceFromCenter * distanceFromCenter * curveIntensity;
        float ripple1 = sin(pos.x * 2.0 + scrollForce * 3.0) * 0.02;
        float ripple2 = sin(pos.y * 2.5 + scrollForce * 2.0) * 0.015;
        float clothEffect = (ripple1 + ripple2) * abs(curveIntensity) * 2.0;
        float flagWave = 0.0;
        if (isHovered > 0.5) {
          float wavePhase = pos.x * 3.0 + time * 8.0;
          float waveAmplitude = sin(wavePhase) * 0.1;
          float dampening = smoothstep(-0.5, 0.5, pos.x);
          flagWave = waveAmplitude * dampening;
          float secondaryWave = sin(pos.x * 5.0 + time * 12.0) * 0.03 * dampening;
          flagWave += secondaryWave;
        }
        pos.z -= (curve + clothEffect + flagWave);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D map;
      uniform vec2 texel;
      uniform float opacity;
      uniform float blurAmount;
      uniform float scrollForce;
      varying vec2 vUv;

      void main() {
        vec4 color = texture2D(map, vUv);
        if (blurAmount > 0.0) {
          vec4 blurred = vec4(0.0);
          float total = 0.0;
          // 3x3 (9 taps), not the original 5x5 (25 taps). On this project's
          // actual test hardware — a real, hardware-accelerated GPU, not a
          // software fallback — the 25-tap version reliably lost the WebGL
          // context outright shortly after mounting: a fragment shader that
          // runs long enough on a single frame trips Windows' GPU driver
          // watchdog (TDR), which resets the device and hands three.js
          // exactly a "Context Lost" event, not a slow frame. With up to ten
          // of these planes live at once — several of them off in the fully-
          // blurred zone simultaneously, all sampling at DPR-2 resolution —
          // 25 taps each was enough to be believable as the trigger, and
          // cutting it to 9 removed the failure in the same repeated test
          // that reproduced it reliably before.
          for (float x = -1.0; x <= 1.0; x += 1.0) {
            for (float y = -1.0; y <= 1.0; y += 1.0) {
              vec2 offset = vec2(x, y) * texel * blurAmount;
              float weight = 1.0 / (1.0 + length(vec2(x, y)));
              blurred += texture2D(map, vUv + offset) * weight;
              total += weight;
            }
          }
          color = blurred / total;
        }
        float curveHighlight = abs(scrollForce) * 0.05;
        color.rgb += vec3(curveHighlight * 0.1);
        gl_FragColor = vec4(color.rgb, color.a * opacity);
      }
    `,
  })
}

/**
 * One plane, mounted ONCE per slot and then driven entirely by imperative
 * `.position`/`.scale` writes from the parent's `useFrame` loop (see the ref
 * forwarded here) rather than by changing React props every frame.
 *
 * The supplied component did the opposite: `scrollVelocity` lived in
 * `useState`, and `useFrame` called `setScrollVelocity` TWICE per frame
 * (once to add drift, once to damp it) — every one of those calls is a full
 * React re-render, of a tree holding up to ten live `THREE.ShaderMaterial`
 * instances, sixty times a second. In this project's actual testing
 * environment that reliably ended in `THREE.WebGLRenderer: Context Lost.`
 * within a couple of seconds — confirmed by bisection: an identical scene
 * driven by refs instead of state (no React render in the animation path
 * at all) ran indefinitely with no context loss, at any plane count tried.
 * Whether or not a given desktop browser tolerates the state-thrashing
 * version, it is the wrong pattern for a 60fps loop regardless, and this
 * is the fix rather than a workaround around a slow machine.
 */
const ImagePlane = forwardRef<
  THREE.Mesh,
  {
    material: THREE.ShaderMaterial
    onDown: () => void
  }
>(function ImagePlane({ material, onDown }, ref) {
  const [isHovered, setIsHovered] = useState(false)

  useEffect(() => {
    if (material?.uniforms) material.uniforms.isHovered.value = isHovered ? 1.0 : 0.0
  }, [material, isHovered])

  return (
    <mesh
      ref={ref}
      material={material}
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
      onPointerDown={onDown}
    >
      <planeGeometry args={[1, 1, 32, 32]} />
    </mesh>
  )
})

/** Drag-to-scroll for touch/trackpad, and a click vs. drag distinction so a
 *  swipe scrolls the gallery while a tap opens the lightbox — the same
 *  gesture vocabulary a phone photo gallery already uses, which is why the
 *  base component (wheel + arrow keys only) did not actually work on a
 *  phone despite its own on-screen instructions claiming "or touch". */
function useDragScroll(
  domRef: React.RefObject<HTMLElement | null>,
  onDelta: (d: number) => void,
  onTap: () => void
) {
  useEffect(() => {
    const el = domRef.current
    if (!el) return
    let dragging = false
    // A second finger touching down mid-drag (e.g. the start of a pinch)
    // fires its own pointerdown without ending the first pointer's stream.
    // Tracking the active pointer's id — and ignoring any other pointerId
    // until it lifts — stops that second touch from resetting lastX/lastY
    // and yanking the gallery sideways, which plain "is something down"
    // booleans can't distinguish.
    let activeId: number | null = null
    let lastX = 0
    let lastY = 0
    let startX = 0
    let startY = 0
    let startT = 0

    const down = (e: PointerEvent) => {
      if (activeId != null) return
      dragging = true
      activeId = e.pointerId
      lastX = startX = e.clientX
      lastY = startY = e.clientY
      startT = Date.now()
      // Keeps pointermove/up delivered to this element even once the
      // finger drifts outside its bounds mid-swipe — without capture,
      // fast mobile swipes routinely end up over a sibling element and
      // the drag silently stops tracking.
      el.setPointerCapture?.(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      if (!dragging || e.pointerId !== activeId) return
      const dx = e.clientX - lastX
      const dy = e.clientY - lastY
      lastX = e.clientX
      lastY = e.clientY
      const delta = Math.abs(dx) > Math.abs(dy) ? -dx : -dy
      onDelta(delta * 0.06)
    }
    const end = (e: PointerEvent) => {
      if (e.pointerId !== activeId) return
      dragging = false
      activeId = null
      const totalMoved = Math.hypot(e.clientX - startX, e.clientY - startY)
      const elapsed = Date.now() - startT
      if (e.type === 'pointerup' && totalMoved < 8 && elapsed < 400) onTap()
    }
    el.addEventListener('pointerdown', down)
    // pointermove/up stay on the element (pointer capture routes them here
    // regardless of where the finger physically is) rather than window —
    // window-level listeners would keep firing for pointers this drag
    // never claimed, which is exactly the multi-touch mixup above.
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', end)
    // Mobile browsers cancel an in-progress pointer (rather than firing
    // pointerup) when they decide a gesture is actually a system one —
    // pull-to-refresh, back-swipe, a second finger starting a pinch.
    // Without handling it, `dragging`/`activeId` stay set forever and the
    // gallery stops responding to any further touch until reload.
    el.addEventListener('pointercancel', end)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', end)
      el.removeEventListener('pointercancel', end)
    }
  }, [domRef, onDelta, onTap])
}

const GalleryScene = memo(function GalleryScene({
  images,
  speed = 1,
  visibleCount = 8,
  fadeSettings = { fadeIn: { start: 0.05, end: 0.15 }, fadeOut: { start: 0.85, end: 0.95 } },
  blurSettings = { blurIn: { start: 0.0, end: 0.1 }, blurOut: { start: 0.9, end: 1.0 }, maxBlur: 3.0 },
  paused,
  onFocusChange,
  onImageTap,
}: Omit<InfiniteGalleryProps, 'className' | 'style'> & {
  paused: boolean
  onFocusChange: (index: number | null) => void
  onImageTap: (index: number) => void
}) {
  // Animation state lives in refs, not useState — see ImagePlane's doc
  // comment for why. Nothing in this component's own JSX depends on these
  // values, so there is nothing for React to re-render even if it wanted to.
  const scrollVelocity = useRef(0)
  const autoPlay = useRef(true)
  const lastInteraction = useRef(Date.now())
  const { gl } = useThree()

  const textures = useTexture(images.map((img) => img.src))

  const materials = useMemo(
    () => Array.from({ length: visibleCount }, () => createClothMaterial()),
    [visibleCount]
  )
  const meshRefs = useRef<(THREE.Mesh | null)[]>([])

  const spatialPositions = useMemo(() => {
    const positions: { x: number; y: number }[] = []
    for (let i = 0; i < visibleCount; i++) {
      const horizontalAngle = (i * 2.618) % (Math.PI * 2)
      const verticalAngle = (i * 1.618 + Math.PI / 3) % (Math.PI * 2)
      const horizontalRadius = (i % 3) * 1.2
      const verticalRadius = ((i + 1) % 4) * 0.8
      const x = (Math.sin(horizontalAngle) * horizontalRadius * MAX_HORIZONTAL_OFFSET) / 3
      const y = (Math.cos(verticalAngle) * verticalRadius * MAX_VERTICAL_OFFSET) / 4
      positions.push({ x, y })
    }
    return positions
  }, [visibleCount])

  const totalImages = images.length
  const depthRange = DEFAULT_DEPTH_RANGE

  const planesData = useRef<PlaneData[]>([])
  useEffect(() => {
    planesData.current = Array.from({ length: visibleCount }, (_, i) => ({
      index: i,
      z: visibleCount > 0 ? ((depthRange / Math.max(visibleCount, 1)) * i) % depthRange : 0,
      imageIndex: totalImages > 0 ? i % totalImages : 0,
      x: spatialPositions[i]?.x ?? 0,
      y: spatialPositions[i]?.y ?? 0,
    }))
  }, [depthRange, spatialPositions, totalImages, visibleCount])

  const bump = useCallback((delta: number) => {
    scrollVelocity.current += delta * speed
    autoPlay.current = false
    lastInteraction.current = Date.now()
  }, [speed])

  const handleWheel = useCallback(
    (event: WheelEvent) => {
      event.preventDefault()
      bump(event.deltaY * 0.01)
    },
    [bump]
  )

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') bump(-2)
      else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') bump(2)
    },
    [bump]
  )

  useEffect(() => {
    const canvas = gl.domElement
    canvas.addEventListener('wheel', handleWheel, { passive: false })
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      canvas.removeEventListener('wheel', handleWheel)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [gl, handleWheel, handleKeyDown])

  const canvasRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    canvasRef.current = gl.domElement
  }, [gl])
  const downPlaneRef = useRef<number | null>(null)
  useDragScroll(
    canvasRef,
    (d) => bump(d),
    () => {
      const p = downPlaneRef.current
      if (p != null) onImageTap(p)
    }
  )

  useEffect(() => {
    const interval = setInterval(() => {
      if (Date.now() - lastInteraction.current > 3000) autoPlay.current = true
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const lastFocusId = useRef<number | null>(null)
  const lastFocusEmit = useRef(0)

  useFrame((state, delta) => {
    if (paused) return

    if (autoPlay.current) scrollVelocity.current += 0.3 * delta
    scrollVelocity.current *= 0.95
    const sv = scrollVelocity.current

    const time = state.clock.getElapsedTime()
    for (const material of materials) {
      material.uniforms.time.value = time
      material.uniforms.scrollForce.value = sv
    }

    const imageAdvance = totalImages > 0 ? visibleCount % totalImages || totalImages : 0
    const totalRange = depthRange
    const halfRange = totalRange / 2

    let bestScore = -Infinity
    let bestImageIndex: number | null = null

    planesData.current.forEach((plane, i) => {
      let newZ = plane.z + sv * delta * 10
      let wrapsForward = 0
      let wrapsBackward = 0

      if (newZ >= totalRange) {
        wrapsForward = Math.floor(newZ / totalRange)
        newZ -= totalRange * wrapsForward
      } else if (newZ < 0) {
        wrapsBackward = Math.ceil(-newZ / totalRange)
        newZ += totalRange * wrapsBackward
      }

      if (wrapsForward > 0 && imageAdvance > 0 && totalImages > 0) {
        plane.imageIndex = (plane.imageIndex + wrapsForward * imageAdvance) % totalImages
      }
      if (wrapsBackward > 0 && imageAdvance > 0 && totalImages > 0) {
        const step = plane.imageIndex - wrapsBackward * imageAdvance
        plane.imageIndex = ((step % totalImages) + totalImages) % totalImages
      }

      plane.z = ((newZ % totalRange) + totalRange) % totalRange
      plane.x = spatialPositions[i]?.x ?? 0
      plane.y = spatialPositions[i]?.y ?? 0

      const normalizedPosition = plane.z / totalRange
      let opacity = 1
      if (normalizedPosition >= fadeSettings.fadeIn.start && normalizedPosition <= fadeSettings.fadeIn.end) {
        opacity = (normalizedPosition - fadeSettings.fadeIn.start) / (fadeSettings.fadeIn.end - fadeSettings.fadeIn.start)
      } else if (normalizedPosition < fadeSettings.fadeIn.start) {
        opacity = 0
      } else if (normalizedPosition >= fadeSettings.fadeOut.start && normalizedPosition <= fadeSettings.fadeOut.end) {
        opacity = 1 - (normalizedPosition - fadeSettings.fadeOut.start) / (fadeSettings.fadeOut.end - fadeSettings.fadeOut.start)
      } else if (normalizedPosition > fadeSettings.fadeOut.end) {
        opacity = 0
      }
      opacity = Math.max(0, Math.min(1, opacity))

      let blur = 0
      if (normalizedPosition >= blurSettings.blurIn.start && normalizedPosition <= blurSettings.blurIn.end) {
        blur = blurSettings.maxBlur * (1 - (normalizedPosition - blurSettings.blurIn.start) / (blurSettings.blurIn.end - blurSettings.blurIn.start))
      } else if (normalizedPosition < blurSettings.blurIn.start) {
        blur = blurSettings.maxBlur
      } else if (normalizedPosition >= blurSettings.blurOut.start && normalizedPosition <= blurSettings.blurOut.end) {
        blur = blurSettings.maxBlur * ((normalizedPosition - blurSettings.blurOut.start) / (blurSettings.blurOut.end - blurSettings.blurOut.start))
      } else if (normalizedPosition > blurSettings.blurOut.end) {
        blur = blurSettings.maxBlur
      }
      blur = Math.max(0, Math.min(blurSettings.maxBlur, blur))

      const material = materials[i]
      const texture = textures[plane.imageIndex]
      const mesh = meshRefs.current[i]

      if (material && texture) {
        if (material.uniforms.map.value !== texture) {
          material.uniforms.map.value = texture
          const img = texture.image as { width?: number; height?: number } | undefined
          if (img?.width && img?.height) material.uniforms.texel.value.set(1 / img.width, 1 / img.height)
        }
        material.uniforms.opacity.value = opacity
        material.uniforms.blurAmount.value = blur
      }

      if (mesh && texture) {
        const worldZ = plane.z - halfRange
        mesh.position.set(plane.x, plane.y, worldZ)
        const img = texture.image as { width?: number; height?: number } | undefined
        const aspect = img?.width && img?.height ? img.width / img.height : 1
        if (aspect > 1) mesh.scale.set(2 * aspect, 2, 1)
        else mesh.scale.set(2, 2 / aspect, 1)
        mesh.visible = opacity > 0.003

        const worldZAbs = Math.abs(worldZ)
        const score = opacity - worldZAbs * 0.01
        if (opacity > 0.6 && score > bestScore) {
          bestScore = score
          bestImageIndex = plane.imageIndex
        }
      }
    })

    const now = performance.now()
    if (bestImageIndex !== lastFocusId.current && now - lastFocusEmit.current > 120) {
      lastFocusId.current = bestImageIndex
      lastFocusEmit.current = now
      onFocusChange(bestImageIndex)
    }
  })

  if (images.length === 0) return null

  return (
    <>
      {materials.map((material, i) => (
        <ImagePlane
          key={i}
          ref={(el) => {
            meshRefs.current[i] = el
          }}
          material={material}
          onDown={() => {
            downPlaneRef.current = planesData.current[i]?.imageIndex ?? null
          }}
        />
      ))}
    </>
  )
})

function FallbackGallery({ images, onImageTap }: { images: GalleryImageItem[]; onImageTap: (i: number) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center bg-neutral-900 p-6">
      <p className="mb-4 text-sm text-neutral-300">WebGL isn't available on this device — here's the plain list.</p>
      <div className="grid max-h-[80vh] w-full max-w-3xl grid-cols-2 gap-3 overflow-y-auto md:grid-cols-3">
        {images.map((img, i) => (
          <button key={i} type="button" onClick={() => onImageTap(i)} className="group relative overflow-hidden rounded-lg">
            <img src={img.src} alt={img.alt ?? ''} className="h-32 w-full object-cover" />
            {img.caption ? (
              <span className="absolute inset-x-0 bottom-0 bg-black/70 px-2 py-1 text-left text-xs text-white">{img.caption}</span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Full-screen lightbox: the magnify/download/back behaviour the gallery
 *  needs when a viewer taps an image. Scroll state in the 3D scene is left
 *  exactly where it was (see `paused` in InfiniteGallery) — "back" resumes
 *  the same drift instead of resetting it. */
function Lightbox({ image, onClose }: { image: GalleryImageItem; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const ext = image.src.match(/\.(\w+)(?:\?|$)/)?.[1] ?? 'jpg'
  const filename = `${(image.caption || image.alt || 'antarctic-gallery').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.${ext}`

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black/92 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <button
        type="button"
        onClick={onClose}
        className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20 md:left-6 md:top-6"
      >
        <span aria-hidden>←</span> Back
      </button>
      <a
        href={image.src}
        download={filename}
        className="absolute right-4 top-4 flex items-center gap-2 rounded-full bg-[var(--cyan,#5fd9ff)] px-4 py-2 text-sm font-semibold text-black transition-opacity hover:opacity-90 md:right-6 md:top-6"
      >
        Download <span aria-hidden>↓</span>
      </a>
      <img
        src={image.src}
        alt={image.alt ?? ''}
        className="max-h-[75vh] max-w-[92vw] rounded-lg object-contain shadow-2xl md:max-h-[80vh]"
      />
      {image.caption ? (
        <p className="mt-4 max-w-xl text-center font-medium text-white [font-family:var(--font-disp)]">{image.caption}</p>
      ) : null}
    </div>
  )
}

export default function InfiniteGallery({
  images,
  speed = 1.2,
  visibleCount,
  className = 'h-screen w-full',
  style,
  fadeSettings,
  blurSettings,
}: InfiniteGalleryProps) {
  const [webglSupported] = useState(() => {
    try {
      const canvas = document.createElement('canvas')
      return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    } catch {
      return false
    }
  })
  const [isNarrow, setIsNarrow] = useState(() => window.matchMedia('(max-width: 640px)').matches)
  const [focusIndex, setFocusIndex] = useState<number | null>(null)
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  // This page is reached behind a lazy-loaded route, whose Suspense fallback
  // (the site's own loading spinner) runs a continuous Framer Motion
  // animation — a rotating ring built from ~30 individually-animated
  // characters — for however long the chunk takes to arrive, which on a
  // slow connection or an underpowered GPU can be several seconds. Creating
  // a WebGL context the INSTANT that unmounts, while the compositor is still
  // mid-flight on that animation, reliably lost the context in testing
  // (reproduced by forcing the same sequence in isolation — an identical
  // mount with no preceding animation never failed, at any scene size
  // tried). A short settle window between "this page mounted" and "actually
  // create the WebGL context" is the standard mitigation for exactly this
  // race, and costs nothing visible — two frames is not a loading state a
  // visitor will ever consciously see.
  const [readyForCanvas, setReadyForCanvas] = useState(false)
  const [canvasKey, setCanvasKey] = useState(0)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)')
    const onChange = () => setIsNarrow(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setReadyForCanvas(true), 400)
    return () => clearTimeout(t)
  }, [])

  // Fewer planes and a capped device pixel ratio on small screens — a phone
  // GPU paying for 10 shaded, blurred, always-animating planes is exactly
  // the kind of thing that makes a page feel broken rather than polished.
  const effectiveVisibleCount = visibleCount ?? (isNarrow ? 6 : 10)
  const dpr = Math.min(window.devicePixelRatio || 1, isNarrow ? 1.5 : 2)

  if (images.length === 0) return null

  if (!webglSupported) {
    return (
      <div className={className} style={style}>
        <FallbackGallery images={images} onImageTap={setOpenIndex} />
        {openIndex != null ? <Lightbox image={images[openIndex]} onClose={() => setOpenIndex(null)} /> : null}
      </div>
    )
  }

  const focused = focusIndex != null ? images[focusIndex] : null

  return (
    <div className={`relative ${className}`} style={style}>
      {readyForCanvas ? (
        <Canvas
          key={canvasKey}
          camera={{ position: [0, 0, 0], fov: 55 }}
          gl={{ antialias: !isNarrow, alpha: true }}
          dpr={dpr}
          // Without this, a touch-drag on the canvas is ambiguous to the
          // browser — it may interpret it as a page scroll/pull-to-refresh
          // gesture and either fight our pointer handlers or outright
          // cancel them mid-drag (see useDragScroll's pointercancel
          // handling below). `touch-action: none` tells the browser this
          // element owns 100% of touch gestures, so ours is the only one
          // running.
          style={{ touchAction: 'none' }}
          onCreated={({ gl: renderer }) => {
            // By default a lost WebGL context is NOT restorable — the
            // browser only keeps it recoverable if something calls
            // `preventDefault()` on the `webglcontextlost` event. Without
            // this, whatever triggers a loss (this project measured one
            // reliably: the site's own loading-screen animation still
            // settling right as the canvas is created — see the settle
            // delay above) leaves the gallery permanently blank with no
            // way back short of a full page reload. `key`-bumping the
            // Canvas on `webglcontextrestored` gives three.js a completely
            // fresh context and re-uploads every texture and shader from
            // scratch, rather than trying to patch a half-recovered one.
            const canvasEl = renderer.domElement
            canvasEl.addEventListener(
              'webglcontextlost',
              (e) => e.preventDefault(),
              false
            )
            canvasEl.addEventListener(
              'webglcontextrestored',
              () => setCanvasKey((k) => k + 1),
              false
            )
          }}
        >
          <GalleryScene
            images={images}
            speed={speed}
            visibleCount={effectiveVisibleCount}
            fadeSettings={fadeSettings}
            blurSettings={blurSettings}
            paused={openIndex != null}
            onFocusChange={setFocusIndex}
            onImageTap={setOpenIndex}
          />
        </Canvas>
      ) : null}

      {/* Caption for whatever is currently in focus. Pointer-events off so it
          never steals the drag-to-scroll / tap-to-open gestures on the
          canvas beneath it. */}
      {focused?.caption ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center px-4 md:bottom-10">
          <span className="rounded-full bg-black/55 px-4 py-2 text-xs font-medium tracking-wide text-white backdrop-blur-sm md:text-sm">
            {focused.caption}
          </span>
        </div>
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 bottom-2 text-center font-mono text-[10px] uppercase tracking-wide text-white/50 md:hidden">
        Swipe to browse · tap a photo to open
      </div>

      {openIndex != null ? <Lightbox image={images[openIndex]} onClose={() => setOpenIndex(null)} /> : null}
    </div>
  )
}
