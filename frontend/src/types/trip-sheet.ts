export type DieselEntry = {
  id: string;
  bunkName: string;
  quantity: string;
  price: string;
  amount: string;
  km: string;
  billNo: string;
};

export type TripSheetData = {
  tripId: string;

  // Trip Information
  tripSheetNo: string;
  serialNo: string;
  containerNo: string;
  containerType: string;
  line: string;
  tripType: string;
  vehicleId: string;
  date: string;
  driverId: string;

  // Route Information
  from: string;
  to: string;

  // Hire & Driver Advance
  hireAmount: string;
  driverAdvance: string;
  driverAdvanceAdditional: string;

  // Trip Distance & Cargo
  startKm: string;
  endKm: string;
  totalKm: string;
  cargoWeight: string;
  grossWeight: string;
  tareWeight: string;
  netWeight: string;

  // Diesel Refill Details
  dieselEntries: DieselEntry[];
  totalDiesel: string;
  dieselRate: string;
  dieselExpense: string;

  // Driver Settlement
  driverPay: string;
  driverSettlementAdvance: string;
  driverSettlementAdvanceAdditional: string;
  driverBalance: string;

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
  // Vehicle Maintenance
  parkingExpense: string;
  punctureExpense: string;
  sparePartsExpense: string;
  // Miscellaneous
  otherExpenses: string;

  // Expense Summary
  tripExpensesTotal: string;
  driverExpensesTotal: string;
  totalExpense: string;

  // Toll Details
  tollCharges: string;
  tollCount: string;

  // Remarks
  remarks: string;
};

export function n(v: string): number {
  return parseFloat(v) || 0;
}

export function calcTripExpenses(form: TripSheetData): number {
  return (
    n(form.haltPay) +
    n(form.portPassExpense) +
    n(form.weightSheetExpense) +
    n(form.mamolExpense) +
    n(form.claimableMamolExpense) +
    n(form.trafficRtoExpense) +
    n(form.liftOnOffExpense) +
    n(form.craneOperatorExpense) +
    n(form.parkingExpense) +
    n(form.punctureExpense) +
    n(form.sparePartsExpense) +
    n(form.otherExpenses) +
    n(form.tollCharges) +
    n(form.dieselExpense)
  );
}

export function calcDriverExpenses(form: TripSheetData): number {
  return n(form.driverPay) + n(form.haltPay);
}

// kept for backward compat with any pages using sumCharges
export function sumCharges(...values: string[]): number {
  return values.reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
}
