"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { FileText, Paperclip, X } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { Field, inputClass } from "@/components/ui/Field";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import { GlassCombobox } from "@/components/ui/GlassCombobox";
import { maintenanceCategoriesApi, vendorsApi } from "@/lib/api";
import type { Vendor } from "@/types/vendor";
import { PROOF_MAX_BYTES, PROOF_MAX_IMAGES, PROOF_MAX_PDFS, type MaintenanceRecord } from "@/types/truck-maintenance";
import type { MaintenanceCategory } from "@/types/maintenance-category";
import type { Truck } from "@/types/truck";
import { useFormDraft, clearFormDraft } from "@/hooks/useFormDraft";
import { DecimalInput } from "@/components/ui/DecimalInput";

type MaintenanceRecordFormDialogProps = {
  open: boolean;
  onClose: () => void;
  /**
   * proofs: the Proof of Payment files to upload once the record is created
   * (always empty when editing). reason: only when requireReason is set.
   */
  onSave: (record: MaintenanceRecord, proofs: File[], reason?: string) => void;
  truck: Truck | null;
  /** True while the record is being saved and its proofs uploaded. */
  saving?: boolean;
  /** Edit mode: the record to edit (its fields prefill the form). */
  editRecord?: MaintenanceRecord | null;
  /** Edit mode for non-Admins: the change goes to Edit Approvals, so a reason is required. */
  requireReason?: boolean;
};

type PickedProof = { key: string; file: File; kind: "image" | "pdf"; url: string | null };

// Same set the server accepts (it re-checks the real bytes). HEIC is left out
// on purpose: browsers can't display it, so nobody could open the proof.
const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp"]);
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp)$/;

/** "PNG", "JPG", "PDF"… from the file name, for the little caption under it. */
export function proofTypeLabel(name: string, kind: "image" | "pdf"): string {
  if (kind === "pdf") return "PDF";
  const ext = name.split(".").pop()?.toUpperCase() ?? "";
  return ext === "JPEG" ? "JPG" : ext || "Image";
}

function proofKind(file: File): "image" | "pdf" | null {
  const name = file.name.toLowerCase();
  if (IMAGE_MIMES.has(file.type) || IMAGE_EXT.test(name)) return "image";
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  return null;
}

function fileSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const MAINTENANCE_BY_TYPES = ["Vendor", "Individual"] as const;
type MaintenanceByType = (typeof MAINTENANCE_BY_TYPES)[number];

const emptyForm: Omit<MaintenanceRecord, "id" | "truckId"> = {
  date: "",
  maintenanceEndDate: "",
  odometer: "",
  maintenanceType: "",
  repairType: "",
  compliant: "",
  maintenanceLocation: "",
  maintenanceBy: "",
  description: "",
  cost: "",
};

export function MaintenanceRecordFormDialog({
  open, onClose, onSave, truck, saving = false, editRecord = null, requireReason = false,
}: MaintenanceRecordFormDialogProps) {
  const isEdit = editRecord !== null;
  const [form, setForm] = useState<Omit<MaintenanceRecord, "id" | "truckId">>(emptyForm);
  const [reason, setReason] = useState("");
  // Maintenance Type and Repair Type both come from Admin > Maintenance
  // Management (categories and each category's repair types). Note: the
  // Overdue/Due Soon tracking on Truck Maintenance matches records against the
  // separate Maintenance Alert Management list by name, so records logged
  // with these categories don't feed that tracking.
  const [categories, setCategories] = useState<MaintenanceCategory[]>([]);
  const [maintenanceByType, setMaintenanceByType] = useState<MaintenanceByType>("Vendor");
  // The picked vendor's id — saved with the record so Our Vendors → View Record
  // can list it (form.maintenanceBy keeps the name).
  const [vendorId, setVendorId] = useState("");

  // "Maintenance By → Vendor" picks from the Our Vendors page. Blacklisted and
  // inactive vendors are left out — work shouldn't be logged against them.
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [vendorsLoaded, setVendorsLoaded] = useState(false);

  useEffect(() => {
    maintenanceCategoriesApi.list().then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;
    vendorsApi.list().then(setVendors).catch(() => {}).finally(() => setVendorsLoaded(true));
  }, [open]);

  const vendorOptions = vendors
    // When editing, keep the record's own vendor listed even if it has since
    // been made inactive — otherwise the field would show up empty.
    .filter((v) => (v.status !== "BLACKLISTED" && v.status !== "INACTIVE") || v.id === vendorId)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((v) => ({ value: v.id, label: v.category ? `${v.name} — ${v.category}` : v.name }));

  // Proof of Payment: picked here, uploaded by the page right after the record
  // is created (the upload needs the new record's id). Preview URLs are made
  // when files are added and revoked when removed/reset — not in render.
  const [proofs, setProofs] = useState<PickedProof[]>([]);
  const [proofError, setProofError] = useState("");
  const proofsRef = useRef<PickedProof[]>([]);
  useEffect(() => {
    proofsRef.current = proofs;
  }, [proofs]);
  useEffect(() => () => proofsRef.current.forEach((p) => p.url && URL.revokeObjectURL(p.url)), []);

  function clearProofs() {
    proofsRef.current.forEach((p) => p.url && URL.revokeObjectURL(p.url));
    setProofs([]);
    setProofError("");
  }

  function addProofs(list: FileList | null) {
    if (!list || list.length === 0) return;
    const problems: string[] = [];
    let images = proofs.filter((p) => p.kind === "image").length;
    let pdfs = proofs.filter((p) => p.kind === "pdf").length;
    const added: PickedProof[] = [];
    for (const file of Array.from(list)) {
      const kind = proofKind(file);
      if (!kind) {
        problems.push(`"${file.name}" isn't an image or PDF.`);
      } else if (file.size > PROOF_MAX_BYTES) {
        problems.push(`"${file.name}" is over ${PROOF_MAX_BYTES / (1024 * 1024)} MB.`);
      } else if (kind === "image" && images >= PROOF_MAX_IMAGES) {
        problems.push(`Only ${PROOF_MAX_IMAGES} images allowed — "${file.name}" was skipped.`);
      } else if (kind === "pdf" && pdfs >= PROOF_MAX_PDFS) {
        problems.push(`Only ${PROOF_MAX_PDFS} PDFs allowed — "${file.name}" was skipped.`);
      } else {
        if (kind === "image") images += 1;
        else pdfs += 1;
        added.push({ key: crypto.randomUUID(), file, kind, url: kind === "image" ? URL.createObjectURL(file) : null });
      }
    }
    if (added.length) setProofs((prev) => [...prev, ...added]);
    setProofError(problems.join(" "));
  }

  function removeProof(key: string) {
    setProofs((prev) => {
      const gone = prev.find((p) => p.key === key);
      if (gone?.url) URL.revokeObjectURL(gone.url);
      return prev.filter((p) => p.key !== key);
    });
    setProofError("");
  }

  useEffect(() => {
    if (!open) return;
    clearProofs();
    setReason("");
    if (editRecord) {
      setForm({
        ...emptyForm,
        date: editRecord.date,
        maintenanceEndDate: editRecord.maintenanceEndDate ?? "",
        odometer: String(editRecord.odometer ?? ""),
        maintenanceType: editRecord.maintenanceType ?? "",
        repairType: editRecord.repairType ?? "",
        compliant: editRecord.compliant ?? "",
        maintenanceLocation: editRecord.maintenanceLocation ?? "",
        maintenanceBy: editRecord.maintenanceBy ?? "",
        description: editRecord.description ?? "",
        cost: String(editRecord.cost ?? ""),
      });
      // Older records have no toggle saved: a linked vendor means Vendor,
      // a plain typed name means Individual.
      const byType = editRecord.maintenanceByType
        ?? (editRecord.vendorId ? "Vendor" : editRecord.maintenanceBy ? "Individual" : "Vendor");
      setMaintenanceByType(byType);
      setVendorId(byType === "Vendor" ? editRecord.vendorId ?? "" : "");
    } else {
      setForm(emptyForm);
      setMaintenanceByType("Vendor");
      setVendorId("");
    }
  }, [open, truck?.id, editRecord]);

  const imageCount = proofs.filter((p) => p.kind === "image").length;
  const pdfCount = proofs.filter((p) => p.kind === "pdf").length;
  const proofsFull = imageCount >= PROOF_MAX_IMAGES && pdfCount >= PROOF_MAX_PDFS;

  const categoryOptions = categories.map((c) => ({ value: c.name, label: c.name }));
  const selectedCategory = categories.find((c) => c.name === form.maintenanceType);
  const repairOptions = (selectedCategory?.repairs ?? []).map((r) => ({ value: r.name, label: r.name }));

  // A different Maintenance Type invalidates whatever Repair Type was picked
  // for the previous one — repair types belong to a category.
  function handleMaintenanceTypeChange(value: string) {
    setForm((prev) => ({ ...prev, maintenanceType: value, repairType: "" }));
  }

  const draftKey = `erp_maintenance_record_draft_${truck?.id ?? "none"}`;
  // Merge over emptyForm rather than replacing outright — an older draft saved
  // before these fields existed would otherwise restore without them, flipping
  // their inputs from controlled to uncontrolled (undefined value).
  // Drafts are for new records only — an edit always starts from the saved record.
  useFormDraft(draftKey, open && !isEdit, form, (draft) => setForm({ ...emptyForm, ...draft }));

  function update<K extends keyof Omit<MaintenanceRecord, "id" | "truckId">>(
    key: K,
    value: Omit<MaintenanceRecord, "id" | "truckId">[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const currentOdometer = truck ? Number(truck.odometer) : null;
  const enteredOdometer = form.odometer !== "" ? Number(form.odometer) : null;
  const odometerTooHigh = enteredOdometer !== null && currentOdometer !== null && enteredOdometer > currentOdometer;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!truck) return;
    if (odometerTooHigh || saving) return;
    if (requireReason && !reason.trim()) return;
    if (!isEdit) clearFormDraft(draftKey);
    onSave(
      {
        id: editRecord?.id ?? crypto.randomUUID(),
        truckId: truck.id,
        version: editRecord?.version,
        ...form,
        maintenanceByType: form.maintenanceBy ? maintenanceByType : null,
        vendorId: maintenanceByType === "Vendor" && vendorId ? vendorId : null,
      },
      isEdit ? [] : proofs.map((p) => p.file),
      requireReason ? reason.trim() : undefined,
    );
  }

  const title = isEdit ? "Edit Maintenance Record" : "Update Maintenance Record";
  const submitLabel = saving
    ? (isEdit ? (requireReason ? "Submitting…" : "Saving…") : proofs.length ? "Saving & uploading…" : "Saving…")
    : isEdit ? (requireReason ? "Submit Edit Request" : "Save Changes") : "Add Record";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={truck ? `${title} — ${truck.registrationNumber}` : title}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {isEdit && requireReason && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
            Your changes go to <span className="font-semibold">Edit Approvals</span> and are applied once an Admin approves them.
          </div>
        )}
        {currentOdometer !== null && currentOdometer > 0 && (
          <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-600">Current Odometer</span>
            <span className="ml-auto text-sm font-bold text-blue-800">{currentOdometer.toLocaleString("en-IN")} km</span>
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Maintenance Start Date" required>
            <DatePickerInput
              required
              value={form.date}
              onChange={(v) => update("date", v)}
              className={inputClass}
            />
          </Field>

          <Field label="Maintenance End Date">
            <DatePickerInput
              value={form.maintenanceEndDate}
              onChange={(v) => update("maintenanceEndDate", v)}
              className={inputClass}
            />
          </Field>

          <Field label="Odometer (km)" required>
            <DecimalInput type="number"
              required
              min="0"
              max={currentOdometer !== null && currentOdometer > 0 ? currentOdometer : undefined}
              value={form.odometer}
              onChange={(e) => update("odometer", e.target.value)}
              className={`${inputClass} ${odometerTooHigh ? "border-red-400 ring-2 ring-red-100" : ""}`}
              placeholder="e.g. 85000"
            />
            {odometerTooHigh && (
              <p className="mt-1 text-xs text-red-600">
                Must be less than or equal to the current odometer ({currentOdometer!.toLocaleString("en-IN")} km).
              </p>
            )}
            {!odometerTooHigh && currentOdometer !== null && currentOdometer > 0 && (
              <p className="mt-1 text-xs text-gray-400">Enter the odometer reading when this maintenance was done.</p>
            )}
          </Field>

          <Field label="Maintenance Type" required>
            <GlassCombobox
              required
              strictSelect
              value={form.maintenanceType}
              onChange={handleMaintenanceTypeChange}
              placeholder="Select a maintenance type"
              options={categoryOptions}
            />
          </Field>

          {/* Only categories that have repair types set up in Maintenance
              Management get this field — requiring it for one with none
              would make the form impossible to submit. */}
          {repairOptions.length > 0 && (
            <Field label="Repair Type" required>
              <GlassCombobox
                required
                strictSelect
                value={form.repairType}
                onChange={(val) => update("repairType", val)}
                placeholder="Select a repair type"
                options={repairOptions}
              />
            </Field>
          )}

          <Field label="Cost" required>
            <DecimalInput type="number"
              required
              min="0"
              value={form.cost}
              onChange={(e) => update("cost", e.target.value)}
              className={inputClass}
              placeholder="e.g. 5000"
            />
          </Field>

          <Field label="Maintenance Location">
            <input
              type="text"
              value={form.maintenanceLocation}
              onChange={(e) => update("maintenanceLocation", e.target.value)}
              className={inputClass}
              placeholder="e.g. Canaan Yard, Chennai"
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
                      setMaintenanceByType(t);
                      // A vendor name and a typed person's name aren't interchangeable.
                      update("maintenanceBy", "");
                      setVendorId("");
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
                onChange={(id) => {
                  setVendorId(id);
                  update("maintenanceBy", vendors.find((v) => v.id === id)?.name ?? "");
                }}
                placeholder={vendorsLoaded && vendorOptions.length === 0 ? "No active vendors — add one in Our Vendors" : "Select a vendor"}
                options={vendorOptions}
              />
            ) : (
              <input
                type="text"
                aria-label="Maintenance by (individual)"
                value={form.maintenanceBy}
                onChange={(e) => update("maintenanceBy", e.target.value)}
                className={inputClass}
                placeholder="e.g. mechanic name"
              />
            )}
          </div>
        </div>

        <Field label="Compliant">
          <textarea
            value={form.compliant}
            onChange={(e) => update("compliant", e.target.value)}
            className={inputClass}
            rows={3}
          />
        </Field>

        <Field label="Remarks" required>
          <textarea
            required
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
            className={inputClass}
            rows={3}
          />
        </Field>

        {/* Proof of Payment — up to 5 images and 3 PDFs (10 MB each). Not a
            <Field>/<label>: a label would forward clicks to the remove buttons.
            New records only — an existing record's files are managed from the
            paperclip in its Maintenance Record list. */}
        {isEdit ? (
          requireReason && (
            <Field label="Reason for edit" required>
              <textarea
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className={inputClass}
                rows={3}
                placeholder="Explain why this record needs to be changed…"
              />
            </Field>
          )
        ) : (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-gray-700">Proof of Payment</span>
            <span className="text-xs text-gray-400">
              Images {imageCount}/{PROOF_MAX_IMAGES} · PDFs {pdfCount}/{PROOF_MAX_PDFS}
            </span>
          </div>
          <label
            className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-4 text-sm transition-colors ${
              proofsFull
                ? "cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400"
                : "border-gray-300 text-gray-600 hover:border-blue-400 hover:bg-blue-50/40 hover:text-blue-700"
            }`}
          >
            <Paperclip className="h-4 w-4" />
            {proofsFull ? "Maximum files added" : "Upload images or PDFs (max 10 MB each)"}
            <input
              type="file"
              multiple
              disabled={proofsFull}
              accept="image/jpeg,image/png,image/webp,image/gif,image/bmp,.jpg,.jpeg,.png,.webp,.gif,.bmp,.pdf,application/pdf"
              className="sr-only"
              onChange={(e) => {
                addProofs(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          {proofError && <p className="text-xs text-red-600">{proofError}</p>}
          {proofs.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {proofs.map((p) => (
                <li key={p.key} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-2.5 py-2">
                  {p.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.url} alt="" className="h-9 w-9 shrink-0 rounded object-cover" />
                  ) : (
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-red-50 text-red-600">
                      <FileText className="h-4 w-4" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-gray-800">{p.file.name}</span>
                    <span className="block text-xs text-gray-400">{proofTypeLabel(p.file.name, p.kind)} · {fileSize(p.file.size)}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => removeProof(p.key)}
                    aria-label={`Remove ${p.file.name}`}
                    className="rounded-full p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        )}

        <div className="mt-2 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => { if (!isEdit) clearFormDraft(draftKey); onClose(); }}
            className="btn-interactive rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-all duration-200 hover:bg-gray-50 active:scale-95"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || (requireReason && !reason.trim())}
            className="btn-interactive rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:bg-blue-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitLabel}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
