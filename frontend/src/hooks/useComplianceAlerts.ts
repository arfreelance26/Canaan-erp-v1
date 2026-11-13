"use client";

import { useEffect, useMemo } from "react";
import { getComplianceStatus, isMissingCost, type ComplianceField } from "@/lib/compliance";
import type { Truck } from "@/types/truck";
import { useNotifications } from "@/context/NotificationContext";

export type ComplianceCheck = {
  field: ComplianceField;
  label: string;
  dateKey: keyof Truck;
};

export const COMPLIANCE_CHECKS: ComplianceCheck[] = [
  { field: "fc",            label: "Fitness Certificate (FC)",    dateKey: "fcExpiryDate" },
  { field: "nationalPermit", label: "National Permit",            dateKey: "nationalPermitDate" },
  { field: "localPermit",   label: "Local Permit",                dateKey: "localPermitDate" },
  { field: "pollution",     label: "Pollution Certificate (PUC)", dateKey: "pollutionCertificateDate" },
  { field: "roadTax",       label: "Road Tax",                    dateKey: "roadTaxDate" },
  { field: "insurance",     label: "Insurance",                   dateKey: "insuranceExpiryDate" },
];

/** All seven documents with their cost field — for "Not uploaded" and "No cost",
 *  the same set Compliance & Renewals counts (RC included). */
const DOCUMENTS: { label: string; dateKey: keyof Truck; costKey: keyof Truck }[] = [
  { label: "Insurance",                   dateKey: "insuranceExpiryDate",      costKey: "insuranceExpenses" },
  { label: "Fitness Certificate (FC)",    dateKey: "fcExpiryDate",             costKey: "fcExpenses" },
  { label: "Registration Certificate (RC)", dateKey: "rcValidityDate",         costKey: "rcExpenses" },
  { label: "National Permit",             dateKey: "nationalPermitDate",       costKey: "nationalPermitExpenses" },
  { label: "Local Permit",                dateKey: "localPermitDate",          costKey: "localPermitExpenses" },
  { label: "Road Tax",                    dateKey: "roadTaxDate",              costKey: "roadTaxExpenses" },
  { label: "Pollution Certificate (PUC)", dateKey: "pollutionCertificateDate", costKey: "pollutionCertificateExpenses" },
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
      for (const { field, label, dateKey } of COMPLIANCE_CHECKS) {
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

  // Gaps to fill, shown in the banner but never counted as alerts (the bell).
  const { notUploadedItems, noCostItems } = useMemo(() => {
    const notUploaded: { truckId: string; label: string }[] = [];
    const noCost: { truckId: string; label: string }[] = [];
    for (const truck of trucks) {
      const id = truck.registrationNumber || truck.truckId;
      for (const { label, dateKey, costKey } of DOCUMENTS) {
        const date = truck[dateKey] as string | undefined;
        if (!date) notUploaded.push({ truckId: id, label });
        else if (isMissingCost(date, truck[costKey] as string | number | undefined)) noCost.push({ truckId: id, label });
      }
    }
    return { notUploadedItems: notUploaded, noCostItems: noCost };
  }, [trucks]);

  useEffect(() => {
    setComplianceAlertCount(expiredItems.length + expiringSoonItems.length);
  }, [expiredItems.length, expiringSoonItems.length, setComplianceAlertCount]);

  return {
    expiredCount: expiredItems.length,
    expiringSoonCount: expiringSoonItems.length,
    expiredItems,
    expiringSoonItems,
    notUploadedItems,
    noCostItems,
  };
}
