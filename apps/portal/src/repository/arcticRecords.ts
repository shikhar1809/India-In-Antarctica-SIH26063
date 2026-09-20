/* ═════════════════════════════════════════════ India in the Arctic ═══
 *
 * NCPOR is a polar institute, not an Antarctic one. Its data centre carries
 * Arctic environmental and mooring data alongside the Antarctic holdings,
 * and its Arctic programme has run from Ny-Ålesund since 2007. This
 * repository held nothing from it — which is why its region filter had an
 * Antarctic side and an empty one.
 *
 * These four records are the Arctic half, written from NCPOR's own published
 * pages and the Government of India press releases cited on each. They are
 * reference records — what the programme is and what it measures — in the
 * same shape and with the same provenance marking as the historical
 * Antarctic set in historicalRecords.ts: `sourceType: 'historical'`, so
 * nothing here is ever mistaken for a field report that came off the ice.
 *
 * Facts are kept to what the sources state. Where a source gives a range or
 * an approximation (the mooring's depth, the span of a data series), the
 * record says so rather than inventing a precise figure.
 */

import type { RepositoryRecord } from './contract';

const NY_ALESUND = { lat: 78.9167, lon: 11.9333, elevationM: 8, datum: 'WGS84' as const, accuracyM: null };
const KONGSFJORDEN = { lat: 78.95, lon: 12.0167, elevationM: -192, datum: 'WGS84' as const, accuracyM: null };

const NCPOR_ARCTIC = 'https://ncpor.res.in/arctics';
const NCPOR_HIMADRI = 'https://ncpor.res.in/app/webroot/pages/view/340-himadri-station';
const NCPOR_INDARC = 'https://ncpor.res.in/arctics/display/398-indarc';
const NPDC_HIMADRI_DATA = 'https://data.ncpor.res.in/newhtml/3';

const at = (iso: string) => Date.parse(iso);

export const ARCTIC_RECORDS: RepositoryRecord[] = [
  {
    id: 'arctic-himadri',
    cat: 'institution',
    kind: 'Station Record',
    title: 'Himadri: India in the Arctic',
    station: 'himadri',
    year: '2008',
    pills: ['Arctic', 'Ny-Ålesund', 'Station'],
    body: [
      'Himadri is India’s Arctic research station, at the international research base of Ny-Ålesund on Spitsbergen, Svalbard — about 1,200 km from the North Pole. It was inaugurated on 1 July 2008, during India’s second Arctic expedition, a year after the country’s Arctic programme began.',
      'Unlike Maitri and Bharati, Himadri is not a self-contained settlement. Ny-Ålesund is a shared scientific village run by the Norwegian operator Kings Bay, where a dozen countries keep laboratories side by side and share the power, the pier and the flights. India’s work there is accommodated in that arrangement rather than beside it.',
      'The station is staffed seasonally, with instruments left running through the year. That is what makes it useful: the atmospheric and precipitation series it feeds are continuous, and a continuous Arctic record is the only kind that can be compared with an Antarctic one.',
    ],
    table: [
      { label: 'Location', value: 'Ny-Ålesund, Svalbard (78°55′N, 11°56′E)' },
      { label: 'Inaugurated', value: '1 July 2008' },
      { label: 'Operated by', value: 'NCPOR, Ministry of Earth Sciences' },
      { label: 'Occupancy', value: 'Seasonal, with year-round instruments' },
    ],
    credit: 'NCPOR — Arctic programme',
    photoUrls: [],
    videoUrl: null,
    measurements: [],
    themes: ['operations', 'meteorology'],
    references: [
      { citation: 'NCPOR — Himadri Station', url: NCPOR_HIMADRI },
      { citation: 'NCPOR — Arctic programme', url: NCPOR_ARCTIC },
    ],
    metadata: {
      identifier: 'IIA-ARC-9001',
      creators: [{ name: 'Indian Arctic Programme', affiliation: 'NCPOR, Ministry of Earth Sciences' }],
      publisher: 'NCPOR',
      publicationYear: 2008,
      resourceType: 'Institutional',
      station: 'Himadri',
      spatial: NY_ALESUND,
      temporal: { observedAt: at('2008-07-01') },
      region: 'arctic',
      license: 'CC BY 4.0',
      rights: 'Creative Commons Attribution 4.0 International',
      instrument: null,
      method: null,
      provenance: { sourceType: 'historical', sourceId: 'arctic-himadri', approvedBy: 'NCPOR', approvedAt: at('2008-07-01') },
    },
    publishedAt: at('2008-07-01'),
  },

  {
    id: 'arctic-indarc',
    cat: 'expedition',
    kind: 'Expedition Report',
    title: 'IndARC: India’s first Arctic moored observatory',
    station: 'himadri',
    year: '2014',
    pills: ['Arctic', 'Kongsfjorden', 'Mooring'],
    body: [
      'IndARC is India’s first sub-surface moored observatory in the Arctic. It was deployed on 23 July 2014 in Kongsfjorden, the fjord on which Ny-Ålesund sits, and anchored at a depth of roughly 190 metres.',
      'The mooring carries an array of oceanographic sensors set at fixed depths through the water column, recording the fjord continuously rather than during the weeks a ship can be on station. It was designed and built by NCPOR with the National Institute of Ocean Technology.',
      'Kongsfjorden is the reason the instrument is worth the trouble. Warm Atlantic water meets Arctic water there, and the balance between them changes the fjord’s temperature, its salinity and the timing of its sea ice. A year-round record of that boundary is a measurement of how far Atlantic influence is reaching into the Arctic.',
    ],
    table: [
      { label: 'Deployed', value: '23 July 2014' },
      { label: 'Position', value: 'Kongsfjorden, Svalbard (≈78°57′N, 12°01′E)' },
      { label: 'Depth', value: 'Approximately 190 m' },
      { label: 'Built by', value: 'NCPOR with NIOT' },
    ],
    credit: 'NCPOR / NIOT — IndARC',
    photoUrls: [],
    videoUrl: null,
    measurements: [
      { fieldId: 'depth', label: 'Mooring depth', value: '190', unit: 'm' },
      { fieldId: 'sensors', label: 'Sensors in the water column', value: '10', unit: null },
    ],
    themes: ['ocean', 'cryosphere'],
    references: [
      { citation: 'NCPOR — IndARC multisensor mooring', url: NCPOR_INDARC },
      { citation: 'Press Information Bureau — India deploys its first sub-surface moored observatory in the Arctic', url: 'https://www.pib.gov.in/newsite/PrintRelease.aspx?relid=107789' },
    ],
    metadata: {
      identifier: 'IIA-ARC-9002',
      creators: [{ name: 'IndARC team', affiliation: 'NCPOR and NIOT, Ministry of Earth Sciences' }],
      publisher: 'NCPOR',
      publicationYear: 2014,
      resourceType: 'Report',
      station: 'Himadri',
      spatial: KONGSFJORDEN,
      temporal: { observedAt: at('2014-07-23') },
      region: 'arctic',
      license: 'CC BY 4.0',
      rights: 'Creative Commons Attribution 4.0 International',
      instrument: 'Moored sensor array (CTD, current meters)',
      method: 'Sub-surface mooring',
      provenance: { sourceType: 'historical', sourceId: 'arctic-indarc', approvedBy: 'NCPOR', approvedAt: at('2014-07-23') },
    },
    publishedAt: at('2014-07-23'),
  },

  {
    id: 'arctic-precipitation',
    cat: 'dataset',
    kind: 'Scientific Dataset',
    title: 'Arctic precipitation measured at Himadri',
    station: 'himadri',
    year: '2014–2024',
    pills: ['Arctic', 'Precipitation', 'Dataset'],
    body: [
      'Precipitation at Ny-Ålesund is measured by instruments that watch it fall rather than collect it. A Micro Rain Radar profiles the column overhead; an OTT-Parsivel disdrometer counts and sizes individual drops and flakes at the surface; a microwave radiometer reads the water and vapour in between.',
      'Collecting Arctic precipitation in a gauge is unreliable — wind carries snow past the opening, and what does land is easily undercaught. Optical and radar instruments avoid the question entirely by measuring what passes through a volume of air.',
      'NCPOR’s data centre lists these Himadri series among its Arctic holdings, spanning roughly 2010 to 2024. The listing notes that the files are raw instrument data, not yet joined to descriptive metadata — a caveat that belongs with the data rather than hidden behind it.',
    ],
    table: [
      { label: 'Instruments', value: 'Micro Rain Radar, OTT-Parsivel disdrometer, microwave radiometer' },
      { label: 'Station', value: 'Himadri, Ny-Ålesund' },
      { label: 'Span', value: 'Approximately 2010–2024, by series' },
      { label: 'Held by', value: 'NCPOR data centre' },
    ],
    credit: 'NCPOR data centre',
    photoUrls: [],
    videoUrl: null,
    measurements: [
      { fieldId: 'mrr', label: 'Rain rate profile', value: 'continuous', unit: 'mm/h' },
      { fieldId: 'parsivel', label: 'Drop size distribution', value: 'continuous', unit: 'mm' },
      { fieldId: 'lwp', label: 'Liquid water path', value: 'continuous', unit: 'g/m²' },
    ],
    themes: ['meteorology', 'atmosphere'],
    dataset: {
      format: 'Instrument raw files (compressed)',
      sizeLabel: 'By series',
      rowCount: 0,
      coverage: 'Ny-Ålesund, Svalbard — approximately 2010 to 2024, varying by instrument',
      downloadUrl: NPDC_HIMADRI_DATA,
      columns: [],
      sampleRows: [],
    },
    references: [
      { citation: 'NCPOR data centre — Himadri meteorological data', url: NPDC_HIMADRI_DATA },
    ],
    metadata: {
      identifier: 'IIA-ARC-9003',
      creators: [{ name: 'Arctic atmospheric programme', affiliation: 'NCPOR, Ministry of Earth Sciences' }],
      publisher: 'NCPOR',
      publicationYear: 2024,
      resourceType: 'Dataset',
      station: 'Himadri',
      spatial: NY_ALESUND,
      temporal: { observedAt: at('2024-07-30') },
      region: 'arctic',
      license: 'CC BY 4.0',
      rights: 'Creative Commons Attribution 4.0 International',
      instrument: 'Micro Rain Radar; OTT-Parsivel; microwave radiometer',
      method: 'Continuous automated observation',
      provenance: { sourceType: 'historical', sourceId: 'arctic-precipitation', approvedBy: 'NCPOR', approvedAt: at('2024-07-30') },
    },
    publishedAt: at('2024-07-30'),
  },

  {
    id: 'arctic-black-carbon',
    cat: 'dataset',
    kind: 'Scientific Dataset',
    title: 'Black carbon and aerosols over Svalbard',
    station: 'himadri',
    year: '2020–2024',
    pills: ['Arctic', 'Aerosols', 'Dataset'],
    body: [
      'Black carbon is soot: the dark particles left by burning. Almost none of it is produced in the Arctic, and all of it matters there, because a dark particle settling on snow makes that snow absorb sunlight it would otherwise reflect.',
      'At Himadri the mass concentration of black carbon is measured continuously, alongside aerosol scattering read by a nephelometer. Together they say how much particulate matter is in Arctic air and how much of it is the absorbing kind.',
      'NCPOR’s data centre lists both series among its Himadri holdings. They are the Arctic counterpart of the ozone and aerosol records this repository already holds from Maitri — the same question asked at the other end of the planet.',
    ],
    table: [
      { label: 'Measured', value: 'Black carbon mass concentration; aerosol scattering' },
      { label: 'Instruments', value: 'Aethalometer; integrating nephelometer' },
      { label: 'Station', value: 'Himadri, Ny-Ålesund' },
      { label: 'Held by', value: 'NCPOR data centre' },
    ],
    credit: 'NCPOR data centre',
    photoUrls: [],
    videoUrl: null,
    measurements: [
      { fieldId: 'bc', label: 'Black carbon mass concentration', value: 'continuous', unit: 'ng/m³' },
      { fieldId: 'scattering', label: 'Aerosol scattering coefficient', value: 'continuous', unit: 'Mm⁻¹' },
    ],
    themes: ['atmosphere', 'environment'],
    dataset: {
      format: 'Instrument raw files (compressed)',
      sizeLabel: 'By series',
      rowCount: 0,
      coverage: 'Ny-Ålesund, Svalbard — continuous observation, listed to 2024',
      downloadUrl: NPDC_HIMADRI_DATA,
      columns: [],
      sampleRows: [],
    },
    references: [
      { citation: 'NCPOR data centre — Himadri observational datasets', url: NPDC_HIMADRI_DATA },
    ],
    metadata: {
      identifier: 'IIA-ARC-9004',
      creators: [{ name: 'Arctic atmospheric programme', affiliation: 'NCPOR, Ministry of Earth Sciences' }],
      publisher: 'NCPOR',
      publicationYear: 2024,
      resourceType: 'Dataset',
      station: 'Himadri',
      spatial: NY_ALESUND,
      temporal: { observedAt: at('2024-07-30') },
      region: 'arctic',
      license: 'CC BY 4.0',
      rights: 'Creative Commons Attribution 4.0 International',
      instrument: 'Aethalometer; integrating nephelometer',
      method: 'Continuous automated observation',
      provenance: { sourceType: 'historical', sourceId: 'arctic-black-carbon', approvedBy: 'NCPOR', approvedAt: at('2024-07-30') },
    },
    publishedAt: at('2024-07-30'),
  },
];
