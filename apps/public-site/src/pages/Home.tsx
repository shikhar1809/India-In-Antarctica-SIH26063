import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Render } from '@measured/puck';
import { config } from '../puck.config';
import RouteLoading from '../components/RouteLoading';
import BookShelf from '../components/ui/book-shelf';
import { AskScientistBanner } from '../components/AskScientistBanner';
import './Home.css';
import '../blocks.css';

/**
 * The page's block order lives in Firestore (`publicSiteData/home_puck`),
 * edited from the Site Editor — placing a new block permanently means an
 * admin dragging it into position there, and this session has no admin
 * session to do that from. Splicing it in here, at render time, gets the
 * gallery onto the live page in the right spot (right after "India's Polar
 * Legacy") without needing that login or touching the CMS document; an
 * admin can still later drag the real GalleryBlock around in the editor
 * exactly like any other block, since it's a first-class entry in
 * puck.config.tsx, not a special case bolted onto this page.
 */
function withGalleryAfterLegacy(data: any) {
  const content = data?.content;
  if (!Array.isArray(content)) return data;

  let next = [...content];

  // 0. Swap the plain "India's Polar Legacy" TextBlock for the parallax
  // hero version — same trick as the splice below: a render-time
  // transform of the fetched data, not a write back to Firestore, so an
  // admin can still replace it with a plain TextBlock again from the
  // editor at any time.
  const legacyTextIdx = next.findIndex(
    (b: any) => b?.type === 'TextBlock' && b?.props?.heading === "India's Polar Legacy"
  );
  if (legacyTextIdx !== -1) {
    next[legacyTextIdx] = { ...next[legacyTextIdx], type: 'ParallaxLegacyBlock' };
  }

  // 0b. Drop "Latest Updates" from the page entirely — same render-time
  // transform trick as everything else here, not a write back to
  // Firestore, so an admin can still drag a fresh AnnouncementsBlock back
  // in from the editor if they want the section again.
  next = next.filter(
    (b: any) => !(b?.type === 'AnnouncementsBlock' && b?.props?.heading === 'Latest Updates')
  );

  // 1. Ensure GalleryBlock is after "India's Polar Legacy"
  const legacyIdx = next.findIndex((b: any) => b?.props?.heading === "India's Polar Legacy");
  if (legacyIdx !== -1 && next[legacyIdx + 1]?.type !== 'GalleryBlock') {
    next.splice(legacyIdx + 1, 0, { type: 'GalleryBlock', props: { id: 'gallery-station-photos' } });
  }

  // (Removed BannerBlock injection as user wants the CTA inside the gallery itself)

  // Remove any BannerBlock that might have been added in the previous step
  const galleryIdx = next.findIndex((b: any) => b?.type === 'GalleryBlock');
  if (galleryIdx !== -1 && next[galleryIdx + 1]?.type === 'BannerBlock' && next[galleryIdx + 1]?.props?.ctaUrl === '/gallery') {
    next.splice(galleryIdx + 1, 1);
  }

  return { ...data, content: next };
}

export default function Home() {
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [maintenanceMode, setMaintenanceMode] = useState(false);

  useEffect(() => {
    const startTime = Date.now();
    (async () => {
      try {
        const [snap, settingsSnap] = await Promise.all([
          getDoc(doc(db, 'publicSiteData', 'home_puck')),
          getDoc(doc(db, 'publicSiteData', 'settings'))
        ]);
        
        setData(snap.exists() ? snap.data() : {});
        if (settingsSnap.exists()) {
          setMaintenanceMode(settingsSnap.data()?.maintenanceMode || false);
        }
      } catch { setData({}); }
      
      const elapsed = Date.now() - startTime;
      const minDelay = 5000; // Force 5s delay so they can read the loading text
      if (elapsed < minDelay) {
        setTimeout(() => setLoading(false), minDelay - elapsed);
      } else {
        setLoading(false);
      }
    })();
  }, []);

  // Close menu on resize to desktop
  useEffect(() => {
    const handler = () => { if (window.innerWidth >= 768) setMenuOpen(false); };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const renderData = useMemo(() => withGalleryAfterLegacy(data), [data]);

  if (loading) return <RouteLoading />;

  if (maintenanceMode) return (
    <div className="home-page" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center', background: 'radial-gradient(120% 100% at 50% -10%, #102a44 0%, #061019 55%, #030810 100%)', color: '#e6f2fb', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <img src="/maintenance-icon.png" alt="Under Maintenance" style={{ width: 240, marginBottom: '2rem', filter: 'drop-shadow(0 0 24px rgba(95,217,255,0.15))' }} />
      <h1 style={{ fontFamily: 'var(--font-disp)', fontSize: '3rem', margin: '0 0 1rem 0' }}>Under Maintenance</h1>
      <p style={{ color: 'var(--ice-dim)', maxWidth: '400px', lineHeight: '1.6' }}>The Knowledge Repository is currently being updated. Please check back shortly.</p>
    </div>
  );

  return (
    <div className="home-page">
      {/* ── Sticky Header ── */}
      <header className="home-header">
        <Link to="/" className="home-header-brand">
          <img src="/logo.png" alt="IIA" />
          <span>India In Antarctica</span>
        </Link>

        {/* Desktop Nav — same-app routes use <Link> so the click swaps the
            route client-side. A plain <a href> here reloads the page from
            scratch: the whole ~1.7 MB bundle is fetched and re-parsed again
            even though it is already sitting in memory, which is what "the
            Archive takes too long to open" actually was. */}
        <nav className="home-header-nav">
          <Link to="/">Home</Link>
          <Link to="/archive">Knowledge Repository</Link>
          <Link to="/gallery">Gallery</Link>
          <Link to="/ask">Ask a Scientist</Link>
          <a href="https://iia-game.web.app" target="_blank" rel="noreferrer">PolarQuest</a>
          <a href="https://iia-portal.web.app" className="portal-link">Portal Login</a>
        </nav>

        {/* Hamburger */}
        <button
          className={`home-header-menu-btn ${menuOpen ? 'open' : ''}`}
          onClick={() => setMenuOpen(o => !o)}
          aria-label="Toggle menu"
        >
          <span /><span /><span />
        </button>
      </header>

      {/* ── Mobile Nav Drawer ── */}
      <nav className={`home-mobile-nav ${menuOpen ? 'open' : ''}`}>
        {[
          { label: 'Home', href: '/', internal: true },
          { label: 'Knowledge Repository', href: '/archive', internal: true },
          { label: 'Gallery', href: '/gallery', internal: true },
          { label: 'Ask a Scientist', href: '/ask', internal: true },
          { label: 'PolarQuest', href: 'https://iia-game.web.app', internal: false },
        ].map(link =>
          link.internal ? (
            <Link key={link.label} to={link.href} onClick={() => setMenuOpen(false)}>{link.label}</Link>
          ) : (
            <a key={link.label} href={link.href} onClick={() => setMenuOpen(false)}>{link.label}</a>
          )
        )}
        <a href="https://iia-portal.web.app" className="portal-link-mobile" onClick={() => setMenuOpen(false)}>
          Portal Login
        </a>
      </nav>

      {/* ── Page Content ── */}
      <main className="home-main">
        {data && Object.keys(data).length > 0
          ? <Render config={config} data={renderData} />
          : (
            <div style={{ textAlign: 'center', padding: '8rem 2rem', color: 'var(--ice-dim)' }}>
              <h2 style={{ color: 'var(--cyan)', marginBottom: '1rem' }}>Site Not Configured</h2>
              <p>An admin can build this page in the <a href="https://iia-portal.web.app/editor" style={{ color: 'var(--saffron)' }}>Site Editor</a>.</p>
            </div>
          )
        }
      </main>

      {/* ── The Complete Shelf ── */}
      {/* Clicking a book here jumps straight to its record on the Archive
        * page — no need to open the picker there and find it again. */}
      <BookShelf onOpenRecord={(id) => navigate(`/archive/${id}`)} />

      {/* ── Ask a scientist ──
        * Under the shelf on purpose: the shelf is what has been published,
        * this is how a student starts something new. */}
      <AskScientistBanner />

      {/* ── Footer ── */}
      <footer className="home-footer">
        <div className="footer-brand">
          <img src="/logo.png" alt="IIA" />
          <h3>India In Antarctica</h3>
          <p>An outreach initiative by the Ministry of Earth Sciences and the National Centre for Polar and Ocean Research.</p>
        </div>
        <div className="footer-links">
          <h4>Quick Links</h4>
          <ul>
            <li><Link to="/archive">Knowledge Repository</Link></li>
            <li><Link to="/gallery">Gallery</Link></li>
            <li><Link to="/ask">Ask a Scientist</Link></li>
            <li><a href="https://iia-portal.web.app">Outreach Portal</a></li>
            <li><a href="https://iia-game.web.app">PolarQuest 3D</a></li>
          </ul>
        </div>
        <div className="footer-copy">
          <p>© {new Date().getFullYear()} Ministry of Earth Sciences</p>
          <p>National Centre for Polar and Ocean Research</p>
          <p>Headland Sada, Vasco-da-Gama, Goa — 403 804</p>
        </div>
      </footer>
    </div>
  );
}
