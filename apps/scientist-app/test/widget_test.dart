import 'package:flutter_test/flutter_test.dart';
import '../lib/models/dispatch.dart';
import '../lib/models/field_vocabulary.dart';
import '../lib/services/sync_service.dart';

// The app's half of the contract with the portal. The portal's own test
// (apps/portal/src/repository/fieldAppContract.test.ts) reads
// field_vocabulary.dart and checks it against types.ts; these check the
// app-side rules the portal's firestore.rules depend on.
void main() {
  test('weather goes over the wire as `present`, the portal\'s name', () {
    final m = const WeatherObs(presentWeather: 'Blowing snow').toMap();
    expect(m['present'], 'Blowing snow');
    expect(m.containsKey('presentWeather'), isFalse);
  });

  test('at most five photos — the portal refuses a sixth', () {
    expect(SyncService.maxPhotos, 5);
  });

  test('numbers outside a plausible range are caught', () {
    expect(validateNumber('-999', kAirTempRange, 'Air temperature'), isNotNull);
    expect(validateNumber('-24', kAirTempRange, 'Air temperature'), isNull);
    expect(validateNumber('', kAirTempRange, 'Air temperature'), isNull);
  });

  test('stations are India\'s, as the portal lists them', () {
    expect(kStations, ['Maitri', 'Bharati', 'Dakshin Gangotri', 'Other']);
  });
}
