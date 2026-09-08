import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import InfiniteGallery from '../components/ui/3d-gallery-photography'
import { CoverflowCarousel, type CoverflowSlide } from '../components/ui/coverflow-carousel'
import VideoPlayer from '../components/ui/video-player'
import { buildGallery } from '../lib/galleryArt'
import { useRepository, STATION_LABELS } from '../api/repository'
import type { RepositoryRecord } from '../repository/contract'
import './Gallery.css'

const SCENES = buildGallery()

const SWIPE_SLIDES: CoverflowSlide[] = SCENES.map((scene) => ({
  src: scene.src,
  alt: scene.title,
  title: scene.title,
  subtitle: scene.caption,
}))

/* Curated Antarctic stock footage — free Pexels licence, hotlinked from their
   CDN. Every URL here was checked to actually resolve; Pexels ids are not
   guessable, so if one ever 404s it needs re-sourcing, not editing by hand. */
const STATIC_VIDEOS = [
  {
    id: 'px-15924008',
    title: 'Icy mountains of Antarctica, seen from the ship',
    station: 'maitri',
    year: '2024',
    videoUrl: 'https://videos.pexels.com/video-files/15924008/15924008-hd_1920_1080_30fps.mp4',
  },
  {
    id: 'px-6299731',
    title: 'Penguin colony on exposed rock',
    station: 'bharati',
    year: '2024',
    videoUrl: 'https://videos.pexels.com/video-files/6299731/6299731-hd_1920_1080_30fps.mp4',
  },
  {
    id: 'px-36560252',
    title: 'Icebreaker under way through frozen sea',
    station: 'himadri',
    year: '2023',
    videoUrl: 'https://videos.pexels.com/video-files/36560252/15501274_1920_1080_30fps.mp4',
  },
  {
    id: 'px-35075239',
    title: 'Lichen on the rocky Antarctic coastline',
    station: 'bharati',
    year: '2023',
    videoUrl: 'https://videos.pexels.com/video-files/35075239/14858198_1920_1080_60fps.mp4',
  },
  {
    id: 'px-34492363',
    title: 'Icebergs from the air',
    station: 'maitri',
    year: '2023',
    videoUrl: 'https://videos.pexels.com/video-files/34492363/14614698_1920_1080_30fps.mp4',
  },
  {
    id: 'px-6299732',
    title: 'Whales surfacing in the Southern Ocean',
    station: 'bharati',
    year: '2022',
    videoUrl: 'https://videos.pexels.com/video-files/6299732/6299732-hd_1920_1080_30fps.mp4',
  },
  {
    id: 'px-8318620',
    title: 'Glacier face at close range',
    station: 'maitri',
    year: '2022',
    videoUrl: 'https://videos.pexels.com/video-files/8318620/8318620-hd_1920_1080_25fps.mp4',
  },
]

type VideoItem = { id: string; title: string; station: string; year: string; videoUrl: string }

type Mode = 'scroll' | 'swipe'
type Media = 'photos' | 'videos'

export default function Gallery() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('scroll')
  const [media, setMedia] = useState<Media>('photos')
  const [vidIndex, setVidIndex] = useState(0)

  const { records } = useRepository()
  const liveVideos = useMemo(
    () => records.filter((r): r is RepositoryRecord & { videoUrl: string } => !!r.videoUrl),
    [records],
  )

  // Live published videos first, then the curated static set as fill
  const allVideos: VideoItem[] = useMemo(() => {
    const live: VideoItem[] = liveVideos.map((r) => ({
      id: r.id,
      title: r.title.replace(/\n/g, ' '),
      station: r.station,
      year: r.year,
      videoUrl: r.videoUrl,
    }))
    return [...live, ...STATIC_VIDEOS]
  }, [liveVideos])

  const current = allVideos[vidIndex] ?? null
  const prev = () => setVidIndex((i) => (i - 1 + allVideos.length) % allVideos.length)
  const next = () => setVidIndex((i) => (i + 1) % allVideos.length)

  return (
    <div className="gal-page">
      <header className="gal-header">
        <button type="button" className="gal-back" onClick={() => navigate('/')}>
          <span aria-hidden>↖</span> Back
        </button>
        <div className="gal-brand">
          <img src="/logo.png" alt="" className="gal-brand-mark" />
          Antarctic Gallery
        </div>
        <span className="gal-count">
          {media === 'photos'
            ? `${SCENES.length} scenes`
            : `${allVideos.length} video${allVideos.length === 1 ? '' : 's'}`}
        </span>

        <div className="gal-toggles">
          {/* Row 1 — media type */}
          <div className="gal-mode-toggle-pill" role="radiogroup" aria-label="Media type">
            <button
              type="button"
              role="radio"
              aria-checked={media === 'photos'}
              className={media === 'photos' ? 'is-active' : ''}
              onClick={() => setMedia('photos')}
            >
              Photos
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={media === 'videos'}
              className={media === 'videos' ? 'is-active' : ''}
              onClick={() => setMedia('videos')}
            >
              Videos
            </button>
          </div>

          {/* Row 2 — browsing mode (photos only) */}
          {media === 'photos' && (
            <div className="gal-mode-toggle-pill gal-mode-toggle-pill--sub" role="radiogroup" aria-label="Browsing mode">
              <button
                type="button"
                role="radio"
                aria-checked={mode === 'scroll'}
                className={mode === 'scroll' ? 'is-active' : ''}
                onClick={() => setMode('scroll')}
              >
                Scroll
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={mode === 'swipe'}
                className={mode === 'swipe' ? 'is-active' : ''}
                onClick={() => setMode('swipe')}
              >
                Swipe
              </button>
            </div>
          )}
        </div>
      </header>

      {media === 'photos' ? (
        mode === 'scroll' ? (
          <InfiniteGallery images={SCENES} speed={1.2} className="gal-canvas" />
        ) : (
          <div className="gal-swipe">
            <CoverflowCarousel
              slides={SWIPE_SLIDES}
              showCaption
              showNavigation
              showPagination
              label="Antarctic gallery, swipe view"
            />
          </div>
        )
      ) : (
        <div className="gal-videos">
          {allVideos.length === 0 ? (
            <p className="gal-videos-empty">
              No videos published yet. Field footage appears here the moment a station report
              carrying one is approved for publication.
            </p>
          ) : current ? (
            <div className="gal-video-stage">
              {/* prev/next side buttons */}
              <button
                className="gal-video-nav gal-video-nav--prev"
                onClick={prev}
                aria-label="Previous video"
              >
                <ChevronLeft size={22} />
              </button>

              {/* Keyed remount drives the slide-in, and the slide-in is a CSS
                  animation rather than a JS one on purpose: the resting state
                  is the visible state, so the clip and its caption are legible
                  even if the animation never runs (a backgrounded tab gets no
                  frames). Nothing here is parked at opacity 0 waiting to be
                  animated into existence. */}
              <div className="gal-video-main">
                <div key={current.id} className="gal-video-slide">
                  <VideoPlayer key={current.id} src={current.videoUrl} />
                  <div className="gal-video-meta">
                    <strong>{current.title}</strong>
                    <span>
                      {STATION_LABELS[current.station as keyof typeof STATION_LABELS] ?? 'NCPOR'}
                      {' '}·{' '}{current.year}
                    </span>
                  </div>
                </div>
              </div>

              <button
                className="gal-video-nav gal-video-nav--next"
                onClick={next}
                aria-label="Next video"
              >
                <ChevronRight size={22} />
              </button>

              {/* thumbnail strip */}
              <div className="gal-video-strip">
                {allVideos.map((v, i) => (
                  <button
                    key={v.id}
                    className={`gal-video-thumb ${i === vidIndex ? 'is-active' : ''}`}
                    onClick={() => setVidIndex(i)}
                    aria-label={v.title}
                  >
                    <video src={v.videoUrl} preload="metadata" muted />
                    <span className="gal-video-thumb-title">{v.title}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
