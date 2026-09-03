import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../app_theme.dart';
import '../providers/auth_provider.dart';

class PinScreen extends StatefulWidget {
  const PinScreen({super.key});

  @override
  State<PinScreen> createState() => _PinScreenState();
}

class _PinScreenState extends State<PinScreen> {
  String _entered = '';
  bool _shaking = false;
  bool _checking = false;

  void _tap(String digit) {
    if (_entered.length >= 4 || _checking) return;
    setState(() => _entered += digit);
    if (_entered.length == 4) _check();
  }

  void _backspace() {
    if (_entered.isEmpty) return;
    setState(() => _entered = _entered.substring(0, _entered.length - 1));
  }

  Future<void> _check() async {
    setState(() => _checking = true);
    final ok = await context.read<AuthProvider>().unlock(_entered);
    if (!ok && mounted) {
      setState(() { _shaking = true; _entered = ''; _checking = false; });
      await Future.delayed(const Duration(milliseconds: 500));
      if (mounted) setState(() => _shaking = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final profile = context.watch<AuthProvider>().profile;
    final glove = profile?.gloveMode ?? false;
    return Scaffold(
      body: Stack(
        children: [
          CustomPaint(painter: _DotGrid(), size: Size.infinite),
          Center(
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                // ── PIN entry ────────────────────────────────────────
                SizedBox(
                  width: glove ? 340 : 290,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Image.asset('assets/LOGO.png', width: 72, height: 72),
                      const SizedBox(height: 12),
                      const Text(
                        'INDIA IN ANTARCTICA',
                        style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 0.2, color: AppTheme.amber, fontFamily: 'Courier'),
                      ),
                      const SizedBox(height: 4),
                      if (profile != null) ...[
                        Text(profile.name.toUpperCase(), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppTheme.textPri, fontFamily: 'Courier')),
                        Text(profile.station, style: const TextStyle(fontSize: 11, color: AppTheme.textSec, fontFamily: 'Courier')),
                      ],
                      const SizedBox(height: 28),

                      // PIN dots
                      AnimatedContainer(
                        duration: const Duration(milliseconds: 50),
                        transform: _shaking ? Matrix4.translationValues(10, 0, 0) : Matrix4.identity(),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: List.generate(4, (i) {
                            final filled = i < _entered.length;
                            return Container(
                              margin: const EdgeInsets.symmetric(horizontal: 10),
                              width: 18, height: 18,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: filled ? AppTheme.amber : Colors.transparent,
                                border: Border.all(
                                  color: _shaking ? AppTheme.danger : AppTheme.border,
                                  width: 2,
                                ),
                              ),
                            );
                          }),
                        ),
                      ),
                      const SizedBox(height: 8),
                      AnimatedOpacity(
                        opacity: _shaking ? 1 : 0,
                        duration: const Duration(milliseconds: 200),
                        child: const Text('INCORRECT PIN', style: TextStyle(fontSize: 10, color: AppTheme.danger, fontWeight: FontWeight.w700, fontFamily: 'Courier')),
                      ),
                      const SizedBox(height: 24),

                      // Number pad
                      _numpad(glove),
                      const SizedBox(height: 14),
                      TextButton(
                        onPressed: () {},
                        child: const Text('FORGOT PIN? CONTACT ADMIN', style: TextStyle(fontSize: 9, color: AppTheme.textMuted, fontFamily: 'Courier')),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _numpad(bool glove) {
    const rows = [
      ['1','2','3'],
      ['4','5','6'],
      ['7','8','9'],
      ['','0','⌫'],
    ];
    final gap = glove ? 90.0 : 80.0;
    return Column(
      children: rows.map((row) => Padding(
        padding: EdgeInsets.only(bottom: glove ? 12 : 8),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: row.map((k) {
            if (k.isEmpty) return SizedBox(width: gap);
            return Padding(
              padding: EdgeInsets.symmetric(horizontal: glove ? 6 : 4),
              child: _Key(
                label: k,
                onTap: k == '⌫' ? _backspace : () => _tap(k),
                danger: k == '⌫',
                glove: glove,
              ),
            );
          }).toList(),
        ),
      )).toList(),
    );
  }
}

class _Key extends StatefulWidget {
  final String label;
  final VoidCallback onTap;
  final bool danger;
  final bool glove;
  const _Key({required this.label, required this.onTap, this.danger = false, this.glove = false});

  @override
  State<_Key> createState() => _KeyState();
}

class _KeyState extends State<_Key> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final g = widget.glove;
    return GestureDetector(
      onTapDown: (_) => setState(() => _pressed = true),
      onTapUp: (_) { setState(() => _pressed = false); widget.onTap(); },
      onTapCancel: () => setState(() => _pressed = false),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 80),
        width: g ? 92 : 72, height: g ? 70 : 52,
        decoration: BoxDecoration(
          color: _pressed
            ? (widget.danger ? AppTheme.danger.withOpacity(0.3) : AppTheme.amber.withOpacity(0.2))
            : AppTheme.surfaceHi,
          border: Border.all(
            color: _pressed
              ? (widget.danger ? AppTheme.danger : AppTheme.amber)
              : AppTheme.border,
            width: g ? 2.5 : 1.5,
          ),
        ),
        child: Center(
          child: Text(
            widget.label,
            style: TextStyle(
              fontSize: (widget.label == '⌫' ? 18 : 20) + (g ? 6 : 0),
              fontWeight: FontWeight.w700,
              color: widget.danger ? AppTheme.danger : AppTheme.textPri,
              fontFamily: 'Courier',
            ),
          ),
        ),
      ),
    );
  }
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
