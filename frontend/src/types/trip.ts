export type TripStatus =
  | "Assigned"
  | "Started"
  | "Loaded"
  | "On-Transit"
  | "Reached"
  | "Unloaded"
  | "Completed"
  | "Cancelled";

export type TripCategory = "LOCAL" | "LOCAL CFS" | "OUTSTATION" | "SHIFTING" | "RETURN TRIP";

export type MovementCategory = "Own Fleet" | "Third-Party Transporter";

export type CargoClassification =
  | "IMPORT"
  | "EXPORT"
  | "EMPTY"
  | "CFS LADEN"
  | "OPEN LOAD"
  | "COASTAL"
  | "RETURN TRIP";

export type ContainerSpecification =
  | "20 FT CONTAINER"
  | "40 FT CONTAINER"
  | "2 X 20 FEET CONTAINERS"
  | "OPEN LOAD CARGO";

export type BillTo = "CUSTOMER" | "CONSIGNEE" | "SELF/CGI";

export type PaymentType = "Credit" | "Cash" | "Fuel";

export type DriverAdvancePaymentMethod = "None" | "CASH" | "NEFT/IMPS/UPI" | "Both";

export type DriverCompensationType = "Normal" | "FIXED";

export type Trip = {
  id: string;
  tripId: string;
  status: TripStatus;
  assignedDate: string;

  // Booking Information
  bookingReferenceNo: string;
  bookingCreatedDate: string;
  tripCategory: TripCategory | "";
  movementCategory: MovementCategory | "";

  // Customer Information
  customerId: string;
  shipperConsignee: string;

  // Cargo Information
  cargoClassification: CargoClassification | "";
  containerSpecification: ContainerSpecification | "";
  containerNumber: string;
  containerNumber1: string;
  containerNumber2: string;
  cargoReference: string;
  releaseOrderReference: string;
  cargoWeight: string;

  // Route Information
  origin: string;
  destination: string;

  // Shipping Information
  shippingLine: string;
  vesselName: string;

  // Vehicle & Trip Assignment
  scheduledDate: string;
  driverId: string;
  vehicleId: string;

  // Payment & Advances
  billTo: BillTo | "";
  paymentType: PaymentType | "";
  customerCashAdvance: string;
  customerFuelAdvanceAmount: string;
  customerFuelAdvanceLitres: string;

  // Driver Compensation
  driverAdvanceAmount: string;
  driverAdvancePaymentMethod: DriverAdvancePaymentMethod | "";
  driverAdvance: string;
  driverCompensationType: DriverCompensationType | "";

  // Transport Cost Details
  openLoadHireType?: "Ton Based" | "Fixed" | "";
  ratePerTon?: string;
  transportHireAmount: string;
  transportCrossingAmount: string;

  // Operational Notes
  internalRemarks: string;
  driverChangeRemark: string;
  bookingInstructions: string;

  // Workflow state (computed by backend)
  hasClosure: boolean;
  hasSheet: boolean;
  tripSheetCollected: boolean;
  tripSheetCollectedAt: string | null;
  tripSheetReceived: boolean;
  tripSheetReceivedAt: string | null;
  verificationStatus: "pending" | "verified" | "flagged";
  isInvoiced: boolean;
  invoiceRequired: boolean;
};
