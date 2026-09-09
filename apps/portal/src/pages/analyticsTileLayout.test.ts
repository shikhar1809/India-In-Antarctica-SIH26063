import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  DEFAULT_TILE_ORDER, loadTileLayout, saveTileLayout,
  moveTileInLayout, toggleTileHiddenInLayout, type TileLayout,
} from './analyticsTileLayout';

const STORAGE_KEY = 'iia-portal:analytics-tile-layout:v1';

// This suite runs under vitest's plain 'node' environment (no jsdom), which
// has no localStorage global — a minimal in-memory stand-in is enough to
// exercise the module's own try/catch around it.
beforeAll(() => {
  if (typeof globalThis.localStorage === 'undefined') {
    const store = new Map<string, string>();
    globalThis.localStorage = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => { store.clear(); },
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() { return store.size; },
    } as Storage;
  }
});

describe('loadTileLayout', () => {
  beforeEach(() => localStorage.clear());

  it('returns the default order with nothing hidden when nothing is stored', () => {
    expect(loadTileLayout()).toEqual({ order: DEFAULT_TILE_ORDER, hidden: [] });
  });

  it('round-trips a saved layout', () => {
    const layout: TileLayout = { order: [...DEFAULT_TILE_ORDER].reverse(), hidden: ['oldest'] };
    saveTileLayout(layout);
    expect(loadTileLayout()).toEqual(layout);
  });

  it('drops unknown ids and appends any default id missing from a stale save', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      order: ['published', 'someRetiredTile', 'turnaround'],
      hidden: ['someRetiredTile', 'safety'],
    }));
    const loaded = loadTileLayout();
    expect(loaded.order).not.toContain('someRetiredTile');
    expect(loaded.hidden).toEqual(['safety']);
    // Every default tile is present exactly once, unknown ones dropped.
    expect(loaded.order.sort()).toEqual([...DEFAULT_TILE_ORDER].sort());
  });

  it('falls back to the default on corrupt JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    expect(loadTileLayout()).toEqual({ order: DEFAULT_TILE_ORDER, hidden: [] });
  });
});

describe('moveTileInLayout', () => {
  const layout: TileLayout = { order: ['published', 'turnaround', 'backlog'], hidden: [] } as unknown as TileLayout;

  it('swaps a tile with its next neighbour', () => {
    const next = moveTileInLayout(layout, 'published', 1);
    expect(next.order).toEqual(['turnaround', 'published', 'backlog']);
  });

  it('swaps a tile with its previous neighbour', () => {
    const next = moveTileInLayout(layout, 'backlog', -1);
    expect(next.order).toEqual(['published', 'backlog', 'turnaround']);
  });

  it('is a no-op moving the first tile earlier', () => {
    const next = moveTileInLayout(layout, 'published', -1);
    expect(next).toBe(layout);
  });

  it('is a no-op moving the last tile later', () => {
    const next = moveTileInLayout(layout, 'backlog', 1);
    expect(next).toBe(layout);
  });
});

describe('toggleTileHiddenInLayout', () => {
  it('hides a visible tile', () => {
    const layout: TileLayout = { order: DEFAULT_TILE_ORDER, hidden: [] };
    const next = toggleTileHiddenInLayout(layout, 'oldest');
    expect(next.hidden).toEqual(['oldest']);
  });

  it('shows a hidden tile again', () => {
    const layout: TileLayout = { order: DEFAULT_TILE_ORDER, hidden: ['oldest', 'safety'] };
    const next = toggleTileHiddenInLayout(layout, 'oldest');
    expect(next.hidden).toEqual(['safety']);
  });
});
