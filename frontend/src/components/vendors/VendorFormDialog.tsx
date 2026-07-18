"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Field, inputClass } from "@/components/ui/Field";
import { GlassSelect } from "@/components/ui/GlassSelect";
import { GlassCombobox } from "@/components/ui/GlassCombobox";
import { VENDOR_CATEGORY_OPTIONS, VENDOR_STATUS_OPTIONS } from "@/lib/vendor-data";
import type { Vendor } from "@/types/vendor";
import { todayIst } from "@/lib/format-date";
import { useFormDraft, clearFormDraft } from "@/hooks/useFormDraft";

export const DRAFT_KEY = "erp_vendor_form_draft";

type VendorFormDialogProps = {
  open: boolean;
  onClose: () => void;
  onSave: (vendor: Vendor) => void;
  initialData: Vendor | null;
};

const emptyForm: Omit<Vendor, "id" | "createdAt"> = {
  name: "",
  category: "",
  contactNumber: "",
  gstin: "",
  pan: "",
  email: "",
  address: "",
  status: "",
};

export function VendorFormDialog({ open, onClose, onSave, initialData }: VendorFormDialogProps) {
  const [form, setForm] = useState<Omit<Vendor, "id" | "createdAt">>(emptyForm);

  useEffect(() => {
    if (open) {
      const { id: _id, createdAt: _createdAt, ...rest } = initialData ?? {
        id: "",
        createdAt: "",
        ...emptyForm,
      };
      setForm(rest);
    }
  }, [open, initialData]);

  useFormDraft(DRAFT_KEY, open && !initialData, form, setForm);

  function update<K extends keyof Omit<Vendor, "id" | "createdAt">>(
    key: K,
    value: Omit<Vendor, "id" | "createdAt">[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave({
      id: initialData?.id ?? crypto.randomUUID(),
      createdAt: initialData?.createdAt ?? todayIst(),
      ...form,
    });
  }

  return (
    <Dialog open={open} onClose={onClose} title={initialData ? "Edit Vendor" : "Add Vendor"}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Vendor Name" required>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              className={inputClass}
              placeholder="e.g. Annai Tyre Mart"
            />
          </Field>

          <Field label="Vendor Category">
            <GlassCombobox
              value={form.category}
              onChange={(val) => update("category", val)}
              placeholder="Select or type a category"
              options={VENDOR_CATEGORY_OPTIONS.map(opt => ({ value: opt, label: opt }))}
            />
          </Field>

          <Field label="Contact Number">
            <input
              type="tel"
              value={form.contactNumber}
              onChange={(e) => update("contactNumber", e.target.value)}
              className={inputClass}
              placeholder="+91 90000 00000"
            />
          </Field>

          <Field label="GSTIN">
            <input
              type="text"
              value={form.gstin}
              onChange={(e) => update("gstin", e.target.value.toUpperCase())}
              className={inputClass}
              placeholder="e.g. 33AABCT1234F1Z9"
            />
          </Field>

          <Field label="PAN">
            <input
              type="text"
              value={form.pan}
              onChange={(e) => update("pan", e.target.value.toUpperCase())}
              className={inputClass}
              placeholder="e.g. AABCT1234F"
            />
          </Field>

          <Field label="Email">
            <input
              type="email"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              className={inputClass}
              placeholder="name@company.com"
            />
          </Field>

          <Field label="Status">
            <GlassSelect
              value={form.status}
              onChange={(val) => update("status", val as Vendor["status"])}
              options={[
                { value: "", label: "Select status" },
                ...VENDOR_STATUS_OPTIONS.map(o => ({ value: o, label: o }))
              ]}
            />
          </Field>
        </div>

        <Field label="Address">
          <textarea
            value={form.address}
            onChange={(e) => update("address", e.target.value)}
            className={`${inputClass} resize-none`}
            rows={3}
          />
        </Field>

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
            {initialData ? "Save Changes" : "Add Vendor"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
