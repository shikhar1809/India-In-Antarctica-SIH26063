/**
 * What actually changed on the public site between two saves of the page
 * builder's data — the "what changes they made" half of the activity log.
 *
 * The builder (Puck) stores the page as an ordered list of blocks, each with a
 * stable `props.id`. Blocks are matched by that id, not by position, so
 * dragging the gallery above the hero reads as "moved", not as two edits.
 */

interface Block { type?: string; props?: Record<string, unknown> }
export interface PageData { content?: Block[]; root?: { props?: Record<string, unknown> } }

/** "HeroBlock" → "Hero", "DatasetBlock" → "Dataset". */
function blockName(b: Block): string {
  const raw = (b.type ?? 'Block').replace(/Block$/, '') || 'Block';
  return raw.replace(/([a-z])([A-Z])/g, '$1 $2');
}

/** A block's own words, so "Edited Banner “Experience the Expedition”" can
 *  be told apart from the other banner. */
function blockTitle(b: Block): string {
  const p = b.props ?? {};
  for (const key of ['heading', 'title', 'label', 'name']) {
    const v = p[key];
    if (typeof v === 'string' && v.trim()) {
      const t = v.trim();
      return ` “${t.length > 40 ? t.slice(0, 39) + '…' : t}”`;
    }
  }
  return '';
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function diffSitePage(before: PageData | null | undefined, after: PageData): string[] {
  const prev = before?.content ?? [];
  const next = after.content ?? [];
  const idOf = (b: Block, i: number) => String(b.props?.id ?? `#${i}`);

  const prevById = new Map(prev.map((b, i) => [idOf(b, i), { b, i }]));
  const nextIds = new Set(next.map((b, i) => idOf(b, i)));
  const changes: string[] = [];

  next.forEach((b, i) => {
    const id = idOf(b, i);
    const old = prevById.get(id);
    if (!old) {
      changes.push(`Added ${blockName(b)}${blockTitle(b)}`);
      return;
    }
    const keys = new Set([...Object.keys(old.b.props ?? {}), ...Object.keys(b.props ?? {})]);
    keys.delete('id');
    const edited = [...keys].filter((k) => !same(old.b.props?.[k], b.props?.[k]));
    if (edited.length) {
      changes.push(`Edited ${blockName(b)}${blockTitle(b)}: ${edited.join(', ')}`);
    }
  });

  prev.forEach((b, i) => {
    if (!nextIds.has(idOf(b, i))) changes.push(`Removed ${blockName(b)}${blockTitle(b)}`);
  });

  // Order only matters among blocks that exist on both sides.
  const kept = (list: Block[]) => list.map(idOf).filter((id) => prevById.has(id) && nextIds.has(id));
  if (!same(kept(prev), kept(next))) changes.push('Reordered blocks');

  if (!same(before?.root?.props ?? {}, after.root?.props ?? {})) changes.push('Changed page settings');

  return changes;
}
