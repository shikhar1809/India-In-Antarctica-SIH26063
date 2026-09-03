import CircularText from './CircularText';
import './CircularText.css';

/**
 * RouteLoading — the same full-screen mark used on the very first load of
 * the site (see Home.tsx's own boot screen), reused here as the Suspense
 * fallback for every lazy-loaded route.
 *
 * Routes are code-split (see App.tsx) specifically so a page that needs
 * none of another page's dependencies never downloads them — Archive does
 * not need Firestore, Puck or Recharts, so it no longer has to wait behind
 * Home's stack just to open. Splitting means a route's own chunk still has
 * to be fetched at least once, though: this is what covers that gap, so a
 * slower connection sees the site's own mark instead of a blank page.
 */
export default function RouteLoading() {
  return (
    <div className="loading-screen-container">
      <div className="loading-logo-container">
        <img src="/logo.png" alt="IIA Logo" className="loading-logo" />
      </div>
      <CircularText text="LOADING*YOUR*POLAR*EXPEDITION*" onHover="speedUp" spinDuration={20} />
    </div>
  );
}
