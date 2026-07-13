"use client";

import { useEffect, useMemo } from "react";
import { getComplianceStatus, type ComplianceField } from "@/lib/compliance";
import type { Truck } from "@/types/truck";
import { useNotifications } from "@/context/NotificationContext";

type ComplianceCheck = {
  field: ComplianceField;
  label: string;
  dateKey: keyof Truck;
};

const CHECKS: ComplianceCheck[] = [
  { field: "fc",            label: "Fitness Certificate (FC)",    dateKey: "fcExpiryDate" },
  { field: "nationalPermit", label: "National Permit",            dateKey: "nationalPermitDate" },
  { field: "localPermit",   label: "Local Permit",                dateKey: "localPermitDate" },
  { field: "pollution",     label: "Pollution Certificate (PUC)", dateKey: "pollutionCertificateDate" },
  { field: "roadTax",       label: "Road Tax",                    dateKey: "roadTaxDate" },
  { field: "insurance",     label: "Insurance",                   dateKey: "insuranceExpiryDate" },
];

export type ComplianceAlertItem = {
  truckId: string;
  label: string;
  status: "Expired" | "Expiring Soon";
};

export function useComplianceAlerts(trucks: Truck[]) {
  const { setComplianceAlertCount } = useNotifications();

  const { expiredItems, expiringSoonItems } = useMemo(() => {
    const expired: ComplianceAlertItem[] = [];
    const expiringSoon: ComplianceAlertItem[] = [];

    for (const truck of trucks) {
      for (const { field, label, dateKey } of CHECKS) {
        const date = truck[dateKey] as string | undefined;
        if (!date) continue;
        const status = getComplianceStatus(date, field);
        const id = truck.registrationNumber || truck.truckId;
        if (status === "Expired") {
          expired.push({ truckId: id, label, status: "Expired" });
        } else if (status === "Expiring Soon") {
          expiringSoon.push({ truckId: id, label, status: "Expiring Soon" });
        }
      }
    }

    return { expiredItems: expired, expiringSoonItems: expiringSoon };
  }, [trucks]);

  useEffect(() => {
    setComplianceAlertCount(expiredItems.length + expiringSoonItems.length);
  }, [expiredItems.length, expiringSoonItems.length, setComplianceAlertCount]);

  return {
    expiredCount: expiredItems.length,
    expiringSoonCount: expiringSoonItems.length,
    expiredItems,
    expiringSoonItems,
  };
}
