"use client";

import { useEffect, useState, type FormEvent } from "react";
import { X, FileText, KeyRound, Eye, EyeOff } from "lucide-react";
import { GlassSelect } from "@/components/ui/GlassSelect";
import { Dialog } from "@/components/ui/Dialog";
import { Field, inputClass, inputClassLower } from "@/components/ui/Field";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import { GlassCombobox } from "@/components/ui/GlassCombobox";
import { Avatar } from "@/components/ui/Avatar";
import { FilePreviewBadge } from "@/components/ui/FilePreviewBadge";
import { DEPARTMENT_OPTIONS, SOFTWARE_DESIGNATION_OPTIONS } from "@/lib/staff-data";
import type { Staff } from "@/types/staff";
import type { Branch } from "@/types/branch";
import { branchesApi } from "@/lib/api";
import { useFormDraft, clearFormDraft } from "@/hooks/useFormDraft";

export const DRAFT_KEY = "erp_staff_form_draft";

const sectionHeadingClass =
  "text-xs font-semibold uppercase tracking-wider text-blue-900 bg-blue-50 px-3 py-2 rounded-lg";

export type StaffFiles = { photo?: File | null; aadhar?: File | null };

type StaffFormDialogProps = {
  open: boolean;
  onClose: () => void;
  onSave: (staff: Staff, files: StaffFiles) => void;
  initialData: Staff | null;
};

const emptyForm: Omit<Staff, "id"> = {
  photoUrl: null,
  name: "",
  staffId: "",
  department: "",
  designation: "",
  dateOfBirth: "",
  dateOfJoining: "",
  email: "",
  contactNumber: "",
  address: "",
  aadharNumber: null,
  aadharFileName: null,
  softwareDesignation: "Trip Sheet Register",
  username: "",
  password: "",
};

export function StaffFormDialog({ open, onClose, onSave, initialData }: StaffFormDialogProps) {
  const [form, setForm] = useState<Omit<Staff, "id">>(emptyForm);
  const [files, setFiles] = useState<StaffFiles>({});
  const [branches, setBranches] = useState<Branch[]>([]);
  const [changePassword, setChangePassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  useEffect(() => {
    branchesApi.list().then(setBranches).catch(() => setBranches([]));
  }, []);

  useEffect(() => {
    if (open) {
      const { id: _id, ...rest } = initialData ?? { id: "", ...emptyForm };
      setForm({ ...rest, password: "" });
      setFiles({});
      setChangePassword(false);
    }
  }, [open, initialData]);

  useFormDraft(DRAFT_KEY, open && !initialData, form, setForm);

  function update<K extends keyof Omit<Staff, "id">>(key: K, value: Omit<Staff, "id">[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleEmailChange(value: string) {
    setForm((prev) => ({
      ...prev,
      email: value,
      username: value,
    }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave({ id: initialData?.id ?? crypto.randomUUID(), ...form }, files);
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={initialData ? "Edit Staff" : "Add Staff"}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Staff's Photo (Max 5MB)" required>
          <div className="flex items-center gap-4">
            <Avatar photoUrl={form.photoUrl} label={form.name || form.staffId || "?"} size={56} />
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
          <Field label="Staff's Name" required>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              className={inputClassLower}
              placeholder="e.g. Anita Menon"
            />
          </Field>

          <Field label="Staff ID" required>
            <input
              type="text"
              required
              value={form.staffId}
              onChange={(e) => update("staffId", e.target.value)}
              className={inputClass}
              placeholder="e.g. STF-1003"
            />
          </Field>

          <Field label="Department" required>
            <GlassCombobox
              required
              value={form.department}
              onChange={(val) => update("department", val)}
              placeholder="Select or type a department"
              options={DEPARTMENT_OPTIONS.map(opt => ({ value: opt, label: opt }))}
            />
          </Field>

          <Field label="Designation" required>
            <input
              type="text"
              required
              value={form.designation}
              onChange={(e) => update("designation", e.target.value)}
              className={inputClass}
              placeholder="e.g. Operations Manager"
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

          <Field label="Email" required>
            <input
              type="email"
              required
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

          <Field label="Software Designation" required>
            <GlassSelect
              value={form.softwareDesignation}
              onChange={(val) => update("softwareDesignation", val)}
              options={SOFTWARE_DESIGNATION_OPTIONS.map(o => ({ value: o, label: o }))}
            />
          </Field>
        </div>

        <div className="rounded-lg border border-gray-200 p-4 flex flex-col gap-4">
          <p className={sectionHeadingClass}>Software Credentials</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Username (auto-filled from email)">
              <input
                type="text"
                readOnly
                value={form.username}
                className={`${inputClassLower} bg-gray-50 text-gray-500 cursor-not-allowed`}
                placeholder="Auto-filled from email"
              />
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

        <Field label="Address" required>
          <textarea
            required
            value={form.address}
            onChange={(e) => update("address", e.target.value)}
            className={inputClass}
            rows={3}
          />
        </Field>

        <Field label="Aadhar Number">
          <input
            type="text"
            maxLength={12}
            value={form.aadharNumber ?? ""}
            onChange={(e) => update("aadharNumber", e.target.value || null)}
            className={inputClass}
            placeholder="12-digit Aadhar number"
          />
        </Field>

        <Field label="Aadhar Card (PDF) (Max 5MB)" required>
          <input
            type="file"
            accept="application/pdf,image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 5 * 1024 * 1024) { alert("File too large. Maximum size is 5MB."); e.target.value = ""; return; }
              setFiles((prev) => ({ ...prev, aadhar: file }));
              update("aadharFileName", file.name);
            }}
            className="text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-blue-600 hover:file:bg-blue-100"
          />
          <FilePreviewBadge
            fileName={form.aadharFileName}
            fileObj={files.aadhar}
            entity="staff"
            entityId={initialData?.id}
            field="aadhar"
          />
        </Field>

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
            {initialData ? "Save Changes" : "Add Staff"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
