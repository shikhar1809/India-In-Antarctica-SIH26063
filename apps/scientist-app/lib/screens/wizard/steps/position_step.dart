import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import '../../../app_theme.dart';
import '../field_report_wizard.dart';
import '../wizard_common.dart';
import '../../../models/field_vocabulary.dart';

// Matches POSITION_SOURCES in the portal — see field_vocabulary.dart.
const _posSources = kPositionSources;

class PositionStep extends StatelessWidget {
  final WizardState state;
  final VoidCallback onChanged;
  const PositionStep({super.key, required this.state, required this.onChanged});

  Future<void> _getGps() async {
    bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) return;
    LocationPermission perm = await Geolocator.checkPermission();
    if (perm == LocationPermission.denied) {
      perm = await Geolocator.requestPermission();
    }
    if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) return;
    final pos = await Geolocator.getCurrentPosition(desiredAccuracy: LocationAccuracy.high);
    state.lat = pos.latitude;
    state.lon = pos.longitude;
    state.elevationM = pos.altitude;
    // The fix's own horizontal accuracy, which the plugin has always returned
    // and this app used to throw away. A coordinate with no accuracy figure
    // can't be judged, and the repository records it as metadata.
    state.positionAccuracyM = pos.accuracy;
    state.positionSource = 'GPS handheld';
    onChanged();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const GtaSectionHead('Step 2 — Position'),
        const SizedBox(height: 24),

        InkWell(
          onTap: _getGps,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
            decoration: BoxDecoration(
              border: Border.all(color: AppTheme.amber),
            ),
            child: const Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.gps_fixed, color: AppTheme.amber, size: 16),
                SizedBox(width: 10),
                Text(
                  'GET GPS POSITION',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 0.1,
                    color: AppTheme.amber,
                    fontFamily: 'Courier',
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 20),

        Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const WizLabel('LATITUDE (°S negative)'),
                  _CoordField(
                    value: state.lat?.toString() ?? '',
                    hint: '-68.5832',
                    onChanged: (v) { state.lat = double.tryParse(v); onChanged(); },
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const WizLabel('LONGITUDE (°E positive)'),
                  _CoordField(
                    value: state.lon?.toString() ?? '',
                    hint: '77.9691',
                    onChanged: (v) { state.lon = double.tryParse(v); onChanged(); },
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),

        const WizLabel('ELEVATION (m)'),
        _CoordField(
          value: state.elevationM?.toString() ?? '',
          hint: '24',
          onChanged: (v) { state.elevationM = double.tryParse(v); onChanged(); },
        ),
        const SizedBox(height: 16),

        const WizLabel('POSITION SOURCE'),
        DropdownButtonFormField<String>(
          value: state.positionSource.isEmpty ? null : state.positionSource,
          decoration: const InputDecoration(hintText: 'Select source'),
          dropdownColor: AppTheme.surfaceHi,
          style: const TextStyle(color: AppTheme.textPri, fontFamily: 'Courier', fontSize: 13),
          items: _posSources.map((s) => DropdownMenuItem(value: s, child: Text(s))).toList(),
          onChanged: (v) { if (v != null) { state.positionSource = v; onChanged(); } },
        ),

        if (state.lat != null && state.lon != null) ...[
          const SizedBox(height: 20),
          Container(
            padding: const EdgeInsets.all(14),
            color: AppTheme.surfaceHi,
            child: Text(
              '${state.lat!.abs().toStringAsFixed(5)}°${state.lat! < 0 ? 'S' : 'N'}   '
              '${state.lon!.abs().toStringAsFixed(5)}°${state.lon! < 0 ? 'W' : 'E'}'
              '${state.elevationM != null ? '   ${state.elevationM!.toStringAsFixed(0)} m' : ''}',
              style: const TextStyle(
                fontSize: 13,
                fontFamily: 'Courier',
                color: AppTheme.textPri,
                letterSpacing: 0.05,
              ),
            ),
          ),
        ],
      ],
    );
  }
}

class _CoordField extends StatelessWidget {
  final String value;
  final String hint;
  final ValueChanged<String> onChanged;
  const _CoordField({required this.value, required this.hint, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      initialValue: value,
      keyboardType: const TextInputType.numberWithOptions(signed: true, decimal: true),
      decoration: InputDecoration(hintText: hint),
      style: const TextStyle(fontFamily: 'Courier', fontSize: 13, color: AppTheme.textPri),
      onChanged: onChanged,
    );
  }
}
