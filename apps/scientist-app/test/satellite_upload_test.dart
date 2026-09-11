import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:image/image.dart' as img;
import '../lib/services/satellite_upload.dart';

/// A fake Firebase Storage that speaks the resumable protocol, keeps what it
/// has received, and can be told to drop the connection on a given request.
class FakeStorage {
  final received = <int>[];
  int requests = 0;
  int? dropOnRequest;
  bool finalised = false;

  late final client = MockClient((req) async {
    requests++;
    if (dropOnRequest == requests) throw const SocketException('satellite link lost');
    final cmd = req.headers['X-Goog-Upload-Command'] ?? req.headers['x-goog-upload-command'];
    if (cmd == 'start') {
      return http.Response('', 200, headers: {'x-goog-upload-url': 'https://upload.test/session/1'});
    }
    if (cmd == 'query') {
      return http.Response('', 200, headers: {
        'x-goog-upload-status': finalised ? 'final' : 'active',
        'x-goog-upload-size-received': '${received.length}',
      });
    }
    final offset = int.parse(req.headers['X-Goog-Upload-Offset'] ?? req.headers['x-goog-upload-offset']!);
    expect(offset, received.length, reason: 'a resumed upload must continue exactly where the server stopped');
    received.addAll(req.bodyBytes);
    if (cmd!.contains('finalize')) {
      finalised = true;
      return http.Response(jsonEncode({'size': '${received.length}', 'downloadTokens': 'tok123'}), 200);
    }
    return http.Response('', 200);
  });
}

void main() {
  late Directory tmp;
  setUp(() => tmp = Directory.systemTemp.createTempSync('sat'));
  tearDown(() => tmp.deleteSync(recursive: true));

  test('a dropped link resumes from where the server stopped, and nothing is sent twice', () async {
    final data = List<int>.generate(1300 * 1024, (i) => i % 251); // 1.3 MB: three pieces
    final file = File('${tmp.path}/photo.jpg')..writeAsBytesSync(data);
    final state = File('${tmp.path}/.upload_state.json');
    final storage = FakeStorage()..dropOnRequest = 3; // start, piece 1, then the link drops
    Future<String> token() async => 'id-token';
    final up = ResumableUploader(bucket: 'b', token: token, client: storage.client);

    await expectLater(
      up.upload(file: file, storagePath: 'dispatches/u/r/photo_0.jpg', stateFile: state),
      throwsA(isA<SocketException>()),
    );
    expect(storage.received.length, 512 * 1024, reason: 'one piece arrived before the drop');

    final progress = <double>[];
    final url = await up.upload(file: file, storagePath: 'dispatches/u/r/photo_0.jpg', stateFile: state, onProgress: progress.add);
    expect(storage.received, data, reason: 'the server ends up with exactly the file');
    expect(url, contains('token=tok123'));
    expect(progress.last, 1.0);

    final before = storage.requests;
    final again = await up.upload(file: file, storagePath: 'dispatches/u/r/photo_0.jpg', stateFile: state);
    expect(again, url);
    expect(storage.requests, before, reason: 'a finished file is never uploaded again');
  });

  test('a large photo is shrunk for the satellite link and loses its EXIF', () async {
    final big = img.Image(width: 4000, height: 3000);
    img.fill(big, color: img.ColorRgb8(40, 90, 160));
    for (var x = 0; x < 4000; x += 7) {
      img.drawLine(big, x1: x, y1: 0, x2: 4000 - x, y2: 2999, color: img.ColorRgb8(x % 255, 200, 90));
    }
    big.exif.gpsIfd['GPSLatitude'] = img.IfdValueAscii('70.766');
    final original = File('${tmp.path}/IMG_0001.jpg')..writeAsBytesSync(img.encodeJpg(big, quality: 98));

    final shrunk = await shrinkPhoto(original.path, tmp.path);
    expect(shrunk, isNot(original.path));
    final out = img.decodeJpg(File(shrunk).readAsBytesSync())!;
    expect(out.width, 2048);
    expect(out.height, 1536);
    expect(File(shrunk).lengthSync(), lessThan(original.lengthSync()));
    expect(out.exif.gpsIfd.isEmpty, isTrue, reason: 'no GPS tag leaves the machine');
    expect(File(original.path).existsSync(), isTrue, reason: 'the original is kept untouched');
  });

  test('a photo that is already small is sent as it is', () async {
    final small = img.Image(width: 800, height: 600);
    final f = File('${tmp.path}/small.jpg')..writeAsBytesSync(img.encodeJpg(small));
    expect(await shrinkPhoto(f.path, tmp.path), f.path);
  });
}
