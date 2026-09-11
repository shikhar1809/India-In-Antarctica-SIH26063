/* node --test — no dependencies. Pins what each kind of write is logged as. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { describe, siteDiff } = require('../audit.js')._test;

test('editing a published record lists the fields that changed, by name', () => {
  const before = { title: 'Ozone 1999', metadata: { identifier: 'IIA-1999-9004', station: 'maitri' }, body: ['a'] };
  const after = { title: 'Surface ozone at Maitri, 1999', metadata: { identifier: 'IIA-1999-9004', station: 'maitri' }, body: ['a'] };
  const d = describe('publicArchive', 'r1', before, after);
  assert.equal(d.category, 'Archive');
  assert.equal(d.action, 'Edited a published record');
  assert.deepEqual(d.changes, ['Title: “Ozone 1999” → “Surface ozone at Maitri, 1999”']);
});

test('a nested metadata change reads as its own field', () => {
  const d = describe('publicArchive', 'r1', { metadata: { station: 'maitri' } }, { metadata: { station: 'bharati' } });
  assert.deepEqual(d.changes, ['Station: “maitri” → “bharati”']);
});

test('removing a record is an alert', () => {
  const d = describe('publicArchive', 'r1', { title: 'x' }, null);
  assert.equal(d.alert, true);
});

test('a dispatch moving to approved is logged under Review & approval', () => {
  const d = describe('dispatches', 'd1', { status: 'drafted', activity: 'Wildlife observation' }, { status: 'approved', activity: 'Wildlife observation', publicIdentifier: 'IIA-2026-0014' });
  assert.equal(d.category, 'Review & approval');
  assert.equal(d.action, 'Approved and published');
  assert.deepEqual(d.changes, ['Public record IIA-2026-0014']);
});

test('an admin post request is its own category', () => {
  const d = describe('dispatches', 'd2', null, { status: 'raw', notes: 'Announce Ozone Day', request: { kind: 'post-request', platforms: ['x'] } });
  assert.equal(d.category, 'Post requests');
});

test('the analytics sync refreshing engagement is not logged', () => {
  const d = describe('socialPosts', 's1', { status: 'posted', engagement: { likes: 4 } }, { status: 'posted', engagement: { likes: 5 } });
  assert.equal(d, null);
});

test('revoking is a Security alert; restoring is Access', () => {
  assert.equal(describe('roles', 'u', { role: 'publisher' }, { role: 'scientist', revoked: true }).category, 'Security');
  assert.equal(describe('roles', 'u', { role: 'scientist', revoked: true }, { role: 'publisher' }).action, 'Restored access as Publisher');
});

test('a site edit is described block by block', () => {
  const hero = { type: 'HeroBlock', props: { id: 'h', heading: 'Welcome', body: 'old' } };
  const d = describe('publicSiteData', 'home_puck', { content: [hero] }, { content: [{ ...hero, props: { ...hero.props, body: 'new' } }] });
  assert.deepEqual(d.changes, ['Edited Hero “Welcome”: body']);
  assert.deepEqual(siteDiff({ content: [hero] }, { content: [] }), ['Removed Hero “Welcome”']);
});

test('only noise changing is not logged', () => {
  assert.equal(describe('documents', 'x', { title: 't', updatedAt: 1 }, { title: 't', updatedAt: 2 }), null);
});
