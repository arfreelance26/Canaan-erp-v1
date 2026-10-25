"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Eye, FileText, Paperclip, X } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { FileViewer } from "@/components/ui/FileViewer";
import { Field, inputClass } from "@/components/ui/Field";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import { GlassCombobox } from "@/components/ui/GlassCombobox";
import { TYRE_BRAND_OPTIONS, TYRE_TYPE_OPTIONS } from "@/lib/tyre-inventory-data";
import { tyreApi, tyreRangeConfigApi, vendorsApi } from "@/lib/api";
import type { TyreInventoryItem } from "@/types/tyre-inventory";
import type { Vendor } from "@/types/vendor";
import { todayIst } from "@/lib/format-date";
import { useFormDraft, clearFormDraft } from "@/hooks/useFormDraft";
import { DecimalInput } from "@/components/ui/DecimalInput";

export const DRAFT_KEY = "erp_tyre_inventory_form_draft";

const MAINTENANCE_BY_TYPES = ["Vendor", "Individual"] as const;

// Proof of Payment/Invoice: one PDF or image, 15 MB. The server re-checks the
// real bytes; SVG is refused there (it can carry scripts), so it's left out here.
const PROOF_MAX_BYTES = 15 * 1024 * 1024;
const PROOF_IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp|tiff?|heic|heif|avif|ico)$/;

function proofAccepted(file: File): boolean {
  const name = file.name.toLowerCase();
  if (file.type === "image/svg+xml" || name.endsWith(".svg")) return false;
  return file.type === "application/pdf" || name.endsWith(".pdf") || file.type.startsWith("image/") || PROOF_IMAGE_EXT.test(name);
}

function fileSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** What happens to the tyre's Proof of Payment/Invoice once the tyre is saved. */
export type TyreProofChange = { file: File | null; remove: boolean };

type TyreInventoryFormDialogProps = {
  open: boolean;
  onClose: () => void;
  onSave: (tyre: TyreInventoryItem, proof: TyreProofChange) => void;
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
  maintenanceBy: "",
  maintenanceByType: "Vendor",
  vendorId: "",
  invoiceNumber: "",
  invoiceDate: "",
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

  // "Maintenance By → Vendor" picks from the Our Vendors page. Blacklisted and
  // inactive vendors are left out (same as maintenance records).
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [vendorsLoaded, setVendorsLoaded] = useState(false);

  useEffect(() => {
    if (!open) return;
    vendorsApi.list().then(setVendors).catch(() => {}).finally(() => setVendorsLoaded(true));
  }, [open]);

  // Proof of Payment/Invoice — picked here, uploaded by the page once the tyre
  // is saved (a new tyre needs its id first). removeProof drops the saved one.
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [removeProof, setRemoveProof] = useState(false);
  const [proofError, setProofError] = useState("");
  const [viewingProof, setViewingProof] = useState(false);
  const savedProof = initialData?.proofFileName && !removeProof ? initialData.proofFileName : null;

  function pickProof(list: FileList | null) {
    const file = list?.[0];
    if (!file) return;
    if (!proofAccepted(file)) {
      setProofError(`"${file.name}" isn't a PDF or an image.`);
    } else if (file.size > PROOF_MAX_BYTES) {
      setProofError(`"${file.name}" is over 15 MB.`);
    } else {
      setProofFile(file);
      setProofError("");
    }
  }

  const maintenanceByType = form.maintenanceByType ?? "Vendor";
  const vendorId = form.vendorId ?? "";
  const vendorOptions = vendors
    // When editing, keep the tyre's own vendor listed even if it has since
    // been made inactive — otherwise the field would show up empty.
    .filter((v) => (v.status !== "BLACKLISTED" && v.status !== "INACTIVE") || v.id === vendorId)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((v) => ({ value: v.id, label: v.category ? `${v.name} — ${v.category}` : v.name }));

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

  // New tyres start with the configured range for their type. Edits keep the
  // range saved on the tyre, so loading the config never overwrites it.
  useEffect(() => {
    if (!open || initialData) return;
    const km = rangeConfigMap[form.tyreType];
    if (km != null && form.rangeKm === "0") {
      setForm((prev) => ({ ...prev, rangeKm: String(km) }));
    }
  }, [open, initialData, form.tyreType, form.rangeKm, rangeConfigMap]);

  // Compute Cost Per KM = Purchase Cost ÷ Expected Range (the tyre's own range)
  const expectedRange = Number(form.rangeKm) > 0 ? Number(form.rangeKm) : null;
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
      // Older tyres have no toggle saved: a linked vendor means Vendor, a
      // plain typed name means Individual.
      const byType = rest.maintenanceByType
        ?? (rest.vendorId ? "Vendor" : rest.maintenanceBy ? "Individual" : "Vendor");
      setForm({ ...emptyForm, ...rest, maintenanceByType: byType, vendorId: byType === "Vendor" ? rest.vendorId ?? "" : "" });
      setProofFile(null);
      setRemoveProof(false);
      setProofError("");
      setError("");
    }
  }, [open, initialData]);

  // Merge over emptyForm — a draft saved before the newer fields existed would
  // otherwise leave their inputs uncontrolled.
  useFormDraft(DRAFT_KEY, open && !initialData, form, (draft) => setForm({ ...emptyForm, ...draft }));

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

    onSave(
      { id: initialData?.id ?? crypto.randomUUID(), ...form },
      { file: proofFile, remove: removeProof && !proofFile },
    );
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
              onChange={(val) => {
                update("tyreType", val);
                // Picking a type suggests its configured range; the range stays editable per tyre.
                const km = rangeConfigMap[val];
                if (km != null) update("rangeKm", String(km));
              }}
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

          <Field label="Expected Range (km)">
            <input
              type="number"
              min="1"
              step="1"
              value={form.rangeKm === "0" ? "" : form.rangeKm}
              onChange={(e) => update("rangeKm", e.target.value)}
              className={inputClass}
              placeholder={
                form.tyreType && rangeConfigMap[form.tyreType] != null
                  ? `Configured: ${Number(rangeConfigMap[form.tyreType]).toLocaleString("en-IN")} km`
                  : "Enter expected range"
              }
            />
          </Field>

          <Field label="Retread Count">
            <input
              type="number"
              min="0"
              step="1"
              value={form.retreadCount}
              onChange={(e) => update("retreadCount", e.target.value)}
              className={inputClass}
              placeholder="0"
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
                  : expectedRange == null
                  ? "Enter Expected Range first"
                  : "Purchase Cost ÷ Expected Range"
              }
            />
          </Field>

          {/* Not <Field>: that wraps everything in a <label>, and a click on the
              label text would be forwarded to the first toggle button. */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-gray-700">Maintenance By</span>
              <div role="radiogroup" aria-label="Maintenance by" className="flex shrink-0 gap-0.5 rounded-full border border-gray-200 bg-gray-100 p-0.5 shadow-inner">
                {MAINTENANCE_BY_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={maintenanceByType === t}
                    onClick={() => {
                      if (t === maintenanceByType) return;
                      // A vendor name and a typed person's name aren't interchangeable.
                      setForm((prev) => ({ ...prev, maintenanceByType: t, maintenanceBy: "", vendorId: "" }));
                    }}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition-all duration-200 ${
                      maintenanceByType === t
                        ? "bg-brand-navy text-white shadow-[0_2px_6px_-1px_rgba(27,43,94,0.45)]"
                        : "text-gray-500 hover:bg-white/70 hover:text-gray-800"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            {maintenanceByType === "Vendor" ? (
              <GlassCombobox
                strictSelect
                value={vendorId}
                onChange={(id) => setForm((prev) => ({
                  ...prev,
                  vendorId: id,
                  maintenanceBy: vendors.find((v) => v.id === id)?.name ?? "",
                }))}
                placeholder={vendorsLoaded && vendorOptions.length === 0 ? "No active vendors — add one in Our Vendors" : "Select a vendor"}
                options={vendorOptions}
              />
            ) : (
              <input
                type="text"
                aria-label="Maintenance by (individual)"
                value={form.maintenanceBy ?? ""}
                onChange={(e) => update("maintenanceBy", e.target.value)}
                className={inputClass}
                placeholder="e.g. supplier name"
              />
            )}
          </div>

          <Field label={`Invoice Number (given by the ${maintenanceByType === "Vendor" ? "vendor" : "individual"})`}>
            <input
              type="text"
              maxLength={100}
              value={form.invoiceNumber ?? ""}
              onChange={(e) => update("invoiceNumber", e.target.value)}
              className={inputClass}
              placeholder="e.g. INV-2026-0412"
            />
          </Field>

          <Field label="Invoice Date">
            <DatePickerInput
              value={form.invoiceDate ?? ""}
              onChange={(v) => update("invoiceDate", v)}
              className={inputClass}
            />
          </Field>
        </div>

        {/* Proof of Payment/Invoice — not a <Field>/<label>: a label would
            forward clicks to the view/remove buttons. */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-gray-700">Proof of Payment/Invoice</span>
            <span className="text-xs text-gray-400">PDF or image · max 15 MB</span>
          </div>
          {proofFile || savedProof ? (
            <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-2.5 py-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-blue-50 text-blue-600">
                <FileText className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-gray-800">{proofFile ? proofFile.name : savedProof}</span>
                <span className="block text-xs text-gray-400">
                  {proofFile
                    ? `${fileSize(proofFile.size)} · uploads when you save`
                    : initialData?.proofSizeBytes ? `${fileSize(initialData.proofSizeBytes)} · saved` : "Saved"}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setViewingProof(true)}
                aria-label="View proof"
                className="rounded-full p-1 text-gray-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
              >
                <Eye className="h-4 w-4" />
              </button>
              <label
                className="cursor-pointer rounded-full px-2 py-0.5 text-xs font-semibold text-blue-600 transition-colors hover:bg-blue-50"
              >
                Replace
                <input
                  type="file"
                  accept="application/pdf,.pdf,image/*,.heic,.heif,.tif,.tiff,.avif"
                  className="sr-only"
                  onChange={(e) => { pickProof(e.target.files); e.target.value = ""; }}
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  if (proofFile) setProofFile(null);
                  else setRemoveProof(true);
                  setProofError("");
                }}
                aria-label="Remove proof"
                className="rounded-full p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 px-4 py-4 text-sm text-gray-600 transition-colors hover:border-blue-400 hover:bg-blue-50/40 hover:text-blue-700">
              <Paperclip className="h-4 w-4" />
              Upload a PDF or image (max 15 MB)
              <input
                type="file"
                accept="application/pdf,.pdf,image/*,.heic,.heif,.tif,.tiff,.avif"
                className="sr-only"
                onChange={(e) => { pickProof(e.target.files); e.target.value = ""; }}
              />
            </label>
          )}
          {removeProof && !proofFile && (
            <p className="text-xs text-amber-700">
              The saved proof will be removed when you save.{" "}
              <button type="button" onClick={() => setRemoveProof(false)} className="font-semibold underline">Undo</button>
            </p>
          )}
          {proofError && <p className="text-xs text-red-600">{proofError}</p>}
        </div>

        <FileViewer
          open={viewingProof}
          onClose={() => setViewingProof(false)}
          url={proofFile ? `picked:${proofFile.name}:${proofFile.size}` : `tyre-proof:${initialData?.id ?? ""}:${initialData?.version ?? ""}`}
          title={proofFile ? proofFile.name : savedProof ?? "Proof of Payment/Invoice"}
          filename={proofFile ? proofFile.name : savedProof ?? undefined}
          load={() => (proofFile ? Promise.resolve<Blob>(proofFile) : tyreApi.fetchProofBlob(initialData!.id))}
        />

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
