/**
 * Microsoft Clarity — session recordings and heatmaps for the public site.
 *
 * The project id can come from either of two places, checked in order:
 *
 *   1. `VITE_CLARITY_PROJECT_ID`, a build-time env var — for a deploy
 *      pipeline that already manages secrets that way.
 *   2. `publicSiteData/settings.clarityProjectId` in Firestore — set from
 *      the portal's Site page (SiteHub.tsx), no rebuild or redeploy
 *      required. This is what actually turns the heatmap on for anyone
 *      running this project without their own CI: an admin pastes the id
 *      once, and both this app (which loads the tracking snippet) and the
 *      portal (whose Site page links out to the dashboard) read the same
 *      value, so they can never disagree about whether Clarity is
 *      connected.
 *
 * Nothing is hardcoded: a placeholder id would either be a fake that
 * silently reports nothing, or someone's real project catching traffic
 * that isn't theirs. With neither source set, this loads nothing and sends
 * nothing anywhere — the site runs exactly as it does today.
 *
 * Clarity's own script is what does the collecting; this file only decides
 * whether to load it and stays out of the way otherwise. Heatmaps and
 * recordings are viewed on clarity.microsoft.com — the portal's Site page
 * links out to that dashboard rather than trying to embed it, since Clarity
 * does not offer a public embeddable heatmap view.
 */

import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

declare global {
  interface Window {
    clarity?: (...args: unknown[]) => void;
  }
}

function loadSnippet(projectId: string): void {
  // Official loader, inlined rather than fetched as a separate <script src>
  // file so there is exactly one network request and no build-time asset to
  // manage — this is what clarity.microsoft.com itself hands out as the
  // install snippet.
  (function (
    win: Window,
    doc: Document,
    tag: string,
    key: string,
    id: string,
  ) {
    type ClarityFn = ((...args: unknown[]) => void) & { q?: unknown[] };
    const w = win as Window & Record<string, ClarityFn | undefined>;
    w[key] = (w[key] || function (...args: unknown[]) {
      (w[key]!.q = w[key]!.q || []).push(args);
    }) as ClarityFn;
    const script = doc.createElement(tag) as HTMLScriptElement;
    script.async = true;
    script.src = 'https://www.clarity.ms/tag/' + id;
    const first = doc.getElementsByTagName(tag)[0];
    first.parentNode?.insertBefore(script, first);
  })(window, document, 'script', 'clarity', projectId);
}

export async function initClarity(): Promise<void> {
  const buildTimeId = import.meta.env.VITE_CLARITY_PROJECT_ID as string | undefined;
  if (buildTimeId) {
    loadSnippet(buildTimeId);
    return;
  }

  try {
    const snap = await getDoc(doc(db, 'publicSiteData', 'settings'));
    const firestoreId = snap.data()?.clarityProjectId as string | undefined;
    if (firestoreId) loadSnippet(firestoreId);
  } catch {
    // publicSiteData is world-readable, so this only fails offline or on a
    // genuine outage — either way, the site works with no tracking rather
    // than blocking on it.
  }
}
