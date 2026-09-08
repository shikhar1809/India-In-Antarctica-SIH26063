import { describe, it, expect, beforeEach } from 'vitest';
import {
  PLATFORM_LIMITS,
  validatePost,
  captionLength,
  canSend,
  effectiveStatus,
  schedulePost,
  sendPost,
  confirmManualPost,
  cancelPost,
  registerAdapter,
  adapterFor,
  clearAdapters,
  type ScheduledPost,
  type PlatformAdapter,
} from './queue';
import type { RepositoryRecord } from '../repository/contract';

const NOW = Date.UTC(2026, 0, 15, 9, 0, 0);
const HOUR = 3600_000;

/** A published record — the only thing the queue accepts. */
const record = {
  id: 'rec-1',
  cat: 'dataset',
  kind: 'Dataset',
  title: 'Counting wildlife near Bharati',
  station: 'bharati',
  year: '2026',
  pills: [],
  body: [],
  photoUrls: [],
  measurements: [],
  publishedAt: NOW,
  metadata: { identifier: 'IIA-2026-0002' },
} as unknown as RepositoryRecord & { id: string };

function post(over: Partial<ScheduledPost> = {}): ScheduledPost {
  return {
    id: 'p1',
    recordId: 'rec-1',
    recordIdentifier: 'IIA-2026-0002',
    platform: 'x',
    caption: 'Adélie penguins counted near Bharati this week.',
    imageUrl: 'https://example.test/card.png',
    scheduledFor: NOW + HOUR,
    status: 'queued',
    createdBy: 'publisher-1',
    createdAt: NOW,
    postedAt: null,
    externalUrl: null,
    postedVia: null,
    error: null,
    ...over,
  };
}

describe('caption limits are per platform', () => {
  it('accepts a caption inside the limit', () => {
    expect(validatePost(post(), NOW)).toEqual([]);
  });

  it('rejects one over the limit and says how much to cut', () => {
    const caption = 'a'.repeat(300);
    const issues = validatePost(post({ caption }), NOW);
    expect(issues).toHaveLength(1);
    expect(issues[0].level).toBe('error');
    expect(issues[0].message).toContain('Trim 20');
  });

  it('lets the same caption through on LinkedIn, which allows more', () => {
    const caption = 'a'.repeat(300);
    expect(validatePost(post({ caption, platform: 'linkedin' }), NOW)).toEqual([]);
  });

  it('warns near the ceiling without blocking', () => {
    const caption = 'a'.repeat(275);
    const issues = validatePost(post({ caption }), NOW);
    expect(issues).toHaveLength(1);
    expect(issues[0].level).toBe('warning');
  });

  it('rejects an empty caption', () => {
    expect(validatePost(post({ caption: '   ' }), NOW)[0].message).toBe('The caption is empty.');
  });

  it('ignores surrounding whitespace when counting', () => {
    expect(captionLength('  hello  ')).toBe(5);
  });
});

describe('platform requirements', () => {
  it('requires an image on Instagram', () => {
    const issues = validatePost(post({ platform: 'instagram', imageUrl: null }), NOW);
    expect(issues.some((i) => i.message.includes('must have an image'))).toBe(true);
  });

  it('does not require one on X', () => {
    expect(validatePost(post({ imageUrl: null }), NOW)).toEqual([]);
  });

  it('agrees with the declared limits table', () => {
    expect(PLATFORM_LIMITS.x.maxChars).toBe(280);
    expect(PLATFORM_LIMITS.instagram.imageRequired).toBe(true);
  });
});

describe('scheduling', () => {
  it('refuses a time in the past', () => {
    const issues = validatePost(post({ scheduledFor: NOW - HOUR }), NOW);
    expect(issues.some((i) => i.message === 'That time is in the past.')).toBe(true);
  });

  it('carries the record identifier onto the post, not the title', () => {
    const { post: p } = schedulePost(record, 'x', 'Hello', NOW + HOUR, 'publisher-1', null, NOW);
    expect(p.recordIdentifier).toBe('IIA-2026-0002');
    expect(p.recordId).toBe('rec-1');
    expect(p.status).toBe('queued');
  });

  it('reports issues at schedule time rather than silently queueing a bad post', () => {
    const { issues } = schedulePost(record, 'x', 'a'.repeat(400), NOW + HOUR, 'publisher-1', null, NOW);
    expect(issues.some((i) => i.level === 'error')).toBe(true);
  });
});

describe('effectiveStatus separates "not yet" from settled states', () => {
  it('is queued before its time', () => {
    expect(effectiveStatus(post(), NOW)).toBe('queued');
  });

  it('becomes ready once the time passes', () => {
    expect(effectiveStatus(post(), NOW + 2 * HOUR)).toBe('ready');
  });

  it('leaves settled states alone', () => {
    for (const status of ['posted', 'cancelled', 'failed'] as const) {
      expect(effectiveStatus(post({ status }), NOW + 2 * HOUR)).toBe(status);
    }
  });
});

describe('canSend', () => {
  it('is false before the scheduled time', () => {
    expect(canSend(post(), NOW)).toBe(false);
  });

  it('is true once due and valid', () => {
    expect(canSend(post(), NOW + 2 * HOUR)).toBe(true);
  });

  it('is false for an invalid caption even when due', () => {
    expect(canSend(post({ caption: 'a'.repeat(400) }), NOW + 2 * HOUR)).toBe(false);
  });

  it('is false once already posted', () => {
    expect(canSend(post({ status: 'posted' }), NOW + 2 * HOUR)).toBe(false);
  });

  it('allows a failed post to be retried', () => {
    expect(canSend(post({ status: 'failed' }), NOW + 2 * HOUR)).toBe(true);
  });
});

describe('adapters', () => {
  beforeEach(() => clearAdapters());

  it('falls back to the manual adapter with no credential', () => {
    const adapter = adapterFor('x');
    expect(adapter.automatic).toBe(false);
  });

  it('leaves a due post in the queue when only the manual adapter exists', async () => {
    const sent = await sendPost(post(), NOW + 2 * HOUR);
    // Deliberately NOT 'posted' — nothing went anywhere.
    expect(sent.status).toBe('ready');
    expect(sent.postedAt).toBeNull();
    expect(sent.externalUrl).toBeNull();
  });

  it('posts through a registered automatic adapter', async () => {
    const fake: PlatformAdapter = {
      platform: 'x',
      automatic: true,
      label: 'X (test)',
      async send() {
        return { ok: true, externalUrl: 'https://x.test/status/1' };
      },
    };
    registerAdapter(fake);

    const sent = await sendPost(post(), NOW + 2 * HOUR);
    expect(sent.status).toBe('posted');
    expect(sent.externalUrl).toBe('https://x.test/status/1');
    expect(sent.postedVia).toBe('x');
    expect(sent.postedAt).toBe(NOW + 2 * HOUR);
  });

  it('records a rejection as failed, with the reason', async () => {
    registerAdapter({
      platform: 'x',
      automatic: true,
      label: 'X (test)',
      async send() {
        return { ok: false, error: 'Duplicate content.' };
      },
    });

    const sent = await sendPost(post(), NOW + 2 * HOUR);
    expect(sent.status).toBe('failed');
    expect(sent.error).toBe('Duplicate content.');
  });

  it('does not let an adapter that throws take down the queue', async () => {
    registerAdapter({
      platform: 'x',
      automatic: true,
      label: 'X (test)',
      async send() {
        throw new Error('socket hang up');
      },
    });

    const sent = await sendPost(post(), NOW + 2 * HOUR);
    expect(sent.status).toBe('failed');
    expect(sent.error).toBe('socket hang up');
  });

  it('never mutates the row it was given', async () => {
    const original = post();
    const snapshot = { ...original };
    await sendPost(original, NOW + 2 * HOUR);
    expect(original).toEqual(snapshot);
  });
});

describe('manual confirmation', () => {
  it('requires a permalink', () => {
    const result = confirmManualPost(post(), '   ', NOW);
    expect(result.status).not.toBe('posted');
    expect(result.error).toContain('link to the post is required');
  });

  it('records who sent it and where it landed', () => {
    const result = confirmManualPost(post(), ' https://x.test/status/9 ', NOW);
    expect(result.status).toBe('posted');
    expect(result.postedVia).toBe('manual');
    expect(result.externalUrl).toBe('https://x.test/status/9');
    expect(result.postedAt).toBe(NOW);
  });
});

describe('cancelling', () => {
  it('cancels a queued post', () => {
    expect(cancelPost(post()).status).toBe('cancelled');
  });

  it('refuses to cancel one that already went out', () => {
    const sent = post({ status: 'posted', externalUrl: 'https://x.test/status/1' });
    expect(cancelPost(sent).status).toBe('posted');
  });
});
