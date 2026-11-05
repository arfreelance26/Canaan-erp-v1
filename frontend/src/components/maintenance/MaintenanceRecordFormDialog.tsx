"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { RiNotification4Line as BellRing, RiCheckLine as Check, RiFileTextLine as FileText, RiAttachment2 as Paperclip, RiCloseLine as X, RiCalendarScheduleLine as Scheduled } from "@remixicon/react";
import type { MaintenanceRequest } from "@/types/maintenance-request";
import { formatDate } from "@/lib/format-date";
import { Dialog } from "@/components/ui/Dialog";
import { Field, inputClass } from "@/components/ui/Field";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import { GlassCombobox } from "@/components/ui/GlassCombobox";
import { maintenanceCategoriesApi, vendorsApi } from "@/lib/api";
import type { Vendor } from "@/types/vendor";
import { PROOF_MAX_BYTES, PROOF_MAX_IMAGES, PROOF_MAX_PDFS, type MaintenanceRecord, type RepairLine } from "@/types/truck-maintenance";
import { RepairCard, emptyRepairLine } from "@/components/maintenance/RepairCard";
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
  onSave: (record: MaintenanceRecord, proofs: File[], reason?: string, opts?: { schedule: boolean }) => void;
  truck: Truck | null;
  /** True while the record is being saved and its proofs uploaded. */
  saving?: boolean;
  /** Edit mode: the record to edit (its fields prefill the form). */
  editRecord?: MaintenanceRecord | null;
  /** Edit mode for non-Admins: the change goes to Edit Approvals, so a reason is required. */
  requireReason?: boolean;
  /** Add-costs mode: a job from Scheduled Records, prefilled; its costs are now required. */
  scheduledJob?: MaintenanceRequest | null;
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

// Mirrors REMIND_SOON_KM in backend/maintenance_reminders.py.
const REMIND_SOON_KM = 500;

const money = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/** The fields "Same vendor & invoice for all" copies from the first repair. */
const SHARED: (keyof RepairLine)[] = ["maintenanceLocation", "maintenanceByType", "vendorId", "maintenanceBy", "invoiceNumber", "invoiceDate"];

/** A record saved before repair cards held several repairs in one line
 *  ("A, B" with one cost): split it, the cost staying on the first. */
function linesFromRecord(record: MaintenanceRecord): RepairLine[] {
  const lines = record.repairLines ?? [];
  if (lines.length === 1 && lines[0].repairType.includes(",")) {
    return splitRepairs(lines[0].repairType).map((name, i) => ({ ...lines[0], repairType: name, cost: i === 0 ? lines[0].cost : "0" }));
  }
  return lines.map((l) => ({ ...l, maintenanceByType: l.maintenanceByType ?? (l.vendorId ? "Vendor" : l.maintenanceBy ? "Individual" : "Vendor") }));
}

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
  repairLines: [],
};

export function MaintenanceRecordFormDialog({
  open, onClose, onSave, truck, saving = false, editRecord = null, requireReason = false, scheduledJob = null,
}: MaintenanceRecordFormDialogProps) {
  const isEdit = editRecord !== null;
  const addingCosts = !isEdit && scheduledJob !== null;
  // "Do you know the cost yet?" — Not yet saves the job to Scheduled Records,
  // its costs added later. Nothing is counted until then (and approval).
  const [costKnown, setCostKnown] = useState(true);
  const scheduling = !isEdit && !addingCosts && !costKnown;
  const [form, setForm] = useState<Omit<MaintenanceRecord, "id" | "truckId">>(emptyForm);
  const [reason, setReason] = useState("");
  // Shown once Submit is pressed with no repair picked (chips can't use `required`).
  const [repairMissing, setRepairMissing] = useState(false);
  // Maintenance Type and Repair Type both come from Admin > Maintenance
  // Management (categories and each category's repair types).
  const [categories, setCategories] = useState<MaintenanceCategory[]>([]);
  // Each repair has its own cost, place, who did it and invoice (repair
  // cards). "Same vendor & invoice for all" makes cards 2+ follow card 1.
  const [sameForAll, setSameForAll] = useState(false);
  // Shown once Submit is pressed with a repair's cost left empty.
  const [costsChecked, setCostsChecked] = useState(false);
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

  const vendorOptions = [...vendors]
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
    setCostsChecked(false);
    setSameForAll(false);
    setCostKnown(true);
    if (scheduledJob && !editRecord) {
      const job = scheduledJob;
      setForm({
        ...emptyForm,
        date: job.date,
        maintenanceEndDate: job.maintenanceEndDate,
        odometer: String(job.odometer || ""),
        maintenanceType: job.maintenanceType,
        repairType: job.repairType,
        compliant: job.compliant,
        description: job.description,
        remindAtOdometer: job.remindAtOdometer != null ? String(job.remindAtOdometer) : "",
        repairLines: job.repairLines.map((l) => ({
          ...l,
          maintenanceByType: l.maintenanceByType ?? (l.vendorId ? "Vendor" : l.maintenanceBy ? "Individual" : "Vendor"),
        })),
      });
      const target = Number(job.remindAtOdometer || 0);
      setRemindOn(target > 0);
      setRemindAfter(target > 0 && job.odometer ? String(target - job.odometer) : "");
    } else if (editRecord) {
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
        repairLines: linesFromRecord(editRecord),
      });
      const target = Number(editRecord.remindAtOdometer || 0);
      setRemindOn(target > 0);
      setRemindAfter(target > 0 ? String(target - Number(editRecord.odometer || 0)) : "");
    } else {
      setForm(emptyForm);
      setRemindOn(false);
      setRemindAfter("");
    }
  }, [open, truck?.id, editRecord, scheduledJob]);

  const imageCount = proofs.filter((p) => p.kind === "image").length;
  const pdfCount = proofs.filter((p) => p.kind === "pdf").length;
  const proofsFull = imageCount >= PROOF_MAX_IMAGES && pdfCount >= PROOF_MAX_PDFS;

  const categoryOptions = categories.map((c) => ({ value: c.name, label: c.name }));
  const selectedCategory = categories.find((c) => c.name === form.maintenanceType);
  const repairOptions = (selectedCategory?.repairs ?? []).map((r) => r.name);
  const selectedRepairs = splitRepairs(form.repairType);
  // An edited record may name a repair since removed from the category — keep it pickable.
  const repairChips = [...repairOptions, ...selectedRepairs.filter((r) => !repairOptions.includes(r))];

  // One card per picked repair type, in the list's order. A maintenance type
  // with no repair types set up gets a single card named after it.
  const wanted = repairChips.length > 0 ? selectedRepairs : form.maintenanceType ? [form.maintenanceType] : [];
  const lines = ((): RepairLine[] => {
    const byName = new Map((form.repairLines ?? []).map((l) => [l.repairType, l]));
    const own = wanted.map((name) => byName.get(name) ?? emptyRepairLine(name));
    if (!sameForAll || own.length < 2) return own;
    const first = own[0];
    return own.map((l, i) => (i === 0 ? l : { ...l, ...Object.fromEntries(SHARED.map((k) => [k, first[k]])) }));
  })();
  const total = lines.reduce((sum, l) => sum + (parseFloat(l.cost) || 0), 0);
  const missingCost = lines.map((l) => l.cost.trim() === "" || Number.isNaN(parseFloat(l.cost)));

  function updateLine(name: string, patch: Partial<RepairLine>) {
    setForm((prev) => {
      const current = prev.repairLines ?? [];
      const exists = current.some((l) => l.repairType === name);
      return {
        ...prev,
        repairLines: exists
          ? current.map((l) => (l.repairType === name ? { ...l, ...patch } : l))
          : [...current, { ...emptyRepairLine(name), ...patch }],
      };
    });
  }

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
  useFormDraft(draftKey, open && !isEdit && !addingCosts, form, (draft) => {
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

  // The reminder must be ahead of where the truck already is (and of this
  // record's own reading) — otherwise it would go off the moment it's saved.
  // Unchanged on an edit, it's left alone even if the truck has passed it.
  const remindTarget = form.remindAtOdometer ? Number(form.remindAtOdometer) : null;
  const remindFloor = Math.max(currentOdometer ?? 0, enteredOdometer ?? 0);
  const remindUnchanged = (isEdit && (form.remindAtOdometer ?? "") === (editRecord?.remindAtOdometer ?? ""))
    || (addingCosts && (form.remindAtOdometer ?? "") === (scheduledJob?.remindAtOdometer != null ? String(scheduledJob.remindAtOdometer) : ""));
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
    if (remindError || saving) return;
    if (requireReason && !reason.trim()) return;
    if (repairOptions.length > 0 && selectedRepairs.length === 0) {
      setRepairMissing(true);
      return;
    }
    if (lines.length === 0 || (!scheduling && missingCost.some(Boolean))) {
      setCostsChecked(true);
      return;
    }
    if (!isEdit && !addingCosts) clearFormDraft(draftKey);
    const first = lines[0];
    onSave(
      {
        id: editRecord?.id ?? crypto.randomUUID(),
        truckId: truck.id,
        version: editRecord?.version,
        ...form,
        // The repairs carry the cost, place, vendor and invoice; the record's
        // own fields hold the total and mirror the first repair.
        repairLines: lines,
        repairType: lines.map((l) => l.repairType).join(", "),
        cost: String(total),
        maintenanceLocation: first.maintenanceLocation,
        maintenanceBy: first.maintenanceBy,
        maintenanceByType: first.maintenanceBy || first.vendorId ? first.maintenanceByType : null,
        vendorId: first.maintenanceByType === "Vendor" ? first.vendorId : null,
        invoiceNumber: first.invoiceNumber,
        invoiceDate: first.invoiceDate,
        remindAtOdometer: remindOn ? form.remindAtOdometer : "",
      },
      isEdit ? [] : proofs.map((p) => p.file),
      requireReason ? reason.trim() : undefined,
      { schedule: scheduling },
    );
  }

  const title = isEdit ? "Edit Maintenance Record" : addingCosts ? "Add Costs" : "Update Maintenance Record";
  const submitLabel = saving
    ? (isEdit ? (requireReason ? "Submitting…" : "Saving…") : scheduling ? "Saving…" : proofs.length ? "Submitting & uploading…" : "Submitting…")
    : isEdit ? (requireReason ? "Submit Edit Request" : "Save Changes") : scheduling ? "Save to Scheduled Records" : "Submit for Approval";
  const costsLeft = missingCost.filter(Boolean).length;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={truck ? `${title} — ${truck.registrationNumber}` : title}
      tour="maintenance-record"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {isEdit && requireReason && (
          <div className="rounded-lg border border-warning-border bg-warning-surface px-4 py-2.5 text-xs text-warning-text-strong">
            Your changes go to <span className="font-semibold">Edit Approvals</span> and are applied once an Admin approves them.
          </div>
        )}
        {/* New records: is the cost known yet? Not yet → Scheduled Records. */}
        {!isEdit && !addingCosts && (
          <div data-tour="maintenance-cost-known" className={`rounded-xl border px-4 py-3 transition-colors ${scheduling ? "border-teal-border bg-teal-surface" : "border-separator-border bg-fill-1"}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${scheduling ? "bg-teal-surface-strong text-teal-text" : "bg-background-primary-default text-text-tertiary ring-1 ring-separator-border"}`}>
                  <Scheduled className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-body-medium text-text-primary">Do you know the cost yet?</p>
                  <p className="text-xs text-text-secondary">Not yet? Save it now and add the cost later.</p>
                </div>
              </div>
              <div role="radiogroup" aria-label="Do you know the cost yet?" className="flex shrink-0 gap-0.5 rounded-full border border-separator-border bg-fill-2 p-0.5 shadow-inner">
                {([true, false] as const).map((known) => (
                  <button
                    key={String(known)}
                    type="button"
                    role="radio"
                    aria-checked={costKnown === known}
                    onClick={() => { setCostKnown(known); setCostsChecked(false); }}
                    className={`rounded-full px-3 py-1 text-caption-1-semibold transition duration-200 ${
                      costKnown === known
                        ? known ? "bg-accent-solid text-on-solid shadow-md" : "bg-teal-solid text-on-solid shadow-md"
                        : "text-text-secondary hover:bg-fill-2 hover:text-text-primary"
                    }`}
                  >
                    {known ? "Yes" : "Not yet"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        {!isEdit && (scheduling ? (
          <div className="rounded-lg border border-teal-border bg-teal-surface px-4 py-2.5 text-xs text-teal-text-strong">
            This job is saved to the truck&apos;s <span className="font-semibold">Scheduled Records</span>. Add the costs there when the bill arrives; it then goes for approval and lands on its start date, so the P&amp;L of that day stays right. Nothing is counted until then.
          </div>
        ) : addingCosts ? (
          <div className="rounded-lg border border-teal-border bg-teal-surface px-4 py-2.5 text-xs text-teal-text-strong">
            Scheduled by <span className="font-semibold">{scheduledJob?.submittedByName || "someone"}</span>
            {scheduledJob?.createdAt ? <> on {formatDate(scheduledJob.createdAt)}</> : null}. Add every repair&apos;s cost; it then goes to <span className="font-semibold">Maintenance Approvals</span> and is counted on its start date{form.date ? <> ({formatDate(form.date)})</> : null}.
          </div>
        ) : (
          <div className="rounded-lg border border-warning-border bg-warning-surface px-4 py-2.5 text-xs text-warning-text-strong">
            This record goes to <span className="font-semibold">Maintenance Approvals</span> and is added to the truck&apos;s record once Admin or Accounts approves it.
          </div>
        ))}
        {currentOdometer !== null && currentOdometer > 0 && (
          <div className="flex items-center gap-3 rounded-lg border border-accent-border bg-accent-surface px-4 py-2.5">
            <span className="text-caption-1-semibold text-accent-text">Current Odometer</span>
            <span className="ml-auto text-body-semibold text-accent-text-strong">{currentOdometer.toLocaleString("en-IN")} km</span>
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
              value={form.odometer}
              onChange={(e) => handleOdometerChange(e.target.value)}
              className={inputClass}
              placeholder="e.g. 85000"
            />
            {currentOdometer !== null && currentOdometer > 0 && (
              <p className="mt-1 text-xs text-text-tertiary">Enter the odometer reading when this maintenance was done.</p>
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
                <span className="text-body-medium text-text-primary">
                  Repair Type <span className="ml-1 text-danger-text">*</span>
                  <span className="ml-1.5 text-caption-1-regular text-text-tertiary">pick all that were done</span>
                </span>
                {selectedRepairs.length > 0 && (
                  <span className="text-caption-1-semibold text-accent-text">{selectedRepairs.length} selected</span>
                )}
              </div>
              <div
                role="group"
                aria-label="Repair types"
                className={`flex flex-wrap gap-1.5 rounded-lg border p-2 ${repairMissing ? "border-danger-border-strong bg-danger-surface/40" : "border-separator-border bg-fill-1"}`}
              >
                {repairChips.map((name) => {
                  const on = selectedRepairs.includes(name);
                  return (
                    <button
                      key={name}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleRepair(name)}
                      className={`flex items-center gap-1 rounded-full border px-3 py-1 text-caption-1-semibold transition duration-150 ${
                        on
                          ? "border-accent-solid bg-accent-solid text-on-solid shadow-md"
                          : "border-separator-border bg-background-primary-default text-text-secondary hover:border-accent-border-strong hover:text-accent-text"
                      }`}
                    >
                      {on && <Check className="h-3 w-3" />}
                      {name}
                    </button>
                  );
                })}
              </div>
              {repairMissing && <p className="text-xs text-danger-text">Pick at least one repair type.</p>}
            </div>
          )}

        </div>

        {/* The repairs: one card each, with its own cost, place, vendor and invoice. */}
        {lines.length > 0 && (
          <div data-tour="maintenance-repairs" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-body-semibold text-text-primary">
                Repairs <span className="ml-1 text-caption-1-regular text-text-tertiary">({lines.length})</span>
              </span>
              {lines.length > 1 && (
                <label className="flex cursor-pointer items-center gap-2 text-caption-1-semibold text-text-secondary">
                  <input
                    type="checkbox"
                    checked={sameForAll}
                    onChange={(e) => setSameForAll(e.target.checked)}
                    className="size-4 rounded border-border-button-default"
                  />
                  Same vendor &amp; invoice for all
                </label>
              )}
            </div>
            {lines.map((line, i) => (
              <RepairCard
                key={line.repairType}
                line={line}
                index={i}
                onChange={(patch) => updateLine(line.repairType, patch)}
                onRemove={repairChips.length > 0 && lines.length > 1 ? () => toggleRepair(line.repairType) : undefined}
                vendorOptions={vendorOptions}
                vendorName={(id) => vendors.find((v) => v.id === id)?.name ?? ""}
                vendorsLoaded={vendorsLoaded}
                followsFirst={sameForAll && i > 0}
                costMissing={costsChecked && !scheduling && missingCost[i]}
                costOptional={scheduling}
              />
            ))}
          </div>
        )}

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
        <div className={`rounded-xl border px-4 py-3 transition-colors ${remindOn ? "border-warning-border bg-warning-surface/50" : "border-separator-border bg-fill-1"}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${remindOn ? "bg-warning-surface-strong text-warning-text" : "bg-background-primary-default text-text-tertiary ring-1 ring-separator-border"}`}>
                <BellRing className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-body-medium text-text-primary">Notify me when this is due again?</p>
                <p className="text-xs text-text-secondary">Get an alert when the truck reaches a set odometer.</p>
              </div>
            </div>
            <div role="radiogroup" aria-label="Maintenance reminder" className="flex shrink-0 gap-0.5 rounded-full border border-separator-border bg-fill-2 p-0.5 shadow-inner">
              {([false, true] as const).map((on) => (
                <button
                  key={String(on)}
                  type="button"
                  role="radio"
                  aria-checked={remindOn === on}
                  onClick={() => handleRemindToggle(on)}
                  className={`rounded-full px-3 py-1 text-caption-1-semibold transition duration-200 ${
                    remindOn === on
                      ? "bg-accent-solid text-on-solid shadow-md"
                      : "text-text-secondary hover:bg-fill-2 hover:text-text-primary"
                  }`}
                >
                  {on ? "Yes" : "No"}
                </button>
              ))}
            </div>
          </div>

          {remindOn && (
            <div className="mt-3 grid grid-cols-1 gap-3 border-t border-warning-border/70 pt-3 sm:grid-cols-2">
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
                  className={`${inputClass} ${remindError && form.remindAtOdometer ? "border-danger-border-strong ring-2 ring-danger-border" : ""}`}
                  placeholder="e.g. 95000"
                />
              </Field>
              <p className={`text-xs sm:col-span-2 ${remindError && form.remindAtOdometer ? "text-danger-text" : "text-text-secondary"}`}>
                {remindError && form.remindAtOdometer
                  ? remindError
                  : remindTarget
                    ? <>Admin, Commercial Managers and Maintenance get a heads-up at <span className="font-semibold text-text-primary">{Math.max(remindTarget - REMIND_SOON_KM, 0).toLocaleString("en-IN")} km</span> and an alert when the truck reaches <span className="font-semibold text-text-primary">{remindTarget.toLocaleString("en-IN")} km</span>.</>
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
            <span className="text-body-medium text-text-primary">
              Proof of Payment
              {addingCosts && (scheduledJob?.proofCount ?? 0) > 0 && (
                <span className="ml-1.5 text-caption-1-regular text-text-tertiary">{scheduledJob!.proofCount} already attached</span>
              )}
            </span>
            <span className="text-xs text-text-tertiary">
              Images {imageCount}/{PROOF_MAX_IMAGES} · PDFs {pdfCount}/{PROOF_MAX_PDFS}
            </span>
          </div>
          <label
            className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-4 text-sm transition-colors ${
              proofsFull
                ? "cursor-not-allowed border-separator-border bg-fill-1 text-text-tertiary"
                : "border-border-button-default text-text-secondary hover:border-accent-border-strong hover:bg-accent-surface-strong/40 hover:text-accent-text"
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
          {proofError && <p className="text-xs text-danger-text">{proofError}</p>}
          {proofs.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {proofs.map((p) => (
                <li key={p.key} className="flex items-center gap-3 rounded-lg border border-separator-border bg-background-primary-default px-2.5 py-2">
                  {p.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.url} alt="" className="h-9 w-9 shrink-0 rounded object-cover" />
                  ) : (
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-danger-surface text-danger-text">
                      <FileText className="h-4 w-4" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-text-primary">{p.file.name}</span>
                    <span className="block text-xs text-text-tertiary">{proofTypeLabel(p.file.name, p.kind)} · {fileSize(p.file.size)}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => removeProof(p.key)}
                    aria-label={`Remove ${p.file.name}`}
                    className="rounded-full p-1 text-text-tertiary transition-colors hover:bg-danger-surface-strong hover:text-danger-text"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        )}

        {/* The total of every repair above. */}
        {lines.length > 0 && (
          <div data-tour="maintenance-total" className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-accent-border bg-accent-surface px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-body-semibold text-accent-text-strong">
                Total cost <span className="font-normal text-accent-text">· {lines.length} repair{lines.length === 1 ? "" : "s"}</span>
              </p>
              {lines.length > 1 && (
                <p className="mt-0.5 truncate text-xs text-accent-text">
                  {lines.map((l) => `${l.repairType} ${money(parseFloat(l.cost) || 0)}`).join(" · ")}
                </p>
              )}
            </div>
            <span className="text-title-3-semibold tabular-nums text-accent-text-strong">
              {scheduling && costsLeft > 0 ? (costsLeft === lines.length ? "Added later" : `${money(total)} so far`) : money(total)}
            </span>
          </div>
        )}

        <div className="mt-2 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => { if (!isEdit && !addingCosts) clearFormDraft(draftKey); onClose(); }}
            className="btn-interactive rounded-lg border border-separator-border px-4 py-2 text-body-medium text-text-primary transition duration-200 hover:bg-fill-2"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !!remindError || (requireReason && !reason.trim())}
            className={`btn-interactive rounded-lg px-4 py-2 text-body-medium text-on-solid transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${scheduling ? "bg-teal-solid hover:bg-teal-solid-hover" : "bg-accent-solid hover:bg-accent-solid-hover"}`}
          >
            {submitLabel}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
