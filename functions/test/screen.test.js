const test = require('node:test');
const assert = require('node:assert');
const { sanitise, buildPrompt } = require('../screen');

const body = { notes: 'Minor slip near the generator shed. First aid given to Ravi Kumar. Call 98765 43210.', teamMembers: 'Ravi Kumar, A. Rao' };

test('drops a finding whose quote is not in the field it names', () => {
  const out = sanitise({
    summary: 's', recommendation: 'publish-after-redaction',
    findings: [
      { field: 'notes', quote: 'Ravi Kumar', category: 'name', severity: 'high', reason: 'r', action: 'redact' },
      { field: 'notes', quote: 'Ravi K.', category: 'name', severity: 'high', reason: 'paraphrased', action: 'redact' },
      { field: 'teamMembers', quote: 'First aid', category: 'health', severity: 'high', reason: 'wrong field', action: 'redact' },
    ],
  }, body);
  assert.deepEqual(out.findings.map((f) => f.quote), ['Ravi Kumar']);
});

test('nothing found means publish', () => {
  assert.equal(sanitise({ summary: 'clean', recommendation: 'publish-after-redaction', findings: [] }, body).recommendation, 'publish');
});

test('the prompt carries every non-empty field, labelled', () => {
  const p = buildPrompt(body);
  assert.match(p, /\[notes\]\nMinor slip/);
  assert.match(p, /\[teamMembers\]\nRavi Kumar/);
  assert.doesNotMatch(p, /\[sampleIds\]/);
});

test('dropping every finding never turns the verdict into publish', () => {
  const out = sanitise({ summary: 's', recommendation: 'publish-after-redaction', findings: [
    { field: 'notes', quote: 'not in the text', category: 'name', severity: 'high', reason: 'r', action: 'redact' },
  ] }, body);
  assert.equal(out.findings.length, 0);
  assert.equal(out.recommendation, 'publish-after-redaction');
  assert.equal(out.dropped, 1);
});
