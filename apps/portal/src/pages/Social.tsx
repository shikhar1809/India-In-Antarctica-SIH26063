import { useMemo, useState } from 'react';
import { ArrowLeft, ChevronDown, FileSpreadsheet, Paperclip, RotateCcw, Sparkles, TriangleAlert } from 'lucide-react';
import { addDoc, collection, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useDispatches } from '../hooks/useDispatches';
import { useRole, assignRole } from '../hooks/useRole';
import type { Role } from '../hooks/useRole';
import type { Dispatch, DispatchStatus, DispatchPriority, WeatherObs, PlatformCaptions } from '../types';
import { MEASUREMENT_SCHEMA } from '../types';
import { normaliseDispatch } from '../repository/normalise';
import { draftPublicSummary } from '../repository/summarise';
import { canPublishDispatch, mintIdentifier, publishRecord, unpublishRecord, toRepositoryRecord } from '../repository/publish';
import { Studio } from '../studio/Studio';
import { PostCanvas } from '../studio/PostCanvas';
import { paletteById } from '../studio/brand';
import type { PlatformId } from '../studio/brand';
import { templateById } from '../studio/templates';
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
        <Studio dispatch={composeDispatch} onSubmitted={() => setPubActiveId(null)} />
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

        {/* The graphic itself, rebuilt from the design the publisher settled
          * on. Stored as template/palette/photo ids rather than a rendered
          * file, so this is the same renderer the studio previewed with —
          * an approver is never shown something the export would not match. */}
        {active.postDesign && (
          <div className="fld-approve-graphic">
            <span className="fld-field-label">
              The graphic that goes out
              {active.postDesign.generated && <em> · wording came from the generator</em>}
            </span>
            <PostCanvas
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
              scale={0.28}
            />
          </div>
        )}

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
