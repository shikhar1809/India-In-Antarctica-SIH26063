/**
 * Raw vs. redacted — editing an already-published record.
 *
 * Everything up to now edits a record BEFORE it goes live (Social.tsx's
 * ComposeView, the ApproveTab). This is the missing case after that: a
 * record is live, something in it needs fixing — a typo, a figure that was
 * wrong, a paragraph that reads too short — and there was no way to touch
 * it without a console visit.
 *
 * The raw side is read-only and resolved from the record's own
 * `metadata.provenance` — it already knows which dispatch or document it
 * came from, so there is nothing new to wire up to find it. The redacted
 * side is exactly what publish.ts already writes to `publicArchive`:
 * title, body paragraphs, table. Saving calls `updatePublishedRecord`,
 * which only ever touches those three fields.
 */

import { Fragment, useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { Check, Plus, Trash2, X } from 'lucide-react';
import { db } from '../firebase';
import type { Dispatch, ResearchDocument } from '../types';
import { MEASUREMENT_SCHEMA } from '../types';
import type { RepositoryRecord, RecordFact } from '../repository/contract';
import { updatePublishedRecord } from '../repository/publish';
import './RecordEditor.css';

interface RecordEditorProps {
  record: RepositoryRecord;
  onClose: () => void;
  onSaved: () => void;
}

type RawSource =
  | { kind: 'loading' }
  | { kind: 'none'; reason: string }
  | { kind: 'error'; message: string }
  | { kind: 'dispatch'; data: Dispatch }
  | { kind: 'document'; data: ResearchDocument };

/** One weather line, the same shorthand used across the portal's other
 *  dispatch views (Social.tsx keeps a private copy of this same idea). */
function weatherLine(w: Dispatch['weather']): string | null {
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

export function RecordEditor({ record, onClose, onSaved }: RecordEditorProps) {
  const [raw, setRaw] = useState<RawSource>({ kind: 'loading' });
  const [title, setTitle] = useState(record.title);
  const [body, setBody] = useState<string[]>(record.body.length ? [...record.body] : ['']);
  const [table, setTable] = useState<RecordFact[]>(record.table ? [...record.table] : []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const { sourceType, sourceId } = record.metadata.provenance;

    if (sourceType === 'historical') {
      setRaw({ kind: 'none', reason: 'This record was imported from the founding historical catalogue — it has no field submission behind it to compare against.' });
      return;
    }

    (async () => {
      try {
        const collection = sourceType === 'dispatch' ? 'dispatches' : 'documents';
        const snap = await getDoc(doc(db, collection, sourceId));
        if (cancelled) return;
        if (!snap.exists()) {
          setRaw({ kind: 'none', reason: 'The original submission this was published from no longer exists.' });
          return;
        }
        const data = { id: snap.id, ...snap.data() };
        setRaw(sourceType === 'dispatch' ? { kind: 'dispatch', data: data as Dispatch } : { kind: 'document', data: data as ResearchDocument });
      } catch (err) {
        if (!cancelled) setRaw({ kind: 'error', message: err instanceof Error ? err.message : 'Could not load the original submission.' });
      }
    })();

    return () => { cancelled = true; };
  }, [record.id, record.metadata.provenance]);

  const updateBody = (i: number, value: string) => setBody((prev) => prev.map((p, idx) => (idx === i ? value : p)));
  const addParagraph = () => setBody((prev) => [...prev, '']);
  const removeParagraph = (i: number) => setBody((prev) => prev.filter((_, idx) => idx !== i));

  const updateFact = (i: number, field: 'label' | 'value', value: string) =>
    setTable((prev) => prev.map((f, idx) => (idx === i ? { ...f, [field]: value } : f)));
  const addFact = () => setTable((prev) => [...prev, { label: '', value: '' }]);
  const removeFact = (i: number) => setTable((prev) => prev.filter((_, idx) => idx !== i));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await updatePublishedRecord(record.id, {
        title: title.trim(),
        body: body.map((p) => p.trim()).filter(Boolean),
        table: table.filter((f) => f.label.trim() && f.value.trim()),
      });
      setSaved(true);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save — try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="re-scrim" onClick={onClose}>
      <div className="re-panel" onClick={(e) => e.stopPropagation()}>
        <div className="re-head">
          <div>
            <span className="re-head-kicker">{record.metadata.identifier}</span>
            <h2>{record.title}</h2>
          </div>
          <button type="button" className="re-close" onClick={onClose} aria-label="Close">
            <X size={16} strokeWidth={2.5} />
          </button>
        </div>

        <div className="re-columns">
          {/* ── raw: what was actually submitted ── */}
          <div className="re-col re-col-raw">
            <span className="re-col-label">Original submission</span>
            <RawPanel raw={raw} />
          </div>

          {/* ── redacted: what the public sees, editable ── */}
          <div className="re-col re-col-redacted">
            <span className="re-col-label">Public page</span>

            <label className="re-field">
              <span>Title</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>

            <label className="re-field">
              <span>Body</span>
              <div className="re-paragraphs">
                {body.map((p, i) => (
                  <div className="re-paragraph-row" key={i}>
                    <textarea rows={3} value={p} onChange={(e) => updateBody(i, e.target.value)} />
                    <button type="button" className="re-icon-btn" onClick={() => removeParagraph(i)} aria-label="Remove paragraph" disabled={body.length <= 1}>
                      <Trash2 size={13} strokeWidth={2.5} />
                    </button>
                  </div>
                ))}
                <button type="button" className="re-add-btn" onClick={addParagraph}>
                  <Plus size={13} strokeWidth={2.5} /> Add paragraph
                </button>
              </div>
            </label>

            <label className="re-field">
              <span>Key facts</span>
              <div className="re-table-edit">
                {table.map((f, i) => (
                  <div className="re-table-row" key={i}>
                    <input placeholder="Label" value={f.label} onChange={(e) => updateFact(i, 'label', e.target.value)} />
                    <input placeholder="Value" value={f.value} onChange={(e) => updateFact(i, 'value', e.target.value)} />
                    <button type="button" className="re-icon-btn" onClick={() => removeFact(i)} aria-label="Remove fact">
                      <Trash2 size={13} strokeWidth={2.5} />
                    </button>
                  </div>
                ))}
                <button type="button" className="re-add-btn" onClick={addFact}>
                  <Plus size={13} strokeWidth={2.5} /> Add fact
                </button>
              </div>
            </label>
          </div>
        </div>

        {error && <p className="re-error">{error}</p>}

        <div className="re-actions">
          <button type="button" className="ph-btn ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="ph-btn primary" onClick={save} disabled={saving || !title.trim()}>
            {saved ? <><Check size={14} strokeWidth={2.5} /> Saved</> : saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RawPanel({ raw }: { raw: RawSource }) {
  if (raw.kind === 'loading') return <p className="re-raw-empty">Loading the original submission…</p>;
  if (raw.kind === 'error') return <p className="re-raw-empty re-raw-error">{raw.message}</p>;
  if (raw.kind === 'none') return <p className="re-raw-empty">{raw.reason}</p>;

  if (raw.kind === 'dispatch') {
    const d = raw.data;
    const met = weatherLine(d.weather);
    const readings = (MEASUREMENT_SCHEMA[d.activity] ?? [])
      .map((f) => [f.label, d.measurements?.[f.id], f.unit] as const)
      .filter((r): r is readonly [string, string, string | undefined] => !!r[1]);

    return (
      <div className="re-raw">
        <dl className="re-raw-dl">
          <dt>Field scientist</dt><dd>{d.authorName}</dd>
          <dt>Station</dt><dd>{d.station}</dd>
          <dt>Activity</dt><dd>{d.activity}</dd>
          {met && (<><dt>Conditions</dt><dd>{met}</dd></>)}
        </dl>
        {readings.length > 0 && (
          <>
            <span className="re-raw-subhead">Measurements</span>
            <dl className="re-raw-dl">
              {readings.map(([label, value, unit]) => (
                <Fragment key={label}>
                  <dt>{label}</dt>
                  <dd>{unit ? `${value} ${unit}` : value}</dd>
                </Fragment>
              ))}
            </dl>
          </>
        )}
        <span className="re-raw-subhead">Field notes</span>
        <p className="re-raw-notes">{d.notes || <em>No notes recorded.</em>}</p>
      </div>
    );
  }

  // sourceType === 'document'
  const docRec = raw.data;
  return (
    <div className="re-raw">
      <dl className="re-raw-dl">
        <dt>Submitted by</dt><dd>{docRec.authorName}</dd>
        <dt>Category</dt><dd>{docRec.category}</dd>
        <dt>File</dt><dd>{docRec.fileName}</dd>
      </dl>
      <span className="re-raw-subhead">Description (as submitted)</span>
      <p className="re-raw-notes">{docRec.description}</p>
      {docRec.fullText && (
        <>
          <span className="re-raw-subhead">Full report (as submitted)</span>
          {docRec.fullText.split(/\n\s*\n/).filter(Boolean).map((p, i) => (
            <p className="re-raw-notes" key={i}>{p.trim()}</p>
          ))}
        </>
      )}
    </div>
  );
}
