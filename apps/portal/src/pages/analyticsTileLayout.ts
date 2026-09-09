/**
 * Which stat tiles lead the Archive dashboard, and in what order — the pure
 * data half of the "Customize layout" feature on Analytics.tsx. Split out
 * for the same reason uptimeMock.ts is separate from UptimeCalendar.tsx: the
 * arrangement logic has no rendering in it and is easier to trust when it
 * can be tested without mounting a component tree that needs Firebase Auth.
 *
 * Stored per-browser (localStorage), not shared across admins or devices —
 * this is a "how I like to read this page" preference, not data anyone else
 * needs to see the same way.
 */

export type TileId =
  | 'published' | 'turnaround' | 'backlog' | 'oldest'
  | 'safety' | 'flagged'
  | 'sent' | 'successRate';

export const DEFAULT_TILE_ORDER: TileId[] = [
  'published', 'turnaround', 'backlog', 'oldest',
  'safety', 'flagged',
  'sent', 'successRate',
];

/** Which of the dashboard's four accountability sections each tile answers
 *  for — shown as a small tag while customizing, so a tile pulled up top
 *  doesn't lose the context of what question it was answering. */
export const TILE_ORIGIN: Record<TileId, string> = {
  published: 'Service delivery', turnaround: 'Service delivery',
  backlog: 'Service delivery', oldest: 'Service delivery',
  safety: 'Governance & safety', flagged: 'Governance & safety',
  sent: 'Reach & dissemination', successRate: 'Reach & dissemination',
};

export interface TileLayout { order: TileId[]; hidden: TileId[] }

const TILE_LAYOUT_KEY = 'iia-portal:analytics-tile-layout:v1';

const KNOWN_TILE_IDS = new Set<string>(DEFAULT_TILE_ORDER);

export function loadTileLayout(): TileLayout {
  try {
    const raw = localStorage.getItem(TILE_LAYOUT_KEY);
    if (!raw) return { order: DEFAULT_TILE_ORDER, hidden: [] };
    const parsed = JSON.parse(raw) as Partial<TileLayout>;
    const savedOrder = (parsed.order ?? []).filter((id): id is TileId => KNOWN_TILE_IDS.has(id));
    // A tile this browser hasn't seen before (one shipped after the
    // preference was saved) joins at the end rather than disappearing.
    const missing = DEFAULT_TILE_ORDER.filter((id) => !savedOrder.includes(id));
    const hidden = (parsed.hidden ?? []).filter((id): id is TileId => KNOWN_TILE_IDS.has(id));
    return { order: [...savedOrder, ...missing], hidden };
  } catch {
    return { order: DEFAULT_TILE_ORDER, hidden: [] };
  }
}

export function saveTileLayout(layout: TileLayout) {
  try {
    localStorage.setItem(TILE_LAYOUT_KEY, JSON.stringify(layout));
  } catch {
    // Private browsing, storage quota, etc. — the page still works, it just
    // won't remember the arrangement next visit.
  }
}

/** Swaps a tile with its neighbour in the given direction. A no-op past
 *  either end, so a caller never needs to check bounds first. */
export function moveTileInLayout(layout: TileLayout, id: TileId, dir: -1 | 1): TileLayout {
  const i = layout.order.indexOf(id);
  const j = i + dir;
  if (i === -1 || j < 0 || j >= layout.order.length) return layout;
  const order = [...layout.order];
  [order[i], order[j]] = [order[j], order[i]];
  return { ...layout, order };
}

export function toggleTileHiddenInLayout(layout: TileLayout, id: TileId): TileLayout {
  const hidden = layout.hidden.includes(id)
    ? layout.hidden.filter((x) => x !== id)
    : [...layout.hidden, id];
  return { ...layout, hidden };
}
