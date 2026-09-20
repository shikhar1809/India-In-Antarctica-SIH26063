const test = require('node:test');
const assert = require('node:assert');
const { allowed } = require('../imageproxy');

/* An image proxy that will fetch anything is an open proxy. These are the
 * cases that decide whether this one is. */

test('accepts this project’s Storage objects', () => {
  assert.ok(allowed('https://firebasestorage.googleapis.com/v0/b/indiainantartica.firebasestorage.app/o/dispatches%2Fa%2Fb.jpg?alt=media&token=x'));
  assert.ok(allowed('https://storage.googleapis.com/indiainantartica.appspot.com/photo.png'));
});

test('refuses anything else', () => {
  assert.equal(allowed('https://example.com/x.png'), null);
  assert.equal(allowed('http://firebasestorage.googleapis.com/v0/b/indiainantartica.firebasestorage.app/o/x.png'), null, 'plain http');
  assert.equal(allowed('https://firebasestorage.googleapis.com/v0/b/someone-else.appspot.com/o/x.png'), null, 'another project');
  assert.equal(allowed('https://evil.test/?u=indiainantartica.firebasestorage.app'), null, 'bucket name in the wrong place');
  assert.equal(allowed(''), null);
  assert.equal(allowed('not a url'), null);
});

test('recognises an image by its bytes, not by a header nobody set', () => {
  const { sniff } = require('../imageproxy');
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(12)]);
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(8)]);
  assert.equal(sniff(jpeg), 'image/jpeg');
  assert.equal(sniff(png), 'image/png');
  assert.equal(sniff(Buffer.from('just some text, padded out')), null);
});
