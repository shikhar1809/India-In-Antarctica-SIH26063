import 'package:flutter/material.dart';
import 'package:path/path.dart' as p;
import '../../../app_theme.dart';
import '../field_report_wizard.dart';

// Step 7 — Review everything before committing to local DB.
// GTA SA look: amber section cards, bold uppercase labels, no rounding.

class RecordStep extends StatelessWidget {
  final WizardState state;
  final Future<void> Function() onSubmit;
  const RecordStep({super.key, required this.state, required this.onSubmit});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const GtaSectionHead('Step 7 — Review & Record'),
        const SizedBox(height: 24),

        // Activity card
        _Card(label: 'ACTIVITY', children: [
          _Row('Station', state.station),
          _Row('Activity', state.activity),
          _Row('Priority', state.priority.name.toUpperCase()),
          _Row('Observed', state.observedAt.toIso8601String().substring(0, 16).replaceAll('T', ' ') + ' UTC'),
        ]),

        // Position card
        if (state.lat != null)
          _Card(label: 'POSITION', children: [
            _Row('Lat', '${state.lat!.abs().toStringAsFixed(5)}°${state.lat! < 0 ? 'S' : 'N'}'),
            _Row('Lon', '${state.lon!.abs().toStringAsFixed(5)}°${state.lon! < 0 ? 'W' : 'E'}'),
            if (state.elevationM != null) _Row('Elevation', '${state.elevationM!.toStringAsFixed(0)} m'),
            _Row('Source', state.positionSource),
          ]),

        // Weather card
        _Card(label: 'WEATHER', children: [
          _Row('Conditions', state.weather.toRadioLine()),
        ]),

        // Observation card
        if (state.notes.isNotEmpty || state.teamMembers.isNotEmpty || state.sampleIds.isNotEmpty)
          _Card(label: 'OBSERVATION', children: [
            if (state.notes.isNotEmpty) _Row('Notes', state.notes),
            if (state.teamMembers.isNotEmpty) _Row('Field party', state.teamMembers),
            if (state.sampleIds.isNotEmpty) _Row('Samples', state.sampleIds),
          ]),

        // Safety flag
        if (state.safetyFlag)
          Container(
            margin: const EdgeInsets.only(bottom: 16),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: AppTheme.danger.withOpacity(0.08),
              border: Border.all(color: AppTheme.danger.withOpacity(0.5)),
            ),
            child: const Row(
              children: [
                Icon(Icons.warning_rounded, color: AppTheme.danger, size: 16),
                SizedBox(width: 10),
                Text(
                  'FLAGGED FOR STATION LEADER',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w900,
                    color: AppTheme.danger,
                    letterSpacing: 0.1,
                    fontFamily: 'Courier',
                  ),
                ),
              ],
            ),
          ),

        // Attached files
        if (state.voicePath != null || state.imagePaths.isNotEmpty || state.csvPath != null || state.docPaths.isNotEmpty)
          _Card(label: 'ATTACHED FILES', children: [
            if (state.voicePath != null) _Row('Voice', p.basename(state.voicePath!)),
            if (state.imagePaths.isNotEmpty) _Row('Photos', '${state.imagePaths.length} image(s)'),
            if (state.csvPath != null) _Row('CSV', p.basename(state.csvPath!)),
            if (state.docPaths.isNotEmpty) _Row('Docs', state.docPaths.map((d) => d['name']).join(', ')),
          ]),

        const SizedBox(height: 8),

        // Sync note
        Container(
          padding: const EdgeInsets.all(14),
          color: AppTheme.surfaceHi,
          child: const Text(
            'This report will be saved locally. It syncs to the portal automatically when the station\'s network is available.',
            style: TextStyle(fontSize: 11, color: AppTheme.textSec, height: 1.6),
          ),
        ),
        const SizedBox(height: 24),

        // Submit button
        SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            onPressed: () => onSubmit(),
            style: ElevatedButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 18),
            ),
            child: const Text('RECORD DISPATCH'),
          ),
        ),
      ],
    );
  }
}

class _Card extends StatelessWidget {
  final String label;
  final List<Widget> children;
  const _Card({required this.label, required this.children});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(
        border: Border.all(color: AppTheme.border),
        color: AppTheme.surfaceHi,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            color: AppTheme.amber.withOpacity(0.1),
            child: Text(
              label,
              style: const TextStyle(
                fontSize: 9,
                fontWeight: FontWeight.w900,
                letterSpacing: 0.18,
                color: AppTheme.amber,
                fontFamily: 'Courier',
              ),
            ),
          ),
          ...children,
        ],
      ),
    );
  }
}

class _Row extends StatelessWidget {
  final String label;
  final String value;
  const _Row(this.label, this.value);

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: AppTheme.border)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 110,
            child: Text(
              label,
              style: const TextStyle(fontSize: 11, color: AppTheme.textMuted, fontFamily: 'Courier'),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(fontSize: 12, color: AppTheme.textPri, height: 1.4),
            ),
          ),
        ],
      ),
    );
  }
}
