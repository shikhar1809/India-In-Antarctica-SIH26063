/**
 * Reading a Storage image from a canvas.
 *
 * The studio exports a post by cloning the live DOM and inlining every
 * image as a data URI — nothing inside an SVG foreignObject can reach the
 * network, so the bytes have to be there already. That inlining is a
 * `fetch`, and a fetch is subject to CORS.
 *
 * This project's Storage bucket has no CORS configuration, so the browser
 * refuses to hand those bytes to the page: the download URL loads fine in an
 * <img> (no CORS needed to display) and fails the moment anything tries to
 * read it. The visible symptom was an exported graphic — and the annotator
 * built on it — with everything except the photograph.
 *
 * Setting CORS on the bucket is the tidier fix and needs an account with
 * storage.buckets.update, which the deploying account does not have. This is
 * the same result from the other side: the function fetches the object
 * server-side, where CORS does not apply, and returns it with the header the
 * browser wants.
 *
 * WHAT IT WILL NOT PROXY. Only this project's own Storage hosts. An open
 * proxy is somebody else's outbound traffic with our name on it, so the host
 * allowlist is the whole point rather than a precaution. The capability is
 * still the download token already in the URL — this grants nothing that the
 * holder of that URL did not have.
 */

const ALLOWED_HOSTS = new Set([
  'firebasestorage.googleapis.com',
  'storage.googleapis.com',
]);

/** Only objects belonging to this project. */
const PROJECT_BUCKETS = [
  'indiainantartica.firebasestorage.app',
  'indiainantartica.appspot.com',
];

const MAX_BYTES = 25 * 1024 * 1024;

/** The image formats a browser canvas will draw, recognised by their magic
 *  bytes rather than by a header the uploader may never have set. */
function sniff(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.subarray(0, 6).toString('latin1').startsWith('GIF8')) return 'image/gif';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (buf.subarray(0, 5).toString('latin1') === '<?xml' || buf.subarray(0, 4).toString('latin1') === '<svg') return 'image/svg+xml';
  return null;
}

function allowed(raw) {
  let url;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== 'https:') return null;
  if (!ALLOWED_HOSTS.has(url.hostname)) return null;
  const path = decodeURIComponent(url.pathname);
  if (!PROJECT_BUCKETS.some((b) => path.includes(b))) return null;
  return url;
}

/** GET /studio/image?url=<a Storage download URL> */
async function handle(req, res) {
  res.set('Access-Control-Allow-Origin', '*');

  const url = allowed(String(req.query.url || ''));
  if (!url) return res.status(400).json({ error: 'Only this project’s Storage objects can be read here.' });

  try {
    const upstream = await fetch(url.toString(), { signal: AbortSignal.timeout(20000) });
    if (!upstream.ok) return res.status(upstream.status).json({ error: `Storage returned ${upstream.status}.` });

    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.length > MAX_BYTES) return res.status(413).json({ error: 'That image is too large to proxy.' });

    /* Most of these objects were uploaded without a content type, so Storage
     * serves them as application/octet-stream — which a canvas will not
     * accept as an image. The first bytes of a file say what it is more
     * reliably than a header nobody set, so they decide. */
    const declared = (upstream.headers.get('content-type') || '').split(';')[0];
    const type = sniff(buf) || (declared.startsWith('image/') ? declared : null);
    if (!type) return res.status(415).json({ error: 'That object is not an image.' });

    res.set('Content-Type', type);
    // Storage objects are content-addressed by their download token, so a
    // long cache is safe and keeps repeated exports off this function.
    res.set('Cache-Control', 'public, max-age=86400');
    return res.status(200).send(buf);
  } catch (err) {
    console.error('studio/image failed', err.message);
    return res.status(502).json({ error: 'Could not read that image.' });
  }
}

module.exports = { handle, allowed, sniff };
