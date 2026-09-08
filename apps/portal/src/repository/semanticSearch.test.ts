import { describe, it, expect } from 'vitest';
import { prepare, scoreQuery, semanticRank, tokenise, type SearchField } from './semanticSearch';

/* A miniature catalogue standing in for the real one — each record is the
 * kind that broke plain substring search. */
const CATALOGUE = [
  { id: 'wildlife', title: 'Counting wildlife near Bharati',
    body: 'Adélie penguin colony census on the exposed rock, breeding pairs recorded.',
    cat: 'Dataset', station: 'Bharati' },
  { id: 'katabatic', title: 'Katabatic Wind Regimes of Queen Maud Land',
    body: 'Multi-year analysis of gravity-driven winds falling off the polar plateau.',
    cat: 'Publication', station: 'Maitri' },
  { id: 'icecore', title: 'Ice Core Stratigraphy — Annual Layer Record',
    body: 'Annual layer counting through a shallow firn core.',
    cat: 'Dataset', station: 'Maitri' },
  { id: 'vessel', title: 'The Ice-Class Vessel: Logistics by Sea',
    body: 'Fuel, cargo and winter-over crew make the crossing from India aboard a chartered resupply ship.',
    cat: 'Expedition Report', station: 'Other' },
  { id: 'geology', title: 'Geological Evolution of the Larsemann Hills',
    body: 'Structural mapping of tectonic events that led to the breakup of Gondwana.',
    cat: 'Publication', station: 'Bharati' },
];

type Rec = (typeof CATALOGUE)[number];

const fieldsOf = (r: Rec): SearchField[] => [
  { text: r.title, weight: 3 },
  { text: r.body, weight: 1.5 },
  { text: `${r.cat} ${r.station}`, weight: 1 },
];

const cache = new Map<string, ReturnType<typeof prepare>>();
const prep = (r: Rec) => {
  let p = cache.get(r.id);
  if (!p) { p = prepare(fieldsOf(r)); cache.set(r.id, p); }
  return p;
};

const search = (q: string) => semanticRank(CATALOGUE, q, prep).map((s) => s.item.id);

describe('tokenising', () => {
  it('drops stopwords and punctuation', () => {
    expect(tokenise('The Ice-Class Vessel: Logistics by Sea'))
      .toEqual(['ice', 'class', 'vessel', 'logistics', 'sea']);
  });

  it('folds accents so "Adélie" is reachable as "adelie"', () => {
    expect(tokenise('Adélie penguin')).toEqual(['adelie', 'penguin']);
  });
});

describe('the failures that motivated this', () => {
  it('finds the wildlife record from "penguins", which it never literally says twice', () => {
    expect(search('penguins')).toContain('wildlife');
  });

  it('finds katabatic winds from "weather", a word absent from the record', () => {
    expect(search('weather')).toContain('katabatic');
  });

  it('finds the ice core from "glacier", a concept sibling', () => {
    expect(search('glacier')).toContain('icecore');
  });

  it('survives a typo', () => {
    expect(search('katabatik')).toContain('katabatic');
    expect(search('geolgy')).toContain('geology');
  });

  it('still matches plain substrings, which must not regress', () => {
    expect(search('Larsemann')).toEqual(['geology']);
  });
});

describe('ranking', () => {
  it('puts the literal title match first', () => {
    expect(search('katabatic wind')[0]).toBe('katabatic');
  });

  it('ranks an exact hit above a merely related one', () => {
    const exact = scoreQuery(prep(CATALOGUE[1]!), 'katabatic');  // says it outright
    const related = scoreQuery(prep(CATALOGUE[2]!), 'katabatic'); // ice/weather adjacency at best
    expect(exact).toBeGreaterThan(related);
  });

  it('rewards a query whose every word lands over one that half-lands', () => {
    const both = scoreQuery(prep(CATALOGUE[4]!), 'geological larsemann');
    const half = scoreQuery(prep(CATALOGUE[4]!), 'geological zzzzqq');
    expect(both).toBeGreaterThan(half);
  });

  it('weights a title hit above the same word buried in the body', () => {
    const inTitle = scoreQuery(prepare([{ text: 'cargo', weight: 3 }, { text: '', weight: 1.5 }]), 'cargo');
    const inBody  = scoreQuery(prepare([{ text: '', weight: 3 }, { text: 'cargo', weight: 1.5 }]), 'cargo');
    expect(inTitle).toBeGreaterThan(inBody);
  });
});

describe('not matching everything', () => {
  it('returns nothing for a query with no relation to the catalogue', () => {
    expect(search('zzzznomatch')).toEqual([]);
    expect(search('quantum cryptography derivatives')).toEqual([]);
  });

  it('does not let a stopword-only query match every record', () => {
    expect(search('the of and')).toEqual([]);
  });

  it('does not fuzzy-match short words into unrelated ones', () => {
    // "sea" vs "tea"/"set" — too short to typo-correct safely
    expect(scoreQuery(prepare([{ text: 'sea', weight: 3 }]), 'set')).toBe(0);
  });

  it('leaves the catalogue untouched and in order for an empty query', () => {
    expect(search('')).toEqual(CATALOGUE.map((r) => r.id));
    expect(search('   ')).toEqual(CATALOGUE.map((r) => r.id));
  });
});

describe('concept density', () => {
  it('ranks a record steeped in the concept above one that merely brushes it', () => {
    // "Ice Core Stratigraphy" is ice/core/stratigraphy — three terms in the
    // ice group. "The Ice-Class Vessel" has one incidental "ice" (a hull
    // rating, not glaciology) and must not tie with it.
    const ranked = semanticRank(CATALOGUE, 'glacier', prep).map((s) => s.item.id);
    expect(ranked.indexOf('icecore')).toBeLessThan(ranked.indexOf('vessel'));
  });

  it('still lets an exact hit beat a dense concept match', () => {
    const ranked = semanticRank(CATALOGUE, 'ice core', prep).map((s) => s.item.id);
    expect(ranked[0]).toBe('icecore');
  });
});
