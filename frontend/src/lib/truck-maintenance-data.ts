import type { Truck } from "@/types/truck";
import type { MaintenanceRecord, MaintenanceStatusItem } from "@/types/truck-maintenance";

const AVG_KM_PER_DAY = 250;

const COMPLIANCE_FIELDS: { label: string; dateKey: keyof Truck }[] = [
  { label: "Insurance", dateKey: "insuranceExpiryDate" },
  { label: "Fitness Certificate", dateKey: "fcExpiryDate" },
  { label: "Pollution Certificate", dateKey: "pollutionCertificateDate" },
  { label: "Road Tax", dateKey: "roadTaxDate" },
  { label: "Local Permit", dateKey: "localPermitDate" },
  { label: "National Permit", dateKey: "nationalPermitDate" },
];

export function getMaintenanceStatus(
  truck: Truck,
  _records: MaintenanceRecord[]
): MaintenanceStatusItem[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return COMPLIANCE_FIELDS.flatMap(({ label, dateKey }) => {
    const raw = truck[dateKey] as string | undefined;
    if (!raw) return [];

    const expiry = new Date(raw);
    expiry.setHours(0, 0, 0, 0);
    const daysUntilDue = Math.ceil((expiry.getTime() - today.getTime()) / 86_400_000);

    if (daysUntilDue > 30) return [];

    return [
      {
        truckId: truck.id,
        item: label,
        remainingKm: Math.max(0, daysUntilDue) * AVG_KM_PER_DAY,
        category: daysUntilDue <= 0 ? "Expired" : "Due Soon",
        status: "attention" as const,
      },
    ];
  });
}
