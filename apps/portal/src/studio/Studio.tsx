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

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Check, Download, Paperclip, RotateCcw,
  PenLine, Sparkles, TriangleAlert, Wand2,
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
  describeRecordForBrief, draftVariants, generateVariants, recordUrl, refineCopy, withSourceLink,
} from './copy';
import type { Brief, PostCopy, Variant } from './copy';
import { KnowledgeBase } from './KnowledgeBase';
import { AgentThinking, type AgentDecisions } from './AgentThinking';
import { TraceView } from './TraceView';
import { toStoredTrace, type AgentTrace } from './trace';
import { researchDirection, type Research } from './insight';
import { useSocialQueue } from '../hooks/useSocialQueue';
import { MarkupPanel } from './MarkupPanel';
import type { Revision } from './MarkupPanel';
import { AbTest, PhotoCheck, alternativeCaption } from './ReviewChecks';
import type { ModerationResult } from './ReviewChecks';
import { analyseBrief, generatorDirection, CONTENT_TYPES } from './agent';
import type { BriefAnalysis, ContentType } from './agent';
import { searchReferences } from './references';
import type { StyleReference } from './references';
import { usePublicArchive } from '../hooks/usePublicArchive';
import { PostCanvas } from './PostCanvas';
import { downloadPng } from './export';
import { PreviewX, PreviewInstagram, PreviewLinkedIn } from './PlatformPreview';
import './Studio.css';

const EMPTY_SOP: Record<string, boolean> = Object.fromEntries(SOP_CHECKLIST_ITEMS.map((i) => [i.id, false]));

const STEPS = [
  { id: 'brief',  label: 'Basic',      hint: 'The basics: what happened, who it is for, where it goes. Then hand it to the agent.' },
  { id: 'agent',  label: 'Agent',      hint: 'The agent researches, reasons and writes — every decision shown with its sources, and it stops to ask you when it is unsure.' },
  { id: 'pick',   label: 'Pick',       hint: 'Three different takes on the same report. Choose the one closest to what you want.' },
  { id: 'refine', label: 'Refine',     hint: 'Adjust the layout, colour and words. Every control here is instant — nothing regenerates behind your back.' },
  { id: 'review', label: 'Review',     hint: 'The public page, how the post looks in each feed, and the checks that gate submission — then over to an admin.' },
] as const;

const STEP_INDEX = Object.fromEntries(STEPS.map((s, i) => [s.id, i])) as Record<(typeof STEPS)[number]['id'], number>;

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
  /* An admin's post request arrives with its audience, tone and platforms
   * decided. They are set as choices, so the agent keeps them rather than
   * re-inferring — and the admin's notes are part of the brief. */
  const req = d.request?.kind === 'post-request' ? d.request : null;
  const [brief, setBrief] = useState<Brief>(() => ({
    ...DEFAULT_BRIEF,
    topic: req?.instructions ? `${d.notes ?? ''}${LINE_BREAK}${LINE_BREAK}Notes from ${req.requestedByName}: ${req.instructions}` : (d.notes ?? ''),
    ...(req ? { audience: req.audience, tone: req.tone } : {}),
  }));
  const [platforms, setPlatforms] = useState<PlatformId[]>(req?.platforms?.length ? req.platforms : ['instagram', 'x', 'linkedin']);

  /* ── generation ── */
  const [variants, setVariants] = useState<Variant[]>([]);
  const [generating, setGenerating] = useState(false);
  const [genNote, setGenNote] = useState<string | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);

  /* ── the agent ──
   * `analysis` is what the agent worked out; it is computed once when the
   * publisher starts a run and then held, so the steps they watched and the
   * brief the model was given cannot drift apart. `chose` tracks which
   * fields the publisher set deliberately — the agent infers the rest and
   * must never quietly overwrite a real choice. */
  const [analysis, setAnalysis] = useState<BriefAnalysis | null>(null);
  const [markingUp, setMarkingUp] = useState(false);
  const [photoLoadError, setPhotoLoadError] = useState<string | null>(null);

  /* The automated photograph check. Held here rather than inside the check
   * component so its verdict can gate submission and tick the SOP box — a
   * result that only the panel knows about could not do either. */
  const [moderation, setModeration] = useState<ModerationResult | null>(null);
  const [refs, setRefs] = useState<StyleReference[]>([]);
  const [chose, setChose] = useState<{ audience: boolean; tone: boolean }>({ audience: !!req, tone: !!req });
  const { records: archiveRecords } = usePublicArchive();
  /* Sent posts and their measured engagement — what the agent learns from.
   * Readable by publishers and admins; empty (not an error) for anyone else. */
  const { posts: queuePosts } = useSocialQueue();
  /* The agent's full account of this post: sources, reasoning, questions and
   * answers, and the writer's exact instructions. Saved with the submission
   * so the admin reviewing it can see how it was made. */
  const [agentTrace, setAgentTrace] = useState<AgentTrace | null>(null);

  /* A request about an archive record brings that record's facts and its
   * permanent link into the brief — once, as soon as the archive has loaded
   * — exactly as if the publisher had picked it from the knowledge base. */
  const requestRecordAdopted = useRef(false);
  useEffect(() => {
    if (!req?.recordId || requestRecordAdopted.current || brief.source) return;
    const rec = archiveRecords.find((r) => r.id === req.recordId);
    if (!rec) return;
    requestRecordAdopted.current = true;
    const identifier = rec.metadata?.identifier ?? rec.id;
    setBrief((b) => ({
      ...b,
      topic: b.topic.trim() + LINE_BREAK + LINE_BREAK + describeRecordForBrief(rec),
      source: { identifier, title: rec.title, url: recordUrl(identifier) },
    }));
  }, [archiveRecords, req, brief.source]);

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

  /**
   * Starts an agent run.
   *
   * The analysis happens here, synchronously, before any step is shown: the
   * steps are a presentation of a result that already exists, so what the
   * publisher reads is what the generator is about to be told. AgentThinking
   * then paces it out and calls back when the writing is done.
   */
  const startAgent = () => {
    const next = analyseBrief({
      brief,
      platforms,
      hasImage: images.length > 0,
      station: clean.station,
      archiveRecords,
      audienceChosen: chose.audience,
      toneChosen: chose.tone,
    });

    /* An archive record the agent found on its own is adopted into the
     * brief, exactly as if the publisher had picked it from the knowledge
     * base — the step that found it says so, and the link it carries is the
     * record's real address rather than anything the model produced.
     *
     * Only a certain match (identifier or title) is adopted here. A keyword
     * match is put to the publisher as a question during the run, and
     * adopted in runWriting only if they say yes. */
    if (next.archive && !brief.source && next.archive.how !== 'keyword') {
      setBrief((b) => ({
        ...b,
        topic: b.topic.trim() + LINE_BREAK + LINE_BREAK + next.archive!.material,
        source: next.archive!.source,
      }));
    }

    setAnalysis(next);
    setAgentTrace(null);
    setGenerating(true);
    setGenNote(null);
    setStepIdx(STEP_INDEX.agent);
  };

  /** The writing step of the run. Kept separate from startAgent so
   *  AgentThinking can place it last, after the publisher has seen every
   *  inference it is about to be built on. */
  const runWriting = async ({ analysis: active, research, decisions }: {
    analysis: BriefAnalysis; research: Research; decisions: AgentDecisions;
  }): Promise<{ instructions: string; generated: boolean }> => {
    let briefForModel: Brief = { ...brief, audience: active.audience, tone: active.tone };

    // A keyword-matched record the publisher confirmed when asked.
    if (decisions.useArchive && active.archive && active.archive.how === 'keyword' && !briefForModel.source) {
      briefForModel = {
        ...briefForModel,
        topic: briefForModel.topic.trim() + LINE_BREAK + LINE_BREAK + active.archive.material,
        source: active.archive.source,
      };
    }
    // The one fact the publisher supplied when the brief was too thin.
    if (decisions.extraDetail) {
      briefForModel = { ...briefForModel, topic: `${briefForModel.topic.trim()}${LINE_BREAK}${LINE_BREAK}${decisions.extraDetail}` };
    }
    if (decisions.dropInstagram) setPlatforms((ps) => ps.filter((x) => x !== 'instagram'));
    setBrief((b) => ({ ...b, topic: briefForModel.topic, source: briefForModel.source }));

    const instructions = [
      generatorDirection(active),
      researchDirection(research),
      ...(decisions.dropInstagram ? ['PLATFORMS: the publisher dropped Instagram for this post; its caption may be left empty.'] : []),
    ].filter(Boolean).join('\n\n');

    try {
      const result = await generateVariants(clean, measurements, briefForModel, undefined, instructions);
      setVariants(withSourceLink(result.variants, briefForModel.source));
      setGenNote(
        result.generated
          ? 'Written by the generator, against everything the agent worked out. Read it before you submit — it can still get details wrong.'
          : result.reason ?? 'Using the offline draft.',
      );
      return { instructions, generated: result.generated };
    } catch {
      setVariants(withSourceLink(draftVariants(clean, measurements, briefForModel), briefForModel.source));
      setGenNote('Using the offline draft.');
      return { instructions, generated: false };
    }
  };

  /** The agent finished: adopt what it inferred and show the three options. */
  const agentDone = ({ refs: found, trace, analysis: final }: {
    refs: StyleReference[]; trace: AgentTrace; analysis: BriefAnalysis; decisions: AgentDecisions;
  }) => {
    setRefs(found);
    setAgentTrace(trace);
    // The analysis as the publisher's answers left it — e.g. a content type
    // they picked when the agent was unsure.
    setAnalysis(final);
    setBrief((b) => ({ ...b, audience: final.audience, tone: final.tone }));
    setGenerating(false);
    setStepIdx(STEP_INDEX.pick);
  };

  const pick = (v: Variant) => {
    setPickedId(v.id);
    setCopy(v.copy);
    setCaptions(v.copy.captions);
    setStepIdx(STEP_INDEX.refine);
  };

  const applyCopyRefinement = (op: Parameters<typeof refineCopy>[1]) => {
    if (!copy) return;
    setCopy(refineCopy(copy, op));
  };

  const nextPalette = () => {
    const i = PALETTES.findIndex((p) => p.id === paletteId);
    setPaletteId(PALETTES[(i + 1) % PALETTES.length].id);
  };

  /**
   * Puts a photograph on the post.
   *
   * The error handling here is the point. This used to return silently when
   * there was no signed-in user — the publisher clicked "Add a photo",
   * chose a file, and absolutely nothing happened — and every genuine
   * failure afterwards reported "check your connection", which sends
   * someone hunting a network problem when Storage actually refused them on
   * a rule. Both were the same mistake: swallowing what went wrong.
   */
  const handleFileSelected = async (file: File | undefined) => {
    if (!file) return;
    if (!user) {
      setUploadError('You are not signed in, so there is nowhere to upload to. Sign in and try again.');
      return;
    }
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
      /* Two separate updates, not a setPhotoIndex() buried inside the
       * setImages updater. Updaters have to be pure — React calls them
       * twice under StrictMode to prove it — and the new photograph's index
       * is just the old length, which is known here without reaching into
       * the updater to get it. */
      setPhotoIndex(images.length);
      setImages((prev) => [...prev, url]);
      setPhotoLoadError(null);
    } catch (err) {
      /* Firebase Storage errors carry a code that says exactly what
       * happened; a publisher can act on "you do not have permission" and
       * cannot act on "something went wrong". */
      const code = (err as { code?: string })?.code ?? '';
      setUploadError(
        code === 'storage/unauthorized'
          ? 'Storage refused the upload. Your account may not have publisher rights on this dispatch.'
          : code === 'storage/canceled'
            ? 'Upload cancelled.'
            : code === 'storage/quota-exceeded'
              ? 'The storage bucket is full — an admin needs to look at this.'
              : code === 'storage/unauthenticated'
                ? 'Your session expired. Sign in again and retry.'
                : code === 'storage/retry-limit-exceeded'
                  ? 'The upload kept timing out — check your connection and try again.'
                  : `Upload failed${code ? ` (${code})` : ''}. Try again, or use a different image.`,
      );
      // The code alone is rarely enough to debug a Storage rule; the full
      // error is worth having in the console when someone reports this.
      console.error('Photo upload failed', err);
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

  /* The one automated verdict that can refuse a submission outright. A
   * caution is advice and a human may proceed past it; a blocker is the
   * check saying this photograph must not be published, and the button is
   * disabled until the photograph changes. */
  const photoBlocked = !!moderation?.concerns.some((c) => c.severity === 'blocker');

  const submit = async () => {
    if (!user || !allChecked || !hasAnyCaption || !copy || photoBlocked) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'dispatches', d.id), {
        caption: captions.x || captions.linkedin || captions.instagram,
        platformCaptions: captions,
        imageUrls: images,
        coverImageIndex: photoIndex,
        sopChecklist: sop,
        /* The automated verdict travels with the submission: an approver
         * should see that the photograph was checked and what was found,
         * not have to take the ticked box on trust. Null when the check was
         * never run. */
        photoCheck: moderation,
        /* How the agent made it — sources, reasoning, questions asked and
         * answered, and the writer's instructions — for the admin who
         * approves it. Null when the post was written without the agent. */
        agentTrace: agentTrace ? toStoredTrace(agentTrace) : null,
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

  /* The least the agent needs before it may start: a real sentence about
   * what happened, and somewhere to post it. Everything else it can infer —
   * and asks about when it can't. */
  const topicWords = brief.topic.trim().split(/\s+/).filter(Boolean).length;
  const basicsMissing = [
    ...(topicWords < 5 ? ['write at least a sentence about what happened'] : []),
    ...(platforms.length === 0 ? ['pick at least one platform'] : []),
  ];
  const basicsReady = basicsMissing.length === 0;

  const canAdvance =
    stepIdx === STEP_INDEX.brief ? basicsReady
    : stepIdx === STEP_INDEX.agent ? !generating && variants.length > 0
    : stepIdx === STEP_INDEX.pick ? !!pickedId
    : true;

  return (
    <div className="stu">
      {/* One file input for the whole wizard. It used to live inside the
          Refine panel, which meant the ref was null on every other step —
          so the brief's own upload button would have clicked nothing. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => { handleFileSelected(e.target.files?.[0]); e.target.value = ''; }}
      />

      {d.status === 'flagged' && d.adminNotes && (
        <div className="fld-flagnote"><span>Sent back with a note</span><p>{d.adminNotes}</p></div>
      )}

      <ReviewNotes dispatch={d} />

      {/* ── stepper, with the agent as one of its steps ── */}
      <div className="stu-stepbar">
        <ol className="stu-steps">
          {STEPS.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                className={'stu-step' + (i === stepIdx ? ' is-active' : '') + (i < stepIdx ? ' is-done' : '')}
                onClick={() => i < stepIdx && !generating && setStepIdx(i)}
                disabled={i > stepIdx || generating}
              >
                <span className="stu-step-num">{i < stepIdx ? <Check size={11} strokeWidth={3} /> : i + 1}</span>
                {s.label}
              </button>
            </li>
          ))}
        </ol>
      </div>
      <p className="stu-hint">{step.hint}</p>

      {warnings.length > 0 && stepIdx === 0 && !req && (
        <div className="fld-datawarn">
          <span><TriangleAlert size={12} strokeWidth={2.5} /> Check this data before publishing</span>
          <ul>{warnings.map((w, i) => <li key={i}>{w.message}</li>)}</ul>
        </div>
      )}

      {/* ══════════════════════════════════════════════════ 1 · BRIEF ══ */}
      {step.id === 'brief' && (
        <div className="stu-briefwrap">
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
                  onClick={() => {
                    setBrief((b) => ({ ...b, audience: a.id }));
                    setChose((c) => ({ ...c, audience: true }));
                  }}
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
                  onClick={() => {
                    setBrief((b) => ({ ...b, tone: t.id }));
                    setChose((c) => ({ ...c, tone: true }));
                  }}
                  title={t.hint}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Photographs belong on the brief, not only three steps later in
              Refine. The agent reads what each platform needs while it is
              analysing this form — it will tell the publisher that Instagram
              cannot be posted without one — and being told that with no way
              to act on it until after a full generation run is the wrong
              order to do things in. */}
          <div className="stu-field">
            <span className="stu-label">Photographs</span>
            <span className="stu-sub">
              Real station photography always beats a generated image for a government record.
              Instagram needs at least one; the others read better with one.
            </span>
            {images.length > 0 && (
              <div className="stu-photos">
                {images.map((url, i) => (
                  <button
                    key={url}
                    type="button"
                    className={'stu-photo' + (photoIndex === i ? ' is-on' : '')}
                    onClick={() => setPhotoIndex(i)}
                    title={photoIndex === i ? 'Cover photo' : 'Use as the cover photo'}
                  >
                    <img src={url} alt="" />
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              className="stu-ghost"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <Paperclip size={13} strokeWidth={2.5} />
              {uploading ? `Uploading ${uploadPct}%` : images.length ? 'Add another' : 'Add a photo'}
            </button>
            {uploadError && <p className="stu-error">{uploadError}</p>}
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

          {/* The form's submit: once the basics are in, the agent takes over. */}
          <div className="stu-brief-submit">
            {!basicsReady && <span className="stu-brief-missing">First {basicsMissing.join(' and ')}.</span>}
            <button type="button" className="stu-primary" onClick={startAgent} disabled={!basicsReady}>
              <Sparkles size={15} strokeWidth={2.5} /> Let the agent handle it
            </button>
          </div>
        </div>

        {/* What the admin asked for, beside the form the publisher fills in. */}
        <aside className="stu-reqs" aria-label="Requirements as per admin">
          <h4 className="stu-reqs-title">Requirements as per admin</h4>
          {req ? (
            <>
              <p className="stu-reqs-from">Requested by <strong>{req.requestedByName}</strong></p>
              <dl className="stu-reqs-list">
                <div><dt>Brief</dt><dd>{d.notes}</dd></div>
                <div><dt>Goal</dt><dd>{req.goal}</dd></div>
                <div><dt>Archive record</dt><dd>{req.recordIdentifier ? `${req.recordIdentifier} — ${req.recordTitle}` : 'None — a new topic'}</dd></div>
                <div><dt>Platforms</dt><dd>{req.platforms.map((p) => PLATFORM_SPECS[p]?.label ?? p).join(', ')}</dd></div>
                <div><dt>Audience</dt><dd>{AUDIENCES.find((a) => a.id === req.audience)?.label ?? req.audience}</dd></div>
                <div><dt>Tone</dt><dd>{TONES.find((t) => t.id === req.tone)?.label ?? req.tone}</dd></div>
                <div><dt>Needed by</dt><dd>{req.deadline ? new Date(req.deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'No deadline'}</dd></div>
                <div><dt>Priority</dt><dd className={`stu-reqs-pri pri-${d.priority}`}>{d.priority}</dd></div>
                {req.instructions && <div><dt>Notes</dt><dd>{req.instructions}</dd></div>}
              </dl>
              <p className="stu-reqs-foot">Platforms, audience and tone above are pre-set from this request; the agent keeps them.</p>
            </>
          ) : (
            <>
              <p className="stu-reqs-none">No admin requirements for this post.</p>
              <p className="stu-reqs-foot">
                It comes from a field report — {d.activity}{d.station ? ` at ${d.station}` : ''}, filed by {d.authorName}
                {d.observedAt ? ` on ${new Date(d.observedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}.
                Write it as you judge best; the admin reviews it before it goes out.
              </p>
            </>
          )}
        </aside>

        </div>
      )}

      {/* ══════════════════════════════════════════════════ 2 · AGENT ══ */}
      {step.id === 'agent' && (
        <div className="stu-agentstep">
          {generating && analysis ? (
            <AgentThinking
              analysis={analysis}
              topic={brief.topic}
              station={clean.station}
              activity={clean.activity}
              hasImage={images.length > 0}
              posts={queuePosts}
              archiveCount={archiveRecords.length}
              runReferences={(queries, onPartial) => searchReferences(queries, onPartial)}
              runWriting={runWriting}
              onComplete={agentDone}
              onCancel={() => { setGenerating(false); setAnalysis(null); setStepIdx(STEP_INDEX.brief); }}
            />
          ) : agentTrace ? (
            <>
              <TraceView trace={agentTrace} />
              <div className="stu-agentstep-actions">
                <button type="button" className="stu-ghost" onClick={startAgent}>
                  <RotateCcw size={13} strokeWidth={2.5} /> Run the agent again
                </button>
              </div>
            </>
          ) : (
            <div className="stu-panel">
              <p className="stu-sub">The agent hasn’t run yet. Start it from the brief.</p>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════ 3 · PICK ══ */}
      {step.id === 'pick' && (
        <div className="stu-panel">
          {genNote && <p className="stu-gennote">{genNote}</p>}

          {/* What these three were written against. Shown here rather than
              only during the run so it is still checkable once the steps
              have scrolled away — and the content type is correctable
              without starting over. */}
          {analysis && (
            <div className="stu-basis">
              <div className="stu-basis-row">
                <span className="stu-label">Written as</span>
                <div className="stu-chips">
                  {analysis.classification.ranked.slice(0, 3).map((r) => (
                    <button
                      key={r.type}
                      type="button"
                      className={'stu-chip' + (analysis.classification.type.id === r.type ? ' is-on' : '')}
                      onClick={() => setAnalysis({
                        ...analysis,
                        classification: { ...analysis.classification, type: CONTENT_TYPES[r.type as ContentType] },
                      })}
                      title={CONTENT_TYPES[r.type as ContentType].blurb}
                    >
                      {CONTENT_TYPES[r.type as ContentType].label}
                    </button>
                  ))}
                </div>
                <span className="stu-basis-meta">
                  for {analysis.audience} · {analysis.tone}
                </span>
              </div>
              {refs.length > 0 && (
                <div className="stu-basis-refs">
                  <span className="stu-label">Visual references found</span>
                  <div className="stu-refstrip">
                    {refs.slice(0, 10).map((r) => (
                      <a key={r.id} href={r.pageUrl} target="_blank" rel="noreferrer"
                         title={`${r.title} — ${r.license} · ${r.attribution}`}>
                        <img src={r.thumbUrl ?? ''} alt="" loading="lazy" />
                      </a>
                    ))}
                  </div>
                  <span className="stu-sub">
                    Reference only — check the licence on the source page before reusing any of these.
                  </span>
                </div>
              )}
            </div>
          )}
          {agentTrace && (
            <details className="stu-trace">
              <summary>How the agent got here — sources, reasoning and decisions</summary>
              <TraceView trace={agentTrace} />
            </details>
          )}
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
          <button
            type="button"
            className="stu-ghost"
            onClick={startAgent}
            disabled={generating}
          >
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
              onPhotoError={setPhotoLoadError}
              scale={canvasPlatform === 'story' ? 0.2 : canvasPlatform === 'instagram' ? 0.34 : 0.26}
              exportRef={canvasRef}
            />
            {photoLoadError && (
              <p className="stu-error">
                That photograph uploaded but the browser would not display it. It may have been
                removed from storage, or be in a format the browser cannot render.
              </p>
            )}
            <span className="stu-canvas-meta">
              {PLATFORM_SPECS[canvasPlatform].w} × {PLATFORM_SPECS[canvasPlatform].h} · {PLATFORM_SPECS[canvasPlatform].note}
            </span>
            <div className="stu-canvas-actions">
              <button type="button" className="stu-ghost" onClick={exportGraphic} disabled={exporting}>
                <Download size={13} strokeWidth={2.5} /> {exporting ? 'Building PNG…' : 'Download PNG'}
              </button>
              {/* The same annotator the approvals desk uses, pointed at the
                  publisher's own graphic — and wired so the pins come back
                  as an actual revision rather than as notes to retype. */}
              <button type="button" className="stu-ghost" onClick={() => setMarkingUp((m) => !m)}>
                <PenLine size={13} strokeWidth={2.5} /> {markingUp ? 'Close markup' : 'Mark it up'}
              </button>
            </div>

            {markingUp && (
              <MarkupPanel
                canvasRef={canvasRef}
                platform={canvasPlatform}
                copy={copy}
                subject={brief.topic}
                authorName={authorName}
                onClose={() => setMarkingUp(false)}
                onApply={(rev: Revision) => {
                  setCopy({ ...copy, headline: rev.headline, standfirst: rev.standfirst });
                  setCaptions(rev.captions);
                  setMarkingUp(false);
                }}
              />
            )}
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

      {/* ═══════════════════════════════════ 5 · REVIEW (public page first) ══ */}
      {step.id === 'review' && (
        <h3 className="stu-sectionhead">Public page <span>— the plain-language version for the Knowledge Repository, the permanent record</span></h3>
      )}
      {step.id === 'review' && (
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

      {step.id === 'review' && copy && (
        <h3 className="stu-sectionhead">The post <span>— how it looks in each feed, and the checks before it goes to an admin</span></h3>
      )}
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

            {/* Two real checks before the honour-system checklist below.
                The A/B compares the chosen caption against one the
                publisher rejected — two options that both actually exist. */}
            <section className="stu-checks">
              <h4 className="stu-checks-title">Compare and check</h4>

              {(['x', 'instagram', 'linkedin'] as const)
                .filter((id) => platforms.includes(id))
                .map((id) => (
                  <details key={id} className="stu-check">
                    <summary>
                      A/B test the {id === 'x' ? 'X' : id === 'instagram' ? 'Instagram' : 'LinkedIn'} caption
                    </summary>
                    <AbTest
                      platform={id}
                      chosen={captions[id]}
                      alternative={alternativeCaption(variants, pickedId, id)}
                      audience={analysis?.audience ?? brief.audience}
                      subject={brief.topic}
                      onUseCaption={(c) => setCaptions({ ...captions, [id]: c })}
                      onAddHashtag={(tag) =>
                        setCaptions((prev) => ({
                          ...prev,
                          [id]: prev[id].includes(tag) ? prev[id] : `${prev[id].trimEnd()} ${tag}`.trim(),
                        }))
                      }
                    />
                  </details>
                ))}

              <details className="stu-check" open={!!moderation && !moderation.safe}>
                <summary>Check the photograph before it goes out</summary>
                <PhotoCheck
                  imageUrl={photoUrl}
                  result={moderation}
                  onResult={(r) => {
                    setModeration(r);
                    /* A clean verdict ticks the photograph box, because the
                     * box is now backed by something. It stays a checkbox the
                     * publisher can untick — the model advises, it does not
                     * approve. */
                    if (r?.safe) setSop((prev) => ({ ...prev, photo: true }));
                  }}
                />
              </details>
            </section>

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
              disabled={saving || !allChecked || !hasAnyCaption || photoBlocked}
            >
              {saving ? 'Sending…' : 'Submit for admin approval'}
            </button>
            {photoBlocked && (
              <p className="stu-error">
                The photograph check found something that must not be published. Replace the
                photograph before submitting.
              </p>
            )}
            {!allChecked && <p className="stu-sub">Every check has to be ticked before this can go to an admin.</p>}
          </div>
        </div>
      )}

      {/* ── nav ── */}
      <div className="stu-nav">
        <button type="button" className="stu-ghost" onClick={() => setStepIdx((i) => Math.max(0, i - 1))} disabled={stepIdx === 0 || generating}>
          <ArrowLeft size={14} strokeWidth={2.5} /> Back
        </button>
        {stepIdx === STEP_INDEX.agent && !generating && variants.length > 0 && (
          <button type="button" className="stu-primary stu-primary--sm" onClick={() => setStepIdx(STEP_INDEX.pick)}>
            See the three options <ArrowRight size={14} strokeWidth={2.5} />
          </button>
        )}
        {stepIdx > STEP_INDEX.pick && stepIdx < STEPS.length - 1 && (
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
