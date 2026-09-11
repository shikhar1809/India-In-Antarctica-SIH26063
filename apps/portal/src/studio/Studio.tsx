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
 *   Basic   → the story, what the post is for, and how it should sound —
 *             a few taps of options (studio/basics.ts) that give the agent
 *             firm ground instead of guesses
 *   Agent   → research, reasoning and writing, every decision shown
 *   Pick    → three genuinely different takes, rendered, side by side
 *   Refine  → adjust the one they chose with fixed, instant controls
 *   Review  → the public record, in-feed previews, SOP checks, submit
 *
 * Nothing here reaches an audience on its own: submitting sets the status
 * to `drafted`, and an admin still has to approve. That gate is unchanged.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Check, ClipboardList, Download, Paperclip, PenLine, RotateCcw, Sparkles, TriangleAlert, Wand2,
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
  describeRecordForBrief, draftVariants, generateVariants, recordUrl, refineCopy, withLinks, withSourceLink,
} from './copy';
import type { Brief, PostCopy, Variant } from './copy';
import { AgentThinking, type AgentDecisions } from './AgentThinking';
import { TraceView } from './TraceView';
import { toStoredTrace, type AgentTrace } from './trace';
import { researchDirection, type Research } from './insight';
import {
  CREDITS, DATA_STATUSES, GOALS, LANGUAGES, basicsDirection, cleanLinks, photoCredit,
  type BasicAnswers, type Goal,
} from './basics';
import { isRemoved } from '../social/queue';
import { TOKEN_PATTERN } from '../screening/detect';
import { describeRequest } from './requestSummary';
import { Choice, ImagesField, KbQuestion, LinksField, PlatformsField, ReferencePostsField, StoryField } from './BasicFields';
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
import { downloadPng, exportPng } from './export';
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

/** The three options are three looks, not three captions on one look: each
 *  gets its own layout and palette. A layout built on the photograph is only
 *  offered when there is a photograph, and "One number" only when the copy
 *  has a figure to show. */
function variantLook(i: number, hasPhoto: boolean, hasStat: boolean): { templateId: TemplateId; paletteId: string } {
  const layouts: TemplateId[] = hasPhoto
    ? ['photo-led', 'banded', hasStat ? 'stat' : 'statement']
    : [hasStat ? 'stat' : 'statement', 'banded', 'minimal'];
  const palette = PALETTES[i % PALETTES.length];
  return { templateId: layouts[i % layouts.length], paletteId: palette.id };
}

/** A canvas drawn at whatever scale fills its container's width — for the
 *  feed previews, which are narrower than any platform's real size. */
function FitCanvas(props: Omit<Parameters<typeof PostCanvas>[0], 'scale'>) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const spec = PLATFORM_SPECS[props.platform];
  const scale = w ? w / spec.w : 0.25;
  return (
    <div ref={box} className="stu-fitcanvas" style={{ height: Math.round(spec.h * scale) }}>
      <PostCanvas {...props} scale={scale} />
    </div>
  );
}

/** The platforms a finished graphic is rendered for. The story shares the
 *  Instagram caption and is posted by hand. */
const GRAPHIC_PLATFORMS = ['x', 'linkedin', 'instagram'] as const;

/** An admin's request goal, as a Basic-step purpose. */
const REQUEST_GOAL: Record<string, Goal> = {
  Announce: 'announce', Explain: 'explain', Celebrate: 'celebrate', 'Share data': 'inform', Recruit: 'invite',
};

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
  /* An admin's post request carries the admin's own answers to the Basic
   * questions. They are not poured in silently: "Auto-fill from the admin's
   * requirements" puts them in, visibly, and the publisher can then change
   * anything. A field report from the scientist app has no request, and so
   * no such button — the publisher answers everything. */
  const req = d.request?.kind === 'post-request' ? d.request : null;
  const [brief, setBrief] = useState<Brief>(() => ({
    ...DEFAULT_BRIEF,
    topic: req?.instructions ? `${d.notes ?? ''}${LINE_BREAK}${LINE_BREAK}Notes from ${req.requestedByName}: ${req.instructions}` : (d.notes ?? ''),
    basics: { language: 'en', references: [] },
  }));
  const basics: BasicAnswers = brief.basics ?? {};
  const setBasic = <K extends keyof BasicAnswers>(k: K, v: BasicAnswers[K]) =>
    setBrief((b) => ({ ...b, basics: { ...b.basics, [k]: v } }));
  const [platforms, setPlatforms] = useState<PlatformId[]>(['instagram', 'x', 'linkedin']);

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
  const [chose, setChose] = useState<{ audience: boolean; tone: boolean }>({ audience: false, tone: false });
  const { records: archiveRecords } = usePublicArchive();
  /* Sent posts and their measured engagement — what the agent learns from.
   * Readable by publishers and admins; empty (not an error) for anyone else. */
  const { posts: queuePosts } = useSocialQueue();
  /* The agent's full account of this post: sources, reasoning, questions and
   * answers, and the writer's exact instructions. Saved with the submission
   * so the admin reviewing it can see how it was made. */
  const [agentTrace, setAgentTrace] = useState<AgentTrace | null>(null);

  /* The studio fits the window: it takes the height from its own top edge to
   * the bottom of the viewport, and every step lays out across that space in
   * columns instead of growing down the page. Only a column that genuinely
   * overflows scrolls, inside itself. Measured rather than guessed, because
   * what sits above it (the header, the back link, a sent-back note) varies. */
  const rootRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const fit = () => {
      const top = el.getBoundingClientRect().top + window.scrollY;
      let h = Math.max(560, window.innerHeight - top - 12);
      el.style.setProperty('--stu-h', `${h}px`);
      // Whatever still pushes the page past the window (a wrapper's bottom
      // padding, say) comes off the studio's height too.
      const extra = document.documentElement.scrollHeight - window.innerHeight;
      if (extra > 0) {
        h = Math.max(560, h - extra);
        el.style.setProperty('--stu-h', `${h}px`);
      }
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  /* "View requirements": a drawer beside every step, open or closed as the
   * publisher left it — remembered across steps and visits. */
  const [reqOpen, setReqOpen] = useState<boolean>(() => {
    try { return localStorage.getItem('iia-portal:studio-reqs') === 'open'; } catch { return false; }
  });
  const toggleReq = () => setReqOpen((v) => {
    try { localStorage.setItem('iia-portal:studio-reqs', v ? 'closed' : 'open'); } catch { /* not remembered */ }
    return !v;
  });

  /* The three options are drawn at whatever size fits three across the
   * space they actually have — the drawer opening, or a smaller screen,
   * shrinks them rather than letting them overlap or push the page down. */
  const variantsRef = useRef<HTMLDivElement>(null);
  const [variantScale, setVariantScale] = useState(0.26);
  useEffect(() => {
    const el = variantsRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const main = el.parentElement;
      const h = main ? main.clientHeight : 0;
      const byWidth = ((w - 2 * 14) / 3 - 28) / 1080;
      const byHeight = h ? (h - 150) / 1080 : byWidth;
      setVariantScale(Math.max(0.12, Math.min(0.32, byWidth, byHeight)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.parentElement) ro.observe(el.parentElement);
    return () => ro.disconnect();
  }, [stepIdx, reqOpen, variants.length]);

  /* Auto-filling a request about an archive record brings that record's
   * facts and permanent link into the brief — as soon as the archive has
   * loaded — exactly as if the publisher had picked it themselves. */
  const [autofilled, setAutofilled] = useState(false);
  const requestRecordAdopted = useRef(false);
  useEffect(() => {
    if (!autofilled || !req?.recordId || requestRecordAdopted.current || brief.source) return;
    const rec = archiveRecords.find((r) => r.id === req.recordId);
    if (!rec) return;
    requestRecordAdopted.current = true;
    const identifier = rec.metadata?.identifier ?? rec.id;
    linkRecord(describeRecordForBrief(rec), { identifier, title: rec.title, url: recordUrl(identifier) });
  }, [autofilled, archiveRecords, req, brief.source]);

  /* ── the knowledge base: link, and unlink cleanly ──
   * The record's material is appended to "What happened?". Remembered, so
   * removing or changing the record takes its material back out instead of
   * leaving stale facts in the brief. */
  const kbMaterial = useRef<string | null>(null);
  const linkRecord = (material: string, source: NonNullable<Brief['source']>) => {
    const old = kbMaterial.current;
    kbMaterial.current = material;
    setBrief((b) => {
      const base = old ? b.topic.replace(old, '').trim() : b.topic.trim();
      // Appended, not replaced: a publisher's own line is never lost to a click.
      return { ...b, topic: base ? base + LINE_BREAK + LINE_BREAK + material : material, source };
    });
  };
  const unlinkRecord = () => {
    const old = kbMaterial.current;
    kbMaterial.current = null;
    setBrief((b) => ({ ...b, topic: old ? b.topic.replace(old, '').trim() : b.topic, source: undefined }));
  };

  /* ── auto-fill from the admin's requirements ── */
  const beforeFill = useRef<{ brief: Brief; platforms: PlatformId[]; chose: typeof chose } | null>(null);
  const autofill = () => {
    if (!req) return;
    beforeFill.current = { brief, platforms, chose };
    const rb = req.basics ?? {};
    setPlatforms(req.platforms?.length ? req.platforms : platforms);
    setBrief((b) => ({
      ...b,
      audience: req.audience,
      tone: req.tone,
      basics: {
        ...b.basics,
        // A request made before the Basic questions existed still has a goal.
        goal: rb.goal ?? REQUEST_GOAL[req.goal] ?? null,
        kb: rb.kb ?? (req.recordId ? 'about' : null),
        dataStatus: rb.dataStatus ?? null,
        imageSource: rb.imageSource ?? null,
        references: rb.references ?? [],
        links: rb.links ?? [],
        credit: rb.credit ?? null,
        language: rb.language ?? 'en',
      },
    }));
    setChose({ audience: rb.audienceChosen ?? true, tone: rb.toneChosen ?? true });
    requestRecordAdopted.current = false;
    setAutofilled(true);
  };
  const undoAutofill = () => {
    const was = beforeFill.current;
    if (!was) return;
    if (kbMaterial.current && !was.brief.source) kbMaterial.current = null;
    setBrief(was.brief); setPlatforms(was.platforms); setChose(was.chose);
    requestRecordAdopted.current = true;
    setAutofilled(false);
  };

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
  /* One full-size canvas per platform, off screen, so submitting can export
   * the finished graphic — text, photo, palette — exactly as designed. */
  const graphicRefs = {
    x: useRef<HTMLDivElement>(null),
    linkedin: useRef<HTMLDivElement>(null),
    instagram: useRef<HTMLDivElement>(null),
  };
  const [graphicNote, setGraphicNote] = useState<string | null>(null);

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
  const runWriting = async ({ analysis: active, research, decisions, plan, fixes }: {
    analysis: BriefAnalysis; research: Research; decisions: AgentDecisions;
    plan: { hashtags: Record<string, string[]> }; fixes?: string[];
  }): Promise<{ instructions: string; generated: boolean; variants: Variant[]; linked: string | null }> => {
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
    /* A photograph the agent found: used as the post's image, and credited
     * — the licence requires it. Copied into the portal's own storage when
     * the source allows, so the post does not depend on someone else's
     * server staying up. */
    const found = decisions.photo && images.length === 0 ? decisions.photo : null;
    const credit = decisions.photo ? photoCredit(decisions.photo) : null;
    if (found) {
      setImages((prev) => (prev.includes(found.fullUrl) ? prev : [...prev, found.fullUrl]));
      setPhotoIndex(0);
      void mirrorToStorage(found.fullUrl);
    }
    setBrief((b) => ({ ...b, topic: briefForModel.topic, source: briefForModel.source }));

    const instructions = [
      generatorDirection(active),
      basicsDirection(
        // A post linked to a record asks readers to read it — the one call
        // to action outreach needs, so it is no longer asked on Basic.
        { ...basics, cta: briefForModel.source ? 'record' : null },
        {
          observerName: d.authorName, station: clean.station, hashtags: plan.hashtags,
          // generatorDirection already names a record the agent found itself.
          source: briefForModel.source && (!active.archive || basics.kb === 'cites')
            ? { title: briefForModel.source.title, identifier: briefForModel.source.identifier } : null,
          photoCredit: credit,
        },
      ),
      researchDirection(research),
      ...(decisions.dropInstagram ? ['PLATFORMS: the publisher dropped Instagram for this post; its caption may be left empty.'] : []),
      // An admin screened the report: placeholders mark what they removed.
      ...(new RegExp(TOKEN_PATTERN.source).test(briefForModel.topic)
        ? ['REDACTED: bracketed placeholders such as [name withheld] or [medical detail withheld] mark material an admin removed before this report reached you. Never mention them, hint at them, or guess what they replaced — write around them.']
        : []),
      // A second pass after the alignment check: exactly what was missed.
      ...(fixes?.length ? [`CORRECTIONS — the previous drafts missed these requirements. Meet every one this time:${LINE_BREAK}${fixes.map((f) => `- ${f}`).join(LINE_BREAK)}`] : []),
    ].filter(Boolean).join('\n\n');
    const linked = briefForModel.source?.identifier ?? null;

    try {
      const result = await generateVariants(clean, measurements, briefForModel, undefined, instructions);
      const linkedVariants = withLinks(withSourceLink(result.variants, briefForModel.source), cleanLinks(basics.links));
      setVariants(linkedVariants);
      setGenNote(
        result.generated
          ? 'Written by the generator, against everything the agent worked out. Read it before you submit — it can still get details wrong.'
          : result.reason ?? 'Using the offline draft.',
      );
      return { instructions, generated: result.generated, variants: linkedVariants, linked };
    } catch {
      const offline = withLinks(withSourceLink(draftVariants(clean, measurements, briefForModel), briefForModel.source), cleanLinks(basics.links));
      setVariants(offline);
      setGenNote('Using the offline draft.');
      return { instructions, generated: false, variants: offline, linked };
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

  const pick = (v: Variant, i: number) => {
    setPickedId(v.id);
    setCopy(v.copy);
    setCaptions(v.copy.captions);
    // The look they chose comes with the words — it is half of what they picked.
    const look = variantLook(i, !!photoUrl, !!v.copy.stat);
    setTemplateId(look.templateId);
    setPaletteId(look.paletteId);
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
  /** Copies a found photograph into the portal's bucket; keeps the original
   *  address if the source refuses (no CORS) or the file is too large. */
  const mirrorToStorage = async (url: string) => {
    if (!user) return;
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const blob = await res.blob();
      if (!blob.type.startsWith('image/') || blob.size > 10 * 1024 * 1024) return;
      const objRef = ref(storage, `dispatches/${user.uid}/${d.id}/found-${Date.now()}.${blob.type.split('/')[1] || 'jpg'}`);
      await uploadBytesResumable(objRef, blob);
      const stored = await getDownloadURL(objRef);
      setImages((prev) => prev.map((u) => (u === url ? stored : u)));
    } catch { /* keep the original address */ }
  };

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
  const sopRef = useRef<HTMLElement>(null);
  const sopDone = SOP_CHECKLIST_ITEMS.filter((i) => sop[i.id]).length;
  const submitBlocker = photoBlocked
    ? 'Replace the photograph first — the check found something that must not be published.'
    : !hasAnyCaption
      ? 'Write at least one caption first.'
      : !allChecked
        ? `Tick the checklist first (${sopDone}/${SOP_CHECKLIST_ITEMS.length}).`
        : null;

  /** Exports and uploads the finished graphic for each platform the post
   *  goes to. What a platform receives is this image — never the bare photo. */
  const renderGraphics = async (): Promise<Partial<Record<(typeof GRAPHIC_PLATFORMS)[number], string>>> => {
    const out: Partial<Record<(typeof GRAPHIC_PLATFORMS)[number], string>> = {};
    if (!user) return out;
    const wanted = GRAPHIC_PLATFORMS.filter((p) => platforms.includes(p) || (p === 'instagram' && platforms.includes('story')));
    const failed: string[] = [];
    for (const p of wanted) {
      const node = graphicRefs[p].current;
      if (!node) continue;
      try {
        const blob = await exportPng(node, p, { pixelRatio: 1 });
        const objRef = ref(storage, `dispatches/${user.uid}/${d.id}/graphic-${p}-${Date.now()}.png`);
        await uploadBytesResumable(objRef, blob, { contentType: 'image/png' });
        out[p] = await getDownloadURL(objRef);
      } catch {
        failed.push(PLATFORM_SPECS[p].label);
      }
    }
    setGraphicNote(failed.length ? `The ${failed.join(' and ')} graphic could not be saved — the approver will see the photo instead.` : null);
    return out;
  };

  const submit = async () => {
    if (!user || !allChecked || !hasAnyCaption || !copy || photoBlocked) return;
    setSaving(true);
    try {
      const postGraphics = await renderGraphics();
      await updateDoc(doc(db, 'dispatches', d.id), {
        postGraphics,
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
        // A post that was sent back and is coming again is a revision.
        revision: (d.revision ?? 0) + (d.status === 'flagged' ? 1 : 0),
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
  const decidedCount = [
    basics.goal, basics.kb, basics.dataStatus, (images.length || basics.imageSource) ? 'images' : null,
    basics.credit, basics.language, chose.audience || null, chose.tone || null,
  ].filter((x) => x != null).length;
  const pastPosts = queuePosts
    .filter((x) => x.status === 'posted' && !isRemoved(x))
    .sort((x, y) => (y.postedAt ?? 0) - (x.postedAt ?? 0))
    .map((x) => ({ id: x.id, platform: x.platform, platformLabel: PLATFORM_SPECS[x.platform as PlatformId]?.label ?? x.platform, caption: x.caption, url: x.externalUrl ?? undefined, postedAt: x.postedAt }));

  /* The alignment step's verdicts, marked beside each admin requirement in
   * the drawer — so "was this met?" is answered where the requirement is read. */
  const alignChecks = agentTrace?.steps.find((s) => s.id === 'alignment')?.checks ?? [];
  const reqMark = (id: string) => {
    const c = alignChecks.find((x) => x.id === id);
    if (!c) return null;
    const sym = { met: '✓', partial: '◐', missed: '✗', review: '?' }[c.status];
    return <span className={`stu-reqs-chk chk-${c.status}`} title={c.detail} aria-label={`${c.status}: ${c.detail}`}>{sym}</span>;
  };

  const canAdvance =
    stepIdx === STEP_INDEX.brief ? basicsReady
    : stepIdx === STEP_INDEX.agent ? !generating && variants.length > 0
    : stepIdx === STEP_INDEX.pick ? !!pickedId
    : true;

  return (
    <div className="stu stu--fit" ref={rootRef}>
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

      {d.screening && (
        <p className="stu-screened">
          Screened by {d.screening.byName}
          {Object.values(d.screening.redacted).reduce((a, b) => a + b, 0)
            ? ` — ${Object.values(d.screening.redacted).reduce((a, b) => a + b, 0)} passages redacted; the placeholders mark what was removed, and the writer is told never to reconstruct it.`
            : ' — nothing needed redacting.'}
        </p>
      )}

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
        <p className="stu-hint">{step.hint}</p>
        {req && step.id === 'brief' && (
          autofilled ? (
            <span className="stu-autofilled">
              <Check size={13} strokeWidth={3} /> Filled from {req.requestedByName}’s requirements
              <button type="button" className="stu-linkbtn" onClick={undoAutofill}>Undo</button>
            </span>
          ) : (
            <button type="button" className="stu-autofill" onClick={autofill} title={`Fill in the Basic answers ${req.requestedByName} gave when requesting this post`}>
              <Wand2 size={14} strokeWidth={2.25} /> Auto-fill from the admin’s requirements
            </button>
          )
        )}
        <button
          type="button"
          className={'stu-reqbtn' + (reqOpen ? ' is-open' : '') + (req ? ' has-req' : '')}
          onClick={toggleReq}
          aria-expanded={reqOpen}
          aria-controls="stu-reqs"
        >
          <ClipboardList size={14} strokeWidth={2.25} />
          {reqOpen ? 'Hide requirements' : 'View requirements'}
          {req && <span className="stu-reqbtn-dot" aria-label="The admin set requirements for this post" />}
        </button>
      </div>

      <div className={'stu-stagewrap' + (reqOpen ? ' has-reqs' : '')}>
      <div className="stu-stage">

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
          <div className="stu-brief-cols">

          {/* ── 1 · what it is about ── */}
          <div className="stu-brief-col">
          <span className="stu-colhead">What is it about</span>
          <StoryField
            grow
            label="What happened?"
            sub="From the field notes — rewrite it if that reads better."
            value={brief.topic}
            onChange={(v) => setBrief((b) => ({ ...b, topic: v }))}
            placeholder="e.g. We measured ice thickness at twelve stakes across the shelf this week…"
          />
          <Choice label="What kind of post is it?" options={GOALS} value={basics.goal} onChange={(v) => setBasic('goal', v)} />
          <KbQuestion
            kb={basics.kb}
            onKb={(v) => setBasic('kb', v)}
            linked={brief.source ? { identifier: brief.source.identifier, title: brief.source.title } : null}
            onPick={linkRecord}
            onRemove={unlinkRecord}
          />
          <Choice
            label="How firm is the data?"
            sub="An official account never presents field readings as settled."
            options={DATA_STATUSES}
            value={basics.dataStatus}
            onChange={(v) => setBasic('dataStatus', v)}
          />
          </div>

          {/* ── 2 · what the post should have ── */}
          <div className="stu-brief-col">
          <span className="stu-colhead">What do you want the post to have</span>
          <ImagesField
            images={images}
            cover={photoIndex}
            onCover={setPhotoIndex}
            onFile={(f) => void handleFileSelected(f)}
            uploading={uploading}
            uploadPct={uploadPct}
            uploadError={uploadError}
            imageSource={basics.imageSource}
            onImageSource={(v) => setBasic('imageSource', v)}
          />
          <ReferencePostsField references={basics.references ?? []} onChange={(v) => setBasic('references', v)} pastPosts={pastPosts} />
          <LinksField links={basics.links} onChange={(v) => setBasic('links', v)} />
          <Choice label="Who gets credit?" options={CREDITS} value={basics.credit} onChange={(v) => setBasic('credit', v)} />
          </div>

          {/* ── 3 · who it is meant for ── */}
          <div className="stu-brief-col">
          <span className="stu-colhead">Who is it meant for</span>
          <Choice
            label="Audience"
            options={AUDIENCES.map((a) => ({ id: a.id, label: a.label, hint: a.hint }))}
            value={chose.audience ? brief.audience : null}
            onChange={(v) => {
              if (v) setBrief((b) => ({ ...b, audience: v }));
              setChose((c) => ({ ...c, audience: !!v }));
            }}
          />
          <Choice
            label="How should it sound to them?"
            options={TONES.map((t) => ({ id: t.id, label: t.label, hint: t.hint }))}
            value={chose.tone ? brief.tone : null}
            onChange={(v) => {
              if (v) setBrief((b) => ({ ...b, tone: v }));
              setChose((c) => ({ ...c, tone: !!v }));
            }}
          />
          <Choice label="In which language?" options={LANGUAGES} value={basics.language} onChange={(v) => setBasic('language', v)} />
          <PlatformsField
            label="Where will they see it?"
            options={PLATFORM_ORDER.map((p) => ({ id: p, label: PLATFORM_SPECS[p].label, hint: PLATFORM_SPECS[p].note }))}
            value={platforms}
            onChange={setPlatforms}
          />
          </div>
          </div>

          {/* The form's submit: once the basics are in, the agent takes over. */}
          <div className="stu-brief-submit">
            {!basicsReady
              ? <span className="stu-brief-missing">First {basicsMissing.join(' and ')}.</span>
              : <span className="stu-brief-decided">{decidedCount} of 8 decided by you — the agent decides the rest and shows why.</span>}
            <button type="button" className="stu-primary" onClick={startAgent} disabled={!basicsReady}>
              <Sparkles size={15} strokeWidth={2.5} /> Let the agent handle it
            </button>
          </div>
        </div>


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
              basics={{ ...basics, cta: brief.source ? 'record' : null }}
              requirements={req}
              observerName={d.authorName}
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
        <div className="stu-panel stu-pick">
          <div className="stu-pick-side">
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
          </div>
          <div className="stu-pick-main">
          <div className="stu-variants" ref={variantsRef}>
            {variants.map((v, i) => {
              const look = variantLook(i, !!photoUrl, !!v.copy.stat);
              return (
              <button key={v.id} type="button" className="stu-variant" onClick={() => pick(v, i)}>
                <PostCanvas
                  platform="instagram"
                  template={templateById(look.templateId)}
                  palette={paletteById(look.paletteId)}
                  copy={v.copy}
                  photoUrl={photoUrl}
                  scale={variantScale}
                />
                <span className="stu-variant-angle">{v.angle}</span>
                <span className="stu-variant-look">{templateById(look.templateId).label} · {paletteById(look.paletteId).label}</span>
                <span className="stu-variant-pick">Choose this</span>
              </button>
              );
            })}
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

            <div className="stu-ctrl stu-ctrl--words">
              <span className="stu-label">Words on the graphic</span>
              <span className="stu-sub">Headline</span>
              <textarea
                className="stu-textarea stu-words-head"
                rows={2}
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
              <span className="stu-sub">Supporting line</span>
              <textarea
                className="stu-textarea stu-words-body"
                rows={6}
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
        <div className="stu-reviewgrid">
        <section className="stu-reviewcol">
        <h3 className="stu-sectionhead">Public page <span>— the permanent record</span></h3>
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
        </section>

        {copy && (
        <section className="stu-reviewcol stu-reviewcol--post">
        <h3 className="stu-sectionhead">The post <span>— in each feed, and the checks before an admin sees it</span></h3>
        <div className="stu-panel stu-review">
          {/* Off screen, full size: what submitting exports and uploads. */}
          <div className="stu-export-stage" aria-hidden="true">
            {GRAPHIC_PLATFORMS.map((p) => (
              <PostCanvas key={p} platform={p} template={template} palette={palette} copy={copy} photoUrl={photoUrl} exportRef={graphicRefs[p]} />
            ))}
          </div>
          {graphicNote && <p className="stu-error">{graphicNote}</p>}
          <div className="stu-review-feeds">
            {platforms.includes('x') && (
              <PreviewX name={authorName} avatarUrl={user?.photoURL} caption={captions.x}
                imageUrl={photoUrl} onCopy={() => copyCaption('x')} copied={copiedId === 'x'}
                media={<FitCanvas platform="x" template={template} palette={palette} copy={copy} photoUrl={photoUrl} />} />
            )}
            {platforms.includes('instagram') && (
              <PreviewInstagram name={authorName} avatarUrl={user?.photoURL} caption={captions.instagram}
                imageUrl={photoUrl} onCopy={() => copyCaption('instagram')} copied={copiedId === 'instagram'}
                media={<FitCanvas platform="instagram" template={template} palette={palette} copy={copy} photoUrl={photoUrl} />} />
            )}
            {platforms.includes('linkedin') && (
              <PreviewLinkedIn name={authorName} avatarUrl={user?.photoURL} caption={captions.linkedin}
                imageUrl={photoUrl} onCopy={() => copyCaption('linkedin')} copied={copiedId === 'linkedin'}
                media={<FitCanvas platform="linkedin" template={template} palette={palette} copy={copy} photoUrl={photoUrl} />} />
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

            <aside className="fld-sop" ref={sopRef}>
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
        </section>
        )}
        </div>
      )}

      </div>
      {/* What the admin asked for — a drawer beside every step. */}
      {reqOpen && (
        <aside className="stu-reqs" id="stu-reqs" aria-label="Requirements as per admin">
          <h4 className="stu-reqs-title">Requirements as per admin</h4>
          {req ? (
            <>
              <p className="stu-reqs-from">Requested by <strong>{req.requestedByName}</strong></p>
              <dl className="stu-reqs-list">
                {describeRequest(req, { brief: d.notes, priority: d.priority, imageCount: req.basics ? d.imageUrls?.length : 0 }).map((r) => (
                  <div key={r.id}>
                    <dt>{r.label} {reqMark(r.id)}</dt>
                    <dd className={r.id === 'priority' ? `stu-reqs-pri pri-${d.priority}` : undefined}>{r.value}</dd>
                  </div>
                ))}
              </dl>
              <p className="stu-reqs-foot">
                {alignChecks.length
                  ? 'The agent checked the drafts against each of these: ✓ met · ◐ partly · ✗ missed · ? for a person to judge. Hover a mark for the detail.'
                  : autofilled
                    ? 'These are on your Basic step now. After writing, the agent checks the drafts against each of them.'
                    : 'Use “Auto-fill from the admin’s requirements” on Basic to start from these. After writing, the agent checks the drafts against each.'}
              </p>
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
      )}
      </div>

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
        {/* The last step's action, where every other step's "Next" is — not
            at the foot of a scrolling column. If something is still missing it
            says what, and a click takes the publisher to the checklist. */}
        {step.id === 'review' && (
          <div className="stu-submitbar">
            {submitBlocker && <span className="stu-submit-why">{submitBlocker}</span>}
            <button
              type="button"
              className="stu-primary stu-primary--sm"
              onClick={() => (submitBlocker ? sopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }) : void submit())}
              disabled={saving}
              aria-disabled={!!submitBlocker}
              data-blocked={submitBlocker ? 'true' : undefined}
            >
              <Check size={14} strokeWidth={2.5} /> {saving ? 'Sending…' : 'Submit for admin approval'}
            </button>
          </div>
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
