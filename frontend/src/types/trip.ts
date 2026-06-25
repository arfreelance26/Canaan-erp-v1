export type TripStatus =
  | "Assigned"
  | "Started"
  | "Loaded"
  | "On-Transit"
  | "Reached"
  | "Unloaded"
  | "Completed"
  | "Cancelled";

export type TripCategory = "LOCAL" | "LOCAL CFS" | "OUTSTATION" | "SHIFTING";

export type MovementCategory = "self" | "third party";

export type CargoClassification =
  | "IMPORT"
  | "EXPORT"
  | "EMPTY"
  | "CFS LADEN"
  | "OPEN LOAD"
  | "COASTAL";

export type ContainerSpecification =
  | "20 FT CONTAINER"
  | "40 FT CONTAINER"
  | "2 X 20 FEET CONTAINERS"
  | "OPEN LOAD CARGO";

export type BillTo = "CUSTOMER" | "CONSIGNEE";

export type PaymentType = "Credit" | "Cash" | "Fuel";

export type TransportMethod = "Own Fleet" | "Third-Party Transporter";

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
  transportMethod: TransportMethod | "";
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
  driverCompensationType: DriverCompensationType | "";

  // Transport Cost Details
  transportHireAmount: string;
  transportCrossingAmount: string;
  finalSettlementAmount: string;

  // Operational Notes
  internalRemarks: string;
  bookingInstructions: string;
};
