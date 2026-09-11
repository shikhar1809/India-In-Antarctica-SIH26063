/**
 * An admin asks for a post — the publisher makes it.
 *
 * The admin answers the same Basic questions the publisher does, with the
 * same fields (studio/BasicFields.tsx), in the same three groups — what it
 * is about, what it should have, who it is for — then when it is needed,
 * then a review. Sending files a dispatch carrying a `request` block into
 * the publisher's review queue — the same queue field reports arrive in — so
 * it runs through the existing studio and approval path.
 *
 * The admin's answers travel with the request (`request.basics`). In the
 * studio the publisher presses "Auto-fill from the admin's requirements" and
 * gets them back on their own Basic step, half the work already done; the
 * agent's alignment check then holds the drafts to them.
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { addDoc, collection } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { ArrowLeft, ArrowRight, Check, Send } from 'lucide-react';
import { db, storage } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useRole } from '../hooks/useRole';
import { usePublicArchive } from '../hooks/usePublicArchive';
import { useSocialQueue } from '../hooks/useSocialQueue';
import { isRemoved } from '../social/queue';
import { AUDIENCES, TONES, type Audience, type Tone } from '../studio/copy';
import { PLATFORM_ORDER, PLATFORM_SPECS, type PlatformId } from '../studio/brand';
import { CREDITS, DATA_STATUSES, GOALS, LANGUAGES, cleanLinks, type BasicAnswers } from '../studio/basics';
import { Choice, ImagesField, KbQuestion, LinksField, PlatformsField, ReferencePostsField, StoryField } from '../studio/BasicFields';
import { describeRequest } from '../studio/requestSummary';
import type { DispatchPriority, PostRequest } from '../types';
import '../studio/Studio.css';
import './PostRequestWizard.css';

const STEPS = [
  { id: 'about', label: 'What is it about', hint: 'What the post is about, what kind of post it is, and whether it is about something already in the archive.' },
  { id: 'have', label: 'What it should have', hint: 'Photographs, posts to take the style from, links to carry, and who gets credit.' },
  { id: 'who', label: 'Who it is for', hint: 'Audience, voice, language and platforms. Leave any to the agent.' },
  { id: 'when', label: 'When', hint: 'How soon it is needed, and anything else the publisher should know.' },
  { id: 'send', label: 'Review & send', hint: 'Check it, then send it to the publisher queue.' },
] as const;

/** The legacy one-word goal, still stored for anything that reads it. */
const GOAL_WORD: Record<string, string> = { inform: 'Share data', announce: 'Announce', explain: 'Explain', celebrate: 'Celebrate', invite: 'Recruit' };

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
/** Firestore rejects undefined anywhere in a document. */
const firestoreSafe = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

/** `preview` is for the dev harness only: it skips the admin gate and
 *  never writes. */
export function PostRequestWizard({ preview = false }: { preview?: boolean } = {}) {
  const { user } = useAuth();
  const { role, loading } = useRole();
  const { records } = usePublicArchive();
  const { posts } = useSocialQueue();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [topic, setTopic] = useState('');
  const [basics, setBasics] = useState<BasicAnswers>({ language: 'en', references: [], links: [] });
  const set = <K extends keyof BasicAnswers>(k: K, v: BasicAnswers[K]) => setBasics((b) => ({ ...b, [k]: v }));
  const [recordId, setRecordId] = useState<string | null>(null);
  const [platforms, setPlatforms] = useState<PlatformId[]>(['instagram', 'x', 'linkedin']);
  const [audience, setAudience] = useState<Audience | null>(null);
  const [tone, setTone] = useState<Tone | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // One folder per request being drafted; the dispatch id does not exist yet.
  const [draftKey] = useState(() => `request-${Date.now()}`);
  const [deadline, setDeadline] = useState('');
  const [priority, setPriority] = useState<DispatchPriority>('notable');
  const [notes, setNotes] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const record = records.find((r) => r.id === recordId) ?? null;
  const pastPosts = posts
    .filter((x) => x.status === 'posted' && !isRemoved(x))
    .sort((x, y) => (y.postedAt ?? 0) - (x.postedAt ?? 0))
    .map((x) => ({ id: x.id, platform: x.platform, platformLabel: PLATFORM_SPECS[x.platform as PlatformId]?.label ?? x.platform, caption: x.caption, url: x.externalUrl ?? undefined, postedAt: x.postedAt }));

  if (!preview && (!user || (!loading && role !== 'admin'))) {
    return <main className="ph-page"><p className="fld-empty">Post requests are created by admins.</p></main>;
  }

  const upload = async (file: File) => {
    if (preview || !user) { setUploadError('Preview only — nothing is uploaded.'); return; }
    if (!file.type.startsWith('image/')) { setUploadError('Only image files are supported.'); return; }
    if (file.size > 10 * 1024 * 1024) { setUploadError('Image exceeds the 10 MB limit.'); return; }
    setUploadError(null); setUploading(true); setUploadPct(0);
    try {
      const objRef = ref(storage, `dispatches/${user.uid}/${draftKey}/${Date.now()}-${file.name}`);
      const task = uploadBytesResumable(objRef, file);
      await new Promise<void>((resolve, reject) => {
        task.on('state_changed', (s) => setUploadPct(Math.round((s.bytesTransferred / s.totalBytes) * 100)), reject, () => resolve());
      });
      const url = await getDownloadURL(objRef);
      setImages((prev) => [...prev, url]);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'The upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const buildRequest = (uid: string, name: string): PostRequest => ({
    kind: 'post-request',
    goal: basics.goal ? GOAL_WORD[basics.goal] : 'Agent decides',
    platforms,
    audience: audience ?? 'public',
    tone: tone ?? 'plain',
    deadline: deadline ? Date.parse(`${deadline}T23:59:00`) : null,
    recordId: record?.id ?? null,
    recordIdentifier: record ? (record.metadata?.identifier ?? record.id) : null,
    recordTitle: record?.title ?? null,
    instructions: notes.trim() || null,
    requestedBy: uid,
    requestedByName: name,
    basics: {
      ...basics,
      links: cleanLinks(basics.links),
      audienceChosen: audience != null,
      toneChosen: tone != null,
    },
  });

  const missing = [
    ...(step === 0 && words(topic) < 5 ? ['Describe the post in at least a sentence.'] : []),
    ...(step === 0 && (basics.kb === 'about' || basics.kb === 'cites') && !record ? ['Pick the record, or choose “Agent decides”.'] : []),
    ...(step === 2 && platforms.length === 0 ? ['Pick at least one platform.'] : []),
  ];

  const send = async () => {
    if (preview || !user) { setErr('Preview only — nothing was sent.'); return; }
    setSending(true); setErr(null);
    const now = Date.now();
    const request = buildRequest(user.uid, user.displayName ?? user.email ?? 'Admin');
    try {
      /* Shaped as a dispatch so it lands in the publisher queue and satisfies
       * the same create rule a field report does. It carries no field data:
       * no weather, no measurements, no party — the `request` block is what
       * the studio and the approve desk read. Photographs the admin attached
       * ride as the dispatch's own, exactly like a field report's. */
      await addDoc(collection(db, 'dispatches'), firestoreSafe({
        authorUid: user.uid,
        authorName: request.requestedByName,
        observedAt: now,
        station: record?.station ?? '',
        lat: null, lon: null, elevationM: null, positionSource: 'Not applicable (post request)',
        activity: 'Other',
        priority,
        weather: {},
        measurements: {},
        notes: topic.trim().slice(0, 2000),
        teamMembers: '', sampleIds: '', safetyFlag: false,
        voiceUrl: null, imageUrls: images.slice(0, 5), csvUrl: null, docUrls: [],
        // Born cleared: an admin wrote it, so there is nothing to screen.
        caption: '', status: 'cleared', publisherName: null, publisherUid: null,
        platformCaptions: null, coverImageIndex: images.length ? 0 : null, sopChecklist: null,
        adminNotes: null, createdAt: now, updatedAt: now,
        request,
      }));
      navigate('/media', { replace: true, state: { requested: topic.trim() } });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not send the request.');
      setSending(false);
    }
  };

  const summary = describeRequest(buildRequest(user?.uid ?? 'preview', 'you'), {
    brief: topic.trim(), priority: priority[0].toUpperCase() + priority.slice(1), imageCount: images.length,
  });

  return (
    <main className="ph-page prw">
      <Link to="/media" className="prw-back"><ArrowLeft size={14} /> Media</Link>
      <header className="prw-head">
        <h1>Create a new post</h1>
        <p>
          Answer the same questions a publisher does. It goes to the publisher queue, where the publisher
          auto-fills your answers, builds the post in the studio, and sends it back to you for approval.
        </p>
      </header>

      <ol className="stu-steps prw-steps">
        {STEPS.map((s, i) => (
          <li key={s.id}>
            <button
              type="button"
              className={'stu-step' + (i === step ? ' is-active' : '') + (i < step ? ' is-done' : '')}
              onClick={() => i < step && setStep(i)}
              disabled={i > step}
            >
              <span className="stu-step-num">{i < step ? <Check size={11} strokeWidth={3} /> : i + 1}</span>
              {s.label}
            </button>
          </li>
        ))}
      </ol>
      <p className="stu-hint">{STEPS[step].hint}</p>

      <section className="prw-panel stu">
        {step === 0 && (
          <>
            <StoryField
              label="What should the post be about?"
              sub="Open it to write as much as the publisher needs."
              value={topic}
              onChange={setTopic}
              placeholder="e.g. Mark World Ozone Day on 16 September with the Maitri surface-ozone record — what it shows and why it matters."
            />
            <Choice label="What kind of post is it?" options={GOALS} value={basics.goal} onChange={(v) => set('goal', v)} />
            <KbQuestion
              kb={basics.kb}
              onKb={(v) => set('kb', v)}
              linked={record ? { identifier: record.metadata?.identifier ?? record.id, title: record.title } : null}
              onPick={(_material, source) => {
                const r = records.find((x) => (x.metadata?.identifier ?? x.id) === source.identifier);
                setRecordId(r?.id ?? null);
              }}
              onRemove={() => setRecordId(null)}
            />
            <Choice
              label="How firm is the data?"
              sub="An official account never presents field readings as settled."
              options={DATA_STATUSES}
              value={basics.dataStatus}
              onChange={(v) => set('dataStatus', v)}
            />
          </>
        )}

        {step === 1 && (
          <>
            <ImagesField
              images={images}
              onFile={(f) => void upload(f)}
              uploading={uploading}
              uploadPct={uploadPct}
              uploadError={uploadError}
              imageSource={basics.imageSource}
              onImageSource={(v) => set('imageSource', v)}
              max={5}
            />
            <ReferencePostsField references={basics.references ?? []} onChange={(v) => set('references', v)} pastPosts={pastPosts} />
            <LinksField links={basics.links} onChange={(v) => set('links', v)} />
            <Choice label="Who gets credit?" options={CREDITS} value={basics.credit} onChange={(v) => set('credit', v)} />
          </>
        )}

        {step === 2 && (
          <>
            <Choice
              label="Audience"
              options={AUDIENCES.map((a) => ({ id: a.id, label: a.label, hint: a.hint }))}
              value={audience}
              onChange={setAudience}
            />
            <Choice
              label="How should it sound to them?"
              options={TONES.map((t) => ({ id: t.id, label: t.label, hint: t.hint }))}
              value={tone}
              onChange={setTone}
            />
            <Choice label="In which language?" options={LANGUAGES} value={basics.language} onChange={(v) => set('language', v)} />
            <PlatformsField
              label="Where will they see it?"
              options={PLATFORM_ORDER.map((p) => ({ id: p, label: PLATFORM_SPECS[p].label, hint: PLATFORM_SPECS[p].note }))}
              value={platforms}
              onChange={setPlatforms}
            />
          </>
        )}

        {step === 3 && (
          <>
            <label className="stu-field prw-inline">
              <span className="stu-label">Needed by <em className="stu-opt">optional</em></span>
              <input className="stu-input" type="date" value={deadline} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDeadline(e.target.value)} />
            </label>
            <Choice
              label="Priority"
              auto={false}
              options={(['routine', 'notable', 'urgent'] as DispatchPriority[]).map((p) => ({ id: p, label: p[0].toUpperCase() + p.slice(1) }))}
              value={priority}
              onChange={(v) => v && setPriority(v)}
            />
            <label className="stu-field">
              <span className="stu-label">Notes for the publisher <em className="stu-opt">optional</em></span>
              <textarea className="stu-textarea" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything they should include, avoid, or check with you first." />
            </label>
          </>
        )}

        {step === 4 && (
          <dl className="prw-summary">
            {summary.map((r) => <div key={r.id}><dt>{r.label}</dt><dd>{r.value}</dd></div>)}
          </dl>
        )}

        {missing.length > 0 && <p className="prw-missing">{missing.join(' ')}</p>}
        {err && <p className="fld-error">{err}</p>}
      </section>

      <div className="prw-nav">
        <button type="button" className="stu-ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || sending}>
          <ArrowLeft size={14} /> Back
        </button>
        {step < STEPS.length - 1 ? (
          <button type="button" className="stu-primary stu-primary--sm" onClick={() => setStep((s) => s + 1)} disabled={missing.length > 0}>
            Next <ArrowRight size={14} />
          </button>
        ) : (
          <button type="button" className="stu-primary stu-primary--sm" onClick={send} disabled={sending}>
            <Send size={14} /> {sending ? 'Sending…' : 'Send to the publisher queue'}
          </button>
        )}
      </div>
    </main>
  );
}
