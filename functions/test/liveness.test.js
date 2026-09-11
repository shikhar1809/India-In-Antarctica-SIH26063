const test = require('node:test');
const assert = require('node:assert');
const { checkLive, tweetId, linkedinUrn } = require('../liveness');

/** A fetch that answers with a fixed status and JSON body. */
const answer = (status, body = {}) => async () => ({
  status, ok: status >= 200 && status < 300, json: async () => body,
});

test('X: a tombstone is removed, with the platform’s own words', async () => {
  const v = await checkLive(
    { platform: 'x', externalUrl: 'https://x.com/a/status/123' },
    { fetchImpl: answer(200, { __typename: 'TweetTombstone', tombstone: { text: { text: 'This Post was deleted by the Post author. Learn more' } } }) },
  );
  assert.equal(v.state, 'removed');
  assert.equal(v.note, 'This Post was deleted by the Post author.');
});

test('X: a tweet is live; a 404 is removed', async () => {
  const post = { platform: 'x', externalUrl: 'https://x.com/a/status/123' };
  assert.equal((await checkLive(post, { fetchImpl: answer(200, { __typename: 'Tweet', id_str: '123' }) })).state, 'live');
  assert.equal((await checkLive(post, { fetchImpl: answer(404) })).state, 'removed');
});

test('LinkedIn: embed 200 is live, 404 removed, anything else unknown', async () => {
  const post = { platform: 'linkedin', platformPostId: 'urn:li:share:1' };
  assert.equal((await checkLive(post, { fetchImpl: answer(200) })).state, 'live');
  assert.equal((await checkLive(post, { fetchImpl: answer(404) })).state, 'removed');
  assert.equal((await checkLive(post, { fetchImpl: answer(429) })).state, 'unknown');
});

test('Instagram: removed only when the account itself still reads', async () => {
  const post = { platform: 'instagram', platformPostId: '179' };
  const gone = answer(200, { platforms: { instagram: { post_metrics_error: 'Instagram API error (HTTP 400). The post may have been deleted or the token expired.' } } });
  assert.equal((await checkLive(post, { fetchImpl: gone, key: 'k', profile: 'p', accountOk: true })).state, 'removed');
  assert.equal((await checkLive(post, { fetchImpl: gone, key: 'k', profile: 'p', accountOk: false })).state, 'unknown');
  const up = answer(200, { platforms: { instagram: { post_metrics: { likes: 3 } } } });
  assert.equal((await checkLive(post, { fetchImpl: up, key: 'k', profile: 'p', accountOk: true })).state, 'live');
});

test('a check that throws is unknown, never live', async () => {
  const v = await checkLive({ platform: 'x', externalUrl: 'https://x.com/a/status/9' }, { fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal(v.state, 'unknown');
});

test('ids are recovered from permalinks', () => {
  assert.equal(tweetId({ externalUrl: 'https://x.com/a/status/42' }), '42');
  assert.equal(linkedinUrn({ externalUrl: 'https://www.linkedin.com/feed/update/urn:li:share:7/' }), 'urn:li:share:7');
});
