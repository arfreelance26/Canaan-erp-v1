import type { ReactNode } from "react";
import { formatDate } from "@/lib/format-date";
import type { RepairLine } from "@/types/truck-maintenance";

const dash = <span className="italic text-text-tertiary">—</span>;

export const money = (value: string | number) =>
  `₹${(typeof value === "number" ? value : parseFloat(value) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * One table cell's value for each repair in a record. A record with one
 * repair shows just the value (as before repair cards); with several, each
 * value sits under its repair's name, so it's clear which is which.
 */
export function PerRepair({ lines, render }: { lines: RepairLine[]; render: (line: RepairLine) => ReactNode }) {
  if (lines.length <= 1) return <>{lines[0] ? render(lines[0]) || dash : dash}</>;
  return (
    <ul className="flex flex-col gap-1.5">
      {lines.map((l, i) => (
        <li key={`${l.repairType}-${i}`} className="leading-tight">
          <span className="block text-caption-2-semibold text-text-tertiary">{l.repairType}</span>
          <span className="block">{render(l) || dash}</span>
        </li>
      ))}
    </ul>
  );
}

/** Who did it, as shown in lists: the vendor or individual's name. */
export const byText = (l: RepairLine) => (l.maintenanceBy ? `${l.maintenanceBy}${l.maintenanceByType === "Individual" ? " (individual)" : ""}` : "");
export const invoiceDateText = (l: RepairLine) => (l.invoiceDate ? formatDate(l.invoiceDate) : "");

/** Every repair with all its details, for a record or request's detail view. */
export function RepairLinesTable({ lines }: { lines: RepairLine[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-separator-border">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="bg-fill-1 text-caption-2-semibold text-text-tertiary">
          <tr>
            {["Repair", "Cost", "Location", "Maintenance By", "Invoice No.", "Invoice Date"].map((h) => (
              <th key={h} className="px-3 py-2">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-separator-border">
          {lines.map((l, i) => (
            <tr key={`${l.repairType}-${i}`}>
              <td className="px-3 py-2 font-medium text-text-primary">{l.repairType}</td>
              <td className="px-3 py-2 tabular-nums font-semibold text-text-primary">{money(l.cost)}</td>
              <td className="px-3 py-2 text-text-secondary">{l.maintenanceLocation || dash}</td>
              <td className="px-3 py-2 text-text-secondary">{byText(l) || dash}</td>
              <td className="px-3 py-2 text-text-secondary">{l.invoiceNumber || dash}</td>
              <td className="px-3 py-2 tabular-nums text-text-secondary">{invoiceDateText(l) || dash}</td>
            </tr>
          ))}
        </tbody>
        {lines.length > 1 && (
          <tfoot className="border-t border-separator-border bg-fill-1">
            <tr>
              <td className="px-3 py-2 text-caption-1-semibold text-text-secondary">Total</td>
              <td className="px-3 py-2 tabular-nums font-semibold text-accent-text" colSpan={5}>
                {money(lines.reduce((s, l) => s + (parseFloat(l.cost) || 0), 0))}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
