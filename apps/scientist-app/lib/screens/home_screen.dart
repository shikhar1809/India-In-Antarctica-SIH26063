import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../app_theme.dart';
import '../providers/dispatch_provider.dart';
import '../providers/auth_provider.dart';
import '../models/dispatch.dart';
import 'wizard/field_report_wizard.dart';

// GTA San Andreas pause menu aesthetic:
// Left sidebar = the "PAUSE" menu list.
// Right panel = content / selected item detail.

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  _Tab _tab = _Tab.reports;
  bool _online = false;

  @override
  void initState() {
    super.initState();
    _checkConnectivity();
    Connectivity().onConnectivityChanged.listen((results) {
      setState(() => _online = results.any((r) => r != ConnectivityResult.none));
    });
    context.read<DispatchProvider>().load();
  }

  Future<void> _checkConnectivity() async {
    final results = await Connectivity().checkConnectivity();
    setState(() => _online = results.any((r) => r != ConnectivityResult.none));
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final gloveMode = auth.profile?.gloveMode ?? false;
    final dispatches = context.watch<DispatchProvider>();
    final pending = dispatches.items.where((d) => !d.synced).length;

    return Scaffold(
      body: Row(
        children: [
          // ── Left sidebar — GTA pause menu ─────────────────────────────
          Container(
            width: 240,
            color: AppTheme.surface,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Header block
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.fromLTRB(20, 32, 20, 20),
                  decoration: const BoxDecoration(
                    border: Border(bottom: BorderSide(color: AppTheme.border)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'IIA FIELD APP',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 0.18,
                          color: AppTheme.amber,
                          fontFamily: 'Courier',
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        auth.profile?.name ?? 'Scientist',
                        style: const TextStyle(fontSize: 13, color: AppTheme.textPri, fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Container(
                            width: 7, height: 7,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: _online ? AppTheme.synced : AppTheme.danger,
                            ),
                          ),
                          const SizedBox(width: 7),
                          Text(
                            _online ? 'ONLINE' : 'OFFLINE',
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.1,
                              color: _online ? AppTheme.synced : AppTheme.danger,
                            ),
                          ),
                          if (!_online && pending > 0) ...[
                            const SizedBox(width: 8),
                            Text(
                              '$pending queued',
                              style: const TextStyle(fontSize: 10, color: AppTheme.textMuted),
                            ),
                          ],
                        ],
                      ),
                    ],
                  ),
                ),

                // Glove mode
                InkWell(
                  onTap: () => auth.updateAppearance(gloveMode: !gloveMode),
                  child: Container(
                    width: double.infinity,
                    padding: EdgeInsets.symmetric(horizontal: 20, vertical: gloveMode ? 18 : 12),
                    decoration: const BoxDecoration(
                      border: Border(bottom: BorderSide(color: AppTheme.border)),
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'GLOVE MODE',
                                style: TextStyle(
                                  fontSize: gloveMode ? 13 : 11,
                                  fontWeight: FontWeight.w900,
                                  letterSpacing: 0.12,
                                  color: gloveMode ? AppTheme.amber : AppTheme.textPri,
                                  fontFamily: 'Courier',
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text('Bigger buttons for mitts', style: TextStyle(fontSize: gloveMode ? 12 : 10, color: AppTheme.textSec)),
                            ],
                          ),
                        ),
                        Switch(
                          value: gloveMode,
                          activeThumbColor: AppTheme.amber,
                          onChanged: (v) => auth.updateAppearance(gloveMode: v),
                        ),
                      ],
                    ),
                  ),
                ),

                const SizedBox(height: 8),

                // Menu items
                GtaMenuItem(
                  label: 'Field Reports',
                  sub: '${dispatches.items.length} total',
                  selected: _tab == _Tab.reports,
                  onTap: () => setState(() => _tab = _Tab.reports),
                  trailing: pending > 0
                    ? _Badge('$pending', AppTheme.pending)
                    : null,
                ),
                GtaMenuItem(
                  label: 'New Report',
                  sub: 'Log an observation',
                  selected: _tab == _Tab.newReport,
                  onTap: () => setState(() => _tab = _Tab.newReport),
                ),
                GtaMenuItem(
                  label: 'Student Q&A',
                  sub: 'Answer incoming questions',
                  selected: _tab == _Tab.comms,
                  onTap: () => setState(() => _tab = _Tab.comms),
                ),

                const Spacer(),

                GtaMenuItem(
                  label: 'Lock App',
                  onTap: () => auth.lock(),
                ),
                const SizedBox(height: 16),
              ],
            ),
          ),

          Container(width: 1, color: AppTheme.border),

          // ── Right content panel ────────────────────────────────────────
          Expanded(
            child: switch (_tab) {
              _Tab.reports   => _ReportsPanel(dispatches: dispatches),
              _Tab.newReport => const FieldReportWizard(),
              _Tab.comms     => const _CommsPanel(),
            },
          ),
        ],
      ),
    );
  }
}

enum _Tab { reports, newReport, comms }

class _Badge extends StatelessWidget {
  final String label;
  final Color color;
  const _Badge(this.label, this.color);

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withOpacity(0.18),
        border: Border.all(color: color.withOpacity(0.5)),
      ),
      child: Text(
        label,
        style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900, color: color, fontFamily: 'Courier'),
      ),
    );
  }
}

// ── Reports list panel ────────────────────────────────────────────────────
class _ReportsPanel extends StatefulWidget {
  final DispatchProvider dispatches;
  const _ReportsPanel({required this.dispatches});

  @override
  State<_ReportsPanel> createState() => _ReportsPanelState();
}

class _ReportsPanelState extends State<_ReportsPanel> {
  Dispatch? _selected;

  @override
  Widget build(BuildContext context) {
    final items = widget.dispatches.items;

    return Row(
      children: [
        SizedBox(
          width: 340,
          child: Column(
            children: [
              const GtaSectionHead('Your dispatches'),
              Expanded(
                child: items.isEmpty
                  ? const Center(
                      child: Text(
                        'NO REPORTS YET.\nLOG YOUR FIRST OBSERVATION.',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 11,
                          color: AppTheme.textMuted,
                          letterSpacing: 0.06,
                          height: 1.8,
                        ),
                      ),
                    )
                  : ListView.builder(
                      itemCount: items.length,
                      itemBuilder: (ctx, i) {
                        final d = items[i];
                        return GtaMenuItem(
                          label: d.activity,
                          sub: '${d.station} · ${_fmtDate(d.observedAt)}',
                          selected: _selected?.id == d.id,
                          onTap: () => setState(() => _selected = d),
                          trailing: _SyncDot(synced: d.synced),
                        );
                      },
                    ),
              ),
            ],
          ),
        ),

        Container(width: 1, color: AppTheme.border),

        Expanded(
          child: _selected == null
            ? const Center(
                child: Text(
                  'SELECT A REPORT',
                  style: TextStyle(
                    fontSize: 11,
                    color: AppTheme.textMuted,
                    letterSpacing: 0.1,
                  ),
                ),
              )
            : _DispatchDetail(d: _selected!),
        ),
      ],
    );
  }

  String _fmtDate(DateTime dt) {
    return '${dt.year}-${dt.month.toString().padLeft(2, '0')}-${dt.day.toString().padLeft(2, '0')}';
  }
}

class _SyncDot extends StatelessWidget {
  final bool synced;
  const _SyncDot({required this.synced});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 7, height: 7,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: synced ? AppTheme.synced : AppTheme.pending,
      ),
    );
  }
}

// ── Dispatch detail ───────────────────────────────────────────────────────
class _DispatchDetail extends StatelessWidget {
  final Dispatch d;
  const _DispatchDetail({required this.d});

  @override
  Widget build(BuildContext context) {
    final met = d.weather.toRadioLine();
    return SingleChildScrollView(
      padding: const EdgeInsets.all(28),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  d.activity.toUpperCase(),
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w900,
                    color: AppTheme.amber,
                    letterSpacing: 0.05,
                  ),
                ),
              ),
              _PriorityChip(d.priority),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            '${d.station}  ·  ${d.observedAt.toIso8601String().substring(0, 16).replaceAll('T', ' ')} UTC',
            style: const TextStyle(fontSize: 11, color: AppTheme.textSec, fontFamily: 'Courier'),
          ),
          if (d.lat != null && d.lon != null) ...[
            const SizedBox(height: 2),
            Text(
              '${d.lat!.abs().toStringAsFixed(4)}°${d.lat! < 0 ? 'S' : 'N'}  ${d.lon!.abs().toStringAsFixed(4)}°${d.lon! < 0 ? 'W' : 'E'}',
              style: const TextStyle(fontSize: 11, color: AppTheme.textSec, fontFamily: 'Courier'),
            ),
          ],

          if (d.safetyFlag) ...[
            const SizedBox(height: 16),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              color: AppTheme.danger.withOpacity(0.1),
              child: const Text(
                '⚠  FLAGGED FOR STATION LEADER',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w900,
                  color: AppTheme.danger,
                  letterSpacing: 0.1,
                ),
              ),
            ),
          ],

          const SizedBox(height: 24),
          _DetailRow('CONDITIONS', met),
          if (d.notes.isNotEmpty) _DetailRow('FIELD NOTES', d.notes),
          if (d.teamMembers.isNotEmpty) _DetailRow('FIELD PARTY', d.teamMembers),
          if (d.sampleIds.isNotEmpty) _DetailRow('SAMPLES', d.sampleIds),

          const SizedBox(height: 16),
          Row(
            children: [
              _SyncDot(synced: d.synced),
              const SizedBox(width: 8),
              Text(
                d.synced ? 'SYNCED TO PORTAL' : 'QUEUED — WILL SYNC WHEN ONLINE',
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.08,
                  color: d.synced ? AppTheme.synced : AppTheme.pending,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  final String label;
  final String value;
  const _DetailRow(this.label, this.value);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w900, letterSpacing: 0.14, color: AppTheme.amber)),
          const SizedBox(height: 5),
          Text(value, style: const TextStyle(fontSize: 13, color: AppTheme.textPri, height: 1.55)),
        ],
      ),
    );
  }
}

// ── Student Q&A — Comms panel ─────────────────────────────────────────────
class _CommsPanel extends StatefulWidget {
  const _CommsPanel();

  @override
  State<_CommsPanel> createState() => _CommsPanelState();
}

class _CommsPanelState extends State<_CommsPanel> {
  Map<String, dynamic>? _selected;
  String? _selectedId;
  final _answerCtrl = TextEditingController();
  bool _submitting = false;
  String? _successMsg;

  @override
  void dispose() {
    _answerCtrl.dispose();
    super.dispose();
  }

  Future<void> _transmit(String docId) async {
    final answer = _answerCtrl.text.trim();
    if (answer.isEmpty) return;
    setState(() { _submitting = true; _successMsg = null; });
    try {
      await FirebaseFirestore.instance
          .collection('student_questions')
          .doc(docId)
          .update({
        'status': 'PENDING_ANSWER',
        'answer': answer,
        'answeredAt': FieldValue.serverTimestamp(),
        'answeredByStation': 'Maitri Station',
      });
      setState(() {
        _successMsg = 'Transmitted! Answer is under admin review.';
        _selected = null;
        _selectedId = null;
        _answerCtrl.clear();
      });
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Transmission failed: $e'), backgroundColor: AppTheme.danger),
      );
    } finally {
      setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        // ── Question list ─────────────────────────────────────────────
        SizedBox(
          width: 340,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const GtaSectionHead('Incoming Transmissions'),
              if (_successMsg != null)
                Container(
                  margin: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                  padding: const EdgeInsets.all(12),
                  color: AppTheme.synced.withOpacity(0.12),
                  child: Text(
                    _successMsg!,
                    style: const TextStyle(fontSize: 11, color: AppTheme.synced, fontFamily: 'Courier'),
                  ),
                ),
              Expanded(
                child: StreamBuilder<QuerySnapshot>(
                  stream: FirebaseFirestore.instance
                      .collection('student_questions')
                      .where('status', isEqualTo: 'READY_FOR_SCIENTIST')
                      .orderBy('questionApprovedAt', descending: false)
                      .snapshots(),
                  builder: (ctx, snap) {
                    if (snap.connectionState == ConnectionState.waiting) {
                      return const Center(child: CircularProgressIndicator(color: AppTheme.amber));
                    }
                    final docs = snap.data?.docs ?? [];
                    if (docs.isEmpty) {
                      return const Center(
                        child: Text(
                          'NO INCOMING QUESTIONS.\nCHECK BACK LATER.',
                          textAlign: TextAlign.center,
                          style: TextStyle(fontSize: 11, color: AppTheme.textMuted, letterSpacing: 0.06, height: 1.8),
                        ),
                      );
                    }
                    return ListView.builder(
                      itemCount: docs.length,
                      itemBuilder: (ctx, i) {
                        final doc = docs[i];
                        final data = doc.data() as Map<String, dynamic>;
                        final isSelected = _selectedId == doc.id;
                        return GtaMenuItem(
                          label: data['firstName'] ?? 'Student',
                          sub: 'Grade ${data['grade'] ?? '?'} · Tap to answer',
                          selected: isSelected,
                          onTap: () => setState(() {
                            _selected = data;
                            _selectedId = doc.id;
                            _answerCtrl.clear();
                            _successMsg = null;
                          }),
                        );
                      },
                    );
                  },
                ),
              ),
            ],
          ),
        ),

        Container(width: 1, color: AppTheme.border),

        // ── Answer panel ──────────────────────────────────────────────
        Expanded(
          child: _selected == null
            ? const Center(
                child: Text(
                  'SELECT A QUESTION\nTO ANSWER',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 11, color: AppTheme.textMuted, letterSpacing: 0.1, height: 1.8),
                ),
              )
            : SingleChildScrollView(
                padding: const EdgeInsets.all(28),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'FROM: ${(_selected!['firstName'] ?? 'Student').toString().toUpperCase()}',
                      style: const TextStyle(fontSize: 11, color: AppTheme.amber, fontWeight: FontWeight.w900, fontFamily: 'Courier', letterSpacing: 0.15),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Grade ${_selected!['grade'] ?? '?'}',
                      style: const TextStyle(fontSize: 11, color: AppTheme.textSec, fontFamily: 'Courier'),
                    ),

                    const SizedBox(height: 20),

                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(20),
                      decoration: const BoxDecoration(
                        color: AppTheme.surface,
                        border: Border(left: BorderSide(color: AppTheme.amber, width: 3)),
                      ),
                      child: Text(
                        '"${_selected!['question'] ?? ''}"',
                        style: const TextStyle(fontSize: 17, color: AppTheme.textPri, height: 1.55),
                      ),
                    ),

                    const SizedBox(height: 28),

                    const Text(
                      'YOUR REPLY',
                      style: TextStyle(fontSize: 9, fontWeight: FontWeight.w900, letterSpacing: 0.14, color: AppTheme.amber),
                    ),
                    const SizedBox(height: 10),

                    TextField(
                      controller: _answerCtrl,
                      maxLines: 8,
                      style: const TextStyle(fontSize: 14, color: AppTheme.textPri),
                      decoration: const InputDecoration(
                        hintText: 'Type your answer from the field...',
                        hintStyle: TextStyle(color: AppTheme.textMuted),
                        filled: true,
                        fillColor: AppTheme.surface,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.zero,
                          borderSide: BorderSide(color: AppTheme.border),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.zero,
                          borderSide: BorderSide(color: AppTheme.border),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.zero,
                          borderSide: BorderSide(color: AppTheme.amber, width: 2),
                        ),
                      ),
                    ),

                    const SizedBox(height: 16),

                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        onPressed: _submitting ? null : () => _transmit(_selectedId!),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppTheme.amber,
                          foregroundColor: Colors.black,
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          shape: const RoundedRectangleBorder(borderRadius: BorderRadius.zero),
                          textStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w900, fontFamily: 'Courier', letterSpacing: 0.1),
                        ),
                        child: _submitting
                            ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.black))
                            : const Text('TRANSMIT REPLY'),
                      ),
                    ),

                    const SizedBox(height: 8),

                    TextButton(
                      onPressed: () => setState(() { _selected = null; _selectedId = null; }),
                      child: const Text('← Back to list', style: TextStyle(color: AppTheme.textSec, fontSize: 12)),
                    ),
                  ],
                ),
              ),
        ),
      ],
    );
  }
}

// ── Priority chip ─────────────────────────────────────────────────────────
class _PriorityChip extends StatelessWidget {
  final DispatchPriority priority;
  const _PriorityChip(this.priority);

  @override
  Widget build(BuildContext context) {
    final color = switch (priority) {
      DispatchPriority.urgent  => AppTheme.danger,
      DispatchPriority.notable => AppTheme.amber,
      DispatchPriority.routine => AppTheme.textMuted,
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        border: Border.all(color: color.withOpacity(0.5)),
        color: color.withOpacity(0.08),
      ),
      child: Text(
        priority.name.toUpperCase(),
        style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 0.1, color: color, fontFamily: 'Courier'),
      ),
    );
  }
}
