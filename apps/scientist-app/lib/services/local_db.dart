import 'dart:convert';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:path/path.dart';
import 'package:path_provider/path_provider.dart';
import '../models/dispatch.dart';
import '../models/scientist_profile.dart';

// Single SQLite database storing dispatches locally.
// A dispatch is "pending sync" when synced == 0.
// Once uploaded to Firestore, synced is set to 1.

class LocalDb {
  static final LocalDb _instance = LocalDb._();
  factory LocalDb() => _instance;
  LocalDb._();

  Database? _db;

  Future<Database> get db async {
    _db ??= await _open();
    return _db!;
  }

  Future<Database> _open() async {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
    final dir = await getApplicationDocumentsDirectory();
    final path = join(dir.path, 'iia_scientist.db');
    return openDatabase(
      path,
      version: 5,
      onCreate: (db, _) async {
        await _createProfileTable(db);
        await db.execute('''
          CREATE TABLE dispatches (
            id TEXT PRIMARY KEY,
            author_uid TEXT NOT NULL,
            author_name TEXT NOT NULL,
            observed_at INTEGER NOT NULL,
            station TEXT NOT NULL,
            lat REAL,
            lon REAL,
            elevation_m REAL,
            position_source TEXT NOT NULL,
            activity TEXT NOT NULL,
            priority TEXT NOT NULL,
            weather TEXT NOT NULL,
            measurements TEXT NOT NULL,
            notes TEXT NOT NULL,
            team_members TEXT NOT NULL,
            sample_ids TEXT NOT NULL,
            safety_flag INTEGER NOT NULL DEFAULT 0,
            voice_path TEXT,
            image_paths TEXT NOT NULL,
            csv_path TEXT,
            doc_paths TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'raw',
            synced INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          )
        ''');
      },
      onUpgrade: (db, oldVersion, newVersion) async {
        if (oldVersion < 2) {
          await _createProfileTable(db);
        }
        if (oldVersion < 3) {
          await _addAppearanceColumns(db);
        }
        if (oldVersion < 4) {
          await _addOutfitColumns(db);
        }
        if (oldVersion < 5) {
          await _addGloveModeColumn(db);
        }
      },
    );
  }

  Future<void> _createProfileTable(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS scientist_profile (
        uid TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        institute_id TEXT NOT NULL,
        station TEXT NOT NULL,
        pin_hash TEXT NOT NULL,
        parka_color INTEGER NOT NULL DEFAULT ${0xFF2A6FCC},
        hood_color INTEGER NOT NULL DEFAULT ${0xFF6B2F0F},
        show_patch INTEGER NOT NULL DEFAULT 1,
        hood_on INTEGER NOT NULL DEFAULT 1,
        goggles INTEGER NOT NULL DEFAULT 1,
        pack INTEGER NOT NULL DEFAULT 0,
        glove_mode INTEGER NOT NULL DEFAULT 0
      )
    ''');
  }

  Future<void> _addGloveModeColumn(Database db) async {
    final cols = (await db.rawQuery('PRAGMA table_info(scientist_profile)'))
        .map((c) => c['name'] as String)
        .toSet();
    if (!cols.contains('glove_mode')) {
      await db.execute('ALTER TABLE scientist_profile ADD COLUMN glove_mode INTEGER NOT NULL DEFAULT 0');
    }
  }

  Future<void> _addOutfitColumns(Database db) async {
    final cols = (await db.rawQuery('PRAGMA table_info(scientist_profile)'))
        .map((c) => c['name'] as String)
        .toSet();
    if (!cols.contains('hood_on')) {
      await db.execute('ALTER TABLE scientist_profile ADD COLUMN hood_on INTEGER NOT NULL DEFAULT 1');
    }
    if (!cols.contains('goggles')) {
      await db.execute('ALTER TABLE scientist_profile ADD COLUMN goggles INTEGER NOT NULL DEFAULT 1');
    }
    if (!cols.contains('pack')) {
      await db.execute('ALTER TABLE scientist_profile ADD COLUMN pack INTEGER NOT NULL DEFAULT 0');
    }
  }

  Future<void> _addAppearanceColumns(Database db) async {
    final cols = (await db.rawQuery('PRAGMA table_info(scientist_profile)'))
        .map((c) => c['name'] as String)
        .toSet();
    if (!cols.contains('parka_color')) {
      await db.execute('ALTER TABLE scientist_profile ADD COLUMN parka_color INTEGER NOT NULL DEFAULT ${0xFF2A6FCC}');
    }
    if (!cols.contains('hood_color')) {
      await db.execute('ALTER TABLE scientist_profile ADD COLUMN hood_color INTEGER NOT NULL DEFAULT ${0xFF6B2F0F}');
    }
    if (!cols.contains('show_patch')) {
      await db.execute('ALTER TABLE scientist_profile ADD COLUMN show_patch INTEGER NOT NULL DEFAULT 1');
    }
  }

  Future<void> saveProfile(ScientistProfile p) async {
    final database = await db;
    await database.insert('scientist_profile', p.toMap(), conflictAlgorithm: ConflictAlgorithm.replace);
  }

  Future<ScientistProfile?> getProfile() async {
    final database = await db;
    final rows = await database.query('scientist_profile', limit: 1);
    if (rows.isEmpty) return null;
    return ScientistProfile.fromMap(rows.first);
  }

  Future<void> deleteProfile() async {
    final database = await db;
    await database.delete('scientist_profile');
  }

  Future<void> insertDispatch(Dispatch d) async {
    final database = await db;
    await database.insert('dispatches', _toRow(d), conflictAlgorithm: ConflictAlgorithm.replace);
  }

  Future<void> markSynced(String id) async {
    final database = await db;
    await database.update(
      'dispatches',
      {'synced': 1, 'updated_at': DateTime.now().millisecondsSinceEpoch},
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  Future<List<Dispatch>> getPending() async {
    final database = await db;
    final rows = await database.query('dispatches', where: 'synced = 0', orderBy: 'created_at ASC');
    return rows.map(_fromRow).toList();
  }

  Future<List<Dispatch>> getAll() async {
    final database = await db;
    final rows = await database.query('dispatches', orderBy: 'observed_at DESC');
    return rows.map(_fromRow).toList();
  }

  Future<void> deleteDispatch(String id) async {
    final database = await db;
    await database.delete('dispatches', where: 'id = ?', whereArgs: [id]);
  }

  Map<String, dynamic> _toRow(Dispatch d) => {
    'id': d.id,
    'author_uid': d.authorUid,
    'author_name': d.authorName,
    'observed_at': d.observedAt.millisecondsSinceEpoch,
    'station': d.station,
    'lat': d.lat,
    'lon': d.lon,
    'elevation_m': d.elevationM,
    'position_source': d.positionSource,
    'activity': d.activity,
    'priority': d.priority.name,
    'weather': jsonEncode(d.weather.toMap()),
    'measurements': jsonEncode(d.measurements),
    'notes': d.notes,
    'team_members': d.teamMembers,
    'sample_ids': d.sampleIds,
    'safety_flag': d.safetyFlag ? 1 : 0,
    'voice_path': d.voicePath,
    'image_paths': jsonEncode(d.imagePaths),
    'csv_path': d.csvPath,
    'doc_paths': jsonEncode(d.docPaths),
    'status': d.status.name,
    'synced': d.synced ? 1 : 0,
    'created_at': d.createdAt.millisecondsSinceEpoch,
    'updated_at': d.updatedAt.millisecondsSinceEpoch,
  };

  Dispatch _fromRow(Map<String, dynamic> r) => Dispatch(
    id: r['id'] as String,
    authorUid: r['author_uid'] as String,
    authorName: r['author_name'] as String,
    observedAt: DateTime.fromMillisecondsSinceEpoch(r['observed_at'] as int),
    station: r['station'] as String,
    lat: r['lat'] as double?,
    lon: r['lon'] as double?,
    elevationM: r['elevation_m'] as double?,
    positionSource: r['position_source'] as String,
    activity: r['activity'] as String,
    priority: DispatchPriority.values.byName(r['priority'] as String),
    weather: WeatherObs.fromMap(jsonDecode(r['weather'] as String) as Map<String, dynamic>),
    measurements: Map<String, String>.from(jsonDecode(r['measurements'] as String) as Map),
    notes: r['notes'] as String,
    teamMembers: r['team_members'] as String,
    sampleIds: r['sample_ids'] as String,
    safetyFlag: (r['safety_flag'] as int) == 1,
    voicePath: r['voice_path'] as String?,
    imagePaths: List<String>.from(jsonDecode(r['image_paths'] as String) as List),
    csvPath: r['csv_path'] as String?,
    docPaths: List<Map<String, String>>.from(
      (jsonDecode(r['doc_paths'] as String) as List).map((e) => Map<String, String>.from(e as Map)),
    ),
    status: DispatchStatus.values.byName(r['status'] as String),
    synced: (r['synced'] as int) == 1,
    createdAt: DateTime.fromMillisecondsSinceEpoch(r['created_at'] as int),
    updatedAt: DateTime.fromMillisecondsSinceEpoch(r['updated_at'] as int),
  );
}
