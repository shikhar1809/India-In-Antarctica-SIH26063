/**
 * archive.js — the National Polar Data Archive.
 *
 * This is the "knowledge repository" half of the problem statement, expressed
 * as collectable records. Each record is locked until the player physically
 * finds the thing it describes in the 3D world, which is the whole pedagogical
 * trick: you do not read about an ice core, you drill one, and the drilling
 * unlocks the dataset.
 *
 * `figure` names a renderer in ui/figures.js so datasets draw as real charts
 * rather than sitting as dead text.
 */

import { SIDEQUESTS } from './sidequests.js';

export const CATEGORIES = [
  { id: 'expedition', label: 'Expedition Reports' },
  { id: 'dataset',    label: 'Datasets' },
  { id: 'publication',label: 'Publications' },
  { id: 'media',      label: 'Photographs & Video' },
  { id: 'institution',label: 'Institutional' }
];

export const ENTRIES = [
  /* ---------------------------------------------------------- EXPEDITION */
  {
    id: 'exp-1981',
    cat: 'expedition',
    kind: 'Expedition Report',
    title: 'First Indian Expedition to Antarctica, 1981–82',
    station: 'maitri',
    pills: ['1981–82', 'Operation Gangotri', '21 members'],
    body: [
      'On 6 December 1981 the chartered vessel *Polar Circle* left Goa carrying 21 people and a secret. ' +
      'The expedition was planned in near-total confidentiality — India was not yet a Consultative Party ' +
      'to the Antarctic Treaty, and a failed landing would have been a public embarrassment.',
      'The team, led by **Dr Syed Zahoor Qasim**, made landfall on 9 January 1982 and planted the Indian ' +
      'flag on the ice. They stayed a matter of weeks, collected the first Indian oceanographic and ' +
      'biological samples from the Southern Ocean, and left nothing permanent behind.',
      'It was enough. In 1983 India signed the Antarctic Treaty; within a year it had a station.'
    ]
  },
  {
    id: 'exp-dg-build',
    cat: 'expedition',
    kind: 'Expedition Report',
    title: 'Third Expedition: Building Dakshin Gangotri, 1983–84',
    station: 'gangotri',
    pills: ['1983–84', 'Ice shelf', '26 Jan 1984'],
    body: [
      'The third expedition carried a building. Prefabricated timber sections were unloaded onto the ' +
      'ice shelf and assembled into two blocks: **Block A** held generators, fuel and workshops; ' +
      '**Block B** held the laboratories and the radio room.',
      'It was commissioned on **26 January 1984** — Republic Day — and became India\'s first permanent ' +
      'Antarctic station. Power was solar. Data recording was fully computerised, which in 1984 was ' +
      'genuinely unusual for a polar base. Communication ran over an Inmarsat terminal and amateur radio.',
      'The site had one flaw that no amount of engineering could fix: it was built on ice, and ice moves.'
    ]
  },
  {
    id: 'exp-dg-loss',
    cat: 'expedition',
    kind: 'Field Note',
    title: 'Why Dakshin Gangotri Was Abandoned',
    station: 'gangotri',
    pills: ['1990', 'Snow accumulation', 'Buried'],
    body: [
      'Snow does not melt in Antarctica. It accumulates. Every season, drift built up against and over ' +
      'the timber blocks faster than crews could dig it out, and the ice shelf beneath the station kept ' +
      'creeping seaward, straining the structure.',
      'On **25 February 1990**, after roughly six years, the station was abandoned. The ice closed over it. ' +
      'The site is still used as a supply depot and transit camp, but the original building is buried and ' +
      'cannot be surveyed.',
      'Every Indian station built since has followed two rules learned here: **build on rock, not ice**, ' +
      'and **stand the building on legs** so wind sweeps snow underneath instead of piling it against a wall.'
    ]
  },
  {
    id: 'exp-maitri-build',
    cat: 'expedition',
    kind: 'Expedition Report',
    title: 'Establishing Maitri, 1988–89',
    station: 'maitri',
    pills: ['1989', 'Schirmacher Oasis', 'On rock'],
    body: [
      'The site was chosen in 1988 and the station raised in January 1989, roughly 15 km from the ' +
      'doomed Dakshin Gangotri but in a completely different setting: the **Schirmacher Oasis**, a ' +
      'wind-scoured, ice-free corridor of bare rock about 100 km inland from the coast.',
      'Bare rock means no accumulation and a stable foundation. The building is a single elongated block ' +
      'raised on a **steel stilt understructure**, and it has now been operating for over three decades — ' +
      'six times the life Dakshin Gangotri managed.',
      'Maitri is scheduled for replacement by **Maitri-II**, targeted between 2029 and 2032.'
    ]
  },
  {
    id: 'exp-bharati-build',
    cat: 'expedition',
    kind: 'Expedition Report',
    title: 'Two Summers to Build Bharati, 2010–2012',
    station: 'bharati',
    pills: ['2010/11–2011/12', 'Larsemann Hills', '18 Mar 2012'],
    body: [
      'Bharati was assembled across two Antarctic summer seasons in the **Larsemann Hills**, on the ' +
      'Prydz Bay coast between Thala Fjord and Quilty Bay — roughly 3,000 km around the continent from Maitri.',
      'The construction method was chosen for the shipping constraint, not for looks: **134 standard 20 ft ' +
      'ISO containers** were shipped in, interlocked into a load-bearing frame, and then wrapped in an ' +
      'insulated steel skin. The containers do the structure; the skin does the aerodynamics.',
      'It was commissioned on **18 March 2012** as India\'s third Antarctic station, with a minimum ' +
      'design life of 25 years.'
    ]
  },

  /* ------------------------------------------------------------ DATASETS */
  {
    id: 'ds-icecore',
    cat: 'dataset',
    kind: 'Dataset',
    title: 'Ice Core Stratigraphy — Annual Layer Record',
    station: 'maitri',
    pills: ['Glaciology', 'δ¹⁸O', 'CSV · 1.2 MB'],
    figure: 'icecore',
    body: [
      'Snow falls, is buried, and is squeezed into ice. Each year leaves a layer, and each layer traps a ' +
      'sealed bubble of the atmosphere as it was that year. Drill down and you are reading a diary written ' +
      'by the sky.',
      'Two things are measured in every slice. **δ¹⁸O** — the ratio of heavy to light oxygen in the ice — ' +
      'records how cold it was when that snow fell. **Trapped CO₂** records what was in the air.',
      'The record you recovered shows the pattern that makes climate scientists nervous: temperature and ' +
      'CO₂ move together, for tens of thousands of years, and then the last century goes somewhere the ' +
      'previous 800,000 years never did.'
    ],
    table: [
      ['Depth range', '0 – 120 m (this core)'],
      ['Layers resolved', '412 annual bands'],
      ['Proxy', 'δ¹⁸O, trapped CO₂, dust flux'],
      ['Instrument', 'Electromechanical drill, 98 mm barrel'],
      ['Repository', 'NCPOR Ice Core Laboratory, Goa']
    ]
  },
  {
    id: 'ds-weather',
    cat: 'dataset',
    kind: 'Dataset',
    title: 'Automatic Weather Station — Annual Cycle',
    station: 'maitri',
    pills: ['Meteorology', 'AWS', 'Hourly'],
    figure: 'weather',
    body: [
      'An Automatic Weather Station reports temperature, pressure, wind speed and direction every hour, ' +
      'through the winter, when nobody is there to read it.',
      'The annual cycle at Maitri has a shape you will not see anywhere in India. Summer peaks barely ' +
      'above freezing. Winter runs to **−35 °C and below**. And the wind — the **katabatic** wind — is ' +
      'not weather in the ordinary sense at all: it is cold, dense air draining off the high polar ' +
      'plateau under its own weight, accelerating downhill, sometimes for days without stopping.',
      'These records feed India\'s monsoon forecasting. The Southern Ocean and the Indian monsoon are ' +
      'the same coupled system, which is why a weather mast on a rock in Queen Maud Land matters to a ' +
      'farmer in Maharashtra.'
    ],
    table: [
      ['Summer mean', '−5 °C (Dec–Feb)'],
      ['Winter mean', '−32 °C (Jun–Aug)'],
      ['Record low', '−38 °C'],
      ['Peak katabatic gust', '> 90 kt'],
      ['Transmission', 'Satellite, hourly']
    ]
  },
  {
    id: 'ds-ozone',
    cat: 'dataset',
    kind: 'Dataset',
    title: 'Total Column Ozone — The Antarctic Hole',
    station: 'maitri',
    pills: ['Atmospheric science', 'Dobson Units', '1979–present'],
    figure: 'ozone',
    body: [
      'Every Antarctic spring, ozone over the continent collapses. Chlorine from CFCs — refrigerants and ' +
      'aerosol propellants released a hemisphere away — sits locked in polar stratospheric clouds through ' +
      'the dark winter, and then the returning sunlight sets off the destruction.',
      'The measurement is in **Dobson Units**. Below 220 DU counts as "hole". The minimum bottomed out ' +
      'around the late 1990s.',
      'And then it started to recover. The **Montreal Protocol** banned the chemicals, and the ozone layer ' +
      'is now on track to return to 1980 levels around 2066. It is the strongest evidence humanity has ' +
      'that a global environmental agreement can actually work — and stations like Maitri are how we know.'
    ]
  },
  {
    id: 'ds-magnet',
    cat: 'dataset',
    kind: 'Dataset',
    title: 'Geomagnetic Observatory — Magnetometer Log',
    station: 'maitri',
    pills: ['Geomagnetism', 'nT', 'IAGA'],
    body: [
      'Maitri sits close to the southern auroral oval, which makes it an unusually good place to watch ' +
      'the Earth\'s magnetic field being pushed around by the Sun.',
      'When a coronal mass ejection arrives, the field measured here can swing by hundreds of ' +
      '**nanotesla** within minutes — a geomagnetic storm. The same storms induce currents in power grids ' +
      'and scramble satellite navigation, so the log is not only of academic interest.',
      'Data is contributed to the international **IAGA** network, so a reading taken on a rock in Queen ' +
      'Maud Land ends up in a global model used by everyone.'
    ]
  },
  {
    id: 'ds-krill',
    cat: 'dataset',
    kind: 'Dataset',
    title: 'Southern Ocean Krill Survey',
    station: 'bharati',
    pills: ['Marine biology', 'Acoustic + net', 'Prydz Bay'],
    figure: 'foodweb',
    body: [
      'Almost every large animal in the Southern Ocean eats **Antarctic krill**, or eats something that ' +
      'does. A single swarm can run to millions of tonnes and be visible from orbit.',
      'Krill graze on algae growing on the underside of sea ice. Less sea ice means less algae, which ' +
      'means fewer krill, which means fewer penguins, seals and whales. The food web is short and it is ' +
      'brittle — which is exactly why it is worth surveying every season.',
      'Surveys from Bharati combine acoustic echo-sounding with net hauls in Prydz Bay, and feed the ' +
      '**CCAMLR** catch limits that govern the commercial krill fishery.'
    ]
  },

  /* -------------------------------------------------------- PUBLICATIONS */
  {
    id: 'pub-larsemann',
    cat: 'publication',
    kind: 'Publication',
    title: 'Larsemann Hills: An Antarctic Oasis Under Pressure',
    station: 'bharati',
    pills: ['Peer-reviewed', 'ASMA 6', 'Multi-national'],
    body: [
      'Bharati sits roughly 2,300 km from Maitri as the crow flies, and closer to 3,000 km by the ' +
      'sea and coastal route ships and aircraft actually take — nobody flies a straight line through ' +
      'the interior. The Larsemann Hills are one of only two ice-free coastal oases in East Antarctica ' +
      'with more than one nation operating there: India, China and Russia all maintain stations within ' +
      'a few kilometres of each other.',
      'That concentration is why the area is designated **Antarctic Specially Managed Area No. 6** — a ' +
      'jointly agreed management plan covering waste, fuel handling, vehicle routes and the protection of ' +
      'the freshwater lake systems.',
      'Bharati\'s environmental design is a direct response: sewage treatment, waste segregation and ' +
      'return-to-ship, and a building skin engineered to minimise the snow-drift footprint on surrounding terrain.'
    ]
  },
  {
    id: 'pub-lichen',
    cat: 'publication',
    kind: 'Publication',
    title: 'Cryptogamic Flora of the Schirmacher Oasis',
    station: 'maitri',
    pills: ['Biology', 'Lichens & mosses', 'Extremophiles'],
    body: [
      'There are no trees, no shrubs and no grasses here. What lives on the rock around Maitri is ' +
      '**lichen** — an alga and a fungus operating as a single organism — along with mosses and ' +
      'cyanobacterial mats in the meltwater margins.',
      'These are among the slowest-growing organisms on Earth. A lichen patch the width of your palm may ' +
      'have taken a century. They survive by shutting down entirely when frozen or dry, and restarting ' +
      'when meltwater appears for a few weeks each summer.',
      'They matter to astrobiology for an obvious reason: if life persists here, in this, then the ' +
      'question of life on Mars becomes a question about liquid water rather than about temperature.'
    ]
  },
  {
    id: 'pub-monsoon',
    cat: 'publication',
    kind: 'Publication',
    title: 'Southern Ocean Forcing of the Indian Monsoon',
    station: 'bharati',
    pills: ['Climate', 'Teleconnection', 'MoES priority'],
    body: [
      'This is the answer to the question every Indian schoolchild eventually asks: why does India spend ' +
      'money on Antarctica?',
      'The Southern Ocean is the planet\'s heat and carbon sink. Sea-ice extent around Antarctica alters ' +
      'the temperature gradient across the whole Indian Ocean basin, and that gradient is one of the ' +
      'controls on the timing and strength of the **southwest monsoon**.',
      'Antarctic observations are therefore a direct input to monsoon prediction — which is a direct input ' +
      'to sowing decisions, reservoir management and food security for over a billion people. The polar ' +
      'programme sits under the **Ministry of Earth Sciences** alongside the meteorological department ' +
      'for exactly this reason.'
    ]
  },

  /* ---------------------------------------------------------- MEDIA */
  {
    id: 'med-maitri-front',
    cat: 'media',
    kind: 'Photograph',
    title: 'Maitri Station — Front Elevation',
    station: 'maitri',
    pills: ['Exterior', 'Flag line', 'Reference plate'],
    body: [
      'The front elevation of Maitri, seen from the approach path. The details worth noticing are all ' +
      'structural: the building floats about three metres clear of the ground on a **red-oxide steel ' +
      'stilt frame**, so the wind scours snow out from underneath rather than banking it against a wall.',
      'The **tricolour** is painted directly onto the central facade panel, and the roof carries the ' +
      'station name in individual letters. Flags along the front mark the international stations that ' +
      'share the Schirmacher Oasis and cooperate on logistics — Russia\'s Novolazarevskaya is about 5 km away.',
      'White-painted stone markers line the path, which is how you navigate here when drifting snow ' +
      'erases every other landmark.'
    ]
  },
  {
    id: 'med-bharati-shell',
    cat: 'media',
    kind: 'Photograph',
    title: 'Bharati Station — Aerodynamic Shell',
    station: 'bharati',
    pills: ['Exterior', 'Container structure', 'Reference plate'],
    body: [
      'Bharati from the water\'s edge. The faceted skin is not styling — it is the wind solution. Flat ' +
      'walls create a lee where snow settles and accumulates until it buries you; angled surfaces keep ' +
      'the airflow attached so drift carries on past the building.',
      'Under the skin are **134 shipping containers**, still recognisable in the interior layout. The ' +
      'containers you can see stacked around the site are the construction leftovers, now used for ' +
      'storage — the cheapest possible Antarctic warehouse.',
      'The whole assembly stands on steel columns, three floors, over 12 m tall, about 2,500 m² of floor area.'
    ]
  },
  {
    id: 'med-aurora',
    cat: 'media',
    kind: 'Video',
    title: 'Aurora Australis over Maitri',
    station: 'maitri',
    pills: ['Timelapse', 'Winter', 'Outreach'],
    body: [
      'The southern lights. Charged particles from the Sun spiral down the Earth\'s magnetic field lines ' +
      'and collide with atmospheric gases about 100 km up. **Oxygen glows green**, and red at higher ' +
      'altitude; **nitrogen glows blue-violet**.',
      'Maitri sits near the auroral oval, so during the winter months — when the sun does not rise at all — ' +
      'the aurora is a routine part of the sky rather than a rare event.',
      'Footage like this is the single most effective outreach asset the programme has. It is also science: ' +
      'the same events the camera records are the ones the magnetometer is logging.'
    ]
  },
  {
    id: 'med-winter',
    cat: 'media',
    kind: 'Video',
    title: 'Wintering Over: The 13-Member Team',
    station: 'maitri',
    pills: ['Human interest', 'Isolation', '8 months'],
    body: [
      'When the last aircraft leaves in February, a small team stays. For about eight months there is no ' +
      'flight in and no flight out — not for illness, not for emergency, not for anything.',
      'The winter crew is typically around a dozen people: a doctor, engineers, a cook, communications, ' +
      'and the scientists whose instruments must keep running through the dark. The cook, universally, is ' +
      'the most important person on the base.',
      'They keep the station alive, keep the data flowing, and celebrate Midwinter Day on 21 June — the ' +
      'Antarctic new year, marking the point when the sun begins its return.'
    ]
  },

  /* ------------------------------------------------------- INSTITUTIONAL */
  {
    id: 'inst-ncpor',
    cat: 'institution',
    kind: 'Institutional',
    title: 'NCPOR — National Centre for Polar and Ocean Research',
    station: 'maitri',
    pills: ['Vasco-da-Gama, Goa', 'Est. 1998', 'MoES'],
    body: [
      'Every Indian Antarctic expedition is planned, staffed, supplied and archived from a single campus ' +
      'in **Vasco-da-Gama, Goa**. NCPOR is the nodal agency of the **Ministry of Earth Sciences** for ' +
      'polar and Southern Ocean research.',
      'Its remit runs past Antarctica: **Himadri** in Svalbard in the Arctic, **IndARC** moored in the ' +
      'Kongsfjorden, and the Southern Ocean expeditions aboard chartered research vessels.',
      'It also holds the archive — the ice cores, the sediment cores, the rock samples and the datasets ' +
      'that every expedition brings home. That repository is what this portal exists to open up.'
    ],
    table: [
      ['Founded', '1998 (as NCAOR)'],
      ['Parent', 'Ministry of Earth Sciences'],
      ['Antarctic stations', 'Maitri, Bharati'],
      ['Arctic station', 'Himadri, Svalbard'],
      ['Ocean mooring', 'IndARC, Kongsfjorden']
    ]
  },
  {
    id: 'inst-treaty',
    cat: 'institution',
    kind: 'Institutional',
    title: 'The Antarctic Treaty System',
    station: 'maitri',
    pills: ['1959 / 1961', 'India: 1983', 'Consultative Party'],
    body: [
      'Antarctica belongs to nobody. The **Antarctic Treaty**, signed in 1959 and in force from 1961, ' +
      'sets the continent aside for peace and science: no military activity, no nuclear testing, no ' +
      'waste disposal, and complete freedom of scientific investigation with an obligation to share results.',
      'India acceded in **1983** and became a **Consultative Party** — a full voting member — the same ' +
      'year, on the strength of having mounted real expeditions.',
      'The **Madrid Protocol** of 1991 added the environmental teeth, designating Antarctica a natural ' +
      'reserve devoted to peace and science and banning mineral exploitation. India\'s own **Antarctic ' +
      'Act, 2022** writes these obligations into domestic law.'
    ]
  },
  {
    id: 'inst-maitri2',
    cat: 'institution',
    kind: 'Institutional',
    title: 'Maitri-II — The Next Station',
    station: 'maitri',
    pills: ['2029–2032', 'Planned', 'Replacement'],
    body: [
      'Maitri has been standing since 1989. It was built for a fraction of that. A replacement, ' +
      '**Maitri-II**, is planned for the same Schirmacher Oasis area with a target window of **2029–2032**.',
      'The design brief reflects thirty-five years of learning: a longer design life, far better thermal ' +
      'performance, renewable generation to cut diesel dependence, and modern laboratory space for ' +
      'instruments that did not exist when the current building went up.',
      'If you are reading this in school now, you are roughly the right age to be posted to it.'
    ]
  },

  {
    id: 'exp-bharati-safety',
    cat: 'institution',
    kind: 'Institutional',
    title: 'Buddy System and Radio Check-Out',
    station: 'bharati',
    pills: ['Safety Protocol', 'Mandatory'],
    body: [
      'Nobody at Bharati steps past the apron alone. The buddy system is not a suggestion — it is the ' +
      'baseline rule for going anywhere outside the building, day or night, calm weather or not.',
      'Before heading out, a pair signs out and checks in on radio: where they are going, when they expect ' +
      'to be back. Exposed skin and even prescription glasses can freeze in minutes out here, and a katabatic ' +
      'squall can close visibility to nothing with almost no warning.',
      'It is unglamorous administration, and it is also the single reason winter-over incident rates at a ' +
      'well-run station stay as low as they do.'
    ]
  },
  {
    id: 'exp-maitri-safety',
    cat: 'institution',
    kind: 'Institutional',
    title: 'Buddy System and Radio Check-Out',
    station: 'maitri',
    pills: ['Safety Protocol', 'Mandatory'],
    body: [
      'Nobody at Maitri steps past the apron alone. The buddy system is not a suggestion — it is the ' +
      'baseline rule for going anywhere outside the building, day or night, calm weather or not.',
      'Before heading out, a pair signs out and checks in on radio: where they are going, when they expect ' +
      'to be back. Exposed skin and even prescription glasses can freeze in minutes out here, and a katabatic ' +
      'squall can close visibility to nothing with almost no warning.',
      'It is unglamorous administration, and it is also the single reason winter-over incident rates at a ' +
      'well-run station stay as low as they do.'
    ]
  },

  /* ------------------------------------------------------- SIDE QUESTS --
   * Optional field-work records, defined separately in sidequests.js so
   * that content could be built without touching this file while it was
   * under concurrent edit. Same shape, same rules — spread in here rather
   * than kept as a parallel list so every existing consumer of ENTRIES
   * (the codex browser, the category counts, the collection total) picks
   * them up automatically with no changes of its own. */
  ...SIDEQUESTS
];

/** Convenience lookups */
export const ENTRY_BY_ID = Object.fromEntries(ENTRIES.map(e => [e.id, e]));
export const TOTAL_ENTRIES = ENTRIES.length;
