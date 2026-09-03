/**
 * stations.js — factual data for India's three Antarctic stations.
 *
 * Every figure here traces back to the reference sheet compiled from
 * NCPOR advisories, bof Architekten / Dlubal structural documentation,
 * and published Wikipedia coordinates. Where the source itself flags a
 * figure as approximate, `approx: true` is set so the UI can say so
 * rather than presenting a guess as a survey.
 *
 * Units: metres, degrees (WGS84).
 */

export const STATIONS = {
  maitri: {
    id: 'maitri',
    name: 'Maitri',
    subtitle: 'Schirmacher Oasis, Queen Maud Land',
    status: 'active',
    statusLabel: 'Operational',
    established: 'January 1989',
    lat: -70.766667,
    lon: 11.731944,
    latDMS: '70°46′00″S',
    lonDMS: '11°43′55″E',
    altFix: [-70.76683367, 11.73078318], // NCPOR advisory fix
    elevation: 117,
    elevationNote: '117 m ASL per NCPOR advisory; ~50 m cited in an older NCPOR overview',
    structure: 'Single elongated building elevated on a steel stilt understructure',
    approx: true, // no public architectural footprint for the current structure
    capacity: 25,
    neighbours: [
      'Lake Priyadarshini (freshwater) — immediately south of the station',
      'Novolazarevskaya (Russia) — ~5 km east',
      'Blue-ice runway — ~10 km',
      'Coast — ~100 km north'
    ],
    future: 'To be replaced by Maitri-II, targeted 2029–2032',
    // In-world scene tuning
    world: {
      /** Ambient conditions used by the HUD + weather system */
      tempC: -18, windKt: 24, terrain: 'oasis',
      skyTint: 0x9fc4e8,
      /** Sun elevation for the polar summer "night that never falls" */
      // The facade faces +Z, so the sun must have a +Z component or the
      // building's front is permanently in its own shadow. A low raking angle
      // from the north-east gives the long shadows polar light is known for
      // while still lighting the elevation you actually walk up to.
      sunAlt: 15, sunAzi: 34
    },
    blurb:
      'India\'s longest-serving Antarctic base sits on bare rock in the Schirmacher Oasis, ' +
      'a 35 km ribbon of ice-free hills between the polar plateau and the Princess Astrid Coast. ' +
      'The whole building stands on steel legs so that blizzard-driven snow blows underneath ' +
      'instead of burying it — the mistake that ended Dakshin Gangotri.'
  },

  bharati: {
    id: 'bharati',
    name: 'Bharati',
    subtitle: 'Larsemann Hills, Prydz Bay',
    status: 'active',
    statusLabel: 'Operational',
    established: '18 March 2012',
    lat: -69.408030,
    lon: 76.187361,
    latDMS: '69°24′29″S',
    lonDMS: '76°11′14″E',
    elevation: 35,
    elevationNote: '35 m ASL',
    structure:
      '134 interlocked 20 ft ISO shipping containers as the primary load-bearing structure, ' +
      'wrapped in an aerodynamic insulated steel skin',
    footprint: [50, 30],           // ~164 ft × 98 ft
    floorArea: 2500,               // m²
    height: 12,                    // > 40 ft
    floors: 3,
    designLife: 25,
    capacity: 72,
    capacityNote: '47 in the main building on twin-sharing + 25 emergency/summer shelter',
    architect: 'bof Architekten + IMS Ingenieurgesellschaft (Hamburg)',
    engineer: 'Structural analysis by KSF Bremerhaven',
    approx: false,                 // this one IS published in detail
    neighbours: [
      'Thala Fjord — west',
      'Quilty Bay — east',
      'Zhongshan (China) and Progress (Russia) — within a few km'
    ],
    world: {
      tempC: -9, windKt: 31, terrain: 'coastal',
      skyTint: 0xb8d4ee,
      sunAlt: 13, sunAzi: 22
    },
    blurb:
      'India\'s third station, and the one that looks like a spacecraft. Shipping containers do ' +
      'the structural work; the smooth outer shell is pure aerodynamics — it splits katabatic wind ' +
      'so snow never gets the chance to pile against a flat wall. Built in two Antarctic summers ' +
      'and rated for a 25-year life.'
  },

  gangotri: {
    id: 'gangotri',
    name: 'Dakshin Gangotri',
    subtitle: 'Dakshin Gangotri Glacier, Queen Maud Land',
    status: 'buried',
    statusLabel: 'Decommissioned · buried in ice',
    established: '26 January 1984',
    abandoned: '25 February 1990',
    lat: -70.074200,
    lon: 12.003400,
    latDMS: '70°04′27″S',
    lonDMS: '12°00′12″E',
    elevation: 0,
    elevationNote: 'On the ice shelf, near sea level',
    structure:
      'Prefabricated timber construction in two sections — Block A (generators, fuel, workshops) ' +
      'and Block B (laboratories, radio room)',
    approx: true,
    power: 'Solar powered, fully computerised data recording, Inmarsat terminal + amateur radio',
    capacity: 12,
    neighbours: ['~15 km from Maitri', '~2,500 km from the South Pole'],
    world: {
      tempC: -26, windKt: 41, terrain: 'shelf',
      skyTint: 0x8fb3d6,
      sunAlt: 8, sunAzi: 44
    },
    blurb:
      'India\'s first permanent Antarctic base, built on a moving ice shelf during the third ' +
      'expedition. Snow accumulated faster than it could be cleared. After six years it was ' +
      'abandoned, and the ice closed over it. It is still down there — the reason every Indian ' +
      'station since has been built on stilts, on rock.'
  }
};

export const STATION_ORDER = ['maitri', 'bharati', 'gangotri'];

/** Great-circle distance in km between two stations (spherical earth, R=6371). */
export function distanceKm(a, b) {
  const A = STATIONS[a], B = STATIONS[b];
  const R = 6371, toRad = Math.PI / 180;
  const dLat = (B.lat - A.lat) * toRad;
  const dLon = (B.lon - A.lon) * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(A.lat * toRad) * Math.cos(B.lat * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
