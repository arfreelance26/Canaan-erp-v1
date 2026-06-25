import type { CompensationTransaction, PersonStatus } from "@/types/compensation";

export const driverStatuses: Record<string, PersonStatus> = {
  "1": "Active",
  "2": "On-Trip",
};

export const staffStatuses: Record<string, PersonStatus> = {
  "1": "Active",
  "2": "Active",
  "3": "On-Trip",
};

export const initialDriverTransactions: CompensationTransaction[] = [
  {
    id: "1",
    personId: "1",
    type: "Salary",
    amount: 28000,
    date: "2026-05-31",
    note: "May salary",
  },
  {
    id: "2",
    personId: "1",
    type: "Advance",
    amount: 5000,
    date: "2026-06-10",
    note: "Advance for medical expense",
  },
  {
    id: "3",
    personId: "2",
    type: "Salary",
    amount: 26000,
    date: "2026-05-31",
    note: "May salary",
  },
];

export const initialStaffTransactions: CompensationTransaction[] = [
  {
    id: "1",
    personId: "1",
    type: "Salary",
    amount: 32000,
    date: "2026-05-31",
    note: "May salary",
  },
  {
    id: "2",
    personId: "2",
    type: "Salary",
    amount: 45000,
    date: "2026-05-31",
    note: "May salary",
  },
];
