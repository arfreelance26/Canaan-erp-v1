import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { RiSave3Line as Save, RiSearchLine as Search, RiCheckboxCircleLine as CheckCircle2 } from "@remixicon/react";
import { attendanceApi } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { showError, showSuccess } from "@/lib/feedback";
import { todayIst } from "@/lib/format-date";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import type { LeaveRequest } from "@/types/leave-request";
import { useFormDraft, clearFormDraft } from "@/hooks/useFormDraft";

const DRAFT_KEY = "erp_leave_request_form_draft";

type LeaveRequestFormDialogProps = {
  open: boolean;
  onClose: () => void;
  onSave: (payload: Omit<LeaveRequest, "id" | "status" | "appliedAt">) => Promise<void>;
};

const inputClass =
  "mt-1 block w-full rounded-lg border border-border-button-default bg-background-primary-default px-3 py-2 text-sm text-text-primary placeholder-text-placeholder focus:border-accent-solid focus:outline-none focus:ring-1 focus:ring-accent-solid transition-colors disabled:bg-fill-1 disabled:text-text-secondary uppercase placeholder:normal-case";

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-body-medium text-text-primary">
        {label} {required && <span className="text-danger-text">*</span>}
      </label>
      {children}
    </div>
  );
}

const SELF_CATEGORIES = ["Commercial Manager", "Assistant Commercial Manager", "Accounts", "Maintenance", "Trip Sheet Register", "Yard Supervisor", "Auditor"];

export function LeaveRequestFormDialog({ open, onClose, onSave }: LeaveRequestFormDialogProps) {
  const { user } = useAuth();
  // Only Admin can file for someone else (e.g. a driver). Everyone else files for themselves —
  // the server takes the applicant from their own staff record regardless of what is sent.
  const isAdmin = user?.softwareDesignation === "Admin";
  const self =
    !isAdmin && user?.id != null
      ? {
          id: user.id,
          name: user.name,
          category: (SELF_CATEGORIES.includes(user.softwareDesignation) ? user.softwareDesignation : "Trip Sheet Register") as LeaveRequest["category"],
        }
      : null;

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

  useFormDraft(DRAFT_KEY, open, form, setForm);

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
    const applicant = isAdmin ? verifiedApplicant : self;
    if (!applicant) {
      showError(isAdmin ? "Please verify the Applicant ID first." : "Your login is not linked to a staff record, so leave cannot be filed.");
      return;
    }
    
    if (new Date(form.toDate) < new Date(form.fromDate)) {
      showError("End date cannot be earlier than start date.");
      return;
    }

    setIsSaving(true);
    try {
      await onSave({
        category: applicant.category,
        applicantId: String(applicant.id),
        applicantName: applicant.name,
        applicantCode: isAdmin ? form.applicantCode.toUpperCase() : (user?.staffId ?? ""),
        fromDate: form.fromDate,
        toDate: form.toDate,
        reason: form.reason || "",
      });
      // Reset form
      clearFormDraft(DRAFT_KEY);
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
        
        {isAdmin ? (
          <>
          <div>
            <label className="block text-body-medium text-text-primary">Applicant ID (Driver/Staff) <span className="text-danger-text">*</span></label>
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
                className="flex h-10 items-center justify-center whitespace-nowrap rounded-full border border-accent-border bg-accent-surface px-5 text-body-medium text-accent-text transition duration-300 hover:bg-accent-surface-strong disabled:pointer-events-none disabled:opacity-50"
              >
                {isVerifying ? "Verifying..." : <><Search className="w-4 h-4 mr-1.5" /> Verify</>}
              </button>
            </div>
          </div>

          {verifiedApplicant && (
            <div className="flex items-center gap-3 bg-success-surface text-success-text-strong p-3 rounded-lg border border-success-border">
              <CheckCircle2 className="w-5 h-5 text-success-text" />
              <div>
                <p className="text-body-semibold">{verifiedApplicant.name}</p>
                <p className="text-xs text-success-text">{verifiedApplicant.category}</p>
              </div>
            </div>
          )}
          </>
        ) : (
          <div className="flex items-center gap-3 rounded-xl border border-separator-border bg-fill-1 px-4 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-surface-strong text-body-medium text-accent-text">
              {(user?.name ?? "?").trim().charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="text-xs text-text-secondary">Applying as</p>
              <p className="truncate text-body-medium text-text-primary">{user?.name}</p>
              <p className="truncate text-xs text-text-secondary">{user?.softwareDesignation}{user?.staffId ? ` · ${user.staffId}` : ""}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="From Date" required>
            <DatePickerInput
              required
              value={form.fromDate}
              onChange={(v) => update("fromDate", v)}
              className={inputClass}
            />
          </Field>
          <Field label="To Date" required>
            <DatePickerInput
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

        <div className="pt-4 flex justify-end gap-3 border-t border-separator-border">
          <button
            type="button"
            onClick={() => { clearFormDraft(DRAFT_KEY); onClose(); }}
            className="flex h-10 items-center whitespace-nowrap rounded-full border border-separator-border bg-background-primary-default px-6 text-body-medium text-text-secondary shadow-sm transition duration-300 hover:shadow-md"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={(isAdmin ? !verifiedApplicant : !self) || isSaving}
            className="flex h-10 items-center gap-2 whitespace-nowrap rounded-full bg-accent-solid px-6 text-body-medium text-on-solid shadow-sm transition duration-300 hover:bg-accent-solid-hover hover:shadow-md disabled:pointer-events-none disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {isSaving ? "Saving..." : "Submit Request"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
