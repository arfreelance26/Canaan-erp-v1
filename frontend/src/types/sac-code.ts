export type SacCode = {
  id: string;
  description: string;
  code: string;
  gstRate: string;
  linkedExpense?: string;
  autoPopulateInvoiceType?: string;
  version?: number;
};
