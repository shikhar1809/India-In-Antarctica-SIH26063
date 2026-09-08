import { coverArt, coverGrade, type CoverCategory, type CoverStation } from '../lib/archiveCovers'
import type { HeroCarouselItem } from '../components/ui/hero-carousel'
import type { DatasetPreview, Reference, ReportSection } from '../repository/contract'

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
  /** The abstract — what the record is, in two or three paragraphs. */
  body: string[]
  table?: [string, string][]
  credit?: string
  /** The report proper: the sections a reader navigates. */
  sections?: ReportSection[]
  /** Dataset records describe their own shape rather than only their size. */
  dataset?: DatasetPreview
  references?: Reference[]
  /** Photographs published with the record. The first is its cover. */
  photos?: string[]
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
    photos: ['/photos/dakshin-aerial.jpg', '/photos/icebreaker.jpg'],
    sections: [
      {
        id: 'a-station-of-our-own',
        heading: 'A station of our own',
        paragraphs: [
          'India’s first two Antarctic expeditions, in 1981–82 and 1982–83, were reconnaissance in the truest sense. They put a team ashore, proved that an Indian ship and an Indian crew could reach the continent and return, and established that the country could sustain a scientific presence there at all. Neither expedition left anything permanent behind. Everything landed was carried back out again, and every observation ended when the ship sailed.',
          'That is a hard way to do science. Antarctic research earns its value from continuity: a single summer of measurements tells you what one season looked like, while a decade of them tells you what is changing. Without somewhere to overwinter, India could only ever collect summers. The third expedition was therefore given a different mandate — not to observe, but to build.',
        ],
      },
      {
        id: 'choosing-the-site',
        heading: 'Choosing the site',
        paragraphs: [
          'The site chosen was on the Princess Astrid Coast of Queen Maud Land, on the ice shelf itself rather than on exposed rock. The decision was pragmatic. Shelf ice offered a flat, predictable surface within reach of a ship’s offloading point, and the alternative — hauling construction material inland to the nearest rock outcrop — was beyond what the expedition’s logistics could carry in a single summer window.',
          'The trade-off was understood at the time: an ice shelf moves, and it accumulates. A structure built on one is a structure with a known expiry date. The team accepted that in exchange for a working station in one season instead of a better station in three.',
        ],
        figure: {
          kind: 'photo',
          caption: 'The Princess Astrid Coast from the air. The featureless surface that made the site easy to build on is the same surface that buried the station within a decade.',
          photoUrl: '/photos/dakshin-aerial.jpg',
        },
      },
      {
        id: 'building-in-one-summer',
        heading: 'Building in one summer',
        paragraphs: [
          'Antarctic construction happens inside a window measured in weeks. Cargo comes ashore only while the ship can hold station and the surface can bear a load, and every hour of that window is contested by weather. The station was assembled from prefabricated modules landed by ship and moved to the site over the shelf — a sequence that had to be completed in order and could not be paused.',
          'The finished station provided accommodation, a power house, stores and laboratory space: enough for a team to live and work through the winter without resupply. Its opening made India one of the small number of countries maintaining a year-round presence on the continent, within three years of the first Indian landing.',
        ],
      },
      {
        id: 'the-first-winter',
        heading: 'The first winter',
        paragraphs: [
          'The winter party carried out the programme the station had been built for: meteorological observation, geomagnetism, upper-atmosphere studies, and the medical and psychological monitoring that any first overwintering generates as much by necessity as by design. The value of these records lies less in any single reading than in the fact that they were taken continuously, through months when no ship could reach the station and no measurement could be repeated later.',
          'Those observations became the first entries in what is now a continuous Indian polar record stretching across four decades.',
        ],
      },
      {
        id: 'buried-as-expected',
        heading: 'Buried, as expected',
        paragraphs: [
          'Snow accumulation did what the site survey had predicted. Through the 1980s the station was progressively buried, and a structure built to sit on the surface increasingly sat under it. By the end of the decade the accumulated load and the movement of the shelf had made wintering unsafe, and the station was formally decommissioned in the early 1990s.',
          'Dakshin Gangotri was retired rather than abandoned. It remains in use as a supply base and transit point, and its real legacy is the one that mattered: it proved the programme could sustain a permanent presence, and it made the case for building the next station on rock.',
        ],
        figure: {
          kind: 'table',
          caption: 'The station as built, and as it stands today.',
          rows: [
            { label: 'Expedition', value: 'Third Indian Scientific Expedition to Antarctica' },
            { label: 'Season', value: '1983–84' },
            { label: 'Foundation', value: 'Ice shelf, Princess Astrid Coast' },
            { label: 'Wintering capacity', value: 'Year-round party' },
            { label: 'Decommissioned', value: 'Early 1990s — snow accumulation' },
            { label: 'Status today', value: 'Supply base and transit point' },
          ],
        },
      },
    ],
    references: [
      { citation: 'National Centre for Polar and Ocean Research — Indian Antarctic Programme', url: 'https://ncpor.res.in' },
      { citation: 'Ministry of Earth Sciences — Antarctic and Southern Ocean research', url: 'https://moes.gov.in' },
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
    photos: ['/photos/maitri-aerial.jpg', '/photos/maitri-flag.jpg'],
    sections: [
      {
        id: 'the-case-for-rock',
        heading: 'The case for rock',
        paragraphs: [
          'By the middle of the 1980s the problem with Dakshin Gangotri was no longer theoretical. The station was being buried at a rate that could be measured season by season, and the arithmetic of that burial pointed at a date after which wintering there would stop being sensible. A replacement was needed, and one requirement mattered above all others: it should not be built on ice.',
          'The Schirmacher Oasis — a strip of ice-free rock roughly 17 km long in Queen Maud Land — offered exactly that. Rock does not accumulate, does not flow, and does not require a station to be jacked up, dug out or eventually surrendered. It also came with liquid-water lakes through the summer and a surface instruments could be anchored to for decades.',
        ],
      },
      {
        id: 'the-eighth-expedition',
        heading: 'The eighth expedition',
        paragraphs: [
          'Construction fell to the 8th Indian Scientific Expedition to Antarctica, which arrived with a single objective and one season in which to complete it. Unlike the shelf site, the oasis demanded real groundwork: levelling moraine, working around permafrost, and preparing foundations on ground that had never carried a structure.',
          'The main building, power house and pump station went up over roughly forty-five days of continuous work. The pump station mattered more than its name suggests — a station on rock beside a freshwater lake can draw water directly instead of melting snow for every litre, which changes the fuel budget of the entire base.',
        ],
        figure: {
          kind: 'photo',
          caption: 'Maitri in the Schirmacher Oasis. The exposed rock that made the site harder to build on is what has kept the station serviceable for more than three decades.',
          photoUrl: '/photos/maitri-aerial.jpg',
        },
      },
      {
        id: 'what-it-enabled',
        heading: 'What the station enabled',
        paragraphs: [
          'Maitri was designed as a working laboratory rather than a shelter with instruments in it. Its position in the oasis put geology, glaciology, limnology and atmospheric science within reach of one base, and its stability allowed long-running installations — weather instruments, geomagnetic sensors, upper-atmosphere equipment — to stay in one place long enough for their records to become useful.',
          'That stability is the whole point. An automatic weather station moved every few seasons produces a series with a break in it every time; the same instrument on the same rock for thirty years produces a climate record.',
        ],
      },
      {
        id: 'still-operating',
        heading: 'Still operating',
        paragraphs: [
          'Maitri has been continuously operational since 1989 and remains one of India’s two active Antarctic stations. Successive expeditions have extended and refitted it rather than replaced it, which is the clearest available verdict on the decision to build on rock.',
          'Nearly every long-term Indian measurement series from Queen Maud Land — atmospheric, glaciological, geomagnetic — runs through this station.',
        ],
        figure: {
          kind: 'table',
          caption: 'Maitri at a glance.',
          rows: [
            { label: 'Expedition', value: 'Eighth Indian Scientific Expedition to Antarctica' },
            { label: 'Commissioned', value: '1989' },
            { label: 'Location', value: 'Schirmacher Oasis, Queen Maud Land' },
            { label: 'Foundation', value: 'Exposed rock and moraine' },
            { label: 'Construction', value: 'Approximately 45 days' },
            { label: 'Status', value: 'Operational, year-round' },
          ],
        },
      },
    ],
    references: [
      { citation: 'National Centre for Polar and Ocean Research — Maitri station', url: 'https://ncpor.res.in' },
      { citation: 'Scientific Committee on Antarctic Research', url: 'https://www.scar.org' },
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
    photos: ['/photos/bharati-station.jpg'],
    sections: [
      {
        id: 'why-a-third-station',
        heading: 'Why a second permanent station',
        paragraphs: [
          'Maitri sits in Queen Maud Land, on the Atlantic-facing side of the continent. That is one vantage point, and a programme working from a single vantage point can only answer questions about the region it happens to occupy. The Larsemann Hills, some 3,000 km away on the Prydz Bay coast, face a different ocean, a different ice-sheet margin and a different set of scientific questions.',
          'A second permanent station meant Indian researchers could work on both, and could compare them — a different and more valuable thing than working twice as much in one place.',
        ],
      },
      {
        id: 'built-from-containers',
        heading: 'Built from containers',
        paragraphs: [
          'Bharati was assembled from 134 prefabricated shipping containers, clad and joined into a single insulated structure and raised clear of the ground. The approach was chosen for the reason it is chosen in most modern Antarctic construction: containers survive an ocean voyage by design, can be craned into position in the order they are needed, and turn a building site into an assembly site.',
          'Raising the structure lets wind pass beneath it rather than piling snow against it — the drift that buried Dakshin Gangotri is designed out rather than fought.',
        ],
        figure: {
          kind: 'photo',
          caption: 'Bharati in the Larsemann Hills. The elevated, aerodynamic shell is a direct response to what snow accumulation did to India’s first station.',
          photoUrl: '/photos/bharati-station.jpg',
        },
      },
      {
        id: 'two-summers',
        heading: 'Two summers',
        paragraphs: [
          'Construction ran across two austral summer seasons, because a single window was never going to be enough for a structure of this size at this distance. The first season established the site, foundations and services; the second completed assembly and fit-out, and the station was commissioned in 2012.',
          'Everything — every container, every fitting, every litre of fuel — arrived by ship, on a schedule fixed a year in advance and subject to ice conditions on arrival. The logistics of the build were as much of the achievement as the build itself.',
        ],
      },
      {
        id: 'the-science-case',
        heading: 'The science it was built for',
        paragraphs: [
          'The Larsemann Hills give access to the Prydz Bay margin, where the ice sheet meets the Southern Ocean — one of the places where questions about ice loss and ocean circulation are actually decided. The station supports oceanography, glaciology, geology and atmospheric work, and its laboratories were specified for the sample handling that coastal fieldwork of this kind generates.',
          'Bharati made India one of a handful of countries operating two permanent Antarctic stations on opposite sides of the continent.',
        ],
        figure: {
          kind: 'table',
          caption: 'Bharati as commissioned.',
          rows: [
            { label: 'Commissioned', value: '2012' },
            { label: 'Location', value: 'Larsemann Hills, Prydz Bay' },
            { label: 'Construction', value: '134 prefabricated containers' },
            { label: 'Seasons to build', value: 'Two austral summers' },
            { label: 'Status', value: 'Operational, year-round' },
          ],
        },
      },
    ],
    references: [
      { citation: 'National Centre for Polar and Ocean Research — Bharati station', url: 'https://ncpor.res.in' },
      { citation: 'Antarctic Treaty Secretariat — Larsemann Hills Antarctic Specially Managed Area', url: 'https://www.ats.aq' },
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
    photos: ['/photos/lake-priyadarshini.jpg', '/photos/aurora-panorama.jpg'],
    sections: [
      {
        id: 'why-survey-from-the-air',
        heading: 'Why survey from the air',
        paragraphs: [
          'The Schirmacher Oasis is small enough to walk across and complicated enough that walking across it tells you very little about its shape. It is a mosaic of bare rock, moraine, frozen and unfrozen lakes, and ice margins that advance and retreat between seasons. Mapping that from the ground means inferring a pattern from a sequence of close-up views.',
          'From the air the pattern is simply visible. An aerial survey records the whole oasis in one geometry, at one moment, which is what makes two surveys separated by years comparable at all.',
        ],
      },
      {
        id: 'what-the-survey-covers',
        heading: 'What the survey covers',
        paragraphs: [
          'The imagery covers the oasis and its immediate ice margins, including the lake systems that make the area unusual. Lake Priyadarshini, beside Maitri, is the largest of them and the station’s freshwater source — its extent through the summer is both a scientific measurement and an operational one.',
          'Each frame carries the position and time it was taken, which is what turns a photograph into a record. Without that, an image of an ice margin is a picture; with it, the same image is a measurement of where the margin was on a given day.',
        ],
        figure: {
          kind: 'photo',
          caption: 'Lake Priyadarshini in the Schirmacher Oasis — the largest of the oasis lakes and Maitri’s freshwater supply.',
          photoUrl: '/photos/lake-priyadarshini.jpg',
        },
      },
      {
        id: 'how-it-is-used',
        heading: 'How the imagery is used',
        paragraphs: [
          'Repeat aerial coverage is the basis for tracking change: the retreat or advance of ice margins, the seasonal extent of meltwater lakes, the stability of moraine slopes, and the condition of station infrastructure and the routes between it and the field.',
          'It also does unglamorous operational work. Route planning, cargo staging and the siting of new instruments all start with knowing what the ground actually looks like, and the same imagery serves both purposes.',
        ],
      },
      {
        id: 'access',
        heading: 'Access and reuse',
        paragraphs: [
          'The imagery is published under a Creative Commons Attribution licence, in the same terms as the rest of this archive. It may be reused for research, teaching and public communication, provided NCPOR and the expedition that made the survey are credited.',
        ],
      },
    ],
    references: [
      { citation: 'National Centre for Polar and Ocean Research — Schirmacher Oasis', url: 'https://ncpor.res.in' },
    ],
  },
  {
    id: 'd1',
    cat: 'dataset',
    kind: 'Dataset',
    title: 'Total Column Ozone\nat Maitri, 1999–2006',
    station: 'maitri',
    year: '1999–2006',
    pills: ['Ozone', 'Atmosphere', 'WMO / GAW'],
    credit: 'INDIA METEOROLOGICAL DEPARTMENT',
    photos: ['/photos/aurora-panorama.jpg'],
    body: [
      'Seven years of daily total column ozone measured at Maitri with a Brewer MKIV spectrophotometer: 753 observation days between 14 September 1999 and 31 December 2006, each one a direct-sun reading of how much ozone stood in the atmospheric column above the station.',
      'The series records the Antarctic ozone hole passing over an Indian station. Column ozone falls from a summer average of 283 DU in January to 155 DU in October, and the lowest single reading in the record — 108 DU on 13 October 2006 — is roughly a third of the ozone that would be overhead in an unperturbed atmosphere.',
    ],
    table: [
      ['Instrument', 'Brewer MKIV spectrophotometer #153'],
      ['Observation days', '753'],
      ['Period', '14 Sep 1999 – 31 Dec 2006'],
      ['Range', '108 – 401 DU'],
      ['Measured by', 'India Meteorological Department'],
      ['Archived by', 'WOUDC (WMO / GAW), station 400'],
      ['Licence', 'Free and unrestricted, with attribution'],
    ],
    sections: [
      {
        id: 'what-was-measured',
        heading: 'What was measured',
        paragraphs: [
          'Total column ozone is the amount of ozone in a column of air stretching from the instrument to the top of the atmosphere, expressed in Dobson Units. One hundred Dobson Units is the thickness that ozone would have — one millimetre — if it were all brought down to sea-level pressure and temperature. A typical unperturbed column over Antarctica is around 300 DU.',
          'The measurements were made with a Brewer MKIV spectrophotometer, serial number 153, operated at Maitri by the India Meteorological Department. A Brewer works by comparing the intensity of sunlight at several ultraviolet wavelengths that ozone absorbs to different degrees; the ratio between them gives the amount of ozone in the light path, and the geometry of the sun gives the column.',
          'Each row in this dataset is one observation day, carrying the day\u2019s column ozone, the column sulphur dioxide measured in the same retrieval, and the number of individual observations the daily value was computed from — between a handful and several dozen.',
        ],
      },
      {
        id: 'the-annual-cycle',
        heading: 'The annual cycle, and the hole in it',
        paragraphs: [
          'Averaged across the seven years, the column over Maitri follows a clear cycle: around 280 DU through the southern summer, a collapse to 163 DU in September and 155 DU in October, and a recovery through November and December. That collapse is the Antarctic ozone hole, and this is what it looks like measured from the ground by an Indian instrument rather than inferred from a satellite.',
          'The mechanism is now well understood. Through the polar night, chlorine and bromine compounds — largely of industrial origin — accumulate on the surfaces of polar stratospheric clouds in a form that is chemically inert in the dark. When sunlight returns in the austral spring, those compounds are released and destroy ozone catalytically, faster than it can be replenished. The hole closes when the polar vortex breaks down and ozone-rich air mixes back in.',
          'Maitri sits at 70.45°S, inside the region the vortex covers in most years, which is why the signal in this record is so pronounced.',
        ],
        figure: {
          kind: 'chart',
          caption: 'Mean total column ozone at Maitri by calendar month, averaged over all 753 observation days between 1999 and 2006. The September–October minimum is the ozone hole. The May–August figures rest on very few days and should be read with the caution described in the next section.',
          chart: {
            kind: 'bar',
            title: 'Mean column ozone by month, Maitri 1999–2006',
            unit: 'DU',
            caption: 'Each bar is the mean of every measured day in that calendar month across the seven-year record.',
            data: [
              { label: 'January', value: 283 },
              { label: 'February', value: 274 },
              { label: 'March', value: 276 },
              { label: 'April', value: 269 },
              { label: 'May', value: 292 },
              { label: 'June', value: 254 },
              { label: 'July', value: 270 },
              { label: 'August', value: 221 },
              { label: 'September', value: 163 },
              { label: 'October', value: 155 },
              { label: 'November', value: 207 },
              { label: 'December', value: 271 },
            ],
          },
        },
      },
      {
        id: 'the-winter-gap',
        heading: 'The gap in winter, and why it is not missing data',
        paragraphs: [
          'The observation days are distributed very unevenly through the year. December carries 123 measured days across the record, October 108, March 98 — but May has 4, June 5, July 8 and August 6. A reader meeting this dataset cold might reasonably suspect the instrument failed every winter.',
          'It did not. A Brewer spectrophotometer measures ozone by looking at the sun, and at 70°S the sun does not rise for a substantial part of the year. During polar night there is no direct-sun observation to make. The sparse May-to-August values come from the short twilight periods at the edges of that darkness, and because they rest on so few days they are far less reliable than the summer figures.',
          'This matters for anyone reusing the data: the monthly means for May through August in the chart above are computed from between four and eight days each, and should not be treated as comparable to the summer months. The per-day observation counts are published in the file precisely so this can be checked rather than assumed.',
        ],
      },
      {
        id: 'the-2006-minimum',
        heading: 'October 2006',
        paragraphs: [
          'The lowest column in the entire record — 108 DU — was measured on 13 October 2006, from 22 individual observations that day. Three of the four lowest readings in seven years fall in October 2006: 108 DU on the 13th, 112 DU on the 12th, and 112 DU on the 19th.',
          'That is consistent with what was observed across the continent that season. The 2006 Antarctic ozone hole was among the most severe on record by both area and depth, driven by an unusually cold and stable polar stratosphere. This record is one station\u2019s independent, ground-based measurement of that event.',
          'The other end of the range sits four years earlier: 401 DU on 25 October 2002, in a spring when the polar vortex split in an unprecedented major warming and ozone-rich mid-latitude air was drawn over the continent. An October reading of 401 DU and an October reading of 108 DU, from the same instrument at the same station, is the clearest illustration in this archive of how much Antarctic spring ozone varies from year to year.',
        ],
      },
      {
        id: 'provenance',
        heading: 'Where this data comes from',
        paragraphs: [
          'These are not NCPOR\u2019s own measurements. The observations were made by the India Meteorological Department at Maitri, a station operated by NCPOR, and were submitted to the World Ozone and Ultraviolet Radiation Data Centre, the WMO Global Atmosphere Watch archive for ozone data, where Maitri is registered as station 400 with GAW identifier MTR.',
          'The file published here was retrieved unmodified from the WOUDC data registry and reformatted as a single CSV. WOUDC data is free and unrestricted for scientific, educational and policy use on the condition that the contributing agency and the WOUDC are credited; that credit is carried in the header of the file itself as well as in the citation block on this record.',
        ],
      },
    ],
    dataset: {
      format: 'CSV, UTF-8',
      sizeLabel: '31 KB',
      rowCount: 753,
      coverage: 'Daily total column ozone at Maitri (70.45°S, 11.45°E, 330 m), 14 September 1999 to 31 December 2006.',
      downloadUrl: '/data/maitri-total-column-ozone-1999-2006.csv',
      columns: [
        { name: 'date_utc', unit: null, type: 'datetime', description: 'Observation day, UTC.' },
        { name: 'column_o3_du', unit: 'DU', type: 'number', description: 'Total column ozone in Dobson Units.' },
        { name: 'column_so2_du', unit: 'DU', type: 'number', description: 'Total column sulphur dioxide, retrieved alongside ozone.' },
        { name: 'n_observations', unit: null, type: 'number', description: 'Individual observations the daily value was computed from.' },
        { name: 'wavelength_code', unit: null, type: 'text', description: 'WOUDC wavelength-pair code used for the retrieval.' },
        { name: 'observation_code', unit: null, type: 'text', description: 'WOUDC observation-type code (direct sun, zenith sky).' },
        { name: 'instrument', unit: null, type: 'text', description: 'Instrument make, model and serial number.' },
      ],
      sampleRows: [
        { values: ['1999-09-14', '161', '1', '7', '0', '0', 'Brewer MKIV #153'] },
        { values: ['1999-09-15', '158', '1', '9', '0', '0', 'Brewer MKIV #153'] },
        { values: ['1999-09-16', '180', '1', '7', '0', '0', 'Brewer MKIV #153'] },
        { values: ['1999-09-17', '171', '1', '9', '0', '0', 'Brewer MKIV #153'] },
        { values: ['2006-10-13', '108', '5', '22', '0', '0', 'Brewer MKIV #153'] },
      ],
    },
    references: [
      { citation: 'World Ozone and Ultraviolet Radiation Data Centre (WOUDC) — Maitri, station 400. Data contributed by the India Meteorological Department.', url: 'https://woudc.org/en/data/stations/' },
      { citation: 'WOUDC data use policy — free and unrestricted use with attribution.', url: 'https://woudc.org/en/data/data-use-policy/' },
      { citation: 'WMO Global Atmosphere Watch Station Information System — Maitri (MTR).', url: 'https://gawsis.meteoswiss.ch/GAWSIS/index.html#/search/station/stationReportDetails/0-20008-0-MTR' },
      { citation: 'India Meteorological Department.', url: 'https://mausam.imd.gov.in' },
    ],
  },
  {
    id: 'd2',
    cat: 'dataset',
    kind: 'Dataset',
    title: 'Ozone Vertical Profiles\nfrom Maitri, 1994–2011',
    station: 'maitri',
    year: '1994–2011',
    pills: ['Ozone', 'Balloon sounding', 'WMO / GAW'],
    credit: 'INDIA METEOROLOGICAL DEPARTMENT',
    photos: ['/photos/field-camp.jpg'],
    body: [
      'One hundred and forty-three balloon-borne ozonesonde flights from Maitri between 8 January 1994 and 8 November 2011, carrying 7,555 measured levels in total. Each flight records pressure, temperature and ozone partial pressure as the balloon climbs, giving the vertical structure that a column measurement cannot.',
      'Where the Brewer record answers how much ozone was overhead, these profiles answer where in the atmosphere it was — which is what distinguishes ozone destroyed in the stratosphere from ozone simply redistributed.',
    ],
    table: [
      ['Instrument', 'Indian ozonesonde, balloon-borne'],
      ['Flights', '143'],
      ['Measured levels', '7,555'],
      ['Period', '8 Jan 1994 – 8 Nov 2011'],
      ['Levels per flight', '26 – 88'],
      ['Measured by', 'India Meteorological Department'],
      ['Archived by', 'WOUDC (WMO / GAW), station 400'],
    ],
    sections: [
      {
        id: 'how-a-sounding-works',
        heading: 'How a sounding works',
        paragraphs: [
          'An ozonesonde is an electrochemical cell carried aloft under a weather balloon. Air is pumped through a potassium iodide solution; ozone in the sample liberates iodine, which produces a current proportional to the ozone partial pressure. The cell is flown alongside a standard radiosonde, so every ozone reading arrives paired with the pressure and temperature at the same instant.',
          'The balloon rises through the troposphere and into the stratosphere until it bursts, typically well above the ozone layer. What comes back is a profile: a few dozen levels, each with a pressure, a temperature and an ozone partial pressure, ordered from the surface upward.',
          'Flights in this record carry between 26 and 88 levels, averaging 53. The variation is a matter of how high the balloon reached and how the flight was processed, not of instrument quality.',
        ],
      },
      {
        id: 'what-a-profile-shows',
        heading: 'What a profile shows that a column cannot',
        paragraphs: [
          'A total column measurement produces one number for the whole atmosphere. That number is what the ozone hole is usually reported in, and it is genuinely useful — but it cannot distinguish between ozone lost from the stratospheric layer where the hole forms and ozone gained or lost nearer the ground.',
          'A profile can. The Antarctic ozone hole is a specific, altitude-bounded phenomenon: destruction concentrated in the lower stratosphere, roughly between 14 and 22 km, where polar stratospheric clouds form and the chlorine chemistry runs. A spring profile from a station inside the vortex shows ozone partial pressure collapsing across exactly that band while the air above and below is comparatively untouched.',
          'That vertical fingerprint is how ground-based measurements confirm the mechanism rather than merely the outcome.',
        ],
      },
      {
        id: 'the-record-and-its-gaps',
        heading: 'The shape of the record',
        paragraphs: [
          'The flights are not evenly spread. The record runs 1994 to 2011 but is concentrated in two intervals: a sustained programme through 1994–1998, which contributed 94 of the 143 flights, and a later resumption across 2005, 2007, 2008 and 2011. The years between carry no flights in this archive.',
          'Balloon soundings are expensive in a way that a ground instrument is not — each flight consumes a sonde, a balloon and gas, all of which must be shipped a season in advance, and each needs people available to prepare and launch it. Gaps in a polar sounding record usually reflect logistics and programme funding rather than any judgement that the measurement stopped being worth making.',
          'Forty-seven of the flights carry an integrated total-ozone value computed from the profile itself, which makes them directly comparable with the Brewer column measurements published alongside this record.',
        ],
        figure: {
          kind: 'chart',
          caption: 'Ozonesonde flights from Maitri per year. The two clusters — 1994–1998 and 2005 onward — and the gap between them are a feature of the record that anyone reusing it needs to see before averaging across years.',
          chart: {
            kind: 'bar',
            title: 'Ozonesonde flights per year, Maitri',
            unit: 'flights',
            caption: 'Counted from the 143 flights held in the WOUDC archive for station 400.',
            data: [
              { label: '1994', value: 20 },
              { label: '1995', value: 18 },
              { label: '1996', value: 21 },
              { label: '1997', value: 19 },
              { label: '1998', value: 16 },
              { label: '2005', value: 18 },
              { label: '2007', value: 14 },
              { label: '2008', value: 9 },
              { label: '2011', value: 8 },
            ],
          },
        },
      },
      {
        id: 'using-the-profiles',
        heading: 'Using the profiles',
        paragraphs: [
          'The file is published flattened: one row per measured level, tagged with the date of the flight it belongs to and its index within that flight. Grouping by flight date reconstructs each profile in order. This shape was chosen over one-file-per-flight because it can be read directly into any analysis tool without stitching 143 files together first.',
          'Ozone partial pressure is in millipascals and pressure in hectopascals, as archived. Each row also repeats the flight\u2019s integrated total ozone and correction factor where those were reported, so a level can be interpreted without joining back to a separate flight table.',
        ],
      },
    ],
    dataset: {
      format: 'CSV, UTF-8',
      sizeLabel: '238 KB',
      rowCount: 7555,
      coverage: '143 balloon flights from Maitri, 8 January 1994 to 8 November 2011, flattened to one row per measured level.',
      downloadUrl: '/data/maitri-ozone-profiles-1994-2011.csv',
      columns: [
        { name: 'flight_date_utc', unit: null, type: 'datetime', description: 'Date of the flight the level belongs to, UTC.' },
        { name: 'level_index', unit: null, type: 'number', description: 'Position of the level within the flight, from the surface upward.' },
        { name: 'pressure_hpa', unit: 'hPa', type: 'number', description: 'Atmospheric pressure at the level.' },
        { name: 'temperature_c', unit: '°C', type: 'number', description: 'Air temperature at the level.' },
        { name: 'o3_partial_pressure_mpa', unit: 'mPa', type: 'number', description: 'Ozone partial pressure measured by the electrochemical cell.' },
        { name: 'flight_total_o3_du', unit: 'DU', type: 'number', description: 'Total ozone integrated from the profile, where reported.' },
        { name: 'correction_factor', unit: null, type: 'number', description: 'Correction factor applied to the flight, where reported.' },
      ],
      sampleRows: [
        { values: ['1994-01-08', '1', '973', '-2', '1.2', '', '0'] },
        { values: ['1994-01-08', '2', '926', '-5', '1.0', '', '0'] },
        { values: ['1994-01-08', '3', '871', '-10', '0.7', '', '0'] },
        { values: ['1994-01-08', '4', '760', '-17', '0.3', '', '0'] },
      ],
    },
    references: [
      { citation: 'World Ozone and Ultraviolet Radiation Data Centre (WOUDC) — ozonesonde records for Maitri, station 400. Data contributed by the India Meteorological Department.', url: 'https://woudc.org/en/data/stations/' },
      { citation: 'WOUDC data use policy — free and unrestricted use with attribution.', url: 'https://woudc.org/en/data/data-use-policy/' },
      { citation: 'WMO Global Atmosphere Watch Station Information System — Maitri (MTR).', url: 'https://gawsis.meteoswiss.ch/GAWSIS/index.html#/search/station/stationReportDetails/0-20008-0-MTR' },
    ],
  },
  {
    id: 'd3',
    cat: 'dataset',
    kind: 'Dataset',
    title: 'Aerosols at Maitri and\nBharati, IPY 2007–08',
    station: 'bharati',
    year: '2008',
    pills: ['Aerosols', 'International Polar Year', 'Both stations'],
    credit: 'CHAUBEY, MOORTHY, BABU & NAIR (2011)',
    photos: ['/photos/bharati-station.jpg'],
    body: [
      'Total aerosol mass concentration measured at both Indian Antarctic stations during the International Polar Year, austral summer 2008: 8,250 ng/m³ at Maitri over 5 January to 13 February, and 6,030 ng/m³ at the Larsemann Hills site that would become Bharati, over 24 February to 10 March.',
      'The measurements were made with a quartz crystal microbalance alongside sun photometry, and are published with a DOI under a Creative Commons Attribution licence — making this the one record in the archive whose underlying data carries a formal citation of its own.',
    ],
    table: [
      ['Maitri', '8,250 ± 2,870 ng/m³'],
      ['Larsemann Hills', '6,030 ± 1,330 ng/m³'],
      ['Method', 'Quartz crystal microbalance / sun photometer'],
      ['Period', '5 Jan – 10 Mar 2008'],
      ['Published by', 'PANGAEA'],
      ['DOI', '10.1594/PANGAEA.808285'],
      ['Licence', 'CC BY 3.0'],
    ],
    sections: [
      {
        id: 'why-measure-aerosols-here',
        heading: 'Why measure aerosols here',
        paragraphs: [
          'Aerosols are the suspended solid and liquid particles in the air — dust, sea salt, sulphates, soot. They scatter and absorb sunlight, and they provide the surfaces on which cloud droplets form, which makes their concentration one of the larger remaining uncertainties in how much the planet will warm.',
          'Antarctica matters to that question out of proportion to its population, because it is the closest thing on Earth to an atmosphere without people in it. A measurement made at Maitri is close to a measurement of the background state: what the air contains before industry is added. Every estimate of how much humans have changed the atmosphere is a comparison against a baseline, and this is where the baseline is measured.',
        ],
      },
      {
        id: 'the-two-stations',
        heading: 'Two stations, two numbers',
        paragraphs: [
          'The measurements give 8,250 ng/m³ at Maitri and 6,030 ng/m³ at the Larsemann Hills, with standard deviations of 2,870 and 1,330 respectively. The Maitri figure is both higher and considerably more variable.',
          'The two sites are roughly 3,000 km apart on opposite flanks of East Antarctica and differ in ways that plausibly bear on the result: Maitri sits inland in a rock oasis, while the Larsemann Hills site is coastal. Continental sites see more locally raised dust from exposed rock and moraine; coastal sites see more marine aerosol and generally cleaner air masses. The spread on the Maitri figure — a standard deviation more than double that of the coastal site — is consistent with a more episodic local source.',
          'The two measurement windows do not overlap, so the comparison is between different weeks as well as different places, and should be read as indicative rather than as a controlled contrast.',
        ],
        figure: {
          kind: 'chart',
          caption: 'Total aerosol mass concentration at the two Indian Antarctic stations during the International Polar Year summer of 2008. Values as published in Chaubey et al. (2011).',
          chart: {
            kind: 'bar',
            title: 'Total aerosol mass concentration, IPY 2007–08',
            unit: 'ng/m³',
            caption: 'One bar per station, as reported in the source dataset.',
            data: [
              { label: 'Maitri', value: 8250 },
              { label: 'Larsemann Hills', value: 6030 },
            ],
          },
        },
      },
      {
        id: 'international-polar-year',
        heading: 'The International Polar Year',
        paragraphs: [
          'These measurements were made during the International Polar Year of 2007–08, the fourth in a series stretching back to 1882–83 — coordinated intervals in which the countries working at the poles concentrate their observations into the same window so that results from different stations can be compared directly.',
          'That coordination is what gives a single-season measurement at two Indian stations more weight than it would otherwise carry: it sits inside a much larger set of contemporaneous observations made across the continent.',
        ],
      },
      {
        id: 'a-small-honest-dataset',
        heading: 'A small dataset, published properly',
        paragraphs: [
          'This is the smallest dataset in the archive — two summary values with their uncertainties, plus a companion table of aerosol optical depth. It is included because of how it is published rather than despite its size: deposited with PANGAEA, assigned a DOI, released under a Creative Commons Attribution licence, and therefore citable and permanently resolvable by anyone.',
          'A two-row dataset that can be cited and retrieved a decade later is worth more to the scientific record than a large one that exists only on a hard drive at a station. The file itself stays at PANGAEA, where its DOI resolves; this record links there rather than rehosting a copy that could silently drift from the version of record.',
        ],
      },
    ],
    dataset: {
      format: 'Tab-delimited text (via PANGAEA)',
      sizeLabel: '2 KB',
      rowCount: 2,
      coverage: 'Maitri (70.767°S, 11.732°E) and Larsemann Hills (69.408°S, 76.187°E), 5 January to 10 March 2008.',
      downloadUrl: 'https://doi.pangaea.de/10.1594/PANGAEA.808285?format=textfile',
      columns: [
        { name: 'Event', unit: null, type: 'text', description: 'Event label for the measurement campaign.' },
        { name: 'Station', unit: null, type: 'text', description: 'Measurement station.' },
        { name: 'Date/Time', unit: null, type: 'datetime', description: 'Start of the measurement window.' },
        { name: 'Date/time end', unit: null, type: 'datetime', description: 'End of the measurement window.' },
        { name: 'Sample method', unit: null, type: 'text', description: 'Instrumentation used.' },
        { name: 'Aerosols', unit: 'ng/m³', type: 'number', description: 'Total aerosol mass concentration.' },
        { name: 'Std dev', unit: 'ng/m³', type: 'number', description: 'Standard deviation of the measurement.' },
      ],
      sampleRows: [
        { values: ['Maitri', 'Maitri', '2008-01-05', '2008-02-13', 'QCM / Sun Photometer', '8250', '2870'] },
        { values: ['LarsemHills', 'Larsemann Hills (LH)', '2008-02-24', '2008-03-10', 'QCM / Sun Photometer', '6030', '1330'] },
      ],
    },
    references: [
      { citation: 'Chaubey, J P; Moorthy, K K; Babu, S S; Nair, V S (2011): Total mass concentration of aerosols in Maitri and Larsemann Hills Station, Antarctica. PANGAEA. CC BY 3.0.', url: 'https://doi.pangaea.de/10.1594/PANGAEA.808285' },
      { citation: 'Chaubey, J P et al. (2011): Aerosol total mass concentration and optical depth during IPY 2007-2008 at Maitri and Larsemann Hills Station.', url: 'https://doi.pangaea.de/10.1594/PANGAEA.808290' },
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
    sections: [
      {
        id: 'the-question',
        heading: 'The question',
        paragraphs: [
          'The Larsemann Hills are a small area of ice-free rock on the Prydz Bay coast, and the rocks exposed there are very old. They record metamorphism — heating and deformation deep in the crust — from a period when the landmasses that are now India, Antarctica, Australia and Africa were joined.',
          'That makes the outcrop useful out of all proportion to its size. Reconstructing how those continents fitted together depends on matching rocks on one side of a former join to rocks on the other, and the Larsemann Hills are one of the places where the Antarctic half of such a match is accessible.',
        ],
      },
      {
        id: 'field-and-laboratory',
        heading: 'Field and laboratory work',
        paragraphs: [
          'The study combined field mapping with laboratory petrology and geochronology. Structural relationships — which rock cuts which, which fabric overprints which — were established in the field, because that ordering cannot be recovered from a hand specimen once it leaves the outcrop.',
          'Samples were then sectioned for mineral assemblage work and dated radiometrically. Assemblages give the pressure and temperature the rock experienced; dating gives when. Neither alone reconstructs a metamorphic history; together they do.',
        ],
      },
      {
        id: 'findings',
        heading: 'What the rocks record',
        paragraphs: [
          'The sequence records high-grade metamorphism followed by a distinct later overprint, consistent with the area having been affected by more than one orogenic episode rather than a single continuous event. The pressure–temperature path recovered from the assemblages implies burial to mid-crustal depths and subsequent exhumation.',
          'Placed alongside comparable work on formerly adjacent terrains, the result contributes a datum to the correlation between East Antarctica and the Indian shield — the specific kind of evidence on which Gondwana reconstructions are built.',
        ],
      },
      {
        id: 'why-it-matters',
        heading: 'Why it matters beyond geology',
        paragraphs: [
          'Continental reconstructions are not only historical curiosity. They constrain where mineral belts continue across a rifted margin, and they underpin models of how the Antarctic ice sheet sits on the bedrock beneath it — which in turn feeds into how that ice sheet is expected to behave.',
        ],
      },
    ],
    references: [
      { citation: 'Antarctic Treaty Secretariat — Larsemann Hills Antarctic Specially Managed Area', url: 'https://www.ats.aq' },
      { citation: 'National Centre for Polar and Ocean Research — geoscience programme', url: 'https://ncpor.res.in' },
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
    sections: [
      {
        id: 'what-a-katabatic-wind-is',
        heading: 'What a katabatic wind is',
        paragraphs: [
          'Air over the Antarctic plateau cools by radiating heat to space. Cold air is dense, and dense air on a slope runs downhill. That is the whole mechanism: no weather system is required, no front passes, and the wind can arrive under a clear sky.',
          'What makes it formidable is the geometry of the continent. The plateau is high, the coast is far, and the slope between them is continuous — so the flow accelerates over hundreds of kilometres before it reaches the stations and the coast, arriving as a sustained gravity-driven wind rather than a gust.',
        ],
      },
      {
        id: 'observations',
        heading: 'The observational basis',
        paragraphs: [
          'The study draws on continuous automatic weather station records from Queen Maud Land, which is what allows katabatic events to be characterised at all. These winds are most intense exactly when nobody is outside taking manual observations, so a hand-logged record systematically misses them.',
          'Events were identified from the combination of wind speed, direction, and the temperature signature of downslope flow, then described in terms of onset, duration and decay rather than peak speed alone.',
        ],
      },
      {
        id: 'what-the-regimes-look-like',
        heading: 'The regimes',
        paragraphs: [
          'The record separates into a persistent background drainage flow — near-constant, directionally stable, following the fall line of the terrain — and discrete strong events with rapid onset that can last for days. The direction of the background flow is remarkably steady, which is what a terrain-driven wind should look like and what distinguishes it from synoptic wind.',
          'Event frequency and intensity vary through the season, with the strongest events concentrated in the darker months when radiative cooling of the plateau is strongest.',
        ],
      },
      {
        id: 'consequences',
        heading: 'Why the regime matters',
        paragraphs: [
          'Katabatic flow moves snow. It drives the drift that buries structures and reworks the surface, and its convergence patterns partly determine where snow accumulates and where it is scoured away — which feeds directly into ice sheet mass balance calculations.',
          'Operationally it sets the limits of the field season. Traverse planning, aircraft operations and the siting of camps and instruments are all constrained by a wind that can arrive without a weather system to warn of it.',
        ],
      },
    ],
    references: [
      { citation: 'World Meteorological Organization — Antarctic observing programmes', url: 'https://public.wmo.int' },
      { citation: 'National Centre for Polar and Ocean Research — atmospheric sciences', url: 'https://ncpor.res.in' },
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
    sections: [
      {
        id: 'before-the-centre',
        heading: 'Before there was a centre',
        paragraphs: [
          'For the first fifteen years, India’s Antarctic programme was run expedition by expedition. Each season was organised, staffed and equipped as its own undertaking, and the scientific results went back to the institutions the researchers had come from. That worked to get the programme started, and it scaled badly.',
          'A programme organised around expeditions has no natural home for the things that outlast an expedition: long-term measurement series, the accumulated logistics knowledge of how to get people and cargo onto the ice safely, and the data itself.',
        ],
      },
      {
        id: 'establishment',
        heading: 'Establishment',
        paragraphs: [
          'The National Centre for Polar and Ocean Research was established in 1998 at Vasco da Gama, Goa, as an autonomous institution under what is now the Ministry of Earth Sciences. Its remit was to give the programme a permanent institutional base: to plan and execute the expeditions, to operate the stations, and to hold the science.',
          'The choice of a coastal location was practical. A polar programme is a maritime programme, and the centre sits where the ships and the ocean-science community already were.',
        ],
      },
      {
        id: 'what-it-does',
        heading: 'What the centre does',
        paragraphs: [
          'NCPOR plans and mounts the annual Indian Scientific Expedition to Antarctica, operates Maitri and Bharati, and runs India’s Arctic research station Himadri at Ny-Ålesund together with Southern Ocean and Himalayan cryosphere programmes. It also represents India in the international bodies that govern Antarctic science and conservation.',
          'The institutional continuity is the point. Long-term monitoring only exists if an organisation is accountable for it in years when it produces nothing newsworthy.',
        ],
      },
      {
        id: 'data-stewardship',
        heading: 'Custody of the data',
        paragraphs: [
          'The centre is also the custodian of what the programme has collected: the expedition records, the instrument series, the samples and the imagery. This repository is part of that responsibility — published records carry a stable identifier, an explicit licence, and the provenance of where they came from, so that a result can be cited and traced rather than merely referred to.',
        ],
        figure: {
          kind: 'table',
          caption: 'The institution at a glance.',
          rows: [
            { label: 'Established', value: '1998' },
            { label: 'Location', value: 'Vasco da Gama, Goa' },
            { label: 'Parent ministry', value: 'Ministry of Earth Sciences' },
            { label: 'Antarctic stations', value: 'Maitri, Bharati' },
            { label: 'Arctic station', value: 'Himadri, Ny-Ålesund' },
            { label: 'Remit', value: 'Polar and Southern Ocean research, expeditions, data custody' },
          ],
        },
      },
    ],
    references: [
      { citation: 'National Centre for Polar and Ocean Research', url: 'https://ncpor.res.in' },
      { citation: 'Ministry of Earth Sciences', url: 'https://moes.gov.in' },
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
    photos: ['/photos/icebreaker.jpg', '/photos/field-camp.jpg'],
    sections: [
      {
        id: 'the-ship-is-the-programme',
        heading: 'The ship is the programme',
        paragraphs: [
          'Nothing reaches an Indian Antarctic station except by sea. Every litre of fuel, every food container, every replacement instrument, every member of every expedition and every sample brought home travels on a chartered ice-class vessel, on a schedule fixed roughly a year in advance and revised continuously against ice conditions.',
          'This is the least visible part of the programme and the part everything else depends on. A season’s science is planned around what the ship can carry and when it can be alongside; a missed window is not an inconvenience but a lost year of fieldwork.',
        ],
        figure: {
          kind: 'photo',
          caption: 'The chartered ice-class vessel that carries the expedition south. Cargo, fuel, people and returning samples all move on this one hull.',
          photoUrl: '/photos/icebreaker.jpg',
        },
      },
      {
        id: 'the-voyage',
        heading: 'The voyage south',
        paragraphs: [
          'The passage runs from an Indian or intermediate port across the Indian Ocean and through the Southern Ocean to the ice edge — weeks at sea, crossing some of the roughest water on the planet. The vessel is ice-strengthened rather than a heavy icebreaker, which means route choice matters: it works with the ice rather than through it.',
          'The voyage is itself a research platform. Underway oceanographic and meteorological observations are collected along the transect, which is why a resupply run also produces data from parts of the Southern Ocean that no station can reach.',
        ],
      },
      {
        id: 'offload',
        heading: 'Offload',
        paragraphs: [
          'Reaching the ice edge is not arriving. Cargo has to be moved from ship to shore across sea ice or by small boat and helicopter, in an order determined by what is needed first at the far end, while the surface stays sound and the weather holds. The offload is the single highest-risk operation of the season and the one most exposed to conditions nobody controls.',
          'Once ashore, everything must be moved inland and stored where it will be usable a year later — including the fuel that will keep the station alive through the winter.',
        ],
      },
      {
        id: 'the-return',
        heading: 'The return',
        paragraphs: [
          'The ship carries back the outgoing expedition, the season’s samples, and the waste the programme is obliged under the Antarctic Treaty’s environmental protocol to remove rather than leave behind. Nothing is disposed of on the continent that can be carried home.',
          'A resupply cycle is therefore three things at once: a logistics operation, a research platform, and the mechanism by which India meets its environmental obligations in Antarctica.',
        ],
        figure: {
          kind: 'table',
          caption: 'What a resupply season moves.',
          rows: [
            { label: 'Cadence', value: 'One austral summer voyage per season' },
            { label: 'Vessel', value: 'Chartered ice-class ship' },
            { label: 'Carries out', value: 'Fuel, cargo, food, instruments, expedition members' },
            { label: 'Carries back', value: 'Samples, returning members, all removable waste' },
            { label: 'Collected underway', value: 'Oceanographic and meteorological transect data' },
          ],
        },
      },
    ],
    references: [
      { citation: 'Protocol on Environmental Protection to the Antarctic Treaty', url: 'https://www.ats.aq' },
      { citation: 'National Centre for Polar and Ocean Research — logistics', url: 'https://ncpor.res.in' },
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
