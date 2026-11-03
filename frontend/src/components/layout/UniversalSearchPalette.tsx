"use client";

// The ⌘K search window, loaded on first open (see UniversalSearch.tsx). It
// fetches records only once it's actually used, and only the kinds this
// person can already open from the Sidebar.
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  RiBuilding2Line,
  RiGroupLine,
  RiProfileLine,
  RiRouteLine,
  RiShakeHandsLine,
  RiTruckLine,
  type RemixiconComponentType,
} from "@remixicon/react";
import type { Key } from "react-aria-components";
import { CommandPalette, CommandPaletteItem, CommandPaletteSection } from "@/components/base/command-palette/command-palette";
import { useAuth } from "@/context/AuthContext";
import { visibleSections } from "@/lib/nav-config";
import { ACTIVE_TRIP_STATUSES } from "@/lib/trip-stage";
import { customersApi, driversApi, staffApi, trucksApi, tripsApi, vendorsApi } from "@/lib/api";

/** Records start showing from this many typed characters. */
const MIN_QUERY = 2;
/** Most rows shown per record kind; the page itself has the full list. */
const PER_KIND = 6;

type RecordHit = {
  id: string;
  label: string;
  detail: string;
  /** Everything the query is matched against. */
  haystack: string;
  href: string;
};

type RecordKind = {
  key: string;
  title: string;
  icon: RemixiconComponentType;
  /** The page a result opens; the kind is only searched when this person can open it. */
  hrefs: string[];
  load: () => Promise<RecordHit[]>;
};

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const join = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(" · ");

const KINDS: RecordKind[] = [
  {
    key: "trip",
    title: "Trips",
    icon: RiRouteLine,
    hrefs: ["/trips/current", "/trips/history"],
    load: () =>
      tripsApi.list().then((trips) =>
        trips.map((t) => ({
          id: String(t.id),
          label: t.tripId || t.bookingReferenceNo || "Trip",
          detail: join(t.origin && t.destination ? `${t.origin} → ${t.destination}` : null, t.truckRegistration, t.driverName),
          haystack: norm([t.tripId, t.bookingReferenceNo, t.truckRegistration, t.driverName, t.origin, t.destination].join(" ")),
          href: ACTIVE_TRIP_STATUSES.has(t.status) ? "/trips/current" : "/trips/history",
        })),
      ),
  },
  {
    key: "truck",
    title: "Trucks",
    icon: RiTruckLine,
    hrefs: ["/resources/fleet"],
    load: () =>
      trucksApi.list().then((trucks) =>
        trucks.map((t) => ({
          id: t.id,
          label: t.registrationNumber,
          detail: "",
          haystack: norm(`${t.registrationNumber} ${t.registrationNumber.replace(/\s+/g, "")}`),
          href: "/resources/fleet",
        })),
      ),
  },
  {
    key: "driver",
    title: "Drivers",
    icon: RiProfileLine,
    hrefs: ["/resources/drivers"],
    load: () =>
      driversApi.list().then((drivers) =>
        drivers.map((d) => ({
          id: d.id,
          label: d.name,
          detail: d.contactNumber ?? "",
          haystack: norm(`${d.name} ${d.driverId} ${d.contactNumber ?? ""}`),
          href: "/resources/drivers",
        })),
      ),
  },
  {
    key: "customer",
    title: "Customers",
    icon: RiBuilding2Line,
    hrefs: ["/resources/customers"],
    load: () =>
      customersApi.list().then((customers) =>
        customers.map((c) => ({
          id: c.id,
          label: c.name,
          detail: c.phone ?? "",
          haystack: norm(`${c.name} ${c.gstin ?? ""} ${c.phone ?? ""}`),
          href: "/resources/customers",
        })),
      ),
  },
  {
    key: "staff",
    title: "Staff",
    icon: RiGroupLine,
    hrefs: ["/resources/staff"],
    load: () =>
      staffApi.list().then((staff) =>
        staff.map((s) => ({
          id: s.id,
          label: s.name,
          detail: s.designation ?? "",
          haystack: norm(`${s.name} ${s.staffId} ${s.designation ?? ""} ${s.contactNumber ?? ""}`),
          href: "/resources/staff",
        })),
      ),
  },
  {
    key: "vendor",
    title: "Vendors",
    icon: RiShakeHandsLine,
    hrefs: ["/resources/vendors"],
    load: () =>
      vendorsApi.list().then((vendors) =>
        vendors.map((v) => ({
          id: v.id,
          label: v.name,
          detail: v.category ?? "",
          haystack: norm(`${v.name} ${v.category ?? ""} ${v.gstin ?? ""} ${v.contactNumber ?? ""}`),
          href: "/resources/vendors",
        })),
      ),
  },
];

export default function UniversalSearchPalette({
  open,
  setOpen,
  locked,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  locked?: boolean;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [records, setRecords] = useState<Record<string, RecordHit[]>>({});
  const [loading, setLoading] = useState(false);

  const sections = useMemo(() => visibleSections(user?.softwareDesignation, locked), [user?.softwareDesignation, locked]);
  const allowedHrefs = useMemo(() => new Set(sections.flatMap((s) => s.items.map((i) => i.href))), [sections]);
  const kinds = useMemo(
    () => KINDS.map((k) => ({ ...k, hrefs: k.hrefs.filter((h) => allowedHrefs.has(h)) })).filter((k) => k.hrefs.length > 0),
    [allowedHrefs],
  );

  // Load the record lists the first time the window opens. A list that fails
  // just doesn't appear; pages still search.
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!open || loaded || kinds.length === 0) return;
    setLoaded(true);
    setLoading(true);
    Promise.allSettled(kinds.map((k) => k.load().then((hits) => [k.key, hits] as const)))
      .then((results) => {
        const next: Record<string, RecordHit[]> = {};
        for (const r of results) if (r.status === "fulfilled") next[r.value[0]] = r.value[1];
        setRecords(next);
      })
      .finally(() => setLoading(false));
  }, [open, loaded, kinds]);

  const q = norm(query.trim());
  const pages = sections
    .map((s) => ({ ...s, items: s.items.filter((i) => !q || norm(`${i.label} ${s.title}`).includes(q)) }))
    .filter((s) => s.items.length > 0);
  const recordGroups =
    q.length < MIN_QUERY
      ? []
      : kinds
          .map((k) => ({
            kind: k,
            // A trip opens Current or History; fall back to whichever this person can open.
            hits: (records[k.key] ?? [])
              .filter((h) => h.haystack.includes(q))
              .slice(0, PER_KIND)
              .map((h) => ({ ...h, href: allowedHrefs.has(h.href) ? h.href : k.hrefs[0] })),
          }))
          .filter((g) => g.hits.length > 0);

  const go = (key: Key) => {
    const href = String(key).split("|")[1];
    if (href) router.push(href);
  };

  const empty =
    loading && q.length >= MIN_QUERY ? "Loading records…" : q ? `Nothing matches "${query.trim()}"` : "Type to search";

  return (
    <CommandPalette
      isOpen={open}
      onOpenChange={setOpen}
      shortcut={false}
      aria-label="Search"
      placeholder={locked ? "Search pages" : "Search pages, trips, trucks, drivers, customers…"}
      inputValue={query}
      onInputChange={setQuery}
      filter={null}
      onAction={go}
      emptyState={empty}
    >
      {recordGroups.map(({ kind, hits }) => (
        <CommandPaletteSection key={kind.key} title={kind.title}>
          {hits.map((h) => (
            <CommandPaletteItem
              key={`${kind.key}:${h.id}`}
              id={`${kind.key}:${h.id}|${h.href}`}
              textValue={`${h.label} ${h.detail}`}
              icon={kind.icon}
              description={h.detail || undefined}
            >
              {h.label}
            </CommandPaletteItem>
          ))}
        </CommandPaletteSection>
      ))}
      {pages.map((s) => (
        <CommandPaletteSection key={s.title} title={s.title}>
          {s.items.map((i) => (
            <CommandPaletteItem key={i.href} id={`page:${i.href}|${i.href}`} textValue={i.label} icon={i.icon}>
              {i.label}
            </CommandPaletteItem>
          ))}
        </CommandPaletteSection>
      ))}
    </CommandPalette>
  );
}
