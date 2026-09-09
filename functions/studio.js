/**
 * Copy generation for the post studio.
 *
 * Why this is a function and not a fetch from the portal: a generative API
 * key shipped in a React bundle is a published key. Everyone who opens
 * iia-portal.web.app can read it out of the JavaScript, and it bills to
 * NCPOR. So the key lives here, in an environment variable the browser
 * cannot reach, and the portal posts a brief and gets words back.
 *
 * The model is asked for language only. It is never asked to design, to
 * choose colours, or to decide what the numbers were — those come from the
 * template system and from the dispatch respectively, and the portal
 * re-attaches the factual kicker and hashtags after this returns. A
 * hallucinated station name therefore never reaches a graphic.
 *
 * Configure by putting the key in functions/.env (gitignored), which the
 * Firebase CLI ships as a deploy-time environment variable:
 *   GEMINI_API_KEY=...
 *
 * Secret Manager (`firebase functions:secrets:set`) is the stronger option
 * and this file reads a bound secret first if one exists — but it needs
 * roles/secretmanager plus serviceusage on the project, which a plain
 * deploy does not, so .env is the default to keep setup to one file.
 *
 * With no key set the endpoint returns 503 and the portal falls back to its
 * offline template draft, which is why the studio still works end to end on
 * a fresh clone with no credentials at all.
 */

const { onRequest } = require('firebase-functions/v2/https');
const review = require('./review');
const agent = require('./studioagent');

const MODEL = 'gemini-2.5-flash';
const ENDPOINT = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

/** Anything longer than this is a pasted document, not a brief. */
const MAX_NOTES = 4000;

/**
 * Strip internal field shorthand before the model ever sees it.
 *
 * The portal already does this in studio/copy.ts, so in the normal flow the
 * text arriving here is clean. This is not redundant: the endpoint is
 * public HTTP, so it cannot assume its caller sanitised anything. Without
 * it a raw POST gets copy quoting stake ids back at the public, because the
 * prompt tells the model to stay faithful to the report — and it does.
 *
 * Matches stake/sample identifiers (MAI-S12), QC flags, instrument serials.
 */
function stripFieldCodes(text) {
  return String(text || '')
    .replace(/\b[A-Z]{2,4}-[A-Z0-9]{1,4}\d{1,4}\b/g, '')
    .replace(/\bQC[:\s-]*\w+/gi, '')
    .replace(/\bs\/n[:\s]*\S+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const AUDIENCE_BRIEF = {
  public: 'the general public, who have no science background at all',
  students: 'school and college students who are curious but not specialists',
  researchers: 'other researchers, who are comfortable with technical terms',
  press: 'journalists looking for the newsworthy angle',
};

const TONE_BRIEF = {
  plain: 'straight and factual, no flourish',
  warm: 'human and warm, with a little feeling',
  formal: 'the institutional voice of a government research body',
  punchy: 'short lines and strong verbs',
};

function cors(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
}

function buildPrompt(body) {
  const { station, activity, notes, measurements, audience, tone, direction } = body;

  /* Readings are filtered as well as cleaned: a measurement whose value is
   * an identifier rather than a quantity — a stake id, a sample code — is
   * internal bookkeeping and has nothing to say to a public reader. */
  const readings = Array.isArray(measurements) && measurements.length
    ? measurements
        .slice(0, 12)
        .map((m) => ({
          label: stripFieldCodes(m.label),
          value: stripFieldCodes(m.value),
          unit: m.unit,
        }))
        .filter((m) => m.label && m.value)
        .map((m) => `- ${m.label}: ${m.value}${m.unit ? ' ' + m.unit : ''}`)
        .join('\n') || '(none recorded)'
    : '(none recorded)';

  return `You are writing social media copy for the National Centre for Polar and Ocean Research (NCPOR), India's polar research institution, about work at its Antarctic stations.

FIELD REPORT
Station: ${station || 'unspecified'}
Activity: ${activity || 'unspecified'}
Notes from the scientist: ${stripFieldCodes(notes).slice(0, MAX_NOTES)}
Measurements:
${readings}

WRITE FOR: ${AUDIENCE_BRIEF[audience] || AUDIENCE_BRIEF.public}
TONE: ${TONE_BRIEF[tone] || TONE_BRIEF.plain}
${direction ? `
WHAT THE STUDIO WORKED OUT ABOUT THIS POST
${String(direction).slice(0, 2000)}
` : ''}

Produce exactly three variants, each taking a genuinely different editorial angle:
1. Lead with what was measured — the finding itself.
2. Lead with the place — Antarctica, the station, the conditions.
3. Lead with why it matters — the significance to people who are not scientists.

The angle has to run through the WHOLE variant, not just its headline. A
publisher sees these three side by side and picks one, so if the supporting
sentence is the same in all three there is no real choice being offered.
- Variant 1's standfirst adds detail about the measurement and how it was taken.
- Variant 2's standfirst adds detail about the location, season or conditions.
- Variant 3's standfirst says who this work is useful to, and why.
No sentence may be reused word-for-word across two variants.

RULES, all of them strict:
- Use ONLY facts present in the field report above. Invent nothing: no dates, no numbers, no names, no claims about firsts or records.
- If a fact is not in the report, leave it out rather than guessing.
- Never state or imply a scientific conclusion the notes do not already state.
- Never reproduce internal field shorthand even if it appears above: no stake or sample identifiers (like MAI-S12), no QC flags, no instrument serial numbers. A reader outside the programme cannot parse any of it.
- No emoji in the headline or standfirst.
- The headline is at most 12 words. The standfirst is one sentence.
- Write in British English.
- This is a government institution: no hype, no exclamation marks, no marketing language.

Return ONLY a JSON object of this exact shape, with no markdown fence and no commentary:
{"variants":[{"angle":"short label for this angle","headline":"...","standfirst":"...","captions":{"x":"under 280 characters","linkedin":"2-3 short paragraphs","instagram":"2 short paragraphs then hashtags"}}]}`;
}

/** The model is asked for bare JSON but sometimes wraps it in a fence
 *  anyway; strip that before parsing rather than failing the request. */
function parseModelJson(text) {
  const cleaned = String(text || '')
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
  return JSON.parse(cleaned);
}

/* The response shape, declared to the model rather than only described in
 * the prompt. With this the API constrains decoding to valid JSON of this
 * shape, so `parseModelJson` stops being the thing standing between a
 * chatty model and a broken studio. */
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    variants: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          angle: { type: 'string' },
          headline: { type: 'string' },
          standfirst: { type: 'string' },
          captions: {
            type: 'object',
            properties: {
              x: { type: 'string' },
              linkedin: { type: 'string' },
              instagram: { type: 'string' },
            },
            required: ['x', 'linkedin', 'instagram'],
          },
        },
        required: ['angle', 'headline', 'standfirst', 'captions'],
      },
    },
  },
  required: ['variants'],
};

/**
 * The full upstream request.
 *
 * `maxOutputTokens` is deliberately generous: three variants each carrying a
 * headline, a standfirst and three captions — one of them several LinkedIn
 * paragraphs — ran past 2048 and came back truncated mid-JSON, which then
 * surfaced as a parse error rather than as the budget problem it was.
 *
 * `thinkingBudget: 0` matters for the same reason. On 2.5-flash, reasoning
 * tokens are drawn from the same output budget, so leaving it on spends the
 * ceiling on deliberation this task does not need and truncates the answer.
 */
function buildRequest(body) {
  return {
    contents: [{ parts: [{ text: buildPrompt(body) }] }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };
}

/* Exported for scripts/verify-studio.mjs, which checks the prompt against
 * the live model. The handler itself needs a Functions runtime to invoke;
 * these are where the behaviour that can actually be wrong lives. */
exports.buildPrompt = buildPrompt;
exports.stripFieldCodes = stripFieldCodes;
exports.buildRequest = buildRequest;
exports.parseModelJson = parseModelJson;
exports.MODEL = MODEL;
exports.ENDPOINT = ENDPOINT;

exports.studio = onRequest(
  { region: 'asia-south1', cors: true, timeoutSeconds: 60 },
  async (req, res) => {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'POST') return res.status(405).json({ error: 'Only POST is supported.' });

    const path = (req.path || '/').replace(/\/+$/, '') || '/';

    /* Editorial review of a drafted dispatch for the approvals desk. Its
     * own module, sharing this deployment and this API key rather than
     * standing up a second function for one more endpoint. */
    if (path === '/review') return review.handle(req, res);

    /* The agentic half of the studio — visual references, A/B judgement and
     * the pre-publication look at the photograph. Same deployment and same
     * key; see studioagent.js for why each is a separate endpoint rather
     * than one do-everything call. */
    if (path === '/refs' || path === '/abtest' || path === '/moderate') {
      return agent.handle(path, req, res);
    }

    if (path !== '/copy' && path !== '/') {
      return res.status(404).json({ error: 'Unknown endpoint.' });
    }

    /* functions/.env at deploy time, functions/.env.local under the
     * emulator, or a Secret Manager binding if one was added later — all
     * three land in process.env, so this stays one lookup. */
    const key = process.env.GEMINI_API_KEY || '';

    if (!key) {
      // The portal treats this as "use the offline draft", which is a
      // working state rather than an error the publisher has to solve.
      return res.status(503).json({ error: 'No generator configured.' });
    }

    try {
      const upstream = await fetch(`${ENDPOINT(MODEL)}?key=${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildRequest(req.body || {})),
      });

      if (!upstream.ok) {
        const detail = await upstream.text();
        console.error('Gemini error', upstream.status, detail.slice(0, 500));
        return res.status(502).json({ error: 'The generator refused the request.' });
      }

      const payload = await upstream.json();
      const candidate = payload?.candidates?.[0];
      const text = candidate?.content?.parts?.[0]?.text;

      if (candidate?.finishReason === 'MAX_TOKENS') {
        console.error('Gemini truncated the response — raise maxOutputTokens');
        return res.status(502).json({ error: 'The generator ran out of room.' });
      }
      if (!text) return res.status(502).json({ error: 'The generator returned nothing.' });

      const parsed = parseModelJson(text);
      if (!Array.isArray(parsed?.variants) || parsed.variants.length === 0) {
        return res.status(502).json({ error: 'The generator returned an unexpected shape.' });
      }

      // No caching header: two publishers writing about the same dispatch
      // should each get their own options.
      return res.status(200).json({ variants: parsed.variants.slice(0, 3) });
    } catch (err) {
      console.error('studio/copy failed', err);
      return res.status(502).json({ error: 'Could not reach the generator.' });
    }
  },
);
