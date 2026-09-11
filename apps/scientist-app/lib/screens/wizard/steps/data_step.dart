import 'package:flutter/material.dart';
import 'package:file_picker/file_picker.dart';
import 'package:path/path.dart' as p;
import '../../../app_theme.dart';
import '../field_report_wizard.dart';
import '../wizard_common.dart';
import '../../../services/sync_service.dart';

class DataStep extends StatefulWidget {
  final WizardState state;
  final VoidCallback onChanged;
  const DataStep({super.key, required this.state, required this.onChanged});

  @override
  State<DataStep> createState() => _DataStepState();
}

class _DataStepState extends State<DataStep> {
  Future<void> _pickPhotos() async {
    final result = await FilePicker.platform.pickFiles(
      allowMultiple: true,
      type: FileType.custom,
      allowedExtensions: ['jpg', 'jpeg', 'png', 'tif', 'tiff'],
    );
    if (result == null) return;
    final paths = result.files.where((f) => f.path != null).map((f) => f.path!).toList();
    // The portal accepts at most five photographs per report; a sixth would
    // get the whole report refused on every sync.
    final room = SyncService.maxPhotos - widget.state.imagePaths.length;
    final added = paths.take(room < 0 ? 0 : room).toList();
    setState(() => widget.state.imagePaths.addAll(added));
    widget.onChanged();
    if (added.length < paths.length && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('UP TO ${SyncService.maxPhotos} PHOTOS PER REPORT — ${paths.length - added.length} NOT ADDED'),
        backgroundColor: AppTheme.surface,
      ));
    }
  }

  Future<void> _pickCsv() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['csv'],
    );
    if (result == null || result.files.single.path == null) return;
    setState(() => widget.state.csvPath = result.files.single.path!);
    widget.onChanged();
  }

  Future<void> _pickDocs() async {
    final result = await FilePicker.platform.pickFiles(
      allowMultiple: true,
      type: FileType.custom,
      allowedExtensions: ['pdf', 'txt', 'docx', 'xlsx', 'zip'],
    );
    if (result == null) return;
    final docs = result.files
        .where((f) => f.path != null)
        .map((f) => {'name': f.name, 'path': f.path!})
        .toList();
    setState(() => widget.state.docPaths.addAll(docs));
    widget.onChanged();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const GtaSectionHead('Step 6 — Data & Media'),
        const SizedBox(height: 24),

        const WizLabel('PHOTOGRAPHS'),
        _ActionButton(
          label: 'ADD PHOTOS',
          icon: Icons.add_a_photo_outlined,
          onTap: _pickPhotos,
        ),
        if (widget.state.imagePaths.isNotEmpty) ...[
          const SizedBox(height: 8),
          ...widget.state.imagePaths.map((path) => _FileRow(
            name: p.basename(path),
            onRemove: () {
              setState(() => widget.state.imagePaths.remove(path));
              widget.onChanged();
            },
          )),
        ],
        const SizedBox(height: 20),

        const WizLabel('CSV MEASUREMENT FILE'),
        _ActionButton(
          label: 'ATTACH CSV',
          icon: Icons.table_chart_outlined,
          onTap: _pickCsv,
        ),
        if (widget.state.csvPath != null) ...[
          const SizedBox(height: 8),
          _FileRow(
            name: p.basename(widget.state.csvPath!),
            onRemove: () {
              setState(() => widget.state.csvPath = null);
              widget.onChanged();
            },
          ),
        ],
        const SizedBox(height: 20),

        const WizLabel('SUPPORTING DOCUMENTS (PDF, TXT, DOCX…)'),
        _ActionButton(
          label: 'ATTACH DOCUMENTS',
          icon: Icons.attach_file,
          onTap: _pickDocs,
        ),
        if (widget.state.docPaths.isNotEmpty) ...[
          const SizedBox(height: 8),
          ...widget.state.docPaths.map((doc) => _FileRow(
            name: doc['name']!,
            onRemove: () {
              setState(() => widget.state.docPaths.remove(doc));
              widget.onChanged();
            },
          )),
        ],
      ],
    );
  }
}

class _ActionButton extends StatelessWidget {
  final String label;
  final IconData icon;
  final VoidCallback onTap;
  const _ActionButton({required this.label, required this.icon, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          border: Border.all(color: AppTheme.amber.withOpacity(0.6)),
          color: AppTheme.amber.withOpacity(0.07),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: AppTheme.amber, size: 16),
            const SizedBox(width: 10),
            Text(
              label,
              style: const TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w900,
                letterSpacing: 0.1,
                color: AppTheme.amber,
                fontFamily: 'Courier',
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _FileRow extends StatelessWidget {
  final String name;
  final VoidCallback onRemove;
  const _FileRow({required this.name, required this.onRemove});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 4),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      color: AppTheme.surfaceHi,
      child: Row(
        children: [
          Expanded(
            child: Text(
              name,
              style: const TextStyle(fontSize: 11, color: AppTheme.textSec, fontFamily: 'Courier'),
              overflow: TextOverflow.ellipsis,
            ),
          ),
          GestureDetector(
            onTap: onRemove,
            child: const Icon(Icons.close, size: 14, color: AppTheme.textMuted),
          ),
        ],
      ),
    );
  }
}
