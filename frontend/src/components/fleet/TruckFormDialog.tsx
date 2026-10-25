"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Upload, X, FileText, Image as ImageIcon } from "lucide-react";
import { showError, validateFileSize } from "@/lib/swal";
import { GlassSelect } from "@/components/ui/GlassSelect";
import { GlassCombobox } from "@/components/ui/GlassCombobox";
import { FilePreviewBadge } from "@/components/ui/FilePreviewBadge";
import { Dialog } from "@/components/ui/Dialog";
import { Field, inputClass } from "@/components/ui/Field";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import { TRUCK_TYPE_OPTIONS } from "@/lib/truck-data";
import type { Branch } from "@/types/branch";
import { branchesApi, adblueApi, trucksApi } from "@/lib/api";
import { getTyreLayout, TYRE_LAYOUT_OPTIONS } from "@/lib/tyre-layouts";
import { TyreLayoutDiagram } from "@/components/fleet/TyreLayoutDiagram";
import type { Truck } from "@/types/truck";
import { useFormDraft, clearFormDraft } from "@/hooks/useFormDraft";
import { DecimalInput } from "@/components/ui/DecimalInput";
import { ComplianceDocsReadOnly } from "@/components/fleet/ComplianceDocsReadOnly";
import { VehicleImagesSection, VEHICLE_IMAGES, type VehicleImageField } from "@/components/fleet/VehicleImages";

export const DRAFT_KEY = "erp_truck_form_draft";

const sectionHeadingClass =
  "text-xs font-semibold uppercase tracking-wider text-blue-900 bg-blue-50 px-3 py-2 rounded-lg";

export type TruckFiles = {
  /** Vehicle Identity Image (shown on the Our Fleet card). */
  photo?: File | null;
  front_view?: File | null;
  rear_view?: File | null;
  left_view?: File | null;
  right_view?: File | null;
  /** Saved Vehicle Images the user removed — cleared after the truck is saved. */
  removeImages?: VehicleImageField[];
  rc?: File | null;
  fc?: File | null;
  road_tax?: File | null;
  insurance_proof?: File | null;
  national_permit?: File | null;
  local_permit?: File | null;
  pollution_cert?: File | null;
};

type TruckFormDialogProps = {
  open: boolean;
  onClose: () => void;
  onSave: (truck: Truck, files: TruckFiles) => void | Promise<void>;
  initialData: Truck | null;
};

const fileInputClass =
  "text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-blue-600 hover:file:bg-blue-100";

const emptyForm: Omit<Truck, "id" | "truckId"> = {
  branchRegisteredTo: "",
  registrationNumber: "",
  manufacturer: "",
  modelName: "",
  truckType: "",
  truckPhotosFileName: null,
  chassisNumber: "",
  yearOfManufacture: "",
  tyreLayout: "",
  fuelCapacity: "",
  odometerDuringPurchase: "",
  odometer: "",
  rcValidityDate: "",
  rcExpenses: "",
  rcDocumentUrl: null,
  fcExpiryDate: "",
  fcDocumentFileName: null,
  fcExpenses: "",
  roadTaxDate: "",
  roadTaxNumber: "",
  roadTaxDocumentFileName: null,
  roadTaxExpenses: "",
  insuranceExpiryDate: "",
  insuranceExpenses: "",
  insuranceDocumentProofFileName: null,
  nationalPermitNumber: "",
  nationalPermitDate: "",
  nationalPermitProofFileName: null,
  nationalPermitExpenses: "",
  localPermitNumber: "",
  localPermitDate: "",
  localPermitProofFileName: null,
  localPermitExpenses: "",
  pollutionCertificateDate: "",
  pollutionCertificateNumber: "",
  pollutionCertificateProofFileName: null,
  pollutionCertificateExpenses: "",
  frontViewFileName: null,
  rearViewFileName: null,
  leftViewFileName: null,
  rightViewFileName: null,
};

export function TruckFormDialog({
  open,
  onClose,
  onSave,
  initialData,
}: TruckFormDialogProps) {
  const [form, setForm] = useState<Omit<Truck, "id" | "truckId">>(emptyForm);
  const [files, setFiles] = useState<TruckFiles>({});
  const [branches, setBranches] = useState<Branch[]>([]);
  const [manufacturerOptions, setManufacturerOptions] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [nextTruckId, setNextTruckId] = useState<string | null>(null);

  useEffect(() => {
    branchesApi.list().then(setBranches).catch(() => setBranches([]));
  }, []);

  // Reloaded on every open — a manufacturer just added from Our Fleet →
  // Manufacturers shows up straight away.
  useEffect(() => {
    if (!open) return;
    adblueApi.listManufacturers()
      .then((list) => setManufacturerOptions(list.map((m) => m.name)))
      .catch(() => setManufacturerOptions([]));
  }, [open]);

  useEffect(() => {
    if (open) {
      const { id: _id, truckId: _truckId, ...rest } = initialData ?? {
        id: "",
        truckId: "",
        ...emptyForm,
      };
      setForm(rest);
      setFiles({});
      setSubmitting(false);
    }
  }, [open, initialData]);

  useEffect(() => {
    if (!open || initialData) return;
    setNextTruckId(null);
    // Fetched from the backend (not computed from the currently-loaded truck list),
    // since it must account for archived trucks' still-reserved IDs too — see
    // trucks.py's get_next_truck_id.
    trucksApi.getNextId().then(setNextTruckId).catch(() => setNextTruckId(null));
  }, [open, initialData]);

  useFormDraft(DRAFT_KEY, open && !initialData, form, setForm);

  function update<K extends keyof Omit<Truck, "id" | "truckId">>(
    key: K,
    value: Omit<Truck, "id" | "truckId">[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const truckIdForSave = initialData?.truckId ?? nextTruckId;
    if (!truckIdForSave) {
      showError("Still fetching the next Truck ID — please wait a moment and try again.");
      return;
    }
    // An image name with neither a new file nor a saved image behind it (e.g.
    // restored from a draft) would point at nothing — drop it.
    const imageNames = Object.fromEntries(
      VEHICLE_IMAGES.map(({ field, nameKey }) => [
        nameKey,
        files[field] || (initialData?.[nameKey] && form[nameKey]) ? form[nameKey] : null,
      ]),
    );
    setSubmitting(true);
    try {
      await onSave(
        { id: initialData?.id ?? crypto.randomUUID(), truckId: truckIdForSave, ...form, ...imageNames },
        files,
      );
    } finally {
      setSubmitting(false);
    }
  }

  const truckId = initialData?.truckId ?? nextTruckId ?? "Loading…";

  return (
    <Dialog open={open} onClose={onClose} title={initialData ? "Edit Truck" : "Add Truck"}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="rounded-lg border border-gray-200 p-4">
          <p className={`${sectionHeadingClass} mb-4`}>Vehicle Images</p>
          <VehicleImagesSection
            truck={initialData}
            names={{
              truckPhotosFileName: form.truckPhotosFileName,
              frontViewFileName: form.frontViewFileName,
              rearViewFileName: form.rearViewFileName,
              leftViewFileName: form.leftViewFileName,
              rightViewFileName: form.rightViewFileName,
            }}
            files={files}
            onPick={(field, nameKey, file) => {
              setFiles((prev) => ({
                ...prev,
                [field]: file,
                removeImages: prev.removeImages?.filter((f) => f !== field),
              }));
              update(nameKey, file.name);
            }}
            onRemove={(field, nameKey) => {
              setFiles((prev) => ({
                ...prev,
                [field]: null,
                removeImages: initialData?.[nameKey]
                  ? [...(prev.removeImages ?? []).filter((f) => f !== field), field]
                  : prev.removeImages,
              }));
              update(nameKey, null);
            }}
          />
        </div>

        <Field label="Truck ID">
          <input
            type="text"
            value={truckId}
            readOnly
            disabled
            className={`${inputClass} cursor-not-allowed bg-gray-50 text-gray-500`}
          />
        </Field>

        <Field label="Branch Assigned To">
          <GlassSelect
            value={form.branchRegisteredTo}
            onChange={(val) => setForm((prev) => ({ ...prev, branchRegisteredTo: val }))}
            options={[
              { value: "", label: "Select a branch" },
              ...branches.map((b) => ({ value: b.name, label: b.name })),
            ]}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Truck Registration Number">
            <input
              type="text"              value={form.registrationNumber}
              onChange={(e) => update("registrationNumber", e.target.value)}
              className={inputClass}
              placeholder="e.g. TN 69 AA 1256"
            />
          </Field>

          <Field label="Manufacturer">
            <GlassCombobox
              value={form.manufacturer}
              onChange={(val) => update("manufacturer", val)}
              placeholder="Search manufacturers..."
              options={manufacturerOptions.map((m) => ({ value: m, label: m }))}
              strictSelect
            />
            <p className="mt-1 text-xs text-gray-400">
              Not in the list? Add it in Truck&apos;s AdBlue History → Manufacturers.
            </p>
          </Field>

          <Field label="Model Name">
            <input
              type="text"              value={form.modelName}
              onChange={(e) => update("modelName", e.target.value)}
              className={inputClass}
              placeholder="e.g. Signa 4623.S"
            />
          </Field>

          <Field label="Chassis Number">
            <input
              type="text"              value={form.chassisNumber}
              onChange={(e) => update("chassisNumber", e.target.value)}
              className={inputClass}
              placeholder="e.g. TATZ94AE7P7A0001"
            />
          </Field>

          <Field label="Year of Manufacture">
            <input
              type="text"              value={form.yearOfManufacture}
              onChange={(e) => update("yearOfManufacture", e.target.value)}
              className={inputClass}
              placeholder="e.g. 2019"
              maxLength={4}
            />
          </Field>

          <Field label="Truck Type">
            <GlassCombobox              value={form.truckType}
              onChange={(val) => update("truckType", val)}
              placeholder="Select or type a truck type"
              options={TRUCK_TYPE_OPTIONS.map(opt => ({ value: opt, label: opt }))}
            />
          </Field>

          <Field label="Odometer During Purchase">
            <DecimalInput type="number"              min="0"
              value={form.odometerDuringPurchase}
              onChange={(e) => update("odometerDuringPurchase", e.target.value)}
              className={inputClass}
              placeholder="e.g. 84500"
            />
          </Field>

          <Field label="Fuel Capacity of the Truck(Fuel Tank Size in Liters)">
            <DecimalInput type="number"              min="0"
              value={form.fuelCapacity || ""}
              onChange={(e) => update("fuelCapacity", e.target.value)}
              className={inputClass}
              placeholder="e.g. 400"
            />
          </Field>
        </div>

        <div className="rounded-lg border border-gray-200 p-4">
          <p className={sectionHeadingClass}>Choose the Tyre Layout</p>
          <Field label="Tyre Layout">
            <GlassSelect
              value={form.tyreLayout}
              onChange={(val) => update("tyreLayout", val)}
              options={[
                { value: "", label: "Select a tyre layout" },
                ...TYRE_LAYOUT_OPTIONS.map(opt => ({ value: opt.id, label: opt.label }))
              ]}
            />
          </Field>

          {form.tyreLayout && (
            <div className="mt-4">
              {(() => {
                const layout = getTyreLayout(form.tyreLayout);
                return layout ? <TyreLayoutDiagram layout={layout} /> : null;
              })()}
            </div>
          )}
        </div>

        {/* Documents are entered here only when the truck is added. After that
            they're renewed / corrected on Compliance & Renewals, which keeps
            each one's history (Our Fleet → Compliance History). */}
        {initialData ? (
          <ComplianceDocsReadOnly truck={initialData} />
        ) : (
          <>
        <div className="rounded-lg border border-gray-200 p-4">
          <p className={sectionHeadingClass}>RC Details</p>
          <Field label="RC Validity Date">
            <DatePickerInput              value={form.rcValidityDate}
              onChange={(v) => update("rcValidityDate", v)}
              className={inputClass}
            />
          </Field>

          <Field label="Expenses For RC" required className="mt-4">
            <DecimalInput type="number"
              required
              min="0"
              step="0.01"
              value={form.rcExpenses}
              onChange={(e) => update("rcExpenses", e.target.value)}
              className={inputClass}
              placeholder="e.g. 5000"
            />
          </Field>

          <Field label="RC Document Proof (PDF/Image)" className="mt-4">
            <input
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (!validateFileSize(file)) { e.target.value = ""; return; }
                setFiles((prev) => ({ ...prev, rc: file }));
                update("rcDocumentUrl", file.name);
              }}
              className={fileInputClass}
            />
            <FilePreviewBadge
              fileName={form.rcDocumentUrl}
              fileObj={files.rc}
              entity="trucks"
              field="rc"
            />
          </Field>
        </div>

        <div className="rounded-lg border border-gray-200 p-4">
          <p className={sectionHeadingClass}>FC Details</p>
          <Field label="FC Validity Date">
            <DatePickerInput              value={form.fcExpiryDate}
              onChange={(v) => update("fcExpiryDate", v)}
              className={inputClass}
            />
          </Field>

          <Field label="FC Document Proof (PDF)" className="mt-4">
            <input
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (!validateFileSize(file)) { e.target.value = ""; return; }
                setFiles((prev) => ({ ...prev, fc: file }));
                update("fcDocumentFileName", file.name);
              }}
              className={fileInputClass}
            />
            <FilePreviewBadge
              fileName={form.fcDocumentFileName}
              fileObj={files.fc}
              entity="trucks"
              field="fc"
            />
          </Field>

          <Field label="Expenses For FC" required className="mt-4">
            <DecimalInput type="number"
              required
              min="0"
              step="0.01"
              value={form.fcExpenses}
              onChange={(e) => update("fcExpenses", e.target.value)}
              className={inputClass}
              placeholder="e.g. 15000"
            />
          </Field>
        </div>

        <div className="rounded-lg border border-gray-200 p-4">
          <p className={sectionHeadingClass}>Road Tax</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Road Tax Validity Date">
              <DatePickerInput                value={form.roadTaxDate}
                onChange={(v) => update("roadTaxDate", v)}
                className={inputClass}
              />
            </Field>

            <Field label="Road Tax Number">
              <input
                type="text"                value={form.roadTaxNumber}
                onChange={(e) => update("roadTaxNumber", e.target.value)}
                className={inputClass}
                placeholder="e.g. RT-TN-998877"
              />
            </Field>
          </div>

          <Field label="Road Tax Document Proof (PDF)" className="mt-4">
            <input
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (!validateFileSize(file)) { e.target.value = ""; return; }
                setFiles((prev) => ({ ...prev, road_tax: file }));
                update("roadTaxDocumentFileName", file.name);
              }}
              className={fileInputClass}
            />
            <FilePreviewBadge
              fileName={form.roadTaxDocumentFileName}
              fileObj={files.road_tax}
              entity="trucks"
              field="road_tax"
            />
          </Field>

          <Field label="Expenses For Road Tax" required className="mt-4">
            <DecimalInput type="number"
              required
              min="0"
              step="0.01"
              value={form.roadTaxExpenses}
              onChange={(e) => update("roadTaxExpenses", e.target.value)}
              className={inputClass}
              placeholder="e.g. 8000"
            />
          </Field>
        </div>

        <div className="rounded-lg border border-gray-200 p-4">
          <p className={sectionHeadingClass}>Insurance Details</p>
          <Field label="Insurance Expiry Date">
            <DatePickerInput              value={form.insuranceExpiryDate}
              onChange={(v) => update("insuranceExpiryDate", v)}
              className={inputClass}
            />
          </Field>

          <Field label="Insurance Document Proof (PDF/Image)" className="mt-4">
            <input
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (!validateFileSize(file)) { e.target.value = ""; return; }
                setFiles((prev) => ({ ...prev, insurance_proof: file }));
                update("insuranceDocumentProofFileName", file.name);
              }}
              className={fileInputClass}
            />
            <FilePreviewBadge
              fileName={form.insuranceDocumentProofFileName}
              fileObj={files.insurance_proof}
              entity="trucks"
              field="insurance"
            />
          </Field>

          <Field label="Expenses for Insurance" required className="mt-4">
            <DecimalInput type="number"
              required
              min="0"
              step="0.01"
              value={form.insuranceExpenses}
              onChange={(e) => update("insuranceExpenses", e.target.value)}
              className={inputClass}
              placeholder="e.g. 25000"
            />
          </Field>
        </div>

        <div className="rounded-lg border border-gray-200 p-4">
          <p className={sectionHeadingClass}>National Permit</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="National Permit Number">
              <input
                type="text"                value={form.nationalPermitNumber}
                onChange={(e) => update("nationalPermitNumber", e.target.value)}
                className={inputClass}
                placeholder="e.g. NP-TN-554433"
              />
            </Field>

            <Field label="National Permit Validity Date">
              <DatePickerInput                value={form.nationalPermitDate}
                onChange={(v) => update("nationalPermitDate", v)}
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="National Permit Proof (PDF)" className="mt-4">
            <input
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (!validateFileSize(file)) { e.target.value = ""; return; }
                setFiles((prev) => ({ ...prev, national_permit: file }));
                update("nationalPermitProofFileName", file.name);
              }}
              className={fileInputClass}
            />
            <FilePreviewBadge
              fileName={form.nationalPermitProofFileName}
              fileObj={files.national_permit}
              entity="trucks"
              field="national_permit"
            />
          </Field>

          <Field label="Expenses For National Permit" required className="mt-4">
            <DecimalInput type="number"
              required
              min="0"
              step="0.01"
              value={form.nationalPermitExpenses}
              onChange={(e) => update("nationalPermitExpenses", e.target.value)}
              className={inputClass}
              placeholder="e.g. 5000"
            />
          </Field>
        </div>

        <div className="rounded-lg border border-gray-200 p-4">
          <p className={sectionHeadingClass}>Local Permit</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Local Permit Number">
              <input
                type="text"                value={form.localPermitNumber}
                onChange={(e) => update("localPermitNumber", e.target.value)}
                className={inputClass}
                placeholder="e.g. LP-TN-112233"
              />
            </Field>

            <Field label="Local Permit Validity Date">
              <DatePickerInput                value={form.localPermitDate}
                onChange={(v) => update("localPermitDate", v)}
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="Local Permit Proof (PDF)" className="mt-4">
            <input
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (!validateFileSize(file)) { e.target.value = ""; return; }
                setFiles((prev) => ({ ...prev, local_permit: file }));
                update("localPermitProofFileName", file.name);
              }}
              className={fileInputClass}
            />
            <FilePreviewBadge
              fileName={form.localPermitProofFileName}
              fileObj={files.local_permit}
              entity="trucks"
              field="local_permit"
            />
          </Field>

          <Field label="Expenses For Local Permit" required className="mt-4">
            <DecimalInput type="number"
              required
              min="0"
              step="0.01"
              value={form.localPermitExpenses}
              onChange={(e) => update("localPermitExpenses", e.target.value)}
              className={inputClass}
              placeholder="e.g. 2000"
            />
          </Field>
        </div>

        <div className="rounded-lg border border-gray-200 p-4">
          <p className={sectionHeadingClass}>Pollution Certificate</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Pollution Certificate Validity Date">
              <DatePickerInput                value={form.pollutionCertificateDate}
                onChange={(v) => update("pollutionCertificateDate", v)}
                className={inputClass}
              />
            </Field>

            <Field label="Pollution Certificate Number">
              <input
                type="text"                value={form.pollutionCertificateNumber}
                onChange={(e) => update("pollutionCertificateNumber", e.target.value)}
                className={inputClass}
                placeholder="e.g. TN09BR0012345"
              />
            </Field>
          </div>

          <Field label="Pollution Certificate Proof (PDF)" className="mt-4">
            <input
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (!validateFileSize(file)) { e.target.value = ""; return; }
                setFiles((prev) => ({ ...prev, pollution_cert: file }));
                update("pollutionCertificateProofFileName", file.name);
              }}
              className={fileInputClass}
            />
            <FilePreviewBadge
              fileName={form.pollutionCertificateProofFileName}
              fileObj={files.pollution_cert}
              entity="trucks"
              field="pollution_cert"
            />
          </Field>

          <Field label="Expenses For Pollution Certificate" required className="mt-4">
            <DecimalInput type="number"
              required
              min="0"
              step="0.01"
              value={form.pollutionCertificateExpenses}
              onChange={(e) => update("pollutionCertificateExpenses", e.target.value)}
              className={inputClass}
              placeholder="e.g. 500"
            />
          </Field>
        </div>

          </>
        )}

        <div className="mt-2 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => { clearFormDraft(DRAFT_KEY); onClose(); }}
            disabled={submitting}
            className="btn-interactive rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-all duration-200 hover:bg-gray-50 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="btn-interactive rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:bg-blue-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Saving..." : initialData ? "Save Changes" : "Add Truck"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
