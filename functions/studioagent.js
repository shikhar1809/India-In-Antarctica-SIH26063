/**
 * The agentic half of the post studio: everything beyond writing captions.
 *
 * studio.js writes the words. This module handles the three jobs that come
 * after — finding visual references, judging two variants against each
 * other, and looking at the actual photograph before it is allowed out.
 *
 * All three share studio.js's deployment and its GEMINI_API_KEY, for the
 * same reason /review does: one function, one secret, one cold start.
 *
 * The division of labour is deliberate and worth keeping:
 *
 *  - `/refs` does no model work at all. It is a search proxy (see
 *    imagesearch.js) — the browser cannot call Commons or NASA directly
 *    without CORS trouble, and the Google CSE key must not ship in a
 *    bundle. What the agent *does* with the results is decided client side
 *    and shown to the publisher.
 *  - `/abtest` asks the model to compare, not to invent. It is given two
 *    finished captions and returns a judgement with reasons. It never
 *    writes a third.
 *  - `/moderate` is the only place in this project that sends an image to a
 *    model. It answers two questions a rule cannot: is there a visible
 *    watermark or station credit, and is there anything here a government
 *    account must not publish.
 *
 * None of the three can approve anything. `/moderate` returning "clean"
 * ticks a checklist item the publisher can still untick; a human still
 * submits and an admin still approves.
 */

const { searchReferences, availableProviders } = require('./imagesearch');

const MODEL = 'gemini-2.5-flash';
const ENDPOINT = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

/** Images are fetched server side and inlined as base64. Anything larger
 *  than this is downscaled by the caller before it gets here; the cap is a
 *  backstop against someone posting a 40 MB TIFF at the endpoint. */
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

function json(res, code, body) {
  return res.status(code).json(body);
}

async function callGemini(key, request) {
  const upstream = await fetch(`${ENDPOINT(MODEL)}?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!upstream.ok) {
    const detail = await upstream.text();
    throw new Error(`gemini ${upstream.status}: ${detail.slice(0, 300)}`);
  }
  const payload = await upstream.json();
  const candidate = payload && payload.candidates && payload.candidates[0];
  if (candidate && candidate.finishReason === 'MAX_TOKENS') {
    throw new Error('gemini truncated the response');
  }
  const text =
    candidate && candidate.content && candidate.content.parts && candidate.content.parts[0]
      ? candidate.content.parts[0].text
      : '';
  if (!text) throw new Error('gemini returned nothing');
  return JSON.parse(
    String(text)
      .replace(/^\s*```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim(),
  );
}

/* ══════════════════════════════════════════════════════════════ /refs ══ */

/**
 * Visual references for a brief.
 *
 * Takes the queries the client's agent decided to run — it knows the
 * content type, the station and the platform, so it writes better queries
 * than this endpoint could — and returns what each provider said, tagged
 * by provider so the UI can show the publisher exactly what was searched
 * and where each thumbnail came from.
 */
async function handleRefs(req, res) {
  const body = req.body || {};
  const queries = Array.isArray(body.queries)
    ? body.queries.filter((q) => typeof q === 'string' && q.trim()).slice(0, 4)
    : [];

  if (!queries.length) return json(res, 400, { error: 'No queries supplied.' });

  const runs = await Promise.all(
    queries.map(async (query) => {
      const out = await searchReferences(query, body.providers);
      return { query, ...out };
    }),
  );

  /* De-duplicated across queries: the same Commons photograph answering two
   * of the agent's queries is one reference, not two, and showing it twice
   * makes the strip look padded. */
  const seen = new Set();
  const results = [];
  for (const run of runs) {
    for (const r of run.results) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      results.push({ ...r, matchedQuery: run.query });
    }
  }

  return json(res, 200, {
    results,
    searched: runs.map((r) => ({
      query: r.query,
      answered: r.answered,
      failed: r.failed,
      count: r.results.length,
    })),
    providersAvailable: availableProviders(),
    providersUnavailable: [
      {
        provider: 'pinterest',
        reason:
          'No open search API. Pinterest v5 needs an OAuth app approved for a named business use case; scraping breaches their terms and is blocked.',
      },
      ...(availableProviders().includes('google')
        ? []
        : [
            {
              provider: 'google',
              reason:
                'Google Programmable Search is supported but not configured — set GOOGLE_CSE_KEY and GOOGLE_CSE_CX.',
            },
          ]),
    ],
  });
}

/* ════════════════════════════════════════════════════════════ /abtest ══ */

const AB_SCHEMA = {
  type: 'object',
  properties: {
    winner: { type: 'string', enum: ['a', 'b'] },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    reasoning: { type: 'string' },
    factors: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          factor: { type: 'string' },
          favours: { type: 'string', enum: ['a', 'b', 'neither'] },
          note: { type: 'string' },
        },
        required: ['factor', 'favours', 'note'],
      },
    },
    hashtags: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          tag: { type: 'string' },
          why: { type: 'string' },
        },
        required: ['tag', 'why'],
      },
    },
  },
  required: ['winner', 'confidence', 'reasoning', 'factors', 'hashtags'],
};

const PLATFORM_BRIEF = {
  x: 'X (Twitter). Hard 280-character limit. Rewards a single clear hook in the first line; threads are read less than self-contained posts. One or two hashtags at most — more reads as spam.',
  linkedin:
    'LinkedIn. Professional audience. The first two lines show before "see more", so the hook has to land there. Paragraph breaks matter; three to five hashtags is normal. No markdown — bold is done with Unicode characters or not at all.',
  instagram:
    'Instagram. The image carries the post and the caption supports it. Longer captions are fine. Hashtags are expected — five to fifteen, placed after the text rather than mixed into it.',
};

async function handleAbTest(req, res, key) {
  const body = req.body || {};
  const platform = String(body.platform || 'x');
  const a = String(body.a || '').slice(0, 4000);
  const b = String(body.b || '').slice(0, 4000);
  if (!a || !b) return json(res, 400, { error: 'Two captions are required.' });

  const prompt = `You are advising the communications team of the National Centre for Polar and Ocean Research (NCPOR), India's polar research institution, on which of two captions to publish.

PLATFORM: ${PLATFORM_BRIEF[platform] || PLATFORM_BRIEF.x}

AUDIENCE: ${String(body.audience || 'the general public')}
SUBJECT: ${String(body.subject || '').slice(0, 600)}

CAPTION A:
${a}

CAPTION B:
${b}

Judge which would perform better on this specific platform for this specific audience, and say why in terms a communications officer can act on. Consider: does the hook land in the visible portion, is the length right for the platform, is the language concrete, does it respect an institutional voice, would a non-specialist understand the first sentence.

Then suggest hashtags appropriate to this platform and subject. Give the reason for each — a hashtag with no reasoning is noise. Suggest the number this platform actually rewards, not the maximum possible.

Rules:
- Judge only the two captions given. Do not write a third.
- This is a government research institution: no hype, no marketing language, no exclamation marks.
- If the two are genuinely close, say so with low confidence rather than inventing a difference.
- British English.

Return ONLY JSON of the declared shape, no markdown fence.`;

  const parsed = await callGemini(key, {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 4096,
      responseMimeType: 'application/json',
      responseSchema: AB_SCHEMA,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  return json(res, 200, parsed);
}

/* ══════════════════════════════════════════════════════════ /moderate ══ */

const MODERATION_SCHEMA = {
  type: 'object',
  properties: {
    safe: { type: 'boolean' },
    watermarkPresent: { type: 'boolean' },
    watermarkNote: { type: 'string' },
    describes: { type: 'string' },
    concerns: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['caution', 'blocker'] },
          label: { type: 'string' },
          detail: { type: 'string' },
        },
        required: ['severity', 'label', 'detail'],
      },
    },
  },
  required: ['safe', 'watermarkPresent', 'watermarkNote', 'describes', 'concerns'],
};

/** Fetches the photograph the publisher chose. It lives in Firebase Storage
 *  behind a download URL, which is public but long-lived, so this is a plain
 *  GET rather than an authenticated read. */
async function fetchImageInline(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`image fetch ${res.status}`);
  const type = res.headers.get('content-type') || 'image/jpeg';
  if (!type.startsWith('image/')) throw new Error('not an image');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_IMAGE_BYTES) throw new Error('image too large');
  return { mimeType: type.split(';')[0], data: buf.toString('base64') };
}

async function handleModerate(req, res, key) {
  const body = req.body || {};
  const imageUrl = String(body.imageUrl || '');
  if (!imageUrl) return json(res, 400, { error: 'imageUrl is required.' });

  let inline;
  try {
    inline = await fetchImageInline(imageUrl);
  } catch (err) {
    return json(res, 422, { error: `Could not read the image: ${err.message}` });
  }

  const prompt = `You are the final pre-publication check for the National Centre for Polar and Ocean Research (NCPOR), a government research institution in India. You are looking at a photograph that is about to be published on NCPOR's official social media accounts.

Answer three things about the image:

1. WATERMARK / CREDIT. Is there a visible watermark, logo, station credit or attribution mark anywhere in the image? Say where it is if so. NCPOR's standard is that published photography carries a credit; report honestly whether one is visible rather than assuming.

2. SUITABILITY. Is there anything in this image that a government research institution must not publish? Consider: nudity or obscenity, alcohol or intoxication, injury, blood, human remains, distressing wildlife imagery, visible identity documents, anything defamatory, anything culturally or politically inflammatory, or a person who appears not to have consented to being photographed in a way that would embarrass them. Being unglamorous, badly lit or dull is NOT a concern — say nothing about aesthetics.

3. WHAT IT SHOWS. One factual sentence describing the image, for the publisher's record.

Severity: use "blocker" only for something that must not be published at all. Use "caution" for something a human should look at before deciding. An image with nothing wrong returns an empty concerns array and safe: true.

Do not speculate beyond what is visible. British English.

Return ONLY JSON of the declared shape, no markdown fence.`;

  const parsed = await callGemini(key, {
    contents: [
      {
        parts: [{ text: prompt }, { inline_data: { mime_type: inline.mimeType, data: inline.data } }],
      },
    ],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 2048,
      responseMimeType: 'application/json',
      responseSchema: MODERATION_SCHEMA,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  /* A blocker in the findings overrides a cheerful `safe: true` — the two
   * come from the same generation and can disagree, and when they do the
   * more cautious of the two is the one to act on. */
  const hasBlocker = Array.isArray(parsed.concerns)
    && parsed.concerns.some((c) => c.severity === 'blocker');

  return json(res, 200, { ...parsed, safe: parsed.safe && !hasBlocker });
}

/* ══════════════════════════════════════════════════════════════ router ══ */

/** Invoked from studio.js's router so all of this shares one deployment. */
async function handle(path, req, res) {
  // The reference search needs no model and therefore no key — it works on
  // a fresh clone with no credentials at all, which is the point.
  if (path === '/refs') return handleRefs(req, res);

  const key = process.env.GEMINI_API_KEY || '';
  if (!key) return json(res, 503, { error: 'No generator configured.' });

  try {
    if (path === '/abtest') return await handleAbTest(req, res, key);
    if (path === '/moderate') return await handleModerate(req, res, key);
  } catch (err) {
    console.error(`studio${path} failed`, err);
    return json(res, 502, { error: 'The generator could not complete that.' });
  }

  return json(res, 404, { error: 'Unknown endpoint.' });
}

module.exports = { handle, PLATFORM_BRIEF, MODERATION_SCHEMA, AB_SCHEMA };
