import type { EmiRecord, RecurringPayment } from "@/types/finance";

export const initialEmiRecords: EmiRecord[] = [
  {
    id: "1",
    emiName: "Tata Signa 4623.S Loan",
    truckRegistration: "TN 69 AA 1256",
    loanNumber: "HDFC-LN-88231",
    bankName: "HDFC Bank",
    loanAmount: "2400000",
    emiStartDate: "2024-08-05",
    emiEndDate: "2029-08-05",
    emiAmount: "48500",
    tenureMonths: "60",
    emiPaymentDate: "2026-06-05",
  },
];

export const initialRecurringPayments: RecurringPayment[] = [
  {
    id: "1",
    title: "Office Rent - Chennai HQ",
    category: "Rent",
    amount: 85000,
    frequency: "Monthly",
    nextDueDate: "2026-07-01",
    status: "Active",
  },
  {
    id: "2",
    title: "Fleet Insurance Premium",
    category: "Insurance",
    amount: 145000,
    frequency: "Yearly",
    nextDueDate: "2027-01-15",
    status: "Active",
  },
  {
    id: "3",
    title: "GPS Tracking Subscription",
    category: "Software",
    amount: 18000,
    frequency: "Quarterly",
    nextDueDate: "2026-08-01",
    status: "Active",
  },
  {
    id: "4",
    title: "Warehouse Lease - Kochi",
    category: "Rent",
    amount: 52000,
    frequency: "Monthly",
    nextDueDate: "2026-07-01",
    status: "Paused",
  },
];
