/**
 * The enlarged, markable view of a post graphic.
 *
 * Opened by clicking the image; right-click inside it opens the radial tool
 * picker (RadialMenu, a real @base-ui-components ContextMenu underneath, so
 * escape-to-close and focus handling come for free); closing the lightbox
 * — the X, Escape, or the backdrop — hands right-click back to the browser's
 * ordinary menu everywhere else on the page, because the ContextMenu only
 * ever wrapped the image inside this component.
 *
 * Every mark is stored in fractional (0..1) coordinates, not pixels — see
 * review/annotations.ts for why. That is what lets the same annotation set
 * render correctly both here, at whatever size the lightbox happens to be,
 * and read-only in the publisher's Studio view at a completely different
 * size.
 *
 * Six tools: pen, highlighter, arrow, box, circle, pin. The first five mark
 * *where*; the pin is the only one that carries a comment, because a mark
 * with no words attached tells a publisher something is wrong without ever
 * saying what — which is the failure mode this whole feature exists to fix.
 */

import { useRef, useState } from 'react';
import {
  Circle, Highlighter, MapPin, MoveUpRight, Pen, Square, Trash2, X,
} from 'lucide-react';
import { RadialMenu, type RadialMenuItem } from '@/components/ui/radial-menu';
import {
  createPenStroke, createShape, createPin, removeAnnotation,
  isPenAnnotation, isShapeAnnotation, isPinAnnotation,
  ANNOTATION_COLORS, DEFAULT_ANNOTATION_COLOR,
  type Annotation, type AnnotationTool, type Point,
} from './annotations';
import './ImageAnnotator.css';

const TOOLS: RadialMenuItem[] = [
  { id: 'pen', label: 'Pen', icon: Pen },
  { id: 'highlight', label: 'Highlighter', icon: Highlighter },
  { id: 'arrow', label: 'Arrow', icon: MoveUpRight },
  { id: 'box', label: 'Box', icon: Square },
  { id: 'circle', label: 'Circle', icon: Circle },
  { id: 'pin', label: 'Pin', icon: MapPin },
];

/** Freehand tools sample every pointer move, which on a fast mouse produces
 *  far more points than the eye needs — thinned here rather than at draw
 *  time, so the live preview stays exactly what was drawn and only the
 *  stored shape is simplified. */
function thin(points: Point[], minGap = 0.006): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= minGap) out.push(p);
  }
  return out;
}

function pathFrom(points: Point[]): string {
  if (points.length === 0) return '';
  return `M ${points.map((p) => `${p.x * 100} ${p.y * 100}`).join(' L ')}`;
}

/** A hand-drawn triangle rather than an SVG `<marker>` — a marker's fill
 *  cannot be set per-instance without one `<marker>` element per colour in
 *  use, and the palette is open-ended (six presets, but nothing stops a
 *  future change adding more). Three points computed from the line's own
 *  angle costs nothing and needs no defs. */
function arrowHead(from: Point, to: Point, size = 2.2): string {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const spread = 0.5;
  const p1 = { x: to.x - size * Math.cos(angle - spread), y: to.y - size * Math.sin(angle - spread) };
  const p2 = { x: to.x - size * Math.cos(angle + spread), y: to.y - size * Math.sin(angle + spread) };
  return `${to.x * 100},${to.y * 100} ${p1.x * 100},${p1.y * 100} ${p2.x * 100},${p2.y * 100}`;
}

type PenDraft = { tool: 'pen' | 'highlight'; points: Point[] };
type ShapeDraft = { tool: 'arrow' | 'box' | 'circle'; from: Point; to: Point };
type Draft = PenDraft | ShapeDraft | null;

/** Same reasoning as annotations.ts's guards — 'pen'|'highlight' grouped
 *  under one shape defeats plain if-chain narrowing, so this checks the
 *  whole object rather than relying on elimination through negation. */
function isPenDraft(d: NonNullable<Draft>): d is PenDraft {
  return d.tool === 'pen' || d.tool === 'highlight';
}

export function ImageAnnotator({
  imageUrl,
  annotations,
  authorName,
  onChange,
  onSave,
  onClose,
  saving = false,
}: {
  imageUrl: string;
  annotations: Annotation[];
  authorName: string;
  /** Fires on every local change (draw, delete) — the caller can persist
   *  immediately or batch until `onSave`, its choice. */
  onChange: (next: Annotation[]) => void;
  onSave: () => void;
  onClose: () => void;
  saving?: boolean;
}) {
  const [tool, setTool] = useState<AnnotationTool | null>(null);
  const [color, setColor] = useState<string>(DEFAULT_ANNOTATION_COLOR);
  const [draft, setDraft] = useState<Draft>(null);
  const [pinDraft, setPinDraft] = useState<{ at: Point; text: string } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const drawing = useRef(false);

  const toFraction = (clientX: number, clientY: number): Point => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
    return { x: (clientX - rect.left) / rect.width, y: (clientY - rect.top) / rect.height };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!tool || e.button !== 0) return;
    const p = toFraction(e.clientX, e.clientY);

    if (tool === 'pin') {
      setPinDraft({ at: p, text: '' });
      return;
    }

    drawing.current = true;
    (e.target as Element).setPointerCapture(e.pointerId);
    setDraft(
      tool === 'pen' || tool === 'highlight'
        ? { tool, points: [p] }
        : { tool, from: p, to: p },
    );
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawing.current || !draft) return;
    const p = toFraction(e.clientX, e.clientY);
    setDraft((d) => {
      if (!d) return d;
      return isPenDraft(d) ? { ...d, points: [...d.points, p] } : { ...d, to: p };
    });
  };

  const onPointerUp = () => {
    if (!drawing.current || !draft) { drawing.current = false; return; }
    drawing.current = false;

    const made = isPenDraft(draft)
      ? createPenStroke(thin(draft.points), draft.tool, color, authorName)
      : createShape(draft.tool, draft.from, draft.to, color, authorName);

    setDraft(null);
    if (made) onChange([...annotations, made]);
  };

  const commitPin = () => {
    if (!pinDraft) return;
    const made = createPin(pinDraft.at, pinDraft.text, color, authorName);
    setPinDraft(null);
    if (made) onChange([...annotations, made]);
  };

  const deleteSelected = () => {
    if (!selected) return;
    onChange(removeAnnotation(annotations, selected));
    setSelected(null);
  };

  return (
    <div className="ia-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ia-shell">
        <div className="ia-topbar">
          <div className="ia-tool-readout">
            {tool ? (
              <>Right-click to change tool — drawing with <strong>{TOOLS.find((t) => t.id === tool)?.label}</strong></>
            ) : (
              <>Right-click the image to choose a tool</>
            )}
          </div>
          <div className="ia-actions">
            <button className="ph-btn primary" disabled={saving} onClick={onSave}>
              {saving ? 'Saving…' : 'Save annotations'}
            </button>
            <button className="ia-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
          </div>
        </div>

        <RadialMenu
          menuItems={TOOLS}
          activeId={tool}
          onSelect={(item) => { setTool(item.id as AnnotationTool); setSelected(null); }}
        >
          <div
            ref={surfaceRef}
            className={'ia-surface' + (tool ? ' ia-drawing' : '')}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          >
            <img src={imageUrl} alt="" className="ia-image" draggable={false} />

            <svg className="ia-overlay" viewBox="0 0 100 100" preserveAspectRatio="none">
              {annotations.map((a) => {
                const isSel = selected === a.id;

                if (isPenAnnotation(a)) {
                  return (
                    <path
                      key={a.id}
                      d={pathFrom(a.points)}
                      fill="none"
                      stroke={a.color}
                      strokeWidth={a.tool === 'highlight' ? 3.2 : 0.9}
                      strokeOpacity={a.tool === 'highlight' ? 0.4 : 1}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                      className={isSel ? 'ia-selected' : undefined}
                      onClick={() => !tool && setSelected(a.id)}
                    />
                  );
                }

                if (isShapeAnnotation(a)) {
                  if (a.tool === 'box') {
                    const x = Math.min(a.from.x, a.to.x) * 100;
                    const y = Math.min(a.from.y, a.to.y) * 100;
                    const w = Math.abs(a.to.x - a.from.x) * 100;
                    const h = Math.abs(a.to.y - a.from.y) * 100;
                    return (
                      <rect key={a.id} x={x} y={y} width={w} height={h} fill="none" stroke={a.color} strokeWidth={0.9}
                        vectorEffect="non-scaling-stroke" className={isSel ? 'ia-selected' : undefined}
                        onClick={() => !tool && setSelected(a.id)} />
                    );
                  }
                  if (a.tool === 'circle') {
                    const cx = (a.from.x + a.to.x) / 2 * 100;
                    const cy = (a.from.y + a.to.y) / 2 * 100;
                    const rx = Math.abs(a.to.x - a.from.x) / 2 * 100;
                    const ry = Math.abs(a.to.y - a.from.y) / 2 * 100;
                    return (
                      <ellipse key={a.id} cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke={a.color} strokeWidth={0.9}
                        vectorEffect="non-scaling-stroke" className={isSel ? 'ia-selected' : undefined}
                        onClick={() => !tool && setSelected(a.id)} />
                    );
                  }
                  // arrow
                  return (
                    <g key={a.id} onClick={() => !tool && setSelected(a.id)} className={isSel ? 'ia-selected' : undefined}>
                      <line x1={a.from.x * 100} y1={a.from.y * 100} x2={a.to.x * 100} y2={a.to.y * 100}
                        stroke={a.color} strokeWidth={0.9} vectorEffect="non-scaling-stroke" />
                      <polygon points={arrowHead(a.from, a.to)} fill={a.color} />
                    </g>
                  );
                }

                if (isPinAnnotation(a)) {
                  return (
                    <g key={a.id} className={'ia-pin' + (isSel ? ' ia-selected' : '')} onClick={() => !tool && setSelected(isSel ? null : a.id)}>
                      <circle cx={a.at.x * 100} cy={a.at.y * 100} r={1.6} fill={a.color} stroke="#0d1420" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
                      {!a.acknowledged && <circle cx={a.at.x * 100} cy={a.at.y * 100} r={2.6} fill="none" stroke={a.color} strokeWidth={0.4} vectorEffect="non-scaling-stroke" className="ia-pin-pulse" />}
                    </g>
                  );
                }

                return null;
              })}

              {/* Live preview of the shape currently being drawn — not yet
                  committed, so it carries no id and isn't clickable. Drawn
                  with the same isPenDraft/tool checks used for committed
                  annotations, for the same narrowing reason (see
                  annotations.ts's guard functions) — Draft groups
                  pen/highlight under one shape and arrow/box/circle under
                  another, so it needs the same treatment. */}
              {draft && (isPenDraft(draft) ? (
                <path d={pathFrom(draft.points)} fill="none" stroke={color}
                  strokeWidth={draft.tool === 'highlight' ? 3.2 : 0.9}
                  strokeOpacity={draft.tool === 'highlight' ? 0.4 : 0.8}
                  strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              ) : draft.tool === 'box' ? (
                <rect
                  x={Math.min(draft.from.x, draft.to.x) * 100} y={Math.min(draft.from.y, draft.to.y) * 100}
                  width={Math.abs(draft.to.x - draft.from.x) * 100} height={Math.abs(draft.to.y - draft.from.y) * 100}
                  fill="none" stroke={color} strokeOpacity={0.8} strokeDasharray="1.5 1" strokeWidth={0.9} vectorEffect="non-scaling-stroke" />
              ) : draft.tool === 'circle' ? (
                <ellipse
                  cx={(draft.from.x + draft.to.x) / 2 * 100} cy={(draft.from.y + draft.to.y) / 2 * 100}
                  rx={Math.abs(draft.to.x - draft.from.x) / 2 * 100} ry={Math.abs(draft.to.y - draft.from.y) / 2 * 100}
                  fill="none" stroke={color} strokeOpacity={0.8} strokeDasharray="1.5 1" strokeWidth={0.9} vectorEffect="non-scaling-stroke" />
              ) : (
                <line x1={draft.from.x * 100} y1={draft.from.y * 100} x2={draft.to.x * 100} y2={draft.to.y * 100}
                  stroke={color} strokeOpacity={0.8} strokeWidth={0.9} vectorEffect="non-scaling-stroke" />
              ))}
            </svg>

            {/* Comments render as HTML, not SVG text — real line-wrapping
                and a real textarea for the one in progress, neither of
                which SVG does without a foreignObject fighting the
                viewBox's percentage coordinate space. */}
            {annotations.filter(isPinAnnotation).filter((a) => selected === a.id).map((a) => (
              <div key={a.id} className="ia-comment" style={{ left: `${a.at.x * 100}%`, top: `${a.at.y * 100}%` }}>
                <p>{a.comment}</p>
                <div className="ia-comment-meta">
                  <span>{a.authorName}</span>
                  <button onClick={deleteSelected} aria-label="Delete this pin"><Trash2 size={13} /></button>
                </div>
              </div>
            ))}

            {pinDraft && (
              <div className="ia-comment ia-comment-active" style={{ left: `${pinDraft.at.x * 100}%`, top: `${pinDraft.at.y * 100}%` }}>
                <textarea
                  autoFocus
                  rows={2}
                  placeholder="What needs to change here?"
                  value={pinDraft.text}
                  onChange={(e) => setPinDraft((d) => (d ? { ...d, text: e.target.value } : d))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitPin(); }
                    if (e.key === 'Escape') setPinDraft(null);
                  }}
                  onBlur={commitPin}
                />
              </div>
            )}
          </div>
        </RadialMenu>

        <div className="ia-toolbar">
          <div className="ia-colors">
            {ANNOTATION_COLORS.map((c) => (
              <button
                key={c}
                className={'ia-swatch' + (c === color ? ' is-active' : '')}
                style={{ background: c }}
                aria-label={`Colour ${c}`}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
          {selected && (
            <button className="ph-btn ghost small" onClick={deleteSelected}>
              <Trash2 size={13} style={{ marginRight: 4 }} />Delete selected mark
            </button>
          )}
          {tool && (
            <button className="ph-btn ghost small" onClick={() => setTool(null)}>
              Stop drawing
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
