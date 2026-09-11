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

  Future<void> refresh() => load();
}
