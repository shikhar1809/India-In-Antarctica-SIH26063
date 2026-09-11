import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider_platform_interface/path_provider_platform_interface.dart';
import 'package:plugin_platform_interface/plugin_platform_interface.dart';
import '../lib/portal_config.dart';
import '../lib/services/portal_api.dart';
import '../lib/services/satellite_upload.dart';

/// The app's real sync code against the live portal: anonymous sign-in, a
/// resumable upload, the report write, read back, then removed.
///
/// Touches the live Firebase project, so it only runs when asked:
///   flutter test test/live_portal_test.dart --dart-define=LIVE=true
class _Dirs extends PathProviderPlatform with MockPlatformInterfaceMixin {
  _Dirs(this.root);
  final String root;
  @override
  Future<String?> getApplicationSupportPath() async => root;
  @override
  Future<String?> getApplicationDocumentsPath() async => root;
}

const live = bool.fromEnvironment('LIVE');

void main() {
  test('a report travels from the app code to the live portal', () async {
    final tmp = Directory.systemTemp.createTempSync('live');
    PathProviderPlatform.instance = _Dirs(tmp.path);
    final api = PortalApi();

    // 1. Sign in, and the session survives a restart.
    final token = await api.idToken();
    final uid = api.cachedUid!;
    expect(token, isNotEmpty);
    final again = PortalApi();
    await again.restore();
    expect(again.cachedUid, uid, reason: 'the same identity after a restart');

    // 2. A resumable upload of a photo.
    final id = 'live-test-${DateTime.now().millisecondsSinceEpoch}';
    final photo = File('${tmp.path}/p.jpg')..writeAsBytesSync(List<int>.filled(700 * 1024, 9));
    final url = await ResumableUploader(bucket: PortalConfig.bucket, token: api.idToken).upload(
      file: photo,
      storagePath: 'dispatches/$uid/$id/photo_0.jpg',
      stateFile: File('${tmp.path}/.upload_state.json'),
    );
    final got = await http.get(Uri.parse(url));
    expect(got.statusCode, 200);
    expect(got.bodyBytes.length, 700 * 1024);

    // 3. The report itself, shaped as SyncService writes it — the rules accept it.
    await api.writeDispatch(id, {
      'authorUid': uid, 'authorName': 'Live Test', 'observedAt': DateTime.now().millisecondsSinceEpoch,
      'station': 'Maitri', 'lat': -70.766, 'lon': 11.7333, 'elevationM': 117.0, 'positionSource': 'GPS handheld',
      'activity': 'Ice / glaciology survey', 'priority': 'routine',
      'weather': {'airTempC': -14.5, 'windSpeedKt': 6.0, 'windDir': 'S', 'visibilityKm': 25.0, 'cloudOktas': 1, 'present': 'Clear'},
      'measurements': {'iceThickCm': '182'}, 'notes': 'Live test from the field app code. Safe to ignore.',
      'teamMembers': '', 'sampleIds': '', 'safetyFlag': false, 'voiceUrl': null, 'imageUrls': [url], 'csvUrl': null,
      'docUrls': [], 'caption': '', 'status': 'raw', 'publisherName': null, 'adminNotes': null,
      'createdAt': DateTime.now().millisecondsSinceEpoch, 'updatedAt': DateTime.now().millisecondsSinceEpoch,
    });

    // 4. Read it back as its author, then remove it.
    final doc = 'https://firestore.googleapis.com/v1/projects/${PortalConfig.projectId}/databases/(default)/documents/dispatches/$id';
    final auth = {'Authorization': 'Bearer ${await api.idToken()}'};
    final read = await http.get(Uri.parse(doc), headers: auth);
    expect(read.statusCode, 200);
    final fields = (jsonDecode(read.body) as Map)['fields'] as Map;
    expect(fields['status'], {'stringValue': 'raw'});
    expect(fields.containsKey('createdAtServer'), isTrue, reason: 'the server stamped the time');
    expect((await http.delete(Uri.parse(doc), headers: auth)).statusCode, 200);

    tmp.deleteSync(recursive: true);
  }, skip: live ? false : 'live test — run with --dart-define=LIVE=true', timeout: const Timeout(Duration(minutes: 3)));
}
