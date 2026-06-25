export type PersonStatus = "Active" | "On-Trip" | "Leave" | "Non-Active";

export type CompensationTransactionType = "Advance" | "Salary";

export type CompensationTransaction = {
  id: string;
  personId: string;
  type: CompensationTransactionType;
  amount: number;
  date: string;
  note: string;
  tripNumber?: string;
};
