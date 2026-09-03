import { useMemo, useState } from 'react';
import { MapPin, Sparkles } from 'lucide-react';
import { useDocuments } from '../hooks/useDocuments';
import { useRole } from '../hooks/useRole';
import { CATEGORIES } from '../types';
import type { DocumentStatus } from '../types';
import { HISTORICAL_RECORDS } from '../repository/historicalRecords';
import { publishRecord } from '../repository/publish';
import './Library.css';

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

            return (
              <a
                key={d.id}
                className={'lib-card' + (isEmbargoed ? ' embargoed' : '')}
                href={isEmbargoed ? undefined : d.fileUrl}
                target="_blank"
                rel="noreferrer"
                aria-disabled={isEmbargoed}
                onClick={isEmbargoed ? (e) => e.preventDefault() : undefined}
              >
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
              </a>
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
