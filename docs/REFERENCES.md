# Reference log — Maitri & Bharati

Every structure, room and prop in `src/stations/` and `src/world/` must be
traceable to a real source. This file is that trace. It is the audit record
required by the redesign brief: **no asset gets built from a generic template.**

Rules for anyone adding to this file:

- One entry per asset. Name the asset by its source file and symbol.
- Cite a *specific* source, not "the internet". Published dimensions beat
  prose; prose beats a vibe.
- Where the model deliberately departs from the reference (game scale, budget,
  playability), say so and say why. An undocumented departure is a bug.

---

## 0. Primary visual reference — Bharati, aerial

**Photograph supplied by the project owner (2026-09), aerial three-quarter view
of Bharati from the north-west.** This is the controlling reference for the
station's exterior and for anything read off it. Facts taken from it:

| Observation | Consequence for the model |
|---|---|
| Continuous **ribbon window band** along the long facade — a single horizontal run of near-identical windows with white spandrel above and below | Interior rooms on that elevation must line up with the band. Punched, scattered windows are wrong. |
| Facade reads as **white/light upper storey over a dark charcoal plinth**, with the aerodynamic skirt in the dark tone | Exterior tone split must continue inside: window head height and sill height are fixed by the band. |
| **Roof is a usable deck** — flat, standing-seam panels, with railings and a raised opening | Confirms the third-level "terrace for scientific experiments". |
| Building **steps down its slope**: tall undercroft at the near end, close to grade at the far end | The stilt/column field is not uniform height. |
| **External switchback stair** down from the entrance on the long side | The entrance stair is not a single straight flight. |
| **Yellow tracked excavator** parked hard against the building at the stair foot | Excavator placement + colour. |
| **Shipping containers** scattered on bare rock in the foreground: red/rust, brown, blue | Container yard colours and the fact the ground is *bare ochre rock*, not snow. |
| Cylindrical **fuel tanks** on the slope above | Tank farm placement. |
| **Cargo vessel beset in fast ice** beyond the station, dark hull, white aft superstructure, two yellow deck cranes | See §1. |

Terrain note from the same photo: the Larsemann Hills are an ice-free oasis —
the ground is **brown/ochre exposed rock with patchy snow in the hollows**, not
a continuous white sheet. Sea ice beyond is white with darker open leads.

---

## 1. Ice-beset cargo ship — `src/world/CargoShip.js`

**Reference vessel: MV *Vasiliy Golovnin*.** This is not a generic ship: it is
the actual vessel that resupplies Bharati and Maitri, so it is the correct
subject.

- Russian **Project 10620** icebreaking cargo ship, built 1988 in the Ukrainian
  SSR, IMO 8723426, operated by FESCO.
  ([Wikipedia](https://en.wikipedia.org/wiki/Vasiliy_Golovnin_(ship)))
- **Length 164 m, beam 22 m, draught ~6.9 m.**
  ([FleetMon](https://www.fleetmon.com/vessels/vasiliy-golovnin_8723426_26462/),
  [MarineTraffic](https://www.marinetraffic.com/en/ais/details/ships/imo:8723426))
- Delivers general cargo, food and fuel to **Bharati and Maitri**; arrived at
  Bharati mid-January 2024, exchanging personnel and landing fuel.
  ([Polar Journal](https://polarjournal.ch/en/2024/03/25/vasily-golovnin-supplies-two-indian-antarctic-stations/),
  [MarineLink](https://www.marinelink.com/news/vasiliy-golovnin-supply-indias-antarctica-470440))
- Precedent for besetment/accident in exactly this water: **MV *Ivan Papanin***
  completed cargo operations at Bharati and was damaged shortly after sailing
  from the Larsemann Hills on 5 Feb 2018.
  ([NCPOR](https://www.ncaor.gov.in/news/view/414))
- Indian expeditions are dispatched annually on these charters.
  ([PIB — 40th expedition](https://pib.gov.in/PressReleasePage.aspx?PRID=1685978),
  [PIB — 43rd expedition](https://www.pib.gov.in/PressReleaseIframePage.aspx?PRID=1993769))

**Arrangement taken from the owner's photo:** stern to the left, white
four-deck accommodation block and funnel aft, **two yellow deck cranes** on
pedestals forward of it, long low weather deck with hatch covers, raked
icebreaking bow. Hull dark with rust weathering.

**Scale is kept at the real 164 m.** At 3.3× the station's 50 m length this is
the point — the brief asks for an imposing, ice-locked vessel, and the true
dimension delivers that without exaggeration.

---

## 2. Bharati station shell & interior — `src/stations/BharatiStation.js`

- **bof architekten**, completed February 2013. **134 interlocked shipping
  containers** inside an insulated aerodynamic steel skin; ~**2,500 m²** gross;
  **three floors**; elevated on steel columns.
  ([Archello](https://archello.com/project/bharati),
  [designboom](https://www.designboom.com/architecture/research-station-in-antarctica-built-from-134-shipping-containers/),
  [Wikipedia](https://en.wikipedia.org/wiki/Bharati_(research_station)))
- **Published room schedule**, used verbatim as the floor plan:
  - **Ground floor** — laboratory, storage and technical spaces.
  - **Second floor** — 24 single and double rooms, kitchen and dining room,
    library, fitness room, offices, lounge.
  - **Third floor** — terrace, usable for scientific experiments.
  ([Archello](https://archello.com/project/bharati), [New Atlas](https://newatlas.com/bharathi-research-base/28498/))
- **Interior finish: wood, varied colour, generous daylight** — explicitly
  called out by the architects. The model's palette must reflect this; a grey
  institutional interior contradicts the source.
  ([Arch2O](https://www.arch2o.com/bharati-antarctica-research-station-bof-arkitekten/))
- Shell form (faceted prismatoid, widest at mid-height) is aerodynamic: it
  keeps airflow attached so drift is carried past instead of burying the
  building. ([Dlubal structural case study](https://www.dlubal.com/en/downloads-and-information/references/customer-projects/000649))

---

## 3. Maitri station — `src/stations/MaitriStation.js`

- Established **1989**, in the **Schirmacher Oasis**, Queen Maud Land.
  ([NCPOR](https://ncpor.res.in/antarcticas/display/376-maitri-),
  [Wikipedia](https://en.wikipedia.org/wiki/Maitri_(research_station)))
- **Capacity: 25 in the main building year-round; ~40 in summer** using
  containerised living modules. Some sources give 60–70 at summer peak.
  ([NCPOR](https://ncpor.res.in/antarcticas/display/376-maitri-),
  [Veena World](https://www.veenaworld.com/blog/maitri-indias-station-in-antarctica))
  → **The mess hall must seat ~25 for a winter sitting.** This is the number
  the current undersized mess fails.
- **Interconnected prefabricated buildings**, thermally insulated — structurally
  different from Bharati's container stack, which is why the two interiors must
  not share a floor plan.
- Equipment explicitly listed: **GPS station, seismometer, weather station, and
  a laboratory for sample analysis.**
- Freshwater from **Lake Priyadarshini**, directly opposite the station.
  ([Wikipedia](https://en.wikipedia.org/wiki/Lake_Priyadarshini))

---

## 4. Sample storage facilities — must differ per station

The two stations do different science, so the two stores are different rooms.

**Cold/ice-core storage practice** (Bharati and Maitri glaciology):

- Working archive freezers run at about **−36 °C**, with a separate
  HEPA-filtered **cold clean room at −25 °C** for cutting sub-samples; cores are
  cut in exam rooms and sub-sampled for shipping.
  ([NSF Ice Core Facility](https://icecores.org/about))
- Cores are stored in **labelled tubes/sleeves on racking**, with provenance and
  depth recorded so stratigraphic context survives.
  ([NSF-ICF](https://icecores.org/about-ice-cores))
- The Ice Memory sanctuary at **Concordia** is a partially buried insulated
  chamber **5 m high × 5 m wide × 35 m long, ~5 m below the surface**, passively
  held near **−50 °C**.
  ([The Conversation](https://theconversation.com/the-first-ice-core-library-in-antarctica-to-save-humanitys-climate-memory-273374),
  [Ice Memory Foundation](https://www.ice-memory.org/about-us/news/the-ice-memory-foundation-will-open-the-first-ever-sanctuary-of-climate-archives-in-antarctica-storing-mountain-ice-cores-for-centuries-1609457.kjsp))

→ **Maitri** (inland oasis; glaciology, geology, atmospheric): ice-core tube
racking + a rock/geological sample store — trays, core boxes, a sorting bench.
→ **Bharati** (coastal; oceanography, marine biology, earth science): chilled
biological sample store — sample fridges/freezers, formalin/preservation
cabinets, a wet bench and sample bottle racking. Different equipment entirely.

---

## 5. Excavator — `src/world/Props.js`

**Reference machine: Cat 330 GC, cold-weather prepared for Antarctica New
Zealand** — a real, current, polar-operations tracked excavator.

- Customised by Terra Cat Christchurch to operate to **−40 °C**: fully synthetic
  low-viscosity oils, double cold-weather battery set, diesel block heaters.
  ([Terra Cat](https://www.terracat.co.nz/about/news-and-media/a-new-cat-330-gc-for-antarctica-new-zealand))
- Broader precedent for tracked plant in Antarctica: Prinoth Panther XL
  crawlers at Norway's Troll station; Caterpillar's LGP track-type tractors
  developed for Operation Deep Freeze.
  ([Equipment World](https://www.equipmentworld.com/construction-equipment/article/15752162/prinoth-panther-xl-crawlers-extreme-machines-for-antarctica),
  [Caterpillar](https://www.caterpillar.com/en/company/history/archive/heavyequipmentinantarctica.html))

Proportions to hold: ~30 t class — **track length ~4.2 m, track gauge ~2.6 m,
house width ~2.9 m, boom ~6.2 m, stick ~3.2 m**, cab offset to the left of the
house, counterweight overhanging the tail. Yellow, per the owner's photo.

---

## 6. Blizzard / whiteout — `src/world/Weather.js`

- Blizzard definition: **gale-force or stronger wind for ≥1 hour, temperature
  below 0 °C, and visibility reduced to 100 m or less.**
  ([Australian Antarctic Program](https://www.antarctica.gov.au/about-antarctica/weather-and-climate/weather/))
- Antarctic blizzards are driven by katabatic wind spilling off the plateau at
  an average **~160 km/h**, with extremes past 300 km/h; they persist for days.
  ([Britannica](https://www.britannica.com/science/blizzard))
- **Drifting snow** (below eye level) starts around **30 km/h**; **blowing snow**
  (above eye level) from about **60 km/h**. Much Antarctic "blizzard" is a
  **ground blizzard** — no falling snow at all, just snow lifted off the surface.
  ([AAP](https://www.antarctica.gov.au/about-antarctica/weather-and-climate/weather/),
  [Ground blizzard](https://en.wikipedia.org/wiki/Ground_blizzard))
- **Whiteout is an optical phenomenon**, not merely density: uniform light
  removes shadow, horizon and landmark, so depth perception fails.
  ([Whiteout (weather)](https://en.wikipedia.org/wiki/Whiteout_(weather)))
  → The effect must therefore flatten *lighting and contrast*, not just add
  particles. Particle count alone will never read as a whiteout.

---

## 7. Departures from reference, and why

| Departure | Reason |
|---|---|
| Maitri's 68 m building is modelled inside only across its central ~18 m | The wings are unmodelled solid mass. Flagged as outstanding work — this is a real interior/exterior discontinuity. |
| Ship is placed ~250 m off the station rather than at a berth | There is no modelled quay; besetment in fast ice is both the brief's ask and well-precedented here (*Ivan Papanin*, 2018). |
