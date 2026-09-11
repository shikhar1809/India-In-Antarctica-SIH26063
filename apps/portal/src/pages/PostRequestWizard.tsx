/**
 * An admin asks for a post — the publisher makes it.
 *
 * Four steps: what the post is about (and, optionally, the archive record
 * behind it), who it is for and where it goes, when it is needed, and a
 * review before it is sent. Sending files a dispatch carrying a `request`
 * block into the publisher's review queue — the same queue field reports
 * arrive in — so it runs through the existing studio and the existing
 * approval path, with nothing new to learn and no second pipeline to keep
 * in step.
 *
 * The admin's choices travel as choices: the studio opens with the platforms,
 * audience and tone already set as the admin set them, and the agent treats
 * them as decided rather than re-inferring them.
 */

import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { addDoc, collection } from 'firebase/firestore';
import { ArrowLeft, ArrowRight, Check, Search, Send, X } from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useRole } from '../hooks/useRole';
import { usePublicArchive } from '../hooks/usePublicArchive';
import { AUDIENCES, TONES, type Audience, type Tone } from '../studio/copy';
import { PLATFORM_ORDER, PLATFORM_SPECS, type PlatformId } from '../studio/brand';
import type { DispatchPriority, PostRequest } from '../types';
import '../studio/Studio.css';
import './PostRequestWizard.css';

const STEPS = [
  { id: 'what', label: 'What', hint: 'What should the post be about? Link an archive record if it is about something already published.' },
  { id: 'who', label: 'Who & where', hint: 'Who it is for, which platforms, and in what voice. The publisher and the agent start from these.' },
  { id: 'when', label: 'When', hint: 'How soon it is needed, and anything else the publisher should know.' },
  { id: 'send', label: 'Review & send', hint: 'Check it, then send it to the publisher queue.' },
] as const;

const GOALS = ['Announce', 'Explain', 'Celebrate', 'Share data', 'Recruit', 'Other'] as const;

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** `preview` is for the dev harness only: it skips the admin gate and
 *  never writes. */
export function PostRequestWizard({ preview = false }: { preview?: boolean } = {}) {
  const { user } = useAuth();
  const { role, loading } = useRole();
  const { records } = usePublicArchive();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [topic, setTopic] = useState('');
  const [goal, setGoal] = useState<(typeof GOALS)[number]>('Announce');
  const [q, setQ] = useState('');
  const [recordId, setRecordId] = useState<string | null>(null);
  const [platforms, setPlatforms] = useState<PlatformId[]>(['instagram', 'x', 'linkedin']);
  const [audience, setAudience] = useState<Audience>('public');
  const [tone, setTone] = useState<Tone>('plain');
  const [deadline, setDeadline] = useState('');
  const [priority, setPriority] = useState<DispatchPriority>('notable');
  const [notes, setNotes] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const record = records.find((r) => r.id === recordId) ?? null;
  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return records.filter((r) => `${r.title} ${r.metadata?.identifier ?? ''} ${r.station ?? ''}`.toLowerCase().includes(t)).slice(0, 6);
  }, [q, records]);

  if (!preview && (!user || (!loading && role !== 'admin'))) {
    return <main className="ph-page"><p className="fld-empty">Post requests are created by admins.</p></main>;
  }

  const missing = [
    ...(step === 0 && words(topic) < 5 ? ['Describe the post in at least a sentence.'] : []),
    ...(step === 1 && platforms.length === 0 ? ['Pick at least one platform.'] : []),
  ];

  const send = async () => {
    if (preview || !user) { setErr('Preview only — nothing was sent.'); return; }
    setSending(true); setErr(null);
    const now = Date.now();
    const request: PostRequest = {
      kind: 'post-request',
      goal,
      platforms,
      audience,
      tone,
      deadline: deadline ? Date.parse(`${deadline}T23:59:00`) : null,
      recordId: record?.id ?? null,
      recordIdentifier: record?.metadata?.identifier ?? null,
      recordTitle: record?.title ?? null,
      instructions: notes.trim() || null,
      requestedBy: user.uid,
      requestedByName: user.displayName ?? user.email ?? 'Admin',
    };
    try {
      /* Shaped as a dispatch so it lands in the publisher queue and satisfies
       * the same create rule a field report does. It carries no field data:
       * no weather, no measurements, no party — the `request` block is what
       * the studio and the approve desk read. */
      await addDoc(collection(db, 'dispatches'), {
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
        voiceUrl: null, imageUrls: [], csvUrl: null, docUrls: [],
        caption: '', status: 'raw', publisherName: null, publisherUid: null,
        platformCaptions: null, coverImageIndex: null, sopChecklist: null,
        adminNotes: null, createdAt: now, updatedAt: now,
        request,
      });
      navigate('/media', { replace: true, state: { requested: topic.trim() } });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not send the request.');
      setSending(false);
    }
  };

  return (
    <main className="ph-page prw">
      <Link to="/media" className="prw-back"><ArrowLeft size={14} /> Media</Link>
      <header className="prw-head">
        <h1>Create a new post</h1>
        <p>Say what you need. It goes to the publisher queue, where a publisher builds it in the studio and sends it back to you for approval.</p>
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

      <section className="prw-panel">
        {step === 0 && (
          <>
            <label className="prw-field">
              <span className="prw-label">What should the post be about?</span>
              <textarea
                rows={5}
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. Mark World Ozone Day on 16 September with the Maitri surface-ozone record — what it shows and why it matters."
              />
              <span className="prw-count">{words(topic)} words</span>
            </label>

            <div className="prw-field">
              <span className="prw-label">Goal</span>
              <div className="prw-chips">
                {GOALS.map((g) => (
                  <button key={g} type="button" className={'prw-chip' + (goal === g ? ' is-on' : '')} onClick={() => setGoal(g)}>{g}</button>
                ))}
              </div>
            </div>

            <div className="prw-field">
              <span className="prw-label">Based on an archive record <em>(optional)</em></span>
              {record ? (
                <div className="prw-record">
                  <div>
                    <strong>{record.title}</strong>
                    <span>{record.metadata?.identifier}{record.station ? ` · ${record.station}` : ''}</span>
                  </div>
                  <button type="button" aria-label="Remove the linked record" onClick={() => setRecordId(null)}><X size={14} /></button>
                </div>
              ) : (
                <>
                  <div className="prw-search">
                    <Search size={14} />
                    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search published records by title, identifier or station" />
                  </div>
                  {matches.length > 0 && (
                    <ul className="prw-matches">
                      {matches.map((r) => (
                        <li key={r.id}>
                          <button type="button" onClick={() => { setRecordId(r.id); setQ(''); }}>
                            <strong>{r.title}</strong>
                            <span>{r.metadata?.identifier}{r.station ? ` · ${r.station}` : ''}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <div className="prw-field">
              <span className="prw-label">Platforms</span>
              <div className="prw-chips">
                {PLATFORM_ORDER.map((p) => (
                  <button key={p} type="button" className={'prw-chip' + (platforms.includes(p) ? ' is-on' : '')}
                    onClick={() => setPlatforms((ps) => ps.includes(p) ? ps.filter((x) => x !== p) : [...ps, p])}>
                    {PLATFORM_SPECS[p].label}
                  </button>
                ))}
              </div>
            </div>
            <div className="prw-field">
              <span className="prw-label">Audience</span>
              <div className="prw-chips">
                {AUDIENCES.map((a) => (
                  <button key={a.id} type="button" title={a.hint} className={'prw-chip' + (audience === a.id ? ' is-on' : '')} onClick={() => setAudience(a.id)}>{a.label}</button>
                ))}
              </div>
            </div>
            <div className="prw-field">
              <span className="prw-label">Tone</span>
              <div className="prw-chips">
                {TONES.map((t) => (
                  <button key={t.id} type="button" title={t.hint} className={'prw-chip' + (tone === t.id ? ' is-on' : '')} onClick={() => setTone(t.id)}>{t.label}</button>
                ))}
              </div>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <label className="prw-field prw-inline">
              <span className="prw-label">Needed by <em>(optional)</em></span>
              <input type="date" value={deadline} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDeadline(e.target.value)} />
            </label>
            <div className="prw-field">
              <span className="prw-label">Priority</span>
              <div className="prw-chips">
                {(['routine', 'notable', 'urgent'] as DispatchPriority[]).map((p) => (
                  <button key={p} type="button" className={'prw-chip' + (priority === p ? ' is-on' : '')} onClick={() => setPriority(p)}>
                    {p[0].toUpperCase() + p.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <label className="prw-field">
              <span className="prw-label">Notes for the publisher <em>(optional)</em></span>
              <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything they should include, avoid, or check with you first." />
            </label>
          </>
        )}

        {step === 3 && (
          <dl className="prw-summary">
            <div><dt>About</dt><dd>{topic.trim()}</dd></div>
            <div><dt>Goal</dt><dd>{goal}</dd></div>
            <div><dt>Archive record</dt><dd>{record ? `${record.metadata?.identifier} — ${record.title}` : 'None — a new topic'}</dd></div>
            <div><dt>Platforms</dt><dd>{platforms.map((p) => PLATFORM_SPECS[p].label).join(', ')}</dd></div>
            <div><dt>Audience · tone</dt><dd>{AUDIENCES.find((a) => a.id === audience)?.label} · {TONES.find((t) => t.id === tone)?.label}</dd></div>
            <div><dt>Needed by</dt><dd>{deadline ? new Date(`${deadline}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'No deadline'}</dd></div>
            <div><dt>Priority</dt><dd>{priority}</dd></div>
            <div><dt>Notes</dt><dd>{notes.trim() || '—'}</dd></div>
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
