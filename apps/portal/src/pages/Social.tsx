import { useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, ChevronDown, FileSpreadsheet, Paperclip, RotateCcw, Sparkles, TriangleAlert } from 'lucide-react';
import { addDoc, collection, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useDispatches } from '../hooks/useDispatches';
import { useRole } from '../hooks/useRole';
import { RolesTable } from './RolesTable';
import type { Dispatch, DispatchStatus, DispatchPriority, WeatherObs, PlatformCaptions } from '../types';
import { MEASUREMENT_SCHEMA } from '../types';
import { normaliseDispatch } from '../repository/normalise';
import { draftPublicSummary } from '../repository/summarise';
import { canPublishDispatch, mintIdentifier, publishRecord, unpublishRecord, toRepositoryRecord } from '../repository/publish';
import { redactionOf } from '../repository/redaction';
import type { RepositoryRecord } from '../repository/contract';
import { RedactionPreview } from '../components/RedactionPreview';
import { QueueTab } from '../social/QueueTab';
import { ScheduleDialog } from '../social/ScheduleDialog';
import { Studio } from '../studio/Studio';
import { PostCanvas } from '../studio/PostCanvas';
import { exportPng } from '../studio/export';
import { paletteById } from '../studio/brand';
import type { PlatformId } from '../studio/brand';
import { templateById } from '../studio/templates';
import { runChecks, worstSeverity, type Check } from '../review/checks';
import { reviewDispatch, type AiReview } from '../review/aiReview';
import { ImageAnnotator } from '../review/ImageAnnotator';
import { pinCount, type Annotation } from '../review/annotations';
import './Social.css';
import './ApproveDesk.css';

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
const PUBLIC_SITE_URL = 'https://iia-public.web.app';

// Instagram has no share-intent URL scheme at all — Meta doesn't support
// cross-app posting from a web link, unlike X/LinkedIn/WhatsApp above.
// "Copy caption, download the photo, post from the app" is the honest tool
// for that platform, not a fake share button that would go nowhere.
const COMPOSE_PLATFORMS: { id: keyof PlatformCaptions; label: string }[] = [
  { id: 'x', label: 'X' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'instagram', label: 'Instagram' },
];

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

/* ================================================================ Social */
export function Social() {
  const { role, loading: roleLoading } = useRole();
  const { dispatches } = useDispatches();
  // The Media hub links here with ?tab=queue / ?tab=review / ?tab=approve
  // so "View schedule" and "Generate media" land on the right tab instead
  // of always opening on the default one.
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab');

  const toReview  = useMemo(() => dispatches.filter((d) => d.status === 'raw' || d.status === 'flagged'), [dispatches]);
  const toApprove = useMemo(() => dispatches.filter((d) => d.status === 'drafted'), [dispatches]);
  const live      = useMemo(() => dispatches.filter((d) => d.status === 'approved'), [dispatches]);

  // Lifted up out of PublisherView (not local to it) so this component can
  // tell when the publisher is actually composing a post and, when they
  // are, skip the normal padded/centered page shell entirely — the
  // workspace gets the whole page below the header, not another card
  // squeezed into a narrow column.
  const [pubTab, setPubTab] = useState<'review' | 'mine' | 'queue'>(
    initialTab === 'queue' || initialTab === 'mine' ? initialTab : 'review',
  );
  const [pubActiveId, setPubActiveId] = useState<string | null>(null);
  const composeDispatch = role === 'publisher' && pubTab === 'review'
    ? toReview.find((d) => d.id === pubActiveId) ?? null
    : null;

  if (roleLoading) return <div className="fld-page"><div className="fld-center"><p className="fld-empty">Loading…</p></div></div>;

  if (composeDispatch) {
    return (
      <div className="fld-page-full">
        <button className="fld-back" onClick={() => setPubActiveId(null)}><ArrowLeft size={14} strokeWidth={2.5} style={{ marginRight: 4 }} />Back to queue</button>
        <Studio dispatch={composeDispatch} onSubmitted={() => setPubActiveId(null)} />
      </div>
    );
  }

  // Publishers and admins land on a working console, not a landing page —
  // the "Field reports" hero and its blurb pushed real, information-dense
  // content down for no reason once someone is here to work rather than to
  // be welcomed. A scientist still gets it, since their whole page is that
  // one info card and a title actually orients them.
  const isStaff = role === 'publisher' || role === 'admin';

  return (
    <div className={'fld-page' + (isStaff ? ' fld-page-compact' : '')}>
      <div className="fld-center">
        {!isStaff && (
          <>
            <h1 className="fld-title">Field reports</h1>
            <p className="fld-sub">
              Field reports are submitted through the IIA desktop app.
            </p>
          </>
        )}

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
        {role === 'admin'     && <AdminView toApprove={toApprove} live={live} initialTab={initialTab} />}
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
  tab: 'review' | 'mine' | 'queue';
  setTab: (t: 'review' | 'mine' | 'queue') => void;
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
        <button role="tab" aria-selected={tab === 'queue'} className={'fld-tab' + (tab === 'queue' ? ' active' : '')} onClick={() => setTab('queue')}>
          Dissemination
        </button>
      </div>
      {tab === 'review' && <ReviewTab items={toReview} setActiveId={setActiveId} />}
      {tab === 'mine'   && <MySubmissionsTab dispatches={dispatches} onRevise={openInReview} />}
      {tab === 'queue'  && <QueueTab />}
    </>
  );
}

/* ============================================================= Admin view */
function AdminView({
  toApprove, live, initialTab,
}: { toApprove: Dispatch[]; live: Dispatch[]; initialTab?: string | null }) {
  const [tab, setTab] = useState<'approve' | 'feed' | 'roles' | 'queue'>(
    initialTab === 'queue' || initialTab === 'feed' || initialTab === 'roles' ? initialTab : 'approve',
  );
  return (
    <>
      <div className="fld-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'approve'} className={'fld-tab' + (tab === 'approve' ? ' active' : '')} onClick={() => setTab('approve')}>
          Approve {toApprove.length > 0 && <span className="fld-count">{toApprove.length}</span>}
        </button>
        <button role="tab" aria-selected={tab === 'feed'} className={'fld-tab' + (tab === 'feed' ? ' active' : '')} onClick={() => setTab('feed')}>Published content</button>
        <button role="tab" aria-selected={tab === 'roles'} className={'fld-tab' + (tab === 'roles' ? ' active' : '')} onClick={() => setTab('roles')}>Manage roles</button>
        <button role="tab" aria-selected={tab === 'queue'} className={'fld-tab' + (tab === 'queue' ? ' active' : '')} onClick={() => setTab('queue')}>Dissemination</button>
      </div>
      {tab === 'approve' && <ApproveTab items={toApprove} />}
      {tab === 'feed'    && <FeedTab items={live} />}
      {tab === 'roles'   && <RolesTab />}
      {tab === 'queue'   && <QueueTab />}
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
/* ============================================================ Approve tab
 *
 * A review desk rather than a scroll. The queue stays on the left so an
 * approver moves between dispatches without going back; the field record
 * and the public text sit side by side because comparing them *is* the
 * job; the verdict column carries the checks and the two buttons.
 *
 * The checks come from two places on purpose. runChecks() is local and
 * instant and answers everything decidable — empty fields, limits, leaked
 * field codes. reviewDispatch() asks the model only what a rule cannot
 * judge: whether the public wording is actually supported by the notes.
 * The model can never block a publish; only a rule does that.
 */
function ApproveTab({ items }: { items: Dispatch[] }) {
  const { user } = useAuth();
  const [activeId, setActiveId] = useState<string | null>(items[0]?.id ?? null);
  const [flagging, setFlagging] = useState(false);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ai, setAi] = useState<AiReview | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  /* Set when a reviewer chose "Approve & schedule": the record has been
     published, and the scheduling dialog opens on top of it. Held here rather
     than derived, because the dispatch leaves the queue the moment it is
     approved and the dialog still needs the record it was about. */
  const [scheduleFor, setScheduleFor] = useState<(RepositoryRecord & { id: string }) | null>(null);

  /* Markup on the post graphic — a right-click radial menu of drawing tools
     over an enlarged view, so an admin can point at exactly what's wrong
     rather than describing it in a text box. See review/ImageAnnotator.tsx
     for why. `annotateUrl` is a rasterised PNG of the live PostCanvas DOM
     node (exportPng — the same rasteriser the real download uses), not the
     source photo: what needs marking up is what will actually get posted,
     headline and template included, not just the picture underneath it. */
  const canvasRef = useRef<HTMLDivElement>(null);
  const [annotateUrl, setAnnotateUrl] = useState<string | null>(null);
  const [draftAnnotations, setDraftAnnotations] = useState<Annotation[]>([]);
  const [savingAnnotations, setSavingAnnotations] = useState(false);

  const active = items.find((d) => d.id === activeId) ?? items[0] ?? null;

  const openAnnotator = async () => {
    if (!canvasRef.current || !active?.postDesign) return;
    const blob = await exportPng(canvasRef.current, active.postDesign.platform as PlatformId, { pixelRatio: 1.5 });
    setAnnotateUrl(URL.createObjectURL(blob));
    setDraftAnnotations(active.reviewAnnotations ?? []);
  };

  const closeAnnotator = () => {
    if (annotateUrl) URL.revokeObjectURL(annotateUrl);
    setAnnotateUrl(null);
    setDraftAnnotations([]);
  };

  const saveAnnotations = async () => {
    if (!active) return;
    setSavingAnnotations(true);
    try {
      await updateDoc(doc(db, 'dispatches', active.id), {
        reviewAnnotations: draftAnnotations,
        updatedAt: Date.now(),
      });
      closeAnnotator();
    } catch {
      setError('Could not save the markup. Check your connection and try again.');
    } finally {
      setSavingAnnotations(false);
    }
  };

  /* Local checks are cheap enough to run for every dispatch in the queue,
     which is what lets the queue itself show a severity dot per row. */
  const checksById = useMemo(() => {
    const m = new Map<string, Check[]>();
    for (const d of items) m.set(d.id, runChecks(d));
    return m;
  }, [items]);

  const checks = active ? checksById.get(active.id) ?? [] : [];
  const worst = worstSeverity(checks);
  const blocked = checks.some((c) => c.severity === 'blocker');

  /* The reviewer costs a call, so it is asked for rather than automatic. */
  const runAi = async () => {
    if (!active) return;
    setAiBusy(true);
    setAi(null);
    const result = await reviewDispatch(active);
    setAi(result);
    setAiBusy(false);
  };

  const select = (id: string) => {
    setActiveId(id);
    setFlagging(false);
    setNotes('');
    setError(null);
    setAi(null);          // advice belongs to the dispatch it was asked about
  };

  /** Publish the active dispatch. `andSchedule` keeps the freshly published
   *  record around so the scheduling dialog can open on it — approving and
   *  announcing are the same thought, and making the reviewer go and find the
   *  record again afterwards is how announcements get forgotten. */
  const approve = async (andSchedule = false) => {
    if (!active || !user) return;
    setBusy(true); setError(null);
    try {
      const allowed = canPublishDispatch({ ...active, status: 'approved' });
      if (!allowed.ok) { setError(allowed.reason); return; }

      const { dispatch: clean, measurements } = normaliseDispatch(active);
      const stored = active.publicSummary;
      const summary = stored
        ? { title: stored.title, body: stored.body, table: stored.table, chart: stored.chart ?? undefined }
        : draftPublicSummary(clean, measurements);

      const identifier = await mintIdentifier();
      const record = toRepositoryRecord(clean, summary, measurements, user.uid, identifier);
      await publishRecord(record);

      await updateDoc(doc(db, 'dispatches', active.id), {
        status: 'approved' satisfies DispatchStatus,
        publicRecordId: record.id,
        publicIdentifier: identifier,
        updatedAt: Date.now(),
      });
      if (andSchedule) setScheduleFor(record);
      setActiveId(null); setAi(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not publish this record. Nothing was changed.');
    } finally { setBusy(false); }
  };

  const flag = async () => {
    if (!active || !notes.trim()) return;
    setBusy(true); setError(null);
    try {
      if (active.status === 'approved') await unpublishRecord(active.id);
      await updateDoc(doc(db, 'dispatches', active.id), {
        status: 'flagged' satisfies DispatchStatus, adminNotes: notes.trim(), updatedAt: Date.now()
      });
      setActiveId(null); setFlagging(false); setNotes(''); setAi(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send this back.');
    } finally { setBusy(false); }
  };

  if (items.length === 0 || !active) return <p className="fld-empty">Nothing waiting on approval.</p>;

  const summary = active.publicSummary;
  const coords = active.lat != null && active.lon != null
    ? `${Math.abs(active.lat).toFixed(4)}°${active.lat >= 0 ? 'N' : 'S'}, ${Math.abs(active.lon).toFixed(4)}°${active.lon >= 0 ? 'E' : 'W'}`
    : null;
  const met = weatherLine(active.weather);
  const readings = (MEASUREMENT_SCHEMA[active.activity] ?? [])
    .map((f) => [f.label, active.measurements?.[f.id], f.unit] as const)
    .filter((r): r is readonly [string, string, string | undefined] => !!r[1]);

  /* The record exactly as publishing would build it, so the preview shows
     the real projection rather than a description of one. A dispatch that
     cannot be published has no projection to show — the guard says why. */
  const allowed = canPublishDispatch({ ...active, status: 'approved' });
  let publishPreview: RepositoryRecord | null = null;
  let publishBlocked: string | null = allowed.ok ? null : allowed.reason;
  if (allowed.ok) {
    try {
      const { dispatch: clean, measurements: ms } = normaliseDispatch(active);
      const stored = active.publicSummary;
      const draft = stored
        ? { title: stored.title, body: stored.body, table: stored.table, chart: stored.chart ?? undefined }
        : draftPublicSummary(clean, ms);
      publishPreview = toRepositoryRecord(clean, draft, ms, 'preview', 'IIA-PREVIEW');
    } catch {
      publishBlocked = 'The public record could not be built from this dispatch.';
    }
  }

  const verdictClass = worst ?? 'clear';
  const verdictText = blocked
    ? 'Cannot be published'
    : worst === 'missing' ? 'Publishable, with gaps'
    : worst === 'caution' ? 'Publishable, worth a look'
    : 'Nothing flagged';

  return (
    <>
    <div className="ad-desk">
      {/* ── queue ───────────────────────────────────────────────── */}
      <div className="ad-col ad-col--queue">
        <div className="ad-col-head">
          <strong>Queue</strong>
          <span className="ad-ai-muted">{items.length}</span>
        </div>
        <div className="ad-col-body ad-queue">
          {items.map((d) => {
            const w = worstSeverity(checksById.get(d.id) ?? []);
            return (
              <button
                key={d.id}
                type="button"
                className={'ad-queue-item' + (d.id === active.id ? ' is-active' : '')}
                onClick={() => select(d.id)}
              >
                <span className="ad-queue-name">{d.authorName}</span>
                <span className="ad-queue-meta">
                  <i className={'ad-dot ' + (w ?? 'clear')} />
                  {d.activity}
                </span>
                <span className="ad-queue-meta">
                  {new Date(d.observedAt ?? d.createdAt).toLocaleDateString()}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── the field record ────────────────────────────────────── */}
      <div className="ad-col">
        <div className="ad-col-head">
          <strong>Field record</strong>
          <span className="ad-ai-muted">{active.authorName}</span>
        </div>
        <div className="ad-col-body">
          {active.safetyFlag && (
            <div className="ad-banner">
              <TriangleAlert size={13} strokeWidth={2.5} /> Flagged for the station leader
            </div>
          )}

          <div className="ad-block">
            <span className="ad-label">Where and when</span>
            <p className="ad-mono">
              {active.station}{coords ? ` · ${coords}` : ''}
              {active.elevationM != null ? ` · ${active.elevationM} m` : ''}
              {'\n'}{new Date(active.observedAt ?? active.createdAt).toISOString().slice(0, 16).replace('T', ' ')} UTC
              {'\n'}{active.activity}
            </p>
          </div>

          {met && (
            <div className="ad-block">
              <span className="ad-label">Conditions</span>
              <p className="ad-mono">{met}</p>
            </div>
          )}

          {readings.length > 0 && (
            <div className="ad-block">
              <span className="ad-label">Measurements</span>
              <dl className="ad-measures">
                {readings.map(([label, value, unit]) => (
                  <div key={label} className="ad-measure">
                    <dt>{label}</dt>
                    <dd>{unit ? `${value} ${unit}` : value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {active.notes && (
            <div className="ad-block">
              <span className="ad-label">Field notes</span>
              <p className="ad-value">{active.notes}</p>
            </div>
          )}

          {(active.teamMembers || active.sampleIds) && (
            <div className="ad-block">
              <span className="ad-label">Party and samples</span>
              <p className="ad-mono">
                {[active.teamMembers, active.sampleIds].filter(Boolean).join('\n')}
              </p>
            </div>
          )}

          {!!active.imageUrls?.length && (
            <div className="ad-block">
              <span className="ad-label">Photographs ({active.imageUrls.length})</span>
              <div className="ad-photos">
                {active.imageUrls.map((u, i) => (
                  <img
                    key={u}
                    src={u}
                    alt=""
                    className={i === (active.coverImageIndex ?? 0) ? 'is-cover' : undefined}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── what would go public ────────────────────────────────── */}
      <div className="ad-col">
        <div className="ad-col-head">
          <strong>Goes public as</strong>
          <span className="ad-ai-muted">by {active.publisherName ?? 'unknown'}</span>
        </div>
        <div className="ad-col-body">
          {active.postDesign && (() => {
            const pins = pinCount(active.reviewAnnotations ?? []);
            return (
              <button
                type="button"
                className="ad-graphic ad-graphic-clickable"
                onClick={openAnnotator}
                title="Click to mark up this graphic for the publisher"
              >
                <PostCanvas
                  exportRef={canvasRef}
                  platform={active.postDesign.platform as PlatformId}
                  template={templateById(active.postDesign.templateId)}
                  palette={paletteById(active.postDesign.paletteId)}
                  copy={{
                    kicker: active.postDesign.kicker,
                    headline: active.postDesign.headline,
                    standfirst: active.postDesign.standfirst,
                    stat: null,
                    statLabel: null,
                    captions: active.platformCaptions ?? { x: '', linkedin: '', instagram: '' },
                  }}
                  photoUrl={active.imageUrls?.[active.postDesign.photoIndex] ?? active.imageUrls?.[0] ?? null}
                  scale={0.22}
                />
                {pins.total > 0 && (
                  <span className={'ad-graphic-badge' + (pins.unread > 0 ? ' is-unread' : '')}>
                    {pins.total} note{pins.total === 1 ? '' : 's'}{pins.unread > 0 ? ` · ${pins.unread} new` : ''}
                  </span>
                )}
                <span className="ad-graphic-hint">Click to mark up</span>
              </button>
            );
          })()}

          {summary ? (
            <div className="ad-block">
              <span className="ad-label">Public record</span>
              <h4 className="ad-preview-title">{summary.title}</h4>
              {summary.body.map((para, i) => <p key={i} className="ad-value">{para}</p>)}
              {summary.chart && (
                <p className="ad-mono">
                  Chart: {summary.chart.title} · {summary.chart.data.length} readings in {summary.chart.unit}
                </p>
              )}
            </div>
          ) : (
            <p className="ad-empty">No public summary was written — approving would publish an auto-generated draft.</p>
          )}

          {active.caption && (
            <div className="ad-block">
              <span className="ad-label">Caption</span>
              <p className="ad-caption">{active.caption}</p>
            </div>
          )}

          {active.platformCaptions && (
            <div className="ad-block">
              <span className="ad-label">Per platform</span>
              <div className="ad-platforms">
                {(['x', 'linkedin', 'instagram'] as const).map((k) => {
                  const text = active.platformCaptions?.[k] ?? '';
                  const over = k === 'x' && text.length > 280;
                  return (
                    <div key={k} className={'ad-platform' + (over ? ' is-over' : '')}>
                      <span>{k === 'x' ? 'X' : k === 'linkedin' ? 'LinkedIn' : 'Instagram'}</span>
                      <span>{text || '—'}{over ? ` (${text.length}/280)` : ''}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── verdict and actions ─────────────────────────────────── */}
      <div className="ad-col">
        <div className="ad-col-head">
          <strong>Review</strong>
          <span className="ad-ai-muted">{checks.length || 'no'} flag{checks.length === 1 ? '' : 's'}</span>
        </div>

        <div className="ad-col-body">
          <div className={'ad-verdict ' + verdictClass}>
            {blocked ? <TriangleAlert size={14} strokeWidth={2.5} /> : <Sparkles size={14} strokeWidth={2.5} />}
            {verdictText}
          </div>

          {checks.length > 0 && (
            <div className="ad-findings">
              {checks.map((c) => (
                <div key={c.id} className={'ad-finding ' + c.severity}>
                  <div className="ad-finding-text">
                    <span className="ad-finding-label">{c.label}</span>
                    <span className="ad-finding-detail">{c.detail}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── the model's read, asked for explicitly ── */}
          <div className="ad-block">
            <div className="ad-ai-head">
              <span className="ad-label">Editorial review</span>
              <button
                type="button"
                className="ph-btn ghost small"
                onClick={runAi}
                disabled={aiBusy}
              >
                <Sparkles size={12} strokeWidth={2.5} />
                {aiBusy ? 'Reading…' : ai ? 'Re-check' : 'Check the wording'}
              </button>
            </div>

            {!ai && !aiBusy && (
              <p className="ad-ai-note">
                Reads the public text against the field notes and flags anything it does not support,
                or that claims more than one observation can carry.
              </p>
            )}

            {ai?.available === false && ai.reason !== 'cancelled' && (
              <p className="ad-ai-note">Reviewer unavailable — {ai.reason} The checks above still apply.</p>
            )}

            {ai?.available === true && (
              <>
                {ai.summary && <p className="ad-ai-note">{ai.summary}</p>}
                {ai.findings.length === 0 ? (
                  /* Tied to the verdict, not the count: a 'needs-work' reply
                     with nothing itemised must not be reported as all clear. */
                  ai.verdict === 'ready'
                    ? <p className="ad-ai-note">Nothing flagged in the wording.</p>
                    : <p className="ad-ai-note">Flagged for a closer read, without naming a specific line.</p>
                ) : (
                  <div className="ad-findings">
                    {ai.findings.map((f, i) => (
                      <div key={i} className={'ad-finding ' + f.severity}>
                        <div className="ad-finding-text">
                          <span className="ad-finding-where">{f.field}</span>
                          <span className="ad-finding-label">{f.label}</span>
                          <span className="ad-finding-detail">{f.detail}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {error && (
            <div className="ad-banner"><TriangleAlert size={13} strokeWidth={2.5} /> {error}</div>
          )}
        </div>

        <div className="ad-actions">
          {!flagging ? (
            <>
              <button className="ph-btn primary" onClick={() => approve(false)} disabled={busy || blocked}>
                {busy ? 'Publishing…' : blocked ? 'Blocked — cannot publish' : 'Approve — publish it'}
              </button>
              {/* Publishing and announcing are one decision. This does both,
                  then opens the scheduler on the record it just created. */}
              <button className="ph-btn ghost" onClick={() => approve(true)} disabled={busy || blocked}>
                Approve &amp; schedule a post
              </button>
              <button className="ph-btn ghost" onClick={() => setFlagging(true)} disabled={busy}>
                Send back with a note
              </button>
            </>
          ) : (
            <>
              <label className="fld-caption-label">
                What needs to change?
                <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </label>
              <button className="ph-btn primary" onClick={flag} disabled={busy || !notes.trim()}>Send back</button>
              <button className="ph-btn ghost" onClick={() => setFlagging(false)} disabled={busy}>Cancel</button>
            </>
          )}
        </div>
      </div>
    </div>

    {/* ── raw, redacted, public ─────────────────────────────────────
        The two columns above show the field record and the public wording
        side by side. Neither says what is being *withheld* — which is the
        part a reviewer is actually certifying when they approve. It sits
        below the desk rather than inside it because the desk is a
        fixed-height grid sized to the viewport. */}
    <RedactionPreview
      redaction={redactionOf(active)}
      record={publishPreview}
      blockedReason={publishBlocked}
    />

    {/* Opened by "Approve & schedule". The record exists by this point — it
        was published a moment ago — so the dialog needs no picker. */}
    {scheduleFor && user && (
      <ScheduleDialog
        record={scheduleFor}
        createdBy={user.uid}
        onClose={() => setScheduleFor(null)}
      />
    )}

    {/* Opened by clicking the "Goes public as" graphic — a rasterised
        snapshot of it (annotateUrl), not the live PostCanvas node, since
        the drawing surface needs a plain <img> to measure against. */}
    {annotateUrl && active && (
      <ImageAnnotator
        imageUrl={annotateUrl}
        annotations={draftAnnotations}
        authorName={user?.displayName ?? user?.email ?? 'Admin'}
        onChange={setDraftAnnotations}
        onSave={saveAnnotations}
        onClose={closeAnnotator}
        saving={savingAnnotations}
      />
    )}
    </>
  );
}

/* ================================================================ Feed tab */
/** What went public, as a reviewer sees it — the "Published content" tab.
 *
 *  Every card here is a dispatch that already crossed the projection in
 *  publish.ts, so `publicIdentifier` is set. The button links straight to
 *  the record's permanent address on the public site (recordSlug's own
 *  scheme: /archive/<identifier>), which is the fastest way to answer "did
 *  this actually go live, and does it read right?" without hunting for it
 *  in the archive by hand. */
function FeedTab({ items }: { items: Dispatch[] }) {
  if (items.length === 0) return <p className="fld-empty">Nothing published yet.</p>;
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
              {d.publicIdentifier && (
                <a
                  href={`${PUBLIC_SITE_URL}/archive/${d.publicIdentifier}`}
                  target="_blank"
                  rel="noreferrer"
                  className="ph-btn primary small"
                >View on main site</a>
              )}
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
function RolesTab() {
  const { user } = useAuth();

  return (
    <div className="fld-pane">
      {/* Roles are keyed by UID, and the one UID an admin can always supply
          without hunting for it is their own — shown here because it is
          also what seeds the very first admin, out of band:
          `npm run role -- <uid> admin` (or the email form, once one admin
          already exists). Everyone else is granted by email below, which is
          the point of RolesTable — nobody else's UID needs to be found. */}
      {user && (
        <div className="fld-own-uid">
          <span className="fld-field-label">Your own UID</span>
          <code title={user.uid}>{user.uid}</code>
          <button
            className="ph-btn ghost"
            onClick={() => { void navigator.clipboard?.writeText(user.uid); }}
          >Copy</button>
        </div>
      )}
      <RolesTable />
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
