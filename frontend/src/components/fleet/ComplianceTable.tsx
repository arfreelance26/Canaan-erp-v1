"use client";

import { cn } from "@/lib/utils";
import { getComplianceStatus } from "@/lib/compliance";
import { formatDate } from "@/lib/format-date";
import type { Truck } from "@/types/truck";

type ComplianceTableProps = {
  trucks: Truck[];
};

const columns = [
  "Truck ID",
  "Registration Number",
  "FC Validity Date",
  "Road Tax Validity Date",
  "National Permit Validity Date",
  "Pollution Certificate Validity Date",
];

const statusStyles: Record<string, string> = {
  Valid: "bg-green-50 text-green-700",
  "Expiring Soon": "bg-yellow-50 text-yellow-700",
  Expired: "bg-red-50 text-red-700",
};


function ComplianceCell({ date }: { date: string }) {
  const status = getComplianceStatus(date);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-gray-600">{formatDate(date)}</span>
      <span
        className={cn(
          "inline-flex w-fit rounded-full px-2 py-0.5 text-xs font-medium",
          statusStyles[status]
        )}
      >
        {status}
      </span>
    </div>
  );
}

export function ComplianceTable({ trucks }: ComplianceTableProps) {
  if (trucks.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
        No trucks yet. Add trucks under &ldquo;Our Fleet&rdquo; to get started.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-white/80 bg-white/90 shadow-[0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
      <table className="w-full min-w-[1100px] text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            {columns.map((column) => (
              <th
                key={column}
                className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {trucks.map((truck) => (
            <tr key={truck.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-medium text-gray-900">{truck.truckId}</td>
              <td className="px-4 py-3 text-gray-600">{truck.registrationNumber}</td>
              <td className="px-4 py-3">
                <ComplianceCell date={truck.fcExpiryDate} />
              </td>
              <td className="px-4 py-3">
                <ComplianceCell date={truck.roadTaxDate} />
              </td>
              <td className="px-4 py-3">
                <ComplianceCell date={truck.nationalPermitDate} />
              </td>
              <td className="px-4 py-3">
                <ComplianceCell date={truck.pollutionCertificateDate} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
