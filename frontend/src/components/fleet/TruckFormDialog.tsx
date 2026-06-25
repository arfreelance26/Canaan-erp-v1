"use client";

import { useEffect, useState, type FormEvent } from "react";
import { FileText, ImageIcon } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { Field, inputClass } from "@/components/ui/Field";
import { addYearsToDate, generateTruckId, TRUCK_TYPE_OPTIONS, BRANCH_OPTIONS } from "@/lib/truck-data";
import { getTyreLayout, TYRE_LAYOUT_OPTIONS } from "@/lib/tyre-layouts";
import { TyreLayoutDiagram } from "@/components/fleet/TyreLayoutDiagram";
import type { Truck } from "@/types/truck";

export type TruckFiles = {
  photo?: File | null;
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
  onSave: (truck: Truck, files: TruckFiles) => void;
  initialData: Truck | null;
  existingTrucks: Truck[];
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
  odometerDuringPurchase: "",
  odometer: "",
  rcDate: "",
  rcDocumentUrl: null,
  fcDate: "",
  fcExpiryDate: "",
  fcDocumentFileName: null,
  fcExpenses: "",
  roadTaxDate: "",
  roadTaxNumber: "",
  roadTaxDocumentFileName: null,
  roadTaxExpenses: "",
  insuranceExpiryDate: "",
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
};

export function TruckFormDialog({
  open,
  onClose,
  onSave,
  initialData,
  existingTrucks,
}: TruckFormDialogProps) {
  const [form, setForm] = useState<Omit<Truck, "id" | "truckId">>(emptyForm);
  const [files, setFiles] = useState<TruckFiles>({});
  const [fcExpiryTouched, setFcExpiryTouched] = useState(false);

  useEffect(() => {
    if (open) {
      const { id: _id, truckId: _truckId, ...rest } = initialData ?? {
        id: "",
        truckId: "",
        ...emptyForm,
      };
      setForm(rest);
      setFiles({});
      setFcExpiryTouched(Boolean(initialData));
    }
  }, [open, initialData]);

  function update<K extends keyof Omit<Truck, "id" | "truckId">>(
    key: K,
    value: Omit<Truck, "id" | "truckId">[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleFcDateChange(value: string) {
    setForm((prev) => ({
      ...prev,
      fcDate: value,
      fcExpiryDate: fcExpiryTouched ? prev.fcExpiryDate : addYearsToDate(value, 1),
    }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave(
      { id: initialData?.id ?? crypto.randomUUID(), truckId: initialData?.truckId ?? generateTruckId(existingTrucks), ...form },
      files,
    );
  }

  const truckId = initialData?.truckId ?? generateTruckId(existingTrucks);

  return (
    <Dialog open={open} onClose={onClose} title={initialData ? "Edit Truck" : "Add Truck"}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Truck ID" required>
          <input
            type="text"
            value={truckId}
            readOnly
            disabled
            className={`${inputClass} cursor-not-allowed bg-gray-50 text-gray-500`}
          />
        </Field>

        <Field label="Branch the Truck To be Registered" required>
          <select
            required
            value={form.branchRegisteredTo}
            onChange={(e) => update("branchRegisteredTo", e.target.value as Truck["branchRegisteredTo"])}
            className={inputClass}
          >
            <option value="" disabled>
              Select a branch
            </option>
            {BRANCH_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Truck Registration Number" required>
            <input
              type="text"
              required
              value={form.registrationNumber}
              onChange={(e) => update("registrationNumber", e.target.value)}
              className={inputClass}
              placeholder="e.g. TN 69 AA 1256"
            />
          </Field>

          <Field label="Manufacturer" required>
            <input
              type="text"
              required
              value={form.manufacturer}
              onChange={(e) => update("manufacturer", e.target.value)}
              className={inputClass}
              placeholder="e.g. Tata Motors"
            />
          </Field>

          <Field label="Model Name" required>
            <input
              type="text"
              required
              value={form.modelName}
              onChange={(e) => update("modelName", e.target.value)}
              className={inputClass}
              placeholder="e.g. Signa 4623.S"
            />
          </Field>

          <Field label="Chassis Number" required>
            <input
              type="text"
              required
              value={form.chassisNumber}
              onChange={(e) => update("chassisNumber", e.target.value)}
              className={inputClass}
              placeholder="e.g. TATZ94AE7P7A0001"
            />
          </Field>

          <Field label="Year of Manufacture" required>
            <input
              type="text"
              required
              value={form.yearOfManufacture}
              onChange={(e) => update("yearOfManufacture", e.target.value)}
              className={inputClass}
              placeholder="e.g. 2019"
              maxLength={4}
            />
          </Field>

          <Field label="Truck Type" required>
            <input
              type="text"
              required
              list="truck-type-options"
              value={form.truckType}
              onChange={(e) => update("truckType", e.target.value)}
              className={inputClass}
              placeholder="Select or type a truck type"
            />
            <datalist id="truck-type-options">
              {TRUCK_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </Field>

          <Field label="Truck Photos (PDF/Image)" required>
            <input
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setFiles((prev) => ({ ...prev, photo: file }));
                update("truckPhotosFileName", file.name);
              }}
              className={fileInputClass}
            />
            {form.truckPhotosFileName && (
              <span className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
                <FileText className="h-3.5 w-3.5" />
                {form.truckPhotosFileName}
              </span>
            )}
          </Field>

          <Field label="Odometer During Purchase" required>
            <input
              type="number"
              required
              min="0"
              value={form.odometerDuringPurchase}
              onChange={(e) => update("odometerDuringPurchase", e.target.value)}
              className={inputClass}
              placeholder="e.g. 84500"
            />
          </Field>
        </div>

        <div className="rounded-lg border border-gray-200 p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">Choose the Tyre Layout</h3>
          <Field label="Tyre Layout" required>
            <select
              required
              value={form.tyreLayout}
              onChange={(e) => update("tyreLayout", e.target.value)}
              className={inputClass}
            >
              <option value="" disabled>
                Select a tyre layout
              </option>
              {TYRE_LAYOUT_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
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

        <div className="rounded-lg border border-gray-200 p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">RC Details</h3>
          <Field label="RC Date" required>
            <input
              type="date"
              required
              value={form.rcDate}
              onChange={(e) => update("rcDate", e.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label="RC Document Proof (PDF/Image)" className="mt-4">
            <input
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setFiles((prev) => ({ ...prev, rc: file }));
                update("rcDocumentUrl", file.name);
              }}
              className={fileInputClass}
            />
            {form.rcDocumentUrl && (
              <span className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
                <ImageIcon className="h-3.5 w-3.5" />
                Image selected
              </span>
            )}
          </Field>
        </div>

        <div className="rounded-lg border border-gray-200 p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">FC Details</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="FC Date" required>
              <input
                type="date"
                required
                value={form.fcDate}
                onChange={(e) => handleFcDateChange(e.target.value)}
                className={inputClass}
              />
            </Field>

            <Field label="FC Validity Date" required>
              <input
                type="date"
                required
                value={form.fcExpiryDate}
                onChange={(e) => {
                  setFcExpiryTouched(true);
                  update("fcExpiryDate", e.target.value);
                }}
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="FC Document Proof (PDF)" className="mt-4">
            <input
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setFiles((prev) => ({ ...prev, fc: file }));
                update("fcDocumentFileName", file.name);
              }}
              className={fileInputClass}
            />
            {form.fcDocumentFileName && (
              <span className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
                <FileText className="h-3.5 w-3.5" />
                {form.fcDocumentFileName}
              </span>
            )}
          </Field>

          <Field label="Expenses For FC" className="mt-4">
            <input
              type="number"
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
          <h3 className="mb-3 text-sm font-semibold text-gray-900">Road Tax</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Road Tax Validity Date" required>
              <input
                type="date"
                required
                value={form.roadTaxDate}
                onChange={(e) => update("roadTaxDate", e.target.value)}
                className={inputClass}
              />
            </Field>

            <Field label="Road Tax Number" required>
              <input
                type="text"
                required
                value={form.roadTaxNumber}
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
                setFiles((prev) => ({ ...prev, road_tax: file }));
                update("roadTaxDocumentFileName", file.name);
              }}
              className={fileInputClass}
            />
            {form.roadTaxDocumentFileName && (
              <span className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
                <FileText className="h-3.5 w-3.5" />
                {form.roadTaxDocumentFileName}
              </span>
            )}
          </Field>

          <Field label="Expenses For Road Tax" className="mt-4">
            <input
              type="number"
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
          <h3 className="mb-3 text-sm font-semibold text-gray-900">Insurance Details</h3>
          <Field label="Insurance Expiry Date" required>
            <input
              type="date"
              required
              value={form.insuranceExpiryDate}
              onChange={(e) => update("insuranceExpiryDate", e.target.value)}
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
                setFiles((prev) => ({ ...prev, insurance_proof: file }));
                update("insuranceDocumentProofFileName", file.name);
              }}
              className={fileInputClass}
            />
            {form.insuranceDocumentProofFileName && (
              <span className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
                <FileText className="h-3.5 w-3.5" />
                {form.insuranceDocumentProofFileName}
              </span>
            )}
          </Field>
        </div>

        <div className="rounded-lg border border-gray-200 p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">National Permit</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="National Permit Number" required>
              <input
                type="text"
                required
                value={form.nationalPermitNumber}
                onChange={(e) => update("nationalPermitNumber", e.target.value)}
                className={inputClass}
                placeholder="e.g. NP-TN-554433"
              />
            </Field>

            <Field label="National Permit Validity Date" required>
              <input
                type="date"
                required
                value={form.nationalPermitDate}
                onChange={(e) => update("nationalPermitDate", e.target.value)}
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
                setFiles((prev) => ({ ...prev, national_permit: file }));
                update("nationalPermitProofFileName", file.name);
              }}
              className={fileInputClass}
            />
            {form.nationalPermitProofFileName && (
              <span className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
                <FileText className="h-3.5 w-3.5" />
                {form.nationalPermitProofFileName}
              </span>
            )}
          </Field>

          <Field label="Expenses For National Permit" className="mt-4">
            <input
              type="number"
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
          <h3 className="mb-3 text-sm font-semibold text-gray-900">Local Permit</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Local Permit Number" required>
              <input
                type="text"
                required
                value={form.localPermitNumber}
                onChange={(e) => update("localPermitNumber", e.target.value)}
                className={inputClass}
                placeholder="e.g. LP-TN-112233"
              />
            </Field>

            <Field label="Local Permit Validity Date" required>
              <input
                type="date"
                required
                value={form.localPermitDate}
                onChange={(e) => update("localPermitDate", e.target.value)}
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
                setFiles((prev) => ({ ...prev, local_permit: file }));
                update("localPermitProofFileName", file.name);
              }}
              className={fileInputClass}
            />
            {form.localPermitProofFileName && (
              <span className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
                <FileText className="h-3.5 w-3.5" />
                {form.localPermitProofFileName}
              </span>
            )}
          </Field>

          <Field label="Expenses For Local Permit" className="mt-4">
            <input
              type="number"
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
          <h3 className="mb-3 text-sm font-semibold text-gray-900">Pollution Certificate</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Pollution Certificate Validity Date" required>
              <input
                type="date"
                required
                value={form.pollutionCertificateDate}
                onChange={(e) => update("pollutionCertificateDate", e.target.value)}
                className={inputClass}
              />
            </Field>

            <Field label="Pollution Certificate Number" required>
              <input
                type="text"
                required
                value={form.pollutionCertificateNumber}
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
                setFiles((prev) => ({ ...prev, pollution_cert: file }));
                update("pollutionCertificateProofFileName", file.name);
              }}
              className={fileInputClass}
            />
            {form.pollutionCertificateProofFileName && (
              <span className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
                <FileText className="h-3.5 w-3.5" />
                {form.pollutionCertificateProofFileName}
              </span>
            )}
          </Field>

          <Field label="Expenses For Pollution Certificate" className="mt-4">
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.pollutionCertificateExpenses}
              onChange={(e) => update("pollutionCertificateExpenses", e.target.value)}
              className={inputClass}
              placeholder="e.g. 500"
            />
          </Field>
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
            {initialData ? "Save Changes" : "Add Truck"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
