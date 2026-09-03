import { coverArt, coverGrade, type CoverCategory, type CoverStation } from '../lib/archiveCovers'
import type { HeroCarouselItem } from '../components/ui/hero-carousel'

export type { CoverCategory, CoverStation }

export interface ArchiveRecord {
  id: string
  cat: CoverCategory
  /** Display label for the record type, e.g. "Expedition Report". */
  kind: string
  /** Hero headline. A "\n" breaks it onto a second reveal line. */
  title: string
  station: CoverStation
  /** Printed in the meta row and used to seed the record's cover art. */
  year: string
  pills: string[]
  body: string[]
  table?: [string, string][]
  credit?: string
}

// Four of these (e1, e2, d1, p1) are the archive's original entries, kept
// as-is. The rest fill out the categories and stations the originals never
// touched — institutional, media, the logistics vessel — so the carousel
// reads as a real cross-section of the archive rather than four cards
// repeated to fill a strip.
export const RECORDS: ArchiveRecord[] = [
  {
    id: 'e0',
    cat: 'expedition',
    kind: 'Expedition Report',
    title: 'First Landing:\nDakshin Gangotri',
    station: 'dakshin',
    year: '1983–84',
    pills: ['Logistics', 'First Expedition'],
    credit: 'THIRD INDIAN ANTARCTIC EXPEDITION',
    body: [
      'India’s first permanent Antarctic station was built on the ice shelf of the Princess Astrid Coast during the third Indian Scientific Expedition to Antarctica, following the reconnaissance landings of the first two summer expeditions.',
      'Founded on ice rather than rock, the station was always understood to be temporary — the shelf itself moves, and a structure built on it eventually has to answer for that. It served as India’s Antarctic gateway through the 1980s, before Maitri took over as the country’s main station.',
      'Dakshin Gangotri was formally decommissioned in the early 1990s as accumulating snow and shifting ice made the original structure unsafe to winter in. It is preserved today as a supply base and a marker of where the programme began.',
    ],
    table: [
      ['Location', 'Princess Astrid Coast, Queen Maud Land'],
      ['Foundation', 'Ice shelf'],
      ['Status', 'Decommissioned — supply base only'],
    ],
  },
  {
    id: 'e1',
    cat: 'expedition',
    kind: 'Expedition Report',
    title: 'Establishing Maitri,\n1988–89',
    station: 'maitri',
    year: '1989',
    pills: ['Geology', 'Logistics'],
    credit: 'EIGHTH INDIAN ANTARCTIC EXPEDITION',
    body: [
      'The 8th Indian Scientific Expedition to Antarctica was tasked with a monumental objective: constructing the permanent station "Maitri" in the Schirmacher Oasis.',
      'Unlike the ice-shelf based Dakshin Gangotri, Maitri was built on rocky terrain. The foundation required extensive leveling of the moraine and permafrost.',
      'Over the course of 45 days, the team erected the main building, power house, and pump station, securing a vital foothold for India’s inland research.',
    ],
    table: [
      ['Leader', 'Dr. Amitabh Sengupta'],
      ['Location', '70° 45′ 58″ S, 11° 43′ 56″ E'],
      ['Temp Range', '−1°C to −15°C (Summer)'],
    ],
  },
  {
    id: 'e2',
    cat: 'expedition',
    kind: 'Expedition Report',
    title: 'Two Summers to\nBuild Bharati',
    station: 'bharati',
    year: '2010–12',
    pills: ['Engineering', 'Oceanography'],
    credit: 'TWENTY-NINTH & THIRTIETH EXPEDITIONS',
    body: [
      'Bharati represents a leap in Antarctic architecture. Constructed from 134 specialized shipping containers, it was designed to withstand extreme blizzards while minimizing environmental impact.',
      'The construction spanned two intense summer seasons. The resulting facility provides state-of-the-art labs for oceanographic and atmospheric sciences.',
    ],
  },
  {
    id: 'm0',
    cat: 'media',
    kind: 'Photograph',
    title: 'Aerial Survey:\nSchirmacher Oasis',
    station: 'maitri',
    year: '1989',
    pills: ['Cartography', 'Site Survey'],
    credit: 'SURVEY OF INDIA — ANTARCTIC WING',
    body: [
      'A low-altitude photographic survey of the Schirmacher Oasis, flown to fix Maitri’s foundation against the surrounding moraine and the chain of freshwater lakes the oasis is named for.',
      'Composite plates from this survey were used to produce the first accurate site maps of the station and its approach routes, superseding the sketch surveys of the earlier reconnaissance expeditions.',
      'Digitised prints from this catalogue entry are held at the National Centre for Polar and Ocean Research and are available to researchers on request.',
    ],
  },
  {
    id: 'd1',
    cat: 'dataset',
    kind: 'Dataset',
    title: 'Ice Core Stratigraphy —\nAnnual Layer Record',
    station: 'maitri',
    year: '1994',
    pills: ['Glaciology', 'Climate'],
    credit: 'NATIONAL CENTRE FOR POLAR & OCEAN RESEARCH',
    body: [
      'Data derived from a 65-meter ice core drilled near the Schirmacher Oasis. The isotopic analysis (δ18O and δD) reveals a 500-year high-resolution climate proxy.',
      'Volcanic horizons identified within the core correlate with known global eruptions, validating the chronological model.',
    ],
    table: [
      ['Core Depth', '65 m'],
      ['Time Span', '~500 years'],
      ['Proxy', 'δ18O, δD'],
    ],
  },
  {
    id: 'd2',
    cat: 'dataset',
    kind: 'Dataset',
    title: 'Automatic Weather\nStation Record',
    station: 'maitri',
    year: '1989–present',
    pills: ['Meteorology', 'Long-term Monitoring'],
    credit: 'INDIA METEOROLOGICAL DEPARTMENT',
    body: [
      'Continuous synoptic observations from Maitri’s automatic weather station, logged at three-hour intervals without a break since the station’s first winter — one of the longest unbroken instrumental records India holds anywhere on the continent.',
      'The series underpins Antarctic contributions to the Southern Hemisphere sea-level pressure network and is cross-referenced against the katabatic wind studies published from the same station.',
    ],
    table: [
      ['Interval', '3-hourly'],
      ['Variables', 'Temp, pressure, wind, humidity'],
      ['Coverage', 'Unbroken since commissioning'],
    ],
  },
  {
    id: 'd3',
    cat: 'dataset',
    kind: 'Dataset',
    title: 'Southern Ocean\nKrill Biomass Survey',
    station: 'bharati',
    year: '2013',
    pills: ['Biological Oceanography', 'CCAMLR'],
    credit: 'BAY OF BENGAL & SOUTHERN OCEAN PROGRAMME',
    body: [
      'Acoustic and net-sampling survey of Euphausia superba biomass in the waters off the Larsemann Hills, conducted from Bharati’s marine biology wing as part of India’s contribution to CCAMLR’s ecosystem monitoring programme.',
      'Krill density estimates from this survey feed directly into the regional stock assessments used to set the Southern Ocean’s precautionary catch limits.',
    ],
  },
  {
    id: 'p1',
    cat: 'publication',
    kind: 'Publication',
    title: 'Geological Evolution of\nthe Larsemann Hills',
    station: 'bharati',
    year: '2015',
    pills: ['Geology', 'Gondwana'],
    credit: 'JOURNAL OF EARTH SYSTEM SCIENCE',
    body: [
      'This comprehensive study maps the structural geology of the Larsemann Hills, shedding light on the tectonic events that led to the breakup of the supercontinent Gondwana.',
      'Field observations confirm high-grade metamorphism and multi-phase deformation, correlating strongly with the Eastern Ghats Mobile Belt of India.',
    ],
  },
  {
    id: 'p2',
    cat: 'publication',
    kind: 'Publication',
    title: 'Katabatic Wind Regimes\nof Queen Maud Land',
    station: 'maitri',
    year: '2019',
    pills: ['Meteorology', 'Boundary Layer Physics'],
    credit: 'POLAR SCIENCE',
    body: [
      'A multi-year analysis of the gravity-driven winds that fall off the polar plateau through the Schirmacher Oasis, drawing on the station’s own AWS record to characterise their onset, duration and seasonal cycle.',
      'The paper argues that even the strongest recorded events are simple cold air falling under its own weight — dramatic in effect, unremarkable in physics.',
    ],
  },
  {
    id: 'i0',
    cat: 'institution',
    kind: 'Institutional',
    title: 'Founding of the National\nCentre for Polar Research',
    station: 'ncpor',
    year: '1998',
    pills: ['Governance', 'Ministry of Earth Sciences'],
    credit: 'GOVERNMENT OF INDIA',
    body: [
      'Established to consolidate India’s Antarctic, Arctic and Southern Ocean research under a single nodal agency, headquartered in Goa and functioning under the Ministry of Earth Sciences.',
      'The Centre plans and coordinates every Indian Scientific Expedition to Antarctica, curates the specimens and data those expeditions return with, and is the archive of record this catalogue is drawn from.',
    ],
  },
  {
    id: 's0',
    cat: 'expedition',
    kind: 'Expedition Report',
    title: 'The Ice-Class Vessel:\nLogistics by Sea',
    station: 'ship',
    year: 'Ongoing',
    pills: ['Logistics', 'Resupply'],
    credit: 'CHARTERED ICE-CLASS RESUPPLY VESSEL',
    body: [
      'Every expedition’s fuel, cargo and winter-over crew make the crossing from India by sea, aboard a chartered ice-class vessel capable of working through the pack ice around the resupply anchorage.',
      'A single voyage carries a year’s worth of food, fuel and scientific equipment for both stations — the resupply window is short, and what does not arrive on this crossing waits for the next one.',
    ],
  },
]

const seedFor = (id: string) =>
  id.split('').reduce((s, c) => s + c.charCodeAt(0), 0)

// Real photographs (see lib/galleryArt.ts for their Wikimedia Commons
// sources), one per record where a real one exists and actually fits —
// e0 gets the under-construction shot rather than the finished station
// because that record is specifically about the 1983 founding. `i0`
// (NCPOR itself, a building in Goa) has no match in this project's photo
// set and keeps the drawn cover art rather than borrowing an unrelated
// Antarctic photo for an institutional record about India, not the ice.
const PHOTO_BY_ID: Record<string, string> = {
  e0: '/photos/dakshin-aerial.jpg',
  e1: '/photos/maitri-aerial.jpg',
  e2: '/photos/bharati-station.jpg',
  m0: '/photos/maitri-flag.jpg',
  d1: '/photos/lake-priyadarshini.jpg',
  d2: '/photos/maitri-aerial.jpg',
  d3: '/photos/bharati-station.jpg',
  p1: '/photos/bharati-station.jpg',
  p2: '/photos/maitri-flag.jpg',
  s0: '/photos/icebreaker.jpg',
}

export function toHeroItem(r: ArchiveRecord): HeroCarouselItem {
  return {
    id: r.id,
    title: r.title,
    image: PHOTO_BY_ID[r.id] ?? coverArt(r.cat, r.station, seedFor(r.id), `${r.station} · ${r.year}`),
    credit: r.credit,
    meta: [STATION_LABELS[r.station] ?? r.station, r.year, r.kind.toUpperCase()],
    accent: coverGrade(r.station),
  }
}

export const CATEGORIES: { id: CoverCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'All Records' },
  { id: 'expedition', label: 'Expedition Reports' },
  { id: 'dataset', label: 'Datasets' },
  { id: 'publication', label: 'Publications' },
  { id: 'media', label: 'Media' },
  { id: 'institution', label: 'Institutional' },
]

export const STATION_LABELS: Record<CoverStation, string> = {
  maitri: 'Maitri',
  bharati: 'Bharati',
  dakshin: 'Dakshin Gangotri',
  ship: 'Resupply Vessel',
  ncpor: 'NCPOR',
}
