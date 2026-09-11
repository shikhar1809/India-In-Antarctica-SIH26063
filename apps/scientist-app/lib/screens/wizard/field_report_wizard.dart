import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:uuid/uuid.dart';
import '../../services/portal_api.dart';
import '../../app_theme.dart';
import '../../models/dispatch.dart';
import '../../providers/dispatch_provider.dart';
import '../../providers/auth_provider.dart' as app_auth;
import 'steps/activity_step.dart';
import 'steps/position_step.dart';
import 'steps/weather_step.dart';
import 'steps/measurement_step.dart';
import 'steps/observation_step.dart';
import 'steps/data_step.dart';
import 'steps/record_step.dart';

// 6-step field report wizard with GTA SA pause-menu step indicator along the top.
// Each step mutates a shared WizardState and the final step commits to local DB.

class WizardState {
  // Step 1 — Activity
  String station = '';
  DateTime observedAt = DateTime.now().toUtc();
  String activity = '';
  DispatchPriority priority = DispatchPriority.routine;

  // Step 2 — Position
  double? lat;
  double? lon;
  double? elevationM;
  String positionSource = 'GPS handheld';

  // Step 3 — Weather
  WeatherObs weather = const WeatherObs();

  // Step 4 — Observation / biology
  String notes = '';
  String teamMembers = '';
  String sampleIds = '';
  bool safetyFlag = false;

  /// Horizontal accuracy of the GPS fix in metres. The device reports it and
  /// the app used to discard it — but a coordinate without an accuracy is a
  /// coordinate you cannot judge.
  double? positionAccuracyM;

  // Step 6 — Data files
  String? voicePath;
  List<String> imagePaths = [];
  String? csvPath;
  List<Map<String, String>> docPaths = [];
  Map<String, String> measurements = {};

  // Step 6 — Review (read-only)
}

class FieldReportWizard extends StatefulWidget {
  const FieldReportWizard({super.key});

  @override
  State<FieldReportWizard> createState() => _FieldReportWizardState();
}

class _FieldReportWizardState extends State<FieldReportWizard> {
  int _step = 0;
  final _state = WizardState();

  static const _steps = [
    'Activity',
    'Position',
    'Weather',
    'Readings',
    'Observation',
    'Data',
    'Record',
  ];

  /// A dispatch with no station and no activity used to submit happily and
  /// arrive at the portal as an unattributable blank. The first step is the
  /// only one with genuinely required answers — everything after it can
  /// legitimately be left empty by a field party in a hurry.
  void _advance() {
    if (_step == 0) {
      final missing = <String>[
        if (_state.station.isEmpty) 'a station',
        if (_state.activity.isEmpty) 'an activity',
      ];
      if (missing.isNotEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Choose ${missing.join(' and ')} before continuing.'),
            backgroundColor: AppTheme.danger,
          ),
        );
        return;
      }
    }
    setState(() => _step++);
  }

  Widget _buildStep() {
    return switch (_step) {
      0 => ActivityStep(state: _state, onChanged: _refresh),
      1 => PositionStep(state: _state, onChanged: _refresh),
      2 => WeatherStep(state: _state, onChanged: _refresh),
      3 => MeasurementStep(state: _state, onChanged: _refresh),
      4 => ObservationStep(state: _state, onChanged: _refresh),
      5 => DataStep(state: _state, onChanged: _refresh),
      _ => RecordStep(state: _state, onSubmit: _submit),
    };
  }

  void _refresh() => setState(() {});

  Future<void> _submit() async {
    // The report carries the scientist's own name, from their profile. The
    // uid is provisional: the sync service stamps whoever is signed in when
    // the report is actually sent.
    final profile = context.read<app_auth.AuthProvider>().profile;
    final now = DateTime.now().toUtc();
    final dispatch = Dispatch(
      id: const Uuid().v4(),
      authorUid: PortalApi.instance.cachedUid ?? profile?.uid ?? 'pending',
      authorName: profile?.name ?? 'Field scientist',
      observedAt: _state.observedAt,
      station: _state.station,
      lat: _state.lat,
      lon: _state.lon,
      elevationM: _state.elevationM,
      positionSource: _state.positionSource,
      activity: _state.activity,
      priority: _state.priority,
      weather: _state.weather,
      measurements: _state.measurements,
      notes: _state.notes,
      teamMembers: _state.teamMembers,
      sampleIds: _state.sampleIds,
      safetyFlag: _state.safetyFlag,
      voicePath: _state.voicePath,
      imagePaths: _state.imagePaths,
      csvPath: _state.csvPath,
      docPaths: _state.docPaths,
      status: DispatchStatus.drafted,
      synced: false,
      createdAt: now,
      updatedAt: now,
    );

    await context.read<DispatchProvider>().add(dispatch);

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('DISPATCH SAVED — WILL SYNC WHEN ONLINE'),
          backgroundColor: AppTheme.surface,
        ),
      );
      // Reset wizard
      setState(() {
        _step = 0;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    // Seven labels do not fit across a phone: there, the bar shows only its
    // segments, with the current step named underneath.
    final compact = MediaQuery.sizeOf(context).width < 760;
    return Column(
      children: [
        // ── Step indicator bar — GTA health bar style ──────────────────
        Container(
          color: AppTheme.surface,
          padding: EdgeInsets.symmetric(horizontal: compact ? 16 : 24, vertical: 14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Row(
            children: List.generate(_steps.length, (i) {
              final done = i < _step;
              final active = i == _step;
              return Expanded(
                child: GestureDetector(
                  onTap: i < _step ? () => setState(() => _step = i) : null,
                  child: Container(
                    margin: EdgeInsets.only(right: i < _steps.length - 1 ? 4 : 0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // Bar segment
                        Container(
                          height: 4,
                          decoration: BoxDecoration(
                            color: done
                              ? AppTheme.synced
                              : active
                                ? AppTheme.amber
                                : AppTheme.border,
                          ),
                        ),
                        if (!compact) const SizedBox(height: 5),
                        if (!compact) Text(
                          _steps[i].toUpperCase(),
                          style: TextStyle(
                            fontSize: 8,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 0.1,
                            color: done
                              ? AppTheme.synced
                              : active
                                ? AppTheme.amber
                                : AppTheme.textMuted,
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
          if (compact) ...[
            const SizedBox(height: 8),
            Text(
              'STEP ${_step + 1} OF ${_steps.length} · ${_steps[_step].toUpperCase()}',
              style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 0.1, color: AppTheme.amber, fontFamily: 'Courier'),
            ),
          ],
          ]),
        ),

        Container(height: 1, color: AppTheme.border),

        // ── Step content ───────────────────────────────────────────────
        Expanded(
          child: SingleChildScrollView(
            padding: EdgeInsets.all(compact ? 16 : 28),
            child: _buildStep(),
          ),
        ),

        // ── Nav buttons ────────────────────────────────────────────────
        if (_step < _steps.length - 1)
          Container(
            decoration: const BoxDecoration(
              color: AppTheme.surface,
              border: Border(top: BorderSide(color: AppTheme.border)),
            ),
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                if (_step > 0)
                  OutlinedButton(
                    onPressed: () => setState(() => _step--),
                    child: const Text('BACK'),
                  )
                else
                  const SizedBox.shrink(),

                ElevatedButton(
                  onPressed: _advance,
                  child: Text(_step == _steps.length - 2 ? 'REVIEW' : 'NEXT'),
                ),
              ],
            ),
          ),
      ],
    );
  }
}
