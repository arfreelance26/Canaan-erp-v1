"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Field, inputClass } from "@/components/ui/Field";
import { GlassSelect } from "@/components/ui/GlassSelect";
import { customersApi } from "@/lib/api";
import type { Customer } from "@/types/customer";
import type { CustomerPricing } from "@/types/customer-pricing";
import type { FinalCustomerPricing } from "@/types/final-customer-pricing";

type Props = {
  open: boolean;
  onClose: () => void;
  onSave: (customerId: string, data: { actualHireAmount: string | null; accountsHireAmount: string | null }) => Promise<void>;
  initialData?: FinalCustomerPricing | null;
  customers: Customer[];
};

export function FinalCustomerPricingFormDialog({ open, onClose, onSave, initialData, customers }: Props) {
  const [customerId, setCustomerId] = useState("");
  const [actualHireAmount, setActualHireAmount] = useState("");
  const [accountsHireAmount, setAccountsHireAmount] = useState("");
  const [customerPricing, setCustomerPricing] = useState<CustomerPricing[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (initialData) {
      setCustomerId(initialData.customerId);
      setActualHireAmount(initialData.actualHireAmount ?? "");
      setAccountsHireAmount(initialData.accountsHireAmount ?? "");
      customersApi.listPricing(initialData.customerId).then(setCustomerPricing).catch(() => {});
    } else {
      setCustomerId("");
      setActualHireAmount("");
      setAccountsHireAmount("");
      setCustomerPricing([]);
    }
  }, [open, initialData]);

  function handleCustomerChange(id: string) {
    setCustomerId(id);
    setActualHireAmount("");
    setCustomerPricing([]);
    if (!id) return;
    customersApi.listPricing(id).then((pricing) => {
      setCustomerPricing(pricing);
      if (pricing.length > 0 && pricing[0].rate) {
        setActualHireAmount(pricing[0].rate);
      }
    }).catch(() => {});
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerId) return;
    setSaving(true);
    try {
      await onSave(customerId, {
        actualHireAmount: actualHireAmount || null,
        accountsHireAmount: accountsHireAmount || null,
      });
    } finally {
      setSaving(false);
    }
  }

  const customerOptions = customers.map((c) => ({ value: c.id, label: c.name }));

  // Show pricing details as a helper text below the field
  const pricingHint = customerPricing.length > 0
    ? customerPricing.map((p) =>
        [p.customerDestination, p.cargoClassification, p.containerType, p.rate ? `₹${p.rate}` : ""]
          .filter(Boolean).join(" / ")
      ).join(" | ")
    : null;

  return (
    <Dialog open={open} onClose={onClose} title={initialData ? "Edit Final Pricing" : "Add Final Customer Pricing"}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5 p-1">

        <Field label="Customer Name" required>
          <GlassSelect
            value={customerId}
            onChange={handleCustomerChange}
            options={customerOptions}
            placeholder="Select customer…"
            disabled={!!initialData}
          />
        </Field>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-gray-700">Actual Hire Amount (₹)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={actualHireAmount}
            readOnly
            className={`${inputClass} cursor-not-allowed bg-gray-50 text-gray-600`}
            placeholder="Auto-populated from Customer Pricing"
          />
          {pricingHint && (
            <p className="text-xs text-gray-400 normal-case">From Customer Pricing: {pricingHint}</p>
          )}
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
            disabled={saving || !customerId || !accountsHireAmount}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : initialData ? "Save Changes" : "Add Final Pricing"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
