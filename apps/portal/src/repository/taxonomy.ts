/* ════════════════════════════════════════ polar regions and themes ═══
 *
 * NCPOR does not run one programme; it runs polar science in two places at
 * once. Its own data centre splits its holdings exactly that way — Antarctic
 * weather and environmental data, Arctic environmental and mooring data,
 * Himadri's met record from Ny-Ålesund, ice cores, and datasets browsable
 * "by science keyword" and "by location" (data.ncpor.res.in, npdc.ncpor.res.in).
 *
 * This repository was built Antarctic-only: five stations, all on the ice,
 * and a category list that says what a record *is* (report, dataset, paper)
 * but nothing about what it is *about*. That is why a visitor cannot ask it
 * for "Arctic aerosols" or "sea ice" and get an answer.
 *
 * So, two axes, mirroring NCPOR's own:
 *
 *   region — Antarctic or Arctic. Stored on new records; derived for the
 *            ones published before this existed, from the station first and
 *            then from what the record actually says.
 *   theme  — the science keyword, in NCPOR's vocabulary: glaciology,
 *            meteorology, atmosphere and aerosols, ocean and sea ice,
 *            biology, geology, environment, operations.
 *
 * Derivation matters more than it looks. Nothing can be backfilled into
 * records already published — they are immutable public documents — so a
 * repository that only filtered on stored fields would show an empty Arctic
 * tab and no themes at all until every record was republished.
 */

import type { RepositoryRecord } from './contract'

export type PolarRegion = 'antarctic' | 'arctic'

export const REGION_LABELS: Record<PolarRegion, string> = {
  antarctic: 'Antarctica',
  arctic: 'Arctic',
}

/** Where each station is. Himadri is India's Arctic station, at Ny-Ålesund
 *  on Svalbard (78°55′N); the rest are Antarctic, and the research vessel
 *  is counted with them because that is the voyage it is on. */
export const STATION_REGION: Record<string, PolarRegion> = {
  maitri: 'antarctic',
  bharati: 'antarctic',
  dakshin: 'antarctic',
  ship: 'antarctic',
  ncpor: 'antarctic',
  himadri: 'arctic',
  kongsfjorden: 'arctic',
  svalbard: 'arctic',
}

/** Words that place a record in the Arctic when its station cannot. */
const ARCTIC_WORDS = [
  'arctic', 'himadri', 'svalbard', 'ny-ålesund', 'ny-alesund', 'nyalesund',
  'kongsfjorden', 'longyearbyen', 'spitsbergen', 'greenland', 'boreal', 'permafrost',
]

function haystack(r: RepositoryRecord): string {
  return [
    r.title, r.kind, r.station, r.metadata?.station,
    ...(r.pills ?? []), ...(r.body ?? []).slice(0, 3),
  ].filter(Boolean).join(' ').toLowerCase()
}

/** The region a record belongs to: what it says, then where it was taken,
 *  then what it talks about. Antarctic is the default because that is what
 *  the programme mostly is — never a guess dressed up as a fact. */
export function regionOf(r: RepositoryRecord): PolarRegion {
  const stored = (r.metadata as { region?: PolarRegion } | undefined)?.region
  if (stored === 'antarctic' || stored === 'arctic') return stored

  const station = (r.metadata?.station ?? r.station ?? '').toLowerCase()
  for (const [key, region] of Object.entries(STATION_REGION)) {
    if (station.includes(key)) return region
  }

  const text = haystack(r)
  if (ARCTIC_WORDS.some((w) => text.includes(w))) return 'arctic'
  return 'antarctic'
}

/* ───────────────────────────────────────────────────── science themes ── */

export interface Theme {
  id: string
  label: string
  /** What NCPOR files under this heading, in its own words where possible. */
  blurb: string
  /** Any of these in a record's text files it here. */
  terms: string[]
}

export const THEMES: Theme[] = [
  {
    id: 'cryosphere',
    label: 'Glaciology & ice',
    blurb: 'Ice cores, mass balance, sea-ice thickness, glaciers and snow.',
    terms: ['ice', 'glacier', 'glaciology', 'glacial', 'cryosphere', 'snow', 'firn', 'iceberg',
      'crevasse', 'mass balance', 'ablation', 'accumulation', 'core', 'stratigraphy', 'floe', 'melt'],
  },
  {
    id: 'meteorology',
    label: 'Weather & precipitation',
    blurb: 'Automatic weather stations, synoptic records, precipitation and radiometry.',
    terms: ['weather', 'meteorolog', 'aws', 'synoptic', 'temperature', 'wind', 'katabatic', 'blizzard',
      'precipitation', 'snowfall', 'radiometer', 'parsivel', 'rain radar', 'humidity', 'pressure', 'climate'],
  },
  {
    id: 'atmosphere',
    label: 'Atmosphere & aerosols',
    blurb: 'Ozone, black carbon, aerosol scattering, radiation and upper-air soundings.',
    terms: ['ozone', 'aerosol', 'black carbon', 'nephelometer', 'atmospher', 'radiation', 'sounding',
      'ozonesonde', 'dobson', 'column', 'uv', 'pollutant', 'ionosphere', 'aurora', 'magnetic'],
  },
  {
    id: 'ocean',
    label: 'Ocean & sea ice',
    blurb: 'CTD casts, moorings, hydrography, currents and sea-ice observation.',
    terms: ['ocean', 'oceanograph', 'ctd', 'mooring', 'salinity', 'hydrograph', 'current', 'sea ice',
      'bathymetr', 'water column', 'southern ocean', 'fjord', 'marine', 'sediment trap', 'buoy'],
  },
  {
    id: 'biology',
    label: 'Biology & microbial ecology',
    blurb: 'Wildlife counts, microbial diversity, lichens, algae and ecosystem surveys.',
    terms: ['wildlife', 'penguin', 'seal', 'bird', 'krill', 'whale', 'biolog', 'microbial', 'microbio',
      'species', 'colony', 'breeding', 'lichen', 'algae', 'bacteria', 'ecosystem', 'census', 'flora', 'fauna'],
  },
  {
    id: 'geoscience',
    label: 'Geology & geophysics',
    blurb: 'Rocks, tectonics, seismology, magnetics and the continental shelf.',
    terms: ['geolog', 'geophys', 'rock', 'mineral', 'tectonic', 'seismic', 'seismolog', 'gravity',
      'magnetic survey', 'petrolog', 'moraine', 'outcrop', 'litholog', 'shelf', 'crust'],
  },
  {
    id: 'environment',
    label: 'Environment & monitoring',
    blurb: 'Contamination, waste, protocol compliance and long-term environmental watch.',
    terms: ['environment', 'contaminat', 'pollution', 'waste', 'protocol', 'impact', 'conservation',
      'monitoring', 'baseline', 'trace metal', 'microplastic'],
  },
  {
    id: 'operations',
    label: 'Stations & operations',
    blurb: 'Expedition logistics, station building and resupply.',
    terms: ['station', 'expedition', 'logistic', 'resupply', 'vessel', 'cargo', 'fuel', 'construction',
      'built', 'voyage', 'icebreaker', 'summer team', 'winter team', 'base', 'facility', 'operations'],
  },
]

export const THEME_LABEL: Record<string, string> = Object.fromEntries(
  THEMES.map((t) => [t.id, t.label]),
)

/** Themes a record belongs to — stored if the portal recorded them, derived
 *  from its own words otherwise. A record can sit under more than one, which
 *  is true of most real polar work. */
export function themesOf(r: RepositoryRecord): string[] {
  const stored = (r as { themes?: string[] }).themes
  if (Array.isArray(stored) && stored.length) return stored.filter((t) => t in THEME_LABEL)

  const text = haystack(r) + ' ' + (r.measurements ?? []).map((m) => m.label).join(' ').toLowerCase()
  const found = THEMES.filter((t) => t.terms.some((term) => text.includes(term))).map((t) => t.id)
  return found.length ? found : ['operations']
}

/* ─────────────────────────────────────────────── the facts of a dataset ──
 *
 * NCPOR's data centre describes a dataset by what was measured, with what,
 * over what period, in what format. A record that offers data should say the
 * same things, from whatever it happens to carry. */
export interface DatasetFact { label: string; value: string }

export function datasetFactsOf(r: RepositoryRecord): DatasetFact[] {
  const facts: DatasetFact[] = []
  const push = (label: string, value?: string | null) => {
    if (value && String(value).trim()) facts.push({ label, value: String(value).trim() })
  }

  push('Parameters', (r.measurements ?? []).map((m) => m.label).slice(0, 6).join(', '))
  push('Instrument', r.metadata?.instrument ?? null)
  push('Method', r.metadata?.method ?? null)
  push('Coverage', r.dataset?.coverage ?? null)
  push('Format', r.dataset?.format ?? null)
  push('Size', r.dataset?.sizeLabel ?? null)
  if (r.dataset?.rowCount) push('Rows', r.dataset.rowCount.toLocaleString('en-IN'))
  push('Licence', r.metadata?.license ?? null)
  return facts
}
