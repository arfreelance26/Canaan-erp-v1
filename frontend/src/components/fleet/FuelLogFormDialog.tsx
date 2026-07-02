import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Fuel, Save } from "lucide-react";
import type { Truck } from "@/types/truck";
import type { FuelLog } from "@/types/fuel-log";
import { showError } from "@/lib/swal";
import { todayIst } from "@/lib/format-date";
import { DatePickerInput } from "@/components/ui/DatePickerInput";

type FuelLogFormDialogProps = {
  open: boolean;
  onClose: () => void;
  onSave: (log: Omit<FuelLog, "id" | "distance" | "mileage" | "createdAt" | "pricePerLitre">) => void;
  truck: Truck;
};

const inputClass =
  "mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors";

function Field({ label, required, rightContent, children }: { label: string; required?: boolean; rightContent?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <label className="block text-sm font-medium text-gray-700">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
        {rightContent}
      </div>
      {children}
    </div>
  );
}

export function FuelLogFormDialog({ open, onClose, onSave, truck }: FuelLogFormDialogProps) {
  const [form, setForm] = useState({
    date: todayIst(),
    odometer: "",
    litres: "",
    costPerLitre: "",
    totalCost: "",
    fuelStation: "",
    loggedBy: "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (truck.fuelCapacity && Number(form.litres) > Number(truck.fuelCapacity)) {
      await showError(`Cannot add more fuel than the truck's maximum capacity (${truck.fuelCapacity} L)`, 'Capacity Exceeded');
      return;
    }

    onSave({
      truckId: truck.id,
      date: form.date,
      odometer: form.odometer,
      litres: form.litres,
      totalCost: form.totalCost,
      fuelStation: form.fuelStation || null,
      loggedBy: form.loggedBy || null,
    });
    setForm({
      date: todayIst(),
      odometer: "",
      litres: "",
      costPerLitre: "",
      totalCost: "",
      fuelStation: "",
      loggedBy: "",
    });
  }

  function update(field: keyof typeof form, value: string) {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "litres" || field === "costPerLitre") {
        const l = parseFloat(field === "litres" ? value : prev.litres);
        const c = parseFloat(field === "costPerLitre" ? value : prev.costPerLitre);
        next.totalCost = (!isNaN(l) && !isNaN(c) && l > 0 && c > 0)
          ? (l * c).toFixed(2)
          : prev.totalCost;
      }
      return next;
    });
  }

  return (
    <Dialog open={open} onClose={onClose} title="Enter Fuel Log">
        <div className="flex items-center gap-3 mb-6 bg-gray-50 p-3 rounded-lg border border-gray-100">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-blue-100/50 text-blue-600">
            <Fuel className="w-5 h-5" />
            </div>
            <div>
            <p className="font-semibold text-gray-900">{truck.registrationNumber}</p>
            <p className="text-sm text-gray-500">{truck.modelName}</p>
            </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Date" required>
            <DatePickerInput
              required
              value={form.date}
              onChange={(v) => update("date", v)}
            />
          </Field>
          
          <Field label="Odometer Reading" required>
            <input
              type="number"
              required
              min="0"
              value={form.odometer}
              onChange={(e) => update("odometer", e.target.value)}
              className={inputClass}
              placeholder="e.g. 102500"
            />
          </Field>

          <Field 
            label="Quantity (Litres)" 
            required
            rightContent={
              <span className="text-xs text-gray-500">
                Max Capacity: <span className="font-medium text-gray-700">{truck.fuelCapacity || "N/A"} L</span>
              </span>
            }
          >
            <input
              type="number"
              required
              step="0.1"
              min="0.1"
              value={form.litres}
              onChange={(e) => update("litres", e.target.value)}
              className={inputClass}
              placeholder="e.g. 150"
            />
          </Field>

          <Field label="Cost Per Litre (₹)" required>
            <input
              type="number"
              required
              step="0.01"
              min="0.01"
              value={form.costPerLitre}
              onChange={(e) => update("costPerLitre", e.target.value)}
              className={inputClass}
              placeholder="e.g. 96.50"
            />
          </Field>

          <Field label="Total Fuel Cost (₹)" required>
            <input
              type="number"
              required
              step="0.01"
              min="1"
              value={form.totalCost}
              onChange={(e) => update("totalCost", e.target.value)}
              readOnly={!!(form.litres && form.costPerLitre)}
              className={`${inputClass} ${form.litres && form.costPerLitre ? "cursor-not-allowed bg-green-50 text-green-800" : ""}`}
              placeholder="Auto-calculated or enter manually"
            />
            {form.litres && form.costPerLitre && (
              <p className="mt-1 text-xs text-green-700">
                Auto-calculated: {form.litres} L × ₹{form.costPerLitre} = ₹{form.totalCost}
              </p>
            )}
          </Field>

          <Field label="Fuel Station (Optional)">
            <input
              type="text"
              value={form.fuelStation}
              onChange={(e) => update("fuelStation", e.target.value)}
              className={inputClass}
              placeholder="e.g. Reliance Petrol Pump"
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
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-sm"
            >
              <Save className="w-4 h-4" />
              Save Fuel Log
            </button>
          </div>
        </form>
    </Dialog>
  );
}
