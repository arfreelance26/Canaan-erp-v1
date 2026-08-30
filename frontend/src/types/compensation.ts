export type PersonStatus = "Active" | "On-Trip" | "Leave" | "Non-Active";

export type CompensationTransactionType = "Advance" | "Salary";

export type CompensationTransaction = {
  id: string;
  personId: string;
  /** Snapshot of the driver/staff member's name taken when this transaction
   * was created — stays populated even if that record is later deleted.
   * Prefer this over looking the name up by personId when it's available. */
  personName: string | null;
  type: CompensationTransactionType;
  amount: number;
  date: string;
  note: string;
  tripNumber?: string;
};
