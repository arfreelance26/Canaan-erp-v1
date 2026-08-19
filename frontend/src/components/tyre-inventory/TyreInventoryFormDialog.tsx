"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Field, inputClass } from "@/components/ui/Field";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import { GlassCombobox } from "@/components/ui/GlassCombobox";
import { TYRE_BRAND_OPTIONS, TYRE_TYPE_OPTIONS } from "@/lib/tyre-inventory-data";
import { tyreRangeConfigApi } from "@/lib/api";
import type { TyreInventoryItem } from "@/types/tyre-inventory";
import { todayIst } from "@/lib/format-date";
import { useFormDraft, clearFormDraft } from "@/hooks/useFormDraft";
import { DecimalInput } from "@/components/ui/DecimalInput";

export const DRAFT_KEY = "erp_tyre_inventory_form_draft";

type TyreInventoryFormDialogProps = {
  open: boolean;
  onClose: () => void;
  onSave: (tyre: TyreInventoryItem) => void;
  initialData: TyreInventoryItem | null;
  existingTyres: TyreInventoryItem[];
};

const emptyForm: Omit<TyreInventoryItem, "id"> = {
  brand: "",
  tyreType: "RADIAL",
  tyreNumber: "",
  size: "",
  rangeKm: "0",
  cost: "",
  costPerKm: "",
  purchaseDate: todayIst(),
  retreadCost: "0",
  retreadCount: "0",
  condition: "New",
};

export function TyreInventoryFormDialog({
  open,
  onClose,
  onSave,
  initialData,
  existingTyres,
}: TyreInventoryFormDialogProps) {
  const [form, setForm] = useState<Omit<TyreInventoryItem, "id">>(emptyForm);
  const [tyreTypeOptions, setTyreTypeOptions] = useState<string[]>(TYRE_TYPE_OPTIONS);
  const [rangeConfigMap, setRangeConfigMap] = useState<Record<string, number | null>>({});
  const [error, setError] = useState("");

  useEffect(() => {
    tyreRangeConfigApi.list().then((rows) => {
      if (rows.length > 0) {
        setTyreTypeOptions(rows.map((r) => r.tyre_type));
        const map: Record<string, number | null> = {};
        for (const r of rows) map[r.tyre_type] = r.range_km ?? null;
        setRangeConfigMap(map);
      }
    }).catch(() => {});
  }, []);

  // Auto-populate rangeKm when tyreType changes
  useEffect(() => {
    if (!form.tyreType) return;
    const km = rangeConfigMap[form.tyreType];
    setForm((prev) => ({ ...prev, rangeKm: km != null ? String(km) : "0" }));
  }, [form.tyreType, rangeConfigMap]);

  // Compute Cost Per KM = Purchase Cost ÷ Expected Range
  const expectedRange = form.tyreType ? (rangeConfigMap[form.tyreType] ?? null) : null;
  const costPerKm =
    form.cost && expectedRange != null && expectedRange > 0
      ? (Number(form.cost) / expectedRange).toFixed(4)
      : "";

  useEffect(() => {
    setForm((prev) => ({ ...prev, costPerKm }));
  }, [costPerKm]);

  useEffect(() => {
    if (open) {
      const { id: _id, ...rest } = initialData ?? { id: "", ...emptyForm };
      setForm(rest);
      setError("");
    }
  }, [open, initialData]);

  useFormDraft(DRAFT_KEY, open && !initialData, form, setForm);

  function update<K extends keyof Omit<TyreInventoryItem, "id">>(
    key: K,
    value: Omit<TyreInventoryItem, "id">[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const duplicate = existingTyres.some(
      (tyre) =>
        tyre.tyreNumber.trim().toLowerCase() === form.tyreNumber.trim().toLowerCase() &&
        tyre.id !== initialData?.id
    );
    if (duplicate) {
      setError("This Tyre Number is already in use. Tyre Number must be unique.");
      return;
    }

    onSave({
      id: initialData?.id ?? crypto.randomUUID(),
      ...form,
    });
  }

  return (
    <Dialog open={open} onClose={onClose} title={initialData ? "Edit Tyre" : "Add Tyre"}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Brand" required>
            <GlassCombobox
              required
              value={form.brand}
              onChange={(val) => update("brand", val)}
              placeholder="Select or type a brand"
              options={TYRE_BRAND_OPTIONS.map(opt => ({ value: opt, label: opt }))}
            />
          </Field>

          <Field label="Tyre Type" required>
            <GlassCombobox
              required
              value={form.tyreType}
              onChange={(val) => update("tyreType", val)}
              placeholder="Select or type a type"
              options={tyreTypeOptions.map(opt => ({ value: opt, label: opt }))}
            />
          </Field>

          <Field label="Tyre Number" required>
            <input
              type="text"
              required
              value={form.tyreNumber}
              onChange={(e) => {
                update("tyreNumber", e.target.value);
                setError("");
              }}
              className={inputClass}
              placeholder="Unique tyre identifier"
            />
          </Field>

          <Field label="Tyre Size" required>
            <input
              type="text"
              required
              value={form.size}
              onChange={(e) => update("size", e.target.value)}
              className={inputClass}
              placeholder="e.g. 295/95 R22.5"
            />
          </Field>

          <Field label="Purchase Cost (₹)" required>
            <DecimalInput type="number"
              required
              min="0"
              value={form.cost}
              onChange={(e) => update("cost", e.target.value)}
              className={inputClass}
              placeholder="e.g. 18500"
            />
          </Field>

          <Field label="Purchase Date" required>
            <DatePickerInput
              value={form.purchaseDate}
              onChange={(v) => update("purchaseDate", v)}
              className={inputClass}
            />
          </Field>

          <Field label="Expected Range">
            <input
              type="text"
              readOnly
              disabled
              value={
                form.tyreType && rangeConfigMap[form.tyreType] != null
                  ? `${Number(rangeConfigMap[form.tyreType]).toLocaleString("en-IN")} km`
                  : ""
              }
              className={`${inputClass} cursor-not-allowed bg-gray-50 text-gray-500`}
              placeholder={
                !form.tyreType
                  ? "Select a tyre type first"
                  : "No range configured for this type"
              }
            />
          </Field>

          <Field label="Cost Per KM">
            <input
              type="text"
              readOnly
              disabled
              value={costPerKm ? `₹ ${Number(costPerKm).toLocaleString("en-IN", { minimumFractionDigits: 4 })}` : ""}
              className={`${inputClass} cursor-not-allowed bg-gray-50 text-gray-500`}
              placeholder={
                !form.cost
                  ? "Enter Purchase Cost first"
                  : !form.tyreType || expectedRange == null
                  ? "No range configured for this type"
                  : "Purchase Cost ÷ Expected Range"
              }
            />
          </Field>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="mt-2 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => { clearFormDraft(DRAFT_KEY); onClose(); }}
            className="btn-interactive rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-all duration-200 hover:bg-gray-50 active:scale-95"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn-interactive rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:bg-blue-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {initialData ? "Save Changes" : "Add Tyre"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
