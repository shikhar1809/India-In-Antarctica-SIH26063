/**
 * Turning the rendered frame into a PNG the publisher can actually post.
 *
 * The frame is real DOM, so the export is a serialisation rather than a
 * re-draw: the node is cloned, its images and fonts are inlined as data
 * URIs (nothing inside an SVG `foreignObject` can reach the network), and
 * the result is rasterised through a canvas at the platform's native size.
 *
 * Doing it this way means there is exactly one layout implementation. What
 * the publisher approved on screen is what lands in the file — a separate
 * canvas-drawing path would drift from the preview the first time anyone
 * touched a template.
 */

import { PLATFORM_SPECS } from './brand';
import type { PlatformId } from './brand';

/* Fetch-and-inline is the expensive part of an export and the answer never
 * changes within a session, so both caches live for the page's lifetime. */
let fontCssCache: string | null = null;
const imageCache = new Map<string, string>();

/** The function that hands back a Storage object with CORS headers on it.
 *  The bucket itself has none, so a direct fetch of a photograph is refused
 *  by the browser and the export comes out with everything except the
 *  picture. See functions/imageproxy.js. */
const IMAGE_PROXY = 'https://asia-south1-indiainantartica.cloudfunctions.net/studio/image';

async function fetchImage(url: string): Promise<Response> {
  try {
    const direct = await fetch(url, { mode: 'cors' });
    if (direct.ok) return direct;
  } catch {
    /* CORS refusal lands here, not in `ok` — fall through to the proxy. */
  }
  return fetch(`${IMAGE_PROXY}?url=${encodeURIComponent(url)}`);
}

async function toDataUri(url: string): Promise<string> {
  const hit = imageCache.get(url);
  if (hit) return hit;

  const res = await fetchImage(url);
  if (!res.ok) throw new Error(`Could not read image (${res.status})`);
  const blob = await res.blob();

  const data = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(new Error('Could not encode image'));
    fr.readAsDataURL(blob);
  });

  imageCache.set(url, data);
  return data;
}

/**
 * The two display faces, inlined. Without this the export silently falls
 * back to a system font and stops matching the preview — the classic
 * foreignObject failure, and an invisible one until someone compares files.
 */
async function inlineFonts(): Promise<string> {
  if (fontCssCache !== null) return fontCssCache;

  try {
    const href =
      'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap';
    const cssRes = await fetch(href);
    let css = await cssRes.text();

    const urls = [...css.matchAll(/url\((https:\/\/[^)]+\.woff2)\)/g)].map((m) => m[1]);
    const unique = [...new Set(urls)];

    const encoded = await Promise.all(
      unique.map(async (u) => {
        try {
          return [u, await toDataUri(u)] as const;
        } catch {
          return [u, null] as const;
        }
      }),
    );

    for (const [remote, data] of encoded) {
      if (data) css = css.split(remote).join(data);
    }

    fontCssCache = css;
    return css;
  } catch {
    // An export with fallback type still beats no export at all.
    fontCssCache = '';
    return '';
  }
}

/** The frame's own stylesheet, restated for the serialised copy. Kept in
 *  step with PostCanvas.css by hand — it is short and structural only. */
const FRAME_CSS = `
.pc-frame { position: relative; overflow: hidden; isolation: isolate; }
.pc-photo { position: absolute; overflow: hidden; }
.pc-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.pc-scrim { position: absolute; inset: 0; }
.pc-rule { position: absolute; border-radius: 999px; }
.pc-text { position: absolute; display: flex; flex-direction: column; }
.pc-kicker { text-transform: uppercase; font-weight: 500; display: block; }
.pc-stat { font-weight: 700; display: block; font-variant-numeric: tabular-nums; }
.pc-stat-label { display: block; }
.pc-headline { margin: 0; font-weight: 600; text-wrap: balance; }
.pc-standfirst { margin: 0; font-weight: 400; }
.pc-identity { position: absolute; display: flex; align-items: center; }
.pc-identity-text { display: flex; flex-direction: column; align-items: flex-start; }
* { box-sizing: border-box; }
`;

/** The XML parser treats style text as character data, so the three
 *  markup-significant characters have to be escaped before it is embedded. */
function escapeXml(css: string): string {
  return css.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export interface ExportOptions {
  /** Multiplier on the native size. 2 gives a retina-grade file. */
  pixelRatio?: number;
}

/**
 * Rasterise a rendered `.pc-frame` node to a PNG blob at native size.
 *
 * @param node     the element `PostCanvas` was given as `exportRef`
 * @param platform decides the output dimensions
 */
export async function exportPng(
  node: HTMLElement,
  platform: PlatformId,
  opts: ExportOptions = {},
): Promise<Blob> {
  const spec = PLATFORM_SPECS[platform];
  const ratio = opts.pixelRatio ?? 2;

  const clone = node.cloneNode(true) as HTMLElement;
  // The preview is scaled down with a transform; the export is not.
  clone.style.transform = 'none';
  clone.style.width = `${spec.w}px`;
  clone.style.height = `${spec.h}px`;
  clone.style.position = 'relative';

  // Every image has to travel with the markup — foreignObject has no network.
  const images = [...clone.querySelectorAll('img')];
  await Promise.all(
    images.map(async (img) => {
      const src = img.getAttribute('src');
      if (!src || src.startsWith('data:')) return;
      try {
        img.setAttribute('src', await toDataUri(new URL(src, window.location.href).href));
      } catch {
        // A missing photograph should not fail the whole export.
        img.remove();
      }
    }),
  );

  const fontCss = await inlineFonts();

  /* foreignObject content is parsed as XML, not HTML, so `outerHTML` will
   * not do: it leaves void elements like <img> unclosed and the whole SVG
   * fails to parse — silently, as an image load error. XMLSerializer emits
   * well-formed XML from the same DOM. */
  const host = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
  host.appendChild(clone);
  const markup = new XMLSerializer().serializeToString(host);

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${spec.w}" height="${spec.h}" viewBox="0 0 ${spec.w} ${spec.h}">` +
    `<foreignObject width="100%" height="100%">` +
    `<div xmlns="http://www.w3.org/1999/xhtml">` +
    // CSS is character data to the XML parser, so an unescaped & or < in a
    // font URL would end the document early.
    `<style>${escapeXml(fontCss + FRAME_CSS)}</style>` +
    markup +
    `</div></foreignObject></svg>`;

  /* A data: URI, not a blob: URL. Chrome treats an SVG loaded from blob:
   * as cross-origin for canvas purposes, so drawing it taints the canvas
   * and toBlob then throws a SecurityError. A data: URI of the same bytes
   * counts as same-origin and exports cleanly. */
  const svgUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);

  const canvas = document.createElement('canvas');
  canvas.width = spec.w * ratio;
  canvas.height = spec.h * ratio;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable in this browser');

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Could not rasterise the frame'));
    el.src = svgUrl;
  });
  ctx.scale(ratio, ratio);
  ctx.drawImage(img, 0, 0, spec.w, spec.h);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the PNG'))),
      'image/png',
    );
  });
}

/** Save a rendered frame straight to the publisher's downloads. */
export async function downloadPng(
  node: HTMLElement,
  platform: PlatformId,
  filename: string,
): Promise<void> {
  const blob = await exportPng(node, platform);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.png') ? filename : `${filename}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick — Safari cancels an in-flight download otherwise.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
