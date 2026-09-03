import { useState } from 'react';
import { deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useDocuments } from '../hooks/useDocuments';
import { CATEGORIES, STATIONS, LICENSES, EMBARGO_OPTIONS, type ResearchDocument, type License, type Embargo } from '../types';
import './MyRecords.css';

const DESC_MAX = 500;

function RecordRow({ doc: d }: { doc: ResearchDocument }) {
  const [editing, setEditing] = useState(false);

  // editable fields
  const [title, setTitle] = useState(d.title);
  const [description, setDescription] = useState(d.description);
  const [category, setCategory] = useState(d.category);
  const [station, setStation] = useState(d.station);
  const [instrument, setInstrument] = useState(d.instrument ?? '');
  const [observedAt, setObservedAt] = useState(
    d.observedAt ? new Date(d.observedAt).toISOString().slice(0, 16) : ''
  );
  const [lat, setLat] = useState(d.lat != null ? String(d.lat) : '');
  const [lon, setLon] = useState(d.lon != null ? String(d.lon) : '');
  const [license, setLicense] = useState(d.license ?? LICENSES[0]);
  const [embargo, setEmbargo] = useState(d.embargo ?? EMBARGO_OPTIONS[0].value);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancel = () => {
    setTitle(d.title); setDescription(d.description);
    setCategory(d.category); setStation(d.station);
    setInstrument(d.instrument ?? '');
    setObservedAt(d.observedAt ? new Date(d.observedAt).toISOString().slice(0, 16) : '');
    setLat(d.lat != null ? String(d.lat) : '');
    setLon(d.lon != null ? String(d.lon) : '');
    setLicense(d.license ?? LICENSES[0]);
    setEmbargo(d.embargo ?? EMBARGO_OPTIONS[0].value);
    setError(null); setEditing(false);
  };

  const save = async () => {
    if (!title.trim()) { setError("Title can't be empty."); return; }
    const parsedLat = lat.trim() ? parseFloat(lat) : null;
    const parsedLon = lon.trim() ? parseFloat(lon) : null;
    if (lat.trim() && (isNaN(parsedLat!) || parsedLat! < -90 || parsedLat! > 90)) {
      setError('Latitude must be between -90 and 90.'); return;
    }
    setSaving(true); setError(null);
    try {
      await updateDoc(doc(db, 'documents', d.id), {
        title: title.trim(),
        description: description.trim(),
        category,
        station,
        instrument: instrument.trim(),
        observedAt: observedAt ? new Date(observedAt).getTime() : d.observedAt,
        lat: parsedLat,
        lon: parsedLon,
        license,
        embargo
      });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save changes.');
    } finally { setSaving(false); }
  };

  const remove = async () => {
    if (!confirm('Remove this record from the archive? This cannot be undone.')) return;
    await deleteDoc(doc(db, 'documents', d.id));
  };

  const observedLabel = d.observedAt
    ? new Date(d.observedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : '—';

  if (!editing) {
    return (
      <div className="mr-row">
        <div className="mr-row-main">
          <div className="mr-row-badges">
            <span className="mr-row-cat">{d.category}</span>
            {d.license && <span className="mr-row-license">{d.license}</span>}
            {d.embargo && d.embargo !== 'none' && <span className="mr-row-embargo">Embargoed</span>}
          </div>
          <a href={d.fileUrl} target="_blank" rel="noreferrer" className="mr-row-title">{d.title}</a>
          <span className="mr-row-meta">
            {d.station}
            {d.instrument ? ` · ${d.instrument}` : ''}
            {' · '}Observed {observedLabel}
            {d.lat != null && d.lon != null ? ` · ${d.lat.toFixed(3)}°, ${d.lon.toFixed(3)}°` : ''}
          </span>
        </div>
        <div className="mr-row-actions">
          <button className="ph-btn ghost small" onClick={() => setEditing(true)}>Edit</button>
          <button className="ph-btn ghost small" onClick={remove}>Delete</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mr-row mr-row-editing">
      <div className="mr-section-head">When &amp; Where</div>

      <label>
        Observation date / time (UTC)
        <input type="datetime-local" value={observedAt} onChange={(e) => setObservedAt(e.target.value)} />
      </label>

      <label>
        Station
        <select value={station} onChange={(e) => setStation(e.target.value as ResearchDocument['station'])}>
          {STATIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>

      <div className="mr-row-fields">
        <label>
          Latitude
          <input type="number" step="any" min="-90" max="90" placeholder="-70.771" value={lat} onChange={(e) => setLat(e.target.value)} />
        </label>
        <label>
          Longitude
          <input type="number" step="any" min="-180" max="180" placeholder="11.832" value={lon} onChange={(e) => setLon(e.target.value)} />
        </label>
      </div>

      <div className="mr-section-head">What</div>

      <label>
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>

      <label>
        Description <small>({DESC_MAX - description.length} chars left)</small>
        <textarea rows={3} maxLength={DESC_MAX} value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>

      <div className="mr-row-fields">
        <label>
          Category
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label>
          Method / Instrument
          <input type="text" placeholder="e.g. CTD, EM-31" value={instrument} onChange={(e) => setInstrument(e.target.value)} />
        </label>
      </div>

      <div className="mr-section-head">Access</div>

      <div className="mr-row-fields">
        <label>
          License
          <select value={license} onChange={(e) => setLicense(e.target.value as License)}>
            {LICENSES.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </label>
        <label>
          Embargo
          <select value={embargo} onChange={(e) => setEmbargo(e.target.value as Embargo)}>

            {EMBARGO_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      </div>

      {error && <p className="mr-error">{error}</p>}
      <div className="mr-row-actions">
        <button className="ph-btn primary small" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        <button className="ph-btn ghost small" onClick={cancel} disabled={saving}>Cancel</button>
      </div>
    </div>
  );
}

export function MyRecords() {
  const { user } = useAuth();
  const { docs, loading } = useDocuments();
  const mine = docs.filter((d) => d.authorUid === user?.uid);

  return (
    <div className="ph-page">
      <h1 className="mr-title">Edit my records</h1>
      <p className="mr-sub">Everything you've contributed to the archive. The file itself isn't replaceable here — submit a new record if the data changes.</p>

      {loading ? (
        <p className="mr-empty">Loading…</p>
      ) : mine.length === 0 ? (
        <p className="mr-empty">You haven't submitted anything yet.</p>
      ) : (
        <div className="mr-list">
          {mine.map((d) => <RecordRow key={d.id} doc={d} />)}
        </div>
      )}
    </div>
  );
}
