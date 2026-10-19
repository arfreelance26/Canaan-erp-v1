import type { Branch } from "@/types/branch";
import type { TripClosureData } from "@/types/trip-closure";

/**
 * Halt pay — one place for the maths, used by Close Trip, the Booking Sheet,
 * the Trip Sheet, Verify Trip and Driver Compensation → Halt Pay Record.
 *
 * Each branch has two per-day rates for every container type (20FT, 40FT,
 * 2×20FT, Open Load) in Branch Management:
 *  - Company Halt Fee — company-caused days (a company expense);
 *  - Customer Halt Fee — customer-caused (party) days, paid to the driver and
 *    billed to the customer at the same amount.
 */

/** The four container types a trip can have, and which branch fees each uses. */
export const HALT_CONTAINER_TYPES = [
  { spec: "20 FT CONTAINER",        label: "20FT",      company: "haltDayFee20ft",     party: "partyHaltFee20ft" },
  { spec: "40 FT CONTAINER",        label: "40FT",      company: "haltDayFee40ft",     party: "partyHaltFee40ft" },
  { spec: "2 X 20 FEET CONTAINERS", label: "2×20FT",    company: "haltDayFee2x20",     party: "partyHaltFee2x20" },
  { spec: "OPEN LOAD CARGO",        label: "Open Load", company: "haltDayFeeOpenLoad", party: "partyHaltFeeOpenLoad" },
] as const satisfies readonly { spec: string; label: string; company: keyof Branch; party: keyof Branch }[];

export type HaltRates = {
  companyRate: number;
  partyRate: number;
  sizeLabel: string;
  /** False when the trip has no container type, or a fee isn't set (₹0) — Close Trip warns. */
  companyRateSet: boolean;
  partyRateSet: boolean;
};

export function haltRatesFor(branch: Branch | undefined, containerSpec: string | undefined): HaltRates {
  // A trip with no container type yet is priced as a single 20FT (as before).
  const type = HALT_CONTAINER_TYPES.find((t) => t.spec === containerSpec) ?? HALT_CONTAINER_TYPES[0];
  if (!branch) {
    return { companyRate: 0, partyRate: 0, sizeLabel: type.label, companyRateSet: false, partyRateSet: false };
  }
  const company = Number(branch[type.company] || 0) || 0;
  const party = Number(branch[type.party] || 0) || 0;
  return { companyRate: company, partyRate: party, sizeLabel: type.label, companyRateSet: company > 0, partyRateSet: party > 0 };
}

export type HaltPay = {
  companyDays: number;
  partyDays: number;
  companyRate: number;
  partyRate: number;
  companyPay: number;
  partyPay: number;
  total: number;
};

/** Halt pay for days entered now, at the branch's current rates. */
export function computeHaltPay(rates: HaltRates, companyDays: number, partyDays: number): HaltPay {
  const companyPay = companyDays > 0 ? companyDays * rates.companyRate : 0;
  const partyPay = partyDays > 0 ? partyDays * rates.partyRate : 0;
  return {
    companyDays, partyDays,
    companyRate: rates.companyRate, partyRate: rates.partyRate,
    companyPay, partyPay, total: companyPay + partyPay,
  };
}

/**
 * Halt pay as saved on a closed trip. Uses the saved Company / Customer
 * parts; trips closed before the rates were split only have the total, so
 * that's divided by days (one equal rate, as it was then).
 */
export function haltPayFromClosure(closure: TripClosureData | undefined | null): HaltPay {
  const companyDays = closure ? Number(closure.companyHaltDays || 0) : 0;
  const partyDays = closure ? Number(closure.partyHaltDays || 0) : 0;
  const totalDays = companyDays + partyDays;
  const total = closure ? Number(closure.driverHaltCompensation || 0) : 0;
  const savedCompany = closure?.companyHaltPay;
  const savedParty = closure?.partyHaltPay;
  if (savedCompany !== undefined && savedCompany !== null && savedCompany !== "" &&
      savedParty !== undefined && savedParty !== null && savedParty !== "") {
    const companyPay = Number(savedCompany) || 0;
    const partyPay = Number(savedParty) || 0;
    return {
      companyDays, partyDays,
      companyRate: companyDays > 0 ? companyPay / companyDays : 0,
      partyRate: partyDays > 0 ? partyPay / partyDays : 0,
      companyPay, partyPay, total: companyPay + partyPay,
    };
  }
  const rate = totalDays > 0 ? total / totalDays : 0;
  return {
    companyDays, partyDays, companyRate: rate, partyRate: rate,
    companyPay: companyDays * rate, partyPay: partyDays * rate, total,
  };
}
