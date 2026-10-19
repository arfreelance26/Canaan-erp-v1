export type Branch = {
  id: string;
  name: string;
  /** Company Halt Fee — per day, for company-caused halt days. */
  haltDayFee20ft: string;
  haltDayFee40ft: string;
  /** Customer Halt Fee — per day, for customer-caused (party) halt days. */
  partyHaltFee20ft: string;
  partyHaltFee40ft: string;
  /** Same two fees for the other container types. */
  haltDayFee2x20: string;
  haltDayFeeOpenLoad: string;
  partyHaltFee2x20: string;
  partyHaltFeeOpenLoad: string;
  driverHaltDayPercentage: string;
  cleanerBattaFee: string;
  /** Per day the driver is marked "On Workshop" (Workshop Batta Record). */
  workshopBattaFee: string;
  version?: number;
};
