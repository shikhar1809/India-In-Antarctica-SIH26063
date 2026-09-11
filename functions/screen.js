/**
 * Screening a raw field report before anyone else sees it.
 *
 * A scientist's report goes to an admin first, not to the publishers. The
 * admin decides what leaves the building — onto the public website, and into
 * the hands of the publishers who will write social posts from it. This is
 * the model half of that decision: it reads the report's free text and
 * points at what a government body should not pass on — people's names and
 * contact details, health and injury, incidents and security, precise
 * positions written into prose, ID numbers — with a reason and a
 * recommendation for each.
 *
 * It recommends; it never redacts. The admin sees every finding beside the
 * words it is about and chooses. The portal also runs its own rule-based
 * detectors (screening/detect.ts) so an unreachable model never means an
 * unscreened report.
 *
 * Every finding must quote the report exactly. A quote that is not found in
 * the field it names is dropped here — a model that paraphrases would
 * otherwise send the admin looking for words that are not there.
 *
 * Admins only: the request carries the rawest text in the system.
 */

const { initializeApp, getApps } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

if (!getApps().length) initializeApp();

const MODEL = 'gemini-2.5-flash';
const ENDPOINT = (model) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

const FIELDS = ['notes', 'teamMembers', 'sampleIds', 'conditions'];
const CATEGORIES = ['name', 'contact', 'id-number', 'health', 'safety', 'security', 'location', 'opinion', 'other'];
const SEVERITIES = ['high', 'medium', 'low'];

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    recommendation: { type: 'string', enum: ['publish', 'publish-after-redaction', 'hold'] },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          field: { type: 'string', enum: FIELDS },
          quote: { type: 'string' },
          category: { type: 'string', enum: CATEGORIES },
          severity: { type: 'string', enum: SEVERITIES },
          reason: { type: 'string' },
          action: { type: 'string', enum: ['redact', 'review'] },
        },
        required: ['field', 'quote', 'category', 'severity', 'reason', 'action'],
      },
    },
  },
  required: ['summary', 'recommendation', 'findings'],
};

function buildPrompt(body) {
  const text = FIELDS
    .map((f) => [f, String(body[f] || '').slice(0, 4000)])
    .filter(([, v]) => v.trim())
    .map(([f, v]) => `[${f}]\n${v}`)
    .join('\n\n');
  return `You screen raw Antarctic field reports for the National Centre for Polar and Ocean Research (NCPOR), a Government of India body, before an admin decides what may be published on its public website and handed to its social-media team.

Find everything in the report below that a government body should not pass on unreviewed:
- name: any named person other than as a scientific credit (team members, visitors, patients, family).
- contact: phone numbers, email addresses, social handles, home addresses.
- id-number: passport, Aadhaar, PAN, staff or badge numbers.
- health: injuries, illness, medication, medical treatment, mental state — even if minor.
- safety: accidents, near misses, incidents, evacuations, rescue.
- security: station access, stores of fuel or explosives, vulnerabilities, logistics that could endanger people.
- location: precise positions of people or sensitive sites written into the prose (not the report's own coordinates).
- opinion: criticism of named colleagues, institutions or other nations; internal disputes.
- other: anything else plainly unsuitable for a public government record.

Rules:
- "quote" must be copied EXACTLY, character for character, from the field it names — the shortest span that covers the problem (a name, a number, a clause). Never paraphrase. Never quote across fields.
- action "redact" when the words should not leave the building; "review" when it is a judgement call for the admin.
- severity "high" for personal data, health and safety; "medium" for security and opinion; "low" for the rest.
- "reason" is one plain sentence an admin would accept.
- Do not flag ordinary science: measurements, weather, station names, instrument details, the report's own position.
- recommendation: "publish" if nothing needs removing, "publish-after-redaction" if redaction makes it fit, "hold" if the report should not go out at all (for example a serious incident still unfolding).
- summary: one or two sentences for the admin. If nothing is found, say so plainly and return no findings.

Station: ${String(body.station || '').slice(0, 80)}
Activity: ${String(body.activity || '').slice(0, 80)}

--- REPORT ---
${text || '(no free text)'}`;
}

function buildRequest(body) {
  return {
    contents: [{ parts: [{ text: buildPrompt(body) }] }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 6144,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      thinkingConfig: { thinkingBudget: 512 },
    },
  };
}

/** Keeps only findings whose quote really is in the field it names. */
function sanitise(parsed, body) {
  const rawCount = Array.isArray(parsed?.findings) ? parsed.findings.length : 0;
  const findings = (Array.isArray(parsed?.findings) ? parsed.findings : [])
    .filter((f) => f && FIELDS.includes(f.field) && CATEGORIES.includes(f.category) && SEVERITIES.includes(f.severity))
    .map((f) => ({
      field: f.field,
      quote: String(f.quote || '').trim().slice(0, 300),
      category: f.category,
      severity: f.severity,
      reason: String(f.reason || '').trim().slice(0, 300),
      action: f.action === 'review' ? 'review' : 'redact',
    }))
    .filter((f) => f.quote && String(body[f.field] || '').includes(f.quote))
    .slice(0, 30);
  const rec = ['publish', 'publish-after-redaction', 'hold'].includes(parsed?.recommendation) ? parsed.recommendation : 'publish-after-redaction';
  return {
    summary: String(parsed?.summary || '').trim().slice(0, 400),
    // Only the model finding nothing makes a report fit to publish — never
    // this function having dropped findings whose quotes did not match.
    recommendation: rawCount === 0 && rec === 'publish-after-redaction' ? 'publish' : rec,
    dropped: rawCount - findings.length,
    findings,
  };
}

async function requireAdmin(req) {
  const match = (req.get('Authorization') || '').match(/^Bearer (.+)$/);
  if (!match) { const e = new Error('Sign in first.'); e.status = 401; throw e; }
  const decoded = await getAuth().verifyIdToken(match[1]);
  const snap = await getFirestore().collection('roles').doc(decoded.uid).get();
  if ((snap.data() || {}).role !== 'admin') { const e = new Error('Screening is for admins.'); e.status = 403; throw e; }
}

exports.buildPrompt = buildPrompt;
exports.sanitise = sanitise;

exports.handle = async function handle(req, res) {
  try {
    await requireAdmin(req);
  } catch (err) {
    return res.status(err.status || 401).json({ error: err.message });
  }
  const key = process.env.GEMINI_API_KEY || '';
  if (!key) return res.status(503).json({ error: 'No screening model configured.' });

  const body = req.body || {};
  try {
    const upstream = await fetch(`${ENDPOINT(MODEL)}?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildRequest(body)),
    });
    if (!upstream.ok) {
      console.error('Gemini screen error', upstream.status, (await upstream.text()).slice(0, 400));
      return res.status(502).json({ error: 'The screening model refused the request.' });
    }
    const payload = await upstream.json();
    const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return res.status(502).json({ error: 'The screening model returned nothing.' });
    const cleaned = String(text).replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    return res.status(200).json(sanitise(JSON.parse(cleaned), body));
  } catch (err) {
    console.error('studio/screen failed', err);
    return res.status(502).json({ error: 'Could not reach the screening model.' });
  }
};
