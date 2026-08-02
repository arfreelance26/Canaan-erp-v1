"use client";

import { useEffect, useState, useRef, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Field, inputClass } from "@/components/ui/Field";
import { GlassCombobox } from "@/components/ui/GlassCombobox";
import type { Customer } from "@/types/customer";
import type { CustomerDestination } from "@/types/customer-destination";
import { useFormDraft, clearFormDraft } from "@/hooks/useFormDraft";
import { customersApi } from "@/lib/api";

export const DRAFT_KEY = "erp_customer_destination_form_draft";

type CustomerDestinationFormDialogProps = {
  open: boolean;
  onClose: () => void;
  onSave: (destination: CustomerDestination) => void;
  initialData: CustomerDestination | null;
  customers: Customer[];
};

const emptyForm: Omit<CustomerDestination, "id"> = {
  customerId: "",
  originState: "",
  originAddress: "",
  destinationState: "",
  destinationAddress: "",
  approxDistanceKm: "",
};

export function CustomerDestinationFormDialog({
  open,
  onClose,
  onSave,
  initialData,
  customers,
}: CustomerDestinationFormDialogProps) {
  const [form, setForm] = useState<Omit<CustomerDestination, "id">>(emptyForm);
  const [search, setSearch] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [customerError, setCustomerError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [originStates, setOriginStates] = useState<string[]>([]);
  const [destinationStates, setDestinationStates] = useState<string[]>([]);

  useEffect(() => {
    customersApi.listDestinationOriginStates().then(setOriginStates).catch(() => {});
    customersApi.listDestinationStates().then(setDestinationStates).catch(() => {});
  }, []);

  useEffect(() => {
    if (open) {
      const { id: _id, ...rest } = initialData ?? { id: "", ...emptyForm };
      setForm(rest);
      const preselected = customers.find((c) => c.id === (initialData?.customerId ?? ""));
      setSearch(preselected?.name ?? "");
      setDropdownOpen(false);
      setCustomerError(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    onSave({ id: initialData?.id ?? crypto.randomUUID(), ...form });
  }

  return (
    <Dialog
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
                customerError ? "border-red-400 focus:border-red-500" : "",
              ].join(" ")}
            />
            {dropdownOpen && (
              <div className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                {filtered.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-gray-400">No customers found</div>
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
                          ? "bg-blue-50 font-semibold text-blue-700"
                          : "text-gray-700 hover:bg-gray-50",
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
            <p className="mt-1 text-xs text-red-500">Please select a customer from the list.</p>
          )}
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Origin section */}
          <div className="sm:col-span-2">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg">
              Origin
            </p>
          </div>

          <Field label="Origin State">
            <GlassCombobox
              value={form.originState ?? ""}
              onChange={(val) => update("originState", val)}
              options={originStates.map((s) => ({ value: s, label: s }))}
              placeholder="Enter or select origin state"
            />
            <span className="mt-1 text-xs text-gray-400">
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

          {/* Destination section */}
          <div className="sm:col-span-2">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-600 bg-gray-50 px-3 py-1.5 rounded-lg">
              Destination
            </p>
          </div>

          <Field label="Destination State" required>
            <GlassCombobox
              required
              value={form.destinationState}
              onChange={(val) => update("destinationState", val)}
              options={destinationStates.map((s) => ({ value: s, label: s }))}
              placeholder="Enter or select destination state"
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

          <Field label="Approx Distance (In KM)">
            <input
              type="number"
              min="0"
              step="0.1"
              value={form.approxDistanceKm ?? ""}
              onChange={(e) => update("approxDistanceKm", e.target.value)}
              onWheel={(e) => e.currentTarget.blur()}
              className={inputClass}
              placeholder="e.g. 120"
            />
            <span className="mt-1 text-xs text-gray-400">
              Used to auto-fill distance when this destination is assigned to a trip
            </span>
          </Field>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => { clearFormDraft(DRAFT_KEY); onClose(); }}
            className="btn-interactive rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-all duration-200 hover:bg-gray-50 active:scale-95"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn-interactive rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:bg-blue-700 active:scale-95"
          >
            {initialData ? "Save Changes" : "Add Destination"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
