import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'providers/auth_provider.dart' as app_auth;

// ── IIA palette — dark navy + IIA royal blue accent ───────────────────────
// Near-black ground, IIA navy blue as the primary accent (matches the logo
// ring), sharp rectangular edges, monospace type throughout.

class AppTheme {
  AppTheme._();

  // Core palette
  static const Color ground    = Color(0xFF111418); // near-black with blue tint
  static const Color surface   = Color(0xFF1A1F27); // dark navy panel
  static const Color surfaceHi = Color(0xFF222A36); // elevated card
  static const Color border    = Color(0xFF2E3A4E); // blue-tinted divider
  static const Color amber     = Color(0xFF2A6FCC); // IIA royal blue (replaces amber)
  static const Color amberDim  = Color(0xFF1A4F9A); // muted blue
  static const Color danger    = Color(0xFFE24040); // red for urgent/safety
  static const Color textPri   = Color(0xFFEEEEEE); // primary text
  static const Color textSec   = Color(0xFF8A9BB0); // blue-grey secondary
  static const Color textMuted = Color(0xFF445566); // muted / inactive

  // Sync status colours
  static const Color synced    = Color(0xFF4CAF50);
  static const Color pending   = Color(0xFF2A6FCC);

  static ThemeData get theme => build();
  // Glove mode: expedition mitts make small hit-targets unusable outdoors —
  // every control in this variant gets a meaningfully larger tap area and
  // slightly larger text, rather than a purely cosmetic toggle.
  static ThemeData get gloveTheme => build(glove: true);

  static ThemeData build({bool glove = false}) => ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    visualDensity: glove ? VisualDensity.comfortable : VisualDensity.standard,
    scaffoldBackgroundColor: ground,
    colorScheme: const ColorScheme.dark(
      surface: surface,
      primary: amber,
      secondary: amberDim,
      error: danger,
      onSurface: textPri,
      onPrimary: ground,
    ),

    // AppBar — blank, just the ground colour
    appBarTheme: const AppBarTheme(
      backgroundColor: ground,
      foregroundColor: textPri,
      elevation: 0,
      titleTextStyle: TextStyle(
        fontFamily: 'Courier',
        fontSize: 13,
        fontWeight: FontWeight.w700,
        letterSpacing: 0.14,
        color: textSec,
      ),
    ),

    // Text — Courier / monospace for that old-school GTA feel
    fontFamily: 'Courier',
    textTheme: const TextTheme(
      displayLarge: TextStyle(fontSize: 28, fontWeight: FontWeight.w900, color: textPri, letterSpacing: -0.5),
      displayMedium: TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: textPri),
      titleLarge: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: textPri, letterSpacing: 0.08),
      titleMedium: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: textSec, letterSpacing: 0.12),
      bodyLarge: TextStyle(fontSize: 14, color: textPri, height: 1.55),
      bodyMedium: TextStyle(fontSize: 13, color: textSec, height: 1.5),
      bodySmall: TextStyle(fontSize: 11, color: textMuted, letterSpacing: 0.04),
      labelLarge: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, letterSpacing: 0.1, color: textPri),
    ),

    // Card — rectangular, dark, thin amber border when active
    cardTheme: const CardThemeData(
      color: surface,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.zero,
        side: BorderSide(color: border, width: 1),
      ),
      margin: EdgeInsets.zero,
    ),

    // Inputs — monospace, dark fill, amber focus border
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: surfaceHi,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(4),
        borderSide: const BorderSide(color: border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(4),
        borderSide: const BorderSide(color: border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(4),
        borderSide: const BorderSide(color: amber, width: 1.5),
      ),
      labelStyle: TextStyle(color: textSec, fontSize: glove ? 12 : 11, letterSpacing: 0.08),
      hintStyle: TextStyle(color: textMuted, fontSize: glove ? 14 : 13),
      contentPadding: EdgeInsets.symmetric(horizontal: 14, vertical: glove ? 20 : 12),
    ),

    // Elevated button — amber fill, ground text, all-caps
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: amber,
        foregroundColor: textPri,
        elevation: 0,
        minimumSize: Size(0, glove ? 60 : 44),
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.zero),
        padding: EdgeInsets.symmetric(horizontal: 32, vertical: glove ? 22 : 16),
        textStyle: TextStyle(
          fontSize: glove ? 15 : 13,
          fontWeight: FontWeight.w900,
          letterSpacing: 0.14,
          fontFamily: 'Courier',
        ),
      ),
    ),

    // Outlined button — transparent, amber border + text
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: amber,
        side: const BorderSide(color: amber),
        minimumSize: Size(0, glove ? 56 : 40),
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.zero),
        padding: EdgeInsets.symmetric(horizontal: 24, vertical: glove ? 20 : 14),
        textStyle: TextStyle(fontSize: glove ? 14 : 12, fontWeight: FontWeight.w700, letterSpacing: 0.1, fontFamily: 'Courier'),
      ),
    ),

    // Text button — amber
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: amber,
        minimumSize: Size(0, glove ? 48 : 32),
        textStyle: TextStyle(fontSize: glove ? 14 : 12, fontWeight: FontWeight.w700, fontFamily: 'Courier'),
      ),
    ),

    // Divider
    dividerTheme: const DividerThemeData(color: border, thickness: 1, space: 0),

    // Chip (used for status pills)
    chipTheme: ChipThemeData(
      backgroundColor: surfaceHi,
      labelStyle: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 0.08),
      shape: const StadiumBorder(side: BorderSide(color: border)),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
    ),
  );
}

// ── GTA-style menu item ────────────────────────────────────────────────────
// The signature pause-menu list item: full-width, amber highlight when active.
class GtaMenuItem extends StatelessWidget {
  final String label;
  final String? sub;
  final bool selected;
  final VoidCallback? onTap;
  final Widget? trailing;

  const GtaMenuItem({
    super.key,
    required this.label,
    this.sub,
    this.selected = false,
    this.onTap,
    this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    final glove = context.select<app_auth.AuthProvider, bool>((a) => a.profile?.gloveMode ?? false);
    return InkWell(
      onTap: onTap,
      child: Container(
        width: double.infinity,
        constraints: BoxConstraints(minHeight: glove ? 64 : 0),
        decoration: BoxDecoration(
          color: selected ? AppTheme.amber.withOpacity(0.12) : Colors.transparent,
          border: Border(
            left: BorderSide(
              color: selected ? AppTheme.amber : Colors.transparent,
              width: glove ? 5 : 3,
            ),
            bottom: const BorderSide(color: AppTheme.border, width: 1),
          ),
        ),
        padding: EdgeInsets.symmetric(horizontal: 20, vertical: glove ? 20 : 14),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label.toUpperCase(),
                    style: TextStyle(
                      fontSize: glove ? 16 : 13,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 0.12,
                      color: selected ? AppTheme.amber : AppTheme.textPri,
                      fontFamily: 'Courier',
                    ),
                  ),
                  if (sub != null) ...[
                    const SizedBox(height: 2),
                    Text(sub!, style: TextStyle(fontSize: glove ? 13 : 11, color: AppTheme.textSec)),
                  ],
                ],
              ),
            ),
            if (trailing != null) trailing!,
          ],
        ),
      ),
    );
  }
}

// ── Amber progress bar (health-bar style) ─────────────────────────────────
class GtaProgressBar extends StatelessWidget {
  final double value; // 0.0 – 1.0
  final Color? color;

  const GtaProgressBar({super.key, required this.value, this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 8,
      decoration: BoxDecoration(
        color: AppTheme.surfaceHi,
        border: Border.all(color: AppTheme.border),
      ),
      child: FractionallySizedBox(
        widthFactor: value.clamp(0.0, 1.0),
        alignment: Alignment.centerLeft,
        child: Container(color: color ?? AppTheme.amber),
      ),
    );
  }
}

// ── Section header (uppercase label with amber left bar) ──────────────────
class GtaSectionHead extends StatelessWidget {
  final String label;
  const GtaSectionHead(this.label, {super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: const BoxDecoration(
        border: Border(
          left: BorderSide(color: AppTheme.amber, width: 3),
          bottom: BorderSide(color: AppTheme.border),
        ),
      ),
      child: Text(
        label.toUpperCase(),
        style: const TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w900,
          letterSpacing: 0.16,
          color: AppTheme.amber,
          fontFamily: 'Courier',
        ),
      ),
    );
  }
}
