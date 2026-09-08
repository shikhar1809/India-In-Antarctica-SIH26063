import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
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

function App() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/archive" element={<Archive />} />
        {/* Deep link into one record — the target Home's bookshelf jumps to
            so "open this book" never has to reopen Archive's own picker. */}
        <Route path="/archive/:id" element={<Archive />} />
        <Route path="/ask" element={<Ask />} />
        <Route path="/gallery" element={<Gallery />} />
      </Routes>
    </Suspense>
  );
}

export default App;
