"use client";

import { useRef, useState, type FormEvent } from "react";
import { IndianRupee, Paperclip, Trash2, X } from "lucide-react";
import { Field, inputClass, inputClassLower } from "@/components/ui/Field";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import { showError, validateFileSize } from "@/lib/swal";
import type { ComplianceDocInput } from "@/lib/api";
import type { ComplianceDocMeta } from "@/lib/compliance-docs";

type Props = {
  doc: ComplianceDocMeta;
  /** "renew" = a new document; "correct" = fix the current one. */
  mode: "renew" | "correct";
  initial?: { validFrom?: string | null; validUntil?: string | null; expense?: number | null; docNumber?: string | null };
  /** Current file's name — Correct can remove it. */
  currentFileName?: string | null;
  saving: boolean;
  onSubmit: (input: ComplianceDocInput) => void;
  onCancel: () => void;
};

/** The fields for renewing or correcting one compliance document. */
export function ComplianceDocForm({ doc, mode, initial, currentFileName, saving, onSubmit, onCancel }: Props) {
  const [validFrom, setValidFrom]   = useState(initial?.validFrom ?? "");
  const [validUntil, setValidUntil] = useState(initial?.validUntil ?? "");
  const [expense, setExpense]       = useState(initial?.expense != null ? String(initial.expense) : "");
  const [docNumber, setDocNumber]   = useState(initial?.docNumber ?? "");
  const [note, setNote]             = useState("");
  const [file, setFile]             = useState<File | null>(null);
  const [removeFile, setRemoveFile] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const renew = mode === "renew";

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (renew && !validUntil) return;
    if (validFrom && validUntil && validFrom >= validUntil) {
      showError("Valid From must be before the validity date.");
      return;
    }
    onSubmit({ validUntil, validFrom, expense, docNumber, note, file, removeFile: !renew && removeFile });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Valid From">
          <DatePickerInput value={validFrom} onChange={setValidFrom} className={inputClass} />
        </Field>
        <Field label={renew ? "New Validity Date" : "Validity Date"} required={renew}>
          <DatePickerInput required={renew} value={validUntil} onChange={setValidUntil} className={inputClass} />
        </Field>
      </div>

      <div className={doc.numberKey ? "grid grid-cols-1 gap-4 sm:grid-cols-2" : ""}>
        <Field label={`Cost of this ${doc.label}`}>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400">
              <IndianRupee className="h-4 w-4" />
            </span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={expense}
              onChange={(e) => setExpense(e.target.value)}
              placeholder="0.00"
              className={`${inputClassLower} pl-8 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
            />
          </div>
        </Field>
        {doc.numberKey && (
          <Field label={`${doc.label} Number`}>
            <input
              type="text"
              value={docNumber}
              onChange={(e) => setDocNumber(e.target.value)}
              placeholder={renew ? "Leave blank to keep the same number" : ""}
              className={inputClass}
            />
          </Field>
        )}
      </div>

      <Field label={renew ? "New Document (PDF / Image) (Max 25MB)" : "Replace File (PDF / Image) (Max 25MB)"}>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) { setFile(null); return; }
            if (!validateFileSize(f)) { e.target.value = ""; return; }
            setFile(f);
          }}
        />
        {removeFile ? (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <Trash2 className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate">The current file ({currentFileName}) will be removed</span>
            <button type="button" onClick={() => setRemoveFile(false)} className="text-xs font-semibold underline">
              Keep it
            </button>
          </div>
        ) : file ? (
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
            Click to attach {renew ? "the new document" : "the right file"}
          </button>
        )}
        <p className="mt-1 text-xs text-gray-400">
          {renew ? "Optional — the old document's file stays in the history." : "Optional — only if the wrong file was uploaded."}
        </p>
        {!renew && currentFileName && !file && !removeFile && (
          <button
            type="button"
            onClick={() => setRemoveFile(true)}
            className="mt-1 flex w-fit items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700 hover:underline"
          >
            <Trash2 className="h-3.5 w-3.5" /> Wrong file and no replacement yet? Remove the current file
          </button>
        )}
      </Field>

      {!renew && (
        <Field label="What was wrong? (optional)">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Expiry date was typed wrong"
            className={inputClassLower}
          />
        </Field>
      )}

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="btn-interactive rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-all duration-200 hover:bg-gray-50 active:scale-95 disabled:opacity-50"
        >
          Back
        </button>
        <button
          type="submit"
          disabled={saving || (renew && !validUntil)}
          className="btn-interactive rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:bg-blue-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving…" : renew ? `Renew ${doc.short}` : "Save Correction"}
        </button>
      </div>
    </form>
  );
}
