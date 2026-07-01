import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Save, Search, CheckCircle2 } from "lucide-react";
import { attendanceApi } from "@/lib/api";
import { showError, showSuccess } from "@/lib/swal";
import { todayIst } from "@/lib/format-date";
import { DateInput } from "@/components/ui/DateInput";
import type { LeaveRequest } from "@/types/leave-request";

type LeaveRequestFormDialogProps = {
  open: boolean;
  onClose: () => void;
  onSave: (payload: Omit<LeaveRequest, "id" | "status" | "appliedAt">) => Promise<void>;
};

const inputClass =
  "mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors disabled:bg-gray-50 disabled:text-gray-500 uppercase placeholder:normal-case";

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

export function LeaveRequestFormDialog({ open, onClose, onSave }: LeaveRequestFormDialogProps) {
  const [form, setForm] = useState({
    applicantCode: "",
    fromDate: todayIst(),
    toDate: todayIst(),
    reason: "",
  });

  const [verifiedApplicant, setVerifiedApplicant] = useState<{
    id: number;
    name: string;
    category: any;
  } | null>(null);

  const [isVerifying, setIsVerifying] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  async function handleVerify() {
    if (!form.applicantCode.trim()) {
      showError("Please enter an Applicant ID to verify.");
      return;
    }
    setIsVerifying(true);
    setVerifiedApplicant(null);
    try {
      const res = await attendanceApi.lookupApplicant(form.applicantCode);
      setVerifiedApplicant({
        id: res.applicant_id,
        name: res.applicant_name,
        category: res.category,
      });
      showSuccess(`Found ${res.category}: ${res.applicant_name}`);
    } catch (err: any) {
      showError(err.message || "Applicant not found. Please check the ID.");
    } finally {
      setIsVerifying(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!verifiedApplicant) {
      showError("Please verify the Applicant ID first.");
      return;
    }
    
    if (new Date(form.toDate) < new Date(form.fromDate)) {
      showError("End date cannot be earlier than start date.");
      return;
    }

    setIsSaving(true);
    try {
      await onSave({
        category: verifiedApplicant.category,
        applicantId: String(verifiedApplicant.id),
        applicantName: verifiedApplicant.name,
        applicantCode: form.applicantCode.toUpperCase(),
        fromDate: form.fromDate,
        toDate: form.toDate,
        reason: form.reason || "",
      });
      // Reset form
      setForm({
        applicantCode: "",
        fromDate: todayIst(),
        toDate: todayIst(),
        reason: "",
      });
      setVerifiedApplicant(null);
      onClose();
    } catch (err: any) {
      showError(err.message);
    } finally {
      setIsSaving(false);
    }
  }

  function update(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  return (
    <Dialog open={open} onClose={onClose} title="Submit Leave Request">
      <form onSubmit={handleSubmit} className="space-y-4">
        
        <div>
          <label className="block text-sm font-medium text-gray-700">Applicant ID (Driver/Staff) <span className="text-red-500">*</span></label>
          <div className="mt-1 flex gap-2">
            <input
              type="text"
              required
              value={form.applicantCode}
              onChange={(e) => {
                update("applicantCode", e.target.value);
                setVerifiedApplicant(null); // reset verification if they change the ID
              }}
              className={inputClass}
              placeholder="e.g. CGI-D001 or STF-1001"
            />
            <button
              type="button"
              onClick={handleVerify}
              disabled={isVerifying || !form.applicantCode}
              className="flex items-center justify-center rounded-lg bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 border border-blue-200 hover:bg-blue-100 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {isVerifying ? "Verifying..." : <><Search className="w-4 h-4 mr-1.5" /> Verify</>}
            </button>
          </div>
        </div>

        {verifiedApplicant && (
          <div className="flex items-center gap-3 bg-green-50 text-green-800 p-3 rounded-lg border border-green-200">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            <div>
              <p className="text-sm font-semibold">{verifiedApplicant.name}</p>
              <p className="text-xs text-green-700 uppercase tracking-wider">{verifiedApplicant.category}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Field label="From Date" required>
            <DateInput
              required
              value={form.fromDate}
              onChange={(v) => update("fromDate", v)}
              className={inputClass}
            />
          </Field>
          <Field label="To Date" required>
            <DateInput
              required
              value={form.toDate}
              onChange={(v) => update("toDate", v)}
              className={inputClass}
            />
          </Field>
        </div>

        <Field label="Reason (Optional)">
          <textarea
            rows={3}
            value={form.reason}
            onChange={(e) => update("reason", e.target.value)}
            className={inputClass}
            placeholder="e.g. Family function"
          />
        </Field>

        <div className="pt-4 flex justify-end gap-3 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!verifiedApplicant || isSaving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-sm disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {isSaving ? "Saving..." : "Submit Request"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
