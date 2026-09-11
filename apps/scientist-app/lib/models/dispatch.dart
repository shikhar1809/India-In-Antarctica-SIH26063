// Mirrors the Dispatch interface in iia-portal/src/types.ts exactly.
// Local dispatches use a UUID as id; once synced to Firestore the same id
// is used as the Firestore document ID so the record is idempotent.

// 'cleared' is the portal's: an admin screened the report and sent it to the
// publishers. The app never writes it; it is here so the mirror stays exact.
enum DispatchStatus { raw, cleared, drafted, flagged, approved }
enum DispatchPriority { routine, notable, urgent }

class WeatherObs {
  final double? airTempC;
  final double? windSpeedKt;
  final String windDir;
  final double? visibilityKm;
  final int? cloudOktas;
  final String presentWeather;

  const WeatherObs({
    this.airTempC,
    this.windSpeedKt,
    this.windDir = 'Calm',
    this.visibilityKm,
    this.cloudOktas,
    this.presentWeather = 'Clear',
  });

  WeatherObs copyWith({
    double? airTempC,
    double? windSpeedKt,
    String? windDir,
    double? visibilityKm,
    int? cloudOktas,
    String? presentWeather,
  }) => WeatherObs(
    airTempC: airTempC ?? this.airTempC,
    windSpeedKt: windSpeedKt ?? this.windSpeedKt,
    windDir: windDir ?? this.windDir,
    visibilityKm: visibilityKm ?? this.visibilityKm,
    cloudOktas: cloudOktas ?? this.cloudOktas,
    presentWeather: presentWeather ?? this.presentWeather,
  );

  Map<String, dynamic> toMap() => {
    'airTempC': airTempC,
    'windSpeedKt': windSpeedKt,
    'windDir': windDir,
    'visibilityKm': visibilityKm,
    'cloudOktas': cloudOktas,
    // The portal's WeatherObs calls this field `present`. It used to go over
    // the wire as `presentWeather`, so the portal read nothing at all — the
    // wire name is what matters here, not the Dart property name.
    'present': presentWeather,
  };

  factory WeatherObs.fromMap(Map<String, dynamic> m) => WeatherObs(
    airTempC: (m['airTempC'] as num?)?.toDouble(),
    windSpeedKt: (m['windSpeedKt'] as num?)?.toDouble(),
    windDir: m['windDir'] as String? ?? '',
    visibilityKm: (m['visibilityKm'] as num?)?.toDouble(),
    cloudOktas: m['cloudOktas'] as int?,
    // Accept both spellings: rows written before the rename are still in
    // the local SQLite database on devices that have been in the field.
    presentWeather: (m['present'] ?? m['presentWeather']) as String? ?? 'Clear',
  );

  String toRadioLine() {
    final parts = <String>[];
    if (presentWeather.isNotEmpty && presentWeather != 'Clear') parts.add(presentWeather);
    if (airTempC != null) parts.add('${airTempC!.toStringAsFixed(1)} °C');
    if (windSpeedKt != null && windDir.isNotEmpty) parts.add('wind $windDir ${windSpeedKt!.toStringAsFixed(0)} kt');
    if (visibilityKm != null) parts.add('vis ${visibilityKm!.toStringAsFixed(1)} km');
    if (cloudOktas != null) parts.add('cloud $cloudOktas/8');
    return parts.isEmpty ? '—' : parts.join(' · ');
  }
}

class Dispatch {
  final String id;             // UUID locally; same value used in Firestore
  final String authorUid;
  final String authorName;

  // When & where
  final DateTime observedAt;
  final String station;
  final double? lat;
  final double? lon;
  final double? elevationM;
  final String positionSource;

  // What
  final String activity;
  final DispatchPriority priority;
  final WeatherObs weather;
  final Map<String, String> measurements;
  final String notes;

  // Party & samples
  final String teamMembers;
  final String sampleIds;
  final bool safetyFlag;

  // Media paths (local absolute paths before upload; download URLs after)
  final String? voicePath;
  final List<String> imagePaths;
  final String? csvPath;
  final List<Map<String, String>> docPaths; // [{name, path}]

  // Pipeline
  final DispatchStatus status;
  final bool synced;           // false = queued locally, not yet in Firestore
  final DateTime createdAt;
  final DateTime updatedAt;

  const Dispatch({
    required this.id,
    required this.authorUid,
    required this.authorName,
    required this.observedAt,
    required this.station,
    this.lat,
    this.lon,
    this.elevationM,
    this.positionSource = 'GPS handheld',
    required this.activity,
    this.priority = DispatchPriority.routine,
    this.weather = const WeatherObs(),
    this.measurements = const {},
    this.notes = '',
    this.teamMembers = '',
    this.sampleIds = '',
    this.safetyFlag = false,
    this.voicePath,
    this.imagePaths = const [],
    this.csvPath,
    this.docPaths = const [],
    this.status = DispatchStatus.raw,
    this.synced = false,
    required this.createdAt,
    required this.updatedAt,
  });

  Dispatch copyWith({
    bool? synced,
    DispatchStatus? status,
    DateTime? updatedAt,
  }) => Dispatch(
    id: id, authorUid: authorUid, authorName: authorName,
    observedAt: observedAt, station: station, lat: lat, lon: lon,
    elevationM: elevationM, positionSource: positionSource,
    activity: activity, priority: priority, weather: weather,
    measurements: measurements, notes: notes, teamMembers: teamMembers,
    sampleIds: sampleIds, safetyFlag: safetyFlag, voicePath: voicePath,
    imagePaths: imagePaths, csvPath: csvPath, docPaths: docPaths,
    status: status ?? this.status,
    synced: synced ?? this.synced,
    createdAt: createdAt,
    updatedAt: updatedAt ?? this.updatedAt,
  );
}
