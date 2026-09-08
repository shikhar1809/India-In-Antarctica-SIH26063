/**
 * Editorial review of a drafted dispatch, for the approvals desk.
 *
 * Paired with apps/portal/src/review/checks.ts, which runs locally and
 * answers everything decidable — empty fields, character limits, stake IDs,
 * exclamation marks. Those never come here: a regex answers them correctly,
 * instantly and for free, and a language model would be slower, cost money
 * and occasionally be wrong about whether a string is empty.
 *
 * What is asked here is only what a rule cannot judge: does the public
 * wording actually follow from the field notes, does it claim more than the
 * measurements support, does it read like a research record or like
 * marketing. The model sees the internal material precisely so it can tell
 * when the public text has drifted from it — and nothing it returns is ever
 * shown to the public; it is advice to one approver.
 *
 * Same deployment as studio.js: GEMINI_API_KEY from functions/.env.
 */

const MODEL = 'gemini-2.5-flash';
const ENDPOINT = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

/** Severity vocabulary shared with the client. `blocker` is deliberately
 *  absent: refusing to publish is a rule's call, never the model's. */
const SEVERITIES = ['missing', 'caution'];

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['ready', 'needs-work'] },
    /** One sentence the approver reads first. */
    summary: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: SEVERITIES },
          label: { type: 'string' },
          detail: { type: 'string' },
          /** Where the problem is, so the UI can point at it. */
          field: { type: 'string', enum: ['title', 'summary', 'caption', 'notes', 'overall'] },
        },
        required: ['severity', 'label', 'detail', 'field'],
      },
    },
  },
  required: ['verdict', 'summary', 'findings'],
};

function cors(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
}

function line(label, value) {
  const v = String(value ?? '').trim();
  return v ? `${label}: ${v}` : null;
}

function buildPrompt(body) {
  const d = body || {};
  const m = d.measurements && typeof d.measurements === 'object' ? d.measurements : {};
  const measurementLines = Object.entries(m)
    .filter(([, v]) => String(v ?? '').trim())
    .map(([k, v]) => `  - ${k}: ${v}`)
    .join('\n');

  const internal = [
    line('Activity', d.activity),
    line('Station', d.station),
    line('Observed at', d.observedAt),
    line('Field notes', d.notes),
    measurementLines ? `Measurements:\n${measurementLines}` : null,
    line('Weather', d.weather),
  ].filter(Boolean).join('\n');

  const publicCopy = [
    line('Public title', d.publicTitle),
    d.publicBody ? `Public summary:\n${String(d.publicBody)}` : null,
    line('Caption', d.caption),
    line('X caption', d.captionX),
    line('LinkedIn caption', d.captionLinkedIn),
    line('Instagram caption', d.captionInstagram),
  ].filter(Boolean).join('\n');

  return `You are the editorial reviewer for India's national Antarctic research programme (NCPOR). One approver is about to publish the public text below to a government science website and social channels. Advise them.

Judge ONLY things that require reading comprehension. A separate automated pass already reports these mechanical faults, so do not list them as findings of your own: empty or missing fields, character counts and platform limits, exclamation marks, block capitals, stake/sample IDs and QC codes, whether a photo is attached.

That exclusion covers only the mechanical fault itself. If a sentence also makes a claim the field record does not support, that claim IS yours to flag, however the sentence is punctuated or capitalised. "AMAZING first-ever discovery!" contains shouting and an exclamation mark, which you ignore, and a claim of novelty, which you must flag.

Judge these:
1. SUPPORT — does every factual claim in the public text follow from the field notes and measurements? Flag any number, place, date, species or outcome in the public text that the internal record does not support, and say which.
2. OVERSTATEMENT — does it claim more certainty, novelty or significance than one field observation can carry? Flag hype, and wording that turns a routine reading into a discovery.
3. OMISSION — does the public text leave out something from the field record that a reader would need in order not to be misled? Only genuine distortions, not every detail that was left out.
4. TONE — should read as a plain, factual public research record. Flag anything reading as promotion, or any wording that would embarrass a government science agency.

Rules for your response:
- If the public text is faithful and proportionate, return verdict "ready" with an empty findings array. Do not invent problems to seem useful.
- The verdict and the findings must agree. "needs-work" requires at least one finding; never describe a problem in the summary without also listing it as a finding. If you have no findings, the verdict is "ready".
- Use severity "missing" when something needed is absent or unsupported, "caution" when something present is overstated or badly judged.
- "label" must state the specific problem in the approver's own terms, under 10 words, and must differ between findings. Write "Calls three drill holes a world first", not "Overstatement". Never use a bare category name as a label.
- "detail" must quote the exact offending words and then say, in one sentence, what in the field record contradicts or fails to support them.
- Be specific and brief. No preamble.

--- INTERNAL FIELD RECORD (not public; use it as the source of truth) ---
${internal || '(nothing recorded)'}

--- PROPOSED PUBLIC TEXT (this is what would be published) ---
${publicCopy || '(nothing written)'}`;
}

function buildRequest(body) {
  return {
    contents: [{ parts: [{ text: buildPrompt(body) }] }],
    generationConfig: {
      // Low: this is a judgement task where the same input should give the
      // same advice twice, not a creative one.
      temperature: 0.2,
      maxOutputTokens: 4096,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };
}

function parseModelJson(text) {
  const cleaned = String(text || '')
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
  return JSON.parse(cleaned);
}

/** Keep only well-formed findings — a malformed one must not reach the UI
 *  as an undefined severity that styles as nothing and reads as nothing. */
function sanitise(parsed) {
  const findings = Array.isArray(parsed?.findings) ? parsed.findings : [];
  const clean = findings
    .filter((f) => f && SEVERITIES.includes(f.severity) && String(f.label || '').trim())
    .slice(0, 8)
    .map((f) => ({
      severity: f.severity,
      label: String(f.label).trim().slice(0, 120),
      detail: String(f.detail || '').trim().slice(0, 400),
      field: ['title', 'summary', 'caption', 'notes', 'overall'].includes(f.field) ? f.field : 'overall',
    }));
  return {
    verdict: parsed?.verdict === 'needs-work' ? 'needs-work' : 'ready',
    summary: String(parsed?.summary || '').trim().slice(0, 300),
    findings: clean,
  };
}

exports.buildPrompt = buildPrompt;
exports.buildRequest = buildRequest;
exports.parseModelJson = parseModelJson;
exports.sanitise = sanitise;
exports.RESPONSE_SCHEMA = RESPONSE_SCHEMA;
exports.MODEL = MODEL;
exports.ENDPOINT = ENDPOINT;
exports.cors = cors;

/** Invoked from studio.js's router so both share one function deployment. */
exports.handle = async function handle(req, res) {
  const key = process.env.GEMINI_API_KEY || '';
  if (!key) {
    // The desk falls back to the local checks alone, which is a working
    // state rather than an error the approver has to solve.
    return res.status(503).json({ error: 'No reviewer configured.' });
  }

  try {
    const upstream = await fetch(`${ENDPOINT(MODEL)}?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildRequest(req.body || {})),
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      console.error('Gemini review error', upstream.status, detail.slice(0, 500));
      return res.status(502).json({ error: 'The reviewer refused the request.' });
    }

    const payload = await upstream.json();
    const candidate = payload?.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text;

    if (candidate?.finishReason === 'MAX_TOKENS') {
      console.error('Gemini review truncated — raise maxOutputTokens');
      return res.status(502).json({ error: 'The reviewer ran out of room.' });
    }
    if (!text) return res.status(502).json({ error: 'The reviewer returned nothing.' });

    return res.status(200).json(sanitise(parseModelJson(text)));
  } catch (err) {
    console.error('studio/review failed', err);
    return res.status(502).json({ error: 'Could not reach the reviewer.' });
  }
};
