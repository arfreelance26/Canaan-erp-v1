"use client";

import { useEffect, useState } from "react";
import { RiArrowRightLine as ArrowRight, RiLoader4Line as Loader2, RiMapPin2Line as MapPin, RiRouteLine as Route, RiStarLine as Sparkles } from "@remixicon/react";
import { customersApi } from "@/lib/api";
import type { Customer } from "@/types/customer";
import type { CustomerDestination } from "@/types/customer-destination";
import type { CustomerPricing } from "@/types/customer-pricing";
import { GlassCombobox } from "@/components/ui/GlassCombobox";
import { Field } from "@/components/ui/Field";
import { CustomerInsightsPanel } from "@/components/trips/CustomerInsightsPanel";
import { cn } from "@/lib/utils";

/** A customer route's display name — the same label the Assign Trip form
 * fills Destination with (and so passes to Customer Insights). */
function routeLabel(d: CustomerDestination): string {
  return (d.destinationName ?? d.destinationAddress ?? "") || d.destinationState;
}

/** The route's hire rate, matched the way the Assign Trip form does it (by
 * route id; by label only for older pricing rows with no link). */
function routeRate(d: CustomerDestination, pricing: CustomerPricing[]): string {
  const label = d.destinationName ?? d.destinationAddress ?? "";
  const p = pricing.find((x) => (x.customerDestinationId ? x.customerDestinationId === d.id : x.customerDestination === label));
  return p?.rate ?? "";
}

/**
 * Insights → Trip Planner: exactly the Assign Trip form's recommendation system
 * as a page. Same customers, same Available Routes (and the same route chips),
 * and the same CustomerInsightsPanel with the same customer + route + route id
 * the form passes it — so it recommends exactly what the form would.
 */
export default function TripPlannerPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [routes, setRoutes] = useState<CustomerDestination[]>([]);
  const [routesLoading, setRoutesLoading] = useState(false);
  const [routeId, setRouteId] = useState<string | null>(null);
  const [pricing, setPricing] = useState<CustomerPricing[]>([]);

  useEffect(() => {
    customersApi.list().then(setCustomers).catch(() => setCustomers([]));
  }, []);

  useEffect(() => {
    setRouteId(null);
    setRoutes([]);
    setPricing([]);
    if (!customerId) return;
    setRoutesLoading(true);
    customersApi.listPricing(customerId).then(setPricing).catch(() => setPricing([]));
    customersApi.listDestinations(customerId)
      .then((ds) => setRoutes(ds.filter((d) => d.originState && d.destinationState)))
      .catch(() => setRoutes([]))
      .finally(() => setRoutesLoading(false));
  }, [customerId]);

  const route = routes.find((r) => r.id === routeId) ?? null;
  const customer = customers.find((c) => c.id === customerId);

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex items-center gap-3.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-accent-border bg-accent-surface text-accent-text shadow-sm">
          <Route className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-title-1-semibold tracking-tight text-text-primary">Trip Planner</h1>
          <p className="mt-0.5 text-sm text-text-secondary">The Assign Trip form&apos;s recommendations, before a trip is booked</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        {/* Pick a customer and route */}
        <div className="flex flex-col gap-5 rounded-xl border border-separator-border bg-background-primary-default p-5 shadow-sm">
          <div>
            <p className="text-body-semibold text-text-primary">Plan a trip</p>
            <p className="mt-0.5 text-xs text-text-secondary">Pick a customer and one of their routes to see who and what would run it most profitably.</p>
          </div>

          <Field label="Customer">
            <GlassCombobox
              value={customerId}
              onChange={(val) => {
                const byId = customers.find((c) => c.id === val);
                if (byId) { setCustomerId(byId.id); return; }
                const byName = customers.find((c) => c.name.toLowerCase() === val.toLowerCase());
                setCustomerId(byName ? byName.id : "");
              }}
              options={customers.map((c) => ({ value: c.id, label: c.name }))}
              placeholder="Select a customer"
            />
          </Field>

          <Field label="Available Routes">
            {!customerId ? (
              <p className="rounded-xl border border-dashed border-separator-border bg-fill-1 px-4 py-3.5 text-xs text-text-tertiary">Select a customer first.</p>
            ) : routesLoading ? (
              <div className="flex items-center gap-2 py-3 text-xs text-text-tertiary"><Loader2 className="h-4 w-4 animate-spin" /> Loading routes…</div>
            ) : routes.length === 0 ? (
              <div className="flex items-start gap-3 rounded-xl border border-dashed border-separator-border bg-fill-1 px-4 py-3.5">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" />
                <p className="text-xs leading-relaxed text-text-secondary">
                  {customer?.name ?? "This customer"} has no routes yet. Add one under Customer Destinations, then it will appear here.
                </p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2.5 pt-0.5">
                {routes.map((r) => {
                  const selected = r.id === routeId;
                  const rate = routeRate(r, pricing);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setRouteId(selected ? null : r.id)}
                      className={cn(
                        "flex flex-col items-start gap-1.5 rounded-xl border px-3.5 py-2.5 text-left transition duration-150",
                        selected
                          ? "border-accent-border-strong bg-accent-solid text-on-solid shadow-md"
                          : "border-separator-border bg-background-primary-default text-text-primary shadow-sm hover:border-accent-border-strong hover:bg-accent-surface-strong hover:text-accent-text",
                      )}
                    >
                      <span className="flex items-center gap-1.5 text-body-semibold leading-tight">
                        {r.originAddress || r.originState}
                        <ArrowRight className={cn("h-3 w-3", selected ? "text-on-solid/80" : "text-text-tertiary")} />
                        {routeLabel(r)}
                      </span>
                      <span className="flex flex-wrap items-center gap-1.5">
                        {r.cargoClassification && (
                          <span className={cn("rounded-md px-2 py-0.5 text-caption-1-medium", selected ? "bg-accent-solid text-on-solid/80" : "border border-accent-border bg-accent-surface text-accent-text")}>
                            {r.cargoClassification}
                          </span>
                        )}
                        {r.containerType && (
                          <span className={cn("rounded-md px-2 py-0.5 text-caption-1-medium", selected ? "bg-accent-solid text-on-solid/80" : "border border-purple-border bg-purple-surface text-purple-text")}>
                            {r.containerType}
                          </span>
                        )}
                        {rate && (
                          <span className={cn("rounded-md px-2 py-0.5 text-caption-1-semibold", selected ? "bg-accent-solid text-on-solid/80" : "border border-success-border bg-success-surface text-success-text")}>
                            ₹{Number(rate).toLocaleString("en-IN")}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </Field>
        </div>

        {/* Recommendations — the same panel as the Assign Trip form */}
        {customerId && route ? (
          <CustomerInsightsPanel
            customerId={customerId}
            route={routeLabel(route)}
            routeId={route.id}
            className="h-[70vh] shadow-sm"
          />
        ) : (
          <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-separator-border bg-fill-1 p-8 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-background-primary-default text-accent-text shadow-sm ring-1 ring-separator-border">
              <Sparkles className="h-5 w-5" />
            </span>
            <p className="text-body-semibold text-text-secondary">Recommendations appear here</p>
            <p className="max-w-xs text-xs leading-relaxed text-text-tertiary">
              Once you pick a customer and a route, you&apos;ll see their most profitable past trips, the trucks and drivers
              that ran them best, and the fleet&apos;s most cost-effective trucks.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
