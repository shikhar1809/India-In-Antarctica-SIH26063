import 'package:flutter/material.dart';
import '../models/dispatch.dart';
import '../services/local_db.dart';

class DispatchProvider extends ChangeNotifier {
  final LocalDb _db = LocalDb();
  List<Dispatch> _items = [];

  List<Dispatch> get items => _items;

  Future<void> load() async {
    _items = await _db.getAll();
    notifyListeners();
  }

  Future<void> add(Dispatch d) async {
    await _db.insertDispatch(d);
    await load();
  }

  Future<void> refresh() => load();
}
