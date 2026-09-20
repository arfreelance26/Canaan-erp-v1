export type CargoClassification = "IMPORT" | "EXPORT" | "CFS LADEN" | "EMPTY" | "OPEN LOAD" | "COASTAL";

export type ContainerType = "20 FEET" | "40 FEET" | "2 X 20 FEET" | "OPEN LOAD";

export type WeightInTons = "NORMAL" | "Up to 20 Tons" | "Between 20 - 25 Tons" | "Between 25-28 Tons" | "Between 28-30 Tons";

export type CustomerPricingStatus = "ACTIVE" | "INACTIVE" | "BLACKLISTED";

export type CustomerPricing = {
  id: string;
  customerId: string;
  // The real match key — a specific CustomerDestination row. Null only for
  // legacy rows the backend couldn't unambiguously backfill (two destinations
  // shared the same address text) — re-save via the edit form to relink.
  customerDestinationId: string | null;
  // Display label, kept in sync server-side with the linked destination.
  customerDestination: string;
  rate: string;
  commissionAmount?: string;
  status: CustomerPricingStatus | "";
  validFrom?: string;
  validTo?: string;
};
