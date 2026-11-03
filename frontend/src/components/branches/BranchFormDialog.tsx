"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Field, inputClass } from "@/components/ui/Field";
import type { Branch } from "@/types/branch";
import { useFormDraft, clearFormDraft } from "@/hooks/useFormDraft";
import { DecimalInput } from "@/components/ui/DecimalInput";
import { HALT_CONTAINER_TYPES } from "@/lib/halt-pay";

const DRAFT_KEY = "erp_branch_form_draft";

type BranchFormDialogProps = {
  open: boolean;
  onClose: () => void;
  onSave: (branch: Branch) => void;
  initialData: Branch | null;
};

const emptyForm: Omit<Branch, "id"> = {
  name: "",
  haltDayFee20ft: "",
  haltDayFee40ft: "",
  partyHaltFee20ft: "",
  partyHaltFee40ft: "",
  haltDayFee2x20: "",
  haltDayFeeOpenLoad: "",
  partyHaltFee2x20: "",
  partyHaltFeeOpenLoad: "",
  driverHaltDayPercentage: "",
  cleanerBattaFee: "",
  cleanerBattaFee20ft: "",
  cleanerBattaFee40ft: "",
  cleanerBattaFee2x20: "",
  cleanerBattaFeeOpenLoad: "",
  workshopBattaFee: "",
};

export function BranchFormDialog({ open, onClose, onSave, initialData }: BranchFormDialogProps) {
  const [form, setForm] = useState<Omit<Branch, "id">>(emptyForm);

  useEffect(() => {
    if (open) {
      if (initialData) {
        const { id: _id, ...rest } = initialData;
        setForm({ ...emptyForm, ...rest });
      } else {
        setForm(emptyForm);
      }
    }
  }, [open, initialData]);

  useFormDraft(DRAFT_KEY, open && !initialData, form, setForm);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!initialData) clearFormDraft(DRAFT_KEY);
    onSave({ id: initialData?.id ?? "", ...form });
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={initialData ? "Edit Branch" : "Add Branch"}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Branch Name" required>
          <input
            type="text"
            required
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            className={inputClass}
            placeholder="e.g. CHENNAI"
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Halt fees — per day, for every container type a trip can have. */}
          <div className="sm:col-span-2 flex flex-col gap-2">
            <div>
              <p className="text-body-medium text-text-primary">Halt Fees (₹ / day) <span className="text-danger-text">*</span></p>
              <p className="mt-0.5 text-xs text-text-secondary">
                Paid to the driver per halt day. <span className="font-semibold text-text-primary">Company</span> = days the company caused;{" "}
                <span className="font-semibold text-text-primary">Customer</span> = days the customer caused (billed to them at the same amount).
              </p>
            </div>
            <div className="overflow-hidden rounded-xl border border-separator-border">
              <div className="grid grid-cols-[1fr_1fr_1fr] gap-px bg-fill-3 text-xs">
                {["Container Type", "Company Halt Fee", "Customer Halt Fee"].map((h) => (
                  <div key={h} className="bg-fill-1 px-3 py-2 font-semibold text-text-secondary">{h}</div>
                ))}
                {HALT_CONTAINER_TYPES.map((t) => (
                  <div key={t.spec} className="contents">
                    <div className="flex items-center bg-background-primary-default px-3 py-2 text-body-semibold text-text-primary">{t.label}</div>
                    {([t.company, t.party] as const).map((key) => (
                      <div key={key} className="bg-background-primary-default p-1.5">
                        <DecimalInput type="number"
                          required
                          min="0"
                          step="0.01"
                          aria-label={`${key === t.company ? "Company" : "Customer"} halt fee — ${t.label}`}
                          value={form[key]}
                          onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
                          onWheel={(e) => e.currentTarget.blur()}
                          className={inputClass}
                          placeholder="e.g. 500"
                        />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <Field label="Driver Compensation Percentage (%)" required>
            <DecimalInput type="number"
              required
              min="0"
              max="100"
              step="0.01"
              value={form.driverHaltDayPercentage}
              onChange={(e) => setForm((p) => ({ ...p, driverHaltDayPercentage: e.target.value }))}
              onWheel={(e) => e.currentTarget.blur()}
              className={inputClass}
              placeholder="e.g. 10"
            />
          </Field>

          <Field label="On Workshop Batta Fee (₹)">
            <DecimalInput type="number"
              min="0"
              step="0.01"
              value={form.workshopBattaFee}
              onChange={(e) => setForm((p) => ({ ...p, workshopBattaFee: e.target.value }))}
              onWheel={(e) => e.currentTarget.blur()}
              className={inputClass}
              placeholder="e.g. 300"
            />
          </Field>

          {/* Cleaner Batta — one fee for every container type a trip can have. */}
          <div className="sm:col-span-2 flex flex-col gap-2">
            <p className="text-body-medium text-text-primary">Cleaner Batta Fee (₹)</p>
            <div className="overflow-hidden rounded-xl border border-separator-border">
              <div className="grid grid-cols-[1fr_2fr] gap-px bg-fill-3 text-xs">
                {["Container Type", "Cleaner Batta Fee"].map((h) => (
                  <div key={h} className="bg-fill-1 px-3 py-2 font-semibold text-text-secondary">{h}</div>
                ))}
                {HALT_CONTAINER_TYPES.map((t) => (
                  <div key={t.spec} className="contents">
                    <div className="flex items-center bg-background-primary-default px-3 py-2 text-body-semibold text-text-primary">{t.label}</div>
                    <div className="bg-background-primary-default p-1.5">
                      <DecimalInput type="number"
                        min="0"
                        step="0.01"
                        aria-label={`Cleaner batta fee — ${t.label}`}
                        value={form[t.cleaner]}
                        onChange={(e) => setForm((p) => ({ ...p, [t.cleaner]: e.target.value }))}
                        onWheel={(e) => e.currentTarget.blur()}
                        className={inputClass}
                        placeholder="e.g. 200"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-2 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => { clearFormDraft(DRAFT_KEY); onClose(); }}
            className="rounded-lg border border-separator-border px-4 py-2 text-body-medium text-text-primary hover:bg-fill-2"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-lg bg-accent-solid px-4 py-2 text-body-medium text-on-solid hover:bg-accent-solid-hover"
          >
            {initialData ? "Save Changes" : "Add Branch"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
