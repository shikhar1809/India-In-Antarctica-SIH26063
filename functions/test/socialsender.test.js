const test = require('node:test');
const assert = require('node:assert');
const { problemWith } = require('../socialsender');

test('a sendable row has no problem', () => {
  assert.equal(problemWith({ platform: 'x', caption: 'Sea ice at Maitri: 182 cm.' }), null);
  assert.equal(problemWith({ platform: 'instagram', caption: 'Ice.', imageUrl: 'https://x/y.png' }), null);
});

test('refuses what the platform would refuse', () => {
  assert.match(problemWith({ platform: 'x', caption: 'a'.repeat(281) }), /limit is 280/);
  assert.match(problemWith({ platform: 'instagram', caption: 'Ice.' }), /image/);
  assert.match(problemWith({ platform: 'linkedin', caption: '  ' }), /empty/);
  assert.match(problemWith({ platform: 'whatsapp', caption: 'hi' }), /Unsupported/);
});
