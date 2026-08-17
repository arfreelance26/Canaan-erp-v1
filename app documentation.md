# Canaan ERP — Mobile App Technical Documentation

**App:** Canaan Global International — Fleet ERP (Admin mobile client)
**Package:** `canaan_mobile_flutter`  ·  **Version:** `1.0.0+1`
**Platforms:** Android · iOS
**Audience:** Developers and maintainers of the mobile app.

> Related docs: **[SECURITY.md](SECURITY.md)** covers the full security
> architecture in depth. This file covers everything else (architecture, code
> layout, data flow, build & release).

---

## 1. Overview

Canaan ERP mobile is the **Admin-facing companion** to the Canaan fleet-logistics
ERP (Next.js web frontend + FastAPI backend + MySQL). It gives administrators a
read-focused, on-the-go view of fleet operations: trips, fleet & compliance,
maintenance, attendance, P&L, approvals, and a security/audit log.

- **Login is restricted to the `Admin` role** (enforced client-side and by the
  backend).
- The app is **online-first with an offline cache** — most data is fetched live,
  with a persistent cache providing instant loads and offline fallback.
- It shares the **same REST backend** as the web app; it is a client only and
  holds no business logic of its own beyond presentation and security.

---

## 2. Technology stack

| Concern | Choice | Version |
|---|---|---|
| Framework | Flutter (stable) | 3.44.x |
| Language | Dart | SDK `^3.12.2` |
| State management | `flutter_riverpod` | ^2.5.1 |
| Routing | `go_router` | ^14.2.7 |
| HTTP client | `dio` | ^5.7.0 |
| Secure storage | `flutter_secure_storage` | ^9.2.2 |
| Local cache / prefs | `shared_preferences` | ^2.3.2 |
| Charts | `fl_chart` | ^0.69.0 |
| Fonts | `google_fonts` (Plus Jakarta Sans) | ^6.2.1 |
| Formatting | `intl` | ^0.19.0 |
| UI niceties | `shimmer`, `slide_to_act` | — |
| Biometric lock | `local_auth` | ^2.3.0 |
| Root/jailbreak detection | `safe_device` | ^1.1.4 |

---

## 3. Architecture

The app follows a **feature-first, layered architecture** with Riverpod for
state and dependency wiring.

```
┌───────────────────────────────────────────────────────────┐
│                     Presentation                            │
│   lib/features/<feature>/*_screen.dart  +  shared/widgets   │
│   (ConsumerWidgets — watch providers, render UI)            │
├───────────────────────────────────────────────────────────┤
│                        State                                │
│   lib/features/<feature>/*_provider.dart                    │
│   (Riverpod FutureProvider / StateNotifierProvider)         │
├───────────────────────────────────────────────────────────┤
│                        Core                                 │
│   api (Dio client + cache)   auth (session)                 │
│   security (pinning, lock, integrity, storage, jwt)         │
│   theme (light/dark, spacing, text)                         │
├───────────────────────────────────────────────────────────┤
│                     Data / Backend                          │
│   FastAPI REST @ erpbackend.canaanglobalinternational.com   │
└───────────────────────────────────────────────────────────┘
```

**Data-flow pattern (read):**
`Screen` → `ref.watch(fooProvider)` → provider calls `buildApiClient().get(...)`
→ Dio interceptors (auth header, TLS pinning, cache) → backend → JSON →
provider maps to model/`Map` → screen renders `loading / error / data` states.

**Golden rules of this codebase**
- Every persisted change hits the backend immediately; the UI never shows stale
  writes (persist → refetch/invalidate).
- All sensitive storage goes through `SecureStore` (never `FlutterSecureStorage`
  directly).
- Every network call goes through `buildApiClient()` so interceptors (auth, TLS
  pinning, caching, 401/403 handling) apply uniformly.

---

## 4. Project structure

```
lib/
├── main.dart                     App entry: init cache, load auth, mount SecurityGate
├── app.dart                      MaterialApp.router + go_router route table + shell
│
├── core/
│   ├── api/
│   │   ├── api_client.dart        buildApiClient(): Dio + interceptors + cache
│   │   └── endpoints.dart         (legacy helper — see §11 Notes)
│   ├── auth/
│   │   └── auth_provider.dart     AuthUser, AuthState, AuthNotifier, authProvider
│   ├── cache/
│   │   └── api_cache.dart         Persistent GET cache (SharedPreferences-backed)
│   ├── security/                  ← see SECURITY.md
│   │   ├── security_config.dart   Feature flags + pinned CA chain/pins
│   │   ├── secure_store.dart      Hardened secure storage wrapper
│   │   ├── jwt.dart               JWT decode + expiry helpers
│   │   ├── tls_pinning.dart       CA-level certificate pinning for Dio
│   │   ├── device_integrity.dart  Root/jailbreak detection
│   │   ├── app_lock.dart          Biometric / device-credential unlock
│   │   └── security_gate.dart     Integrity check + biometric gate (above router)
│   └── theme/
│       ├── app_colors.dart        Light/dark colour tokens
│       ├── app_spacing.dart       Spacing scale (xs…x3l)
│       ├── app_text_styles.dart   Text style tokens
│       ├── app_theme.dart         ThemeData (light/dark)
│       └── theme_provider.dart    ThemeMode notifier (persisted; default light)
│
├── features/                      One folder per feature: *_screen.dart + *_provider.dart
│   ├── auth/            login_screen.dart
│   ├── dashboard/       dashboard + profile/finance/attendance-today providers
│   ├── trips/           trips, history, trip detail, sheet-tracking
│   ├── fleet/           fleet list + detail sheet (compliance alerts)
│   ├── maintenance/     maintenance records
│   ├── attendance/      staff & driver attendance + reports
│   ├── pl_summary/      per-truck P&L
│   ├── resources/       drivers / staff / customers / vendors (EntityListScaffold)
│   ├── alerts/          edit-approval requests
│   ├── security/        audit log + lockouts (Admin)
│   └── more/            hub menu + theme preference
│
└── shared/
    ├── utils/date_utils.dart      CanaanDateUtils (IST formatting/parsing)
    └── widgets/                    Reusable UI (see §8)
```

---

## 5. State management (Riverpod)

All screens are `ConsumerWidget`/`ConsumerStatefulWidget` and read providers via
`ref.watch`. Data providers are `FutureProvider`s that return the parsed body;
screens render `.when(loading:, error:, data:)`.

| Provider | Type | Backend endpoint | Notes |
|---|---|---|---|
| `authProvider` | StateNotifier | `/auth/login` | Session (token + user); JWT expiry checked on load |
| `dashboardProvider` | Future | `/dashboard/overview` | Dashboard stats |
| `profileProvider` | Future | `/auth/me` | Current admin profile |
| `financeSnapshotProvider` | Future | `/finance/emi`, `/finance/recurring-payments`, `/finance/compensation/{drivers,staff}` | Parallel `Future.wait` |
| `attendanceTodayProvider` | Future | `/attendance/summary` | Today's attendance snapshot |
| `currentTripsProvider` / `allTripsProvider` | Future | `/trips` | Active vs. all trips |
| `fleetProvider` | Future | `/trucks` | Cache-first (5 min TTL) |
| `maintenanceProvider` | Future | `/maintenance/records` | |
| `attendanceProvider` | Future.autoDispose.family | `/attendance/summary` | Keyed by date |
| `driverAttendanceProvider` | Future.autoDispose.family | `/attendance/drivers` | Keyed by date |
| `attendanceReportProvider` | Future.autoDispose.family | `/attendance/summary` | Keyed by `category\|from\|to` |
| `plSummaryProvider` | Future | `/pl-summary` | Per-truck P&L |
| `alertsProvider` | Future | `/edit-approvals` | Approval requests |
| `securityLogProvider` | Future.autoDispose.family | `/auth/audit-logs` | Paginated audit log (Admin) |
| `lockoutsProvider` | Future | `/auth/lockouts` | Active login lockouts (Admin) |
| `staffListProvider` / `driversProvider` / `customersProvider` / `vendorsProvider` | Future | `/staff`, `/trips`, `/trucks`… | Resource lists |
| `themeProvider` | StateNotifier | — | Light/Dark/System (persisted) |
| `routerProvider` | Provider | — | go_router instance (rebuilds on auth change) |

> `.family` providers use `autoDispose` so per-parameter state (e.g. per-date
> attendance, per-page audit logs) is garbage-collected on navigation.

---

## 6. Networking layer

Defined in **`core/api/api_client.dart`**.

- **Base URLs** (`core/api/api_client.dart`):
  - REST: `https://erpbackend.canaanglobalinternational.com`
  - WebSocket constant `kWsUrl` (`wss://…/ws`) is defined for future real-time use.
- **Timeouts:** connect 15s · send 30s · receive 15s.
- **Interceptors (in order):**
  1. **TLS pinning** — `applyTlsPinning(dio)` pins to the Canaan CA chain (see SECURITY.md §1).
  2. **Auth** — injects `Authorization: Bearer <token>` from `SecureStore`.
  3. **401/403 handler** — clears the session (token, cached profile, API cache)
     and triggers the router redirect to `/login`.
  4. **Cache** (`_CacheInterceptor`).

### Caching (`core/cache/api_cache.dart`)
A persistent GET cache backed by `SharedPreferences`:
- **Write-through:** every successful GET body is stored on device.
- **Offline fallback:** on a network/5xx error, a cached copy is returned instead
  of throwing (marked `stale`).
- **Cache-first (opt-in):** pass `Options(extra: {'cacheFirst': true, 'cacheTtlMs': N})`
  to serve a cached body younger than `N` ms instantly (used by Fleet, 5 min TTL).
- `evictCache(path)` drops a cached entry so the next fetch bypasses cache-first
  (used on pull-to-refresh).

---

## 7. Authentication & session

Defined in **`core/auth/auth_provider.dart`** and **`features/auth/login_screen.dart`**.

**Login flow**
1. User enters username + password → `POST /auth/login`.
2. Response returns a JWT + profile. **Client checks `role == 'Admin'`**; a
   non-admin is rejected before the token is stored (backend also enforces this).
3. Token + user JSON stored via `SecureStore`; the password field is cleared.
4. Router redirects to `/dashboard`.

**Session lifecycle**
- **Cold start:** `loadFromStorage()` reads the token and **discards it if the
  JWT `exp` has passed** (no flash of authenticated UI on a dead session).
- **Resume from background:** `SecurityGate` re-checks JWT expiry; if expired it
  goes straight to `/login` (skips biometrics); otherwise it prompts for biometric
  unlock.
- **Reactive:** any `401`/`403` from the backend clears the session → `/login`.
- **Expiry** follows the backend's token `exp` (e.g. 12h). Ensure the issued JWT
  actually carries the intended `exp`.

---

## 8. UI, theming & shared widgets

- **Theme** (`core/theme/`): light/dark `ThemeData`; `themeProvider` persists the
  user's choice (**defaults to light**; changeable in More → Preferences).
  `AppColors` holds light/dark tokens; `AppSpacing` a spacing scale.
- **Dark-mode rule:** widgets branch on `Theme.of(context).brightness`; avoid
  hardcoded `Colors.white/black` except intentionally (e.g. on navy headers).
- **Shared widgets** (`shared/widgets/`):

| Widget | Purpose |
|---|---|
| `main_scaffold.dart` | Bottom-nav shell (Home · Trips · History · Report · More); sets themed system nav bar |
| `entity_list_scaffold.dart` | Reusable list screen with search/loading/empty/error/retry (resources) |
| `stat_card.dart` | Dashboard stat tile |
| `trip_card.dart` | Trip row/card |
| `status_badge.dart` | Coloured status pill |
| `count_up_text.dart` | Animated number count-up |
| `animated_progress_bar.dart`, `liquid_progress.dart` | Progress visuals |
| `fade_slide_in.dart`, `scale_tap.dart` | Entrance animation + tap scale |
| `announcement_banner.dart` | Inline banner |

---

## 9. Navigation (go_router)

Configured in **`app.dart`** via `routerProvider`. A `redirect` guard enforces
auth: unauthenticated users are sent to `/login`; authenticated users on
`/login` are sent to `/dashboard`. Most routes live inside a `ShellRoute`
(`MainScaffold`) with a shared bottom nav and page transitions.

| Route | Screen |
|---|---|
| `/login` | Login |
| `/dashboard` | Dashboard (Home tab) |
| `/trips` | Active trips (Trips tab) |
| `/history` | Trip history (History tab) |
| `/attendance/report` | Attendance report (Report tab) |
| `/more` | More hub (More tab) |
| `/alerts` | Edit-approval requests |
| `/fleet` | Fleet list |
| `/maintenance` | Maintenance records |
| `/pl-summary` | P&L summary |
| `/attendance` · `/attendance/drivers` | Staff / driver attendance |
| `/customers` · `/vendors` · `/drivers` · `/staff` | Resource lists |
| `/security` | Audit log / lockouts (Admin) |
| `/trips/sheet-tracking` | Trip-sheet tracking |

---

## 10. Security (summary)

Full detail in **[SECURITY.md](SECURITY.md)**. Controls, all centrally toggled in
`core/security/security_config.dart` (default ON):

- **CA-level TLS certificate pinning** (survives leaf renewals).
- **Hardened secure storage** (Android EncryptedSharedPreferences / iOS Keychain).
- **Proactive JWT expiry** + reactive 401/403 session kill; **Admin-only login**.
- **Root/jailbreak block** (fail-closed) via `SecurityGate`.
- **Biometric / device-credential app lock**, re-locks on background.
- **Screenshot / recording / app-switcher protection** — native (Android
  `FLAG_SECURE` in `MainActivity.kt`, iOS privacy cover in `SceneDelegate.swift`).
- **Cleartext HTTP blocked**, backups disabled, **R8 + Dart obfuscation** for release.

---

## 11. Build & run

### Prerequisites
- Flutter 3.44.x (stable), Android SDK, Xcode (for iOS).

### Development
```bash
flutter pub get
flutter run                 # debug, on a connected device
flutter analyze lib/        # static analysis (should be clean)
```
> To take screenshots during development, comment out the `FLAG_SECURE` block in
> `android/app/src/main/kotlin/.../MainActivity.kt`.

### Android release signing

Release builds are signed with a production keystore, wired through a
**git-ignored** `android/key.properties`:

```
android/
├── key.properties            # git-ignored — holds keystore passwords/alias
├── key.properties.example    # committed template (placeholders only)
└── app/
    └── canaan-release.jks     # git-ignored — the keystore itself
```

- `android/app/build.gradle.kts` loads `key.properties`; if present it signs the
  `release` build type with the `release` signing config, otherwise it falls back
  to debug signing (so fresh checkouts / CI without secrets still build).
- **Certificate:** `CN=Canaan, O=Canaan, L=Tuticorin, ST=Tamil Nadu, C=India`.
- `key.properties` format — see `android/key.properties.example`:
  ```properties
  storePassword=********
  keyPassword=********
  keyAlias=canaan
  storeFile=canaan-release.jks
  ```
- ⚠️ **Back up `canaan-release.jks` + its password permanently.** Losing the
  keystore means you can never publish an update to the same Play Store listing.
- To rotate the keystore password: `keytool -storepasswd -keystore canaan-release.jks`
  then update `key.properties`.

### Release builds (obfuscated)
```bash
# Android APK (direct install / sideload)
flutter build apk --release --obfuscate --split-debug-info=build/symbols

# Android App Bundle (Play Store upload)
flutter build appbundle --release --obfuscate --split-debug-info=build/symbols

# iOS
flutter build ipa --release --obfuscate --split-debug-info=build/symbols
```

**Output artifact locations** (under the project root, `build/` is git-ignored):

| Artifact | Path |
|---|---|
| **Signed APK (deliverable)** | `build/app/outputs/apk/release/canaan.apk` |
| Flutter's copy of the APK (fixed name) | `build/app/outputs/flutter-apk/app-release.apk` |
| Signed App Bundle (Play Store) | `build/app/outputs/bundle/release/app-release.aab` |
| iOS archive/IPA | `build/ios/ipa/*.ipa` |
| De-obfuscation symbols | `build/symbols/` |

> The APK is renamed to `canaan.apk` via an `applicationVariants` output rule in
> `android/app/build.gradle.kts`. Flutter additionally copies the artifact to
> `flutter-apk/app-release.apk` with a fixed name it controls — use the
> `apk/release/canaan.apk` path as the distributable.

- Keep `build/symbols/` to de-obfuscate crash reports (matched to that build).
- Verify the APK is signed with the production cert (not debug):
  ```bash
  ~/Library/Android/sdk/build-tools/<ver>/apksigner verify --print-certs \
    build/app/outputs/flutter-apk/app-release.apk
  ```
  `Signer #1 certificate DN` should read `CN=Canaan …`.

### Configuration knobs
- **Backend URL:** `core/api/api_client.dart` (`kBaseUrl`, `kWsUrl`).
- **Security toggles / CA pins:** `core/security/security_config.dart`.
- **Theme default:** `core/theme/theme_provider.dart`.

### Notes
- `core/api/endpoints.dart` is a legacy helper not used by the app (providers call
  `buildApiClient()` directly); safe to remove in a future cleanup.
- **KGP build warning:** `safe_device` applies its own Kotlin Gradle Plugin,
  which prints a forward-compatibility warning. It builds fine today
  (`android.builtInKotlin=false`). See §13.

---

## 12. Production readiness checklist

**🔴 Blockers — required before store submission**
- [x] **Android release signing keystore** — configured via git-ignored
      `key.properties` + `canaan-release.jks`; APK verified signed with the
      production cert (`CN=Canaan …`, APK Signature Scheme v2). See §11.
- [ ] **iOS distribution signing** — configure the distribution certificate /
      provisioning profile in Xcode before an App Store / TestFlight build.
- [x] **Application ID / bundle ID** — set to `com.canaanglobal.erp` on Android
      (`namespace` + `applicationId` + `MainActivity.kt` package) and iOS
      (`PRODUCT_BUNDLE_IDENTIFIER`).

**🟡 Verify on real hardware (cannot be checked in emulator/analyzer)**
- [x] A `--release --obfuscate` APK builds and is signed with the production cert.
- [ ] Certificate pinning rejects an intercepting proxy (SECURITY.md §8).
- [ ] Biometric lock prompts on cold start & resume; PIN fallback works.
- [ ] Root-block screen appears on a rooted/jailbroken device.
- [ ] Installed release APK launches and reaches login on a real device.

**🟢 Recommended**
- [ ] Backend: invalidate existing JWTs on password change/reset (so a password
      change kicks other devices immediately — see SECURITY.md discussion).
- [ ] Confirm the issued JWT's `exp` matches the intended session length (e.g. 12h).
- [ ] Add crash reporting (e.g. Sentry/Crashlytics) for production diagnostics.

**✅ Already done**
- [x] Security layer (pinning, lock, integrity, hardened storage, obfuscation config).
- [x] Session handling (proactive + reactive expiry, admin-only).
- [x] Cleartext blocked, backups disabled.
- [x] Dark-mode, loading/empty/error states, `flutter analyze` clean.
- [x] Application ID `com.canaanglobal.erp`; Android release signing configured.
- [x] Signed, obfuscated release APK produced and cert-verified.

---

## 13. Troubleshooting

| Symptom | Cause / Fix |
|---|---|
| `Namespace not specified` on a plugin | Old plugin incompatible with AGP 8. Replace with a maintained equivalent (this is why `flutter_jailbreak_detection` → `safe_device`). |
| `cannot find symbol …Plugin` for a plugin | Plugin incompatible with Gradle 9 / built-in Kotlin. Prefer a native implementation (this is why screenshot protection is native, not `screen_protector`). |
| `WARNING: … restricted method … System::load` | Gradle 9 on a newer JDK. Silenced via `--enable-native-access=ALL-UNNAMED` in `android/gradle.properties`. Harmless. |
| KGP warning for `safe_device` | Forward-compatibility warning; builds fine today. Swap the plugin only if a future Flutter build actually fails on it. |
| R8: `Missing class com.google.android.play.core.**` on release build | Flutter references Play Core (deferred components) which isn't bundled. Fixed with `-dontwarn com.google.android.play.core.**` in `proguard-rules.pro`. |
| Release build not signed with your key | Ensure `android/key.properties` exists and points to `canaan-release.jks`; verify with `apksigner verify --print-certs`. |
| Biometric prompt never appears | `MainActivity` must extend `FlutterFragmentActivity` (it does); device must have a lock/biometric enrolled. |
| All API calls fail after a cert change | Backend CA changed — refresh pins/PEM in `security_config.dart` (SECURITY.md §1). |

---

*Last updated for app version 1.0.0+1.*
