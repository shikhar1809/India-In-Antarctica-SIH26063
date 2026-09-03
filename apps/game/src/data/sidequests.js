/**
 * sidequests.js — the National Polar Data Archive, side-quest extension.
 *
 * These are optional records layered on top of archive.js's core 20. Same
 * mechanic, same rule: a record is locked until the player does the field
 * work it describes, and the field work is what actually teaches the
 * concept. They live in a separate module purely so this content can be
 * built without touching archive.js while it's under concurrent edit —
 * conceptually they are a natural extension of ENTRIES, not a new system.
 *
 * `cat` reuses one of the five categories already defined in archive.js
 * (expedition / dataset / publication / media / institution) — no new
 * categories are introduced here. `minigame` names an export in
 * sidequest-minigames.js, exactly the way archive.js's `minigame` field
 * names an export in minigames.js.
 */

export const SIDEQUESTS = [
  {
    id: 'quest-wildlife-census',
    cat: 'dataset',
    kind: 'Dataset',
    title: 'Larsemann Hills Wildlife Census',
    station: 'bharati',
    pills: ['Wildlife Institute of India', 'Baseline survey', 'Austral summer'],
    figure: null,
    minigame: 'wildlifeCensus',
    body: [
      'Bharati shares its ice-free coastline with something the containers and cable runs tend to ' +
      'crowd out of the postcard shot: wildlife. The **Wildlife Institute of India** runs a standing ' +
      'baseline survey across the Larsemann Hills, counting breeding pairs of **south polar skuas** ' +
      'and hauled-out **Weddell seals** along the same transects, season after season.',
      'The method is deliberately unglamorous — walk the transect, count what is there, write it down. ' +
      'A census only becomes useful once you have ten, twenty, thirty years of the same numbers to ' +
      'compare, which is exactly why a program that keeps a station running continuously since 2012 ' +
      'is worth more here than any single expensive survey could be.',
      'Skuas and seals sit near the top of the local food chain, so a population that drifts is an ' +
      'early warning for something changing underneath it — sea-ice extent, krill abundance, or human ' +
      'disturbance from the very stations doing the counting. That last risk is exactly what keeps the ' +
      'Larsemann Hills under **Antarctic Specially Managed Area No. 6**, the same protected-area status ' +
      'that governs Bharati\'s own waste and vehicle rules.'
    ]
  },
  {
    id: 'quest-geomagnetic',
    cat: 'dataset',
    kind: 'Dataset',
    title: 'Geomagnetic Observatory — Live Trace',
    station: 'maitri',
    pills: ['Indian Institute of Geomagnetism', 'Sub-auroral', 'All-sky camera'],
    figure: null,
    minigame: 'geomagnetic',
    body: [
      'The archived magnetometer log tells you what already happened. This is the same instrument ' +
      'caught live: the **Indian Institute of Geomagnetism** operates a magnetometer and an all-sky ' +
      'camera at Maitri around the clock, because the station sits close enough to the southern ' +
      'auroral oval to be a genuinely useful post for watching space weather in real time.',
      'Most of the trace is quiet — the field just sits near its baseline, drifting by a few nanotesla. ' +
      'Then the solar wind delivers a **coronal mass ejection**, the field lines get shoved around, and ' +
      'the needle swings by hundreds of nanotesla in minutes. That swing is a **geomagnetic storm**, and ' +
      'it is the same event the all-sky camera usually photographs overhead as an aurora a few minutes later.',
      'Storms like this are not just pretty. They induce currents in long conductors — power grids, ' +
      'pipelines, submarine cables — and they scramble the timing satellites use for navigation. Every ' +
      'observatory in the international **IAGA** network, Maitri included, feeds a shared early-warning ' +
      'picture that utilities and satellite operators actually watch.'
    ]
  },
  {
    id: 'quest-seismology',
    cat: 'dataset',
    kind: 'Dataset',
    title: 'Seismology Watch',
    station: 'maitri',
    pills: ['ISC & GSN', 'Broadband seismometer', 'Continuous feed'],
    figure: null,
    minigame: 'seismology',
    body: [
      'Maitri runs a broadband seismometer around the clock, and the single biggest reason it is useful ' +
      'is not what happens in Antarctica — it is where it sits. No traffic, no factories, no nearby ' +
      'cities shaking the ground with everyday noise. A seismometer bolted to Antarctic bedrock hears a ' +
      'quieter Earth than almost anywhere else it could stand, which means it can pick out a genuinely ' +
      'faint signal that would be buried in noise anywhere more populated.',
      'A large earthquake anywhere on the planet sends waves all the way through the Earth, and a station ' +
      'far from the epicentre often gives a cleaner read on its size and depth than a station standing ' +
      'right on top of it, where the ground is still lurching around. That is why a seismometer in Queen ' +
      'Maud Land is worth having at all.',
      'The feed from Maitri is contributed to the **International Seismological Centre** and the ' +
      '**Global Seismographic Network**, which pool readings from stations worldwide to fix an ' +
      'earthquake\'s location, depth and magnitude far more precisely than any single station could manage alone.'
    ]
  },
  {
    id: 'quest-satellite-uplink',
    cat: 'dataset',
    kind: 'Dataset',
    title: 'Satellite Uplink Window',
    station: 'bharati',
    pills: ['Polar satcom', 'Narrow pass', 'Timed window'],
    figure: null,
    minigame: 'satelliteUplink',
    body: [
      'There is no fibre line to Antarctica. Every dataset this archive holds — the ice core stratigraphy, ' +
      'the krill counts, the weather log — left the continent the same way: bounced off a satellite during ' +
      'a pass window that might last only a few minutes before the satellite drops below the horizon.',
      'That means the dish has to be pointed correctly, and kept pointed correctly, for the whole window. ' +
      'Miss the alignment and the link drops mid-transfer; miss the window entirely and the day\'s data ' +
      'waits for the next pass — which, depending on the satellite\'s orbit, might not come for hours.',
      'It sounds like a minor logistics detail until you remember what rides on it: the weekly medical ' +
      'check-in, the winter crew\'s calls home, and every instrument reading this portal displays. A polar ' +
      'station is only as connected as its last successful uplink.'
    ]
  }
];

/** Convenience lookups, matching archive.js's shape. */
export const SIDEQUEST_BY_ID = Object.fromEntries(SIDEQUESTS.map(e => [e.id, e]));
export const TOTAL_SIDEQUESTS = SIDEQUESTS.length;
