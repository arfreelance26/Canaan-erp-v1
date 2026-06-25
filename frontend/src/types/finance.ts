export type EmiRecord = {
  id: string;
  emiName: string;
  truckRegistration: string;
  loanNumber: string;
  bankName: string;
  loanAmount: string;
  emiStartDate: string;
  emiEndDate: string;
  emiAmount: string;
  tenureMonths: string;
  emiPaymentDate: string;
};

export type RecurringPaymentFrequency = "Monthly" | "Quarterly" | "Yearly";

export type RecurringPaymentStatus = "Active" | "Paused";

export type RecurringPayment = {
  id: string;
  title: string;
  category: string;
  amount: number;
  frequency: RecurringPaymentFrequency;
  nextDueDate: string;
  status: RecurringPaymentStatus;
};
