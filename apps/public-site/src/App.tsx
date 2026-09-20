import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import RouteLoading from './components/RouteLoading';

// Each page pulls in a different, non-overlapping stack — Home alone drags
// in Firestore, Puck and Recharts, none of which Archive or Ask need. Under
// a single static bundle every route paid for all three regardless of which
// page was actually opened, which is why "Archive" being one click away
// from Home still meant downloading and parsing Home's own dependencies
// first. Splitting per route means a route's chunk contains only what that
// route uses, and — since it is already a separate request — the browser
// can cache it independently of the others.
const Home = lazy(() => import('./pages/Home'));
const Archive = lazy(() => import('./pages/Archive'));
const Ask = lazy(() => import('./pages/Ask'));
const Gallery = lazy(() => import('./pages/Gallery'));

/** /archive/IIA-2026-0001 → /knowledge-repository/IIA-2026-0001 */
function ArchiveRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/knowledge-repository/${id ?? ''}`} replace />;
}

function App() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/knowledge-repository" element={<Archive />} />
        {/* Deep link into one record — the target Home's bookshelf jumps to
            so "open this book" never has to reopen the picker. */}
        <Route path="/knowledge-repository/:id" element={<Archive />} />
        {/* The address this page had until it was renamed. Every record
            already posted to social media, cited in a paper or printed on a
            page carries an /archive link, so the old path redirects rather
            than 404s — permanently, and keeping the record id. */}
        <Route path="/archive" element={<Navigate to="/knowledge-repository" replace />} />
        <Route path="/archive/:id" element={<ArchiveRedirect />} />
        <Route path="/ask" element={<Ask />} />
        <Route path="/gallery" element={<Gallery />} />
      </Routes>
    </Suspense>
  );
}

export default App;
