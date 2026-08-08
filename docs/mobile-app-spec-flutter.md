# Canaan ERP — Admin Mobile App Specification (Flutter)

> This document is the Flutter implementation spec for the admin-only mobile app.
> The design system, screens, API contract, and dark-mode rules are **identical** to
> `mobile-app-spec.md`. Only the tech stack, project structure, packages, and code
> examples are Flutter/Dart-specific.
>
> Read `mobile-app-spec.md` §1–13 for scope, colors, typography, spacing, component
> specs, screen inventory, dark mode rules, iconography, animations, and API endpoints.
> This document covers **§14 onward** (tech stack, push notifications, project structure,
> and code examples).

---

## 1. Scope (same as React Native spec)

| Priority | Feature |
|---|---|
| P0 | Dashboard KPI cards |
| P0 | Active & current trips |
| P0 | Trip history (view booking sheet) |
| P1 | Attendance overview |
| P1 | Fleet compliance alerts |
| P1 | Edit / delete approval requests |
| P1 | P&L summary (per-truck & per-trip) |
| P1 | Maintenance records & service history |
| P2 | Staff & driver directory |
| P2 | Truck fleet list |
| P3 | Push notifications |

---

## 2. Color Palette

Same tokens as the web and React Native app.

```dart
// lib/core/theme/app_colors.dart

class AppColors {
  // Brand
  static const navy     = Color(0xFF1B2B5E);
  static const navyDark = Color(0xFF152248);
  static const gold     = Color(0xFFC9A227);

  // Blue scale
  static const blue50  = Color(0xFFEEF0F8);
  static const blue100 = Color(0xFFD2D7EF);
  static const blue200 = Color(0xFFA5AFDF);
  static const blue500 = Color(0xFF2B3F9F);
  static const blue600 = Color(0xFF1B2B5E);
  static const blue700 = Color(0xFF152248);

  // Semantic — light
  static const successText   = Color(0xFF065F46);
  static const successBg     = Color(0xFFD1FAE5);
  static const warningText   = Color(0xFF92400E);
  static const warningBg     = Color(0xFFFEF3C7);
  static const dangerText    = Color(0xFF991B1B);
  static const dangerBg      = Color(0xFFFEE2E2);
  static const purpleText    = Color(0xFF5B21B6);
  static const purpleBg      = Color(0xFFEDE9FE);
  static const amberText     = Color(0xFF854D0E);
  static const amberBg       = Color(0xFFFEF9C3);

  // Semantic — dark
  static const successTextDark  = Color(0xFF34D399);
  static const successBgDark    = Color(0xFF073825);
  static const warningTextDark  = Color(0xFFFBBF24);
  static const warningBgDark    = Color(0xFF2D1A00);
  static const dangerTextDark   = Color(0xFFF87171);
  static const dangerBgDark     = Color(0xFF2D0E12);
  static const purpleTextDark   = Color(0xFFC084FC);
  static const purpleBgDark     = Color(0xFF1A0E3A);

  // Dark mode surfaces
  static const darkBackground = Color(0xFF090C14);
  static const darkCard       = Color(0xFF141929);
  static const darkBorder     = Color(0xFF1C2340);
}
```

---

## 3. Typography

```dart
// lib/core/theme/app_text_styles.dart

import 'package:google_fonts/google_fonts.dart';

class AppText {
  static TextStyle get kpiValue => GoogleFonts.plusJakartaSans(
    fontSize: 36, fontWeight: FontWeight.w700);

  static TextStyle get pageTitle => GoogleFonts.plusJakartaSans(
    fontSize: 22, fontWeight: FontWeight.w700);

  static TextStyle get sectionHeading => GoogleFonts.plusJakartaSans(
    fontSize: 16, fontWeight: FontWeight.w600);

  static TextStyle get body => GoogleFonts.plusJakartaSans(
    fontSize: 14, fontWeight: FontWeight.w400);

  static TextStyle get caption => GoogleFonts.plusJakartaSans(
    fontSize: 12, fontWeight: FontWeight.w600, letterSpacing: 0.5);

  static TextStyle get badge => GoogleFonts.plusJakartaSans(
    fontSize: 11, fontWeight: FontWeight.w600);
}
```

---

## 4. Spacing & Radius

```dart
// lib/core/theme/app_spacing.dart

class AppSpacing {
  static const xs   = 4.0;
  static const sm   = 8.0;
  static const md   = 12.0;
  static const lg   = 16.0;
  static const xl   = 20.0;
  static const x2l  = 24.0;
  static const x3l  = 32.0;
}

class AppRadius {
  static const sm          = Radius.circular(8);
  static const md          = Radius.circular(10);
  static const lg          = Radius.circular(16);
  static const full        = Radius.circular(999);
  static const bottomSheet = BorderRadius.vertical(top: Radius.circular(20));
}
```

---

## 14. Flutter Tech Stack

### Framework
- **Flutter** stable channel (3.x, latest)
- **Dart** 3.x

### Why Flutter here (vs React Native)
This spec exists as an alternative to the React Native spec in `mobile-app-spec.md`. Choose Flutter if:
- You prefer a single compiled binary with no JS bridge
- You need pixel-perfect custom animations (Flutter renders its own widgets)
- You are comfortable with Dart and the widget paradigm

Choose React Native if you want to share TypeScript types and API client code with the existing Next.js web app.

### Project Structure

```
lib/
├── main.dart                        # App entry, Firebase init, FCM background handler
├── app.dart                         # MaterialApp.router, theme, GoRouter
├── core/
│   ├── api/
│   │   ├── api_client.dart          # Dio instance, JWT interceptor
│   │   └── endpoints.dart           # Typed API methods
│   ├── auth/
│   │   ├── auth_provider.dart       # Riverpod provider — token + user state
│   │   └── secure_storage.dart      # flutter_secure_storage wrapper
│   ├── notifications/
│   │   └── fcm_service.dart         # Firebase Messaging + local notifications
│   └── theme/
│       ├── app_colors.dart
│       ├── app_text_styles.dart
│       ├── app_spacing.dart
│       └── app_theme.dart           # ThemeData light + dark
├── features/
│   ├── auth/
│   │   └── login_screen.dart
│   ├── dashboard/
│   │   ├── dashboard_screen.dart
│   │   └── dashboard_provider.dart
│   ├── trips/
│   │   ├── trips_screen.dart        # Current trips
│   │   ├── history_screen.dart
│   │   ├── trip_detail_sheet.dart   # Modal bottom sheet
│   │   └── trips_provider.dart
│   ├── alerts/
│   │   ├── alerts_screen.dart
│   │   └── alerts_provider.dart
│   ├── fleet/
│   │   ├── fleet_screen.dart
│   │   └── fleet_provider.dart
│   ├── maintenance/
│   │   ├── maintenance_screen.dart
│   │   └── maintenance_provider.dart
│   ├── pl_summary/
│   │   ├── pl_summary_screen.dart
│   │   └── pl_summary_provider.dart
│   └── attendance/
│       ├── attendance_screen.dart
│       └── attendance_provider.dart
└── shared/
    ├── widgets/
    │   ├── stat_card.dart
    │   ├── trip_card.dart
    │   ├── status_badge.dart
    │   ├── top_app_bar.dart
    │   └── canaan_bottom_sheet.dart
    └── utils/
        └── date_utils.dart
```

### Key Packages

| Package | Purpose |
|---|---|
| `firebase_core` | Firebase initialisation |
| `firebase_messaging` | FCM push notifications |
| `flutter_local_notifications` | In-app notification banners + Android channels |
| `dio` | HTTP client (interceptors for JWT auth) |
| `flutter_secure_storage` | Store JWT token securely |
| `go_router` | Declarative routing + deep-link handling |
| `flutter_riverpod` | State management |
| `riverpod_annotation` | Code-gen for Riverpod providers |
| `google_fonts` | Plus Jakarta Sans |
| `intl` | Date formatting (Indian locale `en_IN`) |
| `shimmer` | Skeleton loading effect |
| `lucide_icons` | Icons matching the web Lucide set |

Add to `pubspec.yaml`:
```yaml
dependencies:
  firebase_core: ^3.4.0
  firebase_messaging: ^15.1.0
  flutter_local_notifications: ^17.2.2
  dio: ^5.7.0
  flutter_secure_storage: ^9.2.2
  go_router: ^14.2.7
  flutter_riverpod: ^2.5.1
  riverpod_annotation: ^2.3.5
  google_fonts: ^6.2.1
  intl: ^0.19.0
  shimmer: ^3.0.0
  lucide_icons: ^0.0.25

dev_dependencies:
  build_runner: ^2.4.12
  riverpod_generator: ^2.4.0
```

---

## 15. Theme

```dart
// lib/core/theme/app_theme.dart

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'app_colors.dart';

class AppTheme {
  static ThemeData get light => ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor: AppColors.navy,
      brightness: Brightness.light,
    ).copyWith(
      primary: AppColors.navy,
      secondary: AppColors.gold,
      surface: Colors.white,
      onSurface: const Color(0xFF111827),
    ),
    scaffoldBackgroundColor: Colors.white,
    cardTheme: CardTheme(
      color: Colors.white,
      elevation: 1,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
    ),
    textTheme: GoogleFonts.plusJakartaSansTextTheme(),
    appBarTheme: AppBarTheme(
      backgroundColor: AppColors.navy,
      foregroundColor: Colors.white,
      elevation: 0,
      titleTextStyle: GoogleFonts.plusJakartaSans(
        fontSize: 18, fontWeight: FontWeight.w700, color: Colors.white),
    ),
  );

  static ThemeData get dark => ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor: AppColors.navy,
      brightness: Brightness.dark,
    ).copyWith(
      primary: const Color(0xFF4F7EF0),
      secondary: AppColors.gold,
      surface: AppColors.darkCard,
      onSurface: const Color(0xFFF9FAFB),
    ),
    scaffoldBackgroundColor: AppColors.darkBackground,
    cardTheme: CardTheme(
      color: AppColors.darkCard,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: AppColors.darkBorder),
      ),
    ),
    textTheme: GoogleFonts.plusJakartaSansTextTheme(ThemeData.dark().textTheme),
    appBarTheme: AppBarTheme(
      backgroundColor: AppColors.navy,
      foregroundColor: Colors.white,
      elevation: 0,
      titleTextStyle: GoogleFonts.plusJakartaSans(
        fontSize: 18, fontWeight: FontWeight.w700, color: Colors.white),
    ),
  );
}
```

---

## 16. Routing (go_router)

```dart
// lib/app.dart

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'core/auth/auth_provider.dart';
import 'core/theme/app_theme.dart';
import 'features/auth/login_screen.dart';
import 'features/dashboard/dashboard_screen.dart';
import 'features/trips/trips_screen.dart';
import 'features/trips/history_screen.dart';
import 'features/alerts/alerts_screen.dart';
import 'features/fleet/fleet_screen.dart';
import 'features/maintenance/maintenance_screen.dart';
import 'features/pl_summary/pl_summary_screen.dart';
import 'features/attendance/attendance_screen.dart';
import 'shared/widgets/main_scaffold.dart';   // bottom nav shell

final _rootNavigatorKey = GlobalKey<NavigatorState>();
final _shellNavigatorKey = GlobalKey<NavigatorState>();

final routerProvider = Provider<GoRouter>((ref) {
  final auth = ref.watch(authProvider);

  return GoRouter(
    navigatorKey: _rootNavigatorKey,
    initialLocation: '/dashboard',
    redirect: (context, state) {
      final loggedIn = auth.token != null;
      final onLogin  = state.matchedLocation == '/login';
      if (!loggedIn && !onLogin) return '/login';
      if (loggedIn  &&  onLogin) return '/dashboard';
      return null;
    },
    routes: [
      GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),

      // Shell route — provides the bottom nav bar
      ShellRoute(
        navigatorKey: _shellNavigatorKey,
        builder: (context, state, child) => MainScaffold(child: child),
        routes: [
          GoRoute(path: '/dashboard',   builder: (_, __) => const DashboardScreen()),
          GoRoute(path: '/trips',       builder: (_, __) => const TripsScreen()),
          GoRoute(path: '/history',     builder: (_, __) => const HistoryScreen()),
          GoRoute(path: '/alerts',      builder: (_, __) => const AlertsScreen()),
          GoRoute(path: '/fleet',       builder: (_, __) => const FleetScreen()),
          GoRoute(path: '/maintenance', builder: (_, __) => const MaintenanceScreen()),
          GoRoute(path: '/pl-summary',  builder: (_, __) => const PlSummaryScreen()),
          GoRoute(path: '/attendance',  builder: (_, __) => const AttendanceScreen()),
        ],
      ),
    ],
  );
});

class App extends ConsumerWidget {
  const App({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    return MaterialApp.router(
      title: 'Canaan ERP',
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      themeMode: ThemeMode.system,
      routerConfig: router,
    );
  }
}
```

---

## 17. API Client (Dio)

```dart
// lib/core/api/api_client.dart

import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

const kBaseUrl = 'https://erpbackend.canaanglobalinternational.com';
const kWsUrl   = 'wss://erpbackend.canaanglobalinternational.com/ws';

final _storage = FlutterSecureStorage();

Dio buildApiClient() {
  final dio = Dio(BaseOptions(
    baseUrl: kBaseUrl,
    connectTimeout: const Duration(seconds: 15),
    receiveTimeout: const Duration(seconds: 15),
    headers: {'Content-Type': 'application/json'},
  ));

  // Attach JWT on every request
  dio.interceptors.add(InterceptorsWrapper(
    onRequest: (options, handler) async {
      final token = await _storage.read(key: 'access_token');
      if (token != null) {
        options.headers['Authorization'] = 'Bearer $token';
      }
      handler.next(options);
    },
    onError: (error, handler) async {
      if (error.response?.statusCode == 401) {
        await _storage.delete(key: 'access_token');
        await _storage.delete(key: 'auth_user');
      }
      handler.next(error);
    },
  ));

  return dio;
}
```

---

## 18. Auth (Riverpod + SecureStorage)

```dart
// lib/core/auth/auth_provider.dart

import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class AuthUser {
  final String name;
  final String role;
  final String email;
  final String? staffId;
  const AuthUser({required this.name, required this.role,
                  required this.email, this.staffId});

  factory AuthUser.fromJson(Map<String, dynamic> j) => AuthUser(
    name: j['name'], role: j['role'],
    email: j['email'], staffId: j['staff_id'],
  );
  Map<String, dynamic> toJson() =>
    {'name': name, 'role': role, 'email': email, 'staff_id': staffId};
}

class AuthState {
  final String? token;
  final AuthUser? user;
  final bool isLoading;
  const AuthState({this.token, this.user, this.isLoading = true});
  AuthState copyWith({String? token, AuthUser? user, bool? isLoading}) =>
    AuthState(
      token: token ?? this.token,
      user: user ?? this.user,
      isLoading: isLoading ?? this.isLoading,
    );
}

class AuthNotifier extends StateNotifier<AuthState> {
  AuthNotifier() : super(const AuthState());

  final _storage = const FlutterSecureStorage();

  Future<void> loadFromStorage() async {
    final token = await _storage.read(key: 'access_token');
    final raw   = await _storage.read(key: 'auth_user');
    final user  = raw != null ? AuthUser.fromJson(jsonDecode(raw)) : null;
    state = AuthState(token: token, user: user, isLoading: false);
  }

  Future<void> setAuth(String token, AuthUser user) async {
    await _storage.write(key: 'access_token', value: token);
    await _storage.write(key: 'auth_user',    value: jsonEncode(user.toJson()));
    state = state.copyWith(token: token, user: user, isLoading: false);
  }

  Future<void> clearAuth() async {
    await _storage.delete(key: 'access_token');
    await _storage.delete(key: 'auth_user');
    state = const AuthState(token: null, user: null, isLoading: false);
  }
}

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>(
  (_) => AuthNotifier(),
);
```

---

## 19. Bottom Navigation Shell

```dart
// lib/shared/widgets/main_scaffold.dart

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../core/theme/app_colors.dart';

class MainScaffold extends StatelessWidget {
  final Widget child;
  const MainScaffold({super.key, required this.child});

  static const _tabs = [
    _Tab('/dashboard',   'Home',    LucideIcons.layoutDashboard),
    _Tab('/trips',       'Trips',   LucideIcons.route),
    _Tab('/history',     'History', LucideIcons.history),
    _Tab('/alerts',      'Alerts',  LucideIcons.bell),
    _Tab('/fleet',       'More',    LucideIcons.menu),
  ];

  int _currentIndex(String location) {
    for (var i = 0; i < _tabs.length; i++) {
      if (location.startsWith(_tabs[i].route)) return i;
    }
    return 0;
  }

  @override
  Widget build(BuildContext context) {
    final location = GoRouterState.of(context).matchedLocation;
    final idx = _currentIndex(location);

    return Scaffold(
      body: child,
      bottomNavigationBar: NavigationBar(
        backgroundColor: Theme.of(context).colorScheme.surface,
        indicatorColor: AppColors.navy.withOpacity(0.12),
        selectedIndex: idx,
        onDestinationSelected: (i) => context.go(_tabs[i].route),
        destinations: _tabs.map((t) => NavigationDestination(
          icon:         Icon(t.icon, color: Theme.of(context).colorScheme.onSurface.withOpacity(0.5)),
          selectedIcon: Icon(t.icon, color: AppColors.navy),
          label: t.label,
        )).toList(),
      ),
    );
  }
}

class _Tab {
  final String route, label;
  final IconData icon;
  const _Tab(this.route, this.label, this.icon);
}
```

---

## 20. Shared Widgets

### StatCard

```dart
// lib/shared/widgets/stat_card.dart

import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';

enum StatVariant { blue, emerald, amber, red, purple, plain }

class StatCard extends StatelessWidget {
  final String label;
  final String value;
  final String? caption;
  final StatVariant variant;
  final VoidCallback? onTap;

  const StatCard({
    super.key,
    required this.label,
    required this.value,
    this.caption,
    this.variant = StatVariant.plain,
    this.onTap,
  });

  static _Colors _resolve(StatVariant v, bool dark) {
    switch (v) {
      case StatVariant.blue:
        return dark
            ? _Colors(const Color(0xFF1E2A5E), const Color(0xFF93AAF5))
            : _Colors(AppColors.blue50,        AppColors.blue600);
      case StatVariant.emerald:
        return dark
            ? _Colors(AppColors.successBgDark,  AppColors.successTextDark)
            : _Colors(AppColors.successBg,      AppColors.successText);
      case StatVariant.amber:
        return dark
            ? _Colors(AppColors.warningBgDark,  AppColors.warningTextDark)
            : _Colors(AppColors.warningBg,      AppColors.warningText);
      case StatVariant.red:
        return dark
            ? _Colors(AppColors.dangerBgDark,   AppColors.dangerTextDark)
            : _Colors(AppColors.dangerBg,       AppColors.dangerText);
      case StatVariant.purple:
        return dark
            ? _Colors(AppColors.purpleBgDark,   AppColors.purpleTextDark)
            : _Colors(AppColors.purpleBg,       AppColors.purpleText);
      case StatVariant.plain:
        return dark
            ? _Colors(AppColors.darkCard,       const Color(0xFFD1D5DB))
            : _Colors(const Color(0xFFF9FAFB),  const Color(0xFF374151));
    }
  }

  @override
  Widget build(BuildContext context) {
    final dark   = Theme.of(context).brightness == Brightness.dark;
    final colors = _resolve(variant, dark);

    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 100),
          decoration: BoxDecoration(
            color: colors.bg,
            borderRadius: BorderRadius.circular(16),
            boxShadow: dark
                ? [BoxShadow(color: Colors.black.withOpacity(0.4), blurRadius: 12)]
                : [BoxShadow(color: Colors.black.withOpacity(0.07), blurRadius: 4, offset: const Offset(0, 1))],
          ),
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label.toUpperCase(),
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600,
                      color: colors.text, letterSpacing: 0.5)),
              const SizedBox(height: 4),
              Text(value,
                  style: TextStyle(fontSize: 34, fontWeight: FontWeight.w700,
                      color: colors.text, height: 1.1)),
              if (caption != null) ...[
                const SizedBox(height: 2),
                Text(caption!,
                    style: TextStyle(fontSize: 12, color: colors.text.withOpacity(0.7))),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _Colors {
  final Color bg, text;
  const _Colors(this.bg, this.text);
}
```

### StatusBadge

```dart
// lib/shared/widgets/status_badge.dart

import 'package:flutter/material.dart';

class StatusBadge extends StatelessWidget {
  final String status;
  const StatusBadge(this.status, {super.key});

  static const _light = <String, _C>{
    'Assigned':   _C(Color(0xFFEEF0F8), Color(0xFF1B2B5E), Color(0xFF2B3F9F)),
    'Started':    _C(Color(0xFFFEF9C3), Color(0xFF854D0E), Color(0xFFD97706)),
    'Loaded':     _C(Color(0xFFEDE9FE), Color(0xFF5B21B6), Color(0xFF7C3AED)),
    'On-Transit': _C(Color(0xFFFEF3C7), Color(0xFF92400E), Color(0xFFD97706)),
    'Reached':    _C(Color(0xFFCCFBF1), Color(0xFF0F766E), Color(0xFF0D9488)),
    'Unloaded':   _C(Color(0xFFD1FAE5), Color(0xFF065F46), Color(0xFF059669)),
    'Completed':  _C(Color(0xFFD1FAE5), Color(0xFF065F46), Color(0xFF059669)),
    'Invoiced':   _C(Color(0xFFEDE9FE), Color(0xFF5B21B6), Color(0xFF7C3AED)),
    'Cancelled':  _C(Color(0xFFFEE2E2), Color(0xFF991B1B), Color(0xFFDC2626)),
  };

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final c = _light[status] ?? const _C(Color(0xFFF3F4F6), Color(0xFF374151), Color(0xFF9CA3AF));

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
      decoration: BoxDecoration(
        color: dark ? c.dot.withOpacity(0.15) : c.bg,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(width: 6, height: 6,
              decoration: BoxDecoration(color: c.dot, shape: BoxShape.circle)),
          const SizedBox(width: 5),
          Text(status,
              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600,
                  color: dark ? c.dot : c.text)),
        ],
      ),
    );
  }
}

class _C {
  final Color bg, text, dot;
  const _C(this.bg, this.text, this.dot);
}
```

### TripCard

```dart
// lib/shared/widgets/trip_card.dart

import 'package:flutter/material.dart';
import 'status_badge.dart';

const _borderColors = <String, Color>{
  'Assigned':   Color(0xFF2B3F9F),
  'Started':    Color(0xFFD97706),
  'Loaded':     Color(0xFF7C3AED),
  'On-Transit': Color(0xFFD97706),
  'Reached':    Color(0xFF0D9488),
  'Unloaded':   Color(0xFF059669),
  'Completed':  Color(0xFF059669),
  'Invoiced':   Color(0xFF7C3AED),
  'Cancelled':  Color(0xFFDC2626),
};

class TripCard extends StatelessWidget {
  final Map<String, dynamic> trip;
  final VoidCallback? onTap;
  final Widget? actions;

  const TripCard({super.key, required this.trip, this.onTap, this.actions});

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final dark   = Theme.of(context).brightness == Brightness.dark;
    final status = trip['status'] as String? ?? '';
    final borderColor = _borderColors[status] ?? Colors.grey;

    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: dark ? const Color(0xFF141929) : Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border(
            left: BorderSide(color: borderColor, width: 4),
            top:    BorderSide(color: dark ? const Color(0xFF1C2340) : const Color(0xFFE5E7EB)),
            right:  BorderSide(color: dark ? const Color(0xFF1C2340) : const Color(0xFFE5E7EB)),
            bottom: BorderSide(color: dark ? const Color(0xFF1C2340) : const Color(0xFFE5E7EB)),
          ),
          boxShadow: dark ? [] : [
            BoxShadow(color: Colors.black.withOpacity(0.06), blurRadius: 2, offset: const Offset(0, 1)),
          ],
        ),
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(trip['trip_id'] ?? '',
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                StatusBadge(status),
              ],
            ),
            if (trip['container_number'] != null || trip['container_specification'] != null) ...[
              const SizedBox(height: 6),
              Text(
                [trip['container_number'], trip['container_specification']].whereType<String>().join('  •  '),
                style: TextStyle(fontSize: 12, color: scheme.onSurface.withOpacity(0.6)),
              ),
            ],
            if (trip['origin'] != null || trip['destination'] != null) ...[
              const SizedBox(height: 4),
              Text('${trip['origin'] ?? '—'}  →  ${trip['destination'] ?? '—'}',
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
            ],
            if (trip['driver_id'] != null || trip['truck_id'] != null) ...[
              const SizedBox(height: 4),
              Text(
                [
                  if (trip['driver_id'] != null) 'Driver: ${trip['driver_id']}',
                  if (trip['truck_id']  != null) 'Truck: ${trip['truck_id']}',
                ].join('  •  '),
                style: TextStyle(fontSize: 12, color: scheme.onSurface.withOpacity(0.5)),
              ),
            ],
            if (actions != null) ...[
              const SizedBox(height: 10),
              actions!,
            ],
          ],
        ),
      ),
    );
  }
}
```

---

## 21. Login Screen

```dart
// lib/features/auth/login_screen.dart

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_client.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});
  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _usernameCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  bool _loading = false;
  String? _error;

  Future<void> _login() async {
    setState(() { _loading = true; _error = null; });
    try {
      final dio  = buildApiClient();
      final resp = await dio.post('/login', data: {
        'username': _usernameCtrl.text.trim(),
        'password': _passwordCtrl.text,
      });
      final user = AuthUser.fromJson(resp.data);
      await ref.read(authProvider.notifier).setAuth(resp.data['access_token'], user);
      if (mounted) context.go('/dashboard');
    } on DioException catch (e) {
      setState(() {
        _error = (e.response?.data as Map?)?['detail'] ?? 'Invalid credentials.';
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(AppSpacing.xl),
          child: Column(
            children: [
              const SizedBox(height: 40),
              Image.asset('assets/images/companylogo.png', height: 80),
              const SizedBox(height: 12),
              Text('Canaan ERP',
                  style: TextStyle(fontSize: 28, fontWeight: FontWeight.w700, color: AppColors.navy)),
              Text('Admin Portal',
                  style: TextStyle(fontSize: 14, color: Theme.of(context).colorScheme.onSurface.withOpacity(0.5))),
              const SizedBox(height: 32),

              // Form card
              Container(
                decoration: BoxDecoration(
                  color: dark ? AppColors.darkCard : Colors.white,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: dark ? AppColors.darkBorder : const Color(0xFFE5E7EB)),
                  boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.07), blurRadius: 8, offset: const Offset(0, 2))],
                ),
                padding: const EdgeInsets.all(24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _fieldLabel('USERNAME'),
                    const SizedBox(height: 4),
                    _input(_usernameCtrl, 'Enter username', false),
                    const SizedBox(height: 16),
                    _fieldLabel('PASSWORD'),
                    const SizedBox(height: 4),
                    _input(_passwordCtrl, 'Enter password', true,
                        onSubmit: (_) => _login()),
                    if (_error != null) ...[
                      const SizedBox(height: 12),
                      Text(_error!,
                          style: const TextStyle(fontSize: 13, color: Color(0xFFDC2626))),
                    ],
                    const SizedBox(height: 20),
                    SizedBox(
                      width: double.infinity,
                      height: 48,
                      child: FilledButton(
                        onPressed: _loading ? null : _login,
                        style: FilledButton.styleFrom(
                          backgroundColor: AppColors.navy,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        ),
                        child: _loading
                            ? const SizedBox(width: 20, height: 20,
                                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                            : const Text('Sign In',
                                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Colors.white)),
                      ),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 24),
              Text('Canaan Global International — Fleet ERP',
                  style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.onSurface.withOpacity(0.4))),
            ],
          ),
        ),
      ),
    );
  }

  Widget _fieldLabel(String text) => Text(text,
      style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, letterSpacing: 0.5,
          color: Color(0xFF6B7280)));

  Widget _input(TextEditingController ctrl, String hint, bool obscure,
      {ValueChanged<String>? onSubmit}) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return TextField(
      controller: ctrl,
      obscureText: obscure,
      onSubmitted: onSubmit,
      style: TextStyle(fontSize: 14, color: dark ? Colors.white : const Color(0xFF111827)),
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: TextStyle(color: dark ? const Color(0xFF6B7280) : const Color(0xFF9CA3AF)),
        filled: true,
        fillColor: dark ? AppColors.darkBackground : AppColors.blue50,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: dark ? AppColors.darkBorder : const Color(0xFFE5E7EB)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: dark ? AppColors.darkBorder : const Color(0xFFE5E7EB)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: AppColors.navy, width: 1.5),
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      ),
    );
  }

  @override
  void dispose() {
    _usernameCtrl.dispose();
    _passwordCtrl.dispose();
    super.dispose();
  }
}
```

---

## 22. Dashboard Screen

```dart
// lib/features/dashboard/dashboard_screen.dart

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../shared/widgets/stat_card.dart';
import 'dashboard_provider.dart';

class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  String _greeting() {
    final h = DateTime.now().hour;
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user      = ref.watch(authProvider).user;
    final dashboard = ref.watch(dashboardProvider);

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            // Top bar
            Container(
              color: AppColors.navy,
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xl, vertical: AppSpacing.md),
              child: Row(
                children: [
                  Image.asset('assets/images/logo.png', height: 32),
                  const Spacer(),
                  CircleAvatar(
                    backgroundColor: AppColors.gold,
                    radius: 17,
                    child: Text(
                      user?.name.substring(0, 1).toUpperCase() ?? 'A',
                      style: const TextStyle(color: AppColors.navy, fontWeight: FontWeight.w700, fontSize: 14),
                    ),
                  ),
                ],
              ),
            ),

            Expanded(
              child: dashboard.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error:   (e, _) => Center(child: Text('Error: $e')),
                data: (data) => RefreshIndicator(
                  onRefresh: () => ref.refresh(dashboardProvider.future),
                  child: ListView(
                    padding: const EdgeInsets.all(AppSpacing.xl),
                    children: [
                      Text('${_greeting()}, ${user?.name.split(' ').first ?? 'Admin'} 👋',
                          style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
                      const SizedBox(height: AppSpacing.lg),

                      const Text('OVERVIEW',
                          style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600,
                              letterSpacing: 0.5, color: Color(0xFF6B7280))),
                      const SizedBox(height: AppSpacing.sm),

                      Row(children: [
                        StatCard(label: 'Active Trips', value: '${data['active_trips'] ?? 0}',
                            variant: StatVariant.blue,
                            onTap: () => context.go('/trips')),
                        const SizedBox(width: AppSpacing.md),
                        StatCard(label: 'Fleet Size', value: '${data['total_trucks'] ?? 0}',
                            onTap: () => context.go('/fleet')),
                      ]),
                      const SizedBox(height: AppSpacing.md),
                      Row(children: [
                        StatCard(
                          label: 'Compliance Alerts',
                          value: '${(data['compliance_expired'] ?? 0) + (data['compliance_expiring_soon'] ?? 0)}',
                          caption: data['compliance_expired'] > 0 ? '${data['compliance_expired']} expired' : null,
                          variant: data['compliance_expired'] > 0 ? StatVariant.red : StatVariant.amber,
                          onTap: () => context.go('/fleet'),
                        ),
                        const SizedBox(width: AppSpacing.md),
                        StatCard(label: 'Maintenance Alerts',
                            value: '${data['maintenance_alerts'] ?? 0}',
                            variant: data['maintenance_alerts'] > 0 ? StatVariant.amber : StatVariant.plain),
                      ]),
                      const SizedBox(height: AppSpacing.md),
                      Row(children: [
                        StatCard(label: 'Staff', value: '${data['total_staff'] ?? 0}',
                            caption: '${data['pending_leave_requests'] ?? 0} leave pending',
                            variant: StatVariant.emerald,
                            onTap: () => context.go('/attendance')),
                        const SizedBox(width: AppSpacing.md),
                        StatCard(label: 'Monthly EMI',
                            value: '₹${((data['monthly_emi_total'] ?? 0) / 1000).toStringAsFixed(0)}K',
                            variant: StatVariant.purple),
                      ]),

                      const SizedBox(height: AppSpacing.x2l),
                      const Text('TRIP PIPELINE',
                          style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600,
                              letterSpacing: 0.5, color: Color(0xFF6B7280))),
                      const SizedBox(height: AppSpacing.sm),
                      SizedBox(
                        height: 80,
                        child: ListView(
                          scrollDirection: Axis.horizontal,
                          children: (data['trip_status_counts'] as Map<String, dynamic>? ?? {})
                              .entries.map((e) => _PipelineChip(label: e.key, count: e.value)).toList(),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PipelineChip extends StatelessWidget {
  final String label;
  final int count;
  const _PipelineChip({required this.label, required this.count});

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      margin: const EdgeInsets.only(right: 8),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: dark ? AppColors.darkCard : AppColors.blue50,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text('$count', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
          const SizedBox(height: 2),
          Text(label, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w500)),
        ],
      ),
    );
  }
}
```

### Dashboard Provider (Riverpod)

```dart
// lib/features/dashboard/dashboard_provider.dart

import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';

final dashboardProvider = FutureProvider<Map<String, dynamic>>((ref) async {
  final resp = await buildApiClient().get('/dashboard/overview');
  return Map<String, dynamic>.from(resp.data);
});
```

---

## 23. Push Notifications (Firebase Messaging)

### 23.1 Setup — `pubspec.yaml`

```yaml
dependencies:
  firebase_core: ^3.4.0
  firebase_messaging: ^15.1.0
  flutter_local_notifications: ^17.2.2
```

### 23.2 Firebase Project
1. Create project at [console.firebase.google.com](https://console.firebase.google.com)
2. Add **Android** app (`com.canaanglobalinternational.erp`) — download `google-services.json` → `android/app/`
3. Add **iOS** app (`com.canaanglobalinternational.erp`) — download `GoogleService-Info.plist` → `ios/Runner/`
4. Upload APNs Auth Key (`.p8`) in Firebase → Project Settings → Cloud Messaging → iOS app

### 23.3 Android Config

`android/app/build.gradle`:
```gradle
apply plugin: 'com.google.gms.google-services'

android {
    defaultConfig { minSdkVersion 29 }
}
```

`android/build.gradle`:
```gradle
dependencies {
    classpath 'com.google.gms:google-services:4.4.0'
}
```

### 23.4 iOS Config (Xcode)
1. Enable **Push Notifications** capability
2. Enable **Background Modes** → check `Remote notifications` and `Background fetch`

`ios/Runner/Info.plist`:
```xml
<key>FirebaseAppDelegateProxyEnabled</key>
<false/>
```

### 23.5 Flutter Code

```dart
// lib/core/notifications/fcm_service.dart

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:go_router/go_router.dart';

// Must be a top-level function
@pragma('vm:entry-point')
Future<void> firebaseBackgroundHandler(RemoteMessage message) async {
  // System tray handles display automatically in background/terminated state
}

class FCMService {
  static final _messaging          = FirebaseMessaging.instance;
  static final _localNotifications = FlutterLocalNotificationsPlugin();

  static final _androidChannel = const AndroidNotificationChannel(
    'canaan_erp_high',
    'Canaan ERP Alerts',
    description: 'Trip, approval, and compliance alerts',
    importance: Importance.high,
  );

  static Future<void> init() async {
    // Permission (iOS always, Android 13+)
    await _messaging.requestPermission(alert: true, badge: true, sound: true);

    // Background handler
    FirebaseMessaging.onBackgroundMessage(firebaseBackgroundHandler);

    // Android notification channel
    await _localNotifications
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(_androidChannel);

    // Initialise local notifications
    await _localNotifications.initialize(
      const InitializationSettings(
        android: AndroidInitializationSettings('@mipmap/ic_launcher'),
        iOS: DarwinInitializationSettings(),
      ),
      onDidReceiveNotificationResponse: (resp) {
        if (resp.payload != null) _navigate(resp.payload!);
      },
    );

    // Foreground: show local banner
    FirebaseMessaging.onMessage.listen((message) {
      final n = message.notification;
      if (n == null) return;
      _localNotifications.show(
        n.hashCode, n.title, n.body,
        NotificationDetails(
          android: AndroidNotificationDetails(
            _androidChannel.id, _androidChannel.name,
            importance: Importance.high, priority: Priority.high,
          ),
        ),
        payload: message.data['deep_link'],
      );
    });

    // Background tap
    FirebaseMessaging.onMessageOpenedApp.listen(
      (m) => _navigate(m.data['deep_link'] ?? ''));

    // Terminated tap
    final initial = await _messaging.getInitialMessage();
    if (initial != null) _navigate(initial.data['deep_link'] ?? '');
  }

  static void _navigate(String route) {
    if (route.isNotEmpty) {
      // Access the router via your navigation key or router notifier
      // e.g. appRouter.go(route);
    }
  }

  /// Call after login — registers FCM token with backend
  static Future<void> registerToken(Dio dio) async {
    final token = await _messaging.getToken();
    if (token == null) return;
    await dio.post('/users/me/fcm-token', data: {'fcm_token': token});
    _messaging.onTokenRefresh.listen((t) =>
        dio.post('/users/me/fcm-token', data: {'fcm_token': t}));
  }
}
```

**`lib/main.dart`:**
```dart
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/notifications/fcm_service.dart';
import 'firebase_options.dart';  // generated by flutterfire configure
import 'app.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  await FCMService.init();
  runApp(const ProviderScope(child: App()));
}
```

### 23.6 Notification Event Catalogue (same as React Native spec)

| Event | Title | Body | Deep link |
|---|---|---|---|
| `trip_assigned` | 🚛 Trip Assigned | `TRP-XXXX — Chennai Port → Oragadam` | `/trips` |
| `trip_completed` | ✅ Trip Completed | `TRP-XXXX completed by [Driver]` | `/history` |
| `edit_approval_requested` | ⚠️ Edit Approval Needed | `[User] requested edit on TRP-XXXX` | `/alerts` |
| `delete_approval_requested` | 🗑️ Delete Approval Needed | `[User] requested delete on TRP-XXXX` | `/alerts` |
| `compliance_expiring` | 📋 Compliance Alert | `[Truck] [Doc] expires in [N] days` | `/fleet` |
| `compliance_expired` | 🚨 Compliance Expired | `[Truck] [Doc] is expired` | `/fleet` |
| `leave_requested` | 🏖️ Leave Request | `[Staff] requested leave on [date]` | `/attendance` |
| `sheet_not_entered` | ⏰ Sheet Pending | `TRP-XXXX sheet not entered for 24h` | `/alerts` |

### 23.7 Backend Changes (same as React Native spec)
See `mobile-app-spec.md` §15.3 — the FastAPI FCM sender utility and the `fcm_token` column are identical regardless of client framework.

---

## 24. Notification Event Payload Contract

```json
{
  "notification": { "title": "⚠️ Edit Approval Needed", "body": "Latha requested edit on TRP-1085" },
  "data": { "deep_link": "/alerts", "event_type": "edit_approval_requested", "trip_id": "TRP-1085" }
}
```

---

## 25. Out of Scope (same as React Native spec)

- Invoice generation
- Trip sheet entry / reconciliation
- Yard supervisor sheet collection
- Tyre management & inventory
- Creating / editing maintenance records
- EMI & compensation management
- Excel / PDF export
- LR generation

> P&L and Maintenance are **viewable** on mobile; their data-entry flows remain web-only.

---

## 26. Build & Run

```bash
# Install dependencies
flutter pub get

# Generate Riverpod providers (run whenever providers change)
dart run build_runner build --delete-conflicting-outputs

# Run on connected device / emulator
flutter run

# Release build
flutter build apk --release          # Android
flutter build ipa --release          # iOS (requires Xcode + signing)
```

> **Firebase:** run `flutterfire configure` (install with `dart pub global activate flutterfire_cli`)
> to generate `lib/firebase_options.dart` after setting up the Firebase project.
