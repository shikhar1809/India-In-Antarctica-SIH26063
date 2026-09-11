import 'dart:convert';
import 'dart:io';
import 'dart:isolate';
import 'dart:math';
import 'package:http/http.dart' as http;
import 'package:image/image.dart' as img;
import 'package:path/path.dart' as p;

/// Uploading over a station's satellite link.
///
/// Maitri and Bharati reach the world through a shared satellite link: slow,
/// high-latency, and liable to drop. Three things follow, and this file does
/// all three:
///
/// 1. Send less. A phone photo is 4–12 MB; the portal shows it at most
///    ~2,000 px wide. Photos are shrunk to 2,048 px on the long side at JPEG
///    quality 82 before upload — typically 0.4–1 MB — and their EXIF block
///    (camera serials, often a GPS fix) is dropped. The original stays on
///    this machine untouched.
///
/// 2. Never start over. Files go up through Firebase Storage's resumable
///    protocol in 512 KiB pieces. If the link drops at 80 %, the next attempt
///    asks the server how much it already has and continues from there —
///    even after the app has been closed and reopened.
///
/// 3. Never send twice. Every finished upload is recorded beside the report;
///    a retry after a partial failure skips what already arrived.
///
/// State lives in `.upload_state.json` in the report's media folder.

const _chunk = 512 * 1024; // a multiple of 256 KiB, as the protocol requires
const _maxSide = 2048;
const _quality = 82;

/// Returns the path of a satellite-sized copy of [path] (made once, kept in
/// [dir]), or [path] itself when it is not a photo worth shrinking.
Future<String> shrinkPhoto(String path, String dir) async {
  final ext = p.extension(path).toLowerCase();
  if (!const ['.jpg', '.jpeg', '.png', '.tif', '.tiff'].contains(ext)) return path;
  final out = p.join(dir, 'sat_${p.basenameWithoutExtension(path)}.jpg');
  if (await File(out).exists()) return out;
  try {
    final made = await Isolate.run(() => _shrink(path, out));
    return made ? out : path;
  } catch (_) {
    return path; // a photo that cannot be decoded goes up as it is
  }
}

bool _shrink(String path, String out) {
  final bytes = File(path).readAsBytesSync();
  final decoded = img.decodeImage(bytes);
  if (decoded == null) return false;
  final longest = max(decoded.width, decoded.height);
  // Already small, and already a JPEG: nothing to gain.
  if (longest <= _maxSide && bytes.length <= 1200 * 1024 && p.extension(path).toLowerCase().startsWith('.jp')) {
    return false;
  }
  final oriented = img.bakeOrientation(decoded);
  final resized = longest > _maxSide
      ? img.copyResize(oriented, width: oriented.width >= oriented.height ? _maxSide : null, height: oriented.height > oriented.width ? _maxSide : null)
      : oriented;
  resized.exif = img.ExifData(); // no camera serials or GPS tags leave the machine
  File(out).writeAsBytesSync(img.encodeJpg(resized, quality: _quality));
  return true;
}

String contentTypeOf(String path) {
  switch (p.extension(path).toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.tif':
    case '.tiff':
      return 'image/tiff';
    case '.m4a':
      return 'audio/mp4';
    case '.csv':
      return 'text/csv';
    case '.pdf':
      return 'application/pdf';
    case '.txt':
      return 'text/plain';
    default:
      return 'application/octet-stream';
  }
}

/// Resumable uploads into one Firebase Storage bucket, remembering progress
/// in a state file so a dropped link — or a restart — costs nothing.
class ResumableUploader {
  ResumableUploader({required this.bucket, required this.token, http.Client? client})
      : _http = client ?? http.Client();

  final String bucket;

  /// A fresh Firebase ID token for the signed-in user.
  final Future<String> Function() token;
  final http.Client _http;

  static const _timeout = Duration(seconds: 60);

  /// Uploads [file] to [storagePath] and returns its download URL.
  /// [onProgress] is called with the fraction of this file sent so far.
  Future<String> upload({
    required File file,
    required String storagePath,
    required File stateFile,
    void Function(double fraction)? onProgress,
  }) async {
    final state = await _read(stateFile);
    final entry = Map<String, dynamic>.from(state[storagePath] as Map? ?? {});
    if (entry['url'] is String) return entry['url'] as String; // already there

    final size = await file.length();
    final type = contentTypeOf(file.path);
    final auth = {'Authorization': 'Firebase ${await token()}'};

    // An existing session: how much has the server already got?
    String? session = entry['session'] as String?;
    var offset = 0;
    if (session != null) {
      final q = await _http.post(Uri.parse(session), headers: {'X-Goog-Upload-Command': 'query'}).timeout(_timeout);
      final status = q.headers['x-goog-upload-status'];
      if (q.statusCode == 200 && status == 'active') {
        offset = int.tryParse(q.headers['x-goog-upload-size-received'] ?? '0') ?? 0;
      } else if (q.statusCode == 200 && status == 'final') {
        final url = _urlFrom(storagePath, q.body);
        if (url != null) return _done(stateFile, state, storagePath, url);
        session = null;
      } else {
        session = null; // expired (sessions last about a week) — start again
      }
    }

    if (session == null) {
      final start = await _http.post(
        Uri.parse('https://firebasestorage.googleapis.com/v0/b/$bucket/o?name=${Uri.encodeComponent(storagePath)}'),
        headers: {
          ...auth,
          'Content-Type': 'application/json',
          'X-Goog-Upload-Protocol': 'resumable',
          'X-Goog-Upload-Command': 'start',
          'X-Goog-Upload-Header-Content-Length': '$size',
          'X-Goog-Upload-Header-Content-Type': type,
        },
        body: jsonEncode({'name': storagePath, 'contentType': type}),
      ).timeout(_timeout);
      session = start.headers['x-goog-upload-url'];
      if (start.statusCode != 200 || session == null) {
        throw HttpException('Storage refused the upload (${start.statusCode}): ${start.body}');
      }
      state[storagePath] = {'session': session};
      await _write(stateFile, state);
    }

    final raf = await file.open();
    try {
      while (true) {
        final remaining = size - offset;
        final last = remaining <= _chunk;
        final length = last ? remaining : _chunk;
        await raf.setPosition(offset);
        final bytes = await raf.read(length);
        final res = await _http.post(
          Uri.parse(session),
          headers: {
            'X-Goog-Upload-Command': last ? 'upload, finalize' : 'upload',
            'X-Goog-Upload-Offset': '$offset',
          },
          body: bytes,
        ).timeout(_timeout);
        if (res.statusCode != 200) {
          throw HttpException('Upload interrupted (${res.statusCode}) at ${(offset / size * 100).round()} %');
        }
        offset += length;
        onProgress?.call(size == 0 ? 1 : offset / size);
        if (last) {
          final url = _urlFrom(storagePath, res.body);
          if (url == null) throw const HttpException('Storage finished the upload but returned no download link');
          return await _done(stateFile, state, storagePath, url);
        }
      }
    } finally {
      await raf.close();
    }
  }

  String? _urlFrom(String storagePath, String body) {
    try {
      final meta = jsonDecode(body) as Map<String, dynamic>;
      final token = (meta['downloadTokens'] as String?)?.split(',').first;
      if (token == null) return null;
      return 'https://firebasestorage.googleapis.com/v0/b/$bucket/o/${Uri.encodeComponent(storagePath)}?alt=media&token=$token';
    } catch (_) {
      return null;
    }
  }

  Future<String> _done(File stateFile, Map<String, dynamic> state, String storagePath, String url) async {
    state[storagePath] = {'url': url};
    await _write(stateFile, state);
    return url;
  }

  static Future<Map<String, dynamic>> _read(File f) async {
    try {
      if (await f.exists()) return Map<String, dynamic>.from(jsonDecode(await f.readAsString()) as Map);
    } catch (_) {/* unreadable state: start fresh, nothing is lost but time */}
    return {};
  }

  static Future<void> _write(File f, Map<String, dynamic> state) async {
    await f.parent.create(recursive: true);
    await f.writeAsString(jsonEncode(state));
  }
}
