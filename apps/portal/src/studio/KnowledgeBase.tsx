/**
 * Build a post out of something already in the archive.
 *
 * Not every post follows a fresh field report. An anniversary, a dataset
 * worth resurfacing, a station's founding — the material is already
 * published, described and citable, and retyping it into the brief by hand
 * both wastes the publisher's time and invites the errors that come from
 * working off memory.
 *
 * Picking a record here does two things. The record's own facts — title,
 * station, year, key figures — become the brief the generator writes from,
 * so it is working from what the archive actually says rather than from
 * whatever it recalls about Antarctic science. And the record's permanent
 * public address is carried alongside as a `PostSource`, to be appended to
 * the finished captions afterwards. The model is never asked to produce the
 * link, because inventing plausible URLs is the thing it is worst at.
 *
 * Search is the portal's own `semanticRank`, so "penguins" finds a record
 * filed as "Wildlife observation" and a typo still lands.
 */

import { useMemo, useState } from 'react';
import { Link2, Search } from 'lucide-react';
import { usePublicArchive } from '../hooks/usePublicArchive';
import { prepare, semanticRank } from '../repository/semanticSearch';
import { describeRecordForBrief, recordUrl, type PostSource } from './copy';
import type { RepositoryRecord } from '../repository/contract';
import './KnowledgeBase.css';

/** Weighted so a title match beats a mention buried in the body. */
function fieldsOf(r: RepositoryRecord) {
  return prepare([
    { text: r.title ?? '', weight: 3 },
    { text: (r.pills ?? []).join(' '), weight: 2 },
    { text: r.kind ?? '', weight: 2 },
    { text: r.metadata?.station ?? '', weight: 2 },
    { text: r.year ?? '', weight: 2 },
    { text: (r.body ?? []).join(' '), weight: 1 },
  ]);
}

export function KnowledgeBase({
  onPick,
}: {
  onPick: (material: string, source: PostSource) => void;
}) {
  const { records, loading } = usePublicArchive();
  const [query, setQuery] = useState('');
  const [pickedId, setPickedId] = useState<string | null>(null);

  const prepared = useMemo(() => {
    const m = new Map<string, ReturnType<typeof prepare>>();
    for (const r of records) m.set(r.id, fieldsOf(r));
    return m;
  }, [records]);

  const results = useMemo(
    () =>
      semanticRank(records, query, (r) => prepared.get(r.id)!)
        .slice(0, 8)
        .map((s) => s.item),
    [records, query, prepared],
  );

  const pick = (r: RepositoryRecord) => {
    const identifier = r.metadata?.identifier ?? r.id;
    setPickedId(r.id);
    onPick(
      describeRecordForBrief({
        title: r.title,
        body: r.body,
        year: r.year,
        station: r.metadata?.station,
        kind: r.kind,
        measurements: r.measurements,
        table: r.table,
      }),
      { identifier, title: r.title, url: recordUrl(identifier) },
    );
  };

  return (
    <div className="kb">
      <div className="kb-search">
        <Search size={14} strokeWidth={2.5} />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={loading ? 'Loading the archive…' : 'Search the archive — ozone, Maitri, penguins, 1998…'}
          disabled={loading}
        />
      </div>

      {!loading && results.length === 0 && (
        <p className="kb-empty">
          {query.trim()
            ? 'Nothing in the archive matches that.'
            : 'Start typing to search published records and datasets.'}
        </p>
      )}

      <ul className="kb-list">
        {results.map((r) => {
          const identifier = r.metadata?.identifier ?? r.id;
          return (
            <li key={r.id}>
              <button
                type="button"
                className={'kb-item' + (pickedId === r.id ? ' is-picked' : '')}
                onClick={() => pick(r)}
              >
                <span className="kb-item-head">
                  <code>{identifier}</code>
                  <span className="kb-kind">{r.kind}</span>
                </span>
                <strong>{r.title}</strong>
                <span className="kb-meta">
                  {[r.metadata?.station, r.year].filter(Boolean).join(' · ')}
                  {pickedId === r.id && (
                    <span className="kb-picked"><Link2 size={11} strokeWidth={2.5} /> added to the brief</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
