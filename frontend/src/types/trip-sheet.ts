export type DieselEntry = {
  date: string;
  odometer: string;
  litres: string;
  costPerLitre: string;
  totalCost: string;
  fuelStation: string;
};

export function emptyDieselEntry(date = ""): DieselEntry {
  return { date, odometer: "", litres: "", costPerLitre: "", totalCost: "", fuelStation: "" };
}

export type TripSheetData = {
  tripId: string;

  // Trip Information
  tripSheetNo: string;
  bookingReferenceNo: string;   // auto-fetched from trip (replaces serialNo)
  containerNumber: string;      // auto-fetched from trip (was containerNo)
  containerNumber1: string;     // auto-fetched for 2 X 20 FEET CONTAINERS
  containerNumber2: string;     // auto-fetched for 2 X 20 FEET CONTAINERS
  containerType: string;        // label: "Container Specification" — auto-fetched
  line: string;                 // label: "Shipping Line" — auto-fetched
  tripType: string;             // label: "Trip Category" — auto-fetched
  vehicleId: string;            // label: "Assigned Vehicle" — auto-fetched
  driverId: string;             // label: "Assigned Driver" — auto-fetched
  bookingDate: string;          // auto-fetched from trip.bookingCreatedDate
  tripScheduledDate: string;    // auto-fetched from trip.scheduledDate
  tripCompletedDate: string;    // auto-fetched from closure.tripCompletedDate
  tripClosedDate: string;       // user enters
  tripSheetDate: string;        // user enters (replaces 'date')

  // Route Information
  from: string;
  to: string;
  clearingAgent: string;        // typeable

  // Hire
  hireAmount: string;
  openLoadHireType: string;  // "Ton Based" | "Fixed" | "" — auto-fetched from trip
  ratePerTon: string;        // open load Ton Based only — auto-fetched from trip.ratePerTon

  // Trip Distance & Cargo
  startKm: string;
  endKm: string;
  totalKm: string;
  cargoWeight: string;  // auto-fetched from trip.cargoWeight
  kmVarianceRemark: string;

  // Diesel Entries (after KM section) — multiple fills per trip
  dieselEntries: DieselEntry[];
  // Legacy single-entry fields (kept for backward compat; superseded by dieselEntries)
  dieselLitres: string;
  dieselRate: string;
  dieselTotal: string;
  dieselRemarks: string;

  // Driver Settlement
  driverCompensationType: string;
  driverPay: string;
  driverAdvance: string;            // editable: base advance paid at trip assignment
  additionalDriverAdvance: string;  // editable: extra advance paid during trip
  driverAdvanceAmount: string;      // computed sum (adjusted for initialDisbursedAdvance)
  driverBalance: string;            // auto-calculated: driverExpenses - driverAdvanceAmount

  // Trip Expenses — Stay & Driver
  totalHaltDays: string;
  haltRemarks: string;
  haltPay: string;
  // Port & Operational
  portPassExpense: string;
  weightSheetExpense: string;
  mamolExpense: string;
  claimableMamolExpense: string;
  // Government & Compliance
  trafficRtoExpense: string;
  // Loading & Handling
  liftOnOffExpense: string;
  craneOperatorExpense: string;
  parkingExpense: string;
  // Major Repairs
  majorRepairs: Array<{ name: string; date: string; odometer: string; description: string; cost: string }>;
  // Miscellaneous
  otherExpenses: string;

  // Expense Summary
  tripExpensesTotal: string;
  driverExpensesTotal: string;
  totalExpense: string;
  fuelCostApprox: string;

  // Toll Details
  tollCharges: string;

  // Remarks
  remarks: string;
  version?: number;  // optimistic-locking token echoed back on save
};

export function n(v: string): number {
  return parseFloat(v) || 0;
}

// Trip expenses = all costs the company bears for the trip
// (driver batta + halt pay + operational expenses + toll)
// NOTE: haltPay comes from closure data, not form state — add it at the call site
export function calcTripExpenses(form: TripSheetData): number {
  return (
    n(form.driverPay) +
    n(form.portPassExpense) +
    n(form.weightSheetExpense) +
    n(form.mamolExpense) +
    n(form.claimableMamolExpense) +
    n(form.trafficRtoExpense) +
    n(form.liftOnOffExpense) +
    n(form.craneOperatorExpense) +
    n(form.parkingExpense) +
    n(form.otherExpenses) +
    n(form.tollCharges)
  );
}

// Driver expenses = only what the driver physically paid out of pocket
export function calcDriverExpenses(form: TripSheetData): number {
  return (
    n(form.portPassExpense) +
    n(form.weightSheetExpense) +
    n(form.mamolExpense) +
    n(form.claimableMamolExpense) +
    n(form.trafficRtoExpense) +
    n(form.liftOnOffExpense) +
    n(form.craneOperatorExpense) +
    n(form.parkingExpense) +
    n(form.otherExpenses)
  );
}

export function sumCharges(...values: string[]): number {
  return values.reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
}
