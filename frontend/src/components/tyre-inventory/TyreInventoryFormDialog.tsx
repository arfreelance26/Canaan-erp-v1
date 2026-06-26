"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Field, inputClass } from "@/components/ui/Field";
import { GlassSelect } from "@/components/ui/GlassSelect";
import { GlassCombobox } from "@/components/ui/GlassCombobox";
import { TYRE_BRAND_OPTIONS, TYRE_CONDITION_OPTIONS, TYRE_TYPE_OPTIONS } from "@/lib/tyre-inventory-data";
import type { TyreInventoryItem } from "@/types/tyre-inventory";
import { todayIst } from "@/lib/format-date";

type TyreInventoryFormDialogProps = {
  open: boolean;
  onClose: () => void;
  onSave: (tyre: TyreInventoryItem) => void;
  initialData: TyreInventoryItem | null;
  existingTyres: TyreInventoryItem[];
};

const emptyForm: Omit<TyreInventoryItem, "id"> = {
  brand: "",
  tyreType: "Radial",
  tyreNumber: "",
  size: "",
  cost: "",
  condition: "",
  purchaseDate: todayIst(),
  repairCost: "0",
  retreadCost: "0",
  retreadCount: "0",
};

export function TyreInventoryFormDialog({
  open,
  onClose,
  onSave,
  initialData,
  existingTyres,
}: TyreInventoryFormDialogProps) {
  const [form, setForm] = useState<Omit<TyreInventoryItem, "id">>(emptyForm);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      const { id: _id, ...rest } = initialData ?? { id: "", ...emptyForm };
      setForm(rest);
      setError("");
    }
  }, [open, initialData]);

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
              options={TYRE_TYPE_OPTIONS.map(opt => ({ value: opt, label: opt }))}
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
            <input
              type="number"
              required
              min="0"
              value={form.cost}
              onChange={(e) => update("cost", e.target.value)}
              className={inputClass}
              placeholder="e.g. 18500"
            />
          </Field>

          <Field label="Status" required>
            <GlassSelect
              value={form.condition}
              onChange={(val) => update("condition", val as TyreInventoryItem["condition"])}
              options={[
                { value: "", label: "Select status" },
                ...TYRE_CONDITION_OPTIONS.map(o => ({ value: o, label: o }))
              ]}
            />
          </Field>

          <Field label="Purchase Date" required>
            <input
              type="date"
              value={form.purchaseDate}
              onChange={(e) => update("purchaseDate", e.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label="Repair Cost" required>
            <input
              type="number"
              min="0"
              value={form.repairCost}
              onChange={(e) => update("repairCost", e.target.value)}
              className={inputClass}
              placeholder="Total repair cost so far"
            />
          </Field>
        </div>

        {form.condition === "Rethreaded" && (
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-yellow-700">
              Retreading Details — required for Rethreaded tyres
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Retreading Cost (₹)" required>
                <input
                  type="number"
                  required
                  min="1"
                  value={form.retreadCost}
                  onChange={(e) => update("retreadCost", e.target.value)}
                  className={inputClass}
                  placeholder="e.g. 4500"
                />
              </Field>

              <Field label="Number of Retreads" required>
                <input
                  type="number"
                  required
                  min="1"
                  value={form.retreadCount}
                  onChange={(e) => update("retreadCount", e.target.value)}
                  className={inputClass}
                  placeholder="e.g. 1"
                />
              </Field>
            </div>
          </div>
        )}


        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="mt-2 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
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
