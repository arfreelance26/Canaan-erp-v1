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
| P1 | P&L summary (per-truck & per-trip) |
| P1 | Maintenance records & service history |
| P2 | Staff & driver directory |
| P2 | Truck fleet list |
| P3 | Notifications |

Everything else (invoice generation, reconciliation, tyre management, EMI/compensation) remains web-only for now.

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

 MAINTENANCE
  Maintenance Records
  Compliance & Renewals

 INSIGHTS
  P&L Summary
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

### Screen 7 — P&L Summary

**Route:** `/pl-summary`

**Header:** Date-range picker (from / to, defaults to current month) + optional truck filter.

**Body:**
1. **Totals band** (3 stat cards): Total Revenue • Total Cost • Net P&L (green if positive, red if negative — see semantic colors)
2. **Per-truck list** — each truck card shows revenue, cost, and net P&L with a colored left border (green/red by profitability). Tap → expands per-trip rows.
3. **Per-trip rows** (inside a truck, or via a trip's detail sheet): Hire (revenue) − Expenses = Net, with customer, trip category, and cargo classification shown for context.

**Data source:** `GET /pl-summary?start_date=&end_date=&truck_id=` returns per-truck breakdown with enriched per-trip rows (revenue = trip-sheet hire; cost = trip expenses + maintenance + EMI share + document amortisation). All calculation happens server-side — the app only renders.

**View-only** — no editing of figures on mobile.

---

### Screen 8 — Maintenance Records

**Route:** `/maintenance`

**Header:** Search bar + truck filter chips.

**Body:** Scrollable list of maintenance record cards:
```
┌───────────────────────────────────────────┐
│  TN01AB1234           ₹ 12,500            │
│  Brake overhaul  •  Repair                │
│  Vendor: ABC Motors  •  15 Jul 2026       │
│  Odometer: 1,23,456 km                    │
└───────────────────────────────────────────┘
```
- Tap → Maintenance detail bottom sheet (full description, parts, cost breakdown, next-service reminder if any).
- Optional grouping/filter by truck to see a single vehicle's full service history.

**Summary strip (top):** total maintenance spend for the selected period + count of open/pending jobs (from `GET /maintenance/status`).

**Data source:** `GET /maintenance/records` (list), `GET /maintenance/trucks/{truck_id}/status` (per-truck history & next service). **View-only** on mobile.

---

### Screen 9 — Profile / Settings

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

**Library:** [Lucide Icons](https://lucide.dev) — use the `lucide-react-native` package (same icon set as the web `lucide-react`).

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
| `GET /pl-summary?start_date=&end_date=&truck_id=` | Per-truck & per-trip P&L breakdown |
| `GET /maintenance/records` | Maintenance / service records list |
| `GET /maintenance/status` | Maintenance summary (spend, open jobs) |
| `GET /maintenance/trucks/{truck_id}/status` | Per-truck service history & next service |

**WebSocket:** `wss://erpbackend.canaanglobalinternational.com/ws`  
Events: `trip_updated`, `trip_assigned`, `trip_completed` — use for live badge counts and trip status updates.

### API Client Base (`src/api/client.ts`)
```ts
export const BASE_URL = 'https://erpbackend.canaanglobalinternational.com';
export const WS_URL   = 'wss://erpbackend.canaanglobalinternational.com/ws';
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

## 14. React Native Tech Stack

### Framework
- **React Native** via **Expo** (SDK 52+)
- **TypeScript** 5.x
- **Expo Router** (file-based routing, shares mental model with the web's Next.js App Router)

> **Why React Native (not Flutter):** the web app is Next.js 16 / React 19 / TypeScript. React Native reuses the same language, the same TypeScript API models, validation logic, and API-client patterns — so a single developer maintains one ecosystem instead of two.

> **Build note:** this app uses native modules (Firebase). It runs on an **Expo development build / EAS Build**, not Expo Go. Run `npx expo prebuild` to generate the native projects.

### Project Structure
```
app/                         # Expo Router — file-based routes
├── _layout.tsx              # Root layout, providers, theme
├── login.tsx
├── (tabs)/
│   ├── _layout.tsx          # Bottom tab navigator
│   ├── index.tsx            # Dashboard (Home)
│   ├── trips.tsx            # Current Trips
│   ├── history.tsx          # Trip History
│   ├── alerts.tsx           # Notifications / Approvals
│   └── more.tsx             # Nav drawer / full menu
├── trips/[id].tsx           # Trip detail
├── fleet/index.tsx
├── attendance/index.tsx
└── profile.tsx
src/
├── api/                     # axios client, interceptors, endpoints
├── auth/                    # JWT storage, auth context/provider
├── notifications/           # FCM + expo-notifications setup
├── theme/                   # color + typography tokens (light/dark)
├── components/              # StatCard, TripCard, Badge, BottomSheet
├── hooks/                   # useTrips, useDashboard, useApprovals…
└── utils/
```

### Key Packages

| Package | Purpose |
|---|---|
| `expo` | Core framework & tooling |
| `expo-router` | File-based routing + deep-link handling |
| `@react-native-firebase/app` | Firebase initialisation |
| `@react-native-firebase/messaging` | FCM push notifications |
| `expo-notifications` | Foreground banners + Android channels + app badge |
| `axios` | HTTP client (interceptors for JWT auth) |
| `expo-secure-store` | Store JWT token securely |
| `@tanstack/react-query` | Server state, caching, refetch, pull-to-refresh |
| `zustand` | Lightweight client/UI state |
| `react-native-reanimated` | Animations (bottom sheet, card press) |
| `@gorhom/bottom-sheet` | Bottom-sheet detail views (see 7.7) |
| `lucide-react-native` | Icons matching the web Lucide set |
| `@expo-google-fonts/plus-jakarta-sans` | Plus Jakarta Sans font |
| `date-fns` | Date formatting (Indian locale `en-IN`) |
| `react-native-mmkv` | Fast local storage (theme preference, cache) |

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

### 15.2 React Native Setup

#### Step 1 — Firebase Project
1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
2. Add **Android** app (`com.canaanglobalinternational.erp`)
3. Add **iOS** app (`com.canaanglobalinternational.erp`)
4. Download `google-services.json` → place at project root
5. Download `GoogleService-Info.plist` → place at project root

#### Step 2 — Expo Config (`app.json`)
Wire the Firebase files and native modules through Expo config plugins. `expo prebuild` generates the native iOS/Android projects from this — no manual Xcode/Gradle edits needed.

```json
{
  "expo": {
    "plugins": [
      "expo-router",
      "@react-native-firebase/app",
      ["expo-build-properties", { "ios": { "useFrameworks": "static" } }],
      ["expo-notifications", { "icon": "./assets/notification-icon.png" }]
    ],
    "ios": {
      "bundleIdentifier": "com.canaanglobalinternational.erp",
      "googleServicesFile": "./GoogleService-Info.plist",
      "entitlements": { "aps-environment": "production" },
      "infoPlist": { "UIBackgroundModes": ["remote-notification"] }
    },
    "android": {
      "package": "com.canaanglobalinternational.erp",
      "googleServicesFile": "./google-services.json"
    }
  }
}
```

#### Step 3 — iOS Push (APNs)
1. In the Apple Developer portal, create an **APNs Auth Key** (`.p8`).
2. Upload it to Firebase Console → Project Settings → Cloud Messaging → iOS app.
3. The `aps-environment` entitlement above enables Push Notifications; `expo prebuild` applies it. No manual Xcode capability toggling required.

#### Step 4 — React Native Code

**`src/notifications/fcm.ts`**
```ts
import messaging from '@react-native-firebase/messaging';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { api } from '../api/client';

// How foreground notifications are presented
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Background/terminated handler — must be registered at top level (see index.js)
messaging().setBackgroundMessageHandler(async () => {
  // System tray displays the notification automatically; no UI work needed.
});

export async function initFCM() {
  // Request permission (iOS always, Android 13+)
  await messaging().requestPermission();

  // Android channel (matches the high-importance channel used by the backend)
  await Notifications.setNotificationChannelAsync('canaan_erp_high', {
    name: 'Canaan ERP Alerts',
    importance: Notifications.AndroidImportance.HIGH,
  });

  // Foreground: show a local banner (FCM does not display these by default)
  messaging().onMessage(async (message) => {
    const n = message.notification;
    if (!n) return;
    await Notifications.scheduleNotificationAsync({
      content: { title: n.title, body: n.body, data: message.data },
      trigger: null,
    });
  });

  // Background tap: app was in background, user tapped the notification
  messaging().onNotificationOpenedApp((m) => handleDeepLink(m?.data?.deep_link));

  // Terminated tap: app was closed, user tapped the notification
  const initial = await messaging().getInitialMessage();
  if (initial) handleDeepLink(initial.data?.deep_link);

  // Tap on a foreground banner shown via expo-notifications
  Notifications.addNotificationResponseReceivedListener((resp) => {
    handleDeepLink(resp.notification.request.content.data?.deep_link as string);
  });
}

function handleDeepLink(link?: string) {
  if (link) router.push(link);
}

/** Call after login — sends the FCM token to the backend for storage */
export async function registerFcmToken() {
  const token = await messaging().getToken();
  if (!token) return;
  await api.post('/users/me/fcm-token', { fcm_token: token });
  // Refresh if FCM rotates the token
  messaging().onTokenRefresh((newToken) =>
    api.post('/users/me/fcm-token', { fcm_token: newToken }),
  );
}
```

**Call order in the root layout (`app/_layout.tsx`):**
```tsx
import { useEffect } from 'react';
import { initFCM } from '../src/notifications/fcm';

export default function RootLayout() {
  useEffect(() => {
    initFCM();
  }, []);
  // …providers + <Stack /> …
}
```

**Call after successful login:**
```ts
await registerFcmToken();
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

iOS badge number: set locally via `Notifications.setBadgeCountAsync(N)` from `expo-notifications`, and from the backend via `APNSPayload(aps=Aps(badge=N))`.

---

## 16. Out of Scope (Web Only)

These features are intentionally excluded from the mobile app v1:

- Invoice generation
- Trip sheet entry / reconciliation
- Yard supervisor sheet collection
- Tyre management & inventory
- **Creating / editing** maintenance records (mobile is view-only; entry stays on web)
- EMI & compensation management
- Branch / SAC code / expense rate administration
- Excel export / PDF downloads
- LR (Lorry Receipt) generation

> **Note:** P&L summary and maintenance records are **viewable** on mobile (Screens 7 & 8). Only their data-entry/editing flows remain web-only.
