"use client";

import { useEffect, useState, useRef, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Field, inputClass } from "@/components/ui/Field";
import { GlassCombobox } from "@/components/ui/GlassCombobox";
import { GlassSelect } from "@/components/ui/GlassSelect";
import { CARGO_CLASSIFICATION_OPTIONS, CONTAINER_TYPE_OPTIONS, WEIGHT_IN_TONS_OPTIONS } from "@/lib/customer-pricing-data";
import type { Customer } from "@/types/customer";
import type { CustomerDestination } from "@/types/customer-destination";
import { useFormDraft, clearFormDraft } from "@/hooks/useFormDraft";
import { RouteDiagram } from "./RouteDiagram";
import { customersApi, type MapPin, type RouteDistance } from "@/lib/api";
import {
  RiRouteLine as RouteIcon, RiLoader4Line as Loader2, RiErrorWarningLine as Warn,
  RiMapPin2Line as Pin, RiExternalLinkLine as External, RiMap2Line as MapIcon, RiCloseLine as XIcon,
} from "@remixicon/react";
import dynamic from "next/dynamic";

// The map (Leaflet + OpenStreetMap) loads only when Pick on map is pressed.
const RouteMapPicker = dynamic(() => import("./RouteMapPicker").then((m) => m.RouteMapPicker), { ssr: false });

export const DRAFT_KEY = "erp_customer_destination_form_draft";

// Suggested states shown in the Origin State / Destination State dropdown.
// The fields remain free-typeable — these four are quick picks, not a restriction.
const STATE_OPTIONS = ["TAMIL NADU", "ANDHRA PRADESH", "KERALA", "KARNATAKA"];

type CustomerDestinationFormDialogProps = {
  open: boolean;
  onClose: () => void;
  onSave: (destination: CustomerDestination) => void;
  initialData: CustomerDestination | null;
  customers: Customer[];
  destinations: CustomerDestination[];
};

// Fields that define a "route" for a customer — two destinations with the same
// customer and identical values on all of these are the same route and must
// be rejected. Approx Distance is deliberately excluded.
const ROUTE_FIELDS = [
  "originState",
  "originAddress",
  "destinationState",
  "destinationAddress",
  "cargoClassification",
  "containerType",
  "weightInTons",
] as const;

function normalize(v: string | null | undefined) {
  return (v ?? "").trim().toLowerCase();
}

function isSameRoute(a: Omit<CustomerDestination, "id">, b: CustomerDestination) {
  return ROUTE_FIELDS.every((f) => normalize(a[f]) === normalize(b[f]));
}

const emptyForm: Omit<CustomerDestination, "id"> = {
  customerId: "",
  originState: "",
  originAddress: "",
  destinationState: "",
  destinationAddress: "",
  approxDistanceKm: "",
  originLat: null,
  originLon: null,
  destinationLat: null,
  destinationLon: null,
  distanceSource: null,
  cargoClassification: "",
  containerType: "",
  weightInTons: "",
};

export function CustomerDestinationFormDialog({
  open,
  onClose,
  onSave,
  initialData,
  customers,
  destinations,
}: CustomerDestinationFormDialogProps) {
  const [form, setForm] = useState<Omit<CustomerDestination, "id">>(emptyForm);
  const [search, setSearch] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [customerError, setCustomerError] = useState(false);
  const [routeError, setRouteError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  // "Calculate road distance": the truck road km from the map service, with the
  // places it matched (shown so a wrong match is easy to spot).
  const [distance, setDistance] = useState<RouteDistance | null>(null);
  const [distanceFor, setDistanceFor] = useState("");   // the addresses it was worked out for
  const [calculating, setCalculating] = useState(false);
  const [distanceError, setDistanceError] = useState("");
  // Pick on map: both ends pinned exactly — the km is then worked out between the pins.
  const [mapOpen, setMapOpen] = useState(false);
  // Use these pins fills both addresses with the map's names for the pinned spots.
  const [naming, setNaming] = useState<"" | "busy" | "done" | "failed">("");
  const originPin: MapPin | null = form.originLat != null && form.originLon != null ? { lat: form.originLat, lon: form.originLon } : null;
  const destinationPin: MapPin | null = form.destinationLat != null && form.destinationLon != null ? { lat: form.destinationLat, lon: form.destinationLon } : null;
  const pinned = Boolean(originPin && destinationPin);
  const addressKey = pinned
    ? `pins|${originPin!.lat},${originPin!.lon}|${destinationPin!.lat},${destinationPin!.lon}`
    : [form.originAddress, form.originState, form.destinationAddress, form.destinationState]
      .map((v) => (v ?? "").trim().toLowerCase()).join("|");
  const canCalculate = pinned || Boolean((form.originAddress ?? "").trim() && (form.destinationAddress ?? "").trim());
  const stale = distance !== null && distanceFor !== addressKey;

  /** Fill the km from a worked-out distance (one way, rounded), noting where it came from. */
  function applyKm(d: RouteDistance) {
    setForm((prev) => ({ ...prev, approxDistanceKm: String(Math.round(d.km)), distanceSource: d.pinned ? "map" : "address" }));
  }

  async function calculateDistance() {
    setCalculating(true);
    setDistanceError("");
    try {
      const d = await customersApi.routeDistance({
        originAddress: form.originAddress ?? "", originState: form.originState ?? "",
        destinationAddress: form.destinationAddress ?? "", destinationState: form.destinationState ?? "",
        originPin, destinationPin,
      });
      setDistance(d);
      setDistanceFor(addressKey);
      // Only when both places were found exactly (or pinned) — a partial match (just
      // the town) could be well off, so then the user decides (Use this km anyway).
      if (d.sure) applyKm(d);
    } catch (e) {
      setDistance(null);
      setDistanceError(e instanceof Error ? e.message : "Couldn't work out the distance. Enter it by hand.");
    } finally {
      setCalculating(false);
    }
  }

  function confirmPins(r: { origin: MapPin; destination: MapPin; distance: RouteDistance }) {
    setForm((prev) => ({
      ...prev,
      originLat: r.origin.lat, originLon: r.origin.lon,
      destinationLat: r.destination.lat, destinationLon: r.destination.lon,
      approxDistanceKm: String(Math.round(r.distance.km)),
      distanceSource: "map",
    }));
    setDistance(r.distance);
    setDistanceFor(`pins|${r.origin.lat},${r.origin.lon}|${r.destination.lat},${r.destination.lon}`);
    setDistanceError("");
    setMapOpen(false);
    // Both addresses (and states) become the map's names for the pinned spots —
    // the pins decide where the route is. They stay editable (e.g. "AS CFS").
    setNaming("busy");
    customersApi.pinCheck({
      origin: r.origin, destination: r.destination,
      originAddress: "", originState: "", destinationAddress: "", destinationState: "",
    })
      .then((c) => {
        const named = (e: typeof c.origin) => (e.status === "empty" && e.suggestion.name ? e.suggestion : null);
        const o = named(c.origin), d = named(c.destination);
        setForm((prev) => ({
          ...prev,
          ...(o ? { originAddress: o.name, originState: o.state || prev.originState } : {}),
          ...(d ? { destinationAddress: d.name, destinationState: d.state || prev.destinationState } : {}),
        }));
        setNaming(o || d ? "done" : "failed");
      })
      .catch(() => setNaming("failed"));
  }

  function removePins() {
    setForm((prev) => ({
      ...prev, originLat: null, originLon: null, destinationLat: null, destinationLon: null,
      distanceSource: prev.distanceSource === "map" ? null : prev.distanceSource,
    }));
    setDistance(null);
    setDistanceFor("");
    setNaming("");
  }

  useEffect(() => {
    if (open) {
      const { id: _id, ...rest } = initialData ?? { id: "", ...emptyForm };
      setForm(rest);
      const preselected = customers.find((c) => c.id === (initialData?.customerId ?? ""));
      setSearch(preselected?.name ?? "");
      setDropdownOpen(false);
      setCustomerError(false);
      setRouteError(false);
      setDistance(null);
      setDistanceFor("");
      setDistanceError("");
      setMapOpen(false);
      setNaming("");
    }
  }, [open, initialData]);

  useFormDraft(DRAFT_KEY, open && !initialData, form, setForm);

  // Close dropdown on outside click, restore display text to selected customer
  useEffect(() => {
    if (!dropdownOpen) return;
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [dropdownOpen]);

  // When dropdown closes, restore search text to selected customer name
  useEffect(() => {
    if (!dropdownOpen) {
      const selected = customers.find((c) => c.id === form.customerId);
      setSearch(selected?.name ?? "");
    }
  }, [dropdownOpen, form.customerId, customers]);

  function update<K extends keyof Omit<CustomerDestination, "id">>(
    key: K,
    value: Omit<CustomerDestination, "id">[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setRouteError(false);
  }

  const filtered = customers.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()),
  );

  function selectCustomer(customer: Customer) {
    update("customerId", customer.id);
    setSearch(customer.name);
    setDropdownOpen(false);
    setCustomerError(false);
  }

  function handleSearchChange(value: string) {
    setSearch(value);
    setDropdownOpen(true);
    if (!value) update("customerId", "");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.customerId) {
      setCustomerError(true);
      return;
    }
    const duplicate = destinations.some(
      (d) =>
        d.customerId === form.customerId &&
        d.id !== initialData?.id &&
        isSameRoute(form, d),
    );
    if (duplicate) {
      setRouteError(true);
      return;
    }
    onSave({ id: initialData?.id ?? crypto.randomUUID(), ...form });
  }

  return (
    <Dialog tour="destination-form"
      open={open}
      onClose={onClose}
      title={initialData ? "Edit Customer Destination" : "Add Customer Destination"}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Customer Name" required>
          <div ref={containerRef} className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              onFocus={() => setDropdownOpen(true)}
              placeholder="Search customer…"
              autoComplete="off"
              className={[
                inputClass,
                customerError ? "border-danger-border-strong focus:border-danger-solid" : "",
              ].join(" ")}
            />
            {dropdownOpen && (
              <div className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-separator-border bg-background-primary-default shadow-lg">
                {filtered.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-text-tertiary">No customers found</div>
                ) : (
                  filtered.map((customer) => (
                    <button
                      key={customer.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectCustomer(customer)}
                      className={[
                        "w-full px-3 py-2 text-left text-sm transition-colors",
                        form.customerId === customer.id
                          ? "bg-accent-surface font-semibold text-accent-text"
                          : "text-text-primary hover:bg-fill-2",
                      ].join(" ")}
                    >
                      {customer.name}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          {customerError && (
            <p className="mt-1 text-xs text-danger-text">Please select a customer from the list.</p>
          )}
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Route: where from and where to, with Pick on map on the right */}
          <div className="sm:col-span-2">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-accent-surface px-3 py-1.5">
              <p className="text-caption-1-semibold text-accent-text">Route</p>
              <div className="flex flex-wrap items-center gap-2">
                {pinned && (
                  <span className="flex items-center gap-1 rounded-full border border-success-border bg-success-surface px-2.5 py-0.5 text-caption-2-semibold text-success-text">
                    Pinned on map ✓
                    <button type="button" onClick={removePins} title="Remove the pins (use the addresses again)" className="-mr-1 rounded-full p-0.5 hover:bg-success-surface-strong">
                      <XIcon className="h-3.5 w-3.5" />
                    </button>
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setMapOpen(true)}
                  title="Place the origin and destination exactly on a map: the most accurate km"
                  className="flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-success-border bg-success-surface px-3 text-caption-1-semibold text-success-text transition-colors hover:bg-success-surface-strong"
                >
                  <MapIcon className="h-4 w-4" />
                  {pinned ? "Move pins on map" : "Pick on map"}
                </button>
              </div>
            </div>
          </div>

          <Field label="Origin State">
            <GlassCombobox
              value={form.originState ?? ""}
              onChange={(val) => update("originState", val)}
              options={STATE_OPTIONS.map((s) => ({ value: s, label: s }))}
              placeholder="Type or select origin state"
            />
            <span className="mt-1 text-xs text-text-tertiary">
              State the truck departs from — shown in Origin Location dropdown when assigning trips
            </span>
          </Field>

          <Field label="Origin Address">
            <input
              type="text"
              value={form.originAddress ?? ""}
              onChange={(e) => update("originAddress", e.target.value)}
              className={inputClass}
              placeholder="e.g. Chennai Port, Rajaji Salai"
            />
          </Field>

          <Field label="Destination State" required>
            <GlassCombobox
              required
              value={form.destinationState}
              onChange={(val) => update("destinationState", val)}
              options={STATE_OPTIONS.map((s) => ({ value: s, label: s }))}
              placeholder="Type or select destination state"
            />
          </Field>

          <Field label="Destination Address" required>
            <input
              type="text"
              required
              value={form.destinationAddress}
              onChange={(e) => update("destinationAddress", e.target.value)}
              className={inputClass}
              placeholder="e.g. NH 66, Kochi"
            />
          </Field>

          <Field label="Approx Distance (In KM, one way)" className="sm:col-span-2">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="number"
                min="0"
                step="0.1"
                value={form.approxDistanceKm ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, approxDistanceKm: e.target.value, distanceSource: "typed" }))}
                onWheel={(e) => e.currentTarget.blur()}
                className={`${inputClass} w-36 flex-none`}
                placeholder="e.g. 120"
              />
              <button
                type="button"
                onClick={calculateDistance}
                disabled={!canCalculate || calculating}
                title={canCalculate ? "Work out the truck road distance between the two addresses" : "Enter the origin and destination address first"}
                className="flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-accent-border bg-accent-surface px-3 text-caption-1-semibold text-accent-text transition-colors hover:bg-accent-surface-strong disabled:cursor-not-allowed disabled:opacity-50"
              >
                {calculating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RouteIcon className="h-4 w-4" />}
                {calculating ? "Calculating…" : distance ? "Recalculate" : "Calculate road distance"}
              </button>
            </div>
            <span className="mt-1 text-xs text-text-tertiary">
              One way, road km. Used to auto-fill distance when this destination is assigned to a trip.
              {!pinned && " For the most accurate km, pin both ends on the map."}
            </span>
          </Field>

          {/* What the map service found: the km, the two places it matched, anything to check. */}
          {(distance || distanceError) && (
            <div className="sm:col-span-2">
              {distanceError ? (
                <p className="flex items-start gap-2 rounded-lg border border-danger-border bg-danger-surface px-3 py-2 text-xs text-danger-text">
                  <Warn className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {distanceError}
                </p>
              ) : distance && (
                <div className={`flex flex-col gap-2 rounded-xl border px-3.5 py-3 ${stale ? "border-separator-border bg-fill-1 opacity-70" : distance.sure ? "border-accent-border bg-accent-surface/50" : "border-warning-border bg-warning-surface/50"}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-body-semibold text-text-primary">
                      {distance.km.toLocaleString("en-IN")} km
                      <span className="ml-1.5 text-caption-1-regular text-text-secondary">
                        one way, truck road{distance.minutes ? ` · about ${Math.floor(distance.minutes / 60)} h ${distance.minutes % 60} min driving` : ""}
                      </span>
                    </p>
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&origin=${distance.origin.lat},${distance.origin.lon}&destination=${distance.destination.lat},${distance.destination.lon}&travelmode=driving`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-caption-1-semibold text-accent-text hover:underline"
                    >
                      Check on Google Maps <External className="h-3.5 w-3.5" />
                    </a>
                  </div>
                  {[["From", distance.origin], ["To", distance.destination]].map(([label, place]) => {
                    const p = place as RouteDistance["origin"];
                    return (
                      <p key={label as string} className="flex items-start gap-1.5 text-xs text-text-secondary">
                        <Pin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-tertiary" />
                        <span><span className="font-semibold text-text-primary">{label as string}:</span> {p.matched}</span>
                      </p>
                    );
                  })}
                  {distance.warnings.map((w) => (
                    <p key={w} className="flex items-start gap-1.5 text-xs text-warning-text">
                      <Warn className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {w}
                    </p>
                  ))}
                  {/* Addresses filled from the pins (Use these pins) */}
                  {pinned && naming && (
                    <p className={`flex items-start gap-1.5 text-xs ${naming === "failed" ? "text-warning-text" : "text-text-secondary"}`}>
                      {naming === "busy" ? <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" /> : <Pin className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                      {naming === "busy"
                        ? "Filling in the addresses from the pins…"
                        : naming === "done"
                          ? "Origin and Destination Address are filled in from the pins. Edit them if your team uses another name (for example a CFS name)."
                          : "Couldn't get the place names for the pins. Type the addresses yourself."}
                    </p>
                  )}
                  {!stale && !distance.sure && (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => applyKm(distance)}
                        className="rounded-lg border border-warning-border bg-warning-surface px-3 py-1.5 text-caption-1-semibold text-warning-text transition-colors hover:bg-warning-surface-strong"
                      >
                        Use {Math.round(distance.km).toLocaleString("en-IN")} km anyway
                      </button>
                      <span className="text-caption-2-regular text-text-tertiary">or fix the address and calculate again</span>
                    </div>
                  )}
                  <p className="text-caption-2-regular text-text-tertiary">
                    {stale
                      ? "The addresses changed since this was worked out. Calculate again."
                      : distance.sure
                        ? "Filled in above (rounded). Check the matched places are right; if not, use a clearer address or a nearby landmark."
                        : "Not filled in: a place wasn't found exactly, so this km may be off."}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Cargo & container — determines which pricing/rate applies to this destination */}
          <div className="sm:col-span-2">
            <p className="mb-2 text-caption-1-semibold text-success-text bg-success-surface px-3 py-1.5 rounded-lg">
              Cargo &amp; Container
            </p>
          </div>

          <Field label="Cargo Classification">
            <GlassSelect
              value={form.cargoClassification ?? ""}
              onChange={(val) => update("cargoClassification", val as CustomerDestination["cargoClassification"])}
              options={[
                { value: "", label: "Select cargo classification" },
                ...CARGO_CLASSIFICATION_OPTIONS.map((o) => ({ value: o, label: o })),
              ]}
            />
          </Field>

          <Field label="Container Type">
            <GlassSelect
              value={form.containerType ?? ""}
              onChange={(val) => {
                // Open Load's real cargo weight is a precise, freely-typed
                // tonnage entered per trip (Assign Trip → Open Load Hire Type),
                // never one of these fixed bands — so it can't apply here.
                // Clear any previously-picked band rather than silently
                // saving a value that no longer means anything.
                setForm((prev) => ({
                  ...prev,
                  containerType: val as CustomerDestination["containerType"],
                  weightInTons: val === "OPEN LOAD" ? "" : prev.weightInTons,
                }));
                setRouteError(false);
              }}
              options={[
                { value: "", label: "Select container type" },
                ...CONTAINER_TYPE_OPTIONS.map((o) => ({ value: o, label: o })),
              ]}
            />
          </Field>

          {form.containerType !== "OPEN LOAD" && (
          <Field label="Cargo Weight (tons)">
            <GlassSelect
              value={form.weightInTons ?? ""}
              onChange={(val) => update("weightInTons", val as CustomerDestination["weightInTons"])}
              options={[
                { value: "", label: "Select weight range" },
                ...WEIGHT_IN_TONS_OPTIONS.map((o) => ({ value: o, label: o })),
              ]}
            />
          </Field>
          )}
        </div>

        {mapOpen && (
          <RouteMapPicker
            open
            onClose={() => setMapOpen(false)}
            initialOrigin={originPin ?? (distance && !stale ? { lat: distance.origin.lat, lon: distance.origin.lon } : null)}
            initialDestination={destinationPin ?? (distance && !stale ? { lat: distance.destination.lat, lon: distance.destination.lon } : null)}
            originLabel={form.originAddress ?? ""}
            originState={form.originState ?? ""}
            destinationLabel={form.destinationAddress ?? ""}
            destinationState={form.destinationState ?? ""}
            onConfirm={confirmPins}
          />
        )}

        {/* Route Preview — live diagram of origin -> destination, updates as the form is filled */}
        {(form.originAddress ?? "").trim() && (form.destinationAddress ?? "").trim() && (
        <div className="rounded-2xl border border-separator-border bg-fill-1 p-4">
          <p className="mb-3 text-caption-1-semibold text-text-secondary">
            Route Preview
          </p>
          <RouteDiagram
            originState={form.originState}
            originAddress={form.originAddress}
            destinationState={form.destinationState}
            destinationAddress={form.destinationAddress}
            approxDistanceKm={form.approxDistanceKm}
          />
        </div>
        )}

        {routeError && (
          <p className="rounded-lg border border-danger-border bg-danger-surface px-3 py-2 text-xs text-danger-text">
            This exact route (same Origin State, Origin Address, Destination State, Destination
            Address, Cargo Classification, Container Type &amp; Cargo Weight) already exists for
            this customer.
          </p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => { clearFormDraft(DRAFT_KEY); onClose(); }}
            className="btn-interactive rounded-lg border border-separator-border px-4 py-2 text-body-medium text-text-primary transition duration-200 hover:bg-fill-2"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn-interactive rounded-lg bg-accent-solid px-4 py-2 text-body-medium text-on-solid transition duration-200 hover:bg-accent-solid-hover"
          >
            {initialData ? "Save Changes" : "Add Destination"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
