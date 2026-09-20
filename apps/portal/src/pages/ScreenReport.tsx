/**
 * Screening a scientist's report — the admin's step before anything leaves.
 *
 * Every field report now arrives in the admin's Manage media queue first,
 * marked "not screened", and opens here — not in the publishers' queue.
 * The admin reads it with the screening beside it — the portal's own rules
 * (screening/detect.ts) and the screening model (functions/screen.js)
 * pointing at personal and sensitive content, each finding with its reason
 * and a recommendation — and redacts: a finding with one click, or any words
 * by selecting them. Photos can be withheld, and the observer's name kept off
 * the public record.
 *
 * Then the admin decides where the redacted report goes: onto the public
 * website as a record, into the publishers' queue so they can make media from
 * it, or both. Confirming:
 *   1. moves the original words of every redacted field, and any withheld
 *      photos, to dispatches/{id}/private/original — admins only;
 *   2. writes the redacted text over the dispatch, so the copy publishers
 *      read never held the removed words;
 *   3. publishes the public record from the redacted report, if chosen;
 *   4. sets the status: 'cleared' for the publishers, 'approved' if it was
 *      published and not sent on, or left 'raw' if the admin only saved.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import {
  AlertTriangle, ArrowLeft, Check, CheckCircle2, EyeOff, Globe, Loader2, RotateCcw, Send, ShieldAlert, ShieldCheck, Sparkles, Undo2,
} from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useRole } from '../hooks/useRole';
import { useDispatches } from '../hooks/useDispatches';
import type { Dispatch, DispatchStatus, ScreeningRecord } from '../types';
import { MEASUREMENT_SCHEMA } from '../types';
import { normaliseDispatch } from '../repository/normalise';
import { draftPublicSummary } from '../repository/summarise';
import { canPublishDispatch, mintIdentifier, publishRecord, toRepositoryRecord } from '../repository/publish';
import {
  CATEGORY_LABEL, FIELD_LABEL, TOKEN, TOKEN_PATTERN, countRedactions, detect, isOpen, merge, redactQuote, redactRange,
  type Finding, type ScreenCategory, type ScreenField,
} from '../screening/detect';
import { screenWithModel, type ModelScreening } from '../screening/screenClient';
import './ScreenReport.css';

const FIELDS: ScreenField[] = ['notes', 'teamMembers', 'sampleIds', 'conditions'];
const QUICK: ScreenCategory[] = ['name', 'contact', 'health', 'safety', 'location', 'other'];
const REC_LABEL = { publish: 'Fit to publish', 'publish-after-redaction': 'Publish after redaction', hold: 'Hold — do not publish' } as const;

type Working = Record<ScreenField, string>;

const textOf = (d: Dispatch): Working => ({
  notes: d.notes ?? '', teamMembers: d.teamMembers ?? '', sampleIds: d.sampleIds ?? '', conditions: d.conditions ?? '',
});

export function ScreenReport({ dispatch: given, preview = false }: { dispatch?: Dispatch; preview?: boolean } = {}) {
  const { id } = useParams();
  const { dispatches, loading } = useDispatches();
  const { role } = useRole();
  const d = given ?? dispatches.find((x) => x.id === id) ?? null;

  if (!preview && role && role !== 'admin') return <main className="ph-page"><p className="fld-empty">Screening is for admins.</p></main>;
  if (!d) return <main className="ph-page"><p className="fld-empty">{loading ? 'Loading the report…' : 'That report is not in the queue.'}</p></main>;
  return <Screen key={d.id} d={d} preview={preview} />;
}

function Screen({ d, preview }: { d: Dispatch; preview: boolean }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const original = useMemo(() => textOf(d), [d]);
  /* The working text, and every replacement made so far. A finding is
   * followed through the replacements: redacting the name inside "First aid
   * given to Kumar" must leave the first-aid sentence as an open finding
   * (now quoted with the placeholder in it), not quietly close it because
   * its original words no longer match. */
  type State = { working: Working; applied: { field: ScreenField; quote: string; token: string }[] };
  const [state, setState] = useState<State>({ working: original, applied: [] });
  const { working, applied } = state;
  const [history, setHistory] = useState<State[]>([]);
  const [kept, setKept] = useState<Set<string>>(new Set());
  const [withheld, setWithheld] = useState<Set<number>>(new Set());
  const [creditObserver, setCreditObserver] = useState(true);
  const [model, setModel] = useState<ModelScreening | null>(null);
  const [focus, setFocus] = useState<string | null>(null);

  const allowed = canPublishDispatch({ ...d, status: 'approved' });
  const [publish, setPublish] = useState(allowed.ok);
  const [send, setSend] = useState(true);
  /* The publisher did not screen this and has never seen the field report.
   * A line or two from the person who did is the difference between a post
   * written from the material and one guessed at. */
  const [brief, setBrief] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  /* The rules run at once; the model is asked in parallel and its findings
   * join when they arrive. Both read the ORIGINAL text — a finding already
   * redacted simply stops being found in the working copy. */
  const rules = useMemo(() => detect(original), [original]);
  useEffect(() => {
    const ctl = new AbortController();
    if (preview) { setModel({ available: false, reason: 'The screening model needs an admin sign-in — the harness shows the rules’ findings only.' }); return; }
    void screenWithModel(original, { station: d.station, activity: d.activity }, ctl.signal).then(setModel);
    return () => ctl.abort();
  }, [original, d.station, d.activity, preview]);
  const merged = useMemo(() => merge(rules, model?.available ? model.findings : []), [rules, model]);
  /* Each finding's quote as it now reads in the working text. */
  const follow = (list: State['applied'], f: Finding) => list.filter((a) => a.field === f.field).reduce((q, a) => q.split(a.quote).join(a.token), f.quote);
  const findings = merged.map((f) => ({ ...f, quote: follow(applied, f) }));
  // Open while any of its own words are left — a quote that is now nothing
  // but placeholders has been fully redacted.
  const residue = (q: string) => q.replace(TOKEN_PATTERN, '').replace(/[\s.,;:!?'"()\-]/g, '');
  const open = findings.filter((f) => residue(f.quote) && isOpen(f, working) && !kept.has(f.id));
  const handled = findings.length - open.length;

  const commit = (next: State) => { setHistory((h) => [...h.slice(-30), state]); setState(next); };
  const redactFinding = (f: Finding) => commit({
    working: { ...working, [f.field]: redactQuote(working[f.field], f.quote, f.category) },
    applied: [...applied, { field: f.field, quote: f.quote, token: TOKEN[f.category] }],
  });
  const redactRangeIn = (field: ScreenField, start: number, end: number, cat: ScreenCategory) => commit({
    working: { ...working, [field]: redactRange(working[field], start, end, cat) },
    applied: [...applied, { field, quote: working[field].slice(start, end), token: TOKEN[cat] }],
  });
  const redactAllRecommended = () => {
    // Widest first, so a sentence swallows the name inside it in one go.
    let next = state;
    for (const f of [...open].filter((x) => x.action === 'redact').sort((a, b) => b.quote.length - a.quote.length)) {
      const q = follow(next.applied, f);
      if (!next.working[f.field].includes(q)) continue;
      next = {
        working: { ...next.working, [f.field]: redactQuote(next.working[f.field], q, f.category) },
        applied: [...next.applied, { field: f.field, quote: q, token: TOKEN[f.category] }],
      };
    }
    commit(next);
  };
  const undo = () => setHistory((h) => { if (!h.length) return h; setState(h[h.length - 1]); return h.slice(0, -1); });

  const redactedCount = FIELDS.reduce((n, f) => n + countRedactions(working[f]) - countRedactions(original[f]), 0);
  const images = d.imageUrls ?? [];

  /* The public record as it would publish — from the redacted report, with
   * withheld photos out and the observer's name as chosen. */
  const { dispatch: clean, measurements } = useMemo(() => normaliseDispatch(d), [d]);
  const redactedDispatch: Dispatch = {
    ...clean, ...working,
    imageUrls: images.filter((_, i) => !withheld.has(i)),
    authorName: creditObserver ? d.authorName : 'NCPOR field team',
  };
  const summary = useMemo(() => draftPublicSummary(redactedDispatch, measurements), [redactedDispatch.station, redactedDispatch.activity, measurements]); // eslint-disable-line react-hooks/exhaustive-deps

  const confirm = async () => {
    if (preview || !user) { setErr('Preview only — nothing was saved.'); return; }
    if (!publish && !send && redactedCount === 0 && withheld.size === 0) { setErr('Nothing to save — redact something, or choose where it goes.'); return; }
    setBusy(true); setErr(null);
    try {
      const changed = FIELDS.filter((f) => working[f] !== original[f]);
      // 1. The removed words and withheld photos, where only admins can read them.
      if (changed.length || withheld.size) {
        await setDoc(doc(db, 'dispatches', d.id, 'private', 'original'), {
          ...Object.fromEntries(changed.map((f) => [f, original[f]])),
          imageUrls: images,
          savedAt: Date.now(),
          savedBy: user.uid,
        });
      }
      // 3. The public record, from the redacted report.
      let published: { publicRecordId: string; publicIdentifier: string } | null = null;
      if (publish && allowed.ok) {
        const identifier = await mintIdentifier();
        const record = toRepositoryRecord({ ...redactedDispatch, status: 'approved' }, summary, measurements, user.uid, identifier);
        await publishRecord(record);
        published = { publicRecordId: record.id, publicIdentifier: identifier };
      }
      const byCategory: Record<string, number> = {};
      for (const f of FIELDS) {
        for (const t of working[f].match(TOKEN_PATTERN) ?? []) {
          const cat = (Object.entries(TOKEN).find(([, v]) => v === t)?.[0] ?? 'other');
          byCategory[cat] = (byCategory[cat] ?? 0) + 1;
        }
      }
      const screening: ScreeningRecord = {
        by: user.uid, byName: user.displayName ?? user.email ?? 'Admin', at: Date.now(),
        findings: findings.length, redacted: byCategory, photosWithheld: withheld.size,
        modelUsed: !!model?.available, recommendation: model?.available ? model.recommendation : null,
        creditObserver, publishedPublicly: !!published, sentToPublisher: send,
      };
      const status: DispatchStatus = send ? 'cleared' : published ? 'approved' : 'raw';
      // 2 and 4. The redacted text over the dispatch, and where it goes next.
      await updateDoc(doc(db, 'dispatches', d.id), {
        ...Object.fromEntries(changed.map((f) => [f, working[f]])),
        ...(withheld.size ? { imageUrls: redactedDispatch.imageUrls, coverImageIndex: redactedDispatch.imageUrls.length ? 0 : null } : {}),
        ...(published ?? {}),
        screening,
        status,
        ...(send ? { adminBrief: brief.trim() || null } : {}),
        updatedAt: Date.now(),
      });
      navigate('/social?tab=approve', { replace: true, state: { screened: `${d.station} · ${d.activity}`, outcome: send && published ? 'published and sent to the publishers' : send ? 'sent to the publishers' : published ? 'published' : 'saved' } });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save the screening. Nothing was published.');
      setBusy(false);
    }
  };

  const readings = (MEASUREMENT_SCHEMA[d.activity] ?? [])
    .map((f) => [f.label, d.measurements?.[f.id], f.unit] as const)
    .filter((r) => !!r[1]);

  return (
    <main className="ph-page scr">
      <Link to="/social?tab=approve" className="scr-back"><ArrowLeft size={14} /> Manage media</Link>
      <header className="scr-head">
        <div>
          <h1>Screen field report</h1>
          <p>
            <b>{d.station}</b> · {d.activity} · filed by {d.authorName} · {new Date(d.observedAt ?? d.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            {d.priority && d.priority !== 'routine' && <span className={`scr-pri pri-${d.priority}`}>{d.priority}</span>}
          </p>
        </div>
        {(d.safetyFlag || d.activity === 'Emergency / incident') && (
          <span className="scr-safety"><ShieldAlert size={14} /> {d.safetyFlag ? 'Flagged for the station leader' : 'Incident report'} — never published</span>
        )}
      </header>

      <div className="scr-grid">
        {/* ── the report ── */}
        <section className="scr-col">
          <h2>The report</h2>
          {readings.length > 0 && (
            <dl className="scr-readings">
              {readings.map(([label, value, unit]) => <div key={label}><dt>{label}</dt><dd>{value}{unit ? ` ${unit}` : ''}</dd></div>)}
            </dl>
          )}
          <div className="scr-block">
            <span className="scr-label">Photographs</span>
            {images.length ? (
              <div className="scr-photos">
                {images.map((url, i) => (
                  <button key={url} type="button" className={'scr-photo' + (withheld.has(i) ? ' is-withheld' : '')}
                    onClick={() => setWithheld((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; })}
                    title={withheld.has(i) ? 'Withheld — click to include' : 'Included — click to withhold'}>
                    <img src={url} alt="" />
                    {withheld.has(i) && <span><EyeOff size={13} /> Withheld</span>}
                  </button>
                ))}
              </div>
            ) : <p className="scr-muted">No photographs.</p>}
            <p className="scr-muted">Withhold anything showing faces, people who did not consent, or sensitive sites.</p>
          </div>
          <label className="scr-toggle">
            <input type="checkbox" checked={creditObserver} onChange={(e) => setCreditObserver(e.target.checked)} />
            <span>Credit <b>{d.authorName}</b> by name on the public record <em>— otherwise “NCPOR field team”</em></span>
          </label>
        </section>

        {/* ── redaction ── */}
        <section className="scr-col scr-col--text">
          <div className="scr-colhead">
            <h2>Redact</h2>
            <span className="scr-muted">Select any words to redact them, or use the findings.</span>
            <button type="button" className="scr-mini" onClick={undo} disabled={!history.length}><Undo2 size={12} /> Undo</button>
            <button type="button" className="scr-mini" onClick={() => commit({ working: original, applied: [] })} disabled={FIELDS.every((f) => working[f] === original[f])}><RotateCcw size={12} /> Original</button>
          </div>
          {FIELDS.filter((f) => original[f].trim()).map((f) => (
            <FieldEditor
              key={f}
              label={FIELD_LABEL[f]}
              text={working[f]}
              findings={open.filter((x) => x.field === f)}
              focus={focus}
              onFocus={setFocus}
              onRedactRange={(s, e, cat) => redactRangeIn(f, s, e, cat)}
            />
          ))}
          {FIELDS.every((f) => !original[f].trim()) && <p className="scr-muted">The report has no free text to screen.</p>}
        </section>

        {/* ── the screening and the decision ── */}
        <section className="scr-col scr-col--side">
          <div className="scr-colhead">
            <h2>AI screening</h2>
            {!model && <span className="scr-muted"><Loader2 size={12} className="spin" /> Asking the model…</span>}
          </div>
          <div className={'scr-verdict' + (model?.available && model.recommendation === 'hold' ? ' is-hold' : '')}>
            {model?.available ? (
              <>
                <strong><Sparkles size={13} /> {REC_LABEL[model.recommendation]}</strong>
                <p>{model.summary}</p>
              </>
            ) : model ? (
              <p className="scr-muted">{model.reason === 'cancelled' ? '' : `${model.reason} The portal’s own rules still ran.`}</p>
            ) : null}
            <span className="scr-count">{findings.length} found · {handled} handled · {open.length} open</span>
          </div>

          {open.some((f) => f.action === 'redact') && (
            <button type="button" className="scr-redact-all" onClick={redactAllRecommended}>
              <EyeOff size={13} /> Redact all {open.filter((f) => f.action === 'redact').length} recommended
            </button>
          )}

          <ul className="scr-findings">
            {open.map((f) => (
              <li key={f.id} className={`sev-${f.severity}` + (focus === f.id ? ' is-focus' : '')} onMouseEnter={() => setFocus(f.id)} onMouseLeave={() => setFocus(null)}>
                <div className="scr-f-head">
                  <span className="scr-cat">{CATEGORY_LABEL[f.category]}</span>
                  <span className="scr-where">{FIELD_LABEL[f.field]} · {f.source === 'model' ? 'AI' : 'rule'}</span>
                </div>
                <q>{f.quote.length > 140 ? `${f.quote.slice(0, 139)}…` : f.quote}</q>
                <p>{f.reason}</p>
                <div className="scr-f-actions">
                  <button type="button" className="is-primary" onClick={() => redactFinding(f)}><EyeOff size={12} /> Redact{f.action === 'redact' ? ' (recommended)' : ''}</button>
                  <button type="button" onClick={() => setKept((s) => new Set(s).add(f.id))}><Check size={12} /> Keep</button>
                </div>
              </li>
            ))}
            {open.length === 0 && (
              <li className="scr-clear"><CheckCircle2 size={15} /> {findings.length ? 'Every finding handled.' : 'Nothing personal or sensitive found.'}</li>
            )}
          </ul>

          <div className="scr-decide">
            <span className="scr-label">Where does it go?</span>
            <label className={'scr-toggle' + (!allowed.ok ? ' is-disabled' : '')}>
              <input type="checkbox" checked={publish && allowed.ok} disabled={!allowed.ok} onChange={(e) => setPublish(e.target.checked)} />
              <span><Globe size={13} /> Publish to the public website {allowed.ok ? <em>— as “{summary.title}”</em> : <em>— {allowed.reason}</em>}</span>
            </label>
            <label className="scr-toggle">
              <input type="checkbox" checked={send} onChange={(e) => setSend(e.target.checked)} />
              <span><Send size={13} /> Send to the publisher queue <em>— so they can make media from it</em></span>
            </label>
            {send && (
              <label className="scr-brief">
                <span>Brief for the publisher</span>
                <textarea
                  rows={3}
                  value={brief}
                  placeholder="What this is, what matters in it, anything to leave out. They have not read the field report."
                  onChange={(e) => setBrief(e.target.value)}
                />
              </label>
            )}
            {open.length > 0 && <p className="scr-warn"><AlertTriangle size={12} /> {open.length} finding{open.length === 1 ? '' : 's'} still open — redact or keep each before it goes.</p>}
            {err && <p className="scr-err">{err}</p>}
            <button type="button" className="stu-primary scr-confirm" onClick={confirm} disabled={busy || open.length > 0}>
              {busy ? <Loader2 size={15} className="spin" /> : <ShieldCheck size={15} />}
              {publish && allowed.ok && send ? 'Publish and send to publishers' : send ? 'Send to publishers' : publish && allowed.ok ? 'Publish' : 'Save redactions'}
            </button>
            <p className="scr-muted">{redactedCount} redaction{redactedCount === 1 ? '' : 's'}{withheld.size ? ` · ${withheld.size} photo${withheld.size === 1 ? '' : 's'} withheld` : ''}. The original words move to an admin-only record; publishers only ever see the redacted text.</p>
          </div>
        </section>
      </div>
    </main>
  );
}

/**
 * One field's text, with open findings highlighted and placeholders shown as
 * redaction bars. Selecting words offers "Redact as…" — the offsets come from
 * the rendered text, which is exactly the working text (highlights and bars
 * add no characters), so a selection maps straight back to the string.
 */
function FieldEditor({ label, text, findings, focus, onFocus, onRedactRange }: {
  label: string;
  text: string;
  findings: Finding[];
  focus: string | null;
  onFocus: (id: string | null) => void;
  onRedactRange: (start: number, end: number, category: ScreenCategory) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<{ start: number; end: number; x: number; y: number } | null>(null);

  /* Segments: placeholders first (they are fixed), then each open finding's
   * occurrences, earliest first, never overlapping. */
  const segments = useMemo(() => {
    const marks: { s: number; e: number; kind: 'token' | 'finding'; f?: Finding }[] = [];
    for (const m of text.matchAll(TOKEN_PATTERN)) marks.push({ s: m.index!, e: m.index! + m[0].length, kind: 'token' });
    for (const f of findings) {
      let at = text.indexOf(f.quote);
      while (at >= 0) {
        marks.push({ s: at, e: at + f.quote.length, kind: 'finding', f });
        at = text.indexOf(f.quote, at + f.quote.length);
      }
    }
    marks.sort((a, b) => a.s - b.s || (a.kind === 'token' ? -1 : 1));
    const out: { text: string; kind: 'plain' | 'token' | 'finding'; f?: Finding }[] = [];
    let pos = 0;
    for (const m of marks) {
      if (m.s < pos) continue;
      if (m.s > pos) out.push({ text: text.slice(pos, m.s), kind: 'plain' });
      out.push({ text: text.slice(m.s, m.e), kind: m.kind, f: m.f });
      pos = m.e;
    }
    if (pos < text.length) out.push({ text: text.slice(pos), kind: 'plain' });
    return out;
  }, [text, findings]);

  const onMouseUp = () => {
    const s = window.getSelection();
    const el = box.current;
    if (!s || s.isCollapsed || !el || !el.contains(s.anchorNode) || !el.contains(s.focusNode)) { setSel(null); return; }
    const range = s.getRangeAt(0);
    const pre = document.createRange();
    pre.selectNodeContents(el);
    pre.setEnd(range.startContainer, range.startOffset);
    const start = pre.toString().length;
    const raw = range.toString();
    // Trim whitespace at the edges of the selection.
    const lead = raw.length - raw.trimStart().length;
    const trail = raw.length - raw.trimEnd().length;
    const s0 = start + lead;
    const e0 = start + raw.length - trail;
    if (e0 <= s0) { setSel(null); return; }
    const rect = range.getBoundingClientRect();
    const host = el.getBoundingClientRect();
    setSel({ start: s0, end: e0, x: Math.max(0, rect.left - host.left), y: rect.bottom - host.top + 6 });
  };

  return (
    <div className="scr-field">
      <span className="scr-label">{label}</span>
      <div className="scr-text" ref={box} onMouseUp={onMouseUp}>
        {segments.map((seg, i) =>
          seg.kind === 'token' ? <span key={i} className="scr-token">{seg.text}</span>
          : seg.kind === 'finding' ? (
            <mark key={i} className={`sev-${seg.f!.severity}` + (focus === seg.f!.id ? ' is-focus' : '')}
              onMouseEnter={() => onFocus(seg.f!.id)} onMouseLeave={() => onFocus(null)} title={`${CATEGORY_LABEL[seg.f!.category]}: ${seg.f!.reason}`}>
              {seg.text}
            </mark>
          ) : <span key={i}>{seg.text}</span>,
        )}
        {sel && (
          <div className="scr-selbar" style={{ left: sel.x, top: sel.y }} onMouseDown={(e) => e.preventDefault()}>
            <span>Redact as</span>
            {QUICK.map((c) => (
              <button key={c} type="button" onClick={() => { onRedactRange(sel.start, sel.end, c); setSel(null); window.getSelection()?.removeAllRanges(); }}>
                {c === 'other' ? 'Other' : CATEGORY_LABEL[c].split(' ')[0]}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
