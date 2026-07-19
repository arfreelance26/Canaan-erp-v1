export type FinalCustomerPricing = {
  id: string;
  customerId: string;
  actualHireAmount: string | null;
  accountsHireAmount: string | null;
  version?: number;
  createdAt?: string | null;
};
