import { describe, it, expect } from 'vitest';
import {
  createPenStroke, createShape, createPin, acknowledgePin, removeAnnotation, pinCount,
  isPenAnnotation, isShapeAnnotation, isPinAnnotation,
  ANNOTATION_COLORS,
  type Annotation,
} from './annotations';

const NOW = Date.UTC(2026, 0, 1);
const RED = ANNOTATION_COLORS[0];

describe('pen strokes', () => {
  it('refuses a single point — not a stroke, just a slip', () => {
    expect(createPenStroke([{ x: 0.1, y: 0.1 }], 'pen', RED, 'Admin', NOW)).toBeNull();
  });

  it('accepts two or more points', () => {
    const s = createPenStroke([{ x: 0, y: 0 }, { x: 0.5, y: 0.5 }], 'pen', RED, 'Admin', NOW);
    expect(s?.points).toHaveLength(2);
    expect(s?.tool).toBe('pen');
  });

  it('clamps points into the image — a drag past the edge stays on it', () => {
    const s = createPenStroke([{ x: -0.2, y: 1.4 }, { x: 0.5, y: 0.5 }], 'pen', RED, 'Admin', NOW);
    expect(s?.points[0]).toEqual({ x: 0, y: 1 });
  });

  it('highlight is the same shape as pen, tagged differently', () => {
    const s = createPenStroke([{ x: 0, y: 0 }, { x: 1, y: 1 }], 'highlight', RED, 'Admin', NOW);
    expect(s?.tool).toBe('highlight');
  });
});

describe('shapes (arrow, box, circle)', () => {
  it('refuses a drag too small to have been a real mark', () => {
    expect(createShape('box', { x: 0.5, y: 0.5 }, { x: 0.502, y: 0.501 }, RED, 'Admin', NOW)).toBeNull();
  });

  it('accepts a real drag', () => {
    const s = createShape('box', { x: 0.1, y: 0.1 }, { x: 0.4, y: 0.3 }, RED, 'Admin', NOW);
    expect(s?.from).toEqual({ x: 0.1, y: 0.1 });
    expect(s?.to).toEqual({ x: 0.4, y: 0.3 });
  });

  it('works the same for arrow and circle', () => {
    expect(createShape('arrow', { x: 0, y: 0 }, { x: 0.5, y: 0.5 }, RED, 'Admin', NOW)?.tool).toBe('arrow');
    expect(createShape('circle', { x: 0, y: 0 }, { x: 0.5, y: 0.5 }, RED, 'Admin', NOW)?.tool).toBe('circle');
  });
});

describe('pins', () => {
  it('refuses an empty comment — a pin with nothing to say marks nothing', () => {
    expect(createPin({ x: 0.5, y: 0.5 }, '   ', RED, 'Admin', NOW)).toBeNull();
  });

  it('trims the comment and starts unacknowledged', () => {
    const p = createPin({ x: 0.5, y: 0.5 }, '  fix the headline  ', RED, 'Admin', NOW);
    expect(p?.comment).toBe('fix the headline');
    expect(p?.acknowledged).toBe(false);
  });

  it('acknowledging one pin leaves the others untouched', () => {
    const a = createPin({ x: 0.1, y: 0.1 }, 'first', RED, 'Admin', NOW)!;
    const b = createPin({ x: 0.2, y: 0.2 }, 'second', RED, 'Admin', NOW)!;
    const list = acknowledgePin([a, b], a.id);
    expect((list[0] as typeof a).acknowledged).toBe(true);
    expect((list[1] as typeof b).acknowledged).toBe(false);
  });

  it('acknowledging by id only ever touches a pin, never a shape sharing coincidental fields', () => {
    const shape = createShape('box', { x: 0, y: 0 }, { x: 0.5, y: 0.5 }, RED, 'Admin', NOW)!;
    const list = acknowledgePin([shape], shape.id);
    expect(list[0]).toBe(shape); // unchanged — not a pin, so untouched
  });
});

describe('pinCount', () => {
  it('counts pins only, and unread separately from total', () => {
    const shape = createShape('box', { x: 0, y: 0 }, { x: 0.5, y: 0.5 }, RED, 'Admin', NOW)!;
    const p1 = createPin({ x: 0.1, y: 0.1 }, 'one', RED, 'Admin', NOW)!;
    const p2 = { ...createPin({ x: 0.2, y: 0.2 }, 'two', RED, 'Admin', NOW)!, acknowledged: true };
    const all: Annotation[] = [shape, p1, p2];
    expect(pinCount(all)).toEqual({ total: 2, unread: 1 });
  });

  it('is zero for an annotation set with no pins', () => {
    const shape = createShape('box', { x: 0, y: 0 }, { x: 0.5, y: 0.5 }, RED, 'Admin', NOW)!;
    expect(pinCount([shape])).toEqual({ total: 0, unread: 0 });
  });
});

describe('type guards', () => {
  // These exist because a plain if-chain on 'pen' | 'highlight' (or
  // 'arrow' | 'box' | 'circle') sharing one interface does not reliably
  // narrow the union through TypeScript's control-flow analysis — see the
  // comment above them in annotations.ts. This test is the runtime half of
  // that guarantee: each guard must sort every kind of annotation into
  // exactly the bucket it belongs in, with no overlap.
  const pen = createPenStroke([{ x: 0, y: 0 }, { x: 1, y: 1 }], 'pen', RED, 'Admin', NOW)!;
  const highlight = createPenStroke([{ x: 0, y: 0 }, { x: 1, y: 1 }], 'highlight', RED, 'Admin', NOW)!;
  const box = createShape('box', { x: 0, y: 0 }, { x: 0.5, y: 0.5 }, RED, 'Admin', NOW)!;
  const circle = createShape('circle', { x: 0, y: 0 }, { x: 0.5, y: 0.5 }, RED, 'Admin', NOW)!;
  const arrow = createShape('arrow', { x: 0, y: 0 }, { x: 0.5, y: 0.5 }, RED, 'Admin', NOW)!;
  const pin = createPin({ x: 0.5, y: 0.5 }, 'fix this', RED, 'Admin', NOW)!;
  const all: Annotation[] = [pen, highlight, box, circle, arrow, pin];

  it('isPenAnnotation matches pen and highlight only', () => {
    expect(all.filter(isPenAnnotation)).toEqual([pen, highlight]);
  });

  it('isShapeAnnotation matches box, circle and arrow only', () => {
    expect(all.filter(isShapeAnnotation)).toEqual([box, circle, arrow]);
  });

  it('isPinAnnotation matches the pin only', () => {
    expect(all.filter(isPinAnnotation)).toEqual([pin]);
  });

  it('every annotation is claimed by exactly one guard', () => {
    for (const a of all) {
      const matches = [isPenAnnotation(a), isShapeAnnotation(a), isPinAnnotation(a)].filter(Boolean).length;
      expect(matches).toBe(1);
    }
  });
});

describe('removeAnnotation', () => {
  it('removes exactly the matching id', () => {
    const a = createShape('box', { x: 0, y: 0 }, { x: 0.5, y: 0.5 }, RED, 'Admin', NOW)!;
    const b = createShape('circle', { x: 0, y: 0 }, { x: 0.3, y: 0.3 }, RED, 'Admin', NOW)!;
    expect(removeAnnotation([a, b], a.id)).toEqual([b]);
  });
});
