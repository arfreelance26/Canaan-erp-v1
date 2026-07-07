"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { FileText, Eye, EyeOff, KeyRound } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { GlassSelect } from "@/components/ui/GlassSelect";
import { Field, inputClass, inputClassLower } from "@/components/ui/Field";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import { Avatar } from "@/components/ui/Avatar";
import { FilePreviewBadge } from "@/components/ui/FilePreviewBadge";
import { generateDriverId } from "@/lib/driver-data";
import type { Driver } from "@/types/driver";
import { useFormDraft, clearFormDraft } from "@/hooks/useFormDraft";

const DRAFT_KEY = "erp_driver_form_draft";

const sectionHeadingClass =
  "text-xs font-semibold uppercase tracking-wider text-blue-900 bg-blue-50 px-3 py-2 rounded-lg";

export type DriverFiles = { photo?: File | null; aadhaar?: File | null; license?: File | null };

type DriverFormDialogProps = {
  open: boolean;
  onClose: () => void;
  onSave: (driver: Driver, files: DriverFiles) => void;
  initialData: Driver | null;
  existingDrivers: Driver[];
};

const emptyForm: Omit<Driver, "id" | "driverId"> = {
  photoUrl: null,
  name: "",
  aadhaarNumber: "",
  aadhaarFileName: null,
  dateOfBirth: "",
  dateOfJoining: "",
  email: "",
  contactNumber: "",
  address: "",
  licenseNumber: "",
  licenseExpiryDate: "",
  licenseFileName: null,
  form11: "",
  esiNumber: "",
  panNumber: "",
  agreementSigned: "",
  bankName: "",
  bankBranchName: "",
  accountNumber: "",
  ifscCode: "",
  username: "",
  password: "",
};

export function DriverFormDialog({
  open,
  onClose,
  onSave,
  initialData,
  existingDrivers,
}: DriverFormDialogProps) {
  const [form, setForm] = useState<Omit<Driver, "id" | "driverId">>(emptyForm);
  const [files, setFiles] = useState<DriverFiles>({});
  const [showPassword, setShowPassword] = useState(false);
  const [changePassword, setChangePassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const lastAutoUsername = useRef<string>("");

  useEffect(() => {
    if (open) {
      const { id: _id, driverId: _driverId, ...rest } = initialData ?? {
        id: "",
        driverId: "",
        ...emptyForm,
      };
      setForm({ ...rest, password: "" });
      setFiles({});
      setChangePassword(false);
      lastAutoUsername.current = rest.username;
    }
  }, [open, initialData]);

  useFormDraft(DRAFT_KEY, open && !initialData, form, setForm);

  function update<K extends keyof Omit<Driver, "id" | "driverId">>(
    key: K,
    value: Omit<Driver, "id" | "driverId">[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleEmailChange(value: string) {
    setForm((prev) => {
      const shouldSyncUsername = prev.username === lastAutoUsername.current;
      lastAutoUsername.current = shouldSyncUsername ? value : lastAutoUsername.current;
      return {
        ...prev,
        email: value,
        username: shouldSyncUsername ? value : prev.username,
      };
    });
  }

  function resetUsernameToEmail() {
    lastAutoUsername.current = form.email;
    update("username", form.email);
  }

  const usernameIsSynced = form.username === form.email && form.email !== "";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!initialData) clearFormDraft(DRAFT_KEY);
    onSave(
      { id: initialData?.id ?? crypto.randomUUID(), driverId: initialData?.driverId ?? generateDriverId(existingDrivers), ...form },
      files,
    );
  }

  const driverId = initialData?.driverId ?? generateDriverId(existingDrivers);

  return (
    <Dialog open={open} onClose={onClose} title={initialData ? "Edit Driver" : "Add Driver"}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Driver ID" required>
          <input
            type="text"
            value={driverId}
            readOnly
            disabled
            className={`${inputClass} cursor-not-allowed bg-gray-50 text-gray-500`}
          />
        </Field>

        <Field label="Driver's Photo (Max 5MB)" required>
          <div className="flex items-center gap-4">
            <Avatar photoUrl={form.photoUrl} label={form.name || driverId} size={56} />
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 5 * 1024 * 1024) { alert("File too large. Maximum size is 5MB."); e.target.value = ""; return; }
                setFiles((prev) => ({ ...prev, photo: file }));
                const reader = new FileReader();
                reader.onload = () => setForm((prev) => ({ ...prev, photoUrl: reader.result as string }));
                reader.readAsDataURL(file);
              }}
              className="text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-blue-600 hover:file:bg-blue-100"
            />
          </div>
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Driver's Name" required>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              className={inputClass}
              placeholder="e.g. Suresh Kumar"
            />
          </Field>

          <Field label="Driver Aadhaar Number" required>
            <input
              type="text"
              required
              value={form.aadhaarNumber}
              onChange={(e) => update("aadhaarNumber", e.target.value)}
              className={inputClass}
              placeholder="e.g. 1234 5678 9012"
            />
          </Field>

          <Field label="Date of Birth" required>
            <DatePickerInput
              required
              value={form.dateOfBirth}
              onChange={(v) => update("dateOfBirth", v)}
              className={inputClass}
            />
          </Field>

          <Field label="Date of Joining" required>
            <DatePickerInput
              required
              value={form.dateOfJoining}
              onChange={(v) => update("dateOfJoining", v)}
              className={inputClass}
            />
          </Field>

          <Field label="Email">
            <input
              type="email"
              value={form.email}
              onChange={(e) => handleEmailChange(e.target.value)}
              className={inputClassLower}
              placeholder="name@company.com"
            />
          </Field>

          <Field label="Contact Number" required>
            <input
              type="tel"
              required
              value={form.contactNumber}
              onChange={(e) => update("contactNumber", e.target.value)}
              className={inputClass}
              placeholder="+91 90000 00000"
            />
          </Field>

          <Field label="License Number" required>
            <input
              type="text"
              required
              value={form.licenseNumber}
              onChange={(e) => update("licenseNumber", e.target.value)}
              className={inputClass}
              placeholder="e.g. TN38 20180012345"
            />
          </Field>

          <Field label="License Expiry Date" required>
            <DatePickerInput
              required
              value={form.licenseExpiryDate}
              onChange={(v) => update("licenseExpiryDate", v)}
              className={inputClass}
            />
          </Field>

          <Field label="Form 11" required>
            <GlassSelect
              value={form.form11}
              onChange={(val) => update("form11", val as Driver["form11"])}
              options={[
                { value: "", label: "Select" },
                { value: "Yes", label: "Yes" },
                { value: "No", label: "No" }
              ]}
            />
          </Field>

          <Field label="ESI Number">
            <input
              type="text"
              value={form.esiNumber}
              onChange={(e) => update("esiNumber", e.target.value)}
              className={inputClass}
              placeholder="e.g. TN/100/123456789"
            />
          </Field>

          <Field label="PAN Number">
            <input
              type="text"
              value={form.panNumber}
              onChange={(e) => update("panNumber", e.target.value)}
              className={inputClass}
              placeholder="e.g. ABCDE1234F"
            />
          </Field>

          <Field label="Agreement Signed" required>
            <GlassSelect
              value={form.agreementSigned}
              onChange={(val) => update("agreementSigned", val as Driver["agreementSigned"])}
              options={[
                { value: "", label: "Select" },
                { value: "Yes", label: "Yes" },
                { value: "No", label: "No" }
              ]}
            />
          </Field>
        </div>

        <div className="rounded-lg border border-gray-200 p-4">
          <p className={sectionHeadingClass}>Bank Account Details</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Bank Name">
              <input
                type="text"
                value={form.bankName}
                onChange={(e) => update("bankName", e.target.value)}
                className={inputClass}
                placeholder="e.g. HDFC Bank"
              />
            </Field>

            <Field label="Branch Name of the Bank">
              <input
                type="text"
                value={form.bankBranchName}
                onChange={(e) => update("bankBranchName", e.target.value)}
                className={inputClass}
                placeholder="e.g. Coimbatore Main"
              />
            </Field>

            <Field label="Account Number">
              <input
                type="text"
                value={form.accountNumber}
                onChange={(e) => update("accountNumber", e.target.value)}
                className={inputClass}
                placeholder="e.g. 1234567890123456"
              />
            </Field>

            <Field label="IFSC Code">
              <input
                type="text"
                value={form.ifscCode}
                onChange={(e) => update("ifscCode", e.target.value)}
                className={inputClass}
                placeholder="e.g. HDFC0001234"
              />
            </Field>
          </div>
        </div>

        <Field label="Address" required>
          <textarea
            required
            value={form.address}
            onChange={(e) => update("address", e.target.value)}
            className={inputClass}
            rows={3}
          />
        </Field>

        <div className="rounded-lg border border-gray-200 p-4 flex flex-col gap-4">
          <p className={sectionHeadingClass}>Software Credentials</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Username (auto-filled from email)">
              <input
                type="text"
                value={form.username}
                onChange={(e) => {
                  lastAutoUsername.current = "";
                  update("username", e.target.value);
                }}
                className={inputClassLower}
                placeholder="Auto-filled from email"
              />
              {usernameIsSynced ? (
                <p className="mt-1 text-xs text-green-600">&#10003; Synced with email</p>
              ) : form.email ? (
                <button
                  type="button"
                  onClick={resetUsernameToEmail}
                  className="mt-1 text-xs text-blue-600 underline hover:text-blue-800"
                >
                  Reset to email
                </button>
              ) : null}
            </Field>

            <Field label="Password" required={!initialData}>
              <input
                type="password"
                required={!initialData}
                readOnly={!!initialData}
                value={initialData ? "••••••••" : form.password}
                onChange={(e) => !initialData && update("password", e.target.value)}
                className={`${inputClassLower} ${initialData ? "bg-gray-50 text-gray-400 cursor-not-allowed" : ""}`}
                placeholder="Set a login password"
              />
            </Field>
          </div>

          {initialData && (
            <div>
              <button
                type="button"
                onClick={() => {
                  setChangePassword((v) => !v);
                  update("password", "");
                }}
                className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
              >
                <KeyRound className="w-4 h-4" />
                {changePassword ? "Cancel password change" : "Change password"}
              </button>
              {changePassword && (
                <div className="mt-3">
                  <Field label="New Password" required>
                    <div className="relative">
                      <input
                        type={showNewPassword ? "text" : "password"}
                        required
                        value={form.password}
                        onChange={(e) => update("password", e.target.value)}
                        className={`${inputClassLower} pr-10`}
                        placeholder="Enter new password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 focus:outline-none"
                      >
                        {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </Field>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Driver Aadhaar Proof (PDF) (Max 5MB)">
            <input
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 5 * 1024 * 1024) { alert("File too large. Maximum size is 5MB."); e.target.value = ""; return; }
                setFiles((prev) => ({ ...prev, aadhaar: file }));
                update("aadhaarFileName", file.name);
              }}
              className="text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-blue-600 hover:file:bg-blue-100"
            />
            <FilePreviewBadge
              fileName={form.aadhaarFileName}
              fileObj={files.aadhaar}
              entity="drivers"
              entityId={initialData?.id}
              field="aadhaar"
            />
          </Field>

          <Field label="License Proof (PDF) (Max 5MB)">
            <input
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 5 * 1024 * 1024) { alert("File too large. Maximum size is 5MB."); e.target.value = ""; return; }
                setFiles((prev) => ({ ...prev, license: file }));
                update("licenseFileName", file.name);
              }}
              className="text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-blue-600 hover:file:bg-blue-100"
            />
            <FilePreviewBadge
              fileName={form.licenseFileName}
              fileObj={files.license}
              entity="drivers"
              entityId={initialData?.id}
              field="license"
            />
          </Field>
        </div>

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
            {initialData ? "Save Changes" : "Add Driver"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
