import 'package:flutter/material.dart';
import '../models/dispatch.dart';
import '../services/local_db.dart';
import '../services/attachments.dart';
import '../services/sync_service.dart';

class DispatchProvider extends ChangeNotifier {
  final LocalDb _db = LocalDb();
  List<Dispatch> _items = [];

  List<Dispatch> get items => _items;

  Future<void> load() async {
    _items = await _db.getAll();
    notifyListeners();
  }

  Future<void> add(Dispatch d) async {
    // The report keeps its own copies of its files, so it can wait offline
    // for as long as it takes without depending on where the originals were.
    await _db.insertDispatch(await keepAttachments(d));
    await load();
    // Online now? Send it now — not only the next time the network changes.
    SyncService.instance.flush().then((_) => load());
  }

  /// Deletes a report from this device, with its kept attachments.
  ///
  /// A report that already reached the portal is only removed from the
  /// device — the portal's copy is the record, and this app has no business
  /// deleting it from there.
  Future<void> remove(String id) async {
    await _db.deleteDispatch(id);
    await dropAttachments(id);
    await load();
  }

  Future<void> refresh() => load();
}
