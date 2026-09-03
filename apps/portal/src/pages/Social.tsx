import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import {
  ArrowLeft, ArrowRight, Bookmark, Camera, Check, ChevronDown, ChevronLeft, ChevronRight, Copy, FileSpreadsheet,
  Heart, Maximize2, MessageCircle, Minimize2, Paperclip, Repeat2, RotateCcw, Send, Share, Sparkles, TriangleAlert,
} from 'lucide-react';
import { addDoc, collection, doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useDispatches } from '../hooks/useDispatches';
import { useRole, assignRole } from '../hooks/useRole';
import type { Role } from '../hooks/useRole';
import type { Dispatch, DispatchStatus, DispatchPriority, WeatherObs, PlatformCaptions, StoredPublicSummary } from '../types';
import { MEASUREMENT_SCHEMA, PLATFORM_LIMITS, SOP_CHECKLIST_ITEMS, HASHTAG_BY_STATION, HASHTAG_BY_ACTIVITY } from '../types';
import { normaliseDispatch } from '../repository/normalise';
import { draftPublicSummary } from '../repository/summarise';
import { canPublishDispatch, mintIdentifier, publishRecord, unpublishRecord, toRepositoryRecord } from '../repository/publish';
import './Social.css';

const STATUS_LABEL: Record<DispatchStatus, string> = {
  raw: 'Awaiting draft',
  drafted: 'Awaiting approval',
  flagged: 'Sent back — needs revision',
  approved: 'Live'
};

const PRIORITY_LABEL: Record<DispatchPriority, string> = {
  routine: 'Routine',
  notable: 'Notable',
  urgent: 'Urgent'
};

const PLATFORMS = [
  { id: 'x',        label: 'X',        share: (t: string, u: string) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(t)}&url=${encodeURIComponent(u)}` },
  { id: 'linkedin', label: 'LinkedIn', share: (_: string, u: string) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(u)}` },
  { id: 'whatsapp', label: 'WhatsApp', share: (t: string, u: string) => `https://wa.me/?text=${encodeURIComponent(`${t} ${u}`)}` },
];

const PORTAL_URL = 'https://iia-portal.web.app';

// Instagram has no share-intent URL scheme at all — Meta doesn't support
// cross-app posting from a web link, unlike X/LinkedIn/WhatsApp above.
// "Copy caption, download the photo, post from the app" is the honest tool
// for that platform, not a fake share button that would go nowhere.
const COMPOSE_PLATFORMS: { id: keyof PlatformCaptions; label: string }[] = [
  { id: 'x', label: 'X' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'instagram', label: 'Instagram' },
];

const EMPTY_SOP: Record<string, boolean> = Object.fromEntries(SOP_CHECKLIST_ITEMS.map((i) => [i.id, false]));

/** Three raw dispatches covering the cases actually worth exercising: one
 *  with multiple photos (tests the cover-photo picker), one with no photos
 *  and full structured measurements (tests that path renders without a
 *  picker), and one flagged as a safety incident (tests the safety banner
 *  and makes the SOP's "no exposed safety detail" checklist item mean
 *  something instead of just being a box to tick). Placeholder photos are
 *  Unsplash URLs, the same pattern already used for imagery elsewhere in
 *  this app (Home.tsx, Ask.tsx) — not real field photos. */
const DEMO_DISPATCHES: Omit<Dispatch, 'id' | 'authorUid' | 'authorName'>[] = [
  {
    observedAt: Date.now() - 1000 * 60 * 60 * 6,
    station: 'Bharati', lat: -69.4067, lon: 76.1913, elevationM: 25, positionSource: 'GPS handheld',
    activity: 'Wildlife observation', priority: 'notable',
    weather: { airTempC: -8, windSpeedKt: 12, windDir: 'SW', visibilityKm: 15, cloudOktas: 3, present: 'Partly cloudy' },
    measurements: { species: 'Pygoscelis adeliae', count: '340', lifeStage: 'Mixed', behaviour: 'Breeding', method: 'Direct count' },
    notes: 'Large Adélie penguin colony near the Larsemann Hills field camp, first count of the season. Colony appears healthy, several breeding pairs already on eggs.',
    teamMembers: 'R. Iyer, S. Bose', sampleIds: '', safetyFlag: false,
    voiceUrl: null,
    imageUrls: [
      'https://images.unsplash.com/photo-1551986782-d0169b3f8fa7?w=800&h=600&fit=crop',
      'https://images.unsplash.com/photo-1517783999520-f068d7431a60?w=800&h=600&fit=crop',
    ],
    csvUrl: null, docUrls: [],
    caption: '', status: 'raw', publisherName: null, publisherUid: null,
    platformCaptions: null, coverImageIndex: null, sopChecklist: null,
    adminNotes: null, createdAt: Date.now(), updatedAt: Date.now(),
  },
  {
    observedAt: Date.now() - 1000 * 60 * 60 * 30,
    station: 'Maitri', lat: -70.7660, lon: 11.7333, elevationM: 117, positionSource: 'Station fix',
    activity: 'Ice / glaciology survey', priority: 'routine',
    weather: { airTempC: -14, windSpeedKt: 6, windDir: 'S', visibilityKm: 25, cloudOktas: 1, present: 'Clear' },
    measurements: { siteId: 'MAI-S12', iceThickCm: '182', snowDepthCm: '34', freeboardCm: '9', surface: 'Wind slab' },
    notes: 'Routine stake reading at MAI-S12, Schirmacher Oasis. Thickness consistent with last quarter, no anomalies.',
    teamMembers: 'A. Sharma', sampleIds: 'ICE-2609-A', safetyFlag: false,
    voiceUrl: null, imageUrls: [], csvUrl: null, docUrls: [],
    caption: '', status: 'raw', publisherName: null, publisherUid: null,
    platformCaptions: null, coverImageIndex: null, sopChecklist: null,
    adminNotes: null, createdAt: Date.now(), updatedAt: Date.now(),
  },
  {
    observedAt: Date.now() - 1000 * 60 * 45,
    station: 'Dakshin Gangotri', lat: -70.05, lon: 12.0, elevationM: 45, positionSource: 'Manual / map',
    activity: 'Emergency / incident', priority: 'urgent',
    weather: { airTempC: -19, windSpeedKt: 28, windDir: 'E', visibilityKm: 2, cloudOktas: 8, present: 'Blowing snow' },
    measurements: { kind: 'Near miss', injuries: 'First aid only', reported: 'Station leader' },
    notes: 'Minor slip near the generator shed during whiteout conditions. First aid administered, team member resting, no evacuation needed. Station leader notified per protocol.',
    teamMembers: 'K. Nair, D. Rao', sampleIds: '', safetyFlag: true,
    voiceUrl: null, imageUrls: [], csvUrl: null, docUrls: [],
    caption: '', status: 'raw', publisherName: null, publisherUid: null,
    platformCaptions: null, coverImageIndex: null, sopChecklist: null,
    adminNotes: null, createdAt: Date.now(), updatedAt: Date.now(),
  },
];

async function seedDemoDispatches(uid: string, name: string) {
  await Promise.all(
    DEMO_DISPATCHES.map((d) => addDoc(collection(db, 'dispatches'), { ...d, authorUid: uid, authorName: name }))
  );
}

/** One shared narrative base, three platform-shaped variants from it — the
 *  same "template, then a human edits it" pattern the single-caption
 *  version used, just aware that X, LinkedIn and Instagram don't share a
 *  length or a tone. Not an AI call: no model exists in this project to
 *  call, and a plain template a publisher always reviews and edits by hand
 *  is more predictable than a generated one for a government archive. */
function draftCaptions(d: Dispatch): PlatformCaptions {
  const noteExcerpt = (n: number) => d.notes ? d.notes.slice(0, n) + (d.notes.length > n ? '…' : '') : '';
  const hashtags = [...(HASHTAG_BY_STATION[d.station] ?? []), ...(HASHTAG_BY_ACTIVITY[d.activity] ?? [])];

  const xBase = `${d.activity || 'Field report'} at ${d.station || 'an Antarctic station'}. ${noteExcerpt(120)}`.trim();
  const linkedin = `Field report from ${d.authorName}${d.activity ? ` — ${d.activity}` : ''}${d.station ? ` at ${d.station}` : ''}. ${noteExcerpt(400)}\n\n(Edit before submitting for approval.)`;
  const instagram = `${xBase}\n\n${hashtags.join(' ')}`.trim();

  return {
    x: xBase.length > PLATFORM_LIMITS.x ? xBase.slice(0, PLATFORM_LIMITS.x - 1) + '…' : xBase,
    linkedin,
    instagram,
  };
}

/** Format a weather observation the way it would be read out on the radio. */
function weatherLine(w: WeatherObs | undefined): string | null {
  if (!w) return null;
  const bits = [
    w.present,
    w.airTempC != null ? `${w.airTempC} °C` : null,
    w.windSpeedKt != null ? `wind ${w.windDir} ${w.windSpeedKt} kt` : (w.windDir === 'Calm' ? 'wind calm' : null),
    w.visibilityKm != null ? `vis ${w.visibilityKm} km` : null,
    w.cloudOktas != null ? `cloud ${w.cloudOktas}/8` : null,
  ].filter(Boolean);
  return bits.length ? bits.join(' · ') : null;
}

const ROLE_LABEL: Record<Role, string> = { scientist: 'Scientist', publisher: 'Publisher', admin: 'Admin' };

/* ================================================================ Social */
export function Social() {
  const { role, loading: roleLoading } = useRole();
  const { dispatches } = useDispatches();

  const toReview  = useMemo(() => dispatches.filter((d) => d.status === 'raw' || d.status === 'flagged'), [dispatches]);
  const toApprove = useMemo(() => dispatches.filter((d) => d.status === 'drafted'), [dispatches]);
  const live      = useMemo(() => dispatches.filter((d) => d.status === 'approved'), [dispatches]);

  // Lifted up out of PublisherView (not local to it) so this component can
  // tell when the publisher is actually composing a post and, when they
  // are, skip the normal padded/centered page shell entirely — the
  // workspace gets the whole page below the header, not another card
  // squeezed into a narrow column.
  const [pubTab, setPubTab] = useState<'review' | 'mine'>('review');
  const [pubActiveId, setPubActiveId] = useState<string | null>(null);
  const composeDispatch = role === 'publisher' && pubTab === 'review'
    ? toReview.find((d) => d.id === pubActiveId) ?? null
    : null;

  if (roleLoading) return <div className="fld-page"><div className="fld-center"><p className="fld-empty">Loading…</p></div></div>;

  if (composeDispatch) {
    return (
      <div className="fld-page-full">
        <button className="fld-back" onClick={() => setPubActiveId(null)}><ArrowLeft size={14} strokeWidth={2.5} style={{ marginRight: 4 }} />Back to queue</button>
        <ComposeView dispatch={composeDispatch} onSubmitted={() => setPubActiveId(null)} />
      </div>
    );
  }

  return (
    <div className="fld-page">
      <div className="fld-center">
        <h1 className="fld-title">Field reports</h1>
        <p className="fld-sub">
          {role === 'scientist' && 'Field reports are submitted through the IIA desktop app.'}
          {role === 'publisher' && 'Review incoming dispatches, compose posts for each platform, and track them after you submit.'}
          {role === 'admin'     && 'Approve or send back drafted dispatches, and manage team roles.'}
        </p>

        {role === 'scientist' && <ScientistPlaceholder />}
        {role === 'publisher' && (
          <PublisherView
            toReview={toReview}
            live={live}
            dispatches={dispatches}
            tab={pubTab}
            setTab={setPubTab}
            setActiveId={setPubActiveId}
          />
        )}
        {role === 'admin'     && <AdminView toApprove={toApprove} live={live} />}
      </div>
    </div>
  );
}

/* ======================================================= Scientist placeholder */
function ScientistPlaceholder() {
  return (
    <div className="fld-app-card">
      <div className="fld-app-icon" aria-hidden="true">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
      </div>
      <p className="fld-app-title">Use the IIA Field App</p>
      <p className="fld-app-sub">
        Field reports are logged through the desktop application — it works offline in the field
        and syncs to the portal automatically when a connection is available.
      </p>
      <a
        className="fld-app-dl"
        href="https://github.com/iia-scientist-app/releases"
        target="_blank"
        rel="noreferrer"
      >
        Download desktop app
      </a>
    </div>
  );
}

/* ========================================================= Publisher view
 * Tab/active-item state now lives one level up in Social(), which needs to
 * know when a compose session is active so it can drop the padded page
 * shell for it — this component just renders whatever it's told to. */
function PublisherView({
  toReview, dispatches, tab, setTab, setActiveId,
}: {
  toReview: Dispatch[];
  live: Dispatch[];
  dispatches: Dispatch[];
  tab: 'review' | 'mine';
  setTab: (t: 'review' | 'mine') => void;
  setActiveId: (id: string | null) => void;
}) {
  const openInReview = (id: string) => { setTab('review'); setActiveId(id); };

  return (
    <>
      <div className="fld-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'review'} className={'fld-tab' + (tab === 'review' ? ' active' : '')} onClick={() => setTab('review')}>
          Review {toReview.length > 0 && <span className="fld-count">{toReview.length}</span>}
        </button>
        <button role="tab" aria-selected={tab === 'mine'} className={'fld-tab' + (tab === 'mine' ? ' active' : '')} onClick={() => setTab('mine')}>
          My Submissions
        </button>
      </div>
      {tab === 'review' && <ReviewTab items={toReview} setActiveId={setActiveId} />}
      {tab === 'mine'   && <MySubmissionsTab dispatches={dispatches} onRevise={openInReview} />}
    </>
  );
}

/* ============================================================= Admin view */
function AdminView({ toApprove, live }: { toApprove: Dispatch[]; live: Dispatch[] }) {
  const [tab, setTab] = useState<'approve' | 'feed' | 'roles'>('approve');
  return (
    <>
      <div className="fld-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'approve'} className={'fld-tab' + (tab === 'approve' ? ' active' : '')} onClick={() => setTab('approve')}>
          Approve {toApprove.length > 0 && <span className="fld-count">{toApprove.length}</span>}
        </button>
        <button role="tab" aria-selected={tab === 'feed'} className={'fld-tab' + (tab === 'feed' ? ' active' : '')} onClick={() => setTab('feed')}>Live feed</button>
        <button role="tab" aria-selected={tab === 'roles'} className={'fld-tab' + (tab === 'roles' ? ' active' : '')} onClick={() => setTab('roles')}>Manage roles</button>
      </div>
      {tab === 'approve' && <ApproveTab items={toApprove} />}
      {tab === 'feed'    && <FeedTab items={live} />}
      {tab === 'roles'   && <RolesTab />}
    </>
  );
}

/* ============================================================= Review tab
 * The "active item" branch lives in Social() now, not here — once a
 * dispatch is opened for compose, this list isn't on screen any more. */
function ReviewTab({ items, setActiveId }: { items: Dispatch[]; setActiveId: (id: string | null) => void }) {
  if (items.length === 0) {
    return (
      <div className="fld-empty-state">
        <p className="fld-empty">Nothing in the queue right now.</p>
        <DemoSeedButton />
      </div>
    );
  }

  return (
    <ul className="fld-list">
      {items.map((d) => (
        <li key={d.id} onClick={() => setActiveId(d.id)}>
          <div className="fld-list-left">
            <span className={'fld-pill status-' + d.status}>{STATUS_LABEL[d.status]}</span>
            <span className={'fld-priority-dot ' + (d.priority ?? 'routine')} title={PRIORITY_LABEL[d.priority ?? 'routine']} />
            <span className="fld-list-author">{d.authorName}</span>
            <span className="fld-list-activity">{d.activity}</span>
          </div>
          <span className="fld-list-date">{new Date(d.observedAt ?? d.createdAt).toLocaleDateString()}</span>
        </li>
      ))}
    </ul>
  );
}

/** Only ever visible on an empty queue — a real dispatch reaching the queue
 *  naturally makes it disappear, so this can't accumulate clutter the way
 *  a permanent "seed data" button in a live product normally would. Writes
 *  as the currently signed-in user (whichever role), same as any other
 *  write this app makes — no service account, no rules bypass. */
function DemoSeedButton() {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const run = async () => {
    if (!user) return;
    setBusy(true);
    try {
      await seedDemoDispatches(user.uid, user.displayName ?? user.email ?? 'Demo scientist');
      setDone(true);
    } finally { setBusy(false); }
  };

  if (done) return <p className="fld-demo-done">Added — the queue is live, they'll appear above in a moment.</p>;

  return (
    <button type="button" className="ph-btn ghost fld-demo-btn" onClick={run} disabled={busy}>
      <Sparkles size={14} strokeWidth={2.5} style={{ marginRight: 6 }} />
      {busy ? 'Adding…' : 'Add 3 demo dispatches to test with'}
    </button>
  );
}

/* ================================================================= steps
 * A guided, one-thing-at-a-time flow instead of a flat form — write for X,
 * then LinkedIn, then Instagram, pick a cover if there's a choice to make,
 * then a real preview of all three before submitting. Reuses the wizard/
 * stepper CSS already built for the old scientist submission form
 * (.fld-wizard / .fld-stepper / .fld-step-panel), which was sitting unused
 * since that form moved to the desktop app. */
interface ComposeStep { id: keyof PlatformCaptions | 'photo' | 'public' | 'review'; label: string; hint: string }

const PUBLIC_STEP: ComposeStep = {
  id: 'public',
  label: 'Public page',
  hint: 'This is what goes on the public website — written for someone with no science background. Short sentences, no field codes, and say why it matters. A first draft is generated from the report; make it sound like a person wrote it.',
};

const CAPTION_STEPS: ComposeStep[] = [
  { id: 'x', label: 'X', hint: 'Short and sharp — this lives or dies in the first line. Well under 280 characters reads better than one that just fits.' },
  { id: 'linkedin', label: 'LinkedIn', hint: 'Give it the context X has no room for — the story behind the data, not just the headline. Line breaks are fine here.' },
  { id: 'instagram', label: 'Instagram', hint: 'Front-load anything that matters — captions collapse under "more" after a couple of lines. Hashtags go at the end.' },
];
const PHOTO_STEP: ComposeStep = { id: 'photo', label: 'Photo', hint: "Upload a photo or pick one already on the report — whichever will actually stop someone mid-scroll." };
const REVIEW_STEP: ComposeStep = { id: 'review', label: 'Review', hint: 'How it actually looks on each platform, side by side, before an admin sees it.' };

/** Google's own profile photo when there is one — genuinely more useful in
 *  a preview than a generic placeholder, since it's what the account that
 *  ships this post already looks like. Falls back to an initial. */
function Avatar({ url, name, className }: { url?: string | null; name: string; className: string }) {
  if (url) return <img src={url} alt="" className={className} />;
  return <span className={className + ' fld-avatar-fallback'}>{name.trim().charAt(0).toUpperCase() || '?'}</span>;
}

function PlatformBadge({ id }: { id: keyof PlatformCaptions }) {
  return <span className={'fld-platform-badge fld-platform-badge--' + id} aria-hidden="true">{id === 'x' ? '𝕏' : id === 'linkedin' ? 'in' : <Camera size={13} strokeWidth={2.5} />}</span>;
}

/* ============================================================ Compose view
 * The Publisher's actual toolkit: a step-by-step per-platform composer
 * with live length counters, one-click hashtag suggestions, a cover-photo
 * picker, real platform-shaped previews, and the SOP checklist that gates
 * submission — all driven off the same Dispatch, shared by the Review
 * queue and by "Revise" from My Submissions so the two never drift into
 * different UIs. */
function ComposeView({ dispatch: d, onSubmitted }: { dispatch: Dispatch; onSubmitted: () => void }) {
  const { user } = useAuth();
  const [captions, setCaptions] = useState<PlatformCaptions>(
    () => d.platformCaptions ?? { x: d.caption || '', linkedin: d.caption || '', instagram: d.caption || '' }
  );
  const [coverIndex, setCoverIndex] = useState(d.coverImageIndex ?? 0);
  const [localImages, setLocalImages] = useState<string[]>(d.imageUrls ?? []);
  const [sop, setSop] = useState<Record<string, boolean>>(d.sopChecklist ?? EMPTY_SOP);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const focusedField = useRef<keyof PlatformCaptions>('x');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const originalImageCount = d.imageUrls?.length ?? 0;

  const steps: ComposeStep[] = [...CAPTION_STEPS, PHOTO_STEP, PUBLIC_STEP, REVIEW_STEP];
  const step = steps[stepIdx];
  const captionStepId: keyof PlatformCaptions | null =
    step.id === 'x' || step.id === 'linkedin' || step.id === 'instagram' ? step.id : null;

  /* The dispatch as it should be read, not as it arrived — an older field-app
   * build may have sent Australian station names, METAR weather codes or an
   * empty measurement map. normaliseDispatch repairs what it can and tells us
   * what it couldn't, so the publisher sees the problems rather than
   * unknowingly publishing them. */
  const { dispatch: clean, measurements, warnings, sourceStation } = useMemo(() => normaliseDispatch(d), [d]);

  const [publicSummary, setPublicSummary] = useState<StoredPublicSummary>(() => {
    if (d.publicSummary) return d.publicSummary;
    const drafted = draftPublicSummary(clean, measurements);
    return { title: drafted.title, body: drafted.body, table: drafted.table, chart: drafted.chart ?? null };
  });

  const regeneratePublic = () => {
    const drafted = draftPublicSummary(clean, measurements);
    setPublicSummary({ title: drafted.title, body: drafted.body, table: drafted.table, chart: drafted.chart ?? null });
  };

  const hashtags = [...(HASHTAG_BY_STATION[d.station] ?? []), ...(HASHTAG_BY_ACTIVITY[d.activity] ?? [])];
  const allChecked = SOP_CHECKLIST_ITEMS.every((item) => sop[item.id]);
  const hasAnyCaption = COMPOSE_PLATFORMS.some((p) => captions[p.id].trim());
  const coverUrl = localImages[coverIndex] ?? localImages[0] ?? null;
  const authorInitials = user?.displayName ?? user?.email ?? 'Publisher';

  const handleFileSelected = async (file: File | undefined) => {
    if (!file || !user) return;
    if (!file.type.startsWith('image/')) { setUploadError('Only image files are supported.'); return; }
    if (file.size > 10 * 1024 * 1024) { setUploadError('Image exceeds the 10 MB limit.'); return; }
    if (localImages.length >= 8) { setUploadError('Up to 8 photos per post.'); return; }
    setUploadError(null);
    setUploading(true);
    setUploadPct(0);
    try {
      const objRef = ref(storage, `dispatches/${user.uid}/${d.id}/${Date.now()}-${file.name}`);
      const task = uploadBytesResumable(objRef, file);
      await new Promise<void>((resolve, reject) => {
        task.on(
          'state_changed',
          (snap) => setUploadPct(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
          reject,
          () => resolve()
        );
      });
      const url = await getDownloadURL(objRef);
      setLocalImages((prev) => {
        const next = [...prev, url];
        setCoverIndex(next.length - 1);
        return next;
      });
    } catch {
      setUploadError('Upload failed — check your connection and try again.');
    } finally {
      setUploading(false);
    }
  };

  const removeImage = (i: number) => {
    setLocalImages((prev) => prev.filter((_, idx) => idx !== i));
    setCoverIndex((prev) => (prev === i ? 0 : prev > i ? prev - 1 : prev));
  };

  /* ---- workspace layout: draggable/collapsible panes, like a real editor
   * — the memo on the left for reference, the caption editor top-right,
   * a live preview bottom-right that never has to be hunted for. */
  const [leftWidth, setLeftWidth] = useState(340);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [topHeight, setTopHeight] = useState(420);
  const [previewMaximized, setPreviewMaximized] = useState(false);
  const [previewPlatform, setPreviewPlatform] = useState<keyof PlatformCaptions>('x');

  useEffect(() => {
    if (captionStepId) setPreviewPlatform(captionStepId);
  }, [captionStepId]);

  const dragLeftWidth = (e: ReactPointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = leftWidth;
    const onMove = (ev: PointerEvent) => setLeftWidth(Math.min(560, Math.max(240, startWidth + (ev.clientX - startX))));
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const dragTopHeight = (e: ReactPointerEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = topHeight;
    const onMove = (ev: PointerEvent) => setTopHeight(Math.min(640, Math.max(200, startHeight + (ev.clientY - startY))));
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const generate = () => setCaptions(draftCaptions(d));

  const setCaptionFor = (id: keyof PlatformCaptions, value: string) =>
    setCaptions((prev) => ({ ...prev, [id]: value }));

  const insertHashtag = (tag: string) => {
    const id = focusedField.current;
    setCaptions((prev) => ({ ...prev, [id]: (prev[id] ? prev[id] + ' ' : '') + tag }));
  };

  const copy = async (id: keyof PlatformCaptions) => {
    try {
      await navigator.clipboard.writeText(captions[id]);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch { /* clipboard permission denied — nothing to fall back to */ }
  };

  const toggleSop = (id: string) => setSop((prev) => ({ ...prev, [id]: !prev[id] }));

  const submit = async () => {
    if (!user || !allChecked || !hasAnyCaption) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'dispatches', d.id), {
        caption: captions.x || captions.linkedin || captions.instagram,
        platformCaptions: captions,
        imageUrls: localImages,
        coverImageIndex: coverIndex,
        sopChecklist: sop,
        publicSummary,
        status: 'drafted' satisfies DispatchStatus,
        publisherUid: user.uid,
        publisherName: user.displayName ?? user.email ?? 'Unnamed publisher',
        adminNotes: null,
        updatedAt: Date.now(),
      });
      onSubmitted();
    } finally { setSaving(false); }
  };

  return (
    <>
      {d.status === 'flagged' && d.adminNotes && (
        <div className="fld-flagnote"><span>Sent back with a note</span><p>{d.adminNotes}</p></div>
      )}

      <div className="fld-workspace">
        <aside className="fld-ws-memo" style={{ '--ws-left-w': leftCollapsed ? '0px' : `${leftWidth}px` } as CSSProperties}>
          {!leftCollapsed && (
            <div className="fld-ws-memo-inner">
              <span className="fld-ws-pane-label">Field report</span>

              {warnings.length > 0 && (
                <div className="fld-datawarn">
                  <span><TriangleAlert size={12} strokeWidth={2.5} /> Check this data before publishing</span>
                  <ul>
                    {warnings.map((w, i) => <li key={i}>{w.message}</li>)}
                  </ul>
                  {sourceStation && <p className="fld-datawarn-src">Field app sent station: “{sourceStation}”</p>}
                </div>
              )}

              <DispatchDetail d={clean} />

              {measurements.length > 0 && (
                <div className="fld-ws-measure">
                  <span className="fld-field-label">Measurements</span>
                  <table className="fld-detail-table">
                    <tbody>
                      {measurements.map((m) => (
                        <tr key={m.fieldId}>
                          <th>{m.label}</th>
                          <td>{m.value}{m.unit ? ` ${m.unit}` : ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </aside>

        <div className="fld-ws-vdivider" onPointerDown={dragLeftWidth}>
          <button
            type="button"
            className="fld-ws-collapse"
            onClick={() => setLeftCollapsed((v) => !v)}
            aria-label={leftCollapsed ? 'Show field report' : 'Hide field report'}
          >
            {leftCollapsed ? <ChevronRight size={13} strokeWidth={2.5} /> : <ChevronLeft size={13} strokeWidth={2.5} />}
          </button>
        </div>

        <div className="fld-ws-right">
          {!previewMaximized && (
            <>
              <div className="fld-ws-top" style={{ '--ws-top-h': `${topHeight}px` } as CSSProperties}>
                <div className="fld-ws-top-inner">
                  <span className="fld-ws-pane-label">Compose</span>

                  <div className="fld-generate-prompt">
                    <Sparkles size={16} strokeWidth={2.5} />
                    <div>
                      <strong>Not sure where to start?</strong>
                      <p>Generate a first draft for all three platforms from this report — edit any of them as you go.</p>
                    </div>
                    <button type="button" className="ph-btn ghost small" onClick={generate}>Generate drafts</button>
                  </div>

                  <div className="fld-wizard">
                    <div className="fld-stepper">
                      {steps.map((s, i) => (
                        <button
                          key={s.id}
                          type="button"
                          className={'fld-step' + (i === stepIdx ? ' active' : '') + (i < stepIdx ? ' done' : '')}
                          onClick={() => setStepIdx(i)}
                        >
                          <span className="fld-step-dot">{i < stepIdx ? <Check size={13} strokeWidth={3} /> : i + 1}</span>
                          <span className="fld-step-label">{s.label}</span>
                        </button>
                      ))}
                    </div>

                    <div className="fld-step-panel">
                      <p className="fld-step-hint">{step.hint}</p>

                      {captionStepId && (() => {
            const capId = captionStepId;
            const len = captions[capId].length;
            const limit = PLATFORM_LIMITS[capId];
            const pct = len / limit;
            return (
              <>
                <label className="fld-caption-label">
                  <PlatformBadge id={capId} /> {COMPOSE_PLATFORMS.find((p) => p.id === capId)?.label} caption
                  <textarea
                    rows={capId === 'linkedin' ? 7 : 5}
                    value={captions[capId]}
                    onFocus={() => { focusedField.current = capId; }}
                    onChange={(e) => setCaptionFor(capId, e.target.value)}
                    autoFocus
                  />
                </label>
                <p className={'fld-char-count' + (pct >= 1 ? ' danger' : pct >= 0.9 ? ' warn' : '')}>
                  {len} / {limit}
                </p>
                {hashtags.length > 0 && (
                  <div className="fld-hashtag-row">
                    {hashtags.map((tag) => (
                      <button key={tag} type="button" className="fld-hashtag-chip" onClick={() => insertHashtag(tag)}>{tag}</button>
                    ))}
                  </div>
                )}
              </>
            );
          })()}

          {step.id === 'photo' && (
            <>
              {localImages.length > 0 && (
                <div className="fld-photo-grid fld-photo-grid--lg">
                  {localImages.map((url, i) => (
                    <div key={url} className="fld-photo-thumb-wrap">
                      <button
                        type="button"
                        className={'fld-photo-thumb fld-photo-thumb--lg fld-cover-pick' + (coverIndex === i ? ' selected' : '')}
                        onClick={() => setCoverIndex(i)}
                        aria-label={`Use photo ${i + 1} as cover`}
                      >
                        <img src={url} alt="" />
                        {coverIndex === i && <span className="fld-cover-check"><Check size={12} strokeWidth={3} /></span>}
                      </button>
                      {i >= originalImageCount && (
                        <button type="button" className="fld-photo-remove" onClick={() => removeImage(i)} aria-label="Remove photo">×</button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="fld-upload-row">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => { void handleFileSelected(e.target.files?.[0]); e.target.value = ''; }}
                />
                <button
                  type="button"
                  className="ph-btn ghost small"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  <Paperclip size={14} strokeWidth={2.5} />
                  {uploading ? `Uploading… ${uploadPct}%` : localImages.length ? 'Add another photo' : 'Upload a photo'}
                </button>
                {uploadError && <p className="fld-upload-error">{uploadError}</p>}
              </div>

              {localImages.length === 0 && !uploading && (
                <p className="fld-step-hint" style={{ margin: 0 }}>No photo yet — every preview reads stronger with one.</p>
              )}
            </>
          )}

                      {step.id === 'public' && (
                        <div className="fld-public-step">
                          <div className="fld-compose-head">
                            <span className="fld-field-label" style={{ margin: 0 }}>Public page copy</span>
                            <button type="button" className="ph-btn ghost small" onClick={regeneratePublic}>Re-draft from the report</button>
                          </div>

                          <label className="fld-caption-label">
                            Headline
                            <input
                              className="fld-public-title"
                              value={publicSummary.title}
                              onChange={(e) => setPublicSummary((p) => ({ ...p, title: e.target.value }))}
                            />
                          </label>

                          {publicSummary.body.map((para, i) => (
                            <label key={i} className="fld-caption-label">
                              {i === 0 ? 'What happened' : i === 1 ? 'Why it matters' : 'Conditions'}
                              <textarea
                                rows={3}
                                value={para}
                                onChange={(e) => setPublicSummary((p) => ({
                                  ...p, body: p.body.map((b, bi) => (bi === i ? e.target.value : b)),
                                }))}
                              />
                            </label>
                          ))}

                          {publicSummary.chart ? (
                            <div className="fld-public-chartnote">
                              <strong>Chart included:</strong> {publicSummary.chart.title} — {publicSummary.chart.data.length} readings in {publicSummary.chart.unit}
                              <span>{publicSummary.chart.data.map((pt) => `${pt.label} ${pt.value}${publicSummary.chart!.unit}`).join(' · ')}</span>
                            </div>
                          ) : (
                            <div className="fld-public-chartnote muted">
                              No chart — this report doesn’t have two or more readings sharing a unit, so the key facts table is shown instead.
                            </div>
                          )}

                          {publicSummary.table.length > 0 && (
                            <div className="fld-public-facts">
                              <span className="fld-field-label">Key facts shown on the page</span>
                              <table>
                                <tbody>
                                  {publicSummary.table.map((f, i) => (
                                    <tr key={i}><th>{f.label}</th><td>{f.value}</td></tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}

                      {step.id === 'review' && (
                        <div className="fld-ws-review">
                          <p className="fld-step-hint" style={{ margin: 0 }}>Check the live preview for each platform (tabs below), then confirm the checklist.</p>
                          <SopChecklist checked={sop} onToggle={toggleSop} />
                        </div>
                      )}
                    </div>

                    <div className="fld-wizard-nav">
                      <button type="button" className="ph-btn ghost fld-nav-btn" onClick={() => setStepIdx((i) => i - 1)} disabled={stepIdx === 0}>
                        <ArrowLeft size={14} strokeWidth={2.5} />Back
                      </button>
                      {step.id === 'review' ? (
                        <button className="ph-btn primary" onClick={submit} disabled={saving || !allChecked || !hasAnyCaption}>
                          {saving ? 'Submitting…' : !allChecked ? 'Complete the checklist' : 'Submit for approval'}
                        </button>
                      ) : (
                        <button type="button" className="ph-btn primary fld-nav-btn" onClick={() => setStepIdx((i) => i + 1)}>
                          Next<ArrowRight size={14} strokeWidth={2.5} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="fld-ws-hdivider" onPointerDown={dragTopHeight} />
            </>
          )}

          <div className="fld-ws-bottom" style={previewMaximized ? { flex: 1 } : undefined}>
            <div className="fld-ws-preview-head">
              <span className="fld-ws-pane-label">Live preview</span>
              <div className="fld-ws-preview-tabs">
                {COMPOSE_PLATFORMS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={'fld-ws-preview-tab' + (previewPlatform === p.id ? ' active' : '')}
                    onClick={() => setPreviewPlatform(p.id)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="fld-ws-collapse"
                onClick={() => setPreviewMaximized((v) => !v)}
                aria-label={previewMaximized ? 'Shrink preview' : 'Expand preview'}
              >
                {previewMaximized ? <Minimize2 size={13} strokeWidth={2.5} /> : <Maximize2 size={13} strokeWidth={2.5} />}
              </button>
            </div>
            <div className="fld-ws-preview-body">
              {previewPlatform === 'x' && (
                <PreviewX name={authorInitials} avatarUrl={user?.photoURL} caption={captions.x} imageUrl={coverUrl} onCopy={() => copy('x')} copied={copiedId === 'x'} />
              )}
              {previewPlatform === 'linkedin' && (
                <PreviewLinkedIn name={authorInitials} avatarUrl={user?.photoURL} caption={captions.linkedin} imageUrl={coverUrl} onCopy={() => copy('linkedin')} copied={copiedId === 'linkedin'} />
              )}
              {previewPlatform === 'instagram' && (
                <PreviewInstagram name={authorInitials} avatarUrl={user?.photoURL} caption={captions.instagram} imageUrl={coverUrl} onCopy={() => copy('instagram')} copied={copiedId === 'instagram'} />
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ===================================================== realistic previews
 * Each platform gets its own real chrome and colour, not a reskinned copy
 * of the others — that's what actually reads as "realistic" rather than
 * three identical boxes with a label swapped. */
function PreviewX({ name, avatarUrl, caption, imageUrl, onCopy, copied }: PreviewProps) {
  return (
    <div className="fld-prev fld-prev--x">
      <div className="fld-prev-x-top">
        <Avatar url={avatarUrl} name={name} className="fld-prev-avatar" />
        <div className="fld-prev-x-names">
          <span className="fld-prev-x-name">{name}</span>
          <span className="fld-prev-x-handle">@iia_antarctica · now</span>
        </div>
        <CopyChip onCopy={onCopy} copied={copied} />
      </div>
      <p className="fld-prev-x-text">{caption || <em>Nothing written yet</em>}</p>
      {imageUrl && <img src={imageUrl} alt="" className="fld-prev-x-img" />}
      <div className="fld-prev-x-actions">
        <span><MessageCircle size={15} strokeWidth={1.8} /> 12</span>
        <span><Repeat2 size={16} strokeWidth={1.8} /> 4</span>
        <span><Heart size={15} strokeWidth={1.8} /> 48</span>
        <span><Share size={14} strokeWidth={1.8} /></span>
      </div>
    </div>
  );
}

function PreviewInstagram({ name, avatarUrl, caption, imageUrl, onCopy, copied }: PreviewProps) {
  const [handle] = name.toLowerCase().split(' ');
  return (
    <div className="fld-prev fld-prev--ig">
      <div className="fld-prev-ig-top">
        <Avatar url={avatarUrl} name={name} className="fld-prev-avatar fld-prev-avatar--ig" />
        <span className="fld-prev-ig-user">iia.{handle || 'antarctica'}</span>
        <CopyChip onCopy={onCopy} copied={copied} dark={false} />
      </div>
      <div className="fld-prev-ig-image">
        {imageUrl ? <img src={imageUrl} alt="" /> : <div className="fld-prev-ig-placeholder"><Camera size={28} strokeWidth={1.5} /></div>}
      </div>
      <div className="fld-prev-ig-actions">
        <Heart size={20} strokeWidth={1.8} />
        <MessageCircle size={20} strokeWidth={1.8} />
        <Send size={19} strokeWidth={1.8} />
        <span className="fld-prev-ig-spacer" />
        <Bookmark size={19} strokeWidth={1.8} />
      </div>
      <p className="fld-prev-ig-caption">
        <strong>iia.{handle || 'antarctica'}</strong> {caption || <em>Nothing written yet</em>}
      </p>
    </div>
  );
}

function PreviewLinkedIn({ name, avatarUrl, caption, imageUrl, onCopy, copied }: PreviewProps) {
  return (
    <div className="fld-prev fld-prev--li">
      <div className="fld-prev-li-top">
        <Avatar url={avatarUrl} name={name} className="fld-prev-avatar" />
        <div className="fld-prev-li-names">
          <span className="fld-prev-li-name">{name}</span>
          <span className="fld-prev-li-title">Knowledge Repository</span>
          <span className="fld-prev-li-time">now</span>
        </div>
        <CopyChip onCopy={onCopy} copied={copied} dark={false} />
      </div>
      <p className="fld-prev-li-text">{caption || <em>Nothing written yet</em>}</p>
      {imageUrl && <img src={imageUrl} alt="" className="fld-prev-li-img" />}
      <div className="fld-prev-li-actions">
        <span>👍 Like</span><span>💬 Comment</span><span>↻ Repost</span><span><Send size={13} strokeWidth={2} /> Send</span>
      </div>
    </div>
  );
}

interface PreviewProps {
  name: string;
  avatarUrl?: string | null;
  caption: string;
  imageUrl: string | null;
  onCopy: () => void;
  copied: boolean;
}

function CopyChip({ onCopy, copied, dark = true }: { onCopy: () => void; copied: boolean; dark?: boolean }) {
  return (
    <button type="button" className={'fld-copy-btn' + (dark ? '' : ' fld-copy-btn--light')} onClick={onCopy}>
      {copied ? <Check size={12} strokeWidth={2.5} /> : <Copy size={12} strokeWidth={2.5} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

/* ========================================================== SOP checklist */
function SopChecklist({ checked, onToggle }: { checked: Record<string, boolean>; onToggle: (id: string) => void }) {
  const done = SOP_CHECKLIST_ITEMS.filter((i) => checked[i.id]).length;
  return (
    <aside className="fld-sop">
      <div className="fld-sop-head">
        <span>Before you submit</span>
        <span className="fld-sop-count">{done}/{SOP_CHECKLIST_ITEMS.length}</span>
      </div>
      <ul className="fld-sop-list">
        {SOP_CHECKLIST_ITEMS.map((item) => (
          <li key={item.id}>
            <label className={'fld-sop-item' + (checked[item.id] ? ' done' : '')}>
              <input type="checkbox" checked={!!checked[item.id]} onChange={() => onToggle(item.id)} />
              <span className="fld-sop-box">{checked[item.id] && <Check size={12} strokeWidth={3} />}</span>
              {item.label}
            </label>
          </li>
        ))}
      </ul>
    </aside>
  );
}

/* ==================================================== My submissions tab */
function MySubmissionsTab({ dispatches, onRevise }: { dispatches: Dispatch[]; onRevise: (id: string) => void }) {
  const { user } = useAuth();
  const [openId, setOpenId] = useState<string | null>(null);

  const mine = useMemo(
    () => dispatches
      .filter((d) => d.publisherUid === user?.uid && d.status !== 'raw')
      .sort((a, b) => b.updatedAt - a.updatedAt),
    [dispatches, user?.uid]
  );

  if (mine.length === 0) {
    return <p className="fld-empty">Nothing submitted yet — drafts you send for approval will show up here.</p>;
  }

  return (
    <div className="fld-mine">
      <ul>
        {mine.map((d) => {
          const expanded = openId === d.id;
          return (
            <li key={d.id} className={'fld-mine-item' + (expanded ? ' expanded' : '')}>
              <div className="fld-mine-row" onClick={() => setOpenId(expanded ? null : d.id)}>
                <div className="fld-mine-info">
                  <span className={'fld-pill status-' + d.status}>{STATUS_LABEL[d.status]}</span>
                  <span className="fld-mine-activity">{d.activity}</span>
                </div>
                <div className="fld-mine-right">
                  <span className="fld-mine-station">{d.station}</span>
                  <span className="fld-mine-date">{new Date(d.updatedAt).toLocaleDateString()}</span>
                  <ChevronDown size={15} style={{ transform: expanded ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }} />
                </div>
              </div>
              {expanded && (
                <div className="fld-mine-detail">
                  <DispatchDetail d={d} />
                  {d.platformCaptions && (
                    <div className="fld-detail-row">
                      <span className="fld-detail-row-label">Submitted captions</span>
                      {COMPOSE_PLATFORMS.map((p) => d.platformCaptions![p.id] && (
                        <p key={p.id}><strong>{p.label}:</strong> {d.platformCaptions![p.id]}</p>
                      ))}
                    </div>
                  )}
                  {d.status === 'flagged' && d.adminNotes && (
                    <div className="fld-flagnote" style={{ margin: '14px 18px' }}>
                      <span>Sent back with a note</span>
                      <p>{d.adminNotes}</p>
                    </div>
                  )}
                  {d.status === 'flagged' && (
                    <div style={{ padding: '0 18px 16px' }}>
                      <button type="button" className="ph-btn primary small" onClick={() => onRevise(d.id)}>
                        <RotateCcw size={13} strokeWidth={2.5} style={{ marginRight: 6 }} />Revise
                      </button>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ============================================================= Approve tab */
function ApproveTab({ items }: { items: Dispatch[] }) {
  const { user } = useAuth();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [flagging, setFlagging] = useState(false);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = items.find((d) => d.id === activeId) ?? null;

  /* Approving is the moment something becomes public, so it does two things:
   * flips the dispatch status, and writes the public record iia-public reads.
   * The dispatch itself never becomes readable without auth — publish.ts
   * builds a separate, public-safe projection. */
  const approve = async () => {
    if (!active || !user) return;
    setBusy(true); setError(null);
    try {
      const allowed = canPublishDispatch({ ...active, status: 'approved' });
      if (!allowed.ok) { setError(allowed.reason); return; }

      const { dispatch: clean, measurements } = normaliseDispatch(active);
      const stored = active.publicSummary;
      const summary = stored
        ? { title: stored.title, body: stored.body, table: stored.table, chart: stored.chart ?? undefined }
        : draftPublicSummary(clean, measurements);   // publisher skipped the step — fall back to the draft

      const identifier = await mintIdentifier();
      const record = toRepositoryRecord(clean, summary, measurements, user.uid, identifier);
      await publishRecord(record);

      await updateDoc(doc(db, 'dispatches', active.id), {
        status: 'approved' satisfies DispatchStatus,
        publicRecordId: record.id,
        publicIdentifier: identifier,
        updatedAt: Date.now(),
      });
      setActiveId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not publish this record. Nothing was changed.');
    } finally { setBusy(false); }
  };

  /* Flagging an already-published record has to take it back off the public
   * site, otherwise "send back" would leave the old version live. */
  const flag = async () => {
    if (!active || !notes.trim()) return;
    setBusy(true); setError(null);
    try {
      if (active.status === 'approved') await unpublishRecord(active.id);
      await updateDoc(doc(db, 'dispatches', active.id), {
        status: 'flagged' satisfies DispatchStatus, adminNotes: notes.trim(), updatedAt: Date.now()
      });
      setActiveId(null); setFlagging(false); setNotes('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send this back.');
    } finally { setBusy(false); }
  };

  if (items.length === 0) return <p className="fld-empty">Nothing waiting on approval.</p>;

  if (active) {
    return (
      <div className="fld-pane">
        <button className="fld-back" onClick={() => { setActiveId(null); setFlagging(false); }}><ArrowLeft size={14} strokeWidth={2.5} style={{ marginRight: 4 }} />Back</button>
        <DispatchDetail d={active} />
        <p className="fld-caption-preview">{active.caption}</p>
        <p className="fld-list-author" style={{ marginBottom: 16, fontSize: 12 }}>Drafted by {active.publisherName}</p>

        {active.publicSummary && (
          <div className="fld-public-preview">
            <span className="fld-field-label">Goes live on the public site as</span>
            <h4>{active.publicSummary.title}</h4>
            {active.publicSummary.body.map((p, i) => <p key={i}>{p}</p>)}
            {active.publicSummary.chart && (
              <p className="fld-public-preview-chart">
                Includes a chart: {active.publicSummary.chart.title} ({active.publicSummary.chart.data.length} readings in {active.publicSummary.chart.unit})
              </p>
            )}
          </div>
        )}

        {error && <div className="fld-flagnote"><span>Couldn’t publish</span><p>{error}</p></div>}

        {!flagging ? (
          <div className="fld-approve-actions">
            <button className="ph-btn primary" onClick={approve} disabled={busy}>
              {busy ? 'Publishing…' : 'Approve — publish it'}
            </button>
            <button className="ph-btn ghost"    onClick={() => setFlagging(true)} disabled={busy}>Flag with a note</button>
          </div>
        ) : (
          <>
            <label className="fld-caption-label">
              What needs to change?
              <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
            <div className="fld-approve-actions">
              <button className="ph-btn primary" onClick={flag} disabled={busy || !notes.trim()}>Send back</button>
              <button className="ph-btn ghost"   onClick={() => setFlagging(false)} disabled={busy}>Cancel</button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <ul className="fld-list">
      {items.map((d) => (
        <li key={d.id} onClick={() => setActiveId(d.id)}>
          <div className="fld-list-left">
            <span className={'fld-pill status-' + d.status}>{STATUS_LABEL[d.status]}</span>
            <span className="fld-list-author">{d.authorName}</span>
            <span className="fld-list-activity">{d.activity}</span>
          </div>
          <span className="fld-list-date">{new Date(d.observedAt ?? d.createdAt).toLocaleDateString()}</span>
        </li>
      ))}
    </ul>
  );
}

/* ================================================================ Feed tab */
function FeedTab({ items }: { items: Dispatch[] }) {
  if (items.length === 0) return <p className="fld-empty">Nothing live yet.</p>;
  return (
    <div className="fld-feed">
      {items.map((d) => (
        <article key={d.id} className="fld-feed-card">
          {d.imageUrls?.[0] && <img src={d.imageUrls[0]} alt="" />}
          <div className="fld-feed-body">
            <p>{d.caption}</p>
            {d.voiceUrl && <audio controls src={d.voiceUrl} />}
            <div className="fld-feed-meta">
              <span>{d.authorName}</span>
              <span>{d.station}</span>
              <span>{new Date(d.updatedAt).toLocaleDateString()}</span>
            </div>
            <div className="fld-feed-share">
              {PLATFORMS.map((p) => (
                <a key={p.id} href={p.share(d.caption, PORTAL_URL)} target="_blank" rel="noreferrer" className="ph-btn ghost small">{p.label}</a>
              ))}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

/* ============================================================= Roles tab */
const ROLES: Role[] = ['scientist', 'publisher', 'admin'];

function RolesTab() {
  const [uid, setUid] = useState('');
  const [currentRole, setCurrentRole] = useState<Role | null>(null);
  const [selectedRole, setSelectedRole] = useState<Role>('scientist');
  const [looking, setLooking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const lookup = async () => {
    const trimmed = uid.trim(); if (!trimmed) return;
    setLooking(true); setErr(null); setCurrentRole(null); setDone(false);
    try {
      const snap = await getDoc(doc(db, 'roles', trimmed));
      const role: Role = (snap.data()?.role as Role) ?? 'scientist';
      setCurrentRole(role); setSelectedRole(role);
    } catch { setErr('Could not fetch — check the UID.'); }
    finally { setLooking(false); }
  };

  const save = async () => {
    const trimmed = uid.trim(); if (!trimmed) return;
    setSaving(true); setErr(null);
    try { await assignRole(trimmed, selectedRole); setDone(true); setTimeout(() => setDone(false), 2000); }
    catch { setErr('Could not save — check Firestore rules.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fld-pane">
      <p className="fld-field-label" style={{ marginBottom: 12 }}>Enter a Firebase UID to look up and change a team member's role.</p>
      <div className="fld-role-lookup">
        <input className="fld-uid-input" type="text" placeholder="Firebase UID" value={uid} onChange={(e) => { setUid(e.target.value); setCurrentRole(null); }} />
        <button className="ph-btn ghost" onClick={lookup} disabled={looking || !uid.trim()}>{looking ? 'Looking…' : 'Look up'}</button>
      </div>
      {err && <p className="fld-error" style={{ marginTop: 8 }}>{err}</p>}
      {currentRole !== null && (
        <div className="fld-role-assign">
          <p className="fld-field-label">Current role: <span className={'fld-role-badge role-' + currentRole}>{ROLE_LABEL[currentRole]}</span></p>
          <div className="fld-role-options">
            {ROLES.map((r) => (
              <label key={r} className={'fld-role-option' + (selectedRole === r ? ' selected' : '')}>
                <input type="radio" name="role" value={r} checked={selectedRole === r} onChange={() => setSelectedRole(r)} />
                {ROLE_LABEL[r]}
              </label>
            ))}
          </div>
          <button className="ph-btn primary" onClick={save} disabled={saving || selectedRole === currentRole}>
            {saving ? 'Saving…' : done ? 'Saved!' : 'Assign role'}
          </button>
        </div>
      )}
    </div>
  );
}

/* ============================================================ Dispatch detail */
function DispatchDetail({ d }: { d: Dispatch }) {
  const coords = d.lat != null && d.lon != null
    ? `${Math.abs(d.lat).toFixed(4)}°${d.lat >= 0 ? 'N' : 'S'}, ${Math.abs(d.lon).toFixed(4)}°${d.lon >= 0 ? 'E' : 'W'}`
    : null;

  const met = weatherLine(d.weather);

  const readings = (MEASUREMENT_SCHEMA[d.activity] ?? [])
    .map((f) => [f.label, d.measurements?.[f.id], f.unit] as const)
    .filter((r): r is readonly [string, string, string | undefined] => !!r[1])
    .map(([label, value, unit]) => [label, unit ? `${value} ${unit}` : value] as const);

  const observed = new Date(d.observedAt ?? d.createdAt);

  return (
    <div className="fld-detail">
      <div className="fld-detail-header">
        <div className="fld-detail-meta">
          <strong>{d.authorName}</strong>
          <span>
            {d.station}{coords ? ` · ${coords}` : ''}
            {d.elevationM != null ? ` · ${d.elevationM} m` : ''}
          </span>
          <span>{observed.toISOString().slice(0, 16).replace('T', ' ')} UTC</span>
        </div>
        <div className="fld-detail-badges">
          {d.activity && <span className="fld-activity-tag">{d.activity}</span>}
          {d.priority && d.priority !== 'routine' && <span className={'fld-priority-badge ' + d.priority}>{PRIORITY_LABEL[d.priority]}</span>}
        </div>
      </div>

      {d.safetyFlag && (
        <div className="fld-detail-safety">
          <TriangleAlert size={13} strokeWidth={2.5} style={{ marginRight: 6, flexShrink: 0 }} />
          Flagged for the station leader
        </div>
      )}

      {(met || d.conditions) && (
        <div className="fld-detail-row">
          <span className="fld-detail-row-label">Conditions</span>
          <p className="fld-detail-met">{met ?? d.conditions}</p>
        </div>
      )}

      {readings.length > 0 && (
        <div className="fld-detail-row">
          <span className="fld-detail-row-label">Measurements</span>
          <dl className="fld-readings">
            {readings.map(([label, value]) => (
              <div key={label} className="fld-reading">
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {d.notes && (
        <div className="fld-detail-row">
          <span className="fld-detail-row-label">Field notes</span>
          <p className="fld-detail-notes">{d.notes}</p>
        </div>
      )}

      {(d.teamMembers || d.sampleIds) && (
        <div className="fld-detail-row">
          {d.teamMembers && <><span className="fld-detail-row-label">Field party</span><p>{d.teamMembers}</p></>}
          {d.sampleIds && <><span className="fld-detail-row-label" style={{ marginTop: 8 }}>Samples collected</span><p>{d.sampleIds}</p></>}
        </div>
      )}

      {d.imageUrls?.length > 0 && (
        <div className="fld-detail-photos">
          {d.imageUrls.map((url, i) => <img key={i} src={url} alt={`Photo ${i + 1}`} />)}
        </div>
      )}

      {d.docUrls?.length > 0 && (
        <div className="fld-detail-row">
          <span className="fld-detail-row-label">Attachments</span>
          <ul className="fld-doc-list fld-doc-list--detail">
            {d.docUrls.map((doc, i) => (
              <li key={i} className="fld-doc-item">
                <span className="fld-doc-icon"><Paperclip size={13} strokeWidth={2} /></span>
                <a href={doc.url} target="_blank" rel="noreferrer" className="fld-doc-name fld-doc-link">{doc.name}</a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {d.csvUrl && (
        <div className="fld-detail-row">
          <span className="fld-detail-row-label">Data file</span>
          <a href={d.csvUrl} target="_blank" rel="noreferrer" className="fld-csv-dl">
            <FileSpreadsheet size={14} strokeWidth={2} /> Download CSV
          </a>
        </div>
      )}

      {d.voiceUrl && (
        <div className="fld-detail-row">
          <span className="fld-detail-row-label">Voice memo</span>
          <audio controls src={d.voiceUrl} style={{ width: '100%' }} />
        </div>
      )}
    </div>
  );
}
