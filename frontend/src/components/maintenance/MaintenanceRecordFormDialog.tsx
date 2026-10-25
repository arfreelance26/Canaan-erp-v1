"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { BellRing, Check, FileText, Paperclip, X } from "lucide-react";
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

/** Repair Type holds one or more repairs as "A, B, C" (repair names can't
 *  contain a comma — Maintenance Management refuses one). */
export function splitRepairs(value: string | null | undefined): string[] {
  return (value ?? "").split(",").map((r) => r.trim()).filter(Boolean);
}

const MAINTENANCE_BY_TYPES = ["Vendor", "Individual"] as const;
// Mirrors REMIND_SOON_KM in backend/maintenance_reminders.py.
const REMIND_SOON_KM = 500;
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
  invoiceNumber: "",
  invoiceDate: "",
  remindAtOdometer: "",
};

export function MaintenanceRecordFormDialog({
  open, onClose, onSave, truck, saving = false, editRecord = null, requireReason = false,
}: MaintenanceRecordFormDialogProps) {
  const isEdit = editRecord !== null;
  const [form, setForm] = useState<Omit<MaintenanceRecord, "id" | "truckId">>(emptyForm);
  const [reason, setReason] = useState("");
  // Shown once Submit is pressed with no repair picked (chips can't use `required`).
  const [repairMissing, setRepairMissing] = useState(false);
  // Maintenance Type and Repair Type both come from Admin > Maintenance
  // Management (categories and each category's repair types).
  const [categories, setCategories] = useState<MaintenanceCategory[]>([]);
  const [maintenanceByType, setMaintenanceByType] = useState<MaintenanceByType>("Vendor");
  // The picked vendor's id — saved with the record so Our Vendors → View Record
  // can list it (form.maintenanceBy keeps the name).
  const [vendorId, setVendorId] = useState("");
  // "Notify me when this is due again": the target odometer lives in
  // form.remindAtOdometer; "remind after" is the same thing as a distance from
  // this record's odometer — typing either one fills in the other.
  const [remindOn, setRemindOn] = useState(false);
  const [remindAfter, setRemindAfter] = useState("");

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
    setRepairMissing(false);
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
        invoiceNumber: editRecord.invoiceNumber ?? "",
        invoiceDate: editRecord.invoiceDate ?? "",
        remindAtOdometer: editRecord.remindAtOdometer ?? "",
      });
      const target = Number(editRecord.remindAtOdometer || 0);
      setRemindOn(target > 0);
      setRemindAfter(target > 0 ? String(target - Number(editRecord.odometer || 0)) : "");
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
      setRemindOn(false);
      setRemindAfter("");
    }
  }, [open, truck?.id, editRecord]);

  const imageCount = proofs.filter((p) => p.kind === "image").length;
  const pdfCount = proofs.filter((p) => p.kind === "pdf").length;
  const proofsFull = imageCount >= PROOF_MAX_IMAGES && pdfCount >= PROOF_MAX_PDFS;

  const categoryOptions = categories.map((c) => ({ value: c.name, label: c.name }));
  const selectedCategory = categories.find((c) => c.name === form.maintenanceType);
  const repairOptions = (selectedCategory?.repairs ?? []).map((r) => r.name);
  const selectedRepairs = splitRepairs(form.repairType);
  // An edited record may name a repair since removed from the category — keep it pickable.
  const repairChips = [...repairOptions, ...selectedRepairs.filter((r) => !repairOptions.includes(r))];

  function toggleRepair(name: string) {
    const next = selectedRepairs.includes(name)
      ? selectedRepairs.filter((r) => r !== name)
      : repairChips.filter((r) => r === name || selectedRepairs.includes(r));   // keep the list's order
    update("repairType", next.join(", "));
    if (next.length) setRepairMissing(false);
  }

  // A different Maintenance Type invalidates whatever Repair Types were picked
  // for the previous one — repair types belong to a category.
  function handleMaintenanceTypeChange(value: string) {
    setForm((prev) => ({ ...prev, maintenanceType: value, repairType: "" }));
  }

  const draftKey = `erp_maintenance_record_draft_${truck?.id ?? "none"}`;
  // Merge over emptyForm rather than replacing outright — an older draft saved
  // before these fields existed would otherwise restore without them, flipping
  // their inputs from controlled to uncontrolled (undefined value).
  // Drafts are for new records only — an edit always starts from the saved record.
  useFormDraft(draftKey, open && !isEdit, form, (draft) => {
    setForm({ ...emptyForm, ...draft });
    const target = Number(draft.remindAtOdometer || 0);
    setRemindOn(target > 0);
    setRemindAfter(target > 0 && draft.odometer ? String(target - Number(draft.odometer)) : "");
  });

  function update<K extends keyof Omit<MaintenanceRecord, "id" | "truckId">>(
    key: K,
    value: Omit<MaintenanceRecord, "id" | "truckId">[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const currentOdometer = truck ? Number(truck.odometer) : null;
  const enteredOdometer = form.odometer !== "" ? Number(form.odometer) : null;
  const odometerTooHigh = enteredOdometer !== null && currentOdometer !== null && enteredOdometer > currentOdometer;

  // The reminder must be ahead of where the truck already is (and of this
  // record's own reading) — otherwise it would go off the moment it's saved.
  // Unchanged on an edit, it's left alone even if the truck has passed it.
  const remindTarget = form.remindAtOdometer ? Number(form.remindAtOdometer) : null;
  const remindFloor = Math.max(currentOdometer ?? 0, enteredOdometer ?? 0);
  const remindUnchanged = isEdit && (form.remindAtOdometer ?? "") === (editRecord?.remindAtOdometer ?? "");
  const remindError = !remindOn
    ? ""
    : remindTarget === null || remindTarget <= 0
      ? "Enter the odometer to be reminded at."
      : !remindUnchanged && remindTarget <= remindFloor
        ? `Must be above ${remindFloor.toLocaleString("en-IN")} km (the truck's current odometer).`
        : "";

  function handleOdometerChange(value: string) {
    setForm((prev) => ({
      ...prev,
      odometer: value,
      // Keep "remind after N km" meaning N km after this service.
      remindAtOdometer: remindAfter && value !== "" ? String(Number(value) + Number(remindAfter)) : prev.remindAtOdometer,
    }));
  }

  function handleRemindAfterChange(value: string) {
    setRemindAfter(value);
    update("remindAtOdometer", value !== "" && form.odometer !== "" ? String(Number(form.odometer) + Number(value)) : "");
  }

  function handleRemindAtChange(value: string) {
    update("remindAtOdometer", value);
    setRemindAfter(value !== "" && form.odometer !== "" ? String(Number(value) - Number(form.odometer)) : "");
  }

  function handleRemindToggle(on: boolean) {
    setRemindOn(on);
    if (!on) {
      setRemindAfter("");
      update("remindAtOdometer", "");
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!truck) return;
    if (odometerTooHigh || remindError || saving) return;
    if (requireReason && !reason.trim()) return;
    if (repairOptions.length > 0 && selectedRepairs.length === 0) {
      setRepairMissing(true);
      return;
    }
    if (!isEdit) clearFormDraft(draftKey);
    onSave(
      {
        id: editRecord?.id ?? crypto.randomUUID(),
        truckId: truck.id,
        version: editRecord?.version,
        ...form,
        maintenanceByType: form.maintenanceBy ? maintenanceByType : null,
        vendorId: maintenanceByType === "Vendor" && vendorId ? vendorId : null,
        remindAtOdometer: remindOn ? form.remindAtOdometer : "",
      },
      isEdit ? [] : proofs.map((p) => p.file),
      requireReason ? reason.trim() : undefined,
    );
  }

  const title = isEdit ? "Edit Maintenance Record" : "Update Maintenance Record";
  const submitLabel = saving
    ? (isEdit ? (requireReason ? "Submitting…" : "Saving…") : proofs.length ? "Submitting & uploading…" : "Submitting…")
    : isEdit ? (requireReason ? "Submit Edit Request" : "Save Changes") : "Submit for Approval";

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
        {!isEdit && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
            This record goes to <span className="font-semibold">Maintenance Approvals</span> and is added to the truck&apos;s record once Admin or Accounts approves it.
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
              onChange={(e) => handleOdometerChange(e.target.value)}
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
              would make the form impossible to submit. One maintenance can
              cover several repairs, so it's a multi-select. Not a <Field>:
              a <label> would forward clicks to the first chip. */}
          {repairChips.length > 0 && (
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-gray-700">
                  Repair Type <span className="ml-1 text-red-500">*</span>
                  <span className="ml-1.5 text-xs font-normal text-gray-400">pick all that were done</span>
                </span>
                {selectedRepairs.length > 0 && (
                  <span className="text-xs font-semibold text-blue-600">{selectedRepairs.length} selected</span>
                )}
              </div>
              <div
                role="group"
                aria-label="Repair types"
                className={`flex flex-wrap gap-1.5 rounded-lg border p-2 ${repairMissing ? "border-red-300 bg-red-50/40" : "border-gray-200 bg-gray-50/60"}`}
              >
                {repairChips.map((name) => {
                  const on = selectedRepairs.includes(name);
                  return (
                    <button
                      key={name}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleRepair(name)}
                      className={`flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition-all duration-150 ${
                        on
                          ? "border-brand-navy bg-brand-navy text-white shadow-[0_2px_6px_-1px_rgba(27,43,94,0.45)]"
                          : "border-gray-200 bg-white text-gray-600 hover:border-blue-300 hover:text-blue-700"
                      }`}
                    >
                      {on && <Check className="h-3 w-3" />}
                      {name}
                    </button>
                  );
                })}
              </div>
              {repairMissing && <p className="text-xs text-red-600">Pick at least one repair type.</p>}
            </div>
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

        {/* Maintenance reminder — not a <Field>/<label> (see Maintenance By). */}
        <div className={`rounded-xl border px-4 py-3 transition-colors ${remindOn ? "border-amber-200 bg-amber-50/50" : "border-gray-200 bg-gray-50/60"}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${remindOn ? "bg-amber-100 text-amber-600" : "bg-white text-gray-400 ring-1 ring-gray-200"}`}>
                <BellRing className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800">Notify me when this is due again?</p>
                <p className="text-xs text-gray-500">Get an alert when the truck reaches a set odometer.</p>
              </div>
            </div>
            <div role="radiogroup" aria-label="Maintenance reminder" className="flex shrink-0 gap-0.5 rounded-full border border-gray-200 bg-gray-100 p-0.5 shadow-inner">
              {([false, true] as const).map((on) => (
                <button
                  key={String(on)}
                  type="button"
                  role="radio"
                  aria-checked={remindOn === on}
                  onClick={() => handleRemindToggle(on)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition-all duration-200 ${
                    remindOn === on
                      ? "bg-brand-navy text-white shadow-[0_2px_6px_-1px_rgba(27,43,94,0.45)]"
                      : "text-gray-500 hover:bg-white/70 hover:text-gray-800"
                  }`}
                >
                  {on ? "Yes" : "No"}
                </button>
              ))}
            </div>
          </div>

          {remindOn && (
            <div className="mt-3 grid grid-cols-1 gap-3 border-t border-amber-200/70 pt-3 sm:grid-cols-2">
              <Field label="Remind after (km)">
                <DecimalInput type="number"
                  min="1"
                  value={remindAfter}
                  onChange={(e) => handleRemindAfterChange(e.target.value)}
                  disabled={form.odometer === ""}
                  className={inputClass}
                  placeholder={form.odometer === "" ? "Enter the odometer first" : "e.g. 10000"}
                />
              </Field>
              <Field label="Remind at odometer (km)" required>
                <DecimalInput type="number"
                  required
                  min="1"
                  value={form.remindAtOdometer ?? ""}
                  onChange={(e) => handleRemindAtChange(e.target.value)}
                  className={`${inputClass} ${remindError && form.remindAtOdometer ? "border-red-400 ring-2 ring-red-100" : ""}`}
                  placeholder="e.g. 95000"
                />
              </Field>
              <p className={`text-xs sm:col-span-2 ${remindError && form.remindAtOdometer ? "text-red-600" : "text-gray-500"}`}>
                {remindError && form.remindAtOdometer
                  ? remindError
                  : remindTarget
                    ? <>Admin, Commercial Managers and Maintenance get a heads-up at <span className="font-semibold text-gray-700">{Math.max(remindTarget - REMIND_SOON_KM, 0).toLocaleString("en-IN")} km</span> and an alert when the truck reaches <span className="font-semibold text-gray-700">{remindTarget.toLocaleString("en-IN")} km</span>.</>
                    : `Admin, Commercial Managers and Maintenance get a heads-up ${REMIND_SOON_KM} km before, and an alert when the truck reaches it.`}
              </p>
            </div>
          )}
        </div>

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
            disabled={saving || !!remindError || (requireReason && !reason.trim())}
            className="btn-interactive rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:bg-blue-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitLabel}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
