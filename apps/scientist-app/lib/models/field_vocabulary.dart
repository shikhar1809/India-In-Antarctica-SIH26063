/// ══════════════════════════════════════════ shared field vocabulary
///
/// The Dart side of the contract in iia-portal/src/repository/contract.ts.
///
/// This file exists because the two halves of the system had drifted apart:
/// the app was writing Australian station names (Casey, Davis, Mawson), its
/// own activity list, METAR weather codes and a 16-point compass, none of
/// which the portal could read. Everything here now matches the portal's
/// `types.ts` exactly.
///
/// MIRRORED FILE: iia-portal/src/repository/contract.ts and
/// iia-portal/src/types.ts. Change one, change the others.
library;

/// India's Antarctic stations. Maitri and Bharati are operational; Dakshin
/// Gangotri was abandoned to the ice in 1990 and survives as a supply base.
const kStations = <String>[
  'Maitri',
  'Bharati',
  'Dakshin Gangotri',
  'Other',
];

/// Matches ACTIVITY_TYPES in the portal's types.ts.
const kActivities = <String>[
  'Ice / glaciology survey',
  'Wildlife observation',
  'Atmospheric / meteorology',
  'Oceanography / CTD',
  'Equipment check / maintenance',
  'Base operations',
  'Emergency / incident',
  'Other',
];

/// One-line blurb per activity, shown under each option in the picker.
const kActivityBlurbs = <String, String>{
  'Ice / glaciology survey': 'Stakes, cores, thickness',
  'Wildlife observation': 'Counts, behaviour, colonies',
  'Atmospheric / meteorology': 'Sondes, ozone, radiation',
  'Oceanography / CTD': 'Casts, bottles, profiles',
  'Equipment check / maintenance': 'Instruments, calibration',
  'Base operations': 'Logistics, station tasks',
  'Emergency / incident': 'Injury, near miss, failure',
  'Other': 'Anything else',
};

/// Eight points plus Variable/Calm — the way an observer actually reports
/// wind, and what the portal's WIND_DIRS contains.
const kWindDirs = <String>[
  'N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'Variable', 'Calm',
];

/// Plain English, not METAR shorthand. The portal renders these strings
/// directly into a public-facing weather line.
const kPresentWeather = <String>[
  'Clear',
  'Partly cloudy',
  'Overcast',
  'Snow',
  'Blowing snow',
  'Drifting snow',
  'Fog',
  'Whiteout',
  'Ice crystals',
  'Rain',
];

/// Matches POSITION_SOURCES in the portal.
const kPositionSources = <String>[
  'GPS handheld',
  'Manual / map',
  'Station fix',
  'Vessel GPS',
];

/* ─────────────────────────────────────────── measurement schema ──
 * The per-activity scientific fields. This is the Dart mirror of
 * MEASUREMENT_SCHEMA — until now the app never collected any of it, so every
 * dispatch arrived with an empty measurement map and none of the actual
 * science made it off the ice.
 *
 * Wildlife terms follow Darwin Core (scientificName, individualCount,
 * lifeStage, samplingProtocol) so records can be pushed to GBIF/OBIS later.
 */

enum FieldKind { text, number, select }

class MeasurementField {
  final String id;
  final String label;
  final FieldKind kind;

  /// The unit is stored *with* the value when the dispatch is written, so a
  /// reading is never orphaned from what it was measured in.
  final String? unit;
  final List<String>? options;
  final String? hint;

  const MeasurementField({
    required this.id,
    required this.label,
    required this.kind,
    this.unit,
    this.options,
    this.hint,
  });
}

const kMeasurementSchema = <String, List<MeasurementField>>{
  'Wildlife observation': [
    MeasurementField(id: 'species', label: 'Species', kind: FieldKind.text, hint: 'Scientific name — e.g. Pygoscelis adeliae'),
    MeasurementField(id: 'count', label: 'Individuals counted', kind: FieldKind.number, unit: 'ind.'),
    MeasurementField(id: 'lifeStage', label: 'Life stage', kind: FieldKind.select, options: ['Adult', 'Juvenile', 'Chick / pup', 'Mixed', 'Unknown']),
    MeasurementField(id: 'behaviour', label: 'Behaviour', kind: FieldKind.select, options: ['Breeding', 'Moulting', 'Foraging', 'Resting', 'Transiting', 'Carcass / dead', 'Other']),
    MeasurementField(id: 'method', label: 'Survey method', kind: FieldKind.select, options: ['Direct count', 'Distance sampling', 'Camera trap', 'Aerial / UAV', 'Opportunistic']),
  ],
  'Ice / glaciology survey': [
    MeasurementField(id: 'siteId', label: 'Site / stake ID', kind: FieldKind.text, hint: 'e.g. MAI-S12'),
    MeasurementField(id: 'iceThickCm', label: 'Ice thickness', kind: FieldKind.number, unit: 'cm'),
    MeasurementField(id: 'snowDepthCm', label: 'Snow depth', kind: FieldKind.number, unit: 'cm'),
    MeasurementField(id: 'freeboardCm', label: 'Freeboard', kind: FieldKind.number, unit: 'cm'),
    MeasurementField(id: 'surface', label: 'Surface type', kind: FieldKind.select, options: ['Blue ice', 'Firn', 'Fresh snow', 'Wind slab', 'Sastrugi', 'Melt pond', 'Crevassed']),
  ],
  'Atmospheric / meteorology': [
    MeasurementField(id: 'instrument', label: 'Instrument', kind: FieldKind.text, hint: 'AWS ID, sonde type, spectrometer'),
    MeasurementField(id: 'parameter', label: 'Parameter measured', kind: FieldKind.text, hint: 'Ozone column, aerosol OD, radiation'),
    MeasurementField(id: 'value', label: 'Reading', kind: FieldKind.text),
    MeasurementField(id: 'units', label: 'Units', kind: FieldKind.text, hint: 'DU, W/m², ppb'),
    MeasurementField(id: 'qc', label: 'QC flag', kind: FieldKind.select, options: ['Good', 'Suspect', 'Instrument fault', 'Not calibrated']),
  ],
  'Oceanography / CTD': [
    MeasurementField(id: 'stationNo', label: 'Station number', kind: FieldKind.text),
    MeasurementField(id: 'castNo', label: 'Cast number', kind: FieldKind.text),
    MeasurementField(id: 'maxDepthM', label: 'Max cast depth', kind: FieldKind.number, unit: 'm'),
    MeasurementField(id: 'bottles', label: 'Bottles fired', kind: FieldKind.number),
    MeasurementField(id: 'params', label: 'Parameters logged', kind: FieldKind.text, hint: 'T, S, dissolved O₂, chl-a, nitrate'),
  ],
  'Equipment check / maintenance': [
    MeasurementField(id: 'assetId', label: 'Asset / instrument ID', kind: FieldKind.text),
    MeasurementField(id: 'action', label: 'Action taken', kind: FieldKind.select, options: ['Routine check', 'Calibration', 'Repair', 'Part replaced', 'Decommissioned']),
    MeasurementField(id: 'state', label: 'Resulting state', kind: FieldKind.select, options: ['Operational', 'Degraded', 'Offline', 'Awaiting parts']),
  ],
  'Base operations': [
    MeasurementField(id: 'task', label: 'Task', kind: FieldKind.text, hint: 'Fuel transfer, cargo, traverse prep'),
    MeasurementField(id: 'persons', label: 'Personnel involved', kind: FieldKind.number),
  ],
  'Emergency / incident': [
    MeasurementField(id: 'kind', label: 'Incident type', kind: FieldKind.select, options: ['Injury', 'Near miss', 'Equipment failure', 'Vehicle', 'Environmental', 'Weather / shelter']),
    MeasurementField(id: 'injuries', label: 'Injuries', kind: FieldKind.select, options: ['None', 'First aid only', 'Medical treatment', 'Evacuation required']),
    MeasurementField(id: 'reported', label: 'Reported to', kind: FieldKind.text, hint: 'Station leader, doctor, comms'),
  ],
  'Other': <MeasurementField>[],
};

/* ─────────────────────────────────────── plausibility envelopes ──
 * Generous ranges whose job is catching a fat-fingered -999 or a latitude of
 * 400, not second-guessing an observer. Vostok's -89.2 °C is the lowest
 * reliably recorded surface temperature on Earth, so -95 is a safe floor.
 * Mirrors PLAUSIBLE in the portal's contract.ts.
 */

class PlausibleRange {
  final double min;
  final double max;
  const PlausibleRange(this.min, this.max);
  bool contains(double v) => v >= min && v <= max;
}

const kAirTempRange = PlausibleRange(-95, 20);
const kWindSpeedRange = PlausibleRange(0, 200);
const kVisibilityRange = PlausibleRange(0, 100);
const kLatRange = PlausibleRange(-90, 90);
const kLonRange = PlausibleRange(-180, 180);
const kElevationRange = PlausibleRange(-100, 5000);

/// Returns an error string for a numeric text field, or null when it's fine.
/// Empty is always allowed — a field observation legitimately omits values.
String? validateNumber(String? raw, PlausibleRange range, String label, {String? unit}) {
  final text = raw?.trim() ?? '';
  if (text.isEmpty) return null;
  final value = double.tryParse(text);
  if (value == null) return 'Enter a number';
  if (!range.contains(value)) {
    final u = unit == null ? '' : ' $unit';
    return '$label should be between ${range.min.toStringAsFixed(0)}$u and ${range.max.toStringAsFixed(0)}$u';
  }
  return null;
}
