import type { PaymentType } from "@/types/trip";

export type BillTo = "CUSTOMER" | "CONSIGNEE" | "SELF/CGI";

export type TripClosureData = {
  tripId: string;

  // 1. Shipment Information (auto-populated from trip, read-only in UI)
  bookingNo: string;
  containerNo: string;
  releaseOrderNo: string;
  containerType: string;
  line: string;
  loadType: string;
  movementCategory: string;

  // 2. Assignment (auto-populated from trip, read-only in UI)
  vehicleId: string;
  driverId: string;
  assignmentDate: string;

  // 3. Route (from/to are read-only; tripCompletedDate is editable)
  fromLocation: string;
  toLocation: string;
  tripCompletedDate: string;

  // 4. Billing (all editable)
  hireAmount: string;
  transportAmount: string;
  billingAmount: string;
  advanceAmount: string;
  driverAdvance: string;
  additionalDriverAdvance: string;
  billTo: BillTo | "";
  /** The trip's Payment Type, chosen at Close Trip and saved onto the trip
   * (not a closure field). Left out = keep the trip's as it is. */
  paymentType?: PaymentType | "";

  // 5. Halt Information (all editable)
  companyHaltDays: string;
  partyHaltDays: string;
  haltRemarks: string;
  driverHaltCompensation: string;
  /** The two parts of driverHaltCompensation, each at its own branch rate.
   * Empty on trips closed before the rates were split. */
  companyHaltPay?: string;
  partyHaltPay?: string;

  // Closure remarks (visible to admin in trip history)
  closureRemarks: string;

  // Meta — set by backend when closure is created
  closedAt: string;  // ISO date string from created_at
  version?: number;  // optimistic-locking token echoed back on save
};
