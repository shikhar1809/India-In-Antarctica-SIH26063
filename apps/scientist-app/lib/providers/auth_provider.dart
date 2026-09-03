import 'dart:convert';
import 'package:crypto/crypto.dart';
import 'package:firebase_auth/firebase_auth.dart' as fb_auth;
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import '../models/scientist_profile.dart';
import '../services/local_db.dart';

enum AuthStatus { loading, noProfile, locked, unlocked }

class AuthProvider extends ChangeNotifier {
  AuthStatus _status = AuthStatus.loading;
  ScientistProfile? _profile;

  AuthStatus get status => _status;
  ScientistProfile? get profile => _profile;
  bool get isUnlocked => _status == AuthStatus.unlocked;

  AuthProvider() {
    _init();
  }

  Future<void> _init() async {
    final p = await LocalDb().getProfile();
    _profile = p;
    _status = p == null ? AuthStatus.noProfile : AuthStatus.locked;
    notifyListeners();
  }

  static String hashPin(String pin) {
    final bytes = utf8.encode(pin);
    return sha256.convert(bytes).toString();
  }

  /// Creates a new profile on first launch. Returns null on success, error string on failure.
  Future<String?> setupProfile({
    required String name,
    required String instituteId,
    required String station,
    required String pin,
    required String confirmPin,
  }) async {
    if (name.trim().isEmpty) return 'Name is required';
    if (instituteId.trim().isEmpty) return 'Institute ID is required';
    if (station.trim().isEmpty) return 'Station is required';
    if (pin.length != 4) return 'PIN must be 4 digits';
    if (pin != confirmPin) return 'PINs do not match';
    if (!RegExp(r'^\d{4}$').hasMatch(pin)) return 'PIN must be digits only';

    final profile = ScientistProfile(
      uid: _generateUid(),
      name: name.trim(),
      instituteId: instituteId.trim(),
      station: station.trim(),
      pinHash: hashPin(pin),
    );
    await LocalDb().saveProfile(profile);
    _profile = profile;
    _status = AuthStatus.unlocked;
    notifyListeners();
    return null;
  }

  /// Returns true if PIN is correct and unlocks the app.
  Future<bool> unlock(String pin) async {
    if (_profile == null) return false;
    if (hashPin(pin) == _profile!.pinHash) {
      _status = AuthStatus.unlocked;
      notifyListeners();
      return true;
    }
    return false;
  }

  void lock() {
    _status = AuthStatus.locked;
    notifyListeners();
  }

  Future<void> updateAppearance({
    int? parkaColor,
    int? hoodColor,
    bool? showPatch,
    bool? hoodOn,
    bool? goggles,
    bool? pack,
    bool? gloveMode,
  }) async {
    if (_profile == null) return;
    _profile = _profile!.copyWith(
      parkaColor: parkaColor,
      hoodColor: hoodColor,
      showPatch: showPatch,
      hoodOn: hoodOn,
      goggles: goggles,
      pack: pack,
      gloveMode: gloveMode,
    );
    await LocalDb().saveProfile(_profile!);
    notifyListeners();
  }

  Future<void> resetProfile() async {
    await LocalDb().deleteProfile();
    _profile = null;
    _status = AuthStatus.noProfile;
    notifyListeners();
  }

  String _generateUid() {
    // Prefer the Firebase anonymous UID so Firestore rules accept writes.
    // Fall back to a local ID if Firebase is unavailable (offline first run).
    if (Firebase.apps.isNotEmpty) {
      final firebaseUid = fb_auth.FirebaseAuth.instance.currentUser?.uid;
      if (firebaseUid != null) return firebaseUid;
    }
    final t = DateTime.now().millisecondsSinceEpoch.toRadixString(16);
    final r = (t.hashCode ^ DateTime.now().microsecondsSinceEpoch).abs().toRadixString(16);
    return 'local-$t-$r';
  }
}
