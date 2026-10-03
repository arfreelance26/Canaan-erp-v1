import { sidebarSections } from "@/lib/nav-config";

// Flattened once at module load: every nav href -> its section title (the
// "module" name reported in usage heartbeats). Longest-href-first so a
// sub-path (e.g. "/trips/assign-drivers") never gets shadowed by a shorter
// unrelated prefix.
const HREF_TO_MODULE: { href: string; module: string }[] = sidebarSections
  .flatMap((section) => section.items.map((item) => ({ href: item.href, module: section.title })))
  .sort((a, b) => b.href.length - a.href.length);

/** Best-matching sidebar section title for a given pathname, or "Other" if
 * nothing matches (e.g. "/login"). "/" only matches the Dashboard item
 * itself, not every other route, since every real href starts with "/x". */
export function moduleForPath(pathname: string): string {
  const path = pathname.replace(/\/$/, "") || "/";
  for (const { href, module } of HREF_TO_MODULE) {
    if (href === "/") {
      if (path === "/") return module;
      continue;
    }
    if (path === href || path.startsWith(href + "/")) return module;
  }
  return "Other";
}
