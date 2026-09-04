import { useMemo, useState } from 'react';
import { Download, MapPin, Sparkles } from 'lucide-react';
import { useDocuments } from '../hooks/useDocuments';
import { useRole } from '../hooks/useRole';
import { CATEGORIES } from '../types';
import type { DocumentStatus } from '../types';
import { HISTORICAL_RECORDS } from '../repository/historicalRecords';
import { publishRecord } from '../repository/publish';
import './Library.css';

const STATION_GRADIENT: Record<string, string> = {
  Maitri:            'linear-gradient(135deg, #0d2b3e 0%, #1a4a6e 60%, #2f9fc9 100%)',
  Bharati:           'linear-gradient(135deg, #2a1800 0%, #6b3600 60%, #c8762a 100%)',
  'Dakshin Gangotri':'linear-gradient(135deg, #0d2b1a 0%, #1a5030 60%, #4a9b6f 100%)',
  Other:             'linear-gradient(135deg, #1a1f2e 0%, #2a3448 60%, #4a6080 100%)',
};

const CATEGORY_ICON: Record<string, string> = {
  'Expedition Report': '📋',
  'Dataset':           '📊',
  'Publication':       '📰',
  'Photographs & Video':'📷',
  'Institutional':     '🏛️',
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function coordStr(lat: number | null, lon: number | null): string | null {
  if (lat == null || lon == null) return null;
  const latStr = `${Math.abs(lat).toFixed(3)}°${lat >= 0 ? 'N' : 'S'}`;
  const lonStr = `${Math.abs(lon).toFixed(3)}°${lon >= 0 ? 'E' : 'W'}`;
  return `${latStr}, ${lonStr}`;
}

function mapsUrl(lat: number, lon: number) {
  return `https://www.google.com/maps?q=${lat},${lon}`;
}

const STATUS_LABEL: Record<DocumentStatus, string> = {
  submitted: 'Awaiting review',
  published: 'Published',
  rejected: 'Not accepted',
};

/** Records uploaded before the review gate existed have no status field.
 *  They were already visible, so treating them as published keeps the
 *  catalogue honest rather than retroactively hiding them. */
const statusOf = (s: DocumentStatus | undefined): DocumentStatus => s ?? 'published';

export function Repository() {
  const { docs, loading } = useDocuments();
  const { role } = useRole();
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    return docs.filter((d) => {
      if (activeCategory !== 'All' && d.category !== activeCategory) return false;
      if (q.trim()) {
        const needle = q.trim().toLowerCase();
        return (
          d.title.toLowerCase().includes(needle) ||
          d.description.toLowerCase().includes(needle) ||
          d.station.toLowerCase().includes(needle) ||
          (d.instrument ?? '').toLowerCase().includes(needle) ||
          d.authorName.toLowerCase().includes(needle)
        );
      }
      return true;
    });
  }, [docs, activeCategory, q]);

  return (
    <div className="ph-page">
      <div className="lib-hero">
        <span className="lib-kicker">National Centre for Polar and Ocean Research</span>
        <h1>Knowledge Repository</h1>
        <p>
          Expedition reports, datasets, publications and media contributed by scientists at
          India's Antarctic research stations — Maitri, Bharati and the legacy Dakshin
          Gangotri record. Every record carries its own licence, provenance and citable
          identifier.
        </p>
      </div>

      {role === 'admin' && <HistoricalImport />}

      <div className="lib-controls">
        <input
          className="lib-search"
          placeholder="Search title, description, station, instrument…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="lib-cats">
          {['All', ...CATEGORIES].map((c) => (
            <button
              key={c}
              className={'lib-cat' + (activeCategory === c ? ' active' : '')}
              onClick={() => setActiveCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="lib-empty">Loading the repository…</p>
      ) : filtered.length === 0 ? (
        <p className="lib-empty">
          {docs.length === 0
            ? 'Nothing deposited yet — sign in and be the first to contribute a record.'
            : 'No records match that search.'}
        </p>
      ) : (
        <div className="lib-grid">
          {filtered.map((d) => {
            const coords = coordStr(d.lat ?? null, d.lon ?? null);
            const observedDate = d.observedAt
              ? new Date(d.observedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
              : new Date(d.createdAt).toLocaleDateString();
            const isEmbargoed = d.embargo && d.embargo !== 'none';
            const status = statusOf(d.status);

            const gradient = STATION_GRADIENT[d.station] ?? STATION_GRADIENT.Other;
            const icon = CATEGORY_ICON[d.category] ?? '📄';

            return (
              <div
                key={d.id}
                className={'lib-card' + (isEmbargoed ? ' embargoed' : '')}
              >
                {/* Station cover header */}
                <div className="lib-card-cover" style={{ background: gradient }}>
                  <span className="lib-card-cover-icon">{icon}</span>
                  <span className="lib-card-cover-station">{d.station}</span>
                </div>

                <div className="lib-card-body">
                  <div className="lib-card-top">
                    <span className="lib-card-cat">{d.category}</span>
                    {d.license && <span className="lib-card-license">{d.license}</span>}
                    {isEmbargoed && <span className="lib-card-embargo">Embargoed</span>}
                    {status !== 'published' && (
                      <span className={'lib-card-status status-' + status}>{STATUS_LABEL[status]}</span>
                    )}
                  </div>

                  <h3>{d.title}</h3>
                  <p className="lib-card-desc">{d.description}</p>

                  <div className="lib-card-attrs">
                    <span className="lib-card-attr">
                      <span className="lib-attr-icon"><MapPin size={12} strokeWidth={2} /></span>
                      {d.station}
                      {coords && (
                        <a
                          href={mapsUrl(d.lat!, d.lon!)}
                          target="_blank"
                          rel="noreferrer"
                          className="lib-coord-link"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {coords}
                        </a>
                      )}
                    </span>
                    {d.instrument && (
                      <span className="lib-card-attr">
                        <span className="lib-attr-icon">🔬</span>
                        {d.instrument}
                      </span>
                    )}
                  </div>

                  <div className="lib-card-meta">
                    <span>{d.authorName}</span>
                    <span>·</span>
                    <span>Observed {observedDate}</span>
                  </div>

                  {/* File download chip */}
                  {d.fileUrl && !isEmbargoed && (
                    <a
                      className="lib-card-file"
                      href={d.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Download size={12} strokeWidth={2.5} />
                      <span className="lib-card-file-name">{d.fileName}</span>
                      {d.fileSizeBytes > 0 && (
                        <span className="lib-card-file-size">{formatBytes(d.fileSizeBytes)}</span>
                      )}
                    </a>
                  )}
                  {isEmbargoed && (
                    <span className="lib-card-file embargoed-file">
                      <span>🔒</span> Embargoed — available {d.embargo}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────── historical import ──
 * India's Antarctic programme has a record going back to 1981, and until now
 * it lived as a hardcoded list inside the public website's source. Importing
 * it into the same collection everything else publishes to means the public
 * archive is one live repository rather than a live page with a static list
 * bolted underneath it. Admin-only, and safe to run twice — each record has a
 * fixed id, so a second run overwrites rather than duplicates. */
function HistoricalImport() {
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const run = async () => {
    setState('working');
    try {
      for (const record of HISTORICAL_RECORDS) {
        await publishRecord(record);
      }
      setState('done');
      setMessage(`${HISTORICAL_RECORDS.length} historical records are now live on the public site.`);
    } catch (e) {
      setState('error');
      setMessage(e instanceof Error ? e.message : 'Import failed.');
    }
  };

  return (
    <div className="lib-admin-tool">
      <div>
        <strong>Historical record import</strong>
        <p>
          Publishes the {HISTORICAL_RECORDS.length} founding records of the Indian Antarctic
          programme — the first expedition, the building of each station, and the datasets and
          publications that came from them — into the public repository. Safe to re-run.
        </p>
      </div>
      <button className="ph-btn ghost small" onClick={run} disabled={state === 'working'}>
        <Sparkles size={14} strokeWidth={2.5} />
        {state === 'working' ? 'Importing…' : state === 'done' ? 'Imported' : 'Import historical records'}
      </button>
      {message && <p className={'lib-admin-msg' + (state === 'error' ? ' error' : '')}>{message}</p>}
    </div>
  );
}
