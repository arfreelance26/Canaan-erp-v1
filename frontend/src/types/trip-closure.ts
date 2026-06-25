export type PaymentMode = "Cash" | "UPI" | "Bank Transfer" | "Cheque" | "NEFT / RTGS";

export type TripClosureData = {
  tripId: string;

  // Edit Booking Section (Auto-fetched)
  bookingReferenceNo: string;
  tripCategory: string;
  movementCategory: string;
  customerName: string;
  containerSpecification: string;
  cargoClassification: string;
  containerNumber: string;
  containerNumber1: string;
  containerNumber2: string;
  cargoReference: string;
  bookingDate: string;
  originLocation: string;
  destinationLocation: string;
  rateType: string;
  releaseOrderReference: string;
  shippingLine: string;
  vesselName: string;
  shipperConsigneeName: string;

  // Transporter Details Section (Auto-fetched)
  transportMethod: string;
  transporter: string;
  tripDate: string;
  assignedTruckDetails: string;
  paymentType: string;
  customerAdvance: string;
  dieselAdvance: string;
  driverAdvanceAmount: string;
  driverAdvancePaymentMethod: string;
  billTo: string;

  // Transporter Price Details Section (Editable)
  transportHireAmount: string;
  transportCrossingAmount: string;
  transportHalt: string;
  transportUnloading: string;
  transportLiftingCharges: string;
  transportWeighment: string;
  totalTransportAmount: string;

  // Billing Price Details Section (Editable)
  billingHireAmount: string;
  billingHalt: string;
  billingUnloading: string;
  billingLiftingCharges: string;
  billingWeighment: string;
  totalBillingAmount: string;

  // Trip Completion
  tripCompletedDate: string;
  tripClosingDate: string;
  paymentMode: PaymentMode | "";

  // Trip Distance Details
  startingOdometer: string;
  endingOdometer: string;
  totalDistance: string;

  // Cargo Weight Details
  grossWeight: string;
  tareWeight: string;
  netWeight: string;

  // Trip Fuel Details
  bunkName: string;
  dieselQuantity: string;
  fuelTotalCost: string;

  // Trip Expenses
  totalHaltDays: string;
  haltRemarks: string;
  driversCompensation: string;
  haltCompensation: string;
  portPassExpense: string;
  weightSheetExpense: string;
  mamolExpense: string;
  claimableMamolExpense: string;
  trafficRtoPoliceExpense: string;
  liftOnOffExpense: string;
  craneOperatorExpense: string;
  parkingExpenses: string;
  punctureExpense: string;
  sparePartsExpense: string;
  otherExpenses: string;
  tollExpenses: string;

  // Halt Information (kept for backward compatibility)
  additionalDriverAdvanceAmount: string;
  companyHaltDays: string;
  partyHaltDays: string;
};
