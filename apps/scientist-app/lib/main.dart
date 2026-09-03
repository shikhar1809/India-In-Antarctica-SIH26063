import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_auth/firebase_auth.dart' as fb_auth;
import 'package:provider/provider.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'app_theme.dart';
import 'firebase_options.dart';
import 'services/sync_service.dart';
import 'providers/dispatch_provider.dart';
import 'providers/auth_provider.dart' as app_auth;
import 'screens/setup_screen.dart';
import 'screens/pin_screen.dart';
import 'screens/home_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  sqfliteFfiInit();
  databaseFactory = databaseFactoryFfi;

  try {
    await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
    // Sign in anonymously so Firestore/Storage rules accept dispatch writes.
    // The anonymous UID is stored in ScientistProfile and used as authorUid.
    await fb_auth.FirebaseAuth.instance.signInAnonymously();
    SyncService().startWatching();
  } catch (_) {
    // Firebase unavailable — app runs in offline-only mode, sync retries later
  }

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
