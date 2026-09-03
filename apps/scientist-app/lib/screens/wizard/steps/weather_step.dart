import 'package:flutter/material.dart';
import '../../../app_theme.dart';
import '../../../models/field_vocabulary.dart';
import '../../../models/dispatch.dart';
import '../field_report_wizard.dart';
import '../wizard_common.dart';

// Was a 16-point compass and METAR shorthand (FG, BLSN, TSGR) that the
// portal could not read. Both now come from the shared vocabulary.
const _windDirs = kWindDirs;
const _presentWeather = kPresentWeather;

class WeatherStep extends StatefulWidget {
  final WizardState state;
  final VoidCallback onChanged;
  const WeatherStep({super.key, required this.state, required this.onChanged});

  @override
  State<WeatherStep> createState() => _WeatherStepState();
}

class _WeatherStepState extends State<WeatherStep> {
  WeatherObs get _wx => widget.state.weather;

  void _update(WeatherObs updated) {
    widget.state.weather = updated;
    widget.onChanged();
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const GtaSectionHead('Step 3 — Weather / Met'),
        const SizedBox(height: 24),

        Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const WizLabel('AIR TEMP (°C)'),
                  _NumField(
                    value: _wx.airTempC?.toString() ?? '',
                    hint: '-12.4',
                    range: kAirTempRange,
                    label: 'Air temperature',
                    unit: '°C',
                    onChanged: (v) => _update(_wx.copyWith(airTempC: double.tryParse(v))),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const WizLabel('WIND SPEED (kts)'),
                  _NumField(
                    value: _wx.windSpeedKt?.toString() ?? '',
                    hint: '18',
                    range: kWindSpeedRange,
                    label: 'Wind speed',
                    unit: 'kt',
                    onChanged: (v) => _update(_wx.copyWith(windSpeedKt: double.tryParse(v))),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),

        Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const WizLabel('WIND DIRECTION'),
                  DropdownButtonFormField<String>(
                    value: _wx.windDir.isEmpty ? null : _wx.windDir,
                    decoration: const InputDecoration(hintText: 'DIR'),
                    dropdownColor: AppTheme.surfaceHi,
                    style: const TextStyle(color: AppTheme.textPri, fontFamily: 'Courier', fontSize: 13),
                    items: _windDirs.map((d) => DropdownMenuItem(value: d, child: Text(d))).toList(),
                    onChanged: (v) => _update(_wx.copyWith(windDir: v ?? '')),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const WizLabel('VISIBILITY (km)'),
                  _NumField(
                    value: _wx.visibilityKm?.toString() ?? '',
                    hint: '5.0',
                    range: kVisibilityRange,
                    label: 'Visibility',
                    unit: 'km',
                    onChanged: (v) => _update(_wx.copyWith(visibilityKm: double.tryParse(v))),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 20),

        const WizLabel('CLOUD COVER (OKTAS)'),
        Row(
          children: List.generate(9, (i) {
            final selected = _wx.cloudOktas == i;
            return Expanded(
              child: GestureDetector(
                onTap: () => _update(_wx.copyWith(cloudOktas: i)),
                child: Container(
                  margin: const EdgeInsets.only(right: 4),
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  decoration: BoxDecoration(
                    color: selected ? AppTheme.amber.withOpacity(0.15) : AppTheme.surfaceHi,
                    border: Border.all(color: selected ? AppTheme.amber : AppTheme.border),
                  ),
                  child: Column(
                    children: [
                      CustomPaint(
                        size: const Size(16, 16),
                        painter: _OktaPainter(i),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '$i',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w900,
                          color: selected ? AppTheme.amber : AppTheme.textMuted,
                          fontFamily: 'Courier',
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            );
          }),
        ),
        const SizedBox(height: 20),

        const WizLabel('PRESENT WEATHER'),
        Wrap(
          spacing: 6, runSpacing: 6,
          children: _presentWeather.map((pw) {
            final sel = _wx.presentWeather == pw;
            return GestureDetector(
              onTap: () => _update(_wx.copyWith(presentWeather: pw)),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                decoration: BoxDecoration(
                  color: sel ? AppTheme.amber.withOpacity(0.12) : AppTheme.surfaceHi,
                  border: Border.all(color: sel ? AppTheme.amber : AppTheme.border),
                ),
                child: Text(
                  pw,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: sel ? AppTheme.amber : AppTheme.textSec,
                    fontFamily: 'Courier',
                  ),
                ),
              ),
            );
          }).toList(),
        ),

        const SizedBox(height: 20),
        if (_wx.airTempC != null)
          Container(
            padding: const EdgeInsets.all(12),
            color: AppTheme.surfaceHi,
            child: Text(
              _wx.toRadioLine(),
              style: const TextStyle(fontSize: 12, fontFamily: 'Courier', color: AppTheme.textPri),
            ),
          ),
      ],
    );
  }
}

class _NumField extends StatefulWidget {
  final String value;
  final String hint;
  final ValueChanged<String> onChanged;

  /// Plausible envelope for this reading. The wizard previously had no
  /// validation at all, so -999 °C or a wind speed of 4000 kt submitted
  /// happily and only surfaced as a warning in the portal days later.
  final PlausibleRange? range;
  final String? label;
  final String? unit;

  const _NumField({
    required this.value,
    required this.hint,
    required this.onChanged,
    this.range,
    this.label,
    this.unit,
  });

  @override
  State<_NumField> createState() => _NumFieldState();
}

class _NumFieldState extends State<_NumField> {
  String? _error;

  void _handle(String v) {
    final range = widget.range;
    setState(() {
      _error = range == null
          ? null
          : validateNumber(v, range, widget.label ?? 'This', unit: widget.unit);
    });
    widget.onChanged(v);
  }

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      initialValue: widget.value,
      keyboardType: const TextInputType.numberWithOptions(signed: true, decimal: true),
      decoration: InputDecoration(
        hintText: widget.hint,
        errorText: _error,
        errorStyle: const TextStyle(fontFamily: 'Courier', fontSize: 9, color: AppTheme.danger),
      ),
      style: const TextStyle(fontFamily: 'Courier', fontSize: 13, color: AppTheme.textPri),
      onChanged: _handle,
    );
  }
}

class _OktaPainter extends CustomPainter {
  final int oktas;
  const _OktaPainter(this.oktas);

  @override
  void paint(Canvas canvas, Size size) {
    final bg = Paint()
      ..color = AppTheme.border
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1;
    final fill = Paint()
      ..color = AppTheme.amber
      ..style = PaintingStyle.fill;
    final r = size.width / 2;
    final c = Offset(r, r);
    canvas.drawCircle(c, r, bg);
    if (oktas > 0) {
      final sweep = (oktas / 8) * 2 * 3.14159265;
      canvas.drawArc(Rect.fromCircle(center: c, radius: r), -3.14159265 / 2, sweep, true, fill);
    }
  }

  @override
  bool shouldRepaint(_OktaPainter o) => o.oktas != oktas;
}
