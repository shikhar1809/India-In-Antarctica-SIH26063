/* GENERATED FILE — do not edit by hand.
 *
 * The historical records that make up India's Antarctic programme before this
 * system existed: the first expedition, the building of each station, the
 * datasets and publications that came out of them. They used to be hardcoded
 * in iia-public/src/data/archiveData.ts, which meant the public archive was a
 * fixed list rather than a repository.
 *
 * Seeded into the publicArchive collection by the admin "Import historical
 * records" action, so every record the public site shows — historical and
 * newly published alike — comes from the same live collection.
 *
 * Regenerate with: node scripts/generate-historical-records.mjs
 */

import type { RepositoryRecord } from './contract';

export const HISTORICAL_RECORDS: RepositoryRecord[] = [
  {
    "id": "historical-e0",
    "cat": "expedition",
    "kind": "Expedition Report",
    "title": "First Landing: Dakshin Gangotri",
    "station": "dakshin",
    "year": "1983–84",
    "pills": [
      "Logistics",
      "First Expedition"
    ],
    "body": [
      "India’s first permanent Antarctic station was built on the ice shelf of the Princess Astrid Coast during the third Indian Scientific Expedition to Antarctica, following the reconnaissance landings of the first two summer expeditions.",
      "Founded on ice rather than rock, the station was always understood to be temporary — the shelf itself moves, and a structure built on it eventually has to answer for that. It served as India’s Antarctic gateway through the 1980s, before Maitri took over as the country’s main station.",
      "Dakshin Gangotri was formally decommissioned in the early 1990s as accumulating snow and shifting ice made the original structure unsafe to winter in. It is preserved today as a supply base and a marker of where the programme began."
    ],
    "table": [
      {
        "label": "Location",
        "value": "Princess Astrid Coast, Queen Maud Land"
      },
      {
        "label": "Foundation",
        "value": "Ice shelf"
      },
      {
        "label": "Status",
        "value": "Decommissioned — supply base only"
      }
    ],
    "credit": "THIRD INDIAN ANTARCTIC EXPEDITION",
    "photoUrls": [],
    "videoUrl": null,
    "measurements": [],
    "metadata": {
      "identifier": "IIA-1983-9000",
      "creators": [
        {
          "name": "Third Indian Antarctic Expedition",
          "affiliation": "NCPOR, Ministry of Earth Sciences"
        }
      ],
      "publisher": "NCPOR",
      "publicationYear": 1983,
      "resourceType": "Report",
      "station": "Dakshin Gangotri",
      "spatial": {
        "lat": -70.0833,
        "lon": 12,
        "elevationM": 40,
        "datum": "WGS84",
        "accuracyM": null
      },
      "temporal": {
        "observedAt": 410227200000
      },
      "license": "CC BY 4.0",
      "rights": "Creative Commons Attribution 4.0 International",
      "instrument": null,
      "method": "Ice shelf",
      "provenance": {
        "sourceType": "historical",
        "sourceId": "e0",
        "approvedBy": "NCPOR",
        "approvedAt": 410227200000
      }
    },
    "publishedAt": 410227200000
  },
  {
    "id": "historical-e1",
    "cat": "expedition",
    "kind": "Expedition Report",
    "title": "Establishing Maitri, 1988–89",
    "station": "maitri",
    "year": "1989",
    "pills": [
      "Geology",
      "Logistics"
    ],
    "body": [
      "The 8th Indian Scientific Expedition to Antarctica was tasked with a monumental objective: constructing the permanent station \"Maitri\" in the Schirmacher Oasis.",
      "Unlike the ice-shelf based Dakshin Gangotri, Maitri was built on rocky terrain. The foundation required extensive leveling of the moraine and permafrost.",
      "Over the course of 45 days, the team erected the main building, power house, and pump station, securing a vital foothold for India’s inland research."
    ],
    "table": [
      {
        "label": "Leader",
        "value": "Dr. Amitabh Sengupta"
      },
      {
        "label": "Location",
        "value": "70° 45′ 58″ S, 11° 43′ 56″ E"
      },
      {
        "label": "Temp Range",
        "value": "−1°C to −15°C (Summer)"
      }
    ],
    "credit": "EIGHTH INDIAN ANTARCTIC EXPEDITION",
    "photoUrls": [],
    "videoUrl": null,
    "measurements": [],
    "metadata": {
      "identifier": "IIA-1989-9001",
      "creators": [
        {
          "name": "Eighth Indian Antarctic Expedition",
          "affiliation": "NCPOR, Ministry of Earth Sciences"
        }
      ],
      "publisher": "NCPOR",
      "publicationYear": 1989,
      "resourceType": "Report",
      "station": "Maitri",
      "spatial": {
        "lat": -70.7659,
        "lon": 11.7314,
        "elevationM": 117,
        "datum": "WGS84",
        "accuracyM": null
      },
      "temporal": {
        "observedAt": 599616000000
      },
      "license": "CC BY 4.0",
      "rights": "Creative Commons Attribution 4.0 International",
      "instrument": null,
      "method": null,
      "provenance": {
        "sourceType": "historical",
        "sourceId": "e1",
        "approvedBy": "NCPOR",
        "approvedAt": 599616000000
      }
    },
    "publishedAt": 599616000000
  },
  {
    "id": "historical-e2",
    "cat": "expedition",
    "kind": "Expedition Report",
    "title": "Two Summers to Build Bharati",
    "station": "bharati",
    "year": "2010–12",
    "pills": [
      "Engineering",
      "Oceanography"
    ],
    "body": [
      "Bharati represents a leap in Antarctic architecture. Constructed from 134 specialized shipping containers, it was designed to withstand extreme blizzards while minimizing environmental impact.",
      "The construction spanned two intense summer seasons. The resulting facility provides state-of-the-art labs for oceanographic and atmospheric sciences."
    ],
    "credit": "TWENTY-NINTH & THIRTIETH EXPEDITIONS",
    "photoUrls": [],
    "videoUrl": null,
    "measurements": [],
    "metadata": {
      "identifier": "IIA-2010-9002",
      "creators": [
        {
          "name": "Twenty-ninth & Thirtieth Expeditions",
          "affiliation": "NCPOR, Ministry of Earth Sciences"
        }
      ],
      "publisher": "NCPOR",
      "publicationYear": 2010,
      "resourceType": "Report",
      "station": "Bharati",
      "spatial": {
        "lat": -69.4067,
        "lon": 76.1913,
        "elevationM": 25,
        "datum": "WGS84",
        "accuracyM": null
      },
      "temporal": {
        "observedAt": 1262304000000
      },
      "license": "CC BY 4.0",
      "rights": "Creative Commons Attribution 4.0 International",
      "instrument": null,
      "method": null,
      "provenance": {
        "sourceType": "historical",
        "sourceId": "e2",
        "approvedBy": "NCPOR",
        "approvedAt": 1262304000000
      }
    },
    "publishedAt": 1262304000000
  },
  {
    "id": "historical-m0",
    "cat": "media",
    "kind": "Photograph",
    "title": "Aerial Survey: Schirmacher Oasis",
    "station": "maitri",
    "year": "1989",
    "pills": [
      "Cartography",
      "Site Survey"
    ],
    "body": [
      "A low-altitude photographic survey of the Schirmacher Oasis, flown to fix Maitri’s foundation against the surrounding moraine and the chain of freshwater lakes the oasis is named for.",
      "Composite plates from this survey were used to produce the first accurate site maps of the station and its approach routes, superseding the sketch surveys of the earlier reconnaissance expeditions.",
      "Digitised prints from this catalogue entry are held at the National Centre for Polar and Ocean Research and are available to researchers on request."
    ],
    "credit": "SURVEY OF INDIA — ANTARCTIC WING",
    "photoUrls": [],
    "videoUrl": null,
    "measurements": [],
    "metadata": {
      "identifier": "IIA-1989-9003",
      "creators": [
        {
          "name": "Survey of India — Antarctic Wing",
          "affiliation": "NCPOR, Ministry of Earth Sciences"
        }
      ],
      "publisher": "NCPOR",
      "publicationYear": 1989,
      "resourceType": "Image",
      "station": "Maitri",
      "spatial": {
        "lat": -70.7659,
        "lon": 11.7314,
        "elevationM": 117,
        "datum": "WGS84",
        "accuracyM": null
      },
      "temporal": {
        "observedAt": 599616000000
      },
      "license": "CC BY 4.0",
      "rights": "Creative Commons Attribution 4.0 International",
      "instrument": null,
      "method": null,
      "provenance": {
        "sourceType": "historical",
        "sourceId": "m0",
        "approvedBy": "NCPOR",
        "approvedAt": 599616000000
      }
    },
    "publishedAt": 599616000000
  },
  {
    "id": "historical-d1",
    "cat": "dataset",
    "kind": "Dataset",
    "title": "Ice Core Stratigraphy — Annual Layer Record",
    "station": "maitri",
    "year": "1994",
    "pills": [
      "Glaciology",
      "Climate"
    ],
    "body": [
      "Data derived from a 65-meter ice core drilled near the Schirmacher Oasis. The isotopic analysis (δ18O and δD) reveals a 500-year high-resolution climate proxy.",
      "Volcanic horizons identified within the core correlate with known global eruptions, validating the chronological model."
    ],
    "table": [
      {
        "label": "Core Depth",
        "value": "65 m"
      },
      {
        "label": "Time Span",
        "value": "~500 years"
      },
      {
        "label": "Proxy",
        "value": "δ18O, δD"
      }
    ],
    "credit": "NATIONAL CENTRE FOR POLAR & OCEAN RESEARCH",
    "photoUrls": [],
    "videoUrl": null,
    "measurements": [],
    "metadata": {
      "identifier": "IIA-1994-9004",
      "creators": [
        {
          "name": "National Centre for Polar & Ocean Research",
          "affiliation": "NCPOR, Ministry of Earth Sciences"
        }
      ],
      "publisher": "NCPOR",
      "publicationYear": 1994,
      "resourceType": "Dataset",
      "station": "Maitri",
      "spatial": {
        "lat": -70.7659,
        "lon": 11.7314,
        "elevationM": 117,
        "datum": "WGS84",
        "accuracyM": null
      },
      "temporal": {
        "observedAt": 757382400000
      },
      "license": "CC BY 4.0",
      "rights": "Creative Commons Attribution 4.0 International",
      "instrument": "δ18O, δD",
      "method": null,
      "provenance": {
        "sourceType": "historical",
        "sourceId": "d1",
        "approvedBy": "NCPOR",
        "approvedAt": 757382400000
      }
    },
    "publishedAt": 757382400000
  },
  {
    "id": "historical-d2",
    "cat": "dataset",
    "kind": "Dataset",
    "title": "Automatic Weather Station Record",
    "station": "maitri",
    "year": "1989–present",
    "pills": [
      "Meteorology",
      "Long-term Monitoring"
    ],
    "body": [
      "Continuous synoptic observations from Maitri’s automatic weather station, logged at three-hour intervals without a break since the station’s first winter — one of the longest unbroken instrumental records India holds anywhere on the continent.",
      "The series underpins Antarctic contributions to the Southern Hemisphere sea-level pressure network and is cross-referenced against the katabatic wind studies published from the same station."
    ],
    "table": [
      {
        "label": "Interval",
        "value": "3-hourly"
      },
      {
        "label": "Variables",
        "value": "Temp, pressure, wind, humidity"
      },
      {
        "label": "Coverage",
        "value": "Unbroken since commissioning"
      }
    ],
    "credit": "INDIA METEOROLOGICAL DEPARTMENT",
    "photoUrls": [],
    "videoUrl": null,
    "measurements": [],
    "metadata": {
      "identifier": "IIA-1989-9005",
      "creators": [
        {
          "name": "India Meteorological Department",
          "affiliation": "NCPOR, Ministry of Earth Sciences"
        }
      ],
      "publisher": "NCPOR",
      "publicationYear": 1989,
      "resourceType": "Dataset",
      "station": "Maitri",
      "spatial": {
        "lat": -70.7659,
        "lon": 11.7314,
        "elevationM": 117,
        "datum": "WGS84",
        "accuracyM": null
      },
      "temporal": {
        "observedAt": 599616000000
      },
      "license": "CC BY 4.0",
      "rights": "Creative Commons Attribution 4.0 International",
      "instrument": "Temp, pressure, wind, humidity",
      "method": "3-hourly",
      "provenance": {
        "sourceType": "historical",
        "sourceId": "d2",
        "approvedBy": "NCPOR",
        "approvedAt": 599616000000
      }
    },
    "publishedAt": 599616000000
  },
  {
    "id": "historical-d3",
    "cat": "dataset",
    "kind": "Dataset",
    "title": "Southern Ocean Krill Biomass Survey",
    "station": "bharati",
    "year": "2013",
    "pills": [
      "Biological Oceanography",
      "CCAMLR"
    ],
    "body": [
      "Acoustic and net-sampling survey of Euphausia superba biomass in the waters off the Larsemann Hills, conducted from Bharati’s marine biology wing as part of India’s contribution to CCAMLR’s ecosystem monitoring programme.",
      "Krill density estimates from this survey feed directly into the regional stock assessments used to set the Southern Ocean’s precautionary catch limits."
    ],
    "credit": "BAY OF BENGAL & SOUTHERN OCEAN PROGRAMME",
    "photoUrls": [],
    "videoUrl": null,
    "measurements": [],
    "metadata": {
      "identifier": "IIA-2013-9006",
      "creators": [
        {
          "name": "Bay of Bengal & Southern Ocean Programme",
          "affiliation": "NCPOR, Ministry of Earth Sciences"
        }
      ],
      "publisher": "NCPOR",
      "publicationYear": 2013,
      "resourceType": "Dataset",
      "station": "Bharati",
      "spatial": {
        "lat": -69.4067,
        "lon": 76.1913,
        "elevationM": 25,
        "datum": "WGS84",
        "accuracyM": null
      },
      "temporal": {
        "observedAt": 1356998400000
      },
      "license": "CC BY 4.0",
      "rights": "Creative Commons Attribution 4.0 International",
      "instrument": null,
      "method": null,
      "provenance": {
        "sourceType": "historical",
        "sourceId": "d3",
        "approvedBy": "NCPOR",
        "approvedAt": 1356998400000
      }
    },
    "publishedAt": 1356998400000
  },
  {
    "id": "historical-p1",
    "cat": "publication",
    "kind": "Publication",
    "title": "Geological Evolution of the Larsemann Hills",
    "station": "bharati",
    "year": "2015",
    "pills": [
      "Geology",
      "Gondwana"
    ],
    "body": [
      "This comprehensive study maps the structural geology of the Larsemann Hills, shedding light on the tectonic events that led to the breakup of the supercontinent Gondwana.",
      "Field observations confirm high-grade metamorphism and multi-phase deformation, correlating strongly with the Eastern Ghats Mobile Belt of India."
    ],
    "credit": "JOURNAL OF EARTH SYSTEM SCIENCE",
    "photoUrls": [],
    "videoUrl": null,
    "measurements": [],
    "metadata": {
      "identifier": "IIA-2015-9007",
      "creators": [
        {
          "name": "National Centre for Polar and Ocean Research",
          "affiliation": "Ministry of Earth Sciences"
        }
      ],
      "publishedIn": "Journal of Earth System Science",
      "publisher": "NCPOR",
      "publicationYear": 2015,
      "resourceType": "Publication",
      "station": "Bharati",
      "spatial": {
        "lat": -69.4067,
        "lon": 76.1913,
        "elevationM": 25,
        "datum": "WGS84",
        "accuracyM": null
      },
      "temporal": {
        "observedAt": 1420070400000
      },
      "license": "CC BY 4.0",
      "rights": "Creative Commons Attribution 4.0 International",
      "instrument": null,
      "method": null,
      "provenance": {
        "sourceType": "historical",
        "sourceId": "p1",
        "approvedBy": "NCPOR",
        "approvedAt": 1420070400000
      }
    },
    "publishedAt": 1420070400000
  },
  {
    "id": "historical-p2",
    "cat": "publication",
    "kind": "Publication",
    "title": "Katabatic Wind Regimes of Queen Maud Land",
    "station": "maitri",
    "year": "2019",
    "pills": [
      "Meteorology",
      "Boundary Layer Physics"
    ],
    "body": [
      "A multi-year analysis of the gravity-driven winds that fall off the polar plateau through the Schirmacher Oasis, drawing on the station’s own AWS record to characterise their onset, duration and seasonal cycle.",
      "The paper argues that even the strongest recorded events are simple cold air falling under its own weight — dramatic in effect, unremarkable in physics."
    ],
    "credit": "POLAR SCIENCE",
    "photoUrls": [],
    "videoUrl": null,
    "measurements": [],
    "metadata": {
      "identifier": "IIA-2019-9008",
      "creators": [
        {
          "name": "National Centre for Polar and Ocean Research",
          "affiliation": "Ministry of Earth Sciences"
        }
      ],
      "publishedIn": "Polar Science",
      "publisher": "NCPOR",
      "publicationYear": 2019,
      "resourceType": "Publication",
      "station": "Maitri",
      "spatial": {
        "lat": -70.7659,
        "lon": 11.7314,
        "elevationM": 117,
        "datum": "WGS84",
        "accuracyM": null
      },
      "temporal": {
        "observedAt": 1546300800000
      },
      "license": "CC BY 4.0",
      "rights": "Creative Commons Attribution 4.0 International",
      "instrument": null,
      "method": null,
      "provenance": {
        "sourceType": "historical",
        "sourceId": "p2",
        "approvedBy": "NCPOR",
        "approvedAt": 1546300800000
      }
    },
    "publishedAt": 1546300800000
  },
  {
    "id": "historical-i0",
    "cat": "institution",
    "kind": "Institutional",
    "title": "Founding of the National Centre for Polar Research",
    "station": "ncpor",
    "year": "1998",
    "pills": [
      "Governance",
      "Ministry of Earth Sciences"
    ],
    "body": [
      "Established to consolidate India’s Antarctic, Arctic and Southern Ocean research under a single nodal agency, headquartered in Goa and functioning under the Ministry of Earth Sciences.",
      "The Centre plans and coordinates every Indian Scientific Expedition to Antarctica, curates the specimens and data those expeditions return with, and is the archive of record this catalogue is drawn from."
    ],
    "credit": "GOVERNMENT OF INDIA",
    "photoUrls": [],
    "videoUrl": null,
    "measurements": [],
    "metadata": {
      "identifier": "IIA-1998-9009",
      "creators": [
        {
          "name": "Government of India",
          "affiliation": "NCPOR, Ministry of Earth Sciences"
        }
      ],
      "publisher": "NCPOR",
      "publicationYear": 1998,
      "resourceType": "Institutional",
      "station": "Other",
      "spatial": {
        "lat": 15.35,
        "lon": 73.83,
        "elevationM": 5,
        "datum": "WGS84",
        "accuracyM": null
      },
      "temporal": {
        "observedAt": 883612800000
      },
      "license": "CC BY 4.0",
      "rights": "Creative Commons Attribution 4.0 International",
      "instrument": null,
      "method": null,
      "provenance": {
        "sourceType": "historical",
        "sourceId": "i0",
        "approvedBy": "NCPOR",
        "approvedAt": 883612800000
      }
    },
    "publishedAt": 883612800000
  },
  {
    "id": "historical-s0",
    "cat": "expedition",
    "kind": "Expedition Report",
    "title": "The Ice-Class Vessel: Logistics by Sea",
    "station": "ship",
    "year": "Ongoing",
    "pills": [
      "Logistics",
      "Resupply"
    ],
    "body": [
      "Every expedition’s fuel, cargo and winter-over crew make the crossing from India by sea, aboard a chartered ice-class vessel capable of working through the pack ice around the resupply anchorage.",
      "A single voyage carries a year’s worth of food, fuel and scientific equipment for both stations — the resupply window is short, and what does not arrive on this crossing waits for the next one."
    ],
    "credit": "CHARTERED ICE-CLASS RESUPPLY VESSEL",
    "photoUrls": [],
    "videoUrl": null,
    "measurements": [],
    "metadata": {
      "identifier": "IIA-1981-9010",
      "creators": [
        {
          "name": "Chartered Ice-class Resupply Vessel",
          "affiliation": "NCPOR, Ministry of Earth Sciences"
        }
      ],
      "publisher": "NCPOR",
      "publicationYear": 1981,
      "resourceType": "Report",
      "station": "Other",
      "spatial": {
        "lat": null,
        "lon": null,
        "elevationM": null,
        "datum": "WGS84",
        "accuracyM": null
      },
      "temporal": {
        "observedAt": 347155200000
      },
      "license": "CC BY 4.0",
      "rights": "Creative Commons Attribution 4.0 International",
      "instrument": null,
      "method": null,
      "provenance": {
        "sourceType": "historical",
        "sourceId": "s0",
        "approvedBy": "NCPOR",
        "approvedAt": 347155200000
      }
    },
    "publishedAt": 347155200000
  }
];
