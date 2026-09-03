import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';

// A genuinely rotatable 3D scientist figure — not a flat front-view drawing.
// Body parts are boxes laid out with the same proportions as the game's real
// THREE.js character (buildCharacter() in src/player/Avatar.js: shoulders +
// waist blocks, thigh/arm cylinders approximated as boxes, a hood shell that
// sits BEHIND the head so it's hidden at the front view and only revealed
// once the figure is turned around) — a small software 3D rasterizer
// (rotate → cull backfaces → depth-sort → project → fill) drawn straight
// onto a Flutter Canvas, no external 3D package needed. Drag horizontally to
// spin it; it idles into a slow auto-rotate when left alone.

class RotatableScientistFigure extends StatefulWidget {
  final double height;
  final Color parkaColor;
  final Color hoodColor;
  final bool showPatch;
  final bool hoodOn;
  final bool goggles;
  final bool pack;

  const RotatableScientistFigure({
    super.key,
    this.height = 240,
    this.parkaColor = const Color(0xFF2A6FCC),
    this.hoodColor = const Color(0xFF6B2F0F),
    this.showPatch = true,
    this.hoodOn = true,
    this.goggles = true,
    this.pack = false,
  });

  @override
  State<RotatableScientistFigure> createState() => _RotatableScientistFigureState();
}

class _RotatableScientistFigureState extends State<RotatableScientistFigure>
    with SingleTickerProviderStateMixin {
  double _yaw = -0.5; // start turned slightly so the 3D-ness reads immediately
  double _dragVelocity = 0;
  DateTime _lastInteraction = DateTime.now().subtract(const Duration(seconds: 5));
  late final Ticker _ticker;
  Duration _lastTick = Duration.zero;

  @override
  void initState() {
    super.initState();
    _ticker = createTicker(_onTick)..start();
  }

  void _onTick(Duration elapsed) {
    final dt = ((elapsed - _lastTick).inMicroseconds / 1e6).clamp(0.0, 0.05);
    _lastTick = elapsed;
    final idle = DateTime.now().difference(_lastInteraction).inMilliseconds > 900;
    setState(() {
      if (idle) {
        // Gentle idle spin so the figure always reads as "live", not static.
        _yaw += dt * 0.35;
      } else if (_dragVelocity.abs() > 0.001) {
        _yaw += _dragVelocity * dt * 6;
        _dragVelocity *= math.pow(0.001, dt).toDouble(); // decay
      }
    });
  }

  @override
  void dispose() {
    _ticker.dispose();
    super.dispose();
  }

  void _onPanUpdate(DragUpdateDetails d) {
    setState(() {
      _yaw += d.delta.dx * 0.012;
      _dragVelocity = d.delta.dx * 0.4;
      _lastInteraction = DateTime.now();
    });
  }

  @override
  Widget build(BuildContext context) {
    final w = widget.height * 0.72;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onPanUpdate: _onPanUpdate,
      onPanDown: (_) => _lastInteraction = DateTime.now(),
      child: SizedBox(
        width: w,
        height: widget.height,
        child: CustomPaint(
          painter: _Figure3DPainter(
            yaw: _yaw,
            parka: widget.parkaColor,
            hood: widget.hoodColor,
            showPatch: widget.showPatch,
            hoodOn: widget.hoodOn,
            goggles: widget.goggles,
            pack: widget.pack,
          ),
        ),
      ),
    );
  }
}

// ── minimal 3D math ─────────────────────────────────────────────────────
class _V3 {
  final double x, y, z;
  const _V3(this.x, this.y, this.z);
  _V3 operator +(_V3 o) => _V3(x + o.x, y + o.y, z + o.z);
  _V3 rotY(double a) {
    final c = math.cos(a), s = math.sin(a);
    return _V3(x * c + z * s, y, -x * s + z * c);
  }
  double dot(_V3 o) => x * o.x + y * o.y + z * o.z;
}

class _Box {
  final _V3 center;
  final _V3 half;
  final Color color;
  const _Box(this.center, this.half, this.color);
}

class _Face {
  final List<_V3> corners; // 4, local (unrotated)
  final _V3 normal;        // local (unrotated), unit axis-aligned
  final Color color;
  const _Face(this.corners, this.normal, this.color);
}

List<_Face> _boxFaces(_Box b) {
  final c = b.center, h = b.half;
  _V3 p(double sx, double sy, double sz) => c + _V3(sx * h.x, sy * h.y, sz * h.z);
  final v000 = p(-1, -1, -1), v100 = p(1, -1, -1), v110 = p(1, 1, -1), v010 = p(-1, 1, -1);
  final v001 = p(-1, -1, 1), v101 = p(1, -1, 1), v111 = p(1, 1, 1), v011 = p(-1, 1, 1);
  return [
    _Face([v001, v101, v111, v011], const _V3(0, 0, 1), b.color),   // front (+z)
    _Face([v100, v000, v010, v110], const _V3(0, 0, -1), b.color),  // back (-z)
    _Face([v101, v100, v110, v111], const _V3(1, 0, 0), b.color),   // right (+x)
    _Face([v000, v001, v011, v010], const _V3(-1, 0, 0), b.color),  // left (-x)
    _Face([v011, v111, v110, v010], const _V3(0, 1, 0), b.color),   // top (+y)
    _Face([v000, v100, v101, v001], const _V3(0, -1, 0), b.color),  // bottom (-y)
  ];
}

class _Figure3DPainter extends CustomPainter {
  _Figure3DPainter({
    required this.yaw,
    required this.parka,
    required this.hood,
    required this.showPatch,
    required this.hoodOn,
    required this.goggles,
    required this.pack,
  }) : parkaDark = Color.lerp(parka, Colors.black, 0.32)!;

  final double yaw;
  final Color parka;
  final Color parkaDark;
  final Color hood;
  final bool showPatch;
  final bool hoodOn;
  final bool goggles;
  final bool pack;

  static const _trouser = Color(0xFF22262B);
  static const _boot = Color(0xFF14161A);
  static const _skin = Color(0xFFC48A63);
  static const _fur = Color(0xFFE8DDC7);
  static const _goggleC = Color(0xFF1A2530);
  static const _saffron = Color(0xFFFF9933);
  static const _white = Color(0xFFFFFFFF);
  static const _green = Color(0xFF128807);

  List<_Box> _buildBoxes() {
    final boxes = <_Box>[
      // legs + boots
      _Box(const _V3(-0.13, 0.41, 0), const _V3(0.095, 0.41, 0.1), _trouser),
      _Box(const _V3(0.13, 0.41, 0), const _V3(0.095, 0.41, 0.1), _trouser),
      _Box(const _V3(-0.13, 0.07, 0.03), const _V3(0.085, 0.065, 0.16), _boot),
      _Box(const _V3(0.13, 0.07, 0.03), const _V3(0.085, 0.065, 0.16), _boot),
      // torso
      _Box(const _V3(0, 0.95, 0), const _V3(0.2, 0.16, 0.15), parka),
      _Box(const _V3(0, 1.27, 0), const _V3(0.235, 0.17, 0.165), parka),
      // arms + gloves
      _Box(const _V3(-0.29, 1.14, 0), const _V3(0.08, 0.24, 0.08), parka),
      _Box(const _V3(0.29, 1.14, 0), const _V3(0.08, 0.24, 0.08), parka),
      _Box(const _V3(-0.29, 0.865, 0.02), const _V3(0.06, 0.065, 0.08), parkaDark),
      _Box(const _V3(0.29, 0.865, 0.02), const _V3(0.06, 0.065, 0.08), parkaDark),
      // head
      _Box(const _V3(0, 1.62, 0), const _V3(0.14, 0.14, 0.14), _skin),
    ];

    if (hoodOn) {
      // Sits behind + slightly wider than the head, so it's hidden at the
      // front view and only reads once the figure turns around — exactly
      // like a real hood does.
      boxes.add(_Box(const _V3(0, 1.645, -0.055), const _V3(0.165, 0.155, 0.1), hood));
      boxes.add(_Box(const _V3(0, 1.49, -0.04), const _V3(0.11, 0.03, 0.09), _fur)); // ruff
    }

    if (goggles) {
      boxes.add(_Box(const _V3(0, 1.635, 0.145), const _V3(0.09, 0.032, 0.012), _goggleC));
    }

    if (pack) {
      boxes.add(_Box(const _V3(0, 1.18, -0.24), const _V3(0.15, 0.2, 0.08), parkaDark));
    }

    if (showPatch) {
      for (var i = 0; i < 3; i++) {
        final c = [_saffron, _white, _green][i];
        boxes.add(_Box(_V3(-0.17, 1.31 - i * 0.028, 0.166), const _V3(0.03, 0.013, 0.004), c));
      }
    }

    return boxes;
  }

  @override
  void paint(Canvas canvas, Size size) {
    final boxes = _buildBoxes();
    final faces = <_Face>[for (final b in boxes) ..._boxFaces(b)];

    // Rotate + cull + depth-sort.
    final visible = <_ProjFace>[];
    const light = _V3(0.35, 0.62, 0.7);
    final lightLen = math.sqrt(light.dot(light));

    for (final f in faces) {
      final rn = f.normal.rotY(yaw);
      if (rn.z <= 0.03) continue; // facing away from camera
      final rc = [for (final v in f.corners) v.rotY(yaw)];
      final avgZ = rc.fold<double>(0, (s, v) => s + v.z) / rc.length;
      final brightness = (rn.dot(light) / lightLen).clamp(0.35, 1.0);
      visible.add(_ProjFace(rc, avgZ, f.color, brightness));
    }
    visible.sort((a, b) => a.avgZ.compareTo(b.avgZ)); // farthest first

    // Figure spans roughly y:[0,1.9], project to fit the canvas with a
    // small headroom margin.
    const figHeight = 1.95;
    final scale = size.height / figHeight * 0.92;
    final originX = size.width / 2;
    final originY = size.height * 0.96;

    for (final pf in visible) {
      final path = Path();
      for (var i = 0; i < pf.corners.length; i++) {
        final v = pf.corners[i];
        final persp = 1 + v.z * 0.18; // weak perspective: nearer reads slightly larger
        final sx = originX + v.x * scale * persp;
        final sy = originY - v.y * scale * persp;
        if (i == 0) {
          path.moveTo(sx, sy);
        } else {
          path.lineTo(sx, sy);
        }
      }
      path.close();
      final shaded = Color.lerp(Colors.black, pf.color, pf.brightness)!;
      canvas.drawPath(path, Paint()..color = shaded..style = PaintingStyle.fill);
    }

    // Soft contact shadow.
    final shadowPaint = Paint()
      ..color = Colors.black.withOpacity(0.28)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 6);
    canvas.drawOval(
      Rect.fromCenter(center: Offset(originX, originY + 4), width: size.width * 0.42, height: size.height * 0.045),
      shadowPaint,
    );
  }

  @override
  bool shouldRepaint(_Figure3DPainter old) =>
      old.yaw != yaw ||
      old.parka != parka ||
      old.hood != hood ||
      old.showPatch != showPatch ||
      old.hoodOn != hoodOn ||
      old.goggles != goggles ||
      old.pack != pack;
}

class _ProjFace {
  final List<_V3> corners;
  final double avgZ;
  final Color color;
  final double brightness;
  const _ProjFace(this.corners, this.avgZ, this.color, this.brightness);
}
