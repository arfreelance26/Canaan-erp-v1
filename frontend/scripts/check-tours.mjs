#!/usr/bin/env node
/**
 * Checks Joshine's guided tours against the code, without starting the app:
 *   npm run check:tours
 *
 * Fails (exit 1), naming the page and step, when:
 *   1. a step's `target` has no matching data-tour="…" anywhere in src/
 *   2. a step's `button`, `click` or action `label` isn't text in that page's files
 *      (the page plus the components it imports, two levels deep)
 *   3. a `selector` like [title="…"] / [aria-label="…"] matches nothing in src/
 *   4. `roles` / `notRoles` names a role that doesn't exist
 *   5. `roles` names a role that can't open the page (a step nobody sees)
 *   6. a sidebar page has no tour, or a tour's page no longer exists
 *   7. a form tour (lib/form-tours.ts) has no <Dialog tour="…"> that opens it
 *
 * The tour files are read as text (they're plain data), so this needs no
 * TypeScript build. Keep step objects on one line, as they are now.
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..", "src");
// Windows line endings would break the line-based matching below.
const read = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|mjs)$/.test(name)) out.push(p);
  }
  return out;
}
const files = walk(SRC);
const allText = new Map(files.map((f) => [f, read(f)]));

// ── What exists in the code ──────────────────────────────────────────────────
const tourIds = new Set();
for (const [file, text] of allText) {
  for (const m of text.matchAll(/data-tour="([^"]+)"/g)) tourIds.add(m[1]);
  // Components that set data-tour from a prop: <FleetStatusPanel> segments
  // ({ tour: "x" }), <SortableGrid tour="x"> and <Dialog tour="x">.
  if (file.endsWith(".tsx")) {
    for (const m of text.matchAll(/\btour: "([^"]+)"/g)) tourIds.add(m[1]);
    for (const m of text.matchAll(/\stour="([^"]+)"/g)) tourIds.add(m[1]);
  }
}

const nav = read(join(SRC, "lib", "nav-config.ts"));
const roleBlock = nav.slice(nav.indexOf("export const ROLE_HREFS"), nav.indexOf("export function getFilteredSections"));
const roleHrefs = { Admin: "all" };
for (const m of roleBlock.matchAll(/\n {2}(?:"([^"]+)"|(\w+)): \[([\s\S]*?)\]/g)) {
  roleHrefs[m[1] ?? m[2]] = [...m[3].matchAll(/"(\/[^"]*)"/g)].map((x) => x[1]);
}
const ROLES = Object.keys(roleHrefs);
// Pages opened from the top bar rather than the sidebar: everyone can open them.
const OPEN_TO_ALL = new Set(["/", "/personal/profile"]);
const canOpen = (role, route) =>
  OPEN_TO_ALL.has(route) || roleHrefs[role] === "all" || (roleHrefs[role] ?? []).includes(route);

const sidebarBlock = nav.slice(0, nav.indexOf("export const ROLE_HREFS"));
const sidebarHrefs = [...sidebarBlock.matchAll(/href: "(\/[^"]*)", icon:/g)].map((m) => m[1]);

// The page file for a route, and the text of it plus what it imports (2 levels).
function pageFile(route) {
  const p = route === "/" ? join(SRC, "app", "page.tsx") : join(SRC, "app", ...route.slice(1).split("/"), "page.tsx");
  return existsSync(p) ? p : null;
}
function resolveImport(spec) {
  if (!spec.startsWith("@/")) return null;
  const base = join(SRC, spec.slice(2));
  for (const ext of [".tsx", ".ts", "/index.tsx", "/index.ts"]) if (existsSync(base + ext)) return base + ext;
  return null;
}
function textWithImports(file, depth = 2, seen = new Set()) {
  if (!file || seen.has(file)) return "";
  seen.add(file);
  const text = allText.get(file) ?? read(file);
  if (depth === 0) return text;
  let out = text;
  for (const m of text.matchAll(/(?:from|import\()\s*["'](@\/[^"']+)["']/g)) {
    out += "\n" + textWithImports(resolveImport(m[1]), depth - 1, seen);
  }
  return out;
}
const squash = (s) => s.replace(/\s+/g, " ").toLowerCase();

// ── Read the tours ───────────────────────────────────────────────────────────
const problems = [];
const fail = (where, msg) => problems.push(`${where}: ${msg}`);
const str = (line, key) => line.match(new RegExp(`\\b${key}: "((?:[^"\\\\]|\\\\.)*)"`))?.[1];
const list = (line, key) => {
  const m = line.match(new RegExp(`\\b${key}: \\[([^\\]]*)\\]`));
  return m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : null;
};

function checkLine(line, where, route, pageText) {
  const target = str(line, "target");
  if (target && !tourIds.has(target)) fail(where, `no data-tour="${target}" in the code`);

  const button = str(line, "button") ?? (/\blabel: "/.test(line) && /\btext: "/.test(line) && !/\btitle: "/.test(line) ? str(line, "label") : null);
  if (button && pageText !== null && !squash(pageText).includes(button.toLowerCase())) {
    fail(where, `button "${button}" isn't in this page's files`);
  }

  // A section heading or field label named by `field` must be in the page.
  const fieldText = str(line, "field");
  if (fieldText && pageText !== null) {
    const esc = fieldText.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!new RegExp(`(?<![a-z])${esc}(?![a-z])`).test(squash(pageText.replace(/&amp;/g, "&")))) fail(where, `heading "${fieldText}" isn't in this page's files`);
  }

  // A step that switches the view first: its tab must be in the page too.
  const click = str(line, "click");
  if (click && pageText !== null && !squash(pageText).includes(click.toLowerCase())) {
    fail(where, `tab "${click}" to switch to isn't in this page's files`);
  }

  const selector = line.match(/\bselector: '([^']*)'/)?.[1] ?? line.match(/\bselector: "([^"]*)"/)?.[1];
  if (selector) {
    for (const m of selector.matchAll(/\[(title|aria-label|data-tour)="([^"]+)"\]/g)) {
      const needle = m[1] === "data-tour" ? `data-tour="${m[2]}"` : m[2];
      const found = [...allText.values()].some((t) => t.includes(needle));
      if (!found) fail(where, `selector ${m[0]} matches nothing in the code`);
    }
  }

  for (const key of ["roles", "notRoles"]) {
    const roles = list(line, key);
    if (!roles) continue;
    for (const r of roles) {
      if (!ROLES.includes(r)) fail(where, `${key} has an unknown role "${r}"`);
      else if (key === "roles" && route && !canOpen(r, route)) fail(where, `role "${r}" can't open ${route}, so nobody sees this step`);
    }
  }
}

// Page tours
const pt = read(join(SRC, "lib", "page-tours.ts"));
const guidesBody = pt.slice(pt.indexOf("export const PAGE_GUIDES"), pt.indexOf("// ── Shared wording"));
const guideRoutes = [];
for (const m of guidesBody.matchAll(/^ {2}"(\/[^"]*)": \{\n([\s\S]*?)^ {2}\},/gm)) {
  const [, route, block] = m;
  guideRoutes.push(route);
  const file = pageFile(route);
  if (!file) {
    fail(route, "the page this tour is for doesn't exist");
    continue;
  }
  const pageText = textWithImports(file);
  block.split("\n").forEach((line, i) => {
    if (/\b(target|button|click|field|selector|roles|notRoles|label): /.test(line)) checkLine(line, `${route} (line ${i + 1} of its guide)`, route, pageText);
  });
}
for (const href of sidebarHrefs) if (!guideRoutes.includes(href)) fail(href, "sidebar page with no tour in lib/page-tours.ts");

// App tour (lib/app-tour.ts): built per role from the menu. Its fixed
// targets must exist; menu links and section headings are tagged by the
// Sidebar itself (nav:/href, nav-section:Title).
const appTour = read(join(SRC, "lib", "app-tour.ts"));
for (const line of appTour.split("\n")) {
  if (/\b(target|roles|notRoles): /.test(line)) checkLine(line, "app tour", null, null);
}
const sidebarSrc = read(join(SRC, "components", "layout", "Sidebar.tsx"));
if (!sidebarSrc.includes("data-tour={`nav:${item.href}`}")) fail("app tour", "the sidebar no longer tags its links (nav:/href)");
if (!sidebarSrc.includes("data-tour={`nav-section:${section.title}`}")) fail("app tour", "the sidebar no longer tags its section headings");

// Every page a role can open needs a description for the app tour.
const guideBlocks = Object.fromEntries(
  [...guidesBody.matchAll(/^ {2}"(\/[^"]*)": \{\n([\s\S]*?)^ {2}\},/gm)].map((m) => [m[1], m[2]]),
);
for (const href of sidebarHrefs) {
  const b = guideBlocks[href];
  if (b && !/\babout: "[^"]/.test(b) && !/\btour: \[/.test(b)) fail(href, "no description for the app tour (about is empty and there's no tour)");
}

// Role notes: real roles, on pages those roles can open.
const notesBody = appTour.slice(appTour.indexOf("const ROLE_NOTES"), appTour.indexOf("/** A page's one-line description"));
const CM_ROLES = ["Commercial Manager", "Assistant Commercial Manager"];
for (const m of notesBody.matchAll(/^ {2}"(\/[^"]*)": \[\n([\s\S]*?)^ {2}\],/gm)) {
  const [, href, block] = m;
  if (!sidebarHrefs.includes(href)) fail(`app tour note ${href}`, "not a page in the menu");
  for (const r of block.matchAll(/roles: (\[[^\]]*\]|CM)/g)) {
    const roles = r[1] === "CM" ? CM_ROLES : [...r[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    for (const role of roles) {
      if (!ROLES.includes(role)) fail(`app tour note ${href}`, `unknown role "${role}"`);
      else if (!canOpen(role, href)) fail(`app tour note ${href}`, `role "${role}" can't open this page, so the note is never heard`);
    }
  }
}

// Form tours
const formPath = join(SRC, "lib", "form-tours.ts");
let formTourCount = 0;
if (existsSync(formPath)) {
  const ft = read(formPath);
  const body = ft.slice(ft.indexOf("export const FORM_TOURS"));
  for (const m of body.matchAll(/^ {2}"([\w-]+)": \{\n([\s\S]*?)^ {2}\},/gm)) {
    const [, id, block] = m;
    formTourCount++;
    // The form that opens it: <Dialog tour="id"> or tour={… "id"}.
    const opener = [...allText.entries()].find(
      ([f, t]) => f.endsWith(".tsx") && (t.includes(`tour="${id}"`) || new RegExp(`tour=\\{[^}]*"${id}"`).test(t)),
    );
    if (!opener) fail(`form tour "${id}"`, `no <Dialog tour="${id}"> opens it`);
    const formText = opener ? squash(textWithImports(opener[0]).replace(/&amp;/g, "&")) : null;
    block.split("\n").forEach((line, i) => {
      const where = `form tour "${id}" (line ${i + 1})`;
      if (/\b(target|selector|roles|notRoles): /.test(line)) checkLine(line, where, null, null);
      const field = str(line, "field");
      const esc = field?.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // Whole words only: "Diesel Entri" must not pass because of "Diesel Entries".
      if (field && formText !== null && !new RegExp(`(?<![a-z])${esc}(?![a-z])`).test(formText)) fail(where, `field "${field}" isn't in the form`);
    });
  }
}

if (problems.length) {
  console.error(`✖ ${problems.length} tour problem${problems.length === 1 ? "" : "s"}:\n`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log(`✓ Tours check out: ${guideRoutes.length} page tours, ${formTourCount} form tours, ${tourIds.size} data-tour tags, ${ROLES.length} roles.`);
