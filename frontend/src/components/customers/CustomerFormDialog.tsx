"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { GlassSelect } from "@/components/ui/GlassSelect";
import { Field, inputClass } from "@/components/ui/Field";
import { Avatar } from "@/components/ui/Avatar";
import { CUSTOMER_STATUS_OPTIONS, CUSTOMER_TYPE_OPTIONS } from "@/lib/customer-data";
import type { Customer } from "@/types/customer";

type CustomerFormDialogProps = {
  open: boolean;
  onClose: () => void;
  onSave: (customer: Customer) => void;
  initialData: Customer | null;
};

const emptyForm: Omit<Customer, "id"> = {
  photoUrl: null,
  name: "",
  gstin: "",
  contactPersonnelName: "",
  phone: "",
  email: "",
  address: "",
  customerType: "",
  status: "",
  isGta: "",
  applicableForEInvoice: "",
  tdsExemptionApplicable: "",
  msmeDeclarationSubmitted: "",
  gstExemptedCustomer: "",
};

export function CustomerFormDialog({ open, onClose, onSave, initialData }: CustomerFormDialogProps) {
  const [form, setForm] = useState<Omit<Customer, "id">>(emptyForm);

  useEffect(() => {
    if (open) {
      const { id: _id, ...rest } = initialData ?? { id: "", ...emptyForm };
      setForm(rest);
    }
  }, [open, initialData]);

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
    <Dialog open={open} onClose={onClose} title={initialData ? "Edit Customer" : "Add Customer"}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Customer Photo" required>
          <div className="flex items-center gap-4">
            <Avatar photoUrl={form.photoUrl} label={form.name || "?"} size={56} />
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => update("photoUrl", reader.result as string);
                reader.readAsDataURL(file);
              }}
              className="text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-blue-600 hover:file:bg-blue-100"
            />
          </div>
        </Field>

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

          <Field label="GSTIN" required>
            <input
              type="text"
              required
              value={form.gstin}
              onChange={(e) => update("gstin", e.target.value)}
              className={inputClass}
              placeholder="e.g. 33AABCS1234F1Z5"
            />
          </Field>

          <Field label="Contact Personnel Name" required>
            <input
              type="text"
              required
              value={form.contactPersonnelName}
              onChange={(e) => update("contactPersonnelName", e.target.value)}
              className={inputClass}
              placeholder="e.g. Karthik Raja"
            />
          </Field>

          <Field label="Phone" required>
            <input
              type="tel"
              required
              value={form.phone}
              onChange={(e) => update("phone", e.target.value)}
              className={inputClass}
              placeholder="+91 90000 00000"
            />
          </Field>

          <Field label="Email" required>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              className={inputClass}
              placeholder="name@company.com"
            />
          </Field>

          <Field label="Customer Type" required>
            <GlassSelect
              value={form.customerType}
              onChange={(val) => update("customerType", val as Customer["customerType"])}
              options={[
                { value: "", label: "Select customer type" },
                ...CUSTOMER_TYPE_OPTIONS.map(o => ({ value: o, label: o }))
              ]}
            />
          </Field>

          <Field label="Status" required>
            <GlassSelect
              value={form.status}
              onChange={(val) => update("status", val as Customer["status"])}
              options={[
                { value: "", label: "Select status" },
                ...CUSTOMER_STATUS_OPTIONS.map(o => ({ value: o, label: o }))
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

        {/* Additional Fields */}
        <div className="rounded-lg border border-gray-200 p-4">
          <h3 className="mb-4 text-sm font-semibold text-gray-900">Additional Fields</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Is GTA (Goods Transport Agent)?" required>
              <GlassSelect
                value={form.isGta}
                onChange={(val) => update("isGta", val as Customer["isGta"])}
                options={[
                  { value: "", label: "Please Select" },
                  { value: "Yes", label: "Yes" },
                  { value: "No", label: "No" }
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
                  { value: "No", label: "No" }
                ]}
              />
            </Field>

            <Field label="TDS Exemption Applicable?" required>
              <GlassSelect
                value={form.tdsExemptionApplicable}
                onChange={(val) => update("tdsExemptionApplicable", val as Customer["tdsExemptionApplicable"])}
                options={[
                  { value: "", label: "Please Select" },
                  { value: "Yes", label: "Yes" },
                  { value: "No", label: "No" }
                ]}
              />
            </Field>

            <Field label="MSME Declaration Submitted?" required>
              <GlassSelect
                value={form.msmeDeclarationSubmitted}
                onChange={(val) => update("msmeDeclarationSubmitted", val as Customer["msmeDeclarationSubmitted"])}
                options={[
                  { value: "", label: "Please Select" },
                  { value: "Yes", label: "Yes" },
                  { value: "No", label: "No" }
                ]}
              />
            </Field>

            <Field label="GST Exempted Customer?" required>
              <GlassSelect
                value={form.gstExemptedCustomer}
                onChange={(val) => update("gstExemptedCustomer", val as Customer["gstExemptedCustomer"])}
                options={[
                  { value: "", label: "Please Select" },
                  { value: "Yes", label: "Yes" },
                  { value: "No", label: "No" }
                ]}
              />
            </Field>
          </div>
        </div>

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
            {initialData ? "Save Changes" : "Add Customer"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
