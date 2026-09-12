"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Coins, Check, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { branchesApi, defaultBattaApi } from "@/lib/api";
import type { Branch } from "@/types/branch";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { showError } from "@/lib/swal";

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
        <div>
          <div className="flex items-center gap-2">
            <Coins className="h-6 w-6 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">Default Batta Management</h1>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Configure default batta (allowance) rates used across trips and driver compensation.
          </p>
        </div>

        <div className="h-6">
          {saveStatus === "saving" && (
            <span className="flex items-center gap-1.5 text-xs text-gray-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
            </span>
          )}
          {saveStatus === "saved" && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
              <Check className="h-3.5 w-3.5" /> Saved
            </span>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        {branches.length === 0 && (
          <p className="text-sm text-gray-500">
            No branches found. Create one in Branch Management first.
          </p>
        )}

        {branches.length > 0 && (
          <div className="flex flex-wrap gap-2 border-b border-gray-100 pb-4">
            {branches.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setSelectedBranchId(b.id)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  selectedBranchId === b.id
                    ? "bg-brand-navy text-white shadow-sm"
                    : "border border-gray-200 bg-gray-50 text-gray-600 hover:border-brand-navy/40 hover:text-brand-navy"
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
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  selectedTripType === t
                    ? "bg-brand-gold text-brand-navy shadow-sm"
                    : "border border-gray-200 bg-gray-50 text-gray-600 hover:border-brand-gold/60 hover:text-brand-navy"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}

        {selectedBranchId && (
          <div className="mt-4 overflow-hidden rounded-xl border border-gray-100">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Cargo Type
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Default Batta (₹)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {CARGO_TYPES.map((cargoType) => (
                  <tr key={cargoType}>
                    <td className="px-4 py-2.5 font-medium text-gray-700">{cargoType}</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="relative ml-auto w-36">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-gray-400">
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
                          className={`w-full rounded-lg border border-gray-200 py-1.5 pl-7 pr-3 text-right text-sm outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 ${
                            canEdit ? "bg-white/50" : "bg-gray-50 text-gray-600 cursor-not-allowed"
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
    </div>
  );
}
