/**
 * Shared helpers for the maintenance scripts that talk to Firestore and
 * Storage over REST.
 *
 * ── About the credentials ─────────────────────────────────────────────────
 * These scripts authenticate by reusing the Firebase CLI's own stored login —
 * the same one `firebase deploy` uses — rather than asking anyone to create
 * and download a service-account key.
 *
 * The client id and secret below are NOT project secrets. They are the public
 * installed-application credentials that ship inside firebase-tools itself
 * (they are in its open-source repository, and in every copy of the CLI on
 * every developer's machine). An installed app cannot keep a secret, which is
 * why OAuth treats these as public. Nothing here grants access on its own:
 * the actual credential is the refresh token in the operator's own home
 * directory, which is never read into source control and never printed.
 *
 * Practical consequence to be aware of: a Google OAuth token belonging to a
 * project owner talks to Firestore with owner authority, which means these
 * scripts operate ABOVE firestore.rules rather than under them. That is
 * appropriate for one-off administrative seeding, but it also means a
 * successful run here is not evidence that a normal signed-in admin could do
 * the same thing through the app. `scripts/verify-api.mjs` is what proves the
 * rules themselves behave, because it makes anonymous requests.
 */

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const PROJECT = 'indiainantartica';
export const BUCKET = `${PROJECT}.firebasestorage.app`;
export const FS_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

const CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';

/** Exchanges the Firebase CLI's stored refresh token for an access token. */
export async function accessToken() {
  const store = join(homedir(), '.config', 'configstore', 'firebase-tools.json');
  let refresh;
  try {
    refresh = JSON.parse(readFileSync(store, 'utf8')).tokens?.refresh_token;
  } catch {
    throw new Error(`Could not read ${store} — run \`firebase login\` first.`);
  }
  if (!refresh) throw new Error('No Firebase CLI refresh token found — run `firebase login` first.');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refresh,
      grant_type: 'refresh_token',
    }),
  });
  const json = await res.json();
  if (!json.access_token) throw new Error(`Token refresh failed: ${JSON.stringify(json)}`);
  return json.access_token;
}

/* ── Firestore's typed-value wire format ───────────────────────────────── */

/** A plain JS value → Firestore REST's typed representation. */
export function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  if (typeof v === 'object') {
    return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toValue(x)])) } };
  }
  throw new Error(`Cannot encode ${typeof v}`);
}

/** Firestore's typed representation → a plain JS value. */
export function fromValue(f) {
  if (!f) return null;
  if ('stringValue' in f) return f.stringValue;
  if ('integerValue' in f) return Number(f.integerValue);
  if ('doubleValue' in f) return f.doubleValue;
  if ('booleanValue' in f) return f.booleanValue;
  if ('nullValue' in f) return null;
  if ('arrayValue' in f) return (f.arrayValue.values ?? []).map(fromValue);
  if ('mapValue' in f) return Object.fromEntries(Object.entries(f.mapValue.fields ?? {}).map(([k, v]) => [k, fromValue(v)]));
  return null;
}

/** Every document in a collection, as plain objects with their id. */
export async function listCollection(name, pageSize = 100) {
  const res = await fetch(`${FS_BASE}/${name}?pageSize=${pageSize}`);
  const body = await res.json();
  return (body.documents ?? []).map((d) => ({
    id: d.name.split('/').pop(),
    ...Object.fromEntries(Object.entries(d.fields ?? {}).map(([k, v]) => [k, fromValue(v)])),
  }));
}

/** Create-or-replace one document. Idempotent, so re-running a seed script
 *  overwrites rather than duplicating. */
export async function writeDoc(collection, id, data, token) {
  const res = await fetch(`${FS_BASE}/${collection}/${id}`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ fields: toValue(data).mapValue.fields }),
  });
  if (!res.ok) throw new Error(`${collection}/${id}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
}

export async function deleteDoc(collection, id, token) {
  const res = await fetch(`${FS_BASE}/${collection}/${id}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}` },
  });
  return res.ok;
}

/** Uploads a file and returns the public download URL. storage.rules allow
 *  anonymous read under research/{uid}/{file}, so no download token is needed. */
export async function uploadFile(objectPath, body, contentType, token) {
  const res = await fetch(
    `https://storage.googleapis.com/upload/storage/v1/b/${BUCKET}/o?uploadType=media&name=${encodeURIComponent(objectPath)}`,
    { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': contentType }, body },
  );
  if (!res.ok) throw new Error(`upload ${objectPath}: HTTP ${res.status}`);
  return `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(objectPath)}?alt=media`;
}

/* ── loading the portal's own TypeScript modules ───────────────────────── */

/** Bundles portal source so a script can call the REAL shipped functions
 *  instead of a reimplementation. Packages stay external because the Firebase
 *  SDK pulls in grpc, which does not bundle to ESM. */
export async function loadPortalModules(root, exportsSrc) {
  const { writeFileSync, mkdtempSync, unlinkSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { execFileSync } = await import('node:child_process');
  const { pathToFileURL } = await import('node:url');

  const tmp = mkdtempSync(join(tmpdir(), 'iia-load-'));
  const entry = join(tmp, 'entry.ts');
  writeFileSync(entry, exportsSrc);

  // Must live inside the portal package so Node resolves `firebase/*`.
  const bundle = join(root, 'apps', 'portal', 'node_modules', '.iia-script-load.mjs');
  execFileSync('npx', ['esbuild', entry, '--bundle', '--format=esm', '--platform=node',
    '--packages=external', `--outfile=${bundle}`, '--log-level=error'],
    { cwd: join(root, 'apps', 'portal'), shell: process.platform === 'win32', stdio: 'inherit' });

  const mod = await import(pathToFileURL(bundle).href);
  try { unlinkSync(bundle); } catch { /* already gone */ }
  return mod;
}

/** Repo root, from a script in scripts/. */
export function repoRoot(importMetaUrl) {
  return new URL('..', importMetaUrl).pathname.replace(/^\/([A-Za-z]:)/, '$1');
}
