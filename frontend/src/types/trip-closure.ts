export type PaymentMode = "Cash" | "UPI" | "Bank Transfer" | "Cheque" | "NEFT / RTGS";
export type BillTo = "CUSTOMER" | "CONSIGNEE";

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
  paymentMode: PaymentMode | "";
  billTo: BillTo | "";

  // 5. Halt Information (all editable)
  companyHaltDays: string;
  partyHaltDays: string;
  haltRemarks: string;
  driverHaltCompensation: string;

  // Meta — set by backend when closure is created
  closedAt: string;  // ISO date string from created_at
};
