import { useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, Pause, Volume2, Volume1, VolumeX } from 'lucide-react'
import './video-player.css'

function fmt(s: number) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function Track({
  value,
  onChange,
  className,
}: {
  value: number
  onChange: (v: number) => void
  className?: string
}) {
  return (
    <div
      className={`vp-track ${className ?? ''}`}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        onChange(Math.min(Math.max(((e.clientX - r.left) / r.width) * 100, 0), 100))
      }}
    >
      <motion.div
        className="vp-track-fill"
        style={{ width: `${value}%` }}
        animate={{ width: `${value}%` }}
        initial={false}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      />
    </div>
  )
}

export default function VideoPlayer({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [vol, setVol] = useState(1)
  const [muted, setMuted] = useState(false)
  const [progress, setProgress] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [show, setShow] = useState(false)
  const [cur, setCur] = useState(0)
  const [dur, setDur] = useState(0)

  /* Ask the element to change state; never assume it did. play() can be
     refused outright (autoplay policy), and playback can also stop for
     reasons that never go through this handler at all — the clip ending,
     or the OS pausing media. The <video>'s own play/pause events are the
     only account of what is actually happening, so those drive `playing`
     and this just makes the request. */
  const toggle = () => {
    if (!ref.current) return
    if (ref.current.paused) void ref.current.play().catch(() => {})
    else ref.current.pause()
  }

  const onTime = () => {
    if (!ref.current) return
    const p = (ref.current.currentTime / ref.current.duration) * 100
    setProgress(isFinite(p) ? p : 0)
    setCur(ref.current.currentTime)
    setDur(ref.current.duration)
  }

  const seek = (v: number) => {
    if (!ref.current?.duration) return
    const t = (v / 100) * ref.current.duration
    if (isFinite(t)) { ref.current.currentTime = t; setProgress(v) }
  }

  const changeVol = (v: number) => {
    if (!ref.current) return
    const nv = v / 100
    ref.current.volume = nv
    setVol(nv)
    setMuted(nv === 0)
  }

  const toggleMute = () => {
    if (!ref.current) return
    ref.current.muted = !muted
    setMuted(!muted)
    if (!muted) { setVol(0) } else { setVol(1); ref.current.volume = 1 }
  }

  const changeSpeed = (s: number) => {
    if (ref.current) ref.current.playbackRate = s
    setSpeed(s)
  }

  const VIcon = muted ? VolumeX : vol > 0.5 ? Volume2 : Volume1

  return (
    /* The player mounts at its resting state rather than fading in: the video
       is the content, and an entrance animation that stalls would leave it
       invisible. Only the hover controls animate, where hidden is correct. */
    <div
      className="vp-wrap"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <video
        ref={ref}
        className="vp-video"
        src={src}
        onTimeUpdate={onTime}
        onClick={toggle}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
      />

      {/* Always mounted, shown/hidden by class rather than by mounting: an
          overlay that covers the video must never be able to strand on
          screen, and an unmount that waits on an animation can (a hidden
          tab gets no frames, so the exit never finishes). CSS handles the
          fade, and `playing` alone decides whether it is hit-testable. */}
      <button
        className={`vp-big-play ${playing ? 'vp-big-play--hidden' : ''}`}
        onClick={toggle}
        aria-label="Play"
        aria-hidden={playing}
        tabIndex={playing ? -1 : 0}
      >
        <Play size={36} fill="currentColor" />
      </button>

      <AnimatePresence>
        {show && (
          <motion.div
            className="vp-controls"
            initial={{ y: 20, opacity: 0, filter: 'blur(8px)' }}
            animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
            exit={{ y: 20, opacity: 0, filter: 'blur(8px)' }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          >
            <div className="vp-row vp-row--seek">
              <span className="vp-time">{fmt(cur)}</span>
              <Track value={progress} onChange={seek} className="vp-seek" />
              <span className="vp-time">{fmt(dur)}</span>
            </div>

            <div className="vp-row vp-row--btns">
              <div className="vp-row--left">
                <button className="vp-btn" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
                  {playing ? <Pause size={18} /> : <Play size={18} fill="currentColor" />}
                </button>
                <button className="vp-btn" onClick={toggleMute} aria-label="Toggle mute">
                  <VIcon size={18} />
                </button>
                <Track value={muted ? 0 : vol * 100} onChange={changeVol} className="vp-vol" />
              </div>

              <div className="vp-row--right">
                {[0.5, 1, 1.5, 2].map((s) => (
                  <button
                    key={s}
                    className={`vp-btn vp-speed ${speed === s ? 'vp-speed--active' : ''}`}
                    onClick={() => changeSpeed(s)}
                  >
                    {s}×
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
