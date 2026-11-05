"use client";

import { RiCloseLine as X, RiLinkM as Linked } from "@remixicon/react";
import { Field, inputClass } from "@/components/ui/Field";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import { GlassCombobox } from "@/components/ui/GlassCombobox";
import { DecimalInput } from "@/components/ui/DecimalInput";
import type { RepairLine } from "@/types/truck-maintenance";
import { cx } from "@/utils/cx";

const BY_TYPES = ["Vendor", "Individual"] as const;

export const emptyRepairLine = (repairType: string): RepairLine => ({
  repairType, cost: "", maintenanceLocation: "", maintenanceByType: "Vendor", vendorId: null,
  maintenanceBy: "", invoiceNumber: "", invoiceDate: "",
});

type Props = {
  line: RepairLine;
  index: number;
  onChange: (patch: Partial<RepairLine>) => void;
  /** Removes this repair (unticks it); left out when it's the only one. */
  onRemove?: () => void;
  vendorOptions: { value: string; label: string }[];
  vendorName: (id: string) => string;
  vendorsLoaded: boolean;
  /** "Same vendor & invoice for all": this card follows the first one. */
  followsFirst?: boolean;
  /** Submit was pressed without this repair's cost. */
  costMissing?: boolean;
  /** A scheduled job: the cost (and invoice) can be added later. */
  costOptional?: boolean;
};

/**
 * One repair on Update Maintenance Record: what it cost, where, who did it
 * (a vendor from Our Vendors, or a named individual) and their invoice.
 * The record's total is the sum of these cards.
 */
export function RepairCard({ line, index, onChange, onRemove, vendorOptions, vendorName, vendorsLoaded, followsFirst, costMissing, costOptional }: Props) {
  const byType = line.maintenanceByType ?? "Vendor";
  return (
    <section
      aria-label={`Repair ${index + 1}: ${line.repairType}`}
      className={cx(
        "rounded-xl border bg-background-primary-default shadow-xs transition-colors",
        costMissing ? "border-danger-border-strong" : "border-separator-border",
      )}
    >
      <header className="flex items-center gap-2.5 border-b border-separator-border bg-fill-1 px-4 py-2.5">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-surface text-caption-1-semibold text-accent-text">
          {index + 1}
        </span>
        <span className="min-w-0 flex-1 truncate text-body-semibold text-text-primary">{line.repairType}</span>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${line.repairType}`}
            className="flex size-7 items-center justify-center rounded-full text-text-tertiary outline-none transition-colors hover:bg-danger-surface-strong hover:text-danger-text focus-visible:ring-2 focus-visible:ring-border-focus-ring"
          >
            <X className="size-4" />
          </button>
        )}
      </header>

      <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
        <Field label={costOptional ? "Cost (add later if not known)" : "Cost"} required={!costOptional}>
          <DecimalInput
            type="number"
            min="0"
            value={line.cost}
            onChange={(e) => onChange({ cost: e.target.value })}
            className={cx(inputClass, costMissing && "border-danger-border-strong ring-2 ring-danger-border")}
            placeholder={costOptional ? "Add later" : "e.g. 5000"}
            aria-label={`Cost of ${line.repairType}`}
          />
          {costMissing && <p className="mt-1 text-xs text-danger-text">Enter the cost of this repair.</p>}
        </Field>

        <Field label="Maintenance Location">
          <input
            type="text"
            value={line.maintenanceLocation}
            onChange={(e) => onChange({ maintenanceLocation: e.target.value })}
            disabled={followsFirst}
            className={inputClass}
            placeholder="e.g. Canaan Yard, Chennai"
          />
        </Field>

        {/* Not <Field>: a <label> would forward clicks to the first toggle. */}
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-body-medium text-text-primary">Maintenance By</span>
            <div role="radiogroup" aria-label={`Maintenance by for ${line.repairType}`} className="flex shrink-0 gap-0.5 rounded-full border border-separator-border bg-fill-2 p-0.5 shadow-inner">
              {BY_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={byType === t}
                  disabled={followsFirst}
                  onClick={() => {
                    if (t === byType) return;
                    // A vendor and a typed person's name aren't interchangeable.
                    onChange({ maintenanceByType: t, vendorId: null, maintenanceBy: "" });
                  }}
                  className={cx(
                    "rounded-full px-3 py-1 text-caption-1-semibold transition duration-200 disabled:cursor-not-allowed",
                    byType === t ? "bg-accent-solid text-on-solid shadow-md" : "text-text-secondary hover:bg-fill-2 hover:text-text-primary",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          {byType === "Vendor" ? (
            <GlassCombobox
              strictSelect
              value={line.vendorId ?? ""}
              onChange={(id) => onChange({ vendorId: id || null, maintenanceBy: id ? vendorName(id) : "" })}
              disabled={followsFirst}
              placeholder={vendorsLoaded && vendorOptions.length === 0 ? "No active vendors — add one in Our Vendors" : "Select a vendor"}
              options={vendorOptions}
            />
          ) : (
            <input
              type="text"
              aria-label={`Maintenance by (individual) for ${line.repairType}`}
              value={line.maintenanceBy}
              onChange={(e) => onChange({ maintenanceBy: e.target.value })}
              disabled={followsFirst}
              className={inputClass}
              placeholder="e.g. mechanic name"
            />
          )}
        </div>

        <Field label={`Invoice Number (given by the ${byType === "Vendor" ? "vendor" : "individual"})`}>
          <input
            type="text"
            maxLength={100}
            value={line.invoiceNumber}
            onChange={(e) => onChange({ invoiceNumber: e.target.value })}
            disabled={followsFirst}
            className={inputClass}
            placeholder="e.g. INV-2026-0412"
          />
        </Field>

        <Field label="Invoice Date">
          <DatePickerInput
            value={line.invoiceDate}
            onChange={(v) => onChange({ invoiceDate: v })}
            disabled={followsFirst}
            className={inputClass}
          />
        </Field>

        {followsFirst && (
          <p className="flex items-center gap-1.5 text-xs text-text-tertiary sm:col-span-2">
            <Linked className="size-3.5" aria-hidden /> Same vendor, location and invoice as repair 1.
          </p>
        )}
      </div>
    </section>
  );
}
