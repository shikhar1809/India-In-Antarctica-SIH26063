/**
 * The post studio — what a publisher actually uses.
 *
 * Replaces the old per-platform caption wizard. The shape of the change is
 * the important part: the old flow asked the publisher to write three
 * captions from a blank box before they had seen anything. This one shows
 * three finished posts first and lets them point at one, because choosing
 * is easy and describing is hard — especially for someone who is a
 * scientist or a comms officer rather than a designer.
 *
 * Five steps, each one thing:
 *   Brief   → what happened, who it is for, how it should sound
 *   Pick    → three genuinely different takes, rendered, side by side
 *   Refine  → adjust the one they chose with fixed, instant controls
 *   Public  → the plain-language record for the Knowledge Repository
 *   Review  → SOP checklist, in-feed previews, submit for approval
 *
 * Nothing here reaches an audience on its own: submitting sets the status
 * to `drafted`, and an admin still has to approve. That gate is unchanged.
 */

import { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Check, Download, Paperclip, RotateCcw,
  Sparkles, TriangleAlert, Wand2,
} from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';

import { db, storage } from '../firebase';
import { useAuth } from '../context/AuthContext';
import type { Dispatch, DispatchStatus, PlatformCaptions, StoredPublicSummary } from '../types';
import { PLATFORM_LIMITS, SOP_CHECKLIST_ITEMS } from '../types';
import { normaliseDispatch } from '../repository/normalise';
import { draftPublicSummary } from '../repository/summarise';
import { acknowledgePin, pinCount, isPinAnnotation } from '../review/annotations';

import { PALETTES, PLATFORM_SPECS, PLATFORM_ORDER, paletteById, DEFAULT_PALETTE } from './brand';
import type { PlatformId } from './brand';
import { TEMPLATES, templateById, simpler, bolder, DEFAULT_TEMPLATE } from './templates';
import type { TemplateId } from './templates';
import {
  AUDIENCES, TONES, COPY_REFINEMENTS, DEFAULT_BRIEF,
  draftVariants, generateVariants, refineCopy, withSourceLink,
} from './copy';
import type { Brief, PostCopy, Variant } from './copy';
import { KnowledgeBase } from './KnowledgeBase';
import { PostCanvas } from './PostCanvas';
import { downloadPng } from './export';
import { PreviewX, PreviewInstagram, PreviewLinkedIn } from './PlatformPreview';
import './Studio.css';

const EMPTY_SOP: Record<string, boolean> = Object.fromEntries(SOP_CHECKLIST_ITEMS.map((i) => [i.id, false]));

const STEPS = [
  { id: 'brief',  label: 'Brief',      hint: 'Tell us what happened. Everything else has a sensible default — you can change it later.' },
  { id: 'pick',   label: 'Pick',       hint: 'Three different takes on the same report. Choose the one closest to what you want.' },
  { id: 'refine', label: 'Refine',     hint: 'Adjust the layout, colour and words. Every control here is instant — nothing regenerates behind your back.' },
  { id: 'public', label: 'Public page', hint: 'The plain-language version for the Knowledge Repository. Different job from a social post: this one is the permanent record.' },
  { id: 'review', label: 'Review',     hint: 'How it looks in each feed, the checks that gate submission, then over to an admin.' },
] as const;

const LINE_BREAK = String.fromCharCode(10);

export function Studio({ dispatch: d, onSubmitted }: { dispatch: Dispatch; onSubmitted: () => void }) {
  const { user } = useAuth();

  /* The dispatch as it should be read, not as it arrived — an older field-app
   * build may have sent Australian station names, METAR weather codes or an
   * empty measurement map. normaliseDispatch repairs what it can and reports
   * what it couldn't, so the publisher sees the problems rather than
   * unknowingly publishing them. */
  const { dispatch: clean, measurements, warnings } = useMemo(() => normaliseDispatch(d), [d]);

  const [stepIdx, setStepIdx] = useState(0);
  const step = STEPS[stepIdx];

  /* ── brief ── */
  const [brief, setBrief] = useState<Brief>(() => ({
    topic: d.notes ?? '',
    ...DEFAULT_BRIEF,
  }));
  const [platforms, setPlatforms] = useState<PlatformId[]>(['instagram', 'x', 'linkedin']);

  /* ── generation ── */
  const [variants, setVariants] = useState<Variant[]>([]);
  const [generating, setGenerating] = useState(false);
  const [genNote, setGenNote] = useState<string | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);

  /* ── the chosen post ── */
  const [copy, setCopy] = useState<PostCopy | null>(null);
  const [templateId, setTemplateId] = useState<TemplateId>(
    (d.postDesign?.templateId as TemplateId) ?? DEFAULT_TEMPLATE.id,
  );
  const [paletteId, setPaletteId] = useState<string>(d.postDesign?.paletteId ?? DEFAULT_PALETTE.id);
  const [canvasPlatform, setCanvasPlatform] = useState<PlatformId>(
    (d.postDesign?.platform as PlatformId) ?? 'instagram',
  );
  const [photoIndex, setPhotoIndex] = useState(d.postDesign?.photoIndex ?? d.coverImageIndex ?? 0);

  /* ── everything that gets written back ── */
  const [captions, setCaptions] = useState<PlatformCaptions>(
    () => d.platformCaptions ?? { x: '', linkedin: '', instagram: '' },
  );
  const [images, setImages] = useState<string[]>(d.imageUrls ?? []);
  const [sop, setSop] = useState<Record<string, boolean>>(d.sopChecklist ?? EMPTY_SOP);
  const [publicSummary, setPublicSummary] = useState<StoredPublicSummary>(() => {
    if (d.publicSummary) return d.publicSummary;
    const drafted = draftPublicSummary(clean, measurements);
    return { title: drafted.title, body: drafted.body, table: drafted.table, chart: drafted.chart ?? null };
  });

  /* ── transient UI ── */
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const template = templateById(templateId);
  const palette = paletteById(paletteId);
  const photoUrl = images[photoIndex] ?? images[0] ?? null;
  const authorName = user?.displayName ?? user?.email ?? 'Publisher';

  /* ───────────────────────────────────────────────────────────── actions ── */

  const runGenerate = async () => {
    setGenerating(true);
    setGenNote(null);
    try {
      const result = await generateVariants(clean, measurements, brief);
      setVariants(withSourceLink(result.variants, brief.source));
      setGenNote(
        result.generated
          ? 'Written by the generator. Read it before you submit — it can get details wrong.'
          : result.reason ?? 'Using the offline draft.',
      );
      setStepIdx(1);
    } catch {
      const fallback = draftVariants(clean, measurements, brief);
      setVariants(withSourceLink(fallback, brief.source));
      setGenNote('Using the offline draft.');
      setStepIdx(1);
    } finally {
      setGenerating(false);
    }
  };

  const pick = (v: Variant) => {
    setPickedId(v.id);
    setCopy(v.copy);
    setCaptions(v.copy.captions);
    setStepIdx(2);
  };

  const applyCopyRefinement = (op: Parameters<typeof refineCopy>[1]) => {
    if (!copy) return;
    setCopy(refineCopy(copy, op));
  };

  const nextPalette = () => {
    const i = PALETTES.findIndex((p) => p.id === paletteId);
    setPaletteId(PALETTES[(i + 1) % PALETTES.length].id);
  };

  const handleFileSelected = async (file: File | undefined) => {
    if (!file || !user) return;
    if (!file.type.startsWith('image/')) { setUploadError('Only image files are supported.'); return; }
    if (file.size > 10 * 1024 * 1024) { setUploadError('Image exceeds the 10 MB limit.'); return; }
    if (images.length >= 8) { setUploadError('Up to 8 photos per post.'); return; }
    setUploadError(null);
    setUploading(true);
    setUploadPct(0);
    try {
      const objRef = ref(storage, `dispatches/${user.uid}/${d.id}/${Date.now()}-${file.name}`);
      const task = uploadBytesResumable(objRef, file);
      await new Promise<void>((resolve, reject) => {
        task.on('state_changed',
          (snap) => setUploadPct(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
          reject, () => resolve());
      });
      const url = await getDownloadURL(objRef);
      setImages((prev) => { setPhotoIndex(prev.length); return [...prev, url]; });
    } catch {
      setUploadError('Upload failed — check your connection and try again.');
    } finally {
      setUploading(false);
    }
  };

  const exportGraphic = async () => {
    if (!canvasRef.current) return;
    setExporting(true);
    try {
      await downloadPng(canvasRef.current, canvasPlatform, `iia-${d.id}-${canvasPlatform}`);
    } catch {
      setUploadError('Could not build the PNG. The photo may be blocking cross-origin reads.');
    } finally {
      setExporting(false);
    }
  };

  const copyCaption = async (id: keyof PlatformCaptions) => {
    try {
      await navigator.clipboard.writeText(captions[id]);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch { /* clipboard permission denied — nothing to fall back to */ }
  };

  const allChecked = SOP_CHECKLIST_ITEMS.every((i) => sop[i.id]);
  const hasAnyCaption = (Object.keys(captions) as (keyof PlatformCaptions)[]).some((k) => captions[k].trim());

  const submit = async () => {
    if (!user || !allChecked || !hasAnyCaption || !copy) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'dispatches', d.id), {
        caption: captions.x || captions.linkedin || captions.instagram,
        platformCaptions: captions,
        imageUrls: images,
        coverImageIndex: photoIndex,
        sopChecklist: sop,
        publicSummary,
        postDesign: {
          templateId, paletteId, platform: canvasPlatform, photoIndex,
          kicker: copy.kicker, headline: copy.headline, standfirst: copy.standfirst,
          generated: genNote?.startsWith('Written by') ?? false,
        },
        status: 'drafted' satisfies DispatchStatus,
        publisherUid: user.uid,
        publisherName: authorName,
        adminNotes: null,
        updatedAt: Date.now(),
      });
      onSubmitted();
    } finally { setSaving(false); }
  };

  /* ─────────────────────────────────────────────────────────────── render ── */

  const canAdvance =
    stepIdx === 0 ? brief.topic.trim().length > 0
    : stepIdx === 1 ? !!pickedId
    : true;

  return (
    <div className="stu">
      {d.status === 'flagged' && d.adminNotes && (
        <div className="fld-flagnote"><span>Sent back with a note</span><p>{d.adminNotes}</p></div>
      )}

      <ReviewNotes dispatch={d} />

      {/* ── stepper ── */}
      <ol className="stu-steps">
        {STEPS.map((s, i) => (
          <li key={s.id}>
            <button
              type="button"
              className={'stu-step' + (i === stepIdx ? ' is-active' : '') + (i < stepIdx ? ' is-done' : '')}
              onClick={() => i < stepIdx && setStepIdx(i)}
              disabled={i > stepIdx}
            >
              <span className="stu-step-num">{i < stepIdx ? <Check size={11} strokeWidth={3} /> : i + 1}</span>
              {s.label}
            </button>
          </li>
        ))}
      </ol>
      <p className="stu-hint">{step.hint}</p>

      {warnings.length > 0 && stepIdx === 0 && (
        <div className="fld-datawarn">
          <span><TriangleAlert size={12} strokeWidth={2.5} /> Check this data before publishing</span>
          <ul>{warnings.map((w, i) => <li key={i}>{w.message}</li>)}</ul>
        </div>
      )}

      {/* ══════════════════════════════════════════════════ 1 · BRIEF ══ */}
      {step.id === 'brief' && (
        <div className="stu-panel stu-brief">
          <label className="stu-field">
            <span className="stu-label">What happened?</span>
            <span className="stu-sub">Pre-filled from the field notes. Rewrite it in your own words if that reads better — this is what the post is about.</span>
            <textarea
              className="stu-textarea"
              rows={5}
              value={brief.topic}
              onChange={(e) => setBrief((b) => ({ ...b, topic: e.target.value }))}
              placeholder="e.g. We measured ice thickness at twelve stakes across the shelf this week…"
            />
          </label>

          {/* Not every post follows a fresh field report. Pulling a published
              record in gives the generator the archive's own facts to write
              from, and carries the record's permanent link along with it. */}
          <details className="stu-kb">
            <summary>
              <span className="stu-label">From existing knowledge base</span>
              <span className="stu-sub">Build the post on a published record or dataset — the 1998 Maitri series, a station history, an expedition report.</span>
            </summary>
            <KnowledgeBase
              onPick={(material, source) =>
                setBrief((b) => ({
                  ...b,
                  // Appended, not replaced: a publisher who already wrote a
                  // line of their own should not lose it to a click.
                  topic: b.topic.trim() ? b.topic.trim() + LINE_BREAK + LINE_BREAK + material : material,
                  source,
                }))
              }
            />
            {brief.source && (
              <p className="stu-kb-note">
                Linking to <code>{brief.source.identifier}</code> — the address is added to
                each caption after the text is written, so it is always the real one.
              </p>
            )}
          </details>

          <div className="stu-chiprow">
            <span className="stu-label">Who is it for?</span>
            <div className="stu-chips">
              {AUDIENCES.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={'stu-chip' + (brief.audience === a.id ? ' is-on' : '')}
                  onClick={() => setBrief((b) => ({ ...b, audience: a.id }))}
                  title={a.hint}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          <div className="stu-chiprow">
            <span className="stu-label">How should it sound?</span>
            <div className="stu-chips">
              {TONES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={'stu-chip' + (brief.tone === t.id ? ' is-on' : '')}
                  onClick={() => setBrief((b) => ({ ...b, tone: t.id }))}
                  title={t.hint}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="stu-chiprow">
            <span className="stu-label">Where is it going?</span>
            <div className="stu-chips">
              {PLATFORM_ORDER.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={'stu-chip' + (platforms.includes(p) ? ' is-on' : '')}
                  onClick={() => setPlatforms((prev) =>
                    prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p])}
                  title={PLATFORM_SPECS[p].note}
                >
                  {PLATFORM_SPECS[p].label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            className="stu-primary"
            onClick={runGenerate}
            disabled={generating || !brief.topic.trim()}
          >
            <Sparkles size={15} strokeWidth={2.5} />
            {generating ? 'Writing three options…' : 'Show me three options'}
          </button>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════ 2 · PICK ══ */}
      {step.id === 'pick' && (
        <div className="stu-panel">
          {genNote && <p className="stu-gennote">{genNote}</p>}
          <div className="stu-variants">
            {variants.map((v) => (
              <button key={v.id} type="button" className="stu-variant" onClick={() => pick(v)}>
                <PostCanvas
                  platform="instagram"
                  template={template}
                  palette={palette}
                  copy={v.copy}
                  photoUrl={photoUrl}
                  scale={0.26}
                />
                <span className="stu-variant-angle">{v.angle}</span>
                <span className="stu-variant-pick">Choose this</span>
              </button>
            ))}
          </div>
          <button type="button" className="stu-ghost" onClick={runGenerate} disabled={generating}>
            <RotateCcw size={13} strokeWidth={2.5} /> Three different ones
          </button>
        </div>
      )}

      {/* ═════════════════════════════════════════════════ 3 · REFINE ══ */}
      {step.id === 'refine' && copy && (
        <div className="stu-panel stu-refine">
          <div className="stu-refine-canvas">
            <div className="stu-platform-tabs">
              {PLATFORM_ORDER.filter((p) => platforms.includes(p)).map((p) => (
                <button
                  key={p}
                  type="button"
                  className={'stu-ptab' + (canvasPlatform === p ? ' is-on' : '')}
                  onClick={() => setCanvasPlatform(p)}
                >
                  {PLATFORM_SPECS[p].label}
                </button>
              ))}
            </div>
            <PostCanvas
              platform={canvasPlatform}
              template={template}
              palette={palette}
              copy={copy}
              photoUrl={photoUrl}
              scale={canvasPlatform === 'story' ? 0.2 : canvasPlatform === 'instagram' ? 0.34 : 0.26}
              exportRef={canvasRef}
            />
            <span className="stu-canvas-meta">
              {PLATFORM_SPECS[canvasPlatform].w} × {PLATFORM_SPECS[canvasPlatform].h} · {PLATFORM_SPECS[canvasPlatform].note}
            </span>
            <button type="button" className="stu-ghost" onClick={exportGraphic} disabled={exporting}>
              <Download size={13} strokeWidth={2.5} /> {exporting ? 'Building PNG…' : 'Download PNG'}
            </button>
          </div>

          <div className="stu-controls">
            <div className="stu-ctrl">
              <span className="stu-label">Layout</span>
              <div className="stu-chips">
                {TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={'stu-chip' + (templateId === t.id ? ' is-on' : '')}
                    onClick={() => setTemplateId(t.id)}
                    title={t.hint}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="stu-quick">
                <button type="button" onClick={() => setTemplateId(simpler(templateId))}>Make it simpler</button>
                <button type="button" onClick={() => setTemplateId(bolder(templateId))}>Make it bolder</button>
              </div>
            </div>

            <div className="stu-ctrl">
              <span className="stu-label">Colour</span>
              <div className="stu-swatches">
                {PALETTES.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={'stu-swatch' + (paletteId === p.id ? ' is-on' : '')}
                    onClick={() => setPaletteId(p.id)}
                    title={p.label}
                    style={{ background: p.ground, borderColor: p.accent }}
                  >
                    <span style={{ background: p.accent }} />
                  </button>
                ))}
                <button type="button" className="stu-quick-inline" onClick={nextPalette}>
                  <Wand2 size={12} strokeWidth={2.5} /> Different colour
                </button>
              </div>
            </div>

            <div className="stu-ctrl">
              <span className="stu-label">Photograph</span>
              {images.length > 0 ? (
                <div className="stu-photos">
                  {images.map((url, i) => (
                    <button
                      key={url}
                      type="button"
                      className={'stu-photo' + (photoIndex === i ? ' is-on' : '')}
                      onClick={() => setPhotoIndex(i)}
                    >
                      <img src={url} alt="" />
                    </button>
                  ))}
                </div>
              ) : (
                <p className="stu-sub">
                  No photograph on this report. The layout will use flat colour — or add one below.
                  Real station photography always beats a generated image for a government record.
                </p>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => { handleFileSelected(e.target.files?.[0]); e.target.value = ''; }}
              />
              <button type="button" className="stu-ghost" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                <Paperclip size={13} strokeWidth={2.5} />
                {uploading ? `Uploading ${uploadPct}%` : 'Add a photo'}
              </button>
              {uploadError && <p className="stu-error">{uploadError}</p>}
            </div>

            <div className="stu-ctrl">
              <span className="stu-label">Words on the graphic</span>
              <input
                className="stu-input"
                value={copy.headline}
                onChange={(e) => setCopy({ ...copy, headline: e.target.value })}
                placeholder="Headline"
              />
              {/* Not every layout draws every field — "One number" has no
                * headline, "Statement" no supporting line. The text is still
                * kept and still feeds the captions, so the input stays; what
                * would be dishonest is letting someone edit a line and watch
                * the preview not change without being told why. */}
              {!template.slots.headline && (
                <p className="stu-sub">This layout shows the figure instead of a headline. The wording above still goes into the captions.</p>
              )}
              <textarea
                className="stu-textarea"
                rows={2}
                value={copy.standfirst}
                onChange={(e) => setCopy({ ...copy, standfirst: e.target.value })}
                placeholder="One supporting sentence"
              />
              {!template.slots.standfirst && (
                <p className="stu-sub">This layout has no supporting line. The sentence above still goes into the captions.</p>
              )}
              <div className="stu-quick">
                {COPY_REFINEMENTS.map((r) => (
                  <button key={r.id} type="button" onClick={() => applyCopyRefinement(r.id)}>{r.label}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════════ 4 · PUBLIC ══ */}
      {step.id === 'public' && (
        <div className="stu-panel stu-public">
          <label className="stu-field">
            <span className="stu-label">Headline</span>
            <input
              className="stu-input"
              value={publicSummary.title}
              onChange={(e) => setPublicSummary({ ...publicSummary, title: e.target.value })}
            />
          </label>
          {publicSummary.body.map((para, i) => (
            <label className="stu-field" key={i}>
              <span className="stu-label">Paragraph {i + 1}</span>
              <textarea
                className="stu-textarea"
                rows={3}
                value={para}
                onChange={(e) => setPublicSummary({
                  ...publicSummary,
                  body: publicSummary.body.map((p, j) => (j === i ? e.target.value : p)),
                })}
              />
            </label>
          ))}
          <button
            type="button"
            className="stu-ghost"
            onClick={() => {
              const drafted = draftPublicSummary(clean, measurements);
              setPublicSummary({ title: drafted.title, body: drafted.body, table: drafted.table, chart: drafted.chart ?? null });
            }}
          >
            <RotateCcw size={13} strokeWidth={2.5} /> Start this draft again
          </button>
        </div>
      )}

      {/* ═════════════════════════════════════════════════ 5 · REVIEW ══ */}
      {step.id === 'review' && copy && (
        <div className="stu-panel stu-review">
          <div className="stu-review-feeds">
            {platforms.includes('x') && (
              <PreviewX name={authorName} avatarUrl={user?.photoURL} caption={captions.x}
                imageUrl={photoUrl} onCopy={() => copyCaption('x')} copied={copiedId === 'x'} />
            )}
            {platforms.includes('instagram') && (
              <PreviewInstagram name={authorName} avatarUrl={user?.photoURL} caption={captions.instagram}
                imageUrl={photoUrl} onCopy={() => copyCaption('instagram')} copied={copiedId === 'instagram'} />
            )}
            {platforms.includes('linkedin') && (
              <PreviewLinkedIn name={authorName} avatarUrl={user?.photoURL} caption={captions.linkedin}
                imageUrl={photoUrl} onCopy={() => copyCaption('linkedin')} copied={copiedId === 'linkedin'} />
            )}
          </div>

          <div className="stu-review-side">
            {(['x', 'instagram', 'linkedin'] as const).map((id) => (
              <label className="stu-field" key={id}>
                <span className="stu-label">
                  {id === 'x' ? 'X' : id === 'instagram' ? 'Instagram' : 'LinkedIn'} caption
                  <span className={'stu-count' + (captions[id].length > PLATFORM_LIMITS[id] ? ' over' : '')}>
                    {captions[id].length}/{PLATFORM_LIMITS[id]}
                  </span>
                </span>
                <textarea
                  className="stu-textarea"
                  rows={id === 'x' ? 3 : 5}
                  value={captions[id]}
                  onChange={(e) => setCaptions({ ...captions, [id]: e.target.value })}
                />
              </label>
            ))}

            <aside className="fld-sop">
              <div className="fld-sop-head">
                <span>Before you submit</span>
                <span className="fld-sop-count">
                  {SOP_CHECKLIST_ITEMS.filter((i) => sop[i.id]).length}/{SOP_CHECKLIST_ITEMS.length}
                </span>
              </div>
              <ul className="fld-sop-list">
                {SOP_CHECKLIST_ITEMS.map((item) => (
                  <li key={item.id}>
                    <label className={'fld-sop-item' + (sop[item.id] ? ' done' : '')}>
                      <input type="checkbox" checked={!!sop[item.id]}
                        onChange={() => setSop((p) => ({ ...p, [item.id]: !p[item.id] }))} />
                      <span className="fld-sop-box">{sop[item.id] && <Check size={12} strokeWidth={3} />}</span>
                      {item.label}
                    </label>
                  </li>
                ))}
              </ul>
            </aside>

            <button
              type="button"
              className="stu-primary"
              onClick={submit}
              disabled={saving || !allChecked || !hasAnyCaption}
            >
              {saving ? 'Sending…' : 'Submit for admin approval'}
            </button>
            {!allChecked && <p className="stu-sub">Every check has to be ticked before this can go to an admin.</p>}
          </div>
        </div>
      )}

      {/* ── nav ── */}
      <div className="stu-nav">
        <button type="button" className="stu-ghost" onClick={() => setStepIdx((i) => Math.max(0, i - 1))} disabled={stepIdx === 0}>
          <ArrowLeft size={14} strokeWidth={2.5} /> Back
        </button>
        {stepIdx > 1 && stepIdx < STEPS.length - 1 && (
          <button type="button" className="stu-primary stu-primary--sm" onClick={() => setStepIdx((i) => i + 1)} disabled={!canAdvance}>
            Next <ArrowRight size={14} strokeWidth={2.5} />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Notes an admin left directly on the post graphic — pins with a comment,
 * drawn there instead of typed into `adminNotes` because "the headline
 * overlaps the roofline" is a claim about a specific spot on a specific
 * image, not a sentence about the dispatch in general.
 *
 * Read-only here on purpose: a publisher acknowledges a note (so the admin
 * can see it was seen) but doesn't edit or delete it — that stays the
 * admin's own review surface in the approve desk. Shapes drawn on the
 * graphic (boxes, arrows, circles) aren't re-rendered in this list; the pin
 * comments are the actual communication, and re-drawing marks on a static
 * thumbnail here would need the same rasterised-image machinery the approve
 * desk uses for comparatively little gained — a publisher already has the
 * live graphic open in this same wizard.
 */
function ReviewNotes({ dispatch: d }: { dispatch: Dispatch }) {
  const pins = (d.reviewAnnotations ?? []).filter(isPinAnnotation);
  const counts = pinCount(d.reviewAnnotations ?? []);

  if (pins.length === 0) return null;

  const acknowledge = async (id: string) => {
    await updateDoc(doc(db, 'dispatches', d.id), {
      reviewAnnotations: acknowledgePin(d.reviewAnnotations ?? [], id),
      updatedAt: Date.now(),
    });
  };

  return (
    <div className="stu-reviewnotes">
      <div className="stu-reviewnotes-head">
        <span>Notes from review</span>
        {counts.unread > 0 && <span className="stu-reviewnotes-badge">{counts.unread} new</span>}
      </div>
      <ul>
        {pins.map((p) => (
          <li key={p.id} className={p.acknowledged ? 'is-read' : undefined}>
            <span className="stu-reviewnotes-dot" style={{ background: p.color }} />
            <p>{p.comment}</p>
            <div className="stu-reviewnotes-meta">
              <span>{p.authorName}</span>
              {p.acknowledged ? (
                <span className="stu-reviewnotes-seen">Seen</span>
              ) : (
                <button type="button" onClick={() => acknowledge(p.id)}>Mark as seen</button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
