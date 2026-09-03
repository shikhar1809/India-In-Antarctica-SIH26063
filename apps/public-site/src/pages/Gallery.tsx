import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import InfiniteGallery from '../components/ui/3d-gallery-photography'
import { CoverflowCarousel, type CoverflowSlide } from '../components/ui/coverflow-carousel'
import { buildGallery } from '../lib/galleryArt'
import './Gallery.css'

const SCENES = buildGallery()

const SWIPE_SLIDES: CoverflowSlide[] = SCENES.map((scene) => ({
  src: scene.src,
  alt: scene.title,
  title: scene.title,
  subtitle: scene.caption,
}))

type Mode = 'scroll' | 'swipe'

export default function Gallery() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('scroll')

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
        <span className="gal-count">{SCENES.length} scenes</span>

        <div className="gal-mode-toggle">
          <div className="gal-mode-toggle-pill" role="radiogroup" aria-label="Browsing mode">
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
        </div>
      </header>

      {mode === 'scroll' ? (
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
      )}
    </div>
  )
}
