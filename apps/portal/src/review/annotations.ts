/* ═══════════════════════════════════════════════════ review annotations
 *
 * How an admin marks up a post graphic to tell a publisher what needs to
 * change, without retyping "the headline in the top-left is wrong" into a
 * text box and hoping it's clear which headline they mean.
 *
 * Every shape is stored in *fractional* coordinates (0..1 of the image's
 * width/height), never pixels. The graphic is reviewed at whatever size the
 * lightbox happens to be — a laptop, a wide monitor, a resize mid-session —
 * and drawn again, read-only, at a different size in the publisher's Studio
 * view. Pixel coordinates would drift between those; fractional ones don't,
 * because both ends multiply back by their own current width and height.
 *
 * A pin is not a shape with a point geometry bolted on — it is the one tool
 * here that carries a comment, which is the actual communication. The other
 * five tools point at *where*; the pin says *what*.
 */

export type AnnotationTool = 'pen' | 'highlight' | 'arrow' | 'box' | 'circle' | 'pin';

export interface Point { x: number; y: number }

interface AnnotationBase {
  id: string;
  color: string;
  authorName: string;
  createdAt: number;
}

/** Freehand pen or highlighter — a highlighter is a pen with a wider,
 *  translucent stroke, not a different shape, so both share this one. */
export interface PenAnnotation extends AnnotationBase {
  tool: 'pen' | 'highlight';
  points: Point[];
}

/** Arrow, box and circle all resolve from two corners — a drag from the
 *  point the pointer went down to the point it came up. */
export interface ShapeAnnotation extends AnnotationBase {
  tool: 'arrow' | 'box' | 'circle';
  from: Point;
  to: Point;
}

/** The one tool that carries a message. A pin with no comment is a mark
 *  with no meaning, so `createPin` refuses to make one. */
export interface PinAnnotation extends AnnotationBase {
  tool: 'pin';
  at: Point;
  comment: string;
  /** True once the publisher has seen it. Read receipts on individual review
   *  comments, not the whole dispatch, so five small notes don't all get
   *  marked read because the publisher glanced at the first one. */
  acknowledged: boolean;
}

export type Annotation = PenAnnotation | ShapeAnnotation | PinAnnotation;

/* ── type guards ─────────────────────────────────────────────────────────
 *
 * `tool` is a genuine discriminant, but PenAnnotation and ShapeAnnotation
 * each group two or three literals under one interface rather than one
 * literal per interface (the usual textbook shape). TypeScript's narrowing
 * cannot always eliminate a multi-literal member through a chain of
 * `if (a.tool === 'x' ...) return; if (a.tool === 'y') ...` — the negation
 * doesn't reliably reduce that member's discriminant to `never`. An
 * explicit predicate that takes the whole object and asserts its type is
 * unaffected by that limitation, so every render function below uses one of
 * these instead of raw equality chains. */
export function isPenAnnotation(a: Annotation): a is PenAnnotation {
  return a.tool === 'pen' || a.tool === 'highlight';
}
export function isShapeAnnotation(a: Annotation): a is ShapeAnnotation {
  return a.tool === 'arrow' || a.tool === 'box' || a.tool === 'circle';
}
export function isPinAnnotation(a: Annotation): a is PinAnnotation {
  return a.tool === 'pin';
}

const MIN_SHAPE_SPAN = 0.01; // ~1% of the image's own dimension

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function genId(): string {
  return `an-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createPenStroke(
  points: Point[],
  tool: 'pen' | 'highlight',
  color: string,
  authorName: string,
  now = Date.now(),
): PenAnnotation | null {
  // A single click with no drag leaves one point — not a stroke, just a
  // slip. Two points is the shortest real line.
  if (points.length < 2) return null;
  return {
    id: genId(),
    tool,
    color,
    authorName,
    createdAt: now,
    points: points.map((p) => ({ x: clamp01(p.x), y: clamp01(p.y) })),
  };
}

export function createShape(
  tool: 'arrow' | 'box' | 'circle',
  from: Point,
  to: Point,
  color: string,
  authorName: string,
  now = Date.now(),
): ShapeAnnotation | null {
  const f = { x: clamp01(from.x), y: clamp01(from.y) };
  const t = { x: clamp01(to.x), y: clamp01(to.y) };
  // A box or circle dragged less than ~1% of the image is a mis-click, not
  // a mark anyone meant to leave — refusing it here means the drawing
  // surface never has to clean up a shape too small to see or select.
  if (Math.hypot(t.x - f.x, t.y - f.y) < MIN_SHAPE_SPAN) return null;
  return { id: genId(), tool, color, authorName, createdAt: now, from: f, to: t };
}

/** A pin with no comment says nothing — refused rather than created empty,
 *  so every pin on the image is guaranteed to have something to read. */
export function createPin(
  at: Point,
  comment: string,
  color: string,
  authorName: string,
  now = Date.now(),
): PinAnnotation | null {
  const trimmed = comment.trim();
  if (!trimmed) return null;
  return {
    id: genId(),
    tool: 'pin',
    color,
    authorName,
    createdAt: now,
    at: { x: clamp01(at.x), y: clamp01(at.y) },
    comment: trimmed,
    acknowledged: false,
  };
}

export function acknowledgePin(annotations: Annotation[], id: string): Annotation[] {
  return annotations.map((a) => (a.id === id && a.tool === 'pin' ? { ...a, acknowledged: true } : a));
}

export function removeAnnotation(annotations: Annotation[], id: string): Annotation[] {
  return annotations.filter((a) => a.id !== id);
}

export function pinCount(annotations: Annotation[]): { total: number; unread: number } {
  const pins = annotations.filter((a): a is PinAnnotation => a.tool === 'pin');
  return { total: pins.length, unread: pins.filter((p) => !p.acknowledged).length };
}

/** A generous, colour-blind-legible set — five hues plus black, distinct
 *  enough to tell apart on a photo without a legend, since a review mark's
 *  colour has no fixed meaning (unlike the queue's status colours) and is
 *  purely "this admin's ink" vs "that admin's ink" when more than one
 *  person reviews the same post. */
export const ANNOTATION_COLORS = [
  '#e5534b', // red
  '#f0b429', // amber
  '#3fb950', // green
  '#2f9fc9', // blue
  '#a371f7', // violet
  '#f0f3f6', // near-white, for dark photos
] as const;

export const DEFAULT_ANNOTATION_COLOR: string = ANNOTATION_COLORS[0];
