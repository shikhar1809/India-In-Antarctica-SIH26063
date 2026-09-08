/**
 * Microsoft Clarity — session recordings and heatmaps for the public site.
 *
 * Loaded conditionally, on the real project id, rather than shipped with a
 * placeholder baked in: a hardcoded id would either be a fake that silently
 * reports nothing, or someone's real project catching traffic that isn't
 * theirs. Set `VITE_CLARITY_PROJECT_ID` (in `.env`, or as a Firebase Hosting
 * build-time env var) and this loads the official snippet on first paint;
 * leave it unset and the site runs exactly as it does today, with nothing
 * added to the page and nothing sent anywhere.
 *
 * Clarity's own script is what does the collecting; this file only decides
 * whether to load it and stays out of the way otherwise. Heatmaps and
 * recordings are viewed on clarity.microsoft.com — the portal's Site
 * Management page links out to that dashboard rather than trying to embed
 * it, since Clarity does not offer a public embeddable heatmap view.
 */

declare global {
  interface Window {
    clarity?: (...args: unknown[]) => void;
  }
}

export function initClarity(): void {
  const projectId = import.meta.env.VITE_CLARITY_PROJECT_ID as string | undefined;
  if (!projectId) return;

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
