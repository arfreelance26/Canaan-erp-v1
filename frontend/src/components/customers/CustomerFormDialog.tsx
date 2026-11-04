"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { GlassSelect } from "@/components/ui/GlassSelect";
import { Field, inputClass } from "@/components/ui/Field";
import { CUSTOMER_TYPE_OPTIONS } from "@/lib/customer-data";
import type { Customer } from "@/types/customer";
import { useFormDraft, clearFormDraft } from "@/hooks/useFormDraft";
import { newAvatarSeed } from "@/components/ui/ProfileAvatar";
import { ProfileAvatarPicker } from "@/components/ui/ProfileAvatarPicker";

export const DRAFT_KEY = "erp_customer_form_draft";

const sectionHeadingClass =
  "text-caption-1-semibold text-accent-text-strong bg-accent-surface px-3 py-2 rounded-lg";

type CustomerFormDialogProps = {
  open: boolean;
  onClose: () => void;
  onSave: (customer: Customer) => void;
  initialData: Customer | null;
};

const emptyForm: Omit<Customer, "id"> = {
  name: "",
  gstin: "",
  contactPersonnelName: "",
  phone: "",
  email: "",
  address: "",
  customerType: "",
  isGta: "",
  applicableForEInvoice: "",
};

export function CustomerFormDialog({ open, onClose, onSave, initialData }: CustomerFormDialogProps) {
  const [form, setForm] = useState<Omit<Customer, "id">>(emptyForm);

  useEffect(() => {
    if (open) {
      const { id: _id, ...rest } = initialData ?? { id: "", ...emptyForm };
      // A new customer starts with a picture of its own (Shuffle to change it).
      setForm(initialData ? rest : { ...rest, avatarStyle: "notionists", avatarSeed: newAvatarSeed() });
    }
  }, [open, initialData]);

  useFormDraft(DRAFT_KEY, open && !initialData, form, setForm);

  function update<K extends keyof Omit<Customer, "id">>(key: K, value: Omit<Customer, "id">[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave({
      id: initialData?.id ?? crypto.randomUUID(),
      ...form,
    });
  }

  return (
    <Dialog tour="customer-form" open={open} onClose={onClose} title={initialData ? "Edit Customer" : "Add Customer"}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Profile picture — saved with the customer, so it goes through the same edit process. */}
        <ProfileAvatarPicker
          look={form.avatarStyle}
          seed={form.avatarSeed}
          fallbackSeed={`customer-${initialData?.id ?? "new"}`}
          onChange={({ look, seed }) => setForm((prev) => ({ ...prev, avatarStyle: look, avatarSeed: seed }))}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Customer Name" required>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              className={inputClass}
              placeholder="e.g. Sri Lakshmi Traders"
            />
          </Field>

          <Field label="GSTIN">
            <input
              type="text"
              value={form.gstin}
              onChange={(e) => update("gstin", e.target.value)}
              className={inputClass}
              placeholder="e.g. 33AABCS1234F1Z5"
            />
          </Field>

          <Field label="Contact Personnel Name">
            <input
              type="text"
              value={form.contactPersonnelName}
              onChange={(e) => update("contactPersonnelName", e.target.value)}
              className={inputClass}
              placeholder="e.g. Karthik Raja"
            />
          </Field>

          <Field label="Phone">
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => update("phone", e.target.value)}
              className={inputClass}
              placeholder="+91 90000 00000"
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

          <Field label="Customer Type">
            <GlassSelect
              value={form.customerType}
              onChange={(val) => update("customerType", val as Customer["customerType"])}
              options={[
                { value: "", label: "Select customer type" },
                ...CUSTOMER_TYPE_OPTIONS.map(o => ({ value: o, label: o }))
              ]}
            />
          </Field>
        </div>

        <Field label="Address" required>
          <textarea
            required
            value={form.address}
            onChange={(e) => update("address", e.target.value)}
            className={inputClass}
            rows={3}
          />
        </Field>

        <div className="rounded-lg border border-separator-border p-4">
          <p className={sectionHeadingClass}>Additional Fields</p>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Is GTA (Goods Transport Agent)?" required>
              <GlassSelect
                value={form.isGta}
                onChange={(val) => update("isGta", val as Customer["isGta"])}
                options={[
                  { value: "", label: "Please Select" },
                  { value: "Yes", label: "Yes" },
                  { value: "No", label: "No" },
                ]}
              />
            </Field>

            <Field label="Applicable for E-Invoice?" required>
              <GlassSelect
                value={form.applicableForEInvoice}
                onChange={(val) => update("applicableForEInvoice", val as Customer["applicableForEInvoice"])}
                options={[
                  { value: "", label: "Please Select" },
                  { value: "Yes", label: "Yes" },
                  { value: "No", label: "No" },
                ]}
              />
            </Field>
          </div>
        </div>

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
            {initialData ? "Save Changes" : "Add Customer"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
