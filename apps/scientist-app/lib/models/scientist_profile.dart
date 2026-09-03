class ScientistProfile {
  final String uid;        // locally generated UUID, permanent identity
  final String name;
  final String instituteId;
  final String station;
  final String pinHash;    // SHA-256 of the PIN — never store plain text
  final int parkaColor;    // ARGB, character customization
  final int hoodColor;
  final bool showPatch;    // tricolour shoulder patch
  final bool hoodOn;
  final bool goggles;
  final bool pack;
  final bool gloveMode; // large touch targets, for use with expedition mitts on

  const ScientistProfile({
    required this.uid,
    required this.name,
    required this.instituteId,
    required this.station,
    required this.pinHash,
    this.parkaColor = 0xFF2A6FCC,
    this.hoodColor = 0xFF6B2F0F,
    this.showPatch = true,
    this.hoodOn = true,
    this.goggles = true,
    this.pack = false,
    this.gloveMode = false,
  });

  ScientistProfile copyWith({
    int? parkaColor,
    int? hoodColor,
    bool? showPatch,
    bool? hoodOn,
    bool? goggles,
    bool? pack,
    bool? gloveMode,
  }) => ScientistProfile(
    uid: uid,
    name: name,
    instituteId: instituteId,
    station: station,
    pinHash: pinHash,
    parkaColor: parkaColor ?? this.parkaColor,
    hoodColor: hoodColor ?? this.hoodColor,
    showPatch: showPatch ?? this.showPatch,
    hoodOn: hoodOn ?? this.hoodOn,
    goggles: goggles ?? this.goggles,
    pack: pack ?? this.pack,
    gloveMode: gloveMode ?? this.gloveMode,
  );

  Map<String, dynamic> toMap() => {
    'uid': uid,
    'name': name,
    'institute_id': instituteId,
    'station': station,
    'pin_hash': pinHash,
    'parka_color': parkaColor,
    'hood_color': hoodColor,
    'show_patch': showPatch ? 1 : 0,
    'hood_on': hoodOn ? 1 : 0,
    'goggles': goggles ? 1 : 0,
    'pack': pack ? 1 : 0,
    'glove_mode': gloveMode ? 1 : 0,
  };

  factory ScientistProfile.fromMap(Map<String, dynamic> m) => ScientistProfile(
    uid: m['uid'] as String,
    name: m['name'] as String,
    instituteId: m['institute_id'] as String,
    station: m['station'] as String,
    pinHash: m['pin_hash'] as String,
    parkaColor: (m['parka_color'] as int?) ?? 0xFF2A6FCC,
    hoodColor: (m['hood_color'] as int?) ?? 0xFF6B2F0F,
    showPatch: ((m['show_patch'] as int?) ?? 1) == 1,
    hoodOn: ((m['hood_on'] as int?) ?? 1) == 1,
    goggles: ((m['goggles'] as int?) ?? 1) == 1,
    pack: ((m['pack'] as int?) ?? 0) == 1,
    gloveMode: ((m['glove_mode'] as int?) ?? 0) == 1,
  );
}
