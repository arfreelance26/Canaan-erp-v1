"use client";

import { useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Truck, PauseCircle, CalendarOff, Wrench, Loader2, Plus, Pencil, Trash2, X, Check, MessageSquare, AlertCircle } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Dialog } from "@/components/ui/Dialog";
import { DecimalInput } from "@/components/ui/DecimalInput";
import { Field, inputClassLower } from "@/components/ui/Field";
import { cn } from "@/lib/utils";
import { getAttendanceForDate } from "@/lib/attendance-data";
import { formatDateTime } from "@/lib/format-date";
import { confirmDelete, showError } from "@/lib/swal";
import { attendanceApi, securityApi } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { HALT_CONTAINER_TYPES, containerLabel } from "@/lib/halt-pay";
import type { Driver } from "@/types/driver";
import type { DriverAttendanceRecord, DriverAttendanceRemark } from "@/types/attendance";

const PREVIEW_COUNT = 2;

type DriverAttendanceTableProps = {
  drivers: Driver[];
  records: DriverAttendanceRecord[];
  remarks: DriverAttendanceRemark[];
  date: string;
  readOnly?: boolean;
  onMark: (driverId: string, currentRecord: DriverAttendanceRecord | undefined, status: string, containerSpecification?: string, workshopAdvance?: number) => Promise<void>;
  onAddRemark: (driverId: string, remark: string) => Promise<DriverAttendanceRemark | undefined>;
  onUpdateRemark: (id: string, remark: string) => Promise<void>;
  onDeleteRemark: (id: string) => Promise<void>;
};

const columns = ["Photo", "Driver ID", "Driver's Name", "Attendance", "Marked At", "Remarks"];

const statusOptions = [
  { value: "On Trip",     label: "On Trip",      icon: Truck,        activeClass: "border-blue-500 bg-blue-50 text-blue-700" },
  { value: "On Halt",     label: "On Halt",       icon: PauseCircle,  activeClass: "border-orange-500 bg-orange-50 text-orange-700" },
  { value: "Leave",       label: "Leave",         icon: CalendarOff,  activeClass: "border-yellow-500 bg-yellow-50 text-yellow-700" },
  { value: "On Workshop", label: "On Workshop",   icon: Wrench,       activeClass: "border-purple-500 bg-purple-50 text-purple-700" },
];

/** These earn Cleaner Batta, so marking one asks for the vehicle type first. */
const VEHICLE_TYPE_STATUSES = ["On Trip", "On Halt"];

/** Marking this asks for the advance paid to the driver first. */
const ADVANCE_STATUS = "On Workshop";

// ── Max advance pill (Admins click it to change the limit) ────────────────────
function MaxAdvancePill({ amount, onChange }: { amount: number | null; onChange: (amount: number) => void }) {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const label = `Max Amount: ${amount?.toLocaleString("en-IN") ?? "…"}`;
  const pillClass = "inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold whitespace-nowrap text-blue-700";

  async function save() {
    const value = Number(text);
    if (!text || !(value > 0)) { showError("Enter a max amount above 0."); return; }
    setSaving(true);
    try {
      onChange(await securityApi.updateDriverAdvanceMax(value));
      setEditing(false);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to update the max amount.");
    } finally {
      setSaving(false);
    }
  }

  if (user?.softwareDesignation !== "Admin") return <span className={pillClass}>{label}</span>;

  if (!editing) {
    return (
      <button
        type="button"
        disabled={amount === null}
        onClick={() => { setText(String(amount)); setEditing(true); }}
        title="Change the max amount"
        className={cn(pillClass, "transition-colors hover:bg-blue-100 disabled:opacity-60")}
      >
        {label}
        <Pencil className="h-3 w-3" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <DecimalInput
        autoFocus
        min="0"
        aria-label="Max Amount"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onWheel={(e) => e.currentTarget.blur()}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") { e.stopPropagation(); setEditing(false); }
        }}
        className="w-24 rounded-full border border-blue-300 px-3 py-1 text-xs focus:border-blue-500 focus:outline-none"
      />
      <button type="button" onClick={save} disabled={saving} aria-label="Save max amount"
        className="rounded-full bg-blue-600 p-1 text-white disabled:opacity-50">
        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
      </button>
      <button type="button" onClick={() => setEditing(false)} aria-label="Cancel"
        className="rounded-full border border-gray-200 p-1 text-gray-500 hover:bg-gray-50">
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

// ── Attendance radio group ────────────────────────────────────────────────────
function AttendanceRadioGroup({
  driverId, driverName, record, onMark, readOnly,
}: { driverId: string; driverName: string; record: DriverAttendanceRecord | undefined; onMark: DriverAttendanceTableProps["onMark"]; readOnly?: boolean; }) {
  const [saving, setSaving] = useState(false);
  // The status waiting for its vehicle type (the dialog is open while set).
  const [askStatus, setAskStatus] = useState<string | null>(null);
  const [askAdvance, setAskAdvance] = useState(false);
  const [advance, setAdvance] = useState("");
  const [maxAdvance, setMaxAdvance] = useState<number | null>(null);
  const current = record?.status ?? "Not Marked";
  const vehicleSpec = record?.containerSpecification ?? null;
  const vehicleLabel = containerLabel(vehicleSpec);
  const savedAdvance = record?.workshopAdvance ?? null;

  async function mark(status: string, containerSpecification?: string, workshopAdvance?: number) {
    setSaving(true);
    try { await onMark(driverId, record, status, containerSpecification, workshopAdvance); } finally { setSaving(false); }
  }

  function handleSelect(status: string) {
    if (status === current || saving || readOnly) return;
    if (VEHICLE_TYPE_STATUSES.includes(status)) setAskStatus(status);
    else if (status === ADVANCE_STATUS) openAdvance();
    else mark(status);
  }

  function openAdvance() {
    setAdvance(savedAdvance === null ? "" : String(savedAdvance));
    setMaxAdvance(null);
    setAskAdvance(true);
    securityApi.getDriverAdvanceMax().then(setMaxAdvance).catch(() => {
      setAskAdvance(false);
      showError("Couldn't load the max amount. Please try again.");
    });
  }

  function handleAdvance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAskAdvance(false);
    const amount = Number(advance);
    if (!(current === ADVANCE_STATUS && amount === savedAdvance)) mark(ADVANCE_STATUS, undefined, amount);
  }

  function handleVehicle(spec: string) {
    const status = askStatus;
    setAskStatus(null);
    if (status && !(status === current && spec === vehicleSpec)) mark(status, spec);
  }

  return (
    <div className="flex flex-wrap items-center gap-2" role="radiogroup">
      {statusOptions.map(({ value, label, icon: Icon, activeClass }) => {
        const checked = current === value;
        return (
          <label key={value} className={cn(
            "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
            checked ? activeClass : "border-gray-200 bg-white text-gray-500",
            !readOnly && "cursor-pointer hover:border-gray-300 hover:bg-gray-50",
            readOnly && "cursor-not-allowed opacity-60",
            saving && "opacity-50"
          )}>
            <input type="radio" name={`attendance-${driverId}`} value={value} checked={checked}
              disabled={saving || readOnly} onChange={() => handleSelect(value)} className="sr-only" />
            <Icon className="h-3.5 w-3.5" />
            {label}
          </label>
        );
      })}
      {VEHICLE_TYPE_STATUSES.includes(current) && (vehicleLabel || !readOnly) && (
        <button
          type="button"
          disabled={saving || readOnly}
          onClick={() => setAskStatus(current)}
          title={readOnly ? undefined : "Change the vehicle type"}
          className="rounded-full border border-dashed border-gray-300 px-2.5 py-1 text-xs font-semibold text-gray-600 transition-colors hover:border-gray-400 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {vehicleLabel ?? "Set type"}
        </button>
      )}
      {current === ADVANCE_STATUS && (savedAdvance !== null || !readOnly) && (
        <button
          type="button"
          disabled={saving || readOnly}
          onClick={openAdvance}
          title={readOnly ? undefined : "Change the advance paid"}
          className="rounded-full border border-dashed border-gray-300 px-2.5 py-1 text-xs font-semibold text-gray-600 transition-colors hover:border-gray-400 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {savedAdvance === null ? "Set advance" : `Advance ₹${savedAdvance.toLocaleString("en-IN")}`}
        </button>
      )}
      {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
      <Dialog
        open={askStatus !== null}
        onClose={() => setAskStatus(null)}
        title="Which Vehicle is the Driver driving today?"
        className="sm:max-w-md"
      >
        <p className="mb-3 text-sm text-gray-500">{driverName} · {askStatus}</p>
        <div className="grid grid-cols-2 gap-3">
          {HALT_CONTAINER_TYPES.map((t) => (
            <button
              key={t.spec}
              type="button"
              onClick={() => handleVehicle(t.spec)}
              className={cn(
                "rounded-xl border px-4 py-4 text-sm font-semibold transition-colors",
                t.spec === vehicleSpec
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-gray-200 bg-white text-gray-700 hover:border-blue-300 hover:bg-blue-50/50",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </Dialog>
      <Dialog
        open={askAdvance}
        onClose={() => setAskAdvance(false)}
        title="Advance Paid to the Driver"
        className="sm:max-w-lg"
        headerRight={<MaxAdvancePill amount={maxAdvance} onChange={setMaxAdvance} />}
      >
        <form onSubmit={handleAdvance} className="flex flex-col gap-5">
          <div className="dk-inset flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50/70 px-4 py-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-purple-100 bg-gradient-to-br from-purple-50 to-white text-purple-600 shadow-sm">
              <Wrench className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-gray-900">{driverName}</p>
              <p className="text-xs text-gray-500">Driver</p>
            </div>
            <span className="shrink-0 rounded-full border border-purple-200 bg-purple-50 px-2.5 py-1 text-xs font-semibold text-purple-700">
              {ADVANCE_STATUS}
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <Field label="Advance Paid" required>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-lg font-semibold text-gray-400">₹</span>
                <DecimalInput
                  autoFocus
                  required
                  min="0"
                  max={maxAdvance ?? undefined}
                  value={advance}
                  onChange={(e) => setAdvance(e.target.value)}
                  onWheel={(e) => e.currentTarget.blur()}
                  placeholder="0.00"
                  className={cn(inputClassLower, "h-12 pl-9 text-lg font-semibold")}
                />
              </div>
            </Field>
            <p className="text-xs text-gray-500">Enter 0 if no advance was paid.</p>
          </div>
          <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
            <button
              type="button"
              onClick={() => setAskAdvance(false)}
              className="btn-interactive rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-all duration-200 hover:bg-gray-50 active:scale-95"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={maxAdvance === null}
              className="btn-interactive rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white transition-all duration-200 hover:bg-blue-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

// ── Single remark row (used in cell and dialog) ───────────────────────────────
function RemarkRow({
  remark, onUpdate, onDelete, readOnly,
}: { remark: DriverAttendanceRemark; onUpdate: (id: string, text: string) => Promise<void>; onDelete: (id: string) => Promise<void>; readOnly?: boolean; }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(remark.remark);
  const [saving, setSaving] = useState(false);

  async function saveEdit() {
    const trimmed = text.trim();
    if (!trimmed || trimmed === remark.remark) { setEditing(false); return; }
    setSaving(true);
    try { await onUpdate(remark.id, trimmed); setEditing(false); } finally { setSaving(false); }
  }

  async function handleDelete() {
    const res = await confirmDelete("remark");
    if (!res.isConfirmed) return;
    setSaving(true);
    try { await onDelete(remark.id); } finally { setSaving(false); }
  }

  if (editing) {
    return (
      <li className="flex items-center gap-1.5">
        <input autoFocus value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditing(false); }}
          className="flex-1 rounded border border-blue-300 px-2 py-0.5 text-xs focus:outline-none" />
        <button type="button" onClick={saveEdit} disabled={saving}
          className="rounded bg-blue-600 px-2 py-0.5 text-xs text-white disabled:opacity-50">
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
        </button>
        <button type="button" onClick={() => setEditing(false)}
          className="rounded border border-gray-200 px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-50">
          Cancel
        </button>
      </li>
    );
  }

  return (
    <li className="group flex items-start gap-1.5">
      {remark.isLateEntry
        ? <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
        : <MessageSquare className="mt-0.5 h-3 w-3 shrink-0 text-gray-400" />
      }
      <div className="flex-1 flex flex-col gap-0.5">
        {remark.isLateEntry && (
          <span className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide">Late Entry</span>
        )}
        <span className="text-xs text-gray-700 break-words whitespace-normal">{remark.remark}</span>
      </div>
      {!readOnly && !remark.isLateEntry && (
        <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button type="button" onClick={() => { setText(remark.remark); setEditing(true); }}
            className="rounded p-0.5 text-gray-400 hover:text-blue-600">
            <Pencil className="h-3 w-3" />
          </button>
          <button type="button" onClick={handleDelete} disabled={saving}
            className="rounded p-0.5 text-gray-400 hover:text-red-600 disabled:opacity-50">
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
          </button>
        </div>
      )}
    </li>
  );
}

// ── View All dialog ───────────────────────────────────────────────────────────
function ViewAllDialog({
  driver, date, remarks, onClose, onAdd, onUpdate, onDelete, readOnly,
}: {
  driver: Driver; date: string; remarks: DriverAttendanceRemark[];
  onClose: () => void;
  onAdd: (driverId: string, remark: string) => Promise<DriverAttendanceRemark | undefined>;
  onUpdate: (id: string, text: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  readOnly?: boolean;
}) {
  const [addText, setAddText] = useState("");
  const [adding, setAdding] = useState(false);

  async function handleAdd() {
    const trimmed = addText.trim();
    if (!trimmed) return;
    setAdding(true);
    try { await onAdd(driver.driverId, trimmed); setAddText(""); } finally { setAdding(false); }
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-xl bg-white shadow-2xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <p className="font-semibold text-gray-900">{driver.name}</p>
            <p className="text-xs text-gray-500">{driver.driverId} · {date}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {remarks.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No remarks yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {remarks.map((r) => (
                <RemarkRow key={r.id} remark={r} onUpdate={onUpdate} onDelete={onDelete} readOnly={readOnly} />
              ))}
            </ul>
          )}
        </div>

        {!readOnly && (
          <div className="border-t px-5 py-3 flex items-center gap-2">
            <input value={addText} onChange={(e) => setAddText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
              placeholder="Add new remark…"
              className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none" />
            <button type="button" onClick={handleAdd} disabled={adding || !addText.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

// ── Remarks cell (inline preview + view-all) ──────────────────────────────────
function RemarksCell({
  driver, date, remarks, onAdd, onUpdate, onDelete, readOnly,
}: {
  driver: Driver; date: string; remarks: DriverAttendanceRemark[];
  onAdd: (driverId: string, remark: string) => Promise<DriverAttendanceRemark | undefined>;
  onUpdate: (id: string, text: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  readOnly?: boolean;
}) {
  const [showDialog, setShowDialog] = useState(false);
  const [addText, setAddText] = useState("");
  const [addingInline, setAddingInline] = useState(false);
  const [saving, setSaving] = useState(false);

  const preview = remarks.slice(0, PREVIEW_COUNT);
  const hasMore = remarks.length > PREVIEW_COUNT;

  async function handleInlineAdd() {
    const trimmed = addText.trim();
    if (!trimmed) return;
    setSaving(true);
    try { await onAdd(driver.driverId, trimmed); setAddText(""); setAddingInline(false); } finally { setSaving(false); }
  }

  return (
    <>
      <div className="flex flex-col gap-1.5 min-w-[200px]">
        {preview.length > 0 && (
          <ul className="flex flex-col gap-1">
            {preview.map((r) => (
              <RemarkRow key={r.id} remark={r} onUpdate={onUpdate} onDelete={onDelete} readOnly={readOnly} />
            ))}
          </ul>
        )}

        {hasMore && (
          <button type="button" onClick={() => setShowDialog(true)}
            className="w-fit text-xs text-blue-600 hover:underline font-medium">
            View all ({remarks.length})
          </button>
        )}

        {!readOnly && (
          addingInline ? (
            <div className="flex items-center gap-1.5 mt-1">
              <input autoFocus value={addText} onChange={(e) => setAddText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleInlineAdd(); if (e.key === "Escape") { setAddingInline(false); setAddText(""); } }}
                placeholder="Type remark…"
                className="flex-1 rounded border border-gray-200 px-2 py-1 text-xs focus:border-blue-400 focus:outline-none" />
              <button type="button" onClick={handleInlineAdd} disabled={saving || !addText.trim()}
                className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-50">
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
              </button>
              <button type="button" onClick={() => { setAddingInline(false); setAddText(""); }}
                className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-500 hover:bg-gray-50">
                Cancel
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setAddingInline(true)}
              className="flex w-fit items-center gap-1 rounded-full border border-dashed border-gray-300 px-2 py-0.5 text-xs text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors">
              <Plus className="h-3 w-3" />
              Add Remark
            </button>
          )
        )}
      </div>

      {showDialog && (
        <ViewAllDialog
          driver={driver} date={date} remarks={remarks}
          onClose={() => setShowDialog(false)}
          onAdd={onAdd} onUpdate={onUpdate} onDelete={onDelete}
          readOnly={readOnly}
        />
      )}
    </>
  );
}

// ── Main table ────────────────────────────────────────────────────────────────
export function DriverAttendanceTable({ drivers, records, remarks, date, readOnly, onMark, onAddRemark, onUpdateRemark, onDeleteRemark }: DriverAttendanceTableProps) {
  if (drivers.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
        No driver records yet. Add drivers under &ldquo;Our Drivers&rdquo; to get started.
      </div>
    );
  }

  return (
    <div className="overflow-auto max-h-[75vh] rounded-xl border border-white/80 bg-white/90 shadow-[0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
      <table className="w-full min-w-[1100px] text-left text-sm">
        <thead className="sticky top-0 z-10">
          <tr className="border-b border-gray-200 bg-gray-50">
            {columns.map((column) => (
              <th key={column} className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase whitespace-nowrap">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {drivers.map((driver) => {
            const record = getAttendanceForDate(records, driver.driverId, date);
            const driverRemarks = remarks.filter((r) => r.driverId === driver.driverId && r.date === date);
            return (
              <tr key={driver.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Avatar photoUrl={driver.photoUrl} label={driver.name} size={44} />
                </td>
                <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{driver.driverId}</td>
                <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{driver.name}</td>
                <td className="px-4 py-3">
                  <AttendanceRadioGroup driverId={driver.driverId} driverName={driver.name} record={record || undefined} onMark={onMark} readOnly={readOnly} />
                </td>
                <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDateTime(record?.markedAt)}</td>
                <td className="px-4 py-3">
                  <RemarksCell
                    driver={driver} date={date} remarks={driverRemarks}
                    onAdd={onAddRemark} onUpdate={onUpdateRemark} onDelete={onDeleteRemark}
                    readOnly={readOnly}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
