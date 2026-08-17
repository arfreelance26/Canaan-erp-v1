# Canaan ERP Mobile — Security Architecture

This document describes the enterprise-grade security controls built into the
Canaan ERP mobile app, how each one works, how to configure/verify it, and the
remaining manual steps required before a production release.

All controls are centrally toggled in
[`lib/core/security/security_config.dart`](lib/core/security/security_config.dart)
and default to **ON**.

---

## 1. Transport security — CA-level certificate pinning

**What it does:** Every HTTPS request is pinned to the exact Certificate
Authority chain that issues the backend's TLS certificate (Let's Encrypt
intermediate `YR1` + `ISRG Root YR`). Any certificate that does not chain to
those anchors is rejected **before any request data is sent** — defeating
man-in-the-middle attacks via rogue CAs, corporate TLS-inspection proxies, or a
CA compromise.

**Why CA-level (not leaf) pinning:** Let's Encrypt leaf certificates rotate
every ~60 days. Pinning the leaf would break the app on every renewal. Pinning
the CA chain survives renewals while still rejecting foreign certificates.

**Implementation:**
- [`lib/core/security/tls_pinning.dart`](lib/core/security/tls_pinning.dart) —
  builds a `SecurityContext(withTrustedRoots: false)` trusting **only** the
  embedded Canaan CA chain, and installs it on the Dio `HttpClient`.
- The pinned PEM chain + SPKI SHA-256 pins live in `security_config.dart`.
- **Android** additionally blocks user-added CAs and all cleartext HTTP via
  [`network_security_config.xml`](android/app/src/main/res/xml/network_security_config.xml).
- **iOS** enforces App Transport Security (`NSAllowsArbitraryLoads = false`).

**Fail-safe:** if the pinned context cannot be built, the app logs a loud
warning and falls back to system trust rather than losing all connectivity.
**Verify pinning is active before shipping** (see §8).

**If the backend changes CA:** refresh the pins/PEM with
```bash
openssl s_client -servername erpbackend.canaanglobalinternational.com \
  -connect erpbackend.canaanglobalinternational.com:443 -showcerts
```

---

## 2. Data-at-rest — hardened secure storage

**What it does:** All secrets (JWT access token, cached user profile) are stored
in OS-backed hardware-encrypted stores; nothing sensitive is written to plain
`SharedPreferences` / `UserDefaults`.

**Implementation:**
[`lib/core/security/secure_store.dart`](lib/core/security/secure_store.dart) —
a single hardened wrapper used everywhere:
- **Android:** `EncryptedSharedPreferences` (AES-256-GCM, key in the Android
  Keystore / StrongBox where available).
- **iOS:** Keychain with `first_unlock_this_device` accessibility — readable
  only after first unlock since boot, and never restored onto a different device.

**Backups disabled:** `allowBackup="false"`, `fullBackupContent="false"` and
strict
[`data_extraction_rules.xml`](android/app/src/main/res/xml/data_extraction_rules.xml)
exclude all app data from cloud backups and device-to-device transfer.

---

## 3. Session security — proactive JWT expiry + reactive revocation

- **Proactive:** on launch, the stored JWT's `exp` claim is checked locally
  ([`lib/core/security/jwt.dart`](lib/core/security/jwt.dart)); an expired token
  is discarded before any authenticated UI renders — no flash of stale data.
- **Reactive:** the Dio error interceptor clears the entire session (token,
  cached profile, API cache) on **401** (token invalid/expired) **or 403** (role
  revoked), then redirects to login.
- **Admin-only:** login is restricted to `Admin` role client-side, and the
  backend enforces it on every request.

---

## 4. Device integrity — root / jailbreak detection (fail-closed)

**What it does:** On cold start the app checks whether the device is rooted
(Android) or jailbroken (iOS). On a compromised device it shows an
un-dismissible **"Security Check Failed"** screen and never renders the app
(fail-closed).

**Implementation:**
- [`lib/core/security/device_integrity.dart`](lib/core/security/device_integrity.dart)
  (uses `safe_device` / RootBeer).
- Enforced by
  [`lib/core/security/security_gate.dart`](lib/core/security/security_gate.dart),
  mounted above the router in `main.dart`.

**Notes:** Detection failures never brick the app (fail-open on the *check
itself*, fail-closed on a *positive result*). Android "developer mode" is
surfaced as a soft signal only and does **not** block.

---

## 5. App lock — biometric / device-credential

**What it does:** When a session exists, the user must pass biometric
(fingerprint / Face ID) or device-credential (PIN / pattern / passcode)
authentication to view app content. The app **re-locks every time it returns
from the background**.

**Implementation:**
- [`lib/core/security/app_lock.dart`](lib/core/security/app_lock.dart)
  (`local_auth`), orchestrated by `security_gate.dart`.
- Android: `MainActivity` extends `FlutterFragmentActivity` and declares
  `USE_BIOMETRIC`. iOS: `NSFaceIDUsageDescription` in `Info.plist`.

**Known limitation:** if the device has **no** lock screen configured at all,
there is nothing to authenticate against and the lock is skipped (the user is
never locked out of their own device).

---

## 6. Screen-capture protection

**What it does:** Blocks screenshots and screen recording, and hides app
content in the app switcher / recent-apps preview — preventing leakage of fleet,
financial and customer data.

**Implementation (native — no third-party plugin):**
- **Android:** `FLAG_SECURE` set in
  [`MainActivity.kt`](android/app/src/main/kotlin/com/example/canaan_mobile_flutter/MainActivity.kt)
  — blocks screenshots, screen recording, and blanks the recents preview.
- **iOS:** a solid privacy cover added over the window on `sceneWillResignActive`
  and removed on `sceneDidBecomeActive` in
  [`SceneDelegate.swift`](ios/Runner/SceneDelegate.swift) — hides content in the
  app switcher. (iOS cannot technically *prevent* a screenshot; the switcher
  snapshot is the real leak vector and is covered.)

> ⚠️ With this enabled you can no longer screenshot the app for support. To
> capture screens during development, comment out the `FLAG_SECURE` call in
> `MainActivity.kt`.

> Implemented natively rather than via the `screen_protector` plugin, which is
> incompatible with the project's Gradle 9 / built-in-Kotlin toolchain.

---

## 7. Build hardening

- **Android R8:** release builds enable `isMinifyEnabled` + `isShrinkResources`
  with [`proguard-rules.pro`](android/app/proguard-rules.pro) — code shrinking
  and obfuscation to raise the reverse-engineering bar.
- **Dart obfuscation:** build with
  ```bash
  flutter build appbundle --release \
    --obfuscate --split-debug-info=build/symbols
  ```
  (keep the `build/symbols` directory to de-obfuscate crash reports).
- **No secrets in code / no debug logging of tokens;** debug banner disabled.

---

## 8. Verifying certificate pinning

On a **debug device**, route traffic through an intercepting proxy (e.g. Burp /
mitmproxy) with its CA installed on the device. With pinning working, **all API
calls must fail** (TLS handshake rejected). If requests succeed, pinning is not
active — investigate the fallback warning logged by `tls_pinning.dart`.

---

## Controls summary

| Control | Status | Toggle | Source |
|---|---|---|---|
| CA certificate pinning | ✅ On | `kEnableTlsPinning` | `tls_pinning.dart` |
| Cleartext HTTP blocked | ✅ On | manifest / plist | `network_security_config.xml`, `Info.plist` |
| Hardened secure storage | ✅ On | always | `secure_store.dart` |
| Backups disabled | ✅ On | manifest | `AndroidManifest.xml`, `data_extraction_rules.xml` |
| Proactive JWT expiry | ✅ On | always | `jwt.dart`, `auth_provider.dart` |
| 401/403 session kill | ✅ On | always | `api_client.dart` |
| Root/jailbreak block | ✅ On (fail-closed) | `kEnableRootDetection` | `device_integrity.dart` |
| Biometric app lock | ✅ On | `kEnableBiometricLock` | `app_lock.dart` |
| Screenshot/recording block | ✅ On | native (comment FLAG_SECURE) | `MainActivity.kt`, `SceneDelegate.swift` |
| R8 + Dart obfuscation | ✅ On | build config | `build.gradle.kts` |

---

## ⚠️ Remaining manual steps before production

These require credentials/decisions only you can provide:

1. **Production signing keystore** — release currently signs with debug keys.
   Generate a keystore and wire a real `signingConfig` in
   `android/app/build.gradle.kts` (keep the keystore out of git). For iOS,
   configure the distribution certificate/profile in Xcode.
2. **Change the application ID** — still the template default
   `com.example.canaan_mobile_flutter`
   (`android/app/build.gradle.kts` + the `MainActivity.kt` package path). Set a
   real identifier, e.g. `com.canaanglobal.erp`, and the matching iOS bundle ID.
3. **Verify pinning** on-device with a proxy (§8) and **verify biometric lock +
   root block** on real hardware — these cannot be validated in an emulator.
4. **Build with Dart obfuscation** (§7) for release artifacts.
