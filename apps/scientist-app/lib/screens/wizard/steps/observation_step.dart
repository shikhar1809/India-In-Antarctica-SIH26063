import 'package:flutter/material.dart';
import '../../../app_theme.dart';
import '../field_report_wizard.dart';
import '../wizard_common.dart';

class ObservationStep extends StatefulWidget {
  final WizardState state;
  final VoidCallback onChanged;
  const ObservationStep({super.key, required this.state, required this.onChanged});

  @override
  State<ObservationStep> createState() => _ObservationStepState();
}

class _ObservationStepState extends State<ObservationStep> {
  late final TextEditingController _notes   = TextEditingController(text: widget.state.notes);
  late final TextEditingController _team    = TextEditingController(text: widget.state.teamMembers);
  late final TextEditingController _samples = TextEditingController(text: widget.state.sampleIds);

  @override
  void dispose() {
    _notes.dispose();
    _team.dispose();
    _samples.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const GtaSectionHead('Step 5 — Observation'),
        const SizedBox(height: 24),

        const WizLabel('FIELD NOTES'),
        TextFormField(
          controller: _notes,
          maxLines: 5,
          maxLength: 2000,
          buildCounter: (_, {required currentLength, required isFocused, required maxLength}) {
            final left = maxLength! - currentLength;
            return Text(
              '$left left',
              style: TextStyle(
                fontSize: 9,
                color: left < 100 ? AppTheme.danger : left < 300 ? AppTheme.amber : AppTheme.textMuted,
                fontFamily: 'Courier',
              ),
            );
          },
          decoration: const InputDecoration(
            hintText: 'Describe what you observed — specimen behaviours, environmental cues, anomalies...',
          ),
          style: const TextStyle(fontFamily: 'Courier', fontSize: 13, color: AppTheme.textPri, height: 1.55),
          onChanged: (v) { widget.state.notes = v; widget.onChanged(); },
        ),
        const SizedBox(height: 20),

        const WizLabel('FIELD PARTY (comma-separated)'),
        TextFormField(
          controller: _team,
          decoration: const InputDecoration(hintText: 'Dr. A. Smith, J. Martinez, K. Osei'),
          style: const TextStyle(fontFamily: 'Courier', fontSize: 13, color: AppTheme.textPri),
          onChanged: (v) { widget.state.teamMembers = v; widget.onChanged(); },
        ),
        const SizedBox(height: 16),

        const WizLabel('SAMPLE / SPECIMEN IDs (comma-separated)'),
        TextFormField(
          controller: _samples,
          decoration: const InputDecoration(hintText: 'IIA-2026-001, IIA-2026-002'),
          style: const TextStyle(fontFamily: 'Courier', fontSize: 13, color: AppTheme.textPri),
          onChanged: (v) { widget.state.sampleIds = v; widget.onChanged(); },
        ),
        const SizedBox(height: 24),

        GestureDetector(
          onTap: () {
            setState(() => widget.state.safetyFlag = !widget.state.safetyFlag);
            widget.onChanged();
          },
          child: Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: widget.state.safetyFlag ? AppTheme.danger.withOpacity(0.1) : AppTheme.surfaceHi,
              border: Border.all(
                color: widget.state.safetyFlag ? AppTheme.danger : AppTheme.border,
                width: widget.state.safetyFlag ? 1.5 : 1,
              ),
            ),
            child: Row(
              children: [
                Icon(
                  Icons.warning_rounded,
                  color: widget.state.safetyFlag ? AppTheme.danger : AppTheme.textMuted,
                  size: 20,
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        widget.state.safetyFlag ? 'FLAGGED FOR STATION LEADER' : 'FLAG FOR STATION LEADER',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 0.1,
                          color: widget.state.safetyFlag ? AppTheme.danger : AppTheme.textPri,
                          fontFamily: 'Courier',
                        ),
                      ),
                      const SizedBox(height: 2),
                      const Text(
                        'Use when the observation involves a safety concern or requires immediate attention.',
                        style: TextStyle(fontSize: 11, color: AppTheme.textSec, height: 1.5),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 14),
                Container(
                  width: 22, height: 22,
                  decoration: BoxDecoration(
                    color: widget.state.safetyFlag ? AppTheme.danger : Colors.transparent,
                    border: Border.all(
                      color: widget.state.safetyFlag ? AppTheme.danger : AppTheme.border,
                    ),
                  ),
                  child: widget.state.safetyFlag
                    ? const Icon(Icons.check, color: Colors.white, size: 14)
                    : null,
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
