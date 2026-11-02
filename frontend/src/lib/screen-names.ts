import { sidebarSections } from "@/lib/nav-config";

// -- Plain-English route names ------------------------------------------------

function normalizePath(p: string): string {
  return p.split("?")[0].replace(/\/+$/, "") || "/";
}

/** Browser page paths → the same names people see in the sidebar. */
const SCREEN_NAMES: Record<string, string> = Object.fromEntries(
  sidebarSections.flatMap((s) => s.items.map((i) => [normalizePath(i.href), i.label])),
);

/** API paths → the area of the app they belong to. */
const API_AREAS: Record<string, string> = {
  trips: "Trips", attendance: "Attendance", resources: "Resources", maintenance: "Maintenance",
  finance: "Finance", insights: "Insights", chat: "Canaan Chat", connect: "Canaan Chat", admin: "Admin",
  personal: "Personal", auth: "Login", files: "Documents", events: "Meetings", "room-summon": "Invites",
  notes: "Notes",
  todos: "To-do",
};

export function areaName(route: string): string {
  const segment = normalizePath(route).split("/").filter(Boolean)[0] ?? "";
  if (API_AREAS[segment]) return API_AREAS[segment];
  if (!segment) return "the app";
  return segment.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function screenName(route: string): string {
  const path = normalizePath(route);
  if (SCREEN_NAMES[path]) return SCREEN_NAMES[path];
  if (path === "/login") return "Login";
  return areaName(path);
}
