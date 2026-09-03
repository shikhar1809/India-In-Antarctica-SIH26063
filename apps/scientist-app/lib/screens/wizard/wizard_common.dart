import 'package:flutter/material.dart';
import '../../app_theme.dart';

// Shared label used across all wizard steps.
class WizLabel extends StatelessWidget {
  final String text;
  const WizLabel(this.text, {super.key});

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 7),
    child: Text(
      text,
      style: const TextStyle(
        fontSize: 9,
        fontWeight: FontWeight.w900,
        letterSpacing: 0.16,
        color: AppTheme.amber,
        fontFamily: 'Courier',
      ),
    ),
  );
}
