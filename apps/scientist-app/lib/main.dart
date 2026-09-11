import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'app_theme.dart';
import 'services/local_db.dart';
import 'services/portal_api.dart';
import 'services/sync_service.dart';
import 'providers/dispatch_provider.dart';
import 'providers/auth_provider.dart' as app_auth;
import 'screens/setup_screen.dart';
import 'screens/pin_screen.dart';
import 'screens/home_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  LocalDb.useDesktopSqliteIfNeeded();

  // Who we are, from the saved session — no network needed. Then try to
  // sign in; offline, the sync service does it once the link is back.
  await PortalApi.instance.restore();
  try {
    await PortalApi.instance.idToken().timeout(const Duration(seconds: 8));
  } catch (_) {/* offline first launch, or the satellite link is down */}
  // Outside the try: a failed sign-in must not also switch syncing off.
  SyncService.instance.startWatching();

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => app_auth.AuthProvider()),
        ChangeNotifierProvider(create: (_) => DispatchProvider()),
      ],
      child: const ScientistApp(),
    ),
  );
}

class ScientistApp extends StatelessWidget {
  const ScientistApp({super.key});

  @override
  Widget build(BuildContext context) {
    return Consumer<app_auth.AuthProvider>(
      builder: (context, auth, _) {
        final glove = auth.profile?.gloveMode ?? false;
        return MaterialApp(
          title: 'IIA Field App',
          debugShowCheckedModeBanner: false,
          theme: glove ? AppTheme.gloveTheme : AppTheme.theme,
          builder: (context, child) {
            // Glove mode bumps overall text scale on top of the theme's
            // larger buttons/padding — cold, gloved thumbs need bigger
            // targets AND legible-at-a-glance text, not just one or the other.
            final mq = MediaQuery.of(context);
            return MediaQuery(
              data: mq.copyWith(textScaler: TextScaler.linear(glove ? 1.15 : 1.0)),
              child: child!,
            );
          },
          home: switch (auth.status) {
            app_auth.AuthStatus.loading => const _Splash(),
            app_auth.AuthStatus.noProfile => const SetupScreen(),
            app_auth.AuthStatus.locked => const PinScreen(),
            app_auth.AuthStatus.unlocked => const HomeScreen(),
          },
        );
      },
    );
  }
}

class _Splash extends StatelessWidget {
  const _Splash();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: SizedBox(
          width: 24, height: 24,
          child: CircularProgressIndicator(strokeWidth: 2, color: AppTheme.amber),
        ),
      ),
    );
  }
}
