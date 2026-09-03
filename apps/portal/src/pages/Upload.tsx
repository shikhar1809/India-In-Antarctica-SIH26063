import { useNavigate } from 'react-router-dom';
import { useState, type FormEvent } from 'react';
import { Check } from 'lucide-react';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db, storage } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { CATEGORIES, STATIONS, LICENSES, EMBARGO_OPTIONS } from '../types';
import type { DocumentStatus } from '../types';
import './Upload.css';

const MAX_SIZE = 50 * 1024 * 1024;
const DESC_MAX = 500;

/** Today's date in local time as a datetime-local input value */
function todayLocal(): string {
  const d = new Date();
  d.setSeconds(0, 0);
  return d.toISOString().slice(0, 16);
}

export function Upload() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // ── When & Where ──────────────────────────────────────────────────────
  const [observedAt, setObservedAt] = useState(todayLocal());
  const [station, setStation] = useState<string>(STATIONS[0]);
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');

  // ── What ──────────────────────────────────────────────────────────────
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [instrument, setInstrument] = useState('');

  // ── Access ────────────────────────────────────────────────────────────
  const [license, setLicense] = useState<string>(LICENSES[0]);
  const [embargo, setEmbargo] = useState<string>(EMBARGO_OPTIONS[0].value);

  // ── File & state ──────────────────────────────────────────────────────
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const reset = () => {
    setObservedAt(todayLocal());
    setStation(STATIONS[0]);
    setLat(''); setLon('');
    setTitle(''); setDescription('');
    setCategory(CATEGORIES[0]);
    setInstrument('');
    setLicense(LICENSES[0]);
    setEmbargo(EMBARGO_OPTIONS[0].value);
    setFile(null);
    setProgress(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (!user) return;
    if (!file) { setError('Attach a file before submitting.'); return; }
    if (file.size > MAX_SIZE) { setError('File exceeds the 50 MB limit.'); return; }
    if (!title.trim()) { setError('Title is required.'); return; }
    if (!description.trim()) { setError('Description is required (1–2 sentences).'); return; }
    if (!observedAt) { setError('Observation date/time is required.'); return; }

    const parsedLat = lat.trim() ? parseFloat(lat) : null;
    const parsedLon = lon.trim() ? parseFloat(lon) : null;
    if (lat.trim() && (isNaN(parsedLat!) || parsedLat! < -90 || parsedLat! > 90)) {
      setError('Latitude must be between -90 and 90.'); return;
    }
    if (lon.trim() && (isNaN(parsedLon!) || parsedLon! < -180 || parsedLon! > 180)) {
      setError('Longitude must be between -180 and 180.'); return;
    }

    setProgress(0);
    try {
      const path = `research/${user.uid}/${Date.now()}-${file.name}`;
      const storageRef = ref(storage, path);
      const task = uploadBytesResumable(storageRef, file);

      await new Promise<void>((resolve, reject) => {
        task.on(
          'state_changed',
          (snap) => setProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
          reject,
          () => resolve()
        );
      });

      const fileUrl = await getDownloadURL(storageRef);

      await addDoc(collection(db, 'documents'), {
        title: title.trim(),
        description: description.trim(),
        category,
        instrument: instrument.trim(),
        station,
        observedAt: new Date(observedAt).getTime(),
        lat: parsedLat,
        lon: parsedLon,
        license,
        embargo,
        fileName: file.name,
        fileUrl,
        fileSizeBytes: file.size,
        authorUid: user.uid,
        authorName: user.displayName ?? 'Unnamed contributor',
        authorEmail: user.email ?? '',
        // Everything arrives unreviewed. An admin publishes it from
        // Moderation → Repository; firestore.rules enforces that nobody can
        // self-publish, so this isn't only a UI convention.
        status: 'submitted' satisfies DocumentStatus,
        reviewNotes: null,
        createdAt: Date.now(),
        createdAtServer: serverTimestamp()
      });

      setSuccess(true);
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed — try again.');
    } finally {
      setProgress(null);
    }
  };

  if (success) {
    return (
      <div className="ph-page ph-center">
        <div className="up-done">
          <span className="up-done-mark"><Check size={26} strokeWidth={2.5} /></span>
          <h1>Record submitted</h1>
          <p>It's now in the archive, attributed to your account.</p>
          <div className="up-done-actions">
            <button className="ph-btn primary" onClick={() => setSuccess(false)}>Submit another</button>
            <button className="ph-btn ghost" onClick={() => navigate('/mine')}>My records</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ph-page ph-center">
      <div className="up-wrap">
        <h1 className="up-title">Submit a record</h1>
        <p className="up-sub">
          Signed in as <b>{user?.displayName ?? user?.email}</b>. Fill in the structured
          metadata — the archive follows AADC/PANGAEA conventions so records stay
          discoverable and citable.
        </p>

        <form className="up-form" onSubmit={handleSubmit}>

          {/* ── Section 1: When & Where ─────────────────────────────── */}
          <div className="up-section-head">When &amp; Where</div>

          <label>
            Observation date / time (UTC)
            <span className="up-hint">When the data was collected — not today's date unless you're uploading live.</span>
            <input
              type="datetime-local"
              value={observedAt}
              onChange={(e) => setObservedAt(e.target.value)}
              required
            />
          </label>

          <label>
            Station
            <select value={station} onChange={(e) => setStation(e.target.value)}>
              {STATIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>

          <div className="up-row">
            <label>
              Latitude <span className="up-hint">(decimal, e.g. -70.771)</span>
              <input
                type="number"
                step="any"
                min="-90"
                max="90"
                placeholder="-70.771"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
              />
            </label>
            <label>
              Longitude <span className="up-hint">(decimal, e.g. 11.832)</span>
              <input
                type="number"
                step="any"
                min="-180"
                max="180"
                placeholder="11.832"
                value={lon}
                onChange={(e) => setLon(e.target.value)}
              />
            </label>
          </div>

          {/* ── Section 2: What ──────────────────────────────────────── */}
          <div className="up-section-head">What</div>

          <label>
            Title
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Sea-ice thickness transect — Prydz Bay, Jan 2026"
              required
            />
          </label>

          <label>
            Description <span className="up-hint">1–2 sentences — what the record contains and why it matters ({DESC_MAX - description.length} chars left)</span>
            <textarea
              rows={3}
              maxLength={DESC_MAX}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this dataset captures, and the key finding or observation it documents."
              required
            />
          </label>

          <div className="up-row">
            <label>
              Category
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label>
              Method / Instrument
              <input
                type="text"
                value={instrument}
                onChange={(e) => setInstrument(e.target.value)}
                placeholder="e.g. EM-31, CTD, field notebook"
              />
            </label>
          </div>

          {/* ── Section 3: Access ────────────────────────────────────── */}
          <div className="up-section-head">Access</div>

          <div className="up-row">
            <label>
              License
              <select value={license} onChange={(e) => setLicense(e.target.value)}>
                {LICENSES.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </label>
            <label>
              Embargo
              <select value={embargo} onChange={(e) => setEmbargo(e.target.value)}>
                {EMBARGO_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
          </div>

          {embargo !== 'none' && (
            <p className="up-embargo-note">
              Embargo restricts public access for the selected period. Metadata stays visible; the file download is gated. Embargoes are reviewed exceptions — use "None" unless you have a specific reason.
            </p>
          )}

          {/* ── Section 4: File ──────────────────────────────────────── */}
          <div className="up-section-head">File</div>

          <label>
            Attach file <span className="up-hint">(PDF, CSV, image, NetCDF, spreadsheet — up to 50 MB)</span>
            <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
          </label>

          {file && (
            <p className="up-file-name">
              {file.name} — {(file.size / 1024 / 1024).toFixed(1)} MB
            </p>
          )}

          {progress !== null && (
            <div className="up-progress">
              <div className="up-progress-bar" style={{ width: `${progress}%` }} />
              <span>{progress}%</span>
            </div>
          )}

          {error && <p className="up-error">{error}</p>}

          <button className="ph-btn primary" type="submit" disabled={progress !== null}>
            {progress !== null ? 'Uploading…' : 'Submit record'}
          </button>
        </form>
      </div>
    </div>
  );
}
