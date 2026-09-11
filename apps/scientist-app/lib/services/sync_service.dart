import 'dart:async';
import 'dart:io';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import '../models/dispatch.dart';
import '../portal_config.dart';
import 'local_db.dart';
import 'portal_api.dart';
import 'satellite_upload.dart';

// SyncService sends queued reports to the portal: at startup, straight after
// a report is saved, and whenever the connection comes back.
//
// Built for a station's satellite link (see satellite_upload.dart): photos
// are shrunk before sending, every file goes up resumably in 512 KiB pieces,
// and whatever already arrived is never sent again — so a link that drops
// halfway costs only the piece in flight.
//
// The portal's rules (firestore.rules, storage.rules) decide what it accepts:
// the report's authorUid must be the signed-in user, at most five photos, and
// notes of at most 2,000 characters. So:
//   - the author is stamped at sync time with whoever is signed in NOW;
//   - at most five photos are sent;
//   - a refusal is recorded against the report, in words, instead of being
//     swallowed — "queued" should never secretly mean "rejected".

class SyncService {
  SyncService({LocalDb? db, PortalApi? api})
      : _db = db ?? LocalDb(),
        _api = api ?? PortalApi.instance;

  /// The one the app uses; tests construct their own.
  static final SyncService instance = SyncService();

  /// The portal accepts at most this many photographs per report.
  static const maxPhotos = 5;

  final LocalDb _db;
  final PortalApi _api;
  bool _syncing = false;

  /// Bumped whenever a report reaches the portal, so screens can reload.
  final ValueNotifier<int> syncedCount = ValueNotifier(0);

  /// Why a report has not reached the portal yet, by report id, in words.
  final ValueNotifier<Map<String, String>> errors = ValueNotifier(const {});

  /// What is being sent right now, by report id — "Photo 2 of 4 · 60 %".
  final ValueNotifier<Map<String, String>> progress = ValueNotifier(const {});

  // Call once from main(). Syncs straight away, then on every reconnection —
  // and every two minutes while anything is queued, because a network change
  // is not always reported (Windows in particular can miss one).
  void startWatching() {
    Connectivity().onConnectivityChanged.listen((results) {
      final online = results.any((r) => r != ConnectivityResult.none);
      if (online) flush();
    });
    Timer.periodic(const Duration(minutes: 2), (_) async {
      if ((await _db.getPending()).isNotEmpty) await flush();
    });
    flush();
  }

  // Flush all pending local dispatches to the portal.
  Future<void> flush() async {
    if (_syncing) return;
    _syncing = true;
    try {
      try {
        await _api.idToken();
      } catch (e) {
        debugPrint('sync: portal unreachable — $e');
        return; // offline, or the link is down — the next reconnection retries
      }
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
      await _api.idToken();
      final uid = _api.cachedUid!;
      final base = 'dispatches/$uid/${d.id}';
      final media = Directory(p.join((await getApplicationDocumentsDirectory()).path, 'iia_scientist_media', d.id));
      await media.create(recursive: true);
      final state = File(p.join(media.path, '.upload_state.json'));
      final uploader = ResumableUploader(bucket: PortalConfig.bucket, token: _api.idToken);

      // Everything this report sends, in order, with a label for progress.
      final photos = d.imagePaths.take(maxPhotos).toList();
      final jobs = <({String label, String local, String remote})>[];
      if (d.voicePath != null) jobs.add((label: 'Voice memo', local: d.voicePath!, remote: '$base/voice.m4a'));
      for (var i = 0; i < photos.length; i++) {
        final small = await shrinkPhoto(photos[i], media.path);
        jobs.add((label: 'Photo ${i + 1} of ${photos.length}', local: small, remote: '$base/photo_$i${p.extension(small)}'));
      }
      if (d.csvPath != null) jobs.add((label: 'Data file', local: d.csvPath!, remote: '$base/${p.basename(d.csvPath!)}'));
      for (final doc in d.docPaths) {
        jobs.add((label: doc['name']!, local: doc['path']!, remote: '$base/docs/${doc['name']}'));
      }

      final urls = <String, String>{};
      for (final job in jobs) {
        _setProgress(d.id, '${job.label} · 0 %');
        urls[job.remote] = await uploader.upload(
          file: File(job.local),
          storagePath: job.remote,
          stateFile: state,
          onProgress: (f) => _setProgress(d.id, '${job.label} · ${(f * 100).round()} %'),
        );
      }
      _setProgress(d.id, 'Writing the report…');

      await _api.writeDispatch(d.id, {
        'authorUid': uid,
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
        'notes': d.notes.length > 2000 ? d.notes.substring(0, 2000) : d.notes,
        'teamMembers': d.teamMembers,
        'sampleIds': d.sampleIds,
        'safetyFlag': d.safetyFlag,
        'voiceUrl': d.voicePath == null ? null : urls['$base/voice.m4a'],
        'imageUrls': [
          for (final j in jobs.where((j) => j.label.startsWith('Photo '))) urls[j.remote]!,
        ],
        'csvUrl': d.csvPath == null ? null : urls['$base/${p.basename(d.csvPath!)}'],
        'docUrls': [
          for (final doc in d.docPaths) {'name': doc['name']!, 'url': urls['$base/docs/${doc['name']}']!},
        ],
        'caption': '',
        'status': 'raw',
        'publisherName': null,
        'adminNotes': null,
        'createdAt': d.createdAt.millisecondsSinceEpoch,
        'updatedAt': DateTime.now().millisecondsSinceEpoch,
      });

      await _db.markSynced(d.id);
      _setError(d.id, null);
      _setProgress(d.id, null);
      syncedCount.value++;
    } catch (e) {
      // Left in the queue to retry — with the reason on record. Uploads that
      // finished are remembered, so the retry picks up where this stopped.
      debugPrint('sync: ${d.id} not sent — $e');
      _setProgress(d.id, null);
      _setError(d.id, _describe(e));
    }
  }

  void _setError(String id, String? message) => errors.value = _with(errors.value, id, message);
  void _setProgress(String id, String? message) => progress.value = _with(progress.value, id, message);

  static Map<String, String> _with(Map<String, String> m, String id, String? message) {
    final next = Map<String, String>.from(m);
    if (message == null) {
      next.remove(id);
    } else {
      next[id] = message;
    }
    return next;
  }

  static String _describe(Object e) {
    if (e is PortalRefused) {
      return 'The portal refused this report. It will keep retrying; if it persists, contact the portal admin.';
    }
    if (e is TimeoutException || e is SocketException) {
      return 'The connection dropped — finished uploads are kept, the rest resumes when the link is back.';
    }
    if (e is FileSystemException) return 'A file attached to this report could not be read: ${e.path ?? ''}';
    if (e is HttpException) return e.message;
    return 'Sync failed: $e';
  }
}
