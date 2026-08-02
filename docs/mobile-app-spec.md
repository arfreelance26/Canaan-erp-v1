# Canaan ERP — Admin Mobile App Specification

> This document is the single source of truth for building the admin-only mobile app.
> It is derived from the existing web frontend design system and adapted for mobile.

---

## 1. Scope

The mobile app is **Admin-only**. It surfaces the most time-sensitive admin workflows:

| Priority | Feature |
|---|---|
| P0 | Dashboard KPI cards |
| P0 | Active & current trips |
| P0 | Trip history (view booking sheet) |
| P1 | Attendance overview |
| P1 | Fleet compliance alerts |
| P1 | Edit / delete approval requests |
| P2 | Staff & driver directory |
| P2 | Truck fleet list |
| P3 | Notifications |

Everything else (invoice generation, reconciliation, tyre management, finance) remains web-only for now.

---

## 2. Color Palette

### Brand
| Token | Hex | Usage |
|---|---|---|
| Brand Navy | `#1b2b5e` | Primary brand, headers |
| Brand Gold | `#c9a227` | Accents, highlights |

### Blue Scale (Primary)
| Token | Hex |
|---|---|
| Blue-50 | `#eef0f8` |
| Blue-100 | `#d2d7ef` |
| Blue-200 | `#a5afdf` |
| Blue-500 | `#2b3f9f` |
| Blue-600 | `#1b2b5e` |
| Blue-700 | `#152248` |

### Semantic Colors
| Meaning | Light bg | Light text | Dark bg | Dark text |
|---|---|---|---|---|
| Success / Active | `#d1fae5` | `#065f46` | `#073825` | `#34d399` |
| Warning | `#fef3c7` | `#92400e` | `#2d1a00` | `#fbbf24` |
| Danger / Critical | `#fee2e2` | `#991b1b` | `#2d0e12` | `#f87171` |
| Purple / Invoiced | `#ede9fe` | `#5b21b6` | `#1a0e3a` | `#c084fc` |
| Amber / In-Progress | `#fef9c3` | `#854d0e` | `#2d1a00` | `#fbbf24` |

### Neutrals
**Light mode:** Standard white-to-gray-950 scale  
**Dark mode body:** `#090c14`  
**Dark mode card surface:** `#141929`

---

## 3. Typography

| Role | Size | Weight | Notes |
|---|---|---|---|
| Display / KPI value | 34–40sp | Bold (700) | Dashboard stat numbers |
| Page title | 22sp | Bold (700) | Screen headers |
| Section heading | 16sp | SemiBold (600) | Card titles |
| Body | 14sp | Regular (400) | General text |
| Caption / label | 12sp | SemiBold (600) | Uppercase, letter-spaced |
| Badge | 11sp | SemiBold (600) | Pill text |

**Font family:** Use **Plus Jakarta Sans** (matches the web's `--font-jakarta`). Fallback: system default sans-serif.

**Letter spacing:** Labels and section headings use `+0.5px` to `+1px` tracking (matches `tracking-wider`).

---

## 4. Spacing System

Use an 4px base unit. Common tokens:

| Token | Value | Usage |
|---|---|---|
| xs | 4px | Icon gaps, tight items |
| sm | 8px | Between label and input |
| md | 12px | Internal card padding |
| lg | 16px | Card padding, section gaps |
| xl | 20px | Screen horizontal padding |
| 2xl | 24px | Between major sections |
| 3xl | 32px | Top safe area padding |

---

## 5. Border Radius

| Component | Radius |
|---|---|
| Screen cards | 16px (`rounded-2xl`) |
| Buttons | 10px (`rounded-lg`) |
| Input fields | 10px (`rounded-lg`) |
| Badges / pills | 999px (`rounded-full`) |
| Bottom sheet | 20px top corners only |
| Avatar | 999px (`rounded-full`) |
| Stat cards | 16px |

---

## 6. Elevation & Shadows

**Light mode:**
- Card: `0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)`
- Active/focused card: `0 4px 20px rgba(27,43,94,0.15)`

**Dark mode:**
- Card: `0 0 0 1px rgba(79,126,240,0.08), 0 8px 32px rgba(0,0,0,0.5)`
- Blue glow on focused: `0 0 0 3px rgba(27,43,94,0.3)`

---

## 7. Component Specs

### 7.1 Stat Card

```
┌─────────────────────────────────────┐
│  [Icon]          LABEL (12sp caps)  │
│                                     │
│  VALUE (36sp bold)                  │
│  Caption text (12sp gray)           │
└─────────────────────────────────────┘
```

**Variants & colors:**

| Variant | Background | Text | Icon color |
|---|---|---|---|
| blue | `#eef0f8` | `#1b2b5e` | `#2b3f9f` |
| emerald | `#d1fae5` | `#065f46` | `#059669` |
| amber | `#fef3c7` | `#92400e` | `#d97706` |
| red | `#fee2e2` | `#991b1b` | `#dc2626` |
| purple | `#ede9fe` | `#5b21b6` | `#7c3aed` |
| default | `#f9fafb` | `#374151` | `#6b7280` |

- Tappable cards: show a subtle press state (0.96 scale) and navigate to the relevant screen
- Grid layout: 2 columns on phone, full-width on narrow screens

### 7.2 Badge / Status Pill

```
 ● Assigned       (blue)
 ● On-Transit     (yellow)
 ● Completed      (green)
 ● Cancelled      (red)
 ● Invoiced       (purple)
 ● Loaded         (purple/indigo)
 ● Reached        (teal)
```

Spec: `rounded-full`, `paddingH: 10px`, `paddingV: 3px`, `fontSize: 11sp`, `fontWeight: 600`

### 7.3 Trip Row Card

Each trip in a list is a card (not a flat table row):

```
┌──────────────────────────────────────────┐
│ TRP-1062              [● On-Transit]     │
│ AAAA1234567  •  40FT                    │
│ Chennai Port → Sriperumbudur            │
│ Driver: Rajan  •  Truck: TN01AB1234     │
│ ────────────────────────────────────── │
│  [Booking Sheet]  [Trip Sheet]           │
└──────────────────────────────────────────┘
```

- Left border tinted to match trip status color (4px)
- Bottom action buttons shown only for history; for current trips, a status stepper is shown instead

### 7.4 Bottom Navigation Bar

5 tabs for admin:

| Tab | Icon | Screen |
|---|---|---|
| Home | `LayoutDashboard` | Dashboard |
| Trips | `Route` | Current Trips |
| History | `History` | Trip History |
| Alerts | `Bell` | Notifications / Approvals |
| More | `Menu` | Full nav drawer |

Active tab: Brand navy icon + label, gold underline indicator  
Inactive: Gray icon, no label

### 7.5 Top App Bar

```
┌──────────────────────────────────────────┐
│  ☰   Canaan ERP              🔔  [AU]   │
└──────────────────────────────────────────┘
```

- Hamburger (left) → opens full nav drawer (matches sidebar)
- Title: `Canaan ERP` or current screen name
- Bell icon with red badge count (pending approvals + compliance alerts)
- Avatar → profile dropdown (logout, theme toggle)

### 7.6 Nav Drawer (expanded from More or hamburger)

Groups matching the web sidebar:

```
 OVERVIEW
  Dashboard

 TRIPS
  Current Trips
  Completed Trips
  Trip History
  Edit Approvals  [3]  ← red badge

 ATTENDANCE
  Attendance Report
  Leave Approvals

 RESOURCES
  Our Fleet
  Our Staff
  Our Drivers
  Our Customers

 FINANCE
  Compliance & Renewals
```

Active item: navy bg, white text, bold  
Inactive: gray text, transparent bg

### 7.7 Bottom Sheet (detail view)

Used instead of modals on mobile. Slides up from bottom, rounded top corners (20px), max height 92% of screen, scrollable body.

Header: sticky, title + close (X) button  
Footer: sticky action buttons (Save / Cancel)

### 7.8 Input Fields

```
Label (12sp, gray-700, semibold)
┌────────────────────────────────┐
│  Value text…                   │  ← 14sp, 44px min height
└────────────────────────────────┘
  Helper text (12sp, gray-500)
```

- Border: `1px solid #e5e7eb` (light) / `1px solid #1c2340` (dark)
- Focus border: `#1b2b5e` with glow `rgba(27,43,94,0.15)`
- Background: `#fff` (light) / `#141929` (dark)
- Text converts to UPPERCASE automatically (matching web)

---

## 8. Screen Inventory

### Screen 1 — Dashboard

**Route:** `/` (home tab)

**Sections:**
1. Greeting header (Good morning, Admin)
2. KPI stat cards grid (2-col):
   - Active Trips → `/trips/current`
   - Fleet on Road → `/fleet`
   - Urgent Alerts → `/fleet` (compliance)
   - Present Today → `/attendance/report`
   - Customers → `/customers`
   - Monthly Fixed (display only)
3. Trip pipeline strip (horizontal scroll): Assigned • Started • Loaded • On-Transit • Reached • Unloaded
4. Compliance alert banner (if any expired docs)
5. Pending approvals banner (if edit/delete requests waiting)

---

### Screen 2 — Current Trips

**Route:** `/trips/current`

**Header:** Search bar + status filter chips (All / Assigned / On-Transit / etc.)

**Body:** Scrollable list of Trip Row Cards (see 7.3)  
Each card: tap → Trip Detail bottom sheet

**Trip Detail Sheet:**
- Full trip info (trip ID, container, from/to, driver, truck)
- Status stepper (horizontal): Assigned → Started → Loaded → On-Transit → Reached → Unloaded → Completed
- Hire amount, advance paid
- No edit capability (view-only on mobile for now)

---

### Screen 3 — Trip History

**Route:** `/trips/history`

**Header:** Search bar + status filter chips  
**Filters:** Date range picker (from / to)

**Body:** Scrollable list of Trip Row Cards  
Bottom action row per card:
- **Booking Sheet** → opens bottom sheet with closure data (read-only view matching web BookingSheetDialog)
- **Trip Sheet** → opens bottom sheet if sheet exists
- **Invoice** → opens invoice preview bottom sheet if invoiced

---

### Screen 4 — Notifications / Approvals

**Route:** `/alerts`

**Sections:**
1. Edit Approval Requests (pending)
   - Trip ID, reason, requested by, date
   - **Approve** / **Reject** buttons inline
2. Delete Approval Requests
   - Same pattern
3. Fleet Compliance Alerts
   - Truck ID, document type, expiry date, days remaining
   - Color-coded: red (expired), amber (expiring soon)
4. Trip Sheet Alerts (not entered within 1 day)

---

### Screen 5 — Fleet (Our Fleet)

**Route:** `/fleet`

**Body:** List of truck cards:
```
┌───────────────────────────────────────────┐
│  TN01AB1234        [● Available]          │
│  CGI-T001  •  6+1 tyre  •  Branch name   │
│  Odometer: 1,23,456 km                    │
│  FC: 15 Jan 2027  Insurance: 3 Apr 2026  │
└───────────────────────────────────────────┘
```
Tap → Truck detail screen (compliance docs, maintenance history)

---

### Screen 6 — Attendance Report

**Route:** `/attendance`

**Header:** Date picker (default: today)

**Body:**
- Summary row: Present X / Total Y, Z on leave
- Staff list with presence indicator (green dot = present, gray = absent)
- Leave requests section

---

### Screen 7 — Profile / Settings

**Route:** `/profile` (accessible from avatar in top bar)

**Sections:**
- User info (name, role, email)
- Theme toggle (Light / Dark / System)
- App version
- Logout button

---

## 9. Dark Mode

**Implementation:** System preference by default, overridable in Profile screen. Persisted in local storage.

**Key dark mode rules:**
- Body background: `#090c14` (deep navy-black, NOT gray)
- Card surface: `#141929`
- Borders: Blue-tinted (`#1c2340`), not neutral gray
- Text: inverted scale (gray-950 becomes near-white)
- Accents: vivid saturated versions (emerald-400, amber-400 etc. for text; deep -900 for backgrounds)
- NO flat gray cards — keep the premium navy aesthetic

---

## 10. Iconography

**Library:** [Lucide Icons](https://lucide.dev) — use the React Native or Flutter equivalent package.

Key icons used:

| Icon name | Usage |
|---|---|
| `LayoutDashboard` | Dashboard nav |
| `Route` | Trips nav |
| `History` | Trip history |
| `Bell` | Notifications |
| `Truck` | Fleet |
| `Users` | Staff |
| `IdCard` | Drivers |
| `Building2` | Customers |
| `UserCheck` | Attendance |
| `AlertTriangle` | Compliance alerts |
| `ShieldAlert` | Edit approvals |
| `FileText` | Booking sheet |
| `ClipboardList` | Trip sheet |
| `Receipt` | Invoice |
| `Wallet` | Finance |
| `ChevronRight` | List item arrow |
| `X` | Close sheet/modal |
| `Check` | Approve |
| `LogOut` | Logout |

---

## 11. Animations & Motion

| Element | Animation |
|---|---|
| Screen transition | Slide left/right (standard mobile nav) |
| Bottom sheet | Slide up from bottom, spring easing |
| Card press | Scale down to 0.96, restore on release |
| Badge count update | Bounce scale pulse |
| Status change | Cross-fade color |
| Pull to refresh | Standard spinner |
| Skeleton loader | Shimmer left-to-right (matches web skeleton) |

---

## 12. API Integration

The mobile app hits the **same FastAPI backend** as the web:

**Base URL:** `https://erpbackend.canaanglobalinternational.com`  
**WebSocket Base:** `wss://erpbackend.canaanglobalinternational.com`

**Auth:** JWT token in `Authorization: Bearer <token>` header  
**Login endpoint:** `POST /auth/login`  
**Token refresh:** `POST /auth/refresh`

**Key endpoints for admin mobile:**

| Endpoint | Usage |
|---|---|
| `GET /trips` | Trip list (history + current) |
| `GET /trips/{id}/closure` | Booking sheet data |
| `GET /trips/{id}/sheet` | Trip sheet data |
| `GET /trips/{id}/invoice` | Invoice data |
| `GET /dashboard` | KPI counts |
| `GET /trucks` | Fleet list |
| `GET /staff` | Staff list |
| `GET /drivers` | Driver list |
| `GET /attendance` | Attendance records |
| `GET /edit-approvals` | Pending approval requests |
| `POST /edit-approvals/{id}/approve` | Approve edit request |
| `POST /edit-approvals/{id}/reject` | Reject edit request |

**WebSocket:** `wss://erpbackend.canaanglobalinternational.com/ws`  
Events: `trip_updated`, `trip_assigned`, `trip_completed` — use for live badge counts and trip status updates.

### Flutter API Client Base (`lib/core/api/api_client.dart`)
```dart
const String kBaseUrl = 'https://erpbackend.canaanglobalinternational.com';
const String kWsUrl   = 'wss://erpbackend.canaanglobalinternational.com/ws';
```

---

## 13. Device & Platform Targets

| Platform | Min version |
|---|---|
| iOS | 16+ |
| Android | API 29 (Android 10+) |

**Screen sizes:** Optimised for 390px width (iPhone 15 Pro). Tested at 360px (Android mid-range).

**Orientation:** Portrait only (lock landscape).

**Safe areas:** Respect top notch and bottom home indicator padding on all screens.

---

## 14. Flutter Tech Stack

### Framework
- **Flutter** (stable channel, latest)
- **Dart** 3.x

### Project Structure
```
lib/
├── main.dart
├── app.dart                  # MaterialApp, theme, routing
├── core/
│   ├── api/                  # Dio client, interceptors, endpoints
│   ├── auth/                 # JWT storage, login state
│   ├── notifications/        # FCM setup, local notifications
│   └── theme/                # AppTheme (light + dark)
├── features/
│   ├── dashboard/
│   ├── trips/
│   ├── fleet/
│   ├── attendance/
│   ├── approvals/
│   └── profile/
└── shared/
    ├── widgets/              # StatCard, TripCard, Badge, BottomSheet
    └── utils/
```

### Key Packages

| Package | Purpose |
|---|---|
| `firebase_core` | Firebase initialisation |
| `firebase_messaging` | FCM push notifications |
| `flutter_local_notifications` | Show notifications when app is in foreground |
| `dio` | HTTP client (interceptors for JWT auth) |
| `flutter_secure_storage` | Store JWT token securely |
| `go_router` | Declarative routing + deep link handling |
| `riverpod` / `flutter_bloc` | State management |
| `cached_network_image` | Image caching |
| `intl` | Date formatting (Indian locale `en_IN`) |
| `shimmer` | Skeleton loading effect |
| `lucide_icons` / `material_symbols_icons` | Icons matching web Lucide set |
| `google_fonts` | Plus Jakarta Sans font |

---

## 15. Push Notifications

### Architecture Overview

```
Event on server
    │
    ▼
FastAPI backend
    │  firebase-admin SDK
    ▼
Firebase Cloud Messaging (FCM)
    │
    ├──▶ Android (FCM direct)
    └──▶ iOS (FCM via APNs)
         │
         ▼
    Flutter app (firebase_messaging)
         │
         ├── App in foreground  → flutter_local_notifications (in-app banner)
         ├── App in background  → System tray notification
         └── App terminated     → System tray notification + launch app on tap
```

---

### 15.1 Notification Event Catalogue

| Event | Trigger | Title | Body | Deep link |
|---|---|---|---|---|
| `trip_assigned` | New trip created | 🚛 Trip Assigned | `TRP-XXXX — Chennai Port → Oragadam` | `/trips/current` |
| `trip_completed` | Trip marked Completed | ✅ Trip Completed | `TRP-XXXX completed by [Driver]` | `/trips/history` |
| `edit_approval_requested` | Docs team sends edit request | ⚠️ Edit Approval Needed | `[User] requested edit on TRP-XXXX` | `/alerts` |
| `delete_approval_requested` | Commercial Mgr requests delete | 🗑️ Delete Approval Needed | `[User] requested delete on TRP-XXXX` | `/alerts` |
| `compliance_expiring` | Doc expiry within threshold | 📋 Compliance Alert | `[Truck] [Doc] expires in [N] days` | `/fleet` |
| `compliance_expired` | Doc already expired | 🚨 Compliance Expired | `[Truck] [Doc] is expired` | `/fleet` |
| `leave_requested` | Staff submits leave | 🏖️ Leave Request | `[Staff] requested leave on [date]` | `/attendance` |
| `sheet_not_entered` | Trip sheet not entered in 24h | ⏰ Sheet Pending | `TRP-XXXX sheet not entered for 24h` | `/alerts` |

---

### 15.2 Flutter Setup

#### Step 1 — Firebase Project
1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
2. Add **Android** app (`com.canaanglobalinternational.erp`)
3. Add **iOS** app (`com.canaanglobalinternational.erp`)
4. Download `google-services.json` → place at `android/app/google-services.json`
5. Download `GoogleService-Info.plist` → place at `ios/Runner/GoogleService-Info.plist`

#### Step 2 — Android Config (`android/app/build.gradle`)
```gradle
apply plugin: 'com.google.gms.google-services'

android {
    defaultConfig {
        minSdkVersion 29
    }
}
```

`android/build.gradle`:
```gradle
dependencies {
    classpath 'com.google.gms:google-services:4.4.0'
}
```

#### Step 3 — iOS Config
In Xcode:
1. Enable **Push Notifications** capability
2. Enable **Background Modes** → check `Remote notifications` and `Background fetch`
3. Upload APNs Auth Key (`.p8`) to Firebase Console → Project Settings → Cloud Messaging → iOS app

`ios/Runner/Info.plist` — add:
```xml
<key>FirebaseAppDelegateProxyEnabled</key>
<false/>
```

#### Step 4 — Flutter Code

**`lib/core/notifications/fcm_service.dart`**
```dart
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

@pragma('vm:entry-point')
Future<void> _firebaseBackgroundHandler(RemoteMessage message) async {
  // Handle background messages (app terminated / background)
  // No UI work here — system tray handles display automatically
}

class FCMService {
  static final _messaging = FirebaseMessaging.instance;
  static final _localNotifications = FlutterLocalNotificationsPlugin();

  static Future<void> init() async {
    // Request permission (iOS always, Android 13+)
    await _messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );

    // Background handler must be top-level function
    FirebaseMessaging.onBackgroundMessage(_firebaseBackgroundHandler);

    // Local notification channel (Android)
    const androidChannel = AndroidNotificationChannel(
      'canaan_erp_high', // id
      'Canaan ERP Alerts',
      description: 'Trip, approval, and compliance alerts',
      importance: Importance.high,
    );
    await _localNotifications
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(androidChannel);

    // Initialise local notifications plugin
    await _localNotifications.initialize(
      const InitializationSettings(
        android: AndroidInitializationSettings('@mipmap/ic_launcher'),
        iOS: DarwinInitializationSettings(),
      ),
      onDidReceiveNotificationResponse: _onNotificationTap,
    );

    // Foreground: show local notification banner
    FirebaseMessaging.onMessage.listen((message) {
      final notification = message.notification;
      if (notification == null) return;
      _localNotifications.show(
        notification.hashCode,
        notification.title,
        notification.body,
        NotificationDetails(
          android: AndroidNotificationDetails(
            'canaan_erp_high',
            'Canaan ERP Alerts',
            importance: Importance.high,
            priority: Priority.high,
          ),
        ),
        payload: message.data['deep_link'],
      );
    });

    // Background tap: app was in background, user tapped notification
    FirebaseMessaging.onMessageOpenedApp.listen(_handleDeepLink);

    // Terminated tap: app was closed, user tapped notification
    final initial = await _messaging.getInitialMessage();
    if (initial != null) _handleDeepLink(initial);
  }

  static void _onNotificationTap(NotificationResponse response) {
    if (response.payload != null) {
      // Navigate via GoRouter
      AppRouter.router.push(response.payload!);
    }
  }

  static void _handleDeepLink(RemoteMessage message) {
    final link = message.data['deep_link'];
    if (link != null) AppRouter.router.push(link);
  }

  /// Call after login — sends FCM token to backend for storage
  static Future<void> registerToken(String jwtToken) async {
    final fcmToken = await _messaging.getToken();
    if (fcmToken == null) return;
    await ApiClient.post(
      '/users/me/fcm-token',
      data: {'fcm_token': fcmToken},
      token: jwtToken,
    );
    // Refresh token if FCM rotates it
    _messaging.onTokenRefresh.listen((newToken) {
      ApiClient.post('/users/me/fcm-token', data: {'fcm_token': newToken}, token: jwtToken);
    });
  }
}
```

**Call order in `main.dart`:**
```dart
void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  await FCMService.init();
  runApp(const App());
}
```

**Call after successful login:**
```dart
await FCMService.registerToken(jwtToken);
```

---

### 15.3 Backend Changes (FastAPI)

#### New DB Column
```sql
ALTER TABLE users ADD COLUMN fcm_token VARCHAR(255) NULL;
```

Add to `models.py`:
```python
fcm_token = Column(String(255), nullable=True)
```

#### New Endpoint — Register FCM Token
```python
# routers/auth.py (or users.py)
@router.post("/users/me/fcm-token")
def save_fcm_token(
    payload: schemas.FCMTokenUpdate,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    user = db.query(models.User).filter(models.User.id == current_user.id).first()
    user.fcm_token = payload.fcm_token
    db.commit()
    return {"ok": True}
```

#### FCM Sender Utility
Install: `pip install firebase-admin`

**`backend/fcm.py`:**
```python
import firebase_admin
from firebase_admin import credentials, messaging

_app = None

def _get_app():
    global _app
    if _app is None:
        cred = credentials.Certificate("firebase-service-account.json")
        _app = firebase_admin.initialize_app(cred)
    return _app

def send_push(fcm_token: str, title: str, body: str, deep_link: str = None):
    """Fire-and-forget push. Silently drops if token is invalid."""
    try:
        _get_app()
        message = messaging.Message(
            notification=messaging.Notification(title=title, body=body),
            data={"deep_link": deep_link or ""},
            token=fcm_token,
            android=messaging.AndroidConfig(priority="high"),
            apns=messaging.APNSConfig(
                payload=messaging.APNSPayload(
                    aps=messaging.Aps(sound="default", badge=1)
                )
            ),
        )
        messaging.send(message)
    except Exception:
        pass  # Invalid/expired token — ignore silently
```

#### Wire Push into Existing Events

In `routers/trips.py` — after trip is created (already emits WS event):
```python
from fcm import send_push

# After db.commit() in create_trip:
admin_users = db.query(models.User).filter(
    models.User.role == "Admin",
    models.User.fcm_token.isnot(None)
).all()
for admin in admin_users:
    send_push(
        admin.fcm_token,
        title="🚛 Trip Assigned",
        body=f"{trip.trip_id} — {trip.origin} → {trip.destination}",
        deep_link="/trips/current",
    )
```

Apply the same pattern to:
- Edit approval created → `send_push(..., deep_link="/alerts")`
- Delete approval created → `send_push(..., deep_link="/alerts")`
- Trip completed → `send_push(..., deep_link="/trips/history")`
- Compliance check (scheduled job or on fleet page load) → `send_push(..., deep_link="/fleet")`

---

### 15.4 Notification Payload Contract

Every FCM message must include a `data` field so deep links work in all app states:

```json
{
  "notification": {
    "title": "⚠️ Edit Approval Needed",
    "body": "Latha requested edit on TRP-1085"
  },
  "data": {
    "deep_link": "/alerts",
    "event_type": "edit_approval_requested",
    "trip_id": "TRP-1085"
  }
}
```

---

### 15.5 Notification Badge Count

On the Alerts tab in the bottom nav, show a red badge with the count of:
- Pending edit approvals
- Pending delete approvals

Update badge count:
1. On app resume (call `GET /edit-approvals?status=pending`)
2. On FCM message received (increment badge locally)
3. After approving/rejecting (decrement badge locally + refetch)

iOS badge number: set via `messaging.setForegroundNotificationPresentationOptions` and `APNSPayload(aps=Aps(badge=N))` from backend.

---

## 16. Out of Scope (Web Only)

These features are intentionally excluded from the mobile app v1:

- Invoice generation
- Trip sheet entry / reconciliation
- Yard supervisor sheet collection
- Tyre management & inventory
- EMI & compensation management
- Branch / SAC code / expense rate administration
- Excel export / PDF downloads
- P&L summary
- LR (Lorry Receipt) generation
