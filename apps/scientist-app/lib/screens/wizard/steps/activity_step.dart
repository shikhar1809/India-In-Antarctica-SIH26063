import 'package:flutter/material.dart';
import '../../../app_theme.dart';
import '../field_report_wizard.dart';
import '../wizard_common.dart';
import '../../../models/dispatch.dart';
import '../../../models/field_vocabulary.dart';

// Stations and activities come from the shared vocabulary now. This file used
// to hardcode Casey/Davis/Mawson — Australian stations, in an app for India's
// Antarctic programme — and a twelve-item activity list the portal had no
// mapping for. See lib/models/field_vocabulary.dart.
const _stations = kStations;
const _activities = kActivities;

class ActivityStep extends StatelessWidget {
  final WizardState state;
  final VoidCallback onChanged;
  const ActivityStep({super.key, required this.state, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const GtaSectionHead('Step 1 — Activity'),
        const SizedBox(height: 24),

        const WizLabel('STATION'),
        DropdownButtonFormField<String>(
          value: state.station.isEmpty ? null : state.station,
          decoration: const InputDecoration(hintText: 'Select station'),
          dropdownColor: AppTheme.surfaceHi,
          style: const TextStyle(color: AppTheme.textPri, fontFamily: 'Courier', fontSize: 13),
          items: _stations.map((s) => DropdownMenuItem(value: s, child: Text(s))).toList(),
          onChanged: (v) { if (v != null) { state.station = v; onChanged(); } },
        ),
        const SizedBox(height: 16),

        const WizLabel('OBSERVATION DATE/TIME (UTC)'),
        InkWell(
          onTap: () async {
            final d = await showDatePicker(
              context: context,
              initialDate: state.observedAt,
              firstDate: DateTime(2020),
              lastDate: DateTime.now().add(const Duration(days: 1)),
              builder: (ctx, child) => Theme(
                data: Theme.of(ctx).copyWith(
                  colorScheme: const ColorScheme.dark(primary: AppTheme.amber),
                ),
                child: child!,
              ),
            );
            if (d == null) return;
            final t = await showTimePicker(
              // ignore: use_build_context_synchronously
              context: context,
              initialTime: TimeOfDay.fromDateTime(state.observedAt),
              builder: (ctx, child) => Theme(
                data: Theme.of(ctx).copyWith(
                  colorScheme: const ColorScheme.dark(primary: AppTheme.amber),
                ),
                child: child!,
              ),
            );
            if (t == null) return;
            state.observedAt = DateTime.utc(d.year, d.month, d.day, t.hour, t.minute);
            onChanged();
          },
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
            decoration: BoxDecoration(
              color: AppTheme.surfaceHi,
              border: Border.all(color: AppTheme.border),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    state.observedAt.toIso8601String().substring(0, 16).replaceAll('T', '  ') + ' UTC',
                    style: const TextStyle(color: AppTheme.textPri, fontFamily: 'Courier', fontSize: 13),
                  ),
                ),
                const Icon(Icons.schedule, color: AppTheme.textSec, size: 16),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),

        const WizLabel('ACTIVITY TYPE'),
        DropdownButtonFormField<String>(
          value: state.activity.isEmpty ? null : state.activity,
          decoration: const InputDecoration(hintText: 'Select activity'),
          dropdownColor: AppTheme.surfaceHi,
          style: const TextStyle(color: AppTheme.textPri, fontFamily: 'Courier', fontSize: 13),
          items: _activities.map((a) => DropdownMenuItem(value: a, child: Text(a))).toList(),
          onChanged: (v) { if (v != null) { state.activity = v; onChanged(); } },
        ),
        const SizedBox(height: 16),

        const WizLabel('PRIORITY'),
        Row(
          children: DispatchPriority.values.map((p) {
            final selected = state.priority == p;
            final color = switch (p) {
              DispatchPriority.urgent  => AppTheme.danger,
              DispatchPriority.notable => AppTheme.amber,
              DispatchPriority.routine => AppTheme.textSec,
            };
            return Expanded(
              child: GestureDetector(
                onTap: () { state.priority = p; onChanged(); },
                child: Container(
                  margin: const EdgeInsets.only(right: 8),
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  decoration: BoxDecoration(
                    color: selected ? color.withOpacity(0.15) : AppTheme.surfaceHi,
                    border: Border.all(color: selected ? color : AppTheme.border),
                  ),
                  child: Center(
                    child: Text(
                      p.name.toUpperCase(),
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 0.1,
                        color: selected ? color : AppTheme.textMuted,
                        fontFamily: 'Courier',
                      ),
                    ),
                  ),
                ),
              ),
            );
          }).toList(),
        ),
      ],
    );
  }
}
