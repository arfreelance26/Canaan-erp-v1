# Frontend UI structure

The UI is built on **BoardUI** (primary) + **shadcn/ui** (gaps only), with
anime.js for motion and recoloured unDraw illustrations. The redesign changed
presentation only; behaviour, data flow and APIs are as they were.

## Where things live

| Folder | What | Who writes it |
|---|---|---|
| `src/styles/index.css` | The one stylesheet entry (imported by `app/layout.tsx`) | — |
| `src/styles/globals.css`, `theme.css`, `typography.css` | BoardUI Tailwind setup, semantic tokens, type scale | `npx boardui init` (avoid hand edits) |
| `src/styles/brand.css` | Canaan navy accent, gold highlight, the dark palette, illustration colours (`--illo-*`) | us |
| `src/styles/tones.css` | Status tones: `accent`, `success`, `warning`, `orange`, `danger`, `purple`, `teal`, `gold` × `surface`, `surface-strong`, `border`, `border-strong`, `text`, `text-strong`, `solid`, `solid-hover`; plus `fill-1…4`, `on-solid` | us |
| `src/styles/motion.css`, `components.css` | CSS-only motion helpers; small shared utilities (`seg-track`, `seg-thumb`) | us |
| `src/styles/shadcn.css` | Maps shadcn variables onto BoardUI tokens | us |
| `src/styles/layers.css` | Named z-index layers: `z-overlay`, `z-confirm`, `z-toast` | us |
| `src/styles/legacy.css` | Pre-redesign overrides. **Add nothing**, only delete | — |
| `src/components/base/` | BoardUI primitives (button, input, select, …) | `npx boardui add <name> --yes` |
| `src/components/shadcn/` | shadcn primitives BoardUI free lacks (alert-dialog, chart, sheet, …) | `npx shadcn add <name>` |
| `src/components/feedback/` | App-wide hosts: `Toaster`, `ConfirmHost`, `ProblemCardHost` | us |
| `src/components/illustrations/` | `<Illustration name="…" />` — unDraw scenes recoloured to tokens (`assets.ts` is generated) | us |
| `src/components/dashboard/` | `DashboardHero` (greeting + photo or illustration), `StatCard`, `BirthdayCard` / `SeasonCard` / `FoundingCard` (celebrations, restored from before the redesign), chart cards | us |
| `src/components/trips/RouteLine.tsx` | The trip route line: stage dots from `getRouteStep` in `lib/trip-stage.ts`. Trip stage only | us |
| `src/components/ui/EmptyState.tsx` | Empty, no-results and all-done states with an illustration | us |
| `src/components/layout/UniversalSearch.tsx` | Topbar search (⌘K or "/"): pages from `visibleSections` in `lib/nav-config.ts`, plus trips, trucks, drivers, customers, staff and vendors the role can open. Built on BoardUI `command-palette` | us |
| `src/lib/motion/` | `useEnter`, `useCountUp`, `useCountUpText`, `useRouteLineFill`, and `icon-hover.ts` (app-wide icon hover gestures) — the one place timings live | us |
| `src/components/joshine/` | Joshine, the assistant: `JoshineFace` (body + 14 expressions, blink and cursor-follow), `JoshinePet` (bottom-right corner, mounted in AppShell), `JoshineCreator` (look, size, tours). Data and per-user store in `lib/joshine.ts`. Guided tours: the format and app tour in `lib/tours.ts`, one short guide per page in `lib/page-tours.ts` (a new page = one entry there; shared parts like search, dates, export, tables and pagination are found automatically), run by `joshine-tour.ts` with driver.js, styled in `styles/tour.css` | us |
| `src/components/ui/AnimatedNumber.tsx` | A stat figure that counts up on appearance and on change, keeping its format ("₹1,23,456", "12 / 20") | us |
| `src/components/ui/` | Legacy shared wrappers (`Dialog`, `PillSearch`, …), restyled in place on BoardUI | us |
| `src/components/<module>/` | Feature components (trips, fleet, finance, …) | us |
| `src/lib/feedback/` | `notify`, `confirm`, `prompt` (the only way to message or ask the user) | us |
| `src/utils/cx.ts`, `src/utils/cn.ts` | Class merging (`cx` strings, `cn` conditional); `@/lib/utils` re-exports `cn` | — |

## Rules

1. **Component first.** Look in `components/base`, then `components/shadcn`. If neither has it, install it (BoardUI first). Never hand-build a lookalike.
2. **Tokens only.** Use `text-text-*`, `bg-background-*`, `border-separator-border`, `text-foreground-icon-*` and the `accent-*` ramp. No `bg-white`, `text-gray-*`, `dark:` or hex. Tokens flip with `.dark` on `<html>`, so every screen follows the theme with no extra work.
3. **Type.** Use composite utilities (`text-body-medium`, `text-headline-semibold`, …), not `text-sm font-bold`.
4. **Icons.** Use `@remixicon/react` only.
5. **Feedback.** `import { notify, confirm, prompt } from "@/lib/feedback"`. Never use `alert()`, `window.confirm()` or SweetAlert.
6. **Layers.** Use `z-overlay` / `z-confirm` / `z-toast`, never new `z-[n]` literals.
7. **Status colour.** Use the tone utilities (`bg-success-surface`, `text-danger-text`, `bg-accent-solid` …), never a palette colour. Every tone has a light and a dark value in `tones.css`.
8. **Illustrations.** Empty states use `EmptyState`; never place an illustration on a working screen just for decoration. New unDraw art is recoloured to `--illo-*` before it is added to `assets.ts`.
9. **Motion.** Use the hooks in `@/lib/motion`; never loops, all skipped under reduced motion. Stat figures go through `<AnimatedNumber>`. Icons in buttons and links get a hover gesture automatically (`IconHoverMotion` in the root layout); set `data-icon-motion="ring|spin|nudge|wiggle|off"` to choose or turn it off. Otherwise hover and press stay `transition-colors`.
10. **Loading.** Pages import their dialogs, viewers and drawers with `next/dynamic` (`const XDialog = dynamic(() => import("@/components/…/XDialog").then((m) => m.XDialog))`), so that code loads after the page draws. Anything big that only shows sometimes (celebration decor, Joshine's creator) does the same. DiceBear (`lib/avatar.ts` → `avatar-kit.ts`) and the unDraw art (`Illustration`) load on first use. `app/loading.tsx` is the skeleton shown the moment a page link is clicked.
11. **Enforced.** ESLint's `TOKEN_ONLY_ZONES` (in `eslint.config.mjs`) covers all of `src` (vendored `components/shadcn` excepted) and fails the lint on raw palette colours, `dark:` colour overrides, arbitrary colour values and lucide/SweetAlert imports.
