"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RiCoinsLine as Coins, RiCheckLine as Check, RiLoader4Line as Loader2, RiHistoryLine as History } from "@remixicon/react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { branchesApi, defaultBattaApi, type DefaultBattaEditEventRow } from "@/lib/api";
import type { Branch } from "@/types/branch";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { showError } from "@/lib/feedback";
import { Dialog } from "@/components/ui/Dialog";
import { PillSearch } from "@/components/ui/PillSearch";
import { formatDateTime } from "@/lib/format-date";

import { EmptyState } from "@/components/ui/EmptyState";
import { PagedTbody } from "@/components/ui/PagedTbody";
const TRIP_TYPES = ["LOCAL", "LOCAL CFS", "OUTSTATION", "SHIFTING", "RETURN TRIP"] as const;
type TripType = (typeof TRIP_TYPES)[number];

const CARGO_TYPES = ["20FT CONTAINER", "40FT CONTAINER", "2X20 FEET CONTAINERS", "OPEN LOAD CARGO"] as const;
type CargoType = (typeof CARGO_TYPES)[number];

export default function DefaultBattaManagementPage() {
  const { user, ready } = useAuth();
  const router = useRouter();
  const isAdmin = user?.softwareDesignation === "Admin";
  // Admin and Commercial Manager may both view AND edit the rates. The backend
  // enforces the same: PUT is allowed for Admin + Commercial Manager
  // (routers/default_batta.py).
  const canEdit = isAdmin || user?.softwareDesignation === "Commercial Manager" || user?.softwareDesignation === "Assistant Commercial Manager";
  const canView = canEdit;

  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [selectedTripType, setSelectedTripType] = useState<TripType>(TRIP_TYPES[0]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [editHistoryOpen, setEditHistoryOpen] = useState(false);
  const [editHistoryEvents, setEditHistoryEvents] = useState<DefaultBattaEditEventRow[]>([]);
  const [editHistoryLoading, setEditHistoryLoading] = useState(false);
  const [editHistorySearch, setEditHistorySearch] = useState("");

  function openEditHistory() {
    setEditHistoryOpen(true);
    setEditHistoryLoading(true);
    defaultBattaApi.listEditEvents()
      .then(setEditHistoryEvents)
      .catch(() => {})
      .finally(() => setEditHistoryLoading(false));
  }

  useEffect(() => {
    if (ready && !canView) router.replace("/");
  }, [ready, canView, router]);

  useEffect(() => {
    if (!canView) return;
    branchesApi
      .list()
      .then((list) => {
        setBranches(list);
        setSelectedBranchId((prev) => prev ?? list[0]?.id ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [canView]);

  const cellKey = useCallback((branchId: string, tripType: string, cargoType: string) => `${branchId}::${tripType}::${cargoType}`, []);

  useEffect(() => {
    if (!canView || !selectedBranchId) return;
    defaultBattaApi
      .list(selectedBranchId)
      .then((rows) => {
        setDrafts((prev) => {
          const next = { ...prev };
          for (const r of rows) {
            next[cellKey(String(r.branchId), r.tripType, r.cargoType)] = r.amount != null ? String(r.amount) : "";
          }
          return next;
        });
      })
      .catch(() => showError("Failed to load default batta rates."));
  }, [canView, selectedBranchId, cellKey]);

  if (!ready || loading) return <PageSkeleton hasButton={false} columns={4} />;
  if (!canView) return null;

  const draftFor = (cargoType: CargoType): string => {
    if (!selectedBranchId) return "";
    return drafts[cellKey(selectedBranchId, selectedTripType, cargoType)] ?? "";
  };

  function updateValue(cargoType: CargoType, value: string) {
    if (!canEdit) return;
    if (!selectedBranchId) return;
    const branchId = selectedBranchId;
    const tripType = selectedTripType;
    const key = cellKey(branchId, tripType, cargoType);
    setDrafts((prev) => ({ ...prev, [key]: value }));

    if (saveTimers.current[key]) clearTimeout(saveTimers.current[key]);
    setSaveStatus("saving");
    saveTimers.current[key] = setTimeout(async () => {
      const amount = value.trim() === "" ? null : Number(value);
      if (amount !== null && Number.isNaN(amount)) {
        setSaveStatus("idle");
        return;
      }
      try {
        await defaultBattaApi.upsert(branchId, tripType, cargoType, amount);
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 1500);
      } catch (err: unknown) {
        setSaveStatus("idle");
        showError(err instanceof Error ? err.message : "Failed to save default batta rate.");
      }
    }, 600);
  }

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-warning-border bg-warning-surface text-warning-text shadow-sm">
            <Coins className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-title-1-semibold tracking-tight text-text-primary">Default Batta Management</h1>
            <p className="mt-0.5 text-sm text-text-secondary">
              Configure default batta (allowance) rates used across trips and driver compensation.
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <div className="h-6">
            {saveStatus === "saving" && (
              <span className="flex items-center gap-1.5 text-xs text-text-tertiary">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
              </span>
            )}
            {saveStatus === "saved" && (
              <span className="flex items-center gap-1.5 text-caption-1-medium text-success-text">
                <Check className="h-3.5 w-3.5" /> Saved
              </span>
            )}
          </div>
          {isAdmin && (
<button
            type="button"
            onClick={openEditHistory}
            className="flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full border border-border-button-default bg-background-primary-default px-4 text-body-semibold text-text-primary shadow-sm transition duration-300 hover:bg-fill-2"
          >
            <History className="h-4 w-4" />
            Edit History
          </button>
)}
        </div>
      </div>

      <div className="rounded-xl border border-separator-border bg-background-primary-default p-5">
        {branches.length === 0 && (
          <p className="text-sm text-text-secondary">
            No branches found. Create one in Branch Management first.
          </p>
        )}

        {branches.length > 0 && (
          <div className="flex flex-wrap gap-2 border-b border-separator-border pb-4">
            {branches.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setSelectedBranchId(b.id)}
                className={`rounded-full px-3.5 py-1.5 text-caption-1-semibold transition-colors ${
                  selectedBranchId === b.id
                    ? "bg-accent-solid text-on-solid shadow-sm"
                    : "border border-separator-border bg-fill-1 text-text-secondary hover:border-accent-solid/40 hover:text-accent-text-strong "
                }`}
              >
                {b.name}
              </button>
            ))}
          </div>
        )}

        {selectedBranchId && (
          <div className="mt-4 flex flex-wrap gap-2">
            {TRIP_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setSelectedTripType(t)}
                className={`rounded-full px-3.5 py-1.5 text-caption-1-semibold transition-colors ${
                  selectedTripType === t
                    ? "bg-gold-solid text-accent-text-strong shadow-sm"
                    : "border border-separator-border bg-fill-1 text-text-secondary hover:border-gold-solid/60 hover:text-accent-text-strong "
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}

        {selectedBranchId && (
          <div className="mt-4 overflow-hidden rounded-xl border border-separator-border">
            <table className="w-full text-sm">
              <thead className="bg-fill-1">
                <tr>
                  <th className="px-4 py-2.5 text-left text-caption-1-semibold text-text-secondary">
                    Cargo Type
                  </th>
                  <th className="px-4 py-2.5 text-right text-caption-1-semibold text-text-secondary">
                    Default Batta (₹)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-separator-border">
                {CARGO_TYPES.map((cargoType) => (
                  <tr key={cargoType}>
                    <td className="px-4 py-2.5 font-medium text-text-primary">{cargoType}</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="relative ml-auto w-36">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-caption-2-semibold text-text-tertiary">
                          ₹
                        </span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={draftFor(cargoType)}
                          onChange={(e) => updateValue(cargoType, e.target.value)}
                          placeholder="0.00"
                          readOnly={!canEdit}
                          disabled={!canEdit}
                          className={`w-full rounded-lg border border-separator-border py-1.5 pl-7 pr-3 text-right text-sm outline-none transition focus:border-accent-solid focus:bg-background-primary-default focus:ring-4 focus:ring-accent-solid/10 ${
                            canEdit ? "bg-background-primary-default" : "bg-fill-1 text-text-secondary cursor-not-allowed"
                          }`}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit History — every cell ever updated on Default Batta Management,
          in one searchable log. */}
      <Dialog
        open={editHistoryOpen}
        onClose={() => setEditHistoryOpen(false)}
        title="Edit History"
        className="sm:max-w-2xl"
      >
        <div className="flex flex-col gap-4">
          <PillSearch placeholder="Search by branch, trip type, cargo type, or actor…" value={editHistorySearch} onChange={setEditHistorySearch} />
          {editHistoryLoading ? (
            <p className="py-8 text-center text-sm text-text-tertiary">Loading history…</p>
          ) : (() => {
            const q = editHistorySearch.toLowerCase();
            const filtered = editHistoryEvents.filter((ev) =>
              !q ||
              ev.branchName.toLowerCase().includes(q) ||
              ev.tripType.toLowerCase().includes(q) ||
              ev.cargoType.toLowerCase().includes(q) ||
              ev.actorName.toLowerCase().includes(q)
            );
            return filtered.length === 0 ? (
              <EmptyState size="compact" illustration={editHistoryEvents.length === 0 ? "no-data" : "not-found"} title={editHistoryEvents.length === 0 ? "No default batta edits have been logged yet" : "No history matches this search"} />
            ) : (
              <div className="max-h-[60vh] overflow-auto rounded-lg border border-separator-border">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="sticky top-0 bg-fill-1">
                    <tr className="border-b border-separator-border">
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">Branch</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">Trip Type</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">Cargo Type</th>
                      <th className="px-3 py-2 text-right text-caption-2-semibold text-text-tertiary">Amount</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">By</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">When</th>
                    </tr>
                  </thead>
                  <PagedTbody className="divide-y divide-separator-border" items={filtered}>
                    {(ev) => (
                      <tr key={ev.id}>
                        <td className="px-3 py-2 font-semibold text-text-primary">{ev.branchName}</td>
                        <td className="px-3 py-2 text-text-secondary">{ev.tripType}</td>
                        <td className="px-3 py-2 text-text-secondary">{ev.cargoType}</td>
                        <td className="px-3 py-2 text-right text-text-secondary">
                          {ev.amount != null ? `₹${ev.amount.toLocaleString("en-IN")}` : <span className="text-text-tertiary">—</span>}
                        </td>
                        <td className="px-3 py-2 text-text-secondary">
                          {ev.actorName}
                          {ev.actorRole && <span className="text-[11px] text-text-tertiary"> ({ev.actorRole})</span>}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-text-secondary">{formatDateTime(ev.createdAt)}</td>
                      </tr>
                    )}
                  </PagedTbody>
                </table>
              </div>
            );
          })()}
        </div>
      </Dialog>
    </div>
  );
}
