"use client";

import { useRef, useState, type FormEvent } from "react";
import { Paperclip, X } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { GlassSelect } from "@/components/ui/GlassSelect";
import { Field, inputClass } from "@/components/ui/Field";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import { trucksApi, uploadFile } from "@/lib/api";
import { formatDate } from "@/lib/format-date";
import { FilePreviewBadge } from "@/components/ui/FilePreviewBadge";
import { showSuccess, showError } from "@/lib/swal";
import type { Truck } from "@/types/truck";

type DocumentMeta = {
  label: string;
  dateKey: keyof Truck;
  fileNameKey: keyof Truck;
  uploadField: string;
};

const DOCUMENTS: DocumentMeta[] = [
  {
    label: "RC",
    dateKey: "rcValidityDate",
    fileNameKey: "rcDocumentUrl",
    uploadField: "rc",
  },
  {
    label: "FC (Fitness Certificate)",
    dateKey: "fcExpiryDate",
    fileNameKey: "fcDocumentFileName",
    uploadField: "fc",
  },
  {
    label: "Road Tax",
    dateKey: "roadTaxDate",
    fileNameKey: "roadTaxDocumentFileName",
    uploadField: "road_tax",
  },
  {
    label: "National Permit",
    dateKey: "nationalPermitDate",
    fileNameKey: "nationalPermitProofFileName",
    uploadField: "national_permit",
  },
  {
    label: "Local Permit",
    dateKey: "localPermitDate",
    fileNameKey: "localPermitProofFileName",
    uploadField: "local_permit",
  },
  {
    label: "Pollution Certificate",
    dateKey: "pollutionCertificateDate",
    fileNameKey: "pollutionCertificateProofFileName",
    uploadField: "pollution_cert",
  },
  {
    label: "Insurance",
    dateKey: "insuranceExpiryDate",
    fileNameKey: "insuranceDocumentProofFileName",
    uploadField: "insurance",
  },
];

type Props = {
  open: boolean;
  onClose: () => void;
  trucks: Truck[];
  onUpdated: (updated: Truck) => void;
};

export function UpdateDocumentDialog({ open, onClose, trucks, onUpdated }: Props) {
  const [truckId, setTruckId]   = useState("");
  const [docIndex, setDocIndex] = useState<number | "">("");
  const [newDate, setNewDate]   = useState("");
  const [file, setFile]         = useState<File | null>(null);
  const [saving, setSaving]     = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const selectedTruck = trucks.find((t) => t.id === truckId) ?? null;
  const selectedDoc   = docIndex !== "" ? DOCUMENTS[docIndex] : null;
  const currentDate   = selectedTruck && selectedDoc
    ? (selectedTruck[selectedDoc.dateKey] as string)
    : "";
  const currentFile   = selectedTruck && selectedDoc
    ? (selectedTruck[selectedDoc.fileNameKey] as string | null)
    : null;

  function handleClose() {
    setTruckId("");
    setDocIndex("");
    setNewDate("");
    setFile(null);
    onClose();
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedTruck || !selectedDoc || !newDate) return;
    setSaving(true);
    try {
      const updated = await trucksApi.update(selectedTruck.id, {
        ...selectedTruck,
        [selectedDoc.dateKey]: newDate,
        ...(file ? { [selectedDoc.fileNameKey]: file.name } : {}),
      });
      if (file) {
        await uploadFile("trucks", selectedTruck.id, selectedDoc.uploadField, file);
      }
      onUpdated(updated);
      handleClose();
      showSuccess("Document updated successfully.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to update document.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={handleClose} title="Update Document">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <Field label="Truck" required>
          <GlassSelect
            value={truckId}
            onChange={setTruckId}
            options={[
              { value: "", label: "Select truck" },
              ...trucks.map((t) => ({
                value: t.id,
                label: `${t.truckId} — ${t.registrationNumber}`,
              })),
            ]}
          />
        </Field>

        <Field label="Document" required>
          <GlassSelect
            value={docIndex === "" ? "" : String(docIndex)}
            onChange={(v) => {
              setDocIndex(v === "" ? "" : Number(v));
              setFile(null);
            }}
            options={[
              { value: "", label: "Select document" },
              ...DOCUMENTS.map((d, i) => ({ value: String(i), label: d.label })),
            ]}
          />
        </Field>

        {selectedTruck && selectedDoc && (
          <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 text-xs text-gray-500 space-y-1">
            <p>
              Current validity date:{" "}
              <span className="font-medium text-gray-700">{currentDate ? formatDate(currentDate) : "—"}</span>
            </p>
            {currentFile && (
              <div className="mt-2">
                <p className="mb-1 text-xs text-gray-500">Current document:</p>
                <FilePreviewBadge
                  fileName={currentFile}
                  entity="trucks"
                  entityId={selectedTruck.id}
                  field={selectedDoc.uploadField}
                />
              </div>
            )}
          </div>
        )}

        <Field label="New Validity Date" required>
          <DatePickerInput
            required
            value={newDate}
            onChange={(v) => setNewDate(v)}
            className={inputClass}
          />
        </Field>

        <Field label="New Document (PDF / Image) (Max 5MB)">
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) { setFile(null); return; }
              if (f.size > 5 * 1024 * 1024) { alert("File too large. Maximum size is 5MB."); e.target.value = ""; return; }
              setFile(f);
            }}
          />
          {file ? (
            <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm">
              <Paperclip className="h-4 w-4 shrink-0 text-blue-500" />
              <span className="flex-1 truncate text-blue-700">{file.name}</span>
              <button
                type="button"
                onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ""; }}
                className="text-blue-400 hover:text-blue-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full items-center gap-2 rounded-lg border border-dashed border-gray-300 bg-white px-3 py-2 text-sm text-gray-500 transition hover:border-blue-400 hover:text-blue-600"
            >
              <Paperclip className="h-4 w-4" />
              Click to attach new document
            </button>
          )}
          <p className="mt-1 text-xs text-gray-400">Optional — replaces the existing document on file</p>
        </Field>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={handleClose}
            className="btn-interactive rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-all duration-200 hover:bg-gray-50 active:scale-95"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !truckId || docIndex === "" || !newDate}
            className="btn-interactive rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:bg-blue-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Saving…" : "Update Document"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
