/**
 * Editor for a deposit — a document in `documents`, i.e. what a scientist
 * uploaded, before/independently of anything being published.
 *
 * RecordEditor is the equivalent for `publicArchive` and cannot serve here:
 * the two collections hold different shapes, and a published record's raw/
 * redacted split has no meaning for a deposit that was never projected.
 *
 * What is editable is exactly what firestore.rules already permits without
 * change: the descriptive fields. `status` is deliberately not offered —
 * moving a deposit through review is Moderation's job, and the admin branch
 * of the rule only tolerates a write here because status is passed through
 * untouched.
 */

import { useState } from 'react';
import { X } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { CATEGORIES } from '../types';
import type { ResearchDocument, License, Embargo } from '../types';
import './RecordEditor.css';

const LICENSES: License[] = ['CC BY 4.0', 'CC0', 'CC BY-NC 4.0'];
const EMBARGOES: { value: Embargo; label: string }[] = [
  { value: 'none', label: 'No embargo' },
  { value: 'project-end', label: 'Until project end' },
  { value: '1-year', label: 'One year' },
  { value: '5-years', label: 'Five years' },
];

/** firestore.rules caps a description at 500 characters on both the create
 *  and owner-update paths; matching it here turns a rejected write into an
 *  ordinary character counter. */
const DESC_LIMIT = 500;

export function DepositEditor({
  deposit,
  onClose,
  onSaved,
}: {
  deposit: ResearchDocument;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(deposit.title);
  const [description, setDescription] = useState(deposit.description);
  const [category, setCategory] = useState(deposit.category);
  const [instrument, setInstrument] = useState(deposit.instrument ?? '');
  const [license, setLicense] = useState<License>(deposit.license ?? 'CC BY 4.0');
  const [embargo, setEmbargo] = useState<Embargo>(deposit.embargo ?? 'none');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tooLong = description.trim().length > DESC_LIMIT;
  const incomplete = !title.trim() || !description.trim();

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateDoc(doc(db, 'documents', deposit.id), {
        title: title.trim(),
        description: description.trim(),
        category,
        instrument: instrument.trim() || null,
        license,
        embargo,
        /* Written back unchanged on purpose. The admin branch of the update
           rule requires status to be one of the three valid values, and a
           deposit uploaded before the review gate existed has no status
           field at all — which would fail the rule on an otherwise valid
           edit. 'published' matches how such records already display. */
        status: deposit.status ?? 'published',
      });
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
            <span className="re-head-kicker">Deposit · {deposit.fileName || deposit.id}</span>
            <h2>{deposit.title}</h2>
          </div>
          <button type="button" className="re-close" onClick={onClose} aria-label="Close editor">
            <X size={16} strokeWidth={2.5} />
          </button>
        </div>

        <div className="re-columns re-columns--single">
          <div className="re-col">
            <span className="re-col-label">Catalogue entry</span>

            <label className="re-field">
              <span>Title</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>

            <label className="re-field">
              <span>
                Description
                <em className={tooLong ? 'de-over' : undefined}>
                  {description.trim().length}/{DESC_LIMIT}
                </em>
              </span>
              <textarea
                rows={5}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>

            <label className="re-field">
              <span>Category</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>

            <label className="re-field">
              <span>Instrument or method</span>
              <input
                value={instrument}
                placeholder="e.g. HOBO U22 logger"
                onChange={(e) => setInstrument(e.target.value)}
              />
            </label>

            <label className="re-field">
              <span>Licence</span>
              <select value={license} onChange={(e) => setLicense(e.target.value as License)}>
                {LICENSES.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </label>

            <label className="re-field">
              <span>Embargo</span>
              <select value={embargo} onChange={(e) => setEmbargo(e.target.value as Embargo)}>
                {EMBARGOES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>

            <p className="re-raw-subhead">
              Station, coordinates, the attached file and who deposited it are part of the
              submission itself and are not edited here. Moving this through review is done
              from Moderation.
            </p>
          </div>
        </div>

        {error && <p className="re-error">{error}</p>}

        <div className="re-actions">
          <button type="button" className="ph-btn ghost" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="ph-btn"
            onClick={save}
            disabled={saving || incomplete || tooLong}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
