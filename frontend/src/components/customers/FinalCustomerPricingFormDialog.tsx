"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Field, inputClass } from "@/components/ui/Field";
import { GlassCombobox } from "@/components/ui/GlassCombobox";
import { customersApi } from "@/lib/api";
import type { Customer } from "@/types/customer";
import type { CustomerPricing } from "@/types/customer-pricing";
import type { CustomerDestination } from "@/types/customer-destination";
import type { FinalCustomerPricing } from "@/types/final-customer-pricing";
import { RouteDiagram } from "./RouteDiagram";

type Props = {
  open: boolean;
  onClose: () => void;
  onSave: (customerId: string, data: { customerDestinationId: string; customerDestination: string; actualHireAmount: string | null; accountsHireAmount: string | null }) => Promise<void>;
  initialData?: FinalCustomerPricing | null;
  customers: Customer[];
};

type RouteOption = {
  destinationId: string;
  label: string;
  rate: string;
  destination?: CustomerDestination;
};

export function FinalCustomerPricingFormDialog({ open, onClose, onSave, initialData, customers }: Props) {
  const [customerId, setCustomerId] = useState("");
  const [actualHireAmount, setActualHireAmount] = useState("");
  const [accountsHireAmount, setAccountsHireAmount] = useState("");
  // The actual match key — a specific CustomerDestination id. selectedRoute
  // stays as the display label (also what gets sent as customer_destination
  // for the snapshot/legacy text), but selection and duplicate-blocking are
  // both keyed by id so two routes sharing identical address text (different
  // container type, say) are correctly treated as distinct.
  const [selectedDestinationId, setSelectedDestinationId] = useState("");
  const [selectedRoute, setSelectedRoute] = useState("");
  const [customerPricing, setCustomerPricing] = useState<CustomerPricing[]>([]);
  const [destinations, setDestinations] = useState<CustomerDestination[]>([]);
  // Every route that already has a final price for this customer — used to
  // block picking the same route twice (that's the bug this dialog exists to
  // prevent). Excludes the entry being edited so its own route stays pickable.
  const [existingFinalPricing, setExistingFinalPricing] = useState<FinalCustomerPricing[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (initialData) {
      setCustomerId(initialData.customerId);
      setActualHireAmount(initialData.actualHireAmount ?? "");
      setAccountsHireAmount(initialData.accountsHireAmount ?? "");
      setSelectedRoute(initialData.customerDestination ?? "");
      setSelectedDestinationId(initialData.customerDestinationId ?? "");
      Promise.all([
        customersApi.listPricing(initialData.customerId),
        customersApi.listDestinations(initialData.customerId),
        customersApi.listFinalPricing(initialData.customerId),
      ]).then(([pricing, dests, finalPricing]) => {
        setCustomerPricing(pricing);
        setDestinations(dests);
        setExistingFinalPricing(finalPricing.filter((fp) => fp.id !== initialData.id));
      }).catch(() => {});
    } else {
      setCustomerId("");
      setActualHireAmount("");
      setAccountsHireAmount("");
      setSelectedRoute("");
      setSelectedDestinationId("");
      setCustomerPricing([]);
      setDestinations([]);
      setExistingFinalPricing([]);
    }
  }, [open, initialData]);

  function handleCustomerChange(id: string) {
    setCustomerId(id);
    setActualHireAmount("");
    setSelectedRoute("");
    setSelectedDestinationId("");
    setCustomerPricing([]);
    setDestinations([]);
    setExistingFinalPricing([]);
    if (!id) return;
    customersApi.listPricing(id).then(setCustomerPricing).catch(() => {});
    customersApi.listDestinations(id).then(setDestinations).catch(() => {});
    customersApi.listFinalPricing(id).then(setExistingFinalPricing).catch(() => {});
  }

  function selectRoute(opt: RouteOption, alreadyPriced: boolean) {
    if (alreadyPriced || !!initialData) return;
    setSelectedRoute(opt.label);
    setSelectedDestinationId(opt.destinationId);
    setActualHireAmount(opt.rate);
  }

  // Resolving a legacy row (created before final pricing linked to a
  // specific destination id) — pick which destination it actually belongs
  // to. Unlike selectRoute above, this only ever runs in edit mode on a row
  // that has no link yet, and never touches Actual Hire Amount (already
  // saved on the row; the route link is the only thing being fixed).
  function resolveLegacyRoute(destinationId: string, label: string) {
    setSelectedRoute(label);
    setSelectedDestinationId(destinationId);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerId || !selectedRoute || !selectedDestinationId) return;
    setSaving(true);
    try {
      await onSave(customerId, {
        customerDestinationId: selectedDestinationId,
        customerDestination: selectedRoute,
        actualHireAmount: actualHireAmount || null,
        accountsHireAmount: accountsHireAmount || null,
      });
    } finally {
      setSaving(false);
    }
  }

  const customerOptions = customers.map((c) => ({ value: c.id, label: c.name }));

  // Destination ids that already have a final price for this customer — used
  // to block picking the same route twice (that's the bug this dialog exists
  // to prevent). Keyed by id, not label, so two routes sharing identical
  // address text are correctly treated as distinct.
  const pricedRouteDestinationIds = useMemo(
    () => new Set(existingFinalPricing.map((fp) => fp.customerDestinationId).filter((d): d is string => !!d)),
    [existingFinalPricing]
  );

  // Every route that has a Hire Amount configured via Customer Pricing —
  // enriched with its destination record so the route diagram can render,
  // matched by the pricing row's own destination id.
  const routeOptions: RouteOption[] = useMemo(
    () =>
      customerPricing
        .filter((p) => p.customerDestinationId && p.customerDestination && p.rate)
        .map((p) => ({
          destinationId: p.customerDestinationId as string,
          label: p.customerDestination,
          rate: p.rate,
          destination: destinations.find((d) => d.id === p.customerDestinationId),
        })),
    [customerPricing, destinations]
  );

  // Customer Pricing has rows priced but not yet linked to a route id — the
  // reason a route might be missing from routeOptions above isn't always
  // "no price set", so the empty state can say the right thing.
  const hasUnlinkedCustomerPricing = useMemo(
    () => customerPricing.some((p) => !p.customerDestinationId && !!p.rate && String(p.rate).trim() !== ""),
    [customerPricing]
  );

  // Legacy final-pricing rows for this customer that were never linked to a
  // destination id — invisible to pricedRouteDestinationIds above, so surface
  // them as a warning instead of silently risking a duplicate final price.
  const unlinkedLegacyFinalPricing = useMemo(() => {
    if (initialData) return [];
    return existingFinalPricing.filter((fp) => !fp.customerDestinationId);
  }, [existingFinalPricing, initialData]);

  // The route this final price is linked to — locked once created, shown
  // read-only rather than as a "pick one of these disabled cards" grid.
  const linkedDestination = useMemo(() => {
    if (!initialData?.customerDestinationId) return null;
    return destinations.find((d) => d.id === initialData.customerDestinationId) ?? null;
  }, [destinations, initialData]);

  // Editing a legacy row with no link yet: narrow candidates to destinations
  // whose label actually matches the row's old text — the real ambiguous
  // set — pulled directly from Destinations rather than routeOptions, since
  // the matching Customer Pricing row might itself still be unlinked.
  const legacyCandidateRoutes = useMemo(() => {
    if (!initialData || initialData.customerDestinationId) return [];
    const label = (initialData.customerDestination ?? "").trim().toLowerCase();
    if (!label) return [];
    return destinations.filter((d) => {
      if (pricedRouteDestinationIds.has(d.id)) return false;
      const dLabel = (d.destinationName ?? d.destinationAddress ?? "").trim().toLowerCase();
      return dLabel === label;
    });
  }, [destinations, initialData, pricedRouteDestinationIds]);

  return (
    <Dialog open={open} onClose={onClose} title={initialData ? "Edit Final Pricing" : "Add Final Customer Pricing"} className="max-w-2xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5 p-1">

        <Field label="Customer Name" required>
          <GlassCombobox
            value={customerId}
            onChange={handleCustomerChange}
            options={customerOptions}
            placeholder="Search customer…"
            disabled={!!initialData}
          />
        </Field>

        {initialData ? (
          linkedDestination ? (
            // Route is locked once a final price is created — shown
            // read-only, not as a grid of every-other-card-disabled options.
            <Field label="Route">
              <p className="mb-2 block text-xs text-gray-400">
                The route is locked once a final price is created — delete and re-add to change it.
              </p>
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <RouteDiagram
                  compact
                  originState={linkedDestination.originState}
                  originAddress={linkedDestination.originAddress}
                  destinationState={linkedDestination.destinationState}
                  destinationAddress={linkedDestination.destinationAddress}
                  approxDistanceKm={linkedDestination.approxDistanceKm}
                />
              </div>
            </Field>
          ) : (
            // Legacy row created before final pricing linked to a specific
            // destination id — its old text label matched more than one
            // route, so pick which one this entry actually belongs to.
            <Field label="Confirm Route" required>
              <p className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                This final price predates route linking and matches more than one destination named
                &quot;{initialData.customerDestination}&quot;. Pick which route it&apos;s actually for.
              </p>
              {legacyCandidateRoutes.length === 0 ? (
                <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-center text-xs text-gray-400">
                  No matching destinations found — the original route may have been deleted.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 max-h-[24rem] overflow-y-auto p-1">
                  {legacyCandidateRoutes.map((d) => {
                    const label = d.destinationName ?? d.destinationAddress ?? "";
                    const selected = selectedDestinationId === d.id;
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => resolveLegacyRoute(d.id, label)}
                        className={[
                          "flex flex-col rounded-2xl border p-4 text-left shadow-sm transition-all duration-200",
                          selected
                            ? "border-blue-500 bg-blue-50/60 ring-2 ring-blue-500/30 shadow-md"
                            : "border-gray-200 bg-white hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50/20 hover:shadow-md",
                        ].join(" ")}
                      >
                        <RouteDiagram
                          compact
                          originState={d.originState}
                          originAddress={d.originAddress}
                          destinationState={d.destinationState}
                          destinationAddress={d.destinationAddress}
                          approxDistanceKm={d.approxDistanceKm}
                        />
                        {selected && (
                          <span className="mt-3 self-end text-[11px] font-semibold text-blue-600">Selected</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </Field>
          )
        ) : (
          <Field label="Available Routes" required>
            <span className="mb-2 block text-xs text-gray-400">
              Routes with a Hire Amount configured in Customer Pricing. Select one to auto-fill Actual Hire Amount below. A route already carrying a final price can&apos;t be picked again.
            </span>
            {unlinkedLegacyFinalPricing.length > 0 && (
              <p className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                {unlinkedLegacyFinalPricing.length} existing final {unlinkedLegacyFinalPricing.length === 1 ? "price" : "prices"} for
                this customer ({unlinkedLegacyFinalPricing.map((fp) => `"${fp.customerDestination}"`).join(", ")}) {unlinkedLegacyFinalPricing.length === 1 ? "hasn't" : "haven't"} been
                matched to a specific route yet. Edit {unlinkedLegacyFinalPricing.length === 1 ? "it" : "them"} first to confirm
                the route before adding a new final price here, to avoid creating a duplicate.
              </p>
            )}
            {!customerId ? (
              <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-center text-xs text-gray-400">
                Select a customer first
              </p>
            ) : routeOptions.length === 0 ? (
              <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-center text-xs text-gray-400">
                {hasUnlinkedCustomerPricing
                  ? "This customer's Customer Pricing entries haven't been matched to a specific route yet — edit them in Customer Pricing first."
                  : "No priced routes for this customer yet — add one in Customer Pricing"}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 max-h-[24rem] overflow-y-auto p-1">
                {routeOptions.map((opt) => {
                  const selected = selectedDestinationId === opt.destinationId;
                  const alreadyPriced = pricedRouteDestinationIds.has(opt.destinationId);
                  const disabled = alreadyPriced;
                  return (
                    <button
                      key={opt.destinationId}
                      type="button"
                      onClick={() => selectRoute(opt, alreadyPriced)}
                      disabled={disabled}
                      className={[
                        "flex flex-col rounded-2xl border p-4 text-left shadow-sm transition-all duration-200",
                        disabled ? "cursor-not-allowed opacity-50" : "",
                        selected
                          ? "border-blue-500 bg-blue-50/60 ring-2 ring-blue-500/30 shadow-md"
                          : disabled
                            ? "border-gray-200 bg-gray-50"
                            : "border-gray-200 bg-white hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50/20 hover:shadow-md",
                      ].join(" ")}
                    >
                      {opt.destination ? (
                        <RouteDiagram
                          compact
                          originState={opt.destination.originState}
                          originAddress={opt.destination.originAddress}
                          destinationState={opt.destination.destinationState}
                          destinationAddress={opt.destination.destinationAddress}
                          approxDistanceKm={opt.destination.approxDistanceKm}
                        />
                      ) : (
                        <span className="text-sm font-semibold text-gray-800">{opt.label}</span>
                      )}
                      <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                          ₹{Number(opt.rate).toLocaleString("en-IN")}
                        </span>
                        {selected && (
                          <span className="text-[11px] font-semibold text-blue-600">Selected</span>
                        )}
                        {alreadyPriced && (
                          <span className="text-[11px] font-semibold text-gray-500">Already priced</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </Field>
        )}

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-gray-700">Actual Hire Amount (₹)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={actualHireAmount}
            readOnly
            className={`${inputClass} cursor-not-allowed bg-gray-50 text-gray-600`}
            placeholder="Select a route above to auto-populate"
          />
        </div>

        <Field label="Hire Amount as per Accounts (₹)" required>
          <input
            type="number"
            min="0"
            step="0.01"
            value={accountsHireAmount}
            onChange={(e) => setAccountsHireAmount(e.target.value)}
            onWheel={(e) => e.currentTarget.blur()}
            className={inputClass}
            placeholder="Enter accounts hire amount"
          />
        </Field>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !customerId || !accountsHireAmount || !selectedRoute}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : initialData ? "Save Changes" : "Add Final Pricing"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
