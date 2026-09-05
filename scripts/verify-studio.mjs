/**
 * Live check of the post studio's copy generator.
 *
 * Runs the real prompt from functions/studio.js against the real model and
 * asserts the thing most likely to be wrong: that the response parses, has
 * three variants, and carries every field the portal reads. A prompt that
 * returns prose instead of JSON fails here rather than in front of a judge.
 *
 * Reads the key from functions/.env — never from the command line, so it
 * does not end up in shell history.
 *
 *   node scripts/verify-studio.mjs
 *
 * Exits 0 when the generator is healthy, 1 when it is not, and 2 when no key
 * is configured (which is a valid state: the portal falls back to its
 * offline draft, it just is not being exercised here).
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const require = createRequire(import.meta.url);

/* ── key ─────────────────────────────────────────────────────────────── */

function readKey() {
  for (const file of ['.env', '.env.local']) {
    try {
      const text = readFileSync(join(root, 'functions', file), 'utf8');
      const hit = text.match(/^\s*GEMINI_API_KEY\s*=\s*(.+)\s*$/m);
      if (hit && hit[1].trim()) return hit[1].trim();
    } catch { /* file absent — try the next one */ }
  }
  return process.env.GEMINI_API_KEY || '';
}

const key = readKey();
if (!key) {
  console.log('No GEMINI_API_KEY in functions/.env — the portal will use its offline draft.');
  process.exit(2);
}

/* ── the real prompt, from the real function ─────────────────────────── */

const studio = require(join(root, 'functions', 'studio.js'));

/* The dispatch shape the portal actually posts, with the jargon a field
 * report really carries — stake ids and QC flags the copy must not echo. */
const BRIEF = {
  station: 'Maitri',
  activity: 'Ice / glaciology survey',
  notes:
    'Completed the first full transect of the season across the Schirmacher shelf. ' +
    'Twelve stakes measured. Stake MAI-S12 read high against last season. QC: suspect on stake 7. ' +
    'Conditions were blowing snow, visibility down to 3 km.',
  measurements: [
    { label: 'Ice thickness', value: '164', unit: 'cm' },
    { label: 'Stakes measured', value: '12', unit: null },
  ],
  audience: 'public',
  tone: 'plain',
};

const LIMITS = { x: 280, instagram: 2200, linkedin: 3000 };

const fail = [];
const warn = [];

function check(ok, message) {
  if (!ok) fail.push(message);
}

console.log(`Model: ${studio.MODEL}`);
console.log('Posting the real brief…\n');

const started = Date.now();
const res = await fetch(`${studio.ENDPOINT(studio.MODEL)}?key=${encodeURIComponent(key)}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  // The exact request the deployed function sends — not a re-creation of it.
  body: JSON.stringify(studio.buildRequest(BRIEF)),
});

if (!res.ok) {
  const detail = await res.text();
  console.error(`FAILED — HTTP ${res.status}`);
  console.error(detail.slice(0, 600));
  process.exit(1);
}

const payload = await res.json();
const candidate = payload?.candidates?.[0];
const text = candidate?.content?.parts?.[0]?.text;

if (candidate?.finishReason === 'MAX_TOKENS') {
  console.error('FAILED — the model ran out of output budget and truncated the JSON.');
  console.error('Raise maxOutputTokens in functions/studio.js.');
  process.exit(1);
}
check(!!text, 'the model returned no text at all');

let parsed;
try {
  parsed = studio.parseModelJson(text);
} catch (err) {
  console.error('FAILED — the response did not parse as JSON');
  console.error(String(text).slice(0, 600));
  process.exit(1);
}

/* ── shape ───────────────────────────────────────────────────────────── */

check(Array.isArray(parsed?.variants), 'no `variants` array');
const variants = parsed?.variants ?? [];
check(variants.length === 3, `expected 3 variants, got ${variants.length}`);

variants.forEach((v, i) => {
  const n = `variant ${i + 1}`;
  check(typeof v.headline === 'string' && v.headline.trim(), `${n}: missing headline`);
  check(typeof v.standfirst === 'string' && v.standfirst.trim(), `${n}: missing standfirst`);
  check(v.captions && typeof v.captions === 'object', `${n}: missing captions`);

  for (const p of ['x', 'linkedin', 'instagram']) {
    const c = v.captions?.[p];
    check(typeof c === 'string' && c.trim(), `${n}: missing ${p} caption`);
    // The portal clamps anyway, so an over-long caption is a note, not a fail.
    if (typeof c === 'string' && c.length > LIMITS[p]) {
      warn.push(`${n}: ${p} caption is ${c.length} chars, over the ${LIMITS[p]} limit (portal will clamp)`);
    }
  }

  const words = String(v.headline || '').trim().split(/\s+/).length;
  if (words > 12) warn.push(`${n}: headline is ${words} words, asked for 12 or fewer`);
});

/* ── the rules that matter for a government account ──────────────────── */

const all = JSON.stringify(variants);

check(!/MAI-S12|QC:|s\/n/i.test(all), 'field-report jargon (stake id / QC flag) leaked into public copy');
if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(all)) warn.push('an emoji appeared in the copy');
if (/!/.test(String(variants.map((v) => v.headline).join(' ')))) warn.push('an exclamation mark appeared in a headline');

/* Angles should be genuinely different, not one idea three times. The
 * standfirst matters as much as the headline here: it is half the text on
 * the rendered card, so three identical ones make the choice look fake even
 * when the headlines differ. */
const heads = variants.map((v) => String(v.headline || '').toLowerCase().trim());
check(new Set(heads).size === heads.length, 'two variants share a headline');

const stands = variants.map((v) => String(v.standfirst || '').toLowerCase().trim());
check(new Set(stands).size === stands.length, 'two variants share a standfirst');

const xs = variants.map((v) => String(v.captions?.x || '').toLowerCase().trim());
if (new Set(xs).size !== xs.length) warn.push('two variants share an X caption');

/* ── report ──────────────────────────────────────────────────────────── */

console.log(`Round trip: ${Date.now() - started} ms\n`);

variants.forEach((v, i) => {
  console.log(`  ${i + 1}. [${v.angle ?? 'no angle'}]`);
  console.log(`     ${v.headline}`);
  console.log(`     ${v.standfirst}`);
  console.log(`     x: ${String(v.captions?.x ?? '').slice(0, 100)}${(v.captions?.x ?? '').length > 100 ? '…' : ''}`);
  console.log();
});

for (const w of warn) console.log(`  note: ${w}`);

if (fail.length) {
  console.error(`\nFAILED (${fail.length})`);
  for (const f of fail) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(`\nGenerator healthy${warn.length ? ` (${warn.length} note${warn.length > 1 ? 's' : ''})` : ''}.`);
