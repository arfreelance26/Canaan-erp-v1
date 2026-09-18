export type FinalCustomerPricing = {
  id: string;
  customerId: string;
  // The route this final price applies to — required for new entries; may be
  // null only on legacy rows created before this field existed.
  customerDestination: string | null;
  actualHireAmount: string | null;
  accountsHireAmount: string | null;
  version?: number;
  createdAt?: string | null;
};
