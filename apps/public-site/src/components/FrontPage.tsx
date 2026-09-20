/**
 * The front page, as a newsroom desk.
 *
 * What used to sit here was a full-screen slideshow: one photograph at a
 * time, a headline, and four more records hidden behind an autoplay timer.
 * It looked like a brochure. This is the other way round — the page opens
 * on what NCPOR has actually published and posted lately, several stories
 * visible at once, the way a paper's section front works: a lead story, a
 * photograph-led centre, two stories down the right, and a row of more
 * underneath.
 *
 * Everything here comes from the Knowledge Repository (publicArchive), live.
 * Nothing is hand-curated, and nothing is invented: a story is a published
 * record, its date is the date it was published, and a platform badge only
 * appears on a record a post was genuinely sent about.
 *
 * Ordering is by *latest activity*, not publication: a record published in
 * January and posted about yesterday is news yesterday. That is the same
 * rule the old hero used to pick its first slide, applied to the whole page.
 */

import { Link } from 'react-router-dom';
import { useRepository, recordSlug } from '../api/repository';
import type { RepositoryRecord } from '../repository/contract';
import { SocialBadge, type SocialPlatform } from './SocialBadge';
import './FrontPage.css';

const STATION_LABEL: Record<string, string> = {
  maitri: 'Maitri',
  bharati: 'Bharati',
  dakshin: 'Dakshin Gangotri',
  ship: 'At sea',
  ncpor: 'NCPOR, Goa',
};

/** The date the reader cares about: when this was last put in front of
 *  them, whether by publishing it or by posting about it. */
function activityAt(r: RepositoryRecord): number {
  const posts = r.socialPosts ?? [];
  return Math.max(r.publishedAt ?? 0, ...posts.map((p) => p.postedAt ?? 0));
}

function dateLine(ts: number): string {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Platforms a record was actually posted to, most recent first. */
function platformsOf(r: RepositoryRecord): SocialPlatform[] {
  return [...new Set(
    [...(r.socialPosts ?? [])].sort((a, b) => b.postedAt - a.postedAt).map((p) => p.platform as SocialPlatform),
  )];
}

/** The standfirst under a headline: the record's own opening sentence,
 *  trimmed to a sentence or two. Never a summary we wrote. */
function standfirst(r: RepositoryRecord, max = 150): string {
  const text = (r.body ?? []).join(' ').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf(', '));
  return (stop > 60 ? cut.slice(0, stop) : cut).trimEnd() + '…';
}

function Kicker({ record }: { record: RepositoryRecord }) {
  const station = STATION_LABEL[record.metadata?.station ?? ''] ?? '';
  return (
    <span className="fp-kicker">
      <b>{record.kind || 'Record'}</b>
      {station && <span className="fp-kicker-sep">{station}</span>}
    </span>
  );
}

function Posted({ record }: { record: RepositoryRecord }) {
  const platforms = platformsOf(record);
  if (!platforms.length) return null;
  return (
    <span className="fp-posted" title="Posted to social media from the outreach portal">
      {platforms.map((p) => <SocialBadge key={p} platform={p} iconOnly />)}
    </span>
  );
}

/* ── the three shapes a story takes on this page ──────────────────────── */

/** The lead, left column: words only, the way a section front's left rail
 *  runs text against the centre photograph. */
function LeadStory({ record }: { record: RepositoryRecord }) {
  return (
    <Link to={`/archive/${recordSlug(record)}`} className="fp-lead">
      <Kicker record={record} />
      <h3>{record.title}</h3>
      <p className="fp-standfirst">{standfirst(record, 190)}</p>
      <span className="fp-meta">{dateLine(activityAt(record))}<Posted record={record} /></span>
    </Link>
  );
}

/** The centre: one large photograph, story underneath it. */
function MainStory({ record }: { record: RepositoryRecord }) {
  return (
    <Link to={`/archive/${recordSlug(record)}`} className="fp-main">
      <figure className="fp-main-figure">
        <img src={record.photoUrls[0]} alt="" loading="eager" />
        {record.credit && <figcaption>{record.credit}</figcaption>}
      </figure>
      <div className="fp-main-body">
        <Kicker record={record} />
        <h2>{record.title}</h2>
        <p className="fp-standfirst">{standfirst(record, 165)}</p>
        <span className="fp-meta">{dateLine(activityAt(record))}<Posted record={record} /></span>
      </div>
    </Link>
  );
}

/** Right column and the strip below: a small photograph over a headline. */
function SideStory({ record, compact = false }: { record: RepositoryRecord; compact?: boolean }) {
  return (
    <Link to={`/archive/${recordSlug(record)}`} className={'fp-side' + (compact ? ' fp-side--compact' : '')}>
      {record.photoUrls?.[0] && (
        <div className="fp-side-photo"><img src={record.photoUrls[0]} alt="" loading="lazy" /></div>
      )}
      <Kicker record={record} />
      <h4>{record.title}</h4>
      <span className="fp-meta">{dateLine(activityAt(record))}<Posted record={record} /></span>
    </Link>
  );
}

export function FrontPage() {
  const { records, loading, error } = useRepository();

  const sorted = [...records].sort((a, b) => activityAt(b) - activityAt(a));
  const withPhoto = sorted.filter((r) => r.photoUrls?.[0]);

  /* The centre photograph earns its place; everything else fills in around
     it in order, and nothing appears twice. */
  const main = withPhoto[0] ?? null;
  const used = new Set(main ? [main.id] : []);
  const take = (n: number, from = sorted) => {
    const out: RepositoryRecord[] = [];
    for (const r of from) {
      if (out.length === n) break;
      if (used.has(r.id)) continue;
      used.add(r.id);
      out.push(r);
    }
    return out;
  };

  const [lead] = take(1);
  const side = take(2, withPhoto);
  const more = take(5);

  if (loading) {
    return <section className="fp-wrap"><p className="fp-note">Loading the latest from the Knowledge Repository…</p></section>;
  }
  if (error || !main) {
    return (
      <section className="fp-wrap">
        <p className="fp-note">
          {error
            ? 'The Knowledge Repository could not be reached just now.'
            : 'Nothing has been published yet. Approved records appear here as soon as they are.'}
        </p>
      </section>
    );
  }

  return (
    <section className="fp-wrap" aria-labelledby="fp-title">
      <header className="fp-masthead">
        <div className="fp-masthead-head">
          <h1 id="fp-title">Latest from the Ice</h1>
          <span className="fp-live" title="Records appear here the moment an admin approves them">
            <i /> Live from the Knowledge Repository
          </span>
        </div>
        <nav className="fp-sections">
          <Link to="/archive">Knowledge Repository</Link>
          <Link to="/gallery">Gallery</Link>
          <Link to="/ask">Ask a Scientist</Link>
          <a href="https://iia-game.web.app" target="_blank" rel="noreferrer">PolarQuest</a>
        </nav>
      </header>

      <div className="fp-grid">
        <div className="fp-col fp-col--lead">{lead && <LeadStory record={lead} />}</div>
        <div className="fp-col fp-col--main"><MainStory record={main} /></div>
        <div className="fp-col fp-col--side">
          {side.map((r) => <SideStory key={r.id} record={r} />)}
        </div>
      </div>

      {more.length > 0 && (
        <section className="fp-more" aria-labelledby="fp-more-title">
          <h2 id="fp-more-title">More from the Knowledge Repository</h2>
          <div className="fp-more-row">
            {more.map((r) => <SideStory key={r.id} record={r} compact />)}
          </div>
        </section>
      )}
    </section>
  );
}

export default FrontPage;
