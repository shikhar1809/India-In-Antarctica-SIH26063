import 'dart:io';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import '../models/dispatch.dart';
import 'local_db.dart';

// SyncService watches connectivity and flushes the local pending queue to
// Firestore whenever a connection is available. Uploads media first, then
// writes the Firestore document with the resulting download URLs.

class SyncService {
  final LocalDb _db;
  final FirebaseFirestore _firestore;
  final FirebaseStorage _storage;

  bool _syncing = false;

  SyncService({
    LocalDb? db,
    FirebaseFirestore? firestore,
    FirebaseStorage? storage,
  })  : _db = db ?? LocalDb(),
        _firestore = firestore ?? FirebaseFirestore.instance,
        _storage = storage ?? FirebaseStorage.instance;

  // Call once from main() — listens to connectivity changes.
  void startWatching() {
    Connectivity().onConnectivityChanged.listen((results) {
      final online = results.any((r) => r != ConnectivityResult.none);
      if (online) flush();
    });
  }

  // Flush all pending local dispatches to Firestore.
  Future<void> flush() async {
    if (_syncing) return;
    _syncing = true;
    try {
      final pending = await _db.getPending();
      for (final d in pending) {
        await _uploadDispatch(d);
      }
    } finally {
      _syncing = false;
    }
  }

  Future<void> _uploadDispatch(Dispatch d) async {
    try {
      final base = 'dispatches/${d.authorUid}/${d.id}';

      // Upload voice memo
      String? voiceUrl;
      if (d.voicePath != null) {
        voiceUrl = await _uploadFile('$base/voice.m4a', d.voicePath!);
      }

      // Upload photos
      final imageUrls = <String>[];
      for (var i = 0; i < d.imagePaths.length; i++) {
        final ext = d.imagePaths[i].split('.').last;
        final url = await _uploadFile('$base/photo_$i.$ext', d.imagePaths[i]);
        imageUrls.add(url);
      }

      // Upload CSV
      String? csvUrl;
      if (d.csvPath != null) {
        final name = d.csvPath!.split(Platform.pathSeparator).last;
        csvUrl = await _uploadFile('$base/$name', d.csvPath!);
      }

      // Upload documents
      final docUrls = <Map<String, String>>[];
      for (final doc in d.docPaths) {
        final url = await _uploadFile('$base/docs/${doc['name']}', doc['path']!);
        docUrls.add({'name': doc['name']!, 'url': url});
      }

      // Write Firestore document
      await _firestore.collection('dispatches').doc(d.id).set({
        'authorUid': d.authorUid,
        'authorName': d.authorName,
        'observedAt': d.observedAt.millisecondsSinceEpoch,
        'station': d.station,
        'lat': d.lat,
        'lon': d.lon,
        'elevationM': d.elevationM,
        'positionSource': d.positionSource,
        'activity': d.activity,
        'priority': d.priority.name,
        'weather': d.weather.toMap(),
        'measurements': d.measurements,
        'notes': d.notes,
        'teamMembers': d.teamMembers,
        'sampleIds': d.sampleIds,
        'safetyFlag': d.safetyFlag,
        'voiceUrl': voiceUrl,
        'imageUrls': imageUrls,
        'csvUrl': csvUrl,
        'docUrls': docUrls,
        'caption': '',
        'status': 'raw',
        'publisherName': null,
        'adminNotes': null,
        'createdAt': d.createdAt.millisecondsSinceEpoch,
        'updatedAt': DateTime.now().millisecondsSinceEpoch,
        'createdAtServer': FieldValue.serverTimestamp(),
      });

      await _db.markSynced(d.id);
    } catch (_) {
      // Leave in queue — will retry on next flush.
    }
  }

  Future<String> _uploadFile(String storagePath, String localPath) async {
    final ref = _storage.ref(storagePath);
    await ref.putFile(File(localPath));
    return ref.getDownloadURL();
  }
}
