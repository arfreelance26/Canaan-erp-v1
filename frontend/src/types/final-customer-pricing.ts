export type FinalCustomerPricing = {
  id: string;
  customerId: string;
  // The real match key — a specific CustomerDestination row. Required for new
  // entries; null only on legacy rows the backend couldn't unambiguously
  // backfill (two destinations shared the same address text).
  customerDestinationId: string | null;
  // Display label, kept in sync server-side with the linked destination —
  // required for new entries; may be null only on legacy rows created before
  // this field existed.
  customerDestination: string | null;
  actualHireAmount: string | null;
  accountsHireAmount: string | null;
  version?: number;
  createdAt?: string | null;
};
