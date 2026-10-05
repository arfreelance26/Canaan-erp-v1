"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { tyreRemarkPresetApi } from "@/lib/api";
import type { TyreRemarkPreset, TyreRemarkScenario } from "@/types/tyre-inventory";
import { useAuth } from "@/context/AuthContext";
import { Dialog } from "@/components/ui/Dialog";
import { showError, showSuccess } from "@/lib/swal";
import { cn } from "@/lib/utils";

const SECTIONS: { scenario: TyreRemarkScenario; title: string; hint: string }[] = [
  { scenario: "Attachment", title: "Attachment remarks", hint: "Shown under Remarks when attaching a tyre." },
  { scenario: "Removal", title: "Removal remarks", hint: "Shown under Remarks when removing a tyre." },
  { scenario: "Swap", title: "Swap remarks", hint: "Shown under Remark for rotations and swaps." },
];

type Props = {
  open: boolean;
  onClose: () => void;
};

// Shared quick-pick remarks for attaching, removing and swapping tyres. Only
// Maintenance and Admin can change them, matching the server's permissions.
export function ManageRemarksDialog({ open, onClose }: Props) {
  const { user } = useAuth();
  const canEdit = user?.softwareDesignation === "Maintenance" || user?.softwareDesignation === "Admin";
  const [presets, setPresets] = useState<TyreRemarkPreset[]>([]);
  const [drafts, setDrafts] = useState<Record<TyreRemarkScenario, string>>({ Attachment: "", Removal: "", Swap: "" });

  useEffect(() => {
    if (!open) return;
    tyreRemarkPresetApi.list().then(setPresets).catch(() => {});
  }, [open]);

  async function addRemark(scenario: TyreRemarkScenario) {
    const text = drafts[scenario].trim();
    if (!text) return;
    try {
      const created = await tyreRemarkPresetApi.create(scenario, text);
      setPresets((prev) => [...prev, created]);
      setDrafts((prev) => ({ ...prev, [scenario]: "" }));
      showSuccess("Remark added.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to add remark.");
    }
  }

  async function removeRemark(preset: TyreRemarkPreset) {
    try {
      await tyreRemarkPresetApi.remove(preset.id);
      setPresets((prev) => prev.filter((p) => p.id !== preset.id));
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to remove remark.");
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Manage Remarks">
      <div className="flex flex-col gap-6 p-1">
        {!canEdit && (
          <p className="text-xs text-gray-500">Only Maintenance and Admin can add or remove remarks.</p>
        )}
        {SECTIONS.map((section) => {
          const items = presets.filter((p) => p.scenario === section.scenario);
          return (
            <section key={section.scenario} className="flex flex-col gap-2">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">{section.title}</h3>
                <p className="text-xs text-gray-500">{section.hint}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {items.length === 0 && <span className="text-xs italic text-gray-400">No remarks yet.</span>}
                {items.map((preset) => (
                  <span
                    key={preset.id}
                    className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-2.5 py-0.5 text-xs text-gray-700"
                  >
                    {preset.text}
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => removeRemark(preset)}
                        aria-label={`Remove ${preset.text}`}
                        className="rounded-full p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                ))}
              </div>
              {canEdit && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={drafts[section.scenario]}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [section.scenario]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addRemark(section.scenario);
                      }
                    }}
                    placeholder="Add a remark…"
                    maxLength={200}
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => addRemark(section.scenario)}
                    disabled={!drafts[section.scenario].trim()}
                    className={cn(
                      "rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors",
                      "disabled:opacity-50"
                    )}
                  >
                    Add
                  </button>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </Dialog>
  );
}
