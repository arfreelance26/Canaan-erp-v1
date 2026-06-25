"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { FileText } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { Field, inputClass } from "@/components/ui/Field";
import { Avatar } from "@/components/ui/Avatar";
import { generateDriverId } from "@/lib/driver-data";
import type { Driver } from "@/types/driver";

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
  branch: "",
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
  const lastAutoUsername = useRef<string>("");

  useEffect(() => {
    if (open) {
      const { id: _id, driverId: _driverId, ...rest } = initialData ?? {
        id: "",
        driverId: "",
        ...emptyForm,
      };
      setForm(rest);
      setFiles({});
      lastAutoUsername.current = rest.username;
    }
  }, [open, initialData]);

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

        <Field label="Driver's Photo" required>
          <div className="flex items-center gap-4">
            <Avatar photoUrl={form.photoUrl} label={form.name || driverId} size={56} />
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setFiles((prev) => ({ ...prev, photo: file }));
                const reader = new FileReader();
                reader.onload = () => update("photoUrl", reader.result as string);
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

          <Field label="Branch" required>
            <input
              type="text"
              required
              value={form.branch}
              onChange={(e) => update("branch", e.target.value)}
              className={inputClass}
              placeholder="e.g. Coimbatore"
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
            <input
              type="date"
              required
              value={form.dateOfBirth}
              onChange={(e) => update("dateOfBirth", e.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label="Date of Joining" required>
            <input
              type="date"
              required
              value={form.dateOfJoining}
              onChange={(e) => update("dateOfJoining", e.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label="Email" required>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => handleEmailChange(e.target.value)}
              className={inputClass}
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
            <input
              type="date"
              required
              value={form.licenseExpiryDate}
              onChange={(e) => update("licenseExpiryDate", e.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label="Form 11" required>
            <select
              required
              value={form.form11}
              onChange={(e) => update("form11", e.target.value as Driver["form11"])}
              className={inputClass}
            >
              <option value="" disabled>
                Select
              </option>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
            </select>
          </Field>

          <Field label="ESI Number" required>
            <input
              type="text"
              required
              value={form.esiNumber}
              onChange={(e) => update("esiNumber", e.target.value)}
              className={inputClass}
              placeholder="e.g. TN/100/123456789"
            />
          </Field>

          <Field label="PAN Number" required>
            <input
              type="text"
              required
              value={form.panNumber}
              onChange={(e) => update("panNumber", e.target.value)}
              className={inputClass}
              placeholder="e.g. ABCDE1234F"
            />
          </Field>

          <Field label="Agreement Signed" required>
            <select
              required
              value={form.agreementSigned}
              onChange={(e) => update("agreementSigned", e.target.value as Driver["agreementSigned"])}
              className={inputClass}
            >
              <option value="" disabled>
                Select
              </option>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
            </select>
          </Field>
        </div>

        <div className="rounded-lg border border-gray-200 p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">Bank Account Details</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Bank Name" required>
              <input
                type="text"
                required
                value={form.bankName}
                onChange={(e) => update("bankName", e.target.value)}
                className={inputClass}
                placeholder="e.g. HDFC Bank"
              />
            </Field>

            <Field label="Branch Name of the Bank" required>
              <input
                type="text"
                required
                value={form.bankBranchName}
                onChange={(e) => update("bankBranchName", e.target.value)}
                className={inputClass}
                placeholder="e.g. Coimbatore Main"
              />
            </Field>

            <Field label="Account Number" required>
              <input
                type="text"
                required
                value={form.accountNumber}
                onChange={(e) => update("accountNumber", e.target.value)}
                className={inputClass}
                placeholder="e.g. 1234567890123456"
              />
            </Field>

            <Field label="IFSC Code" required>
              <input
                type="text"
                required
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

        <div className="rounded-lg border border-gray-200 p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">Software Credentials</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Username" required>
              <input
                type="text"
                required
                value={form.username}
                onChange={(e) => {
                  lastAutoUsername.current = "";
                  update("username", e.target.value);
                }}
                className={inputClass}
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

            <Field label="Password" required>
              <input
                type="password"
                required
                value={form.password}
                onChange={(e) => update("password", e.target.value)}
                className={inputClass}
                placeholder="Set a login password"
              />
            </Field>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Driver Aadhaar Proof (PDF)" required>
            <input
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setFiles((prev) => ({ ...prev, aadhaar: file }));
                update("aadhaarFileName", file.name);
              }}
              className="text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-blue-600 hover:file:bg-blue-100"
            />
            {form.aadhaarFileName && (
              <span className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
                <FileText className="h-3.5 w-3.5" />
                {form.aadhaarFileName}
              </span>
            )}
          </Field>

          <Field label="License Proof (PDF)" required>
            <input
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setFiles((prev) => ({ ...prev, license: file }));
                update("licenseFileName", file.name);
              }}
              className="text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-blue-600 hover:file:bg-blue-100"
            />
            {form.licenseFileName && (
              <span className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
                <FileText className="h-3.5 w-3.5" />
                {form.licenseFileName}
              </span>
            )}
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
            {initialData ? "Save Changes" : "Add Driver"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
