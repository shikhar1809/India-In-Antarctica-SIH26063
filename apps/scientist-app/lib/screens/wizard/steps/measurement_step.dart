import 'package:flutter/material.dart';
import '../../../app_theme.dart';
import '../../../models/field_vocabulary.dart';
import '../field_report_wizard.dart';
import '../wizard_common.dart';

/// The step that was missing.
///
/// Every other part of the system already knew about per-activity scientific
/// fields — the portal defines them, the public site charts them, the data
/// model carries them — but nothing ever collected them. `measurements` was
/// declared in WizardState and passed to Dispatch permanently empty, so an
/// ice survey and a penguin count arrived at the portal indistinguishable
/// apart from their free-text notes.
///
/// This asks the right questions for whichever activity was chosen, and
/// stores each answer with its unit attached.
class MeasurementStep extends StatefulWidget {
  final WizardState state;
  final VoidCallback onChanged;
  const MeasurementStep({super.key, required this.state, required this.onChanged});

  @override
  State<MeasurementStep> createState() => _MeasurementStepState();
}

class _MeasurementStepState extends State<MeasurementStep> {
  final Map<String, TextEditingController> _controllers = {};

  List<MeasurementField> get _fields =>
      kMeasurementSchema[widget.state.activity] ?? const <MeasurementField>[];

  TextEditingController _controllerFor(MeasurementField f) {
    return _controllers.putIfAbsent(
      f.id,
      () => TextEditingController(text: widget.state.measurements[f.id] ?? ''),
    );
  }

  @override
  void dispose() {
    for (final c in _controllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  void _set(String id, String value) {
    if (value.trim().isEmpty) {
      widget.state.measurements.remove(id);
    } else {
      widget.state.measurements[id] = value.trim();
    }
    widget.onChanged();
  }

  @override
  Widget build(BuildContext context) {
    final fields = _fields;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const GtaSectionHead('Step 4 — Measurements'),
        const SizedBox(height: 8),
        Text(
          widget.state.activity.isEmpty
              ? 'Pick an activity in step 1 and the right measurement fields will appear here.'
              : 'Readings for ${widget.state.activity.toLowerCase()}. Leave anything you did not measure blank.',
          style: const TextStyle(
            fontSize: 11,
            color: AppTheme.textMuted,
            fontFamily: 'Courier',
            height: 1.5,
          ),
        ),
        const SizedBox(height: 20),

        if (fields.isEmpty)
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              border: Border.all(color: AppTheme.border),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(
              widget.state.activity.isEmpty
                  ? 'No activity selected yet.'
                  : 'No structured readings for this activity — describe it in the field notes instead.',
              style: const TextStyle(fontSize: 11, color: AppTheme.textMuted, fontFamily: 'Courier'),
            ),
          )
        else
          ...fields.map(_buildField),
      ],
    );
  }

  Widget _buildField(MeasurementField f) {
    final label = f.unit == null
        ? f.label.toUpperCase()
        : '${f.label.toUpperCase()} (${f.unit})';

    return Padding(
      padding: const EdgeInsets.only(bottom: 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          WizLabel(label),
          switch (f.kind) {
            FieldKind.select => DropdownButtonFormField<String>(
                value: (widget.state.measurements[f.id]?.isNotEmpty ?? false)
                    ? widget.state.measurements[f.id]
                    : null,
                decoration: InputDecoration(hintText: f.hint ?? 'Select'),
                dropdownColor: AppTheme.surfaceHi,
                style: const TextStyle(color: AppTheme.textPri, fontFamily: 'Courier', fontSize: 13),
                items: (f.options ?? const [])
                    .map((o) => DropdownMenuItem(value: o, child: Text(o)))
                    .toList(),
                onChanged: (v) => setState(() => _set(f.id, v ?? '')),
              ),
            FieldKind.number => TextFormField(
                controller: _controllerFor(f),
                keyboardType: const TextInputType.numberWithOptions(signed: true, decimal: true),
                decoration: InputDecoration(hintText: f.hint ?? '0'),
                style: const TextStyle(fontFamily: 'Courier', fontSize: 13, color: AppTheme.textPri),
                validator: (v) {
                  final text = v?.trim() ?? '';
                  if (text.isEmpty) return null;
                  return double.tryParse(text) == null ? 'Enter a number' : null;
                },
                onChanged: (v) => _set(f.id, v),
              ),
            FieldKind.text => TextFormField(
                controller: _controllerFor(f),
                decoration: InputDecoration(hintText: f.hint ?? ''),
                style: const TextStyle(fontFamily: 'Courier', fontSize: 13, color: AppTheme.textPri),
                onChanged: (v) => _set(f.id, v),
              ),
          },
        ],
      ),
    );
  }
}
