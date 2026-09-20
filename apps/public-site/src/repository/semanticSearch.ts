/* ═══════════════════════════════════════════════ semantic search ══════
 *
 * Substring matching fails the people who actually use this catalogue. A
 * glaciologist searching "penguins" gets nothing, because the record is
 * filed as "Wildlife observation"; "weather" misses "Katabatic Wind
 * Regimes"; and one typo returns an empty page.
 *
 * This resolves a query to *concepts* rather than characters. Each token is
 * stemmed, expanded through a domain vocabulary of polar-research terms,
 * and scored against weighted fields, so a match can be earned by meaning
 * ("penguin" → wildlife) or by near-spelling ("glacer" → glacier) and not
 * only by literal containment.
 *
 * Deliberately local: it runs on every keystroke over a catalogue of tens
 * of records, so it must be instant and must not depend on the network. It
 * is concept- and spelling-based, not embedding-based — it does not infer
 * meaning for vocabulary outside the map below, which is the honest limit
 * of this approach and the reason CONCEPTS is written to be extended.
 */

/** Related terms in this domain. Any token in a group matches the group, so
 *  every term in it becomes a route to the same records. Extend freely —
 *  a group is just "these words mean roughly the same thing here". */
const CONCEPTS: string[][] = [
  ['ice', 'glacier', 'glaciology', 'glacial', 'iceberg', 'floe', 'crevasse', 'shelf',
   'sheet', 'frozen', 'freeze', 'cryosphere', 'calving', 'stratigraphy', 'core', 'snow', 'firn'],
  ['weather', 'meteorology', 'meteorological', 'atmosphere', 'atmospheric', 'wind',
   'katabatic', 'temperature', 'blizzard', 'storm', 'cloud', 'precipitation', 'climate', 'aws'],
  ['wildlife', 'fauna', 'penguin', 'seal', 'bird', 'krill', 'whale', 'biology', 'biological',
   'species', 'breeding', 'colony', 'census', 'adeliae', 'pygoscelis', 'skua', 'population'],
  ['ocean', 'oceanography', 'oceanographic', 'sea', 'marine', 'ctd', 'salinity', 'current',
   'water', 'hydrography', 'southern', 'bathymetry'],
  ['geology', 'geological', 'rock', 'mineral', 'soil', 'sediment', 'tectonic', 'geomorphology',
   'moraine', 'outcrop', 'lithology', 'petrology'],
  ['logistics', 'supply', 'resupply', 'vessel', 'ship', 'cargo', 'fuel', 'voyage', 'expedition',
   'transport', 'icebreaker', 'charter', 'crew'],
  ['station', 'base', 'camp', 'maitri', 'bharati', 'dakshin', 'gangotri', 'himadri', 'facility',
   'building', 'infrastructure', 'shelter'],
  ['data', 'dataset', 'record', 'measurement', 'observation', 'survey', 'log', 'series',
   'reading', 'sample', 'sampling', 'monitoring'],
  ['publication', 'paper', 'journal', 'article', 'study', 'research', 'analysis', 'report',
   'findings', 'review'],
  ['photo', 'photograph', 'photography', 'image', 'video', 'footage', 'picture', 'media', 'gallery'],
  ['magnetic', 'magnetism', 'aurora', 'ionosphere', 'geomagnetic', 'solar', 'australis', 'space'],
  ['environment', 'environmental', 'pollution', 'contamination', 'conservation', 'protocol', 'impact'],
  ['lake', 'freshwater', 'pond', 'oasis', 'schirmacher', 'larsemann', 'hydrology'],
  /* The Arctic half of the programme: Himadri at Ny-Ålesund, and the work
     NCPOR files under its Arctic holdings. */
  ['arctic', 'himadri', 'svalbard', 'alesund', 'kongsfjorden', 'spitsbergen', 'fjord',
   'permafrost', 'tundra', 'boreal', 'greenland', 'northern'],
  ['aerosol', 'nephelometer', 'carbon', 'soot', 'scattering', 'absorption', 'particulate',
   'radiometer', 'parsivel', 'disdrometer', 'radar', 'sounding', 'ozonesonde', 'dobson'],
  ['mooring', 'buoy', 'sediment', 'trap', 'anchored', 'timeseries', 'profiler'],
  ['microbial', 'microbiology', 'bacteria', 'archaea', 'diversity', 'genomic', 'culture',
   'lichen', 'algae', 'moss', 'extremophile'],
];

/** token → indices of every concept group containing it */
const CONCEPT_INDEX = new Map<string, number[]>();
for (let g = 0; g < CONCEPTS.length; g++) {
  for (const term of CONCEPTS[g]!) {
    const stem = stemOf(term);
    const list = CONCEPT_INDEX.get(stem);
    if (list) list.push(g); else CONCEPT_INDEX.set(stem, [g]);
  }
}

/** Words carrying no discriminating power; matching them would rank every
 *  record equally and drown the signal from the words that matter. */
const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'or', 'in', 'on', 'at', 'to', 'for',
  'from', 'by', 'with', 'is', 'was', 'are', 'be', 'as', 'that', 'this', 'it', 'its']);

/** Crude but sufficient suffix stripping — enough that "glaciers", "glacier"
 *  and "glacial" collapse together without dragging in a stemmer library. */
function stemOf(word: string): string {
  let w = word;
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  for (const suf of ['ical', 'ings', 'tion', 'sion', 'ness', 'ment', 'ing', 'ers', 'est', 'ed', 'es', 'al', 's']) {
    if (w.length > suf.length + 3 && w.endsWith(suf)) { w = w.slice(0, -suf.length); break; }
  }
  return w;
}

export function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // fold accents
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

/** Edit distance, capped: anything past `max` is not a near-miss and the
 *  exact figure is never used, so the rows bail out as soon as they exceed it. */
function withinEditDistance(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  if (a === b) return true;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost);
      curr.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return false; // no cell in this row can still win
    prev = curr;
  }
  return prev[b.length]! <= max;
}

/** A field of a record, with how much a hit in it is worth. */
export type SearchField = { text: string; weight: number };

export type Scored<T> = { item: T; score: number };

export type Prepared = {
  /** stemmed tokens per field, with that field's weight */
  /** concept group -> how many of this field's tokens fall in it */
  fields: { tokens: Set<string>; concepts: Map<number, number>; weight: number }[];
  /** whole lowercased text, for phrase hits */
  raw: string;
};

export function prepare(fields: SearchField[]): Prepared {
  return {
    fields: fields.map((f) => {
      const tokens = new Set<string>();
      const concepts = new Map<number, number>();
      for (const t of tokenise(f.text)) {
        const s = stemOf(t);
        tokens.add(s);
        for (const g of CONCEPT_INDEX.get(s) ?? []) concepts.set(g, (concepts.get(g) ?? 0) + 1);
      }
      return { tokens, concepts, weight: f.weight };
    }),
    raw: fields.map((f) => f.text).join('  ').toLowerCase(),
  };
}

/* What each kind of hit is worth. Exact beats concept beats fuzzy, so a
   record literally about the query always outranks one merely related. */
const EXACT = 1;
const CONCEPT = 0.45;
const FUZZY = 0.3;
const PHRASE_BONUS = 2;
/** extra weight per additional concept hit in the same field, capped */
const CONCEPT_DENSITY = 0.25;

export function scoreQuery(prepared: Prepared, query: string): number {
  const qTokens = tokenise(query);
  if (qTokens.length === 0) return 0;

  let total = 0;
  let matchedTokens = 0;

  for (const qt of qTokens) {
    const qs = stemOf(qt);
    const qConcepts = CONCEPT_INDEX.get(qs) ?? [];
    let best = 0;

    for (const field of prepared.fields) {
      if (field.tokens.has(qs)) {
        best = Math.max(best, EXACT * field.weight);
        continue;
      }
      /* Density matters, and taking a flat max here got it wrong: "glacier"
         scored "The Ice-Class Vessel" (one incidental "ice", a hull rating)
         level with "Ice Core Stratigraphy" (ice, core, stratigraphy all in
         the same group), and the tie fell to catalogue order. Counting how
         much of the field sits in the matched concept separates them. */
      const hits = qConcepts.reduce((n, g) => n + (field.concepts.get(g) ?? 0), 0);
      if (hits > 0) {
        best = Math.max(best, CONCEPT * field.weight * (1 + Math.min(hits - 1, 3) * CONCEPT_DENSITY));
        continue;
      }
      // typo tolerance, only for words long enough that an edit is unlikely
      // to collide with a genuinely different word
      // Two edits from six characters, one below that — the same budget
      // Lucene uses, and it has to absorb stemmer asymmetry as well as
      // real typos: "geolgy" stems to itself while "geological" stems to
      // "geolog", so a single typo can already read as a two-edit gap.
      if (qs.length >= 4) {
        for (const t of field.tokens) {
          if (Math.abs(t.length - qs.length) > 2) continue;
          if (withinEditDistance(qs, t, qs.length >= 6 ? 2 : 1)) {
            best = Math.max(best, FUZZY * field.weight);
            break;
          }
        }
      }
    }

    if (best > 0) matchedTokens++;
    total += best;
  }

  if (matchedTokens === 0) return 0;

  // Every word of the query landing somewhere is a much stronger signal than
  // one word landing hard, so require-all is rewarded rather than enforced.
  const coverage = matchedTokens / qTokens.length;
  total *= 0.5 + 0.5 * coverage;

  // A literal phrase hit is the least ambiguous signal there is.
  const phrase = query.trim().toLowerCase();
  if (phrase.length > 2 && prepared.raw.includes(phrase)) total += PHRASE_BONUS;

  return total;
}

/** Rank `items` against `query`, dropping non-matches. Ties keep their
 *  original order, so an empty query leaves the catalogue exactly as it was. */
export function semanticRank<T>(
  items: T[],
  query: string,
  getPrepared: (item: T) => Prepared,
): Scored<T>[] {
  if (!query.trim()) return items.map((item) => ({ item, score: 0 }));
  return items
    .map((item, i) => ({ item, i, score: scoreQuery(getPrepared(item), query) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => (b.score - a.score) || (a.i - b.i))
    .map(({ item, score }) => ({ item, score }));
}
