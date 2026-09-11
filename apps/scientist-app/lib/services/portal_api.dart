import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import '../portal_config.dart';

/// The app's connection to the portal, over Firebase's plain HTTPS APIs.
///
/// Why not the Firebase SDK: it has no Linux support, needs a separately
/// registered app per platform, and keeps heavy long-lived connections that
/// suit an office network better than a shared satellite link. These are the
/// same calls, made directly — the same code on Windows and Android.
///
/// Sign-in is anonymous, as before. The session (a refresh token) is kept in
/// the app's support folder, so a scientist keeps the same identity across
/// launches and can read back what they filed.
class PortalApi {
  PortalApi({http.Client? client}) : _http = client ?? http.Client();

  static final PortalApi instance = PortalApi();

  final http.Client _http;
  static const _timeout = Duration(seconds: 45);
  static const _fs = 'https://firestore.googleapis.com/v1/projects/${PortalConfig.projectId}/databases/(default)/documents';

  String? _uid;
  String? _idToken;
  String? _refreshToken;
  DateTime _expires = DateTime.fromMillisecondsSinceEpoch(0);

  /// The signed-in user's id, once known — null before the first sign-in.
  String? get cachedUid => _uid;

  Future<File> _sessionFile() async {
    final dir = await getApplicationSupportDirectory();
    return File(p.join(dir.path, 'portal_session.json'));
  }

  /// Loads a saved session without touching the network, so the app knows
  /// who it is even when it starts offline.
  Future<void> restore() async {
    try {
      final f = await _sessionFile();
      if (!await f.exists()) return;
      final s = jsonDecode(await f.readAsString()) as Map<String, dynamic>;
      _uid = s['uid'] as String?;
      _refreshToken = s['refreshToken'] as String?;
    } catch (_) {/* no saved session */}
  }

  Future<void> _save() async {
    final f = await _sessionFile();
    await f.parent.create(recursive: true);
    await f.writeAsString(jsonEncode({'uid': _uid, 'refreshToken': _refreshToken}));
  }

  /// A valid ID token, signing in (or refreshing) as needed. Throws when the
  /// portal cannot be reached.
  Future<String> idToken() async {
    if (_idToken != null && DateTime.now().isBefore(_expires)) return _idToken!;
    if (_refreshToken == null) await restore();

    if (_refreshToken != null) {
      final r = await _http.post(
        Uri.parse('https://securetoken.googleapis.com/v1/token?key=${PortalConfig.apiKey}'),
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        body: 'grant_type=refresh_token&refresh_token=${Uri.encodeQueryComponent(_refreshToken!)}',
      ).timeout(_timeout);
      if (r.statusCode == 200) {
        final j = jsonDecode(r.body) as Map<String, dynamic>;
        _take(j['user_id'] as String, j['id_token'] as String, j['refresh_token'] as String, j['expires_in']);
        await _save();
        return _idToken!;
      }
      // A refresh token that no longer works: fall through to a new session.
    }

    final r = await _http.post(
      Uri.parse('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${PortalConfig.apiKey}'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'returnSecureToken': true}),
    ).timeout(_timeout);
    if (r.statusCode != 200) throw HttpException('Sign-in refused (${r.statusCode})');
    final j = jsonDecode(r.body) as Map<String, dynamic>;
    _take(j['localId'] as String, j['idToken'] as String, j['refreshToken'] as String, j['expiresIn']);
    await _save();
    return _idToken!;
  }

  void _take(String uid, String idToken, String refresh, Object? expiresIn) {
    _uid = uid;
    _idToken = idToken;
    _refreshToken = refresh;
    final secs = int.tryParse('$expiresIn') ?? 3600;
    _expires = DateTime.now().add(Duration(seconds: secs - 120)); // refresh a little early
  }

  /// Writes a report document. `createdAtServer` is stamped by the server.
  Future<void> writeDispatch(String id, Map<String, dynamic> fields) async {
    await _commit({
      'update': {'name': _name('dispatches/$id'), 'fields': _fields(fields)},
      'updateTransforms': [
        {'fieldPath': 'createdAtServer', 'setToServerValue': 'REQUEST_TIME'},
      ],
    });
  }

  /// Student questions approved for scientists, oldest first.
  Future<List<Map<String, dynamic>>> readyQuestions() async {
    final r = await _http.post(
      Uri.parse('$_fs:runQuery'),
      headers: {'Authorization': 'Bearer ${await idToken()}', 'Content-Type': 'application/json'},
      body: jsonEncode({
        'structuredQuery': {
          'from': [{'collectionId': 'student_questions'}],
          'where': {
            'fieldFilter': {'field': {'fieldPath': 'status'}, 'op': 'EQUAL', 'value': {'stringValue': 'READY_FOR_SCIENTIST'}},
          },
          'orderBy': [{'field': {'fieldPath': 'questionApprovedAt'}, 'direction': 'ASCENDING'}],
        },
      }),
    ).timeout(_timeout);
    if (r.statusCode != 200) throw HttpException('Questions unavailable (${r.statusCode})');
    return (jsonDecode(r.body) as List)
        .where((row) => row['document'] != null)
        .map<Map<String, dynamic>>((row) {
          final doc = row['document'] as Map<String, dynamic>;
          return {'id': (doc['name'] as String).split('/').last, ..._decode(doc['fields'] as Map<String, dynamic>? ?? {})};
        })
        .toList();
  }

  /// Sends a scientist's answer for admin review.
  Future<void> answerQuestion(String id, String answer, String station) async {
    await _commit({
      'update': {
        'name': _name('student_questions/$id'),
        'fields': _fields({'status': 'PENDING_ANSWER', 'answer': answer, 'answeredByStation': station}),
      },
      'updateMask': {'fieldPaths': ['status', 'answer', 'answeredByStation']},
      'currentDocument': {'exists': true},
      'updateTransforms': [
        {'fieldPath': 'answeredAt', 'setToServerValue': 'REQUEST_TIME'},
      ],
    });
  }

  Future<void> _commit(Map<String, dynamic> write) async {
    final r = await _http.post(
      Uri.parse('$_fs:commit'),
      headers: {'Authorization': 'Bearer ${await idToken()}', 'Content-Type': 'application/json'},
      body: jsonEncode({'writes': [write]}),
    ).timeout(_timeout);
    if (r.statusCode == 403) throw const PortalRefused('The portal refused this write (permission denied).');
    if (r.statusCode != 200) throw HttpException('The portal returned ${r.statusCode}: ${r.body}');
  }

  static String _name(String path) => 'projects/${PortalConfig.projectId}/databases/(default)/documents/$path';

  static Map<String, dynamic> _fields(Map<String, dynamic> m) => m.map((k, v) => MapEntry(k, _value(v)));

  static Map<String, dynamic> _value(Object? v) {
    if (v == null) return {'nullValue': null};
    if (v is bool) return {'booleanValue': v};
    if (v is int) return {'integerValue': '$v'};
    if (v is double) return {'doubleValue': v};
    if (v is String) return {'stringValue': v};
    if (v is List) return {'arrayValue': {'values': v.map(_value).toList()}};
    if (v is Map) return {'mapValue': {'fields': v.map((k, x) => MapEntry('$k', _value(x)))}};
    return {'stringValue': '$v'};
  }

  static Map<String, dynamic> _decode(Map<String, dynamic> fields) => fields.map((k, v) => MapEntry(k, _read(v as Map<String, dynamic>)));

  static Object? _read(Map<String, dynamic> v) {
    if (v.containsKey('stringValue')) return v['stringValue'];
    if (v.containsKey('integerValue')) return int.tryParse('${v['integerValue']}');
    if (v.containsKey('doubleValue')) return (v['doubleValue'] as num).toDouble();
    if (v.containsKey('booleanValue')) return v['booleanValue'];
    if (v.containsKey('timestampValue')) return DateTime.tryParse('${v['timestampValue']}');
    if (v.containsKey('arrayValue')) return ((v['arrayValue']['values'] as List?) ?? []).map((x) => _read(x as Map<String, dynamic>)).toList();
    if (v.containsKey('mapValue')) return _decode((v['mapValue']['fields'] as Map<String, dynamic>?) ?? {});
    return null;
  }
}

/// The portal's rules refused a write — retrying will not help by itself.
class PortalRefused implements Exception {
  const PortalRefused(this.message);
  final String message;
  @override
  String toString() => message;
}
