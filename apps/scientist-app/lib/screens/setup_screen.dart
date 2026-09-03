import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../app_theme.dart';
import '../providers/auth_provider.dart';

const _stations = [
  'Maitri Station',
  'Bharati Station',
  'Field Camp – Schirmacher',
  'Field Camp – Larsemann',
  'Other',
];

class SetupScreen extends StatefulWidget {
  const SetupScreen({super.key});

  @override
  State<SetupScreen> createState() => _SetupScreenState();
}

class _SetupScreenState extends State<SetupScreen> {
  final _nameCtrl        = TextEditingController();
  final _instituteCtrl   = TextEditingController();
  String _station        = _stations.first;
  final _pinCtrl         = TextEditingController();
  final _confirmCtrl     = TextEditingController();
  bool _saving           = false;
  String? _error;

  // 2-step flow: profile info → PIN
  int _step = 0;

  @override
  void dispose() {
    _nameCtrl.dispose();
    _instituteCtrl.dispose();
    _pinCtrl.dispose();
    _confirmCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() { _saving = true; _error = null; });
    final err = await context.read<AuthProvider>().setupProfile(
      name:        _nameCtrl.text,
      instituteId: _instituteCtrl.text,
      station:     _station,
      pin:         _pinCtrl.text,
      confirmPin:  _confirmCtrl.text,
    );
    if (mounted) {
      setState(() { _saving = false; _error = err; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          CustomPaint(painter: _DotGrid(), size: Size.infinite),
          Center(
            child: SizedBox(
              width: 400,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _header(),
                  _stepIndicator(),
                  _panel(),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _header() => Container(
    width: double.infinity,
    padding: const EdgeInsets.symmetric(vertical: 20),
    color: AppTheme.ground,
    child: Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Image.asset('assets/LOGO.png', width: 90, height: 90),
        const SizedBox(width: 20),
        const Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('INDIA IN', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w900, color: AppTheme.amber, fontFamily: 'Courier')),
            Text('ANTARCTICA', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w900, color: AppTheme.textPri, fontFamily: 'Courier')),
            SizedBox(height: 4),
            Text('FIRST-TIME SETUP', style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700, letterSpacing: 0.3, color: AppTheme.textSec, fontFamily: 'Courier')),
          ],
        ),
      ],
    ),
  );

  Widget _stepIndicator() => Container(
    height: 3,
    child: Row(
      children: [
        Expanded(child: Container(color: AppTheme.amber)),
        Expanded(child: Container(color: _step == 1 ? AppTheme.amber : AppTheme.border)),
      ],
    ),
  );

  Widget _panel() => Container(
    width: double.infinity,
    color: AppTheme.surface,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _divider(_step == 0 ? 'STEP 1 OF 2 · SCIENTIST PROFILE' : 'STEP 2 OF 2 · SET ACCESS PIN'),
        Padding(
          padding: const EdgeInsets.all(24),
          child: _step == 0 ? _profileForm() : _pinForm(),
        ),
        _divider('IIA FIELD APP  ·  v1.0.0'),
      ],
    ),
  );

  Widget _profileForm() => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      const Text('Enter your details. These are stored locally on this device only.', style: TextStyle(fontSize: 12, color: AppTheme.textSec, height: 1.6)),
      const SizedBox(height: 20),
      _label('FULL NAME'),
      TextField(
        controller: _nameCtrl,
        style: const TextStyle(color: AppTheme.textPri, fontFamily: 'Courier', fontSize: 13),
        decoration: const InputDecoration(hintText: 'Dr. Priya Mehta'),
      ),
      const SizedBox(height: 16),
      _label('INSTITUTE ID / EMPLOYEE NO.'),
      TextField(
        controller: _instituteCtrl,
        style: const TextStyle(color: AppTheme.textPri, fontFamily: 'Courier', fontSize: 13),
        decoration: const InputDecoration(hintText: 'NCPOR-2024-001'),
      ),
      const SizedBox(height: 16),
      _label('STATION'),
      DropdownButtonFormField<String>(
        value: _station,
        dropdownColor: AppTheme.surfaceHi,
        style: const TextStyle(color: AppTheme.textPri, fontFamily: 'Courier', fontSize: 13),
        decoration: InputDecoration(
          filled: true,
          fillColor: AppTheme.surfaceHi,
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(4), borderSide: const BorderSide(color: AppTheme.border)),
          enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(4), borderSide: const BorderSide(color: AppTheme.border)),
          contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        ),
        items: _stations.map((s) => DropdownMenuItem(value: s, child: Text(s))).toList(),
        onChanged: (v) => setState(() => _station = v!),
      ),
      const SizedBox(height: 28),
      _nextBtn(),
    ],
  );

  Widget _pinForm() => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      const Text('Set a 4-digit PIN to lock the app. You will enter this every time you open it.', style: TextStyle(fontSize: 12, color: AppTheme.textSec, height: 1.6)),
      const SizedBox(height: 20),
      _label('PIN (4 DIGITS)'),
      TextField(
        controller: _pinCtrl,
        obscureText: true,
        maxLength: 4,
        keyboardType: TextInputType.number,
        inputFormatters: [FilteringTextInputFormatter.digitsOnly],
        style: const TextStyle(color: AppTheme.textPri, fontFamily: 'Courier', fontSize: 18, letterSpacing: 8),
        decoration: const InputDecoration(counterText: '', hintText: '• • • •'),
      ),
      const SizedBox(height: 16),
      _label('CONFIRM PIN'),
      TextField(
        controller: _confirmCtrl,
        obscureText: true,
        maxLength: 4,
        keyboardType: TextInputType.number,
        inputFormatters: [FilteringTextInputFormatter.digitsOnly],
        style: const TextStyle(color: AppTheme.textPri, fontFamily: 'Courier', fontSize: 18, letterSpacing: 8),
        decoration: const InputDecoration(counterText: '', hintText: '• • • •'),
      ),
      if (_error != null) ...[
        const SizedBox(height: 12),
        Text(_error!, style: const TextStyle(color: AppTheme.danger, fontSize: 12, fontFamily: 'Courier')),
      ],
      const SizedBox(height: 28),
      Row(
        children: [
          OutlinedButton(
            onPressed: _saving ? null : () => setState(() { _step = 0; _error = null; }),
            child: const Text('BACK'),
          ),
          const SizedBox(width: 12),
          Expanded(child: _saving
            ? const Center(child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: AppTheme.amber)))
            : _actionBtn('ACTIVATE', _save),
          ),
        ],
      ),
    ],
  );

  Widget _nextBtn() {
    return SizedBox(
      width: double.infinity,
      child: _actionBtn('NEXT →', () {
        final nameOk = _nameCtrl.text.trim().isNotEmpty;
        final idOk   = _instituteCtrl.text.trim().isNotEmpty;
        if (!nameOk || !idOk) {
          setState(() => _error = 'Please fill in all fields');
          return;
        }
        setState(() { _step = 1; _error = null; });
      }),
    );
  }

  Widget _actionBtn(String label, VoidCallback onTap) => InkWell(
    onTap: onTap,
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
      color: AppTheme.amber,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(label, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w900, letterSpacing: 0.14, color: AppTheme.textPri, fontFamily: 'Courier')),
        ],
      ),
    ),
  );

  Widget _label(String t) => Padding(
    padding: const EdgeInsets.only(bottom: 6),
    child: Text(t, style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w900, letterSpacing: 0.2, color: AppTheme.amber, fontFamily: 'Courier')),
  );

  Widget _divider(String label) => Container(
    width: double.infinity,
    padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 7),
    decoration: const BoxDecoration(border: Border(top: BorderSide(color: AppTheme.border), bottom: BorderSide(color: AppTheme.border))),
    child: Text(label, style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w700, letterSpacing: 0.18, color: AppTheme.textMuted, fontFamily: 'Courier')),
  );
}

class _DotGrid extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = const Color(0xFF2A2A2A)..strokeWidth = 1;
    const spacing = 28.0;
    for (double x = 0; x < size.width; x += spacing) {
      for (double y = 0; y < size.height; y += spacing) {
        canvas.drawCircle(Offset(x, y), 1, paint);
      }
    }
  }
  @override
  bool shouldRepaint(_) => false;
}
