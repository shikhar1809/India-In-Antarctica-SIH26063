import 'dart:io';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import '../models/dispatch.dart';

/// Copies a report's attachments into the app's own folder when it is saved.
///
/// A report filed offline may wait days for a connection. Until now it held
/// only the paths of the original files — a photo on a camera card, a voice
/// memo in a temp folder, a CSV on a USB stick — so if any of those moved or
/// was removed before the connection came back, the upload failed and the
/// report was stuck. The copies live under Documents\iia_scientist_media\<id>,
/// beside the report database, and are what the sync service uploads.
///
/// A file that cannot be copied keeps its original path rather than stopping
/// the save: the report is never lost over an attachment.
Future<Dispatch> keepAttachments(Dispatch d) async {
  final docs = await getApplicationDocumentsDirectory();
  final dir = Directory(p.join(docs.path, 'iia_scientist_media', d.id));
  await dir.create(recursive: true);
  var n = 0;

  Future<String> keep(String source) async {
    try {
      final file = File(source);
      if (!await file.exists() || p.isWithin(dir.path, source)) return source;
      // Numbered, so two "IMG_0001.jpg" from different folders both survive.
      final dest = p.join(dir.path, '${n++}_${p.basename(source)}');
      await file.copy(dest);
      return dest;
    } catch (_) {
      return source;
    }
  }

  final images = <String>[];
  for (final path in d.imagePaths) {
    images.add(await keep(path));
  }
  final docsKept = <Map<String, String>>[];
  for (final doc in d.docPaths) {
    docsKept.add({'name': doc['name']!, 'path': await keep(doc['path']!)});
  }

  return Dispatch(
    id: d.id,
    authorUid: d.authorUid,
    authorName: d.authorName,
    observedAt: d.observedAt,
    station: d.station,
    lat: d.lat,
    lon: d.lon,
    elevationM: d.elevationM,
    positionSource: d.positionSource,
    activity: d.activity,
    priority: d.priority,
    weather: d.weather,
    measurements: d.measurements,
    notes: d.notes,
    teamMembers: d.teamMembers,
    sampleIds: d.sampleIds,
    safetyFlag: d.safetyFlag,
    voicePath: d.voicePath == null ? null : await keep(d.voicePath!),
    imagePaths: images,
    csvPath: d.csvPath == null ? null : await keep(d.csvPath!),
    docPaths: docsKept,
    status: d.status,
    synced: d.synced,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  );
}
