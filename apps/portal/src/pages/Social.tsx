import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, ChevronDown, FileSpreadsheet, Inbox, Paperclip, RotateCcw, Send, ShieldAlert, Sparkles, TriangleAlert } from 'lucide-react';
import { addDoc, collection, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useDispatches } from '../hooks/useDispatches';
import { useRole } from '../hooks/useRole';
import type { Dispatch, DispatchStatus, DispatchPriority, WeatherObs, PlatformCaptions } from '../types';
import { MEASUREMENT_SCHEMA } from '../types';
import { normaliseDispatch } from '../repository/normalise';
import { draftPublicSummary } from '../repository/summarise';
import { canPublishDispatch, mintIdentifier, publishRecord, unpublishRecord, toRepositoryRecord, updatePublishedRecord } from '../repository/publish';
import { redactionOf } from '../repository/redaction';
import type { RepositoryRecord } from '../repository/contract';
import { RedactionPreview } from '../components/RedactionPreview';
import { QueueTab } from '../social/QueueTab';
import { useSocialQueue } from '../hooks/useSocialQueue';
import { isRemoved, type ScheduledPost } from '../social/queue';
import { checkLiveness } from '../social/engagementClient';
import { ScheduleDialog } from '../social/ScheduleDialog';
import { platformsOf, postToPlatforms, type PostOutcome } from '../social/postNow';
import { Studio } from '../studio/Studio';
import { PostCanvas } from '../studio/PostCanvas';
import { TraceView } from '../studio/TraceView';
import '../studio/AgentThinking.css';
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
  raw: 'Awaiting screening',
  cleared: 'Awaiting draft',
  drafted: 'Awaiting approval',
  flagged: 'Sent back — needs revision',
  approved: 'Live'
};

const PRIORITY_LABEL: Record<DispatchPriority, string> = {
  routine: 'Routine',
  notable: 'Notable',
  urgent: 'Urgent'
};

const PUBLIC_SITE_URL = 'https://iia-public.web.app';

// NCPOR posts to three platforms: X, LinkedIn and Instagram.
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

/** Seeded as raw reports, as the field app files them: they land in the
 *  admin's Incoming reports on the Media page, to be screened first. */
export async function seedDemoDispatches(uid: string, name: string) {
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

  /* A scientist's report reaches the publishers only once an admin has
   * screened it ('cleared'); an admin's own post request is born cleared. */
  const toReview  = useMemo(() => dispatches.filter((d) => d.status === 'cleared' || d.status === 'flagged'), [dispatches]);
  const toApprove = useMemo(() => dispatches.filter((d) => d.status === 'drafted'), [dispatches]);
  const live      = useMemo(() => dispatches.filter((d) => d.status === 'approved'), [dispatches]);
  /* Raw reports straight from the scientist app, not yet screened. Admins
   * only (the rules keep them from publishers); they sit at the top of the
   * admin's queue, marked apart, with the way to screen them. */
  const incoming  = useMemo(() => dispatches.filter((d) => d.status === 'raw').sort((a, b) => b.createdAt - a.createdAt), [dispatches]);

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
      <div className={'fld-center' + (role === 'admin' ? ' fld-center--wide' : '')}>
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
        {role === 'admin'     && <AdminView toApprove={toApprove} incoming={incoming} live={live} initialTab={initialTab} />}
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
  toApprove, incoming, live, initialTab,
}: { toApprove: Dispatch[]; incoming: Dispatch[]; live: Dispatch[]; initialTab?: string | null }) {
  const location = useLocation();
  const screened = (location.state as { screened?: string; outcome?: string } | null) ?? null;
  const [tab, setTab] = useState<'approve' | 'feed' | 'queue'>(
    initialTab === 'queue' || initialTab === 'feed' ? initialTab : 'approve',
  );
  return (
    <>
      <div className="fld-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'approve'} className={'fld-tab' + (tab === 'approve' ? ' active' : '')} onClick={() => setTab('approve')}>
          Review &amp; approve {toApprove.length + incoming.length > 0 && <span className="fld-count">{toApprove.length + incoming.length}</span>}
        </button>
        <button role="tab" aria-selected={tab === 'feed'} className={'fld-tab' + (tab === 'feed' ? ' active' : '')} onClick={() => setTab('feed')}>Published content</button>
        <button role="tab" aria-selected={tab === 'queue'} className={'fld-tab' + (tab === 'queue' ? ' active' : '')} onClick={() => setTab('queue')}>Dissemination</button>
      </div>
      {tab === 'approve' && screened?.screened && (
        <p className="fld-notice"><CheckCircle2 size={14} strokeWidth={2.5} /> Screened — {screened.screened}: {screened.outcome}.</p>
      )}
      {tab === 'approve' && <ApproveTab items={toApprove} incoming={incoming} />}
      {tab === 'feed'    && <FeedTab items={live} />}
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
        <p className="fld-empty-sub">Field reports reach you once an admin has screened them for personal and sensitive content.</p>
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
            {d.request?.kind === 'post-request' ? (
              <span className="fld-list-activity fld-request">
                <span className="fld-request-tag">Post request</span> {d.notes.slice(0, 70)}{d.notes.length > 70 ? '…' : ''}
                {d.request.deadline && <span className="fld-request-due"> · due {new Date(d.request.deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>}
              </span>
            ) : (
              <span className="fld-list-activity">{d.activity}</span>
            )}
          </div>
          <span className="fld-list-date">{new Date(d.observedAt ?? d.createdAt).toLocaleDateString()}</span>
        </li>
      ))}
    </ul>
  );
}

/** Only ever visible on an empty intake queue — a real report arriving makes
 *  it disappear, so it can't accumulate clutter the way a permanent "seed
 *  data" button in a live product would. Writes as the signed-in user, same
 *  as any other write this app makes — no service account, no rules bypass. */
export function DemoSeedButton() {
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
type QueueFilter = 'approval' | 'revisions' | 'field' | 'requests' | 'all';
const QUEUE_FILTERS: { id: QueueFilter; label: string; hint: string }[] = [
  { id: 'approval', label: 'Awaiting approval', hint: 'Posts a publisher has submitted for the first time' },
  { id: 'revisions', label: 'Revisions', hint: 'Posts resubmitted after you sent them back' },
  { id: 'field', label: 'Field app', hint: 'Reports from the scientist app, not yet screened' },
  { id: 'requests', label: 'Post requests', hint: 'Old post requests waiting to be passed to the publishers' },
  { id: 'all', label: 'All', hint: 'Everything in the queue' },
];

/**
 * Reports that came straight from the scientist app and have not been
 * screened — marked apart from the posts awaiting approval, each with the
 * way to screen it (the AI screening page). A raw post request, from before
 * requests were born cleared, needs no screening: it is passed straight on.
 */
function IncomingGroup({ items, compact = false, title = 'Incoming — not screened' }: { items: Dispatch[]; compact?: boolean; title?: string }) {
  const navigate = useNavigate();
  const [sending, setSending] = useState<string | null>(null);
  const passOn = async (id: string) => {
    setSending(id);
    try { await updateDoc(doc(db, 'dispatches', id), { status: 'cleared' satisfies DispatchStatus, updatedAt: Date.now() }); } finally { setSending(null); }
  };
  if (!items.length) return null;
  return (
    <div className={'ad-incoming' + (compact ? ' is-compact' : '')}>
      <span className="ad-incoming-head"><Inbox size={12} strokeWidth={2.5} /> {title} <b>{items.length}</b></span>
      {items.map((d) => {
        const isRequest = d.request?.kind === 'post-request';
        const incident = d.safetyFlag || d.activity === 'Emergency / incident';
        return (
          <div
            key={d.id}
            className={`ad-incoming-item pri-${d.priority ?? 'routine'}` + (isRequest ? '' : ' is-clickable')}
            role={isRequest ? undefined : 'button'}
            tabIndex={isRequest ? undefined : 0}
            onClick={isRequest ? undefined : () => navigate(`/media/screen/${d.id}`)}
            onKeyDown={isRequest ? undefined : (e) => { if (e.key === 'Enter') navigate(`/media/screen/${d.id}`); }}
          >
            <span className="ad-incoming-tag">{isRequest ? 'Post request' : 'From the field app'}</span>
            <span className="ad-queue-name">{isRequest ? d.notes.slice(0, 60) : `${d.station} · ${d.activity}`}</span>
            <span className="ad-queue-meta">
              {d.authorName} · {new Date(d.createdAt).toLocaleDateString()}
              {incident && <em className="ad-incoming-flag"><ShieldAlert size={10} /> incident</em>}
            </span>
            {isRequest ? (
              <button type="button" className="ad-incoming-btn" onClick={() => void passOn(d.id)} disabled={sending === d.id}>
                <Send size={12} /> {sending === d.id ? 'Sending…' : 'Send to publishers'}
              </button>
            ) : (
              <button type="button" className="ad-incoming-btn is-primary" onClick={(e) => { e.stopPropagation(); navigate(`/media/screen/${d.id}`); }}>
                <Sparkles size={12} /> AI screening
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ApproveTab({ items, incoming = [] }: { items: Dispatch[]; incoming?: Dispatch[] }) {
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
  /* What the publisher actually made — their captions per platform and the
   * finished graphics — carried into the scheduling dialog, so the post that
   * goes out is the one that was approved, not the bare photograph. */
  const [schedulePostOf, setSchedulePostOf] = useState<Pick<Dispatch, 'platformCaptions' | 'postGraphics'> | null>(null);

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

  /* The queue, by kind. Posts awaiting approval come first — they are what
   * this desk exists for; field reports waiting to be screened next. */
  const isRevision = (d: Dispatch) => (d.revision ?? 0) > 0 || (d.reviewAnnotations?.length ?? 0) > 0;
  const firstTime = items.filter((d) => !isRevision(d));
  const revisions = items.filter(isRevision);
  const fieldReports = incoming.filter((d) => d.request?.kind !== 'post-request');
  const postRequests = incoming.filter((d) => d.request?.kind === 'post-request');
  const counts: Record<QueueFilter, number> = {
    approval: firstTime.length, revisions: revisions.length, field: fieldReports.length,
    requests: postRequests.length, all: items.length + incoming.length,
  };
  const [filter, setFilter] = useState<QueueFilter>(() => {
    try {
      const saved = localStorage.getItem('iia-portal:approve-filter') as QueueFilter | null;
      if (saved && QUEUE_FILTERS.some((f) => f.id === saved)) return saved;
    } catch { /* not remembered */ }
    return 'approval';
  });
  const chooseFilter = (f: QueueFilter) => {
    setFilter(f);
    try { localStorage.setItem('iia-portal:approve-filter', f); } catch { /* not remembered */ }
    const first = f === 'approval' ? firstTime[0] : f === 'revisions' ? revisions[0] : null;
    if (first) select(first.id);
  };
  const queueItem = (d: Dispatch) => {
    const w = worstSeverity(checksById.get(d.id) ?? []);
    const headline = d.postDesign?.headline || d.publicSummary?.title || d.caption?.slice(0, 70);
    return (
      <button
        key={d.id}
        type="button"
        className={'ad-queue-item' + (active && d.id === active.id ? ' is-active' : '')}
        onClick={() => select(d.id)}
      >
        {isRevision(d) && <span className="ad-queue-tag">Revision{(d.revision ?? 0) > 1 ? ` ${d.revision}` : ''}</span>}
        {headline && <span className="ad-queue-title">{headline}</span>}
        <span className="ad-queue-name">{d.publisherName ? `${d.publisherName} · for ${d.authorName}` : d.authorName}</span>
        <span className="ad-queue-meta">
          <i className={'ad-dot ' + (w ?? 'clear')} />
          {d.station ? `${d.station} · ` : ''}{d.activity}
        </span>
        <span className="ad-queue-meta">
          Submitted {new Date(d.updatedAt ?? d.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </span>
      </button>
    );
  };

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
  /* What "Approve & post" did on each platform — shown until dismissed,
   * because the approved post leaves the queue the moment it is approved. */
  const [postReport, setPostReport] = useState<{ title: string; lines: PostOutcome[] } | null>(null);
  const [busyNote, setBusyNote] = useState<string | null>(null);

  /** After the record is on the website: post it now, open the scheduler,
   *  or nothing (website only). */
  const announce = async (mode: ApproveMode, record: RepositoryRecord & { id: string }, d: Dispatch) => {
    if (mode === 'schedule') { setSchedulePostOf(d); setScheduleFor(record); return; }
    if (mode !== 'post' || !user) return;
    const wanted = platformsOf(d);
    if (!wanted.length) {
      setPostReport({ title: record.title, lines: [] });
      return;
    }
    setBusyNote(`Posting to ${wanted.map((p) => PLATFORM_NAME[p]).join(', ')}…`);
    const lines = await postToPlatforms(record, d, user.uid, wanted);
    setPostReport({ title: record.title, lines });
  };

  const approve = async (mode: ApproveMode = 'post') => {
    if (!active || !user) return;
    setBusy(true); setError(null); setPostReport(null); setBusyNote(null);
    try {
      const allowed = canPublishDispatch({ ...active, status: 'approved' });
      if (!allowed.ok) { setError(allowed.reason); return; }

      /* A report the admin published at screening is already on the public
       * site. Approving the publisher's post must not mint a second copy:
       * it is approved against that record, whose wording takes the
       * publisher's public summary if they wrote one. */
      if (active.publicRecordId) {
        const snap = await getDoc(doc(db, 'publicArchive', active.publicRecordId));
        if (!snap.exists()) { setError('The public record published at screening no longer exists.'); return; }
        const existing = { id: snap.id, ...snap.data() } as RepositoryRecord;
        if (active.publicSummary) {
          await updatePublishedRecord(existing.id, { title: active.publicSummary.title, body: active.publicSummary.body, table: active.publicSummary.table });
        }
        await updateDoc(doc(db, 'dispatches', active.id), {
          status: 'approved' satisfies DispatchStatus, updatedAt: Date.now(),
        });
        setActiveId(null); setAi(null);
        await announce(mode, existing, active);
        return;
      }

      /* An admin's post request about a record already in the archive is a
       * post about that record — approving it must not mint a second copy.
       * It is marked approved against the existing record, which the
       * scheduling dialog then opens on. */
      if (active.request?.recordId) {
        const snap = await getDoc(doc(db, 'publicArchive', active.request.recordId));
        if (!snap.exists()) { setError('The archive record this request was about no longer exists.'); return; }
        const existing = { id: snap.id, ...snap.data() } as RepositoryRecord;
        await updateDoc(doc(db, 'dispatches', active.id), {
          status: 'approved' satisfies DispatchStatus,
          publicRecordId: existing.id,
          publicIdentifier: existing.metadata?.identifier ?? null,
          updatedAt: Date.now(),
        });
        setActiveId(null); setAi(null);
        await announce(mode, existing, active);
        return;
      }

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
      setActiveId(null); setAi(null);
      await announce(mode, record, active);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not publish this record. Nothing was changed.');
    } finally { setBusy(false); setBusyNote(null); }
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

  if (items.length === 0 || !active) {
    return (
      <div className="ad-empty-wrap">
        {postReport && <PostReport report={postReport} onClose={() => setPostReport(null)} />}
        <IncomingGroup items={incoming} />
        <p className="fld-empty">Nothing waiting on approval.</p>
        {incoming.length === 0 && <DemoSeedButton />}
      </div>
    );
  }

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

  const wanted = platformsOf(active);

  return (
    <>
    {postReport && <PostReport report={postReport} onClose={() => setPostReport(null)} />}
    <div className="ad-desk">
      {/* ── queue ───────────────────────────────────────────────── */}
      <div className="ad-col ad-col--queue">
        <div className="ad-col-head">
          <strong>Queue</strong>
          <span className="ad-ai-muted">{counts.all}</span>
        </div>
        <div className="ad-filter" role="tablist" aria-label="Filter the queue">
          {QUEUE_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              className={'ad-filter-chip' + (filter === f.id ? ' is-on' : '')}
              onClick={() => chooseFilter(f.id)}
              title={f.hint}
            >
              {f.label} <b>{counts[f.id]}</b>
            </button>
          ))}
        </div>
        <div className="ad-col-body ad-queue">
          {(filter === 'approval' || filter === 'all') && firstTime.length > 0 && (
            <>
              {filter === 'all' && <span className="ad-incoming-head ad-approve-head">Awaiting approval <b>{firstTime.length}</b></span>}
              {firstTime.map((d) => queueItem(d))}
            </>
          )}
          {(filter === 'revisions' || filter === 'all') && revisions.length > 0 && (
            <>
              {filter === 'all' && <span className="ad-incoming-head ad-approve-head">Revisions <b>{revisions.length}</b></span>}
              {revisions.map((d) => queueItem(d))}
            </>
          )}
          {(filter === 'field' || filter === 'all') && <IncomingGroup items={fieldReports} compact title="From the field app — not screened" />}
          {(filter === 'requests' || filter === 'all') && <IncomingGroup items={postRequests} compact title="Post requests — not sent on" />}
          {counts[filter] === 0 && <p className="ad-queue-empty">Nothing here.</p>}
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

          {/* The agent's record, so the approver sees how the post was
              made rather than taking three finished captions on trust. */}
          {active.agentTrace ? (
            <div className="ad-block">
              <TraceView trace={active.agentTrace} audience="admin" />
            </div>
          ) : active.postDesign ? (
            <p className="ad-empty">Written without the studio agent — there is no reasoning record for this post.</p>
          ) : null}

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
              {/* Approving publishes to the website and posts to every
                  platform the publisher wrote a caption for, straight away. */}
              <button className="ph-btn primary" onClick={() => approve('post')} disabled={busy || blocked}>
                {busy
                  ? (busyNote ?? 'Publishing…')
                  : blocked ? 'Blocked — cannot publish'
                  : wanted.length ? `Approve & post to ${wanted.map((p) => PLATFORM_NAME[p]).join(', ')}` : 'Approve — publish to the website'}
              </button>
              <button className="ph-btn ghost" onClick={() => approve('schedule')} disabled={busy || blocked}>
                Approve &amp; schedule for later
              </button>
              {wanted.length > 0 && (
                <button className="ph-btn ghost" onClick={() => approve('site')} disabled={busy || blocked}>
                  Approve — website only
                </button>
              )}
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
        post={schedulePostOf}
        createdBy={user.uid}
        onClose={() => { setScheduleFor(null); setSchedulePostOf(null); }}
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
 *  the record's permanent address on the public site.
 *
 *  Cross-checked against the platforms: each card lists the social posts
 *  made about it and whether each is still up (functions/liveness.js). A
 *  record whose every post has been deleted on the platform moves to its
 *  own section — it is still in the public archive, but nothing on social
 *  media carries it any more, and presenting it as live content would be
 *  wrong. The check runs when the tab opens if the last one is over ten
 *  minutes old, and on demand. */
const PLATFORM_NAME: Record<string, string> = { x: 'X', linkedin: 'LinkedIn', instagram: 'Instagram' };
const LIVE_LABEL = { live: 'live', removed: 'deleted', unknown: 'not verified' } as const;
const RECHECK_AFTER_MS = 10 * 60 * 1000;

export function FeedTab({ items, posts: given, preview }: { items: Dispatch[]; posts?: ScheduledPost[]; preview?: boolean }) {
  const { posts: fromQueue } = useSocialQueue();
  const posts = given ?? fromQueue;
  const sent = useMemo(() => posts.filter((p) => p.status === 'posted'), [posts]);
  const [checking, setChecking] = useState(false);
  const [checkNote, setCheckNote] = useState<string | null>(null);
  const autoChecked = useRef(false);

  const lastChecked = sent.length ? Math.min(...sent.map((p) => p.liveCheck?.checkedAt ?? 0)) : null;

  const recheck = async () => {
    if (preview) return;
    setChecking(true);
    setCheckNote(null);
    const r = await checkLiveness();
    setChecking(false);
    if (!r.ok) setCheckNote(r.reason);
    else if (r.result.liveness) {
      const l = r.result.liveness;
      setCheckNote(`${l.checked} post${l.checked === 1 ? '' : 's'} checked: ${l.live} live, ${l.removed} deleted${l.unknown ? `, ${l.unknown} could not be verified` : ''}.`);
    }
  };

  useEffect(() => {
    if (autoChecked.current || preview || !sent.length) return;
    if (lastChecked === 0 || (lastChecked !== null && Date.now() - lastChecked > RECHECK_AFTER_MS)) {
      autoChecked.current = true;
      void recheck();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sent.length, lastChecked]);

  if (items.length === 0) return <p className="fld-empty">Nothing published yet.</p>;

  const postsFor = (d: Dispatch) => sent.filter((p) => !!d.publicIdentifier && p.recordIdentifier === d.publicIdentifier);
  const gone = (d: Dispatch) => { const ps = postsFor(d); return ps.length > 0 && ps.every(isRemoved); };
  const current = items.filter((d) => !gone(d));
  const removed = items.filter(gone);

  const card = (d: Dispatch, dim = false) => {
    const ps = postsFor(d);
    return (
      <article key={d.id} className={'fld-feed-card' + (dim ? ' is-gone' : '')}>
        {d.imageUrls?.[0] && <img src={d.imageUrls[0]} alt="" />}
        <div className="fld-feed-body">
          <p>{d.caption}</p>
          {d.voiceUrl && <audio controls src={d.voiceUrl} />}
          <div className="fld-feed-meta">
            <span>{d.authorName}</span>
            <span>{d.station}</span>
            <span>{new Date(d.updatedAt).toLocaleDateString()}</span>
          </div>
          <div className="fld-live">
            {ps.length === 0 ? (
              <span className="fld-live-chip is-none">Not posted to social media</span>
            ) : ps.map((p) => {
              const st = p.liveCheck?.state ?? 'unknown';
              const title = p.liveCheck
                ? `${LIVE_LABEL[st]} — checked ${new Date(p.liveCheck.checkedAt).toLocaleString('en-GB')}${p.liveCheck.note ? `. ${p.liveCheck.note}` : ''}`
                : 'Not checked yet';
              const label = `${PLATFORM_NAME[p.platform] ?? p.platform} · ${p.liveCheck ? LIVE_LABEL[st] : 'not checked'}`;
              return st === 'live' && p.externalUrl
                ? <a key={p.id} className="fld-live-chip is-live" href={p.externalUrl} target="_blank" rel="noreferrer" title={title}>{label}</a>
                : <span key={p.id} className={`fld-live-chip is-${st}`} title={title}>{label}</span>;
            })}
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
            {!dim && !preview && <PostNowButton d={d} postedTo={posts.filter((p) => p.recordId === d.publicRecordId && (p.status === 'posted' || p.status === 'queued')).map((p) => p.platform)} />}
          </div>
        </div>
      </article>
    );
  };

  return (
    <div className="fld-feed">
      <div className="fld-livebar">
        <span>
          {checking
            ? 'Cross-checking with X, LinkedIn and Instagram…'
            : checkNote ?? (lastChecked
              ? `Cross-checked with the platforms ${new Date(lastChecked).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.`
              : sent.length ? 'Not cross-checked with the platforms yet.' : 'No social posts to cross-check.')}
        </span>
        {sent.length > 0 && !preview && (
          <button type="button" className="ph-btn ghost small" onClick={recheck} disabled={checking}>
            <RotateCcw size={12} strokeWidth={2.5} /> Recheck
          </button>
        )}
      </div>

      {current.map((d) => card(d))}

      {removed.length > 0 && (
        <details className="fld-gone" open={current.length === 0}>
          <summary>Deleted from social media ({removed.length})</summary>
          <p className="fld-gone-note">
            Every social post about these records has been deleted on the platform. The records stay in
            the public archive; their “posted on” links have been taken off the public site.
          </p>
          {removed.map((d) => card(d, true))}
        </details>
      )}
    </div>
  );
}

type ApproveMode = 'post' | 'schedule' | 'site';

/** What happened on each platform after "Approve & post". */
function PostReport({ report, onClose }: { report: { title: string; lines: PostOutcome[] }; onClose: () => void }) {
  const failed = report.lines.filter((l) => !l.ok);
  return (
    <div className={'ad-postreport' + (failed.length ? ' has-failed' : '')} role="status">
      <div className="ad-postreport-head">
        <strong>“{report.title}” is on the website.</strong>
        <button type="button" className="ph-btn ghost small" onClick={onClose}>Dismiss</button>
      </div>
      {report.lines.length === 0 ? (
        <p>No captions were written for X, LinkedIn or Instagram, so nothing was posted to social media.</p>
      ) : (
        <ul>
          {report.lines.map((l) => (
            <li key={l.platform} className={l.ok ? 'is-ok' : 'is-bad'}>
              {l.ok ? <CheckCircle2 size={13} strokeWidth={2.5} /> : <TriangleAlert size={13} strokeWidth={2.5} />}
              <b>{l.label}</b>
              {l.ok
                ? (l.url ? <a href={l.url} target="_blank" rel="noreferrer">posted — view it</a> : <span>posted</span>)
                : <span>not posted — {l.note ?? 'the platform refused it'}</span>}
            </li>
          ))}
        </ul>
      )}
      {failed.length > 0 && <p className="ad-postreport-foot">Failed posts wait in the Queue tab, where they can be retried.</p>}
    </div>
  );
}

/** On the live feed: post an approved post to the platforms it was written
 *  for and has not gone out on yet. */
function PostNowButton({ d, postedTo }: { d: Dispatch; postedTo: string[] }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<PostOutcome[] | null>(null);
  const left = platformsOf(d).filter((p) => !postedTo.includes(p));
  if (!user || !d.publicRecordId || (!left.length && !lines)) return null;

  const go = async () => {
    setBusy(true);
    try {
      const snap = await getDoc(doc(db, 'publicArchive', d.publicRecordId!));
      if (!snap.exists()) { setLines([{ platform: left[0], label: 'Post', ok: false, note: 'The public record no longer exists.' }]); return; }
      setLines(await postToPlatforms({ id: snap.id, ...snap.data() } as RepositoryRecord & { id: string }, d, user.uid, left));
    } finally { setBusy(false); }
  };

  return (
    <>
      {left.length > 0 && (
        <button type="button" className="ph-btn ghost small" onClick={go} disabled={busy}>
          <Send size={12} strokeWidth={2.5} /> {busy ? 'Posting…' : `Post to ${left.map((p) => PLATFORM_NAME[p]).join(', ')}`}
        </button>
      )}
      {lines?.map((l) => (
        <span key={l.platform} className={'fld-live-chip ' + (l.ok ? 'is-live' : 'is-removed')} title={l.note}>
          {l.label} · {l.ok ? 'posted' : `failed: ${l.note ?? ''}`}
        </span>
      ))}
    </>
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
